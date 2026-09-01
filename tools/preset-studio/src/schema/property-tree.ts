/**
 * Generic representation of an ECS preset's self-describing property tree.
 * Every leaf value carries its
 * own `type` tag, and every branch nests further children.
 *
 * Authored ECS JSON uses two different container conventions that
 * this module normalizes into a single `PropertyNode` union:
 *
 * 1. **Wrapped containers** - `{ "properties": {...children } }`. Used for
 * generic/extensible style blocks (page, rows, text, background, font,
 * word styles, list items,...).
 * 2. **Inline containers** - a plain object whose own keys are already
 * children, with no `properties` indirection. Used for small fixed-shape
 * structs such as vectors and layout options.
 *
 * Two more shapes are *not* tree nodes at all, even though they show up
 * nested inside a leaf definition: `animation` and `randomizer`. These carry
 * raw (unwrapped) config values as siblings of `type`/`value` on the leaf
 * itself - see `AnimationConfig`/`RandomizerConfig` below.
 */

import type {
  TransitionConfig as EngineTransitionConfig,
  TransitionInitialBehavior as EngineTransitionInitialBehavior,
  TransitionScope as EngineTransitionScope,
  TransitionStartValue as EngineTransitionStartValue,
  TransitionType as EngineTransitionType,
} from '@captioncat/caption-engine/browser';
import { DEFAULT_TRANSITION_DURATION_SECONDS } from '@captioncat/caption-engine/browser';
import type { RandomizerConfig as EngineRandomizerConfig } from '@captioncat/caption-engine/browser';
import type { FillMode } from '@captioncat/caption-engine/browser';
import { resolveFontWeight } from '@captioncat/caption-engine/browser';

/** Every primitive leaf type used across the shipped presets. */
export type PropertyValueType =
  | 'number'
  | 'numberOrAuto'
  | 'vector2'
  | 'rect'
  | 'paint'
  | 'pattern'
  | 'boolean'
  | 'string'
  | 'fontFamily'
  | 'fontWeight'
  | 'list'
  | 'array'
  | 'object';

export type EaseType = 'linear' | 'ease' | 'elastic' | 'bounce' | 'easeIn' | 'easeOut' | 'easeInOut';

export const EASE_TYPES: EaseType[] = ['linear', 'ease', 'elastic', 'bounce', 'easeIn', 'easeOut', 'easeInOut'];
export const TRANSITION_TYPES: readonly EngineTransitionType[] = ['tween'];
export type TransitionType = EngineTransitionType;
export type TransitionScope = EngineTransitionScope;
export type TransitionStartValue = EngineTransitionStartValue;
export type TransitionInitialBehavior = EngineTransitionInitialBehavior;

/**
 * Raw (unwrapped) keyframe-burst config, attached directly on a leaf
 * definition. `keyframes` elements match the leaf's own value shape (numbers
 * for a `number` leaf, `{x,y}` for `vector2`, Paint objects for `paint`, etc.).
 */
export interface AnimationConfig {
  enabled?: boolean;
  durationSeconds?: number;
  keyframes?: unknown[];
  /** Optional explicit per-keyframe times (seconds, same length as keyframes). Absent = evenly spaced. */
  times?: number[];
  easeType?: EaseType;
  /** Present on some string-valued legacy animation definitions. */
  [extra: string]: unknown;
}

/** Per-axis numeric range for a vector2 randomizer (each axis rolls in its own `[min,max]`). */
export interface VectorRange {
  x: [number, number];
  y: [number, number];
}

/** Raw (unwrapped) per-value randomization config, attached directly on a leaf definition. */
export type RandomizerConfig = EngineRandomizerConfig;

/**
 * A leaf value: has a `type` tag plus the actual value, and can carry
 * `animation`/`randomizer` (raw) and a handful of type-specific flags
 * (`squircle` on corner-radius numbers).
 */
export interface LeafDefinition {
  kind: 'leaf';
  type: PropertyValueType;
  value: unknown;
  /** True when the source JSON omitted `value` entirely (leaf driven purely by `animation` keyframes). */
  hasNoValue?: boolean;
  animation?: AnimationConfig;
  /** Reactive interpolation config for this property. */
  transition?: TransitionConfig;
  /** Runtime-derived leaves can be serialized only when they carry authored configuration. */
  runtimeOnly?: boolean;
  randomizer?: RandomizerConfig;
  squircle?: boolean;
  [extra: string]: unknown;
}

/** `transition` block shape - an inline container, but shallow/fixed enough to also read as plain config. */
export type TransitionConfig = EngineTransitionConfig;
export const DEFAULT_TRANSITION_CONFIG: TransitionConfig = {
  enabled: true,
  type: 'tween',
  durationSeconds: DEFAULT_TRANSITION_DURATION_SECONDS,
  easeType: 'ease',
  scope: 'shared',
  startValue: 'previousDisplayed',
  initialBehavior: 'immediate',
};

