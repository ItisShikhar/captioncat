import type { TransitionConfig } from './transitions';
import { normalizePaint, solidPaint } from './paint';
import { normalizeFillPattern } from './fill-pattern';
import {
  type DistanceUnit,
  type PropertyKind,
  type ResolveContext,
  type Vector2,
  toVec2,
} from './types';
import {
  isModeSelectorPropertyKey,
  normalizeRandomizerConfig,
  resolveRandomizedPropertyValue,
  type RandomizerConfig,
} from './randomizer';
import { resolveFontWeight } from '../../font-registry';

/** A value on the preset tree. Animation components and transitions can override its base value. */
export class Property<T> {
  readonly kind: PropertyKind;
  private _base: T;
  readonly unit: DistanceUnit;
  /** Per-leaf corner metadata: draw this corner as a squircle vs a circular arc. */
  readonly squircle: boolean | undefined;
  readonly transition: TransitionConfig | undefined;
  readonly runtimeOnly: boolean;
  readonly randomizer: RandomizerConfig | undefined;
  readonly randomizerKey: string;
  private _resolvedValue: T | undefined;
  private _hasResolvedValue = false;
  private _transitionKey: string | undefined;

  constructor(init: {
    kind: PropertyKind;
    base: T;
    unit?: DistanceUnit | undefined;
    squircle?: boolean | undefined;
    transition?: TransitionConfig | undefined;
    runtimeOnly?: boolean | undefined;
    randomizer?: RandomizerConfig | undefined;
    randomizerKey?: string | undefined;
  }) {
    const isModeSelector = isModeSelectorPropertyKey(init.randomizerKey ?? '');
    this.kind = init.kind;
    this._base = init.base;
    this.unit = init.unit ?? 'pt';
    this.squircle = init.squircle;
    this.transition = isModeSelector ? undefined : init.transition;
    this.runtimeOnly = init.runtimeOnly ?? false;
    this.randomizerKey = init.randomizerKey ?? 'property';
    this.randomizer = isModeSelector
      ? undefined
      : init.randomizer === undefined
        ? undefined
        : normalizeRandomizerConfig(init.randomizer);
  }

  get base(): T {
    return this._base;
  }

  setBase(value: T): void {
    this._base = value;
  }

  /** Set the value produced by a dynamic component or behavior for this frame. */
  setResolvedValue(value: T | undefined): void {
    this._resolvedValue = value;
    this._hasResolvedValue = value !== undefined;
  }

  clearResolvedValue(): void {
    this._resolvedValue = undefined;
    this._hasResolvedValue = false;
  }

  get resolvedValue(): T {
    return this._hasResolvedValue ? (this._resolvedValue as T) : this.base;
  }

  get hasResolvedValue(): boolean {
    return this._hasResolvedValue;
  }

  setTransitionKey(key: string | undefined): void {
    this._transitionKey = key;
  }

  get transitionKey(): string | undefined {
    return this._transitionKey;
  }

  desiredValue(ctx: ResolveContext): T {
    const desired = ctx.followOverrides?.has(this)
      ? (ctx.followOverrides.get(this) as T)
      : this.resolvedValue;
    const normalizedDesired = this.kind === 'fontWeight' ? (resolveFontWeight(desired) as T) : desired;
    const randomized = resolveRandomizedPropertyValue(
      normalizedDesired,
      this.kind,
      this.randomizer,
      ctx,
      this.randomizerKey,
    );
    return this.kind === 'fontWeight' ? (resolveFontWeight(randomized) as T) : (randomized as T);
  }

  /** Resolve explicit animation, transition, dynamic, then authored values. */
  resolve(ctx: ResolveContext): T {
    if (ctx.styleOverrides?.has(this)) {
      return ctx.styleOverrides.get(this) as T;
    }
    if (ctx.animationOverrides?.has(this)) {
      return ctx.animationOverrides.get(this) as T;
    }
    if (ctx.transitionOverrides?.has(this)) {
      return ctx.transitionOverrides.get(this) as T;
    }
    return this.desiredValue(ctx);
  }

  clone(): Property<T> {
    return new Property<T>({
      kind: this.kind,
      base: this.base,
      unit: this.unit,
      squircle: this.squircle,
      transition: this.transition,
      runtimeOnly: this.runtimeOnly,
      randomizer: this.randomizer,
      randomizerKey: this.randomizerKey,
    });
  }

  cloneWithRandomizer(randomizer: RandomizerConfig | undefined): Property<T> {
    return new Property<T>({
      kind: this.kind,
      base: this.base,
      unit: this.unit,
      squircle: this.squircle,
      transition: this.transition,
      runtimeOnly: this.runtimeOnly,
      randomizer,
      randomizerKey: this.randomizerKey,
    });
  }

  /** Absolute magnitude of the static base (number kind). */
  maxNumber(): number {
    return typeof this.base === 'number' ? Math.abs(this.base) : 0;
  }

  /** Absolute magnitude per axis of the static base (vector2). */
  maxVector(): Vector2 {
    const base = this.base as unknown;
    const b = base && typeof base === 'object' ? toVec2(base) : { x: 0, y: 0 };
    return { x: Math.abs(b.x), y: Math.abs(b.y) };
  }
}

export interface PropertyLeaf {
  type?: string | undefined;
  value?: unknown;
  unit?: DistanceUnit | undefined;
  squircle?: boolean | undefined;
  transition?: TransitionConfig | undefined;
  runtimeOnly?: boolean | undefined;
  randomizer?: RandomizerConfig | undefined;
}

function normalizePropertyValue(value: unknown, kind: PropertyKind): unknown {
  if (kind === 'vector2') return toVec2(value);
  if (kind === 'paint') return normalizePaint(value, solidPaint('#000000'));
  if (kind === 'pattern') return normalizeFillPattern(value);
  if (kind === 'fontWeight') return resolveFontWeight(value);
  if (kind === 'rect' && value && typeof value === 'object') {
    const box = value as { x?: unknown; y?: unknown; width?: unknown; height?: unknown };
    return {
      x: Number(box.x) || 0,
      y: Number(box.y) || 0,
      width: Number(box.width) || 0,
      height: Number(box.height) || 0,
    };
  }
  return value;
}

export function buildProperty(leaf: PropertyLeaf, randomizerKey?: string): Property<unknown> {
  const kind = (leaf.type as PropertyKind | undefined) ?? 'object';
  const value = kind === 'pattern' && leaf.value === undefined ? leaf : leaf.value;
  return new Property<unknown>({
    kind,
    base: normalizePropertyValue(value, kind),
    unit: leaf.unit,
    squircle: leaf.squircle,
    transition: leaf.transition,
    runtimeOnly: leaf.runtimeOnly ?? kind === 'rect',
    randomizer: leaf.randomizer,
    randomizerKey,
  });
}

/** Convenience factory for a static (non-animated) property. */
export function staticProperty<T>(
  kind: PropertyKind,
  base: T,
  unit?: DistanceUnit,
  options?: Pick<PropertyLeaf, 'transition' | 'runtimeOnly'>,
): Property<T> {
  return new Property<T>({ kind, base, unit, ...options });
}
