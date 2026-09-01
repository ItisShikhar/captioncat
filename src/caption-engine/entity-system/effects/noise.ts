import { Canvas, ImageData } from '#platform/canvas.js';
import { acquireCanvas } from '../../../utilities/canvas-pool';
import type { ResolveContext } from '../types';
import { SignalEffect, resolveSignalAmount } from './signal-effect';
import { clampColor, pseudoRandom } from './pixel-utils';

const DEFAULT_NOISE = 0.04;

export class NoiseEffect extends SignalEffect {
  readonly type = 'noise';

  protected process(sourceCanvas: Canvas, rctx: ResolveContext): Canvas {
    const amount = resolveSignalAmount(this, 'noise', rctx, DEFAULT_NOISE);
    const noiseFrame =
      this.getProp<boolean>('static')?.resolve(rctx) === true
        ? 0
        : rctx.frameIndex;
    const width = sourceCanvas.width;
    const height = sourceCanvas.height;
    const sourcePixels = sourceCanvas
      .getContext('2d')
      .getImageData(0, 0, width, height).data;
    const outputPixels = new Uint8ClampedArray(sourcePixels.length);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const noiseValue = pseudoRandom(noiseFrame, x, y);
        const noise = amount * (noiseValue - 0.5) * 255;
        outputPixels[index] = clampColor(sourcePixels[index] + noise);
        outputPixels[index + 1] = clampColor(sourcePixels[index + 1] + noise);
        outputPixels[index + 2] = clampColor(sourcePixels[index + 2] + noise);
        outputPixels[index + 3] = sourcePixels[index + 3];
      }
    }

    const output = acquireCanvas(width, height);
    output
      .getContext('2d')
      .putImageData(new ImageData(outputPixels, width, height), 0, 0);
    return output;
  }
}
