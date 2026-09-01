import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { PROJECT_BRANDING, PROJECT_CAPTION_METADATA } from '../project-branding';
import { WordTimestamps } from '../types/tts';
import { resolveVideoEncodeSettings } from '../utilities/ffmpeg-quality';
import { probeVideoMetadata, runFfmpeg } from '../utilities/ffmpeg-runner';
import { createDefaultConfig } from './config';
import { DEFAULT_CAPTION_HOLD_THRESHOLD_SECONDS, mergeCaptionLayoutPolicy } from './entity-system/caption-layout';
import { generateSubtitleImagesEcs, type EcsPipelineOutput } from './entity-system/pipeline';
import { toFsPath } from './path-utils';
import { DefaultCaptionEngine } from './pipeline';
import { loadEcsCaptionPreset, type EcsCaptionPreset } from './presets/registry';
import { createProviderRegistry, ProviderRegistry } from './providers';
import { renderOverlayVideoViaRawFramePipe } from './render-pipeline-ffmpeg-compositor';
import { renderOverlayVideoNodeComposite } from './render-pipeline-skia-compositor';
import {
  createCompositionAreaOverlayMovie,
  drawCaptionDebugOverlays,
  createStandaloneCaptionMovie,
  LONG_WORD_THRESHOLD,
  writeCaptionFramesAsPngSequence,
} from './render-utilities';
import {
  CanvasSize,
  RenderResult,
  RenderSpec,
  RenderRequest,
  RenderedVisualOutputs,
  RenderDebugConfig,
  RenderSettings,
  TranscriptEntry,
  TranscriptionProvider,
} from './types';

export interface captioncatCaptionEngineOptions {
  saveTranscriptionFile?: boolean;
  transcriptionFileFormat?: 'ass' | 'srt' | 'vtt' | 'json';
  debug?: boolean;
  tempDir?: string;
  transcriptionAudioMaxBytes?: number;
  transcriptionAudioBitrate?: string;
}

const DEFAULT_TRANSCRIPTION_AUDIO_MAX_BYTES = 1 * 1024 * 1024; //1MB
const DEFAULT_TRANSCRIPTION_AUDIO_BITRATE = '48k';
const DEFAULT_TRANSCRIPTION_AUDIO_SAMPLE_RATE = 16000;
const DEFAULT_TRANSCRIPTION_AUDIO_CHANNELS = 1;
const DEFAULT_TEMP_DIRECTORY_NAME = `${PROJECT_BRANDING.projectSlug}-caption-engine`;

function resolveVideoRenderFps(fpsOverride: number | undefined, sourceFps: number | undefined): number {
  const resolvedFps = fpsOverride ?? sourceFps ?? 30;
  if (!Number.isFinite(resolvedFps) || resolvedFps <= 0) {
    throw new Error('renders[].fps must be a finite number greater than zero.');
  }
  return resolvedFps;
}

function resolveVideoOutputFrameCount(
  videoMetadata: {
    duration?: number | undefined;
    videoDuration?: number | undefined;
    videoFrameCount?: number | undefined;
  },
  outputFps: number,
  hasFpsOverride: boolean,
): number | undefined {
  if (
    !hasFpsOverride &&
    typeof videoMetadata.videoFrameCount === 'number' &&
    Number.isInteger(videoMetadata.videoFrameCount) &&
    videoMetadata.videoFrameCount > 0
  ) {
    return videoMetadata.videoFrameCount;
  }

  const duration = videoMetadata.videoDuration ?? videoMetadata.duration;
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) {
    return undefined;
  }
  return Math.max(1, Math.round(duration * outputFps));
}

