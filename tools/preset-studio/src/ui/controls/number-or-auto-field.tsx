import type { FieldMeta } from '@/schema';
import { formatNumericInputValue, roundNumericInput } from '@/lib/number-precision';
import { Slider } from '@/ui/shadcn/slider';
import { Switch } from '@/ui/shadcn/switch';
import { useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { FieldRow } from './field-row';
import { clampNumber, useSliderCommit } from './number-field';
import { DeferredNumberInput } from './deferred-number-input';
import { PropertyLockIndicator } from './property-lock';
import { ScrubLabel } from './scrub-label';
import type { PropertyLockState } from './property-lock';

interface NumberOrAutoFieldProps {
  label: string;
  value: number | 'auto';
  onChange: (next: number | 'auto') => void;
  meta?: FieldMeta;
  description?: string;
  compact?: boolean;
  id?: string;
  childrenAfter?: ReactNode;
  /**
 * The real, engine-computed value this field currently resolves to while
 * set to "Auto" (e.g. Composition Area's Width/Height Percent, from the live
 * preview's actual rendered content) - used instead of `meta.autoOffDefault`
 * as the value to populate when the user turns "Auto" off, so it always
 * reflects reality rather than a generic static guess.
 */
  resolvedAutoValue?: number;
  disabled?: boolean;
  lock?: PropertyLockState | null;
}

export function NumberOrAutoField({
  label,
  value,
  onChange,
  meta,
  description,
  compact,
  id,
  resolvedAutoValue,
  childrenAfter,
  disabled = false,
  lock = null,
}: NumberOrAutoFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const locked = lock?.locked === true;
  const inputDisabled = disabled || locked;
  const isAuto = value === 'auto';
  const isPercent = meta?.unit === '%';

  // Remembers the last real number this field held (from the loaded JSON, or
  // whatever the user last typed) so turning "Auto" off restores it instead
  // of always jumping to a fixed default. Only ever overwritten while the
  // field holds a number (see below), so it survives Auto toggling
  // toggled on and off any number of times in a session.
  const lastNumericValueRef = useRef<number | null>(typeof value === 'number' ? value : null);
  if (typeof value === 'number') {
    lastNumericValueRef.current = value;
  }

  const autoOffValue = (): number =>
    roundNumericInput(lastNumericValueRef.current ?? resolvedAutoValue ?? meta?.autoOffDefault ?? meta?.min ?? 0);
  // What the row's label scrubs from/to: the real number when set, else the
  // live resolved-while-auto value - so dragging the label while still "Auto"
  // starts the scrub from exactly the number currently shown, not a jump.
  const displayValue = typeof value === 'number' ? value : (resolvedAutoValue ?? autoOffValue());
  const slider = useSliderCommit(typeof value === 'number' ? value : 0, (next) => onChange(next), meta);

  return (
    <FieldRow
      label={label}
      description={description ?? meta?.description}
      htmlFor={fieldId}
      compact={compact}
      childrenAfter={childrenAfter}
      lock={null}
      scrub={{
        getValue: () => displayValue,
        onChange: (next) => onChange(clampNumber(next, meta)),
        min: meta?.min,
        max: meta?.max,
        step: meta?.step,
        // Dragging the label while still "Auto" reveals the real control and
        // starts scrubbing in the same continuous gesture, instead of
        // requiring a separate click to turn Auto off first.
        onScrubStart: isAuto && !inputDisabled ? () => onChange(clampNumber(displayValue, meta)) : undefined,
      }}
    >
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-1.5">
          <Switch
            id={`${fieldId}-auto`}
            checked={isAuto}
            onCheckedChange={(checked) => onChange(checked ? 'auto' : autoOffValue())}
            disabled={inputDisabled}
          />
          <ScrubLabel
            htmlFor={fieldId}
            className="text-muted-foreground text-xs"
            getValue={() => displayValue}
            onChange={(next) => onChange(clampNumber(next, meta))}
            min={meta?.min}
            max={meta?.max}
            step={meta?.step}
            disabled={inputDisabled}
            onScrubStart={isAuto && !inputDisabled ? () => onChange(clampNumber(displayValue, meta)) : undefined}
          >
            Auto
            {isAuto &&
              resolvedAutoValue !== undefined &&
              ` (${formatNumericInputValue(resolvedAutoValue)}${meta?.unit ?? ''})`}
          </ScrubLabel>
        </div>
        {isAuto ? (
          <PropertyLockIndicator lock={lock} className="size-3" />
        ) : isPercent ? (
          <>
            <DeferredNumberInput
              id={fieldId}
              className="h-8 w-20 shrink-0 font-mono text-xs"
              value={slider.displayValue}
              onValueChange={(next) => slider.onValueChange([next])}
              onCommit={slider.onCommit}
              min={meta?.min}
              max={meta?.max}
              step={meta?.step ?? 'any'}
              disabled={inputDisabled}
            />
            <PropertyLockIndicator lock={lock} className="size-3" />
            <div className="min-w-0 flex-1">
              <Slider
                value={[slider.displayValue]}
                min={meta?.min ?? 0}
                max={meta?.max ?? 100}
                step={meta?.step ?? 1}
                onValueChange={slider.onValueChange}
                onValueCommit={slider.onValueCommit}
                disabled={inputDisabled}
              />
            </div>
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {`${Math.round(slider.displayValue)}%`}
            </span>
          </>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <DeferredNumberInput
              id={fieldId}
              className="h-8 flex-1 min-w-0"
              value={typeof value === 'number' ? value : 0}
              onCommit={(next) => onChange(clampNumber(next, meta))}
              min={meta?.min}
              max={meta?.max}
              step={meta?.step ?? 'any'}
              disabled={inputDisabled}
            />
            <PropertyLockIndicator lock={lock} className="size-3" />
          </div>
        )}
        {!isAuto && meta?.unit && !isPercent && <span className="text-muted-foreground text-xs">{meta.unit}</span>}
      </div>
    </FieldRow>
  );
}
