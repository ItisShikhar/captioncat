import { interpolatePaint, type Paint } from '../paint';
import type { Box, PropertyKind, Vector2 } from '../types';
import { toVec2 } from '../types';

export type Interpolator<T> = (from: T, to: T, progress: number) => T;

function interpolateNumber(from: unknown, to: unknown, progress: number): unknown {
  if (typeof from !== 'number' || typeof to !== 'number') return progress < 1 ? from : to;
  return from + (to - from) * progress;
}

function interpolateVector2(from: unknown, to: unknown, progress: number): Vector2 {
  const first = toVec2(from);
  const second = toVec2(to);
  return {
    x: first.x + (second.x - first.x) * progress,
    y: first.y + (second.y - first.y) * progress,
  };
}

function interpolateBox(from: unknown, to: unknown, progress: number): unknown {
  if (!isBox(from) || !isBox(to)) return progress < 1 ? from : to;
  const first = from as Box;
  const second = to as Box;
  return {
    x: first.x + (second.x - first.x) * progress,
    y: first.y + (second.y - first.y) * progress,
    width: first.width + (second.width - first.width) * progress,
    height: first.height + (second.height - first.height) * progress,
  };
}

function isBox(value: unknown): value is Box {
  if (!value || typeof value !== 'object') return false;
  const box = value as Partial<Box>;
  return [box.x, box.y, box.width, box.height].every((part) => typeof part === 'number' && Number.isFinite(part));
}

function interpolateNumberOrAuto(from: unknown, to: unknown, progress: number): unknown {
  return typeof from === 'number' && typeof to === 'number' ? interpolateNumber(from, to, progress) : progress < 1 ? from : to;
}

const INTERPOLATORS: Partial<Record<PropertyKind, Interpolator<unknown>>> = {
  number: interpolateNumber,
  numberOrAuto: interpolateNumberOrAuto,
  fontWeight: interpolateNumber,
  vector2: interpolateVector2,
  paint: (from, to, progress) => interpolatePaint(from as Paint, to as Paint, progress),
  rect: interpolateBox,
};

export function interpolatorFor<T>(kind: PropertyKind): Interpolator<T> | undefined {
  return INTERPOLATORS[kind] as Interpolator<T> | undefined;
}

export function transitionableKind(kind: PropertyKind): boolean {
  return interpolatorFor(kind) !== undefined;
}

export function valuesEqualForKind(kind: PropertyKind, first: unknown, second: unknown): boolean {
  if (Object.is(first, second)) return true;
  if (kind === 'number' || kind === 'numberOrAuto') return first === second;
  if (kind === 'fontWeight') return first === second;
  if (kind === 'vector2') {
    const a = toVec2(first);
    const b = toVec2(second);
    return a.x === b.x && a.y === b.y;
  }
  if (kind === 'rect') {
    if (!first || !second || typeof first !== 'object' || typeof second !== 'object') return false;
    const a = first as Box;
    const b = second as Box;
    return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
  }
  if (typeof first !== 'object' || first === null || typeof second !== 'object' || second === null) return false;
  const firstKeys = Object.keys(first as object);
  const secondKeys = Object.keys(second as object);
  if (firstKeys.length !== secondKeys.length) return false;
  return firstKeys.every((key) =>
    Object.prototype.hasOwnProperty.call(second, key) &&
    valuesEqualForKind('object', (first as Record<string, unknown>)[key], (second as Record<string, unknown>)[key]),
  );
}
