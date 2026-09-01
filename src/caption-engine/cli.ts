declare const process: {
  argv: string[];
  exitCode?: number;
  env: Record<string, string | undefined>;
};

import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_BRANDING } from '../project-branding';
import { createCaptionCat } from './captioncat-engine';
import { createDefaultConfig } from './config';
import { validateCaptionLayoutOverride, type CaptionLayoutOverride } from './entity-system/caption-layout';
import {
  CAPTION_PRESET_NAMES,
  loadEcsCaptionPreset,
  type CaptionPresetName,
  type CaptionPresetSource,
} from './presets/registry';
import type { CanvasSize, RenderDebugConfig, RenderRequest, RenderSpec, TranscriptEntry, WordTiming } from './types';
import { TranscriptionProviderName } from './types';

type CliCommand =
  | 'render'
  | 'transcribe'
  | 'ass'
  | 'png'
  | 'srt'
  | 'vtt'
  | 'export'
  | 'preset-list'
  | 'preset-validate'
  | 'help';

type ExportFormat = 'ass' | 'srt' | 'vtt' | 'json' | 'png';
type RenderPipeline = 'ffmpeg-compositor' | 'skia-compositor';

export interface CliOptions {
  command: CliCommand;
  input?: string;
  video?: string;
  audio?: string;
  captions?: string;
  transcript?: string;
  output?: string;
  provider?: string;
  language?: string;
  presetId?: string;
  presetFile?: string;
  videoOutput?: string;
  frames?: string;
  movieOutput?: string;
  ass?: string;
  srt?: string;
  vtt?: string;
  transcriptJson?: string;
  canvasSize?: CanvasSize;
  fps?: number;
  pipeline?: RenderPipeline;
  encodingPreset?: string;
  crf?: number;
  captionLayout?: CaptionLayoutOverride;
  format?: ExportFormat;
  debug?: RenderDebugConfig;
}

interface ResolvedPreset {
  source: CaptionPresetSource;
  outputName: string;
}

const AUDIO_EXTENSIONS = new Set(['.aac', '.flac', '.m4a', '.mp3', '.ogg', '.wav', '.webm']);
const SOURCE_OPTION_KEYS = [
  ['--input-video', 'video'],
  ['--audio', 'audio'],
  ['--input-captions', 'captions'],
  ['--transcript', 'transcript'],
] as const;

function getRequiredOptionValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('-')) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

function getUniqueOptionValue(existing: string | undefined, value: string, option: string): string {
  if (existing !== undefined) {
    throw new Error(`${option} can only be used once.`);
  }
  return value;
}

function parseFiniteNumber(value: string, option: string, minimum?: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (minimum !== undefined && parsed < minimum)) {
    const constraint = minimum === undefined ? 'a finite number' : `a number greater than or equal to ${minimum}`;
    throw new Error(`${option} must be ${constraint}.`);
  }
  return parsed;
}

function parseCanvasSize(value: string): CanvasSize {
  const match = /^(\d+)x(\d+)$/i.exec(value.trim());
  if (!match) {
    throw new Error('--canvas-size must use the WIDTHxHEIGHT format, for example 1920x1080.');
  }

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width <= 0 || height <= 0) {
    throw new Error('--canvas-size values must be greater than zero.');
  }
  return { width, height };
}

function parseProviderName(value: string | undefined): TranscriptionProviderName | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  const knownProviders = Object.values(TranscriptionProviderName) as TranscriptionProviderName[];
  if (!knownProviders.includes(normalized as TranscriptionProviderName)) {
    throw new Error(`Unknown provider "${value}". Choose one of: ${knownProviders.join(', ')}.`);
  }
  return normalized as TranscriptionProviderName;
}

function parseExportFormat(value: string): ExportFormat {
  const normalized = value.trim().toLowerCase();
  if (!['ass', 'srt', 'vtt', 'json', 'png'].includes(normalized)) {
    throw new Error('--format must be one of: ass, srt, vtt, json, png.');
  }
  return normalized as ExportFormat;
}

function parsePipeline(value: string): RenderPipeline {
  const normalized = value.trim().toLowerCase();
  if (normalized !== 'ffmpeg-compositor' && normalized !== 'skia-compositor') {
    throw new Error('--pipeline must be ffmpeg-compositor or skia-compositor.');
  }
  return normalized;
}

