import type { AnimationPreset } from './types';
import { numberValue } from './helpers';

export const wavePreset: AnimationPreset = {
  id: 'wave',
  label: 'Wave',
  phase: 'active',
  playbackMode: 'loop',
  parameters: [
    { key: 'amplitude', label: 'Amplitude', kind: 'number', default: 12, min: 0, max: 200, step: 1, unit: 'pt' },
    { key: 'duration', label: 'Interval', kind: 'number', default: 0.6, min: 0.05, max: 5, step: 0.05, unit: 's' },
  ],
  duration: (values) => numberValue(values, 'duration', 0.6),
  generate: (values) => {
    const duration = numberValue(values, 'duration', 0.6);
    const amplitude = numberValue(values, 'amplitude', 12);
    return [
      {
        enabled: true,
        target: 'Transform.position',
        keyframes: [
          { time: 0, value: { x: 0, y: 0 }, curve: 'easeInOut' },
          { time: duration * 0.5, value: { x: 0, y: -amplitude }, curve: 'easeInOut' },
          { time: duration, value: { x: 0, y: 0 } },
        ],
      },
    ];
  },
};
