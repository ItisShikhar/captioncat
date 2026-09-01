import type { DebugEntityKind, PaddingPreviewTarget, PositionPreviewTarget } from '@/ui/preview/entity-debug';

/** Debug-overlay controls threaded down to every entity card's hover icon. */
export interface DebugControls {
  hoveredEntity: DebugEntityKind | null;
  onHoverEntity: (entity: DebugEntityKind | null) => void;
  onHoverPaddingPreviewTarget: (target: PaddingPreviewTarget | null) => void;
  onHoverPositionPreviewTarget: (target: PositionPreviewTarget | null) => void;
  pinnedDebugEntities: DebugEntityKind[];
  showAllDebugOverlays: boolean;
  onToggleDebugEntity: (entity: DebugEntityKind) => void;
  onTogglePaddingPreviewTarget: (target: PaddingPreviewTarget) => void;
  onTogglePositionPreviewTarget: (target: PositionPreviewTarget) => void;
}
