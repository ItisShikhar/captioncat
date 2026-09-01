import type { CanvasRenderingContext2D as SkiaContext2D } from '#platform/canvas.js';
import type { Canvas } from '#platform/canvas.js';
import type { Paint } from './paint-types';
import type { Effect } from './effects/effect';
import type { BlendMode } from './effects/blend-mode';
import type { ImageColorMode } from './components/image-style';
import type { TransitionRuntime } from './transitions/runtime';
import type { FollowRuntime } from './follow/runtime';
import type { ResolvedTextDirection } from './text-direction';
import type { RowFontFitPolicy } from './row-fitting';
import type { RelativeState } from '../preview-types';
import { CAPTION_EVENT_TRIGGERS, type CaptionEventTrigger } from './caption-event-types';
export type { RelativeState, StateTemplateKey, WordState } from '../preview-types';
export type { DistanceUnit, RandomizerRange, VectorRange } from './value-types';
export type { CaptionEventTrigger } from './caption-event-types';

/**
 * Shared primitives for the entity-component-system. This module is the
 * class-based model used by the ECS caption-rendering pipeline.
 */

/** A 2D vector in the ECS runtime - always an object, never a tuple (matches the on-disk `{x,y}` preset shape, so there is no tuple<->object conversion anywhere). */
export interface Vector2 {
  x: number;
  y: number;
}

/** Resolve a vector leaf to a finite `Vector2` object. */
export function toVec2(value: unknown): Vector2 {
  if (value && typeof value === 'object' && 'x' in value && 'y' in value) {
    const vector = value as { x: unknown; y: unknown };
    return { x: Number(vector.x) || 0, y: Number(vector.y) || 0 };
  }
  return { x: 0, y: 0 };
}

export function zeroVec(): Vector2 {
  return { x: 0, y: 0 };
}

export interface Margins {
  x: number;
  y: number;
}

/** An axis-aligned box in the entity's local space (top-left origin). */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function zeroMargins(): Margins {
  return { x: 0, y: 0 };
}

export function addMargins(a: Margins, b: Margins): Margins {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function maxMargins(a: Margins, b: Margins): Margins {
  return { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) };
}

/**
 * A word's lifecycle position relative to the current word.
 * `incoming` = the current word (blends next->current), `outgoing` = the word
 * that became previous (blends current->previous), `static` = everyone else.
 */
export type WordLifecycle = 'static' | 'incoming' | 'outgoing';

/**
 * A row's state relative to the current word. `default` is the base template row
 * (carries the word-role templates, options, and base background). The past,
 * previous, current, next, and future rows carry only the per-state row background that merges over
 * the base one. `instantiateScene` picks the matching state row per real row.
 */
export type RowState = RelativeState | 'default';

export { CAPTION_EVENT_TRIGGERS };

/**
 * Everything needed to resolve a `Property` (or an entity/component) to a
 * concrete value at one instant, for one live instance. Replaces the grab-bag
 * of positional args (`animationProgressValue`, `randomizerCache`,
 * `wordDurationSeconds`,...) threaded through the legacy `drawCaption`.
 */
