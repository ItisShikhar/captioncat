import type { EaseType } from '../../utilities/ease-utils';

export type TransitionType = 'tween';
export type TransitionScope = 'shared' | 'state';
export type TransitionStartValue = 'previousDisplayed' | 'previousState' | 'explicit';
export type TransitionInitialBehavior = 'immediate' | 'transition';

export interface TransitionConfig {
  enabled?: boolean;
  type?: TransitionType;
  durationSeconds?: number;
  easeType?: EaseType;
  /** Shared policies are copied across state templates. State policies stay on one template. */
  scope?: TransitionScope;
  /** Selects the source value for a target change when a source sample exists. */
  startValue?: TransitionStartValue;
  /** Selects whether the first observation displays immediately or uses `initialValue`. */
  initialBehavior?: TransitionInitialBehavior;
  /** Explicit source value for first appearance or the explicit start-value policy. */
  initialValue?: unknown;
}

export const DEFAULT_TRANSITION_TYPE: TransitionType = 'tween';
export const DEFAULT_TRANSITION_DURATION_SECONDS = 0.125;
export const DEFAULT_TRANSITION_EASE: EaseType = 'ease';
export const DEFAULT_TRANSITION_SCOPE: TransitionScope = 'shared';
export const DEFAULT_TRANSITION_START_VALUE: TransitionStartValue = 'previousDisplayed';
export const DEFAULT_TRANSITION_INITIAL_BEHAVIOR: TransitionInitialBehavior = 'immediate';
