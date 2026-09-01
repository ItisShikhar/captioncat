export interface WordTimestamps {
  words: string[];
  word_start_times_seconds: number[];
  word_end_times_seconds: number[];
  /** True when the word begins after a source cue or explicit source line break. */
  break_before?: boolean[];
  /** Source cue index for each word, when the input preserves cue boundaries. */
  cue_indices?: number[];
}
