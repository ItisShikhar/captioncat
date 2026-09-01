import { createContext } from 'react';

export const SPACER_FALLBACK_EXTENT = 1000;

export interface SpacerBounds {
  horizontal: number;
  vertical: number;
}

export interface SpacerPreviewGeometry {
  width: number;
  height: number;
  videoResolution?: {
    width: number;
    height: number;
  };
}

const DEFAULT_SPACER_BOUNDS: SpacerBounds = {
  horizontal: SPACER_FALLBACK_EXTENT,
  vertical: SPACER_FALLBACK_EXTENT,
};

function positiveFinite(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Resolve Studio bounds in composition units. The engine's viewport is the
 * source of truth. The canvas aspect ratio provides the pre-preview fallback.
 */
export function spacerBoundsForPreview(
  viewport: SpacerPreviewGeometry | null | undefined,
  videoResolution?: { width: number; height: number } | null,
): SpacerBounds {
  const fallbackHeight = SPACER_FALLBACK_EXTENT;
  const videoWidth = positiveFinite(videoResolution?.width);
  const videoHeight = positiveFinite(videoResolution?.height);
  const fallbackWidth =
    videoWidth !== undefined && videoHeight !== undefined
      ? Math.max(1, (videoWidth / videoHeight) * fallbackHeight)
      : SPACER_FALLBACK_EXTENT;

  return {
    horizontal: positiveFinite(viewport?.width) ?? fallbackWidth,
    vertical: positiveFinite(viewport?.height) ?? fallbackHeight,
  };
}

export const SpacerBoundsContext = createContext<SpacerBounds>(DEFAULT_SPACER_BOUNDS);
