import type { AnimationPhase, AnimationPlaybackMode, AnimationTrackDoc, AnimationTriggerBehavior } from '../animation';

export type PresetValues = Record<string, number | string>;

export interface PresetParameter {
  key: string;
  label: string;
  kind: 'number' | 'curve' | 'select';
  default: number | string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: readonly string[];
}

export interface AnimationPreset {
  id: string;
  label: string;
  /** Fixed per-preset, or derived from its own parameter values. */
  phase: AnimationPhase | ((values: PresetValues) => AnimationPhase);
  playbackMode?: AnimationPlaybackMode;
  triggerBehavior?: AnimationTriggerBehavior;
  parameters: PresetParameter[];
  generate: (values: PresetValues) => AnimationTrackDoc[];
  duration: (values: PresetValues) => number;
}
