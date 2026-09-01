export const CAPTION_EVENT_TRIGGERS = [
  'currentWordStart',
  'currentWordEnd',
  'currentRowStart',
  'currentRowEnd',
  'currentPageStart',
  'currentPageEnd',
] as const;

export type CaptionEventTrigger = (typeof CAPTION_EVENT_TRIGGERS)[number];
