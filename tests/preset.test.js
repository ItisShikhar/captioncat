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
    test('effects use previousEffect and serialize appliesOn first', () => {
      const baseEffect = new GaussianBlurEffect(new Map([['blurRadius', staticProperty('number', 8)]]));
      assert.equal(baseEffect.getAppliesOn(ctx({})), 'base');

      const chainedEffect = new GaussianBlurEffect(
        new Map([
          ['blurRadius', staticProperty('number', 8)],
          ['appliesOn', staticProperty('string', 'previousEffect')],
        ]),
      );
      assert.equal(chainedEffect.getAppliesOn(ctx({})), 'previousEffect');

      const page = new Page('page');
      page.addEffect(chainedEffect);
      const serialized = serializeEntityTree(page);
      assert.deepEqual(Object.keys(serialized.effects[0].props), ['appliesOn', 'blurRadius']);
      assert.equal(serialized.effects[0].props.appliesOn.value, 'previousEffect');
    });
  },

  () => {
    test('BackgroundStyle: procedural path properties round-trip through ECS presets', () => {
      const tree = buildEcsTree(
        canonicalViewport({
          entity: 'compositionArea',
          id: 'compositionArea',
          components: [
            {
              component: 'backgroundStyle',
              props: {
                pathShape: { type: 'string', value: 'iMessage' },
                tailSide: { type: 'string', value: 'right' },
                tailSize: { type: 'number', value: 1.4 },
              },
            },
          ],
        }),
      );
      const serialized = serializeEntityTree(tree.find((entity) => entity.id === 'compositionArea'));
      const background = serialized.components.find((component) => component.component === 'backgroundStyle');
      assert.equal(background.props.pathShape.value, 'iMessage');
      assert.equal(background.props.tailSide.value, 'right');
      assert.equal(background.props.tailSize.value, 1.4);
    });
  },

  () => {
    test('Apple Music preset fades the first and last page boundaries', () => {
      const preset = loadEcsPreset('apple-music.json');
      const template = buildEcsTreeFromPreset(preset);
      const rows = [['ONE'], ['TWO'], ['THREE']];

      const pageOpacityAt = (currentIndex, elapsedSeconds) => {
        const scene = instantiateScene(template, {
          rows,
          currentIndex,
          stateWindow: preset.stateWindow,
        });
        const page = scene.compositionArea.children.find((child) => child instanceof Page);
        assert.ok(page?.transform);
        const context = prepareAnimationContext(
          scene,
          defaultResolveContext({ elapsedSeconds, triggerIntervalSeconds: 0.5 }),
        );
        return page.transform.getProp('opacity').resolve(context);
      };

      assert.equal(pageOpacityAt(0, 0), 0.18);
      assert.equal(pageOpacityAt(0, 0.2), 1);
      assert.equal(pageOpacityAt(2, 0), 1);
      assert.equal(pageOpacityAt(2, 0.2), 0.18);
    });
  },

  () => {
    test('Apple Music preset renders a multi-row page through the ECS pipeline', async () => {
      const preset = loadEcsPreset('apple-music.json');
      const result = await generateSubtitleImagesEcs({
        videoResolution: { width: 640, height: 360 },
        timestamps: {
          words: ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'],
          word_start_times_seconds: [0, 0.5, 1, 1.5, 2, 2.5],
          word_end_times_seconds: [0.4, 0.9, 1.4, 1.9, 2.4, 2.9],
          break_before: [false, true, true, true, true, true],
        },
        design: preset.design,
        stateWindow: preset.stateWindow,
        captionLayout: preset.captionLayout,
        fps: 4,
        debug: true,
        collectFrames: false,
      });
      assert.ok(result.debugLayout.frames.some((frame) => frame.rows.length >= 5));
      for (const frame of result.debugLayout.frames) {
        const rows = [...frame.rows].sort((a, b) => a.top - b.top);
        for (let index = 1; index < rows.length; index += 1) {
          assert.ok(rows[index].top >= rows[index - 1].bottom - 0.001);
        }
      }
    });
  },

  () => {
    test('BackgroundStyle is supported on every physical entity kind', () => {
      const root = new CompositionArea('compositionArea');
      const videoArea = new VideoArea('videoArea');
      const video = new Video('video');
      const page = new Page('page');
      const row = new Row('row');
      const word = new Word('word');
      const entities = [root, videoArea, video, page, row, word];
      const boxes = [
        { x: 0, y: 0, width: 200, height: 200 },
        { x: 5, y: 5, width: 190, height: 190 },
        { x: 10, y: 10, width: 180, height: 180 },
        { x: 20, y: 20, width: 160, height: 120 },
        { x: 30, y: 30, width: 140, height: 50 },
        { x: 40, y: 40, width: 50, height: 20 },
      ];

      entities.forEach((entity, index) => {
        entity.box = { ...boxes[index] };
        entity.addComponent(new BackgroundStyle());
      });
      root.addChild(videoArea).addChild(video).addChild(page).addChild(row).addChild(word);

      layoutScene(root, new Canvas(1, 1).getContext('2d'), ctx(), { width: 200, height: 200 });

      for (const [index, entity] of entities.entries()) {
        assert.ok(entity.getComponent('backgroundStyle').allowedEntities.includes(entity.kind));
        assert.deepEqual(entity.getComponent('backgroundStyle').box, entity.box, entity.kind);
      }
    });
  },

  () => {
    test('buildEcsTree preserves canonical background blur effects', () => {
      const root = buildEcsTree({
        ...canonicalViewport({
          entity: 'compositionArea',
          id: 'compositionArea',
          children: [
            {
              entity: 'page',
              id: 'page',
              components: [
                {
                  component: 'backgroundStyle',
                  props: { enabled: { type: 'boolean', value: true } },
                  effects: [{ id: 'blur-1', effect: 'blur', props: { radius: { type: 'number', value: 8 } } }],
                },
              ],
              children: [],
            },
          ],
        }),
      });

      const page = root.compositionArea.children[0];
      assert.ok(page instanceof Page);
      const background = page.components.find((component) => component instanceof BackgroundStyle);
      assert.ok(background instanceof BackgroundStyle);
      const blur = background.effects.find((effect) => effect.type === 'blur');
      assert.ok(blur instanceof GaussianBlurEffect);
      assert.equal(blur.getProp('radius').resolve(ctx({})), 8);
    });
  },

  () => {
    test('font weight properties serialize canonical numeric values', () => {
      const property = buildProperty({ type: 'fontWeight', value: 600 });
      assert.equal(property.kind, 'fontWeight');
      assert.equal(property.base, 600);

      const design = {
        entity: 'viewport',
        id: 'viewport',
        components: [],
        children: [
          {
            entity: 'videoArea',
            id: 'videoArea',
            components: [
              { component: 'transform', props: { dimensions: { type: 'vector2', value: { x: 100, y: 100 } } } },
              { component: 'layout', props: {} },
            ],
            children: [{ entity: 'video', id: 'video' }],
          },
          {
            entity: 'compositionArea',
            id: 'compositionArea',
            components: [
              { component: 'transform', props: { dimensions: { type: 'vector2', value: { x: 100, y: 100 } } } },
            ],
            children: [
              {
                entity: 'page',
                id: 'page',
                components: [],
                children: [
                  {
                    entity: 'row',
                    id: 'row',
                    components: [
                      { component: 'transform', props: { dimensions: { type: 'vector2', value: { x: 100, y: 100 } } } },
                    ],
                    children: [
                      {
                        entity: 'word',
                        id: 'word',
                        components: [
                          {
                            component: 'font',
                            props: {
                              family: { type: 'fontFamily', value: ['Bangers'] },
                              weight: { type: 'fontWeight', value: 700 },
                            },
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };
      const viewport = buildEcsTree(design);
      const word = viewport.children[1].children[0].children[0].children[0];
      const font = word.getComponent('font');
      assert.equal(font.getProp('weight').kind, 'fontWeight');
      assert.equal(font.getProp('weight').base, 700);
      const serializedWord = serializeEntityTree(viewport).children[1].children[0].children[0].children[0];
      const serializedFont = serializedWord.components.find((component) => component.component === 'font');
      assert.equal(serializedFont.props.weight.type, 'fontWeight');
      assert.equal(serializedFont.props.weight.value, 700);
    });
  },

  () => {
    test('buildEcsTree from the real "authentic" ECS preset JSON', () => {
      const root = buildEcsTreeFromPreset(loadEcsPreset('authentic.json'));

      assert.ok(root instanceof Viewport);

      const videoArea = root.findById('videoArea');
      assert.ok(videoArea instanceof VideoArea, 'authentic should define a VideoArea');
      assert.ok(videoArea.video instanceof Video, 'video area should own a Video child');

      const page = root.findById('page');
      assert.ok(page instanceof Page);
      assert.ok(page.layout instanceof Layout, 'page should carry a Layout component');

      const row = page.children[0];
      assert.ok(row instanceof Row);

      const wordIds = row.children.map((w) => w.id).sort();
      assert.deepEqual(wordIds, ['word:current', 'word:default', 'word:next', 'word:previous']);

      const current = root.findById('word:current');
      const transform = current.transform;
      assert.ok(transform, 'current word should have a Transform component');

      const opacity = transform.getProp('opacity');
      assert.ok(opacity, 'opacity property should exist');
      assert.equal(opacity.resolve(ctx({})), 0);

      const blurEffect = current.effects.find((e) => e.type === 'blur');
      assert.ok(blurEffect, 'text blur should become a GaussianBlurEffect');
      assert.deepEqual(blurEffect.getMargins(ctx({})), { x: 8, y: 8 });
    });
  },

  () => {
    test('ecs-preset: rows without Transform are rejected', () => {
      assert.throws(
        () =>
          buildEcsTree({
            entity: 'viewport',
            id: 'viewport',
            children: [
              {
                entity: 'row',
                id: 'row:default',
              },
            ],
          }),
        /row "row:default" must declare a transform component/,
      );
    });
  },

  () => {
    test('buildEcsTree builds every shipped ECS preset without throwing', () => {
      assert.ok(ECS_PRESET_NAMES.length > 0, 'expected ECS preset JSON files to exist');

      for (const file of ECS_PRESET_NAMES) {
        const preset = loadEcsPreset(file);
        const root = buildEcsTreeFromPreset(preset);

        assert.ok(root instanceof Viewport, `${file}: root should be a Viewport`);
        assert.ok(root.findById('videoArea') instanceof VideoArea, `${file}: should contain a VideoArea`);
        assert.ok(root.findById('page') instanceof Page, `${file}: should contain a Page`);

        for (const progress of [0, 1]) {
          root.traverse((entity) => {
            const margins = entity.getSelfMargins(ctx({ progress }));
            assert.equal(typeof margins.x, 'number', `${file}: margin.x should be numeric`);
            assert.equal(typeof margins.y, 'number', `${file}: margin.y should be numeric`);
            assert.ok(Number.isFinite(margins.x) && Number.isFinite(margins.y), `${file}: margins should be finite`);
          });
        }
      }
    });
  },

  () => {
    test('Typewriter square preset renders equal width and height', () => {
      const effect = new TypewriterEffect(
        new Map([
          ['cursor.preset', staticProperty('string', 'square')],
          ['cursor.size', staticProperty('number', 24)],
          ['cursor.blink.enabled', staticProperty('boolean', false)],
          ['cursor.showWhenComplete', staticProperty('boolean', true)],
        ]),
      );
      const canvas = new Canvas(240, 120);
      const context = canvas.getContext('2d');
      context.font = '80px sans-serif';
      const rctx = defaultResolveContext();
      const layout = effect.buildLayout(context, rctx, 'A', solidPaint('white'));
      context.translate(120, 60);
      effect.paintCursor(context, rctx, layout, solidPaint('white'), {
        x: -layout.width / 2,
        y: -layout.textHeight / 2,
        width: layout.width,
        height: layout.textHeight,
      });

      const cursorBounds = opaqueBounds(context.getImageData(0, 0, 240, 120).data, 240, 120);
      assert.ok(cursorBounds.width >= 23, 'square should use the configured cursor size');
      assert.ok(Math.abs(cursorBounds.width - cursorBounds.height) <= 1, 'square should have equal width and height');
    });
  },

  () => {
    test('Typewriter cursor presets load their bundled SVG assets', async () => {
      const assets = ['mac', 'mac2', 'windows', 'old', 'ios', 'caret', 'caret-bold', 'block'];
      const states = await Promise.all(assets.map((asset) => loadImageAsset(cursorAssetSource(asset))));

      assert.deepEqual(
        states.map((state) => state.status),
        assets.map(() => 'loaded'),
      );
      assert.equal(cursorAssetForPreset('windows'), 'windows');
      assert.equal(cursorAssetForPreset('old'), 'old');
      assert.equal(cursorAssetForPreset('android'), 'mac2');
      assert.equal(cursorAssetForPreset('caret'), 'caret');
      assert.equal(cursorAssetForPreset('caret-bold'), 'caret-bold');
      assert.equal(cursorAssetForPreset('block'), 'block');
      assert.equal(cursorAssetForPreset('square'), undefined);
      assert.equal(cursorAssetForPreset('underscore'), undefined);
      assert.equal(cursorAssetForPreset('custom'), undefined);
      assert.match(cursorSvg('ios'), /<rect\b/);
      assert.match(cursorSvg('windows'), /#FFFFFF/i);
      assert.match(cursorSvg('caret'), /M2 12L8 4L14 12/);
      assert.match(cursorSvg('caret-bold'), /stroke-width="4"/);
    });
  },

  () => {
    test('Typewriter cursor presets use shared color and size configuration', () => {
      const ios = CURSOR_PRESET_DEFINITIONS.find((definition) => definition.id === 'ios');
      const mac = CURSOR_PRESET_DEFINITIONS.find((definition) => definition.id === 'mac');
      const square = CURSOR_PRESET_DEFINITIONS.find((definition) => definition.id === 'square');
      const custom = CURSOR_PRESET_DEFINITIONS.find((definition) => definition.id === 'custom');

      assert.equal(ios?.colorMode, 'original');
      assert.equal(ios?.color, '#007AFF');
      assert.deepEqual(ios?.offset, { x: 6, y: -2 });
      assert.equal(mac?.sizeScale, 1.2);
      assert.equal(square?.shape, 'square');
      assert.equal(square?.colorMode, 'tint');
      assert.equal(custom?.shape, 'glyph');
      assert.equal(Object.prototype.hasOwnProperty.call(ios ?? {}, 'radius'), false);
      assert.equal(normalizeCursorColorMode('text'), 'original');
      assert.equal(normalizeCursorColorMode('custom'), 'tint');
      assert.match(cursorSvg('ios'), /#007AFF/i);
      assert.match(cursorSvg('block'), /rx="0"/);
    });
  },

  () => {
    test('Typewriter cursor preset definitions keep the JSON file order', () => {
      assert.deepEqual(
        CURSOR_PRESET_DEFINITIONS.map((definition) => definition.id),
        ['ios', 'windows', 'mac', 'android', 'old', 'caret', 'caret-bold', 'block', 'square', 'underscore', 'custom'],
      );
    });
  },

  () => {
    test('ecs-preset rejects duplicate entity IDs', () => {
      const duplicateWord = {
        entity: 'word',
        id: 'word:duplicate',
        components: [{ component: 'transform' }],
      };
      const compositionArea = {
        entity: 'compositionArea',
        id: 'compositionArea',
        children: [
          {
            entity: 'page',
            id: 'page',
            children: [
              {
                entity: 'row',
                id: 'row:default',
                components: [{ component: 'transform' }],
                children: [duplicateWord, structuredClone(duplicateWord)],
              },
            ],
          },
        ],
      };

      assert.throws(() => buildEcsTree(canonicalViewport(compositionArea)), /duplicate entity id "word:duplicate"/);
    });
  },

  () => {
    test('shipped ECS presets use only canonical persisted formats', () => {
      const requiredStateWindowFields = [
        'previousWords',
        'currentWords',
        'nextWords',
        'previousRows',
        'currentRows',
        'nextRows',
      ];
      const visit = (value, name, file) => {
        if (Array.isArray(value)) {
          value.forEach((child, index) => visit(child, `${name}[${index}]`, file));
          return;
        }
        if (!value || typeof value !== 'object') return;
        for (const [key, child] of Object.entries(value)) {
          assert.notEqual(key, 'rowSpacing', `${file} contains the removed caption-layout rowSpacing field`);
          if (
            (key === 'padding' || key === 'bandPadding' || key === 'blockPadding') &&
            child &&
            typeof child === 'object' &&
            child.type === 'vector2'
          ) {
            assert.fail(`${file} contains vector inset ${name}.${key}`);
          }
          if (key === 'copyOffset') assert.fail(`${file} contains legacy Motion Blur copyOffset`);
          if (key === 'phase') assert.notEqual(child, 'loop', `${file} contains the removed animation loop phase`);
          if (key === 'mode' && child && typeof child === 'object' && child.type === 'pattern') {
            assert.fail(`${file} contains the removed fill-pattern mode field`);
          }
          if (key === 'effects' && Array.isArray(child)) {
            for (const [index, effect] of child.entries()) {
              assert.equal(typeof effect?.id, 'string', `${file} effect ${name}[${index}] must declare an id`);
              assert.ok(effect.id.trim().length > 0, `${file} effect ${name}[${index}] must declare a non-empty id`);
            }
          }
          visit(child, `${name}.${key}`, file);
        }
      };

      for (const name of ECS_PRESET_NAMES) {
        const preset = loadEcsPreset(name);
        assert.equal(preset.schemaVersion, 1, `${name} must declare schemaVersion 1`);
        assert.deepEqual(
          Object.keys(preset.stateWindow).sort(),
          [...requiredStateWindowFields].sort(),
          `${name} has non-canonical stateWindow fields`,
        );
        visit(preset.design, 'design', name);

        const visitEntity = (entity) => {
          for (const component of entity.components ?? []) {
            if (component.component === 'font') {
              const weight = component.props?.weight;
              if (weight !== undefined) {
                assert.equal(weight.type, 'fontWeight', `${name} uses a non-canonical Font weight leaf`);
                assert.equal(typeof weight.value, 'number', `${name} uses a non-numeric Font weight value`);
              }
            }
            if (component.component === 'transform') {
              for (const key of ['offset', 'width', 'height']) {
                assert.equal(component.props?.[key], undefined, `${name} contains a legacy Transform.${key} property`);
              }
            }
            for (const child of component.components ?? []) {
              visitEntity({ components: [child], children: [] });
            }
          }
          for (const child of entity.children ?? []) visitEntity(child);
        };
        visitEntity(preset.design);
      }
    });
  },

  () => {
    test('ecs-preset rejects duplicate effect IDs across entities', () => {
      const sharedEffect = {
        effect: 'shadow',
        id: 'shadow:shared',
        props: {},
      };
      const compositionArea = {
        entity: 'compositionArea',
        id: 'compositionArea',
        children: [
          {
            entity: 'page',
            id: 'page',
            children: [
              {
                entity: 'row',
                id: 'row:default',
                components: [{ component: 'transform' }],
                children: [
                  {
                    entity: 'word',
                    id: 'word:default',
                    components: [{ component: 'transform' }],
                    effects: [sharedEffect],
                  },
                  {
                    entity: 'word',
                    id: 'word:current',
                    components: [{ component: 'transform' }],
                    effects: [structuredClone(sharedEffect)],
                  },
                ],
              },
            ],
          },
        ],
      };

      assert.throws(() => buildEcsTree(canonicalViewport(compositionArea)), /duplicate effect ID "shadow:shared"/);
    });
  },

  () => {
    test('ecs-preset attaches a Blend Mode dependency to Noise and migrates its legacy mode', () => {
      const root = buildEcsTree(
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
                  id: 'row:default',
                  components: [{ component: 'transform' }],
                  children: [
                    {
                      entity: 'word',
                      id: 'word:default',
                      components: [{ component: 'transform' }],
                      effects: [
                        {
                          effect: 'noise',
                          id: 'noise:legacy',
                          props: {
                            noise: { type: 'number', value: 0.2 },
                            blendMode: { type: 'string', value: 'multiply' },
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      );
      const word = root.findById('word:default');
      assert.ok(word);
      assert.deepEqual(
        word.effects.map((effect) => effect.type),
        ['noise', 'blendMode'],
      );
      assert.equal(word.effects[0].getProp('blendMode'), undefined);
      assert.equal(word.effects[1].dependencyOf, 'noise:legacy');
      assert.equal(word.effects[1].getProp('blendMode').base, 'multiply');
    });
  },

  () => {
    test('all ECS preset rows declare a Transform component', () => {
      const visit = (entity, source) => {
        if (entity.entity === 'row' && !entity.styleSource) {
          assert.ok(
            (entity.components ?? []).some((component) => component.component === 'transform'),
            `${source} row must declare a Transform component`,
          );
        }
        for (const [index, child] of (entity.children ?? []).entries()) visit(child, `${source}.children[${index}]`);
      };

      for (const name of ECS_PRESET_NAMES) visit(loadEcsPreset(name).design, name);
    });
  },

  () => {
    test('all ECS presets load with explicit behavior-critical component properties', () => {
      const componentsWithoutSerializedProps = new Set(['animation', 'selfLayout', 'transform']);

      for (const name of ECS_PRESET_NAMES) {
        const preset = loadEcsPreset(name);
        assert.doesNotThrow(() => buildEcsTreeFromPreset(preset), `${name} should load through the ECS runtime`);

        const visitComponent = (component, source) => {
          const hasProps = Object.prototype.hasOwnProperty.call(component, 'props');
          if (!hasProps) {
            assert.ok(
              componentsWithoutSerializedProps.has(component.component),
              `${source} component ${component.component} must declare props or be a default-only component`,
            );
          }

          if (component.component === 'verticalSpacer' || component.component === 'horizontalSpacer') {
            const spacing = component.props?.spacing;
            assert.ok(spacing, `${source} spacer must declare spacing`);
            assert.equal(spacing.type, 'number', `${source} spacer spacing must be numeric`);
            assert.equal(Number.isFinite(spacing.value), true, `${source} spacer spacing must be finite`);
          }

          for (const [index, child] of (component.components ?? []).entries()) {
            visitComponent(child, `${source}.components[${index}]`);
          }
        };
        const visitEntity = (entity, source) => {
          for (const [index, component] of (entity.components ?? []).entries()) {
            visitComponent(component, `${source}.components[${index}]`);
          }
          for (const [index, child] of (entity.children ?? []).entries()) {
            visitEntity(child, `${source}.children[${index}]`);
          }
        };

        visitEntity(preset.design, name);
      }
    });
  },

  () => {
    test('all ECS preset effects declare appliesOn first', () => {
      const visitComponent = (component, source) => {
        for (const [index, effect] of (component.effects ?? []).entries()) {
          assert.ok(effect.props, `${source} effect ${index} should have props`);
          assert.equal(
            Object.keys(effect.props)[0],
            'appliesOn',
            `${source} effect ${index} should start with appliesOn`,
          );
          assert.equal(effect.props.appliesOn.type, 'string');
          assert.notEqual(effect.props.appliesOn.value, 'previous');
        }
        for (const [index, child] of (component.components ?? []).entries()) {
          visitComponent(child, `${source}.components[${index}]`);
        }
      };
      const visitEntity = (entity, source) => {
        for (const [index, effect] of (entity.effects ?? []).entries()) {
          assert.ok(effect.props, `${source} effect ${index} should have props`);
          assert.equal(
            Object.keys(effect.props)[0],
            'appliesOn',
            `${source} effect ${index} should start with appliesOn`,
          );
          assert.equal(effect.props.appliesOn.type, 'string');
          assert.notEqual(effect.props.appliesOn.value, 'previous');
        }
        for (const [index, component] of (entity.components ?? []).entries()) {
          visitComponent(component, `${source}.components[${index}]`);
        }
        for (const [index, child] of (entity.children ?? []).entries()) {
          visitEntity(child, `${source}.children[${index}]`);
        }
      };

      for (const name of ECS_PRESET_NAMES) visitEntity(loadEcsPreset(name).design, name);
    });
  },

  () => {
    test('Marker forEntityId survives cloning and ECS serialization', () => {
      const root = new CompositionArea('compositionArea');
      const marker = root.addChild(new Marker('marker:default:1'));
      marker.forEntityId = 'row:default';

      const serialized = serializeEntityTree(root).children[0];
      assert.equal(serialized.forEntityId, 'row:default');
      assert.equal(root.clone().children[0].forEntityId, 'row:default');
    });
  },

  () => {
    test('Sparse ECS components restore animatable defaults and preserve extra Transform props', () => {
      const sparseWord = {
        entity: 'word',
        id: 'word:default',
        components: [
          {
            component: 'transform',
            props: {
              customProperty: { type: 'number', value: 42 },
            },
          },
          {
            component: 'text',
            props: {},
            components: [{ component: 'underline', props: {} }],
            effects: [
              { id: 'blur-1', effect: 'blur', props: {} },
              { id: 'motionBlur-2', effect: 'motionBlur', props: {} },
              { id: 'shadow-3', effect: 'shadow', props: {} },
              { id: 'stroke-4', effect: 'stroke', props: {} },
            ],
          },
          { component: 'font', props: {} },
          { component: 'backgroundStyle', props: {} },
          { component: 'borderRadius', props: {} },
        ],
        children: [],
      };
      const root = buildEcsTree(
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
                  id: 'row:default',
                  components: [{ component: 'transform', props: {} }],
                  children: [sparseWord],
                },
              ],
            },
          ],
        }),
      );
      const word = root.findById('word:default');
      for (const target of [
        'Transform.position',
        'Transform.scale',
        'Transform.opacity',
        'Text.color',
        'Text.letterSpacing',
        'Font.size',
        'BackgroundStyle.bandPadding.top',
        'BorderRadius.borderRadius',
        'Underline.offset',
        'Blur#blur-1.blurRadius',
        'MotionBlur#motionBlur-2.steps',
        'Shadow#shadow-3.offset',
        'Stroke#stroke-4.width',
      ]) {
        assert.ok(resolveTrackTarget(word, target), `missing sparse animation target ${target}`);
      }

      const serialized = serializeEntityTree(root);
      const serializedWord = serialized.children
        .find((child) => child.entity === 'compositionArea')
        .children.find((child) => child.entity === 'page')
        .children.find((child) => child.entity === 'row')
        .children.find((child) => child.id === 'word:default');
      const transform = serializedWord.components.find((component) => component.component === 'transform');
      assert.equal(transform.props.customProperty.value, 42);
      assert.deepEqual(transform.props.position.value, { x: 0, y: 0 });
      const background = serializedWord.components.find((component) => component.component === 'backgroundStyle');
      assert.deepEqual(background.props.bandPadding, {
        top: { type: 'number', value: 0 },
        right: { type: 'number', value: 0 },
        bottom: { type: 'number', value: 0 },
        left: { type: 'number', value: 0 },
        linkedTopBottom: { type: 'boolean', value: true },
        linkedLeftRight: { type: 'boolean', value: true },
      });
      const text = serializedWord.components.find((component) => component.component === 'text');
      assert.equal(text.props.letterSpacing.value, 0);
      assert.equal(text.effects.find((effect) => effect.effect === 'blur').props.blurRadius.value, 8);
    });
  },

  () => {
    test('Marker target-state style uses a solid mask for target text paint', () => {
      const words = [makeWord('w0', 'HELLO', { color: 'blue' })];
      words[0].state = 'current';
      words[0].addComponent(new Transform(new Map([['opacity', staticProperty('number', 0)]])));
      const { root, row } = makeLine(words);
      const marker = row.addChild(
        new Marker('marker', {
          followTarget: 'currentWord',
          anchor: 'bottomCenter',
          styleSource: 'targetState',
          styleState: 'followTarget',
        }),
      );
      marker.getComponent('image').getProp('colorMode').setBase('tint');

      const canvas = new Canvas(1000, 400);
      const context = canvas.getContext('2d');
      layoutScene(root, context, defaultResolveContext({}), { width: 1000, height: 400 });
      renderScene(root, context, defaultResolveContext({}));
      const data = canvas.toBufferSync('raw', { colorType: 'rgba' });

      assert.equal(
        hasColor(data, (r, g, b) => b > 100 && r < 100 && g < 100),
        true,
      );
      const serializedImage = serializeEntityTree(marker).components.find(
        (component) => component.component === 'image',
      );
      assert.equal(serializedImage?.props.colorMode.value, 'tint');
    });
  },

  () => {
    test('Impact preset stretches its state rows across the Page', () => {
      const preset = loadEcsPreset('impact.json');
      const template = buildEcsTreeFromPreset(preset);
      const scene = instantiateScene(template, {
        rows: Array.from({ length: 11 }, (_, index) => [`WORD${index}`]),
        currentIndex: 7,
        stateWindow: preset.stateWindow,
      });
      layoutScene(scene, new Canvas(1, 1).getContext('2d'), defaultResolveContext({}), {
        width: 1080,
        height: 1920,
      });

      const page = scene.findById('page');
      const rows = page.children.filter((child) => child instanceof Row);
      const visibleBounds = rows.map((row) => row.box).filter((box) => box !== null);
      const content = contentBoxFromArea(page.box, page.layout, defaultResolveContext({}));
      const top = Math.min(...visibleBounds.map((box) => box.y));
      const bottom = Math.max(...visibleBounds.map((box) => box.y + box.height));

      assert.equal(page.layout.childrenAlignment(defaultResolveContext({})).verticalAlignment, 'stretch');
      assert.ok(Math.abs(top - content.y) < 1);
      assert.ok(Math.abs(bottom - (content.y + content.height)) < 1);
    });
  },

  () => {
    test('Impact preset paginates fill-width rows by their rendered height', async () => {
      const preset = loadEcsPreset('impact.json');
      const words = Array.from({ length: 16 }, (_, index) => `WORD${index}`);
      const starts = words.map((_, index) => index * 0.45);
      const ends = starts.map((start) => start + 0.4);
      const result = await generateSubtitleImagesEcs({
        videoResolution: { width: 1080, height: 1920 },
        timestamps: {
          words,
          word_start_times_seconds: starts,
          word_end_times_seconds: ends,
          break_before: words.map((_, index) => index > 0),
        },
        design: preset.design,
        stateWindow: preset.stateWindow,
        captionLayout: preset.captionLayout,
        fps: 4,
        debug: true,
        collectFrames: false,
      });

      assert.ok(result.captionInfos.filter((caption) => caption.isLastWordOnPage).length > 1);
      for (const frame of result.debugLayout.frames) {
        for (const row of frame.rows) {
          assert.ok(row.top >= frame.page.top - 0.001);
          assert.ok(row.bottom <= frame.page.bottom + 0.001);
        }
      }
    });
  },

  () => {
    test('Main Character preset limits pages to five rows', () => {
      const preset = loadEcsPreset('main-character.json');
      assert.deepEqual(preset.captionLayout.rowsPerPage, { mode: 'fixed', count: 5 });

      const groups = Array.from({ length: 7 }, (_, index) => [
        {
          word: `WORD${index + 1}`,
          startTimestamp: index,
          visualEndTimestamp: index + 0.2,
        },
      ]);
      const pages = allocateCaptionPages(groups, {
        policy: preset.captionLayout,
        longWordThreshold: 0.5,
        pageBreakPauseThresholdSeconds: 10,
        rowHeight: () => 20,
      });

      assert.deepEqual(
        pages.map((page) => page.length),
        [5, 2],
      );
    });
  },
];

for (const registerTest of testRegistrations) registerTest();
