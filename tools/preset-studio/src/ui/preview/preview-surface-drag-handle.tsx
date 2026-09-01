import { cn } from '@/lib/utils';
import { Button } from '@/ui/shadcn/button';
import { GripVertical } from 'lucide-react';
import { memo, type PointerEventHandler } from 'react';
import { HAND_CURSOR } from './preview-cursor';

export interface PreviewSurfaceDragHandleProps {
  previewTitle: string;
  isDragging?: boolean;
  idleCursor?: 'cursor-grab' | 'cursor-pointer';
  showGrabCursorOnHover?: boolean;
  onPointerDown: PointerEventHandler<HTMLElement>;
}

export const NOOP_PREVIEW_SURFACE_DRAG_START: PointerEventHandler<HTMLElement> = () => undefined;

export const PreviewSurfaceDragHandle = memo(function PreviewSurfaceDragHandle({
  previewTitle,
  isDragging = false,
  idleCursor = 'cursor-grab',
  showGrabCursorOnHover = false,
  onPointerDown,
}: PreviewSurfaceDragHandleProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className={cn(
        isDragging ? 'cursor-grabbing' : idleCursor,
        showGrabCursorOnHover && !isDragging && 'hover:cursor-grab',
      )}
      style={isDragging || showGrabCursorOnHover ? { cursor: HAND_CURSOR } : undefined}
      data-preview-viewport-control="true"
      data-preview-surface-drag-handle="true"
      aria-label={`Move ${previewTitle}`}
      onPointerDown={(event) => {
        if (event.button === 1) return;
        event.stopPropagation();
        onPointerDown(event);
      }}
    >
      <GripVertical className="size-3.5" />
    </Button>
  );
});
