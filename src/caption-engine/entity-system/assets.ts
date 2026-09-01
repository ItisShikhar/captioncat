import { Canvas, Image as SkiaImage } from '#platform/canvas.js';
import type { PhysicalEntity } from './physical-entities/physical-entity';
import { ImageFlowEntity } from './physical-entities/image-flow';
import { builtinImageSvg, isBuiltinImageAsset, resolveImageAsset } from '#platform/image-assets.js';
import { imageAssetSourceOverride } from './image-asset-overrides';
import type { FlowImageMeasurement } from './layout-engine';

export {
  BUILTIN_IMAGE_ASSET_DEFINITIONS,
  BUILTIN_IMAGE_ASSETS,
  CURATED_BUNDLED_IMAGE_ASSETS,
  DEFAULT_BUNDLED_IMAGE_ASSET,
  IMAGE_ASSET_SOURCES,
  builtinImageDefinition,
  builtinImageGlyph,
  builtinImageSvg,
  isBuiltinImageAsset,
  normalizeImageAssetSource,
  resolveImageAsset,
  type BuiltinImageAssetDefinition,
  type BuiltinImageAsset,
  type ImageAssetSource,
} from '#platform/image-assets.js';

export type ImageAssetStatus = 'idle' | 'loading' | 'loaded' | 'failed' | 'unsupported';

export interface ImageAssetState {
  status: ImageAssetStatus;
  error?: string;
}

export interface ImageAssetLoadOptions {
  maxDimension?: number;
}

interface CachedImageAsset extends ImageAssetState {
  image?: SkiaImage;
  promise?: Promise<CachedImageAsset>;
  rasterDimension?: number;
}

const DEFAULT_SVG_RASTER_DIMENSION = 2048;
const MAX_SVG_RASTER_DIMENSION = 8192;
const imageAssetCache = new Map<string, CachedImageAsset>();

export function imageAssetState(asset: string): ImageAssetState {
  if (isBuiltinImageAsset(asset)) return imageAssetCache.get(asset) ?? { status: 'loaded' };
  return imageAssetCache.get(asset) ?? { status: 'idle' };
}

export function loadedImageAsset(asset: string): SkiaImage | undefined {
  return imageAssetCache.get(asset)?.image;
}

export async function loadImageAsset(asset: string, options: ImageAssetLoadOptions = {}): Promise<ImageAssetState> {
  const maxDimension = options.maxDimension === undefined ? undefined : normalizeRasterDimension(options.maxDimension);
  const current = imageAssetCache.get(asset);
  if (current?.promise && rasterDimensionSatisfies(current, maxDimension)) return current.promise;
  if (current?.status === 'loaded' || current?.status === 'failed' || current?.status === 'unsupported') {
    if (current.status !== 'loaded' || rasterDimensionSatisfies(current, maxDimension)) return current;
  }

  const source =
    imageAssetSourceOverride(asset) ??
    (isBuiltinImageAsset(asset) ? builtinImageDataUrl(asset) : asset);
  const promise = loadExternalImageAsset(source, maxDimension);
  imageAssetCache.set(asset, {
    status: 'loading',
    promise,
    ...(maxDimension === undefined ? {} : { rasterDimension: maxDimension }),
  });
  const result = await promise;
  if (imageAssetCache.get(asset)?.promise === promise) imageAssetCache.set(asset, result);
  return result;
}

export async function preloadImageAssets(assets: readonly string[], options: ImageAssetLoadOptions = {}): Promise<void> {
  const unique = [...new Set(assets.filter((asset) => typeof asset === 'string' && asset.trim().length > 0))];
  await Promise.all(unique.map((asset) => loadImageAsset(asset, options)));
}

