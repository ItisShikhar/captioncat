import rawFontRegistry from '../assets/fonts-data.json';

/** Authored/rendered CSS font styles supported by the Font component. */
export type FontStyle = 'normal' | 'italic' | 'oblique';
/** Font-face styles that can be supplied by a registered source file. */
export type FontFaceStyle = Exclude<FontStyle, 'oblique'>;
export type FontSourceType = 'local' | 'google' | 'remote' | 'system';

export interface FontWeightRange {
  min: number;
  max: number;
}

export interface LocalFontSource {
  type: 'local';
  path: string;
  faceWeight?: number;
  weightRange?: FontWeightRange;
}

export interface GoogleFontSource {
  type: 'google';
  url: string;
  /** Actual Google CSS family when it differs from the registry alias. */
  fontFamily?: string;
}

export interface RemoteFontSource {
  type: 'remote';
  url: string;
  faceWeight?: number;
  weightRange?: FontWeightRange;
}

export interface SystemFontSource {
  type: 'system';
}

export type FontSource = LocalFontSource | GoogleFontSource | RemoteFontSource | SystemFontSource;

export interface FontVariant {
  weight: number;
  style: FontFaceStyle;
  sources: FontSource[];
}

export interface FontEmojiSettings {
  sizeScale: number;
  alignmentMode: 'optical' | 'baseline';
  baselineOffset: number;
}

export interface FontFamilyEntry {
  family: string;
  emoji?: Partial<FontEmojiSettings>;
  variants: FontVariant[];
}

export interface FontRegistry {
  fonts: FontFamilyEntry[];
}

export const FONT_REGISTRY = rawFontRegistry as FontRegistry;

const familyEntries = new Map(FONT_REGISTRY.fonts.map((entry) => [entry.family.toLowerCase(), entry]));

export const GENERIC_FONT_FALLBACKS = ['sans-serif', 'serif', 'monospace', 'cursive', 'fantasy', 'system-ui'] as const;
export const DEFAULT_FONT_EMOJI_SETTINGS: FontEmojiSettings = {
  sizeScale: 0.55,
  alignmentMode: 'optical',
  baselineOffset: -0.033,
};

export function getFontFamilies(): readonly FontFamilyEntry[] {
  return FONT_REGISTRY.fonts;
}

export function getFontFamily(family: string): FontFamilyEntry | undefined {
  return familyEntries.get(family.trim().toLowerCase());
}

export function normalizeFontEmojiSettings(
  settings: Partial<FontEmojiSettings> | null | undefined,
): FontEmojiSettings {
  const sizeScale = settings?.sizeScale;
  const baselineOffset = settings?.baselineOffset;
  const alignmentMode = settings?.alignmentMode;
  return {
    sizeScale:
      typeof sizeScale === 'number' && Number.isFinite(sizeScale)
        ? sizeScale
        : DEFAULT_FONT_EMOJI_SETTINGS.sizeScale,
    alignmentMode:
      alignmentMode === 'baseline' || alignmentMode === 'optical'
        ? alignmentMode
        : DEFAULT_FONT_EMOJI_SETTINGS.alignmentMode,
    baselineOffset:
      typeof baselineOffset === 'number' && Number.isFinite(baselineOffset)
        ? baselineOffset
        : DEFAULT_FONT_EMOJI_SETTINGS.baselineOffset,
  };
}

/**
 * Resolve emoji settings from the first non-empty normal-font family only.
 * Later fallback families must not change the primary font's emoji treatment.
 */
export function resolveFontEmojiSettings(
  familyValue: string | string[] | null | undefined,
): FontEmojiSettings {
  const families = Array.isArray(familyValue) ? familyValue : [familyValue];
  const primaryFamily = families.find(
    (family): family is string => typeof family === 'string' && family.trim().length > 0,
  );
  return normalizeFontEmojiSettings(primaryFamily === undefined ? undefined : getFontFamily(primaryFamily)?.emoji);
}

export function resolveFontWeight(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return clampFontWeight(value);
  return 400;
}

function clampFontWeight(value: number): number {
  return Math.min(1000, Math.max(1, value));
}

/** Resolve a weight for registered-face lookup while preserving CSS weight semantics. */
export function normalizeFontWeight(value: unknown): number {
  return Math.round(resolveFontWeight(value));
}

export function normalizeFontStyle(value: unknown): FontStyle {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return normalized === 'italic' || normalized === 'oblique' ? normalized : 'normal';
}

/** Map a rendered style to the closest registered face. CSS applies oblique synthetically. */
export function normalizeFontFaceStyle(value: unknown): FontFaceStyle {
  return normalizeFontStyle(value) === 'italic' ? 'italic' : 'normal';
}

export function getFontVariant(
  family: string,
  weight: unknown = 400,
  style: unknown = 'normal',
): FontVariant | undefined {
  const entry = getFontFamily(family);
  if (!entry) return undefined;
  const requestedWeight = normalizeFontWeight(weight);
  const requestedStyle = normalizeFontFaceStyle(style);
  return entry.variants.find((variant) => variant.weight === requestedWeight && variant.style === requestedStyle);
}

/** Resolve the nearest registered face when the requested weight is not exact. */
export function getClosestFontVariant(
  family: string,
  weight: unknown = 400,
  style: unknown = 'normal',
): FontVariant | undefined {
  const entry = getFontFamily(family);
  if (!entry) return undefined;
  const requestedWeight = normalizeFontWeight(weight);
  const requestedStyle = normalizeFontFaceStyle(style);
  const exact = entry.variants.find((variant) => variant.weight === requestedWeight && variant.style === requestedStyle);
  if (exact) return exact;

  return entry.variants
    .filter((variant) => variant.style === requestedStyle)
    .sort((left, right) => {
      const leftDistance = Math.abs(left.weight - requestedWeight);
      const rightDistance = Math.abs(right.weight - requestedWeight);
      return leftDistance - rightDistance || left.weight - right.weight;
    })[0];
}

export function getVariableFontWeightRange(entry: FontFamilyEntry): FontWeightRange | undefined {
  for (const variant of entry.variants) {
    for (const source of variant.sources) {
      if (source.type !== 'local' && source.type !== 'remote') continue;
      const range = source.weightRange;
      if (isVariableFontWeightRange(range)) return range;
    }
  }
  return undefined;
}

export function supportsVariableFontWeight(entry: FontFamilyEntry): boolean {
  return getVariableFontWeightRange(entry) !== undefined;
}

export function getFontFaceWeightDescriptor(source: FontSource, fallbackWeight: number): string {
  if ((source.type === 'local' || source.type === 'remote') && isVariableFontWeightRange(source.weightRange)) {
    return `${source.weightRange.min} ${source.weightRange.max}`;
  }
  if ((source.type === 'local' || source.type === 'remote') && source.faceWeight !== undefined) {
    return String(source.faceWeight);
  }
  return String(fallbackWeight);
}

function isVariableFontWeightRange(value: FontWeightRange | undefined): value is FontWeightRange {
  return (
    value !== undefined &&
    Number.isFinite(value.min) &&
    Number.isFinite(value.max) &&
    value.min < value.max
  );
}

export function getBundledFontFamilies(): FontFamilyEntry[] {
  return FONT_REGISTRY.fonts.filter((entry) => entry.variants.some((variant) => variant.sources.some((source) => source.type === 'local')));
}

export function isGenericFontFamily(value: string): boolean {
  return GENERIC_FONT_FALLBACKS.includes(value.trim().toLowerCase() as (typeof GENERIC_FONT_FALLBACKS)[number]);
}

export function isRemoteFontUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}
