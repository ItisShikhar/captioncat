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
} = require('./ecs-engine-test-helpers.js');

const testRegistrations = [
  () => {
    test('caption text segmentation uses language-aware word boundaries', () => {
      assert.deepEqual(
        segmentCaptionText('Wait, did you see that?', 'en').map((token) => token.text),
        ['Wait,', 'did', 'you', 'see', 'that?'],
      );
      assert.deepEqual(
        segmentCaptionText('え、今の見た?', 'ja').map((token) => token.text),
        ['え、', '今', 'の', '見', 'た?'],
      );
      assert.deepEqual(
        segmentCaptionText('等等,你看到了吗?', 'zh').map((token) => token.text),
        ['等等,', '你', '看到', '了', '吗?'],
      );
    });

    test('Word-scoped signal effects use the target surface as their coordinate space', () => {
      const canvas = new Canvas(100, 20);
      const context = canvas.getContext('2d');
      const effect = new FisheyeEffect(
        new Map([
          ['mode', staticProperty('string', 'concave')],
          ['distortion', staticProperty('number', 1)],
          ['edgeMode', staticProperty('string', 'transparent')],
        ]),
      );

      renderEffectStack(
        context,
        ctx({ frameIndex: 0 }),
        [effect],
        (output) => {
          output.fillStyle = 'white';
          output.fillRect(2, 8, 6, 4);
        },
        (effect, output, input, effectContext, baseTransform) =>
          renderWrappedEffect(effect, output, input, effectContext, {
            baseTransform,
            localizeSignalEffects: true,
          }),
      );

      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let minX = canvas.width;
      let maxX = -1;
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          if (pixels[(y * canvas.width + x) * 4 + 3] === 0) continue;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
        }
      }

      assert.ok(minX >= 2 && maxX < 8, 'the fisheye output must remain within the word surface');
    });

    test('pipeline stops after the requested frame prefix', async () => {
      const preset = loadEcsPreset('5o.json');
      const frameIndexes = [];
      const result = await generateSubtitleImagesEcs({
        videoResolution: { width: 320, height: 568 },
        timestamps: {
          words: ['prefix'],
          word_start_times_seconds: [0],
          word_end_times_seconds: [10],
        },
        design: preset.design,
        stateWindow: preset.stateWindow,
        captionLayout: preset.captionLayout,
        fps: 10,
        collectFrames: false,
        stopAfterFrameIndex: 2,
        onFrame: (frame) => frameIndexes.push(frame.frameIndex),
      });

      assert.deepEqual(frameIndexes, [0, 1, 2]);
      assert.equal(result.allImageBuffers.length, 0);
    });

    test('pipeline renders the complete sequence without a frame bound', async () => {
      const preset = loadEcsPreset('5o.json');
      const frameIndexes = [];
      const result = await generateSubtitleImagesEcs({
        videoResolution: { width: 320, height: 568 },
        timestamps: {
          words: ['complete'],
          word_start_times_seconds: [0],
          word_end_times_seconds: [0.5],
        },
        design: preset.design,
        stateWindow: preset.stateWindow,
        captionLayout: preset.captionLayout,
        fps: 10,
        collectFrames: false,
        onFrame: (frame) => frameIndexes.push(frame.frameIndex),
      });

      assert.ok(frameIndexes.length > 3);
      assert.equal(frameIndexes.at(-1), frameIndexes.length - 1);
      assert.equal(result.allImageBuffers.length, 0);
    });
  },

  () => {
    test('Word fisheye rendering does not use the full caption frame as its lens', () => {
      const word = makeWord('fisheye-word', 'H', { size: 20 });
      word.box = { x: 2, y: 5, width: 30, height: 30 };
      word.addEffect(
        new FisheyeEffect(
          new Map([
            ['mode', staticProperty('string', 'concave')],
            ['distortion', staticProperty('number', 1)],
            ['edgeMode', staticProperty('string', 'transparent')],
          ]),
        ),
      );

      const canvas = new Canvas(200, 40);
      renderScene(word, canvas.getContext('2d'), ctx({ frameIndex: 0 }));
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let maxX = -1;
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          if (pixels[(y * canvas.width + x) * 4 + 3] === 0) continue;
          maxX = Math.max(maxX, x);
        }
      }

      assert.ok(maxX >= 0 && maxX < 40, 'the word effect must remain near the word position');
    });
  },

  () => {
    test('pipeline keeps appearance-randomized no-context captions stable and inside the frame', async () => {
      const preset = loadEcsPreset('no-context.json');
      const page = preset.design.children[1].children[0];
      page.components[0].props.position.randomizer.deterministic = false;
      page.components[0].props.position.randomizer.axes.y.deterministic = false;

      const render = (randomizerAppearanceIndex) =>
        generateSubtitleImagesEcs({
          videoResolution: { width: 1080, height: 1920 },
          timestamps: {
            words: ['randomly'],
            word_start_times_seconds: [0],
            word_end_times_seconds: [1],
          },
          design: preset.design,
          stateWindow: preset.stateWindow,
          fps: 10,
          debug: true,
          collectFrames: true,
          randomizerAppearanceIndex,
        });

      const [firstAppearance, secondAppearance] = await Promise.all([render(0), render(1)]);
      const pagePosition = (result) =>
        result.debugLayout.frames[0].transforms.find((transform) => transform.entity === 'page')?.position;
      assert.notDeepEqual(pagePosition(firstAppearance), pagePosition(secondAppearance));

      for (const result of [firstAppearance, secondAppearance]) {
        const position = pagePosition(result);
        assert.ok(position);
        assert.ok(
          result.debugLayout.frames.every(
            (frame) =>
              frame.transforms.find((transform) => transform.entity === 'page')?.position.x === position.x &&
              frame.transforms.find((transform) => transform.entity === 'page')?.position.y === position.y,
          ),
        );

        for (const buffer of result.allImageBuffers) {
          let minX = result.frameSize.width;
          let minY = result.frameSize.height;
          let maxX = -1;
          let maxY = -1;
          for (let y = 0; y < result.frameSize.height; y += 1) {
            for (let x = 0; x < result.frameSize.width; x += 1) {
              if (buffer[(y * result.frameSize.width + x) * 4 + 3] <= 10) continue;
              minX = Math.min(minX, x);
              minY = Math.min(minY, y);
              maxX = Math.max(maxX, x);
              maxY = Math.max(maxY, y);
            }
          }
          assert.ok(minX > 0);
          assert.ok(minY > 0);
          assert.ok(maxX < result.frameSize.width - 1);
          assert.ok(maxY < result.frameSize.height - 1);
        }
      }
    });
  },

  () => {
    test('No Context keeps wide one-word rows inside the crop', async () => {
      const preset = loadEcsPreset('no-context.json');
      const words = ['I', 'love', 'documentaries', 'on', 'serial', 'killers'];
      const result = await generateSubtitleImagesEcs({
        videoResolution: { width: 1080, height: 1920 },
        timestamps: {
          words,
          word_start_times_seconds: words.map((_, index) => index * 0.5),
          word_end_times_seconds: words.map((_, index) => index * 0.5 + 0.4),
          break_before: words.map(() => false),
        },
        design: preset.design,
        stateWindow: preset.stateWindow,
        captionLayout: preset.captionLayout,
        fps: 10,
        debug: true,
        collectFrames: true,
        randomizerAppearanceIndex: 0,
      });

      const caption = result.captionInfos.find((info) => info.word === 'documentaries');
      assert.ok(caption);
      const frame = result.allImageBuffers[caption.startFrame];
      assert.ok(frame);

      let minX = result.frameSize.width;
      for (let y = 0; y < result.frameSize.height; y += 1) {
        for (let x = 0; x < result.frameSize.width; x += 1) {
          if (frame[(y * result.frameSize.width + x) * 4 + 3] > 10) minX = Math.min(minX, x);
        }
      }

      assert.ok(minX > 0);
      assert.ok(result.debugLayout.frames[caption.startFrame].page.left > 0);
    });
  },

  () => {
    test('Go Viral keeps its animated Page scale inside the stable caption frame', async () => {
      const preset = loadEcsPreset('go-viral.json');
      const result = await generateSubtitleImagesEcs({
        videoResolution: { width: 1080, height: 1920 },
        timestamps: {
          words: ['VIRAL'],
          word_start_times_seconds: [0],
          word_end_times_seconds: [1],
          break_before: [false],
        },
        design: preset.design,
        stateWindow: preset.stateWindow,
        captionLayout: preset.captionLayout,
        fps: 30,
        collectFrames: true,
      });

      const frame = result.allImageBuffers[2];
      assert.ok(frame);
      let minX = result.frameSize.width;
      let minY = result.frameSize.height;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < result.frameSize.height; y += 1) {
        for (let x = 0; x < result.frameSize.width; x += 1) {
          if (frame[(y * result.frameSize.width + x) * 4 + 3] <= 16) continue;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }

      assert.ok(minX > 0, 'the overshoot frame must not be cropped at the left edge');
      assert.ok(minY > 0, 'the overshoot frame must not be cropped at the top edge');
      assert.ok(maxX < result.frameSize.width - 1, 'the overshoot frame must not be cropped at the right edge');
      assert.ok(maxY < result.frameSize.height - 1, 'the overshoot frame must not be cropped at the bottom edge');
    });
  },

  () => {
    test('TypewriterEffect segments graphemes and animates each visible unit', () => {
      const effect = new TypewriterEffect(
        new Map([
          ['revealMode', staticProperty('string', 'manual')],
          ['reveal', staticProperty('number', 0.5)],
          ['unitDurationSeconds', staticProperty('number', 0.2)],
          [
            'unitTracks',
            staticProperty('array', [
              {
                target: 'unit.scale',
                keyframes: [
                  { time: 0, value: { x: 0.5, y: 0.5 } },
                  { time: 0.2, value: { x: 1, y: 1 } },
                ],
              },
            ]),
          ],
        ]),
      );
      const canvas = new Canvas(1, 1);
      const context = canvas.getContext('2d');
      context.font = '80px sans-serif';
      const layout = effect.buildLayout(context, defaultResolveContext(), 'A👩‍🚀B', solidPaint('white'));

      assert.equal(layout.units.length, 3);
      assert.deepEqual(
        layout.units.map((unit) => unit.progress),
        [1, 0.5, 0],
      );
      assert.ok(layout.units[1].scale.x > 0.5 && layout.units[1].scale.x < 1);
    });
  },

  () => {
    test('TypewriterEffect reveals incoming words and keeps static states complete', () => {
      const effect = new TypewriterEffect(
        new Map([
          ['durationSeconds', staticProperty('number', 1)],
          ['delaySeconds', staticProperty('number', 0.2)],
        ]),
      );
      const canvas = new Canvas(1, 1);
      const context = canvas.getContext('2d');
      context.font = '80px sans-serif';
      const incoming = effect.buildLayout(
        context,
        defaultResolveContext({ lifecycle: 'incoming', elapsedSeconds: 0.2 }),
        'WORD',
        solidPaint('white'),
      );
      const staticLayout = effect.buildLayout(
        context,
        defaultResolveContext({ lifecycle: 'static', elapsedSeconds: 0 }),
        'WORD',
        solidPaint('white'),
      );

      assert.equal(incoming.reveal, 0);
      assert.equal(staticLayout.reveal, 1);
    });
  },

  () => {
    test('render: default word paints font + color + shadow to pixels', () => {
      const root = buildEcsTreeFromPreset(loadEcsPreset('authentic.json'));
      const word = root.findById('word:default');
      assert.ok(word instanceof Word, 'authentic should define a default word');
      word.text = 'Render';

      const { canvas, data } = renderWord(word);
      dumpPng(canvas, 'word-default.png');

      // The default word is white text with a black drop shadow -> both a bright
      // fill and dark shadow pixels must be present.
      assert.ok(countOpaquePixels(data) > 500, 'expected the glyphs to draw pixels');
      assert.ok(
        hasColor(data, (r, g, b) => r > 200 && g > 200 && b > 200),
        'expected white fill pixels',
      );
      assert.ok(
        hasColor(data, (r, g, b) => r < 60 && g < 60 && b < 60, 16),
        'expected dark shadow pixels',
      );
    });
  },

  () => {
    test('render: text centers actual glyph ink inside the word box', () => {
      const word = new Word('centered');
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
      word.text = 'Hyg';

      const rendered = renderWord(word);
      const bounds = opaqueBounds(rendered.data, rendered.width, rendered.height);
      assert.ok(bounds, 'expected the text to paint visible pixels');

      const inkCenterY = (bounds.top + bounds.bottom) / 2;
      assert.ok(
        Math.abs(inkCenterY - rendered.height / 2) <= 1.5,
        `expected the glyph ink center (${inkCenterY}) to match the word center (${rendered.height / 2})`,
      );
    });
  },

  () => {
    test('Text direction resolves language metadata before Unicode text', () => {
      assert.equal(directionForLanguage('ar-EG'), 'rtl');
      assert.equal(directionForLanguage('ar-Latn'), 'ltr');
      assert.equal(directionForLanguage('en-Arab'), 'rtl');
      assert.equal(directionForText('123 مرحبا'), 'rtl');
      assert.equal(resolveTextDirection('auto', 'en', 'مرحبا'), 'ltr');
      assert.equal(resolveTextDirection('auto', undefined, 'שלום world'), 'rtl');
      assert.equal(resolveTextDirection('ltr', 'ar', 'مرحبا'), 'ltr');
    });
  },

  () => {
    test('word backgrounds use the scaled word geometry', () => {
      const line = makeFixedLine([makeWord('word', 'BACKGROUND', { size: 70 })], 180);
      const word = line.row.children[0];
      word.addComponent(new BackgroundStyle());

      layoutFixedLine(line, { mode: 'shrink-to-fit', minScale: 0.5, maxScale: 1.25 }, 180);

      assert.deepEqual(word.getComponent('backgroundStyle').box, word.box);
      assert.deepEqual(contentClipBox(line.root, ctx()), {
        x: -90,
        y: -120,
        width: 180,
        height: 240,
      });
    });
  },

  () => {
    test('oversized minimum-scale word backgrounds stay clipped to the composition area', () => {
      const line = makeFixedLine([makeWord('word', 'WWWW', { size: 100 })], 40, 120);
      const word = line.row.children[0];
      word.addComponent(
        new BackgroundStyle(new Map([['fill', staticProperty('paint', solidPaint('rgb(255, 0, 0)'))]])),
      );

      const renderContext = ctx();
      layoutScene(line.root, new Canvas(1, 1).getContext('2d'), renderContext, {
        x: 30,
        y: 0,
        width: 40,
        height: 120,
        rowFontFit: { mode: 'shrink-to-fit', minScale: 0.5, maxScale: 1.25 },
      });

      assert.ok(word.box.width > line.root.box.width, 'the test word must exceed the composition width');
      const canvas = new Canvas(100, 120);
      const context = canvas.getContext('2d');
      renderScene(line.root, context, renderContext);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const rootBox = line.root.box;
      let outsideAlphaPixels = 0;
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const alpha = pixels[(y * canvas.width + x) * 4 + 3];
          if (alpha > 0 && (x < rootBox.x || x >= rootBox.x + rootBox.width)) outsideAlphaPixels += 1;
        }
      }

      assert.equal(outsideAlphaPixels, 0);
      assert.ok(hasColor(pixels, (red, green, blue) => red > 200 && green < 80 && blue < 80));
    });
  },

  () => {
    test('RTL Typewriter reveals logical graphemes from the right edge', () => {
      const effect = new TypewriterEffect();
      const layout = effect.buildLayout(
        new Canvas(160, 80).getContext('2d'),
        ctx({ textDirection: 'rtl' }),
        'مرحبا',
        solidPaint('white'),
      );

      assert.equal(layout.textDirection, 'rtl');
      assert.ok(layout.units[0].centerX > layout.units[layout.units.length - 1].centerX);
    });
  },

  () => {
    test('followed BackgroundEntity styles resolve paint geometry like Word styles', () => {
      const root = new CompositionArea('compositionArea');
      const page = root.addChild(new Page('page'));
      const row = page.addChild(new Row('row:default'));
      const word = row.addChild(new Word('word:default'));
      word.box = { x: 100, y: 40, width: 120, height: 30 };

      const styleProps = () =>
        new Map([
          ...insetEntries('bandPadding', 10, 5),
          ...insetEntries('blockPadding', 4, 3),
          ['offset', staticProperty('vector2', { x: 7, y: -2 })],
          ['scale', staticProperty('vector2', { x: 2, y: 1 })],
        ]);
      const wordStyle = word.addComponent(new BackgroundStyle(styleProps()));
      const background = page.addChild(new BackgroundEntity('background:word', word.id));
      const followedStyle = background.getComponent('backgroundStyle');
      for (const [key, property] of styleProps()) followedStyle.props.set(key, property);

      const context = defaultResolveContext({});
      refreshDependentGeometry(root, context);

      assert.deepEqual(followedStyle.bounds(context), wordStyle.bounds(context));
      assert.deepEqual(followedStyle.bounds(context), { x: 26, y: 30, width: 296, height: 46 });
      assert.deepEqual(background.box, word.box);
    });
  },

  () => {
    test('Image aspect-ratio modes apply inside a word component box', async () => {
      const sourceCanvas = new Canvas(2, 1);
      const sourceContext = sourceCanvas.getContext('2d');
      sourceContext.fillStyle = 'rgb(255, 0, 0)';
      sourceContext.fillRect(0, 0, 2, 1);
      const asset = `data:image/png;base64,${sourceCanvas.toBufferSync('png').toString('base64')}`;
      assert.equal((await loadImageAsset(asset)).status, 'loaded');

      const image = new Image(
        new Map([
          ['assetSource', staticProperty('string', 'custom')],
          ['customAsset', staticProperty('string', asset)],
          ['colorMode', staticProperty('string', 'original')],
          ['aspectRatio', staticProperty('string', 'maintain')],
        ]),
      );
      const owner = {
        kind: 'word',
        box: { x: 0, y: 0, width: 100, height: 100 },
      };
      const render = () => {
        const canvas = new Canvas(100, 100);
        const context = canvas.getContext('2d');
        context.translate(50, 50);
        image.paint(context, defaultResolveContext({}), owner);
        return canvas.toBufferSync('raw', { colorType: 'rgba' });
      };

      const maintained = render();
      image.getProp('aspectRatio').setBase('stretchToFit');
      const stretched = render();

      assert.ok(countOpaquePixels(stretched) > countOpaquePixels(maintained) * 1.5);
    });
  },

  () => {
    test('Row childWindow sizes the row to a fixed number of words and honors its anchor', () => {
      for (const [windowAnchor, firstWordOffset] of [
        ['start', 0],
        ['center', -100],
        ['end', -200],
      ]) {
        const root = new CompositionArea('compositionArea');
        root.addComponent(fixedDimensionsTransform(500, 100));
        root.addComponent(new Layout(new Map(insetEntries('padding', 0, 0))));

        const page = root.addChild(new Page(`page-${windowAnchor}`));
        page.addComponent(
          new Transform(
            new Map([
              ['widthMode', staticProperty('string', 'fitChildren')],
              ['heightMode', staticProperty('string', 'fitChildren')],
            ]),
          ),
        );
        const row = page.addChild(new Row(`row-${windowAnchor}`));
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
              ['childWindow.windowAnchor', staticProperty('string', windowAnchor)],
            ]),
          ),
        );
        const words = [];
        for (let index = 0; index < 4; index += 1) {
          const word = row.addChild(new Word(`word-${windowAnchor}-${index}`, `word-${index}`));
          word.addComponent(fixedDimensionsTransform(100, 40));
          words.push(word);
        }

        layoutScene(root, new Canvas(1, 1).getContext('2d'), ctx(), { width: 500, height: 100 });

        assert.equal(row.box.width, 200);
        assert.equal(words[0].box.x, row.box.x + firstWordOffset);
        assert.equal(words[1].box.x, row.box.x + firstWordOffset + 100);
        assert.equal(words[3].box.x, row.box.x + firstWordOffset + 300);
      }
    });
  },

  () => {
    test('render: scene walk paints a full caption line across the width', () => {
      const words = ['Hello', 'brave', 'new', 'world'].map((w, i) => makeWord(`w${i}`, w, { size: 64 }));
      const { root } = makeLine(words);

      const width = 1200;
      const height = 300;
      const canvas = new Canvas(width, height);
      const context = canvas.getContext('2d');

      layoutScene(root, context, defaultResolveContext({}), { width, height });
      renderScene(root, context, defaultResolveContext({}));

      const { data } = context.getImageData(0, 0, width, height);
      dumpPng(canvas, 'scene-line.png');

      assert.ok(countOpaquePixels(data) > 2000, 'a full line should draw many pixels');
      assert.ok(opaqueWidth(data, width, height) > width * 0.5, 'the line should span a wide horizontal extent');
    });
  },

  () => {
    test('render: composition-area background paints behind the words', () => {
      const words = ['On', 'top'].map((w, i) => makeWord(`w${i}`, w, { size: 90 }));
      const { root } = makeLine(words);

      // A rounded blue background on the composition area (fills the whole area).
      const background = new BackgroundStyle(
        new Map([
          ['enabled', staticProperty('boolean', true)],
          ['fill', staticProperty('paint', solidPaint('rgb(20,80,170)'))],
          ['borderRadius', staticProperty('number', 24)],
        ]),
      );
      root.addComponent(background);

      const width = 800;
      const height = 300;
      const canvas = new Canvas(width, height);
      const context = canvas.getContext('2d');

      layoutScene(root, context, defaultResolveContext({}), { width, height });
      renderScene(root, context, defaultResolveContext({}));

      const { data } = context.getImageData(0, 0, width, height);
      dumpPng(canvas, 'scene-bg-line.png');

      // Blue background fills the middle band. White text sits on top of it.
      assert.ok(
        hasColor(data, (r, g, b) => b > 140 && r < 90 && g > 40 && g < 160),
        'expected the blue composition background',
      );
      assert.ok(
        hasColor(data, (r, g, b) => r > 220 && g > 220 && b > 220),
        'expected white words on top',
      );
    });
  },

  () => {
    test('applyCaseTransform: uppercase / lowercase / capitalize / none', () => {
      assert.equal(applyCaseTransform('hello world', 'uppercase'), 'HELLO WORLD');
      assert.equal(applyCaseTransform('Hello WORLD', 'lowercase'), 'hello world');
      assert.equal(applyCaseTransform('hello', 'capitalize'), 'Hello');
      assert.equal(applyCaseTransform('"quote', 'capitalize'), '"Quote');
      assert.equal(applyCaseTransform('hello', 'none'), 'hello');
      assert.equal(applyCaseTransform('hello', undefined), 'hello');
    });
  },

  () => {
    test('Text.measure/displayText honor the caseTransform prop', () => {
      const text = new Text(new Map([['caseTransform', staticProperty('string', 'uppercase')]]));
      text.components.push(
        new Font(
          new Map([
            ['family', staticProperty('fontFamily', ['Arimo', 'sans-serif'])],
            ['size', staticProperty('number', 80)],
            ['weight', staticProperty('string', 'bold')],
          ]),
        ),
      );
      const canvas = new Canvas(16, 16);
      const context = canvas.getContext('2d');
      const rctx = defaultResolveContext({});

      assert.equal(text.displayText('cat', rctx), 'CAT');
      // Uppercase glyphs are wider than lowercase in this font -> measured width grows.
      const upperWidth = text.measure(context, rctx, 'cat').width;
      const plain = new Text(new Map([['caseTransform', staticProperty('string', 'none')]]));
      plain.components.push(text.components[0].clone());
      const asIs = plain.measure(context, rctx, 'cat').width;
      assert.ok(upperWidth > asIs, 'uppercased text measures wider than lowercase');
    });
  },
];

for (const registerTest of testRegistrations) registerTest();
