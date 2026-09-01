import { useEffect, useRef, useState } from 'react';
import { Input } from '@/ui/shadcn/input';

interface DeferredTextInputProps {
  value: string;
  onCommit: (next: string) => void | boolean;
  className?: string;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

export function DeferredTextInput({
  value,
  onCommit,
  className,
  id,
  placeholder,
  disabled,
  'aria-label': ariaLabel,
}: DeferredTextInputProps) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const preserveDraftRef = useRef(false);

  useEffect(() => {
    if (!focused) {
      if (preserveDraftRef.current) {
        preserveDraftRef.current = false;
      } else {
        setDraft(value);
      }
    }
  }, [focused, value]);

  return (
    <Input
      id={id}
      className={className}
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
      onFocus={() => setFocused(true)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        preserveDraftRef.current = onCommit(draft) === false;
        setFocused(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}
