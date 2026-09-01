import type { AnimationPreset } from './types';
import { DURATION_PARAMETER, EASING_PARAMETER, easingValue, numberValue } from './helpers';

export const popPreset: AnimationPreset = {
  id: 'pop',
  label: 'Pop',
  phase: 'enter',
  parameters: [
    DURATION_PARAMETER,
    { key: 'strength', label: 'Strength', kind: 'number', default: 0.4, min: 0, max: 1, step: 0.05 },
    { key: 'overshoot', label: 'Overshoot', kind: 'number', default: 0.1, min: 0, max: 1, step: 0.05 },
    EASING_PARAMETER,
  ],
  duration: (values) => numberValue(values, 'duration', 0.3),
  generate: (values) => {
    const duration = numberValue(values, 'duration', 0.3);
    const strength = numberValue(values, 'strength', 0.4);
    const overshoot = numberValue(values, 'overshoot', 0.1);
    const easing = easingValue(values, 'curve', 'easeOut');
    const start = Math.max(0, 1 - strength);
    const peak = 1 + overshoot;
    return [
      {
        enabled: true,
        target: 'Transform.scale',
        keyframes: [
          { time: 0, value: { x: start, y: start }, curve: easing },
          { time: duration * 0.7, value: { x: peak, y: peak }, curve: easing },
          { time: duration, value: { x: 1, y: 1 } },
        ],
      },
      {
        enabled: true,
        target: 'Transform.opacity',
        keyframes: [
          { time: 0, value: 0, curve: easing },
          { time: duration * 0.6, value: 1 },
        ],
      },
    ];
  },
};
