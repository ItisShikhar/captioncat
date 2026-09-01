/**
 * Studio-side model of the engine's ECS-native preset `design` tree
 * (`src/caption-engine/entity-system/ecs-preset.ts`): an entity tree
 * (`entity -> components/effects -> child entities`) rather than the legacy
 * role-keyed "semantic property tree".
 *
 * Only the *container* shape differs from the legacy format - every leaf under
 * a component/effect's `props` is the exact same `{type,value,animation?,
 * transition?,randomizer?}` shape the studio already parses. So this module
 * reuses `parseNode`/`serializeNode`/`collectFontFamiliesFromNode` verbatim
 * for props and only adds the entity/component/effect scaffolding around them,
 * which lets the whole existing leaf-control layer (`PropertyTreeView` and the
 * `controls/`) render an ECS preset unchanged.
 */
import type { AnimationDoc } from './animation';
import { DEFAULT_ANIMATION_SEQUENCER } from './animation';
import {
  isStateStyleSource,
  normalizeStateStyleSources,
  STATE_STYLE_SOURCES,
  type StateStyleSource,
} from '@captioncat/caption-engine/browser';
import type {
  EcsComponentNode,
  EcsEffectNode,
  EcsEntityNode,
  EcsPropNode,
} from '@captioncat/caption-engine/browser';
import type { PropertyNode } from './property-tree';
import { collectFontFamiliesFromNode, parseNode, serializeNode } from './property-tree';

let nextStudioComponentId = 0;

export function createStudioComponentId(): string {
  nextStudioComponentId += 1;
  return `component-${nextStudioComponentId}`;
}

/** Normalized editor state derived from the engine's canonical component node. */
export interface EcsComponentDoc extends Omit<EcsComponentNode, 'props' | 'components' | 'effects'> {
  /** Studio-only identity used to preserve inspector state while components are reordered. */
  studioId?: string;
  props: Record<string, PropertyNode>;
  components: EcsComponentDoc[];
  /** Post-paint effects scoped to only this component's own paint (e.g. a BackgroundStyle's border/shadow/stroke). */
  effects: EcsEffectDoc[];
  allowedEntities?: string[];
  allowedQuantity?: number;
  /** First-class animation payload. Present only when `component === 'animation'`. */
  animation?: AnimationDoc;
  /** Whether this component exists explicitly on the entity. */
  explicit?: boolean;
  /** Studio capability metadata resolved from the schema and never serialized. */
  allowDisable?: boolean;
  /** Studio capability metadata resolved from the schema and never serialized. */
  isDeletable?: boolean;
}

/** Normalized editor state derived from the engine's canonical effect node. */
export interface EcsEffectDoc extends Omit<EcsEffectNode, 'props'> {
  props: Record<string, PropertyNode>;
}

export interface EcsMarkerBehaviorDoc {
  styleSource: 'own' | 'targetState';
  styleState: 'followTarget' | 'default' | 'past' | 'previous' | 'current' | 'next' | 'future';
  renderOrder: 'inFront' | 'behind';
}

export interface EcsMarkerEntityConfig extends EcsMarkerBehaviorDoc {
  followTarget:
    | 'parent'
    | 'currentWord'
    | 'previousWord'
    | 'nextWord'
    | 'currentRow'
    | 'previousRow'
    | 'nextRow';
  anchor:
    | 'topLeft'
    | 'topCenter'
    | 'topRight'
    | 'centerLeft'
    | 'center'
    | 'centerRight'
    | 'bottomLeft'
    | 'bottomCenter'
    | 'bottomRight';
  offset: { x: number; y: number };
}

/** Normalized editor state derived from the engine's canonical entity node. */
export interface EcsEntityDoc extends Omit<EcsEntityNode, 'components' | 'effects' | 'children'> {
  components: EcsComponentDoc[];
  effects: EcsEffectDoc[];
  children: EcsEntityDoc[];
}

