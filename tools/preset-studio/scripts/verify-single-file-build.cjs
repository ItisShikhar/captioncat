// Single-file-build regression test: builds the production monolith and
// opens the versioned `dist/captioncat-preset-studio-v<version>.html` directly
// via a `file://` URL (no dev server, no
// HTTP). This is the supported way to use this tool (open the HTML
// file straight from a GitHub checkout, no hosting/build step required by
// end users). Confirms:
//   - the app boots and lists the bundled presets with zero network requests
//     before a design requiring a remote-backed font is selected
//   - selecting a preset renders real pixels through the engine browser API
//     into the always-visible live preview panel
//   - supported browsers deliver preview frames as transferable ImageBitmap
//     values instead of raw pixel buffers
//   - dropping a preset .json file onto the window imports it into the
//     library
//   - "Save as copy" persists correctly on browsers *without* the File
//     System Access API (Firefox/Safari, simulated here by stripping it) by
//     falling back to a real browser download. This is the path for visitors
//     who open the HTML file directly.
// Use `npm run verify:single-file-build`.
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const packageMetadata = JSON.parse(
  fs.readFileSync(path.resolve(projectRoot, '..', '..', 'package.json'), 'utf8'),
);
if (typeof packageMetadata.version !== 'string') {
  throw new Error('The root package.json must define a string version.');
}
const distHtml = path.resolve(
  projectRoot,
  'dist',
  `captioncat-preset-studio-v${packageMetadata.version}.html`,
);
const presetsDir = path.resolve(projectRoot, '..', '..', 'assets', 'json', 'caption-style-presets');