function setDebugOption(options: CliOptions, option: string): void {
  options.debug = {
    ...options.debug,
    ...(option === '--debug-bounds' ? { bounds: true } : {}),
    ...(option === '--debug-labels' ? { labels: true } : {}),
    ...(option === '--debug-position' ? { position: true } : {}),
    ...(option === '--debug-padding' ? { paddingBounds: true } : {}),
  };
}

function getPresetCommand(argv: string[]): { command: CliCommand; startIndex: number } {
  const subcommand = argv[1];
  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    return { command: 'help', startIndex: argv.length };
  }
  if (subcommand === 'list') {
    return { command: 'preset-list', startIndex: 2 };
  }
  if (subcommand === 'validate') {
    return { command: 'preset-validate', startIndex: 2 };
  }
  throw new Error(`Unknown preset command "${subcommand}". Use "list" or "validate".`);
}

export function printHelp(): string {
  return [
    `${PROJECT_BRANDING.projectName} CLI`,
    `Usage: ${PROJECT_BRANDING.projectSlug} <command> [input] [options]`,
    '',
    'Commands:',
    '  render                 Render captions and selected outputs.',
    '  transcribe             Transcribe a video or audio input.',
    '  ass                    Convert captions to ASS.',
    '  srt                    Convert captions to SRT.',
    '  vtt                    Convert captions to WebVTT.',
    '  png                    Render captions to a PNG sequence.',
    '  export                 Export captions with --format.',
    '  preset list            List bundled preset IDs.',
    '  preset validate <file> Validate a custom preset file.',
    '',
    'Input options:',
    '  --input-video <path>   Video input path.',
    '  --audio <path>         Audio input path.',
    '  --input-captions <path> Caption input in JSON, SRT, VTT, or ASS format.',
    '  --transcript <path>    Prepared transcript JSON input.',
    '',
    'Preset options:',
    '  --preset-id <id>       Bundled preset ID.',
    '  --preset-file <path>   Custom ECS preset JSON file.',
    '',
    'Render output options:',
    '  --video-output <path>  Overlay video output path.',
    '  --frames <directory>   PNG sequence output directory.',
    '  --movie-output <path>  Standalone caption movie output path.',
    '  --ass <path>           ASS subtitle output path.',
    '  --srt <path>           SRT subtitle output path.',
    '  --vtt <path>           WebVTT subtitle output path.',
    '  --transcript-json <path> Transcript JSON output path.',
    '',
    'Render options:',
    '  --canvas-size <WxH>    Caption canvas size, for example 1080x1920.',
    '  --fps <number>         Caption or output video frame rate.',
    '  --pipeline <name>      ffmpeg-compositor or skia-compositor.',
    '  --encoding-preset <name> FFmpeg encoder preset.',
    '  --crf <number>         FFmpeg constant rate factor.',
    '  --language <code>      Caption or transcription language.',
    '  --provider <name>      Transcription provider identifier.',
    '  --caption-layout <json> Partial caption layout policy override.',
    '  --debug-bounds         Write entity bounds debug data.',
    '  --debug-labels         Write entity labels debug data.',
    '  --debug-position       Write entity positions debug data.',
    '  --debug-padding        Write entity padding debug data.',
    '',
    'Other options:',
    '  --output <path>        Output file or directory for transcribe and conversions.',
    '                         Defaults to captions-output directory.',
    '  --format <name>        export format: ass, srt, vtt, json, or png.',
    '',
    'A positional input is shorthand for --input-video on render and --input-video or --audio',
    'on transcribe. Do not combine a positional input with an explicit input option.',
    'Render requires exactly one of --preset-id or --preset-file.',
    'Run "captioncat --help", "captioncat help", or "captioncat <command> --help" for this text.',
    'Provider keys use <PROVIDER>_API_KEY environment variables.',
  ].join('\n');
}

