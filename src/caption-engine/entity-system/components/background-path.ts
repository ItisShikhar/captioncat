import { Path2D } from '#platform/canvas.js';

import { appendRoundedCorner, type SkiaPath2D } from '../../../utilities/canvas-utils';
import type { ResolvedTextDirection } from '../text-direction';
import type { Box } from '../types';

export const BACKGROUND_PATH_SHAPES = ['rounded', 'pill', 'iMessage', 'ticket', 'cloud', 'comicBook'] as const;
export const BACKGROUND_PATH_TAIL_SIDES = ['auto', 'left', 'right'] as const;

export type BackgroundPathShape = (typeof BACKGROUND_PATH_SHAPES)[number];
export type BackgroundPathTailSide = (typeof BACKGROUND_PATH_TAIL_SIDES)[number];

// These ratios preserve the supplied blue SVG bubble while fitting any resolved box.
const IMESSAGE_GEOMETRY = {
  cornerRadiusRatio: 19.6526 / 59.0106,
  tailWidthRatio: (9.66391 - 1.38911) / 19.6526,
  tailStartFromBottom: (83.8457 - 55.4011) / 19.6526,
  tailTurnFromBottom: (83.8457 - 64.1931) / 19.6526,
  tail: {
    firstControl1X: (24.5575 - 9.66391) / 19.6526,
    firstControl2X: (20.1936 - 9.66391) / 19.6526,
    firstEndX: (16.7932 - 9.66391) / 19.6526,
    firstControl2FromBottom: (83.8457 - 82.1542) / 19.6526,
    firstEndFromBottom: (83.8457 - 79.3395) / 19.6526,
    secondControl1X: (13.4008 - 9.66391) / 19.6526,
    secondControl2X: (7.96114 - 9.66391) / 19.6526,
    secondControl1FromBottom: (83.8457 - 81.5995) / 19.6526,
    secondEndFromBottom: (83.8457 - 82.5528) / 19.6526,
    outerControl1X: (3.19922 - 9.66391) / 19.6526,
    outerControl1FromBottom: (83.8457 - 81.777) / 19.6526,
    outerControl2X: (10.1811 - 9.66391) / 19.6526,
    outerControl2FromBottom: (83.8457 - 77.1225) / 19.6526,
    outerEndX: (9.92249 - 9.66391) / 19.6526,
    outerEndFromBottom: (83.8457 - 67.8133) / 19.6526,
    returnControl1X: (9.95387 - 9.66391) / 19.6526,
    returnControl1FromBottom: (83.8457 - 67.8565) / 19.6526,
    returnControl2X: (9.9866 - 9.66391) / 19.6526,
    returnControl2FromBottom: (83.8457 - 67.8986) / 19.6526,
    returnEndX: (10.0206 - 9.66391) / 19.6526,
    returnEndFromBottom: (83.8457 - 67.9398) / 19.6526,
    attachControl1X: (9.78652 - 9.66391) / 19.6526,
    attachControl1FromBottom: (83.8457 - 66.727) / 19.6526,
    attachControl2FromBottom: (83.8457 - 65.4743) / 19.6526,
  },
  quarterCurveRatio: 0.5522847498,
} as const;

interface PathBuilder {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void;
  closePath(): void;
}

function createPath(): PathBuilder {
  return new Path2D() as unknown as PathBuilder;
}

function isBackgroundPathShape(value: unknown): value is BackgroundPathShape {
  return (BACKGROUND_PATH_SHAPES as readonly string[]).includes(value as string);
}

function isBackgroundPathTailSide(value: unknown): value is BackgroundPathTailSide {
  return (BACKGROUND_PATH_TAIL_SIDES as readonly string[]).includes(value as string);
}

export function normalizeBackgroundPathShape(value: unknown): BackgroundPathShape {
  return isBackgroundPathShape(value) ? value : 'rounded';
}

export function normalizeBackgroundPathTailSide(value: unknown): BackgroundPathTailSide {
  return isBackgroundPathTailSide(value) ? value : 'auto';
}

export function normalizeBackgroundPathTailSize(value: unknown): number {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(4, Math.max(0, numeric));
}

