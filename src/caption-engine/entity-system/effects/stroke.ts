import type { SkiaPath2D } from '../../../utilities/canvas-utils';
import { Canvas } from '#platform/canvas.js';
import { acquireCanvas, releaseCanvas } from '../../../utilities/canvas-pool';
import type { CornerRadiusProvider } from '../components/border-radius';
import { compositionScaleOf, type Box, type CanvasContext2D, type Margins, type ResolveContext } from '../types';
import {
  applyStrokeStyle,
  renderSupersampled,
  strokePathWithStyle,
  strokeRoundedBox,
  type BoxStrokePosition,
  type BoxStrokeStyle,
} from './box-stroke-utils';
import { Effect } from './effect';
import { drawImageOutline } from './image-outline';
import {
  resolvePaint,
  solidPaint,
  transformPaintBounds,
  type Paint,
  type PaintBounds,
  type PaintTransform,
} from '../paint';
import {
  drawTextWithFontRuns,
  drawTextWithLetterSpacing,
  type TextRun,
  type TextRunStyle,
} from '../text-layout';

export type StrokeAlignment = 'inside' | 'center' | 'outside';

type StrokeStyle = NonNullable<BoxStrokeStyle['style']>;

function normalizeStrokeStyle(value: unknown): StrokeStyle {
  const rawStyle = String(value ?? 'solid').trim().toLowerCase();
  return rawStyle === 'dashed' || rawStyle === 'dotted' ? rawStyle : 'solid';
}

/** Draw an outline around a word glyph or a background box. */
export class StrokeEffect extends Effect {
  readonly type = 'stroke';

  private resolvedStyle(
    ctx: CanvasContext2D,
    rctx: ResolveContext,
    bounds: PaintBounds,
    fontPaint?: Paint,
    alphaMultiplier = 1,
  ): BoxStrokeStyle | undefined {
    if (this.getProp<boolean>('enabled')?.resolve(rctx) === false) return undefined;
    const width = Number(this.getProp<number>('width')?.resolve(rctx) ?? 0);
    if (width <= 0) return undefined;
    const style = normalizeStrokeStyle(this.getProp<string>('style')?.resolve(rctx));
    const rawCap = String(this.getProp<string>('capType')?.resolve(rctx) ?? 'round').trim().toLowerCase();
    const cap = rawCap === 'butt' || rawCap === 'square' ? rawCap : 'round';
    const rawJoin = String(this.getProp<string>('joinType')?.resolve(rctx) ?? 'round').trim().toLowerCase();
    const join = rawJoin === 'miter' || rawJoin === 'bevel' ? rawJoin : 'round';
    const useFontColor = this.getProp<boolean>('useFontColor')?.resolve(rctx) ?? false;
    const paint = useFontColor
      ? fontPaint ?? solidPaint('rgba(0,0,0,0)')
      : this.getProp<Paint>('color')?.resolve(rctx) ?? solidPaint('rgba(0,0,0,0)');
    const opacity = Number(this.getProp<number>('opacity')?.resolve(rctx) ?? 1);
    const dash = Number(this.getProp<number>('dash')?.resolve(rctx) ?? width * 2);
    const gap = Number(
      this.getProp<number>(style === 'dotted' ? 'spacing' : 'gap')?.resolve(rctx) ??
        (style === 'dotted' ? width * 1.6 : width * 2),
    );
    const dashOffset = Number(this.getProp<number>('dashOffset')?.resolve(rctx) ?? 0);
    return {
      width,
      color: resolvePaint(ctx, paint, bounds, opacity * alphaMultiplier),
      position: positionForAlignment(this.resolveAlignment(rctx)),
      style,
      cap,
      join,
      dash,
      gap,
      dashOffset,
      antialiasScale: this.resolvedAntialiasScale(rctx),
    };
  }

