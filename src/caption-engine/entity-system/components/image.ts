import { Canvas } from '#platform/canvas.js';
import { acquireCanvas, releaseCanvas } from '../../../utilities/canvas-pool';

import { BorderEffect, ShadowEffect, StrokeEffect, type Effect, type EffectSource } from '../effects';
import { renderLayeredEffectStack, renderWrappedEffect } from '../effects/effect-stack';
import {
  DEFAULT_BUNDLED_IMAGE_ASSET,
  isBuiltinImageAsset,
  normalizeImageAssetSource,
  resolveImageAsset,
} from '#platform/image-assets.js';
import { resolvePaint, solidPaint, type Paint } from '../paint';
import { staticProperty, type Property } from '../property';
import { type Box, type CanvasContext2D, type PaintOwner, type ResolveContext, zeroMargins } from '../types';
import { builtinImageGlyph, loadedImageAsset } from '../assets';
import { Component } from './component';
import {
  DEFAULT_IMAGE_COLOR,
  imageAspectRatioValue,
  normalizeImageCustomAspectRatio,
  IMAGE_COLOR_MODES,
  normalizeImageAspectRatio,
  normalizeImageRenderOrder,
  type ImageAspectRatio,
  type ImageCustomAspectRatio,
  type ImageColorMode,
  type ImageRenderOrder,
} from './image-style';

function normalizeImageColorMode(value: unknown): ImageColorMode {
  return (IMAGE_COLOR_MODES as readonly string[]).includes(value as string) ? (value as ImageColorMode) : 'tint';
}

function imageDrawBounds(
  box: Box,
  image: NonNullable<ReturnType<typeof loadedImageAsset>>,
  aspectRatio: ImageAspectRatio,
  customAspectRatio: number | undefined,
): Box {
  const bounds: Box = {
    x: -box.width / 2,
    y: -box.height / 2,
    width: box.width,
    height: box.height,
  };
  if (aspectRatio === 'stretchToFit') return bounds;

  const sourceWidth = Number(image.width);
  const sourceHeight = Number(image.height);
  const sourceRatio = sourceWidth > 0 && sourceHeight > 0 ? sourceWidth / sourceHeight : undefined;
  const targetRatio = aspectRatio === 'custom' ? customAspectRatio ?? sourceRatio : sourceRatio;
  if (!targetRatio || !(box.width > 0) || !(box.height > 0)) return bounds;

  if (box.width / box.height > targetRatio) {
    const width = box.height * targetRatio;
    return { x: -width / 2, y: -box.height / 2, width, height: box.height };
  }

  const height = box.width / targetRatio;
  return { x: -box.width / 2, y: -height / 2, width: box.width, height };
}

function drawImageWithHighQuality(
  output: CanvasContext2D,
  image: NonNullable<ReturnType<typeof loadedImageAsset>> | Canvas,
  bounds: Box,
): void {
  output.save();
  output.imageSmoothingEnabled = true;
  output.imageSmoothingQuality = 'high';
  output.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height);
  output.restore();
}

function drawImageWithSupersampling(
  output: CanvasContext2D,
  image: NonNullable<ReturnType<typeof loadedImageAsset>>,
  bounds: Box,
  scale: number,
): void {
  if (scale <= 1) {
    drawImageWithHighQuality(output, image, bounds);
    return;
  }

  const width = Math.max(1, Math.ceil(bounds.width * scale));
  const height = Math.max(1, Math.ceil(bounds.height * scale));
  const rasterCanvas = acquireCanvas(width, height);
  try {
    const rasterContext = rasterCanvas.getContext('2d');
    rasterContext.imageSmoothingEnabled = true;
    rasterContext.imageSmoothingQuality = 'high';
    rasterContext.drawImage(image, 0, 0, width, height);
    drawImageWithHighQuality(output, rasterCanvas, bounds);
  } finally {
    releaseCanvas(rasterCanvas);
  }
}

function drawTintedImage(
  output: CanvasContext2D,
  image: NonNullable<ReturnType<typeof loadedImageAsset>>,
  bounds: Box,
  paint: Paint,
  scale: number,
): void {
  const tintCanvas = acquireCanvas(
    Math.max(1, Math.ceil(bounds.width * scale)),
    Math.max(1, Math.ceil(bounds.height * scale)),
  );
  try {
    const tintContext = tintCanvas.getContext('2d');
    const tintBounds: Box = {
      x: 0,
      y: 0,
      width: tintCanvas.width,
      height: tintCanvas.height,
    };

    tintContext.imageSmoothingEnabled = true;
    tintContext.imageSmoothingQuality = 'high';
    tintContext.drawImage(image, tintBounds.x, tintBounds.y, tintBounds.width, tintBounds.height);
    tintContext.globalCompositeOperation = 'multiply';
    tintContext.fillStyle = resolvePaint(tintContext, paint, tintBounds);
    tintContext.fillRect(tintBounds.x, tintBounds.y, tintBounds.width, tintBounds.height);
    tintContext.globalCompositeOperation = 'destination-in';
    tintContext.drawImage(image, tintBounds.x, tintBounds.y, tintBounds.width, tintBounds.height);
    drawImageWithHighQuality(output, tintCanvas, bounds);
  } finally {
    releaseCanvas(tintCanvas);
  }
}