/** A branch node: children keyed by field name, in authoring order. */
export interface ContainerNode {
  kind: 'container';
  /** Whether the source JSON wrapped children in a `properties` key (wrapped) or not (inline). */
  wrapping: 'wrapped' | 'inline';
  children: Record<string, PropertyNode>;
}

export type PropertyNode = LeafDefinition | ContainerNode;

export const KNOWN_LEAF_TYPES: ReadonlySet<string> = new Set<PropertyValueType>([
  'number',
  'numberOrAuto',
  'vector2',
  'rect',
  'paint',
  'pattern',
  'boolean',
  'string',
  'fontFamily',
  'fontWeight',
  'list',
  'array',
  'object',
]);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPaintValue(value: unknown): boolean {
  if (!isPlainObject(value) || typeof value.type !== 'string') return false;
  if (value.type === 'solid') return typeof value.color === 'string';
  if (value.type !== 'linear-gradient' && value.type !== 'radial-gradient') return false;
  if (!Array.isArray(value.stops) || value.stops.length < 2) return false;
  if (
    !value.stops.every(
      (stop) => isPlainObject(stop) && isFiniteNumber(stop.offset) && typeof stop.color === 'string',
    )
  ) {
    return false;
  }
  if (value.type === 'linear-gradient') return isFiniteNumber(value.angle);
  return (
    isFiniteNumber(value.centerX) &&
    isFiniteNumber(value.centerY) &&
    isFiniteNumber(value.radius)
  );
}

/** Returns whether a serialized value matches its leaf type without applying defaults. */
export function isValidPropertyValue(type: string, value: unknown): boolean {
  switch (type) {
    case 'number':
      return isFiniteNumber(value);
    case 'numberOrAuto':
      return value === 'auto' || isFiniteNumber(value);
    case 'vector2':
      return isPlainObject(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y);
    case 'rect':
      return (
        isPlainObject(value) &&
        isFiniteNumber(value.x) &&
        isFiniteNumber(value.y) &&
        isFiniteNumber(value.width) &&
        isFiniteNumber(value.height)
      );
    case 'paint':
      return isPaintValue(value);
    case 'pattern':
      if (!isPlainObject(value)) return false;
      return (
        (value.pattern === 'single' ||
          value.pattern === 'cycle' ||
          value.pattern === 'alternate' ||
          value.mode === 'cycle' ||
          value.mode === 'alternate') &&
        Array.isArray(value.colors) &&
        value.colors.every((color) => typeof color === 'string' && color.trim().length > 0) &&
        isFiniteNumber(value.offset)
      );
    case 'boolean':
      return typeof value === 'boolean';
    case 'string':
      return typeof value === 'string';
    case 'fontFamily':
      return Array.isArray(value) && value.every((family) => typeof family === 'string');
    case 'fontWeight':
      return isFontWeightValue(value);
    case 'list':
    case 'array':
      return Array.isArray(value);
    case 'object':
      return isPlainObject(value);
    default:
      return false;
  }
}

