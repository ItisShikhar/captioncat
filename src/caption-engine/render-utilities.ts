import fs from 'node:fs';
import path from 'node:path';
import { ImageData } from '#platform/canvas.js';

import type { HorizontalAlignment, VerticalAlignment } from '../types/captions';
import { acquireCanvas, releaseCanvas } from '../utilities/canvas-pool';
import { addPngTextMetadata } from '../utilities/ffmpeg-utils';
import { runFfmpeg, writeToStdin } from '../utilities/ffmpeg-runner';
import { perfEnd, perfStart } from '../utilities/perf-log';
import { PROJECT_CAPTION_METADATA } from '../project-branding';
import type {
  CaptionDebugBox,
  CaptionDebugLayout,
  CaptionFrameSize,
  CaptionImageInfo,
} from './render-types';
import type { EcsPipelineBlendModeLayer } from './entity-system/pipeline';
import type { RenderDebugConfig } from './types';

export const LONG_WORD_THRESHOLD = 0.75;
export const CAPTION_HOLD_THRESHOLD_SECONDS = 1;

interface DebugCanvasContext {
  strokeStyle: string | object;
  lineWidth: number;
  font: string;
  fillStyle: string | object;
  setLineDash(segments: number[]): void;
  strokeRect(x: number, y: number, width: number, height: number): void;
  fillText(text: string, x: number, y: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  stroke(): void;
  putImageData(imageData: ImageData, dx: number, dy: number): void;
  getImageData(sx: number, sy: number, sw: number, sh: number): ImageData;
}

function drawDebugBox(ctx: DebugCanvasContext, box: CaptionDebugBox, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(box.left, box.top, box.right - box.left, box.bottom - box.top);
  ctx.setLineDash([]);
}

function drawDebugLabel(ctx: DebugCanvasContext, text: string, x: number, y: number, color: string): void {
  ctx.font = '12px sans-serif';
  ctx.fillStyle = color;
  ctx.fillText(text, x + 4, y + 14);
}

function drawDebugFrame(
  ctx: DebugCanvasContext,
  frame: CaptionDebugLayout['frames'][number],
  debug: RenderDebugConfig,
): void {
  if (debug.bounds) {
    drawDebugBox(ctx, frame.page, '#00ffff');
    if (frame.contentBounds) drawDebugBox(ctx, frame.contentBounds, '#00ff00');
    for (const row of frame.rows) drawDebugBox(ctx, row, '#ffff00');
    for (const word of frame.words) {
      ctx.strokeStyle = '#ff00ff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(word.topLeft.x, word.topLeft.y);
      ctx.lineTo(word.topRight.x, word.topRight.y);
      ctx.lineTo(word.bottomRight.x, word.bottomRight.y);
      ctx.lineTo(word.bottomLeft.x, word.bottomLeft.y);
      ctx.closePath();
      ctx.stroke();
    }
  }

  if (debug.paddingBounds) {
    for (const background of frame.backgrounds) {
      for (const box of background.bandPadding) drawDebugBox(ctx, box, '#ff8800');
      for (const box of background.blockPadding) drawDebugBox(ctx, box, '#ff0000');
    }
  }

  if (debug.position) {
    for (const transform of frame.transforms) {
      const { x, y } = transform.positionAnchor;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 3, y - 3, 6, 6);
      if (transform.dimensions) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, transform.dimensions.x, transform.dimensions.y);
      }
    }
  }

  if (debug.labels) {
    drawDebugLabel(ctx, 'Page', frame.page.left, frame.page.top, '#00ffff');
    for (const row of frame.rows) drawDebugLabel(ctx, `Row ${row.rowIndex}`, row.left, row.top, '#ffff00');
    for (const word of frame.words) drawDebugLabel(ctx, word.word, word.topLeft.x, word.topLeft.y, '#ff00ff');
    for (const transform of frame.transforms) {
      drawDebugLabel(ctx, transform.entity, transform.positionAnchor.x, transform.positionAnchor.y, '#ffffff');
    }
  }
}