function toAssTimestamp(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const totalCentiseconds = Math.round(safeSeconds * 100);
  const hours = Math.floor(totalCentiseconds / 360000);
  const minutes = Math.floor((totalCentiseconds % 360000) / 6000);
  const wholeSeconds = Math.floor((totalCentiseconds % 6000) / 100);
  const centiseconds = totalCentiseconds % 100;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${wholeSeconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
}

function buildAssContent(transcript: TranscriptEntry[]): string {
  const lines = [
    '[Script Info]',
    `Title: ${PROJECT_CAPTION_METADATA.title}`,
    `Original Script: ${PROJECT_CAPTION_METADATA.artist}`,
    `Encoded by: ${PROJECT_CAPTION_METADATA.encodedBy}`,
    `Script URL: ${PROJECT_CAPTION_METADATA.github}`,
    `; ${PROJECT_CAPTION_METADATA.comment}`,
    'ScriptType: v4.00+',
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Default,Arimo,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const cues = buildTranscriptExportCues(transcript);
  cues.forEach((cue, index) => {
    lines.push(
      `Dialogue: ${index},${toAssTimestamp(cue.start)},${toAssTimestamp(cue.end)},Default,,0,0,0,,${cue.text}`,
    );
  });

  return `${lines.join('\n')}\n`;
}

function buildSrtContent(transcript: TranscriptEntry[]): string {
  const lines: string[] = [
    `# ${PROJECT_CAPTION_METADATA.title}`,
    `# Encoded by: ${PROJECT_CAPTION_METADATA.encodedBy}`,
    `# ${PROJECT_CAPTION_METADATA.comment}`,
    '',
  ];
  const cues = buildTranscriptExportCues(transcript);
  cues.forEach((cue, index) => {
    lines.push(String(index + 1));
    lines.push(`${formatTimestamp(cue.start)} --> ${formatTimestamp(cue.end)}`);
    lines.push(cue.text);
    lines.push('');
  });
  return lines.join('\n').trimEnd() + '\n';
}

function buildVttContent(transcript: TranscriptEntry[]): string {
  const srtContent = buildSrtContent(transcript);
  const metadataEnd = srtContent.indexOf('\n\n');
  const cuesContent = metadataEnd === -1 ? srtContent : srtContent.slice(metadataEnd + 2);
  return `WEBVTT\n\nNOTE\n${PROJECT_CAPTION_METADATA.title}\nEncoded by: ${
    PROJECT_CAPTION_METADATA.encodedBy
  }\n${PROJECT_CAPTION_METADATA.comment}\n\n${cuesContent.replace(/,000/g, '.000')}`;
}

function formatTimestamp(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const totalMilliseconds = Math.round(safeSeconds * 1000);
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const wholeSeconds = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${wholeSeconds
    .toString()
    .padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}

function resolveTranscriptEntryText(entry: TranscriptEntry): string {
  if (entry.text && entry.text.trim().length > 0) {
    return entry.text;
  }

  if (!entry.words || entry.words.length === 0) {
    return '';
  }

  const hasSpacingTokens = entry.words.some((word) => /^\s+$/.test(word.text));
  const joined = hasSpacingTokens
    ? entry.words.map((word) => word.text).join('')
    : entry.words.map((word) => word.text).join(' ');

  return joined.replace(/\s+/g, ' ').trim();
}

function resolveTranscriptEntryTimingSeconds(entry: TranscriptEntry): {
  start: number;
  end: number;
} {
  const timedWords = (entry.words ?? []).filter(
    (word) => Number.isFinite(word.start) && Number.isFinite(word.end) && word.start >= 0 && word.end >= word.start,
  );

  if (timedWords.length > 0) {
    const start = Math.min(...timedWords.map((word) => word.start));
    const end = Math.max(...timedWords.map((word) => word.end));
    return { start, end };
  }

  const hasEntryTiming =
    Number.isFinite(entry.start) &&
    Number.isFinite(entry.end) &&
    entry.start >= 0 &&
    entry.end >= entry.start &&
    entry.end > entry.start;

  if (hasEntryTiming) {
    return {
      start: entry.start,
      end: entry.end,
    };
  }

  const safeStart = Number.isFinite(entry.start) ? Math.max(0, entry.start) : 0;
  const safeEnd = Number.isFinite(entry.end) ? Math.max(safeStart, entry.end) : safeStart;
  return { start: safeStart, end: safeEnd };
}

function buildTranscriptExportCues(transcript: TranscriptEntry[]): Array<{ start: number; end: number; text: string }> {
  const cues: Array<{ start: number; end: number; text: string }> = [];

  transcript.forEach((entry) => {
    const wordCues = (entry.words ?? [])
      .filter(
        (word) => Number.isFinite(word.start) && Number.isFinite(word.end) && word.start >= 0 && word.end >= word.start,
      )
      .map((word) => ({
        start: word.start,
        end: word.end,
        text: word.text.replace(/\r?\n/g, ' ').trim(),
      }))
      .filter((word) => word.text.length > 0);

    if (wordCues.length > 0) {
      cues.push(...wordCues);
      return;
    }

    const fallbackText = resolveTranscriptEntryText(entry).replace(/\r?\n/g, ' ').trim();
    if (fallbackText.length === 0) {
      return;
    }
    const timing = resolveTranscriptEntryTimingSeconds(entry);
    cues.push({
      start: timing.start,
      end: timing.end,
      text: fallbackText,
    });
  });

  return cues;
}

function isRemoteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function getUrlExtension(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname || '';
    const extension = path.extname(pathname);
    return extension || undefined;
  } catch {
    return undefined;
  }
}

function getTempAssetPath(workDir: string, kind: string, source: string | undefined, extension?: string): string {
  const safeExtension = extension && extension.startsWith('.') ? extension : '.bin';
  const suffix = source ? path.basename(source).replace(/[^a-zA-Z0-9._-]+/g, '-') : `${kind}`;
  const fileName = `${kind}-${Date.now()}-${Math.random().toString(16).slice(2)}-${suffix}${safeExtension}`;
  return path.join(workDir, fileName);
}

async function downloadUrlToBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const requestUrl = new URL(url);
    const transport = requestUrl.protocol === 'https:' ? https : http;

    const request = transport.get(requestUrl, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        downloadUrlToBuffer(response.headers.location).then(resolve).catch(reject);
        return;
      }

      if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
        reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
        response.resume();
        return;
      }

      const chunks: Buffer[] = [];
      response.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      response.on('end', () => resolve(Buffer.concat(chunks)));
    });

    request.on('error', reject);
  });
}

async function writeBufferToTempFile(buffer: Buffer, workDir: string, kind: string, source?: string): Promise<string> {
  await fs.promises.mkdir(workDir, { recursive: true });
  const extension = source ? getUrlExtension(source) : undefined;
  const outputPath = getTempAssetPath(workDir, kind, source, extension);
  await fs.promises.writeFile(outputPath, buffer);
  return outputPath;
}

async function materializeInputAsset(
  input: string | Uint8Array | undefined,
  workDir: string,
  kind: string,
): Promise<string | undefined> {
  if (!input) {
    return undefined;
  }

  if (typeof input === 'string') {
    if (isRemoteUrl(input)) {
      const buffer = await downloadUrlToBuffer(input);
      return writeBufferToTempFile(buffer, workDir, kind, input);
    }

    const inputPath = path.resolve(input);
    if (fs.existsSync(inputPath)) {
      return inputPath;
    }
    if (fs.existsSync(input)) {
      return path.resolve(input);
    }
    return inputPath;
  }

  if (input instanceof Uint8Array) {
    return writeBufferToTempFile(Buffer.from(input), workDir, kind);
  }

  return undefined;
}

async function readInputText(
  input: string | Uint8Array | undefined,
  workDir?: string,
  kind = 'captions',
): Promise<{ content: string; extension?: string | undefined }> {
  if (typeof input === 'string') {
    if (isRemoteUrl(input)) {
      const buffer = await downloadUrlToBuffer(input);
      const extension = getUrlExtension(input);
      return { content: buffer.toString('utf8'), extension };
    }

    if (fs.existsSync(input)) {
      return {
        content: await fs.promises.readFile(input, 'utf8'),
        extension: path.extname(input).toLowerCase(),
      };
    }

    const resolvedPath = path.resolve(input);
    if (fs.existsSync(resolvedPath)) {
      return {
        content: await fs.promises.readFile(resolvedPath, 'utf8'),
        extension: path.extname(resolvedPath).toLowerCase(),
      };
    }

    return { content: input };
  }

  if (input instanceof Uint8Array) {
    return { content: Buffer.from(input).toString('utf8') };
  }

  return { content: '' };
}

