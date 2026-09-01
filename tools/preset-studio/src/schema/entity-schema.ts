/**
 * Canonical "all properties" schema for the ECS entity tree, plus the
 * merge/reduce helpers the editor uses to show *every* component and property
 * an entity can carry - even the ones a given preset omits (the engine falls
 * back to a default for those, so without this they'd be invisible/uneditable).
 *
 * The engine's own defaults live as scattered `?? fallback` reads inside each
 * component class (`src/caption-engine/entity-system/components/*`), so there is
 * no single value to import. This module mirrors them. Because the editor
 * *prunes* untouched defaults back out on write (see `reduceEntityComponents`),
 * a slightly-off default here only affects the shown starting value, never the
 * rendered result - the engine still applies its own default for anything the
 * saved preset omits.
 *
 * ## Per-state inheritance (row/word `:default` vs `:past`/`:previous`/`:current`/`:next`/`:future`)
 * A relative state can store a `styleSource` reference to any other sibling
 * state. The engine resolves that reference before it instantiates the state
 * template. Custom states keep their own complete style payload.
 * - base entities write pruned-minimal (`mode: 'minimal'`),
 * - inherited state entities store only `styleSource`,
 * - custom state entities seed from the resolved source and write full
 *   (`mode: 'full'`), dropping only all-default optional components.
 */
import {
  createStudioComponentId,
  layoutMotionModeForEntity,
  normalizeLayoutMotionFocusPosition,
  normalizeLayoutMotionFlowDirection,
  type EcsComponentDoc,
  type EcsEffectDoc,
  type EcsEntityDoc,
  type EcsMarkerEntityConfig,
} from './ecs-tree';
import type { LeafDefinition, PropertyNode } from './property-tree';
import type { AnimationTrackDoc } from './animation';
import { createAnimationFromPreset, ANIMATION_PRESETS, findAnimationPreset } from './animation-presets';
import {
  cloneComponentsWithRemappedEffectIds,
  createEffectId,
  createEffectIdMap,
  createScopedEffectId,
  effectScopeForEntity,
} from './effect-id';
import { qualifiedEffectTarget } from './animation-target';
import { valuesEqual } from '@/lib/values-equal';
import { isPaint, normalizePaint, solidPaint, type Paint } from './paint';
import {
  cursorPresetDefinition,
  DEFAULT_BUNDLED_IMAGE_ASSET,
  DEFAULT_IMAGE_COLOR,
  DEFAULT_FONT_EMOJI_SETTINGS,
  resolveFontEmojiSettings,
} from '@captioncat/caption-engine/browser';
import {
  FOLLOW_TARGET_BOUNDS_MAPPINGS,
  type FollowTargetKind,
} from '@captioncat/caption-engine/browser';
import {
  DEFAULT_REPLICATOR_FILL_TARGET,
  DEFAULT_REPLICATOR_CUSTOM_FILLS,
} from '@captioncat/caption-engine/browser';
import {
  isStateStyleSource,
  type StateStyleSource,
} from '@captioncat/caption-engine/browser';

/** Every physical entity kind the design tree can contain, in canonical nesting order. */
export const ALL_ENTITY_KINDS = [
  'viewport',
  'videoArea',
  'video',
  'compositionArea',
  'page',
  'row',
  'image',
  'word',
  'marker',
  'background',
] as const;

// --- leaf builders (match the on-disk leaf shapes) ---

const num = (value: number): LeafDefinition => ({ kind: 'leaf', type: 'number', value });
const fontWeight = (value: number): LeafDefinition => ({ kind: 'leaf', type: 'fontWeight', value });
const vec = (x: number, y: number): LeafDefinition => ({ kind: 'leaf', type: 'vector2', value: { x, y } });
const col = (value: string): LeafDefinition => ({ kind: 'leaf', type: 'paint', value: solidPaint(value) });
const bool = (value: boolean): LeafDefinition => ({ kind: 'leaf', type: 'boolean', value });
const str = (value: string): LeafDefinition => ({ kind: 'leaf', type: 'string', value });
const fam = (value: string[]): LeafDefinition => ({ kind: 'leaf', type: 'fontFamily', value });
const arr = (value: unknown[]): LeafDefinition => ({ kind: 'leaf', type: 'array', value });
const fillPattern = (
  pattern: 'single' | 'cycle' | 'alternate',
  colors: string[],
  offset = 0,
): LeafDefinition => ({
  kind: 'leaf',
  type: 'pattern',
  value: { pattern, colors, offset },
});
const group = (children: Record<string, PropertyNode>): PropertyNode => ({
  kind: 'container',
  wrapping: 'inline',
  children,
});
const insets = (value: number): PropertyNode =>
  group({
    top: num(value),
    right: num(value),
    bottom: num(value),
    left: num(value),
    linkedTopBottom: bool(true),
    linkedLeftRight: bool(true),
  });
const defaultTypewriterCursor = cursorPresetDefinition('mac');

export interface PropertyVisibilityRule {
  path?: readonly string[];
  fields: readonly string[];
  isVisible: (props: Record<string, PropertyNode>, entity: EcsEntityDoc) => boolean;
}

export interface PropertyVisibilityMetadata {
  hidden?: readonly string[];
  rules?: readonly PropertyVisibilityRule[];
}

/** A component's canonical prop set (+ nested components such as decorations under Text). */
export interface ComponentTemplate {
  component: string;
  props: Record<string, PropertyNode>;
  components?: ComponentTemplate[];
  allowedEntities?: string[];
  allowedQuantity?: number;
  allowDisable?: boolean;
  /** Components are non-deletable unless a template explicitly opts in. */
  isDeletable?: boolean;
  required?: boolean;
  dependencies?: readonly ComponentDependencyTemplate[];
  /** Component type this template is visually attached below when created. */
  attachedTo?: string;
  propertyVisibility?: PropertyVisibilityMetadata;
}

export interface ComponentDependencyTemplate {
  component: string;
  /** Optional animation preset for the dependency. */
  preset?: string;
  /** Optional display name for an animation dependency. */
  name?: string;
  /** Optional tracks owned by the dependency parent, such as Marker target motion. */
  tracks?: readonly AnimationTrackDoc[];
  /** Whether the dependency may be disabled independently of its owner. */
  allowDisable?: boolean;
  /** Whether the dependency may be deleted independently of its owner. */
  isDeletable?: boolean;
}

export interface AddableComponentSlot {
  template: ComponentTemplate;
  parentPath: string[];
}

/**
 * A post-paint effect an entity (or, for effects with `allowedComponents`, a
 * specific *component* on an entity - e.g. a BackgroundStyle's border/shadow)
 * can carry (`EcsEffectDoc` without the `explicit`/quantity bookkeeping
 * components have - see `ecs-tree.ts`). Effect templates can set a per-owner
 * quantity cap while the engine still supports stacking different effects.
 */
export interface EffectTemplate {
  effect: string;
  props: Record<string, PropertyNode>;
  /** Entity kinds this effect can attach directly to (shown in the entity's own "Add Effects" menu). */
  allowedEntities?: readonly string[];
  /** Component types this effect can attach to instead (shown in that component's own "Add Effects" menu) - e.g. `border`/`shadow` on `backgroundStyle`. */
  allowedComponents?: readonly string[];
  /** Maximum count of this effect on a single owner. Defaults to unlimited. */
  allowedQuantity?: number;
  /** Effects that are created and removed with this effect. */
  dependencies?: readonly EffectTemplate[];
  /** Parent effect ID for an effect that is only available as a dependency. */
  dependencyOf?: string;
  propertyVisibility?: PropertyVisibilityMetadata;
}

function compareAlphabetically(left: string, right: string): number {
  return left.localeCompare(right, undefined, { sensitivity: 'base' }) || left.localeCompare(right);
}

const MAX_EFFECT_QUANTITY = 8;

const BLUR_EFFECT: EffectTemplate = {
  effect: 'blur',
  allowedEntities: ALL_ENTITY_KINDS,
  allowedComponents: ['backgroundStyle', 'image'],
  props: { appliesOn: str('base'), enabled: bool(true), showOriginal: str('none'), blurRadius: num(8) },
};

const MOTION_BLUR_EFFECT: EffectTemplate = {
  effect: 'motionBlur',
  allowedEntities: ALL_ENTITY_KINDS,
  props: {
    appliesOn: str('base'),
    enabled: bool(true),
    steps: num(8),
    angle: num(0),
    distance: num(8),
    maxOpacity: num(0.7),
    showOriginal: str('none'),
  },
};

const STREAK_EFFECT: EffectTemplate = {
  effect: 'streak',
  allowedEntities: ALL_ENTITY_KINDS,
  props: {
    appliesOn: str('base'),
    enabled: bool(true),
    steps: num(8),
    angle: num(0),
    distance: num(8),
    maxOpacity: num(0.7),
    showOriginal: str('none'),
  },
};

const BORDER_EFFECT: EffectTemplate = {
  effect: 'border',
  allowedEntities: ALL_ENTITY_KINDS,
  allowedComponents: ['backgroundStyle'],
  allowedQuantity: MAX_EFFECT_QUANTITY,
  props: {
    appliesOn: str('base'),
    enabled: bool(true),
    width: num(12),
    color: col('#000000'),
    position: str('outer'),
    style: str('solid'),
  },
};

const GLOW_EFFECT: EffectTemplate = {
  effect: 'glow',
  allowedEntities: ALL_ENTITY_KINDS,
  allowedComponents: ['backgroundStyle', 'image', 'text', 'underline', 'strikethrough'],
  allowedQuantity: MAX_EFFECT_QUANTITY,
  props: {
    appliesOn: str('base'),
    enabled: bool(true),
    mode: str('outer'),
    color: col('rgba(255,255,255,1)'),
    blurRadius: num(12),
    strength: num(1),
  },
};

const BLEND_MODE_EFFECT: EffectTemplate = {
  effect: 'blendMode',
  allowedEntities: ALL_ENTITY_KINDS,
  allowedComponents: ['backgroundStyle', 'image', 'text', 'underline', 'strikethrough'],
  allowedQuantity: MAX_EFFECT_QUANTITY,
  props: {
    appliesOn: str('base'),
    enabled: bool(true),
    blendMode: str('normal'),
  },
};

const NOISE_EFFECT: EffectTemplate = {
  effect: 'noise',
  allowedEntities: ALL_ENTITY_KINDS,
  allowedComponents: ['backgroundStyle', 'image', 'text', 'underline', 'strikethrough'],
  allowedQuantity: MAX_EFFECT_QUANTITY,
  dependencies: [BLEND_MODE_EFFECT],
  props: {
    appliesOn: str('previousEffect'),
    enabled: bool(true),
    static: bool(false),
    noise: num(0.04),
  },
};

const FLICKER_EFFECT: EffectTemplate = {
  effect: 'flicker',
  allowedEntities: ALL_ENTITY_KINDS,
  allowedComponents: ['backgroundStyle', 'image', 'text', 'underline', 'strikethrough'],
  allowedQuantity: MAX_EFFECT_QUANTITY,
  props: {
    appliesOn: str('previousEffect'),
    enabled: bool(true),
    showOriginal: str('none'),
    showOriginalDuringOff: bool(false),
    flicker: num(0.03),
    offPaint: col('#000000'),
    updateMode: str('everyFrame'),
    maxOffDuration: num(0),
  },
};

const VIGNETTE_EFFECT: EffectTemplate = {
  effect: 'vignette',
  allowedEntities: ALL_ENTITY_KINDS,
  allowedComponents: ['backgroundStyle', 'image', 'text', 'underline', 'strikethrough'],
  allowedQuantity: MAX_EFFECT_QUANTITY,
  props: {
    appliesOn: str('previousEffect'),
    enabled: bool(true),
    vignette: num(0),
    center: vec(0.5, 0.5),
    aspectCorrection: bool(true),
  },
};

const FISHEYE_EFFECT: EffectTemplate = {
  effect: 'fisheye',
  allowedEntities: ALL_ENTITY_KINDS,
  allowedComponents: ['backgroundStyle', 'image', 'text', 'underline', 'strikethrough'],
  allowedQuantity: MAX_EFFECT_QUANTITY,
  dependencies: [VIGNETTE_EFFECT],
  props: {
    appliesOn: str('previousEffect'),
    enabled: bool(true),
    mode: str('concave'),
    distortion: num(0),
    zoom: num(1),
    lensCenter: vec(0.5, 0.5),
    edgeMode: str('transparent'),
    aspectCorrection: bool(true),
  },
};

const SHADOW_EFFECT: EffectTemplate = {
  effect: 'shadow',
  allowedEntities: ALL_ENTITY_KINDS,
  allowedComponents: ['backgroundStyle', 'image', 'text'],
  allowedQuantity: MAX_EFFECT_QUANTITY,
  props: {
    appliesOn: str('base'),
    enabled: bool(true),
    blurRadius: num(8),
    offset: vec(2, 4),
    longShadow: bool(false),
    useFontColor: bool(false),
    color: col('#000000'),
    opacity: num(1),
  },
};

