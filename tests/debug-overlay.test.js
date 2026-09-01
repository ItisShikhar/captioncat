const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { CaptionPreset, createCaptionCat } = require('../build/index.js');
const { decodeImageToRawRgba } = require('../build/utilities/canvas-utils.js');
const { runFfmpeg } = require('../build/utilities/ffmpeg-runner.js');

const SAMPLE_INPUT_DIR = path.join(__dirname, 'sample-inputs', 'sample-eng');
const SAMPLE_VIDEO_PATH = path.join(SAMPLE_INPUT_DIR, 'sample-portrait-360p.mp4');
const SAMPLE_CAPTIONS_PATH = path.join(SAMPLE_INPUT_DIR, 'captions.srt');
const OUTPUT_DIR = path.join(__dirname, 'sample-outputs', 'debug-overlays');

async function extractFrameAt(videoPath, outputPath, seekSeconds) {
  await runFfmpeg(['-y', '-ss', String(seekSeconds), '-i', videoPath, '-frames:v', '1', outputPath]);
  return decodeImageToRawRgba(await fs.promises.readFile(outputPath));
}

function countPixelsNearColor(frame, color, tolerance = 12) {
  let count = 0;
  for (let index = 0; index < frame.buffer.length; index += 4) {
    const alpha = frame.buffer[index + 3];
    if (
      alpha > 0 &&
      Math.abs(frame.buffer[index] - color[0]) <= tolerance &&
      Math.abs(frame.buffer[index + 1] - color[1]) <= tolerance &&
      Math.abs(frame.buffer[index + 2] - color[2]) <= tolerance
    ) {
      count += 1;
    }
  }
  return count;
}

function assertDebugGuideColor(frame, label, color, tolerance = 12) {
  assert.ok(
    countPixelsNearColor(frame, color, tolerance) >= 10,
    `Expected ${label} debug guides in the rendered frame`,
  );
}

test('burns debug guides into cropped caption and source-sized overlay outputs', { timeout: 10 * 60 * 1000 }, async () => {
  await fs.promises.rm(OUTPUT_DIR, { recursive: true, force: true });
  await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });
  const outputDir = OUTPUT_DIR;
  try {
    const engine = createCaptionCat({ tempDir: outputDir });
    const result = await engine.render({
      input: {
        video: SAMPLE_VIDEO_PATH,
        captions: SAMPLE_CAPTIONS_PATH,
      },
      debug: {
        bounds: true,
        labels: true,
        position: true,
        paddingBounds: true,
      },
      renders: [
        {
          preset: CaptionPreset.Punch,
          canvasSize: { width: 360, height: 640 },
          fps: 30,
          outputs: {
            pngSequence: {
              directory: path.join(outputDir, 'frames'),
            },
            standaloneCaptionMovie: {
              path: path.join(outputDir, 'standalone-caption.mov'),
            },
            overlayVideo: {
              path: path.join(outputDir, 'overlay.mp4'),
            },
          },
        },
      ],
    });

    const outputs = result.renders?.[0]?.outputs;
    const pngDirectory = outputs?.pngSequence?.directory;
    const standaloneCaptionMoviePath = outputs?.standaloneCaptionMovie?.path;
    const overlayVideoPath = outputs?.overlayVideo?.path;
    assert.ok(pngDirectory);
    assert.ok(standaloneCaptionMoviePath);
    assert.ok(overlayVideoPath);

    const pngFrameName = (await fs.promises.readdir(pngDirectory)).find((name) => name.endsWith('.png'));
    assert.ok(pngFrameName);
    const pngFrame = await decodeImageToRawRgba(
      await fs.promises.readFile(path.join(pngDirectory, pngFrameName)),
    );
    const standaloneFrame = await extractFrameAt(
      standaloneCaptionMoviePath,
      path.join(outputDir, 'standalone-first-frame.png'),
      0.4,
    );
    const overlayFrame = await extractFrameAt(
      overlayVideoPath,
      path.join(outputDir, 'overlay-first-frame.png'),
      0.4,
    );
    console.log(`[test-output] PNG sequence: ${pngDirectory}`);
    console.log(`[test-output] Standalone caption movie: ${standaloneCaptionMoviePath}`);
    console.log(`[test-output] Overlay video: ${overlayVideoPath}`);
    console.log(`[test-output] Standalone caption frame: ${path.join(outputDir, 'standalone-first-frame.png')}`);
    console.log(`[test-output] Overlay video frame: ${path.join(outputDir, 'overlay-first-frame.png')}`);

    for (const [label, frame] of [
      ['PNG sequence', pngFrame],
      ['standalone caption movie', standaloneFrame],
      ['overlay video', overlayFrame],
    ]) {
      if (label === 'overlay video') {
        assert.deepEqual(
          { width: frame.width, height: frame.height },
          { width: 360, height: 640 },
          `${label} must use the source video dimensions`,
        );
      } else {
        assert.ok(
          frame.width <= 360 &&
            frame.height <= 640 &&
            (frame.width < 360 || frame.height < 640),
          `${label} must use the stable cropped dimensions`,
        );
      }
      const tolerance = label === 'overlay video' ? 60 : 12;
      assertDebugGuideColor(frame, `${label} row guides`, [255, 255, 0], tolerance);
    }
  } finally {
    console.log(`[test-output] Debug overlay artifacts: ${outputDir}`);
  }
});
