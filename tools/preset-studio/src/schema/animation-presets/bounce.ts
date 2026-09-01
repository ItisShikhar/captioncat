import type { AnimationPreset } from './types';
import { numberValue } from './helpers';

export const bouncePreset: AnimationPreset = {
  id: 'bounce',
  label: 'Bounce',
  phase: 'enter',
  parameters: [
    { key: 'direction', label: 'Direction', kind: 'select', default: 'up', options: ['up', 'down', 'left', 'right'] },
    { key: 'distance', label: 'Distance', kind: 'number', default: 60, min: 0, max: 400, step: 1, unit: 'pt' },
    { key: 'duration', label: 'Duration', kind: 'number', default: 0.5, min: 0, max: 5, step: 0.05, unit: 's' },
  ],
  duration: (values) => numberValue(values, 'duration', 0.5),
  generate: (values) => {
    const duration = numberValue(values, 'duration', 0.5);
    const distance = numberValue(values, 'distance', 60);
    const direction = String(values.direction ?? 'up');
    const from =
      direction === 'up'
        ? { x: 0, y: distance }
        : direction === 'down'
          ? { x: 0, y: -distance }
          : direction === 'left'
            ? { x: distance, y: 0 }
            : { x: -distance, y: 0 };
    return [
      {
        // Bounce uses its fixed easing curve by design.
        enabled: true,
        target: 'Transform.position',
        keyframes: [
          { time: 0, value: from, curve: 'bounce' },
          { time: duration, value: { x: 0, y: 0 } },
        ],
      },
      {
        enabled: true,
        target: 'Transform.opacity',
        keyframes: [
          { time: 0, value: 0, curve: 'easeOut' },
          { time: duration * 0.4, value: 1 },
        ],
      },
    ];
  },
};
