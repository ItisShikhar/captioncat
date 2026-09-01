import { Info } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';

interface InfoTooltipProps {
  children: ReactNode;
  ariaLabel?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
  iconClassName?: string;
  contentClassName?: string;
}

/** An info tooltip that can be pinned with a click and dismissed outside. */
export function InfoTooltip({
  children,
  ariaLabel = 'More information',
  side = 'top',
  className,
  iconClassName,
  contentClassName,
}: InfoTooltipProps): ReactNode {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pinned) return;

    const handleDocumentPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      if (triggerRef.current?.contains(event.target) || event.target.closest('[data-slot="tooltip-content"]')) return;
      setPinned(false);
      setOpen(false);
    };

    document.addEventListener('pointerdown', handleDocumentPointerDown, true);
    return () => document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
  }, [pinned]);

  return (
    <Tooltip
      open={open}
      onOpenChange={() => undefined}
    >
      <TooltipTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label={ariaLabel}
          aria-expanded={open}
          className={cn(
            'text-muted-foreground/60 inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-sm',
            className,
          )}
          onClick={(event) => {
            event.stopPropagation();
            setPinned((currentPinned) => {
              const nextPinned = !currentPinned;
              setOpen(nextPinned);
              return nextPinned;
            });
          }}
        >
          <Info className={cn('size-3 shrink-0', iconClassName)} aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side={side}
        className={cn('max-w-64 text-xs whitespace-pre-line', contentClassName)}
      >
        {children}
      </TooltipContent>
    </Tooltip>
  );
}