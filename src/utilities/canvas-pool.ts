import { Canvas } from '#platform/canvas.js';

// Small pool of reusable Skia canvases, grouped by exact (width, height).
//
// Reuse relies on the fact that reassigning `canvas.width` (even to its current
// value) forces skia-canvas to fully reset the underlying surface exactly as a
// brand-new canvas is: the clip path, transform matrix, globalAlpha,
// filter, and all pixels are cleared. This mirrors HTMLCanvasElement semantics
// and matches tests against this project's skia-canvas version, so pooled
// canvases are indistinguishable from freshly allocated ones to callers.
//
// Only canvases whose contents have already been fully consumed (synchronously
// drawn into another canvas, or after their async `toBuffer()` encode has
// resolved) must ever be released back into the pool.
const MAX_POOLED_PER_SIZE = 6;
const pools = new Map<string, Canvas[]>();

export interface CanvasPoolScope {
  acquire(width: number, height: number): Canvas;
  releaseAll(): void;
}

function poolKey(width: number, height: number): string {
  return `${width}x${height}`;
}

export function acquireCanvas(width: number, height: number): Canvas {
  const bucket = pools.get(poolKey(width, height));
  const pooled = bucket?.pop();
  if (pooled) {
    // Reassigning width resets transform/clip/style state and clears pixels.
    pooled.width = width;
    return pooled;
  }
  return new Canvas(width, height);
}

export function releaseCanvas(canvas: Canvas | undefined): void {
  if (!canvas) {
    return;
  }
  const key = poolKey(canvas.width, canvas.height);
  let bucket = pools.get(key);
  if (!bucket) {
    bucket = [];
    pools.set(key, bucket);
  }
  if (bucket.length < MAX_POOLED_PER_SIZE) {
    bucket.push(canvas);
  }
}

export function createCanvasPoolScope(): CanvasPoolScope {
  const acquired = new Set<Canvas>();
  return {
    acquire(width, height) {
      const canvas = acquireCanvas(width, height);
      acquired.add(canvas);
      return canvas;
    },
    releaseAll() {
      for (const canvas of acquired) {
        releaseCanvas(canvas);
      }
      acquired.clear();
    },
  };
}
