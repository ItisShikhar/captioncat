import { Layers3, Paintbrush, type LucideIcon } from 'lucide-react';
import appleLogoSvg from '../assets/apple.svg?raw';
import instagramLogoSvg from '../assets/instagram.svg?raw';
import netflixLogoSvg from '../assets/netflix.svg?raw';
import snapchatLogoSvg from '../assets/snapchat.svg?raw';
import tiktokLogoSvg from '../assets/tiktok.svg?raw';
import twitchLogoSvg from '../assets/twitch.svg?raw';
import youtubeShortsLogoSvg from '../assets/youtube-shorts.svg?raw';

export interface PlatformDefinition {
  id: string;
  name: string;
  logoSvg?: string;
  icon?: LucideIcon;
  order: number;
  metadata?: {
    searchTerms?: readonly string[];
  };
}

export const PLATFORM_REGISTRY = [
  { id: 'custom', name: 'Custom', icon: Paintbrush, order: -1 },
  { id: 'instagram', name: 'Instagram', logoSvg: instagramLogoSvg, order: 0 },
  { id: 'youtube', name: 'YouTube', logoSvg: youtubeShortsLogoSvg, order: 1 },
  { id: 'youtubeShorts', name: 'YouTube Shorts', logoSvg: youtubeShortsLogoSvg, order: 1 },
  { id: 'tiktok', name: 'TikTok', logoSvg: tiktokLogoSvg, order: 2 },
  { id: 'snapchat', name: 'Snapchat', logoSvg: snapchatLogoSvg, order: 3 },
  { id: 'twitch', name: 'Twitch', logoSvg: twitchLogoSvg, order: 4 },
  { id: 'netflix', name: 'Netflix', logoSvg: netflixLogoSvg, order: 5 },
  { id: 'apple', name: 'Apple', logoSvg: appleLogoSvg, order: 6 },
  { id: 'originals', name: 'Originals', icon: Layers3, order: 7 },
] as const satisfies readonly PlatformDefinition[];

export type PlatformId = (typeof PLATFORM_REGISTRY)[number]['id'];

export function getPlatformDefinition(id: string): PlatformDefinition | undefined {
  return PLATFORM_REGISTRY.find((platform) => platform.id === id);
}

export function platformIdForValue(value: string | undefined): string {
  return value?.trim().toLowerCase() || 'originals';
}

export function createPlatformDefinition(id: string): PlatformDefinition {
  const normalizedId = platformIdForValue(id);
  const knownPlatform = getPlatformDefinition(normalizedId);
  if (knownPlatform) return knownPlatform;

  return {
    id: normalizedId,
    name: normalizedId.replace(/[-_]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase()),
    icon: Layers3,
    order: Number.MAX_SAFE_INTEGER,
  };
}