export function drawCaptionDebugOverlays({
  allImageBuffers,
  frameSize,
  debugLayout,
  debug,
}: {
  allImageBuffers: Buffer[];
  frameSize: CaptionFrameSize;
  debugLayout: CaptionDebugLayout;
  debug: RenderDebugConfig;
}): Buffer[] {
  return allImageBuffers.map((buffer, frameIndex) => {
    const frame = debugLayout.frames[frameIndex];
    if (!frame) return buffer;
    const canvas = acquireCanvas(frameSize.width, frameSize.height);
    try {
      const context = canvas.getContext('2d');
      context.putImageData(new ImageData(buffer, frameSize.width, frameSize.height), 0, 0);
      drawDebugFrame(context, frame, debug);
      return Buffer.from(context.getImageData(0, 0, frameSize.width, frameSize.height).data);
    } finally {
      releaseCanvas(canvas);
    }
  });
}

export interface BlendModeLayerSegment {
  layers: readonly EcsPipelineBlendModeLayer[];
  repeat: number;
}

export function formatFfmpegDuration(seconds: number | undefined): string | undefined {
  if (!Number.isFinite(seconds) || seconds === undefined || seconds <= 0) {
    return undefined;
  }
  return String(Number(seconds.toFixed(6)));
}

export function buildCaptionFrameSegments({
  captionInfos,
  allImageBuffers,
  frameSize,
  fps,
  captionHoldThresholdSeconds = CAPTION_HOLD_THRESHOLD_SECONDS,
}: {
  captionInfos: CaptionImageInfo[];
  allImageBuffers: Buffer[];
  frameSize: CaptionFrameSize;
  fps: number;
  captionHoldThresholdSeconds?: number;
}): { segments: { buffer: Buffer; repeat: number }[]; blankFrame: Buffer } {
  const blankFrame = Buffer.alloc(frameSize.width * frameSize.height * 4);
  const perFrameDur = 1 / fps;
  const resolvedThreshold = Math.max(0, captionHoldThresholdSeconds);
  const segments: { buffer: Buffer; repeat: number }[] = [];
  const pushDurationSegment = (buffer: Buffer, durationSeconds: number) => {
    const repeat = Math.round(durationSeconds * fps);
    if (repeat > 0) segments.push({ buffer, repeat });
  };

  const firstCaptionStartTime = captionInfos[0]?.startTime;
  if (typeof firstCaptionStartTime === 'number' && Number.isFinite(firstCaptionStartTime) && firstCaptionStartTime > 0) {
    pushDurationSegment(blankFrame, firstCaptionStartTime);
  }

  for (let index = 0; index < captionInfos.length; index += 1) {
    const info = captionInfos[index];
    const maxFrames = Math.floor(info.duration / perFrameDur) || 1;
    const framesToDraw = Math.min(info.numFrames, maxFrames);
    const originalCount = info.numFrames;
    let frameIndices: number[];

    if (framesToDraw >= originalCount) {
      frameIndices = [...Array(originalCount).keys()];
    } else if (framesToDraw <= 1) {
      frameIndices = [originalCount - 1];
    } else {
      frameIndices = [];
      for (let frame = 0; frame < framesToDraw; frame += 1) {
        frameIndices.push(Math.round(((originalCount - 1) * frame) / (framesToDraw - 1)));
      }
    }

    let lastFrameBuffer: Buffer | undefined;
    for (const frameIndex of frameIndices) {
      const frameBuffer = allImageBuffers[info.startFrame + frameIndex];
      segments.push({ buffer: frameBuffer, repeat: 1 });
      lastFrameBuffer = frameBuffer;
    }

    const hold = Math.max(0, info.duration - framesToDraw * perFrameDur);
    if (hold > 1e-6 && lastFrameBuffer) pushDurationSegment(lastFrameBuffer, hold);

    const next = captionInfos[index + 1];
    if (next) {
      const safeGap = Math.max(0, next.startTime - (info.startTime + info.duration));
      if (safeGap > 1e-3) {
        const holdPrevious = safeGap <= resolvedThreshold;
        const gapBuffer = info.isLastWordOnPage && !holdPrevious ? blankFrame : lastFrameBuffer ?? blankFrame;
        pushDurationSegment(gapBuffer, safeGap);
      }
    }
  }

  return { segments, blankFrame };
}