const STROKE_EFFECT: EffectTemplate = {
  effect: 'stroke',
  allowedEntities: ALL_ENTITY_KINDS,
  allowedComponents: ['backgroundStyle', 'image', 'text'],
  allowedQuantity: MAX_EFFECT_QUANTITY,
  props: {
    appliesOn: str('base'),
    enabled: bool(true),
    style: str('solid'),
    alignment: str('outside'),
    antialiasScale: num(2),
    width: num(12),
    color: col('#00c853'),
    useFontColor: bool(false),
    joinType: str('round'),
    capType: str('round'),
    dash: num(24),
    gap: num(24),
    spacing: num(20),
    dashOffset: num(0),
    opacity: num(1),
  },
  propertyVisibility: {
    rules: [
      {
        fields: ['spacing'],
        isVisible: (props) => stringValueFromProps(props, 'style') === 'dotted',
      },
      {
        fields: ['dash', 'gap'],
        isVisible: (props) => stringValueFromProps(props, 'style') === 'dashed',
      },
      {
        fields: ['dashOffset'],
        isVisible: (props) => stringValueFromProps(props, 'style') !== 'solid',
      },
    ],
  },
};

const REPLICATOR_EFFECT: EffectTemplate = {
  effect: 'replicator',
  allowedEntities: ALL_ENTITY_KINDS,
  allowedComponents: ['backgroundStyle', 'image', 'text'],
  props: {
    appliesOn: str('base'),
    enabled: bool(true),
    cloneOrdering: str('backToFront'),
    showOriginal: str('front'),
    cloneCount: num(3),
    fillMode: str('inherit'),
    fillTarget: str(DEFAULT_REPLICATOR_FILL_TARGET),
    fillSeed: num(0),
    customFills: arr([...DEFAULT_REPLICATOR_CUSTOM_FILLS]),
    position: vec(4, 4),
    rotation: num(0),
    scale: vec(0, 0),
    opacity: num(0),
    copyIds: { kind: 'leaf', type: 'array', value: ['copy_1', 'copy_2', 'copy_3'] },
    copyOverrides: group({}),
  },
  propertyVisibility: {
    rules: [{ fields: ['fillSeed'], isVisible: (props) => stringValueFromProps(props, 'fillMode') === 'random' }],
  },
};

const TYPEWRITER_EFFECT: EffectTemplate = {
  effect: 'typewriter',
  allowedComponents: ['text'],
  allowedQuantity: 1,
  props: {
    appliesOn: str('base'),
    enabled: bool(true),
    revealMode: str('lifecycle'),
    durationMode: str('auto'),
    reveal: num(1),
    durationSeconds: num(0.8),
    delaySeconds: num(0),
    unitDurationSeconds: num(0.18),
    direction: str('forward'),
    cursor: group({
      enabled: bool(true),
      preset: str('mac'),
      shape: str(defaultTypewriterCursor?.shape ?? 'caret'),
      glyph: str('|'),
      colorMode: str(defaultTypewriterCursor?.colorMode ?? 'original'),
      color: col(defaultTypewriterCursor?.color ?? '#ffffff'),
      size: num(defaultTypewriterCursor?.size ?? 0),
      offset: vec(defaultTypewriterCursor?.offset.x ?? 0, defaultTypewriterCursor?.offset.y ?? 0),
      opacity: num(1),
      showDuringReveal: bool(true),
      showOnStart: bool(false),
      showWhenComplete: bool(false),
      blink: group({
        enabled: bool(true),
        rate: num(2),
        dutyCycle: num(0.5),
        phaseOffset: num(0),
      }),
    }),
    unitTracks: arr([]),
  },
  propertyVisibility: {
    hidden: ['unitTracks'],
    rules: [
      {
        path: ['cursor'],
        fields: ['enabled', 'preset', 'shape', 'glyph'],
        isVisible: () => false,
      },
      {
        path: ['cursor'],
        fields: ['color'],
        isVisible: (props) => stringValueFromProps(props, 'colorMode') !== 'original',
      },
    ],
  },
};

export function replicatorCopyIdsFromProps(props: Record<string, PropertyNode>): string[] {
  const idsNode = props.copyIds;
  const values = idsNode?.kind === 'leaf' && Array.isArray(idsNode.value) ? idsNode.value : [];
  return values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
}

export function normalizeReplicatorProps(props: Record<string, PropertyNode>): Record<string, PropertyNode> {
  const normalizedProps = Object.fromEntries(
    Object.entries(props).filter(([key]) => !['colorMode', 'colorTarget', 'colorSeed', 'customColors'].includes(key)),
  );
  const cloneCountNode = props.cloneCount;
  const rawCloneCount =
    cloneCountNode?.kind === 'leaf' && typeof cloneCountNode.value === 'number' ? cloneCountNode.value : 3;
  const cloneCount = Math.min(1024, Math.max(1, Math.floor(rawCloneCount)));
  const ids: string[] = [];
  const used = new Set<string>();
  for (const id of replicatorCopyIdsFromProps(props)) {
    if (used.has(id)) continue;
    ids.push(id);
    used.add(id);
  }
  while (ids.length < cloneCount) {
    let suffix = ids.length + 1;
    let id = `copy_${suffix}`;
    while (used.has(id)) {
      suffix += 1;
      id = `copy_${suffix}`;
    }
    ids.push(id);
    used.add(id);
  }
  ids.length = cloneCount;
  const fillModeNode = props.fillMode;
  const fillModeValue =
    fillModeNode?.kind === 'leaf' && fillModeNode.type === 'string' &&
    (fillModeNode.value === 'inherit' || fillModeNode.value === 'random' || fillModeNode.value === 'custom')
      ? fillModeNode.value
      : 'inherit';
  const fillTargetNode = props.fillTarget;
  const fillTargetValue =
    fillTargetNode?.kind === 'leaf' &&
    fillTargetNode.type === 'string' &&
    (fillTargetNode.value === 'base' || fillTargetNode.value === 'fullLayer')
      ? fillTargetNode.value
      : DEFAULT_REPLICATOR_FILL_TARGET;
  const fillSeedNode = props.fillSeed;
  const customFillsNode = props.customFills;
  const authoredCustomFills =
    customFillsNode?.kind === 'leaf' && Array.isArray(customFillsNode.value)
      ? customFillsNode.value
          .filter((value): value is Paint => isPaint(value))
          .map((value) => normalizePaint(value, solidPaint('#000000')))
      : [];
  const customFills = authoredCustomFills.length > 0
    ? authoredCustomFills
    : DEFAULT_REPLICATOR_CUSTOM_FILLS.map((value) => normalizePaint(value, solidPaint('#000000')));
  const cloneOrderingNode = props.cloneOrdering;
  const cloneOrderingValue =
    cloneOrderingNode?.kind === 'leaf' &&
    cloneOrderingNode.type === 'string' &&
    (cloneOrderingNode.value === 'frontToBack' || cloneOrderingNode.value === 'backToFront')
      ? cloneOrderingNode.value
      : 'backToFront';
  const nextOverrides = props.copyOverrides?.kind === 'container'
    ? {
        ...props.copyOverrides,
        children: Object.fromEntries(
          Object.entries(props.copyOverrides.children)
            .filter(([id]) => ids.includes(id))
            .map(([id, node]) => [
              id,
              node.kind === 'container'
                ? {
                    ...node,
                    children: Object.fromEntries(
                      Object.entries(node.children).filter(([key]) => key !== 'text' && key !== 'color'),
                    ),
                  }
                : node,
            ]),
        ),
      }
    : group({});
  return {
    ...normalizedProps,
    ...(cloneCountNode?.kind === 'leaf'
      ? { cloneCount: { ...cloneCountNode, value: cloneCount } }
      : { cloneCount: num(cloneCount) }),
    fillMode:
      fillModeNode?.kind === 'leaf'
        ? { ...fillModeNode, type: 'string', value: fillModeValue }
        : str(fillModeValue),
    fillTarget:
      fillTargetNode?.kind === 'leaf'
        ? { ...fillTargetNode, type: 'string', value: fillTargetValue }
        : str(fillTargetValue),
    fillSeed:
      fillSeedNode?.kind === 'leaf' && typeof fillSeedNode.value === 'number'
        ? fillSeedNode
        : num(0),
    customFills:
      customFillsNode?.kind === 'leaf'
        ? { ...customFillsNode, type: 'array', value: customFills }
        : arr(customFills),
    cloneOrdering:
      cloneOrderingNode?.kind === 'leaf'
        ? { ...cloneOrderingNode, type: 'string', value: cloneOrderingValue }
        : str(cloneOrderingValue),
    copyIds: {
      ...(props.copyIds?.kind === 'leaf' ? props.copyIds : { kind: 'leaf', type: 'array' as const }),
      value: ids,
    },
    copyOverrides: nextOverrides,
  };
}

export function replicatorCopyIdsForProps(props: Record<string, PropertyNode>): string[] {
  return replicatorCopyIdsFromProps(normalizeReplicatorProps(props));
}

/** Every effect type the editor can add, regardless of entity/component kind (filter with `effectSlotsForEntity`/`effectSlotsForComponent`). */
const WIPE_REVEAL_EFFECT: EffectTemplate = {
  effect: 'wipeReveal',
  allowedEntities: ['page', 'row', 'word'],
  allowedQuantity: 1,
  props: {
    appliesOn: str('base'),
    enabled: bool(true),
    reveal: num(1),
    direction: str('logicalStartToEnd'),
    shape: str('rectangle'),
    angle: num(45),
    feather: num(0),
    fromStyle: str('next'),
    toStyle: str('current'),
    basePlacement: str('back'),
  },
  propertyVisibility: {
    rules: [
      {
        fields: ['angle'],
        isVisible: (props) => stringValueFromProps(props, 'shape') === 'diagonal',
      },
      {
        fields: ['fromStyle'],
        isVisible: (props) => stringValueFromProps(props, 'basePlacement') !== 'none',
      },
    ],
  },
};

export const EFFECT_TEMPLATES: EffectTemplate[] = [
  BLUR_EFFECT,
  MOTION_BLUR_EFFECT,
  STREAK_EFFECT,
  BORDER_EFFECT,
  GLOW_EFFECT,
  NOISE_EFFECT,
  BLEND_MODE_EFFECT,
  FLICKER_EFFECT,
  VIGNETTE_EFFECT,
  FISHEYE_EFFECT,
  SHADOW_EFFECT,
  STROKE_EFFECT,
  REPLICATOR_EFFECT,
  TYPEWRITER_EFFECT,
  WIPE_REVEAL_EFFECT,
];

/** Effect templates addable directly to this entity kind, alphabetically sorted. */
export function effectSlotsForEntity(entityKind: string): EffectTemplate[] {
  return EFFECT_TEMPLATES
    .filter((template) => !template.dependencyOf && template.allowedEntities?.includes(entityKind))
    .sort((left, right) => compareAlphabetically(left.effect, right.effect));
}

/** Effect templates addable to this component type, alphabetically sorted. */
export function effectSlotsForComponent(componentType: string): EffectTemplate[] {
  return EFFECT_TEMPLATES
    .filter((template) => !template.dependencyOf && template.allowedComponents?.includes(componentType))
    .sort((left, right) => compareAlphabetically(left.effect, right.effect));
}

/** Instantiate an effect template into a fresh, explicit `EcsEffectDoc`. */
export function instantiateEffectTemplate(template: EffectTemplate, scope?: string): EcsEffectDoc {
  return { id: createEffectId(template.effect, scope), effect: template.effect, props: structuredClone(template.props) };
}

export function instantiateEffectTemplateWithDependencies(
  template: EffectTemplate,
  scope?: string,
): EcsEffectDoc[] {
  return instantiateEffectTree(template, scope);
}

export function reorderEffectsWithDependencies(
  effects: readonly EcsEffectDoc[],
  activeId: string,
  overId: string,
): EcsEffectDoc[] {
  const active = effects.find((effect) => effect.id === activeId);
  if (!active || active.dependencyOf || activeId === overId) return [...effects];

  const movingIds = new Set([activeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const effect of effects) {
      if (effect.dependencyOf && movingIds.has(effect.dependencyOf) && !movingIds.has(effect.id)) {
        movingIds.add(effect.id);
        changed = true;
      }
    }
  }
  if (movingIds.has(overId)) return [...effects];

  const moving = effects.filter((effect) => movingIds.has(effect.id));
  const remaining = effects.filter((effect) => !movingIds.has(effect.id));
  const activeIndex = effects.findIndex((effect) => effect.id === activeId);
  const originalOverIndex = effects.findIndex((effect) => effect.id === overId);
  const overIndex = remaining.findIndex((effect) => effect.id === overId);
  const movingDownward = activeIndex >= 0 && originalOverIndex > activeIndex;
  const insertIndex = overIndex >= 0 ? overIndex + (movingDownward ? 1 : 0) : remaining.length;
  return [...remaining.slice(0, insertIndex), ...moving, ...remaining.slice(insertIndex)];
}

function instantiateEffectTree(template: EffectTemplate, scope?: string, dependencyOf?: string): EcsEffectDoc[] {
  const effect = instantiateEffectTemplate(template, scope);
  if (dependencyOf) effect.dependencyOf = dependencyOf;
  const dependencies = (template.dependencies ?? []).flatMap((dependency) =>
    instantiateEffectTree(dependency, `${scope ?? 'effect'}:${effect.id}`, effect.id),
  );
  return [effect, ...dependencies];
}

