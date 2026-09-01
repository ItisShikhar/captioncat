import { DEFAULT_ANIMATION_SEQUENCER, type AnimationDoc } from '../animation';
import { qualifiedEffectTarget } from '../animation-target';

const WIPE_REVEAL_DURATION_SECONDS = 0.3;

export function createWipeRevealAnimation(effectId: string): AnimationDoc {
  return {
    enabled: true,
    name: 'Wipe Reveal',
    phase: 'enter',
    playbackMode: 'once',
    scope: 'self',
    durationSeconds: WIPE_REVEAL_DURATION_SECONDS,
    delaySeconds: 0,
    triggerBehavior: 'adaptive',
    lifecycleScheduling: 'overlap',
    preset: 'custom',
    parameters: {},
    sequencer: { ...DEFAULT_ANIMATION_SEQUENCER },
    tracks: [
      {
        enabled: true,
        target: qualifiedEffectTarget('WipeReveal', effectId, 'reveal'),
        keyframes: [
          { time: 0, value: 0, curve: 'easeInOut' },
          { time: WIPE_REVEAL_DURATION_SECONDS, value: 1 },
        ],
      },
    ],
  };
}
