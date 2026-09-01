import type { FieldMeta } from '@/schema';
import { Slider } from '@/ui/shadcn/slider';
import { useId, type ReactNode } from 'react';
import { FieldRow } from './field-row';
import { clampNumber, useSliderCommit } from './number-field';
import { DeferredNumberInput } from './deferred-number-input';
import { ScrubLabel } from './scrub-label';
import { propertyLockForAxis, PropertyLockIndicator, type PropertyLock } from './property-lock';

interface Vector2 {
  x: number;
  y: number;
}

interface Vector2FieldProps {
  label: string;
  value: Vector2;
  onChange: (next: Vector2) => void;
  meta?: FieldMeta;
  description?: string;
  compact?: boolean;
  id?: string;
  childrenAfter?: ReactNode;
  labelPrefix?: ReactNode;
  /** Passed straight through to `FieldRow` - see its own doc comment. */
  labelExtra?: ReactNode;
  /** Optional domain-specific labels for the x/y axes. */
  axisLabels?: Partial<Record<'x' | 'y', string>>;
  /** Compact actions rendered beside each axis control. */
  axisChildrenAfter?: Partial<Record<'x' | 'y', ReactNode>>;
  /** Optional interactive content rendered inside each axis input's suffix. */
  axisInlineEndContent?: Partial<Record<'x' | 'y', ReactNode | ((disabled: boolean) => ReactNode)>>;
  axisInlineEndContentInteractive?: boolean;
  /** Layout for the two axis controls. */
  axisLayout?: 'row' | 'column';
  /** Supports independent axis locking for fields such as Transform dimensions. */
  disabled?: boolean | Partial<Record<'x' | 'y', boolean>>;
  lock?: PropertyLock | null;
}

function XAxisIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M6 6L18 18M18 6L6 18" />
    </svg>
  );
}

function YAxisIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 6L12 12L18 6M12 12V18" />
    </svg>
  );
}

