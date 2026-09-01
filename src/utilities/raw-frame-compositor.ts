/**
 * Pure, allocation-free helpers for compositing pre-rendered RGBA caption
 * frames directly onto decoded video frame buffers in memory (the
 * "skia-compositor" overlay path), replacing FFmpeg's `overlay` filter for
 * the common case.
 */

/**
 * Straight-alpha "source-over" blend of `overlay` onto `base`, mutating
 * `base` in place. Both buffers are tightly-packed RGBA (4 bytes/pixel).
 * The overlay rectangle is clipped to the base frame's bounds, so callers
 * do not need to pre-validate that the overlay fully fits.
 */
export function blendOverlayInPlace(
  base: Buffer | Uint8Array,
  baseWidth: number,
  baseHeight: number,
  overlay: Buffer | Uint8Array,
  overlayWidth: number,
  overlayHeight: number,
  destX: number,
  destY: number,
): void {
  const startX = Math.max(0, destX);
  const startY = Math.max(0, destY);
  const endX = Math.min(baseWidth, destX + overlayWidth);
  const endY = Math.min(baseHeight, destY + overlayHeight);
  if (startX >= endX || startY >= endY) {
    return;
  }

  const baseStride = baseWidth * 4;
  const overlayStride = overlayWidth * 4;

  for (let y = startY; y < endY; y++) {
    const overlayRowStart = (y - destY) * overlayStride;
    const baseRowStart = y * baseStride;
    for (let x = startX; x < endX; x++) {
      const oIdx = overlayRowStart + (x - destX) * 4;
      const a = overlay[oIdx + 3];
      if (a === 0) {
        continue;
      }
      const bIdx = baseRowStart + x * 4;
      if (a === 255) {
        base[bIdx] = overlay[oIdx];
        base[bIdx + 1] = overlay[oIdx + 1];
        base[bIdx + 2] = overlay[oIdx + 2];
        base[bIdx + 3] = 255;
        continue;
      }
      const invA = 255 - a;
      base[bIdx] = ((overlay[oIdx] * a + base[bIdx] * invA) / 255) | 0;
      base[bIdx + 1] = ((overlay[oIdx + 1] * a + base[bIdx + 1] * invA) / 255) | 0;
      base[bIdx + 2] = ((overlay[oIdx + 2] * a + base[bIdx + 2] * invA) / 255) | 0;
      // Base frames come from decoded (opaque) video, so their alpha channel
      // is never read downstream - no need to accumulate it here.
    }
  }
}

export type RawBlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'soft-light'
  | 'hard-light'
  | 'darken'
  | 'lighten'
  | 'difference'
  | 'exclusion';

function blendChannel(mode: RawBlendMode, source: number, destination: number): number {
  switch (mode) {
    case 'multiply':
      return (source * destination) / 255;
    case 'screen':
      return 255 - ((255 - source) * (255 - destination)) / 255;
    case 'overlay':
      return destination < 128
        ? (2 * source * destination) / 255
        : 255 - (2 * (255 - source) * (255 - destination)) / 255;
    case 'hard-light':
      return source < 128
        ? (2 * source * destination) / 255
        : 255 - (2 * (255 - source) * (255 - destination)) / 255;
    case 'soft-light': {
      const s = source / 255;
      const d = destination / 255;
      const result =
        s <= 0.5
          ? d - (1 - 2 * s) * d * (1 - d)
          : d + (2 * s - 1) * (Math.sqrt(d) - d);
      return result * 255;
    }
    case 'darken':
      return Math.min(source, destination);
    case 'lighten':
      return Math.max(source, destination);
    case 'difference':
      return Math.abs(destination - source);
    case 'exclusion':
      return source + destination - (2 * source * destination) / 255;
    case 'normal':
      return source;
  }
}

/**
 * Blends an RGBA overlay against an opaque RGBA base with a Canvas blend mode.
 * The base buffer is mutated in place.
 */
export function blendOverlayWithModeInPlace(
  base: Buffer | Uint8Array,
  baseWidth: number,
  baseHeight: number,
  overlay: Buffer | Uint8Array,
  overlayWidth: number,
  overlayHeight: number,
  destX: number,
  destY: number,
  mode: RawBlendMode,
): void {
  if (mode === 'normal') {
    blendOverlayInPlace(
      base,
      baseWidth,
      baseHeight,
      overlay,
      overlayWidth,
      overlayHeight,
      destX,
      destY,
    );
    return;
  }

  const startX = Math.max(0, destX);
  const startY = Math.max(0, destY);
  const endX = Math.min(baseWidth, destX + overlayWidth);
  const endY = Math.min(baseHeight, destY + overlayHeight);
  if (startX >= endX || startY >= endY) return;

  const baseStride = baseWidth * 4;
  const overlayStride = overlayWidth * 4;
  for (let y = startY; y < endY; y += 1) {
    const overlayRowStart = (y - destY) * overlayStride;
    const baseRowStart = y * baseStride;
    for (let x = startX; x < endX; x += 1) {
      const overlayIndex = overlayRowStart + (x - destX) * 4;
      const alpha = overlay[overlayIndex + 3];
      if (alpha === 0) continue;
      const baseIndex = baseRowStart + x * 4;
      const opacity = alpha / 255;
      for (let channel = 0; channel < 3; channel += 1) {
        const destination = base[baseIndex + channel];
        const source = overlay[overlayIndex + channel];
        const blended = blendChannel(mode, source, destination);
        base[baseIndex + channel] = Math.round(destination + (blended - destination) * opacity);
      }
    }
  }
}

