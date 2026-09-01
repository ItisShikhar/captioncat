import {
  GENERIC_FONT_FALLBACKS,
  getBundledFontFamilies,
  getFontFamilies,
  isRemoteFontUrl,
  supportsVariableFontWeight,
  getFontFamily,
} from '@captioncat/caption-engine/browser';
import { BUNDLE_FONTS_WITH_REMOTE_SOURCES } from '@/engine-adapters/font-bundle-config';

export interface BundledFontFamily {
  /** Font family name as the engine/canvas expects it (matches preset `fontFamily` values). */
  family: string;
  /** Folder under `assets/fonts/` this family lives in, for reference. */
  folder: string;
  /** Available weight/style variants, purely informational for the picker. */
  variants: string[];
  /** True when a bundled source supports smooth weight interpolation. */
  supportsVariableWeight: boolean;
}

export interface RegistryFontFamily {
  family: string;
  supportsVariableWeight: boolean;
}

export function isVariableFontFamily(family: string): boolean {
  const entry = getFontFamily(family);
  return entry ? supportsVariableFontWeight(entry) : false;
}

export const BUNDLED_FONT_FAMILIES: BundledFontFamily[] = (
  BUNDLE_FONTS_WITH_REMOTE_SOURCES ? getBundledFontFamilies() : []
).map((entry) => {
  const localPaths = entry.variants.flatMap((variant) =>
    variant.sources
      .filter((source): source is { type: 'local'; path: string } => source.type === 'local')
      .map((source) => source.path),
  );
  const firstPath = localPaths[0] ?? '';
  const folder = firstPath.replace(/^\.\/fonts\//, '').split('/')[0] ?? '';
  return {
    family: entry.family,
    folder,
    variants: entry.variants.map((variant) => `${variant.weight} ${variant.style}`),
    supportsVariableWeight: supportsVariableFontWeight(entry),
  };
});

export const FONT_REGISTRY_FAMILIES: RegistryFontFamily[] = getFontFamilies().map((entry) => ({
  family: entry.family,
  supportsVariableWeight: supportsVariableFontWeight(entry),
}));

export { BUNDLE_FONTS_WITH_REMOTE_SOURCES, GENERIC_FONT_FALLBACKS, isRemoteFontUrl };