function inferWordTiming(
  word: { start?: number; end?: number; text?: string },
  previousWord: { end?: number } | undefined,
  nextWord: { start?: number } | undefined,
  fallbackStart: number,
  fallbackEnd: number,
): { start: number; end: number } {
  const start = typeof word.start === 'number' ? word.start : fallbackStart;
  const end = typeof word.end === 'number' ? word.end : fallbackEnd;
  if (end > start) {
    return { start, end };
  }

  const previousEnd = typeof previousWord?.end === 'number' ? previousWord.end : undefined;
  const nextStart = typeof nextWord?.start === 'number' ? nextWord.start : undefined;
  const padding = 0.025;

  if (typeof previousEnd === 'number' && typeof nextStart === 'number' && nextStart > previousEnd) {
    const inferredStart = previousEnd + padding;
    const inferredEnd = nextStart - padding;
    return {
      start: inferredStart,
      end: inferredEnd > inferredStart ? inferredEnd : inferredStart + padding,
    };
  }

  if (typeof previousEnd === 'number') {
    const inferredStart = previousEnd + padding;
    return {
      start: inferredStart,
      end: inferredStart + padding,
    };
  }

  if (typeof nextStart === 'number') {
    const inferredEnd = Math.max(nextStart - padding, start);
    return {
      start: inferredEnd - padding,
      end: inferredEnd,
    };
  }

  if (!previousWord) {
    const inferredStart = Math.max(start - 0.085 * String(word.text ?? '').length, 0);
    return {
      start: inferredStart,
      end: inferredStart + 0.15,
    };
  }

  return {
    start,
    end: start + 0.15,
  };
}

function transcriptToWordTimestamps(transcript: TranscriptEntry[]): WordTimestamps {
  const words: string[] = [];
  const starts: number[] = [];
  const ends: number[] = [];
  const breakBefore: boolean[] = [];

  transcript.forEach((entry) => {
    if (entry.words && entry.words.length > 0) {
      let emittedInEntry = false;
      entry.words.forEach((word, index) => {
        const text = String(word.text ?? '').trim();
        if (!text) {
          return;
        }

        const previousWord = index > 0 ? entry.words?.[index - 1] : undefined;
        const nextWord = index < entry.words!.length - 1 ? entry.words?.[index + 1] : undefined;
        const { start, end } = inferWordTiming(word, previousWord, nextWord, entry.start, entry.end);

        words.push(text);
        starts.push(start);
        ends.push(end);
        breakBefore.push(
          (!emittedInEntry && /\r?\n/.test(String(word.text ?? ''))) ||
            (emittedInEntry && /\r?\n/.test(String(word.text ?? ''))),
        );
        emittedInEntry = true;
      });
      return;
    }

    const tokens = entry.text.split(/\r?\n/).flatMap((line, lineIndex) =>
      line
        .split(/\s+/)
        .filter(Boolean)
        .map((token, tokenIndex) => ({
          token,
          breakBefore: lineIndex > 0 && tokenIndex === 0,
        })),
    );
    if (tokens.length === 0) {
      return;
    }

    const duration = Math.max(entry.end - entry.start, 0.01);
    const perWordDuration = duration / tokens.length;
    tokens.forEach(({ token, breakBefore: tokenBreakBefore }, index) => {
      const start = entry.start + index * perWordDuration;
      const end = start + perWordDuration;
      words.push(token);
      starts.push(start);
      ends.push(end);
      breakBefore.push(tokenBreakBefore);
    });
  });

  return {
    words,
    word_start_times_seconds: starts,
    word_end_times_seconds: ends,
    break_before: breakBefore,
  };
}

async function resolveCaptionPreset(source: RenderSpec['preset']): Promise<EcsCaptionPreset> {
  return loadEcsCaptionPreset(source);
}

function resolveCaptionHoldThresholdSeconds(
  captionPreset: EcsCaptionPreset,
  settings: RenderSettings | undefined,
): number {
  const value =
    settings?.timing?.captionHoldThresholdSeconds ??
    captionPreset.timing?.captionHoldThresholdSeconds ??
    DEFAULT_CAPTION_HOLD_THRESHOLD_SECONDS;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      'renders[].settings.timing.captionHoldThresholdSeconds must be a finite number greater than or equal to zero.',
    );
  }
  return value;
}

type CaptionGenerationResult = EcsPipelineOutput;
type VideoMetadata = Awaited<ReturnType<typeof probeVideoMetadata>>;

interface PreparedCaptionOutputFrames {
  generation: CaptionGenerationResult;
  allImageBuffers: Buffer[];
  size: CanvasSize;
}

interface OverlayRenderContext {
  workDir: string;
  videoFilePath: string;
  inputAudioPath: string | undefined;
  videoMetadata: VideoMetadata;
  videoResolution: CanvasSize;
  outputFps: number;
  outputFrameCount: number | undefined;
}

interface SharedOverlayGeneration {
  generation: CaptionGenerationResult;
  canvasSize: CanvasSize;
}

/**
 * Generate caption frames through the ECS pipeline.
 */
async function generateCaptionFrames(params: {
  videoResolution: { width: number; height: number };
  timestamps: WordTimestamps;
  captionPreset: EcsCaptionPreset;
  settings: RenderSettings | undefined;
  language: string | undefined;
  outputDir: string;
  fps: number;
  captionScale: number;
  longWordThreshold: number;
  writeToDiskForDebug: boolean;
  debug?: RenderDebugConfig;
  collectBlendModeLayers: boolean;
}): Promise<CaptionGenerationResult> {
  const result = await generateSubtitleImagesEcs({
    videoResolution: params.videoResolution,
    timestamps: params.timestamps,
    design: params.captionPreset.design,
    stateWindow: params.captionPreset.stateWindow,
    captionLayout: mergeCaptionLayoutPolicy(params.captionPreset.captionLayout, params.settings?.captionLayout),
    fps: params.fps,
    ...(params.language === undefined ? {} : { language: params.language }),
    captionScale: params.captionScale,
    captionHoldThresholdSeconds: resolveCaptionHoldThresholdSeconds(params.captionPreset, params.settings),
    longWordThreshold: params.longWordThreshold,
    debug: params.debug !== undefined,
    collectBlendModeLayers: params.collectBlendModeLayers,
  });
  if (params.debug && result.debugLayout) {
    result.allImageBuffers = drawCaptionDebugOverlays({
      allImageBuffers: result.allImageBuffers,
      frameSize: result.frameSize,
      debugLayout: result.debugLayout,
      debug: params.debug,
    });
  }
  if (params.writeToDiskForDebug && params.outputDir) {
    await writeCaptionFramesAsPngSequence({
      allImageBuffers: result.allImageBuffers,
      frameSize: result.frameSize,
      outputDir: params.outputDir,
    });
  }
  return result;
}

