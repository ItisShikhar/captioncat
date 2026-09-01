import type { ResolvedCornerGeometry } from '../../../types/captions';
import type { SkiaPath2D } from '../../../utilities/canvas-utils';
import { acquireCanvas, releaseCanvas } from '../../../utilities/canvas-pool';
import { drawRoundedRectanglePath, scaleCornerGeometryToFit } from '../../../utilities/canvas-utils';
import type { ResolvedPaint } from '../paint';
import type { CornerRadiusProvider } from '../components/border-radius';
import type { Box, CanvasContext2D, ResolveContext } from '../types';

/** Resolved line style for a box-outline stroke, shared by `BorderEffect` and `StrokeEffect` when attached to a box-shaped component (e.g. `BackgroundStyle`). */
export interface BoxStrokeStyle {
  width: number;
  color: ResolvedPaint;
  position?: BoxStrokePosition | undefined;
  style?: 'solid' | 'dashed' | 'dotted' | undefined;
  cap?: 'butt' | 'round' | 'square' | undefined;
  join?: 'miter' | 'round' | 'bevel' | undefined;
  dash?: number | undefined;
  gap?: number | undefined;
  dashOffset?: number | undefined;
  antialiasScale?: number | undefined;
}

export type BoxStrokePosition = 'inner' | 'center' | 'outer';

export function renderSupersampled(
  ctx: CanvasContext2D,
  scale: number,
  draw: (target: CanvasContext2D) => void,
): void {
  if (scale <= 1) {
    draw(ctx);
    return;
  }

  const width = Math.max(1, Math.ceil(ctx.canvas.width * scale));
  const height = Math.max(1, Math.ceil(ctx.canvas.height * scale));
  const supersampled = acquireCanvas(width, height);
  try {
    const target = supersampled.getContext('2d');
    const transform = ctx.getTransform();
    target.setTransform(
      transform.a * scale,
      transform.b * scale,
      transform.c * scale,
      transform.d * scale,
      transform.e * scale,
      transform.f * scale,
    );
    draw(target);

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(supersampled, 0, 0, width, height, 0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  } finally {
    releaseCanvas(supersampled);
  }
}

const ZERO_GEOMETRY: ResolvedCornerGeometry = {
  radii: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
  squircle: { topLeft: false, topRight: false, bottomRight: false, bottomLeft: false },
};

/** Apply a resolved stroke style to `ctx`. Return false when the style paints nothing. */
export function applyStrokeStyle(ctx: CanvasContext2D, style: BoxStrokeStyle | undefined): boolean {
  if (!style || style.width <= 0) return false;
  const strokeStyle = style.style ?? 'solid';
  ctx.lineWidth = style.width;
  ctx.strokeStyle = style.color;
  const lineCap = style.cap ?? (strokeStyle === 'dotted' ? 'round' : 'butt');
  ctx.lineCap = lineCap;
  ctx.lineJoin = style.join ?? 'miter';
  ctx.miterLimit = 2;
  if (strokeStyle === 'dashed') {
    ctx.setLineDash([Math.max(0, style.dash ?? style.width * 2), Math.max(0, style.gap ?? style.width * 2)]);
  } else if (strokeStyle === 'dotted') {
    ctx.setLineDash([lineCap === 'round' ? 0 : style.width, Math.max(0, style.gap ?? style.width * 1.6)]);
  } else {
    ctx.setLineDash([]);
  }
  ctx.lineDashOffset = style.dashOffset ?? 0;
  return true;
}

/** Stroke a box's rounded path with the given style (no-op if `style` is unset/zero-width). */
export function strokeRoundedBox(
  ctx: CanvasContext2D,
  box: Box,
  cornerRadius: CornerRadiusProvider | undefined,
  rctx: ResolveContext,
  style: BoxStrokeStyle | undefined,
): void {
  ctx.save();
  if (applyStrokeStyle(ctx, style)) {
    const position = style?.position ?? 'center';
    const halfWidth = style?.width ? style.width / 2 : 0;
    const strokedBox = boxForStrokePosition(box, position, halfWidth);
    if (strokedBox.width <= 0 || strokedBox.height <= 0) {
      ctx.restore();
      return;
    }
    const baseGeometry = cornerRadius?.cornerGeometry(rctx) ?? ZERO_GEOMETRY;
    const geometry = scaleCornerGeometryToFit(
      geometryForStrokePosition(baseGeometry, position, halfWidth),
      strokedBox.width,
      strokedBox.height,
    );
    ctx.beginPath();
    drawRoundedRectanglePath(ctx, strokedBox.x, strokedBox.y, strokedBox.width, strokedBox.height, geometry);
    ctx.stroke();
  }
  ctx.restore();
}

function boxForStrokePosition(box: Box, position: BoxStrokePosition, halfWidth: number): Box {
  if (position === 'outer') {
    return { x: box.x - halfWidth, y: box.y - halfWidth, width: box.width + halfWidth * 2, height: box.height + halfWidth * 2 };
  }
  if (position === 'inner') {
    return { x: box.x + halfWidth, y: box.y + halfWidth, width: box.width - halfWidth * 2, height: box.height - halfWidth * 2 };
  }
  return box;
}

function geometryForStrokePosition(
  geometry: ResolvedCornerGeometry,
  position: BoxStrokePosition,
  halfWidth: number,
): ResolvedCornerGeometry {
  const delta = position === 'outer' ? halfWidth : position === 'inner' ? -halfWidth : 0;
  return {
    ...geometry,
    radii: {
      topLeft: Math.max(0, geometry.radii.topLeft + delta),
      topRight: Math.max(0, geometry.radii.topRight + delta),
      bottomRight: Math.max(0, geometry.radii.bottomRight + delta),
      bottomLeft: Math.max(0, geometry.radii.bottomLeft + delta),
    },
  };
}

/** Stroke a prebuilt path (e.g. a multi-row union band) with the given style. */
export function strokePathWithStyle(ctx: CanvasContext2D, path: SkiaPath2D, style: BoxStrokeStyle | undefined): void {
  ctx.save();
  if (!style || !applyStrokeStyle(ctx, style)) {
    ctx.restore();
    return;
  }
  const position = style.position ?? 'center';
  if (position === 'center') {
    ctx.stroke(path);
  } else {
    const strokeLayer = acquireCanvas(ctx.canvas.width, ctx.canvas.height);
    try {
      const strokeContext = strokeLayer.getContext('2d');
      strokeContext.setTransform(ctx.getTransform());
      if (applyStrokeStyle(strokeContext, { ...style, width: style.width * 2 })) {
        strokeContext.stroke(path);
        strokeContext.globalCompositeOperation = position === 'inner' ? 'destination-in' : 'destination-out';
        strokeContext.fill(path);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(strokeLayer, 0, 0);
    } finally {
      releaseCanvas(strokeLayer);
    }
  }
  ctx.restore();
}
