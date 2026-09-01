const assert = require('node:assert/strict');
const test = require('node:test');
const { Canvas } = require('skia-canvas');

const {
  AnimationComponent,
  animationDurationForEntity,
  BackgroundStyle,
  GlowEffect,
  Image,
  ReplicatorEffect,
  Row,
  Text,
  Transform,
  Viewport,
  Word,
  buildEcsTree,
  defaultResolveContext,
  ensureEffectDefaults,
  prepareAnimationContext,
  resolveTrackTarget,
  serializeEntityTree,
  solidPaint,
  staticProperty,
} = require('../build/caption-engine/entity-system/index.js');

function animatedOpacityWord(id) {
  const word = new Word(id);
  word.lifecycle = 'incoming';
  const opacity = staticProperty('number', 1);
  word.addComponent(new Transform(new Map([['opacity', opacity]])));
  return { word, opacity };
}

test('Animation component evaluates a keyframe track without mutating its Property', () => {
  const { word, opacity } = animatedOpacityWord('word:current');
  word.addComponent(
    new AnimationComponent({
      name: 'Fade',
      phase: 'enter',
      durationSeconds: 1,
      tracks: [
        {
          enabled: true,
          target: 'Transform.opacity',
          keyframes: [
            { time: 0, value: 0, curve: 'linear' },
            { time: 1, value: 1 },
          ],
        },
      ],
    }),
  );

  const baseContext = defaultResolveContext({ lifecycle: 'incoming', elapsedSeconds: 0.5 });
  const animatedContext = prepareAnimationContext(word, baseContext);
  assert.equal(opacity.resolve(animatedContext), 0.5);
  assert.equal(opacity.base, 1);
});

test('active animation waits for entry completion and exit can start early', () => {
  const { word, opacity } = animatedOpacityWord('word:lifecycle-phases');
  word.addComponent(
    new AnimationComponent({
      phase: 'enter',
      delaySeconds: 0.5,
      durationSeconds: 1,
      tracks: [
        {
          enabled: true,
          target: 'Transform.opacity',
          keyframes: [
            { time: 0, value: 0 },
            { time: 1, value: 1 },
          ],
        },
      ],
    }),
  );
  word.addComponent(
    new AnimationComponent({
      phase: 'active',
      durationSeconds: 1,
      tracks: [
        {
          enabled: true,
          target: 'Transform.opacity',
          keyframes: [
            { time: 0, value: 1 },
            { time: 1, value: 0 },
          ],
        },
      ],
    }),
  );
  word.addComponent(
    new AnimationComponent({
      phase: 'exit',
      durationSeconds: 1,
      tracks: [
        {
          enabled: true,
          target: 'Transform.opacity',
          keyframes: [
            { time: 0, value: 1 },
            { time: 1, value: 0 },
          ],
        },
      ],
    }),
  );

  word.lifecycle = 'incoming';
  const duringEntryDelay = prepareAnimationContext(
    word,
    defaultResolveContext({ lifecycle: 'incoming', elapsedSeconds: 0.25 }),
  );
  assert.equal(opacity.resolve(duringEntryDelay), 0);

  const duringEntry = prepareAnimationContext(word, defaultResolveContext({ lifecycle: 'incoming', elapsedSeconds: 1 }));
  assert.equal(opacity.resolve(duringEntry), 0.5);

  const activeStart = prepareAnimationContext(word, defaultResolveContext({ lifecycle: 'incoming', elapsedSeconds: 1.5 }));
  assert.equal(opacity.resolve(activeStart), 1);

  const active = prepareAnimationContext(word, defaultResolveContext({ lifecycle: 'incoming', elapsedSeconds: 1.75 }));
  assert.equal(opacity.resolve(active), 0.75);
  assert.equal(animationDurationForEntity(word), 2.5);

  word.lifecycle = 'outgoing';
  const outgoing = prepareAnimationContext(word, defaultResolveContext({ lifecycle: 'outgoing', elapsedSeconds: 0.25 }));
  assert.equal(opacity.resolve(outgoing), 0.75);
});

test('sequential row lifecycles continue entry and gate active and exit phases', () => {
  const row = new Row('row:sequential');
  const opacity = staticProperty('number', 1);
  row.addComponent(new Transform(new Map([['opacity', opacity]])));
  row.lifecycleStartTimestampSeconds = 0;
  row.addComponent(
    new AnimationComponent({
      phase: 'enter',
      durationSeconds: 1,
      lifecycleScheduling: 'sequential',
      tracks: [
        {
          enabled: true,
          target: 'Transform.opacity',
          keyframes: [
            { time: 0, value: 0 },
            { time: 1, value: 1 },
          ],
        },
      ],
    }),
  );
  row.addComponent(
    new AnimationComponent({
      phase: 'active',
      durationSeconds: 1,
      lifecycleScheduling: 'sequential',
      tracks: [
        {
          enabled: true,
          target: 'Transform.opacity',
          keyframes: [
            { time: 0, value: 1 },
            { time: 1, value: 0 },
          ],
        },
      ],
    }),
  );
  row.addComponent(
    new AnimationComponent({
      phase: 'exit',
      durationSeconds: 1,
      lifecycleScheduling: 'sequential',
      tracks: [
        {
          enabled: true,
          target: 'Transform.opacity',
          keyframes: [
            { time: 0, value: 1 },
            { time: 1, value: 0 },
          ],
        },
      ],
    }),
  );

  row.lifecycle = 'static';
  const entry = prepareAnimationContext(
    row,
    defaultResolveContext({ lifecycle: 'static', elapsedSeconds: 0.5 }),
  );
  assert.equal(opacity.resolve(entry), 0.5);

  const active = prepareAnimationContext(
    row,
    defaultResolveContext({ lifecycle: 'static', elapsedSeconds: 1.5 }),
  );
  assert.equal(opacity.resolve(active), 0.5);

  row.lifecycle = 'outgoing';
  const exit = prepareAnimationContext(
    row,
    defaultResolveContext({ lifecycle: 'outgoing', elapsedSeconds: 2.5 }),
  );
  assert.equal(opacity.resolve(exit), 0.5);
  assert.equal(animationDurationForEntity(row), 3);
});

