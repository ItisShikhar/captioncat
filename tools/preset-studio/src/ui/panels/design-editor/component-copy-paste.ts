import type { AnimationTrackDoc } from '@/schema';
import {
  createEffectIdMap,
  createEffectId,
  createStudioComponentId,
  effectScopeForEntity,
  effectIdFromAnimationTarget,
  effectSlotsForComponent,
  effectSlotsForEntity,
  instantiateComponentTemplate,
  mergeEntityComponentsForDisplay,
  normalizeLayoutMotionComponentForEntity,
  remapAnimationTracks,
  reduceEntityComponents,
  schemaForEntity,
  type ComponentTemplate,
  type EcsComponentDoc,
  type EcsEffectDoc,
  type EcsEntityDoc,
} from '@/schema';
import { parseAnimationTarget } from '@/schema/animation-target';

import { removeAnimationTracksForComponentTypes } from './entity-tree';

export interface ComponentPasteTarget {
  componentType: string;
  parentPath: readonly string[];
  occurrenceIndex?: number;
  studioId?: string;
}

export type ComponentDuplicateTarget = ComponentPasteTarget;

export interface EffectPasteTarget {
  effectId?: string;
  ownerComponentType?: string;
  ownerComponentPath?: readonly string[];
  ownerComponentStudioId?: string;
}

export interface EffectDuplicateTarget {
  effectId: string;
  ownerComponentType?: string;
  ownerComponentPath?: readonly string[];
  ownerComponentStudioId?: string;
}

export type CompatiblePasteTarget =
  | {
      kind: 'component';
      label: string;
      target: ComponentPasteTarget;
    }
  | {
      kind: 'effect';
      label: string;
      target: EffectPasteTarget;
    };

export interface ComponentCopyPayloadData {
  kind: 'component';
  sourceEntityId: string;
  sourceEntityLabel: string;
  itemLabel: string;
  component: EcsComponentDoc;
  /** Same-level components required by the copied component, in source order. */
  componentTree: EcsComponentDoc[];
  rootIndex: number;
  parentPath: string[];
  /** Tracks owned by another animation component but targeting this copied tree. */
  externalAnimationTracks: AnimationTrackDoc[];
}

export interface EffectCopyPayload {
  kind: 'effect';
  sourceEntityId: string;
  sourceEntityLabel: string;
  itemLabel: string;
  effect: EcsEffectDoc;
  /** The copied effect and its dependent effects, in source order. */
  effectTree: EcsEffectDoc[];
  rootIndex: number;
  ownerComponentType?: string;
  ownerComponentPath?: string[];
  ownerComponentStudioId?: string;
  /** Components owned by the copied effect, such as Wipe Reveal animation. */
  dependentComponents: EcsComponentDoc[];
  animationTracks: AnimationTrackDoc[];
}

export type ComponentCopyPayload = ComponentCopyPayloadData | EffectCopyPayload;

export function formatPasteActionLabel(itemLabel: string, sourceEntityLabel: string): string {
  return `Paste ${itemLabel} from ${sourceEntityLabel}`;
}

export interface ComponentCopySource {
  entity: EcsEntityDoc;
  component: EcsComponentDoc;
  itemLabel: string;
  parentPath?: readonly string[];
}

export interface EffectCopySource {
  entity: EcsEntityDoc;
  effect: EcsEffectDoc;
  itemLabel: string;
  ownerComponent?: EcsComponentDoc;
  ownerComponentPath?: readonly string[];
}

export function componentListAtPath(
  components: readonly EcsComponentDoc[],
  path: readonly string[],
): readonly EcsComponentDoc[] | undefined {
  let current = components;
  for (const segment of path) {
    const next = current.find((component) => component.component === segment);
    if (!next) return undefined;
    current = next.components;
  }
  return current;
}

function componentListAtPathMutable(
  components: EcsComponentDoc[],
  path: readonly string[],
): EcsComponentDoc[] | undefined {
  let current = components;
  for (const segment of path) {
    const next = current.find((component) => component.component === segment);
    if (!next) return undefined;
    current = next.components;
  }
  return current;
}

function allComponents(components: readonly EcsComponentDoc[]): EcsComponentDoc[] {
  return components.flatMap((component) => [component, ...allComponents(component.components)]);
}

function effectIdsInComponents(components: readonly EcsComponentDoc[]): Set<string> {
  const ids = new Set<string>();
  for (const component of allComponents(components)) {
    for (const effect of component.effects) ids.add(effect.id);
  }
  return ids;
}

