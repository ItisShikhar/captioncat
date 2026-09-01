import { z } from 'zod';

export const EASE_TYPE_SCHEMA = z.enum([
  'linear',
  'ease',
  'elastic',
  'bounce',
  'easeIn',
  'easeOut',
  'easeInOut',
  'cubic',
  'cubicIn',
  'cubicOut',
  'cubicInOut',
  'back',
  'backIn',
  'backOut',
  'backInOut',
]);
export type EaseType = z.infer<typeof EASE_TYPE_SCHEMA>;

export function applyEasing(progress: number, easingType: EaseType = 'easeInOut'): number {
  if (progress === 0) {
    return 0;
  } else if (progress === 1) {
    return 1;
  }
  switch (easingType) {
    case 'linear':
      return progress;
    case 'ease':
      return progress * progress * (3 - 2 * progress);
    case 'elastic':
      return elasticEase(progress);
    case 'bounce':
      return bounceEase(progress);
    case 'easeIn':
      return progress * progress;
    case 'easeOut':
      return progress * (2 - progress);
    case 'easeInOut':
      return progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    case 'cubic':
    case 'cubicOut':
      return 1 - Math.pow(1 - progress, 3);
    case 'cubicIn':
      return progress * progress * progress;
    case 'cubicInOut':
      return progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
    case 'back':
    case 'backOut':
      return backOutEase(progress);
    case 'backIn':
      return backInEase(progress);
    case 'backInOut':
      return backInOutEase(progress);
    default:
      return progress;
  }
}

// Standard "back" easing constants/formulas (easings.net) - overshoots past the target then
// settles back, giving a small springy emphasis.
const BACK_C1 = 1.70158;
const BACK_C3 = BACK_C1 + 1;
const BACK_C2 = BACK_C1 * 1.525;

function backInEase(progress: number): number {
  return BACK_C3 * progress * progress * progress - BACK_C1 * progress * progress;
}

function backOutEase(progress: number): number {
  const shifted = progress - 1;
  return 1 + BACK_C3 * shifted * shifted * shifted + BACK_C1 * shifted * shifted;
}

function backInOutEase(progress: number): number {
  if (progress < 0.5) {
    const shifted = 2 * progress;
    return (shifted * shifted * ((BACK_C2 + 1) * shifted - BACK_C2)) / 2;
  }
  const shifted = 2 * progress - 2;
  return (shifted * shifted * ((BACK_C2 + 1) * shifted + BACK_C2) + 2) / 2;
}

function elasticEase(progress: number): number {
  const decayFactor = 7; // Lower this value to reduce oscillation intensity
  const frequency = 0.6; // Lower this value to reduce the frequency of oscillations

  return Math.pow(2, -decayFactor * progress) * Math.sin(((progress - 0.1) * (2 * Math.PI)) / frequency) + 1;
}

function bounceEase(progress: number): number {
  const bounceScale = 7.5625;
  const bouncePeriod = 2.75;
  let easedProgress = 0;

  if (progress < 1 / bouncePeriod) {
    easedProgress = bounceScale * progress * progress;
  } else if (progress < 2 / bouncePeriod) {
    progress -= 1.5 / bouncePeriod;
    easedProgress = bounceScale * progress * progress + 0.75;
  } else if (progress < 2.5 / bouncePeriod) {
    progress -= 2.25 / bouncePeriod;
    easedProgress = bounceScale * progress * progress + 0.9375;
  } else {
    progress -= 2.625 / bouncePeriod;
    easedProgress = bounceScale * progress * progress + 0.984375;
  }

  return easedProgress;
}