function prepareCaptionOutputFrames(generation: CaptionGenerationResult): PreparedCaptionOutputFrames {
  return {
    generation,
    allImageBuffers: generation.allImageBuffers,
    size: generation.frameSize,
  };
}

function getTranscriptDuration(transcript: TranscriptEntry[]): number {
  return Math.max(
    1,
    transcript.reduce((duration, entry) => Math.max(duration, entry.end), 0),
  );
}

function resolveCanvasSize(size: CanvasSize | undefined, fieldName: string, fallbackSize?: CanvasSize): CanvasSize {
  const resolvedSize = size ?? fallbackSize;
  if (!resolvedSize) {
    throw new Error(`${fieldName} is required when input.video is not provided.`);
  }
  if (
    !Number.isInteger(resolvedSize.width) ||
    !Number.isInteger(resolvedSize.height) ||
    resolvedSize.width <= 0 ||
    resolvedSize.height <= 0
  ) {
    throw new Error(`${fieldName} must contain positive integer width and height values.`);
  }
  return resolvedSize;
}

function hasMissingCaptionCanvasSize(render: RenderSpec): boolean {
  return Boolean(
    render.outputs &&
      (render.outputs.pngSequence || render.outputs.standaloneCaptionMovie) &&
      render.canvasSize === undefined,
  );
}

function hasSameCanvasSize(first: CanvasSize, second: CanvasSize): boolean {
  return first.width === second.width && first.height === second.height;
}

function hasDebugSettings(debug: RenderDebugConfig | undefined): debug is RenderDebugConfig {
  return Boolean(debug && Object.values(debug).some(Boolean));
}

function resolveStandaloneRenderFps(fps: number | undefined): number {
  const resolvedFps = fps ?? 30;
  if (!Number.isFinite(resolvedFps) || resolvedFps <= 0) {
    throw new Error('renders[].fps must be a finite number greater than zero.');
  }
  return resolvedFps;
}

async function writeTranscriptFile(
  transcript: TranscriptEntry[],
  outputPath: string,
  format: 'ass' | 'srt' | 'vtt' | 'json',
): Promise<string> {
  const resolvedPath = toFsPath(outputPath);
  const directory = path.dirname(resolvedPath);
  await fs.promises.mkdir(directory, { recursive: true });

  let content: string;
  switch (format) {
    case 'ass':
      content = buildAssContent(transcript);
      break;
    case 'srt':
      content = buildSrtContent(transcript);
      break;
    case 'vtt':
      content = buildVttContent(transcript);
      break;
    case 'json':
    default:
      content = JSON.stringify(
        {
          metadata: PROJECT_CAPTION_METADATA,
          transcript,
        },
        null,
        2,
      );
      break;
  }

  await fs.promises.writeFile(resolvedPath, content, 'utf8');
  return resolvedPath;
}

async function loadTranscriptFromCaptions(captions: string | Uint8Array | undefined): Promise<TranscriptEntry[]> {
  if (!captions) {
    return [];
  }

  const { content, extension } = await readInputText(captions);
  return parseTranscriptContent(content, extension);
}

function parseTranscriptContent(content: string, extension?: string): TranscriptEntry[] {
  const trimmed = content.trim();
  if (extension === '.json' || (extension === undefined && trimmed.startsWith('['))) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed as TranscriptEntry[];
      }
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.transcript)) {
        return parsed.transcript as TranscriptEntry[];
      }
    } catch {
      // fall through
    }
  }

  if (extension === '.ass' || extension === '.ssa' || trimmed.startsWith('[Script Info]')) {
    return parseAssTranscript(trimmed);
  }

  if (extension === '.vtt' || trimmed.startsWith('WEBVTT')) {
    return parseSrtTranscript(trimmed);
  }

  if (extension === '.srt' || /-->/.test(trimmed)) {
    return parseSrtTranscript(trimmed);
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed as TranscriptEntry[];
    }
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.transcript)) {
      return parsed.transcript as TranscriptEntry[];
    }
  } catch {
    // ignore
  }

  throw new Error('Unable to parse captions content. Supported formats: json, srt, vtt, ass.');
}

function parseSrtTranscript(content: string): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  const blocks = content.split(/\r?\n\r?\n/);

  for (const block of blocks) {
    const lines = block.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) {
      continue;
    }

    const timeMatch = lines[1].match(/(\d{1,2}:\d{2}:\d{2}[\.,]\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[\.,]\d{3})/);
    if (!timeMatch) {
      continue;
    }

    const start = parseTimecode(timeMatch[1]);
    const end = parseTimecode(timeMatch[2]);
    const text = lines.slice(2).join('\n').trim();

    entries.push({ text, start, end });
  }

  return entries;
}

function parseAssTranscript(content: string): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  const lines = content.split(/\r?\n/);
  let eventFormatIndex: Record<string, number> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('Format:')) {
      const columns = trimmed
        .slice('Format:'.length)
        .split(',')
        .map((col) => col.trim().toLowerCase());
      eventFormatIndex = columns.reduce<Record<string, number>>((acc, column, index) => {
        acc[column] = index;
        return acc;
      }, {});
      continue;
    }

    if (!trimmed.startsWith('Dialogue:') || !eventFormatIndex) {
      continue;
    }

    const contentLine = trimmed.slice('Dialogue:'.length).trim();
    const parts = contentLine.split(',');
    if (parts.length < 10) {
      continue;
    }

    const text = cleanAssText(parts.slice(9).join(','));
    const start = parseAssTimecode(parts[1]?.trim() ?? '0:00:00.00');
    const end = parseAssTimecode(parts[2]?.trim() ?? '0:00:00.00');

    entries.push({ text, start, end });
  }

  return entries;
}

function parseTimecode(value: string): number {
  const normalized = value.replace(',', '.');
  const parts = normalized.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return Number(normalized) || 0;
}