(async () => {
  console.log('Building production bundle (npm run build)...');
  execFileSync('npm', ['run', 'build'], { cwd: projectRoot, stdio: 'inherit', shell: true });

  if (!fs.existsSync(distHtml)) {
    throw new Error(`Expected build output at ${distHtml}`);
  }
  const sizeMb = fs.statSync(distHtml).size / (1024 * 1024);
  console.log(`${path.basename(distHtml)} is ${sizeMb.toFixed(1)} MB`);

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => {
    const messages = [];
    window.__previewWorkerMessages = messages;
    const NativeWorker = window.Worker;
    if (typeof NativeWorker !== 'function') return;
    class InspectingWorker extends NativeWorker {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', (event) => {
          const data = event.data ?? {};
          messages.push({
            type: data.type,
            hasBitmap: Boolean(data.bitmap),
            hasBuffer: Boolean(data.buffer),
          });
        });
      }
    }
    Object.defineProperty(window, 'Worker', {
      configurable: true,
      writable: true,
      value: InspectingWorker,
    });
  });

  const requests = [];
  page.on('request', (req) => requests.push(req.url()));
  const logs = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') logs.push(`[console.error] ${msg.text()}`);
  });
  page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));

  let failures = 0;
  const check = (label, condition) => {
    if (condition) {
      console.log(`OK   ${label}`);
    } else {
      failures += 1;
      console.log(`FAIL ${label}`);
    }
  };

  try {
    const fileUrl = `file:///${distHtml.replace(/\\/g, '/')}`;
    await page.goto(fileUrl);

    // The initial app shell must be self-contained: only the file:// document
    // itself must be requested before a remote-backed font is needed.
    const externalRequests = requests.filter((u) => !u.startsWith('file://'));
    check('no network requests beyond the file:// document', externalRequests.length === 0);

    await page.waitForSelector('[data-testid="app-drop-zone"]', { timeout: 15000 });
    await page.getByRole('button', { name: /reveal .* in the preset library/i }).click();
    await page.getByRole('button', { name: /clean|banger|authentic/i }).first().waitFor({ state: 'visible' });
    const presetButtons = await page.getByRole('button', { name: /clean|banger|authentic/i }).count();
    check('bundled preset list rendered', presetButtons > 0);
    await page.getByRole('button', { name: 'Create new preset' }).click();
    const newPresetDialog = page.getByRole('dialog').filter({ hasText: /new preset/i });
    await newPresetDialog.waitFor({ state: 'visible' });
    check('preset sidebar plus button opens the File > New dialog', await newPresetDialog.isVisible());
    await page.keyboard.press('Escape');
    await newPresetDialog.waitFor({ state: 'hidden' });

    // Note: Chromium treats file:// as a secure context, so the File System
    // Access API (showOpenFilePicker/showSaveFilePicker) is present
    // here too. Its native OS picker dialogs cannot be driven headlessly.
    // so the fallback path (Firefox/Safari, or any non-Chromium browser) is
    // verified separately below via a page with the API stripped out.
    const fsAccessSupported = await page.evaluate(
      () => typeof window.showOpenFilePicker === 'function' && typeof window.showSaveFilePicker === 'function',
    );
    console.log(`(info) File System Access API present under file://: ${fsAccessSupported}`);

    // Select a known preset. The live preview is always visible in the
    // two-column layout (no tab to switch to), so wait for it to paint.
    await page.getByRole('button', { name: /clean/i }).first().click();
    await page.waitForFunction(
      () => {
        const canvas = document.querySelector('canvas');
        if (!canvas) return false;
        const ctx = canvas.getContext('2d');
        if (!ctx || canvas.width === 0 || canvas.height === 0) return false;
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return true;
        return false;
      },
      { timeout: 20000 },
    );
    check('live preview canvas renders non-transparent pixels under file://', true);

    // Add-menu regression coverage: the inspector and hierarchy use the same
    // trigger component, so both paths must open a visible popover.
    const addTriggers = page.locator('[data-entity-add-trigger="true"]');
    const addTriggerCount = await addTriggers.count();
    check('inspector and hierarchy add triggers rendered', addTriggerCount >= 2);
    if (addTriggerCount >= 2) {
     const visibleAddMenu = () => page.locator('[data-slot="popover-content"]:visible').filter({ hasText: 'Entities' }).last();
     await addTriggers.first().click();
     await visibleAddMenu().waitFor({ state: 'visible' });
     check('inspector add menu opens', await visibleAddMenu().isVisible());
     await page.keyboard.press('Escape');
     await visibleAddMenu().waitFor({ state: 'hidden' });

     const hierarchyAddTrigger = page
       .locator('[data-hierarchy-row="true"] [data-entity-add-trigger="true"]')
       .first();
     await hierarchyAddTrigger.click();
     await visibleAddMenu().waitFor({ state: 'visible' });
     check('hierarchy add menu opens', await visibleAddMenu().isVisible());
     await page.keyboard.press('Escape');
     await visibleAddMenu().waitFor({ state: 'hidden' });
    }

    // Drag regression coverage: the handle must activate dnd-kit and render
    // the overlay without relying on pointer-driven React state updates.
    const dragHandle = page.locator('[data-hierarchy-row="true"] button:has([data-drag-handle="true"])').first();
    const dragHandleBox = await dragHandle.boundingBox();
    check('hierarchy drag handle rendered', dragHandleBox !== null);
    if (dragHandleBox) {
     const startX = dragHandleBox.x + dragHandleBox.width / 2;
     const startY = dragHandleBox.y + dragHandleBox.height / 2;
     await page.mouse.move(startX, startY);
     await page.mouse.down();
     await page.mouse.move(startX + 12, startY + 12, { steps: 4 });
     const dragPreview = page.locator('[data-hierarchy-drag-preview="true"]');
     await dragPreview.waitFor({ state: 'visible' });
     check('hierarchy drag overlay appears', await dragPreview.isVisible());
     await page.mouse.up();
    }

    const workerFrameStats = await page.evaluate(() => {
      const messages = window.__previewWorkerMessages ?? [];
      return {
        supportsTransferableBitmaps:
          typeof window.Worker === 'function' &&
          typeof window.OffscreenCanvas === 'function' &&
          typeof window.OffscreenCanvas.prototype.transferToImageBitmap === 'function',
        bitmapFrames: messages.filter((message) => message.hasBitmap).length,
        rawFrames: messages.filter((message) => message.hasBuffer).length,
      };
    });
    if (workerFrameStats.supportsTransferableBitmaps) {
      check(
        'Worker preview frames use transferable ImageBitmap values',
        workerFrameStats.bitmapFrames > 0 && workerFrameStats.rawFrames === 0,
      );
    } else {
      console.log('(info) Transferable Worker bitmaps are not supported in this browser');
    }

    // Drag-and-drop import: simulate dropping a real preset JSON file. The
    // library keys the imported entry off the JSON's own `name` field (not the
    // dropped file's name) and files it under the sidebar's "Custom Presets"
    // group, so a successful import adds exactly one more row carrying that
    // name (alongside the bundled one it was sourced from).
    const samplePresetPath = path.join(presetsDir, 'punch.json');
    const samplePresetText = fs.readFileSync(samplePresetPath, 'utf8');
    const samplePresetName = JSON.parse(samplePresetText).name;
    await page.getByRole('button', { name: /reveal .* in the preset library/i }).click();
    const importResult = await page.evaluate(
      async ({ jsonText, presetName }) => {
        const countRows = () =>
          Array.from(document.querySelectorAll('[role="dialog"] button')).filter((button) =>
            (button.textContent ?? '').trim().toLowerCase().startsWith(presetName.toLowerCase()),
          ).length;
        const before = countRows();
        const file = new File([jsonText], 'dropped-test-preset.json', { type: 'application/json' });
        const dt = new DataTransfer();
        dt.items.add(file);
        const target = document.querySelector('[data-testid="app-drop-zone"]');
        target.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
        target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
        await new Promise((resolve) => setTimeout(resolve, 800));
        return { before, after: countRows() };
      },
      { jsonText: samplePresetText, presetName: samplePresetName },
    );
    check('dropped preset .json file imported into the library', importResult.after === importResult.before + 1);

    // "Export preset" must persist correctly on browsers without the File
    // System Access API (Firefox/Safari) by falling back to a real browser
    // download. Test that fallback path because headless Chromium cannot drive
    // the native showSaveFilePicker dialog.
    const fallbackPage = await context.newPage();
    await fallbackPage.addInitScript(() => {
      for (const pickerName of ['showOpenFilePicker', 'showSaveFilePicker']) {
        Object.defineProperty(window, pickerName, {
          configurable: true,
          writable: true,
          value: undefined,
        });
      }
    });
    await fallbackPage.goto(fileUrl);
    await fallbackPage.waitForSelector('[data-testid="app-drop-zone"]', { timeout: 15000 });
    await fallbackPage.getByRole('button', { name: /open .* menu/i }).click();
    await fallbackPage.getByRole('menuitem', { name: /^File$/i }).click();
    await fallbackPage.getByRole('menuitem', { name: /^Export$/i }).click();
    const nameDialog = fallbackPage.getByRole('dialog').filter({ hasText: /export preset/i });
    const fallbackDownloadPromise = fallbackPage.waitForEvent('download', { timeout: 5000 });
    await nameDialog.getByRole('button', { name: /^export$/i }).click();
    const fallbackDownload = await fallbackDownloadPromise;
    check(
      '"Export preset" falls back to a real file download without the FS Access API',
      !!fallbackDownload.suggestedFilename(),
    );
    await fallbackPage.close();

    check('no console/page errors observed', logs.length === 0);
    if (logs.length > 0) {
      console.log('--- page logs ---');
      for (const line of logs) console.log(line);
    }

    process.exitCode = failures > 0 ? 1 : 0;
  } finally {
    await browser.close();
  }
})();
