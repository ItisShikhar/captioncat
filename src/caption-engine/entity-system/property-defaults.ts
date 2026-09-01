import { DEFAULT_BUNDLED_IMAGE_ASSET } from '#platform/image-assets.js';
import { DEFAULT_IMAGE_COLOR } from './components/image-style';
import { cursorPresetDefinition, normalizeCursorPreset } from '#platform/cursor-assets.js';
import { solidPaint } from './paint';
import { staticProperty, type Property } from './property';
import type { FillPattern } from './fill-pattern';

interface PropertyOwner {
  type: string;
  props: Map<string, Property<unknown>>;
}

type PropertyFactory = () => Property<unknown>;

const componentDefaults: Record<string, Record<string, PropertyFactory>> = {
  layout: {
    'padding.top': () => staticProperty('number', 0),
    'padding.right': () => staticProperty('number', 0),
    'padding.bottom': () => staticProperty('number', 0),
    'padding.left': () => staticProperty('number', 0),
    'padding.linkedTopBottom': () => staticProperty('boolean', true),
    'padding.linkedLeftRight': () => staticProperty('boolean', true),
    'childWindow.windowMode': () => staticProperty('string', 'all'),
    'childWindow.windowCount': () => staticProperty('number', 1),
    'childWindow.windowAxis': () => staticProperty('string', 'vertical'),
    'childWindow.windowAnchor': () => staticProperty('string', 'start'),
    'childWindow.windowSelection': () => staticProperty('string', 'anchor'),
    'childrenAlignment.horizontalSingleItemAlignment': () =>
      staticProperty('string', 'start'),
    'childrenAlignment.verticalSingleItemAlignment': () =>
      staticProperty('string', 'start'),
  },
  transform: {
    positioning: () => staticProperty('string', 'flow'),
    position: () => staticProperty('vector2', { x: 0, y: 0 }),
    positionXUnit: () => staticProperty('string', 'pt'),
    positionYUnit: () => staticProperty('string', 'pt'),
    dimensions: () => staticProperty('vector2', { x: 0, y: 0 }),
    widthUnit: () => staticProperty('string', 'pt'),
    heightUnit: () => staticProperty('string', 'pt'),
    widthMode: () => staticProperty('string', 'custom'),
    heightMode: () => staticProperty('string', 'custom'),
    rotation: () => staticProperty('number', 0),
    scale: () => staticProperty('vector2', { x: 1, y: 1 }),
    opacity: () => staticProperty('number', 1),
  },
  selfLayout: {
    enabled: () => staticProperty('boolean', true),
    aspectRatio: () => staticProperty('string', 'maintain'),
    customAspectRatio: () => staticProperty('string', '16:9'),
    horizontalAlignment: () => staticProperty('string', 'center'),
    verticalAlignment: () => staticProperty('string', 'center'),
    horizontalSingleItemAlignment: () => staticProperty('string', 'start'),
    verticalSingleItemAlignment: () => staticProperty('string', 'start'),
  },
  image: {
    enabled: () => staticProperty('boolean', true),
    assetSource: () => staticProperty('string', 'bundled'),
    asset: () => staticProperty('string', DEFAULT_BUNDLED_IMAGE_ASSET),
    customAsset: () => staticProperty('string', ''),
    aspectRatio: () => staticProperty('string', 'maintain'),
    customAspectRatio: () => staticProperty('string', '16:9'),
    renderOrder: () => staticProperty('string', 'belowChildren'),
    colorMode: () => staticProperty('string', 'tint'),
    color: () => staticProperty('paint', solidPaint(DEFAULT_IMAGE_COLOR)),
  },
  borderRadius: {
    enabled: () => staticProperty('boolean', true),
    borderRadiusMode: () => staticProperty('string', 'uniform'),
    borderRadius: () => staticProperty('number', 16),
    borderTopLeftRadius: () => staticProperty('number', 16),
    borderTopRightRadius: () => staticProperty('number', 16),
    borderBottomRightRadius: () => staticProperty('number', 16),
    borderBottomLeftRadius: () => staticProperty('number', 16),
  },
  backgroundStyle: {
    enabled: () => staticProperty('boolean', true),
    fill: () => staticProperty('paint', solidPaint('#e5e7eb')),
    effectsInheritBaseAlpha: () => staticProperty('boolean', true),
    fillPattern: () =>
      staticProperty<FillPattern>('pattern', {
        type: 'pattern',
        pattern: 'single',
        colors: [],
        offset: 0,
      }),
    pathShape: () => staticProperty('string', 'rounded'),
    tailSide: () => staticProperty('string', 'auto'),
    tailSize: () => staticProperty('number', 1),
    borderRadiusMode: () => staticProperty('string', 'uniform'),
    borderRadius: () => staticProperty('number', 0),
    borderTopLeftRadius: () => staticProperty('number', 0),
    borderTopRightRadius: () => staticProperty('number', 0),
    borderBottomRightRadius: () => staticProperty('number', 0),
    borderBottomLeftRadius: () => staticProperty('number', 0),
    boundsMode: () => staticProperty('string', 'fillSelf'),
    overflowMode: () => staticProperty('string', 'visible'),
    'bandPadding.top': () => staticProperty('number', 0),
    'bandPadding.right': () => staticProperty('number', 0),
    'bandPadding.bottom': () => staticProperty('number', 0),
    'bandPadding.left': () => staticProperty('number', 0),
    'bandPadding.linkedTopBottom': () => staticProperty('boolean', true),
    'bandPadding.linkedLeftRight': () => staticProperty('boolean', true),
    'blockPadding.top': () => staticProperty('number', 0),
    'blockPadding.right': () => staticProperty('number', 0),
    'blockPadding.bottom': () => staticProperty('number', 0),
    'blockPadding.left': () => staticProperty('number', 0),
    'blockPadding.linkedTopBottom': () => staticProperty('boolean', true),
    'blockPadding.linkedLeftRight': () => staticProperty('boolean', true),
    offset: () => staticProperty('vector2', { x: 0, y: 0 }),
    scale: () => staticProperty('vector2', { x: 1, y: 1 }),
  },
  font: {
    family: () => staticProperty('fontFamily', []),
    size: () => staticProperty('number', 60),
    weight: () => staticProperty('fontWeight', 400),
    style: () => staticProperty('string', 'normal'),
    'emojis.family': () => staticProperty('fontFamily', []),
  },
  text: {
    color: () => staticProperty('paint', solidPaint('white')),
    effectsInheritBaseAlpha: () => staticProperty('boolean', true),
    caseTransform: () => staticProperty('string', 'none'),
    letterSpacing: () => staticProperty('number', 0),
  },
  underline: {
    enabled: () => staticProperty('boolean', true),
    width: () => staticProperty('number', 0),
    protrusion: () => staticProperty('number', 0),
    offset: () => staticProperty('vector2', { x: 0, y: 0 }),
    color: () => staticProperty('paint', solidPaint('rgba(0,0,0,0)')),
    capType: () => staticProperty('string', 'round'),
    renderOrder: () => staticProperty('string', 'behind'),
  },
  strikethrough: {
    enabled: () => staticProperty('boolean', true),
    width: () => staticProperty('number', 0),
    protrusion: () => staticProperty('number', 0),
    offset: () => staticProperty('vector2', { x: 0, y: 0 }),
    color: () => staticProperty('paint', solidPaint('rgba(0,0,0,0)')),
    capType: () => staticProperty('string', 'round'),
    renderOrder: () => staticProperty('string', 'inFront'),
  },
  verticalSpacer: {
    enabled: () => staticProperty('boolean', true),
    spacing: () => staticProperty('number', 8),
    unit: () => staticProperty('string', 'pt'),
  },
  horizontalSpacer: {
    enabled: () => staticProperty('boolean', true),
    spacing: () => staticProperty('number', 8),
    unit: () => staticProperty('string', 'pt'),
  },
  lifecycle: {
    persistAcrossVideo: () => staticProperty('boolean', false),
  },
  layoutMotion: {
    enabled: () => staticProperty('boolean', true),
    motionScope: () => staticProperty('string', 'group'),
    motionType: () => staticProperty('string', 'spring'),
    timingMode: () => staticProperty('string', 'fixed'),
    flowDirection: () => staticProperty('string', 'bottomToTop'),
    focusPosition: () => staticProperty('string', 'center'),
    stiffness: () => staticProperty('number', 220),
    damping: () => staticProperty('number', 28),
    mass: () => staticProperty('number', 1),
    springFalloffFactor: () => staticProperty('number', 1),
    durationSeconds: () => staticProperty('number', 0.25),
    easing: () => staticProperty('string', 'easeInOut'),
    staggerTimingMode: () => staticProperty('string', 'adaptive'),
    staggerDelaySeconds: () => staticProperty('number', 0.025),
    staggerFalloffFactor: () => staticProperty('number', 1),
    'stateMotion.past.distanceScale': () => staticProperty('number', 1),
    'stateMotion.past.speedScale': () => staticProperty('number', 1),
    'stateMotion.previous.distanceScale': () => staticProperty('number', 1),
    'stateMotion.previous.speedScale': () => staticProperty('number', 1),
    'stateMotion.current.distanceScale': () => staticProperty('number', 1),
    'stateMotion.current.speedScale': () => staticProperty('number', 1),
    'stateMotion.next.distanceScale': () => staticProperty('number', 1),
    'stateMotion.next.speedScale': () => staticProperty('number', 1),
    'stateMotion.future.distanceScale': () => staticProperty('number', 1),
    'stateMotion.future.speedScale': () => staticProperty('number', 1),
  },
  paintOrder: {
    enabled: () => staticProperty('boolean', true),
    zIndex: () => staticProperty('number', 0),
  },
  childPaintOrder: {
    enabled: () => staticProperty('boolean', true),
    mode: () => staticProperty('string', 'source'),
    direction: () => staticProperty('string', 'descending'),
    backZIndex: () => staticProperty('number', 0),
    frontZIndex: () => staticProperty('number', 1),
    start: () => staticProperty('string', 'back'),
    values: () => staticProperty('array', []),
    offset: () => staticProperty('number', 0),
    seed: () => staticProperty('number', 0),
  },
  imageSequencer: {
    enabled: () => staticProperty('boolean', true),
    frames: () => staticProperty('array', []),
    playbackMode: () => staticProperty('string', 'continuous'),
    frameRate: () => staticProperty('number', 12),
    loop: () => staticProperty('boolean', true),
    trigger: () =>
      staticProperty('array', [
        { trigger: 'currentWordStart', advance: 'next' },
      ]),
    endBehavior: () => staticProperty('string', 'hold'),
  },
};

