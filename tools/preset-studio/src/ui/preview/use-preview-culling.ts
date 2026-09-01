import type { RefObject } from 'react';
import { useEffect } from 'react';

export type PreviewSurfaceId = 'live' | 'word' | 'style';

export type PreviewSurfaceVisibilityById = Record<PreviewSurfaceId, boolean>;

export const PREVIEW_SURFACE_IDS: readonly PreviewSurfaceId[] = ['live', 'word', 'style'];

export function usePreviewCulling(
  rootRef: RefObject<HTMLElement | null>,
  onPreviewOutOfFrame: (previewId: PreviewSurfaceId) => void,
  observationKey?: string,
): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > 0) continue;
          const previewId = (entry.target as HTMLElement).dataset.previewSurfaceId;
          if (previewId === 'live' || previewId === 'word' || previewId === 'style') {
            onPreviewOutOfFrame(previewId);
          }
        }
      },
      { root, threshold: 0 },
    );

    for (const previewId of PREVIEW_SURFACE_IDS) {
      const surface = root.querySelector<HTMLElement>(`[data-preview-surface-id="${previewId}"]`);
      if (surface) observer.observe(surface);
    }

    return () => observer.disconnect();
  }, [observationKey, onPreviewOutOfFrame, rootRef]);
}
