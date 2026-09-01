import { type CSSProperties, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { preview } from '@/ui/constants';
import { DEFAULT_ARROW_CURSOR, HAND_CURSOR } from './preview-cursor';

export interface PreviewSurfaceBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
}

interface PanGesture {
  pointerId: number;
  button: number;
  startX: number;
  startY: number;
  startPanX: number;
  startPanY: number;
  moved: boolean;
}

export interface BoundedPreviewViewportState {
  isPanning: boolean;
  zoom: number;
  viewportStyle: CSSProperties;
  viewportSurfaceStyle: CSSProperties;
  gridStyle: CSSProperties;
  resetView: () => void;
  focusPreview: (bounds: PreviewSurfaceBounds, zoom?: number) => void;
}

const RESET_ANIMATION_MS = 360;
const DRAG_THRESHOLD_PX = 3;
const GRID_TILE_SIZE_PX = 20;
const DEFAULT_VIEWPORT: ViewportState = {
  zoom: preview.viewport.defaultZoom,
  panX: preview.viewport.defaultPanX,
  panY: preview.viewport.defaultPanY,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isViewportControl(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('[data-preview-surface-drag-handle="true"]')) return true;
  if (target.closest('[data-preview-surface-resize-handle="true"]')) return true;
  if (
    target.closest(
      'button, input, select, textarea, [contenteditable="true"], [role="slider"], [data-preview-interactive-control="true"]',
    )
  ) {
    return true;
  }
  if (target.closest('[data-popover-layer-content], [data-slot="popover-content"]')) return true;
  if (target.closest('[data-preview-pan-handle="true"]')) return false;
  return Boolean(target.closest('[data-preview-viewport-control], [data-preview-viewport-chrome]'));
}

function isViewportWheelControl(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('[data-preview-surface-drag-handle="true"]')) return true;
  if (target.closest('[data-preview-surface-resize-handle="true"]')) return false;
  if (target.closest('[data-preview-compact-card="true"]')) return false;
  if (target.closest('[data-preview-control-bar="true"]')) return false;
  return isViewportControl(target);
}

function getInteractionElement(target: HTMLDivElement | null): HTMLElement | null {
  return target;
}

function resolvedViewport(candidate: ViewportState): ViewportState {
  return {
    zoom: clamp(candidate.zoom, preview.viewport.minZoom, preview.viewport.maxZoom),
    panX: candidate.panX,
    panY: candidate.panY,
  };
}

function viewportTransform(viewport: ViewportState): string {
  return `translate3d(calc(-50% + ${viewport.panX}px), calc(-50% + ${viewport.panY}px), 0) scale(${viewport.zoom})`;
}

function applyPanStyles(
  workspace: HTMLElement | null,
  grid: HTMLElement | null,
  viewport: ViewportState,
): void {
  if (workspace) workspace.style.transform = viewportTransform(viewport);
  if (grid) {
    const tileSize = `${GRID_TILE_SIZE_PX * viewport.zoom}px`;
    grid.style.backgroundSize = `${tileSize} ${tileSize}`;
    grid.style.backgroundPosition = `${viewport.panX}px ${viewport.panY}px`;
  }
}

function applyViewportStyles(element: HTMLElement | null, viewport: ViewportState): void {
  if (!element) return;
  const workspace = element.querySelector<HTMLElement>('[data-preview-workspace="true"]');
  const grid = element.querySelector<HTMLElement>('[data-preview-grid="true"]');
  if (workspace) workspace.style.willChange = 'transform';
  applyPanStyles(workspace, grid, viewport);
}

