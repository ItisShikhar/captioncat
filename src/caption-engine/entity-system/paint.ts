import { interpolateColor, parseColor } from '../../utilities/color-utils';
import type { CanvasContext2D } from './types';
import type {
  GradientStop,
  LinearGradientPaint,
  Paint,
  PaintBounds,
  PaintCapability,
  RadialGradientPaint,
  ResolvedPaint,
  SolidPaint,
} from './paint-types';
export type {
  GradientStop,
  LinearGradientPaint,
  Paint,
  PaintBounds,
  PaintCapability,
  PaintGradient,
  PaintType,
  RadialGradientPaint,
  ResolvedPaint,
  SolidPaint,
} from './paint-types';

export type PaintTransform = ReturnType<CanvasContext2D['getTransform']>;

export interface LinearGradientGeometry {
  directionX: number;
  directionY: number;
  length: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface RadialGradientGeometry {
  centerX: number;
  centerY: number;
  radius: number;
}

export const DEFAULT_PAINT_CAPABILITIES: readonly PaintCapability[] = [
  'solid',
  'linear-gradient',
  'radial-gradient',
];

export function solidPaint(color: string): SolidPaint {
  return { type: 'solid', color };
}

export function opaquePaint(paint: Paint): Paint {
  const opaqueColor = (color: string): string => {
    const parsed = parseColor({ color, asString: false });
    if (!parsed || typeof parsed === 'string') return color;
    return `rgb(${parsed.r}, ${parsed.g}, ${parsed.b})`;
  };

  if (paint.type === 'solid') return solidPaint(opaqueColor(paint.color));
  return {
    ...paint,
    stops: paint.stops.map((stop) => ({ ...stop, color: opaqueColor(stop.color) })),
  };
}

export function isPaint(value: unknown): value is Paint {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as {
    type?: unknown;
    color?: unknown;
    angle?: unknown;
    centerX?: unknown;
    centerY?: unknown;
    radius?: unknown;
    stops?: unknown;
  };
  if (candidate.type === 'solid') return typeof candidate.color === 'string';
  if (candidate.type !== 'linear-gradient' && candidate.type !== 'radial-gradient') return false;
  if (
    !Array.isArray(candidate.stops) ||
    candidate.stops.length < 2 ||
    !candidate.stops.every((stop) => isGradientStop(stop) && Number.isFinite(stop.offset))
  ) {
    return false;
  }
  if (candidate.type === 'linear-gradient') return typeof candidate.angle === 'number' && Number.isFinite(candidate.angle);
  return (
    typeof candidate.centerX === 'number' &&
    Number.isFinite(candidate.centerX) &&
    typeof candidate.centerY === 'number' &&
    Number.isFinite(candidate.centerY) &&
    typeof candidate.radius === 'number' &&
    Number.isFinite(candidate.radius)
  );
}

export function normalizePaint(value: unknown, fallback: Paint): Paint {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return structuredClone(fallback);
  const candidate = value as {
    type?: unknown;
    color?: unknown;
    angle?: unknown;
    centerX?: unknown;
    centerY?: unknown;
    radius?: unknown;
    stops?: unknown;
  };
  if (candidate.type === 'solid' && typeof candidate.color === 'string') {
    return solidPaint(candidate.color);
  }
  if ((candidate.type === 'linear-gradient' || candidate.type === 'radial-gradient') && Array.isArray(candidate.stops)) {
    const stops = candidate.stops
      .filter(isGradientStop)
      .map((stop) => ({ offset: clamp01(stop.offset), color: stop.color }))
      .sort((a, b) => a.offset - b.offset);
    if (stops.length >= 2) {
      if (candidate.type === 'linear-gradient') {
        return { type: candidate.type, angle: finiteNumber(candidate.angle, 90), stops };
      }
      return {
        type: candidate.type,
        centerX: clamp01(finiteNumber(candidate.centerX, 0.5)),
        centerY: clamp01(finiteNumber(candidate.centerY, 0.5)),
        radius: Math.max(0, finiteNumber(candidate.radius, 0.75)),
        stops,
      };
    }
  }
  return structuredClone(fallback);
}

export function isOpaquePaint(paint: Paint): boolean {
  const colors = paint.type === 'solid' ? [paint.color] : paint.stops.map((stop) => stop.color);
  if (colors.length === 0) return false;
  return colors.every((color) => {
    const parsed = parseColor({ color, asString: false });
    return parsed !== null && typeof parsed !== 'string' && (parsed.a ?? 1) >= 1;
  });
}

export function resolvePaint(ctx: CanvasContext2D, paint: Paint, bounds: PaintBounds, alphaMultiplier = 1): ResolvedPaint {
  const effectiveAlphaMultiplier = clamp01(alphaMultiplier);
  if (paint.type === 'solid') return solidColor(paint.color, effectiveAlphaMultiplier);

  const gradient =
    paint.type === 'linear-gradient'
      ? createLinearGradient(ctx, paint, bounds)
      : createRadialGradient(ctx, paint, bounds);

  for (const stop of paint.stops) {
    gradient.addColorStop(clamp01(stop.offset), solidColor(stop.color, effectiveAlphaMultiplier));
  }
  return gradient;
}

export function transformPaintBounds(bounds: PaintBounds, transform?: PaintTransform): PaintBounds {
  if (!transform) return bounds;
  const points = [
    [bounds.x, bounds.y],
    [bounds.x + bounds.width, bounds.y],
    [bounds.x, bounds.y + bounds.height],
    [bounds.x + bounds.width, bounds.y + bounds.height],
  ].map(([x, y]) => ({
    x: transform.a * x + transform.c * y + transform.e,
    y: transform.b * x + transform.d * y + transform.f,
  }));
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function resolveSolidPaint(paint: Paint, alphaMultiplier = 1): string {
  return paint.type === 'solid' ? solidColor(paint.color, alphaMultiplier) : 'rgba(0, 0, 0, 0)';
}

export function solidColor(color: string, alphaMultiplier = 1): string {
  const parsed = parseColor({ color, asString: false });
  if (!parsed || typeof parsed === 'string') return 'rgba(0, 0, 0, 0)';
  const alpha = clamp01(parsed.a ?? 1) * clamp01(alphaMultiplier);
  if (alpha >= 1) return `rgb(${parsed.r}, ${parsed.g}, ${parsed.b})`;
  return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${alpha})`;
}

export function paintSummary(paint: Paint): string {
  if (paint.type === 'solid') {
    const parsed = parseColor({ color: paint.color, asString: false });
    const alpha = parsed && typeof parsed !== 'string' && typeof parsed.a === 'number' ? clamp01(parsed.a) : 1;
    return `${paint.color} | ${Math.round(alpha * 100)}%`;
  }
  return `${paint.type === 'linear-gradient' ? 'Linear' : 'Radial'} • ${paint.stops.length} stops`;
}

export function resolveLinearGradientGeometry(
  paint: LinearGradientPaint,
  bounds: PaintBounds,
): LinearGradientGeometry {
  const radians = ((paint.angle - 90) * Math.PI) / 180;
  const directionX = snapGradientDirection(Math.cos(radians));
  const directionY = snapGradientDirection(Math.sin(radians));
  const length = Math.max(
    0.001,
    Math.abs(bounds.width * directionX) + Math.abs(bounds.height * directionY),
  );
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;

  return {
    directionX,
    directionY,
    length,
    startX: centerX - directionX * length / 2,
    startY: centerY - directionY * length / 2,
    endX: centerX + directionX * length / 2,
    endY: centerY + directionY * length / 2,
  };
}

export function resolveRadialGradientGeometry(
  paint: RadialGradientPaint,
  bounds: PaintBounds,
): RadialGradientGeometry {
  const centerX = bounds.x + bounds.width * clamp01(paint.centerX);
  const centerY = bounds.y + bounds.height * clamp01(paint.centerY);
  const distancesToCorners = [
    Math.hypot(centerX - bounds.x, centerY - bounds.y),
    Math.hypot(centerX - (bounds.x + bounds.width), centerY - bounds.y),
    Math.hypot(centerX - bounds.x, centerY - (bounds.y + bounds.height)),
    Math.hypot(centerX - (bounds.x + bounds.width), centerY - (bounds.y + bounds.height)),
  ];

  return {
    centerX,
    centerY,
    radius: Math.max(0.001, Math.max(...distancesToCorners) * Math.max(0, paint.radius)),
  };
}

export function interpolatePaint(from: Paint, to: Paint, progress: number): Paint {
  if (from.type !== to.type) return progress < 1 ? structuredClone(from) : structuredClone(to);
  if (from.type === 'solid' && to.type === 'solid') {
    return {
      type: 'solid',
      color: interpolateColor(from.color, to.color, progress) || (progress < 1 ? from.color : to.color),
    };
  }
  if (from.type === 'linear-gradient' && to.type === 'linear-gradient') {
    if (from.stops.length !== to.stops.length) return progress < 1 ? structuredClone(from) : structuredClone(to);
    const stops = from.stops.map((stop, index) => {
      const target = to.stops[index];
      return {
        offset: stop.offset + (target.offset - stop.offset) * progress,
        color: interpolateColor(stop.color, target.color, progress) || (progress < 1 ? stop.color : target.color),
      };
    });
    return { type: 'linear-gradient', angle: from.angle + (to.angle - from.angle) * progress, stops };
  }
  if (from.type === 'radial-gradient' && to.type === 'radial-gradient') {
    if (from.stops.length !== to.stops.length) return progress < 1 ? structuredClone(from) : structuredClone(to);
    const stops = from.stops.map((stop, index) => {
      const target = to.stops[index];
      return {
        offset: stop.offset + (target.offset - stop.offset) * progress,
        color: interpolateColor(stop.color, target.color, progress) || (progress < 1 ? stop.color : target.color),
      };
    });
    return {
      type: 'radial-gradient',
      centerX: from.centerX + (to.centerX - from.centerX) * progress,
      centerY: from.centerY + (to.centerY - from.centerY) * progress,
      radius: from.radius + (to.radius - from.radius) * progress,
      stops,
    };
  }
  return progress < 1 ? structuredClone(from) : structuredClone(to);
}

function createLinearGradient(ctx: CanvasContext2D, paint: LinearGradientPaint, bounds: PaintBounds) {
  const geometry = resolveLinearGradientGeometry(paint, bounds);
  return ctx.createLinearGradient(
    geometry.startX,
    geometry.startY,
    geometry.endX,
    geometry.endY,
  );
}

function createRadialGradient(ctx: CanvasContext2D, paint: RadialGradientPaint, bounds: PaintBounds) {
  const geometry = resolveRadialGradientGeometry(paint, bounds);
  return ctx.createRadialGradient(
    geometry.centerX,
    geometry.centerY,
    0,
    geometry.centerX,
    geometry.centerY,
    geometry.radius,
  );
}

function snapGradientDirection(value: number): number {
  return Math.abs(value) < 1e-12 ? 0 : value;
}

function isGradientStop(value: unknown): value is GradientStop {
  if (!value || typeof value !== 'object') return false;
  const stop = value as Partial<GradientStop>;
  return typeof stop.offset === 'number' && typeof stop.color === 'string';
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}