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
    test('Apple Music pause spacing adds a same-page verse gap without changing the row break', () => {
      const preset = loadEcsPreset('apple-music.json');
      const policy = validateCaptionLayoutPolicy({
        ...preset.captionLayout,
        rowsPerPage: { mode: 'fixed', count: 3 },
      });
      const groups = [
        [{ word: 'ONE', startTimestamp: 0, visualEndTimestamp: 0.2 }],
        [{ word: 'TWO', startTimestamp: 1.2, visualEndTimestamp: 1.4 }],
        [{ word: 'THREE', startTimestamp: 1.5, visualEndTimestamp: 1.7 }],
      ];
      const options = {
        policy,
        pageHeight: 80,
        rowSpacing: 10,
        rowHeight: () => 20,
        longWordThreshold: 0.5,
        pageBreakPauseThresholdSeconds: 10,
      };

      assert.equal(allocateCaptionPages(groups, options).length, 2);
      assert.equal(
        allocateCaptionPages(groups, {
          ...options,
          policy: validateCaptionLayoutPolicy({
            ...policy,
            breaking: {
              ...policy.breaking,
              pauseSpacing: { ...policy.breaking.pauseSpacing, enabled: false },
            },
          }),
        }).length,
        1,
      );
    });
  },

  () => {
    test('Apple Music pipeline applies pause spacing to later rows on the same page', async () => {
      const preset = loadEcsPreset('apple-music.json');
      const input = {
        videoResolution: { width: 640, height: 360 },
        timestamps: {
          words: ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'],
          word_start_times_seconds: [0, 0.5, 1, 2.2, 2.7, 3.2],
          word_end_times_seconds: [0.4, 0.9, 1.4, 2.6, 3.1, 3.6],
          break_before: [false, true, true, true, true, true],
        },
        design: preset.design,
        stateWindow: preset.stateWindow,
        captionLayout: preset.captionLayout,
        fps: 4,
        debug: true,
        collectFrames: false,
      };
      const pauseAwareResult = await generateSubtitleImagesEcs(input);
      const uniformResult = await generateSubtitleImagesEcs({
        ...input,
        captionLayout: {
          ...input.captionLayout,
          breaking: {
            ...input.captionLayout.breaking,
            pauseSpacing: {
              ...input.captionLayout.breaking.pauseSpacing,
              enabled: false,
            },
          },
        },
      });

      const rowTopDeltas = pauseAwareResult.debugLayout.frames.flatMap((frame, frameIndex) => {
        const pauseAwareRows = [...frame.rows].sort((a, b) => a.top - b.top);
        const uniformRows = [...uniformResult.debugLayout.frames[frameIndex].rows].sort((a, b) => a.top - b.top);
        assert.equal(pauseAwareRows.length, 6);
        assert.equal(uniformRows.length, pauseAwareRows.length);
        return pauseAwareRows.map((row, rowIndex) => row.top - uniformRows[rowIndex].top);
      });

      assert.ok(rowTopDeltas.some((delta) => delta > 24));
    });
  },

  () => {
    test('pipeline emits the stable Page crop before the first streamed frame', async () => {
      const preset = loadEcsPreset('apple-music.json');
      let startMetadata;
      let firstFrame;
      let hasReceivedFrame = false;
      const result = await generateSubtitleImagesEcs({
        videoResolution: { width: 640, height: 360 },
        timestamps: {
          words: ['ONE', 'TWO', 'THREE'],
          word_start_times_seconds: [0, 0.5, 1],
          word_end_times_seconds: [0.4, 0.9, 1.4],
          break_before: [false, false, false],
        },
        design: preset.design,
        stateWindow: preset.stateWindow,
        captionLayout: preset.captionLayout,
        fps: 4,
        debug: true,
        collectFrames: false,
        onStart: (metadata) => {
          assert.equal(hasReceivedFrame, false);
          startMetadata = metadata;
        },
        onFrame: (frame) => {
          hasReceivedFrame = true;
          firstFrame ??= frame;
        },
      });

      assert.ok(startMetadata?.stablePageCrop);
      assert.ok(startMetadata?.debugLayout?.compositionArea);
      assert.ok(firstFrame);
      assert.ok(firstFrame.debugFrame?.page);
      assert.deepEqual(result.stablePageCrop, startMetadata.stablePageCrop);
      assert.ok(result.stablePageCrop.width > 0 && result.stablePageCrop.height > 0);
    });
  },

  () => {
    test('PhysicalEntity: tree, component lookup, and self-margins', () => {
      const page = new Page('page');
      const layout = page.addComponent(new Layout());
      page.addComponent(new Transform());
      page.addEffect(new GaussianBlurEffect(new Map([['blurRadius', staticProperty('number', 6)]])));

      assert.equal(page.layout, layout);
      assert.ok(page.transform instanceof Transform);
      assert.deepEqual(page.getSelfMargins(ctx({})), { x: 6, y: 6 });

      const root = new CompositionArea('compositionArea');
      root.addChild(page).addChild(new Row('row')).addChild(new Word('word:current', 'hello'));
      const found = root.findById('word:current');
      assert.ok(found instanceof Word);
      assert.equal(found.text, 'hello');

      const kinds = [];
      root.traverse((entity) => kinds.push(entity.kind));
      assert.deepEqual(kinds, ['compositionArea', 'page', 'row', 'word']);
    });
  },

  () => {
    test('Text alpha inheritance follows the active style source', () => {
      const target = new Word('word:target');
      const targetText = target.addComponent(
        new Text(
          new Map([
            ['color', staticProperty('paint', solidPaint('rgba(255, 255, 255, 0)'))],
            ['effectsInheritBaseAlpha', staticProperty('boolean', true)],
          ]),
        ),
      );
      const source = new Word('word:source');
      source.addComponent(
        new Text(
          new Map([
            ['color', staticProperty('paint', solidPaint('white'))],
            ['effectsInheritBaseAlpha', staticProperty('boolean', false)],
          ]),
        ),
      );
      target.styleSources.default = source;

      const styledContext = styleContextForEntity(target, 'default', ctx());

      assert.equal(targetText.getProp('effectsInheritBaseAlpha').resolve(styledContext), false);
    });
  },

  () => {
    test('fill-width can grow a short row up to its configured maximum scale', () => {
      const line = layoutFixedLine(makeFixedLine([makeWord('word', 'OK', { size: 40 })]), {
        mode: 'fill-width',
        minScale: 0.5,
        maxScale: 1.25,
      });
      const word = line.row.children[0];

      assert.equal(line.row.box.width, 400);
      assert.equal(word.fontScale, 1.25);
      assert.ok(word.box.width > 0);
    });
  },

  () => {
    test('marker follow target recomputes its anchor and composes relative hop offsets', () => {
      const words = [makeWord('w0', 'ONE'), makeWord('w1', 'TWO'), makeWord('w2', 'THREE')];
      words[0].state = 'current';
      words[1].state = 'next';
      words[2].state = 'default';
      const { root, row } = makeLine(words);
      const marker = row.addChild(new Marker('marker:transition', { followTarget: 'currentWord', anchor: 'center' }));
      marker.transform.props.set(
        'position',
        buildProperty({
          type: 'vector2',
          value: { x: 0, y: 0 },
          transition: { enabled: true, type: 'tween', durationSeconds: 1, easeType: 'linear' },
        }),
      );
      const runtime = new TransitionRuntime();
      const canvas = new Canvas(16, 16);
      const layout = () =>
        layoutScene(root, canvas.getContext('2d'), defaultResolveContext({}), { width: 1000, height: 400 });
      const resolve = (time, relativeOffset = { x: 0, y: 0 }) => {
        const baseContext = defaultResolveContext({
          transitionRuntime: runtime,
          transitionTimeSeconds: time,
          relativeAnimationOffsets: new Map([[marker, relativeOffset]]),
        });
        const followContext = prepareFollowContext(root, baseContext);
        const context = prepareTransitionContext(root, followContext);
        return marker.transform.renderPosition(context, marker.layoutPosition, relativeOffset);
      };

      layout();
      const firstTarget = { ...marker.layoutPosition };
      resolve(0);

      words[0].state = 'previous';
      words[1].state = 'current';
      words[2].state = 'next';
      layout();
      const secondTarget = { ...marker.layoutPosition };
      resolve(0.5);
      const halfway = resolve(1, { x: 0, y: -20 });
      assert.notEqual(secondTarget.x, firstTarget.x);
      assert.equal(halfway.x, 0);
      assert.equal(halfway.y, -20);

      words[1].state = 'previous';
      words[2].state = 'current';
      layout();
      const thirdTarget = { ...marker.layoutPosition };
      resolve(1);
      const retargeted = resolve(1.5);
      assert.notEqual(thirdTarget.x, secondTarget.x);
      assert.equal(retargeted.x, 0);
    });
  },

  () => {
    test('timeline markers are instantiated only for the current row', () => {
      const preset = loadEcsPreset('karaoke-1.json');
      const findMarkerNode = (node) => {
        if (node?.id === 'marker:default') return node;
        for (const child of node?.children ?? []) {
          const match = findMarkerNode(child);
          if (match) return match;
        }
        return undefined;
      };
      const markerNode = findMarkerNode(preset.design);
      assert.ok(markerNode);
      const transform = markerNode.components.find((component) => component.component === 'transform');
      transform.props.scale = {
        type: 'vector2',
        value: { x: 1, y: 1 },
        randomizer: {
          enabled: true,
          mode: 'among',
          values: [1, -1],
          trigger: 'currentRowStart',
          scope: 'row',
        },
      };

      const template = buildEcsTreeFromPreset(preset);
      const scene = instantiateScene(template, {
        rows: [['ONE'], ['TWO'], ['THREE']],
        currentIndex: 1,
        stateWindow: preset.stateWindow,
      });
      const markers = [];
      let markerParent;
      const walk = (entity, parent) => {
        if (entity instanceof Marker) {
          markers.push(entity);
          markerParent = parent;
        }
        for (const child of entity.children) walk(child, entity);
      };
      walk(scene);

      assert.equal(markers.length, 1);
      assert.equal(markerParent?.state, 'current');
      assert.deepEqual(markers[0].transform.getProp('scale').randomizer.values, [1, -1]);
    });
  },

  () => {
    test('Marker target-state style uses the target color while preserving own color settings', () => {
      const words = [makeWord('w0', 'HELLO', { color: 'blue' })];
      words[0].state = 'current';
      const { root, row } = makeLine(words);
      const marker = row.addChild(
        new Marker('marker', {
          followTarget: 'currentWord',
          anchor: 'bottomCenter',
          styleSource: 'targetState',
          styleState: 'followTarget',
        }),
      );
      marker.getComponent('image').getProp('color').setBase(solidPaint('red'));

      const canvas = new Canvas(1000, 400);
      const context = canvas.getContext('2d');
      layoutScene(root, context, defaultResolveContext({}), { width: 1000, height: 400 });
      renderScene(root, context, defaultResolveContext({}));
      const data = canvas.toBufferSync('raw', { colorType: 'rgba' });

      assert.ok(
        hasColor(data, (r, g, b) => b > 100 && r < 100 && g < 100),
        'target style should paint blue',
      );
      assert.equal(
        hasColor(data, (r, g, b) => r > 140 && g < 80 && b < 80),
        false,
        'own red paint should not render',
      );
      assert.equal(marker.getComponent('image').getProp('color').base.color, 'red');
    });
  },

  () => {
    test('Marker behavior is restricted to one top-level component on marker entities', () => {
      assert.throws(() => new Row('row').addComponent(new MarkerBehavior()), /only be attached to a marker entity/);
      assert.throws(
        () =>
          buildEcsTree(
            canonicalViewport({
              entity: 'compositionArea',
              id: 'compositionArea',
              children: [
                {
                  entity: 'page',
                  id: 'page',
                  children: [
                    {
                      entity: 'row',
                      id: 'row',
                      components: [
                        { component: 'transform', props: { dimensions: { type: 'vector2', value: { x: 0, y: 0 } } } },
                        { component: 'markerBehavior' },
                      ],
                    },
                  ],
                },
              ],
            }),
          ),
        /only attach marker behavior to a marker entity/,
      );
      assert.throws(
        () =>
          buildEcsTree(
            canonicalViewport({
              entity: 'compositionArea',
              id: 'compositionArea',
              children: [
                {
                  entity: 'page',
                  id: 'page',
                  children: [
                    {
                      entity: 'row',
                      id: 'row',
                      components: [
                        { component: 'transform', props: { dimensions: { type: 'vector2', value: { x: 0, y: 0 } } } },
                      ],
                      children: [
                        {
                          entity: 'marker',
                          id: 'marker',
                          components: [{ component: 'markerBehavior' }, { component: 'markerBehavior' }],
                        },
                      ],
                    },
                  ],
                },
              ],
            }),
          ),
        /only contain one marker behavior component/,
      );
      assert.throws(
        () =>
          buildEcsTree(
            canonicalViewport({
              entity: 'compositionArea',
              id: 'compositionArea',
              children: [
                {
                  entity: 'page',
                  id: 'page',
                  children: [
                    {
                      entity: 'row',
                      id: 'row',
                      components: [
                        { component: 'transform', props: { dimensions: { type: 'vector2', value: { x: 0, y: 0 } } } },
                      ],
                      children: [
                        {
                          entity: 'marker',
                          id: 'marker',
                          components: [{ component: 'marker' }],
                        },
                      ],
                    },
                  ],
                },
              ],
            }),
          ),
        /obsolete/,
      );
    });
  },

  () => {
    test('Marker behavior is optional after its dependency cascade removes it', () => {
      const marker = {
        entity: 'marker',
        id: 'marker',
        components: [
          { component: 'transform', props: { dimensions: { type: 'vector2', value: { x: 32, y: 32 } } } },
          { component: 'image', props: { asset: { type: 'string', value: 'music-note' } } },
          {
            component: 'followTarget',
            props: {
              target: { type: 'string', value: 'parent' },
              anchor: { type: 'string', value: 'topCenter' },
              mappings: { type: 'array', value: [] },
            },
          },
        ],
      };
      const parsed = buildEcsTree(
        canonicalViewport({
          entity: 'compositionArea',
          id: 'compositionArea',
          children: [
            {
              entity: 'page',
              id: 'page',
              children: [
                {
                  entity: 'row',
                  id: 'row',
                  components: [
                    { component: 'transform', props: { dimensions: { type: 'vector2', value: { x: 0, y: 0 } } } },
                  ],
                  children: [marker],
                },
              ],
            },
          ],
        }),
      );
      const parsedMarker = parsed.find((entity) => entity.kind === 'marker');
      assert.ok(parsedMarker instanceof Marker);
      assert.equal(parsedMarker.markerBehavior, undefined);
      assert.deepEqual(
        parsedMarker.components.map((component) => component.type),
        ['transform', 'image', 'followTarget'],
      );
    });
  },

  () => {
    test('pipeline: right-aligned rows keep their visible edge after collapsed content is removed', async () => {
      const preset = loadEcsPreset('love-story.json');
      const words = ['one', 'two', 'three', 'four', 'five', 'six'];
      const starts = words.map((_, index) => index * 0.2);
      const ends = starts.map((start) => start + 0.15);
      const result = await generatePipeline({
        videoResolution: { width: 1080, height: 1920 },
        timestamps: {
          words,
          word_start_times_seconds: starts,
          word_end_times_seconds: ends,
        },
        design: structuredClone(preset.design),
        captionLayout: preset.captionLayout,
        stateWindow: preset.stateWindow,
        fps: 4,
        debug: true,
      });

      const settledFrame = result.captionInfos
        .map((info) => result.debugLayout.frames[info.startFrame + info.numFrames - 1])
        .filter((frame) => frame.rows.length > 1)
        .at(-1);

      assert.ok(settledFrame, 'expected a settled frame with multiple visible rows');
      const rightEdges = settledFrame.rows.map((row) => row.right);
      assert.ok(
        rightEdges.every((right) => Math.abs(right - rightEdges[0]) < 0.001),
        'visible rows must share the right alignment edge',
      );
    });
  },

  () => {
    test('Transform percentage dimensions resolve against the parent content box per axis', () => {
      const word = makeWord('percent', 'Percent', { size: 40 });
      const wordTransform = new Transform(
        new Map([
          ['dimensions', staticProperty('vector2', { x: 50, y: 25 })],
          ['widthUnit', staticProperty('string', '%')],
          ['heightUnit', staticProperty('string', '%')],
          ['widthMode', staticProperty('string', 'custom')],
          ['heightMode', staticProperty('string', 'custom')],
        ]),
      );
      word.addComponent(wordTransform);

      const { root, page, row } = makeLine([word]);
      page.addComponent(
        new Transform(
          new Map([
            ['dimensions', staticProperty('vector2', { x: 800, y: 400 })],
            ['widthMode', staticProperty('string', 'custom')],
            ['heightMode', staticProperty('string', 'custom')],
          ]),
        ),
      );
      row.addComponent(
        new Transform(
          new Map([
            ['dimensions', staticProperty('vector2', { x: 800, y: 200 })],
            ['widthMode', staticProperty('string', 'custom')],
            ['heightMode', staticProperty('string', 'custom')],
          ]),
        ),
      );

      layoutScene(root, new Canvas(16, 16).getContext('2d'), ctx(), { width: 800, height: 400 });

      assert.equal(wordTransform.widthUnit(ctx()), 'percent');
      assert.equal(wordTransform.heightUnit(ctx()), 'percent');
      assert.equal(wordTransform.resolvedAuthoredDimension('x', ctx(), 800), 400);
      assert.equal(wordTransform.resolvedAuthoredDimension('y', ctx(), 200), 50);
      assert.equal(word.box.width, 400);
      assert.equal(word.box.height, 50);
    });
  },

  () => {
    test('Transform percentage positions resolve against the parent content box per axis', () => {
      const root = new CompositionArea('compositionArea');
      root.addComponent(new Transform(new Map([['dimensions', staticProperty('vector2', { x: 800, y: 400 })]])));
      root.addComponent(new Layout(new Map(insetEntries('padding', 0, 0))));

      const page = new Page('page');
      page.addComponent(new Transform(new Map([['dimensions', staticProperty('vector2', { x: 800, y: 400 })]])));
      page.addComponent(new Layout(new Map(insetEntries('padding', 0, 0))));

      const word = makeWord('positioned', 'Positioned', { size: 40 });
      const wordTransform = new Transform(
        new Map([
          ['positioning', staticProperty('string', 'absolute')],
          ['position', staticProperty('vector2', { x: 25, y: 50 })],
          ['positionXUnit', staticProperty('string', '%')],
          ['positionYUnit', staticProperty('string', '%')],
          ['dimensions', staticProperty('vector2', { x: 100, y: 50 })],
        ]),
      );
      word.addComponent(wordTransform);
      page.addChild(word);
      root.addChild(page);

      layoutScene(root, new Canvas(16, 16).getContext('2d'), ctx(), { width: 800, height: 400 });

      assert.equal(wordTransform.positionXUnit(ctx()), 'percent');
      assert.equal(wordTransform.positionYUnit(ctx()), 'percent');
      assert.deepEqual(wordTransform.resolvedPosition(ctx(), { width: 800, height: 400 }), { x: 200, y: 200 });
      assert.equal(word.box.x, 200);
      assert.equal(word.box.y, 200);
    });
  },

  () => {
    test('Transform sizing modes resolve width and height independently through nested containers', () => {
      const root = new CompositionArea('compositionArea');
      root.addComponent(
        new Transform(
          new Map([
            ['dimensions', staticProperty('vector2', { x: 1280, y: 240 })],
            ['widthMode', staticProperty('string', 'fitParent')],
            ['heightMode', staticProperty('string', 'custom')],
          ]),
        ),
      );

      const page = new Page('page');
      page.addComponent(
        new Transform(
          new Map([
            ['widthMode', staticProperty('string', 'fitChildren')],
            ['heightMode', staticProperty('string', 'fitChildren')],
          ]),
        ),
      );
      const row = new Row('row');
      const word = makeWord('content', 'Content', { size: 40 });
      word.addComponent(
        new Transform(
          new Map([
            ['dimensions', staticProperty('vector2', { x: 1280, y: 48 })],
            ['widthMode', staticProperty('string', 'fitContent')],
            ['heightMode', staticProperty('string', 'custom')],
          ]),
        ),
      );
      row.addChild(word);
      page.addChild(row);
      root.addChild(page);

      const canvas = new Canvas(16, 16);
      const context = canvas.getContext('2d');
      layoutScene(root, context, ctx(), { width: 800, height: 300 });

      assert.equal(root.box.width, 800, 'fitParent width should use the frame width');
      assert.equal(root.box.height, 240, 'custom height should remain independent of fitParent width');
      assert.equal(word.box.height, 48, 'custom height should use the authored dimension');
      assert.ok(word.box.width > 0 && word.box.width < 1280, 'fitContent width should ignore the authored width');
      assert.equal(page.box.width, row.box.width, 'fitChildren width should use the child row width');
      assert.equal(page.box.height, row.box.height, 'fitChildren height should use the child row height');
    });
  },

  () => {
    test('Page childWindow stays bounded when reserved collapsed rows are present', () => {
      const root = new CompositionArea('compositionArea');
      root.addComponent(fixedDimensionsTransform(500, 500));
      root.addComponent(new Layout(new Map(insetEntries('padding', 0, 0))));

      const page = new Page('page');
      page.addComponent(
        new Transform(
          new Map([
            ['widthMode', staticProperty('string', 'fitChildren')],
            ['heightMode', staticProperty('string', 'fitChildren')],
          ]),
        ),
      );
      page.addComponent(
        new Layout(
          new Map([
            ['layoutMode', staticProperty('string', 'column')],
            ['childrenSizing', staticProperty('string', 'allowOverflow')],
            ['childWindow.windowMode', staticProperty('string', 'count')],
            ['childWindow.windowCount', staticProperty('number', 2)],
            ['childWindow.windowAxis', staticProperty('string', 'vertical')],
            ['childWindow.windowAnchor', staticProperty('string', 'start')],
            ...insetEntries('padding', 0, 0),
          ]),
        ),
      );
      const rows = [];
      for (let index = 0; index < 5; index += 1) {
        const row = new Row(`row-${index}`);
        row.addComponent(fixedDimensionsTransform(200, 40));
        row.flowCollapsed = index === 4;
        row.flowCollapseMode = 'reserve';
        page.addChild(row);
        rows.push(row);
      }
      root.addChild(page);

      layoutScene(root, new Canvas(1, 1).getContext('2d'), ctx(), { width: 500, height: 500 });

      assert.equal(page.box.height, 80);
      assert.equal(rows[0].box.y, page.box.y);
      assert.equal(rows[1].box.y, page.box.y + 40);
      assert.equal(rows[2].box.y, page.box.y + 80);
      assert.equal(rows[3].box.y, page.box.y + 120);
      assert.equal(rows[4].box, null);
    });
  },

  () => {
    test('youtube-classic keeps its tight background crop inside the fixed Page window', () => {
      const preset = loadEcsPreset('youtube-classic.json');
      const template = buildEcsTreeFromPreset(preset);
      const rows = [['ONE'], ['TWO'], ['THREE'], ['FOUR']];
      const samples = [];

      for (let currentIndex = 0; currentIndex < rows.length; currentIndex += 1) {
        const scene = instantiateScene(template, {
          rows,
          currentIndex,
          stateWindow: preset.stateWindow,
          flowParticipation: preset.captionLayout.flowParticipation,
        });
        const resolveContext = defaultResolveContext({});
        layoutScene(scene, new Canvas(1, 1).getContext('2d'), resolveContext, { width: 1080, height: 1920 });
        const page = scene.compositionArea.children.find((child) => child instanceof Page);
        const background = page?.components.find((component) => component instanceof BackgroundStyle);
        const bounds = contentBounds(scene, resolveContext);

        assert.ok(page?.box);
        assert.ok(background?.box);
        assert.ok(bounds);
        assert.equal(background.overflowMode(resolveContext), 'clipToOwner');
        assert.ok(background.box.height > 0);
        samples.push({ page: page.box, bounds });
      }

      for (const sample of samples.slice(1)) {
        assert.equal(sample.page.width, samples[0].page.width);
        assert.ok(Math.abs(sample.page.height - samples[0].page.height) <= 1);
        assert.ok(Math.abs(sample.page.y - samples[0].page.y) <= 1);
        assert.ok(sample.bounds.width > 0);
        assert.ok(sample.bounds.height > 0);
      }
      for (const sample of samples) {
        assert.ok(sample.bounds.height <= sample.page.height);
      }
    });
  },

  () => {
    test('Page childWindow sizes variable-height rows from the anchored window', () => {
      for (const [windowAnchor, expectedHeight] of [
        ['start', 60],
        ['center', 120],
        ['end', 200],
      ]) {
        const root = new CompositionArea('compositionArea');
        root.addComponent(fixedDimensionsTransform(500, 500));
        root.addComponent(new Layout(new Map(insetEntries('padding', 0, 0))));

        const page = new Page(`variable-${windowAnchor}`);
        page.addComponent(
          new Transform(
            new Map([
              ['widthMode', staticProperty('string', 'fitChildren')],
              ['heightMode', staticProperty('string', 'fitChildren')],
            ]),
          ),
        );
        page.addComponent(
          new Layout(
            new Map([
              ['layoutMode', staticProperty('string', 'column')],
              ['childrenSizing', staticProperty('string', 'allowOverflow')],
              ['childWindow.windowMode', staticProperty('string', 'count')],
              ['childWindow.windowCount', staticProperty('number', 2)],
              ['childWindow.windowAxis', staticProperty('string', 'vertical')],
              ['childWindow.windowAnchor', staticProperty('string', windowAnchor)],
              ...insetEntries('padding', 0, 0),
            ]),
          ),
        );
        for (const [index, height] of [20, 40, 80, 120].entries()) {
          const row = new Row(`${windowAnchor}-row-${index}`);
          row.addComponent(fixedDimensionsTransform(200, height));
          page.addChild(row);
        }
        root.addChild(page);

        layoutScene(root, new Canvas(1, 1).getContext('2d'), ctx(), { width: 500, height: 500 });

        assert.equal(page.box.height, expectedHeight);
      }
    });
  },

  () => {
    test('childWindow normalizes invalid values and ignores absolute Page children', () => {
      const layout = new Layout(
        new Map([
          ['childWindow.windowMode', staticProperty('string', 'count')],
          ['childWindow.windowCount', staticProperty('number', 2.8)],
          ['childWindow.windowAxis', staticProperty('string', 'diagonal')],
          ['childWindow.windowAnchor', staticProperty('string', 'outside')],
        ]),
      );
      assert.deepEqual(layout.childWindow(ctx()), {
        mode: 'count',
        count: 2,
        axis: 'vertical',
        anchor: 'start',
        selection: 'anchor',
      });

      const root = new CompositionArea('compositionArea');
      root.addComponent(fixedDimensionsTransform(500, 500));
      root.addComponent(new Layout(new Map(insetEntries('padding', 0, 0))));
      const page = root.addChild(new Page('page'));
      page.addComponent(
        new Transform(
          new Map([
            ['widthMode', staticProperty('string', 'fitChildren')],
            ['heightMode', staticProperty('string', 'fitChildren')],
          ]),
        ),
      );
      page.addComponent(
        new Layout(
          new Map([
            ['childWindow.windowMode', staticProperty('string', 'count')],
            ['childWindow.windowCount', staticProperty('number', 2)],
            ['childWindow.windowAxis', staticProperty('string', 'vertical')],
            ...insetEntries('padding', 0, 0),
          ]),
        ),
      );
      const absoluteRow = page.addChild(new Row('absolute-row'));
      absoluteRow.addComponent(
        new Transform(
          new Map([
            ['dimensions', staticProperty('vector2', { x: 200, y: 200 })],
            ['positioning', staticProperty('string', 'absolute')],
          ]),
        ),
      );
      for (let index = 0; index < 2; index += 1) {
        const row = page.addChild(new Row(`flow-row-${index}`));
        row.addComponent(fixedDimensionsTransform(200, 40));
      }

      layoutScene(root, new Canvas(1, 1).getContext('2d'), ctx(), { width: 500, height: 500 });

      assert.equal(page.box.height, 80);
    });
  },

  () => {
    test('PhysicalEntity.clone: deep-copies the subtree and resets boxes', () => {
      const word = makeWord('word:current', 'Hi');
      word.box = { x: 1, y: 2, width: 3, height: 4 };
      const copy = word.clone();

      assert.ok(copy instanceof Word);
      assert.equal(copy.text, 'Hi');
      assert.equal(copy.box, null, 'clone resets box (layout re-assigns)');
      assert.notEqual(copy.components[0], word.components[0], 'components are cloned');

      // Mutating the clone must not touch the original.
      copy.text = 'Bye';
      assert.equal(word.text, 'Hi');
    });
  },

  () => {
    test('Text resolves and preserves a top-level Font dependency', () => {
      const word = new Word('word:current', 'Hi');
      const text = word.addComponent(new Text());
      const font = new Font(new Map([['size', staticProperty('number', 42)]]));
      font.dependencyOf = 'text';
      word.addComponent(font);

      assert.equal(text.font(), font);

      const copy = word.clone();
      const copiedText = copy.getComponent('text');
      const copiedFont = copy.getComponent('font');
      assert.ok(copiedText instanceof Text);
      assert.ok(copiedFont instanceof Font);
      assert.equal(copiedText.font(), copiedFont);
      assert.notEqual(copiedText.font(), font);
    });
  },
];

for (const registerTest of testRegistrations) registerTest();
