import type { Paint } from '../paint-types';
import { solidPaint } from '../paint';

export type ReplicatorFillMode = 'inherit' | 'random' | 'custom';
export type ReplicatorFillTarget = 'base' | 'fullLayer';

export const DEFAULT_REPLICATOR_FILL_MODE: ReplicatorFillMode = 'inherit';
export const DEFAULT_REPLICATOR_FILL_TARGET: ReplicatorFillTarget = 'base';
export const DEFAULT_REPLICATOR_FILL_SEED = 0;
export const DEFAULT_REPLICATOR_CUSTOM_FILLS: readonly Paint[] = [
  solidPaint('#ff4d4f'),
  solidPaint('#40a9ff'),
  solidPaint('#73d13d'),
];

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hueToRgb(p: number, q: number, t: number): number {
  let hue = t;
  if (hue < 0) hue += 1;
  if (hue > 1) hue -= 1;
  if (hue < 1 / 6) return p + (q - p) * 6 * hue;
  if (hue < 1 / 2) return q;
  if (hue < 2 / 3) return p + (q - p) * (2 / 3 - hue) * 6;
  return p;
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  const red = Math.round(hueToRgb(p, q, hue + 1 / 3) * 255);
  const green = Math.round(hueToRgb(p, q, hue) * 255);
  const blue = Math.round(hueToRgb(p, q, hue - 1 / 3) * 255);
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

export function replicatorFillForCopy(seed: number, copyId: string): Paint {
  const hash = hashString(`${Number.isFinite(seed) ? seed : DEFAULT_REPLICATOR_FILL_SEED}:${copyId}`);
  const hue = (hash % 360) / 360;
  const saturation = 0.68 + ((hash >>> 8) % 12) / 100;
  const lightness = 0.5 + ((hash >>> 16) % 12) / 100;
  return solidPaint(hslToHex(hue, saturation, lightness));
}