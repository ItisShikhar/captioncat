import type { FieldMeta } from '@/schema';
import { DeferredNumberInput } from './deferred-number-input';
import { FieldRow } from './field-row';
import { clampNumber } from './number-field';
import type { PropertyLockState } from './property-lock';
import type { ReactNode } from 'react';

export interface RectValue {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RectFieldProps {
  label: string;
  value: RectValue;
  onChange: (next: RectValue) => void;
  meta?: FieldMeta;
  description?: string;
  compact?: boolean;
  id?: string;
  disabled?: boolean;
  lock?: PropertyLockState | null;
  childrenAfter?: ReactNode;
  labelPrefix?: ReactNode;
  labelExtra?: ReactNode;
}

const RECT_AXES = [
  { key: 'x', label: 'X' },
  { key: 'y', label: 'Y' },
  { key: 'width', label: 'W' },
  { key: 'height', label: 'H' },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeRect(value: unknown): RectValue {
  const raw = isRecord(value) ? value : {};
  const numberValue = (candidate: unknown) => (typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : 0);
  return {
    x: numberValue(raw.x),
    y: numberValue(raw.y),
    width: numberValue(raw.width),
    height: numberValue(raw.height),
  };
}

export function RectField({
  label,
  value,
  onChange,
  meta,
  description,
  compact,
  id,
  disabled = false,
  lock = null,
  childrenAfter,
  labelPrefix,
  labelExtra,
}: RectFieldProps) {
  const rect = normalizeRect(value);

  return (
    <FieldRow
      label={label}
      description={description}
      htmlFor={id}
      compact={compact}
      lock={lock}
      childrenAfter={childrenAfter}
      labelPrefix={labelPrefix}
      labelExtra={labelExtra}
    >
      <div className="grid w-full max-w-md grid-cols-2 gap-2">
        {RECT_AXES.map(({ key, label: axisLabel }) => (
          <div key={key} className="flex min-w-0 items-center gap-1.5">
            <span className="text-muted-foreground w-4 shrink-0 text-xs">{axisLabel}</span>
            <DeferredNumberInput
              id={id ? `${id}-${key}` : undefined}
              className="h-8 min-w-0 flex-1"
              value={rect[key]}
              onCommit={(next) => onChange({ ...rect, [key]: clampNumber(next, meta) })}
              step={meta?.step ?? 'any'}
              min={meta?.min}
              max={meta?.max}
              disabled={disabled}
            />
          </div>
        ))}
      </div>
    </FieldRow>
  );
}
