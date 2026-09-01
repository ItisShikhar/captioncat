import fs from 'node:fs';
import path from 'node:path';
import { FontLibrary } from '#platform/canvas.js';
import {
  getFontFamily,
  getClosestFontVariant,
  isGenericFontFamily,
  normalizeFontFaceStyle,
  normalizeFontStyle,
  normalizeFontWeight,
  type FontSource,
  type FontVariant,
} from '../font-registry';
import { FontResolutionError } from './font-resolution-error';
import type { FontResolutionOptions } from './font-loader-types';
export { FontResolutionError } from './font-resolution-error';
export type { FontResolutionOptions } from './font-loader-types';

export function resolvePackageAssetPath(...segments: string[]): string {
  return path.resolve(__dirname, '../..', ...segments);
}

export function resolveBuiltInFontPath(fontRelativePath: string): string {
  return resolvePackageAssetPath('assets', 'fonts', fontRelativePath);
}

function normalizeFontFamilies(fontFamily: string | string[] | null | undefined): string[] {
  if (!fontFamily) {
    return [];
  }

  if (Array.isArray(fontFamily)) {
    return fontFamily.filter((family): family is string => typeof family === 'string' && family.trim().length > 0);
  }

  return typeof fontFamily === 'string' && fontFamily.trim().length > 0 ? [fontFamily.trim()] : [];
}

function isRemoteFontUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isDirectFontAssetUrl(value: string): boolean {
  try {
    return /\.(ttf|otf|woff2?)$/i.test(new URL(value).pathname);
  } catch {
    return false;
  }
}

function isLocalFontPath(value: string): boolean {
  return /\.(ttf|otf|woff|woff2)$/i.test(value) && (path.isAbsolute(value) || value.includes(path.sep));
}

