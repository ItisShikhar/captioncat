import { preview } from '@/ui/constants';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PreviewSurfaceBounds } from './bounded-preview-viewport';
import type { PreviewSurfaceResizeSide } from './preview-surface-resize-handle';
import type { PreviewSurfaceId } from './use-preview-culling';

export type PreviewSurfaceBoundsById = Record<PreviewSurfaceId, PreviewSurfaceBounds>;
export type PreviewSurfaceAspectRatiosById = Record<PreviewSurfaceId, number>;

type PendingPointer = {
  pointerId: number;
  clientX: number;
  clientY: number;
};

type ActiveSurfaceDrag = {
  id: PreviewSurfaceId;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startBounds: PreviewSurfaceBounds;
  workspaceScale: number;
  surface: HTMLElement;
  moved: boolean;
};

type ActiveSurfaceResize = {
  id: PreviewSurfaceId;
  pointerId: number;
  startClientX: number;
  startBounds: PreviewSurfaceBounds;
  workspaceScale: number;
  aspectRatio: number;
  side: PreviewSurfaceResizeSide;
  surface: HTMLElement;
};

const SURFACE_DRAG_THRESHOLD_PX = 3;
const MIN_SURFACE_WIDTH = 120;
const LAYOUT_GUTTER_PX = 24;
const MIN_LIVE_WIDTH_PX = 360;
const MIN_COMPACT_WIDTH_PX = 240;
const INITIAL_SURFACE_ORDER: readonly PreviewSurfaceId[] = ['live', 'word', 'style'];

function cloneBoundsById(boundsById: PreviewSurfaceBoundsById): PreviewSurfaceBoundsById {
  return {
    live: { ...boundsById.live },
    word: { ...boundsById.word },
    style: { ...boundsById.style },
  };
}

function safeAspectRatio(aspectRatio: number): number {
  return Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
}

function emptyBounds(aspectRatios: PreviewSurfaceAspectRatiosById): PreviewSurfaceBoundsById {
  return {
    live: { x: 0, y: 0, width: 1, height: 1 / safeAspectRatio(aspectRatios.live) },
    word: { x: 0, y: 0, width: 1, height: 1 / safeAspectRatio(aspectRatios.word) },
    style: { x: 0, y: 0, width: 1, height: 1 / safeAspectRatio(aspectRatios.style) },
  };
}

function toolbarBottomOffset(container: HTMLElement, containerRect: DOMRect): number {
  const toolbar = Array.from(
    container.parentElement?.querySelectorAll<HTMLElement>('[data-preview-fixed-chrome="true"]') ?? [],
  ).find((element) => element.getBoundingClientRect().top <= containerRect.top + 8);
  if (!toolbar) return LAYOUT_GUTTER_PX;
  return Math.max(LAYOUT_GUTTER_PX, toolbar.getBoundingClientRect().bottom - containerRect.top + LAYOUT_GUTTER_PX);
}

