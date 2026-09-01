import type { ResolveContext } from '../types';
import { Component } from './component';
import { normalizeFollowAnchor } from '../follow/types';
import { EASE_TYPE_SCHEMA, type EaseType } from '../../../utilities/ease-utils';

export type LayoutMotionMode = 'currentRow' | 'currentWord';
export type LayoutMotionScope = 'group' | 'perChild';
export type LayoutMotionType = 'spring' | 'eased';
export type LayoutMotionTimingMode = 'fixed' | 'adaptive';
export type LayoutMotionFlowDirection = 'leftToRight' | 'rightToLeft' | 'bottomToTop' | 'topToBottom';
export type LayoutMotionEasing = EaseType;
export type LayoutMotionState = 'past' | 'previous' | 'current' | 'next' | 'future';

/** Layout-aware motion settings for a Page or Row. */
export class LayoutMotion extends Component {
  readonly type = 'layoutMotion';
  override readonly allowedEntities = ['page', 'row'];
  override readonly allowedQuantity = 1;
  override readonly allowDisable = true;
  override readonly isDeletable = true;

  enabled(rctx: ResolveContext): boolean {
    return this.getProp<boolean>('enabled')?.resolve(rctx) !== false;
  }

  motionScope(rctx: ResolveContext): LayoutMotionScope {
    return this.getProp<string>('motionScope')?.resolve(rctx) === 'perChild' ? 'perChild' : 'group';
  }

  motionType(rctx: ResolveContext): LayoutMotionType {
    const raw = this.getProp<string>('motionType')?.resolve(rctx);
    if (raw === 'spring' || raw === 'eased') return raw;
    return 'spring';
  }

  timingMode(rctx: ResolveContext): LayoutMotionTimingMode {
    return this.getProp<string>('timingMode')?.resolve(rctx) === 'adaptive' ? 'adaptive' : 'fixed';
  }

  staggerTimingMode(rctx: ResolveContext): LayoutMotionTimingMode {
    return this.getProp<string>('staggerTimingMode')?.resolve(rctx) === 'fixed' ? 'fixed' : 'adaptive';
  }

  flowDirection(rctx: ResolveContext, mode: LayoutMotionMode): LayoutMotionFlowDirection {
    const raw = this.getProp<string>('flowDirection')?.resolve(rctx);
    if (mode === 'currentWord') {
      return raw === 'leftToRight' ? 'leftToRight' : 'rightToLeft';
    }
    if (raw === 'topToBottom') return 'bottomToTop';
    if (raw === 'bottomToTop') return 'topToBottom';
    return 'bottomToTop';
  }

  focusPosition(rctx: ResolveContext, mode: LayoutMotionMode): number {
    const value = this.getProp<unknown>('focusPosition')?.resolve(rctx);
    if (typeof value === 'number') return clamp(value, 0, 1);

    const focusPosition = normalizeFollowAnchor(value);
    const axis = mode === 'currentWord' ? 'x' : 'y';
    return axis === 'x'
      ? focusPosition.endsWith('Left')
        ? 0
        : focusPosition.endsWith('Right')
          ? 1
          : 0.5
      : focusPosition.startsWith('top')
        ? 0
        : focusPosition.startsWith('bottom')
          ? 1
          : 0.5;
  }

  stiffness(rctx: ResolveContext): number {
    return Math.max(0, finiteNumber(this.getProp<number>('stiffness')?.resolve(rctx), 220));
  }

  damping(rctx: ResolveContext): number {
    return Math.max(0, finiteNumber(this.getProp<number>('damping')?.resolve(rctx), 28));
  }

  mass(rctx: ResolveContext): number {
    return Math.max(0.001, finiteNumber(this.getProp<number>('mass')?.resolve(rctx), 1));
  }

  springFalloffFactor(rctx: ResolveContext): number {
    return clamp(finiteNumber(this.getProp<number>('springFalloffFactor')?.resolve(rctx), 1), 0.1, 8);
  }

  durationSeconds(rctx: ResolveContext): number {
    return Math.max(0, finiteNumber(this.getProp<number>('durationSeconds')?.resolve(rctx), 0.25));
  }

  staggerDelaySeconds(rctx: ResolveContext): number {
    return Math.max(0, finiteNumber(this.getProp<number>('staggerDelaySeconds')?.resolve(rctx), 0.025));
  }

  staggerFalloffFactor(rctx: ResolveContext): number {
    return clamp(finiteNumber(this.getProp<number>('staggerFalloffFactor')?.resolve(rctx), 1), 0, 8);
  }

  stateDistance(rctx: ResolveContext, state: string): number {
    const stateKey = normalizeMotionState(state);
    const value = this.getProp<number>(`stateMotion.${stateKey}.distanceScale`)?.resolve(rctx);
    return clamp(finiteNumber(value, 1), 0, 8);
  }

  stateSpeed(rctx: ResolveContext, state: string): number {
    const stateKey = normalizeMotionState(state);
    const value = this.getProp<number>(`stateMotion.${stateKey}.speedScale`)?.resolve(rctx);
    return clamp(finiteNumber(value, 1), 0.05, 8);
  }

  hasStateMotionOverrides(rctx: ResolveContext): boolean {
    return MOTION_STATES.some((state) => this.stateDistance(rctx, state) !== 1 || this.stateSpeed(rctx, state) !== 1);
  }

  easing(rctx: ResolveContext): LayoutMotionEasing {
    const parsed = EASE_TYPE_SCHEMA.safeParse(this.getProp<unknown>('easing')?.resolve(rctx));
    return parsed.success ? parsed.data : 'easeInOut';
  }
}

const MOTION_STATES: readonly LayoutMotionState[] = ['past', 'previous', 'current', 'next', 'future'];

function normalizeMotionState(value: string): LayoutMotionState {
  return MOTION_STATES.includes(value as LayoutMotionState) ? (value as LayoutMotionState) : 'current';
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
