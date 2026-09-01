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
    test('LayoutMotion applies an absolute spring offset without accumulating frame translations', () => {
      const root = new CompositionArea('compositionArea');
      const page = new Page('page');
      page.box = { x: 0, y: 0, width: 200, height: 300 };
      page.addComponent(
        new LayoutMotion(
          new Map([
            ['focusPosition', staticProperty('number', 0.5)],
            ['stiffness', staticProperty('number', 220)],
            ['damping', staticProperty('number', 28)],
            ['mass', staticProperty('number', 1)],
          ]),
        ),
      );
      const background = page.addComponent(
        new BackgroundStyle(new Map([['boundsMode', staticProperty('string', 'full')]])),
      );
      const previous = page.addChild(new Row('previous'));
      previous.state = 'previous';
      previous.box = { x: 0, y: -40, width: 100, height: 20 };
      const current = page.addChild(new Row('current'));
      current.state = 'current';
      current.box = { x: 0, y: 0, width: 100, height: 20 };
      const word = current.addChild(new Word('word'));
      word.box = { x: 10, y: 0, width: 40, height: 20 };
      const next = page.addChild(new Row('next'));
      next.state = 'next';
      next.box = { x: 0, y: 40, width: 100, height: 20 };
      root.addChild(page);

      const runtime = new LayoutMotionRuntime();
      applyLayoutMotion(root, defaultResolveContext({ deltaSeconds: 1 / 60 }), runtime, 'page:0');
      assert.equal(current.box.y, 140);
      assert.equal(word.box.y, 140);
      assert.equal(next.box.y, 180);
      assert.deepEqual(background.box, { x: 0, y: 100, width: 100, height: 100 });

      applyLayoutMotion(root, defaultResolveContext({ deltaSeconds: 1 / 60 }), runtime, 'page:0');
      assert.equal(current.box.y, 140);
      assert.equal(word.box.y, 140);
      assert.equal(next.box.y, 180);
    });
  },

  () => {
    test('Page Layout Motion focuses within the Page content area after padding', () => {
      for (const [focusPosition, expectedY] of [
        [1, 40],
        [0, 220],
      ]) {
        const root = new CompositionArea('compositionArea');
        const page = root.addChild(new Page('page'));
        page.box = { x: 0, y: 0, width: 200, height: 300 };
        page.addComponent(
          new Layout(
            new Map([
              ['padding.top', staticProperty('number', 40)],
              ['padding.right', staticProperty('number', 20)],
              ['padding.bottom', staticProperty('number', 60)],
              ['padding.left', staticProperty('number', 30)],
            ]),
          ),
        );
        page.addComponent(new LayoutMotion(new Map([['focusPosition', staticProperty('number', focusPosition)]])));

        const current = page.addChild(new Row('current'));
        current.state = 'current';
        current.box = { x: 0, y: 100, width: 100, height: 20 };

        applyLayoutMotion(root, defaultResolveContext({ deltaSeconds: 1 / 60 }), new LayoutMotionRuntime(), 'page:0');

        assert.equal(current.box.y, expectedY);
      }
    });
  },

  () => {
    test('Page Layout Motion applies per-state distance and speed scales', () => {
      const root = new CompositionArea('compositionArea');
      const page = root.addChild(new Page('page'));
      page.box = { x: 0, y: 0, width: 200, height: 300 };
      page.addComponent(
        new LayoutMotion(
          new Map([
            ['motionType', staticProperty('string', 'eased')],
            ['durationSeconds', staticProperty('number', 1)],
            ['easing', staticProperty('string', 'linear')],
            ['stateMotion.past.distanceScale', staticProperty('number', 2)],
            ['stateMotion.past.speedScale', staticProperty('number', 2)],
          ]),
        ),
      );

      const past = page.addChild(new Row('past'));
      past.state = 'past';
      past.box = { x: 0, y: 40, width: 100, height: 20 };
      const current = page.addChild(new Row('current'));
      current.state = 'current';
      current.box = { x: 0, y: 100, width: 100, height: 20 };
      const next = page.addChild(new Row('next'));
      next.state = 'next';
      next.box = { x: 0, y: 160, width: 100, height: 20 };

      const runtime = new LayoutMotionRuntime();
      applyLayoutMotion(root, ctx({ deltaSeconds: 1 / 60 }), runtime, 'page:state-motion');
      applyLayoutMotion(root, ctx({ deltaSeconds: 0.25 }), runtime, 'page:state-motion');
      applyLayoutMotion(root, ctx({ deltaSeconds: 0.25 }), runtime, 'page:state-motion');

      assert.equal(current.box.y, 140);
      assert.equal(past.box.y, 20);
      assert.equal(next.box.y, 180);
    });
  },

  () => {
    test('LayoutMotionRuntime preserves velocity and converges on a new target', () => {
      const runtime = new LayoutMotionRuntime();
      runtime.beginPage('page:0');
      const config = { stiffness: 220, damping: 28, mass: 1 };
      assert.equal(runtime.resolve('active-row', 0, 1 / 60, config), 0);
      const firstStep = runtime.resolve('active-row', 100, 1 / 60, config);
      assert.ok(firstStep > 0 && firstStep < 100);

      let position = firstStep;
      for (let frame = 0; frame < 240; frame += 1) {
        position = runtime.resolve('active-row', 100, 1 / 60, config);
      }
      assert.ok(Math.abs(position - 100) < 0.01);
    });
  },

  () => {
    test('LayoutMotionRuntime keeps a flow target stable until the focus item changes', () => {
      const runtime = new LayoutMotionRuntime();
      runtime.beginPage('page:0');

      assert.equal(runtime.resolveFlowOffset('page:0:page:flow:y', 'row:0', 100), 100);
      assert.equal(runtime.resolveFlowOffset('page:0:page:flow:y', 'row:0', 240), 100);
      assert.equal(runtime.resolveFlowOffset('page:0:page:flow:y', 'row:1', -40), -40);
    });
  },

  () => {
    test('Flow-anchor page motion survives scene regeneration without following a changed baseline', () => {
      const createScene = (rows) => {
        const root = new CompositionArea('compositionArea');
        const page = new Page('page');
        page.box = { x: 0, y: 0, width: 200, height: 300 };
        page.addComponent(
          new LayoutMotion(
            new Map([
              ['focusPosition', staticProperty('number', 0.5)],
              ['stiffness', staticProperty('number', 220)],
              ['damping', staticProperty('number', 28)],
              ['mass', staticProperty('number', 1)],
            ]),
          ),
        );
        for (const rowConfig of rows) {
          const row = page.addChild(new Row(rowConfig.id));
          row.state = rowConfig.state;
          row.box = { x: 0, y: rowConfig.y, width: 100, height: rowConfig.height ?? 20 };
        }
        root.addChild(page);
        return { root, page };
      };

      const runtime = new LayoutMotionRuntime();
      const first = createScene([{ id: 'ROW:CURRENT:0', state: 'current', y: 130 }]);
      applyLayoutMotion(first.root, ctx({ deltaSeconds: 1 / 60 }), runtime, 'page:0');
      assert.equal(first.page.children[0].box.y, 140);

      const regenerated = createScene([{ id: 'ROW:CURRENT:0', state: 'current', y: 80 }]);
      applyLayoutMotion(regenerated.root, ctx({ deltaSeconds: 1 / 60 }), runtime, 'page:0');
      assert.equal(regenerated.page.children[0].box.y, 90);
    });
  },

  () => {
    test('Row Layout Motion uses the containing Page as its horizontal focus frame', () => {
      const createScene = (focusPosition) => {
        const root = new CompositionArea('compositionArea');
        const page = root.addChild(new Page('page'));
        page.box = { x: 0, y: 0, width: 600, height: 200 };
        page.addComponent(
          new Layout(
            new Map([
              ['padding.top', staticProperty('number', 10)],
              ['padding.right', staticProperty('number', 60)],
              ['padding.bottom', staticProperty('number', 10)],
              ['padding.left', staticProperty('number', 40)],
            ]),
          ),
        );
        const row = page.addChild(new Row('row'));
        row.box = { x: 220, y: 80, width: 160, height: 40 };
        row.addComponent(
          new LayoutMotion(
            new Map([
              ['motionType', staticProperty('string', 'eased')],
              ['durationSeconds', staticProperty('number', 0.01)],
              ['focusPosition', staticProperty('number', focusPosition)],
            ]),
          ),
        );
        const previous = row.addChild(new Word('word:previous', 'previous'));
        previous.box = { x: 220, y: 80, width: 80, height: 40 };
        const current = row.addChild(new Word('word:current', 'current'));
        current.state = 'current';
        current.box = { x: 300, y: 80, width: 80, height: 40 };
        return { root, current };
      };

      for (const [focusPosition, expectedCenter] of [
        [0, 80],
        [0.5, 290],
        [1, 500],
      ]) {
        const { root, current } = createScene(focusPosition);
        const runtime = new LayoutMotionRuntime();
        const renderContext = ctx({ deltaSeconds: 1 / 30 });
        applyLayoutMotion(root, renderContext, runtime, `page:${focusPosition}`);
        applyLayoutMotion(root, renderContext, runtime, `page:${focusPosition}`);
        assert.ok(Math.abs(current.box.x + current.box.width / 2 - expectedCenter) < 0.001);
      }

      const { root } = createScene(0.5);
      const cropBounds = contentBounds(root, ctx(), { includeLayoutMotionBounds: true });
      assert.ok(cropBounds);
      assert.equal(cropBounds.x, 0);
      assert.equal(cropBounds.width, 600);
    });
  },

  () => {
    test('LayoutMotion selects motion type independently from its child scope', () => {
      const shared = new LayoutMotion();
      const independent = new LayoutMotion(new Map([['motionScope', staticProperty('string', 'perChild')]]));
      const independentSpring = new LayoutMotion(
        new Map([
          ['motionScope', staticProperty('string', 'perChild')],
          ['motionType', staticProperty('string', 'spring')],
        ]),
      );
      ensureComponentDefaults(independent);

      assert.equal(shared.motionScope(ctx()), 'group');
      assert.equal(shared.motionType(ctx()), 'spring');
      assert.equal(shared.timingMode(ctx()), 'fixed');
      assert.equal(independent.motionScope(ctx()), 'perChild');
      assert.equal(independent.motionType(ctx()), 'spring');
      assert.equal(independentSpring.motionType(ctx()), 'spring');
      assert.equal(independent.durationSeconds(ctx()), 0.25);
      assert.equal(independent.staggerTimingMode(ctx()), 'adaptive');
      assert.equal(independent.staggerDelaySeconds(ctx()), 0.025);
      assert.equal(independent.easing(ctx()), 'easeInOut');
    });
  },

  () => {
    test('LayoutMotionRuntime applies an eased transition after its child delay', () => {
      const runtime = new LayoutMotionRuntime();
      runtime.beginPage('page:0');
      const config = { durationSeconds: 0.5, delaySeconds: 0.1, easing: 'easeInOut' };

      assert.equal(runtime.resolveEased('row:0', 0, 1 / 60, config), 0);
      assert.equal(runtime.resolveEased('row:0', 100, 0.05, config), 0);
      const firstMovingFrame = runtime.resolveEased('row:0', 100, 0.06, config);
      assert.ok(firstMovingFrame > 0 && firstMovingFrame < 100);

      let position = firstMovingFrame;
      for (let frame = 0; frame < 60; frame += 1) {
        position = runtime.resolveEased('row:0', 100, 1 / 60, config);
      }
      assert.ok(Math.abs(position - 100) < 0.01);
    });
  },

  () => {
    test('LayoutMotionRuntime starts new motion states from the supplied layout position', () => {
      const runtime = new LayoutMotionRuntime();
      runtime.beginPage('page:0');

      assert.equal(runtime.resolve('group', 100, 1 / 60, { stiffness: 220, damping: 28, mass: 1 }, 0), 0);
      assert.equal(
        runtime.resolveEased('eased', 100, 1 / 60, { durationSeconds: 0.5, delaySeconds: 0, easing: 'easeInOut' }, 0),
        0,
      );
      assert.equal(runtime.resolveChildSpring('child', 100, 1 / 60, { stiffness: 220, damping: 28, mass: 1 }, 0, 0), 0);
    });
  },

  () => {
    test('Adaptive LayoutMotion timing scales duration and stagger to the next trigger', () => {
      const timing = resolveAdaptiveSequenceTiming(0.35, 0.1, 4, 0.22);

      assert.ok(Math.abs(timing.durationSeconds - 0.10266666666666666) < 1e-12);
      assert.ok(Math.abs(timing.staggerDelaySeconds - 0.029333333333333333) < 1e-12);
    });
  },

  () => {
    test('LayoutMotionRuntime retargets eased motion from the constrained displayed position', () => {
      const runtime = new LayoutMotionRuntime();
      runtime.beginPage('page:0');
      const config = { durationSeconds: 1, delaySeconds: 0, easing: 'easeInOut' };

      runtime.resolveEased('row:0', 0, 1 / 60, config);
      const unconstrained = runtime.resolveEased('row:0', 100, 0.25, config);
      const displayed = unconstrained + 10;
      runtime.synchronizeEasedPosition('row:0', displayed);

      assert.equal(runtime.resolveEased('row:0', 200, 0, config), displayed);
    });
  },

  () => {
    test('LayoutMotionRuntime applies spring motion to each child after its delay', () => {
      const runtime = new LayoutMotionRuntime();
      runtime.beginPage('page:0');
      const config = { stiffness: 220, damping: 28, mass: 1 };

      assert.equal(runtime.resolveChildSpring('row:0', 0, 1 / 60, config, 0.1), 0);
      assert.equal(runtime.resolveChildSpring('row:0', 100, 0.05, config, 0.1), 0);
      const firstMovingFrame = runtime.resolveChildSpring('row:0', 100, 0.06, config, 0.1);
      assert.ok(firstMovingFrame > 0 && firstMovingFrame < 100);

      let position = firstMovingFrame;
      for (let frame = 0; frame < 240; frame += 1) {
        position = runtime.resolveChildSpring('row:0', 100, 1 / 60, config, 0.1);
      }
      assert.ok(Math.abs(position - 100) < 0.01);
    });
  },

  () => {
    test('LayoutMotionRuntime does not restart an eased child delay when only its schedule changes', () => {
      const runtime = new LayoutMotionRuntime();
      runtime.beginPage('page:0');
      const initialConfig = { durationSeconds: 1, delaySeconds: 0.1, easing: 'linear' };
      const adjustedConfig = { durationSeconds: 1, delaySeconds: 0.4, easing: 'linear' };

      runtime.resolveEased('child', 100, 1 / 60, initialConfig, 0);
      const beforeScheduleChange = runtime.resolveEased('child', 100, 0.15, initialConfig, 0);
      const afterScheduleChange = runtime.resolveEased('child', 100, 1 / 60, adjustedConfig, 0);

      assert.ok(beforeScheduleChange > 0);
      assert.ok(afterScheduleChange > beforeScheduleChange);
    });
  },

  () => {
    test('LayoutMotionRuntime does not restart a spring child delay when only its schedule changes', () => {
      const runtime = new LayoutMotionRuntime();
      runtime.beginPage('page:0');
      const config = { stiffness: 220, damping: 28, mass: 1 };

      runtime.resolveChildSpring('child', 100, 1 / 60, config, 0.2, 0);
      const beforeScheduleChange = runtime.resolveChildSpring('child', 100, 0.25, config, 0.2, 0);
      const afterScheduleChange = runtime.resolveChildSpring('child', 100, 1 / 60, config, 0.1, 0);

      assert.ok(beforeScheduleChange > 0);
      assert.ok(afterScheduleChange > beforeScheduleChange);
    });
  },

  () => {
    test('LayoutMotionRuntime does not reapply a child delay after a started target changes', () => {
      const runtime = new LayoutMotionRuntime();
      runtime.beginPage('page:0');
      const easedConfig = { durationSeconds: 1, delaySeconds: 0.2, easing: 'linear' };
      const springConfig = { stiffness: 220, damping: 28, mass: 1 };

      runtime.resolveEased('eased-child', 100, 1 / 60, easedConfig, 0);
      const easedBeforeRetarget = runtime.resolveEased('eased-child', 100, 0.3, easedConfig, 0);
      const easedAfterRetarget = runtime.resolveEased('eased-child', 110, 1 / 60, easedConfig, 0);
      const easedNextFrame = runtime.resolveEased('eased-child', 110, 1 / 60, easedConfig, 0);

      runtime.resolveChildSpring('spring-child', 100, 1 / 60, springConfig, 0.2, 0);
      const springBeforeRetarget = runtime.resolveChildSpring('spring-child', 100, 0.3, springConfig, 0.2, 0);
      const springAfterRetarget = runtime.resolveChildSpring('spring-child', 110, 1 / 60, springConfig, 0.2, 0);
      const springNextFrame = runtime.resolveChildSpring('spring-child', 110, 1 / 60, springConfig, 0.2, 0);

      assert.ok(easedBeforeRetarget > 0);
      assert.ok(easedAfterRetarget > easedBeforeRetarget);
      assert.ok(easedNextFrame > easedAfterRetarget);
      assert.ok(springBeforeRetarget > 0);
      assert.ok(springAfterRetarget > springBeforeRetarget);
      assert.ok(springNextFrame > springAfterRetarget);
    });
  },

  () => {
    test('Child-scoped page motion keeps a delayed row moving as it approaches its target', () => {
      const root = new CompositionArea('compositionArea');
      const page = root.addChild(new Page('page'));
      page.box = { x: 0, y: 0, width: 400, height: 400 };
      page.addComponent(
        new LayoutMotion(
          new Map([
            ['motionScope', staticProperty('string', 'perChild')],
            ['motionType', staticProperty('string', 'eased')],
            ['timingMode', staticProperty('string', 'fixed')],
            ['staggerTimingMode', staticProperty('string', 'fixed')],
            ['durationSeconds', staticProperty('number', 0.5)],
            ['staggerDelaySeconds', staticProperty('number', 0.2)],
            ['focusPosition', staticProperty('number', 0.5)],
          ]),
        ),
      );
      const current = page.addChild(new Row('ROW:CURRENT:0'));
      current.state = 'current';
      current.box = { x: 0, y: 90, width: 100, height: 20 };
      const next = page.addChild(new Row('ROW:NEXT:1'));
      next.state = 'next';
      next.box = { x: 0, y: 240, width: 100, height: 20 };
      root.addChild(page);

      const runtime = new LayoutMotionRuntime();
      const renderContext = ctx({ deltaSeconds: 1 / 60 });
      applyLayoutMotion(root, renderContext, runtime, 'page:dynamic-delay');
      for (let frame = 0; frame < 90; frame += 1) {
        applyLayoutMotion(root, renderContext, runtime, 'page:dynamic-delay');
      }

      assert.ok(next.box.y > 260, `expected the delayed row to continue moving, received ${next.box.y}`);
    });
  },

  () => {
    test('Child-scoped page motion removes the delay for a row near its retarget', () => {
      const createScene = (currentId, currentCenter) => {
        const root = new CompositionArea('compositionArea');
        const page = root.addChild(new Page('page'));
        page.box = { x: 0, y: 0, width: 400, height: 400 };
        page.addComponent(
          new LayoutMotion(
            new Map([
              ['motionScope', staticProperty('string', 'perChild')],
              ['motionType', staticProperty('string', 'eased')],
              ['timingMode', staticProperty('string', 'fixed')],
              ['staggerTimingMode', staticProperty('string', 'fixed')],
              ['durationSeconds', staticProperty('number', 0.5)],
              ['staggerDelaySeconds', staticProperty('number', 0.2)],
              ['focusPosition', staticProperty('number', 0.5)],
            ]),
          ),
        );
        const current = page.addChild(new Row(currentId));
        current.state = 'current';
        current.box = { x: 0, y: currentCenter - 10, width: 100, height: 20 };
        const far = page.addChild(new Row('ROW:NEXT:far'));
        far.state = 'next';
        far.box = { x: 0, y: 290, width: 100, height: 20 };
        return { root, far };
      };

      const runtime = new LayoutMotionRuntime();
      const first = createScene('ROW:CURRENT:old', 300);
      applyLayoutMotion(first.root, ctx({ deltaSeconds: 1 / 60 }), runtime, 'page:near-retarget');
      const second = createScene('ROW:CURRENT:new', 180);
      applyLayoutMotion(second.root, ctx({ deltaSeconds: 0.11 }), runtime, 'page:near-retarget');

      assert.ok(
        second.far.box.y > 290,
        `expected the near-retarget row to move immediately, received ${second.far.box.y}`,
      );
    });
  },

  () => {
    test('Child-scoped row motion keeps a delayed word moving as it approaches its target', () => {
      const root = new CompositionArea('compositionArea');
      const page = root.addChild(new Page('page'));
      page.box = { x: 0, y: 0, width: 400, height: 100 };
      const row = page.addChild(new Row('row'));
      row.box = { x: 0, y: 0, width: 400, height: 40 };
      row.addComponent(
        new LayoutMotion(
          new Map([
            ['motionScope', staticProperty('string', 'perChild')],
            ['motionType', staticProperty('string', 'eased')],
            ['timingMode', staticProperty('string', 'fixed')],
            ['staggerTimingMode', staticProperty('string', 'fixed')],
            ['durationSeconds', staticProperty('number', 0.5)],
            ['staggerDelaySeconds', staticProperty('number', 0.2)],
            ['focusPosition', staticProperty('number', 0.5)],
          ]),
        ),
      );
      const current = row.addChild(new Word('WORD:CURRENT:0', 'current'));
      current.state = 'current';
      current.box = { x: 40, y: 0, width: 40, height: 20 };
      const next = row.addChild(new Word('WORD:NEXT:1', 'next'));
      next.state = 'next';
      next.box = { x: 240, y: 0, width: 40, height: 20 };
      root.addChild(page);

      const runtime = new LayoutMotionRuntime();
      const renderContext = ctx({ deltaSeconds: 1 / 60 });
      applyLayoutMotion(root, renderContext, runtime, 'page:dynamic-word-delay');
      for (let frame = 0; frame < 90; frame += 1) {
        applyLayoutMotion(root, renderContext, runtime, 'page:dynamic-word-delay');
      }

      assert.ok(next.box.x > 360, `expected the delayed word to continue moving, received ${next.box.x}`);
    });
  },

  () => {
    test('Child-scoped row motion removes the delay for a word near its retarget', () => {
      const createScene = (currentId, currentCenter) => {
        const root = new CompositionArea('compositionArea');
        const page = root.addChild(new Page('page'));
        page.box = { x: 0, y: 0, width: 400, height: 100 };
        const row = page.addChild(new Row('row'));
        row.box = { x: 0, y: 0, width: 400, height: 40 };
        row.addComponent(
          new LayoutMotion(
            new Map([
              ['motionScope', staticProperty('string', 'perChild')],
              ['motionType', staticProperty('string', 'eased')],
              ['timingMode', staticProperty('string', 'fixed')],
              ['staggerTimingMode', staticProperty('string', 'fixed')],
              ['durationSeconds', staticProperty('number', 0.5)],
              ['staggerDelaySeconds', staticProperty('number', 0.2)],
              ['focusPosition', staticProperty('number', 0.5)],
            ]),
          ),
        );
        const current = row.addChild(new Word(currentId, 'current'));
        current.state = 'current';
        current.box = { x: currentCenter - 20, y: 0, width: 40, height: 20 };
        const far = row.addChild(new Word('WORD:NEXT:far', 'far'));
        far.state = 'next';
        far.box = { x: 280, y: 0, width: 40, height: 20 };
        return { root, far };
      };

      const runtime = new LayoutMotionRuntime();
      const first = createScene('WORD:CURRENT:old', 300);
      applyLayoutMotion(first.root, ctx({ deltaSeconds: 1 / 60 }), runtime, 'page:near-word-retarget');
      const second = createScene('WORD:CURRENT:new', 180);
      applyLayoutMotion(second.root, ctx({ deltaSeconds: 0.11 }), runtime, 'page:near-word-retarget');

      assert.ok(
        second.far.box.x > 280,
        `expected the near-retarget word to move immediately, received ${second.far.box.x}`,
      );
    });
  },

  () => {
    test('Child-scoped page LayoutMotion uses distance-based easing for variable row heights', () => {
      const createScene = (rows) => {
        const root = new CompositionArea('compositionArea');
        const page = new Page('page');
        page.box = { x: 0, y: 0, width: 200, height: 300 };
        page.addComponent(
          new LayoutMotion(
            new Map([
              ['motionScope', staticProperty('string', 'perChild')],
              ['motionType', staticProperty('string', 'eased')],
              ['focusPosition', staticProperty('number', 0.5)],
              ['stiffness', staticProperty('number', 220)],
              ['damping', staticProperty('number', 28)],
              ['mass', staticProperty('number', 1)],
            ]),
          ),
        );
        for (const rowConfig of rows) {
          const row = page.addChild(new Row(rowConfig.id));
          row.state = rowConfig.state;
          row.box = { x: 0, y: rowConfig.y, width: 100, height: rowConfig.height ?? 20 };
        }
        root.addChild(page);
        return { root, page };
      };

      const runtime = new LayoutMotionRuntime();
      const first = createScene([
        { id: 'ROW:CURRENT:0', state: 'current', y: 130, height: 20 },
        { id: 'ROW:NEXT:1', state: 'next', y: 180, height: 40 },
      ]);
      applyLayoutMotion(first.root, ctx({ deltaSeconds: 1 / 60 }), runtime, 'page:0');
      assert.equal(first.page.children[0].box.y, 140);
      assert.equal(first.page.children[1].box.y, 180);

      const second = createScene([
        { id: 'ROW:PREVIOUS:0', state: 'previous', y: 80, height: 40 },
        { id: 'ROW:CURRENT:1', state: 'current', y: 130, height: 20 },
      ]);
      applyLayoutMotion(second.root, ctx({ deltaSeconds: 1 / 60 }), runtime, 'page:0');

      assert.ok(second.page.children[0].box.y > 80 && second.page.children[0].box.y < 140);
      assert.ok(second.page.children[1].box.y > 140 && second.page.children[1].box.y < 190);

      for (let frame = 0; frame < 240; frame += 1) {
        applyLayoutMotion(second.root, ctx({ deltaSeconds: 1 / 60 }), runtime, 'page:0');
      }
      assert.ok(Math.abs(second.page.children[0].box.y - 90) < 0.01);
      assert.ok(Math.abs(second.page.children[1].box.y - 140) < 0.01);
    });
  },

  () => {
    test('Group eased LayoutMotion starts at focus and eases after a focus change', () => {
      const createScene = (id, y) => {
        const root = new CompositionArea('compositionArea');
        const page = root.addChild(new Page('page'));
        page.box = { x: 0, y: 0, width: 200, height: 300 };
        page.addComponent(
          new LayoutMotion(
            new Map([
              ['motionType', staticProperty('string', 'eased')],
              ['timingMode', staticProperty('string', 'fixed')],
              ['durationSeconds', staticProperty('number', 1)],
              ['focusPosition', staticProperty('number', 0.5)],
            ]),
          ),
        );
        const row = page.addChild(new Row(id));
        row.state = 'current';
        row.box = { x: 0, y, width: 100, height: 20 };
        return { root, row };
      };

      const runtime = new LayoutMotionRuntime();
      const first = createScene('ROW:CURRENT:0', 80);
      applyLayoutMotion(first.root, ctx({ deltaSeconds: 1 / 60 }), runtime, 'page:eased-focus');
      assert.equal(first.row.box.y, 140);

      const changed = createScene('ROW:CURRENT:1', 180);
      applyLayoutMotion(changed.root, ctx({ deltaSeconds: 1 / 60 }), runtime, 'page:eased-focus');
      assert.ok(changed.row.box.y > 140 && changed.row.box.y < 240);

      applyLayoutMotion(changed.root, ctx({ deltaSeconds: 0.5 }), runtime, 'page:eased-focus');
      assert.ok(changed.row.box.y > 140 && changed.row.box.y < 240);
    });
  },

  () => {
    test('Child-scoped page LayoutMotion never delays the focused row behind its focus position', () => {
      const createScene = (rows) => {
        const root = new CompositionArea('compositionArea');
        const page = new Page('page');
        page.box = { x: 0, y: 0, width: 200, height: 300 };
        page.addComponent(
          new LayoutMotion(
            new Map([
              ['motionScope', staticProperty('string', 'perChild')],
              ['motionType', staticProperty('string', 'eased')],
              ['focusPosition', staticProperty('number', 0.5)],
              ['durationSeconds', staticProperty('number', 0.35)],
              ['staggerDelaySeconds', staticProperty('number', 0.1)],
            ]),
          ),
        );
        for (const rowConfig of rows) {
          const row = page.addChild(new Row(rowConfig.id));
          row.state = rowConfig.state;
          row.box = { x: 0, y: rowConfig.y, width: 100, height: rowConfig.height ?? 20 };
        }
        root.addChild(page);
        return { root, page };
      };

      const runtime = new LayoutMotionRuntime();
      const first = createScene([
        { id: 'ROW:CURRENT:0', state: 'current', y: 130 },
        { id: 'ROW:NEXT:1', state: 'next', y: 180 },
      ]);
      applyLayoutMotion(first.root, ctx({ deltaSeconds: 1 / 60 }), runtime, 'page:0');

      const second = createScene([
        { id: 'ROW:PREVIOUS:0', state: 'previous', y: 130 },
        { id: 'ROW:CURRENT:1', state: 'current', y: 180 },
      ]);
      applyLayoutMotion(second.root, ctx({ deltaSeconds: 1 / 60 }), runtime, 'page:0');

      assert.ok(second.page.children[1].box.y < 190);
      for (let frame = 0; frame < 240; frame += 1) {
        applyLayoutMotion(second.root, ctx({ deltaSeconds: 1 / 60 }), runtime, 'page:0');
      }
      assert.ok(Math.abs(second.page.children[1].box.y - 140) < 0.01);
    });
  },

  () => {
    test('Child-scoped page LayoutMotion supports spring motion', () => {
      const createScene = (rows) => {
        const root = new CompositionArea('compositionArea');
        const page = new Page('page');
        page.box = { x: 0, y: 0, width: 200, height: 300 };
        page.addComponent(
          new LayoutMotion(
            new Map([
              ['motionScope', staticProperty('string', 'perChild')],
              ['motionType', staticProperty('string', 'spring')],
              ['focusPosition', staticProperty('number', 0.5)],
              ['staggerDelaySeconds', staticProperty('number', 0.1)],
              ['stiffness', staticProperty('number', 220)],
              ['damping', staticProperty('number', 28)],
              ['mass', staticProperty('number', 1)],
            ]),
          ),
        );
        for (const rowConfig of rows) {
          const row = page.addChild(new Row(rowConfig.id));
          row.state = rowConfig.state;
          row.box = { x: 0, y: rowConfig.y, width: 100, height: rowConfig.height ?? 20 };
        }
        root.addChild(page);
        return { root, page };
      };

      const runtime = new LayoutMotionRuntime();
      const first = createScene([
        { id: 'ROW:CURRENT:0', state: 'current', y: 130, height: 20 },
        { id: 'ROW:NEXT:1', state: 'next', y: 180, height: 40 },
      ]);
      applyLayoutMotion(first.root, ctx({ deltaSeconds: 1 / 60 }), runtime, 'page:0');
      assert.equal(first.page.children[0].box.y, 140);
      assert.equal(first.page.children[1].box.y, 180);

      const second = createScene([
        { id: 'ROW:PREVIOUS:0', state: 'previous', y: 80, height: 40 },
        { id: 'ROW:CURRENT:1', state: 'current', y: 130, height: 20 },
      ]);
      applyLayoutMotion(second.root, ctx({ deltaSeconds: 1 / 60 }), runtime, 'page:0');
      assert.ok(second.page.children[0].box.y > 80 && second.page.children[0].box.y < 140);
      assert.ok(second.page.children[1].box.y > 140 && second.page.children[1].box.y < 190);

      for (let frame = 0; frame < 240; frame += 1) {
        applyLayoutMotion(second.root, ctx({ deltaSeconds: 1 / 60 }), runtime, 'page:0');
      }
      assert.ok(Math.abs(second.page.children[0].box.y - 90) < 0.01);
      assert.ok(Math.abs(second.page.children[1].box.y - 140) < 0.01);
    });
  },

  () => {
    test('LayoutMotion uses distance falloff for child stagger timing', () => {
      const renderAfterFirstFrame = (factor) => {
        const root = new CompositionArea('compositionArea');
        const page = root.addChild(new Page('page'));
        page.box = { x: 0, y: 0, width: 400, height: 400 };
        page.addComponent(
          new LayoutMotion(
            new Map([
              ['motionScope', staticProperty('string', 'perChild')],
              ['motionType', staticProperty('string', 'eased')],
              ['timingMode', staticProperty('string', 'fixed')],
              ['staggerTimingMode', staticProperty('string', 'fixed')],
              ['durationSeconds', staticProperty('number', 1)],
              ['staggerDelaySeconds', staticProperty('number', 0.1)],
              ['staggerFalloffFactor', staticProperty('number', factor)],
              ['focusPosition', staticProperty('number', 0.5)],
            ]),
          ),
        );
        const current = page.addChild(new Row('ROW:CURRENT:0'));
        current.state = 'current';
        current.box = { x: 0, y: 90, width: 100, height: 20 };
        const near = page.addChild(new Row('ROW:NEXT:near'));
        near.state = 'next';
        near.box = { x: 0, y: 140, width: 100, height: 20 };
        const far = page.addChild(new Row('ROW:NEXT:far'));
        far.state = 'next';
        far.box = { x: 0, y: 190, width: 100, height: 20 };
        const runtime = new LayoutMotionRuntime();
        applyLayoutMotion(root, ctx({ deltaSeconds: 1 / 60 }), runtime, 'page:falloff');
        applyLayoutMotion(root, ctx({ deltaSeconds: 0.11 }), runtime, 'page:falloff');
        return near.box.y;
      };

      const reducing = renderAfterFirstFrame(0.5);
      const increasing = renderAfterFirstFrame(2);
      assert.ok(reducing > increasing + 0.001, `${reducing} should exceed ${increasing}`);
    });
  },

  () => {
    test('LayoutMotion preserves initial stagger delays when child travel is smaller than child size', () => {
      for (const motionType of ['eased', 'spring']) {
        for (const staggerTimingMode of ['fixed', 'adaptive']) {
          const root = new CompositionArea('compositionArea');
          const page = root.addChild(new Page('page'));
          page.box = { x: 0, y: 0, width: 400, height: 400 };
          page.addComponent(
            new LayoutMotion(
              new Map([
                ['motionScope', staticProperty('string', 'perChild')],
                ['motionType', staticProperty('string', motionType)],
                ['staggerTimingMode', staticProperty('string', staggerTimingMode)],
                ['durationSeconds', staticProperty('number', 1)],
                ['staggerDelaySeconds', staticProperty('number', 0.6)],
                ['staggerFalloffFactor', staticProperty('number', 1)],
                ['stiffness', staticProperty('number', 220)],
                ['damping', staticProperty('number', 28)],
                ['mass', staticProperty('number', 1)],
                ['focusPosition', staticProperty('number', 0.5)],
              ]),
            ),
          );
          const current = page.addChild(new Row('ROW:CURRENT:0'));
          current.state = 'current';
          current.box = { x: 0, y: 180, width: 100, height: 20 };
          const near = page.addChild(new Row('ROW:NEXT:near'));
          near.state = 'next';
          near.box = { x: 0, y: 230, width: 100, height: 20 };
          const far = page.addChild(new Row('ROW:NEXT:far'));
          far.state = 'next';
          far.box = { x: 0, y: 280, width: 100, height: 20 };

          const runtime = new LayoutMotionRuntime();
          applyLayoutMotion(
            root,
            ctx({ deltaSeconds: 1 / 60, rowDurationSeconds: 10 }),
            runtime,
            `page:initial-stagger:${motionType}:${staggerTimingMode}`,
          );
          applyLayoutMotion(
            root,
            ctx({ deltaSeconds: 1 / 60, rowDurationSeconds: 10 }),
            runtime,
            `page:initial-stagger:${motionType}:${staggerTimingMode}`,
          );
          for (let frame = 1; frame < 48; frame += 1) {
            applyLayoutMotion(
              root,
              ctx({ deltaSeconds: 1 / 60, rowDurationSeconds: 10 }),
              runtime,
              `page:initial-stagger:${motionType}:${staggerTimingMode}`,
            );
          }

          assert.ok(
            near.box.y > 230,
            `${motionType}/${staggerTimingMode} should start the nearer child after its delay`,
          );
          assert.equal(far.box.y, 280, `${motionType}/${staggerTimingMode} should keep the farther child delayed`);
        }
      }
    });
  },

  () => {
    test('Adaptive LayoutMotion uses the full active entity duration for stagger timing', () => {
      const root = new CompositionArea('compositionArea');
      const page = root.addChild(new Page('page'));
      page.box = { x: 0, y: 0, width: 400, height: 400 };
      page.addComponent(
        new LayoutMotion(
          new Map([
            ['motionScope', staticProperty('string', 'perChild')],
            ['motionType', staticProperty('string', 'eased')],
            ['timingMode', staticProperty('string', 'adaptive')],
            ['staggerTimingMode', staticProperty('string', 'adaptive')],
            ['durationSeconds', staticProperty('number', 0.5)],
            ['staggerDelaySeconds', staticProperty('number', 0.5)],
            ['staggerFalloffFactor', staticProperty('number', 1)],
            ['focusPosition', staticProperty('number', 0.5)],
          ]),
        ),
      );
      const current = page.addChild(new Row('ROW:CURRENT:0'));
      current.state = 'current';
      current.box = { x: 0, y: 180, width: 100, height: 20 };
      const near = page.addChild(new Row('ROW:NEXT:near'));
      near.state = 'next';
      near.box = { x: 0, y: 230, width: 100, height: 20 };
      const far = page.addChild(new Row('ROW:NEXT:far'));
      far.state = 'next';
      far.box = { x: 0, y: 280, width: 100, height: 20 };

      const runtime = new LayoutMotionRuntime();
      applyLayoutMotion(
        root,
        ctx({ deltaSeconds: 1 / 60, rowDurationSeconds: 1 }),
        runtime,
        'page:full-active-duration',
      );
      for (let frame = 0; frame < 19; frame += 1) {
        applyLayoutMotion(
          root,
          ctx({ deltaSeconds: 1 / 60, rowDurationSeconds: 1 }),
          runtime,
          'page:full-active-duration',
        );
      }

      assert.equal(near.box.y, 230);
      assert.equal(far.box.y, 280);
    });
  },

  () => {
    test('LayoutMotion uses distance falloff for per-child spring response', () => {
      const createScene = (factor, currentId, currentCenter) => {
        const root = new CompositionArea('compositionArea');
        const page = root.addChild(new Page('page'));
        page.box = { x: 0, y: 0, width: 400, height: 400 };
        page.addComponent(
          new LayoutMotion(
            new Map([
              ['motionScope', staticProperty('string', 'perChild')],
              ['motionType', staticProperty('string', 'spring')],
              ['staggerTimingMode', staticProperty('string', 'fixed')],
              ['staggerDelaySeconds', staticProperty('number', 0)],
              ['springFalloffFactor', staticProperty('number', factor)],
              ['stiffness', staticProperty('number', 220)],
              ['damping', staticProperty('number', 28)],
              ['mass', staticProperty('number', 1)],
              ['focusPosition', staticProperty('number', 0.5)],
            ]),
          ),
        );
        const current = page.addChild(new Row(currentId));
        current.state = 'current';
        current.box = { x: 0, y: currentCenter - 10, width: 100, height: 20 };
        const far = page.addChild(new Row('ROW:NEXT:far'));
        far.state = 'next';
        far.box = { x: 0, y: 290, width: 100, height: 20 };
        return { root, far };
      };

      const runtime = new LayoutMotionRuntime();
      const first = createScene(4, 'ROW:CURRENT:old', 100);
      applyLayoutMotion(first.root, ctx({ deltaSeconds: 1 / 60 }), runtime, 'page:spring-falloff');
      const second = createScene(4, 'ROW:CURRENT:new', 180);
      applyLayoutMotion(second.root, ctx({ deltaSeconds: 1 / 60 }), runtime, 'page:spring-falloff');

      const farMovement = second.far.box.y - 290;
      assert.ok(farMovement > 0);

      const neutralRuntime = new LayoutMotionRuntime();
      const neutralFirst = createScene(1, 'ROW:CURRENT:old', 100);
      applyLayoutMotion(
        neutralFirst.root,
        ctx({ deltaSeconds: 1 / 60 }),
        neutralRuntime,
        'page:spring-falloff-neutral',
      );
      const neutralSecond = createScene(1, 'ROW:CURRENT:new', 180);
      applyLayoutMotion(
        neutralSecond.root,
        ctx({ deltaSeconds: 1 / 60 }),
        neutralRuntime,
        'page:spring-falloff-neutral',
      );
      assert.ok(farMovement > neutralSecond.far.box.y - 290);
    });
  },

  () => {
    test('LayoutMotion keeps neutral falloff defaults', () => {
      const motion = new LayoutMotion();
      assert.equal(motion.staggerFalloffFactor(ctx()), 1);
      assert.equal(motion.springFalloffFactor(ctx()), 1);
    });
  },

  () => {
    test('LayoutMotion maps focus positions to the active motion axis', () => {
      const pageMotion = new LayoutMotion(new Map([['focusPosition', staticProperty('string', 'bottomRight')]]));
      const rowMotion = new LayoutMotion(new Map([['focusPosition', staticProperty('string', 'topRight')]]));

      assert.equal(pageMotion.focusPosition(ctx(), 'currentRow'), 1);
      assert.equal(rowMotion.focusPosition(ctx(), 'currentWord'), 1);
    });
  },

  () => {
    test('LayoutMotion defaults page flow to bottom-to-top', () => {
      const pageMotion = new LayoutMotion();

      assert.equal(pageMotion.flowDirection(ctx(), 'currentRow'), 'bottomToTop');
    });
  },

  () => {
    test('LayoutMotion defaults row flow to right-to-left', () => {
      const rowMotion = new LayoutMotion();

      assert.equal(rowMotion.flowDirection(ctx(), 'currentWord'), 'rightToLeft');
    });
  },

  () => {
    test('LayoutMotion moves a row and its words horizontally to the current word focus position', () => {
      const root = new CompositionArea('compositionArea');
      const row = new Row('row');
      row.box = { x: 0, y: 0, width: 300, height: 40 };
      row.addComponent(
        new LayoutMotion(
          new Map([
            ['flowDirection', staticProperty('string', 'leftToRight')],
            ['focusPosition', staticProperty('number', 0.5)],
            ['stiffness', staticProperty('number', 220)],
            ['damping', staticProperty('number', 28)],
            ['mass', staticProperty('number', 1)],
          ]),
        ),
      );
      const current = row.addChild(new Word('current'));
      current.state = 'current';
      current.box = { x: 20, y: 0, width: 40, height: 20 };
      const next = row.addChild(new Word('next'));
      next.state = 'next';
      next.box = { x: 80, y: 0, width: 40, height: 20 };
      root.addChild(row);

      applyLayoutMotion(root, ctx({ deltaSeconds: 1 / 60 }), new LayoutMotionRuntime(), 'page:0');

      assert.equal(row.box.x, 110);
      assert.equal(current.box.x, 130);
      assert.equal(next.box.x, 190);
      assert.equal(row.box.y, 0);
    });
  },

  () => {
    test('LayoutMotion keeps the current word focus position natural for right-to-left row flow', () => {
      const root = new CompositionArea('compositionArea');
      const row = new Row('row');
      row.box = { x: 0, y: 0, width: 300, height: 40 };
      row.addComponent(
        new LayoutMotion(
          new Map([
            ['flowDirection', staticProperty('string', 'rightToLeft')],
            ['focusPosition', staticProperty('number', 0.25)],
          ]),
        ),
      );
      const current = row.addChild(new Word('current'));
      current.state = 'current';
      current.box = { x: 20, y: 0, width: 40, height: 20 };
      root.addChild(row);

      applyLayoutMotion(root, ctx({ deltaSeconds: 1 / 60 }), new LayoutMotionRuntime(), 'page:0');

      assert.equal(row.box.x, 35);
      assert.equal(current.box.x, 55);
    });
  },

  () => {
    test('LayoutMotion mirrors the current row focus position for top-to-bottom page flow', () => {
      const root = new CompositionArea('compositionArea');
      const page = new Page('page');
      page.box = { x: 0, y: 0, width: 400, height: 300 };
      page.addComponent(
        new LayoutMotion(
          new Map([
            ['flowDirection', staticProperty('string', 'topToBottom')],
            ['focusPosition', staticProperty('number', 0.25)],
          ]),
        ),
      );
      const row = page.addChild(new Row('row'));
      row.state = 'current';
      row.box = { x: 0, y: 0, width: 300, height: 40 };
      root.addChild(page);

      applyLayoutMotion(root, ctx({ deltaSeconds: 1 / 60 }), new LayoutMotionRuntime(), 'page:0');

      assert.equal(row.box.y, 205);
    });
  },

  () => {
    test('LayoutMotion page direction controls physical row stacking order', () => {
      const createPage = (flowDirection) => {
        const root = new CompositionArea('compositionArea');
        const page = new Page(`page:${flowDirection}`);
        page.addComponent(
          new LayoutMotion(
            new Map([
              ['flowDirection', staticProperty('string', flowDirection)],
              ['focusPosition', staticProperty('string', 'center')],
            ]),
          ),
        );
        const first = page.addChild(new Row(`row:first:${flowDirection}`));
        first.state = 'current';
        first.addChild(makeWord(`word:first:${flowDirection}`, 'FIRST'));
        const second = page.addChild(new Row(`row:second:${flowDirection}`));
        second.state = 'next';
        second.addChild(makeWord(`word:second:${flowDirection}`, 'SECOND'));
        root.addChild(page);
        layoutScene(root, new Canvas(16, 16).getContext('2d'), ctx(), { width: 800, height: 300 });
        return { first, second };
      };

      const topToBottom = createPage('topToBottom');
      const bottomToTop = createPage('bottomToTop');

      assert.ok(topToBottom.first.box.y > topToBottom.second.box.y);
      assert.ok(bottomToTop.first.box.y < bottomToTop.second.box.y);
    });
  },

  () => {
    test('LayoutMotion flips horizontal word flow and focus-position mapping', () => {
      const leftToRight = makeLine([makeWord('first:ltr', 'first'), makeWord('second:ltr', 'second')]);
      const rightToLeft = makeLine([makeWord('first:rtl', 'first'), makeWord('second:rtl', 'second')]);
      const motionProps = (flowDirection) =>
        new Map([
          ['flowDirection', staticProperty('string', flowDirection)],
          ['focusPosition', staticProperty('number', 0.5)],
        ]);
      leftToRight.row.addComponent(new LayoutMotion(motionProps('leftToRight')));
      rightToLeft.row.addComponent(new LayoutMotion(motionProps('rightToLeft')));
      leftToRight.row.children[0].state = 'current';
      rightToLeft.row.children[0].state = 'current';

      layoutScene(leftToRight.root, new Canvas(16, 16).getContext('2d'), ctx(), { width: 800, height: 300 });
      layoutScene(rightToLeft.root, new Canvas(16, 16).getContext('2d'), ctx(), { width: 800, height: 300 });

      assert.ok(leftToRight.row.children[0].box.x > leftToRight.row.children[1].box.x);
      assert.ok(rightToLeft.row.children[0].box.x < rightToLeft.row.children[1].box.x);

      applyLayoutMotion(leftToRight.root, ctx({ deltaSeconds: 1 / 60 }), new LayoutMotionRuntime(), 'page:0');
      applyLayoutMotion(rightToLeft.root, ctx({ deltaSeconds: 1 / 60 }), new LayoutMotionRuntime(), 'page:0');
      assert.ok(leftToRight.row.box.x < rightToLeft.row.box.x);
    });
  },

  () => {
    test('Row LayoutMotion spring converges when the current word changes', () => {
      const root = new CompositionArea('compositionArea');
      const row = new Row('row');
      row.box = { x: 0, y: 0, width: 300, height: 40 };
      row.addComponent(new LayoutMotion());
      const first = row.addChild(new Word('first'));
      first.state = 'current';
      first.box = { x: 20, y: 0, width: 40, height: 20 };
      const second = row.addChild(new Word('second'));
      second.state = 'next';
      second.box = { x: 100, y: 0, width: 40, height: 20 };
      root.addChild(row);
      const runtime = new LayoutMotionRuntime();

      applyLayoutMotion(root, ctx({ deltaSeconds: 1 / 60 }), runtime, 'page:0');
      first.state = 'next';
      second.state = 'current';
      const firstStep = ctx({ deltaSeconds: 1 / 60 });
      applyLayoutMotion(root, firstStep, runtime, 'page:0');
      assert.ok(row.box.x > 30 && row.box.x < 110);

      for (let frame = 0; frame < 240; frame += 1) {
        applyLayoutMotion(root, firstStep, runtime, 'page:0');
      }
      assert.ok(Math.abs(row.box.x - 30) < 0.01);
    });
  },

  () => {
    test('Page and row LayoutMotion preserve independent vertical and horizontal offsets', () => {
      const root = new CompositionArea('compositionArea');
      const page = new Page('page');
      page.box = { x: 0, y: 0, width: 400, height: 300 };
      page.addComponent(new LayoutMotion(new Map([['focusPosition', staticProperty('number', 0.5)]])));
      const row = page.addChild(new Row('row'));
      row.state = 'current';
      row.box = { x: 0, y: 0, width: 300, height: 40 };
      row.addComponent(new LayoutMotion(new Map([['focusPosition', staticProperty('number', 0.5)]])));
      const current = row.addChild(new Word('current'));
      current.state = 'current';
      current.box = { x: 20, y: 0, width: 40, height: 20 };
      root.addChild(page);

      applyLayoutMotion(root, ctx({ deltaSeconds: 1 / 60 }), new LayoutMotionRuntime(), 'page:0');

      assert.equal(row.box.x, 160);
      assert.equal(row.box.y, 130);
      assert.equal(current.box.x, 180);
      assert.equal(current.box.y, 130);
    });
  },

  () => {
    test('Apple Music preset parses with page layout motion and a five-row window', () => {
      const preset = loadEcsPreset('apple-music.json');
      const template = buildEcsTreeFromPreset(preset);
      const page = template.compositionArea.children.find((child) => child instanceof Page);
      assert.ok(page);
      const layoutMotion = page.getComponent('layoutMotion');
      assert.ok(layoutMotion instanceof LayoutMotion);
      assert.equal(layoutMotion.getProp('flowDirection')?.resolve(ctx()), 'bottomToTop');
      assert.equal(layoutMotion.getProp('focusPosition')?.resolve(ctx()), 'center');
      assert.equal(layoutMotion.motionScope(ctx()), 'perChild');
      assert.equal(layoutMotion.motionType(ctx()), 'spring');
      assert.equal(layoutMotion.timingMode(ctx()), 'adaptive');
      assert.equal(layoutMotion.easing(ctx()), 'easeInOut');
      assert.equal(layoutMotion.staggerDelaySeconds(ctx()), 1);
      const pageAnimations = page.components.filter((component) => component.type === 'animation');
      assert.deepEqual(
        pageAnimations.map((component) => component.definition.phase),
        ['enter', 'exit'],
      );
      assert.deepEqual(
        pageAnimations.map((component) => component.definition.tracks[0].target),
        ['Transform.opacity', 'Transform.opacity'],
      );
      assert.equal(preset.stateWindow.previousRows.count, 2);
      assert.equal(preset.stateWindow.nextRows.count, 2);
      assert.deepEqual(preset.captionLayout.breaking.pauseSpacing, {
        enabled: true,
        thresholdSeconds: 0.8,
        extraSpacing: 32,
        maxExtraSpacing: 64,
      });

      const scene = instantiateScene(template, {
        rows: [['ONE'], ['TWO'], ['THREE'], ['FOUR'], ['FIVE']],
        currentIndex: 2,
        stateWindow: preset.stateWindow,
      });
      const scenePage = scene.compositionArea.children.find((child) => child instanceof Page);
      assert.equal(scenePage.children.length, 5);
      assert.equal(scenePage.children.filter((child) => child.state === 'current').length, 1);
    });
  },

  () => {
    test('Adaptive Apple Music motion keeps the full page crop when timestamps are close', async () => {
      const preset = loadEcsPreset('apple-music.json');
      const words = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN'];
      const starts = words.map((_, index) => index * 0.22);
      const ends = starts.map((start) => start + 0.3);
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
        fps: 24,
        debug: true,
        collectFrames: false,
      });

      assert.ok(result.frameSize.width <= 1080);
      assert.equal(result.frameSize.height, 1920);
      for (const frame of result.debugLayout.frames) {
        assert.ok(frame.rows.every((row) => row.top >= frame.page.top && row.bottom <= frame.page.bottom));
      }
    });
  },

  () => {
    test('GaussianBlurEffect / MotionBlurEffect report margins', () => {
      const blur = new GaussianBlurEffect(new Map([['blurRadius', staticProperty('number', 8)]]));
      assert.deepEqual(blur.getMargins(ctx({})), { x: 8, y: 8 });

      const motion = new MotionBlurEffect(
        new Map([
          ['distance', staticProperty('number', 5)],
          ['steps', staticProperty('number', 3)],
        ]),
        true,
      );
      assert.deepEqual(motion.getMargins(ctx({})), { x: 15, y: 0 });
    });
  },

  () => {
    test('Motion Blur and Streak cap sample amount at the engine limit', () => {
      const motion = new MotionBlurEffect(
        new Map([
          ['distance', staticProperty('number', 2)],
          ['steps', staticProperty('number', MAX_MOTION_BLUR_STEPS + 100)],
        ]),
      );
      const streak = new StreakEffect(
        new Map([
          ['distance', staticProperty('number', 2)],
          ['steps', staticProperty('number', MAX_MOTION_BLUR_STEPS + 100)],
        ]),
      );
      assert.deepEqual(motion.getMargins(ctx({})), { x: MAX_MOTION_BLUR_STEPS * 2, y: 0 });
      assert.deepEqual(streak.getMargins(ctx({})), { x: MAX_MOTION_BLUR_STEPS * 2, y: 0 });
    });
  },

  () => {
    test('MotionBlurEffect margins follow animated sample amount and composition scale', () => {
      const effect = new MotionBlurEffect(
        new Map([
          ['distance', staticProperty('number', 2)],
          ['angle', staticProperty('number', 90)],
          ['steps', staticProperty('number', 0)],
        ]),
      );
      const steps = effect.getProp('steps');
      const animatedContext = ctx({
        compositionScale: 0.5,
        animationOverrides: new Map([[steps, 32]]),
      });

      const margins = effect.getMargins(animatedContext);
      assert.ok(margins.x < 1e-9);
      assert.equal(margins.y, 32);
    });
  },

  () => {
    test('MotionBlurEffect renders one step and rotates multiple steps', () => {
      const singleStep = new MotionBlurEffect(
        new Map([
          ['distance', staticProperty('number', 8)],
          ['angle', staticProperty('number', 0)],
          ['steps', staticProperty('number', 1)],
          ['maxOpacity', staticProperty('number', 1)],
        ]),
        false,
      );
      const singleCanvas = new Canvas(48, 48);
      const singleContext = singleCanvas.getContext('2d');
      singleStep.apply(singleContext, ctx({}), () => singleContext.fillRect(20, 20, 2, 2));
      assert.ok(singleContext.getImageData(20, 20, 1, 1).data[3] > 0);

      const vertical = new MotionBlurEffect(
        new Map([
          ['distance', staticProperty('number', 8)],
          ['angle', staticProperty('number', 90)],
          ['steps', staticProperty('number', 2)],
          ['maxOpacity', staticProperty('number', 1)],
        ]),
        true,
      );
      const verticalCanvas = new Canvas(48, 48);
      const verticalContext = verticalCanvas.getContext('2d');
      vertical.apply(verticalContext, ctx({}), () => verticalContext.fillRect(20, 20, 2, 2));
      assert.ok(verticalContext.getImageData(20, 28, 1, 1).data[3] > 0);
      assert.equal(verticalContext.getImageData(28, 20, 1, 1).data[3], 0);
    });
  },

  () => {
    test('MotionBlurEffect blur amount changes rendered pixels', () => {
      const render = (steps) => {
        const effect = new MotionBlurEffect(
          new Map([
            ['distance', staticProperty('number', 2)],
            ['angle', staticProperty('number', 0)],
            ['steps', staticProperty('number', steps)],
            ['maxOpacity', staticProperty('number', 1)],
          ]),
        );
        const canvas = new Canvas(80, 40);
        const context = canvas.getContext('2d');
        effect.apply(context, ctx({}), () => context.fillRect(36, 18, 8, 4));
        return context.getImageData(0, 0, 80, 40).data;
      };

      const light = render(0);
      const strong = render(32);
      let changedPixels = 0;
      for (let index = 0; index < light.length; index += 4) {
        if (
          light[index] !== strong[index] ||
          light[index + 1] !== strong[index + 1] ||
          light[index + 2] !== strong[index + 2] ||
          light[index + 3] !== strong[index + 3]
        ) {
          changedPixels += 1;
        }
      }
      assert.ok(changedPixels > 0);
    });
  },

  () => {
    test('interpolatorFor: Paint blends, string steps', () => {
      const colorInterp = interpolatorFor('paint');
      assert.equal(typeof colorInterp, 'function');
      assert.deepEqual(
        colorInterp(solidPaint('#000000'), solidPaint('#ffffff'), 0.5),
        solidPaint('rgba(128, 128, 128, 1)'),
      );
      const stringInterp = interpolatorFor('string');
      assert.equal(stringInterp, undefined);
    });
  },

  () => {
    test('font weight transitions interpolate numeric weights', () => {
      const weightInterp = interpolatorFor('fontWeight');
      assert.equal(typeof weightInterp, 'function');
      assert.equal(weightInterp(400, 700, 0.5), 550);

      const runtime = new TransitionRuntime();
      const config = { enabled: true, type: 'tween', durationSeconds: 1, easeType: 'linear' };
      assert.equal(runtime.resolve('font.weight', 'fontWeight', 400, config, 0), 400);
      assert.equal(runtime.resolve('font.weight', 'fontWeight', 700, config, 0), 400);
      assert.equal(runtime.resolve('font.weight', 'fontWeight', 700, config, 0.5), 550);
      assert.equal(runtime.resolve('font.weight', 'fontWeight', 700, config, 1), 700);
    });
  },

  () => {
    test('TransitionRuntime interpolates and retargets from the displayed value', () => {
      const runtime = new TransitionRuntime();
      const config = { enabled: true, type: 'tween', durationSeconds: 1, easeType: 'linear' };
      assert.equal(runtime.resolve('position.x', 'number', 0, config, 0), 0);
      assert.equal(runtime.resolve('position.x', 'number', 10, config, 0), 0);
      assert.equal(runtime.resolve('position.x', 'number', 10, config, 0.5), 5);
      assert.equal(runtime.resolve('position.x', 'number', 20, config, 0.5), 5);
      assert.equal(runtime.resolve('position.x', 'number', 20, config, 1), 12.5);
    });
  },

  () => {
    test('TransitionRuntime can animate first appearance from an explicit value', () => {
      const runtime = new TransitionRuntime();
      const config = {
        enabled: true,
        type: 'tween',
        durationSeconds: 1,
        easeType: 'linear',
        startValue: 'explicit',
        initialBehavior: 'transition',
        initialValue: 0,
      };

      assert.equal(runtime.resolve('blur.radius', 'number', 20, config, 0), 0);
      assert.equal(runtime.resolve('blur.radius', 'number', 20, config, 0.5), 10);
      assert.equal(runtime.resolve('blur.radius', 'number', 20, config, 1), 20);
    });
  },

  () => {
    test('TransitionRuntime can start a retarget from the previous settled state', () => {
      const runtime = new TransitionRuntime();
      const config = {
        enabled: true,
        type: 'tween',
        durationSeconds: 1,
        easeType: 'linear',
        startValue: 'previousState',
      };

      assert.equal(runtime.resolve('position.x', 'number', 0, config, 0), 0);
      assert.equal(runtime.resolve('position.x', 'number', 10, config, 0), 0);
      assert.equal(runtime.resolve('position.x', 'number', 10, config, 0.5), 5);
      assert.equal(runtime.resolve('position.x', 'number', 20, config, 0.5), 10);
      assert.equal(runtime.resolve('position.x', 'number', 20, config, 1), 15);
      assert.equal(runtime.resolve('position.x', 'number', 20, config, 1.5), 20);
    });
  },

  () => {
    test('TransitionRuntime defaults an omitted duration to 0.125 seconds', () => {
      const runtime = new TransitionRuntime();
      const config = { enabled: true, type: 'tween', easeType: 'linear' };

      assert.equal(runtime.resolve('position.x', 'number', 0, config, 0), 0);
      assert.equal(runtime.resolve('position.x', 'number', 10, config, 0), 0);
      assert.equal(runtime.resolve('position.x', 'number', 10, config, 0.0625), 5);
      assert.equal(runtime.resolve('position.x', 'number', 10, config, 0.125), 10);
    });
  },

  () => {
    test('disabled component and effect branches skip animation and transition interpolation', () => {
      const transition = { enabled: true, type: 'tween', durationSeconds: 1, easeType: 'linear' };
      const position = staticProperty('vector2', { x: 0, y: 0 }, undefined, { transition });
      const transform = new Transform(
        new Map([
          ['enabled', staticProperty('boolean', true)],
          ['position', position],
        ]),
      );
      const nestedColor = staticProperty('paint', solidPaint('white'));
      const nestedText = new Text(
        new Map([
          ['enabled', staticProperty('boolean', true)],
          ['color', nestedColor],
        ]),
      );
      transform.components.push(nestedText);
      const blurRadius = staticProperty('number', 4, undefined, { transition });
      const blur = new GaussianBlurEffect(
        new Map([
          ['enabled', staticProperty('boolean', true)],
          ['blurRadius', blurRadius],
        ]),
      );
      blur.id = 'blur-1';
      const word = new Word('disabled-animation-word');
      word.addComponent(transform);
      word.addEffect(blur);
      word.addComponent(
        new AnimationComponent({
          enabled: true,
          durationSeconds: 1,
          tracks: [
            {
              enabled: true,
              target: 'Transform.position',
              keyframes: [
                { time: 0, value: { x: 0, y: 0 } },
                { time: 1, value: { x: 100, y: 0 } },
              ],
            },
            {
              enabled: true,
              target: 'Blur#blur-1.blurRadius',
              keyframes: [
                { time: 0, value: 4 },
                { time: 1, value: 20 },
              ],
            },
            {
              enabled: true,
              target: 'Text.color',
              keyframes: [
                { time: 0, value: solidPaint('white') },
                { time: 1, value: solidPaint('red') },
              ],
            },
          ],
        }),
      );

      const runtime = new TransitionRuntime();
      const transitionContext = (time) =>
        prepareTransitionContext(
          word,
          defaultResolveContext({ transitionRuntime: runtime, transitionTimeSeconds: time }),
        );

      assert.deepEqual(position.resolve(transitionContext(0)), { x: 0, y: 0 });
      assert.equal(blurRadius.resolve(transitionContext(0)), 4);
      position.setBase({ x: 100, y: 0 });
      blurRadius.setBase(20);
      assert.deepEqual(position.resolve(transitionContext(0.5)), { x: 0, y: 0 });
      assert.equal(blurRadius.resolve(transitionContext(0.5)), 4);

      transform.getProp('enabled').setBase(false);
      blur.getProp('enabled').setBase(false);
      const animationContext = prepareAnimationContext(
        word,
        defaultResolveContext({ elapsedSeconds: 0.5, wordDurationSeconds: 1 }),
      );
      assert.equal(animationContext.animationOverrides?.has(position) ?? false, false);
      assert.equal(animationContext.animationOverrides?.has(blurRadius) ?? false, false);
      assert.equal(animationContext.animationOverrides?.has(nestedColor) ?? false, false);

      assert.deepEqual(position.resolve(transitionContext(0.6)), { x: 100, y: 0 });
      assert.equal(blurRadius.resolve(transitionContext(0.6)), 20);

      transform.getProp('enabled').setBase(true);
      blur.getProp('enabled').setBase(true);
      nestedText.getProp('enabled').setBase(false);
      const disabledTargetOwnerContext = prepareAnimationContext(
        word,
        defaultResolveContext({ elapsedSeconds: 0.5, wordDurationSeconds: 1 }),
      );
      assert.equal(disabledTargetOwnerContext.animationOverrides?.has(nestedColor) ?? false, false);

      nestedText.getProp('enabled').setBase(true);
      const enabledTargetContext = prepareAnimationContext(
        word,
        defaultResolveContext({ elapsedSeconds: 0.5, wordDurationSeconds: 1 }),
      );
      assert.equal(enabledTargetContext.animationOverrides?.has(nestedColor) ?? false, true);
      assert.deepEqual(position.resolve(transitionContext(0.7)), { x: 100, y: 0 });
      assert.equal(blurRadius.resolve(transitionContext(0.7)), 20);
    });
  },

  () => {
    test('WipeReveal follows a transitioned Word position in its mask bounds', () => {
      const row = new Row('row:wipe-transition');
      row.box = { x: 20, y: 20, width: 260, height: 47 };
      const word = new Word('word:wipe-transition', 'on');
      word.box = { x: 100, y: 26, width: 80, height: 35 };
      word.layoutPosition = { x: 0, y: 0 };
      const position = staticProperty('vector2', { x: 0, y: -2 }, undefined, {
        transition: { enabled: true, type: 'tween', durationSeconds: 0.2, easeType: 'linear' },
      });
      word.addComponent(new Transform(new Map([['position', position]])));
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
            ['shape', staticProperty('string', 'rectangle')],
            ['fromStyle', staticProperty('string', 'none')],
            ['basePlacement', staticProperty('string', 'none')],
          ]),
        ),
      );
      row.addChild(word);

      const originalApply = WipeRevealEffect.prototype.apply;
      let capturedBounds;
      try {
        WipeRevealEffect.prototype.apply = function captureTransitionBounds(context, resolveContext, draw, options) {
          capturedBounds = options?.paintBounds ? { ...options.paintBounds } : undefined;
          return originalApply.call(this, context, resolveContext, draw, options);
        };
        renderScene(row, new Canvas(300, 160).getContext('2d'), ctx());
      } finally {
        WipeRevealEffect.prototype.apply = originalApply;
      }

      assert.deepEqual(capturedBounds, { x: 100, y: 16, width: 80, height: 51 });
    });
  },

  () => {
    test('WipeRevealEffect reveal is driven by the linked Animation component', () => {
      const word = new Word('word:wipe-animation');
      word.lifecycle = 'incoming';
      const wipe = word.addEffect(new WipeRevealEffect());
      wipe.id = 'wipe-animation';
      word.addComponent(
        new AnimationComponent({
          phase: 'enter',
          scope: 'self',
          durationSeconds: 0.3,
          triggerBehavior: 'adaptive',
          tracks: [
            {
              enabled: true,
              target: 'WipeReveal#wipe-animation.reveal',
              keyframes: [
                { time: 0, value: 0, curve: 'linear' },
                { time: 0.3, value: 1 },
              ],
            },
          ],
        }),
      );

      const animatedContext = prepareAnimationContext(word, ctx({ lifecycle: 'incoming', elapsedSeconds: 0.15 }));

      assert.equal(wipe.reveal(animatedContext), 0.5);
    });
  },

  () => {
    test('ECS Wipe Reveal preserves its effect properties and linked animation target', () => {
      const design = canonicalViewport({
        entity: 'compositionArea',
        id: 'compositionArea',
        children: [
          {
            entity: 'page',
            id: 'page',
            components: [
              { component: 'transform' },
              {
                component: 'animation',
                enabled: true,
                name: 'Wipe Reveal',
                phase: 'enter',
                scope: 'self',
                durationSeconds: 0.3,
                delaySeconds: 0,
                triggerBehavior: 'adaptive',
                sequencer: { pattern: 'simultaneous', interval: 0, reverse: false, seed: 0 },
                tracks: [
                  {
                    enabled: true,
                    target: 'WipeReveal#wipe-1.reveal',
                    keyframes: [
                      { time: 0, value: 0 },
                      { time: 0.3, value: 1 },
                    ],
                  },
                ],
              },
            ],
            effects: [
              {
                effect: 'wipeReveal',
                id: 'wipe-1',
                props: {
                  reveal: { type: 'number', value: 0.5 },
                  direction: { type: 'string', value: 'logicalStartToEnd' },
                  fromStyle: { type: 'string', value: 'next' },
                  toStyle: { type: 'string', value: 'current' },
                  basePlacement: { type: 'string', value: 'back' },
                },
              },
            ],
          },
        ],
      });
      const tree = buildEcsTree(design);
      const page = tree.findById('page');
      const effect = page.effects.find((candidate) => candidate instanceof WipeRevealEffect);
      const animation = page.getComponent('animation');
      const serialized = serializeEntityTree(tree);
      const serializedPage = serialized.children.find((child) => child.id === 'compositionArea').children[0];

      assert.ok(effect);
      assert.equal(effect.reveal(ctx()), 0.5);
      assert.equal(animation.definition.tracks[0].target, 'WipeReveal#wipe-1.reveal');
      assert.equal(serializedPage.effects[0].effect, 'wipeReveal');
      assert.equal(serializedPage.effects[0].props.reveal.value, 0.5);
      assert.equal(
        serializedPage.components.find((component) => component.component === 'animation').tracks[0].target,
        'WipeReveal#wipe-1.reveal',
      );
    });
  },

  () => {
    test('TypewriterEffect reveal and nested cursor properties accept Animation V2 overrides', () => {
      const effect = new TypewriterEffect(
        new Map([
          ['revealMode', staticProperty('string', 'lifecycle')],
          ['reveal', staticProperty('number', 1)],
          ['cursor.blink.rate', staticProperty('number', 2)],
        ]),
      );
      effect.id = 'tw';
      const text = new Text();
      text.addEffect(effect);
      const word = new Word('word');
      word.lifecycle = 'static';
      word.text = 'ABCD';
      word.addComponent(text);
      word.addComponent(
        new AnimationComponent({
          phase: 'custom',
          durationSeconds: 1,
          tracks: [
            {
              enabled: true,
              target: 'Typewriter#tw.reveal',
              keyframes: [
                { time: 0, value: 0 },
                { time: 1, value: 1 },
              ],
            },
            {
              enabled: true,
              target: 'Typewriter#tw.cursor.blink.rate',
              keyframes: [
                { time: 0, value: 0 },
                { time: 1, value: 4 },
              ],
            },
          ],
        }),
      );
      const animationContext = prepareAnimationContext(word, defaultResolveContext({ elapsedSeconds: 0.25 }));
      const canvas = new Canvas(1, 1);
      const layout = effect.buildLayout(canvas.getContext('2d'), animationContext, word.text, solidPaint('white'));

      assert.equal(layout.reveal, 0.25);
      assert.equal(effect.getProp('cursor.blink.rate').resolve(animationContext), 1);
    });
  },

  () => {
    test('TypewriterEffect reveal accepts transition overrides', () => {
      const effect = new TypewriterEffect(
        new Map([
          ['revealMode', staticProperty('string', 'lifecycle')],
          [
            'reveal',
            buildProperty({
              type: 'number',
              value: 0,
              transition: { enabled: true, type: 'tween', durationSeconds: 1, easeType: 'linear' },
            }),
          ],
        ]),
      );
      effect.id = 'tw';
      const text = new Text();
      text.addEffect(effect);
      const word = new Word('word');
      word.lifecycle = 'static';
      word.addComponent(text);
      const runtime = new TransitionRuntime();

      prepareTransitionContext(word, defaultResolveContext({ transitionRuntime: runtime, transitionTimeSeconds: 0 }));
      effect.getProp('reveal').setBase(1);
      prepareTransitionContext(word, defaultResolveContext({ transitionRuntime: runtime, transitionTimeSeconds: 0 }));
      const transitionContext = prepareTransitionContext(
        word,
        defaultResolveContext({ transitionRuntime: runtime, transitionTimeSeconds: 0.5 }),
      );
      const layout = effect.buildLayout(
        new Canvas(1, 1).getContext('2d'),
        transitionContext,
        'ABCD',
        solidPaint('white'),
      );

      assert.ok(layout.reveal > 0 && layout.reveal < 1, `expected an interpolated reveal, received ${layout.reveal}`);
    });
  },

  () => {
    test('position randomizers can keep preset entities inside their parent bounds', () => {
      const preset = loadEcsPreset('no-context.json');
      const template = buildEcsTree(preset.design);
      const canvas = new Canvas(1080, 1920);

      for (const randomizerKey of ['page:0', 'page:1', 'page:2']) {
        const scene = instantiateScene(template, {
          rows: [['one']],
          currentIndex: 0,
          stateWindow: preset.stateWindow,
        });
        const context = defaultResolveContext({ randomizerKey });
        layoutScene(scene, canvas.getContext('2d'), context, { width: 1080, height: 1920 });

        const parent = scene.compositionArea.box;
        const bounds = contentBoxFromArea(parent, scene.compositionArea.layout, context);
        const page = scene.compositionArea.children[0].box;
        assert.ok(parent && page);
        assert.ok(page.x >= bounds.x);
        assert.ok(page.y >= bounds.y);
        assert.ok(page.x + page.width <= bounds.x + bounds.width);
        assert.ok(page.y + page.height <= bounds.y + bounds.height);

        const pageEntity = scene.compositionArea.children[0];
        const pageContent = contentBoxFromArea(page, pageEntity.layout, context);
        const row = pageEntity.children[0].box;
        assert.ok(row);
        assert.ok(row.x >= pageContent.x);
        assert.ok(row.y >= pageContent.y);
        assert.ok(row.x + row.width <= pageContent.x + pageContent.width);
        assert.ok(row.y + row.height <= pageContent.y + pageContent.height);
      }
    });
  },

  () => {
    test('all ECS preset effect IDs are scoped hashes and animation targets resolve', () => {
      const scopedEffectId = /^[a-zA-Z0-9_-]+-[0-9a-f]{16}:[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+$/;
      for (const name of ECS_PRESET_NAMES) {
        const preset = loadEcsPreset(name);
        const effectIds = new Set();
        const animationTargets = [];
        const visitComponent = (component) => {
          for (const effect of component.effects ?? []) {
            assert.match(effect.id, scopedEffectId, `${name} has an unscoped effect ID`);
            assert.equal(effectIds.has(effect.id), false, `${name} reuses effect ID ${effect.id}`);
            effectIds.add(effect.id);
          }
          if (component.animation?.tracks) {
            animationTargets.push(...component.animation.tracks.map((track) => track.target));
          }
          for (const child of component.components ?? []) visitComponent(child);
        };
        const visitEntity = (entity) => {
          for (const effect of entity.effects ?? []) {
            assert.match(effect.id, scopedEffectId, `${name} has an unscoped effect ID`);
            assert.equal(effectIds.has(effect.id), false, `${name} reuses effect ID ${effect.id}`);
            effectIds.add(effect.id);
          }
          for (const component of entity.components ?? []) visitComponent(component);
          for (const child of entity.children ?? []) visitEntity(child);
        };
        visitEntity(preset.design);
        for (const target of animationTargets) {
          const match = target.match(/#([^.]+)\./);
          if (match) assert.equal(effectIds.has(match[1]), true, `${name} targets missing effect ID ${match[1]}`);
        }
      }
    });
  },

  () => {
    test('row fitting resolves animated and transitioned font sizes without changing authored values', () => {
      const line = makeFixedLine([makeWord('word', 'ANIMATED', { size: 70 })], 180);
      const word = line.row.children[0];
      const sizeProperty = word.getComponent('text').font().getProp('size');
      const rowFontFit = { mode: 'shrink-to-fit', minScale: 0.5, maxScale: 1.25 };

      layoutFixedLine(line, rowFontFit, 180, 240, ctx({ animationOverrides: new Map([[sizeProperty, 120]]) }));
      const animatedScale = word.fontScale;
      const animatedSize = word.getComponent('text').font().size(word.contextFor(ctx()));

      layoutFixedLine(line, rowFontFit, 180, 240, ctx({ transitionOverrides: new Map([[sizeProperty, 40]]) }));

      assert.equal(sizeProperty.base, 70);
      assert.ok(animatedScale < 1);
      assert.ok(animatedSize > 0);
      assert.notEqual(word.fontScale, animatedScale);
    });
  },

  () => {
    test('RTL layout keeps Layout Motion and spacer flow in logical order', () => {
      const { root, row } = makeLine([
        makeWord('word:current', 'مرحبا', { size: 40 }),
        makeWord('word:next', 'بالعالم', { size: 40 }),
      ]);
      row.children[0].state = 'current';
      row.children[1].state = 'next';
      row.addComponent(
        new HorizontalSpacer(
          new Map([
            ['enabled', staticProperty('boolean', true)],
            ['spacing', staticProperty('number', 20)],
            ['unit', staticProperty('string', 'pt')],
          ]),
        ),
      );
      row.addComponent(new LayoutMotion(new Map([['focusPosition', staticProperty('number', 0.5)]])));
      const renderContext = ctx({ textDirection: 'rtl' });

      layoutScene(root, new Canvas(16, 16).getContext('2d'), renderContext, {
        width: 800,
        height: 240,
        textDirection: 'rtl',
      });
      applyLayoutMotion(root, renderContext, new LayoutMotionRuntime(), 'page:rtl');

      assert.ok(row.children[0].box.x > row.children[1].box.x);
      assert.ok(row.children[0].box.x - (row.children[1].box.x + row.children[1].box.width) > 0);
    });
  },

  () => {
    test('Layout Motion preserves static and animated spacer gaps', () => {
      const root = new CompositionArea('compositionArea');
      const page = new Page('page');
      const firstRow = new Row('row:first');
      const secondRow = new Row('row:second');
      const firstWord = makeWord('word:first', 'First', { size: 40 });
      const secondWord = makeWord('word:second', 'Second', { size: 40 });
      const thirdWord = makeWord('word:third', 'Third', { size: 40 });
      const verticalSpacer = new VerticalSpacer(
        new Map([
          ['enabled', staticProperty('boolean', true)],
          ['spacing', staticProperty('number', 10)],
          ['unit', staticProperty('string', 'pt')],
        ]),
      );
      const horizontalSpacer = new HorizontalSpacer(
        new Map([
          ['enabled', staticProperty('boolean', true)],
          ['spacing', staticProperty('number', 10)],
          ['unit', staticProperty('string', 'pt')],
        ]),
      );

      firstRow.state = 'current';
      secondRow.state = 'next';
      firstRow.addChild(firstWord);
      firstRow.addChild(secondWord);
      secondRow.addChild(thirdWord);
      firstRow.addComponent(horizontalSpacer);
      firstRow.addComponent(
        new LayoutMotion(
          new Map([
            ['flowDirection', staticProperty('string', 'leftToRight')],
            ['focusPosition', staticProperty('string', 'center')],
          ]),
        ),
      );
      page.addComponent(verticalSpacer);
      page.addComponent(
        new LayoutMotion(
          new Map([
            ['flowDirection', staticProperty('string', 'topToBottom')],
            ['focusPosition', staticProperty('string', 'center')],
          ]),
        ),
      );
      page.addComponent(
        new AnimationComponent({
          phase: 'loop',
          durationSeconds: 1,
          tracks: [
            {
              enabled: true,
              target: 'VerticalSpacer.spacing',
              keyframes: [
                { time: 0, value: 10 },
                { time: 1, value: 90 },
              ],
            },
          ],
        }),
      );
      firstRow.addComponent(
        new AnimationComponent({
          phase: 'loop',
          durationSeconds: 1,
          tracks: [
            {
              enabled: true,
              target: 'HorizontalSpacer.spacing',
              keyframes: [
                { time: 0, value: 10 },
                { time: 1, value: 90 },
              ],
            },
          ],
        }),
      );
      page.addChild(firstRow);
      page.addChild(secondRow);
      root.addChild(page);

      const canvasContext = new Canvas(16, 16).getContext('2d');
      const settled = ctx({ elapsedSeconds: 0 });
      layoutScene(root, canvasContext, settled, {
        width: 800,
        height: 400,
        spacingContext: settled,
      });
      const initialVerticalGap = separatedGap(firstRow.box, secondRow.box, 'y');
      const initialHorizontalGap = separatedGap(firstWord.box, secondWord.box, 'x');
      const runtime = new LayoutMotionRuntime();

      applyLayoutMotion(root, settled, runtime, 'page:0');
      assert.equal(separatedGap(firstRow.box, secondRow.box, 'y'), initialVerticalGap);
      assert.equal(separatedGap(firstWord.box, secondWord.box, 'x'), initialHorizontalGap);

      const animated = ctx({ elapsedSeconds: 0.5 });
      layoutScene(root, canvasContext, settled, {
        width: 800,
        height: 400,
        spacingContext: animated,
      });
      runtime.resetBaselines(root);
      applyLayoutMotion(root, animated, runtime, 'page:0');

      assert.ok(separatedGap(firstRow.box, secondRow.box, 'y') > initialVerticalGap + 30);
      assert.ok(separatedGap(firstWord.box, secondWord.box, 'x') > initialHorizontalGap + 30);
    });
  },

  () => {
    test('disabled Layout Motion does not advance spring state or refresh geometry', () => {
      const root = new CompositionArea('compositionArea');
      const page = root.addChild(new Page('page'));
      const row = page.addChild(new Row('row'));
      row.state = 'current';
      row.addChild(makeWord('word', 'Current'));
      page.addComponent(new LayoutMotion(new Map([['enabled', staticProperty('boolean', false)]])));
      layoutScene(root, new Canvas(16, 16).getContext('2d'), ctx({}), { width: 400, height: 200 });

      class CountingLayoutMotionRuntime extends LayoutMotionRuntime {
        resolveCount = 0;

        resolve(...args) {
          this.resolveCount += 1;
          return super.resolve(...args);
        }
      }

      const runtime = new CountingLayoutMotionRuntime();
      applyLayoutMotion(root, ctx({}), runtime, 'page:disabled');
      assert.equal(runtime.resolveCount, 0);
    });
  },

  () => {
    test('FollowTarget resolves independent destination channels from target bounds', () => {
      const root = new CompositionArea('compositionArea');
      const target = root.addChild(makeWord('target', 'TARGET'));
      target.box = { x: 100, y: 40, width: 120, height: 30 };
      const follower = root.addChild(new BackgroundEntity('background:follower', target.id));
      const followTarget = follower.getComponent('followTarget');
      followTarget.props.get('mappings').setBase([
        { destination: 'Transform.position.x', source: 'bounds.x', offset: 8 },
        { destination: 'Transform.position.y', source: 'bounds.y', offset: 4 },
        { destination: 'Transform.width', source: 'bounds.width', offset: 16 },
        { destination: 'Transform.height', source: 'bounds.height', offset: 10 },
      ]);
      const context = prepareFollowContext(root, defaultResolveContext({}));
      assert.deepEqual(follower.transform.position(context), { x: 108, y: 44 });
      assert.deepEqual(follower.transform.getProp('dimensions').resolve(context), { x: 136, y: 40 });
    });
  },

  () => {
    test('FollowTarget constrains dimensions and opacity after applying offsets', () => {
      const root = new CompositionArea('compositionArea');
      const target = root.addChild(makeWord('target', 'TARGET'));
      target.box = { x: 100, y: 40, width: 120, height: 30 };
      target.addComponent(new Transform(new Map([['opacity', staticProperty('number', 0.8)]])));
      const follower = root.addChild(new BackgroundEntity('background:follower', target.id));
      follower
        .getComponent('followTarget')
        .props.get('mappings')
        .setBase([
          { destination: 'Transform.width', source: 'bounds.width', offset: -200 },
          { destination: 'Transform.opacity', source: 'transform.opacity', offset: 0.5 },
        ]);

      const context = prepareFollowContext(root, defaultResolveContext({}));
      assert.equal(follower.transform.getProp('dimensions').resolve(context).x, 0);
      assert.equal(follower.transform.opacity(context), 1);
    });
  },

  () => {
    test('FollowTarget keeps one mapping per destination', () => {
      const root = new CompositionArea('compositionArea');
      const target = root.addChild(makeWord('target', 'TARGET'));
      target.box = { x: 100, y: 40, width: 120, height: 30 };
      const follower = root.addChild(new BackgroundEntity('background:follower', target.id));
      follower
        .getComponent('followTarget')
        .props.get('mappings')
        .setBase([
          { destination: 'Transform.width', source: 'bounds.width' },
          { destination: 'Transform.width', source: 'bounds.width', offset: 20 },
        ]);

      const context = prepareFollowContext(root, defaultResolveContext({}));
      assert.equal(follower.transform.getProp('dimensions').resolve(context).x, 120);
    });
  },

  () => {
    test('FollowTarget creates implicit Transform destinations when defaults are omitted', () => {
      const root = new CompositionArea('compositionArea');
      const target = root.addChild(makeWord('target', 'TARGET'));
      target.box = { x: 100, y: 40, width: 120, height: 30 };
      const follower = root.addChild(new BackgroundEntity('background:implicit', null, false));
      follower.addComponent(new Transform(new Map([['dimensions', staticProperty('vector2', { x: 100, y: 100 })]])));
      follower.addComponent(
        new FollowTarget(
          new Map([
            ['target', staticProperty('string', 'entity')],
            ['targetId', staticProperty('string', target.id)],
            ['anchor', staticProperty('string', 'topLeft')],
            [
              'mappings',
              staticProperty('array', [
                { destination: 'Transform.position.x', source: 'bounds.x' },
                { destination: 'Transform.position.y', source: 'bounds.y' },
              ]),
            ],
          ]),
        ),
      );

      const context = prepareFollowContext(root, defaultResolveContext({}));
      assert.deepEqual(follower.transform.position(context), { x: 100, y: 40 });
    });
  },

  () => {
    test('BackgroundEntity uses the generic semantic FollowTarget during layout', () => {
      const words = [makeWord('w0', 'PREVIOUS'), makeWord('w1', 'CURRENT')];
      words[0].state = 'previous';
      words[1].state = 'current';
      const { root, row } = makeLine(words);
      const background = row.addChild(new BackgroundEntity('background:current', null, false));
      background.addComponent(new Transform(new Map([['dimensions', staticProperty('vector2', { x: 100, y: 100 })]])));
      background.addComponent(
        new FollowTarget(
          new Map([
            ['target', staticProperty('string', 'currentWord')],
            ['anchor', staticProperty('string', 'topLeft')],
            [
              'mappings',
              staticProperty('array', [
                { destination: 'Transform.position.x', source: 'bounds.x' },
                { destination: 'Transform.position.y', source: 'bounds.y' },
                { destination: 'Transform.width', source: 'bounds.width' },
                { destination: 'Transform.height', source: 'bounds.height' },
              ]),
            ],
          ]),
        ),
      );

      layoutScene(root, new Canvas(16, 16).getContext('2d'), defaultResolveContext({}), {
        width: 1000,
        height: 400,
      });

      assert.equal(background.resolvedTarget, words[1]);
      assert.deepEqual(background.box, words[1].box);

      background.getComponent('followTarget').props.get('anchor').setBase('center');
      layoutScene(root, new Canvas(16, 16).getContext('2d'), defaultResolveContext({}), {
        width: 1000,
        height: 400,
      });
      assert.deepEqual(background.box, words[1].box);
    });
  },

  () => {
    test('FollowTarget resolves relative word and row states in their containing scopes', () => {
      const root = new CompositionArea('compositionArea');
      const page = new Page('page');
      const previousRow = new Row('row:previous');
      const currentRow = new Row('row:current');
      const nextRow = new Row('row:next');
      previousRow.state = 'previous';
      currentRow.state = 'current';
      nextRow.state = 'next';

      const previousWord = makeWord('word:previous', 'PREVIOUS');
      const currentWord = makeWord('word:current', 'CURRENT');
      const nextWord = makeWord('word:next', 'NEXT');
      previousWord.state = 'previous';
      currentWord.state = 'current';
      nextWord.state = 'next';
      currentRow.addChild(previousWord);
      currentRow.addChild(currentWord);
      currentRow.addChild(nextWord);
      page.addChild(previousRow);
      page.addChild(currentRow);
      page.addChild(nextRow);
      root.addChild(page);

      const resolve = (target) => {
        const component = new FollowTarget(new Map([['target', staticProperty('string', target)]]));
        return resolveFollowTarget(root, currentRow, component.resolveConfig(ctx()), ctx());
      };

      assert.equal(resolve('previousWord'), previousWord);
      assert.equal(resolve('currentWord'), currentWord);
      assert.equal(resolve('nextWord'), nextWord);
      assert.equal(resolve('previousRow'), previousRow);
      assert.equal(resolve('currentRow'), currentRow);
      assert.equal(resolve('nextRow'), nextRow);
      assert.equal(resolve('currentPage'), page);
    });
  },

  () => {
    test('FollowTarget timeline scope resolves adjacent Rows across a Page', () => {
      const root = new CompositionArea('compositionArea');
      const page = root.addChild(new Page('page'));
      const firstRow = page.addChild(new Row('row:first'));
      const secondRow = page.addChild(new Row('row:second'));
      firstRow.state = 'previous';
      secondRow.state = 'current';
      const lastWord = firstRow.addChild(makeWord('word:last', 'LAST'));
      const currentWord = secondRow.addChild(makeWord('word:first', 'FIRST'));
      lastWord.state = 'previous';
      currentWord.state = 'current';
      firstRow.box = { x: 100, y: 100, width: 120, height: 40 };
      secondRow.box = { x: 100, y: 180, width: 140, height: 40 };
      lastWord.box = { x: 100, y: 100, width: 120, height: 40 };
      currentWord.box = { x: 100, y: 180, width: 140, height: 40 };

      const follow = new FollowTarget(
        new Map([
          ['target', staticProperty('string', 'previousWord')],
          ['targetScope', staticProperty('string', 'timeline')],
        ]),
      );
      root.addComponent(follow);

      assert.equal(resolveFollowTarget(root, root, follow.resolveConfig(ctx()), ctx()), lastWord);
    });
  },

  () => {
    test('FollowTarget Auto mode detects timeline targets and delays mapped values', () => {
      const root = new CompositionArea('compositionArea');
      const target = root.addChild(makeWord('target', 'TARGET'));
      target.box = { x: 10, y: 20, width: 100, height: 30 };
      const follower = root.addChild(new BackgroundEntity('background:delayed', null, false));
      follower.addComponent(
        new Transform(
          new Map([
            ['position', staticProperty('vector2', { x: 0, y: 0 })],
            ['dimensions', staticProperty('vector2', { x: 10, y: 10 })],
          ]),
        ),
      );
      const follow = follower.addComponent(
        new FollowTarget(
          new Map([
            ['mode', staticProperty('string', 'auto')],
            ['delaySeconds', staticProperty('number', 1)],
            ['target', staticProperty('string', 'entity')],
            ['targetId', staticProperty('string', target.id)],
            ['anchor', staticProperty('string', 'topLeft')],
            [
              'mappings',
              staticProperty('array', [
                { destination: 'Transform.position.x', source: 'bounds.x' },
                { destination: 'Transform.position.y', source: 'bounds.y' },
              ]),
            ],
          ]),
        ),
      );
      const runtime = createFollowRuntime();
      const resolvePosition = (time) => {
        const context = prepareFollowContext(
          root,
          defaultResolveContext({ followRuntime: runtime, transitionTimeSeconds: time }),
        );
        return follower.transform.position(context);
      };

      assert.equal(resolveFollowMode(follow.resolveConfig(defaultResolveContext({})), target), 'timeline');
      assert.deepEqual(resolvePosition(0), { x: 10, y: 20 });

      target.box = { x: 30, y: 40, width: 100, height: 30 };
      assert.deepEqual(resolvePosition(0.5), { x: 10, y: 20 });
      assert.deepEqual(resolvePosition(1.5), { x: 30, y: 40 });

      assert.equal(resolveFollowMode(follow.resolveConfig(defaultResolveContext({})), root), 'live');
    });
  },

  () => {
    test('FollowTarget snaps a timeline target handoff when transitions are not allowed', () => {
      const root = new CompositionArea('compositionArea');
      const page = root.addChild(new Page('page'));
      const firstRow = page.addChild(new Row('row:first'));
      const secondRow = page.addChild(new Row('row:second'));
      const firstWord = firstRow.addChild(makeWord('word:first', 'FIRST'));
      const secondWord = secondRow.addChild(makeWord('word:second', 'SECOND'));
      firstWord.state = 'current';
      secondWord.state = 'next';
      firstRow.state = 'current';
      secondRow.state = 'next';
      firstWord.box = { x: 100, y: 100, width: 80, height: 30 };
      secondWord.box = { x: 300, y: 200, width: 100, height: 30 };
      const follower = root.addChild(new BackgroundEntity('background:handoff'));
      const follow = follower.getComponent('followTarget');
      follow.props.get('target').setBase('currentWord');
      follow.props.get('targetScope').setBase('timeline');
      follow.props.get('boundaryHandoff').setBase('snap');
      follow.props.get('mappings').setBase([
        { destination: 'Transform.position.x', source: 'bounds.x' },
        { destination: 'Transform.position.y', source: 'bounds.y' },
      ]);
      const runtime = createFollowRuntime();
      const positionAt = (time) =>
        follower.transform.position(
          prepareFollowContext(root, defaultResolveContext({ followRuntime: runtime, transitionTimeSeconds: time })),
        );

      assert.deepEqual(positionAt(0), { x: 100, y: 100 });
      firstWord.state = 'previous';
      secondWord.state = 'current';
      firstRow.state = 'previous';
      secondRow.state = 'current';
      assert.deepEqual(positionAt(0.01), { x: 300, y: 200 });
    });
  },

  () => {
    test('FollowTarget snap bypasses transitions only when the target changes', () => {
      const root = new CompositionArea('compositionArea');
      const page = root.addChild(new Page('page'));
      const firstRow = page.addChild(new Row('row:first'));
      const secondRow = page.addChild(new Row('row:second'));
      const firstWord = firstRow.addChild(makeWord('word:first', 'FIRST'));
      const secondWord = secondRow.addChild(makeWord('word:second', 'SECOND'));
      firstWord.state = 'current';
      secondWord.state = 'next';
      firstRow.state = 'current';
      secondRow.state = 'next';
      firstWord.box = { x: 100, y: 100, width: 80, height: 30 };
      secondWord.box = { x: 300, y: 200, width: 100, height: 30 };

      const transition = {
        enabled: true,
        type: 'tween',
        durationSeconds: 1,
        easeType: 'linear',
      };
      const follower = root.addChild(new BackgroundEntity('background:snap-transition', null, false));
      const transform = follower.addComponent(
        new Transform(new Map([['position', buildProperty({ type: 'vector2', value: { x: 0, y: 0 }, transition })]])),
      );
      follower.addComponent(
        new FollowTarget(
          new Map([
            ['target', staticProperty('string', 'currentWord')],
            ['targetScope', staticProperty('string', 'timeline')],
            ['boundaryHandoff', staticProperty('string', 'snap')],
            ['anchor', staticProperty('string', 'topLeft')],
            [
              'mappings',
              staticProperty('array', [
                { destination: 'Transform.position.x', source: 'bounds.x' },
                { destination: 'Transform.position.y', source: 'bounds.y' },
              ]),
            ],
          ]),
        ),
      );
      const followRuntime = createFollowRuntime();
      const transitionRuntime = createTransitionRuntime();
      const resolveAt = (time) => {
        let context = defaultResolveContext({
          followRuntime,
          transitionRuntime,
          transitionTimeSeconds: time,
        });
        context = prepareFollowContext(root, context);
        context = prepareTransitionContext(root, context);
        return {
          context,
          position: transform.position(context),
        };
      };

      assert.deepEqual(resolveAt(0).position, { x: 100, y: 100 });

      firstWord.box = { x: 160, y: 140, width: 80, height: 30 };
      const sameTarget = resolveAt(0.1);
      assert.equal(sameTarget.context.transitionOverrides?.has(transform.getProp('position')) ?? false, true);
      const sameTargetProgress = resolveAt(0.2);
      assert.ok(sameTargetProgress.position.x > 100 && sameTargetProgress.position.x < 160);
      assert.ok(sameTargetProgress.position.y > 100 && sameTargetProgress.position.y < 140);

      firstWord.state = 'previous';
      secondWord.state = 'current';
      firstRow.state = 'previous';
      secondRow.state = 'current';
      const targetBoundary = resolveAt(0.2);
      assert.equal(targetBoundary.context.transitionOverrides?.has(transform.getProp('position')) ?? false, false);
      assert.deepEqual(targetBoundary.position, { x: 300, y: 200 });
    });
  },

  () => {
    test('FollowTarget sameParent scope transitions rows within one Page and snaps across Pages', () => {
      const root = new CompositionArea('compositionArea');
      const firstPage = root.addChild(new Page('page:first'));
      const secondPage = root.addChild(new Page('page:second'));
      const firstRow = firstPage.addChild(new Row('row:first'));
      const secondRow = firstPage.addChild(new Row('row:second'));
      const thirdRow = secondPage.addChild(new Row('row:third'));
      firstRow.state = 'current';
      secondRow.state = 'next';
      thirdRow.state = 'future';
      firstRow.box = { x: 100, y: 100, width: 100, height: 30 };
      secondRow.box = { x: 300, y: 200, width: 100, height: 30 };
      thirdRow.box = { x: 500, y: 300, width: 100, height: 30 };

      const transition = {
        enabled: true,
        type: 'tween',
        durationSeconds: 1,
        easeType: 'linear',
      };
      const follower = root.addChild(new BackgroundEntity('background:row-scope', null, false));
      const transform = follower.addComponent(
        new Transform(new Map([['position', buildProperty({ type: 'vector2', value: { x: 0, y: 0 }, transition })]])),
      );
      follower.addComponent(
        new FollowTarget(
          new Map([
            ['target', staticProperty('string', 'currentRow')],
            ['targetScope', staticProperty('string', 'timeline')],
            ['boundaryHandoff', staticProperty('string', 'allowTransition')],
            ['transitionScope', staticProperty('string', 'sameParent')],
            ['anchor', staticProperty('string', 'topLeft')],
            [
              'mappings',
              staticProperty('array', [
                { destination: 'Transform.position.x', source: 'bounds.x' },
                { destination: 'Transform.position.y', source: 'bounds.y' },
              ]),
            ],
          ]),
        ),
      );
      const followRuntime = createFollowRuntime();
      const transitionRuntime = createTransitionRuntime();
      const resolveAt = (time) => {
        let context = defaultResolveContext({
          followRuntime,
          transitionRuntime,
          transitionTimeSeconds: time,
        });
        context = prepareFollowContext(root, context);
        context = prepareTransitionContext(root, context);
        return {
          context,
          position: transform.position(context),
        };
      };

      assert.deepEqual(resolveAt(0).position, { x: 100, y: 100 });

      firstRow.state = 'previous';
      secondRow.state = 'current';
      const samePageHandoff = resolveAt(0.1);
      assert.equal(samePageHandoff.context.transitionOverrides?.has(transform.getProp('position')) ?? false, true);
      const samePageProgress = resolveAt(0.2);
      assert.ok(samePageProgress.position.x > 100 && samePageProgress.position.x < 300);

      secondRow.state = 'previous';
      thirdRow.state = 'current';
      const pageHandoff = resolveAt(0.3);
      assert.equal(pageHandoff.context.transitionOverrides?.has(transform.getProp('position')) ?? false, false);
      assert.deepEqual(pageHandoff.position, { x: 500, y: 300 });
    });
  },

  () => {
    test('FollowTarget sameParent scope transitions words within one Row and snaps across Rows', () => {
      const root = new CompositionArea('compositionArea');
      const page = root.addChild(new Page('page'));
      const firstRow = page.addChild(new Row('row:first'));
      const secondRow = page.addChild(new Row('row:second'));
      const firstWord = firstRow.addChild(makeWord('word:first', 'FIRST'));
      const secondWord = firstRow.addChild(makeWord('word:second', 'SECOND'));
      const thirdWord = secondRow.addChild(makeWord('word:third', 'THIRD'));
      firstRow.state = 'current';
      secondRow.state = 'next';
      firstWord.state = 'current';
      secondWord.state = 'next';
      thirdWord.state = 'future';
      firstWord.box = { x: 100, y: 100, width: 80, height: 30 };
      secondWord.box = { x: 220, y: 100, width: 80, height: 30 };
      thirdWord.box = { x: 400, y: 200, width: 80, height: 30 };

      const transition = {
        enabled: true,
        type: 'tween',
        durationSeconds: 1,
        easeType: 'linear',
      };
      const follower = root.addChild(new BackgroundEntity('background:word-scope', null, false));
      const transform = follower.addComponent(
        new Transform(new Map([['position', buildProperty({ type: 'vector2', value: { x: 0, y: 0 }, transition })]])),
      );
      follower.addComponent(
        new FollowTarget(
          new Map([
            ['target', staticProperty('string', 'currentWord')],
            ['targetScope', staticProperty('string', 'timeline')],
            ['boundaryHandoff', staticProperty('string', 'allowTransition')],
            ['transitionScope', staticProperty('string', 'sameParent')],
            ['anchor', staticProperty('string', 'topLeft')],
            [
              'mappings',
              staticProperty('array', [
                { destination: 'Transform.position.x', source: 'bounds.x' },
                { destination: 'Transform.position.y', source: 'bounds.y' },
              ]),
            ],
          ]),
        ),
      );
      const followRuntime = createFollowRuntime();
      const transitionRuntime = createTransitionRuntime();
      const resolveAt = (time) => {
        let context = defaultResolveContext({
          followRuntime,
          transitionRuntime,
          transitionTimeSeconds: time,
        });
        context = prepareFollowContext(root, context);
        context = prepareTransitionContext(root, context);
        return {
          context,
          position: transform.position(context),
        };
      };

      assert.deepEqual(resolveAt(0).position, { x: 100, y: 100 });

      firstWord.state = 'previous';
      secondWord.state = 'current';
      const sameRowHandoff = resolveAt(0.1);
      assert.equal(sameRowHandoff.context.transitionOverrides?.has(transform.getProp('position')) ?? false, true);
      const sameRowProgress = resolveAt(0.2);
      assert.ok(sameRowProgress.position.x > 100 && sameRowProgress.position.x < 220);

      secondWord.state = 'previous';
      thirdWord.state = 'current';
      firstRow.state = 'previous';
      secondRow.state = 'current';
      const rowHandoff = resolveAt(0.3);
      assert.equal(rowHandoff.context.transitionOverrides?.has(transform.getProp('position')) ?? false, false);
      assert.deepEqual(rowHandoff.position, { x: 400, y: 200 });
    });
  },

  () => {
    test('FollowTarget samePage scope transitions words across Rows and snaps across Pages', () => {
      const root = new CompositionArea('compositionArea');
      const firstPage = root.addChild(new Page('page:first'));
      const secondPage = root.addChild(new Page('page:second'));
      const firstRow = firstPage.addChild(new Row('row:first'));
      const secondRow = firstPage.addChild(new Row('row:second'));
      const thirdRow = secondPage.addChild(new Row('row:third'));
      const firstWord = firstRow.addChild(makeWord('word:first', 'FIRST'));
      const secondWord = secondRow.addChild(makeWord('word:second', 'SECOND'));
      const thirdWord = thirdRow.addChild(makeWord('word:third', 'THIRD'));
      firstWord.state = 'current';
      secondWord.state = 'next';
      thirdWord.state = 'future';
      firstWord.box = { x: 100, y: 100, width: 80, height: 30 };
      secondWord.box = { x: 220, y: 200, width: 80, height: 30 };
      thirdWord.box = { x: 400, y: 300, width: 80, height: 30 };

      const transition = {
        enabled: true,
        type: 'tween',
        durationSeconds: 1,
        easeType: 'linear',
      };
      const follower = root.addChild(new BackgroundEntity('background:page-scope', null, false));
      const transform = follower.addComponent(
        new Transform(new Map([['position', buildProperty({ type: 'vector2', value: { x: 0, y: 0 }, transition })]])),
      );
      follower.addComponent(
        new FollowTarget(
          new Map([
            ['target', staticProperty('string', 'currentWord')],
            ['targetScope', staticProperty('string', 'timeline')],
            ['boundaryHandoff', staticProperty('string', 'allowTransition')],
            ['transitionScope', staticProperty('string', 'samePage')],
            ['anchor', staticProperty('string', 'topLeft')],
            [
              'mappings',
              staticProperty('array', [
                { destination: 'Transform.position.x', source: 'bounds.x' },
                { destination: 'Transform.position.y', source: 'bounds.y' },
              ]),
            ],
          ]),
        ),
      );
      const followRuntime = createFollowRuntime();
      const transitionRuntime = createTransitionRuntime();
      const resolveAt = (time) => {
        let context = defaultResolveContext({
          followRuntime,
          transitionRuntime,
          transitionTimeSeconds: time,
        });
        context = prepareFollowContext(root, context);
        context = prepareTransitionContext(root, context);
        return {
          context,
          position: transform.position(context),
        };
      };

      assert.deepEqual(resolveAt(0).position, { x: 100, y: 100 });

      firstWord.state = 'previous';
      secondWord.state = 'current';
      const samePageHandoff = resolveAt(0.1);
      assert.equal(samePageHandoff.context.transitionOverrides?.has(transform.getProp('position')) ?? false, true);
      const samePageProgress = resolveAt(0.2);
      assert.ok(samePageProgress.position.x > 100 && samePageProgress.position.x < 220);
      assert.ok(samePageProgress.position.y > 100 && samePageProgress.position.y < 200);

      secondWord.state = 'previous';
      thirdWord.state = 'current';
      const pageHandoff = resolveAt(0.3);
      assert.equal(pageHandoff.context.transitionOverrides?.has(transform.getProp('position')) ?? false, false);
      assert.deepEqual(pageHandoff.position, { x: 400, y: 300 });
    });
  },

  () => {
    test('FollowTarget AllowTransition delegates handoffs to generic Transform transitions', () => {
      const root = new CompositionArea('compositionArea');
      const page = root.addChild(new Page('page'));
      const firstRow = page.addChild(new Row('row:first'));
      const secondRow = page.addChild(new Row('row:second'));
      const firstWord = firstRow.addChild(makeWord('word:first', 'FIRST'));
      const secondWord = secondRow.addChild(makeWord('word:second', 'SECOND'));
      firstWord.state = 'current';
      secondWord.state = 'next';
      firstRow.state = 'current';
      secondRow.state = 'next';
      firstWord.box = { x: 100, y: 100, width: 80, height: 30 };
      secondWord.box = { x: 300, y: 200, width: 100, height: 40 };

      const transition = {
        enabled: true,
        type: 'tween',
        durationSeconds: 1,
        easeType: 'linear',
      };
      const follower = root.addChild(new BackgroundEntity('background:handoff-transition', null, false));
      const transform = follower.addComponent(
        new Transform(
          new Map([
            ['position', buildProperty({ type: 'vector2', value: { x: 0, y: 0 }, transition })],
            ['dimensions', buildProperty({ type: 'vector2', value: { x: 1, y: 1 }, transition })],
          ]),
        ),
      );
      follower.addComponent(
        new FollowTarget(
          new Map([
            ['target', staticProperty('string', 'currentWord')],
            ['targetScope', staticProperty('string', 'timeline')],
            ['boundaryHandoff', staticProperty('string', 'allowTransition')],
            ['anchor', staticProperty('string', 'topLeft')],
            [
              'mappings',
              staticProperty('array', [
                { destination: 'Transform.position.x', source: 'bounds.x' },
                { destination: 'Transform.position.y', source: 'bounds.y' },
                { destination: 'Transform.width', source: 'bounds.width' },
                { destination: 'Transform.height', source: 'bounds.height' },
              ]),
            ],
          ]),
        ),
      );
      const followRuntime = createFollowRuntime();
      const transitionRuntime = createTransitionRuntime();
      const resolveAt = (time) => {
        let context = defaultResolveContext({
          followRuntime,
          transitionRuntime,
          transitionTimeSeconds: time,
        });
        context = prepareFollowContext(root, context);
        context = prepareTransitionContext(root, context);
        return {
          context,
          position: transform.position(context),
          dimensions: transform.getProp('dimensions').resolve(context),
        };
      };

      const initial = resolveAt(0);
      assert.deepEqual(initial.position, { x: 100, y: 100 });
      assert.deepEqual(initial.dimensions, { x: 80, y: 30 });
      assert.equal(initial.context.transitionOverrides?.has(transform.getProp('position')) ?? false, true);
      assert.equal(initial.context.transitionOverrides?.has(transform.getProp('dimensions')) ?? false, true);

      firstWord.state = 'previous';
      secondWord.state = 'current';
      firstRow.state = 'previous';
      secondRow.state = 'current';

      const handoffStart = resolveAt(0.01);
      const halfway = resolveAt(0.085);
      const settled = resolveAt(1.02);
      assert.equal(handoffStart.context.transitionOverrides?.has(transform.getProp('position')) ?? false, true);
      assert.equal(handoffStart.context.transitionOverrides?.has(transform.getProp('dimensions')) ?? false, true);
      assert.ok(halfway.position.x > 100 && halfway.position.x < 300);
      assert.ok(halfway.position.y > 100 && halfway.position.y < 200);
      assert.ok(halfway.dimensions.x > 80 && halfway.dimensions.x < 100);
      assert.ok(halfway.dimensions.y > 30 && halfway.dimensions.y < 40);
      assert.deepEqual(settled.position, { x: 300, y: 200 });
      assert.deepEqual(settled.dimensions, { x: 100, y: 40 });
    });
  },

  () => {
    test('FollowTarget AllowTransition preserves generic transitions across rebuilt Pages', () => {
      const buildScene = (pageLifecycle, x, y) => {
        const root = new CompositionArea('compositionArea');
        const page = root.addChild(new Page('page'));
        page.lifecycle = pageLifecycle;
        const row = page.addChild(new Row('row:current'));
        row.state = 'current';
        const word = row.addChild(makeWord('word:current', 'CURRENT'));
        word.state = 'current';
        word.box = { x, y, width: 80, height: 30 };
        const transition = {
          enabled: true,
          type: 'tween',
          durationSeconds: 0.15,
          easeType: 'linear',
          startValue: 'previousDisplayed',
          initialBehavior: 'immediate',
        };
        const follower = root.addChild(new BackgroundEntity('background:page-handoff', null, false));
        const transform = follower.addComponent(
          new Transform(new Map([['position', buildProperty({ type: 'vector2', value: { x: 0, y: 0 }, transition })]])),
        );
        follower.addComponent(
          new FollowTarget(
            new Map([
              ['target', staticProperty('string', 'currentWord')],
              ['targetScope', staticProperty('string', 'timeline')],
              ['boundaryHandoff', staticProperty('string', 'allowTransition')],
              ['anchor', staticProperty('string', 'topLeft')],
              [
                'mappings',
                staticProperty('array', [
                  { destination: 'Transform.position.x', source: 'bounds.x' },
                  { destination: 'Transform.position.y', source: 'bounds.y' },
                ]),
              ],
            ]),
          ),
        );
        return { root, transform };
      };

      const runtime = createFollowRuntime();
      const transitionRuntime = createTransitionRuntime();
      const positionAt = (scene, time) => {
        let context = defaultResolveContext({
          followRuntime: runtime,
          transitionRuntime,
          transitionTimeSeconds: time,
        });
        context = prepareFollowContext(scene.root, context);
        context = prepareTransitionContext(scene.root, context);
        return scene.transform.position(context);
      };

      const first = buildScene('outgoing', 100, 100);
      const second = buildScene('incoming', 400, 220);
      assert.deepEqual(positionAt(first, 0), { x: 100, y: 100 });

      const handoffStart = positionAt(second, 0.01);
      const halfway = positionAt(second, 0.085);
      const settled = positionAt(second, 0.2);
      assert.ok(handoffStart.x >= 100 && handoffStart.x < 400);
      assert.ok(handoffStart.y >= 100 && handoffStart.y < 220);
      assert.ok(halfway.x > 100 && halfway.x < 400);
      assert.ok(halfway.y > 100 && halfway.y < 220);
      assert.deepEqual(settled, { x: 400, y: 220 });
    });
  },

  () => {
    test('BackgroundEntity FollowTarget dimensions use the Transform transition', () => {
      const words = [makeWord('w0', 'ONE'), makeWord('w1', 'A MUCH LONGER WORD')];
      words[0].state = 'current';
      words[1].state = 'next';
      const { root, row } = makeLine(words);
      const transition = { enabled: true, type: 'tween', durationSeconds: 1, easeType: 'linear' };
      const background = row.addChild(new BackgroundEntity('background:dimensions', null, false));
      background.addComponent(
        new Transform(
          new Map([
            ['positioning', staticProperty('string', 'absolute')],
            ['position', staticProperty('vector2', { x: 0, y: 0 })],
            ['dimensions', buildProperty({ type: 'vector2', value: { x: 1, y: 1 }, transition })],
          ]),
        ),
      );
      background.addComponent(
        new FollowTarget(
          new Map([
            ['target', staticProperty('string', 'currentWord')],
            ['boundaryHandoff', staticProperty('string', 'allowTransition')],
            ['anchor', staticProperty('string', 'center')],
            [
              'mappings',
              staticProperty('array', [
                { destination: 'Transform.position.x', source: 'bounds.x' },
                { destination: 'Transform.position.y', source: 'bounds.y' },
                { destination: 'Transform.width', source: 'bounds.width' },
                { destination: 'Transform.height', source: 'bounds.height' },
              ]),
            ],
          ]),
        ),
      );
      const runtime = new TransitionRuntime();
      const canvas = new Canvas(16, 16);
      const resolveDimensions = (time) => {
        const base = defaultResolveContext({ transitionRuntime: runtime, transitionTimeSeconds: time });
        return background.transform
          .getProp('dimensions')
          .resolve(prepareTransitionContext(root, prepareFollowContext(root, base)));
      };

      const layout = () =>
        layoutScene(
          root,
          canvas.getContext('2d'),
          defaultResolveContext({ transitionRuntime: runtime, transitionTimeSeconds: 0 }),
          { width: 1000, height: 400 },
        );
      layout();
      const firstDimensions = { ...resolveDimensions(0) };
      words[0].state = 'previous';
      words[1].state = 'current';
      layout();
      const secondContext = prepareFollowContext(
        root,
        defaultResolveContext({ transitionRuntime: runtime, transitionTimeSeconds: 0 }),
      );
      const secondDimensions = {
        ...background.transform.getProp('dimensions').desiredValue(secondContext),
      };
      resolveDimensions(0);
      const halfway = resolveDimensions(0.5);

      assert.notDeepEqual(firstDimensions, secondDimensions);
      assert.equal(halfway.x, (firstDimensions.x + secondDimensions.x) / 2);
      assert.equal(halfway.y, (firstDimensions.y + secondDimensions.y) / 2);
    });
  },

  () => {
    test('followed BackgroundEntity transitions its padded render box without amplifying padding', () => {
      const words = [makeWord('w0', 'NICHE'), makeWord('w1', 'I')];
      words[0].state = 'current';
      words[1].state = 'next';
      const { root, row } = makeLine(words);
      const transition = { enabled: true, type: 'tween', durationSeconds: 1, easeType: 'linear' };
      const background = row.addChild(new BackgroundEntity('background:padded', null, false));
      background.addComponent(
        new Transform(
          new Map([
            ['positioning', staticProperty('string', 'absolute')],
            ['position', buildProperty({ type: 'vector2', value: { x: 0, y: 0 }, transition })],
            ['dimensions', buildProperty({ type: 'vector2', value: { x: 1, y: 1 }, transition })],
          ]),
        ),
      );
      background.addComponent(
        new FollowTarget(
          new Map([
            ['target', staticProperty('string', 'currentWord')],
            ['boundaryHandoff', staticProperty('string', 'allowTransition')],
            ['anchor', staticProperty('string', 'center')],
            [
              'mappings',
              staticProperty('array', [
                { destination: 'Transform.position.x', source: 'bounds.x' },
                { destination: 'Transform.position.y', source: 'bounds.y' },
                { destination: 'Transform.width', source: 'bounds.width' },
                { destination: 'Transform.height', source: 'bounds.height' },
              ]),
            ],
          ]),
        ),
      );
      background.addComponent(new BackgroundStyle(new Map([...insetEntries('bandPadding', 16, 16)])));

      const runtime = new TransitionRuntime();
      const canvas = new Canvas(1000, 400);
      const renderAt = (time) => {
        const context = defaultResolveContext({
          transitionRuntime: runtime,
          transitionTimeSeconds: time,
        });
        layoutScene(root, canvas.getContext('2d'), context, { width: 1000, height: 400 });
        renderScene(root, canvas.getContext('2d'), context);
        return {
          box: { ...background.box },
          paint: { ...background.getComponent('backgroundStyle').bounds(defaultResolveContext({})) },
        };
      };

      const first = renderAt(0);
      words[0].state = 'previous';
      words[1].state = 'current';
      renderAt(0);
      const halfway = renderAt(0.5);
      const last = renderAt(1);

      assert.ok(halfway.box.width < first.box.width);
      assert.ok(halfway.box.width > last.box.width);
      assert.equal(halfway.paint.width, halfway.box.width + 32);
      assert.equal(last.paint.width, last.box.width + 32);
      assert.ok(halfway.paint.width < first.paint.width);
      assert.ok(halfway.paint.width > last.paint.width);
    });
  },

  () => {
    test('marker FollowTarget resolves current words within its owning row', () => {
      const root = new CompositionArea('compositionArea');
      const page = root.addChild(new Page('page'));
      const firstRow = page.addChild(new Row('row:first'));
      const secondRow = page.addChild(new Row('row:second'));
      const firstWord = firstRow.addChild(makeWord('first', 'FIRST'));
      const secondWord = secondRow.addChild(makeWord('second', 'SECOND'));
      firstWord.state = 'current';
      secondWord.state = 'next';
      const firstMarker = firstRow.addChild(new Marker('marker:first', { followTarget: 'currentWord' }));
      const secondMarker = secondRow.addChild(new Marker('marker:second', { followTarget: 'currentWord' }));

      layoutScene(root, new Canvas(16, 16).getContext('2d'), defaultResolveContext({}), { width: 1000, height: 500 });

      assert.ok(firstMarker.box);
      assert.equal(secondMarker.box, null);
    });
  },

  () => {
    test('background bounds use the generic transition runtime across current rows', () => {
      const root = new CompositionArea('compositionArea');
      const page = root.addChild(new Page('page'));
      const firstRow = page.addChild(new Row('row:first'));
      const secondRow = page.addChild(new Row('row:second'));
      const firstWord = firstRow.addChild(makeWord('first', 'FIRST'));
      const secondWord = secondRow.addChild(makeWord('second', 'SECOND'));
      const transition = { enabled: true, type: 'tween', durationSeconds: 1, easeType: 'linear' };
      const makeBackground = () =>
        new BackgroundStyle(
          new Map([
            ['enabled', staticProperty('boolean', true)],
            ['fill', staticProperty('paint', solidPaint('red'))],
            ['bounds', buildProperty({ type: 'rect', value: null, runtimeOnly: true, transition })],
          ]),
        );
      const firstBackground = firstRow.addComponent(makeBackground());
      const secondBackground = secondRow.addComponent(makeBackground());
      firstRow.state = 'current';
      secondRow.state = 'next';
      firstWord.state = 'current';
      secondWord.state = 'next';
      const runtime = new TransitionRuntime();
      const canvas = new Canvas(16, 16);
      const resolveCurrentBounds = (time) => {
        const context = prepareTransitionContext(
          root,
          defaultResolveContext({ transitionRuntime: runtime, transitionTimeSeconds: time }),
        );
        return secondRow.state === 'current' ? secondBackground.bounds(context) : firstBackground.bounds(context);
      };

      layoutScene(root, canvas.getContext('2d'), defaultResolveContext({}), { width: 1000, height: 500 });
      const firstTarget = { ...firstBackground.box };
      resolveCurrentBounds(0);

      firstRow.state = 'previous';
      secondRow.state = 'current';
      firstWord.state = 'previous';
      secondWord.state = 'current';
      layoutScene(root, canvas.getContext('2d'), defaultResolveContext({}), { width: 1000, height: 500 });
      const secondTarget = { ...secondBackground.box };
      resolveCurrentBounds(0);
      const halfway = resolveCurrentBounds(0.5);
      assert.equal(halfway.x, (firstTarget.x + secondTarget.x) / 2);
      assert.equal(halfway.y, (firstTarget.y + secondTarget.y) / 2);
    });
  },

  () => {
    test('pipeline: wrapped continuation rows keep the Love Story slide-in animation', async () => {
      const sourceWord = 'supercalifragilisticexpialidocious'.repeat(2);
      const preset = loadEcsPreset('love-story.json');
      const result = await generatePipeline({
        videoResolution: { width: 1080, height: 1920 },
        timestamps: {
          words: [sourceWord],
          word_start_times_seconds: [0],
          word_end_times_seconds: [1],
        },
        design: structuredClone(preset.design),
        captionLayout: preset.captionLayout,
        stateWindow: preset.stateWindow,
        fps: 2,
        debug: true,
      });
      const firstFrameRows = result.debugLayout.frames[0].rows;
      const settledFrameRows = result.debugLayout.frames[1].rows;

      assert.ok(firstFrameRows.length > 1);
      assert.equal(firstFrameRows.length, settledFrameRows.length);
      assert.ok(
        firstFrameRows.slice(1).every((row, index) => row.left - settledFrameRows[index + 1].left > 40),
        'every wrapped continuation row must start in the slide-in offset',
      );
    });
  },

  () => {
    test('relative marker animation survives an anchor change', () => {
      const words = [makeWord('w0', 'HELLO')];
      words[0].state = 'current';
      const { root, row } = makeLine(words);
      const marker = row.addChild(
        new Marker('marker:relative-anchor', {
          followTarget: 'currentWord',
          anchor: 'topCenter',
        }),
      );
      marker.addComponent(
        new AnimationComponent({
          name: 'Hop Up',
          phase: 'loop',
          durationSeconds: 0.25,
          tracks: [
            {
              enabled: true,
              target: 'Transform.position',
              mode: 'relative',
              keyframes: [
                { time: 0, value: { x: 0, y: 0 } },
                { time: 0.125, value: { x: 0, y: -20 } },
                { time: 0.25, value: { x: 0, y: 0 } },
              ],
            },
          ],
        }),
      );

      const rctx = defaultResolveContext({ elapsedSeconds: 0.125 });
      layoutScene(root, new Canvas(16, 16).getContext('2d'), rctx, { width: 1000, height: 400 });
      const topFrame = collectDebugFrame(root, rctx);
      const topTransform = topFrame.transforms.find((transform) => transform.id === marker.id);
      assert.ok(topTransform);
      assert.equal(topTransform.position.y, -20);

      marker.getComponent('followTarget').props.get('anchor').setBase('bottomCenter');
      layoutScene(root, new Canvas(16, 16).getContext('2d'), rctx, { width: 1000, height: 400 });
      const bottomFrame = collectDebugFrame(root, rctx);
      const bottomTransform = bottomFrame.transforms.find((transform) => transform.id === marker.id);
      assert.ok(bottomTransform);
      assert.equal(bottomTransform.position.y, -20);
      assert.ok(
        Math.abs((bottomTransform.positionAnchor.y ?? 0) - (topTransform.positionAnchor.y ?? 0)) > 0,
        'changing the anchor should move the base while preserving the relative animation offset',
      );
    });
  },

  () => {
    test('Page childWindow resizes a motion-focused window to its current row slots', () => {
      const root = new CompositionArea('compositionArea');
      root.addComponent(fixedDimensionsTransform(500, 500));
      root.addComponent(new Layout(new Map(insetEntries('padding', 0, 0))));

      const page = new Page('motion-window');
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
            ['childWindow.windowAnchor', staticProperty('string', 'center')],
            ['childWindow.windowSelection', staticProperty('string', 'motionFocus')],
            ['clipContent', staticProperty('boolean', true)],
            ...insetEntries('padding', 0, 0),
          ]),
        ),
      );
      page.addComponent(
        new LayoutMotion(
          new Map([
            ['flowDirection', staticProperty('string', 'bottomToTop')],
            ['focusPosition', staticProperty('number', 0.5)],
          ]),
        ),
      );

      const heights = [20, 40, 80, 120];
      const rows = [];
      for (const [index, height] of heights.entries()) {
        const row = new Row(`motion-row-${index}`);
        row.state = index === 1 ? 'current' : 'previous';
        row.addComponent(fixedDimensionsTransform(200, height));
        page.addChild(row);
        rows.push(row);
      }
      root.addChild(page);

      layoutScene(root, new Canvas(1, 1).getContext('2d'), ctx(), { width: 500, height: 500 });

      assert.equal(page.box.height, 60);

      rows[1].state = 'previous';
      rows[2].state = 'current';
      layoutScene(root, new Canvas(1, 1).getContext('2d'), ctx(), { width: 500, height: 500 });

      assert.equal(page.box.height, 120);
      applyLayoutMotion(
        root,
        defaultResolveContext({ deltaSeconds: 1 / 60 }),
        new LayoutMotionRuntime(),
        'motion-window',
      );
      assert.equal(page.box.height, 120);
    });
  },

  () => {
    test('youtube-classic resizes the Page window for current motion-focused rows', () => {
      const preset = loadEcsPreset('youtube-classic.json');
      const template = buildEcsTreeFromPreset(preset);
      const samples = [1, 2].map((currentIndex) => {
        const scene = instantiateScene(template, {
          rows: [['ONE'], ['TWO'], ['THREE'], ['FOUR']],
          currentIndex,
          stateWindow: preset.stateWindow,
          flowParticipation: preset.captionLayout.flowParticipation,
        });
        const resolveContext = defaultResolveContext({});
        layoutScene(scene, new Canvas(1, 1).getContext('2d'), resolveContext, { width: 1080, height: 1920 });
        const page = scene.compositionArea.children.find((child) => child instanceof Page);
        assert.ok(page?.box);
        return page.box;
      });

      assert.notEqual(samples[0].height, samples[1].height);
    });
  },

  () => {
    test('state window: validates canonical ranges and clamps fixed counts', () => {
      assert.deepEqual(
        normalizeStateWindowConfig({
          previousWords: { mode: 'fixedCount', count: 99 },
          currentWords: { mode: 'fixedCount', count: 1 },
          nextWords: { mode: 'fixedCount', count: -4 },
          previousRows: { mode: 'fixedCount', count: 2.9 },
          currentRows: { mode: 'fixedCount', count: 1 },
          nextRows: { mode: 'fixedCount', count: 3 },
        }),
        {
          previousWords: { mode: 'fixedCount', count: 99 },
          currentWords: { mode: 'fixedCount', count: 1 },
          nextWords: { mode: 'fixedCount', count: 0 },
          previousRows: { mode: 'fixedCount', count: 2 },
          currentRows: { mode: 'fixedCount', count: 1 },
          nextRows: { mode: 'fixedCount', count: 3 },
        },
      );
      assert.equal(clampFixedCount(Number.NaN), 1);
      assert.equal(clampFixedCount(Number.POSITIVE_INFINITY), 1);
      assert.equal(clampFixedCount(-1), 0);
      assert.throws(
        () =>
          normalizeStateWindowConfig({
            previousWords: { mode: 'invalid' },
            currentWords: { mode: 'fixedCount', count: 1 },
            nextWords: { mode: 'all' },
            previousRows: { mode: 'all' },
            currentRows: { mode: 'fixedCount', count: 1 },
            nextRows: { mode: 'all' },
          }),
        /previousWords/,
      );
      assert.throws(
        () =>
          normalizeStateWindowConfig({
            previousWordCount: 1,
            nextWordCount: 1,
            previousRowCount: 1,
            nextRowCount: 1,
          }),
        /unsupported field previousWordCount/,
      );
    });
  },

  () => {
    test('state window: accepts row-relative word ranges', () => {
      assert.deepEqual(
        normalizeStateWindowConfig({
          previousWords: { mode: 'currentRow' },
          currentWords: { mode: 'fixedCount', count: 1 },
          nextWords: { mode: 'rowCount', count: 2.9 },
          previousRows: { mode: 'fixedCount', count: 1 },
          currentRows: { mode: 'fixedCount', count: 1 },
          nextRows: { mode: 'all' },
        }),
        {
          previousWords: { mode: 'currentRow' },
          currentWords: { mode: 'fixedCount', count: 1 },
          nextWords: { mode: 'rowCount', count: 2 },
          previousRows: { mode: 'fixedCount', count: 1 },
          currentRows: { mode: 'fixedCount', count: 1 },
          nextRows: { mode: 'all' },
        },
      );
    });
  },

  () => {
    test('state window: accepts active-row current word ranges', () => {
      assert.deepEqual(
        normalizeStateWindowConfig({
          previousWords: { mode: 'all' },
          currentWords: { mode: 'currentRowToCurrent' },
          nextWords: { mode: 'all' },
          previousRows: { mode: 'fixedCount', count: 1 },
          currentRows: { mode: 'fixedCount', count: 1 },
          nextRows: { mode: 'fixedCount', count: 1 },
        }).currentWords,
        { mode: 'currentRowToCurrent' },
      );
      assert.deepEqual(
        normalizeStateWindowConfig({
          previousWords: { mode: 'all' },
          currentWords: { mode: 'currentRow' },
          nextWords: { mode: 'all' },
          previousRows: { mode: 'fixedCount', count: 1 },
          currentRows: { mode: 'fixedCount', count: 1 },
          nextRows: { mode: 'fixedCount', count: 1 },
        }).currentWords,
        { mode: 'currentRow' },
      );
    });
  },
];

for (const registerTest of testRegistrations) registerTest();
