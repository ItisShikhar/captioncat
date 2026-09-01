import { normalizePaint, type Paint } from '../paint';
import type { Box, PropertyKind, Vector2 } from '../types';
import { calculateTransitionProgress, getTransitionDuration } from './eases';
import { interpolatorFor, valuesEqualForKind } from './interpolators';
import { resolveFontWeight } from '../../../font-registry';
import {
  DEFAULT_TRANSITION_INITIAL_BEHAVIOR,
  DEFAULT_TRANSITION_START_VALUE,
  DEFAULT_TRANSITION_TYPE,
  type TransitionConfig,
  type TransitionRuntimeState,
} from './types';

export class TransitionRuntime {
  private readonly settledValues = new Map<string, { kind: PropertyKind; value: unknown }>();
  private readonly activeStates = new Map<string, TransitionRuntimeState>();

  clear(key?: string): void {
    if (key === undefined) {
      this.settledValues.clear();
      this.activeStates.clear();
      return;
    }
    this.settledValues.delete(key);
    this.activeStates.delete(key);
  }

  settle(key: string, kind: PropertyKind, value: unknown): void {
    this.activeStates.delete(key);
    this.settledValues.set(key, { kind, value });
  }

  private explicitValueFor(
    kind: PropertyKind,
    value: unknown,
    desiredValue: unknown,
  ): unknown | undefined {
    if (value === undefined) return undefined;
    if (kind === 'number') return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
    if (kind === 'fontWeight') return resolveFontWeight(value);
    if (kind === 'numberOrAuto') {
      return value === 'auto' || (typeof value === 'number' && Number.isFinite(value)) ? value : undefined;
    }
    if (kind === 'vector2') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
      const candidate = value as Partial<Vector2>;
      return typeof candidate.x === 'number' && Number.isFinite(candidate.x) &&
          typeof candidate.y === 'number' && Number.isFinite(candidate.y)
        ? { x: candidate.x, y: candidate.y }
        : undefined;
    }
    if (kind === 'rect') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
      const candidate = value as Partial<Box>;
      return [candidate.x, candidate.y, candidate.width, candidate.height].every(
        (part) => typeof part === 'number' && Number.isFinite(part),
      )
        ? {
            x: candidate.x as number,
            y: candidate.y as number,
            width: candidate.width as number,
            height: candidate.height as number,
          }
        : undefined;
    }
    if (kind === 'paint') {
      if (!desiredValue || typeof desiredValue !== 'object' || Array.isArray(desiredValue)) return undefined;
      return normalizePaint(value, desiredValue as Paint);
    }
    return undefined;
  }

  private startValueFor(
    kind: PropertyKind,
    desiredValue: unknown,
    config: TransitionConfig | undefined,
    state: TransitionRuntimeState | undefined,
    settled: { kind: PropertyKind; value: unknown } | undefined,
  ): unknown | undefined {
    const explicit = this.explicitValueFor(kind, config?.initialValue, desiredValue);
    switch (config?.startValue ?? DEFAULT_TRANSITION_START_VALUE) {
      case 'explicit':
        return explicit ?? state?.displayedValue ?? settled?.value;
      case 'previousState':
        return settled?.value ?? explicit;
      default:
        return state?.displayedValue ?? settled?.value ?? explicit;
    }
  }

  resolve<T>(
    key: string,
    kind: PropertyKind,
    desiredValue: T,
    config: TransitionConfig | undefined,
    timeSeconds: number,
  ): T {
    const interpolator = interpolatorFor<T>(kind);
    const normalizedDesiredValue = (
      kind === 'fontWeight' ? resolveFontWeight(desiredValue) : desiredValue
    ) as T;
    const duration = getTransitionDuration(config);
    if (
      config?.enabled === false ||
      (config?.type !== undefined && config.type !== DEFAULT_TRANSITION_TYPE) ||
      !interpolator ||
      !(duration > 0)
    ) {
      this.settledValues.delete(key);
      this.activeStates.delete(key);
      return normalizedDesiredValue;
    }

    let state = this.activeStates.get(key);
    const settled = this.settledValues.get(key);
    if (state && (state.kind !== kind || timeSeconds < state.lastTimeSeconds)) {
      state = undefined;
      this.activeStates.delete(key);
    }
    if (!state && (!settled || settled.kind !== kind)) {
      const explicitInitialValue = this.explicitValueFor(kind, config?.initialValue, normalizedDesiredValue);
      if (
        (config?.initialBehavior ?? DEFAULT_TRANSITION_INITIAL_BEHAVIOR) === 'transition' &&
        explicitInitialValue !== undefined &&
        !valuesEqualForKind(kind, explicitInitialValue, normalizedDesiredValue)
      ) {
        state = {
          kind,
          startValue: explicitInitialValue,
          targetValue: normalizedDesiredValue,
          displayedValue: explicitInitialValue,
          startedAtSeconds: timeSeconds,
          lastTimeSeconds: timeSeconds,
          active: true,
        };
        this.activeStates.set(key, state);
        this.settledValues.set(key, { kind, value: normalizedDesiredValue });
      } else {
        this.settledValues.set(key, { kind, value: normalizedDesiredValue });
        return normalizedDesiredValue;
      }
    }

    const previousTarget = state?.targetValue ?? settled?.value;
    if (!valuesEqualForKind(kind, previousTarget, normalizedDesiredValue)) {
      const startValue = this.startValueFor(kind, normalizedDesiredValue, config, state, settled);
      if (startValue === undefined || valuesEqualForKind(kind, startValue, normalizedDesiredValue)) {
        this.activeStates.delete(key);
        this.settledValues.set(key, { kind, value: normalizedDesiredValue });
        return normalizedDesiredValue;
      }
      state = {
        kind,
        startValue,
        targetValue: normalizedDesiredValue,
        displayedValue: startValue,
        startedAtSeconds: timeSeconds,
        lastTimeSeconds: timeSeconds,
        active: true,
      };
      this.activeStates.set(key, state);
      this.settledValues.set(key, { kind, value: normalizedDesiredValue });
    } else if (state) {
      state.lastTimeSeconds = timeSeconds;
    }

    if (!state) {
      return normalizedDesiredValue;
    }

    if (!state.active) {
      state.displayedValue = normalizedDesiredValue;
      return normalizedDesiredValue;
    }

    const progress = calculateTransitionProgress(timeSeconds - state.startedAtSeconds, config);
    const displayedValue = interpolator(state.startValue as T, state.targetValue as T, progress);
    state.displayedValue = displayedValue;
    if (progress >= 1) {
      this.activeStates.delete(key);
      this.settledValues.set(key, { kind, value: state.targetValue });
      state.active = false;
      state.displayedValue = state.targetValue;
    }
    return state.displayedValue as T;
  }
}
