import {
  CAPTION_EVENT_TRIGGERS,
  type CaptionEventTrigger,
} from './caption-event-types';
import type { RandomizerRange } from './value-types';

export type RandomizerAxis = 'x' | 'y' | 'width' | 'height';
export type RandomizerMode = 'among' | 'amongStable' | 'range' | 'randomColor';
export type RandomizerScope = 'entity' | 'row' | 'page';

export const RANDOMIZER_TRIGGER_OPTIONS = [
  'onStart',
  'everyFrame',
  ...CAPTION_EVENT_TRIGGERS,
] as const;
export type RandomizerTrigger = (typeof RANDOMIZER_TRIGGER_OPTIONS)[number];

export const RANDOMIZER_SCOPE_OPTIONS = ['entity', 'row', 'page'] as const;

export interface RandomizerConfig {
  enabled?: boolean;
  mode?: RandomizerMode;
  values?: unknown[];
  range?: RandomizerRange;
  trigger?: RandomizerTrigger;
  updateEveryFrame?: boolean;
  deterministic?: boolean;
  persistAcrossStates?: boolean;
  keepWithinParentBounds?: boolean;
  scope?: RandomizerScope;
  axes?: Partial<Record<RandomizerAxis, RandomizerConfig>>;
}

export type { CaptionEventTrigger };
