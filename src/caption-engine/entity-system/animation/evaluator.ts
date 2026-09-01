import { AnimationComponent } from '../components/animation';
import { ReplicatorEffect } from '../effects';
import type { PhysicalEntity } from '../physical-entities';
import { Page, Row, Word } from '../physical-entities';
import { toVec2, type ResolveContext, type Vector2 } from '../types';
import { sequenceDelay } from './sequencer';
import { isReplicatorCopyTarget, isTrackTargetEnabled, resolveTrackTargetDetails } from './target';
import { sampleTrack } from './track';
import { resolveAdaptiveTiming } from './adaptive-timing';
import type {
  AnimationDefinition,
  AnimationLifecycleScheduling,
  AnimationPlaybackMode,
  AnimationScope,
} from './types';

function descendantsOf(entity: PhysicalEntity): PhysicalEntity[] {
  const descendants: PhysicalEntity[] = [];
  for (const child of entity.children) {
    descendants.push(child, ...descendantsOf(child));
  }
  return descendants;
}

function targetsFor(entity: PhysicalEntity, scope: AnimationScope): PhysicalEntity[] {
  if (scope === 'self') return [entity];
  if (scope === 'children') return [...entity.children];
  return descendantsOf(entity);
}

function effectiveDuration(animation: AnimationDefinition): number {
  let duration = Math.max(0, animation.durationSeconds);
  for (const track of animation.tracks) {
    for (const keyframe of track.keyframes) duration = Math.max(duration, keyframe.time);
  }
  return duration;
}

function configuredDuration(animation: AnimationDefinition): number {
  return effectiveDuration(animation);
}

function animationCompletionSeconds(animation: AnimationDefinition, owner: PhysicalEntity): number {
  const targetCount = targetsFor(owner, animation.scope).length;
  let maxSequenceDelay = 0;
  for (let targetIndex = 0; targetIndex < targetCount; targetIndex += 1) {
    maxSequenceDelay = Math.max(maxSequenceDelay, sequenceDelay(animation.sequencer, targetIndex, targetCount));
  }
  return Math.max(0, animation.delaySeconds) + configuredDuration(animation) + maxSequenceDelay;
}

function animationDefinitionsFor(entity: PhysicalEntity): AnimationDefinition[] {
  const definitions: AnimationDefinition[] = [];
  const visit = (components: PhysicalEntity['components']): void => {
    for (const component of components) {
      if (component instanceof AnimationComponent) definitions.push(component.definition);
      visit(component.components);
    }
  };
  visit(entity.components);
  return definitions;
}

function entryCompletionSeconds(entity: PhysicalEntity): number {
  return Math.max(
    0,
    ...animationDefinitionsFor(entity)
      .filter((candidate) => candidate.phase === 'enter' && candidate.enabled)
      .map((candidate) => animationCompletionSeconds(candidate, entity)),
  );
}

function phaseCompletionSeconds(entity: PhysicalEntity, phase: AnimationDefinition['phase']): number {
  return Math.max(
    0,
    ...animationDefinitionsFor(entity)
      .filter((candidate) => candidate.phase === phase && candidate.enabled)
      .map((candidate) => animationCompletionSeconds(candidate, entity)),
  );
}

function lifecycleSchedulingFor(entity: PhysicalEntity): AnimationLifecycleScheduling {
  return animationDefinitionsFor(entity).some(
    (candidate) => candidate.enabled && candidate.lifecycleScheduling === 'sequential',
  )
    ? 'sequential'
    : 'overlap';
}

function lifecycleScaleFor(entity: PhysicalEntity, rctx: ResolveContext): number {
  if (!(entity instanceof Row) || lifecycleSchedulingFor(entity) !== 'sequential') return 1;
  const animations = animationDefinitionsFor(entity).filter(
    (candidate) => candidate.enabled && candidate.phase !== 'custom',
  );
  if (!animations.some((candidate) => candidate.triggerBehavior === 'adaptive')) return 1;
  const configuredTotal =
    phaseCompletionSeconds(entity, 'enter') +
    phaseCompletionSeconds(entity, 'active') +
    phaseCompletionSeconds(entity, 'exit');
  const rowDuration = rctx.rowDurationSeconds;
  if (!(configuredTotal > 0) || !(rowDuration !== undefined && rowDuration > 0)) return 1;
  return Math.min(1, rowDuration / configuredTotal);
}

