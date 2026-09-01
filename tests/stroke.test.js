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
    test('renderScene: Base Content Replicator copies preserve child stroke and shadow pixels', () => {
      const row = new Row('row:replicator-stroke');
      row.box = { x: 120, y: 40, width: 180, height: 70 };
      const word = row.addChild(new Word('word:replicator-stroke'));
      word.box = { x: 120, y: 40, width: 180, height: 70 };
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
            ['color', staticProperty('paint', solidPaint('black'))],
            ['width', staticProperty('number', 8)],
          ]),
        ),
      );
      text.addEffect(
        new ShadowEffect(
          new Map([
            ['enabled', staticProperty('boolean', true)],
            ['color', staticProperty('paint', solidPaint('#0000ff'))],
            ['blurRadius', staticProperty('number', 0)],
            ['offset', staticProperty('vector2', { x: 8, y: 4 })],
          ]),
        ),
      );
      word.addComponent(text);
      row.addEffect(
        new ReplicatorEffect(
          new Map([
            ['appliesOn', staticProperty('string', 'base')],
            ['enabled', staticProperty('boolean', true)],
            ['showOriginal', staticProperty('string', 'front')],
            ['cloneCount', staticProperty('number', 1)],
            ['fillMode', staticProperty('string', 'custom')],
            ['fillTarget', staticProperty('string', 'base')],
            ['customFills', staticProperty('array', [solidPaint('#ff0000')])],
            ['position', staticProperty('vector2', { x: 45, y: 0 })],
          ]),
        ),
      );

      const canvas = new Canvas(420, 160);
      renderScene(row, canvas.getContext('2d'), ctx());
      const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      let cloneStrokePixels = 0;
      for (let y = 20; y < 130; y += 1) {
        for (let x = 230; x < 340; x += 1) {
          const offset = (y * canvas.width + x) * 4;
          if (data[offset] < 30 && data[offset + 1] < 30 && data[offset + 2] < 30 && data[offset + 3] > 180) {
            cloneStrokePixels += 1;
          }
        }
      }
      assert.ok(cloneStrokePixels > 0, 'the clone preserves the child stroke in Base Content mode');
      let cloneShadowPixels = 0;
      for (let y = 20; y < 130; y += 1) {
        for (let x = 230; x < 340; x += 1) {
          const offset = (y * canvas.width + x) * 4;
          if (data[offset] < 60 && data[offset + 1] < 60 && data[offset + 2] > 180 && data[offset + 3] > 180) {
            cloneShadowPixels += 1;
          }
        }
      }
      assert.ok(cloneShadowPixels > 0, 'the clone preserves the child shadow in Base Content mode');
    });
  },

  () => {
    test('StrokeEffect.getMargins follows alignment and defaults to outside', () => {
      const alignments = [
        ['inside', 0],
        ['center', 12],
        ['outside', 24],
        [undefined, 24],
        ['invalid', 24],
      ];
      for (const [alignment, margin] of alignments) {
        const props = [['width', staticProperty('number', 24)]];
        if (alignment) props.push(['alignment', staticProperty('string', alignment)]);
        const stroke = new StrokeEffect(new Map(props));
        assert.deepEqual(stroke.getMargins(ctx({})), { x: margin, y: margin });
      }
      const restored = new StrokeEffect();
      ensureEffectDefaults(restored);
      assert.equal(restored.getProp('alignment').base, 'outside');
    });
  },

  () => {
    test('Image outlines honor inside, center, and outside stroke alignment', () => {
      const input = new Canvas(100, 100);
      const inputContext = input.getContext('2d');
      inputContext.fillStyle = 'white';
      inputContext.fillRect(40, 40, 20, 20);

      const boundsFor = (position) => {
        const output = new Canvas(100, 100);
        drawImageOutline(output.getContext('2d'), input, {
          width: 10,
          color: 'black',
          position,
        });
        return opaqueBounds(output.getContext('2d').getImageData(0, 0, 100, 100).data, 100, 100);
      };

      assert.deepEqual(boundsFor('inner'), { top: 40, bottom: 60, width: 20, height: 20 });
      assert.deepEqual(boundsFor('center'), { top: 35, bottom: 65, width: 30, height: 30 });
      assert.deepEqual(boundsFor('outer'), { top: 30, bottom: 70, width: 40, height: 40 });
    });
  },

  () => {
    test('Image outlines antialias rasterized edges', () => {
      const input = new Canvas(100, 100);
      const inputContext = input.getContext('2d');
      inputContext.fillStyle = 'white';
      inputContext.fillRect(40, 40, 20, 20);

      const output = new Canvas(100, 100);
      drawImageOutline(output.getContext('2d'), input, {
        width: 10,
        color: 'black',
        position: 'outer',
      });
      const data = output.getContext('2d').getImageData(0, 0, 100, 100).data;
      let hasPartialAlpha = false;
      for (let index = 3; index < data.length; index += 4) {
        if (data[index] > 0 && data[index] < 255) {
          hasPartialAlpha = true;
          break;
        }
      }
      assert.equal(hasPartialAlpha, true);
    });
  },

  () => {
    test('Path strokes honor inside, center, and outside alignment', () => {
      const path = buildRoundedUnionPath(
        [{ left: 40, top: 40, right: 60, bottom: 60 }],
        {
          radii: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
          squircle: { topLeft: false, topRight: false, bottomRight: false, bottomLeft: false },
        },
        0,
      );
      const boundsFor = (position) => {
        const output = new Canvas(100, 100);
        strokePathWithStyle(output.getContext('2d'), path, {
          width: 10,
          color: 'black',
          position,
        });
        return opaqueBounds(output.getContext('2d').getImageData(0, 0, 100, 100).data, 100, 100);
      };

      assert.deepEqual(boundsFor('inner'), { top: 40, bottom: 60, width: 20, height: 20 });
      assert.deepEqual(boundsFor('center'), { top: 35, bottom: 65, width: 30, height: 30 });
      assert.deepEqual(boundsFor('outer'), { top: 30, bottom: 70, width: 40, height: 40 });
    });
  },

  () => {
    test('Text strokes honor inside, center, and outside alignment', () => {
      const renderAlignment = (alignment) => {
        const word = new Word(`stroke-alignment-${alignment}`);
        const text = word.addComponent(
          new Text(
            new Map([
              ['color', staticProperty('paint', solidPaint('white'))],
              ['effectsInheritBaseAlpha', staticProperty('boolean', false)],
            ]),
          ),
        );
        text.components.push(
          new Font(
            new Map([
              ['family', staticProperty('fontFamily', ['Arimo', 'sans-serif'])],
              ['size', staticProperty('number', 90)],
              ['weight', staticProperty('string', 'bold')],
            ]),
          ),
        );
        text.effects.push(
          new StrokeEffect(
            new Map([
              ['alignment', staticProperty('string', alignment)],
              ['width', staticProperty('number', 12)],
              ['color', staticProperty('paint', solidPaint('black'))],
            ]),
          ),
        );
        word.text = 'DASH';
        const rendered = renderWord(word);
        return {
          ...rendered,
          bounds: opaqueBounds(rendered.data, rendered.width, rendered.height),
        };
      };

      const baseWord = new Word('stroke-alignment-base');
      const baseText = baseWord.addComponent(
        new Text(
          new Map([
            ['color', staticProperty('paint', solidPaint('white'))],
            ['effectsInheritBaseAlpha', staticProperty('boolean', false)],
          ]),
        ),
      );
      baseText.components.push(
        new Font(
          new Map([
            ['family', staticProperty('fontFamily', ['Arimo', 'sans-serif'])],
            ['size', staticProperty('number', 90)],
            ['weight', staticProperty('string', 'bold')],
          ]),
        ),
      );
      baseWord.text = 'DASH';
      const baseRendered = renderWord(baseWord);
      const baseBounds = opaqueBounds(baseRendered.data, baseRendered.width, baseRendered.height);
      const insideRendered = renderAlignment('inside');
      const centerRendered = renderAlignment('center');
      const outsideRendered = renderAlignment('outside');
      const insideBounds = insideRendered.bounds;
      const centerBounds = centerRendered.bounds;
      const outsideBounds = outsideRendered.bounds;

      assert.ok(Math.abs(insideBounds.width - baseBounds.width) <= 1);
      assert.ok(Math.abs(insideBounds.height - baseBounds.height) <= 1);
      assert.ok(centerBounds.width > baseBounds.width && centerBounds.height > baseBounds.height);
      assert.ok(outsideBounds.width > centerBounds.width && outsideBounds.height > centerBounds.height);
      assert.ok(
        hasPixelPair(
          centerRendered.data,
          baseRendered.data,
          (centerRed, centerGreen, centerBlue, centerAlpha, baseRed, baseGreen, baseBlue, baseAlpha) =>
            centerAlpha > 200 &&
            centerRed < 40 &&
            centerGreen < 40 &&
            centerBlue < 40 &&
            baseAlpha > 200 &&
            baseRed > 240 &&
            baseGreen > 240 &&
            baseBlue > 240,
        ),
        'center stroke should paint its inner half over the base fill',
      );
    });
  },

  () => {
    test('render: inherited text strokes honor the configured join type', () => {
      const renderJoin = (joinType) => {
        const word = new Word(`stroke-join-${joinType}`);
        const text = word.addComponent(new Text(new Map([['color', staticProperty('paint', solidPaint('white'))]])));
        text.components.push(
          new Font(
            new Map([
              ['family', staticProperty('fontFamily', ['Arimo', 'sans-serif'])],
              ['size', staticProperty('number', 120)],
              ['weight', staticProperty('string', 'bold')],
            ]),
          ),
        );
        text.effects.push(
          new StrokeEffect(
            new Map([
              ['width', staticProperty('number', 24)],
              ['color', staticProperty('paint', solidPaint('black'))],
              ['joinType', staticProperty('string', joinType)],
            ]),
          ),
        );
        word.text = 'A';
        return renderWord(word).data;
      };
      const blackPixels = (data) => {
        let count = 0;
        for (let index = 0; index < data.length; index += 4) {
          if (data[index] < 30 && data[index + 1] < 30 && data[index + 2] < 30 && data[index + 3] > 180) count += 1;
        }
        return count;
      };

      const miter = blackPixels(renderJoin('miter'));
      const bevel = blackPixels(renderJoin('bevel'));
      const round = blackPixels(renderJoin('round'));
      assert.ok(
        new Set([miter, bevel, round]).size > 1,
        `join types should change rendered pixels (${miter}, ${bevel}, ${round})`,
      );
    });
  },

  () => {
    test('render: inherited background strokes honor the configured cap type', () => {
      const renderCap = (capType) => {
        const word = new Word(`stroke-cap-${capType}`);
        word.box = { x: 50, y: 40, width: 140, height: 80 };
        const background = word.addComponent(
          new BackgroundStyle(new Map([['fill', staticProperty('paint', solidPaint('white'))]])),
        );
        background.effects.push(
          new StrokeEffect(
            new Map([
              ['style', staticProperty('string', 'dotted')],
              ['width', staticProperty('number', 12)],
              ['color', staticProperty('paint', solidPaint('black'))],
              ['capType', staticProperty('string', capType)],
              ['gap', staticProperty('number', 12)],
              ['spacing', staticProperty('number', 12)],
            ]),
          ),
        );
        const canvas = new Canvas(240, 160);
        renderScene(word, canvas.getContext('2d'), ctx({}));
        return canvas.getContext('2d').getImageData(0, 0, 240, 160).data;
      };
      const blackPixels = (data) => {
        let count = 0;
        for (let index = 0; index < data.length; index += 4) {
          if (data[index] < 30 && data[index + 1] < 30 && data[index + 2] < 30 && data[index + 3] > 180) count += 1;
        }
        return count;
      };

      const butt = blackPixels(renderCap('butt'));
      const round = blackPixels(renderCap('round'));
      const square = blackPixels(renderCap('square'));
      assert.ok(
        new Set([butt, round, square]).size > 1,
        `cap types should change rendered pixels (${butt}, ${round}, ${square})`,
      );
    });
  },

  () => {
    test('render: strokes support every paint and line style at None, 2x, 4x, and 8x', () => {
      const paints = [
        solidPaint('black'),
        {
          type: 'linear-gradient',
          angle: 90,
          stops: [
            { offset: 0, color: 'red' },
            { offset: 1, color: 'blue' },
          ],
        },
        {
          type: 'radial-gradient',
          centerX: 0.5,
          centerY: 0.5,
          radius: 0.75,
          stops: [
            { offset: 0, color: 'red' },
            { offset: 1, color: 'blue' },
          ],
        },
      ];

      for (const antialiasScale of [1, 2, 4, 8]) {
        for (const style of ['solid', 'dashed', 'dotted']) {
          for (const color of paints) {
            const word = new Word(`stroke-${antialiasScale}-${style}-${color.type}`);
            const text = word.addComponent(
              new Text(new Map([['color', staticProperty('paint', solidPaint('white'))]])),
            );
            text.components.push(
              new Font(
                new Map([
                  ['family', staticProperty('fontFamily', ['Arimo', 'sans-serif'])],
                  ['size', staticProperty('number', 96)],
                  ['weight', staticProperty('string', 'bold')],
                ]),
              ),
            );
            text.effects.push(
              new StrokeEffect(
                new Map([
                  ['style', staticProperty('string', style)],
                  ['width', staticProperty('number', 16)],
                  ['color', staticProperty('paint', color)],
                  ['capType', staticProperty('string', 'square')],
                  ['joinType', staticProperty('string', 'bevel')],
                  ['dash', staticProperty('number', 12)],
                  ['gap', staticProperty('number', 10)],
                  ['spacing', staticProperty('number', 10)],
                  ['antialiasScale', staticProperty('number', antialiasScale)],
                ]),
              ),
            );
            word.text = 'A';
            const rendered = renderWord(word);
            assert.ok(
              countOpaquePixels(rendered.data) > 0,
              `${style} ${color.type} stroke should render at ${antialiasScale}x`,
            );
            if (color.type !== 'solid') {
              assert.ok(
                hasColor(rendered.data, (red, green, blue) => red > 150 && green < 100 && blue < 100),
                `${style} ${color.type} stroke should preserve paint colors at ${antialiasScale}x`,
              );
            }
          }
        }
      }
    });
  },

  () => {
    test('Stroke styles resolve explicit dash patterns, cap/join, and offset', () => {
      const calls = [];
      const canvasContext = {
        lineWidth: 0,
        strokeStyle: '',
        lineCap: 'butt',
        lineJoin: 'miter',
        miterLimit: 0,
        lineDashOffset: 0,
        save() {},
        restore() {},
        setLineDash(pattern) {
          calls.push(pattern);
        },
      };

      assert.equal(applyStrokeStyle(canvasContext, { width: 2, color: 'red', style: 'solid' }), true);
      assert.deepEqual(calls.at(-1), []);

      applyStrokeStyle(canvasContext, {
        width: 2,
        color: 'red',
        style: 'dashed',
        cap: 'round',
        join: 'bevel',
        dash: 8,
        gap: 4,
        dashOffset: 12,
      });
      assert.deepEqual(calls.at(-1), [8, 4]);
      assert.equal(canvasContext.lineCap, 'round');
      assert.equal(canvasContext.lineJoin, 'bevel');
      assert.equal(canvasContext.lineDashOffset, 12);

      applyStrokeStyle(canvasContext, { width: 2, color: 'red', style: 'dotted', gap: 8 });
      assert.deepEqual(calls.at(-1), [0, 8]);

      applyStrokeStyle(canvasContext, { width: 2, color: 'red', style: 'dotted', cap: 'square', gap: 8 });
      assert.deepEqual(calls.at(-1), [2, 8]);
    });
  },

  () => {
    test('render: Text Base stroke preserves dashed and dotted styles', () => {
      const renderStyle = (style) => {
        const word = new Word(`stroke-${style}`);
        const text = word.addComponent(new Text(new Map([['color', staticProperty('paint', solidPaint('white'))]])));
        text.components.push(
          new Font(
            new Map([
              ['family', staticProperty('fontFamily', ['Arimo', 'sans-serif'])],
              ['size', staticProperty('number', 90)],
              ['weight', staticProperty('string', 'bold')],
            ]),
          ),
        );
        text.effects.push(
          new StrokeEffect(
            new Map([
              ['enabled', staticProperty('boolean', true)],
              ['style', staticProperty('string', style)],
              ['width', staticProperty('number', 12)],
              ['color', staticProperty('paint', solidPaint('black'))],
            ]),
          ),
        );
        word.text = 'DASH';
        return renderWord(word, { background: '#4444aa' }).data;
      };
      const blackPixels = (data) => {
        let count = 0;
        for (let index = 0; index < data.length; index += 4) {
          if (data[index] < 30 && data[index + 1] < 30 && data[index + 2] < 30 && data[index + 3] > 180) count += 1;
        }
        return count;
      };

      const solid = blackPixels(renderStyle('solid'));
      const dashed = blackPixels(renderStyle('dashed'));
      const dotted = blackPixels(renderStyle('dotted'));
      assert.ok(solid > dashed, `dashed stroke should cover fewer pixels than solid (${solid} vs ${dashed})`);
      assert.ok(solid > dotted, `dotted stroke should cover fewer pixels than solid (${solid} vs ${dotted})`);
    });
  },

  () => {
    test('render: Text strokes preserve gradient colors through effect layers', () => {
      for (const alignment of ['outside', 'center', 'inside']) {
        const word = new Word(`gradient-stroke-${alignment}`);
        const text = word.addComponent(
          new Text(
            new Map([
              ['color', staticProperty('paint', solidPaint('white'))],
              ['effectsInheritBaseAlpha', staticProperty('boolean', true)],
            ]),
          ),
        );
        text.components.push(
          new Font(
            new Map([
              ['family', staticProperty('fontFamily', ['Arimo', 'sans-serif'])],
              ['size', staticProperty('number', 90)],
              ['weight', staticProperty('string', 'bold')],
            ]),
          ),
        );
        text.effects.push(
          new StrokeEffect(
            new Map([
              ['enabled', staticProperty('boolean', true)],
              ['alignment', staticProperty('string', alignment)],
              ['width', staticProperty('number', 16)],
              [
                'color',
                staticProperty('paint', {
                  type: 'linear-gradient',
                  angle: 90,
                  stops: [
                    { offset: 0, color: 'red' },
                    { offset: 1, color: 'blue' },
                  ],
                }),
              ],
            ]),
          ),
        );
        word.text = 'DASH';

        const rendered = renderWord(word);
        assert.ok(
          hasColor(rendered.data, (red, green, blue) => red > 180 && green < 80 && blue < 80),
          `${alignment} stroke should contain the first gradient color`,
        );
        assert.ok(
          hasColor(rendered.data, (red, green, blue) => blue > 180 && red < 80 && green < 80),
          `${alignment} stroke should contain the last gradient color`,
        );
      }
    });
  },

  () => {
    test('Text.getMargins aggregates its outside stroke + shadow effects', () => {
      const text = new Text();
      text.effects.push(new StrokeEffect(new Map([['width', staticProperty('number', 20)]])));
      text.effects.push(
        new ShadowEffect(
          new Map([
            ['blurRadius', staticProperty('number', 5)],
            ['offset', staticProperty('vector2', { x: 2, y: 3 })],
          ]),
        ),
      );
      assert.deepEqual(text.getMargins(ctx({})), { x: 20 + 7, y: 20 + 8 });
    });
  },

  () => {
    test('render: direct entity border, shadow, and stroke effects use raster handlers', () => {
      const word = new Word('effects');
      word.box = { x: 20, y: 16, width: 40, height: 24 };
      word.addComponent(
        new BackgroundStyle(
          new Map([
            ['enabled', staticProperty('boolean', true)],
            ['fill', staticProperty('paint', solidPaint('rgb(255, 0, 0)'))],
          ]),
        ),
      );
      const border = new BorderEffect(
        new Map([
          ['enabled', staticProperty('boolean', true)],
          ['width', staticProperty('number', 2)],
          ['color', staticProperty('paint', solidPaint('white'))],
        ]),
      );
      const shadow = new ShadowEffect(
        new Map([
          ['enabled', staticProperty('boolean', true)],
          ['blurRadius', staticProperty('number', 0)],
          ['offset', staticProperty('vector2', { x: 6, y: 4 })],
          ['color', staticProperty('paint', solidPaint('black'))],
        ]),
      );
      const stroke = new StrokeEffect(
        new Map([
          ['enabled', staticProperty('boolean', true)],
          ['width', staticProperty('number', 2)],
          ['color', staticProperty('paint', solidPaint('green'))],
        ]),
      );
      word.addEffect(border);
      word.addEffect(shadow);
      word.addEffect(stroke);

      const calls = [];
      const originalBorder = border.strokeImage.bind(border);
      const originalShadow = shadow.castImage.bind(shadow);
      const originalStroke = stroke.strokeImage.bind(stroke);
      border.strokeImage = (...args) => {
        calls.push('border');
        return originalBorder(...args);
      };
      shadow.castImage = (...args) => {
        calls.push('shadow');
        return originalShadow(...args);
      };
      stroke.strokeImage = (...args) => {
        calls.push('stroke');
        return originalStroke(...args);
      };

      const canvas = new Canvas(80, 64);
      const context = canvas.getContext('2d');
      renderScene(word, context, ctx({}));

      assert.deepEqual(calls, ['border', 'shadow', 'stroke']);
      assert.ok(
        context.getImageData(19, 28, 1, 1).data[3] > 0,
        'expected the entity effect stack to paint an outer edge',
      );
    });
  },

  () => {
    test('ECS serialization preserves eight direct border, shadow, and stroke effects', () => {
      const visualEffects = ['border', 'shadow', 'stroke'].flatMap((effect) =>
        Array.from({ length: 8 }, (_, index) => ({
          effect,
          id: `${effect}-${index + 1}`,
          props: {},
        })),
      );
      const root = buildEcsTree(
        canonicalViewport({
          entity: 'compositionArea',
          id: 'compositionArea',
          children: [
            {
              entity: 'page',
              id: 'page',
              effects: visualEffects,
              children: [],
            },
          ],
        }),
      );
      const page = root.findById('page');
      assert.ok(page instanceof Page);
      assert.deepEqual(
        ['border', 'shadow', 'stroke'].map((effect) => page.effects.filter((item) => item.type === effect).length),
        [8, 8, 8],
      );

      const serialized = serializeEntityTree(root);
      const serializedPage = serialized.children
        .find((child) => child.entity === 'compositionArea')
        .children.find((child) => child.entity === 'page');
      assert.equal(serializedPage.effects.length, 24);
    });
  },

  () => {
    test('WipeReveal includes visual overflow from shadow, border, and stroke effects', () => {
      const effectFactories = [
        [
          'shadow',
          (color) =>
            new ShadowEffect(
              new Map([
                ['enabled', staticProperty('boolean', true)],
                ['color', staticProperty('paint', solidPaint(color))],
                ['opacity', staticProperty('number', 1)],
                ['blurRadius', staticProperty('number', 6)],
                ['offset', staticProperty('vector2', { x: 0, y: -8 })],
                ['useFontColor', staticProperty('boolean', false)],
              ]),
            ),
        ],
        [
          'border',
          (color) =>
            new BorderEffect(
              new Map([
                ['enabled', staticProperty('boolean', true)],
                ['width', staticProperty('number', 12)],
                ['position', staticProperty('string', 'outer')],
                ['color', staticProperty('paint', solidPaint(color))],
              ]),
            ),
        ],
        [
          'stroke',
          (color) =>
            new StrokeEffect(
              new Map([
                ['enabled', staticProperty('boolean', true)],
                ['width', staticProperty('number', 12)],
                ['color', staticProperty('paint', solidPaint(color))],
                ['opacity', staticProperty('number', 1)],
              ]),
            ),
        ],
      ];

      for (const [name, createEffect] of effectFactories) {
        const word = new Word(`word:wipe-overflow-${name}`);
        const bounds = { x: 20, y: 40.5, width: 100, height: 40 };
        word.box = bounds;
        const targetEffect = createEffect('blue');
        targetEffect.id = 'decoration';
        const targetBackground = new BackgroundStyle(
          new Map([
            ['enabled', staticProperty('boolean', true)],
            ['fill', staticProperty('paint', solidPaint('white'))],
          ]),
        );
        targetBackground.addEffect(targetEffect);
        word.addComponent(targetBackground);

        const source = new Word(`word:wipe-overflow-${name}-source`);
        const sourceEffect = createEffect('red');
        sourceEffect.id = 'decoration';
        const sourceBackground = new BackgroundStyle(
          new Map([
            ['enabled', staticProperty('boolean', true)],
            ['fill', staticProperty('paint', solidPaint('white'))],
          ]),
        );
        sourceBackground.addEffect(sourceEffect);
        source.addComponent(sourceBackground);
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

        const canvas = new Canvas(160, 120);
        const context = canvas.getContext('2d');
        renderScene(word, context, ctx());
        const { data } = context.getImageData(0, 0, 160, 120);
        let targetOverflowPixels = 0;
        let sourceOverflowPixels = 0;
        for (let y = 0; y < 120; y += 1) {
          for (let x = 0; x < 160; x += 1) {
            if (x >= bounds.x && x < bounds.x + bounds.width && y >= bounds.y && y < bounds.y + bounds.height) continue;
            const offset = (y * 160 + x) * 4;
            const red = data[offset];
            const green = data[offset + 1];
            const blue = data[offset + 2];
            if (blue > 40 && blue > red * 1.5 && blue > green * 1.5) targetOverflowPixels += 1;
            if (red > 40 && red > green * 1.5 && red > blue * 1.5) sourceOverflowPixels += 1;
          }
        }

        assert.ok(targetOverflowPixels > 0, `${name} should remain visible outside the entity box`);
        assert.equal(sourceOverflowPixels, 0, `${name} source styling must not bleed outside the entity box`);
      }
    });
  },

  () => {
    test('render: text stroke and shadow follow effect order exactly once', () => {
      const word = new Word('ordered');
      const text = word.addComponent(
        new Text(
          new Map([
            ['color', staticProperty('paint', solidPaint('white'))],
            ['effectsInheritBaseAlpha', staticProperty('boolean', false)],
          ]),
        ),
      );
      text.components.push(
        new Font(
          new Map([
            ['family', staticProperty('fontFamily', ['Arimo', 'sans-serif'])],
            ['size', staticProperty('number', 80)],
            ['weight', staticProperty('string', 'bold')],
          ]),
        ),
      );
      const stroke = new StrokeEffect(
        new Map([
          ['enabled', staticProperty('boolean', true)],
          ['width', staticProperty('number', 12)],
          ['color', staticProperty('paint', solidPaint('blue'))],
        ]),
      );
      const shadow = new ShadowEffect(
        new Map([
          ['enabled', staticProperty('boolean', true)],
          ['blurRadius', staticProperty('number', 0)],
          ['offset', staticProperty('vector2', { x: 12, y: 0 })],
          ['color', staticProperty('paint', solidPaint('black'))],
        ]),
      );
      text.effects.push(stroke, shadow);
      word.text = 'ORDER';

      const order = [];
      let baseStrokeContext;
      const originalStrokeGlyph = stroke.strokeGlyph.bind(stroke);
      const originalStrokeImage = stroke.strokeImage.bind(stroke);
      const originalCastImage = shadow.castImage.bind(shadow);
      stroke.strokeGlyph = (...args) => {
        order.push('stroke');
        baseStrokeContext = args[0];
        return originalStrokeGlyph(...args);
      };
      stroke.strokeImage = (...args) => {
        order.push('stroke');
        return originalStrokeImage(...args);
      };
      shadow.castImage = (...args) => {
        order.push('shadow');
        return originalCastImage(...args);
      };

      renderWord(word);
      assert.deepEqual(order, ['stroke', 'shadow']);
      assert.match(baseStrokeContext.font, /80px/);
      assert.equal(baseStrokeContext.textAlign, 'center');
      assert.equal(baseStrokeContext.textBaseline, 'alphabetic');

      order.length = 0;
      text.effects.reverse();
      renderWord(word);
      assert.deepEqual(order, ['shadow', 'stroke']);
    });
  },
];

for (const registerTest of testRegistrations) registerTest();
