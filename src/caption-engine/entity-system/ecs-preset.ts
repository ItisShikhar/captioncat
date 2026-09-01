import type { AnimationScope } from './animation/types';
import { DEFAULT_ANIMATION_SEQUENCER } from './animation';
import {
AnimationComponent,
AnimationTrigger,
BackgroundStyle,
BorderRadius,
ChildPaintOrder,
type Component,
Font,
FollowTarget,
GenericComponent,
HorizontalSpacer,
Image,
ImageSequencer,
Layout,
LayoutMotion,
MarkerBehavior,
PaintOrder,
SelfLayout,
Strikethrough,
Text,
Transform,
Underline,
VerticalSpacer,
} from './components';
import {
  BorderEffect,
  BlendModeEffect,
  FisheyeEffect,
  FlickerEffect,
  NoiseEffect,
  type Effect,
  GaussianBlurEffect,
  GlowEffect,
  MotionBlurEffect,
  ReplicatorEffect,
  ShadowEffect,
  StrokeEffect,
  StreakEffect,
  TypewriterEffect,
  VignetteEffect,
  WipeRevealEffect,
} from './effects';
import {
  CompositionArea,
  BackgroundEntity,
  ImageFlowEntity,
  Marker,
  Page,
  type PhysicalEntity,
  assertStableEntityIds,
  Row,
  Video,
  VideoArea,
  Viewport,
  Word,
} from './physical-entities';
import { buildProperty, Property } from './property';
import {
  ensureComponentDefaults,
  ensureEffectDefaults,
} from './property-defaults';
import { normalizeFillPattern } from './fill-pattern';
import { resolveTrackTargetDetails } from './animation/target';
import type { RowState } from './types';
import { normalizeStateStyleSources } from './state-style';
import type {
  EcsComponentNode,
  EcsEffectNode,
  EcsEntityNode,
  EcsLeaf,
  EcsPropGroup,
  EcsPropNode,
} from './ecs-preset-types';
import type { RandomizerConfig } from './randomizer-types';
export type {
  EcsComponentNode,
  EcsEffectNode,
  EcsEntityNode,
  EcsLeaf,
  EcsPropGroup,
  EcsPropNode,
  EcsRandomizer,
  EcsTransition,
} from './ecs-preset-types';

/**
 * ECS-native preset format: a JSON tree that mirrors the runtime model
 * (entity -> components/effects -> child entities). `serializeEntityTree`
 * writes it from a built tree and `buildEcsTree` reads it back - the two are
 * inverses (round-trip tested), so the on-disk
 * `caption-style-presets/*.json` are generated, never hand-kept. Leaves
 * keep the `{type,value,transition?,randomizer?}` shape consumed by
 * `buildProperty`.
 */

function transformFirstComponents<
  T extends { component: string; components?: T[] },
>(components: T[]): T[] {
  const transformIndex = components.findIndex(
    (component) => component.component === 'transform',
  );
  const ordered =
    transformIndex > 0
      ? [
          components[transformIndex],
          ...components.slice(0, transformIndex),
          ...components.slice(transformIndex + 1),
        ]
      : [...components];
  return ordered.map((component) =>
    component.components && component.components.length > 0
      ? {
          ...component,
          components: transformFirstComponents(component.components),
        }
      : component,
  );
}

const TRANSFORM_PROP_ORDER = [
  'positioning',
  'position',
  'positionXUnit',
  'positionYUnit',
  'dimensions',
  'widthUnit',
  'heightUnit',
  'widthMode',
  'heightMode',
  'rotation',
  'scale',
  'opacity',
] as const;
function canonicalTransformProps(
  props: Map<string, Property<unknown>>,
): Map<string, Property<unknown>> {
  const ordered = new Map<string, Property<unknown>>();
  for (const key of TRANSFORM_PROP_ORDER) {
    const property = props.get(key);
    if (property) ordered.set(key, property);
  }
  for (const [key, property] of props) {
    if (!ordered.has(key)) ordered.set(key, property);
  }
  return ordered;
}

