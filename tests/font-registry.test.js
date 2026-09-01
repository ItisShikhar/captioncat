const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { FontLibrary } = require('skia-canvas');

const {
  FONT_REGISTRY,
  getFontFaceWeightDescriptor,
  getClosestFontVariant,
  getFontFamily,
  getFontVariant,
  getVariableFontWeightRange,
  DEFAULT_FONT_EMOJI_SETTINGS,
  isGenericFontFamily,
  normalizeFontEmojiSettings,
  normalizeFontFaceStyle,
  normalizeFontStyle,
  normalizeFontWeight,
  resolveFontWeight,
  resolveFontEmojiSettings,
  isRemoteFontUrl,
  supportsVariableFontWeight,
} = require('../build/font-registry.js');
const {
  FontResolutionError,
  resolveFontFamilyEntry,
} = require('../build/utilities/font-utils.js');
const { Font } = require('../build/caption-engine/entity-system/components/font.js');
const { staticProperty } = require('../build/caption-engine/entity-system/property.js');

function collectFontRequests(value, requests = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectFontRequests(item, requests);
    return requests;
  }
  if (!value || typeof value !== 'object') return requests;

  if (value.component === 'font') {
    const props = value.props ?? {};
    const families = Array.isArray(props.family?.value) ? props.family.value : [props.family?.value];
    for (const family of families) {
      if (typeof family === 'string' && family.trim().length > 0) {
        requests.push({
          family,
          weight: normalizeFontWeight(props.weight?.value),
          style: normalizeFontStyle(props.style?.value),
        });
      }
    }
  }

  for (const child of Object.values(value)) collectFontRequests(child, requests);
  return requests;
}

function collectFontEmojiOverrides(value, locations = [], pathParts = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectFontEmojiOverrides(item, locations, [...pathParts, String(index)]));
    return locations;
  }
  if (!value || typeof value !== 'object') return locations;

  if (value.component === 'font' && value.props?.emojis !== undefined) {
    locations.push(pathParts.join('.'));
  }
  for (const [key, child] of Object.entries(value)) {
    collectFontEmojiOverrides(child, locations, [...pathParts, key]);
  }
  return locations;
}

function hasRegisteredFontVariant({ family, weight, style }) {
  if (getFontVariant(family, weight, style)) return true;
  const entry = getFontFamily(family);
  if (!entry) return false;
  const faceStyle = normalizeFontFaceStyle(style);
  return entry.variants.some(
    (variant) =>
      variant.style === faceStyle &&
      variant.sources.some(
        (source) =>
          source.type === 'system' ||
          (source.type === 'local' || source.type === 'remote') &&
            source.weightRange !== undefined &&
            source.weightRange.min <= weight &&
            source.weightRange.max >= weight,
      ),
  );
}

test('font registry includes exact bundled variants and local-first sources', () => {
  const bangers = getFontFamily('Bangers');
  assert.ok(bangers);
  assert.deepEqual(bangers.variants[0], {
    weight: 400,
    style: 'normal',
    sources: [
      { type: 'local', path: './fonts/bangers/bangers-regular.ttf' },
      { type: 'google', url: 'https://fonts.googleapis.com/css2?family=Bangers' },
    ],
  });

  const gaegu = getFontFamily('Gaegu');
  assert.ok(gaegu);
  assert.deepEqual(
    gaegu.variants.map((variant) => variant.weight),
    [300, 400, 700],
  );
  assert.deepEqual(gaegu.variants[0].sources, [
    {
      type: 'local',
      path: './fonts/gaegu/gaegu-light.ttf',
      faceWeight: 300,
    },
    {
      type: 'google',
      url: 'https://fonts.googleapis.com/css2?family=Gaegu:wght@300;400;700&display=swap',
    },
  ]);

  const interItalic = getFontVariant('Inter', 700, 'italic');
  assert.equal(interItalic?.style, 'italic');
  assert.equal(interItalic?.weight, 700);
  assert.equal(interItalic?.sources[0].type, 'local');

  const arimoBold = getFontVariant('Arimo', 700, 'normal');
  assert.equal(arimoBold?.sources[0].type, 'local');
  assert.deepEqual(getFontVariant('Arimo', 400, 'normal')?.sources, [
    {
      type: 'local',
      path: './fonts/arimo/arimo-variable.ttf',
      weightRange: { min: 400, max: 700 },
    },
    {
      type: 'google',
      url: 'https://fonts.googleapis.com/css2?family=Arimo:ital,wght@0,400..700;1,400..700',
    },
  ]);
  assert.deepEqual(getFontVariant('Arimo', 400, 'italic')?.sources, [
    {
      type: 'local',
      path: './fonts/arimo/arimo-italic-variable.ttf',
      weightRange: { min: 400, max: 700 },
    },
    {
      type: 'google',
      url: 'https://fonts.googleapis.com/css2?family=Arimo:ital,wght@0,400..700;1,400..700',
    },
  ]);

  const komika = getFontVariant('Komika Title - Axis', 400, 'normal');
  assert.deepEqual(komika?.sources, [
    { type: 'local', path: './fonts/komika-title/komtita.ttf' },
    {
      type: 'remote',
      url: 'https://cdn.jsdelivr.net/gh/axarigato/honkyfirend@1f7717ecf56575c4dfdba6d37f412b8a98ba7254/fonts/KOMTITA_.ttf',
    },
    {
      type: 'remote',
      url: 'https://raw.githubusercontent.com/axarigato/honkyfirend/1f7717ecf56575c4dfdba6d37f412b8a98ba7254/fonts/KOMTITA_.ttf',
    },
    {
      type: 'remote',
      url: 'https://cdn.jsdelivr.net/gh/glenn-chen/Tunnel@4411f3e08543911b8bc1ceddbf300d08efc94f7f/Tunnels/Tunnels/KOMTITA_.ttf',
    },
  ]);

  const notoCjk = getFontVariant('Noto Sans CJK SC', 400, 'normal');
  assert.deepEqual(notoCjk?.sources, [
    { type: 'local', path: './fonts/noto-sans-cjk-sc/noto-sans-cjk-sc-regular.ttf' },
    {
      type: 'google',
      fontFamily: 'Noto Sans SC',
      url: 'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@100..900',
    },
    {
      type: 'remote',
      url: 'https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf',
    },
    {
      type: 'remote',
      url: 'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf',
    },
  ]);
});

