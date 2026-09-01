import { acquireCanvas, releaseCanvas } from '../../../utilities/canvas-pool';
import { compositionScaleOf, type CanvasContext2D, type Margins, type ResolveContext } from '../types';
import { Effect, type EffectApplyOptions, type EffectSource } from './effect';

export type WipeRevealDirection =
  | 'logicalStartToEnd'
  | 'logicalEndToStart'
  | 'leftToRight'
  | 'rightToLeft'
  | 'topToBottom'
  | 'bottomToTop';
export type WipeRevealShape = 'rectangle' | 'diagonal';
export type WipeRevealStyle = 'default' | 'past' | 'previous' | 'current' | 'next' | 'future' | 'none';
export type WipeRevealBasePlacement = 'back' | 'front' | 'none';

interface WipeRevealBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeDirection(value: unknown): WipeRevealDirection {
  const directions: WipeRevealDirection[] = [
    'logicalStartToEnd',
    'logicalEndToStart',
    'leftToRight',
    'rightToLeft',
    'topToBottom',
    'bottomToTop',
  ];
  return directions.includes(value as WipeRevealDirection) ? (value as WipeRevealDirection) : 'logicalStartToEnd';
}

function normalizeShape(value: unknown): WipeRevealShape {
  return value === 'diagonal' ? 'diagonal' : 'rectangle';
}

function normalizeStyle(value: unknown): WipeRevealStyle {
  const styles: WipeRevealStyle[] = ['default', 'past', 'previous', 'current', 'next', 'future', 'none'];
  return styles.includes(value as WipeRevealStyle) ? (value as WipeRevealStyle) : 'next';
}

function normalizeBasePlacement(value: unknown): WipeRevealBasePlacement {
  return value === 'front' || value === 'none' ? value : 'back';
}

function physicalDirection(direction: WipeRevealDirection, rctx: ResolveContext): Exclude<WipeRevealDirection, 'logicalStartToEnd' | 'logicalEndToStart'> {
  if (direction === 'logicalStartToEnd') return rctx.textDirection === 'rtl' ? 'rightToLeft' : 'leftToRight';
  if (direction === 'logicalEndToStart') return rctx.textDirection === 'rtl' ? 'leftToRight' : 'rightToLeft';
  return direction;
}

function maskBoundsFor(
  bounds: WipeRevealBounds,
  direction: Exclude<WipeRevealDirection, 'logicalStartToEnd' | 'logicalEndToStart'>,
  padding: number,
  expandBothAxes: boolean,
): WipeRevealBounds {
  if (expandBothAxes) {
    return {
      x: bounds.x - padding,
      y: bounds.y - padding,
      width: bounds.width + padding * 2,
      height: bounds.height + padding * 2,
    };
  }
  const horizontal = direction === 'leftToRight' || direction === 'rightToLeft';
  return horizontal
    ? { ...bounds, y: bounds.y - padding, height: bounds.height + padding * 2 }
    : { ...bounds, x: bounds.x - padding, width: bounds.width + padding * 2 };
}

