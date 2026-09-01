export const CURSOR_PRESETS = ['mac', 'windows', 'ios', 'android', 'old', 'caret', 'caret-bold', 'block', 'square', 'underscore', 'custom'] as const;
export type CursorPreset = (typeof CURSOR_PRESETS)[number];

export const BUILTIN_CURSOR_ASSET_METADATA = [
  { id: 'mac', filename: 'mac.svg' },
  { id: 'mac2', filename: 'mac2.svg' },
  { id: 'windows', filename: 'windows.svg' },
  { id: 'old', filename: 'old.svg' },
  { id: 'ios', filename: 'ios.svg' },
  { id: 'caret', filename: 'caret.svg' },
  { id: 'caret-bold', filename: 'caret-bold.svg' },
  { id: 'block', filename: 'block.svg' },
] as const;

export type CursorAssetId = (typeof BUILTIN_CURSOR_ASSET_METADATA)[number]['id'];

export const CURSOR_ASSET_IDS = BUILTIN_CURSOR_ASSET_METADATA.map(({ id }) => id) as readonly CursorAssetId[];

export type CursorColorMode = 'original' | 'tint';
export type CursorShape = 'caret' | 'block' | 'square' | 'underscore' | 'glyph';
export interface CursorPresetOffset {
  x: number;
  y: number;
}

export interface CursorPresetDefinition {
  id: CursorPreset;
  name: string;
  asset: CursorAssetId | undefined;
  shape: CursorShape;
  colorMode: CursorColorMode;
  color: string;
  size: number;
  sizeScale: number;
  offset: CursorPresetOffset;
}

export interface BuiltinCursorAssetDefinition {
  id: CursorAssetId;
  filename: string;
  svg: string;
}

export interface CursorComponentLike {
  effects: readonly { type: string }[];
  components?: readonly CursorComponentLike[];
}

export interface CursorAssetRegistry {
  BUILTIN_CURSOR_ASSET_DEFINITIONS: readonly BuiltinCursorAssetDefinition[];
  CURSOR_PRESET_DEFINITIONS: readonly CursorPresetDefinition[];
  cursorAssetDefinition(asset: string): BuiltinCursorAssetDefinition | undefined;
  cursorAssetForPreset(preset: unknown): CursorAssetId | undefined;
  cursorAssetsInScene(root: {
    traverse: (
      visit: (entity: {
        effects: readonly { type: string }[];
        components: readonly CursorComponentLike[];
      }) => void,
    ) => void;
  }): string[];
  cursorAssetSource(asset: string): string;
  setCursorAssetSourceOverrides(overrides: Readonly<Record<string, string>>): void;
  cursorPresetDefinition(preset: unknown): CursorPresetDefinition | undefined;
  cursorSvg(asset: string): string;
  cursorSvgForPreset(preset: unknown): string;
  isCursorPreset(value: unknown): value is CursorPreset;
  normalizeCursorColorMode(value: unknown): CursorColorMode;
  normalizeCursorPreset(value: unknown): CursorPreset;
}

const FALLBACK_CURSOR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 24"><rect width="2" height="24" rx="0.5" fill="#000000"/></svg>';

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg.replaceAll('currentColor', '#ffffff'))}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: Record<string, unknown>, key: string, context: string): string {
  const candidate = value[key];
  if (typeof candidate !== 'string' || candidate.trim().length === 0) {
    throw new Error(`Cursor preset ${context} must define a non-empty "${key}" string.`);
  }
  return candidate;
}

function requiredNonNegativeNumber(value: Record<string, unknown>, key: string, context: string): number {
  const candidate = value[key];
  if (typeof candidate !== 'number' || !Number.isFinite(candidate) || candidate < 0) {
    throw new Error(`Cursor preset ${context} must define a finite non-negative "${key}" number.`);
  }
  return candidate;
}

function requiredPositiveNumber(value: Record<string, unknown>, key: string, context: string): number {
  const candidate = requiredNonNegativeNumber(value, key, context);
  if (candidate === 0) {
    throw new Error(`Cursor preset ${context} must define a positive "${key}" number.`);
  }
  return candidate;
}

function requiredOffset(value: Record<string, unknown>, key: string, context: string): CursorPresetOffset {
  const candidate = value[key];
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
    throw new Error(`Cursor preset ${context} must define "${key}" as an { x, y } object.`);
  }
  const x = (candidate as Record<string, unknown>).x;
  const y = (candidate as Record<string, unknown>).y;
  if (typeof x !== 'number' || !Number.isFinite(x) || typeof y !== 'number' || !Number.isFinite(y)) {
    throw new Error(`Cursor preset ${context} must define finite "${key}.x" and "${key}.y" numbers.`);
  }
  return { x, y };
}

function isCursorShape(value: unknown): value is CursorShape {
  return value === 'caret' || value === 'block' || value === 'square' || value === 'underscore' || value === 'glyph';
}

function isCursorColorMode(value: unknown): value is CursorColorMode {
  return value === 'original' || value === 'tint';
}

function isCursorAssetId(value: unknown): value is CursorAssetId {
  return typeof value === 'string' && CURSOR_ASSET_IDS.includes(value as CursorAssetId);
}

export function normalizeCursorColorMode(value: unknown): CursorColorMode {
  if (value === 'tint' || value === 'custom') return 'tint';
  return 'original';
}

