import type { ResolveContext } from './types';
import type { Insets } from './insets-types';
export { INSET_EDGES } from './insets-types';
export type { InsetEdge, Insets } from './insets-types';

export const ZERO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function resolveInsets(
  resolve: (path: string, context: ResolveContext) => unknown,
  path: string,
  context: ResolveContext,
  fallback: Insets = ZERO_INSETS,
): Insets {
  return {
    top: finiteNumber(resolve(`${path}.top`, context), fallback.top),
    right: finiteNumber(resolve(`${path}.right`, context), fallback.right),
    bottom: finiteNumber(resolve(`${path}.bottom`, context), fallback.bottom),
    left: finiteNumber(resolve(`${path}.left`, context), fallback.left),
  };
}
