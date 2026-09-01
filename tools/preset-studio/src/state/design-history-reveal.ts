import { valuesEqual } from '@/lib/values-equal';
import type {
  AnimationDoc,
  EcsComponentDoc,
  EcsEffectDoc,
  EcsEntityDoc,
  PropertyNode,
} from '@/schema';
import { mergeEntityComponentsForDisplay } from '@/schema';

export interface HistoryRevealTarget {
  entityId: string;
  scopeKey?: string;
  propertyPath?: readonly string[];
}

export interface HistoryReveal {
  before?: HistoryRevealTarget;
  after?: HistoryRevealTarget;
}

interface TargetPair {
  before: HistoryRevealTarget;
  after: HistoryRevealTarget;
}

function makeInspectorStateKey(...segments: Array<string | number>): string {
  return segments.map((segment) => encodeURIComponent(String(segment))).join('/');
}

function appendInspectorStateKey(prefix: string, ...segments: Array<string | number>): string {
  return [prefix, ...segments.map((segment) => encodeURIComponent(String(segment)))].join('/');
}

function componentId(component: EcsComponentDoc, index: number): string {
  return component.studioId ?? `component-${component.component}-${index}`;
}

function componentKey(component: EcsComponentDoc, index: number, siblings: readonly EcsComponentDoc[]): string {
  if (component.studioId) return `id:${component.studioId}`;
  const occurrence = siblings
    .slice(0, index)
    .filter((candidate) => candidate.component === component.component).length;
  return `type:${component.component}:${occurrence}`;
}

function effectKey(effect: EcsEffectDoc): string {
  return effect.id;
}

function componentScope(prefix: string | undefined, component: EcsComponentDoc, index: number): string {
  const own = makeInspectorStateKey('component', componentId(component, index));
  return prefix ? `${prefix}/${own}` : own;
}

function firstChangedPropertyPath(
  previous: Record<string, PropertyNode>,
  next: Record<string, PropertyNode>,
  path: readonly string[] = [],
): string[] | undefined {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const key of keys) {
    const previousNode = previous[key];
    const nextNode = next[key];
    if (!previousNode || !nextNode) return [...path, key];
    if (valuesEqual(previousNode, nextNode)) continue;
    if (previousNode.kind === 'container' && nextNode.kind === 'container') {
      return firstChangedPropertyPath(previousNode.children, nextNode.children, [...path, key]);
    }
    return [...path, key];
  }
  return undefined;
}

function firstChangedObjectPath(
  previous: unknown,
  next: unknown,
  path: readonly string[] = [],
): string[] | undefined {
  if (valuesEqual(previous, next)) return undefined;
  if (Array.isArray(previous) && Array.isArray(next)) {
    const length = Math.max(previous.length, next.length);
    for (let index = 0; index < length; index += 1) {
      const itemPath =
        path.length > 0
          ? [...path.slice(0, -1), `${path[path.length - 1]}[${index}]`]
          : [`[${index}]`];
      const changedPath = firstChangedObjectPath(previous[index], next[index], itemPath);
      if (changedPath) return changedPath;
    }
    return path.length > 0 ? [...path] : undefined;
  }
  if (typeof previous === 'object' && previous !== null && typeof next === 'object' && next !== null) {
    const previousRecord = previous as Record<string, unknown>;
    const nextRecord = next as Record<string, unknown>;
    const keys = new Set([...Object.keys(previousRecord), ...Object.keys(nextRecord)]);
    for (const key of keys) {
      const changedPath = firstChangedObjectPath(previousRecord[key], nextRecord[key], [...path, key]);
      if (changedPath) return changedPath;
    }
  }
  return [...path];
}

function normalizeAnimationPath(
  previous: AnimationDoc | undefined,
  next: AnimationDoc | undefined,
  path: readonly string[],
): readonly string[] {
  if (!previous || !next) return path;
  if (previous.tracks.length === next.tracks.length) {
    for (let index = 0; index < previous.tracks.length; index += 1) {
      if (previous.tracks[index].keyframes.length !== next.tracks[index].keyframes.length) {
        return [`tracks[${index}]`, 'keyframes'];
      }
    }
    return path;
  }
  return ['tracks'];
}

