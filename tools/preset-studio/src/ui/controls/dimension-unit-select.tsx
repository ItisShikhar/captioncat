import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/shadcn/select';
import type { ReactNode } from 'react';

export const DIMENSION_UNIT_OPTIONS = ['pt', '%'] as const;
export type DimensionUnit = (typeof DIMENSION_UNIT_OPTIONS)[number];

export function isDimensionUnit(value: unknown): value is DimensionUnit {
  return value === 'pt' || value === '%';
}

export function DimensionUnitSelect({
  value,
  onChange,
  disabled,
  ariaLabel,
}: {
  value: DimensionUnit;
  onChange: (next: DimensionUnit) => void;
  disabled: boolean;
  ariaLabel: string;
}): ReactNode {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (isDimensionUnit(next)) onChange(next);
      }}
      disabled={disabled}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className="h-auto w-auto min-w-0 gap-0 rounded-none border-0 bg-transparent p-0 font-mono text-[11px] leading-none text-muted-foreground shadow-none outline-none hover:bg-transparent focus-visible:ring-0 pr-0.5 pl-1.5"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" className="min-w-0">
        {DIMENSION_UNIT_OPTIONS.map((option) => (
          <SelectItem key={option} value={option} className="font-mono text-xs">
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
