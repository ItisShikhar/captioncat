import type { ResolvedCornerGeometry, ResolvedCornerRadii } from '@captioncat/caption-engine/browser';

const SQUIRCLE_SEGMENTS_PER_CORNER = 12;
export const SQUIRCLE_RADIUS_MULTIPLIER = 1.65;

function getCornerRadiusScale(radii: ResolvedCornerRadii, width: number, height: number): number {
  const safeWidth = Number.isFinite(width) ? Math.max(0, Math.abs(width)) : 0;
  const safeHeight = Number.isFinite(height) ? Math.max(0, Math.abs(height)) : 0;
  const scaleForPair = (availableLength: number, adjacentRadii: number): number =>
    adjacentRadii > 0 ? availableLength / adjacentRadii : 1;

  return Math.min(
    1,
    scaleForPair(safeWidth, radii.topLeft + radii.topRight),
    scaleForPair(safeWidth, radii.bottomLeft + radii.bottomRight),
    scaleForPair(safeHeight, radii.topLeft + radii.bottomLeft),
    scaleForPair(safeHeight, radii.topRight + radii.bottomRight),
  );
}

export function scaleCornerGeometryToFit(
  geometry: ResolvedCornerGeometry,
  width: number,
  height: number,
): ResolvedCornerGeometry {
  const boostedRadii: ResolvedCornerRadii = {
    topLeft: geometry.squircle.topLeft ? geometry.radii.topLeft * SQUIRCLE_RADIUS_MULTIPLIER : geometry.radii.topLeft,
    topRight: geometry.squircle.topRight
      ? geometry.radii.topRight * SQUIRCLE_RADIUS_MULTIPLIER
      : geometry.radii.topRight,
    bottomRight: geometry.squircle.bottomRight
      ? geometry.radii.bottomRight * SQUIRCLE_RADIUS_MULTIPLIER
      : geometry.radii.bottomRight,
    bottomLeft: geometry.squircle.bottomLeft
      ? geometry.radii.bottomLeft * SQUIRCLE_RADIUS_MULTIPLIER
      : geometry.radii.bottomLeft,
  };
  const scale = getCornerRadiusScale(boostedRadii, width, height);
  return {
    ...geometry,
    radii: {
      topLeft: boostedRadii.topLeft * scale,
      topRight: boostedRadii.topRight * scale,
      bottomRight: boostedRadii.bottomRight * scale,
      bottomLeft: boostedRadii.bottomLeft * scale,
    },
  };
}

function appendRoundedCorner(
  path: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  cornerX: number,
  cornerY: number,
  endX: number,
  endY: number,
  radius: number,
  squircle: boolean,
): void {
  if (radius <= 0) {
    path.lineTo(endX, endY);
    return;
  }
  if (!squircle) {
    path.arcTo(cornerX, cornerY, endX, endY, radius);
    return;
  }

  const centerX = startX + endX - cornerX;
  const centerY = startY + endY - cornerY;
  const startVectorX = startX - centerX;
  const startVectorY = startY - centerY;
  const endVectorX = endX - centerX;
  const endVectorY = endY - centerY;

  for (let index = 1; index <= SQUIRCLE_SEGMENTS_PER_CORNER; index += 1) {
    if (index === SQUIRCLE_SEGMENTS_PER_CORNER) {
      path.lineTo(endX, endY);
      continue;
    }
    const angle = (index / SQUIRCLE_SEGMENTS_PER_CORNER) * (Math.PI / 2);
    const startWeight = Math.sqrt(Math.cos(angle));
    const endWeight = Math.sqrt(Math.sin(angle));
    path.lineTo(
      centerX + startVectorX * startWeight + endVectorX * endWeight,
      centerY + startVectorY * startWeight + endVectorY * endWeight,
    );
  }
}

export function drawRoundedRectanglePath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  geometry: ResolvedCornerGeometry,
): void {
  if (width <= 0 || height <= 0) {
    ctx.rect(x, y, width, height);
    return;
  }

  const { radii, squircle } = geometry;
  const { topLeft, topRight, bottomRight, bottomLeft } = radii;
  if (topLeft === 0 && topRight === 0 && bottomRight === 0 && bottomLeft === 0) {
    ctx.rect(x, y, width, height);
    return;
  }

  ctx.moveTo(x + topLeft, y);
  ctx.lineTo(x + width - topRight, y);
  appendRoundedCorner(ctx, x + width - topRight, y, x + width, y, x + width, y + topRight, topRight, squircle.topRight);
  ctx.lineTo(x + width, y + height - bottomRight);
  appendRoundedCorner(
    ctx,
    x + width,
    y + height - bottomRight,
    x + width,
    y + height,
    x + width - bottomRight,
    y + height,
    bottomRight,
    squircle.bottomRight,
  );
  ctx.lineTo(x + bottomLeft, y + height);
  appendRoundedCorner(
    ctx,
    x + bottomLeft,
    y + height,
    x,
    y + height,
    x,
    y + height - bottomLeft,
    bottomLeft,
    squircle.bottomLeft,
  );
  ctx.lineTo(x, y + topLeft);
  appendRoundedCorner(ctx, x, y + topLeft, x, y, x + topLeft, y, topLeft, squircle.topLeft);
  ctx.closePath();
}
