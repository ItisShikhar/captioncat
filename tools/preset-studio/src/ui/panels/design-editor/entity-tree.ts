import { arrayMove } from '@dnd-kit/sortable';

import {
  effectIdFromAnimationTarget,
  parseAnimationTarget,
  replicatorCopyIdFromAnimationTarget,
  replicatorCopyIdsForProps,
  type ContainerNode,
  type EcsComponentDoc,
  type EcsEffectDoc,
  type EcsEntityDoc,
  type PropertyNode,
} from '@/schema';
import { deriveStateFromBase, ENTITY_STATES, isStateGroupId } from '@/schema';
import { humanizeFieldKey } from '@/ui/controls/field-row';
import {
  paddingPreviewTargetForEntity,
  DEBUG_ENTITY_LABELS,
  type DebugEntityKind,
  type PaddingPreviewTarget,
  type PositionPreviewTarget,
} from '@/ui/preview/entity-debug';
import type { FollowTargetKind } from '@captioncat/caption-engine/browser';

export type StateSuffix = (typeof ENTITY_STATES)[number]['suffix'];
export type EntitySelectionSource = 'entity' | 'state';

/** Entity kinds that have a live-preview debug overlay. Other kinds have no hover icon. */
export const DEBUG_ENTITY_KINDS = new Set<DebugEntityKind>([
  'viewport',
  'videoArea',
  'video',
  'compositionArea',
  'page',
  'row',
  'word',
  'background',
  'image',
  'marker',
]);

export const HIERARCHY_PARENT_DROP_PREFIX = 'hierarchy-parent:';

const IMAGE_FLOW_PARENT_KINDS = new Set(['page', 'row']);
const BACKGROUND_PARENT_KINDS = new Set([
  'viewport',
  'videoArea',
  'video',
  'compositionArea',
  'page',
  'row',
  'word',
]);
const MARKER_PARENT_KINDS = new Set(['compositionArea', 'page', 'row']);
const ADDABLE_ENTITY_KINDS = new Set(['background', 'image', 'marker']);

export interface HierarchyParentDropTarget {
  parentId: string;
  beforeId?: string;
}

export function hierarchyParentDropTargetId(entityId: string, beforeId?: string): string {
  const target = `${HIERARCHY_PARENT_DROP_PREFIX}${encodeURIComponent(entityId)}`;
  return beforeId ? `${target}|${encodeURIComponent(beforeId)}` : target;
}

export function hierarchyParentDropTargetFromDropId(dropId: string): HierarchyParentDropTarget | undefined {
  if (!dropId.startsWith(HIERARCHY_PARENT_DROP_PREFIX)) return undefined;
  const payload = dropId.slice(HIERARCHY_PARENT_DROP_PREFIX.length);
  const [encodedParentId, encodedBeforeId] = payload.split('|', 2);
  if (!encodedParentId) return undefined;
  return {
    parentId: decodeURIComponent(encodedParentId),
    beforeId: encodedBeforeId ? decodeURIComponent(encodedBeforeId) : undefined,
  };
}

export function hierarchyParentIdFromDropId(dropId: string): string | undefined {
  return hierarchyParentDropTargetFromDropId(dropId)?.parentId;
}

export function canDropEntityIntoParent(entity: EcsEntityDoc, parent: EcsEntityDoc): boolean {
  if (entity.id === parent.id) return false;
  if (entity.entity === 'image') return IMAGE_FLOW_PARENT_KINDS.has(parent.entity);
  if (entity.entity === 'background') return BACKGROUND_PARENT_KINDS.has(parent.entity);
  if (entity.entity === 'marker') return MARKER_PARENT_KINDS.has(parent.entity);
  return false;
}

export function canReceiveCrossParentEntity(parent: EcsEntityDoc): boolean {
  return (
    IMAGE_FLOW_PARENT_KINDS.has(parent.entity) ||
    BACKGROUND_PARENT_KINDS.has(parent.entity) ||
    MARKER_PARENT_KINDS.has(parent.entity)
  );
}