export function parseCliArgs(argv: string[]): CliOptions {
  const commandName = argv[0];
  if (!commandName || commandName === 'help' || commandName === '--help' || commandName === '-h') {
    return { command: 'help' };
  }

  let command: CliCommand;
  let startIndex = 1;
  if (commandName === 'preset') {
    ({ command, startIndex } = getPresetCommand(argv));
  } else if (['render', 'transcribe', 'ass', 'png', 'srt', 'vtt', 'export'].includes(commandName)) {
    command = commandName as Exclude<CliCommand, 'preset-list' | 'preset-validate' | 'help'>;
  } else {
    throw new Error(`Unknown command "${commandName}". Run "captioncat --help" for usage.`);
  }

  const options: CliOptions = { command };
  const positionalInputs: string[] = [];

  for (let index = startIndex; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;

    if (arg === '--help' || arg === '-h') {
      return { command: 'help' };
    }
    if (!arg.startsWith('-')) {
      positionalInputs.push(arg);
      continue;
    }

    switch (arg) {
      case '--input-video':
        options.video = getUniqueOptionValue(options.video, getRequiredOptionValue(argv, index, arg), arg);
        index += 1;
        break;
      case '--audio':
        options.audio = getUniqueOptionValue(options.audio, getRequiredOptionValue(argv, index, arg), arg);
        index += 1;
        break;
      case '--input-captions':
        options.captions = getUniqueOptionValue(options.captions, getRequiredOptionValue(argv, index, arg), arg);
        index += 1;
        break;
      case '--transcript':
        options.transcript = getUniqueOptionValue(options.transcript, getRequiredOptionValue(argv, index, arg), arg);
        index += 1;
        break;
      case '--output':
        options.output = getUniqueOptionValue(options.output, getRequiredOptionValue(argv, index, arg), arg);
        index += 1;
        break;
      case '--provider':
        options.provider = getUniqueOptionValue(options.provider, getRequiredOptionValue(argv, index, arg), arg);
        index += 1;
        break;
      case '--language':
        options.language = getUniqueOptionValue(options.language, getRequiredOptionValue(argv, index, arg), arg);
        index += 1;
        break;
      case '--preset-id':
        options.presetId = getUniqueOptionValue(options.presetId, getRequiredOptionValue(argv, index, arg), arg);
        index += 1;
        break;
      case '--preset-file':
        options.presetFile = getUniqueOptionValue(options.presetFile, getRequiredOptionValue(argv, index, arg), arg);
        index += 1;
        break;
      case '--video-output':
        options.videoOutput = getUniqueOptionValue(options.videoOutput, getRequiredOptionValue(argv, index, arg), arg);
        index += 1;
        break;
      case '--frames':
        options.frames = getUniqueOptionValue(options.frames, getRequiredOptionValue(argv, index, arg), arg);
        index += 1;
        break;
      case '--movie-output':
        options.movieOutput = getUniqueOptionValue(options.movieOutput, getRequiredOptionValue(argv, index, arg), arg);
        index += 1;
        break;
      case '--ass':
        options.ass = getUniqueOptionValue(options.ass, getRequiredOptionValue(argv, index, arg), arg);
        index += 1;
        break;
      case '--srt':
        options.srt = getUniqueOptionValue(options.srt, getRequiredOptionValue(argv, index, arg), arg);
        index += 1;
        break;
      case '--vtt':
        options.vtt = getUniqueOptionValue(options.vtt, getRequiredOptionValue(argv, index, arg), arg);
        index += 1;
        break;
      case '--transcript-json':
        options.transcriptJson = getUniqueOptionValue(
          options.transcriptJson,
          getRequiredOptionValue(argv, index, arg),
          arg,
        );
        index += 1;
        break;
      case '--canvas-size':
        if (options.canvasSize) throw new Error(`${arg} can only be used once.`);
        options.canvasSize = parseCanvasSize(getRequiredOptionValue(argv, index, arg));
        index += 1;
        break;
      case '--fps':
        if (options.fps !== undefined) throw new Error(`${arg} can only be used once.`);
        options.fps = parseFiniteNumber(getRequiredOptionValue(argv, index, arg), arg, Number.MIN_VALUE);
        index += 1;
        break;
      case '--pipeline':
        if (options.pipeline !== undefined) throw new Error(`${arg} can only be used once.`);
        options.pipeline = parsePipeline(getRequiredOptionValue(argv, index, arg));
        index += 1;
        break;
      case '--encoding-preset':
        options.encodingPreset = getUniqueOptionValue(
          options.encodingPreset,
          getRequiredOptionValue(argv, index, arg),
          arg,
        );
        index += 1;
        break;
      case '--crf':
        if (options.crf !== undefined) throw new Error(`${arg} can only be used once.`);
        options.crf = parseFiniteNumber(getRequiredOptionValue(argv, index, arg), arg, 0);
        index += 1;
        break;
      case '--caption-layout': {
        if (options.captionLayout) throw new Error(`${arg} can only be used once.`);
        let parsed: unknown;
        try {
          parsed = JSON.parse(getRequiredOptionValue(argv, index, arg));
        } catch {
          throw new Error('--caption-layout must be valid JSON.');
        }
        options.captionLayout = validateCaptionLayoutOverride(parsed, arg);
        index += 1;
        break;
      }
      case '--format':
        if (options.format !== undefined) throw new Error(`${arg} can only be used once.`);
        options.format = parseExportFormat(getRequiredOptionValue(argv, index, arg));
        index += 1;
        break;
      case '--debug-bounds':
      case '--debug-labels':
      case '--debug-position':
      case '--debug-padding':
        setDebugOption(options, arg);
        break;
      default:
        throw new Error(`Unknown option "${arg}". Run "captioncat --help" for usage.`);
    }
  }

  if (positionalInputs.length > 1) {
    throw new Error('Only one positional input is allowed.');
  }
  if (positionalInputs.length === 1) {
    options.input = positionalInputs[0];
  }

  return options;
}