function transformFirstComponents<T extends { component: string; components: T[] }>(components: T[]): T[] {
  const transformIndex = components.findIndex((component) => component.component === 'transform');
  const ordered =
    transformIndex > 0
      ? [components[transformIndex], ...components.slice(0, transformIndex), ...components.slice(transformIndex + 1)]
      : [...components];
  return ordered.map((component) => ({
    ...component,
    components: transformFirstComponents(component.components),
  }));
}

export class EcsParseError extends Error {}

export type LayoutMotionMode = 'currentRow' | 'currentWord';

export const LAYOUT_MOTION_FOCUS_POSITIONS = [
  'topLeft',
  'topCenter',
  'topRight',
  'centerLeft',
  'center',
  'centerRight',
  'bottomLeft',
  'bottomCenter',
  'bottomRight',
] as const;
export const LAYOUT_MOTION_ROW_FOCUS_POSITIONS = ['centerLeft', 'center', 'centerRight'] as const;
export const LAYOUT_MOTION_PAGE_FOCUS_POSITIONS = ['topCenter', 'center', 'bottomCenter'] as const;

export function layoutMotionModeForEntity(entityKind: string): LayoutMotionMode {
  return entityKind === 'row' ? 'currentWord' : 'currentRow';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStateOverrideId(entityKind: string, id: string): boolean {
  const suffix = id.slice(id.indexOf(':') + 1);
  return (
    (entityKind === 'row' || entityKind === 'word') &&
    suffix !== 'default' &&
    STATE_STYLE_SOURCES.includes(suffix as StateStyleSource)
  );
}

// --- parse (raw JSON -> studio doc) ---

/** Parses a `props` record: every value is a leaf (or, defensively, any parseable node). */
function parseProps(raw: unknown): Record<string, PropertyNode> {
  const out: Record<string, PropertyNode> = {};
  if (!isRecord(raw)) return out;
  for (const [key, rawValue] of Object.entries(raw)) {
    const node = parseNode(rawValue);
    if (node) out[key] = node;
  }
  return out;
}

function normalizeEffectProps(props: Record<string, PropertyNode>): Record<string, PropertyNode> {
  const appliesOn = props.appliesOn;
  const canonicalAppliesOn: PropertyNode = appliesOn ?? { kind: 'leaf', type: 'string', value: 'base' };
  return {
    appliesOn: canonicalAppliesOn,
    ...Object.fromEntries(Object.entries(props).filter(([key]) => key !== 'appliesOn')),
  };
}

function layoutMotionFocusPositionFromNumber(value: number, mode: LayoutMotionMode): string {
  const position = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5;
  const slot = Math.round(position * 2);
  if (mode === 'currentWord') return ['centerLeft', 'center', 'centerRight'][slot];
  return ['topCenter', 'center', 'bottomCenter'][slot];
}

export function normalizeLayoutMotionFocusPosition(value: unknown, mode: LayoutMotionMode): string {
  if (typeof value === 'number') return layoutMotionFocusPositionFromNumber(value, mode);
  if (typeof value === 'string' && (LAYOUT_MOTION_FOCUS_POSITIONS as readonly string[]).includes(value)) {
    if (mode === 'currentWord') {
      if (value.endsWith('Left')) return 'centerLeft';
      if (value.endsWith('Right')) return 'centerRight';
      return 'center';
    }
    if (value.startsWith('top')) return 'topCenter';
    if (value.startsWith('bottom')) return 'bottomCenter';
    return 'center';
  }
  return 'center';
}

export function normalizeLayoutMotionFlowDirection(value: unknown, mode: LayoutMotionMode): string {
  if (mode === 'currentWord') {
    if (value === 'leftToRight') return 'leftToRight';
    return 'rightToLeft';
  }
  if (value === 'topToBottom' || value === 'leftToRight') return 'topToBottom';
  return 'bottomToTop';
}

function parseEffectList(raw: unknown, sourceLabel: string): EcsEffectDoc[] {
  if (!Array.isArray(raw)) return [];
  const parsedEffects = raw
    .map((value, index) => parseEcsEffect(value, `${sourceLabel}[${index}]`))
    .filter((e): e is EcsEffectDoc => e !== undefined);
  const dependencyParents = new Set(
    parsedEffects
      .filter((effect) => effect.effect === 'blendMode' && effect.dependencyOf)
      .map((effect) => effect.dependencyOf),
  );
  return parsedEffects.flatMap((effect) => {
    if (effect.effect !== 'noise' || effect.dependencyOf) return [effect];
    const legacyBlendMode = effect.props.blendMode;
    const hasLegacyBlendMode = Object.prototype.hasOwnProperty.call(
      effect.props,
      'blendMode',
    );
    const normalizedProps = { ...effect.props };
    delete normalizedProps.blendMode;
    const normalizedNoise = hasLegacyBlendMode
      ? { ...effect, props: normalizedProps }
      : effect;
    if (dependencyParents.has(effect.id)) return [normalizedNoise];
    return [
      normalizedNoise,
      {
        id: `${effect.id}:blend-mode`,
        effect: 'blendMode',
        dependencyOf: effect.id,
        props: {
          appliesOn: { kind: 'leaf', type: 'string', value: 'base' },
          enabled: { kind: 'leaf', type: 'boolean', value: true },
          blendMode: legacyBlendMode ?? { kind: 'leaf', type: 'string', value: 'normal' },
        },
      },
    ];
  });
}

function validateEffectIds(rawEntity: Record<string, unknown>, sourceLabel: string): void {
  const seen = new Map<string, string>();
  const visitEffects = (rawEffects: unknown, effectsPath: string): void => {
    if (!Array.isArray(rawEffects)) return;
    for (const [index, rawEffect] of rawEffects.entries()) {
      const effectPath = `${effectsPath}[${index}]`;
      if (!isRecord(rawEffect) || typeof rawEffect.id !== 'string' || rawEffect.id.trim().length === 0) {
        throw new EcsParseError(`${sourceLabel}: effect at ${effectPath} is missing an id`);
      }
      const previousPath = seen.get(rawEffect.id);
      if (previousPath) {
        throw new EcsParseError(
          `${sourceLabel}: duplicate effect ID "${rawEffect.id}" at ${effectPath}; already used at ${previousPath}`,
        );
      }
      seen.set(rawEffect.id, effectPath);
    }
  };
  const visitComponents = (rawComponents: unknown, componentsPath: string): void => {
    if (!Array.isArray(rawComponents)) return;
    for (const [index, rawComponent] of rawComponents.entries()) {
      if (!isRecord(rawComponent)) continue;
      const componentPath = `${componentsPath}[${index}]`;
      visitEffects(rawComponent.effects, `${componentPath}.effects`);
      visitComponents(rawComponent.components, `${componentPath}.components`);
    }
  };

  visitEffects(rawEntity.effects, `${sourceLabel}.effects`);
  visitComponents(rawEntity.components, `${sourceLabel}.components`);
}

export function parseEcsComponent(raw: unknown): EcsComponentDoc | undefined {
  if (!isRecord(raw) || typeof raw.component !== 'string') return undefined;
  if (raw.component === 'marker') {
    throw new EcsParseError('Legacy marker component is obsolete; use image and markerBehavior components');
  }
  if (raw.component === 'animation') {
    const component: EcsComponentDoc = {
      component: 'animation',
      studioId: createStudioComponentId(),
      props: {},
      components: [],
      effects: [],
      explicit: true,
      animation: parseAnimationDoc(raw),
    };
    if (typeof raw.dependencyOf === 'string' && raw.dependencyOf.trim().length > 0) {
      component.dependencyOf = raw.dependencyOf;
    }
    if (typeof raw.attachedTo === 'string' && raw.attachedTo.trim().length > 0) {
      component.attachedTo = raw.attachedTo;
    }
    return component;
  }
  const components = Array.isArray(raw.components)
    ? transformFirstComponents(
        raw.components
          .map((component) => parseEcsComponent(component))
          .filter((c): c is EcsComponentDoc => c !== undefined),
      )
    : [];
  const effects = parseEffectList(raw.effects, 'component.effects');
  const parsedProps = parseProps(raw.props);
  const props = parsedProps;
  const component: EcsComponentDoc = {
    component: raw.component,
    studioId: createStudioComponentId(),
    props,
    components,
    effects,
    explicit: true,
  };
  if (typeof raw.dependencyOf === 'string' && raw.dependencyOf.trim().length > 0) {
    component.dependencyOf = raw.dependencyOf;
  }
  return component;
}

export function parseEcsEffect(raw: unknown, sourceLabel = 'effect'): EcsEffectDoc | undefined {
  if (!isRecord(raw) || typeof raw.effect !== 'string') return undefined;
  if (typeof raw.id !== 'string' || raw.id.trim().length === 0) {
    throw new EcsParseError(`${sourceLabel}: missing effect id`);
  }
  const parsedProps = normalizeEffectProps(parseProps(raw.props));
  const effect: EcsEffectDoc = {
    id: raw.id,
    effect: raw.effect,
    props: parsedProps,
  };
  if (typeof raw.dependencyOf === 'string' && raw.dependencyOf.trim().length > 0) {
    effect.dependencyOf = raw.dependencyOf;
  }
  return effect;
}

/** Parse an `animation` component node into the studio's animation doc. */
function parseAnimationDoc(raw: Record<string, unknown>): AnimationDoc {
  const sequencer = isRecord(raw.sequencer) ? raw.sequencer : {};
  return {
    enabled: raw.enabled !== false,
    name: typeof raw.name === 'string' ? raw.name : 'Animation',
    phase: (raw.phase as AnimationDoc['phase']) ?? 'enter',
    playbackMode: raw.playbackMode === 'loop' || raw.playbackMode === 'pingPong' ? raw.playbackMode : 'once',
    scope: (raw.scope as AnimationDoc['scope']) ?? 'self',
    durationSeconds: typeof raw.durationSeconds === 'number' ? raw.durationSeconds : 0.3,
    delaySeconds: typeof raw.delaySeconds === 'number' ? raw.delaySeconds : 0,
    triggerBehavior:
      raw.triggerBehavior === 'restart' || raw.triggerBehavior === 'continue' ? raw.triggerBehavior : 'adaptive',
    lifecycleScheduling: raw.lifecycleScheduling === 'sequential' ? 'sequential' : 'overlap',
    preset: typeof raw.preset === 'string' ? raw.preset : 'custom',
    parameters: isRecord(raw.parameters) ? (raw.parameters as Record<string, number | string>) : {},
    sequencer: {
      pattern: (sequencer.pattern as AnimationDoc['sequencer']['pattern']) ?? DEFAULT_ANIMATION_SEQUENCER.pattern,
      interval: typeof sequencer.interval === 'number' ? sequencer.interval : 0,
      reverse: sequencer.reverse === true,
      seed: typeof sequencer.seed === 'number' ? sequencer.seed : 0,
    },
    tracks: Array.isArray(raw.tracks) ? (raw.tracks as AnimationDoc['tracks']) : [],
  };
}

export function parseEcsEntity(raw: unknown, sourceLabel = 'design'): EcsEntityDoc {
  if (!isRecord(raw)) {
    throw new EcsParseError(`${sourceLabel}: expected an ECS entity object`);
  }
  if (typeof raw.entity !== 'string' || raw.entity.trim().length === 0) {
    throw new EcsParseError(`${sourceLabel}: missing/invalid entity "entity" kind`);
  }
  if (typeof raw.id !== 'string' || raw.id.trim().length === 0) {
    throw new EcsParseError(`${sourceLabel}: missing/invalid entity "id"`);
  }
  validateEffectIds(raw, sourceLabel);
  const parsedComponents = Array.isArray(raw.components)
    ? transformFirstComponents(
        raw.components
          .map((component) => parseEcsComponent(component))
          .filter((c): c is EcsComponentDoc => c !== undefined),
      )
    : [];
  validateMarkerComponents(parsedComponents, raw.entity, sourceLabel);
  validateBackgroundEntity(parsedComponents, raw.entity, sourceLabel);
  validateImageEntity(parsedComponents, raw.entity, sourceLabel);
  const effects = parseEffectList(raw.effects, `${sourceLabel}.effects`);
  const children = Array.isArray(raw.children)
    ? raw.children.map((child) => parseEcsEntity(child, `${sourceLabel}.children[]`))
    : [];
  const entity: EcsEntityDoc = {
    entity: raw.entity,
    id: raw.id,
    ...(typeof raw.forEntityId === 'string' && raw.forEntityId.trim().length > 0
      ? { forEntityId: raw.forEntityId }
      : {}),
    ...(isStateOverrideId(raw.entity, raw.id) && raw.styleSource !== undefined
      ? { styleSource: isStateStyleSource(raw.styleSource) ? raw.styleSource : 'default' }
      : {}),
    components: parsedComponents,
    effects,
    children,
  };
  const normalized = normalizeStateStyleSources(entity);
  assertStableEntityIds(normalized, sourceLabel);
  return normalized;
}

function assertStableEntityIds(root: EcsEntityDoc, sourceLabel: string): void {
  const seen = new Map<string, string>();

  const visit = (entity: EcsEntityDoc, location: string): void => {
    const previousLocation = seen.get(entity.id);
    if (previousLocation) {
      throw new EcsParseError(
        `${sourceLabel}: duplicate entity id "${entity.id}" at ${location}; already used at ${previousLocation}`,
      );
    }
    seen.set(entity.id, location);
    entity.children.forEach((child, index) => visit(child, `${location}.children[${index}]`));
  };

  visit(root, sourceLabel);
}

function validateBackgroundEntity(
  components: readonly EcsComponentDoc[],
  entityKind: string,
  sourceLabel: string,
): void {
  if (entityKind !== 'background') return;
  const componentTypes = new Set(components.map((component) => component.component));
  for (const required of ['transform', 'backgroundStyle']) {
    if (!componentTypes.has(required)) {
      throw new EcsParseError(`${sourceLabel}: background entity must contain a ${required} component`);
    }
  }
}

function validateImageEntity(
  components: readonly EcsComponentDoc[],
  entityKind: string,
  sourceLabel: string,
): void {
  if (entityKind !== 'image') return;
  const componentTypes = new Set(components.map((component) => component.component));
  for (const required of ['transform', 'image']) {
    if (!componentTypes.has(required)) {
      throw new EcsParseError(`${sourceLabel}: image entity must contain a ${required} component`);
    }
  }
}

function validateMarkerComponents(
  components: readonly EcsComponentDoc[],
  entityKind: string,
  sourceLabel: string,
): void {
  const topLevel = components.filter((component) => component.component === 'markerBehavior');
  const total = components.reduce(
    (count, component) =>
      count + (component.component === 'markerBehavior' ? 1 : 0) + countMarkerComponents(component.components),
    0,
  );
  if (entityKind === 'marker') {
    const componentTypes = new Set(components.map((component) => component.component));
    for (const required of ['transform', 'image', 'followTarget']) {
      if (!componentTypes.has(required)) {
        throw new EcsParseError(`${sourceLabel}: marker entity must contain a ${required} component`);
      }
    }
  }
  if (total === 0) return;
  if (entityKind !== 'marker') {
    throw new EcsParseError(`${sourceLabel}: marker behavior can only be attached to a marker entity`);
  }
  if (topLevel.length > 1) {
    throw new EcsParseError(`${sourceLabel}: a marker entity may contain only one marker behavior component`);
  }
  if (total !== topLevel.length) {
    throw new EcsParseError(`${sourceLabel}: marker behavior must be a top-level entity component`);
  }
}

function countMarkerComponents(components: readonly EcsComponentDoc[]): number {
  return components.reduce(
    (count, component) =>
      count + (component.component === 'markerBehavior' ? 1 : 0) + countMarkerComponents(component.components),
    0,
  );
}

// --- serialize (studio doc -> raw JSON) ---

/** Empty prop maps serialize away entirely, matching the engine's own serializer (which omits `props`). */
function isSerializedEcsPropNode(value: unknown): value is EcsPropNode {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.type === 'string') return true;
  return Object.values(record).every(isSerializedEcsPropNode);
}

