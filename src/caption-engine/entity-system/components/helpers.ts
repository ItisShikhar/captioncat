import { type CanvasContext2D, type ResolveContext, type Vector2, toVec2 } from '../types';
import {
  measureTextWithLetterSpacing,
  resolveLetterSpacing,
  resolveTextRunsLayout,
  type TextRun,
  type TextRunStyle,
} from '../text-layout';
import type { Component } from './component';

export type DecorationMetrics = {
  textWidth: number;
  ascent: number;
  descent: number;
  left: number;
  right: number;
};

/** Measure a word's box for decoration geometry (font must be set on ctx). */
export function measureDecoration(
  ctx: CanvasContext2D,
  text: string,
  letterSpacing = 0,
  resolveRunStyle?: (run: TextRun) => TextRunStyle,
): DecorationMetrics {
  if (resolveRunStyle) {
    const metrics = resolveTextRunsLayout(ctx, text, letterSpacing, resolveRunStyle).metrics;
    return {
      textWidth: metrics.width,
      ascent: metrics.ascent,
      descent: metrics.descent,
      left: -metrics.width / 2,
      right: metrics.width / 2,
    };
  }
  const textMetrics = ctx.measureText(text);
  const spacing = resolveLetterSpacing(letterSpacing);
  const textWidth = spacing === 0 ? textMetrics.width : measureTextWithLetterSpacing(ctx, text, spacing).width;
  const ascent = textMetrics.actualBoundingBoxAscent || 0;
  const descent = textMetrics.actualBoundingBoxDescent || 0;
  const left =
    spacing === 0 && typeof textMetrics.actualBoundingBoxLeft === 'number'
      ? -textMetrics.actualBoundingBoxLeft
      : -textWidth / 2;
  const right =
    spacing === 0 && typeof textMetrics.actualBoundingBoxRight === 'number'
      ? textMetrics.actualBoundingBoxRight
      : textWidth / 2;
  return { textWidth, ascent, descent, left, right };
}

/** Coerce a cap token to a legal `CanvasLineCap` (defaults to round). */
export function toLineCap(raw: unknown): CanvasLineCap {
  const normalizedValue = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return normalizedValue === 'butt' || normalizedValue === 'square' || normalizedValue === 'round'
    ? normalizedValue
    : 'round';
}

/** Apply a case transform to display text (mirrors legacy applyTextCaseTransform). */
export function applyCaseTransform(text: string, mode: unknown): string {
  switch (mode) {
    case 'uppercase':
      return text.toUpperCase();
    case 'lowercase':
      return text.toLowerCase();
    case 'capitalize':
      return text.replace(
        /^([^\p{L}]*)(\p{L})/u,
        (_match, prefix: string, first: string) => `${prefix}${first.toUpperCase()}`,
      );
    default:
      return text;
  }
}

/** Apply rotation(deg)→scale→position from a component's props around the origin. */
export function applyTransformFrom(
  comp: Component,
  ctx: CanvasContext2D,
  rctx: ResolveContext,
  includePosition = true,
  positionOverride?: Vector2,
): void {
  const rotation = Number(comp.getProp<number>('rotation')?.resolve(rctx) ?? 0);
  if (rotation !== 0) ctx.rotate((rotation * Math.PI) / 180);
  const scale = toVec2(comp.getProp<Vector2>('scale')?.resolve(rctx) ?? { x: 1, y: 1 });
  if (scale.x !== 1 || scale.y !== 1) ctx.scale(scale.x, scale.y);
  if (includePosition) {
    const position = positionOverride ?? toVec2(comp.getProp<Vector2>('position')?.resolve(rctx) ?? { x: 0, y: 0 });
    if (position.x !== 0 || position.y !== 0) ctx.translate(position.x, position.y);
  }
}
