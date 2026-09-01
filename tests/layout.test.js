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
  markerAppearance,
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
    test('Page transform pivots around the visible page band, not the container center', () => {
      const root = new CompositionArea('compositionArea');
      root.box = { x: 0, y: 0, width: 200, height: 200 };

      const page = new Page('page');
      page.box = { x: 0, y: 0, width: 200, height: 200 };
      page.addComponent(new Transform(new Map([['rotation', staticProperty('number', 180)]])));

      const band = new BackgroundStyle(
        new Map([
          ['enabled', staticProperty('boolean', true)],
          ['fill', staticProperty('paint', solidPaint('rgb(255,0,0)'))],
        ]),
      );
      band.box = { x: 140, y: 80, width: 20, height: 20 };
      page.addComponent(band);
      root.addChild(page);

      const canvas = new Canvas(200, 200);
      const context = canvas.getContext('2d');
      renderScene(root, context, ctx({}));

      const original = context.getImageData(150, 90, 1, 1).data;
      const mirrored = context.getImageData(50, 90, 1, 1).data;

      assert.ok(original[3] > 200, 'expected the band to stay anchored at its own center after rotation');
      assert.ok(mirrored[3] < 20, 'expected the band not to orbit around the container center');
    });
  },

  () => {
    test('reserved flow uses stable Page and Row transform pivots', () => {
      const page = new Page('page');
      page.box = { x: 140, y: 80, width: 20, height: 20 };
      page.flowBox = { x: 0, y: 0, width: 200, height: 200 };
      const reservedPageWord = page.addChild(new Word('reserved-page-word'));
      reservedPageWord.flowCollapsed = true;
      reservedPageWord.flowCollapseMode = 'reserve';

      const row = new Row('row');
      row.box = { x: 140, y: 80, width: 20, height: 20 };
      row.flowBox = { x: 40, y: 20, width: 120, height: 160 };
      const reservedRowWord = row.addChild(new Word('reserved-row-word'));
      reservedRowWord.flowCollapsed = true;
      reservedRowWord.flowCollapseMode = 'reserve';

      assert.deepEqual(resolveTransformPivot(page, ctx()), { x: 100, y: 100 });
      assert.deepEqual(resolveTransformPivot(row, ctx()), { x: 100, y: 100 });
    });
  },

  () => {
    test('High Alert keeps its rotated Page pivot stable as reserved words appear', () => {
      const preset = loadEcsPreset('high-alert.json');
      const template = buildEcsTreeFromPreset(preset);
      const rows = [['ONE', 'TWO'], ['THREE'], ['FOUR'], ['FIVE']];
      const samples = [];

      for (let currentIndex = 0; currentIndex < rows.flat().length; currentIndex += 1) {
        const scene = instantiateScene(template, {
          rows,
          currentIndex,
          stateWindow: preset.stateWindow,
          flowParticipation: preset.captionLayout.flowParticipation,
        });
        const canvas = new Canvas(1080, 1920);
        const resolveContext = defaultResolveContext({});
        layoutScene(scene, canvas.getContext('2d'), resolveContext, { width: 1080, height: 1920 });
        const page = scene.compositionArea.children.find((child) => child instanceof Page);
        assert.ok(page?.flowBox);
        samples.push({ flowBox: page.flowBox, pivot: resolveTransformPivot(page, resolveContext) });
      }

      for (const sample of samples.slice(1)) {
        assert.deepEqual(sample.flowBox, samples[0].flowBox);
        assert.deepEqual(sample.pivot, samples[0].pivot);
      }
    });
  },

  () => {
    test('BackgroundStyle boundsMode defaults to fillSelf and rejects unknown values', () => {
      const background = new BackgroundStyle();
      assert.equal(background.boundsMode(ctx()), 'fillSelf');

      background.props.set('boundsMode', staticProperty('string', 'unknown'));
      assert.equal(background.boundsMode(ctx()), 'fillSelf');
    });
  },

  () => {
    test('BackgroundStyle overflowMode defaults to visible and accepts clipToOwner', () => {
      const background = new BackgroundStyle();
      assert.equal(background.overflowMode(ctx()), 'visible');

      background.props.set('overflowMode', staticProperty('string', 'clipToOwner'));
      assert.equal(background.overflowMode(ctx()), 'clipToOwner');

      background.props.set('overflowMode', staticProperty('string', 'unknown'));
      assert.equal(background.overflowMode(ctx()), 'visible');
    });
  },

  () => {
    test('BackgroundStyle boundsMode resolves fillSelf, tight, and full without changing entity layout', () => {
      const expectedOwnerBox = { x: 10, y: 20, width: 140, height: 100 };
      const expectedRowBox = { x: 20, y: 30, width: 110, height: 70 };
      const expectedWordBox = { x: 45, y: 50, width: 30, height: 12 };

      const layoutMode = (boundsMode) => {
        const root = new CompositionArea('compositionArea');
        const owner = new Video('video');
        const row = new Row('row');
        const word = new Word('word');
        const transform = new Transform(
          new Map([
            ['position', staticProperty('vector2', { x: 7, y: -3 })],
            ['dimensions', staticProperty('vector2', { x: 140, y: 100 })],
          ]),
        );
        const background = new BackgroundStyle(
          new Map([
            ['enabled', staticProperty('boolean', true)],
            ['boundsMode', staticProperty('string', boundsMode)],
          ]),
        );

        owner.box = { ...expectedOwnerBox };
        row.box = { ...expectedRowBox };
        word.box = { ...expectedWordBox };
        owner.addComponent(transform);
        owner.addComponent(background);
        row.addChild(word);
        owner.addChild(row);
        root.addChild(owner);

        layoutScene(root, new Canvas(1, 1).getContext('2d'), ctx(), { width: 200, height: 200 });
        return { owner, row, word, transform, background };
      };

      const fillSelf = layoutMode('fillSelf');
      assert.deepEqual(fillSelf.background.box, expectedOwnerBox);
      assert.equal(fillSelf.background.rowBoxes, undefined);

      const tight = layoutMode('tight');
      assert.deepEqual(tight.background.box, expectedWordBox);

      const full = layoutMode('full');
      assert.deepEqual(full.background.box, expectedRowBox);

      for (const result of [fillSelf, tight, full]) {
        assert.deepEqual(result.owner.box, expectedOwnerBox);
        assert.deepEqual(result.row.box, expectedRowBox);
        assert.deepEqual(result.word.box, expectedWordBox);
        assert.deepEqual(result.transform.getProp('position').resolve(ctx()), { x: 7, y: -3 });
        assert.deepEqual(result.transform.getProp('dimensions').resolve(ctx()), { x: 140, y: 100 });
      }
    });
  },

  () => {
    test('iMessage preset preserves its explicit 8pt vertical spacer', () => {
      const preset = loadEcsPreset('imessage.json');
      const template = buildEcsTreeFromPreset(preset);
      const page = template.compositionArea.children.find((child) => child instanceof Page);
      const spacer = page?.getComponent('verticalSpacer');

      assert.ok(page);
      assert.ok(spacer);
      assert.equal(spacer.getProp('spacing')?.base, 8);
    });
  },

  () => {
    test('compact preview sizing fits a Page to its children without changing the preset', async () => {
      const preset = loadEcsPreset('apple-music.json');
      const input = {
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
      };
      const authoredResult = await generateSubtitleImagesEcs(input);
      const compactResult = await generateSubtitleImagesEcs({ ...input, fitPageToChildren: true });

      assert.ok(authoredResult.frameSize.width <= input.videoResolution.width);
      assert.equal(authoredResult.frameSize.height, input.videoResolution.height);
      assert.ok(compactResult.frameSize.width < authoredResult.frameSize.width);
      assert.ok(compactResult.frameSize.height < authoredResult.frameSize.height);
      const pageTransform = preset.design.children[1].children[0].components[0];
      assert.equal(pageTransform.props.widthMode.value, 'fitParent');
      assert.equal(pageTransform.props.heightMode.value, 'fitParent');
    });
  },

  () => {
    test('Page content backgrounds retain separate row bands', () => {
      const root = new CompositionArea('compositionArea');
      const container = new Video('video');
      const page = new Page('page');
      const firstRow = new Row('row:one');
      const secondRow = new Row('row:two');
      const firstWord = new Word('word:one');
      const secondWord = new Word('word:two');
      const background = new BackgroundStyle(
        new Map([
          ['enabled', staticProperty('boolean', true)],
          ['boundsMode', staticProperty('string', 'tight')],
        ]),
      );

      container.box = { x: 0, y: 0, width: 200, height: 200 };
      page.box = { x: 0, y: 0, width: 200, height: 160 };
      firstRow.box = { x: 10, y: 20, width: 120, height: 20 };
      secondRow.box = { x: 40, y: 70, width: 100, height: 20 };
      firstWord.box = { x: 20, y: 24, width: 40, height: 12 };
      secondWord.box = { x: 50, y: 74, width: 60, height: 12 };
      firstRow.addChild(firstWord);
      secondRow.addChild(secondWord);
      page.addComponent(background);
      page.addChild(firstRow);
      page.addChild(secondRow);
      container.addChild(page);
      root.addChild(container);

      layoutScene(root, new Canvas(1, 1).getContext('2d'), ctx(), { width: 200, height: 200 });

      assert.deepEqual(background.rowBoxes, [firstWord.box, secondWord.box]);
      assert.deepEqual(background.box, { x: 20, y: 24, width: 90, height: 62 });
    });
  },

  () => {
    test('Page tight throughCurrent backgrounds use content bounds for previous Rows', () => {
      const root = new CompositionArea('compositionArea');
      const container = new Video('video');
      const page = new Page('page');
      const previousRow = new Row('row:previous');
      const currentRow = new Row('row:current');
      const previousWord = new Word('word:previous');
      const currentWord = new Word('word:current');
      const background = new BackgroundStyle(
        new Map([
          ['enabled', staticProperty('boolean', true)],
          ['boundsMode', staticProperty('string', 'tight')],
          ['coverageMode', staticProperty('string', 'throughCurrent')],
          ...insetEntries('bandPadding', 0, 0),
          ...insetEntries('blockPadding', 0, 0),
        ]),
      );

      previousRow.state = 'previous';
      currentRow.state = 'current';
      currentWord.state = 'current';
      container.box = { x: 0, y: 0, width: 200, height: 200 };
      page.box = { x: 0, y: 0, width: 200, height: 160 };
      previousRow.box = { x: 10, y: 20, width: 120, height: 40 };
      currentRow.box = { x: 10, y: 70, width: 120, height: 40 };
      previousWord.box = { x: 20, y: 28, width: 40, height: 12 };
      currentWord.box = { x: 20, y: 78, width: 60, height: 12 };
      previousRow.addChild(previousWord);
      currentRow.addChild(currentWord);
      page.addComponent(background);
      page.addChild(previousRow);
      page.addChild(currentRow);
      container.addChild(page);
      root.addChild(container);

      layoutScene(root, new Canvas(1, 1).getContext('2d'), ctx(), { width: 200, height: 200 });

      assert.deepEqual(background.rowBoxes, [previousWord.box, currentWord.box]);
      assert.deepEqual(background.debugGeometry?.sourceBands, [previousWord.box, currentWord.box]);
    });
  },

  () => {
    test('BackgroundStyle bandPadding and blockPadding expand multi-band geometry independently', () => {
      const root = new CompositionArea('compositionArea');
      const container = new Video('video');
      const page = new Page('page');
      const firstRow = new Row('row:one');
      const secondRow = new Row('row:two');
      const firstWord = new Word('word:one');
      const secondWord = new Word('word:two');
      const background = new BackgroundStyle(
        new Map([
          ['enabled', staticProperty('boolean', true)],
          ['boundsMode', staticProperty('string', 'tight')],
          ...insetEntries('bandPadding', 2, 3),
          ...insetEntries('blockPadding', 5, 7),
        ]),
      );

      container.box = { x: 0, y: 0, width: 200, height: 200 };
      page.box = { x: 0, y: 0, width: 200, height: 160 };
      firstRow.box = { x: 10, y: 20, width: 120, height: 20 };
      secondRow.box = { x: 40, y: 70, width: 100, height: 20 };
      firstWord.box = { x: 20, y: 24, width: 40, height: 12 };
      secondWord.box = { x: 50, y: 74, width: 60, height: 12 };
      firstRow.addChild(firstWord);
      secondRow.addChild(secondWord);
      page.addComponent(background);
      page.addChild(firstRow);
      page.addChild(secondRow);
      container.addChild(page);
      root.addChild(container);

      layoutScene(root, new Canvas(1, 1).getContext('2d'), ctx(), { width: 200, height: 200 });

      assert.deepEqual(background.rowBoxes, [
        { x: 13, y: 14, width: 54, height: 25 },
        { x: 43, y: 71, width: 74, height: 25 },
      ]);
      assert.deepEqual(background.box, { x: 13, y: 14, width: 104, height: 82 });
      assert.deepEqual(collectDebugFrame(root, ctx()).backgrounds, [
        {
          id: 'page',
          entity: 'page',
          bandPadding: [
            { left: 18, top: 21, right: 62, bottom: 39 },
            { left: 48, top: 71, right: 112, bottom: 89 },
          ],
          blockPadding: [
            { left: 15, top: 17, right: 65, bottom: 36 },
            { left: 45, top: 74, right: 115, bottom: 93 },
          ],
        },
      ]);
    });
  },

  () => {
    test('BackgroundStyle blockPadding expands a single Row background band', () => {
      const row = new Row('row');
      const background = new BackgroundStyle(
        new Map([['enabled', staticProperty('boolean', true)], ...insetEntries('blockPadding', 7, 5)]),
      );
      row.addComponent(background);

      background.setResolvedSourceBands([{ x: 10, y: 20, width: 100, height: 30 }], ctx());

      assert.deepEqual(background.debugGeometry?.blockPaddingBands, [{ x: 3, y: 15, width: 114, height: 40 }]);
      assert.deepEqual(background.getProp('bounds').resolvedValue, { x: 3, y: 15, width: 114, height: 40 });
    });
  },

  () => {
    test('ECS padding uses canonical animated edge properties', () => {
      const root = buildEcsTree({
        entity: 'viewport',
        id: 'viewport',
        components: [{ component: 'transform', props: {} }],
        children: [
          {
            entity: 'videoArea',
            id: 'videoArea',
            components: [
              { component: 'transform', props: {} },
              {
                component: 'layout',
                props: {
                  padding: {
                    top: {
                      type: 'number',
                      value: 12,
                      transition: { enabled: true, type: 'tween', durationSeconds: 0.4, easeType: 'ease' },
                    },
                    right: {
                      type: 'number',
                      value: 8,
                      transition: { enabled: true, type: 'tween', durationSeconds: 0.4, easeType: 'ease' },
                    },
                    bottom: {
                      type: 'number',
                      value: 12,
                      transition: { enabled: true, type: 'tween', durationSeconds: 0.4, easeType: 'ease' },
                    },
                    left: {
                      type: 'number',
                      value: 8,
                      transition: { enabled: true, type: 'tween', durationSeconds: 0.4, easeType: 'ease' },
                    },
                  },
                },
              },
            ],
            children: [{ entity: 'video', id: 'video', components: [{ component: 'transform', props: {} }] }],
          },
          { entity: 'compositionArea', id: 'compositionArea', components: [{ component: 'transform', props: {} }] },
        ],
      });

      assert.equal(root.videoArea.layout.props.get('padding.top').base, 12);
      assert.equal(root.videoArea.layout.props.get('padding.right').base, 8);
      assert.equal(root.videoArea.layout.props.get('padding.bottom').base, 12);
      assert.equal(root.videoArea.layout.props.get('padding.left').base, 8);
      assert.equal(root.videoArea.layout.props.get('padding.top').transition.durationSeconds, 0.4);

      const serialized = serializeEntityTree(root);
      const layout = serialized.children
        .find((child) => child.entity === 'videoArea')
        .components.find((component) => component.component === 'layout');
      assert.deepEqual(Object.keys(layout.props.padding), [
        'top',
        'right',
        'bottom',
        'left',
        'linkedTopBottom',
        'linkedLeftRight',
      ]);
      assert.equal(layout.props.padding.top.type, 'number');
    });
  },

  () => {
    test('asymmetric layout and background padding use physical edge sums', () => {
      const layout = new Layout(
        new Map([
          ['padding.top', staticProperty('number', 11)],
          ['padding.right', staticProperty('number', 13)],
          ['padding.bottom', staticProperty('number', 17)],
          ['padding.left', staticProperty('number', 19)],
        ]),
      );
      assert.deepEqual(contentBoxFromArea({ x: 10, y: 20, width: 100, height: 80 }, layout, ctx()), {
        x: 29,
        y: 31,
        width: 68,
        height: 52,
      });

      const background = new BackgroundStyle(
        new Map([
          ['bandPadding.top', staticProperty('number', 3)],
          ['bandPadding.right', staticProperty('number', 4)],
          ['bandPadding.bottom', staticProperty('number', 5)],
          ['bandPadding.left', staticProperty('number', 6)],
          ['blockPadding.top', staticProperty('number', 7)],
          ['blockPadding.right', staticProperty('number', 8)],
          ['blockPadding.bottom', staticProperty('number', 9)],
          ['blockPadding.left', staticProperty('number', 10)],
        ]),
      );
      background.setResolvedSourceBands([{ x: 20, y: 30, width: 40, height: 50 }], ctx());
      assert.deepEqual(background.getProp('bounds').resolvedValue, { x: 4, y: 20, width: 68, height: 74 });
    });
  },

  () => {
    test('BackgroundStyle union preserves overlapping band padding', () => {
      const canvas = new Canvas(140, 140);
      const context = canvas.getContext('2d');
      const path = buildRoundedUnionPath(
        [
          { left: 10, top: 10, right: 100, bottom: 70 },
          { left: 40, top: 50, right: 90, bottom: 110 },
        ],
        {
          radii: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
          squircle: { topLeft: false, topRight: false, bottomRight: false, bottomLeft: false },
        },
        0,
      );

      context.fillStyle = '#000000';
      context.fill(path);

      // This pixel belongs only to the upper band. It must remain filled when the
      // two padded bands overlap.
      assert.equal(context.getImageData(15, 60, 1, 1).data[3], 255);
      assert.equal(context.getImageData(45, 90, 1, 1).data[3], 255);
    });
  },

  () => {
    test('render: a page-level visual effect wraps descendant content', () => {
      const page = new Page('page');
      page.box = { x: 20, y: 16, width: 40, height: 24 };
      const word = page.addChild(new Word('word'));
      word.box = { x: 20, y: 16, width: 40, height: 24 };
      word.addComponent(
        new BackgroundStyle(
          new Map([
            ['enabled', staticProperty('boolean', true)],
            ['fill', staticProperty('paint', solidPaint('rgb(255, 0, 0)'))],
          ]),
        ),
      );
      page.addEffect(
        new BorderEffect(
          new Map([
            ['enabled', staticProperty('boolean', true)],
            ['width', staticProperty('number', 2)],
            ['color', staticProperty('paint', solidPaint('white'))],
          ]),
        ),
      );

      const canvas = new Canvas(80, 64);
      const context = canvas.getContext('2d');
      renderScene(page, context, ctx({}));

      assert.ok(
        context.getImageData(19, 28, 1, 1).data[3] > 0,
        'expected the page effect to outline descendant content',
      );
    });
  },

  () => {
    test('layout/render: area Transform position is applied once', () => {
      const viewport = new Viewport('viewport');
      viewport.addComponent(
        new Transform(
          new Map([
            ['position', staticProperty('vector2', { x: 10, y: 0 })],
            ['dimensions', staticProperty('vector2', { x: 20, y: 20 })],
          ]),
        ),
      );
      viewport.addComponent(new Layout(new Map(insetEntries('padding', 0, 0))));
      const compositionArea = viewport.addChild(new CompositionArea('compositionArea'));
      compositionArea.addComponent(
        new BackgroundStyle(
          new Map([
            ['enabled', staticProperty('boolean', true)],
            ['fill', staticProperty('paint', solidPaint('rgb(255, 0, 0)'))],
          ]),
        ),
      );

      const canvas = new Canvas(100, 40);
      const c2d = canvas.getContext('2d');
      layoutScene(viewport, c2d, ctx(), { width: 100, height: 40 });
      renderScene(viewport, c2d, ctx());

      assert.equal(c2d.getImageData(51, 20, 1, 1).data[0], 255, 'area should begin at its layout-resolved position');
      assert.equal(c2d.getImageData(71, 20, 1, 1).data[3], 0, 'area position should not be translated a second time');
    });
  },

  () => {
    test('TypewriterEffect auto timing fits the word interval and fixed timing stays exact', () => {
      const canvas = new Canvas(1, 1);
      const context = canvas.getContext('2d');
      context.font = '80px sans-serif';
      const autoEffect = new TypewriterEffect(new Map([['durationSeconds', staticProperty('number', 0.25)]]));
      const halfRevealed = autoEffect.buildLayout(
        context,
        defaultResolveContext({
          lifecycle: 'incoming',
          elapsedSeconds: 0.1,
          wordDurationSeconds: 0.2,
        }),
        'WORD',
        solidPaint('white'),
      );
      const completed = autoEffect.buildLayout(
        context,
        defaultResolveContext({
          lifecycle: 'incoming',
          elapsedSeconds: 0.2,
          wordDurationSeconds: 0.2,
        }),
        'WORD',
        solidPaint('white'),
      );
      const delayedAndCompleted = new TypewriterEffect(
        new Map([
          ['durationSeconds', staticProperty('number', 0.25)],
          ['delaySeconds', staticProperty('number', 0.4)],
        ]),
      ).buildLayout(
        context,
        defaultResolveContext({
          lifecycle: 'incoming',
          elapsedSeconds: 0.2,
          wordDurationSeconds: 0.2,
        }),
        'WORD',
        solidPaint('white'),
      );
      const fixed = new TypewriterEffect(
        new Map([
          ['durationMode', staticProperty('string', 'fixed')],
          ['durationSeconds', staticProperty('number', 0.25)],
        ]),
      ).buildLayout(
        context,
        defaultResolveContext({
          lifecycle: 'incoming',
          elapsedSeconds: 0.2,
          wordDurationSeconds: 0.2,
        }),
        'WORD',
        solidPaint('white'),
      );

      assert.equal(halfRevealed.reveal, 0.5);
      assert.equal(completed.reveal, 1);
      assert.equal(delayedAndCompleted.reveal, 1);
      assert.equal(fixed.reveal, 0.8);
    });
  },

  () => {
    test('layout: natural words in one row share a baseline across descenders', () => {
      const { root } = makeLine([makeWord('word:body', 'word'), makeWord('word:descender', 'q')]);
      const measureContext = new Canvas(16, 16).getContext('2d');
      layoutScene(root, measureContext, defaultResolveContext(), { width: 800, height: 300 });

      const body = root.findById('word:body');
      const descender = root.findById('word:descender');
      assert.ok(body instanceof Word && descender instanceof Word);
      assert.equal(typeof body.textBaselineOffset, 'number');
      assert.equal(body.textBaselineOffset, descender.textBaselineOffset);
    });
  },

  () => {
    test('row font fitting resolves natural, shrink, and fill policies', () => {
      assert.deepEqual(
        resolveRowFontScale({
          mode: 'natural',
          naturalWidth: 400,
          targetWidth: 200,
          minScale: 0.5,
          maxScale: 1.25,
        }),
        { value: 1, requiresWrapping: false },
      );
      assert.deepEqual(
        resolveRowFontScale({
          mode: 'shrink-to-fit',
          naturalWidth: 400,
          targetWidth: 200,
          minScale: 0.5,
          maxScale: 1.25,
        }),
        { value: 0.5, requiresWrapping: false },
      );
      assert.deepEqual(
        resolveRowFontScale({
          mode: 'fill-width',
          naturalWidth: 100,
          targetWidth: 200,
          minScale: 0.5,
          maxScale: 1.25,
        }),
        { value: 1.25, requiresWrapping: false },
      );
      assert.equal(rowFitWidthForWrapping('shrink-to-fit', 200, 0.5), 400);
    });
  },

  () => {
    test('natural row fitting preserves content-sized rows', () => {
      const line = layoutFixedLine(makeFixedLine([makeWord('word', 'NATURAL', { size: 50 })]), {
        mode: 'natural',
        minScale: 0.5,
        maxScale: 1.25,
      });
      const word = line.row.children[0];

      assert.equal(word.fontScale, 1);
      assert.ok(line.row.box.width < 400);
      assert.equal(line.row.box.width, word.box.width);
    });
  },

  () => {
    test('shrink-to-fit uses one shared scale and centers content in a fixed row', () => {
      const line = layoutFixedLine(
        makeFixedLine([makeWord('word:first', 'WIDER', { size: 70 }), makeWord('word:second', 'WIDER', { size: 70 })]),
        { mode: 'shrink-to-fit', minScale: 0.5, maxScale: 1.25 },
      );
      const [first, second] = line.row.children;
      const contentLeft = Math.min(first.box.x, second.box.x);
      const contentRight = Math.max(first.box.x + first.box.width, second.box.x + second.box.width);

      assert.equal(line.row.box.width, 400);
      assert.equal(first.fontScale, second.fontScale);
      assert.ok(first.fontScale >= 0.5 && first.fontScale < 1);
      assert.ok(contentLeft >= line.row.box.x - 0.01);
      assert.ok(contentRight <= line.row.box.x + line.row.box.width + 0.01);
      assert.ok(Math.abs((contentLeft + contentRight) / 2 - (line.row.box.x + line.row.box.width / 2)) < 0.01);
    });
  },

  () => {
    test('non-natural fitting preserves explicit, parent, and child width modes', () => {
      const cases = [
        { widthMode: 'custom', expectedWidth: 260 },
        { widthMode: 'fitParent', expectedWidth: 400 },
        { widthMode: 'fitChildren', expectedWidth: 400 },
      ];

      for (const { widthMode, expectedWidth } of cases) {
        const line = makeFixedLine(
          [makeWord('word:first', 'WIDER', { size: 70 }), makeWord('word:second', 'WIDER', { size: 70 })],
          400,
        );
        line.row.addComponent(
          new Transform(
            new Map([
              ['dimensions', staticProperty('vector2', { x: 260, y: 120 })],
              ['widthMode', staticProperty('string', widthMode)],
              ['heightMode', staticProperty('string', 'custom')],
            ]),
          ),
        );

        layoutFixedLine(line, { mode: 'shrink-to-fit', minScale: 0.5, maxScale: 1.25 });

        assert.equal(line.row.box.width, expectedWidth, `${widthMode} Row width should remain bounded`);
        for (const word of line.row.children) {
          assert.ok(word.box.x >= line.row.box.x - 0.01);
          assert.ok(word.box.x + word.box.width <= line.row.box.x + line.row.box.width + 0.01);
        }
      }
    });
  },

  () => {
    test('long-word wrapping keeps words intact when minimum scaling is sufficient', () => {
      const policy = {
        mode: 'wrap',
        breakCharacters: [],
        breakMarker: '',
        overflowTolerance: 0,
      };
      const entries = wrapCaptionTimedWords(
        [
          { word: 'ABCDEFGHIJKLMNO', startTimestamp: 0, visualEndTimestamp: 1 },
          { word: 'ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJ', startTimestamp: 1, visualEndTimestamp: 2 },
        ],
        {
          availableWidth: 100,
          maxWordWidth: (word) => word.length * 10,
          policy,
          minimumScale: 0.5,
        },
      );

      assert.equal(entries[0].word, 'ABCDEFGHIJKLMNO');
      assert.ok(entries.slice(1).length > 1);
      assert.ok(entries.slice(1).every((entry) => entry.word.length <= 20));
    });
  },

  () => {
    test('RTL layout places logical words from the right edge without reversing text', () => {
      const words = ['مرحبا', 'بالعالم', 'اليوم'];
      const { root, row } = makeLine(words.map((word, index) => makeWord(`word:${index}`, word, { size: 40 })));
      const renderContext = ctx();

      layoutScene(root, new Canvas(16, 16).getContext('2d'), renderContext, {
        width: 800,
        height: 240,
        textDirection: 'rtl',
      });

      const boxes = row.children.map((word) => word.box);
      assert.ok(boxes.every(Boolean));
      assert.ok(boxes[0].x > boxes[1].x);
      assert.ok(boxes[1].x > boxes[2].x);
      assert.deepEqual(
        row.children.map((word) => word.text),
        words,
      );
    });
  },

  () => {
    test('Layout scene honors an explicit row spacing override', () => {
      const root = new CompositionArea('compositionArea');
      const page = new Page('page');
      const firstRow = new Row('row:first');
      const secondRow = new Row('row:second');
      firstRow.addChild(makeWord('word:first', 'First', { size: 40 }));
      secondRow.addChild(makeWord('word:second', 'Second', { size: 40 }));
      page.addChild(firstRow);
      page.addChild(secondRow);
      root.addChild(page);

      layoutScene(root, new Canvas(16, 16).getContext('2d'), ctx(), {
        width: 800,
        height: 400,
        rowSpacing: 40,
      });

      assert.equal(secondRow.box.y - (firstRow.box.y + firstRow.box.height), 40);
    });
  },

  () => {
    test('Layout scene adds pause spacing only at the configured row boundary', () => {
      const root = new CompositionArea('compositionArea');
      const page = new Page('page');
      const firstRow = new Row('row:first');
      const secondRow = new Row('row:second');
      firstRow.patternIndex = 0;
      secondRow.patternIndex = 1;
      firstRow.addChild(makeWord('word:first', 'First', { size: 40 }));
      secondRow.addChild(makeWord('word:second', 'Second', { size: 40 }));
      page.addChild(firstRow);
      page.addChild(secondRow);
      root.addChild(page);

      layoutScene(root, new Canvas(16, 16).getContext('2d'), ctx(), {
        width: 800,
        height: 400,
        rowSpacing: 40,
        rowSpacingExtras: new Map([[1, 20]]),
      });

      assert.equal(secondRow.box.y - (firstRow.box.y + firstRow.box.height), 60);
    });
  },

  () => {
    test('Layout scene resolves an enabled vertical spacer before explicit row spacing', () => {
      const root = new CompositionArea('compositionArea');
      const page = new Page('page');
      const firstRow = new Row('row:first');
      const secondRow = new Row('row:second');
      firstRow.addChild(makeWord('word:first', 'First', { size: 40 }));
      secondRow.addChild(makeWord('word:second', 'Second', { size: 40 }));
      page.addComponent(
        new VerticalSpacer(
          new Map([
            ['enabled', staticProperty('boolean', true)],
            ['spacing', staticProperty('number', 72)],
            ['unit', staticProperty('string', 'pt')],
          ]),
        ),
      );
      page.addChild(firstRow);
      page.addChild(secondRow);
      root.addChild(page);

      layoutScene(root, new Canvas(16, 16).getContext('2d'), ctx(), {
        width: 800,
        height: 400,
        rowSpacing: 12,
      });

      assert.equal(secondRow.box.y - (firstRow.box.y + firstRow.box.height), 72);
    });
  },

  () => {
    test('Layout scene disables Page row spacing when its vertical spacer is disabled', () => {
      const root = new CompositionArea('compositionArea');
      const page = new Page('page');
      const firstRow = new Row('row:first');
      const secondRow = new Row('row:second');
      firstRow.addChild(makeWord('word:first', 'First', { size: 40 }));
      secondRow.addChild(makeWord('word:second', 'Second', { size: 40 }));
      page.addComponent(
        new VerticalSpacer(
          new Map([
            ['enabled', staticProperty('boolean', false)],
            ['spacing', staticProperty('number', 72)],
            ['unit', staticProperty('string', 'pt')],
          ]),
        ),
      );
      page.addChild(firstRow);
      page.addChild(secondRow);
      root.addChild(page);

      layoutScene(root, new Canvas(16, 16).getContext('2d'), ctx(), {
        width: 800,
        height: 400,
        rowSpacing: 40,
      });

      assert.equal(secondRow.box.y - (firstRow.box.y + firstRow.box.height), 0);
    });
  },

  () => {
    test('Layout scene uses zero Page row spacing when no vertical spacer or override exists', () => {
      const root = new CompositionArea('compositionArea');
      const page = new Page('page');
      const firstRow = new Row('row:first');
      const secondRow = new Row('row:second');
      firstRow.addChild(makeWord('word:first', 'First', { size: 40 }));
      secondRow.addChild(makeWord('word:second', 'Second', { size: 40 }));
      page.addChild(firstRow);
      page.addChild(secondRow);
      root.addChild(page);

      layoutScene(root, new Canvas(16, 16).getContext('2d'), ctx(), {
        width: 800,
        height: 400,
      });

      assert.equal(secondRow.box.y - (firstRow.box.y + firstRow.box.height), 0);
    });
  },

  () => {
    test('All-mode flow overflow preserves explicit vertical and horizontal page spacers', () => {
      const createPage = (layoutMode, spacer, rowDimensions) => {
        const root = new CompositionArea('compositionArea');
        root.addComponent(fixedDimensionsTransform(100, 100));
        const page = root.addChild(new Page('page'));
        page.addComponent(fixedDimensionsTransform(100, 100));
        page.addComponent(new Layout(new Map([['layoutMode', staticProperty('string', layoutMode)]])));
        page.addComponent(spacer);
        const rows = [new Row('row:first'), new Row('row:second')];
        for (const [index, row] of rows.entries()) {
          row.addComponent(fixedDimensionsTransform(rowDimensions.width, rowDimensions.height));
          row.addChild(makeWord(`word:${index}`, 'word', { size: 20 }));
          page.addChild(row);
        }
        return { root, rows };
      };

      const vertical = createPage('column', new VerticalSpacer(new Map([['spacing', staticProperty('number', 30)]])), {
        width: 80,
        height: 60,
      });
      layoutScene(vertical.root, new Canvas(100, 100).getContext('2d'), ctx(), {
        width: 100,
        height: 100,
        allowFlowOverflow: true,
      });
      assert.equal(vertical.rows[1].box.y - (vertical.rows[0].box.y + vertical.rows[0].box.height), 30);

      const horizontal = createPage('row', new HorizontalSpacer(new Map([['spacing', staticProperty('number', 30)]])), {
        width: 60,
        height: 80,
      });
      layoutScene(horizontal.root, new Canvas(100, 100).getContext('2d'), ctx(), {
        width: 100,
        height: 100,
        allowFlowOverflow: true,
      });
      assert.equal(horizontal.rows[1].box.x - (horizontal.rows[0].box.x + horizontal.rows[0].box.width), 30);
    });
  },

  () => {
    test('Spacer gaps support negative values and clamp to the parent extent', () => {
      const vertical = new VerticalSpacer(
        new Map([
          ['enabled', staticProperty('boolean', true)],
          ['spacing', staticProperty('number', -2000)],
          ['unit', staticProperty('string', 'pt')],
        ]),
      );
      const horizontalPercent = new HorizontalSpacer(
        new Map([
          ['enabled', staticProperty('boolean', true)],
          ['spacing', staticProperty('number', -150)],
          ['unit', staticProperty('string', '%')],
        ]),
      );

      assert.equal(vertical.gap(ctx(), 120), -120);
      assert.equal(horizontalPercent.gap(ctx(), 80), -80);
      assert.equal(vertical.gap(ctx(), Number.NaN), -1000);
    });
  },

  () => {
    test('horizontal spacers keep Row, Page, and Viewport flow inside padded content', () => {
      const configurations = [
        {
          name: 'Row',
          create: (spacing, unit) => {
            const root = new CompositionArea('compositionArea');
            root.addComponent(fixedDimensionsTransform(300, 140));
            root.addComponent(new Layout(new Map(insetEntries('padding', 20, 20))));
            const page = root.addChild(new Page('page'));
            const row = page.addChild(new Row('row'));
            row.addComponent(fixedDimensionsTransform(240, 80));
            row.addComponent(new Layout(new Map(insetEntries('padding', 20, 10))));
            const words = ['first', 'second'].map((id) => {
              const word = makeWord(`word:${id}`, id, { size: 20 });
              word.addComponent(fixedDimensionsTransform(60, 20));
              row.addChild(word);
              return word;
            });
            row.addComponent(
              new HorizontalSpacer(
                new Map([
                  ['spacing', staticProperty('number', spacing)],
                  ['unit', staticProperty('string', unit)],
                ]),
              ),
            );
            return { root, parent: row, children: words, ancestors: [root, page] };
          },
        },
        {
          name: 'Page',
          create: (spacing, unit) => {
            const root = new CompositionArea('compositionArea');
            root.addComponent(fixedDimensionsTransform(320, 160));
            root.addComponent(new Layout(new Map(insetEntries('padding', 20, 20))));
            const page = root.addChild(new Page('page'));
            page.addComponent(fixedDimensionsTransform(280, 120));
            page.addComponent(
              new Layout(
                new Map([['layoutMode', staticProperty('string', 'row')], ...insetEntries('padding', 15, 10)]),
              ),
            );
            page.addComponent(
              new HorizontalSpacer(
                new Map([
                  ['spacing', staticProperty('number', spacing)],
                  ['unit', staticProperty('string', unit)],
                ]),
              ),
            );
            const rows = [new Row('row:first'), new Row('row:second')];
            for (const [index, row] of rows.entries()) {
              row.addComponent(fixedDimensionsTransform(100, 30));
              row.addChild(makeWord(`word:${index}`, 'word', { size: 20 }));
              page.addChild(row);
            }
            return { root, parent: page, children: rows, ancestors: [root] };
          },
        },
        {
          name: 'Viewport',
          create: (spacing, unit) => {
            const viewport = new Viewport('viewport');
            viewport.addComponent(fixedDimensionsTransform(320, 160));
            viewport.addComponent(
              new Layout(
                new Map([
                  ['layoutMode', staticProperty('string', 'row')],
                  ['childrenAlignment.horizontalAlignment', staticProperty('string', 'left')],
                  ['childrenAlignment.verticalAlignment', staticProperty('string', 'top')],
                  ...insetEntries('padding', 20, 20),
                ]),
              ),
            );
            const compositionArea = viewport.addChild(new CompositionArea('compositionArea'));
            compositionArea.addComponent(fixedDimensionsTransform(60, 40));
            const children = [compositionArea, new ImageFlowEntity('image:first'), new ImageFlowEntity('image:second')];
            for (const [index, child] of children.entries()) {
              if (index > 0) child.addComponent(fixedDimensionsTransform(80, 40));
            }
            viewport.addComponent(
              new HorizontalSpacer(
                new Map([
                  ['spacing', staticProperty('number', spacing)],
                  ['unit', staticProperty('string', unit)],
                ]),
              ),
            );
            for (const child of children.slice(1)) viewport.addChild(child);
            return { root: viewport, parent: viewport, children, ancestors: [] };
          },
        },
      ];

      for (const configuration of configurations) {
        for (const { spacing, unit } of [
          { spacing: 80, unit: 'pt' },
          { spacing: -80, unit: 'pt' },
          { spacing: 50, unit: '%' },
          { spacing: -50, unit: '%' },
        ]) {
          const { root, parent, children, ancestors } = configuration.create(spacing, unit);
          const resolveContext = ctx();
          layoutScene(root, new Canvas(320, 160).getContext('2d'), resolveContext, { width: 320, height: 160 });
          const parentContent = contentBoxFromArea(parent.box, parent.layout, resolveContext);
          assertBoxWithin(
            parent.box,
            ancestors.length > 0
              ? contentBoxFromArea(ancestors.at(-1).box, ancestors.at(-1).layout, resolveContext)
              : parent.box,
            `${configuration.name} parent`,
          );
          for (const child of children)
            assertBoxWithin(child.box, parentContent, `${configuration.name} child (${spacing}${unit})`);
        }
      }
    });
  },

  () => {
    test('vertical spacers keep Page and Viewport flow inside padded content', () => {
      const configurations = [
        {
          name: 'Page',
          create: (spacing, unit) => {
            const root = new CompositionArea('compositionArea');
            root.addComponent(fixedDimensionsTransform(320, 200));
            root.addComponent(new Layout(new Map(insetEntries('padding', 20, 20))));
            const page = root.addChild(new Page('page'));
            page.addComponent(fixedDimensionsTransform(280, 160));
            page.addComponent(
              new Layout(
                new Map([['layoutMode', staticProperty('string', 'column')], ...insetEntries('padding', 15, 15)]),
              ),
            );
            page.addComponent(
              new VerticalSpacer(
                new Map([
                  ['spacing', staticProperty('number', spacing)],
                  ['unit', staticProperty('string', unit)],
                ]),
              ),
            );
            const rows = [new Row('row:first'), new Row('row:second')];
            for (const [index, row] of rows.entries()) {
              row.addComponent(fixedDimensionsTransform(100, 60));
              row.addChild(makeWord(`word:${index}`, 'word', { size: 20 }));
              page.addChild(row);
            }
            return { root, parent: page, children: rows, ancestors: [root] };
          },
        },
        {
          name: 'Viewport',
          create: (spacing, unit) => {
            const viewport = new Viewport('viewport');
            viewport.addComponent(fixedDimensionsTransform(320, 200));
            viewport.addComponent(
              new Layout(
                new Map([
                  ['layoutMode', staticProperty('string', 'column')],
                  ['childrenAlignment.horizontalAlignment', staticProperty('string', 'left')],
                  ['childrenAlignment.verticalAlignment', staticProperty('string', 'top')],
                  ...insetEntries('padding', 20, 20),
                ]),
              ),
            );
            const compositionArea = viewport.addChild(new CompositionArea('compositionArea'));
            compositionArea.addComponent(fixedDimensionsTransform(100, 60));
            const image = viewport.addChild(new ImageFlowEntity('image:first'));
            image.addComponent(fixedDimensionsTransform(100, 60));
            viewport.addComponent(
              new VerticalSpacer(
                new Map([
                  ['spacing', staticProperty('number', spacing)],
                  ['unit', staticProperty('string', unit)],
                ]),
              ),
            );
            return { root: viewport, parent: viewport, children: [compositionArea, image], ancestors: [] };
          },
        },
      ];

      for (const configuration of configurations) {
        for (const { spacing, unit } of [
          { spacing: 80, unit: 'pt' },
          { spacing: -80, unit: 'pt' },
          { spacing: 50, unit: '%' },
          { spacing: -50, unit: '%' },
        ]) {
          const { root, parent, children, ancestors } = configuration.create(spacing, unit);
          const resolveContext = ctx();
          layoutScene(root, new Canvas(320, 200).getContext('2d'), resolveContext, { width: 320, height: 200 });
          const parentContent = contentBoxFromArea(parent.box, parent.layout, resolveContext);
          assertBoxWithin(
            parent.box,
            ancestors.length > 0
              ? contentBoxFromArea(ancestors.at(-1).box, ancestors.at(-1).layout, resolveContext)
              : parent.box,
            `${configuration.name} parent`,
          );
          for (const child of children)
            assertBoxWithin(child.box, parentContent, `${configuration.name} child (${spacing}${unit})`);
        }
      }
    });
  },

  () => {
    test('Marker follows the current word without changing row layout', () => {
      const words = [makeWord('w0', 'HELLO'), makeWord('w1', 'WORLD')];
      words[0].state = 'previous';
      words[1].state = 'current';
      const { root, row } = makeLine(words);
      const targetStyle = makeWord('word:current-style', 'WORLD');
      const targetText = targetStyle.getComponent('text');
      const targetStroke = targetText.addEffect(
        new StrokeEffect(
          new Map([
            ['enabled', staticProperty('boolean', true)],
            ['alignment', staticProperty('string', 'outside')],
            ['width', staticProperty('number', 8)],
            ['color', staticProperty('paint', solidPaint('#ff00ff'))],
          ]),
        ),
      );
      const targetShadow = targetText.addEffect(
        new ShadowEffect(
          new Map([
            ['enabled', staticProperty('boolean', true)],
            ['blurRadius', staticProperty('number', 4)],
            ['offset', staticProperty('vector2', { x: 4, y: 8 })],
            ['color', staticProperty('paint', solidPaint('#000000'))],
          ]),
        ),
      );
      words[1].styleSources = { current: targetStyle };
      const marker = row.addChild(
        new Marker('marker', {
          followTarget: 'currentWord',
          anchor: 'bottomCenter',
          offset: { x: 0, y: 10 },
          renderOrder: 'behind',
        }),
      );
      assert.equal(marker.transform.positioning(ctx()), 'absolute');
      assert.deepEqual(
        marker.components.map((component) => component.type),
        ['transform', 'image', 'followTarget', 'markerBehavior'],
      );
      marker.markerBehavior.props.get('styleSource').setBase('targetState');
      marker.markerBehavior.props.get('styleState').setBase('current');

      const canvas = new Canvas(16, 16);
      const context = canvas.getContext('2d');
      layoutScene(root, context, defaultResolveContext({}), { width: 1000, height: 400 });

      assert.ok(marker.box);
      assert.equal(row.box.height, words[0].box.height, 'marker must not increase row height');
      assert.equal(marker.box.x, words[1].box.x + words[1].box.width / 2 - 16);
      assert.equal(marker.box.y, words[1].box.y + words[1].box.height + 10 - 32);
      const appearance = markerAppearance(marker, defaultResolveContext({}));
      assert.deepEqual(appearance.effects, [targetStroke, targetShadow]);
      assert.equal(appearance.imageColorMode, 'solid');
      assert.equal(appearance.effectsContext?.randomizerKey, words[1].randomizerKey);

      const serialized = serializeEntityTree(marker);
      assert.equal(serialized.entity, 'marker');
      const markerComponent = serialized.components.find((component) => component.component === 'markerBehavior');
      const followComponent = serialized.components.find((component) => component.component === 'followTarget');
      const imageComponent = serialized.components.find((component) => component.component === 'image');
      assert.equal(imageComponent?.props.asset.value, 'music-note');
      assert.deepEqual(imageComponent?.props.color.value, solidPaint('#3b82f6'));
      assert.equal(followComponent?.props.target.value, 'currentWord');
      assert.equal(followComponent?.props.anchor.value, 'bottomCenter');
      assert.deepEqual(followComponent?.props.mappings.value, [
        { destination: 'Transform.position.x', source: 'bounds.x', offset: 0 },
        { destination: 'Transform.position.y', source: 'bounds.y', offset: 10 },
      ]);
      assert.equal(markerComponent?.props.styleSource.value, 'targetState');
      assert.equal(markerComponent?.props.styleState.value, 'current');
      assert.equal(markerComponent?.props.renderOrder.value, 'behind');

      const output = renderCaptionFrame(root, defaultResolveContext({}));
      const alphaPixels = output.rgba.filter((_, index) => index % 4 === 3 && output.rgba[index] > 0).length;
      assert.ok(alphaPixels > 0, 'marker render should contribute visible pixels');
      const bounds = contentBounds(root, defaultResolveContext({}));
      marker.markerBehavior.props.get('styleSource').setBase('own');
      const ownStyleBounds = contentBounds(root, defaultResolveContext({}));
      marker.markerBehavior.props.get('styleSource').setBase('targetState');
      assert.ok(bounds);
      assert.ok(
        bounds.y + bounds.height > (ownStyleBounds?.y ?? 0) + (ownStyleBounds?.height ?? 0),
        'inherited marker effects must expand the cropped frame',
      );

      const raw = canonicalViewport({
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
                    components: [
                      {
                        component: 'transform',
                        props: {
                          dimensions: { type: 'vector2', value: { x: 32, y: 32 } },
                        },
                      },
                      {
                        component: 'image',
                        props: {
                          asset: { type: 'string', value: 'music-note' },
                        },
                      },
                      {
                        component: 'followTarget',
                        props: {
                          target: { type: 'string', value: 'currentWord' },
                          anchor: { type: 'string', value: 'center' },
                          mappings: {
                            type: 'array',
                            value: [
                              { destination: 'Transform.position.x', source: 'bounds.x' },
                              { destination: 'Transform.position.y', source: 'bounds.y' },
                            ],
                          },
                        },
                      },
                      {
                        component: 'markerBehavior',
                        props: {
                          styleSource: { type: 'string', value: 'own' },
                          styleState: { type: 'string', value: 'followTarget' },
                          renderOrder: { type: 'string', value: 'inFront' },
                        },
                      },
                      {
                        component: 'animation',
                        dependencyOf: 'markerBehavior',
                        enabled: true,
                        name: 'Marker Target Motion',
                        phase: 'custom',
                        scope: 'self',
                        durationSeconds: 0.25,
                        tracks: [],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });

      const parsedMarker = buildEcsTree(raw).find((entity) => entity.kind === 'marker');
      assert.ok(parsedMarker instanceof Marker);
      assert.equal(parsedMarker.components[0]?.type, 'transform', 'Marker Transform must remain the first component');
      assert.equal(parsedMarker.getComponent('followTarget')?.getProp('target')?.base, 'currentWord');
      assert.deepEqual(
        parsedMarker.components.map((component) => component.type),
        ['transform', 'image', 'followTarget', 'markerBehavior', 'animation'],
      );
      assert.equal(
        parsedMarker.components.find((component) => component.type === 'animation')?.dependencyOf,
        'markerBehavior',
      );
    });
  },

  () => {
    test('layout: positions words left-to-right, centered in the area', () => {
      const words = ['The', 'quick', 'brown'].map((w, i) => makeWord(`w${i}`, w));
      const { root, row } = makeLine(words);

      const canvas = new Canvas(16, 16);
      const context = canvas.getContext('2d');
      layoutScene(root, context, defaultResolveContext({}), {
        width: 1000,
        height: 400,
      });

      // Every entity in the tree receives a box.
      root.traverse((entity) => {
        assert.ok(entity.box, `${entity.id} should have a box`);
      });

      const boxes = words.map((w) => w.box);
      // Words flow left-to-right without overlapping (allow 1px rounding slack).
      for (let i = 1; i < boxes.length; i++) {
        assert.ok(boxes[i].x >= boxes[i - 1].x + boxes[i - 1].width - 1, 'words should not overlap');
      }
      // Natural words share the row's line center, even when glyph metrics differ.
      const rowCenterY = row.box.y + row.box.height / 2;
      assert.ok(
        boxes.every((b) => Math.abs(b.y + b.height / 2 - rowCenterY) < 1),
        'words share the row line center',
      );

      // The row is centered in a 1000x400 area.
      const rowCenterX = row.box.x + row.box.width / 2;
      assert.ok(Math.abs(rowCenterX - 500) < 1, 'row centered horizontally');
      assert.ok(Math.abs(rowCenterY - 200) < 1, 'row centered vertically');
    });
  },

  () => {
    test('layout: natural words keep a shared line center across mixed glyph metrics', () => {
      const words = ['A', 'quick', '😀', 'g'].map((text, index) => makeWord(`w${index}`, text));
      const { root, row } = makeLine(words);

      layoutScene(root, new Canvas(16, 16).getContext('2d'), defaultResolveContext({}), {
        width: 1200,
        height: 400,
      });

      const rowCenterY = row.box.y + row.box.height / 2;
      for (const word of words) {
        assert.ok(word.box, `${word.id} should have a box`);
        assert.ok(
          Math.abs(word.box.y + word.box.height / 2 - rowCenterY) < 1,
          `${word.id} should use the row line center`,
        );
      }
    });
  },

  () => {
    test('layout: stretch alignment distributes row words and fills their cross-axis height', () => {
      const { root, page, row } = makeLine(
        ['A', 'B', 'C'].map((text, index) =>
          makeWord(`w${index}`, text, { size: 20, scaleX: 0.8, pivot: 'centerLeft' }),
        ),
      );
      root.addComponent(fixedDimensionsTransform(400, 200));
      root.addComponent(childrenAlignmentLayout('left', 'top'));
      page.addComponent(fixedDimensionsTransform(400, 200));
      page.addComponent(
        new Layout(
          new Map([
            ['layoutMode', staticProperty('string', 'column')],
            ['childrenAlignment.horizontalAlignment', staticProperty('string', 'left')],
            ['childrenAlignment.verticalAlignment', staticProperty('string', 'top')],
          ]),
        ),
      );
      row.addComponent(fixedDimensionsTransform(400, 40));
      row.addComponent(childrenAlignmentLayout('stretch', 'stretch'));

      layoutScene(root, new Canvas(1, 1).getContext('2d'), defaultResolveContext({}), { width: 400, height: 200 });

      const words = row.children;
      assert.equal(words[0].box.x, row.box.x);
      assert.equal(words[0].box.height, row.box.height);
      assert.ok(
        Math.abs(
          words[words.length - 1].box.x + words[words.length - 1].box.width * 0.8 - (row.box.x + row.box.width),
        ) < 1,
      );
      for (const word of words) {
        const naturalWidth = word
          .getComponent('text')
          .measure(new Canvas(1, 1).getContext('2d'), word.contextFor(defaultResolveContext({})), word.text).width;
        assert.ok(Math.abs(word.box.width - naturalWidth) < 1);
      }
      assert.ok(words[1].box.x > words[0].box.x + words[0].box.width);
    });
  },

  () => {
    test('layout: single-item stretch alignment positions one word and can justify its letters', () => {
      const alignments = ['start', 'center', 'end'];
      for (const alignment of alignments) {
        const word = makeWord(`word-${alignment}`, 'Stretch', { size: 20 });
        const { root, page, row } = makeLine([word]);
        root.addComponent(fixedDimensionsTransform(400, 200));
        root.addComponent(childrenAlignmentLayout('left', 'top'));
        page.addComponent(fixedDimensionsTransform(400, 200));
        page.addComponent(
          new Layout(
            new Map([
              ['layoutMode', staticProperty('string', 'column')],
              ['childrenAlignment.horizontalAlignment', staticProperty('string', 'left')],
              ['childrenAlignment.verticalAlignment', staticProperty('string', 'top')],
            ]),
          ),
        );
        row.addComponent(fixedDimensionsTransform(400, 40));
        row.addComponent(childrenAlignmentLayout('stretch', 'center', alignment));
        const naturalWidth = word
          .getComponent('text')
          .measure(new Canvas(1, 1).getContext('2d'), word.contextFor(defaultResolveContext({})), word.text).width;

        layoutScene(root, new Canvas(1, 1).getContext('2d'), defaultResolveContext({}), { width: 400, height: 200 });

        const expectedX =
          alignment === 'start'
            ? row.box.x
            : alignment === 'center'
              ? row.box.x + (row.box.width - naturalWidth) / 2
              : row.box.x + row.box.width - naturalWidth;
        assert.ok(Math.abs(word.box.x - expectedX) < 1, `${alignment} should position one word`);
      }

      const word = makeWord('word-justify', 'Stretch', { scaleX: 0.8, pivot: 'centerLeft' });
      const { root, page, row } = makeLine([word]);
      root.addComponent(fixedDimensionsTransform(400, 200));
      root.addComponent(childrenAlignmentLayout('left', 'top'));
      page.addComponent(fixedDimensionsTransform(400, 200));
      page.addComponent(
        new Layout(
          new Map([
            ['layoutMode', staticProperty('string', 'column')],
            ['childrenAlignment.horizontalAlignment', staticProperty('string', 'left')],
            ['childrenAlignment.verticalAlignment', staticProperty('string', 'top')],
          ]),
        ),
      );
      row.addComponent(fixedDimensionsTransform(400, 40));
      row.addComponent(childrenAlignmentLayout('stretch', 'center', 'justify'));

      layoutScene(root, new Canvas(1, 1).getContext('2d'), defaultResolveContext({}), { width: 400, height: 200 });

      assert.ok(Math.abs(word.box.width * 0.8 - row.box.width) < 1);
      const justifiedContext = word.contextFor(defaultResolveContext({}));
      assert.ok(justifiedContext.letterSpacingOverride > 0);
      const justifiedWidth = word
        .getComponent('text')
        .measure(new Canvas(1, 1).getContext('2d'), justifiedContext, word.text).width;
      assert.ok(Math.abs(justifiedWidth * 0.8 - row.box.width) < 1);
    });
  },

  () => {
    test('layout: scaled single-item stretch alignment honors the word pivot', () => {
      for (const [alignment, pivot] of [
        ['start', 'centerLeft'],
        ['center', 'center'],
        ['end', 'centerRight'],
      ]) {
        const word = makeWord(`word-${alignment}-pivot`, 'Stretch', { size: 20, scaleX: 0.8, pivot });
        const { root, page, row } = makeLine([word]);
        root.addComponent(fixedDimensionsTransform(400, 200));
        root.addComponent(childrenAlignmentLayout('left', 'top'));
        page.addComponent(fixedDimensionsTransform(400, 200));
        page.addComponent(
          new Layout(
            new Map([
              ['layoutMode', staticProperty('string', 'column')],
              ['childrenAlignment.horizontalAlignment', staticProperty('string', 'left')],
              ['childrenAlignment.verticalAlignment', staticProperty('string', 'top')],
            ]),
          ),
        );
        row.addComponent(fixedDimensionsTransform(400, 40));
        row.addComponent(childrenAlignmentLayout('stretch', 'center', alignment));

        const context = defaultResolveContext({});
        layoutScene(root, new Canvas(1, 1).getContext('2d'), context, { width: 400, height: 200 });

        const transformPivot = resolveTransformPivot(word, context);
        const scaleX = 0.8;
        const left = Math.min(
          transformPivot.x + (word.box.x - transformPivot.x) * scaleX,
          transformPivot.x + (word.box.x + word.box.width - transformPivot.x) * scaleX,
        );
        const right = Math.max(
          transformPivot.x + (word.box.x - transformPivot.x) * scaleX,
          transformPivot.x + (word.box.x + word.box.width - transformPivot.x) * scaleX,
        );
        const expectedLeft =
          alignment === 'start'
            ? row.box.x
            : alignment === 'center'
              ? row.box.x + (row.box.width - (right - left)) / 2
              : row.box.x + row.box.width - (right - left);
        const expectedRight = expectedLeft + (right - left);
        assert.ok(Math.abs(left - expectedLeft) < 1, `${alignment} should preserve the scaled visual left edge`);
        assert.ok(Math.abs(right - expectedRight) < 1, `${alignment} should preserve the scaled visual right edge`);
      }
    });
  },

  () => {
    test('layout: Word SelfLayout stretch alignment positions a wrapped fragment', () => {
      const alignments = ['start', 'center', 'end'];
      for (const alignment of alignments) {
        const word = makeWord(`self-word-${alignment}`, 'Fragment', { size: 20 });
        word.addComponent(
          new SelfLayout(
            new Map([
              ['horizontalAlignment', staticProperty('string', 'stretch')],
              ['horizontalSingleItemAlignment', staticProperty('string', alignment)],
            ]),
          ),
        );
        const { root, page, row } = makeLine([word]);
        root.addComponent(fixedDimensionsTransform(400, 200));
        root.addComponent(childrenAlignmentLayout('left', 'top'));
        page.addComponent(fixedDimensionsTransform(400, 200));
        page.addComponent(
          new Layout(
            new Map([
              ['layoutMode', staticProperty('string', 'column')],
              ['childrenAlignment.horizontalAlignment', staticProperty('string', 'left')],
              ['childrenAlignment.verticalAlignment', staticProperty('string', 'top')],
            ]),
          ),
        );
        row.addComponent(fixedDimensionsTransform(400, 40));
        row.addComponent(childrenAlignmentLayout('center', 'center'));
        const naturalWidth = word
          .getComponent('text')
          .measure(new Canvas(1, 1).getContext('2d'), word.contextFor(defaultResolveContext({})), word.text).width;

        layoutScene(root, new Canvas(1, 1).getContext('2d'), defaultResolveContext({}), { width: 400, height: 200 });

        const expectedX =
          alignment === 'start'
            ? row.box.x
            : alignment === 'center'
              ? row.box.x + (row.box.width - naturalWidth) / 2
              : row.box.x + row.box.width - naturalWidth;
        assert.ok(Math.abs(word.box.x - expectedX) < 1, `SelfLayout ${alignment} should position one fragment`);
      }

      const word = makeWord('self-word-justify', 'Fragment');
      word.addComponent(
        new SelfLayout(
          new Map([
            ['horizontalAlignment', staticProperty('string', 'stretch')],
            ['horizontalSingleItemAlignment', staticProperty('string', 'justify')],
          ]),
        ),
      );
      const { root, page, row } = makeLine([word]);
      root.addComponent(fixedDimensionsTransform(400, 200));
      root.addComponent(childrenAlignmentLayout('left', 'top'));
      page.addComponent(fixedDimensionsTransform(400, 200));
      page.addComponent(
        new Layout(
          new Map([
            ['layoutMode', staticProperty('string', 'column')],
            ['childrenAlignment.horizontalAlignment', staticProperty('string', 'left')],
            ['childrenAlignment.verticalAlignment', staticProperty('string', 'top')],
          ]),
        ),
      );
      row.addComponent(fixedDimensionsTransform(400, 40));
      row.addComponent(childrenAlignmentLayout('center', 'center'));

      layoutScene(root, new Canvas(1, 1).getContext('2d'), defaultResolveContext({}), { width: 400, height: 200 });

      assert.equal(word.box.width, row.box.width);
      assert.ok(word.contextFor(defaultResolveContext({})).letterSpacingOverride > 0);
    });
  },

  () => {
    test('layout: vertical single-item stretch alignment positions one word', () => {
      for (const alignment of ['start', 'center', 'end', 'justify']) {
        const word = makeWord(`vertical-word-${alignment}`, 'Stretch', { size: 20 });
        const { root, page, row } = makeLine([word]);
        root.addComponent(fixedDimensionsTransform(400, 200));
        root.addComponent(childrenAlignmentLayout('left', 'top'));
        page.addComponent(fixedDimensionsTransform(400, 200));
        page.addComponent(
          new Layout(
            new Map([
              ['layoutMode', staticProperty('string', 'column')],
              ['childrenAlignment.horizontalAlignment', staticProperty('string', 'left')],
              ['childrenAlignment.verticalAlignment', staticProperty('string', 'top')],
            ]),
          ),
        );
        row.addComponent(fixedDimensionsTransform(400, 40));
        row.addComponent(childrenAlignmentLayout('left', 'stretch', undefined, alignment));

        layoutScene(root, new Canvas(1, 1).getContext('2d'), defaultResolveContext({}), { width: 400, height: 200 });
        const expectedY =
          alignment === 'start'
            ? row.box.y
            : alignment === 'center'
              ? row.box.y + (row.box.height - word.box.height) / 2
              : alignment === 'end'
                ? row.box.y + row.box.height - word.box.height
                : row.box.y;
        assert.ok(
          Math.abs(word.box.y - expectedY) < 1,
          `${alignment} should position one word vertically (actual ${word.box.y}, expected ${expectedY}, row ${row.box.y}/${row.box.height}, word ${word.box.height})`,
        );
        if (alignment === 'justify') {
          assert.equal(word.box.height, row.box.height);
          assert.ok(word.textVerticalScale > 1, 'vertical justify should scale the word glyph to fill the row');
        }
      }
    });
  },

  () => {
    test('layout: vertical single-item stretch alignment positions and stretches one page child', () => {
      for (const alignment of ['start', 'center', 'end', 'justify']) {
        const { root, page, row } = makeLine([makeWord(`page-word-${alignment}`, 'Stretch', { size: 20 })]);
        root.addComponent(fixedDimensionsTransform(400, 200));
        root.addComponent(childrenAlignmentLayout('left', 'top'));
        page.addComponent(fixedDimensionsTransform(400, 200));
        page.addComponent(
          new Layout(
            new Map([
              ['layoutMode', staticProperty('string', 'column')],
              ['childrenAlignment.horizontalAlignment', staticProperty('string', 'left')],
              ['childrenAlignment.verticalAlignment', staticProperty('string', 'stretch')],
              ['childrenAlignment.verticalSingleItemAlignment', staticProperty('string', alignment)],
            ]),
          ),
        );
        row.addComponent(fixedDimensionsTransform(400, 20));

        layoutScene(root, new Canvas(1, 1).getContext('2d'), defaultResolveContext({}), { width: 400, height: 200 });

        const expectedY =
          alignment === 'start'
            ? page.box.y
            : alignment === 'center'
              ? page.box.y + (page.box.height - row.box.height) / 2
              : page.box.y + page.box.height - row.box.height;
        assert.ok(
          Math.abs(row.box.y - expectedY) < 1,
          `${alignment} should position one page child vertically (actual ${row.box.y}, expected ${expectedY}, page ${page.box.y}/${page.box.height}, row ${row.box.height})`,
        );
        if (alignment === 'justify') {
          assert.equal(row.box.height, page.box.height);
          assert.ok(row.parentLayoutScaleY > 1, 'vertical page justify should scale the Row subtree');
        }
      }
    });
  },

  () => {
    test('layout: horizontal single-item stretch scales one page Row child', () => {
      const word = makeWord('page-horizontal-stretch-word', 'Stretch', { size: 20 });
      const { root, page, row } = makeLine([word]);
      root.addComponent(fixedDimensionsTransform(400, 200));
      root.addComponent(childrenAlignmentLayout('left', 'top'));
      page.addComponent(fixedDimensionsTransform(400, 200));
      page.addComponent(
        new Layout(
          new Map([
            ['layoutMode', staticProperty('string', 'row')],
            ['childrenAlignment.horizontalAlignment', staticProperty('string', 'stretch')],
            ['childrenAlignment.verticalAlignment', staticProperty('string', 'top')],
            ['childrenAlignment.horizontalSingleItemAlignment', staticProperty('string', 'justify')],
          ]),
        ),
      );
      row.addComponent(fixedDimensionsTransform(40, 40));
      row.addComponent(childrenAlignmentLayout('left', 'center'));

      layoutScene(root, new Canvas(1, 1).getContext('2d'), defaultResolveContext({}), { width: 400, height: 200 });

      assert.equal(row.box.width, page.box.width);
      assert.equal(row.parentLayoutManagedWidth, true);
      assert.ok(row.parentLayoutScaleX > 1, 'horizontal page justify should scale the Row subtree');
    });
  },

  () => {
    test('layout: Word SelfLayout vertical stretch alignment positions a wrapped fragment', () => {
      for (const alignment of ['start', 'center', 'end']) {
        const word = makeWord(`self-vertical-word-${alignment}`, 'Stretch', { size: 20 });
        word.addComponent(
          new SelfLayout(
            new Map([
              ['verticalAlignment', staticProperty('string', 'stretch')],
              ['verticalSingleItemAlignment', staticProperty('string', alignment)],
            ]),
          ),
        );
        const { root, page, row } = makeLine([word]);
        root.addComponent(fixedDimensionsTransform(400, 200));
        root.addComponent(childrenAlignmentLayout('left', 'top'));
        page.addComponent(fixedDimensionsTransform(400, 200));
        page.addComponent(
          new Layout(
            new Map([
              ['layoutMode', staticProperty('string', 'column')],
              ['childrenAlignment.horizontalAlignment', staticProperty('string', 'left')],
              ['childrenAlignment.verticalAlignment', staticProperty('string', 'top')],
            ]),
          ),
        );
        row.addComponent(fixedDimensionsTransform(400, 40));
        row.addComponent(childrenAlignmentLayout('left', 'center'));

        layoutScene(root, new Canvas(1, 1).getContext('2d'), defaultResolveContext({}), { width: 400, height: 200 });

        const expectedY =
          alignment === 'start'
            ? row.box.y
            : alignment === 'center'
              ? row.box.y + (row.box.height - word.box.height) / 2
              : row.box.y + row.box.height - word.box.height;
        assert.ok(
          Math.abs(word.box.y - expectedY) < 1,
          `SelfLayout ${alignment} should position one fragment vertically`,
        );
      }
    });
  },

  () => {
    test('layout: stretch alignment distributes rows across a column page', () => {
      const root = new CompositionArea('compositionArea');
      root.addComponent(fixedDimensionsTransform(400, 200));
      root.addComponent(childrenAlignmentLayout('left', 'top'));
      const page = root.addChild(new Page('page'));
      page.addComponent(fixedDimensionsTransform(400, 200));
      page.addComponent(
        new Layout(
          new Map([
            ['layoutMode', staticProperty('string', 'column')],
            ['childrenAlignment.horizontalAlignment', staticProperty('string', 'stretch')],
            ['childrenAlignment.verticalAlignment', staticProperty('string', 'stretch')],
          ]),
        ),
      );
      const rows = [0, 1].map((index) => {
        const row = page.addChild(new Row(`row-${index}`));
        row.addComponent(fixedDimensionsTransform(100, 20));
        row.addChild(makeWord(`word-${index}`, 'A', { size: 20 }));
        return row;
      });

      layoutScene(root, new Canvas(1, 1).getContext('2d'), defaultResolveContext({}), { width: 400, height: 200 });

      assert.equal(rows[0].box.x, page.box.x);
      assert.equal(rows[0].box.width, page.box.width);
      assert.equal(rows[1].box.x, page.box.x);
      assert.equal(rows[1].box.width, page.box.width);
      assert.equal(rows[0].box.y, page.box.y);
      assert.equal(rows[1].box.y + rows[1].box.height, page.box.y + page.box.height);
    });
  },

  () => {
    test('layout: Transform position and dimensions resolve locally through page, row, and word', () => {
      const viewport = new Viewport('viewport');
      viewport.addComponent(new Transform(new Map([['dimensions', staticProperty('vector2', { x: 400, y: 300 })]])));
      viewport.addComponent(
        new Layout(
          new Map([
            ...insetEntries('padding', 0, 0),
            ['childrenAlignment.horizontalAlignment', staticProperty('string', 'left')],
            ['childrenAlignment.verticalAlignment', staticProperty('string', 'top')],
          ]),
        ),
      );

      const compositionArea = viewport.addChild(new CompositionArea('compositionArea'));
      compositionArea.addComponent(
        new Transform(
          new Map([
            ['position', staticProperty('vector2', { x: 20, y: 10 })],
            ['dimensions', staticProperty('vector2', { x: 300, y: 200 })],
          ]),
        ),
      );
      compositionArea.addComponent(
        new Layout(
          new Map([
            ...insetEntries('padding', 0, 0),
            ['childrenAlignment.horizontalAlignment', staticProperty('string', 'left')],
            ['childrenAlignment.verticalAlignment', staticProperty('string', 'top')],
          ]),
        ),
      );

      const page = compositionArea.addChild(new Page('page'));
      page.addComponent(
        new Transform(
          new Map([
            ['position', staticProperty('vector2', { x: 10, y: 15 })],
            ['dimensions', staticProperty('vector2', { x: 200, y: 120 })],
          ]),
        ),
      );
      page.addComponent(
        new Layout(
          new Map([
            ['childrenAlignment.horizontalAlignment', staticProperty('string', 'left')],
            ['childrenAlignment.verticalAlignment', staticProperty('string', 'top')],
          ]),
        ),
      );
      const row = page.addChild(new Row('row'));
      row.addComponent(
        new Transform(
          new Map([
            ['position', staticProperty('vector2', { x: 5, y: 6 })],
            ['dimensions', staticProperty('vector2', { x: 100, y: 40 })],
          ]),
        ),
      );

      const word = row.addChild(makeWord('word', ''));
      word.addComponent(
        new Transform(
          new Map([
            ['position', staticProperty('vector2', { x: 7, y: 8 })],
            ['dimensions', staticProperty('vector2', { x: 60, y: 20 })],
          ]),
        ),
      );
      word.addComponent(
        new BackgroundStyle(new Map([['fill', staticProperty('paint', solidPaint('rgb(255, 0, 0)'))]])),
      );

      const canvas = new Canvas(400, 300);
      layoutScene(viewport, canvas.getContext('2d'), ctx(), { width: 400, height: 300 });

      assert.deepEqual(compositionArea.box, { x: 20, y: 10, width: 300, height: 200 });
      assert.deepEqual(page.box, { x: 30, y: 25, width: 200, height: 120 });
      assert.deepEqual(row.box, { x: 35, y: 31, width: 100, height: 40 });
      assert.deepEqual(word.box, { x: 42, y: 39, width: 60, height: 20 });

      page.getComponent('transform').props.set('position', staticProperty('vector2', { x: 25, y: 35 }));
      layoutScene(viewport, canvas.getContext('2d'), ctx(), { width: 400, height: 300 });
      assert.deepEqual(page.box, { x: 45, y: 45, width: 200, height: 120 });
      assert.deepEqual(row.box, { x: 50, y: 51, width: 100, height: 40 });
      assert.deepEqual(word.box, { x: 57, y: 59, width: 60, height: 20 });

      renderScene(viewport, canvas.getContext('2d'), ctx());
      assert.equal(
        canvas.getContext('2d').getImageData(60, 65, 1, 1).data[0],
        255,
        'word should render at its local-parent position',
      );
      assert.equal(
        canvas.getContext('2d').getImageData(110, 84, 1, 1).data[3],
        0,
        'word position should not be applied twice',
      );

      canvas.getContext('2d').clearRect(0, 0, 400, 300);
      const pagePosition = page.getComponent('transform').getProp('position');
      renderScene(
        viewport,
        canvas.getContext('2d'),
        ctx({ animationOverrides: new Map([[pagePosition, { x: 35, y: 45 }]]) }),
      );
      assert.equal(
        canvas.getContext('2d').getImageData(70, 75, 1, 1).data[0],
        255,
        'animated parent position should move its subtree',
      );
      assert.equal(
        canvas.getContext('2d').getImageData(60, 65, 1, 1).data[3],
        0,
        'settled position should not be painted twice',
      );
    });
  },

  () => {
    test('layout: flow children honor Transform position and dimensions without SelfLayout', () => {
      const viewport = new Viewport('viewport');
      viewport.addComponent(new Transform(new Map([['dimensions', staticProperty('vector2', { x: 400, y: 200 })]])));
      viewport.addComponent(
        new Layout(
          new Map([
            ['layoutMode', staticProperty('string', 'row')],
            ...insetEntries('padding', 0, 0),
            ['childrenAlignment.horizontalAlignment', staticProperty('string', 'left')],
            ['childrenAlignment.verticalAlignment', staticProperty('string', 'top')],
          ]),
        ),
      );

      const compositionArea = viewport.addChild(new CompositionArea('compositionArea'));
      compositionArea.addComponent(
        new Transform(
          new Map([
            ['position', staticProperty('vector2', { x: 7, y: 9 })],
            ['dimensions', staticProperty('vector2', { x: 120, y: 100 })],
          ]),
        ),
      );
      compositionArea.addComponent(new Layout(new Map(insetEntries('padding', 0, 0))));

      const videoArea = viewport.addChild(new VideoArea('videoArea'));
      videoArea.addComponent(
        new Transform(
          new Map([
            ['position', staticProperty('vector2', { x: 3, y: 4 })],
            ['dimensions', staticProperty('vector2', { x: 80, y: 100 })],
          ]),
        ),
      );
      videoArea.addComponent(new Layout(new Map(insetEntries('padding', 0, 0))));

      layoutScene(viewport, new Canvas(16, 16).getContext('2d'), ctx(), { width: 400, height: 200 });

      assert.deepEqual(compositionArea.box, { x: 7, y: 9, width: 120, height: 100 });
      assert.deepEqual(videoArea.box, { x: 123, y: 4, width: 80, height: 100 });

      compositionArea.transform.props.set('positioning', staticProperty('string', 'absolute'));
      layoutScene(viewport, new Canvas(16, 16).getContext('2d'), ctx(), { width: 400, height: 200 });

      assert.deepEqual(compositionArea.box, { x: 7, y: 9, width: 120, height: 100 });
      assert.deepEqual(videoArea.box, { x: 3, y: 4, width: 80, height: 100 });
    });
  },

  () => {
    test('layout: viewport flow keeps composition/video order in row and column modes', () => {
      const design = (layoutMode, children) => ({
        entity: 'viewport',
        id: 'viewport',
        components: [{ component: 'layout', props: { layoutMode: { type: 'string', value: layoutMode } } }],
        children: children.map((entity) => (entity === 'video' ? canonicalVideoArea() : { entity, id: entity })),
      });
      const layout = (root) => {
        layoutScene(root, new Canvas(16, 16).getContext('2d'), defaultResolveContext({}), { width: 1200, height: 800 });
      };

      const row = buildEcsTree(design('row', ['compositionArea', 'video']));
      layout(row);
      assert.equal(row.compositionArea.box.x, row.box.x);
      assert.equal(row.video.box.x, row.compositionArea.box.x + row.compositionArea.box.width);
      assert.equal(row.video.box.y, row.compositionArea.box.y);

      const column = buildEcsTree(design('column', ['video', 'compositionArea']));
      layout(column);
      assert.equal(column.video.box.y, column.box.y);
      assert.equal(column.compositionArea.box.y, column.video.box.y + column.video.box.height);
      assert.equal(column.compositionArea.box.x, column.video.box.x);
    });
  },

  () => {
    test('layout: video auto sizing preserves authored dimensions and anchors oversized content', () => {
      const root = buildEcsTree({
        entity: 'viewport',
        id: 'viewport',
        children: [
          canonicalVideoArea({
            entity: 'video',
            id: 'video',
            components: [
              {
                component: 'transform',
                props: {
                  dimensions: { type: 'vector2', value: { x: 1080, y: 512 } },
                  widthMode: { type: 'string', value: 'fitContent' },
                  heightMode: { type: 'string', value: 'fitContent' },
                },
              },
              {
                component: 'selfLayout',
                props: {
                  enabled: { type: 'boolean', value: true },
                  aspectRatio: { type: 'string', value: 'maintain' },
                  horizontalAlignment: { type: 'string', value: 'right' },
                  verticalAlignment: { type: 'string', value: 'top' },
                },
              },
            ],
          }),
          { entity: 'compositionArea', id: 'compositionArea' },
        ],
      });

      layoutScene(root, new Canvas(16, 16).getContext('2d'), ctx(), { width: 512, height: 512 });

      assert.equal(root.video.box.width, 1080);
      assert.equal(root.video.box.height, 512);
      assert.equal(root.video.box.x + root.video.box.width, 512);
      assert.equal(root.video.box.y, 0);
    });
  },

  () => {
    test('layout: VideoArea owns the clipping frame for an oversized nested Video', () => {
      const root = buildEcsTree({
        entity: 'viewport',
        id: 'viewport',
        children: [
          {
            entity: 'videoArea',
            id: 'videoArea',
            components: [
              {
                component: 'layout',
                props: {
                  dimensions: { type: 'vector2', value: { x: 100, y: 100 } },
                  clipContent: { type: 'boolean', value: true },
                },
              },
            ],
            children: [
              {
                entity: 'video',
                id: 'video',
                components: [
                  {
                    component: 'transform',
                    props: {
                      dimensions: { type: 'vector2', value: { x: 1080, y: 512 } },
                      widthMode: { type: 'string', value: 'fitContent' },
                      heightMode: { type: 'string', value: 'fitContent' },
                    },
                  },
                  {
                    component: 'selfLayout',
                    props: {
                      horizontalAlignment: { type: 'string', value: 'right' },
                      verticalAlignment: { type: 'string', value: 'top' },
                    },
                  },
                ],
              },
            ],
          },
          { entity: 'compositionArea', id: 'compositionArea' },
        ],
      });

      layoutScene(root, new Canvas(16, 16).getContext('2d'), ctx(), { width: 512, height: 512 });

      assert.ok(root.videoArea instanceof VideoArea);
      assert.deepEqual(root.videoArea.box, { x: 0, y: 0, width: 512, height: 512 });
      assert.deepEqual(contentClipBox(root.videoArea, ctx()), { x: -256, y: -256, width: 512, height: 512 });
      assert.equal(root.video.box.width, 1080);
      assert.equal(root.video.box.height, 512);
      assert.equal(root.video.box.x + root.video.box.width, 512);
    });
  },

  () => {
    test('pipeline: wrapping measures each logical word with its runtime randomized font', async () => {
      const preset = loadEcsPreset('love-story.json');
      const words = ['one', 'two', 'documentaries'];
      const starts = words.map((_, index) => index * 0.5);
      const ends = starts.map((start) => start + 0.4);
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
        fps: 2,
        debug: true,
      });

      const renderedWords = result.debugLayout.frames.flatMap((frame) => frame.words).map((word) => word.word);

      assert.ok(renderedWords.includes('documentaries'));
      assert.equal(
        renderedWords.some((word) => word !== 'documentaries' && word.toLowerCase().includes('documentar')),
        false,
        'the smaller runtime font must keep the logical word on one row',
      );
    });
  },

  () => {
    test('pipeline: words that fit the visible composition width do not wrap at the grouping edge reserve', async () => {
      const preset = loadEcsPreset('hip-hop.json');
      const captionLayout = {
        ...preset.captionLayout,
        breaking: {
          ...preset.captionLayout.breaking,
          wordWrapping: {
            ...preset.captionLayout.breaking.wordWrapping,
            overflowTolerance: 0,
          },
        },
      };
      const renderWord = (word) =>
        generatePipeline({
          videoResolution: { width: 1080, height: 1920 },
          timestamps: {
            words: [word],
            word_start_times_seconds: [0],
            word_end_times_seconds: [1],
          },
          design: structuredClone(preset.design),
          captionLayout,
          stateWindow: preset.stateWindow,
          fps: 2,
          debug: true,
        });

      for (const word of ['docume', 'documen', 'document']) {
        const fitting = await renderWord(word);
        const fittingWords = [
          ...new Set(fitting.debugLayout.frames.flatMap((frame) => frame.words).map((entry) => entry.word)),
        ];
        assert.deepEqual(fittingWords, [word]);
        assert.equal(fitting.captionInfos.length, 1);
      }

      const hyphenated = await renderWord('documentar');
      const hyphenatedWords = [
        ...new Set(hyphenated.debugLayout.frames.flatMap((frame) => frame.words).map((entry) => entry.word)),
      ];
      assert.deepEqual(hyphenatedWords, ['document-', 'ar']);

      const oversized = await renderWord('documentaries');
      const oversizedWords = [
        ...new Set(oversized.debugLayout.frames.flatMap((frame) => frame.words).map((word) => word.word)),
      ];
      assert.ok(oversizedWords.length > 1);
      assert.ok(oversizedWords.some((word) => word !== 'documentaries'));
    });
  },

  () => {
    test('pipeline: Dialog reserves direct Page flow images before wrapping Rows', async () => {
      const preset = loadEcsPreset('dialog.json');
      const design = structuredClone(preset.design);
      const page = design.children
        .find((child) => child.entity === 'compositionArea')
        .children.find((child) => child.entity === 'page');
      const speakerImage = page.children.find((child) => child.entity === 'image');
      speakerImage.components.find((component) => component.component === 'transform').props.dimensions.value.x = 300;

      const words = Array(10).fill('DIALOGUE');
      const result = await generatePipeline({
        videoResolution: { width: 1920, height: 1080 },
        timestamps: {
          words,
          word_start_times_seconds: words.map((_, index) => index * 0.1),
          word_end_times_seconds: words.map((_, index) => index * 0.1 + 0.09),
          break_before: words.map(() => false),
        },
        design,
        stateWindow: preset.stateWindow,
        captionLayout: preset.captionLayout,
        fps: 1,
        debug: true,
        collectFrames: false,
      });

      for (const frame of result.debugLayout.frames) {
        if (!frame.page) continue;
        for (const row of frame.rows) {
          assert.ok(row.left >= frame.page.left - 0.001, 'Dialog Row must stay inside the Page left edge');
          assert.ok(row.right <= frame.page.right + 0.001, 'Dialog Row must stay inside the Page right edge');
        }
        for (const word of frame.words) {
          assert.ok(word.topLeft.x >= frame.page.left - 0.001, 'Dialog word must stay inside the Page left edge');
          assert.ok(word.topRight.x <= frame.page.right + 0.001, 'Dialog word must stay inside the Page right edge');
        }
      }
    });
  },

  () => {
    test('layout: alignment options move the row within the area', () => {
      // A compositionArea with no Layout gets the default safe-area inset, so
      // alignment pins to the inset content box, not the raw frame edges.
      const SAFE = 100;
      const build = () => makeLine(['left', 'right'].map((w, i) => makeWord(`a${i}`, w)));
      const canvas = new Canvas(16, 16);
      const context = canvas.getContext('2d');

      const leftTop = build();
      layoutScene(leftTop.root, context, defaultResolveContext({}), {
        width: 1000,
        height: 400,
        horizontalAlign: 'left',
        verticalAlign: 'top',
      });
      assert.ok(Math.abs(leftTop.row.box.x - SAFE) < 1, 'left align pins to content left');
      assert.ok(Math.abs(leftTop.row.box.y - SAFE) < 1, 'top align pins to content top');

      const rightBottom = build();
      layoutScene(rightBottom.root, context, defaultResolveContext({}), {
        width: 1000,
        height: 400,
        horizontalAlign: 'right',
        verticalAlign: 'bottom',
      });
      const right = rightBottom.row.box;
      assert.ok(Math.abs(right.x + right.width - (1000 - SAFE)) < 1, 'right align pins right');
      assert.ok(Math.abs(right.y + right.height - (400 - SAFE)) < 1, 'bottom align pins bottom');
    });
  },

  () => {
    test('layout: alignment modes cascade through CompositionArea, Page, and Row', () => {
      const alignmentCases = [
        { horizontal: 'left', vertical: 'top' },
        { horizontal: 'center', vertical: 'center' },
        { horizontal: 'right', vertical: 'bottom' },
      ];
      const place = (start, available, size, alignment) =>
        alignment === 'center'
          ? start + (available - size) / 2
          : alignment === 'right' || alignment === 'bottom'
            ? start + available - size
            : start;

      for (const { horizontal, vertical } of alignmentCases) {
        const viewport = new Viewport('viewport');
        viewport.addComponent(fixedDimensionsTransform(1000, 800));
        viewport.addComponent(childrenAlignmentLayout(horizontal, vertical));

        const compositionArea = viewport.addChild(new CompositionArea('compositionArea'));
        compositionArea.addComponent(fixedDimensionsTransform(600, 400));
        compositionArea.addComponent(childrenAlignmentLayout(horizontal, vertical));

        const page = compositionArea.addChild(new Page('page'));
        page.addComponent(fixedDimensionsTransform(300, 200));
        page.addComponent(childrenAlignmentLayout(horizontal, vertical));

        const row = page.addChild(new Row('row'));
        row.addComponent(fixedDimensionsTransform(100, 80));
        row.addComponent(childrenAlignmentLayout(horizontal, vertical));
        const word = row.addChild(makeWord('word', 'A', { size: 20 }));

        layoutScene(viewport, new Canvas(1, 1).getContext('2d'), defaultResolveContext({}), {
          width: 1000,
          height: 800,
        });

        assert.equal(compositionArea.box.x, place(0, 1000, 600, horizontal));
        assert.equal(compositionArea.box.y, place(0, 800, 400, vertical));
        assert.equal(page.box.x, place(compositionArea.box.x, 600, 300, horizontal));
        assert.equal(page.box.y, place(compositionArea.box.y, 400, 200, vertical));
        assert.equal(row.box.x, place(page.box.x, 300, 100, horizontal));
        assert.equal(row.box.y, place(page.box.y, 200, 80, vertical));
        assert.ok(Math.abs(word.box.x - place(row.box.x, row.box.width, word.box.width, horizontal)) < 1);
        assert.ok(Math.abs(word.box.y - place(row.box.y, row.box.height, word.box.height, vertical)) < 1);
      }
    });
  },

  () => {
    test('layout: clamped fit-parent pages keep rows aligned after page position correction', () => {
      for (const verticalAlignment of ['top', 'center', 'bottom']) {
        const root = new CompositionArea('compositionArea');
        root.addComponent(new Transform(new Map([['dimensions', staticProperty('vector2', { x: 1000, y: 400 })]])));
        root.addComponent(
          new Layout(
            new Map([
              ...insetEntries('padding', 0, 0),
              ['childrenAlignment.verticalAlignment', staticProperty('string', verticalAlignment)],
            ]),
          ),
        );
        const page = root.addChild(new Page('page'));
        page.addComponent(
          new Transform(
            new Map([
              ['position', staticProperty('vector2', { x: 0, y: -180 })],
              ['widthMode', staticProperty('string', 'fitParent')],
              ['heightMode', staticProperty('string', 'fitParent')],
            ]),
          ),
        );
        const row = page.addChild(new Row('row'));
        row.addChild(makeWord('word', 'VISIBLE', { size: 30 }));

        layoutScene(root, new Canvas(1, 1).getContext('2d'), defaultResolveContext({}), {
          width: 1000,
          height: 400,
        });

        assert.equal(page.box.y, 0);
        const expectedTop =
          verticalAlignment === 'top'
            ? page.box.y
            : verticalAlignment === 'center'
              ? page.box.y + (page.box.height - row.box.height) / 2
              : page.box.y + page.box.height - row.box.height;
        assert.ok(
          Math.abs(row.box.y - expectedTop) < 1,
          `${verticalAlignment} alignment should follow the corrected Page box`,
        );
      }
    });
  },

  () => {
    test('layout: Page and Row fitParent sizes use each parent content box', () => {
      const root = new CompositionArea('compositionArea');
      root.addComponent(fixedDimensionsTransform(800, 400));
      root.addComponent(new Layout(new Map(insetEntries('padding', 40, 20))));

      const page = root.addChild(new Page('page'));
      page.addComponent(
        new Transform(
          new Map([
            ['widthMode', staticProperty('string', 'fitParent')],
            ['heightMode', staticProperty('string', 'fitParent')],
          ]),
        ),
      );
      page.addComponent(new Layout(new Map(insetEntries('padding', 10, 5))));

      const row = page.addChild(new Row('row'));
      row.addComponent(
        new Transform(
          new Map([
            ['widthMode', staticProperty('string', 'fitParent')],
            ['heightMode', staticProperty('string', 'fitParent')],
          ]),
        ),
      );
      row.addChild(makeWord('word', 'CONTENT', { size: 30 }));

      layoutScene(root, new Canvas(1, 1).getContext('2d'), defaultResolveContext({}), {
        width: 800,
        height: 400,
      });

      assert.deepEqual(page.box, { x: 40, y: 20, width: 720, height: 360 });
      assert.deepEqual(row.box, { x: 50, y: 25, width: 700, height: 350 });
    });
  },

  () => {
    test('layout: explicit child alignment fields position direct children', () => {
      const { root, row } = makeLine(['left', 'right'].map((w, i) => makeWord(`child${i}`, w)));
      root.addComponent(
        new Layout(
          new Map([
            ['childrenAlignment.horizontalAlignment', staticProperty('string', 'right')],
            ['childrenAlignment.verticalAlignment', staticProperty('string', 'bottom')],
            ...insetEntries('padding', 100, 100),
          ]),
        ),
      );

      layoutScene(root, new Canvas(16, 16).getContext('2d'), ctx(), { width: 1000, height: 400 });

      assert.deepEqual(root.layout.childrenAlignment(ctx()), {
        horizontalAlignment: 'right',
        verticalAlignment: 'bottom',
      });
      assert.ok(Math.abs(row.box.x + row.box.width - 900) < 1, 'children should align to the content right edge');
    });
  },

  () => {
    test('ecs-preset: nested childrenAlignment round-trips through the runtime tree', () => {
      const root = buildEcsTree(
        canonicalViewport({
          entity: 'compositionArea',
          id: 'compositionArea',
          components: [
            {
              component: 'layout',
              props: {
                childrenAlignment: {
                  horizontalAlignment: { type: 'string', value: 'right' },
                  verticalAlignment: { type: 'string', value: 'top' },
                },
              },
            },
          ],
        }),
      );

      assert.deepEqual(root.compositionArea.layout.childrenAlignment(ctx()), {
        horizontalAlignment: 'right',
        verticalAlignment: 'top',
        horizontalSingleItemAlignment: 'start',
        verticalSingleItemAlignment: 'start',
      });

      const serialized = serializeEntityTree(root);
      const compositionNode = serialized.children.find((child) => child.entity === 'compositionArea');
      const layoutNode = compositionNode.components.find((component) => component.component === 'layout');
      assert.deepEqual(layoutNode.props.childrenAlignment, {
        horizontalAlignment: { type: 'string', value: 'right' },
        verticalAlignment: { type: 'string', value: 'top' },
        horizontalSingleItemAlignment: { type: 'string', value: 'start' },
        verticalSingleItemAlignment: { type: 'string', value: 'start' },
      });
    });
  },

  () => {
    test('self layout: resolves sizing without mutating authored Transform dimensions', () => {
      const word = makeWord('sized', 'Sizing', { size: 40 });
      const transform = new Transform(
        new Map([
          ['dimensions', staticProperty('vector2', { x: 300, y: 200 })],
          ['widthMode', staticProperty('string', 'custom')],
          ['heightMode', staticProperty('string', 'custom')],
        ]),
      );
      const item = new SelfLayout(new Map([['enabled', staticProperty('boolean', true)]]));
      word.addComponent(transform);
      word.addComponent(item);
      const { root } = makeLine([word]);
      layoutScene(root, new Canvas(16, 16).getContext('2d'), ctx(), { width: 800, height: 300 });

      assert.equal(word.box.width, 300);
      assert.equal(word.box.height, 200);
      assert.equal(transform.getProp('dimensions').resolve(ctx()).x, 300);
      assert.equal(transform.getProp('dimensions').resolve(ctx()).y, 200);
    });
  },

  () => {
    test('ecs-preset: SelfLayout and authored dimensions round-trip through JSON nodes', () => {
      const design = {
        entity: 'compositionArea',
        id: 'compositionArea',
        components: [
          {
            component: 'transform',
            props: {
              dimensions: { type: 'vector2', value: { x: 320, y: 180 } },
              widthMode: { type: 'string', value: 'custom' },
              heightMode: { type: 'string', value: 'fitContent' },
            },
          },
          {
            component: 'selfLayout',
            props: {
              enabled: { type: 'boolean', value: true },
              aspectRatio: { type: 'string', value: 'custom' },
              customAspectRatio: { type: 'string', value: '16:9' },
              horizontalAlignment: { type: 'string', value: 'center' },
              verticalAlignment: { type: 'string', value: 'top' },
            },
          },
        ],
      };
      const original = buildEcsTree(canonicalViewport(design));
      const rebuilt = buildEcsTree(serializeEntityTree(original));
      const item = rebuilt.compositionArea.getComponent('selfLayout');
      const transform = rebuilt.compositionArea.getComponent('transform');

      assert.equal(transform.widthMode(ctx()), 'custom');
      assert.equal(transform.heightMode(ctx()), 'fitContent');
      assert.equal(item.aspectRatio(ctx()), 'custom');
      assert.equal(item.customAspectRatio(ctx()), '16:9');
      assert.equal(item.horizontalAlignment(ctx()), 'center');
      assert.equal(item.verticalAlignment(ctx()), 'top');
      assert.equal(transform.getProp('dimensions').resolve(ctx()).x, 320);
      assert.equal(transform.getProp('dimensions').resolve(ctx()).y, 180);
    });
  },

  () => {
    test('Transform sizing modes: fitContent, fitParent, custom ratio, and disabled state use the intended source of truth', () => {
      const autoWord = makeWord('auto', 'Auto', { size: 40 });
      const autoTransform = new Transform(
        new Map([
          ['dimensions', staticProperty('vector2', { x: 300, y: 200 })],
          ['widthMode', staticProperty('string', 'fitContent')],
          ['heightMode', staticProperty('string', 'custom')],
        ]),
      );
      autoWord.addComponent(autoTransform);
      autoWord.addComponent(new SelfLayout(new Map([['aspectRatio', staticProperty('string', 'stretchToFit')]])));

      const fillWord = makeWord('fill', 'Fill', { size: 40 });
      fillWord.addComponent(
        new Transform(
          new Map([
            ['widthMode', staticProperty('string', 'fitParent')],
            ['heightMode', staticProperty('string', 'custom')],
          ]),
        ),
      );

      const disabledWord = makeWord('disabled', 'Disabled', { size: 40 });
      const disabledTransform = new Transform(
        new Map([
          ['dimensions', staticProperty('vector2', { x: 260, y: 140 })],
          ['widthMode', staticProperty('string', 'custom')],
          ['heightMode', staticProperty('string', 'custom')],
        ]),
      );
      disabledWord.addComponent(disabledTransform);
      disabledWord.addComponent(new SelfLayout(new Map([['enabled', staticProperty('boolean', false)]])));

      const customWord = makeWord('custom', 'Ratio', { size: 40 });
      customWord.addComponent(
        new Transform(
          new Map([
            ['dimensions', staticProperty('vector2', { x: 320, y: 0 })],
            ['widthMode', staticProperty('string', 'custom')],
            ['heightMode', staticProperty('string', 'fitContent')],
          ]),
        ),
      );
      customWord.addComponent(
        new SelfLayout(
          new Map([
            ['aspectRatio', staticProperty('string', 'custom')],
            ['customAspectRatio', staticProperty('string', '16:9')],
          ]),
        ),
      );

      const { root } = makeLine([autoWord, fillWord, disabledWord, customWord]);
      layoutScene(root, new Canvas(16, 16).getContext('2d'), ctx(), { width: 800, height: 300 });

      assert.ok(autoWord.box.width < 300, 'fitContent width should use measured content');
      assert.equal(fillWord.box.width, 600, 'fitParent width should use the padded parent content width');
      assert.equal(disabledWord.box.width, 260, 'disabled SelfLayout should restore authored width');
      assert.equal(disabledWord.box.height, 140, 'disabled SelfLayout should restore authored height');
      assert.equal(customWord.box.width, 320);
      assert.ok(Math.abs(customWord.box.height - 180) < 0.001, 'custom ratio should resolve the automatic height');
      assert.equal(disabledTransform.getProp('dimensions').resolve(ctx()).x, 260);
      assert.equal(disabledTransform.getProp('dimensions').resolve(ctx()).y, 140);
    });
  },

  () => {
    test('Layout childrenSizing allows a Page to overflow while the parent clip remains fixed', () => {
      const createScene = (childrenSizing) => {
        const root = new CompositionArea('compositionArea');
        root.addComponent(fixedDimensionsTransform(300, 100));
        root.addComponent(
          new Layout(
            new Map([
              ...insetEntries('padding', 0, 0),
              ['clipContent', staticProperty('boolean', true)],
              ['childrenSizing', staticProperty('string', childrenSizing)],
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
        row.addComponent(fixedDimensionsTransform(600, 40));
        row.addChild(makeWord('word', 'Overflow', { size: 40 }));
        page.addChild(row);
        root.addChild(page);

        layoutScene(root, new Canvas(1, 1).getContext('2d'), ctx(), { width: 300, height: 100 });
        return { root, page };
      };

      const constrained = createScene('constrained');
      assert.equal(constrained.page.box.width, 300);
      assert.equal(constrained.page.box.height, 40);

      const overflowing = createScene('allowOverflow');
      assert.equal(overflowing.root.layout.childrenSizing(ctx()), 'allowOverflow');
      assert.equal(overflowing.page.box.width, 600);
      assert.equal(overflowing.page.box.height, 40);
      assert.deepEqual(contentClipBox(overflowing.root, ctx()), {
        x: -150,
        y: -50,
        width: 300,
        height: 100,
      });
    });
  },

  () => {
    test('Page childWindow fits a fixed number of vertical flow slots while retaining every row', () => {
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
            ['clipContent', staticProperty('boolean', true)],
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
      for (let index = 0; index < 4; index += 1) {
        const row = new Row(`row-${index}`);
        row.addComponent(fixedDimensionsTransform(200, 40));
        row.addComponent(new BackgroundStyle(new Map([['fill', staticProperty('paint', solidPaint('rgb(255,0,0)'))]])));
        row.addChild(makeWord(`word-${index}`, `Row ${index}`, { size: 30 }));
        page.addChild(row);
        rows.push(row);
      }
      root.addChild(page);

      layoutScene(root, new Canvas(16, 16).getContext('2d'), ctx(), { width: 500, height: 500 });

      assert.equal(page.box.height, 80);
      assert.equal(rows.length, 4);
      assert.equal(rows[0].box.y, page.box.y);
      assert.equal(rows[1].box.y, page.box.y + 40);
      assert.equal(rows[2].box.y, page.box.y + 80);
      assert.equal(rows[3].box.y, page.box.y + 120);
      assert.ok(rows[2].box.y >= page.box.y + page.box.height);

      const canvas = new Canvas(500, 500);
      const context = canvas.getContext('2d');
      renderScene(root, context, ctx());
      assert.ok(context.getImageData(200, page.box.y + 20, 1, 1).data[3] > 0);
      assert.equal(context.getImageData(200, page.box.y + 124, 1, 1).data[3], 0);
    });
  },

  () => {
    test('Page childWindow fits horizontal flow slots while retaining every row', () => {
      const root = new CompositionArea('compositionArea');
      root.addComponent(fixedDimensionsTransform(1000, 200));
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
            ['layoutMode', staticProperty('string', 'row')],
            ['childrenSizing', staticProperty('string', 'allowOverflow')],
            ['childWindow.windowMode', staticProperty('string', 'count')],
            ['childWindow.windowCount', staticProperty('number', 2)],
            ['childWindow.windowAxis', staticProperty('string', 'horizontal')],
            ['childWindow.windowAnchor', staticProperty('string', 'start')],
            ...insetEntries('padding', 0, 0),
          ]),
        ),
      );
      page.addComponent(new HorizontalSpacer(new Map([['spacing', staticProperty('number', 12)]])));

      const rows = [];
      for (let index = 0; index < 4; index += 1) {
        const row = new Row(`row-${index}`);
        row.addComponent(fixedDimensionsTransform(200, 40));
        page.addChild(row);
        rows.push(row);
      }
      root.addChild(page);

      layoutScene(root, new Canvas(16, 16).getContext('2d'), ctx(), { width: 1000, height: 200 });

      assert.equal(page.box.width, 412);
      assert.equal(page.box.height, 40);
      assert.equal(rows[0].box.x, page.box.x);
      assert.equal(rows[1].box.x, page.box.x + 212);
      assert.equal(rows[2].box.x, page.box.x + 424);
      assert.equal(rows[3].box.x, page.box.x + 636);
      assert.ok(rows[2].box.x >= page.box.x + page.box.width);
    });
  },

  () => {
    test('Page childWindow anchors overflowing rows to the selected edge', () => {
      for (const [windowAnchor, firstRowOffset] of [
        ['start', 0],
        ['center', -40],
        ['end', -80],
      ]) {
        const root = new CompositionArea('compositionArea');
        root.addComponent(fixedDimensionsTransform(500, 120));
        root.addComponent(new Layout(new Map(insetEntries('padding', 0, 0))));

        const page = new Page(`page-${windowAnchor}`);
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
        const rows = [];
        for (let index = 0; index < 4; index += 1) {
          const row = page.addChild(new Row(`${windowAnchor}-row-${index}`));
          row.addComponent(fixedDimensionsTransform(200, 40));
          rows.push(row);
        }
        root.addChild(page);

        layoutScene(root, new Canvas(1, 1).getContext('2d'), ctx(), { width: 500, height: 120 });

        assert.equal(page.box.height, 80);
        assert.equal(rows[0].box.y, page.box.y + firstRowOffset);
        assert.equal(rows[1].box.y, page.box.y + firstRowOffset + 40);
      }
    });
  },

  () => {
    test('Page childWindow includes the vertical spacer in its fitted window size', () => {
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
            ['layoutMode', staticProperty('string', 'overlay')],
            ['childrenSizing', staticProperty('string', 'allowOverflow')],
            ['childWindow.windowMode', staticProperty('string', 'count')],
            ['childWindow.windowCount', staticProperty('number', 2)],
            ['childWindow.windowAxis', staticProperty('string', 'vertical')],
            ['childWindow.windowAnchor', staticProperty('string', 'start')],
            ...insetEntries('padding', 0, 0),
          ]),
        ),
      );
      page.addComponent(new VerticalSpacer(new Map([['spacing', staticProperty('number', 12)]])));
      for (let index = 0; index < 4; index += 1) {
        const row = new Row(`row-${index}`);
        row.addComponent(fixedDimensionsTransform(200, 40));
        page.addChild(row);
      }
      root.addChild(page);

      layoutScene(root, new Canvas(1, 1).getContext('2d'), ctx(), { width: 500, height: 500 });

      assert.equal(page.box.height, 92);
      assert.equal(page.children[1].box.y, page.box.y + 52);
    });
  },

  () => {
    test('Page childWindow resolves percentage spacer spacing against the parent content box', () => {
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
      page.addComponent(
        new VerticalSpacer(
          new Map([
            ['spacing', staticProperty('number', 10)],
            ['unit', staticProperty('string', '%')],
          ]),
        ),
      );
      for (let index = 0; index < 4; index += 1) {
        const row = new Row(`row-${index}`);
        row.addComponent(fixedDimensionsTransform(200, 40));
        page.addChild(row);
      }
      root.addChild(page);

      layoutScene(root, new Canvas(1, 1).getContext('2d'), ctx(), { width: 500, height: 500 });

      assert.equal(page.box.height, 130);
      assert.equal(page.children[1].box.y, page.box.y + 53);
    });
  },

  () => {
    test('Row childWindow resolves percentage spacer spacing against the fitted window', () => {
      const root = new CompositionArea('compositionArea');
      root.addComponent(fixedDimensionsTransform(500, 100));
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
      const row = page.addChild(new Row('row'));
      row.addComponent(
        new Transform(
          new Map([
            ['widthMode', staticProperty('string', 'fitChildren')],
            ['heightMode', staticProperty('string', 'fitChildren')],
          ]),
        ),
      );
      row.addComponent(
        new Layout(
          new Map([
            ['childWindow.windowMode', staticProperty('string', 'count')],
            ['childWindow.windowCount', staticProperty('number', 2)],
            ['childWindow.windowAxis', staticProperty('string', 'horizontal')],
            ['childWindow.windowAnchor', staticProperty('string', 'start')],
          ]),
        ),
      );
      row.addComponent(
        new HorizontalSpacer(
          new Map([
            ['spacing', staticProperty('number', 10)],
            ['unit', staticProperty('string', '%')],
          ]),
        ),
      );
      const words = [];
      for (let index = 0; index < 4; index += 1) {
        const word = new Word(`word-${index}`, `word-${index}`);
        word.addComponent(fixedDimensionsTransform(100, 40));
        row.addChild(word);
        words.push(word);
      }

      layoutScene(root, new Canvas(1, 1).getContext('2d'), ctx(), { width: 500, height: 100 });

      assert.ok(Math.abs(row.box.width - 222.22222222222223) < 0.000001);
      assert.ok(Math.abs(words[1].box.x - (row.box.x + 122.22222222222223)) < 0.000001);
    });
  },

  () => {
    test('Layout childrenSizing gives custom Page dimensions to fitParent descendants', () => {
      const root = new CompositionArea('compositionArea');
      root.addComponent(fixedDimensionsTransform(300, 100));
      root.addComponent(
        new Layout(
          new Map([...insetEntries('padding', 0, 0), ['childrenSizing', staticProperty('string', 'allowOverflow')]]),
        ),
      );

      const page = new Page('page');
      page.addComponent(
        new Transform(
          new Map([
            ['dimensions', staticProperty('vector2', { x: 600, y: 80 })],
            ['widthMode', staticProperty('string', 'custom')],
            ['heightMode', staticProperty('string', 'custom')],
          ]),
        ),
      );
      const row = new Row('row');
      row.addComponent(
        new Transform(
          new Map([
            ['widthMode', staticProperty('string', 'fitParent')],
            ['heightMode', staticProperty('string', 'custom')],
            ['dimensions', staticProperty('vector2', { x: 0, y: 40 })],
          ]),
        ),
      );
      const word = makeWord('word', 'Overflow', { size: 40 });
      word.addComponent(
        new Transform(
          new Map([
            ['widthMode', staticProperty('string', 'fitParent')],
            ['heightMode', staticProperty('string', 'custom')],
            ['dimensions', staticProperty('vector2', { x: 0, y: 40 })],
          ]),
        ),
      );
      row.addChild(word);
      page.addChild(row);
      root.addChild(page);

      layoutScene(root, new Canvas(1, 1).getContext('2d'), ctx(), { width: 300, height: 100 });

      assert.equal(page.box.width, 600);
      assert.equal(row.box.width, 600);
      assert.equal(word.box.width, 600);
    });
  },

  () => {
    test('Caption Layout fixed counts are maxima and preserve source timing', () => {
      const policy = createDefaultCaptionLayoutPolicy();
      policy.rowsPerPage = { mode: 'fixed', count: 2 };
      policy.wordsPerRow = { mode: 'fixed', count: 2 };
      policy.breaking.smartBreaks = 'off';
      const source = [
        { word: 'A', startTimestamp: 10, visualEndTimestamp: 10.2 },
        { word: 'B', startTimestamp: 10.2, visualEndTimestamp: 10.4 },
        { word: 'C', startTimestamp: 20, visualEndTimestamp: 20.2, breakBefore: true },
      ];
      const snapshot = structuredClone(source);
      const groups = segmentCaptionWords(source, {
        availableWidth: 500,
        spaceX: 10,
        maxWordWidth: () => 20,
        policy,
        rowBreakPauseThresholdSeconds: 0.35,
        longWordThreshold: 0.5,
        groupPunctuationWordsIndividually: false,
      });
      const pages = allocateCaptionPages(groups, {
        policy,
        longWordThreshold: 0.5,
        pageBreakPauseThresholdSeconds: 20,
        rowHeight: () => 40,
      });

      assert.deepEqual(source, snapshot, 'segmentation must not rewrite source timing or text');
      assert.deepEqual(
        groups.map((group) => group.map((entry) => entry.word)),
        [['A', 'B'], ['C']],
      );
      assert.equal(pages.length, 1, 'row capacity is not a requirement to wait for another row');
      assert.equal(pages[0].length, 2);
      assert.equal(pages[0][1][0].startTimestamp, 20);
    });
  },

  () => {
    test('Caption Layout all rows mode keeps every row on one page despite page height', () => {
      const policy = createDefaultCaptionLayoutPolicy();
      policy.rowsPerPage = { mode: 'all' };
      const groups = ['A', 'B', 'C'].map((word, index) => [
        {
          word,
          startTimestamp: index,
          visualEndTimestamp: index + 0.2,
        },
      ]);
      const options = {
        policy,
        pageHeight: 50,
        rowHeight: () => 40,
        longWordThreshold: 0.5,
        pageBreakPauseThresholdSeconds: 20,
      };

      const pages = allocateCaptionPages(groups, options);
      const diagnostics = diagnoseCaptionPageOverflow(pages, options);

      assert.equal(pages.length, 1);
      assert.equal(pages[0].length, 3);
      assert.deepEqual(diagnostics, [
        {
          code: 'page-overflow',
          pageIndex: 0,
          rowCount: 3,
          requiredHeight: 120,
          availableHeight: 50,
          message: 'Caption page 1 needs 120 units for 3 rows but only 50 units are available.',
        },
      ]);
    });
  },

  () => {
    test('Caption Layout row break threshold separates medium pauses without changing caption hold timing', () => {
      const policy = createDefaultCaptionLayoutPolicy();
      policy.rowsPerPage = { mode: 'fixed', count: 4 };
      policy.wordsPerRow = { mode: 'auto' };
      policy.breaking.smartBreaks = 'off';
      const words = [
        { word: 'A', startTimestamp: 0, visualEndTimestamp: 0.2 },
        { word: 'B', startTimestamp: 0.6, visualEndTimestamp: 0.8 },
        { word: 'C', startTimestamp: 1.7, visualEndTimestamp: 1.9 },
      ];

      const groups = segmentCaptionWords(words, {
        availableWidth: 500,
        spaceX: 10,
        maxWordWidth: () => 20,
        policy,
        rowBreakPauseThresholdSeconds: 0.3,
        longWordThreshold: 0.5,
        groupPunctuationWordsIndividually: false,
      });

      assert.deepEqual(
        groups.map((group) => group.map((entry) => entry.word)),
        [['A'], ['B'], ['C']],
      );
    });
  },

  () => {
    test('Caption Layout break timing profiles map exact values and custom values', () => {
      assert.equal(captionBreakTimingPresetFor(CAPTION_BREAK_TIMING_PRESETS.short), 'short');
      assert.equal(captionBreakTimingPresetFor(CAPTION_BREAK_TIMING_PRESETS.medium), 'medium');
      assert.equal(captionBreakTimingPresetFor(CAPTION_BREAK_TIMING_PRESETS.long), 'long');
      assert.equal(
        captionBreakTimingPresetFor({
          ...CAPTION_BREAK_TIMING_PRESETS.medium,
          rowBreakPauseThresholdSeconds: CAPTION_BREAK_TIMING_PRESETS.medium.rowBreakPauseThresholdSeconds + 0.01,
        }),
        'custom',
      );
    });
  },

  () => {
    test('Caption Layout defaults long-word wrapping to wrap with a hyphen marker', () => {
      const policy = createDefaultCaptionLayoutPolicy();
      assert.equal(policy.breaking.wordWrapping.mode, 'wrap');
      assert.deepEqual(policy.breaking.wordWrapping.breakCharacters, ['-']);
      assert.equal(policy.breaking.wordWrapping.breakMarker, '-');
      assert.equal(policy.breaking.wordWrapping.overflowTolerance, DEFAULT_CAPTION_WORD_WRAP_OVERFLOW_TOLERANCE);
      assert.equal(policy.breaking.wordWrapping.overflowTolerance, 8);
      const omittedTolerance = validateCaptionLayoutPolicy({
        ...policy,
        breaking: {
          ...policy.breaking,
          wordWrapping: { ...policy.breaking.wordWrapping, overflowTolerance: undefined },
        },
      });
      assert.equal(omittedTolerance.breaking.wordWrapping.overflowTolerance, 8);
      assert.equal(policy.breaking.longWordThresholdMode, 'automatic');
      assert.equal(policy.breaking.longWordThresholdSeconds, DEFAULT_LONG_WORD_THRESHOLD_SECONDS);
    });
  },

  () => {
    test('long-word threshold keeps the portrait baseline and scales wider layouts', () => {
      const narrow = resolveLongWordThreshold('automatic', 0.9, 540);
      const standard = resolveLongWordThreshold('automatic', 0.9, 1080);
      const wide = resolveLongWordThreshold('automatic', 0.9, 1920);
      assert.equal(narrow, standard);
      assert.ok(standard < wide);
      assert.equal(resolveLongWordThreshold('fixed', 1.75, 540), 1.75);
    });
  },

  () => {
    test('Caption Layout limits horizontal fit scales to 256', () => {
      const policy = createDefaultCaptionLayoutPolicy();

      assert.equal(validateCaptionLayoutPolicy({ ...policy, horizontalFitMaxScale: 256 }).horizontalFitMaxScale, 256);
      assert.throws(
        () => validateCaptionLayoutPolicy({ ...policy, horizontalFitMaxScale: 256.01 }),
        /horizontalFitMaxScale must be less than or equal to 256/,
      );
      assert.throws(
        () => validateCaptionLayoutOverride({ horizontalFitMinScale: 256.01 }),
        /horizontalFitMinScale must be less than or equal to 256/,
      );
    });
  },

  () => {
    test('Caption Layout validates configured word wrapping', () => {
      const policy = createDefaultCaptionLayoutPolicy();
      const configured = validateCaptionLayoutPolicy({
        ...policy,
        breaking: {
          ...policy.breaking,
          wordWrapping: {
            mode: 'wrap',
            breakCharacters: ['-', '·'],
            breakMarker: '',
            overflowTolerance: 4,
          },
        },
      });
      assert.deepEqual(configured.breaking.wordWrapping, {
        mode: 'wrap',
        breakCharacters: ['-', '·'],
        breakMarker: '',
        overflowTolerance: 4,
      });
      assert.throws(
        () =>
          validateCaptionLayoutPolicy({
            ...policy,
            breaking: {
              ...policy.breaking,
              wordWrapping: { ...policy.breaking.wordWrapping, mode: 'invalid' },
            },
          }),
        /wordWrapping\.mode must be/,
      );
      assert.throws(
        () =>
          validateCaptionLayoutPolicy({
            ...policy,
            breaking: {
              ...policy.breaking,
              wordWrapping: { ...policy.breaking.wordWrapping, overflowTolerance: -1 },
            },
          }),
        /wordWrapping\.overflowTolerance must be/,
      );
    });
  },

  () => {
    test('Caption Layout wraps long words at configured break characters and preserves source timing', () => {
      const policy = createDefaultCaptionLayoutPolicy().breaking.wordWrapping;
      const source = {
        word: 'alpha-beta',
        startTimestamp: 1,
        visualEndTimestamp: 2,
      };
      const fragments = wrapCaptionTimedWords([source], {
        availableWidth: 60,
        maxWordWidth: (word) => word.length * 10,
        policy: { ...policy, mode: 'wrap' },
      });

      assert.deepEqual(
        fragments.map((fragment) => fragment.word),
        ['alpha-', 'beta'],
      );
      assert.deepEqual(
        fragments.map((fragment) => [fragment.startTimestamp, fragment.visualEndTimestamp]),
        [
          [1, 2],
          [1, 2],
        ],
      );
      assert.deepEqual(
        fragments.map((fragment) => fragment.logicalWordIndex),
        [0, 0],
      );
      assert.equal(fragments[1].forceBreakBefore, true);
    });
  },

  () => {
    test('Caption Layout breaks to a new row before wrapping an oversized word', () => {
      const layoutPolicy = createDefaultCaptionLayoutPolicy();
      const policy = layoutPolicy.breaking.wordWrapping;
      const entries = [
        { word: 'Start', startTimestamp: 0, visualEndTimestamp: 0.2 },
        { word: 'waiting', startTimestamp: 0.2, visualEndTimestamp: 0.4 },
      ];
      const maxWordWidth = (word) => word.length * 10;
      const initialRows = segmentCaptionWords(entries, {
        availableWidth: 55,
        spaceX: 5,
        maxWordWidth,
        policy: layoutPolicy,
        rowBreakPauseThresholdSeconds: 1,
        longWordThreshold: 0.5,
      });
      const rows = wrapOversizedCaptionRows(initialRows, {
        availableWidth: 55,
        maxWordWidth,
        maxWordWidthForWrapping: maxWordWidth,
        policy,
      });

      assert.deepEqual(
        initialRows.map((row) => row.map((entry) => entry.word)),
        [['Start'], ['waiting']],
      );
      assert.equal(rows[0][0].word, 'Start');
      assert.deepEqual(
        rows
          .slice(1)
          .flat()
          .map((entry) => entry.word),
        ['wait-', 'ing'],
      );
    });
  },

  () => {
    test('Caption Layout wraps a word when it is oversized even as a singleton row', () => {
      const policy = createDefaultCaptionLayoutPolicy().breaking.wordWrapping;
      const maxWordWidth = (word) => word.length * 10;
      const rows = wrapOversizedCaptionRows([[{ word: 'waiting', startTimestamp: 0, visualEndTimestamp: 0.4 }]], {
        availableWidth: 55,
        maxWordWidth,
        maxWordWidthForWrapping: maxWordWidth,
        policy,
      });

      assert.deepEqual(
        rows.flat().map((entry) => entry.word),
        ['wait-', 'ing'],
      );
    });
  },

  () => {
    test('Caption Layout defers a preferred long-word boundary until row capacity is needed', () => {
      const policy = createDefaultCaptionLayoutPolicy();
      policy.breaking.breakPriorities.rows = policy.breaking.breakPriorities.rows.map((rule) =>
        rule.id === 'long-word' ? { ...rule, mode: 'prefer' } : rule,
      );
      const groups = segmentCaptionWords(
        [
          { word: 'A', startTimestamp: 0, visualEndTimestamp: 0.2 },
          { word: 'waiting', startTimestamp: 0.2, visualEndTimestamp: 0.9 },
        ],
        {
          availableWidth: 500,
          spaceX: 5,
          maxWordWidth: () => 40,
          policy,
          rowBreakPauseThresholdSeconds: 1,
          longWordThreshold: 0.5,
        },
      );

      assert.deepEqual(
        groups.map((group) => group.map((entry) => entry.word)),
        [['A', 'waiting']],
      );
    });
  },

  () => {
    test('Caption Layout enforces maximum words, width, and required long-word row breaks', () => {
      const countPolicy = createDefaultCaptionLayoutPolicy();
      countPolicy.wordsPerRow = { mode: 'fixed', count: 2 };
      const countGroups = segmentCaptionWords(
        ['A', 'B', 'C'].map((word, index) => ({
          word,
          startTimestamp: index,
          visualEndTimestamp: index + 0.2,
        })),
        {
          availableWidth: 500,
          spaceX: 5,
          maxWordWidth: () => 20,
          policy: countPolicy,
          rowBreakPauseThresholdSeconds: 10,
          longWordThreshold: 0.5,
        },
      );
      assert.deepEqual(
        countGroups.map((group) => group.map((entry) => entry.word)),
        [['A', 'B'], ['C']],
      );

      const widthPolicy = createDefaultCaptionLayoutPolicy();
      const widthGroups = segmentCaptionWords(
        [
          { word: 'A', startTimestamp: 0, visualEndTimestamp: 0.2 },
          { word: 'BBBB', startTimestamp: 0.2, visualEndTimestamp: 0.4 },
          { word: 'CC', startTimestamp: 0.4, visualEndTimestamp: 0.6 },
        ],
        {
          availableWidth: 55,
          spaceX: 5,
          maxWordWidth: (word) => word.length * 10,
          policy: widthPolicy,
          rowBreakPauseThresholdSeconds: 10,
          longWordThreshold: 0.5,
        },
      );
      assert.deepEqual(
        widthGroups.map((group) => group.map((entry) => entry.word)),
        [['A', 'BBBB'], ['CC']],
      );

      const longWordGroups = segmentCaptionWords(
        [
          { word: 'A', startTimestamp: 0, visualEndTimestamp: 0.2 },
          { word: 'waiting', startTimestamp: 0.2, visualEndTimestamp: 0.9 },
        ],
        {
          availableWidth: 500,
          spaceX: 5,
          maxWordWidth: () => 20,
          policy: createDefaultCaptionLayoutPolicy(),
          rowBreakPauseThresholdSeconds: 10,
          longWordThreshold: 0.5,
        },
      );
      assert.deepEqual(
        longWordGroups.map((group) => group.map((entry) => entry.word)),
        [['A'], ['waiting']],
      );
    });
  },

  () => {
    test('Caption Layout applies source, punctuation, and pause row modes', () => {
      const sourcePolicy = createDefaultCaptionLayoutPolicy();
      const sourceWords = [
        { word: 'A', startTimestamp: 0, visualEndTimestamp: 0.2 },
        { word: 'B', startTimestamp: 0.2, visualEndTimestamp: 0.4, breakBefore: true },
      ];
      const segment = (policy, words = sourceWords) =>
        segmentCaptionWords(words, {
          availableWidth: 500,
          spaceX: 5,
          maxWordWidth: () => 20,
          policy,
          rowBreakPauseThresholdSeconds: 0.3,
          longWordThreshold: 0.5,
        });

      assert.deepEqual(
        segment(sourcePolicy).map((group) => group.map((entry) => entry.word)),
        [['A'], ['B']],
      );

      const sourceOffPolicy = createDefaultCaptionLayoutPolicy();
      sourceOffPolicy.breaking.breakPriorities.rows = sourceOffPolicy.breaking.breakPriorities.rows.map((rule) =>
        rule.id === 'source' ? { ...rule, mode: 'off' } : rule,
      );
      assert.deepEqual(
        segment(sourceOffPolicy).map((group) => group.map((entry) => entry.word)),
        [['A', 'B']],
      );

      const punctuationPolicy = createDefaultCaptionLayoutPolicy();
      punctuationPolicy.breaking.breakPriorities.rows = punctuationPolicy.breaking.breakPriorities.rows.map((rule) =>
        rule.id === 'punctuation' ? { ...rule, mode: 'always' } : rule,
      );
      assert.deepEqual(
        segment(punctuationPolicy, [
          { word: 'First.', startTimestamp: 0, visualEndTimestamp: 0.2 },
          { word: 'Second', startTimestamp: 0.2, visualEndTimestamp: 0.4 },
        ]).map((group) => group.map((entry) => entry.word)),
        [['First.'], ['Second']],
      );

      const pausePolicy = createDefaultCaptionLayoutPolicy();
      pausePolicy.breaking.breakPriorities.rows = pausePolicy.breaking.breakPriorities.rows.map((rule) =>
        rule.id === 'pause' ? { ...rule, mode: 'always' } : rule,
      );
      assert.deepEqual(
        segment(pausePolicy, [
          { word: 'First', startTimestamp: 0, visualEndTimestamp: 0.2 },
          { word: 'Second', startTimestamp: 0.6, visualEndTimestamp: 0.8 },
        ]).map((group) => group.map((entry) => entry.word)),
        [['First'], ['Second']],
      );

      const pauseOffPolicy = createDefaultCaptionLayoutPolicy();
      pauseOffPolicy.breaking.breakPriorities.rows = pauseOffPolicy.breaking.breakPriorities.rows.map((rule) =>
        rule.id === 'pause' ? { ...rule, mode: 'off' } : rule,
      );
      assert.deepEqual(
        segment(pauseOffPolicy, [
          { word: 'First', startTimestamp: 0, visualEndTimestamp: 0.2 },
          { word: 'Second', startTimestamp: 0.6, visualEndTimestamp: 0.8 },
        ]).map((group) => group.map((entry) => entry.word)),
        [['First', 'Second']],
      );
    });
  },

  () => {
    test('Caption Layout tolerance removes only the configured horizontal overflow', () => {
      const policy = {
        ...createDefaultCaptionLayoutPolicy().breaking.wordWrapping,
        breakCharacters: [],
        breakMarker: '',
        overflowTolerance: 4,
      };
      const maxWordWidth = (word) => word.length * 10 + 8;

      const fitting = wrapCaptionTimedWords([{ word: 'ABCDEFGHIJ', startTimestamp: 0, visualEndTimestamp: 1 }], {
        availableWidth: 100,
        maxWordWidth,
        policy,
      });
      const oversized = wrapCaptionTimedWords([{ word: 'ABCDEFGHIJK', startTimestamp: 0, visualEndTimestamp: 1 }], {
        availableWidth: 100,
        maxWordWidth,
        policy,
      });

      assert.deepEqual(
        fitting.map((entry) => entry.word),
        ['ABCDEFGHIJ'],
      );
      assert.deepEqual(
        oversized.map((entry) => entry.word),
        ['ABCDEFGHIJ', 'K'],
      );
      assert.equal(minimumWrappedWordWidth(['ABCDEFGHIJ'], maxWordWidth, { ...policy, mode: 'allow-overflow' }), 100);
    });
  },

  () => {
    test('Caption Layout can wrap without adding a visible marker and keeps grapheme clusters intact', () => {
      const policy = createDefaultCaptionLayoutPolicy().breaking.wordWrapping;
      const fragments = wrapCaptionTimedWords([{ word: 'a👩‍💻b', startTimestamp: 0, visualEndTimestamp: 1 }], {
        availableWidth: 20,
        maxWordWidth: (word) =>
          Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(word)).length * 10,
        policy: { ...policy, mode: 'wrap', breakMarker: '', overflowTolerance: 0 },
      });

      assert.deepEqual(
        fragments.map((fragment) => fragment.word),
        ['a👩‍💻', 'b'],
      );
      assert.ok(fragments.every((fragment) => !fragment.word.includes('-')));
      assert.deepEqual(
        fragments.map((fragment) => fragment.fragmentIndex),
        [0, 1],
      );
      assert.deepEqual(
        fragments.map((fragment) => fragment.fragmentCount),
        [2, 2],
      );
    });
  },

  () => {
    test('Caption Layout page break threshold starts a new page before row capacity is reached', () => {
      const policy = createDefaultCaptionLayoutPolicy();
      policy.rowsPerPage = { mode: 'fixed', count: 3 };
      const groups = [
        [{ word: 'A', startTimestamp: 0, visualEndTimestamp: 0.2 }],
        [{ word: 'B', startTimestamp: 0.4, visualEndTimestamp: 0.6 }],
        [{ word: 'C', startTimestamp: 3.5, visualEndTimestamp: 3.7 }],
      ];

      const pages = allocateCaptionPages(groups, {
        policy,
        longWordThreshold: 0.5,
        pageBreakPauseThresholdSeconds: 2.5,
        rowHeight: () => 40,
      });

      assert.deepEqual(
        pages.map((page) => page.length),
        [2, 1],
      );
    });
  },

  () => {
    test('Caption Layout page punctuation can force a page break before capacity or pause thresholds', () => {
      const policy = createDefaultCaptionLayoutPolicy();
      policy.rowsPerPage = { mode: 'fixed', count: 3 };
      policy.breaking.smartBreaks = 'auto';
      policy.breaking.breakPriorities.rows = policy.breaking.breakPriorities.rows.map((rule) =>
        rule.id === 'punctuation' ? { ...rule, mode: 'off' } : rule,
      );
      policy.breaking.breakPriorities.pages = policy.breaking.breakPriorities.pages.map((rule) =>
        rule.id === 'punctuation' ? { ...rule, mode: 'always' } : rule.id === 'pause' ? { ...rule, mode: 'off' } : rule,
      );
      const words = [
        { word: 'First.', startTimestamp: 0, visualEndTimestamp: 0.1 },
        { word: 'Second', startTimestamp: 0.1, visualEndTimestamp: 0.2 },
        { word: 'Third', startTimestamp: 0.2, visualEndTimestamp: 0.3 },
      ];
      const groups = segmentCaptionWords(words, {
        availableWidth: 500,
        spaceX: 10,
        maxWordWidth: () => 20,
        policy,
        rowBreakPauseThresholdSeconds: 1,
        longWordThreshold: 0.5,
      });
      const pages = allocateCaptionPages(groups, {
        policy,
        longWordThreshold: 0.5,
        pageBreakPauseThresholdSeconds: 10,
        rowHeight: () => 40,
      });

      assert.deepEqual(
        groups.map((group) => group.map((entry) => entry.word)),
        [['First.', 'Second', 'Third']],
      );
      assert.deepEqual(
        pages.map((page) => page.flat().map((entry) => entry.word)),
        [['First.'], ['Second', 'Third']],
      );
    });
  },

  () => {
    test('Caption Layout page punctuation stays disabled when its rule is off', () => {
      const policy = createDefaultCaptionLayoutPolicy();
      policy.rowsPerPage = { mode: 'fixed', count: 3 };
      policy.breaking.breakPriorities.pages = policy.breaking.breakPriorities.pages.map((rule) =>
        rule.id === 'pause' || rule.id === 'punctuation' ? { ...rule, mode: 'off' } : rule,
      );
      const groups = [
        [{ word: 'First.', startTimestamp: 0, visualEndTimestamp: 0.1 }],
        [{ word: 'Second', startTimestamp: 0.1, visualEndTimestamp: 0.2 }],
        [{ word: 'Third', startTimestamp: 0.2, visualEndTimestamp: 0.3 }],
      ];

      const pages = allocateCaptionPages(groups, {
        policy,
        pageBreakPauseThresholdSeconds: 10,
        longWordThreshold: 0.5,
        rowHeight: () => 40,
      });

      assert.equal(pages.length, 1);
      assert.equal(pages[0].length, 3);
    });
  },

  () => {
    test('Caption Layout enforces maximum rows per page', () => {
      const policy = createDefaultCaptionLayoutPolicy();
      policy.rowsPerPage = { mode: 'fixed', count: 2 };
      const groups = ['A', 'B', 'C', 'D', 'E'].map((word, index) => [
        {
          word,
          startTimestamp: index,
          visualEndTimestamp: index + 0.2,
        },
      ]);
      const pages = allocateCaptionPages(groups, {
        policy,
        longWordThreshold: 0.5,
        pageBreakPauseThresholdSeconds: 10,
        rowHeight: () => 20,
      });

      assert.deepEqual(
        pages.map((page) => page.length),
        [2, 2, 1],
      );
    });
  },

  () => {
    test('Caption Layout lets required page rules override an earlier preferred rule', () => {
      const policy = createDefaultCaptionLayoutPolicy();
      policy.rowsPerPage = { mode: 'fixed', count: 3 };
      policy.breaking.breakPriorities.pages = [
        { id: 'source', mode: 'prefer' },
        { id: 'pause', mode: 'always' },
        ...policy.breaking.breakPriorities.pages.filter((rule) => rule.id !== 'source' && rule.id !== 'pause'),
      ];
      const groups = [
        [
          { word: 'A', startTimestamp: 0, visualEndTimestamp: 0.2 },
          { word: 'B', startTimestamp: 1, visualEndTimestamp: 1.2, breakBefore: true },
        ],
      ];
      const pages = allocateCaptionPages(groups, {
        policy,
        longWordThreshold: 0.5,
        pageBreakPauseThresholdSeconds: 0.5,
        rowHeight: () => 20,
      });

      assert.deepEqual(
        pages.map((page) => page.flat().map((entry) => entry.word)),
        [['A'], ['B']],
      );
    });
  },

  () => {
    test('Caption Layout applies source page boundaries only when the page rule is enabled', () => {
      const sourceGroups = [
        [
          { word: 'A', startTimestamp: 0, visualEndTimestamp: 0.2 },
          { word: 'B', startTimestamp: 0.2, visualEndTimestamp: 0.4, breakBefore: true },
        ],
      ];
      const sourcePolicy = createDefaultCaptionLayoutPolicy();
      sourcePolicy.rowsPerPage = { mode: 'fixed', count: 1 };
      sourcePolicy.breaking.breakPriorities.pages = sourcePolicy.breaking.breakPriorities.pages.map((rule) =>
        rule.id === 'source' ? { ...rule, mode: 'always' } : rule,
      );
      const sourcePages = allocateCaptionPages(sourceGroups, {
        policy: sourcePolicy,
        longWordThreshold: 0.5,
        pageBreakPauseThresholdSeconds: 10,
        rowHeight: () => 20,
      });
      assert.deepEqual(
        sourcePages.map((page) => page.flat().map((entry) => entry.word)),
        [['A'], ['B']],
      );

      const sourceOffPolicy = createDefaultCaptionLayoutPolicy();
      sourceOffPolicy.rowsPerPage = { mode: 'fixed', count: 2 };
      const sourceOffPages = allocateCaptionPages(sourceGroups, {
        policy: sourceOffPolicy,
        longWordThreshold: 0.5,
        pageBreakPauseThresholdSeconds: 10,
        rowHeight: () => 20,
      });
      assert.deepEqual(
        sourceOffPages.map((page) => page.flat().map((entry) => entry.word)),
        [['A', 'B']],
      );
    });
  },

  () => {
    test('Caption Layout all rows mode ignores long-word page isolation', () => {
      const policy = createDefaultCaptionLayoutPolicy();
      policy.rowsPerPage = { mode: 'all' };
      policy.breaking.breakPriorities.rows = policy.breaking.breakPriorities.rows.map((rule) =>
        rule.id === 'long-word' ? { ...rule, mode: 'always' } : rule,
      );
      const groups = [
        [{ word: 'slow', startTimestamp: 0, visualEndTimestamp: 1 }],
        [{ word: 'next', startTimestamp: 1, visualEndTimestamp: 1.2 }],
      ];
      const pages = allocateCaptionPages(groups, {
        policy,
        longWordThreshold: 0.5,
        pageBreakPauseThresholdSeconds: 10,
        rowHeight: () => 20,
      });

      assert.deepEqual(
        pages.map((page) => page.length),
        [2],
      );
    });
  },

  () => {
    test('Caption Layout uses rule order to choose the preferred row and page boundary', () => {
      const policy = createDefaultCaptionLayoutPolicy();
      policy.wordsPerRow = { mode: 'fixed', count: 3 };
      policy.breaking.breakPriorities.rows = [
        { id: 'punctuation', mode: 'prefer' },
        { id: 'pause', mode: 'prefer' },
        ...policy.breaking.breakPriorities.rows.filter((rule) => rule.id !== 'pause' && rule.id !== 'punctuation'),
      ];
      const rowGroups = segmentCaptionWords(
        [
          { word: 'First.', startTimestamp: 0, visualEndTimestamp: 0.1 },
          { word: 'Second', startTimestamp: 0.1, visualEndTimestamp: 0.2 },
          { word: 'Third', startTimestamp: 1.2, visualEndTimestamp: 1.3 },
          { word: 'Fourth', startTimestamp: 1.3, visualEndTimestamp: 1.4 },
        ],
        {
          availableWidth: 500,
          spaceX: 10,
          maxWordWidth: () => 20,
          policy,
          rowBreakPauseThresholdSeconds: 0.5,
          longWordThreshold: 0.5,
        },
      );
      assert.deepEqual(
        rowGroups.map((group) => group.map((entry) => entry.word)),
        [['First.'], ['Second', 'Third', 'Fourth']],
      );

      policy.rowsPerPage = { mode: 'fixed', count: 3 };
      policy.breaking.breakPriorities.pages = [
        { id: 'source', mode: 'prefer' },
        { id: 'pause', mode: 'prefer' },
        ...policy.breaking.breakPriorities.pages.filter((rule) => rule.id !== 'source' && rule.id !== 'pause'),
      ];
      const pageGroups = [
        [{ word: 'A', startTimestamp: 0, visualEndTimestamp: 0.1 }],
        [{ word: 'B', startTimestamp: 0.1, visualEndTimestamp: 0.2 }],
        [{ word: 'C', startTimestamp: 1.2, visualEndTimestamp: 1.3, breakBefore: true }],
        [{ word: 'D', startTimestamp: 1.3, visualEndTimestamp: 1.4 }],
      ];
      const pages = allocateCaptionPages(pageGroups, {
        policy,
        pageBreakPauseThresholdSeconds: 0.5,
        longWordThreshold: 0.5,
        rowHeight: () => 40,
      });
      assert.deepEqual(
        pages.map((page) => page.length),
        [2, 2],
      );
    });
  },

  () => {
    test('Caption Layout validates complete rule lists and protects required constraints', () => {
      const policy = createDefaultCaptionLayoutPolicy();
      const duplicateRows = policy.breaking.breakPriorities.rows.map((rule) => ({ ...rule }));
      duplicateRows[1] = { ...duplicateRows[0], mode: 'prefer' };
      assert.throws(
        () =>
          validateCaptionLayoutPolicy({
            ...policy,
            breaking: {
              ...policy.breaking,
              breakPriorities: { ...policy.breaking.breakPriorities, rows: duplicateRows },
            },
          }),
        /duplicate rule/,
      );

      const disabledWidth = policy.breaking.breakPriorities.rows.map((rule) =>
        rule.id === 'width' ? { ...rule, mode: 'off' } : { ...rule },
      );
      assert.throws(
        () =>
          validateCaptionLayoutOverride({
            breaking: {
              breakPriorities: { rows: disabledWidth },
            },
          }),
        /cannot disable the "width" constraint/,
      );
    });
  },

  () => {
    test('Caption Layout smart breaks prefer punctuation only when capacity requires it', () => {
      const policy = createDefaultCaptionLayoutPolicy();
      const words = [
        { word: 'I', startTimestamp: 0, visualEndTimestamp: 0.1 },
        { word: 'LOVE', startTimestamp: 0.1, visualEndTimestamp: 0.2 },
        { word: 'THIS!', startTimestamp: 0.2, visualEndTimestamp: 0.3 },
        { word: 'SONG', startTimestamp: 0.3, visualEndTimestamp: 0.4 },
      ];
      const measure = (value) => value.length * 10;
      const fitsTogether = segmentCaptionWords(words, {
        availableWidth: 500,
        spaceX: 5,
        maxWordWidth: measure,
        policy,
        rowBreakPauseThresholdSeconds: 1,
        longWordThreshold: 0.5,
      });
      const prefersBoundary = segmentCaptionWords(words, {
        availableWidth: 115,
        spaceX: 5,
        maxWordWidth: measure,
        policy,
        rowBreakPauseThresholdSeconds: 1,
        longWordThreshold: 0.5,
      });

      assert.deepEqual(
        fitsTogether.map((group) => group.map((entry) => entry.word)),
        [['I', 'LOVE', 'THIS!', 'SONG']],
      );
      assert.deepEqual(
        prefersBoundary.map((group) => group.map((entry) => entry.word)),
        [['I', 'LOVE', 'THIS!'], ['SONG']],
      );
    });
  },

  () => {
    test('Caption Layout smart breaks recognize standalone emoji boundaries', () => {
      const policy = createDefaultCaptionLayoutPolicy();
      const words = [
        { word: 'A', startTimestamp: 0, visualEndTimestamp: 0.1 },
        { word: '"😊', startTimestamp: 0.1, visualEndTimestamp: 0.2 },
        { word: 'B', startTimestamp: 0.2, visualEndTimestamp: 0.3 },
        { word: 'C', startTimestamp: 0.3, visualEndTimestamp: 0.4 },
      ];
      const groups = segmentCaptionWords(words, {
        availableWidth: 60,
        spaceX: 5,
        maxWordWidth: (word) => (word === '"😊' ? 20 : 10),
        policy,
        rowBreakPauseThresholdSeconds: 1,
        longWordThreshold: 0.5,
      });

      assert.deepEqual(
        groups.map((group) => group.map((entry) => entry.word)),
        [
          ['A', '"😊'],
          ['B', 'C'],
        ],
      );
    });
  },

  () => {
    test('Caption Layout keeps trailing emoji with the punctuation row boundary', () => {
      for (const punctuationMode of ['always', 'prefer']) {
        const policy = createDefaultCaptionLayoutPolicy();
        policy.breaking.breakPriorities.rows = policy.breaking.breakPriorities.rows.map((rule) =>
          rule.id === 'punctuation' ? { ...rule, mode: punctuationMode } : rule,
        );
        const words = [
          { word: "Life's", startTimestamp: 0, visualEndTimestamp: 0.1 },
          { word: 'too', startTimestamp: 0.1, visualEndTimestamp: 0.2 },
          { word: 'short.', startTimestamp: 0.2, visualEndTimestamp: 0.3 },
          { word: '⏳', startTimestamp: 0.3, visualEndTimestamp: 0.4 },
          { word: 'Take', startTimestamp: 0.4, visualEndTimestamp: 0.5 },
        ];
        const groups = segmentCaptionWords(words, {
          availableWidth: 180,
          spaceX: 5,
          maxWordWidth: (word) => ({ "Life's": 50, too: 30, 'short.': 60, '⏳': 20, Take: 40 })[word] ?? 10,
          policy,
          rowBreakPauseThresholdSeconds: 1,
          longWordThreshold: 0.5,
        });

        assert.deepEqual(
          groups.map((group) => group.map((entry) => entry.word)),
          [["Life's", 'too', 'short.', '⏳'], ['Take']],
        );
      }
    });
  },

  () => {
    test('Caption Layout chooses the latest fitting preferred cue boundary', () => {
      const policy = createDefaultCaptionLayoutPolicy();
      policy.breaking.breakPriorities.rows = policy.breaking.breakPriorities.rows.map((rule) =>
        rule.id === 'source' ? { ...rule, mode: 'prefer' } : rule,
      );
      const words = [
        { word: 'happens.', startTimestamp: 0, visualEndTimestamp: 0.35 },
        { word: '👀', startTimestamp: 0.35, visualEndTimestamp: 0.7, breakBefore: true },
        { word: 'Stop', startTimestamp: 0.85, visualEndTimestamp: 1.2, breakBefore: true },
      ];
      const groups = segmentCaptionWords(words, {
        availableWidth: 95,
        spaceX: 5,
        maxWordWidth: (word) => ({ 'happens.': 70, '👀': 20, Stop: 40 })[word] ?? 10,
        policy,
        rowBreakPauseThresholdSeconds: 1,
        longWordThreshold: 0.5,
      });

      assert.deepEqual(
        groups.map((group) => group.map((entry) => entry.word)),
        [['happens.', '👀'], ['Stop']],
      );
    });
  },

  () => {
    test('Caption Layout keeps a fitting emoji with its row and borrows only when needed', () => {
      const policy = createDefaultCaptionLayoutPolicy();
      policy.rowsPerPage = { mode: 'all' };
      policy.breaking.breakPriorities.rows = policy.breaking.breakPriorities.rows.map((rule) =>
        rule.id === 'source' ? { ...rule, mode: 'prefer' } : rule,
      );
      const words = [
        { word: "Life's", startTimestamp: 0, visualEndTimestamp: 0.1 },
        { word: 'too', startTimestamp: 0.1, visualEndTimestamp: 0.2 },
        { word: 'short.', startTimestamp: 0.2, visualEndTimestamp: 0.3 },
        { word: '⏳', startTimestamp: 0.3, visualEndTimestamp: 0.4, breakBefore: true },
        { word: 'Take', startTimestamp: 0.4, visualEndTimestamp: 0.5, breakBefore: true },
      ];
      const pages = allocateCaptionPages([words.slice(0, 3), [words[3]], [words[4]]], {
        policy,
        availableWidth: 180,
        spaceX: 5,
        maxWordWidth: (word) => ({ "Life's": 50, too: 30, 'short.': 60, '⏳': 20, Take: 40 })[word] ?? 10,
        rowHeight: () => 40,
        longWordThreshold: 0.5,
        pageBreakPauseThresholdSeconds: 1,
      });

      assert.deepEqual(
        pages[0].map((row) => row.map((entry) => entry.word)),
        [["Life's", 'too', 'short.', '⏳'], ['Take']],
      );

      const borrowedPages = allocateCaptionPages([words.slice(0, 3), [words[3]], [words[4]]], {
        policy,
        availableWidth: 160,
        spaceX: 5,
        maxWordWidth: (word) => ({ "Life's": 50, too: 30, 'short.': 60, '⏳': 20, Take: 40 })[word] ?? 10,
        rowHeight: () => 40,
        longWordThreshold: 0.5,
        pageBreakPauseThresholdSeconds: 1,
      });

      assert.deepEqual(
        borrowedPages[0].map((row) => row.map((entry) => entry.word)),
        [["Life's", 'too'], ['short.', '⏳'], ['Take']],
      );

      const pagePolicy = { ...policy, rowsPerPage: { mode: 'fixed', count: 1 } };
      const pagePages = allocateCaptionPages([words.slice(0, 3), [words[3]], [words[4]]], {
        policy: pagePolicy,
        availableWidth: 180,
        spaceX: 5,
        maxWordWidth: (word) => ({ "Life's": 50, too: 30, 'short.': 60, '⏳': 20, Take: 40 })[word] ?? 10,
        rowHeight: () => 40,
        longWordThreshold: 0.5,
        pageBreakPauseThresholdSeconds: 1,
      });

      assert.deepEqual(
        pagePages.map((page) => page.map((row) => row.map((entry) => entry.word))),
        [[["Life's", 'too']], [['short.', '⏳']], [['Take']]],
      );
    });
  },

  () => {
    test('Caption Layout leaves an isolated emoji row unchanged when the borrowed word does not fit', () => {
      const policy = createDefaultCaptionLayoutPolicy();
      policy.rowsPerPage = { mode: 'all' };
      policy.breaking.breakPriorities.rows = policy.breaking.breakPriorities.rows.map((rule) =>
        rule.id === 'source' ? { ...rule, mode: 'prefer' } : rule,
      );
      const words = [
        { word: 'A', startTimestamp: 0, visualEndTimestamp: 0.1 },
        { word: 'short.', startTimestamp: 0.1, visualEndTimestamp: 0.2 },
        { word: '⏳', startTimestamp: 0.2, visualEndTimestamp: 0.3, breakBefore: true },
      ];
      const pages = allocateCaptionPages([[words[0], words[1]], [words[2]]], {
        policy,
        availableWidth: 70,
        spaceX: 5,
        maxWordWidth: (word) => ({ A: 10, 'short.': 60, '⏳': 20 })[word] ?? 10,
        rowHeight: () => 40,
        longWordThreshold: 0.5,
        pageBreakPauseThresholdSeconds: 1,
      });

      assert.deepEqual(
        pages.map((page) => page.map((row) => row.map((entry) => entry.word))),
        [[['A', 'short.'], ['⏳']]],
      );
    });
  },

  () => {
    test('Caption Layout does not borrow across a page when the new row would overflow its height', () => {
      const policy = createDefaultCaptionLayoutPolicy();
      policy.rowsPerPage = { mode: 'fixed', count: 1 };
      policy.breaking.breakPriorities.rows = policy.breaking.breakPriorities.rows.map((rule) =>
        rule.id === 'source' ? { ...rule, mode: 'prefer' } : rule,
      );
      const words = [
        { word: 'A', startTimestamp: 0, visualEndTimestamp: 0.1 },
        { word: 'short.', startTimestamp: 0.1, visualEndTimestamp: 0.2 },
        { word: '⏳', startTimestamp: 0.2, visualEndTimestamp: 0.3, breakBefore: true },
      ];
      const pages = allocateCaptionPages([[words[0], words[1]], [words[2]]], {
        policy,
        availableWidth: 180,
        spaceX: 5,
        maxWordWidth: (word) => ({ A: 10, 'short.': 60, '⏳': 20 })[word] ?? 10,
        pageHeight: 50,
        pagePadding: { top: 0, right: 0, bottom: 0, left: 0 },
        rowHeight: (row) => (row.length === 1 ? 40 : 60),
        longWordThreshold: 0.5,
        pageBreakPauseThresholdSeconds: 1,
      });

      assert.deepEqual(
        pages.map((page) => page.map((row) => row.map((entry) => entry.word))),
        [[['A', 'short.']], [['⏳']]],
      );
    });
  },

  () => {
    test('Caption Layout Fit Height validates definite page geometry and caps rows by height', () => {
      const policy = createDefaultCaptionLayoutPolicy();
      policy.rowsPerPage = { mode: 'fit-height' };
      assert.throws(() => validateCaptionLayoutForPage(policy, false), /requires a fixed page height/);

      const groups = [
        [{ word: 'A', startTimestamp: 0, visualEndTimestamp: 0.2 }],
        [{ word: 'B', startTimestamp: 0.2, visualEndTimestamp: 0.4 }],
        [{ word: 'C', startTimestamp: 0.4, visualEndTimestamp: 0.6 }],
      ];
      const pages = allocateCaptionPages(groups, {
        policy,
        pageHeight: 55,
        pagePadding: { top: 5, right: 5, bottom: 5, left: 5 },
        rowSpacing: 2,
        rowHeight: () => 20,
        longWordThreshold: 0.5,
        pageBreakPauseThresholdSeconds: 0.35,
      });
      assert.deepEqual(
        pages.map((page) => page.length),
        [2, 1],
      );
    });
  },

  () => {
    test('Caption Layout policy validation rejects invalid counts and merges partial overrides', () => {
      const policy = createDefaultCaptionLayoutPolicy();
      const allRows = validateCaptionLayoutPolicy({
        ...policy,
        rowsPerPage: { mode: 'all' },
      });
      assert.deepEqual(allRows.rowsPerPage, { mode: 'all' });
      assert.throws(
        () => validateCaptionLayoutPolicy({ ...policy, rowsPerPage: { mode: 'fixed', count: 0 } }),
        /rowsPerPage.count must be an integer from 1 through 20/,
      );
      assert.throws(
        () => validateCaptionLayoutOverride({ wordsPerRow: { mode: 'fixed', count: 51 } }),
        /wordsPerRow.count must be an integer from 1 through 50/,
      );

      const override = validateCaptionLayoutOverride({
        textDirection: 'rtl',
        rowsPerPage: { mode: 'fit-height' },
        breaking: {
          additionalCharacters: ['।', '।'],
          rowBreakPauseThresholdSeconds: 0.4,
          pageBreakPauseThresholdSeconds: 3,
        },
      });
      const resolved = mergeCaptionLayoutPolicy(policy, override);
      assert.equal(resolved.textDirection, 'rtl');
      assert.deepEqual(resolved.rowsPerPage, { mode: 'fit-height' });
      assert.deepEqual(resolved.wordsPerRow, { mode: 'auto' });
      assert.deepEqual(resolved.breaking.additionalCharacters, ['।']);
      assert.equal(resolved.breaking.rowBreakPauseThresholdSeconds, 0.4);
      assert.equal(resolved.breaking.pageBreakPauseThresholdSeconds, 3);
    });
  },

  () => {
    test('Caption Layout flow participation validates and merges row and word policies', () => {
      const policy = createDefaultCaptionLayoutPolicy();
      const override = validateCaptionLayoutOverride({
        flowParticipation: {
          collapseMode: 'reflow',
          rows: { next: 'collapse', future: 'collapse' },
          words: { next: 'collapse', future: 'collapse' },
        },
      });
      const resolved = mergeCaptionLayoutPolicy(policy, override);

      assert.equal(resolved.flowParticipation.collapseMode, 'reflow');
      assert.equal(resolved.flowParticipation.rows.next, 'collapse');
      assert.equal(resolved.flowParticipation.rows.future, 'collapse');
      assert.equal(resolved.flowParticipation.rows.current, 'include');
      assert.equal(resolved.flowParticipation.words.next, 'collapse');
      assert.equal(resolved.flowParticipation.words.future, 'collapse');
      assert.equal(resolved.flowParticipation.words.current, 'include');
      assert.throws(
        () =>
          validateCaptionLayoutPolicy({
            ...policy,
            flowParticipation: { rows: { current: 'invalid' } },
          }),
        /flowParticipation.rows.current must be "include" or "collapse"/,
      );
    });
  },

  () => {
    test('stable layout reflows later words and preserves the shared baseline after font growth', () => {
      const first = makeLine([
        makeWord('word:0', 'ONE', { size: 40 }),
        makeWord('word:1', 'TWO', { size: 20 }),
        makeWord('word:2', 'THREE', { size: 20 }),
      ]);
      layoutScene(first.root, new Canvas(1000, 400).getContext('2d'), defaultResolveContext({}), {
        width: 1000,
        height: 400,
      });
      const snapshot = captureLayoutSnapshot(first.root);
      const firstRowCenter = first.row.box.y + first.row.box.height / 2;
      const firstLaterWord = first.row.children[1];

      const second = makeLine([
        makeWord('word:0', 'ONE', { size: 100 }),
        makeWord('word:1', 'TWO', { size: 20 }),
        makeWord('word:2', 'THREE', { size: 20 }),
      ]);
      layoutScene(second.root, new Canvas(1000, 400).getContext('2d'), defaultResolveContext({}), {
        width: 1000,
        height: 400,
        stableLayout: snapshot,
      });

      const currentWord = second.row.children[0];
      const laterWord = second.row.children[1];
      const secondRowCenter = second.row.box.y + second.row.box.height / 2;
      const baseline = (word) => word.box.y + word.box.height / 2 + word.textBaselineOffset;

      assert.ok(laterWord.box.x > firstLaterWord.box.x);
      assert.ok(Math.abs(secondRowCenter - firstRowCenter) < 1);
      assert.ok(Math.abs(baseline(currentWord) - baseline(laterWord)) < 1);
    });
  },

  () => {
    test('Caption Layout reports deterministic fixed-page overflow instead of hiding it', () => {
      const policy = createDefaultCaptionLayoutPolicy();
      policy.rowsPerPage = { mode: 'fixed', count: 2 };
      const diagnostics = diagnoseCaptionPageOverflow(
        [
          [
            [{ word: 'A', startTimestamp: 0, visualEndTimestamp: 0.2 }],
            [{ word: 'B', startTimestamp: 0.2, visualEndTimestamp: 0.4 }],
          ],
        ],
        {
          policy,
          pageHeight: 50,
          pagePadding: { top: 5, right: 5, bottom: 5, left: 5 },
          rowSpacing: 2,
          rowHeight: () => 25,
          longWordThreshold: 0.5,
          pageBreakPauseThresholdSeconds: 0.35,
        },
      );
      assert.equal(diagnostics.length, 1);
      assert.equal(diagnostics[0].code, 'page-overflow');
      assert.equal(diagnostics[0].availableHeight, 40);
      assert.equal(diagnostics[0].requiredHeight, 52);
    });
  },

  () => {
    test('Page fitChildren breaks the Row fitParent intrinsic sizing cycle', () => {
      const root = new CompositionArea('compositionArea');
      const page = new Page('page');
      page.addComponent(
        new Transform(
          new Map([
            ['widthMode', staticProperty('string', 'fitChildren')],
            ['heightMode', staticProperty('string', 'fitChildren')],
          ]),
        ),
      );
      root.addChild(page);
      for (let index = 0; index < 2; index += 1) {
        const row = new Row(`row-${index}`);
        row.addComponent(
          new Transform(
            new Map([
              ['widthMode', staticProperty('string', 'fitChildren')],
              ['heightMode', staticProperty('string', 'fitParent')],
            ]),
          ),
        );
        row.addChild(makeWord(`word-${index}`, 'Caption', { size: 40 }));
        page.addChild(row);
      }

      layoutScene(root, new Canvas(16, 16).getContext('2d'), ctx(), { width: 800, height: 400 });

      assert.ok(
        page.box.height < 400,
        'fitChildren Page should use intrinsic row content rather than the frame height',
      );
      for (const row of page.children) {
        assert.ok(row.box.height < page.box.height, 'fitParent Row must not expand from the Page intrinsic result');
      }
    });
  },

  () => {
    test('Transform fitParent fills a Page parent area on both axes', () => {
      const root = new CompositionArea('compositionArea');
      const page = new Page('page');
      page.addComponent(
        new Transform(
          new Map([
            ['widthMode', staticProperty('string', 'fitParent')],
            ['heightMode', staticProperty('string', 'fitParent')],
          ]),
        ),
      );
      page.addComponent(new SelfLayout(new Map([['aspectRatio', staticProperty('string', 'maintain')]])));
      const row = page.addChild(new Row('row'));
      row.addChild(makeWord('content', 'Content', { size: 40 }));
      root.addChild(page);

      layoutScene(root, new Canvas(16, 16).getContext('2d'), ctx(), { width: 800, height: 400 });

      assert.equal(
        page.box.width,
        root.box.width,
        'fitParent width should use the parent area, not its padded content box',
      );
      assert.equal(
        page.box.height,
        root.box.height,
        'fitParent height should use the parent area, not its padded content box',
      );
      assert.equal(page.box.x, root.box.x, 'a full-width Page should start at the parent area edge');
      assert.equal(page.box.y, root.box.y, 'a full-height Page should start at the parent area edge');
    });
  },

  () => {
    test('Transform fitParent uses the CompositionArea padded content box', () => {
      const root = new CompositionArea('compositionArea');
      root.addComponent(new Layout(new Map([...insetEntries('padding', 40, 20)])));
      const page = new Page('page');
      page.addComponent(
        new Transform(
          new Map([
            ['widthMode', staticProperty('string', 'fitParent')],
            ['heightMode', staticProperty('string', 'fitParent')],
          ]),
        ),
      );
      const row = new Row('row');
      row.addComponent(
        new Transform(
          new Map([
            ['widthMode', staticProperty('string', 'fitParent')],
            ['heightMode', staticProperty('string', 'fitParent')],
          ]),
        ),
      );
      row.addChild(makeWord('content', 'Content', { size: 40 }));
      page.addChild(row);
      root.addChild(page);

      layoutScene(root, new Canvas(16, 16).getContext('2d'), ctx(), { width: 800, height: 400 });

      assert.deepEqual(root.box, { x: 0, y: 0, width: 800, height: 400 });
      assert.deepEqual(page.box, { x: 40, y: 20, width: 720, height: 360 });
      assert.deepEqual(row.box, { x: 40, y: 20, width: 720, height: 360 });
    });
  },

  () => {
    test('Transform fitParent uses the immediate Row dimensions for nested Words', () => {
      const root = new CompositionArea('compositionArea');
      const page = new Page('page');
      page.addComponent(
        new Transform(
          new Map([
            ['dimensions', staticProperty('vector2', { x: 400, y: 200 })],
            ['widthMode', staticProperty('string', 'custom')],
            ['heightMode', staticProperty('string', 'custom')],
          ]),
        ),
      );
      const row = new Row('row');
      row.addComponent(
        new Transform(
          new Map([
            ['dimensions', staticProperty('vector2', { x: 260, y: 100 })],
            ['widthMode', staticProperty('string', 'custom')],
            ['heightMode', staticProperty('string', 'custom')],
          ]),
        ),
      );
      const word = makeWord('content', 'Content', { size: 40 });
      word.addComponent(
        new Transform(
          new Map([
            ['widthMode', staticProperty('string', 'fitParent')],
            ['heightMode', staticProperty('string', 'fitParent')],
          ]),
        ),
      );
      row.addChild(word);
      page.addChild(row);
      root.addChild(page);

      layoutScene(root, new Canvas(16, 16).getContext('2d'), ctx(), { width: 800, height: 400 });

      assert.equal(row.box.width, 260);
      assert.equal(row.box.height, 100);
      assert.equal(word.box.width, row.box.width, 'fitParent width should use the direct Row parent');
      assert.equal(word.box.height, row.box.height, 'fitParent height should use the direct Row parent');
    });
  },

  () => {
    test('Transform fitParent uses a Row padded content box for nested Words', () => {
      const root = new CompositionArea('compositionArea');
      root.addComponent(new Layout(new Map(insetEntries('padding', 0, 0))));
      const page = new Page('page');
      page.addComponent(
        new Transform(
          new Map([
            ['dimensions', staticProperty('vector2', { x: 400, y: 200 })],
            ['widthMode', staticProperty('string', 'custom')],
            ['heightMode', staticProperty('string', 'custom')],
          ]),
        ),
      );
      const row = new Row('row');
      row.addComponent(
        new Transform(
          new Map([
            ['dimensions', staticProperty('vector2', { x: 260, y: 100 })],
            ['widthMode', staticProperty('string', 'custom')],
            ['heightMode', staticProperty('string', 'custom')],
          ]),
        ),
      );
      row.addComponent(new Layout(new Map(insetEntries('padding', 20, 10))));
      const word = makeWord('content', 'Content', { size: 40 });
      word.addComponent(
        new Transform(
          new Map([
            ['widthMode', staticProperty('string', 'fitParent')],
            ['heightMode', staticProperty('string', 'fitParent')],
          ]),
        ),
      );
      row.addChild(word);
      page.addChild(row);
      root.addChild(page);

      layoutScene(root, new Canvas(16, 16).getContext('2d'), ctx(), { width: 800, height: 400 });

      assert.equal(word.box.width, 220);
      assert.equal(word.box.height, 80);
      assert.equal(word.box.x, row.box.x + 20);
      assert.equal(word.box.y, row.box.y + 10);
    });
  },

  () => {
    test('Transform fitParent fills the remaining Viewport flow cell on the main axis', () => {
      const viewport = new Viewport('viewport');
      viewport.addComponent(
        new Transform(
          new Map([
            ['dimensions', staticProperty('vector2', { x: 600, y: 400 })],
            ['widthMode', staticProperty('string', 'custom')],
            ['heightMode', staticProperty('string', 'custom')],
          ]),
        ),
      );
      viewport.addComponent(
        new Layout(
          new Map([
            ['layoutMode', staticProperty('string', 'row')],
            ...insetEntries('padding', 0, 0),
            ['childrenAlignment.horizontalAlignment', staticProperty('string', 'left')],
            ['childrenAlignment.verticalAlignment', staticProperty('string', 'top')],
          ]),
        ),
      );
      const compositionArea = viewport.addChild(new CompositionArea('compositionArea'));
      compositionArea.addComponent(
        new Transform(
          new Map([
            ['widthMode', staticProperty('string', 'fitParent')],
            ['heightMode', staticProperty('string', 'fitParent')],
          ]),
        ),
      );
      compositionArea.addComponent(new Layout(new Map(insetEntries('padding', 0, 0))));
      const videoArea = viewport.addChild(new VideoArea('videoArea'));
      videoArea.addComponent(
        new Transform(
          new Map([
            ['dimensions', staticProperty('vector2', { x: 100, y: 400 })],
            ['widthMode', staticProperty('string', 'custom')],
            ['heightMode', staticProperty('string', 'custom')],
          ]),
        ),
      );
      videoArea.addComponent(new Layout(new Map(insetEntries('padding', 0, 0))));

      layoutScene(viewport, new Canvas(16, 16).getContext('2d'), ctx(), { width: 600, height: 400 });

      assert.equal(compositionArea.box.width, viewport.box.width - videoArea.box.width);
      assert.equal(compositionArea.box.height, viewport.box.height);
    });
  },

  () => {
    test('Transform fitParent flow children share a column Viewport into cells', () => {
      const viewport = new Viewport('viewport');
      viewport.addComponent(
        new Transform(
          new Map([
            ['dimensions', staticProperty('vector2', { x: 600, y: 400 })],
            ['widthMode', staticProperty('string', 'custom')],
            ['heightMode', staticProperty('string', 'custom')],
          ]),
        ),
      );
      viewport.addComponent(
        new Layout(
          new Map([
            ['layoutMode', staticProperty('string', 'column')],
            ...insetEntries('padding', 0, 0),
            ['childrenAlignment.horizontalAlignment', staticProperty('string', 'left')],
            ['childrenAlignment.verticalAlignment', staticProperty('string', 'top')],
          ]),
        ),
      );
      const videoArea = viewport.addChild(new VideoArea('videoArea'));
      const compositionArea = viewport.addChild(new CompositionArea('compositionArea'));
      compositionArea.addComponent(
        new Transform(
          new Map([
            ['widthMode', staticProperty('string', 'fitParent')],
            ['heightMode', staticProperty('string', 'fitParent')],
          ]),
        ),
      );

      layoutScene(viewport, new Canvas(16, 16).getContext('2d'), ctx(), { width: 600, height: 400 });

      assert.deepEqual(videoArea.box, { x: 0, y: 0, width: 600, height: 200 });
      assert.deepEqual(compositionArea.box, { x: 0, y: 200, width: 600, height: 200 });
    });
  },

  () => {
    test('Transform fitParent uses the immediate VideoArea dimensions for Video', () => {
      const viewport = new Viewport('viewport');
      viewport.addComponent(new Transform(new Map([['dimensions', staticProperty('vector2', { x: 600, y: 400 })]])));
      const compositionArea = viewport.addChild(new CompositionArea('compositionArea'));
      compositionArea.addComponent(new Layout(new Map(insetEntries('padding', 0, 0))));
      const videoArea = viewport.addChild(new VideoArea('videoArea'));
      videoArea.addComponent(
        new Transform(
          new Map([
            ['dimensions', staticProperty('vector2', { x: 320, y: 180 })],
            ['widthMode', staticProperty('string', 'custom')],
            ['heightMode', staticProperty('string', 'custom')],
          ]),
        ),
      );
      videoArea.addComponent(new Layout(new Map(insetEntries('padding', 20, 10))));
      const video = videoArea.addChild(new Video('video'));
      video.addComponent(
        new Transform(
          new Map([
            ['widthMode', staticProperty('string', 'fitParent')],
            ['heightMode', staticProperty('string', 'fitParent')],
          ]),
        ),
      );

      layoutScene(viewport, new Canvas(16, 16).getContext('2d'), ctx(), { width: 600, height: 400 });

      assert.equal(video.box.width, videoArea.box.width - 40);
      assert.equal(video.box.height, videoArea.box.height - 20);
    });
  },

  () => {
    test('VideoArea and Video fitParent sizing fills row and column cells exactly', () => {
      for (const layoutMode of ['row', 'column']) {
        const viewport = new Viewport(`viewport-${layoutMode}`);
        viewport.addComponent(new Transform(new Map([['dimensions', staticProperty('vector2', { x: 600, y: 400 })]])));
        viewport.addComponent(new Layout(new Map([['layoutMode', staticProperty('string', layoutMode)]])));

        const videoArea = viewport.addChild(new VideoArea(`videoArea-${layoutMode}`));
        videoArea.addComponent(
          new Transform(
            new Map([
              ['widthMode', staticProperty('string', 'fitParent')],
              ['heightMode', staticProperty('string', 'fitParent')],
            ]),
          ),
        );
        videoArea.addComponent(new Layout(new Map(insetEntries('padding', 0, 0))));

        const video = videoArea.addChild(new Video(`video-${layoutMode}`));
        video.addComponent(
          new Transform(
            new Map([
              ['widthMode', staticProperty('string', 'fitParent')],
              ['heightMode', staticProperty('string', 'fitParent')],
            ]),
          ),
        );

        const compositionArea = viewport.addChild(new CompositionArea(`compositionArea-${layoutMode}`));
        compositionArea.addComponent(
          new Transform(
            new Map([
              ['widthMode', staticProperty('string', 'fitParent')],
              ['heightMode', staticProperty('string', 'fitParent')],
            ]),
          ),
        );

        layoutScene(viewport, new Canvas(16, 16).getContext('2d'), ctx(), { width: 600, height: 400 });

        const expectedCell = layoutMode === 'row' ? { width: 300, height: 400 } : { width: 600, height: 200 };
        assert.deepEqual(videoArea.box, {
          x: 0,
          y: 0,
          ...expectedCell,
        });
        assert.deepEqual(video.box, videoArea.box);
      }
    });
  },

  () => {
    test('VideoArea keeps its aspect ratio when one axis fits its cell and the other fits content', () => {
      for (const layoutMode of ['row', 'column']) {
        const viewport = new Viewport(`viewport-ratio-${layoutMode}`);
        viewport.addComponent(new Transform(new Map([['dimensions', staticProperty('vector2', { x: 600, y: 400 })]])));
        viewport.addComponent(new Layout(new Map([['layoutMode', staticProperty('string', layoutMode)]])));

        const videoArea = viewport.addChild(new VideoArea(`videoArea-ratio-${layoutMode}`));
        videoArea.addComponent(
          new Transform(
            new Map([
              ['widthMode', staticProperty('string', 'fitParent')],
              ['heightMode', staticProperty('string', 'fitContent')],
            ]),
          ),
        );
        videoArea.addComponent(new Layout(new Map(insetEntries('padding', 0, 0))));

        const video = videoArea.addChild(new Video(`video-ratio-${layoutMode}`));
        video.addComponent(
          new Transform(
            new Map([
              ['dimensions', staticProperty('vector2', { x: 320, y: 180 })],
              ['widthMode', staticProperty('string', 'fitParent')],
              ['heightMode', staticProperty('string', 'fitParent')],
            ]),
          ),
        );

        const compositionArea = viewport.addChild(new CompositionArea(`compositionArea-ratio-${layoutMode}`));
        compositionArea.addComponent(
          new Transform(
            new Map([
              ['widthMode', staticProperty('string', 'fitParent')],
              ['heightMode', staticProperty('string', 'fitParent')],
            ]),
          ),
        );

        layoutScene(viewport, new Canvas(16, 16).getContext('2d'), ctx(), { width: 600, height: 400 });

        assert.ok(videoArea.box);
        assert.ok(video.box);
        assert.ok(Math.abs(videoArea.box.width / videoArea.box.height - 16 / 9) < 0.001);
        assert.deepEqual(video.box, videoArea.box);
      }
    });
  },

  () => {
    test('self layout: vertical alignment centers a short child in the row cross-axis', () => {
      const tall = makeWord('tall', 'Tall', { size: 80 });
      const centered = makeWord('centered', 'Center', { size: 40 });
      centered.addComponent(new SelfLayout(new Map([['verticalAlignment', staticProperty('string', 'center')]])));
      const { root } = makeLine([tall, centered]);
      layoutScene(root, new Canvas(16, 16).getContext('2d'), ctx(), { width: 800, height: 300 });

      assert.ok(centered.box.y > tall.box.y, 'centered child should move down from the row start');
      assert.ok(centered.box.y < tall.box.y + tall.box.height, 'centered child should remain inside the row');
    });
  },

  () => {
    test('contentBounds: a container effect expands the crop to fit its bleed', () => {
      const words = ['Hi', 'yo'].map((w, i) => makeWord(`w${i}`, w, { size: 80 }));
      const { root, page } = makeLine(words);

      const canvas = new Canvas(16, 16);
      const context = canvas.getContext('2d');
      layoutScene(root, context, defaultResolveContext({}), { width: 800, height: 300 });

      const before = contentBounds(root, defaultResolveContext({}));
      page.addEffect(new GaussianBlurEffect(new Map([['blurRadius', staticProperty('number', 10)]])));
      const after = contentBounds(root, defaultResolveContext({}));

      // blurRadius 10 bleeds 10px on every side of the flattened subtree.
      assert.ok(after.width >= before.width + 18, 'crop widens by ~2*blurRadius');
      assert.ok(after.height >= before.height + 18, 'crop grows vertically too');
    });
  },

  () => {
    test('Text.paint passes letterSpacing into Typewriter layout and cursor placement', () => {
      const createWord = (id, letterSpacing) => {
        const word = new Word(id);
        word.text = 'ABCD';
        const text = word.addComponent(new Text(new Map([['letterSpacing', staticProperty('number', letterSpacing)]])));
        text.addEffect(
          new TypewriterEffect(
            new Map([
              ['revealMode', staticProperty('string', 'manual')],
              ['reveal', staticProperty('number', 0.5)],
              ['cursor.blink.enabled', staticProperty('boolean', false)],
              ['cursor.showDuringReveal', staticProperty('boolean', true)],
            ]),
          ),
        );
        return word;
      };

      const normalRender = renderWord(createWord('word:typewriter-normal', 0), { width: 500, height: 240 });
      const spacedRender = renderWord(createWord('word:typewriter-spaced', 12), { width: 500, height: 240 });
      dumpPng(spacedRender.canvas, 'typewriter-letter-spacing.png');

      assert.ok(
        opaqueWidth(spacedRender.data, spacedRender.width, spacedRender.height) >
          opaqueWidth(normalRender.data, normalRender.width, normalRender.height),
      );
    });
  },

  () => {
    test('page row layout infers a hidden vertical stack for state rows', () => {
      const root = new CompositionArea('compositionArea');
      root.addComponent(
        new Layout(
          new Map([
            ['padding.top', staticProperty('number', 0)],
            ['padding.right', staticProperty('number', 0)],
            ['padding.bottom', staticProperty('number', 0)],
            ['padding.left', staticProperty('number', 0)],
          ]),
        ),
      );
      const page = root.addChild(new Page('page'));
      page.addComponent(
        new Layout(
          new Map([
            ['layoutMode', staticProperty('string', 'row')],
            ['childrenAlignment.horizontalAlignment', staticProperty('string', 'start')],
            ['childrenAlignment.verticalAlignment', staticProperty('string', 'top')],
          ]),
        ),
      );
      page.addComponent(new HorizontalSpacer(new Map([['spacing', staticProperty('number', 8)]])));

      const image = page.addChild(new ImageFlowEntity('image:default'));
      image.addComponent(new Transform(new Map([['dimensions', staticProperty('vector2', { x: 20, y: 20 })]])));

      const addStateRow = (id, state) => {
        const row = page.addChild(new Row(id));
        row.state = state;
        row.addComponent(new Transform(new Map([['dimensions', staticProperty('vector2', { x: 40, y: 10 })]])));
        return row;
      };
      const previous = addStateRow('ROW:PREVIOUS:0', 'previous');
      const current = addStateRow('ROW:CURRENT:1', 'current');
      const next = addStateRow('ROW:NEXT:2', 'next');

      layoutScene(root, new Canvas(200, 100).getContext('2d'), ctx(), { width: 200, height: 100, rowSpacing: 5 });

      assert.equal(page.children.length, 4);
      assert.ok(image.box);
      assert.ok(previous.box);
      assert.ok(current.box);
      assert.ok(next.box);
      assert.ok(image.box.x < previous.box.x);
      assert.equal(previous.box.x - image.box.x, image.box.width + 8);
      assert.equal(previous.box.x, current.box.x);
      assert.equal(current.box.x, next.box.x);
      assert.equal(current.box.y - previous.box.y, previous.box.height + 5);
      assert.equal(next.box.y - current.box.y, current.box.height + 5);
      assert.equal(captureLayoutSnapshot(root).get('page:page').flowShape[0], '__inferred-state-stack__');
    });
  },

  () => {
    test('page row layout keeps default rows in the authored horizontal flow', () => {
      const root = new CompositionArea('compositionArea');
      const page = root.addChild(new Page('page'));
      page.addComponent(new Layout(new Map([['layoutMode', staticProperty('string', 'row')]])));
      const addRow = (id) => {
        const row = page.addChild(new Row(id));
        row.addComponent(new Transform(new Map([['dimensions', staticProperty('vector2', { x: 30, y: 10 })]])));
        return row;
      };
      const first = addRow('ROW:DEFAULT:0');
      const second = addRow('ROW:DEFAULT:1');

      layoutScene(root, new Canvas(200, 100).getContext('2d'), ctx(), { width: 200, height: 100 });

      assert.ok(first.box);
      assert.ok(second.box);
      assert.equal(first.box.y, second.box.y);
      assert.equal(second.box.x - first.box.x, first.box.width);
    });
  },

  () => {
    test('page horizontal spacer adds a gap between row-layout children', () => {
      const root = new CompositionArea('compositionArea');
      root.addComponent(new Layout(new Map(insetEntries('padding', 0, 0))));
      const page = root.addChild(new Page('page'));
      page.addComponent(new Layout(new Map([['layoutMode', staticProperty('string', 'row')]])));
      page.addComponent(
        new HorizontalSpacer(
          new Map([
            ['spacing', staticProperty('number', 7)],
            ['unit', staticProperty('string', 'pt')],
          ]),
        ),
      );

      const addRow = (id) => {
        const row = page.addChild(new Row(id));
        row.addComponent(new Transform(new Map([['dimensions', staticProperty('vector2', { x: 30, y: 10 })]])));
        return row;
      };
      const first = addRow('ROW:DEFAULT:0');
      const second = addRow('ROW:DEFAULT:1');

      layoutScene(root, new Canvas(200, 100).getContext('2d'), ctx(), { width: 200, height: 100 });

      assert.ok(first.box);
      assert.ok(second.box);
      assert.equal(second.box.x - first.box.x, first.box.width + 7);
    });
  },

  () => {
    test('viewport horizontal spacer adds a gap between horizontal flow children', () => {
      const viewport = new Viewport('viewport');
      viewport.addComponent(new Transform(new Map([['dimensions', staticProperty('vector2', { x: 200, y: 100 })]])));
      viewport.addComponent(
        new Layout(
          new Map([
            ['layoutMode', staticProperty('string', 'row')],
            ['childrenAlignment.horizontalAlignment', staticProperty('string', 'left')],
            ['childrenAlignment.verticalAlignment', staticProperty('string', 'top')],
            ...insetEntries('padding', 0, 0),
          ]),
        ),
      );
      const compositionArea = viewport.addChild(new CompositionArea('compositionArea'));
      compositionArea.addComponent(
        new Transform(new Map([['dimensions', staticProperty('vector2', { x: 20, y: 20 })]])),
      );
      compositionArea.addComponent(new Layout(new Map(insetEntries('padding', 0, 0))));
      const first = viewport.addChild(new ImageFlowEntity('image:first'));
      first.addComponent(new Transform(new Map([['dimensions', staticProperty('vector2', { x: 30, y: 20 })]])));
      const second = viewport.addChild(new ImageFlowEntity('image:second'));
      second.addComponent(new Transform(new Map([['dimensions', staticProperty('vector2', { x: 30, y: 20 })]])));
      viewport.addComponent(
        new HorizontalSpacer(
          new Map([
            ['spacing', staticProperty('number', 9)],
            ['unit', staticProperty('string', 'pt')],
          ]),
        ),
      );

      layoutScene(viewport, new Canvas(200, 100).getContext('2d'), ctx(), { width: 200, height: 100 });

      assert.ok(first.box);
      assert.ok(second.box);
      assert.equal(second.box.x - first.box.x, first.box.width + 9);
    });
  },

  () => {
    test('viewport vertical spacer adds a gap between vertical flow children', () => {
      const viewport = new Viewport('viewport');
      viewport.addComponent(new Transform(new Map([['dimensions', staticProperty('vector2', { x: 200, y: 100 })]])));
      viewport.addComponent(
        new Layout(
          new Map([
            ['layoutMode', staticProperty('string', 'column')],
            ['childrenAlignment.horizontalAlignment', staticProperty('string', 'left')],
            ['childrenAlignment.verticalAlignment', staticProperty('string', 'top')],
            ...insetEntries('padding', 0, 0),
          ]),
        ),
      );
      const compositionArea = viewport.addChild(new CompositionArea('compositionArea'));
      compositionArea.addComponent(
        new Transform(new Map([['dimensions', staticProperty('vector2', { x: 20, y: 20 })]])),
      );
      compositionArea.addComponent(new Layout(new Map(insetEntries('padding', 0, 0))));
      const first = viewport.addChild(new ImageFlowEntity('image:first'));
      first.addComponent(new Transform(new Map([['dimensions', staticProperty('vector2', { x: 30, y: 20 })]])));
      const second = viewport.addChild(new ImageFlowEntity('image:second'));
      second.addComponent(new Transform(new Map([['dimensions', staticProperty('vector2', { x: 30, y: 20 })]])));
      viewport.addComponent(
        new VerticalSpacer(
          new Map([
            ['spacing', staticProperty('number', 9)],
            ['unit', staticProperty('string', 'pt')],
          ]),
        ),
      );

      layoutScene(viewport, new Canvas(200, 100).getContext('2d'), ctx(), { width: 200, height: 100 });

      assert.ok(first.box);
      assert.ok(second.box);
      assert.equal(second.box.y - first.box.y, first.box.height + 9);
    });
  },

  () => {
    test('viewport vertical spacer resolves percentage gaps against padded content', () => {
      const viewport = new Viewport('viewport');
      viewport.addComponent(new Transform(new Map([['dimensions', staticProperty('vector2', { x: 200, y: 100 })]])));
      viewport.addComponent(
        new Layout(
          new Map([
            ['layoutMode', staticProperty('string', 'column')],
            ['childrenAlignment.horizontalAlignment', staticProperty('string', 'left')],
            ['childrenAlignment.verticalAlignment', staticProperty('string', 'top')],
            ...insetEntries('padding', 10, 10),
          ]),
        ),
      );
      const compositionArea = viewport.addChild(new CompositionArea('compositionArea'));
      compositionArea.addComponent(
        new Transform(new Map([['dimensions', staticProperty('vector2', { x: 20, y: 20 })]])),
      );
      const first = viewport.addChild(new ImageFlowEntity('image:first'));
      first.addComponent(new Transform(new Map([['dimensions', staticProperty('vector2', { x: 30, y: 20 })]])));
      const second = viewport.addChild(new ImageFlowEntity('image:second'));
      second.addComponent(new Transform(new Map([['dimensions', staticProperty('vector2', { x: 30, y: 20 })]])));
      viewport.addComponent(
        new VerticalSpacer(
          new Map([
            ['spacing', staticProperty('number', 10)],
            ['unit', staticProperty('string', '%')],
          ]),
        ),
      );

      layoutScene(viewport, new Canvas(200, 100).getContext('2d'), ctx(), { width: 200, height: 100 });

      assert.ok(first.box);
      assert.ok(second.box);
      assert.equal(second.box.y - first.box.y, first.box.height + 8);
    });
  },
];

for (const registerTest of testRegistrations) registerTest();
