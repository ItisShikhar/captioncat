import { Canvas, ImageData } from '#platform/canvas.js';
import { acquireCanvas } from '../../../utilities/canvas-pool';
import type { Margins, ResolveContext } from '../types';
import { clampColor } from './pixel-utils';
import type { EffectSource } from './effect';
import { SignalEffect, resolveSignalAmount } from './signal-effect';

const DEFAULT_MODE: FisheyeMode = 'concave';
const DEFAULT_DISTORTION = 0;
const DEFAULT_ZOOM = 1;
const DEFAULT_LENS_CENTER = { x: 0.5, y: 0.5 };
const DEFAULT_EDGE_MODE: FisheyeEdgeMode = 'transparent';
const DEFAULT_ASPECT_CORRECTION = true;
const CONCAVE_SCALE = 0.9;
const CONVEX_SCALE = 0.85;
const MAX_CROP_ZOOM = 8;

type FisheyeMode = 'concave' | 'convex';
type FisheyeEdgeMode = 'transparent' | 'clamp' | 'crop';

interface FisheyeSettings {
  mode: FisheyeMode;
  distortion: number;
  zoom: number;
  lensCenter: { x: number; y: number };
  edgeMode: FisheyeEdgeMode;
  aspectCorrection: boolean;
}

interface RgbColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export class FisheyeEffect extends SignalEffect {
  readonly type = 'fisheye';

  override getMargins(ctx: ResolveContext, source?: EffectSource): Margins {
    if (!source?.bounds) return { x: 0, y: 0 };
    const mode = resolveMode(this.getProp<string>('mode')?.resolve(ctx));
    const distortion = resolveSignalAmount(this, 'distortion', ctx, DEFAULT_DISTORTION);
    const zoom = resolveZoom(this.getProp<number>('zoom')?.resolve(ctx));
    const minimumRadialScale = mode === 'convex' ? Math.max(1 - CONVEX_SCALE * distortion, 0.15) : 1;
    const visualScale = zoom / minimumRadialScale;
    return {
      x: Math.max(0, (source.bounds.width * (visualScale - 1)) / 2),
      y: Math.max(0, (source.bounds.height * (visualScale - 1)) / 2),
    };
  }

  protected process(sourceCanvas: Canvas, rctx: ResolveContext): Canvas {
    const settings = this.resolveSettings(rctx);
    const width = sourceCanvas.width;
    const height = sourceCanvas.height;
    const sourcePixels = sourceCanvas.getContext('2d').getImageData(0, 0, width, height).data;
    const outputPixels = new Uint8ClampedArray(sourcePixels.length);
    const cropZoom = settings.edgeMode === 'crop' ? cropZoomFor(width, height, settings) : 1;
    const zoom = settings.zoom * cropZoom;
    const maxRadius = maxLensRadius(width, height, settings);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const outputUv = {
          x: width > 1 ? x / (width - 1) : 0,
          y: height > 1 ? y / (height - 1) : 0,
        };
        const sourceUv = mapOutputToSourceUv(outputUv, width, height, settings, zoom, maxRadius);
        const sourceColor = sampleSourceColor(sourcePixels, width, height, sourceUv, settings.edgeMode);
        const outputIndex = (y * width + x) * 4;

        outputPixels[outputIndex] = clampColor(sourceColor.r);
        outputPixels[outputIndex + 1] = clampColor(sourceColor.g);
        outputPixels[outputIndex + 2] = clampColor(sourceColor.b);
        outputPixels[outputIndex + 3] = sourceColor.a;
      }
    }

    const output = acquireCanvas(width, height);
    output.getContext('2d').putImageData(new ImageData(outputPixels, width, height), 0, 0);
    return output;
  }

  private resolveSettings(rctx: ResolveContext): FisheyeSettings {
    return {
      mode: resolveMode(this.getProp<string>('mode')?.resolve(rctx)),
      distortion: resolveSignalAmount(this, 'distortion', rctx, DEFAULT_DISTORTION),
      zoom: resolveZoom(this.getProp<number>('zoom')?.resolve(rctx)),
      lensCenter: resolveLensCenter(this.getProp<{ x: number; y: number }>('lensCenter')?.resolve(rctx)),
      edgeMode: resolveEdgeMode(this.getProp<string>('edgeMode')?.resolve(rctx)),
      aspectCorrection: this.getProp<boolean>('aspectCorrection')?.resolve(rctx) ?? DEFAULT_ASPECT_CORRECTION,
    };
  }
}

function resolveMode(value: string | undefined): FisheyeMode {
  return value === 'convex' ? 'convex' : DEFAULT_MODE;
}

function resolveZoom(value: number | undefined): number {
  const zoom = Number(value ?? DEFAULT_ZOOM);
  return Number.isFinite(zoom) ? Math.max(0.01, zoom) : DEFAULT_ZOOM;
}

