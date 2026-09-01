import type { FieldMeta } from '@/schema';
import { roundNumericInput } from '@/lib/number-precision';
import { cn } from '@/lib/utils';
import { Slider } from '@/ui/shadcn/slider';
import { useId, useState, type ReactNode } from 'react';
import { DeferredNumberInput } from './deferred-number-input';
import { PropertyLockIndicator, type PropertyLockState } from './property-lock';
import { FieldRow } from './field-row';

interface NumberFieldProps {
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

/** Rounds `value` to the Studio precision and clamps it into `[min, max]` when both bounds are provided. */
export function clampNumber(value: number, meta: FieldMeta | undefined): number {
  if (Number.isNaN(value)) return 0;
  let out = roundNumericInput(value);
  if (meta?.min !== undefined) out = Math.max(meta.min, out);
  if (meta?.max !== undefined) out = Math.min(meta.max, out);
  return out;
}

/**
 * Shared live-preview-then-commit-on-release behavior for any Radix `Slider`
 * bound to a possibly-expensive `onChange` (one that cascades into a much
 * bigger re-render up the tree, for example the whole document or animation state).
 * Every percent-slider in the app (`NumberField`, `Vector2Field`,
 * `NumberOrAutoField`) shares this ONE hook instead of each hand-rolling its
 * own preview-state plumbing. Dragging updates a local preview value
 * immediately for smooth visuals. `onChange` itself fires once, via
 * Radix's own `onValueCommit`, when the drag/gesture ends.
 */
export function useSliderCommit(committedValue: number, onChange: (next: number) => void, meta: FieldMeta | undefined) {
  const [preview, setPreview] = useState<number | null>(null);
  const commit = (next: number) => {
    const value = clampNumber(next, meta);
    setPreview(null);
    onChange(value);
  };
  return {
    displayValue: preview ?? committedValue,
    onValueChange: (next: number[]) => setPreview(clampNumber(next[0] ?? committedValue, meta)),
    onValueCommit: (next: number[]) => commit(next[0] ?? committedValue),
    onCommit: commit,
  };
}

export function NumberField({
  label,
  value,
  onChange,
  meta,
  description,
  compact,
  id,
  childrenAfter,
  disabled,
  lock,
}: NumberFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const locked = lock?.locked === true;
  const inputDisabled = disabled || locked;
  const isPercent = meta?.unit === '%';
  const slider = useSliderCommit(value, onChange, meta);
  const valueForInput = isPercent ? slider.displayValue : value;
  const inputCommonProps = {
    id: fieldId,
    disabled: inputDisabled,
    min: meta?.min,
    max: meta?.max,
    step: meta?.step ?? 'any',
    onCommit: slider.onCommit,
  } as const;

  return (
    <FieldRow
      label={label}
      description={description ?? meta?.description}
      htmlFor={fieldId}
      compact={compact}
      childrenAfter={childrenAfter}
      lock={null}
      scrub={{
        getValue: () => (Number.isFinite(value) ? value : 0),
        onChange: (next) => onChange(clampNumber(next, meta)),
        min: meta?.min,
        max: meta?.max,
        step: meta?.step,
        disabled: inputDisabled,
      }}
    >
      {isPercent ? (
        <div className="flex items-center gap-1.5">
          <DeferredNumberInput
            className="h-8 w-20 shrink-0 font-mono text-xs"
            value={valueForInput}
            onValueChange={(next) => slider.onValueChange([next])}
            {...inputCommonProps}
          />
          <PropertyLockIndicator lock={lock} className="size-3" />
          <div className="min-w-0 flex-1">
            <Slider
              value={[Number.isFinite(slider.displayValue) ? slider.displayValue : 0]}
              disabled={inputDisabled}
              min={meta?.min ?? 0}
              max={meta?.max ?? 100}
              step={meta?.step ?? 1}
              onValueChange={slider.onValueChange}
              onValueCommit={slider.onValueCommit}
              className={cn('[&_[data-slot=slider-track]]:bg-muted')}
            />
          </div>
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{`${Math.round(
            Number.isFinite(slider.displayValue) ? slider.displayValue : 0,
          )}%`}</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <DeferredNumberInput
            className="h-8 flex-1 min-w-0"
            value={valueForInput}
            inlineEndContent={meta?.unit}
            {...inputCommonProps}
          />
          <PropertyLockIndicator lock={lock} className="size-3" />
        </div>
      )}
    </FieldRow>
  );
}