const effectDefaults: Record<string, Record<string, PropertyFactory>> = {
  blur: {
    enabled: () => staticProperty('boolean', true),
    showOriginal: () => staticProperty('string', 'none'),
    blurRadius: () => staticProperty('number', 8),
  },
  motionBlur: {
    enabled: () => staticProperty('boolean', true),
    steps: () => staticProperty('number', 8),
    angle: () => staticProperty('number', 0),
    distance: () => staticProperty('number', 8),
    maxOpacity: () => staticProperty('number', 0.7),
    showOriginal: () => staticProperty('string', 'none'),
  },
  streak: {
    enabled: () => staticProperty('boolean', true),
    steps: () => staticProperty('number', 8),
    angle: () => staticProperty('number', 0),
    distance: () => staticProperty('number', 8),
    maxOpacity: () => staticProperty('number', 0.7),
    showOriginal: () => staticProperty('string', 'none'),
  },
  border: {
    enabled: () => staticProperty('boolean', true),
    width: () => staticProperty('number', 12),
    color: () => staticProperty('paint', solidPaint('#000000')),
    position: () => staticProperty('string', 'outer'),
    style: () => staticProperty('string', 'solid'),
  },
  glow: {
    enabled: () => staticProperty('boolean', true),
    mode: () => staticProperty('string', 'outer'),
    color: () => staticProperty('paint', solidPaint('rgba(255,255,255,1)')),
    blurRadius: () => staticProperty('number', 12),
    strength: () => staticProperty('number', 1),
  },
  noise: {
    appliesOn: () => staticProperty('string', 'previousEffect'),
    enabled: () => staticProperty('boolean', true),
    static: () => staticProperty('boolean', false),
    noise: () => staticProperty('number', 0.04),
  },
  blendMode: {
    enabled: () => staticProperty('boolean', true),
    blendMode: () => staticProperty('string', 'normal'),
  },
  flicker: {
    appliesOn: () => staticProperty('string', 'previousEffect'),
    enabled: () => staticProperty('boolean', true),
    showOriginal: () => staticProperty('string', 'none'),
    showOriginalDuringOff: () => staticProperty('boolean', false),
    flicker: () => staticProperty('number', 0.03),
    offPaint: () => staticProperty('paint', solidPaint('#000000')),
    updateMode: () => staticProperty('string', 'everyFrame'),
    maxOffDuration: () => staticProperty('number', 0),
  },
  fisheye: {
    appliesOn: () => staticProperty('string', 'previousEffect'),
    enabled: () => staticProperty('boolean', true),
    mode: () => staticProperty('string', 'concave'),
    distortion: () => staticProperty('number', 0),
    zoom: () => staticProperty('number', 1),
    lensCenter: () => staticProperty('vector2', { x: 0.5, y: 0.5 }),
    edgeMode: () => staticProperty('string', 'transparent'),
    aspectCorrection: () => staticProperty('boolean', true),
  },
  vignette: {
    appliesOn: () => staticProperty('string', 'previousEffect'),
    enabled: () => staticProperty('boolean', true),
    vignette: () => staticProperty('number', 0),
    center: () => staticProperty('vector2', { x: 0.5, y: 0.5 }),
    aspectCorrection: () => staticProperty('boolean', true),
  },
  shadow: {
    enabled: () => staticProperty('boolean', true),
    blurRadius: () => staticProperty('number', 8),
    offset: () => staticProperty('vector2', { x: 2, y: 4 }),
    longShadow: () => staticProperty('boolean', false),
    color: () => staticProperty('paint', solidPaint('#000000')),
    useFontColor: () => staticProperty('boolean', false),
    opacity: () => staticProperty('number', 1),
  },
  stroke: {
    enabled: () => staticProperty('boolean', true),
    style: () => staticProperty('string', 'solid'),
    alignment: () => staticProperty('string', 'outside'),
    antialiasScale: () => staticProperty('number', 2),
    width: () => staticProperty('number', 12),
    color: () => staticProperty('paint', solidPaint('#00c853')),
    useFontColor: () => staticProperty('boolean', false),
    joinType: () => staticProperty('string', 'round'),
    capType: () => staticProperty('string', 'round'),
    dash: () => staticProperty('number', 24),
    gap: () => staticProperty('number', 24),
    spacing: () => staticProperty('number', 20),
    dashOffset: () => staticProperty('number', 0),
    opacity: () => staticProperty('number', 1),
  },
  replicator: {
    enabled: () => staticProperty('boolean', true),
    cloneOrdering: () => staticProperty('string', 'backToFront'),
    showOriginal: () => staticProperty('string', 'front'),
    cloneCount: () => staticProperty('number', 3),
    fillMode: () => staticProperty('string', 'inherit'),
    fillTarget: () => staticProperty('string', 'base'),
    fillSeed: () => staticProperty('number', 0),
    customFills: () =>
      staticProperty('array', [
      solidPaint('#ff4d4f'),
      solidPaint('#40a9ff'),
      solidPaint('#73d13d'),
    ]),
    position: () => staticProperty('vector2', { x: 4, y: 4 }),
    rotation: () => staticProperty('number', 0),
    scale: () => staticProperty('vector2', { x: 0, y: 0 }),
    opacity: () => staticProperty('number', 0),
    copyIds: () => staticProperty('array', ['copy_1', 'copy_2', 'copy_3']),
  },
  typewriter: {
    enabled: () => staticProperty('boolean', true),
    revealMode: () => staticProperty('string', 'lifecycle'),
    durationMode: () => staticProperty('string', 'auto'),
    reveal: () => staticProperty('number', 1),
    durationSeconds: () => staticProperty('number', 0.8),
    delaySeconds: () => staticProperty('number', 0),
    unitDurationSeconds: () => staticProperty('number', 0.18),
    direction: () => staticProperty('string', 'forward'),
    unitTracks: () => staticProperty('array', []),
    'cursor.enabled': () => staticProperty('boolean', true),
    'cursor.preset': () => staticProperty('string', 'mac'),
    'cursor.shape': () => staticProperty('string', 'caret'),
    'cursor.glyph': () => staticProperty('string', '|'),
    'cursor.colorMode': () => staticProperty('string', 'original'),
    'cursor.color': () => staticProperty('paint', solidPaint('#ffffff')),
    'cursor.size': () => staticProperty('number', 0),
    'cursor.offset': () => staticProperty('vector2', { x: 0, y: 0 }),
    'cursor.opacity': () => staticProperty('number', 1),
    'cursor.showDuringReveal': () => staticProperty('boolean', true),
    'cursor.showOnStart': () => staticProperty('boolean', false),
    'cursor.showWhenComplete': () => staticProperty('boolean', false),
    'cursor.blink.enabled': () => staticProperty('boolean', true),
    'cursor.blink.rate': () => staticProperty('number', 2),
    'cursor.blink.dutyCycle': () => staticProperty('number', 0.5),
    'cursor.blink.phaseOffset': () => staticProperty('number', 0),
  },
  wipeReveal: {
    enabled: () => staticProperty('boolean', true),
    reveal: () => staticProperty('number', 1),
    direction: () => staticProperty('string', 'logicalStartToEnd'),
    shape: () => staticProperty('string', 'rectangle'),
    angle: () => staticProperty('number', 45),
    feather: () => staticProperty('number', 0),
    fromStyle: () => staticProperty('string', 'next'),
    toStyle: () => staticProperty('string', 'current'),
    basePlacement: () => staticProperty('string', 'back'),
  },
};