// --- component templates (defaults mirror the engine component classes) ---

const LAYOUT: ComponentTemplate = {
  component: 'layout',
  allowedEntities: ['viewport', 'videoArea', 'video', 'compositionArea', 'page'],
  allowedQuantity: 1,
  allowDisable: false,
  isDeletable: false,
  props: {
    layoutMode: str('overlay'),
    childrenAlignment: group({
      horizontalAlignment: str('center'),
      verticalAlignment: str('bottom'),
      horizontalSingleItemAlignment: str('start'),
      verticalSingleItemAlignment: str('start'),
    }),
    padding: insets(0),
    clipContent: bool(false),
    childrenSizing: str('constrained'),
    childWindow: group({
      windowMode: str('all'),
      windowCount: num(1),
      windowAxis: str('vertical'),
      windowAnchor: str('start'),
      windowSelection: str('anchor'),
    }),
  },
};

const SELF_LAYOUT: ComponentTemplate = {
  component: 'selfLayout',
  allowedEntities: ['viewport', 'videoArea', 'video', 'compositionArea', 'page', 'row', 'image', 'word', 'marker', 'background'],
  allowedQuantity: 1,
  allowDisable: true,
  isDeletable: true,
  props: {
    enabled: bool(true),
    aspectRatio: str('maintain'),
    customAspectRatio: str('16:9'),
    horizontalAlignment: str('center'),
    verticalAlignment: str('center'),
    horizontalSingleItemAlignment: str('start'),
    verticalSingleItemAlignment: str('start'),
  },
};

/**
 * A row's own optional self-alignment override: absent (the default) means
 * "inherit the page's shared alignment". Present overrides it for only that
 * row's words (see `layoutScene` in the engine). It is smaller than
 * `LAYOUT` because rows do not need a layout mode, while their Transform still
 * owns the row's resolved position and dimensions.
 */
const ROW_LAYOUT: ComponentTemplate = {
  component: 'layout',
  allowedEntities: ['row'],
  allowedQuantity: 1,
  allowDisable: true,
  isDeletable: true,
  props: {
    childrenAlignment: group({
      horizontalAlignment: str('center'),
      verticalAlignment: str('center'),
      horizontalSingleItemAlignment: str('start'),
      verticalSingleItemAlignment: str('start'),
    }),
    padding: insets(0),
    childrenSizing: str('constrained'),
    childWindow: group({
      windowMode: str('all'),
      windowCount: num(1),
      windowAxis: str('horizontal'),
      windowAnchor: str('start'),
      windowSelection: str('anchor'),
    }),
  },
};

const TRANSFORM: ComponentTemplate = {
  component: 'transform',
  allowedEntities: ['viewport', 'videoArea', 'video', 'compositionArea', 'page', 'row', 'image', 'word', 'marker', 'background'],
  allowedQuantity: 1,
  allowDisable: false,
  isDeletable: false,
  props: {
    positioning: str('flow'),
    position: vec(0, 0),
    positionXUnit: str('pt'),
    positionYUnit: str('pt'),
    dimensions: vec(0, 0),
    widthUnit: str('pt'),
    heightUnit: str('pt'),
    widthMode: str('custom'),
    heightMode: str('custom'),
    rotation: num(0),
    scale: vec(1, 1),
    pivot: str('center'),
    opacity: num(1),
  },
};

const PAINT_ORDER: ComponentTemplate = {
  component: 'paintOrder',
  allowedEntities: [...ALL_ENTITY_KINDS],
  allowedQuantity: 1,
  required: false,
  allowDisable: true,
  isDeletable: true,
  props: {
    enabled: bool(true),
    zIndex: num(0),
  },
};

const CHILD_PAINT_ORDER: ComponentTemplate = {
  component: 'childPaintOrder',
  allowedEntities: [...ALL_ENTITY_KINDS],
  allowedQuantity: 1,
  required: false,
  allowDisable: true,
  isDeletable: true,
  props: {
    enabled: bool(true),
    mode: str('source'),
    direction: str('descending'),
    backZIndex: num(0),
    frontZIndex: num(1),
    start: str('back'),
    values: arr([]),
    offset: num(0),
    seed: num(0),
  },
  propertyVisibility: {
    rules: [
      {
        fields: ['backZIndex', 'frontZIndex', 'start'],
        isVisible: (props) => stringValueFromProps(props, 'mode') === 'alternate',
      },
      {
        fields: ['values', 'offset'],
        isVisible: (props) => stringValueFromProps(props, 'mode') === 'custom',
      },
      {
        fields: ['seed'],
        isVisible: (props) => stringValueFromProps(props, 'mode') === 'random',
      },
    ],
  },
};

const PAINT_ORDER_COMPONENTS: ComponentTemplate[] = [PAINT_ORDER, CHILD_PAINT_ORDER];

const IMAGE: ComponentTemplate = {
  component: 'image',
  allowedEntities: [...ALL_ENTITY_KINDS],
  allowedQuantity: 1,
  allowDisable: true,
  isDeletable: true,
  props: {
    enabled: bool(true),
    assetSource: str('bundled'),
    asset: str(DEFAULT_BUNDLED_IMAGE_ASSET),
    customAsset: str(''),
    aspectRatio: str('maintain'),
    customAspectRatio: str('16:9'),
    renderOrder: str('belowChildren'),
    colorMode: str('tint'),
    color: col(DEFAULT_IMAGE_COLOR),
  },
};

const MARKER_IMAGE: ComponentTemplate = {
  ...IMAGE,
  allowedEntities: ['marker'],
  allowDisable: false,
  isDeletable: false,
};

const IMAGE_SEQUENCER: ComponentTemplate = {
  component: 'imageSequencer',
  allowedEntities: [...ALL_ENTITY_KINDS],
  allowedQuantity: 1,
  allowDisable: true,
  isDeletable: true,
  attachedTo: 'image',
  dependencies: [{ component: 'image' }],
  props: {
    enabled: bool(true),
    frames: arr([]),
    playbackMode: str('continuous'),
    frameRate: num(12),
    loop: bool(true),
    trigger: arr([{ trigger: 'currentWordStart', advance: 'next' }]),
    endBehavior: str('hold'),
  },
};

const IMAGE_COMPONENTS: ComponentTemplate[] = [IMAGE, IMAGE_SEQUENCER];

const MARKER_BEHAVIOUR: ComponentTemplate = {
  component: 'markerBehavior',
  allowedEntities: ['marker'],
  allowedQuantity: 1,
  allowDisable: false,
  required: false,
  dependencies: [
    {
      component: 'animation',
      preset: 'hopUp',
      name: 'Animation',
      allowDisable: true,
      isDeletable: false,
    },
  ],
  props: {
    styleSource: str('own'),
    styleState: str('followTarget'),
    renderOrder: str('inFront'),
  },
};

const BORDER_RADIUS: ComponentTemplate = {
  component: 'borderRadius',
  allowedEntities: ['viewport', 'videoArea', 'video', 'compositionArea', 'page', 'row', 'word', 'background'],
  allowedQuantity: 1,
  allowDisable: true,
  isDeletable: true,
  props: {
    enabled: bool(true),
    borderRadiusMode: str('uniform'),
    borderRadius: num(16),
    borderTopLeftRadius: num(16),
    borderTopRightRadius: num(16),
    borderBottomRightRadius: num(16),
    borderBottomLeftRadius: num(16),
  },
};

const BACKGROUND_STYLE: ComponentTemplate = {
  component: 'backgroundStyle',
  allowedEntities: ['viewport', 'videoArea', 'video', 'compositionArea', 'page', 'row', 'word', 'background'],
  allowedQuantity: 1,
  allowDisable: true,
  isDeletable: true,
  props: {
    enabled: bool(true),
    fill: col('#e5e7eb'),
    effectsInheritBaseAlpha: bool(true),
    fillPattern: fillPattern('single', [], 0),
    pathShape: str('rounded'),
    tailSide: str('auto'),
    tailSize: num(1),
    borderRadiusMode: str('uniform'),
    borderRadius: num(0),
    borderTopLeftRadius: num(0),
    borderTopRightRadius: num(0),
    borderBottomRightRadius: num(0),
    borderBottomLeftRadius: num(0),
    boundsMode: str('fillSelf'),
    overflowMode: str('visible'),
    coverageMode: str('all'),
    bandPadding: insets(0),
    blockPadding: insets(0),
    offset: vec(0, 0),
    scale: vec(1, 1),
  },
  propertyVisibility: {
    rules: [
      {
        fields: ['coverageMode'],
        isVisible: (props, entity) => {
          const boundsMode = stringValueFromProps(props, 'boundsMode');
          return entity.children.length > 0 && (boundsMode === 'tight' || boundsMode === 'full');
        },
      },
      {
        fields: ['tailSide', 'tailSize'],
        isVisible: (props) => stringValueFromProps(props, 'pathShape') === 'iMessage',
      },
      {
        fields: [
          'borderRadiusMode',
          'borderRadius',
          'borderTopLeftRadius',
          'borderTopRightRadius',
          'borderBottomRightRadius',
          'borderBottomLeftRadius',
        ],
        isVisible: (props) => {
          const shape = stringValueFromProps(props, 'pathShape');
          return shape === undefined || shape === 'rounded' || shape === 'pill';
        },
      },
    ],
  },
};

const BACKGROUND_ENTITY_STYLE: ComponentTemplate = {
  ...BACKGROUND_STYLE,
  isDeletable: false,
};

const FONT: ComponentTemplate = {
  component: 'font',
  allowedEntities: ['word'],
  allowedQuantity: 1,
  allowDisable: false,
  isDeletable: false,
  props: {
    family: fam([]),
    size: num(60),
    weight: fontWeight(400),
    style: str('normal'),
    emojis: group({
      family: fam([]),
      sizeScale: num(DEFAULT_FONT_EMOJI_SETTINGS.sizeScale),
      alignmentMode: str(DEFAULT_FONT_EMOJI_SETTINGS.alignmentMode),
      baselineOffset: num(DEFAULT_FONT_EMOJI_SETTINGS.baselineOffset),
    }),
  },
};

const UNDERLINE: ComponentTemplate = {
  component: 'underline',
  allowedEntities: ['word'],
  allowedQuantity: 8,
  allowDisable: true,
  isDeletable: true,
  props: {
    enabled: bool(true),
    width: num(0),
    protrusion: num(0),
    offset: vec(0, 0),
    color: col('rgba(0,0,0,0)'),
    capType: str('round'),
    renderOrder: str('behind'),
  },
};

const STRIKETHROUGH: ComponentTemplate = {
  component: 'strikethrough',
  allowedEntities: ['word'],
  allowedQuantity: 8,
  allowDisable: true,
  isDeletable: true,
  props: {
    enabled: bool(true),
    width: num(0),
    protrusion: num(0),
    offset: vec(0, 0),
    color: col('rgba(0,0,0,0)'),
    capType: str('round'),
    renderOrder: str('inFront'),
  },
};

const TEXT: ComponentTemplate = {
  component: 'text',
  allowedEntities: ['word'],
  allowedQuantity: 1,
  allowDisable: false,
  isDeletable: false,
  props: {
    color: col('white'),
    effectsInheritBaseAlpha: bool(true),
    caseTransform: str('none'),
    letterSpacing: num(0),
  },
  components: [UNDERLINE, STRIKETHROUGH],
  dependencies: [{ component: 'font' }],
};

/**
 * A layout-only gap component (paints nothing). `VerticalSpacer` on a Page or
 * Viewport sets the gap between vertical flow children. `HorizontalSpacer` on
 * a Row adds extra gap between words. On a Page or Viewport it adds a gap
 * between horizontal flow children. `spacing` is in `pt`
 * (composition units) or `%` of the parent's content box along the spacer axis.
 */
const VERTICAL_SPACER: ComponentTemplate = {
  component: 'verticalSpacer',
  allowedEntities: ['page', 'viewport'],
  allowedQuantity: 1,
  allowDisable: true,
  isDeletable: true,
  props: {
    enabled: bool(true),
    spacing: num(8),
    unit: str('pt'),
  },
};

