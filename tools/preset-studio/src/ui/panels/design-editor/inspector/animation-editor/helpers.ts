import type {
  AnimatableTargetOption,
  AnimationDoc,
  AnimationKeyframeDoc,
  AnimationPreset,
  AnimationTrackDoc,
  AnimationTrackMode,
  AnimationTrackSampling,
  FieldMeta,
} from '@/schema';
import {
  applyPresetToAnimation,
  CUSTOM_PRESET_ID,
  defaultPresetParameters,
  findAnimationPreset,
  getFieldMeta,
  parseAnimationTarget,
} from '@/schema';
import { humanizeFieldKey } from '@/ui/controls/field-row';
import { interpolatePaint, isPaint, normalizePaint, solidPaint, type PaintCapability } from '@/schema/paint';
import type { SpacerBounds } from '@/ui/controls/spacer-bounds';

export type TrackValueKind = 'number' | 'vector2' | 'paint' | 'other';

export function paintTypeForTrack(track: AnimationTrackDoc): PaintCapability | undefined {
  const keyframe = track.keyframes.find((candidate) => isPaint(candidate.value));
  return keyframe && isPaint(keyframe.value) ? keyframe.value.type : undefined;
}

export function hasMixedPaintTypes(track: AnimationTrackDoc): boolean {
  const types = new Set(track.keyframes.map((keyframe) => keyframe.value).filter(isPaint).map((paint) => paint.type));
  return types.size > 1;
}

export function humanizePreset(id: string): string {
  if (id === CUSTOM_PRESET_ID) return 'Custom';
  return findAnimationPreset(id)?.label ?? humanizeFieldKey(id);
}

/**
 * True once the animation has drifted from what this preset generates at its own default
 * parameter values - the "original preset configuration" is always exactly that (every preset
 * pick/switch seeds tracks from `defaultPresetParameters`), so no separate stored snapshot is
 * needed: recompute it on demand and diff the preset-controlled fields only (phase/duration/
 * parameters/tracks) - `enabled`/`name`/`scope`/`delaySeconds`/`sequencer` are NOT preset output
 * and are deliberately excluded, since they never flip "Modified" on or be touched by Reset.
 */
export function isPresetModified(animation: AnimationDoc, preset: AnimationPreset): boolean {
  const defaults = applyPresetToAnimation(animation, preset, defaultPresetParameters(preset));
  return (
    animation.phase !== defaults.phase ||
    animation.durationSeconds !== defaults.durationSeconds ||
    JSON.stringify(animation.parameters) !== JSON.stringify(defaults.parameters) ||
    JSON.stringify(animation.tracks) !== JSON.stringify(defaults.tracks)
  );
}

function targetOptionFor(target: string, options: readonly AnimatableTargetOption[] | undefined): AnimatableTargetOption | undefined {
  return options?.find((option) => option.target === target);
}

export function humanizeTargetOwner(
  owner: string,
  options?: readonly AnimatableTargetOption[],
): string {
  const ownerLabels = new Set(
    options
      ?.filter((candidate) => {
        const parsed = parseAnimationTarget(candidate.target);
        return parsed?.ownerToken === owner;
      })
      .map((candidate) => candidate.ownerLabel),
  );
  const [ownerLabel] = ownerLabels;
  return humanizeFieldKey(ownerLabels.size === 1 && ownerLabel ? ownerLabel : owner);
}

function humanizeTargetProperty(property: string): string {
  const parts = property.split('.');
  const nestedStart = parts[0] === 'copyOverrides' ? 2 : parts[0]?.startsWith('copy_') ? 1 : -1;
  const visibleParts = nestedStart >= 0 ? parts.slice(nestedStart) : parts;
  return visibleParts.map((part) => humanizeFieldKey(part)).join(' / ');
}

export function humanizeTarget(target: string, options?: readonly AnimatableTargetOption[]): string {
  const parsed = parseAnimationTarget(target);
  if (!parsed) return humanizeFieldKey(target);
  const option = targetOptionFor(target, options);
  return `${humanizeFieldKey(option?.ownerLabel ?? parsed.owner)} \u00b7 ${humanizeTargetProperty(parsed.property)}`;
}

export function humanizeTrack(track: Pick<AnimationTrackDoc, 'target' | 'mode'>, options?: readonly AnimatableTargetOption[]): string {
  return track.mode === 'relative' && track.target === 'Transform.position'
    ? 'Position Offset'
    : humanizeTarget(track.target, options);
}