function sequentialPhaseStartSeconds(animation: AnimationDefinition, owner: PhysicalEntity): number {
  if (animation.phase === 'active') return phaseCompletionSeconds(owner, 'enter');
  if (animation.phase === 'exit') {
    return phaseCompletionSeconds(owner, 'enter') + phaseCompletionSeconds(owner, 'active');
  }
  return 0;
}

export function animationDurationForEntity(entity: PhysicalEntity): number {
  let entryDuration = 0;
  let activeDuration = 0;
  let exitDuration = 0;
  let customDuration = 0;

  for (const animation of animationDefinitionsFor(entity)) {
    if (!animation.enabled) continue;
    const duration = animationCompletionSeconds(animation, entity);
    if (animation.phase === 'enter') {
      entryDuration = Math.max(entryDuration, duration);
    } else if (animation.phase === 'active') {
      activeDuration = Math.max(activeDuration, duration);
    } else if (animation.phase === 'exit') {
      exitDuration = Math.max(exitDuration, duration);
    } else {
      customDuration = Math.max(customDuration, duration);
    }
  }

  return lifecycleSchedulingFor(entity) === 'sequential'
    ? Math.max(customDuration, entryDuration + activeDuration + exitDuration)
    : Math.max(customDuration, entryDuration + activeDuration, exitDuration);
}

function playbackElapsed(
  elapsedSeconds: number,
  duration: number,
  playbackMode: AnimationPlaybackMode,
): number {
  const positive = Math.max(0, elapsedSeconds);
  if (!(duration > 0) || playbackMode === 'once') return positive;
  if (playbackMode === 'loop') return positive % duration;
  const cycle = duration * 2;
  const cycleTime = positive % cycle;
  return cycleTime <= duration ? cycleTime : cycle - cycleTime;
}

function effectiveAnimationTiming(
  animation: AnimationDefinition,
  rctx: ResolveContext,
): { delay: number; duration: number } {
  const configuredDelay = Math.max(0, animation.delaySeconds);
  const configured = configuredDuration(animation);
  if (animation.triggerBehavior !== 'adaptive' || rctx.triggerIntervalSeconds === undefined) {
    return { delay: configuredDelay, duration: configured };
  }
  const timing = resolveAdaptiveTiming(configured, configuredDelay, rctx.triggerIntervalSeconds);
  return { delay: timing.delaySeconds, duration: timing.durationSeconds };
}

/**
 * Word/Row/Page each have a real incoming/outgoing/static lifecycle of their
 * own (set by `instantiateScene` - a word enters/exits per current word, a row
 * per its own word range, a page per the page's whole word range). Everything
 * else (Viewport/Video/CompositionArea) has no natural "not yet"/"recently"
 * state - it is present for the entity's whole render call - UNLESS it opts
 * into a boundary via a `lifecycle` component's `persistAcrossVideo` flag
 * (set by the pipeline to the video's own first/last render event. See
 * `pipeline.ts`), in which case it behaves the same way.
 */
function hasOwnLifecycle(entity: PhysicalEntity): boolean {
  if (entity instanceof Word || entity instanceof Row || entity instanceof Page) return true;
  const options = entity.components.find((component) => component.type === 'lifecycle');
  return options?.getProp<boolean>('persistAcrossVideo')?.base === true;
}

