import { Canvas } from '#platform/canvas.js';
import { acquireCanvas, releaseCanvas } from '../../../utilities/canvas-pool';
import type { CanvasContext2D, Margins, ResolveContext } from '../types';
import { Effect, type EffectApplyOptions, type EffectSource } from './effect';

export abstract class SignalEffect extends Effect {
  protected abstract process(sourceCanvas: Canvas, rctx: ResolveContext): Canvas;

  protected originalMode(rctx: ResolveContext): 'none' | 'front' | 'back' {
    return this.getShowOriginal(rctx);
  }

  override getMargins(_ctx: ResolveContext, _source?: EffectSource): Margins {
    return { x: 0, y: 0 };
  }

  override apply(
    ctx: CanvasContext2D,
    rctx: ResolveContext,
    draw: () => void,
    options: EffectApplyOptions = {},
  ): void {
    if (!this.isEnabled(rctx)) {
      draw();
      return;
    }

    const directInput = options.sourceCanvas ? undefined : captureDirectInput(ctx, draw);
    const sourceCanvas = options.sourceCanvas ?? directInput?.source;
    if (!sourceCanvas) {
      throw new Error(`${this.type} effect could not capture its input canvas`);
    }

    const region = options.localizeSignalEffects ? signalRegionFor(sourceCanvas, this, rctx) : undefined;
    const processedInput = region?.canvas ?? sourceCanvas;
    let processed: Canvas | undefined;
    try {
      processed = this.process(processedInput, rctx);
      const showOriginal = this.originalMode(rctx);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      if (directInput) ctx.drawImage(directInput.backdrop, 0, 0);
      if (showOriginal === 'back') ctx.drawImage(sourceCanvas, 0, 0);
      if (region) {
        ctx.drawImage(processed, region.x, region.y);
      } else {
        ctx.drawImage(processed, 0, 0);
      }
      if (showOriginal === 'front') ctx.drawImage(sourceCanvas, 0, 0);
      ctx.restore();
    } finally {
      if (processed && processed !== processedInput) releaseCanvas(processed);
      if (region) releaseCanvas(region.canvas);
      if (directInput) {
        releaseCanvas(directInput.source);
        releaseCanvas(directInput.backdrop);
      }
    }
  }
}

export function resolveSignalAmount(
  effect: Effect,
  name: string,
  rctx: ResolveContext,
  fallback: number,
): number {
  const value = Number(effect.getProp<number>(name)?.resolve(rctx) ?? fallback);
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

function captureDirectInput(ctx: CanvasContext2D, draw: () => void): { source: Canvas; backdrop: Canvas } {
  const backdrop = acquireCanvas(ctx.canvas.width, ctx.canvas.height);
  backdrop.getContext('2d').drawImage(ctx.canvas, 0, 0);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();

  draw();

  const source = acquireCanvas(ctx.canvas.width, ctx.canvas.height);
  source.getContext('2d').drawImage(ctx.canvas, 0, 0);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(backdrop, 0, 0);
  ctx.restore();

  return { source, backdrop };
}

interface SignalRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  canvas: Canvas;
}

function signalRegionFor(sourceCanvas: Canvas, effect: SignalEffect, rctx: ResolveContext): SignalRegion | undefined {
  const bounds = alphaBounds(sourceCanvas);
  if (!bounds) return undefined;

  const margins = effect.getMargins(rctx, { bounds: { width: bounds.width, height: bounds.height } });
  const left = Math.max(0, Math.floor(bounds.x - Math.max(0, margins.x)));
  const top = Math.max(0, Math.floor(bounds.y - Math.max(0, margins.y)));
  const right = Math.min(sourceCanvas.width, Math.ceil(bounds.x + bounds.width + Math.max(0, margins.x)));
  const bottom = Math.min(sourceCanvas.height, Math.ceil(bounds.y + bounds.height + Math.max(0, margins.y)));
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) return undefined;

  const canvas = acquireCanvas(width, height);
  canvas.getContext('2d').drawImage(sourceCanvas, left, top, width, height, 0, 0, width, height);
  return { x: left, y: top, width, height, canvas };
}

function alphaBounds(sourceCanvas: Canvas): { x: number; y: number; width: number; height: number } | undefined {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const pixels = sourceCanvas.getContext('2d').getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  return maxX >= minX && maxY >= minY
    ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
    : undefined;
}
