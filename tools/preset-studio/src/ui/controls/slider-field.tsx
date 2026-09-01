import { cn } from '@/lib/utils';
import { roundNumericInput } from '@/lib/number-precision';
import { Slider } from '@/ui/shadcn/slider';
import { useContext, useEffect, useId, useState, type ReactNode } from 'react';
import { DeferredNumberInput } from './deferred-number-input';
import { FieldLabelExtraContext } from './field-row';
import { InfoTooltip } from './info-tooltip';
import { ScrubLabel } from './scrub-label';
import { PropertyLockIndicator, type PropertyLockState } from './property-lock';

interface SliderFieldProps {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  sliderMax?: number;
  step?: number;
  description?: string;
  id?: string;
  className?: string;
  formatValue?: (value: number) => string;
  childrenAfter?: ReactNode;
  disabled?: boolean;
  lock?: PropertyLockState | null;
}

export function SliderField({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  sliderMax,
  step = 1,
  description,
  id,
  className,
  formatValue,
  childrenAfter,
  disabled = false,
  lock = null,
}: SliderFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const locked = lock?.locked === true;
  const inputDisabled = disabled || locked;
  const [draftValue, setDraftValue] = useState(roundNumericInput(value));
  const contextualLabelExtra = useContext(FieldLabelExtraContext);

  useEffect(() => {
    setDraftValue(roundNumericInput(value));
  }, [value]);

  const displayValue = formatValue ? formatValue(draftValue) : `${draftValue}`;
  const commitValue = (next: number) => {
    const rounded = roundNumericInput(next);
    if (rounded === value) return;
    onChange(rounded);
  };

  return (
    <div className={cn('flex flex-col gap-2 py-1.5', className)}>
      <div className="flex items-center gap-1">
        <ScrubLabel
          htmlFor={fieldId}
          className="text-muted-foreground text-xs font-medium"
          getValue={() => (Number.isFinite(value) ? value : 0)}
          onChange={(next) => onChange(roundNumericInput(Math.min(max, Math.max(min, next))))}
          min={min}
          max={max}
          step={step}
          disabled={inputDisabled}
        >
          {label}
        </ScrubLabel>
        {description && (
          <InfoTooltip ariaLabel={`Explain ${label}`}>{description}</InfoTooltip>
        )}
        {contextualLabelExtra}
      </div>
      <div className="flex items-center gap-1.5">
        <DeferredNumberInput
          id={fieldId}
          className="h-8 w-20 shrink-0 font-mono text-xs"
          value={Number.isFinite(draftValue) ? draftValue : min}
          onValueChange={(next) => {
            setDraftValue(roundNumericInput(Math.min(max, Math.max(min, next))));
          }}
          min={min}
          max={max}
          step={step}
          disabled={inputDisabled}
          onCommit={(next) => {
            const committed = next;
            setDraftValue(committed);
            commitValue(committed);
          }}
        />
        <PropertyLockIndicator lock={lock} className="size-3" />
        <div className="min-w-0 flex-1">
          <Slider
            value={[draftValue]}
            min={min}
            max={sliderMax ?? max}
            step={step}
            disabled={inputDisabled}
            onValueChange={(next) => {
              const nextValue = next[0] ?? draftValue;
              setDraftValue(roundNumericInput(nextValue));
            }}
            onValueCommit={(next) => {
              const committed = roundNumericInput(next[0] ?? draftValue);
              commitValue(committed);
            }}
          />
        </div>
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{displayValue}</span>
        {childrenAfter && <div className="flex shrink-0 items-center gap-1">{childrenAfter}</div>}
      </div>
    </div>
  );
}