function drawSolidImage(
  output: CanvasContext2D,
  image: NonNullable<ReturnType<typeof loadedImageAsset>>,
  bounds: Box,
  paint: Paint,
  scale: number,
): void {
  const solidCanvas = acquireCanvas(
    Math.max(1, Math.ceil(bounds.width * scale)),
    Math.max(1, Math.ceil(bounds.height * scale)),
  );
  try {
    const solidContext = solidCanvas.getContext('2d');
    const solidBounds: Box = {
      x: 0,
      y: 0,
      width: solidCanvas.width,
      height: solidCanvas.height,
    };

    solidContext.imageSmoothingEnabled = true;
    solidContext.imageSmoothingQuality = 'high';
    solidContext.drawImage(image, solidBounds.x, solidBounds.y, solidBounds.width, solidBounds.height);
    solidContext.globalCompositeOperation = 'source-in';
    solidContext.fillStyle = resolvePaint(solidContext, paint, solidBounds);
    solidContext.fillRect(solidBounds.x, solidBounds.y, solidBounds.width, solidBounds.height);
    drawImageWithHighQuality(output, solidCanvas, bounds);
  } finally {
    releaseCanvas(solidCanvas);
  }
}

export class Image extends Component {
  readonly type = 'image';
  override readonly allowedEntities = ['viewport', 'videoArea', 'video', 'compositionArea', 'page', 'row', 'word', 'marker', 'image'];
  override readonly allowedQuantity = 1;
  override readonly allowDisable = true;

  constructor(props?: Map<string, Property<unknown>>, components?: Component[], effects?: Effect[]) {
    super(props, components, effects);
    if (!this.props.has('enabled')) this.props.set('enabled', staticProperty('boolean', true));
    if (!this.props.has('asset')) this.props.set('asset', staticProperty('string', DEFAULT_BUNDLED_IMAGE_ASSET));
    const authoredAspectRatio = this.props.get('aspectRatio')?.base;
    if (!this.props.has('aspectRatio')) this.props.set('aspectRatio', staticProperty('string', 'maintain'));
    if (!this.props.has('customAspectRatio')) {
      this.props.set('customAspectRatio', staticProperty('string', normalizeImageCustomAspectRatio(authoredAspectRatio)));
    }
    if (!this.props.has('renderOrder')) this.props.set('renderOrder', staticProperty('string', 'belowChildren'));
    if (!this.props.has('colorMode')) this.props.set('colorMode', staticProperty('string', 'tint'));
    if (!this.props.has('color')) this.props.set('color', staticProperty('paint', solidPaint(DEFAULT_IMAGE_COLOR)));

    const bundledAsset = this.props.get('asset')?.base;
    const source = normalizeImageAssetSource(this.props.get('assetSource')?.base, bundledAsset);
    if (!this.props.has('assetSource')) this.props.set('assetSource', staticProperty('string', source));
    if (source === 'custom' && !this.props.has('customAsset') && typeof bundledAsset === 'string' && !isBuiltinImageAsset(bundledAsset)) {
      this.props.set('customAsset', staticProperty('string', bundledAsset));
    }
  }

  asset(rctx: ResolveContext): string {
    return resolveImageAsset(
      this.getProp<string>('assetSource')?.resolve(rctx),
      this.getProp<string>('asset')?.resolve(rctx),
      this.getProp<string>('customAsset')?.resolve(rctx),
    );
  }

  color(rctx: ResolveContext): Paint {
    return this.getProp<Paint>('color')?.resolve(rctx) ?? solidPaint(DEFAULT_IMAGE_COLOR);
  }

  colorMode(rctx: ResolveContext): ImageColorMode {
    return normalizeImageColorMode(this.getProp<string>('colorMode')?.resolve(rctx));
  }

  aspectRatioMode(rctx: ResolveContext): ImageAspectRatio {
    return normalizeImageAspectRatio(this.getProp<string>('aspectRatio')?.resolve(rctx));
  }

