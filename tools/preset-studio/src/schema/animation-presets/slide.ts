import type { AnimationPreset } from './types';
import { DURATION_PARAMETER, EASING_PARAMETER, easingValue, numberValue } from './helpers';

export const slidePreset: AnimationPreset = {
  id: 'slide',
  label: 'Slide',
  phase: 'enter',
  parameters: [
    { key: 'direction', label: 'Direction', kind: 'select', default: 'up', options: ['up', 'down', 'left', 'right'] },
    { key: 'distance', label: 'Distance', kind: 'number', default: 40, min: 0, max: 400, step: 1, unit: 'pt' },
    DURATION_PARAMETER,
    EASING_PARAMETER,
  ],
  duration: (values) => numberValue(values, 'duration', 0.3),
  generate: (values) => {
    const duration = numberValue(values, 'duration', 0.3);
    const distance = numberValue(values, 'distance', 40);
    const easing = easingValue(values, 'curve', 'easeOut');
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
        enabled: true,
        target: 'Transform.position',
        keyframes: [
          { time: 0, value: from, curve: easing },
          { time: duration, value: { x: 0, y: 0 } },
        ],
      },
      {
        enabled: true,
        target: 'Transform.opacity',
        keyframes: [
          { time: 0, value: 0, curve: easing },
          { time: duration, value: 1 },
        ],
      },
    ];
  },
};
