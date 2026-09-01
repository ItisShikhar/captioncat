import { Canvas, CanvasRenderingContext2D, Image, Path2D } from '#platform/canvas.js';
import type { ResolvedCornerGeometry, ResolvedCornerRadii } from '../types/captions';

const SQUIRCLE_SEGMENTS_PER_CORNER = 12;

export type CornerPath = Pick<CanvasRenderingContext2D, 'arc' | 'arcTo' | 'closePath' | 'lineTo' | 'moveTo'>;

/** skia-canvas's Path2D instance type (its named type is not cleanly importable). */
export type SkiaPath2D = Parameters<CanvasRenderingContext2D['fill']>[0];

/** The imported Path2D value uses the DOM type. Cast it to the skia-canvas type. */
const createSkiaPath = (): SkiaPath2D => new Path2D() as unknown as SkiaPath2D;

/**
 * Decodes an encoded image buffer (for example, PNG) into raw, non-premultiplied
 * RGBA pixels. Intended for one-off/static images (for example, the caption-region
 * overlay), not per-frame use - the decode + re-draw round trip is not free.
 */
export async function decodeImageToRawRgba(
  imageBuffer: Buffer,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const image = new Image(imageBuffer);
  await image.decode();
  const canvas = new Canvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const buffer = await canvas.toBuffer('raw', { colorType: 'rgba' });
  return { buffer, width: image.width, height: image.height };
}

// A squircle is flatter near the corner than a circular arc at the same
// nominal radius, so the render-time boost keeps the perceived rounding close.
export const SQUIRCLE_RADIUS_MULTIPLIER = 1.65;

export function getCornerRadiusScale(radii: ResolvedCornerRadii, width: number, height: number): number {
  const safeWidth = typeof width === 'number' && Number.isFinite(width) ? Math.max(0, Math.abs(width)) : 0;
  const safeHeight = typeof height === 'number' && Number.isFinite(height) ? Math.max(0, Math.abs(height)) : 0;
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

export function scaleCornerRadiiToFit(radii: ResolvedCornerRadii, width: number, height: number): ResolvedCornerRadii {
  const scale = getCornerRadiusScale(radii, width, height);

  return {
    topLeft: radii.topLeft * scale,
    topRight: radii.topRight * scale,
    bottomRight: radii.bottomRight * scale,
    bottomLeft: radii.bottomLeft * scale,
  };
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
  const radii = scaleCornerRadiiToFit(boostedRadii, width, height);

  return {
    ...geometry,
    radii,
  };
}

export function appendRoundedCorner(
  path: CornerPath,
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

  const incomingLength = Math.hypot(cornerX - startX, cornerY - startY);
  const outgoingLength = Math.hypot(endX - cornerX, endY - cornerY);
  const chordLength = Math.hypot(endX - startX, endY - startY);
  const handle = Math.min(chordLength * 0.42, incomingLength, outgoingLength);
  const incomingX = incomingLength > 0 ? (cornerX - startX) / incomingLength : 0;
  const incomingY = incomingLength > 0 ? (cornerY - startY) / incomingLength : 0;
  const outgoingX = outgoingLength > 0 ? (endX - cornerX) / outgoingLength : 0;
  const outgoingY = outgoingLength > 0 ? (endY - cornerY) / outgoingLength : 0;
  appendCubicTransition(
    path,
    { x: startX, y: startY },
    { x: startX + incomingX * handle, y: startY + incomingY * handle },
    { x: endX - outgoingX * handle, y: endY - outgoingY * handle },
    { x: endX, y: endY },
    SQUIRCLE_SEGMENTS_PER_CORNER,
  );
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

/** One row band of a multi-row page background union, in canvas space. */
export interface UnionRowRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface UnionVertex {
  x: number;
  y: number;
}

function unionVector(a: UnionVertex, b: UnionVertex): { x: number; y: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  return { x: len > 0 ? dx / len : 0, y: len > 0 ? dy / len : 0 };
}

function buildUnionBoundarySide(rows: UnionRowRect[], side: 'left' | 'right'): UnionVertex[] {
  const epsilon = 1e-3;
  const yEvents = Array.from(new Set(rows.flatMap((row) => [row.top, row.bottom]))).sort((a, b) => a - b);
  const points: UnionVertex[] = [];

  const xAt = (y: number): number | undefined => {
    const activeRows = rows.filter((row) => row.top <= y && row.bottom >= y);
    if (activeRows.length === 0) return undefined;
    return side === 'left'
      ? Math.min(...activeRows.map((row) => row.left))
      : Math.max(...activeRows.map((row) => row.right));
  };

  const appendPoint = (point: UnionVertex): void => {
    const previous = points[points.length - 1];
    if (previous && Math.abs(previous.x - point.x) <= epsilon && Math.abs(previous.y - point.y) <= epsilon) return;
    points.push(point);
  };

  let currentX: number | undefined;
  for (let index = 0; index < yEvents.length - 1; index += 1) {
    const top = yEvents[index];
    const bottom = yEvents[index + 1];
    if (bottom - top <= epsilon) continue;

    const nextX = xAt((top + bottom) / 2);
    if (nextX === undefined) continue;

    if (currentX === undefined) {
      currentX = nextX;
      appendPoint({ x: currentX, y: top });
    } else if (Math.abs(nextX - currentX) > epsilon) {
      appendPoint({ x: currentX, y: top });
      currentX = nextX;
      appendPoint({ x: currentX, y: top });
    }
    appendPoint({ x: currentX, y: bottom });
  }

  return points;
}

function simplifyUnionBoundary(points: UnionVertex[]): UnionVertex[] {
  const epsilon = 1e-3;
  const simplified: UnionVertex[] = [];
  for (const point of points) {
    const previous = simplified[simplified.length - 1];
    if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) <= epsilon) continue;
    while (simplified.length >= 2) {
      const before = simplified[simplified.length - 2];
      const current = simplified[simplified.length - 1];
      const first = { x: current.x - before.x, y: current.y - before.y };
      const second = { x: point.x - current.x, y: point.y - current.y };
      const cross = first.x * second.y - first.y * second.x;
      const dot = first.x * second.x + first.y * second.y;
      const scale = Math.max(1, Math.hypot(first.x, first.y) * Math.hypot(second.x, second.y));
      if (Math.abs(cross) > epsilon * scale || dot < -epsilon) break;
      simplified.pop();
    }
    simplified.push(point);
  }
  return simplified;
}