export interface FrameSegment {
  buffer: Buffer;
  repeat: number;
}

/**
 * Builds a forward-only cursor over a constant-frame-rate segment timeline
 * (the same `{buffer, repeat}` list produced for the qtrle mux path), so the
 * active caption buffer for a monotonically increasing sequence of times can
 * be looked up in amortized O(1) instead of re-scanning from the start.
 *
 * Returns `undefined` once `timeSeconds` is past the end of the timeline.
 * Callers must treat that as a fully-transparent frame (skip
 * compositing), matching the old `eof_action=pass:repeatlast=0` behavior.
 */
export function createSegmentTimelineCursor(
  segments: readonly FrameSegment[],
  fps: number,
): (timeSeconds: number) => Buffer | undefined {
  const perFrameDur = 1 / fps;
  let segIndex = 0;
  let segStartTime = 0;

  return (timeSeconds: number): Buffer | undefined => {
    while (segIndex < segments.length) {
      const segment = segments[segIndex];
      const segEndTime = segStartTime + segment.repeat * perFrameDur;
      if (timeSeconds < segEndTime) {
        return segment.buffer;
      }
      segStartTime = segEndTime;
      segIndex++;
    }
    return undefined;
  };
}

export type VerticalAlignment = 'top' | 'center' | 'bottom';
export type HorizontalAlignment = 'left' | 'center' | 'right';

/**
 * Numeric equivalent of `getFfmpegOverlayExprs` (caption-rendering-engine.ts)
 * for use when `main_w`/`main_h`/`overlay_w`/`overlay_h` are already known
 * plain numbers (i.e. no FFmpeg-side expression evaluation is involved).
 */
export function computeOverlayPixelPosition(
  verticalAlignment: VerticalAlignment,
  horizontalAlignment: HorizontalAlignment,
  mainWidth: number,
  mainHeight: number,
  overlayWidth: number,
  overlayHeight: number,
  xOffset = 0,
  yOffset = 0,
  useSafeArea = true,
): { x: number; y: number } {
  const xo = Number.isFinite(xOffset) ? xOffset : 0;
  const yo = Number.isFinite(yOffset) ? yOffset : 0;
  const offsetPerc = 0.1;

  const x =
    horizontalAlignment === 'left'
      ? xo
      : horizontalAlignment === 'right'
        ? mainWidth - overlayWidth + xo
        : (mainWidth - overlayWidth) / 2 + xo;

  const y =
    verticalAlignment === 'top'
      ? useSafeArea
        ? offsetPerc * mainHeight + yo
        : yo
      : verticalAlignment === 'center'
        ? (mainHeight - overlayHeight) / 2 + yo
        : useSafeArea
          ? mainHeight - overlayHeight - offsetPerc * mainHeight + yo
          : mainHeight - overlayHeight + yo;

  return { x: Math.round(x), y: Math.round(y) };
}

/**
 * Reassembles arbitrary-sized binary chunks (as delivered by a readable
 * stream's 'data' events) into fixed-size frames. Any trailing partial bytes
 * at stream end (well-formed rawvideo output has none) are
 * silently dropped.
 */
export class RawFrameReassembler {
  private readonly scratch: Buffer;
  private filled = 0;

  constructor(private readonly frameBytes: number) {
    this.scratch = Buffer.allocUnsafe(frameBytes);
  }

  /**
 * Appends a chunk and returns any newly-completed frames (0, 1, or more).
 *
 * Copies each incoming chunk directly into a preallocated, reused
 * scratch buffer at the current fill offset, rather than repeatedly
 * `Buffer.concat`-ing the growing "pending" buffer (which copies the
 * entire accumulated-so-far content again on every single chunk - an
 * O(n^2) cost that becomes very significant once a frame spans dozens of
 * small stdout chunks, as multi-megabyte 720p/1080p frames do).
 */
  push(chunk: Buffer): Buffer[] {
    const frames: Buffer[] = [];
    let offset = 0;
    while (offset < chunk.length) {
      const spaceLeft = this.frameBytes - this.filled;
      const bytesToCopy = Math.min(spaceLeft, chunk.length - offset);
      chunk.copy(this.scratch, this.filled, offset, offset + bytesToCopy);
      this.filled += bytesToCopy;
      offset += bytesToCopy;
      if (this.filled === this.frameBytes) {
        // Copy out: `scratch` is reused for the next frame, so the caller
        // needs its own independent buffer to composite/write downstream.
        frames.push(Buffer.from(this.scratch));
        this.filled = 0;
      }
    }
    return frames;
  }
}
