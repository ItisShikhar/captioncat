import type { CaptionFrameSize } from './render-types';
import type { BlendModeLayerSegment } from './render-utilities';
import { writeToStdin } from '../utilities/ffmpeg-runner';
import type { BlendMode } from './entity-system/effects/blend-mode';
import type { EcsPipelineBlendModeLayer } from './entity-system/pipeline';

export interface FfmpegBlendModeStream {
  width: number;
  height: number;
  modes: readonly BlendMode[];
  modeCodes: ReadonlyMap<BlendMode, number>;
  blankBuffer: Buffer;
  inputIndex: number;
  pipeIndex?: number;
  inputPipePosition: number;
  modeInputIndex?: number;
  modePipeIndex?: number;
  modePipePosition?: number;
}

const FFMPEG_BLEND_MODE_NAMES: Readonly<Record<BlendMode, string>> = {
  normal: 'normal',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  'soft-light': 'softlight',
  'hard-light': 'hardlight',
  darken: 'darken',
  lighten: 'lighten',
  difference: 'difference',
  exclusion: 'exclusion',
};

function formatFfmpegNumber(value: number): string {
  return Number.isFinite(value) && value > 0 ? String(Number(value.toFixed(6))) : '0';
}

function uniqueBlendModesForSlot(
  allBlendModeLayers: readonly EcsPipelineBlendModeLayer[][],
  slot: number,
): BlendMode[] {
  const modes = new Set<BlendMode>();
  for (const layers of allBlendModeLayers) {
    const layer = layers[slot];
    if (layer) modes.add(layer.mode);
  }
  return [...modes];
}

export function buildFfmpegBlendModeStreams({
  allBlendModeLayers,
  frameSize,
}: {
  allBlendModeLayers: readonly EcsPipelineBlendModeLayer[][];
  frameSize: CaptionFrameSize;
}): FfmpegBlendModeStream[] {
  const layerCount = allBlendModeLayers.reduce((maximum, layers) => Math.max(maximum, layers.length), 0);
  const streams: FfmpegBlendModeStream[] = [];

  for (let slot = 0; slot < layerCount; slot += 1) {
    const firstLayer = allBlendModeLayers
      .map((layers) => layers[slot])
      .find((layer): layer is EcsPipelineBlendModeLayer => layer !== undefined);
    const width = firstLayer?.width ?? frameSize.width;
    const height = firstLayer?.height ?? frameSize.height;
    for (const layers of allBlendModeLayers) {
      const layer = layers[slot];
      if (layer && (layer.width !== width || layer.height !== height)) {
        throw new Error('FFmpeg blend-mode layers must keep a constant frame size.');
      }
    }

    const modes = uniqueBlendModesForSlot(allBlendModeLayers, slot);
    if (modes.length === 0) modes.push('normal');
    const modeCodes = new Map<BlendMode, number>(modes.map((mode, index) => [mode, index + 1]));
    streams.push({
      width,
      height,
      modes,
      modeCodes,
      blankBuffer: Buffer.alloc(width * height * 4),
      inputIndex: -1,
      inputPipePosition: -1,
    });
  }

  return streams;
}

export function appendFfmpegBlendModeLayers(
  filters: string[],
  currentVideo: string,
  streams: readonly FfmpegBlendModeStream[],
  videoResolution: { width: number; height: number },
  frameRate: number,
  xExpr: string,
  yExpr: string,
): string {
  let output = currentVideo;
  for (let index = 0; index < streams.length; index += 1) {
    const stream = streams[index];
    const placedLayer = appendPlacedBlendModeLayer(
      filters,
      stream,
      index,
      videoResolution,
      frameRate,
      xExpr,
      yExpr,
    );
    output =
      stream.modes.length > 1
        ? appendDynamicBlendModeLayer(filters, output, placedLayer, stream, index, videoResolution)
        : appendStaticBlendModeLayer(filters, output, placedLayer, stream, index);
  }
  return output;
}

