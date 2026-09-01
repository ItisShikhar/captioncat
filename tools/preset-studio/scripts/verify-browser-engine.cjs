// Browser engine regression test: starts the Vite dev server, drives a
// dedicated dev-only harness page (`verify.html`) with Playwright, and
// renders every bundled preset through the *real* caption-rendering-engine
// (via `@captioncat/caption-engine/browser`) end-to-end. Use
// `npm run verify:browser-engine`.
const { chromium } = require('playwright');
const { createServer } = require('vite');
const path = require('node:path');
const fs = require('node:fs');

(async () => {
  const presetsDir = path.resolve(__dirname, '..', '..', '..', 'assets', 'json', 'caption-style-presets');
  const names = fs.readdirSync(presetsDir).filter((f) => f.endsWith('.json'));

  const server = await createServer({ root: path.resolve(__dirname, '..'), server: { port: 0 } });
  await server.listen();
  const port = server.config.server.port;

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const logs = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') logs.push(`[console.${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));
  page.on('requestfailed', (request) => {
    logs.push(`[requestfailed] ${request.method()} ${request.url()} - ${request.failure()?.errorText ?? 'unknown error'}`);
  });

  try {
    await page.goto(`http://localhost:${port}/verify.html`);
    try {
      await page.waitForFunction(
        () => window.__browserEngineReady === true || typeof window.__browserEngineError === 'string',
        { timeout: 60000 },
      );
    } catch (error) {
      console.log('--- browser startup diagnostics ---');
      for (const line of logs) console.log(line);
      throw error;
    }

    const browserEngineError = await page.evaluate(() => window.__browserEngineError);
    if (browserEngineError) {
      console.log('--- browser startup diagnostics ---');
      for (const line of logs) console.log(line);
      throw new Error(`The browser engine API failed to load:\n${browserEngineError}`);
    }

    let failures = 0;
    for (const name of names) {
      const presetJson = JSON.parse(fs.readFileSync(path.join(presetsDir, name), 'utf8'));
      const result = await page.evaluate(async (preset) => {
        try {
          const out = await window.__renderPresetPreview(preset, {
            videoResolution: { width: 1080, height: 1920 },
            words: ['Hello', 'world', 'this', 'is', 'a', 'test', 'of', 'the', 'preset'],
            wordStartTimesSeconds: [0, 0.3, 0.6, 0.9, 1.2, 1.5, 1.8, 2.1, 2.4],
            wordEndTimesSeconds: [0.3, 0.6, 0.9, 1.2, 1.5, 1.8, 2.1, 2.4, 2.8],
            fps: 12,
          });
          return { ok: true, frameCount: out.frames.length, frameSize: out.frameSize };
        } catch (err) {
          return { ok: false, error: err instanceof Error ? `${err.message}\n${err.stack}` : String(err) };
        }
      }, presetJson);

      if (result.ok) {
        console.log(`OK   ${name}: ${result.frameCount} frames @ ${result.frameSize.width}x${result.frameSize.height}`);
      } else {
        failures += 1;
        console.log(`FAIL ${name}: ${result.error}`);
      }
    }

    if (logs.length > 0) {
      console.log('--- page logs ---');
      for (const line of logs) console.log(line);
    }

    process.exitCode = failures > 0 ? 1 : 0;
  } finally {
    await browser.close();
    await server.close();
  }
})();
