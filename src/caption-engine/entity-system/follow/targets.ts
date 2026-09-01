import { Page, PhysicalEntity, Row, Word } from '../physical-entities';
import type { ResolveContext } from '../types';
import type { FollowTargetConfig, FollowMode, FollowTargetKind } from './types';

export type ResolvedFollowMode = Exclude<FollowMode, 'auto'>;

function entityWithSourceId(root: PhysicalEntity, targetId: string): PhysicalEntity | undefined {
  let current: PhysicalEntity | undefined;
  let fallback: PhysicalEntity | undefined;
  root.traverse((entity) => {
    if (entity.debugSourceId !== targetId) return;
    fallback ??= entity;
    if (
      (entity instanceof Word || entity instanceof Row) &&
      entity.state === 'current'
    ) {
      current = entity;
    }
  });
  return current ?? fallback;
}

function pathToEntity(root: PhysicalEntity, target: PhysicalEntity): PhysicalEntity[] | undefined {
  const path: PhysicalEntity[] = [];
  const visit = (entity: PhysicalEntity): boolean => {
    path.push(entity);
    if (entity === target) return true;
    for (const child of entity.children) {
      if (visit(child)) return true;
    }
    path.pop();
    return false;
  };
  return visit(root) ? path : undefined;
}

function nearestAncestor(
  root: PhysicalEntity,
  entity: PhysicalEntity | undefined,
  predicate: (candidate: PhysicalEntity) => boolean,
): PhysicalEntity | undefined {
  if (!entity) return undefined;
  const path = pathToEntity(root, entity);
  if (!path) return undefined;
  for (let index = path.length - 1; index >= 0; index -= 1) {
    const candidate = path[index];
    if (candidate && predicate(candidate)) return candidate;
  }
  return undefined;
}

function wordTargetScope(root: PhysicalEntity, parent: PhysicalEntity | undefined): PhysicalEntity {
  return nearestAncestor(root, parent, (entity) => entity instanceof Row) ?? parent ?? root;
}

function rowTargetScope(root: PhysicalEntity, parent: PhysicalEntity | undefined): PhysicalEntity {
  return nearestAncestor(root, parent, (entity) => entity instanceof Page) ?? root;
}

function timelineWords(root: PhysicalEntity): Word[] {
  const words: Word[] = [];
  root.traverse((entity) => {
    if (entity instanceof Word && entity.box) words.push(entity);
  });
  return words;
}

function timelineRows(root: PhysicalEntity): Row[] {
  const rows: Row[] = [];
  root.traverse((entity) => {
    if (entity instanceof Row && entity.box) rows.push(entity);
  });
  return rows;
}

function currentTimelinePage(root: PhysicalEntity): Page | undefined {
  return root.find(
    (entity) =>
      entity instanceof Page &&
      !!entity.find((candidate) => candidate instanceof Word && candidate.state === 'current' && !!candidate.box),
  ) as Page | undefined;
}

function resolveTimelineTarget(root: PhysicalEntity, target: FollowTargetKind): PhysicalEntity | undefined {
  if (target === 'currentPage') return currentTimelinePage(root);
  if (target === 'currentWord' || target === 'previousWord' || target === 'nextWord') {
    const words = timelineWords(root);
    const currentIndex = words.findIndex((word) => word.state === 'current');
    if (currentIndex < 0) return undefined;
    if (target === 'currentWord') return words[currentIndex];
    return words[currentIndex + (target === 'previousWord' ? -1 : 1)];
  }
  if (target === 'currentRow' || target === 'previousRow' || target === 'nextRow') {
    const rows = timelineRows(root);
    const currentIndex = rows.findIndex((row) => row.state === 'current');
    if (currentIndex < 0) return undefined;
    if (target === 'currentRow') return rows[currentIndex];
    return rows[currentIndex + (target === 'previousRow' ? -1 : 1)];
  }
  return undefined;
}

export function isTimelineBackedTarget(target: PhysicalEntity | undefined): boolean {
  return target instanceof Word || target instanceof Row || target instanceof Page;
}

export function followTargetIdentity(target: PhysicalEntity): string {
  return `${target.kind}:${target.randomizerKey || target.id}`;
}

export function followTargetParentIdentity(root: PhysicalEntity, target: PhysicalEntity): string | undefined {
  const path = pathToEntity(root, target);
  const parent = path?.[path.length - 2];
  return parent ? `${parent.kind}:${parent.randomizerKey || parent.id}` : undefined;
}

export function followTargetPageIdentity(root: PhysicalEntity, target: PhysicalEntity): string | undefined {
  const page = nearestAncestor(root, target, (entity) => entity instanceof Page);
  return page ? `${page.kind}:${page.randomizerKey || page.id}` : undefined;
}

export function resolveFollowMode(config: FollowTargetConfig, target: PhysicalEntity | undefined): ResolvedFollowMode {
  if (config.mode === 'live') return 'live';
  if (config.mode === 'timeline') return isTimelineBackedTarget(target) ? 'timeline' : 'live';
  return isTimelineBackedTarget(target) ? 'timeline' : 'live';
}

export function resolveFollowTarget(
  root: PhysicalEntity,
  parent: PhysicalEntity | undefined,
  config: FollowTargetConfig,
  _rctx: ResolveContext,
): PhysicalEntity | undefined {
  if (config.targetScope === 'timeline' && config.target !== 'parent' && config.target !== 'entity') {
    return resolveTimelineTarget(root, config.target);
  }
  const wordScope = wordTargetScope(root, parent);
  const rowScope = rowTargetScope(root, parent);
  const currentPage = nearestAncestor(root, parent, (entity) => entity instanceof Page);
  switch (config.target) {
    case 'parent':
      return parent;
    case 'currentWord':
      return wordScope.find((entity) => entity instanceof Word && entity.state === 'current');
    case 'previousWord':
      return wordScope.find((entity) => entity instanceof Word && entity.state === 'previous');
    case 'nextWord':
      return wordScope.find((entity) => entity instanceof Word && entity.state === 'next');
    case 'currentRow':
      return rowScope.find((entity) => entity instanceof Row && entity.state === 'current');
    case 'previousRow':
      return rowScope.find((entity) => entity instanceof Row && entity.state === 'previous');
    case 'nextRow':
      return rowScope.find((entity) => entity instanceof Row && entity.state === 'next');
    case 'currentPage':
      return currentPage ?? parent?.find((entity) => entity instanceof Page) ?? root.find((entity) => entity instanceof Page);
    case 'entity':
      return config.targetId ? root.findById(config.targetId) ?? entityWithSourceId(root, config.targetId) : undefined;
    default:
      return undefined;
  }
}
