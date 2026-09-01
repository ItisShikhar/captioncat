import { chromeLyricsStory } from './chrome-lyrics';
import { emojisStory } from './emoji';
import { lateNightChatStory } from './late-night-chat';
import { streamerChatStory } from './streamer-chat';
import { mainCharacterStory } from './main-character';
import { quickBrownFoxStory } from './quick-brown-fox';
import { randomCharactersStory } from './random-characters';
import { reason2937Story } from './reason-2937';
import { serialKillersStory } from './serial-killers';
import { takeYourChanceStory } from './take-your-chance';
import type { CaptionLocale, CaptionStory } from './types';

export type { CaptionLocale, CaptionStory } from './types';

export const CAPTION_STORIES: CaptionStory[] = [
  serialKillersStory,
  mainCharacterStory,
  reason2937Story,
  takeYourChanceStory,
  lateNightChatStory,
  streamerChatStory,
  chromeLyricsStory,
  randomCharactersStory,
  quickBrownFoxStory,
  emojisStory,
];
export const DEFAULT_STORY_ID = serialKillersStory.id;
export const STATE_PREVIEW_STORY_ID = randomCharactersStory.id;

export function getCaptionStory(storyId: string): CaptionStory | undefined {
  return CAPTION_STORIES.find((story) => story.id === storyId);
}

export function getCaptionLanguagesForStory(storyId: string): CaptionLocale[] {
  return getCaptionStory(storyId)?.locales ?? [];
}

export function getCaptionText(storyId: string, languageId: string): string | null {
  return getCaptionStory(storyId)?.locales.find((locale) => locale.id === languageId)?.text ?? null;
}
