import { applyEasing, type EaseType } from '../../../utilities/ease-utils';
import {
  DEFAULT_TRANSITION_DURATION_SECONDS,
  DEFAULT_TRANSITION_EASE,
  type TransitionConfig,
} from './types';

export function getTransitionDuration(config: TransitionConfig | undefined): number {
  const duration = config?.durationSeconds ?? DEFAULT_TRANSITION_DURATION_SECONDS;
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

export function getTransitionEase(config: TransitionConfig | undefined): EaseType {
  return config?.easeType ?? DEFAULT_TRANSITION_EASE;
}

export function calculateTransitionProgress(elapsedSeconds: number, config: TransitionConfig | undefined): number {
  const duration = getTransitionDuration(config);
  if (!(duration > 0)) return elapsedSeconds > 0 ? 1 : 0;
  const linearProgress = Math.min(1, Math.max(0, elapsedSeconds / duration));
  return applyEasing(linearProgress, getTransitionEase(config));
}
