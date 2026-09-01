/**
 * Controls which end of a component/entity's `effects` array is treated as
 * "applied first" when multiple effects combine (composited as nested
 * wraps, or drawn one after another in a flat sequence):
 *
 * - `'FIFO'` keeps the array's insertion order - the first effect added
 * (index 0, the top row in the studio's effects drawer) is applied
 * first/outermost.
 * - `'LIFO'` reverses it - the most recently added effect (the last array
 * element, the bottom row in the drawer) is applied first/outermost.
 *
 * The studio's effects drawer always appends new effects to the end of the
 * array, so with `'LIFO'` the drawer reads top-to-bottom as "applied last"
 * to "applied first" (bottom-up application order).
 */
export type EffectsApplicationOrder = 'LIFO' | 'FIFO';

export const EFFECTS_APPLICATION_ORDER: EffectsApplicationOrder = 'LIFO';

/**
 * Reorders `effects` so its first element is whichever one must be
 * applied first, per `EFFECTS_APPLICATION_ORDER`. Callers composing effects
 * with `Array.prototype.reduceRight` (outermost = first array element) or
 * iterating a flat draw loop (first array element = drawn first) can use
 * this uniformly.
 */
export function orderEffectsForApplication<T>(effects: readonly T[]): T[] {
  return EFFECTS_APPLICATION_ORDER === 'LIFO' ? [...effects].reverse() : [...effects];
}