function resolveLensCenter(value: { x: number; y: number } | undefined): { x: number; y: number } {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return DEFAULT_LENS_CENTER;
  return {
    x: Math.min(1, Math.max(0, value.x)),
    y: Math.min(1, Math.max(0, value.y)),
  };
}

function resolveEdgeMode(value: string | undefined): FisheyeEdgeMode {
  return value === 'transparent' || value === 'clamp' || value === 'crop' ? value : DEFAULT_EDGE_MODE;
}

function mapOutputToSourceUv(
  outputUv: { x: number; y: number },
  width: number,
  height: number,
  settings: FisheyeSettings,
  zoom: number,
  maxRadius: number,
): { x: number; y: number } {
  const aspect = aspectScale(width, height, settings);
  const offset = {
    x: (outputUv.x - settings.lensCenter.x) * aspect,
    y: outputUv.y - settings.lensCenter.y,
  };
  const radius = Math.hypot(offset.x, offset.y);
  if (radius === 0) return settings.lensCenter;

  const radialScale =
    settings.mode === 'convex'
      ? Math.max(0, 1 - CONVEX_SCALE * settings.distortion * Math.min(1, radius / maxRadius) ** 2)
      : 1 + (1 + radius * radius * settings.distortion * CONCAVE_SCALE) * radius * radius * settings.distortion * CONCAVE_SCALE;
  const sourceRadius = (radius * radialScale) / zoom;
  return {
    x: settings.lensCenter.x + (offset.x / radius) * (sourceRadius / aspect),
    y: settings.lensCenter.y + (offset.y / radius) * sourceRadius,
  };
}

function lensRadius(outputUv: { x: number; y: number }, settings: FisheyeSettings, width: number, height: number): number {
  const aspect = aspectScale(width, height, settings);
  return Math.hypot((outputUv.x - settings.lensCenter.x) * aspect, outputUv.y - settings.lensCenter.y);
}

function maxLensRadius(width: number, height: number, settings: FisheyeSettings): number {
  let maximum = 0;
  for (const x of [0, 1]) {
    for (const y of [0, 1]) {
      maximum = Math.max(maximum, lensRadius({ x, y }, settings, width, height));
    }
  }
  return Math.max(0.0001, maximum);
}

function aspectScale(width: number, height: number, settings: FisheyeSettings): number {
  return settings.aspectCorrection && height > 0 ? width / height : 1;
}

function cropZoomFor(width: number, height: number, settings: FisheyeSettings): number {
  const maxRadius = maxLensRadius(width, height, settings);
  let requiredZoom = 1;
  for (let y = 0; y <= 1; y += 0.125) {
    for (let x = 0; x <= 1; x += 0.125) {
      const sourceUv = mapOutputToSourceUv({ x, y }, width, height, settings, 1, maxRadius);
      requiredZoom = Math.max(requiredZoom, zoomNeededForCoordinate(sourceUv.x, settings.lensCenter.x));
      requiredZoom = Math.max(requiredZoom, zoomNeededForCoordinate(sourceUv.y, settings.lensCenter.y));
    }
  }
  return Math.min(MAX_CROP_ZOOM, requiredZoom);
}

function zoomNeededForCoordinate(coordinate: number, center: number): number {
  const distance = Math.abs(coordinate - center);
  const available = coordinate >= center ? 1 - center : center;
  return available > 0 ? distance / available : 1;
}

function sampleSourceColor(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  uv: { x: number; y: number },
  edgeMode: FisheyeEdgeMode,
): RgbColor {
  const outside = uv.x < 0 || uv.x > 1 || uv.y < 0 || uv.y > 1;
  if (outside && edgeMode === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };

  const sourceX = Math.min(1, Math.max(0, uv.x)) * Math.max(1, width - 1);
  const sourceY = Math.min(1, Math.max(0, uv.y)) * Math.max(1, height - 1);
  return {
    r: sampleChannel(pixels, width, height, sourceX, sourceY, 0),
    g: sampleChannel(pixels, width, height, sourceX, sourceY, 1),
    b: sampleChannel(pixels, width, height, sourceX, sourceY, 2),
    a: sampleChannel(pixels, width, height, sourceX, sourceY, 3),
  };
}

function sampleChannel(pixels: Uint8ClampedArray, width: number, height: number, x: number, y: number, channel: number): number {
  const left = Math.floor(x);
  const top = Math.floor(y);
  const right = Math.min(width - 1, left + 1);
  const bottom = Math.min(height - 1, top + 1);
  const horizontalProgress = x - left;
  const verticalProgress = y - top;
  const topLeft = pixels[(top * width + left) * 4 + channel];
  const topRight = pixels[(top * width + right) * 4 + channel];
  const bottomLeft = pixels[(bottom * width + left) * 4 + channel];
  const bottomRight = pixels[(bottom * width + right) * 4 + channel];
  const topValue = topLeft + (topRight - topLeft) * horizontalProgress;
  const bottomValue = bottomLeft + (bottomRight - bottomLeft) * horizontalProgress;
  return topValue + (bottomValue - topValue) * verticalProgress;
}
