import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';
import type { ReactNode } from 'react';
import { FieldRow } from './field-row';
import type { PropertyLockState } from './property-lock';

const JOIN_TYPE_OPTIONS = ['miter', 'bevel', 'round'] as const;

type JoinType = (typeof JOIN_TYPE_OPTIONS)[number];

const JOIN_TYPE_LABELS: Record<JoinType, string> = {
  miter: 'Miter',
  bevel: 'Bevel',
  round: 'Round',
};

const JOIN_TYPE_DESCRIPTIONS: Record<JoinType, string> = {
  miter: 'Extends the outer edges to a sharp corner.',
  bevel: 'Cuts off the corner with a straight edge.',
  round: 'Rounds the outside corner.',
};

function JoinTypeGlyph({ type }: { type: JoinType }): ReactNode {
  const path =
    type === 'miter'
      ? 'M6.5 6a.5.5 0 0 0 0 1H17v10.5a.5.5 0 0 0 1 0v-11a.5.5 0 0 0-.5-.5z'
      : type === 'bevel'
        ? 'M6.5 6a.5.5 0 0 0 0 1h5.793L17 11.707V17.5a.5.5 0 0 0 1 0v-6a.5.5 0 0 0-.146-.354l-5-5A.5.5 0 0 0 12.5 6z'
        : 'M6.5 6a.5.5 0 0 0 0 1h5a5.5 5.5 0 0 1 5.5 5.5v5a.5.5 0 0 0 1 0v-5A6.5 6.5 0 0 0 11.5 6z';
  return (
    <svg width="24" height="24" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" fillRule="evenodd" d={path} clipRule="evenodd" />
      <path
        fill="var(--fpl-icon-color-3, var(--color-icon-tertiary))"
        fillRule="evenodd"
        d="M11 16.429V17.5a.5.5 0 0 0 1 0v-1.071a.5.5 0 0 0-1 0M11 13v.571a.5.5 0 0 0 1 0V12.5a.5.5 0 0 0-.4-.49l-.1-.01h-1.071a.5.5 0 0 0 0 1zm-3.328-.99-.1-.01H6.5a.5.5 0 0 0 0 1h1.071l.1-.01a.5.5 0 0 0 0-.98"
        clipRule="evenodd"
      />
    </svg>
  );
}

function JoinTypeInfo(): ReactNode {
  return (
    <div className="space-y-1.5">
      <p className="font-medium">Join type</p>
      <p>Controls the outside corner where two stroke segments meet.</p>
      <div className="space-y-1">
        {JOIN_TYPE_OPTIONS.map((type) => (
          <p key={type}>
            <span className="font-medium">{JOIN_TYPE_LABELS[type]}:</span> {JOIN_TYPE_DESCRIPTIONS[type]}
          </p>
        ))}
      </div>
    </div>
  );
}

export interface JoinTypeFieldProps {
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

export function JoinTypeField({
  label,
  value,
  onChange,
  options = JOIN_TYPE_OPTIONS,
  description,
  compact,
  id = 'join-type',
  childrenAfter,
  disabled = false,
  lock = null,
}: JoinTypeFieldProps) {
  const availableOptions = JOIN_TYPE_OPTIONS.filter((option) => options.includes(option));
  const isDisabled = disabled || lock?.locked === true;

  return (
    <FieldRow
      label={label}
      description={description ?? <JoinTypeInfo />}
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
                  <JoinTypeGlyph type={option} />
                  <span className="sr-only">{JOIN_TYPE_LABELS[option]}</span>
                </label>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-64 text-xs whitespace-pre-line">
                <p className="font-medium">{JOIN_TYPE_LABELS[option]}</p>
                <p>{JOIN_TYPE_DESCRIPTIONS[option]}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </FieldRow>
  );
}