function serializeProps(props: Record<string, PropertyNode>): Record<string, EcsPropNode> | undefined {
  const keys = Object.keys(props);
  if (keys.length === 0) return undefined;
  const out: Record<string, EcsPropNode> = {};
  for (const key of keys) {
    const serialized = serializeNode(props[key]);
    if (serialized !== undefined) {
      if (!isSerializedEcsPropNode(serialized)) {
        throw new Error(`Property "${key}" serialized to an invalid ECS property node.`);
      }
      out[key] = serialized;
    }
  }
  if (Object.keys(out).length === 0) return undefined;
  return out;
}

export function serializeEcsComponent(component: EcsComponentDoc): EcsComponentNode {
  if (component.component === 'animation' && component.animation) {
    const animation = component.animation;
    const out: EcsComponentNode = {
      component: 'animation',
      enabled: animation.enabled,
      name: animation.name,
      phase: animation.phase,
      scope: animation.scope,
      durationSeconds: animation.durationSeconds,
      delaySeconds: animation.delaySeconds,
      playbackMode: animation.playbackMode,
      triggerBehavior: animation.triggerBehavior,
      lifecycleScheduling: animation.lifecycleScheduling,
      sequencer: { ...animation.sequencer },
      tracks: animation.tracks.map((track) => ({ ...track, keyframes: track.keyframes.map((keyframe) => ({ ...keyframe })) })),
    };
    if (animation.preset && animation.preset !== 'custom') {
      out.preset = animation.preset;
      out.parameters = { ...animation.parameters };
    }
    if (component.dependencyOf) out.dependencyOf = component.dependencyOf;
    if (component.attachedTo) out.attachedTo = component.attachedTo;
    return out;
  }
  const out: EcsComponentNode = { component: component.component };
  const props = serializeProps(component.props);
  if (props) out.props = props;
  if (component.dependencyOf) out.dependencyOf = component.dependencyOf;
  if (component.components.length > 0) out.components = transformFirstComponents(component.components).map(serializeEcsComponent);
  if (component.effects.length > 0) out.effects = component.effects.map(serializeEcsEffect);
  return out;
}