function defaultTransform(): Transform {
  return new Transform(
    new Map([
      ['positioning', buildProperty({ type: 'string', value: 'flow' })],
      ['position', buildProperty({ type: 'vector2', value: { x: 0, y: 0 } })],
      ['positionXUnit', buildProperty({ type: 'string', value: 'pt' })],
      ['positionYUnit', buildProperty({ type: 'string', value: 'pt' })],
      ['dimensions', buildProperty({ type: 'vector2', value: { x: 0, y: 0 } })],
      ['widthUnit', buildProperty({ type: 'string', value: 'pt' })],
      ['heightUnit', buildProperty({ type: 'string', value: 'pt' })],
      ['widthMode', buildProperty({ type: 'string', value: 'custom' })],
      ['heightMode', buildProperty({ type: 'string', value: 'custom' })],
      ['rotation', buildProperty({ type: 'number', value: 0 })],
      ['scale', buildProperty({ type: 'vector2', value: { x: 1, y: 1 } })],
      ['opacity', buildProperty({ type: 'number', value: 1 })],
    ]),
  );
}

function ensureTransformFirst(entity: PhysicalEntity): void {
  const transform = entity.components.find(
    (component): component is Transform => component instanceof Transform,
  );
  if (!transform && !entity.stateStyleSource) {
    entity.components.unshift(defaultTransform());
  } else if (transform && entity.components[0] !== transform) {
    const index = entity.components.indexOf(transform);
    if (index >= 0) {
      entity.components.splice(index, 1);
      entity.components.unshift(transform);
    }
  }
  for (const child of entity.children) ensureTransformFirst(child);
}

function assertRowTransforms(node: EcsEntityNode): void {
  if (
    node.entity === 'row' &&
    !node.styleSource &&
    !(node.components ?? []).some(
      (component) => component.component === 'transform',
    )
  ) {
    throw new Error(
      `ECS preset row "${node.id}" must declare a transform component`,
    );
  }
  for (const child of node.children ?? []) assertRowTransforms(child);
}

function assertEffectIds(
  node: EcsEntityNode,
  seen = new Map<string, string>(),
): void {
  const visitEffects = (
    effects: readonly EcsEffectNode[] | undefined,
    path: string,
  ): void => {
    for (const [index, effect] of (effects ?? []).entries()) {
      const effectPath = `${path}[${index}]`;
      if (effect.id.trim().length === 0) {
        throw new Error(
          `ECS entity "${node.id}" effect at ${effectPath} is missing an id`,
        );
      }
      const previousPath = seen.get(effect.id);
      if (previousPath) {
        throw new Error(
          `ECS entity "${node.id}" has duplicate effect ID "${effect.id}" at ${effectPath}; already used at ${previousPath}`,
        );
      }
      seen.set(effect.id, effectPath);
    }
  };
  const visitComponents = (
    components: readonly EcsComponentNode[] | undefined,
    path: string,
  ): void => {
    for (const [index, component] of (components ?? []).entries()) {
      const componentPath = `${path}[${index}]`;
      visitEffects(component.effects, `${componentPath}.effects`);
      visitComponents(component.components, `${componentPath}.components`);
    }
  };

  visitEffects(node.effects, `entity.effects`);
  visitComponents(node.components, `entity.components`);
  for (const child of node.children ?? []) assertEffectIds(child, seen);
}

function assertMarkerBehaviorPlacement(node: EcsEntityNode): void {
  if (
    (node.components ?? []).some(
      (component) => component.component === 'marker',
    )
  ) {
    throw new Error(
      'ECS preset marker component is obsolete; use image and markerBehavior components',
    );
  }
  const markerComponents = (node.components ?? []).filter(
    (component) => component.component === 'markerBehavior',
  );
  if (markerComponents.length > 1) {
    throw new Error(
      `ECS preset entity "${node.id}" may only contain one marker behavior component`,
    );
  }
  if (markerComponents.length > 0 && node.entity !== 'marker') {
    throw new Error(
      `ECS preset entity "${node.id}" may only attach marker behavior to a marker entity`,
    );
  }
  if (node.entity === 'marker') {
    const componentTypes = new Set(
      (node.components ?? []).map((component) => component.component),
    );
    for (const required of ['transform', 'image', 'followTarget']) {
      if (!componentTypes.has(required)) {
        throw new Error(
          `ECS preset marker "${node.id}" must declare a ${required} component`,
        );
      }
    }
  }
  for (const component of node.components ?? [])
    assertNestedMarkerBehaviorPlacement(component, node.id);
  for (const child of node.children ?? []) assertMarkerBehaviorPlacement(child);
}

