'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { Canvas } = require('skia-canvas');

const {
  ImageFlowEntity,
  Row,
  Word,
  Page,
  CompositionArea,
  Viewport,
  Image,
  ImageSequencer,
  SelfLayout,
  Transform,
  Layout,
  buildProperty,
  buildEcsTree,
  serializeEntityTree,
  staticProperty,
  layoutScene,
  defaultResolveContext,
  instantiateScene,
} = require('../build/caption-engine/entity-system/index.js');

const { preloadFlowImageMeasurements } = require('../build/caption-engine/entity-system/assets.js');
const { generateSubtitleImagesEcs } = require('../build/caption-engine/entity-system/pipeline.js');

const ctx = (overrides) => defaultResolveContext(overrides);

function makeMeasurements(map) {
  return new Map(Object.entries(map).map(([id, dims]) => [
    id,
    { width: dims.width, height: dims.height, aspectRatio: dims.width / dims.height, status: 'loaded' },
  ]));
}

function makeCanvas() {
  const canvas = new Canvas(1, 1);
  return canvas.getContext('2d');
}

function makeTransformProps(opts = {}) {
  return new Map([
    ['positioning', buildProperty({ type: 'string', value: opts.positioning ?? 'flow' })],
    ['position', buildProperty({ type: 'vector2', value: { x: 0, y: 0 } })],
    ['dimensions', buildProperty({ type: 'vector2', value: { x: opts.w ?? 0, y: opts.h ?? 0 } })],
    ['widthMode', buildProperty({ type: 'string', value: opts.widthMode ?? 'custom' })],
    ['heightMode', buildProperty({ type: 'string', value: opts.heightMode ?? 'custom' })],
    ['rotation', buildProperty({ type: 'number', value: 0 })],
    ['scale', buildProperty({ type: 'vector2', value: { x: 1, y: 1 } })],
    ['opacity', buildProperty({ type: 'number', value: 1 })],
  ]);
}

function makeTextWord(id, text, fontSize = 40) {
  const { Text, Font } = require('../build/caption-engine/entity-system/index.js');
  const word = new Word(id);
  word.addComponent(new Transform(makeTransformProps()));
  word.addComponent(
    new Text(
      new Map([
        ['color', buildProperty({ type: 'paint', value: { type: 'solid', color: 'white' } })],
      ]),
    ),
  );
  word.addComponent(
    new Font(
      new Map([
        ['family', buildProperty({ type: 'fontFamily', value: ['Arimo', 'sans-serif'] })],
        ['size', buildProperty({ type: 'number', value: fontSize })],
        ['weight', buildProperty({ type: 'string', value: 'bold' })],
        ['style', buildProperty({ type: 'string', value: 'normal' })],
      ]),
    ),
  );
  word.text = text;
  return word;
}

function makeImageFlowEntity(id, opts = {}) {
  const entity = new ImageFlowEntity(id);
  entity.addComponent(
    new Transform(
      makeTransformProps({
        w: opts.width ?? 0,
        h: opts.height ?? 0,
        widthMode: opts.widthMode ?? 'custom',
        heightMode: opts.heightMode ?? 'custom',
        positioning: opts.positioning ?? 'flow',
      }),
    ),
  );
  entity.addComponent(
    new Image(
      new Map([
        ['assetSource', buildProperty({ type: 'string', value: 'bundled' })],
        ['asset', buildProperty({ type: 'string', value: 'dialog-speaker' })],
        ['aspectRatio', buildProperty({ type: 'string', value: opts.aspectRatio ?? 'maintain' })],
        ['customAspectRatio', buildProperty({ type: 'string', value: opts.customAspectRatio ?? '16:9' })],
        ['colorMode', buildProperty({ type: 'string', value: 'original' })],
      ]),
    ),
  );
  if (opts.sequenceFrames) {
    entity.addComponent(
      new ImageSequencer(
        new Map([['frames', buildProperty({ type: 'array', value: opts.sequenceFrames })]]),
      ),
    );
  }
  if (opts.verticalAlignment) {
    entity.addComponent(
      new SelfLayout(
        new Map([
          ['verticalAlignment', buildProperty({ type: 'string', value: opts.verticalAlignment })],
        ]),
      ),
    );
  }
  return entity;
}

function makeRow(id, children) {
  const row = new Row(id);
  row.addComponent(new Transform(makeTransformProps({ widthMode: 'fitChildren', heightMode: 'fitChildren' })));
  for (const child of children) row.addChild(child);
  return row;
}