function hasExplicitSourceOption(options: CliOptions): boolean {
  return Boolean(options.video || options.audio || options.captions || options.transcript);
}

function hasAnyOption(options: CliOptions, keys: readonly (keyof CliOptions)[]): boolean {
  return keys.some((key) => options[key] !== undefined);
}

function validateSourceSelection(options: CliOptions): void {
  if (options.input && hasExplicitSourceOption(options)) {
    throw new Error(
      `Do not combine a positional input with ${SOURCE_OPTION_KEYS.filter(([, key]) => Boolean(options[key]))
        .map(([option]) => option)
        .join(', ')}.`,
    );
  }
  if (options.captions && options.transcript) {
    throw new Error('Use either --input-captions or --transcript, not both.');
  }
}

function resolveBundledPresetName(value: string): CaptionPresetName {
  const normalized = value.trim().toLowerCase();
  const presetName = CAPTION_PRESET_NAMES.find((name) => name.toLowerCase() === normalized);
  if (!presetName) {
    throw new Error(`Unknown bundled preset ID "${value}". Run "captioncat preset list" to see available IDs.`);
  }
  return presetName;
}

function resolvePreset(options: CliOptions, required = true): ResolvedPreset | undefined {
  if (options.presetId && options.presetFile) {
    throw new Error('Use either --preset-id or --preset-file, not both.');
  }
  if (!options.presetId && !options.presetFile) {
    if (required) {
      throw new Error('Render requires exactly one of --preset-id or --preset-file.');
    }
    return undefined;
  }

  if (options.presetId) {
    const presetId = resolveBundledPresetName(options.presetId);
    return { source: presetId, outputName: presetId };
  }

  if (!options.presetFile) {
    throw new Error('Render requires exactly one of --preset-id or --preset-file.');
  }
  const presetFile = options.presetFile;
  return {
    source: { file: presetFile },
    outputName: path.basename(presetFile, path.extname(presetFile)) || 'preset',
  };
}

function getProviderToken(options: CliOptions): RenderRequest['transcription'] {
  const providerName = parseProviderName(options.provider);
  if (!providerName) {
    return undefined;
  }

  const providerKeySuffix = providerName
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const providerApiKey = process.env[`${providerKeySuffix}_API_KEY`];
  return {
    providers: [
      {
        provider: providerName,
        ...(providerApiKey ? { apiKey: providerApiKey } : {}),
        ...(options.language ? { language: options.language } : {}),
      },
    ],
  };
}

function isWordTiming(value: unknown): value is WordTiming {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.text === 'string' &&
    typeof entry.start === 'number' &&
    Number.isFinite(entry.start) &&
    typeof entry.end === 'number' &&
    Number.isFinite(entry.end)
  );
}

function isTranscriptEntry(value: unknown): value is TranscriptEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.text === 'string' &&
    typeof entry.start === 'number' &&
    Number.isFinite(entry.start) &&
    typeof entry.end === 'number' &&
    Number.isFinite(entry.end) &&
    (entry.words === undefined || (Array.isArray(entry.words) && entry.words.every((word) => isWordTiming(word))))
  );
}

