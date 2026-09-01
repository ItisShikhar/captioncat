import type { PreviewAspectRatio } from '@/schema';

export const PREVIEW_ASPECT_RATIO_IDS = ['landscape', 'portrait', 'square', '4by3', '3by4'] as const;
export type PreviewAspectRatioId = (typeof PREVIEW_ASPECT_RATIO_IDS)[number];

/** Preview-canvas aspect ratios and their canonical render dimension. */
export type AspectCanvasSize = { width: number; height?: never } | { width?: never; height: number };

export interface AspectRatioOption {
  id: PreviewAspectRatioId;
  ratio: PreviewAspectRatio;
  label: string;
  width: number;
  height: number;
  canvas: AspectCanvasSize;
  icon: 'landscape' | 'portrait' | 'square' | 'ratio';
}

export const ASPECT_RATIO_OPTIONS: AspectRatioOption[] = [
  { id: 'landscape', ratio: '16:9', label: '16:9', width: 16, height: 9, canvas: { width: 1920 }, icon: 'landscape' },
  { id: 'portrait', ratio: '9:16', label: '9:16', width: 9, height: 16, canvas: { width: 1080 }, icon: 'portrait' },
  { id: 'square', ratio: '1:1', label: '1:1', width: 1, height: 1, canvas: { width: 1080 }, icon: 'square' },
  { id: '4by3', ratio: '4:3', label: '4:3', width: 4, height: 3, canvas: { width: 1080 }, icon: 'ratio' },
  { id: '3by4', ratio: '3:4', label: '3:4', width: 3, height: 4, canvas: { width: 1080 }, icon: 'portrait' },
];

export function isPreviewAspectRatioId(value: string): value is PreviewAspectRatioId {
  return PREVIEW_ASPECT_RATIO_IDS.some((id) => id === value);
}

export function aspectRatioIdForValue(value: PreviewAspectRatio | undefined): PreviewAspectRatioId {
  const option = ASPECT_RATIO_OPTIONS.find((candidate) => value !== undefined && candidate.ratio === value);
  return option?.id ?? DEFAULT_ASPECT_RATIO_ID;
}

export function previewAspectRatioForId(id: PreviewAspectRatioId): PreviewAspectRatio {
  const option = ASPECT_RATIO_OPTIONS.find((candidate) => candidate.id === id);
  if (!option) {
    throw new Error(`Unknown preview aspect ratio "${id}".`);
  }
  return option.ratio;
}

/** Derive the missing canvas dimension from one canonical dimension. */
export function resolutionForCanvas(
  canvas: AspectCanvasSize,
  aspectRatio: Pick<AspectRatioOption, 'width' | 'height'>,
): { width: number; height: number } {
  const ratio = aspectRatio.width / aspectRatio.height;
  if (canvas.width !== undefined) {
    return {
      width: canvas.width,
      height: Math.max(1, Math.round(canvas.width / ratio)),
    };
  }
  return {
    width: Math.max(1, Math.round(canvas.height * ratio)),
    height: canvas.height,
  };
}

export function resolutionForAspect(aspect: AspectRatioOption): { width: number; height: number } {
  return resolutionForCanvas(aspect.canvas, aspect);
}

export type PreviewQuality = 'sd' | 'hd';

export const PREVIEW_QUALITY_OPTIONS = [
  { id: 'sd', label: 'SD' },
  { id: 'hd', label: 'HD' },
] as const satisfies ReadonlyArray<{ id: PreviewQuality; label: string }>;

export const DEFAULT_ASPECT_RATIO_ID: PreviewAspectRatioId = 'portrait';

export const PREVIEW_SPEED_OPTIONS = [
  { value: 0.1, label: '0.1x' },
  { value: 0.25, label: '0.25x' },
  { value: 0.5, label: '0.5x' },
  { value: 1, label: '1x' },
  { value: 2, label: '2x' },
  { value: 3, label: '3x' },
  { value: 4, label: '4x' },
] as const;

/** Shared between the render request (usePreviewRenderer) and the playback loop (PreviewPlayer) - must match. */
export const PREVIEW_FPS = 24;
export const PREVIEW_DURATION_SECONDS = 4;
