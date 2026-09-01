export const NUMERIC_INPUT_DECIMAL_PLACES = 3;

const NUMERIC_INPUT_PRECISION = 10 ** NUMERIC_INPUT_DECIMAL_PLACES;

export function roundNumericInput(value: number): number {
  if (!Number.isFinite(value)) return value;
  const rounded = Math.round((value + Number.EPSILON) * NUMERIC_INPUT_PRECISION) / NUMERIC_INPUT_PRECISION;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function formatNumericInputValue(value: number): string {
  return Number.isFinite(value) ? String(roundNumericInput(value)) : '';
}

export function roundSerializedNumbers(value: unknown): unknown {
  if (typeof value === 'number') return roundNumericInput(value);
  if (Array.isArray(value)) return value.map(roundSerializedNumbers);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, roundSerializedNumbers(nestedValue)]),
    );
  }
  return value;
}