async function readTranscriptFile(file: string): Promise<TranscriptEntry[]> {
  const resolvedFile = path.resolve(file);
  let content: string;
  try {
    content = await fs.promises.readFile(resolvedFile, 'utf8');
  } catch (error) {
    throw new Error(`Unable to read transcript file "${resolvedFile}".`, { cause: error });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`Transcript file "${resolvedFile}" contains invalid JSON.`, { cause: error });
  }

  const entries = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'transcript' in parsed
      ? (parsed as { transcript?: unknown }).transcript
      : undefined;
  if (!Array.isArray(entries) || !entries.every((entry) => isTranscriptEntry(entry))) {
    throw new Error(
      `Transcript file "${resolvedFile}" must contain an array of entries with text, start, and end fields.`,
    );
  }
  return entries;
}

async function resolveRenderInput(options: CliOptions): Promise<NonNullable<RenderRequest['input']>> {
  validateSourceSelection(options);
  const input: NonNullable<RenderRequest['input']> = {};
  if (options.input) input.video = options.input;
  if (options.video) input.video = options.video;
  if (options.audio) input.audio = options.audio;
  if (options.captions) input.captions = options.captions;
  if (options.transcript) input.transcript = await readTranscriptFile(options.transcript);
  if (Object.keys(input).length === 0) {
    throw new Error('Provide an input with a positional path, --input-video, --audio, --input-captions, or --transcript.');
  }
  return input;
}

function resolveTranscriptionInput(options: CliOptions): NonNullable<RenderRequest['input']> {
  validateSourceSelection(options);
  if (options.captions || options.transcript) {
    throw new Error('transcribe accepts only video and audio inputs.');
  }
  if (options.input) {
    return AUDIO_EXTENSIONS.has(path.extname(options.input).toLowerCase())
      ? { audio: options.input }
      : { video: options.input };
  }
  if (options.video || options.audio) {
    return {
      ...(options.video ? { video: options.video } : {}),
      ...(options.audio ? { audio: options.audio } : {}),
    };
  }
  throw new Error('transcribe requires a positional input, --input-video, or --audio.');
}

function resolveCaptionInput(options: CliOptions): NonNullable<RenderRequest['input']> {
  validateSourceSelection(options);
  if (options.video || options.audio) {
    throw new Error(`${options.command} accepts caption input, not video or audio input.`);
  }
  if (options.input) return { captions: options.input };
  if (options.captions) return { captions: options.captions };
  if (options.transcript) return { captions: options.transcript };
  throw new Error(`${options.command} requires a positional caption path or --input-captions.`);
}

function resolveFormatOutputPath(output: string | undefined, format: 'ass' | 'srt' | 'vtt' | 'json'): string {
  const defaultName = format === 'json' ? 'transcript.json' : `captions.${format}`;
  if (!output) return path.resolve('captions-output', defaultName);
  return path.extname(output).toLowerCase() === `.${format}` ? path.resolve(output) : path.resolve(output, defaultName);
}

function resolvePngOutputDirectory(options: CliOptions): string {
  if (options.frames && options.output) {
    throw new Error('Use either --frames or --output for PNG output, not both.');
  }
  return path.resolve(options.frames ?? options.output ?? 'captions-output');
}

function resolveDefaultOverlayVideoPath(videoPath: string, presetOutputName: string): string {
  const inputBaseName = path.basename(videoPath, path.extname(videoPath));
  return path.join('captions-output', presetOutputName, `${inputBaseName || 'video'}-captioncat.mp4`);
}