export interface HierarchyDragIndex {
  entitiesById: ReadonlyMap<string, EcsEntityDoc>;
  parentIdsByEntityId: ReadonlyMap<string, string>;
  activeEntity: EcsEntityDoc;
  activeParentId: string;
  activeSubtreeIds: ReadonlySet<string>;
  eligibleParentDropIds: ReadonlySet<string>;
}

export function createHierarchyDragIndex(root: EcsEntityDoc, activeEntityId: string): HierarchyDragIndex | undefined {
  const entitiesById = new Map<string, EcsEntityDoc>();
  const parentIdsByEntityId = new Map<string, string>();
  const visit = (entity: EcsEntityDoc, parentId?: string): void => {
    entitiesById.set(entity.id, entity);
    if (parentId !== undefined) parentIdsByEntityId.set(entity.id, parentId);
    for (const child of entity.children) visit(child, entity.id);
  };
  visit(root);

  const activeEntity = entitiesById.get(activeEntityId);
  const activeParentId = activeEntity ? parentIdsByEntityId.get(activeEntity.id) : undefined;
  if (!activeEntity || !activeParentId) return undefined;

  const activeSubtreeIds = new Set<string>();
  const collectSubtree = (entity: EcsEntityDoc): void => {
    activeSubtreeIds.add(entity.id);
    for (const child of entity.children) collectSubtree(child);
  };
  collectSubtree(activeEntity);

  const eligibleParentDropIds = new Set<string>();
  for (const [entityId, parent] of entitiesById) {
    if (
      entityId !== activeParentId &&
      !activeSubtreeIds.has(entityId) &&
      canDropEntityIntoParent(activeEntity, parent)
    ) {
      eligibleParentDropIds.add(hierarchyParentDropTargetId(entityId));
    }
  }

  return {
    entitiesById,
    parentIdsByEntityId,
    activeEntity,
    activeParentId,
    activeSubtreeIds,
    eligibleParentDropIds,
  };
}

export function isHierarchyDragActive(): boolean {
  return typeof document !== 'undefined' && document.body.dataset.presetStudioHierarchyDragActive === 'true';
}

export function isHierarchyDragHoverSuppressed(): boolean {
  return isHierarchyDragActive();
}

const HIERARCHY_DRAG_STATE_EVENT = 'preset-studio-hierarchy-drag-state';

export function setHierarchyDragActive(active: boolean): void {
  if (typeof document === 'undefined') return;
  document.body.dataset.presetStudioHierarchyDragActive = active ? 'true' : 'false';
  window.dispatchEvent(new Event(HIERARCHY_DRAG_STATE_EVENT));
}

export function subscribeToHierarchyDragState(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(HIERARCHY_DRAG_STATE_EVENT, onChange);
  return () => window.removeEventListener(HIERARCHY_DRAG_STATE_EVENT, onChange);
}

export function asDebugKind(entityKind: string): DebugEntityKind | null {
  return DEBUG_ENTITY_KINDS.has(entityKind as DebugEntityKind) ? (entityKind as DebugEntityKind) : null;
}

/** Human title for an entity card. Known kinds use debug labels. Other kinds use a generic label. */
export function entityTitle(entity: EcsEntityDoc): string {
  const kind = asDebugKind(entity.entity);
  return kind ? DEBUG_ENTITY_LABELS[kind] : humanizeFieldKey(entity.entity);
}

function decodedIdParts(id: string): string[] {
  return id.split(':').map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
}