function componentTarget(entityId: string, scopeKey: string, propertyPath?: readonly string[]): HistoryRevealTarget {
  return { entityId, scopeKey, propertyPath };
}

function ownerTarget(entityId: string, scopeKey: string | undefined): HistoryRevealTarget {
  return scopeKey ? { entityId, scopeKey } : { entityId };
}

function compareEffect(
  entityId: string,
  before: EcsEffectDoc,
  after: EcsEffectDoc,
  scopeKey: string,
): TargetPair {
  const propertyPath = firstChangedPropertyPath(before.props, after.props);
  if (propertyPath) {
    return {
      before: componentTarget(entityId, scopeKey, propertyPath),
      after: componentTarget(entityId, scopeKey, propertyPath),
    };
  }
  return {
    before: componentTarget(entityId, scopeKey),
    after: componentTarget(entityId, scopeKey),
  };
}

function compareEffectList(
  entityId: string,
  before: readonly EcsEffectDoc[],
  after: readonly EcsEffectDoc[],
  ownerScopeKey?: string,
  structuralOnly = false,
): TargetPair | undefined {
  const beforeByKey = new Map(before.map((effect) => [effectKey(effect), effect] as const));
  const afterByKey = new Map(after.map((effect) => [effectKey(effect), effect] as const));
  const beforeScopes = new Map(
    before.map((effect) => [
      effectKey(effect),
      ownerScopeKey
        ? appendInspectorStateKey(ownerScopeKey, 'effect', effect.id)
        : makeInspectorStateKey('effect', effect.id),
    ]),
  );
  const afterScopes = new Map(
    after.map((effect) => [
      effectKey(effect),
      ownerScopeKey
        ? appendInspectorStateKey(ownerScopeKey, 'effect', effect.id)
        : makeInspectorStateKey('effect', effect.id),
    ]),
  );
  for (const effect of after) {
    const key = effectKey(effect);
    if (!beforeByKey.has(key)) {
      return {
        before: ownerTarget(entityId, ownerScopeKey),
        after: componentTarget(entityId, afterScopes.get(key) ?? '', []),
      };
    }
  }
  for (const effect of before) {
    const key = effectKey(effect);
    if (!afterByKey.has(key)) {
      return {
        before: componentTarget(entityId, beforeScopes.get(key) ?? '', []),
        after: ownerTarget(entityId, ownerScopeKey),
      };
    }
  }
  const beforeKeys = before.map(effectKey);
  const afterKeys = after.map(effectKey);
  if (!valuesEqual(beforeKeys, afterKeys)) {
    return {
      before: ownerTarget(entityId, ownerScopeKey),
      after: ownerTarget(entityId, ownerScopeKey),
    };
  }
  for (const effect of after) {
    const key = effectKey(effect);
    const previous = beforeByKey.get(key);
    if (!previous) continue;
    if (structuralOnly) continue;
    const change = compareEffect(entityId, previous, effect, afterScopes.get(key) ?? '');
    if (!valuesEqual(previous, effect)) return change;
  }
  return undefined;
}

function compareComponent(
  entityId: string,
  before: EcsComponentDoc,
  after: EcsComponentDoc,
  scopeKey: string,
): TargetPair {
  const propertyPath = firstChangedPropertyPath(before.props, after.props);
  if (propertyPath) {
    return {
      before: componentTarget(entityId, scopeKey, propertyPath),
      after: componentTarget(entityId, scopeKey, propertyPath),
    };
  }
  if (before.animation || after.animation) {
    const animationPath = firstChangedObjectPath(before.animation, after.animation);
    if (animationPath) {
      const normalizedPath = normalizeAnimationPath(before.animation, after.animation, animationPath);
      return {
        before: componentTarget(entityId, scopeKey, normalizedPath),
        after: componentTarget(entityId, scopeKey, normalizedPath),
      };
    }
  }
  const effectChange = compareEffectList(entityId, before.effects, after.effects, scopeKey);
  if (effectChange) return effectChange;
  const nestedChange = compareComponentList(entityId, before.components, after.components, scopeKey);
  if (nestedChange) return nestedChange;
  return {
    before: componentTarget(entityId, scopeKey),
    after: componentTarget(entityId, scopeKey),
  };
}