function roundedRectangle(path: PathBuilder, box: Box, radius: number, squircle = false): void {
  const safeRadius = Math.max(0, Math.min(radius, box.width / 2, box.height / 2));
  const right = box.x + box.width;
  const bottom = box.y + box.height;

  path.moveTo(box.x + safeRadius, box.y);
  path.lineTo(right - safeRadius, box.y);
  appendRoundedCorner(path, right - safeRadius, box.y, right, box.y, right, box.y + safeRadius, safeRadius, squircle);
  path.lineTo(right, bottom - safeRadius);
  appendRoundedCorner(path, right, bottom - safeRadius, right, bottom, right - safeRadius, bottom, safeRadius, squircle);
  path.lineTo(box.x + safeRadius, bottom);
  appendRoundedCorner(path, box.x + safeRadius, bottom, box.x, bottom, box.x, bottom - safeRadius, safeRadius, squircle);
  path.lineTo(box.x, box.y + safeRadius);
  appendRoundedCorner(path, box.x, box.y + safeRadius, box.x, box.y, box.x + safeRadius, box.y, safeRadius, squircle);
  path.closePath();
}

function mirrorX(x: number, box: Box): number {
  return box.x + box.width - (x - box.x);
}

function mirroredPath(path: PathBuilder, box: Box): PathBuilder {
  return {
    moveTo: (x, y) => path.moveTo(mirrorX(x, box), y),
    lineTo: (x, y) => path.lineTo(mirrorX(x, box), y),
    arc: (x, y, radius, startAngle, endAngle, counterclockwise) =>
      path.arc(
        mirrorX(x, box),
        y,
        radius,
        Math.PI - startAngle,
        Math.PI - endAngle,
        !counterclockwise,
      ),
    arcTo: (x1, y1, x2, y2, radius) => path.arcTo(mirrorX(x1, box), y1, mirrorX(x2, box), y2, radius),
    quadraticCurveTo: (cpx, cpy, x, y) => path.quadraticCurveTo(mirrorX(cpx, box), cpy, mirrorX(x, box), y),
    bezierCurveTo: (cp1x, cp1y, cp2x, cp2y, x, y) =>
      path.bezierCurveTo(mirrorX(cp1x, box), cp1y, mirrorX(cp2x, box), cp2y, mirrorX(x, box), y),
    closePath: () => path.closePath(),
  };
}