function parseAssTimecode(value: string): number {
  const normalized = value.replace(',', '.').trim();
  const match = normalized.match(/^(\d+):(\d{2}):(\d{2})(?:\.(\d+))?$/);
  if (!match) {
    return 0;
  }
  const [, hours, minutes, seconds, centiseconds = '0'] = match;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(centiseconds) / 100;
}

function cleanAssText(text: string): string {
  return text
    .replace(/\{[^}]*\}/g, '')
    .replace(/\\N/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\h/g, ' ')
    .replace(/\\[ibu]/g, '')
    .trim();
}

export class captioncatCaptionEngine extends DefaultCaptionEngine {
  constructor(
    options: captioncatCaptionEngineOptions = {},
    config: RenderRequest = createDefaultConfig(),
    registry: ProviderRegistry = createProviderRegistry(),
  ) {
    super(config, registry);
    this.options = options;
  }

  private readonly options: captioncatCaptionEngineOptions;

  override async render(request: RenderRequest): Promise<RenderResult> {
    const effectiveConfig = this.resolveConfig(request);

    if (!request.exports && !request.renders) {
      throw new Error('Render request must include exports or renders.');
    }

    return this.renderOutputs(request, effectiveConfig);
  }

  override async transcribe(input: string, providers?: TranscriptionProvider[]): Promise<TranscriptEntry[]> {
    const effectiveProviders = providers ?? this.config.transcription?.providers ?? [];
    const debugOutputDir = this.options.tempDir
      ? path.resolve(this.options.tempDir)
      : path.join(os.tmpdir(), DEFAULT_TEMP_DIRECTORY_NAME);
    const providersWithDebug = effectiveProviders.map((p) => ({
      ...p,
      options: {
        ...(p.options ?? {}),
        debug: Boolean(this.options.debug),
        debugOutputDir,
      },
    }));
    return super.transcribe(input, providersWithDebug);
  }

  private getTranscriptionAudioMaxBytes(): number {
    return this.options.transcriptionAudioMaxBytes ?? DEFAULT_TRANSCRIPTION_AUDIO_MAX_BYTES;
  }

  private getTranscriptionAudioBitrate(): string {
    return this.options.transcriptionAudioBitrate ?? DEFAULT_TRANSCRIPTION_AUDIO_BITRATE;
  }

  private async prepareAudioForTranscription(
    inputPath: string,
    workDir: string,
    forceCompress: boolean,
  ): Promise<string> {
    const resolvedInputPath = path.resolve(inputPath);
    const shouldCompress =
      forceCompress || (await isFileLargerThan(resolvedInputPath, this.getTranscriptionAudioMaxBytes()));

    if (!shouldCompress) {
      return resolvedInputPath;
    }

    const compressedPath = getTranscriptionAudioPath(workDir);
    await compressAudioForTranscription(resolvedInputPath, compressedPath, this.getTranscriptionAudioBitrate());
    return compressedPath;
  }

  private async renderOutputs(request: RenderRequest, config: RenderRequest): Promise<RenderResult> {
    const transcript = await this.resolveTranscript(request, config);
    const result: RenderResult = {};

    if (request.exports?.transcript?.json) {
      const outputPath = path.resolve(request.exports.transcript.json);
      await writeTranscriptFile(transcript, outputPath, 'json');
      result.transcript = { json: outputPath };
    }

    if (request.exports?.captions) {
      const captions: NonNullable<RenderResult['captions']> = {};
      for (const format of ['ass', 'srt', 'vtt'] as const) {
        const outputPath = request.exports.captions[format];
        if (!outputPath) continue;
        const resolvedOutputPath = path.resolve(outputPath);
        await writeTranscriptFile(transcript, resolvedOutputPath, format);
        captions[format] = resolvedOutputPath;
      }
      if (Object.keys(captions).length > 0) {
        result.captions = captions;
      }
    }

    const inputVideoResolution = await this.resolveInputVideoResolution(request);
    const rendered = [];
    for (const render of request.renders ?? []) {
      rendered.push({
        preset: render.preset,
        outputs: await this.renderSpec(request, config, render, transcript, inputVideoResolution),
      });
    }
    if (rendered.length > 0) {
      result.renders = rendered;
    }

    return result;
  }

  private async resolveInputVideoResolution(request: RenderRequest): Promise<CanvasSize | undefined> {
    if (!request.input?.video || !(request.renders ?? []).some(hasMissingCaptionCanvasSize)) {
      return undefined;
    }

    const workDir = await this.createRenderWorkDir('video-probe');
    try {
      const inputPath = await materializeInputAsset(request.input.video, workDir, 'video');
      const videoFilePath = inputPath ?? String(request.input.video);
      const metadata = await probeVideoMetadata(videoFilePath);
      return {
        width: metadata.width,
        height: metadata.height,
      };
    } finally {
      await fs.promises.rm(workDir, { recursive: true, force: true });
    }
  }

  private async renderSpec(
    request: RenderRequest,
    config: RenderRequest,
    render: RenderSpec,
    transcript: TranscriptEntry[],
    inputVideoResolution: CanvasSize | undefined,
  ): Promise<RenderedVisualOutputs> {
    const outputNames = render.outputs ? Object.keys(render.outputs) : [];
    const unsupportedOutputNames = outputNames.filter(
      (name) => name !== 'pngSequence' && name !== 'standaloneCaptionMovie' && name !== 'overlayVideo',
    );
    if (unsupportedOutputNames.length > 0) {
      throw new Error(
        `Render "${render.preset}" contains unsupported visual outputs: ${unsupportedOutputNames.join(
          ', ',
        )}. Use pngSequence, standaloneCaptionMovie, or overlayVideo.`,
      );
    }
    if (outputNames.length === 0) {
      throw new Error(`Render "${render.preset}" must request at least one visual output.`);
    }
    const captionPreset = await resolveCaptionPreset(render.preset);
    const result: RenderedVisualOutputs = {};
    const overlayContext = render.outputs.overlayVideo
      ? await this.prepareOverlayRenderContext(request, render)
      : undefined;

    try {
      const sharedOverlayGeneration = overlayContext
        ? await this.generateSharedOverlayFrames(
            config,
            render,
            captionPreset,
            transcript,
            overlayContext,
            inputVideoResolution,
          )
        : undefined;

      if (render.outputs.pngSequence || render.outputs.standaloneCaptionMovie) {
        Object.assign(
          result,
          await this.renderCaptionOutputs(
            config,
            render,
            captionPreset,
            transcript,
            inputVideoResolution,
            sharedOverlayGeneration,
          ),
        );
      }
      if (render.outputs.overlayVideo && overlayContext) {
        result.overlayVideo = await this.renderOverlayOutput(
          request,
          config,
          render,
          captionPreset,
          transcript,
          overlayContext,
          sharedOverlayGeneration,
        );
      }
      return result;
    } finally {
      if (overlayContext) {
        await this.removeRenderWorkDir(overlayContext.workDir);
      }
    }
  }