function isFontWeightValue(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 1 && value <= 1000;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  if (
    normalized === 'normal' ||
    normalized === 'bold' ||
    normalized === 'semibold' ||
    normalized === 'black' ||
    normalized === 'light'
  ) {
    return true;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 1000;
}

export const TRANSITIONABLE_PROPERTY_TYPES: ReadonlySet<PropertyValueType> = new Set([
  'number',
  'numberOrAuto',
  'vector2',
  'rect',
  'paint',
  'fontWeight',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizePatternValue(value: unknown): { pattern: FillMode; colors: string[]; offset: number } {
  const raw = isPlainObject(value) ? value : {};
  const rawPattern = raw.pattern ?? raw.mode;
  const pattern: FillMode =
    rawPattern === 'cycle' || rawPattern === 'alternate' || rawPattern === 'single'
      ? rawPattern
      : raw.mode === undefined
        ? 'single'
        : 'cycle';
  const colors = Array.isArray(raw.colors)
    ? raw.colors.filter((color): color is string => typeof color === 'string' && color.trim().length > 0)
    : [];
  const offset = typeof raw.offset === 'number' && Number.isFinite(raw.offset) ? Math.trunc(raw.offset) : 0;
  return { pattern, colors, offset };
}

/**
 * Parses a raw JSON value from a preset file into a `PropertyNode`, or
 * returns `undefined` if the value is not a recognizable node (e.g. it is a
 * raw `animation`/`randomizer` object, which callers must read directly
 * off the parent leaf instead of via this parser).
 */
export function parseNode(raw: unknown): PropertyNode | undefined {
  if (!isPlainObject(raw)) {
    return undefined;
  }

  // Forward-compat: any object carrying its own `type` tag is treated as an
  // opaque leaf, even if `type` is not one we recognize yet (for example, a newer
  // engine version's field), and even if `value` itself is omitted (some
  // leaves are driven purely by `animation` keyframes with no static value).
  if (typeof raw.type === 'string') {
    const { type, value, animation, transition, randomizer, squircle, ...rest } = raw;
    const parsedValue =
      type === 'pattern'
        ? normalizePatternValue(value === undefined ? rest : value)
        : type === 'fontWeight'
          ? resolveFontWeight(value)
          : value;
    const leaf: LeafDefinition = {
      kind: 'leaf',
      type: type as PropertyValueType,
      value: parsedValue,
      animation: animation as AnimationConfig | undefined,
      transition: transition as TransitionConfig | undefined,
      randomizer: randomizer as RandomizerConfig | undefined,
      squircle: typeof squircle === 'boolean' ? squircle : undefined,
      ...(type === 'pattern' ? {} : rest),
    };
    if (!('value' in raw)) {
      leaf.hasNoValue = true;
    }
    return leaf;
  }

  if (isPlainObject(raw.properties)) {
    const children: Record<string, PropertyNode> = {};
    for (const [key, childRaw] of Object.entries(raw.properties)) {
      const child = parseNode(childRaw);
      if (child) {
        children[key] = child;
      }
    }
    return { kind: 'container', wrapping: 'wrapped', children };
  }

  // Inline container: every own-key value must itself parse as a node,
  // otherwise this is some other raw object the parser does not understand as a tree.
  const entries = Object.entries(raw);
  if (entries.length === 0) {
    return { kind: 'container', wrapping: 'inline', children: {} };
  }

  const children: Record<string, PropertyNode> = {};
  for (const [key, childRaw] of entries) {
    const child = parseNode(childRaw);
    if (!child) {
      return undefined;
    }
    children[key] = child;
  }
  return { kind: 'container', wrapping: 'inline', children };
}

/**
 * Some leaves are authored with `"type": "object", "value": null` plus an
 * `animation` block - the engine's own convention (see
 * the runtime's object-leaf inference)
 * for a purely keyframe-animation-driven value that has no meaningful static
 * "at rest" number/string/vector2 (e.g. Motion Blur's `steps`/`blurRadius`,
 * which only ever exist mid-animation). The real leaf type is not `object` at
 * all - it is whatever the first animation keyframe's shape implies. Mirrors
 * the engine's own inference exactly so preset-studio renders these leaves
 * with the correct control (NumberField/StringField/vector2-field) instead of
 * falling back to a raw, uneditable JSON dump of `null`.
 */
export function inferObjectLeafType(leaf: LeafDefinition): PropertyValueType | undefined {
  if (leaf.type !== 'object') return undefined;
  const keyframes = Array.isArray(leaf.animation?.keyframes) ? leaf.animation.keyframes : [];
  const firstKeyframe = keyframes.find((frame) => frame !== null && frame !== undefined);
  if (typeof firstKeyframe === 'number') return 'number';
  if (typeof firstKeyframe === 'string') return 'string';
  if (typeof firstKeyframe === 'object' && firstKeyframe !== null && 'x' in firstKeyframe && 'y' in firstKeyframe) {
    return 'vector2';
  }
  return undefined;
}

/** Parses a `list`/`array` leaf's `value` into child nodes (one per item). */
export function parseListItems(leaf: LeafDefinition): PropertyNode[] {
  if (!Array.isArray(leaf.value)) {
    return [];
  }
  return leaf.value.map((item) => parseNode(item)).filter((n): n is PropertyNode => n !== undefined);
}

/** Serializes a `PropertyNode` back into the raw JSON shape the engine expects. */
export function serializeNode(node: PropertyNode): unknown {
  if (node.kind === 'leaf') {
    if (node.runtimeOnly && node.transition === undefined && node.randomizer === undefined) return undefined;
    const { kind, type, value, hasNoValue, animation, transition, randomizer, squircle, ...rest } = node;
    void kind;
    if (type === 'pattern') {
      const normalizedPattern = normalizePatternValue(value);
      return { type: 'pattern', pattern: normalizedPattern.pattern, colors: normalizedPattern.colors, offset: normalizedPattern.offset };
    }
    const out: Record<string, unknown> = { type };
    if (!hasNoValue) out.value = value;
    if (animation !== undefined) out.animation = animation;
    if (transition !== undefined) out.transition = transition;
    if (randomizer !== undefined) {
      const { seed: _seed, ...randomizerWithoutSeed } = randomizer as RandomizerConfig & { seed?: number };
      out.randomizer = randomizerWithoutSeed;
    }
    if (squircle !== undefined) out.squircle = squircle;
    return { ...out, ...rest };
  }

  const childrenRaw: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(node.children)) {
    const serialized = serializeNode(child);
    if (serialized !== undefined) childrenRaw[key] = serialized;
  }
  return node.wrapping === 'wrapped' ? { properties: childrenRaw } : childrenRaw;
}

export function isLeaf(node: PropertyNode | undefined): node is LeafDefinition {
  return node?.kind === 'leaf';
}

export function isContainer(node: PropertyNode | undefined): node is ContainerNode {
  return node?.kind === 'container';
}

/**
 * Recursively overlays a real (loaded-from-JSON) node onto a canonical
 * template node: every field the template declares ends up present in the
 * result - the real preset's own value where it defines one, the
 * template's default otherwise - so a preset that never mentions e.g.
 * `shadow` or `motionBlur` still renders those controls (with sane
 * defaults) instead of the field silently vanishing from the UI.
 *
 * Any extra key the real preset has that the template does not know about
 * is preserved verbatim (forward-compat: newer engine fields keep working
 * even before the template is updated to describe them).
 */
export function mergeWithTemplate(real: PropertyNode | undefined, template: PropertyNode): PropertyNode {
  if (!real) return structuredClone(template);

  if (template.kind === 'leaf') {
    // Leaves are atomic: the real leaf (if it is one) already carries its
    // own value/animation/transition/randomizer, so it wins outright.
    return real.kind === 'leaf' ? real : structuredClone(template);
  }

  if (real.kind !== 'container') return structuredClone(template);

  const children: Record<string, PropertyNode> = {};
  const keys = new Set([...Object.keys(template.children), ...Object.keys(real.children)]);
  for (const key of keys) {
    const templateChild = template.children[key];
    const realChild = real.children[key];
    if (templateChild) {
      children[key] = mergeWithTemplate(realChild, templateChild);
    } else if (realChild) {
      children[key] = realChild;
    }
  }
  return { kind: 'container', wrapping: real.wrapping, children };
}

/**
 * Folds two same-shaped nodes (e.g. the same field from two different
 * presets, or two structurally-identical sibling blocks) into one
 * representative node, used
 * to build canonical templates out of real shipped preset data. Prefers
 * `a`'s own value/shape, but fills in from `b` wherever `a` is missing a
 * child (container) or has an empty/absent value (leaf) that `b` defines.
 */
export function unionTwoNodes(a: PropertyNode | undefined, b: PropertyNode | undefined): PropertyNode | undefined {
  if (!a) return b ? structuredClone(b) : undefined;
  if (!b) return structuredClone(a);

  if (a.kind === 'leaf' || b.kind === 'leaf') {
    if (a.kind === 'leaf' && b.kind === 'leaf') {
      const aEmpty = a.value === undefined || a.value === null;
      const bHasValue = b.value !== undefined && b.value !== null;
      return aEmpty && bHasValue ? b : a;
    }
    // Kind mismatch across sources (rare data inconsistency): prefer `a` deterministically.
    return a;
  }

  const children: Record<string, PropertyNode> = { ...a.children };
  for (const [key, bChild] of Object.entries(b.children)) {
    const merged = unionTwoNodes(a.children[key], bChild);
    if (merged) children[key] = merged;
  }
  return { kind: 'container', wrapping: a.wrapping, children };
}

/** Folds a list of same-shaped nodes into one canonical representative via repeated `unionTwoNodes`. */
export function unionNodes(nodes: Array<PropertyNode | undefined>): PropertyNode | undefined {
  return nodes.reduce<PropertyNode | undefined>((acc, node) => unionTwoNodes(acc, node), undefined);
}

/** Recursively walks a tree (including list-leaf items) and collects every `fontFamily` leaf's family name(s). */
export function collectFontFamiliesFromNode(node: PropertyNode | undefined, out: Set<string> = new Set()): Set<string> {
  if (!node) return out;

  if (isLeaf(node)) {
    if (node.type === 'fontFamily' && Array.isArray(node.value)) {
      for (const family of node.value) {
        if (typeof family === 'string' && family.trim().length > 0) out.add(family.trim());
      }
    }
    if (node.type === 'list' || node.type === 'array') {
      for (const item of parseListItems(node)) collectFontFamiliesFromNode(item, out);
    }
    return out;
  }

  for (const child of Object.values(node.children)) {
    collectFontFamiliesFromNode(child, out);
  }
  return out;
}