function appendCubicTransition(
  path: CornerPath,
  start: UnionVertex,
  controlStart: UnionVertex,
  controlEnd: UnionVertex,
  end: UnionVertex,
  segments = 12,
): void {
  for (let index = 1; index <= segments; index += 1) {
    const t = index / segments;
    const inverse = 1 - t;
    path.lineTo(
      inverse ** 3 * start.x +
        3 * inverse ** 2 * t * controlStart.x +
        3 * inverse * t ** 2 * controlEnd.x +
        t ** 3 * end.x,
      inverse ** 3 * start.y +
        3 * inverse ** 2 * t * controlStart.y +
        3 * inverse * t ** 2 * controlEnd.y +
        t ** 3 * end.y,
    );
  }
}

/** Build one continuous rounded path enclosing a stack of per-row bands. */
export function buildRoundedUnionPath(
  inputRows: UnionRowRect[],
  geometry: ResolvedCornerGeometry,
  joinRadius: number,
): SkiaPath2D {
  const rows: UnionRowRect[] = inputRows
    .map((row) => ({ ...row }))
    .sort((a, b) => a.top - b.top || a.left - b.left);
  if (rows.length === 0) return createSkiaPath();

  // Keep overlapping bands intact so band padding remains symmetric. Only
  // bridge an actual gap, splitting it evenly between the two neighboring rows.
  for (let index = 0; index < rows.length - 1; index += 1) {
    const currentBottom = rows[index].bottom;
    const nextTop = rows[index + 1].top;
    if (currentBottom < nextTop) {
      const joinY = currentBottom + (nextTop - currentBottom) / 2;
      rows[index].bottom = joinY;
      rows[index + 1].top = joinY;
    }
  }

  const unionTop = Math.min(...rows.map((row) => row.top));
  const unionBottom = Math.max(...rows.map((row) => row.bottom));
  const unionLeft = Math.min(...rows.map((row) => row.left));
  const unionRight = Math.max(...rows.map((row) => row.right));
  const unionWidth = unionRight - unionLeft;
  const unionHeight = unionBottom - unionTop;

  const cornerRadiusScale = getCornerRadiusScale(geometry.radii, unionWidth, unionHeight);
  const { radii: scaledCornerRadii, squircle } = scaleCornerGeometryToFit(geometry, unionWidth, unionHeight);
  const joinSquircle = squircle.topLeft || squircle.topRight || squircle.bottomRight || squircle.bottomLeft;
  const scaledJoinRadius =
    Math.max(0, joinRadius) * cornerRadiusScale * (joinSquircle ? SQUIRCLE_RADIUS_MULTIPLIER : 1);
  const outerJoinRadius = Math.max(
    scaledJoinRadius,
    scaledCornerRadii.topLeft,
    scaledCornerRadii.topRight,
    scaledCornerRadii.bottomRight,
    scaledCornerRadii.bottomLeft,
  );
  const inwardJoinRadius = scaledJoinRadius;

  const leftBoundary = simplifyUnionBoundary(buildUnionBoundarySide(rows, 'left'));
  const rightBoundary = simplifyUnionBoundary(buildUnionBoundarySide(rows, 'right'));
  const vertices: UnionVertex[] = [...leftBoundary, ...rightBoundary.slice().reverse()];
  const leftBoundaryVertexCount = leftBoundary.length;
  if (vertices.length === 0) return createSkiaPath();

  if (outerJoinRadius <= 0) {
    const simplePath = createSkiaPath();
    simplePath.moveTo(vertices[0].x, vertices[0].y);
    vertices.forEach((point) => simplePath.lineTo(point.x, point.y));
    simplePath.closePath();
    return simplePath;
  }

  const outerCornerByVertex = new Map<number, { radius: number; squircle: boolean }>([
    [0, { radius: scaledCornerRadii.topLeft, squircle: squircle.topLeft }],
    [leftBoundaryVertexCount - 1, { radius: scaledCornerRadii.bottomLeft, squircle: squircle.bottomLeft }],
    [leftBoundaryVertexCount, { radius: scaledCornerRadii.bottomRight, squircle: squircle.bottomRight }],
    [vertices.length - 1, { radius: scaledCornerRadii.topRight, squircle: squircle.topRight }],
  ]);
  const vertexCount = vertices.length;

  const resolveVertexCornerInfo = (index: number): { radius: number; squircle: boolean } => {
    const namedCorner = outerCornerByVertex.get(index);
    if (namedCorner) return namedCorner;
    const previous = vertices[(index - 1 + vertexCount) % vertexCount];
    const current = vertices[index];
    const next = vertices[(index + 1) % vertexCount];
    const previousVector = unionVector(previous, current);
    const nextVector = unionVector(current, next);
    const cross = previousVector.x * nextVector.y - previousVector.y * nextVector.x;
    return { radius: cross >= 0 ? outerJoinRadius : inwardJoinRadius, squircle: joinSquircle };
  };

  const edgeLengths = vertices.map((vertex, index) => {
    const next = vertices[(index + 1) % vertexCount];
    return Math.hypot(next.x - vertex.x, next.y - vertex.y);
  });
  const rawCornerInfos = vertices.map((_, index) => resolveVertexCornerInfo(index));
  const cornerInfos = rawCornerInfos.map((info, index) => {
    const incomingLength = edgeLengths[(index - 1 + vertexCount) % vertexCount];
    const outgoingLength = edgeLengths[index];
    // A corner cannot consume more than half of either adjacent edge. This
    // keeps close stair-step corners valid when the authored radius is larger
    // than the local distance between them.
    const localRadius = Math.min(incomingLength, outgoingLength) / 2;
    return { ...info, radius: Math.min(info.radius, Math.max(0, localRadius)) };
  });

  const tangentOut = new Array<number>(vertexCount).fill(0);
  const tangentIn = new Array<number>(vertexCount).fill(0);
  for (let index = 0; index < vertexCount; index += 1) {
    const nextIndex = (index + 1) % vertexCount;
    const edgeLength = edgeLengths[index];
    const wantOut = cornerInfos[index].radius;
    const wantIn = cornerInfos[nextIndex].radius;
    const totalWant = wantOut + wantIn;
    const edgeScale = totalWant > edgeLength && totalWant > 0 ? edgeLength / totalWant : 1;
    tangentOut[index] = wantOut * edgeScale;
    tangentIn[nextIndex] = wantIn * edgeScale;
  }

  const isCornerRounded = (index: number): boolean => {
    const info = cornerInfos[index];
    return info.radius > 0 && (tangentIn[index] > 0 || tangentOut[index] > 0);
  };

  const pointToward = (origin: UnionVertex, target: UnionVertex, distance: number, segmentLength: number): UnionVertex => {
    if (segmentLength <= 0) return origin;
    return {
      x: origin.x + ((target.x - origin.x) / segmentLength) * distance,
      y: origin.y + ((target.y - origin.y) / segmentLength) * distance,
    };
  };

  type MergedTransition = {
    index: number;
    endIndex: number;
    middleLength: number;
    start: UnionVertex;
    end: UnionVertex;
    handle: number;
    transitionLength: number;
  };
  const mergeCandidates: MergedTransition[] = [];
  for (let index = 0; index < vertexCount; index += 1) {
    const nextIndex = (index + 1) % vertexCount;
    if (!isCornerRounded(index) || !isCornerRounded(nextIndex)) continue;
    const previous = vertices[(index - 1 + vertexCount) % vertexCount];
    const current = vertices[index];
    const next = vertices[nextIndex];
    const after = vertices[(nextIndex + 1) % vertexCount];
    const firstVector = unionVector(previous, current);
    const middleVector = unionVector(current, next);
    const lastVector = unionVector(next, after);
    const firstTurn = firstVector.x * middleVector.y - firstVector.y * middleVector.x;
    const secondTurn = middleVector.x * lastVector.y - middleVector.y * lastVector.x;
    const middleLength = edgeLengths[index];
    const requestedRadius = Math.max(rawCornerInfos[index].radius, rawCornerInfos[nextIndex].radius);
    if (firstTurn * secondTurn >= 0 || middleLength <= 0 || requestedRadius <= middleLength) continue;

    const incomingLength = edgeLengths[(index - 1 + vertexCount) % vertexCount];
    const outgoingLength = edgeLengths[nextIndex];
    const transitionLength = Math.min(
      requestedRadius,
      Math.max(0, Math.min(incomingLength, outgoingLength) * 0.45),
    );
    if (transitionLength <= 0) continue;
    const start = pointToward(current, previous, transitionLength, incomingLength);
    const end = pointToward(next, after, transitionLength, outgoingLength);
    const handle = Math.min(
      Math.hypot(end.x - start.x, end.y - start.y) * (joinSquircle ? 0.42 : 0.552),
      transitionLength,
    );
    mergeCandidates.push({ index, endIndex: nextIndex, middleLength, start, end, handle, transitionLength });
  }

  const mergedTransitions = new Map<number, MergedTransition>();
  const mergedCorners = new Set<number>();
  for (const candidate of mergeCandidates.sort((left, right) => left.middleLength - right.middleLength)) {
    if (mergedCorners.has(candidate.index) || mergedCorners.has(candidate.endIndex)) continue;
    mergedTransitions.set(candidate.index, candidate);
    mergedCorners.add(candidate.index);
    mergedCorners.add(candidate.endIndex);
  }

  const overrideTangent = (values: number[], index: number, value: number): void => {
    values[index] = Math.min(values[index] || value, value);
  };
  for (const [index, transition] of mergedTransitions) {
    const nextIndex = transition.endIndex;
    overrideTangent(tangentIn, index, transition.transitionLength);
    overrideTangent(tangentOut, (index - 1 + vertexCount) % vertexCount, transition.transitionLength);
    overrideTangent(tangentOut, nextIndex, transition.transitionLength);
    overrideTangent(tangentIn, (nextIndex + 1) % vertexCount, transition.transitionLength);
  }

  const cornerEntryPoint = (index: number): UnionVertex => {
    const current = vertices[index];
    if (!isCornerRounded(index)) return current;
    const previousIndex = (index - 1 + vertexCount) % vertexCount;
    return pointToward(current, vertices[previousIndex], tangentIn[index], edgeLengths[previousIndex]);
  };

  const path = createSkiaPath();
  const skippedMergedCorners = new Set<number>();
  const appendCorner = (index: number, previous: UnionVertex, current: UnionVertex, next: UnionVertex): void => {
    if (skippedMergedCorners.has(index)) return;
    const merged = mergedTransitions.get(index);
    if (merged) {
      const incoming = unionVector(previous, current);
      const outgoing = unionVector(vertices[merged.endIndex], vertices[(merged.endIndex + 1) % vertexCount]);
      path.lineTo(merged.start.x, merged.start.y);
      appendCubicTransition(
        path,
        merged.start,
        { x: merged.start.x + incoming.x * merged.handle, y: merged.start.y + incoming.y * merged.handle },
        { x: merged.end.x - outgoing.x * merged.handle, y: merged.end.y - outgoing.y * merged.handle },
        merged.end,
      );
      skippedMergedCorners.add(merged.endIndex);
      return;
    }
    const info = cornerInfos[index];
    if (!isCornerRounded(index)) {
      path.lineTo(current.x, current.y);
      return;
    }
    const incomingLength = edgeLengths[(index - 1 + vertexCount) % vertexCount];
    const outgoingLength = edgeLengths[index];
    const start = pointToward(current, previous, tangentIn[index], incomingLength);
    const end = pointToward(current, next, tangentOut[index], outgoingLength);
    if (info.squircle) {
      path.lineTo(start.x, start.y);
      appendRoundedCorner(path, start.x, start.y, current.x, current.y, end.x, end.y, Math.min(tangentIn[index], tangentOut[index]), true);
    } else {
      path.lineTo(start.x, start.y);
      path.arcTo(current.x, current.y, end.x, end.y, Math.min(tangentIn[index], tangentOut[index]));
    }
  };

  const startPoint = cornerEntryPoint(0);
  path.moveTo(startPoint.x, startPoint.y);
  for (let index = 0; index < vertexCount; index += 1) {
    const previous = vertices[(index - 1 + vertexCount) % vertexCount];
    const current = vertices[index];
    const next = vertices[(index + 1) % vertexCount];
    appendCorner(index, previous, current, next);
  }
  path.closePath();
  return path;
}