function assertBackgroundEntityPlacement(node: EcsEntityNode): void {
  if (node.entity === 'background') {
    const componentTypes = new Set(
      (node.components ?? []).map((component) => component.component),
    );
    for (const required of ['transform', 'backgroundStyle']) {
      if (!componentTypes.has(required)) {
        throw new Error(
          `ECS background entity "${node.id}" must declare a ${required} component`,
        );
      }
    }
  }
  for (const child of node.children ?? [])
    assertBackgroundEntityPlacement(child);
}

function assertNestedMarkerBehaviorPlacement(
  component: EcsComponentNode,
  entityId: string,
): void {
  if (
    component.components?.some((child) => child.component === 'markerBehavior')
  ) {
    throw new Error(
      `ECS preset entity "${entityId}" may only attach marker behavior as a top-level component`,
    );
  }
  for (const child of component.components ?? [])
    assertNestedMarkerBehaviorPlacement(child, entityId);
}

function ensureViewportLayout(viewport: Viewport): void {
  if (!viewport.layout) viewport.addComponent(new Layout());
  const compositionArea = viewport.children.find(
    (child): child is CompositionArea => child instanceof CompositionArea,
  );
  if (compositionArea && !compositionArea.layout)
    compositionArea.addComponent(new Layout());
}

function defaultVideoAreaLayout(): Layout {
  return new Layout(
    new Map([
      ['layoutMode', buildProperty({ type: 'string', value: 'overlay' })],
      ['padding.top', buildProperty({ type: 'number', value: 0 })],
      ['padding.right', buildProperty({ type: 'number', value: 0 })],
      ['padding.bottom', buildProperty({ type: 'number', value: 0 })],
      ['padding.left', buildProperty({ type: 'number', value: 0 })],
      ['clipContent', buildProperty({ type: 'boolean', value: true })],
    ]),
  );
}

function assertViewportVideoStructure(viewport: Viewport): void {
  const videoArea = viewport.videoArea;
  const compositionArea = viewport.children.find(
    (child): child is CompositionArea => child instanceof CompositionArea,
  );
  if (!videoArea)
    throw new Error('ECS viewport must contain a VideoArea child');
  if (!videoArea.layout)
    throw new Error('ECS VideoArea must contain a Layout component');
  if (!videoArea.video)
    throw new Error('ECS VideoArea must contain a nested Video child');
  if (viewport.children.some((child) => child instanceof Video)) {
    throw new Error('ECS Video must be nested inside VideoArea');
  }
  if (!compositionArea)
    throw new Error('ECS viewport must contain a CompositionArea child');
}

// --- serialize (live tree -> JSON) ---

function serializeProperty(property: Property<unknown>): EcsLeaf | undefined {
  if (
    property.runtimeOnly &&
    property.transition === undefined &&
    property.randomizer === undefined
  )
    return undefined;
  if (property.kind === 'pattern') {
    const pattern = normalizeFillPattern(property.base);
    return pattern
      ? {
          type: 'pattern',
          pattern: pattern.pattern,
          colors: pattern.colors,
          offset: pattern.offset,
        }
      : undefined;
  }
  const leaf: EcsLeaf = { type: property.kind, value: property.base };
  if (property.unit && property.unit !== 'pt') leaf.unit = property.unit;
  if (property.squircle !== undefined) leaf.squircle = property.squircle;
  if (property.transition !== undefined) leaf.transition = property.transition;
  if (property.randomizer !== undefined) {
    const { seed: _seed, ...randomizerWithoutSeed } =
      property.randomizer as RandomizerConfig & { seed?: number };
    leaf.randomizer = randomizerWithoutSeed;
  }
  if (property.runtimeOnly) leaf.runtimeOnly = true;
  return leaf;
}

