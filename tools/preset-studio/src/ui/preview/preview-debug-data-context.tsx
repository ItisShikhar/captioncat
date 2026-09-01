import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { CaptionDebugPageSize, CaptionDebugTransform } from '@captioncat/caption-engine/browser';

import type { ViewportFrameSize } from './live-preview-panel';

export interface PreviewDebugData {
  viewportFrameSize: ViewportFrameSize | null;
  resolvedTransforms: CaptionDebugTransform[] | null;
  minimumPageSize: CaptionDebugPageSize | null;
}

export interface PreviewDebugDataActions {
  onViewportFrameSizeChange: (size: ViewportFrameSize | null) => void;
  onResolvedTransformsChange: (transforms: CaptionDebugTransform[] | null) => void;
  onMinimumPageSizeChange: (size: CaptionDebugPageSize | null) => void;
}

const EMPTY_PREVIEW_DEBUG_DATA: PreviewDebugData = {
  viewportFrameSize: null,
  resolvedTransforms: null,
  minimumPageSize: null,
};

const EMPTY_PREVIEW_DEBUG_DATA_ACTIONS: PreviewDebugDataActions = {
  onViewportFrameSizeChange: () => undefined,
  onResolvedTransformsChange: () => undefined,
  onMinimumPageSizeChange: () => undefined,
};

export const PreviewDebugDataContext = createContext<PreviewDebugData>(EMPTY_PREVIEW_DEBUG_DATA);
export const PreviewDebugDataActionsContext = createContext<PreviewDebugDataActions>(
  EMPTY_PREVIEW_DEBUG_DATA_ACTIONS,
);

function viewportFrameSizesEqual(first: ViewportFrameSize | null, second: ViewportFrameSize | null): boolean {
  return (
    first === second ||
    (first !== null &&
      second !== null &&
      first.width === second.width &&
      first.height === second.height &&
      first.videoResolution?.width === second.videoResolution?.width &&
      first.videoResolution?.height === second.videoResolution?.height)
  );
}

export function usePreviewDebugData(): PreviewDebugData {
  return useContext(PreviewDebugDataContext);
}

export function usePreviewDebugDataActions(): PreviewDebugDataActions {
  return useContext(PreviewDebugDataActionsContext);
}

export function PreviewDebugDataProvider({
  resetKey,
  onResolvedTransformsChange: onResolvedTransformsChangeOutside,
  children,
}: {
  resetKey: string;
  onResolvedTransformsChange?: (transforms: CaptionDebugTransform[] | null) => void;
  children: ReactNode;
}): ReactNode {
  const [viewportFrameSize, setViewportFrameSize] = useState<ViewportFrameSize | null>(null);
  const [resolvedTransforms, setResolvedTransforms] = useState<CaptionDebugTransform[] | null>(null);
  const [minimumPageSize, setMinimumPageSize] = useState<CaptionDebugPageSize | null>(null);

  useEffect(() => {
    setViewportFrameSize(null);
    setResolvedTransforms(null);
    setMinimumPageSize(null);
    onResolvedTransformsChangeOutside?.(null);
  }, [onResolvedTransformsChangeOutside, resetKey]);

  const onViewportFrameSizeChange = useCallback((size: ViewportFrameSize | null) => {
    setViewportFrameSize((current) => (viewportFrameSizesEqual(current, size) ? current : size));
  }, []);
  const onResolvedTransformsChange = useCallback(
    (transforms: CaptionDebugTransform[] | null) => {
      setResolvedTransforms((current) => (current === transforms ? current : transforms));
      onResolvedTransformsChangeOutside?.(transforms);
    },
    [onResolvedTransformsChangeOutside],
  );
  const onMinimumPageSizeChange = useCallback((size: CaptionDebugPageSize | null) => {
    setMinimumPageSize((current) =>
      current?.width === size?.width && current?.height === size?.height ? current : size,
    );
  }, []);
  const data = useMemo(
    () => ({ viewportFrameSize, resolvedTransforms, minimumPageSize }),
    [minimumPageSize, resolvedTransforms, viewportFrameSize],
  );
  const actions = useMemo(
    () => ({ onMinimumPageSizeChange, onResolvedTransformsChange, onViewportFrameSizeChange }),
    [onMinimumPageSizeChange, onResolvedTransformsChange, onViewportFrameSizeChange],
  );

  return (
    <PreviewDebugDataContext.Provider value={data}>
      <PreviewDebugDataActionsContext.Provider value={actions}>{children}</PreviewDebugDataActionsContext.Provider>
    </PreviewDebugDataContext.Provider>
  );
}