  private async renderCaptionOutputs(
    config: RenderRequest,
    render: RenderSpec,
    captionPreset: EcsCaptionPreset,
    transcript: TranscriptEntry[],
    inputVideoResolution: CanvasSize | undefined,
    sharedOverlayGeneration?: SharedOverlayGeneration,
  ): Promise<Pick<RenderedVisualOutputs, 'pngSequence' | 'standaloneCaptionMovie'>> {
    const pngOutput = render.outputs.pngSequence;
    const standaloneCaptionMovieOutput = render.outputs.standaloneCaptionMovie;
    const canvasSize = resolveCanvasSize(render.canvasSize, 'renders[].canvasSize', inputVideoResolution);
    const pngPlan = pngOutput
      ? {
          output: pngOutput,
        }
      : undefined;
    const standaloneCaptionMoviePlan = standaloneCaptionMovieOutput
      ? {
          output: standaloneCaptionMovieOutput,
        }
      : undefined;
    const fps = resolveStandaloneRenderFps(render.fps);
    const workDir = await this.createRenderWorkDir('caption-outputs');
    const result: Pick<RenderedVisualOutputs, 'pngSequence' | 'standaloneCaptionMovie'> = {};

    try {
      let pngFrames: PreparedCaptionOutputFrames | undefined;
      let standaloneCaptionMovieFrames: PreparedCaptionOutputFrames | undefined;

      if (sharedOverlayGeneration) {
        if (hasSameCanvasSize(canvasSize, sharedOverlayGeneration.canvasSize)) {
          const preparedFrames = prepareCaptionOutputFrames(sharedOverlayGeneration.generation);
          if (pngPlan) pngFrames = preparedFrames;
          if (standaloneCaptionMoviePlan) standaloneCaptionMovieFrames = preparedFrames;
        }
      }

      const pendingPngPlan = pngPlan && !pngFrames ? pngPlan : undefined;
      const pendingStandaloneCaptionMoviePlan =
        standaloneCaptionMoviePlan && !standaloneCaptionMovieFrames
          ? standaloneCaptionMoviePlan
          : undefined;
      const sharedCanvasSize = pendingPngPlan && pendingStandaloneCaptionMoviePlan ? canvasSize : undefined;

      if (pendingPngPlan && pendingStandaloneCaptionMoviePlan && sharedCanvasSize) {
        const generation = await this.generateCaptionOutputFrames(
          transcript,
          captionPreset,
          render,
          sharedCanvasSize,
          path.join(workDir, 'shared'),
          config,
          fps,
        );
        const preparedFrames = prepareCaptionOutputFrames(generation);
        pngFrames = preparedFrames;
        standaloneCaptionMovieFrames = preparedFrames;
      } else {
        if (pendingPngPlan) {
          const generation = await this.generateCaptionOutputFrames(
            transcript,
            captionPreset,
            render,
            canvasSize,
            path.join(workDir, 'png'),
            config,
            fps,
          );
          pngFrames = prepareCaptionOutputFrames(generation);
        }

        if (pendingStandaloneCaptionMoviePlan) {
          const generation = await this.generateCaptionOutputFrames(
            transcript,
            captionPreset,
            render,
            canvasSize,
            path.join(workDir, 'standalone-caption-movie'),
            config,
            fps,
          );
          standaloneCaptionMovieFrames = prepareCaptionOutputFrames(generation);
        }
      }

      if (pngPlan && pngFrames) {
        const outputDirectory = path.resolve(pngPlan.output.directory);
        await writeCaptionFramesAsPngSequence({
          allImageBuffers: pngFrames.allImageBuffers,
          frameSize: pngFrames.size,
          outputDir: outputDirectory,
        });
        result.pngSequence = { directory: outputDirectory };
      }

      if (standaloneCaptionMoviePlan && standaloneCaptionMovieFrames) {
        const outputPath = path.resolve(standaloneCaptionMoviePlan.output.path);
        const temporaryStandaloneCaptionMovie = await createStandaloneCaptionMovie({
          captionInfos: standaloneCaptionMovieFrames.generation.captionInfos,
          allImageBuffers: standaloneCaptionMovieFrames.allImageBuffers,
          videoResolution: standaloneCaptionMovieFrames.size,
          captionFrameSize: standaloneCaptionMovieFrames.size,
          outputDir: path.join(workDir, 'standalone-caption-movie'),
          fps,
          writeCaptionInfos: Boolean(this.options.debug),
          captionHoldThresholdSeconds: resolveCaptionHoldThresholdSeconds(captionPreset, render.settings),
        });
        await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.promises.copyFile(temporaryStandaloneCaptionMovie.outputPath, outputPath);
        result.standaloneCaptionMovie = { path: outputPath };
      }

      return result;
    } finally {
      await this.removeRenderWorkDir(workDir);
    }
  }

  private async generateCaptionOutputFrames(
    transcript: TranscriptEntry[],
    captionPreset: EcsCaptionPreset,
    render: RenderSpec,
    size: CanvasSize,
    workDir: string,
    config: RenderRequest,
    fps: number,
  ): Promise<CaptionGenerationResult> {
    return this.generateRenderFrames(
      transcript,
      captionPreset,
      render,
      size,
      workDir,
      config,
      config.debug,
      false,
      fps,
    );
  }

