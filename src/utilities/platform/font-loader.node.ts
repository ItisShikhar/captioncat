/**
 * Node platform variant of the engine's font loader. Re-exports the existing
 * `fs`/`skia-canvas`-backed implementation unchanged - see
 * `font-loader.browser.ts` for the browser side of the `#platform/font-loader.js`
 * boundary (root `package.json` `imports` field picks between them per the
 * bundler's `node`/`browser` condition).
 */
import type { LocalFontSourceResolver } from '../font-loader-types';

export { FontResolutionError, formatFontFamilyForCanvas, resolveFontFamilyEntry } from '../font-utils';
export type { FontResolutionOptions, LocalFontSourceResolver } from '../font-loader-types';

/** No browser-only `FontFace` registration API exists for the Node build. */
export async function registerFontFaceFromUrl(
  _family: string,
  _url: string,
  _descriptors?: FontFaceDescriptors,
): Promise<void> {
  throw new Error('registerFontFaceFromUrl is only available in the browser build.');
}

/** No browser-only local-font-source resolution hook exists for the Node build. */
export function setLocalFontSourceResolver(_resolver?: LocalFontSourceResolver): void {
  // Intentionally empty: the Node build resolves `local`/`system` sources itself.
}
