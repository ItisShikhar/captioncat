import { compositionScaleOf, type CanvasContext2D, type Margins, type ResolveContext } from '../types';
import { Effect } from './effect';

/** Gaussian blur over the finished surface (via `ctx.filter`). */
export class GaussianBlurEffect extends Effect {
  readonly type = 'blur';

  override getMargins(_ctx: ResolveContext): Margins {
    const blurRadius = this.getProp<number>('blurRadius')?.maxNumber() ?? 0;
    return { x: blurRadius, y: blurRadius };
  }

  override apply(ctx: CanvasContext2D, rctx: ResolveContext, draw: () => void): void {
    const blurRadius = Number(this.getProp<number>('blurRadius')?.resolve(rctx) ?? 0) * compositionScaleOf(rctx);
    const showOriginal = this.getShowOriginal(rctx);
    if (blurRadius <= 0) {
      draw();
      return;
    }
    if (showOriginal === 'back') draw();
    ctx.save();
    ctx.filter = `blur(${blurRadius}px)`;
    draw();
    ctx.restore();
    if (showOriginal === 'front') draw();
  }
}
