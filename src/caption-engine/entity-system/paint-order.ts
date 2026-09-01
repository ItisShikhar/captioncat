import type { ResolveContext } from './types';
import {
  ChildPaintOrder,
  PaintOrder,
  type ChildPaintOrderConfig,
  type ChildPaintOrderMode,
  type MarkerBehavior,
} from './components';
import type { PhysicalEntity } from './physical-entities';

export interface ResolvedPaintOrder {
  child: PhysicalEntity;
  sourceIndex: number;
  zIndex: number;
  drawRank: number;
}

interface SortEntry {
  child: PhysicalEntity;
  sourceIndex: number;
  zIndex: number;
  sortValue: number;
}

export function resolvedZIndex(entity: PhysicalEntity, rctx: ResolveContext): number {
  const paintOrder = entity.getComponent<PaintOrder>('paintOrder');
  if (!paintOrder) return 0;
  const context = entity.contextFor(rctx);
  return paintOrder.isEnabled(context) ? paintOrder.zIndex(context) : 0;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

function seededRank(parent: PhysicalEntity, child: PhysicalEntity, sourceIndex: number, seed: number): number {
  const key = `${seed}:${parent.id}:${child.id}:${sourceIndex}`;
  return hashString(key) / 0x100000000;
}

function patternValue(config: ChildPaintOrderConfig, sourceIndex: number): number | undefined {
  if (config.mode === 'alternate') {
    const isFront = (sourceIndex + (config.start === 'front' ? 1 : 0)) % 2 === 1;
    return isFront ? config.frontZIndex : config.backZIndex;
  }
  if (config.mode === 'custom') {
    if (config.values.length === 0) return undefined;
    const index = ((sourceIndex + config.offset) % config.values.length + config.values.length) % config.values.length;
    return config.values[index];
  }
  return undefined;
}

function sortMode(config: ChildPaintOrderConfig): ChildPaintOrderMode {
  if (config.mode === 'custom' && config.values.length === 0) return 'source';
  return config.mode;
}

function sortEntries(parent: PhysicalEntity, children: readonly PhysicalEntity[], rctx: ResolveContext): SortEntry[] {
  const policy = parent.getComponent<ChildPaintOrder>('childPaintOrder');
  const parentContext = parent.contextFor(rctx);
  if (policy && !policy.isEnabled(parentContext)) {
    return children.map((child, childIndex) => ({
      child,
      sourceIndex: childIndex,
      zIndex: resolvedZIndex(child, rctx),
      sortValue: childIndex,
    }));
  }
  const config = policy?.resolveConfig(parent.contextFor(rctx)) ?? {
    mode: 'zIndex',
    direction: 'ascending',
    backZIndex: 0,
    frontZIndex: 1,
    start: 'back',
    values: [],
    offset: 0,
    seed: 0,
  };
  const mode = sortMode(config);
  const sourceIndices = new Map(parent.children.map((child, index) => [child, index]));

  return children.map((child, childIndex) => {
    const sourceIndex = sourceIndices.get(child) ?? childIndex;
    const zIndex = resolvedZIndex(child, rctx);
    const sortValue =
      mode === 'source'
        ? sourceIndex
        : mode === 'zIndex'
          ? zIndex
          : mode === 'random'
            ? seededRank(parent, child, sourceIndex, config.seed)
            : patternValue(config, sourceIndex) ?? sourceIndex;
    return { child, sourceIndex, zIndex, sortValue };
  });
}

export function resolveChildPaintOrders(
  parent: PhysicalEntity,
  children: readonly PhysicalEntity[],
  rctx: ResolveContext,
): ResolvedPaintOrder[] {
  const policy = parent.getComponent<ChildPaintOrder>('childPaintOrder');
  const config = policy?.isEnabled(parent.contextFor(rctx)) ? policy.resolveConfig(parent.contextFor(rctx)) : undefined;
  const direction = config?.direction ?? 'ascending';
  const entries = sortEntries(parent, children, rctx);
  entries.sort((left, right) => {
    const difference = left.sortValue - right.sortValue;
    if (difference !== 0) return direction === 'descending' ? -difference : difference;
    return left.sourceIndex - right.sourceIndex;
  });
  return entries.map((entry, drawRank) => ({
    child: entry.child,
    sourceIndex: entry.sourceIndex,
    zIndex: entry.zIndex,
    drawRank,
  }));
}

export function orderedChildren(
  parent: PhysicalEntity,
  children: readonly PhysicalEntity[],
  rctx: ResolveContext,
): PhysicalEntity[] {
  return resolveChildPaintOrders(parent, children, rctx).map((entry) => entry.child);
}

function childGroups(parent: PhysicalEntity, rctx: ResolveContext): PhysicalEntity[][] {
  const belowMarkers: PhysicalEntity[] = [];
  const regularChildren: PhysicalEntity[] = [];
  const aboveMarkers: PhysicalEntity[] = [];

  for (const child of parent.children) {
    if (child.kind !== 'marker') {
      regularChildren.push(child);
      continue;
    }
    const renderOrder = child
      .getComponent<MarkerBehavior>('markerBehavior')
      ?.resolveConfig(child.contextFor(rctx)).renderOrder;
    if (renderOrder === 'behind') {
      belowMarkers.push(child);
    } else {
      aboveMarkers.push(child);
    }
  }

  return [belowMarkers, regularChildren, aboveMarkers];
}

export function resolveChildPaintOrderGroups(
  parent: PhysicalEntity,
  rctx: ResolveContext,
): ResolvedPaintOrder[][] {
  return childGroups(parent, rctx).map((children) => resolveChildPaintOrders(parent, children, rctx));
}

export function orderedChildGroups(
  parent: PhysicalEntity,
  rctx: ResolveContext,
): { belowMarkers: PhysicalEntity[]; regularChildren: PhysicalEntity[]; aboveMarkers: PhysicalEntity[] } {
  const [belowMarkers, regularChildren, aboveMarkers] = resolveChildPaintOrderGroups(parent, rctx);
  return {
    belowMarkers: belowMarkers.map((entry) => entry.child),
    regularChildren: regularChildren.map((entry) => entry.child),
    aboveMarkers: aboveMarkers.map((entry) => entry.child),
  };
}

export function collectResolvedPaintOrders(
  root: PhysicalEntity,
  rctx: ResolveContext,
): Map<PhysicalEntity, ResolvedPaintOrder> {
  const result = new Map<PhysicalEntity, ResolvedPaintOrder>();
  const visit = (parent: PhysicalEntity): void => {
    const groups = resolveChildPaintOrderGroups(parent, rctx);
    let drawRank = 0;
    for (const children of groups) {
      for (const resolved of children) {
        result.set(resolved.child, {
          ...resolved,
          drawRank: drawRank++,
        });
        visit(resolved.child);
      }
    }
  };
  visit(root);
  return result;
}
