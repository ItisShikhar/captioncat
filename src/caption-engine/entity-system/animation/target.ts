import type { Component } from '../components';
import type { Effect } from '../effects';
import { ReplicatorEffect, isReplicatorCopyPath } from '../effects';
import type { PhysicalEntity } from '../physical-entities';
import type { Property } from '../property';
import { ensureDefaultProperty } from '../property-defaults';
import type { ResolveContext } from '../types';

export interface ResolvedTrackTarget {
  property: Property<unknown>;
  owner: Component | Effect;
  componentAncestors: readonly Component[];
}

function normalizeOwnerType(value: string): string {
  if (!value) return value;
  return value[0].toLowerCase() + value.slice(1);
}

interface ComponentBranch {
  component: Component;
  ancestors: readonly Component[];
}

function collectComponentBranches(
  components: readonly Component[],
  output: ComponentBranch[],
  ancestors: readonly Component[] = [],
): void {
  for (const component of components) {
    output.push({ component, ancestors });
    collectComponentBranches(component.components, output, [...ancestors, component]);
  }
}

function parseTarget(target: string): { ownerType: string; effectId?: string; propertyName: string } | undefined {
  const separator = target.indexOf('.');
  if (separator <= 0 || separator === target.length - 1) return undefined;
  const ownerToken = target.slice(0, separator);
  const idSeparator = ownerToken.indexOf('#');
  const ownerType = idSeparator >= 0 ? ownerToken.slice(0, idSeparator) : ownerToken;
  const effectId = idSeparator >= 0 ? ownerToken.slice(idSeparator + 1) : undefined;
  if (
    !ownerType ||
    effectId === '' ||
    (idSeparator >= 0 && ownerToken.indexOf('#', idSeparator + 1) >= 0)
  ) {
    return undefined;
  }
  return {
    ownerType: normalizeOwnerType(ownerType),
    ...(effectId === undefined ? {} : { effectId }),
    propertyName: target.slice(separator + 1),
  };
}

export function isReplicatorCopyTarget(target: string): boolean {
  const parsed = parseTarget(target);
  return parsed?.ownerType === 'replicator' && isReplicatorCopyPath(parsed.propertyName);
}

function findPropertyFromEffects(
  effects: readonly Effect[],
  ownerType: string,
  effectId: string | undefined,
  propertyName: string,
  componentAncestors: readonly Component[],
): ResolvedTrackTarget | undefined {
  if (effectId === undefined) return undefined;
  const effect = effects.find((candidate) => candidate.type === ownerType && candidate.id === effectId);
  if (!effect) return undefined;
  if (effect instanceof ReplicatorEffect) {
    const property = effect.getVirtualProperty(propertyName) ?? ensureDefaultProperty(effect, propertyName);
    return property ? { property, owner: effect, componentAncestors } : undefined;
  }
  const property = ensureDefaultProperty(effect, propertyName);
  return property ? { property, owner: effect, componentAncestors } : undefined;
}

export function resolveTrackTargetDetails(entity: PhysicalEntity, target: string): ResolvedTrackTarget | undefined {
  const parsed = parseTarget(target);
  if (!parsed) return undefined;
  const { ownerType, effectId, propertyName } = parsed;

  const components: ComponentBranch[] = [];
  collectComponentBranches(entity.components, components);
  const componentBranch =
    effectId === undefined ? components.find((candidate) => candidate.component.type === ownerType) : undefined;
  const componentProperty = componentBranch ? ensureDefaultProperty(componentBranch.component, propertyName) : undefined;
  if (componentBranch && componentProperty) {
    return {
      property: componentProperty,
      owner: componentBranch.component,
      componentAncestors: componentBranch.ancestors,
    };
  }

  const entityEffectProperty = findPropertyFromEffects(entity.effects, ownerType, effectId, propertyName, []);
  if (entityEffectProperty) return entityEffectProperty;
  for (const candidate of components) {
    const effectProperty = findPropertyFromEffects(
      candidate.component.effects,
      ownerType,
      effectId,
      propertyName,
      [...candidate.ancestors, candidate.component],
    );
    if (effectProperty) return effectProperty;
  }
  return undefined;
}

export function isTrackTargetEnabled(target: ResolvedTrackTarget, rctx: ResolveContext): boolean {
  return (
    target.componentAncestors.every((component) => component.isEnabled(rctx)) &&
    target.owner.isEnabled(rctx)
  );
}

export function resolveTrackTarget(entity: PhysicalEntity, target: string): Property<unknown> | undefined {
  return resolveTrackTargetDetails(entity, target)?.property;
}
