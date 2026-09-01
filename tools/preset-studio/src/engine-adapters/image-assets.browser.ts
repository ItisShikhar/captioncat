import {
  builtinImageDefinition,
  isBuiltinImageAsset,
} from '@captioncat/caption-engine/browser';
import { rasterizeSvgForWorker } from './svg-rasterizer.browser';

const workerAssetSourcesPromises = new Map<string, Promise<Readonly<Record<string, string>>>>();

export function imageAssetSourcesForWorker(
  assetIds: readonly string[],
  maxDimension = 2048,
): Promise<Readonly<Record<string, string>>> {
  const normalizedAssetIds = [...new Set(assetIds.filter((asset) => isBuiltinImageAsset(asset)))].sort();
  const normalizedMaxDimension = Math.min(8192, Math.max(2048, Math.ceil(maxDimension)));
  const cacheKey = `${normalizedMaxDimension}:${normalizedAssetIds.join(',')}`;
  const cached = workerAssetSourcesPromises.get(cacheKey);
  if (cached) return cached;

  const promise = Promise.all(
    normalizedAssetIds.map(async (assetId) => {
      const definition = builtinImageDefinition(assetId);
      if (!definition) throw new Error(`Built-in image asset "${assetId}" is not available in the engine browser build.`);
      return [
        definition.id,
        await rasterizeSvgForWorker(definition.svg, { maxDimension: normalizedMaxDimension }),
      ] as const;
    }),
  ).then((entries) => Object.fromEntries(entries));
  workerAssetSourcesPromises.set(cacheKey, promise);
  return promise;
}

export {
  BUILTIN_IMAGE_ASSET_DEFINITIONS,
  BUILTIN_IMAGE_ASSET_METADATA,
  BUILTIN_IMAGE_ASSETS,
  builtinImageDefinition,
  builtinImageGlyph,
  builtinImageSvg,
  CURATED_BUNDLED_IMAGE_ASSETS,
  DEFAULT_BUNDLED_IMAGE_ASSET,
  IMAGE_ASSET_SOURCES,
  isBuiltinImageAsset,
  normalizeImageAssetSource,
  resolveImageAsset,
  type BuiltinImageAsset,
  type BuiltinImageAssetDefinition,
  type BuiltinImageAssetMetadata,
  type ImageAssetSource,
} from '@captioncat/caption-engine/browser';