export function isRelativePositionTrack(track: Pick<AnimationTrackDoc, 'target' | 'mode'>): boolean {
  return track.mode === 'relative' && track.target === 'Transform.position';
}

export function animationTrackOwner(track: Pick<AnimationTrackDoc, 'target'>): string {
  const separator = track.target.indexOf('.');
  return separator > 0 ? track.target.slice(0, separator) : track.target;
}

export const ANIMATION_TRACK_MODES: readonly AnimationTrackMode[] = ['absolute', 'relative'];

/** Only the prop half of a target (e.g. `Transform.scale` -> "Scale") - for use under a group header that already states the owner. */
export function humanizeTargetProp(target: string): string {
  return humanizeTargetProperty(parseAnimationTarget(target)?.property ?? target);
}

/**
 * The SAME per-field min/max/step/unit bounds the component/effect's own editor uses for this
 * leaf (`FIELD_META`, looked up by field key) - a track's Value field must respect whatever
 * bound is already defined once for that prop instead of letting animated values drift out of
 * range (e.g. an opacity track keyframe going to 4 when the live Opacity field caps at 1).
 */
export function fieldMetaForTarget(target: string, spacerBounds?: SpacerBounds): FieldMeta {
  const parsed = parseAnimationTarget(target);
  const meta = getFieldMeta(parsed?.property ?? target);
  if (parsed?.property !== 'spacing') return meta;

  const owner = parsed.owner.toLowerCase();
  const extent =
    owner === 'verticalspacer'
      ? spacerBounds?.vertical
      : owner === 'horizontalspacer'
        ? spacerBounds?.horizontal
        : undefined;
  if (extent === undefined || !Number.isFinite(extent) || extent <= 0) return meta;
  return { ...meta, min: -extent, max: extent };
}

export interface TargetGroup {
  owner: string;
  options: AnimatableTargetOption[];
  ownerLabel?: string;
  groupLabel?: string;
}

/** Groups animatable target options by their owning Component/Effect (the part before the dot), preserving first-seen order - powers the "Add Track" picker's grouped sections, mirroring the Component/Effect grouping in "Add Components and Effects". */
export function groupTargetsByOwner(options: readonly AnimatableTargetOption[]): TargetGroup[] {
  const groups: TargetGroup[] = [];
  const byOwner = new Map<string, TargetGroup>();
  for (const option of options) {
    const owner = parseAnimationTarget(option.target)?.ownerToken ?? option.target;
    const key = `${owner}\u0000${option.groupLabel ?? ''}`;
    let group = byOwner.get(key);
    if (!group) {
      group = { owner, options: [], ownerLabel: option.ownerLabel, groupLabel: option.groupLabel };
      byOwner.set(key, group);
      groups.push(group);
    }
    group.options.push(option);
  }
  return groups;
}

export interface TrackGroup {
  owner: string;
  /** Each track paired with its real index into the animation's `tracks` array - every mutation callback (toggle/remove/drag/...) is keyed by that original index, not the position within the group. */
  entries: { track: AnimationTrackDoc; index: number }[];
}

/** Groups an animation's tracks by owning Component/Effect, same grouping as `groupTargetsByOwner` - powers the tracks drawer's grouped sections. */
export function groupTracksByOwner(tracks: readonly AnimationTrackDoc[]): TrackGroup[] {
  const groups: TrackGroup[] = [];
  const byOwner = new Map<string, { track: AnimationTrackDoc; index: number }[]>();
  tracks.forEach((track, index) => {
    const owner = parseAnimationTarget(track.target)?.ownerToken ?? track.target;
    let list = byOwner.get(owner);
    if (!list) {
      list = [];
      byOwner.set(owner, list);
      groups.push({ owner, entries: list });
    }
    list.push({ track, index });
  });
  return groups;
}

/** A fresh, kind-appropriate keyframe value for a new/appended stop. */
export function defaultValueForKind(kind: TrackValueKind): unknown {
  if (kind === 'vector2') return { x: 0, y: 0 };
  if (kind === 'paint') return solidPaint('#ffffff');
  return 0;
}

function isVector2(value: unknown): value is { x: number; y: number } {
  return !!value && typeof value === 'object' && 'x' in (value as object) && 'y' in (value as object);
}

