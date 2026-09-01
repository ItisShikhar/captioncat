import type { Property } from '../property';
import { applyAnimationCurve } from './curve';
import { interpolateAnimationValue, normalizeAnimationValue } from './interpolate';
import type { AnimationKeyframe, AnimationTrackDefinition } from './types';

export interface TrackSampleContext {
  elapsedSeconds: number;
  durationSeconds: number;
  frameIndex: number;
  seed: number;
  timeScale?: number;
}

function sortedKeyframes(track: AnimationTrackDefinition, timeScale: number): AnimationKeyframe[] {
  return track.keyframes
    .filter((keyframe) => Number.isFinite(keyframe.time))
    .map((keyframe) => ({ ...keyframe, time: keyframe.time * timeScale }))
    .sort((first, second) => first.time - second.time);
}

function randomUnit(seed: number): number {
  let value = seed | 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 0x1_0000_0000;
}

function randomSeed(context: TrackSampleContext, updateEveryFrame: boolean): number {
  return context.seed + (updateEveryFrame ? context.frameIndex * 0x9e3779b1 : 0);
}

function sampleRandom(
  frames: AnimationKeyframe[],
  property: Property<unknown>,
  track: AnimationTrackDefinition,
  context: TrackSampleContext,
): unknown {
  if (frames.length === 0) return property.base;
  const roll = randomUnit(randomSeed(context, track.updateEveryFrame === true));
  if (track.sampling === 'randomRange' && frames.length >= 2) {
    const from = normalizeAnimationValue(frames[0].value, property.kind);
    const to = normalizeAnimationValue(frames[frames.length - 1].value, property.kind);
    return interpolateAnimationValue(from, to, roll, property.kind);
  }
  const index = Math.min(frames.length - 1, Math.floor(roll * frames.length));
  return normalizeAnimationValue(frames[index].value, property.kind);
}

export function sampleTrack(
  track: AnimationTrackDefinition,
  property: Property<unknown>,
  context: TrackSampleContext,
): unknown {
  const frames = sortedKeyframes(track, context.timeScale ?? 1);
  if (track.sampling === 'randomValues' || track.sampling === 'randomRange') {
    return sampleRandom(frames, property, track, context);
  }
  if (frames.length === 0) return property.base;

  const elapsed = Math.min(context.durationSeconds, Math.max(0, context.elapsedSeconds));
  if (elapsed <= frames[0].time) return normalizeAnimationValue(frames[0].value, property.kind);
  if (elapsed >= frames[frames.length - 1].time) {
    return normalizeAnimationValue(frames[frames.length - 1].value, property.kind);
  }

  for (let index = 0; index < frames.length - 1; index++) {
    const first = frames[index];
    const second = frames[index + 1];
    if (elapsed < first.time || elapsed > second.time) continue;
    const span = second.time - first.time;
    const linear = span > 0 ? (elapsed - first.time) / span : 1;
    const progress = applyAnimationCurve(linear, first.curve);
    return interpolateAnimationValue(
      normalizeAnimationValue(first.value, property.kind),
      normalizeAnimationValue(second.value, property.kind),
      progress,
      property.kind,
    );
  }
  return property.base;
}