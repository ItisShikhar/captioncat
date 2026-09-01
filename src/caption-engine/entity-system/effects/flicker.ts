import { Canvas, ImageData } from '#platform/canvas.js';
import { acquireCanvas, releaseCanvas } from '../../../utilities/canvas-pool';
import type { ResolveContext } from '../types';
import { normalizePaint, resolvePaint, solidPaint, type Paint } from '../paint';
import { SignalEffect, resolveSignalAmount } from './signal-effect';
import { clampColor, pseudoRandom } from './pixel-utils';

const DEFAULT_FLICKER = 0.03;
const DEFAULT_MAX_OFF_DURATION = 0;
const RANDOM_FRAME_UPDATE_CHANCE = 0.2;
const MAX_RANDOM_FRAME_LOOKBACK = 120;

export class FlickerEffect extends SignalEffect {
  readonly type = 'flicker';

  protected override originalMode(rctx: ResolveContext): 'none' | 'front' | 'back' {
    const showOriginal = this.getShowOriginal(rctx);
    const showOriginalOnlyDuringOff = this.getProp<boolean>('showOriginalDuringOff')?.resolve(rctx) === true;
    const flickerSignal = resolveFlickerSignal(this, rctx);
    const isOff = flickerSignal.forceOff || flickerSignal.amount >= 1;
    return showOriginal !== 'none' && showOriginalOnlyDuringOff && !isOff ? 'none' : showOriginal;
  }

  protected process(sourceCanvas: Canvas, rctx: ResolveContext): Canvas {
    const flickerSignal = resolveFlickerSignal(this, rctx);
    const offAmount = flickerSignal.forceOff ? 1 : flickerSignal.amount;
    const width = sourceCanvas.width;
    const height = sourceCanvas.height;
    const sourcePixels = sourceCanvas.getContext('2d').getImageData(0, 0, width, height).data;
    const offPaint = normalizePaint(
      this.getProp<Paint>('offPaint')?.resolve(rctx),
      solidPaint('#000000'),
    );
    const offCanvas = acquireCanvas(width, height);
    try {
      const offContext = offCanvas.getContext('2d');
      offContext.fillStyle = resolvePaint(offContext, offPaint, { x: 0, y: 0, width, height });
      offContext.fillRect(0, 0, width, height);
      const offPixels = offContext.getImageData(0, 0, width, height).data;
      const outputPixels = new Uint8ClampedArray(sourcePixels.length);

      for (let index = 0; index < sourcePixels.length; index += 4) {
        const sourceAlpha = sourcePixels[index + 3] / 255;
        const offAlpha = (offPixels[index + 3] / 255) * sourceAlpha;
        const outputAlpha = sourceAlpha * (1 - offAmount) + offAlpha * offAmount;
        const sourceWeight = sourceAlpha * (1 - offAmount);
        const offWeight = offAlpha * offAmount;

        outputPixels[index + 3] = clampColor(outputAlpha * 255);
        if (outputAlpha <= 0) {
          outputPixels[index] = 0;
          outputPixels[index + 1] = 0;
          outputPixels[index + 2] = 0;
          continue;
        }

        outputPixels[index] = clampColor(
          (sourcePixels[index] * sourceWeight + offPixels[index] * offWeight) / outputAlpha,
        );
        outputPixels[index + 1] = clampColor(
          (sourcePixels[index + 1] * sourceWeight + offPixels[index + 1] * offWeight) / outputAlpha,
        );
        outputPixels[index + 2] = clampColor(
          (sourcePixels[index + 2] * sourceWeight + offPixels[index + 2] * offWeight) / outputAlpha,
        );
      }

      const output = acquireCanvas(width, height);
      output.getContext('2d').putImageData(new ImageData(outputPixels, width, height), 0, 0);
      return output;
    } finally {
      releaseCanvas(offCanvas);
    }
  }
}

interface FlickerSignal {
  amount: number;
  forceOff: boolean;
}

function resolveFlickerSignal(effect: FlickerEffect, rctx: ResolveContext): FlickerSignal {
  const amount = resolveSignalAmount(effect, 'flicker', rctx, DEFAULT_FLICKER);
  const updateMode =
    effect.getProp<string>('updateMode')?.resolve(rctx) === 'randomFrames' ? 'randomFrames' : 'everyFrame';
  const updateFrame = updateMode === 'randomFrames' ? latestRandomUpdateFrame(rctx.frameIndex) : rctx.frameIndex;
  const randomAmount = amount * pseudoRandom(updateFrame, 0, 0);
  const maxOffDuration = Number(effect.getProp<number>('maxOffDuration')?.resolve(rctx) ?? DEFAULT_MAX_OFF_DURATION);
  if (updateMode !== 'randomFrames' || !Number.isFinite(maxOffDuration) || maxOffDuration <= 0) {
    return { amount: randomAmount, forceOff: false };
  }

  const frameDuration = Math.max(1 / 60, rctx.deltaSeconds ?? 1 / 60);
  const heldDuration = Math.max(0, rctx.frameIndex - updateFrame) * frameDuration;
  if (heldDuration > maxOffDuration) return { amount: 0, forceOff: false };
  return { amount: randomAmount, forceOff: heldDuration > 0 };
}

function latestRandomUpdateFrame(frameIndex: number): number {
  const currentFrame = Math.max(0, Math.floor(frameIndex));
  for (let candidate = currentFrame; candidate > Math.max(0, currentFrame - MAX_RANDOM_FRAME_LOOKBACK); candidate -= 1) {
    if (candidate === 0 || pseudoRandom(candidate, 1, 0) < RANDOM_FRAME_UPDATE_CHANCE) return candidate;
  }
  return Math.max(0, currentFrame - MAX_RANDOM_FRAME_LOOKBACK);
}
