import { Canvas, ImageData } from '#platform/canvas.js';
import { acquireCanvas } from '../../../utilities/canvas-pool';
import type { ResolveContext } from '../types';
import { clampColor } from './pixel-utils';
import { SignalEffect, resolveSignalAmount } from './signal-effect';

const DEFAULT_VIGNETTE = 0;
const DEFAULT_CENTER = { x: 0.5, y: 0.5 };
const DEFAULT_ASPECT_CORRECTION = true;

interface VignetteSettings {
  amount: number;
  center: { x: number; y: number };
  aspectCorrection: boolean;
}

export class VignetteEffect extends SignalEffect {
  readonly type = 'vignette';

  protected process(sourceCanvas: Canvas, rctx: ResolveContext): Canvas {
    const settings = this.resolveSettings(rctx);
    const width = sourceCanvas.width;
    const height = sourceCanvas.height;
    const sourcePixels = sourceCanvas.getContext('2d').getImageData(0, 0, width, height).data;
    const outputPixels = new Uint8ClampedArray(sourcePixels.length);
    const aspect = settings.aspectCorrection && height > 0 ? width / height : 1;
    const maxRadius = maxVignetteRadius(settings, aspect);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const uv = {
          x: width > 1 ? x / (width - 1) : 0,
          y: height > 1 ? y / (height - 1) : 0,
        };
        const radius = Math.hypot((uv.x - settings.center.x) * aspect, uv.y - settings.center.y);
        const edgeProgress = Math.min(1, radius / maxRadius);
        const brightness = 1 - settings.amount * edgeProgress * edgeProgress;
        const outputIndex = (y * width + x) * 4;

        outputPixels[outputIndex] = clampColor(sourcePixels[outputIndex] * brightness);
        outputPixels[outputIndex + 1] = clampColor(sourcePixels[outputIndex + 1] * brightness);
        outputPixels[outputIndex + 2] = clampColor(sourcePixels[outputIndex + 2] * brightness);
        outputPixels[outputIndex + 3] = sourcePixels[outputIndex + 3];
      }
    }

    const output = acquireCanvas(width, height);
    output.getContext('2d').putImageData(new ImageData(outputPixels, width, height), 0, 0);
    return output;
  }

  private resolveSettings(rctx: ResolveContext): VignetteSettings {
    return {
      amount: resolveSignalAmount(this, 'vignette', rctx, DEFAULT_VIGNETTE),
      center: resolveCenter(this.getProp<{ x: number; y: number }>('center')?.resolve(rctx)),
      aspectCorrection: this.getProp<boolean>('aspectCorrection')?.resolve(rctx) ?? DEFAULT_ASPECT_CORRECTION,
    };
  }
}

function resolveCenter(value: { x: number; y: number } | undefined): { x: number; y: number } {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return DEFAULT_CENTER;
  return {
    x: Math.min(1, Math.max(0, value.x)),
    y: Math.min(1, Math.max(0, value.y)),
  };
}

function maxVignetteRadius(settings: VignetteSettings, aspect: number): number {
  let maximum = 0;
  for (const x of [0, 1]) {
    for (const y of [0, 1]) {
      maximum = Math.max(maximum, Math.hypot((x - settings.center.x) * aspect, y - settings.center.y));
    }
  }
  return Math.max(0.0001, maximum);
}