function drawWipeMask(
  ctx: CanvasContext2D,
  bounds: WipeRevealBounds,
  direction: Exclude<WipeRevealDirection, 'logicalStartToEnd' | 'logicalEndToStart'>,
  progress: number,
  feather: number,
): void {
  const horizontal = direction === 'leftToRight' || direction === 'rightToLeft';
  const size = horizontal ? bounds.width : bounds.height;
  const normalizedFeather = size > 0 ? feather / size : 0;
  const reverse = direction === 'rightToLeft' || direction === 'bottomToTop';
  const edge = reverse ? 1 - progress : progress;
  const start = clamp(edge - normalizedFeather, 0, 1);
  const end = clamp(edge + normalizedFeather, 0, 1);
  const gradient = horizontal
    ? ctx.createLinearGradient(bounds.x, bounds.y, bounds.x + bounds.width, bounds.y)
    : ctx.createLinearGradient(bounds.x, bounds.y, bounds.x, bounds.y + bounds.height);
  if (reverse) {
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(start, 'rgba(0,0,0,0)');
    gradient.addColorStop(end, 'rgba(0,0,0,1)');
    gradient.addColorStop(1, 'rgba(0,0,0,1)');
  } else {
    gradient.addColorStop(0, 'rgba(0,0,0,1)');
    gradient.addColorStop(start, 'rgba(0,0,0,1)');
    gradient.addColorStop(end, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
}

export class WipeRevealEffect extends Effect {
  readonly type = 'wipeReveal';

  reveal(rctx: ResolveContext): number {
    return clamp(finiteNumber(this.getProp<number>('reveal')?.resolve(rctx), 1), 0, 1);
  }

  direction(rctx: ResolveContext): WipeRevealDirection {
    return normalizeDirection(this.getProp<string>('direction')?.resolve(rctx));
  }

  shape(rctx: ResolveContext): WipeRevealShape {
    return normalizeShape(this.getProp<string>('shape')?.resolve(rctx));
  }

  feather(rctx: ResolveContext): number {
    return Math.max(0, finiteNumber(this.getProp<number>('feather')?.resolve(rctx), 0));
  }

  angle(rctx: ResolveContext): number {
    return finiteNumber(this.getProp<number>('angle')?.resolve(rctx), 45);
  }

  fromStyle(rctx: ResolveContext): WipeRevealStyle {
    return normalizeStyle(this.getProp<string>('fromStyle')?.resolve(rctx));
  }

  toStyle(rctx: ResolveContext): WipeRevealStyle {
    const value = this.getProp<string>('toStyle')?.resolve(rctx);
    return stylesInclude(value) ? (value as WipeRevealStyle) : 'current';
  }

  basePlacement(rctx: ResolveContext): WipeRevealBasePlacement {
    return normalizeBasePlacement(this.getProp<string>('basePlacement')?.resolve(rctx));
  }

  hasSourceStyle(rctx: ResolveContext): boolean {
    return this.fromStyle(rctx) !== 'none';
  }

  override getMargins(_ctx: ResolveContext, _source?: EffectSource): Margins {
    return { x: 0, y: 0 };
  }

  override apply(ctx: CanvasContext2D, rctx: ResolveContext, draw: () => void, options?: EffectApplyOptions): void {
    draw();
    const bounds = options?.paintBounds;
    if (!bounds) return;
    const maskCanvas = acquireCanvas(ctx.canvas.width, ctx.canvas.height);
    try {
      const maskContext = maskCanvas.getContext('2d');
      if (options.baseTransform) maskContext.setTransform(options.baseTransform);
      const localBounds = {
        x: -bounds.width / 2,
        y: -bounds.height / 2,
        width: bounds.width,
        height: bounds.height,
      };
      const direction = physicalDirection(this.direction(rctx), rctx);
      const shape = this.shape(rctx);
      const maskBounds = maskBoundsFor(
        localBounds,
        direction,
        1 / compositionScaleOf(rctx),
        shape === 'diagonal',
      );
      if (shape === 'diagonal') {
        maskContext.rotate((this.angle(rctx) * Math.PI) / 180);
      }
      const progress = this.reveal(rctx);
      const feather = this.feather(rctx) * compositionScaleOf(rctx);
      if (progress >= 1) {
        maskContext.fillStyle = 'rgba(0,0,0,1)';
        maskContext.fillRect(maskBounds.x, maskBounds.y, maskBounds.width, maskBounds.height);
      } else if (progress > 0 && feather > 0) {
        drawWipeMask(maskContext, maskBounds, direction, progress, feather);
      } else if (progress > 0) {
        const width = maskBounds.width;
        const height = maskBounds.height;
        const horizontal = direction === 'leftToRight' || direction === 'rightToLeft';
        const length = horizontal ? width : height;
        const revealed = length * progress;
        const x = horizontal
          ? direction === 'rightToLeft'
            ? maskBounds.x + length - revealed
            : maskBounds.x
          : maskBounds.x;
        const y = horizontal
          ? maskBounds.y
          : direction === 'bottomToTop'
            ? maskBounds.y + length - revealed
            : maskBounds.y;
        maskContext.fillStyle = 'rgba(0,0,0,1)';
        maskContext.fillRect(x, y, horizontal ? revealed : width, horizontal ? height : revealed);
      }
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(maskCanvas, 0, 0);
      ctx.restore();
    } finally {
      releaseCanvas(maskCanvas);
    }
  }
}

function stylesInclude(value: unknown): value is WipeRevealStyle {
  return ['default', 'past', 'previous', 'current', 'next', 'future', 'none'].includes(value as string);
}
