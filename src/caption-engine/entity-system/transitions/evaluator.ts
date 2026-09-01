import type { Component } from '../components';
import type { Effect } from '../effects';
import type { PhysicalEntity } from '../physical-entities';
import type { Property } from '../property';
import type { ResolveContext } from '../types';
import { TransitionRuntime } from './runtime';

interface TransitionTarget {
  property: Property<unknown>;
  path: string;
  owner: Component | Effect;
  componentAncestors: readonly Component[];
}

const transitionTargetsByRoot = new WeakMap<PhysicalEntity, TransitionTarget[]>();

function assignTransitionPaths(entity: PhysicalEntity, path = 'root'): void {
  entity.transitionPath = path;
  entity.children.forEach((child, index) => assignTransitionPaths(child, `${path}/child:${index}`));
}

function visitComponent(
  component: Component,
  componentPath: string,
  visitProperty: (
    property: Property<unknown>,
    key: string,
    owner: Component | Effect,
    componentAncestors: readonly Component[],
  ) => void,
  ancestors: readonly Component[] = [],
): void {
  for (const [propertyName, property] of component.props) {
    visitProperty(property, `${componentPath}/property:${propertyName}`, component, ancestors);
  }
  component.components.forEach((child, index) =>
    visitComponent(child, `${componentPath}/component:${child.type}:${index}`, visitProperty, [...ancestors, component]),
  );
  component.effects.forEach((effect, index) =>
    visitEffect(effect, `${componentPath}/effect:${effect.type}:${index}`, visitProperty, [...ancestors, component]),
  );
}

function visitEffect(
  effect: Effect,
  effectPath: string,
  visitProperty: (
    property: Property<unknown>,
    key: string,
    owner: Component | Effect,
    componentAncestors: readonly Component[],
  ) => void,
  componentAncestors: readonly Component[] = [],
): void {
  for (const [propertyName, property] of effect.props) {
    visitProperty(property, `${effectPath}/property:${propertyName}`, effect, componentAncestors);
  }
}

function branchIsEnabled(target: TransitionTarget, rctx: ResolveContext): boolean {
  return (
    target.componentAncestors.every((component) => component.isEnabled(rctx)) &&
    target.owner.isEnabled(rctx)
  );
}

function transitionTimeOf(rctx: ResolveContext): number {
  return rctx.transitionTimeSeconds ?? rctx.triggerTimestampSeconds + rctx.elapsedSeconds;
}

function transitionKeyFor(target: TransitionTarget, path: string): string {
  return target.property.transitionKey ?? path;
}

function transitionTargetsFor(root: PhysicalEntity): TransitionTarget[] {
  const cached = transitionTargetsByRoot.get(root);
  if (cached) return cached;

  assignTransitionPaths(root);
  const targets: TransitionTarget[] = [];
  root.traverse((entity) => {
    const entityPath = entity.transitionPath ?? entity.id;
    entity.components.forEach((component, index) => {
      visitComponent(
        component,
        `${entityPath}/component:${component.type}:${index}`,
        (property, path, owner, componentAncestors) => {
          targets.push({ property, path, owner, componentAncestors });
        },
      );
    });
    entity.effects.forEach((effect, index) => {
      visitEffect(
        effect,
        `${entityPath}/effect:${effect.type}:${index}`,
        (property, path, owner, componentAncestors) => {
          targets.push({ property, path, owner, componentAncestors });
        },
      );
    });
  });
  transitionTargetsByRoot.set(root, targets);
  return targets;
}

export function prepareTransitionContext(root: PhysicalEntity, rctx: ResolveContext): ResolveContext {
  const runtime = rctx.transitionRuntime;
  if (!runtime) return rctx;

  const transitionOverrides = new Map<object, unknown>();
  for (const target of transitionTargetsFor(root)) {
    const { property, path } = target;
    const key = transitionKeyFor(target, path);
    if (rctx.followSnapProperties?.has(property)) {
      runtime.clear(key);
      continue;
    }
    if (!branchIsEnabled(target, rctx)) {
      runtime.clear(key);
      continue;
    }
    const desiredValue = property.desiredValue(rctx);
    if (property.transition?.enabled !== true) {
      runtime.settle(key, property.kind, desiredValue);
      continue;
    }
    const value = runtime.resolve(key, property.kind, desiredValue, property.transition, transitionTimeOf(rctx));
    transitionOverrides.set(property, value);
  }

  return transitionOverrides.size > 0 ? { ...rctx, transitionOverrides } : rctx;
}

export function createTransitionRuntime(): TransitionRuntime {
  return new TransitionRuntime();
}
