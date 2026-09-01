import { FollowTarget } from '../components';
import type { PhysicalEntity } from '../physical-entities';
import type { Property } from '../property';
import type { ResolveContext } from '../types';
import type { Vector2 } from '../types';
import { applyFollowValue, resolveFollowDestination } from './destinations';
import { resolveFollowSource } from './sources';
import {
  followTargetIdentity,
  followTargetPageIdentity,
  followTargetParentIdentity,
  resolveFollowMode,
  resolveFollowTarget,
} from './targets';
import type { FollowTargetConfig } from './types';

interface PendingFollowValue {
  key: string;
  targetIdentity: string;
  parentIdentity: string | undefined;
  pageIdentity: string | undefined;
  value: unknown;
  delaySeconds: number;
  boundaryHandoff: FollowTargetConfig['boundaryHandoff'];
  transitionScope: FollowTargetConfig['transitionScope'];
}

function setFollowOverride(
  overrides: Map<Property<unknown>, PendingFollowValue>,
  property: Property<unknown>,
  value: unknown,
  axis: 'x' | 'y' | undefined,
  offset: number | undefined,
  destinationPath: string,
  key: string,
  targetIdentity: string,
  parentIdentity: string | undefined,
  pageIdentity: string | undefined,
  delaySeconds: number,
  boundaryHandoff: FollowTargetConfig['boundaryHandoff'],
  transitionScope: FollowTargetConfig['transitionScope'],
): void {
  const pending = overrides.get(property);
  const current = pending?.value ?? property.resolvedValue;
  overrides.set(property, {
    key,
    targetIdentity,
    parentIdentity,
    pageIdentity,
    delaySeconds,
    value: applyFollowValue(current, value, axis, offset, destinationPath),
    boundaryHandoff,
    transitionScope,
  });
}

function walk(
  root: PhysicalEntity,
  entity: PhysicalEntity,
  parent: PhysicalEntity | undefined,
  rctx: ResolveContext,
  overrides: Map<Property<unknown>, PendingFollowValue>,
): void {
  const component = entity.getComponent<FollowTarget>('followTarget');
  if (component) {
    const config = component.resolveConfig(rctx);
    const target = resolveFollowTarget(root, parent, config, rctx);
    if (target) {
      const mode = resolveFollowMode(config, target);
      const targetIdentity = followTargetIdentity(target);
      const parentIdentity = followTargetParentIdentity(root, target);
      const pageIdentity = followTargetPageIdentity(root, target);
      for (const mapping of config.mappings) {
        const destination = resolveFollowDestination(entity, mapping.destination);
        if (!destination) continue;
        const source = resolveFollowSource(target, mapping.source, config.anchor, rctx);
        if (source === undefined) continue;
        setFollowOverride(
          overrides,
          destination.property,
          source,
          destination.axis,
          mapping.offset,
          mapping.destination,
          `${mode}:${entity.debugSourceId ?? entity.id}:${mapping.destination}`,
          targetIdentity,
          parentIdentity,
          pageIdentity,
          config.delaySeconds,
          config.boundaryHandoff,
          config.transitionScope,
        );
      }
    }
  }
  for (const child of entity.children) walk(root, child, entity, rctx, overrides);
}

export function prepareFollowContext(root: PhysicalEntity, rctx: ResolveContext): ResolveContext {
  const pending = new Map<Property<unknown>, PendingFollowValue>();
  walk(root, root, undefined, rctx, pending);
  const followOverrides = new Map<object, unknown>();
  const followSnapProperties = new Set<object>();
  const timeSeconds = rctx.transitionTimeSeconds ?? rctx.triggerTimestampSeconds + rctx.elapsedSeconds;
  for (const [property, binding] of pending) {
    const boundaries = rctx.followRuntime?.boundariesAt(
      binding.key,
      binding.targetIdentity,
      binding.parentIdentity,
      binding.pageIdentity,
      timeSeconds,
    ) ?? { targetBoundary: true, parentBoundary: true, pageBoundary: true };
    const shouldSnap =
      binding.boundaryHandoff === 'snap'
        ? boundaries.targetBoundary
        : binding.transitionScope === 'sameParent'
          ? boundaries.targetBoundary && boundaries.parentBoundary
          : binding.transitionScope === 'samePage' && boundaries.targetBoundary && boundaries.pageBoundary;
    if (shouldSnap) followSnapProperties.add(property);
    const value = rctx.followRuntime?.resolve(
      binding.key,
      binding.value,
      binding.delaySeconds,
      timeSeconds,
    ) ?? binding.value;
    followOverrides.set(property, value);
  }
  return followOverrides.size > 0
    ? {
        ...rctx,
        followOverrides,
        ...(followSnapProperties.size > 0 ? { followSnapProperties } : {}),
      }
    : rctx;
}

export function resolvedFollowPosition(
  target: PhysicalEntity,
  config: FollowTargetConfig,
  rctx: ResolveContext,
): Vector2 | undefined {
  let x: number | undefined;
  let y: number | undefined;
  for (const mapping of config.mappings) {
    if (mapping.destination !== 'Transform.position.x' && mapping.destination !== 'Transform.position.y') continue;
    const source = resolveFollowSource(target, mapping.source, config.anchor, rctx);
    if (typeof source !== 'number') continue;
    const value = source + (mapping.offset ?? 0);
    if (!Number.isFinite(value)) continue;
    if (mapping.destination.endsWith('.x')) x = value;
    else y = value;
  }
  const fallback = target.box
    ? resolveFollowSource(target, 'bounds.x', config.anchor, rctx) as number
    : undefined;
  const fallbackY = target.box
    ? resolveFollowSource(target, 'bounds.y', config.anchor, rctx) as number
    : undefined;
  if (x === undefined) x = fallback;
  if (y === undefined) y = fallbackY;
  return x !== undefined && y !== undefined ? { x, y } : undefined;
}
