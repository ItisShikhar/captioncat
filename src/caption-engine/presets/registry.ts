import fs from 'node:fs';
import path from 'node:path';
import {
  normalizeEcsCaptionPreset,
  parseEcsCaptionPresetJson,
} from './preset-document';
import type { EcsCaptionPreset } from './preset-document';

export {
  isEcsCaptionPreset,
  normalizeEcsCaptionPreset,
  parseEcsCaptionPreset,
  parseEcsCaptionPresetJson,
  serializeEcsCaptionPreset,
} from './preset-document';
export type {
  CaptionPresetMetadata,
  CaptionPresetPreview,
  CaptionPresetTiming,
  EcsCaptionPreset,
  PresetTiming,
} from './preset-document';

export const CaptionPreset = {
  FiveO: '5o',
  AppleMusic: 'apple-music',
  AvatarDialogue: 'avatar-dialogue',
  Banger: 'banger',
  BreakingNews: 'breaking-news',
  Chic: 'chic',
  ChromeHeartbreaker: 'chrome-heartbreaker',
  Clean: 'clean',
  Coco: 'coco',
  Gamerboy: 'gamerboy',
  GoViral: 'go-viral',
  Goa24: 'goa-24',
  GoldenTicket: 'golden-ticket',
  HighAlert: 'high-alert',
  HipHop: 'hip-hop',
  IgClassicSticker2: 'ig-classic-sticker-2',
  IgClassicSticker: 'ig-classic-sticker',
  IgDemure: 'ig-demure',
  IgSticker: 'ig-sticker',
  IgTypewriter: 'ig-typewriter',
  Imessage: 'imessage',
  Impact: 'impact',
  Karaoke1: 'karaoke-1',
  LoveStory: 'love-story',
  MainCharacter: 'main-character',
  NoContext: 'no-context',
  Poppy: 'poppy',
  Presentation: 'presentation',
  Punch: 'punch',
  SlideWithMe: 'slide-with-me',
  SourGummy: 'sour-gummy',
  Snapchat: 'snapchat',
  TakeYourChance: 'take-your-chance',
  TwitchClassic: 'twitch-classic',
  Vintage: 'vintage',
  YoutubeClassic: 'youtube-classic',
} as const;

export type CaptionPresetName = (typeof CaptionPreset)[keyof typeof CaptionPreset];

export interface CaptionPresetFileSource {
  file: string;
}

export interface CaptionPresetUrlSource {
  url: string;
}

export type CaptionPresetSource =
  | CaptionPresetName
  | EcsCaptionPreset
  | CaptionPresetFileSource
  | CaptionPresetUrlSource;

function isCaptionPresetFileSource(value: CaptionPresetSource): value is CaptionPresetFileSource {
  return typeof value === 'object' && value !== null && 'file' in value;
}

function isCaptionPresetUrlSource(value: CaptionPresetSource): value is CaptionPresetUrlSource {
  return typeof value === 'object' && value !== null && 'url' in value;
}

function parsePresetJson(content: string, source: string): EcsCaptionPreset {
  return parseEcsCaptionPresetJson(content, `Caption preset source "${source}"`);
}

async function readPresetFile(file: string): Promise<EcsCaptionPreset> {
  const resolvedFile = path.resolve(file);
  let content: string;
  try {
    content = await fs.promises.readFile(resolvedFile, 'utf8');
  } catch (error) {
    throw new Error(`Unable to read caption preset file "${resolvedFile}".`, { cause: error });
  }
  return parsePresetJson(content, resolvedFile);
}

async function readPresetUrl(url: string): Promise<EcsCaptionPreset> {
  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(`Unable to fetch caption preset URL "${url}".`, { cause: error });
  }

  if (!response.ok) {
    throw new Error(`Caption preset URL "${url}" returned HTTP ${response.status}.`);
  }

  return parsePresetJson(await response.text(), url);
}

function getEcsPresetDirectories(): string[] {
  return [
    path.resolve(__dirname, '../../../assets/json/caption-style-presets'),
    path.resolve(process.cwd(), 'assets/json/caption-style-presets'),
  ];
}

function loadEcsPresetNames(): CaptionPresetName[] {
  for (const directory of getEcsPresetDirectories()) {
    if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
      continue;
    }

    return fs
      .readdirSync(directory)
      .filter((entry) => entry.toLowerCase().endsWith('.json'))
      .sort()
      .map((entry) => path.basename(entry, path.extname(entry)) as CaptionPresetName);
  }

  return Object.values(CaptionPreset) as CaptionPresetName[];
}

/** IDs of the ECS preset files shipped with the package. */
export const CAPTION_PRESET_NAMES = loadEcsPresetNames();

function getEcsPresetFileCandidates(presetValue: string): string[] {
  const normalized = presetValue.trim();
  if (!normalized) return [];

  const withExt = normalized.toLowerCase().endsWith('.json') ? normalized : `${normalized}.json`;
  const candidates = getEcsPresetDirectories().map((directory) => path.resolve(directory, withExt));
  candidates.push(path.resolve(normalized), path.resolve(process.cwd(), normalized));
  return candidates;
}

/** Load an ECS-native preset by ID, file path, or an already parsed ECS preset. */
export function getEcsCaptionPreset(preset?: string | EcsCaptionPreset): EcsCaptionPreset | undefined {
  if (preset && typeof preset !== 'string') {
    return normalizeEcsCaptionPreset(preset);
  }

  const key = typeof preset === 'string' && preset.trim() ? preset : CaptionPreset.Punch;
  for (const candidate of getEcsPresetFileCandidates(key)) {
    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8')) as unknown;
      const normalized = normalizeEcsCaptionPreset(parsed);
      if (normalized) return normalized;
    } catch {
      // Try the next candidate when a custom or bundled file is malformed.
    }
  }

  return undefined;
}

/** Load a bundled, inline, file-backed, or URL-backed ECS caption preset. */
export async function loadEcsCaptionPreset(
  preset: CaptionPresetSource = CaptionPreset.Punch,
): Promise<EcsCaptionPreset> {
  if (isCaptionPresetFileSource(preset)) {
    if (typeof preset.file !== 'string' || preset.file.trim().length === 0) {
      throw new Error('Caption preset file source must contain a non-empty file path.');
    }
    return readPresetFile(preset.file);
  }

  if (isCaptionPresetUrlSource(preset)) {
    if (typeof preset.url !== 'string' || !/^https?:\/\//i.test(preset.url)) {
      throw new Error('Caption preset URL source must contain an HTTP(S) URL.');
    }
    return readPresetUrl(preset.url);
  }

  const inlinePreset = normalizeEcsCaptionPreset(preset);
  if (inlinePreset) {
    return inlinePreset;
  }

  if (typeof preset === 'string') {
    const bundledPreset = getEcsCaptionPreset(preset);
    if (bundledPreset) {
      return bundledPreset;
    }
  }

  throw new Error('Caption preset source must be a bundled preset name or a valid ECS preset source.');
}
