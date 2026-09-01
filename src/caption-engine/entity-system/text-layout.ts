import type { CanvasContext2D } from './types';

interface CanvasTextMetrics {
  actualBoundingBoxAscent?: number;
  actualBoundingBoxDescent?: number;
  fontBoundingBoxAscent?: number;
  fontBoundingBoxDescent?: number;
}

export interface TextInkMetrics {
  height: number;
  ascent: number;
  descent: number;
  baselineOffset: number;
}

export interface TextLayoutMetrics {
  width: number;
  height: number;
  ascent: number;
  descent: number;
  baselineOffset: number;
  graphemes: readonly string[];
  graphemeWidths: readonly number[];
  graphemeAdvances: readonly number[];
}

export type TextRunAlignment = 'baseline' | 'optical';

export interface TextRunStyle {
  font: string;
  baselineOffset: number;
  alignment?: TextRunAlignment;
}

export interface TextRun {
  text: string;
  isEmoji: boolean;
}

export interface ResolvedTextRun extends TextRun {
  font: string;
  baselineOffset: number;
  width: number;
  graphemes: readonly string[];
  graphemeWidths: readonly number[];
  graphemeAdvances: readonly number[];
}

export interface TextRunsLayout {
  metrics: TextLayoutMetrics;
  runs: readonly ResolvedTextRun[];
}

function finiteMetric(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : undefined;
}

export function resolveTextInkMetrics(metrics: CanvasTextMetrics): TextInkMetrics {
  const actualAscent = finiteMetric(metrics.actualBoundingBoxAscent);
  const actualDescent = finiteMetric(metrics.actualBoundingBoxDescent);
  const fallbackAscent = finiteMetric(metrics.fontBoundingBoxAscent);
  const fallbackDescent = finiteMetric(metrics.fontBoundingBoxDescent);
  const ascent = actualAscent ?? fallbackAscent;
  const descent = actualDescent ?? fallbackDescent;
  const height = actualAscent !== undefined && actualDescent !== undefined ? actualAscent + actualDescent : 0;

  return {
    height,
    ascent: ascent ?? 0,
    descent: descent ?? 0,
    baselineOffset: ascent !== undefined && descent !== undefined ? (ascent - descent) / 2 : 0,
  };
}

export function measureTextAtAlphabeticBaseline(ctx: CanvasContext2D, text: string): ReturnType<CanvasContext2D['measureText']> {
  ctx.save();
  try {
    ctx.textBaseline = 'alphabetic';
    return ctx.measureText(text);
  } finally {
    ctx.restore();
  }
}

export function resolveLetterSpacing(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function segmentTextGraphemes(text: string): string[] {
  if (!text) return [];
  if (typeof Intl.Segmenter === 'function') {
    return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (part) => part.segment);
  }
  return Array.from(text);
}

const EMOJI_GRAPHEME_PARTS = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|\p{Mark}|[\u200D\uFE0E\uFE0F\u20E3])+$/u;

export function isEmojiGrapheme(value: string): boolean {
  return EMOJI_GRAPHEME_PARTS.test(value) && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(value);
}

export function segmentTextRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  for (const grapheme of segmentTextGraphemes(text)) {
    const isEmoji = isEmojiGrapheme(grapheme);
    const previous = runs.at(-1);
    if (previous?.isEmoji === isEmoji) {
      previous.text += grapheme;
    } else {
      runs.push({ text: grapheme, isEmoji });
    }
  }
  return runs;
}

export function measureTextWithLetterSpacing(
  ctx: CanvasContext2D,
  text: string,
  letterSpacing: number,
): TextLayoutMetrics {
  ctx.save();
  try {
    ctx.textBaseline = 'alphabetic';
    const metrics = ctx.measureText(text);
    const inkMetrics = resolveTextInkMetrics(metrics);
    const graphemes = segmentTextGraphemes(text);
    const graphemeWidths = graphemes.map((grapheme) => ctx.measureText(grapheme).width);
    const spacing = resolveLetterSpacing(letterSpacing);
    const graphemeAdvances = graphemeWidths.slice();
    if (spacing !== 0) {
      let prefix = '';
      let previousPrefixWidth = 0;
      for (let index = 0; index < graphemes.length; index += 1) {
        const grapheme = graphemes[index];
        prefix += grapheme;
        const prefixWidth = ctx.measureText(prefix).width;
        graphemeAdvances[index] = prefixWidth - previousPrefixWidth;
        previousPrefixWidth = prefixWidth;
      }
    }
    const width = metrics.width + spacing * Math.max(0, graphemes.length - 1);
    return {
      width,
      height: inkMetrics.height,
      ascent: inkMetrics.ascent,
      descent: inkMetrics.descent,
      baselineOffset: inkMetrics.baselineOffset,
      graphemes,
      graphemeWidths,
      graphemeAdvances,
    };
  } finally {
    ctx.restore();
  }
}

