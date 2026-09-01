export const IMAGE_COLOR_MODES = ['original', 'tint', 'solid'] as const;
export const IMAGE_ASPECT_RATIO_MODES = ['maintain', 'stretchToFit', 'custom'] as const;
export const IMAGE_CUSTOM_ASPECT_RATIOS = ['9:16', '16:9', '1:1', '4:3', '3:4'] as const;
export const IMAGE_RENDER_ORDERS = ['belowChildren', 'aboveChildren'] as const;
export const DEFAULT_IMAGE_COLOR = '#3b82f6';

export type ImageColorMode = (typeof IMAGE_COLOR_MODES)[number];
export type ImageAspectRatio = (typeof IMAGE_ASPECT_RATIO_MODES)[number];
export type ImageCustomAspectRatio = (typeof IMAGE_CUSTOM_ASPECT_RATIOS)[number];
export type ImageRenderOrder = (typeof IMAGE_RENDER_ORDERS)[number];

function isImageCustomAspectRatio(value: unknown): value is ImageCustomAspectRatio {
  return (IMAGE_CUSTOM_ASPECT_RATIOS as readonly string[]).includes(value as string);
}

export function normalizeImageAspectRatio(value: unknown): ImageAspectRatio {
  if (value === 'stretchToFit' || value === 'custom') return value;
  if (value === 'auto' || value === 'maintain') return 'maintain';
  if (isImageCustomAspectRatio(value)) return 'custom';
  return 'maintain';
}

export function normalizeImageCustomAspectRatio(value: unknown): ImageCustomAspectRatio {
  return isImageCustomAspectRatio(value) ? value : '16:9';
}

export function normalizeImageRenderOrder(value: unknown): ImageRenderOrder {
  return value === 'aboveChildren' ? 'aboveChildren' : 'belowChildren';
}

export function imageAspectRatioValue(value: unknown, customValue?: unknown): number | undefined {
  const normalized = normalizeImageAspectRatio(value);
  if (normalized !== 'custom') return undefined;
  const ratioValue = isImageCustomAspectRatio(value) ? value : customValue;
  const [width, height] = normalizeImageCustomAspectRatio(ratioValue).split(':').map(Number);
  return width > 0 && height > 0 ? width / height : undefined;
}
