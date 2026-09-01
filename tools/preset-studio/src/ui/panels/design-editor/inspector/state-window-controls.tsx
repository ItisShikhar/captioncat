import type { StateWindowConfig } from '@/schema';
import {
  clampFixedCount,
  fixedCountRange,
  MAX_FIXED_COUNT,
  MIN_FIXED_COUNT,
  normalizeStateWindowRange,
  rowCountRange,
  type StateWindowRange,
} from '@/schema';
import { DeferredNumberInput } from '@/ui/controls/deferred-number-input';
import { InfoTooltip } from '@/ui/controls/info-tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/shadcn/select';

const WINDOW_FIELDS = {
  word: [
    ['Previous Words', 'previousWords'],
    ['Current Words', 'currentWords'],
    ['Next Words', 'nextWords'],
  ],
  row: [
    ['Previous Rows', 'previousRows'],
    ['Current Rows', 'currentRows'],
    ['Next Rows', 'nextRows'],
  ],
} as const;

const FIXED_RANGE_MODES = [
  ['fixedCount', 'Count'],
  ['all', 'All'],
] as const;

const CURRENT_RANGE_MODES = [
  ['fixedCount', 'Count'],
  ['all', 'All'],
  ['currentRowToCurrent', 'Current row from start to present'],
  ['currentRow', 'All words in current row'],
] as const;

const PREVIOUS_WORD_RANGE_MODES = [
  ['fixedCount', 'Count'],
  ['currentRow', 'Till current row start'],
  ['rowCount', 'Previous rows'],
  ['all', 'All'],
] as const;

const NEXT_WORD_RANGE_MODES = [
  ['fixedCount', 'Count'],
  ['currentRow', 'Till current row end'],
  ['rowCount', 'Next rows'],
  ['all', 'All'],
] as const;

type WindowKind = keyof typeof WINDOW_FIELDS;

function rangeModesFor(kind: WindowKind, field: string) {
  if (kind === 'row') return FIXED_RANGE_MODES;
  if (field === 'currentWords') return CURRENT_RANGE_MODES;
  return field === 'previousWords' ? PREVIOUS_WORD_RANGE_MODES : NEXT_WORD_RANGE_MODES;
}

function rangeForMode(mode: string, current: StateWindowRange): StateWindowRange {
  if (mode === 'all') return { mode: 'all' };
  if (mode === 'currentRow') return { mode: 'currentRow' };
  if (mode === 'currentRowToCurrent') return { mode: 'currentRowToCurrent' };
  if (mode === 'rowCount') return rowCountRange(current.mode === 'rowCount' ? current.count : 1);
  return fixedCountRange(current.mode === 'fixedCount' ? current.count : 1);
}

function isPreviousWordsOverridden(kind: WindowKind, stateWindow: StateWindowConfig): boolean {
  const previousWords = normalizeStateWindowRange(stateWindow.previousWords);
  const currentWords = normalizeStateWindowRange(stateWindow.currentWords);
  return (
    kind === 'word' &&
    previousWords.mode === 'currentRow' &&
    (currentWords.mode === 'currentRow' || currentWords.mode === 'currentRowToCurrent')
  );
}

export function StateWindowControls({
  kind,
  stateWindow,
  onChange,
}: {
  kind: WindowKind;
  stateWindow: StateWindowConfig;
  onChange: (updater: (previous: StateWindowConfig) => StateWindowConfig) => void;
}) {
  return (
    <div className="border-border/60 border-b px-1 pt-2 pb-2">
      <div className="text-muted-foreground mb-1 flex items-center gap-1 text-[10px] font-semibold tracking-[0.16em] uppercase">
        <span>State window</span>
        <InfoTooltip ariaLabel="Explain state window">
          <div className="space-y-1.5">
            <p className="font-medium">Control the visible context around each state.</p>
            <p>
              <strong>Count</strong> uses a fixed number of words or rows.
            </p>
            <p>
              <strong>Relative modes</strong> follow the current row.
            </p>
            <p>
              <strong>All</strong> includes every matching item.
            </p>
            <p className="text-background/80">
              Counts range from {MIN_FIXED_COUNT} to {MAX_FIXED_COUNT}. Other fields pause when Current is set to All.
            </p>
          </div>
        </InfoTooltip>
      </div>
      <div className="grid grid-cols-3 gap-x-2">
        {WINDOW_FIELDS[kind].map(([label, field]) => {
          const range = normalizeStateWindowRange(stateWindow[field]);
          const currentField = kind === 'word' ? 'currentWords' : 'currentRows';
          const disabled = field !== currentField && stateWindow[currentField].mode === 'all';
          return (
            <div key={field} className="min-w-0 py-1" data-state-window-field={field}>
              <div className="text-muted-foreground mb-1 text-xs font-medium">{label}</div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Select
                  value={range.mode}
                  disabled={disabled}
                  onValueChange={(mode) =>
                    onChange((previous) => ({
                      ...previous,
                      [field]: rangeForMode(mode, range),
                    }))
                  }
                >
                  <SelectTrigger className="h-8 min-w-0 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {rangeModesFor(kind, field).map(([value, optionLabel]) => (
                      <SelectItem key={value} value={value}>
                        {optionLabel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(range.mode === 'fixedCount' || range.mode === 'rowCount') && (
                  <DeferredNumberInput
                    id={`state-window-${field}-count`}
                    className="h-8 w-full shrink-0 font-mono text-xs"
                    value={range.count}
                    min={MIN_FIXED_COUNT}
                    max={MAX_FIXED_COUNT}
                    step={1}
                    aria-label={`${label} ${range.mode === 'rowCount' ? 'row count' : 'count'}`}
                    disabled={disabled}
                    onCommit={(count) =>
                      onChange((previous) => ({
                        ...previous,
                        [field]:
                          range.mode === 'rowCount'
                            ? rowCountRange(clampFixedCount(count))
                            : fixedCountRange(clampFixedCount(count)),
                      }))
                    }
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
      {isPreviousWordsOverridden(kind, stateWindow) && (
        <p role="status" data-state-window-warning className="text-amber-600 dark:text-amber-500 px-1 pt-1 text-[10px] font-medium">
          Current Words includes the active row, so Previous Words cannot mark words in that row as previous.
        </p>
      )}
    </div>
  );
}
