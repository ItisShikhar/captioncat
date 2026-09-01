import type { EcsComponentDoc, EcsEffectDoc, EcsEntityDoc, PropertyNode } from '@/schema';
import { parseAnimationTarget } from '@/schema';
import type { DisabledObjectType } from '@/ui/controls/disabled-state-labels';
import { findComponentByType } from '../entity-tree';

export const DISABLED_DEPENDENCY_OPACITY = 0.55;

function explicitlyDisabled(props: Record<string, PropertyNode>): boolean {
  const enabled = props.enabled;
  return enabled?.kind === 'leaf' && enabled.type === 'boolean' && enabled.value === false;
}

export function isComponentDisabled(component: EcsComponentDoc): boolean {
  return explicitlyDisabled(component.props);
}

export function isComponentDisabledByDependency(
  component: EcsComponentDoc,
  components: readonly EcsComponentDoc[],
  visited = new Set<EcsComponentDoc>(),
): boolean {
  if (visited.has(component)) return false;
  visited.add(component);
  const parentType = component.attachedTo ?? component.dependencyOf;
  if (!parentType) return false;
  const parent = findComponentByType(components, parentType);
  return parent ? isComponentDisabled(parent) || isComponentDisabledByDependency(parent, components, visited) : false;
}

export function isEffectDisabled(effect: EcsEffectDoc): boolean {
  return explicitlyDisabled(effect.props);
}

export function disabledTypeForEffect(
  component: EcsComponentDoc,
  effect: EcsEffectDoc,
  componentDisabled = isComponentDisabled(component),
  effects: readonly EcsEffectDoc[] = [],
): DisabledObjectType | null {
  const checks: readonly [boolean, DisabledObjectType][] = [
    [componentDisabled, 'component'],
    [isEffectDisabledByDependency(effect, effects), 'effect'],
    [isEffectDisabled(effect), 'effect'],
  ];
  return checks.find(([disabled]) => disabled)?.[1] ?? null;
}

export function isEffectDisabledByDependency(
  effect: EcsEffectDoc,
  effects: readonly EcsEffectDoc[],
  visited = new Set<string>(),
): boolean {
  if (!effect.dependencyOf) return false;
  if (visited.has(effect.id)) return true;
  visited.add(effect.id);
  const parent = effects.find((candidate) => candidate.id === effect.dependencyOf);
  return parent ? isEffectDisabled(parent) || isEffectDisabledByDependency(parent, effects, visited) : true;
}

function collectComponents(components: readonly EcsComponentDoc[], output: EcsComponentDoc[]): void {
  for (const component of components) {
    output.push(component);
    collectComponents(component.components, output);
  }
}

function collectEffects(entity: EcsEntityDoc): EcsEffectDoc[] {
  const effects = [...entity.effects];
  const components: EcsComponentDoc[] = [];
  collectComponents(entity.components, components);
  for (const component of components) effects.push(...component.effects);
  return effects;
}

export function animationTargetOwner(target: string): string {
  const separator = target.indexOf('.');
  return separator > 0 ? target.slice(0, separator) : target;
}

/** Returns true when a track owner currently has an explicit disabled toggle. */
export function animationTargetOwnerDisabledType(entity: EcsEntityDoc, owner: string): DisabledObjectType | null {
  const parsed = parseAnimationTarget(`${owner}.value`);
  if (!parsed) return null;
  const ownerType = parsed.owner[0]?.toLowerCase() + parsed.owner.slice(1);
  const components: EcsComponentDoc[] = [];
  collectComponents(entity.components, components);
  const component = components.find((candidate) => parsed.effectId === undefined && candidate.component === ownerType);
  if (component) return isComponentDisabled(component) ? 'component' : null;

  const effect = collectEffects(entity).find(
    (candidate) =>
      parsed.effectId !== undefined && candidate.effect === ownerType && candidate.id === parsed.effectId,
  );
  return effect && isEffectDisabled(effect) ? 'effect' : null;
}

export function isAnimationTargetOwnerDisabled(entity: EcsEntityDoc, owner: string): boolean {
  return animationTargetOwnerDisabledType(entity, owner) !== null;
}
