import { resolveTextDirection, type ResolvedTextDirection } from '@captioncat/caption-engine/browser';

export interface CaptionLocale {
  id: string;
  name: string;
  /** SRT subtitle text consumed by the generic word-timestamp parser. */
  text: string;
  direction: ResolvedTextDirection;
}

export interface CaptionStory {
  id: string;
  name: string;
  locales: CaptionLocale[];
}

export function defineCaptionLocale(id: string, name: string, text: string): CaptionLocale {
  return {
    id,
    name,
    text,
    direction: resolveTextDirection('auto', id, text),
  };
}
