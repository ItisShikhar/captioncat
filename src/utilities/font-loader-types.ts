import type { FontSource, FontVariant } from '../font-registry';

export interface FontResolutionOptions {
  weight?: unknown;
  style?: unknown;
}

export type LocalFontSourceResolver = (
  family: string,
  variant: FontVariant,
  source: Extract<FontSource, { type: 'local' | 'system' }>,
) => Promise<boolean>;