function componentTypesInComponents(components: readonly EcsComponentDoc[]): Set<string> {
  return new Set(allComponents(components).map((component) => component.component.toLowerCase()));
}

function animationTracksOutsideComponents(
  components: readonly EcsComponentDoc[],
  excludedStudioIds: ReadonlySet<string>,
): AnimationTrackDoc[] {
  return components.flatMap((component) => [
    ...(component.animation && (!component.studioId || !excludedStudioIds.has(component.studioId))
      ? component.animation.tracks
      : []),
    ...animationTracksOutsideComponents(component.components, excludedStudioIds),
  ]);
}

function connectedEffects(
  effects: readonly EcsEffectDoc[],
  root: EcsEffectDoc,
): { effectTree: EcsEffectDoc[]; rootIndex: number } {
  const rootIndex = effects.findIndex((candidate) => candidate.id === root.id);
  if (rootIndex < 0) return { effectTree: [structuredClone(root)], rootIndex: 0 };

  const connectedIds = new Set([root.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const candidate of effects) {
      if (candidate.dependencyOf && connectedIds.has(candidate.dependencyOf) && !connectedIds.has(candidate.id)) {
        connectedIds.add(candidate.id);
        changed = true;
      }
    }
  }

  const effectTree = effects
    .filter((candidate) => connectedIds.has(candidate.id))
    .map((candidate) => structuredClone(candidate));
  const copiedRootIndex = effectTree.findIndex((candidate) => candidate.id === root.id);
  return {
    effectTree,
    rootIndex: copiedRootIndex >= 0 ? copiedRootIndex : 0,
  };
}

function effectIdsInEffects(effects: readonly EcsEffectDoc[]): Set<string> {
  return new Set(effects.map((effect) => effect.id));
}

function cloneEffectTree(
  effects: readonly EcsEffectDoc[],
  effectIds: ReadonlyMap<string, string>,
  scope?: string,
): EcsEffectDoc[] {
  return effects.map((effect) => {
    const cloned = {
      ...structuredClone(effect),
      id: effectIds.get(effect.id) ?? createEffectId(effect.effect, scope),
    };
    const dependencyOf = effect.dependencyOf ? effectIds.get(effect.dependencyOf) : undefined;
    if (dependencyOf) return { ...cloned, dependencyOf };
    delete cloned.dependencyOf;
    return cloned;
  });
}

function effectOwnedComponents(
  components: readonly EcsComponentDoc[],
  effects: readonly EcsEffectDoc[],
): EcsComponentDoc[] {
  const output: EcsComponentDoc[] = [];
  const visit = (candidates: readonly EcsComponentDoc[]): void => {
    for (const component of candidates) {
      const ownsCopiedEffect =
        component.dependencyOf &&
        component.animation?.tracks.some((track) =>
          effects.some(
            (effect) =>
              effect.effect === component.dependencyOf &&
              effect.id === effectIdFromAnimationTarget(track.target),
          ),
        );
      if (ownsCopiedEffect) {
        output.push(structuredClone(component));
      }
      visit(component.components);
    }
  };
  visit(components);
  return output;
}

function effectSubtreeIds(effects: readonly EcsEffectDoc[], rootId: string): Set<string> {
  const ids = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const effect of effects) {
      if (effect.dependencyOf && ids.has(effect.dependencyOf) && !ids.has(effect.id)) {
        ids.add(effect.id);
        changed = true;
      }
    }
  }
  return ids;
}

function replaceEffectTree(
  effects: readonly EcsEffectDoc[],
  targetEffectId: string | undefined,
  effectTree: readonly EcsEffectDoc[],
  rootIndex: number,
): { effects: EcsEffectDoc[]; removedIds: Set<string> } {
  const targetIndex = targetEffectId ? effects.findIndex((effect) => effect.id === targetEffectId) : -1;
  const removedIds = targetIndex >= 0 ? effectSubtreeIds(effects, targetEffectId!) : new Set<string>();
  const removedBeforeTarget =
    targetIndex >= 0 ? effects.slice(0, targetIndex).filter((effect) => removedIds.has(effect.id)).length : 0;
  const filtered = effects.filter((effect) => !removedIds.has(effect.id));
  const insertAt =
    targetIndex >= 0
      ? Math.max(0, Math.min(filtered.length, targetIndex - removedBeforeTarget - rootIndex))
      : filtered.length;
  filtered.splice(insertAt, 0, ...structuredClone(effectTree));
  return { effects: filtered, removedIds };
}