/** Formats a persisted entity ID for readable hierarchy and inspector labels. */
export function entityIdentifier(entity: EcsEntityDoc): string | null {
  if (!entity.id || entity.id === entity.entity) return null;
  const parts = decodedIdParts(entity.id);
  const normalizedParts = parts[0] === entity.entity ? parts : [entity.entity, ...parts];
  if (entity.entity !== 'marker' && entity.entity !== 'background') {
    return normalizedParts.map((part) => part.toUpperCase()).join(':');
  }

  const associatedId = entity.forEntityId ?? (entity.entity === 'marker' ? markerOwnerIdFromId(entity.id) : undefined);
  if (!associatedId) return normalizedParts.map((part) => part.toUpperCase()).join(':');

  const ownPrefix = normalizedParts.slice(0, 2);
  const ordinal = normalizedParts.at(-1);
  const ownOrdinal = normalizedParts.length > 2 && ordinal && /^\d+$/.test(ordinal) ? [ordinal] : [];
  return [...ownPrefix, ...decodedIdParts(associatedId), ...ownOrdinal]
    .filter((part): part is string => Boolean(part))
    .map((part) => part.toUpperCase())
    .join(':');
}

/** Shows the readable entity ID in an inspector badge. */
export function entityBadge(entity: EcsEntityDoc): string | null {
  return entityIdentifier(entity);
}

/** Shows IDs for entities that users can add. */
export function hierarchyEntityBadge(entity: EcsEntityDoc): string | null {
  if (!ADDABLE_ENTITY_KINDS.has(entity.entity)) return null;
  const identifier = entityIdentifier(entity);
  if (!identifier) return null;

  const remainingParts = identifier.split(':').slice(2);
  return remainingParts.length > 0 ? remainingParts.join(':') : null;
}

function markerOwnerIdFromId(markerId: string): string | undefined {
  const parts = markerId.split(':');
  if (parts[0] !== 'marker' || parts.length < 4) return undefined;
  const encodedOwnerId = parts.slice(2, -1).join(':');
  try {
    return decodeURIComponent(encodedOwnerId);
  } catch {
    return undefined;
  }
}

/** Finds the entity a marker belongs to, using its explicit owner token with a legacy sibling fallback. */
export function markerOwnerEntity(root: EcsEntityDoc, markerId: string): EcsEntityDoc | undefined {
  const marker = findEntityById(root, markerId);
  if (!marker || marker.entity !== 'marker') return undefined;
  const explicitOwnerId = marker.forEntityId ?? markerOwnerIdFromId(marker.id);
  if (explicitOwnerId) return findEntityById(root, explicitOwnerId);

  const parentInfo = findParentOf(root, marker.id);
  if (!parentInfo) return undefined;
  const ownerKind = marker.id.split(':')[1];
  if (ownerKind && parentInfo.parent.entity === ownerKind) return parentInfo.parent;
  for (let index = parentInfo.index - 1; index >= 0; index -= 1) {
    const candidate = parentInfo.parent.children[index];
    if (candidate.entity === ownerKind) return candidate;
  }
  return undefined;
}

export function findAssociatedEntity(root: EcsEntityDoc, entity: EcsEntityDoc): EcsEntityDoc | undefined {
  if (entity.entity === 'marker') return markerOwnerEntity(root, entity.id);
  if (entity.entity !== 'background' || !entity.forEntityId) return undefined;
  return findEntityById(root, entity.forEntityId);
}

/** Use the same timeline-aware default target for newly added attachable entities. */
export type AddableFollowTargetKind = Exclude<FollowTargetKind, 'currentPage' | 'entity'>;

export function defaultFollowTargetForEntity(entity: EcsEntityDoc): AddableFollowTargetKind {
  switch (entity.entity) {
    case 'word':
      return 'currentWord';
    case 'row':
    case 'page':
      return 'currentRow';
    default:
      return 'parent';
  }
}

export function hierarchyChildren(children: EcsEntityDoc[]): EcsEntityDoc[] {
  return children.filter((child) => !isStateGroupId(child.id) || child.id.endsWith(':default'));
}