  private resolvedAntialiasScale(rctx: ResolveContext): number {
    const value = Number(this.getProp<number>('antialiasScale')?.resolve(rctx) ?? 2);
    if (!Number.isFinite(value)) return 2;
    if (value <= 1.5) return 1;
    if (value <= 3) return 2;
    if (value <= 6) return 4;
    return 8;
  }

  override getMargins(ctx: ResolveContext): Margins {
    const width = this.getProp<number>('width')?.maxNumber() ?? 0;
    const margin = marginForAlignment(this.resolveAlignment(ctx), width);
    return { x: margin, y: margin };
  }

  /** Inside and centered strokes must be composited over the source so the source does not hide them. */
  isUnderlay(rctx: ResolveContext): boolean {
    return this.resolveAlignment(rctx) === 'outside';
  }

  private resolveAlignment(rctx: ResolveContext): StrokeAlignment {
    const raw = String(this.getProp<string>('alignment')?.resolve(rctx) ?? 'outside')
      .trim()
      .toLowerCase();
    return raw === 'inside' || raw === 'center' ? raw : 'outside';
  }

  /**
 * Stroke the given glyphs at the origin. `fontColor` is the resolved text
 * fill, used when this stroke is configured to reuse the font color.
 */
  strokeGlyph(
    ctx: CanvasContext2D,
    text: string,
    fontPaint: Paint,
    rctx: ResolveContext,
    bounds: PaintBounds,
    letterSpacing = 0,
    resolveRunStyle?: (run: TextRun) => TextRunStyle,
  ): void {
    if (!this.resolvedStyle(ctx, rctx, bounds, fontPaint)) return;
    renderSupersampled(ctx, this.resolvedAntialiasScale(rctx), (output) => {
      output.font = ctx.font;
      output.textAlign = ctx.textAlign;
      output.textBaseline = ctx.textBaseline;
      output.direction = ctx.direction;
      const style = this.resolvedStyle(output, rctx, bounds, fontPaint);
      if (!style) return;
      output.save();
      if (style.position === 'inner') {
        strokeGlyphInside(output, text, style, letterSpacing, resolveRunStyle);
      } else if (applyStrokeStyle(output, { ...style, width: style.position === 'outer' ? style.width * 2 : style.width })) {
        drawStrokedText(output, text, letterSpacing, resolveRunStyle);
      }
      output.restore();
    });
  }

  /** Outline an already-rendered effect layer when this stroke follows another effect. */
  strokeImage(
    ctx: CanvasContext2D,
    input: Canvas,
    rctx: ResolveContext,
    fontPaint?: Paint,
    bounds?: PaintBounds,
    transform?: PaintTransform,
  ): void {
    const paintBounds = transformPaintBounds(
      bounds ?? { x: 0, y: 0, width: input.width, height: input.height },
      transform,
    );
    drawImageOutline(
      ctx,
      input,
      this.resolvedStyle(ctx, rctx, paintBounds, fontPaint),
      compositionScaleOf(rctx),
    );
  }

  /** Stroke a box's rounded outline (background usage). */
  strokeBoxOutline(
    ctx: CanvasContext2D,
    box: Box,
    cornerRadius: CornerRadiusProvider | undefined,
    rctx: ResolveContext,
    alphaMultiplier = 1,
  ): void {
    if (!this.resolvedStyle(ctx, rctx, box, undefined, alphaMultiplier)) return;
    renderSupersampled(ctx, this.resolvedAntialiasScale(rctx), (output) => {
      strokeRoundedBox(output, box, cornerRadius, rctx, this.resolvedStyle(output, rctx, box, undefined, alphaMultiplier));
    });
  }

