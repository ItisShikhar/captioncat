/**
 * Browser platform variant of the built-in image asset registry - the
 * engine's side of the `#platform/image-assets.js` boundary (see
 * `image-assets.node.ts` for the Node side).
 *
 * The Node build reads the built-in SVG shapes straight off disk
 * (`entity-system/image-assets.ts`). The browser build cannot do that, so it
 * reads them from a generated manifest instead (see
 * `scripts/generate-browser-svg-manifests.mjs`, which runs before this file
 * is compiled as part of `npm run build`) - a plain data module, so no
 * bundler-specific asset-loading feature is required to consume it.
 */
import { createImageAssetRegistry } from '../image-assets-registry';
import imageAssetSvgSources from './generated/image-asset-svg-sources';

export {
  BUILTIN_IMAGE_ASSET_METADATA,
  BUILTIN_IMAGE_ASSETS,
  CURATED_BUNDLED_IMAGE_ASSETS,
  DEFAULT_BUNDLED_IMAGE_ASSET,
  IMAGE_ASSET_SOURCES,
  type BuiltinImageAsset,
  type BuiltinImageAssetDefinition,
  type BuiltinImageAssetMetadata,
  type ImageAssetSource,
} from '../image-assets-registry';

const registry = createImageAssetRegistry((filename) => {
  const svg = imageAssetSvgSources[filename];
  if (svg === undefined) {
    throw new Error(`Built-in image asset "${filename}" is not available in the browser build.`);
  }
  return svg;
});

export const BUILTIN_IMAGE_ASSET_DEFINITIONS = registry.BUILTIN_IMAGE_ASSET_DEFINITIONS;
export const builtinImageDefinition = registry.builtinImageDefinition;
export const builtinImageSvg = registry.builtinImageSvg;
export const builtinImageGlyph = registry.builtinImageGlyph;
export const isBuiltinImageAsset = registry.isBuiltinImageAsset;
export const normalizeImageAssetSource = registry.normalizeImageAssetSource;
export const resolveImageAsset = registry.resolveImageAsset;