export function findParentOf(
  root: EcsEntityDoc,
  id: string,
): { parent: EcsEntityDoc; child: EcsEntityDoc; index: number } | undefined {
  for (let i = 0; i < root.children.length; i += 1) {
    const child = root.children[i];
    if (child.id === id) {
      return { parent: root, child, index: i };
    }
    const nested = findParentOf(child, id);
    if (nested) return nested;
  }
  return undefined;
}

export function stateFamilyKey(root: EcsEntityDoc, stateEntityId: string): string | undefined {
  if (!isStateGroupId(stateEntityId)) return undefined;
  const kind = stateEntityId.slice(0, stateEntityId.indexOf(':'));
  if (kind !== 'row' && kind !== 'word') return undefined;

  const parentInfo = findParentOf(root, stateEntityId) ?? findParentOf(root, `${kind}:default`);
  return parentInfo ? `${parentInfo.parent.id}:${kind}` : undefined;
}

export function hierarchySelectionId(root: EcsEntityDoc, selectedId: string): string {
  if (!isStateGroupId(selectedId)) return selectedId;
  const parentInfo = findParentOf(root, selectedId);
  if (!parentInfo) return selectedId;
  const defaultId = `${parentInfo.child.entity}:default`;
  return parentInfo.parent.children.some((child) => child.id === defaultId) ? defaultId : selectedId;
}

export function areEqualNodes(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => areEqualNodes(item, b[index]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const left = a as Record<string, unknown>;
    const right = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of keys) {
      if (!areEqualNodes(left[key], right[key])) return false;
    }
    return true;
  }
  return false;
}

export function stateEntityIsDirty(
  current: EcsEntityDoc | undefined,
  saved: EcsEntityDoc | undefined,
  savedBase: EcsEntityDoc | undefined,
): boolean {
  if (current && saved) return !areEqualNodes(current, saved);
  if (!current) return false;
  if (!savedBase) return true;
  const seeded = deriveStateFromBase(savedBase, current.id);
  return !areEqualNodes(current, seeded);
}

export function makeInspectorStateKey(...segments: Array<string | number>): string {
  return segments.map((segment) => encodeURIComponent(String(segment))).join('/');
}

export function appendInspectorStateKey(prefix: string, ...segments: Array<string | number>): string {
  return [prefix, ...segments.map((segment) => encodeURIComponent(String(segment)))].join('/');
}

export function fallbackSelectedEntity(root: EcsEntityDoc, selectedEntityId: string): EcsEntityDoc | undefined {
  if (!isStateGroupId(selectedEntityId)) return undefined;
  const colon = selectedEntityId.indexOf(':');
  if (colon < 0) return undefined;
  const kind = selectedEntityId.slice(0, colon);
  if (kind !== 'row' && kind !== 'word') return undefined;
  const familyId = `${kind}:default`;
  return findEntityById(root, familyId);
}

export function findEntityById(root: EcsEntityDoc, id: string): EcsEntityDoc | undefined {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findEntityById(child, id);
    if (found) return found;
  }
  return undefined;
}

export function findComponentByType(
  components: readonly EcsComponentDoc[],
  componentType: string,
): EcsComponentDoc | undefined {
  for (const component of components) {
    if (component.component === componentType) return component;
    const nested = findComponentByType(component.components, componentType);
    if (nested) return nested;
  }
  return undefined;
}

export function isComponentDeletable(component: EcsComponentDoc): boolean {
  return component.isDeletable === true && component.dependencyOf === undefined;
}

export function updateEntityById(
  root: EcsEntityDoc,
  id: string,
  updater: (previous: EcsEntityDoc) => EcsEntityDoc,
): EcsEntityDoc {
  if (root.id === id) return updater(root);
  let changed = false;
  const children = root.children.map((child) => {
    const next = updateEntityById(child, id, updater);
    if (next !== child) changed = true;
    return next;
  });
  return changed ? { ...root, children } : root;
}

