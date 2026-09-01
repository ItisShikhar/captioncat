import {
  getLanguageTag,
  isTextDirection,
  type TextDirection,
} from './text-direction';
export type { TextDirection } from './text-direction';
import type { Insets } from './insets-types';

export type RowsPerPageMode = 'auto' | 'all' | 'fixed' | 'fit-height';
export type WordsPerRowMode = 'auto' | 'fixed';
export type SmartBreakMode = 'off' | 'auto' | 'custom';
export type SourceLineBreakMode = 'preserve' | 'allow-reflow';
export type CaptionBreakTimingPreset = 'short' | 'medium' | 'long' | 'custom';
export type CaptionBreakRuleMode = 'off' | 'always' | 'prefer' | 'required';
export type CaptionRowBreakRuleId = 'source' | 'punctuation' | 'pause' | 'word-count' | 'width' | 'long-word';
export type CaptionPageBreakRuleId = 'source' | 'punctuation' | 'pause' | 'row-count' | 'height';
export type HorizontalFitMode = 'natural' | 'shrink-to-fit' | 'fill-width';
export type CaptionWordWrappingMode = 'allow-overflow' | 'wrap';
export type LongWordThresholdMode = 'automatic' | 'fixed';
export type FlowParticipationMode = 'include' | 'collapse';
export type FlowCollapseMode = 'reserve' | 'reflow';
export type FlowParticipationRowState = 'default' | 'past' | 'previous' | 'current' | 'next' | 'future';
export type FlowParticipationWordState = Exclude<FlowParticipationRowState, 'default'>;

export const DEFAULT_ROW_BREAK_PAUSE_THRESHOLD_SECONDS = 0.3;
export const DEFAULT_PAGE_BREAK_PAUSE_THRESHOLD_SECONDS = 2.5;
export const DEFAULT_CAPTION_HOLD_THRESHOLD_SECONDS = 1;
export const DEFAULT_CAPTION_WORD_BREAK_CHARACTERS = ['-'] as const;
export const DEFAULT_CAPTION_WORD_BREAK_MARKER = '-';
export const DEFAULT_CAPTION_WORD_WRAP_OVERFLOW_TOLERANCE = 8;
export const DEFAULT_LONG_WORD_THRESHOLD_SECONDS = 0.75;
export const DEFAULT_PAUSE_SPACING_THRESHOLD_SECONDS = 0.8;
export const DEFAULT_PAUSE_SPACING_EXTRA = 32;
export const DEFAULT_PAUSE_SPACING_MAX_EXTRA = 64;
const LONG_WORD_THRESHOLD_BASELINE_WIDTH = 1080;
export const DEFAULT_CAPTION_HORIZONTAL_FIT_MIN_SCALE = 0.5;
export const DEFAULT_CAPTION_HORIZONTAL_FIT_MAX_SCALE = 1.25;
export const MAX_CAPTION_HORIZONTAL_FIT_SCALE = 256;

export const CAPTION_BREAK_TIMING_PRESETS = {
  short: {
    rowBreakPauseThresholdSeconds: 0.15,
    pageBreakPauseThresholdSeconds: 1,
  },
  medium: {
    rowBreakPauseThresholdSeconds: DEFAULT_ROW_BREAK_PAUSE_THRESHOLD_SECONDS,
    pageBreakPauseThresholdSeconds: DEFAULT_PAGE_BREAK_PAUSE_THRESHOLD_SECONDS,
  },
  long: {
    rowBreakPauseThresholdSeconds: 0.75,
    pageBreakPauseThresholdSeconds: 5,
  },
} as const satisfies Record<Exclude<CaptionBreakTimingPreset, 'custom'>, {
  rowBreakPauseThresholdSeconds: number;
  pageBreakPauseThresholdSeconds: number;
}>;

export interface CaptionBreakTimingValues {
  rowBreakPauseThresholdSeconds: number;
  pageBreakPauseThresholdSeconds: number;
}

export interface CaptionPauseSpacingPolicy {
  enabled: boolean;
  thresholdSeconds: number;
  extraSpacing: number;
  maxExtraSpacing: number;
}

export interface CaptionBreakRule<TRuleId extends string = string> {
  id: TRuleId;
  mode: CaptionBreakRuleMode;
}

export interface CaptionBreakPriorityPolicy {
  rows: CaptionBreakRule<CaptionRowBreakRuleId>[];
  pages: CaptionBreakRule<CaptionPageBreakRuleId>[];
}

export interface CaptionBreakPriorityOverride {
  rows?: CaptionBreakRule<CaptionRowBreakRuleId>[];
  pages?: CaptionBreakRule<CaptionPageBreakRuleId>[];
}

export const CAPTION_BREAK_RULE_DEFINITIONS = {
  rows: {
    source: { label: 'Source line breaks', description: 'Break at preserved source line boundaries.', required: false },
    punctuation: { label: 'Punctuation', description: 'Use configured punctuation as a row boundary.', required: false },
    pause: { label: 'Pause threshold', description: 'Break when the pause between words reaches the row threshold.', required: false },
    'word-count': { label: 'Maximum words', description: 'Keep each row within the maximum word count.', required: true },
    width: { label: 'Available width', description: 'Keep each row within the available width.', required: true },
    'long-word': { label: 'Long word protection', description: 'Keep long words from sharing a row.', required: true },
  },
  pages: {
    source: { label: 'Source line breaks', description: 'Start a new page at preserved source line boundaries.', required: false },
    punctuation: { label: 'Punctuation', description: 'Start a new page after configured punctuation.', required: false },
    pause: { label: 'Pause threshold', description: 'Start a new page when the pause reaches the page threshold.', required: false },
    'row-count': { label: 'Maximum rows', description: 'Keep each page within the maximum row count.', required: true },
    height: { label: 'Page height', description: 'Keep each page within its available height.', required: true },
  },
} as const satisfies {
  rows: Record<CaptionRowBreakRuleId, { label: string; description: string; required: boolean }>;
  pages: Record<CaptionPageBreakRuleId, { label: string; description: string; required: boolean }>;
};

export const DEFAULT_CAPTION_BREAK_PRIORITIES: CaptionBreakPriorityPolicy = {
  rows: [
    { id: 'source', mode: 'always' },
    { id: 'punctuation', mode: 'prefer' },
    { id: 'pause', mode: 'always' },
    { id: 'word-count', mode: 'required' },
    { id: 'width', mode: 'required' },
    { id: 'long-word', mode: 'required' },
  ],
  pages: [
    { id: 'source', mode: 'off' },
    { id: 'punctuation', mode: 'off' },
    { id: 'pause', mode: 'always' },
    { id: 'row-count', mode: 'required' },
    { id: 'height', mode: 'required' },
  ],
};

const ROW_BREAK_RULE_IDS = Object.keys(CAPTION_BREAK_RULE_DEFINITIONS.rows) as CaptionRowBreakRuleId[];
const PAGE_BREAK_RULE_IDS = Object.keys(CAPTION_BREAK_RULE_DEFINITIONS.pages) as CaptionPageBreakRuleId[];

export function captionBreakTimingPresetFor(values: CaptionBreakTimingValues): CaptionBreakTimingPreset {
  for (const [preset, presetValues] of Object.entries(CAPTION_BREAK_TIMING_PRESETS) as [
    Exclude<CaptionBreakTimingPreset, 'custom'>,
    CaptionBreakTimingValues,
  ][]) {
    if (
      values.rowBreakPauseThresholdSeconds === presetValues.rowBreakPauseThresholdSeconds &&
      values.pageBreakPauseThresholdSeconds === presetValues.pageBreakPauseThresholdSeconds
    ) {
      return preset;
    }
  }
  return 'custom';
}

export interface RowsPerPagePolicy {
  mode: RowsPerPageMode;
  count?: number;
}

export interface WordsPerRowPolicy {
  mode: WordsPerRowMode;
  count?: number;
}

export interface FlowParticipationPolicy {
  /** Reserve collapsed slots for stable placement, or reflow visible content. */
  collapseMode: FlowCollapseMode;
  rows: Record<FlowParticipationRowState, FlowParticipationMode>;
  words: Record<FlowParticipationWordState, FlowParticipationMode>;
}

export interface CaptionBreakingPolicy {
  smartBreaks: SmartBreakMode;
  rowBreakPauseThresholdSeconds: number;
  pageBreakPauseThresholdSeconds: number;
  pauseSpacing: CaptionPauseSpacingPolicy;
  longWordThresholdMode: LongWordThresholdMode;
  longWordThresholdSeconds: number;
  breakPriorities: CaptionBreakPriorityPolicy;
  wordWrapping: CaptionWordWrappingPolicy;
  sentenceEndings: string[];
  strongPunctuation: string[];
  additionalCharacters: string[];
  sourceLineBreaks: SourceLineBreakMode;
}

export interface SmartBreakRules {
  sentenceEndings: readonly string[];
  strongPunctuation: readonly string[];
  additionalCharacters: readonly string[];
}

export interface CaptionWordWrappingPolicy {
  mode: CaptionWordWrappingMode;
  breakCharacters: string[];
  breakMarker: string;
  /** Decorative horizontal overflow to ignore on each side during wrapping. */
  overflowTolerance: number;
}

export interface CaptionLayoutPolicy {
  textDirection: TextDirection;
  rowsPerPage: RowsPerPagePolicy;
  wordsPerRow: WordsPerRowPolicy;
  flowParticipation: FlowParticipationPolicy;
  horizontalFit: HorizontalFitMode;
  horizontalFitMinScale: number;
  horizontalFitMaxScale: number;
  breaking: CaptionBreakingPolicy;
}