export function parseCursorPresetDefinitions(document: unknown): readonly CursorPresetDefinition[] {
  if (!isRecord(document) || !Array.isArray(document.presets)) {
    throw new Error('Cursor preset configuration must define a presets array.');
  }

  const parsed = document.presets.map((rawPreset, index): CursorPresetDefinition => {
    const context = `at index ${index}`;
    if (!isRecord(rawPreset)) throw new Error(`Cursor preset ${context} must be an object.`);

    const idValue = requiredString(rawPreset, 'id', context);
    if (!CURSOR_PRESETS.includes(idValue as CursorPreset)) {
      throw new Error(`Cursor preset ${context} has unsupported id "${idValue}".`);
    }
    const id = idValue as CursorPreset;
    const assetValue = rawPreset.asset;
    const asset = assetValue === undefined ? undefined : assetValue;
    if (asset !== undefined && !isCursorAssetId(asset)) {
      throw new Error(`Cursor preset "${id}" has unsupported asset "${String(asset)}".`);
    }
    if (id === 'custom' && asset !== undefined) {
      throw new Error('The custom cursor preset must not define a bundled asset.');
    }

    const shapeValue = rawPreset.shape;
    if (!isCursorShape(shapeValue)) {
      throw new Error(`Cursor preset "${id}" must define a supported shape.`);
    }
    const colorModeValue = rawPreset.colorMode;
    if (!isCursorColorMode(colorModeValue)) {
      throw new Error(`Cursor preset "${id}" must define colorMode as "original" or "tint".`);
    }

    return {
      id,
      name: requiredString(rawPreset, 'name', `"${id}"`),
      asset,
      shape: shapeValue,
      colorMode: colorModeValue,
      color: requiredString(rawPreset, 'color', `"${id}"`),
      size: requiredNonNegativeNumber(rawPreset, 'size', `"${id}"`),
      sizeScale: requiredPositiveNumber(rawPreset, 'sizeScale', `"${id}"`),
      offset: requiredOffset(rawPreset, 'offset', `"${id}"`),
    };
  });

  const seen = new Set<CursorPreset>();
  for (const definition of parsed) {
    if (seen.has(definition.id)) throw new Error(`Cursor preset "${definition.id}" is defined more than once.`);
    seen.add(definition.id);
  }
  for (const preset of CURSOR_PRESETS) {
    if (!seen.has(preset)) throw new Error(`Cursor preset configuration is missing "${preset}".`);
  }

  return parsed;
}

export function createCursorAssetRegistry(
  readSvg: (filename: string) => string,
  presetDocument: unknown,
): CursorAssetRegistry {
  const presetDefinitions = parseCursorPresetDefinitions(presetDocument);
  const assetDefinitions = BUILTIN_CURSOR_ASSET_METADATA.map(({ filename, ...metadata }) => ({
    ...metadata,
    filename,
    svg: readSvg(filename),
  }));
  const sources = new Map<string, string>(
    assetDefinitions.map((definition) => [definition.id, svgDataUrl(definition.svg)]),
  );
  const sourceOverrides = new Map<string, string>();

  function cursorAssetDefinition(asset: string): BuiltinCursorAssetDefinition | undefined {
    return assetDefinitions.find((definition) => definition.id === asset);
  }

  function cursorSvg(asset: string): string {
    return cursorAssetDefinition(asset)?.svg ?? FALLBACK_CURSOR_SVG;
  }

  function cursorAssetSource(asset: string): string {
    return sourceOverrides.get(asset) ?? sources.get(asset) ?? svgDataUrl(FALLBACK_CURSOR_SVG);
  }

  function setCursorAssetSourceOverrides(overrides: Readonly<Record<string, string>>): void {
    sourceOverrides.clear();
    for (const [asset, source] of Object.entries(overrides)) {
      if (sources.has(asset) && source.trim().length > 0) sourceOverrides.set(asset, source);
    }
  }

  function isCursorPreset(value: unknown): value is CursorPreset {
    return typeof value === 'string' && CURSOR_PRESETS.includes(value as CursorPreset);
  }

  function normalizeCursorPreset(value: unknown): CursorPreset {
    return isCursorPreset(value) ? value : 'mac';
  }

  function cursorPresetDefinition(preset: unknown): CursorPresetDefinition | undefined {
    const normalizedPreset = normalizeCursorPreset(preset);
    return presetDefinitions.find((definition) => definition.id === normalizedPreset);
  }

  function cursorAssetForPreset(preset: unknown): CursorAssetId | undefined {
    return cursorPresetDefinition(preset)?.asset;
  }

  function cursorAssetsInScene(root: {
    traverse: (
      visit: (entity: {
        effects: readonly { type: string }[];
        components: readonly CursorComponentLike[];
      }) => void,
    ) => void;
  }): string[] {
    let hasTypewriter = false;
    const hasTypewriterEffect = (
      effects: readonly { type: string }[],
      components: readonly CursorComponentLike[] = [],
    ): boolean =>
      effects.some((effect) => effect.type === 'typewriter') ||
      components.some((component) => hasTypewriterEffect(component.effects, component.components));
    root.traverse((entity) => {
      if (hasTypewriterEffect(entity.effects, entity.components)) {
        hasTypewriter = true;
      }
    });
    return hasTypewriter ? CURSOR_ASSET_IDS.map((asset) => cursorAssetSource(asset)) : [];
  }

  function cursorSvgForPreset(preset: unknown): string {
    const asset = cursorAssetForPreset(preset);
    return asset ? cursorSvg(asset) : '';
  }

  return {
    BUILTIN_CURSOR_ASSET_DEFINITIONS: assetDefinitions,
    CURSOR_PRESET_DEFINITIONS: presetDefinitions,
    cursorAssetDefinition,
    cursorAssetForPreset,
    cursorAssetsInScene,
    cursorAssetSource,
    setCursorAssetSourceOverrides,
    cursorPresetDefinition,
    cursorSvg,
    cursorSvgForPreset,
    isCursorPreset,
    normalizeCursorColorMode,
    normalizeCursorPreset,
  };
}
