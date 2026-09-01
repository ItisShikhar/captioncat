import { CAPTION_EVENT_TRIGGERS, type CaptionEventTrigger } from '../caption-event-types';

export type ImageSequencerPlaybackMode = 'continuous' | 'onTrigger' | 'perTrigger';
export const IMAGE_SEQUENCER_END_OPTIONS = ['hold', 'loop', 'pingPong'] as const;
export type ImageSequencerEndBehavior = (typeof IMAGE_SEQUENCER_END_OPTIONS)[number];
export const IMAGE_SEQUENCER_TRIGGERS = CAPTION_EVENT_TRIGGERS;
export type ImageSequencerTrigger = CaptionEventTrigger;
export const IMAGE_SEQUENCER_ADVANCE_OPTIONS = ['next', 'previous', 'random', 'none'] as const;
export type ImageSequencerAdvance = (typeof IMAGE_SEQUENCER_ADVANCE_OPTIONS)[number];

export interface ImageSequencerTriggerRule {
  trigger: ImageSequencerTrigger;
  advance: ImageSequencerAdvance;
}
