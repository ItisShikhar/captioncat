import { useState, type MouseEvent, type ReactNode } from 'react';

import {
  DEBUG_ENTITY_COLORS,
  DEBUG_ENTITY_LABELS,
  type DebugEntityKind,
  type PaddingPreviewTarget,
  type PositionPreviewTarget,
} from '@/ui/preview/entity-debug';
import { DEBUG_ENTITY_ICONS } from '@/ui/preview/debug-entity-icons';
import { isHierarchyDragHoverSuppressed } from '../entity-tree';

/**
 * Small colored icon placed before an entity card's title. Hovering it
 * previews that entity's real, engine-computed bounding box(es) in the live
 * preview (`LivePreviewPanel`) - temporary on hover, or pinned/unpinned on click.
 */
export function EntityHoverIcon({
  kind,
  onHoverEntity,
  active,
  pinned,
  onToggleEntity,
  paddingPreviewTarget,
  onHoverPaddingPreviewTarget,
  positionPreviewTarget,
  onHoverPositionPreviewTarget,
  allowHover = true,
  interactive = true,
}: {
  kind: DebugEntityKind;
  onHoverEntity: (entity: DebugEntityKind | null) => void;
  active: boolean;
  pinned: boolean;
  onToggleEntity: (entity: DebugEntityKind) => void;
  paddingPreviewTarget?: PaddingPreviewTarget | null;
  onHoverPaddingPreviewTarget?: (target: PaddingPreviewTarget | null) => void;
  positionPreviewTarget?: PositionPreviewTarget | null;
  onHoverPositionPreviewTarget?: (target: PositionPreviewTarget | null) => void;
  allowHover?: boolean;
  interactive?: boolean;
}): ReactNode {
  const Icon = DEBUG_ENTITY_ICONS[kind];
  const [isHovered, setIsHovered] = useState(false);
  const hoverHandlers = allowHover
    ? {
        onMouseEnter: () => {
          if (isHierarchyDragHoverSuppressed()) return;
          setIsHovered(true);
          onHoverEntity(kind);
          if (paddingPreviewTarget && onHoverPaddingPreviewTarget) {
            onHoverPaddingPreviewTarget(paddingPreviewTarget);
          }
          if (positionPreviewTarget && onHoverPositionPreviewTarget) {
            onHoverPositionPreviewTarget(positionPreviewTarget);
          }
        },
        onMouseLeave: () => {
          setIsHovered(false);
          if (isHierarchyDragHoverSuppressed()) return;
          onHoverEntity(null);
          if (onHoverPaddingPreviewTarget) onHoverPaddingPreviewTarget(null);
          if (onHoverPositionPreviewTarget) onHoverPositionPreviewTarget(null);
        },
        onMouseDown: (event: MouseEvent<HTMLElement>) => {
          event.stopPropagation();
          if (isHierarchyDragHoverSuppressed()) return;
          onHoverEntity(kind);
          if (paddingPreviewTarget && onHoverPaddingPreviewTarget) {
            onHoverPaddingPreviewTarget(paddingPreviewTarget);
          }
          if (positionPreviewTarget && onHoverPositionPreviewTarget) {
            onHoverPositionPreviewTarget(positionPreviewTarget);
          }
        },
      }
    : {
        onMouseEnter: undefined,
        onMouseLeave: undefined,
        onMouseDown: (event: MouseEvent<HTMLElement>) => {
          event.stopPropagation();
        },
      };
  return (
    <span
      data-debug-entity={kind}
      {...hoverHandlers}
      onClick={
        interactive
          ? (e) => {
              e.stopPropagation();
              onToggleEntity(kind);
            }
          : undefined
      }
      title={interactive ? (pinned ? `Click to unpin "${DEBUG_ENTITY_LABELS[kind]}"` : `Click to pin "${DEBUG_ENTITY_LABELS[kind]}"`) : undefined}
      className={`group relative inline-flex shrink-0 cursor-pointer items-center justify-center self-center transition-[opacity,transform] ${
        interactive ? 'active:scale-95' : ''
      }`}
      style={{ opacity: active ? 1 : undefined }}
    >
      <Icon
        className="text-muted-foreground/80 size-4 shrink-0 transition-colors duration-150"
        style={isHovered || pinned ? { color: DEBUG_ENTITY_COLORS[kind] } : undefined}
      />
    </span>
  );
}
