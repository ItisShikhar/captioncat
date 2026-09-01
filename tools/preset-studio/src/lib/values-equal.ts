/** JSON-ish structural equality used to drop no-op inspector updates before they reach React state. */
export function valuesEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => valuesEqual(value, b[index]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const aRecord = a as Record<string, unknown>;
    const bRecord = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(aRecord), ...Object.keys(bRecord)]);
    for (const key of keys) {
      if (aRecord[key] === undefined && bRecord[key] === undefined) continue;
      if (!valuesEqual(aRecord[key], bRecord[key])) return false;
    }
    return true;
  }
  return a === b;
}