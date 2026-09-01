import type { AnimationCurve, AnimationPhase, NamedAnimationCurve } from '../animation';
import { NAMED_CURVES } from '../animation';
import type { AnimationPreset, PresetParameter, PresetValues } from './types';

export const DURATION_PARAMETER: PresetParameter = {
  key: 'duration',
  label: 'Duration',
  kind: 'number',
  default: 0.3,
  min: 0,
  max: 5,
  step: 0.05,
  unit: 's',
};

export const EASING_PARAMETER: PresetParameter = {
  key: 'curve',
  label: 'Easing',
  kind: 'curve',
  default: 'easeOut',
};

export const HOP_AMPLITUDE_PARAMETER: PresetParameter = {
  key: 'amplitude',
  label: 'Amplitude',
  kind: 'number',
  default: 20,
  min: 0,
  max: 200,
  step: 1,
  unit: 'pt',
};

export function resolvePhase(preset: AnimationPreset, values: PresetValues): AnimationPhase {
  return typeof preset.phase === 'function' ? preset.phase(values) : preset.phase;
}

export function numberValue(values: PresetValues, key: string, fallback: number): number {
  const value = Number(values[key]);
  return Number.isFinite(value) ? value : fallback;
}

export function easingValue(values: PresetValues, key: string, fallback: NamedAnimationCurve): AnimationCurve {
  const value = String(values[key] ?? fallback);
  return (NAMED_CURVES as string[]).includes(value) ? (value as NamedAnimationCurve) : fallback;
}