  private async prepareOverlayRenderContext(request: RenderRequest, render: RenderSpec): Promise<OverlayRenderContext> {
    if (!request.input?.video) {
      throw new Error('Overlay video output requires input.video.');
    }

    const output = render.outputs.overlayVideo;
    if (!output) {
      throw new Error('Overlay video output is not configured.');
    }

    const workDir = await this.createRenderWorkDir('overlay');
    try {
      const inputPath = await materializeInputAsset(request.input.video, workDir, 'video');
      const videoFilePath = inputPath ?? String(request.input.video);
      const inputAudioPath = request.input.audio
        ? await materializeInputAsset(request.input.audio, workDir, 'audio')
        : undefined;
      const videoMetadata = await probeVideoMetadata(videoFilePath);
      const videoResolution = {
        width: videoMetadata.width,
        height: videoMetadata.height,
      };
      const outputFps = resolveVideoRenderFps(render.fps, videoMetadata.fps);
      const outputFrameCount = resolveVideoOutputFrameCount(videoMetadata, outputFps, render.fps !== undefined);

      return {
        workDir,
        videoFilePath,
        inputAudioPath,
        videoMetadata,
        videoResolution,
        outputFps,
        outputFrameCount,
      };
    } catch (error) {
      await this.removeRenderWorkDir(workDir);
      throw error;
    }
  }

  private async generateSharedOverlayFrames(
    config: RenderRequest,
    render: RenderSpec,
    captionPreset: EcsCaptionPreset,
    transcript: TranscriptEntry[],
    overlayContext: OverlayRenderContext,
    inputVideoResolution: CanvasSize | undefined,
  ): Promise<SharedOverlayGeneration | undefined> {
    const pngOutput = render.outputs.pngSequence;
    const standaloneCaptionMovieOutput = render.outputs.standaloneCaptionMovie;
    if (!pngOutput && !standaloneCaptionMovieOutput) {
      return undefined;
    }

    const canvasSize =
      render.canvasSize ??
      inputVideoResolution ??
      overlayContext.videoResolution;
    const captionFps = resolveStandaloneRenderFps(render.fps);
    const canShare =
      captionFps === overlayContext.outputFps &&
      hasSameCanvasSize(canvasSize, overlayContext.videoResolution);

    if (!canShare) {
      return undefined;
    }

    return {
      generation: await this.generateRenderFrames(
        transcript,
        captionPreset,
        render,
        overlayContext.videoResolution,
        path.join(overlayContext.workDir, 'shared'),
        config,
        config.debug,
        true,
        overlayContext.outputFps,
      ),
      canvasSize: overlayContext.videoResolution,
    };
  }

  private async renderOverlayOutput(
    request: RenderRequest,
    config: RenderRequest,
    render: RenderSpec,
    captionPreset: EcsCaptionPreset,
    transcript: TranscriptEntry[],
    overlayContext: OverlayRenderContext,
    sharedGeneration?: SharedOverlayGeneration,
  ): Promise<{ path: string }> {
    if (!request.input?.video) {
      throw new Error('Overlay video output requires input.video.');
    }

    const output = render.outputs.overlayVideo;
    if (!output) {
      throw new Error('Overlay video output is not configured.');
    }

    const outputPath = path.resolve(output.path);
    const {
      workDir,
      videoFilePath,
      inputAudioPath,
      videoMetadata,
      videoResolution,
      outputFps,
      outputFrameCount,
    } = overlayContext;
    const generation =
      sharedGeneration?.generation ??
      (await this.generateRenderFrames(
        transcript,
        captionPreset,
        render,
        videoResolution,
        workDir,
        config,
        config.debug,
        true,
        outputFps,
      ));
    const videoEncodeSettings = resolveVideoEncodeSettings(output.encoding, {
      videoCodec: videoMetadata.videoCodec,
      pixFmt: videoMetadata.pixFmt,
      colorSpace: videoMetadata.colorSpace,
      colorPrimaries: videoMetadata.colorPrimaries,
      colorTransfer: videoMetadata.colorTransfer,
    });
    const compositionAreaMovie = await createCompositionAreaOverlayMovie({
      imageBuffer: generation.compositionAreaImage,
      outputDir: workDir,
      durationSeconds: videoMetadata.duration ?? getTranscriptDuration(transcript),
      fps: outputFps,
    });
    const canUseNodeCompositing =
      (output.pipeline ?? 'ffmpeg-compositor') === 'skia-compositor' &&
      !generation.videoTransform &&
      typeof videoMetadata.fps === 'number' &&
      Number.isFinite(videoMetadata.fps) &&
      videoMetadata.fps > 0;

    if (canUseNodeCompositing) {
      await renderOverlayVideoNodeComposite({
        inputPath: videoFilePath,
        outputPath,
        videoResolution,
        captionFps: outputFps,
        captionInfos: generation.captionInfos,
        allImageBuffers: generation.allImageBuffers,
        allBlendModeLayers: generation.allBlendModeLayers,
        captionFrameSize: generation.frameSize,
        captionHoldThresholdSeconds: resolveCaptionHoldThresholdSeconds(captionPreset, render.settings),
        placement: generation.placement,
        compositionAreaImage: generation.compositionAreaImage,
        inputAudioPath,
        ...(videoMetadata.duration !== undefined ? { durationSeconds: videoMetadata.duration } : {}),
        ...(outputFrameCount !== undefined ? { outputFrameCount } : {}),
        outputFps,
        ...(videoMetadata.formatTags ? { sourceMetadata: videoMetadata.formatTags } : {}),
        videoEncodeSettings,
      });
    } else {
      await renderOverlayVideoViaRawFramePipe({
        inputPath: videoFilePath,
        outputPath,
        videoResolution,
        captionInfos: generation.captionInfos,
        allImageBuffers: generation.allImageBuffers,
        allBlendModeLayers: generation.allBlendModeLayers,
        captionFrameSize: generation.frameSize,
        fps: outputFps,
        captionHoldThresholdSeconds: resolveCaptionHoldThresholdSeconds(captionPreset, render.settings),
        ...(inputAudioPath !== undefined ? { inputAudioPath } : {}),
        verticalAlignment: generation.placement.verticalAlignment,
        horizontalAlignment: generation.placement.horizontalAlignment,
        xOffset: generation.placement.xOffset,
        yOffset: generation.placement.yOffset,
        useSafeArea: generation.placement.useSafeArea,
        ...(compositionAreaMovie?.outputPath !== undefined
          ? { compositionAreaPath: compositionAreaMovie.outputPath }
          : {}),
        ...(generation.videoTransform !== undefined ? { videoTransform: generation.videoTransform } : {}),
        ...(videoMetadata.duration !== undefined ? { durationSeconds: videoMetadata.duration } : {}),
        ...(videoMetadata.videoDuration !== undefined ? { videoDurationSeconds: videoMetadata.videoDuration } : {}),
        ...(outputFrameCount !== undefined ? { outputFrameCount } : {}),
        ...(videoMetadata.fps !== undefined ? { inputFps: videoMetadata.fps } : {}),
        outputFps,
        ...(videoMetadata.formatTags ? { sourceMetadata: videoMetadata.formatTags } : {}),
        videoEncodeSettings,
      });
    }
    return { path: outputPath };
  }

