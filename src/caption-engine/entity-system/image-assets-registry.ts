export interface BuiltinImageAssetMetadata {
  id: string;
  name: string;
  tags: readonly string[];
  filename: string;
}

export interface BuiltinImageAssetDefinition {
  id: string;
  name: string;
  tags: readonly string[];
  svg: string;
}

function defineMetadata<const Id extends string>(
  id: Id,
  name: string,
  tags: readonly string[],
): BuiltinImageAssetMetadata & { id: Id; filename: `${Id}.svg` } {
  return { id, name, tags, filename: `${id}.svg` } as BuiltinImageAssetMetadata & {
    id: Id;
    filename: `${Id}.svg`;
  };
}

export const BUILTIN_IMAGE_ASSET_METADATA = [
  defineMetadata('arrow-down', 'Arrow Down', ['arrow', 'down']),
  defineMetadata('art', 'Art', ['creative', 'paint', 'design']),
  defineMetadata('basketball', 'Basketball', ['sport', 'ball']),
  defineMetadata('butterfly', 'Butterfly', ['animal', 'insect', 'nature']),
  defineMetadata('cat', 'Cat', ['animal', 'kitty', 'pet', 'kitten']),
  defineMetadata('cat-solid', 'Cat Solid', ['animal', 'kitty', 'pet', 'kitten']),
  defineMetadata('chevron', 'Chevron', ['arrow', 'down', 'expand']),
  defineMetadata('circle', 'Circle', ['shape', 'round', 'dot']),
  defineMetadata('cloud', 'Cloud', ['weather', 'sky']),
  defineMetadata('crescent-moon', 'Crescent Moon', ['night', 'sky']),
  defineMetadata('cross', 'Cross', ['shape', 'plus', 'medical']),
  defineMetadata('diamond', 'Diamond', ['shape', 'rhombus', 'gem']),
  defineMetadata('diya', 'Diya', ['india', 'lamp', 'festival']),
  defineMetadata('person', 'Person', ['dialog', 'speaker', 'person', 'chat', 'avatar']),
  defineMetadata('dog', 'Dog', ['animal', 'puppy', 'pet']),
  defineMetadata('dog-bone', 'Dog Bone', ['animal', 'pet', 'treat']),
  defineMetadata('double-note', 'Double Note', ['music', 'notes', 'sound']),
  defineMetadata('fire', 'Fire', ['hot', 'flame']),
  defineMetadata('fish', 'Fish', ['animal', 'water', 'sea']),
  defineMetadata('heart', 'Heart', ['shape', 'love', 'favorite']),
  defineMetadata('lightning', 'Lightning', ['weather', 'storm']),
  defineMetadata('location-pin', 'Location Pin', ['pointer', 'map', 'place', 'pin']),
  defineMetadata('car', 'Car', ['car', 'taxi', 'transport']),
  defineMetadata('microphone', 'Microphone', ['korea', 'music', 'kpop']),
  defineMetadata('music-note', 'Music Note', ['music', 'note', 'sound']),
  defineMetadata('pizza', 'Pizza', ['food', 'slice']),
  defineMetadata('spark', 'Spark', ['shape', 'shine', 'star']),
  defineMetadata('star', 'Star', ['shape', 'rating', 'favorite']),
  defineMetadata('sun', 'Sun', ['weather', 'day']),
  defineMetadata('tea-cup', 'Tea Cup', ['uk', 'tea', 'drink']),
  defineMetadata('triangle', 'Triangle', ['shape', 'polygon']),
  defineMetadata('wave', 'Wave', ['water', 'ocean']),
  defineMetadata('zzz', 'Zzz', ['sleep', 'tired']),
] as const;

export type BuiltinImageAsset = (typeof BUILTIN_IMAGE_ASSET_METADATA)[number]['id'];

export const BUILTIN_IMAGE_ASSETS = BUILTIN_IMAGE_ASSET_METADATA.map(({ id }) => id) as readonly BuiltinImageAsset[];
export const DEFAULT_BUNDLED_IMAGE_ASSET: BuiltinImageAsset = 'music-note';

export const CURATED_BUNDLED_IMAGE_ASSETS = [
  'music-note',
  'double-note',
  'star',
  'spark',
  'heart',
  'cat-solid',
] as const satisfies readonly BuiltinImageAsset[];

