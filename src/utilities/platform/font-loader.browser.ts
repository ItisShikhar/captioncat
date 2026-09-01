/**
 * Browser platform variant of the engine's font loader - the engine's side
 * of the `#platform/font-loader.js` boundary (see `font-loader.node.ts` for
 * the Node side).
 *
 * Same exported surface consumed by the caption engine's font resolver
 * (`resolveFontFamilyEntry`/`formatFontFamilyForCanvas`), reimplemented
 * without any Node `fs`/`path`/`skia-canvas` dependency: remote font URLs are
 * registered as real `FontFace` objects instead of being downloaded to a disk
 * cache and handed to skia-canvas's `FontLibrary`. Local/bundled font sources
 * are the caller's responsibility (see `registerFontFaceFromUrl`, which a
 * host application can use to register its own bundled font binaries before
 * rendering - the browser has no implicit access to `assets/fonts/`).
 */
import {
  getClosestFontVariant,
  getFontFamily,
  getFontFaceWeightDescriptor,
  isGenericFontFamily,
  normalizeFontFaceStyle,
  normalizeFontStyle,
  normalizeFontWeight,
  type FontSource,
  type FontVariant,
} from '../../font-registry';
import { FontResolutionError } from '../font-resolution-error';
import type { FontResolutionOptions, LocalFontSourceResolver } from '../font-loader-types';
export { FontResolutionError } from '../font-resolution-error';
export type { FontResolutionOptions, LocalFontSourceResolver } from '../font-loader-types';

function normalizeFontFamilies(fontFamily: string | string[] | null | undefined): string[] {
  if (!fontFamily) return [];
  if (Array.isArray(fontFamily)) {
    return fontFamily.filter((family): family is string => typeof family === 'string' && family.trim().length > 0);
  }
  return typeof fontFamily === 'string' && fontFamily.trim().length > 0 ? [fontFamily.trim()] : [];
}

function isRemoteFontUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isLocalFontPath(value: string): boolean {
  return /\.(ttf|otf|woff|woff2)$/i.test(value) && (value.includes('/') || value.includes('\\'));
}