export function resolveTextRunsLayout(
  ctx: CanvasContext2D,
  text: string,
  letterSpacing: number,
  resolveStyle: (run: TextRun) => TextRunStyle,
): TextRunsLayout {
  const spacing = resolveLetterSpacing(letterSpacing);
  const runs = segmentTextRuns(text);
  if (runs.length === 0) {
    return {
      metrics: {
        width: 0,
        height: 0,
        ascent: 0,
        descent: 0,
        baselineOffset: 0,
        graphemes: [],
        graphemeWidths: [],
        graphemeAdvances: [],
      },
      runs: [],
    };
  }

  const measuredRuns = runs.map((run) => {
    const style = resolveStyle(run);
    ctx.font = style.font;
    const metrics = measureTextWithLetterSpacing(ctx, run.text, spacing);
    return { ...run, style, metrics };
  });
  const referenceRun = measuredRuns.find((run) => !run.isEmoji);
  const referenceBaselineOffset = referenceRun?.metrics.baselineOffset;
  const resolvedRuns: ResolvedTextRun[] = measuredRuns.map((run) => {
    const opticalOffset =
      run.isEmoji && run.style.alignment === 'optical' && referenceBaselineOffset !== undefined
        ? run.metrics.baselineOffset - referenceBaselineOffset
        : 0;
    return {
      text: run.text,
      isEmoji: run.isEmoji,
      font: run.style.font,
      baselineOffset: run.style.baselineOffset + opticalOffset,
      width: run.metrics.width,
      graphemes: run.metrics.graphemes,
      graphemeWidths: run.metrics.graphemeWidths,
      graphemeAdvances: run.metrics.graphemeAdvances,
    };
  });

  const ascent = Math.max(
    ...measuredRuns.map((run, index) => Math.max(0, run.metrics.ascent - resolvedRuns[index].baselineOffset)),
  );
  const descent = Math.max(
    ...measuredRuns.map((run, index) => Math.max(0, run.metrics.descent + resolvedRuns[index].baselineOffset)),
  );
  const graphemes = resolvedRuns.flatMap((run) => run.graphemes);
  const graphemeWidths = resolvedRuns.flatMap((run) => run.graphemeWidths);
  const graphemeAdvances = resolvedRuns.flatMap((run) => run.graphemeAdvances);
  const width = resolvedRuns.reduce((total, run) => total + run.width, 0) + spacing * Math.max(0, resolvedRuns.length - 1);

  return {
    metrics: {
      width,
      height: ascent + descent,
      ascent,
      descent,
      baselineOffset: (ascent - descent) / 2,
      graphemes,
      graphemeWidths,
      graphemeAdvances,
    },
    runs: resolvedRuns,
  };
}

export function drawTextWithFontRuns(
  ctx: CanvasContext2D,
  text: string,
  letterSpacing: number,
  resolveStyle: (run: TextRun) => TextRunStyle,
  drawText: (ctx: CanvasContext2D, text: string, x: number, y: number, run: ResolvedTextRun) => void,
): void {
  const spacing = resolveLetterSpacing(letterSpacing);
  const layout = resolveTextRunsLayout(ctx, text, spacing, resolveStyle);
  if (layout.runs.length === 0) return;

  ctx.save();
  ctx.textAlign = 'left';
  let x = -layout.metrics.width / 2;
  for (const [runIndex, run] of layout.runs.entries()) {
    ctx.font = run.font;
    if (spacing === 0) {
      drawText(ctx, run.text, x, run.baselineOffset, run);
    } else {
      let graphemeX = x;
      for (const [graphemeIndex, grapheme] of run.graphemes.entries()) {
        drawText(ctx, grapheme, graphemeX, run.baselineOffset, run);
        graphemeX += run.graphemeAdvances[graphemeIndex] + spacing;
      }
    }
    x += run.width;
    if (runIndex < layout.runs.length - 1) x += spacing;
  }
  ctx.restore();
}

export function drawTextWithLetterSpacing(
  ctx: CanvasContext2D,
  text: string,
  letterSpacing: number,
  drawText: (ctx: CanvasContext2D, text: string, x: number, y: number) => void,
): void {
  const spacing = resolveLetterSpacing(letterSpacing);
  if (spacing === 0) {
    drawText(ctx, text, 0, 0);
    return;
  }
  const metrics = measureTextWithLetterSpacing(ctx, text, spacing);
  if (metrics.graphemes.length < 2) {
    drawText(ctx, text, 0, 0);
    return;
  }

  ctx.save();
  ctx.textAlign = 'left';
  let x = -metrics.width / 2;
  for (let index = 0; index < metrics.graphemes.length; index += 1) {
    drawText(ctx, metrics.graphemes[index], x, 0);
    x += metrics.graphemeAdvances[index];
    if (index < metrics.graphemes.length - 1) x += spacing;
  }
  ctx.restore();
}
