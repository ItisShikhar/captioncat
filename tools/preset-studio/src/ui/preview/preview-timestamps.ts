import type { CaptionLayoutOverride } from '@captioncat/caption-engine/browser';

/** A short, varied fallback sentence with evenly spaced timings for custom or missing preview text. */
const SAMPLE_WORDS = [
  'This',
  'is',
  'a',
  'live',
  'preview',
  'of',
  'your',
  'caption',
  'style',
  'in',
  'action',
  'right',
  'now',
];
export interface SampleTimestamps {
  words: string[];
  wordStartTimesSeconds: number[];
  wordEndTimesSeconds: number[];
  durationSeconds: number;
  breakBefore?: boolean[];
  captionLayout?: CaptionLayoutOverride;
}

/** Builds evenly spaced timestamps for a compact preview surface. */
export function buildWordTimestamps(words: readonly string[], durationSeconds = 4): SampleTimestamps {
  const previewWords = words.length > 0 ? [...words] : ['Preview'];
  const perWord = durationSeconds / previewWords.length;
  const wordStartTimesSeconds: number[] = [];
  const wordEndTimesSeconds: number[] = [];
  previewWords.forEach((_, i) => {
    const start = i * perWord;
    const end = start + perWord * 0.82;
    wordStartTimesSeconds.push(Number(start.toFixed(3)));
    wordEndTimesSeconds.push(Number(end.toFixed(3)));
  });
  return { words: previewWords, wordStartTimesSeconds, wordEndTimesSeconds, durationSeconds };
}

/** Builds a compact-preview sample with one Page > Row > Word scene per word. */
export function buildSingleWordPageTimestamps(words: readonly string[], durationSeconds = 3): SampleTimestamps {
  const timestamps = buildWordTimestamps(words, durationSeconds);
  return {
    ...timestamps,
    breakBefore: timestamps.words.map((_, index) => index > 0),
    captionLayout: {
      rowsPerPage: {
        mode: 'fixed',
        count: 1,
      },
      breaking: {
        sourceLineBreaks: 'preserve',
      },
    },
  };
}

/**
 * Builds word timestamps spanning `durationSeconds`, leaving a small gap
 * between each word's end and the next word's start (so animations that
 * react to gaps/pauses have something to show).
 */
export function buildSampleTimestamps(durationSeconds = 5): SampleTimestamps {
  return buildWordTimestamps(SAMPLE_WORDS, durationSeconds);
}
