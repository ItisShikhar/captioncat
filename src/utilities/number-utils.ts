export function getRandomInt(minInclusive: number, maxInclusive: number): number {
  minInclusive = Math.ceil(minInclusive);
  maxInclusive = Math.floor(maxInclusive);
  return Math.floor(Math.random() * (maxInclusive - minInclusive + 1)) + minInclusive;
}

export function getRandomFloat(min = 0, max = 1, fractionDigits = 0, inclusive = true): number {
  const precision = Math.pow(10, Math.max(fractionDigits, 0));
  const scaledMax = max * precision;
  const scaledMin = min * precision;
  const offset = inclusive ? 1 : 0;
  const num = Math.floor(Math.random() * (scaledMax - scaledMin + offset)) + scaledMin;

  return num / precision;
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return value <= minimum ? minimum : value >= maximum ? maximum : value;
}

export function roundToTwoDecimalPlaces(value: number): number {
  const numericValue = Number(value);
  return Math.round((numericValue + Number.EPSILON) * 100) / 100;
}

export function areNumbersAlmostEqual(firstValue: number, secondValue: number): boolean {
  return Math.abs(firstValue - secondValue) < Number.EPSILON;
}

export function containsNaN(values: readonly number[]): boolean {
  for (let valueIndex = 0; valueIndex < values.length; valueIndex++) {
    if (Number.isNaN(values[valueIndex])) {
      return true;
    }
  }
  return false;
}