function iMessageLeft(path: PathBuilder, box: Box, tailSize: unknown): void {
  const scale = normalizeBackgroundPathTailSize(tailSize);
  const radius = Math.min(box.height * IMESSAGE_GEOMETRY.cornerRadiusRatio, box.width / 3);
  if (radius <= 0) return;
  if (scale <= 0) {
    roundedRectangle(path, box, radius);
    return;
  }

  const referenceTailWidth = radius * IMESSAGE_GEOMETRY.tailWidthRatio;
  const tailWidth = Math.min(referenceTailWidth * scale, box.width * 0.25);
  if (tailWidth <= 0) {
    roundedRectangle(path, box, radius);
    return;
  }

  const tailDepth = Math.min(
    box.height - radius,
    radius * IMESSAGE_GEOMETRY.tailStartFromBottom * scale,
  );
  const verticalScale = tailDepth / (radius * IMESSAGE_GEOMETRY.tailStartFromBottom);
  const horizontalScale = tailWidth / referenceTailWidth;
  const left = box.x;
  const top = box.y;
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  const bodyLeft = left + tailWidth;
  const bodyTopLeft = bodyLeft + radius;
  const bodyTopRight = right - radius;
  const tailStart = bottom - tailDepth;
  const tailTurn = bottom - radius * IMESSAGE_GEOMETRY.tailTurnFromBottom * verticalScale;
  const tailX = (ratio: number): number => bodyLeft + radius * ratio * horizontalScale;
  const tailY = (ratio: number): number => bottom - radius * ratio * verticalScale;
  const quarterControl = IMESSAGE_GEOMETRY.quarterCurveRatio;

  path.moveTo(bodyTopLeft, top);
  path.lineTo(bodyTopRight, top);
  path.bezierCurveTo(
    bodyTopRight + radius * quarterControl,
    top,
    right,
    top + radius * (1 - quarterControl),
    right,
    top + radius,
  );
  path.lineTo(right, bottom - radius);
  path.bezierCurveTo(
    right,
    bottom - radius * (1 - quarterControl),
    bodyTopRight + radius * quarterControl,
    bottom,
    bodyTopRight,
    bottom,
  );
  path.lineTo(bodyTopLeft, bottom);
  path.bezierCurveTo(
    tailX(IMESSAGE_GEOMETRY.tail.firstControl1X),
    bottom,
    tailX(IMESSAGE_GEOMETRY.tail.firstControl2X),
    tailY(IMESSAGE_GEOMETRY.tail.firstControl2FromBottom),
    tailX(IMESSAGE_GEOMETRY.tail.firstEndX),
    tailY(IMESSAGE_GEOMETRY.tail.firstEndFromBottom),
  );
  path.bezierCurveTo(
    tailX(IMESSAGE_GEOMETRY.tail.secondControl1X),
    tailY(IMESSAGE_GEOMETRY.tail.secondControl1FromBottom),
    tailX(IMESSAGE_GEOMETRY.tail.secondControl2X),
    tailY(IMESSAGE_GEOMETRY.tail.secondEndFromBottom),
    left,
    tailY(IMESSAGE_GEOMETRY.tail.secondEndFromBottom),
  );
  path.bezierCurveTo(
    tailX(IMESSAGE_GEOMETRY.tail.outerControl1X),
    tailY(IMESSAGE_GEOMETRY.tail.outerControl1FromBottom),
    tailX(IMESSAGE_GEOMETRY.tail.outerControl2X),
    tailY(IMESSAGE_GEOMETRY.tail.outerControl2FromBottom),
    tailX(IMESSAGE_GEOMETRY.tail.outerEndX),
    tailY(IMESSAGE_GEOMETRY.tail.outerEndFromBottom),
  );
  path.bezierCurveTo(
    tailX(IMESSAGE_GEOMETRY.tail.returnControl1X),
    tailY(IMESSAGE_GEOMETRY.tail.returnControl1FromBottom),
    tailX(IMESSAGE_GEOMETRY.tail.returnControl2X),
    tailY(IMESSAGE_GEOMETRY.tail.returnControl2FromBottom),
    tailX(IMESSAGE_GEOMETRY.tail.returnEndX),
    tailY(IMESSAGE_GEOMETRY.tail.returnEndFromBottom),
  );
  path.bezierCurveTo(
    tailX(IMESSAGE_GEOMETRY.tail.attachControl1X),
    tailY(IMESSAGE_GEOMETRY.tail.attachControl1FromBottom),
    bodyLeft,
    tailY(IMESSAGE_GEOMETRY.tail.attachControl2FromBottom),
    bodyLeft,
    tailTurn,
  );
  path.lineTo(bodyLeft, tailStart);
  path.lineTo(bodyLeft, top + radius);
  path.bezierCurveTo(
    bodyLeft,
    top + radius * (1 - quarterControl),
    bodyTopLeft - radius * quarterControl,
    top,
    bodyTopLeft,
    top,
  );
  path.closePath();
}

function iMessage(path: PathBuilder, box: Box, tailSide: 'left' | 'right', tailSize: unknown): void {
  const sidePath = tailSide === 'left' ? path : mirroredPath(path, box);
  iMessageLeft(sidePath, box, tailSize);
}

function ticket(path: PathBuilder, box: Box): void {
  const radius = Math.min(box.width, box.height) * 0.12;
  const notch = Math.min(box.width, box.height) * 0.12;
  const middle = box.y + box.height / 2;
  const right = box.x + box.width;
  const bottom = box.y + box.height;

  path.moveTo(box.x + radius, box.y);
  path.lineTo(right - radius, box.y);
  path.arcTo(right, box.y, right, box.y + radius, radius);
  path.lineTo(right, middle - notch);
  path.quadraticCurveTo(right - notch, middle, right, middle + notch);
  path.lineTo(right, bottom - radius);
  path.arcTo(right, bottom, right - radius, bottom, radius);
  path.lineTo(box.x + radius, bottom);
  path.arcTo(box.x, bottom, box.x, bottom - radius, radius);
  path.lineTo(box.x, middle + notch);
  path.quadraticCurveTo(box.x + notch, middle, box.x, middle - notch);
  path.lineTo(box.x, box.y + radius);
  path.arcTo(box.x, box.y, box.x + radius, box.y, radius);
  path.closePath();
}