const LAYOUT_MOTION: ComponentTemplate = {
  component: 'layoutMotion',
  allowedEntities: ['page', 'row'],
  allowedQuantity: 1,
  allowDisable: true,
  isDeletable: true,
  props: {
    enabled: bool(true),
    motionScope: str('group'),
    flowDirection: str('bottomToTop'),
    focusPosition: str('center'),
    motionType: str('spring'),
    timingMode: str('fixed'),
    stiffness: num(220),
    damping: num(28),
    mass: num(1),
    springFalloffFactor: num(1),
    durationSeconds: num(0.25),
    easing: str('easeInOut'),
    staggerTimingMode: str('adaptive'),
    staggerDelaySeconds: num(0.025),
    staggerFalloffFactor: num(1),
    stateMotion: group({
      past: group({ distanceScale: num(1), speedScale: num(1) }),
      previous: group({ distanceScale: num(1), speedScale: num(1) }),
      current: group({ distanceScale: num(1), speedScale: num(1) }),
      next: group({ distanceScale: num(1), speedScale: num(1) }),
      future: group({ distanceScale: num(1), speedScale: num(1) }),
    }),
  },
  propertyVisibility: {
    hidden: ['mode', 'targetMode', 'anchor'],
    rules: [
      {
        fields: ['timingMode', 'durationSeconds', 'easing'],
        isVisible: (props) => stringValueFromProps(props, 'motionType') === 'eased',
      },
      {
        fields: ['stiffness', 'damping', 'mass'],
        isVisible: (props) => stringValueFromProps(props, 'motionType') !== 'eased',
      },
      {
        fields: ['springFalloffFactor'],
        isVisible: (props) =>
          stringValueFromProps(props, 'motionType') !== 'eased' && stringValueFromProps(props, 'motionScope') === 'perChild',
      },
      {
        fields: ['staggerTimingMode', 'staggerDelaySeconds', 'staggerFalloffFactor'],
        isVisible: (props) => stringValueFromProps(props, 'motionScope') === 'perChild',
      },
    ],
  },
};

export const LAYOUT_MOTION_ROW_FLOW_DIRECTIONS = ['rightToLeft', 'leftToRight'] as const;
export const LAYOUT_MOTION_PAGE_FLOW_DIRECTIONS = ['bottomToTop', 'topToBottom'] as const;
export const LAYOUT_MOTION_SCOPES = ['group', 'perChild'] as const;
export const LAYOUT_MOTION_TYPES = ['spring', 'eased'] as const;
export type LayoutMotionScope = (typeof LAYOUT_MOTION_SCOPES)[number];
export type LayoutMotionType = (typeof LAYOUT_MOTION_TYPES)[number];

function layoutMotionScopeFromNode(node: PropertyNode | undefined): LayoutMotionScope {
  return node?.kind === 'leaf' && node.value === 'perChild' ? 'perChild' : 'group';
}

function layoutMotionTypeFromNodes(
  scopeNode: PropertyNode | undefined,
  typeNode: PropertyNode | undefined,
): LayoutMotionType {
  if (typeNode?.kind === 'leaf' && (typeNode.value === 'spring' || typeNode.value === 'eased')) {
    return typeNode.value;
  }
  return 'spring';
}

/** Adapt a copied or newly-created Layout Motion component to its entity scope. */
export function normalizeLayoutMotionComponentForEntity(
  component: EcsComponentDoc,
  entityKind: string,
): EcsComponentDoc {
  if (component.component !== 'layoutMotion') return component;
  const mode = layoutMotionModeForEntity(entityKind);
  const motionScopeNode = component.props.motionScope;
  const motionTypeNode = component.props.motionType;
  const focusPositionNode = component.props.focusPosition;
  const motionScope = layoutMotionScopeFromNode(motionScopeNode);
  const motionType = layoutMotionTypeFromNodes(motionScopeNode, motionTypeNode);
  const normalizedProps = { ...component.props };
  delete normalizedProps.mode;
  delete normalizedProps.targetMode;
  delete normalizedProps.anchor;
  return {
    ...component,
    props: {
      ...normalizedProps,
      motionScope:
        motionScopeNode?.kind === 'leaf'
          ? { ...motionScopeNode, type: 'string', value: motionScope }
          : str(motionScope),
      motionType:
        motionTypeNode?.kind === 'leaf'
          ? { ...motionTypeNode, type: 'string', value: motionType }
          : str(motionType),
      flowDirection:
        component.props.flowDirection?.kind === 'leaf'
          ? {
              ...component.props.flowDirection,
              type: 'string',
              value: normalizeLayoutMotionFlowDirection(component.props.flowDirection.value, mode),
            }
          : str(mode === 'currentWord' ? LAYOUT_MOTION_ROW_FLOW_DIRECTIONS[0] : LAYOUT_MOTION_PAGE_FLOW_DIRECTIONS[0]),
      focusPosition:
        focusPositionNode?.kind === 'leaf'
          ? { ...focusPositionNode, type: 'string', value: normalizeLayoutMotionFocusPosition(focusPositionNode.value, mode) }
          : str('center'),
    },
  };
}

/** Set the default timeline target when a Follow Target component is added to a caption entity. */
export function normalizeFollowTargetComponentForEntity(
  component: EcsComponentDoc,
  entityKind: string,
): EcsComponentDoc {
  if (component.component !== 'followTarget') return component;
  const target = entityKind === 'word' ? 'currentWord' : entityKind === 'row' ? 'currentRow' : undefined;
  if (!target) return component;
  const targetNode = component.props.target;
  return {
    ...component,
    props: {
      ...component.props,
      target: targetNode?.kind === 'leaf' ? { ...targetNode, type: 'string', value: target } : str(target),
    },
  };
}

const HORIZONTAL_SPACER: ComponentTemplate = {
  component: 'horizontalSpacer',
  allowedEntities: ['row', 'page', 'viewport'],
  allowedQuantity: 1,
  allowDisable: true,
  isDeletable: true,
  props: {
    enabled: bool(true),
    spacing: num(8),
    unit: str('pt'),
  },
};

/**
 * CompositionArea has no natural enter/exit boundary of its own (unlike a
 * Word/Row/Page, it is present for every render call) since it is rebuilt fresh
 * per spoken word. Turning this on gives it one: it enters only on the
 * video's very first rendered frame and exits only on its very last, instead
 * of an `enter`-phase animation replaying on every spoken word. See
 * `hasOwnLifecycle` in the engine's `animation/evaluator.ts`.
 */
const LIFECYCLE: ComponentTemplate = {
  component: 'lifecycle',
  allowedEntities: ['videoArea', 'compositionArea'],
  allowedQuantity: 1,
  allowDisable: true,
  isDeletable: true,
  props: {
    persistAcrossVideo: bool(false),
  },
};

/**
 * First-class animation component: any entity can own several. It carries no
 * leaf `props` - its data lives in a dedicated `animation` payload (tracks +
 * keyframes) that the studio threads verbatim (see `ecs-tree.ts`).
 */
const ANIMATION: ComponentTemplate = {
  component: 'animation',
  allowedEntities: ['viewport', 'videoArea', 'video', 'compositionArea', 'page', 'row', 'image', 'word', 'marker', 'background'],
  allowedQuantity: 8,
  allowDisable: true,
  isDeletable: true,
  props: {},
};

const MARKER_ANIMATION: ComponentTemplate = {
  ...ANIMATION,
  allowedEntities: ['marker'],
  isDeletable: false,
  required: false,
};

const FOLLOW_TARGET: ComponentTemplate = {
  component: 'followTarget',
  allowedEntities: [...ALL_ENTITY_KINDS],
  allowedQuantity: 1,
  allowDisable: true,
  isDeletable: true,
  props: {
    enabled: bool(true),
    mode: str('auto'),
    delaySeconds: num(0),
    target: str('entity'),
    targetId: str(''),
    targetScope: str('local'),
    boundaryHandoff: str('snap'),
    transitionScope: str('all'),
    anchor: str('center'),
    mappings: arr([]),
  },
};

const MARKER_FOLLOW_TARGET: ComponentTemplate = {
  ...FOLLOW_TARGET,
  allowedEntities: ['marker'],
  allowDisable: false,
  isDeletable: false,
  required: true,
};

// --- per-state model -------------------------------------------------------

/** Editor tab order/labels for the base style and five relative states (both rows & words). */
export const ENTITY_STATES = [
  { key: 'default', label: 'Default', suffix: 'default' },
  { key: 'past', label: 'Past', suffix: 'past' },
  { key: 'previous', label: 'Previous', suffix: 'previous' },
  { key: 'current', label: 'Current', suffix: 'current' },
  { key: 'next', label: 'Next', suffix: 'next' },
  { key: 'future', label: 'Future', suffix: 'future' },
] as const;

export type EntityStateKey = (typeof ENTITY_STATES)[number]['key'];

const STATE_ENTITY_KINDS = new Set(['row', 'word']);
const STATE_SUFFIXES = new Set<string>(ENTITY_STATES.map((s) => s.suffix));

/** True for a row or word state entity ID. Other entities can also use a `:default` ID. */
export function isStateGroupId(id: string): boolean {
  const colon = id.indexOf(':');
  return (
    colon >= 0 &&
    STATE_ENTITY_KINDS.has(id.slice(0, colon)) &&
    STATE_SUFFIXES.has(id.slice(colon + 1))
  );
}

/** True for a per-state override entity (past/previous/current/next/future), not the base. */
export function isStateOverrideEntity(entity: EcsEntityDoc): boolean {
  const colon = entity.id.indexOf(':');
  return colon >= 0 && entity.id.slice(colon + 1) !== 'default' && STATE_SUFFIXES.has(entity.id.slice(colon + 1));
}

export type StateStyleSelection = EntityStateKey | 'custom';

function stateKeyForId(id: string): EntityStateKey | undefined {
  const suffix = id.slice(id.indexOf(':') + 1);
  return ENTITY_STATES.find((state) => state.suffix === suffix)?.key;
}

function findEntityInTree(root: EcsEntityDoc, id: string): EcsEntityDoc | undefined {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findEntityInTree(child, id);
    if (found) return found;
  }
  return undefined;
}

function findParentEntity(root: EcsEntityDoc, id: string): EcsEntityDoc | undefined {
  if (root.children.some((child) => child.id === id)) return root;
  for (const child of root.children) {
    const parent = findParentEntity(child, id);
    if (parent) return parent;
  }
  return undefined;
}

/** Find the parent that contains a state family, including an absent state tab. */
export function stateFamilyParentFor(root: EcsEntityDoc, stateEntityId: string): EcsEntityDoc | undefined {
  const directParent = findParentEntity(root, stateEntityId);
  if (directParent) return directParent;
  const separator = stateEntityId.indexOf(':');
  if (separator < 0) return undefined;
  const defaultEntity = findEntityInTree(root, `${stateEntityId.slice(0, separator)}:default`);
  return defaultEntity ? findParentEntity(root, defaultEntity.id) : undefined;
}

export function stateStyleSourceForEntity(entity: EcsEntityDoc): StateStyleSelection {
  return isStateOverrideEntity(entity) && isStateStyleSource(entity.styleSource) ? entity.styleSource : 'custom';
}

export function isInheritedStateEntity(entity: EcsEntityDoc): boolean {
  return isStateOverrideEntity(entity) && isStateStyleSource(entity.styleSource);
}

function stateEntityInFamily(parent: EcsEntityDoc, entityKind: string, suffix: EntityStateKey): EcsEntityDoc | undefined {
  return parent.children.find((child) => child.id === `${entityKind}:${suffix}`);
}

/** Resolve a state entity's complete style through its sibling source chain. */
export function resolveStateStyleEntity(parent: EcsEntityDoc, entity: EcsEntityDoc): EcsEntityDoc {
  const entityKind = entity.entity;
  const defaultEntity = stateEntityInFamily(parent, entityKind, 'default');
  if (!defaultEntity) return entity;
  let current = entity;
  const visited = new Set<string>();
  while (isInheritedStateEntity(current)) {
    if (visited.has(current.id)) return defaultEntity;
    visited.add(current.id);
    const source = stateEntityInFamily(parent, entityKind, current.styleSource as EntityStateKey);
    if (!source) return defaultEntity;
    current = source;
  }
  return current;
}

function stateStyleChainReaches(
  parent: EcsEntityDoc,
  entityKind: string,
  source: EntityStateKey,
  targetId: string,
): boolean {
  let currentId = `${entityKind}:${source}`;
  const visited = new Set<string>();
  while (currentId !== `${entityKind}:default`) {
    if (currentId === targetId || visited.has(currentId)) return true;
    visited.add(currentId);
    const current = parent.children.find((child) => child.id === currentId);
    if (!current || !isInheritedStateEntity(current)) return false;
    currentId = `${entityKind}:${current.styleSource as EntityStateKey}`;
  }
  return false;
}

/** List state styles that cannot create a self-reference or a source cycle. */
export function stateStyleOptionsForEntity(
  root: EcsEntityDoc,
  selectedEntity: EcsEntityDoc,
): EntityStateKey[] {
  if (!isStateOverrideEntity(selectedEntity)) return [];
  const selectedKey = stateKeyForId(selectedEntity.id);
  const parent = stateFamilyParentFor(root, selectedEntity.id);
  if (!selectedKey || !parent) return [];
  return ENTITY_STATES.filter(
    (state) =>
      state.key !== selectedKey &&
      !stateStyleChainReaches(parent, selectedEntity.entity, state.key, selectedEntity.id),
  ).map((state) => state.key);
}

export function createStateStyleReference(
  base: EcsEntityDoc,
  id: string,
  styleSource: StateStyleSource,
): EcsEntityDoc {
  return {
    entity: base.entity,
    id,
    ...(base.forEntityId ? { forEntityId: base.forEntityId } : {}),
    styleSource,
    components: [],
    effects: [],
    children: [],
  };
}

