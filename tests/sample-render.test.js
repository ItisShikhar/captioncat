const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const REMOTE_SAMPLE_VIDEO_URL = 'https://www.w3schools.com/html/movie.mp4';
const TEST_OUTPUT_ROOT = path.resolve(__dirname, 'sample-outputs', 'test-renders');

// SAFETY: The transcription tests in this file call paid or third-party APIs
// (OpenAI, ElevenLabs, Sarvam, and remote URLs). Agents must not run them
// without explicit user permission. Do not run sample transcription tests by
// default; the root npm test command invokes the OpenAI sample test.

function loadEnvFile() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }

  const contents = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

function resolveCaptionedVideoPath(inputVideo, outputDir) {
  const inputBaseName = path.basename(inputVideo, path.extname(inputVideo));
  return path.join(outputDir, `${inputBaseName}-captioncat.mp4`);
}

const {
  createCaptionCat,
  TranscriptionProviderName,
  CAPTION_PRESET_NAMES,
  CaptionPreset,
  loadEcsCaptionPreset,
} = require('../build/index.js');
const { decodeImageToRawRgba } = require('../build/utilities/canvas-utils.js');
const { probeVideoMetadata } = require('../build/utilities/ffmpeg-runner.js');
const { runFfmpeg } = require('../build/utilities/ffmpeg-runner.js');
const { createSolidColorVideo } = require('../build/utilities/ffmpeg-utils.js');
const { renderOverlayVideoViaRawFramePipe } = require('../build/caption-engine/render-pipeline-ffmpeg-compositor.js');

/**
 * Resolve path to a video file inside a sample folder.
 * e.g. resolveSampleVideo('sample-eng') => tests/sample-inputs/sample-eng/sample-portrait-360p.mp4
 */
function resolveSampleVideo(sampleName) {
  const videosRoot = path.resolve(__dirname, '..', 'tests', 'sample-inputs');
  const dashed = sampleName.replace('_', '-');
  const underscored = sampleName.replace('-', '_');
  const candidates = [
    path.join(videosRoot, sampleName, `${sampleName}.mp4`),
    path.join(videosRoot, dashed, `${dashed}.mp4`),
    path.join(videosRoot, underscored, `${underscored}.mp4`),
    path.join(videosRoot, `${sampleName}.mp4`),
    path.join(videosRoot, `${dashed}.mp4`),
    path.join(videosRoot, `${underscored}.mp4`),
  ];
  const resolved = candidates.find((candidate) => fs.existsSync(candidate));
  return resolved ?? candidates[0];
}

/**
 * Resolve path to a caption/transcript file inside a sample folder.
 * e.g. resolveSampleCaption('sample-eng', 'captions.ass')
 */
function resolveSampleCaption(sampleName, filename) {
  const videosRoot = path.resolve(__dirname, '..', 'tests', 'sample-inputs');
  const dashed = sampleName.replace('_', '-');
  const underscored = sampleName.replace('-', '_');
  const candidates = [
    path.join(videosRoot, sampleName, filename),
    path.join(videosRoot, dashed, filename),
    path.join(videosRoot, underscored, filename),
  ];
  const resolved = candidates.find((candidate) => fs.existsSync(candidate));
  return resolved ?? candidates[0];
}

function getProviderApiKey(providerName) {
  if (providerName === TranscriptionProviderName.ElevenLabs) {
    return process.env.ELEVENLABS_API_KEY ?? '';
  }
  if (providerName === TranscriptionProviderName.Sarvam) {
    return process.env.SARVAM_API_KEY ?? '';
  }
  return process.env.OPENAI_API_KEY ?? '';
}

function createEngine(outputDir, providerName) {
  return createCaptionCat(
    {
      debug: false,
      tempDir: outputDir,
    },
    {
      transcription: {
        providers: providerName ? [{ provider: providerName, apiKey: getProviderApiKey(providerName) }] : [],
      },
    },
  );
}

function createVisualRenderSpec(inputVideo, preset, outputDir, options = {}) {
  const { language, fps, renderPipeline, png = false, video = false } = options;
  const outputs = {};
  if (png) {
    outputs.pngSequence = {
      directory: path.join(outputDir, 'png-sequence'),
      background: 'transparent',
    };
  }
  if (video) {
    outputs.overlayVideo = {
      path: resolveCaptionedVideoPath(inputVideo, outputDir),
      ...(renderPipeline ? { pipeline: renderPipeline } : {}),
    };
  }
  return {
    preset,
    canvasSize: { width: 1280, height: 720 },
    ...(language ? { language } : {}),
    ...(fps !== undefined ? { fps } : {}),
    outputs,
  };
}

function resolveSampleOutputDir(sampleName, tag) {
  const sanitizedSampleName = sampleName.replace(/_/g, '-');
  const segments = sanitizedSampleName.split(/[\\/]+/).filter(Boolean);
  const lastSegment = segments.pop() ?? 'sample';
  const baseSegments = segments;
  const outputFolderName = tag ? `${lastSegment}-${tag}` : lastSegment;
  return path.resolve(__dirname, '..', 'tests', 'sample-outputs', ...baseSegments, outputFolderName);
}

async function prepareTestOutputDir(name) {
  const outputDir = path.join(TEST_OUTPUT_ROOT, name);
  await fs.promises.rm(outputDir, { recursive: true, force: true });
  await fs.promises.mkdir(outputDir, { recursive: true });
  return outputDir;
}

function logTestOutput(label, outputPath) {
  console.log(`[test-output] ${label}: ${path.resolve(outputPath)}`);
}

async function assertOutputFileExists(outputPath, label) {
  assert.ok(outputPath, `${label} should return an output path`);
  assert.ok(fs.existsSync(outputPath), `Expected ${label} output at ${outputPath}`);
  assert.ok(fs.statSync(outputPath).size > 0, `Expected ${label} output to contain data`);
  logTestOutput(label, outputPath);
}

async function assertOutputDirectoryExists(outputPath, label) {
  assert.ok(outputPath, `${label} should return an output path`);
  assert.ok(fs.existsSync(outputPath), `Expected ${label} directory at ${outputPath}`);
  const contents = await fs.promises.readdir(outputPath);
  assert.ok(contents.length > 0, `Expected ${label} output directory to contain files`);
  logTestOutput(label, outputPath);
}

