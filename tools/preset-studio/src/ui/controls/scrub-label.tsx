import { cn } from '@/lib/utils';
import { EW_RESIZE_CURSOR } from '@/ui/preview/preview-cursor';
import type { ReactNode } from 'react';
import { useDragScrub } from './scrub';

function dispatchScrubEvent(target: HTMLElement, type: 'scrubstart' | 'scrubend'): void {
  target.dispatchEvent(new Event(type, { bubbles: true }));
}

function setInputValue(target: HTMLInputElement, next: number): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(target, `${next}`);
  else target.value = `${next}`;
  target.dispatchEvent(new Event('input', { bubbles: true }));
}

interface ScrubLabelProps {
  children: ReactNode;
  /** Read fresh at drag-start - lets scrubbing an "Auto" field's label start from its live resolved value. */
  getValue: () => number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  /** Flips an "Auto" switch off the instant a drag starts, so the reveal + the scrub happen in one continuous gesture. */
  onScrubStart?: () => void;
  className?: string;
  htmlFor?: string;
}

/**
 * Makes a label/mini-label (e.g. a field's own title, or a Vector2 field's
 * "X"/"Y"/"W"/"H" axis tag) draggable exactly like its paired number input - same two-headed resize cursor, same click-drag-to-scrub behavior - so users
 * do not have to land the pointer precisely on the (often narrow) number box
 * to start scrubbing.
 */
export function ScrubLabel({
  children,
  getValue,
  onChange,
  min,
  max,
  step,
  disabled,
  onScrubStart,
  className,
  htmlFor,
}: ScrubLabelProps) {
  const handleScrubChange = (next: number) => {
    if (htmlFor) {
      const target = document.getElementById(htmlFor) as HTMLInputElement | null;
      if (target) {
        setInputValue(target, next);
        return;
      }
    }
    onChange(next);
  };

  const handlers = useDragScrub({ getValue, onChange: handleScrubChange, min, max, step, disabled, onScrubStart });
  const { onPointerDown, onPointerUp, onPointerCancel } = handlers;
  return (
    <button
      type="button"
      className={cn(
        'appearance-none border-0 bg-transparent p-0 text-left touch-none select-none',
        className,
      )}
      draggable={false}
      disabled={disabled}
      style={!disabled ? { cursor: EW_RESIZE_CURSOR } : undefined}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (!disabled && htmlFor) {
          const target = document.getElementById(htmlFor) as HTMLInputElement | null;
          if (target) dispatchScrubEvent(target, 'scrubstart');
        }
        onPointerDown(event);
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        if (htmlFor) {
          const target = document.getElementById(htmlFor) as HTMLInputElement | null;
          if (target) dispatchScrubEvent(target, 'scrubend');
        }
        onPointerUp(event);
      }}
      onPointerCancel={(event) => {
        event.stopPropagation();
        if (htmlFor) {
          const target = document.getElementById(htmlFor) as HTMLInputElement | null;
          if (target) dispatchScrubEvent(target, 'scrubend');
        }
        onPointerCancel(event);
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {children}
    </button>
  );
}
