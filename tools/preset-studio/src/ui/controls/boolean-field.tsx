import { Checkbox } from '@/ui/shadcn/checkbox';
import { useId, type ReactNode } from 'react';
import { FieldRow } from './field-row';
import type { PropertyLockState } from './property-lock';

interface BooleanFieldProps {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
  description?: string;
  compact?: boolean;
  id?: string;
  childrenAfter?: ReactNode;
  disabled?: boolean;
  lock?: PropertyLockState | null;
}

export function BooleanField({
  label,
  value,
  onChange,
  description,
  compact,
  id,
  childrenAfter,
  disabled = false,
  lock = null,
}: BooleanFieldProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;

  return (
    <FieldRow
      label={label}
      description={description}
      htmlFor={controlId}
      compact={compact}
      inline
      childrenAfter={childrenAfter}
      lock={lock}
    >
      <Checkbox
        id={controlId}
        checked={value}
        onCheckedChange={(next) => onChange(next === true)}
        disabled={disabled || lock?.locked === true}
      />
    </FieldRow>
  );
}
