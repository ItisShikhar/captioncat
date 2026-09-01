const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
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

(async () => {
  execFileSync('npm', ['run', 'build'], { cwd: projectRoot, stdio: 'inherit', shell: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
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
    await page.goto(`file:///${distHtml.replace(/\\/g, '/')}`);
    await page.waitForSelector('[data-testid="app-drop-zone"]', { timeout: 15000 });
    await page.waitForSelector('canvas', { timeout: 15000 });
    const playbackContext = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
    const playbackPage = await playbackContext.newPage();
    try {
      await playbackPage.goto(`file:///${distHtml.replace(/\\/g, '/')}`);
      await playbackPage.waitForSelector('[data-testid="app-drop-zone"]', { timeout: 15000 });
      await playbackPage.waitForSelector('[data-testid="preview-surface-live"] [data-preview-canvas="true"] canvas', {
        timeout: 15000,
      });
      await playbackPage.waitForFunction(
        () =>
          Number.parseFloat(
            document.querySelector('[aria-label="Live Preview timeline"]')?.getAttribute('max') ?? '0',
          ) > 2,
        { timeout: 15000 },
      );
      const liveTimeline = playbackPage.getByRole('slider', { name: 'Live Preview timeline' });
      const pauseLivePreview = playbackPage.getByRole('button', { name: 'Pause Live Preview' });
      if ((await pauseLivePreview.count()) > 0) await pauseLivePreview.click();
      await liveTimeline.fill('2');
      await playbackPage.waitForTimeout(100);
      const wordHierarchyRow = playbackPage
        .locator('[data-hierarchy-row="true"]')
        .filter({ hasText: /^Word$/ })
        .first();
      await wordHierarchyRow.locator('.hierarchy-row-content > div > button').click();
      await playbackPage.getByText('Transform', { exact: true }).last().click();
      const rotationInput = playbackPage.locator('[data-inspector-property-path="rotation"] input');
      await rotationInput.waitFor({ state: 'visible' });
      const originalRotation = Number.parseFloat(await rotationInput.inputValue());
      await rotationInput.fill(String(originalRotation + 1));
      await rotationInput.press('Tab');
      await playbackPage.waitForTimeout(1500);
      check(
        'paused Live Preview resets to the first frame after an inspector render',
        Number.parseFloat(await liveTimeline.inputValue()) < 0.1 &&
          (await playbackPage.getByRole('button', { name: 'Play Live Preview' }).count()) === 1 &&
          (await playbackPage.getByRole('button', { name: 'Pause Live Preview' }).count()) === 0,
      );
      await liveTimeline.fill('2');
      await playbackPage.locator('[aria-label="Preview quality"] button').filter({ hasText: 'HD' }).click();
      await playbackPage.waitForTimeout(1500);
      check(
        'paused Live Preview resets to the first frame after a quality change',
        Number.parseFloat(await liveTimeline.inputValue()) < 0.1 &&
          (await playbackPage.getByRole('button', { name: 'Play Live Preview' }).count()) === 1 &&
          (await playbackPage.getByRole('button', { name: 'Pause Live Preview' }).count()) === 0,
      );
      const compactPreviewPositions = [
        { title: 'Full Cycle Preview', seconds: 1 },
        { title: 'Word State Preview', seconds: 1 },
      ];
      for (const { title, seconds } of compactPreviewPositions) {
        const timeline = playbackPage.getByRole('slider', { name: `${title} timeline` });
        const pauseButton = playbackPage.getByRole('button', { name: `Pause ${title}` });
        if ((await pauseButton.count()) > 0) await pauseButton.click();
        await timeline.fill(String(seconds));
      }
      await playbackPage.waitForTimeout(100);
      const currentRotation = Number.parseFloat(await rotationInput.inputValue());
      await rotationInput.fill(String(currentRotation + 1));
      await rotationInput.press('Tab');
      await playbackPage.waitForTimeout(1500);
      const compactPreviewChecks = await Promise.all(
        compactPreviewPositions.map(async ({ title }) => {
          const timelineValue = Number.parseFloat(
            await playbackPage.getByRole('slider', { name: `${title} timeline` }).inputValue(),
          );
          const passed =
            timelineValue < 0.1 &&
            (await playbackPage.getByRole('button', { name: `Play ${title}` }).count()) === 1 &&
            (await playbackPage.getByRole('button', { name: `Pause ${title}` }).count()) === 0
          check(
            `paused ${title} resets to the first frame after an inspector render (value ${timelineValue})`,
            passed,
          );
          return passed;
        }),
      );
      check('paused compact previews reset after an inspector render', compactPreviewChecks.every(Boolean));
    } finally {
      await playbackContext.close();
    }
    const liveOverlayMenuButton = page.getByRole('button', { name: 'Choose Live Preview debug overlays' });
    await liveOverlayMenuButton.click();
    const liveOverlayMenu = page.locator('[data-slot="dropdown-menu-content"][data-state="open"]');
    await liveOverlayMenu.waitFor();
    for (const kind of ['Row', 'Word']) {
      const stateExpanders = liveOverlayMenu.getByRole('button', { name: new RegExp(`^Expand ${kind} `) });
      for (let index = 0; index < (await stateExpanders.count()); index += 1) {
        await stateExpanders.nth(index).click();
      }
    }
    const debugOverlayControlSummary = await liveOverlayMenu.evaluate((menu) => {
      const items = [...menu.querySelectorAll('[role="menuitemcheckbox"]')];
      return ['Viewport', 'Video Area', 'Video', 'Composition Area', 'Page', 'Row', 'Word', 'Background', 'Marker']
        .filter((label) => items.some((item) => item.textContent?.trim() === label))
        .map((label) => {
          const entityItem = items.find((item) => item.textContent?.trim() === label);
          const group = entityItem?.parentElement?.parentElement;
          const childLabels = group
            ? [...group.querySelectorAll('[role="menuitemcheckbox"]')].map((item) => item.textContent?.trim())
            : [];
          return {
            label,
            hasPosition: childLabels.includes('Position'),
            hasPadding: childLabels.includes('Padding'),
          };
        });
    });
    check(
      'debug overlay menu exposes Position and Padding controls for every entity',
      debugOverlayControlSummary.length > 0 &&
        debugOverlayControlSummary.every(({ hasPosition, hasPadding }) => hasPosition && hasPadding),
    );
    const pageOverlayGroup = liveOverlayMenu
      .getByRole('menuitemcheckbox', { name: 'Page', exact: true })
      .locator('..')
      .locator('..');
    const pagePaddingControl = pageOverlayGroup.getByRole('menuitemcheckbox', { name: 'Padding', exact: true });
    const pagePositionControl = pageOverlayGroup.getByRole('menuitemcheckbox', { name: 'Position', exact: true });
    const compositionOverlayGroup = liveOverlayMenu
      .getByRole('menuitemcheckbox', { name: 'Composition Area', exact: true })
      .locator('..')
      .locator('..');
    const compositionPaddingControl = compositionOverlayGroup.getByRole('menuitemcheckbox', {
      name: 'Padding',
      exact: true,
    });
    check(
      'debug overlay controls start with Padding selected and Position cleared',
      (await pagePaddingControl.getAttribute('aria-checked')) === 'true' &&
        (await pagePositionControl.getAttribute('aria-checked')) === 'false',
    );
    await pagePaddingControl.click();
    await pagePositionControl.click();
    check(
      'debug overlay Position and Padding controls toggle independently',
      (await pagePaddingControl.getAttribute('aria-checked')) === 'false' &&
        (await pagePositionControl.getAttribute('aria-checked')) === 'true' &&
        (await compositionPaddingControl.getAttribute('aria-checked')) === 'true',
    );
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Show selected Live Preview debug overlays' }).click();
    await page.waitForSelector('[data-preview-canvas="true"] svg [data-debug-entity-kind="compositionArea"]', {
      timeout: 15000,
    });
    const overlayGeometry = await page.evaluate(() => {
      const area = document.querySelector('[data-preview-canvas="true"] svg [data-debug-entity-kind="compositionArea"]');
      const page = document.querySelector('[data-preview-canvas="true"] svg [data-debug-entity-kind="page"]');
      const paddingBox = area?.querySelector('[data-debug-overlay-part="padding-box"]');
      const entityBox = area?.querySelector('[data-debug-overlay-part="entity-box"]');
      return {
        compositionPaddingVisible: Boolean(paddingBox && entityBox && Number(paddingBox.getAttribute('width')) < Number(entityBox.getAttribute('width'))),
        pagePaddingHidden: !page?.querySelector('[data-debug-overlay-part="padding-box"]'),
        pagePositionVisible: Boolean(page?.querySelector('[data-debug-overlay-part="position-guide"]')),
      };
    });
    check('composition padding overlay renders its content boundary', overlayGeometry.compositionPaddingVisible);
    check('page padding overlay can be hidden without hiding the page box', overlayGeometry.pagePaddingHidden);
    check('page position overlay renders its guide independently', overlayGeometry.pagePositionVisible);
    const readViewportState = () =>
      page.evaluate(() => {
        const transform = document.querySelector('[data-preview-workspace="true"]')?.style.transform ?? '';
        const match = transform.match(
          /translate3d\(calc\(-50% \+ ([\d.-]+)px\), calc\(-50% \+ ([\d.-]+)px\), 0px\) scale\(([\d.-]+)\)/,
        );
        return match
          ? { panX: Number.parseFloat(match[1]), panY: Number.parseFloat(match[2]), zoom: Number.parseFloat(match[3]) }
          : null;
      });
    const initialViewportState = await readViewportState();
    check(
      'main Live Preview starts at the configured zoom',
      initialViewportState?.zoom === 0.5 &&
        Number.isFinite(initialViewportState.panX) &&
        Number.isFinite(initialViewportState.panY),
    );
    await page.locator('button[aria-label^="Reveal "]').first().click();
    await page.getByRole('heading', { name: 'Presets' }).waitFor();
    const libraryRows = page.locator('[data-testid="preset-library-row"]');
    const sidebarSections = page
      .getByRole('dialog', { name: 'Presets' })
      .locator('[data-collapsible-section-content="true"]');
    check(
      'preset sidebar sections use no rails and reduced indentation',
      (await sidebarSections.count()) > 0 &&
        (await sidebarSections.evaluateAll((sections) =>
          sections.every(
            (section) =>
              !section.classList.contains('border-l') &&
              section.classList.contains('ml-0') &&
              section.classList.contains('pl-1.5'),
          ),
        )),
    );
    let edgeTarget;
    let edgeTargetName;
    for (let index = 0; index < (await libraryRows.count()); index += 1) {
      const row = libraryRows.nth(index);
      const name = (await row.locator('button').first().innerText()).split('\n')[0]?.trim();
      if (name && name !== '5o') {
        edgeTarget = row;
        edgeTargetName = name;
        break;
      }
    }
    if (edgeTarget && edgeTargetName) {
      const edgeTargetBounds = await edgeTarget.boundingBox();
      if (edgeTargetBounds) {
        await page.mouse.click(
          edgeTargetBounds.x + edgeTargetBounds.width / 2,
          edgeTargetBounds.y + edgeTargetBounds.height - 1,
        );
        await page.waitForFunction(
          (name) => document.querySelector('button[aria-label^="Reveal "]')?.getAttribute('aria-label')?.includes(name),
          edgeTargetName,
        );
      }
    }
    check('preset rows select when the click lands on their edge', Boolean(edgeTarget && edgeTargetName));
    await page.getByRole('button', { name: 'Open settings' }).click();
    await page.getByText('Flow participation', { exact: true }).waitFor();
    check(
      'flow participation exposes Future selectors for Rows and Words',
      (await page.getByRole('combobox', { name: 'Row Future participation' }).count()) === 1 &&
        (await page.getByRole('combobox', { name: 'Word Future participation' }).count()) === 1,
    );
    await page.getByRole('button', { name: 'Close settings' }).click();
    const graphPaper = page.locator('[data-preview-grid="true"]');
    const previewCanvas = page.locator('canvas').first();
    check(
      'graph paper uses the supplied pointer cursor',
      (await graphPaper.evaluate((element) => getComputedStyle(element).cursor)).startsWith('url(') &&
        (await previewCanvas.evaluate((element) => getComputedStyle(element).cursor)).startsWith('url('),
    );
    const graphPaperBounds = await graphPaper.boundingBox();
    if (graphPaperBounds) {
      await page.mouse.move(
        graphPaperBounds.x + graphPaperBounds.width / 2,
        graphPaperBounds.y + graphPaperBounds.height / 2,
      );
      await page.mouse.down();
      await page.waitForTimeout(50);
      check(
        'graph paper uses the supplied hand cursor while panning',
        (await previewCanvas.evaluate((element) => getComputedStyle(element).cursor)).startsWith('url('),
      );
      await page.mouse.up();
    }
    const surfaceDragHandles = page.locator('[data-preview-surface-drag-handle="true"]');
    check(
      'preview grab handles use the supplied Figma hand cursor',
      (await surfaceDragHandles.count()) === 3 &&
        (await surfaceDragHandles.evaluateAll((elements) =>
          elements.every((element) => getComputedStyle(element).cursor.startsWith('url(')),
        )),
    );

    const liveSurface = page.getByTestId('preview-surface-live');
    const initialSurfaceSizes = await page.evaluate(() => {
      const readSize = (testId) => {
        const element = document.querySelector(`[data-testid="${testId}"]`);
        return element ? { width: element.style.width, height: element.style.height } : null;
      };
      return {
        live: readSize('preview-surface-live'),
        word: readSize('preview-surface-word'),
        style: readSize('preview-surface-style'),
      };
    });
    check(
      'main Live Preview uses the base long-edge length for portrait aspects',
      initialSurfaceSizes.live?.width === '506px' && initialSurfaceSizes.live?.height === '900px',
    );
    await liveSurface.getByRole('combobox').first().click();
    await page.getByRole('option', { name: '16:9', exact: true }).click();
    await page.waitForTimeout(50);
    const landscapeSurfaceSizes = await page.evaluate(() => {
      const readSize = (testId) => {
        const element = document.querySelector(`[data-testid="${testId}"]`);
        return element ? { width: element.style.width, height: element.style.height } : null;
      };
      return {
        live: readSize('preview-surface-live'),
        word: readSize('preview-surface-word'),
        style: readSize('preview-surface-style'),
      };
    });
    check(
      'main Live Preview uses the landscape long-edge length for landscape aspects',
      landscapeSurfaceSizes.live?.width === '1080px' && landscapeSurfaceSizes.live?.height === '608px',
    );
    check(
      'compact previews keep their configured surface sizes when Live Preview changes aspect',
      landscapeSurfaceSizes.word?.width === initialSurfaceSizes.word?.width &&
        landscapeSurfaceSizes.word?.height === initialSurfaceSizes.word?.height &&
        landscapeSurfaceSizes.style?.width === initialSurfaceSizes.style?.width &&
        landscapeSurfaceSizes.style?.height === initialSurfaceSizes.style?.height,
    );
    const liveCanvas = liveSurface.locator('[data-preview-canvas="true"]');
    const leftResizeHandle = liveSurface.locator(
      '[data-preview-surface-resize-handle="true"][aria-label="Resize Live Preview from the left"]',
    );
    check(
      'all configured preview surfaces render a resize handle',
      (await page.locator('[data-preview-surface-resize-handle="true"]').count()) === 6,
    );
    const compactOverflow = await page.evaluate(() =>
      ['word', 'style'].map((surfaceId) => {
        const surface = document.querySelector(`[data-preview-surface-id="${surfaceId}"]`);
        const compactRoot = surface?.querySelector('[data-preview-compact-card="true"]');
        const canvas = surface?.querySelector('[data-preview-canvas="true"]');
        return {
          rootOverflow: compactRoot ? getComputedStyle(compactRoot).overflow : null,
          canvasOverflow: canvas ? getComputedStyle(canvas).overflow : null,
        };
      }),
    );
    check(
      'compact resize handles can render outside while canvas content stays clipped',
      compactOverflow.every(({ rootOverflow, canvasOverflow }) => rootOverflow === 'visible' && canvasOverflow === 'hidden'),
    );
    await liveCanvas.hover({ position: { x: 20, y: 20 } });
    await page.waitForTimeout(250);
    check(
      'the Live Preview resize border appears on hover',
      (await leftResizeHandle.evaluate((element) => getComputedStyle(element).opacity)) === '1',
    );
    const resizeCursors = await page.locator('[data-preview-surface-resize-handle="true"]').evaluateAll((elements) =>
      elements.map((element) => getComputedStyle(element).cursor),
    );
    check(
      'the resize handles use opposite supplied Figma diagonal cursors',
      resizeCursors.length === 6 &&
        resizeCursors.every((cursor) => cursor.startsWith('url(')) &&
        resizeCursors[0] !== resizeCursors[1],
    );
    const resizeHandleBox = await leftResizeHandle.boundingBox();
    check('the Live Preview resize handle is interactive', resizeHandleBox !== null);
    if (resizeHandleBox) {
      const widthBeforeResize = Number.parseFloat(landscapeSurfaceSizes.live?.width ?? '0');
      await page.mouse.move(resizeHandleBox.x + resizeHandleBox.width / 2, resizeHandleBox.y + resizeHandleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        resizeHandleBox.x + resizeHandleBox.width / 2 - 32,
        resizeHandleBox.y + resizeHandleBox.height / 2,
        { steps: 3 },
      );
      await page.mouse.up();
      const resizedSurface = await liveSurface.evaluate((element) => ({
        width: Number.parseFloat(element.style.width),
        height: Number.parseFloat(element.style.height),
      }));
      check(
        'the Live Preview resize handle changes the surface size',
        resizedSurface.width > widthBeforeResize && Math.abs(resizedSurface.height / resizedSurface.width - 9 / 16) < 0.01,
      );
    }
    const readViewportZoom = () =>
      page.evaluate(() => {
        const transform = document.querySelector('[data-preview-workspace="true"]')?.style.transform ?? '';
        return Number.parseFloat(transform.match(/scale\(([^)]+)\)/)?.[1] ?? '0');
      });
    const zoomHandleBox = await leftResizeHandle.boundingBox();
    check('the resize handle remains available for wheel zoom', zoomHandleBox !== null);
    if (zoomHandleBox) {
      await page.mouse.move(zoomHandleBox.x + zoomHandleBox.width / 2, zoomHandleBox.y + zoomHandleBox.height / 2);
      const zoomBefore = await readViewportZoom();
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(50);
      const zoomedIn = await readViewportZoom();
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(50);
      const zoomedOut = await readViewportZoom();
      check('mousewheel zooms in over a resize handle', zoomedIn > zoomBefore);
      check('mousewheel zooms out over a resize handle', zoomedOut < zoomedIn);
    }
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(50);
    await page.getByRole('button', { name: 'Reset preview view' }).click();
    await page.waitForTimeout(450);
    const resetViewportState = await readViewportState();
    check(
      'Reset View restores the initial Live Preview zoom and pan',
      resetViewportState?.zoom === 0.5 && resetViewportState.panX === 80 && resetViewportState.panY === 0,
    );

    const dragContext = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
    const dragPage = await dragContext.newPage();
    try {
      await dragPage.goto(`file:///${distHtml.replace(/\\/g, '/')}`);
      await dragPage.waitForSelector('[data-hierarchy-row="true"] [data-drag-handle="true"]', { timeout: 15000 });
      await dragPage.waitForTimeout(750);
      const dragHandle = dragPage.locator(
        '[data-hierarchy-row="true"] button:has([data-drag-handle="true"])',
      ).first();
      const dragHandleBox = await dragHandle.boundingBox();
      const rows = dragPage.locator('[data-hierarchy-row="true"]');
      const rowBoxes = [];
      for (let index = 1; index < Math.min(await rows.count(), 8); index += 1) {
        const rowBox = await rows.nth(index).boundingBox();
        if (rowBox) rowBoxes.push(rowBox);
      }
      check(
        'hierarchy drag performance fixture rendered',
        dragHandleBox !== null && rowBoxes.length > 0,
      );
      if (dragHandleBox && rowBoxes.length > 0) {
        const startX = dragHandleBox.x + dragHandleBox.width / 2;
        const startY = dragHandleBox.y + dragHandleBox.height / 2;
        await dragPage.mouse.move(startX, startY);
        await dragPage.mouse.down();
        await dragPage.mouse.move(startX + 12, startY + 12, { steps: 3 });
        await dragPage.locator('[data-hierarchy-drag-preview="true"]').waitFor({ state: 'visible' });
        await dragPage.waitForTimeout(250);
        const frameSamplePromise = dragPage.evaluate(
          () =>
            new Promise((resolve) => {
              const start = performance.now();
              let frames = 0;
              let last = start;
              let maxGap = 0;
              const sample = (now) => {
                frames += 1;
                maxGap = Math.max(maxGap, now - last);
                last = now;
                if (now - start >= 600) {
                  resolve({ frames, elapsed: now - start, maxGap });
                  return;
                }
                requestAnimationFrame(sample);
              };
              requestAnimationFrame(sample);
            }),
        );
        for (let index = 0; index < 48; index += 1) {
          const rowBox = rowBoxes[index % rowBoxes.length];
          await dragPage.mouse.move(rowBox.x + rowBox.width / 2, rowBox.y + rowBox.height / 2, { steps: 1 });
        }
        const frameSample = await frameSamplePromise;
        const averageFps = (frameSample.frames * 1000) / frameSample.elapsed;
        check(
          'hierarchy drag stays within a 60 FPS frame budget after activation',
          averageFps >= 55 && frameSample.maxGap <= 75,
        );
        await dragPage.mouse.up();
      }
    } finally {
      await dragContext.close();
    }

    const transitionContext = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
    const transitionPage = await transitionContext.newPage();
    try {
      await transitionPage.goto(`file:///${distHtml.replace(/\\/g, '/')}`);
      await transitionPage.waitForSelector('canvas', { timeout: 15000 });
      await transitionPage.getByRole('button', { name: /Reveal .* in the preset library/ }).click();
      const presetSearch = transitionPage.getByRole('textbox', { name: 'Search presets...' });
      await presetSearch.fill('presentation');
      check(
        'preset library search accepts text and filters rows',
        (await presetSearch.inputValue()) === 'presentation' &&
          (await transitionPage.locator('[data-testid="preset-library-row"]').count()) === 1,
      );
      await presetSearch.fill('');
      await transitionPage
        .getByText('Presentation', { exact: true })
        .locator('xpath=ancestor::button[1]')
        .click();
      await transitionPage.waitForTimeout(300);
      const wordRow = transitionPage
        .locator('[data-hierarchy-row="true"]')
        .filter({ hasText: /^Word$/ })
        .first();
      await wordRow.locator('.hierarchy-row-content > div > button').click();
      await transitionPage.getByRole('button', { name: 'Select Past state' }).click();
      await transitionPage
        .getByText('Text', { exact: true })
        .last()
        .locator('xpath=ancestor::div[contains(@class,"inspector-card-header")]')
        .click();
      const ensureColorTransitionEnabled = async () => {
        const addTransition = transitionPage.getByRole('button', { name: 'Add transition for Color' });
        const transitionTrigger =
          (await addTransition.count()) > 0
            ? addTransition
            : transitionPage.getByRole('button', { name: 'Remove transition for Color' });
        await transitionTrigger.click();
        const enabledSwitch = transitionPage.getByRole('switch', { name: 'Color transition enabled' });
        if (!(await enabledSwitch.isChecked())) await enabledSwitch.check();
      };
      await ensureColorTransitionEnabled();
      check(
        'Past text color transition is enabled for this state only',
        (await transitionPage.getByRole('button', { name: 'Remove transition for Color' }).count()) === 1 &&
          (await transitionPage.getByRole('combobox').filter({ hasText: 'This state only' }).count()) === 1,
      );
      await transitionPage.keyboard.press('Escape');
      await transitionPage.getByRole('button', { name: 'Select Future state' }).click();
      const futureColorTransition = transitionPage.getByRole('button', { name: 'Add transition for Color' });
      if ((await futureColorTransition.count()) === 0) {
        await transitionPage
          .getByText('Text', { exact: true })
          .last()
          .locator('xpath=ancestor::div[contains(@class,"inspector-card-header")]')
          .click();
      }
      await ensureColorTransitionEnabled();
      check(
        'Future text color transition materializes for this state only',
        (await transitionPage.getByRole('button', { name: 'Remove transition for Color' }).count()) === 1 &&
          (await transitionPage.getByRole('combobox').filter({ hasText: 'This state only' }).count()) === 1,
      );
      const durationInput = transitionPage.getByText('Duration (s)', { exact: true }).locator('..').locator('input');
      check('newly enabled transitions prefill a 0.125 second duration', (await durationInput.inputValue()) === '0.125');
    } finally {
      await transitionContext.close();
    }

    const addTriggers = page.locator('[data-entity-add-trigger="true"]');
    const addTriggerCount = await addTriggers.count();
    check('inspector and hierarchy add triggers rendered', addTriggerCount >= 2);

    if (addTriggerCount >= 2) {
      const visibleAddMenu = () =>
        page.locator('[data-slot="popover-content"]:visible').filter({ hasText: 'Entities' }).last();
      const inspectorAddTrigger = addTriggers.last();
      const hierarchyAddTrigger = page.locator(
        '[data-hierarchy-row="true"] [data-entity-add-trigger="true"]',
      ).first();

      await inspectorAddTrigger.click();
      await visibleAddMenu().waitFor({ state: 'visible' });
      check('inspector plus button opens its add menu', await visibleAddMenu().isVisible());
      const addTriggerCountBeforeInsert = await addTriggers.count();
      await visibleAddMenu().getByRole('button', { name: /^Background Independent/ }).click();
      await visibleAddMenu().waitFor({ state: 'hidden' });
      check('inspector add-menu option updates the hierarchy', (await addTriggers.count()) > addTriggerCountBeforeInsert);

      await hierarchyAddTrigger.click();
      await visibleAddMenu().waitFor({ state: 'visible' });
      check('hierarchy plus button opens its add menu', await visibleAddMenu().isVisible());
      check(
        'hierarchy add menu contains entities only',
        (await visibleAddMenu().getByText('Entities', { exact: true }).count()) === 1 &&
          (await visibleAddMenu().getByText('Components', { exact: true }).count()) === 0 &&
          (await visibleAddMenu().getByText('Effects', { exact: true }).count()) === 0,
      );
      await page.keyboard.press('Escape');
      await visibleAddMenu().waitFor({ state: 'hidden' });
      const hierarchyOverflowTrigger = page.locator(
        '[data-hierarchy-row="true"] [data-inspector-header-menu="true"]',
      ).first();
      if (await hierarchyOverflowTrigger.count()) {
        await hierarchyOverflowTrigger.click();
        await page.getByRole('menuitem', { name: 'Add', exact: true }).click();
        await visibleAddMenu().waitFor({ state: 'visible' });
        check('hierarchy dropdown Add action opens its add menu', await visibleAddMenu().isVisible());
      }
      await inspectorAddTrigger.click();
      await visibleAddMenu().waitFor({ state: 'visible' });
      await page.waitForFunction(
        () =>
          Array.from(document.querySelectorAll('[data-slot="popover-content"]')).filter(
            (element) => {
              const style = getComputedStyle(element);
              const rect = element.getBoundingClientRect();
              return (
                style.display !== 'none' &&
                style.visibility !== 'hidden' &&
                rect.width > 0 &&
                rect.height > 0 &&
                element.textContent?.includes('Entities')
              );
            },
          ).length === 1,
      );
      check(
        'opening another add menu closes the previous menu',
        (await page.locator('[data-slot="popover-content"]:visible').filter({ hasText: 'Entities' }).count()) === 1,
      );
      await page.keyboard.press('Escape');
      await visibleAddMenu().waitFor({ state: 'hidden' });
    }

    const rowEntityButton = page
      .locator('[data-hierarchy-row="true"]')
      .getByRole('button', { name: 'Row', exact: true })
      .last();
    await rowEntityButton.click();
    check(
      'overridden narrow state segments hide their inside labels',
      (await page.locator('[data-state-timeline-segment="past"] .state-timeline-label').isHidden()) &&
        (await page.locator('[data-state-timeline-segment="future"] .state-timeline-label').isHidden()),
    );
    await page
      .locator('.state-timeline-segment[data-slot="tooltip-trigger"]')
      .filter({ has: page.locator('[data-state-timeline-segment="past"]') })
      .hover();
    const inactiveTooltip = page.getByRole('tooltip', { name: 'Past: Currently Inactive' });
    await inactiveTooltip.waitFor({ state: 'visible' });
    check('overridden state segments show their tooltip on hover', await inactiveTooltip.isVisible());
    await page.getByRole('button', { name: 'Select Past state' }).click();
    const styleSourceMenuButton = page.getByRole('button', { name: 'Choose state style source' });
    await styleSourceMenuButton.click();
    await page.getByRole('menuitemradio', { name: 'Default Style' }).click();
    const sourceStateButton = page.getByRole('button', { name: 'Switch to Default state' });
    await sourceStateButton.waitFor({ state: 'visible' });
    check('style source dropdown keeps the selected state active', (await page.getByText('ROW:PAST', { exact: true }).count()) === 1);
    check(
      'style source dropdown exposes navigation to the referenced state',
      (await sourceStateButton.count()) === 1,
    );
    await sourceStateButton.click();
    check(
      'style source left button switches to the referenced state',
      (await page.getByText('ROW:DEFAULT', { exact: true }).count()) === 1 &&
        (await page.getByText('Style Source', { exact: true }).count()) === 0,
    );

    const wordRow = page.locator('[data-hierarchy-row="true"]').last();
    await wordRow.locator('.hierarchy-row-content > div > button').click();
    const previousWordsWindow = page.locator('[data-state-window-field="previousWords"]');
    const currentWordsWindow = page.locator('[data-state-window-field="currentWords"]');
    await previousWordsWindow.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Till current row start', exact: true }).click();
    await currentWordsWindow.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Current row from start to present', exact: true }).click();
    await page.waitForTimeout(50);
    check(
      'overlapping word windows explain that Previous Words is overridden',
      await page.locator('[data-state-window-warning]').isVisible(),
    );
    await currentWordsWindow.getByRole('combobox').click();
    await page.getByRole('option', { name: 'All', exact: true }).click();
    await page.waitForTimeout(50);
    check(
      'Current Words All marks other word states inactive',
      ['past', 'previous', 'next', 'future'].every(
        (state) => page.locator(`[data-state-timeline-segment="${state}"] .state-timeline-label`).isHidden(),
      ),
    );
    await currentWordsWindow.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Count', exact: true }).click();
    await currentWordsWindow.getByRole('combobox').click();
    check(
      'Current Words exposes active-row range modes',
      (await page.getByRole('option', { name: 'Current row from start to present', exact: true }).count()) === 1 &&
        (await page.getByRole('option', { name: 'All words in current row', exact: true }).count()) === 1,
    );
    await page.keyboard.press('Escape');
    const addEffectButton = page.getByRole('button', { name: 'Add effect' }).first();
    await addEffectButton.click();
    const effectMenu = page.locator('[data-slot="popover-content"]:visible').filter({ hasText: 'Effects' }).last();
    await effectMenu.waitFor({ state: 'visible' });
    check('component add-effect button opens its effect menu', await effectMenu.isVisible());
    await effectMenu.getByRole('button', { name: /^Shadow 0\// }).click();
    await effectMenu.waitFor({ state: 'hidden' });
    await addEffectButton.click();
    const updatedEffectMenu = page
      .locator('[data-slot="popover-content"]:visible')
      .filter({ hasText: 'Effects' })
      .last();
    check(
      'component effect menu adds the selected effect',
      (await updatedEffectMenu.getByRole('button', { name: /^Shadow 1\// }).count()) === 1,
    );
    await page.keyboard.press('Escape');
    await page.getByText('Font', { exact: true }).click();
    const weightSelect = page.getByRole('combobox').last();
    await weightSelect.click();
    await page.getByRole('listbox').waitFor({ state: 'visible' });
    const visibleEntityAddMenu = () =>
      page.locator('[data-slot="popover-content"]:visible').filter({ hasText: 'Entities' }).last();
    const hierarchyAddTrigger = page
      .locator('[data-hierarchy-row="true"] [data-entity-add-trigger="true"]')
      .first();
    await hierarchyAddTrigger.click();
    await visibleEntityAddMenu().waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelectorAll('[role="listbox"]').length === 0);
    await page.waitForTimeout(300);
    check(
      'hierarchy add menu stays open when switching from font weight',
      await visibleEntityAddMenu().isVisible(),
    );
    await page.keyboard.press('Escape');
    await visibleEntityAddMenu().waitFor({ state: 'hidden' });

    const dragHandle = page.locator(
      '[data-hierarchy-row="true"] button:has([data-drag-handle="true"])',
    ).first();
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
      check('hierarchy drag overlay appears after handle activation', await dragPreview.isVisible());
      await page.mouse.up();
    }

    const backgroundPaintButton = page.getByRole('button', { name: 'Full Cycle Preview background paint' });
    await backgroundPaintButton.click();
    const paintPopover = page.locator('[data-slot="popover-content"]:visible').last();
    await paintPopover.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Linear Gradient' }).click();
    const stopStrip = page.locator('[data-gradient-stop-strip="true"]');
    const stopButtons = () => stopStrip.locator('button[aria-label^="Select stop"]');
    const stripBox = await stopStrip.boundingBox();
    if (!stripBox) throw new Error('Gradient stop strip did not render');
    check('gradient starts with two stops', (await stopButtons().count()) === 2);

    await stopStrip.dblclick({ position: { x: stripBox.width / 2, y: stripBox.height / 2 } });
    await page.waitForTimeout(250);
    const insertedStopPositions = await stopButtons().evaluateAll((buttons) => buttons.map((button) => button.style.left));
    check(
      'double-clicking the gradient strip adds a stop at the clicked position',
      insertedStopPositions.length === 3 && insertedStopPositions.some((position) => Number.parseFloat(position) > 45),
    );

    await stopButtons().first().click();
    await stopStrip.click({ position: { x: stripBox.width * 0.75, y: stripBox.height / 2 } });
    await page.waitForTimeout(250);
    const movedStopPositions = await stopButtons().evaluateAll((buttons) => buttons.map((button) => button.style.left));
    check(
      'clicking a selected stop and then the strip moves that stop',
      movedStopPositions.some((position) => Number.parseFloat(position) > 70),
    );

    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Open captioncat menu' }).click();
    await page.getByRole('menuitem', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: 'New' }).click();
    const newPresetDialog = page.getByRole('dialog', { name: 'New preset' });
    await newPresetDialog.getByRole('textbox', { name: 'Preset name' }).fill('Regression New Preset');
    const newPresetTags = newPresetDialog.getByRole('textbox', { name: 'Tags' });
    await newPresetTags.fill('regression-tag');
    check(
      'new preset dialog accepts tag text',
      (await newPresetTags.inputValue()) === 'regression-tag',
    );
    await newPresetTags.press('Enter');
    check(
      'new preset dialog adds the entered tag',
      (await newPresetDialog.getByRole('button', { name: 'Remove tag regression-tag' }).count()) === 1,
    );
    await newPresetDialog.getByRole('button', { name: 'Create' }).click();
    await page.waitForTimeout(250);
    check(
      'new preset keeps its entered tag',
      (await page.getByText('regression-tag', { exact: true }).count()) > 0,
    );
    const closePresetLibrary = page.getByRole('button', { name: 'Close preset library' });
    if (await closePresetLibrary.isVisible()) {
      await closePresetLibrary.click();
      await page.waitForTimeout(300);
    }
    await page.getByRole('button', { name: 'Open settings' }).click();
    const newPresetOverflowTolerance = page.locator('#field-wordWrappingOverflowTolerance');
    await newPresetOverflowTolerance.waitFor({ state: 'visible' });
    check(
      'new preset effect overflow tolerance defaults to 8',
      (await newPresetOverflowTolerance.inputValue()) === '8',
    );
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Open captioncat menu' }).click();
    await page.getByRole('menuitem', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: 'Export' }).click();
    const exportPresetDialog = page.getByRole('dialog', { name: 'Export preset' });
    check(
      'new preset export keeps its name without a copy suffix',
      (await exportPresetDialog.getByRole('textbox', { name: 'Preset name' }).inputValue()) === 'Regression New Preset',
    );
    await exportPresetDialog.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Composition Area', exact: true }).click();
    await page.getByText('Transform', { exact: true }).last().click();
    const compositionWidthMode = page.locator('[data-inspector-property-path="widthMode"]').last();
    const compositionHeightMode = page.locator('[data-inspector-property-path="heightMode"]').last();
    check(
      'new preset Composition Area fits its parent on both axes',
      (await compositionWidthMode.textContent()).includes('Fit Parent') &&
        (await compositionHeightMode.textContent()).includes('Fit Parent'),
    );
    await page.getByText('Layout', { exact: true }).last().click();
    const compositionPaddingValues = await page
      .locator('[data-inspector-property-path="padding"] input')
      .evaluateAll((inputs) => inputs.map((input) => input.value));
    check(
      'new preset Composition Area padding defaults to 24 by 24',
      compositionPaddingValues.length === 2 &&
        compositionPaddingValues.every((value) => value === '24'),
    );
    check(
      'new preset Composition Area vertical anchor defaults to bottom',
      (await page.getByRole('button', { name: 'Vertical Alignment bottom' }).getAttribute('aria-pressed')) === 'true',
    );
    await page.getByRole('button', { name: 'Page', exact: true }).click();
    await page.getByText('Transform', { exact: true }).last().click();
    const pageDimensionsText = await page.locator('[data-inspector-property-path="dimensions"]').textContent();
    const pagePositionValues = await page
      .locator('[data-inspector-property-path="position"] input')
      .evaluateAll((inputs) => inputs.map((input) => input.value));
    check(
      'new preset Page fits its children on both axes',
      pageDimensionsText.includes('Fit Children') &&
        (await page.locator('[data-inspector-property-path="widthMode"]').last().textContent()).includes('Fit Children') &&
        (await page.locator('[data-inspector-property-path="heightMode"]').last().textContent()).includes('Fit Children'),
    );
    check(
      'new preset Page position defaults to 0 and -180',
      pagePositionValues.length === 2 && pagePositionValues[0] === '0' && pagePositionValues[1] === '-180',
    );

    if (failures > 0) throw new Error(`${failures} interaction regression check(s) failed`);
    console.log('Interaction regression checks passed.');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