function makeScene(rows, frameSize = { width: 600, height: 400 }) {
  const ca = new CompositionArea('compositionArea');
  ca.box = { x: 0, y: 0, width: frameSize.width, height: frameSize.height };
  const page = new Page('page');
  for (const row of rows) page.addChild(row);
  ca.addChild(page);
  return { ca, page };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test('ImageFlowEntity: kind is "image"', () => {
  const entity = new ImageFlowEntity('img-1');
  assert.equal(entity.kind, 'image');
});

test('ImageFlowEntity: round-trips through ECS serialization', () => {
  const tree = {
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
              layoutMode: { type: 'string', value: 'overlay' },
              padding: {
                top: { type: 'number', value: 0 },
                right: { type: 'number', value: 0 },
                bottom: { type: 'number', value: 0 },
                left: { type: 'number', value: 0 },
              },
              clipContent: { type: 'boolean', value: true },
            },
          },
        ],
        children: [{ entity: 'video', id: 'video' }],
      },
      {
        entity: 'compositionArea',
        id: 'compositionArea',
        children: [
          {
            entity: 'page',
            id: 'page',
            components: [{ component: 'transform', props: { widthMode: { type: 'string', value: 'fitChildren' }, heightMode: { type: 'string', value: 'fitChildren' } } }],
            children: [
              {
                entity: 'row',
                id: 'row:default',
                components: [{ component: 'transform', props: { widthMode: { type: 'string', value: 'fitChildren' }, heightMode: { type: 'string', value: 'fitChildren' } } }],
                children: [
                  {
                    entity: 'image',
                    id: 'dialog-speaker-0',
                    components: [
                      { component: 'transform', props: { widthMode: { type: 'string', value: 'custom' }, heightMode: { type: 'string', value: 'fitContent' }, dimensions: { type: 'vector2', value: { x: 80, y: 0 } } } },
                      { component: 'image', props: { assetSource: { type: 'string', value: 'bundled' }, asset: { type: 'string', value: 'dialog-speaker' }, colorMode: { type: 'string', value: 'original' } } },
                      { component: 'selfLayout', props: { verticalAlignment: { type: 'string', value: 'center' } } },
                    ],
                  },
                  {
                    entity: 'word',
                    id: 'word:default',
                    components: [
                      { component: 'transform', props: { widthMode: { type: 'string', value: 'fitContent' }, heightMode: { type: 'string', value: 'fitContent' } } },
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

  const built = buildEcsTree(tree);
  const serialized = serializeEntityTree(built);

  // The image entity round-trips
  const compositionArea = serialized.children[1];
  const page = compositionArea.children[0];
  const row = page.children[0];
  assert.equal(row.children[0].entity, 'image');
  assert.equal(row.children[0].id, 'dialog-speaker-0');
  assert.equal(row.children[1].entity, 'word');
});

test('image intrinsic size: explicit width + fitContent height uses aspect ratio', () => {
  const c2d = makeCanvas();
  const rctx = ctx({});

  const image = makeImageFlowEntity('img-1', { width: 100, widthMode: 'custom', heightMode: 'fitContent' });
  const word = makeTextWord('w-1', 'Hi');
  const row = makeRow('row-1', [image, word]);
  const { ca } = makeScene([row]);

  const measurements = makeMeasurements({ 'img-1': { width: 64, height: 64 } }); // 1:1 asset
  layoutScene(ca, c2d, rctx, {
    width: 600,
    height: 400,
    flowImageMeasurements: measurements,
  });

  // width=100, aspect=1, so height=100
  assert.ok(image.box, 'image entity should have a box');
  assert.equal(image.box.width, 100);
  assert.equal(image.box.height, 100);
});

test('image intrinsic size: explicit width + fitContent height with 2:1 aspect ratio', () => {
  const c2d = makeCanvas();
  const rctx = ctx({});

  const image = makeImageFlowEntity('img-2', { width: 100, widthMode: 'custom', heightMode: 'fitContent' });
  const row = makeRow('row-1', [image]);
  const { ca } = makeScene([row]);

  const measurements = makeMeasurements({ 'img-2': { width: 100, height: 50 } }); // 2:1 asset
  layoutScene(ca, c2d, rctx, {
    width: 600,
    height: 400,
    flowImageMeasurements: measurements,
  });

  assert.ok(image.box, 'image entity should have a box');
  assert.equal(image.box.width, 100);
  assert.equal(image.box.height, 50); // 100 / (100/50) = 50
});

test('image custom aspect-ratio mode overrides the source ratio', () => {
  const c2d = makeCanvas();
  const image = makeImageFlowEntity('img-fixed-ratio', {
    width: 160,
    widthMode: 'custom',
    heightMode: 'fitContent',
    aspectRatio: 'custom',
    customAspectRatio: '16:9',
  });
  const row = makeRow('row-1', [image]);
  const { ca } = makeScene([row]);

  layoutScene(ca, c2d, ctx({}), {
    width: 600,
    height: 400,
    flowImageMeasurements: makeMeasurements({ 'img-fixed-ratio': { width: 64, height: 64 } }),
  });

  assert.ok(image.box);
  assert.equal(image.box.width, 160);
  assert.equal(image.box.height, 90);
});

test('image sequencer uses the attached image custom aspect-ratio mode', () => {
  const c2d = makeCanvas();
  const image = makeImageFlowEntity('img-sequence-ratio', {
    width: 90,
    widthMode: 'custom',
    heightMode: 'fitContent',
    aspectRatio: 'custom',
    customAspectRatio: '9:16',
    sequenceFrames: ['frame-a.svg', 'frame-b.svg'],
  });
  const row = makeRow('row-1', [image]);
  const { ca } = makeScene([row]);

  layoutScene(ca, c2d, ctx({}), {
    width: 600,
    height: 400,
    flowImageMeasurements: makeMeasurements({ 'img-sequence-ratio': { width: 200, height: 100 } }),
  });

  assert.ok(image.box);
  assert.equal(image.box.width, 90);
  assert.equal(image.box.height, 160);
});

test('image intrinsic size: both explicit dimensions override source', () => {
  const c2d = makeCanvas();
  const rctx = ctx({});

  const image = makeImageFlowEntity('img-3', { width: 80, height: 60, widthMode: 'custom', heightMode: 'custom' });
  const row = makeRow('row-1', [image]);
  const { ca } = makeScene([row]);

  const measurements = makeMeasurements({ 'img-3': { width: 200, height: 200 } }); // different source
  layoutScene(ca, c2d, rctx, {
    width: 600,
    height: 400,
    flowImageMeasurements: measurements,
  });

  assert.ok(image.box);
  assert.equal(image.box.width, 80);
  assert.equal(image.box.height, 60);
});

test('image intrinsic size: no explicit dims uses source dims', () => {
  const c2d = makeCanvas();
  const rctx = ctx({});

  // widthMode=fitContent means no explicit width, use source
  const image = makeImageFlowEntity('img-4', { widthMode: 'fitContent', heightMode: 'fitContent' });
  const row = makeRow('row-1', [image]);
  const { ca } = makeScene([row]);

  const measurements = makeMeasurements({ 'img-4': { width: 70, height: 90 } });
  layoutScene(ca, c2d, rctx, {
    width: 600,
    height: 400,
    flowImageMeasurements: measurements,
  });

  assert.ok(image.box);
  assert.equal(image.box.width, 70);
  assert.equal(image.box.height, 90);
});

test('image intrinsic size: failed measurement uses fallback 40x40', () => {
  const c2d = makeCanvas();
  const rctx = ctx({});

  const image = makeImageFlowEntity('img-5', { widthMode: 'fitContent', heightMode: 'fitContent' });
  const row = makeRow('row-1', [image]);
  const { ca } = makeScene([row]);

  // No measurement record → falls back to FLOW_IMAGE_FALLBACK
  layoutScene(ca, c2d, rctx, {
    width: 600,
    height: 400,
    flowImageMeasurements: new Map(), // empty map
  });

  assert.ok(image.box);
  assert.equal(image.box.width, 40);
  assert.equal(image.box.height, 40);
});

test('row geometry: width includes image + words + spacing', () => {
  const c2d = makeCanvas();
  const rctx = ctx({});

  const image = makeImageFlowEntity('img-6', { width: 80, height: 60, widthMode: 'custom', heightMode: 'custom' });
  const word = makeTextWord('w-1', 'Hi');
  const row = makeRow('row-1', [image, word]);
  const { ca, page } = makeScene([row]);

  layoutScene(ca, c2d, rctx, {
    width: 600,
    height: 400,
    flowImageMeasurements: makeMeasurements({ 'img-6': { width: 80, height: 60 } }),
  });

  // Row width = image.width + spacing + word.width
  assert.ok(row.box, 'row should have a box');
  assert.ok(row.box.width > 80, 'row width should exceed image width alone');
  assert.ok(image.box, 'image should have a box');
  assert.equal(image.box.width, 80);
  // Image must be left of word
  assert.ok(word.box, 'word should have a box');
  assert.ok(image.box.x < word.box.x, 'image should be to the left of the word');
});

test('row geometry: height is max of image and text heights', () => {
  const c2d = makeCanvas();
  const rctx = ctx({});

  // Image is taller than typical text at font size 40
  const image = makeImageFlowEntity('img-7', { width: 60, height: 120, widthMode: 'custom', heightMode: 'custom' });
  const word = makeTextWord('w-1', 'Hi', 40);
  const row = makeRow('row-1', [image, word]);
  const { ca } = makeScene([row]);

  layoutScene(ca, c2d, rctx, {
    width: 600,
    height: 400,
    flowImageMeasurements: makeMeasurements({ 'img-7': { width: 60, height: 120 } }),
  });

  assert.ok(row.box);
  assert.equal(row.box.height, 120, 'row height should match the taller image');
});

test('absolute-positioned image does not contribute to row flow', () => {
  const c2d = makeCanvas();
  const rctx = ctx({});

  // Absolute image
  const absImage = makeImageFlowEntity('img-abs', {
    width: 200,
    height: 200,
    widthMode: 'custom',
    heightMode: 'custom',
    positioning: 'absolute',
  });
  // Flow word
  const word = makeTextWord('w-1', 'Hi');
  const row = makeRow('row-1', [absImage, word]);
  const { ca } = makeScene([row]);

  layoutScene(ca, c2d, rctx, {
    width: 600,
    height: 400,
    flowImageMeasurements: makeMeasurements({ 'img-abs': { width: 200, height: 200 } }),
  });

  assert.ok(row.box);
  // Row width and height must only reflect the word, not the absolute image
  assert.ok(row.box.width < 200, 'absolute image should not inflate row width');
});

test('word-only row behaves identically when no image children present', () => {
  const c2d = makeCanvas();
  const rctx = ctx({});

  const word1 = makeTextWord('w-1', 'Hello');
  const word2 = makeTextWord('w-2', 'World');
  const row = makeRow('row-1', [word1, word2]);
  const { ca } = makeScene([row]);

  layoutScene(ca, c2d, rctx, { width: 600, height: 400 });

  assert.ok(row.box, 'word-only row should have a box');
  assert.ok(word1.box, 'first word should have a box');
  assert.ok(word2.box, 'second word should have a box');
  // Words must be side by side
  assert.ok(word1.box.x < word2.box.x, 'first word should be left of second');
});

test('page flow positions a direct image child after the page measures it', () => {
  const c2d = makeCanvas();
  const image = makeImageFlowEntity('page-image', {
    widthMode: 'fitContent',
    heightMode: 'fitContent',
  });
  const { ca, page } = makeScene([]);
  page.addChild(image);

  layoutScene(ca, c2d, ctx({}), {
    width: 600,
    height: 400,
    flowImageMeasurements: makeMeasurements({ 'page-image': { width: 70, height: 90 } }),
  });

  assert.ok(image.box, 'direct page image should receive a layout box');
  assert.equal(image.box.width, 70);
  assert.equal(image.box.height, 90);
});

test('page row layout places a direct image beside a row', () => {
  const c2d = makeCanvas();
  const image = makeImageFlowEntity('page-image-row', {
    widthMode: 'fitContent',
    heightMode: 'fitContent',
  });
  const row = makeRow('row-1', [makeTextWord('w-1', 'Hello')]);
  const { ca, page } = makeScene([]);
  page.addChild(image);
  page.addChild(row);
  page.addComponent(
    new Layout(new Map([['layoutMode', buildProperty({ type: 'string', value: 'row' })]])),
  );

  layoutScene(ca, c2d, ctx({}), {
    width: 600,
    height: 400,
    flowImageMeasurements: makeMeasurements({ 'page-image-row': { width: 70, height: 90 } }),
  });

  assert.ok(image.box, 'direct page image should receive a row-layout box');
  assert.ok(row.box, 'row should receive a row-layout box');
  assert.ok(image.box.x < row.box.x, 'direct page image should be placed beside the row');
  assert.equal(image.box.width, 70);
  assert.equal(image.box.height, 90);
});
