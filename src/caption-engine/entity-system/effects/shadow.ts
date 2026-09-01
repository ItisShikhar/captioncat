import { drawRoundedRectanglePath, scaleCornerGeometryToFit } from '../../../utilities/canvas-utils';
import { Canvas } from '#platform/canvas.js';
import type { SkiaPath2D } from '../../../utilities/canvas-utils';
import { acquireCanvas, releaseCanvas } from '../../../utilities/canvas-pool';
import type { CornerRadiusProvider } from '../components/border-radius';
import type { ResolvedCornerGeometry } from '../../../types/captions';
import {
  resolvePaint,
  resolveSolidPaint,
  solidPaint,
  transformPaintBounds,
  type Paint,
  type PaintBounds,
  type PaintTransform,
} from '../paint';
import {
  compositionScaleOf,
  type Box,
  type CanvasContext2D,
  type Margins,
  type ResolveContext,
  type Vector2,
  toVec2,
  zeroMargins,
} from '../types';
import { Effect } from './effect';

const ZERO_GEOMETRY = {
  radii: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
  squircle: { topLeft: false, topRight: false, bottomRight: false, bottomLeft: false },
};

/** Drop shadow. Casts behind a word's glyphs (`castGlyph`) or a BackgroundStyle box (`castOnBox`). */
export class ShadowEffect extends Effect {
  readonly type = 'shadow';

  override getMargins(_ctx: ResolveContext): Margins {
    const opacity = this.getProp<number>('opacity')?.maxNumber() ?? 1;
    if (!(opacity > 0)) return zeroMargins();
    const blur = this.getProp<number>('blurRadius')?.maxNumber() ?? 0;
    const offset = toVec2(this.getProp<Vector2>('offset')?.maxVector() ?? { x: 0, y: 0 });
    if (blur <= 0 && offset.x === 0 && offset.y === 0) return zeroMargins();
    return { x: blur + Math.abs(offset.x), y: blur + Math.abs(offset.y) };
  }

  private hasVisibleShadow(rctx: ResolveContext): boolean {
    const opacity = Number(this.getProp<number>('opacity')?.resolve(rctx) ?? 1);
    if (!(opacity > 0)) return false;
    const blur = Number(this.getProp<number>('blurRadius')?.resolve(rctx) ?? 0);
    const offset = toVec2(this.getProp<Vector2>('offset')?.resolve(rctx) ?? { x: 0, y: 0 });
    return blur > 0 || offset.x !== 0 || offset.y !== 0;
  }

  private hasLongShadow(rctx: ResolveContext): boolean {
    return this.getProp<boolean>('longShadow')?.resolve(rctx) ?? false;
  }

  private shadowOffset(rctx: ResolveContext, scaleSpatialValues: boolean): Vector2 {
    const offset = toVec2(this.getProp<Vector2>('offset')?.resolve(rctx) ?? { x: 0, y: 0 });
    if (!scaleSpatialValues) return offset;
    const scale = compositionScaleOf(rctx);
    return { x: offset.x * scale, y: offset.y * scale };
  }

  private drawLongShadowImage(
    ctx: CanvasContext2D,
    input: Canvas,
    paint: Paint,
    rctx: ResolveContext,
    bounds: PaintBounds,
    transform: PaintTransform | undefined,
    scaleSpatialValues: boolean,
  ): void {
    if (!this.hasLongShadow(rctx)) return;
    const offset = this.shadowOffset(rctx, scaleSpatialValues);
    const stepCount = Math.ceil(Math.max(Math.abs(offset.x), Math.abs(offset.y)));
    if (stepCount <= 0) return;

    const mask = acquireCanvas(input.width, input.height);
    const shadow = acquireCanvas(input.width, input.height);
    try {
      const maskContext = mask.getContext('2d');
      for (let step = 1; step <= stepCount; step += 1) {
        maskContext.drawImage(input, (offset.x * step) / stepCount, (offset.y * step) / stepCount);
      }

      const shadowContext = shadow.getContext('2d');
      const opacity = Number(this.getProp<number>('opacity')?.resolve(rctx) ?? 1);
      shadowContext.fillStyle = resolvePaint(shadowContext, paint, transformPaintBounds(bounds, transform), opacity);
      shadowContext.fillRect(0, 0, shadow.width, shadow.height);
      shadowContext.globalCompositeOperation = 'destination-in';
      shadowContext.drawImage(mask, 0, 0);
      ctx.drawImage(shadow, 0, 0);
    } finally {
      releaseCanvas(shadow);
      releaseCanvas(mask);
    }
  }

