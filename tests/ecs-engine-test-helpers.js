const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { styleContextForEntity } = require('../build/caption-engine/entity-system/style-overrides.js');

const {
  Property,
  TransitionRuntime,
  staticProperty,
  MAX_MOTION_BLUR_STEPS,
  interpolatorFor,
  BackgroundStyle,
  BackgroundEntity,
  FollowTarget,
  BorderRadius,
  Text,
  Layout,
  LayoutMotion,
  LayoutMotionRuntime,
  applyLayoutMotion,
  VerticalSpacer,
  HorizontalSpacer,
  SelfLayout,
  Transform,
  BorderEffect,
  BlendModeEffect,
  NoiseEffect,
  FlickerEffect,
  FisheyeEffect,
  VignetteEffect,
  GlowEffect,
  ShadowEffect,
  StrokeEffect,
  TypewriterEffect,
  WipeRevealEffect,
  GaussianBlurEffect,
  MotionBlurEffect,
  StreakEffect,
  CompositionArea,
  Page,
  Row,
  Word,
  Marker,
  ImageFlowEntity,
  MarkerBehavior,
  Image,
  ImageSequencer,
  PaintOrder,
  ChildPaintOrder,
  paintOrderPropsFromConfig,
  childPaintOrderPropsFromConfig,
  resolveChildPaintOrders,
  resolvedZIndex,
  orderedChildGroups,
  collectResolvedPaintOrders,
  AnimationComponent,
  Video,
  VideoArea,
  Viewport,
  buildEcsTree,
  buildEcsTreeFromPreset,
  serializeEntityTree,
  buildProperty,
  layoutScene,
  contentBoxFromArea,
  renderScene,
  markerAppearance,
  renderEffectStack,
  renderWrappedEffect,
  renderLayeredEffectStack,
  Font,
  instantiateScene,
  instantiateStackedScene,
  wordStateFor,
  rowStateFor,
  applyCaseTransform,
  renderCaptionFrame,
  solidPaint,
  normalizeFillPattern,
  resolveFillPatternPaint,
  contentBounds,
  captureLayoutSnapshot,
  collectDebugFrame,
  collectDebugTransforms,
  contentClipBox,
  resolveTransformPivot,
  defaultResolveContext,
  prepareAnimationContext,
  prepareTransitionContext,
  prepareFollowContext,
  resolveFollowTarget,
  resolveTrackTarget,
  createFollowRuntime,
  createTransitionRuntime,
  resolveFollowMode,
  offsetCollidingEndTimestamps,
  BUILTIN_IMAGE_ASSET_DEFINITIONS,
  builtinImageDefinition,
  builtinImageSvg,
  cursorAssetForPreset,
  cursorAssetsInScene,
  cursorAssetSource,
  CURSOR_PRESET_DEFINITIONS,
  cursorSvg,
  normalizeCursorColorMode,
  normalizePaint,
  imageAssetState,
  loadImageAsset,
  loadedImageAsset,
  createDefaultCaptionLayoutPolicy,
  DEFAULT_CAPTION_WORD_WRAP_OVERFLOW_TOLERANCE,
  DEFAULT_LONG_WORD_THRESHOLD_SECONDS,
  resolveLongWordThreshold,
  CAPTION_BREAK_TIMING_PRESETS,
  captionBreakTimingPresetFor,
  directionForLanguage,
  directionForText,
  resolveTextDirection,
  segmentCaptionText,
  segmentCaptionWords,
  allocateCaptionPages,
  validateCaptionLayoutForPage,
  validateCaptionLayoutPolicy,
  validateCaptionLayoutOverride,
  mergeCaptionLayoutPolicy,
  minimumWrappedWordWidth,
  wrapCaptionTimedWords,
  wrapOversizedCaptionRows,
  resolveRowFontScale,
  rowFitWidthForWrapping,
  diagnoseCaptionPageOverflow,
  normalizeStateWindowConfig,
  clampFixedCount,
  ensureComponentDefaults,
  ensureEffectDefaults,
  resolveAdaptiveSequenceTiming,
  refreshDependentGeometry,
  ReplicatorEffect,
} = require('../build/caption-engine/entity-system/index.js');
const {
  applyStrokeStyle,
  strokePathWithStyle,
} = require('../build/caption-engine/entity-system/effects/box-stroke-utils.js');
const { drawImageOutline } = require('../build/caption-engine/entity-system/effects/image-outline.js');
const { generateSubtitleImagesEcs } = require('../build/caption-engine/entity-system/pipeline.js');
const { buildRoundedUnionPath } = require('../build/utilities/canvas-utils.js');