test('adaptive sequential row lifecycles fit the configured phases to row duration', () => {
  const row = new Row('row:adaptive-sequential');
  const opacity = staticProperty('number', 1);
  row.addComponent(new Transform(new Map([['opacity', opacity]])));
  row.lifecycleStartTimestampSeconds = 0;
  for (const definition of [
    {
      phase: 'enter',
      durationSeconds: 1,
      keyframes: [
        { time: 0, value: 0 },
        { time: 1, value: 1 },
      ],
    },
    {
      phase: 'active',
      durationSeconds: 2,
      keyframes: [
        { time: 0, value: 1 },
        { time: 2, value: 0 },
      ],
    },
    {
      phase: 'exit',
      durationSeconds: 1,
      keyframes: [
        { time: 0, value: 1 },
        { time: 1, value: 0 },
      ],
    },
  ]) {
    row.addComponent(
      new AnimationComponent({
        ...definition,
        lifecycleScheduling: 'sequential',
        triggerBehavior: 'adaptive',
        tracks: [
          {
            enabled: true,
            target: 'Transform.opacity',
            keyframes: definition.keyframes,
          },
        ],
      }),
    );
  }

  const duringEntry = prepareAnimationContext(
    row,
    defaultResolveContext({ lifecycle: 'static', elapsedSeconds: 0.25, rowDurationSeconds: 2 }),
  );
  assert.equal(opacity.resolve(duringEntry), 0.5);

  const duringActive = prepareAnimationContext(
    row,
    defaultResolveContext({ lifecycle: 'static', elapsedSeconds: 0.75, rowDurationSeconds: 2 }),
  );
  assert.equal(opacity.resolve(duringActive), 0.75);

  row.lifecycle = 'outgoing';
  const duringExit = prepareAnimationContext(
    row,
    defaultResolveContext({ lifecycle: 'outgoing', elapsedSeconds: 1.75, rowDurationSeconds: 2 }),
  );
  assert.equal(opacity.resolve(duringExit), 0.5);
});

test('active playback modes support loop and ping-pong timing', () => {
  const { word, opacity } = animatedOpacityWord('word:playback-modes');
  const animation = new AnimationComponent({
    phase: 'active',
    playbackMode: 'loop',
    durationSeconds: 1,
    tracks: [
      {
        enabled: true,
        target: 'Transform.opacity',
        keyframes: [
          { time: 0, value: 0 },
          { time: 1, value: 1 },
        ],
      },
    ],
  });
  word.addComponent(animation);

  const looped = prepareAnimationContext(word, defaultResolveContext({ lifecycle: 'incoming', elapsedSeconds: 1.25 }));
  assert.equal(opacity.resolve(looped), 0.25);

  animation.definition.playbackMode = 'pingPong';
  const reversed = prepareAnimationContext(word, defaultResolveContext({ lifecycle: 'incoming', elapsedSeconds: 1.25 }));
  assert.equal(opacity.resolve(reversed), 0.75);
});

test('Animation skips tracks whose component target is disabled', () => {
  const word = new Word('word:disabled-target');
  const imageColor = staticProperty('paint', solidPaint('#ffffff'));
  const image = word.addComponent(
    new Image(
      new Map([
        ['enabled', staticProperty('boolean', false)],
        ['color', imageColor],
      ]),
    ),
  );
  word.addComponent(
    new AnimationComponent({
      phase: 'custom',
      durationSeconds: 1,
      tracks: [
        {
          enabled: true,
          target: 'Image.color',
          keyframes: [
            { time: 0, value: solidPaint('#000000') },
            { time: 1, value: solidPaint('#ff0000') },
          ],
        },
      ],
    }),
  );

  const context = prepareAnimationContext(word, defaultResolveContext({ elapsedSeconds: 0.5 }));
  assert.equal(image.isEnabled(context), false);
  assert.deepEqual(imageColor.resolve(context), solidPaint('#ffffff'));
});

test('adaptive trigger behavior shortens only when the next trigger arrives sooner', () => {
  const { word, opacity } = animatedOpacityWord('word:adaptive');
  word.addComponent(
    new AnimationComponent({
      phase: 'custom',
      durationSeconds: 0.3,
      triggerBehavior: 'adaptive',
      tracks: [
        {
          enabled: true,
          target: 'Transform.opacity',
          keyframes: [
            { time: 0, value: 0 },
            { time: 0.3, value: 1 },
          ],
        },
      ],
    }),
  );

  const fast = prepareAnimationContext(
    word,
    defaultResolveContext({ elapsedSeconds: 0.15, triggerIntervalSeconds: 0.15 }),
  );
  assert.equal(opacity.resolve(fast), 1);

  const long = prepareAnimationContext(
    word,
    defaultResolveContext({ elapsedSeconds: 0.2, triggerIntervalSeconds: 0.5 }),
  );
  assert.ok(Math.abs(opacity.resolve(long) - 2 / 3) < 1e-9);

  const first = prepareAnimationContext(word, defaultResolveContext({ elapsedSeconds: 0.15 }));
  assert.equal(opacity.resolve(first), 0.5);
});

test('restart and continue trigger behaviors keep their distinct timing semantics', () => {
  const { word, opacity } = animatedOpacityWord('word:trigger-behaviors');
  const animation = new AnimationComponent({
    phase: 'custom',
    durationSeconds: 1,
    triggerBehavior: 'restart',
    tracks: [
      {
        enabled: true,
        target: 'Transform.opacity',
        keyframes: [
          { time: 0, value: 0 },
          { time: 1, value: 1 },
        ],
      },
    ],
  });
  word.addComponent(animation);

  const restarted = prepareAnimationContext(
    word,
    defaultResolveContext({ elapsedSeconds: 0.2, triggerIntervalSeconds: 0.05 }),
  );
  assert.equal(opacity.resolve(restarted), 0.2);

  animation.definition.triggerBehavior = 'continue';
  const continued = prepareAnimationContext(
    word,
    defaultResolveContext({ elapsedSeconds: 0.2, triggerTimestampSeconds: 0.5, triggerIntervalSeconds: 0.05 }),
  );
  assert.equal(opacity.resolve(continued), 0.7);
});