export function effectIdsInComponent(component: EcsComponentDoc): string[] {
  return [...component.effects.map((effect) => effect.id), ...component.components.flatMap(effectIdsInComponent)];
}

export function componentTypesInComponent(component: EcsComponentDoc): string[] {
  return [component.component, ...component.components.flatMap(componentTypesInComponent)];
}

function removeAnimationTracksFromComponent(
  component: EcsComponentDoc,
  effectIds: ReadonlySet<string>,
  componentTypes: ReadonlySet<string>,
): { component: EcsComponentDoc; changed: boolean } {
  let next = component;
  let changed = false;
  if (component.animation) {
    const tracks = component.animation.tracks.filter((track) => {
      const parsed = parseAnimationTarget(track.target);
      if (!parsed) return true;
      if (parsed.effectId !== undefined) return !effectIds.has(parsed.effectId);
      return !componentTypes.has(parsed.owner.toLowerCase());
    });
    if (tracks.length !== component.animation.tracks.length) {
      next = { ...next, animation: { ...component.animation, tracks } };
      changed = true;
    }
  }
  const nested = component.components.map((child) => {
    const result = removeAnimationTracksFromComponent(child, effectIds, componentTypes);
    if (result.changed) changed = true;
    return result.component;
  });
  if (changed) next = { ...next, components: nested };
  return { component: next, changed };
}

export function removeAnimationTracksForEffects(root: EcsEntityDoc, effectIds: readonly string[]): EcsEntityDoc {
  const ids = new Set(effectIds);
  if (ids.size === 0) return root;
  const componentTypes = new Set<string>();
  let changed = false;
  const components = root.components.map((component) => {
    const result = removeAnimationTracksFromComponent(component, ids, componentTypes);
    if (result.changed) changed = true;
    return result.component;
  });
  const children = root.children.map((child) => {
    const next = removeAnimationTracksForEffects(child, effectIds);
    if (next !== child) changed = true;
    return next;
  });
  return changed ? { ...root, components, children } : root;
}

export function removeAnimationTracksForComponentTypes(
  entity: EcsEntityDoc,
  componentTypes: readonly string[],
): EcsEntityDoc {
  const types = new Set(componentTypes.map((componentType) => componentType.toLowerCase()));
  if (types.size === 0) return entity;
  const effectIds = new Set<string>();
  let changed = false;
  const components = entity.components.map((component) => {
    const result = removeAnimationTracksFromComponent(component, effectIds, types);
    if (result.changed) changed = true;
    return result.component;
  });
  return changed ? { ...entity, components } : entity;
}

export function removeAnimationTracksForEffect(root: EcsEntityDoc, effectId: string): EcsEntityDoc {
  return removeAnimationTracksForEffects(root, [effectId]);
}

export function removeAnimationDependenciesForEffects(
  root: EcsEntityDoc,
  effectIds: readonly string[],
): EcsEntityDoc {
  const ids = new Set(effectIds);
  if (ids.size === 0) return root;
  const normalized = removeAnimationDependenciesFromComponents(root.components, ids);
  let changed = normalized.changed;
  const components = normalized.components.filter((component) => {
    const isLinkedWipeAnimation =
      component.component === 'animation' &&
      component.dependencyOf === 'wipeReveal' &&
      component.animation?.tracks.length === 0;
    if (isLinkedWipeAnimation) changed = true;
    return !isLinkedWipeAnimation;
  });
  const children = root.children.map((child) => {
    const next = removeAnimationDependenciesForEffects(child, effectIds);
    if (next !== child) changed = true;
    return next;
  });
  if (components.length !== normalized.components.length) changed = true;
  return changed ? { ...root, components, children } : root;
}

