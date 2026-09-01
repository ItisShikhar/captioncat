import { memo, type PointerEvent } from 'react';
import { NESW_RESIZE_CURSOR, NWSE_RESIZE_CURSOR } from './preview-cursor';

export type PreviewSurfaceResizeSide = 'left' | 'right';

export const PREVIEW_RESIZE_CORNER_CLASS = 'bg-foreground';
export const PREVIEW_RESIZE_CORNER_ACTIVE_CLASS = 'bg-primary';
export const PREVIEW_RESIZE_VERTICAL_CLASS = 'h-6 w-[6px]';
export const PREVIEW_RESIZE_HORIZONTAL_CLASS = 'h-[6px] w-6';

export interface PreviewSurfaceResizeHandleProps {
  previewTitle: string;
  isResizing?: boolean;
  onPointerDown: (side: PreviewSurfaceResizeSide, event: PointerEvent<HTMLElement>) => void;
}

export const PreviewSurfaceResizeHandle = memo(function PreviewSurfaceResizeHandle({
  previewTitle,
  isResizing = false,
  onPointerDown,
}: PreviewSurfaceResizeHandleProps) {
  const renderHandle = (side: PreviewSurfaceResizeSide) => {
    const isLeft = side === 'left';
    const strokeClass = isResizing ? PREVIEW_RESIZE_CORNER_ACTIVE_CLASS : PREVIEW_RESIZE_CORNER_CLASS;
    return (
      <button
        key={side}
        type="button"
        className={`absolute -bottom-3 z-20 h-12 w-12 cursor-ew-resize opacity-0 transition-opacity group-hover/preview-canvas:opacity-100 ${
          isLeft ? '-left-3' : '-right-3'
        } ${isResizing ? 'opacity-100' : ''}`}
        style={{ cursor: isLeft ? NESW_RESIZE_CURSOR : NWSE_RESIZE_CURSOR }}
        data-preview-surface-resize-handle="true"
        aria-label={`Resize ${previewTitle} from the ${side}`}
        onPointerDown={(event) => {
          if (event.button === 1) return;
          event.stopPropagation();
          onPointerDown(side, event);
        }}
      >
        <span
          className={`absolute bottom-0 ${isLeft ? 'left-0' : 'right-0'} ${PREVIEW_RESIZE_VERTICAL_CLASS} ${strokeClass}`}
          aria-hidden="true"
        />
        <span
          className={`absolute bottom-0 ${isLeft ? 'left-0' : 'right-0'} ${PREVIEW_RESIZE_HORIZONTAL_CLASS} ${strokeClass}`}
          aria-hidden="true"
        />
      </button>
    );
  };

  return (
    <>
      {renderHandle('left')}
      {renderHandle('right')}
    </>
  );
});