function animationClock(
  animation: AnimationDefinition,
  entity: PhysicalEntity,
  owner: PhysicalEntity,
  rctx: ResolveContext,
  delay: number,
): { elapsedSeconds: number; duration: number; timeScale: number } | undefined {
  const sequential = animation.phase !== 'custom' && lifecycleSchedulingFor(owner) === 'sequential';
  const lifecycleScale = sequential ? lifecycleScaleFor(owner, rctx) : 1;
  const timing = sequential
    ? {
        delay: Math.max(0, animation.delaySeconds) * lifecycleScale,
        duration: configuredDuration(animation) * lifecycleScale,
      }
    : effectiveAnimationTiming(animation, rctx);
  const duration = timing.duration;
  const configured = configuredDuration(animation);
  const timeScale = configured > 0 ? duration / configured : 1;
  const animationTime = sequential
    ? rctx.triggerTimestampSeconds + rctx.elapsedSeconds
    : animation.triggerBehavior === 'continue'
      ? rctx.triggerTimestampSeconds + rctx.elapsedSeconds
      : rctx.elapsedSeconds;
  const phaseStart = sequential
    ? sequentialPhaseStartSeconds(animation, owner) * lifecycleScale
    : animation.phase === 'active'
      ? entryCompletionSeconds(owner)
      : 0;
  const lifecycleStart = entity.lifecycleStartTimestampSeconds ?? 0;
  const elapsed = sequential
    ? animationTime - lifecycleStart - phaseStart - timing.delay - delay * lifecycleScale
    : animationTime - phaseStart - timing.delay - delay;
  const lifecycle = hasOwnLifecycle(entity) ? entity.lifecycle : undefined;

  if (animation.phase === 'exit') {
    return lifecycle === 'outgoing' ? { elapsedSeconds: Math.max(0, elapsed), duration, timeScale } : undefined;
  }
  if (animation.phase === 'active') {
    if (
      hasOwnLifecycle(entity) &&
      (sequential ? entity.lifecycle === 'outgoing' : entity.lifecycle !== 'incoming')
    ) {
      return undefined;
    }
    if (elapsed < 0) return undefined;
    return {
      elapsedSeconds: playbackElapsed(elapsed, duration, animation.playbackMode),
      duration,
      timeScale,
    };
  }
  if (animation.phase === 'enter') {
    if (lifecycle === undefined) return { elapsedSeconds: Math.max(0, elapsed), duration, timeScale };
    if (sequential && lifecycle === 'outgoing') return { elapsedSeconds: duration, duration, timeScale };
    return {
      elapsedSeconds: sequential || lifecycle === 'incoming' ? Math.max(0, elapsed) : duration,
      duration,
      timeScale,
    };
  }
  return { elapsedSeconds: Math.max(0, elapsed), duration, timeScale };
}

