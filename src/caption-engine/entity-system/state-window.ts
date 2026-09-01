export const MIN_FIXED_COUNT = 0;
export const MAX_FIXED_COUNT = Number.MAX_SAFE_INTEGER;
export type StateWindowRange =
  | { mode: 'fixedCount'; count: number }
  | { mode: 'all' }
  | { mode: 'currentRow' }
  | { mode: 'currentRowToCurrent' }
  | { mode: 'rowCount'; count: number };

export interface StateWindowConfig {
  previousWords: StateWindowRange;
  currentWords: StateWindowRange;
  nextWords: StateWindowRange;
  previousRows: StateWindowRange;
  currentRows: StateWindowRange;
  nextRows: StateWindowRange;
}

export const DEFAULT_STATE_WINDOW: Readonly<StateWindowConfig> = Object.freeze({
  previousWords: { mode: 'fixedCount', count: 1 },
  currentWords: { mode: 'fixedCount', count: 1 },
  nextWords: { mode: 'fixedCount', count: 1 },
  previousRows: { mode: 'fixedCount', count: 1 },
  currentRows: { mode: 'fixedCount', count: 1 },
  nextRows: { mode: 'fixedCount', count: 1 },
} as const);

function numericValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function clampFixedCount(value: unknown, fallback = 1): number {
  const safe = Math.trunc(numericValue(value) ?? fallback);
  return Math.min(MAX_FIXED_COUNT, Math.max(MIN_FIXED_COUNT, safe));
}

export function fixedCountRange(count: unknown): StateWindowRange {
  return { mode: 'fixedCount', count: clampFixedCount(count) };
}

export function rowCountRange(count: unknown): StateWindowRange {
  return { mode: 'rowCount', count: clampFixedCount(count) };
}

function normalizeRangeFallback(fallback: StateWindowRange): StateWindowRange {
  if (fallback.mode === 'all' || fallback.mode === 'currentRow' || fallback.mode === 'currentRowToCurrent') {
    return { mode: fallback.mode };
  }
  return fallback.mode === 'rowCount' ? rowCountRange(fallback.count) : fixedCountRange(fallback.count);
}

export function normalizeStateWindowRange(
  value: unknown,
  fallback: StateWindowRange = DEFAULT_STATE_WINDOW.previousWords,
): StateWindowRange {
  if (value && typeof value === 'object' && (value as { mode?: unknown }).mode === 'all') {
    return { mode: 'all' };
  }
  if (value && typeof value === 'object' && (value as { mode?: unknown }).mode === 'currentRow') {
    return { mode: 'currentRow' };
  }
  if (value && typeof value === 'object' && (value as { mode?: unknown }).mode === 'currentRowToCurrent') {
    return { mode: 'currentRowToCurrent' };
  }
  if (value && typeof value === 'object' && (value as { mode?: unknown }).mode === 'rowCount') {
    return rowCountRange((value as { count?: unknown }).count);
  }
  if (value && typeof value === 'object' && (value as { mode?: unknown }).mode === 'fixedCount') {
    return fixedCountRange((value as { count?: unknown }).count);
  }
  return normalizeRangeFallback(fallback);
}

export function rangeIncludesDistance(range: StateWindowRange, distance: number): boolean {
  if (range.mode === 'all') return true;
  if (range.mode === 'currentRow' || range.mode === 'currentRowToCurrent') return false;
  return distance <= range.count;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeRequiredRange(value: unknown, label: string): StateWindowRange {
  if (value && typeof value === 'object' && (value as { mode?: unknown }).mode === 'all') {
    return { mode: 'all' };
  }
  if (value && typeof value === 'object' && (value as { mode?: unknown }).mode === 'currentRow') {
    return { mode: 'currentRow' };
  }
  if (value && typeof value === 'object' && (value as { mode?: unknown }).mode === 'currentRowToCurrent') {
    return { mode: 'currentRowToCurrent' };
  }
  if (value && typeof value === 'object' && (value as { mode?: unknown }).mode === 'rowCount') {
    const count = (value as { count?: unknown }).count;
    if (numericValue(count) === undefined) {
      throw new Error(`${label} must contain a finite row count.`);
    }
    return rowCountRange(count);
  }
  if (value && typeof value === 'object' && (value as { mode?: unknown }).mode === 'fixedCount') {
    const count = (value as { count?: unknown }).count;
    if (numericValue(count) === undefined) {
      throw new Error(`${label} must contain a finite fixed count.`);
    }
    return fixedCountRange(count);
  }
  throw new Error(
    `${label} must use the "fixedCount", "currentRow", "currentRowToCurrent", "rowCount", or "all" mode.`,
  );
}

export function normalizeStateWindowConfig(value: unknown, label = 'stateWindow'): StateWindowConfig {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }

  const required = ['previousWords', 'currentWords', 'nextWords', 'previousRows', 'currentRows', 'nextRows'] as const;
  const removedFields = [
    'previousWordCount',
    'currentWordCount',
    'nextWordCount',
    'previousRowCount',
    'currentRowCount',
    'nextRowCount',
  ] as const;
  for (const key of removedFields) {
    if (key in value) throw new Error(`${label} contains unsupported field ${key}.`);
  }
  for (const key of required) {
    if (!(key in value)) {
      throw new Error(`${label} must define ${key}.`);
    }
  }

  return {
    previousWords: normalizeRequiredRange(value.previousWords, `${label}.previousWords`),
    currentWords: normalizeRequiredRange(value.currentWords, `${label}.currentWords`),
    nextWords: normalizeRequiredRange(value.nextWords, `${label}.nextWords`),
    previousRows: normalizeRequiredRange(value.previousRows, `${label}.previousRows`),
    currentRows: normalizeRequiredRange(value.currentRows, `${label}.currentRows`),
    nextRows: normalizeRequiredRange(value.nextRows, `${label}.nextRows`),
  };
}

function isCanonicalRange(value: unknown): value is StateWindowRange {
  if (!isRecord(value)) return false;
  if (value.mode === 'all' || value.mode === 'currentRow' || value.mode === 'currentRowToCurrent') return true;
  return (
    (value.mode === 'fixedCount' || value.mode === 'rowCount') &&
    typeof value.count === 'number' &&
    Number.isInteger(value.count) &&
    value.count >= MIN_FIXED_COUNT &&
    value.count <= MAX_FIXED_COUNT
  );
}

export function isStateWindowConfig(value: unknown): value is StateWindowConfig {
  if (!isRecord(value)) return false;
  return (
    isCanonicalRange(value.previousWords) &&
    isCanonicalRange(value.currentWords) &&
    isCanonicalRange(value.nextWords) &&
    isCanonicalRange(value.previousRows) &&
    isCanonicalRange(value.currentRows) &&
    isCanonicalRange(value.nextRows)
  );
}

export function validateStateWindowConfig(value: unknown, label = 'stateWindow'): StateWindowConfig {
  return normalizeStateWindowConfig(value, label);
}

export type StateWindowInput = StateWindowConfig;
