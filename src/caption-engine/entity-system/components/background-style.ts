import type { ResolvedCornerGeometry } from '../../../types/captions';
import {
  buildRoundedUnionPath,
  drawRoundedRectanglePath,
  scaleCornerGeometryToFit,
} from '../../../utilities/canvas-utils';
import { BorderEffect, ShadowEffect, StrokeEffect, type EffectSource } from '../effects';
import { renderEffectStack, renderWrappedEffect } from '../effects/effect-stack';
import { staticProperty } from '../property';
import { isOpaquePaint, opaquePaint, resolvePaint, solidPaint, type Paint } from '../paint';
import { normalizeFillPattern, resolveFillPatternPaint, type FillPattern } from '../fill-pattern';
import {
  addMargins,
  type Box,
  type CanvasContext2D,
  type Margins,
  type ResolveContext,
  type Vector2,
  toVec2,
} from '../types';
import {
  createBackgroundPath,
  normalizeBackgroundPathShape,
  normalizeBackgroundPathTailSide,
  normalizeBackgroundPathTailSize,
  type BackgroundPathShape,
  type BackgroundPathTailSide,
} from './background-path';
import type { CornerRadiusProvider } from './border-radius';
import { hasVisibleCornerRadius, resolveBorderRadiusGeometry, resolveBorderRadiusValue } from './border-radius';
import { Component } from './component';
import { resolveInsets, type Insets } from '../insets';

export type BackgroundStyleBoundsMode = 'fillSelf' | 'tight' | 'full';
export type BackgroundStyleCoverageMode = 'all' | 'throughCurrent';
export type BackgroundStyleOverflowMode = 'visible' | 'clipToOwner';

export interface BackgroundStyleDebugGeometry {
  sourceBands: Box[];
  bandPaddingBands: Box[];
  blockPaddingBands: Box[];
  paintedBands: Box[];
}