function appendPlacedBlendModeLayer(
  filters: string[],
  stream: FfmpegBlendModeStream,
  streamIndex: number,
  videoResolution: { width: number; height: number },
  frameRate: number,
  xExpr: string,
  yExpr: string,
): string {
  const baseLabel = `[ffmpeg-blend-${streamIndex}-placement-base]`;
  const rawLabel = `[ffmpeg-blend-${streamIndex}-raw]`;
  const placedLabel = `[ffmpeg-blend-${streamIndex}-placed]`;
  filters.push(
    `color=c=black@0.0:s=${videoResolution.width}x${videoResolution.height}:r=${formatFfmpegNumber(frameRate)},format=rgba${baseLabel}`,
  );
  filters.push(`[${stream.inputIndex}:v]format=rgba${rawLabel}`);
  filters.push(
    `${baseLabel}${rawLabel}overlay=x=${xExpr}:y=${yExpr}:eof_action=pass:repeatlast=0:format=auto${placedLabel}`,
  );
  return placedLabel;
}

function appendStaticBlendModeLayer(
  filters: string[],
  currentVideo: string,
  placedLayer: string,
  stream: FfmpegBlendModeStream,
  streamIndex: number,
): string {
  const baseForBlend = `[ffmpeg-blend-${streamIndex}-base-blend]`;
  const baseForMask = `[ffmpeg-blend-${streamIndex}-base-mask]`;
  const layerColor = `[ffmpeg-blend-${streamIndex}-layer-color]`;
  const layerAlpha = `[ffmpeg-blend-${streamIndex}-layer-alpha]`;
  const layerRgb = `[ffmpeg-blend-${streamIndex}-layer-rgb]`;
  const layerMask = `[ffmpeg-blend-${streamIndex}-layer-mask]`;
  const modeResult = `[ffmpeg-blend-${streamIndex}-mode-result]`;
  const output = `[ffmpeg-blend-${streamIndex}-output]`;
  const mode = FFMPEG_BLEND_MODE_NAMES[stream.modes[0]];

  filters.push(`${currentVideo}format=gbrp,split=2${baseForBlend}${baseForMask}`);
  filters.push(`${placedLayer}split=2${layerColor}${layerAlpha}`);
  filters.push(`${layerColor}format=gbrp${layerRgb}`);
  filters.push(`${layerAlpha}alphaextract,format=gray${layerMask}`);
  filters.push(`${baseForBlend}${layerRgb}blend=all_mode=${mode}${modeResult}`);
  filters.push(`${baseForMask}${modeResult}${layerMask}maskedmerge=planes=7${output}`);
  return output;
}

