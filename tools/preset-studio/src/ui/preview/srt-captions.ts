import type { SampleTimestamps } from './preview-timestamps';

/** Parses an SRT timestamp (`HH:MM:SS,mmm`) into seconds. */
function parseSrtTimeToSeconds(time: string): number {
  const match = /^(\d+):(\d{2}):(\d{2}),(\d{3})$/.exec(time.trim());
  if (!match) return 0;
  const [, hours, minutes, seconds, milliseconds] = match;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(milliseconds) / 1000;
}

/**
 * Parses an `.srt` subtitle file into the same timestamp shape that the
 * engine expects. A cue can contain several words, so its duration is split
 * evenly across those words.
 */
export function parseSrtWordCaptions(srtText: string): SampleTimestamps {
  const words: string[] = [];
  const wordStartTimesSeconds: number[] = [];
  const wordEndTimesSeconds: number[] = [];

  // Cues are separated by one or more blank lines. Each cue contains:
  // <index>
  // <start> --> <end>
  // <text, possibly spanning multiple lines>
  const cues = srtText.replace(/\r\n/g, '\n').split(/\n{2,}/);
  const timingLine = /(\d{1,2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2},\d{3})/;

  for (const cue of cues) {
    const lines = cue.split('\n').filter((line) => line.trim().length > 0);
    if (lines.length < 2) continue;

    // The first line is a numeric cue index (which this parser does not need)
    // unless the timing line itself is first (some generators omit indices).
    const timingLineIndex = lines.findIndex((line) => timingLine.test(line));
    if (timingLineIndex === -1) continue;

    const match = timingLine.exec(lines[timingLineIndex]);
    if (!match) continue;

    const text = lines
      .slice(timingLineIndex + 1)
      .join(' ')
      .trim();
    if (!text) continue;

    const cueStartSeconds = parseSrtTimeToSeconds(match[1]);
    const cueEndSeconds = parseSrtTimeToSeconds(match[2]);
    const cueWords = text.split(/\s+/u).filter((word) => word.length > 0);
    const cueDurationSeconds = Math.max(0, cueEndSeconds - cueStartSeconds);
    const wordDurationSeconds = cueDurationSeconds / cueWords.length;

    cueWords.forEach((word, index) => {
      words.push(word);
      wordStartTimesSeconds.push(cueStartSeconds + wordDurationSeconds * index);
      wordEndTimesSeconds.push(
        index === cueWords.length - 1
          ? cueEndSeconds
          : cueStartSeconds + wordDurationSeconds * (index + 1),
      );
    });
  }

  const durationSeconds = wordEndTimesSeconds.length > 0 ? wordEndTimesSeconds[wordEndTimesSeconds.length - 1] : 0;
  return { words, wordStartTimesSeconds, wordEndTimesSeconds, durationSeconds };
}