function removeEffectOwnedComponents(
  components: readonly EcsComponentDoc[],
  effects: readonly EcsEffectDoc[],
  removedEffectIds: ReadonlySet<string>,
): EcsComponentDoc[] {
  if (removedEffectIds.size === 0) return components.map((component) => structuredClone(component));
  const removedEffectTypes = new Set(effects.map((effect) => effect.effect));
  const removeFrom = (candidates: readonly EcsComponentDoc[]): EcsComponentDoc[] =>
    candidates
      .filter(
        (component) =>
          !(
            component.dependencyOf &&
            removedEffectTypes.has(component.dependencyOf) &&
            component.animation?.tracks.some((track) =>
              removedEffectIds.has(effectIdFromAnimationTarget(track.target) ?? ''),
            )
          ),
      )
      .map((component) => ({
        ...structuredClone(component),
        components: removeFrom(component.components),
      }));
  return removeFrom(components);
}

function connectedSameLevelComponents(
  components: readonly EcsComponentDoc[],
  root: EcsComponentDoc,
): { componentTree: EcsComponentDoc[]; rootIndex: number } {
  const rootIndex = componentIndex(components, root.component, root.studioId);
  if (rootIndex < 0) return { componentTree: [structuredClone(root)], rootIndex: 0 };

  const connectedIndexes = new Set([rootIndex]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const candidate of components) {
      const candidateIndex = components.indexOf(candidate);
      if (connectedIndexes.has(candidateIndex)) continue;
      const relation = candidate.dependencyOf ?? candidate.attachedTo;
      const connectedTypes = new Set(
        [...connectedIndexes].map((index) => components[index].component),
      );
      if (relation && connectedTypes.has(relation)) {
        connectedIndexes.add(candidateIndex);
        changed = true;
      }
      if (
        relation &&
        [...connectedIndexes].some((index) => components[index].component === candidate.component)
      ) {
        const relatedIndex = components.findIndex((component) => component.component === relation);
        if (relatedIndex >= 0 && !connectedIndexes.has(relatedIndex)) {
          connectedIndexes.add(relatedIndex);
          changed = true;
        }
      }
    }
  }

  const componentTree = components
    .filter((_, index) => connectedIndexes.has(index))
    .map((candidate) => structuredClone(candidate));
  const copiedRootIndex = [...connectedIndexes].sort((left, right) => left - right).indexOf(rootIndex);
  return {
    componentTree,
    rootIndex: copiedRootIndex >= 0 ? copiedRootIndex : 0,
  };
}