const ctx = (overrides) => defaultResolveContext(overrides);
const insetEntries = (key, horizontal, vertical) => [
  [`${key}.top`, staticProperty('number', vertical)],
  [`${key}.right`, staticProperty('number', horizontal)],
  [`${key}.bottom`, staticProperty('number', vertical)],
  [`${key}.left`, staticProperty('number', horizontal)],
];
const generatePipeline = generateSubtitleImagesEcs;

function canonicalVideoArea(video = { entity: 'video', id: 'video' }) {
  return {
    entity: 'videoArea',
    id: 'videoArea',
    components: [
      {
        component: 'layout',
        props: {
          layoutMode: { type: 'string', value: 'overlay' },
          padding: {
            top: { type: 'number', value: 0 },
            right: { type: 'number', value: 0 },
            bottom: { type: 'number', value: 0 },
            left: { type: 'number', value: 0 },
          },
          clipContent: { type: 'boolean', value: true },
        },
      },
    ],
    children: [video],
  };
}

function canonicalViewport(compositionArea, video = { entity: 'video', id: 'video' }) {
  return {
    entity: 'viewport',
    id: 'viewport',
    children: [canonicalVideoArea(video), compositionArea],
  };
}

// --- Render integration: Word text slice (font / color / stroke / shadow) ---
//
// These prove the ECS paint path draws pixels: build a tree from a
// preset (or a small synthetic design), paint a Word's Text onto a real
// skia-canvas, then assert on the resulting pixels. PNGs are also dumped to the
// session `files/` folder when available so the render can be inspected visually.

const { Canvas } = require('skia-canvas');
const os = require('node:os');

const ARTIFACT_DIR = path.join(os.tmpdir(), 'captioncat-ecs-render');

function dumpPng(canvas, name) {
  try {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    const outputPath = path.join(ARTIFACT_DIR, name);
    fs.writeFileSync(outputPath, canvas.toBufferSync('png'));
    console.log(`[test-output] ${outputPath}`);
  } catch {
    // Artifact dumping is optional. The pixel assertions are the test.
  }
}

// Paint one Word centered on a fresh canvas and return the raw RGBA pixels.
function renderWord(word, options = {}) {
  const { width = 900, height = 320, progress = 1, background, baseFont = 'bold 80px sans-serif' } = options;

  const canvas = new Canvas(width, height);
  const context = canvas.getContext('2d');
  if (background) {
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
  }
  context.font = baseFont;
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  context.save();
  context.translate(width / 2, height / 2);
  const rctx = defaultResolveContext({ progress });
  const transform = word.transform;
  if (transform) {
    context.globalAlpha = context.globalAlpha * transform.opacity(rctx);
    transform.applyTo(context, rctx);
  }
  word.paint(context, rctx, word);
  context.restore();

  const { data } = context.getImageData(0, 0, width, height);
  return { canvas, context, data, width, height };
}

function countOpaquePixels(data) {
  let count = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 16) count += 1;
  }
  return count;
}

function opaqueBounds(data, width, height) {
  let left = width;
  let top = height;
  let right = 0;
  let bottom = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] <= 16) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + 1);
      bottom = Math.max(bottom, y + 1);
    }
  }
  return { top, bottom, width: right - left, height: bottom - top };
}

// Does any near-opaque pixel match the predicate over (r,g,b)?
function hasColor(data, predicate, minimumAlpha = 200) {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > minimumAlpha && predicate(data[i], data[i + 1], data[i + 2])) {
      return true;
    }
  }
  return false;
}

function hasPixelPair(firstData, secondData, predicate) {
  for (let i = 0; i < firstData.length; i += 4) {
    if (
      predicate(
        firstData[i],
        firstData[i + 1],
        firstData[i + 2],
        firstData[i + 3],
        secondData[i],
        secondData[i + 1],
        secondData[i + 2],
        secondData[i + 3],
      )
    ) {
      return true;
    }
  }
  return false;
}

