import {
  type PropertyKind,
  type ResolveContext,
  type Vector2,
} from "./types";
import {
  RANDOMIZER_SCOPE_OPTIONS,
  RANDOMIZER_TRIGGER_OPTIONS,
  type RandomizerConfig,
  type RandomizerScope,
  type RandomizerTrigger,
} from './randomizer-types';
export {
  RANDOMIZER_SCOPE_OPTIONS,
  RANDOMIZER_TRIGGER_OPTIONS,
} from './randomizer-types';
export type {
  RandomizerAxis,
  RandomizerConfig,
  RandomizerMode,
  RandomizerScope,
  RandomizerTrigger,
} from './randomizer-types';
import { solidPaint } from "./paint";
import { valuesEqualForKind } from "./transitions/interpolators";

const RANDOMIZER_HASH_NAMESPACE = "caption-randomizer";
/** Keeps page indexes distinct when the pipeline packs them into appearance identities. */
export const RANDOMIZER_APPEARANCE_PAGE_STRIDE = 1_000_000;

export function isModeSelectorPropertyKey(propertyKey: string): boolean {
  const leafKey = propertyKey.split(/[.[\]]+/).filter(Boolean).at(-1) ?? propertyKey;
  return leafKey === "mode" || leafKey.endsWith("Mode");
}

export function normalizeRandomizerTrigger(value: unknown): RandomizerTrigger | undefined {
  if (value === "current") return "currentWordStart";
  return typeof value === "string" && RANDOMIZER_TRIGGER_OPTIONS.includes(value as RandomizerTrigger)
    ? (value as RandomizerTrigger)
    : undefined;
}

export function resolveRandomizerTrigger(config: RandomizerConfig): RandomizerTrigger {
  return (
    normalizeRandomizerTrigger(config.trigger) ??
    (config.updateEveryFrame === true ? "everyFrame" : "onStart")
  );
}

export function normalizeRandomizerScope(value: unknown): RandomizerScope | undefined {
  return RANDOMIZER_SCOPE_OPTIONS.includes(value as RandomizerScope)
    ? (value as RandomizerScope)
    : undefined;
}

export function resolveRandomizerScope(config: RandomizerConfig): RandomizerScope {
  return normalizeRandomizerScope(config.scope) ?? "entity";
}

function inheritedRandomizerTrigger(config: RandomizerConfig): RandomizerTrigger | undefined {
  return config.trigger === undefined && config.updateEveryFrame !== true
    ? undefined
    : resolveRandomizerTrigger(config);
}

function childRandomizerConfig(
  config: RandomizerConfig,
  inheritedTrigger: RandomizerTrigger | undefined,
): RandomizerConfig {
  return config.trigger === undefined && inheritedTrigger !== undefined
    ? { ...config, trigger: inheritedTrigger }
    : config;
}

function normalizeRandomizerConfigValue(
  config: RandomizerConfig,
  includeDefaultTrigger: boolean,
): RandomizerConfig {
  const { updateEveryFrame, axes, scope: rawScope, trigger: rawTrigger, ...rest } = config;
  const trigger =
    normalizeRandomizerTrigger(rawTrigger) ??
    (updateEveryFrame === true ? "everyFrame" : includeDefaultTrigger ? "onStart" : undefined);
  const scope = normalizeRandomizerScope(rawScope);
  const normalizedAxes = axes
    ? Object.fromEntries(
        Object.entries(axes).map(([axis, axisConfig]) => [
          axis,
          normalizeRandomizerConfigValue(axisConfig, false),
        ]),
      )
    : undefined;
  return {
    ...rest,
    ...(trigger === undefined ? {} : { trigger }),
    ...(scope === undefined ? {} : { scope }),
    ...(normalizedAxes === undefined ? {} : { axes: normalizedAxes }),
  };
}

export function normalizeRandomizerConfig(config: RandomizerConfig): RandomizerConfig {
  return normalizeRandomizerConfigValue(config, true);
}

export type NumericRandomizerBounds = readonly [min: number, max: number];

