import { segmentTextGraphemes } from './text-layout';
import type {
  CaptionTimedWord,
  CaptionWordWidth,
  CaptionWordWrappingPolicy,
} from './caption-layout';

export interface CaptionWordWrappingOptions {
  availableWidth: number;
  maxWordWidth: CaptionWordWidth;
  /**
   * Optional width used only for wrapping decisions. The pipeline uses this to
   * remove tolerated effect margins without changing the layout width.
   */
  maxWordWidthForWrapping?: CaptionWordWidth;
  policy: CaptionWordWrappingPolicy;
  minimumScale?: number;
}

interface TextChunk {
  text: string;
  endsAtBreakCharacter: boolean;
}

function usableWidth(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : Number.POSITIVE_INFINITY;
}

function toleratedWidth(width: number, tolerance: number): number {
  if (!Number.isFinite(width) || tolerance <= 0) return width;
  return Math.max(0, width - tolerance * 2);
}

function wordWidthForWrapping(
  word: string,
  logicalWordIndex: number | undefined,
  maxWordWidth: CaptionWordWidth,
  policy: CaptionWordWrappingPolicy,
  maxWordWidthForWrapping?: CaptionWordWidth,
): number {
  if (maxWordWidthForWrapping) return maxWordWidthForWrapping(word, logicalWordIndex);
  const tolerance = Number.isFinite(policy.overflowTolerance)
    ? Math.max(0, policy.overflowTolerance)
    : 0;
  return toleratedWidth(maxWordWidth(word, logicalWordIndex), tolerance);
}

function splitAtBreakCharacters(text: string, breakCharacters: readonly string[]): TextChunk[] {
  if (breakCharacters.length === 0) {
    return [{ text, endsAtBreakCharacter: false }];
  }

  const chunks: TextChunk[] = [];
  let start = 0;
  while (start < text.length) {
    let matchIndex = -1;
    let matchLength = 0;
    for (const character of breakCharacters) {
      const index = text.indexOf(character, start);
      if (index < 0 || (matchIndex >= 0 && index > matchIndex)) continue;
      if (index === matchIndex && character.length <= matchLength) continue;
      matchIndex = index;
      matchLength = character.length;
    }
    if (matchIndex < 0) break;
    const end = matchIndex + matchLength;
    chunks.push({
      text: text.slice(start, end),
      endsAtBreakCharacter: true,
    });
    start = end;
  }
  if (start < text.length || chunks.length === 0) {
    chunks.push({
      text: text.slice(start),
      endsAtBreakCharacter: false,
    });
  }
  return chunks;
}

function displayFragment(
  text: string,
  hasFollowingText: boolean,
  endsAtBreakCharacter: boolean,
  breakMarker: string,
): string {
  if (!hasFollowingText || endsAtBreakCharacter || breakMarker.length === 0) return text;
  return `${text}${breakMarker}`;
}

function splitChunkToWidth(
  chunk: TextChunk,
  hasFollowingChunk: boolean,
  logicalWordIndex: number | undefined,
  options: CaptionWordWrappingOptions,
): string[] {
  const graphemes = segmentTextGraphemes(chunk.text);
  if (graphemes.length === 0) return [];

  const width = usableWidth(options.availableWidth) / (options.minimumScale ?? 1);
  const fragments: string[] = [];
  let start = 0;
  while (start < graphemes.length) {
    const remaining = graphemes.length - start;
    let selectedCount = 0;
    for (let count = remaining; count > 0; count -= 1) {
      const isLastFragment = !hasFollowingChunk && count === remaining;
      const text = graphemes.slice(start, start + count).join('');
      const display = displayFragment(
        text,
        !isLastFragment,
        count === remaining && chunk.endsAtBreakCharacter,
        options.policy.breakMarker,
      );
      if (
        wordWidthForWrapping(
          display,
          logicalWordIndex,
          options.maxWordWidth,
          options.policy,
          options.maxWordWidthForWrapping,
        ) <= width
      ) {
        selectedCount = count;
        break;
      }
    }

    if (selectedCount === 0) {
      selectedCount = 1;
    }
    const isLastFragment = !hasFollowingChunk && selectedCount === remaining;
    const text = graphemes.slice(start, start + selectedCount).join('');
    fragments.push(
      displayFragment(
        text,
        !isLastFragment,
        selectedCount === remaining && chunk.endsAtBreakCharacter,
        options.policy.breakMarker,
      ),
    );
    start += selectedCount;
  }
  return fragments;
}