function appendDynamicBlendModeLayer(
  filters: string[],
  currentVideo: string,
  placedLayer: string,
  stream: FfmpegBlendModeStream,
  streamIndex: number,
  videoResolution: { width: number; height: number },
): string {
  const modeCount = stream.modes.length;
  const modeValues = `[ffmpeg-blend-${streamIndex}-mode-values]`;
  const modeValueInputs = Array.from(
    { length: modeCount },
    (_, index) => `[ffmpeg-blend-${streamIndex}-mode-value-${index}]`,
  );
  const modeMaskInputs = Array.from(
    { length: modeCount },
    (_, index) => `[ffmpeg-blend-${streamIndex}-mode-mask-${index}]`,
  );
  const modeSelectMasks = Array.from(
    { length: modeCount },
    (_, index) => `[ffmpeg-blend-${streamIndex}-mode-select-mask-${index}]`,
  );
  const layerColors = Array.from(
    { length: modeCount },
    (_, index) => `[ffmpeg-blend-${streamIndex}-layer-color-${index}]`,
  );
  const baseInputs = Array.from(
    { length: modeCount },
    (_, index) => `[ffmpeg-blend-${streamIndex}-base-${index}]`,
  );
  const baseSelected = `[ffmpeg-blend-${streamIndex}-base-selected]`;
  const layerRgbInputs = Array.from(
    { length: modeCount },
    (_, index) => `[ffmpeg-blend-${streamIndex}-layer-rgb-${index}]`,
  );
  const layerMaskInputs = Array.from(
    { length: modeCount },
    (_, index) => `[ffmpeg-blend-${streamIndex}-layer-mask-${index}]`,
  );
  const modeResults = Array.from(
    { length: modeCount },
    (_, index) => `[ffmpeg-blend-${streamIndex}-mode-result-${index}]`,
  );
  const selectedResults = Array.from(
    { length: modeCount },
    (_, index) => `[ffmpeg-blend-${streamIndex}-selected-${index}]`,
  );

  filters.push(
    `[${stream.modeInputIndex}:v]format=gray,scale=${videoResolution.width}:${videoResolution.height}:flags=neighbor${modeValues}`,
  );
  filters.push(`${modeValues}split=${modeCount}${modeValueInputs.join('')}`);
  for (let index = 0; index < modeCount; index += 1) {
    const modeCode = stream.modeCodes.get(stream.modes[index]);
    if (modeCode === undefined) {
      throw new Error(`FFmpeg blend mode ${stream.modes[index]} has no input code.`);
    }
    filters.push(
      `${modeValueInputs[index]}lut=y='if(eq(val,${modeCode}),255,0)',split=2${modeMaskInputs[index]}${modeSelectMasks[index]}`,
    );
  }

  filters.push(`${currentVideo}format=gbrp,split=${modeCount + 1}${baseInputs.join('')}${baseSelected}`);
  const layerColorRoot = `[ffmpeg-blend-${streamIndex}-layer-color-root]`;
  const layerAlphaRoot = `[ffmpeg-blend-${streamIndex}-layer-alpha-root]`;
  filters.push(`${placedLayer}split=2${layerColorRoot}${layerAlphaRoot}`);
  filters.push(`${layerColorRoot}split=${modeCount}${layerColors.join('')}`);
  filters.push(`${layerAlphaRoot}alphaextract,format=gray,split=${modeCount}${layerMaskInputs.join('')}`);
  for (let index = 0; index < modeCount; index += 1) {
    filters.push(`${layerColors[index]}format=gbrp${layerRgbInputs[index]}`);
  }

  let selected = baseSelected;
  for (let index = 0; index < modeCount; index += 1) {
    const baseForBlend = `[ffmpeg-blend-${streamIndex}-mode-base-blend-${index}]`;
    const baseForMask = `[ffmpeg-blend-${streamIndex}-mode-base-mask-${index}]`;
    const candidate = `[ffmpeg-blend-${streamIndex}-candidate-${index}]`;
    filters.push(`${baseInputs[index]}split=2${baseForBlend}${baseForMask}`);
    filters.push(
      `${baseForBlend}${layerRgbInputs[index]}blend=all_mode=${FFMPEG_BLEND_MODE_NAMES[stream.modes[index]]}${candidate}`,
    );
    const activeAlpha = `[ffmpeg-blend-${streamIndex}-active-alpha-${index}]`;
    filters.push(`${layerMaskInputs[index]}${modeMaskInputs[index]}lut2=c0='if(gt(y,0),x,0)'${activeAlpha}`);
    filters.push(
      `${baseForMask}${candidate}${activeAlpha}maskedmerge=planes=7${modeResults[index]}`,
    );
    filters.push(`${selected}${modeResults[index]}${modeSelectMasks[index]}maskedmerge=planes=7${selectedResults[index]}`);
    selected = selectedResults[index];
  }

  return selected;
}

