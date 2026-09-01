/**
 * Editor-only animation preset registry.
 *
 * Individual preset definitions live beside this file. Add a new preset module,
 * export it here, and append it to `ANIMATION_PRESETS` to make it available to
 * the Studio without changing the shared preset lifecycle.
 */
import { DEFAULT_ANIMATION_SEQUENCER, type AnimationDoc } from '../animation';
import {
  bouncePreset,
  fadePreset,
  hopDownPreset,
  hopLeftPreset,
  hopRightPreset,
  hopUpPreset,
  popPreset,
  pulsePreset,
  shakePreset,
  slidePreset,
  springPreset,
  wavePreset,
} from './presets';
import type { AnimationPreset } from './types';
import { resolvePhase } from './helpers';
import type { PresetValues } from './types';
export { createWipeRevealAnimation } from './wipe-reveal';

export type { AnimationPreset, PresetParameter, PresetValues } from './types';
export {
  bouncePreset,
  fadePreset,
  hopDownPreset,
  hopLeftPreset,
  hopRightPreset,
  hopUpPreset,
  popPreset,
  pulsePreset,
  shakePreset,
  slidePreset,
  springPreset,
  wavePreset,
} from './presets';

export const ANIMATION_PRESETS: AnimationPreset[] = [
  popPreset,
  springPreset,
  fadePreset,
  slidePreset,
  wavePreset,
  pulsePreset,
  shakePreset,
  bouncePreset,
  hopUpPreset,
  hopDownPreset,
  hopLeftPreset,
  hopRightPreset,
];

export function findAnimationPreset(id: string): AnimationPreset | undefined {
  return ANIMATION_PRESETS.find((preset) => preset.id === id);
}

export function defaultPresetParameters(preset: AnimationPreset): PresetValues {
  const values: PresetValues = {};
  for (const parameter of preset.parameters) values[parameter.key] = parameter.default;
  return values;
}

/** Regenerate an animation doc's tracks/duration from a preset + parameter values. */
export function applyPresetToAnimation(
  animation: AnimationDoc,
  preset: AnimationPreset,
  values: PresetValues,
): AnimationDoc {
  return {
    ...animation,
    preset: preset.id,
    phase: resolvePhase(preset, values),
    playbackMode: preset.playbackMode ?? animation.playbackMode ?? 'once',
    parameters: { ...values },
    durationSeconds: preset.duration(values),
    triggerBehavior: preset.triggerBehavior ?? animation.triggerBehavior ?? 'adaptive',
    tracks: preset.generate(values),
  };
}

/** A fresh animation doc seeded from a preset (used when adding an animation). */
export function createAnimationFromPreset(preset: AnimationPreset): AnimationDoc {
  const values = defaultPresetParameters(preset);
  return applyPresetToAnimation(
    {
      enabled: true,
      name: 'Animation',
      phase: resolvePhase(preset, values),
      playbackMode: preset.playbackMode ?? 'once',
      scope: 'self',
      durationSeconds: preset.duration(values),
      delaySeconds: 0,
      triggerBehavior: preset.triggerBehavior ?? 'adaptive',
      lifecycleScheduling: 'overlap',
      preset: preset.id,
      parameters: values,
      sequencer: { ...DEFAULT_ANIMATION_SEQUENCER },
      tracks: [],
    },
    preset,
    values,
  );
}