function loadEcsPreset(name) {
  const presetPath = path.resolve(__dirname, `../assets/json/caption-style-presets/${name}`);
  return JSON.parse(fs.readFileSync(presetPath, 'utf8'));
}

const ECS_PRESET_NAMES = fs
  .readdirSync(path.resolve(__dirname, '../assets/json/caption-style-presets'))
  .filter((name) => name.endsWith('.json'));

// Paint an entity through its effect stack, centered, returning RGBA pixels.
function renderWithEffects(entity, options = {}) {
  const { width = 900, height = 320, progress = 1 } = options;
  const canvas = new Canvas(width, height);
  const context = canvas.getContext('2d');
  context.save();
  context.translate(width / 2, height / 2);
  entity.paintWithEffects(context, defaultResolveContext({ progress }));
  context.restore();
  const { data } = context.getImageData(0, 0, width, height);
  return { canvas, data, width, height };
}

function countPartialPixels(data) {
  let count = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 16 && data[i] < 200) count += 1;
  }
  return count;
}

function opaqueWidth(data, width, height) {
  let minX = width;
  let maxX = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 16) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }
  return maxX < minX ? 0 : maxX - minX;
}

// --- Layout engine + scene render ---
//
// These build a real multi-word line (not a preset template) directly from the
// ECS classes, run the layout engine to assign boxes, then render the whole
// tree with the scene walker and assert on the resulting geometry/pixels.

function makeWord(id, text, options = {}) {
  const { size = 70, color = 'white', scaleX, pivot } = options;
  const word = new Word(id, text);
  if (scaleX !== undefined) {
    const transformProps = new Map([['scale', staticProperty('vector2', { x: scaleX, y: 1 })]]);
    if (pivot !== undefined) transformProps.set('pivot', staticProperty('string', pivot));
    word.addComponent(new Transform(transformProps));
  }
  const textComponent = new Text(new Map([['color', staticProperty('paint', solidPaint(color))]]));
  const font = new Font(
    new Map([
      ['family', staticProperty('fontFamily', ['Arimo', 'sans-serif'])],
      ['size', staticProperty('number', size)],
      ['weight', staticProperty('string', 'bold')],
    ]),
  );
  textComponent.components.push(font);
  word.addComponent(textComponent);
  return word;
}

function makeLine(words) {
  const root = new CompositionArea('compositionArea');
  const page = new Page('page');
  const row = new Row('row');
  root.addChild(page);
  page.addChild(row);
  for (const word of words) row.addChild(word);
  return { root, page, row };
}

function fixedDimensionsTransform(width, height) {
  return new Transform(
    new Map([
      ['dimensions', staticProperty('vector2', { x: width, y: height })],
      ['widthMode', staticProperty('string', 'custom')],
      ['heightMode', staticProperty('string', 'custom')],
    ]),
  );
}

function childrenAlignmentLayout(horizontal, vertical, horizontalSingleItemAlignment, verticalSingleItemAlignment) {
  const entries = [
    ['childrenAlignment.horizontalAlignment', staticProperty('string', horizontal)],
    ['childrenAlignment.verticalAlignment', staticProperty('string', vertical)],
  ];
  if (horizontalSingleItemAlignment !== undefined) {
    entries.push([
      'childrenAlignment.horizontalSingleItemAlignment',
      staticProperty('string', horizontalSingleItemAlignment),
    ]);
  }
  if (verticalSingleItemAlignment !== undefined) {
    entries.push([
      'childrenAlignment.verticalSingleItemAlignment',
      staticProperty('string', verticalSingleItemAlignment),
    ]);
  }
  return new Layout(new Map(entries));
}

function makeFixedLine(words, width = 400, height = 240) {
  const line = makeLine(words);
  line.root.addComponent(new Transform(new Map([['dimensions', staticProperty('vector2', { x: width, y: height })]])));
  line.root.addComponent(
    new Layout(new Map([...insetEntries('padding', 0, 0), ['clipContent', staticProperty('boolean', true)]])),
  );
  return line;
}

function layoutFixedLine(line, rowFontFit, width = 400, height = 240, renderContext = ctx()) {
  layoutScene(line.root, new Canvas(1, 1).getContext('2d'), renderContext, {
    width,
    height,
    rowFontFit,
  });
  return line;
}

