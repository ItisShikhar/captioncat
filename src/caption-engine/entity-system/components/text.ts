import type { CanvasContext2D, Margins, PaintOwner, ResolveContext } from '../types';
import { ShadowEffect, StrokeEffect, TypewriterEffect, type EffectSource } from '../effects';
import type { TypewriterLayout } from '../effects/typewriter';
import { renderLayeredEffectStack, renderWrappedEffect } from '../effects/effect-stack';
import { isOpaquePaint, opaquePaint, resolvePaint, solidPaint, type Paint } from '../paint';
import {
  drawTextWithFontRuns,
  drawTextWithLetterSpacing,
  isEmojiGrapheme,
  measureTextAtAlphabeticBaseline,
  measureTextWithLetterSpacing,
  resolveLetterSpacing,
  resolveTextRunsLayout,
  resolveTextInkMetrics,
  segmentTextGraphemes,
  type TextRun,
} from '../text-layout';
import { Component } from './component';
import { Font } from './font';
import { applyCaseTransform } from './helpers';
import { Strikethrough } from './strikethrough';
import { Underline } from './underline';

/**
 * The visual text of a word: color, case transform, and letter spacing plus a
 * Font dependency, Underline[], Strikethrough[] components, and effects.
 */
export class Text extends Component {
  readonly type = 'text';
  override readonly allowedEntities = ['word'];
  override readonly allowedQuantity = 1;
  private fontDependency: Font | undefined;

  override getMargins(ctx: ResolveContext, source?: EffectSource): Margins {
    return this.sumChildMargins(ctx, source);
  }

  /** The owned Font component, supporting legacy nested presets. */
  font(): Font | undefined {
    return (
      this.components.find((component): component is Font => component instanceof Font) ??
      this.fontDependency
    );
  }

  setFontDependency(font: Font | undefined): void {
    this.fontDependency = font;
  }

  /** Set ctx.font from the owned Font (no-op if none). */
  applyFont(ctx: CanvasContext2D, rctx: ResolveContext): void {
    const font = this.font();
    if (font) ctx.font = font.fontString(rctx);
    ctx.direction = rctx.textDirection;
  }

  /** The glyphs to render/measure after applying the caseTransform prop. */
  displayText(text: string, rctx: ResolveContext): string {
    return applyCaseTransform(text, this.getProp<string>('caseTransform')?.resolve(rctx));
  }

  /**
 * Measure a word's advance width and line height in this text's font. Height
 * falls back to the font size when the platform omits bounding-box metrics.
 */
  measure(
    ctx: CanvasContext2D,
    rctx: ResolveContext,
    text: string,
  ): { width: number; height: number; ascent: number; descent: number; baselineOffset: number } {
    this.applyFont(ctx, rctx);
    const displayText = this.displayText(text, rctx);
    const letterSpacing = this.resolvedLetterSpacing(rctx);
    const font = this.font();
    if (font && segmentTextGraphemes(displayText).some((grapheme) => isEmojiGrapheme(grapheme))) {
      const metrics = resolveTextRunsLayout(ctx, displayText, letterSpacing, (run) => font.textRunStyle(rctx, run.isEmoji)).metrics;
      return {
        width: metrics.width,
        height: metrics.height || font.size(rctx),
        ascent: metrics.ascent,
        descent: metrics.descent,
        baselineOffset: metrics.baselineOffset,
      };
    }
    if (letterSpacing === 0) {
      const metrics = measureTextAtAlphabeticBaseline(ctx, displayText);
      const inkMetrics = resolveTextInkMetrics(metrics);
      return {
        width: metrics.width,
        height: inkMetrics.height || this.font()?.size(rctx) || 0,
        ascent: inkMetrics.ascent,
        descent: inkMetrics.descent,
        baselineOffset: inkMetrics.baselineOffset,
      };
    }
    const metrics = measureTextWithLetterSpacing(ctx, displayText, letterSpacing);
    return {
      width: metrics.width,
      height: metrics.height || this.font()?.size(rctx) || 0,
      ascent: metrics.ascent,
      descent: metrics.descent,
      baselineOffset: metrics.baselineOffset,
    };
  }

