import type { AnimationPreset } from './types';
import { numberValue } from './helpers';

export const shakePreset: AnimationPreset = {
  id: 'shake',
  label: 'Shake',
  phase: 'active',
  playbackMode: 'loop',
  parameters: [
    { key: 'amplitude', label: 'Amplitude', kind: 'number', default: 8, min: 0, max: 100, step: 1, unit: 'pt' },
    { key: 'duration', label: 'Interval', kind: 'number', default: 0.4, min: 0.05, max: 5, step: 0.05, unit: 's' },
  ],
  duration: (values) => numberValue(values, 'duration', 0.4),
  generate: (values) => {
    const duration = numberValue(values, 'duration', 0.4);
    const amplitude = numberValue(values, 'amplitude', 8);
    return [
      {
        enabled: true,
        target: 'Transform.position',
        keyframes: [
          { time: 0, value: { x: 0, y: 0 }, curve: 'easeInOut' },
          { time: duration * 0.25, value: { x: amplitude, y: 0 }, curve: 'easeInOut' },
          { time: duration * 0.5, value: { x: -amplitude, y: 0 }, curve: 'easeInOut' },
          { time: duration * 0.75, value: { x: amplitude * 0.5, y: 0 }, curve: 'easeInOut' },
          { time: duration, value: { x: 0, y: 0 } },
        ],
      },
    ];
  },
};