function buildRenderSpec(
  options: CliOptions,
  preset: ResolvedPreset,
  hasVideo: boolean,
  inputVideoPath?: string,
): RenderSpec {
  const hasAnyOutputFlag = Boolean(
    options.videoOutput ||
    options.frames ||
    options.movieOutput ||
    options.ass ||
    options.srt ||
    options.vtt ||
    options.transcriptJson,
  );
  const videoOutput =
    options.videoOutput ??
    (!hasAnyOutputFlag && hasVideo && inputVideoPath
      ? resolveDefaultOverlayVideoPath(inputVideoPath, preset.outputName)
      : undefined);

  if (videoOutput && !hasVideo) {
    throw new Error('--video-output requires a video input.');
  }
  if ((options.frames || options.movieOutput) && !hasVideo && !options.canvasSize) {
    throw new Error('--canvas-size is required for caption-only PNG or movie output.');
  }
  if ((options.pipeline || options.encodingPreset || options.crf !== undefined) && !videoOutput) {
    throw new Error('--pipeline, --encoding-preset, and --crf require --video-output.');
  }

  return {
    preset: preset.source,
    ...(options.language ? { language: options.language } : {}),
    ...(options.canvasSize ? { canvasSize: options.canvasSize } : {}),
    ...(options.fps !== undefined ? { fps: options.fps } : {}),
    ...(options.captionLayout
      ? {
          settings: {
            captionLayout: options.captionLayout,
          },
        }
      : {}),
    outputs: {
      ...(options.frames ? { pngSequence: { directory: path.resolve(options.frames) } } : {}),
      ...(options.movieOutput ? { standaloneCaptionMovie: { path: path.resolve(options.movieOutput) } } : {}),
      ...(videoOutput
        ? {
            overlayVideo: {
              path: path.resolve(videoOutput),
              ...(options.pipeline ? { pipeline: options.pipeline } : {}),
              ...(options.encodingPreset || options.crf !== undefined
                ? {
                    encoding: {
                      ...(options.encodingPreset ? { preset: options.encodingPreset } : {}),
                      ...(options.crf !== undefined ? { crf: options.crf } : {}),
                    },
                  }
                : {}),
            },
          }
        : {}),
    },
  };
}

function buildRenderExports(options: CliOptions): RenderRequest['exports'] | undefined {
  const exportsConfig: NonNullable<RenderRequest['exports']> = {};
  if (options.transcriptJson) {
    exportsConfig.transcript = { json: path.resolve(options.transcriptJson) };
  }
  if (options.ass || options.srt || options.vtt) {
    exportsConfig.captions = {
      ...(options.ass ? { ass: path.resolve(options.ass) } : {}),
      ...(options.srt ? { srt: path.resolve(options.srt) } : {}),
      ...(options.vtt ? { vtt: path.resolve(options.vtt) } : {}),
    };
  }
  return Object.keys(exportsConfig).length > 0 ? exportsConfig : undefined;
}

function validateRenderOptions(options: CliOptions): void {
  validateSourceSelection(options);
  if (options.output) {
    throw new Error('render does not use --output. Use --video-output, --frames, --movie-output, or export flags.');
  }
  if (options.format) throw new Error('render does not use --format.');
  if (options.input && options.video) {
    throw new Error('Do not combine a positional input with --input-video.');
  }
  if (!options.input && !options.video && !options.audio && !options.captions && !options.transcript) {
    throw new Error('render requires at least one input source.');
  }
}

async function runRender(options: CliOptions, captionCatEngine: ReturnType<typeof createCaptionCat>): Promise<void> {
  const preset = resolvePreset(options);
  if (!preset) {
    throw new Error('Render requires exactly one of --preset-id or --preset-file.');
  }
  validateRenderOptions(options);
  const input = await resolveRenderInput(options);
  const preparedTranscript = Boolean(options.captions || options.transcript);
  if (!preparedTranscript && !options.provider) {
    throw new Error('Provide --provider when the render input does not include captions or a transcript.');
  }
  const exportsConfig = buildRenderExports(options);
  const hasOutputFlag = Boolean(
    options.videoOutput ||
    options.frames ||
    options.movieOutput ||
    options.ass ||
    options.srt ||
    options.vtt ||
    options.transcriptJson,
  );
  const hasVideo = Boolean(input.video);
  if (!hasOutputFlag && !hasVideo) {
    throw new Error('Caption-only renders require at least one output flag.');
  }
  const hasVisualOutput = Boolean(options.videoOutput || options.frames || options.movieOutput);
  if (
    !hasVisualOutput &&
    (options.canvasSize ||
      options.fps !== undefined ||
      options.pipeline ||
      options.encodingPreset ||
      options.crf !== undefined ||
      options.captionLayout ||
      options.debug)
  ) {
    throw new Error('Canvas, video, and debug render options require a visual output.');
  }
  const shouldRenderVisuals = hasVisualOutput || (!hasOutputFlag && hasVideo);
  const providerConfig = getProviderToken(options);

  await captionCatEngine.render({
    input,
    ...(providerConfig ? { transcription: providerConfig } : {}),
    ...(options.debug ? { debug: options.debug } : {}),
    ...(exportsConfig ? { exports: exportsConfig } : {}),
    ...(shouldRenderVisuals
      ? {
          renders: [
            buildRenderSpec(options, preset, hasVideo, typeof input.video === 'string' ? input.video : undefined),
          ],
        }
      : {}),
  });
}