async function assertVideoTimingMatches(inputVideo, outputVideo, label, expectedFps) {
  const [inputMetadata, outputMetadata] = await Promise.all([
    probeVideoMetadata(inputVideo),
    probeVideoMetadata(outputVideo),
  ]);

  assert.notEqual(inputMetadata.fps, undefined, `${label} source must provide a video frame rate`);
  assert.notEqual(outputMetadata.fps, undefined, `${label} output must provide a video frame rate`);
  assert.equal(
    outputMetadata.fps,
    expectedFps ?? inputMetadata.fps,
    `${label} must use the requested video frame rate`,
  );

  assert.notEqual(inputMetadata.videoDuration, undefined, `${label} source must provide a video duration`);
  assert.notEqual(outputMetadata.videoDuration, undefined, `${label} output must provide a video duration`);
  const sourceFps = inputMetadata.fps;
  const outputFrameRate = expectedFps ?? sourceFps;
  const inputVideoDurationMs = Math.round(inputMetadata.videoDuration * 1000);
  const outputVideoDurationMs = Math.round(outputMetadata.videoDuration * 1000);
  const outputFrameDurationMs = Math.ceil(1000 / outputFrameRate);
  assert.ok(
    Math.abs(outputVideoDurationMs - inputVideoDurationMs) <= outputFrameDurationMs,
    `${label} video stream duration must remain within one output frame of the source`,
  );

  if (inputMetadata.videoFrameCount !== undefined && outputFrameRate === sourceFps) {
    assert.equal(
      outputMetadata.videoFrameCount,
      inputMetadata.videoFrameCount,
      `${label} must preserve the source video frame count`,
    );
  } else if (inputMetadata.videoDuration !== undefined) {
    const expectedFrameCount = Math.max(1, Math.round(inputMetadata.videoDuration * outputFrameRate));
    assert.equal(outputMetadata.videoFrameCount, expectedFrameCount, `${label} must use the requested frame rate`);
  }

  assert.notEqual(inputMetadata.duration, undefined, `${label} source must provide a container duration`);
  assert.notEqual(outputMetadata.duration, undefined, `${label} output must provide a container duration`);
  const inputContainerDurationMs = Math.round(inputMetadata.duration * 1000);
  const outputContainerDurationMs = Math.round(outputMetadata.duration * 1000);
  assert.ok(
    Math.abs(outputContainerDurationMs - inputContainerDurationMs) <= 1,
    `${label} container duration must remain within one millisecond of the source`,
  );
}

