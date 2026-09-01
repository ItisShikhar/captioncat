import { prepareAnimationContext, relativeAnimationOffsetFor } from './animation';
import { prepareFollowContext } from './follow';
import { prepareTransitionContext } from './transitions';
import { BackgroundStyle, BorderRadius, FollowTarget, Image, ImageSequencer, Text } from './components';
import type { CornerRadiusProvider } from './components/border-radius';
import { hasVisibleCornerRadius } from './components/border-radius';
import { renderEffectStack, renderWrappedEffect } from './effects/effect-stack';
import { BackgroundEntity, Marker, PhysicalEntity, Row, Viewport, Word } from './physical-entities';
import { contentClipBox, resolveTransformPivot } from './layout-engine';
import { anchorOffsetForBox } from './follow';
import { solidPaint, type Paint } from './paint';
import { orderedChildGroups } from './paint-order';
import type { Effect } from './effects/effect';
import {
  materializeStyleForEntity,
  type MaterializedStyle,
} from './style-overrides';
import {
  addMargins,
  compositionScaleOf,
  toVec2,
  type Box,
  type CanvasContext2D,
  type Margins,
  type PaintOwner,
  type ResolveContext,
  type Vector2,
  zeroMargins,
} from './types';
import type { ImageColorMode } from './components/image-style';
import { drawRoundedRectanglePath, scaleCornerGeometryToFit } from '../../utilities/canvas-utils';
import { WipeRevealEffect } from './effects';

export interface SceneRenderOptions {
  ignoreContentClip?: boolean;
  blendModeLayerCollector?: NonNullable<ResolveContext['blendModeLayerCollector']>;
}

/**
 * Scene renderer: a depth-first walk that paints a laid-out entity tree. For
 * each entity it applies the entity's Transform (opacity, scale, and rotation)
 * around its resolved transform pivot, then paints background children, the
 * entity's underlay surface, content children, and any Image overlay under the
 * entity's effects, then recurses. This replaces the
 * monolithic top-down `drawCaption` loop. Each concern now lives on the
 * component/effect it belongs to.
 *
 * Effect scope: a leaf entity's effects wrap only its own surface (the fast,
 * exact common case for per-word blur and motion-blur). A container entity's effects
 * (effects + children) wrap its whole subtree via an offscreen buffer, so group
 * blur/motion-blur composite-then-filter (correct) and group opacity applies to
 * the flattened subtree rather than per element.
 */