  customAspectRatio(rctx: ResolveContext): ImageCustomAspectRatio {
    const rawAspectRatio = this.getProp<string>('aspectRatio')?.resolve(rctx);
    const customAspectRatio = this.getProp<string>('customAspectRatio')?.resolve(rctx);
    return normalizeImageCustomAspectRatio(
      customAspectRatio ?? (normalizeImageAspectRatio(rawAspectRatio) === 'custom' ? rawAspectRatio : undefined),
    );
  }

  aspectRatio(rctx: ResolveContext): number | undefined {
    return imageAspectRatioValue(this.getProp<string>('aspectRatio')?.resolve(rctx), this.customAspectRatio(rctx));
  }

  renderOrder(rctx: ResolveContext): ImageRenderOrder {
    return normalizeImageRenderOrder(this.getProp<string>('renderOrder')?.resolve(rctx));
  }

  override getMargins(ctx: ResolveContext, source?: EffectSource) {
    if (!this.isEnabled(ctx)) return zeroMargins();
    return this.sumChildMargins(ctx, source);
  }

  override paint(ctx: CanvasContext2D, rctx: ResolveContext, owner: PaintOwner): void {
    this.paintInternal(ctx, rctx, owner, true);
  }

  paintBase(ctx: CanvasContext2D, rctx: ResolveContext, owner: PaintOwner): void {
    this.paintInternal(ctx, rctx, owner, false);
  }

  private paintInternal(ctx: CanvasContext2D, rctx: ResolveContext, owner: PaintOwner, includeEffects: boolean): void {
    if (!this.isEnabled(rctx)) return;
    const box = owner.box;
    if (!box || box.width <= 0 || box.height <= 0) return;
    if (owner.imageAssetOverride === '') return;

    const paint = owner.resolvedPaint ?? solidPaint(DEFAULT_IMAGE_COLOR);
    const colorMode = owner.imageColorMode ?? this.colorMode(rctx);
    const imageSupersampleScale =
      typeof owner.imageSupersampleScale === 'number' && Number.isFinite(owner.imageSupersampleScale)
        ? Math.max(1, Math.min(4, owner.imageSupersampleScale))
        : 1;
    const opacity = owner.opacity ?? 1;
    if (!(opacity > 0)) return;
    const bounds: Box = {
      x: -box.width / 2,
      y: -box.height / 2,
      width: box.width,
      height: box.height,
    };

    const drawBase = (output: CanvasContext2D): void => {
      output.save();
      output.globalAlpha *= opacity;
      const asset = owner.imageAssetOverride ?? this.asset(rctx);
      const image = loadedImageAsset(asset);
      if (image) {
        const imageBounds = imageDrawBounds(box, image, this.aspectRatioMode(rctx), this.aspectRatio(rctx));
        if (colorMode === 'tint') {
          drawTintedImage(output, image, imageBounds, paint, imageSupersampleScale);
        } else if (colorMode === 'solid') {
          drawSolidImage(output, image, imageBounds, paint, imageSupersampleScale);
        } else {
          drawImageWithSupersampling(output, image, imageBounds, imageSupersampleScale);
        }
      } else {
        const size = Math.max(1, Math.min(bounds.width, bounds.height));
        output.font = `${size}px sans-serif`;
        output.textAlign = 'center';
        output.textBaseline = 'middle';
        output.fillStyle = resolvePaint(output, paint, bounds);
        output.fillText(builtinImageGlyph(asset), 0, 0);
      }
      output.restore();
    };

    const effects = owner.effects ?? this.effects;
    const effectsContext = owner.effectsContext ?? rctx;
    if (!includeEffects || effects.length === 0) {
      drawBase(ctx);
      return;
    }

    renderLayeredEffectStack(
      ctx,
      effectsContext,
      effects,
      (effect) =>
        effect instanceof BorderEffect ||
        effect instanceof ShadowEffect ||
        (effect instanceof StrokeEffect && effect.isUnderlay(rctx)),
      drawBase,
      (effect, output, input, effectContext, baseTransform) => {
        if (effect instanceof BorderEffect) {
          effect.strokeImage(output, input, effectContext, bounds, baseTransform);
          return;
        }
        if (effect instanceof StrokeEffect) {
          effect.strokeImage(output, input, effectContext, paint, bounds, baseTransform);
          return;
        }
        if (effect instanceof ShadowEffect) {
          effect.castImage(output, input, effectContext, paint, bounds, baseTransform);
          return;
        }
        renderWrappedEffect(effect, output, input, effectContext, {
          baseTransform,
          paintBounds: bounds,
          localizeSignalEffects: true,
          source: { bounds: { width: box.width, height: box.height }, color: paint },
        });
      },
      { paintBounds: bounds },
    );
  }
}