function defaultsFor(
  owner: PropertyOwner,
): Record<string, PropertyFactory> | undefined {
  return owner.type === 'transform' ||
    owner.type === 'backgroundStyle' ||
    owner.type === 'text'
    ? componentDefaults[owner.type]
    : (componentDefaults[owner.type] ?? effectDefaults[owner.type]);
}

export function ensureDefaultProperty(
  owner: PropertyOwner,
  name: string,
): Property<unknown> | undefined {
  const existing = owner.props.get(name);
  if (existing) return existing;
  const factory = defaultsFor(owner)?.[name];
  if (!factory) return undefined;
  const property = factory();
  owner.props.set(name, property);
  return property;
}

export function ensureComponentDefaults(component: PropertyOwner): void {
  const defaults = componentDefaults[component.type];
  if (!defaults) return;
  for (const key of Object.keys(defaults))
    ensureDefaultProperty(component, key);
}

export function ensureEffectDefaults(effect: PropertyOwner): void {
  const defaults = effectDefaults[effect.type];
  if (!defaults) return;
  const missingCursorProperties =
    effect.type === 'typewriter'
      ? new Set(
          [
            'cursor.preset',
            'cursor.shape',
            'cursor.colorMode',
            'cursor.color',
            'cursor.size',
            'cursor.offset',
          ].filter((key) => !effect.props.has(key)),
        )
      : undefined;
  for (const key of Object.keys(defaults)) ensureDefaultProperty(effect, key);
  if (
    effect.type !== 'typewriter' ||
    !missingCursorProperties ||
    missingCursorProperties.size === 0
  )
    return;

  const preset = normalizeCursorPreset(effect.props.get('cursor.preset')?.base);
  const definition = cursorPresetDefinition(preset);
  if (!definition) return;
  if (missingCursorProperties.has('cursor.shape')) {
    effect.props.set(
      'cursor.shape',
      staticProperty('string', definition.shape),
    );
  }
  if (missingCursorProperties.has('cursor.colorMode')) {
    effect.props.set(
      'cursor.colorMode',
      staticProperty('string', definition.colorMode),
    );
  }
  if (missingCursorProperties.has('cursor.color')) {
    effect.props.set(
      'cursor.color',
      staticProperty('paint', solidPaint(definition.color)),
    );
  }
  if (missingCursorProperties.has('cursor.size')) {
    effect.props.set('cursor.size', staticProperty('number', definition.size));
  }
  if (missingCursorProperties.has('cursor.offset')) {
    effect.props.set(
      'cursor.offset',
      staticProperty('vector2', definition.offset),
    );
  }
}
