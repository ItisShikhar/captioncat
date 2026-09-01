import type { SkiaPath2D } from '../../../utilities/canvas-utils';
import type { Canvas } from '#platform/canvas.js';
import type { CornerRadiusProvider } from '../components/border-radius';
import { compositionScaleOf, type Box, type CanvasContext2D, type Margins, type ResolveContext } from '../types';
import { strokePathWithStyle, strokeRoundedBox, type BoxStrokePosition, type BoxStrokeStyle } from './box-stroke-utils';
import { Effect } from './effect';
import { drawImageOutline } from './image-outline';
import { resolvePaint, solidPaint, transformPaintBounds, type PaintBounds, type PaintTransform } from '../paint';

/** Stroke around a component's box outline (e.g. a `BackgroundStyle`'s rounded rect). */
export class BorderEffect extends Effect {
  readonly type = 'border';

  override getMargins(_ctx: ResolveContext): Margins {
    const width = this.getProp<number>('width')?.maxNumber() ?? 0;
    const position = this.getProp<string>('position')?.base;
    const margin = position === 'inner' ? 0 : position === 'center' ? width / 2 : width;
    return { x: margin, y: margin };
  }

  private resolvedStyle(ctx: CanvasContext2D, rctx: ResolveContext, bounds: Box): BoxStrokeStyle | undefined {
    if (this.getProp<boolean>('enabled')?.resolve(rctx) === false) return undefined;
    const width = Number(this.getProp<number>('width')?.resolve(rctx) ?? 0);
    if (width <= 0) return undefined;
    const paint = this.getProp<import('../paint').Paint>('color')?.resolve(rctx) ?? solidPaint('rgba(0,0,0,0)');
    const rawPosition = String(this.getProp<string>('position')?.resolve(rctx) ?? 'outer');
    const position: BoxStrokePosition = rawPosition === 'inner' || rawPosition === 'center' ? rawPosition : 'outer';
    const style = String(this.getProp<string>('style')?.resolve(rctx) ?? 'solid')
      .trim()
      .toLowerCase();
    const normalizedStyle = style === 'dashed' || style === 'dotted' ? style : 'solid';
    return { width, color: resolvePaint(ctx, paint, bounds), position, style: normalizedStyle };
  }

  /** Stroke this border along the box's rounded path. */
  strokeBox(ctx: CanvasContext2D, box: Box, cornerRadius: CornerRadiusProvider | undefined, rctx: ResolveContext): void {
    strokeRoundedBox(ctx, box, cornerRadius, rctx, this.resolvedStyle(ctx, rctx, box));
  }

  /** Stroke this border along a prebuilt path (e.g. a multi-row union band). */
  strokePath(ctx: CanvasContext2D, path: SkiaPath2D, rctx: ResolveContext, bounds?: PaintBounds): void {
    strokePathWithStyle(
      ctx,
      path,
      this.resolvedStyle(ctx, rctx, bounds ?? { x: 0, y: 0, width: ctx.canvas.width, height: ctx.canvas.height }),
    );
  }

  /** Outline an already-rendered effect layer when this border follows another effect. */
  strokeImage(
    ctx: CanvasContext2D,
    input: Canvas,
    rctx: ResolveContext,
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
      this.resolvedStyle(ctx, rctx, paintBounds),
      compositionScaleOf(rctx),
    );
  }
}
