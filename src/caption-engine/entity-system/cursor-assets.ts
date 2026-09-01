import fs from 'node:fs';
import path from 'node:path';
import { createCursorAssetRegistry } from './cursor-assets-registry';

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
} from './cursor-assets-registry';

const cursorAssetDirectory = [
  path.join(__dirname, 'image-assets', 'cursors'),
  path.resolve(__dirname, '../../../assets/svg/cursors'),
].find((directory) => fs.existsSync(directory));

if (!cursorAssetDirectory) {
  throw new Error('Built-in cursor SVG assets are not available in the package or source tree.');
}

const cursorPresetConfigPath = [
  path.resolve(__dirname, '../../../assets/json/cursor-presets.json'),
  path.resolve(process.cwd(), 'assets/json/cursor-presets.json'),
].find((filePath) => fs.existsSync(filePath));

if (!cursorPresetConfigPath) {
  throw new Error('Cursor preset configuration is not available in the package or source tree.');
}

const registry = createCursorAssetRegistry((filename) =>
  fs.readFileSync(path.join(cursorAssetDirectory, filename), 'utf8'),
  JSON.parse(fs.readFileSync(cursorPresetConfigPath, 'utf8')),
);

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
