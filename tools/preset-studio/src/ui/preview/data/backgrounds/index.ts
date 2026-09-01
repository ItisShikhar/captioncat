import { flatBlackBackground, flatWhiteBackground } from './flat-colors';
import { imageBackgrounds, SMPTE_TV_PATTERN_BACKGROUND_ID } from './image-backgrounds';
import { noiseBackground } from './noise';
import {
  createSolidColorBackground,
  DEFAULT_GRADIENT_BACKGROUND_PAINT,
  DEFAULT_SOLID_BACKGROUND_COLOR,
  GRADIENT_BACKGROUND_ID,
  SOLID_COLOR_BACKGROUND_ID,
  solidColorBackground,
} from './solid-color';
import type { PreviewBackground } from './types';

export type { ImagePreviewBackground, PreviewBackground, StaticPreviewBackground } from './types';
export {
  DEFAULT_GRADIENT_BACKGROUND_PAINT,
  DEFAULT_SOLID_BACKGROUND_COLOR,
  GRADIENT_BACKGROUND_ID,
  SMPTE_TV_PATTERN_BACKGROUND_ID,
  SOLID_COLOR_BACKGROUND_ID,
};

export const BACKGROUND_FIXTURES: PreviewBackground[] = [
  ...imageBackgrounds,
  solidColorBackground,
  noiseBackground,
  flatWhiteBackground,
  flatBlackBackground,
];

export const DEFAULT_BACKGROUND_ID = imageBackgrounds[0]?.id ?? SMPTE_TV_PATTERN_BACKGROUND_ID;

export function getPreviewBackground(backgroundId: string, solidColor: string): PreviewBackground {
  const selected =
    BACKGROUND_FIXTURES.find((background) => background.id === backgroundId) ?? BACKGROUND_FIXTURES[0];
  return selected.id === SOLID_COLOR_BACKGROUND_ID ? createSolidColorBackground(solidColor) : selected;
}