async function runTranscribe(
  options: CliOptions,
  captionCatEngine: ReturnType<typeof createCaptionCat>,
): Promise<void> {
  if (!options.provider) {
    throw new Error('transcribe requires --provider.');
  }
  if (
    hasAnyOption(options, [
      'presetId',
      'presetFile',
      'videoOutput',
      'frames',
      'movieOutput',
      'ass',
      'srt',
      'vtt',
      'canvasSize',
      'fps',
      'pipeline',
      'encodingPreset',
      'crf',
      'captionLayout',
      'format',
      'debug',
    ])
  ) {
    throw new Error('transcribe accepts media inputs, --provider, --language, and transcript output options only.');
  }
  if (options.output && options.transcriptJson) {
    throw new Error('Use either --output or --transcript-json, not both.');
  }
  if (options.transcriptJson) {
    options.output = options.transcriptJson;
  }
  const transcriptPath = resolveFormatOutputPath(options.output, 'json');
  const providerConfig = getProviderToken(options);
  await captionCatEngine.render({
    input: resolveTranscriptionInput(options),
    ...(providerConfig ? { transcription: providerConfig } : {}),
    exports: { transcript: { json: transcriptPath } },
  });
}

async function runCaptionConversion(
  options: CliOptions,
  format: 'ass' | 'srt' | 'vtt',
  captionCatEngine: ReturnType<typeof createCaptionCat>,
): Promise<void> {
  if (
    options.videoOutput ||
    options.frames ||
    options.movieOutput ||
    options.transcriptJson ||
    options.presetId ||
    options.presetFile ||
    options.pipeline ||
    options.encodingPreset ||
    options.crf !== undefined ||
    options.captionLayout ||
    options.fps !== undefined ||
    options.provider ||
    options.language ||
    options.format ||
    options.debug
  ) {
    throw new Error(`${options.command} does not use render output flags.`);
  }
  const input = resolveCaptionInput(options);
  const outputPath = resolveFormatOutputPath(options.output, format);
  await captionCatEngine.render({
    input,
    exports: {
      captions: {
        [format]: outputPath,
      },
    },
  });
}

async function runPng(options: CliOptions, captionCatEngine: ReturnType<typeof createCaptionCat>): Promise<void> {
  const preset = resolvePreset(options);
  if (!preset) throw new Error('PNG output requires exactly one of --preset-id or --preset-file.');
  if (options.videoOutput) {
    throw new Error('png does not use --video-output. Use --output or --frames.');
  }
  if (
    options.movieOutput ||
    options.ass ||
    options.srt ||
    options.vtt ||
    options.transcriptJson ||
    (options.format !== undefined && options.format !== 'png') ||
    options.provider ||
    options.pipeline ||
    options.encodingPreset ||
    options.crf !== undefined
  ) {
    throw new Error('png only creates a PNG sequence.');
  }
  validateSourceSelection(options);
  const captionOptions: CliOptions = {
    command: options.command,
    ...(options.input ? { input: options.input } : {}),
    ...(options.captions ? { captions: options.captions } : {}),
    ...(options.transcript ? { transcript: options.transcript } : {}),
  };
  const input = resolveCaptionInput(captionOptions);
  const renderOptions: CliOptions = {
    ...options,
    frames: resolvePngOutputDirectory(options),
  };
  await captionCatEngine.render({
    input: {
      ...input,
      ...(options.video ? { video: options.video } : {}),
    },
    ...(options.debug ? { debug: options.debug } : {}),
    renders: [buildRenderSpec(renderOptions, preset, Boolean(options.video), options.video)],
  });
}

