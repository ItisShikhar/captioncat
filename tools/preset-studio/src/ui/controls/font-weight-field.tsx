import type { FieldMeta } from '@/schema/field-metadata';
import { PropertyLockIndicator, type PropertyLockState } from './property-lock';
import { clampNumber } from './number-field';
import { DeferredNumberInput } from './deferred-number-input';
import { FieldRow } from './field-row';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/ui/shadcn/select';
import { useEffect, useRef, useState, type ReactNode } from 'react';

const CUSTOM_WEIGHT_OPTION = 'custom';

const FONT_WEIGHT_NAME_OPTIONS = [
  { value: 'thin', label: 'Thin', weight: 100 },
  { value: 'extra-light', label: 'Extra Light', weight: 200 },
  { value: 'light', label: 'Light', weight: 300 },
  { value: 'regular', label: 'Regular', weight: 400 },
  { value: 'medium', label: 'Medium', weight: 500 },
  { value: 'semi-bold', label: 'Semi Bold', weight: 600 },
  { value: 'bold', label: 'Bold', weight: 700 },
  { value: 'extra-bold', label: 'Extra Bold', weight: 800 },
  { value: 'black', label: 'Black', weight: 900 },
] as const;

const COMMON_WEIGHT_VALUES = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

function selectionForWeight(weight: number): string {
  return (
    FONT_WEIGHT_NAME_OPTIONS.find((option) => option.weight === weight)?.value ??
    (COMMON_WEIGHT_VALUES.includes(weight as (typeof COMMON_WEIGHT_VALUES)[number]) ? String(weight) : CUSTOM_WEIGHT_OPTION)
  );
}

function weightForSelection(selection: string): number | undefined {
  const namedOption = FONT_WEIGHT_NAME_OPTIONS.find((option) => option.value === selection);
  if (namedOption) return namedOption.weight;
  if (COMMON_WEIGHT_VALUES.includes(Number(selection) as (typeof COMMON_WEIGHT_VALUES)[number])) return Number(selection);
  return undefined;
}

interface FontWeightFieldProps {
  label: string;
  value: number;
  onChange: (next: number) => void;
  meta?: FieldMeta;
  description?: ReactNode;
  compact?: boolean;
  id?: string;
  childrenAfter?: ReactNode;
  disabled?: boolean;
  lock?: PropertyLockState | null;
}

export function FontWeightField({
  label,
  value,
  onChange,
  meta,
  description,
  compact,
  id,
  childrenAfter,
  disabled = false,
  lock = null,
}: FontWeightFieldProps) {
  const currentWeight = Number.isFinite(value) ? value : 400;
  const [selection, setSelection] = useState(() => selectionForWeight(currentWeight));
  const lastPublishedWeight = useRef(currentWeight);
  const inputDisabled = disabled || lock?.locked === true;

  useEffect(() => {
    if (Object.is(lastPublishedWeight.current, currentWeight)) return;
    lastPublishedWeight.current = currentWeight;
    setSelection(selectionForWeight(currentWeight));
  }, [currentWeight]);

  const commitCustomWeight = (next: number) => {
    const resolvedWeight = clampNumber(next, meta);
    lastPublishedWeight.current = resolvedWeight;
    setSelection(CUSTOM_WEIGHT_OPTION);
    onChange(resolvedWeight);
  };

  const selectWeight = (nextSelection: string) => {
    setSelection(nextSelection);
    const nextWeight = weightForSelection(nextSelection);
    if (nextWeight === undefined) return;
    lastPublishedWeight.current = nextWeight;
    onChange(nextWeight);
  };

  return (
    <FieldRow
      label={label}
      description={description}
      htmlFor={id}
      compact={compact}
      childrenAfter={childrenAfter}
      lock={null}
      scrub={{
        getValue: () => currentWeight,
        onChange: commitCustomWeight,
        min: meta?.min,
        max: meta?.max,
        step: meta?.step,
        disabled: inputDisabled,
      }}
    >
      <div className="flex items-center gap-1.5">
        <Select value={selection} onValueChange={selectWeight} disabled={inputDisabled}>
          <SelectTrigger id={id} className="h-8 min-w-0 flex-1">
            <SelectValue placeholder="Select weight" />
          </SelectTrigger>
          <SelectContent>
            {FONT_WEIGHT_NAME_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
            <SelectSeparator />
            {COMMON_WEIGHT_VALUES.map((weight) => (
              <SelectItem key={weight} value={String(weight)}>
                {weight}
              </SelectItem>
            ))}
            <SelectSeparator />
            <SelectItem value={CUSTOM_WEIGHT_OPTION}>Custom</SelectItem>
          </SelectContent>
        </Select>
        <DeferredNumberInput
          className="h-8 w-20 shrink-0 font-mono text-xs"
          value={currentWeight}
          onValueChange={() => setSelection(CUSTOM_WEIGHT_OPTION)}
          onCommit={commitCustomWeight}
          min={meta?.min}
          max={meta?.max}
          step="any"
          aria-label={`${label} numeric value`}
          disabled={inputDisabled}
        />
        <PropertyLockIndicator lock={lock} className="size-3" />
      </div>
    </FieldRow>
  );
}
