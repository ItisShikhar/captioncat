import { type ComponentType, type ReactNode } from 'react';

import { usePopoverOutsideDismissal } from '@/ui/controls/use-popover-outside-dismissal';
import { Button, type buttonVariants } from '@/ui/shadcn/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/shadcn/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';
import type { VariantProps } from 'class-variance-authority';

/** Small icon button that opens a confirmation popover before an irreversible action. */
export function ConfirmPopoverButton({
  icon: Icon,
  ariaLabel,
  tooltip,
  title,
  description,
  confirmLabel = 'Confirm',
  confirmVariant = 'destructive',
  onConfirm,
  className = 'text-muted-foreground hover:text-foreground -m-1 flex size-6 shrink-0 items-center justify-center rounded',
  iconClassName = 'size-3.5',
}: {
  icon: ComponentType<{ className?: string }>;
  ariaLabel: string;
  /** Optional hover tooltip shown on the trigger, separate from the confirmation content. */
  tooltip?: string;
  title: string;
  description?: string;
  confirmLabel?: string;
  confirmVariant?: VariantProps<typeof buttonVariants>['variant'];
  onConfirm: () => void;
  className?: string;
  iconClassName?: string;
}): ReactNode {
  const { layerId, open, setOpen } = usePopoverOutsideDismissal();

  const trigger = (
    <PopoverTrigger asChild>
      <button
        type="button"
        aria-label={ariaLabel}
        data-popover-layer-trigger={layerId}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={className}
      >
        <Icon className={iconClassName} />
      </button>
    </PopoverTrigger>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="top">{tooltip}</TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <PopoverContent
        align="end"
        className="w-56 p-3"
        data-keyframe-ui
        data-popover-layer-content={layerId}
        dismissOnOutside={false}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="text-muted-foreground mt-1 text-xs">{description}</p>}
        <div className="mt-3 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="xs" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            size="xs"
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
