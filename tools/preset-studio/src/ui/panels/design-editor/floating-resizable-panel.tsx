import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { EW_RESIZE_CURSOR } from '@/ui/preview/preview-cursor';

type FloatingPanelSide = 'left' | 'right';
type FloatingPanelHeight = 'fill' | 'content';

interface FloatingResizablePanelProps {
  side: FloatingPanelSide;
  width: number;
  minWidth: number;
  maxWidth: number;
  onWidthChange: (width: number) => void;
  'aria-label': string;
  edgeOffset?: number;
  heightMode?: FloatingPanelHeight;
  className?: string;
  children: ReactNode;
}

interface ResizeState {
  pointerId: number;
  startX: number;
  startWidth: number;
}

const RESIZE_STEP_PX = 16;
const DEFAULT_EDGE_OFFSET_PX = 12;
const DEFAULT_OPPOSITE_EDGE_INSET_PX = 12;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function FloatingResizablePanel({
  side,
  width,
  minWidth,
  maxWidth,
  onWidthChange,
  'aria-label': ariaLabel,
  edgeOffset = DEFAULT_EDGE_OFFSET_PX,
  heightMode = 'fill',
  className,
  children,
}: FloatingResizablePanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const resizeStateRef = useRef<ResizeState | null>(null);
  const widthRef = useRef(width);
  const pendingWidthRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  const maximumWidth = useCallback(() => {
    const availableWidth = panelRef.current?.parentElement?.clientWidth;
    if (!availableWidth) return maxWidth;
    return Math.min(maxWidth, Math.max(minWidth, availableWidth - edgeOffset - DEFAULT_OPPOSITE_EDGE_INSET_PX));
  }, [edgeOffset, maxWidth, minWidth]);

  const clampedWidth = useCallback(
    (candidate: number) => Math.round(clamp(candidate, minWidth, maximumWidth())),
    [maximumWidth, minWidth],
  );

  const applyPendingWidth = useCallback(() => {
    frameRef.current = null;
    const pendingWidth = pendingWidthRef.current;
    pendingWidthRef.current = null;
    if (pendingWidth === null) return;
    widthRef.current = pendingWidth;
    if (panelRef.current) panelRef.current.style.width = `${pendingWidth}px`;
    onWidthChange(pendingWidth);
  }, [onWidthChange]);

  const scheduleWidth = useCallback(
    (candidate: number) => {
      const nextWidth = clampedWidth(candidate);
      widthRef.current = nextWidth;
      pendingWidthRef.current = nextWidth;
      if (frameRef.current === null) {
        frameRef.current = requestAnimationFrame(applyPendingWidth);
      }
    },
    [applyPendingWidth, clampedWidth],
  );

  const flushWidth = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
    }
    applyPendingWidth();
  }, [applyPendingWidth]);

  const finishResize = useCallback(() => {
    flushWidth();
    resizeStateRef.current = null;
    setIsResizing(false);
  }, [flushWidth]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    resizeStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: widthRef.current,
    };
    setIsResizing(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const resizeState = resizeStateRef.current;
    if (!resizeState || resizeState.pointerId !== event.pointerId) return;
    const pointerDelta = side === 'left' ? event.clientX - resizeState.startX : resizeState.startX - event.clientX;
    scheduleWidth(resizeState.startWidth + pointerDelta);
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (resizeStateRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    finishResize();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let nextWidth: number | undefined;
    if (event.key === 'Home') nextWidth = minWidth;
    if (event.key === 'End') nextWidth = maximumWidth();
    if (event.key === 'ArrowRight') {
      nextWidth = widthRef.current + (side === 'left' ? RESIZE_STEP_PX : -RESIZE_STEP_PX);
    }
    if (event.key === 'ArrowLeft') {
      nextWidth = widthRef.current + (side === 'left' ? -RESIZE_STEP_PX : RESIZE_STEP_PX);
    }
    if (nextWidth === undefined) return;
    event.preventDefault();
    scheduleWidth(nextWidth);
    flushWidth();
  };

  const edgePositionStyle = side === 'left' ? { left: `${edgeOffset}px` } : { right: `${edgeOffset}px` };

  return (
    <div
      ref={panelRef}
      className={cn(
        'pointer-events-auto absolute z-30 min-h-0',
        heightMode === 'content' && 'h-fit',
        isResizing && 'select-none',
        className,
      )}
      style={{
        ...edgePositionStyle,
        width: `${width}px`,
        maxWidth: 'calc(100% - 1.5rem)',
        touchAction: 'auto',
        userSelect: 'auto',
      }}
      data-preview-floating-panel="true"
      data-floating-panel-side={side}
    >
      <div className={cn('relative min-h-0', heightMode === 'fill' && 'h-full')}>
        {children}
        <div
          role="separator"
          tabIndex={0}
          aria-label={ariaLabel}
          aria-orientation="vertical"
          aria-valuemin={minWidth}
          aria-valuemax={maximumWidth()}
          aria-valuenow={Math.round(width)}
          style={{ cursor: EW_RESIZE_CURSOR }}
          className={cn(
            'group/resize-handle absolute inset-y-0 z-40 flex w-3 touch-none items-center justify-center outline-none',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
            side === 'left' ? 'right-0 translate-x-1/2' : 'left-0 -translate-x-1/2',
          )}
          onKeyDown={handleKeyDown}
          onLostPointerCapture={finishResize}
          onPointerCancel={finishResize}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <span
            aria-hidden="true"
            className={cn(
              'h-10 w-1 rounded-full bg-border/80 transition-colors group-hover/resize-handle:bg-muted-foreground/70',
              isResizing && 'bg-primary',
            )}
          />
        </div>
      </div>
    </div>
  );
}
