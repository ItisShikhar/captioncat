import { useEffect, useState } from 'react';
import { FieldRow } from './field-row';
import type { PropertyLockState } from './property-lock';

interface RawJsonFieldProps {
  label: string;
  value: unknown;
  onChange: (next: unknown) => void;
  description?: string;
  compact?: boolean;
  id?: string;
  disabled?: boolean;
  lock?: PropertyLockState | null;
}

/**
 * Fallback editor for leaf types the form does not have a dedicated control
 * for yet (`type: "object"`, or any future/unrecognized `type` tag). Edits
 * raw JSON directly so nothing in a preset is ever un-editable, even before
 * a purpose-built control exists.
 */
export function RawJsonField({
  label,
  value,
  onChange,
  description,
  compact,
  id,
  disabled = false,
  lock = null,
}: RawJsonFieldProps) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setText(JSON.stringify(value, null, 2)), [value]);

  return (
    <FieldRow label={label} description={description} htmlFor={id} compact={compact} lock={lock}>
      <div className="flex flex-col gap-1">
        <textarea
          id={id}
          className="border-input bg-background h-16 w-full rounded-md border px-2 py-1 font-mono text-xs"
          value={text}
          disabled={disabled || lock?.locked === true}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            try {
              onChange(JSON.parse(text));
              setError(null);
            } catch {
              setError('Invalid JSON - change not applied');
            }
          }}
        />
        {error && <span className="text-destructive text-xs">{error}</span>}
      </div>
    </FieldRow>
  );
}