function lerpValue(from: unknown, to: unknown, t: number, kind: TrackValueKind): unknown {
  if (kind === 'number' && typeof from === 'number' && typeof to === 'number') return from + (to - from) * t;
  if (kind === 'vector2' && isVector2(from) && isVector2(to)) {
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
  }
  if (kind === 'paint' && from && to && typeof from === 'object' && typeof to === 'object') {
    return interpolatePaint(normalizePaint(from, solidPaint('#000000')), normalizePaint(to, solidPaint('#000000')), t);
  }
  // Other non-continuous values snap to whichever endpoint the time is closer to.
  return t < 0.5 ? from : to;
}

/**
 * The value this track currently resolves to at an arbitrary time (linear
 * only, no curve-easing) - used to seed a newly inserted keyframe so it
 * does not visually change the animation until the user adjusts it.
 */
export function interpolatedValueAtTime(keyframes: AnimationKeyframeDoc[], time: number, kind: TrackValueKind): unknown {
  if (keyframes.length === 0) return defaultValueForKind(kind);
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  if (time <= sorted[0].time) return sorted[0].value;
  const last = sorted[sorted.length - 1];
  if (time >= last.time) return last.value;
  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sorted[i];
    const to = sorted[i + 1];
    if (time < from.time || time > to.time) continue;
    const span = to.time - from.time;
    return lerpValue(from.value, to.value, span > 0 ? (time - from.time) / span : 0, kind);
  }
  return last.value;
}

/** Identifies one keyframe across tracks for the cross-track multi-select set. */
export function keyframeKey(trackIndex: number, keyframeIndex: number): string {
  return `${trackIndex}:${keyframeIndex}`;
}

/** Best-known kind for a track: looked up by target, else inferred from its own value shape. */
export function kindForTrack(track: AnimationTrackDoc, known: readonly AnimatableTargetOption[]): TrackValueKind {
  const match = known.find((option) => option.target === track.target);
  if (match) return match.kind;
  const value = track.keyframes[0]?.value;
  if (value && typeof value === 'object' && 'x' in (value as object) && 'y' in (value as object)) return 'vector2';
  if (
    value &&
    typeof value === 'object' &&
    'type' in (value as object) &&
    ['solid', 'linear-gradient', 'radial-gradient'].includes(String((value as { type?: unknown }).type))
  ) {
    return 'paint';
  }
  if (typeof value === 'number') return 'number';
  return 'other';
}

/** Fresh two-keyframe interpolate pair for a newly added (or retargeted) track. */
export function defaultKeyframesForOption(option: AnimatableTargetOption, durationSeconds: number): AnimationKeyframeDoc[] {
  const duration = durationSeconds > 0 ? durationSeconds : 0.3;
  const fromValue = option.kind === 'vector2' || option.kind === 'paint' ? option.defaultValue : 0;
  return [
    { time: 0, value: fromValue, curve: 'easeOut' },
    { time: duration, value: option.defaultValue },
  ];
}

/**
 * Reshapes a track's keyframes when its sampling mode changes, so switching
 * modes never leaves stale time/curve data that the new mode ignores.
 * - `randomRange` keeps only the first/last values as the min/max extremes.
 * - `randomValues` flattens every keyframe into a plain value list (time only
 * orders the list, curve is unused).
 * - `interpolate` spreads times evenly across [0, 1] and restores a curve.
 */
export function convertKeyframesForSampling(
  keyframes: AnimationKeyframeDoc[],
  kind: TrackValueKind,
  sampling: AnimationTrackSampling,
): AnimationKeyframeDoc[] {
  if (sampling === 'randomRange') {
    const first = keyframes[0]?.value ?? defaultValueForKind(kind);
    const last = keyframes[keyframes.length - 1]?.value ?? defaultValueForKind(kind);
    return [
      { time: 0, value: first },
      { time: 1, value: last },
    ];
  }
  if (sampling === 'randomValues') {
    return keyframes.length > 0
      ? keyframes.map((keyframe, index) => ({ time: index, value: keyframe.value }))
      : [{ time: 0, value: defaultValueForKind(kind) }];
  }
  return keyframes.map((keyframe, index) => ({
    ...keyframe,
    time: keyframes.length > 1 ? index / (keyframes.length - 1) : 0,
    curve: keyframe.curve ?? 'easeOut',
  }));
}