function isEcsPropLeaf(value: unknown): value is EcsLeaf {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}

function setSerializedProp(
  serializedProps: EcsPropGroup,
  path: string,
  leaf: EcsLeaf,
): void {
  const segments = path.split('.');
  const leafKey = segments.pop();
  if (!leafKey) return;
  let propertyGroup = serializedProps;
  for (const segment of segments) {
    const existing = propertyGroup[segment];
    if (!existing || isEcsPropLeaf(existing)) propertyGroup[segment] = {};
    propertyGroup = propertyGroup[segment] as EcsPropGroup;
  }
  propertyGroup[leafKey] = leaf;
}

function serializeProps(
  props: Map<string, Property<unknown>>,
): Record<string, EcsPropNode> | undefined {
  if (props.size === 0) return undefined;
  const serializedProps: EcsPropGroup = {};
  for (const [key, property] of props) {
    const leaf = serializeProperty(property);
    if (leaf) setSerializedProp(serializedProps, key, leaf);
  }
  return serializedProps;
}

function serializeComponent(component: Component): EcsComponentNode {
  const node: EcsComponentNode = { component: component.type };
  if (component.dependencyOf) node.dependencyOf = component.dependencyOf;
  if (component.attachedTo) node.attachedTo = component.attachedTo;
  if (component instanceof AnimationComponent) {
    const definition = component.definition;
    node.enabled = definition.enabled;
    node.name = definition.name;
    node.phase = definition.phase;
    node.playbackMode = definition.playbackMode;
    node.scope = definition.scope;
    node.durationSeconds = definition.durationSeconds;
    node.delaySeconds = definition.delaySeconds;
    node.triggerBehavior = definition.triggerBehavior;
    node.lifecycleScheduling = definition.lifecycleScheduling;
    node.sequencer = { ...definition.sequencer };
    node.tracks = definition.tracks.map((track) => {
      return {
        ...track,
        keyframes: track.keyframes.map((keyframe) => ({ ...keyframe })),
      };
    });
    return node;
  }
  const props = serializeProps(
    component instanceof Transform
      ? canonicalTransformProps(component.props)
      : component.props,
  );
  const blur =
    component instanceof BackgroundStyle
      ? component.getProp('blur')
      : undefined;
  if (props && component instanceof BackgroundStyle && blur) delete props.blur;
  if (props) node.props = props;
  if (component.components.length > 0)
    node.components = component.components.map(serializeComponent);
  if (component instanceof BackgroundStyle && blur) {
    const blurEffect = new GaussianBlurEffect(new Map([['blurRadius', blur]]));
    node.effects = [
      serializeEffect(blurEffect),
      ...(component.effects.length > 0
        ? component.effects.map(serializeEffect)
        : []),
    ];
    return node;
  }
  if (component.effects.length > 0)
    node.effects = component.effects.map(serializeEffect);
  return node;
}

function serializeEffect(effect: Effect): EcsEffectNode {
  const node: EcsEffectNode = {
    effect: effect.type,
    id: effect.id ?? `${effect.type}-generated`,
  };
  const props = serializeProps(effect.props);
  if (props) node.props = props;
  if (effect.dependencyOf) node.dependencyOf = effect.dependencyOf;
  return node;
}

/** Serialize a built entity tree to the ECS JSON node shape. */
export function serializeEntityTree(entity: PhysicalEntity): EcsEntityNode {
  const node: EcsEntityNode = { entity: entity.kind, id: entity.id };
  if (
    (entity instanceof BackgroundEntity || entity instanceof Marker) &&
    entity.forEntityId
  ) {
    node.forEntityId = entity.forEntityId;
  }
  if (entity.stateStyleSource) node.styleSource = entity.stateStyleSource;
  if (entity.components.length > 0)
    node.components = transformFirstComponents(
      entity.components.map(serializeComponent),
    );
  if (entity.effects.length > 0)
    node.effects = entity.effects.map(serializeEffect);
  if (entity.children.length > 0)
    node.children = entity.children.map(serializeEntityTree);
  return node;
}

// --- build (JSON -> live tree) ---