export function serializeEcsEffect(effect: EcsEffectDoc): EcsEffectNode {
  const out: EcsEffectNode = { effect: effect.effect, id: effect.id };
  const props = serializeProps(normalizeEffectProps(effect.props));
  if (props) out.props = props;
  if (effect.dependencyOf) out.dependencyOf = effect.dependencyOf;
  return out;
}

/** Serializes an entity tree back to the ECS-native JSON shape (matches the engine's `serializeEntityTree` key order). */
export function serializeEcsEntity(entity: EcsEntityDoc): EcsEntityNode {
  const out: EcsEntityNode = { entity: entity.entity, id: entity.id };
  if (entity.forEntityId) out.forEntityId = entity.forEntityId;
  if (entity.styleSource) out.styleSource = entity.styleSource;
  if (entity.components.length > 0) out.components = transformFirstComponents(entity.components).map(serializeEcsComponent);
  if (entity.effects.length > 0) out.effects = entity.effects.map(serializeEcsEffect);
  if (entity.children.length > 0) out.children = entity.children.map(serializeEcsEntity);
  return out;
}

/** Deep-clones an entity tree (plain JSON-ish data). */
export function cloneEcsEntity(entity: EcsEntityDoc): EcsEntityDoc {
  return structuredClone(entity);
}

// --- font families (for browser font registration in the engine bridge) ---

function collectComponentFonts(component: EcsComponentDoc, out: Set<string>): void {
  for (const node of Object.values(component.props)) collectFontFamiliesFromNode(node, out);
  for (const nested of component.components) collectComponentFonts(nested, out);
}

/** Every `fontFamily` leaf value referenced anywhere in the entity tree's component props. */
export function collectFontFamiliesFromEcs(entity: EcsEntityDoc, out: Set<string> = new Set()): Set<string> {
  for (const component of entity.components) collectComponentFonts(component, out);
  for (const child of entity.children) collectFontFamiliesFromEcs(child, out);
  return out;
}