function hashTarget(target: string): number {
  let hash = 2166136261;
  for (let index = 0; index < target.length; index++) {
    hash ^= target.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function evaluateAnimation(
  animation: AnimationDefinition,
  owner: PhysicalEntity,
  rctx: ResolveContext,
  overrides: Map<object, unknown>,
  relativeOffsets: Map<object, Vector2>,
  copyTargetsOnly: boolean,
): void {
  if (!animation.enabled) return;
  if (!animationHasEnabledTarget(animation, owner, rctx)) return;
  const targets = targetsFor(owner, animation.scope);
  for (let targetIndex = 0; targetIndex < targets.length; targetIndex++) {
    const target = targets[targetIndex];
    const delay = sequenceDelay(animation.sequencer, targetIndex, targets.length);
    const clock = animationClock(animation, target, owner, rctx, delay);
    if (clock === undefined) continue;
    for (const track of animation.tracks) {
      if (!track.enabled) continue;
      if (isReplicatorCopyTarget(track.target) !== copyTargetsOnly) continue;
      if (track.mode === 'relative' && track.target !== 'Transform.position') {
        throw new Error('Relative animation tracks must target Transform.position.');
      }
      const resolvedTarget = resolveTrackTargetDetails(target, track.target);
      if (!resolvedTarget) {
        if (track.mode === 'relative') {
          throw new Error(`Relative animation target "${track.target}" could not be resolved on "${target.id}".`);
        }
        continue;
      }
      if (!isTrackTargetEnabled(resolvedTarget, rctx)) continue;
      const property = resolvedTarget.property;
      const value = sampleTrack(track, property, {
        elapsedSeconds: clock.elapsedSeconds,
        durationSeconds: clock.duration,
        frameIndex: rctx.frameIndex,
        seed: animation.sequencer.seed + targetIndex * 31 + hashTarget(track.target),
        timeScale: clock.timeScale,
      });
      if (track.mode === 'relative') {
        if (property.kind !== 'vector2') {
          throw new Error('Relative animation tracks must target Transform.position with vector2 keyframes.');
        }
        const current = relativeOffsets.get(target) ?? { x: 0, y: 0 };
        const offset = toVec2(value);
        relativeOffsets.set(target, { x: current.x + offset.x, y: current.y + offset.y });
        continue;
      }
      overrides.set(property, value);
    }
  }
}

export function animationHasEnabledTarget(
  animation: AnimationDefinition,
  owner: PhysicalEntity,
  rctx: ResolveContext,
): boolean {
  if (!animation.enabled) return false;
  let resolvedTarget = false;
  for (const target of targetsFor(owner, animation.scope)) {
    for (const track of animation.tracks) {
      if (!track.enabled) continue;
      const resolved = resolveTrackTargetDetails(target, track.target);
      if (!resolved) continue;
      resolvedTarget = true;
      if (isTrackTargetEnabled(resolved, rctx)) return true;
    }
  }
  return !resolvedTarget;
}

function prepareReplicatorEffects(entity: PhysicalEntity, rctx: ResolveContext): void {
  for (const effect of entity.effects) {
    if (effect instanceof ReplicatorEffect && effect.isEnabled(rctx)) effect.prepareVirtualCopies(rctx);
  }
  const visitComponents = (components: PhysicalEntity['components'], parentEnabled = true): void => {
    for (const component of components) {
      const componentEnabled = parentEnabled && component.isEnabled(rctx);
      if (componentEnabled) {
        for (const effect of component.effects) {
          if (effect instanceof ReplicatorEffect && effect.isEnabled(rctx)) effect.prepareVirtualCopies(rctx);
        }
      }
      visitComponents(component.components, componentEnabled);
    }
  };
  visitComponents(entity.components);
  for (const child of entity.children) prepareReplicatorEffects(child, rctx);
}

function visitAnimationComponents(
  components: PhysicalEntity['components'],
  rctx: ResolveContext,
  visit: (component: AnimationComponent) => void,
  parentEnabled = true,
): void {
  for (const component of components) {
    const componentEnabled = parentEnabled && component.isEnabled(rctx);
    if (component instanceof AnimationComponent && componentEnabled) visit(component);
    visitAnimationComponents(component.components, rctx, visit, componentEnabled);
  }
}

export function prepareAnimationContext(root: PhysicalEntity, rctx: ResolveContext): ResolveContext {
  const overrides = new Map<object, unknown>();
  const relativeOffsets = new Map<object, Vector2>();
  root.traverse((entity) => {
    visitAnimationComponents(entity.components, rctx, (component) =>
      evaluateAnimation(component.definition, entity, rctx, overrides, relativeOffsets, false),
    );
  });
  const patternContext =
    overrides.size > 0 || relativeOffsets.size > 0
      ? { ...rctx, animationOverrides: overrides, relativeAnimationOffsets: relativeOffsets }
      : rctx;
  prepareReplicatorEffects(root, patternContext);
  root.traverse((entity) => {
    visitAnimationComponents(entity.components, patternContext, (component) =>
      evaluateAnimation(component.definition, entity, patternContext, overrides, relativeOffsets, true),
    );
  });
  return patternContext;
}

export function relativeAnimationOffsetFor(entity: PhysicalEntity, rctx: ResolveContext): Vector2 {
  const offset = rctx.relativeAnimationOffsets?.get(entity);
  return offset ? { x: offset.x, y: offset.y } : { x: 0, y: 0 };
}