function stripQuotes(value: string): string {
  return value.replace(/^['"]+|['"]+$/g, '').trim();
}

function escapeFontFamilyName(value: string): string {
  return value.replace(/'/g, "\\'");
}

const FONT_REQUEST_TIMEOUT_MS = 15_000;

function fontRequestError(url: string): Error {
  return new Error(`Font request timed out after ${FONT_REQUEST_TIMEOUT_MS}ms: ${url}`);
}

function withFontTimeout<T>(promise: Promise<T>, timeoutError: Error): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(timeoutError), FONT_REQUEST_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function getFontSet(): FontFaceSet {
  const workerFonts = (globalThis as typeof globalThis & { fonts?: FontFaceSet }).fonts;
  if (workerFonts) return workerFonts;
  if (typeof document !== 'undefined') return document.fonts;
  throw new Error('This browser does not expose a writable font set.');
}

function descriptorKey(descriptors?: FontFaceDescriptors): string {
  return [
    descriptors?.weight ?? '',
    descriptors?.style ?? '',
    descriptors?.stretch ?? '',
    descriptors?.unicodeRange ?? '',
  ].join('::');
}

async function fetchFontResource(url: string): Promise<ArrayBuffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FONT_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Unable to load font resource ${url} (${response.status}).`);
    return await response.arrayBuffer();
  } catch (error) {
    if (controller.signal.aborted) throw fontRequestError(url);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchStylesheetText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FONT_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Unable to load font stylesheet ${url} (${response.status}).`);
    return await response.text();
  } catch (error) {
    if (controller.signal.aborted) throw fontRequestError(url);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

const loadedStylesheets = new Map<string, Promise<string>>();

function loadStylesheet(url: string): Promise<string> {
  const existing = loadedStylesheets.get(url);
  if (existing) return existing;

  const promise =
    typeof document !== 'undefined'
      ? new Promise<string>((resolve, reject) => {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = url;
          const timeout = setTimeout(() => {
            link.remove();
            reject(fontRequestError(url));
          }, FONT_REQUEST_TIMEOUT_MS);
          link.onload = () => {
            clearTimeout(timeout);
            resolve('');
          };
          link.onerror = () => {
            clearTimeout(timeout);
            reject(new Error(`Unable to load font stylesheet ${url}`));
          };
          document.head.appendChild(link);
        })
      : fetchStylesheetText(url);
  loadedStylesheets.set(url, promise);
  void promise.catch(() => {
    if (loadedStylesheets.get(url) === promise) loadedStylesheets.delete(url);
  });
  return promise;
}

const registeredKeys = new Map<string, Promise<void>>();

/**
 * Registers a font resource URL as a real `FontFace`. Exposed so a host
 * application (e.g. a Studio-style preview tool) can register its own
 * bundled/offline font binaries before rendering, using the exact same
 * registration path the resolver below uses for remote fonts.
 */
export async function registerFontFaceFromUrl(
  family: string,
  url: string,
  descriptors?: FontFaceDescriptors,
): Promise<void> {
  const key = `${family}::${url}::${descriptorKey(descriptors)}`;
  const existing = registeredKeys.get(key);
  if (existing) return existing;
  const promise = (async () => {
    if (typeof FontFace === 'undefined') throw new Error('This browser does not support FontFace.');
    const buffer = await fetchFontResource(url);
    const face = new FontFace(family, buffer, descriptors);
    await withFontTimeout(face.load(), fontRequestError(url));
    getFontSet().add(face);
  })();
  registeredKeys.set(key, promise);
  void promise.catch(() => {
    if (registeredKeys.get(key) === promise) registeredKeys.delete(key);
  });
  return promise;
}

const registeredStylesheets = new Map<string, Promise<void>>();

async function registerStylesheetFonts(
  family: string,
  css: string,
  stylesheetUrl: string,
  requested: Pick<FontFaceDescriptors, 'weight' | 'style'>,
  sourceFamily = family,
): Promise<void> {
  const requestedWeightValue = requested.weight ?? '400';
  const requestedStyleValue = requested.style ?? 'normal';
  const candidates: Array<{ url: string; weight: string; style: string; unicodeRange?: string }> = [];
  for (const match of css.matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
    const block = match[1] ?? '';
    const familyMatch = block.match(/font-family\s*:\s*(?:"([^"]*)"|'([^']*)'|([^;\s]+))/i);
    const blockFamily = familyMatch?.[1] ?? familyMatch?.[2] ?? familyMatch?.[3];
    if (!blockFamily || blockFamily.trim() !== sourceFamily.trim()) continue;
    const sourceMatch = block.match(/url\(\s*(['"]?)(.*?)\1\s*\)/i);
    if (!sourceMatch?.[2]) continue;
    const fontUrl = new URL(sourceMatch[2], stylesheetUrl).href;
    const weightMatch = block.match(/font-weight\s*:\s*([^;]+)/i);
    const styleMatch = block.match(/font-style\s*:\s*([^;]+)/i);
    const unicodeRangeMatch = block.match(/unicode-range\s*:\s*([^;]+)/i);
    candidates.push({
      url: fontUrl,
      weight: weightMatch?.[1]?.trim() || requestedWeightValue,
      style: styleMatch?.[1]?.trim() || requestedStyleValue,
      ...(unicodeRangeMatch?.[1]?.trim() ? { unicodeRange: unicodeRangeMatch[1].trim() } : {}),
    });
  }
  if (candidates.length === 0) throw new Error(`Font stylesheet ${stylesheetUrl} has no face for "${family}".`);

  const requestedWeight = Number.parseInt(String(requestedWeightValue), 10);
  const requestedStyle = String(requestedStyleValue).trim().toLowerCase();
  const matchingCandidates = candidates.filter((candidate) => {
    const candidateWeights = candidate.weight.match(/\d+/g)?.map((value) => Number.parseInt(value, 10)) ?? [400];
    const minWeight = candidateWeights[0] ?? 400;
    const maxWeight = candidateWeights[1] ?? minWeight;
    const style = candidate.style.trim().toLowerCase().split(/\s+/)[0];
    return (
      style === requestedStyle &&
      (!Number.isFinite(requestedWeight) || (minWeight <= requestedWeight && maxWeight >= requestedWeight))
    );
  });
  const selectedCandidates =
    matchingCandidates.length > 0
      ? matchingCandidates
      : candidates.filter((candidate) => candidate.style.trim().toLowerCase().split(/\s+/)[0] === requestedStyle);
  const facesToRegister = selectedCandidates.length > 0 ? selectedCandidates : [candidates[0]];

  await Promise.all(
    facesToRegister.map((candidate) =>
      registerFontFaceFromUrl(family, candidate.url, {
        weight: candidate.weight,
        style: candidate.style,
        ...(candidate.unicodeRange ? { unicodeRange: candidate.unicodeRange } : {}),
      }),
    ),
  );
}

async function registerGoogleFontStylesheet(
  family: string,
  url: string,
  descriptors: Pick<FontFaceDescriptors, 'weight' | 'style'>,
  sourceFamily = family,
): Promise<void> {
  const weight = descriptors.weight ?? '400';
  const style = descriptors.style ?? 'normal';
  const key = `${family}::${sourceFamily}::${url}::${weight}::${style}`;
  const existing = registeredStylesheets.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const css = await loadStylesheet(url);
    const registrationCss =
      css || (sourceFamily.trim().toLowerCase() !== family.trim().toLowerCase() ? await fetchStylesheetText(url) : '');
    if (registrationCss) {
      await registerStylesheetFonts(family, registrationCss, url, { weight, style }, sourceFamily);
    }
    const escapedFamily = family.replace(/"/g, '\\"');
    await withFontTimeout(
      getFontSet().load(`${style} ${weight} 16px "${escapedFamily}"`, 'Hamburgefontsiv'),
      fontRequestError(url),
    );
  })();
  registeredStylesheets.set(key, promise);
  void promise.catch(() => {
    if (registeredStylesheets.get(key) === promise) registeredStylesheets.delete(key);
  });
  return promise;
}

const registeredRemoteVariants = new Map<string, Promise<void>>();

function variantKey(family: string, variant: FontVariant): string {
  return `${family.toLowerCase()}::${variant.weight}::${variant.style}`;
}

async function ensureGoogleFontAssets(
  fontUrl: string,
  familyName: string,
  variant: FontVariant,
  googleFontFamily = familyName,
): Promise<void> {
  const key = `${variantKey(familyName, variant)}::${fontUrl}`;
  const existing = registeredRemoteVariants.get(key);
  if (existing) return existing;

  const promise = (async () => {
    let cssUrl = fontUrl;
    if (fontUrl.includes('fonts.google.com') || fontUrl.includes('www.google.com')) {
      cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(googleFontFamily)}`;
    }
    await registerGoogleFontStylesheet(
      familyName,
      cssUrl,
      { weight: String(variant.weight), style: variant.style },
      googleFontFamily,
    );
  })();
  registeredRemoteVariants.set(key, promise);
  void promise.catch(() => {
    if (registeredRemoteVariants.get(key) === promise) registeredRemoteVariants.delete(key);
  });
  return promise;
}

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
  for (const match of css.matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
    const block = match[1] ?? '';
    const familyMatch = block.match(/font-family\s*:\s*(?:"([^"]*)"|'([^']*)'|([^;\s]+))/i);
    const familyName = familyMatch?.[1] ?? familyMatch?.[2] ?? familyMatch?.[3];
    if (familyName) families.push(stripQuotes(familyName));
  }
  return families;
}

async function resolveGoogleFontFamilies(fontUrl: string): Promise<string[]> {
  const familiesFromUrl = parseGoogleFontFamiliesFromUrl(fontUrl);
  if (familiesFromUrl.length > 0) return familiesFromUrl;
  const css = await fetchStylesheetText(fontUrl);
  return parseGoogleFontFamiliesFromCss(css);
}

/**
 * Resolves local font registry sources - the browser has no implicit access to
 * `assets/fonts/`, so unlike `google`/`remote` sources there is no universal
 * browser-loadable fallback. A host application such as a Studio preview tool
 * can install a resolver via `setLocalFontSourceResolver` to register its own
 * `FontFace`. System sources use the browser's installed fonts directly.
 */
let localFontSourceResolver: LocalFontSourceResolver | undefined;

export function setLocalFontSourceResolver(resolver: LocalFontSourceResolver | undefined): void {
  localFontSourceResolver = resolver;
}

async function registerSource(family: string, variant: FontVariant, source: FontSource): Promise<void> {
  if (source.type === 'google') {
    await ensureGoogleFontAssets(source.url, family, variant, source.fontFamily);
    return;
  }
  if (source.type === 'remote') {
    await registerFontFaceFromUrl(family, source.url, {
      weight: getFontFaceWeightDescriptor(source, variant.weight),
      style: variant.style,
    });
    return;
  }
  if (source.type === 'system') return;
  const registered = (await localFontSourceResolver?.(family, variant, source)) ?? false;
  if (!registered) {
    throw new Error(`no browser-loadable source for font source type "${source.type}"`);
  }
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
  if (!value) return [];

  if (isRemoteFontUrl(value)) {
    const families = await resolveGoogleFontFamilies(value);
    if (families.length === 0) {
      throw new FontResolutionError(`Remote font URL "${value}" did not expose a font family.`);
    }
    const variant: FontVariant = {
      weight: normalizeFontWeight(options.weight),
      style: normalizeFontFaceStyle(options.style),
      sources: [{ type: 'google', url: value }],
    };
    await Promise.all(families.map((family) => ensureGoogleFontAssets(value, family, variant)));
    return families;
  }

  if (isLocalFontPath(value)) {
    const basename = value.replace(/^.*[/\\]/, '').replace(/\.(ttf|otf|woff|woff2)$/i, '');
    return [basename];
  }

  if (isGenericFontFamily(value)) return [value];
  return resolveRegisteredFontFamily(value, options);
}

export function formatFontFamilyForCanvas(fontFamily: string | string[] | null | undefined): string {
  const normalizedFamilies = normalizeFontFamilies(fontFamily);
  if (normalizedFamilies.length === 0) return 'sans-serif';

  const quotedFamilies = normalizedFamilies.map((family) => {
    const trimmed = family.trim();
    if (!trimmed) return 'sans-serif';
    return trimmed.includes(' ') ? `'${escapeFontFamilyName(trimmed)}'` : trimmed;
  });

  return quotedFamilies.join(', ');
}
