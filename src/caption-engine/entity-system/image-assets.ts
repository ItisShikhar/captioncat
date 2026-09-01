import fs from 'node:fs';
import path from 'node:path';
import { createImageAssetRegistry } from './image-assets-registry';

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
} from './image-assets-registry';

const builtinAssetDirectory = [
  path.join(__dirname, 'image-assets'),
  path.resolve(__dirname, '../../../assets/svg/shapes'),
].find((directory) => fs.existsSync(directory));

if (!builtinAssetDirectory) {
  throw new Error('Built-in SVG assets are not available in the package or source tree.');
}

const registry = createImageAssetRegistry((filename) =>
  fs.readFileSync(path.join(builtinAssetDirectory, filename), 'utf8'),
);

export const BUILTIN_IMAGE_ASSET_DEFINITIONS = registry.BUILTIN_IMAGE_ASSET_DEFINITIONS;
export const builtinImageDefinition = registry.builtinImageDefinition;
export const builtinImageSvg = registry.builtinImageSvg;
export const builtinImageGlyph = registry.builtinImageGlyph;
export const isBuiltinImageAsset = registry.isBuiltinImageAsset;
export const normalizeImageAssetSource = registry.normalizeImageAssetSource;
export const resolveImageAsset = registry.resolveImageAsset;