function removeAnimationDependenciesFromComponents(
  components: readonly EcsComponentDoc[],
  effectIds: ReadonlySet<string>,
): { components: EcsComponentDoc[]; changed: boolean } {
  let changed = false;
  const nextComponents = components.map((component) => {
    const nested = removeAnimationDependenciesFromComponents(component.components, effectIds);
    const nextAnimation =
      component.component === 'animation' &&
      component.dependencyOf === 'wipeReveal' &&
      component.animation
        ? {
            ...component.animation,
            tracks: component.animation.tracks.filter((track) => {
              const parsed = parseAnimationTarget(track.target);
              return parsed?.effectId === undefined || !effectIds.has(parsed.effectId);
            }),
          }
        : component.animation;
    const animationChanged = nextAnimation !== component.animation;
    if (nested.changed || animationChanged) changed = true;
    return nested.changed || animationChanged
      ? {
          ...component,
          ...(nextAnimation ? { animation: nextAnimation } : {}),
          components: nested.components,
        }
      : component;
  });
  return { components: nextComponents, changed };
}
function removeAnimationTracksFromReplicatorCopies(
  component: EcsComponentDoc,
  effectId: string,
  copyIds: ReadonlySet<string>,
): { component: EcsComponentDoc; changed: boolean } {
  let next = component;
  let changed = false;
  if (component.animation) {
    const tracks = component.animation.tracks.filter((track) => {
      const targetEffectId = effectIdFromAnimationTarget(track.target);
      const copyId = replicatorCopyIdFromAnimationTarget(track.target);
      return targetEffectId !== effectId || copyId === undefined || !copyIds.has(copyId);
    });
    if (tracks.length !== component.animation.tracks.length) {
      next = { ...next, animation: { ...component.animation, tracks } };
      changed = true;
    }
  }
  const nested = component.components.map((child) => {
    const result = removeAnimationTracksFromReplicatorCopies(child, effectId, copyIds);
    if (result.changed) changed = true;
    return result.component;
  });
  if (changed) next = { ...next, components: nested };
  return { component: next, changed };
}

interface ReplicatorCopyScope {
  entityPath: readonly number[];
  effectId: string;
  copyIds: string[];
}

function collectReplicatorCopyIds(
  entity: EcsEntityDoc,
  output: Map<string, ReplicatorCopyScope>,
  entityPath: readonly number[] = [],
): void {
  const addEffect = (effect: EcsEffectDoc): void => {
    if (effect.effect !== 'replicator') return;
    const key = `${entityPath.join('.')}|${effect.id}`;
    output.set(key, { entityPath, effectId: effect.id, copyIds: replicatorCopyIdsForProps(effect.props) });
  };
  for (const effect of entity.effects) {
    addEffect(effect);
  }
  const visitComponent = (component: EcsComponentDoc): void => {
    for (const effect of component.effects) {
      addEffect(effect);
    }
    for (const child of component.components) visitComponent(child);
  };
  for (const component of entity.components) visitComponent(component);
  entity.children.forEach((child, index) => collectReplicatorCopyIds(child, output, [...entityPath, index]));
}

function removeAnimationTracksAtEntityPath(
  root: EcsEntityDoc,
  entityPath: readonly number[],
  effectId: string,
  copyIds: readonly string[],
): EcsEntityDoc {
  if (entityPath.length === 0) {
    let changed = false;
    const ids = new Set(copyIds);
    const components = root.components.map((component) => {
      const result = removeAnimationTracksFromReplicatorCopies(component, effectId, ids);
      if (result.changed) changed = true;
      return result.component;
    });
    return changed ? { ...root, components } : root;
  }

  const [childIndex, ...rest] = entityPath;
  const child = root.children[childIndex];
  if (!child) return root;
  const nextChild = removeAnimationTracksAtEntityPath(child, rest, effectId, copyIds);
  if (nextChild === child) return root;
  const children = [...root.children];
  children[childIndex] = nextChild;
  return { ...root, children };
}

