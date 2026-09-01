import type { ImagePreviewBackground } from './types';

export const SMPTE_TV_PATTERN_BACKGROUND_ID = 'smpte-tv-pattern';

const imageAssetUrls = import.meta.glob('./images/*.{avif,gif,jpeg,jpg,png,svg,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const IMAGE_NAME_ACRONYMS = new Set(['4k', 'hd', 'smpte', 'tv']);

function imageFileName(path: string): string {
  const fileName = path.slice(path.lastIndexOf('/') + 1);
  return fileName.replace(/\.[^.]+$/, '');
}

function imageId(fileName: string): string {
  if (fileName === SMPTE_TV_PATTERN_BACKGROUND_ID) return SMPTE_TV_PATTERN_BACKGROUND_ID;
  return `image-${fileName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

function imageName(fileName: string): string {
  return fileName
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => {
      const normalized = word.toLowerCase();
      if (IMAGE_NAME_ACRONYMS.has(normalized)) return normalized.toUpperCase();
      return `${normalized.slice(0, 1).toUpperCase()}${normalized.slice(1)}`;
    })
    .join(' ');
}

export const imageBackgrounds: ImagePreviewBackground[] = Object.entries(imageAssetUrls)
  .sort(([firstPath], [secondPath]) => firstPath.localeCompare(secondPath, undefined, { numeric: true }))
  .map(([path, imageUrl]) => {
    const fileName = imageFileName(path);
    return {
      id: imageId(fileName),
      name: imageName(fileName),
      kind: 'image',
      imageUrl,
    };
  });