/** Returns whether an active position randomizer requests parent-bound enforcement. */
export function keepsWithinParentBounds(config: RandomizerConfig | undefined): boolean {
  if (!config || config.enabled === false) return false;
  if (config.keepWithinParentBounds === true) return true;
  return Object.values(config.axes ?? {}).some(
    (axisConfig) => keepsWithinParentBounds(axisConfig),
  );
}

function orderedNumericBounds(first: number, second: number): NumericRandomizerBounds {
  return first <= second ? [first, second] : [second, first];
}

function finiteNumericValues(values: readonly unknown[] | undefined): number[] {
  return (values ?? [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

/**
 * Returns the possible numeric output of a randomizer, including its static
 * fallback when the randomizer has no usable numeric source.
 */
export function numericRandomizerBounds(
  config: RandomizerConfig | undefined,
  fallback: number,
): NumericRandomizerBounds {
  if (!config || config.enabled === false) return [fallback, fallback];

  if (config.mode !== "range") {
    const values = finiteNumericValues(config.values);
    if (values.length > 0) {
      return orderedNumericBounds(Math.min(...values), Math.max(...values));
    }
  }

  if (Array.isArray(config.range) && config.range.length >= 2) {
    const first = Number(config.range[0]);
    const second = Number(config.range[1]);
    if (Number.isFinite(first) && Number.isFinite(second)) {
      return orderedNumericBounds(first, second);
    }
  }

  return [fallback, fallback];
}

/**
 * Returns the possible output bounds for one axis of a vector randomizer.
 */
export function vectorRandomizerAxisBounds(
  config: RandomizerConfig | undefined,
  axis: "x" | "y",
  fallback: number,
): NumericRandomizerBounds {
  if (!config || config.enabled === false) return [fallback, fallback];

  const axisConfig = config.axes?.[axis];
  if (axisConfig) return numericRandomizerBounds(axisConfig, fallback);
  if (config.axes?.x || config.axes?.y) return [fallback, fallback];

  if (config.range && !Array.isArray(config.range)) {
    const range = config.range[axis];
    if (Array.isArray(range) && range.length >= 2) {
      const first = Number(range[0]);
      const second = Number(range[1]);
      if (Number.isFinite(first) && Number.isFinite(second)) {
        return orderedNumericBounds(first, second);
      }
    }
  }

  if (config.mode !== "range") {
    const values = (config.values ?? [])
      .map((value) => {
        if (!isVector2(value)) return undefined;
        return Number(value[axis]);
      })
      .filter((value): value is number => Number.isFinite(value));
    if (values.length > 0) {
      return orderedNumericBounds(Math.min(...values), Math.max(...values));
    }
  }

  return [fallback, fallback];
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomUnit(seed: number): number {
  let value = seed | 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 0x1_0000_0000;
}

function randomKey(
  ctx: ResolveContext,
  propertyKey: string,
  config: RandomizerConfig,
): string {
  const scopedKey = randomizerScopeKey(ctx, config).key;
  const entityKey = scopedKey ?? "entity";
  const trigger = resolveRandomizerTrigger(config);
  const appearanceKey =
    config.deterministic === false && ctx.randomizerAppearanceIndex !== undefined
      ? `|appearance:${ctx.randomizerAppearanceIndex}`
      : "";
  const triggerKey =
    trigger === "everyFrame"
      ? `|frame:${ctx.frameIndex}`
      : trigger === "onStart"
        ? ""
        : `|trigger:${ctx.randomizerTriggerIndexes?.[trigger] ?? ctx.triggerIndex}`;
  return `${RANDOMIZER_HASH_NAMESPACE}|${entityKey}${appearanceKey}|${propertyKey}${triggerKey}`;
}

function randomizerScopeKey(
  ctx: ResolveContext,
  config: RandomizerConfig,
): {
  key: string | undefined;
  contextKey: "randomizerKey" | "rowRandomizerKey" | "pageRandomizerKey";
} {
  const scope = resolveRandomizerScope(config);
  if (scope === "page" && ctx.pageRandomizerKey !== undefined) {
    return { key: ctx.pageRandomizerKey, contextKey: "pageRandomizerKey" };
  }
  if (scope === "row" && ctx.rowRandomizerKey !== undefined) {
    return { key: ctx.rowRandomizerKey, contextKey: "rowRandomizerKey" };
  }
  return { key: ctx.randomizerKey, contextKey: "randomizerKey" };
}

function randomValue(
  config: RandomizerConfig,
  ctx: ResolveContext,
  propertyKey: string,
): number {
  return randomUnit(
    hashString(
      randomKey(ctx, propertyKey, config),
    ),
  );
}

interface RandomizerSequencePosition {
  prefix: string;
  index: number;
}

const finiteSelectionCache = new WeakMap<RandomizerConfig, Map<string, number>>();

function sequencePosition(
  randomizerKey: string | undefined,
): RandomizerSequencePosition | undefined {
  const match = /^(.*:)(\d+)$/.exec(randomizerKey ?? "");
  if (!match) return undefined;
  const index = Number(match[2]);
  return Number.isSafeInteger(index) ? { prefix: match[1], index } : undefined;
}

function rawSelectionIndex(roll: number, valueCount: number): number {
  return Math.min(valueCount - 1, Math.floor(roll * valueCount));
}

function previousSelectionContext(
  config: RandomizerConfig,
  ctx: ResolveContext,
): ResolveContext | undefined {
  const trigger = resolveRandomizerTrigger(config);
  if (trigger === "everyFrame" && ctx.frameIndex > 0) {
    return { ...ctx, frameIndex: ctx.frameIndex - 1 };
  }
  const scoped = randomizerScopeKey(ctx, config);
  const isPageTrigger = trigger === "currentPageStart" || trigger === "currentPageEnd";
  const isRowTrigger = trigger === "currentRowStart" || trigger === "currentRowEnd";
  const isScopedBoundaryTrigger =
    (scoped.contextKey === "pageRandomizerKey" && isPageTrigger) ||
    (scoped.contextKey === "rowRandomizerKey" && isRowTrigger);
  if (isScopedBoundaryTrigger) {
    const scopePosition = sequencePosition(scoped.key);
    if (scopePosition && scopePosition.index > 0) {
      const triggerIndex = ctx.randomizerTriggerIndexes?.[trigger] ?? ctx.triggerIndex;
      return {
        ...ctx,
        [scoped.contextKey]: `${scopePosition.prefix}${scopePosition.index - 1}`,
        ...(ctx.randomizerTriggerIndexes
          ? {
              randomizerTriggerIndexes: {
                ...ctx.randomizerTriggerIndexes,
                [trigger]: Math.max(0, triggerIndex - 1),
              },
            }
          : {}),
      };
    }
  }
  if (trigger !== "onStart" && trigger !== "everyFrame") {
    const triggerIndex = ctx.randomizerTriggerIndexes?.[trigger] ?? ctx.triggerIndex;
    if (triggerIndex > 0) {
      return ctx.randomizerTriggerIndexes
        ? {
            ...ctx,
            randomizerTriggerIndexes: {
              ...ctx.randomizerTriggerIndexes,
              [trigger]: triggerIndex - 1,
            },
          }
        : { ...ctx, triggerIndex: triggerIndex - 1 };
    }
  }
  const appearanceIndex = ctx.randomizerAppearanceIndex;
  if (config.deterministic === false && appearanceIndex !== undefined && appearanceIndex > 0) {
    const pageOffset = appearanceIndex % RANDOMIZER_APPEARANCE_PAGE_STRIDE;
    const decrement = pageOffset === 0 ? RANDOMIZER_APPEARANCE_PAGE_STRIDE : 1;
    return {
      ...ctx,
      randomizerAppearanceIndex: appearanceIndex - decrement,
    };
  }
  const position = sequencePosition(scoped.key);
  if (!position || position.index <= 0) return undefined;
  return {
    ...ctx,
    [scoped.contextKey]: `${position.prefix}${position.index - 1}`,
  };
}

function shouldAvoidConsecutiveRepeat(
  config: RandomizerConfig,
  ctx: ResolveContext,
  kind: PropertyKind,
): boolean {
  if (config.deterministic === false) return true;
  return kind === "paint" && (config.mode === "amongStable" || config.mode === undefined) &&
    resolveRandomizerTrigger(config) !== "everyFrame";
}

function differentSelectionIndex(
  values: readonly unknown[],
  kind: PropertyKind,
  config: RandomizerConfig,
  ctx: ResolveContext,
  propertyKey: string,
  previousValue: unknown,
  selectedIndex: number,
): number {
  if (!values.some((value) => !valuesEqualForKind(kind, value, previousValue))) return selectedIndex;
  for (let attempt = 0; attempt < Math.max(8, values.length * 4); attempt += 1) {
    if (!valuesEqualForKind(kind, values[selectedIndex], previousValue)) return selectedIndex;
    selectedIndex = rawSelectionIndex(
      randomValue(config, ctx, `${propertyKey}|retry:${attempt}`),
      values.length,
    );
  }
  return values.findIndex((value) => !valuesEqualForKind(kind, value, previousValue));
}

function finiteSelectionIndex(
  values: readonly unknown[],
  kind: PropertyKind,
  config: RandomizerConfig,
  ctx: ResolveContext,
  propertyKey: string,
): number {
  const cacheKey = randomKey(ctx, propertyKey, config);
  const cache = finiteSelectionCache.get(config) ?? new Map<string, number>();
  finiteSelectionCache.set(config, cache);
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  let selectedIndex = rawSelectionIndex(randomValue(config, ctx, propertyKey), values.length);
  if (shouldAvoidConsecutiveRepeat(config, ctx, kind)) {
    const previousContext = previousSelectionContext(config, ctx);
    if (previousContext) {
      const previousIndex = finiteSelectionIndex(values, kind, config, previousContext, propertyKey);
      selectedIndex = differentSelectionIndex(
        values,
        kind,
        config,
        ctx,
        propertyKey,
        values[previousIndex],
        selectedIndex,
      );
    }
  }
  cache.set(cacheKey, selectedIndex);
  return selectedIndex;
}

function randomColor(
  config: RandomizerConfig,
  ctx: ResolveContext,
  propertyKey: string,
): ReturnType<typeof solidPaint> {
  const hue = randomValue(config, ctx, `${propertyKey}.hue`) * 360;
  const saturation =
    0.65 + randomValue(config, ctx, `${propertyKey}.saturation`) * 0.2;
  const lightness =
    0.45 + randomValue(config, ctx, `${propertyKey}.lightness`) * 0.15;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const second = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = lightness - chroma / 2;
  const [red, green, blue] =
    hue < 60
      ? [chroma, second, 0]
      : hue < 120
        ? [second, chroma, 0]
        : hue < 180
          ? [0, chroma, second]
          : hue < 240
            ? [0, second, chroma]
            : hue < 300
              ? [second, 0, chroma]
              : [chroma, 0, second];
  const toByte = (channel: number) =>
    Math.round((channel + match) * 255)
      .toString(16)
      .padStart(2, "0");
  return solidPaint(`#${toByte(red)}${toByte(green)}${toByte(blue)}`);
}

function numericRange(range: [number, number], roll: number): number {
  const min = Math.min(range[0], range[1]);
  const max = Math.max(range[0], range[1]);
  return min + (max - min) * roll;
}

function isVector2(value: unknown): value is Vector2 {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { x?: unknown }).x === "number" &&
    typeof (value as { y?: unknown }).y === "number"
  );
}

function sampleConfiguredValue(
  base: unknown,
  kind: PropertyKind,
  config: RandomizerConfig,
  ctx: ResolveContext,
  propertyKey: string,
): unknown {
  if (kind === "paint" && config.mode === "randomColor") {
    return randomColor(config, ctx, propertyKey);
  }
  const values =
    config.mode === "range"
      ? []
      : (config.values?.filter((value) => value !== undefined) ?? []);
  if (values.length > 0) {
    const index = finiteSelectionIndex(values, kind, config, ctx, propertyKey);
    return values[index];
  }

  if (kind === "number" || kind === "numberOrAuto" || kind === "fontWeight") {
    if (Array.isArray(config.range) && config.range.length >= 2) {
      return numericRange(config.range, randomValue(config, ctx, propertyKey));
    }
    return base;
  }

  if (kind === "boolean") {
    const values = [false, true];
    return values[finiteSelectionIndex(values, kind, config, ctx, propertyKey)];
  }

  return base;
}

function resolveVector2(
  base: Vector2,
  config: RandomizerConfig,
  ctx: ResolveContext,
  propertyKey: string,
): Vector2 {
  const xConfig = config.axes?.x;
  const yConfig = config.axes?.y;
  const inheritedTrigger = inheritedRandomizerTrigger(config);
  if (xConfig || yConfig) {
    return {
      x: xConfig
        ? Number(
            resolveRandomizerValue(
              base.x,
              "number",
              {
                ...childRandomizerConfig(xConfig, inheritedTrigger),
                ...(xConfig.deterministic === undefined && config.deterministic !== undefined
                  ? { deterministic: config.deterministic }
                  : {}),
                ...(xConfig.scope === undefined && config.scope !== undefined
                  ? { scope: config.scope }
                  : {}),
              },
              ctx,
              `${propertyKey}.x`,
            ),
          )
        : base.x,
      y: yConfig
        ? Number(
            resolveRandomizerValue(
              base.y,
              "number",
              {
                ...childRandomizerConfig(yConfig, inheritedTrigger),
                ...(yConfig.deterministic === undefined && config.deterministic !== undefined
                  ? { deterministic: config.deterministic }
                  : {}),
                ...(yConfig.scope === undefined && config.scope !== undefined
                  ? { scope: config.scope }
                  : {}),
              },
              ctx,
              `${propertyKey}.y`,
            ),
          )
        : base.y,
    };
  }

  if (config.mode !== "range" && config.mode !== "randomColor" && config.values?.length) {
    return sampleConfiguredValue(
      base,
      "vector2",
      config,
      ctx,
      propertyKey,
    ) as Vector2;
  }

  if (config.range && !Array.isArray(config.range)) {
    return {
      x: numericRange(
        config.range.x,
        randomValue(config, ctx, `${propertyKey}.x`),
      ),
      y: numericRange(
        config.range.y,
        randomValue(config, ctx, `${propertyKey}.y`),
      ),
    };
  }

  return base;
}

function resolveRandomizerValue(
  base: unknown,
  kind: PropertyKind,
  config: RandomizerConfig,
  ctx: ResolveContext,
  propertyKey: string,
): unknown {
  if (config.enabled === false) return base;
  const inheritedTrigger = inheritedRandomizerTrigger(config);
  if (kind === "vector2" && isVector2(base))
    return resolveVector2(base, config, ctx, propertyKey);
  if (
    kind === "rect" &&
    base &&
    typeof base === "object" &&
    !Array.isArray(base)
  ) {
    const rect = base as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    const axes = config.axes;
    return {
      x: axes?.x
        ? Number(
            resolveRandomizerValue(
              rect.x,
              "number",
              {
                ...childRandomizerConfig(axes.x, inheritedTrigger),
              },
              ctx,
              `${propertyKey}.x`,
            ),
          )
        : rect.x,
      y: axes?.y
        ? Number(
            resolveRandomizerValue(
              rect.y,
              "number",
              {
                ...childRandomizerConfig(axes.y, inheritedTrigger),
              },
              ctx,
              `${propertyKey}.y`,
            ),
          )
        : rect.y,
      width: axes?.width
        ? Number(
            resolveRandomizerValue(
              rect.width,
              "number",
              {
                ...childRandomizerConfig(axes.width, inheritedTrigger),
              },
              ctx,
              `${propertyKey}.width`,
            ),
          )
        : rect.width,
      height: axes?.height
        ? Number(
            resolveRandomizerValue(
              rect.height,
              "number",
              {
                ...childRandomizerConfig(axes.height, inheritedTrigger),
              },
              ctx,
              `${propertyKey}.height`,
            ),
          )
        : rect.height,
    };
  }
  return sampleConfiguredValue(base, kind, config, ctx, propertyKey);
}

export function resolveRandomizedPropertyValue(
  base: unknown,
  kind: PropertyKind,
  config: RandomizerConfig | undefined,
  ctx: ResolveContext,
  propertyKey: string,
): unknown {
  if (!config || isModeSelectorPropertyKey(propertyKey)) return base;
  return resolveRandomizerValue(base, kind, config, ctx, propertyKey);
}
