import { createCanvasPoolScope } from '../../../utilities/canvas-pool';
import { resolvePaint, resolveSolidPaint, solidPaint, type Paint } from '../paint';
import { compositionScaleOf, type CanvasContext2D, type Margins, type ResolveContext } from '../types';
import { Effect, type EffectApplyOptions } from './effect';

export const GLOW_MODES = ['outer', 'inner'] as const;
export type GlowMode = (typeof GLOW_MODES)[number];

function normalizeGlowMode(value: unknown): GlowMode {
  return value === 'inner' ? 'inner' : 'outer';
}

/** Colored glow around or inside a component's painted output. */
export class GlowEffect extends Effect {
  readonly type = 'glow';

  override getMargins(ctx: ResolveContext): Margins {
    if (normalizeGlowMode(this.getProp<string>('mode')?.resolve(ctx)) === 'inner') {
      return { x: 0, y: 0 };
    }
    const blurRadius = this.getProp<number>('blurRadius')?.maxNumber() ?? 0;
    return { x: blurRadius, y: blurRadius };
  }

  override apply(ctx: CanvasContext2D, rctx: ResolveContext, draw: () => void, options: EffectApplyOptions = {}): void {
    if (this.getProp<boolean>('enabled')?.resolve(rctx) === false) {
      draw();
      return;
    }

    const blurRadius = Number(this.getProp<number>('blurRadius')?.resolve(rctx) ?? 0) * compositionScaleOf(rctx);
    if (blurRadius <= 0) {
      draw();
      return;
    }

    if (normalizeGlowMode(this.getProp<string>('mode')?.resolve(rctx)) === 'inner') {
      this.applyInnerGlow(ctx, rctx, draw, options, blurRadius);
      return;
    }

    const paint = this.getProp<Paint>('color')?.resolve(rctx) ?? solidPaint('rgba(255,255,255,1)');
    const strength = Number(this.getProp<number>('strength')?.resolve(rctx) ?? 1);
    const includeOriginal = options.includeOriginal !== false;

    if (paint.type !== 'solid') {
      const canvasScope = createCanvasPoolScope();
      try {
        draw();
        const source = canvasScope.acquire(ctx.canvas.width, ctx.canvas.height);
        const sourceContext = source.getContext('2d');
        sourceContext.drawImage(ctx.canvas, 0, 0);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.restore();

        const mask = canvasScope.acquire(ctx.canvas.width, ctx.canvas.height);
        const maskContext = mask.getContext('2d');
        maskContext.filter = `blur(${blurRadius}px)`;
        maskContext.drawImage(source, 0, 0);

        const gradientLayer = canvasScope.acquire(ctx.canvas.width, ctx.canvas.height);
        const gradientContext = gradientLayer.getContext('2d');
        const bounds = options.paintBounds
          ? transformBounds(options.paintBounds, options.baseTransform)
          : { x: 0, y: 0, width: ctx.canvas.width, height: ctx.canvas.height };
        gradientContext.fillStyle = resolvePaint(gradientContext, paint, {
          ...bounds,
        }, strength);
        gradientContext.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        gradientContext.globalCompositeOperation = 'destination-in';
        gradientContext.drawImage(mask, 0, 0);

        ctx.drawImage(gradientLayer, 0, 0);
        if (includeOriginal) ctx.drawImage(source, 0, 0);
        return;
      } finally {
        canvasScope.releaseAll();
      }
    }

    ctx.save();
    ctx.shadowColor = resolveSolidPaint(paint, strength);
    ctx.shadowBlur = blurRadius;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    draw();
    ctx.restore();
    if (!includeOriginal && options.sourceCanvas) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.drawImage(options.sourceCanvas, 0, 0);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = resolveSolidPaint(paint);
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();
    }
  }

  private applyInnerGlow(
    ctx: CanvasContext2D,
    rctx: ResolveContext,
    draw: () => void,
    options: EffectApplyOptions,
    blurRadius: number,
  ): void {
    const canvasScope = createCanvasPoolScope();
    try {
      const source = options.sourceCanvas ?? canvasScope.acquire(ctx.canvas.width, ctx.canvas.height);
      if (!options.sourceCanvas) {
        draw();
        source.getContext('2d').drawImage(ctx.canvas, 0, 0);
      }

      const blurred = canvasScope.acquire(source.width, source.height);
      const blurredContext = blurred.getContext('2d');
      blurredContext.filter = `blur(${blurRadius}px)`;
      blurredContext.drawImage(source, 0, 0);

      const mask = canvasScope.acquire(source.width, source.height);
      const maskContext = mask.getContext('2d');
      maskContext.drawImage(source, 0, 0);
      maskContext.globalCompositeOperation = 'destination-out';
      maskContext.drawImage(blurred, 0, 0);

      const paint = this.getProp<Paint>('color')?.resolve(rctx) ?? solidPaint('rgba(255,255,255,1)');
      const strength = Number(this.getProp<number>('strength')?.resolve(rctx) ?? 1);
      const bounds = options.paintBounds
        ? transformBounds(options.paintBounds, options.baseTransform)
        : { x: 0, y: 0, width: ctx.canvas.width, height: ctx.canvas.height };
      const glow = canvasScope.acquire(source.width, source.height);
      const glowContext = glow.getContext('2d');
      glowContext.fillStyle = resolvePaint(glowContext, paint, bounds, strength);
      glowContext.fillRect(0, 0, glow.width, glow.height);
      glowContext.globalCompositeOperation = 'destination-in';
      glowContext.drawImage(mask, 0, 0);

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();
      ctx.drawImage(glow, 0, 0);
      if (options.includeOriginal !== false) ctx.drawImage(source, 0, 0);
    } finally {
      canvasScope.releaseAll();
    }
  }
}

function transformBounds(
  bounds: { x: number; y: number; width: number; height: number },
  transform: ReturnType<CanvasContext2D['getTransform']> | undefined,
): { x: number; y: number; width: number; height: number } {
  if (!transform) return bounds;
  const corners = [
    [bounds.x, bounds.y],
    [bounds.x + bounds.width, bounds.y],
    [bounds.x + bounds.width, bounds.y + bounds.height],
    [bounds.x, bounds.y + bounds.height],
  ];
  const points = corners.map(([x, y]) => ({
    x: transform.a * x + transform.c * y + transform.e,
    y: transform.b * x + transform.d * y + transform.f,
  }));
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}