export interface ResolveContext {
  /** Entry-burst progress, 0 = burst start, 1 = settled. Clamped by consumers. */
  progress: number;
  /** Monotonic frame index. Per-frame randomizers use it to choose new values. */
  frameIndex: number;
  /** Composition units to output pixels. Raster effects use this for spatial values. */
  compositionScale: number;
  /** Current word duration (seconds), available to time-aware consumers. */
  wordDurationSeconds: number | undefined;
  /** Full duration of the row containing the current word, when available. */
  rowDurationSeconds?: number;
  /** Seconds since the current word became current (drives cross-state blend). */
  elapsedSeconds: number;
  /** Seconds since the previous rendered frame, used by stateful motion systems. */
  deltaSeconds?: number;
  /** Timestamp of the current generic trigger/event. */
  triggerTimestampSeconds: number;
  /** Interval since the previous generic trigger/event, if one exists. */
  triggerIntervalSeconds?: number;
  /** Interval until the next generic trigger/event, if one exists. */
  nextTriggerIntervalSeconds?: number;
  /** Monotonic generic trigger/event index for event-driven components. */
  triggerIndex: number;
  /** Per-component trigger state for event-driven Image Sequencers. */
  imageSequencerTriggerStates?: ReadonlyMap<object, ImageSequencerTriggerState>;
  /** Trigger indexes for property randomizers using caption events. */
  randomizerTriggerIndexes?: Readonly<Record<CaptionEventTrigger, number>>;
  /** This entity's lifecycle position. `Word.contextFor` sets it per word. */
  lifecycle: WordLifecycle;
  /** Resolved text direction for this render. */
  textDirection: ResolvedTextDirection;
  /** Runtime row-wide scale applied to authored Font sizes. */
  fontScale?: number;
  /** Runtime row-fitting policy used while measuring caption rows. */
  rowFontFit?: RowFontFitPolicy;
  /** Frame-local letter spacing used when a single word is justified by layout. */
  letterSpacingOverride?: number;
  /** Stable absolute index used by entity-local visual patterns. */
  patternIndex?: number;
  /** Stable identity used by deterministic per-entity randomizers. */
  randomizerKey?: string;
  /** Receives standalone Blend Mode layers for compositing against the video frame. */
  blendModeLayerCollector?: (mode: BlendMode, layer: Canvas) => void;
  /** Stable identity of the owning Row for row-scoped randomizers. */
  rowRandomizerKey?: string;
  /** Stable identity of the owning Page for page-scoped randomizers. */
  pageRandomizerKey?: string;
  /** Monotonic appearance/event index used by per-appearance randomizers. */
  randomizerAppearanceIndex?: number;
  /** Frame-local values produced by first-class Animation component tracks. */
  animationOverrides?: ReadonlyMap<object, unknown>;
  /** Frame-local position offsets produced by relative Animation tracks. */
  relativeAnimationOffsets?: ReadonlyMap<object, Vector2>;
  /** Frame-local values produced by the generic property transition system. */
  transitionOverrides?: ReadonlyMap<object, unknown>;
  /** Frame-local visual values from a state style layer. */
  styleOverrides?: ReadonlyMap<object, unknown>;
  /** Desired values produced by generic FollowTarget bindings. */
  followOverrides?: ReadonlyMap<object, unknown>;
  /** Properties whose FollowTarget mappings must bypass the generic transition runtime at a selected target boundary. */
  followSnapProperties?: ReadonlySet<object>;
  /** Persistent value history used by delayed FollowTarget bindings. */
  followRuntime?: FollowRuntime;
  /** Persistent runtime state for reactive property transitions. */
  transitionRuntime?: TransitionRuntime;
  /** Monotonic time used by transition runtime evaluation. */
  transitionTimeSeconds?: number;
}

export interface ImageSequencerTriggerState {
  index: number;
  elapsedSeconds: number;
  framePosition?: number;
  advance?: 'next' | 'previous' | 'random' | 'none';
}

export function defaultResolveContext(overrides: Partial<ResolveContext> = {}): ResolveContext {
  return {
    progress: 1,
    frameIndex: 0,
    compositionScale: 1,
    wordDurationSeconds: undefined,
    elapsedSeconds: 0,
    deltaSeconds: 1 / 60,
    triggerTimestampSeconds: 0,
    triggerIndex: 0,
    lifecycle: 'static',
    textDirection: 'ltr',
    ...overrides,
  };
}

export function compositionScaleOf(ctx: Pick<ResolveContext, 'compositionScale'>): number {
  return Number.isFinite(ctx.compositionScale) && ctx.compositionScale > 0 ? ctx.compositionScale : 1;
}

export type PropertyKind =
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

/** The 2D surface the ECS paints onto (type-only alias for skia's context). */
export type CanvasContext2D = SkiaContext2D;

/**
 * What a component learns about the entity it is painting for. Only the fields
 * a component needs to render itself live here (currently only the word glyph
 * string). It avoids importing `PhysicalEntity` to keep the
 * component/entity modules free of a circular dependency.
 */
export interface PaintOwner {
  kind: string;
  text?: string | undefined;
  textBaselineOffset?: number | null | undefined;
  box?: Box | null | undefined;
  resolvedPaint?: Paint | undefined;
  imageColorMode?: ImageColorMode | undefined;
  imageAssetOverride?: string | undefined;
  imageSupersampleScale?: number | undefined;
  opacity?: number | undefined;
  effects?: readonly Effect[] | undefined;
  effectsContext?: ResolveContext | undefined;
}
