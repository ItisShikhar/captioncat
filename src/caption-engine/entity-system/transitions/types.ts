import type { PropertyKind } from '../types';
export {
  DEFAULT_TRANSITION_DURATION_SECONDS,
  DEFAULT_TRANSITION_EASE,
  DEFAULT_TRANSITION_INITIAL_BEHAVIOR,
  DEFAULT_TRANSITION_SCOPE,
  DEFAULT_TRANSITION_START_VALUE,
  DEFAULT_TRANSITION_TYPE,
} from '../transition-types';
export type {
  TransitionConfig,
  TransitionInitialBehavior,
  TransitionScope,
  TransitionStartValue,
  TransitionType,
} from '../transition-types';

export interface TransitionRuntimeState {
  kind: PropertyKind;
  startValue: unknown;
  targetValue: unknown;
  displayedValue: unknown;
  startedAtSeconds: number;
  lastTimeSeconds: number;
  active: boolean;
}
