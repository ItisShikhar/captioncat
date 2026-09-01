import type { AnimationPreset } from './types';
import { numberValue } from './helpers';

export const pulsePreset: AnimationPreset = {
  id: 'pulse',
  label: 'Pulse',
  phase: 'active',
  playbackMode: 'loop',
  parameters: [
    { key: 'strength', label: 'Strength', kind: 'number', default: 0.15, min: 0, max: 1, step: 0.05 },
    { key: 'duration', label: 'Interval', kind: 'number', default: 0.6, min: 0.05, max: 5, step: 0.05, unit: 's' },
  ],
  duration: (values) => numberValue(values, 'duration', 0.6),
  generate: (values) => {
    const duration = numberValue(values, 'duration', 0.6);
    const peak = 1 + numberValue(values, 'strength', 0.15);
    return [
      {
        enabled: true,
        target: 'Transform.scale',
        keyframes: [
          { time: 0, value: { x: 1, y: 1 }, curve: 'easeInOut' },
          { time: duration * 0.5, value: { x: peak, y: peak }, curve: 'easeInOut' },
          { time: duration, value: { x: 1, y: 1 } },
        ],
      },
    ];
  },
};