function escapeFontFamilyName(value: string): string {
  return value.replace(/'/g, "\\'");
}

function stripQuotes(value: string): string {
  return value.replace(/^['"]+|['"]+$/g, '').trim();
}

function sanitizeFontCacheKey(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'font'
  );
}

interface ParsedFontFaceEntry {
  family: string;
  style: string;
  minWeight: number;
  maxWeight: number;
  src: string;
}

const registeredLocalVariants = new Set<string>();
const registeredRemoteVariants = new Set<string>();

function parseGoogleFontFamiliesFromUrl(fontUrl: string): string[] {
  try {
    const url = new URL(fontUrl);

    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
      const familyParam = url.searchParams.get('family');
      if (familyParam) {
        return familyParam
          .split('|')
          .map((family) => family.split(':')[0].replace(/\+/g, ' ').trim())
          .filter((family): family is string => family.length > 0);
      }
    }

    if (url.hostname === 'fonts.google.com' || url.hostname === 'www.google.com') {
      const specimenMatch = url.pathname.match(/\/specimen\/([^/?#]+)/i);
      if (specimenMatch) {
        const family = decodeURIComponent(specimenMatch[1]).replace(/\+/g, ' ').trim();
        return family ? [family] : [];
      }
    }

    return [];
  } catch {
    return [];
  }
}

function parseGoogleFontFamiliesFromCss(css: string): string[] {
  const families: string[] = [];
  const fontFaceBlocks = css.matchAll(/@font-face\s*\{([^}]*)\}/gi);

  for (const match of fontFaceBlocks) {
    const block = match[1] ?? '';
    const familyMatch = block.match(/font-family\s*:\s*(?:"([^"]*)"|'([^']*)'|([^;\s]+))/i);
    const familyName = familyMatch?.[1] ?? familyMatch?.[2] ?? familyMatch?.[3];
    if (familyName) {
      families.push(stripQuotes(familyName));
    }
  }

  return families;
}

function parseGoogleFontFaceEntries(css: string): ParsedFontFaceEntry[] {
  const entries: ParsedFontFaceEntry[] = [];
  const fontFaceBlocks = css.matchAll(/@font-face\s*\{([^}]*)\}/gi);

  for (const match of fontFaceBlocks) {
    const block = match[1] ?? '';
    const familyMatch = block.match(/font-family\s*:\s*(?:"([^"]*)"|'([^']*)'|([^;\s]+))/i);
    const familyName = familyMatch?.[1] ?? familyMatch?.[2] ?? familyMatch?.[3];
    if (!familyName) {
      continue;
    }

    const styleMatch = block.match(/font-style\s*:\s*([^;]+);/i);
    const style = styleMatch?.[1]?.trim().toLowerCase() === 'italic' ? 'italic' : 'normal';

    const weightMatch = block.match(/font-weight\s*:\s*([^;]+);/i);
    const weightValues = (weightMatch?.[1]?.match(/\d+/g) ?? ['400']).map((value) => Number.parseInt(value, 10));
    const minWeight = weightValues[0] ?? 400;
    const maxWeight = weightValues[1] ?? minWeight;

    const srcMatch = block.match(/src\s*:\s*([^;]+);/i);
    const srcValue = srcMatch?.[1]?.trim() ?? '';
    const urlMatch = srcValue.match(/url\(([^)]+)\)/i);
    const src = urlMatch?.[1]?.trim().replace(/^['"]|['"]$/g, '') ?? '';
    if (src) {
      entries.push({ family: stripQuotes(familyName), style, minWeight, maxWeight, src });
    }
  }

  return entries;
}

function selectGoogleFontFaceEntries(entries: ParsedFontFaceEntry[], weight: number, style: string): ParsedFontFaceEntry[] {
  const styleEntries = entries.filter((entry) => entry.style === style);
  const matchingEntries = styleEntries.filter((entry) => entry.minWeight <= weight && entry.maxWeight >= weight);
  if (matchingEntries.length > 0) return matchingEntries;

  const nearestDistance = (entry: ParsedFontFaceEntry): number =>
    weight < entry.minWeight ? entry.minWeight - weight : weight - entry.maxWeight;
  const closestDistance = Math.min(...styleEntries.map(nearestDistance));
  return styleEntries.filter((entry) => nearestDistance(entry) === closestDistance);
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.text();
}

async function downloadFontAsset(fontUrl: string, destinationPath: string): Promise<void> {
  const response = await fetch(fontUrl);
  if (!response.ok) {
    throw new Error(`Failed to download font asset ${fontUrl}: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.promises.writeFile(destinationPath, buffer);
}

function variantKey(family: string, variant: FontVariant): string {
  return `${family.toLowerCase()}::${variant.weight}::${variant.style}`;
}

function localFontPath(source: Extract<FontSource, { type: 'local' }>): string {
  const relativePath = source.path.replace(/^\.?[\\/]/, '').replace(/[\\/]/g, path.sep);
  return resolvePackageAssetPath('assets', relativePath);
}

async function fileExists(filePath: string): Promise<boolean> {
  return fs.promises
    .stat(filePath)
    .then(() => true)
    .catch(() => false);
}

async function registerLocalVariant(family: string, variant: FontVariant): Promise<void> {
  const localSources = variant.sources.filter(
    (source): source is Extract<FontSource, { type: 'local' }> => source.type === 'local',
  );
  if (localSources.length === 0) throw new Error('no local source');

  const failures: string[] = [];
  for (const source of localSources) {
    const fontPath = localFontPath(source);
    if (!(await fileExists(fontPath))) {
      failures.push(`${source.path} does not exist`);
      continue;
    }

    const key = `${variantKey(family, variant)}::${fontPath}`;
    if (registeredLocalVariants.has(key)) return;
    try {
      FontLibrary.use(family, [fontPath]);
      registeredLocalVariants.add(key);
      return;
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(failures.join('; ') || 'local font registration failed');
}

function remoteFontExtension(fontUrl: string): string {
  try {
    const extension = path.extname(new URL(fontUrl).pathname).toLowerCase();
    return /\.(ttf|otf|woff|woff2)$/.test(extension) ? extension : '.woff2';
  } catch {
    return '.woff2';
  }
}

async function ensureGoogleFontAssets(
  fontUrl: string,
  familyName: string,
  variant: FontVariant,
  googleFontFamily = familyName,
): Promise<void> {
  const cacheDir = path.join(resolvePackageAssetPath('assets', 'fonts', 'downloaded'), sanitizeFontCacheKey(familyName));
  await fs.promises.mkdir(cacheDir, { recursive: true });

  const key = `${variantKey(familyName, variant)}::${fontUrl}`;
  if (registeredRemoteVariants.has(key)) return;

  let cssUrl = fontUrl;
  if (fontUrl.includes('fonts.google.com') || fontUrl.includes('www.google.com')) {
    cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(googleFontFamily)}`;
  }

  const css = await fetchText(cssUrl);
  const entries = selectGoogleFontFaceEntries(
    parseGoogleFontFaceEntries(css).filter((entry) => entry.family.toLowerCase() === googleFontFamily.toLowerCase()),
    variant.weight,
    variant.style,
  );
  if (entries.length === 0) {
    throw new Error(`remote source has no ${variant.weight} ${variant.style} variant`);
  }

  const paths: string[] = [];
  for (const entry of entries) {
    const resolvedUrl = new URL(entry.src, cssUrl).toString();
    const destinationPath = path.join(
      cacheDir,
      `${sanitizeFontCacheKey(entry.family)}-${entry.minWeight}-${entry.maxWeight}-${entry.style}-${sanitizeFontCacheKey(resolvedUrl)}${remoteFontExtension(resolvedUrl)}`,
    );
    if (!(await fileExists(destinationPath))) {
      await downloadFontAsset(resolvedUrl, destinationPath);
    }
    paths.push(destinationPath);
  }

  FontLibrary.use(familyName, paths);
  registeredRemoteVariants.add(key);
}

async function ensureDirectRemoteFont(
  source: Extract<FontSource, { type: 'remote' }>,
  familyName: string,
  variant: FontVariant,
): Promise<void> {
  const cacheDir = path.join(resolvePackageAssetPath('assets', 'fonts', 'downloaded'), sanitizeFontCacheKey(familyName));
  await fs.promises.mkdir(cacheDir, { recursive: true });
  const key = `${variantKey(familyName, variant)}::${source.url}`;
  if (registeredRemoteVariants.has(key)) return;

  const destinationPath = path.join(
    cacheDir,
    `${sanitizeFontCacheKey(familyName)}-${variant.weight}-${variant.style}-${sanitizeFontCacheKey(source.url)}${remoteFontExtension(source.url)}`,
  );
  if (!(await fileExists(destinationPath))) {
    await downloadFontAsset(source.url, destinationPath);
  }
  FontLibrary.use(familyName, [destinationPath]);
  registeredRemoteVariants.add(key);
}

async function ensureDirectRemoteFontAsset(fontUrl: string): Promise<string> {
  const familyName = `remote-font-${sanitizeFontCacheKey(fontUrl)}`;
  const cacheDir = path.join(resolvePackageAssetPath('assets', 'fonts', 'downloaded'), sanitizeFontCacheKey(familyName));
  await fs.promises.mkdir(cacheDir, { recursive: true });

  const key = `direct::${fontUrl}`;
  if (registeredRemoteVariants.has(key)) return familyName;

  const destinationPath = path.join(
    cacheDir,
    `${sanitizeFontCacheKey(fontUrl)}${remoteFontExtension(fontUrl)}`,
  );
  if (!(await fileExists(destinationPath))) {
    await downloadFontAsset(fontUrl, destinationPath);
  }

  FontLibrary.use(familyName, [destinationPath]);
  registeredRemoteVariants.add(key);
  return familyName;
}

async function registerSource(family: string, variant: FontVariant, source: FontSource): Promise<void> {
  if (source.type === 'local') {
    await registerLocalVariant(family, variant);
    return;
  }
  if (source.type === 'google') {
    await ensureGoogleFontAssets(source.url, family, variant, source.fontFamily);
    return;
  }
  if (source.type === 'remote') {
    await ensureDirectRemoteFont(source, family, variant);
    return;
  }
}

async function resolveGoogleFontFamilies(fontUrl: string): Promise<string[]> {
  const familiesFromUrl = parseGoogleFontFamiliesFromUrl(fontUrl);
  if (familiesFromUrl.length > 0) {
    return familiesFromUrl;
  }

  const css = await fetchText(fontUrl);
  return parseGoogleFontFamiliesFromCss(css);
}

async function resolveRegisteredFontFamily(family: string, options: FontResolutionOptions): Promise<string[]> {
  const registryEntry = getFontFamily(family);
  if (!registryEntry) {
    throw new FontResolutionError(
      `Font family "${family}" is not registered. Add it to assets/fonts-data.json or use a generic fallback.`,
    );
  }

  const variant = getClosestFontVariant(family, options.weight, options.style);
  if (!variant) {
    const requestedWeight = normalizeFontWeight(options.weight);
    const requestedStyle = normalizeFontStyle(options.style);
    const available = registryEntry.variants.map((item) => `${item.weight} ${item.style}`).join(', ');
    throw new FontResolutionError(
      `Font family "${registryEntry.family}" has no ${requestedWeight} ${requestedStyle} variant; available variants: ${available}.`,
    );
  }

  const failures: string[] = [];
  for (const source of variant.sources) {
    try {
      await registerSource(registryEntry.family, variant, source);
      return [registryEntry.family];
    } catch (error) {
      failures.push(`${source.type}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new FontResolutionError(
    `Unable to resolve font family "${registryEntry.family}" (${variant.weight} ${variant.style}). ${failures.join(' | ')}`,
  );
}

export async function resolveFontFamilyEntry(
  entry: string,
  options: FontResolutionOptions = {},
): Promise<string[]> {
  const value = entry?.trim();
  if (!value) {
    return [];
  }

  if (isRemoteFontUrl(value)) {
    if (isDirectFontAssetUrl(value)) {
      try {
        return [await ensureDirectRemoteFontAsset(value)];
      } catch (error) {
        throw new FontResolutionError(
          `Unable to download or register remote font asset "${value}".`,
          { cause: error },
        );
      }
    }

    const families = await resolveGoogleFontFamilies(value);
    if (families.length === 0) {
      throw new FontResolutionError(`Remote font URL "${value}" did not expose a font family.`);
    }
    await Promise.all(
      families.map(async (family) => {
        const registryEntry = getFontFamily(family);
        const variant = getClosestFontVariant(family, options.weight, options.style);
        if (registryEntry && !variant) {
          throw new FontResolutionError(`Remote font URL "${value}" has no requested variant for "${family}".`);
        }
        await ensureGoogleFontAssets(
          value,
          family,
          variant ?? {
            weight: normalizeFontWeight(options.weight),
            style: normalizeFontFaceStyle(options.style),
            sources: [{ type: 'google', url: value }],
          },
        );
      }),
    );
    return families;
  }

  if (isLocalFontPath(value)) {
    const basename = path.basename(value, path.extname(value));
    if (!(await fileExists(value))) {
      throw new FontResolutionError(`Local font path "${value}" does not exist.`);
    }
    FontLibrary.use(basename, [value]);
    return [basename];
  }

  if (isGenericFontFamily(value)) return [value];
  return resolveRegisteredFontFamily(value, options);
}

export function formatFontFamilyForCanvas(fontFamily: string | string[] | null | undefined): string {
  const normalizedFamilies = normalizeFontFamilies(fontFamily);
  if (normalizedFamilies.length === 0) {
    return 'sans-serif';
  }

  const quotedFamilies = normalizedFamilies.map((family) => {
    const trimmed = family.trim();
    if (!trimmed) {
      return 'sans-serif';
    }
    return trimmed.includes(' ') ? `'${escapeFontFamilyName(trimmed)}'` : trimmed;
  });

  return quotedFamilies.join(', ');
}