function cloneComponentTree(
  components: readonly EcsComponentDoc[],
  effectIds: ReadonlyMap<string, string>,
  scope?: string,
): EcsComponentDoc[] {
  return components.map((component) => ({
    ...structuredClone(component),
    studioId: createStudioComponentId(),
    effects: component.effects.map((effect) => ({
      ...structuredClone(effect),
      id: effectIds.get(effect.id) ?? createEffectId(effect.effect, scope),
    })),
    components: cloneComponentTree(component.components, effectIds, scope),
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

function sourceComponentAtPath(source: ComponentCopySource): EcsComponentDoc {
  const path = source.parentPath ?? [];
  const sourceList = componentListAtPath(source.entity.components, path);
  const sourceIndex = sourceList
    ? componentIndex(sourceList, source.component.component, source.component.studioId)
    : -1;
  const sourceComponent = (sourceIndex >= 0 ? sourceList?.[sourceIndex] : undefined) ?? source.component;
  return structuredClone(sourceComponent);
}

/**
 * Resolve a component by its stable Studio identity before falling back to its
 * type. Multiple animation components are valid on one entity, so a type-only
 * match can copy or replace the wrong animation.
 */
function componentIndex(
  components: readonly EcsComponentDoc[],
  componentType: string,
  studioId?: string,
): number {
  if (studioId !== undefined) {
    const identityIndex = components.findIndex((component) => component.studioId === studioId);
    if (identityIndex >= 0) return identityIndex;
  }
  return components.findIndex((component) => component.component === componentType);
}

export function createComponentCopyPayload(source: ComponentCopySource, sourceEntityLabel: string): ComponentCopyPayload {
  const parentPath = [...(source.parentPath ?? [])];
  const sourceComponents = mergeEntityComponentsForDisplay(source.entity);
  const root = sourceComponentAtPath({ ...source, entity: { ...source.entity, components: sourceComponents } });
  const sourceList = componentListAtPath(sourceComponents, parentPath);
  const sameLevel = sourceList ? connectedSameLevelComponents(sourceList, root) : { componentTree: [root], rootIndex: 0 };
  const componentTreeForMatching = sameLevel.componentTree;
  const effectIds = effectIdsInComponents(componentTreeForMatching);
  const componentTypes = componentTypesInComponents(componentTreeForMatching);
  const copiedAnimationStudioIds = new Set(
    allComponents(componentTreeForMatching)
      .map((component) => component.studioId)
      .filter((studioId): studioId is string => studioId !== undefined),
  );
  const externalAnimationTracks = animationTracksOutsideComponents(source.entity.components, copiedAnimationStudioIds).filter((track) => {
    const effectId = effectIdFromAnimationTarget(track.target);
    const parsed = parseAnimationTarget(track.target);
    const targetsCopiedTree =
      (effectId !== undefined && effectIds.has(effectId)) ||
      Boolean(parsed && parsed.effectId === undefined && componentTypes.has(parsed.owner.toLowerCase()));
    return targetsCopiedTree;
  });

  return {
    kind: 'component',
    sourceEntityId: source.entity.id,
    sourceEntityLabel,
    itemLabel: source.itemLabel,
    component: structuredClone(root),
    componentTree: componentTreeForMatching,
    rootIndex: sameLevel.rootIndex,
    parentPath,
    externalAnimationTracks: structuredClone(externalAnimationTracks),
  };
}

export function createEffectCopyPayload(source: EffectCopySource, sourceEntityLabel: string): ComponentCopyPayload {
  const sourceEffects = source.ownerComponent?.effects ?? source.entity.effects;
  const connected = connectedEffects(sourceEffects, source.effect);
  const copiedEffectIds = effectIdsInEffects(connected.effectTree);
  const dependentComponents = source.ownerComponent
    ? []
    : effectOwnedComponents(source.entity.components, connected.effectTree);
  const dependentComponentStudioIds = new Set(
    allComponents(dependentComponents)
      .map((component) => component.studioId)
      .filter((studioId): studioId is string => studioId !== undefined),
  );
  const animationTracks = animationTracksOutsideComponents(source.entity.components, dependentComponentStudioIds).filter((track) =>
    copiedEffectIds.has(effectIdFromAnimationTarget(track.target) ?? ''),
  );
  return {
    kind: 'effect',
    sourceEntityId: source.entity.id,
    sourceEntityLabel,
    itemLabel: source.itemLabel,
    effect: structuredClone(connected.effectTree[connected.rootIndex] ?? source.effect),
    effectTree: connected.effectTree,
    rootIndex: connected.rootIndex,
    ownerComponentType: source.ownerComponent?.component,
    ownerComponentPath: source.ownerComponentPath ? [...source.ownerComponentPath] : undefined,
    ownerComponentStudioId: source.ownerComponent?.studioId,
    dependentComponents,
    animationTracks: structuredClone(animationTracks),
  };
}

function componentTemplateAtPath(
  templates: readonly ComponentTemplate[],
  path: readonly string[],
  componentType: string,
): ComponentTemplate | undefined {
  let current = templates;
  for (const segment of path) {
    const next = current.find((template) => template.component === segment);
    if (!next?.components) return undefined;
    current = next.components;
  }
  return current.find((template) => template.component === componentType);
}

function componentAllowedForEntity(template: ComponentTemplate | undefined, entity: EcsEntityDoc): boolean {
  return Boolean(template && (!template.allowedEntities || template.allowedEntities.includes(entity.entity)));
}

export function canPasteComponent(
  payload: ComponentCopyPayload | null,
  entity: EcsEntityDoc,
  target: ComponentPasteTarget,
): payload is ComponentCopyPayload & { kind: 'component' } {
  if (!payload || payload.kind !== 'component') return false;
  if (entity.id === payload.sourceEntityId) return false;
  if (payload.component.component !== target.componentType) return false;
  if (!componentListAtPath(mergeEntityComponentsForDisplay(entity), target.parentPath)) return false;
  const template = componentTemplateAtPath(schemaForEntity(entity), target.parentPath, target.componentType);
  return componentAllowedForEntity(template, entity);
}

export function canPasteEffect(
  payload: ComponentCopyPayload | null,
  entity: EcsEntityDoc,
  target: EffectPasteTarget,
  effectType?: string,
): payload is ComponentCopyPayload & { kind: 'effect' } {
  if (!payload || payload.kind !== 'effect') return false;
  if (entity.id === payload.sourceEntityId) return false;
  if (effectType !== undefined && payload.effect.effect !== effectType) return false;
  if (payload.ownerComponentType !== target.ownerComponentType) return false;
  if (target.ownerComponentType && !findComponentInDisplay(mergeEntityComponentsForDisplay(entity), target)) return false;
  const supported = target.ownerComponentType
    ? effectSlotsForComponent(target.ownerComponentType)
    : effectSlotsForEntity(entity.entity);
  return supported.some((template) => template.effect === payload.effect.effect);
}

export function findCompatiblePasteTarget(
  entity: EcsEntityDoc,
  payload: ComponentCopyPayload | null,
): CompatiblePasteTarget | undefined {
  if (!payload) return undefined;

  if (payload.kind === 'component') {
    const target: ComponentPasteTarget = {
      componentType: payload.component.component,
      parentPath: payload.parentPath,
    };
    if (!canPasteComponent(payload, entity, target)) return undefined;
    return {
      kind: 'component',
      label: payload.itemLabel,
      target,
    };
  }

  const target: EffectPasteTarget = {
    ownerComponentType: payload.ownerComponentType,
    ownerComponentPath: payload.ownerComponentPath,
    ownerComponentStudioId: payload.ownerComponentStudioId,
  };
  if (!canPasteEffect(payload, entity, target, payload.effect.effect)) return undefined;
  return {
    kind: 'effect',
    label: payload.itemLabel,
    target,
  };
}

function replaceComponentTreeAtPath(
  components: EcsComponentDoc[],
  path: readonly string[],
  target: ComponentPasteTarget,
  componentTree: readonly EcsComponentDoc[],
  rootIndex: number,
): { components: EcsComponentDoc[]; removed: EcsComponentDoc[] } {
  const list = componentListAtPathMutable(components, path);
  if (!list) return { components, removed: [] };
  const targetIndex = componentIndex(list, target.componentType, target.studioId);
  const copiedTypes = new Set(componentTree.map((component) => component.component));
  const shouldRemove = (component: EcsComponentDoc, index: number): boolean => {
    const isRoot = index === targetIndex;
    const isRelated = copiedTypes.has(component.component);
    return isRoot || isRelated;
  };
  const anchor = targetIndex >= 0 ? targetIndex : list.findIndex((component) => copiedTypes.has(component.component));
  const insertionAnchor = anchor >= 0 ? anchor : list.length;
  const removedBeforeAnchor = list.slice(0, insertionAnchor).filter((component, index) => shouldRemove(component, index)).length;
  const removed: EcsComponentDoc[] = [];
  const filtered = list.filter((component, index) => {
    const remove = shouldRemove(component, index);
    if (remove) removed.push(component);
    return !remove;
  });
  const insertAt = Math.max(0, Math.min(filtered.length, insertionAnchor - removedBeforeAnchor - rootIndex));
  filtered.splice(insertAt, 0, ...structuredClone(componentTree));
  list.splice(0, list.length, ...filtered);
  return { components, removed };
}

function removeAnimationTracksForEffectIds(entity: EcsEntityDoc, effectIds: ReadonlySet<string>): EcsEntityDoc {
  if (effectIds.size === 0) return entity;
  const rewrite = (components: EcsComponentDoc[]): EcsComponentDoc[] =>
    components.map((component) => ({
      ...component,
      components: rewrite(component.components),
      ...(component.animation
        ? {
            animation: {
              ...component.animation,
              tracks: component.animation.tracks.filter((track) => {
                const effectId = effectIdFromAnimationTarget(track.target);
                return effectId === undefined || !effectIds.has(effectId);
              }),
            },
          }
        : {}),
    }));
  return { ...entity, components: rewrite(entity.components) };
}

function appendAnimationTracks(
  entity: EcsEntityDoc,
  tracks: readonly AnimationTrackDoc[],
): EcsEntityDoc {
  if (tracks.length === 0) return entity;
  const display = mergeEntityComponentsForDisplay(entity);
  const animation = allComponents(display).find((component) => component.component === 'animation');
  if (animation?.animation) {
    const appendToComponent = (components: EcsComponentDoc[]): EcsComponentDoc[] =>
      components.map((component) => {
        if (component.studioId === animation.studioId) {
          return {
            ...component,
            animation: {
              ...component.animation!,
              enabled: true,
              preset: 'custom',
              phase: 'custom',
              playbackMode: component.animation!.playbackMode,
              parameters: {},
              tracks: [...component.animation!.tracks, ...structuredClone(tracks)],
            },
          };
        }
        return { ...component, components: appendToComponent(component.components) };
      });
    return { ...entity, components: reduceEntityComponents(appendToComponent(display), entity) };
  }

  const template = schemaForEntity(entity).find((candidate) => candidate.component === 'animation');
  if (!template) return entity;
  const created = instantiateComponentTemplate(template, true);
  if (!created.animation) return entity;
  created.animation = {
    ...created.animation,
    enabled: true,
    preset: 'custom',
    phase: 'custom',
    playbackMode: created.animation.playbackMode,
    parameters: {},
    tracks: [...structuredClone(tracks)],
  };
  return {
    ...entity,
    components: reduceEntityComponents([...display, created], entity),
  };
}

function findComponentInDisplay(
  components: readonly EcsComponentDoc[],
  target: EffectPasteTarget,
): EcsComponentDoc | undefined {
  const path = target.ownerComponentPath ?? [];
  const list = componentListAtPath(components, path);
  if (!list) return undefined;
  const index = componentIndex(list, target.ownerComponentType ?? '', target.ownerComponentStudioId);
  return index >= 0 ? list[index] : undefined;
}

function updateComponentByTarget(
  components: EcsComponentDoc[],
  target: EffectPasteTarget,
  updater: (component: EcsComponentDoc) => EcsComponentDoc,
): EcsComponentDoc[] {
  const path = target.ownerComponentPath ?? [];
  const list = componentListAtPathMutable(components, path);
  if (!list) return components;
  const index = componentIndex(list, target.ownerComponentType ?? '', target.ownerComponentStudioId);
  if (index < 0) return components;
  list[index] = updater(list[index]);
  return components;
}

function effectOwnerAtTarget(
  components: readonly EcsComponentDoc[],
  target: EffectDuplicateTarget,
): EcsComponentDoc | undefined {
  if (!target.ownerComponentType) return undefined;
  return findComponentInDisplay(components, target);
}

function componentDuplicateLimit(component: EcsComponentDoc): number {
  return component.allowedQuantity ?? Number.POSITIVE_INFINITY;
}

function effectDuplicateLimit(
  entity: EcsEntityDoc,
  target: EffectDuplicateTarget,
  effect: EcsEffectDoc,
): number {
  const template = target.ownerComponentType
    ? effectSlotsForComponent(target.ownerComponentType).find((candidate) => candidate.effect === effect.effect)
    : effectSlotsForEntity(entity.entity).find((candidate) => candidate.effect === effect.effect);
  return template ? (template.allowedQuantity ?? Number.POSITIVE_INFINITY) : 0;
}

export function canDuplicateComponent(entity: EcsEntityDoc, target: ComponentPasteTarget): boolean {
  const display = mergeEntityComponentsForDisplay(entity);
  const list = componentListAtPath(display, target.parentPath);
  const sourceIndex = list ? componentIndex(list, target.componentType, target.studioId) : -1;
  const source = sourceIndex >= 0 ? list?.[sourceIndex] : undefined;
  if (!source || source.dependencyOf || source.attachedTo) return false;
  const count = list?.filter((component) => component.component === source.component).length ?? 0;
  return componentDuplicateLimit(source) > count;
}

export function canDuplicateEffect(entity: EcsEntityDoc, target: EffectDuplicateTarget): boolean {
  if (!target.ownerComponentType && !entity.effects.some((effect) => effect.id === target.effectId)) return false;
  const display = mergeEntityComponentsForDisplay(entity);
  const owner = effectOwnerAtTarget(display, target);
  if (target.ownerComponentType && !owner) return false;
  const effects = owner ? owner.effects : entity.effects;
  const source = effects.find((effect) => effect.id === target.effectId);
  if (!source) return false;
  const count = effects.filter((effect) => effect.effect === source.effect).length;
  return effectDuplicateLimit(entity, target, source) > count;
}

export function duplicateComponentIntoEntity(
  targetEntity: EcsEntityDoc,
  target: ComponentPasteTarget,
): EcsEntityDoc {
  const display = mergeEntityComponentsForDisplay(targetEntity);
  const sourceList = componentListAtPath(display, target.parentPath);
  const sourceIndex = sourceList ? componentIndex(sourceList, target.componentType, target.studioId) : -1;
  const source = sourceIndex >= 0 ? sourceList?.[sourceIndex] : undefined;
  if (!source || !canDuplicateComponent(targetEntity, target)) return targetEntity;

  const sameLevel = connectedSameLevelComponents(sourceList ?? [], source);
  const scope = effectScopeForEntity(targetEntity.entity, targetEntity.id);
  const effectIds = createEffectIdMap(sameLevel.componentTree, [], scope);
  const copiedStudioIds = new Set(
    allComponents(sameLevel.componentTree)
      .map((component) => component.studioId)
      .filter((studioId): studioId is string => studioId !== undefined),
  );
  const copiedEffectIds = effectIdsInComponents(sameLevel.componentTree);
  const copiedComponentTypes = componentTypesInComponents(sameLevel.componentTree);
  const externalAnimationTracks = animationTracksOutsideComponents(targetEntity.components, copiedStudioIds).filter((track) => {
    const effectId = effectIdFromAnimationTarget(track.target);
    const parsed = parseAnimationTarget(track.target);
    return (
      (effectId !== undefined && copiedEffectIds.has(effectId)) ||
      Boolean(parsed && parsed.effectId === undefined && copiedComponentTypes.has(parsed.owner.toLowerCase()))
    );
  });
  const clonedTree = cloneComponentTree(sameLevel.componentTree, effectIds, scope).map((component) =>
    normalizeLayoutMotionComponentForEntity(component, targetEntity.entity),
  );
  if (sourceIndex < 0) return targetEntity;

  const nextComponents = [...display];
  const targetList = componentListAtPathMutable(nextComponents, target.parentPath);
  if (!targetList) return targetEntity;
  targetList.splice(sourceIndex + sameLevel.componentTree.length, 0, ...clonedTree);
  const reducedComponents = reduceEntityComponents(nextComponents, targetEntity);
  return appendAnimationTracks(
    { ...targetEntity, components: reducedComponents },
    remapAnimationTracks(externalAnimationTracks, effectIds),
  );
}

export function duplicateEffectIntoEntity(
  targetEntity: EcsEntityDoc,
  target: EffectDuplicateTarget,
): EcsEntityDoc {
  const display = mergeEntityComponentsForDisplay(targetEntity);
  const owner = effectOwnerAtTarget(display, target);
  if (target.ownerComponentType && !owner) return targetEntity;
  const effects = owner ? owner.effects : targetEntity.effects;
  const sourceIndex = effects.findIndex((effect) => effect.id === target.effectId);
  const source = sourceIndex >= 0 ? effects[sourceIndex] : undefined;
  if (!source || !canDuplicateEffect(targetEntity, target)) return targetEntity;

  const connected = connectedEffects(effects, source);
  const scope = effectScopeForEntity(targetEntity.entity, targetEntity.id);
  const effectIds = createEffectIdMap([], connected.effectTree, scope);
  const duplicatedEffects = cloneEffectTree(connected.effectTree, effectIds, scope);
  const sourceEffectIds = effectIdsInEffects(connected.effectTree);
  const dependentComponents = target.ownerComponentType
    ? []
    : effectOwnedComponents(targetEntity.components, connected.effectTree);
  const dependentComponentStudioIds = new Set(
    allComponents(dependentComponents)
      .map((component) => component.studioId)
      .filter((studioId): studioId is string => studioId !== undefined),
  );
  const remappedTracks = remapAnimationTracks(
    animationTracksOutsideComponents(targetEntity.components, dependentComponentStudioIds).filter((track) =>
      sourceEffectIds.has(effectIdFromAnimationTarget(track.target) ?? ''),
    ),
    effectIds,
  );
  const duplicatedComponents = cloneComponentTree(dependentComponents, effectIds, scope);
  const sourceSubtreeIds = effectSubtreeIds(effects, source.id);
  const sourceSubtreeEndIndex =
    Math.max(...effects.map((effect, index) => (sourceSubtreeIds.has(effect.id) ? index : -1))) + 1;

  if (target.ownerComponentType) {
    if (!owner) return targetEntity;
    const nextComponents = updateComponentByTarget(display, target, (component) => {
      const nextEffects = [...component.effects];
      nextEffects.splice(sourceSubtreeEndIndex, 0, ...duplicatedEffects);
      return { ...component, effects: nextEffects };
    });
    return appendAnimationTracks(
      {
        ...targetEntity,
        components: reduceEntityComponents(nextComponents, targetEntity),
      },
      remappedTracks,
    );
  }

  const nextEffects = [...targetEntity.effects];
  nextEffects.splice(sourceSubtreeEndIndex, 0, ...duplicatedEffects);
  const nextComponents = reduceEntityComponents(
    [...mergeEntityComponentsForDisplay(targetEntity), ...duplicatedComponents],
    targetEntity,
  );
  return appendAnimationTracks({ ...targetEntity, components: nextComponents, effects: nextEffects }, remappedTracks);
}

export function pasteComponentIntoEntity(
  targetEntity: EcsEntityDoc,
  payload: ComponentCopyPayload,
  target: ComponentPasteTarget,
): EcsEntityDoc {
  if (!canPasteComponent(payload, targetEntity, target)) return targetEntity;
  const scope = effectScopeForEntity(targetEntity.entity, targetEntity.id);
  const effectIds = createEffectIdMap(payload.componentTree, [], scope);
  const pastedTree = cloneComponentTree(payload.componentTree, effectIds, scope).map((component) =>
    normalizeLayoutMotionComponentForEntity(component, targetEntity.entity),
  );
  const targetList = componentListAtPath(mergeEntityComponentsForDisplay(targetEntity), [...target.parentPath]);
  const existingTargetIndex = targetList
    ? componentIndex(targetList, target.componentType, target.studioId)
    : -1;
  const existingTarget = existingTargetIndex >= 0 ? targetList?.[existingTargetIndex] : undefined;
  if (existingTarget && pastedTree[payload.rootIndex]) {
    pastedTree[payload.rootIndex] = {
      ...pastedTree[payload.rootIndex],
      studioId: existingTarget.studioId,
    };
  }
  const initialReplacement = replaceComponentTreeAtPath(
    mergeEntityComponentsForDisplay(targetEntity),
    target.parentPath,
    target,
    pastedTree,
    payload.rootIndex,
  );
  const removedComponentTypes = new Set(
    initialReplacement.removed.flatMap((component) => allComponents([component]).map((candidate) => candidate.component)),
  );
  const targetWithoutStaleTracks = removeAnimationTracksForComponentTypes(targetEntity, [...removedComponentTypes]);
  const replaced = replaceComponentTreeAtPath(
    mergeEntityComponentsForDisplay(targetWithoutStaleTracks),
    target.parentPath,
    target,
    pastedTree,
    payload.rootIndex,
  );
  const removedEffectIds = effectIdsInComponents(replaced.removed);
  const normalized = reduceEntityComponents(replaced.components, targetEntity);
  const withTracks = appendAnimationTracks(
    removeAnimationTracksForEffectIds({ ...targetWithoutStaleTracks, components: normalized }, removedEffectIds),
    remapAnimationTracks(payload.externalAnimationTracks, effectIds),
  );
  return withTracks;
}

export function pasteEffectIntoEntity(
  targetEntity: EcsEntityDoc,
  payload: ComponentCopyPayload,
  target: EffectPasteTarget,
): EcsEntityDoc {
  if (!canPasteEffect(payload, targetEntity, target)) return targetEntity;
  const display = mergeEntityComponentsForDisplay(targetEntity);
  const existingTargetEffect = target.ownerComponentType
    ? findComponentInDisplay(display, target)?.effects.find((effect) => effect.id === target.effectId)
    : targetEntity.effects.find((effect) => effect.id === target.effectId);
  const scope = effectScopeForEntity(targetEntity.entity, targetEntity.id);
  const effectIds = createEffectIdMap([], payload.effectTree, scope);
  if (existingTargetEffect) effectIds.set(payload.effect.id, existingTargetEffect.id);
  const pastedEffects = cloneEffectTree(payload.effectTree, effectIds, scope);
  const pastedDependentComponents = cloneComponentTree(payload.dependentComponents, effectIds, scope);
  const remappedTracks = remapAnimationTracks(payload.animationTracks, effectIds);
  let removedEffectIds = new Set<string>();
  let nextComponents = display;
  let nextEffects = [...targetEntity.effects];

  if (target.ownerComponentType) {
    const owner = findComponentInDisplay(display, target);
    if (!owner) return targetEntity;
    const replacement = replaceEffectTree(owner.effects, target.effectId, pastedEffects, payload.rootIndex);
    removedEffectIds = replacement.removedIds;
    nextComponents = updateComponentByTarget(display, target, (component) => {
      return { ...component, effects: replacement.effects };
    });
  } else {
    const replacement = replaceEffectTree(nextEffects, target.effectId, pastedEffects, payload.rootIndex);
    removedEffectIds = replacement.removedIds;
    nextEffects = replacement.effects;
  }

  const componentsWithoutOwnedDependencies = removeEffectOwnedComponents(
    nextComponents,
    target.ownerComponentType
      ? findComponentInDisplay(display, target)?.effects ?? []
      : targetEntity.effects,
    removedEffectIds,
  );
  const componentsWithPastedDependencies = [
    ...componentsWithoutOwnedDependencies,
    ...pastedDependentComponents,
  ];
  const reducedComponents = reduceEntityComponents(componentsWithPastedDependencies, targetEntity);
  const updated = removeAnimationTracksForEffectIds(
    { ...targetEntity, components: reducedComponents, effects: nextEffects },
    removedEffectIds,
  );
  return appendAnimationTracks(updated, remappedTracks);
}