function separatedGap(first, second, axis) {
  const firstStart = first[axis];
  const secondStart = second[axis];
  const firstEnd = firstStart + first[axis === 'x' ? 'width' : 'height'];
  const secondEnd = secondStart + second[axis === 'x' ? 'width' : 'height'];
  return Math.max(0, Math.max(firstStart, secondStart) - Math.min(firstEnd, secondEnd));
}

function assertBoxWithin(inner, outer, label) {
  const epsilon = 0.001;
  assert.ok(inner, `${label} must have a box`);
  const bounds = `inner=${JSON.stringify(inner)} outer=${JSON.stringify(outer)}`;
  assert.ok(inner.x >= outer.x - epsilon, `${label} must stay inside the left padding edge (${bounds})`);
  assert.ok(inner.y >= outer.y - epsilon, `${label} must stay inside the top padding edge (${bounds})`);
  assert.ok(
    inner.x + inner.width <= outer.x + outer.width + epsilon,
    `${label} must stay inside the right padding edge (${bounds})`,
  );
  assert.ok(
    inner.y + inner.height <= outer.y + outer.height + epsilon,
    `${label} must stay inside the bottom padding edge (${bounds})`,
  );
}

// --- clone(): deep, independent copies (foundation for word instantiation) ---

// --- caseTransform: applied in both measurement and painting ---

// --- word instantiation: real spoken words from a template + currentIndex ---

// --- cross-state geometry uses the generic property transition runtime ---

// --- ECS-native preset format (serialize <-> build round-trip) ---

function assertPropsEqual(a, b, where) {
  assert.equal(a.size, b.size, `${where}: prop count`);
  for (const [key, pa] of a) {
    const pb = b.get(key);
    assert.ok(pb, `${where}.${key}: missing in rebuilt`);
    assert.equal(pa.kind, pb.kind, `${where}.${key}: kind`);
    assert.deepEqual(pa.base, pb.base, `${where}.${key}: base`);
    assert.equal(pa.unit, pb.unit, `${where}.${key}: unit`);
    assert.equal(pa.squircle, pb.squircle, `${where}.${key}: squircle`);
    assert.deepEqual(pa.transition, pb.transition, `${where}.${key}: transition`);
    assert.equal(pa.runtimeOnly, pb.runtimeOnly, `${where}.${key}: runtimeOnly`);
  }
}

function assertComponentEqual(a, b, where) {
  assert.equal(a.type, b.type, `${where}: component type`);
  assertPropsEqual(a.props, b.props, where);
  assert.equal(a.components.length, b.components.length, `${where}: nested component count`);
  a.components.forEach((child, i) => assertComponentEqual(child, b.components[i], `${where}/${child.type}`));
}

function assertEntityEqual(a, b, where) {
  assert.equal(a.kind, b.kind, `${where}: entity kind`);
  assert.equal(a.id, b.id, `${where}: entity id`);
  assert.equal(a.forEntityId, b.forEntityId, `${where}: entity target`);
  assert.equal(a.components.length, b.components.length, `${where}: component count`);
  a.components.forEach((c, i) => assertComponentEqual(c, b.components[i], `${where}[${c.type}]`));
  assert.equal(a.effects.length, b.effects.length, `${where}: effect count`);
  a.effects.forEach((e, i) => {
    assert.equal(e.type, b.effects[i].type, `${where}: effect type`);
    assertPropsEqual(e.props, b.effects[i].props, `${where}!${e.type}`);
  });
  assert.equal(a.children.length, b.children.length, `${where}: child count`);
  a.children.forEach((ch, i) => assertEntityEqual(ch, b.children[i], `${where}>${ch.id}`));
}