test('Animation component normalizes and interpolates Paint keyframes', () => {
  const paint = staticProperty('paint', solidPaint('#000000'));
  const word = new Word('word:paint-animation');
  word.addComponent(new Text(new Map([['color', paint]])));
  word.addComponent(
    new AnimationComponent({
      name: 'Paint Fade',
      phase: 'custom',
      durationSeconds: 1,
      tracks: [
        {
          enabled: true,
          target: 'Text.color',
          keyframes: [
            { time: 0, value: solidPaint('#000000') },
            { time: 1, value: solidPaint('#ffffff') },
          ],
        },
      ],
    }),
  );

  const context = prepareAnimationContext(word, defaultResolveContext({ elapsedSeconds: 0.5 }));
  assert.deepEqual(paint.resolve(context), solidPaint('rgba(128, 128, 128, 1)'));
});

test('children scope applies stagger interval in child order', () => {
  const root = new Viewport('viewport');
  const first = animatedOpacityWord('word:first');
  const second = animatedOpacityWord('word:second');
  root.addChild(first.word);
  root.addChild(second.word);
  root.addComponent(
    new AnimationComponent({
      name: 'Staggered Fade',
      phase: 'enter',
      scope: 'children',
      durationSeconds: 1,
      sequencer: { pattern: 'stagger', interval: 0.25, reverse: false, seed: 0 },
      tracks: [
        {
          enabled: true,
          target: 'Transform.opacity',
          keyframes: [
            { time: 0, value: 0, curve: 'linear' },
            { time: 1, value: 1 },
          ],
        },
      ],
    }),
  );

  const context = prepareAnimationContext(
    root,
    defaultResolveContext({ lifecycle: 'incoming', elapsedSeconds: 0.5 }),
  );
  assert.equal(first.opacity.resolve(context), 0.5);
  assert.equal(second.opacity.resolve(context), 0.25);
});

test('random-values tracks are deterministic when updateEveryFrame is false', () => {
  const { word, opacity } = animatedOpacityWord('word:random');
  word.addComponent(
    new AnimationComponent({
      name: 'Random Opacity',
      phase: 'custom',
      tracks: [
        {
          enabled: true,
          target: 'Transform.opacity',
          sampling: 'randomValues',
          updateEveryFrame: false,
          keyframes: [
            { time: 0, value: 0.25 },
            { time: 1, value: 0.75 },
          ],
        },
      ],
    }),
  );

  const first = opacity.resolve(prepareAnimationContext(word, defaultResolveContext({ frameIndex: 1 })));
  const second = opacity.resolve(prepareAnimationContext(word, defaultResolveContext({ frameIndex: 100 })));
  assert.equal(first, second);
  assert.ok(first === 0.25 || first === 0.75);
});

test('ECS parser and serializer round-trip Animation components', () => {
  const design = {
    entity: 'viewport',
    id: 'viewport',
    components: [
      {
        component: 'animation',
        enabled: true,
        name: 'Pop',
        phase: 'active',
        playbackMode: 'pingPong',
        scope: 'descendants',
        durationSeconds: 0.2,
        delaySeconds: 0.05,
        triggerBehavior: 'restart',
        sequencer: { pattern: 'wave', interval: 0.03, reverse: false, seed: 7 },
        tracks: [
          {
            enabled: true,
            target: 'Transform.scale',
            keyframes: [
              { time: 0, value: { x: 0.8, y: 0.8 }, curve: 'easeOut' },
              { time: 0.2, value: { x: 1, y: 1 } },
            ],
          },
        ],
      },
    ],
    children: [
      {
        entity: 'videoArea',
        id: 'videoArea',
        components: [{ component: 'layout' }],
        children: [{ entity: 'video', id: 'video', components: [] }],
      },
      { entity: 'compositionArea', id: 'compositionArea', components: [] },
    ],
  };

  const serialized = serializeEntityTree(buildEcsTree(design));
  const animation = serialized.components.find((component) => component.component === 'animation');
  assert.equal(animation.name, 'Pop');
  assert.equal(animation.phase, 'active');
  assert.equal(animation.playbackMode, 'pingPong');
  assert.equal(animation.scope, 'descendants');
  assert.equal(animation.triggerBehavior, 'restart');
  assert.equal(animation.sequencer.pattern, 'wave');
  assert.deepEqual(animation.tracks[0].keyframes, design.components[0].tracks[0].keyframes);
});

test('canonical active phase preserves loop playback', () => {
  const tree = buildEcsTree({
    entity: 'viewport',
    id: 'viewport',
    components: [{ component: 'animation', phase: 'active', playbackMode: 'loop', tracks: [] }],
    children: [
      {
        entity: 'videoArea',
        id: 'videoArea',
        components: [{ component: 'layout' }],
        children: [{ entity: 'video', id: 'video', components: [] }],
      },
      { entity: 'compositionArea', id: 'compositionArea', components: [] },
    ],
  });
  const animation = serializeEntityTree(tree).components.find((component) => component.component === 'animation');
  assert.equal(animation.phase, 'active');
  assert.equal(animation.playbackMode, 'loop');
});

test('Viewport-root animation targets resolve Typewriter properties after ECS round-trip', () => {
  const unitTracks = [
    {
      enabled: true,
      target: 'unit.scale',
      mode: 'absolute',
      keyframes: [
        { time: 0, value: { x: 0.8, y: 0.8 } },
        { time: 1, value: { x: 1, y: 1 } },
      ],
    },
  ];
  const design = {
    entity: 'viewport',
    id: 'viewport',
    components: [
      {
        component: 'animation',
        scope: 'descendants',
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
              { time: 0, value: 1 },
              { time: 1, value: 3 },
            ],
          },
        ],
      },
    ],
    children: [
      {
        entity: 'videoArea',
        id: 'videoArea',
        components: [{ component: 'layout' }],
        children: [{ entity: 'video', id: 'video', components: [] }],
      },
      {
        entity: 'compositionArea',
        id: 'compositionArea',
        children: [
          {
            entity: 'word',
            id: 'word:typewriter',
            components: [
              {
                component: 'text',
                props: {
                  letterSpacing: { type: 'number', value: 6 },
                },
              },
            ],
            effects: [
              {
                effect: 'typewriter',
                id: 'tw',
                props: {
                  revealMode: { type: 'string', value: 'manual' },
                  reveal: { type: 'number', value: 0.5 },
                  unitTracks: { type: 'array', value: unitTracks },
                  cursor: {
                    blink: {
                      rate: { type: 'number', value: 2 },
                    },
                  },
                },
              },
            ],
          },
        ],
      },
    ],
  };

  const tree = buildEcsTree(design);
  const word = tree.findById('word:typewriter');
  assert.ok(word);

  const reveal = resolveTrackTarget(word, 'Typewriter#tw.reveal');
  const blinkRate = resolveTrackTarget(word, 'Typewriter#tw.cursor.blink.rate');
  assert.ok(reveal);
  assert.ok(blinkRate);
  assert.equal(blinkRate.resolve(defaultResolveContext()), 2);

  const serialized = serializeEntityTree(tree);
  const serializedWord = serialized.children
    .find((child) => child.entity === 'compositionArea')
    .children.find((child) => child.id === 'word:typewriter');
  const serializedText = serializedWord.components.find((component) => component.component === 'text');
  const serializedTypewriter = serializedWord.effects.find((effect) => effect.id === 'tw');
  assert.equal(serializedText.props.letterSpacing.value, 6);
  assert.deepEqual(serializedTypewriter.props.unitTracks.value, unitTracks);
  assert.equal(serializedTypewriter.props.cursor.blink.rate.value, 2);
});

