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
  BlendModeEffect,
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
const { blendOverlayWithModeInPlace } = require('../build/utilities/raw-frame-compositor.js');

const testRegistrations = [
  () => {
    test('FisheyeEffect applies concave mode without changing transparent pixels', () => {
      const canvas = new Canvas(8, 4);
      const context = canvas.getContext('2d');
      const effect = new FisheyeEffect(
        new Map([
          ['mode', staticProperty('string', 'concave')],
          ['distortion', staticProperty('number', 1)],
        ]),
      );

      effect.apply(context, ctx({ frameIndex: 0 }), () => {
        context.fillStyle = 'rgb(200, 200, 200)';
        context.fillRect(1, 1, 6, 2);
      });

      const center = context.getImageData(3, 2, 1, 1).data;
      const edge = context.getImageData(0, 0, 1, 1).data;
      assert.ok(center[0] > edge[0]);
      assert.equal(edge[3], 0);
    });
  },

  () => {
    test('FisheyeEffect convex mode bends the image and supports crop and transparent edges', () => {
      const render = (mode, edgeMode, distortion = 1) => {
        const canvas = new Canvas(32, 16);
        const context = canvas.getContext('2d');
        const effect = new FisheyeEffect(
          new Map([
            ['mode', staticProperty('string', mode)],
            ['distortion', staticProperty('number', distortion)],
            ['zoom', staticProperty('number', 1)],
            ['edgeMode', staticProperty('string', edgeMode)],
            ['aspectCorrection', staticProperty('boolean', true)],
          ]),
        );
        effect.apply(context, ctx({ frameIndex: 0 }), () => {
          const gradient = context.createLinearGradient(0, 0, canvas.width, 0);
          gradient.addColorStop(0, 'rgb(200, 100, 50)');
          gradient.addColorStop(1, 'rgb(20, 40, 220)');
          context.fillStyle = gradient;
          context.fillRect(0, 0, canvas.width, canvas.height);
        });
        return context.getImageData(0, 0, canvas.width, canvas.height).data;
      };

      const convex = render('convex', 'clamp');
      const baseline = render('convex', 'clamp', 0);
      const cropped = render('concave', 'crop');
      const transparent = render('concave', 'transparent');
      assert.notDeepEqual(Array.from(convex), Array.from(baseline));
      assert.ok(Array.from(cropped).every((value, index) => index % 4 !== 3 || value === 255));
      assert.ok(Array.from(transparent).some((value, index) => index % 4 === 3 && value === 0));
    });
  },

  () => {
    test('FisheyeEffect clamp edge mode keeps source pixels at the frame boundary', () => {
      const canvas = new Canvas(16, 16);
      const context = canvas.getContext('2d');
      const effect = new FisheyeEffect(
        new Map([
          ['mode', staticProperty('string', 'concave')],
          ['distortion', staticProperty('number', 1)],
          ['edgeMode', staticProperty('string', 'clamp')],
        ]),
      );
      effect.apply(context, ctx({ frameIndex: 0 }), () => {
        context.fillStyle = 'rgb(200, 100, 50)';
        context.fillRect(0, 0, canvas.width, canvas.height);
      });
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      assert.ok(Array.from(pixels).every((value, index) => index % 4 !== 3 || value === 255));
    });
  },

  () => {
    test('FisheyeEffect reserves margins for zoomed output', () => {
      const effect = new FisheyeEffect(
        new Map([
          ['mode', staticProperty('string', 'concave')],
          ['zoom', staticProperty('number', 2)],
        ]),
      );
      assert.deepEqual(effect.getMargins(ctx({ frameIndex: 0 }), { bounds: { width: 100, height: 40 } }), {
        x: 50,
        y: 20,
      });
    });
  },

  () => {
    test('Concave Fisheye zoom expands the auto-cropped frame', () => {
      const word = new Word('word:concave-zoom', 'H');
      word.box = { x: 10, y: 10, width: 20, height: 20 };
      word.addComponent(new Text());
      word.addEffect(
        new FisheyeEffect(
          new Map([
            ['mode', staticProperty('string', 'concave')],
            ['zoom', staticProperty('number', 2)],
          ]),
        ),
      );

      const frame = renderCaptionFrame(word, ctx({}));

      assert.deepEqual(frame.frameSize, { width: 40, height: 40 });
      const hasAlphaInRange = (startY, endY) =>
        Array.from(frame.rgba).some((value, index) => {
          const pixelIndex = Math.floor(index / 4);
          const y = Math.floor(pixelIndex / frame.frameSize.width);
          return index % 4 === 3 && y >= startY && y < endY && value > 0;
        });
      assert.ok(
        hasAlphaInRange(0, frame.frameSize.height / 2) &&
          hasAlphaInRange(frame.frameSize.height / 2, frame.frameSize.height),
        'expected the zoomed glyph to remain visible across the frame height',
      );
    });
  },

  () => {
    test('VignetteEffect darkens edges without changing transparent pixels', () => {
      const canvas = new Canvas(16, 16);
      const context = canvas.getContext('2d');
      const effect = new VignetteEffect(new Map([['vignette', staticProperty('number', 1)]]));
      effect.apply(context, ctx({ frameIndex: 0 }), () => {
        context.fillStyle = 'rgb(200, 100, 50)';
        context.fillRect(2, 2, 12, 12);
      });
      const center = context.getImageData(8, 8, 1, 1).data;
      const edge = context.getImageData(2, 2, 1, 1).data;
      const transparent = context.getImageData(0, 0, 1, 1).data;
      assert.ok(center[0] > edge[0]);
      assert.equal(transparent[3], 0);
    });
  },

  () => {
    test('Noise and flicker apply as standalone effects', () => {
      const render = (effect, contextOverrides = { frameIndex: 4 }) => {
        const canvas = new Canvas(4, 4);
        const context = canvas.getContext('2d');
        effect.apply(context, ctx(contextOverrides), () => {
          context.fillStyle = 'rgb(200, 200, 200)';
          context.fillRect(0, 0, canvas.width, canvas.height);
        });
        return context.getImageData(0, 0, canvas.width, canvas.height).data;
      };

      const noise = render(new NoiseEffect(new Map([['noise', staticProperty('number', 1)]])));
      const renderBlendMode = (blendMode) => {
        const canvas = new Canvas(4, 4);
        const context = canvas.getContext('2d');
        context.fillStyle = 'rgb(255, 0, 0)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        renderEffectStack(
          context,
          ctx({ frameIndex: 4 }),
          [
            new BlendModeEffect(
              new Map([
                ['enabled', staticProperty('boolean', true)],
                ['blendMode', staticProperty('string', blendMode)],
              ]),
            ),
          ],
          (output) => {
            output.fillStyle = 'white';
            output.fillRect(0, 0, canvas.width, canvas.height);
          },
          renderWrappedEffect,
        );
        return context.getImageData(0, 0, 1, 1).data;
      };
      const normalBlend = renderBlendMode('normal');
      const multiplyBlend = renderBlendMode('multiply');
      assert.equal(normalBlend[1], 255);
      assert.equal(multiplyBlend[1], 0);
      const layeredBlend = new Canvas(4, 4);
      const layeredBlendContext = layeredBlend.getContext('2d');
      layeredBlendContext.fillStyle = 'rgb(255, 0, 0)';
      layeredBlendContext.fillRect(0, 0, layeredBlend.width, layeredBlend.height);
      renderLayeredEffectStack(
        layeredBlendContext,
        ctx({ frameIndex: 4 }),
        [new BlendModeEffect(new Map([['blendMode', staticProperty('string', 'multiply')]]))],
        () => false,
        (output) => {
          output.fillStyle = 'white';
          output.fillRect(0, 0, layeredBlend.width, layeredBlend.height);
        },
        renderWrappedEffect,
      );
      const layeredBlendPixel = layeredBlendContext.getImageData(0, 0, 1, 1).data;
      assert.equal(layeredBlendPixel[1], 0);
      const directBaseBlend = new Canvas(4, 4);
      const directBaseBlendContext = directBaseBlend.getContext('2d');
      directBaseBlendContext.fillStyle = 'rgb(255, 0, 0)';
      directBaseBlendContext.fillRect(0, 0, directBaseBlend.width, directBaseBlend.height);
      renderEffectStack(
        directBaseBlendContext,
        ctx({ frameIndex: 4 }),
        [
          new BlendModeEffect(
            new Map([
              ['appliesOn', staticProperty('string', 'base')],
              ['blendMode', staticProperty('string', 'multiply')],
            ]),
          ),
        ],
        (output) => {
          output.fillStyle = 'white';
          output.fillRect(0, 0, directBaseBlend.width, directBaseBlend.height);
        },
        renderWrappedEffect,
      );
      const directBaseBlendPixel = directBaseBlendContext.getImageData(0, 0, 1, 1).data;
      assert.equal(directBaseBlendPixel[1], 0);

      const directPreviousBlend = new Canvas(4, 4);
      const directPreviousBlendContext = directPreviousBlend.getContext('2d');
      directPreviousBlendContext.fillStyle = 'rgb(255, 0, 0)';
      directPreviousBlendContext.fillRect(0, 0, directPreviousBlend.width, directPreviousBlend.height);
      renderEffectStack(
        directPreviousBlendContext,
        ctx({ frameIndex: 4 }),
        [
          new NoiseEffect(
            new Map([
              ['appliesOn', staticProperty('string', 'previousEffect')],
              ['noise', staticProperty('number', 0)],
            ]),
          ),
          new BlendModeEffect(
            new Map([
              ['appliesOn', staticProperty('string', 'previousEffect')],
              ['blendMode', staticProperty('string', 'multiply')],
            ]),
          ),
        ],
        (output) => {
          output.fillStyle = 'rgb(128, 128, 128)';
          output.fillRect(0, 0, directPreviousBlend.width, directPreviousBlend.height);
        },
        (_effect, output) => {
          output.fillStyle = 'white';
          output.fillRect(0, 0, directPreviousBlend.width, directPreviousBlend.height);
        },
      );
      const directPreviousBlendPixel = directPreviousBlendContext.getImageData(0, 0, 1, 1).data;
      assert.equal(directPreviousBlendPixel[1], 128);

      const twoDirectBlendModes = new Canvas(4, 4);
      const twoDirectBlendModesContext = twoDirectBlendModes.getContext('2d');
      twoDirectBlendModesContext.fillStyle = 'rgb(255, 0, 0)';
      twoDirectBlendModesContext.fillRect(0, 0, twoDirectBlendModes.width, twoDirectBlendModes.height);
      renderEffectStack(
        twoDirectBlendModesContext,
        ctx({ frameIndex: 4 }),
        [
          new NoiseEffect(
            new Map([
              ['appliesOn', staticProperty('string', 'previousEffect')],
              ['noise', staticProperty('number', 0)],
            ]),
          ),
          new BlendModeEffect(
            new Map([
              ['appliesOn', staticProperty('string', 'previousEffect')],
              ['blendMode', staticProperty('string', 'screen')],
            ]),
          ),
          new BlendModeEffect(
            new Map([
              ['appliesOn', staticProperty('string', 'base')],
              ['blendMode', staticProperty('string', 'multiply')],
            ]),
          ),
        ],
        (output) => {
          output.fillStyle = 'rgb(128, 128, 128)';
          output.fillRect(0, 0, twoDirectBlendModes.width, twoDirectBlendModes.height);
        },
        (_effect, output) => {
          output.fillStyle = 'white';
          output.fillRect(0, 0, twoDirectBlendModes.width, twoDirectBlendModes.height);
        },
      );
      const twoDirectBlendModesPixel = twoDirectBlendModesContext.getImageData(0, 0, 1, 1).data;
      assert.equal(twoDirectBlendModesPixel[1], 0);

      const dependentNoise = new NoiseEffect(
        new Map([
          ['appliesOn', staticProperty('string', 'previousEffect')],
          ['noise', staticProperty('number', 0)],
        ]),
      );
      dependentNoise.id = 'noise';
      const noiseBlendMode = new BlendModeEffect(new Map([['blendMode', staticProperty('string', 'multiply')]]));
      noiseBlendMode.id = 'noise:blend-mode';
      noiseBlendMode.dependencyOf = 'noise';
      const dependentBlend = new Canvas(4, 4);
      const dependentBlendContext = dependentBlend.getContext('2d');
      dependentBlendContext.fillStyle = 'rgb(255, 0, 0)';
      dependentBlendContext.fillRect(0, 0, dependentBlend.width, dependentBlend.height);
      renderEffectStack(
        dependentBlendContext,
        ctx({ frameIndex: 4 }),
        [dependentNoise, noiseBlendMode],
        (output) => {
          output.fillStyle = 'rgb(128, 128, 128)';
          output.fillRect(0, 0, dependentBlend.width, dependentBlend.height);
        },
        renderWrappedEffect,
      );
      const dependentBlendPixel = dependentBlendContext.getImageData(0, 0, 1, 1).data;
      assert.ok(
        dependentBlendPixel[1] > 0 && dependentBlendPixel[1] < 100,
        'expected a dependent Blend Mode to composite only the Noise layer',
      );
      const staticNoise = new NoiseEffect(
        new Map([
          ['noise', staticProperty('number', 1)],
          ['static', staticProperty('boolean', true)],
        ]),
      );
      assert.deepEqual(
        Array.from(render(staticNoise, { frameIndex: 4 })),
        Array.from(render(staticNoise, { frameIndex: 5 })),
        'expected static Noise to keep the same pattern across frames',
      );
      assert.notDeepEqual(
        Array.from(noise),
        Array.from(render(new NoiseEffect(new Map([['noise', staticProperty('number', 1)]])), { frameIndex: 5 })),
        'expected animated Noise to vary across frames',
      );
      const flicker = render(new FlickerEffect(new Map([['flicker', staticProperty('number', 1)]])));
      const transparentFlicker = render(
        new FlickerEffect(
          new Map([
            ['flicker', staticProperty('number', 1)],
            ['offPaint', staticProperty('paint', solidPaint('rgba(0, 0, 0, 0)'))],
          ]),
        ),
      );
      const transparentFlickerWithPersistentOriginal = render(
        new FlickerEffect(
          new Map([
            ['flicker', staticProperty('number', 1)],
            ['offPaint', staticProperty('paint', solidPaint('rgba(0, 0, 0, 0)'))],
            ['updateMode', staticProperty('string', 'randomFrames')],
            ['maxOffDuration', staticProperty('number', 0.05)],
            ['showOriginal', staticProperty('string', 'front')],
            ['showOriginalDuringOff', staticProperty('boolean', false)],
          ]),
        ),
        { frameIndex: 5 },
      );
      assert.ok(Array.from(noise).some((value, index) => index % 4 !== 3 && value !== 200));
      assert.ok(Array.from(flicker).some((value, index) => index % 4 !== 3 && value < 200));
      assert.ok(Array.from(flicker).every((value, index) => index % 4 !== 3 || value === 255));
      assert.ok(Array.from(transparentFlicker).some((value, index) => index % 4 === 3 && value < 255));
      assert.ok(
        Array.from(transparentFlickerWithPersistentOriginal).every((value, index) => index % 4 !== 3 || value === 255),
      );

      const randomFrameProps = new Map([
        ['flicker', staticProperty('number', 1)],
        ['offPaint', staticProperty('paint', solidPaint('rgba(0, 0, 0, 0)'))],
        ['updateMode', staticProperty('string', 'randomFrames')],
        ['maxOffDuration', staticProperty('number', 0.05)],
      ]);
      const randomFrameStart = render(new FlickerEffect(randomFrameProps), { frameIndex: 4 });
      const randomFrameOff = render(new FlickerEffect(randomFrameProps), { frameIndex: 5 });
      const randomFrameAfterMaxDuration = render(new FlickerEffect(randomFrameProps), { frameIndex: 8 });
      const randomFrameOnlyDuringOff = render(
        new FlickerEffect(
          new Map([
            ...randomFrameProps,
            ['showOriginal', staticProperty('string', 'front')],
            ['showOriginalDuringOff', staticProperty('boolean', true)],
          ]),
        ),
        { frameIndex: 5 },
      );
      const randomFrameOnlyDuringOffOn = render(
        new FlickerEffect(
          new Map([
            ...randomFrameProps,
            ['showOriginal', staticProperty('string', 'front')],
            ['showOriginalDuringOff', staticProperty('boolean', true)],
          ]),
        ),
        { frameIndex: 4 },
      );
      assert.ok(randomFrameStart[3] < 255);
      assert.equal(randomFrameOff[3], 0);
      assert.equal(randomFrameAfterMaxDuration[3], 255);
      assert.equal(randomFrameOnlyDuringOff[3], 255);
      assert.ok(randomFrameOnlyDuringOffOn[3] < 255);
    });
  },

  () => {
    test('Noise preserves the base and preceding stroke and shadow layers', () => {
      const canvas = new Canvas(40, 40);
      const context = canvas.getContext('2d');
      const stroke = new StrokeEffect(
        new Map([
          ['width', staticProperty('number', 4)],
          ['color', staticProperty('paint', solidPaint('black'))],
        ]),
      );
      const shadow = new ShadowEffect(
        new Map([
          ['blurRadius', staticProperty('number', 0)],
          ['offset', staticProperty('vector2', { x: 6, y: 6 })],
          ['color', staticProperty('paint', solidPaint('black'))],
        ]),
      );
      const noise = new NoiseEffect(
        new Map([
          ['noise', staticProperty('number', 1)],
          ['appliesOn', staticProperty('string', 'previousEffect')],
        ]),
      );

      renderEffectStack(
        context,
        ctx({ frameIndex: 4 }),
        [stroke, shadow, noise],
        (output) => {
          output.fillStyle = 'white';
          output.fillRect(10, 10, 20, 20);
        },
        renderWrappedEffect,
      );

      assert.equal(context.getImageData(20, 20, 1, 1).data[3], 255);
      assert.ok(context.getImageData(8, 20, 1, 1).data[3] > 0, 'expected the preceding stroke to remain visible');
      assert.ok(context.getImageData(33, 30, 1, 1).data[3] > 0, 'expected the preceding shadow to remain visible');

      const baseAppliedCanvas = new Canvas(40, 40);
      const baseAppliedNoise = new NoiseEffect(
        new Map([
          ['noise', staticProperty('number', 1)],
          ['appliesOn', staticProperty('string', 'base')],
        ]),
      );
      renderEffectStack(
        baseAppliedCanvas.getContext('2d'),
        ctx({ frameIndex: 4 }),
        [stroke, shadow, baseAppliedNoise],
        (output) => {
          output.fillStyle = 'white';
          output.fillRect(10, 10, 20, 20);
        },
        renderWrappedEffect,
      );

      const baseAppliedContext = baseAppliedCanvas.getContext('2d');
      assert.equal(baseAppliedContext.getImageData(20, 20, 1, 1).data[3], 255);
      assert.ok(
        baseAppliedContext.getImageData(8, 20, 1, 1).data[3] > 0,
        'expected the preceding stroke to remain visible when Noise uses the base',
      );
      assert.equal(
        baseAppliedContext.getImageData(8, 20, 1, 1).data[0],
        0,
        'expected base Noise not to alter the preceding stroke color',
      );
      assert.ok(
        baseAppliedContext.getImageData(33, 30, 1, 1).data[3] > 0,
        'expected the preceding shadow to remain visible when Noise uses the base',
      );
      assert.equal(
        baseAppliedContext.getImageData(33, 30, 1, 1).data[0],
        0,
        'expected base Noise not to alter the preceding shadow color',
      );

      const layeredCanvas = new Canvas(40, 40);
      const layeredContext = layeredCanvas.getContext('2d');
      renderLayeredEffectStack(
        layeredContext,
        ctx({ frameIndex: 4 }),
        [baseAppliedNoise, shadow, stroke],
        (effect) =>
          effect instanceof StrokeEffect ? effect.isUnderlay(ctx({ frameIndex: 4 })) : effect instanceof ShadowEffect,
        (output) => {
          output.fillStyle = 'white';
          output.fillRect(10, 10, 20, 20);
        },
        renderWrappedEffect,
      );

      assert.equal(layeredContext.getImageData(20, 20, 1, 1).data[3], 255);
      assert.ok(
        layeredContext.getImageData(8, 20, 1, 1).data[3] > 0,
        'expected the preceding stroke to remain visible in layered rendering',
      );
      assert.equal(
        layeredContext.getImageData(8, 20, 1, 1).data[0],
        0,
        'expected base Noise not to alter the layered stroke color',
      );
      assert.ok(
        layeredContext.getImageData(33, 30, 1, 1).data[3] > 0,
        'expected the preceding shadow to remain visible in layered rendering',
      );
      assert.equal(
        layeredContext.getImageData(33, 30, 1, 1).data[0],
        0,
        'expected base Noise not to alter the layered shadow color',
      );
    });
  },

  () => {
    test('Flicker replaces a previous blur layer during a transparent off interval', () => {
      const blur = new GaussianBlurEffect(
        new Map([
          ['blurRadius', staticProperty('number', 8)],
          ['showOriginal', staticProperty('string', 'none')],
        ]),
      );
      const renderStack = (flicker, frameIndex = 5) => {
        const canvas = new Canvas(32, 32);
        const context = canvas.getContext('2d');
        context.fillStyle = 'red';
        context.fillRect(0, 0, 4, 4);
        renderEffectStack(
          context,
          ctx({ frameIndex, deltaSeconds: 1 / 60 }),
          [blur, flicker],
          (output) => {
            output.fillStyle = 'white';
            output.fillRect(8, 8, 16, 16);
          },
          renderWrappedEffect,
        );
        return {
          center: context.getImageData(16, 16, 1, 1).data,
          previous: context.getImageData(1, 1, 1, 1).data,
        };
      };

      const flicker = new FlickerEffect(
        new Map([
          ['flicker', staticProperty('number', 1)],
          ['offPaint', staticProperty('paint', solidPaint('rgba(0, 0, 0, 0)'))],
          ['updateMode', staticProperty('string', 'randomFrames')],
          ['maxOffDuration', staticProperty('number', 0.05)],
        ]),
      );

      const persistentFlicker = new FlickerEffect(
        new Map([
          ['flicker', staticProperty('number', 1)],
          ['offPaint', staticProperty('paint', solidPaint('rgba(0, 0, 0, 0)'))],
          ['updateMode', staticProperty('string', 'randomFrames')],
          ['maxOffDuration', staticProperty('number', 0.05)],
          ['showOriginal', staticProperty('string', 'front')],
          ['showOriginalDuringOff', staticProperty('boolean', false)],
        ]),
      );
      const onlyDuringOffFlicker = new FlickerEffect(
        new Map([
          ['flicker', staticProperty('number', 1)],
          ['offPaint', staticProperty('paint', solidPaint('rgba(0, 0, 0, 0)'))],
          ['updateMode', staticProperty('string', 'randomFrames')],
          ['maxOffDuration', staticProperty('number', 0.05)],
          ['showOriginal', staticProperty('string', 'front')],
          ['showOriginalDuringOff', staticProperty('boolean', true)],
        ]),
      );

      const persistentBaseFlicker = new FlickerEffect(
        new Map([
          ['flicker', staticProperty('number', 1)],
          ['appliesOn', staticProperty('string', 'base')],
          ['offPaint', staticProperty('paint', solidPaint('rgba(0, 0, 0, 0)'))],
          ['updateMode', staticProperty('string', 'randomFrames')],
          ['maxOffDuration', staticProperty('number', 0.05)],
          ['showOriginal', staticProperty('string', 'front')],
          ['showOriginalDuringOff', staticProperty('boolean', false)],
        ]),
      );

      assert.equal(renderStack(flicker).center[3], 0);
      assert.equal(renderStack(flicker).previous[0], 255);
      assert.equal(renderStack(persistentFlicker).center[3], 255);
      assert.ok(renderStack(onlyDuringOffFlicker, 4).center[3] < 255);
      assert.equal(renderStack(persistentBaseFlicker).center[3], 255);
    });
  },

  () => {
    test('renderScene: direct-effect Replicator preserves or recolors the complete source layer', () => {
      const renderReplicator = (fillTarget) => {
        const word = new Word(`word:direct-replicator-${fillTarget}`);
        word.box = { x: 80, y: 40, width: 60, height: 40 };
        word.addComponent(
          new BackgroundStyle(
            new Map([
              ['enabled', staticProperty('boolean', true)],
              ['fill', staticProperty('paint', solidPaint('white'))],
            ]),
          ),
        );
        word.addEffect(
          new StrokeEffect(
            new Map([
              ['enabled', staticProperty('boolean', true)],
              ['color', staticProperty('paint', solidPaint('black'))],
              ['width', staticProperty('number', 8)],
            ]),
          ),
        );
        word.addEffect(
          new ShadowEffect(
            new Map([
              ['enabled', staticProperty('boolean', true)],
              ['blurRadius', staticProperty('number', 0)],
              ['offset', staticProperty('vector2', { x: 6, y: 4 })],
              ['color', staticProperty('paint', solidPaint('black'))],
            ]),
          ),
        );
        word.addEffect(
          new ReplicatorEffect(
            new Map([
              ['enabled', staticProperty('boolean', true)],
              ['appliesOn', staticProperty('string', 'previousEffect')],
              ['showOriginal', staticProperty('string', 'none')],
              ['cloneCount', staticProperty('number', 1)],
              ['position', staticProperty('vector2', { x: 70, y: 0 })],
              ['fillMode', staticProperty('string', 'custom')],
              ['fillTarget', staticProperty('string', fillTarget)],
              ['customFills', staticProperty('array', [solidPaint('#ff0000')])],
            ]),
          ),
        );

        const canvas = new Canvas(240, 120);
        renderScene(word, canvas.getContext('2d'), ctx());
        return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      };
      const countPixels = (data, predicate) => {
        let count = 0;
        for (let y = 20; y < 100; y += 1) {
          for (let x = 155; x < 220; x += 1) {
            const offset = (y * 240 + x) * 4;
            if (data[offset + 3] > 180 && predicate(data[offset], data[offset + 1], data[offset + 2])) count += 1;
          }
        }
        return count;
      };

      const baseData = renderReplicator('base');
      assert.ok(
        countPixels(baseData, (red, green, blue) => red > 220 && green < 60 && blue < 60) > 0,
        'Base Content mode should recolor the direct-effect clone content',
      );
      assert.ok(
        countPixels(baseData, (red, green, blue) => red < 30 && green < 30 && blue < 30) > 0,
        'Base Content mode should preserve direct stroke and shadow pixels',
      );

      const fullLayerData = renderReplicator('fullLayer');
      assert.ok(
        countPixels(fullLayerData, (red, green, blue) => red > 220 && green < 60 && blue < 60) > 0,
        'Full Layer mode should recolor the complete direct-effect clone',
      );
      assert.equal(
        countPixels(fullLayerData, (red, green, blue) => red < 30 && green < 30 && blue < 30),
        0,
        'Full Layer mode should not leave black direct-effect pixels',
      );
    });
  },

  () => {
    test('renderScene: component Replicator copies the complete preceding text effect layer', () => {
      const word = new Word('word:component-replicator');
      word.box = { x: 80, y: 40, width: 60, height: 40 };
      word.text = 'A';
      word.addComponent(
        new Font(
          new Map([
            ['family', staticProperty('fontFamily', ['Arimo', 'sans-serif'])],
            ['size', staticProperty('number', 48)],
            ['weight', staticProperty('string', 'bold')],
          ]),
        ),
      );
      const text = new Text(new Map([['color', staticProperty('paint', solidPaint('white'))]]));
      text.addEffect(
        new StrokeEffect(
          new Map([
            ['enabled', staticProperty('boolean', true)],
            ['color', staticProperty('paint', solidPaint('black'))],
            ['width', staticProperty('number', 8)],
          ]),
        ),
      );
      text.addEffect(
        new ShadowEffect(
          new Map([
            ['enabled', staticProperty('boolean', true)],
            ['blurRadius', staticProperty('number', 0)],
            ['offset', staticProperty('vector2', { x: 6, y: 4 })],
            ['color', staticProperty('paint', solidPaint('black'))],
          ]),
        ),
      );
      text.addEffect(
        new ReplicatorEffect(
          new Map([
            ['enabled', staticProperty('boolean', true)],
            ['appliesOn', staticProperty('string', 'previousEffect')],
            ['showOriginal', staticProperty('string', 'none')],
            ['cloneCount', staticProperty('number', 1)],
            ['position', staticProperty('vector2', { x: 70, y: 0 })],
            ['fillMode', staticProperty('string', 'custom')],
            ['fillTarget', staticProperty('string', 'base')],
            ['customFills', staticProperty('array', [solidPaint('#ff0000')])],
          ]),
        ),
      );
      word.addComponent(text);

      const canvas = new Canvas(240, 120);
      renderScene(word, canvas.getContext('2d'), ctx());
      const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      let clonePixels = 0;
      for (let y = 20; y < 100; y += 1) {
        for (let x = 155; x < 220; x += 1) {
          const offset = (y * canvas.width + x) * 4;
          if (data[offset + 3] > 180 && data[offset] < 30 && data[offset + 1] < 30 && data[offset + 2] < 30) {
            clonePixels += 1;
          }
        }
      }
      assert.ok(clonePixels > 0, 'component Replicator should preserve the preceding text stroke and shadow');
    });
  },

  () => {
    test('renderScene: BackgroundEntity blend layers stay behind Word text', () => {
      const word = new Word('word:background-blend-order');
      word.box = { x: 80, y: 40, width: 120, height: 60 };
      word.text = 'A';
      word.addComponent(
        new Font(
          new Map([
            ['family', staticProperty('fontFamily', ['Arimo', 'sans-serif'])],
            ['size', staticProperty('number', 48)],
            ['weight', staticProperty('string', 'bold')],
          ]),
        ),
      );
      const text = new Text(new Map([['color', staticProperty('paint', solidPaint('blue'))]]));
      text.addEffect(
        new BlendModeEffect(
          new Map([
            ['appliesOn', staticProperty('string', 'base')],
            ['blendMode', staticProperty('string', 'screen')],
          ]),
        ),
      );
      word.addComponent(text);

      const background = new BackgroundEntity('background:blend-order', word.id);
      background.box = { x: 80, y: 40, width: 120, height: 60 };
      background.getComponent('backgroundStyle')?.props.set('fill', staticProperty('paint', solidPaint('yellow')));
      background.addEffect(
        new BlendModeEffect(
          new Map([
            ['appliesOn', staticProperty('string', 'base')],
            ['blendMode', staticProperty('string', 'multiply')],
          ]),
        ),
      );
      word.addChild(background);

      const canvas = new Canvas(300, 160);
      const layers = [];
      renderScene(
        word,
        canvas.getContext('2d'),
        ctx({
          blendModeLayerCollector: (mode, layer) => {
            layers.push({
              mode,
              buffer: layer.toBufferSync('raw', { colorType: 'rgba' }),
              width: layer.width,
              height: layer.height,
            });
          },
        }),
      );

      assert.deepEqual(
        layers.map((layer) => layer.mode),
        ['multiply', 'screen'],
        'background layers must be collected before text layers',
      );

      const video = Buffer.alloc(300 * 160 * 4);
      for (let index = 0; index < video.length; index += 4) {
        video[index] = 255;
        video[index + 3] = 255;
      }
      for (const layer of layers) {
        blendOverlayWithModeInPlace(video, 300, 160, layer.buffer, layer.width, layer.height, 0, 0, layer.mode);
      }

      let textPixel;
      for (let index = 3; index < layers[1].buffer.length; index += 4) {
        if (layers[1].buffer[index] >= 240) {
          textPixel = Math.floor(index / 4);
          break;
        }
      }
      assert.notEqual(textPixel, undefined, 'text layer must contain an opaque pixel');
      const pixelOffset = textPixel * 4;
      assert.equal(video[pixelOffset], 255);
      assert.equal(video[pixelOffset + 1], 0);
      assert.equal(video[pixelOffset + 2], 255);
    });
  },

  () => {
    test('BackgroundStyle: a separate borderRadius component clips the fill to transparent', () => {
      const size = 60;
      const makeCanvas = () => {
        const canvas = new Canvas(size, size);
        return { canvas, ctx: canvas.getContext('2d') };
      };
      const cornerOpaque = (word) => {
        const { canvas, ctx: c2d } = makeCanvas();
        renderScene(word, c2d, ctx());
        // Alpha at the very top-left corner pixel: 0 when rounded away.
        return c2d.getImageData(1, 1, 1, 1).data[3];
      };
      const fill = () => new Map([['fill', staticProperty('paint', solidPaint('rgb(0,0,0)'))]]);
      const square = new Word('w-square');
      square.box = { x: 0, y: 0, width: size, height: size };
      square.addComponent(new BackgroundStyle(fill()));

      const rounded = new Word('w-rounded');
      rounded.box = { x: 0, y: 0, width: size, height: size };
      rounded.addComponent(new BackgroundStyle(fill()));
      rounded.addComponent(
        new BorderRadius(
          new Map([
            ['borderRadius', staticProperty('number', 24)],
            ['borderTopLeftRadius', staticProperty('number', 24)],
            ['borderTopRightRadius', staticProperty('number', 24)],
            ['borderBottomRightRadius', staticProperty('number', 24)],
            ['borderBottomLeftRadius', staticProperty('number', 24)],
          ]),
        ),
      );
      const disabled = new Word('w-disabled');
      disabled.box = { x: 0, y: 0, width: size, height: size };
      disabled.addComponent(new BackgroundStyle(fill()));
      disabled.addComponent(
        new BorderRadius(
          new Map([
            ['enabled', staticProperty('boolean', false)],
            ['borderRadius', staticProperty('number', 24)],
            ['borderTopLeftRadius', staticProperty('number', 24)],
            ['borderTopRightRadius', staticProperty('number', 24)],
            ['borderBottomRightRadius', staticProperty('number', 24)],
            ['borderBottomLeftRadius', staticProperty('number', 24)],
          ]),
        ),
      );
      assert.equal(cornerOpaque(square), 255, 'no radius keeps the corner opaque');
      assert.equal(cornerOpaque(rounded), 0, 'a radius clips the corner to transparent');
      assert.equal(cornerOpaque(disabled), 255, 'disabled radius leaves the corner opaque');
    });
  },

  () => {
    test('render: clipped VideoArea honors its BorderRadius for nested video content', () => {
      const size = 60;
      const area = new VideoArea('videoArea');
      area.box = { x: 0, y: 0, width: size, height: size };
      area.addComponent(new Layout(new Map([['clipContent', staticProperty('boolean', true)]])));
      area.addComponent(
        new BorderRadius(
          new Map([
            ['borderRadius', staticProperty('number', 24)],
            ['borderTopLeftRadius', staticProperty('number', 24)],
            ['borderTopRightRadius', staticProperty('number', 24)],
            ['borderBottomRightRadius', staticProperty('number', 24)],
            ['borderBottomLeftRadius', staticProperty('number', 24)],
          ]),
        ),
      );
      const video = new Video('video');
      video.box = { x: 0, y: 0, width: size, height: size };
      video.addComponent(new BackgroundStyle(new Map([['fill', staticProperty('paint', solidPaint('rgb(255,0,0)'))]])));
      area.addChild(video);

      const canvas = new Canvas(size, size);
      const context = canvas.getContext('2d');
      renderScene(area, context, ctx());

      assert.equal(context.getImageData(1, 1, 1, 1).data[3], 0);
      assert.ok(context.getImageData(size / 2, size / 2, 1, 1).data[3] > 0);
    });
  },

  () => {
    test('BorderRadius: explicit uniform mode ignores per-corner values', () => {
      const borderRadius = new BorderRadius(
        new Map([
          ['borderRadiusMode', staticProperty('string', 'uniform')],
          ['borderRadius', staticProperty('number', 30)],
          ['borderTopLeftRadius', staticProperty('number', 90)],
          ['borderTopRightRadius', staticProperty('number', 0)],
          ['borderBottomRightRadius', staticProperty('number', 5)],
          ['borderBottomLeftRadius', staticProperty('number', 60)],
        ]),
      );
      const geometry = borderRadius.cornerGeometry(ctx({}));
      assert.deepEqual(geometry.radii, {
        topLeft: 30,
        topRight: 30,
        bottomRight: 30,
        bottomLeft: 30,
      });
    });
  },

  () => {
    test('ShadowEffect.getMargins = blurRadius + |offset|', () => {
      const shadow = new ShadowEffect(
        new Map([
          ['blurRadius', staticProperty('number', 10)],
          ['offset', staticProperty('vector2', { x: 4, y: 8 })],
        ]),
      );
      assert.deepEqual(shadow.getMargins(ctx({})), { x: 14, y: 18 });
    });
  },

  () => {
    test('ShadowEffect.getMargins is zero for invisible shadows', () => {
      const hiddenByOpacity = new ShadowEffect(
        new Map([
          ['opacity', staticProperty('number', 0)],
          ['blurRadius', staticProperty('number', 20)],
          ['offset', staticProperty('vector2', { x: 6, y: 4 })],
        ]),
      );
      assert.deepEqual(hiddenByOpacity.getMargins(ctx({})), { x: 0, y: 0 });

      const zeroSpread = new ShadowEffect(
        new Map([
          ['opacity', staticProperty('number', 1)],
          ['blurRadius', staticProperty('number', 0)],
          ['offset', staticProperty('vector2', { x: 0, y: 0 })],
        ]),
      );
      assert.deepEqual(zeroSpread.getMargins(ctx({})), { x: 0, y: 0 });
    });
  },

  () => {
    test('ShadowEffect longShadow fills the extrusion to the offset shadow', () => {
      const path = buildRoundedUnionPath(
        [{ left: 20, top: 20, right: 30, bottom: 30 }],
        {
          radii: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
          squircle: { topLeft: false, topRight: false, bottomRight: false, bottomLeft: false },
        },
        0,
      );
      const render = (longShadow) => {
        const canvas = new Canvas(60, 60);
        const context = canvas.getContext('2d');
        const shadow = new ShadowEffect(
          new Map([
            ['enabled', staticProperty('boolean', true)],
            ['blurRadius', staticProperty('number', 0)],
            ['offset', staticProperty('vector2', { x: 10, y: 10 })],
            ['opacity', staticProperty('number', 1)],
            ['longShadow', staticProperty('boolean', longShadow)],
          ]),
        );
        shadow.castOnPath(context, path, ctx({}));
        return context.getImageData(0, 0, canvas.width, canvas.height).data;
      };
      const alphaAt = (data, x, y) => data[(y * 60 + x) * 4 + 3];

      assert.equal(alphaAt(render(false), 34, 25), 0);
      assert.ok(alphaAt(render(true), 34, 25) > 0);
    });
  },

  () => {
    test('ShadowEffect uses the default blur and offset values when defaults are restored', () => {
      const shadow = new ShadowEffect();
      ensureEffectDefaults(shadow);

      assert.equal(shadow.getProp('blurRadius').base, 8);
      assert.deepEqual(shadow.getProp('offset').base, { x: 2, y: 4 });
      assert.equal(shadow.getProp('longShadow').base, false);
    });
  },

  () => {
    test('StreakEffect renders only the configured direction', () => {
      const streak = new StreakEffect(
        new Map([
          ['distance', staticProperty('number', 8)],
          ['angle', staticProperty('number', 0)],
          ['steps', staticProperty('number', 2)],
          ['maxOpacity', staticProperty('number', 1)],
        ]),
      );
      assert.deepEqual(streak.getMargins(ctx({})), { x: 16, y: 0 });

      const canvas = new Canvas(48, 48);
      const context = canvas.getContext('2d');
      streak.apply(context, ctx({}), () => context.fillRect(20, 20, 2, 2));
      assert.ok(context.getImageData(28, 20, 1, 1).data[3] > 0);
      assert.equal(context.getImageData(12, 20, 1, 1).data[3], 0);
    });
  },

  () => {
    test('Border effect paints around a background box on any entity', () => {
      const word = new Word('w');
      word.box = { x: 0, y: 0, width: 40, height: 24 };
      const background = word.addComponent(
        new BackgroundStyle(
          new Map([
            ['enabled', staticProperty('boolean', true)],
            ['fill', staticProperty('paint', solidPaint('rgba(0,0,0,0)'))],
          ]),
        ),
      );
      background.addEffect(
        new BorderEffect(
          new Map([
            ['enabled', staticProperty('boolean', true)],
            ['width', staticProperty('number', 4)],
            ['color', staticProperty('paint', solidPaint('rgb(255, 255, 255)'))],
            ['position', staticProperty('string', 'center')],
          ]),
        ),
      );

      const canvas = new Canvas(48, 32);
      const c2d = canvas.getContext('2d');
      renderScene(word, c2d, ctx({}));

      const edgeAlpha = c2d.getImageData(1, 12, 1, 1).data[3];
      const centerAlpha = c2d.getImageData(20, 12, 1, 1).data[3];
      assert.ok(edgeAlpha > 0, 'expected a visible border at the entity edge');
      assert.equal(centerAlpha, 0, 'transparent fill + border should not fill the entity interior');
    });
  },

  () => {
    test('Border effect honors a positioned video box', () => {
      const video = new Video('video');
      video.box = { x: 0, y: 0, width: 32, height: 24 };
      video.addComponent(new Transform(new Map([['position', staticProperty('vector2', { x: 8, y: 0 })]])));
      video.addEffect(
        new BorderEffect(
          new Map([
            ['enabled', staticProperty('boolean', true)],
            ['width', staticProperty('number', 4)],
            ['color', staticProperty('paint', solidPaint('rgb(255, 255, 255)'))],
          ]),
        ),
      );

      const canvas = new Canvas(48, 32);
      const c2d = canvas.getContext('2d');
      video.effects[0].strokeBox(c2d, { x: 8, y: 0, width: 32, height: 24 }, undefined, ctx({}));

      assert.equal(c2d.getImageData(1, 12, 1, 1).data[3], 0, 'border should follow the video position');
      assert.ok(c2d.getImageData(41, 12, 1, 1).data[3] > 0, 'expected a visible border at the positioned video edge');
    });
  },

  () => {
    test('WipeRevealEffect masks an entity surface in local coordinates', () => {
      const word = new Word('word:wipe');
      word.box = { x: 0, y: 0, width: 100, height: 40 };
      word.addComponent(
        new BackgroundStyle(
          new Map([
            ['enabled', staticProperty('boolean', true)],
            ['fill', staticProperty('paint', solidPaint('white'))],
          ]),
        ),
      );
      word.addEffect(
        new WipeRevealEffect(
          new Map([
            ['reveal', staticProperty('number', 0.5)],
            ['direction', staticProperty('string', 'leftToRight')],
            ['fromStyle', staticProperty('string', 'none')],
            ['basePlacement', staticProperty('string', 'none')],
          ]),
        ),
      );

      const canvas = new Canvas(100, 40);
      renderScene(word, canvas.getContext('2d'), ctx());
      const { data } = canvas.getContext('2d').getImageData(0, 20, 100, 1);

      assert.ok(data[10 * 4 + 3] > 200);
      assert.equal(data[90 * 4 + 3], 0);
    });
  },

  () => {
    test('WipeReveal keeps direction-aware mask geometry stable within a moving row', () => {
      const row = new Row('row:wipe-line');
      row.box = { x: 20, y: 20, width: 260, height: 47 };
      const word = new Word('word:wipe-line', 'on');
      word.box = { x: 100, y: 26, width: 80, height: 35 };
      word.addComponent(
        new BackgroundStyle(
          new Map([
            ['enabled', staticProperty('boolean', true)],
            ['fill', staticProperty('paint', solidPaint('white'))],
          ]),
        ),
      );
      const wipe = word.addEffect(
        new WipeRevealEffect(
          new Map([
            ['reveal', staticProperty('number', 0.25)],
            ['direction', staticProperty('string', 'leftToRight')],
            ['shape', staticProperty('string', 'rectangle')],
            ['fromStyle', staticProperty('string', 'none')],
            ['basePlacement', staticProperty('string', 'none')],
          ]),
        ),
      );
      row.addChild(word);

      const originalApply = WipeRevealEffect.prototype.apply;
      const capturedBounds = [];
      try {
        WipeRevealEffect.prototype.apply = function captureBounds(context, resolveContext, draw, options) {
          if (options?.paintBounds) capturedBounds.push({ ...options.paintBounds });
          return originalApply.call(this, context, resolveContext, draw, options);
        };

        for (const [direction, textDirection] of [
          ['leftToRight', 'ltr'],
          ['rightToLeft', 'ltr'],
          ['logicalStartToEnd', 'ltr'],
          ['logicalEndToStart', 'ltr'],
          ['logicalStartToEnd', 'rtl'],
          ['logicalEndToStart', 'rtl'],
        ]) {
          wipe.getProp('direction').setBase(direction);
          wipe.getProp('reveal').setBase(0.25);
          renderScene(row, new Canvas(300, 160).getContext('2d'), ctx({ textDirection }));
          wipe.getProp('reveal').setBase(0.75);
          renderScene(row, new Canvas(300, 160).getContext('2d'), ctx({ textDirection }));
        }

        for (const direction of ['topToBottom', 'bottomToTop']) {
          wipe.getProp('direction').setBase(direction);
          wipe.getProp('reveal').setBase(0.25);
          renderScene(row, new Canvas(300, 160).getContext('2d'), ctx());
          wipe.getProp('reveal').setBase(0.75);
          renderScene(row, new Canvas(300, 160).getContext('2d'), ctx());
        }

        wipe.getProp('shape').setBase('diagonal');
        for (const direction of ['leftToRight', 'topToBottom']) {
          wipe.getProp('direction').setBase(direction);
          wipe.getProp('reveal').setBase(0.25);
          renderScene(row, new Canvas(300, 160).getContext('2d'), ctx());
          wipe.getProp('reveal').setBase(0.75);
          renderScene(row, new Canvas(300, 160).getContext('2d'), ctx());
        }

        row.box = { ...row.box, y: 80 };
        word.box = { ...word.box, y: 86 };
        wipe.getProp('shape').setBase('rectangle');
        wipe.getProp('direction').setBase('leftToRight');
        renderScene(row, new Canvas(300, 220).getContext('2d'), ctx());

        wipe.getProp('direction').setBase('topToBottom');
        renderScene(row, new Canvas(300, 220).getContext('2d'), ctx());
      } finally {
        WipeRevealEffect.prototype.apply = originalApply;
      }

      assert.equal(capturedBounds.length, 22);
      for (const bounds of capturedBounds.slice(0, 12)) {
        assert.equal(bounds.width, 80);
        assert.equal(bounds.height, 47);
      }
      for (const bounds of capturedBounds.slice(12, 16)) {
        assert.equal(bounds.width, 260);
        assert.equal(bounds.height, 35);
      }
      for (const bounds of capturedBounds.slice(16, 18)) {
        assert.equal(bounds.width, 80);
        assert.equal(bounds.height, 47);
      }
      for (const bounds of capturedBounds.slice(18, 20)) {
        assert.equal(bounds.width, 260);
        assert.equal(bounds.height, 35);
      }
      assert.equal(capturedBounds[20].y, 80);
      assert.equal(capturedBounds[20].height, 47);
      assert.equal(capturedBounds[21].x, 10);
      assert.equal(capturedBounds[21].width, 260);
    });
  },

  () => {
    test('WipeReveal tracks resolved position bounds for every supported entity and direction', () => {
      const cases = [
        { Entity: Page, id: 'page:wipe-bounds' },
        { Entity: Row, id: 'row:wipe-bounds' },
        { Entity: Word, id: 'word:wipe-bounds' },
      ];
      const directions = [
        { direction: 'leftToRight', shape: 'rectangle', width: 80, height: 56 },
        { direction: 'rightToLeft', shape: 'rectangle', width: 80, height: 56 },
        { direction: 'logicalStartToEnd', shape: 'rectangle', width: 80, height: 56 },
        { direction: 'logicalEndToStart', shape: 'rectangle', width: 80, height: 56 },
        { direction: 'topToBottom', shape: 'rectangle', width: 104, height: 40 },
        { direction: 'bottomToTop', shape: 'rectangle', width: 104, height: 40 },
        { direction: 'leftToRight', shape: 'diagonal', width: 104, height: 56 },
        { direction: 'rightToLeft', shape: 'diagonal', width: 104, height: 56 },
        { direction: 'logicalStartToEnd', shape: 'diagonal', width: 104, height: 56 },
        { direction: 'logicalEndToStart', shape: 'diagonal', width: 104, height: 56 },
        { direction: 'topToBottom', shape: 'diagonal', width: 104, height: 56 },
        { direction: 'bottomToTop', shape: 'diagonal', width: 104, height: 56 },
      ];

      for (const { Entity, id } of cases) {
        for (const { direction, shape, width: expectedWidth, height: expectedHeight } of directions) {
          const entity = new Entity(id);
          entity.box = { x: 100, y: 100, width: 80, height: 40 };
          entity.layoutPosition = { x: 0, y: 0 };
          entity.addComponent(new Transform(new Map([['position', staticProperty('vector2', { x: 12, y: -8 })]])));
          entity.addComponent(
            new BackgroundStyle(
              new Map([
                ['enabled', staticProperty('boolean', true)],
                ['fill', staticProperty('paint', solidPaint('white'))],
              ]),
            ),
          );
          entity.addEffect(
            new WipeRevealEffect(
              new Map([
                ['reveal', staticProperty('number', 0.5)],
                ['direction', staticProperty('string', direction)],
                ['shape', staticProperty('string', shape)],
                ['fromStyle', staticProperty('string', 'none')],
                ['basePlacement', staticProperty('string', 'none')],
              ]),
            ),
          );

          const originalApply = WipeRevealEffect.prototype.apply;
          let capturedBounds;
          try {
            WipeRevealEffect.prototype.apply = function captureEntityBounds(context, resolveContext, draw, options) {
              capturedBounds = options?.paintBounds ? { ...options.paintBounds } : undefined;
              return originalApply.call(this, context, resolveContext, draw, options);
            };
            renderScene(entity, new Canvas(300, 300).getContext('2d'), ctx());
          } finally {
            WipeRevealEffect.prototype.apply = originalApply;
          }

          assert.equal(capturedBounds?.width, expectedWidth, `${Entity.name} ${direction} width`);
          assert.equal(capturedBounds?.height, expectedHeight, `${Entity.name} ${direction} height`);
        }
      }
    });
  },

  () => {
    test('WipeReveal rectangle masks fractional top-edge pixels without source bleed', () => {
      const word = new Word('word:wipe-fractional-edge', 'serial');
      word.box = { x: 0, y: 30.5, width: 220, height: 47 };
      word.addComponent(
        new Font(
          new Map([
            ['family', staticProperty('fontFamily', ['Arimo'])],
            ['size', staticProperty('number', 64)],
            ['weight', staticProperty('string', 'bold')],
          ]),
        ),
      );
      word.addComponent(new Text(new Map([['color', staticProperty('paint', solidPaint('blue'))]])));

      const source = new Word('word:wipe-fractional-source', 'serial');
      source.addComponent(new Text(new Map([['color', staticProperty('paint', solidPaint('red'))]])));
      word.styleSources = { next: source, current: word };
      word.addEffect(
        new WipeRevealEffect(
          new Map([
            ['reveal', staticProperty('number', 1)],
            ['direction', staticProperty('string', 'leftToRight')],
            ['shape', staticProperty('string', 'rectangle')],
            ['fromStyle', staticProperty('string', 'next')],
            ['toStyle', staticProperty('string', 'current')],
            ['basePlacement', staticProperty('string', 'back')],
          ]),
        ),
      );

      const canvas = new Canvas(220, 100);
      const context = canvas.getContext('2d');
      renderScene(word, context, ctx());
      const { data } = context.getImageData(0, 0, 220, 100);
      let topEdgePixels = 0;
      let sourceBleedPixels = 0;
      for (let x = 0; x < 220; x += 1) {
        const offset = (30 * 220 + x) * 4;
        if (data[offset + 3] <= 20) continue;
        topEdgePixels += 1;
        if (data[offset] > 20) sourceBleedPixels += 1;
      }

      assert.ok(topEdgePixels > 0, 'the glyph top edge should remain visible');
      assert.equal(sourceBleedPixels, 0, 'the source style must not bleed through the fractional top edge');
    });
  },

  () => {
    test('WipeReveal masks Glow effects attached to a Text component', () => {
      const word = new Word('word:wipe-text-glow', 'Glow');
      word.box = { x: 20, y: 20, width: 120, height: 40 };
      const text = word.addComponent(new Text(new Map([['color', staticProperty('paint', solidPaint('white'))]])));
      text.components.push(new Font(new Map([['size', staticProperty('number', 32)]])));
      text.addEffect(
        new GlowEffect(
          new Map([
            ['color', staticProperty('paint', solidPaint('red'))],
            ['blurRadius', staticProperty('number', 10)],
            ['strength', staticProperty('number', 1)],
          ]),
        ),
      );
      const wipe = text.addEffect(
        new WipeRevealEffect(
          new Map([
            ['reveal', staticProperty('number', 0)],
            ['direction', staticProperty('string', 'leftToRight')],
            ['shape', staticProperty('string', 'rectangle')],
            ['feather', staticProperty('number', 0)],
          ]),
        ),
      );

      const alphaCountAt = (reveal) => {
        wipe.getProp('reveal').setBase(reveal);
        const canvas = new Canvas(160, 100);
        renderScene(word, canvas.getContext('2d'), ctx());
        const pixels = canvas.getContext('2d').getImageData(0, 0, 160, 100).data;
        let count = 0;
        for (let index = 3; index < pixels.length; index += 4) {
          if (pixels[index] > 0) count += 1;
        }
        return count;
      };

      assert.equal(alphaCountAt(0), 0, 'the unrevealed Text layer must include neither glyphs nor glow');
      assert.ok(alphaCountAt(0.5) > 0, 'the partial reveal must show the Text layer');
      assert.ok(alphaCountAt(1) > alphaCountAt(0.5), 'the full reveal must show more of the Text layer');
    });
  },

  () => {
    test('Text effects can render from an opaque source over a transparent base', () => {
      const renderText = (effectsInheritBaseAlpha) => {
        const word = new Word(`word:transparent-effects-${effectsInheritBaseAlpha}`, 'Glow');
        word.box = { x: 20, y: 20, width: 120, height: 40 };
        const textProps = [['color', staticProperty('paint', solidPaint('rgba(255, 255, 255, 0)'))]];
        if (effectsInheritBaseAlpha !== undefined) {
          textProps.push(['effectsInheritBaseAlpha', staticProperty('boolean', effectsInheritBaseAlpha)]);
        }
        const text = word.addComponent(new Text(new Map(textProps)));
        text.components.push(new Font(new Map([['size', staticProperty('number', 32)]])));
        text.addEffect(
          new GlowEffect(
            new Map([
              ['color', staticProperty('paint', solidPaint('red'))],
              ['blurRadius', staticProperty('number', 8)],
              ['strength', staticProperty('number', 1)],
            ]),
          ),
        );
        text.addEffect(
          new ShadowEffect(
            new Map([
              ['color', staticProperty('paint', solidPaint('blue'))],
              ['blurRadius', staticProperty('number', 4)],
              ['offset', staticProperty('vector2', { x: 3, y: 3 })],
              ['opacity', staticProperty('number', 1)],
            ]),
          ),
        );
        text.addEffect(
          new StrokeEffect(
            new Map([
              ['color', staticProperty('paint', solidPaint('green'))],
              ['width', staticProperty('number', 4)],
              ['opacity', staticProperty('number', 1)],
            ]),
          ),
        );
        const canvas = new Canvas(160, 100);
        renderScene(word, canvas.getContext('2d'), ctx());
        return canvas.getContext('2d').getImageData(0, 0, 160, 100).data;
      };

      const inheritedPixels = renderText(true);
      const independentPixels = renderText(false);
      const missingOptionPixels = renderText();
      const alphaCount = (pixels) => {
        let count = 0;
        for (let index = 3; index < pixels.length; index += 4) {
          if (pixels[index] > 0) count += 1;
        }
        return count;
      };

      assert.equal(alphaCount(inheritedPixels), 0, 'inherited effects must follow the transparent Text base');
      assert.ok(alphaCount(independentPixels) > 0, 'independent effects must render over the transparent Text base');
      assert.equal(alphaCount(missingOptionPixels), 0, 'a missing option must default to inherited effects');
    });
  },

  () => {
    test('Layered Text Glow uses an opaque source when base alpha inheritance is disabled', () => {
      const renderText = (effectsInheritBaseAlpha) => {
        const word = new Word(`word:transparent-glow-${effectsInheritBaseAlpha}`, 'Glow');
        word.box = { x: 20, y: 20, width: 120, height: 40 };
        const text = word.addComponent(
          new Text(
            new Map([
              ['color', staticProperty('paint', solidPaint('rgba(255, 255, 255, 0)'))],
              ['effectsInheritBaseAlpha', staticProperty('boolean', effectsInheritBaseAlpha)],
            ]),
          ),
        );
        text.components.push(new Font(new Map([['size', staticProperty('number', 32)]])));
        text.addEffect(
          new GlowEffect(
            new Map([
              ['color', staticProperty('paint', solidPaint('red'))],
              ['blurRadius', staticProperty('number', 8)],
              ['strength', staticProperty('number', 1)],
            ]),
          ),
        );
        const canvas = new Canvas(160, 100);
        renderScene(word, canvas.getContext('2d'), ctx());
        return canvas.getContext('2d').getImageData(0, 0, 160, 100).data;
      };

      const inheritedPixels = renderText(true);
      const independentPixels = renderText(false);
      const alphaCount = (pixels) => {
        let count = 0;
        for (let index = 3; index < pixels.length; index += 4) {
          if (pixels[index] > 0) count += 1;
        }
        return count;
      };
      const nearWhiteCount = (pixels) => {
        let count = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          if (pixels[index + 3] > 0 && pixels[index] > 200 && pixels[index + 1] > 200 && pixels[index + 2] > 200)
            count += 1;
        }
        return count;
      };

      assert.equal(alphaCount(inheritedPixels), 0, 'inherited Glow must follow the transparent Text base');
      assert.ok(alphaCount(independentPixels) > 0, 'independent Glow must use the opaque effect source');
      assert.equal(nearWhiteCount(independentPixels), 0, 'independent Glow must not expose the opaque source fill');
    });
  },

  () => {
    test('Layered Text Wipe Reveal uses an opaque source when base alpha inheritance is disabled', () => {
      const renderText = (effectsInheritBaseAlpha) => {
        const word = new Word(`word:transparent-wipe-${effectsInheritBaseAlpha}`, 'Reveal');
        word.box = { x: 20, y: 20, width: 120, height: 40 };
        const text = word.addComponent(
          new Text(
            new Map([
              ['color', staticProperty('paint', solidPaint('rgba(255, 255, 255, 0)'))],
              ['effectsInheritBaseAlpha', staticProperty('boolean', effectsInheritBaseAlpha)],
            ]),
          ),
        );
        text.components.push(new Font(new Map([['size', staticProperty('number', 32)]])));
        text.addEffect(
          new WipeRevealEffect(
            new Map([
              ['reveal', staticProperty('number', 1)],
              ['direction', staticProperty('string', 'leftToRight')],
              ['shape', staticProperty('string', 'rectangle')],
              ['feather', staticProperty('number', 0)],
            ]),
          ),
        );
        const canvas = new Canvas(160, 100);
        renderScene(word, canvas.getContext('2d'), ctx());
        return canvas.getContext('2d').getImageData(0, 0, 160, 100).data;
      };
      const inheritedPixels = renderText(true);
      const independentPixels = renderText(false);
      const alphaCount = (pixels) => {
        let count = 0;
        for (let index = 3; index < pixels.length; index += 4) {
          if (pixels[index] > 0) count += 1;
        }
        return count;
      };

      assert.equal(alphaCount(inheritedPixels), 0, 'inherited Wipe Reveal must follow the transparent Text base');
      assert.ok(alphaCount(independentPixels) > 0, 'independent Wipe Reveal must use the opaque effect source');
    });
  },

  () => {
    test('BackgroundStyle effects can render from an opaque source over a transparent fill', () => {
      const renderBackground = (effectsInheritBaseAlpha) => {
        const word = new Word(`word:transparent-background-${effectsInheritBaseAlpha}`);
        word.box = { x: 20, y: 20, width: 120, height: 40 };
        const backgroundProps = [['fill', staticProperty('paint', solidPaint('rgba(255, 255, 255, 0)'))]];
        if (effectsInheritBaseAlpha !== undefined) {
          backgroundProps.push(['effectsInheritBaseAlpha', staticProperty('boolean', effectsInheritBaseAlpha)]);
        }
        const background = word.addComponent(new BackgroundStyle(new Map(backgroundProps)));
        background.addEffect(
          new GlowEffect(
            new Map([
              ['color', staticProperty('paint', solidPaint('red'))],
              ['blurRadius', staticProperty('number', 8)],
              ['strength', staticProperty('number', 1)],
            ]),
          ),
        );
        const canvas = new Canvas(160, 100);
        renderScene(word, canvas.getContext('2d'), ctx());
        return canvas.getContext('2d').getImageData(0, 0, 160, 100).data;
      };

      const inheritedPixels = renderBackground(true);
      const independentPixels = renderBackground(false);
      const missingOptionPixels = renderBackground();
      const alphaCount = (pixels) => {
        let count = 0;
        for (let index = 3; index < pixels.length; index += 4) {
          if (pixels[index] > 0) count += 1;
        }
        return count;
      };

      assert.equal(
        alphaCount(inheritedPixels),
        0,
        'inherited effects must follow the transparent BackgroundStyle fill',
      );
      assert.ok(
        alphaCount(independentPixels) > 0,
        'independent effects must render over the transparent BackgroundStyle fill',
      );
      assert.equal(alphaCount(missingOptionPixels), 0, 'a missing option must default to inherited effects');
    });
  },

  () => {
    test('WipeRevealEffect reveals the target style over its configured source style', () => {
      const word = new Word('word:wipe-style');
      word.box = { x: 0, y: 0, width: 100, height: 40 };
      const currentBackground = word.addComponent(
        new BackgroundStyle(
          new Map([
            ['enabled', staticProperty('boolean', true)],
            ['fill', staticProperty('paint', solidPaint('blue'))],
          ]),
        ),
      );
      const nextStyle = new Word('word:next-style');
      nextStyle.addComponent(
        new BackgroundStyle(
          new Map([
            ['enabled', staticProperty('boolean', true)],
            ['fill', staticProperty('paint', solidPaint('red'))],
          ]),
        ),
      );
      word.styleSources = { next: nextStyle, current: word };
      const wipe = word.addEffect(
        new WipeRevealEffect(
          new Map([
            ['reveal', staticProperty('number', 0)],
            ['direction', staticProperty('string', 'leftToRight')],
            ['fromStyle', staticProperty('string', 'next')],
            ['toStyle', staticProperty('string', 'current')],
            ['basePlacement', staticProperty('string', 'back')],
          ]),
        ),
      );

      const renderCenter = () => {
        const canvas = new Canvas(100, 40);
        renderScene(word, canvas.getContext('2d'), ctx());
        return canvas.getContext('2d').getImageData(50, 20, 1, 1).data;
      };

      wipe.getProp('reveal').setBase(0);
      const sourcePixel = renderCenter();
      wipe.getProp('reveal').setBase(1);
      const targetPixel = renderCenter();

      assert.ok(sourcePixel[0] > 200 && sourcePixel[2] < 40);
      assert.ok(targetPixel[2] > 200 && targetPixel[0] < 40);
      assert.equal(currentBackground.getProp('fill').base.type, 'solid');
    });
  },

  () => {
    test('WipeReveal materializes source effects without target effect placeholders', () => {
      const word = new Word('word:wipe-materialized-source');
      word.box = { x: 20, y: 10, width: 100, height: 40 };
      word.addComponent(
        new BackgroundStyle(
          new Map([
            ['enabled', staticProperty('boolean', true)],
            ['fill', staticProperty('paint', solidPaint('blue'))],
          ]),
        ),
      );

      const previousStyle = new Word('word:previous-style');
      previousStyle.addComponent(
        new BackgroundStyle(
          new Map([
            ['enabled', staticProperty('boolean', true)],
            ['fill', staticProperty('paint', solidPaint('red'))],
          ]),
        ),
      );
      previousStyle.addEffect(
        new GlowEffect(
          new Map([
            ['enabled', staticProperty('boolean', true)],
            ['color', staticProperty('paint', solidPaint('red'))],
            ['blurRadius', staticProperty('number', 10)],
            ['strength', staticProperty('number', 1)],
          ]),
        ),
      );

      word.styleSources = { current: word, previous: previousStyle };
      const wipe = word.addEffect(
        new WipeRevealEffect(
          new Map([
            ['reveal', staticProperty('number', 0)],
            ['direction', staticProperty('string', 'leftToRight')],
            ['fromStyle', staticProperty('string', 'previous')],
            ['toStyle', staticProperty('string', 'current')],
            ['basePlacement', staticProperty('string', 'back')],
          ]),
        ),
      );

      const renderOutsidePixel = () => {
        const canvas = new Canvas(160, 60);
        renderScene(word, canvas.getContext('2d'), ctx());
        return canvas.getContext('2d').getImageData(14, 30, 1, 1).data;
      };

      const sourcePixel = renderOutsidePixel();
      wipe.getProp('reveal').setBase(1);
      const targetPixel = renderOutsidePixel();

      assert.ok(sourcePixel[0] > 0 && sourcePixel[3] > 0, 'the source Glow must render without a target Glow slot');
      assert.equal(targetPixel[3], 0, 'the target style must not inherit the source-only Glow');
    });
  },

  () => {
    test('WipeReveal materializes effects nested on source components', () => {
      const word = new Word('word:wipe-materialized-component', 'Glow');
      word.box = { x: 20, y: 10, width: 100, height: 40 };
      const targetText = word.addComponent(
        new Text(new Map([['color', staticProperty('paint', solidPaint('white'))]])),
      );
      word.addComponent(new Font(new Map([['size', staticProperty('number', 32)]])));

      const previousStyle = new Word('word:previous-component-style');
      const previousText = previousStyle.addComponent(
        new Text(new Map([['color', staticProperty('paint', solidPaint('white'))]])),
      );
      previousStyle.addComponent(new Font(new Map([['size', staticProperty('number', 32)]])));
      previousText.addEffect(
        new GlowEffect(
          new Map([
            ['enabled', staticProperty('boolean', true)],
            ['color', staticProperty('paint', solidPaint('red'))],
            ['blurRadius', staticProperty('number', 10)],
            ['strength', staticProperty('number', 1)],
          ]),
        ),
      );

      word.styleSources = { current: word, previous: previousStyle };
      const wipe = word.addEffect(
        new WipeRevealEffect(
          new Map([
            ['reveal', staticProperty('number', 0)],
            ['direction', staticProperty('string', 'leftToRight')],
            ['fromStyle', staticProperty('string', 'previous')],
            ['toStyle', staticProperty('string', 'current')],
            ['basePlacement', staticProperty('string', 'back')],
          ]),
        ),
      );

      const renderPixels = () => {
        const canvas = new Canvas(160, 60);
        renderScene(word, canvas.getContext('2d'), ctx());
        return canvas.getContext('2d').getImageData(0, 0, 160, 60).data;
      };

      const sourcePixels = renderPixels();
      wipe.getProp('reveal').setBase(1);
      const targetPixels = renderPixels();
      const outsideColorCount = (pixels) => {
        let count = 0;
        for (let y = 0; y < 60; y += 1) {
          for (let x = 0; x < 160; x += 1) {
            if (x >= 20 && x < 120 && y >= 10 && y < 50) continue;
            const offset = (y * 160 + x) * 4;
            if (pixels[offset + 3] > 0 && pixels[offset] > pixels[offset + 1] * 1.25) count += 1;
          }
        }
        return count;
      };

      assert.ok(
        outsideColorCount(sourcePixels) > 0,
        'source component effects must render without target effect slots',
      );
      assert.equal(outsideColorCount(targetPixels), 0, 'the target style must not inherit source component effects');
      assert.equal(targetText.effects.length, 0);
    });
  },

  () => {
    test('WipeReveal applies the selected style opacity to each layer', () => {
      const word = new Word('word:wipe-opacity');
      word.box = { x: 0, y: 0, width: 100, height: 40 };
      word.addComponent(new Transform(new Map([['opacity', staticProperty('number', 0.8)]])));
      word.addComponent(
        new BackgroundStyle(
          new Map([
            ['enabled', staticProperty('boolean', true)],
            ['fill', staticProperty('paint', solidPaint('blue'))],
          ]),
        ),
      );
      const nextStyle = new Word('word:next-opacity');
      nextStyle.addComponent(new Transform(new Map([['opacity', staticProperty('number', 0.25)]])));
      nextStyle.addComponent(
        new BackgroundStyle(
          new Map([
            ['enabled', staticProperty('boolean', true)],
            ['fill', staticProperty('paint', solidPaint('red'))],
          ]),
        ),
      );
      word.styleSources = { next: nextStyle, current: word };
      const wipe = word.addEffect(
        new WipeRevealEffect(
          new Map([
            ['reveal', staticProperty('number', 0)],
            ['direction', staticProperty('string', 'leftToRight')],
            ['fromStyle', staticProperty('string', 'next')],
            ['toStyle', staticProperty('string', 'current')],
            ['basePlacement', staticProperty('string', 'back')],
          ]),
        ),
      );

      const renderCenter = () => {
        const canvas = new Canvas(100, 40);
        renderScene(word, canvas.getContext('2d'), ctx());
        return canvas.getContext('2d').getImageData(50, 20, 1, 1).data;
      };

      wipe.getProp('reveal').setBase(0);
      const sourcePixel = renderCenter();
      wipe.getProp('reveal').setBase(1);
      const targetPixel = renderCenter();

      assert.ok(sourcePixel[0] > 200 && sourcePixel[2] < 40);
      assert.ok(sourcePixel[3] >= 55 && sourcePixel[3] <= 75);
      assert.ok(targetPixel[2] > 200 && targetPixel[0] < 40);
      assert.ok(targetPixel[3] >= 190 && targetPixel[3] <= 215);
    });
  },

  () => {
    test('WipeReveal replaces the base layer instead of stacking translucent styles', () => {
      const word = new Word('word:wipe-alpha');
      word.box = { x: 0, y: 0, width: 100, height: 40 };
      word.addComponent(new Transform(new Map([['opacity', staticProperty('number', 0.8)]])));
      word.addComponent(
        new BackgroundStyle(
          new Map([
            ['enabled', staticProperty('boolean', true)],
            ['fill', staticProperty('paint', solidPaint('rgba(0, 0, 255, 0.5)'))],
          ]),
        ),
      );
      const nextStyle = new Word('word:next-alpha');
      nextStyle.addComponent(new Transform(new Map([['opacity', staticProperty('number', 0.8)]])));
      nextStyle.addComponent(
        new BackgroundStyle(
          new Map([
            ['enabled', staticProperty('boolean', true)],
            ['fill', staticProperty('paint', solidPaint('rgba(255, 0, 0, 0.5)'))],
          ]),
        ),
      );
      word.styleSources = { next: nextStyle, current: word };
      const wipe = word.addEffect(
        new WipeRevealEffect(
          new Map([
            ['reveal', staticProperty('number', 1)],
            ['direction', staticProperty('string', 'leftToRight')],
            ['fromStyle', staticProperty('string', 'next')],
            ['toStyle', staticProperty('string', 'current')],
            ['basePlacement', staticProperty('string', 'back')],
          ]),
        ),
      );

      const canvas = new Canvas(100, 40);
      renderScene(word, canvas.getContext('2d'), ctx());
      const targetPixel = canvas.getContext('2d').getImageData(50, 20, 1, 1).data;

      assert.ok(targetPixel[2] > 90);
      assert.ok(targetPixel[0] < 10);
      assert.ok(targetPixel[3] >= 90 && targetPixel[3] <= 115);
      wipe.getProp('reveal').setBase(0);
    });
  },

  () => {
    test('TypewriterEffect paints an auto-sized blinking cursor and reports its margins', () => {
      const effect = new TypewriterEffect(
        new Map([
          ['revealMode', staticProperty('string', 'manual')],
          ['reveal', staticProperty('number', 0.5)],
          ['cursor.showDuringReveal', staticProperty('boolean', true)],
          ['cursor.blink.rate', staticProperty('number', 2)],
          ['cursor.blink.dutyCycle', staticProperty('number', 0.5)],
        ]),
      );
      const renderCursor = (elapsedSeconds) => {
        const canvas = new Canvas(240, 120);
        const context = canvas.getContext('2d');
        context.font = '80px sans-serif';
        const rctx = defaultResolveContext({ elapsedSeconds });
        const layout = effect.buildLayout(context, rctx, 'AB', solidPaint('white'));
        context.save();
        context.translate(120, 60);
        effect.paintCursor(context, rctx, layout, solidPaint('white'), {
          x: -layout.width / 2,
          y: -layout.textHeight / 2,
          width: layout.width,
          height: layout.textHeight,
        });
        context.restore();
        return countOpaquePixels(context.getImageData(0, 0, 240, 120).data);
      };

      assert.ok(renderCursor(0.1) > 0, 'the cursor should be visible during the active blink duty cycle');
      assert.equal(renderCursor(0.4), 0, 'the cursor should be hidden during the inactive blink duty cycle');
      assert.ok(
        effect.getMargins(defaultResolveContext(), { bounds: { width: 120, height: 80 } }).y >= 40,
        'auto cursor height should reserve half the source height above and below the text',
      );
    });
  },

  () => {
    test('Typewriter cursor size follows text height and keeps the underscore horizontal', () => {
      const createEffect = (size) =>
        new TypewriterEffect(
          new Map([
            ['cursor.preset', staticProperty('string', 'underscore')],
            ['cursor.size', staticProperty('number', size)],
            ['cursor.blink.enabled', staticProperty('boolean', false)],
            ['cursor.showWhenComplete', staticProperty('boolean', true)],
          ]),
        );
      const automatic = createEffect(0);
      const explicit = createEffect(32);
      const bounds = { width: 100, height: 80 };

      assert.equal(automatic.getMargins(defaultResolveContext(), { bounds }).x, 60);
      assert.equal(explicit.getMargins(defaultResolveContext(), { bounds }).x, 32);

      const canvas = new Canvas(240, 120);
      const context = canvas.getContext('2d');
      context.font = '80px sans-serif';
      const rctx = defaultResolveContext();
      const layout = explicit.buildLayout(context, rctx, 'A', solidPaint('white'));
      context.translate(120, 60);
      explicit.paintCursor(context, rctx, layout, solidPaint('white'), {
        x: -layout.width / 2,
        y: -layout.textHeight / 2,
        width: layout.width,
        height: layout.textHeight,
      });

      const cursorBounds = opaqueBounds(context.getImageData(0, 0, 240, 120).data, 240, 120);
      assert.ok(cursorBounds.width >= 30, 'explicit cursor size should control underscore length');
      assert.ok(cursorBounds.width > cursorBounds.height * 3, 'underscore should remain horizontal');
      assert.ok(cursorBounds.top > 60, 'underscore should render below the text center');
    });
  },

  () => {
    test('Typewriter SVG cursor size uses the resolved height and source aspect ratio', async () => {
      await loadImageAsset(cursorAssetSource('ios'));
      const effect = new TypewriterEffect(
        new Map([
          ['cursor.preset', staticProperty('string', 'ios')],
          ['cursor.size', staticProperty('number', 40)],
        ]),
      );
      const margins = effect.getMargins(defaultResolveContext(), { bounds: { width: 100, height: 80 } });

      assert.ok(Math.abs(margins.y - 20) < 0.01, 'SVG cursor height should use the configured size');
      assert.ok(Math.abs(margins.x - (40 * 2) / 24) < 0.01, 'SVG cursor width should preserve its aspect ratio');
    });
  },

  () => {
    test('Typewriter cursor assets are discovered from Text component effects', () => {
      const word = new Word('word:cursor-assets');
      const text = word.addComponent(new Text());
      text.addEffect(new TypewriterEffect());

      assert.equal(cursorAssetsInScene(word).length, 8);
    });
  },

  () => {
    test('TypewriterEffect reserves rotated unit and glyph cursor margins', () => {
      const effect = new TypewriterEffect(
        new Map([
          ['cursor.preset', staticProperty('string', 'custom')],
          ['cursor.shape', staticProperty('string', 'glyph')],
          [
            'unitTracks',
            staticProperty('array', [
              {
                target: 'unit.rotation',
                keyframes: [
                  { time: 0, value: 90 },
                  { time: 1, value: 180 },
                ],
              },
            ]),
          ],
        ]),
      );

      const margins = effect.getMargins(defaultResolveContext(), { bounds: { width: 100, height: 20 } });

      assert.ok(margins.y >= 49.9, 'rotation and cursor height should reserve vertical space');
      assert.ok(margins.x >= 19.9, 'glyph width should reserve horizontal space');
    });
  },

  () => {
    test('Text.paint renders revealed units and the cursor through the normal effect stack', () => {
      const createWord = (cursorEnabled) => {
        const word = new Word(cursorEnabled ? 'word:cursor' : 'word:no-cursor');
        word.text = 'ABCD';
        const text = word.addComponent(new Text());
        text.addEffect(
          new TypewriterEffect(
            new Map([
              ['revealMode', staticProperty('string', 'manual')],
              ['reveal', staticProperty('number', 0.5)],
              ['cursor.enabled', staticProperty('boolean', cursorEnabled)],
              ['cursor.blink.enabled', staticProperty('boolean', false)],
              ['cursor.showDuringReveal', staticProperty('boolean', true)],
            ]),
          ),
        );
        return word;
      };

      const withCursor = renderWord(createWord(true), { width: 500, height: 240 });
      const withoutCursor = renderWord(createWord(false), { width: 500, height: 240 });

      dumpPng(withCursor.canvas, 'typewriter-cursor.png');
      dumpPng(withoutCursor.canvas, 'typewriter-no-cursor.png');
      assert.ok(countOpaquePixels(withCursor.data) > countOpaquePixels(withoutCursor.data));
    });
  },

  () => {
    test('render: text shadow paints solid and gradient colors', () => {
      const word = new Word('gradient-shadow');
      const text = word.addComponent(new Text(new Map([['color', staticProperty('paint', solidPaint('white'))]])));
      text.components.push(
        new Font(
          new Map([
            ['family', staticProperty('fontFamily', ['Arimo', 'sans-serif'])],
            ['size', staticProperty('number', 80)],
            ['weight', staticProperty('string', 'bold')],
          ]),
        ),
      );
      text.effects.push(
        new ShadowEffect(
          new Map([
            ['enabled', staticProperty('boolean', true)],
            ['blurRadius', staticProperty('number', 0)],
            ['offset', staticProperty('vector2', { x: 30, y: 0 })],
            [
              'color',
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
      word.text = 'GRADIENT';

      const { data } = renderWord(word);
      assert.ok(
        hasColor(data, (r, g, b) => r > 150 && g < 100 && b < 100),
        'expected red gradient shadow pixels',
      );
      assert.ok(
        hasColor(data, (r, g, b) => r < 100 && g < 100 && b > 150),
        'expected blue gradient shadow pixels',
      );
    });
  },

  () => {
    test('render: layered underlays keep the first listed effect on top', () => {
      const canvas = new Canvas(4, 4);
      const context = canvas.getContext('2d');
      const resolveContext = defaultResolveContext({ progress: 1 });
      const redShadow = {
        type: 'shadow',
        isEnabled: () => true,
        getAppliesOn: () => 'base',
      };
      const blueShadow = {
        type: 'shadow',
        isEnabled: () => true,
        getAppliesOn: () => 'base',
      };

      renderLayeredEffectStack(
        context,
        resolveContext,
        [redShadow, blueShadow],
        () => true,
        () => undefined,
        (effect, output) => {
          output.fillStyle = effect === redShadow ? 'red' : 'blue';
          output.fillRect(0, 0, 4, 4);
        },
      );

      assert.deepEqual(Array.from(context.getImageData(1, 1, 1, 1).data), [255, 0, 0, 255]);
    });
  },

  () => {
    test('render: a container effect blurs its whole subtree (grouped offscreen composite)', () => {
      const width = 800;
      const height = 300;

      const renderLine = (withBlur) => {
        const { root, page } = makeLine(['AV', 'To'].map((w, i) => makeWord(`w${i}`, w, { size: 96 })));
        if (withBlur) page.addEffect(new GaussianBlurEffect(new Map([['blurRadius', staticProperty('number', 6)]])));
        const canvas = new Canvas(width, height);
        const context = canvas.getContext('2d');
        layoutScene(root, context, defaultResolveContext({}), { width, height });
        renderScene(root, context, defaultResolveContext({}));
        return context.getImageData(0, 0, width, height).data;
      };

      const sharp = renderLine(false);
      const blurred = renderLine(true);

      // The grouped blur still renders real content, but softens every edge, so it
      // produces many more partial-alpha pixels than the sharp render.
      assert.ok(countOpaquePixels(blurred) > 500, 'grouped-blurred content still renders');
      assert.ok(
        countPartialPixels(blurred) > countPartialPixels(sharp) * 1.5,
        'a grouped blur softens the whole subtree (more partial-alpha pixels)',
      );
    });
  },

  () => {
    test('Component.clone: deep-copies props and nested components/effects', () => {
      const text = new Text(new Map([['color', staticProperty('paint', solidPaint('white'))]]));
      text.components.push(new Font(new Map([['size', staticProperty('number', 42)]])));
      text.effects.push(new StrokeEffect(new Map([['width', staticProperty('number', 8)]])));
      const copy = text.clone();

      assert.ok(copy instanceof Text, 'clone keeps the concrete class');
      assert.notEqual(copy, text);
      assert.notEqual(copy.props, text.props, 'props map is a fresh instance');
      assert.notEqual(copy.components[0], text.components[0], 'nested components are cloned');
      assert.ok(copy.components[0] instanceof Font);
      assert.notEqual(copy.effects[0], text.effects[0], 'effects are cloned');
      assert.ok(copy.effects[0] instanceof StrokeEffect);
      assert.deepEqual(copy.getProp('color').resolve(ctx({})), solidPaint('white'));
    });
  },

  () => {
    test('Typewriter unit positions include Text letterSpacing', () => {
      const effect = new TypewriterEffect(
        new Map([
          ['revealMode', staticProperty('string', 'manual')],
          ['reveal', staticProperty('number', 1)],
          ['cursor.enabled', staticProperty('boolean', false)],
        ]),
      );
      const context = new Canvas(16, 16).getContext('2d');
      context.font = 'bold 80px sans-serif';
      const rctx = defaultResolveContext({});
      const normal = effect.buildLayout(context, rctx, 'AB', solidPaint('white'), 0);
      const spaced = effect.buildLayout(context, rctx, 'AB', solidPaint('white'), 12);

      assert.equal(spaced.units.length, 2);
      assert.equal(spaced.letterSpacing, 12);
      assert.ok(spaced.width > normal.width);
      assert.ok(spaced.units[1].centerX - spaced.units[0].centerX > normal.units[1].centerX - normal.units[0].centerX);
    });
  },
];

for (const registerTest of testRegistrations) registerTest();
