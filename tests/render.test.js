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
  renderEffectStack,
  renderWrappedEffect,
  renderLayeredEffectStack,
  Font,
  instantiateScene,
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
    test('renderScene: entity replicator applies custom fills to virtual copies', () => {
      const word = new Word('word:replicator');
      word.box = { x: 120, y: 40, width: 180, height: 70 };
      word.text = 'AB';
      word.addComponent(
        new Font(
          new Map([
            ['family', staticProperty('fontFamily', ['Arimo', 'sans-serif'])],
            ['size', staticProperty('number', 48)],
            ['weight', staticProperty('string', 'bold')],
          ]),
        ),
      );
      word.addComponent(new Text(new Map([['color', staticProperty('paint', solidPaint('white'))]])));
      word.addEffect(
        new ReplicatorEffect(
          new Map([
            ['appliesOn', staticProperty('string', 'base')],
            ['enabled', staticProperty('boolean', true)],
            ['showOriginal', staticProperty('string', 'front')],
            ['cloneCount', staticProperty('number', 3)],
            ['fillMode', staticProperty('string', 'custom')],
            [
              'customFills',
              staticProperty('array', [solidPaint('#ff0000'), solidPaint('#0000ff'), solidPaint('#00ff00')]),
            ],
            ['position', staticProperty('vector2', { x: 8, y: 0 })],
          ]),
        ),
      );

      const canvas = new Canvas(420, 160);
      renderScene(word, canvas.getContext('2d'), ctx());
      const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);

      assert.ok(
        hasColor(data, (r, g, b) => r > 220 && g < 60 && b < 60),
        'expected red clone pixels',
      );
      assert.ok(
        hasColor(data, (r, g, b) => r < 60 && g < 60 && b > 220),
        'expected blue clone pixels',
      );
      assert.ok(
        hasColor(data, (r, g, b) => r < 60 && g > 180 && b < 60),
        'expected green clone pixels',
      );
    });
  },

  () => {
    test('BackgroundStyle: procedural path shapes render inside resolved bounds', () => {
      const shapes = ['rounded', 'pill', 'iMessage', 'ticket', 'cloud', 'comicBook'];
      const renderPixels = (shape, width, height, textDirection = 'ltr', tailSide = 'auto', tailSize = 1) => {
        const word = new Word(`path-${shape}-${width}`);
        word.box = { x: 0, y: 0, width, height };
        word.addComponent(
          new BackgroundStyle(
            new Map([
              ['pathShape', staticProperty('string', shape)],
              ['tailSide', staticProperty('string', tailSide)],
              ['tailSize', staticProperty('number', tailSize)],
              ['fill', staticProperty('paint', solidPaint('rgb(0,0,0)'))],
            ]),
          ),
        );
        const canvas = new Canvas(width, height);
        const context = canvas.getContext('2d');
        renderScene(word, context, ctx({ textDirection }));
        const data = context.getImageData(0, 0, width, height).data;
        return { data, width, height };
      };
      const opaquePixels = (...args) => {
        const { data } = renderPixels(...args);
        let count = 0;
        for (let index = 3; index < data.length; index += 4) {
          if (data[index] > 0) count += 1;
        }
        return count;
      };
      const tailPixels = (shape, width, height, tailSide, tailSize = 1, regionSide = tailSide) => {
        const { data } = renderPixels(shape, width, height, 'ltr', tailSide, tailSize);
        const startX = regionSide === 'right' ? Math.floor(width * 0.6) : 0;
        const endX = regionSide === 'right' ? width : Math.ceil(width * 0.4);
        const startY = Math.floor(height * 0.8);
        let count = 0;
        for (let y = startY; y < height; y += 1) {
          for (let x = startX; x < endX; x += 1) {
            if (data[(y * width + x) * 4 + 3] > 0) count += 1;
          }
        }
        return count;
      };

      for (const shape of shapes) {
        assert.ok(opaquePixels(shape, 120, 80) > 500, `${shape} paints a visible path`);
      }
      const largerTail = tailPixels('iMessage', 160, 100, 'right', 1.8);
      const smallerTail = tailPixels('iMessage', 160, 100, 'right', 0.5);
      assert.notEqual(
        largerTail,
        smallerTail,
        `iMessage tail size changes the tail footprint (${smallerTail} vs ${largerTail})`,
      );
      const leftMessage = renderPixels('iMessage', 160, 100, 'ltr', 'left');
      const rightMessage = renderPixels('iMessage', 160, 100, 'ltr', 'right');
      const alphaAt = (rendered, x, y) => rendered.data[(y * rendered.width + x) * 4 + 3];
      assert.ok(alphaAt(leftMessage, 80, 99) > 0, 'iMessage keeps the body filled along the bottom edge');
      assert.ok(alphaAt(rightMessage, 80, 99) > 0, 'mirrored iMessage keeps the body filled along the bottom edge');
      assert.ok(alphaAt(leftMessage, 0, 97) > 0, 'iMessage keeps the supplied left tail silhouette');
      assert.ok(alphaAt(rightMessage, 159, 97) > 0, 'mirrored iMessage keeps the supplied right tail silhouette');
      const autoLeftMessage = renderPixels('iMessage', 160, 100, 'ltr', 'auto');
      const autoRightMessage = renderPixels('iMessage', 160, 100, 'rtl', 'auto');
      assert.ok(alphaAt(autoLeftMessage, 0, 97) > 0, 'iMessage auto selects a left tail for LTR text');
      assert.ok(alphaAt(autoRightMessage, 159, 97) > 0, 'iMessage auto selects a right tail for RTL text');
    });
  },

  () => {
    test('BackgroundStyle: its own radius geometry renders without a standalone component', () => {
      const word = new Word('background-radius');
      word.box = { x: 0, y: 0, width: 60, height: 60 };
      word.addComponent(
        new BackgroundStyle(
          new Map([
            ['fill', staticProperty('paint', solidPaint('rgb(0,0,0)'))],
            ['borderRadius', staticProperty('number', 24)],
            ['borderTopLeftRadius', staticProperty('number', 24)],
            ['borderTopRightRadius', staticProperty('number', 24)],
            ['borderBottomRightRadius', staticProperty('number', 24)],
            ['borderBottomLeftRadius', staticProperty('number', 24)],
          ]),
        ),
      );

      const canvas = new Canvas(60, 60);
      const context = canvas.getContext('2d');
      renderScene(word, context, ctx());

      assert.equal(context.getImageData(1, 1, 1, 1).data[3], 0);
      assert.ok(context.getImageData(30, 30, 1, 1).data[3] > 0);
    });
  },

  () => {
    test('BackgroundStyle clipToOwner limits paint to the owner frame', () => {
      const render = (overflowMode) => {
        const root = new CompositionArea('compositionArea');
        root.box = { x: 0, y: 0, width: 100, height: 100 };
        const background = new BackgroundStyle(
          new Map([
            ['fill', staticProperty('paint', solidPaint('rgb(255,0,0)'))],
            ['overflowMode', staticProperty('string', overflowMode)],
          ]),
        );
        background.box = { x: -40, y: -40, width: 180, height: 180 };
        root.addComponent(background);

        const canvas = new Canvas(140, 140);
        const context = canvas.getContext('2d');
        renderScene(root, context, ctx());
        return context.getImageData(0, 0, 140, 140).data;
      };
      const alphaAt = (data, x, y) => data[(y * 140 + x) * 4 + 3];

      const visible = render('visible');
      const clipped = render('clipToOwner');
      assert.ok(alphaAt(visible, 10, 10) > 0);
      assert.ok(alphaAt(visible, 120, 120) > 0);
      assert.ok(alphaAt(clipped, 10, 10) > 0);
      assert.equal(alphaAt(clipped, 120, 120), 0);
    });
  },

  () => {
    test('BackgroundStyle clipToOwner keeps stable crop bounds inside the owner frame', () => {
      const getBounds = (overflowMode) => {
        const root = new CompositionArea('compositionArea');
        root.box = { x: 0, y: 0, width: 100, height: 100 };
        const background = new BackgroundStyle(
          new Map([
            ['fill', staticProperty('paint', solidPaint('rgb(255,0,0)'))],
            ['overflowMode', staticProperty('string', overflowMode)],
          ]),
        );
        background.box = { x: -40, y: -40, width: 180, height: 180 };
        root.addComponent(background);
        return contentBounds(root, ctx());
      };

      assert.deepEqual(getBounds('visible'), { x: -40, y: -40, width: 180, height: 180 });
      assert.deepEqual(getBounds('clipToOwner'), { x: 0, y: 0, width: 100, height: 100 });
    });
  },

  () => {
    test('BackgroundStyle union dynamically clamps close stair-step corners', () => {
      const rows = [
        { left: 10, top: 10, right: 100, bottom: 60 },
        { left: 45, top: 58, right: 85, bottom: 108 },
      ];
      for (const squircle of [false, true]) {
        const canvas = new Canvas(120, 130);
        const context = canvas.getContext('2d');
        const path = buildRoundedUnionPath(
          rows,
          {
            radii: { topLeft: 40, topRight: 40, bottomRight: 40, bottomLeft: 40 },
            squircle: { topLeft: squircle, topRight: squircle, bottomRight: squircle, bottomLeft: squircle },
          },
          40,
        );
        context.fillStyle = '#000000';
        context.fill(path);

        assert.equal(context.getImageData(50, 55, 1, 1).data[3], 255);
        assert.equal(context.getImageData(60, 65, 1, 1).data[3], 255);
        assert.equal(context.getImageData(50, 100, 1, 1).data[3], 255);
      }
    });
  },

  () => {
    test('BackgroundStyle union keeps merged stair-step handoffs symmetric', () => {
      const rows = [
        { left: 10, top: 10, right: 130, bottom: 60 },
        { left: 40, top: 58, right: 100, bottom: 110 },
      ];
      for (const squircle of [false, true]) {
        const canvas = new Canvas(140, 140);
        const context = canvas.getContext('2d');
        const path = buildRoundedUnionPath(
          rows,
          {
            radii: { topLeft: 40, topRight: 40, bottomRight: 40, bottomLeft: 40 },
            squircle: { topLeft: squircle, topRight: squircle, bottomRight: squircle, bottomLeft: squircle },
          },
          40,
        );
        context.fillStyle = '#111111';
        context.fillRect(0, 0, 140, 140);
        context.fillStyle = '#000000';
        context.fill(path);
        const pixels = canvas.toBufferSync('raw', { colorType: 'rgba' });

        for (let y = 0; y < 140; y += 1) {
          for (let x = 0; x < 70; x += 1) {
            const leftOffset = (y * 140 + x) * 4;
            const rightOffset = (y * 140 + (139 - x)) * 4;
            assert.ok(
              [0, 1, 2, 3].every(
                (channel) => Math.abs(pixels[leftOffset + channel] - pixels[rightOffset + channel]) <= 5,
              ),
              `squircle=${squircle} must preserve left/right symmetry`,
            );
          }
        }
      }
    });
  },

  () => {
    test('renderScene skips entities with zero transform opacity', () => {
      const page = new Page('page');
      page.box = { x: 0, y: 0, width: 160, height: 80 };
      page.addComponent(new Transform(new Map([['opacity', staticProperty('number', 0)]])));
      page.addComponent(new BackgroundStyle(new Map([['fill', staticProperty('paint', solidPaint('rgb(255,0,0)'))]])));

      const blur = new GaussianBlurEffect(new Map([['blurRadius', staticProperty('number', 8)]]));
      let effectApplyCalls = 0;
      const originalApply = blur.apply.bind(blur);
      blur.apply = (...args) => {
        effectApplyCalls += 1;
        return originalApply(...args);
      };
      page.addEffect(blur);

      const canvas = new Canvas(160, 80);
      const context = canvas.getContext('2d');
      renderScene(page, context, ctx({}));
      const { data } = context.getImageData(0, 0, 160, 80);
      assert.equal(countOpaquePixels(data), 0);
      assert.equal(effectApplyCalls, 0);
    });
  },

  () => {
    test('BackgroundEntity owns required transform/backgroundStyle components and retains its target', () => {
      const background = new BackgroundEntity('background:compositionArea:0', 'compositionArea');
      assert.deepEqual(
        background.components.map((component) => component.type),
        ['transform', 'followTarget', 'backgroundStyle'],
      );
      assert.equal(background.getComponent('backgroundStyle').allowDisable, true);
      assert.equal(background.transform.positioning(ctx()), 'absolute');
      assert.equal(background.clone().forEntityId, 'compositionArea');
      assert.equal(background.clone().getComponent('backgroundStyle').type, 'backgroundStyle');

      const raw = canonicalViewport({
        entity: 'compositionArea',
        id: 'compositionArea',
        children: [
          {
            entity: 'background',
            id: 'background:compositionArea:0',
            forEntityId: 'compositionArea',
            components: [
              {
                component: 'transform',
                props: {
                  dimensions: { type: 'vector2', value: { x: 80, y: 40 } },
                },
              },
              {
                component: 'backgroundStyle',
                props: {
                  fill: { type: 'paint', value: solidPaint('red') },
                },
              },
            ],
          },
        ],
      });
      const root = buildEcsTree(raw);
      const parsed = root.findById('background:compositionArea:0');
      assert.ok(parsed instanceof BackgroundEntity);
      assert.equal(parsed.forEntityId, 'compositionArea');
      assert.equal(parsed.getComponent('backgroundStyle').getProp('fill').base.color, 'red');
      layoutScene(root, new Canvas(16, 16).getContext('2d'), defaultResolveContext({}), { width: 200, height: 100 });
      assert.deepEqual(parsed.box && { width: parsed.box.width, height: parsed.box.height }, { width: 80, height: 40 });
      assert.equal(parsed.resolvedTarget, null);

      const serialized = serializeEntityTree(root)
        .children.find((child) => child.entity === 'compositionArea')
        .children.find((child) => child.entity === 'background');
      assert.equal(serialized.forEntityId, 'compositionArea');
      assert.deepEqual(
        serialized.components.map((component) => component.component),
        ['transform', 'backgroundStyle'],
      );
    });
  },

  () => {
    test('BackgroundEntity requires Transform and BackgroundStyle components', () => {
      assert.throws(
        () =>
          buildEcsTree(
            canonicalViewport({
              entity: 'compositionArea',
              id: 'compositionArea',
              children: [{ entity: 'background', id: 'background:invalid', components: [] }],
            }),
          ),
        /background entity.*must declare a transform component/,
      );
    });
  },

  () => {
    test('ImageSequencer resolves continuous and trigger-driven frames generically', () => {
      const sequencer = new ImageSequencer(
        new Map([
          ['frames', staticProperty('array', ['frame-1', 'frame-2', 'frame-3'])],
          ['playbackMode', staticProperty('string', 'continuous')],
          ['frameRate', staticProperty('number', 2)],
          ['loop', staticProperty('boolean', true)],
          ['endBehavior', staticProperty('string', 'hold')],
        ]),
      );
      assert.equal(sequencer.asset(defaultResolveContext({ elapsedSeconds: 0.1 })), 'frame-1');
      assert.equal(sequencer.asset(defaultResolveContext({ elapsedSeconds: 0.6 })), 'frame-2');
      assert.equal(sequencer.asset(defaultResolveContext({ elapsedSeconds: 1.6 })), 'frame-1');

      sequencer.getProp('playbackMode').setBase('onTrigger');
      sequencer.getProp('endBehavior').setBase('loop');
      assert.equal(sequencer.asset(defaultResolveContext({ triggerIndex: 0 })), 'frame-1');
      assert.equal(sequencer.asset(defaultResolveContext({ triggerIndex: 2 })), 'frame-3');
      assert.equal(sequencer.asset(defaultResolveContext({ triggerIndex: 3 })), 'frame-1');
    });
  },

  () => {
    test('ImageSequencer offsets end triggers that collide with start timestamps', () => {
      const starts = [0, 7.08, 7.08];
      const ends = [7.08, 7.08, 8];

      assert.deepEqual(offsetCollidingEndTimestamps(ends, starts), [7.079, 7.079, 8]);
      assert.deepEqual(offsetCollidingEndTimestamps([0.3], [0.30000000000000004]), [0.299]);
    });
  },

  () => {
    test('ImageSequencer supports caption event trigger lists and legacy trigger values', () => {
      const triggers = [
        'currentWordStart',
        'currentWordEnd',
        'currentRowStart',
        'currentRowEnd',
        'currentPageStart',
        'currentPageEnd',
      ];
      const sequencer = new ImageSequencer(new Map([['trigger', staticProperty('array', triggers)]]));

      assert.deepEqual(sequencer.triggers(defaultResolveContext({})), triggers);

      sequencer.getProp('trigger').setBase('current');
      assert.deepEqual(sequencer.triggers(defaultResolveContext({})), ['currentWordStart']);

      sequencer.getProp('trigger').setBase('currentRowEnd');
      assert.deepEqual(sequencer.triggers(defaultResolveContext({})), ['currentRowEnd']);
    });
  },

  () => {
    test('ImageSequencer supports independent trigger advances and ping-pong end behavior', () => {
      const sequencer = new ImageSequencer(
        new Map([
          ['frames', staticProperty('array', ['frame-1', 'frame-2', 'frame-3'])],
          [
            'trigger',
            staticProperty('array', [
              { trigger: 'currentWordStart', advance: 'next' },
              { trigger: 'currentWordEnd', advance: 'none' },
            ]),
          ],
          ['playbackMode', staticProperty('string', 'onTrigger')],
          ['endBehavior', staticProperty('string', 'loop')],
        ]),
      );
      assert.deepEqual(sequencer.triggerRules(defaultResolveContext({})), [
        { trigger: 'currentWordStart', advance: 'next' },
        { trigger: 'currentWordEnd', advance: 'none' },
      ]);
      assert.deepEqual(sequencer.triggers(defaultResolveContext({})), ['currentWordStart', 'currentWordEnd']);
      assert.equal(
        sequencer.asset(
          defaultResolveContext({
            imageSequencerTriggerStates: new Map([
              [sequencer, { index: 0, elapsedSeconds: 0, framePosition: 1, advance: 'next' }],
            ]),
          }),
        ),
        'frame-2',
      );
      assert.equal(
        sequencer.asset(
          defaultResolveContext({
            imageSequencerTriggerStates: new Map([
              [sequencer, { index: 1, elapsedSeconds: 0, framePosition: 1, advance: 'none' }],
            ]),
          }),
        ),
        'frame-2',
      );

      const pingPong = new ImageSequencer(
        new Map([
          ['frames', staticProperty('array', ['frame-1', 'frame-2', 'frame-3'])],
          ['playbackMode', staticProperty('string', 'continuous')],
          ['frameRate', staticProperty('number', 1)],
          ['loop', staticProperty('boolean', false)],
          ['endBehavior', staticProperty('string', 'pingPong')],
        ]),
      );
      assert.deepEqual(
        [0, 1, 2, 3, 4, 5].map((elapsedSeconds) => pingPong.asset(defaultResolveContext({ elapsedSeconds }))),
        ['frame-1', 'frame-2', 'frame-3', 'frame-2', 'frame-1', 'frame-2'],
      );
    });
  },

  () => {
    test('ImageSequencer supports previous and stable random trigger advances', () => {
      const sequencer = new ImageSequencer(
        new Map([
          ['frames', staticProperty('array', ['frame-1', 'frame-2', 'frame-3'])],
          ['playbackMode', staticProperty('string', 'onTrigger')],
          ['advance', staticProperty('string', 'previous')],
          ['loop', staticProperty('boolean', false)],
        ]),
      );

      assert.equal(sequencer.asset(defaultResolveContext({ triggerIndex: 0 })), 'frame-3');
      assert.equal(sequencer.asset(defaultResolveContext({ triggerIndex: 1 })), 'frame-2');
      assert.equal(sequencer.asset(defaultResolveContext({ triggerIndex: 2 })), 'frame-1');
      assert.equal(sequencer.asset(defaultResolveContext({ triggerIndex: 3 })), 'frame-1');

      sequencer.getProp('advance').setBase('random');
      sequencer.getProp('playbackMode').setBase('perTrigger');
      const triggerStates = new Map([[sequencer, { index: 1, elapsedSeconds: 0 }]]);
      const atTrigger = defaultResolveContext({
        elapsedSeconds: 0,
        imageSequencerTriggerStates: triggerStates,
      });
      const afterTrigger = defaultResolveContext({
        elapsedSeconds: 0.75,
        imageSequencerTriggerStates: new Map([[sequencer, { index: 1, elapsedSeconds: 0.75 }]]),
      });
      assert.equal(sequencer.asset(atTrigger), sequencer.asset(afterTrigger));
    });
  },

  () => {
    test('ImageSequencer preserves explicit blank frames', () => {
      const sequencer = new ImageSequencer(
        new Map([
          ['frames', staticProperty('array', ['', 'frame-2'])],
          ['playbackMode', staticProperty('string', 'onTrigger')],
        ]),
      );

      assert.deepEqual(sequencer.frames(defaultResolveContext({ triggerIndex: 0 })), ['', 'frame-2']);
      assert.equal(sequencer.asset(defaultResolveContext({ triggerIndex: 0 })), '');
      assert.equal(sequencer.asset(defaultResolveContext({ triggerIndex: 1 })), 'frame-2');
    });
  },

  () => {
    test('disabled Image and ImageSequencer components skip rendering and frame resolution', () => {
      const word = new Word('disabled-image');
      word.box = { x: 0, y: 0, width: 40, height: 40 };
      const image = word.addComponent(
        new Image(
          new Map([
            ['enabled', staticProperty('boolean', false)],
            ['asset', staticProperty('string', 'music-note')],
          ]),
        ),
      );
      const sequencer = word.addComponent(
        new ImageSequencer(
          new Map([
            ['enabled', staticProperty('boolean', false)],
            ['frames', staticProperty('array', ['frame-1'])],
          ]),
        ),
      );

      assert.equal(sequencer.asset(defaultResolveContext({ elapsedSeconds: 1 })), undefined);
      const canvas = new Canvas(40, 40);
      const context = canvas.getContext('2d');
      renderScene(word, context, defaultResolveContext({}));
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const alphaPixels = pixels.filter((_, index) => index % 4 === 3 && pixels[index] > 0);
      assert.equal(image.isEnabled(defaultResolveContext({})), false);
      assert.equal(alphaPixels.length, 0);
    });
  },

  () => {
    test('Image renderOrder paints a parent image below or above its children', () => {
      const renderAtCenter = (renderOrder) => {
        const row = new Row('row');
        row.box = { x: 0, y: 0, width: 20, height: 20 };

        const word = new Word('word', '');
        word.box = { x: 0, y: 0, width: 20, height: 20 };
        word.addComponent(
          new BackgroundStyle(new Map([['fill', staticProperty('paint', solidPaint('rgb(255, 0, 0)'))]])),
        );
        row.addChild(word);

        const imageProps = new Map([
          ['asset', staticProperty('string', 'music-note')],
          ['colorMode', staticProperty('string', 'solid')],
        ]);
        if (renderOrder !== undefined) imageProps.set('renderOrder', staticProperty('string', renderOrder));
        row.addComponent(new Image(imageProps));

        const canvas = new Canvas(20, 20);
        const context = canvas.getContext('2d');
        renderScene(row, context, defaultResolveContext({}));
        return context.getImageData(0, 0, 20, 20).data;
      };

      const isImageBlue = (r, g, b) => r < 100 && g > 80 && b > 180;
      assert.equal(hasColor(renderAtCenter(undefined), isImageBlue), false);
      assert.equal(hasColor(renderAtCenter('belowChildren'), isImageBlue), false);
      assert.equal(hasColor(renderAtCenter('aboveChildren'), isImageBlue), true);
    });
  },

  () => {
    test('Image Tint preserves source shading while Solid replaces it', async () => {
      const sourceCanvas = new Canvas(2, 1);
      const sourceContext = sourceCanvas.getContext('2d');
      sourceContext.fillStyle = 'rgb(255, 255, 255)';
      sourceContext.fillRect(0, 0, 1, 1);
      sourceContext.fillStyle = 'rgb(128, 128, 128)';
      sourceContext.fillRect(1, 0, 1, 1);
      const asset = `data:image/png;base64,${sourceCanvas.toBufferSync('png').toString('base64')}`;
      assert.equal((await loadImageAsset(asset)).status, 'loaded');

      const image = new Image(
        new Map([
          ['assetSource', staticProperty('string', 'custom')],
          ['customAsset', staticProperty('string', asset)],
          ['colorMode', staticProperty('string', 'solid')],
          ['color', staticProperty('paint', solidPaint('rgb(255, 0, 0)'))],
        ]),
      );
      const owner = {
        kind: 'image',
        box: { x: 0, y: 0, width: 2, height: 1 },
        resolvedPaint: solidPaint('rgb(255, 0, 0)'),
      };
      const render = () => {
        const canvas = new Canvas(2, 1);
        const context = canvas.getContext('2d');
        context.translate(1, 0.5);
        image.paint(context, defaultResolveContext({}), owner);
        return context.getImageData(0, 0, 2, 1).data;
      };

      const solid = render();
      image.getProp('colorMode').setBase('tint');
      const tint = render();

      assert.deepEqual([...solid.slice(0, 4)], [255, 0, 0, 255]);
      assert.deepEqual([...solid.slice(4, 8)], [255, 0, 0, 255]);
      assert.deepEqual([...tint.slice(0, 4)], [255, 0, 0, 255]);
      assert.ok(tint[4] < solid[4], 'tint should preserve the source luminance');
      assert.equal(tint[5], 0);
      assert.equal(tint[6], 0);
    });
  },

  () => {
    test('Image assets expose safe built-in, SVG, and unsupported-source states', async () => {
      assert.equal(imageAssetState('music-note').status, 'loaded');
      const bundled = await loadImageAsset('music-note');
      assert.equal(bundled.status, 'loaded');
      assert.ok(loadedImageAsset('music-note'));
      const dialogSpeaker = await loadImageAsset('dialog-speaker');
      assert.equal(dialogSpeaker.status, 'loaded');
      assert.equal(loadedImageAsset('dialog-speaker')?.width, 64);
      assert.equal(loadedImageAsset('dialog-speaker')?.height, 64);
      const unsupported = await loadImageAsset('not-an-image-source');
      assert.equal(unsupported.status, 'unsupported');
      assert.equal(imageAssetState('not-an-image-source').status, 'unsupported');

      const svg = `data:image/svg+xml,${encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><script>alert(1)</script><rect width="8" height="8" fill="red"/></svg>',
      )}`;
      const loaded = await loadImageAsset(svg);
      assert.equal(loaded.status, 'loaded');
      assert.ok(loadedImageAsset(svg));
      const highResolution = await loadImageAsset(svg, { maxDimension: 64 });
      assert.equal(highResolution.status, 'loaded');
      assert.equal(loadedImageAsset(svg)?.width, 64);
    });
  },

  () => {
    test('Registered image assets expose valid SVG metadata', () => {
      assert.equal(BUILTIN_IMAGE_ASSET_DEFINITIONS.length, 51);
      assert.equal(new Set(BUILTIN_IMAGE_ASSET_DEFINITIONS.map((definition) => definition.id)).size, 51);

      for (const definition of BUILTIN_IMAGE_ASSET_DEFINITIONS) {
        assert.equal(builtinImageDefinition(definition.id), definition);
        assert.match(definition.svg, /<svg\b/);
        assert.ok(definition.tags.length > 0);
        assert.equal(builtinImageSvg(definition.id), definition.svg);
      }
    });
  },

  () => {
    test('render: BackgroundStyle resolves a linear Paint against its own box', () => {
      const { root } = makeLine([]);
      root.addComponent(
        new BackgroundStyle(
          new Map([
            ['enabled', staticProperty('boolean', true)],
            [
              'fill',
              staticProperty('paint', {
                type: 'linear-gradient',
                angle: 90,
                stops: [
                  { offset: 0, color: '#ff0000' },
                  { offset: 1, color: '#0000ff' },
                ],
              }),
            ],
          ]),
        ),
      );

      const width = 800;
      const height = 300;
      const canvas = new Canvas(width, height);
      const context = canvas.getContext('2d');

      layoutScene(root, context, defaultResolveContext({}), { width, height });
      renderScene(root, context, defaultResolveContext({}));

      const { data } = context.getImageData(0, 0, width, height);
      assert.ok(
        hasColor(data, (r, g, b) => r > 180 && b < 80),
        'expected the first gradient stop',
      );
      assert.ok(
        hasColor(data, (r, g, b) => b > 180 && r < 80),
        'expected the final gradient stop',
      );
    });
  },

  () => {
    test('render: linear gradient stop endpoints reach the top and bottom of its box', () => {
      const { root } = makeLine([]);
      root.addComponent(
        new BackgroundStyle(
          new Map([
            ['enabled', staticProperty('boolean', true)],
            [
              'fill',
              staticProperty('paint', {
                type: 'linear-gradient',
                angle: 0,
                stops: [
                  { offset: 0.45758929350698496, color: '#000000' },
                  { offset: 1, color: '#00000000' },
                ],
              }),
            ],
          ]),
        ),
      );

      const width = 800;
      const height = 300;
      const canvas = new Canvas(width, height);
      const context = canvas.getContext('2d');
      layoutScene(root, context, defaultResolveContext({}), { width, height });
      renderScene(root, context, defaultResolveContext({}));

      const { data } = context.getImageData(0, 0, width, height);
      const alphaAt = (x, y) => data[(y * width + x) * 4 + 3];
      assert.ok(alphaAt(width / 2, 0) < 8, 'the top edge should reach the transparent stop');
      assert.ok(alphaAt(width / 2, height - 1) > 247, 'the bottom edge should reach the opaque stop');
    });
  },

  () => {
    test('render: radial gradient radius one reaches the furthest box corner', () => {
      const { root } = makeLine([]);
      root.addComponent(
        new BackgroundStyle(
          new Map([
            ['enabled', staticProperty('boolean', true)],
            [
              'fill',
              staticProperty('paint', {
                type: 'radial-gradient',
                centerX: 0.5,
                centerY: 0.5,
                radius: 1,
                stops: [
                  { offset: 0, color: '#000000' },
                  { offset: 1, color: '#00000000' },
                ],
              }),
            ],
          ]),
        ),
      );

      const width = 800;
      const height = 300;
      const canvas = new Canvas(width, height);
      const context = canvas.getContext('2d');
      layoutScene(root, context, defaultResolveContext({}), { width, height });
      renderScene(root, context, defaultResolveContext({}));

      const { data } = context.getImageData(0, 0, width, height);
      const alphaAt = (x, y) => data[(y * width + x) * 4 + 3];
      assert.ok(alphaAt(0, 0) < 8, 'the furthest corner should reach the transparent stop');
      assert.ok(alphaAt(width / 2, height / 2) > 247, 'the gradient center should remain opaque');
    });
  },

  () => {
    test('Text letterSpacing changes measured and painted width while zero preserves the default', () => {
      const createWord = (id, letterSpacing) => {
        const word = new Word(id);
        word.text = 'ABCD';
        word.addComponent(
          new Text(
            letterSpacing === undefined
              ? undefined
              : new Map([['letterSpacing', staticProperty('number', letterSpacing)]]),
          ),
        );
        return word;
      };
      const context = new Canvas(16, 16).getContext('2d');
      context.font = 'bold 80px sans-serif';
      const rctx = defaultResolveContext({});
      const defaultText = createWord('word:default-spacing').getComponent('text');
      const zeroText = createWord('word:zero-spacing', 0).getComponent('text');
      const tightText = createWord('word:tight-spacing', -4).getComponent('text');
      const spacedText = createWord('word:spaced', 12).getComponent('text');

      assert.equal(defaultText.measure(context, rctx, 'ABCD').width, zeroText.measure(context, rctx, 'ABCD').width);
      assert.ok(tightText.measure(context, rctx, 'ABCD').width < zeroText.measure(context, rctx, 'ABCD').width);
      assert.ok(spacedText.measure(context, rctx, 'ABCD').width > zeroText.measure(context, rctx, 'ABCD').width);

      const normalRender = renderWord(createWord('word:normal-render'), { width: 500, height: 240 });
      const spacedRender = renderWord(createWord('word:spaced-render', 12), { width: 500, height: 240 });
      dumpPng(spacedRender.canvas, 'text-letter-spacing.png');
      assert.ok(
        opaqueWidth(spacedRender.data, spacedRender.width, spacedRender.height) >
          opaqueWidth(normalRender.data, normalRender.width, normalRender.height),
      );
    });
  },

  () => {
    test('BackgroundStyle fill patterns keep single fill inactive', () => {
      assert.deepEqual(normalizeFillPattern({ type: 'pattern', pattern: 'single', colors: [], offset: 0 }), {
        type: 'pattern',
        pattern: 'single',
        colors: [],
        offset: 0,
      });
      assert.equal(
        resolveFillPatternPaint({ type: 'pattern', pattern: 'single', colors: ['#ff0000'], offset: 0 }, 0),
        undefined,
      );
      assert.equal(
        resolveFillPatternPaint({ type: 'pattern', pattern: 'cycle', colors: ['#ff0000', '#00ff00'], offset: 0 }, 2)
          .color,
        '#ff0000',
      );
      assert.equal(
        resolveFillPatternPaint(
          { type: 'pattern', pattern: 'alternate', colors: ['#ff0000', '#00ff00', '#0000ff'], offset: 0 },
          2,
        ).color,
        '#ff0000',
      );
    });
  },

  () => {
    test('pipeline renders Image Sequencer Word End frames after stable word frames', async () => {
      const preset = structuredClone(loadEcsPreset('avatar-dialogue.json'));
      const imageEntity = preset.design.children
        .flatMap((child) => child.children ?? [])
        .flatMap((child) => child.children ?? [])
        .find((child) => child.id === 'image:default');
      const transform = imageEntity?.components.find((component) => component.component === 'transform');
      if (transform?.props.rotation?.randomizer) delete transform.props.rotation.randomizer;
      const result = await generateSubtitleImagesEcs({
        videoResolution: { width: 1080, height: 1920 },
        timestamps: {
          words: ['ONE', 'TWO', 'ON', '✨'],
          word_start_times_seconds: [0, 1, 2, 2.08],
          word_end_times_seconds: [0.8, 1.8, 2.08, 2.2],
          break_before: [false, false, false, false],
        },
        design: preset.design,
        stateWindow: preset.stateWindow,
        captionLayout: preset.captionLayout,
        fps: 10,
        collectFrames: true,
        debug: true,
      });

      for (const captionInfo of result.captionInfos) {
        const firstFrame = result.allImageBuffers[captionInfo.startFrame];
        const lastFrame = result.allImageBuffers[captionInfo.startFrame + captionInfo.numFrames - 1];
        assert.ok(firstFrame);
        assert.ok(lastFrame);
        assert.notEqual(Buffer.compare(firstFrame, lastFrame), 0, `expected Word End frame for ${captionInfo.word}`);
      }

      const onInfo = result.captionInfos.find((captionInfo) => captionInfo.word === 'ON');
      const sparkleInfo = result.captionInfos.find((captionInfo) => captionInfo.word === '✨');
      assert.ok(onInfo);
      assert.ok(sparkleInfo);
      const imageTransform = result.debugLayout.frames[onInfo.startFrame].transforms.find(
        (candidate) => candidate.sourceId === 'image:default',
      );
      assert.ok(imageTransform);
      const imageWidth = Math.round(imageTransform.dimensions.x);
      const imageHeight = Math.round(imageTransform.dimensions.y);
      const imagePixels = (buffer, frameIndex) => {
        const frameTransform = result.debugLayout.frames[frameIndex].transforms.find(
          (candidate) => candidate.sourceId === 'image:default',
        );
        assert.ok(frameTransform);
        const x = Math.round(frameTransform.positionAnchor.x);
        const y = Math.round(frameTransform.positionAnchor.y);
        const pixels = Buffer.alloc(imageWidth * imageHeight * 4);
        for (let row = 0; row < imageHeight; row += 1) {
          buffer.copy(
            pixels,
            row * imageWidth * 4,
            ((y + row) * result.frameSize.width + x) * 4,
            ((y + row) * result.frameSize.width + x + imageWidth) * 4,
          );
        }
        return pixels;
      };
      assert.notEqual(
        Buffer.compare(
          imagePixels(result.allImageBuffers[onInfo.startFrame + onInfo.numFrames - 1], onInfo.startFrame),
          imagePixels(result.allImageBuffers[sparkleInfo.startFrame], sparkleInfo.startFrame),
        ),
        0,
        'expected the colliding Word End frame before the next Word Start frame',
      );
    });
  },

  () => {
    test('renderScene: page-scoped paint randomizers share one color across each Page', () => {
      const root = new CompositionArea('compositionArea');
      root.box = { x: 0, y: 0, width: 420, height: 180 };
      const palette = [solidPaint('red'), solidPaint('blue')];

      for (let pageIndex = 0; pageIndex < 2; pageIndex += 1) {
        const page = root.addChild(new Page(`page:${pageIndex}`));
        page.randomizerKey = `page:${pageIndex}`;
        page.box = { x: 0, y: pageIndex * 90, width: 420, height: 90 };
        const row = page.addChild(new Row(`row:${pageIndex}`));
        row.box = { x: 0, y: pageIndex * 90, width: 420, height: 90 };
        for (const [wordIndex, text] of ['A', 'B'].entries()) {
          const word = makeWord(`word:${pageIndex}:${wordIndex}`, text, { size: 70, color: 'white' });
          word.box = {
            x: wordIndex === 0 ? 70 : 280,
            y: pageIndex * 90 + 10,
            width: 100,
            height: 70,
          };
          word.getComponent('text').props.set(
            'color',
            buildProperty(
              {
                type: 'paint',
                value: solidPaint('white'),
                randomizer: {
                  mode: 'amongStable',
                  values: palette,
                  trigger: 'currentPageStart',
                  scope: 'page',
                },
              },
              `text.${pageIndex}.${wordIndex}.color`,
            ),
          );
          row.addChild(word);
        }
      }

      const canvas = new Canvas(420, 180);
      const context = canvas.getContext('2d');
      renderScene(root, context, defaultResolveContext({ randomizerTriggerIndexes: { currentPageStart: 0 } }), {
        ignoreContentClip: true,
      });
      const { data } = context.getImageData(0, 0, 420, 180);

      const countColor = (xStart, xEnd, yStart, yEnd, red, green, blue) => {
        let count = 0;
        for (let y = yStart; y < yEnd; y += 1) {
          for (let x = xStart; x < xEnd; x += 1) {
            const offset = (y * 420 + x) * 4;
            if (
              data[offset + 3] > 180 &&
              Math.abs(data[offset] - red) < 16 &&
              Math.abs(data[offset + 1] - green) < 16 &&
              Math.abs(data[offset + 2] - blue) < 16
            ) {
              count += 1;
            }
          }
        }
        return count;
      };

      const pageColors = [0, 1].map((pageIndex) => {
        const yStart = pageIndex * 90;
        const redPixels = countColor(0, 420, yStart, yStart + 90, 255, 0, 0);
        const bluePixels = countColor(0, 420, yStart, yStart + 90, 0, 0, 255);
        assert.notEqual(redPixels, bluePixels);
        return redPixels > bluePixels ? 'red' : 'blue';
      });
      assert.notEqual(pageColors[0], pageColors[1]);
    });

    test('Text: emoji runs use their configured font, scale, and baseline settings', () => {
      const font = new Font(
        new Map([
          ['family', staticProperty('fontFamily', ['sans-serif'])],
          ['size', staticProperty('number', 60)],
          ['emojis.family', staticProperty('fontFamily', ['monospace'])],
          ['emojis.sizeScale', staticProperty('number', 0.5)],
          ['emojis.alignmentMode', staticProperty('string', 'baseline')],
          ['emojis.baselineOffset', staticProperty('number', 0.1)],
        ]),
      );
      const text = new Text(new Map([['letterSpacing', staticProperty('number', 0)]]));
      text.components.push(font);
      const canvas = new Canvas(400, 160);
      const resolvedContext = defaultResolveContext();
      const measured = text.measure(canvas.getContext('2d'), resolvedContext, 'A😀');
      const emojiStyle = font.textRunStyle(resolvedContext, true);
      const normalStyle = font.textRunStyle(resolvedContext, false);

      assert.equal(normalStyle.font, '60px sans-serif');
      assert.equal(emojiStyle.font, '30px monospace');
      assert.equal(emojiStyle.baselineOffset, 6);
      assert.ok(measured.width > 0);
      assert.ok(measured.height > 0);
    });

    test('Font: emoji defaults use compact sizing and optical baseline treatment', () => {
      const font = new Font();
      const emojiStyle = font.textRunStyle(defaultResolveContext(), true);

      assert.equal(emojiStyle.font, '33px sans-serif');
      assert.ok(Math.abs(emojiStyle.baselineOffset + 1.98) < 0.000001);
      assert.equal(emojiStyle.alignment, 'optical');
    });

    test('Typewriter: emoji units keep mixed-font positions and metrics', () => {
      const font = new Font(
        new Map([
          ['family', staticProperty('fontFamily', ['sans-serif'])],
          ['size', staticProperty('number', 60)],
          ['emojis.family', staticProperty('fontFamily', ['monospace'])],
          ['emojis.sizeScale', staticProperty('number', 0.5)],
        ]),
      );
      const typewriter = new TypewriterEffect(new Map([['reveal', staticProperty('number', 1)]]));
      const canvas = new Canvas(400, 160);
      const layout = typewriter.buildLayout(
        canvas.getContext('2d'),
        defaultResolveContext(),
        'A👩‍💻',
        solidPaint('white'),
        0,
        (run) => font.textRunStyle(defaultResolveContext(), run.isEmoji),
      );

      assert.equal(layout.units.length, 2);
      assert.equal(layout.units[0].font, '60px sans-serif');
      assert.equal(layout.units[1].font, '30px monospace');
      assert.ok(layout.units[1].width > 0);
      assert.ok(layout.width > layout.units[1].width);
    });
  },
];

for (const registerTest of testRegistrations) registerTest();
