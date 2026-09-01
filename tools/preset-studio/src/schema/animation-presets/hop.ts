import type { AnimationPreset } from './types';
import { DURATION_PARAMETER, EASING_PARAMETER, HOP_AMPLITUDE_PARAMETER, easingValue, numberValue } from './helpers';

type HopDirection = 'up' | 'down' | 'left' | 'right';

function createHopPreset(id: string, label: string, direction: HopDirection): AnimationPreset {
  return {
    id,
    label,
    phase: 'active',
    playbackMode: 'loop',
    triggerBehavior: 'adaptive',
    parameters: [HOP_AMPLITUDE_PARAMETER, DURATION_PARAMETER, EASING_PARAMETER],
    duration: (values) => numberValue(values, 'duration', 0.3),
    generate: (values) => {
      const duration = numberValue(values, 'duration', 0.3);
      const amplitude = numberValue(values, 'amplitude', 20);
      const easing = easingValue(values, 'curve', 'easeOut');
      const peak =
        direction === 'up'
          ? { x: 0, y: -amplitude }
          : direction === 'down'
            ? { x: 0, y: amplitude }
            : direction === 'left'
              ? { x: -amplitude, y: 0 }
              : { x: amplitude, y: 0 };
      return [
        {
          enabled: true,
          target: 'Transform.position',
          mode: 'relative',
          keyframes: [
            { time: 0, value: { x: 0, y: 0 }, curve: easing },
            { time: duration * 0.5, value: peak, curve: easing },
            { time: duration, value: { x: 0, y: 0 } },
          ],
        },
      ];
    },
  };
}

export const hopUpPreset = createHopPreset('hopUp', 'Hop Up', 'up');
export const hopDownPreset = createHopPreset('hopDown', 'Hop Down', 'down');
export const hopLeftPreset = createHopPreset('hopLeft', 'Hop Left', 'left');
export const hopRightPreset = createHopPreset('hopRight', 'Hop Right', 'right');
