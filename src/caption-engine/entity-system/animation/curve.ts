import { applyEasing, type EaseType } from '../../../utilities/ease-utils';
import type { AnimationCurve, NamedAnimationCurve } from './types';

const EPSILON = 1e-6;

function cubicCoordinate(t: number, first: number, second: number): number {
  const inverse = 1 - t;
  return 3 * inverse * inverse * t * first + 3 * inverse * t * t * second + t * t * t;
}

function cubicDerivative(t: number, first: number, second: number): number {
  const inverse = 1 - t;
  return 3 * inverse * inverse * first + 6 * inverse * t * (second - first) + 3 * t * t * (1 - second);
}

function cubicBezier(progress: number, x1: number, y1: number, x2: number, y2: number): number {
  let parameter = progress;
  for (let iteration = 0; iteration < 8; iteration++) {
    const difference = cubicCoordinate(parameter, x1, x2) - progress;
    if (Math.abs(difference) < EPSILON) break;
    const derivative = cubicDerivative(parameter, x1, x2);
    if (Math.abs(derivative) < EPSILON) break;
    parameter = Math.min(1, Math.max(0, parameter - difference / derivative));
  }

  let lower = 0;
  let upper = 1;
  for (let iteration = 0; iteration < 12; iteration++) {
    const x = cubicCoordinate(parameter, x1, x2);
    if (Math.abs(x - progress) < EPSILON) break;
    if (x < progress) lower = parameter;
    else upper = parameter;
    parameter = (lower + upper) / 2;
  }
  return cubicCoordinate(parameter, y1, y2);
}

function getEaseTypeForCurve(curve: Exclude<NamedAnimationCurve, 'hold'>): EaseType {
  return curve;
}

export function applyAnimationCurve(progress: number, curve: AnimationCurve | undefined): number {
  const clamped = Math.min(1, Math.max(0, progress));
  if (!curve || curve === 'linear') return clamped;
  if (curve === 'hold') return clamped >= 1 ? 1 : 0;
  if (typeof curve === 'object') {
    return cubicBezier(clamped, curve.x1, curve.y1, curve.x2, curve.y2);
  }
  return applyEasing(clamped, getEaseTypeForCurve(curve));
}