test('emoji settings use the primary family and fill missing registry fields', () => {
  assert.deepEqual(resolveFontEmojiSettings(['Gaegu', 'Arimo']), getFontFamily('Gaegu').emoji);
  assert.deepEqual(resolveFontEmojiSettings(['Unknown Font', 'Arimo']), DEFAULT_FONT_EMOJI_SETTINGS);
  assert.deepEqual(normalizeFontEmojiSettings({ sizeScale: 0.7 }), {
    sizeScale: 0.7,
    alignmentMode: 'optical',
    baselineOffset: -0.033,
  });
  assert.deepEqual(normalizeFontEmojiSettings(undefined), DEFAULT_FONT_EMOJI_SETTINGS);
});

test('local registry sources keep Google fallback sources in order', () => {
  const families = [
    'Baskerville',
    'Inter',
    'Noto Sans',
    'Noto Sans Devanagari',
    'Oswald',
    'Public Sans',
    'Sour Gummy',
  ];

  for (const family of families) {
    const entry = getFontFamily(family);
    assert.ok(entry);
    for (const variant of entry.variants) {
      assert.equal(variant.sources[0].type, 'local', `${family} must prefer its local source`);
      assert.ok(
        variant.sources.some((source) => source.type === 'google'),
        `${family} ${variant.weight} ${variant.style} must have a Google fallback`,
      );
    }
  }
});

test('font registry resolves an unavailable weight to the nearest same-style face', () => {
  assert.equal(getClosestFontVariant('Oswald', 100, 'normal')?.weight, 400);
  assert.equal(getClosestFontVariant('Oswald', 900, 'normal')?.weight, 700);
  assert.equal(getClosestFontVariant('Oswald', 400, 'italic'), undefined);
});

test('every registry local source points at a distributed font file', () => {
  for (const family of FONT_REGISTRY.fonts) {
    for (const variant of family.variants) {
      for (const source of variant.sources) {
        if (source.type !== 'local') continue;
        const filePath = path.resolve(__dirname, '..', 'assets', source.path);
        assert.equal(fs.existsSync(filePath), true, `${family.family} points at missing ${source.path}`);
      }
    }
  }
});

test('shipped ECS presets use registered font variants', () => {
  const presetDirectory = path.resolve(__dirname, '..', 'assets', 'json', 'caption-style-presets');
  for (const fileName of fs.readdirSync(presetDirectory).filter((name) => name.endsWith('.json'))) {
    const filePath = path.join(presetDirectory, fileName);
    const preset = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    for (const request of collectFontRequests(preset)) {
      if (isGenericFontFamily(request.family) || isRemoteFontUrl(request.family)) continue;
      assert.ok(
        hasRegisteredFontVariant(request),
        `${fileName} requests unregistered ${request.family} ${request.weight} ${request.style} variant`,
      );
    }
  }
});