function cloud(path: PathBuilder, box: Box): void {
  const x = box.x;
  const y = box.y;
  const width = box.width;
  const height = box.height;

  path.moveTo(x + width * 0.22, y + height * 0.78);
  path.bezierCurveTo(x + width * 0.08, y + height * 0.78, x + width * 0.04, y + height * 0.68, x + width * 0.1, y + height * 0.58);
  path.bezierCurveTo(x + width * 0.04, y + height * 0.48, x + width * 0.12, y + height * 0.34, x + width * 0.27, y + height * 0.37);
  path.bezierCurveTo(x + width * 0.3, y + height * 0.18, x + width * 0.45, y + height * 0.1, x + width * 0.57, y + height * 0.22);
  path.bezierCurveTo(x + width * 0.72, y + height * 0.1, x + width * 0.9, y + height * 0.2, x + width * 0.88, y + height * 0.38);
  path.bezierCurveTo(x + width * 0.98, y + height * 0.44, x + width * 0.96, y + height * 0.64, x + width * 0.82, y + height * 0.65);
  path.bezierCurveTo(x + width * 0.78, y + height * 0.82, x + width * 0.62, y + height * 0.86, x + width * 0.5, y + height * 0.76);
  path.bezierCurveTo(x + width * 0.42, y + height * 0.88, x + width * 0.27, y + height * 0.9, x + width * 0.22, y + height * 0.78);
  path.closePath();
}

function comicBook(path: PathBuilder, box: Box): void {
  const pointCount = 16;
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const radiusX = box.width / 2;
  const radiusY = box.height / 2;
  const innerRadiusX = radiusX * 0.78;
  const innerRadiusY = radiusY * 0.78;

  for (let index = 0; index < pointCount * 2; index += 1) {
    const angle = -Math.PI / 2 + (index * Math.PI) / pointCount;
    const isOuterPoint = index % 2 === 0;
    const xRadius = isOuterPoint ? radiusX : innerRadiusX;
    const yRadius = isOuterPoint ? radiusY : innerRadiusY;
    const x = centerX + Math.cos(angle) * xRadius;
    const y = centerY + Math.sin(angle) * yRadius;
    if (index === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.closePath();
}

function resolvedTailSide(value: unknown, textDirection: ResolvedTextDirection): 'left' | 'right' {
  const normalized = normalizeBackgroundPathTailSide(value);
  if (normalized === 'left' || normalized === 'right') return normalized;
  return textDirection === 'rtl' ? 'right' : 'left';
}

/**
 * Build a procedural path in the supplied bounds. `rounded` returns undefined
 * so the caller can keep using the existing BorderRadius geometry.
 */
export function createBackgroundPath(
  box: Box,
  shape: unknown,
  tailSide: unknown,
  textDirection: ResolvedTextDirection,
  tailSize: unknown = 1,
  cornerSmoothing = false,
): SkiaPath2D | undefined {
  const normalizedShape = normalizeBackgroundPathShape(shape);
  if (normalizedShape === 'rounded' || box.width <= 0 || box.height <= 0) return undefined;

  const path = createPath();
  switch (normalizedShape) {
    case 'pill':
      roundedRectangle(path, box, Math.min(box.width, box.height) / 2, cornerSmoothing);
      break;
    case 'iMessage':
      iMessage(path, box, resolvedTailSide(tailSide, textDirection), tailSize);
      break;
    case 'ticket':
      ticket(path, box);
      break;
    case 'cloud':
      cloud(path, box);
      break;
    case 'comicBook':
      comicBook(path, box);
      break;
  }
  return path as unknown as SkiaPath2D;
}