/** Materialize an inherited state as a standalone editable style. */
export function materializeStateEntityStyle(parent: EcsEntityDoc, entity: EcsEntityDoc): EcsEntityDoc {
  if (!isInheritedStateEntity(entity)) return entity;
  return deriveStateFromStyleSource(resolveStateStyleEntity(parent, entity), entity.id);
}

function replaceEntityChildren(
  root: EcsEntityDoc,
  parentId: string,
  updateChildren: (children: EcsEntityDoc[]) => EcsEntityDoc[],
): EcsEntityDoc {
  if (root.id === parentId) return { ...root, children: updateChildren(root.children) };
  let changed = false;
  const children = root.children.map((child) => {
    const next = replaceEntityChildren(child, parentId, updateChildren);
    if (next !== child) changed = true;
    return next;
  });
  return changed ? { ...root, children } : root;
}

/** Set an inherited source and remove any stale custom style payload. */
export function setStateStyleSource(
  root: EcsEntityDoc,
  stateEntityId: string,
  styleSource: StateStyleSource,
): EcsEntityDoc {
  const selectedKey = stateKeyForId(stateEntityId);
  const parent = stateFamilyParentFor(root, stateEntityId);
  if (!selectedKey || selectedKey === 'default' || !parent) return root;
  const selectedEntity = parent.children.find((child) => child.id === stateEntityId);
  const base = stateEntityInFamily(parent, selectedEntity?.entity ?? stateEntityId.slice(0, stateEntityId.indexOf(':')), 'default');
  if (!base || !stateStyleOptionsForEntity(root, selectedEntity ?? createStateStyleReference(base, stateEntityId, 'default')).includes(styleSource)) {
    return root;
  }
  const next = createStateStyleReference(base, stateEntityId, styleSource);
  return replaceEntityChildren(root, parent.id, (children) => {
    const index = children.findIndex((child) => child.id === stateEntityId);
    if (index < 0) {
      const baseIndex = children.findIndex((child) => child.id === base.id);
      if (baseIndex < 0) return children;
      const inserted = [...children];
      inserted.splice(baseIndex + 1, 0, next);
      return inserted;
    }
    const updated = [...children];
    updated[index] = next;
    return updated;
  });
}

/** Materialize an absent or inherited state as an independent editable style. */
export function materializeStateStyle(root: EcsEntityDoc, stateEntityId: string): EcsEntityDoc {
  const parent = stateFamilyParentFor(root, stateEntityId);
  if (!parent) return root;
  const separator = stateEntityId.indexOf(':');
  if (separator < 0) return root;
  const entityKind = stateEntityId.slice(0, separator);
  const base = stateEntityInFamily(parent, entityKind, 'default');
  if (!base) return root;
  const existing = parent.children.find((child) => child.id === stateEntityId);
  if (existing && !isInheritedStateEntity(existing)) return root;
  const source = existing ? resolveStateStyleEntity(parent, existing) : base;
  const materialized = deriveStateFromStyleSource(source, stateEntityId);
  return replaceEntityChildren(root, parent.id, (children) => {
    const index = children.findIndex((child) => child.id === stateEntityId);
    if (index >= 0) {
      const updated = [...children];
      updated[index] = materialized;
      return updated;
    }
    const baseIndex = children.findIndex((child) => child.id === base.id);
    if (baseIndex < 0) return children;
    const inserted = [...children];
    inserted.splice(baseIndex + 1, 0, materialized);
    return inserted;
  });
}

// --- schema resolution -----------------------------------------------------

/** Instantiate a component template into a concrete component doc. */
export function instantiateComponentTemplate(template: ComponentTemplate, explicit = false): EcsComponentDoc {
  if (template.component === 'animation') {
    return {
      component: 'animation',
      studioId: explicit ? createStudioComponentId() : `template-${template.component}`,
      props: {},
      components: [],
      effects: [],
      explicit,
      animation: createAnimationFromPreset(ANIMATION_PRESETS[0]),
      allowedEntities: template.allowedEntities ? [...template.allowedEntities] : undefined,
      allowedQuantity: template.allowedQuantity,
      allowDisable: template.allowDisable ?? false,
      isDeletable: template.isDeletable ?? false,
    };
  }
  return {
    component: template.component,
    studioId: explicit ? createStudioComponentId() : `template-${template.component}`,
    props: structuredClone(template.props),
    components: (template.components ?? []).map((child) => instantiateComponentTemplate(child, explicit)),
    effects: [],
    explicit,
    allowedEntities: template.allowedEntities ? [...template.allowedEntities] : undefined,
    allowedQuantity: template.allowedQuantity,
    allowDisable: template.allowDisable ?? false,
    isDeletable: template.isDeletable ?? false,
  };
}

function lockDependencyComponent(
  component: EcsComponentDoc,
  dependency: Partial<ComponentDependencyTemplate> = {},
): EcsComponentDoc {
  const allowDisable = dependency.allowDisable ?? false;
  const enabled = component.props.enabled;
  const props =
    !allowDisable && enabled?.kind === 'leaf' && enabled.type === 'boolean'
      ? { ...component.props, enabled: { ...enabled, value: true } }
      : component.props;
  return {
    ...component,
    props,
    allowDisable,
    isDeletable: dependency.isDeletable ?? false,
  };
}

function cloneAnimationTracks(tracks: readonly AnimationTrackDoc[]): AnimationTrackDoc[] {
  return tracks.map((track) => ({
    ...track,
    keyframes: track.keyframes.map((keyframe) => ({ ...keyframe })),
  }));
}

function configureDependencyComponent(
  component: EcsComponentDoc,
  dependency: ComponentDependencyTemplate,
): EcsComponentDoc {
  const locked = lockDependencyComponent(component, dependency);
  if (locked.component !== 'animation' || !locked.animation) return locked;
  const name = dependency.name ?? locked.animation.name;
  if (!dependency.preset || dependency.preset === 'custom') {
    return {
      ...locked,
      animation: {
        ...locked.animation,
        enabled: true,
        name,
        phase: 'custom',
        preset: 'custom',
        parameters: {},
        tracks: dependency.tracks ? cloneAnimationTracks(dependency.tracks) : [],
      },
    };
  }
  const preset = findAnimationPreset(dependency.preset);
  if (!preset) return { ...locked, animation: { ...locked.animation, enabled: true, name } };
  return {
    ...locked,
    animation: {
      ...createAnimationFromPreset(preset),
      name,
    },
  };
}

function normalizeExistingDependency(
  component: EcsComponentDoc,
  owner: EcsComponentDoc,
  dependency: ComponentDependencyTemplate,
  ownerTemplate?: ComponentTemplate,
): EcsComponentDoc {
  const locked = lockDependencyComponent(
    {
      ...component,
      dependencyOf: owner.component,
      ...(ownerTemplate?.attachedTo ? {} : { attachedTo: owner.component }),
    },
    dependency,
  );
  if (locked.component !== 'animation' || !locked.animation) return locked;
  return {
    ...locked,
    animation: {
      ...locked.animation,
      enabled: dependency.allowDisable === true ? locked.animation.enabled : true,
      name: dependency.name ?? locked.animation.name,
    },
  };
}

function appendDependencies(
  output: EcsComponentDoc[],
  owner: EcsComponentDoc,
  ownerTemplate: ComponentTemplate,
  availableTemplates: readonly ComponentTemplate[],
  visiting: ReadonlySet<string>,
): void {
  for (const dependency of ownerTemplate.dependencies ?? []) {
    if (visiting.has(dependency.component)) {
      throw new Error(`Component dependency cycle includes "${dependency.component}"`);
    }
    const dependencyTemplate = availableTemplates.find((candidate) => candidate.component === dependency.component);
    if (!dependencyTemplate) {
      throw new Error(`Component "${owner.component}" requires an unavailable "${dependency.component}" component`);
    }
    const component = configureDependencyComponent(
      {
        ...instantiateComponentTemplate(dependencyTemplate, true),
        dependencyOf: owner.component,
        ...(ownerTemplate.attachedTo ? {} : { attachedTo: owner.component }),
      },
      dependency,
    );
    output.push(component);
    appendDependencies(
      output,
      component,
      dependencyTemplate,
      availableTemplates,
      new Set([...visiting, dependency.component]),
    );
  }
}

/** Instantiates a component and all of its explicit same-entity dependencies. */
export function instantiateComponentWithDependencies(
  template: ComponentTemplate,
  availableTemplates: readonly ComponentTemplate[],
): EcsComponentDoc[] {
  if (template.attachedTo) {
    const parentTemplate = availableTemplates.find((candidate) => candidate.component === template.attachedTo);
    if (!parentTemplate) {
      throw new Error(`Component "${template.component}" requires an unavailable "${template.attachedTo}" parent component`);
    }
    return orderComponentsWithDependencies([
      ...instantiateComponentWithDependencies(parentTemplate, availableTemplates),
      { ...instantiateComponentTemplate(template, true), attachedTo: template.attachedTo },
    ]);
  }
  const owner = instantiateComponentTemplate(template, true);
  const output = [owner];
  appendDependencies(output, owner, template, availableTemplates, new Set([template.component]));
  return orderComponentsWithDependencies(output);
}

/**
 * Adds dependency metadata to existing components and creates missing dependencies.
 * This keeps loaded presets consistent with newly added components.
 */
export function ensureComponentDependencies(
  components: EcsComponentDoc[],
  templates: readonly ComponentTemplate[],
): EcsComponentDoc[] {
  const output = components.map((component) => ({
    ...component,
    components: [...component.components],
  }));
  for (let ownerIndex = 0; ownerIndex < output.length; ownerIndex += 1) {
    const owner = output[ownerIndex];
    const ownerTemplate = templates.find((template) => template.component === owner.component);
    if (!ownerTemplate) continue;
    if (ownerTemplate.attachedTo) {
      owner.attachedTo = ownerTemplate.attachedTo;
      if (!output.some((candidate, index) => index !== ownerIndex && candidate.component === ownerTemplate.attachedTo)) {
        const parentTemplate = templates.find((template) => template.component === ownerTemplate.attachedTo);
        if (!parentTemplate) {
          throw new Error(`Component "${owner.component}" requires an unavailable "${ownerTemplate.attachedTo}" parent component`);
        }
        output.splice(ownerIndex, 0, instantiateComponentTemplate(parentTemplate, true));
        ownerIndex -= 1;
      }
      continue;
    }
    for (const dependency of ownerTemplate.dependencies ?? []) {
      let nestedDependency: EcsComponentDoc | undefined;
      owner.components = owner.components.filter((candidate) => {
        if (
          candidate.component !== dependency.component ||
          (candidate.dependencyOf !== undefined && candidate.dependencyOf !== owner.component)
        ) {
          return true;
        }
        if (!nestedDependency) nestedDependency = candidate;
        return false;
      });
      const existingIndex = output.findIndex(
        (candidate) =>
          candidate.component === dependency.component &&
          (candidate.dependencyOf === owner.component || candidate.dependencyOf === undefined),
      );
      if (existingIndex >= 0) {
        output[existingIndex] = normalizeExistingDependency(output[existingIndex], owner, dependency, ownerTemplate);
        continue;
      }
      const dependencyTemplate = templates.find((template) => template.component === dependency.component);
      if (!dependencyTemplate) {
        throw new Error(`Component "${owner.component}" requires an unavailable "${dependency.component}" component`);
      }
      if (nestedDependency) {
        output.splice(ownerIndex + 1, 0, normalizeExistingDependency(nestedDependency, owner, dependency, ownerTemplate));
        continue;
      }
      const dependencyComponent = configureDependencyComponent(
        { ...instantiateComponentTemplate(dependencyTemplate, true), dependencyOf: owner.component },
        dependency,
      );
      output.splice(ownerIndex + 1, 0, dependencyComponent);
    }
  }
  return orderComponentsWithDependencies(output);
}

/** Ensures dependencies for every entity in a studio design tree. */
export function ensureEntityComponentDependencies(entity: EcsEntityDoc): EcsEntityDoc {
  return {
    ...entity,
    components: normalizeBorderRadiusModes(ensureComponentDependencies(entity.components, schemaForEntity(entity))),
    children: entity.children.map(ensureEntityComponentDependencies),
  };
}

function leafNumber(node: PropertyNode | undefined, fallback = 0): number {
  return node?.kind === 'leaf' && typeof node.value === 'number' ? node.value : fallback;
}

function configuredBorderRadiusMode(component: EcsComponentDoc): 'uniform' | 'individual' | undefined {
  const mode = component.props.borderRadiusMode;
  if (mode?.kind !== 'leaf' || typeof mode.value !== 'string') return undefined;
  return mode.value === 'uniform' || mode.value === 'individual' ? mode.value : undefined;
}

function inferredBorderRadiusMode(component: EcsComponentDoc): 'uniform' | 'individual' {
  const configured = configuredBorderRadiusMode(component);
  if (configured) return configured;
  const base = leafNumber(component.props.borderRadius, 0);
  const corners = [
    leafNumber(component.props.borderTopLeftRadius, base),
    leafNumber(component.props.borderTopRightRadius, base),
    leafNumber(component.props.borderBottomRightRadius, base),
    leafNumber(component.props.borderBottomLeftRadius, base),
  ];
  return corners.every((corner) => corner === base) ? 'uniform' : 'individual';
}