test('shipped ECS presets inherit emoji settings from the font registry', () => {
  const presetDirectory = path.resolve(__dirname, '..', 'assets', 'json', 'caption-style-presets');
  for (const fileName of fs.readdirSync(presetDirectory).filter((name) => name.endsWith('.json'))) {
    const filePath = path.join(presetDirectory, fileName);
    const preset = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.deepEqual(
      collectFontEmojiOverrides(preset),
      [],
      `${fileName} should use font registry emoji settings instead of serialized overrides`,
    );
  }
});

test('oblique keeps rendered style while resolving the normal font face', () => {
  assert.equal(normalizeFontStyle('oblique'), 'oblique');
  assert.equal(normalizeFontStyle('solid'), 'normal');
  assert.equal(getFontVariant('Bangers', 400, 'oblique')?.style, 'normal');

  const font = new Font(
    new Map([
      ['family', staticProperty('fontFamily', ['Bangers'])],
      ['size', staticProperty('number', 60)],
      ['weight', staticProperty('fontWeight', 400)],
      ['style', staticProperty('string', 'oblique')],
    ]),
  );
  assert.equal(font.fontString({}), 'oblique 60px Bangers');
});

test('emoji runtime fallback uses only the primary normal font family', () => {
  const font = new Font(
    new Map([
      ['family', staticProperty('fontFamily', ['Unknown Font', 'Arimo'])],
      ['size', staticProperty('number', 60)],
      ['weight', staticProperty('fontWeight', 400)],
      ['style', staticProperty('string', 'normal')],
    ]),
  );
  assert.equal(font.textRunStyle({}, true).font, "33px 'Unknown Font', Arimo");
});

test('font runtime uses primary registry emoji settings without overrides', () => {
  const font = new Font(
    new Map([
      ['family', staticProperty('fontFamily', ['Bangers'])],
      ['size', staticProperty('number', 60)],
      ['weight', staticProperty('fontWeight', 400)],
      ['style', staticProperty('string', 'normal')],
    ]),
  );
  const settings = getFontFamily('Bangers').emoji;
  const emojiStyle = font.textRunStyle({}, true);
  assert.equal(emojiStyle.font, `${60 * settings.sizeScale}px Bangers`);
  assert.equal(emojiStyle.baselineOffset, 60 * settings.baselineOffset);
  assert.equal(emojiStyle.alignment, settings.alignmentMode);
});

test('font weight resolution preserves interpolated values for CSS rendering', () => {
  assert.equal(resolveFontWeight(550.5), 550.5);
  assert.equal(normalizeFontWeight(550.5), 551);

  const font = new Font(
    new Map([
      ['family', staticProperty('fontFamily', ['Bangers'])],
      ['size', staticProperty('number', 60)],
      ['weight', staticProperty('fontWeight', 550.5)],
      ['style', staticProperty('string', 'normal')],
    ]),
  );
  assert.equal(font.fontString({}), '550.5 60px Bangers');
});

test('Baskerville uses bundled variable normal and italic faces', async () => {
  const baskerville = getFontFamily('Baskerville');
  assert.ok(baskerville);
  assert.equal(supportsVariableFontWeight(baskerville), true);
  assert.deepEqual(getVariableFontWeightRange(baskerville), { min: 400, max: 700 });

  const normal = getFontVariant('Baskerville', 400, 'normal');
  const italic = getFontVariant('Baskerville', 400, 'italic');
  assert.equal(getFontFaceWeightDescriptor(normal.sources[0], normal.weight), '400 700');
  assert.equal(getFontFaceWeightDescriptor(italic.sources[0], italic.weight), '400 700');
  assert.equal(normal.sources[1].type, 'google');
  assert.equal(normal.sources[1].fontFamily, 'Baskervville');
  assert.equal(getClosestFontVariant('Baskerville', 550, 'normal')?.weight, 400);

  FontLibrary.reset();
  assert.deepEqual(await resolveFontFamilyEntry('Baskerville', { weight: 550, style: 'normal' }), ['Baskerville']);
  assert.equal(FontLibrary.has('Baskerville'), true);
});