export function removeAnimationTracksForRemovedReplicatorCopies(
  root: EcsEntityDoc,
  before: EcsEntityDoc,
  after: EcsEntityDoc,
): EcsEntityDoc {
  const beforeCopies = new Map<string, ReplicatorCopyScope>();
  const afterCopies = new Map<string, ReplicatorCopyScope>();
  collectReplicatorCopyIds(before, beforeCopies);
  collectReplicatorCopyIds(after, afterCopies);
  let next = root;
  for (const [scopeKey, previous] of beforeCopies) {
    const currentIds = new Set(afterCopies.get(scopeKey)?.copyIds ?? []);
    const removedIds = previous.copyIds.filter((id) => !currentIds.has(id));
    if (removedIds.length > 0) {
      next = removeAnimationTracksAtEntityPath(next, previous.entityPath, previous.effectId, removedIds);
    }
  }
  return next;
}

function updateFollowTargetId(component: EcsComponentDoc, targetId: string): EcsComponentDoc {
  if (component.component === 'followTarget') {
    if (leafStringValue(component, 'target') !== 'entity') return component;
    const previous = component.props.targetId;
    const targetIdNode: PropertyNode =
      previous?.kind === 'leaf'
        ? { ...previous, type: 'string', value: targetId }
        : { kind: 'leaf', type: 'string', value: targetId };
    return {
      ...component,
      props: {
        ...component.props,
        targetId: targetIdNode,
      },
    };
  }

  let changed = false;
  const components = component.components.map((child) => {
    const next = updateFollowTargetId(child, targetId);
    if (next !== child) changed = true;
    return next;
  });
  return changed ? { ...component, components } : component;
}

function adaptEntityToParent(entity: EcsEntityDoc, parentId: string): EcsEntityDoc {
  if (entity.entity !== 'background' && entity.entity !== 'marker') return entity;
  return {
    ...entity,
    forEntityId: parentId,
    components: entity.components.map((component) => updateFollowTargetId(component, parentId)),
  };
}

function leafStringValue(component: EcsComponentDoc | undefined, propertyName: string): string | undefined {
  const node = component?.props[propertyName];
  return node?.kind === 'leaf' && typeof node.value === 'string' ? node.value : undefined;
}

export function synchronizeForEntityId(entity: EcsEntityDoc, components: readonly EcsComponentDoc[]): EcsEntityDoc {
  if (entity.entity !== 'background' && entity.entity !== 'marker') return entity;
  const followTarget = findComponentByType(components, 'followTarget');
  if (leafStringValue(followTarget, 'target') !== 'entity') return entity;
  const targetId = leafStringValue(followTarget, 'targetId');
  return targetId ? { ...entity, forEntityId: targetId } : { ...entity, forEntityId: undefined };
}

export function clearForEntityReferences(entity: EcsEntityDoc, removedEntityId: string): EcsEntityDoc {
  let changed = false;
  const children = entity.children.map((child) => {
    const next = clearForEntityReferences(child, removedEntityId);
    if (next !== child) changed = true;
    return next;
  });
  const nextEntity = entity.forEntityId === removedEntityId ? { ...entity, forEntityId: undefined } : entity;
  if (nextEntity !== entity) changed = true;
  return changed ? { ...nextEntity, children } : entity;
}

export function reparentEntityById(
  root: EcsEntityDoc,
  activeId: string,
  parentId: string,
  beforeId?: string,
): EcsEntityDoc {
  const activeInfo = findParentOf(root, activeId);
  const targetParent = findEntityById(root, parentId);
  if (!activeInfo || !targetParent || activeInfo.parent.id === targetParent.id) return root;
  if (!canDropEntityIntoParent(activeInfo.child, targetParent)) return root;
  if (findEntityById(activeInfo.child, targetParent.id)) return root;

  const movedEntity = adaptEntityToParent(activeInfo.child, targetParent.id);
  const withoutActive = updateEntityById(root, activeInfo.parent.id, (parent) => ({
    ...parent,
    children: parent.children.filter((child) => child.id !== activeId),
  }));
  return updateEntityById(withoutActive, targetParent.id, (parent) => {
    const insertionIndex = beforeId ? parent.children.findIndex((child) => child.id === beforeId) : 0;
    const children = [...parent.children];
    children.splice(insertionIndex >= 0 ? insertionIndex : 0, 0, movedEntity);
    return { ...parent, children };
  });
}

