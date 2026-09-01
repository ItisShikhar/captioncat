import { Canvas } from '#platform/canvas.js';
import { createCanvasPoolScope, type CanvasPoolScope } from '../../../utilities/canvas-pool';
import type { CanvasContext2D } from '../types';
import type { BoxStrokeStyle } from './box-stroke-utils';

const OUTLINE_ANTIALIAS_BLUR = 0.75;

/** Draws an alpha outline around a previously rendered layer. */
export function drawImageOutline(ctx: CanvasContext2D, input: Canvas, style: BoxStrokeStyle | undefined, scale = 1): void {
  if (!style || style.width <= 0) return;

  const position = style.position ?? 'center';
  const rasterWidth = style.width * (Number.isFinite(scale) && scale > 0 ? scale : 1);
  const radius = Math.max(1, Math.ceil(rasterWidth * (position === 'center' ? 0.5 : 1)));
  const canvasScope = createCanvasPoolScope();
  try {
    const outline = createAntialiasedOutline(input, radius, position, canvasScope);
    const outlineCtx = outline.getContext('2d');
    outlineCtx.globalCompositeOperation = 'source-in';
    outlineCtx.fillStyle = style.color;
    outlineCtx.fillRect(0, 0, outline.width, outline.height);
    ctx.drawImage(outline, 0, 0);
  } finally {
    canvasScope.releaseAll();
  }
}

function createAntialiasedOutline(
  input: Canvas,
  radius: number,
  position: 'inner' | 'center' | 'outer',
  canvasScope: CanvasPoolScope,
): Canvas {
  const outline = position === 'inner'
    ? createInnerOutline(input, radius, canvasScope)
    : createOuterOrCenterOutline(input, radius, position === 'center', canvasScope);
  const antialiased = canvasScope.acquire(input.width, input.height);
  const context = antialiased.getContext('2d');
  context.filter = `blur(${OUTLINE_ANTIALIAS_BLUR}px)`;
  context.drawImage(outline, 0, 0);
  return antialiased;
}

function createOuterOrCenterOutline(
  input: Canvas,
  radius: number,
  includeInnerEdge: boolean,
  canvasScope: CanvasPoolScope,
): Canvas {
  const outline = dilateAlpha(input, radius, canvasScope);
  outline.getContext('2d').globalCompositeOperation = 'destination-out';
  outline.getContext('2d').drawImage(
    includeInnerEdge ? erodeAlpha(input, radius, canvasScope) : input,
    0,
    0,
  );
  return outline;
}

function createInnerOutline(input: Canvas, radius: number, canvasScope: CanvasPoolScope): Canvas {
  const outline = canvasScope.acquire(input.width, input.height);
  const outlineContext = outline.getContext('2d');
  outlineContext.drawImage(input, 0, 0);
  outlineContext.globalCompositeOperation = 'destination-out';
  outlineContext.drawImage(erodeAlpha(input, radius, canvasScope), 0, 0);
  return outline;
}

function dilateAlpha(input: Canvas, radius: number, canvasScope: CanvasPoolScope): Canvas {
  const output = canvasScope.acquire(input.width, input.height);
  const outputContext = output.getContext('2d');
  forEachCircleOffset(radius, (x, y) => {
    outputContext.drawImage(input, x, y);
  });
  return output;
}

function erodeAlpha(input: Canvas, radius: number, canvasScope: CanvasPoolScope): Canvas {
  const output = canvasScope.acquire(input.width, input.height);
  const outputContext = output.getContext('2d');
  outputContext.drawImage(input, 0, 0);
  outputContext.globalCompositeOperation = 'destination-in';
  forEachCircleOffset(radius, (x, y) => {
    outputContext.drawImage(input, x, y);
  });
  return output;
}

function forEachCircleOffset(radius: number, callback: (x: number, y: number) => void): void {
  for (let x = -radius; x <= radius; x += 1) {
    for (let y = -radius; y <= radius; y += 1) {
      if (x * x + y * y <= radius * radius) callback(x, y);
    }
  }
}