function parseProps(
  props: Record<string, EcsPropNode> | undefined,
  prefix = '',
  randomizerPrefix = '',
): Map<string, Property<unknown>> {
  const map = new Map<string, Property<unknown>>();
  if (!props) return map;
  for (const [key, rawNode] of Object.entries(props)) {
    const node = rawNode;
    const path = prefix ? `${prefix}.${key}` : key;
    if (isEcsPropLeaf(node)) {
      map.set(
        path,
        buildProperty(
          node,
          randomizerPrefix ? `${randomizerPrefix}.${path}` : path,
        ),
      );
    } else if (node && typeof node === 'object' && !Array.isArray(node)) {
      for (const [childKey, property] of parseProps(
        node as Record<string, EcsPropNode>,
        path,
        randomizerPrefix,
      )) {
        map.set(childKey, property);
      }
    }
  }
  return map;
}

function parseLayoutProps(
  props: Record<string, EcsPropNode> | undefined,
): Map<string, Property<unknown>> {
  const map = parseProps(props, '', 'layout');
  map.delete('dimensions');
  map.delete('offset');
  return map;
}

/** Construct a component from its type tag. Unknown tags become GenericComponents. */
function parseComponent(node: EcsComponentNode): Component {
  const componentType = node.component;
  if (componentType === 'marker') {
    throw new Error(
      'ECS preset marker component is obsolete; use image and markerBehavior components',
    );
  }
  const props = parseProps(node.props, '', componentType);
  let component: Component;
  switch (componentType) {
    case 'animation':
      component = new AnimationComponent({
        enabled: node.enabled ?? true,
        name: node.name ?? 'Animation',
        phase: node.phase ?? 'enter',
        playbackMode:
          node.playbackMode === 'loop' || node.playbackMode === 'pingPong'
            ? node.playbackMode
            : 'once',
        scope: node.scope ?? 'self',
        durationSeconds: node.durationSeconds ?? 0.3,
        delaySeconds: node.delaySeconds ?? 0,
        triggerBehavior:
          node.triggerBehavior === 'restart' ||
          node.triggerBehavior === 'continue'
            ? node.triggerBehavior
            : 'adaptive',
        lifecycleScheduling:
          node.lifecycleScheduling === 'sequential' ? 'sequential' : 'overlap',
        sequencer: node.sequencer ?? DEFAULT_ANIMATION_SEQUENCER,
        tracks: node.tracks ?? [],
      });
      break;
    case 'layout':
      component = new Layout(parseLayoutProps(node.props));
      break;
    case 'layoutMotion':
      component = new LayoutMotion(props);
      break;
    case 'paintOrder':
      component = new PaintOrder(props);
      break;
    case 'childPaintOrder':
      component = new ChildPaintOrder(props);
      break;
    case 'followTarget':
      component = new FollowTarget(props);
      break;
    case 'selfLayout':
      component = new SelfLayout(props);
      break;
    case 'transform':
      component = new Transform(canonicalTransformProps(props));
      break;
    case 'backgroundStyle':
      component = new BackgroundStyle(props);
      break;
    case 'image':
      component = new Image(props);
      break;
    case 'imageSequencer':
      component = new ImageSequencer(props);
      break;
    case 'animationTrigger':
      component = new AnimationTrigger(props);
      break;
    case 'borderRadius':
      component = new BorderRadius(props);
      break;
    case 'font':
      component = new Font(props);
      break;
    case 'text':
      component = new Text(props);
      break;
    case 'underline':
      component = new Underline(props);
      break;
    case 'strikethrough':
      component = new Strikethrough(props);
      break;
    case 'verticalSpacer':
      component = new VerticalSpacer(props);
      break;
    case 'horizontalSpacer':
      component = new HorizontalSpacer(props);
      break;
    case 'markerBehavior':
      component = new MarkerBehavior(props);
      break;
    default:
      component = new GenericComponent(componentType, props);
      break;
  }
  ensureComponentDefaults(component);
  if (node.components) {
    for (const child of node.components)
      component.components.push(parseComponent(child));
    }
  const effects = normalizeNoiseEffectDependencies(node.effects ?? []);
  for (let index = 0; index < effects.length; index += 1) {
    component.effects.push(parseEffect(effects[index], index));
  }
  if (
    typeof node.dependencyOf === 'string' &&
    node.dependencyOf.trim().length > 0
  ) {
    component.dependencyOf = node.dependencyOf;
  }
  if (
    typeof node.attachedTo === 'string' &&
    node.attachedTo.trim().length > 0
  ) {
    component.attachedTo = node.attachedTo;
  }
  return component;
}