export const IMAGE_ASSET_SOURCES = ['bundled', 'custom'] as const;
export type ImageAssetSource = (typeof IMAGE_ASSET_SOURCES)[number];

export function isBuiltinImageAsset(asset: string): asset is BuiltinImageAsset {
  return BUILTIN_IMAGE_ASSETS.includes(asset as BuiltinImageAsset);
}

export function normalizeImageAssetSource(value: unknown, fallbackAsset: unknown): ImageAssetSource {
  if (value === 'bundled' || value === 'custom') return value;
  return typeof fallbackAsset === 'string' && fallbackAsset.trim().length > 0 && !isBuiltinImageAsset(fallbackAsset)
    ? 'custom'
    : 'bundled';
}

export function resolveImageAsset(sourceValue: unknown, bundledValue: unknown, customValue: unknown): string {
  const source = normalizeImageAssetSource(sourceValue, bundledValue);
  const value = source === 'custom' ? customValue : bundledValue;
  if (typeof value === 'string' && value.trim().length > 0) return value;
  return source === 'custom' ? '' : DEFAULT_BUNDLED_IMAGE_ASSET;
}

export interface ImageAssetRegistry {
  BUILTIN_IMAGE_ASSET_DEFINITIONS: readonly BuiltinImageAssetDefinition[];
  builtinImageDefinition(asset: string): BuiltinImageAssetDefinition | undefined;
  builtinImageSvg(asset: string): string;
  builtinImageGlyph(asset: string): string;
  isBuiltinImageAsset(asset: string): asset is BuiltinImageAsset;
  normalizeImageAssetSource(value: unknown, fallbackAsset: unknown): ImageAssetSource;
  resolveImageAsset(sourceValue: unknown, bundledValue: unknown, customValue: unknown): string;
}

function iconSvg(content: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="1em" height="1em" fill="currentColor" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${content}</svg>`;
}

export function createImageAssetRegistry(readSvg: (filename: string) => string): ImageAssetRegistry {
  const definitions = BUILTIN_IMAGE_ASSET_METADATA.map(({ filename, ...metadata }) => ({
    ...metadata,
    svg: readSvg(filename),
  }));

  function builtinImageDefinition(asset: string): BuiltinImageAssetDefinition | undefined {
    return definitions.find((definition) => definition.id === asset);
  }

  function builtinImageSvg(asset: string): string {
    return (
      builtinImageDefinition(asset)?.svg ??
      iconSvg(
        '<circle cx="16" cy="16" r="10" fill="none" stroke-width="2"/><path d="M16 10v12m-6-6h12" fill="none" stroke-width="2"/>',
      )
    );
  }

  /** Legacy text fallback used only if a bundled SVG has not finished loading. */
  function builtinImageGlyph(asset: string): string {
    const legacyGlyphs: Record<string, string> = {
      'music-note': '♪',
      'double-note': '♫',
      circle: '○',
      star: '★',
      spark: '✦',
      heart: '♥',
      arrow: '◆',
      diamond: '◇',
    };
    const fallback = builtinImageDefinition(asset)?.name.slice(0, 1) ?? asset.slice(0, 1);
    return legacyGlyphs[asset] ?? (fallback || '•');
  }

  function isLoadedBuiltinImageAsset(asset: string): asset is BuiltinImageAsset {
    return builtinImageDefinition(asset) !== undefined;
  }

  function normalizeImageAssetSource(value: unknown, fallbackAsset: unknown): ImageAssetSource {
    if (value === 'bundled' || value === 'custom') return value;
    return typeof fallbackAsset === 'string' && fallbackAsset.trim().length > 0 && !isLoadedBuiltinImageAsset(fallbackAsset)
      ? 'custom'
      : 'bundled';
  }

  function resolveImageAsset(sourceValue: unknown, bundledValue: unknown, customValue: unknown): string {
    const source = normalizeImageAssetSource(sourceValue, bundledValue);
    const value = source === 'custom' ? customValue : bundledValue;
    if (typeof value === 'string' && value.trim().length > 0) return value;
    return source === 'custom' ? '' : DEFAULT_BUNDLED_IMAGE_ASSET;
  }

  return {
    BUILTIN_IMAGE_ASSET_DEFINITIONS: definitions,
    builtinImageDefinition,
    builtinImageSvg,
    builtinImageGlyph,
    isBuiltinImageAsset: isLoadedBuiltinImageAsset,
    normalizeImageAssetSource,
    resolveImageAsset,
  };
}