function createSegmentCursor<T extends { repeat: number }>(
  segments: readonly T[],
): () => T | undefined {
  let segmentIndex = 0;
  let repetitionsRemaining = 0;
  return () => {
    while (segmentIndex < segments.length && repetitionsRemaining === 0) {
      repetitionsRemaining = segments[segmentIndex].repeat;
      if (repetitionsRemaining === 0) {
        segmentIndex += 1;
      }
    }
    if (segmentIndex >= segments.length) return undefined;
    const segment = segments[segmentIndex];
    repetitionsRemaining -= 1;
    if (repetitionsRemaining === 0) segmentIndex += 1;
    return segment;
  };
}

function isClosedInputPipeError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.message === 'write EOF' || (error as NodeJS.ErrnoException).code === 'EPIPE';
}

async function writeFfmpegInputFrame(
  pipes: readonly NodeJS.WritableStream[],
  captionFrame: Buffer,
  blendModeStreams: readonly FfmpegBlendModeStream[],
  layerSets: readonly EcsPipelineBlendModeLayer[],
): Promise<boolean> {
  const chunks: Buffer[] = [captionFrame];
  const modeChunks: { pipePosition: number; buffer: Buffer }[] = [];
  for (let streamIndex = 0; streamIndex < blendModeStreams.length; streamIndex += 1) {
    const stream = blendModeStreams[streamIndex];
    const layer = layerSets[streamIndex];
    chunks.push(layer?.buffer ?? stream.blankBuffer);
    if (stream.modePipePosition !== undefined) {
      const mode = layer?.mode ?? stream.modes[0];
      const modeCode = stream.modeCodes.get(mode);
      if (modeCode === undefined) {
        throw new Error(`FFmpeg blend mode ${mode} has no input code.`);
      }
      modeChunks.push({
        pipePosition: stream.modePipePosition,
        buffer: Buffer.from([modeCode]),
      });
    }
  }

  const writes: Promise<void>[] = [];
  writes.push(writeToStdin(pipes[0], chunks[0]));
  let chunkIndex = 1;
  for (const stream of blendModeStreams) {
    writes.push(writeToStdin(pipes[stream.inputPipePosition], chunks[chunkIndex]));
    chunkIndex += 1;
  }
  for (const modeChunk of modeChunks) {
    writes.push(writeToStdin(pipes[modeChunk.pipePosition], modeChunk.buffer));
  }
  try {
    await Promise.all(writes);
    return true;
  } catch (error) {
    if (isClosedInputPipeError(error)) return false;
    throw error;
  }
}

export async function writeFfmpegInputPipes({
  pipes,
  captionSegments,
  captionBlankFrame,
  blendModeStreams,
  blendModeSegments,
  outputFrameLimit,
}: {
  pipes: readonly NodeJS.WritableStream[];
  captionSegments: readonly { buffer: Buffer; repeat: number }[];
  captionBlankFrame: Buffer;
  blendModeStreams: readonly FfmpegBlendModeStream[];
  blendModeSegments: readonly BlendModeLayerSegment[];
  outputFrameLimit?: number;
}): Promise<void> {
  const captionCursor = createSegmentCursor(captionSegments);
  const blendModeCursor = createSegmentCursor(blendModeSegments);
  let frameCount = 0;

  const writeFrame = async (captionFrame: Buffer, layers: readonly EcsPipelineBlendModeLayer[]): Promise<boolean> =>
    writeFfmpegInputFrame(pipes, captionFrame, blendModeStreams, layers);

  while (outputFrameLimit === undefined || frameCount < outputFrameLimit) {
    const captionSegment = captionCursor();
    if (!captionSegment) break;
    const blendModeSegment = blendModeStreams.length > 0 ? blendModeCursor() : undefined;
    if (blendModeStreams.length > 0 && !blendModeSegment) {
      throw new Error('FFmpeg caption and blend-mode timelines have different lengths.');
    }
    if (!(await writeFrame(captionSegment.buffer, blendModeSegment?.layers ?? []))) {
      return;
    }
    frameCount += 1;
  }

  while (outputFrameLimit !== undefined && frameCount < outputFrameLimit) {
    if (!(await writeFrame(captionBlankFrame, []))) return;
    frameCount += 1;
  }
}