function parseEffect(node: EcsEffectNode, index = 0): Effect {
  if (node.id.trim().length === 0)
    throw new Error(`ECS effect "${node.effect}" is missing an id`);
  const props = parseProps(
    node.props,
    '',
    `${node.effect}:${node.id ?? index}`,
  );
  const effect =
    node.effect === 'motionBlur'
      ? new MotionBlurEffect(props)
      : node.effect === 'streak'
        ? new StreakEffect(props)
        : node.effect === 'border'
          ? new BorderEffect(props)
          : node.effect === 'blendMode'
            ? new BlendModeEffect(props)
            : node.effect === 'shadow'
              ? new ShadowEffect(props)
              : node.effect === 'stroke'
                ? new StrokeEffect(props)
                : node.effect === 'glow'
                  ? new GlowEffect(props)
                  : node.effect === 'noise'
                    ? new NoiseEffect(props)
                    : node.effect === 'flicker'
                      ? new FlickerEffect(props)
                      : node.effect === 'fisheye'
                        ? new FisheyeEffect(props)
                        : node.effect === 'vignette'
                          ? new VignetteEffect(props)
                          : node.effect === 'replicator'
                            ? new ReplicatorEffect(props)
                            : node.effect === 'typewriter'
                              ? new TypewriterEffect(props)
                              : node.effect === 'wipeReveal'
                                ? new WipeRevealEffect(props)
                                : new GaussianBlurEffect(props);
  ensureEffectDefaults(effect);
  effect.id = node.id;
  if (
    typeof node.dependencyOf === 'string' &&
    node.dependencyOf.trim().length > 0
  ) {
    effect.dependencyOf = node.dependencyOf;
  }
  return effect;
}

function normalizeNoiseEffectDependencies(
  effects: readonly EcsEffectNode[],
): EcsEffectNode[] {
  const dependencyParents = new Set(
    effects
      .filter((effect) => effect.effect === 'blendMode' && effect.dependencyOf)
      .map((effect) => effect.dependencyOf),
  );
  return effects.flatMap((effect) => {
    if (effect.effect !== 'noise' || effect.dependencyOf) return [effect];
    const legacyBlendMode = effect.props?.blendMode;
    const hasLegacyBlendMode =
      effect.props !== undefined &&
      Object.prototype.hasOwnProperty.call(effect.props, 'blendMode');
    const normalizedProps = { ...effect.props };
    delete normalizedProps.blendMode;
    const normalizedNoise = hasLegacyBlendMode
      ? { ...effect, props: normalizedProps }
      : effect;
    if (dependencyParents.has(effect.id)) return [normalizedNoise];
    return [
      normalizedNoise,
      {
        effect: 'blendMode',
        id: `${effect.id}:blend-mode`,
        dependencyOf: effect.id,
        props: {
          appliesOn: { type: 'string', value: 'base' },
          enabled: { type: 'boolean', value: true },
          blendMode: legacyBlendMode ?? { type: 'string', value: 'normal' },
        },
      },
    ];
  });
}

function makeEntity(node: EcsEntityNode): PhysicalEntity {
  if (node.entity === 'marker') {
    const marker = new Marker(node.id, {}, false);
    marker.forEntityId = node.forEntityId ?? null;
    return marker;
  }
  if (node.entity === 'background') {
    return new BackgroundEntity(node.id, node.forEntityId ?? null, false);
  }
  switch (node.entity) {
    case 'viewport':
      return new Viewport(node.id);
    case 'video':
      return new Video(node.id);
    case 'videoArea':
      return new VideoArea(node.id);
    case 'page':
      return new Page(node.id);
    case 'row': {
      const row = new Row(node.id);
      const match = /^row:(past|previous|current|next|future)$/.exec(node.id);
      if (match) row.state = match[1] as RowState;
      return row;
    }
    case 'word':
      return new Word(node.id);
    case 'image':
      return new ImageFlowEntity(node.id);
    default:
      return new CompositionArea(node.id);
  }
}