function normalizeBorderRadiusModes(components: EcsComponentDoc[]): EcsComponentDoc[] {
  return components.map((component) => {
    const nested = normalizeBorderRadiusModes(component.components);
    if (component.component !== 'borderRadius' && component.component !== 'backgroundStyle') {
      return nested === component.components ? component : { ...component, components: nested };
    }
    const mode = inferredBorderRadiusMode(component);
    const nextProps = {
      ...component.props,
      borderRadiusMode: {
        kind: 'leaf' as const,
        type: 'string' as const,
        value: mode,
      },
    };
    return {
      ...component,
      props: nextProps,
      components: nested,
    };
  });
}

/** Removes a component and all dependencies owned by it. */
export function removeComponentWithDependencies(
  components: readonly EcsComponentDoc[],
  componentIndex: number,
): { components: EcsComponentDoc[]; removed: EcsComponentDoc[] } {
  const owner = components[componentIndex];
  if (!owner) return { components: [...components], removed: [] };
  const removed = new Set<EcsComponentDoc>([owner]);
  const removedTypes = new Set([owner.component]);
  const preserveImageDependency = owner.component === 'imageSequencer';
  let remaining = components
    .filter((_, index) => index !== componentIndex)
    .map((component) =>
      preserveImageDependency && component.component === 'image' && component.dependencyOf === owner.component
        ? { ...component, dependencyOf: undefined, allowDisable: true, isDeletable: true }
        : component,
    );
  let changed = true;
  while (changed) {
    changed = false;
    remaining = remaining.filter((component) => {
      const parent = component.dependencyOf ?? component.attachedTo;
      if (!parent || !removedTypes.has(parent)) return true;
      removed.add(component);
      removedTypes.add(component.component);
      changed = true;
      return false;
    });
  }
  return { components: remaining, removed: [...removed] };
}
/** Deletable addable slots in alphabetical order, including nested components. */
export function collectAddableComponentSlots(templates: ComponentTemplate[], parentPath: string[] = []): AddableComponentSlot[] {
  const out: AddableComponentSlot[] = [];
  for (const template of templates) {
    if (template.isDeletable) out.push({ template, parentPath });
    if (template.components && template.components.length > 0) {
      out.push(...collectAddableComponentSlots(template.components, [...parentPath, template.component]));
    }
  }
  return out.sort(
    (left, right) =>
      compareAlphabetically(left.template.component, right.template.component) ||
      compareAlphabetically(left.parentPath.join('.'), right.parentPath.join('.')),
  );
}

/** The canonical component list an entity of this kind/state can carry. */
export function schemaForEntity(entity: EcsEntityDoc): ComponentTemplate[] {
  switch (entity.entity) {
    case 'viewport':
      return [
        TRANSFORM,
        ...PAINT_ORDER_COMPONENTS,
        ...IMAGE_COMPONENTS,
        LAYOUT,
        SELF_LAYOUT,
        BACKGROUND_STYLE,
        BORDER_RADIUS,
        VERTICAL_SPACER,
        HORIZONTAL_SPACER,
        ANIMATION,
      ];
    case 'videoArea':
      return [TRANSFORM, ...PAINT_ORDER_COMPONENTS, ...IMAGE_COMPONENTS, LAYOUT, SELF_LAYOUT, BACKGROUND_STYLE, BORDER_RADIUS, LIFECYCLE, ANIMATION];
    case 'video':
      return [TRANSFORM, ...PAINT_ORDER_COMPONENTS, ...IMAGE_COMPONENTS, LAYOUT, SELF_LAYOUT, BACKGROUND_STYLE, BORDER_RADIUS, ANIMATION];
    case 'compositionArea':
      return [TRANSFORM, ...PAINT_ORDER_COMPONENTS, ...IMAGE_COMPONENTS, LAYOUT, SELF_LAYOUT, BACKGROUND_STYLE, BORDER_RADIUS, LIFECYCLE, ANIMATION];
    case 'page':
      return [TRANSFORM, ...PAINT_ORDER_COMPONENTS, ...IMAGE_COMPONENTS, LAYOUT, SELF_LAYOUT, BACKGROUND_STYLE, BORDER_RADIUS, VERTICAL_SPACER, HORIZONTAL_SPACER, LAYOUT_MOTION, ANIMATION];
    case 'row':
      // Only the default row owns word spacing; the per-state rows carry only
      // their background (see word-instancer).
      return isStateOverrideEntity(entity)
        ? [
            TRANSFORM,
            ...PAINT_ORDER_COMPONENTS,
            ROW_LAYOUT,
            ...IMAGE_COMPONENTS,
            SELF_LAYOUT,
            BACKGROUND_STYLE,
            BORDER_RADIUS,
            LAYOUT_MOTION,
            ANIMATION,
          ]
        : [
            TRANSFORM,
            ...PAINT_ORDER_COMPONENTS,
            ROW_LAYOUT,
            ...IMAGE_COMPONENTS,
            SELF_LAYOUT,
            BACKGROUND_STYLE,
            BORDER_RADIUS,
            HORIZONTAL_SPACER,
            LAYOUT_MOTION,
            ANIMATION,
          ];
    case 'image':
      return [TRANSFORM, ...PAINT_ORDER_COMPONENTS, ...IMAGE_COMPONENTS, SELF_LAYOUT, ANIMATION];
    case 'word':
      return [TRANSFORM, ...PAINT_ORDER_COMPONENTS, ...IMAGE_COMPONENTS, SELF_LAYOUT, TEXT, FONT, ANIMATION, BACKGROUND_STYLE, BORDER_RADIUS];
    case 'marker':
      return [
        TRANSFORM,
        ...PAINT_ORDER_COMPONENTS,
        MARKER_IMAGE,
        IMAGE_SEQUENCER,
        MARKER_BEHAVIOUR,
        MARKER_FOLLOW_TARGET,
        MARKER_ANIMATION,
      ];
    case 'background':
      return [TRANSFORM, ...PAINT_ORDER_COMPONENTS, FOLLOW_TARGET, BACKGROUND_ENTITY_STYLE, BORDER_RADIUS, ANIMATION];
    default:
      return [];
  }
}

export function createMarkerEntity(id: string, overrides: Partial<EcsMarkerEntityConfig> = {}): EcsEntityDoc {
  const behavior: EcsMarkerEntityConfig = {
    followTarget: 'parent',
    anchor: 'topCenter',
    offset: { x: 0, y: 0 },
    styleSource: 'own',
    styleState: 'followTarget',
    renderOrder: 'inFront',
    ...overrides,
  };
  const transform = instantiateComponentTemplate(TRANSFORM, true);
  transform.props = {
    ...transform.props,
    positioning: str('absolute'),
    dimensions: vec(32, 32),
  };
  const image = instantiateComponentTemplate(MARKER_IMAGE, true);
  const followTarget = instantiateComponentTemplate(MARKER_FOLLOW_TARGET, true);
  followTarget.props = {
    ...followTarget.props,
    target: str(behavior.followTarget),
    anchor: str(behavior.anchor),
    mappings: arr([
      { destination: 'Transform.position.x', source: 'bounds.x', offset: behavior.offset.x },
      { destination: 'Transform.position.y', source: 'bounds.y', offset: behavior.offset.y },
    ]),
  };
  const markerComponents = instantiateComponentWithDependencies(MARKER_BEHAVIOUR, [MARKER_BEHAVIOUR, MARKER_ANIMATION]);
  const markerBehavior = markerComponents[0];
  markerBehavior.props = {
    ...markerBehavior.props,
    styleSource: { kind: 'leaf', type: 'string', value: behavior.styleSource },
    styleState: { kind: 'leaf', type: 'string', value: behavior.styleState },
    renderOrder: { kind: 'leaf', type: 'string', value: behavior.renderOrder },
  };
  return {
    entity: 'marker',
    id,
    components: [transform, image, followTarget, ...markerComponents],
    effects: [],
    children: [],
  };
}

export function createBackgroundEntity(
  id: string,
  forEntityId?: string,
  targetKind: FollowTargetKind = 'entity',
): EcsEntityDoc {
  const transform = instantiateComponentTemplate(TRANSFORM, true);
  transform.props = {
    ...transform.props,
    positioning: str('absolute'),
    dimensions: vec(100, 100),
  };
  const backgroundStyle = instantiateComponentTemplate(BACKGROUND_ENTITY_STYLE, true);
  const followTarget = instantiateComponentTemplate(FOLLOW_TARGET, true);
  followTarget.props = {
    ...followTarget.props,
    target: str(targetKind),
    targetId: str(targetKind === 'entity' ? (forEntityId ?? '') : ''),
    anchor: str('topLeft'),
    mappings: arr(forEntityId ? FOLLOW_TARGET_BOUNDS_MAPPINGS.map((mapping) => ({ ...mapping })) : []),
  };
  return {
    entity: 'background',
    id,
    ...(forEntityId ? { forEntityId } : {}),
    components: [transform, followTarget, backgroundStyle],
    effects: [],
    children: [],
  };
}

export function createImageEntity(id: string): EcsEntityDoc {
  const transform = instantiateComponentTemplate(TRANSFORM, true);
  transform.props = {
    ...transform.props,
    positioning: str('flow'),
    dimensions: vec(120, 0),
    widthMode: str('custom'),
    heightMode: str('fitContent'),
  };
  const image = instantiateComponentTemplate(IMAGE, true);
  image.props = {
    ...image.props,
    asset: str('dialog-speaker'),
    colorMode: str('original'),
  };
  const selfLayout = instantiateComponentTemplate(SELF_LAYOUT, true);
  return {
    entity: 'image',
    id,
    components: [transform, image, selfLayout],
    effects: [],
    children: [],
  };
}

/** One `Component.prop` (or `Effect.prop`) an Animation track can target. */
export interface AnimatableTargetOption {
  target: string;
  kind: 'number' | 'vector2' | 'paint';
  defaultValue: unknown;
  ownerLabel?: string;
  groupLabel?: string;
}

/**
 * The component list each entity kind can carry, for target enumeration only
 * (ignores row/word state-override nuance - a target that does not resolve on
 * a given instance is skipped by the runtime evaluator, so listing a
 * superset here is harmless).
 */
const ANIMATABLE_COMPONENT_TEMPLATES: Record<string, ComponentTemplate[]> = {
  viewport: [
    TRANSFORM,
    ...PAINT_ORDER_COMPONENTS,
    ...IMAGE_COMPONENTS,
    LAYOUT,
    SELF_LAYOUT,
    BACKGROUND_STYLE,
    BORDER_RADIUS,
    VERTICAL_SPACER,
    HORIZONTAL_SPACER,
  ],
  videoArea: [TRANSFORM, ...PAINT_ORDER_COMPONENTS, ...IMAGE_COMPONENTS, LAYOUT, SELF_LAYOUT, BACKGROUND_STYLE, BORDER_RADIUS, LIFECYCLE],
  video: [TRANSFORM, ...PAINT_ORDER_COMPONENTS, ...IMAGE_COMPONENTS, LAYOUT, SELF_LAYOUT, BACKGROUND_STYLE, BORDER_RADIUS],
  compositionArea: [TRANSFORM, ...PAINT_ORDER_COMPONENTS, ...IMAGE_COMPONENTS, LAYOUT, SELF_LAYOUT, BACKGROUND_STYLE, BORDER_RADIUS],
  page: [
    TRANSFORM,
    ...PAINT_ORDER_COMPONENTS,
    ...IMAGE_COMPONENTS,
    LAYOUT,
    SELF_LAYOUT,
    BACKGROUND_STYLE,
    BORDER_RADIUS,
    VERTICAL_SPACER,
    HORIZONTAL_SPACER,
    LAYOUT_MOTION,
  ],
  row: [
    TRANSFORM,
    ...PAINT_ORDER_COMPONENTS,
    ROW_LAYOUT,
    ...IMAGE_COMPONENTS,
    SELF_LAYOUT,
    BACKGROUND_STYLE,
    BORDER_RADIUS,
    HORIZONTAL_SPACER,
    LAYOUT_MOTION,
  ],
  word: [TRANSFORM, ...PAINT_ORDER_COMPONENTS, ...IMAGE_COMPONENTS, SELF_LAYOUT, TEXT, FONT, BACKGROUND_STYLE, BORDER_RADIUS],
  marker: [TRANSFORM, ...PAINT_ORDER_COMPONENTS, MARKER_IMAGE, IMAGE_SEQUENCER, MARKER_BEHAVIOUR, FOLLOW_TARGET],
  background: [TRANSFORM, ...PAINT_ORDER_COMPONENTS, FOLLOW_TARGET, BACKGROUND_STYLE, BORDER_RADIUS],
};

function capitalize(value: string): string {
  return value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value;
}

function isBlendableLeaf(node: PropertyNode | undefined): node is LeafDefinition {
  return !!node && node.kind === 'leaf' && (node.type === 'number' || node.type === 'vector2' || node.type === 'paint');
}

function stringValueFromProps(props: Record<string, PropertyNode>, key: string): string | undefined {
  const node = props[key];
  return node?.kind === 'leaf' && node.type === 'string' && typeof node.value === 'string' ? node.value : undefined;
}

