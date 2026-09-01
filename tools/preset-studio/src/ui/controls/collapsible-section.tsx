import { ChevronDown, ChevronRight } from 'lucide-react';
import { type ReactNode, useContext, useState } from 'react';

import { cn } from '@/lib/utils';
import {
  INSPECTOR_CARD_CONTENT_STACK_CLASS,
  INSPECTOR_LABELED_SECTION_VERTICAL_PADDING_CLASS,
} from './inspector-layout';
import { InspectorCardStateContext } from './inspector-card-state-context';

/**
 * A single labeled sub-section within an already-open component/effect card
 * (e.g. Animation's "Sequencing" block) - its own small chevron toggle, kept
 * independent of the card's own expand/collapse state. The expanded content
 * is visually inset with a hover-aware left border by default.
 */
export function CollapsibleSection({
  title,
  leadingContent,
  defaultOpen = true,
  children,
  stateKey,
  className,
  contentClassName,
  open: controlledOpen,
  onOpenChange,
}: {
  title: ReactNode;
  leadingContent?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  stateKey?: string;
  className?: string;
  contentClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}): ReactNode {
  const context = useContext(InspectorCardStateContext);
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const open =
    controlledOpen ??
    (stateKey && context ? (context.openState[stateKey] ?? defaultOpen) : localOpen);
  const setOpen = (next: boolean) => {
    if (onOpenChange) {
      onOpenChange(next);
      return;
    }
    if (stateKey && context) {
      context.updateOpenState((previous) => {
        if ((previous[stateKey] ?? defaultOpen) === next) return previous;
        return { ...previous, [stateKey]: next };
      });
      return;
    }
    setLocalOpen(next);
  };

  return (
    <div className={cn(INSPECTOR_CARD_CONTENT_STACK_CLASS, className)}>
      <div className="peer flex min-w-0 items-center gap-1">
        {leadingContent}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={stateKey}
          onClick={() => setOpen(!open)}
          className={cn(
            'text-muted-foreground hover:text-foreground flex min-w-0 flex-1 items-center gap-1 text-left text-xs font-medium',
            INSPECTOR_LABELED_SECTION_VERTICAL_PADDING_CLASS,
          )}
        >
          {open ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
          <span className="tracking-wide uppercase">{title}</span>
        </button>
      </div>
      {open && (
        <div
          id={stateKey}
          data-collapsible-section-content="true"
          className={cn(
            'transition-colors',
            contentClassName ?? 'border-border/60 hover:border-border peer-hover:border-foreground ml-1.5 border-l pl-3',
            INSPECTOR_CARD_CONTENT_STACK_CLASS,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
