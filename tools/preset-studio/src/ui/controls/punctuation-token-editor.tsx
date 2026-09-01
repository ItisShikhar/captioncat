import { Info, Plus, RotateCcw, X } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';

import { Button } from '@/ui/shadcn/button';
import { Input } from '@/ui/shadcn/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';
import { PropertyLockIndicator, type PropertyLockState } from './property-lock';
import { InfoTooltip } from './info-tooltip';

const INVISIBLE_CHARACTER_LABELS: ReadonlyMap<string, string> = new Map([
  [' ', 'SPACE'],
  ['\t', 'TAB'],
  ['\n', 'LINE BREAK'],
  ['\r', 'CARRIAGE RETURN'],
  ['\u00a0', 'NO-BREAK SPACE'],
  ['\u200b', 'ZERO WIDTH SPACE'],
]);

function tokenLabel(value: string): string {
  const characters = Array.from(value);
  if (!characters.some((character) => INVISIBLE_CHARACTER_LABELS.has(character))) return value;
  return characters.map((character) => INVISIBLE_CHARACTER_LABELS.get(character) ?? character).join(' ');
}

export interface PunctuationTokenEditorProps {
  label: string;
  description?: React.ReactNode;
  values: readonly string[];
  readOnly?: boolean;
  onChange?: (values: string[]) => void;
  onReset?: () => void;
  lock?: PropertyLockState | null;
}

export function PunctuationTokenEditor({
  label,
  description,
  values,
  readOnly = false,
  onChange,
  onReset,
  lock = null,
}: PunctuationTokenEditorProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const closeEditor = () => {
    setIsAdding(false);
    setDraft('');
    setMessage(null);
  };

  const addValue = () => {
    if (draft.length === 0) {
      setMessage('Enter a character or sequence.');
      return;
    }
    if (values.includes(draft)) {
      setMessage('Already added.');
      return;
    }
    onChange?.([...values, draft]);
    closeEditor();
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addValue();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeEditor();
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1 text-xs font-medium">
          {label}
          {description && <InfoTooltip ariaLabel={`Explain ${label}`}>{description}</InfoTooltip>}
        </span>
        <div className="flex items-center gap-1">
          {!readOnly && !lock?.locked && (
            <>
              {onReset && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={`Reset ${label.toLowerCase()} to defaults`}
                      onClick={onReset}
                    >
                      <RotateCcw className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Reset {label.toLowerCase()} to defaults</TooltipContent>
                </Tooltip>
              )}
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="text-muted-foreground hover:text-foreground h-6 gap-1 px-1.5 text-[11px]"
                aria-label={`Add ${label.toLowerCase()}`}
                onClick={() => {
                  setIsAdding(true);
                  setMessage(null);
                }}
              >
                <Plus className="size-3.5" />
                Add
              </Button>
            </>
          )}
        </div>
      </div>

      {values.length > 0 ? (
        <div className="flex items-center gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {values.map((value, index) => {
              const displayValue = tokenLabel(value);
              return (
                <span
                  key={`${value}-${index}`}
                  className="bg-muted/70 text-foreground inline-flex min-h-7 min-w-12 items-center justify-center gap-1 rounded-md border px-2 py-1 text-center text-xs font-medium"
                  title={value}
                >
                  <span className="whitespace-pre-wrap">{displayValue}</span>
                  {!readOnly && !lock?.locked && (
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground -mr-1 inline-flex size-4 items-center justify-center rounded-sm"
                      aria-label={`Remove ${label.toLowerCase()} ${displayValue}`}
                      onClick={() => onChange?.(values.filter((_, valueIndex) => valueIndex !== index))}
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </span>
              );
            })}
          </div>
          {!isAdding && <PropertyLockIndicator lock={lock} className="size-3" />}
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <p className="text-muted-foreground text-[11px]">
            {readOnly ? `No active ${label.toLowerCase()}.` : `No custom ${label.toLowerCase()}.`}
          </p>
          {!isAdding && <PropertyLockIndicator lock={lock} className="size-3" />}
        </div>
      )}

      {isAdding && !readOnly && (
        <div className="flex items-center gap-1.5 pt-0.5">
          <Input
            autoFocus
            value={draft}
            placeholder="Enter character..."
            aria-label={`Add ${label.toLowerCase()}`}
            className="h-7 min-w-0 flex-1 text-xs"
            onChange={(event) => {
              setDraft(event.target.value);
              setMessage(null);
            }}
            onKeyDown={handleInputKeyDown}
            disabled={lock?.locked === true}
          />
          <PropertyLockIndicator lock={lock} className="size-3" />
          <Button type="button" size="xs" className="h-7" onClick={addValue} disabled={lock?.locked === true}>
            Add
          </Button>
          <Button type="button" variant="ghost" size="icon-xs" aria-label="Cancel" onClick={closeEditor}>
            <X className="size-3.5" />
          </Button>
        </div>
      )}

      {message && (
        <p role="status" className="text-destructive text-[10px]">
          {message}
        </p>
      )}
    </div>
  );
}

export function SmartBreakInfo(): React.ReactNode {
  return (
    <div className="text-muted-foreground flex items-start gap-1.5 text-[11px] leading-relaxed">
      <Info className="mt-0.5 size-3.5 shrink-0" />
      <span>
        Auto considers timing, gaps, word and sentence length, available width, emoji boundaries, and language-aware
        punctuation and caption context.
      </span>
    </div>
  );
}