  /** Stroke a prebuilt path's outline (e.g. a multi-row union band). */
  strokeOutlinePath(
    ctx: CanvasContext2D,
    path: SkiaPath2D,
    rctx: ResolveContext,
    bounds?: PaintBounds,
    alphaMultiplier = 1,
  ): void {
    const paintBounds = bounds ?? { x: 0, y: 0, width: ctx.canvas.width, height: ctx.canvas.height };
    if (!this.resolvedStyle(ctx, rctx, paintBounds, undefined, alphaMultiplier)) return;
    renderSupersampled(ctx, this.resolvedAntialiasScale(rctx), (output) => {
      strokePathWithStyle(
        output,
        path,
        this.resolvedStyle(output, rctx, paintBounds, undefined, alphaMultiplier),
      );
    });
  }
}

function positionForAlignment(alignment: StrokeAlignment): BoxStrokePosition {
  if (alignment === 'inside') return 'inner';
  if (alignment === 'center') return 'center';
  return 'outer';
}

function marginForAlignment(alignment: StrokeAlignment, width: number): number {
  if (alignment === 'inside') return 0;
  return alignment === 'center' ? width / 2 : width;
}

function strokeGlyphInside(
  ctx: CanvasContext2D,
  text: string,
  style: BoxStrokeStyle,
  letterSpacing: number,
  resolveRunStyle?: (run: TextRun) => TextRunStyle,
): void {
  const transform = ctx.getTransform();
  const strokeCanvas = acquireCanvas(ctx.canvas.width, ctx.canvas.height);
  const maskCanvas = acquireCanvas(ctx.canvas.width, ctx.canvas.height);
  try {
    const strokeContext = strokeCanvas.getContext('2d');
    strokeContext.setTransform(transform);
    strokeContext.font = ctx.font;
    strokeContext.textAlign = ctx.textAlign;
    strokeContext.textBaseline = ctx.textBaseline;
    strokeContext.direction = ctx.direction;
    if (applyStrokeStyle(strokeContext, { ...style, width: style.width * 2 })) {
      drawStrokedText(strokeContext, text, letterSpacing, resolveRunStyle);
    }

    const maskContext = maskCanvas.getContext('2d');
    maskContext.setTransform(transform);
    maskContext.font = ctx.font;
    maskContext.textAlign = ctx.textAlign;
    maskContext.textBaseline = ctx.textBaseline;
    maskContext.direction = ctx.direction;
    maskContext.fillStyle = 'rgba(255,255,255,1)';
    drawFilledText(maskContext, text, letterSpacing, resolveRunStyle);

    strokeContext.save();
    strokeContext.setTransform(1, 0, 0, 1, 0, 0);
    strokeContext.globalCompositeOperation = 'destination-in';
    strokeContext.drawImage(maskCanvas, 0, 0);
    strokeContext.restore();

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(strokeCanvas, 0, 0);
    ctx.restore();
  } finally {
    releaseCanvas(maskCanvas);
    releaseCanvas(strokeCanvas);
  }
}

function drawStrokedText(
  ctx: CanvasContext2D,
  text: string,
  letterSpacing: number,
  resolveRunStyle?: (run: TextRun) => TextRunStyle,
): void {
  if (resolveRunStyle) {
    drawTextWithFontRuns(
      ctx,
      text,
      letterSpacing,
      resolveRunStyle,
      (drawContext, glyph, x, y) => {
        drawContext.strokeText(glyph, x, y);
      },
    );
    return;
  }
  drawTextWithLetterSpacing(ctx, text, letterSpacing, (drawContext, glyph, x, y) => {
    drawContext.strokeText(glyph, x, y);
  });
}

function drawFilledText(
  ctx: CanvasContext2D,
  text: string,
  letterSpacing: number,
  resolveRunStyle?: (run: TextRun) => TextRunStyle,
): void {
  if (resolveRunStyle) {
    drawTextWithFontRuns(
      ctx,
      text,
      letterSpacing,
      resolveRunStyle,
      (drawContext, glyph, x, y) => {
        drawContext.fillText(glyph, x, y);
      },
    );
    return;
  }
  drawTextWithLetterSpacing(ctx, text, letterSpacing, (drawContext, glyph, x, y) => {
    drawContext.fillText(glyph, x, y);
  });
}