export function buildBlendModeLayerSegments(
  captionInfos: readonly CaptionImageInfo[],
  allBlendModeLayers: readonly EcsPipelineBlendModeLayer[][],
  fps: number,
  captionHoldThresholdSeconds: number,
): BlendModeLayerSegment[] {
  const perFrameDuration = 1 / fps;
  const segments: BlendModeLayerSegment[] = [];
  const blankLayers: readonly EcsPipelineBlendModeLayer[] = [];
  const pushDuration = (layers: readonly EcsPipelineBlendModeLayer[], durationSeconds: number): void => {
    const repeat = Math.round(durationSeconds * fps);
    if (repeat > 0) segments.push({ layers, repeat });
  };

  const firstCaptionStartTime = captionInfos[0]?.startTime;
  if (Number.isFinite(firstCaptionStartTime) && firstCaptionStartTime > 0) {
    pushDuration(blankLayers, firstCaptionStartTime);
  }

  for (let index = 0; index < captionInfos.length; index += 1) {
    const info = captionInfos[index];
    const maxFrames = Math.floor(info.duration / perFrameDuration) || 1;
    const framesToDraw = Math.min(info.numFrames, maxFrames);
    const frameIndices =
      framesToDraw >= info.numFrames
        ? [...Array(info.numFrames).keys()]
        : framesToDraw <= 1
          ? [info.numFrames - 1]
          : Array.from({ length: framesToDraw }, (_, frame) =>
              Math.round(((info.numFrames - 1) * frame) / (framesToDraw - 1)),
            );
    let lastLayers: readonly EcsPipelineBlendModeLayer[] | undefined;
    for (const frameIndex of frameIndices) {
      lastLayers = allBlendModeLayers[info.startFrame + frameIndex] ?? blankLayers;
      segments.push({ layers: lastLayers, repeat: 1 });
    }
    const hold = Math.max(0, info.duration - framesToDraw * perFrameDuration);
    if (hold > 1e-6 && lastLayers) pushDuration(lastLayers, hold);

    const next = captionInfos[index + 1];
    if (next) {
      const safeGap = Math.max(0, next.startTime - (info.startTime + info.duration));
      if (safeGap > 1e-3) {
        const holdPrevious = safeGap <= Math.max(0, captionHoldThresholdSeconds);
        pushDuration(holdPrevious ? lastLayers ?? blankLayers : blankLayers, safeGap);
      }
    }
  }
  return segments;
}

export async function writeCaptionFramesAsPngSequence({
  allImageBuffers,
  frameSize,
  outputDir,
}: {
  allImageBuffers: Buffer[];
  frameSize: CaptionFrameSize;
  outputDir: string;
}): Promise<void> {
  await fs.promises.mkdir(outputDir, { recursive: true });
  await Promise.all(
    allImageBuffers.map(async (buffer, index) => {
      const canvas = acquireCanvas(frameSize.width, frameSize.height);
      let pngBuffer: Buffer;
      try {
        const ctx = canvas.getContext('2d');
        ctx.putImageData(new ImageData(buffer, frameSize.width, frameSize.height), 0, 0);
        pngBuffer = await canvas.toBuffer('png');
      } finally {
        releaseCanvas(canvas);
      }
      const textMetadataPngBuffer = addPngTextMetadata(pngBuffer, {
        Title: PROJECT_CAPTION_METADATA.title,
        Author: PROJECT_CAPTION_METADATA.artist,
        Description: PROJECT_CAPTION_METADATA.comment,
        Copyright: PROJECT_CAPTION_METADATA.copyright,
      });
      await fs.promises.writeFile(path.join(outputDir, `${index + 1}.png`), textMetadataPngBuffer);
    }),
  );
}