test('qualified effect tracks resolve separate same-type effect instances', () => {
  const word = new Word('word:glows');
  word.lifecycle = 'incoming';
  const firstBlurRadius = staticProperty('number', 4);
  const secondBlurRadius = staticProperty('number', 8);
  const firstGlow = new GlowEffect(new Map([['blurRadius', firstBlurRadius]]));
  const secondGlow = new GlowEffect(new Map([['blurRadius', secondBlurRadius]]));
  firstGlow.id = 'glow-first';
  secondGlow.id = 'glow-second';
  word.addEffect(firstGlow);
  word.addEffect(secondGlow);
  word.addComponent(
    new AnimationComponent({
      name: 'Glow Radius',
      phase: 'enter',
      durationSeconds: 1,
      tracks: [
        {
          enabled: true,
          target: 'Glow#glow-first.blurRadius',
          keyframes: [
            { time: 0, value: 0, curve: 'linear' },
            { time: 1, value: 10 },
          ],
        },
        {
          enabled: true,
          target: 'Glow#glow-second.blurRadius',
          keyframes: [
            { time: 0, value: 0, curve: 'linear' },
            { time: 1, value: 20 },
          ],
        },
      ],
    }),
  );

  const context = prepareAnimationContext(
    word,
    defaultResolveContext({ lifecycle: 'incoming', elapsedSeconds: 0.5 }),
  );
  assert.equal(firstBlurRadius.resolve(context), 5);
  assert.equal(secondBlurRadius.resolve(context), 10);
});