function splitWordToWidth(
  word: string,
  logicalWordIndex: number | undefined,
  options: CaptionWordWrappingOptions,
): string[] {
  const chunks = splitAtBreakCharacters(word, options.policy.breakCharacters);
  return chunks.flatMap((chunk, index) =>
    splitChunkToWidth(chunk, index < chunks.length - 1, logicalWordIndex, options),
  );
}

export function minimumWrappedWordWidth(
  words: readonly string[],
  maxWordWidth: CaptionWordWidth,
  policy: CaptionWordWrappingPolicy,
  maxWordWidthForWrapping?: CaptionWordWidth,
): number {
  if (policy.mode !== 'wrap') {
    return words.reduce(
      (maximum, word, index) =>
        Math.max(
          maximum,
          wordWidthForWrapping(word, index, maxWordWidth, policy, maxWordWidthForWrapping),
        ),
      0,
    );
  }

  let maximum = 0;
  for (const [index, word] of words.entries()) {
    for (const grapheme of segmentTextGraphemes(word)) {
      maximum = Math.max(
        maximum,
        wordWidthForWrapping(grapheme, index, maxWordWidth, policy, maxWordWidthForWrapping),
        wordWidthForWrapping(
          `${grapheme}${policy.breakMarker}`,
          index,
          maxWordWidth,
          policy,
          maxWordWidthForWrapping,
        ),
      );
    }
    for (const breakCharacter of policy.breakCharacters) {
      maximum = Math.max(
        maximum,
        wordWidthForWrapping(breakCharacter, index, maxWordWidth, policy, maxWordWidthForWrapping),
      );
    }
  }
  return maximum;
}

export function wrapCaptionTimedWords(
  master: readonly CaptionTimedWord[],
  options: CaptionWordWrappingOptions,
): CaptionTimedWord[] {
  const width = usableWidth(options.availableWidth) / (options.minimumScale ?? 1);
  return master.flatMap((entry, index) => {
    const logicalWordIndex = entry.logicalWordIndex ?? index;
    const sourceWord = entry.sourceWord ?? entry.word;
    const measuredWidth = wordWidthForWrapping(
      entry.word,
      logicalWordIndex,
      options.maxWordWidth,
      options.policy,
      options.maxWordWidthForWrapping,
    );
    const shouldWrap =
      options.policy.mode === 'wrap' && Number.isFinite(measuredWidth) && measuredWidth > width;
    const fragments = shouldWrap
      ? splitWordToWidth(entry.word, logicalWordIndex, options)
      : [entry.word];
    const fragmentCount = Math.max(1, fragments.length);
    return fragments.map((word, fragmentIndex) => ({
      ...entry,
      word,
      sourceWord,
      logicalWordIndex,
      fragmentIndex,
      fragmentCount,
      ...(fragmentIndex === 0 ? {} : { forceBreakBefore: true }),
    }));
  });
}

export function wrapOversizedCaptionRows(
  rows: readonly CaptionTimedWord[][],
  options: CaptionWordWrappingOptions,
): CaptionTimedWord[][] {
  const width = usableWidth(options.availableWidth) / (options.minimumScale ?? 1);
  return rows.flatMap((row) => {
    if (row.length !== 1 || options.policy.mode !== 'wrap') return [row];

    const entry = row[0];
    const logicalWordIndex = entry.logicalWordIndex;
    const measuredWidth = wordWidthForWrapping(
      entry.word,
      logicalWordIndex,
      options.maxWordWidth,
      options.policy,
      options.maxWordWidthForWrapping,
    );
    if (!Number.isFinite(measuredWidth) || measuredWidth <= width) return [row];

    return wrapCaptionTimedWords(row, options).map((fragment) => [fragment]);
  });
}