function unionBounds(boxes: readonly Box[]): Box | undefined {
  if (boxes.length === 0) return undefined;
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function scaleBox(box: Box, pivot: Vector2, scale: Vector2): Box {
  const left = pivot.x + (box.x - pivot.x) * scale.x;
  const right = pivot.x + (box.x + box.width - pivot.x) * scale.x;
  const top = pivot.y + (box.y - pivot.y) * scale.y;
  const bottom = pivot.y + (box.y + box.height - pivot.y) * scale.y;
  return {
    x: Math.min(left, right),
    y: Math.min(top, bottom),
    width: Math.abs(right - left),
    height: Math.abs(bottom - top),
  };
}

function pivotForGeometry(geometry: BackgroundStyleDebugGeometry): Vector2 | undefined {
  const sourceBounds = unionBounds(geometry.sourceBands);
  return sourceBounds
    ? {
        x: sourceBounds.x + sourceBounds.width / 2,
        y: sourceBounds.y + sourceBounds.height / 2,
      }
    : undefined;
}

function scaleGeometry(geometry: BackgroundStyleDebugGeometry, scale: Vector2): BackgroundStyleDebugGeometry {
  const pivot = pivotForGeometry(geometry);
  if (!pivot) return geometry;
  const scaleBands = (bands: readonly Box[]): Box[] => bands.map((band) => scaleBox(band, pivot, scale));
  return {
    sourceBands: scaleBands(geometry.sourceBands),
    bandPaddingBands: scaleBands(geometry.bandPaddingBands),
    blockPaddingBands: scaleBands(geometry.blockPaddingBands),
    paintedBands: scaleBands(geometry.paintedBands),
  };
}

/** Resolve the independent padding geometries from the same bands used to paint a BackgroundStyle. */
export function resolveBackgroundStyleDebugGeometry(
  sourceBands: readonly Box[],
  bandPadding: Insets,
  blockPadding: Insets,
  offset: Vector2,
): BackgroundStyleDebugGeometry {
  const source = sourceBands.map((band) => ({ ...band }));
  const bandPaddingBands = source.map((band) => ({
    x: band.x - bandPadding.left + offset.x,
    y: band.y - bandPadding.top + offset.y,
    width: band.width + bandPadding.left + bandPadding.right,
    height: band.height + bandPadding.top + bandPadding.bottom,
  }));
  const blockPaddingBands = source.map((band, index) => ({
    x: band.x - blockPadding.left + offset.x,
    y: band.y - (index === 0 ? blockPadding.top : 0) + offset.y,
    width: band.width + blockPadding.left + blockPadding.right,
    height:
      band.height +
      (index === 0 ? blockPadding.top : 0) +
      (index === source.length - 1 ? blockPadding.bottom : 0),
  }));
  const paintedBands = source.map((band, index) => ({
    x: band.x - bandPadding.left - blockPadding.left + offset.x,
    y: band.y - bandPadding.top - (index === 0 ? blockPadding.top : 0) + offset.y,
    width: band.width + bandPadding.left + bandPadding.right + blockPadding.left + blockPadding.right,
    height:
      band.height +
      bandPadding.top +
      bandPadding.bottom +
      (index === 0 ? blockPadding.top : 0) +
      (index === source.length - 1 ? blockPadding.bottom : 0),
  }));
  return { sourceBands: source, bandPaddingBands, blockPaddingBands, paintedBands };
}

/** A filled (optionally stroked/rounded) rect behind the owner's content. */
export class BackgroundStyle extends Component {
  readonly type = 'backgroundStyle';
  override readonly allowDisable = true;
  override readonly allowedEntities = [
    'viewport',
    'videoArea',
    'video',
    'compositionArea',
    'page',
    'row',
    'word',
    'marker',
    'background',
  ];
  override readonly allowedQuantity = 1;

  constructor(props?: Map<string, import('../property').Property<unknown>>, components?: Component[], effects?: import('../effects').Effect[]) {
    super(props, components, effects);
    if (!this.props.has('fill')) {
      this.props.set('fill', staticProperty('paint', solidPaint('#e5e7eb')));
    }
    if (!this.props.has('fillPattern')) {
      this.props.set('fillPattern', staticProperty('pattern', { type: 'pattern', pattern: 'single', colors: [], offset: 0 }));
    }
    if (!this.props.has('pathShape')) this.props.set('pathShape', staticProperty('string', 'rounded'));
    if (!this.props.has('tailSide')) this.props.set('tailSide', staticProperty('string', 'auto'));
    if (!this.props.has('tailSize')) this.props.set('tailSize', staticProperty('number', 1));
    if (!this.props.has('borderRadiusMode')) this.props.set('borderRadiusMode', staticProperty('string', 'uniform'));
    if (!this.props.has('borderRadius')) this.props.set('borderRadius', staticProperty('number', 0));
    if (!this.props.has('borderTopLeftRadius')) this.props.set('borderTopLeftRadius', staticProperty('number', 0));
    if (!this.props.has('borderTopRightRadius')) this.props.set('borderTopRightRadius', staticProperty('number', 0));
    if (!this.props.has('borderBottomRightRadius')) this.props.set('borderBottomRightRadius', staticProperty('number', 0));
    if (!this.props.has('borderBottomLeftRadius')) this.props.set('borderBottomLeftRadius', staticProperty('number', 0));
    if (!this.props.has('boundsMode')) {
      this.props.set('boundsMode', staticProperty('string', 'fillSelf'));
    }
    if (!this.props.has('overflowMode')) {
      this.props.set('overflowMode', staticProperty('string', 'visible'));
    }
    if (!this.props.has('coverageMode')) {
      this.props.set('coverageMode', staticProperty('string', 'all'));
    }
    if (!this.props.has('bounds')) {
      this.props.set('bounds', staticProperty('rect', null, undefined, { runtimeOnly: true }));
    }
  }

  rowBoxes?: Box[] | undefined;
  debugGeometry?: BackgroundStyleDebugGeometry | undefined;

  override getMargins(ctx: ResolveContext, source?: EffectSource): Margins {
    let margins: Margins = { x: 0, y: 0 };
    const resolvedBounds = this.bounds(ctx);
    for (const effect of this.effects) {
      if (!effect.isEnabled(ctx)) continue;
      const effectSource =
        source ?? (resolvedBounds ? { bounds: { width: resolvedBounds.width, height: resolvedBounds.height } } : undefined);
      margins = addMargins(margins, effectSource ? effect.getMargins(ctx, effectSource) : effect.getMargins(ctx));
    }
    return margins;
  }

  cornerRadius(rctx: ResolveContext): number {
    return resolveBorderRadiusValue(this, rctx);
  }

  cornerGeometry(rctx: ResolveContext): ResolvedCornerGeometry {
    return resolveBorderRadiusGeometry(this, rctx);
  }

  cornerGeometryForBox(rctx: ResolveContext, box: Box): ResolvedCornerGeometry {
    const geometry = this.cornerGeometry(rctx);
    if (this.shape(rctx) !== 'pill') return geometry;
    const radius = Math.min(box.width, box.height) / 2;
    return {
      ...geometry,
      radii: {
        topLeft: radius,
        topRight: radius,
        bottomRight: radius,
        bottomLeft: radius,
      },
    };
  }

  cornerSmoothing(): boolean {
    return this.getProp<number>('borderRadius')?.squircle ?? true;
  }

  boundsMode(rctx: ResolveContext): BackgroundStyleBoundsMode {
    const value = this.getProp<string>('boundsMode')?.resolve(rctx);
    if (value === 'fillSelf' || value === 'self') return 'fillSelf';
    if (value === 'tight' || value === 'content') return 'tight';
    if (value === 'full' || value === 'children') return 'full';
    return 'fillSelf';
  }

  overflowMode(rctx: ResolveContext): BackgroundStyleOverflowMode {
    return this.getProp<string>('overflowMode')?.resolve(rctx) === 'clipToOwner' ? 'clipToOwner' : 'visible';
  }

  coverageMode(rctx: ResolveContext): BackgroundStyleCoverageMode {
    return this.getProp<string>('coverageMode')?.resolve(rctx) === 'throughCurrent' ? 'throughCurrent' : 'all';
  }

  shape(rctx: ResolveContext): BackgroundPathShape {
    return normalizeBackgroundPathShape(this.getProp<string>('pathShape')?.resolve(rctx));
  }

  tailSide(rctx: ResolveContext): BackgroundPathTailSide {
    return normalizeBackgroundPathTailSide(this.getProp<string>('tailSide')?.resolve(rctx));
  }

  tailSize(rctx: ResolveContext): number {
    return normalizeBackgroundPathTailSize(this.getProp<number>('tailSize')?.resolve(rctx));
  }

  private fillPaintFor(rctx: ResolveContext): Paint {
    const fill = this.getProp<Paint>('fill')?.resolve(rctx) ?? solidPaint('#e5e7eb');
    const pattern = normalizeFillPattern(this.getProp<FillPattern>('fillPattern')?.resolve(rctx));
    return resolveFillPatternPaint(pattern, rctx.patternIndex ?? 0) ?? fill;
  }

  setResolvedBounds(bounds: Box | undefined): void {
    this.getProp<Box | null>('bounds')?.setResolvedValue(bounds);
  }

  setResolvedSourceBands(sourceBands: readonly Box[], rctx: ResolveContext): void {
    const resolve = (path: string, context: ResolveContext): unknown => this.getProp(path)?.resolve(context);
    const bandPadding = resolveInsets(resolve, 'bandPadding', rctx);
    const blockPadding = resolveInsets(resolve, 'blockPadding', rctx);
    const offset = toVec2(this.getProp<Vector2>('offset')?.resolve(rctx) ?? { x: 0, y: 0 });
    const geometry = resolveBackgroundStyleDebugGeometry(sourceBands, bandPadding, blockPadding, offset);
    this.rowBoxes = undefined;
    this.debugGeometry = geometry;
    this.setResolvedBounds(unionBounds(geometry.paintedBands));
  }

  private scaleFor(rctx: ResolveContext): Vector2 {
    const resolved = toVec2(this.getProp<Vector2>('scale')?.resolve(rctx) ?? { x: 1, y: 1 });
    return {
      x: Number.isFinite(resolved.x) ? resolved.x : 1,
      y: Number.isFinite(resolved.y) ? resolved.y : 1,
    };
  }

  resolvedDebugGeometry(rctx: ResolveContext): BackgroundStyleDebugGeometry | undefined {
    if (!this.debugGeometry) return undefined;
    return scaleGeometry(this.debugGeometry, this.scaleFor(rctx));
  }

  resolvedRowBoxes(rctx: ResolveContext): Box[] | undefined {
    return this.rowBoxes ? (this.resolvedDebugGeometry(rctx)?.paintedBands ?? this.rowBoxes) : undefined;
  }

  bounds(rctx: ResolveContext): Box | undefined {
    const resolved = this.getProp<Box | null>('bounds')?.resolve(rctx);
    if (resolved) {
      const pivot = this.debugGeometry ? pivotForGeometry(this.debugGeometry) : undefined;
      return pivot ? scaleBox(resolved, pivot, this.scaleFor(rctx)) : resolved;
    }
    const resolvedGeometry = this.resolvedDebugGeometry(rctx);
    const resolvedPaintedBounds = resolvedGeometry ? unionBounds(resolvedGeometry.paintedBands) : undefined;
    if (resolvedPaintedBounds) return resolvedPaintedBounds;
    return resolved ?? this.box;
  }

  paintBox(
    ctx: CanvasContext2D,
    box: Box,
    rctx: ResolveContext,
    cornerRadius?: CornerRadiusProvider,
  ): void {
    this.paintBoxInternal(ctx, box, rctx, cornerRadius, true);
  }

  paintBoxBase(
    ctx: CanvasContext2D,
    box: Box,
    rctx: ResolveContext,
    cornerRadius?: CornerRadiusProvider,
  ): void {
    this.paintBoxInternal(ctx, box, rctx, cornerRadius, false);
  }

  private paintBoxInternal(
    ctx: CanvasContext2D,
    box: Box,
    rctx: ResolveContext,
    cornerRadius: CornerRadiusProvider | undefined,
    includeEffects: boolean,
  ): void {
    if (this.getProp<boolean>('enabled')?.resolve(rctx) === false) return;
    this.paintSingle(ctx, box, rctx, cornerRadius, 1, includeEffects);
  }

  private paintSingle(
    ctx: CanvasContext2D,
    box: Box,
    rctx: ResolveContext,
    cornerRadius?: CornerRadiusProvider,
    extraAlpha = 1,
    includeEffects = true,
  ): void {
    const { x, y, width, height } = box;
    if (width <= 0 || height <= 0) return;

    const opacity = Number(this.getProp<number>('opacity')?.resolve(rctx) ?? 1);
    const inheritBaseAlpha = this.effectsInheritBaseAlpha(rctx);
    const path = createBackgroundPath(
      box,
      this.shape(rctx),
      this.tailSide(rctx),
      rctx.textDirection,
      this.tailSize(rctx),
      this.cornerSmoothing(),
    );
    const drawBase = (output: CanvasContext2D, useOpaqueSource = false): void => {
      const geometry = scaleCornerGeometryToFit((cornerRadius ?? this).cornerGeometry(rctx), width, height);
      output.save();
      output.globalAlpha = output.globalAlpha * (useOpaqueSource ? 1 : opacity * extraAlpha);
      if (path) {
        const fill = this.fillPaintFor(rctx);
        output.fillStyle = resolvePaint(output, useOpaqueSource ? opaquePaint(fill) : fill, { x, y, width, height });
        output.fill(path);
      } else {
        output.beginPath();
        if (hasVisibleCornerRadius(geometry)) {
          drawRoundedRectanglePath(output, x, y, width, height, geometry);
        } else {
          output.rect(x, y, width, height);
        }
        const fill = this.fillPaintFor(rctx);
        output.fillStyle = resolvePaint(output, useOpaqueSource ? opaquePaint(fill) : fill, { x, y, width, height });
        output.fill();
      }
      output.restore();
    };

    if (!includeEffects || this.effects.length === 0) {
      drawBase(ctx);
      return;
    }

    renderEffectStack(ctx, rctx, this.effects, drawBase, (effect, output, input, effectContext, baseTransform) => {
      if (effect instanceof BorderEffect) {
        if (effect.getAppliesOn(effectContext) === 'base') {
          output.setTransform(baseTransform);
          if (path) effect.strokePath(output, path, effectContext, box);
          else effect.strokeBox(output, box, cornerRadius ?? this, effectContext);
        } else {
          effect.strokeImage(output, input, effectContext, box, baseTransform);
        }
        return;
      }
      if (effect instanceof StrokeEffect) {
        const canUseVectorStroke =
          effect.getAppliesOn(effectContext) === 'base' &&
          (!inheritBaseAlpha || isOpaquePaint(this.fillPaintFor(effectContext)));
        if (canUseVectorStroke) {
          output.setTransform(baseTransform);
          if (path) effect.strokeOutlinePath(output, path, effectContext, box, opacity * extraAlpha);
          else effect.strokeBoxOutline(output, box, cornerRadius ?? this, effectContext, opacity * extraAlpha);
        } else {
          effect.strokeImage(output, input, effectContext, undefined, box, baseTransform);
        }
        return;
      }
      if (effect instanceof ShadowEffect) {
        effect.castImage(output, input, effectContext, undefined, box, baseTransform);
        return;
      }
      renderWrappedEffect(effect, output, input, effectContext, {
        baseTransform,
        paintBounds: box,
        localizeSignalEffects: true,
        source: { bounds: { width: box.width, height: box.height }, color: this.fillPaintFor(effectContext) },
      });
    }, {
      ...(!inheritBaseAlpha
        ? { renderEffectBase: (output: CanvasContext2D) => drawBase(output, true) }
        : {}),
    });
  }

  paintRows(ctx: CanvasContext2D, rows: Box[], rctx: ResolveContext, cornerRadius?: CornerRadiusProvider): void {
    this.paintRowsInternal(ctx, rows, rctx, cornerRadius, true);
  }

  paintRowsBase(ctx: CanvasContext2D, rows: Box[], rctx: ResolveContext, cornerRadius?: CornerRadiusProvider): void {
    this.paintRowsInternal(ctx, rows, rctx, cornerRadius, false);
  }

  private paintRowsInternal(
    ctx: CanvasContext2D,
    rows: Box[],
    rctx: ResolveContext,
    cornerRadius: CornerRadiusProvider | undefined,
    includeEffects: boolean,
  ): void {
    if (this.getProp<boolean>('enabled')?.resolve(rctx) === false) return;
    const bands = rows.filter((box) => box.width > 0 && box.height > 0);
    if (bands.length === 0) return;

    const provider = cornerRadius ?? this;
    const geometry = provider.cornerGeometry(rctx);
    const joinRadius = provider.cornerRadius(rctx);
    const opacity = Number(this.getProp<number>('opacity')?.resolve(rctx) ?? 1);
    const inheritBaseAlpha = this.effectsInheritBaseAlpha(rctx);
    const bounds = {
      x: Math.min(...bands.map((band) => band.x)),
      y: Math.min(...bands.map((band) => band.y)),
      width: Math.max(...bands.map((band) => band.x + band.width)) - Math.min(...bands.map((band) => band.x)),
      height: Math.max(...bands.map((band) => band.y + band.height)) - Math.min(...bands.map((band) => band.y)),
    };
    const path =
      this.shape(rctx) === 'rounded'
        ? buildRoundedUnionPath(
            bands.map((b) => ({ left: b.x, top: b.y, right: b.x + b.width, bottom: b.y + b.height })),
            geometry,
            joinRadius,
          )
        : createBackgroundPath(
            bounds,
            this.shape(rctx),
            this.tailSide(rctx),
            rctx.textDirection,
            this.tailSize(rctx),
            this.cornerSmoothing(),
          );
    if (!path) return;

    const drawBase = (output: CanvasContext2D, useOpaqueSource = false): void => {
      output.save();
      output.globalAlpha = output.globalAlpha * (useOpaqueSource ? 1 : opacity);
      const fill = this.fillPaintFor(rctx);
      output.fillStyle = resolvePaint(output, useOpaqueSource ? opaquePaint(fill) : fill, bounds);
      output.fill(path);
      output.restore();
    };

    if (!includeEffects || this.effects.length === 0) {
      drawBase(ctx);
      return;
    }

    renderEffectStack(ctx, rctx, this.effects, drawBase, (effect, output, input, effectContext, baseTransform) => {
      if (effect instanceof BorderEffect) {
        if (effect.getAppliesOn(effectContext) === 'base') {
          output.setTransform(baseTransform);
          effect.strokePath(output, path, effectContext, bounds);
        } else {
          effect.strokeImage(output, input, effectContext, bounds, baseTransform);
        }
        return;
      }
      if (effect instanceof StrokeEffect) {
        const canUseVectorStroke =
          effect.getAppliesOn(effectContext) === 'base' &&
          (!inheritBaseAlpha || isOpaquePaint(this.fillPaintFor(effectContext)));
        if (canUseVectorStroke) {
          output.setTransform(baseTransform);
          effect.strokeOutlinePath(output, path, effectContext, bounds, opacity);
        } else {
          effect.strokeImage(output, input, effectContext, undefined, bounds, baseTransform);
        }
        return;
      }
      if (effect instanceof ShadowEffect) {
        effect.castImage(output, input, effectContext, undefined, bounds, baseTransform);
        return;
      }
      renderWrappedEffect(effect, output, input, effectContext, {
        baseTransform,
        paintBounds: bounds,
        localizeSignalEffects: true,
        source: {
          bounds: {
            width: Math.max(...bands.map((band) => band.x + band.width)) - Math.min(...bands.map((band) => band.x)),
            height: Math.max(...bands.map((band) => band.y + band.height)) - Math.min(...bands.map((band) => band.y)),
          },
          color: this.fillPaintFor(effectContext),
        },
      });
    }, {
      ...(!inheritBaseAlpha
        ? { renderEffectBase: (output: CanvasContext2D) => drawBase(output, true) }
        : {}),
    });
  }
}