test('bundled registry families use variable font sources', async () => {
  const variableFamilies = [
    { family: 'Arimo', weight: 550, style: 'normal', range: { min: 400, max: 700 } },
    { family: 'Arimo', weight: 550, style: 'italic', range: { min: 400, max: 700 } },
    { family: 'Inter', weight: 550, style: 'normal', range: { min: 100, max: 900 } },
    { family: 'Inter', weight: 550, style: 'italic', range: { min: 100, max: 900 } },
    { family: 'Noto Sans', weight: 550, style: 'normal', range: { min: 100, max: 900 } },
    { family: 'Noto Sans', weight: 550, style: 'italic', range: { min: 100, max: 900 } },
    { family: 'Noto Sans Devanagari', weight: 550, style: 'normal', range: { min: 100, max: 900 } },
    { family: 'Oswald', weight: 350, style: 'normal', range: { min: 200, max: 700 } },
    { family: 'Public Sans', weight: 550, style: 'normal', range: { min: 100, max: 900 } },
    { family: 'Public Sans', weight: 550, style: 'italic', range: { min: 100, max: 900 } },
    { family: 'Sour Gummy', weight: 550, style: 'normal', range: { min: 100, max: 900 } },
    { family: 'Sour Gummy', weight: 550, style: 'italic', range: { min: 100, max: 900 } },
  ];

  for (const expected of variableFamilies) {
    const entry = getFontFamily(expected.family);
    assert.ok(entry);
    assert.equal(supportsVariableFontWeight(entry), true);
    assert.deepEqual(getVariableFontWeightRange(entry), expected.range);

    const variant = getClosestFontVariant(expected.family, expected.weight, expected.style);
    assert.ok(variant);
    assert.equal(
      getFontFaceWeightDescriptor(variant.sources[0], variant.weight),
      `${expected.range.min} ${expected.range.max}`,
    );

    FontLibrary.reset();
    assert.deepEqual(
      await resolveFontFamilyEntry(expected.family, { weight: expected.weight, style: expected.style }),
      [expected.family],
    );
    assert.equal(FontLibrary.has(expected.family), true);
  }
});

test('Node resolves an exact local variant before remote fallback', async () => {
  FontLibrary.reset();
  assert.deepEqual(await resolveFontFamilyEntry('Bangers', { weight: 400, style: 'normal' }), ['Bangers']);
  assert.equal(FontLibrary.has('Bangers'), true);
});

test('Node resolves oblique with the normal local face', async () => {
  FontLibrary.reset();
  assert.deepEqual(await resolveFontFamilyEntry('Bangers', { weight: 400, style: 'oblique' }), ['Bangers']);
  assert.equal(FontLibrary.has('Bangers'), true);
});

test('Node keeps Bangers local-first when a Google fallback is registered', async () => {
  FontLibrary.reset();
  assert.deepEqual(await resolveFontFamilyEntry('Bangers', { weight: 400, style: 'normal' }), ['Bangers']);
  assert.equal(FontLibrary.has('Bangers'), true);
});

test('Node downloads Google stylesheets and direct CDN font assets before registration', async () => {
  const originalFetch = global.fetch;
  const fontBuffer = fs.readFileSync(path.resolve(__dirname, '../assets/fonts/bangers/bangers-regular.ttf'));
  const fontArrayBuffer = fontBuffer.buffer.slice(
    fontBuffer.byteOffset,
    fontBuffer.byteOffset + fontBuffer.byteLength,
  );
  const stylesheetUrl = 'https://fonts.googleapis.com/css2?family=Test+Google';
  const stylesheetAssetUrl = 'https://cdn.example.test/fonts/test-google.ttf';
  const directAssetUrl = 'https://cdn.example.test/fonts/direct-font.ttf?v=1';
  const cacheRoot = path.resolve(__dirname, '../assets/fonts/downloaded');
  const cacheKey = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'font';
  const cacheDirectories = [
    path.join(cacheRoot, cacheKey('Test Google')),
    path.join(cacheRoot, cacheKey(`remote-font-${directAssetUrl}`)),
  ];

  global.fetch = async (url) => {
    const requestUrl = String(url);
    if (requestUrl === stylesheetUrl) {
      return {
        ok: true,
        text: async () => `
          @font-face {
            font-family: 'Test Google';
            font-style: normal;
            font-weight: 400;
            src: url(${stylesheetAssetUrl}) format('truetype');
          }
        `,
      };
    }
    if (requestUrl === stylesheetAssetUrl || requestUrl === directAssetUrl) {
      return {
        ok: true,
        arrayBuffer: async () => fontArrayBuffer,
      };
    }
    throw new Error(`Unexpected font request: ${requestUrl}`);
  };

  try {
    FontLibrary.reset();
    assert.deepEqual(
      await resolveFontFamilyEntry(stylesheetUrl, { weight: 100, style: 'normal' }),
      ['Test Google'],
    );
    assert.equal(FontLibrary.has('Test Google'), true);

    FontLibrary.reset();
    const [directFamily] = await resolveFontFamilyEntry(directAssetUrl, { weight: 400, style: 'normal' });
    assert.match(directFamily, /^remote-font-/);
    assert.equal(FontLibrary.has(directFamily), true);
  } finally {
    global.fetch = originalFetch;
    FontLibrary.reset();
    for (const directory of cacheDirectories) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
});

test('Node reports unsupported registry variants clearly', async () => {
  await assert.rejects(
    resolveFontFamilyEntry('Cherry Bomb One', { weight: 700, style: 'italic' }),
    (error) => error instanceof FontResolutionError && /no 700 italic variant/.test(error.message),
  );
});
