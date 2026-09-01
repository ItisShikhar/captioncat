import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatNumericInputValue, roundNumericInput } from '@/lib/number-precision';
import { input } from '@/ui/constants';
import { Input } from '@/ui/shadcn/input';

interface DeferredNumberInputProps {
  value: number;
  onCommit: (next: number) => void;
  onValueChange?: (next: number) => void;
  className?: string;
  id?: string;
  min?: number;
  max?: number;
  step?: number | string;
  inlineEndContent?: ReactNode;
  inlineEndContentInteractive?: boolean;
  title?: string;
  disabled?: boolean;
  'aria-label'?: string;
  placeholder?: string;
}

/** Keeps numeric text local so parent updates cannot steal focus mid-entry. */
export function DeferredNumberInput({
  value,
  onCommit,
  onValueChange,
  className,
  id,
  min,
  max,
  step,
  inlineEndContent,
  inlineEndContentInteractive,
  title,
  disabled,
  'aria-label': ariaLabel,
  placeholder,
}: DeferredNumberInputProps) {
  const [draft, setDraft] = useState(formatNumericInputValue(value));
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const draftRef = useRef(draft);
  const isScrubbingRef = useRef(false);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  draftRef.current = draft;

  useEffect(() => {
    if (!focused) setDraft(formatNumericInputValue(value));
  }, [focused, value]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    const handleScrubStart = () => {
      isScrubbingRef.current = true;
      if (commitTimerRef.current) {
        clearTimeout(commitTimerRef.current);
        commitTimerRef.current = null;
      }
    };

    const handleScrubEnd = () => {
      if (!isScrubbingRef.current) return;
      isScrubbingRef.current = false;
      if (commitTimerRef.current) {
        clearTimeout(commitTimerRef.current);
        commitTimerRef.current = null;
      }
      const parsed = Number(draftRef.current);
      onCommit(clampNumber(parsed, min, max));
    };

    input.addEventListener('scrubstart', handleScrubStart as EventListener);
    input.addEventListener('scrubend', handleScrubEnd as EventListener);

    return () => {
      input.removeEventListener('scrubstart', handleScrubStart as EventListener);
      input.removeEventListener('scrubend', handleScrubEnd as EventListener);
    };
  }, [max, min, onCommit]);

  useEffect(
    () => () => {
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    },
    [],
  );

  const commit = () => {
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    const parsed = Number(draft);
    onCommit(clampNumber(parsed, min, max));
  };

  return (
    <Input
      ref={inputRef}
      id={id}
      type="number"
      className={className}
      disabled={disabled}
      value={draft}
      min={min}
      max={max}
      step={step}
      inlineEndContent={inlineEndContent}
      inlineEndContentInteractive={inlineEndContentInteractive}
      title={title}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onFocus={() => setFocused(true)}
      onChange={(event) => {
        const nextDraft = event.target.value;
        draftRef.current = nextDraft;
        setDraft(nextDraft);
        if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
        const parsed = Number(nextDraft);
        if (!Number.isFinite(parsed)) return;
        onValueChange?.(roundNumericInput(parsed));
        if (isScrubbingRef.current) return;
        commitTimerRef.current = setTimeout(() => {
          commitTimerRef.current = null;
          onCommit(clampNumber(parsed, min, max));
        }, input.debounceMs);
      }}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}

function clampNumber(value: number, min: number | undefined, max: number | undefined): number {
  let boundedValue = Number.isFinite(value) ? roundNumericInput(value) : 0;
  if (min !== undefined) boundedValue = Math.max(min, boundedValue);
  if (max !== undefined) boundedValue = Math.min(max, boundedValue);
  return boundedValue;
}
