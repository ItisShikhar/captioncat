import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';
import type { ReactNode } from 'react';
import { FieldRow } from './field-row';
import type { PropertyLockState } from './property-lock';

const CAP_TYPE_OPTIONS = ['butt', 'round', 'square'] as const;

type CapType = (typeof CAP_TYPE_OPTIONS)[number];

const CAP_TYPE_LABELS: Record<CapType, string> = {
  butt: 'Butt',
  round: 'Round',
  square: 'Square',
};

const CAP_TYPE_DESCRIPTIONS: Record<CapType, string> = {
  butt: 'Ends exactly at the path endpoint.',
  round: 'Adds a semicircle beyond the path endpoint.',
  square: 'Adds a half-width extension beyond the path endpoint.',
};

function CapTypeGlyph({ type }: { type: CapType }): ReactNode {
  return (
    <svg width="24" height="24" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 12h14"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap={type}
      />
      <path
        d="M5 6v12M19 6v12"
        stroke="var(--fpl-icon-color-3, var(--color-icon-tertiary))"
        strokeWidth="1"
      />
    </svg>
  );
}

function CapTypeInfo(): ReactNode {
  return (
    <div className="space-y-1.5">
      <p className="font-medium">Cap type</p>
      <p>Controls how an open stroke ends.</p>
      <div className="space-y-1">
        {CAP_TYPE_OPTIONS.map((type) => (
          <p key={type}>
            <span className="font-medium">{CAP_TYPE_LABELS[type]}:</span> {CAP_TYPE_DESCRIPTIONS[type]}
          </p>
        ))}
      </div>
    </div>
  );
}

export interface CapTypeFieldProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options?: readonly string[];
  description?: ReactNode;
  compact?: boolean;
  id?: string;
  childrenAfter?: ReactNode;
  disabled?: boolean;
  lock?: PropertyLockState | null;
}

export function CapTypeField({
  label,
  value,
  onChange,
  options = CAP_TYPE_OPTIONS,
  description,
  compact,
  id = 'cap-type',
  childrenAfter,
  disabled = false,
  lock = null,
}: CapTypeFieldProps) {
  const availableOptions = CAP_TYPE_OPTIONS.filter((option) => options.includes(option));
  const isDisabled = disabled || lock?.locked === true;

  return (
    <FieldRow
      label={label}
      description={description ?? <CapTypeInfo />}
      compact={compact}
      childrenAfter={childrenAfter}
      lock={lock}
    >
      <div
        role="radiogroup"
        aria-label={label}
        className="flex w-fit overflow-hidden rounded-md border border-border/70 bg-muted"
      >
        {availableOptions.map((option) => {
          const selected = value === option;
          const optionId = `${id}-${option}`;
          return (
            <Tooltip key={option}>
              <TooltipTrigger asChild>
                <label
                  htmlFor={optionId}
                  className={cn(
                    'relative flex size-9 cursor-pointer items-center justify-center border-r border-input/70 text-muted-foreground transition-colors last:border-r-0',
                    'hover:bg-muted/80 hover:text-foreground focus-within:z-10 focus-within:ring-2 focus-within:ring-ring focus-within:ring-inset',
                    selected && 'z-10 bg-background text-foreground hover:bg-background hover:text-foreground',
                    isDisabled && 'cursor-not-allowed opacity-50 hover:bg-muted hover:text-muted-foreground',
                  )}
                >
                  <input
                    id={optionId}
                    type="radio"
                    name={id}
                    value={option}
                    checked={selected}
                    onChange={() => onChange(option)}
                    disabled={isDisabled}
                    className="sr-only"
                  />
                  <CapTypeGlyph type={option} />
                  <span className="sr-only">{CAP_TYPE_LABELS[option]}</span>
                </label>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-64 text-xs whitespace-pre-line">
                <p className="font-medium">{CAP_TYPE_LABELS[option]}</p>
                <p>{CAP_TYPE_DESCRIPTIONS[option]}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </FieldRow>
  );
}
