import { useState, type ReactNode } from 'react';
import { Crosshair } from 'lucide-react';

import { DEBUG_ENTITY_COLORS, DEBUG_ENTITY_LABELS, type PositionPreviewTarget } from '@/ui/preview/entity-debug';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';

export function PositionPreviewIcon({
  target,
  active,
  pinned,
  onHoverTarget,
  onToggleTarget,
}: {
  target: PositionPreviewTarget;
  active: boolean;
  pinned: boolean;
  onHoverTarget: (preview: PositionPreviewTarget | null) => void;
  onToggleTarget: (preview: PositionPreviewTarget) => void;
}): ReactNode {
  const color = DEBUG_ENTITY_COLORS[target.kind];
  const label = `${DEBUG_ENTITY_LABELS[target.kind]} Transform Position`;
  const [isHovered, setIsHovered] = useState(false);
  const selected = active || pinned;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={pinned ? `Clear ${label}` : `Preview ${label}`}
          aria-pressed={pinned}
          title={pinned ? `Clear ${label}` : `Preview ${label}`}
          className={cn(
            'relative inline-flex size-5 shrink-0 items-center justify-center rounded transition-[opacity,transform] active:scale-95',
            selected ? 'opacity-100' : 'opacity-60',
          )}
          onMouseEnter={() => {
            setIsHovered(true);
            onHoverTarget(target);
          }}
          onMouseLeave={() => {
            setIsHovered(false);
            onHoverTarget(null);
          }}
          onMouseDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
            onToggleTarget(target);
          }}
        >
          <Crosshair
            className="text-muted-foreground/80 relative size-3.5 transition-colors duration-150"
            style={isHovered || selected ? { color } : undefined}
            aria-hidden="true"
          />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {pinned ? 'Click to clear position preview' : 'Preview position'}
      </TooltipContent>
    </Tooltip>
  );
}
