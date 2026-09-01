import type { AnimationPreset } from './types';
import { DURATION_PARAMETER, EASING_PARAMETER, easingValue, numberValue } from './helpers';

export const fadePreset: AnimationPreset = {
  id: 'fade',
  label: 'Fade',
  // One preset covers both directions. Exit fades must use the outgoing phase.
  phase: (values) => (String(values.direction ?? 'in') === 'out' ? 'exit' : 'enter'),
  parameters: [
    { key: 'direction', label: 'Direction', kind: 'select', default: 'in', options: ['in', 'out'] },
    DURATION_PARAMETER,
    EASING_PARAMETER,
  ],
  duration: (values) => numberValue(values, 'duration', 0.3),
  generate: (values) => {
    const duration = numberValue(values, 'duration', 0.3);
    const easing = easingValue(values, 'curve', 'easeInOut');
    const isOut = String(values.direction ?? 'in') === 'out';
    return [
      {
        enabled: true,
        target: 'Transform.opacity',
        keyframes: [
          { time: 0, value: isOut ? 1 : 0, curve: easing },
          { time: duration, value: isOut ? 0 : 1 },
        ],
      },
    ];
  },
};
