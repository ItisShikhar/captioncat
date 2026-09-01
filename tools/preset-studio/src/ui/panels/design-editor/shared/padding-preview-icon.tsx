import { useState, type ReactNode } from 'react';

import { humanizeFieldKey } from '@/ui/controls/field-row';
import { cn } from '@/lib/utils';
import { DEBUG_ENTITY_COLORS, DEBUG_ENTITY_LABELS, type PaddingPreviewTarget } from '@/ui/preview/entity-debug';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';

export function PaddingPreviewIcon({
  target,
  active,
  pinned,
  onHoverTarget,
  onToggleTarget,
}: {
  target: PaddingPreviewTarget;
  active: boolean;
  pinned: boolean;
  onHoverTarget: (preview: PaddingPreviewTarget | null) => void;
  onToggleTarget: (preview: PaddingPreviewTarget) => void;
}): ReactNode {
  const color = DEBUG_ENTITY_COLORS[target.kind];
  const label = `${DEBUG_ENTITY_LABELS[target.kind]} ${humanizeFieldKey(target.component)} ${humanizeFieldKey(target.fieldKey)}`;
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
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            onHoverTarget(null);
            onToggleTarget(target);
          }}
        >
          <svg
            viewBox="0 0 24 24"
            className="text-muted-foreground/80 relative size-3.5 transition-colors duration-150"
            style={isHovered || selected ? { color } : undefined}
            fill="none"
            aria-hidden="true"
          >
            <rect x="4.5" y="4.5" width="15" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
            <rect x="8.5" y="8.5" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {pinned ? 'Click to clear padding preview' : 'Preview padding only'}
      </TooltipContent>
    </Tooltip>
  );
}
