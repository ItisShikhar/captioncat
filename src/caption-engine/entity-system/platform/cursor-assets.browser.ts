/**
 * Browser platform variant of the built-in cursor asset registry - the
 * engine's side of the `#platform/cursor-assets.js` boundary (see
 * `cursor-assets.node.ts` for the Node side).
 *
 * The Node build reads the built-in cursor SVGs and the cursor preset config
 * straight off disk (`entity-system/cursor-assets.ts`). The browser build
 * cannot do that: the preset config is a plain JSON import (already
 * bundler/`tsc`-portable via `resolveJsonModule`), and the SVGs come from a
 * generated manifest instead (see `scripts/generate-browser-svg-manifests.mjs`,
 * which runs before this file is compiled as part of `npm run build`).
 */
import cursorPresetDocument from '../../../../assets/json/cursor-presets.json';
import { createCursorAssetRegistry } from '../cursor-assets-registry';
import cursorAssetSvgSources from './generated/cursor-asset-svg-sources';

export {
  BUILTIN_CURSOR_ASSET_METADATA,
  CURSOR_ASSET_IDS,
  CURSOR_PRESETS,
  type CursorColorMode,
  type CursorPresetOffset,
  type CursorShape,
  type CursorPresetDefinition,
  type BuiltinCursorAssetDefinition,
  type CursorAssetId,
  type CursorPreset,
} from '../cursor-assets-registry';

const registry = createCursorAssetRegistry((filename) => {
  const svg = cursorAssetSvgSources[filename];
  if (svg === undefined) {
    throw new Error(`Built-in cursor asset "${filename}" is not available in the browser build.`);
  }
  return svg;
}, cursorPresetDocument);

export const BUILTIN_CURSOR_ASSET_DEFINITIONS = registry.BUILTIN_CURSOR_ASSET_DEFINITIONS;
export const CURSOR_PRESET_DEFINITIONS = registry.CURSOR_PRESET_DEFINITIONS;
export const cursorAssetDefinition = registry.cursorAssetDefinition;
export const cursorAssetForPreset = registry.cursorAssetForPreset;
export const cursorAssetsInScene = registry.cursorAssetsInScene;
export const cursorAssetSource = registry.cursorAssetSource;
export const setCursorAssetSourceOverrides = registry.setCursorAssetSourceOverrides;
export const cursorPresetDefinition = registry.cursorPresetDefinition;
export const cursorSvg = registry.cursorSvg;
export const cursorSvgForPreset = registry.cursorSvgForPreset;
export const isCursorPreset = registry.isCursorPreset;
export const normalizeCursorColorMode = registry.normalizeCursorColorMode;
export const normalizeCursorPreset = registry.normalizeCursorPreset;
