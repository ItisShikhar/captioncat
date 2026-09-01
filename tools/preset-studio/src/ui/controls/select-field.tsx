import { DEBUG_ENTITY_COLORS, type DebugEntityKind } from '@/ui/preview/entity-debug';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/shadcn/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';
import type { ReactNode } from 'react';
import { FieldRow, humanizeFieldKey } from './field-row';
import { DeferredTextInput } from './deferred-text-input';
import type { PropertyLockState } from './property-lock';

interface SelectFieldProps {
  label: string;
  value: string;
  options: readonly string[];
  optionLabels?: Partial<Record<string, string>>;
  optionDescriptions?: Partial<Record<string, ReactNode>>;
  onChange: (next: string) => void;
  description?: ReactNode;
  compact?: boolean;
  id?: string;
  childrenAfter?: ReactNode;
  /** Maps a subset of `options` to the debug-overlay entity they bind/size this element to - see `FieldMeta.optionEntityKind`. */
  optionEntityKind?: Partial<Record<string, DebugEntityKind>>;
  /** Exclusively previews one entity's overlay in the live preview while hovering a mapped option, `null` to restore whatever was showing before - see `DebugEntityHoverContext`. */
  onHoverEntity?: (kind: DebugEntityKind | null) => void;
  disabled?: boolean;
  lock?: PropertyLockState | null;
}

export function SelectField({
  label,
  value,
  options,
  optionLabels,
  optionDescriptions,
  onChange,
  description,
  compact,
  id,
  childrenAfter,
  optionEntityKind,
  onHoverEntity,
  disabled = false,
  lock = null,
}: SelectFieldProps) {
  return (
    <FieldRow label={label} description={description} htmlFor={id} compact={compact} childrenAfter={childrenAfter} lock={lock}>
      <Select value={value} onValueChange={onChange} disabled={disabled || lock?.locked === true}>
        <SelectTrigger id={id} className="h-8 w-full">
          <SelectValue placeholder="Select..." />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => {
            const entityKind = optionEntityKind?.[opt];
            const optionContent = (
              <span className="inline-flex items-center gap-1.5">
                {entityKind && (
                  <span
                    className="inline-block size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: DEBUG_ENTITY_COLORS[entityKind] }}
                    aria-hidden="true"
                  />
                )}
                {optionLabels?.[opt] ?? humanizeFieldKey(opt)}
              </span>
            );
            return (
              <SelectItem
                key={opt}
                value={opt}
                onMouseEnter={entityKind ? () => onHoverEntity?.(entityKind) : undefined}
                onMouseLeave={entityKind ? () => onHoverEntity?.(null) : undefined}
              >
                {optionDescriptions?.[opt] ? (
                  <Tooltip>
                    <TooltipTrigger asChild>{optionContent}</TooltipTrigger>
                    <TooltipContent side="right" className="max-w-64 text-xs whitespace-pre-line">
                      {optionDescriptions[opt]}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  optionContent
                )}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </FieldRow>
  );
}

interface StringFieldProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  description?: ReactNode;
  compact?: boolean;
  id?: string;
  childrenAfter?: ReactNode;
  disabled?: boolean;
  lock?: PropertyLockState | null;
}

/** Free-text fallback for `string` leaves that are not recognized closed enums. */
export function StringField({ label, value, onChange, description, compact, id, childrenAfter, disabled = false, lock = null }: StringFieldProps) {
  return (
    <FieldRow label={label} description={description} htmlFor={id} compact={compact} childrenAfter={childrenAfter} lock={lock}>
      <DeferredTextInput
        id={id}
        className="h-8"
        value={value}
        onCommit={onChange}
        disabled={disabled || lock?.locked === true}
      />
    </FieldRow>
  );
}
