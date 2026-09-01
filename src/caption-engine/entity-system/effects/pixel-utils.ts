/** Clamps a float color channel value to [0, 255] and rounds to integer. */
export function clampColor(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

/** Deterministic pseudo-random value in [0, 1) for the given frame and pixel coordinates. */
export function pseudoRandom(frameIndex: number, x: number, y: number): number {
  let value = Math.imul(frameIndex + 1, 374761393);
  value = Math.imul(value ^ Math.imul(x + 1, 668265263), 1274126177);
  value = Math.imul(value ^ Math.imul(y + 1, 2246822519), 3266489917);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}
