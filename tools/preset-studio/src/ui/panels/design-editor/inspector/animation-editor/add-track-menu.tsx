import { Plus } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import type { AnimatableTargetOption } from '@/schema';
import { humanizeFieldKey } from '@/ui/controls/field-row';
import { usePopoverOutsideDismissal } from '@/ui/controls/use-popover-outside-dismissal';
import { Button } from '@/ui/shadcn/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/shadcn/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';

import { groupTargetsByOwner, humanizeTargetProp } from './helpers';
import { CurrentlyDisabledBadge } from '../currently-disabled-badge';

/** One target-option row, styled to match `EntityAddMenu`'s "Add Components and Effects" item exactly. */
function AddTrackOption({ label, onClick }: { label: string; onClick: () => void }): ReactNode {
  return (
    <button
      type="button"
      className="hover:bg-accent hover:text-accent-foreground flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition-colors"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/**
 * "+" menu for adding a track targeting one of `options`, styled to match
 * `EntityAddMenu`'s "Add Components and Effects" popover one-to-one (same
 * `w-64 p-2` shell, `px-3 pt-1 text-xs font-medium text-muted-foreground`
 * section labels, `px-3 py-2` item rows, and a `border-border/60 my-1
 * border-t` divider between groups). Renders nothing once every option in
 * scope is already used.
 *
 * `groupByOwner` groups `options` by their owning Component/Effect for the
 * drawer's single "add any track" entry point, which spans every owner.
 * Omit it for a menu already scoped to one owner, where
 * the owner is already stated by that group's own header, so items show
 * the prop name with no redundant sub-heading).
 */
export function AddTrackMenu({
  options,
  onAdd,
  groupByOwner,
  fullWidthTrigger,
  disabledOwners,
  open: controlledOpen,
  onOpenChange,
}: {
  options: readonly AnimatableTargetOption[];
  onAdd: (option: AnimatableTargetOption) => void;
  groupByOwner?: boolean;
  /** Renders a wide "+ Add track…" button instead of the small "+" icon button (used for the drawer's single, un-scoped add entry point). */
  fullWidthTrigger?: boolean;
  /** Track owners whose component/effect is currently disabled. */
  disabledOwners?: ReadonlySet<string>;
  /** Controls the popover when a parent needs to open it with another surface. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}): ReactNode {
  const [boundaryEl, setBoundaryEl] = useState<HTMLElement | null>(null);
  const [triggerHovered, setTriggerHovered] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const { layerId, open, setOpen } = usePopoverOutsideDismissal(controlledOpen, onOpenChange);

  useEffect(() => {
    if (!open || boundaryEl) return;
    const boundary = triggerRef.current?.closest<HTMLElement>('[data-slot="tracks-drawer"], [data-slot="effects-drawer"]');
    if (boundary) setBoundaryEl(boundary);
  }, [boundaryEl, open]);

  if (options.length === 0) return null;
  const groups = groupByOwner ? groupTargetsByOwner(options) : [{ owner: '', options: [...options] }];

  // Radix's own `--radix-popover-content-available-height` defaults to measuring against the
  // whole VIEWPORT, not this small floating drawer - without an explicit `collisionBoundary` the
  // popover can render past the drawer's own bottom edge (there is plenty of room in the real
  // viewport even though it visually spills onto whatever is behind the drawer). Resolved lazily
  // on first open since the drawer's own portal/mount timing cannot be relied on at mount time.
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    setTriggerHovered(false);
    if (next && !boundaryEl) {
      setBoundaryEl(
        triggerRef.current?.closest<HTMLElement>('[data-slot="tracks-drawer"], [data-slot="effects-drawer"]') ?? null,
      );
    }
  };

  const triggerButton = fullWidthTrigger ? (
    <PopoverTrigger asChild>
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        size="sm"
        className="text-muted-foreground h-8 w-full justify-start text-xs"
        data-popover-layer-trigger={layerId}
        onPointerEnter={() => setTriggerHovered(true)}
        onPointerLeave={() => setTriggerHovered(false)}
      >
        <Plus className="size-4 stroke-[2.4]" />
        Add Track
      </Button>
    </PopoverTrigger>
  ) : (
    <Tooltip open={!open && triggerHovered}>
      <TooltipTrigger asChild>
        <PopoverTrigger asChild>
          <Button
            ref={triggerRef}
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-primary hover:text-primary"
            onClick={(e) => e.stopPropagation()}
            data-popover-layer-trigger={layerId}
            onPointerEnter={() => setTriggerHovered(true)}
            onPointerLeave={() => setTriggerHovered(false)}
          >
            <Plus className="size-4 stroke-[2.4]" />
          </Button>
        </PopoverTrigger>
      </TooltipTrigger>
      <TooltipContent side="top">Add track</TooltipContent>
    </Tooltip>
  );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      {triggerButton}
      <PopoverContent
        data-popover-layer-content={layerId}
        dismissOnOutside={false}
        align="end"
        collisionBoundary={boundaryEl}
        collisionPadding={8}
        className="max-h-[var(--radix-popover-content-available-height)] w-64 overflow-y-auto px-2 pt-4 pb-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1">
          {groups.map((group, groupIndex) => (
            <div key={`${group.owner}-${group.groupLabel ?? 'default'}`} className="flex flex-col gap-1">
              {groupIndex > 0 && <div className="border-border/60 my-1 border-t" />}
              <div className="flex flex-col items-start gap-0.5 px-3 pt-1">
                <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  {group.groupLabel ?? (groupByOwner ? humanizeFieldKey(group.ownerLabel ?? group.owner) : 'Add Track')}
                </div>
                {groupByOwner && disabledOwners?.has(group.owner) && <CurrentlyDisabledBadge />}
              </div>
              {group.options.map((option) => (
                <AddTrackOption
                  key={option.target}
                  label={humanizeTargetProp(option.target)}
                  onClick={() => {
                    onAdd(option);
                    handleOpenChange(false);
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
