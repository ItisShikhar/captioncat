const test = require('node:test');

const {
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
} = require('./ecs-engine-test-helpers.js');

const testRegistrations = [
  () => {
    test('Property: static value resolves unchanged', () => {
      const color = staticProperty('paint', solidPaint('rgb(255,255,255)'));
      assert.deepEqual(color.resolve(ctx({ progress: 0 })), solidPaint('rgb(255,255,255)'));
      assert.deepEqual(color.resolve(ctx({ progress: 1 })), solidPaint('rgb(255,255,255)'));
    });
  },

  () => {
    test('Property: randomizer stays stable per logical entity and yields independent vector axes', () => {
      const value = buildProperty(
        {
          type: 'number',
          value: 0,
          randomizer: {
            enabled: true,
            seed: 0,
            values: [10, 20, 30, 40],
          },
        },
        'text.color',
      );
      const firstContext = ctx({ randomizerKey: 'word:0' });
      const secondContext = ctx({ randomizerKey: 'word:4' });
      const firstValue = value.resolve(firstContext);
      assert.equal(value.resolve(firstContext), firstValue);
      assert.notEqual(value.resolve(secondContext), firstValue);

      const perAppearance = buildProperty({
        type: 'number',
        value: 0,
        randomizer: { values: [10, 20, 30, 40], deterministic: false },
      });
      const firstAppearance = perAppearance.resolve(ctx({ randomizerKey: 'page:0', randomizerAppearanceIndex: 0 }));
      assert.equal(
        perAppearance.resolve(ctx({ randomizerKey: 'page:0', randomizerAppearanceIndex: 0 })),
        firstAppearance,
      );
      assert.ok(
        Array.from({ length: 8 }, (_, appearanceIndex) =>
          perAppearance.resolve(ctx({ randomizerKey: 'page:0', randomizerAppearanceIndex: appearanceIndex })),
        ).some((appearanceValue) => appearanceValue !== firstAppearance),
      );

      const deterministic = buildProperty({
        type: 'number',
        value: 0,
        randomizer: { values: [10, 20, 30, 40], deterministic: true },
      });
      assert.equal(
        deterministic.resolve(ctx({ randomizerKey: 'page:0', randomizerAppearanceIndex: 0 })),
        deterministic.resolve(ctx({ randomizerKey: 'page:0', randomizerAppearanceIndex: 1 })),
      );

      const vector = buildProperty({
        type: 'vector2',
        value: { x: 1, y: 1 },
        randomizer: {
          enabled: true,
          axes: {
            x: { values: [2] },
            y: { values: [3] },
          },
        },
      });
      assert.deepEqual(vector.resolve(ctx({ randomizerKey: 'word:0' })), { x: 2, y: 3 });

      const inheritedVector = buildProperty({
        type: 'vector2',
        value: { x: 1, y: 1 },
        randomizer: {
          trigger: 'everyFrame',
          axes: {
            x: { values: [2, 4] },
            y: { values: [3, 5] },
          },
        },
      });
      const inheritedVectorValues = [0, 1, 2, 3].map((frameIndex) => inheritedVector.resolve(ctx({ frameIndex })));
      assert.ok(new Set(inheritedVectorValues.map((value) => JSON.stringify(value))).size > 1);

      const inheritedRect = buildProperty({
        type: 'rect',
        value: { x: 1, y: 1, width: 10, height: 10 },
        randomizer: {
          trigger: 'everyFrame',
          axes: {
            x: { values: [2, 4] },
            y: { values: [3, 5] },
          },
        },
      });
      const inheritedRectValues = [0, 1, 2, 3].map((frameIndex) => inheritedRect.resolve(ctx({ frameIndex })));
      assert.ok(new Set(inheritedRectValues.map((value) => JSON.stringify(value))).size > 1);

      const animated = buildProperty({
        type: 'number',
        value: 0,
        randomizer: { values: [7] },
      });
      assert.equal(animated.resolve(ctx({ randomizerKey: 'word:0' })), 7);
      assert.equal(animated.resolve(ctx({ transitionOverrides: new Map([[animated, 8]]) })), 8);
      assert.equal(animated.resolve(ctx({ animationOverrides: new Map([[animated, 9]]) })), 9);

      const colors = buildProperty({
        type: 'paint',
        value: solidPaint('white'),
        randomizer: {
          values: [solidPaint('cyan'), solidPaint('magenta'), solidPaint('lime'), solidPaint('yellow')],
        },
      });
      let previousColor;
      for (let index = 0; index < 32; index += 1) {
        const color = colors.resolve(ctx({ randomizerKey: `word:${index}` }));
        if (previousColor !== undefined) assert.notDeepEqual(color, previousColor);
        previousColor = color;
      }
    });
  },

  () => {
    test('Property: randomizer trigger modes control when values are sampled', () => {
      const allCaptionTriggerIndexes = (index) => ({
        currentWordStart: index,
        currentWordEnd: index,
        currentRowStart: index,
        currentRowEnd: index,
        currentPageStart: index,
        currentPageEnd: index,
      });
      const eventTriggers = [
        'currentWordStart',
        'currentWordEnd',
        'currentRowStart',
        'currentRowEnd',
        'currentPageStart',
        'currentPageEnd',
      ];

      const onStart = buildProperty({
        type: 'number',
        value: 0,
        randomizer: { trigger: 'onStart', range: [0, 1] },
      });
      assert.equal(
        onStart.resolve(ctx({ frameIndex: 0, randomizerTriggerIndexes: allCaptionTriggerIndexes(0) })),
        onStart.resolve(ctx({ frameIndex: 8, randomizerTriggerIndexes: allCaptionTriggerIndexes(8) })),
      );

      const wordEnd = buildProperty({
        type: 'number',
        value: 0,
        randomizer: { trigger: 'currentWordEnd', range: [0, 1] },
      });
      assert.notEqual(
        wordEnd.resolve(ctx({ randomizerTriggerIndexes: allCaptionTriggerIndexes(-1) })),
        wordEnd.resolve(ctx({ randomizerTriggerIndexes: allCaptionTriggerIndexes(0) })),
      );

      const everyFrame = buildProperty({
        type: 'number',
        value: 0,
        randomizer: { trigger: 'everyFrame', range: [0, 1] },
      });
      assert.ok(
        new Set(
          Array.from({ length: 8 }, (_, frameIndex) =>
            everyFrame.resolve(ctx({ frameIndex, randomizerTriggerIndexes: allCaptionTriggerIndexes(0) })),
          ),
        ).size > 1,
      );

      for (const trigger of eventTriggers) {
        const property = buildProperty({
          type: 'number',
          value: 0,
          randomizer: { trigger, range: [0, 1] },
        });
        const values = [0, 1, 2, 3].map((index) =>
          property.resolve(ctx({ randomizerTriggerIndexes: allCaptionTriggerIndexes(index) })),
        );
        assert.ok(new Set(values).size > 1, trigger);
      }

      const legacy = buildProperty({
        type: 'number',
        value: 0,
        randomizer: { updateEveryFrame: true, range: [0, 1] },
      });
      assert.equal(legacy.randomizer.trigger, 'everyFrame');
      assert.equal(legacy.randomizer.updateEveryFrame, undefined);

      const perAppearancePair = buildProperty({
        type: 'number',
        value: 0,
        randomizer: { values: [10, 20], deterministic: false },
      });
      let previousAppearanceValue;
      for (let appearanceIndex = 0; appearanceIndex < 8; appearanceIndex += 1) {
        const appearanceValue = perAppearancePair.resolve(
          ctx({ randomizerKey: 'page:0', randomizerAppearanceIndex: appearanceIndex }),
        );
        if (previousAppearanceValue !== undefined) assert.notEqual(appearanceValue, previousAppearanceValue);
        previousAppearanceValue = appearanceValue;
      }

      const perFramePair = buildProperty({
        type: 'number',
        value: 0,
        randomizer: { trigger: 'everyFrame', values: [10, 20], deterministic: false },
      });
      const perFrameValues = Array.from({ length: 8 }, (_, frameIndex) =>
        perFramePair.resolve(ctx({ randomizerKey: 'page:0', frameIndex })),
      );
      for (let index = 1; index < perFrameValues.length; index += 1) {
        assert.notEqual(perFrameValues[index], perFrameValues[index - 1]);
      }

      const booleanPair = buildProperty({
        type: 'boolean',
        value: false,
        randomizer: { trigger: 'everyFrame', deterministic: false },
      });
      const booleanValues = Array.from({ length: 8 }, (_, frameIndex) =>
        booleanPair.resolve(ctx({ randomizerKey: 'page:0', frameIndex })),
      );
      for (let index = 1; index < booleanValues.length; index += 1) {
        assert.notEqual(booleanValues[index], booleanValues[index - 1]);
      }

      const onePossibleValue = buildProperty({
        type: 'number',
        value: 0,
        randomizer: { values: [7, 7], deterministic: false },
      });
      assert.equal(onePossibleValue.resolve(ctx({ randomizerKey: 'page:0', randomizerAppearanceIndex: 0 })), 7);
      assert.equal(onePossibleValue.resolve(ctx({ randomizerKey: 'page:0', randomizerAppearanceIndex: 1 })), 7);

      const invalid = buildProperty({
        type: 'number',
        value: 0,
        randomizer: { trigger: 'not-a-trigger' },
      });
      assert.equal(invalid.randomizer.trigger, 'onStart');
    });
  },

  () => {
    test('Property: paint randomizer supports generated, stable, unstable, and explicit per-frame modes', () => {
      const generated = buildProperty({
        type: 'paint',
        value: solidPaint('white'),
        randomizer: { mode: 'randomColor', seed: 1 },
      });
      const generatedWithDifferentSeed = buildProperty({
        type: 'paint',
        value: solidPaint('white'),
        randomizer: { mode: 'randomColor', seed: 999 },
      });
      const generatedContext = ctx({ randomizerKey: 'word:0', frameIndex: 0 });
      const generatedColor = generated.resolve(generatedContext);
      assert.equal(generatedColor.type, 'solid');
      assert.match(generatedColor.color, /^#[0-9a-f]{6}$/);
      assert.deepEqual(generatedColor, generatedWithDifferentSeed.resolve(generatedContext));

      const palette = [solidPaint('red'), solidPaint('blue'), solidPaint('green')];
      const unstable = buildProperty({
        type: 'paint',
        value: solidPaint('white'),
        randomizer: { mode: 'among', values: palette },
      });
      const initialColor = unstable.resolve(ctx({ randomizerKey: 'word:2', frameIndex: 0 }));
      assert.deepEqual(unstable.resolve(ctx({ randomizerKey: 'word:2', frameIndex: 1 })), initialColor);

      const stable = buildProperty({
        type: 'paint',
        value: solidPaint('white'),
        randomizer: { mode: 'amongStable', values: palette },
      });
      const stableColors = [0, 1, 2, 3].map((frameIndex) =>
        stable.resolve(ctx({ randomizerKey: 'word:2', frameIndex })),
      );
      assert.deepEqual(new Set(stableColors).size, 1);
      assert.ok(palette.some((value) => JSON.stringify(value) === JSON.stringify(stableColors[0])));

      const perFrame = buildProperty({
        type: 'paint',
        value: solidPaint('white'),
        randomizer: { mode: 'among', updateEveryFrame: true, values: palette },
      });
      const perFrameColors = [0, 1, 2, 3, 4, 5, 6, 7].map((frameIndex) =>
        perFrame.resolve(ctx({ randomizerKey: 'word:2', frameIndex })),
      );
      assert.ok(new Set(perFrameColors.map((value) => JSON.stringify(value))).size > 1);

      const generatedPerFrame = buildProperty({
        type: 'paint',
        value: solidPaint('white'),
        randomizer: { mode: 'randomColor', updateEveryFrame: true },
      });
      const generatedFrameColors = [0, 1, 2, 3].map((frameIndex) =>
        generatedPerFrame.resolve(ctx({ randomizerKey: 'word:2', frameIndex })),
      );
      assert.ok(new Set(generatedFrameColors.map((value) => JSON.stringify(value))).size > 1);

      const root = new CompositionArea('compositionArea');
      const row = root.addChild(new Row('row'));
      const word = row.addChild(new Word('word'));
      word.addComponent(
        new Text(
          new Map([
            [
              'color',
              buildProperty({
                type: 'paint',
                value: solidPaint('white'),
                randomizer: { mode: 'randomColor', seed: 42 },
              }),
            ],
          ]),
        ),
      );
      const serializedRandomizer =
        serializeEntityTree(root).children[0].children[0].components[0].props.color.randomizer;
      assert.equal('seed' in serializedRandomizer, false);
      const scoped = buildProperty({
        type: 'paint',
        value: solidPaint('white'),
        randomizer: { values: [solidPaint('red')], scope: 'page' },
      });
      word.getComponent('text').props.set('color', scoped);
      assert.equal(
        serializeEntityTree(root).children[0].children[0].components[0].props.color.randomizer.scope,
        'page',
      );
    });
  },

  () => {
    test('Property: mode selector fields reject randomizers and transitions', () => {
      const mode = buildProperty(
        {
          type: 'string',
          value: 'overlay',
          transition: { enabled: true, type: 'tween', durationSeconds: 1, easeType: 'linear' },
          randomizer: { values: ['flow', 'overlay'] },
        },
        'layoutMode',
      );

      assert.equal(mode.transition, undefined);
      assert.equal(mode.randomizer, undefined);
      assert.equal(mode.resolve(ctx({ randomizerKey: 'word:0' })), 'overlay');
    });
  },

  () => {
    test('Paint alpha is carried by color strings', () => {
      assert.deepEqual(
        normalizePaint({ type: 'solid', color: 'rgba(10, 20, 30, 0.5)', opacity: 0.25 }, solidPaint('#000000')),
        solidPaint('rgba(10, 20, 30, 0.5)'),
      );
      assert.deepEqual(
        normalizePaint(
          {
            type: 'linear-gradient',
            angle: 90,
            stops: [
              { offset: 0, color: 'rgba(255, 0, 0, 0.25)', opacity: 0.5 },
              { offset: 1, color: '#0000ff', opacity: 1 },
            ],
          },
          solidPaint('#000000'),
        ),
        {
          type: 'linear-gradient',
          angle: 90,
          stops: [
            { offset: 0, color: 'rgba(255, 0, 0, 0.25)' },
            { offset: 1, color: '#0000ff' },
          ],
        },
      );
    });
  },

  () => {
    test('Property: an animation override wins over the static base', () => {
      const opacity = staticProperty('number', 0);
      const overrides = new Map([[opacity, 0.5]]);
      assert.equal(opacity.resolve(ctx({ animationOverrides: overrides })), 0.5);
      assert.equal(opacity.resolve(ctx({})), 0);
    });
  },

  () => {
    test('Property: resolved engine values follow animation, transition, and follow precedence', () => {
      const value = staticProperty('number', 1);
      value.setResolvedValue(2);
      const transition = new Map([[value, 3]]);
      const follow = new Map([[value, 4]]);
      const animation = new Map([[value, 5]]);

      assert.equal(
        value.resolve(ctx({ animationOverrides: animation, transitionOverrides: transition, followOverrides: follow })),
        5,
      );
      assert.equal(value.resolve(ctx({ transitionOverrides: transition, followOverrides: follow })), 3);
      assert.equal(value.resolve(ctx({ followOverrides: follow })), 4);
      assert.equal(value.resolve(ctx({})), 2);
      value.clearResolvedValue();
      assert.equal(value.resolve(ctx({})), 1);
    });
  },

  () => {
    test('collectDebugTransforms exposes resolved property metadata and removes it after unlock', () => {
      const root = new CompositionArea('composition');
      root.box = { x: 0, y: 0, width: 200, height: 100 };
      const word = new Word('word');
      word.box = { x: 20, y: 20, width: 80, height: 24 };
      const position = staticProperty('vector2', { x: 0, y: 0 });
      word.addComponent(new Transform(new Map([['position', position]])));
      root.addChild(word);

      position.setResolvedValue({ x: 12, y: 18 });
      const resolved = collectDebugTransforms(root, ctx({})).find((transform) => transform.id === 'word');
      assert.deepEqual(resolved?.propertyOverrides?.['transform.position']?.value, { x: 12, y: 18 });

      position.clearResolvedValue();
      const unlocked = collectDebugTransforms(root, ctx({})).find((transform) => transform.id === 'word');
      assert.equal(unlocked?.propertyOverrides?.['transform.position'], undefined);
    });
  },

  () => {
    test('collectDebugTransforms locks row positions controlled by layout motion', () => {
      const root = new Page('page');
      root.box = { x: 0, y: 0, width: 200, height: 100 };
      root.addComponent(new LayoutMotion());
      const row = new Row('row');
      row.state = 'current';
      row.box = { x: 20, y: 30, width: 80, height: 24 };
      row.addComponent(new Transform(new Map([['position', staticProperty('vector2', { x: 0, y: 0 })]])));
      root.addChild(row);

      const resolved = collectDebugTransforms(root, ctx({})).find((transform) => transform.id === 'row');
      assert.deepEqual(resolved?.propertyOverrides?.['transform.position'], {
        value: { x: 20, y: 30 },
        source: 'Layout Motion',
        type: 'layout',
      });
      assert.equal(resolved?.drivenBy, 'Layout Motion');
    });
  },

  () => {
    test('collectDebugTransforms locks a row subtree controlled by current-word motion', () => {
      const root = new CompositionArea('composition');
      root.box = { x: 0, y: 0, width: 200, height: 100 };
      const row = new Row('row');
      row.box = { x: 20, y: 30, width: 120, height: 24 };
      row.addComponent(new LayoutMotion());
      row.addComponent(new Transform(new Map([['position', staticProperty('vector2', { x: 0, y: 0 })]])));
      const word = row.addChild(new Word('word'));
      word.state = 'current';
      word.box = { x: 30, y: 30, width: 40, height: 24 };
      word.addComponent(new Transform(new Map([['position', staticProperty('vector2', { x: 0, y: 0 })]])));
      root.addChild(row);

      const transforms = collectDebugTransforms(root, ctx({}));
      for (const id of ['row', 'word']) {
        const resolved = transforms.find((transform) => transform.id === id);
        assert.deepEqual(resolved?.propertyOverrides?.['transform.position'], {
          value: id === 'row' ? { x: 20, y: 30 } : { x: 30, y: 30 },
          source: 'Layout Motion',
          type: 'layout',
        });
        assert.equal(resolved?.drivenBy, 'Layout Motion');
      }
    });
  },

  () => {
    test('Property.maxNumber / maxVector cover the static base', () => {
      const n = staticProperty('number', -9);
      assert.equal(n.maxNumber(), 9);
      const v = staticProperty('vector2', { x: 3, y: 7 });
      assert.deepEqual(v.maxVector(), { x: 3, y: 7 });
    });
  },

  () => {
    test('Property: squircle leaf metadata survives build + clone', () => {
      const on = buildProperty({ type: 'number', value: 40, squircle: true });
      assert.equal(on.squircle, true);
      assert.equal(on.clone().squircle, true);
      const off = buildProperty({ type: 'number', value: 40, squircle: false });
      assert.equal(off.squircle, false);
      const unset = buildProperty({ type: 'number', value: 40 });
      assert.equal(unset.squircle, undefined);
    });
  },

  () => {
    test('paint order sorts every entity by numeric zIndex without changing child layout order', () => {
      const page = new Page('page');
      const back = page.addChild(new Row('back'));
      const front = page.addChild(new Row('front'));
      const middle = page.addChild(new Row('middle'));
      back.addComponent(new PaintOrder(paintOrderPropsFromConfig(-2)));
      front.addComponent(new PaintOrder(paintOrderPropsFromConfig(10)));
      middle.addComponent(new PaintOrder(paintOrderPropsFromConfig(3)));
      page.addComponent(
        new ChildPaintOrder(childPaintOrderPropsFromConfig({ mode: 'zIndex', direction: 'ascending' })),
      );

      assert.deepEqual(
        resolveChildPaintOrders(page, page.children, ctx({})).map((entry) => entry.child.id),
        ['back', 'middle', 'front'],
      );
      assert.deepEqual(
        page.children.map((child) => child.id),
        ['back', 'front', 'middle'],
      );
      assert.equal(resolveChildPaintOrders(page, page.children, ctx({}))[2].zIndex, 10);
    });
  },

  () => {
    test('child paint order defaults to descending authored source order', () => {
      const page = new Page('page');
      page.addChild(new Row('first'));
      page.addChild(new Row('second'));
      page.addComponent(new ChildPaintOrder());

      assert.deepEqual(page.getComponent('childPaintOrder').config, {
        mode: 'source',
        direction: 'descending',
        backZIndex: 0,
        frontZIndex: 1,
        start: 'back',
        values: [],
        offset: 0,
        seed: 0,
      });
      assert.deepEqual(
        resolveChildPaintOrders(page, page.children, ctx({})).map((entry) => entry.child.id),
        ['second', 'first'],
      );
    });
  },

  () => {
    test('paint order components support every physical entity kind', () => {
      const entities = [
        new Viewport('viewport'),
        new VideoArea('videoArea'),
        new Video('video'),
        new CompositionArea('compositionArea'),
        new Page('page'),
        new Row('row'),
        new ImageFlowEntity('image'),
        new Word('word'),
        new Marker('marker', {}, false),
        new BackgroundEntity('background', null, false),
      ];
      const expectedKinds = [
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
      ];
      assert.deepEqual(new PaintOrder().allowedEntities, expectedKinds);
      assert.deepEqual(new ChildPaintOrder().allowedEntities, expectedKinds);
      for (const entity of entities) {
        entity.addComponent(new PaintOrder(paintOrderPropsFromConfig(7)));
        entity.addComponent(new ChildPaintOrder());
        assert.equal(resolvedZIndex(entity, ctx({})), 7);
      }
    });
  },

  () => {
    test('paint order resolves state-specific zIndex values from the active property context', () => {
      const row = new Row('row');
      const zIndex = staticProperty('number', 0);
      row.addComponent(new PaintOrder(new Map([['zIndex', zIndex]])));
      const animationOverrides = new Map([[zIndex, 12]]);
      assert.equal(resolvedZIndex(row, ctx({ animationOverrides })), 12);
      assert.equal(resolvedZIndex(row, ctx({})), 0);
    });
  },

  () => {
    test('disabled paint order components do not resolve or apply ordering values', () => {
      const page = new Page('page');
      const first = page.addChild(new Row('first'));
      const second = page.addChild(new Row('second'));
      const paintOrder = first.addComponent(
        new PaintOrder(
          new Map([
            ['enabled', staticProperty('boolean', false)],
            ['zIndex', staticProperty('number', 12)],
          ]),
        ),
      );
      const childPaintOrder = page.addComponent(
        new ChildPaintOrder(
          new Map([
            ['enabled', staticProperty('boolean', false)],
            ['mode', staticProperty('string', 'custom')],
            ['values', staticProperty('array', [2, 1])],
          ]),
        ),
      );

      assert.equal(resolvedZIndex(first, ctx({})), 0);
      assert.deepEqual(
        resolveChildPaintOrders(page, page.children, ctx({})).map((entry) => entry.child),
        [first, second],
      );
      assert.equal(paintOrder.isEnabled(ctx({})), false);
      assert.equal(childPaintOrder.isEnabled(ctx({})), false);
    });
  },

  () => {
    test('paint order supports stable alternating, custom, and seeded random patterns', () => {
      const page = new Page('page');
      for (let index = 0; index < 4; index += 1) page.addChild(new Row(`row-${index}`));

      page.addComponent(
        new ChildPaintOrder(
          childPaintOrderPropsFromConfig({
            mode: 'alternate',
            backZIndex: 0,
            frontZIndex: 1,
            direction: 'ascending',
          }),
        ),
      );
      assert.deepEqual(
        resolveChildPaintOrders(page, page.children, ctx({})).map((entry) => entry.child.id),
        ['row-0', 'row-2', 'row-1', 'row-3'],
      );

      page.getComponent('childPaintOrder').props.set('mode', staticProperty('string', 'custom'));
      page.getComponent('childPaintOrder').props.set('values', staticProperty('array', [3, 1]));
      assert.deepEqual(
        resolveChildPaintOrders(page, page.children, ctx({})).map((entry) => entry.child.id),
        ['row-1', 'row-3', 'row-0', 'row-2'],
      );

      page.getComponent('childPaintOrder').props.set('mode', staticProperty('string', 'random'));
      page.getComponent('childPaintOrder').props.set('seed', staticProperty('number', 42));
      const firstRandomOrder = resolveChildPaintOrders(page, page.children, ctx({})).map((entry) => entry.child.id);
      const secondRandomOrder = resolveChildPaintOrders(page, page.children, ctx({})).map((entry) => entry.child.id);
      assert.deepEqual(secondRandomOrder, firstRandomOrder);
    });
  },

  () => {
    test('scene renderer paints overlapping siblings in resolved paint order', () => {
      class RecordingBackground extends BackgroundStyle {
        constructor(label, order) {
          super();
          this.label = label;
          this.order = order;
        }

        paintBox() {
          this.order.push(this.label);
        }
      }

      const order = [];
      const page = new Page('page');
      page.box = { x: 0, y: 0, width: 40, height: 40 };
      for (const [label, zIndex] of [
        ['front-authored-first', 10],
        ['back-authored-second', -10],
      ]) {
        const row = page.addChild(new Row(label));
        row.box = { x: 0, y: 0, width: 40, height: 40 };
        row.addComponent(new PaintOrder(paintOrderPropsFromConfig(zIndex)));
        row.addComponent(new RecordingBackground(label, order));
      }
      page.addComponent(
        new ChildPaintOrder(childPaintOrderPropsFromConfig({ mode: 'zIndex', direction: 'ascending' })),
      );

      renderScene(page, new Canvas(40, 40).getContext('2d'), ctx({}));
      assert.deepEqual(order, ['back-authored-second', 'front-authored-first']);
    });
  },

  () => {
    test('scene renderer does not treat percentage dimensions as pixel dimensions', () => {
      const word = makeWord('percentage-word', 'Scaling', { size: 80 });
      word.box = { x: 0, y: 0, width: 360, height: 100 };
      word.addComponent(
        new Transform(
          new Map([
            ['dimensions', staticProperty('vector2', { x: 50, y: 50 })],
            ['widthUnit', staticProperty('string', 'percent')],
            ['heightUnit', staticProperty('string', 'percent')],
          ]),
        ),
      );

      const canvas = new Canvas(360, 100);
      renderScene(word, canvas.getContext('2d'), ctx({}));

      const { data } = canvas.getContext('2d').getImageData(0, 0, 360, 100);
      const bounds = opaqueBounds(data, 360, 100);
      assert.ok(bounds.width > 150, 'percentage dimensions must not shrink the rendered word to half size');
    });
  },

  () => {
    test('marker render groups remain behind and in front of regular children', () => {
      const page = new Page('page');
      const regular = page.addChild(new Row('regular'));
      const inFront = page.addChild(new Marker('inFront', { renderOrder: 'inFront' }));
      const behind = page.addChild(new Marker('behind', { renderOrder: 'behind' }));
      regular.addComponent(new PaintOrder(paintOrderPropsFromConfig(100)));
      inFront.addComponent(new PaintOrder(paintOrderPropsFromConfig(-100)));
      behind.addComponent(new PaintOrder(paintOrderPropsFromConfig(1000)));
      page.addComponent(
        new ChildPaintOrder(childPaintOrderPropsFromConfig({ mode: 'zIndex', direction: 'ascending' })),
      );

      const groups = orderedChildGroups(page, ctx({}));
      assert.deepEqual(
        groups.belowMarkers.map((child) => child.id),
        ['behind'],
      );
      assert.deepEqual(
        groups.regularChildren.map((child) => child.id),
        ['regular'],
      );
      assert.deepEqual(
        groups.aboveMarkers.map((child) => child.id),
        ['inFront'],
      );

      const ranks = collectResolvedPaintOrders(page, ctx({}));
      assert.equal(ranks.get(behind).drawRank, 0);
      assert.equal(ranks.get(regular).drawRank, 1);
      assert.equal(ranks.get(inFront).drawRank, 2);
    });
  },

  () => {
    test('paint order components parse and serialize on entity nodes', () => {
      const design = {
        entity: 'viewport',
        id: 'viewport',
        components: [
          { component: 'paintOrder', props: { zIndex: { type: 'number', value: -4 } } },
          {
            component: 'childPaintOrder',
            props: {
              mode: { type: 'string', value: 'alternate' },
              direction: { type: 'string', value: 'descending' },
              backZIndex: { type: 'number', value: -1 },
              frontZIndex: { type: 'number', value: 5 },
              start: { type: 'string', value: 'front' },
            },
          },
        ],
        children: [
          {
            entity: 'videoArea',
            id: 'videoArea',
            components: [{ component: 'layout', props: { layoutMode: { type: 'string', value: 'overlay' } } }],
            children: [{ entity: 'video', id: 'video' }],
          },
          { entity: 'compositionArea', id: 'compositionArea' },
        ],
      };
      const tree = buildEcsTree(design);
      const serialized = serializeEntityTree(tree);
      const paintOrder = serialized.components.find((component) => component.component === 'paintOrder');
      const childPaintOrder = serialized.components.find((component) => component.component === 'childPaintOrder');
      assert.equal(paintOrder.props.zIndex.value, -4);
      assert.equal(childPaintOrder.props.mode.value, 'alternate');
      assert.equal(childPaintOrder.props.direction.value, 'descending');
      assert.equal(childPaintOrder.props.backZIndex.value, -1);
      assert.equal(childPaintOrder.props.frontZIndex.value, 5);
      assert.equal(childPaintOrder.props.start.value, 'front');
    });
  },

  () => {
    test('Component paint order is preserved as array order', () => {
      const word = new Word('w');
      const bg = word.addComponent(new BackgroundStyle());
      const text = word.addComponent(new Text());
      assert.deepEqual(
        word.components.map((c) => c.type),
        [bg.type, text.type],
      );
    });
  },

  () => {
    test('Property.clone: copies the static config', () => {
      const original = new Property({ kind: 'number', base: 7, unit: 'pt' });
      const copy = original.clone();
      assert.notEqual(copy, original);
      assert.equal(copy.base, 7);
      assert.equal(copy.resolve(ctx({})), 7);
    });
  },

  () => {
    test('Property: page-scoped randomizers share values within a page and change between pages', () => {
      const palette = [solidPaint('red'), solidPaint('blue')];
      const pageScoped = buildProperty({
        type: 'paint',
        value: solidPaint('white'),
        randomizer: {
          mode: 'amongStable',
          values: palette,
          trigger: 'currentPageStart',
          scope: 'page',
        },
      });
      const pageZeroWordA = pageScoped.resolve(
        ctx({
          randomizerKey: 'word:0',
          pageRandomizerKey: 'page:0',
          randomizerTriggerIndexes: { currentPageStart: 0 },
        }),
      );
      const pageZeroWordB = pageScoped.resolve(
        ctx({
          randomizerKey: 'word:1',
          pageRandomizerKey: 'page:0',
          randomizerTriggerIndexes: { currentPageStart: 0 },
        }),
      );
      const pageOneWord = pageScoped.resolve(
        ctx({
          randomizerKey: 'word:2',
          pageRandomizerKey: 'page:1',
          randomizerTriggerIndexes: { currentPageStart: 1 },
        }),
      );
      assert.deepEqual(pageZeroWordA, pageZeroWordB);
      assert.notDeepEqual(pageOneWord, pageZeroWordA);

      const entityScoped = buildProperty({
        type: 'paint',
        value: solidPaint('white'),
        randomizer: { mode: 'amongStable', values: palette, trigger: 'currentPageStart' },
      });
      assert.notDeepEqual(
        entityScoped.resolve(ctx({ randomizerKey: 'word:0', pageRandomizerKey: 'page:0' })),
        entityScoped.resolve(ctx({ randomizerKey: 'word:1', pageRandomizerKey: 'page:0' })),
      );

      const generatedColor = buildProperty({
        type: 'paint',
        value: solidPaint('white'),
        randomizer: { mode: 'randomColor', scope: 'page' },
      });
      assert.deepEqual(
        generatedColor.resolve(ctx({ randomizerKey: 'word:0', pageRandomizerKey: 'page:0' })),
        generatedColor.resolve(ctx({ randomizerKey: 'word:1', pageRandomizerKey: 'page:0' })),
      );

      const vector = buildProperty({
        type: 'vector2',
        value: { x: 0, y: 0 },
        randomizer: {
          scope: 'page',
          axes: {
            x: { values: [10, 20] },
            y: { values: [30, 40] },
          },
        },
      });
      assert.deepEqual(
        vector.resolve(ctx({ randomizerKey: 'word:0', pageRandomizerKey: 'page:0' })),
        vector.resolve(ctx({ randomizerKey: 'word:1', pageRandomizerKey: 'page:0' })),
      );

      const rowScoped = buildProperty({
        type: 'number',
        value: 0,
        randomizer: {
          mode: 'amongStable',
          values: [10, 20, 30, 40, 50, 60, 70, 80],
          scope: 'row',
        },
      });
      const rowZeroWordA = rowScoped.resolve(
        ctx({ randomizerKey: 'word:0', rowRandomizerKey: 'row:0', pageRandomizerKey: 'page:0' }),
      );
      const rowZeroWordB = rowScoped.resolve(
        ctx({ randomizerKey: 'word:1', rowRandomizerKey: 'row:0', pageRandomizerKey: 'page:0' }),
      );
      const rowOneWord = rowScoped.resolve(
        ctx({ randomizerKey: 'word:2', rowRandomizerKey: 'row:1', pageRandomizerKey: 'page:0' }),
      );
      assert.equal(rowZeroWordA, rowZeroWordB);
      assert.notEqual(rowOneWord, rowZeroWordA);
      assert.notEqual(
        rowScoped.resolve(ctx({ randomizerKey: 'word:0', pageRandomizerKey: 'page:0' })),
        rowScoped.resolve(ctx({ randomizerKey: 'word:1', pageRandomizerKey: 'page:0' })),
      );

      const template = makeLine([makeWord('template-word', 'T')]);
      const stateWindow = normalizeStateWindowConfig({
        previousWords: { mode: 'fixedCount', count: 1 },
        currentWords: { mode: 'fixedCount', count: 1 },
        nextWords: { mode: 'fixedCount', count: 1 },
        previousRows: { mode: 'fixedCount', count: 1 },
        currentRows: { mode: 'fixedCount', count: 1 },
        nextRows: { mode: 'fixedCount', count: 1 },
      });
      const generated = instantiateScene(template.root, {
        rows: [['A']],
        currentIndex: 0,
        pageIndex: 3,
        stateWindow,
      });
      const generatedWord = generated.children[0].children[0].children[0];
      assert.equal(generatedWord.pageRandomizerKey, 'page:3');
      assert.equal(generated.children[0].children[0].rowRandomizerKey, 'row:0');
      assert.equal(generatedWord.rowRandomizerKey, 'row:0');
      assert.equal(generatedWord.contextFor(ctx({ randomizerKey: 'word:0' })).pageRandomizerKey, 'page:3');
      assert.equal(generatedWord.contextFor(ctx({ randomizerKey: 'word:0' })).rowRandomizerKey, 'row:0');

      const multiRowScene = instantiateScene(template.root, {
        rows: [['A'], ['B']],
        currentIndex: 0,
        pageIndex: 3,
        stateWindow,
      });
      const multiRowPage = multiRowScene.children[0];
      assert.equal(multiRowPage.children[0].rowRandomizerKey, 'row:0');
      assert.equal(multiRowPage.children[0].children[0].rowRandomizerKey, 'row:0');
      assert.equal(multiRowPage.children[1].rowRandomizerKey, 'row:1');
      assert.equal(multiRowPage.children[1].children[0].rowRandomizerKey, 'row:1');

      const stackedScene = instantiateStackedScene(template.root, {
        pages: [[['A']], [['B']]],
        stateWindow,
      });
      assert.equal(stackedScene.children[0].pageRandomizerKey, 'page:0');
      assert.equal(stackedScene.children[1].pageRandomizerKey, 'page:1');
      assert.equal(stackedScene.children[0].children[0].rowRandomizerKey, 'row:0');
      assert.equal(stackedScene.children[1].children[0].rowRandomizerKey, 'row:1');
    });
  },
];

for (const registerTest of testRegistrations) registerTest();
