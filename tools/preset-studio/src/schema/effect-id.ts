import type { AnimationTrackDoc } from './animation';
import type { EcsComponentDoc, EcsEffectDoc } from './ecs-tree';
import { parseAnimationTarget } from './animation-target';

let fallbackEffectId = 0;

function safeEffectType(effectType: string): string {
  const normalized = effectType.replace(/[^a-zA-Z0-9_-]/g, '-');
  return normalized || 'effect';
}

function randomEffectHash(): string {
  const values = new Uint32Array(2);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(values);
    return Array.from(values, (value) => value.toString(16).padStart(8, '0')).join('');
  }
  fallbackEffectId += 1;
  return `${Date.now().toString(16).slice(-8)}${fallbackEffectId.toString(16).padStart(8, '0')}`;
}

function stableEffectHash(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

function normalizeEffectScope(scope: string): string {
  return scope
    .split(':')
    .map((part) => safeEffectType(part).toLowerCase())
    .filter(Boolean)
    .join(':');
}

export function effectScopeForEntity(entityKind: string, entityId: string): string {
  const state = entityId.includes(':') ? entityId.slice(entityId.lastIndexOf(':') + 1) : 'default';
  return `${normalizeEffectScope(entityKind)}:${normalizeEffectScope(state)}`;
}

export function createEffectId(effectType: string, scope?: string): string {
  const id = `${safeEffectType(effectType)}-${randomEffectHash()}`;
  return scope ? `${id}:${normalizeEffectScope(scope)}` : id;
}

export function createScopedEffectId(effectType: string, scope?: string, sourceId?: string): string {
  if (!scope || !sourceId) return createEffectId(effectType, scope);
  const id = `${safeEffectType(effectType)}-${stableEffectHash(`${effectType}:${scope}:${sourceId}`)}`;
  return `${id}:${normalizeEffectScope(scope)}`;
}

export function displayEffectId(id: string): string {
  const [head, ...scope] = id.split(':');
  const displayHead = head?.replace(/-[0-9a-f]{16}$/i, '') ?? id;
  return [displayHead, ...scope].join(':');
}

export function legacyEffectId(effectType: string, index: number): string {
  return `${safeEffectType(effectType)}-${index + 1}`;
}

export function createEffectIdMap(
  components: readonly EcsComponentDoc[],
  effects: readonly EcsEffectDoc[] = [],
  scope?: string,
  idFactory: (effectType: string, scope?: string, sourceId?: string) => string = createEffectId,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const effect of effects) map.set(effect.id, idFactory(effect.effect, scope, effect.id));
  for (const component of components) {
    for (const effect of component.effects) map.set(effect.id, idFactory(effect.effect, scope, effect.id));
    for (const [key, value] of createEffectIdMap(component.components, [], scope, idFactory)) map.set(key, value);
  }
  return map;
}

export function remapAnimationTarget(target: string, effectIds: ReadonlyMap<string, string>): string {
  const parsed = parseAnimationTarget(target);
  if (!parsed?.effectId) return target;
  const nextEffectId = effectIds.get(parsed.effectId);
  return nextEffectId ? `${parsed.owner}#${nextEffectId}.${parsed.property}` : target;
}

export function remapAnimationTracks(
  tracks: readonly AnimationTrackDoc[],
  effectIds: ReadonlyMap<string, string>,
): AnimationTrackDoc[] {
  return tracks.map((track) => ({
    ...structuredClone(track),
    target: remapAnimationTarget(track.target, effectIds),
  }));
}

export function cloneComponentsWithRemappedEffectIds(
  components: readonly EcsComponentDoc[],
  effectIds: ReadonlyMap<string, string>,
): EcsComponentDoc[] {
  return components.map((component) => ({
    ...structuredClone(component),
    effects: component.effects.map((effect) => ({
      ...structuredClone(effect),
      id: effectIds.get(effect.id) ?? effect.id,
    })),
    components: cloneComponentsWithRemappedEffectIds(component.components, effectIds),
    ...(component.animation
      ? {
          animation: {
            ...structuredClone(component.animation),
            tracks: remapAnimationTracks(component.animation.tracks, effectIds),
          },
        }
      : {}),
  }));
}
