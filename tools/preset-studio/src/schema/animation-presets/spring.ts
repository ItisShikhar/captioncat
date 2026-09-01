import type { AnimationPreset } from './types';
import { DURATION_PARAMETER, numberValue } from './helpers';

export const springPreset: AnimationPreset = {
  id: 'spring',
  label: 'Spring',
  phase: 'enter',
  parameters: [
    DURATION_PARAMETER,
    { key: 'strength', label: 'Strength', kind: 'number', default: 0.25, min: 0, max: 1, step: 0.05 },
  ],
  duration: (values) => numberValue(values, 'duration', 0.5),
  generate: (values) => {
    const duration = numberValue(values, 'duration', 0.5);
    const strength = numberValue(values, 'strength', 0.25);
    const start = Math.max(0, 1 - strength);
    return [
      {
        enabled: true,
        target: 'Transform.scale',
        keyframes: [
          { time: 0, value: { x: start, y: start }, curve: 'elastic' },
          { time: duration, value: { x: 1, y: 1 } },
        ],
      },
      {
        enabled: true,
        target: 'Transform.opacity',
        keyframes: [
          { time: 0, value: 0, curve: 'easeOut' },
          { time: duration * 0.35, value: 1 },
        ],
      },
    ];
  },
};
