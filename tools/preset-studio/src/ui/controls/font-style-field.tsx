import { cn } from '@/lib/utils';
import { Button } from '@/ui/shadcn/button';
import type { CSSProperties, ReactNode } from 'react';
import { FieldRow, humanizeFieldKey } from './field-row';
import type { PropertyLockState } from './property-lock';

const FONT_STYLE_OPTIONS = ['normal', 'italic', 'oblique'] as const;
type FontStyle = (typeof FONT_STYLE_OPTIONS)[number];

interface FontStyleFieldProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  description?: string;
  compact?: boolean;
  id?: string;
  childrenAfter?: ReactNode;
  disabled?: boolean;
  lock?: PropertyLockState | null;
}

/** Segmented typographic control for the Font component's render style. */
export function FontStyleField({
  label,
  value,
  onChange,
  description,
  compact,
  id,
  childrenAfter,
  disabled = false,
  lock = null,
}: FontStyleFieldProps) {
  const selectedValue: FontStyle = FONT_STYLE_OPTIONS.includes(value as FontStyle) ? (value as FontStyle) : 'normal';

  return (
    <FieldRow label={label} description={description} htmlFor={id} compact={compact} childrenAfter={childrenAfter} lock={lock}>
      <div
        id={id}
        role="group"
        aria-label={label}
        className="inline-flex overflow-hidden rounded-md border border-border/70 bg-muted"
      >
        {FONT_STYLE_OPTIONS.map((option) => {
          const active = option === selectedValue;
          const style: CSSProperties = { fontStyle: option };
          return (
            <Button
              key={option}
              type="button"
              variant="ghost"
              className={cn(
                'h-8 min-w-16 rounded-none bg-muted px-2 text-xs text-muted-foreground shadow-none hover:bg-muted/80 hover:text-foreground',
                active && 'bg-background text-foreground hover:bg-background',
                option !== FONT_STYLE_OPTIONS[FONT_STYLE_OPTIONS.length - 1] && 'border-r border-border/70',
              )}
              aria-pressed={active}
              disabled={disabled || lock?.locked === true}
              aria-label={`${label} ${humanizeFieldKey(option)}`}
              title={humanizeFieldKey(option)}
              onClick={() => onChange(option)}
            >
              <span style={style}>{humanizeFieldKey(option)}</span>
            </Button>
          );
        })}
      </div>
    </FieldRow>
  );
}