function builtinImageDataUrl(asset: string): string {
  const svg = builtinImageSvg(asset).replaceAll('currentColor', '#ffffff');
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function imageAssetsInScene(root: PhysicalEntity): string[] {
  const assets: string[] = [];
  root.traverse((entity) => {
    const image = entity.getComponentsByType('image')[0];
    const asset = resolveImageAsset(
      image?.getProp<string>('assetSource')?.base,
      image?.getProp<string>('asset')?.base,
      image?.getProp<string>('customAsset')?.base,
    );
    if (typeof asset === 'string' && asset.trim().length > 0) assets.push(asset);
    const frames = entity.getComponent('imageSequencer')?.getProp<unknown[]>('frames')?.base;
    if (Array.isArray(frames)) {
      for (const frame of frames) {
        if (typeof frame === 'string' && frame.trim().length > 0) assets.push(frame);
      }
    }
  });
  return assets;
}

/**
 * Preload the image asset for every `ImageFlowEntity` in the tree and return a
 * map of entity id → `FlowImageMeasurement`. Pass the result to
 * `LayoutOptions.flowImageMeasurements` before calling `layoutScene` so the
 * layout engine can resolve image dimensions without async work.
 */
export async function preloadFlowImageMeasurements(
  root: PhysicalEntity,
  options: ImageAssetLoadOptions = {},
): Promise<Map<string, FlowImageMeasurement>> {
  const result = new Map<string, FlowImageMeasurement>();

  const imageEntities: ImageFlowEntity[] = [];
  root.traverse((entity) => {
    if (entity instanceof ImageFlowEntity) imageEntities.push(entity);
  });

  await Promise.all(
    imageEntities.map(async (entity) => {
      const imageComp = entity.getComponentsByType('image')[0];
      if (!imageComp) {
        result.set(entity.id, { width: 0, height: 0, aspectRatio: 1, status: 'failed' });
        return;
      }
      const sequenceFrames = entity.getComponent('imageSequencer')?.getProp<unknown[]>('frames')?.base;
      const sequenceAsset = Array.isArray(sequenceFrames)
        ? sequenceFrames.find((frame): frame is string => typeof frame === 'string' && frame.trim().length > 0)
        : undefined;
      const asset =
        sequenceAsset ??
        resolveImageAsset(
          imageComp.getProp<string>('assetSource')?.base,
          imageComp.getProp<string>('asset')?.base,
          imageComp.getProp<string>('customAsset')?.base,
        );
      if (!asset || asset.trim().length === 0) {
        result.set(entity.id, { width: 0, height: 0, aspectRatio: 1, status: 'failed' });
        return;
      }

      const state = await loadImageAsset(asset, options);
      const loaded = loadedImageAsset(asset);
      const width = (loaded as { width?: number } | undefined)?.width ?? 0;
      const height = (loaded as { height?: number } | undefined)?.height ?? 0;
      const status: FlowImageMeasurement['status'] =
        state.status === 'loaded' ? 'loaded'
        : state.status === 'unsupported' ? 'unsupported'
        : 'failed';
      result.set(entity.id, {
        width,
        height,
        aspectRatio: width > 0 && height > 0 ? width / height : 1,
        status,
      });
    }),
  );

  return result;
}

async function loadExternalImageAsset(asset: string, maxDimension: number | undefined): Promise<CachedImageAsset> {
  if (!isSupportedImageSource(asset)) {
    return { status: 'unsupported', error: 'Only http(s) and data image sources are supported.' };
  }
  try {
    const response = await fetch(asset);
    if (!response.ok) return { status: 'failed', error: `Image request failed with HTTP ${response.status}.` };
    const bytes = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') ?? '';
    const svg = isSvgSource(asset, contentType, bytes);
    const source = svg ? sanitizeSvg(bytes) : bytes;
    const image = await decodeImage(source, svg ? 'image/svg+xml' : contentType, svg ? maxDimension : undefined);
    return { status: 'loaded', image, ...(svg ? { rasterDimension: Math.max(image.width, image.height) } : {}) };
  } catch (error) {
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Image asset could not be decoded.',
    };
  }

  async function decodeImage(bytes: Buffer, contentType: string, rasterMaxDimension?: number): Promise<SkiaImage> {
    let image: SkiaImage;
    if (typeof createImageBitmap === 'function') {
      const buffer = new Uint8Array(bytes).slice().buffer;
      try {
        // Browser Canvas2D accepts ImageBitmap wherever the engine's skia-canvas
        // type expects an image. Keep the engine-facing type stable for Node builds.
        image = (await createImageBitmap(
          new Blob([buffer], { type: contentType || 'application/octet-stream' }),
        )) as unknown as SkiaImage;
        return rasterMaxDimension ? rasterizeImage(image, rasterMaxDimension) : image;
      } catch (error) {
        if (typeof document === 'undefined') throw error;
      }
    }
    if (typeof document !== 'undefined') {
      const image = new SkiaImage();
      const buffer = new Uint8Array(bytes).slice().buffer;
      const url = URL.createObjectURL(new Blob([buffer], { type: contentType || 'application/octet-stream' }));
      image.src = url;
      try {
        await image.decode();
      } finally {
        URL.revokeObjectURL(url);
      }
      return rasterMaxDimension ? rasterizeImage(image, rasterMaxDimension) : image;
    }
    image = new SkiaImage(bytes);
    await image.decode();
    return rasterMaxDimension ? rasterizeImage(image, rasterMaxDimension) : image;
  }
}

function normalizeRasterDimension(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(MAX_SVG_RASTER_DIMENSION, Math.max(1, Math.ceil(value)))
    : DEFAULT_SVG_RASTER_DIMENSION;
}

function rasterDimensionSatisfies(asset: CachedImageAsset, requestedDimension: number | undefined): boolean {
  return requestedDimension === undefined || asset.rasterDimension === undefined || asset.rasterDimension >= requestedDimension;
}

async function rasterizeImage(image: SkiaImage, maxDimension: number): Promise<SkiaImage> {
  const sourceWidth = Math.max(1, Number(image.width));
  const sourceHeight = Math.max(1, Number(image.height));
  const scale = Math.max(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  if (scale <= 1) return image;

  const width = Math.max(1, Math.ceil(sourceWidth * scale));
  const height = Math.max(1, Math.ceil(sourceHeight * scale));
  const canvas = new Canvas(width, height);
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);
  const rasterized = new SkiaImage(await canvas.toBuffer('png'));
  await rasterized.decode();
  return rasterized;
}

function isSupportedImageSource(asset: string): boolean {
  try {
    const url = new URL(asset);
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'data:';
  } catch {
    return false;
  }
}

function isSvgSource(asset: string, contentType: string, bytes: Buffer): boolean {
  return contentType.includes('svg') || /\.svg(?:$|[?#])/i.test(asset) || /^\s*<svg\b/i.test(bytes.toString('utf8'));
}

function sanitizeSvg(bytes: Buffer): Buffer {
  const svg = bytes.toString('utf8')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(['"])[\s\S]*?\1/gi, '');
  return Buffer.from(svg, 'utf8');
}