  /**
  * Paint the word glyphs at the origin. Set the font, then draw strokes,
  * shadows, and the colored fill. The caller translates the context to the
  * word's center.
  */
  override paint(ctx: CanvasContext2D, rctx: ResolveContext, owner: PaintOwner): void {
    this.paintInternal(ctx, rctx, owner, true);
  }

  paintBase(ctx: CanvasContext2D, rctx: ResolveContext, owner: PaintOwner): void {
    this.paintInternal(ctx, rctx, owner, false);
  }

  private paintInternal(ctx: CanvasContext2D, rctx: ResolveContext, owner: PaintOwner, includeEffects: boolean): void {
    const raw = owner.text ?? '';
    if (!raw) return;
    const text = this.displayText(raw, rctx);
    const font = this.font();
    const hasEmoji = font !== undefined && segmentTextGraphemes(text).some((grapheme) => isEmojiGrapheme(grapheme));
    const resolveRunStyle = hasEmoji && font ? (run: TextRun) => font.textRunStyle(rctx, run.isEmoji) : undefined;

    const paint = this.getProp<Paint>('color')?.resolve(rctx) ?? solidPaint('white');
    const inheritBaseAlpha = this.effectsInheritBaseAlpha(rctx);
    const effectPaint = inheritBaseAlpha ? paint : opaquePaint(paint);
    const letterSpacing = this.resolvedLetterSpacing(rctx);
    const measured = this.measure(ctx, rctx, raw);
    const baselineOffset = owner.textBaselineOffset ?? measured.baselineOffset;
    const paintBounds = { x: -measured.width / 2, y: -measured.height / 2, width: measured.width, height: measured.height };
    const typewriter = this.effects.find(
      (effect): effect is TypewriterEffect => effect instanceof TypewriterEffect && effect.isEnabled(rctx),
    );
    const postPaintEffects = this.effects.filter((effect) => !(effect instanceof TypewriterEffect));
    let typewriterLayout: TypewriterLayout | undefined;

    const drawText = (output: CanvasContext2D, textPaint = paint) => {
      this.applyFont(output, rctx);
      output.save();
      output.textAlign = 'center';
      output.textBaseline = 'alphabetic';
      output.translate(0, baselineOffset);
      if (!typewriter) {
        output.fillStyle = resolvePaint(output, textPaint, paintBounds);

        for (const component of this.components) {
          if (
            (component instanceof Underline || component instanceof Strikethrough) &&
            component.renderOrder(rctx) === 'behind'
          ) {
            component.paintLine(output, text, textPaint, rctx, letterSpacing, resolveRunStyle);
          }
        }

        output.fillStyle = resolvePaint(output, textPaint, paintBounds);
        if (hasEmoji && resolveRunStyle) {
          drawTextWithFontRuns(
            output,
            text,
            letterSpacing,
            resolveRunStyle,
            (drawContext, glyph, x, y) => {
              drawContext.fillText(glyph, x, y);
            },
          );
        } else {
          drawTextWithLetterSpacing(output, text, letterSpacing, (drawContext, glyph, x, y) => {
            drawContext.fillText(glyph, x, y);
          });
        }
        this.applyFont(output, rctx);

        for (const component of this.components) {
          if (
            (component instanceof Underline || component instanceof Strikethrough) &&
            component.renderOrder(rctx) === 'inFront'
          ) {
            component.paintLine(output, text, textPaint, rctx, letterSpacing, resolveRunStyle);
          }
        }
      } else {
        typewriterLayout = typewriter.buildLayout(
          output,
          rctx,
          text,
          textPaint,
          letterSpacing,
          hasEmoji ? resolveRunStyle : undefined,
        );
        typewriter.renderUnits(output, typewriterLayout, (unitOutput, unit) => {
          unitOutput.save();
          unitOutput.translate(unit.centerX + unit.offset.x, unit.offset.y);
          if (unit.rotation !== 0) unitOutput.rotate((unit.rotation * Math.PI) / 180);
          unitOutput.scale(unit.scale.x, unit.scale.y);
          if (unit.font) unitOutput.font = unit.font;
          if (unit.baselineOffset) unitOutput.translate(0, unit.baselineOffset);
          unitOutput.textAlign = 'center';
          unitOutput.textBaseline = 'alphabetic';
          const unitBounds = {
            x: unit.centerX - unit.width / 2,
            y: -measured.height / 2,
            width: unit.width,
            height: measured.height,
          };

          for (const component of this.components) {
            if (
              (component instanceof Underline || component instanceof Strikethrough) &&
              component.renderOrder(rctx) === 'behind'
            ) {
              component.paintLine(unitOutput, unit.text, unit.color, rctx);
            }
          }

          unitOutput.fillStyle = resolvePaint(unitOutput, unit.color, unitBounds);
          unitOutput.fillText(unit.text, 0, 0);

          for (const component of this.components) {
            if (
              (component instanceof Underline || component instanceof Strikethrough) &&
              component.renderOrder(rctx) === 'inFront'
            ) {
              component.paintLine(unitOutput, unit.text, unit.color, rctx);
            }
          }
          unitOutput.restore();
        });
        this.applyFont(output, rctx);
      }
      output.restore();
    };

    if (!includeEffects) {
      drawText(ctx);
      return;
    }

    if (postPaintEffects.length === 0) {
      drawText(ctx);
      if (typewriter && typewriterLayout) typewriter.paintCursor(ctx, rctx, typewriterLayout, paint, paintBounds);
      return;
    }

    renderLayeredEffectStack(
      ctx,
      rctx,
      postPaintEffects,
      // Keep outside strokes behind the fill. Inside and centered strokes must
      // stay in front so the fill does not hide their painted area.
      (effect) => (effect instanceof StrokeEffect ? effect.isUnderlay(rctx) : effect instanceof ShadowEffect),
      drawText,
      (effect, output, input, effectContext, baseTransform, baseInput) => {
        if (effect instanceof StrokeEffect) {
          const appliesOnBase = effect.getAppliesOn(effectContext) === 'base';
          if (typewriter && appliesOnBase) {
            effect.strokeImage(output, input, effectContext, effectPaint, paintBounds, baseTransform);
          } else if (appliesOnBase && (!inheritBaseAlpha || isOpaquePaint(paint))) {
            output.setTransform(baseTransform);
            this.applyFont(output, effectContext);
            output.textAlign = 'center';
            output.textBaseline = 'alphabetic';
            output.translate(0, baselineOffset);
            effect.strokeGlyph(
              output,
              text,
              effectPaint,
              effectContext,
              paintBounds,
              letterSpacing,
              resolveRunStyle,
            );
          } else {
            effect.strokeImage(output, input, effectContext, effectPaint, paintBounds, baseTransform);
          }
          return;
        }
        if (effect instanceof ShadowEffect) {
          effect.castImage(output, input, effectContext, effectPaint, paintBounds, baseTransform);
          return;
        }
        renderWrappedEffect(effect, output, input, effectContext, {
          baseTransform,
          baseInput,
          paintBounds,
          localizeSignalEffects: true,
          includeOriginal: inheritBaseAlpha,
          source: { bounds: measured, color: effectPaint },
        });
      },
      {
        paintBounds,
        ...(!inheritBaseAlpha
          ? { renderEffectBase: (output: CanvasContext2D) => drawText(output, effectPaint) }
          : {}),
      },
    );
    if (typewriter && typewriterLayout) typewriter.paintCursor(ctx, rctx, typewriterLayout, paint, paintBounds);
  }

  private resolvedLetterSpacing(rctx: ResolveContext): number {
    return resolveLetterSpacing(
      rctx.letterSpacingOverride ?? this.getProp<number>('letterSpacing')?.resolve(rctx),
    );
  }
}