function compareComponentList(
  entityId: string,
  before: readonly EcsComponentDoc[],
  after: readonly EcsComponentDoc[],
  ownerScopeKey?: string,
  structuralOnly = false,
): TargetPair | undefined {
  const beforeByKey = new Map(before.map((component, index) => [componentKey(component, index, before), component] as const));
  const afterByKey = new Map(after.map((component, index) => [componentKey(component, index, after), component] as const));
  const beforeScopes = new Map(
    before.map((component, index) => [componentKey(component, index, before), componentScope(ownerScopeKey, component, index)] as const),
  );
  const afterScopes = new Map(
    after.map((component, index) => [componentKey(component, index, after), componentScope(ownerScopeKey, component, index)] as const),
  );
  for (const component of after) {
    const key = componentKey(component, after.indexOf(component), after);
    if (!beforeByKey.has(key)) {
      return {
        before: ownerTarget(entityId, ownerScopeKey),
        after: componentTarget(entityId, afterScopes.get(key) ?? ''),
      };
    }
  }
  for (const component of before) {
    const key = componentKey(component, before.indexOf(component), before);
    if (!afterByKey.has(key)) {
      return {
        before: componentTarget(entityId, beforeScopes.get(key) ?? ''),
        after: ownerTarget(entityId, ownerScopeKey),
      };
    }
  }
  const beforeKeys = before.map((component, index) => componentKey(component, index, before));
  const afterKeys = after.map((component, index) => componentKey(component, index, after));
  if (!valuesEqual(beforeKeys, afterKeys)) {
    return {
      before: ownerTarget(entityId, ownerScopeKey),
      after: ownerTarget(entityId, ownerScopeKey),
    };
  }
  for (let index = 0; index < after.length; index += 1) {
    const component = after[index];
    const key = componentKey(component, index, after);
    const previous = beforeByKey.get(key);
    if (!previous) continue;
    if (structuralOnly) {
      const componentScopeKey = afterScopes.get(key) ?? '';
      const effectStructure = compareEffectList(
        entityId,
        previous.effects,
        component.effects,
        componentScopeKey,
        true,
      );
      if (effectStructure) return effectStructure;
      const nestedStructure = compareComponentList(
        entityId,
        previous.components,
        component.components,
        componentScopeKey,
        true,
      );
      if (nestedStructure) return nestedStructure;
      continue;
    }
    const change = compareComponent(entityId, previous, component, afterScopes.get(key) ?? '');
    if (!valuesEqual(previous, component)) return change;
  }
  return undefined;
}

function compareEntityChildren(
  before: EcsEntityDoc,
  after: EcsEntityDoc,
  structuralOnly = false,
): TargetPair | undefined {
  const beforeById = new Map(before.children.map((child) => [child.id, child] as const));
  const afterById = new Map(after.children.map((child) => [child.id, child] as const));
  for (const child of after.children) {
    if (!beforeById.has(child.id)) {
      return {
        before: { entityId: before.id },
        after: { entityId: child.id },
      };
    }
  }
  for (const child of before.children) {
    if (!afterById.has(child.id)) {
      return {
        before: { entityId: child.id },
        after: { entityId: before.id },
      };
    }
  }
  const beforeIds = before.children.map((child) => child.id);
  const afterIds = after.children.map((child) => child.id);
  if (!valuesEqual(beforeIds, afterIds)) {
    return {
      before: { entityId: before.id },
      after: { entityId: after.id },
    };
  }
  for (const child of after.children) {
    const previous = beforeById.get(child.id);
    if (!previous) continue;
    if (structuralOnly) {
      const structure = compareEntityStructure(previous, child);
      if (structure) return structure;
      continue;
    }
    const change = compareEntity(previous, child);
    if (change) return change;
  }
  return undefined;
}

function compareEntityStructure(before: EcsEntityDoc, after: EcsEntityDoc): TargetPair | undefined {
  const componentStructure = compareComponentList(before.id, before.components, after.components, undefined, true);
  if (componentStructure) return componentStructure;
  const effectStructure = compareEffectList(before.id, before.effects, after.effects, undefined, true);
  if (effectStructure) return effectStructure;
  return compareEntityChildren(before, after, true);
}