export function Vector2Field({
  label,
  value,
  onChange,
  meta,
  description,
  compact,
  id,
  childrenAfter,
  labelPrefix,
  labelExtra,
  axisLabels,
  axisChildrenAfter,
  axisInlineEndContent,
  axisInlineEndContentInteractive = false,
  axisLayout = 'row',
  disabled = false,
  lock = null,
}: Vector2FieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const x = Number.isFinite(value?.x) ? value.x : 0;
  const y = Number.isFinite(value?.y) ? value.y : 0;
  const isSlider = meta?.unit === '%' || meta?.slider === true;
  const sliderX = useSliderCommit(x, (next) => onChange({ x: next, y }), meta);
  const sliderY = useSliderCommit(y, (next) => onChange({ x, y: next }), meta);
  const axisDisabled = (axis: 'x' | 'y') => disabled === true || (typeof disabled === 'object' && disabled[axis] === true);
  const axisLock = (axis: 'x' | 'y') => propertyLockForAxis(lock, axis);
  const axisIndicatorLock = (axis: 'x' | 'y') => axisLock(axis);
  const axisIsLocked = (axis: 'x' | 'y') => axisLock(axis)?.locked === true;
  const axisInputDisabled = (axis: 'x' | 'y') => axisDisabled(axis) || axisIsLocked(axis);
  const axisInlineContent = (axis: 'x' | 'y'): ReactNode => {
    const content = axisInlineEndContent?.[axis];
    return typeof content === 'function' ? content(axisInputDisabled(axis)) : content;
  };
  const axisLabel = (axis: 'x' | 'y'): ReactNode => axisLabels?.[axis] ?? (axis === 'x' ? <XAxisIcon /> : <YAxisIcon />);

  if (isSlider) {
    const axes = [
      { axis: 'x' as const, slider: sliderX },
      { axis: 'y' as const, slider: sliderY },
    ];
    return (
      <FieldRow
        label={label}
        description={description ?? meta?.description}
        htmlFor={fieldId}
        compact={compact}
        childrenAfter={childrenAfter}
        labelPrefix={labelPrefix}
        labelExtra={labelExtra}
        lock={null}
      >
        <div className="w-full max-w-md space-y-3">
          {axes.map(({ axis, slider }) => (
            <div key={axis} className="flex items-center gap-1.5">
              <ScrubLabel
                htmlFor={`${fieldId}-${axis}`}
                className="text-muted-foreground w-3 shrink-0 text-xs"
                getValue={() => slider.displayValue}
                onChange={(next) =>
                  onChange(axis === 'x' ? { x: clampNumber(next, meta), y } : { x, y: clampNumber(next, meta) })
                }
                min={meta?.min}
                max={meta?.max}
                step={meta?.step}
                disabled={axisInputDisabled(axis)}
              >
                {axisLabel(axis)}
              </ScrubLabel>
              <div className="min-w-0 flex-1">
                <Slider
                  value={[slider.displayValue]}
                  min={meta?.min ?? 0}
                  max={meta?.max ?? 100}
                  step={meta?.step ?? 1}
                  onValueChange={slider.onValueChange}
                  onValueCommit={slider.onValueCommit}
                  disabled={axisInputDisabled(axis)}
                />
              </div>
              <DeferredNumberInput
                id={`${fieldId}-${axis}`}
                className="h-8 w-20 shrink-0 font-mono text-xs"
                value={slider.displayValue}
                onValueChange={(next) => slider.onValueChange([next])}
                onCommit={slider.onCommit}
                inlineEndContent={axisInlineContent(axis) ?? meta?.unit}
                inlineEndContentInteractive={axisInlineEndContentInteractive}
                step={meta?.step ?? 'any'}
                min={meta?.min}
                max={meta?.max}
                disabled={axisInputDisabled(axis)}
              />
              <PropertyLockIndicator lock={axisIndicatorLock(axis)} className="size-3" />
              {axisChildrenAfter?.[axis]}
            </div>
          ))}
        </div>
      </FieldRow>
    );
  }

  return (
    <FieldRow
      label={label}
      description={description ?? meta?.description}
      htmlFor={fieldId}
      compact={compact}
      childrenAfter={childrenAfter}
      labelPrefix={labelPrefix}
      labelExtra={labelExtra}
      lock={null}
    >
      <div
        className={
          axisLayout === 'column'
            ? 'flex w-full max-w-md flex-col gap-3'
            : 'grid w-full max-w-md grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-3'
        }
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <ScrubLabel
            htmlFor={`${fieldId}-x`}
            className="text-muted-foreground text-xs"
            getValue={() => x}
            onChange={(next) => onChange({ x: clampNumber(next, meta), y })}
            min={meta?.min}
            max={meta?.max}
            step={meta?.step}
            disabled={axisInputDisabled('x')}
          >
            {axisLabel('x')}
          </ScrubLabel>
          <DeferredNumberInput
            id={`${fieldId}-x`}
            className="h-8 flex-1 min-w-0"
            value={x}
            onCommit={(next) => onChange({ x: clampNumber(next, meta), y })}
            inlineEndContent={axisInlineContent('x') ?? meta?.unit}
            inlineEndContentInteractive={axisInlineEndContentInteractive}
            step={meta?.step ?? 'any'}
            min={meta?.min}
            max={meta?.max}
            disabled={axisInputDisabled('x')}
          />
          <PropertyLockIndicator lock={axisIndicatorLock('x')} className="size-3" />
          {axisChildrenAfter?.x}
        </div>
        <div className="flex min-w-0 items-center gap-1.5">
          <ScrubLabel
            htmlFor={`${fieldId}-y`}
            className="text-muted-foreground text-xs"
            getValue={() => y}
            onChange={(next) => onChange({ x, y: clampNumber(next, meta) })}
            min={meta?.min}
            max={meta?.max}
            step={meta?.step}
            disabled={axisInputDisabled('y')}
          >
            {axisLabel('y')}
          </ScrubLabel>
          <DeferredNumberInput
            id={`${fieldId}-y`}
            className="h-8 flex-1 min-w-0"
            value={y}
            onCommit={(next) => onChange({ x, y: clampNumber(next, meta) })}
            inlineEndContent={axisInlineContent('y') ?? meta?.unit}
            inlineEndContentInteractive={axisInlineEndContentInteractive}
            step={meta?.step ?? 'any'}
            min={meta?.min}
            max={meta?.max}
            disabled={axisInputDisabled('y')}
          />
          <PropertyLockIndicator lock={axisIndicatorLock('y')} className="size-3" />
          {axisChildrenAfter?.y}
        </div>
      </div>
    </FieldRow>
  );
}