function parseEntity(node: EcsEntityNode): PhysicalEntity {
  const entity = makeEntity(node);
  entity.stateStyleSource = node.styleSource ?? null;
  for (const component of transformFirstComponents(node.components ?? []))
    entity.addComponent(parseComponent(component));
  const effects = normalizeNoiseEffectDependencies(node.effects ?? []);
  for (let index = 0; index < effects.length; index += 1)
    entity.addEffect(parseEffect(effects[index], index));
  for (const child of node.children ?? []) entity.addChild(parseEntity(child));
  ensureTransformFirst(entity);
  return entity;
}

function descendantsOf(entity: PhysicalEntity): PhysicalEntity[] {
  const descendants: PhysicalEntity[] = [];
  for (const child of entity.children) {
    descendants.push(child, ...descendantsOf(child));
  }
  return descendants;
}

function animationTargetsFor(
  entity: PhysicalEntity,
  scope: AnimationScope,
): PhysicalEntity[] {
  if (scope === 'self') return [entity];
  if (scope === 'children') return [...entity.children];
  return descendantsOf(entity);
}

function visitAnimationComponents(
  components: readonly Component[],
  visit: (component: AnimationComponent) => void,
): void {
  for (const component of components) {
    if (component instanceof AnimationComponent) visit(component);
    visitAnimationComponents(component.components, visit);
  }
}

function assertAnimationTargetContract(root: PhysicalEntity): void {
  root.traverse((entity) => {
    visitAnimationComponents(entity.components, (animation) => {
      const targets = animationTargetsFor(entity, animation.definition.scope);
      for (const track of animation.definition.tracks) {
        if (typeof track.target !== 'string') {
          throw new Error(
            `ECS animation target on "${entity.id}" must be a string.`,
          );
        }
        if (
          targets.some((target) =>
            resolveTrackTargetDetails(target, track.target),
          )
        )
          continue;
        throw new Error(
          `ECS animation target "${track.target}" on "${entity.id}" must use Component.property or Effect#id.property and resolve on its animation scope.`,
        );
      }
    });
  });
}

/**
 * Build a live entity tree from an ECS-native preset `design` node.
 * ECS presets are expected to be rooted at `viewport`.
 */
export function buildEcsTree(design: EcsEntityNode | undefined): Viewport {
  if (!design) {
    const viewport = new Viewport('viewport');
    viewport.addComponent(defaultTransform());
    viewport.addComponent(new Layout());
    const videoArea = viewport.addChild(new VideoArea('videoArea'));
    videoArea.addComponent(defaultTransform());
    videoArea.addComponent(defaultVideoAreaLayout());
    const video = videoArea.addChild(new Video('video'));
    video.addComponent(defaultTransform());
    const compositionArea = viewport.addChild(
      new CompositionArea('compositionArea'),
    );
    compositionArea.addComponent(defaultTransform());
    compositionArea.addComponent(new Layout());
    ensureTransformFirst(viewport);
    return viewport;
  }
  const normalizedDesign = normalizeStateStyleSources(design);
  assertMarkerBehaviorPlacement(normalizedDesign);
  assertBackgroundEntityPlacement(normalizedDesign);
  assertRowTransforms(normalizedDesign);
  assertEffectIds(normalizedDesign);
  const root = parseEntity(normalizedDesign);
  if (!(root instanceof Viewport))
    throw new Error('ECS preset design must be rooted at a Viewport');
  ensureViewportLayout(root);
  assertViewportVideoStructure(root);
  assertAnimationTargetContract(root);
  ensureTransformFirst(root);
  assertStableEntityIds(root);
  return root;
}

/** Build from a whole ECS-native preset object (`{id,name,design}`). */
export function buildEcsTreeFromPreset(preset: {
  design?: EcsEntityNode;
}): Viewport {
  return buildEcsTree(preset.design);
}