function responsiveBounds(
  aspectRatios: PreviewSurfaceAspectRatiosById,
  container: HTMLElement | null,
): PreviewSurfaceBoundsById {
  const fallback = emptyBounds(aspectRatios);
  if (!container) return fallback;

  const rect = container.getBoundingClientRect();
  const zoom = preview.viewport.defaultZoom;
  const visibleWorkspaceWidth = preview.workspace.width * zoom;
  const availableWidth = Math.max(
    1,
    Math.min(rect.width, visibleWorkspaceWidth) - LAYOUT_GUTTER_PX * 2,
  );
  const twoColumns = availableWidth >= MIN_LIVE_WIDTH_PX + MIN_COMPACT_WIDTH_PX + LAYOUT_GUTTER_PX;
  const liveWidth = twoColumns
    ? Math.max(MIN_LIVE_WIDTH_PX, Math.round((availableWidth - LAYOUT_GUTTER_PX) * 0.58))
    : availableWidth;
  const compactWidth = twoColumns ? Math.max(MIN_COMPACT_WIDTH_PX, availableWidth - LAYOUT_GUTTER_PX - liveWidth) : availableWidth;
  const top = toolbarBottomOffset(container, rect);
  const firstColumnX = LAYOUT_GUTTER_PX;
  const secondColumnX = twoColumns ? firstColumnX + liveWidth + LAYOUT_GUTTER_PX : firstColumnX;
  const liveHeight = liveWidth / safeAspectRatio(aspectRatios.live);
  const wordHeight = compactWidth / safeAspectRatio(aspectRatios.word);
  const styleHeight = compactWidth / safeAspectRatio(aspectRatios.style);
  const wordTop = twoColumns ? top : top + liveHeight + LAYOUT_GUTTER_PX;
  const styleTop = twoColumns
    ? top + liveHeight / 2
    : wordTop + wordHeight + LAYOUT_GUTTER_PX;

  const screenToWorkspace = (value: number, viewportExtent: number, workspaceExtent: number, pan: number): number =>
    workspaceExtent / 2 + (value - viewportExtent / 2 - pan) / zoom;
  const x = (value: number): number =>
    screenToWorkspace(value, rect.width, preview.workspace.width, preview.viewport.defaultPanX);
  const y = (value: number): number =>
    screenToWorkspace(value, rect.height, preview.workspace.height, preview.viewport.defaultPanY);
  const bounds = (left: number, topOffset: number, width: number, height: number): PreviewSurfaceBounds => ({
    x: x(left),
    y: y(topOffset),
    width: width / zoom,
    height: height / zoom,
  });

  return {
    live: bounds(firstColumnX, top, liveWidth, liveHeight),
    word: bounds(secondColumnX, wordTop, compactWidth, wordHeight),
    style: bounds(twoColumns ? secondColumnX : firstColumnX, styleTop, compactWidth, styleHeight),
  };
}

function boundsEqual(first: PreviewSurfaceBounds, second: PreviewSurfaceBounds): boolean {
  return first.x === second.x && first.y === second.y && first.width === second.width && first.height === second.height;
}

export interface PreviewSurfaceLayoutState {
  boundsById: PreviewSurfaceBoundsById;
  surfaceOrder: readonly PreviewSurfaceId[];
  draggingSurfaceId: PreviewSurfaceId | null;
  resizingSurfaceId: PreviewSurfaceId | null;
  startSurfaceDrag: (id: PreviewSurfaceId, event: ReactPointerEvent<HTMLElement>) => void;
  startSurfaceResize: (
    id: PreviewSurfaceId,
    side: PreviewSurfaceResizeSide,
    event: ReactPointerEvent<HTMLElement>,
  ) => void;
}

