import { Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';

import type { Paint } from '@/schema/paint';
import { solidPaint } from '@/schema/paint';
import { Button } from '@/ui/shadcn/button';
import { PaintInput } from './paint-picker';
import { FieldRow } from './field-row';

export interface PaintListFieldProps {
  label: string;
  fills: readonly Paint[];
  onChange: (fills: Paint[]) => void;
  description?: string;
  disabled?: boolean;
  childrenAfter?: ReactNode;
}

export function PaintListField({
  label,
  fills,
  onChange,
  description,
  disabled = false,
  childrenAfter,
}: PaintListFieldProps) {
  return (
    <FieldRow label={label} description={description} childrenAfter={childrenAfter}>
      <div className="w-full space-y-1">
        {fills.map((fill, index) => (
          <div key={`fill-${index}`} className="flex items-center gap-1">
            <PaintInput
              value={fill}
              onChange={(next) => {
                const nextFills = [...fills];
                nextFills[index] = next;
                onChange(nextFills);
              }}
              compact
              fullWidth
              variant="fill"
              ariaLabel={`Fill ${index + 1}`}
              disabled={disabled}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove fill ${index + 1}`}
              onClick={() => onChange(fills.filter((_, fillIndex) => fillIndex !== index))}
              disabled={disabled || fills.length <= 1}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => onChange([...fills, solidPaint('#000000')])}
          disabled={disabled}
        >
          <Plus className="size-3.5" />
          Add Fill
        </Button>
      </div>
    </FieldRow>
  );
}