export async function createStandaloneCaptionMovie({
  captionInfos,
  allImageBuffers,
  videoResolution,
  captionFrameSize,
  outputDir,
  fps,
  writeCaptionInfos = false,
  captionHoldThresholdSeconds = CAPTION_HOLD_THRESHOLD_SECONDS,
}: {
  captionInfos: CaptionImageInfo[];
  allImageBuffers: Buffer[];
  videoResolution: CaptionFrameSize;
  captionFrameSize?: CaptionFrameSize;
  outputDir: string;
  fps: number;
  writeCaptionInfos?: boolean;
  captionHoldThresholdSeconds?: number;
}): Promise<{ outputPath: string }> {
  if (writeCaptionInfos) {
    fs.writeFileSync(path.join(outputDir, 'captionInfos.txt'), JSON.stringify(captionInfos, null, 2));
  }
  await fs.promises.mkdir(outputDir, { recursive: true });
  const frameSize = captionFrameSize ?? videoResolution;
  const { segments } = buildCaptionFrameSegments({
    captionInfos,
    allImageBuffers,
    frameSize,
    fps,
    captionHoldThresholdSeconds,
  });
  const standaloneCaptionMoviePath = path.join(outputDir, 'captions.mov');
  const muxStartedAt = perfStart();
  await runFfmpeg(
    [
      '-y',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgba',
      '-s',
      `${frameSize.width}x${frameSize.height}`,
      '-r',
      String(fps),
      '-i',
      'pipe:0',
      '-vf',
      'mpdecimate=hi=0:lo=0:frac=0',
      '-vsync',
      'vfr',
      '-c:v',
      'qtrle',
      '-pix_fmt',
      'yuva444p',
      standaloneCaptionMoviePath,
    ],
    {
      writeStdin: async (stdin) => {
        for (const segment of segments) {
          for (let repeat = 0; repeat < segment.repeat; repeat += 1) await writeToStdin(stdin, segment.buffer);
        }
      },
    },
  );
  perfEnd('createStandaloneCaptionMovie:ffmpegMux', muxStartedAt);
  return { outputPath: standaloneCaptionMoviePath };
}

export async function createCompositionAreaOverlayMovie({
  imageBuffer,
  outputDir,
  durationSeconds,
  fps,
}: {
  imageBuffer?: Buffer | undefined;
  outputDir: string;
  durationSeconds: number;
  fps: number;
}): Promise<{ outputPath: string } | undefined> {
  if (!imageBuffer) return undefined;
  const resolvedDuration = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 1;
  const resolvedFps = Number.isFinite(fps) && fps > 0 ? fps : 30;
  await fs.promises.mkdir(outputDir, { recursive: true });
  const imagePath = path.join(outputDir, 'caption-region.png');
  const outputPath = path.join(outputDir, 'caption-region.mov');
  await fs.promises.writeFile(imagePath, imageBuffer);
  await runFfmpeg([
    '-y',
    '-loop',
    '1',
    '-framerate',
    String(resolvedFps),
    '-i',
    imagePath,
    '-t',
    String(resolvedDuration),
    '-c:v',
    'qtrle',
    '-pix_fmt',
    'yuva444p',
    '-an',
    outputPath,
  ]);
  return { outputPath };
}

export function getFfmpegOverlayExprs(
  verticalAlignment: VerticalAlignment,
  horizontalAlignment: HorizontalAlignment,
  xOffset = 0,
  yOffset = 0,
  useSafeArea = true,
): { xExpr: string; yExpr: string } {
  const xo = Number.isFinite(xOffset) ? xOffset : 0;
  const yo = Number.isFinite(yOffset) ? yOffset : 0;
  const offsetPerc = 0.1;
  const xExpr =
    horizontalAlignment === 'left'
      ? `(${xo})`
      : horizontalAlignment === 'right'
        ? `(main_w-overlay_w)+(${xo})`
        : `((main_w-overlay_w)/2)+(${xo})`;
  const yExpr =
    verticalAlignment === 'top'
      ? useSafeArea
        ? `(${offsetPerc}*main_h)+(${yo})`
        : `(${yo})`
      : verticalAlignment === 'center'
        ? `((main_h-overlay_h)/2)+(${yo})`
        : useSafeArea
          ? `((main_h-overlay_h)-(${offsetPerc}*main_h))+(${yo})`
          : `(main_h-overlay_h)+(${yo})`;
  return { xExpr, yExpr };
}
