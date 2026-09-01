import { createContext } from 'react';

import { valuesEqual } from '@/lib/values-equal';
import type { HistoryRevealTarget } from '@/state/design-history-reveal';
import {
  EFFECT_TEMPLATES,
  ENTITY_STATES,
  deriveStateFromBase,
  cloneComponentsWithRemappedEffectIds,
  createEffectId,
  createScopedEffectId,
  effectScopeForEntity,
  getNodeAt,
  isStateGroupId,
  materializeStateEntityStyle,
  isStateOverrideEntity,
  mergeEntityComponentsForDisplay,
  parseAnimationTarget,
  reduceEntityComponents,
  type AnimationDoc,
  type AnimationTrackDoc,
  type PropertyPath,
  type LeafDefinition,
  type EcsComponentDoc,
  type EcsEffectDoc,
  type EcsEntityDoc,
  type PropertyNode,
} from '@/schema';
import {
  parseNode,
  serializeNode,
  type ContainerNode,
  type TransitionConfig,
} from '@/schema/property-tree';
import { solidPaint } from '@/schema/paint';

import {
  createEffectCopyPayload,
  pasteEffectIntoEntity,
  type EffectPasteTarget,
} from './component-copy-paste';
import {
  appendInspectorStateKey,
  findEntityById,
  findParentOf,
  makeInspectorStateKey,
  updateEntityById,
  type StateSuffix,
} from './entity-tree';

export interface StateOverrideSource {
  stateSuffix: StateSuffix;
  stateEntityId: string;
  scopeKey: string;
  propertyPath: readonly string[];
  label: string;
}

export interface StateOverrideNavigationTarget extends StateOverrideSource {
  openStateKeys: readonly string[];
}

export interface StateOverrideContextValue {
  sourcesFor: (scopeKey: string, propertyPath: readonly string[]) => readonly StateOverrideSource[];
  navigateToOverride: (source: StateOverrideSource, openStateKeys: readonly string[]) => void;
  pendingNavigation: StateOverrideNavigationTarget | null;
  pendingHistoryNavigation: HistoryRevealTarget | null;
  onHistoryNavigationComplete: () => void;
}

export const StateOverrideContext = createContext<StateOverrideContextValue | null>(null);

export function inspectorComponentId(component: EcsComponentDoc, index: number): string {
  return component.studioId ?? `component-${component.component}-${index}`;
}

export function inspectorComponentScope(parentScope: string | undefined, component: EcsComponentDoc, index: number): string {
  const id = inspectorComponentId(component, index);
  return parentScope
    ? appendInspectorStateKey(parentScope, 'component', id)
    : makeInspectorStateKey('component', id);
}

export function overrideLookupKey(scopeKey: string, propertyPath: readonly string[]): string {
  return `${scopeKey}|${propertyPath.map((segment) => encodeURIComponent(segment)).join('/')}`;
}

/** Inspector card keys that must be open before a property can be scrolled into view. */
export function openStateKeysForProperty(scopeKey: string, propertyPath: readonly string[]): string[] {
  const keys: string[] = [];
  const cloneOffsetSectionSuffix = '/clone-offset';
  const cloneFillSectionSuffix = '/clone-fill';
  const virtualCopiesSectionSuffix = '/virtual-copies';
  if (scopeKey.endsWith(cloneOffsetSectionSuffix)) {
    keys.push(scopeKey.slice(0, -cloneOffsetSectionSuffix.length));
  } else if (scopeKey.endsWith(cloneFillSectionSuffix)) {
    keys.push(scopeKey.slice(0, -cloneFillSectionSuffix.length));
  } else if (scopeKey.endsWith(virtualCopiesSectionSuffix)) {
    keys.push(scopeKey.slice(0, -virtualCopiesSectionSuffix.length));
  } else {
    const copySegment = scopeKey.lastIndexOf('/copy/');
    if (copySegment >= 0) {
      keys.push(`${scopeKey.slice(0, copySegment)}/virtual-copies`);
    }
  }
  const scopeSegments = scopeKey.split('/');
  for (let index = 2; index <= scopeSegments.length; index += 2) {
    keys.push(scopeSegments.slice(0, index).join('/'));
  }
  let current = scopeKey;
  for (const segment of propertyPath.slice(0, -1)) {
    if (segment.includes('[')) continue;
    const next =
      segment === 'childrenAlignment'
        ? `${current}/children-alignment`
        : segment === 'sequencer'
          ? `${current}/sequencing`
        : appendInspectorStateKey(current, segment);
    keys.push(next);
    current = next;
  }
  return keys;
}

function leaf(type: LeafDefinition['type'], value: unknown): LeafDefinition {
  return { kind: 'leaf', type, value };
}

const DEFAULT_BORDER_PROPS: Record<string, PropertyNode> = {
  appliesOn: leaf('string', 'base'),
  enabled: leaf('boolean', true),
  width: leaf('number', 12),
  color: leaf('paint', solidPaint('#000000')),
  position: leaf('string', 'outer'),
  style: leaf('string', 'solid'),
};

const DEFAULT_STROKE_PROPS: Record<string, PropertyNode> = {
  appliesOn: leaf('string', 'base'),
  enabled: leaf('boolean', true),
  style: leaf('string', 'solid'),
  alignment: leaf('string', 'outside'),
  antialiasScale: leaf('number', 2),
  width: leaf('number', 12),
  color: leaf('paint', solidPaint('#00c853')),
  useFontColor: leaf('boolean', false),
  joinType: leaf('string', 'round'),
  capType: leaf('string', 'round'),
  dash: leaf('number', 24),
  gap: leaf('number', 24),
  spacing: leaf('number', 20),
  dashOffset: leaf('number', 0),
  opacity: leaf('number', 1),
};

function effectProps(effect: EcsEffectDoc, hasPreviousEffect: boolean): Record<string, PropertyNode> {
  const template = EFFECT_TEMPLATES.find((candidate) => candidate.effect === effect.effect);
  const defaults = template?.props ?? {};
  let merged =
    effect.effect === 'border'
      ? { ...DEFAULT_BORDER_PROPS, ...defaults, ...effect.props }
      : effect.effect === 'stroke'
        ? { ...DEFAULT_STROKE_PROPS, ...defaults, ...effect.props }
        : { ...defaults, ...effect.props };
  merged = { appliesOn: merged.appliesOn ?? leaf('string', 'base'), ...merged };
  if (!hasPreviousEffect && merged.appliesOn?.kind === 'leaf' && merged.appliesOn.value !== 'base') {
    merged.appliesOn = { ...merged.appliesOn, value: 'base' };
  }
  if (effect.effect === 'motionBlur' || effect.effect === 'streak') {
    const { appliesOn, enabled, steps, angle, distance, maxOpacity, showOriginal, ...rest } = merged;
    merged = {
      appliesOn,
      enabled,
      steps,
      angle,
      distance,
      maxOpacity,
      showOriginal,
      ...rest,
    };
  }
  if (effect.effect !== 'stroke') return merged;
  const styleNode = merged.style;
  const style = styleNode?.kind === 'leaf' && typeof styleNode.value === 'string' ? styleNode.value : 'solid';
  const hidden =
    style === 'dashed'
      ? new Set(['spacing'])
      : style === 'dotted'
        ? new Set(['dash', 'gap'])
        : new Set(['dash', 'gap', 'spacing', 'dashOffset']);
  return Object.fromEntries(Object.entries(merged).filter(([key]) => !hidden.has(key)));
}

function componentIdentity(component: EcsComponentDoc, index: number): string {
  return inspectorComponentId(component, index);
}

interface ComponentScopeEntry {
  component: EcsComponentDoc;
  scopeKey: string;
}

function componentScopeEntries(
  components: readonly EcsComponentDoc[],
  parentScopeKey?: string,
): ComponentScopeEntry[] {
  return components.flatMap((component, index) => {
    const scopeKey = inspectorComponentScope(parentScopeKey, component, index);
    return [
      { component, scopeKey },
      ...componentScopeEntries(component.components, scopeKey),
    ];
  });
}

function propertyPathParts(property: string): string[] {
  return property.split('.').filter((part) => part.length > 0);
}

function hasPropertyPath(props: Record<string, PropertyNode>, propertyPath: readonly string[]): boolean {
  if (propertyPath.length === 0) return false;
  let node = props[propertyPath[0]];
  for (const part of propertyPath.slice(1)) {
    if (node?.kind !== 'container') return false;
    node = node.children[part];
  }
  return node !== undefined;
}

function addOverrideSource(
  output: Map<string, StateOverrideSource[]>,
  key: string,
  source: StateOverrideSource,
): void {
  const existing = output.get(key) ?? [];
  if (existing.some((candidate) => candidate.stateEntityId === source.stateEntityId)) return;
  output.set(key, [...existing, source]);
}

function animationProps(animation: AnimationDoc | undefined): Record<string, PropertyNode> {
  if (!animation) return {};
  const props: Record<string, PropertyNode> = {
    enabled: leaf('boolean', animation.enabled),
    preset: leaf('string', animation.preset),
    phase: leaf('string', animation.phase),
    playbackMode: leaf('string', animation.playbackMode),
    triggerBehavior: leaf('string', animation.triggerBehavior),
    delaySeconds: leaf('number', animation.delaySeconds),
    scope: leaf('string', animation.scope),
    sequencer: {
      kind: 'container',
      wrapping: 'inline',
      children: {
        pattern: leaf('string', animation.sequencer.pattern),
        interval: leaf('number', animation.sequencer.interval),
      },
    },
  };
  if (animation.preset !== 'custom') {
    const parameters: Record<string, PropertyNode> = {};
    for (const [key, value] of Object.entries(animation.parameters)) {
      parameters[key] = leaf(typeof value === 'number' ? 'number' : 'string', value);
    }
    props.parameters = { kind: 'container', wrapping: 'inline', children: parameters };
  } else {
    props.durationSeconds = leaf('number', animation.durationSeconds);
  }
  return props;
}

