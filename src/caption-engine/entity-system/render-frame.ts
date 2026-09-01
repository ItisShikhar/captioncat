import { Canvas } from '#platform/canvas.js';
import { prepareAnimationContext, relativeAnimationOffsetFor } from './animation';
import { prepareFollowContext } from './follow';
import { prepareTransitionContext } from './transitions';
import { BackgroundStyle, Image, LayoutMotion } from './components';
import type { Component } from './components/component';
import type { Effect } from './effects/effect';
import { ImageFlowEntity, Marker, Page, PhysicalEntity, Row, Viewport, Word } from './physical-entities';
import { contentClipBox, resolveTransformPivot } from './layout-engine';
import { collectResolvedPaintOrders, resolvedZIndex } from './paint-order';
import { markerAppearance, renderScene } from './scene-render';
import { addMargins, type Box, type Margins, type ResolveContext, type RowState, type Vector2, type WordState, toVec2 } from './types';
import type { CaptionDebugPropertyOverride } from '../render-types';
import type { Property } from './property';

/** Running canvas-space min/max accumulator for a crop box (see accumulateContentBounds). */
export interface BoundsAccumulator {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ContentBoundsOptions {
  ignoreContentClip?: boolean;
  /** Include enabled Page and Row motion hosts in the crop before motion runs. */
  includeLayoutMotionBounds?: boolean;
}

export const emptyBounds = (): BoundsAccumulator => ({
  minX: Number.POSITIVE_INFINITY,
  minY: Number.POSITIVE_INFINITY,
  maxX: Number.NEGATIVE_INFINITY,
  maxY: Number.NEGATIVE_INFINITY,
});

function boundsToBox(bounds: BoundsAccumulator): Box | null {
  if (!Number.isFinite(bounds.minX)) return null;
  return {
    x: bounds.minX,
    y: bounds.minY,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
  };
}

function boxToBounds(box: Box): BoundsAccumulator {
  return {
    minX: box.x,
    minY: box.y,
    maxX: box.x + box.width,
    maxY: box.y + box.height,
  };
}

function debugBoxToBounds(box: DebugBox): BoundsAccumulator {
  return {
    minX: box.left,
    minY: box.top,
    maxX: box.right,
    maxY: box.bottom,
  };
}

function intersectBoxes(left: Box, right: Box): Box | null {
  const x0 = Math.max(left.x, right.x);
  const y0 = Math.max(left.y, right.y);
  const x1 = Math.min(left.x + left.width, right.x + right.width);
  const y1 = Math.min(left.y + left.height, right.y + right.height);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

// 2D affine [a,b,c,d,e,f], mapping (x,y) -> (a*x + c*y + e, b*x + d*y + f) - the
// same convention as the canvas CTM. Used to project each entity's local box into
// canvas space so the crop encloses rotated/scaled content (for example, a tilted
// sticker) instead of clipping it to its axis-aligned layout box.
type Affine = [number, number, number, number, number, number];
const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

function mul(m: Affine, t: Affine): Affine {
  return [
    m[0] * t[0] + m[2] * t[1],
    m[1] * t[0] + m[3] * t[1],
    m[0] * t[2] + m[2] * t[3],
    m[1] * t[2] + m[3] * t[3],
    m[0] * t[4] + m[2] * t[5] + m[4],
    m[1] * t[4] + m[3] * t[5] + m[5],
  ];
}

const translate = (x: number, y: number): Affine => [1, 0, 0, 1, x, y];

function projectBounds(m: Affine, box: Box): Box {
  const acc = emptyBounds();
  unionRect(acc, m, box.x, box.y, box.x + box.width, box.y + box.height);
  return boundsToBox(acc) ?? { x: box.x, y: box.y, width: box.width, height: box.height };
}

/** The entity's own transform (rotation->scale->position), mirroring the renderer. */
function transformOf(entity: PhysicalEntity, rctx: ResolveContext): Affine {
  const t = entity.transform;
  if (!t) return IDENTITY;
  let m = IDENTITY;
  const rotation = Number(t.getProp<number>('rotation')?.resolve(rctx) ?? 0);
  if (rotation !== 0) {
    const rad = (rotation * Math.PI) / 180;
    m = mul(m, [Math.cos(rad), Math.sin(rad), -Math.sin(rad), Math.cos(rad), 0, 0]);
  }
  const scale = toVec2(t.getProp<Vector2>('scale')?.resolve(rctx) ?? { x: 1, y: 1 });
  if (scale.x !== 1 || scale.y !== 1) m = mul(m, [scale.x, 0, 0, scale.y, 0, 0]);
  const position = t.renderPosition(rctx, entity.layoutPosition, relativeAnimationOffsetFor(entity, rctx));
  if (position.x !== 0 || position.y !== 0) m = mul(m, translate(position.x, position.y));
  return m;
}

function boxCenter(entity: PhysicalEntity): { x: number; y: number } {
  const box = entity.box;
  return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : { x: 0, y: 0 };
}

function selfMarginsForEntity(entity: PhysicalEntity, rctx: ResolveContext): Margins {
  let margins = entity.getSelfMargins(rctx);
  if (!(entity instanceof Marker) || !entity.box) return margins;

  const appearance = markerAppearance(entity, rctx);
  if (!appearance.effects || appearance.effects.length === 0) return margins;
  const source = { bounds: { width: entity.box.width, height: entity.box.height } };
  const effectsContext = appearance.effectsContext ?? rctx;
  for (const effect of appearance.effects) {
    if (!effect.isEnabled(effectsContext)) continue;
    margins = addMargins(margins, effect.getMargins(effectsContext, source));
  }
  return margins;
}

/** Project a local rect's 4 corners through `m` and union them into `acc`. */
function unionRect(acc: BoundsAccumulator, m: Affine, x0: number, y0: number, x1: number, y1: number): void {
  const corners: Array<[number, number]> = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  for (const [x, y] of corners) {
    const cx = m[0] * x + m[2] * y + m[4];
    const cy = m[1] * x + m[3] * y + m[5];
    acc.minX = Math.min(acc.minX, cx);
    acc.minY = Math.min(acc.minY, cy);
    acc.maxX = Math.max(acc.maxX, cx);
    acc.maxY = Math.max(acc.maxY, cy);
  }
}

function mergeInto(target: BoundsAccumulator, src: BoundsAccumulator): void {
  target.minX = Math.min(target.minX, src.minX);
  target.minY = Math.min(target.minY, src.minY);
  target.maxX = Math.max(target.maxX, src.maxX);
  target.maxY = Math.max(target.maxY, src.maxY);
}

/**
 * Accumulate the canvas-space bounds of everything `root` inks into `acc`. Walks
 * the tree exactly like the renderer (renderScene/renderNode): accumulate each
 * entity's transform around its resolved pivot, then project the local corners of its
 * own box (Word/Row/ImageFlowEntity) and each boxy component (backgrounds/borders). Because the
 * corners are transformed, rotated or scaled content is fully enclosed rather
 * than clipped to its axis-aligned layout box. A container entity's grouped
 * effects (effects + children) bleed around the flattened subtree in canvas
 * space, so its subtree bounds are expanded by those effect margins (Word/Row
 * leaf effects are already covered by `getSelfMargins`). Pass a shared `acc` to
 * union the bounds across many scenes (the pipeline's stable global crop).
 */
export function accumulateContentBounds(
  root: PhysicalEntity,
  rctx: ResolveContext,
  acc: BoundsAccumulator,
  options: ContentBoundsOptions = {},
): void {
  rctx = prepareAnimationContext(root, rctx);
  rctx = prepareFollowContext(root, rctx);
  rctx = prepareTransitionContext(root, rctx);
  const walk = (entity: PhysicalEntity, parent: Affine, clipBounds: Box | null): BoundsAccumulator => {
    const sub = emptyBounds();
    const local = entity.contextFor(rctx);
    const here = boxCenter(entity);
    const pivot = resolveTransformPivot(entity, local);
    let m = parent;
    if (pivot.x !== here.x || pivot.y !== here.y) {
      m = mul(m, translate(pivot.x - here.x, pivot.y - here.y));
    }
    m = mul(m, transformOf(entity, local));
    if (pivot.x !== here.x || pivot.y !== here.y) {
      m = mul(m, translate(here.x - pivot.x, here.y - pivot.y));
    }
    if (entity instanceof Row) {
      m = mul(m, [
        entity.parentLayoutScaleX,
        0,
        0,
        entity.parentLayoutScaleY,
        0,
        0,
      ]);
    }
    const box = entity.box;
    if ((entity instanceof Word || entity instanceof Row || entity instanceof Marker) && box) {
      const margins = selfMarginsForEntity(entity, local);
      const hw = box.width / 2;
      const hh = box.height / 2;
      unionRect(sub, m, -hw - margins.x, -hh - margins.y, hw + margins.x, hh + margins.y);
    }
    if (
      options.includeLayoutMotionBounds &&
      box &&
      (entity instanceof Page || entity instanceof Row) &&
      entity.getComponent<LayoutMotion>('layoutMotion')?.enabled(local)
    ) {
      unionRect(sub, m, -box.width / 2, -box.height / 2, box.width / 2, box.height / 2);
    }
    if (
      options.includeLayoutMotionBounds &&
      entity instanceof Page &&
      box &&
      entity.children.some(
        (child) =>
          child instanceof Row &&
          child.getComponent<LayoutMotion>('layoutMotion')?.enabled(child.contextFor(rctx)),
      )
    ) {
      unionRect(sub, m, -box.width / 2, -box.height / 2, box.width / 2, box.height / 2);
    }
    const cx = box ? box.x + box.width / 2 : 0;
    const cy = box ? box.y + box.height / 2 : 0;

    for (const component of entity.components) {
      if (component instanceof Image) {
        if (!component.isEnabled(local) || !box) continue;
        unionRect(sub, m, -box.width / 2, -box.height / 2, box.width / 2, box.height / 2);
        continue;
      }
      if (component instanceof BackgroundStyle) {
        if (component.getProp<boolean>('enabled')?.resolve(local) === false) continue;
        const ownerClip =
          component.overflowMode(local) === 'clipToOwner' && box
            ? { x: -box.width / 2, y: -box.height / 2, width: box.width, height: box.height }
            : undefined;
        const unionBackgroundBounds = (candidate: Box): void => {
          const clipped = ownerClip ? intersectBoxes(candidate, ownerClip) : candidate;
          if (!clipped) return;
          unionRect(sub, m, clipped.x, clipped.y, clipped.x + clipped.width, clipped.y + clipped.height);
        };
        if (entity instanceof Viewport) continue;
        const resolvedRowBoxes = component.resolvedRowBoxes(local);
        if (resolvedRowBoxes && resolvedRowBoxes.length > 0) {
          for (const row of resolvedRowBoxes) {
            unionBackgroundBounds({ x: row.x - cx, y: row.y - cy, width: row.width, height: row.height });
          }
          const resolvedBox = component.bounds(local);
          const source = resolvedBox ? { bounds: { width: resolvedBox.width, height: resolvedBox.height } } : undefined;
          const margins = source ? component.getMargins(local, source) : component.getMargins(local);
          if (resolvedBox && (margins.x > 0 || margins.y > 0)) {
            unionBackgroundBounds({
              x: resolvedBox.x - cx - margins.x,
              y: resolvedBox.y - cy - margins.y,
              width: resolvedBox.width + margins.x * 2,
              height: resolvedBox.height + margins.y * 2,
            });
          }
          continue;
        }
        const bgBox = component.bounds(local) ?? box;
        if (bgBox) {
          unionBackgroundBounds({ x: bgBox.x - cx, y: bgBox.y - cy, width: bgBox.width, height: bgBox.height });
        }
        continue;
      }
      if (!component.box) continue;
      const source = component.box
        ? { bounds: { width: component.box.width, height: component.box.height } }
        : box
          ? { bounds: { width: box.width, height: box.height } }
          : undefined;
      const margins = source ? component.getMargins(local, source) : component.getMargins(local);
      const bx = component.box.x - cx;
      const by = component.box.y - cy;
      unionRect(sub, m, bx - margins.x, by - margins.y, bx + component.box.width + margins.x, by + component.box.height + margins.y);
    }

    const localClip = options.ignoreContentClip ? undefined : contentClipBox(entity, local);
    const childClip = localClip ? projectBounds(m, localClip) : null;
    const nextClip = clipBounds && childClip ? intersectBoxes(clipBounds, childClip) : clipBounds ?? childClip;

    for (const child of entity.children) {
      const there = boxCenter(child);
      mergeInto(sub, walk(child, mul(m, translate(there.x - here.x, there.y - here.y)), nextClip));
    }

    // Container-level grouped effects post-process the flattened subtree in
    // canvas space. Expand its bounds by the combined margin. Word and Row leaf
    // effects are already in getSelfMargins above, so skip them here.
    if (entity.effects.length > 0 && !(entity instanceof Word || entity instanceof Row) && Number.isFinite(sub.minX)) {
      let ex = 0;
      let ey = 0;
      for (const effect of entity.effects) {
        if (!effect.isEnabled(local)) continue;
        const source = entity.box
          ? { bounds: { width: entity.box.width, height: entity.box.height } }
          : undefined;
        const em = source ? effect.getMargins(local, source) : effect.getMargins(local);
        ex += em.x;
        ey += em.y;
      }
      sub.minX -= ex;
      sub.maxX += ex;
      sub.minY -= ey;
      sub.maxY += ey;
    }

    if (!clipBounds) return sub;
    const own = boundsToBox(sub);
    if (!own) return emptyBounds();
    const clipped = intersectBoxes(own, clipBounds);
    return clipped ? boxToBounds(clipped) : emptyBounds();
  };
  const rootCenter = boxCenter(root);
  mergeInto(acc, walk(root, translate(rootCenter.x, rootCenter.y), null));
}

/**
 * Render-to-bitmap API: crops a laid-out scene to the tight box its words
 * ink (each word's box expanded by its own `getSelfMargins` - stroke,
 * shadow, border, blur, motion-blur bleed) and paints it onto a canvas of
 * exactly that size. This is the class-based, compositional replacement for the
 * legacy `getAutoCropContentSize` + `getCaptionEffectMargins` pair, whose
 * hand-maintained per-axis margin math was a recurring bug source (MEMORY
 * 2026-08-15). The scene must already be laid out (see `layoutScene`).
 *
 * Note: the crop is computed at the supplied `rctx` instant. A stable
 * frame-size across a whole word's frames (worst case over progress) is a
 * follow-up for the pipeline-wiring phase.
 */

export interface CaptionFrame {
  /** The rendered canvas (skia-canvas). */
  canvas: Canvas;
  /** PNG-encoded bytes of `canvas`. */
  buffer: Buffer;
  /** Raw RGBA bytes of `canvas` (width*height*4). */
  rgba: Buffer;
  /** Bitmap dimensions (== the tight content box, rounded up). */
  frameSize: { width: number; height: number };
  /** The tight content box in scene (canvas) coordinates before cropping. */
  contentBox: Box;
}

/** A point in composition space (see `collectDebugFrame`). */
export interface DebugPoint {
  x: number;
  y: number;
}

/** An axis-aligned rectangle in composition space. */
export interface DebugBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A (possibly rotated) word quad in composition space. */
export interface DebugQuad {
  topLeft: DebugPoint;
  topRight: DebugPoint;
  bottomRight: DebugPoint;
  bottomLeft: DebugPoint;
}

export interface DebugTransform {
  id: string;
  sourceId?: string | undefined;
  entity: string;
  position: DebugPoint;
  positionAnchor: DebugPoint;
  dimensions: DebugPoint;
  zIndex?: number;
  drawRank?: number;
  drivenBy?: string;
  propertyOverrides?: Record<string, CaptionDebugPropertyOverride>;
  contentBounds?: DebugBox;
}

function propertyOverrideFor(
  property: Property<unknown>,
  rctx: ResolveContext,
  source: string,
  type: CaptionDebugPropertyOverride['type'],
): CaptionDebugPropertyOverride | undefined {
  if (rctx.animationOverrides?.has(property)) {
    return { value: property.resolve(rctx), source: 'Animation', type: 'animation' };
  }
  if (rctx.transitionOverrides?.has(property)) {
    return { value: property.resolve(rctx), source: 'Transition', type: 'system' };
  }
  if (rctx.followOverrides?.has(property)) {
    return { value: property.resolve(rctx), source: 'Follow Target', type: 'component' };
  }
  if (!property.hasResolvedValue) return undefined;
  return { value: property.resolve(rctx), source, type };
}

function collectPropertyOverrides(entity: PhysicalEntity, rctx: ResolveContext): Record<string, CaptionDebugPropertyOverride> {
  const overrides: Record<string, CaptionDebugPropertyOverride> = {};
  const addProperties = (
    properties: ReadonlyMap<string, Property<unknown>>,
    prefix: string,
    source: string,
    type: CaptionDebugPropertyOverride['type'],
  ): void => {
    for (const [key, property] of properties) {
      const override = propertyOverrideFor(property, rctx, source, type);
      if (!override) continue;
      overrides[`${prefix}.${key}`] = override;
      if (override.value && typeof override.value === 'object' && !Array.isArray(override.value)) {
        const vector = override.value as { x?: unknown; y?: unknown };
        if (typeof vector.x === 'number') {
          overrides[`${prefix}.${key}.x`] = { ...override, value: vector.x };
        }
        if (typeof vector.y === 'number') {
          overrides[`${prefix}.${key}.y`] = { ...override, value: vector.y };
        }
      }
    }
  };
  const visitComponent = (component: Component, prefix: string): void => {
    addProperties(component.props, prefix, `${component.type} resolver`, 'component');
    component.components.forEach((child, index) => visitComponent(child, `${prefix}.${child.type}[${index}]`));
    component.effects.forEach((effect, index) => visitEffect(effect, `${prefix}.effect:${effect.type}[${index}]`));
  };
  const visitEffect = (effect: Effect, prefix: string): void => {
    addProperties(effect.props, prefix, `${effect.type} effect`, 'effect');
  };
  entity.components.forEach((component) => visitComponent(component, component.type));
  entity.effects.forEach((effect, index) => visitEffect(effect, `effect:${effect.type}[${index}]`));
  return overrides;
}

function layoutMotionDrivenEntitiesForDebug(root: PhysicalEntity, rctx: ResolveContext): ReadonlySet<PhysicalEntity> {
  const driven = new Set<PhysicalEntity>();
  root.traverse((entity) => {
    if (entity instanceof Page) {
      const motion = entity.getComponent<LayoutMotion>('layoutMotion');
      const local = entity.contextFor(rctx);
      if (!motion || !motion.enabled(local)) return;
      for (const child of entity.children) {
        if (child instanceof Row) driven.add(child);
      }
      return;
    }
    if (entity instanceof Row) {
      const motion = entity.getComponent<LayoutMotion>('layoutMotion');
      const local = entity.contextFor(rctx);
      if (!motion || !motion.enabled(local)) return;
      if (!entity.children.some((child) => child instanceof Word && child.state === 'current' && !!child.box)) return;
      entity.traverse((child) => driven.add(child));
    }
  });
  return driven;
}

export interface DebugBackground {
  id: string;
  sourceId?: string | undefined;
  entity: string;
  instanceIndex?: number | undefined;
  bandPadding: DebugBox[];
  blockPadding: DebugBox[];
}

/**
 * Per-frame Page/Row/Word/BackgroundStyle geometry for a laid-out scene, in absolute
 * composition space (top-left origin, pre-crop). The pipeline shifts these by
 * the crop origin to emit `CaptionDebugLayout.frames`. Rows/Page are the
 * axis-aligned envelope of their descendants, so they nest (Page ⊇ Row ⊇ Word).
 * Words are quads so a word's own `rotation` is preserved.
 */
export interface DebugFrameGeometry {
  page: DebugBox;
  /** Axis-aligned bounds of all caption pixels, including background bands and effects. */
  contentBounds?: DebugBox;
  rows: Array<DebugBox & { rowIndex: number; state: RowState }>;
  words: Array<DebugQuad & { rowIndex: number; word: string; state: WordState }>;
  backgrounds: DebugBackground[];
  transforms: DebugTransform[];
}

/** Project a local rect (centered at origin, half-extents hw/hh) through `m`. */
function projectQuad(m: Affine, hw: number, hh: number): DebugQuad {
  const corner = (x: number, y: number): DebugPoint => ({
    x: m[0] * x + m[2] * y + m[4],
    y: m[1] * x + m[3] * y + m[5],
  });
  return { topLeft: corner(-hw, -hh), topRight: corner(hw, -hh), bottomRight: corner(hw, hh), bottomLeft: corner(-hw, hh) };
}

function projectPoint(m: Affine, x: number, y: number): DebugPoint {
  return {
    x: m[0] * x + m[2] * y + m[4],
    y: m[1] * x + m[3] * y + m[5],
  };
}

/** Axis-aligned envelope of a quad. */
function quadEnvelope(quad: DebugQuad): DebugBox {
  const xs = [quad.topLeft.x, quad.topRight.x, quad.bottomRight.x, quad.bottomLeft.x];
  const ys = [quad.topLeft.y, quad.topRight.y, quad.bottomRight.y, quad.bottomLeft.y];
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

function addResolvedLayoutDimensionOverrides(
  entity: PhysicalEntity,
  rctx: ResolveContext,
  overrides: Record<string, CaptionDebugPropertyOverride>,
): void {
  const transform = entity.transform;
  const box = entity.box;
  if (!transform || !box) return;

  const widthMode = transform.widthMode(rctx);
  const heightMode = transform.heightMode(rctx);
  const isCaptionLayoutSizedEntity = entity instanceof Page || entity instanceof Row;
  const widthIsCaptionLayoutSized =
    isCaptionLayoutSizedEntity && widthMode === 'custom' && transform.authoredDimension('x', rctx) === undefined;
  const heightIsCaptionLayoutSized =
    isCaptionLayoutSizedEntity && heightMode === 'custom' && transform.authoredDimension('y', rctx) === undefined;
  const resolvedWidthMode =
    entity instanceof Page && entity.captionLayoutManagedWidth
      ? 'fitChildren'
      : widthIsCaptionLayoutSized
        ? 'fitContent'
        : widthMode !== 'custom'
          ? widthMode
          : undefined;
  const resolvedHeightMode =
    entity instanceof Page && entity.captionLayoutManagedHeight
      ? 'fitChildren'
      : heightIsCaptionLayoutSized
        ? 'fitContent'
        : heightMode !== 'custom'
          ? heightMode
          : undefined;

  if (widthMode !== 'custom' || widthIsCaptionLayoutSized) {
    const widthSource =
      entity instanceof Page && entity.captionLayoutManagedWidth
        ? 'Caption Layout (Natural Width)'
        : widthMode === 'custom'
          ? 'Caption Layout'
          : `Width ${widthMode}`;
    overrides['transform.dimensions.x'] = {
      value: box.width,
      source: widthSource,
      type: 'layout',
    };
    if (resolvedWidthMode) {
      overrides['transform.widthMode'] = {
        value: resolvedWidthMode,
        source: widthSource,
        type: 'layout',
      };
    }
  }
  if (heightMode !== 'custom' || heightIsCaptionLayoutSized) {
    const heightSource =
      entity instanceof Page && entity.captionLayoutManagedHeight
        ? 'Caption Layout (Fixed Rows)'
        : heightMode === 'custom'
          ? 'Caption Layout'
          : `Height ${heightMode}`;
    overrides['transform.dimensions.y'] = {
      value: box.height,
      source: heightSource,
      type: 'layout',
    };
    if (resolvedHeightMode) {
      overrides['transform.heightMode'] = {
        value: resolvedHeightMode,
        source: heightSource,
        type: 'layout',
      };
    }
  }
  if (entity instanceof Row && entity.parentLayoutManagedWidth) {
    overrides['transform.dimensions.x'] = {
      value: box.width,
      source: 'Page Layout',
      type: 'layout',
      chain: ['Page horizontal alignment: Stretch', 'Page horizontal single-item alignment: Justify', 'Row width is controlled by Page'],
    };
    overrides['transform.widthMode'] = {
      value: 'fitParent',
      source: 'Page Layout',
      type: 'layout',
      chain: ['Page horizontal alignment: Stretch', 'Page horizontal single-item alignment: Justify'],
    };
  }
  if (entity instanceof Row && entity.parentLayoutManagedHeight) {
    overrides['transform.dimensions.y'] = {
      value: box.height,
      source: 'Page Layout',
      type: 'layout',
      chain: ['Page vertical alignment: Stretch', 'Page vertical single-item alignment: Justify', 'Row height is controlled by Page'],
    };
    overrides['transform.heightMode'] = {
      value: 'fitParent',
      source: 'Page Layout',
      type: 'layout',
      chain: ['Page vertical alignment: Stretch', 'Page vertical single-item alignment: Justify'],
    };
  }
}

/**
 * Walk a laid-out scene exactly like `accumulateContentBounds`/the renderer,
 * accumulating each entity's transform around its box center. Collect
 * per-entity Page/Row/Word/BackgroundStyle geometry (composition space) for editor debug
 * overlays. Word quads preserve rotation. Row boxes are the axis-aligned
 * envelope of their descendants. The Page box follows its own transform.
 * This data supports tools only. Production rendering does not use it.
 */
export function collectDebugFrame(
  root: PhysicalEntity,
  rctx: ResolveContext,
  options: ContentBoundsOptions = {},
): DebugFrameGeometry {
  rctx = prepareAnimationContext(root, rctx);
  rctx = prepareFollowContext(root, rctx);
  rctx = prepareTransitionContext(root, rctx);
  const rows: Array<DebugBox & { rowIndex: number; state: RowState }> = [];
  const words: Array<DebugQuad & { rowIndex: number; word: string; state: WordState }> = [];
  const backgrounds: DebugBackground[] = [];
  const transforms: DebugTransform[] = [];
  let markerInstanceIndex = 0;
  const pageAcc = emptyBounds();
  const pageEntityAcc = emptyBounds();
  const paintOrderByEntity = collectResolvedPaintOrders(root, rctx);
  const layoutMotionDrivenEntities = layoutMotionDrivenEntitiesForDebug(root, rctx);

  const unionBox = (box: DebugBox): void => {
    pageAcc.minX = Math.min(pageAcc.minX, box.left);
    pageAcc.minY = Math.min(pageAcc.minY, box.top);
    pageAcc.maxX = Math.max(pageAcc.maxX, box.right);
    pageAcc.maxY = Math.max(pageAcc.maxY, box.bottom);
  };

  const walk = (entity: PhysicalEntity, parent: Affine, rowIndex: number): void => {
    const local = entity.contextFor(rctx);
    const here = boxCenter(entity);
    const pivot = resolveTransformPivot(entity, local);
    let m = parent;
    if (pivot.x !== here.x || pivot.y !== here.y) {
      m = mul(m, translate(pivot.x - here.x, pivot.y - here.y));
    }
    m = mul(m, transformOf(entity, local));
    if (pivot.x !== here.x || pivot.y !== here.y) {
      m = mul(m, translate(here.x - pivot.x, here.y - pivot.y));
    }
    if (entity instanceof Row) {
      m = mul(m, [
        entity.parentLayoutScaleX,
        0,
        0,
        entity.parentLayoutScaleY,
        0,
        0,
      ]);
    }
    const box = entity.box;
    const currentMarkerInstanceIndex =
      entity instanceof Marker && box && entity.transform ? markerInstanceIndex++ : undefined;
    if (box && entity.transform) {
      const anchor = projectPoint(m, -box.width / 2, -box.height / 2);
      const relativeOffset = relativeAnimationOffsetFor(entity, local);
      const position =
        entity instanceof Marker
          ? entity.transform.renderPosition(local, entity.layoutPosition, relativeOffset)
          : (() => {
              const authored = entity.transform!.position(local);
              return { x: authored.x + relativeOffset.x, y: authored.y + relativeOffset.y };
            })();
      const margins = entity instanceof Marker ? entity.getSelfMargins(local) : undefined;
      const contentBounds =
        margins
          ? quadEnvelope(projectQuad(m, box.width / 2 + margins.x, box.height / 2 + margins.y))
          : undefined;
      const propertyOverrides = collectPropertyOverrides(entity, local);
      if (entity.transform) {
        addResolvedLayoutDimensionOverrides(entity, local, propertyOverrides);
        if (entity instanceof Marker && entity.markerBehavior) {
          delete propertyOverrides['transform.position.x'];
          delete propertyOverrides['transform.position.y'];
          propertyOverrides['transform.position'] = {
            value: anchor,
            source: 'Marker Behaviour',
            type: 'component',
          };
        }
        if (layoutMotionDrivenEntities.has(entity)) {
          delete propertyOverrides['transform.position.x'];
          delete propertyOverrides['transform.position.y'];
          propertyOverrides['transform.position'] = {
            value: { x: box.x, y: box.y },
            source: 'Layout Motion',
            type: 'layout',
          };
        }
      }
      transforms.push({
        id: entity.id,
        ...(entity.debugSourceId ? { sourceId: entity.debugSourceId } : {}),
        entity: entity.kind,
        position,
        positionAnchor: anchor,
        dimensions: { x: box.width, y: box.height },
        ...(entity instanceof Row || entity instanceof Word ? { state: entity.state } : {}),
        zIndex: resolvedZIndex(entity, local),
        ...(paintOrderByEntity.has(entity) ? { drawRank: paintOrderByEntity.get(entity)!.drawRank } : {}),
        ...(entity instanceof Marker && entity.markerBehavior ? { drivenBy: 'Marker Behaviour' } : {}),
        ...(layoutMotionDrivenEntities.has(entity) ? { drivenBy: 'Layout Motion' } : {}),
        ...(Object.keys(propertyOverrides).length > 0 ? { propertyOverrides } : {}),
        ...(contentBounds ? { contentBounds } : {}),
      });
    }
    if (entity instanceof Word && box) {
      const quad = projectQuad(m, box.width / 2, box.height / 2);
      words.push({ ...quad, rowIndex, word: entity.text, state: entity.state });
      unionBox(quadEnvelope(quad));
    } else if (entity instanceof ImageFlowEntity && box && entity.getComponent('image')?.isEnabled(local) !== false) {
      unionBox(quadEnvelope(projectQuad(m, box.width / 2, box.height / 2)));
    } else if (entity instanceof Row && box) {
      const envelope = quadEnvelope(projectQuad(m, box.width / 2, box.height / 2));
      rows.push({ ...envelope, rowIndex, state: entity.state });
      unionBox(envelope);
    } else if (entity instanceof Page && box) {
      mergeInto(pageEntityAcc, debugBoxToBounds(quadEnvelope(projectQuad(m, box.width / 2, box.height / 2))));
    }

    if (!(entity instanceof Viewport)) {
      const instanceIndex =
        entity instanceof Row
          ? rowIndex
          : entity instanceof Word && box
            ? words.length - 1
            : currentMarkerInstanceIndex;
      const projectBackgroundBox = (backgroundBox: Box): DebugBox => {
        const projected = projectBounds(m, {
          x: backgroundBox.x - here.x,
          y: backgroundBox.y - here.y,
          width: backgroundBox.width,
          height: backgroundBox.height,
        });
        return {
          left: projected.x,
          top: projected.y,
          right: projected.x + projected.width,
          bottom: projected.y + projected.height,
        };
      };
      for (const component of entity.components) {
        if (!(component instanceof BackgroundStyle)) continue;
        const debugGeometry = component.resolvedDebugGeometry(local);
        if (!debugGeometry) continue;
        backgrounds.push({
          id: entity.id,
          ...(entity.debugSourceId ? { sourceId: entity.debugSourceId } : {}),
          entity: entity.kind,
          ...(instanceIndex === undefined ? {} : { instanceIndex }),
          bandPadding: debugGeometry.bandPaddingBands.map(projectBackgroundBox),
          blockPadding: debugGeometry.blockPaddingBands.map(projectBackgroundBox),
        });
      }
    }

    let nextRowIndex = 0;
    for (const child of entity.children) {
      const there = boxCenter(child);
      const childRowIndex = child instanceof Row ? nextRowIndex++ : rowIndex;
      walk(child, mul(m, translate(there.x - here.x, there.y - here.y)), childRowIndex);
    }
  };
  walk(root, translate(boxCenter(root).x, boxCenter(root).y), -1);

  const pageBounds = Number.isFinite(pageEntityAcc.minX) ? pageEntityAcc : pageAcc;
  const page: DebugBox = Number.isFinite(pageBounds.minX)
    ? { left: pageBounds.minX, top: pageBounds.minY, right: pageBounds.maxX, bottom: pageBounds.maxY }
    : quadEnvelope(projectQuad(translate(boxCenter(root).x, boxCenter(root).y), 0, 0));
  const inkBounds = contentBounds(root, rctx, options);
  rows.sort((a, b) => a.rowIndex - b.rowIndex);
  return {
    page,
    ...(inkBounds
      ? {
          contentBounds: {
            left: inkBounds.x,
            top: inkBounds.y,
            right: inkBounds.x + inkBounds.width,
            bottom: inkBounds.y + inkBounds.height,
          },
        }
      : {}),
    rows,
    words,
    backgrounds,
    transforms,
  };
}

/** Collect the settled local Transform values and resolved layout sizes for the inspector. */
export function collectDebugTransforms(root: PhysicalEntity, rctx: ResolveContext): DebugTransform[] {
  const transforms: DebugTransform[] = [];
  const paintOrderByEntity = collectResolvedPaintOrders(root, rctx);
  const layoutMotionDrivenEntities = layoutMotionDrivenEntitiesForDebug(root, rctx);
  root.traverse((entity) => {
    if (!entity.box) return;
    const local = entity.contextFor(rctx);
    const relativeOffset = relativeAnimationOffsetFor(entity, local);
    const position =
      entity instanceof Marker && entity.transform
        ? entity.transform.renderPosition(local, entity.layoutPosition, relativeOffset)
        : (() => {
            const authored = entity.transform?.position(local) ?? { x: 0, y: 0 };
            return { x: authored.x + relativeOffset.x, y: authored.y + relativeOffset.y };
          })();
    const propertyOverrides = collectPropertyOverrides(entity, local);
    if (entity.transform) {
      addResolvedLayoutDimensionOverrides(entity, local, propertyOverrides);
      if (entity instanceof Marker && entity.markerBehavior) {
        delete propertyOverrides['transform.position.x'];
        delete propertyOverrides['transform.position.y'];
        propertyOverrides['transform.position'] = {
          value: { x: entity.box.x, y: entity.box.y },
          source: 'Marker Behaviour',
          type: 'component',
        };
      }
      if (layoutMotionDrivenEntities.has(entity)) {
        delete propertyOverrides['transform.position.x'];
        delete propertyOverrides['transform.position.y'];
        propertyOverrides['transform.position'] = {
          value: { x: entity.box.x, y: entity.box.y },
          source: 'Layout Motion',
          type: 'layout',
        };
      }
    }
    transforms.push({
      id: entity.id,
      ...(entity.debugSourceId ? { sourceId: entity.debugSourceId } : {}),
      entity: entity.kind,
      position,
      positionAnchor: { x: entity.box.x, y: entity.box.y },
      dimensions: { x: entity.box.width, y: entity.box.height },
      ...(entity instanceof Row || entity instanceof Word ? { state: entity.state } : {}),
      zIndex: resolvedZIndex(entity, local),
      ...(paintOrderByEntity.has(entity) ? { drawRank: paintOrderByEntity.get(entity)!.drawRank } : {}),
      ...(entity instanceof Marker && entity.markerBehavior ? { drivenBy: 'Marker Behaviour' } : {}),
      ...(layoutMotionDrivenEntities.has(entity) ? { drivenBy: 'Layout Motion' } : {}),
      ...(Object.keys(propertyOverrides).length > 0 ? { propertyOverrides } : {}),
    });
  });
  return transforms;
}

/** Tight canvas-space content box of a laid-out scene. The result is null when nothing paints. */
export function contentBounds(root: PhysicalEntity, rctx: ResolveContext, options: ContentBoundsOptions = {}): Box | null {
  const acc = emptyBounds();
  accumulateContentBounds(root, rctx, acc, options);
  if (!Number.isFinite(acc.minX)) return null;
  return { x: acc.minX, y: acc.minY, width: acc.maxX - acc.minX, height: acc.maxY - acc.minY };
}

/**
 * Render a laid-out `root` into a tightly-cropped bitmap. Returns the canvas,
 * its PNG + raw-RGBA bytes, the resulting `frameSize`, and the pre-crop
 * `contentBox` (useful for computing on-video placement later).
 */
export function renderCaptionFrame(root: PhysicalEntity, rctx: ResolveContext): CaptionFrame {
  const bounds = contentBounds(root, rctx) ?? { x: 0, y: 0, width: 1, height: 1 };
  const width = Math.max(1, Math.ceil(bounds.width));
  const height = Math.max(1, Math.ceil(bounds.height));

  const canvas = new Canvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.translate(-bounds.x, -bounds.y);
  renderScene(root, ctx, rctx);
  ctx.restore();

  return {
    canvas,
    buffer: canvas.toBufferSync('png'),
    rgba: canvas.toBufferSync('raw', { colorType: 'rgba' }),
    frameSize: { width, height },
    contentBox: bounds,
  };
}