export interface CaptionLayoutOverride {
  textDirection?: TextDirection;
  rowsPerPage?: Partial<RowsPerPagePolicy>;
  wordsPerRow?: Partial<WordsPerRowPolicy>;
  flowParticipation?: {
    collapseMode?: FlowCollapseMode;
    rows?: Partial<Record<FlowParticipationRowState, FlowParticipationMode>>;
    words?: Partial<Record<FlowParticipationWordState, FlowParticipationMode>>;
  };
  horizontalFit?: HorizontalFitMode;
  horizontalFitMinScale?: number;
  horizontalFitMaxScale?: number;
  breaking?: Partial<Omit<CaptionBreakingPolicy, 'breakPriorities' | 'wordWrapping' | 'pauseSpacing'>> & {
    breakPriorities?: CaptionBreakPriorityOverride;
    wordWrapping?: Partial<CaptionWordWrappingPolicy>;
    pauseSpacing?: Partial<CaptionPauseSpacingPolicy>;
  };
}

export interface CaptionTimedWord {
  word: string;
  startTimestamp: number;
  visualEndTimestamp: number;
  breakBefore?: boolean;
  cueIndex?: number;
  logicalWordIndex?: number;
  fragmentIndex?: number;
  fragmentCount?: number;
  sourceWord?: string;
  forceBreakBefore?: boolean;
}

export interface CaptionTextToken {
  text: string;
  breakBefore: boolean;
}

export type CaptionWordWidth = (word: string, logicalWordIndex?: number) => number;

export interface CaptionSegmentationOptions {
  availableWidth: number;
  spaceX: number;
  maxWordWidth: CaptionWordWidth;
  policy: CaptionLayoutPolicy;
  language?: string;
  rowBreakPauseThresholdSeconds: number;
  longWordThreshold: number;
}

export interface CaptionPageAllocationOptions {
  policy: CaptionLayoutPolicy;
  language?: string;
  pageHeight?: number;
  pagePadding?: Pick<Insets, 'top' | 'bottom'>;
  rowSpacing?: number;
  rowHeight?: (row: CaptionTimedWord[]) => number;
  availableWidth?: number;
  spaceX?: number;
  maxWordWidth?: CaptionWordWidth;
  longWordThreshold: number;
  pageBreakPauseThresholdSeconds: number;
}

export interface CaptionPageMinimumSize {
  width: number;
  height: number;
}

export interface CaptionPageMinimumSizeOptions {
  pagePadding?: Insets;
  rowSpacing?: number;
  pauseSpacing?: CaptionPauseSpacingPolicy;
  rowHeight?: (row: CaptionTimedWord[]) => number;
  rowWidth?: (row: CaptionTimedWord[]) => number;
  minimumContentWidth?: number;
}

function createCaptionWordSegmenter(language: string | undefined): Intl.Segmenter | undefined {
  if (typeof Intl.Segmenter !== 'function') return undefined;
  const normalizedLanguage = language?.trim();
  if (!normalizedLanguage) return undefined;
  let locale: string | undefined;
  try {
    locale = Intl.Segmenter.supportedLocalesOf([normalizedLanguage])[0];
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
  }
  if (locale === undefined) return undefined;
  return new Intl.Segmenter(locale, { granularity: 'word' });
}

function hasWhitespaceBetween(text: string, start: number, end: number): boolean {
  return /\s/u.test(text.slice(start, end));
}

function segmentCaptionLine(line: string, segmenter: Intl.Segmenter | undefined): string[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  if (!segmenter) return trimmed.split(/\s+/u);

  const parts = Array.from(segmenter.segment(trimmed)).filter((part) => !/^\s+$/u.test(part.segment));
  const tokens: string[] = [];
  let pendingPrefix = '';
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const previous = parts[index - 1];
    const next = parts[index + 1];
    const hasSpaceBefore = previous === undefined
      ? false
      : hasWhitespaceBetween(trimmed, previous.index + previous.segment.length, part.index);
    const hasSpaceAfter = next === undefined
      ? false
      : hasWhitespaceBetween(trimmed, part.index + part.segment.length, next.index);
    if (part.isWordLike) {
      tokens.push(`${pendingPrefix}${part.segment}`);
      pendingPrefix = '';
      continue;
    }
    if (!hasSpaceBefore && tokens.length > 0) {
      tokens[tokens.length - 1] += part.segment;
    } else if (!hasSpaceAfter && next?.isWordLike) {
      pendingPrefix += part.segment;
    } else {
      if (pendingPrefix) {
        tokens.push(pendingPrefix);
        pendingPrefix = '';
      }
      tokens.push(part.segment);
    }
  }
  if (pendingPrefix) tokens.push(pendingPrefix);
  return tokens;
}

export function segmentCaptionText(text: string, language?: string): CaptionTextToken[] {
  const segmenter = createCaptionWordSegmenter(language);
  const tokens: CaptionTextToken[] = [];
  for (const [lineIndex, line] of text.split(/\r?\n/u).entries()) {
    for (const [tokenIndex, token] of segmentCaptionLine(line, segmenter).entries()) {
      tokens.push({
        text: token,
        breakBefore: lineIndex > 0 && tokenIndex === 0,
      });
    }
  }
  return tokens;
}

export interface CaptionLayoutDiagnostic {
  code: 'page-overflow';
  pageIndex: number;
  rowCount: number;
  requiredHeight: number;
  availableHeight: number;
  message: string;
}

export const CAPTION_LAYOUT_LIMITS = {
  minRowsPerPage: 1,
  maxRowsPerPage: 20,
  minWordsPerRow: 1,
  maxWordsPerRow: 50,
} as const;

const FLOW_PARTICIPATION_STATES: readonly FlowParticipationMode[] = ['include', 'collapse'];
const FLOW_COLLAPSE_MODES: readonly FlowCollapseMode[] = ['reserve', 'reflow'];

const DEFAULT_SENTENCE_ENDINGS = ['.', '!', '?', '।', '॥', '。', '！', '？'];
const DEFAULT_STRONG_PUNCTUATION = [';', ':', '…', '；', '：', '……'];
const STANDARD_SENTENCE_ENDINGS = ['.', '?', '!'];
const INDIC_SENTENCE_ENDINGS = ['.', '?', '!', '।', '॥'];
const CJK_SENTENCE_ENDINGS = ['。', '？', '！', '.', '?', '!'];
const STANDARD_STRONG_PUNCTUATION = ['…', ';', ':'];
const CJK_STRONG_PUNCTUATION = ['…', '；', '：', '……', ';', ':'];
const INDIC_LANGUAGE_TAGS = new Set(['as', 'bn', 'gu', 'hi', 'kn', 'ml', 'mr', 'ne', 'or', 'pa', 'sa', 'ta', 'te']);
const CJK_LANGUAGE_TAGS = new Set(['ja', 'ko', 'zh']);

/** Return the language-aware semantic punctuation used by Smart Breaks: Auto. */
export function getSmartBreakRules(language?: string): SmartBreakRules {
  const tag = getLanguageTag(language);
  if (!tag) {
    return {
      sentenceEndings: [...DEFAULT_SENTENCE_ENDINGS],
      strongPunctuation: [...DEFAULT_STRONG_PUNCTUATION],
      additionalCharacters: [],
    };
  }

  const sentenceEndings = INDIC_LANGUAGE_TAGS.has(tag)
    ? INDIC_SENTENCE_ENDINGS
    : CJK_LANGUAGE_TAGS.has(tag)
      ? CJK_SENTENCE_ENDINGS
      : STANDARD_SENTENCE_ENDINGS;
  const strongPunctuation = CJK_LANGUAGE_TAGS.has(tag)
    ? CJK_STRONG_PUNCTUATION
    : STANDARD_STRONG_PUNCTUATION;
  return {
    sentenceEndings: [...sentenceEndings],
    strongPunctuation: [...strongPunctuation],
    additionalCharacters: [],
  };
}