function compareEntity(before: EcsEntityDoc, after: EcsEntityDoc): TargetPair | undefined {
  const structure = compareEntityStructure(before, after);
  if (structure) return structure;
  const componentChange = compareComponentList(before.id, before.components, after.components);
  if (componentChange) return componentChange;
  const effectChange = compareEffectList(before.id, before.effects, after.effects);
  if (effectChange) return effectChange;
  return compareEntityChildren(before, after);
}

function humanizeHistorySegment(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word[0].toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

function historyPathLabel(path: readonly string[]): string {
  return path.map(humanizeHistorySegment).join('.');
}

function changedHistoryLabel(prefix: string, propertyPath: readonly string[]): string {
  const path = historyPathLabel(propertyPath);
  return path ? `Changed ${prefix}.${path}` : `Changed ${prefix}`;
}

function entityHistoryLabel(entity: EcsEntityDoc): string {
  return humanizeHistorySegment(entity.entity);
}

function componentHistoryLabel(componentLabels: readonly string[]): string {
  return componentLabels.join(' ');
}

function describeEffectListChange(
  entityLabel: string,
  before: readonly EcsEffectDoc[],
  after: readonly EcsEffectDoc[],
  ownerLabels: readonly string[],
  structuralOnly = false,
): string | undefined {
  const beforeByKey = new Map(before.map((effect) => [effectKey(effect), effect] as const));
  const afterByKey = new Map(after.map((effect) => [effectKey(effect), effect] as const));
  const ownerLabel = componentHistoryLabel(ownerLabels);
  for (const effect of after) {
    if (!beforeByKey.has(effectKey(effect))) {
      return `Added ${humanizeHistorySegment(effect.effect)}${ownerLabel ? ` to ${ownerLabel}` : ''}`;
    }
  }
  for (const effect of before) {
    if (!afterByKey.has(effectKey(effect))) {
      return `Removed ${humanizeHistorySegment(effect.effect)}${ownerLabel ? ` from ${ownerLabel}` : ''}`;
    }
  }
  const beforeKeys = before.map(effectKey);
  const afterKeys = after.map(effectKey);
  if (!valuesEqual(beforeKeys, afterKeys)) {
    return `Reordered ${ownerLabel || entityLabel} effects`;
  }
  if (structuralOnly) return undefined;
  for (const effect of after) {
    const previous = beforeByKey.get(effectKey(effect));
    if (!previous) continue;
    const effectLabel = `${ownerLabel ? `${ownerLabel} ` : ''}${humanizeHistorySegment(effect.effect)}`;
    const propertyPath = firstChangedPropertyPath(previous.props, effect.props);
    if (propertyPath) return changedHistoryLabel(`${entityLabel} ${effectLabel}`, propertyPath);
  }
  return undefined;
}

function describeComponentChange(
  entityLabel: string,
  before: EcsComponentDoc,
  after: EcsComponentDoc,
  componentLabels: readonly string[],
  structuralOnly = false,
): string | undefined {
  if (structuralOnly) {
    const effectStructure = describeEffectListChange(entityLabel, before.effects, after.effects, componentLabels, true);
    if (effectStructure) return effectStructure;
    return describeComponentListChange(entityLabel, before.components, after.components, componentLabels, true);
  }
  const componentLabel = componentHistoryLabel(componentLabels);
  const propertyPath = firstChangedPropertyPath(before.props, after.props);
  if (propertyPath) return changedHistoryLabel(`${entityLabel} ${componentLabel}`, propertyPath);
  if (before.animation || after.animation) {
    const animationPath = firstChangedObjectPath(before.animation, after.animation);
    if (animationPath) {
      return changedHistoryLabel(`${entityLabel} ${componentLabel} Animation`, animationPath);
    }
  }
  const effectChange = describeEffectListChange(entityLabel, before.effects, after.effects, componentLabels);
  if (effectChange) return effectChange;
  const nestedChange = describeComponentListChange(entityLabel, before.components, after.components, componentLabels);
  if (nestedChange) return nestedChange;
  return valuesEqual(before, after) ? undefined : `Changed ${entityLabel} ${componentLabel}`;
}

function describeComponentListChange(
  entityLabel: string,
  before: readonly EcsComponentDoc[],
  after: readonly EcsComponentDoc[],
  ownerLabels: readonly string[] = [],
  structuralOnly = false,
): string | undefined {
  const beforeByKey = new Map(
    before.map((component, index) => [componentKey(component, index, before), component] as const),
  );
  const afterByKey = new Map(
    after.map((component, index) => [componentKey(component, index, after), component] as const),
  );
  const ownerLabel = componentHistoryLabel(ownerLabels);
  for (const component of after) {
    if (!beforeByKey.has(componentKey(component, after.indexOf(component), after))) {
      return `Added ${humanizeHistorySegment(component.component)}${ownerLabel ? ` to ${ownerLabel}` : ''}`;
    }
  }
  for (const component of before) {
    if (!afterByKey.has(componentKey(component, before.indexOf(component), before))) {
      return `Removed ${humanizeHistorySegment(component.component)}${ownerLabel ? ` from ${ownerLabel}` : ''}`;
    }
  }
  const beforeKeys = before.map((component, index) => componentKey(component, index, before));
  const afterKeys = after.map((component, index) => componentKey(component, index, after));
  if (!valuesEqual(beforeKeys, afterKeys)) {
    return `Reordered ${ownerLabel || entityLabel} components`;
  }
  for (let index = 0; index < after.length; index += 1) {
    const component = after[index];
    const key = componentKey(component, index, after);
    const previous = beforeByKey.get(key);
    if (!previous) continue;
    const change = describeComponentChange(
      entityLabel,
      previous,
      component,
      [...ownerLabels, humanizeHistorySegment(component.component)],
      structuralOnly,
    );
    if (change) return change;
  }
  return undefined;
}

function describeEntityChange(before: EcsEntityDoc, after: EcsEntityDoc): string | undefined {
  const entityLabel = entityHistoryLabel(after);
  const beforeComponents = mergeEntityComponentsForDisplay(before);
  const afterComponents = mergeEntityComponentsForDisplay(after);
  const componentStructure = describeComponentListChange(entityLabel, beforeComponents, afterComponents, [], true);
  if (componentStructure) return componentStructure;
  const effectStructure = describeEffectListChange(entityLabel, before.effects, after.effects, [], true);
  if (effectStructure) return effectStructure;
  const componentChange = describeComponentListChange(entityLabel, beforeComponents, afterComponents);
  if (componentChange) return componentChange;
  const effectChange = describeEffectListChange(entityLabel, before.effects, after.effects, []);
  if (effectChange) return effectChange;
  const beforeChildren = new Map(before.children.map((child) => [child.id, child] as const));
  const afterChildren = new Map(after.children.map((child) => [child.id, child] as const));
  for (const child of after.children) {
    if (!beforeChildren.has(child.id)) return `Added ${entityHistoryLabel(child)}`;
  }
  for (const child of before.children) {
    if (!afterChildren.has(child.id)) return `Removed ${entityHistoryLabel(child)}`;
  }
  const beforeChildIds = before.children.map((child) => child.id);
  const afterChildIds = after.children.map((child) => child.id);
  if (!valuesEqual(beforeChildIds, afterChildIds)) return `Reordered ${entityLabel} children`;
  for (const child of after.children) {
    const previous = beforeChildren.get(child.id);
    if (!previous) continue;
    const change = describeEntityChange(previous, child);
    if (change) return change;
  }
  return undefined;
}

export function describeDesignChange(before: EcsEntityDoc, after: EcsEntityDoc): string | undefined {
  if (valuesEqual(before, after)) return undefined;
  return describeEntityChange(before, after);
}

export function findDesignHistoryReveal(before: EcsEntityDoc, after: EcsEntityDoc): HistoryReveal | undefined {
  if (valuesEqual(before, after)) return undefined;
  const change = compareEntity(before, after);
  if (!change) {
    return {
      before: { entityId: before.id },
      after: { entityId: after.id },
    };
  }
  return change;
}
