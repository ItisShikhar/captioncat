/**
 * Grid step (seconds) every keyframe time snaps to across the whole timeline editor - drag, direct
 * Time-field edit/scrub, and click-to-insert all import this one constant, so changing it here
 * retunes the entire editor's granularity at once. Matches the Time field's own step of 0.05.
 */
export const GRID_SECONDS = 0.025;

/** Master switch for grid-snapping/enforcement - flip to `false` to let keyframe times take any real value again (no snapping, no legacy-data normalization, no insertion-room checks). */
export const ENFORCE_GRID_SNAPPING = true;

export function snapToGrid(time: number): number {
  const snapped = Math.round(time / GRID_SECONDS) * GRID_SECONDS;
  // Kill the float-precision noise `Math.round` division introduces (for example, 0.30000000000000004).
  return Math.round(snapped * 1000) / 1000;
}

/** Whether `time` sits within one grid step of an existing keyframe (that is, collides with it once snapped). */
export function collidesWithExisting(time: number, existingTimes: readonly number[]): boolean {
  return existingTimes.some((existing) => Math.abs(existing - time) < GRID_SECONDS - 1e-9);
}

/** Nudges a desired keyframe time away from any existing keyframe within GRID_SECONDS, so a newly inserted (or dropped) keyframe never lands on top of / overlapping another one. */
export function findNonOverlappingTime(desiredTime: number, existingTimes: readonly number[], duration: number): number {
  const clamp = (time: number) => Math.min(duration, Math.max(0, time));
  const collidesAt = (time: number) => collidesWithExisting(time, existingTimes);
  const candidate = snapToGrid(clamp(desiredTime));
  if (!collidesAt(candidate)) return candidate;
  const maxSteps = Math.ceil(duration / GRID_SECONDS) + 2;
  for (let step = 1; step <= maxSteps; step++) {
    const forward = clamp(candidate + step * GRID_SECONDS);
    if (forward <= duration && !collidesAt(forward)) return snapToGrid(forward);
    const backward = clamp(candidate - step * GRID_SECONDS);
    if (backward >= 0 && !collidesAt(backward)) return snapToGrid(backward);
  }
  // Degenerate case (track packed solid with keyframes at every grid step) - nothing better to return.
  return candidate;
}

/** The nearest existing keyframe times flanking `time` - `null` on a side with no such neighbor. */
function flankingTimes(time: number, existingTimes: readonly number[]): { lower: number | null; upper: number | null } {
  let lower: number | null = null;
  let upper: number | null = null;
  for (const existing of existingTimes) {
    if (existing <= time) lower = lower === null ? existing : Math.max(lower, existing);
    if (existing >= time) upper = upper === null ? existing : Math.min(upper, existing);
  }
  return { lower, upper };
}

/** The `[min, max]` seconds range a keyframe near `time` can legally occupy - a mandatory `GRID_SECONDS` gap from any real neighbor on each side, else the track's own `[0, duration]` bounds. */
export function insertableBoundsNear(time: number, existingTimes: readonly number[], duration: number): { min: number; max: number } {
  const { lower, upper } = flankingTimes(time, existingTimes);
  const min = lower === null ? 0 : lower + GRID_SECONDS;
  const max = upper === null ? duration : upper - GRID_SECONDS;
  return { min, max };
}

/** Whether there is any legal slot at all for a new keyframe near `time` - false when its two flanking keyframes sit closer together than `2 * GRID_SECONDS` (no room for a `GRID_SECONDS`-clear gap from both). */
export function hasInsertionRoom(time: number, existingTimes: readonly number[], duration: number): boolean {
  const { min, max } = insertableBoundsNear(time, existingTimes, duration);
  return min <= max + 1e-9;
}

/**
 * Whether a legal slot exists anywhere in `[0, duration]`, not only near one candidate
 * time. Used to decide whether "Add keyframe"/"Duplicate" is ever possible at all: a track
 * can be full right at its tail (or right next to whichever keyframe is active) while still
 * having plenty of unused room in an earlier gap, and disabling the button in that case is
 * misleading because another gap is available.
 */
export function hasAnyInsertionRoom(existingTimes: readonly number[], duration: number): boolean {
  if (existingTimes.length === 0) return true;
  const sorted = [...existingTimes].sort((a, b) => a - b);
  if (sorted[0] >= GRID_SECONDS - 1e-9) return true;
  if (duration - sorted[sorted.length - 1] >= GRID_SECONDS - 1e-9) return true;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i + 1] - sorted[i] >= 2 * GRID_SECONDS - 1e-9) return true;
  }
  return false;
}

/**
 * The midpoint of the single largest available gap anywhere in the track - the fallback
 * insertion point for "Add keyframe"/"Duplicate" when their preferred position has no room.
 * `hasAnyInsertionRoom` confirms a legal slot exists somewhere else. The caller must
 * already checked `hasAnyInsertionRoom`.
 */
export function bestAvailableInsertionTime(existingTimes: readonly number[], duration: number): number {
  if (existingTimes.length === 0) return snapToGrid(duration / 2);
  const sorted = [...existingTimes].sort((a, b) => a - b);
  let bestTime = sorted[0] / 2;
  let bestGap = sorted[0];
  const tailGap = duration - sorted[sorted.length - 1];
  if (tailGap > bestGap) {
    bestGap = tailGap;
    bestTime = (sorted[sorted.length - 1] + duration) / 2;
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1] - sorted[i];
    if (gap > bestGap) {
      bestGap = gap;
      bestTime = (sorted[i] + sorted[i + 1]) / 2;
    }
  }
  return snapToGrid(bestTime);
}

/** Re-snaps every time onto the grid (order-preserving in the return array), resolving any new collisions the snap introduces by nudging later (by original time) entries outward first. Self-heals legacy/preset keyframes authored off-grid (e.g. `0.21s`) the first time their track is opened. */
export function normalizeTimesToGrid(times: readonly number[], duration: number): number[] {
  const ordered = times.map((time, index) => ({ time, index })).sort((a, b) => a.time - b.time);
  const placed: number[] = [];
  const result = new Array<number>(times.length);
  for (const { time, index } of ordered) {
    const snapped = findNonOverlappingTime(time, placed, duration);
    placed.push(snapped);
    result[index] = snapped;
  }
  return result;
}