  private drawLongShadowPath(
    ctx: CanvasContext2D,
    path: SkiaPath2D,
    rctx: ResolveContext,
    extraAlpha: number,
  ): void {
    if (!this.hasLongShadow(rctx)) return;
    const offset = this.shadowOffset(rctx, false);
    const stepCount = Math.ceil(Math.max(Math.abs(offset.x), Math.abs(offset.y)));
    if (stepCount <= 0) return;

    const opacity = Number(this.getProp<number>('opacity')?.resolve(rctx) ?? 1);
    ctx.save();
    ctx.globalAlpha *= opacity * extraAlpha;
    ctx.fillStyle = 'rgba(0,0,0,1)';
    for (let step = 1; step <= stepCount; step += 1) {
      ctx.save();
      ctx.translate((offset.x * step) / stepCount, (offset.y * step) / stepCount);
      ctx.fill(path);
      ctx.restore();
    }
    ctx.restore();
  }

  private drawLongShadowRoundedBox(
    ctx: CanvasContext2D,
    box: Box,
    geometry: ResolvedCornerGeometry,
    rctx: ResolveContext,
    extraAlpha: number,
  ): void {
    if (!this.hasLongShadow(rctx)) return;
    const offset = this.shadowOffset(rctx, false);
    const stepCount = Math.ceil(Math.max(Math.abs(offset.x), Math.abs(offset.y)));
    if (stepCount <= 0) return;

    const opacity = Number(this.getProp<number>('opacity')?.resolve(rctx) ?? 1);
    ctx.save();
    ctx.globalAlpha *= opacity * extraAlpha;
    ctx.fillStyle = 'rgba(0,0,0,1)';
    for (let step = 1; step <= stepCount; step += 1) {
      ctx.save();
      ctx.translate((offset.x * step) / stepCount, (offset.y * step) / stepCount);
      ctx.beginPath();
      drawRoundedRectanglePath(ctx, box.x, box.y, box.width, box.height, geometry);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  private shadowPaint(fontPaint: Paint, rctx: ResolveContext): Paint {
    const useFontColor = this.getProp<boolean>('useFontColor')?.resolve(rctx) ?? false;
    return useFontColor
      ? fontPaint
      : this.getProp<Paint>('color')?.resolve(rctx) ?? solidPaint('#000000');
  }

  private applyShadowState(ctx: CanvasContext2D, paint: Paint, rctx: ResolveContext, scaleSpatialValues = false): void {
    const opacity = Number(this.getProp<number>('opacity')?.resolve(rctx) ?? 1);
    ctx.shadowColor = resolveSolidPaint(paint, opacity);
    const scale = scaleSpatialValues ? compositionScaleOf(rctx) : 1;
    ctx.shadowBlur = Number(this.getProp<number>('blurRadius')?.resolve(rctx) ?? 0) * scale;
    const offset = toVec2(this.getProp<Vector2>('offset')?.resolve(rctx) ?? { x: 0, y: 0 });
    ctx.shadowOffsetX = offset.x * scale;
    ctx.shadowOffsetY = offset.y * scale;
  }

  private castPaintedImage(
    ctx: CanvasContext2D,
    input: Canvas,
    paint: Paint,
    rctx: ResolveContext,
    bounds: PaintBounds,
    transform?: PaintTransform,
  ): void {
    const mask = acquireCanvas(input.width, input.height);
    const shadow = acquireCanvas(input.width, input.height);
    try {
      const maskContext = mask.getContext('2d');
      this.applyShadowState(maskContext, solidPaint('#000000'), rctx, true);
      maskContext.shadowColor = 'rgba(0,0,0,1)';
      maskContext.drawImage(input, 0, 0);
      maskContext.globalCompositeOperation = 'destination-out';
      maskContext.shadowColor = 'rgba(0,0,0,0)';
      maskContext.shadowBlur = 0;
      maskContext.shadowOffsetX = 0;
      maskContext.shadowOffsetY = 0;
      maskContext.drawImage(input, 0, 0);

      const shadowContext = shadow.getContext('2d');
      const opacity = Number(this.getProp<number>('opacity')?.resolve(rctx) ?? 1);
      shadowContext.fillStyle = resolvePaint(shadowContext, paint, transformPaintBounds(bounds, transform), opacity);
      shadowContext.fillRect(0, 0, shadow.width, shadow.height);
      shadowContext.globalCompositeOperation = 'destination-in';
      shadowContext.drawImage(mask, 0, 0);
      ctx.drawImage(shadow, 0, 0);
    } finally {
      releaseCanvas(shadow);
      releaseCanvas(mask);
    }
  }

  /**
 * Cast this shadow by drawing an opaque copy of the glyphs with the shadow
 * canvas state set. The real colored fill is drawn afterwards by `Text`.
 */
  castGlyph(ctx: CanvasContext2D, text: string, fontPaint: Paint, rctx: ResolveContext): void {
    if (!this.getProp<boolean>('enabled')?.resolve(rctx)) return;
    if (!this.hasVisibleShadow(rctx)) return;
    const paint = this.shadowPaint(fontPaint, rctx);
    if (this.hasLongShadow(rctx)) {
      const input = acquireCanvas(ctx.canvas.width, ctx.canvas.height);
      try {
        const inputContext = input.getContext('2d');
        inputContext.setTransform(ctx.getTransform());
        inputContext.font = ctx.font;
        inputContext.textAlign = ctx.textAlign;
        inputContext.textBaseline = ctx.textBaseline;
        inputContext.direction = ctx.direction;
        inputContext.fillStyle = 'rgba(0,0,0,1)';
        inputContext.fillText(text, 0, 0);
        this.drawLongShadowImage(
          ctx,
          input,
          paint,
          rctx,
          { x: 0, y: 0, width: input.width, height: input.height },
          undefined,
          false,
        );
      } finally {
        releaseCanvas(input);
      }
    }
    if (paint.type !== 'solid') {
      const input = acquireCanvas(ctx.canvas.width, ctx.canvas.height);
      try {
        const inputContext = input.getContext('2d');
        inputContext.setTransform(ctx.getTransform());
        inputContext.font = ctx.font;
        inputContext.textAlign = ctx.textAlign;
        inputContext.textBaseline = ctx.textBaseline;
        inputContext.direction = ctx.direction;
        inputContext.fillStyle = 'rgba(0,0,0,1)';
        inputContext.fillText(text, 0, 0);
        this.castPaintedImage(ctx, input, paint, rctx, {
          x: 0,
          y: 0,
          width: input.width,
          height: input.height,
        });
      } finally {
        releaseCanvas(input);
      }
      return;
    }
    ctx.save();
    this.applyShadowState(ctx, paint, rctx);
    const originalFill = ctx.fillStyle;
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fillText(text, 0, 0);
    ctx.fillStyle = originalFill;
    ctx.restore();
  }

  /** Cast this shadow from an already-rendered effect layer. */
  castImage(
    ctx: CanvasContext2D,
    input: Canvas,
    rctx: ResolveContext,
    fontPaint: Paint = solidPaint('#000000'),
    bounds: PaintBounds = { x: 0, y: 0, width: input.width, height: input.height },
    transform?: PaintTransform,
  ): void {
    if (!this.getProp<boolean>('enabled')?.resolve(rctx)) return;
    if (!this.hasVisibleShadow(rctx)) return;
    const paint = this.shadowPaint(fontPaint, rctx);
    this.drawLongShadowImage(ctx, input, paint, rctx, bounds, transform, true);
    if (paint.type !== 'solid') {
      this.castPaintedImage(ctx, input, paint, rctx, bounds, transform);
      return;
    }
    const shadow = acquireCanvas(input.width, input.height);
    try {
      const shadowContext = shadow.getContext('2d');
      this.applyShadowState(shadowContext, paint, rctx, true);
      shadowContext.drawImage(input, 0, 0);
      shadowContext.globalCompositeOperation = 'destination-out';
      shadowContext.shadowColor = 'rgba(0,0,0,0)';
      shadowContext.shadowBlur = 0;
      shadowContext.shadowOffsetX = 0;
      shadowContext.shadowOffsetY = 0;
      shadowContext.drawImage(input, 0, 0);
      ctx.drawImage(shadow, 0, 0);
    } finally {
      releaseCanvas(shadow);
    }
  }

  /**
 * Cast this shadow by filling an opaque copy of the box's rounded path with
 * the shadow canvas state set. The real fill is drawn afterwards by `BackgroundStyle`.
 */
  castOnBox(ctx: CanvasContext2D, box: Box, cornerRadius: CornerRadiusProvider | undefined, rctx: ResolveContext, extraAlpha = 1): void {
    if (!this.getProp<boolean>('enabled')?.resolve(rctx)) return;
    if (!this.hasVisibleShadow(rctx)) return;
    if (box.width <= 0 || box.height <= 0) return;
    ctx.save();
    ctx.globalAlpha = ctx.globalAlpha * extraAlpha;
    const geometry = cornerRadius ? scaleCornerGeometryToFit(cornerRadius.cornerGeometry(rctx), box.width, box.height) : ZERO_GEOMETRY;
    this.drawLongShadowRoundedBox(ctx, box, geometry, rctx, 1);
    this.applyShadowState(ctx, solidPaint('#000000'), rctx);
    ctx.beginPath();
    drawRoundedRectanglePath(ctx, box.x, box.y, box.width, box.height, geometry);
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fill();
    ctx.restore();
  }

  /**
 * Cast this shadow by filling an opaque copy of a prebuilt path (e.g. a
 * multi-row union band) with the shadow canvas state set.
 */
  castOnPath(ctx: CanvasContext2D, path: SkiaPath2D, rctx: ResolveContext, extraAlpha = 1): void {
    if (!this.getProp<boolean>('enabled')?.resolve(rctx)) return;
    if (!this.hasVisibleShadow(rctx)) return;
    ctx.save();
    ctx.globalAlpha = ctx.globalAlpha * extraAlpha;
    this.drawLongShadowPath(ctx, path, rctx, 1);
    this.applyShadowState(ctx, solidPaint('#000000'), rctx);
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fill(path);
    ctx.restore();
  }
}