function filterAnimationProps(
  props: Record<string, PropertyNode>,
  visibility: PropertyVisibilityMetadata | undefined,
  entity: EcsEntityDoc,
  path: readonly string[] = [],
  respectOwnEnabled = false,
): Record<string, PropertyNode> {
  const enabled = props.enabled;
  if (respectOwnEnabled && enabled?.kind === 'leaf' && enabled.type === 'boolean' && enabled.value === false) return {};

  const hiddenKeys = new Set(visibility?.hidden ?? []);
  for (const rule of visibility?.rules ?? []) {
    if ((rule.path ?? []).length === path.length && (rule.path ?? []).every((part, index) => part === path[index]) && !rule.isVisible(props, entity)) {
      for (const field of rule.fields) hiddenKeys.add(field);
    }
  }

  const visible: Record<string, PropertyNode> = {};
  for (const [key, node] of Object.entries(props)) {
    if (hiddenKeys.has(key)) continue;
    if (node.kind !== 'container') {
      visible[key] = node;
      continue;
    }
    const nestedEnabled = node.children.enabled;
    if (nestedEnabled?.kind === 'leaf' && nestedEnabled.type === 'boolean' && nestedEnabled.value === false) continue;
    visible[key] = { ...node, children: filterAnimationProps(node.children, visibility, entity, [...path, key], true) };
  }
  return visible;
}

function componentTemplateFor(entity: EcsEntityDoc, componentType: string): ComponentTemplate | undefined {
  const visit = (templates: readonly ComponentTemplate[]): ComponentTemplate | undefined => {
    for (const template of templates) {
     if (template.component === componentType) return template;
     const nested = visit(template.components ?? []);
     if (nested) return nested;
    }
    return undefined;
  };
  return visit(ANIMATABLE_COMPONENT_TEMPLATES[entity.entity] ?? []);
}

function animationPropsForComponent(component: EcsComponentDoc, entity: EcsEntityDoc): Record<string, PropertyNode> {
  return filterAnimationProps(component.props, componentTemplateFor(entity, component.component)?.propertyVisibility, entity);
}

export function hiddenPropertyKeysForComponent(component: EcsComponentDoc, entity: EcsEntityDoc): ReadonlySet<string> {
  const template = componentTemplateFor(entity, component.component);
  const hidden = new Set(template?.propertyVisibility?.hidden ?? []);
  for (const rule of template?.propertyVisibility?.rules ?? []) {
    if ((rule.path ?? []).length === 0 && !rule.isVisible(component.props, entity)) {
     for (const field of rule.fields) hidden.add(field);
    }
  }
  return hidden;
}

export function hiddenPropertyKeysForEffect(
  effect: EcsEffectDoc,
  entity: EcsEntityDoc,
  props: Record<string, PropertyNode> = effect.props,
): ReadonlySet<string> {
  const template = EFFECT_TEMPLATES.find((candidate) => candidate.effect === effect.effect);
  const hidden = new Set(template?.propertyVisibility?.hidden ?? []);
  for (const rule of template?.propertyVisibility?.rules ?? []) {
    if ((rule.path ?? []).length === 0 && !rule.isVisible(props, entity)) {
      for (const field of rule.fields) hidden.add(field);
    }
  }
  return hidden;
}

function targetsFromProps(
  ownerName: string,
  props: Record<string, PropertyNode>,
  ownerLabel = ownerName,
  targetFormatter: (property: string) => string = (property) => `${capitalize(ownerName)}.${property}`,
  propertyPrefix = '',
  groupLabel?: string,
): AnimatableTargetOption[] {
  const out: AnimatableTargetOption[] = [];
  for (const [key, node] of Object.entries(props)) {
    const propertyPath = propertyPrefix ? `${propertyPrefix}.${key}` : key;
    if (node.kind === 'container') {
      out.push(...targetsFromProps(ownerName, node.children, ownerLabel, targetFormatter, propertyPath, groupLabel));
      continue;
    }
    if (!isBlendableLeaf(node)) continue;
    out.push({
      target: targetFormatter(propertyPath),
      kind: node.type as 'number' | 'vector2' | 'paint',
      defaultValue: node.value,
      ownerLabel,
      groupLabel,
    });
  }
  return out;
}

function collectComponents(components: EcsComponentDoc[], output: EcsComponentDoc[]): void {
  for (const component of components) {
    output.push(component);
    collectComponents(component.components, output);
  }
}

function effectOwnerLabel(effect: EcsEffectDoc, siblings: readonly EcsEffectDoc[]): string {
  const sameType = siblings.filter((candidate) => candidate.effect === effect.effect);
  if (sameType.length <= 1) return effect.effect;
  return `${effect.effect} #${sameType.indexOf(effect) + 1}`;
}

function targetsFromEffects(
  effects: readonly EcsEffectDoc[],
  out: AnimatableTargetOption[],
  ownerScope: string,
  visibleOnly = false,
  entity?: EcsEntityDoc,
): void {
  for (const effect of effects) {
    const template = EFFECT_TEMPLATES.find((candidate) => candidate.effect === effect.effect);
    let props = { ...(template?.props ?? {}), ...effect.props };
    if (visibleOnly && entity) props = filterAnimationProps(props, template?.propertyVisibility, entity);
    const isReplicator = effect.effect === 'replicator';
    const targetProps = isReplicator
      ? Object.fromEntries(
          Object.entries(props).filter(
            ([key]) =>
              ![
                'fillMode',
                'fillTarget',
                'fillSeed',
                'customFills',
                'copyIds',
                'copyOverrides',
                'position',
                'rotation',
                'scale',
                'opacity',
              ].includes(key),
          ),
        )
      : props;
    const ownerName = `${capitalize(effect.effect)}#${effect.id}`;
    const ownerLabel = `${ownerScope} / ${effectOwnerLabel(effect, effects)}`;
    out.push(
      ...targetsFromProps(
        ownerName,
        targetProps,
        ownerLabel,
        (property) => qualifiedEffectTarget(capitalize(effect.effect), effect.id, property),
      ),
    );
    if (isReplicator) {
      const offsetProps = Object.fromEntries(
        Object.entries(props).filter(([key]) => ['position', 'rotation', 'scale', 'opacity'].includes(key)),
      );
      out.push(
        ...targetsFromProps(
          ownerName,
          offsetProps,
          ownerLabel,
          (property) => qualifiedEffectTarget(capitalize(effect.effect), effect.id, property),
          '',
          'Clone Offset',
        ),
      );
      const fillProps = Object.fromEntries(
        Object.entries(props).filter(
          ([key]) => key === 'fillSeed',
        ),
      );
      out.push(
        ...targetsFromProps(
          ownerName,
          fillProps,
          ownerLabel,
          (property) => qualifiedEffectTarget(capitalize(effect.effect), effect.id, property),
          '',
          'Clone Fill',
        ),
      );
      const ids = replicatorCopyIdsForProps(props);
      const targetOwner = capitalize(effect.effect);
      for (const [index, id] of ids.entries()) {
        const prefix = `${targetOwner}#${effect.id}.copyOverrides.${id}`;
        const copyLabel = `Copy #${index + 1}`;
        out.push(
          ...targetsFromProps(
            `${targetOwner}#${effect.id}`,
            {
              position: vec(0, 0),
              dimensions: vec(0, 0),
              rotation: num(0),
              scale: vec(1, 1),
              opacity: num(1),
            },
            copyLabel,
            (property) => `${prefix}.transform.${property}`,
            '',
            'Virtual Copies',
          ),
          ...targetsFromProps(
            `${targetOwner}#${effect.id}`,
            { fill: col('#ffffff') },
            copyLabel,
            () => `${prefix}.fill`,
            '',
            'Virtual Copies',
          ),
        );
      }
    }
  }
}

/**
 * Every `Component.prop`/`Effect.prop` an Animation track can target. Numeric,
 * vector2, and paint leaves are the only kinds a track can interpolate. A
 * string entity kind returns schema-supported targets; an entity document
 * returns only targets from its displayed components and existing effects.
 * Powers the studio's "Add Track" picker.
 */
export function listAnimatableTargets(entityOrKind: EcsEntityDoc | string): AnimatableTargetOption[] {
  const entityKind = typeof entityOrKind === 'string' ? entityOrKind : entityOrKind.entity;
  const templates = ANIMATABLE_COMPONENT_TEMPLATES[entityKind] ?? [];
  const out: AnimatableTargetOption[] = [];
  if (typeof entityOrKind === 'string') {
    for (const template of templates) {
      out.push(...targetsFromProps(template.component, template.props));
    }
    for (const template of EFFECT_TEMPLATES) {
      if (template.allowedComponents?.some((component) => templates.some((candidate) => candidate.component === component))) {
        out.push(...targetsFromProps(template.effect, template.props));
      }
      if (template.allowedEntities?.includes(entityKind)) out.push(...targetsFromProps(template.effect, template.props));
    }
  } else {
    const displayComponents = mergeEntityComponentsForDisplay(entityOrKind);
    const components: EcsComponentDoc[] = [];
    collectComponents(displayComponents, components);
    for (const component of components) {
      out.push(...targetsFromProps(component.component, component.props));
      targetsFromEffects(component.effects, out, component.component);
    }
    targetsFromEffects(entityOrKind.effects, out, 'entity');
  }
  const seen = new Set<string>();
  return out.filter((option) => (seen.has(option.target) ? false : (seen.add(option.target), true)));
}

/** Returns only fields currently exposed by component/effect editors for the Add Track menu. */
export function listVisibleAnimatableTargets(entity: EcsEntityDoc): AnimatableTargetOption[] {
  const displayComponents = mergeEntityComponentsForDisplay(entity);
  const components: EcsComponentDoc[] = [];
  collectComponents(displayComponents, components);
  const out: AnimatableTargetOption[] = [];
  for (const component of components) {
    out.push(...targetsFromProps(component.component, animationPropsForComponent(component, entity)));
    targetsFromEffects(component.effects, out, component.component, true, entity);
  }
  targetsFromEffects(entity.effects, out, 'entity', true, entity);
  const seen = new Set<string>();
  return out.filter((option) => (seen.has(option.target) ? false : (seen.add(option.target), true)));
}

function collectAnimationComponents(
  components: readonly EcsComponentDoc[],
  output: EcsComponentDoc[],
): void {
  for (const component of components) {
    if (component.component === 'animation' && component.animation) output.push(component);
    collectAnimationComponents(component.components, output);
  }
}

function animationScopeEntities(entity: EcsEntityDoc, scope: string): EcsEntityDoc[] {
  if (scope === 'children') return entity.children;
  if (scope !== 'descendants') return [entity];

  const descendants: EcsEntityDoc[] = [];
  const visit = (children: readonly EcsEntityDoc[]): void => {
    for (const child of children) {
      descendants.push(child);
      visit(child.children);
    }
  };
  visit(entity.children);
  return descendants;
}

/**
 * Finds animation tracks that do not reference an exact component property or
 * an exact effect property. Effect targets must include the entity-local ID.
 */
export function findInvalidAnimationTargets(entity: EcsEntityDoc): string[] {
  const invalid: string[] = [];
  const visit = (current: EcsEntityDoc): void => {
    const animations: EcsComponentDoc[] = [];
    collectAnimationComponents(current.components, animations);
    for (const animation of animations) {
      if (!animation.animation) continue;
      const validTargets = new Set(
        animationScopeEntities(current, animation.animation.scope).flatMap((targetEntity) =>
          listAnimatableTargets(targetEntity).map((option) => option.target),
        ),
      );
      animation.animation.tracks.forEach((track, index) => {
        if (typeof track.target === 'string' && validTargets.has(track.target)) return;
        invalid.push(
          `${current.id}.tracks[${index}] target "${String(track.target)}" must use Component.property or Effect#id.property`,
        );
      });
    }
    current.children.forEach(visit);
  };
  visit(entity);
  return invalid;
}

