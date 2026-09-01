import type { Box, PropertyKind } from '../types';
import { toVec2 } from '../types';
import { normalizePaint, solidPaint } from '../paint';
import { normalizeFillPattern } from '../fill-pattern';
import { interpolatorFor } from '../transitions/interpolators';
import { resolveFontWeight } from '../../../font-registry';

export function normalizeAnimationValue(value: unknown, kind: PropertyKind): unknown {
  if (kind === 'vector2' && value !== 'auto') return toVec2(value);
  if (kind === 'paint') return normalizePaint(value, solidPaint('#000000'));
  if (kind === 'pattern') return normalizeFillPattern(value);
  if (kind === 'fontWeight') return resolveFontWeight(value);
  if (kind === 'rect' && value && typeof value === 'object') {
    const box = value as Partial<Box>;
    return {
      x: Number(box.x) || 0,
      y: Number(box.y) || 0,
      width: Number(box.width) || 0,
      height: Number(box.height) || 0,
    };
  }
  return value;
}

export function interpolateAnimationValue(
  from: unknown,
  to: unknown,
  progress: number,
  kind: PropertyKind,
): unknown {
  const interpolator = interpolatorFor(kind);
  if (interpolator) return interpolator(from, to, progress);
  return progress < 1 ? from : to;
}