function animationValueNode(value: unknown): PropertyNode {
  const type: LeafDefinition['type'] =
    typeof value === 'number' ? 'number' : typeof value === 'string' ? 'string' : 'object';
  return leaf(type, value);
}

function animationTrackProps(track: AnimationTrackDoc): Record<string, PropertyNode> {
  const sampling = track.sampling ?? 'interpolate';
  const props: Record<string, PropertyNode> = {
    enabled: leaf('boolean', track.enabled),
    sampling: leaf('string', sampling),
  };
  props.mode = leaf('string', track.mode ?? 'absolute');
  if (sampling !== 'interpolate') {
    props.updateEveryFrame = leaf('boolean', track.updateEveryFrame === true);
  }
  return props;
}

function animationKeyframeProps(
  keyframe: AnimationTrackDoc['keyframes'][number],
  showTime: boolean,
  showCurve: boolean,
): Record<string, PropertyNode> {
  const props: Record<string, PropertyNode> = { value: animationValueNode(keyframe.value) };
  if (showTime) props.time = leaf('number', keyframe.time);
  if (showCurve) props.curve = leaf('string', typeof keyframe.curve === 'string' ? keyframe.curve : 'linear');
  return props;
}

function collectAnimationTrackDifferences(
  baseAnimation: AnimationDoc | undefined,
  sourceAnimation: AnimationDoc | undefined,
  baseScopeKey: string,
  sourceScopeKey: string,
  source: StateOverrideSource,
  output: Map<string, StateOverrideSource[]>,
): void {
  if (!baseAnimation || !sourceAnimation) return;
  const usedBaseTracks = new Set<number>();
  for (const [sourceIndex, sourceTrack] of sourceAnimation.tracks.entries()) {
    let baseIndex = baseAnimation.tracks.findIndex(
      (candidate, candidateIndex) => !usedBaseTracks.has(candidateIndex) && candidate.target === sourceTrack.target,
    );
    if (baseIndex < 0 && !usedBaseTracks.has(sourceIndex) && baseAnimation.tracks[sourceIndex]) baseIndex = sourceIndex;
    if (baseIndex < 0) continue;
    usedBaseTracks.add(baseIndex);
    const baseTrack = baseAnimation.tracks[baseIndex];
    const addDifference = (basePath: readonly string[], sourcePath: readonly string[]) => {
      const key = overrideLookupKey(baseScopeKey, basePath);
      const entry = { ...source, scopeKey: sourceScopeKey, propertyPath: [...sourcePath] };
      addOverrideSource(output, key, entry);
    };

    collectNodeDifferences(animationTrackProps(baseTrack), animationTrackProps(sourceTrack), [], (propertyPath) => {
      addDifference([`tracks[${baseIndex}]`, ...propertyPath], [`tracks[${sourceIndex}]`, ...propertyPath]);
    });

    const sourceSampling = sourceTrack.sampling ?? 'interpolate';
    const sourceKeyframeIndices =
      sourceSampling === 'randomRange'
        ? [...new Set([0, Math.max(0, sourceTrack.keyframes.length - 1)])]
        : sourceTrack.keyframes.map((_, index) => index);
    const lastSourceTime = sourceTrack.keyframes.reduce(
      (latest, keyframe) => Math.max(latest, keyframe.time),
      Number.NEGATIVE_INFINITY,
    );
    for (const sourceKeyframeIndex of sourceKeyframeIndices) {
      const sourceKeyframe = sourceTrack.keyframes[sourceKeyframeIndex];
      const baseKeyframe = baseTrack.keyframes[sourceKeyframeIndex];
      if (!sourceKeyframe || !baseKeyframe) continue;
      const showTime = sourceSampling === 'interpolate';
      const showCurve = showTime && sourceKeyframe.time < lastSourceTime;
      collectNodeDifferences(
        animationKeyframeProps(baseKeyframe, showTime, showCurve),
        animationKeyframeProps(sourceKeyframe, showTime, showCurve),
        [],
        (propertyPath) => {
          addDifference(
            [`tracks[${baseIndex}]`, `keyframes[${sourceKeyframeIndex}]`, ...propertyPath],
            [`tracks[${sourceIndex}]`, `keyframes[${sourceKeyframeIndex}]`, ...propertyPath],
          );
        },
      );
    }
  }
}

function effectNavigation(
  scopeKey: string,
  effect: EcsEffectDoc,
  propertyPath: readonly string[],
): { scopeKey: string; propertyPath: readonly string[] } {
  if (effect.effect !== 'replicator') return { scopeKey, propertyPath };
  const [rootKey, copyId, ...copyPath] = propertyPath;
  if (rootKey === 'copyOverrides' && copyId && copyPath.length > 0) {
    return {
      scopeKey: appendInspectorStateKey(scopeKey, 'copy', copyId),
      propertyPath: copyPath,
    };
  }
  if (rootKey === 'fillMode' || rootKey === 'fillSeed') {
    return {
      scopeKey: appendInspectorStateKey(scopeKey, 'clone-fill'),
      propertyPath,
    };
  }
  if (rootKey === 'position' || rootKey === 'rotation' || rootKey === 'scale' || rootKey === 'opacity') {
    return {
      scopeKey: appendInspectorStateKey(scopeKey, 'clone-offset'),
      propertyPath,
    };
  }
  return { scopeKey, propertyPath };
}

export interface StatePropertyChange {
  scopeKey: string;
  propertyPath: readonly string[];
  anchorScopeKey?: string;
  structure?: StateStructureChange;
}

export interface StateStructureChange {
  kind: 'components' | 'effects';
  ownerScopeKey: string;
  ownerComponentPath?: readonly StateComponentPathSegment[];
  previous: readonly EcsComponentDoc[] | readonly EcsEffectDoc[];
  next: readonly EcsComponentDoc[] | readonly EcsEffectDoc[];
  dependentComponents?: readonly EcsComponentDoc[];
}