export function createDefaultCaptionLayoutPolicy(): CaptionLayoutPolicy {
  return {
    textDirection: 'auto',
    rowsPerPage: { mode: 'fixed', count: 1 },
    wordsPerRow: { mode: 'auto' },
    flowParticipation: {
      collapseMode: 'reserve',
      rows: {
        default: 'include',
        past: 'include',
        previous: 'include',
        current: 'include',
        next: 'include',
        future: 'include',
      },
      words: {
        past: 'include',
        previous: 'include',
        current: 'include',
        next: 'include',
        future: 'include',
      },
    },
    horizontalFit: 'natural',
    horizontalFitMinScale: DEFAULT_CAPTION_HORIZONTAL_FIT_MIN_SCALE,
    horizontalFitMaxScale: DEFAULT_CAPTION_HORIZONTAL_FIT_MAX_SCALE,
    breaking: {
      smartBreaks: 'auto',
      rowBreakPauseThresholdSeconds: DEFAULT_ROW_BREAK_PAUSE_THRESHOLD_SECONDS,
      pageBreakPauseThresholdSeconds: DEFAULT_PAGE_BREAK_PAUSE_THRESHOLD_SECONDS,
      pauseSpacing: {
        enabled: false,
        thresholdSeconds: DEFAULT_PAUSE_SPACING_THRESHOLD_SECONDS,
        extraSpacing: DEFAULT_PAUSE_SPACING_EXTRA,
        maxExtraSpacing: DEFAULT_PAUSE_SPACING_MAX_EXTRA,
      },
      longWordThresholdMode: 'automatic',
      longWordThresholdSeconds: DEFAULT_LONG_WORD_THRESHOLD_SECONDS,
      breakPriorities: {
        rows: DEFAULT_CAPTION_BREAK_PRIORITIES.rows.map((rule) => ({ ...rule })),
        pages: DEFAULT_CAPTION_BREAK_PRIORITIES.pages.map((rule) => ({ ...rule })),
      },
      wordWrapping: {
        mode: 'wrap',
        breakCharacters: [...DEFAULT_CAPTION_WORD_BREAK_CHARACTERS],
        breakMarker: DEFAULT_CAPTION_WORD_BREAK_MARKER,
        overflowTolerance: DEFAULT_CAPTION_WORD_WRAP_OVERFLOW_TOLERANCE,
      },
      sentenceEndings: [...getSmartBreakRules().sentenceEndings],
      strongPunctuation: [...getSmartBreakRules().strongPunctuation],
      additionalCharacters: [...getSmartBreakRules().additionalCharacters],
      sourceLineBreaks: 'preserve',
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRowsPerPageMode(value: unknown): value is RowsPerPageMode {
  return value === 'fixed' || value === 'fit-height' || value === 'auto' || value === 'all';
}

function isWordsPerRowMode(value: unknown): value is WordsPerRowMode {
  return value === 'auto' || value === 'fixed';
}

function isSmartBreakMode(value: unknown): value is SmartBreakMode {
  return value === 'off' || value === 'auto' || value === 'custom';
}

function isSourceLineBreakMode(value: unknown): value is SourceLineBreakMode {
  return value === 'preserve' || value === 'allow-reflow';
}

function isLongWordThresholdMode(value: unknown): value is LongWordThresholdMode {
  return value === 'automatic' || value === 'fixed';
}

export function resolveLongWordThreshold(
  mode: LongWordThresholdMode,
  configuredSeconds: number,
  effectiveAvailableWidth: number,
): number {
  if (mode === 'fixed') return configuredSeconds;
  // Keep the 9:16 portrait baseline at the configured value, then scale up
  // for wider caption areas.
  const width = Number.isFinite(effectiveAvailableWidth) ? Math.max(1, effectiveAvailableWidth) : 1;
  const scalingWidth = Math.max(LONG_WORD_THRESHOLD_BASELINE_WIDTH, width);
  return Math.min(10, Math.max(0.05, configuredSeconds * (scalingWidth / LONG_WORD_THRESHOLD_BASELINE_WIDTH)));
}

function isHorizontalFitMode(value: unknown): value is HorizontalFitMode {
  return value === 'natural' || value === 'shrink-to-fit' || value === 'fill-width';
}

function isCaptionWordWrappingMode(value: unknown): value is CaptionWordWrappingMode {
  return value === 'allow-overflow' || value === 'wrap';
}

function isCaptionBreakRuleMode(value: unknown): value is CaptionBreakRuleMode {
  return value === 'off' || value === 'always' || value === 'prefer' || value === 'required';
}

function isRequiredBreakRuleId(value: string): boolean {
  return value === 'word-count' || value === 'width' || value === 'long-word' || value === 'row-count' || value === 'height';
}

function validateBreakRuleList<TRuleId extends string>(
  value: unknown,
  allowedIds: readonly TRuleId[],
  defaults: readonly CaptionBreakRule<TRuleId>[],
  label: string,
): CaptionBreakRule<TRuleId>[] {
  if (value === undefined) return defaults.map((rule) => ({ ...rule }));
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  if (value.length !== allowedIds.length) {
    throw new Error(`${label} must contain each break rule exactly once.`);
  }

  const seen = new Set<string>();
  return value.map((entry, index) => {
    const rule = requireRecord(entry, `${label}[${index}]`);
    const id = rule.id;
    if (!allowedIds.includes(id as TRuleId)) throw new Error(`${label}[${index}].id is invalid.`);
    if (seen.has(String(id))) throw new Error(`${label} contains duplicate rule "${String(id)}".`);
    seen.add(String(id));
    const mode = rule.mode;
    if (!isCaptionBreakRuleMode(mode)) throw new Error(`${label}[${index}].mode is invalid.`);
    if (mode === 'off' && isRequiredBreakRuleId(String(id))) {
      throw new Error(`${label}[${index}] cannot disable the "${String(id)}" constraint.`);
    }
    return { id: id as TRuleId, mode };
  });
}

function validateBreakPriorities(
  value: unknown,
  defaults: CaptionBreakPriorityPolicy,
  label: string,
): CaptionBreakPriorityPolicy {
  const input = value === undefined ? {} : requireRecord(value, label);
  return {
    rows: validateBreakRuleList(input.rows, ROW_BREAK_RULE_IDS, defaults.rows, `${label}.rows`),
    pages: validateBreakRuleList(input.pages, PAGE_BREAK_RULE_IDS, defaults.pages, `${label}.pages`),
  };
}

function validateWordWrapping(
  value: unknown,
  defaults: CaptionWordWrappingPolicy,
  label: string,
): CaptionWordWrappingPolicy {
  const input = value === undefined ? {} : requireRecord(value, label);
  const mode = input.mode ?? defaults.mode;
  if (!isCaptionWordWrappingMode(mode)) {
    throw new Error(`${label}.mode must be "allow-overflow" or "wrap".`);
  }

  const breakCharacters = input.breakCharacters === undefined
    ? [...defaults.breakCharacters]
    : validateCharacters(requireStringArray(input.breakCharacters, `${label}.breakCharacters`), `${label}.breakCharacters`);
  const breakMarker = input.breakMarker === undefined
    ? defaults.breakMarker
    : requireString(input.breakMarker, `${label}.breakMarker`);
  const overflowTolerance = input.overflowTolerance === undefined
    ? defaults.overflowTolerance
    : requireNonNegativeNumber(input.overflowTolerance, `${label}.overflowTolerance`);
  return { mode, breakCharacters, breakMarker, overflowTolerance };
}

function validatePauseSpacing(
  value: unknown,
  defaults: CaptionPauseSpacingPolicy,
  label: string,
): CaptionPauseSpacingPolicy {
  const input = value === undefined ? {} : requireRecord(value, label);
  const enabled = input.enabled === undefined ? defaults.enabled : input.enabled;
  if (typeof enabled !== 'boolean') throw new Error(`${label}.enabled must be a boolean.`);
  const thresholdSeconds = input.thresholdSeconds === undefined
    ? defaults.thresholdSeconds
    : requireNonNegativeNumber(input.thresholdSeconds, `${label}.thresholdSeconds`);
  const extraSpacing = input.extraSpacing === undefined
    ? defaults.extraSpacing
    : requireNonNegativeNumber(input.extraSpacing, `${label}.extraSpacing`);
  const maxExtraSpacing = input.maxExtraSpacing === undefined
    ? defaults.maxExtraSpacing
    : requireNonNegativeNumber(input.maxExtraSpacing, `${label}.maxExtraSpacing`);
  return { enabled, thresholdSeconds, extraSpacing, maxExtraSpacing };
}

function isFlowParticipationMode(value: unknown): value is FlowParticipationMode {
  return FLOW_PARTICIPATION_STATES.includes(value as FlowParticipationMode);
}

function isFlowCollapseMode(value: unknown): value is FlowCollapseMode {
  return FLOW_COLLAPSE_MODES.includes(value as FlowCollapseMode);
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);
  return value;
}

function requireStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new Error(`${path} must be an array of strings.`);
  }
  return [...value];
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new Error(`${path} must be a string.`);
  assertUnicode(value, path);
  return value;
}

function requireCount(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${path} must be an integer from ${min} through ${max}.`);
  }
  return value;
}

function requireNonNegativeNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${path} must be a finite number greater than or equal to 0.`);
  }
  return value;
}

function requirePositiveNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${path} must be a finite number greater than 0.`);
  }
  return value;
}

function requireHorizontalFitScale(value: unknown, path: string): number {
  const scale = requirePositiveNumber(value, path);
  if (scale > MAX_CAPTION_HORIZONTAL_FIT_SCALE) {
    throw new Error(`${path} must be less than or equal to ${MAX_CAPTION_HORIZONTAL_FIT_SCALE}.`);
  }
  return scale;
}

function assertUnicode(value: string, path: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) throw new Error(`${path} contains an invalid Unicode surrogate.`);
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new Error(`${path} contains an invalid Unicode surrogate.`);
    }
  }
}

function validateCharacters(values: string[], path: string): string[] {
  const result = values.map((value, index) => {
    if (value.length === 0) throw new Error(`${path}[${index}] must not be empty.`);
    assertUnicode(value, `${path}[${index}]`);
    return value;
  });
  return [...new Set(result)];
}

function validateFlowParticipation(
  value: unknown,
  defaults: FlowParticipationPolicy,
  label: string,
): FlowParticipationPolicy {
  const input = value === undefined ? {} : requireRecord(value, label);
  const collapseMode = input.collapseMode ?? defaults.collapseMode;
  if (!isFlowCollapseMode(collapseMode)) {
    throw new Error(`${label}.collapseMode must be "reserve" or "reflow".`);
  }
  const rowsInput = input.rows === undefined ? {} : requireRecord(input.rows, `${label}.rows`);
  const wordsInput = input.words === undefined ? {} : requireRecord(input.words, `${label}.words`);
  const rows = { ...defaults.rows };
  const words = { ...defaults.words };

  for (const state of Object.keys(rows) as FlowParticipationRowState[]) {
    const next = rowsInput[state];
    if (next !== undefined && !isFlowParticipationMode(next)) {
      throw new Error(`${label}.rows.${state} must be "include" or "collapse".`);
    }
    if (next !== undefined) rows[state] = next;
  }
  for (const state of Object.keys(words) as FlowParticipationWordState[]) {
    const next = wordsInput[state];
    if (next !== undefined && !isFlowParticipationMode(next)) {
      throw new Error(`${label}.words.${state} must be "include" or "collapse".`);
    }
    if (next !== undefined) words[state] = next;
  }
  return { collapseMode, rows, words };
}

function validateFlowParticipationOverride(
  value: unknown,
  label: string,
): NonNullable<CaptionLayoutOverride['flowParticipation']> {
  const input = requireRecord(value, label);
  const collapseMode = input.collapseMode;
  if (collapseMode !== undefined && !isFlowCollapseMode(collapseMode)) {
    throw new Error(`${label}.collapseMode must be "reserve" or "reflow".`);
  }
  const rows = input.rows === undefined ? undefined : requireRecord(input.rows, `${label}.rows`);
  const words = input.words === undefined ? undefined : requireRecord(input.words, `${label}.words`);
  const validateRecord = <T extends string>(
    record: Record<string, unknown> | undefined,
    states: readonly T[],
    path: string,
  ): Partial<Record<T, FlowParticipationMode>> | undefined => {
    if (!record) return undefined;
    const result: Partial<Record<T, FlowParticipationMode>> = {};
    for (const state of states) {
      const next = record[state];
      if (next === undefined) continue;
      if (!isFlowParticipationMode(next)) {
        throw new Error(`${path}.${state} must be "include" or "collapse".`);
      }
      result[state] = next;
    }
    return result;
  };
  const rowValues = validateRecord(
    rows,
    ['default', 'past', 'previous', 'current', 'next', 'future'],
    `${label}.rows`,
  );
  const wordValues = validateRecord(words, ['past', 'previous', 'current', 'next', 'future'], `${label}.words`);
  return {
    ...(collapseMode === undefined ? {} : { collapseMode }),
    ...(rowValues === undefined ? {} : { rows: rowValues }),
    ...(wordValues === undefined ? {} : { words: wordValues }),
  };
}

export function validateCaptionLayoutPolicy(value: unknown, label = 'captionLayout'): CaptionLayoutPolicy {
  const defaults = createDefaultCaptionLayoutPolicy();
  const input = requireRecord(value, label);
  const rows = requireRecord(input.rowsPerPage, `${label}.rowsPerPage`);
  const words = requireRecord(input.wordsPerRow, `${label}.wordsPerRow`);
  const breaking = requireRecord(input.breaking, `${label}.breaking`);

  const textDirection = input.textDirection ?? defaults.textDirection;
  if (!isTextDirection(textDirection)) throw new Error(`${label}.textDirection must be "auto", "ltr", or "rtl".`);
  const rowsMode = rows.mode;
  if (!isRowsPerPageMode(rowsMode)) throw new Error(`${label}.rowsPerPage.mode is invalid.`);
  const wordsMode = words.mode;
  if (!isWordsPerRowMode(wordsMode)) throw new Error(`${label}.wordsPerRow.mode is invalid.`);
  const horizontalFit = input.horizontalFit ?? defaults.horizontalFit;
  if (!isHorizontalFitMode(horizontalFit)) throw new Error(`${label}.horizontalFit is invalid.`);
  const horizontalFitMinScale = input.horizontalFitMinScale === undefined
    ? defaults.horizontalFitMinScale
    : requireHorizontalFitScale(input.horizontalFitMinScale, `${label}.horizontalFitMinScale`);
  const horizontalFitMaxScale = input.horizontalFitMaxScale === undefined
    ? defaults.horizontalFitMaxScale
    : requireHorizontalFitScale(input.horizontalFitMaxScale, `${label}.horizontalFitMaxScale`);
  if (horizontalFitMinScale > horizontalFitMaxScale) {
    throw new Error(`${label}.horizontalFitMinScale must be less than or equal to horizontalFitMaxScale.`);
  }

  const rowCount = rowsMode === 'fixed'
    ? requireCount(rows.count, `${label}.rowsPerPage.count`, CAPTION_LAYOUT_LIMITS.minRowsPerPage, CAPTION_LAYOUT_LIMITS.maxRowsPerPage)
    : undefined;
  const wordCount = wordsMode === 'fixed'
    ? requireCount(words.count, `${label}.wordsPerRow.count`, CAPTION_LAYOUT_LIMITS.minWordsPerRow, CAPTION_LAYOUT_LIMITS.maxWordsPerRow)
    : undefined;

  const smartBreaks = breaking.smartBreaks;
  if (!isSmartBreakMode(smartBreaks)) throw new Error(`${label}.breaking.smartBreaks is invalid.`);
  const sourceLineBreaks = breaking.sourceLineBreaks;
  if (!isSourceLineBreakMode(sourceLineBreaks)) throw new Error(`${label}.breaking.sourceLineBreaks is invalid.`);
  const rowBreakPauseThresholdSeconds = breaking.rowBreakPauseThresholdSeconds === undefined
    ? defaults.breaking.rowBreakPauseThresholdSeconds
    : requireNonNegativeNumber(breaking.rowBreakPauseThresholdSeconds, `${label}.breaking.rowBreakPauseThresholdSeconds`);
  const pageBreakPauseThresholdSeconds = breaking.pageBreakPauseThresholdSeconds === undefined
    ? defaults.breaking.pageBreakPauseThresholdSeconds
    : requireNonNegativeNumber(breaking.pageBreakPauseThresholdSeconds, `${label}.breaking.pageBreakPauseThresholdSeconds`);
  const pauseSpacing = validatePauseSpacing(
    breaking.pauseSpacing,
    defaults.breaking.pauseSpacing,
    `${label}.breaking.pauseSpacing`,
  );
  const longWordThresholdMode = breaking.longWordThresholdMode === undefined
    ? defaults.breaking.longWordThresholdMode
    : breaking.longWordThresholdMode;
  if (!isLongWordThresholdMode(longWordThresholdMode)) {
    throw new Error(`${label}.breaking.longWordThresholdMode must be "automatic" or "fixed".`);
  }
  const longWordThresholdSeconds = breaking.longWordThresholdSeconds === undefined
    ? defaults.breaking.longWordThresholdSeconds
    : requireNonNegativeNumber(breaking.longWordThresholdSeconds, `${label}.breaking.longWordThresholdSeconds`);
  const breakPriorities = validateBreakPriorities(
    breaking.breakPriorities,
    defaults.breaking.breakPriorities,
    `${label}.breaking.breakPriorities`,
  );
  const wordWrapping = validateWordWrapping(
    breaking.wordWrapping,
    defaults.breaking.wordWrapping,
    `${label}.breaking.wordWrapping`,
  );
  return {
    textDirection,
    rowsPerPage: rowCount === undefined ? { mode: rowsMode } : { mode: rowsMode, count: rowCount },
    wordsPerRow: wordCount === undefined ? { mode: wordsMode } : { mode: wordsMode, count: wordCount },
    flowParticipation: validateFlowParticipation(input.flowParticipation, defaults.flowParticipation, `${label}.flowParticipation`),
    horizontalFit,
    horizontalFitMinScale,
    horizontalFitMaxScale,
    breaking: {
      smartBreaks,
      rowBreakPauseThresholdSeconds,
      pageBreakPauseThresholdSeconds,
      pauseSpacing,
      longWordThresholdMode,
      longWordThresholdSeconds,
      breakPriorities,
      wordWrapping,
      sentenceEndings: validateCharacters(
        requireStringArray(breaking.sentenceEndings, `${label}.breaking.sentenceEndings`),
        `${label}.breaking.sentenceEndings`,
      ),
      strongPunctuation: validateCharacters(
        requireStringArray(breaking.strongPunctuation, `${label}.breaking.strongPunctuation`),
        `${label}.breaking.strongPunctuation`,
      ),
      additionalCharacters: validateCharacters(
        requireStringArray(breaking.additionalCharacters, `${label}.breaking.additionalCharacters`),
        `${label}.breaking.additionalCharacters`,
      ),
      sourceLineBreaks,
    },
  };
}

export function validateCaptionLayoutOverride(value: unknown, label = 'captionLayout'): CaptionLayoutOverride {
  const input = requireRecord(value, label);
  const result: CaptionLayoutOverride = {};

  if (input.textDirection !== undefined) {
    if (!isTextDirection(input.textDirection)) {
      throw new Error(`${label}.textDirection must be "auto", "ltr", or "rtl".`);
    }
    result.textDirection = input.textDirection;
  }
  if (input.horizontalFit !== undefined) {
    if (!isHorizontalFitMode(input.horizontalFit)) throw new Error(`${label}.horizontalFit is invalid.`);
    result.horizontalFit = input.horizontalFit;
  }
  if (input.horizontalFitMinScale !== undefined) {
    result.horizontalFitMinScale = requireHorizontalFitScale(input.horizontalFitMinScale, `${label}.horizontalFitMinScale`);
  }
  if (input.horizontalFitMaxScale !== undefined) {
    result.horizontalFitMaxScale = requireHorizontalFitScale(input.horizontalFitMaxScale, `${label}.horizontalFitMaxScale`);
  }
  if (
    result.horizontalFitMinScale !== undefined &&
    result.horizontalFitMaxScale !== undefined &&
    result.horizontalFitMinScale > result.horizontalFitMaxScale
  ) {
    throw new Error(`${label}.horizontalFitMinScale must be less than or equal to horizontalFitMaxScale.`);
  }
  if (input.flowParticipation !== undefined) {
    result.flowParticipation = validateFlowParticipationOverride(input.flowParticipation, `${label}.flowParticipation`);
  }

  const validateRowsOverride = (key: 'rowsPerPage' | 'wordsPerRow', min: number, max: number): void => {
    if (input[key] === undefined) return;
    const section = requireRecord(input[key], `${label}.${key}`);
    const mode = section.mode;
    if (key === 'rowsPerPage') {
      if (mode !== undefined && !isRowsPerPageMode(mode)) throw new Error(`${label}.${key}.mode is invalid.`);
    } else if (mode !== undefined && !isWordsPerRowMode(mode)) {
      throw new Error(`${label}.${key}.mode is invalid.`);
    }
    const count = section.count;
    if (count !== undefined) requireCount(count, `${label}.${key}.count`, min, max);
    const next = count === undefined && mode === undefined ? {} : {
      ...(mode === undefined ? {} : { mode }),
      ...(count === undefined ? {} : { count }),
    };
    if (key === 'rowsPerPage') result.rowsPerPage = next as Partial<RowsPerPagePolicy>;
    else result.wordsPerRow = next as Partial<WordsPerRowPolicy>;
  };

  validateRowsOverride('rowsPerPage', CAPTION_LAYOUT_LIMITS.minRowsPerPage, CAPTION_LAYOUT_LIMITS.maxRowsPerPage);
  validateRowsOverride('wordsPerRow', CAPTION_LAYOUT_LIMITS.minWordsPerRow, CAPTION_LAYOUT_LIMITS.maxWordsPerRow);

  if (input.breaking !== undefined) {
    const breaking = requireRecord(input.breaking, `${label}.breaking`);
    const breakingOverride: NonNullable<CaptionLayoutOverride['breaking']> = {};
    if (breaking.smartBreaks !== undefined) {
      if (!isSmartBreakMode(breaking.smartBreaks)) throw new Error(`${label}.breaking.smartBreaks is invalid.`);
      breakingOverride.smartBreaks = breaking.smartBreaks;
    }
    if (breaking.sourceLineBreaks !== undefined) {
      if (!isSourceLineBreakMode(breaking.sourceLineBreaks)) throw new Error(`${label}.breaking.sourceLineBreaks is invalid.`);
      breakingOverride.sourceLineBreaks = breaking.sourceLineBreaks;
    }
    if (breaking.rowBreakPauseThresholdSeconds !== undefined) {
      breakingOverride.rowBreakPauseThresholdSeconds = requireNonNegativeNumber(
        breaking.rowBreakPauseThresholdSeconds,
        `${label}.breaking.rowBreakPauseThresholdSeconds`,
      );
    }
    if (breaking.pageBreakPauseThresholdSeconds !== undefined) {
      breakingOverride.pageBreakPauseThresholdSeconds = requireNonNegativeNumber(
        breaking.pageBreakPauseThresholdSeconds,
        `${label}.breaking.pageBreakPauseThresholdSeconds`,
      );
    }
    if (breaking.pauseSpacing !== undefined) {
      const pauseSpacing = requireRecord(breaking.pauseSpacing, `${label}.breaking.pauseSpacing`);
      const enabled = pauseSpacing.enabled;
      if (enabled !== undefined && typeof enabled !== 'boolean') {
        throw new Error(`${label}.breaking.pauseSpacing.enabled must be a boolean.`);
      }
      const thresholdSeconds = pauseSpacing.thresholdSeconds === undefined
        ? undefined
        : requireNonNegativeNumber(
            pauseSpacing.thresholdSeconds,
            `${label}.breaking.pauseSpacing.thresholdSeconds`,
          );
      const extraSpacing = pauseSpacing.extraSpacing === undefined
        ? undefined
        : requireNonNegativeNumber(
            pauseSpacing.extraSpacing,
            `${label}.breaking.pauseSpacing.extraSpacing`,
          );
      const maxExtraSpacing = pauseSpacing.maxExtraSpacing === undefined
        ? undefined
        : requireNonNegativeNumber(
            pauseSpacing.maxExtraSpacing,
            `${label}.breaking.pauseSpacing.maxExtraSpacing`,
          );
      breakingOverride.pauseSpacing = {
        ...(enabled === undefined ? {} : { enabled }),
        ...(thresholdSeconds === undefined ? {} : { thresholdSeconds }),
        ...(extraSpacing === undefined ? {} : { extraSpacing }),
        ...(maxExtraSpacing === undefined ? {} : { maxExtraSpacing }),
      };
    }
    if (breaking.longWordThresholdMode !== undefined) {
      if (!isLongWordThresholdMode(breaking.longWordThresholdMode)) {
        throw new Error(`${label}.breaking.longWordThresholdMode must be "automatic" or "fixed".`);
      }
      breakingOverride.longWordThresholdMode = breaking.longWordThresholdMode;
    }
    if (breaking.longWordThresholdSeconds !== undefined) {
      breakingOverride.longWordThresholdSeconds = requireNonNegativeNumber(
        breaking.longWordThresholdSeconds,
        `${label}.breaking.longWordThresholdSeconds`,
      );
    }
    if (breaking.breakPriorities !== undefined) {
      const priorities = requireRecord(breaking.breakPriorities, `${label}.breaking.breakPriorities`);
      breakingOverride.breakPriorities = {
        ...(priorities.rows === undefined
          ? {}
          : {
              rows: validateBreakRuleList(
                priorities.rows,
                ROW_BREAK_RULE_IDS,
                DEFAULT_CAPTION_BREAK_PRIORITIES.rows,
                `${label}.breaking.breakPriorities.rows`,
              ),
            }),
        ...(priorities.pages === undefined
          ? {}
          : {
              pages: validateBreakRuleList(
                priorities.pages,
                PAGE_BREAK_RULE_IDS,
                DEFAULT_CAPTION_BREAK_PRIORITIES.pages,
                `${label}.breaking.breakPriorities.pages`,
              ),
            }),
      };
    }
    if (breaking.wordWrapping !== undefined) {
      const wordWrapping = requireRecord(breaking.wordWrapping, `${label}.breaking.wordWrapping`);
      const mode = wordWrapping.mode;
      if (mode !== undefined && !isCaptionWordWrappingMode(mode)) {
        throw new Error(`${label}.breaking.wordWrapping.mode must be "allow-overflow" or "wrap".`);
      }
      const breakCharacters = wordWrapping.breakCharacters === undefined
        ? undefined
        : validateCharacters(
            requireStringArray(wordWrapping.breakCharacters, `${label}.breaking.wordWrapping.breakCharacters`),
            `${label}.breaking.wordWrapping.breakCharacters`,
          );
      const breakMarker = wordWrapping.breakMarker === undefined
        ? undefined
        : requireString(wordWrapping.breakMarker, `${label}.breaking.wordWrapping.breakMarker`);
      const overflowTolerance = wordWrapping.overflowTolerance === undefined
        ? undefined
        : requireNonNegativeNumber(
            wordWrapping.overflowTolerance,
            `${label}.breaking.wordWrapping.overflowTolerance`,
          );
      breakingOverride.wordWrapping = {
        ...(mode === undefined ? {} : { mode }),
        ...(breakCharacters === undefined ? {} : { breakCharacters }),
        ...(breakMarker === undefined ? {} : { breakMarker }),
        ...(overflowTolerance === undefined ? {} : { overflowTolerance }),
      };
    }
    for (const key of ['sentenceEndings', 'strongPunctuation', 'additionalCharacters'] as const) {
      if (breaking[key] === undefined) continue;
      breakingOverride[key] = validateCharacters(
        requireStringArray(breaking[key], `${label}.breaking.${key}`),
        `${label}.breaking.${key}`,
      );
    }
    result.breaking = breakingOverride;
  }

  return result;
}

export function mergeCaptionLayoutPolicy(
  base: CaptionLayoutPolicy,
  override: CaptionLayoutOverride | undefined,
): CaptionLayoutPolicy {
  if (!override) return validateCaptionLayoutPolicy(base);
  return validateCaptionLayoutPolicy({
    ...base,
    ...override,
    rowsPerPage: { ...base.rowsPerPage, ...(override.rowsPerPage ?? {}) },
    wordsPerRow: { ...base.wordsPerRow, ...(override.wordsPerRow ?? {}) },
    flowParticipation: {
      collapseMode: override.flowParticipation?.collapseMode ?? base.flowParticipation.collapseMode,
      rows: { ...base.flowParticipation.rows, ...(override.flowParticipation?.rows ?? {}) },
      words: { ...base.flowParticipation.words, ...(override.flowParticipation?.words ?? {}) },
    },
    breaking: {
      ...base.breaking,
      ...(override.breaking ?? {}),
      pauseSpacing: {
        ...base.breaking.pauseSpacing,
        ...(override.breaking?.pauseSpacing ?? {}),
      },
      wordWrapping: {
        ...base.breaking.wordWrapping,
        ...(override.breaking?.wordWrapping ?? {}),
      },
      ...(override.breaking?.breakPriorities === undefined
        ? {}
        : { breakPriorities: validateBreakPriorities(override.breaking.breakPriorities, base.breaking.breakPriorities, 'captionLayout.breaking.breakPriorities') }),
    },
  });
}

export function resolveCaptionLayoutPolicy(
  value: CaptionLayoutPolicy | CaptionLayoutOverride | undefined,
): CaptionLayoutPolicy {
  if (value === undefined) return createDefaultCaptionLayoutPolicy();
  const input = value as Record<string, unknown>;
  const rows = isRecord(input.rowsPerPage) ? input.rowsPerPage : undefined;
  const words = isRecord(input.wordsPerRow) ? input.wordsPerRow : undefined;
  const breaking = isRecord(input.breaking) ? input.breaking : undefined;
  if (
    input.textDirection !== undefined &&
    input.horizontalFit !== undefined &&
    rows?.mode !== undefined &&
    words?.mode !== undefined &&
    breaking?.smartBreaks !== undefined &&
    breaking?.breakPriorities !== undefined &&
    isRecord(breaking.wordWrapping) &&
    breaking.wordWrapping.mode !== undefined &&
    breaking.wordWrapping.breakCharacters !== undefined &&
    breaking.wordWrapping.breakMarker !== undefined &&
    breaking.sourceLineBreaks !== undefined &&
    breaking.sentenceEndings !== undefined &&
    breaking.strongPunctuation !== undefined &&
    breaking.additionalCharacters !== undefined
  ) {
    return validateCaptionLayoutPolicy(value);
  }
  return mergeCaptionLayoutPolicy(createDefaultCaptionLayoutPolicy(), validateCaptionLayoutOverride(value));
}

export function validateCaptionLayoutForPage(
  policy: CaptionLayoutPolicy,
  pageHeightDefinite: boolean,
  label = 'captionLayout',
): void {
  if (policy.rowsPerPage.mode === 'fit-height' && !pageHeightDefinite) {
    throw new Error(`${label}.rowsPerPage.mode "fit-height" requires a fixed page height; the Page height is currently Fit Children or unset.`);
  }
}

export function pauseSpacingExtraForBoundary(
  previous: CaptionTimedWord | undefined,
  current: CaptionTimedWord | undefined,
  policy: CaptionPauseSpacingPolicy | undefined,
): number {
  if (!policy?.enabled || !previous || !current) return 0;
  const pauseSeconds = current.startTimestamp - previous.visualEndTimestamp;
  if (pauseSeconds < policy.thresholdSeconds) return 0;
  return Math.min(policy.extraSpacing, policy.maxExtraSpacing);
}

function endsWithAny(value: string, characters: readonly string[]): boolean {
  const trimmed = value.trimEnd();
  return characters.some((character) => trimmed.endsWith(character));
}

const EMOJI_TOKEN_PARTS = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|\p{Mark}|[\u200D\uFE0E\uFE0F\u20E3])+$/u;
const EMOJI_TOKEN_QUOTES = /^["'“”‘’([{]+|["'“”‘’)\]}]+$/gu;

function isStandaloneEmojiToken(value: string): boolean {
  const token = value.trim().replace(EMOJI_TOKEN_QUOTES, '');
  if (!token || !EMOJI_TOKEN_PARTS.test(token)) return false;
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(token);
}

function breakRuleMode(
  rules: readonly CaptionBreakRule<string>[],
  id: string,
): CaptionBreakRuleMode {
  return rules.find((rule) => rule.id === id)?.mode ?? 'off';
}

function semanticBreakAfter(word: string, policy: CaptionLayoutPolicy, language: string | undefined): boolean {
  if (policy.breaking.smartBreaks === 'off') return false;
  const breaking = policy.breaking.smartBreaks === 'auto'
    ? getSmartBreakRules(language)
    : policy.breaking;
  return (
    endsWithAny(word, breaking.sentenceEndings) ||
    endsWithAny(word, breaking.strongPunctuation) ||
    endsWithAny(word, breaking.additionalCharacters) ||
    (policy.breaking.smartBreaks === 'auto' && isStandaloneEmojiToken(word))
  );
}

function breakTextForTimedWord(entry: CaptionTimedWord): string {
  const isFinalFragment =
    entry.fragmentCount === undefined ||
    entry.fragmentIndex === undefined ||
    entry.fragmentIndex >= entry.fragmentCount - 1;
  return isFinalFragment ? entry.sourceWord ?? entry.word : entry.word;
}

function punctuationBreakAfter(word: string, policy: CaptionLayoutPolicy, language: string | undefined): boolean {
  return semanticBreakAfter(word, policy, language);
}

function isTrailingEmojiAfterPunctuation(
  previous: CaptionTimedWord | undefined,
  current: CaptionTimedWord,
  policy: CaptionLayoutPolicy,
  language: string | undefined,
): boolean {
  return (
    previous !== undefined &&
    isStandaloneEmojiToken(breakTextForTimedWord(current)) &&
    punctuationBreakAfter(breakTextForTimedWord(previous), policy, language)
  );
}

function pauseBreakAfter(gap: number, threshold: number): boolean {
  return gap > 0 && gap >= threshold;
}

function preferredBoundaryIndex(
  boundaries: ReadonlyMap<number, string>,
  rules: readonly CaptionBreakRule<string>[],
): number | undefined {
  let selected: number | undefined;
  let selectedPriority = Number.POSITIVE_INFINITY;
  for (const [index, ruleId] of boundaries) {
    const priority = rules.findIndex((rule) => rule.id === ruleId);
    if (
      selected === undefined ||
      priority < selectedPriority ||
      (priority === selectedPriority && index > selected)
    ) {
      selected = index;
      selectedPriority = priority;
    }
  }
  return selected;
}

function setPreferredBoundary(
  boundaries: Map<number, string>,
  index: number,
  ruleId: string,
  rules: readonly CaptionBreakRule<string>[],
): void {
  const currentRuleId = boundaries.get(index);
  if (
    currentRuleId === undefined ||
    rules.findIndex((rule) => rule.id === ruleId) < rules.findIndex((rule) => rule.id === currentRuleId)
  ) {
    boundaries.set(index, ruleId);
  }
}

export function segmentCaptionWords(
  master: readonly CaptionTimedWord[],
  options: CaptionSegmentationOptions,
): CaptionTimedWord[][] {
  const {
    availableWidth,
    spaceX,
    maxWordWidth,
    policy,
    language,
    rowBreakPauseThresholdSeconds,
    longWordThreshold,
  } = options;
  const groups: CaptionTimedWord[][] = [];
  const maxWords = policy.wordsPerRow.mode === 'fixed'
    ? policy.wordsPerRow.count
    : undefined;
  const width = Number.isFinite(availableWidth) && availableWidth > 0 ? availableWidth : Number.POSITIVE_INFINITY;
  const minimumScale = policy.horizontalFit === 'natural' ? 1 : policy.horizontalFitMinScale;

  const fits = (words: readonly CaptionTimedWord[]): boolean => {
    let total = 0;
    for (let index = 0; index < words.length; index += 1) {
      if (index > 0) total += spaceX;
      total += maxWordWidth(words[index].word, words[index].logicalWordIndex ?? index);
    }
    return total * minimumScale <= width || words.length <= 1;
  };

  let index = 0;
  while (index < master.length) {
    const group: CaptionTimedWord[] = [];
    const preferredBoundaries = new Map<number, string>();
    let pendingPunctuationBreak = false;
    let breakReason: 'explicit' | 'count' | 'long' | 'width' | 'timing' | 'end' = 'end';
    const rowRules = policy.breaking.breakPriorities.rows;
    while (index < master.length) {
      const candidate = master[index];
      if (group.length > 0 && candidate.forceBreakBefore) {
        breakReason = 'explicit';
        break;
      }
      if (group.length > 0 && candidate.breakBefore && policy.breaking.sourceLineBreaks === 'preserve') {
        const mode = breakRuleMode(rowRules, 'source');
        if (mode === 'always' || mode === 'required') {
          breakReason = 'explicit';
          break;
        }
        if (
          mode === 'prefer' &&
          !isTrailingEmojiAfterPunctuation(group.at(-1), candidate, policy, language)
        ) {
          setPreferredBoundary(preferredBoundaries, group.length, 'source', rowRules);
        }
      }
      if (
        group.length > 0 &&
        maxWords !== undefined &&
        group.length >= maxWords &&
        breakRuleMode(rowRules, 'word-count') !== 'off'
      ) {
        breakReason = 'count';
        break;
      }
      const longWordMode = breakRuleMode(rowRules, 'long-word');
      if (
        group.length > 0 &&
        candidate.visualEndTimestamp - candidate.startTimestamp > longWordThreshold
      ) {
        if (longWordMode === 'always' || longWordMode === 'required') {
          breakReason = 'long';
          break;
        }
        if (longWordMode === 'prefer') {
          setPreferredBoundary(preferredBoundaries, group.length, 'long-word', rowRules);
        }
      }
      if (
        group.length > 0 &&
        !fits([...group, candidate]) &&
        breakRuleMode(rowRules, 'width') !== 'off'
      ) {
        breakReason = 'width';
        break;
      }

      group.push(candidate);
      const duration = candidate.visualEndTimestamp - candidate.startTimestamp;
      const next = master[index + 1];
      const gap = next ? next.startTimestamp - candidate.visualEndTimestamp : 0;
      const forceSolo = duration > longWordThreshold;
      const candidateText = breakTextForTimedWord(candidate);
      const nextText = next ? breakTextForTimedWord(next) : undefined;
      const candidatePunctuationBreak = punctuationBreakAfter(candidateText, policy, language);
      const candidateIsTrailingEmoji = isStandaloneEmojiToken(candidateText);
      const nextIsStandaloneEmoji = nextText !== undefined && isStandaloneEmojiToken(nextText);
      const punctuationBreak =
        (pendingPunctuationBreak && candidateIsTrailingEmoji && !nextIsStandaloneEmoji) ||
        (candidatePunctuationBreak && !nextIsStandaloneEmoji);
      if (candidatePunctuationBreak && nextIsStandaloneEmoji) {
        pendingPunctuationBreak = true;
      } else if (punctuationBreak && !nextIsStandaloneEmoji) {
        pendingPunctuationBreak = false;
      } else if (!candidateIsTrailingEmoji) {
        pendingPunctuationBreak = false;
      }
      const timingBreak = pauseBreakAfter(gap, rowBreakPauseThresholdSeconds);
      index += 1;

      if (forceSolo && (longWordMode === 'always' || longWordMode === 'required')) {
        breakReason = 'long';
        break;
      }
      const punctuationMode = breakRuleMode(rowRules, 'punctuation');
      if (punctuationBreak && (punctuationMode === 'always' || punctuationMode === 'required')) {
        breakReason = 'explicit';
        break;
      }
      const pauseMode = breakRuleMode(rowRules, 'pause');
      if (timingBreak && (pauseMode === 'always' || pauseMode === 'required')) {
        breakReason = 'timing';
        break;
      }
      if (punctuationBreak && punctuationMode === 'prefer') {
        setPreferredBoundary(preferredBoundaries, group.length, 'punctuation', rowRules);
      }
      if (timingBreak && pauseMode === 'prefer') {
        setPreferredBoundary(preferredBoundaries, group.length, 'pause', rowRules);
      }
    }
    if (group.length === 0) {
      group.push(master[index]);
      index += 1;
    }
    if (
      preferredBoundaryIndex(preferredBoundaries, rowRules) !== undefined &&
      (breakReason === 'width' || breakReason === 'count')
    ) {
      const boundaryIndex = preferredBoundaryIndex(preferredBoundaries, rowRules)!;
      const remainder = group.splice(boundaryIndex);
      index -= remainder.length;
    }
    groups.push(group);
  }

  return groups;
}

interface CaptionEmojiRebalancingOptions {
  availableWidth: number;
  spaceX: number;
  maxWordWidth: CaptionWordWidth;
  policy: CaptionLayoutPolicy;
  language?: string;
  rowBreakPauseThresholdSeconds: number;
  pageHeight?: number;
  pagePadding?: Pick<Insets, 'top' | 'bottom'>;
  rowSpacing?: number;
  rowHeight?: (row: CaptionTimedWord[]) => number;
}

function captionWordsFit(
  words: readonly CaptionTimedWord[],
  options: CaptionEmojiRebalancingOptions,
): boolean {
  const width = Number.isFinite(options.availableWidth) && options.availableWidth > 0
    ? options.availableWidth
    : Number.POSITIVE_INFINITY;
  const minimumScale = options.policy.horizontalFit === 'natural' ? 1 : options.policy.horizontalFitMinScale;
  const naturalWidth = words.reduce(
    (total, word, index) =>
      total + options.maxWordWidth(word.word, word.logicalWordIndex ?? index) + (index > 0 ? options.spaceX : 0),
    0,
  );
  return naturalWidth * minimumScale <= width || words.length <= 1;
}

function rowBreakIsRequiredBefore(
  previous: CaptionTimedWord,
  current: CaptionTimedWord,
  options: CaptionEmojiRebalancingOptions,
): boolean {
  if (current.forceBreakBefore) return true;
  if (
    current.breakBefore &&
    options.policy.breaking.sourceLineBreaks === 'preserve' &&
    ['always', 'required'].includes(breakRuleMode(options.policy.breaking.breakPriorities.rows, 'source'))
  ) {
    return true;
  }
  const pauseMode = breakRuleMode(options.policy.breaking.breakPriorities.rows, 'pause');
  const pauseSeconds = current.startTimestamp - previous.visualEndTimestamp;
  if (pauseBreakAfter(pauseSeconds, options.rowBreakPauseThresholdSeconds)) {
    return pauseMode === 'always' || pauseMode === 'required';
  }
  const punctuationMode = breakRuleMode(options.policy.breaking.breakPriorities.rows, 'punctuation');
  const previousText = breakTextForTimedWord(previous);
  const currentText = breakTextForTimedWord(current);
  if (
    punctuationBreakAfter(previousText, options.policy, options.language) &&
    !isStandaloneEmojiToken(currentText)
  ) {
    return punctuationMode === 'always' || punctuationMode === 'required';
  }
  return false;
}

function isolatedEmojiFromRow(
  emojiRow: readonly CaptionTimedWord[],
  options: CaptionEmojiRebalancingOptions,
): CaptionTimedWord | undefined {
  if (options.policy.breaking.smartBreaks !== 'auto' || emojiRow.length !== 1) return undefined;
  const emoji = emojiRow[0];
  return emoji !== undefined && isStandaloneEmojiToken(breakTextForTimedWord(emoji)) ? emoji : undefined;
}

function canAppendEmojiToPreviousRow(
  previousRow: readonly CaptionTimedWord[],
  emoji: CaptionTimedWord,
  options: CaptionEmojiRebalancingOptions,
): boolean {
  const previous = previousRow.at(-1);
  if (previous === undefined || rowBreakIsRequiredBefore(previous, emoji, options)) return false;
  const maxWords = options.policy.wordsPerRow.mode === 'fixed'
    ? options.policy.wordsPerRow.count
    : undefined;
  if (maxWords !== undefined && previousRow.length + 1 > maxWords) return false;
  return captionWordsFit([...previousRow, emoji], options);
}

function canBorrowWordForEmojiRow(
  previousRow: readonly CaptionTimedWord[],
  emojiRow: readonly CaptionTimedWord[],
  options: CaptionEmojiRebalancingOptions,
): boolean {
  const emoji = isolatedEmojiFromRow(emojiRow, options);
  if (emoji === undefined || previousRow.length <= 1) {
    return false;
  }
  const candidate = previousRow[previousRow.length - 1];
  if (
    candidate === undefined ||
    candidate.forceBreakBefore ||
    candidate.fragmentIndex !== undefined && candidate.fragmentIndex > 0 ||
    rowBreakIsRequiredBefore(candidate, emoji, options)
  ) {
    return false;
  }
  const maxWords = options.policy.wordsPerRow.mode === 'fixed'
    ? options.policy.wordsPerRow.count
    : undefined;
  if (maxWords !== undefined && emojiRow.length + 1 > maxWords) return false;
  return captionWordsFit([candidate, emoji], options);
}

function pageBreakIsRequiredBefore(
  previous: CaptionTimedWord,
  current: CaptionTimedWord,
  options: CaptionEmojiRebalancingOptions,
  pageBreakPauseThresholdSeconds: number,
): boolean {
  const rule = pageBreakRuleAtBoundary(
    previous,
    current,
    options.policy,
    options.language,
    pageBreakPauseThresholdSeconds,
  );
  return rule?.mode === 'always' || rule?.mode === 'required';
}

function pageFitsAfterEmojiBorrow(
  page: readonly CaptionTimedWord[][],
  candidate: CaptionTimedWord,
  emoji: CaptionTimedWord,
  rowIndexToReplace: number,
  options: CaptionEmojiRebalancingOptions,
): boolean {
  if (
    options.policy.rowsPerPage.mode === 'all' ||
    options.rowHeight === undefined ||
    !Number.isFinite(options.pageHeight) ||
    (options.pageHeight ?? 0) <= 0
  ) {
    return true;
  }
  const availableHeight = Math.max(
    1,
    options.pageHeight! -
      Math.max(0, options.pagePadding?.top ?? 0) -
      Math.max(0, options.pagePadding?.bottom ?? 0),
  );
  const rowSpacing = Number.isFinite(options.rowSpacing) ? options.rowSpacing! : 0;
  const requiredHeight = page.reduce((total, row, rowIndex) => {
    const nextRow = rowIndex === rowIndexToReplace ? [candidate, emoji] : row;
    const previousRow = page[rowIndex - 1];
    const pauseExtra = rowIndex > 0
      ? pauseSpacingExtraForBoundary(previousRow?.at(-1), nextRow[0], options.policy.breaking.pauseSpacing)
      : 0;
    return total + Math.max(0, options.rowHeight!(nextRow)) + (rowIndex > 0 ? rowSpacing + pauseExtra : 0);
  }, 0);
  return requiredHeight <= availableHeight;
}

function rebalanceEmojiPages(
  pages: readonly CaptionTimedWord[][][],
  options: CaptionEmojiRebalancingOptions,
  pageBreakPauseThresholdSeconds: number,
): CaptionTimedWord[][][] {
  const result = pages.map((page) => page.map((row) => [...row]));
  for (const page of result) {
    for (let rowIndex = 1; rowIndex < page.length; rowIndex += 1) {
      const previousRow = page[rowIndex - 1];
      const currentRow = page[rowIndex];
      const emoji = isolatedEmojiFromRow(currentRow, options);
      if (emoji !== undefined && canAppendEmojiToPreviousRow(previousRow, emoji, options)) {
        previousRow.push(emoji);
        page.splice(rowIndex, 1);
        rowIndex -= 1;
        continue;
      }
      if (!canBorrowWordForEmojiRow(previousRow, currentRow, options)) continue;
      const candidate = previousRow[previousRow.length - 1];
      const emojiRowEntry = currentRow[0];
      if (
        candidate === undefined ||
        emojiRowEntry === undefined ||
        !pageFitsAfterEmojiBorrow(page, candidate, emojiRowEntry, rowIndex, options)
      ) {
        continue;
      }
      currentRow.unshift(previousRow.pop()!);
    }
  }
  for (let pageIndex = 1; pageIndex < result.length; pageIndex += 1) {
    const previousPage = result[pageIndex - 1];
    const currentPage = result[pageIndex];
    const previousRow = previousPage.at(-1);
    const currentRow = currentPage[0];
    if (
      previousRow === undefined ||
      currentRow === undefined ||
      !canBorrowWordForEmojiRow(previousRow, currentRow, options)
    ) {
      continue;
    }
    const candidate = previousRow[previousRow.length - 1];
    const emoji = currentRow[0];
    if (
      candidate === undefined ||
      emoji === undefined ||
      !pageFitsAfterEmojiBorrow(currentPage, candidate, emoji, 0, options) ||
      pageBreakIsRequiredBefore(candidate, emoji, options, pageBreakPauseThresholdSeconds)
    ) {
      continue;
    }
    currentRow.unshift(previousRow.pop()!);
  }
  return result;
}

function pageBreakRulesAtBoundary(
  previous: CaptionTimedWord,
  current: CaptionTimedWord,
  policy: CaptionLayoutPolicy,
  language: string | undefined,
  pageBreakPauseThresholdSeconds: number,
): CaptionBreakRule<CaptionPageBreakRuleId>[] {
  const gap = current.startTimestamp - previous.visualEndTimestamp;
  return policy.breaking.breakPriorities.pages.filter((rule) => {
    if (rule.mode === 'off') return false;
    return (
      (rule.id === 'source' &&
        policy.breaking.sourceLineBreaks === 'preserve' &&
        current.breakBefore &&
        !(rule.mode === 'prefer' && isTrailingEmojiAfterPunctuation(previous, current, policy, language))) ||
      (rule.id === 'punctuation' &&
        punctuationBreakAfter(breakTextForTimedWord(previous), policy, language) &&
        !isStandaloneEmojiToken(breakTextForTimedWord(current))) ||
      (rule.id === 'pause' && pauseBreakAfter(gap, pageBreakPauseThresholdSeconds))
    );
  });
}

function pageBreakRuleAtBoundary(
  previous: CaptionTimedWord,
  current: CaptionTimedWord,
  policy: CaptionLayoutPolicy,
  language: string | undefined,
  pageBreakPauseThresholdSeconds: number,
): CaptionBreakRule<CaptionPageBreakRuleId> | undefined {
  const matchingRules = pageBreakRulesAtBoundary(
    previous,
    current,
    policy,
    language,
    pageBreakPauseThresholdSeconds,
  );
  return (
    matchingRules.find((rule) => rule.mode === 'always' || rule.mode === 'required') ??
    matchingRules.find((rule) => rule.mode === 'prefer')
  );
}

function splitGroupsAtPageBreaks(
  groups: readonly CaptionTimedWord[][],
  policy: CaptionLayoutPolicy,
  language: string | undefined,
  pageBreakPauseThresholdSeconds: number,
): CaptionTimedWord[][] {
  const result: CaptionTimedWord[][] = [];
  for (const group of groups) {
    let start = 0;
    for (let index = 1; index < group.length; index += 1) {
      const rule = pageBreakRuleAtBoundary(
        group[index - 1],
        group[index],
        policy,
        language,
        pageBreakPauseThresholdSeconds,
      );
      if (
        rule !== undefined &&
        (rule.mode === 'always' || rule.mode === 'required')
      ) {
        result.push(group.slice(start, index));
        start = index;
      }
    }
    result.push(group.slice(start));
  }
  return result;
}

function rowCapacityAt(
  groups: readonly CaptionTimedWord[][],
  start: number,
  options: CaptionPageAllocationOptions,
): number {
  const { policy, pageHeight, pagePadding } = options;
  const rowSpacing = Number.isFinite(options.rowSpacing) ? options.rowSpacing! : 0;
  const maxRows = policy.rowsPerPage.mode === 'fixed' ? policy.rowsPerPage.count ?? 1 : undefined;

  const height =
    policy.rowsPerPage.mode === 'all'
      ? undefined
      : Number.isFinite(pageHeight) && (pageHeight ?? 0) > 0
        ? pageHeight!
        : undefined;
  const usableHeight =
    height === undefined
      ? undefined
      : Math.max(1, height - (Math.max(0, pagePadding?.top ?? 0) + Math.max(0, pagePadding?.bottom ?? 0)));
  let used = 0;
  let count = 0;
  let preferredBreak: { count: number; rule: CaptionBreakRule<CaptionPageBreakRuleId> } | undefined;
  const pageRules = policy.breaking.breakPriorities.pages;
  for (let index = start; index < groups.length; index += 1) {
    if (maxRows !== undefined && count >= maxRows) return preferredBreak?.count ?? count;
    const rowHeight = Math.max(0, options.rowHeight?.(groups[index]) ?? 0);
    const previous = groups[index - 1];
    const previousLast = previous?.at(-1);
    const currentFirst = groups[index]?.[0];
    if (count > 0 && previousLast && currentFirst) {
      const rule = pageBreakRuleAtBoundary(
        previousLast,
        currentFirst,
        policy,
        options.language,
        options.pageBreakPauseThresholdSeconds,
      );
      if (rule?.mode === 'always' || rule?.mode === 'required') return count;
      if (
        rule?.mode === 'prefer' &&
        (preferredBreak === undefined ||
          pageRules.findIndex((candidate) => candidate.id === rule.id) <
            pageRules.findIndex((candidate) => candidate.id === preferredBreak?.rule.id))
      ) {
        preferredBreak = { count, rule };
      }
    }
    const pauseExtra = count > 0
      ? pauseSpacingExtraForBoundary(previousLast, currentFirst, options.policy.breaking.pauseSpacing)
      : 0;
    const next = used + rowHeight + (count > 0 ? rowSpacing + pauseExtra : 0);
    if (usableHeight !== undefined && count > 0 && next > usableHeight) {
      return preferredBreak?.count ?? count;
    }
    used = next;
    count += 1;
  }
  return Math.max(1, count);
}

export function allocateCaptionPages(
  groups: readonly CaptionTimedWord[][],
  options: CaptionPageAllocationOptions,
): CaptionTimedWord[][][] {
  const pages: CaptionTimedWord[][][] = [];
  const pageGroups = splitGroupsAtPageBreaks(
    groups,
    options.policy,
    options.language,
    options.pageBreakPauseThresholdSeconds,
  );
  let start = 0;
  while (start < pageGroups.length) {
    const first = pageGroups[start];
    const firstWord = first[0];
    const firstDuration = firstWord.visualEndTimestamp - firstWord.startTimestamp;
    const longWordMode = breakRuleMode(options.policy.breaking.breakPriorities.rows, 'long-word');
    const forcedSolo =
      options.policy.rowsPerPage.mode !== 'all' &&
      first.length === 1 &&
      firstDuration > options.longWordThreshold &&
      (longWordMode === 'always' || longWordMode === 'required') &&
      (firstWord.fragmentCount === undefined || firstWord.fragmentCount <= 1);
    const capacity = forcedSolo ? 1 : rowCapacityAt(pageGroups, start, options);
    const page = pageGroups.slice(start, start + Math.max(1, capacity)).map((group) => [...group]);
    pages.push(page);
    start += Math.max(1, capacity);
  }
  if (
    options.availableWidth === undefined ||
    options.spaceX === undefined ||
    options.maxWordWidth === undefined
  ) {
    return pages;
  }
  return rebalanceEmojiPages(pages, {
    availableWidth: options.availableWidth,
    spaceX: options.spaceX,
    maxWordWidth: options.maxWordWidth,
    policy: options.policy,
    ...(options.language === undefined ? {} : { language: options.language }),
    rowBreakPauseThresholdSeconds: options.policy.breaking.rowBreakPauseThresholdSeconds,
    ...(options.pageHeight === undefined ? {} : { pageHeight: options.pageHeight }),
    ...(options.pagePadding === undefined ? {} : { pagePadding: options.pagePadding }),
    ...(options.rowSpacing === undefined ? {} : { rowSpacing: options.rowSpacing }),
    ...(options.rowHeight === undefined ? {} : { rowHeight: options.rowHeight }),
  }, options.pageBreakPauseThresholdSeconds);
}

export function minimumCaptionPageSize(
  pages: readonly (readonly CaptionTimedWord[][])[],
  options: CaptionPageMinimumSizeOptions,
): CaptionPageMinimumSize {
  const pagePadding = options.pagePadding ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const horizontalPadding = Math.max(0, pagePadding.left) + Math.max(0, pagePadding.right);
  const verticalPadding = Math.max(0, pagePadding.top) + Math.max(0, pagePadding.bottom);
  const rowSpacing = Math.max(0, options.rowSpacing ?? 0);
  let minimumWidth = Math.max(0, options.minimumContentWidth ?? 0);
  let minimumHeight = 0;

  for (const page of pages) {
    const contentWidth =
      options.rowWidth === undefined
        ? 0
        : page.reduce((maximum, row) => Math.max(maximum, Math.max(0, options.rowWidth?.(row) ?? 0)), 0);
    const contentHeight = page.reduce(
      (total, row, rowIndex) =>
        total +
        Math.max(0, options.rowHeight?.(row) ?? 0) +
        (rowIndex > 0
          ? rowSpacing +
            pauseSpacingExtraForBoundary(
              page[rowIndex - 1]?.at(-1),
              row[0],
              options.pauseSpacing,
            )
          : 0),
      0,
    );
    minimumWidth = Math.max(minimumWidth, contentWidth);
    minimumHeight = Math.max(minimumHeight, contentHeight);
  }

  return {
    width: Math.max(1, minimumWidth + horizontalPadding),
    height: Math.max(1, minimumHeight + verticalPadding),
  };
}

export function diagnoseCaptionPageOverflow(
  pages: readonly (readonly CaptionTimedWord[][])[],
  options: CaptionPageAllocationOptions,
): CaptionLayoutDiagnostic[] {
  if (!Number.isFinite(options.pageHeight) || (options.pageHeight ?? 0) <= 0) return [];
  const pageHeight = options.pageHeight!;
  const pagePadding = Math.max(0, options.pagePadding?.top ?? 0) + Math.max(0, options.pagePadding?.bottom ?? 0);
  const rowSpacing = Number.isFinite(options.rowSpacing) ? options.rowSpacing! : 0;
  const availableHeight = Math.max(1, pageHeight - pagePadding);
  const diagnostics: CaptionLayoutDiagnostic[] = [];

  pages.forEach((page, pageIndex) => {
    const requiredHeight = page.reduce((sum, row, rowIndex) => {
      const height = Math.max(0, options.rowHeight?.(row) ?? 0);
      const previousRow = page[rowIndex - 1];
      const pauseExtra = rowIndex > 0
        ? pauseSpacingExtraForBoundary(
            previousRow?.at(-1),
            row[0],
            options.policy.breaking.pauseSpacing,
          )
        : 0;
      return sum + height + (rowIndex > 0 ? rowSpacing + pauseExtra : 0);
    }, 0);
    if (requiredHeight <= availableHeight) return;
    diagnostics.push({
      code: 'page-overflow',
      pageIndex,
      rowCount: page.length,
      requiredHeight,
      availableHeight,
      message: `Caption page ${pageIndex + 1} needs ${requiredHeight} units for ${page.length} rows but only ${availableHeight} units are available.`,
    });
  });

  return diagnostics;
}
