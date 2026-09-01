import {
  BUILTIN_CURSOR_ASSET_DEFINITIONS,
} from '@captioncat/caption-engine/browser';
import { rasterizeSvgForWorker } from './svg-rasterizer.browser';

let workerAssetSourcesPromise: Promise<Readonly<Record<string, string>>> | undefined;

export function cursorAssetSourcesForWorker(): Promise<Readonly<Record<string, string>>> {
  if (!workerAssetSourcesPromise) {
    workerAssetSourcesPromise = Promise.all(
      BUILTIN_CURSOR_ASSET_DEFINITIONS.map(async (definition) => [
        definition.id,
        await rasterizeSvgForWorker(definition.svg, { cropTransparent: true }),
      ] as const),
    ).then((entries) => Object.fromEntries(entries));
  }
  return workerAssetSourcesPromise;
}

export {
  BUILTIN_CURSOR_ASSET_DEFINITIONS,
  BUILTIN_CURSOR_ASSET_METADATA,
  CURSOR_ASSET_IDS,
  CURSOR_PRESET_DEFINITIONS,
  CURSOR_PRESETS,
  cursorAssetDefinition,
  cursorAssetForPreset,
  cursorAssetsInScene,
  cursorAssetSource,
  cursorPresetDefinition,
  cursorSvg,
  cursorSvgForPreset,
  isCursorPreset,
  normalizeCursorColorMode,
  normalizeCursorPreset,
  setCursorAssetSourceOverrides,
  type BuiltinCursorAssetDefinition,
  type CursorAssetId,
  type CursorColorMode,
  type CursorPreset,
  type CursorPresetDefinition,
  type CursorPresetOffset,
  type CursorShape,
} from '@captioncat/caption-engine/browser';