function toAssTimestamp(seconds) {
  const safeSeconds = Math.max(0, seconds);
  const totalCentiseconds = Math.round(safeSeconds * 100);
  const hours = String(Math.floor(totalCentiseconds / 360000)).padStart(2, '0');
  const minutes = String(Math.floor((totalCentiseconds % 360000) / 6000)).padStart(2, '0');
  const wholeSeconds = Math.floor((totalCentiseconds % 6000) / 100);
  const centiseconds = totalCentiseconds % 100;
  return `${hours}:${minutes}:${String(wholeSeconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

function toSrtTimestamp(seconds) {
  const safeSeconds = Math.max(0, seconds);
  const totalMilliseconds = Math.round(safeSeconds * 1000);
  const hours = String(Math.floor(totalMilliseconds / 3600000)).padStart(2, '0');
  const minutes = String(Math.floor((totalMilliseconds % 3600000) / 60000)).padStart(2, '0');
  const wholeSeconds = String(Math.floor((totalMilliseconds % 60000) / 1000)).padStart(2, '0');
  const milliseconds = String(totalMilliseconds % 1000).padStart(3, '0');
  return `${hours}:${minutes}:${wholeSeconds}.${milliseconds}`;
}

function buildExpectedWordCues(transcript) {
  return transcript.flatMap((entry) =>
    (entry.words ?? [])
      .filter(
        (word) => Number.isFinite(word.start) && Number.isFinite(word.end) && word.start >= 0 && word.end >= word.start,
      )
      .map((word) => ({
        text: word.text.trim(),
        start: word.start,
        end: word.end,
      }))
      .filter((word) => word.text.length > 0),
  );
}

// ---------------------------------------------------------------------------
// Transcription-based multi-output render
// ---------------------------------------------------------------------------

async function transcribeOnceAndReturnTranscript(inputVideo, outputDir, providerName) {
  const transcriptPath = path.join(outputDir, 'transcript.json');
  const captionCatEngine = createEngine(outputDir, providerName);
  const result = await captionCatEngine.render({
    input: {
      video: inputVideo,
    },
    transcription: {
      providers: [{ provider: providerName, apiKey: getProviderApiKey(providerName) }],
    },
    exports: {
      transcript: {
        json: transcriptPath,
      },
    },
  });

  const jsonOutputPath = result.transcript?.json;
  assert.ok(jsonOutputPath, 'transcription render should return an output path');
  assert.ok(fs.existsSync(jsonOutputPath), `Expected transcription JSON at ${jsonOutputPath}`);
  logTestOutput('transcription JSON', jsonOutputPath);

  const transcript = JSON.parse(await fs.promises.readFile(jsonOutputPath, 'utf8'));
  assert.equal(transcript.metadata.title, 'Captioned by captioncat');
  assert.equal(transcript.metadata.artist, 'captioncat');
  assert.match(transcript.metadata.github, /^https:\/\/github\.com\//);
  assert.ok(Array.isArray(transcript.transcript), 'Expected transcript entries in the JSON output');
  return transcript.transcript;
}

async function runMultiOutputRenderTest(inputVideo, sampleName, providerName) {
  const outputDir = resolveSampleOutputDir(sampleName, providerName.toLowerCase());
  await fs.promises.mkdir(outputDir, { recursive: true });

  const transcript = await transcribeOnceAndReturnTranscript(inputVideo, outputDir, providerName);

  const sharedRenderOptions = {
    input: {
      video: inputVideo,
      transcript,
    },
  };

  const assPath = path.join(outputDir, 'captions.ass');
  const srtPath = path.join(outputDir, 'captions.srt');

  const baseEngine = createEngine(outputDir, providerName);
  const transcriptResult = await baseEngine.render({
    ...sharedRenderOptions,
    exports: {
      captions: {
        ass: assPath,
        srt: srtPath,
      },
    },
  });
  await assertOutputFileExists(transcriptResult.captions?.ass, 'ASS');
  await assertOutputFileExists(transcriptResult.captions?.srt, 'SRT');

  await Promise.all(
    CAPTION_PRESET_NAMES.map(async (presetId) => {
      const presetDir = path.join(outputDir, presetId);
      await fs.promises.mkdir(presetDir, { recursive: true });

      const presetEngine = createEngine(outputDir, providerName);
      await presetEngine.render({
        ...sharedRenderOptions,
        renders: [createVisualRenderSpec(inputVideo, presetId, presetDir, { png: true, video: true })],
      });

      const pngSequencePath = path.join(presetDir, 'png-sequence');
      const overlayVideoPath = resolveCaptionedVideoPath(inputVideo, presetDir);

      await assertOutputDirectoryExists(pngSequencePath, `${presetId} PNG sequence`);
      await assertOutputFileExists(overlayVideoPath, `${presetId} overlay video`);
    }),
  );
}

// ---------------------------------------------------------------------------
// Render from a caption file (no transcription API calls)
// Given a pre-existing captions file (ass/srt) or transcript.json as input.captions,
// the engine must parse it locally and never call any transcription provider.
// ---------------------------------------------------------------------------

async function runCaptionFileRenderTest(sampleName, captionFilename, presetId) {
  const inputVideo = resolveSampleVideo(sampleName);
  const captionFile = resolveSampleCaption(sampleName, captionFilename);
  const extension = path.extname(captionFilename).slice(1).toLowerCase();
  const tag = extension === 'json' ? 'captions-json' : `captions-${extension}`;
  const outputDir = resolveSampleOutputDir(sampleName, tag);
  await fs.promises.mkdir(outputDir, { recursive: true });

  assert.ok(fs.existsSync(captionFile), `Sample caption file must exist: ${captionFile}`);

  // No transcription providers are configured. Any accidental API call would fail with a key error,
  // which confirms that rendering uses the supplied caption file.
  const captionCatEngine = createEngine(outputDir, null);
  const assOut = path.join(outputDir, 'captions.ass');
  const srtOut = path.join(outputDir, 'captions.srt');
  const jsonOut = path.join(outputDir, 'transcript.json');

  const result = await captionCatEngine.render({
    input: {
      video: inputVideo,
      captions: captionFile,
    },
    exports: {
      transcript: {
        json: jsonOut,
      },
      captions: {
        ass: assOut,
        srt: srtOut,
      },
    },
  });

  await assertOutputFileExists(result.captions?.ass, 'ASS');
  await assertOutputFileExists(result.captions?.srt, 'SRT');
  await assertOutputFileExists(result.transcript?.json, 'JSON');

  const parsedTranscript = JSON.parse(await fs.promises.readFile(result.transcript?.json, 'utf8'));
  assert.ok(
    parsedTranscript.metadata?.title === 'Captioned by captioncat' &&
      Array.isArray(parsedTranscript.transcript) &&
      parsedTranscript.transcript.length > 0,
    'Bypass render must produce a non-empty transcript',
  );

  const presetsToRender = presetId
    ? CAPTION_PRESET_NAMES.filter((candidate) => candidate === presetId)
    : CAPTION_PRESET_NAMES;
  assert.ok(presetsToRender.length > 0, `Expected at least one caption preset for ${presetId ?? 'all presets'}`);

  await runTasksSerially(presetsToRender, async (presetName) => {
    const presetDir = path.join(outputDir, presetName);
    await fs.promises.mkdir(presetDir, { recursive: true });

    const presetEngine = createEngine(outputDir, null);
    await presetEngine.render({
      input: {
        video: inputVideo,
        captions: captionFile,
      },
      renders: [createVisualRenderSpec(inputVideo, presetName, presetDir, { png: true, video: true })],
    });

    const pngSequencePath = path.join(presetDir, 'png-sequence');
    const overlayVideoPath = resolveCaptionedVideoPath(inputVideo, presetDir);
    await assertOutputDirectoryExists(pngSequencePath, `${presetName} PNG sequence`);
    await assertOutputFileExists(overlayVideoPath, `${presetName} overlay video`);
  });
}

async function runCaptionFileRenderTestForPaths(inputVideo, captionFile, sampleName, tag, options = {}) {
  const {
    presetIds = CAPTION_PRESET_NAMES,
    language,
    fps,
    renderPipeline,
    outputTypes = ['video', 'png', 'ass', 'srt', 'json'],
  } = options;
  const outputDir = resolveSampleOutputDir(sampleName, tag);
  await fs.promises.mkdir(outputDir, { recursive: true });

  assert.ok(fs.existsSync(inputVideo), `Sample video file must exist: ${inputVideo}`);
  assert.ok(fs.existsSync(captionFile), `Sample caption file must exist: ${captionFile}`);

  const captionCatEngine = createEngine(outputDir, null);
  const assOut = path.join(outputDir, 'captions.ass');
  const srtOut = path.join(outputDir, 'captions.srt');
  const jsonOut = path.join(outputDir, 'transcript.json');

  const transcriptOutputs = {
    ...(outputTypes.includes('json') ? { json: jsonOut } : {}),
  };
  const captionOutputs = {
    ...(outputTypes.includes('ass') ? { ass: assOut } : {}),
    ...(outputTypes.includes('srt') ? { srt: srtOut } : {}),
  };
  const result =
    Object.keys(transcriptOutputs).length > 0 || Object.keys(captionOutputs).length > 0
      ? await captionCatEngine.render({
          input: {
            video: inputVideo,
            captions: captionFile,
          },
          exports: {
            ...(Object.keys(transcriptOutputs).length > 0 ? { transcript: transcriptOutputs } : {}),
            ...(Object.keys(captionOutputs).length > 0 ? { captions: captionOutputs } : {}),
          },
        })
      : null;

  if (outputTypes.includes('ass')) {
    await assertOutputFileExists(result?.captions?.ass, 'ASS');
    const assContent = await fs.promises.readFile(result.captions.ass, 'utf8');
    assert.match(assContent, /Title: Captioned by captioncat/);
    assert.match(assContent, /Encoded by: captioncat/);
    assert.match(assContent, /Script URL: https:\/\/github\.com\/ItisShikhar\/captioncat/);
  }
  if (outputTypes.includes('srt')) {
    await assertOutputFileExists(result?.captions?.srt, 'SRT');
    const srtContent = await fs.promises.readFile(result.captions.srt, 'utf8');
    assert.match(srtContent, /^# Captioned by captioncat/m);
    assert.match(srtContent, /^# Encoded by: captioncat/m);
    assert.match(srtContent, /^# GitHub: https:\/\/github\.com\/ItisShikhar\/captioncat/m);
  }
  if (outputTypes.includes('json')) {
    await assertOutputFileExists(result?.transcript?.json, 'JSON');
    const parsedTranscript = JSON.parse(await fs.promises.readFile(result.transcript.json, 'utf8'));
    assert.ok(
      parsedTranscript.metadata?.title === 'Captioned by captioncat' &&
        Array.isArray(parsedTranscript.transcript) &&
        parsedTranscript.transcript.length > 0,
      'Bypass render must produce a non-empty transcript',
    );
  }

  if (!outputTypes.includes('video') && !outputTypes.includes('png')) return;

  const presetsToRender = [...new Set(presetIds)];
  assert.ok(presetsToRender.length > 0, 'At least one caption preset is required');
  presetsToRender.forEach((presetId) => {
    assert.ok(CAPTION_PRESET_NAMES.includes(presetId), `Expected preset ${presetId} to be available`);
  });

  await runTasksSerially(presetsToRender, async (presetId) => {
    const presetDir = path.join(outputDir, presetId);
    await fs.promises.mkdir(presetDir, { recursive: true });

    const presetEngine = createEngine(outputDir, null);
    await presetEngine.render({
      input: {
        video: inputVideo,
        captions: captionFile,
      },
      renders: [
        createVisualRenderSpec(inputVideo, presetId, presetDir, {
          language,
          fps,
          renderPipeline,
          png: outputTypes.includes('png'),
          video: outputTypes.includes('video'),
        }),
      ],
    });

    if (outputTypes.includes('png')) {
      const pngSequencePath = path.join(presetDir, 'png-sequence');
      await assertOutputDirectoryExists(pngSequencePath, `${presetId} PNG sequence`);
      const firstFrameName = (await fs.promises.readdir(pngSequencePath)).find((name) => name.endsWith('.png'));
      assert.ok(firstFrameName, `${presetId} PNG sequence must contain a frame`);
      const firstFrame = await fs.promises.readFile(path.join(pngSequencePath, firstFrameName));
      assert.match(firstFrame.toString('latin1'), /Captioned by captioncat/);
      assert.match(firstFrame.toString('latin1'), /GitHub: https:\/\/github\.com\/ItisShikhar\/captioncat/);
    }
    if (outputTypes.includes('video')) {
      const overlayVideoPath = resolveCaptionedVideoPath(inputVideo, presetDir);
      await assertOutputFileExists(overlayVideoPath, `${presetId} overlay video`);
      await assertVideoTimingMatches(inputVideo, overlayVideoPath, `${presetId} overlay video`, fps);
    }
  });
}

async function runTranscriptToOtherFormatsTest(sampleName) {
  const inputVideo = resolveSampleVideo(sampleName);
  const transcriptPath = resolveSampleCaption(sampleName, 'transcript.json');
  const outputDir = resolveSampleOutputDir(sampleName, 'transcript-to-other-formats');
  await fs.promises.mkdir(outputDir, { recursive: true });

  const captionCatEngine = createEngine(outputDir, null);
  const assOut = path.join(outputDir, 'captions.ass');
  const srtOut = path.join(outputDir, 'captions.srt');

  const result = await captionCatEngine.render({
    input: {
      video: inputVideo,
      captions: transcriptPath,
    },
    exports: {
      captions: {
        ass: assOut,
        srt: srtOut,
      },
    },
  });

  await assertOutputFileExists(result.captions?.ass, 'ASS');
  await assertOutputFileExists(result.captions?.srt, 'SRT');

  const transcript = JSON.parse(await fs.promises.readFile(transcriptPath, 'utf8'));
  assert.ok(Array.isArray(transcript) && transcript.length > 0, 'Input transcript.json must contain entries');

  const firstEntry = transcript[0];
  assert.equal(firstEntry.start, 0, 'Test fixture must have entry-level start as 0 to verify word-level timing');
  assert.equal(firstEntry.end, 0, 'Test fixture must have entry-level end as 0 to verify word-level timing');

  const expectedWordCues = buildExpectedWordCues(transcript);
  assert.ok(expectedWordCues.length > 0, 'Input transcript.json must include timed word-level cues');

  const assContent = await fs.promises.readFile(result.captions.ass, 'utf8');
  const assDialogueLines = assContent.split(/\r?\n/).filter((line) => line.startsWith('Dialogue:'));
  assert.equal(
    assDialogueLines.length,
    expectedWordCues.length,
    'ASS must contain one dialogue cue per timed non-space transcript word',
  );

  assDialogueLines.forEach((line, index) => {
    const assParts = line.slice('Dialogue:'.length).trim().split(',');
    const assStart = assParts[1];
    const assEnd = assParts[2];
    const assText = assParts.slice(9).join(',').trim();
    const expectedCue = expectedWordCues[index];
    assert.equal(assStart, toAssTimestamp(expectedCue.start), `ASS start must match word cue at index ${index}`);
    assert.equal(assEnd, toAssTimestamp(expectedCue.end), `ASS end must match word cue at index ${index}`);
    assert.equal(assText, expectedCue.text, `ASS text must match word cue at index ${index}`);
  });

  const srtContent = await fs.promises.readFile(result.captions.srt, 'utf8');
  const srtBlocks = srtContent
    .trim()
    .split(/\r?\n\r?\n/)
    .map((block) => block.split(/\r?\n/));

  assert.equal(
    srtBlocks.length,
    expectedWordCues.length,
    'SRT must contain one cue per timed non-space transcript word',
  );

  srtBlocks.forEach((block, index) => {
    const expectedCue = expectedWordCues[index];
    assert.equal(block[0], String(index + 1), `SRT index must be sequential at cue ${index}`);
    assert.equal(
      block[1],
      `${toSrtTimestamp(expectedCue.start)} --> ${toSrtTimestamp(expectedCue.end)}`,
      `SRT timestamps must match word cue at index ${index}`,
    );
    assert.equal(block[2], expectedCue.text, `SRT text must match word cue at index ${index}`);
  });
}

const SAMPLE_ASPECT_RATIO_NAMES = {
  '16:9': 'landscape',
  '9:16': 'portrait',
  '1:1': 'square',
  '4:3': '4by3',
};
async function runTasksSerially(items, task) {
  for (const item of items) {
    await task(item);
  }
}

function loadParameterizedSampleTestConfig() {
  const serializedConfig = process.env.SAMPLE_TEST_CONFIG;
  if (!serializedConfig) {
    return null;
  }

  const config = JSON.parse(serializedConfig);
  assert.ok(Array.isArray(config.presets) && config.presets.length > 0, 'Parameterized sample tests require presets');
  assert.ok(
    Array.isArray(config.languages) && config.languages.length > 0,
    'Parameterized sample tests require languages',
  );
  assert.ok(
    Array.isArray(config.aspectRatios) && config.aspectRatios.length > 0,
    'Parameterized sample tests require aspect ratios',
  );
  assert.ok(
    Array.isArray(config.resolutions) && config.resolutions.length > 0,
    'Parameterized sample tests require resolutions',
  );
  return config;
}

function buildSampleEngFixture(aspectRatio, resolution) {
  const aspectRatioName = SAMPLE_ASPECT_RATIO_NAMES[aspectRatio];
  assert.ok(aspectRatioName, `Unsupported sample aspect ratio: ${aspectRatio}`);
  const fixtureName = `sample-${aspectRatioName}-${resolution}`;
  return {
    name: fixtureName,
    sampleName: `sample-eng/${fixtureName}`,
    inputVideo: path.join(__dirname, 'sample-inputs', 'sample-eng', `${fixtureName}.mp4`),
    captionFile: path.join(__dirname, 'sample-inputs', 'sample-eng', 'captions.ass'),
  };
}

// ===========================================================================
// Tests — transcription-based
// ===========================================================================

// SAFETY: Every test in this section makes a paid or third-party transcription
// request. Run only with explicit user authorization.

test(
  'renders multiple output formats from a single transcription for remote-url with openai',
  { timeout: 20 * 60 * 1000 },
  async () => {
    await runMultiOutputRenderTest(REMOTE_SAMPLE_VIDEO_URL, 'remote-url', TranscriptionProviderName.OpenAI);
  },
);

// ===========================================================================
// Tests — render from a caption file (no API calls)
// ===========================================================================

// SAFETY: The parameterized sample command uses local caption-file fixtures
// and never calls a transcription provider.

test('preserves adjacent SRT words in the same caption flow', { timeout: 60 * 1000 }, async () => {
  const outputDir = await prepareTestOutputDir('srt-flow');
  try {
    const captionCatEngine = createEngine(outputDir, null);
    await captionCatEngine.render({
      input: {
        captions: [
          '1',
          '00:00:00,000 --> 00:00:00,300',
          'serial',
          '',
          '2',
          '00:00:00,300 --> 00:00:00,700',
          'killers',
        ].join('\n'),
      },
      renders: [createVisualRenderSpec(undefined, '5o', outputDir, { png: true, fps: 30 })],
    });

    const frameDirectory = path.join(outputDir, 'png-sequence');
    const frameNames = (await fs.promises.readdir(frameDirectory))
      .filter((name) => name.endsWith('.png'))
      .sort((first, second) => Number.parseInt(first) - Number.parseInt(second));
    assert.ok(frameNames.length > 0, 'Expected the SRT flow test to render caption frames');

    const finalFrame = await decodeImageToRawRgba(
      await fs.promises.readFile(path.join(frameDirectory, frameNames.at(-1))),
    );
    const getOpaqueColorBounds = (matches) => {
      const bounds = {
        left: finalFrame.width,
        top: finalFrame.height,
        right: -1,
        bottom: -1,
      };
      for (let index = 0; index < finalFrame.buffer.length; index += 4) {
        if (finalFrame.buffer[index + 3] > 200 && matches(finalFrame.buffer, index)) {
          const pixelIndex = index / 4;
          const x = pixelIndex % finalFrame.width;
          const y = Math.floor(pixelIndex / finalFrame.width);
          bounds.left = Math.min(bounds.left, x);
          bounds.top = Math.min(bounds.top, y);
          bounds.right = Math.max(bounds.right, x);
          bounds.bottom = Math.max(bounds.bottom, y);
        }
      }
      return bounds.right >= 0 ? bounds : null;
    };

    const currentBounds = getOpaqueColorBounds(
      (buffer, index) => buffer[index] > 220 && buffer[index + 1] < 40 && buffer[index + 2] < 40,
    );
    assert.ok(currentBounds, 'Expected the current word background');
    assert.ok(
      currentBounds.right - currentBounds.left + 1 > 150,
      'Expected adjacent SRT words to share one row instead of rendering as separate caption groups',
    );
  } finally {
    logTestOutput('SRT flow render', outputDir);
  }
});

test('uses render canvas for caption layout and shares tight frames', { timeout: 60 * 1000 }, async () => {
  const outputDir = await prepareTestOutputDir('frame-reuse-video');
  try {
    const inputVideo = path.join(__dirname, 'sample-inputs', 'sample-eng', 'sample-portrait-360p.mp4');
    const captionCatEngine = createEngine(outputDir, null);
    const originalGenerateRenderFrames = captionCatEngine.generateRenderFrames.bind(captionCatEngine);
    let generationCount = 0;
    captionCatEngine.generateRenderFrames = (...args) => {
      generationCount += 1;
      return originalGenerateRenderFrames(...args);
    };

    const result = await captionCatEngine.render({
      input: {
        video: inputVideo,
        captions: ['1', '00:00:00,000 --> 00:00:00,400', 'Hello world'].join('\n'),
      },
      renders: [
        {
          preset: '5o',
          fps: 30,
          outputs: {
            pngSequence: {
              directory: path.join(outputDir, 'frames'),
            },
            standaloneCaptionMovie: {
              path: path.join(outputDir, 'captions.mov'),
            },
            overlayVideo: {
              path: path.join(outputDir, 'overlay.mp4'),
            },
          },
        },
      ],
    });

    assert.equal(
      generationCount,
      1,
      'Matching PNG, standalone caption movie, and overlay outputs should share one frame generation',
    );
    const pngDirectory = result.renders?.[0]?.outputs.pngSequence?.directory;
    const standaloneCaptionMoviePath = result.renders?.[0]?.outputs.standaloneCaptionMovie?.path;
    const overlayVideoPath = result.renders?.[0]?.outputs.overlayVideo?.path;
    assert.ok(pngDirectory, 'Expected a PNG output directory');
    assert.ok(standaloneCaptionMoviePath, 'Expected a standalone caption movie output path');
    assert.ok(overlayVideoPath, 'Expected an overlay video output path');
    assert.ok(fs.existsSync(overlayVideoPath), 'Expected the overlay video output to exist');
    logTestOutput('frame reuse PNG sequence', pngDirectory);
    logTestOutput('frame reuse standalone caption movie', standaloneCaptionMoviePath);
    logTestOutput('frame reuse overlay video', overlayVideoPath);
    const firstFrameName = (await fs.promises.readdir(pngDirectory)).find((name) => name.endsWith('.png'));
    assert.ok(firstFrameName, 'Expected a generated PNG frame');
    const firstFrame = await decodeImageToRawRgba(await fs.promises.readFile(path.join(pngDirectory, firstFrameName)));
    const standaloneCaptionMovieMetadata = await probeVideoMetadata(standaloneCaptionMoviePath);
    assert.ok(firstFrame.width <= 360 && firstFrame.height <= 640);
    assert.ok(firstFrame.width < 360 || firstFrame.height < 640);
    assert.deepEqual(
      { width: standaloneCaptionMovieMetadata.width, height: standaloneCaptionMovieMetadata.height },
      { width: firstFrame.width, height: firstFrame.height },
    );

    const smallerResult = await captionCatEngine.render({
      input: {
        video: inputVideo,
        captions: ['1', '00:00:00,000 --> 00:00:00,400', 'Hello world'].join('\n'),
      },
      renders: [
        {
          preset: '5o',
          canvasSize: { width: 180, height: 320 },
          outputs: {
            pngSequence: {
              directory: path.join(outputDir, 'smaller-frames'),
            },
            standaloneCaptionMovie: {
              path: path.join(outputDir, 'smaller-captions.mov'),
            },
          },
        },
      ],
    });

    assert.equal(
      generationCount,
      2,
      'Matching caption outputs should share one generation at the render canvas size',
    );
    const smallerPngDirectory = smallerResult.renders?.[0]?.outputs.pngSequence?.directory;
    const smallerStandaloneCaptionMoviePath =
      smallerResult.renders?.[0]?.outputs.standaloneCaptionMovie?.path;
    assert.ok(smallerPngDirectory, 'Expected a smaller PNG output directory');
    assert.ok(smallerStandaloneCaptionMoviePath, 'Expected a smaller standalone caption movie output path');
    logTestOutput('smaller frame reuse PNG sequence', smallerPngDirectory);
    logTestOutput('smaller frame reuse standalone caption movie', smallerStandaloneCaptionMoviePath);
    const smallerFirstFrameName = (await fs.promises.readdir(smallerPngDirectory)).find((name) =>
      name.endsWith('.png'),
    );
    assert.ok(smallerFirstFrameName, 'Expected a generated smaller PNG frame');
    const smallerFirstFrame = await decodeImageToRawRgba(
      await fs.promises.readFile(path.join(smallerPngDirectory, smallerFirstFrameName)),
    );
    const smallerStandaloneCaptionMovieMetadata = await probeVideoMetadata(smallerStandaloneCaptionMoviePath);
    assert.ok(smallerFirstFrame.width <= 180 && smallerFirstFrame.height <= 320);
    assert.ok(smallerFirstFrame.width < 180 || smallerFirstFrame.height < 320);
    assert.deepEqual(
      {
        width: smallerStandaloneCaptionMovieMetadata.width,
        height: smallerStandaloneCaptionMovieMetadata.height,
      },
      { width: smallerFirstFrame.width, height: smallerFirstFrame.height },
    );
  } finally {
    logTestOutput('frame reuse render', outputDir);
  }
});

test('requires a render canvas size for audio-only renders', { timeout: 60 * 1000 }, async () => {
  const outputDir = await prepareTestOutputDir('frame-reuse-audio');
  try {
    const captionCatEngine = createEngine(outputDir, null);
    const originalGenerateRenderFrames = captionCatEngine.generateRenderFrames.bind(captionCatEngine);
    let generationCount = 0;
    captionCatEngine.generateRenderFrames = (...args) => {
      generationCount += 1;
      return originalGenerateRenderFrames(...args);
    };

    const result = await captionCatEngine.render({
      input: {
        audio: new Uint8Array([0]),
        transcript: [{ text: 'Hello world', start: 0, end: 0.4 }],
      },
      renders: [
        {
          preset: '5o',
          canvasSize: { width: 320, height: 180 },
          outputs: {
            pngSequence: {
              directory: path.join(outputDir, 'frames'),
            },
            standaloneCaptionMovie: {
              path: path.join(outputDir, 'captions.mov'),
            },
          },
        },
      ],
    });

    assert.equal(generationCount, 1, 'Matching audio-only outputs should share one frame generation');
    assert.ok(result.renders?.[0]?.outputs.pngSequence?.directory);
    assert.ok(result.renders?.[0]?.outputs.standaloneCaptionMovie?.path);
    logTestOutput('audio-only PNG sequence', result.renders[0].outputs.pngSequence.directory);
    logTestOutput('audio-only standalone caption movie', result.renders[0].outputs.standaloneCaptionMovie.path);

    await assert.rejects(
      () =>
        captionCatEngine.render({
          input: {
            transcript: [{ text: 'Hello world', start: 0, end: 0.4 }],
          },
          renders: [
            {
              preset: '5o',
              outputs: {
                pngSequence: {
                  directory: path.join(outputDir, 'missing-size'),
                },
              },
            },
          ],
        }),
      /renders\[\]\.canvasSize is required when input\.video is not provided/,
    );
  } finally {
    logTestOutput('audio-only render', outputDir);
  }
});

test('uses stable tight bounds for caption-only outputs', { timeout: 60 * 1000 }, async () => {
  const outputDir = await prepareTestOutputDir('cropped-caption-outputs');
  try {
    const captionCatEngine = createEngine(outputDir, null);
    const result = await captionCatEngine.render({
      input: {
        audio: new Uint8Array([0]),
        transcript: [{ text: 'Hello world', start: 0, end: 0.4 }],
      },
      renders: [
        {
          preset: '5o',
          canvasSize: { width: 320, height: 180 },
          outputs: {
            pngSequence: {
              directory: path.join(outputDir, 'frames'),
            },
            standaloneCaptionMovie: {
              path: path.join(outputDir, 'captions.mov'),
            },
          },
        },
      ],
    });

    const pngDirectory = result.renders?.[0]?.outputs.pngSequence?.directory;
    const standaloneCaptionMoviePath = result.renders?.[0]?.outputs.standaloneCaptionMovie?.path;
    assert.ok(pngDirectory);
    assert.ok(standaloneCaptionMoviePath);
    const firstFrameName = (await fs.promises.readdir(pngDirectory)).find((name) => name.endsWith('.png'));
    assert.ok(firstFrameName);
    const firstFrame = await decodeImageToRawRgba(
      await fs.promises.readFile(path.join(pngDirectory, firstFrameName)),
    );
    const movieMetadata = await probeVideoMetadata(standaloneCaptionMoviePath);
    assert.ok(firstFrame.width <= 320 && firstFrame.height <= 180);
    assert.ok(firstFrame.width < 320 || firstFrame.height < 180);
    assert.deepEqual(
      { width: movieMetadata.width, height: movieMetadata.height },
      { width: firstFrame.width, height: firstFrame.height },
    );
    logTestOutput('cropped PNG sequence', pngDirectory);
    logTestOutput('cropped standalone caption movie', standaloneCaptionMoviePath);
  } finally {
    logTestOutput('cropped caption output', outputDir);
  }
});

test('keeps overlay video on the source canvas when caption outputs are cropped', { timeout: 60 * 1000 }, async () => {
  const outputDir = await prepareTestOutputDir('cropped-mixed-outputs');
  try {
    const inputVideo = path.join(__dirname, 'sample-inputs', 'sample-eng', 'sample-portrait-360p.mp4');
    const captionCatEngine = createEngine(outputDir, null);
    const originalGenerateRenderFrames = captionCatEngine.generateRenderFrames.bind(captionCatEngine);
    let generationCount = 0;
    captionCatEngine.generateRenderFrames = (...args) => {
      generationCount += 1;
      return originalGenerateRenderFrames(...args);
    };
    const result = await captionCatEngine.render({
      input: {
        video: inputVideo,
        captions: ['1', '00:00:00,000 --> 00:00:00,400', 'Hello world'].join('\n'),
      },
      renders: [
        {
          preset: '5o',
          outputs: {
            pngSequence: {
              directory: path.join(outputDir, 'frames'),
            },
            overlayVideo: {
              path: path.join(outputDir, 'overlay.mp4'),
            },
          },
        },
      ],
    });

    assert.equal(generationCount, 2);
    const pngDirectory = result.renders?.[0]?.outputs.pngSequence?.directory;
    const overlayVideoPath = result.renders?.[0]?.outputs.overlayVideo?.path;
    assert.ok(pngDirectory);
    assert.ok(overlayVideoPath);
    const firstFrameName = (await fs.promises.readdir(pngDirectory)).find((name) => name.endsWith('.png'));
    assert.ok(firstFrameName);
    const firstFrame = await decodeImageToRawRgba(
      await fs.promises.readFile(path.join(pngDirectory, firstFrameName)),
    );
    const overlayMetadata = await probeVideoMetadata(overlayVideoPath);
    assert.ok(firstFrame.width < overlayMetadata.width || firstFrame.height < overlayMetadata.height);
    assert.deepEqual(
      { width: overlayMetadata.width, height: overlayMetadata.height },
      { width: 360, height: 640 },
    );
    logTestOutput('cropped mixed PNG sequence', pngDirectory);
    logTestOutput('cropped mixed overlay video', overlayVideoPath);
  } finally {
    logTestOutput('cropped mixed outputs', outputDir);
  }
});

test('applies render settings over preset settings', { timeout: 60 * 1000 }, async () => {
  const outputDir = await prepareTestOutputDir('render-settings');
  try {
    const captionCatEngine = createEngine(outputDir, null);
    const result = await captionCatEngine.render({
      input: {
        audio: new Uint8Array([0]),
        transcript: [{ text: 'Hello world', start: 0, end: 0.4 }],
      },
      renders: [
        {
          preset: '5o',
          settings: {
            timing: {
              captionHoldThresholdSeconds: 0.25,
            },
            captionLayout: {
              horizontalFit: 'shrink-to-fit',
              breaking: {
                wordWrapping: {
                  mode: 'wrap',
                },
              },
            },
          },
          canvasSize: { width: 320, height: 180 },
          outputs: {
            pngSequence: {
              directory: path.join(outputDir, 'frames'),
            },
          },
        },
      ],
    });

    assert.ok(result.renders?.[0]?.outputs.pngSequence?.directory);
    logTestOutput('render settings PNG sequence', result.renders[0].outputs.pngSequence.directory);
    await assert.rejects(
      () =>
        captionCatEngine.render({
          input: {
            audio: new Uint8Array([0]),
            transcript: [{ text: 'Hello world', start: 0, end: 0.4 }],
          },
          renders: [
            {
              preset: '5o',
              settings: {
                timing: {
                  captionHoldThresholdSeconds: -1,
                },
              },
              canvasSize: { width: 320, height: 180 },
              outputs: {
                pngSequence: {
                  directory: path.join(outputDir, 'invalid-frames'),
                },
              },
            },
          ],
        }),
      /renders\[\]\.settings\.timing\.captionHoldThresholdSeconds must be a finite number greater than or equal to zero/,
    );
  } finally {
    logTestOutput('render settings output', outputDir);
  }
});

test('loads ECS presets from bundled, inline, file, and URL sources', { timeout: 60 * 1000 }, async () => {
  const presetFile = path.resolve(__dirname, '..', 'assets', 'json', 'caption-style-presets', 'punch.json');
  const presetJson = await fs.promises.readFile(presetFile, 'utf8');
  const inlinePreset = JSON.parse(presetJson);
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'captioncat-preset-source-'));
  const customFile = path.join(tempDir, 'custom.json');
  const invalidJsonFile = path.join(tempDir, 'invalid.json');
  const unsupportedSchemaFile = path.join(tempDir, 'unsupported-schema.json');
  await fs.promises.writeFile(customFile, presetJson);
  await fs.promises.writeFile(invalidJsonFile, '{ invalid json');
  await fs.promises.writeFile(
    unsupportedSchemaFile,
    JSON.stringify({ ...inlinePreset, schemaVersion: 'ecs-caption-preset-v0' }),
  );

  let presetRequestCount = 0;
  const server = http.createServer((request, response) => {
    if (request.url === '/punch.json') {
      presetRequestCount += 1;
    }
    if (request.url === '/invalid-json') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{ invalid json');
      return;
    }
    if (request.url === '/unsupported-schema') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ...inlinePreset, schemaVersion: 'ecs-caption-preset-v0' }));
      return;
    }
    if (request.url === '/missing') {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(presetJson);
  });

  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string', 'Preset test server must expose a TCP address');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    for (const source of [CaptionPreset.Punch, inlinePreset, { file: customFile }, { url: `${baseUrl}/punch.json` }]) {
      const loadedPreset = await loadEcsCaptionPreset(source);
      assert.equal(loadedPreset.id, 'punch');
    }

    presetRequestCount = 0;
    const engineOutputDir = await prepareTestOutputDir('preset-source');
    const captionCatEngine = createCaptionCat();
    const engineResult = await captionCatEngine.render({
      input: {
        transcript: [{ text: 'Hello', start: 0, end: 0.1 }],
      },
      renders: [
        {
          preset: { url: `${baseUrl}/punch.json` },
          canvasSize: { width: 320, height: 180 },
          outputs: {
            pngSequence: {
              directory: path.join(engineOutputDir, 'frames'),
            },
            standaloneCaptionMovie: {
              path: path.join(engineOutputDir, 'captions.mov'),
            },
          },
        },
      ],
    });
    assert.equal(presetRequestCount, 1, 'A render entry must load its URL preset once');
    await assertOutputDirectoryExists(
      engineResult.renders?.[0]?.outputs.pngSequence?.directory,
      'URL preset PNG sequence',
    );
    await assertOutputFileExists(
      engineResult.renders?.[0]?.outputs.standaloneCaptionMovie?.path,
      'URL preset standalone caption movie',
    );

    await assert.rejects(() => loadEcsCaptionPreset({ file: invalidJsonFile }), /contains invalid JSON/);
    await assert.rejects(
      () => loadEcsCaptionPreset({ file: unsupportedSchemaFile }),
      /expected a valid ECS caption preset with schema version 1/,
    );
    await assert.rejects(() => loadEcsCaptionPreset({ url: `${baseUrl}/invalid-json` }), /contains invalid JSON/);
    await assert.rejects(
      () => loadEcsCaptionPreset({ url: `${baseUrl}/unsupported-schema` }),
      /expected a valid ECS caption preset with schema version 1/,
    );
    await assert.rejects(() => loadEcsCaptionPreset({ url: `${baseUrl}/missing` }), /returned HTTP 404/);
    await assert.rejects(() => loadEcsCaptionPreset({ url: 'file:///tmp/punch.json' }), /HTTP\(S\) URL/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
});

const parameterizedSampleTestConfig = loadParameterizedSampleTestConfig();
if (parameterizedSampleTestConfig) {
  for (const language of parameterizedSampleTestConfig.languages) {
    for (const aspectRatio of parameterizedSampleTestConfig.aspectRatios) {
      for (const resolution of parameterizedSampleTestConfig.resolutions) {
        const fixture = buildSampleEngFixture(aspectRatio, resolution);
        test(
          `parameterized sample render: ${fixture.name} for ${language} with selected presets`,
          { timeout: 20 * 60 * 1000 },
          async () => {
            await runCaptionFileRenderTestForPaths(
              fixture.inputVideo,
              fixture.captionFile,
              fixture.sampleName,
              `captions-ass-${language}`,
              {
                presetIds: parameterizedSampleTestConfig.presets,
                language,
                outputTypes: parameterizedSampleTestConfig.outputs,
              },
            );
          },
        );
      }
    }
  }
}

test(
  'video FPS override uses the requested rate for caption and output frames',
  { timeout: 20 * 60 * 1000 },
  async () => {
    const fixture = buildSampleEngFixture('9:16', '360p');
    await runCaptionFileRenderTestForPaths(
      fixture.inputVideo,
      fixture.captionFile,
      fixture.sampleName,
      'captions-ass-en-fps-60',
      {
        presetIds: ['5o', 'ig-typewriter'],
        language: 'en',
        fps: 60,
        renderPipeline: 'skia-compositor',
      },
    );
  },
);

test(
  'FFmpeg compositor applies animated blend modes against the source video',
  { timeout: 20 * 60 * 1000 },
  async () => {
    const outputDir = await prepareTestOutputDir('ffmpeg-blend');
    const sourcePath = path.join(outputDir, 'source.mp4');
    const outputPath = path.join(outputDir, 'output.mp4');
    const rawOutputPath = path.join(outputDir, 'output.rgba');
    const solidFrame = (r, g, b, a) => Buffer.from([r, g, b, a, r, g, b, a, r, g, b, a, r, g, b, a]);

    try {
      await createSolidColorVideo(sourcePath, {
        width: 2,
        height: 2,
        duration: 2,
        fps: 1,
      });
      await renderOverlayVideoViaRawFramePipe({
        inputPath: sourcePath,
        outputPath,
        videoResolution: { width: 2, height: 2 },
        captionFrameSize: { width: 2, height: 2 },
        captionInfos: [
          {
            word: 'blend',
            startTime: 0,
            endTime: 2,
            duration: 2,
            startFrame: 0,
            numFrames: 2,
            isLastWordInGroup: true,
            isLastWordOnPage: true,
          },
        ],
        allImageBuffers: [Buffer.alloc(16), Buffer.alloc(16)],
        allBlendModeLayers: [
          [{ mode: 'multiply', buffer: solidFrame(0, 255, 0, 255), width: 2, height: 2 }],
          [{ mode: 'screen', buffer: solidFrame(0, 255, 0, 255), width: 2, height: 2 }],
        ],
        fps: 1,
        outputFps: 1,
        durationSeconds: 2,
        videoDurationSeconds: 2,
        outputFrameCount: 2,
      });
      await runFfmpeg([
        '-y',
        '-i',
        outputPath,
        '-vf',
        'format=rgba',
        '-frames:v',
        '2',
        '-f',
        'rawvideo',
        rawOutputPath,
      ]);

      const frames = await fs.promises.readFile(rawOutputPath);
      assert.equal(frames.length, 32, 'FFmpeg blend output must contain two 2x2 RGBA frames');
      assert.ok(
        [...frames.subarray(0, 16)].every((value, index) => index % 4 === 3 || value < 32),
        'Multiply blend over black must remain black',
      );
      const screenFrame = frames.subarray(16, 32);
      assert.ok(
        [...screenFrame].every((value, index) => (index % 4 === 1 ? value > 100 : index % 4 === 3 || value < 80)),
        'Screen blend over black must produce green pixels',
      );
    } finally {
      logTestOutput('FFmpeg blend source video', sourcePath);
      logTestOutput('FFmpeg blend output video', outputPath);
      logTestOutput('FFmpeg blend raw frames', rawOutputPath);
    }
  },
);