async function runExport(options: CliOptions, captionCatEngine: ReturnType<typeof createCaptionCat>): Promise<void> {
  if (!options.format) {
    throw new Error('export requires --format.');
  }
  if (options.format === 'png') {
    await runPng(options, captionCatEngine);
    return;
  }
  if (
    hasAnyOption(options, [
      'presetId',
      'presetFile',
      'videoOutput',
      'frames',
      'movieOutput',
      'ass',
      'srt',
      'vtt',
      'transcriptJson',
      'canvasSize',
      'fps',
      'pipeline',
      'encodingPreset',
      'crf',
      'captionLayout',
      'provider',
      'language',
      'debug',
    ])
  ) {
    throw new Error('Use --output with export subtitle and transcript formats.');
  }
  const input = resolveCaptionInput(options);
  const outputPath = resolveFormatOutputPath(options.output, options.format);
  if (options.format === 'json') {
    await captionCatEngine.render({
      input,
      exports: { transcript: { json: outputPath } },
    });
    return;
  }
  await captionCatEngine.render({
    input,
    exports: { captions: { [options.format]: outputPath } },
  });
}

async function runPresetList(options: CliOptions): Promise<void> {
  if (
    hasAnyOption(options, [
      'input',
      'video',
      'audio',
      'captions',
      'transcript',
      'output',
      'provider',
      'language',
      'presetId',
      'presetFile',
      'videoOutput',
      'frames',
      'movieOutput',
      'ass',
      'srt',
      'vtt',
      'transcriptJson',
      'canvasSize',
      'fps',
      'pipeline',
      'encodingPreset',
      'crf',
      'captionLayout',
      'format',
      'debug',
    ])
  ) {
    throw new Error('preset list does not accept input or source options.');
  }
  for (const presetName of CAPTION_PRESET_NAMES) {
    console.log(presetName);
  }
}

async function runPresetValidate(options: CliOptions): Promise<void> {
  if (options.input && (options.presetId || options.presetFile)) {
    throw new Error('Use either a positional preset file or a preset option, not both.');
  }
  if (options.presetId && options.presetFile) {
    throw new Error('Use either --preset-id or --preset-file, not both.');
  }
  if (options.video || options.audio || options.captions || options.transcript) {
    throw new Error('preset validate accepts a preset file, not media or caption input.');
  }
  if (
    hasAnyOption(options, [
      'output',
      'provider',
      'language',
      'videoOutput',
      'frames',
      'movieOutput',
      'ass',
      'srt',
      'vtt',
      'transcriptJson',
      'canvasSize',
      'fps',
      'pipeline',
      'encodingPreset',
      'crf',
      'captionLayout',
      'format',
      'debug',
    ])
  ) {
    throw new Error('preset validate accepts only a preset file path or preset option.');
  }
  const presetFile = options.presetFile ?? options.input;
  if (!presetFile && !options.presetId) {
    throw new Error('preset validate requires a preset file path or --preset-id.');
  }
  let source: CaptionPresetSource;
  if (options.presetId) {
    source = resolveBundledPresetName(options.presetId);
  } else if (presetFile) {
    source = { file: presetFile };
  } else {
    throw new Error('preset validate requires a preset file path or --preset-id.');
  }
  const preset = await loadEcsCaptionPreset(source);
  console.log(`Valid ECS preset: ${preset.id}`);
}

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<number> {
  const options = parseCliArgs(argv);

  if (options.command === 'help') {
    console.log(printHelp());
    return 0;
  }
  if (options.command === 'preset-list') {
    await runPresetList(options);
    return 0;
  }
  if (options.command === 'preset-validate') {
    await runPresetValidate(options);
    return 0;
  }

  const captionCatEngine = createCaptionCat({}, createDefaultConfig());
  switch (options.command) {
    case 'render':
      await runRender(options, captionCatEngine);
      break;
    case 'transcribe':
      await runTranscribe(options, captionCatEngine);
      break;
    case 'ass':
    case 'srt':
    case 'vtt':
      await runCaptionConversion(options, options.command, captionCatEngine);
      break;
    case 'png':
      await runPng(options, captionCatEngine);
      break;
    case 'export':
      await runExport(options, captionCatEngine);
      break;
    default:
      throw new Error(`Unsupported command "${options.command}".`);
  }

  console.log(`[${PROJECT_BRANDING.projectName}] ${options.command} completed.`);
  return 0;
}