  private async generateRenderFrames(
    transcript: TranscriptEntry[],
    captionPreset: EcsCaptionPreset,
    render: RenderSpec,
    videoResolution: CanvasSize,
    workDir: string,
    config: RenderRequest,
    debug: RenderDebugConfig | undefined,
    collectBlendModeLayers: boolean,
    fps = resolveStandaloneRenderFps(render.fps),
  ): Promise<CaptionGenerationResult> {
    return generateCaptionFrames({
      videoResolution,
      timestamps: transcriptToWordTimestamps(transcript),
      captionPreset,
      settings: render.settings,
      language: render.language ?? config.transcription?.providers?.find((provider) => provider.language)?.language,
      outputDir: workDir,
      fps,
      captionScale: 1,
      longWordThreshold: LONG_WORD_THRESHOLD,
      writeToDiskForDebug: Boolean(this.options.debug || hasDebugSettings(debug)),
      ...(hasDebugSettings(debug) ? { debug } : {}),
      collectBlendModeLayers,
    });
  }

  private async createRenderWorkDir(name: string): Promise<string> {
    const tempRoot = this.options.tempDir
      ? path.resolve(this.options.tempDir)
      : path.join(os.tmpdir(), DEFAULT_TEMP_DIRECTORY_NAME);
    const workDir = path.join(tempRoot, `render-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    await fs.promises.mkdir(workDir, { recursive: true });
    return workDir;
  }

  private async removeRenderWorkDir(workDir: string): Promise<void> {
    if (!this.options.debug) {
      await fs.promises.rm(workDir, { recursive: true, force: true });
    }
  }

  private async resolveTranscript(request: RenderRequest, config: RenderRequest): Promise<TranscriptEntry[]> {
    const transcript = request.input?.transcript ?? [];
    if (transcript.length > 0) {
      return transcript;
    }

    if (request.input?.captions) {
      return loadTranscriptFromCaptions(request.input.captions);
    }

    if (request.input?.video) {
      const tempRoot = this.options.tempDir
        ? path.resolve(this.options.tempDir)
        : path.join(os.tmpdir(), DEFAULT_TEMP_DIRECTORY_NAME);
      const workDir = path.join(tempRoot, `run-${Date.now()}`);
      await fs.promises.mkdir(workDir, { recursive: true });

      try {
        const inputPath = await materializeInputAsset(request.input.video, workDir, 'video');
        const videoFilePath = inputPath ?? String(request.input.video);
        const inputAudioPath = request.input.audio
          ? await materializeInputAsset(request.input.audio, workDir, 'audio')
          : undefined;
        const transcriptionAudioPath = inputAudioPath
          ? await this.prepareAudioForTranscription(inputAudioPath, workDir, false)
          : getTranscriptionAudioPath(workDir);

        if (!inputAudioPath) {
          await extractAudio(videoFilePath, transcriptionAudioPath, this.getTranscriptionAudioBitrate());
        }

        const providerList = request.transcription?.providers ?? config.transcription?.providers ?? [];
        return this.transcribe(transcriptionAudioPath, providerList);
      } finally {
        if (!this.options.debug) {
          await fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
        }
      }
    }

    if (request.input?.audio) {
      const tempRoot = this.options.tempDir
        ? path.resolve(this.options.tempDir)
        : path.join(os.tmpdir(), DEFAULT_TEMP_DIRECTORY_NAME);
      const workDir = path.join(tempRoot, `run-${Date.now()}`);
      await fs.promises.mkdir(workDir, { recursive: true });

      try {
        const inputPath = await materializeInputAsset(request.input.audio, workDir, 'audio');
        const audioPath = await this.prepareAudioForTranscription(
          inputPath ?? String(request.input.audio),
          workDir,
          false,
        );
        const providerList = request.transcription?.providers ?? config.transcription?.providers ?? [];
        return this.transcribe(audioPath, providerList);
      } finally {
        if (!this.options.debug) {
          await fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
        }
      }
    }

    throw new Error(
      'No transcript available for rendering. Provide request.input.transcript, request.input.captions, request.input.video, or request.input.audio.',
    );
  }

  private resolveConfig(config?: RenderRequest): RenderRequest {
    const resolvedConfig = createDefaultConfig(this.config);
    if (!config) {
      return resolvedConfig;
    }

    return {
      ...resolvedConfig,
      ...config,
      transcription: {
        ...resolvedConfig.transcription,
        ...config.transcription,
      },
    };
  }
}

export function createCaptionCat(
  options: captioncatCaptionEngineOptions = {},
  config?: RenderRequest,
): captioncatCaptionEngine {
  return new captioncatCaptionEngine(options, config);
}

function getTranscriptionAudioPath(workDir: string): string {
  return path.join(workDir, `transcription-audio-${Date.now()}-${Math.random().toString(16).slice(2)}.m4a`);
}

async function isFileLargerThan(filePath: string, maxBytes: number): Promise<boolean> {
  const fileStats = await fs.promises.stat(filePath);
  return fileStats.size > maxBytes;
}

async function compressAudioForTranscription(inputPath: string, outputPath: string, bitrate: string): Promise<void> {
  await runFfmpeg([
    '-y',
    '-i',
    inputPath,
    '-vn',
    '-ac',
    String(DEFAULT_TRANSCRIPTION_AUDIO_CHANNELS),
    '-ar',
    String(DEFAULT_TRANSCRIPTION_AUDIO_SAMPLE_RATE),
    '-c:a',
    'aac',
    '-b:a',
    bitrate,
    outputPath,
  ]);
}

async function extractAudio(inputPath: string, outputPath: string, bitrate: string): Promise<void> {
  await compressAudioForTranscription(inputPath, outputPath, bitrate);
}