function isRequiredTemplate(template: ComponentTemplate): boolean {
  return (
    template.required === true ||
    (template.required !== false && template.allowDisable === false) ||
    (template.required !== false && template.isDeletable === false)
  );
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

function dependencyParent(component: EcsComponentDoc): string | undefined {
  return component.attachedTo ?? component.dependencyOf;
}

/** Orders components so each owner is immediately followed by its dependency subtree. */
export function orderComponentsWithDependencies(components: readonly EcsComponentDoc[]): EcsComponentDoc[] {
  const result: EcsComponentDoc[] = [];
  const added = new Set<EcsComponentDoc>();
  const append = (component: EcsComponentDoc): void => {
    if (added.has(component)) return;
    added.add(component);
    result.push(component);
    for (const candidate of components) {
      if (dependencyParent(candidate) === component.component) append(candidate);
    }
  };
  for (const component of components) {
    if (dependencyParent(component) === undefined || components.some((candidate) => candidate.attachedTo === component.component)) {
      append(component);
    }
  }
  for (const component of components) append(component);
  return transformFirstComponents(result);
}

/** Components a word must always keep (else the instancer renders no glyphs). */
function requiredComponents(entity: EcsEntityDoc): Set<string> {
  return entity.entity === 'word' ? new Set(['text', 'font']) : new Set();
}

export function synchronizeFollowTargetPositioning(
  components: EcsComponentDoc[],
  previousComponents: readonly EcsComponentDoc[],
): EcsComponentDoc[] {
  const hasFollowTarget = components.some((component) => component.component === 'followTarget');
  const previouslyHadFollowTarget = previousComponents.some((component) => component.component === 'followTarget');
  const transformIndex = components.findIndex((component) => component.component === 'transform');
  if (transformIndex < 0) return components;
  const transform = components[transformIndex];
  const positioning = transform.props.positioning;
  const shouldForceAbsolute = hasFollowTarget && !(positioning?.kind === 'leaf' && positioning.value === 'absolute');
  const shouldRestoreFlow = previouslyHadFollowTarget && !hasFollowTarget;
  if (!shouldForceAbsolute && !shouldRestoreFlow) return components;
  const value = hasFollowTarget ? 'absolute' : 'flow';
  if (positioning?.kind === 'leaf' && positioning.value === value) return components;
  const nextTransform: EcsComponentDoc = {
    ...transform,
    props: {
      ...transform.props,
      positioning:
        positioning?.kind === 'leaf'
          ? { ...positioning, type: 'string', value }
          : { kind: 'leaf', type: 'string', value },
    },
  };
  const next = [...components];
  next[transformIndex] = nextTransform;
  return next;
}

// --- display merge (real ⊕ template -> everything visible) -----------------

function mergePropertyNode(templateNode: PropertyNode | undefined, realNode: PropertyNode | undefined): PropertyNode | undefined {
  if (!realNode) return templateNode;
  if (!templateNode || templateNode.kind !== 'container' || realNode.kind !== 'container') return realNode;
  const keys = new Set([...Object.keys(templateNode.children), ...Object.keys(realNode.children)]);
  const children: Record<string, PropertyNode> = {};
  for (const key of keys) {
    const merged = mergePropertyNode(templateNode.children[key], realNode.children[key]);
    if (merged) children[key] = merged;
  }
  return { ...templateNode, ...realNode, children };
}

function mergePropertyMaps(
  templateProps: Record<string, PropertyNode>,
  realProps: Record<string, PropertyNode>,
): Record<string, PropertyNode> {
  const keys = new Set([...Object.keys(templateProps), ...Object.keys(realProps)]);
  const merged: Record<string, PropertyNode> = {};
  for (const key of keys) {
    const node = mergePropertyNode(templateProps[key], realProps[key]);
    if (node) merged[key] = node;
  }
  return merged;
}

function fontFamilyValueFromProps(props: Record<string, PropertyNode> | undefined): string | string[] | undefined {
  const family = props?.family;
  if (family?.kind !== 'leaf') return undefined;
  if (typeof family.value === 'string') return family.value;
  if (Array.isArray(family.value)) {
    return family.value.filter((value): value is string => typeof value === 'string');
  }
  return undefined;
}

function fontTemplateForFamily(
  template: ComponentTemplate | undefined,
  component: EcsComponentDoc | undefined,
): ComponentTemplate | undefined {
  if (template?.component !== 'font') return template;
  const emojiTemplate = template.props.emojis;
  if (emojiTemplate?.kind !== 'container') return template;
  const settings = resolveFontEmojiSettings(fontFamilyValueFromProps(component?.props));
  return {
    ...template,
    props: {
      ...template.props,
      emojis: {
        ...emojiTemplate,
        children: {
          ...emojiTemplate.children,
          sizeScale: num(settings.sizeScale),
          alignmentMode: str(settings.alignmentMode),
          baselineOffset: num(settings.baselineOffset),
        },
      },
    },
  };
}

function mergeComponentDisplay(real: EcsComponentDoc | undefined, template: ComponentTemplate): EcsComponentDoc {
  if (!real) return instantiateComponentTemplate(template, false);
  if (real.component === 'animation') {
    return {
      ...real,
      explicit: true,
      allowDisable: real.allowDisable ?? template.allowDisable ?? false,
      isDeletable: real.isDeletable ?? template.isDeletable ?? false,
    };
  }
  const merged = instantiateComponentTemplate(fontTemplateForFamily(template, real) ?? template, true);
  merged.props = mergePropertyMaps(merged.props, real.props);
  if (template.component === 'layoutMotion' && real.props.motionType === undefined) {
    merged.props.motionType = str(layoutMotionTypeFromNodes(real.props.motionScope, undefined));
  }
  merged.components = mergeComponentListDisplay(real.components ?? [], template.components ?? []);
  merged.effects = real.effects ?? [];
  if (real.allowDisable === undefined) merged.allowDisable = template.allowDisable ?? false;
  if (real.isDeletable === undefined) merged.isDeletable = template.isDeletable ?? false;
  if (isRequiredTemplate(template) && merged.props.enabled?.kind === 'leaf' && merged.props.enabled.type === 'boolean') {
    merged.props.enabled = { ...merged.props.enabled, value: true };
  }
  return {
    ...merged,
    ...real,
    props: merged.props,
    components: merged.components,
    effects: merged.effects,
    explicit: true,
  };
}

function mergeComponentListDisplay(real: EcsComponentDoc[], templates: ComponentTemplate[]): EcsComponentDoc[] {
  const out: EcsComponentDoc[] = [];
  const used = new Set<number>();
  for (const component of real) {
    const index = templates.findIndex((template, templateIndex) => {
      return !used.has(templateIndex) && template.component === component.component;
    });
    const template =
      index >= 0 ? templates[index] : templates.find((candidate) => candidate.component === component.component);
    if (template) {
      if (index >= 0) used.add(index);
      out.push(mergeComponentDisplay(component, template));
    } else {
      out.push({ ...component, explicit: true });
    }
  }
  for (const template of templates) {
   const exists = out.some((component) => component.component === template.component);
   const required = isRequiredTemplate(template);
   if (!exists && required) out.push(mergeComponentDisplay(undefined, template));
  }
  return out;
}

/** Expand an entity's components so every schema component/prop is present. */
export function mergeEntityComponentsForDisplay(
  entity: EcsEntityDoc,
  viewportFrameSize?: { width: number; height: number } | null,
): EcsComponentDoc[] {
  const components = transformFirstComponents(mergeComponentListDisplay(entity.components, schemaForEntity(entity)));
  if (entity.entity !== 'viewport' || !viewportFrameSize) return components;
  if (!(viewportFrameSize.width > 0) || !(viewportFrameSize.height > 0)) return components;
  return components.map((component) => {
    if (component.component !== 'transform') return component;
    const dimensions = component.props.dimensions;
    if (dimensions?.kind !== 'leaf') return component;
    return {
      ...component,
      props: {
        ...component.props,
        dimensions: {
          ...dimensions,
          value: { x: viewportFrameSize.width, y: viewportFrameSize.height },
        },
      },
    };
  });
}

// --- reduce (edited display -> minimal/full doc for the tree) --------------

/** A plain leaf sitting at its template default (no animation/transition/randomizer). */
function isDefaultLeaf(node: PropertyNode, template: PropertyNode | undefined): boolean {
  if (!template || node.kind !== 'leaf' || template.kind !== 'leaf') return false;
  if (node.animation || node.transition || node.randomizer || node.hasNoValue) return false;
  if (node.type !== template.type) return false;
  if (!valuesEqual(node.value, template.value)) return false;
  return (node.squircle ?? undefined) === (template.squircle ?? undefined);
}

function isDefaultNode(node: PropertyNode, template: PropertyNode | undefined): boolean {
  if (!template || node.kind !== template.kind) return false;
  if (node.kind === 'leaf' && template.kind === 'leaf') return isDefaultLeaf(node, template);
  if (node.kind !== 'container' || template.kind !== 'container' || node.wrapping !== template.wrapping) return false;
  return Object.entries(node.children).every(([key, child]) => isDefaultNode(child, template.children[key]));
}

/** Whether a component carries anything beyond template defaults (recursively). */
function isSignificant(component: EcsComponentDoc, template: ComponentTemplate | undefined): boolean {
  if (component.animation !== undefined) return true;
  if ((component.effects ?? []).length > 0) return true;
  for (const [key, node] of Object.entries(component.props)) {
    if (!isDefaultLeaf(node, template?.props[key])) return true;
  }
  const nested = template?.components ?? [];
  return (component.components ?? []).some((child) =>
    isSignificant(
      child,
      nested.find((t) => t.component === child.component),
    ),
  );
}

function reduceComponent(
  component: EcsComponentDoc,
  template: ComponentTemplate | undefined,
  required: Set<string>,
  mode: 'minimal' | 'full',
): EcsComponentDoc | undefined {
  const effectiveTemplate = fontTemplateForFamily(template, component);
  const props: Record<string, PropertyNode> = {};
  if (mode === 'minimal') {
    for (const [key, node] of Object.entries(component.props)) {
      const isDefault = component.component === 'font' && key === 'emojis'
        ? isDefaultNode(node, effectiveTemplate?.props[key])
        : isDefaultLeaf(node, effectiveTemplate?.props[key]);
      if (isDefault) continue;
      props[key] = node;
    }
  } else {
    for (const [key, node] of Object.entries(component.props)) {
      if (component.component === 'font' && key === 'emojis' && isDefaultNode(node, effectiveTemplate?.props[key])) {
        continue;
      }
      props[key] = node;
    }
  }

  const nestedTemplates = template?.components ?? [];
  const components: EcsComponentDoc[] = [];
  for (const child of component.components ?? []) {
    const reduced = reduceComponent(
      child,
      nestedTemplates.find((t) => t.component === child.component),
      required,
      mode,
    );
    if (reduced) components.push(reduced);
  }

  const build = (): EcsComponentDoc => {
    const out: EcsComponentDoc = {
      component: component.component,
      studioId: component.studioId,
      props,
      components,
      effects: component.effects ?? [],
      allowDisable: component.allowDisable,
      isDeletable: component.isDeletable,
    };
    if (component.animation !== undefined) out.animation = component.animation;
    if (component.dependencyOf !== undefined) out.dependencyOf = component.dependencyOf;
    if (component.attachedTo !== undefined) out.attachedTo = component.attachedTo;
    return out;
  };

  if (component.explicit) return build();
  if (required.has(component.component)) return build();
  if (mode === 'minimal') {
    if (
      Object.keys(props).length === 0 &&
      components.length === 0 &&
      (component.effects ?? []).length === 0 &&
      component.animation === undefined
    ) {
      return undefined;
    }
  } else if (!isSignificant(component, template)) {
    return undefined;
  }
  return build();
}

/**
 * Collapse the fully-merged display components back to what lives on the
 * entity. Base entities keep only non-default props/components. Custom state
 * entities keep their full style but drop all-default optional components.
 * Required word components (text/font) are always kept.
 */
export function reduceEntityComponents(displayComponents: EcsComponentDoc[], entity: EcsEntityDoc): EcsComponentDoc[] {
  const templates = schemaForEntity(entity);
  const required = new Set([
    ...requiredComponents(entity),
    ...templates.filter(isRequiredTemplate).map((template) => template.component),
  ]);
  const mode: 'minimal' | 'full' = isStateOverrideEntity(entity) ? 'full' : 'minimal';
  const out: EcsComponentDoc[] = [];
  for (const component of displayComponents) {
    const reduced = reduceComponent(
      component,
      templates.find((t) => t.component === component.component),
      required,
      mode,
    );
    if (reduced) out.push(reduced);
  }
  return synchronizeFollowTargetPositioning(orderComponentsWithDependencies(out), entity.components);
}

// --- state seeding ---------------------------------------------------------

/**
 * A fresh per-state custom entity seeded from a source style, including its
 * entity-level effects. The source can be the default style or another state.
 */
export function deriveStateFromBase(base: EcsEntityDoc, id: string): EcsEntityDoc {
  return deriveStateFromStyleSource(base, id);
}

export function deriveStateFromStyleSource(base: EcsEntityDoc, id: string): EcsEntityDoc {
  const effectIds = createEffectIdMap(
    base.components,
    base.effects,
    effectScopeForEntity(base.entity, id),
    createScopedEffectId,
  );
  const stateEntity: EcsEntityDoc = {
    entity: base.entity,
    id,
    ...(base.forEntityId ? { forEntityId: base.forEntityId } : {}),
    components: cloneComponentsWithRemappedEffectIds(base.components, effectIds),
    effects: base.effects.map((effect) => ({
      ...structuredClone(effect),
      id: effectIds.get(effect.id) ?? effect.id,
    })),
    children: [],
  };
  const allowed = new Set(schemaForEntity(stateEntity).map((t) => t.component));
  stateEntity.components = transformFirstComponents(stateEntity.components.filter((c) => allowed.has(c.component)));
  return stateEntity;
}

/**
 * True when a custom state entity carries no style or child entities.
 */
export function stateEntityIsEmpty(entity: EcsEntityDoc): boolean {
  return (
    !isInheritedStateEntity(entity) &&
    entity.components.length === 0 &&
    entity.effects.length === 0 &&
    entity.children.length === 0
  );
}