module.exports = {
  assert,
  styleContextForEntity,
  ctx,
  insetEntries,
  generatePipeline,
  Property,
  TransitionRuntime,
  staticProperty,
  MAX_MOTION_BLUR_STEPS,
  interpolatorFor,
  BackgroundStyle,
  BackgroundEntity,
  FollowTarget,
  BorderRadius,
  Text,
  Layout,
  LayoutMotion,
  LayoutMotionRuntime,
  applyLayoutMotion,
  VerticalSpacer,
  HorizontalSpacer,
  SelfLayout,
  Transform,
  BorderEffect,
  BlendModeEffect,
  NoiseEffect,
  FlickerEffect,
  FisheyeEffect,
  VignetteEffect,
  GlowEffect,
  ShadowEffect,
  StrokeEffect,
  TypewriterEffect,
  WipeRevealEffect,
  GaussianBlurEffect,
  MotionBlurEffect,
  StreakEffect,
  CompositionArea,
  Page,
  Row,
  Word,
  Marker,
  ImageFlowEntity,
  MarkerBehavior,
  Image,
  ImageSequencer,
  offsetCollidingEndTimestamps,
  PaintOrder,
  ChildPaintOrder,
  paintOrderPropsFromConfig,
  childPaintOrderPropsFromConfig,
  resolveChildPaintOrders,
  resolvedZIndex,
  orderedChildGroups,
  collectResolvedPaintOrders,
  AnimationComponent,
  Video,
  VideoArea,
  Viewport,
  buildEcsTree,
  buildEcsTreeFromPreset,
  serializeEntityTree,
  buildProperty,
  layoutScene,
  contentBoxFromArea,
  renderScene,
  markerAppearance,
  renderEffectStack,
  renderWrappedEffect,
  renderLayeredEffectStack,
  Font,
  instantiateScene,
  instantiateStackedScene,
  wordStateFor,
  rowStateFor,
  applyCaseTransform,
  renderCaptionFrame,
  solidPaint,
  normalizeFillPattern,
  resolveFillPatternPaint,
  contentBounds,
  captureLayoutSnapshot,
  collectDebugFrame,
  collectDebugTransforms,
  contentClipBox,
  resolveTransformPivot,
  defaultResolveContext,
  prepareAnimationContext,
  prepareTransitionContext,
  prepareFollowContext,
  resolveFollowTarget,
  resolveTrackTarget,
  createFollowRuntime,
  createTransitionRuntime,
  resolveFollowMode,
  BUILTIN_IMAGE_ASSET_DEFINITIONS,
  builtinImageDefinition,
  builtinImageSvg,
  cursorAssetForPreset,
  cursorAssetsInScene,
  cursorAssetSource,
  CURSOR_PRESET_DEFINITIONS,
  cursorSvg,
  normalizeCursorColorMode,
  normalizePaint,
  imageAssetState,
  loadImageAsset,
  loadedImageAsset,
  createDefaultCaptionLayoutPolicy,
  DEFAULT_CAPTION_WORD_WRAP_OVERFLOW_TOLERANCE,
  DEFAULT_LONG_WORD_THRESHOLD_SECONDS,
  resolveLongWordThreshold,
  CAPTION_BREAK_TIMING_PRESETS,
  captionBreakTimingPresetFor,
  directionForLanguage,
  directionForText,
  resolveTextDirection,
  segmentCaptionText,
  segmentCaptionWords,
  allocateCaptionPages,
  validateCaptionLayoutForPage,
  validateCaptionLayoutPolicy,
  validateCaptionLayoutOverride,
  mergeCaptionLayoutPolicy,
  minimumWrappedWordWidth,
  wrapCaptionTimedWords,
  wrapOversizedCaptionRows,
  resolveRowFontScale,
  rowFitWidthForWrapping,
  diagnoseCaptionPageOverflow,
  normalizeStateWindowConfig,
  clampFixedCount,
  ensureComponentDefaults,
  ensureEffectDefaults,
  resolveAdaptiveSequenceTiming,
  refreshDependentGeometry,
  ReplicatorEffect,
  applyStrokeStyle,
  strokePathWithStyle,
  drawImageOutline,
  generateSubtitleImagesEcs,
  buildRoundedUnionPath,
  Canvas,
  os,
  ARTIFACT_DIR,
  ECS_PRESET_NAMES,
  canonicalVideoArea,
  canonicalViewport,
  dumpPng,
  renderWord,
  countOpaquePixels,
  opaqueBounds,
  hasColor,
  hasPixelPair,
  loadEcsPreset,
  renderWithEffects,
  countPartialPixels,
  opaqueWidth,
  makeWord,
  makeLine,
  fixedDimensionsTransform,
  childrenAlignmentLayout,
  makeFixedLine,
  layoutFixedLine,
  separatedGap,
  assertBoxWithin,
  assertPropsEqual,
  assertComponentEqual,
  assertEntityEqual,
};
