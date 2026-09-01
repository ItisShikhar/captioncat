import type { HorizontalFitMode } from './caption-layout';

export interface RowFontFitPolicy {
  mode: HorizontalFitMode;
  minScale: number;
  maxScale: number;
}

export interface RowFontScaleOptions {
  mode: HorizontalFitMode;
  naturalWidth: number;
  targetWidth: number;
  minScale: number;
  maxScale: number;
}

export interface RowFontScale {
  value: number;
  requiresWrapping: boolean;
}

export function resolveRowFontScale(options: RowFontScaleOptions): RowFontScale {
  const naturalWidth = finitePositive(options.naturalWidth);
  const targetWidth = finitePositive(options.targetWidth);
  if (options.mode === 'natural' || naturalWidth === undefined || targetWidth === undefined) {
    return { value: 1, requiresWrapping: false };
  }

  const minScale = Math.min(options.minScale, options.maxScale);
  const maxScale = Math.max(options.minScale, options.maxScale);
  const requestedScale = targetWidth / naturalWidth;
  const value =
    options.mode === 'shrink-to-fit'
      ? Math.min(1, Math.max(minScale, requestedScale))
      : Math.min(maxScale, Math.max(minScale, requestedScale));

  return {
    value,
    requiresWrapping: naturalWidth * minScale > targetWidth,
  };
}

export function rowFitWidthForWrapping(
  mode: HorizontalFitMode,
  availableWidth: number,
  minScale: number,
): number {
  if (mode === 'natural') return availableWidth;
  const width = finitePositive(availableWidth);
  const scale = finitePositive(minScale);
  if (width === undefined || scale === undefined) return availableWidth;
  return width / scale;
}

function finitePositive(value: number): number | undefined {
  return Number.isFinite(value) && value > 0 ? value : undefined;
}
