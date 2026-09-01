import { solidPaint } from './paint';
import type { SolidPaint } from './paint-types';

export type FillMode = 'single' | 'cycle' | 'alternate';

export interface FillPatternValue {
  pattern: FillMode;
  colors: string[];
  offset: number;
}

export interface FillPattern extends FillPatternValue {
  type: 'pattern';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Normalize the fill mode. A single fill and an empty palette use the normal
 * BackgroundStyle fill paint.
 */
export function normalizeFillPattern(value: unknown): FillPattern | undefined {
  if (!isRecord(value)) return undefined;
  if (value.type !== undefined && value.type !== 'pattern') return undefined;

  const colors = Array.isArray(value.colors)
    ? value.colors
        .filter((color): color is string => typeof color === 'string')
        .map((color) => color.trim())
        .filter((color) => color.length > 0)
    : [];
  const rawPattern = value.pattern;
  const pattern: FillMode =
    rawPattern === 'cycle' || rawPattern === 'alternate' || rawPattern === 'single'
      ? rawPattern
      : 'single';
  const offset = typeof value.offset === 'number' && Number.isFinite(value.offset) ? Math.trunc(value.offset) : 0;
  return { type: 'pattern', pattern, colors, offset };
}

export function resolveFillPatternPaint(pattern: FillPattern | undefined, index: number): SolidPaint | undefined {
  if (!pattern || pattern.pattern === 'single' || pattern.colors.length === 0) return undefined;
  const palette = pattern.pattern === 'alternate' ? pattern.colors.slice(0, 2) : pattern.colors;
  if (palette.length === 0) return undefined;
  const normalizedIndex = Number.isFinite(index) ? Math.trunc(index) : 0;
  const paletteIndex = ((normalizedIndex + pattern.offset) % palette.length + palette.length) % palette.length;
  return solidPaint(palette[paletteIndex] ?? palette[0] ?? '');
}