export function reorderEntityById(root: EcsEntityDoc, activeId: string, overId: string): EcsEntityDoc {
  const parentDropTarget = hierarchyParentDropTargetFromDropId(overId);
  if (parentDropTarget) {
    return reparentEntityById(root, activeId, parentDropTarget.parentId, parentDropTarget.beforeId);
  }

  const activeParent = findParentOf(root, activeId);
  const overParent = findParentOf(root, overId);
  if (!activeParent || !overParent || activeParent.parent.id !== overParent.parent.id) return root;

  const visibleChildren = hierarchyChildren(activeParent.parent.children);
  const activeIndex = visibleChildren.findIndex((child) => child.id === activeId);
  const overIndex = visibleChildren.findIndex((child) => child.id === overId);
  if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) return root;

  const reorderedVisible = arrayMove(visibleChildren, activeIndex, overIndex);
  const visibleIds = new Set(reorderedVisible.map((child) => child.id));
  let cursor = 0;
  const children = activeParent.parent.children.map((child) => {
    if (!visibleIds.has(child.id)) return child;
    const next = reorderedVisible[cursor];
    cursor += 1;
    return next;
  });

  return updateEntityById(root, activeParent.parent.id, (parent) => ({ ...parent, children }));
}

export function componentListAtPath(components: EcsComponentDoc[], path: string[]): EcsComponentDoc[] | undefined {
  let current = components;
  for (const segment of path) {
    const next = current.find((component) => component.component === segment);
    if (!next) return undefined;
    current = next.components;
  }
  return current;
}

export function updateComponentListAtPath(
  components: EcsComponentDoc[],
  path: string[],
  updater: (previous: EcsComponentDoc[]) => EcsComponentDoc[],
): EcsComponentDoc[] {
  if (path.length === 0) return updater(components);
  const [head, ...rest] = path;
  let changed = false;
  const next = components.map((component) => {
    if (component.component !== head) return component;
    const children = updateComponentListAtPath(component.components, rest, updater);
    if (children === component.components) return component;
    changed = true;
    return { ...component, components: children };
  });
  return changed ? next : components;
}

export function componentCountAtPath(components: EcsComponentDoc[], path: string[], componentName: string): number {
  const list = componentListAtPath(components, path);
  if (!list) return 0;
  return list.filter((component) => component.component === componentName).length;
}

/** Wraps a component/effect's flat `props` map into the `ContainerNode` shape `PropertyCard`/`PropertyTreeView` expect. */
export function propsToContainer(props: Record<string, PropertyNode>): ContainerNode {
  return { kind: 'container', wrapping: 'wrapped', children: props };
}

export function vector2ValueFromNode(node: PropertyNode | undefined): { x: number; y: number } | null {
  if (node?.kind !== 'leaf' || node.type !== 'vector2' || typeof node.value !== 'object' || node.value === null) {
    return null;
  }
  const value = node.value as { x?: unknown; y?: unknown };
  return {
    x: typeof value.x === 'number' ? value.x : 0,
    y: typeof value.y === 'number' ? value.y : 0,
  };
}

export function entityPaddingPreviewTarget(entity: EcsEntityDoc): PaddingPreviewTarget | null {
  return paddingPreviewTargetForEntity(entity);
}

export function entityPositionPreviewTarget(entity: EcsEntityDoc): PositionPreviewTarget | null {
  const kind = asDebugKind(entity.entity);
  if (!kind) return null;
  const transform = entity.components.find((component) => component.component === 'transform');
  const position = vector2ValueFromNode(transform?.props.position) ?? { x: 0, y: 0 };
  return { kind, value: position };
}