export function usePreviewSurfaceLayout(
  aspectRatios: PreviewSurfaceAspectRatiosById,
  containerRef: RefObject<HTMLElement | null>,
): PreviewSurfaceLayoutState {
  const initialBounds = responsiveBounds(aspectRatios, containerRef.current);
  const boundsByIdRef = useRef<PreviewSurfaceBoundsById>(cloneBoundsById(initialBounds));
  const activeDragRef = useRef<ActiveSurfaceDrag | null>(null);
  const activeResizeRef = useRef<ActiveSurfaceResize | null>(null);
  const pendingPointerRef = useRef<PendingPointer | null>(null);
  const pendingResizePointerRef = useRef<PendingPointer | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const [boundsById, setBoundsById] = useState<PreviewSurfaceBoundsById>(() => cloneBoundsById(initialBounds));
  const [surfaceOrder, setSurfaceOrder] = useState<readonly PreviewSurfaceId[]>(INITIAL_SURFACE_ORDER);
  const [draggingSurfaceId, setDraggingSurfaceId] = useState<PreviewSurfaceId | null>(null);
  const [resizingSurfaceId, setResizingSurfaceId] = useState<PreviewSurfaceId | null>(null);

  const hasManualLayoutRef = useRef(false);
  const applyResponsiveLayout = useCallback((): void => {
    if (hasManualLayoutRef.current) return;
    const nextBounds = responsiveBounds(aspectRatios, containerRef.current);
    boundsByIdRef.current = nextBounds;
    setBoundsById(nextBounds);
  }, [aspectRatios, containerRef]);

  useLayoutEffect(() => {
    applyResponsiveLayout();
  }, [applyResponsiveLayout]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(applyResponsiveLayout);
    observer.observe(container);
    return () => observer.disconnect();
  }, [applyResponsiveLayout, containerRef]);

  const applyPointerPosition = useCallback((clientX: number, clientY: number): void => {
    const drag = activeDragRef.current;
    if (!drag) return;

    const desired: PreviewSurfaceBounds = {
      ...drag.startBounds,
      x: drag.startBounds.x + (clientX - drag.startClientX) / drag.workspaceScale,
      y: drag.startBounds.y + (clientY - drag.startClientY) / drag.workspaceScale,
    };
    const next = desired;
    const current = boundsByIdRef.current[drag.id];
    if (boundsEqual(current, next)) return;

    boundsByIdRef.current = { ...boundsByIdRef.current, [drag.id]: next };
    drag.surface.style.left = `${next.x}px`;
    drag.surface.style.top = `${next.y}px`;
    drag.moved = true;
    hasManualLayoutRef.current = true;
  }, []);

  const flushPendingPointer = useCallback((): void => {
    dragFrameRef.current = null;
    const pending = pendingPointerRef.current;
    pendingPointerRef.current = null;
    const drag = activeDragRef.current;
    if (!pending || !drag || pending.pointerId !== drag.pointerId) return;
    applyPointerPosition(pending.clientX, pending.clientY);
  }, [applyPointerPosition]);

  const applyResizePointerPosition = useCallback((clientX: number): void => {
    const resize = activeResizeRef.current;
    if (!resize) return;

    const deltaX = (clientX - resize.startClientX) / resize.workspaceScale;
    const width = Math.max(
      MIN_SURFACE_WIDTH,
      resize.startBounds.width + (resize.side === 'right' ? deltaX : -deltaX),
    );
    const next: PreviewSurfaceBounds = {
      ...resize.startBounds,
      x: resize.side === 'left' ? resize.startBounds.x + resize.startBounds.width - width : resize.startBounds.x,
      width,
      height: width / resize.aspectRatio,
    };
    const current = boundsByIdRef.current[resize.id];
    if (boundsEqual(current, next)) return;

    boundsByIdRef.current = { ...boundsByIdRef.current, [resize.id]: next };
    resize.surface.style.left = `${next.x}px`;
    resize.surface.style.width = `${next.width}px`;
    resize.surface.style.height = `${next.height}px`;
    hasManualLayoutRef.current = true;
  }, []);

  const flushPendingResizePointer = useCallback((): void => {
    resizeFrameRef.current = null;
    const pending = pendingResizePointerRef.current;
    pendingResizePointerRef.current = null;
    const resize = activeResizeRef.current;
    if (!pending || !resize || pending.pointerId !== resize.pointerId) return;
    applyResizePointerPosition(pending.clientX);
  }, [applyResizePointerPosition]);

  const schedulePointerPosition = useCallback((): void => {
    if (dragFrameRef.current !== null) return;
    dragFrameRef.current = requestAnimationFrame(flushPendingPointer);
  }, [flushPendingPointer]);

  const scheduleResizePointerPosition = useCallback((): void => {
    if (resizeFrameRef.current !== null) return;
    resizeFrameRef.current = requestAnimationFrame(flushPendingResizePointer);
  }, [flushPendingResizePointer]);

  const finishSurfaceDrag = useCallback((): void => {
    const drag = activeDragRef.current;
    if (!drag) return;
    if (dragFrameRef.current !== null) {
      cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
    flushPendingPointer();
    activeDragRef.current = null;
    setBoundsById(cloneBoundsById(boundsByIdRef.current));
    setDraggingSurfaceId(null);
  }, [flushPendingPointer]);

  const finishSurfaceResize = useCallback((): void => {
    const resize = activeResizeRef.current;
    if (!resize) return;
    if (resizeFrameRef.current !== null) {
      cancelAnimationFrame(resizeFrameRef.current);
      resizeFrameRef.current = null;
    }
    flushPendingResizePointer();
    activeResizeRef.current = null;
    setBoundsById(cloneBoundsById(boundsByIdRef.current));
    setResizingSurfaceId(null);
  }, [flushPendingResizePointer]);

  const startSurfaceDrag = useCallback((id: PreviewSurfaceId, event: ReactPointerEvent<HTMLElement>): void => {
    if (event.button !== 0 || activeDragRef.current || activeResizeRef.current) return;
    const surface = event.currentTarget.closest<HTMLElement>('[data-preview-surface-id]');
    const workspace = surface?.closest<HTMLElement>('[data-preview-workspace="true"]');
    const workspaceRect = workspace?.getBoundingClientRect();
    if (!surface || !workspaceRect || workspaceRect.width <= 0) return;

    event.preventDefault();
    const startBounds = boundsByIdRef.current[id];
    activeDragRef.current = {
      id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startBounds,
      workspaceScale: workspaceRect.width / preview.workspace.width,
      surface,
      moved: false,
    };
    setSurfaceOrder((current) => {
      if (current[current.length - 1] === id) return current;
      return [...current.filter((surfaceId) => surfaceId !== id), id];
    });
    setDraggingSurfaceId(id);
  }, []);

  const startSurfaceResize = useCallback(
    (id: PreviewSurfaceId, side: PreviewSurfaceResizeSide, event: ReactPointerEvent<HTMLElement>): void => {
      if (event.button !== 0 || activeDragRef.current || activeResizeRef.current) return;
      const surface = event.currentTarget.closest<HTMLElement>('[data-preview-surface-id]');
      const workspace = surface?.closest<HTMLElement>('[data-preview-workspace="true"]');
      const workspaceRect = workspace?.getBoundingClientRect();
      const startBounds = boundsByIdRef.current[id];
      if (!surface || !workspaceRect || workspaceRect.width <= 0 || !startBounds || startBounds.height <= 0) return;

      event.preventDefault();
      activeResizeRef.current = {
        id,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startBounds,
        workspaceScale: workspaceRect.width / preview.workspace.width,
        aspectRatio: startBounds.width / startBounds.height,
        side,
        surface,
      };
      setResizingSurfaceId(id);
    },
    [],
  );

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent): void => {
      const drag = activeDragRef.current;
      if (drag && drag.pointerId === event.pointerId) {
        if (
          Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY) > SURFACE_DRAG_THRESHOLD_PX
        ) {
          drag.moved = true;
        }
        pendingPointerRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
        schedulePointerPosition();
        return;
      }
      const resize = activeResizeRef.current;
      if (!resize || resize.pointerId !== event.pointerId) return;
      pendingResizePointerRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
      scheduleResizePointerPosition();
    };
    const handlePointerUp = (event: PointerEvent): void => {
      const drag = activeDragRef.current;
      if (drag && drag.pointerId === event.pointerId) {
        pendingPointerRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
        finishSurfaceDrag();
        return;
      }
      const resize = activeResizeRef.current;
      if (!resize || resize.pointerId !== event.pointerId) return;
      pendingResizePointerRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
      finishSurfaceResize();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    window.addEventListener('blur', finishSurfaceDrag);
    window.addEventListener('blur', finishSurfaceResize);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('blur', finishSurfaceDrag);
      window.removeEventListener('blur', finishSurfaceResize);
    };
  }, [finishSurfaceDrag, finishSurfaceResize, schedulePointerPosition, scheduleResizePointerPosition]);

  useEffect(
    () => () => {
      if (dragFrameRef.current !== null) cancelAnimationFrame(dragFrameRef.current);
      if (resizeFrameRef.current !== null) cancelAnimationFrame(resizeFrameRef.current);
    },
    [],
  );

  return {
    boundsById,
    surfaceOrder,
    draggingSurfaceId,
    resizingSurfaceId,
    startSurfaceDrag,
    startSurfaceResize,
  };
}