function center(entity: PhysicalEntity): { x: number; y: number } {
  const box = entity.box;
  if (!box) return { x: 0, y: 0 };
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function opacityForStyle(entity: PhysicalEntity, rctx: ResolveContext): number {
  const opacity = entity.transform?.opacity(rctx) ?? 1;
  return Number.isFinite(opacity) ? Math.max(0, opacity) : 0;
}

function paintWithOpacity(
  output: CanvasContext2D,
  opacity: number,
  paint: (layer: CanvasContext2D) => void,
): void {
  output.save();
  output.globalAlpha *= opacity;
  paint(output);
  output.restore();
}

function updateFollowedBackgroundRenderGeometry(root: PhysicalEntity, rctx: ResolveContext): void {
  root.traverse((entity) => {
    if (!(entity instanceof BackgroundEntity) || !entity.box) return;
    const followTarget = entity.getComponent<FollowTarget>('followTarget');
    const transform = entity.transform;
    if (!followTarget || !transform) return;

    const local = entity.contextFor(rctx);
    const config = followTarget.resolveConfig(local);
    const authoredBox = entity.box;
    const dimensions = toVec2(transform.getProp<Vector2>('dimensions')?.resolve(local) ?? {
      x: authoredBox.width,
      y: authoredBox.height,
    });
    const width = Number.isFinite(dimensions.x) && dimensions.x > 0 ? dimensions.x : authoredBox.width;
    const height = Number.isFinite(dimensions.y) && dimensions.y > 0 ? dimensions.y : authoredBox.height;
    const authoredPosition = transform.position(local);
    const position = transform.resolvedPosition(local, {
      width: authoredBox.width,
      height: authoredBox.height,
    });
    const hasPositionXMapping = config.mappings.some(
      (mapping) => mapping.destination === 'Transform.position.x',
    );
    const hasPositionYMapping = config.mappings.some(
      (mapping) => mapping.destination === 'Transform.position.y',
    );
    const anchorOffset = anchorOffsetForBox(width, height, config.anchor);
    const renderBox: Box = {
      x: hasPositionXMapping ? authoredPosition.x - anchorOffset.x : authoredBox.x,
      y: hasPositionYMapping ? authoredPosition.y - anchorOffset.y : authoredBox.y,
      width,
      height,
    };

    entity.box = renderBox;
    entity.layoutPosition = position;
    entity.getComponent<BackgroundStyle>('backgroundStyle')?.setResolvedSourceBands([renderBox], local);
  });
}

function isHorizontalWipe(wipeReveal: WipeRevealEffect, rctx: ResolveContext): boolean {
  const direction = wipeReveal.direction(rctx);
  return (
    direction === 'leftToRight' ||
    direction === 'rightToLeft' ||
    direction === 'logicalStartToEnd' ||
    direction === 'logicalEndToStart'
  );
}

function wipeBaseBoundsFor(
  entity: PhysicalEntity,
  parent: PhysicalEntity | undefined,
  wipeReveal: WipeRevealEffect,
  rctx: ResolveContext,
): Box | undefined {
  const bounds = entity.box;
  if (!bounds) return undefined;
  if (!(entity instanceof Word) || !(parent instanceof Row) || !parent.box) {
    return bounds;
  }

  const horizontal = isHorizontalWipe(wipeReveal, rctx);
  const stableWidth = horizontal ? bounds.width : Math.max(bounds.width, parent.box.width);
  const stableHeight = horizontal ? Math.max(bounds.height, parent.box.height) : bounds.height;
  if (stableWidth === bounds.width && stableHeight === bounds.height) return bounds;

  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  return {
    ...bounds,
    x: centerX - stableWidth / 2,
    y: centerY - stableHeight / 2,
    width: stableWidth,
    height: stableHeight,
  };
}

function wipePaintBoundsFor(
  entity: PhysicalEntity,
  parent: PhysicalEntity | undefined,
  wipeReveal: WipeRevealEffect,
  targetStyle: MaterializedStyle,
  alternateStyle?: MaterializedStyle,
): Box | undefined {
  const baseBounds = wipeBaseBoundsFor(entity, parent, wipeReveal, targetStyle.context);
  if (!baseBounds) return undefined;
  const renderOffset =
    entity.transform && entity.layoutPosition
      ? entity.transform.renderPosition(
          targetStyle.context,
          entity.layoutPosition,
          relativeAnimationOffsetFor(entity, targetStyle.context),
        )
      : { x: 0, y: 0 };
  const horizontal = isHorizontalWipe(wipeReveal, targetStyle.context);
  const expandsBothAxes = wipeReveal.shape(targetStyle.context) === 'diagonal';
  const movementPaddingX = expandsBothAxes || !horizontal ? Math.abs(renderOffset.x) : 0;
  const movementPaddingY = expandsBothAxes || horizontal ? Math.abs(renderOffset.y) : 0;
  const bounds = {
    x: baseBounds.x + renderOffset.x - movementPaddingX,
    y: baseBounds.y + renderOffset.y - movementPaddingY,
    width: baseBounds.width + movementPaddingX * 2,
    height: baseBounds.height + movementPaddingY * 2,
  };
  const styles = alternateStyle ? [targetStyle, alternateStyle] : [targetStyle];
  let marginX = 0;
  let marginY = 0;
  for (const style of styles) {
    const margins = selfMarginsForStyle(entity, style);
    marginX = Math.max(marginX, Math.max(0, margins.x));
    marginY = Math.max(marginY, Math.max(0, margins.y));
  }
  if (marginX > 0 || marginY > 0) {
    const rasterPadding = 2 / compositionScaleOf(targetStyle.context);
    marginX += rasterPadding;
    marginY += rasterPadding;
  }
  return {
    x: bounds.x - marginX,
    y: bounds.y - marginY,
    width: bounds.width + marginX * 2,
    height: bounds.height + marginY * 2,
  };
}

function selfMarginsForStyle(entity: PhysicalEntity, style: MaterializedStyle): Margins {
  const source = entity.box ? { bounds: { width: entity.box.width, height: entity.box.height } } : undefined;
  let margins = zeroMargins();
  for (const component of style.components) {
    margins = addMargins(
      margins,
      source ? component.getMargins(style.context, source) : component.getMargins(style.context),
    );
  }
  for (const effect of style.effects) {
    if (!effect.isEnabled(style.context)) continue;
    margins = addMargins(margins, source ? effect.getMargins(style.context, source) : effect.getMargins(style.context));
  }
  return margins;
}

function markerStyleSource(marker: Marker, rctx: ResolveContext): PhysicalEntity {
  const behavior = marker.markerBehavior?.resolveConfig(rctx);
  if (!behavior || behavior.styleSource === 'own' || !marker.resolvedTarget) return marker;
  const target = marker.resolvedTarget;
  const state =
    behavior.styleState === 'followTarget'
      ? target instanceof Word || target instanceof Row
        ? target.state
        : 'default'
      : behavior.styleState;
  return target.styleSources[state] ?? target;
}

export interface MarkerAppearance {
  paint: Paint;
  imageColorMode: ImageColorMode;
  effects?: readonly Effect[];
  effectsContext?: ResolveContext;
}

export function markerAppearance(
  marker: Marker,
  rctx: ResolveContext,
): MarkerAppearance {
  const source = markerStyleSource(marker, rctx);
  const sourceContext = source === marker ? rctx : marker.resolvedTarget?.contextFor(rctx) ?? rctx;
  const image = source.getComponent<Image>('image');
  if (image) {
    return {
      paint: image.color(sourceContext),
      imageColorMode: image.colorMode(sourceContext),
      ...(source === marker ? {} : { effects: image.effects, effectsContext: sourceContext }),
    };
  }
  const text = source.getComponent<Text>('text');
  const textPaint = text?.getProp<Paint>('color')?.resolve(sourceContext);
  if (text && textPaint) {
    return {
      paint: textPaint,
      imageColorMode: 'solid',
      ...(source === marker ? {} : { effects: text.effects, effectsContext: sourceContext }),
    };
  }
  const background = source.getComponent<BackgroundStyle>('backgroundStyle');
  const backgroundPaint = background?.getProp<Paint>('fill')?.resolve(sourceContext);
  return {
    paint: backgroundPaint ?? solidPaint('#ffffff'),
    imageColorMode: 'solid',
    ...(source === marker || !background ? {} : { effects: background.effects, effectsContext: sourceContext }),
  };
}

function paintImageComponent(
  entity: PhysicalEntity,
  ctx: CanvasContext2D,
  rctx: ResolveContext,
  includeEffects = true,
  style?: MaterializedStyle,
): void {
  const box = entity.box;
  if (!box) return;
  const components = style?.components ?? entity.components;
  const image = components.find((component): component is Image => component instanceof Image);
  if (!image?.isEnabled(rctx)) return;

  const appearance = entity instanceof Marker && !style ? markerAppearance(entity, rctx) : undefined;
  const imageSequencer = components.find(
    (component): component is ImageSequencer => component instanceof ImageSequencer,
  );
  const owner = {
    kind: entity.kind,
    box,
    resolvedPaint: appearance?.paint ?? image.color(rctx),
    imageColorMode: appearance?.imageColorMode,
    effects: appearance?.effects,
    effectsContext: appearance?.effectsContext,
    imageAssetOverride: imageSequencer?.isEnabled(rctx) ? imageSequencer.asset(rctx) : undefined,
    ...(entity instanceof Marker ? { imageSupersampleScale: 4 } : {}),
  };
  if (includeEffects) image.paint(ctx, rctx, owner);
  else image.paintBase(ctx, rctx, owner);
}

/** Paint an entity's own visuals with ctx origin already at its box center. */
function paintLocal(
  entity: PhysicalEntity,
  ctx: CanvasContext2D,
  rctx: ResolveContext,
  includeAboveChildrenImage = false,
  includeEffects = true,
  style?: MaterializedStyle,
): void {
  const box = entity.box;
  if (!box) return;
  const local = style?.context ?? entity.contextFor(rctx);
  const components = style?.components ?? entity.components;
  const localBox: Box = {
    x: -box.width / 2,
    y: -box.height / 2,
    width: box.width,
    height: box.height,
  };
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const borderRadius = components.find(
    (component): component is BorderRadius =>
      component instanceof BorderRadius && component.getProp<boolean>('enabled')?.resolve(local) !== false,
  );
  const cornerRadius: CornerRadiusProvider | undefined =
    borderRadius ?? components.find((component): component is BackgroundStyle => component instanceof BackgroundStyle);
  for (const component of components) {
    if (component instanceof BackgroundStyle) {
      if (entity instanceof Viewport) continue;
      const paintBackground = (): void => {
        // A multi-row page band (row-content) paints as one union shape. Rebase
        // each row box from canvas space to this entity's local origin.
        if (component.rowBoxes && component.rowBoxes.length > 0) {
          const localRows = (component.resolvedRowBoxes(local) ?? component.rowBoxes).map((row) => ({
            x: row.x - cx,
            y: row.y - cy,
            width: row.width,
            height: row.height,
          }));
          if (includeEffects) component.paintRows(ctx, localRows, local, cornerRadius);
          else component.paintRowsBase(ctx, localRows, local, cornerRadius);
          return;
        }
        // A layout-assigned box (a content-hugging page/row band) is in canvas
        // space. Rebase it to this entity's local origin. Otherwise fill the owner.
        const resolvedBox = component.bounds(local);
        const paintBox = resolvedBox
          ? { x: resolvedBox.x - cx, y: resolvedBox.y - cy, width: resolvedBox.width, height: resolvedBox.height }
          : localBox;
        if (includeEffects) component.paintBox(ctx, paintBox, local, cornerRadius);
        else component.paintBoxBase(ctx, paintBox, local, cornerRadius);
      };
      if (component.overflowMode(local) === 'clipToOwner') {
        ctx.save();
        ctx.beginPath();
        ctx.rect(localBox.x, localBox.y, localBox.width, localBox.height);
        ctx.clip();
        paintBackground();
        ctx.restore();
      } else {
        paintBackground();
      }
    }
  }
  const text = components.find((component): component is Text => component instanceof Text);
  if (text) {
    const textVerticalScale = entity instanceof Word ? entity.textVerticalScale : 1;
    if (Number.isFinite(textVerticalScale) && textVerticalScale > 0 && textVerticalScale !== 1) {
      ctx.save();
      ctx.scale(1, textVerticalScale);
      if (includeEffects) text.paint(ctx, local, entity as PaintOwner);
      else text.paintBase(ctx, local, entity as PaintOwner);
      ctx.restore();
    } else if (includeEffects) {
      text.paint(ctx, local, entity as PaintOwner);
    } else {
      text.paintBase(ctx, local, entity as PaintOwner);
    }
  }
  const image = components.find((component): component is Image => component instanceof Image);
  if (image && (includeAboveChildrenImage || image.renderOrder(local) === 'belowChildren')) {
    paintImageComponent(entity, ctx, local, includeEffects, style);
  }
}

function clipContent(
  ctx: CanvasContext2D,
  entity: PhysicalEntity,
  rctx: ResolveContext,
  style?: MaterializedStyle,
): boolean {
  const clip = contentClipBox(entity, rctx);
  if (!clip) return false;

  ctx.save();
  ctx.beginPath();
  const components = style?.components ?? entity.components;
  const borderRadius = components.find(
    (component): component is BorderRadius => component instanceof BorderRadius,
  );
  const enabled = borderRadius?.getProp<boolean>('enabled')?.resolve(rctx) !== false;
  const background = components.find(
    (component): component is BackgroundStyle => component instanceof BackgroundStyle,
  );
  const backgroundCanProvideRadius =
    background &&
    (background.shape(rctx) === 'rounded' || background.shape(rctx) === 'pill') &&
    background.getProp<boolean>('enabled')?.resolve(rctx) !== false;
  const cornerProvider: CornerRadiusProvider | undefined =
    borderRadius && enabled ? borderRadius : backgroundCanProvideRadius ? background : undefined;
  if (cornerProvider) {
    const geometry = scaleCornerGeometryToFit(
      backgroundCanProvideRadius && cornerProvider === background
        ? background.cornerGeometryForBox(rctx, clip)
        : cornerProvider.cornerGeometry(rctx),
      clip.width,
      clip.height,
    );
    if (hasVisibleCornerRadius(geometry)) {
      drawRoundedRectanglePath(ctx, clip.x, clip.y, clip.width, clip.height, geometry);
    } else {
      ctx.rect(clip.x, clip.y, clip.width, clip.height);
    }
  } else {
    ctx.rect(clip.x, clip.y, clip.width, clip.height);
  }
  ctx.clip();
  return true;
}

function renderChildren(
  parent: PhysicalEntity,
  children: readonly PhysicalEntity[],
  ctx: CanvasContext2D,
  rctx: ResolveContext,
  options: SceneRenderOptions,
  skipEffects = false,
): void {
  const here = center(parent);
  for (const child of children) {
    const there = center(child);
    ctx.save();
    ctx.translate(there.x - here.x, there.y - here.y);
    renderNode(child, ctx, rctx, options, parent, skipEffects);
    ctx.restore();
  }
}

function childRenderGroups(
  entity: PhysicalEntity,
  rctx: ResolveContext,
): { backgroundChildren: PhysicalEntity[]; contentChildren: PhysicalEntity[] } {
  const { belowMarkers, regularChildren, aboveMarkers } = orderedChildGroups(entity, rctx);
  const backgroundChildren = regularChildren.filter((child) => child instanceof BackgroundEntity);
  const contentChildren = [
    ...belowMarkers,
    ...regularChildren.filter((child) => !(child instanceof BackgroundEntity)),
    ...aboveMarkers,
  ];
  return { backgroundChildren, contentChildren };
}

/** Paint background children and the entity surface, recurse into content children, then paint an Image overlay. */
function paintSubtree(
  entity: PhysicalEntity,
  ctx: CanvasContext2D,
  rctx: ResolveContext,
  options: SceneRenderOptions,
  style?: MaterializedStyle,
): void {
  const { backgroundChildren, contentChildren } = childRenderGroups(entity, rctx);
  if (backgroundChildren.length > 0) {
    const backgroundClipped = options.ignoreContentClip ? false : clipContent(ctx, entity, rctx, style);
    renderChildren(entity, backgroundChildren, ctx, rctx, options);
    if (backgroundClipped) ctx.restore();
  }

  paintLocal(entity, ctx, rctx, false, true, style);
  const clipped = options.ignoreContentClip ? false : clipContent(ctx, entity, rctx, style);
  renderChildren(entity, contentChildren, ctx, rctx, options);
  const components = style?.components ?? entity.components;
  const image = components.find((component): component is Image => component instanceof Image);
  if (image?.renderOrder(rctx) === 'aboveChildren') paintImageComponent(entity, ctx, rctx, true, style);
  if (clipped) ctx.restore();
}

function paintSubtreeWithoutEffects(
  entity: PhysicalEntity,
  ctx: CanvasContext2D,
  rctx: ResolveContext,
  options: SceneRenderOptions,
  style?: MaterializedStyle,
): void {
  const { backgroundChildren, contentChildren } = childRenderGroups(entity, rctx);
  if (backgroundChildren.length > 0) {
    const backgroundClipped = options.ignoreContentClip ? false : clipContent(ctx, entity, rctx, style);
    renderChildren(entity, backgroundChildren, ctx, rctx, options, true);
    if (backgroundClipped) ctx.restore();
  }

  paintLocal(entity, ctx, rctx, false, false, style);
  const clipped = options.ignoreContentClip ? false : clipContent(ctx, entity, rctx, style);
  renderChildren(entity, contentChildren, ctx, rctx, options, true);
  const components = style?.components ?? entity.components;
  const image = components.find((component): component is Image => component instanceof Image);
  if (image?.renderOrder(rctx) === 'aboveChildren') paintImageComponent(entity, ctx, rctx, false, style);
  if (clipped) ctx.restore();
}

function renderMaterializedStyle(
  entity: PhysicalEntity,
  ctx: CanvasContext2D,
  style: MaterializedStyle,
  options: SceneRenderOptions,
  opacity: number,
): void {
  const effects = style.effects.filter((effect) => !(effect instanceof WipeRevealEffect));
  const renderBase = (output: CanvasContext2D): void => {
    paintWithOpacity(output, opacity, (layer) => paintSubtree(entity, layer, style.context, options, style));
  };
  const renderBaseContent = (output: CanvasContext2D): void => {
    paintWithOpacity(output, opacity, (layer) =>
      paintSubtreeWithoutEffects(entity, layer, style.context, options, style),
    );
  };

  if (effects.length === 0) {
    renderBase(ctx);
    return;
  }

  renderEffectStack(
    ctx,
    style.context,
    effects,
    renderBase,
    (effect, output, input, effectContext, baseTransform, baseLayer) =>
      renderWrappedEffect(effect, output, input, effectContext, {
        baseTransform,
        baseInput: baseLayer,
        localizeSignalEffects: entity.children.length === 0,
        ...(entity.box ? { paintBounds: entity.box } : {}),
      }),
    {
      renderBaseContent,
      ...(entity.box ? { paintBounds: entity.box } : {}),
    },
  );
}

function renderWipeRevealNode(
  entity: PhysicalEntity,
  ctx: CanvasContext2D,
  local: ResolveContext,
  options: SceneRenderOptions,
  parent: PhysicalEntity | undefined,
  wipeReveal: WipeRevealEffect,
  targetStyle: MaterializedStyle,
  alternateStyle?: MaterializedStyle,
): void {
  const targetOpacity = opacityForStyle(entity, targetStyle.context);
  const alternateOpacity = alternateStyle ? opacityForStyle(entity, alternateStyle.context) : 1;
  const wipePaintBounds = wipePaintBoundsFor(entity, parent, wipeReveal, targetStyle, alternateStyle);

  renderEffectStack(
    ctx,
    local,
    [wipeReveal],
    (output) => renderMaterializedStyle(entity, output, targetStyle, options, targetOpacity),
    (effect, output, input, effectContext, baseTransform, baseLayer) =>
      renderWrappedEffect(effect, output, input, effectContext, {
        baseTransform,
        baseInput: baseLayer,
        ...(entity.box ? { paintBounds: entity.box } : {}),
      }),
    {
      ...(alternateStyle
        ? {
            renderAlternateBase: (output: CanvasContext2D) =>
              renderMaterializedStyle(entity, output, alternateStyle, options, alternateOpacity),
          }
        : {}),
      ...(entity.box ? { paintBounds: entity.box } : {}),
      ...(wipePaintBounds ? { wipePaintBounds } : {}),
    },
  );
}

/**
 * Render an entity's whole subtree under its effects via an offscreen buffer.
 * The subtree is flattened onto a frame-sized canvas (its CTM mirrored so
 * content lands in the same place), then the effects wrap a single blit back to
 * the main context. This makes group blur/motion-blur composite-then-filter
 * (rasterize first, filter once) instead of filtering each element separately,
 * and lets group opacity (already on the main ctx's globalAlpha) apply to the
 * flattened subtree. Use this path only when an entity has both effects and children.
 * leaf effects stay on the cheaper inline path.
 */
function renderGrouped(
  entity: PhysicalEntity,
  ctx: CanvasContext2D,
  rctx: ResolveContext,
  options: SceneRenderOptions,
  paintContext: ResolveContext = rctx,
  targetOpacity = 1,
): void {
  renderEffectStack(
    ctx,
    rctx,
    entity.effects,
    (output) => paintWithOpacity(output, targetOpacity, (layer) => paintSubtree(entity, layer, paintContext, options)),
    (effect, output, input, effectContext, baseTransform, baseLayer) =>
      renderWrappedEffect(effect, output, input, effectContext, {
        baseTransform,
        baseInput: baseLayer,
        ...(entity.box ? { paintBounds: entity.box } : {}),
      }),
    {
      renderBaseContent: (output) =>
        paintWithOpacity(output, targetOpacity, (layer) => paintSubtreeWithoutEffects(entity, layer, paintContext, options)),
      ...(entity.box ? { paintBounds: entity.box } : {}),
    },
  );
}

/** Render `entity` assuming ctx origin is already at the entity's box center. */
function renderNode(
  entity: PhysicalEntity,
  ctx: CanvasContext2D,
  rctx: ResolveContext,
  options: SceneRenderOptions,
  parent?: PhysicalEntity,
  skipEffects = false,
): void {
  if (entity.flowCollapsed) return;
  if (entity instanceof Marker && !entity.box) return;
  const local = entity.contextFor(rctx);
  const wipeReveal = entity.effects.find(
    (effect): effect is WipeRevealEffect => effect instanceof WipeRevealEffect && effect.isEnabled(local),
  );
  const targetStyle = wipeReveal
    ? materializeStyleForEntity(entity, wipeReveal.toStyle(local), local)
    : undefined;
  const alternateStyle =
    wipeReveal && wipeReveal.hasSourceStyle(local)
      ? materializeStyleForEntity(entity, wipeReveal.fromStyle(local), local)
      : undefined;
  const paintContext = targetStyle?.context ?? local;
  const targetOpacity = wipeReveal ? opacityForStyle(entity, paintContext) : 1;
  ctx.save();
  const transform = entity.transform;
  if (transform) {
    const opacity = wipeReveal ? 1 : transform.opacity(local);
    if (!Number.isFinite(opacity) || opacity <= 0) {
      ctx.restore();
      return;
    }
    const origin = center(entity);
    const pivot = resolveTransformPivot(entity, local);
    if (pivot.x !== origin.x || pivot.y !== origin.y) {
      ctx.translate(pivot.x - origin.x, pivot.y - origin.y);
    }
    ctx.globalAlpha = ctx.globalAlpha * opacity;
    transform.applyTo(ctx, local, true, transform.renderPosition(local, entity.layoutPosition, relativeAnimationOffsetFor(entity, local)));
    const dimensions = toVec2(transform.getProp('dimensions')?.resolve(local) ?? { x: 0, y: 0 });
    const renderDimensions = {
      x:
        entity instanceof Row && entity.parentLayoutManagedWidth && entity.box
          ? entity.box.width
          : transform.widthUnit(local) === 'percent' && entity.box
            ? entity.box.width
            : dimensions.x,
      y:
        entity instanceof Row && entity.parentLayoutManagedHeight && entity.box
          ? entity.box.height
          : transform.heightUnit(local) === 'percent' && entity.box
            ? entity.box.height
            : dimensions.y,
    };
    if (
      entity.box &&
      renderDimensions.x > 0 &&
      renderDimensions.y > 0 &&
      entity.box.width > 0 &&
      entity.box.height > 0
    ) {
      ctx.scale(renderDimensions.x / entity.box.width, renderDimensions.y / entity.box.height);
    }
    if (pivot.x !== origin.x || pivot.y !== origin.y) {
      ctx.translate(origin.x - pivot.x, origin.y - pivot.y);
    }
  }
  if (entity instanceof Row) {
    const { parentLayoutScaleX, parentLayoutScaleY } = entity;
    if (
      Number.isFinite(parentLayoutScaleX) &&
      Number.isFinite(parentLayoutScaleY) &&
      parentLayoutScaleX > 0 &&
      parentLayoutScaleY > 0 &&
      (parentLayoutScaleX !== 1 || parentLayoutScaleY !== 1)
    ) {
      ctx.scale(parentLayoutScaleX, parentLayoutScaleY);
    }
  }

  if (skipEffects) {
    paintSubtreeWithoutEffects(entity, ctx, paintContext, options);
    ctx.restore();
    return;
  }

  if (wipeReveal && targetStyle) {
    renderWipeRevealNode(entity, ctx, local, options, parent, wipeReveal, targetStyle, alternateStyle);
    ctx.restore();
    return;
  }

  if (entity.effects.length > 0 && entity.children.length > 0) {
    // Group effects wrap the entity's own surface and its whole subtree.
    renderGrouped(
      entity,
      ctx,
      local,
      options,
      paintContext,
      targetOpacity,
    );
  } else if (entity.effects.length > 0) {
    // Leaf effects wrap only the entity's own surface.
    renderEffectStack(
      ctx,
      local,
      entity.effects,
      (output) => paintWithOpacity(output, targetOpacity, (layer) => paintLocal(entity, layer, paintContext, true)),
      (effect, output, input, effectContext, baseTransform, baseLayer) =>
        renderWrappedEffect(effect, output, input, effectContext, {
          baseTransform,
          baseInput: baseLayer,
          localizeSignalEffects: true,
          ...(entity.box ? { paintBounds: entity.box } : {}),
        }),
      {
        renderBaseContent: (output) => paintLocal(entity, output, paintContext, true, false),
      },
    );
  } else {
    paintSubtree(entity, ctx, local, options);
  }

  ctx.restore();
}

/**
 * Render a laid-out tree onto `ctx`. The tree must already have `box`es
 * assigned (see `layoutScene`). `ctx` uses absolute canvas coordinates.
 */
export function renderScene(
  root: PhysicalEntity,
  ctx: CanvasContext2D,
  rctx: ResolveContext,
  options: SceneRenderOptions = {},
): void {
  rctx = prepareAnimationContext(root, rctx);
  rctx = prepareFollowContext(root, rctx);
  rctx = prepareTransitionContext(root, rctx);
  if (options.blendModeLayerCollector) {
    rctx = { ...rctx, blendModeLayerCollector: options.blendModeLayerCollector };
  }
  updateFollowedBackgroundRenderGeometry(root, rctx);
  const rootCenter = center(root);
  ctx.save();
  ctx.translate(rootCenter.x, rootCenter.y);
  renderNode(root, ctx, rctx, options);
  ctx.restore();
}