export interface StateComponentPathSegment {
  component: string;
  occurrence: number;
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
  if (isRecord(previous) && isRecord(next)) {
    const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
    for (const key of keys) {
      const changedPath = firstChangedObjectPath(previous[key], next[key], [...path, key]);
      if (changedPath) return changedPath;
    }
  }
  return [...path];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizedAnimationPropertyPath(
  previous: AnimationDoc | undefined,
  next: AnimationDoc | undefined,
  propertyPath: readonly string[],
): readonly string[] {
  if (!previous || !next || previous.tracks.length === next.tracks.length) {
    if (previous && next) {
      for (let index = 0; index < previous.tracks.length; index += 1) {
        if (previous.tracks[index].keyframes.length !== next.tracks[index].keyframes.length) {
          return [`tracks[${index}]`, 'keyframes'];
        }
      }
    }
    return propertyPath;
  }
  return ['tracks'];
}

export function changedPropertyChangeForComponent(
  scopeKey: string,
  previous: EcsComponentDoc,
  next: EcsComponentDoc,
): StatePropertyChange | undefined {
  const propsPath = firstChangedPropertyPath(previous.props, next.props);
  if (propsPath) return { scopeKey, propertyPath: propsPath };
  if (previous.animation || next.animation) {
    const animationPath = firstChangedObjectPath(previous.animation, next.animation);
    if (animationPath) {
      return {
        scopeKey,
        propertyPath: normalizedAnimationPropertyPath(previous.animation, next.animation, animationPath),
      };
    }
  }
  if (!valuesEqual(previous.components, next.components)) {
    const addedComponent = next.components.find(
      (candidate) =>
        !previous.components.some(
          (existing) =>
            (candidate.studioId !== undefined && existing.studioId === candidate.studioId) ||
            (candidate.studioId === undefined && existing.component === candidate.component),
        ),
    );
    return {
      scopeKey,
      ...(addedComponent?.studioId
        ? { anchorScopeKey: appendInspectorStateKey(scopeKey, 'component', addedComponent.studioId) }
        : {}),
      propertyPath: ['components'],
      structure: {
        kind: 'components',
        ownerScopeKey: scopeKey,
        previous: previous.components,
        next: next.components,
      },
    };
  }
  if (!valuesEqual(previous.effects, next.effects)) {
    const addedEffect = next.effects.find((candidate) => !previous.effects.some((existing) => existing.id === candidate.id));
    return {
      scopeKey,
      ...(addedEffect ? { anchorScopeKey: appendInspectorStateKey(scopeKey, 'effect', addedEffect.id) } : {}),
      propertyPath: ['effects'],
      structure: {
        kind: 'effects',
        ownerScopeKey: scopeKey,
        previous: previous.effects,
        next: next.effects,
      },
    };
  }
  return undefined;
}

export function changedPropertyPathForComponent(
  previous: EcsComponentDoc,
  next: EcsComponentDoc,
): readonly string[] | undefined {
  return changedPropertyChangeForComponent('', previous, next)?.propertyPath;
}

export function changedPropertyTargetForEffect(
  scopeKey: string,
  previous: EcsEffectDoc,
  next: EcsEffectDoc,
  hasPreviousEffect = true,
): StatePropertyChange | undefined {
  const propsPath = firstChangedPropertyPath(
    effectProps(previous, hasPreviousEffect),
    effectProps(next, hasPreviousEffect),
  );
  if (propsPath) {
    const navigation = effectNavigation(scopeKey, next, propsPath);
    return { scopeKey: navigation.scopeKey, propertyPath: [...navigation.propertyPath] };
  }
  return undefined;
}

export interface AnimationTargetResolution {
  scopeKey: string;
  propertyPath: readonly string[];
}

export function resolveAnimationTarget(
  baseComponents: readonly EcsComponentDoc[],
  baseEffects: readonly EcsEffectDoc[],
  target: string,
): AnimationTargetResolution | undefined {
  const parsed = parseAnimationTarget(target);
  if (!parsed) return undefined;
  const propertyPath = propertyPathParts(parsed.property);
  if (propertyPath.length === 0) return undefined;

  const componentEntries = componentScopeEntries(baseComponents);
  if (parsed.effectId === undefined) {
    const component = componentEntries.find(
      (entry) =>
        entry.component.component.toLowerCase() === parsed.owner.toLowerCase() &&
        hasPropertyPath(entry.component.props, propertyPath),
    );
    if (component) return { scopeKey: component.scopeKey, propertyPath };
    return undefined;
  }

  const componentEffects = componentEntries.flatMap((entry) =>
    entry.component.effects.map((effect, index) => ({
      effect,
      index,
      scopeKey: appendInspectorStateKey(entry.scopeKey, 'effect', effect.id),
    })),
  );
  const entityEffects = baseEffects.map((effect, index) => ({
    effect,
    index,
    scopeKey: makeInspectorStateKey('effect', effect.id),
  }));
  const effect = [...componentEffects, ...entityEffects].find(
    (entry) =>
      entry.effect.effect.toLowerCase() === parsed.owner.toLowerCase() &&
      entry.effect.id === parsed.effectId &&
      hasPropertyPath(effectProps(entry.effect, entry.index > 0), propertyPath),
  );
  if (!effect) return undefined;

  return effectNavigation(effect.scopeKey, effect.effect, propertyPath);
}

function collectAnimationTargetDifferences(
  baseComponents: readonly EcsComponentDoc[],
  baseEffects: readonly EcsEffectDoc[],
  sourceComponents: readonly EcsComponentDoc[],
  source: StateOverrideSource,
  output: Map<string, StateOverrideSource[]>,
): void {
  for (const entry of componentScopeEntries(sourceComponents)) {
    const animation = entry.component.animation;
    if (entry.component.component !== 'animation' || !animation?.enabled || animation.scope !== 'self') continue;
    for (const [trackIndex, track] of animation.tracks.entries()) {
      if (!track.enabled) continue;
      const target = resolveAnimationTarget(baseComponents, baseEffects, track.target);
      if (!target) continue;
      const key = overrideLookupKey(target.scopeKey, target.propertyPath);
      addOverrideSource(output, key, {
        ...source,
        scopeKey: entry.scopeKey,
        propertyPath: [`tracks[${trackIndex}]`],
      });
    }
  }
}

function matchingComponent(
  baseComponents: readonly EcsComponentDoc[],
  sourceComponent: EcsComponentDoc,
  sourceIndex: number,
  used: Set<number>,
): { component: EcsComponentDoc; index: number } | undefined {
  const identity = componentIdentity(sourceComponent, sourceIndex);
  let index = baseComponents.findIndex((component, candidateIndex) => !used.has(candidateIndex) && componentIdentity(component, candidateIndex) === identity);
  if (index < 0) {
    index = baseComponents.findIndex((component, candidateIndex) => !used.has(candidateIndex) && component.component === sourceComponent.component);
  }
  if (index < 0) return undefined;
  used.add(index);
  return { component: baseComponents[index], index };
}

function collectNodeDifferences(
  base: Record<string, PropertyNode>,
  source: Record<string, PropertyNode>,
  path: readonly string[],
  add: (propertyPath: readonly string[]) => void,
): void {
  for (const [key, sourceNode] of Object.entries(source)) {
    const propertyPath = [...path, key];
    const baseNode = base[key];
    if (sourceNode.kind === 'container') {
      collectNodeDifferences(baseNode?.kind === 'container' ? baseNode.children : {}, sourceNode.children, propertyPath, add);
    } else if (
      sourceNode.kind === 'leaf' &&
      baseNode?.kind === 'leaf' &&
      (sourceNode.type === 'list' || sourceNode.type === 'array') &&
      (baseNode.type === 'list' || baseNode.type === 'array') &&
      Array.isArray(sourceNode.value) &&
      Array.isArray(baseNode.value)
    ) {
      const baseItems = baseNode.value as unknown[];
      const sourceItems = sourceNode.value as unknown[];
      let nestedDifference = baseItems.length !== sourceItems.length;
      for (const [index, sourceItem] of sourceItems.entries()) {
        const baseItem = baseItems[index];
        const sourceItemNode = parseNode(sourceItem);
        const baseItemNode = parseNode(baseItem);
        const itemPath = [...path, `${key}[${index}]`];
        if (sourceItemNode?.kind === 'container' && baseItemNode?.kind === 'container') {
          collectNodeDifferences(baseItemNode.children, sourceItemNode.children, itemPath, add);
          nestedDifference = true;
        } else if (!valuesEqual(baseItem, sourceItem)) {
          nestedDifference = true;
          add(itemPath);
        }
      }
      const { value: _baseValue, ...baseMetadata } = baseNode;
      const { value: _sourceValue, ...sourceMetadata } = sourceNode;
      if (!nestedDifference && !valuesEqual(baseMetadata, sourceMetadata)) add(propertyPath);
      if (nestedDifference && baseItems.length !== sourceItems.length) add(propertyPath);
    } else if (!baseNode || !valuesEqual(baseNode, sourceNode)) {
      add(propertyPath);
    }
  }
}

function booleanPropertyValue(node: PropertyNode | undefined): boolean | undefined {
  return node?.kind === 'leaf' && node.type === 'boolean' ? node.value === true : undefined;
}

function componentBranchIsEnabled(component: EcsComponentDoc): boolean {
  if (component.component === 'animation') return component.animation?.enabled !== false;
  return booleanPropertyValue(component.props.enabled) !== false;
}

function effectBranchIsEnabled(effect: EcsEffectDoc, hasPreviousEffect: boolean): boolean {
  return booleanPropertyValue(effectProps(effect, hasPreviousEffect).enabled) !== false;
}

function matchingEffect(
  baseEffects: readonly EcsEffectDoc[],
  sourceEffects: readonly EcsEffectDoc[],
  sourceEffect: EcsEffectDoc,
  sourceIndex: number,
  used: Set<number>,
): { effect: EcsEffectDoc; index: number } | undefined {
  let index = baseEffects.findIndex((candidate, candidateIndex) => !used.has(candidateIndex) && candidate.id === sourceEffect.id);
  if (index < 0) {
    const sourceTypeOrdinal = sourceEffects
      .slice(0, sourceIndex)
      .filter((candidate) => candidate.effect === sourceEffect.effect).length;
    index = baseEffects.findIndex(
      (candidate, candidateIndex) =>
        !used.has(candidateIndex) &&
        candidate.effect === sourceEffect.effect &&
        baseEffects.slice(0, candidateIndex).filter((previous) => previous.effect === sourceEffect.effect).length === sourceTypeOrdinal,
    );
  }
  if (index < 0) {
    return undefined;
  }
  used.add(index);
  return { effect: baseEffects[index], index };
}

function collectEffectDifferences(
  baseEffects: readonly EcsEffectDoc[],
  sourceEffects: readonly EcsEffectDoc[],
  baseComponentScope: string,
  sourceComponentScope: string,
  source: StateOverrideSource,
  output: Map<string, StateOverrideSource[]>,
): void {
  const usedBaseEffects = new Set<number>();
  for (const [sourceIndex, effect] of sourceEffects.entries()) {
    if (!effectBranchIsEnabled(effect, sourceIndex > 0)) continue;
    const baseEntry = matchingEffect(baseEffects, sourceEffects, effect, sourceIndex, usedBaseEffects);
    if (!baseEntry) continue;
    const lookupScopeKey = baseComponentScope
      ? appendInspectorStateKey(baseComponentScope, 'effect', baseEntry.effect.id)
      : makeInspectorStateKey('effect', baseEntry.effect.id);
    const scopeKey = sourceComponentScope
      ? appendInspectorStateKey(sourceComponentScope, 'effect', effect.id)
      : makeInspectorStateKey('effect', effect.id);
    collectNodeDifferences(
      effectProps(baseEntry.effect, baseEntry.index > 0),
      effectProps(effect, sourceIndex > 0),
      [],
      (propertyPath) => {
        const sourceNavigation = effectNavigation(scopeKey, effect, propertyPath);
        const baseNavigation = effectNavigation(lookupScopeKey, baseEntry.effect, propertyPath);
        const entry = {
          ...source,
          scopeKey: sourceNavigation.scopeKey,
          propertyPath: [...sourceNavigation.propertyPath],
        };
        const key = overrideLookupKey(baseNavigation.scopeKey, baseNavigation.propertyPath);
        addOverrideSource(output, key, entry);
      },
    );
  }
}

function collectComponentDifferences(
  baseComponents: readonly EcsComponentDoc[],
  sourceComponents: readonly EcsComponentDoc[],
  baseParentScope: string | undefined,
  sourceParentScope: string | undefined,
  source: StateOverrideSource,
  output: Map<string, StateOverrideSource[]>,
): void {
  const usedBaseComponents = new Set<number>();
  for (const [index, component] of sourceComponents.entries()) {
    if (!componentBranchIsEnabled(component)) continue;
    const match = matchingComponent(baseComponents, component, index, usedBaseComponents);
    if (!match) continue;
    const baseScopeKey = inspectorComponentScope(baseParentScope, match.component, match.index);
    const sourceScopeKey = inspectorComponentScope(sourceParentScope, component, index);
    const baseProps = { ...match.component.props };
    const sourceProps = { ...component.props };
    const baseBorderRadius = baseProps.borderRadius;
    const sourceBorderRadius = sourceProps.borderRadius;
    if (baseBorderRadius?.kind === 'leaf') {
      const { squircle: _squircle, ...withoutSmoothing } = baseBorderRadius;
      baseProps.borderRadius = withoutSmoothing;
    }
    if (sourceBorderRadius?.kind === 'leaf') {
      const { squircle: _squircle, ...withoutSmoothing } = sourceBorderRadius;
      sourceProps.borderRadius = withoutSmoothing;
    }
    const addComponentDifference = (propertyPath: readonly string[]) => {
      const entry = { ...source, scopeKey: sourceScopeKey, propertyPath: [...propertyPath] };
      const key = overrideLookupKey(baseScopeKey, propertyPath);
      addOverrideSource(output, key, entry);
    };
    collectNodeDifferences(baseProps, sourceProps, [], addComponentDifference);
    if (baseBorderRadius?.kind === 'leaf' && sourceBorderRadius?.kind === 'leaf') {
      const baseSmoothing = baseBorderRadius.squircle ?? true;
      const sourceSmoothing = sourceBorderRadius.squircle ?? true;
      if (baseSmoothing !== sourceSmoothing) addComponentDifference(['squircle']);
    }
    collectNodeDifferences(animationProps(match.component.animation), animationProps(component.animation), [], (propertyPath) => {
      const entry = { ...source, scopeKey: sourceScopeKey, propertyPath: [...propertyPath] };
      const key = overrideLookupKey(baseScopeKey, propertyPath);
      addOverrideSource(output, key, entry);
    });
    collectAnimationTrackDifferences(
      match.component.animation,
      component.animation,
      baseScopeKey,
      sourceScopeKey,
      source,
      output,
    );
    collectEffectDifferences(match.component.effects, component.effects, baseScopeKey, sourceScopeKey, source, output);
    collectComponentDifferences(
      match.component.components,
      component.components,
      baseScopeKey,
      sourceScopeKey,
      source,
      output,
    );
  }
}

/** Returns only the other lifecycle states that differ from the family's Default state. */
export function stateOverrideSourcesForEntity(
  root: EcsEntityDoc,
  selectedEntity: EcsEntityDoc,
): Map<string, StateOverrideSource[]> {
  if (!isStateGroupId(selectedEntity.id)) return new Map();
  if (!selectedEntity.id.endsWith(':default')) return new Map();
  const parentInfo = findParentOf(root, selectedEntity.id);
  if (!parentInfo) return new Map();
  const stateKind = selectedEntity.entity;
  const defaultEntity = parentInfo.parent.children.find((child) => child.id === `${stateKind}:default`);
  if (!defaultEntity) return new Map();
  const baseComponents = mergeEntityComponentsForDisplay(defaultEntity);
  const output = new Map<string, StateOverrideSource[]>();

  for (const state of ENTITY_STATES) {
    if (state.suffix === 'default') continue;
    const sourceEntity = parentInfo.parent.children.find((child) => child.id === `${stateKind}:${state.suffix}`);
    if (!sourceEntity || !isStateOverrideEntity(sourceEntity)) continue;
    const source: StateOverrideSource = {
      stateSuffix: state.suffix,
      stateEntityId: sourceEntity.id,
      scopeKey: '',
      propertyPath: [],
      label: state.label,
    };
    const effectiveSourceEntity = materializeStateEntityStyle(parentInfo.parent, sourceEntity);
    const sourceComponents = mergeEntityComponentsForDisplay(effectiveSourceEntity);
    collectComponentDifferences(baseComponents, sourceComponents, undefined, undefined, source, output);
    collectEffectDifferences(defaultEntity.effects, effectiveSourceEntity.effects, '', '', source, output);
    collectAnimationTargetDifferences(baseComponents, defaultEntity.effects, sourceComponents, source, output);
  }

  return output;
}

interface ComponentPathEntry {
  component: EcsComponentDoc;
  index: number;
  siblings: readonly EcsComponentDoc[];
}

interface EffectPathResolution {
  componentPath: ComponentPathEntry[] | null;
  effect: EcsEffectDoc;
  effectIndex: number;
  effects: readonly EcsEffectDoc[];
  specialSegments: readonly string[];
}

type ResolvedStateProperty =
  | {
      kind: 'component';
      sourceNode: PropertyNode;
      sourceComponentPath: ComponentPathEntry[];
      propertyPath: PropertyPath;
    }
  | {
      kind: 'animation';
      sourceValue: unknown;
      sourceComponentPath: ComponentPathEntry[];
      propertyPath: PropertyPath;
    }
  | {
      kind: 'effect';
      sourceNode: PropertyNode;
      sourceEffect: EffectPathResolution;
      rawPropertyPath: PropertyPath;
    };

function decodedScopeSegments(scopeKey: string): string[] {
  return scopeKey.split('/').filter(Boolean).map((segment) => decodeURIComponent(segment));
}

function inspectorPropertyPath(propertyPath: readonly string[]): PropertyPath {
  const output: Array<string | number> = [];
  for (const segment of propertyPath) {
    const match = /^([^[]+)((?:\[\d+\])*)$/.exec(segment);
    if (!match) {
      output.push(segment);
      continue;
    }
    output.push(match[1]);
    const indexes = match[2].match(/\d+/g) ?? [];
    for (const index of indexes) output.push(Number(index));
  }
  return output;
}

function propsContainer(props: Record<string, PropertyNode>): ContainerNode {
  return { kind: 'container', wrapping: 'wrapped', children: props };
}

function emptyNodeForPath(path: PropertyPath): PropertyNode {
  return path[0] === undefined || typeof path[0] === 'string'
    ? { kind: 'container', wrapping: 'inline', children: {} }
    : { kind: 'leaf', type: 'array', value: [] };
}

function setNodeAt(root: PropertyNode, path: PropertyPath, value: PropertyNode): PropertyNode | undefined {
  if (path.length === 0) return structuredClone(value);

  const [head, ...rest] = path;
  if (typeof head === 'string') {
    if (root.kind !== 'container') return undefined;
    const child = root.children[head] ?? emptyNodeForPath(rest);
    const updatedChild = setNodeAt(child, rest, value);
    if (!updatedChild) return undefined;
    return { ...root, children: { ...root.children, [head]: updatedChild } };
  }

  if (root.kind !== 'leaf' || (root.type !== 'list' && root.type !== 'array') || !Array.isArray(root.value)) {
    return undefined;
  }
  const items = [...root.value];
  const rawItem = items[head];
  const item = rawItem === undefined ? emptyNodeForPath(rest) : parseNode(rawItem);
  if (!item) return undefined;
  const updatedItem = setNodeAt(item, rest, value);
  if (!updatedItem) return undefined;
  items[head] = serializeNode(updatedItem);
  return { ...root, value: items };
}

function setTransitionAt(
  root: PropertyNode,
  path: PropertyPath,
  transition: TransitionConfig | undefined,
): PropertyNode | undefined {
  if (path.length === 0) {
    if (root.kind !== 'leaf') return undefined;
    if (valuesEqual(root.transition, transition)) return root;
    return { ...root, transition };
  }

  const [head, ...rest] = path;
  if (typeof head === 'string') {
    if (root.kind !== 'container') return undefined;
    const child = root.children[head];
    if (!child) return undefined;
    const updatedChild = setTransitionAt(child, rest, transition);
    if (!updatedChild) return undefined;
    return { ...root, children: { ...root.children, [head]: updatedChild } };
  }

  if (root.kind !== 'leaf' || (root.type !== 'list' && root.type !== 'array') || !Array.isArray(root.value)) {
    return undefined;
  }
  const rawItem = root.value[head];
  if (rawItem === undefined) return undefined;
  const item = parseNode(rawItem);
  if (!item) return undefined;
  const updatedItem = setTransitionAt(item, rest, transition);
  if (!updatedItem) return undefined;
  const serialized = serializeNode(updatedItem);
  if (serialized === undefined) return undefined;
  const items = [...root.value];
  items[head] = serialized;
  return { ...root, value: items };
}

function getObjectAtPath(root: unknown, path: PropertyPath): unknown {
  let current = root;
  for (const segment of path) {
    if (typeof segment === 'string') {
      if (!isRecord(current)) return undefined;
      current = current[segment];
    } else {
      if (!Array.isArray(current)) return undefined;
      current = current[segment];
    }
  }
  return current;
}

function setObjectAtPath<T>(root: T, path: PropertyPath, value: unknown): T | undefined {
  if (path.length === 0) return structuredClone(value) as T;
  const [head, ...rest] = path;
  if (typeof head === 'string') {
    if (!isRecord(root)) return undefined;
    const child = setObjectAtPath(root[head], rest, value);
    if (child === undefined) return undefined;
    return { ...root, [head]: child } as T;
  }
  if (!Array.isArray(root)) return undefined;
  if (head < 0 || head >= root.length) return undefined;
  const child = setObjectAtPath(root[head], rest, value);
  if (child === undefined) return undefined;
  const output = [...root];
  output[head] = child;
  return output as T;
}

function componentPathForScope(
  components: readonly EcsComponentDoc[],
  scopeSegments: readonly string[],
): ComponentPathEntry[] | undefined {
  if (scopeSegments.length === 0 || scopeSegments.length % 2 !== 0) return undefined;
  let siblings = components;
  const path: ComponentPathEntry[] = [];
  for (let index = 0; index < scopeSegments.length; index += 2) {
    if (scopeSegments[index] !== 'component') return undefined;
    const componentId = scopeSegments[index + 1];
    const componentIndex = siblings.findIndex(
      (component, siblingIndex) => componentIdentity(component, siblingIndex) === componentId,
    );
    if (componentIndex < 0) return undefined;
    const component = siblings[componentIndex];
    path.push({ component, index: componentIndex, siblings });
    siblings = component.components;
  }
  return path;
}

function componentPathForStateSegments(
  components: readonly EcsComponentDoc[],
  segments: readonly StateComponentPathSegment[],
): ComponentPathEntry[] | undefined {
  let siblings = components;
  const path: ComponentPathEntry[] = [];
  for (const segment of segments) {
    let occurrence = 0;
    const index = siblings.findIndex((component) => {
      if (component.component !== segment.component) return false;
      const matches = occurrence === segment.occurrence;
      occurrence += 1;
      return matches;
    });
    if (index < 0) return undefined;
    const component = siblings[index];
    path.push({ component, index, siblings });
    siblings = component.components;
  }
  return path;
}

export function normalizeStatePropertyChangeForEntity(
  root: EcsEntityDoc,
  entityId: string,
  target: StatePropertyChange,
): StatePropertyChange {
  const structure = target.structure;
  if (!structure || structure.ownerComponentPath) return target;
  if (decodedScopeSegments(structure.ownerScopeKey)[0] !== 'component') return target;
  const entity = findEntityById(root, entityId);
  if (!entity) return target;
  const parentInfo = findParentOf(root, entity.id);
  const resolvedEntity = parentInfo ? materializeStateEntityStyle(parentInfo.parent, entity) : entity;
  const sourcePath = componentPathForScope(
    mergeEntityComponentsForDisplay(resolvedEntity),
    decodedScopeSegments(structure.ownerScopeKey),
  );
  if (!sourcePath) return target;
  const ownerComponentPath = sourcePath.map((entry) => ({
    component: entry.component.component,
    occurrence: entry.siblings
      .slice(0, entry.index)
      .filter((candidate) => candidate.component === entry.component.component).length,
  }));
  return {
    ...target,
    structure: {
      ...structure,
      ownerComponentPath,
    },
  };
}

function componentPathMatchingSource(
  components: readonly EcsComponentDoc[],
  sourcePath: readonly ComponentPathEntry[],
): number[] | undefined {
  let siblings = components;
  const indexes: number[] = [];
  for (const sourceEntry of sourcePath) {
    const sourceIdentity = componentIdentity(sourceEntry.component, sourceEntry.index);
    let componentIndex = siblings.findIndex(
      (component, siblingIndex) => componentIdentity(component, siblingIndex) === sourceIdentity,
    );
    if (componentIndex < 0) {
      const sourceOrdinal = sourceEntry.siblings
        .slice(0, sourceEntry.index)
        .filter((component) => component.component === sourceEntry.component.component).length;
      let ordinal = 0;
      componentIndex = siblings.findIndex((component) => {
        if (component.component !== sourceEntry.component.component) return false;
        const matches = ordinal === sourceOrdinal;
        ordinal += 1;
        return matches;
      });
    }
    if (componentIndex < 0) return undefined;
    indexes.push(componentIndex);
    siblings = siblings[componentIndex].components;
  }
  return indexes;
}

function componentPathForIndexes(
  components: readonly EcsComponentDoc[],
  indexes: readonly number[],
): ComponentPathEntry[] | undefined {
  let siblings = components;
  const path: ComponentPathEntry[] = [];
  for (const index of indexes) {
    const component = siblings[index];
    if (!component) return undefined;
    path.push({ component, index, siblings });
    siblings = component.components;
  }
  return path;
}

function updateComponentAtPath(
  components: readonly EcsComponentDoc[],
  indexes: readonly number[],
  updater: (component: EcsComponentDoc) => EcsComponentDoc,
): EcsComponentDoc[] {
  if (indexes.length === 0) return [...components];
  const [head, ...rest] = indexes;
  return components.map((component, index) => {
    if (index !== head) return component;
    if (rest.length === 0) return updater(component);
    return { ...component, components: updateComponentAtPath(component.components, rest, updater) };
  });
}

function matchingComponentIndex(
  sourceComponent: EcsComponentDoc,
  sourceIndex: number,
  sourceSiblings: readonly EcsComponentDoc[],
  targetSiblings: readonly EcsComponentDoc[],
): number {
  const sourceIdentity = componentIdentity(sourceComponent, sourceIndex);
  const identityIndex = targetSiblings.findIndex(
    (component, index) => componentIdentity(component, index) === sourceIdentity,
  );
  if (identityIndex >= 0) return identityIndex;

  const sourceOrdinal = sourceSiblings
    .slice(0, sourceIndex)
    .filter((component) => component.component === sourceComponent.component).length;
  let targetOrdinal = 0;
  return targetSiblings.findIndex((component) => {
    if (component.component !== sourceComponent.component) return false;
    const matches = targetOrdinal === sourceOrdinal;
    targetOrdinal += 1;
    return matches;
  });
}

function mapMatchingEffectIds(
  sourceEffects: readonly EcsEffectDoc[],
  targetEffects: readonly EcsEffectDoc[],
  effectIds: Map<string, string>,
): void {
  const usedTargetIndexes = new Set<number>();
  for (const sourceEffect of sourceEffects) {
    const targetIndex = targetEffects.findIndex(
      (targetEffect, index) =>
        !usedTargetIndexes.has(index) && targetEffect.effect === sourceEffect.effect,
    );
    if (targetIndex < 0) continue;
    usedTargetIndexes.add(targetIndex);
    effectIds.set(sourceEffect.id, targetEffects[targetIndex].id);
  }
}

function mapMatchingEntityEffectIds(
  sourceComponents: readonly EcsComponentDoc[],
  targetComponents: readonly EcsComponentDoc[],
  sourceEffects: readonly EcsEffectDoc[],
  targetEffects: readonly EcsEffectDoc[],
  effectIds: Map<string, string>,
): void {
  mapMatchingEffectIds(sourceEffects, targetEffects, effectIds);

  for (const [sourceIndex, sourceComponent] of sourceComponents.entries()) {
    const targetIndex = matchingComponentIndex(sourceComponent, sourceIndex, sourceComponents, targetComponents);
    if (targetIndex < 0) continue;
    const targetComponent = targetComponents[targetIndex];
    mapMatchingEffectIds(sourceComponent.effects, targetComponent.effects, effectIds);
    mapMatchingEntityEffectIds(
      sourceComponent.components,
      targetComponent.components,
      [],
      [],
      effectIds,
    );
  }
}

function allEffectsInComponents(components: readonly EcsComponentDoc[]): EcsEffectDoc[] {
  return components.flatMap((component) => [
    ...component.effects,
    ...allEffectsInComponents(component.components),
  ]);
}

function copyEffectToEntity(
  entity: EcsEntityDoc,
  sourceEntity: EcsEntityDoc,
  sourceEffect: EffectPathResolution,
): EcsEntityDoc {
  const sourceComponentPath = sourceEffect.componentPath;
  const ownerComponent = sourceComponentPath?.at(-1)?.component;
  const ownerComponentPath = sourceComponentPath?.slice(0, -1).map((entry) => entry.component.component);
  const payload = createEffectCopyPayload(
    {
      entity: sourceEntity,
      effect: sourceEffect.effect,
      itemLabel: sourceEffect.effect.effect,
      ownerComponent,
      ownerComponentPath,
    },
    sourceEntity.id,
  );
  if (payload.kind !== 'effect') return entity;

  const targetDisplayComponents = mergeEntityComponentsForDisplay(entity);
  const targetComponentIndexes = sourceComponentPath
    ? componentPathMatchingSource(targetDisplayComponents, sourceComponentPath)
    : null;
  const targetOwnerComponent = targetComponentIndexes
    ? getComponentAtPath(targetDisplayComponents, targetComponentIndexes)
    : undefined;
  const targetEffects = sourceComponentPath ? (targetOwnerComponent?.effects ?? []) : entity.effects;
  const match = matchingEffect(
    targetEffects,
    sourceEffect.effects,
    sourceEffect.effect,
    sourceEffect.effectIndex,
    new Set(),
  );
  const target: EffectPasteTarget = {
    effectId: match?.effect.id,
    ownerComponentType: ownerComponent?.component,
    ownerComponentPath,
    ownerComponentStudioId: ownerComponent?.studioId,
  };
  const pasted = pasteEffectIntoEntity(entity, payload, target);
  return pasted;
}

function effectIdsOutsideComponent(
  components: readonly EcsComponentDoc[],
  excludedComponent: EcsComponentDoc,
): Set<string> {
  const ids = new Set<string>();
  const visit = (items: readonly EcsComponentDoc[]): void => {
    for (const component of items) {
      if (component === excludedComponent) continue;
      for (const effect of component.effects) ids.add(effect.id);
      visit(component.components);
    }
  };
  visit(components);
  return ids;
}

function componentPathMatchUntilMissing(
  components: readonly EcsComponentDoc[],
  sourcePath: readonly ComponentPathEntry[],
): { indexes: number[]; missingIndex: number } {
  let siblings = components;
  const indexes: number[] = [];
  for (const [sourceIndex, sourceEntry] of sourcePath.entries()) {
    const componentIndex = matchingComponentIndex(
      sourceEntry.component,
      sourceEntry.index,
      sourceEntry.siblings,
      siblings,
    );
    if (componentIndex < 0) return { indexes, missingIndex: sourceIndex };
    indexes.push(componentIndex);
    siblings = siblings[componentIndex].components;
  }
  return { indexes, missingIndex: -1 };
}

function stateCopyEffectIds(
  sourceEntity: EcsEntityDoc,
  targetEntity: EcsEntityDoc,
  sourceComponent: EcsComponentDoc,
  targetComponents: readonly EcsComponentDoc[],
  targetComponent?: EcsComponentDoc,
): Map<string, string> {
  const sourceComponents = mergeEntityComponentsForDisplay(sourceEntity);
  const effectIds = new Map<string, string>();
  mapMatchingEntityEffectIds(
    sourceComponents,
    targetComponents,
    sourceEntity.effects,
    targetEntity.effects,
    effectIds,
  );

  const usedTargetIds = new Set([
    ...targetEntity.effects.map((effect) => effect.id),
    ...allEffectsInComponents(targetComponents).map((effect) => effect.id),
  ]);
  const targetIdsOutsideReplacement = targetComponent
    ? effectIdsOutsideComponent(targetComponents, targetComponent)
    : new Set(usedTargetIds);
  for (const effect of targetEntity.effects) targetIdsOutsideReplacement.add(effect.id);
  const scope = effectScopeForEntity(targetEntity.entity, targetEntity.id);
  for (const effect of allEffectsInComponents([sourceComponent])) {
    const mappedId = effectIds.get(effect.id);
    if (mappedId !== undefined && !targetIdsOutsideReplacement.has(mappedId)) continue;
    effectIds.delete(effect.id);
    let nextId = createScopedEffectId(effect.effect, scope, effect.id);
    if (usedTargetIds.has(nextId)) nextId = createEffectId(effect.effect, scope);
    while (usedTargetIds.has(nextId)) nextId = createEffectId(effect.effect, scope);
    usedTargetIds.add(nextId);
    effectIds.set(effect.id, nextId);
  }
  return effectIds;
}

function updateStateEntityForComponent(
  entity: EcsEntityDoc,
  sourceEntity: EcsEntityDoc,
  sourceComponentPath: readonly ComponentPathEntry[],
  sourceComponent: EcsComponentDoc,
): EcsEntityDoc {
  const displayComponents = mergeEntityComponentsForDisplay(entity);
  const match = componentPathMatchUntilMissing(displayComponents, sourceComponentPath);
  if (match.missingIndex < 0) {
    const targetComponent = getComponentAtPath(displayComponents, match.indexes);
    if (!targetComponent) return entity;
    const effectIds = stateCopyEffectIds(sourceEntity, entity, sourceComponent, displayComponents, targetComponent);
    const clonedComponent = cloneComponentsWithRemappedEffectIds([sourceComponent], effectIds)[0];
    if (!clonedComponent) return entity;
    const nextComponents = updateComponentAtPath(displayComponents, match.indexes, () => clonedComponent);
    const components = reduceEntityComponents(nextComponents, entity);
    return valuesEqual(components, entity.components) ? entity : { ...entity, components };
  }
  const sourceEntry = sourceComponentPath[match.missingIndex];
  const effectIds = stateCopyEffectIds(sourceEntity, entity, sourceEntry.component, displayComponents);
  const clonedComponent = cloneComponentsWithRemappedEffectIds([sourceEntry.component], effectIds)[0];
  if (!clonedComponent) return entity;
  const targetSiblings =
    match.indexes.length === 0
      ? displayComponents
      : getComponentAtPath(displayComponents, match.indexes)?.components;
  if (!targetSiblings) return entity;
  const nextSiblings = [...targetSiblings];
  nextSiblings.splice(Math.min(sourceEntry.index, nextSiblings.length), 0, clonedComponent);
  const nextComponents =
    match.indexes.length === 0
      ? nextSiblings
      : updateComponentAtPath(displayComponents, match.indexes, (component) => ({
          ...component,
          components: nextSiblings,
        }));
  const components = reduceEntityComponents(nextComponents, entity);
  return valuesEqual(components, entity.components) ? entity : { ...entity, components };
}

export function applyComponentToStates(
  root: EcsEntityDoc,
  selectedEntityId: string,
  scopeKey: string,
  sourceComponent: EcsComponentDoc,
  stateSuffixes: readonly StateSuffix[],
): EcsEntityDoc {
  const selectedEntity = findEntityById(root, selectedEntityId);
  if (!selectedEntity || !isStateGroupId(selectedEntity.id)) return root;
  const parentInfo = findParentOf(root, selectedEntity.id);
  if (!parentInfo) return root;
  const sourceComponentPath = componentPathForScope(
    mergeEntityComponentsForDisplay(selectedEntity),
    decodedScopeSegments(scopeKey),
  );
  if (!sourceComponentPath) return root;
  const requestedStateIds = new Set(stateSuffixes.map((suffix) => `${selectedEntity.entity}:${suffix}`));
  const existingStateIds = new Set(parentInfo.parent.children.map((child) => child.id));
  const base = parentInfo.parent.children.find((child) => child.id === `${selectedEntity.entity}:default`);
  const nextChildren = [...parentInfo.parent.children];
  if (base) {
    let insertIndex = nextChildren.findIndex((child) => child.id === base.id) + 1;
    for (const state of ENTITY_STATES) {
      const stateId = `${selectedEntity.entity}:${state.suffix}`;
      if (!requestedStateIds.has(stateId) || existingStateIds.has(stateId)) continue;
      nextChildren.splice(insertIndex, 0, deriveStateFromBase(base, stateId));
      insertIndex += 1;
    }
  }
  const updatedChildren = nextChildren.map((child) =>
    requestedStateIds.has(child.id)
      ? updateStateEntityForComponent(
          materializeStateEntityStyle(parentInfo.parent, child),
          selectedEntity,
          sourceComponentPath,
          sourceComponent,
        )
      : child,
  );
  if (updatedChildren.every((child, index) => child === parentInfo.parent.children[index])) return root;
  return updateEntityById(root, parentInfo.parent.id, (parent) => ({ ...parent, children: updatedChildren }));
}

function effectPathForEntity(
  entity: EcsEntityDoc,
  scopeSegments: readonly string[],
  source?: EffectPathResolution,
): EffectPathResolution | undefined {
  const effectSegmentIndex = scopeSegments.indexOf('effect');
  if (effectSegmentIndex < 0 || !scopeSegments[effectSegmentIndex + 1]) return undefined;
  const componentSegments = scopeSegments.slice(0, effectSegmentIndex);
  const displayComponents = mergeEntityComponentsForDisplay(entity);
  const componentPath =
    componentSegments.length === 0
      ? null
      : source
        ? (() => {
            const indexes = componentPathMatchingSource(displayComponents, source.componentPath ?? []);
            return indexes ? (componentPathForIndexes(displayComponents, indexes) ?? null) : null;
          })()
        : (componentPathForScope(displayComponents, componentSegments) ?? null);
  if (componentSegments.length > 0 && !componentPath) return undefined;
  const component = componentPath ? componentPath[componentPath.length - 1] : undefined;
  const effects = component?.component.effects ?? entity.effects;
  const effectId = scopeSegments[effectSegmentIndex + 1];
  let effectIndex = effects.findIndex((effect) => effect.id === effectId);
  if (effectIndex < 0 && source) {
    const match = matchingEffect(effects, source.effects, source.effect, source.effectIndex, new Set());
    effectIndex = match?.index ?? -1;
  }
  if (effectIndex < 0) return undefined;
  return {
    componentPath,
    effect: effects[effectIndex],
    effectIndex,
    effects,
    specialSegments: scopeSegments.slice(effectSegmentIndex + 2),
  };
}

function rawEffectPropertyPath(
  specialSegments: readonly string[],
  propertyPath: readonly string[],
): PropertyPath {
  if (specialSegments[0] === 'copy' && specialSegments[1]) {
    return ['copyOverrides', specialSegments[1], ...inspectorPropertyPath(propertyPath)];
  }
  return inspectorPropertyPath(propertyPath);
}

type StructureOwner =
  | { kind: 'entity'; entity: EcsEntityDoc }
  | { kind: 'component'; componentPath: ComponentPathEntry[]; component: EcsComponentDoc }
  | { kind: 'effect'; effectPath: EffectPathResolution };

function structureOwnerForEntity(
  entity: EcsEntityDoc,
  scopeKey: string,
  ownerComponentPath?: readonly StateComponentPathSegment[],
): StructureOwner | undefined {
  const scopeSegments = decodedScopeSegments(scopeKey);
  if (scopeSegments[0] === 'entity') return { kind: 'entity', entity };
  if (scopeSegments[0] === 'component' && !scopeSegments.includes('effect')) {
    const displayComponents = mergeEntityComponentsForDisplay(entity);
    const componentPath = ownerComponentPath
      ? componentPathForStateSegments(displayComponents, ownerComponentPath)
      : componentPathForScope(displayComponents, scopeSegments);
    const component = componentPath?.[componentPath.length - 1]?.component;
    return componentPath && component ? { kind: 'component', componentPath, component } : undefined;
  }
  if (scopeSegments[0] === 'effect') {
    const effectPath = effectPathForEntity(entity, scopeSegments);
    return effectPath ? { kind: 'effect', effectPath } : undefined;
  }
  return undefined;
}

type StructuralListKind = 'component' | 'effect';

function structuralItemKey(
  item: EcsComponentDoc | EcsEffectDoc,
  index: number,
  items: readonly (EcsComponentDoc | EcsEffectDoc)[],
  kind: StructuralListKind,
): string {
  if (kind === 'effect') return `effect:${(item as EcsEffectDoc).id}`;
  const component = item as EcsComponentDoc;
  if (component.studioId) return `component:${component.studioId}`;
  const occurrence = items
    .slice(0, index)
    .filter((candidate) => (candidate as EcsComponentDoc).component === component.component).length;
  return `component:${component.component}:${occurrence}`;
}

function mergeStructuralList<T extends EcsComponentDoc | EcsEffectDoc>(
  current: readonly T[],
  next: readonly T[],
  kind: StructuralListKind,
): T[] {
  const currentByKey = new Map(
    current.map((item, index) => [structuralItemKey(item, index, current, kind), item] as const),
  );
  return next.map((item, index) => {
    const existing = currentByKey.get(structuralItemKey(item, index, next, kind));
    return existing ?? structuredClone(item);
  });
}

function applyStructureDependentComponents(
  entity: EcsEntityDoc,
  structure: StateStructureChange,
): EcsEntityDoc {
  if (structure.kind !== 'effects' || !structure.dependentComponents?.length) return entity;
  const displayComponents = mergeEntityComponentsForDisplay(entity);
  const components = [...displayComponents];
  for (const dependency of structure.dependentComponents) {
    const existingIndex = components.findIndex(
      (candidate) =>
        candidate.component === dependency.component &&
        candidate.dependencyOf === dependency.dependencyOf,
    );
    const clonedDependency = structuredClone(dependency);
    if (existingIndex >= 0) components[existingIndex] = clonedDependency;
    else components.push(clonedDependency);
  }
  const reducedComponents = reduceEntityComponents(components, entity);
  return valuesEqual(reducedComponents, entity.components) ? entity : { ...entity, components: reducedComponents };
}

function updateStateEntityForStructure(
  entity: EcsEntityDoc,
  structure: StateStructureChange,
): EcsEntityDoc {
  const owner = structureOwnerForEntity(entity, structure.ownerScopeKey, structure.ownerComponentPath);
  if (!owner) return entity;
  const kind = structure.kind === 'components' ? 'component' : 'effect';
  const nextList = structure.next as readonly (EcsComponentDoc | EcsEffectDoc)[];

  if (owner.kind === 'entity') {
    if (structure.kind === 'components') {
      const current = mergeEntityComponentsForDisplay(entity);
      const components = reduceEntityComponents(
        mergeStructuralList(current, nextList as readonly EcsComponentDoc[], kind),
        entity,
      );
      return applyStructureDependentComponents(
        valuesEqual(components, entity.components) ? entity : { ...entity, components },
        structure,
      );
    }
    const effects = mergeStructuralList(entity.effects, nextList as readonly EcsEffectDoc[], kind);
    return applyStructureDependentComponents(
      valuesEqual(effects, entity.effects) ? entity : { ...entity, effects },
      structure,
    );
  }

  if (owner.kind === 'component') {
    const displayComponents = mergeEntityComponentsForDisplay(entity);
    const indexes = owner.componentPath.map((entry) => entry.index);
    const nextComponents =
      structure.kind === 'components'
        ? updateComponentAtPath(displayComponents, indexes, (component) => ({
            ...component,
            components: mergeStructuralList(
              component.components,
              nextList as readonly EcsComponentDoc[],
              kind,
            ),
          }))
        : updateComponentAtPath(displayComponents, indexes, (component) => ({
            ...component,
            effects: mergeStructuralList(component.effects, nextList as readonly EcsEffectDoc[], kind),
          }));
    const components = reduceEntityComponents(nextComponents, entity);
    return applyStructureDependentComponents(
      valuesEqual(components, entity.components) ? entity : { ...entity, components },
      structure,
    );
  }

  return entity;
}

function resolveStateProperty(
  entity: EcsEntityDoc,
  target: StatePropertyChange,
): ResolvedStateProperty | undefined {
  const scopeSegments = decodedScopeSegments(target.scopeKey);
  const propertyPath = inspectorPropertyPath(target.propertyPath);
  if (scopeSegments[0] === 'component' && !scopeSegments.includes('effect')) {
    const displayComponents = mergeEntityComponentsForDisplay(entity);
    const sourceComponentPath = componentPathForScope(displayComponents, scopeSegments);
    const sourceComponent = sourceComponentPath?.[sourceComponentPath.length - 1]?.component;
    if (!sourceComponent) return undefined;
    if (sourceComponent.component === 'animation' && sourceComponent.animation) {
      const sourceValue = getObjectAtPath(sourceComponent.animation, propertyPath);
      return sourceValue === undefined
        ? undefined
        : { kind: 'animation', sourceValue, sourceComponentPath, propertyPath };
    }
    const sourceNode = getNodeAt(propsContainer(sourceComponent.props), propertyPath);
    return sourceNode ? { kind: 'component', sourceNode, sourceComponentPath, propertyPath } : undefined;
  }
  if (scopeSegments[0] !== 'effect' && !scopeSegments.includes('effect')) return undefined;
  const sourceEffect = effectPathForEntity(entity, scopeSegments);
  if (!sourceEffect) return undefined;
  const sourceNode = getNodeAt(
    propsContainer(effectProps(sourceEffect.effect, sourceEffect.effectIndex > 0)),
    rawEffectPropertyPath(sourceEffect.specialSegments, target.propertyPath),
  );
  return sourceNode
    ? {
        kind: 'effect',
        sourceNode,
        sourceEffect,
        rawPropertyPath: rawEffectPropertyPath(sourceEffect.specialSegments, target.propertyPath),
      }
    : undefined;
}

function updateStateEntityForProperty(
  entity: EcsEntityDoc,
  target: StatePropertyChange,
  resolved: ResolvedStateProperty,
): EcsEntityDoc {
  if (resolved.kind === 'component' || resolved.kind === 'animation') {
    const displayComponents = mergeEntityComponentsForDisplay(entity);
    const componentIndexes = componentPathMatchingSource(displayComponents, resolved.sourceComponentPath);
    if (!componentIndexes) return entity;
    const nextComponents = updateComponentAtPath(displayComponents, componentIndexes, (component) => {
      if (resolved.kind === 'animation') {
        if (!component.animation) return component;
        const animation = setObjectAtPath(component.animation, resolved.propertyPath, resolved.sourceValue);
        return animation ? { ...component, animation } : component;
      }
      const nextProps = setNodeAt(
        propsContainer(component.props),
        resolved.propertyPath,
        resolved.sourceNode,
      );
      return nextProps?.kind === 'container' ? { ...component, props: nextProps.children } : component;
    });
    const components = reduceEntityComponents(nextComponents, entity);
    return valuesEqual(components, entity.components) ? entity : { ...entity, components };
  }

  const targetEffect = effectPathForEntity(entity, decodedScopeSegments(target.scopeKey), resolved.sourceEffect);
  if (!targetEffect) return entity;
  const nextProps = setNodeAt(
    propsContainer(targetEffect.effect.props),
    resolved.rawPropertyPath,
    resolved.sourceNode,
  );
  const nextEffect =
    nextProps?.kind === 'container'
      ? { ...targetEffect.effect, props: nextProps.children }
      : targetEffect.effect;
  if (targetEffect.componentPath) {
    const displayComponents = mergeEntityComponentsForDisplay(entity);
    const componentIndexes = componentPathMatchingSource(displayComponents, resolved.sourceEffect.componentPath ?? []);
    if (!componentIndexes) return entity;
    const nextComponents = updateComponentAtPath(displayComponents, componentIndexes, (component) => ({
      ...component,
      effects: component.effects.map((effect, index) =>
        index === targetEffect.effectIndex ? nextEffect : effect,
      ),
    }));
    const components = reduceEntityComponents(nextComponents, entity);
    return valuesEqual(components, entity.components) ? entity : { ...entity, components };
  }
  const effects = entity.effects.map((effect, index) => (index === targetEffect.effectIndex ? nextEffect : effect));
  return valuesEqual(effects, entity.effects) ? entity : { ...entity, effects };
}

function updateStateEntityForTransition(
  entity: EcsEntityDoc,
  target: StatePropertyChange,
  transition: TransitionConfig | undefined,
): EcsEntityDoc {
  const resolved = resolveStateProperty(entity, target);
  if (!resolved || resolved.kind === 'animation') return entity;

  if (resolved.kind === 'component') {
    const displayComponents = mergeEntityComponentsForDisplay(entity);
    const componentIndexes = componentPathMatchingSource(displayComponents, resolved.sourceComponentPath);
    if (!componentIndexes) return entity;
    const nextComponents = updateComponentAtPath(displayComponents, componentIndexes, (component) => {
      const nextProps = setTransitionAt(
        propsContainer(component.props),
        resolved.propertyPath,
        transition,
      );
      return nextProps?.kind === 'container' ? { ...component, props: nextProps.children } : component;
    });
    const components = reduceEntityComponents(nextComponents, entity);
    return valuesEqual(components, entity.components) ? entity : { ...entity, components };
  }

  const targetEffect = effectPathForEntity(entity, decodedScopeSegments(target.scopeKey), resolved.sourceEffect);
  if (!targetEffect) return entity;
  const nextProps = setTransitionAt(
    propsContainer(targetEffect.effect.props),
    resolved.rawPropertyPath,
    transition,
  );
  if (nextProps?.kind !== 'container') return entity;
  const nextEffect = { ...targetEffect.effect, props: nextProps.children };
  if (targetEffect.componentPath) {
    const displayComponents = mergeEntityComponentsForDisplay(entity);
    const componentIndexes = componentPathMatchingSource(displayComponents, resolved.sourceEffect.componentPath ?? []);
    if (!componentIndexes) return entity;
    const nextComponents = updateComponentAtPath(displayComponents, componentIndexes, (component) => ({
      ...component,
      effects: component.effects.map((effect, index) =>
        index === targetEffect.effectIndex ? nextEffect : effect,
      ),
    }));
    const components = reduceEntityComponents(nextComponents, entity);
    return valuesEqual(components, entity.components) ? entity : { ...entity, components };
  }
  const effects = entity.effects.map((effect, index) => (index === targetEffect.effectIndex ? nextEffect : effect));
  return valuesEqual(effects, entity.effects) ? entity : { ...entity, effects };
}

function canUpdateStateEntityForProperty(entity: EcsEntityDoc, target: StatePropertyChange, resolved: ResolvedStateProperty): boolean {
  if (resolved.kind === 'component' || resolved.kind === 'animation') {
    const displayComponents = mergeEntityComponentsForDisplay(entity);
    const componentIndexes = componentPathMatchingSource(displayComponents, resolved.sourceComponentPath);
    if (!componentIndexes) return false;
    if (resolved.kind === 'animation') {
      return Boolean(getComponentAtPath(displayComponents, componentIndexes)?.animation);
    }
    return true;
  }
  return effectPathForEntity(entity, decodedScopeSegments(target.scopeKey), resolved.sourceEffect) !== undefined;
}

function canUpdateStateEntityForStructure(entity: EcsEntityDoc, structure: StateStructureChange): boolean {
  const owner = structureOwnerForEntity(entity, structure.ownerScopeKey, structure.ownerComponentPath);
  if (!owner) return false;
  if (structure.kind === 'components') return owner.kind === 'entity' || owner.kind === 'component';
  return owner.kind === 'entity' || owner.kind === 'component';
}

function getComponentAtPath(
  components: readonly EcsComponentDoc[],
  indexes: readonly number[],
): EcsComponentDoc | undefined {
  let current: EcsComponentDoc | undefined;
  let siblings = components;
  for (const index of indexes) {
    current = siblings[index];
    if (!current) return undefined;
    siblings = current.components;
  }
  return current;
}

export interface StateApplyAvailability {
  applicable: StateSuffix[];
  skipped: StateSuffix[];
}

function stateEntityForSuffix(
  parent: EcsEntityDoc,
  selectedEntity: EcsEntityDoc,
  suffix: StateSuffix,
): EcsEntityDoc | undefined {
  const stateId = `${selectedEntity.entity}:${suffix}`;
  const existing = parent.children.find((child) => child.id === stateId);
  if (existing) return materializeStateEntityStyle(parent, existing);
  const base = parent.children.find((child) => child.id === `${selectedEntity.entity}:default`);
  return base ? deriveStateFromBase(base, stateId) : undefined;
}

function selectedStateContext(
  root: EcsEntityDoc,
  selectedEntityId: string,
): { selectedEntity: EcsEntityDoc; parent: EcsEntityDoc } | undefined {
  const selectedEntity = findEntityById(root, selectedEntityId);
  if (selectedEntity && isStateGroupId(selectedEntity.id)) {
    const parentInfo = findParentOf(root, selectedEntity.id);
    return parentInfo
      ? { selectedEntity: materializeStateEntityStyle(parentInfo.parent, selectedEntity), parent: parentInfo.parent }
      : undefined;
  }
  if (!isStateGroupId(selectedEntityId)) return undefined;

  const entityKind = selectedEntityId.slice(0, selectedEntityId.indexOf(':'));
  const base = findEntityById(root, `${entityKind}:default`);
  if (!base) return undefined;
  const parentInfo = findParentOf(root, base.id);
  if (!parentInfo) return undefined;
  return {
    selectedEntity: deriveStateFromBase(base, selectedEntityId),
    parent: parentInfo.parent,
  };
}

export function getPropertyApplyAvailability(
  root: EcsEntityDoc,
  selectedEntityId: string,
  target: StatePropertyChange,
  stateSuffixes: readonly StateSuffix[],
): StateApplyAvailability {
  const selectedEntity = findEntityById(root, selectedEntityId);
  if (!selectedEntity || !isStateGroupId(selectedEntity.id)) {
    return { applicable: [], skipped: [...stateSuffixes] };
  }
  const parentInfo = findParentOf(root, selectedEntity.id);
  if (!parentInfo) return { applicable: [], skipped: [...stateSuffixes] };
  const resolved = target.structure ? undefined : resolveStateProperty(selectedEntity, target);
  const applicable: StateSuffix[] = [];
  const skipped: StateSuffix[] = [];
  for (const suffix of stateSuffixes) {
    const stateEntity = stateEntityForSuffix(parentInfo.parent, selectedEntity, suffix);
    const canApply = stateEntity
      ? target.structure
        ? canUpdateStateEntityForStructure(stateEntity, target.structure)
        : resolved
          ? canUpdateStateEntityForProperty(stateEntity, target, resolved)
          : false
      : false;
    (canApply ? applicable : skipped).push(suffix);
  }
  return { applicable, skipped };
}

export function applyPropertyToStates(
  root: EcsEntityDoc,
  selectedEntityId: string,
  target: StatePropertyChange,
  stateSuffixes: readonly StateSuffix[],
): EcsEntityDoc {
  const selectedEntity = findEntityById(root, selectedEntityId);
  if (!selectedEntity || !isStateGroupId(selectedEntity.id)) return root;
  const parentInfo = findParentOf(root, selectedEntity.id);
  if (!parentInfo) return root;
  const requestedStateIds = new Set(stateSuffixes.map((suffix) => `${selectedEntity.entity}:${suffix}`));
  const existingStateIds = new Set(parentInfo.parent.children.map((child) => child.id));
  const base = parentInfo.parent.children.find((child) => child.id === `${selectedEntity.entity}:default`);
  const nextChildren = [...parentInfo.parent.children];
  if (base) {
    let insertIndex = nextChildren.findIndex((child) => child.id === base.id) + 1;
    for (const state of ENTITY_STATES) {
      const stateId = `${selectedEntity.entity}:${state.suffix}`;
      if (!requestedStateIds.has(stateId) || existingStateIds.has(stateId)) continue;
      nextChildren.splice(insertIndex, 0, deriveStateFromBase(base, stateId));
      insertIndex += 1;
    }
  }
  if (target.structure) {
    const updatedChildren = nextChildren.map((child) =>
      requestedStateIds.has(child.id)
        ? updateStateEntityForStructure(materializeStateEntityStyle(parentInfo.parent, child), target.structure!)
        : child,
    );
    if (updatedChildren.every((child, index) => child === parentInfo.parent.children[index])) return root;
    return updateEntityById(root, parentInfo.parent.id, (parent) => ({ ...parent, children: updatedChildren }));
  }

  const resolved = resolveStateProperty(selectedEntity, target);
  if (!resolved) return root;
  const updatedChildren = nextChildren.map((child) =>
    requestedStateIds.has(child.id)
      ? updateStateEntityForProperty(materializeStateEntityStyle(parentInfo.parent, child), target, resolved)
      : child,
  );
  if (updatedChildren.every((child, index) => child === parentInfo.parent.children[index])) return root;
  return updateEntityById(root, parentInfo.parent.id, (parent) => ({ ...parent, children: updatedChildren }));
}

export function applyEffectChangeToStates(
  root: EcsEntityDoc,
  selectedEntityId: string,
  scopeKey: string,
  stateSuffixes: readonly StateSuffix[],
  target: StatePropertyChange | undefined,
): EcsEntityDoc {
  const selectedEntity = findEntityById(root, selectedEntityId);
  if (!selectedEntity || !isStateGroupId(selectedEntity.id)) return root;
  const parentInfo = findParentOf(root, selectedEntity.id);
  if (!parentInfo) return root;
  const sourceEffect = effectPathForEntity(selectedEntity, decodedScopeSegments(scopeKey));
  if (!sourceEffect) return root;
  const resolved = target ? resolveStateProperty(selectedEntity, target) : undefined;
  const requestedStateIds = new Set(stateSuffixes.map((suffix) => `${selectedEntity.entity}:${suffix}`));
  const existingStateIds = new Set(parentInfo.parent.children.map((child) => child.id));
  const base = parentInfo.parent.children.find((child) => child.id === `${selectedEntity.entity}:default`);
  const nextChildren = [...parentInfo.parent.children];
  if (base) {
    let insertIndex = nextChildren.findIndex((child) => child.id === base.id) + 1;
    for (const state of ENTITY_STATES) {
      const stateId = `${selectedEntity.entity}:${state.suffix}`;
      if (!requestedStateIds.has(stateId) || existingStateIds.has(stateId)) continue;
      nextChildren.splice(insertIndex, 0, deriveStateFromBase(base, stateId));
      insertIndex += 1;
    }
  }
  const updatedChildren = nextChildren.map((child) => {
    if (!requestedStateIds.has(child.id)) return child;
    const editableChild = materializeStateEntityStyle(parentInfo.parent, child);
    const hasMatchingEffect =
      effectPathForEntity(editableChild, decodedScopeSegments(scopeKey), sourceEffect) !== undefined;
    if (target && resolved && hasMatchingEffect) {
      return updateStateEntityForProperty(editableChild, target, resolved);
    }
    if (!hasMatchingEffect) {
      return copyEffectToEntity(editableChild, selectedEntity, sourceEffect);
    }
    if (!target && hasMatchingEffect) {
      return copyEffectToEntity(editableChild, selectedEntity, sourceEffect);
    }
    return child;
  });
  if (updatedChildren.every((child, index) => child === parentInfo.parent.children[index])) return root;
  return updateEntityById(root, parentInfo.parent.id, (parent) => ({ ...parent, children: updatedChildren }));
}

/**
 * Copies only transition metadata to matching state properties. Authored values,
 * animations, and randomizers remain independent in each state template.
 */
export function applyTransitionToStates(
  root: EcsEntityDoc,
  selectedEntityId: string,
  target: StatePropertyChange,
  transition: TransitionConfig | undefined,
  stateSuffixes: readonly StateSuffix[] | 'all' = 'all',
): EcsEntityDoc {
  const selectedContext = selectedStateContext(root, selectedEntityId);
  if (!selectedContext) return root;
  const { selectedEntity, parent } = selectedContext;
  const normalizedTarget = normalizeStatePropertyChangeForEntity(root, selectedEntityId, target);
  const requestedStateSuffixes =
    stateSuffixes === 'all' ? ENTITY_STATES.map((state) => state.suffix) : stateSuffixes;
  const requestedStateIds = new Set(requestedStateSuffixes.map((suffix) => `${selectedEntity.entity}:${suffix}`));
  const existingStateIds = new Set(parent.children.map((child) => child.id));
  const base = parent.children.find((child) => child.id === `${selectedEntity.entity}:default`);
  const nextChildren = [...parent.children];
  if (transition !== undefined && base) {
    let insertIndex = nextChildren.findIndex((child) => child.id === base.id) + 1;
    for (const state of ENTITY_STATES) {
      const stateId = `${selectedEntity.entity}:${state.suffix}`;
      if (!requestedStateIds.has(stateId) || existingStateIds.has(stateId)) continue;
      nextChildren.splice(insertIndex, 0, deriveStateFromBase(base, stateId));
      insertIndex += 1;
    }
  }
  const updatedChildren = nextChildren.map((child) =>
    requestedStateIds.has(child.id)
      ? updateStateEntityForTransition(
          materializeStateEntityStyle(parent, child),
          normalizedTarget,
          transition,
        )
      : child,
  );
  if (
    updatedChildren.length === parent.children.length &&
    updatedChildren.every((child, index) => child === parent.children[index])
  ) {
    return root;
  }
  return updateEntityById(root, parent.id, (currentParent) => ({ ...currentParent, children: updatedChildren }));
}
