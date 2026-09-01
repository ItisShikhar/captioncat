import { type CanvasContext2D, type Margins, type ResolveContext, type Vector2, toVec2 } from '../types';
import { resolvePaint, solidPaint, type Paint } from '../paint';
import { Component } from './component';
import type { EffectSource } from '../effects';
import { renderEffectStack, renderWrappedEffect } from '../effects/effect-stack';
import { measureDecoration, toLineCap } from './helpers';
import type { TextRun, TextRunStyle } from '../text-layout';

/** Strikethrough decoration across a word. */
export class Strikethrough extends Component {
  readonly type = 'strikethrough';
  override readonly allowedEntities = ['word'];
  override readonly allowedQuantity = 8;

  override getMargins(_ctx: ResolveContext, source?: EffectSource): Margins {
    const width = this.getProp<number>('width')?.maxNumber() ?? 0;
    const protrusion = this.getProp<number>('protrusion')?.maxNumber() ?? 0;
    let margins = { x: protrusion, y: width };
    for (const effect of this.effects) {
      if (!effect.isEnabled(_ctx)) continue;
      const effectMargins = source ? effect.getMargins(_ctx, source) : effect.getMargins(_ctx);
      margins = { x: margins.x + effectMargins.x, y: margins.y + effectMargins.y };
    }
    return margins;
  }

  /** 'inFront' (default) or 'behind' the glyph fill. */
  renderOrder(rctx: ResolveContext): 'behind' | 'inFront' {
    const raw = String(this.getProp<string>('renderOrder')?.resolve(rctx) ?? '')
      .trim()
      .toLowerCase();
    return raw === 'behind' ? 'behind' : 'inFront';
  }

  /** Draw the strikethrough across the glyphs at the origin. */
  paintLine(
    ctx: CanvasContext2D,
    text: string,
    fontPaint: Paint,
    rctx: ResolveContext,
    letterSpacing = 0,
    resolveRunStyle?: (run: TextRun) => TextRunStyle,
  ): void {
    if (this.getProp<boolean>('enabled')?.resolve(rctx) === false) return;
    const { textWidth, ascent, descent, left, right } = measureDecoration(ctx, text, letterSpacing, resolveRunStyle);
    const rawOffset = this.getProp<Vector2>('offset')?.resolve(rctx);
    const offset =
      rawOffset == null ? { x: 0, y: -Math.max(1, Math.round(Math.max(ascent * 0.4, 1))) } : toVec2(rawOffset);
    const width = Number(
      this.getProp<number>('width')?.resolve(rctx) ?? Math.max(1, Math.round(Math.max(ascent + descent, 12) * 0.08)),
    );
    const lineY = offset.y;
    const paint = this.getProp<Paint>('color')?.resolve(rctx) ?? fontPaint ?? solidPaint('rgba(0,0,0,0)');
    const protrusion = Math.max(
      0,
      Number(
        this.getProp<number>('protrusion')?.resolve(rctx) ?? Math.max(0, Math.round(Math.max(textWidth * 0.04, 2))),
      ),
    );
    const drawLine = (output: CanvasContext2D) => {
      output.save();
      output.lineCap = toLineCap(this.getProp('capType')?.resolve(rctx));
      output.strokeStyle = resolvePaint(output, paint, {
        x: left - protrusion + offset.x,
        y: lineY - width / 2,
        width: right - left + protrusion * 2,
        height: width,
      });
      output.lineWidth = width;
      output.beginPath();
      output.moveTo(left - protrusion + offset.x, lineY);
      output.lineTo(right + protrusion + offset.x, lineY);
      output.stroke();
      output.restore();
    };

    if (this.effects.length === 0) {
      drawLine(ctx);
      return;
    }
    const paintBounds = {
      x: left - protrusion + offset.x,
      y: lineY - width / 2,
      width: right - left + protrusion * 2,
      height: width,
    };
    renderEffectStack(ctx, rctx, this.effects, drawLine, (effect, output, input, effectContext, baseTransform) => {
      renderWrappedEffect(effect, output, input, effectContext, {
        baseTransform,
        paintBounds,
        localizeSignalEffects: true,
      });
    });
  }
}
