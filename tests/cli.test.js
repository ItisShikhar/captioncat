const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { parseCliArgs, printHelp, runCli } = require('../build/caption-engine/cli.js');

test('parses explicit render sources, preset, outputs, and render settings', () => {
  const options = parseCliArgs([
    'render',
    '--input-video',
    'input.mp4',
    '--audio',
    'voiceover.mp3',
    '--input-captions',
    'captions.srt',
    '--preset-id',
    'ig-demure',
    '--video-output',
    'output/video.mp4',
    '--frames',
    'output/frames',
    '--movie-output',
    'output/captions.mov',
    '--ass',
    'output/captions.ass',
    '--srt',
    'output/captions.srt',
    '--vtt',
    'output/captions.vtt',
    '--transcript-json',
    'output/transcript.json',
    '--canvas-size',
    '1080x1920',
    '--fps',
    '30',
    '--pipeline',
    'skia-compositor',
    '--language',
    'en',
  ]);

  assert.deepEqual(options, {
    command: 'render',
    video: 'input.mp4',
    audio: 'voiceover.mp3',
    captions: 'captions.srt',
    presetId: 'ig-demure',
    videoOutput: 'output/video.mp4',
    frames: 'output/frames',
    movieOutput: 'output/captions.mov',
    ass: 'output/captions.ass',
    srt: 'output/captions.srt',
    vtt: 'output/captions.vtt',
    transcriptJson: 'output/transcript.json',
    canvasSize: { width: 1080, height: 1920 },
    fps: 30,
    pipeline: 'skia-compositor',
    language: 'en',
  });
});

test('parses focused commands and preset subcommands', () => {
  assert.deepEqual(parseCliArgs(['help']), { command: 'help' });
  assert.equal(parseCliArgs(['ass', 'captions.srt']).command, 'ass');
  assert.equal(parseCliArgs(['export', 'captions.srt', '--format', 'vtt']).format, 'vtt');
  assert.equal(parseCliArgs(['preset', 'list']).command, 'preset-list');
  assert.equal(parseCliArgs(['preset', 'validate', 'custom.json']).command, 'preset-validate');
});

test('rejects the old video and captions flags', () => {
  assert.throws(() => parseCliArgs(['render', '--video', 'input.mp4']), /Unknown option "--video"/);
  assert.throws(() => parseCliArgs(['render', '--captions', 'captions.srt']), /Unknown option "--captions"/);
});

test('requires one preset source for render', async () => {
  await assert.rejects(
    () => runCli(['render', '--input-video', 'input.mp4', '--input-captions', 'captions.srt']),
    /Render requires exactly one of --preset-id or --preset-file/,
  );
});

test('rejects both preset source options', async () => {
  await assert.rejects(
    () =>
      runCli([
        'render',
        '--input-video',
        'input.mp4',
        '--input-captions',
        'captions.srt',
        '--preset-id',
        'punch',
        '--preset-file',
        'custom.json',
      ]),
    /Use either --preset-id or --preset-file, not both/,
  );
});

test('rejects a positional input with an explicit source option', async () => {
  await assert.rejects(
    () =>
      runCli([
        'render',
        'input.mp4',
        '--input-video',
        'other.mp4',
        '--preset-id',
        'punch',
      ]),
    /Do not combine a positional input with --input-video/,
  );
});

test('rejects captions and transcript input together', async () => {
  await assert.rejects(
    () =>
      runCli([
        'render',
        '--input-video',
        'input.mp4',
        '--input-captions',
        'captions.srt',
        '--transcript',
        'transcript.json',
        '--preset-id',
        'punch',
      ]),
    /Use either --input-captions or --transcript, not both/,
  );
});

test('requires an output for caption-only renders', async () => {
  await assert.rejects(
    () => runCli(['render', '--input-captions', 'captions.srt', '--preset-id', 'punch']),
    /Caption-only renders require at least one output flag/,
  );
});

test('requires a provider for transcription', async () => {
  await assert.rejects(() => runCli(['transcribe', 'input.mp4']), /transcribe requires --provider/);
});

test('writes the selected caption exports for a caption-only render', async () => {
  const outputDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'captioncat-cli-'));
  const captionsPath = path.resolve('tests/sample-inputs/sample-eng/captions.srt');
  try {
    await runCli([
      'render',
      '--input-captions',
      captionsPath,
      '--preset-id',
      'punch',
      '--ass',
      path.join(outputDirectory, 'captions.ass'),
      '--srt',
      path.join(outputDirectory, 'captions.srt'),
      '--vtt',
      path.join(outputDirectory, 'captions.vtt'),
      '--transcript-json',
      path.join(outputDirectory, 'transcript.json'),
    ]);

    for (const fileName of ['captions.ass', 'captions.srt', 'captions.vtt', 'transcript.json']) {
      await fs.promises.access(path.join(outputDirectory, fileName));
    }
  } finally {
    await fs.promises.rm(outputDirectory, { recursive: true, force: true });
  }
});

test('documents the explicit preset and output options in help', () => {
  const help = printHelp();
  assert.match(help, /--preset-id <id>/);
  assert.match(help, /--preset-file <path>/);
  assert.match(help, /--input-video <path>/);
  assert.match(help, /--input-captions <path>/);
  assert.match(help, /--video-output <path>/);
  assert.match(help, /--transcript-json <path>/);
  assert.match(help, /Defaults to captions-output directory/);
});