export function useBoundedPreviewViewport(targetRef: RefObject<HTMLDivElement | null>): BoundedPreviewViewportState {
  const [viewport, setViewport] = useState<ViewportState>(DEFAULT_VIEWPORT);
  const [isPanning, setIsPanning] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const viewportRef = useRef<ViewportState>(DEFAULT_VIEWPORT);
  const gestureRef = useRef<PanGesture | null>(null);
  const suppressClickRef = useRef(false);
  const wheelHandlerRef = useRef<(event: WheelEvent) => void>(() => undefined);
  const pointerDownHandlerRef = useRef<(event: PointerEvent) => void>(() => undefined);
  const pointerMoveHandlerRef = useRef<(event: PointerEvent) => void>(() => undefined);
  const pointerUpHandlerRef = useRef<(event: PointerEvent) => void>(() => undefined);
  const clickCaptureHandlerRef = useRef<(event: MouseEvent) => void>(() => undefined);
  const resetFrameRef = useRef<number | null>(null);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewportCommitFrameRef = useRef<number | null>(null);
  const panFrameRef = useRef<number | null>(null);
  const pendingPanRef = useRef<{ pointerId: number; clientX: number; clientY: number } | null>(null);
  const panWorkspaceRef = useRef<HTMLElement | null>(null);
  const panGridRef = useRef<HTMLElement | null>(null);

  const updateViewport = useCallback((next: ViewportState | ((current: ViewportState) => ViewportState)): void => {
    setViewport((current) => {
      const candidate = typeof next === 'function' ? next(current) : next;
      const resolved = resolvedViewport(candidate);
      if (current.zoom === resolved.zoom && current.panX === resolved.panX && current.panY === resolved.panY) return current;
      viewportRef.current = resolved;
      return resolved;
    });
  }, []);

  const clearPendingViewportCommit = useCallback((): void => {
    if (viewportCommitFrameRef.current !== null) {
      cancelAnimationFrame(viewportCommitFrameRef.current);
      viewportCommitFrameRef.current = null;
    }
  }, []);

  const commitViewport = useCallback((): void => {
    clearPendingViewportCommit();
    const nextViewport = viewportRef.current;
    setViewport((current) =>
      current.zoom === nextViewport.zoom && current.panX === nextViewport.panX && current.panY === nextViewport.panY
        ? current
        : nextViewport,
    );
  }, [clearPendingViewportCommit]);

  const scheduleViewportCommit = useCallback((): void => {
    clearPendingViewportCommit();
    viewportCommitFrameRef.current = requestAnimationFrame(() => {
      viewportCommitFrameRef.current = null;
      commitViewport();
    });
  }, [clearPendingViewportCommit, commitViewport]);

  const flushPendingPan = useCallback((): void => {
    panFrameRef.current = null;
    const pendingPan = pendingPanRef.current;
    pendingPanRef.current = null;
    const gesture = gestureRef.current;
    if (!pendingPan || !gesture || gesture.pointerId !== pendingPan.pointerId) return;

    const deltaX = pendingPan.clientX - gesture.startX;
    const deltaY = pendingPan.clientY - gesture.startY;
    const current = viewportRef.current;
    const nextViewport = resolvedViewport({
      zoom: current.zoom,
      panX: gesture.startPanX + deltaX,
      panY: gesture.startPanY + deltaY,
    });
    viewportRef.current = nextViewport;
    applyPanStyles(panWorkspaceRef.current, panGridRef.current, nextViewport);
  }, []);

  const schedulePendingPan = useCallback((): void => {
    if (panFrameRef.current !== null) return;
    panFrameRef.current = requestAnimationFrame(flushPendingPan);
  }, [flushPendingPan]);

  const stopResetAnimation = useCallback((): void => {
    if (resetFrameRef.current !== null) {
      cancelAnimationFrame(resetFrameRef.current);
      resetFrameRef.current = null;
    }
    if (resetTimeoutRef.current !== null) {
      clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }
    setIsResetting(false);
  }, []);

  useEffect(
    () => () => {
      if (resetFrameRef.current !== null) cancelAnimationFrame(resetFrameRef.current);
      if (resetTimeoutRef.current !== null) clearTimeout(resetTimeoutRef.current);
      clearPendingViewportCommit();
      if (panFrameRef.current !== null) cancelAnimationFrame(panFrameRef.current);
    },
    [clearPendingViewportCommit],
  );

  const resetView = useCallback((): void => {
    suppressClickRef.current = false;
    clearPendingViewportCommit();
    stopResetAnimation();
    setIsResetting(true);
    resetFrameRef.current = requestAnimationFrame(() => {
      resetFrameRef.current = null;
      updateViewport(DEFAULT_VIEWPORT);
    });
    resetTimeoutRef.current = setTimeout(() => {
      resetTimeoutRef.current = null;
      setIsResetting(false);
    }, RESET_ANIMATION_MS);
  }, [clearPendingViewportCommit, stopResetAnimation, updateViewport]);

  const focusPreview = useCallback(
    (bounds: PreviewSurfaceBounds, zoom: number = preview.viewport.defaultZoom): void => {
      suppressClickRef.current = false;
      clearPendingViewportCommit();
      stopResetAnimation();
      const centerOffsetX = bounds.x + bounds.width / 2 - preview.workspace.width / 2;
      const centerOffsetY = bounds.y + bounds.height / 2 - preview.workspace.height / 2;
      const nextZoom = clamp(zoom, preview.viewport.minZoom, preview.viewport.maxZoom);
      const target: ViewportState = {
        zoom: nextZoom,
        panX: -centerOffsetX * nextZoom,
        panY: -centerOffsetY * nextZoom,
      };
      setIsResetting(true);
      resetFrameRef.current = requestAnimationFrame(() => {
        resetFrameRef.current = null;
        updateViewport(target);
      });
      resetTimeoutRef.current = setTimeout(() => {
        resetTimeoutRef.current = null;
        setIsResetting(false);
      }, RESET_ANIMATION_MS);
    },
    [clearPendingViewportCommit, stopResetAnimation, updateViewport],
  );

  wheelHandlerRef.current = (event: WheelEvent): void => {
    if (isViewportWheelControl(event.target)) return;
    event.preventDefault();
    stopResetAnimation();
    const element = getInteractionElement(targetRef.current);
    const rect = element?.getBoundingClientRect();
    if (!rect) return;
    const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * rect.height : event.deltaY;
    const current = viewportRef.current;
    const nextZoom = clamp(
      current.zoom * Math.exp(-delta * 0.0015),
      preview.viewport.minZoom,
      preview.viewport.maxZoom,
    );
    if (nextZoom === current.zoom) return;

    const cursorX = event.clientX - rect.left - rect.width / 2;
    const cursorY = event.clientY - rect.top - rect.height / 2;
    const zoomRatio = nextZoom / current.zoom;
    const nextViewport = resolvedViewport({
      zoom: nextZoom,
      panX: cursorX + (current.panX - cursorX) * zoomRatio,
      panY: cursorY + (current.panY - cursorY) * zoomRatio,
    });
    viewportRef.current = nextViewport;
    applyViewportStyles(element, nextViewport);
    scheduleViewportCommit();
  };

  pointerDownHandlerRef.current = (event: PointerEvent): void => {
    const isMiddleButton = event.button === 1;
    if ((event.button !== 0 && !isMiddleButton) || (!isMiddleButton && isViewportControl(event.target))) return;
    const element = getInteractionElement(targetRef.current);
    if (!element) return;
    if (isMiddleButton) event.preventDefault();
    stopResetAnimation();
    gestureRef.current = {
      pointerId: event.pointerId,
      button: event.button,
      startX: event.clientX,
      startY: event.clientY,
      startPanX: viewportRef.current.panX,
      startPanY: viewportRef.current.panY,
      moved: false,
    };
    panWorkspaceRef.current = element.querySelector<HTMLElement>('[data-preview-workspace="true"]');
    panGridRef.current = element.querySelector<HTMLElement>('[data-preview-grid="true"]');
    pendingPanRef.current = null;
    setIsPanning(true);
  };

  pointerMoveHandlerRef.current = (event: PointerEvent): void => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (Math.hypot(deltaX, deltaY) > DRAG_THRESHOLD_PX) gesture.moved = true;
    pendingPanRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
    schedulePendingPan();
  };

  pointerUpHandlerRef.current = (event: PointerEvent): void => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    pendingPanRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
    if (panFrameRef.current !== null) cancelAnimationFrame(panFrameRef.current);
    flushPendingPan();
    clearPendingViewportCommit();
    updateViewport(viewportRef.current);
    suppressClickRef.current = gesture.moved;
    gestureRef.current = null;
    panWorkspaceRef.current = null;
    panGridRef.current = null;
    setIsPanning(false);
  };

  clickCaptureHandlerRef.current = (event: MouseEvent): void => {
    if (!suppressClickRef.current) return;
    if (isViewportControl(event.target)) {
      suppressClickRef.current = false;
      return;
    }
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  useEffect(() => {
    const element = getInteractionElement(targetRef.current);
    if (!element) return;
    const handleWheel = (event: WheelEvent): void => wheelHandlerRef.current(event);
    const handlePointerDown = (event: PointerEvent): void => pointerDownHandlerRef.current(event);
    const handlePointerMove = (event: PointerEvent): void => pointerMoveHandlerRef.current(event);
    const handlePointerUp = (event: PointerEvent): void => pointerUpHandlerRef.current(event);
    const handleClickCapture = (event: MouseEvent): void => clickCaptureHandlerRef.current(event);
    const handleAuxClick = (event: MouseEvent): void => {
      if (event.button !== 1) return;
      event.preventDefault();
      event.stopPropagation();
    };
    element.addEventListener('wheel', handleWheel, { passive: false });
    element.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    element.addEventListener('click', handleClickCapture, true);
    element.addEventListener('auxclick', handleAuxClick, true);
    return () => {
      element.removeEventListener('wheel', handleWheel);
      element.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      element.removeEventListener('click', handleClickCapture, true);
      element.removeEventListener('auxclick', handleAuxClick, true);
    };
  }, [clearPendingViewportCommit, scheduleViewportCommit, stopResetAnimation, targetRef, updateViewport]);

  const viewportStyle = useMemo<CSSProperties>(
    () => ({
      width: preview.workspace.width,
      height: preview.workspace.height,
      left: '50%',
      top: '50%',
      right: 'auto',
      bottom: 'auto',
      transform: `translate3d(calc(-50% + ${viewport.panX}px), calc(-50% + ${viewport.panY}px), 0) scale(${viewport.zoom})`,
      transformOrigin: 'center center',
      transition: isResetting ? `transform ${RESET_ANIMATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1)` : 'none',
      willChange: isPanning || isResetting ? 'transform' : 'auto',
      cursor: isPanning ? HAND_CURSOR : DEFAULT_ARROW_CURSOR,
      touchAction: 'none',
      userSelect: 'none',
    }),
    [isPanning, isResetting, viewport],
  );
  const viewportSurfaceStyle = useMemo<CSSProperties>(
    () => ({
      cursor: isPanning ? HAND_CURSOR : DEFAULT_ARROW_CURSOR,
      overflow: 'hidden',
      touchAction: 'none',
      userSelect: 'none',
    }),
    [isPanning],
  );
  const gridStyle = useMemo<CSSProperties>(
    () => ({
      inset: 0,
      backgroundSize: `${GRID_TILE_SIZE_PX * viewport.zoom}px ${GRID_TILE_SIZE_PX * viewport.zoom}px`,
      backgroundPosition: `${viewport.panX}px ${viewport.panY}px`,
    }),
    [viewport],
  );

  return {
    isPanning,
    zoom: viewport.zoom,
    viewportStyle,
    viewportSurfaceStyle,
    gridStyle,
    resetView,
    focusPreview,
  };
}
