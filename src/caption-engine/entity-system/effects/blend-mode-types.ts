export const BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'soft-light',
  'hard-light',
  'darken',
  'lighten',
  'difference',
  'exclusion',
] as const;

export type BlendMode = (typeof BLEND_MODES)[number];