test('Gradient Glow composites a gradient halo around the source layer', () => {
  const glow = new GlowEffect(
    new Map([
      ['blurRadius', staticProperty('number', 8)],
      ['strength', staticProperty('number', 1)],
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
  );
  const canvas = new Canvas(120, 80);
  const context = canvas.getContext('2d');
  glow.apply(context, defaultResolveContext(), () => {
    context.fillStyle = '#ffffff';
    context.fillRect(40, 25, 40, 30);
  }, { paintBounds: { x: 40, y: 25, width: 40, height: 30 } });

  const pixels = context.getImageData(0, 0, 120, 80).data;
  const pixelAt = (x, y) => pixels.slice((y * 120 + x) * 4, (y * 120 + x) * 4 + 4);
  const left = pixelAt(34, 40);
  const right = pixelAt(86, 40);
  assert.ok(left[3] > 0 && left[0] > left[2], 'left halo follows the first gradient stop');
  assert.ok(right[3] > 0 && right[2] > right[0], 'right halo follows the final gradient stop');
  assert.ok(pixelAt(60, 40)[0] > 200, 'the source layer remains visible above the halo');
  assert.deepEqual(glow.getMargins(defaultResolveContext()), { x: 8, y: 8 });
});

test('Inner Glow stays inside the source shape and does not expand bounds', () => {
  const glow = new GlowEffect(
    new Map([
      ['mode', staticProperty('string', 'inner')],
      ['blurRadius', staticProperty('number', 8)],
      ['strength', staticProperty('number', 1)],
      ['color', staticProperty('paint', solidPaint('#ff0000'))],
    ]),
  );
  const canvas = new Canvas(120, 80);
  const context = canvas.getContext('2d');
  glow.apply(
    context,
    defaultResolveContext(),
    () => {
      context.fillStyle = '#ffffff';
      context.fillRect(40, 25, 40, 30);
    },
    { includeOriginal: false, paintBounds: { x: 40, y: 25, width: 40, height: 30 } },
  );

  const pixels = context.getImageData(0, 0, 120, 80).data;
  const pixelAt = (x, y) => pixels.slice((y * 120 + x) * 4, (y * 120 + x) * 4 + 4);
  assert.equal(pixelAt(34, 40)[3], 0, 'inner Glow must not paint outside the source shape');
  assert.ok(pixelAt(42, 40)[3] > 0, 'inner Glow must paint near the inside edge');
  assert.equal(pixelAt(60, 40)[3], 0, 'inner Glow must fade away from the inside edge');
  assert.deepEqual(glow.getMargins(defaultResolveContext()), { x: 0, y: 0 });
});

test('Replicator generates bounded virtual copies with stable IDs and overrides', () => {
  const effect = new ReplicatorEffect(
    new Map([
      ['cloneCount', staticProperty('number', 4)],
      ['position', staticProperty('vector2', { x: 10, y: 10 })],
      ['rotation', staticProperty('number', 15)],
      ['scale', staticProperty('vector2', { x: 0.1, y: 0.2 })],
      ['opacity', staticProperty('number', -0.2)],
      ['copyOverrides.copy_2.transform.position', staticProperty('vector2', { x: 25, y: 15 })],
      ['copyOverrides.copy_2.fill', staticProperty('paint', solidPaint('#ff0000'))],
    ]),
  );

  const copies = effect.prepareVirtualCopies(defaultResolveContext(), {
    bounds: { width: 20, height: 10 },
    color: solidPaint('#ffffff'),
  });
  assert.deepEqual(copies.map((copy) => copy.id), ['copy_1', 'copy_2', 'copy_3', 'copy_4']);
  assert.deepEqual(copies[0].transform.position.resolve(defaultResolveContext()), { x: 10, y: 10 });
  assert.deepEqual(copies[1].transform.position.resolve(defaultResolveContext()), { x: 25, y: 15 });
  assert.equal(copies[0].transform.rotation.resolve(defaultResolveContext()), 15);
  assert.equal(copies[1].transform.rotation.resolve(defaultResolveContext()), 30);
  assert.deepEqual(copies[1].transform.scale.resolve(defaultResolveContext()), { x: 1.2, y: 1.4 });
  assert.equal(copies[1].transform.opacity.resolve(defaultResolveContext()), 0.6);
  assert.deepEqual(copies[1].fill.resolve(defaultResolveContext()), solidPaint('#ff0000'));
  const margins = effect.getMargins(defaultResolveContext(), { bounds: { width: 20, height: 10 } });
  assert.ok(Math.abs(margins.x - 44.79422863405995) < 1e-9);
  assert.ok(Math.abs(margins.y - 51.62435565298214) < 1e-9);

  effect.getProp('cloneCount').setBase(0);
  assert.equal(effect.getCloneCount(defaultResolveContext()), 1);
  effect.getProp('cloneCount').setBase(2048);
  assert.equal(effect.getCloneCount(defaultResolveContext()), 1024);

  const firstCopy = copies[0];
  effect.getProp('cloneCount').setBase(1);
  effect.prepareVirtualCopies(defaultResolveContext());
  assert.equal(effect.getVirtualProperty('copyOverrides.copy_2.transform.position'), undefined);
  effect.getProp('cloneCount').setBase(2);
  const restored = effect.prepareVirtualCopies(defaultResolveContext());
  assert.equal(restored[0], firstCopy, 'an active copy keeps its record identity across count changes');
});

test('Replicator random fills are deterministic and follow stable copy IDs', () => {
  const copyIds = staticProperty('array', ['copy_1', 'copy_2', 'copy_3']);
  const effect = new ReplicatorEffect(
    new Map([
      ['cloneCount', staticProperty('number', 3)],
      ['copyIds', copyIds],
      ['fillMode', staticProperty('string', 'random')],
      ['fillSeed', staticProperty('number', 42)],
      ['customFills', staticProperty('array', [
        solidPaint('#ff4d4f'),
        solidPaint('#40a9ff'),
        solidPaint('#73d13d'),
      ])],
    ]),
  );
  const resolve = defaultResolveContext();
  const first = effect.prepareVirtualCopies(resolve, { color: solidPaint('#ffffff') });
  const firstFills = Object.fromEntries(first.map((copy) => [copy.id, copy.fill.resolve(resolve)]));
  const repeated = effect.prepareVirtualCopies(resolve, { color: solidPaint('#ffffff') });
  assert.deepEqual(
    Object.fromEntries(repeated.map((copy) => [copy.id, copy.fill.resolve(resolve)])),
    firstFills,
  );
  assert.equal(new Set(Object.values(firstFills).map((paint) => paint.color)).size, 3, 'each stable copy ID receives a distinct generated fill');

  copyIds.setBase(['copy_3', 'copy_1', 'copy_2']);
  const reordered = effect.prepareVirtualCopies(resolve, { color: solidPaint('#ffffff') });
  assert.deepEqual(reordered.map((copy) => copy.id), ['copy_3', 'copy_1', 'copy_2']);
  assert.deepEqual(
    Object.fromEntries(reordered.map((copy) => [copy.id, copy.fill.resolve(resolve)])),
    firstFills,
    'reordering keeps generated fills attached to the stable copy IDs',
  );

  effect.getProp('fillMode').setBase('inherit');
  const inherited = effect.prepareVirtualCopies(resolve, { color: solidPaint('#abcdef') });
  assert.deepEqual(
    inherited.map((copy) => copy.fill.resolve(resolve)),
    [solidPaint('#abcdef'), solidPaint('#abcdef'), solidPaint('#abcdef')],
  );

  effect.getProp('fillMode').setBase('custom');
  const gradientFill = {
    type: 'linear-gradient',
    angle: 90,
    stops: [
      { offset: 0, color: '#ff0000' },
      { offset: 1, color: '#0000ff' },
    ],
  };
  effect.getProp('customFills').setBase([solidPaint('#ff0000'), gradientFill]);
  const custom = effect.prepareVirtualCopies(resolve, { color: solidPaint('#abcdef') });
  assert.deepEqual(
    custom.map((copy) => copy.fill.resolve(resolve)),
    [solidPaint('#ff0000'), gradientFill, solidPaint('#ff0000')],
    'custom fills cycle across virtual copies and preserve paint types',
  );
});

test('Replicator raster copies render custom gradient fills', () => {
  const gradientFill = {
    type: 'linear-gradient',
    angle: 90,
    stops: [
      { offset: 0, color: '#ff0000' },
      { offset: 1, color: '#0000ff' },
    ],
  };
  const effect = new ReplicatorEffect(
    new Map([
      ['cloneCount', staticProperty('number', 1)],
      ['showOriginal', staticProperty('string', 'none')],
      ['fillMode', staticProperty('string', 'custom')],
      ['customFills', staticProperty('array', [gradientFill])],
    ]),
  );
  const input = new Canvas(16, 16);
  const inputContext = input.getContext('2d');
  inputContext.fillStyle = '#ffffff';
  inputContext.fillRect(4, 4, 8, 8);
  const baseInput = new Canvas(16, 16);
  const baseInputContext = baseInput.getContext('2d');
  baseInputContext.fillStyle = '#ffffff';
  baseInputContext.fillRect(4, 4, 8, 8);
  const output = new Canvas(16, 16);
  effect.renderCopies(
    output.getContext('2d'),
    input,
    defaultResolveContext(),
    inputContext.getTransform(),
    { bounds: { width: 8, height: 8 }, color: solidPaint('#ffffff') },
    baseInput,
  );
  const pixels = output.getContext('2d').getImageData(0, 0, 16, 16).data;
  const pixelAt = (x, y) => pixels.slice((y * 16 + x) * 4, (y * 16 + x + 1) * 4);
  const left = pixelAt(5, 8);
  const right = pixelAt(10, 8);
  assert.ok(left[0] > left[2], 'the first gradient stop reaches the clone');
  assert.ok(right[2] > right[0], 'the final gradient stop reaches the clone');
});

test('Replicator pattern animation resolves before copy animation', () => {
  const word = new Word('word:replicator');
  const text = new Text(new Map([['color', staticProperty('paint', solidPaint('#ffffff'))]]));
  const effect = new ReplicatorEffect(
    new Map([
      ['cloneCount', staticProperty('number', 2)],
      ['position', staticProperty('vector2', { x: 0, y: 0 })],
    ]),
  );
  effect.id = 'replicator-main';
  text.effects.push(effect);
  word.addComponent(text);
  word.addComponent(
    new AnimationComponent({
      phase: 'custom',
      durationSeconds: 1,
      tracks: [
        {
          enabled: true,
          target: 'Replicator#replicator-main.position',
          keyframes: [
            { time: 0, value: { x: 0, y: 0 } },
            { time: 1, value: { x: 10, y: 20 } },
          ],
        },
        {
          enabled: true,
          target: 'Replicator#replicator-main.copyOverrides.copy_2.transform.position',
          keyframes: [
            { time: 0, value: { x: 0, y: 0 } },
            { time: 1, value: { x: 25, y: 15 } },
          ],
        },
        {
          enabled: true,
          target: 'Replicator#replicator-main.copyOverrides.copy_2.fill',
          keyframes: [
            { time: 0, value: solidPaint('#ffffff') },
            { time: 1, value: solidPaint('#ff0000') },
          ],
        },
      ],
    }),
  );

  const animated = prepareAnimationContext(word, defaultResolveContext({ elapsedSeconds: 0.5 }));
  const copies = effect.prepareVirtualCopies(animated, { bounds: { width: 20, height: 10 }, color: solidPaint('#ffffff') });
  assert.deepEqual(copies[0].transform.position.resolve(animated), { x: 5, y: 10 });
  assert.deepEqual(copies[1].transform.position.resolve(animated), { x: 12.5, y: 7.5 });
  assert.deepEqual(copies[1].fill.resolve(animated), solidPaint('rgba(255, 128, 128, 1)'));
  assert.equal(resolveTrackTarget(word, 'Replicator#replicator-main.copyOverrides.copy_2.fill'), copies[1].fill);
  assert.equal(word.children.length, 0, 'virtual copies stay out of the physical entity hierarchy');
});

test('Replicator tints only the base Text raster and preserves effect pixels', () => {
  const effect = new ReplicatorEffect(
    new Map([
      ['cloneCount', staticProperty('number', 1)],
      ['copyOverrides.copy_1.fill', staticProperty('paint', solidPaint('#ff0000'))],
    ]),
  );
  const input = new Canvas(20, 20);
  const inputContext = input.getContext('2d');
  inputContext.fillStyle = '#ffffff';
  inputContext.fillRect(8, 8, 4, 4);
  inputContext.fillStyle = '#0000ff';
  inputContext.fillRect(14, 8, 2, 2);
  const baseInput = new Canvas(20, 20);
  const baseInputContext = baseInput.getContext('2d');
  baseInputContext.fillStyle = '#ffffff';
  baseInputContext.fillRect(8, 8, 4, 4);
  const output = new Canvas(20, 20);
  effect.renderCopies(output.getContext('2d'), input, defaultResolveContext(), inputContext.getTransform(), {
    bounds: { width: 4, height: 4 },
    color: solidPaint('#ffffff'),
  }, baseInput);
  const pixels = output.getContext('2d').getImageData(0, 0, 20, 20).data;
  const pixelAt = (x, y) => pixels.slice((y * 20 + x) * 4, (y * 20 + x + 1) * 4);
  const basePixel = pixelAt(10, 10);
  assert.ok(basePixel[0] > 200);
  assert.ok(basePixel[1] < 40);
  assert.ok(basePixel[2] < 40);
  assert.ok(basePixel[3] > 200);
  const effectPixel = pixelAt(14, 8);
  assert.ok(effectPixel[0] < 40);
  assert.ok(effectPixel[1] < 40);
  assert.ok(effectPixel[2] > 200);
  assert.ok(effectPixel[3] > 200);
});

test('Replicator raster copies apply local position, dimensions, and opacity', () => {
  const effect = new ReplicatorEffect(
    new Map([
      ['cloneCount', staticProperty('number', 1)],
      ['copyOverrides.copy_1.transform.position', staticProperty('vector2', { x: 4, y: 0 })],
      ['copyOverrides.copy_1.transform.dimensions', staticProperty('vector2', { x: 8, y: 8 })],
      ['copyOverrides.copy_1.transform.opacity', staticProperty('number', 0.5)],
    ]),
  );
  const input = new Canvas(24, 24);
  const inputContext = input.getContext('2d');
  inputContext.fillStyle = '#ffffff';
  inputContext.fillRect(2, 2, 4, 4);
  const output = new Canvas(24, 24);
  effect.renderCopies(output.getContext('2d'), input, defaultResolveContext(), inputContext.getTransform(), {
    bounds: { width: 4, height: 4 },
    color: solidPaint('#ffffff'),
  });

  const pixels = output.getContext('2d').getImageData(0, 0, 24, 24).data;
  const pixelAt = (x, y) => pixels[(y * 24 + x) * 4 + 3];
  assert.equal(pixelAt(3, 3), 0, 'the copy is translated away from its source position');
  assert.ok(pixelAt(9, 5) > 100 && pixelAt(9, 5) < 200, 'the resized copy has the requested opacity');
  assert.ok(pixelAt(11, 5) > 100 && pixelAt(11, 5) < 200, 'the requested dimensions affect the copy extent');
});

test('BackgroundStyle-owned Replicator copies preserve the painted source fill', () => {
  const background = new BackgroundStyle(new Map([['fill', staticProperty('paint', solidPaint('#ffffff'))]]));
  background.addEffect(
    new ReplicatorEffect(
      new Map([
        ['cloneCount', staticProperty('number', 1)],
        ['copyOverrides.copy_1.transform.position', staticProperty('vector2', { x: 4, y: 0 })],
        ['copyOverrides.copy_1.transform.dimensions', staticProperty('vector2', { x: 12, y: 12 })],
        ['copyOverrides.copy_1.transform.opacity', staticProperty('number', 0.5)],
        ['copyOverrides.copy_1.fill', staticProperty('paint', solidPaint('#00ff00'))],
      ]),
    ),
  );
  const canvas = new Canvas(32, 32);
  const context = canvas.getContext('2d');
  context.translate(10, 10);
  background.paintBox(context, { x: -2, y: -2, width: 4, height: 4 }, defaultResolveContext());

  const pixel = canvas.getContext('2d').getImageData(17, 10, 1, 1).data;
  assert.ok(pixel[0] > 180 && pixel[1] > 180 && pixel[2] > 180, 'non-Text copies keep the painted source fill');
  assert.ok(pixel[3] > 100 && pixel[3] < 200, 'the copy uses its virtual opacity');
});

test('Replicator showOriginal controls source layer ordering', () => {
  const defaultEffect = new ReplicatorEffect();
  ensureEffectDefaults(defaultEffect);
  assert.equal(defaultEffect.getShowOriginal(defaultResolveContext()), 'front');
  assert.equal(defaultEffect.getCloneOrdering(defaultResolveContext()), 'backToFront');
  assert.equal(defaultEffect.getProp('fillTarget').resolve(defaultResolveContext()), 'base');
  assert.deepEqual(defaultEffect.getProp('position').resolve(defaultResolveContext()), { x: 4, y: 4 });
  assert.deepEqual(defaultEffect.getProp('customFills').resolve(defaultResolveContext()), [
    solidPaint('#ff4d4f'),
    solidPaint('#40a9ff'),
    solidPaint('#73d13d'),
  ]);

  const paint = (showOriginal, position = { x: 0, y: 0 }) => {
    const input = new Canvas(24, 24);
    const inputContext = input.getContext('2d');
    inputContext.fillStyle = '#ffffff';
    inputContext.fillRect(8, 8, 4, 4);
    const effect = new ReplicatorEffect(
      new Map([
        ['cloneCount', staticProperty('number', 1)],
        ['showOriginal', staticProperty('string', showOriginal)],
        ['position', staticProperty('vector2', position)],
        ['copyOverrides.copy_1.fill', staticProperty('paint', solidPaint('#ff0000'))],
      ]),
    );
    const baseInput = new Canvas(24, 24);
    const baseInputContext = baseInput.getContext('2d');
    baseInputContext.fillStyle = '#ffffff';
    baseInputContext.fillRect(8, 8, 4, 4);
    const canvas = new Canvas(24, 24);
    effect.renderCopies(canvas.getContext('2d'), input, defaultResolveContext(), inputContext.getTransform(), {
      bounds: { width: 4, height: 4 },
      color: solidPaint('#ffffff'),
    }, baseInput);
    return canvas.getContext('2d').getImageData(0, 0, 24, 24).data;
  };
  const pixelAt = (pixels, x, y) => pixels.slice((y * 24 + x) * 4, (y * 24 + x + 1) * 4);

  const none = paint('none', { x: 4, y: 0 });
  assert.equal(pixelAt(none, 9, 9)[3], 0, 'none suppresses the original source');
  assert.ok(pixelAt(none, 13, 9)[0] > 200, 'none still paints the virtual copy');

  const back = pixelAt(paint('back'), 9, 9);
  assert.ok(back[0] > 200 && back[1] < 40, 'back paints the copy over the original');

  const front = pixelAt(paint('front'), 9, 9);
  assert.ok(front[0] > 200 && front[1] > 200, 'front paints the original over the copy');
});

test('Replicator fill target controls whether effects are recolored', () => {
  const input = new Canvas(24, 24);
  const inputContext = input.getContext('2d');
  inputContext.fillStyle = '#ffffff';
  inputContext.fillRect(8, 8, 4, 4);
  inputContext.fillStyle = '#ff0000';
  inputContext.fillRect(7, 8, 1, 4);
  inputContext.fillRect(12, 8, 1, 4);

  const baseInput = new Canvas(24, 24);
  const baseInputContext = baseInput.getContext('2d');
  baseInputContext.fillStyle = '#ffffff';
  baseInputContext.fillRect(8, 8, 4, 4);

  const paint = (fillTarget) => {
    const effect = new ReplicatorEffect(
      new Map([
        ['cloneCount', staticProperty('number', 1)],
        ['showOriginal', staticProperty('string', 'none')],
        ['position', staticProperty('vector2', { x: 4, y: 0 })],
        ['fillMode', staticProperty('string', 'custom')],
        ['fillTarget', staticProperty('string', fillTarget)],
        ['customFills', staticProperty('array', [solidPaint('#0000ff')])],
      ]),
    );
    const output = new Canvas(24, 24);
    effect.renderCopies(
      output.getContext('2d'),
      input,
      defaultResolveContext(),
      inputContext.getTransform(),
      { bounds: { width: 4, height: 4 }, color: solidPaint('#ffffff') },
      baseInput,
    );
    return output.getContext('2d').getImageData(0, 0, 24, 24).data;
  };
  const pixelAt = (pixels, x, y) => pixels.slice((y * 24 + x) * 4, (y * 24 + x + 1) * 4);

  const base = paint('base');
  const baseContent = pixelAt(base, 13, 9);
  const baseEffect = pixelAt(base, 11, 9);
  assert.ok(baseContent[2] > 200 && baseContent[0] < 40, 'base content uses the clone fill');
  assert.ok(baseEffect[0] > 200 && baseEffect[2] < 40, 'base target preserves effect color');

  const fullLayer = paint('fullLayer');
  const fullEffect = pixelAt(fullLayer, 11, 9);
  assert.ok(fullEffect[2] > 200 && fullEffect[0] < 40, 'full layer target recolors effect pixels');
});

test('Replicator clone ordering controls which overlapping copy is in front', () => {
  const input = new Canvas(24, 24);
  const inputContext = input.getContext('2d');
  inputContext.fillStyle = '#ffffff';
  inputContext.fillRect(8, 8, 4, 4);
  const baseInput = new Canvas(24, 24);
  const baseInputContext = baseInput.getContext('2d');
  baseInputContext.fillStyle = '#ffffff';
  baseInputContext.fillRect(8, 8, 4, 4);

  const paint = (cloneOrdering) => {
    const effect = new ReplicatorEffect(
      new Map([
        ['cloneCount', staticProperty('number', 2)],
        ['showOriginal', staticProperty('string', 'none')],
        ['cloneOrdering', staticProperty('string', cloneOrdering)],
        ['fillMode', staticProperty('string', 'custom')],
        ['customFills', staticProperty('array', [solidPaint('#ff0000'), solidPaint('#0000ff')])],
      ]),
    );
    const output = new Canvas(24, 24);
    effect.renderCopies(
      output.getContext('2d'),
      input,
      defaultResolveContext(),
      inputContext.getTransform(),
      { bounds: { width: 4, height: 4 }, color: solidPaint('#ffffff') },
      baseInput,
    );
    return output.getContext('2d').getImageData(0, 0, 24, 24).data;
  };
  const pixelAt = (pixels) => pixels.slice((9 * 24 + 9) * 4, (9 * 24 + 10) * 4);

  const backToFront = pixelAt(paint('backToFront'));
  assert.ok(backToFront[2] > 200 && backToFront[0] < 40, 'backToFront places the last copy in front');

  const frontToBack = pixelAt(paint('frontToBack'));
  assert.ok(frontToBack[0] > 200 && frontToBack[2] < 40, 'frontToBack places the first copy in front');
});

test('Replicator clone rotation never transforms the original source', () => {
  const pixelAt = (pixels, x, y) => pixels.slice((y * 32 + x) * 4, (y * 32 + x + 1) * 4);
  const input = new Canvas(32, 32);
  const inputContext = input.getContext('2d');
  inputContext.fillStyle = '#ffffff';
  inputContext.fillRect(12, 10, 8, 2);

  for (const showOriginal of ['back', 'front']) {
    const effect = new ReplicatorEffect(
      new Map([
        ['cloneCount', staticProperty('number', 1)],
        ['showOriginal', staticProperty('string', showOriginal)],
        ['rotation', staticProperty('number', 90)],
        ['copyOverrides.copy_1.fill', staticProperty('paint', solidPaint('#ff0000'))],
      ]),
    );
    const render = () => {
      const output = new Canvas(32, 32);
      const baseInput = new Canvas(32, 32);
      const baseInputContext = baseInput.getContext('2d');
      baseInputContext.fillStyle = '#ffffff';
      baseInputContext.fillRect(12, 10, 8, 2);
      effect.renderCopies(output.getContext('2d'), input, defaultResolveContext(), inputContext.getTransform(), {
        bounds: { width: 8, height: 2 },
        color: solidPaint('#ffffff'),
      }, baseInput);
      return output.getContext('2d').getImageData(0, 0, 32, 32).data;
    };

    const rotated = render();
    const rotatedSourcePixel = pixelAt(rotated, 13, 10);
    assert.ok(rotatedSourcePixel[0] > 200 && rotatedSourcePixel[1] > 200, `${showOriginal} keeps the source unrotated`);

    effect.getProp('rotation').setBase(0);
    const reset = pixelAt(render(), 13, 10);
    if (showOriginal === 'back') {
      assert.ok(reset[0] > 200 && reset[1] < 40, 'back keeps the zero-rotation copy over the source');
    } else {
      assert.ok(reset[0] > 200 && reset[1] > 200, 'front keeps the source over the zero-rotation copy');
    }
  }
});

test('Replicator raster copies preserve copy order and rotation', () => {
  const effect = new ReplicatorEffect(
    new Map([
      ['cloneCount', staticProperty('number', 2)],
      ['position', staticProperty('vector2', { x: 5, y: 0 })],
      ['copyOverrides.copy_2.transform.rotation', staticProperty('number', 90)],
    ]),
  );
  const input = new Canvas(32, 32);
  const inputContext = input.getContext('2d');
  inputContext.fillStyle = '#ffffff';
  inputContext.fillRect(8, 9, 4, 2);
  const baseContext = new Canvas(32, 32).getContext('2d');
  baseContext.translate(10, 10);
  const output = new Canvas(32, 32);
  effect.renderCopies(output.getContext('2d'), input, defaultResolveContext(), baseContext.getTransform(), {
    bounds: { width: 4, height: 2 },
    color: solidPaint('#ffffff'),
  });

  const pixels = output.getContext('2d').getImageData(0, 0, 32, 32).data;
  const alphaAt = (x, y) => pixels[(y * 32 + x) * 4 + 3];
  assert.ok(alphaAt(14, 9) > 200, 'copy 1 uses the pattern position');
  assert.ok(alphaAt(20, 10) > 100, 'copy 2 remains in order after its rotation');
  assert.deepEqual(effect.getMargins(defaultResolveContext(), { bounds: { width: 4, height: 2 } }), { x: 9, y: 1 });
});

test('Replicator nested copy overrides survive ECS parse and serialization', () => {
  const design = {
    entity: 'viewport',
    id: 'viewport',
    components: [{ component: 'layout' }],
    children: [
      {
        entity: 'videoArea',
        id: 'videoArea',
        components: [{ component: 'layout' }],
        children: [{ entity: 'video', id: 'video', components: [] }],
      },
      {
        entity: 'compositionArea',
        id: 'compositionArea',
        components: [],
        effects: [
          {
            effect: 'replicator',
            id: 'replicator-main',
            props: {
              cloneCount: { type: 'number', value: 2 },
              position: { type: 'vector2', value: { x: 10, y: 5 } },
              copyIds: { type: 'array', value: ['copy_1', 'copy_2'] },
              copyOverrides: {
                copy_2: {
                  transform: {
                    position: { type: 'vector2', value: { x: 25, y: 15 } },
                  },
                },
              },
            },
          },
        ],
      },
    ],
  };

  const serialized = serializeEntityTree(buildEcsTree(design));
  const composition = serialized.children.find((child) => child.entity === 'compositionArea');
  const replicator = composition.effects.find((effect) => effect.id === 'replicator-main');
  assert.deepEqual(replicator.props.position, {
    type: 'vector2',
    value: { x: 10, y: 5 },
  });
  assert.equal(replicator.props.offset, undefined);
  assert.deepEqual(replicator.props.copyOverrides.copy_2.transform.position, {
    type: 'vector2',
    value: { x: 25, y: 15 },
  });
});