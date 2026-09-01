import { prepareAnimationContext } from './animation';
import {
  BackgroundStyle,
  resolveBackgroundStyleDebugGeometry,
  FollowTarget,
  type Component,
  HorizontalSpacer,
  Image,
  Layout,
  type LayoutChildWindow,
  type LayoutSingleItemAlignment,
  type LayoutChildrenSizing,
  SelfLayout,
  clampSpacerGap,
  Spacer,
  Text,
  Transform,
  type TransformPivot,
  type TransformSizeMode,
  VerticalSpacer,
} from './components';
import type { LayoutMotion } from './components/layout-motion';
import {
  CompositionArea,
  BackgroundEntity,
  ImageFlowEntity,
  Marker,
  Page,
  type PhysicalEntity,
  Row,
  Video,
  VideoArea,
  Viewport,
  Word,
} from './physical-entities';
import { anchorOffsetForBox, prepareFollowContext, resolveFollowTarget, resolvedFollowPosition } from './follow';
import { resolveInsets, type Insets } from './insets';
import { vectorRandomizerAxisBounds, type NumericRandomizerBounds } from './randomizer';
import {
  type Box,
  type CanvasContext2D,
  type ResolveContext,
  toVec2,
  type Vector2,
} from './types';
import type { ResolvedTextDirection } from './text-direction';
import type { RowFontFitPolicy } from './row-fitting';
import { resolveRowFontScale } from './row-fitting';
import { resolveLetterSpacing, segmentTextGraphemes } from './text-layout';

/**
 * Layout engine. It measures each Word's text and assigns a `box` (top-left origin,
 * canvas space) to every entity in the tree. This is the class-based, tree-first
 * replacement for the legacy `computeWordLayout`, which rebuilt anonymous
 * `PositionedWordData`/`CaptionRowLayout` objects every frame. Rows flow words
 * horizontally. Pages stack rows vertically unless a row-layout page contains
 * runtime state rows, which the engine groups into a hidden vertical stack.
 */

export type HorizontalAlign = 'left' | 'center' | 'right' | 'stretch';
export type HorizontalAlignment = 'start' | 'center' | 'end' | 'left' | 'right' | 'stretch';
export type VerticalAlign = 'top' | 'middle' | 'bottom' | 'stretch';
type LayoutMode = 'overlay' | 'row' | 'column';

/**
 * Intrinsic dimensions of a flow image asset, provided by the pipeline after
 * preloading the asset before layout is resolved.
 */
export interface FlowImageMeasurement {
  width: number;
  height: number;
  aspectRatio: number;
  status: 'loaded' | 'failed' | 'unsupported';
}

/** Fallback dimensions used when a flow image asset fails to load. */
const FLOW_IMAGE_FALLBACK: Size = { width: 40, height: 40 };

/**
 * Default content inset (composition units) applied to a compositionArea that
 * declares no Layout of its own -- the safe-area margin that keeps content off
 * the frame edges. Mirrors legacy `DEFAULT_COMPOSITION_AREA_PADDING`.
 */
const DEFAULT_AREA_SAFE_PADDING = 100;
const INFERRED_STATE_STACK_SHAPE_KEY = '__inferred-state-stack__';

export interface LayoutOptions {
  /** Frame size in canvas space. The compositionArea rect is derived within it. */
  width: number;
  height: number;
  /** Frame top-left in canvas space (defaults to 0,0). */
  x?: number;
  y?: number;
  /** Gap between words in a row. The default is the measured space width. */
  wordSpacing?: number;
  /** Gap between rows when the Page has no VerticalSpacer. */
  rowSpacing?: number;
  /** Extra gap before a runtime row, keyed by its pattern index. */
  rowSpacingExtras?: ReadonlyMap<number, number>;
  /** Alignment of the page block inside the area's padded content rect. */
  horizontalAlign?: HorizontalAlignment;
  verticalAlign?: VerticalAlign;
  /** Resolved direction used for horizontal flow placement. */
  textDirection?: ResolvedTextDirection;
  /** Optional flow geometry captured earlier in the same page. */
  stableLayout?: LayoutSnapshot;
  /**
 * Pre-measured intrinsic dimensions of flow image entities, keyed by entity
 * id. Produced by `preloadFlowImageMeasurements` before `layoutScene` is
 * called. When absent, explicit transform dimensions are used as-is and
 * missing dimensions fall back to `FLOW_IMAGE_FALLBACK`.
 */
  flowImageMeasurements?: ReadonlyMap<string, FlowImageMeasurement>;
 /**
 * Optional frame context used to resolve animated spacer properties. Other
 * layout properties continue to use the main resolve context.
 */
 spacingContext?: ResolveContext;
 /** Optional row-wide font fitting policy supplied by the caption pipeline. */
 rowFontFit?: RowFontFitPolicy;
 /** Keep explicit flow gaps when caption content exceeds the page bounds. */
 allowFlowOverflow?: boolean;
}

export interface LayoutSnapshotEntry {
  box: Box;
  layoutPosition: Vector2 | null;
  flowShape?: readonly string[];
}

export type LayoutSnapshot = ReadonlyMap<string, LayoutSnapshotEntry>;

function layoutSnapshotKey(entity: PhysicalEntity): string | undefined {
  if (entity instanceof Page) return `page:${entity.id}`;
  if (entity instanceof Row) {
    const readableId = /^ROW:(?:DEFAULT|PAST|PREVIOUS|CURRENT|NEXT|FUTURE):(\d+)((?::stack\d+)*)$/i.exec(entity.id);
    if (readableId) return `row:${readableId[1]}${readableId[2]}`;
    const legacyId = /^(?:default|past|previous|current|next|future):(.+)$/i.exec(entity.id);
    if (legacyId) return `row:${legacyId[1]}`;
    const suffix = entity.id.slice(entity.id.lastIndexOf(':') + 1);
    return `row:${suffix}`;
  }
  if (entity instanceof Word) {
    const readableId = /^WORD:(?:DEFAULT|PAST|PREVIOUS|CURRENT|NEXT|FUTURE):(\d+)((?::stack\d+)*)$/i.exec(entity.id);
    if (readableId) return `word:${readableId[1]}${readableId[2]}`;
    const legacyId = /^(?:default|past|previous|current|next|future):(.+)$/i.exec(entity.id);
    if (legacyId) return `word:${legacyId[1]}`;
    const suffix = entity.id.slice(entity.id.indexOf(':') + 1);
    return `word:${suffix}`;
  }
  if (entity instanceof ImageFlowEntity) {
    const suffix = entity.id.slice(entity.id.indexOf(':') + 1);
    return `image:${suffix}`;
  }
  return undefined;
}

function stableSnapshotBox(
  entity: PhysicalEntity,
  snapshotBox: Box,
  currentBox: Box,
  rctx: ResolveContext,
): Box {
  const snapshotX = Number.isFinite(snapshotBox.x) ? snapshotBox.x : currentBox.x;
  const snapshotY = Number.isFinite(snapshotBox.y) ? snapshotBox.y : currentBox.y;
  const snapshotWidth = Number.isFinite(snapshotBox.width) ? Math.max(0, snapshotBox.width) : 0;
  const snapshotHeight = Number.isFinite(snapshotBox.height) ? Math.max(0, snapshotBox.height) : 0;
  const width = canExpandDimension(entity, 'x', rctx) ? Math.max(currentBox.width, snapshotWidth) : currentBox.width;
  const height = canExpandDimension(entity, 'y', rctx) ? Math.max(currentBox.height, snapshotHeight) : currentBox.height;
  return {
    // RTL growth keeps the earlier right edge so content expands toward the left.
    x:
      rctx.textDirection === 'rtl' && canExpandDimension(entity, 'x', rctx)
        ? snapshotX + snapshotWidth - width
        : snapshotX,
    // Keep the saved vertical center when a flow container grows. This prevents
    // larger text from growing down from its previous top edge.
    y: height > snapshotHeight && canExpandDimension(entity, 'y', rctx)
      ? snapshotY + (snapshotHeight - height) / 2
      : snapshotY,
    width,
    height,
  };
}

function visibleFlowShape(entity: PhysicalEntity): readonly string[] | undefined {
  if (!(entity instanceof Page || entity instanceof Row)) return undefined;
  const shape = entity.children.flatMap((child) => {
    if (!child.box) return [];
    const key = layoutSnapshotKey(child);
    return key ? [key] : [];
  });
  if (entity instanceof Page && entity.children.some((child) => child instanceof Row && child.state !== 'default')) {
    shape.unshift(INFERRED_STATE_STACK_SHAPE_KEY);
  }
  return shape;
}

export function captureLayoutSnapshot(root: PhysicalEntity): LayoutSnapshot {
  const snapshot = new Map<string, LayoutSnapshotEntry>();
  root.traverse((entity) => {
    const key = layoutSnapshotKey(entity);
    if (!key || !entity.box) return;
    const entry: LayoutSnapshotEntry = {
      box: { ...entity.box },
      layoutPosition: entity.layoutPosition ? { ...entity.layoutPosition } : null,
    };
    const flowShape = visibleFlowShape(entity);
    if (flowShape) entry.flowShape = flowShape;
    snapshot.set(key, entry);
  });
  return snapshot;
}

function applyLayoutSnapshot(root: PhysicalEntity, snapshot: LayoutSnapshot, rctx: ResolveContext): void {
  if (root.find((entity) => entity.flowCollapseMode === 'reflow')) return;
  const blocked = new Set<PhysicalEntity>();
  root.traverse((entity) => {
    if ((entity instanceof Page || entity instanceof Row) && entity.find((candidate) => candidate.flowCollapsed)) {
      entity.traverse((descendant) => blocked.add(descendant));
    }
    if (blocked.has(entity)) return;
    const key = layoutSnapshotKey(entity);
    const entry = key ? snapshot.get(key) : undefined;
    const savedShape = entry?.flowShape;
    const currentShape = savedShape ? visibleFlowShape(entity) : undefined;
    if (
      savedShape &&
      currentShape &&
      (savedShape.length !== currentShape.length || savedShape.some((childKey, index) => childKey !== currentShape[index]))
    ) {
      entity.traverse((descendant) => blocked.add(descendant));
    }
  });
  const currentFlowGeometry = new Map<PhysicalEntity, { box: Box; layoutPosition: Vector2 | null }>();
  root.traverse((entity) => {
    if ((entity instanceof Word || entity instanceof ImageFlowEntity) && entity.box) {
      currentFlowGeometry.set(entity, {
        box: { ...entity.box },
        layoutPosition: entity.layoutPosition ? { ...entity.layoutPosition } : null,
      });
    }
  });
  root.traverse((entity) => {
    if (entity.flowCollapsed) {
      entity.box = null;
      entity.layoutPosition = null;
      return;
    }
    if (blocked.has(entity)) return;
    // Flow words are placed again after their row receives stable geometry.
    // Restoring their old coordinates here prevents later words from reflowing.
    if (entity instanceof Word && !isAbsolutePositioned(entity, rctx) && participatesInFlow(entity)) return;
    const key = layoutSnapshotKey(entity);
    const entry = key ? snapshot.get(key) : undefined;
    if (!entry || !entity.box) return;
    entity.box = stableSnapshotBox(entity, entry.box, entity.box, rctx);
    entity.layoutPosition = entry.layoutPosition ? { ...entry.layoutPosition } : null;
  });
  root.traverse((entity) => {
    if (!(entity instanceof Row) || blocked.has(entity)) return;
    reflowStableRowChildren(entity, snapshot, currentFlowGeometry, rctx);
  });
}

function reflowStableRowChildren(
  row: Row,
  snapshot: LayoutSnapshot,
  currentFlowGeometry: ReadonlyMap<PhysicalEntity, { box: Box; layoutPosition: Vector2 | null }>,
  rctx: ResolveContext,
): void {
  if (!row.box || row.flowCollapsed || row.find((entity) => entity.flowCollapsed)) return;
  const rowKey = layoutSnapshotKey(row);
  const rowEntry = rowKey ? snapshot.get(rowKey) : undefined;
  if (!rowEntry) return;

  const flowChildren = row.children.filter(
    (child): child is Word | ImageFlowEntity =>
      (child instanceof Word || child instanceof ImageFlowEntity) &&
      !isAbsolutePositioned(child, rctx) &&
      participatesInFlow(child),
  );
  if (flowChildren.length === 0) return;

  const items = flowChildren
    .map((child) => {
      const geometry = currentFlowGeometry.get(child);
      if (!geometry) return null;
      const key = layoutSnapshotKey(child);
      const entry = key ? snapshot.get(key) : undefined;
      return {
        child,
        current: geometry,
        entry,
        boxWidth:
          entry && canExpandDimension(child, 'x', rctx)
            ? Math.max(geometry.box.width, entry.box.width)
            : geometry.box.width,
        boxHeight:
          entry && canExpandDimension(child, 'y', rctx)
            ? Math.max(geometry.box.height, entry.box.height)
            : geometry.box.height,
        width:
          child instanceof Word
            ? scaledWordWidth(
                child,
                entry && canExpandDimension(child, 'x', rctx)
                  ? Math.max(geometry.box.width, entry.box.width)
                  : geometry.box.width,
                rctx,
              )
            : entry && canExpandDimension(child, 'x', rctx)
              ? Math.max(geometry.box.width, entry.box.width)
              : geometry.box.width,
        height:
          child instanceof Word
            ? scaledWordSize(
                child,
                {
                  width: 0,
                  height:
                    entry && canExpandDimension(child, 'y', rctx)
                      ? Math.max(geometry.box.height, entry.box.height)
                      : geometry.box.height,
                },
                rctx,
              ).height
            : entry && canExpandDimension(child, 'y', rctx)
              ? Math.max(geometry.box.height, entry.box.height)
              : geometry.box.height,
      };
    })
    .filter(
      (
        item,
      ): item is {
        child: Word | ImageFlowEntity;
        current: { box: Box; layoutPosition: Vector2 | null };
        entry: LayoutSnapshotEntry | undefined;
        width: number;
        height: number;
        boxWidth: number;
        boxHeight: number;
      } => item !== null,
    );
  if (items.length === 0) return;

  const rightToLeft = rowFlowsRightToLeft(row, rctx, rctx.textDirection);
  const spacing = stableFlowSpacing(items, rightToLeft, rctx);
  const padding = row.layout ? layoutInsets(row.layout, 'padding', rctx) : ZERO_LAYOUT_INSETS;
  const contentHeight = Math.max(1, row.box.height - padding.top - padding.bottom);
  const rowY = row.box.y + padding.top;
  const naturalContentWidth = items.reduce((sum, item) => sum + item.width, 0) + spacing * Math.max(0, items.length - 1);
  const rowHRaw = row.layout?.childrenAlignment(rctx).horizontalAlignment;
  const rowHAlign = rowHRaw == null ? 'left' : resolveHorizontalAlign(rowHRaw, rctx.textDirection);
  const selfSingleItemAlignment =
    items.length === 1 ? selfSingleItemAlignmentOf(items[0].child, rctx) : undefined;
  const singleItemAlignment = selfSingleItemAlignment ?? singleItemAlignmentOf(row.layout, rctx);
  const singleItemJustify =
    items.length === 1 &&
    singleItemAlignment === 'justify' &&
    (rowHAlign === 'stretch' || selfSingleItemAlignment !== undefined);
  if (singleItemJustify && items[0].child instanceof Word) {
    items[0].width = justifiedSingleWordWidth(
      items[0].child,
      items[0].width,
      Math.max(1, row.box.width - padding.left - padding.right),
      rctx,
    );
    const scaleX = scaleAxis(items[0].child.transform?.scale(rctx).x);
    if (scaleX > 0) items[0].boxWidth = items[0].width / scaleX;
  }
  const itemSpacing =
    rowHAlign === 'stretch' && items.length > 1
      ? spacing + Math.max(0, row.box.width - padding.left - padding.right - naturalContentWidth) / (items.length - 1)
      : spacing;
  const contentWidth = items.reduce((sum, item) => sum + item.width, 0) + itemSpacing * Math.max(0, items.length - 1);
  const contentAlignment =
    selfSingleItemAlignment !== undefined
      ? selfSingleItemAlignment === 'justify'
        ? 'stretch'
        : resolveHorizontalAlign(selfSingleItemAlignment, rctx.textDirection)
      : singleItemHorizontalAlignment(rowHAlign, items.length, singleItemAlignment, rctx.textDirection);
  const contentLeft = alignedContentLeft(
    row.box,
    padding,
    contentWidth,
    contentAlignment,
  );
  let cursorX = rightToLeft ? contentLeft + contentWidth : contentLeft;
  const configuredRowVerticalAlignment = row.layout?.childrenAlignment(rctx).verticalAlignment;
  const rowVerticalAlignment: SelfLayoutVerticalAlignment | undefined =
    configuredRowVerticalAlignment === undefined
      ? undefined
      : configuredRowVerticalAlignment === 'stretch'
        ? 'stretch'
        : normalizeV(configuredRowVerticalAlignment) === 'middle'
          ? 'center'
          : normalizeV(configuredRowVerticalAlignment) === 'top'
            ? 'top'
            : 'bottom';
  const rowSingleItemVerticalAlignment = singleItemAlignmentOf(row.layout, rctx, 'vertical');

  for (const item of items) {
    const selfLayout = selfLayoutOf(item.child);
    const selfSingleItemVerticalAlignment = selfSingleItemAlignmentOf(item.child, rctx, 'vertical');
    let verticalAlignment: SelfLayoutVerticalAlignment | VerticalAlign = selfLayout?.enabled(rctx)
      ? selfLayout.verticalAlignment(rctx)
      : 'auto';
    if (selfSingleItemVerticalAlignment !== undefined && verticalAlignment === 'stretch') {
      verticalAlignment = singleItemVerticalAlignment(verticalAlignment, 1, selfSingleItemVerticalAlignment);
    } else if (rowVerticalAlignment === 'stretch' && items.length === 1) {
      verticalAlignment = singleItemVerticalAlignment(
        rowVerticalAlignment,
        1,
        selfSingleItemVerticalAlignment ?? rowSingleItemVerticalAlignment,
      );
    } else if (verticalAlignment === 'auto' && rowVerticalAlignment !== undefined) {
      verticalAlignment = rowVerticalAlignment;
    } else if (item.child instanceof Word) {
      const hasAuthoredHeight = item.child.transform?.authoredDimension('y', rctx) !== undefined;
      if (verticalAlignment === 'auto' && !hasAuthoredHeight) verticalAlignment = 'center';
    } else if (verticalAlignment === 'auto') {
      verticalAlignment = 'center';
    }
    const itemHeight = verticalAlignment === 'stretch' ? contentHeight : item.height;
    const boxWidth = item.child instanceof Word ? item.boxWidth : item.width;
    const scaleY = item.child instanceof Word ? scaleAxis(item.child.transform?.scale(rctx).y) : 1;
    if (item.child instanceof Word) {
      item.child.textVerticalScale =
        verticalAlignment === 'stretch' && item.height > 0 ? Math.max(0.001, itemHeight / item.height) : 1;
    }
    const boxHeight =
      item.child instanceof Word
        ? verticalAlignment === 'stretch' && scaleY > 0
          ? itemHeight / scaleY
          : item.boxHeight
        : itemHeight;
    const remainingHeight = Math.max(0, contentHeight - itemHeight);
    const itemY =
      verticalAlignment === 'bottom'
        ? rowY + remainingHeight
        : verticalAlignment === 'center' || verticalAlignment === 'middle'
          ? rowY + remainingHeight / 2
          : rowY;
    const rowContent = contentBoxFromArea(row.box, row.layout, rctx);
    const entityPosition = resolvedPositionOf(item.child, rctx, rowContent);

    if (rightToLeft) cursorX -= item.width;
    item.child.box = {
      x:
        cursorX +
        entityPosition.x -
        (item.child instanceof Word ? visualStartOffsetFor(item.child, boxWidth, rctx) : 0),
      y:
        itemY +
        entityPosition.y -
        (item.child instanceof Word ? visualTopOffsetFor(item.child, boxHeight, rctx) : 0),
      width: boxWidth,
      height: boxHeight,
    };
    item.child.layoutPosition = item.entry?.layoutPosition
      ? { ...item.entry.layoutPosition }
      : entityPosition;
    cursorX += rightToLeft ? -itemSpacing : item.width + itemSpacing;
  }
}

function stableFlowSpacing(
  items: ReadonlyArray<{
    child: Word | ImageFlowEntity;
    width: number;
    boxWidth: number;
    current: { box: Box; layoutPosition: Vector2 | null };
  }>,
  rightToLeft: boolean,
  rctx: ResolveContext,
): number {
  if (items.length < 2) return 0;
  const first = items[0];
  const second = items[1];
  const firstPosition = first.current.layoutPosition ?? { x: 0, y: 0 };
  const secondPosition = second.current.layoutPosition ?? { x: 0, y: 0 };
  const firstLeft =
    first.current.box.x -
    firstPosition.x +
    (first.child instanceof Word ? visualStartOffsetFor(first.child, first.boxWidth, rctx) : 0);
  const secondLeft =
    second.current.box.x -
    secondPosition.x +
    (second.child instanceof Word ? visualStartOffsetFor(second.child, second.boxWidth, rctx) : 0);
  const gap = rightToLeft
    ? firstLeft - (secondLeft + second.width)
    : secondLeft - (firstLeft + first.width);
  return Number.isFinite(gap) ? gap : 0;
}

function singleItemAlignmentOf(
  layout: Layout | undefined,
  rctx: ResolveContext,
  axis: 'horizontal' | 'vertical' = 'horizontal',
): LayoutSingleItemAlignment {
  const alignment = layout?.childrenAlignment(rctx);
  return axis === 'horizontal'
    ? alignment?.horizontalSingleItemAlignment ?? 'start'
    : alignment?.verticalSingleItemAlignment ?? 'start';
}

function selfSingleItemAlignmentOf(
  entity: PhysicalEntity | undefined,
  rctx: ResolveContext,
  axis: 'horizontal' | 'vertical' = 'horizontal',
): LayoutSingleItemAlignment | undefined {
  if (!entity) return undefined;
  const selfLayout = selfLayoutOf(entity);
  if (!selfLayout?.enabled(rctx)) return undefined;
  const alignment = axis === 'horizontal' ? selfLayout.horizontalAlignment(rctx) : selfLayout.verticalAlignment(rctx);
  if (alignment !== 'stretch') return undefined;
  return axis === 'horizontal'
    ? selfLayout.horizontalSingleItemAlignment(rctx)
    : selfLayout.verticalSingleItemAlignment(rctx);
}

function singleItemHorizontalAlignment(
  horizontalAlignment: HorizontalAlign,
  itemCount: number,
  singleItemAlignment: LayoutSingleItemAlignment,
  textDirection: ResolvedTextDirection,
): HorizontalAlign {
  if (horizontalAlignment !== 'stretch' || itemCount !== 1 || singleItemAlignment === 'justify') {
    return horizontalAlignment;
  }
  return resolveHorizontalAlign(singleItemAlignment, textDirection);
}

function singleItemVerticalAlignment(
  verticalAlignment: VerticalAlign,
  itemCount: number,
  singleItemAlignment: LayoutSingleItemAlignment,
): VerticalAlign {
  if (verticalAlignment !== 'stretch' || itemCount !== 1 || singleItemAlignment === 'justify') {
    return verticalAlignment;
  }
  return singleItemAlignment === 'center' ? 'middle' : singleItemAlignment === 'end' ? 'bottom' : 'top';
}

function justifiedSingleWordWidth(
  word: Word,
  naturalWidth: number,
  availableWidth: number,
  rctx: ResolveContext,
): number {
  const targetWidth = Math.max(naturalWidth, availableWidth);
  if (targetWidth <= naturalWidth) return naturalWidth;
  const text = word.getComponent<Text>('text');
  if (!text) return naturalWidth;
  const wordContext = word.contextFor(rctx);
  const graphemeCount = segmentTextGraphemes(text.displayText(word.text, wordContext)).length;
  if (graphemeCount < 2) return naturalWidth;
  const authoredLetterSpacing = resolveLetterSpacing(text.getProp<number>('letterSpacing')?.resolve(wordContext));
  const scaleX = scaleAxis(word.transform?.scale(wordContext).x);
  if (scaleX === 0) return naturalWidth;
  word.textLetterSpacing =
    authoredLetterSpacing + (targetWidth - naturalWidth) / (scaleX * (graphemeCount - 1));
  return targetWidth;
}

function collectSpacerProperties(components: readonly Component[], properties: Set<object>): void {
  for (const component of components) {
    if (component instanceof Spacer) {
      for (const propertyName of ['enabled', 'spacing', 'unit']) {
        const property = component.getProp(propertyName);
        if (property) properties.add(property);
      }
    }
    collectSpacerProperties(component.components, properties);
  }
}

function resolveLayoutContext(root: PhysicalEntity, rctx: ResolveContext, spacingContext?: ResolveContext): ResolveContext {
  const layoutContext = prepareAnimationContext(root, rctx);
  if (!spacingContext) return layoutContext;

  const dynamicSpacingContext = prepareAnimationContext(root, spacingContext);
  const dynamicOverrides = dynamicSpacingContext.animationOverrides;
  if (!dynamicOverrides || dynamicOverrides.size === 0) return layoutContext;

  const spacerProperties = new Set<object>();
  root.traverse((entity) => collectSpacerProperties(entity.components, spacerProperties));
  if (spacerProperties.size === 0) return layoutContext;

  const animationOverrides = new Map(layoutContext.animationOverrides);
  let hasDynamicSpacing = false;
  for (const property of spacerProperties) {
    if (!dynamicOverrides.has(property)) continue;
    animationOverrides.set(property, dynamicOverrides.get(property));
    hasDynamicSpacing = true;
  }
  return hasDynamicSpacing ? { ...layoutContext, animationOverrides } : layoutContext;
}

interface MeasuredWord {
  word: Word;
  width: number;
  height: number;
  boxWidth: number;
  boxHeight: number;
  verticalAlignment: SelfLayoutVerticalAlignment;
  baselineOffset: number | undefined;
  flowCollapsed: boolean;
}

/** A single flow item in a mixed image+word row. */
type MeasuredFlowItem =
  | {
      kind: 'word';
      word: Word;
      width: number;
      height: number;
      boxWidth: number;
      boxHeight: number;
      verticalAlignment: SelfLayoutVerticalAlignment;
      baselineOffset: number | undefined;
      flowCollapsed: boolean;
    }
  | {
      kind: 'image';
      entity: ImageFlowEntity;
      width: number;
      height: number;
      verticalAlignment: SelfLayoutVerticalAlignment;
      flowCollapsed: boolean;
    };

type TextMeasurement = ReturnType<Text['measure']>;

const EMPTY_TEXT_MEASUREMENT: TextMeasurement = {
  width: 0,
  height: 0,
  ascent: 0,
  descent: 0,
  baselineOffset: 0,
};

function scaleAxis(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) ? Math.abs(value) : 1;
}

function signedScaleAxis(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) ? value : 1;
}

function scaledWordSize(word: Word, size: Size, rctx: ResolveContext): Size {
  const scale = word.transform?.scale(rctx);
  const scaleX = scaleAxis(scale?.x);
  const scaleY = scaleAxis(scale?.y);
  return {
    width: size.width * scaleX,
    height: size.height * scaleY,
  };
}

function scaledWordWidth(word: Word, width: number, rctx: ResolveContext): number {
  return width * scaleAxis(word.transform?.scale(rctx).x);
}

function pivotFraction(pivot: TransformPivot, axis: 'x' | 'y'): number {
  if (axis === 'x') return pivot.endsWith('Left') ? 0 : pivot.endsWith('Right') ? 1 : 0.5;
  return pivot.startsWith('top') ? 0 : pivot.startsWith('bottom') ? 1 : 0.5;
}

function visualStartOffsetFor(word: Word, boxWidth: number, rctx: ResolveContext): number {
  const transform = word.transform;
  if (!transform) return 0;
  const scaleX = signedScaleAxis(transform.scale(rctx).x);
  const pivot = boxWidth * pivotFraction(transform.pivot(rctx), 'x');
  const scaledStart = pivot + scaleX * -pivot;
  const scaledEnd = pivot + scaleX * (boxWidth - pivot);
  return Math.min(scaledStart, scaledEnd);
}

function visualTopOffsetFor(word: Word, boxHeight: number, rctx: ResolveContext): number {
  const transform = word.transform;
  if (!transform) return 0;
  const scaleY = signedScaleAxis(transform.scale(rctx).y);
  const pivot = boxHeight * pivotFraction(transform.pivot(rctx), 'y');
  const scaledStart = pivot + scaleY * -pivot;
  const scaledEnd = pivot + scaleY * (boxHeight - pivot);
  return Math.min(scaledStart, scaledEnd);
}

function visualBoxForEntity(entity: PhysicalEntity, box: Box, rctx: ResolveContext): Box {
  if (!(entity instanceof Word) || !entity.transform) return box;
  const scale = entity.transform.scale(rctx);
  return {
    x: box.x + visualStartOffsetFor(entity, box.width, rctx),
    y: box.y + visualTopOffsetFor(entity, box.height, rctx),
    width: box.width * scaleAxis(scale.x),
    height: box.height * scaleAxis(scale.y),
  };
}

interface MeasuredRow {
  row: Row;
  words: MeasuredWord[];
  /** Non-null when the row contains at least one flow image child. */
  flowItems: MeasuredFlowItem[] | null;
  contentWidth: number;
  contentHeight: number;
  width: number;
  height: number;
  spacing: number;
}

type MeasuredPageFlowChild =
  | { kind: 'row'; row: MeasuredRow }
  | { kind: 'image'; entity: ImageFlowEntity; width: number; height: number };

type MeasuredPageFlowLayoutItem =
  | MeasuredPageFlowChild
  | { kind: 'state-stack'; rows: MeasuredRow[]; width: number; height: number; gap: number; gaps: number[] };

interface ResolvedItemSize {
  width: number;
  height: number;
  widthMode: TransformSizeMode;
  heightMode: TransformSizeMode;
  horizontalAlignment: SelfLayoutHorizontalAlignment;
  verticalAlignment: SelfLayoutVerticalAlignment;
}

type SelfLayoutHorizontalAlignment = 'auto' | 'start' | 'center' | 'end' | 'left' | 'right' | 'stretch';
type SelfLayoutVerticalAlignment = 'auto' | 'top' | 'center' | 'bottom' | 'stretch';

interface Size {
  width: number;
  height: number;
}

interface FitParentFallbackAxes {
  width: boolean;
  height: boolean;
}

interface IntrinsicSize {
  content: Size;
  children?: Size;
  resolved: Size;
}

function selfLayoutOf(entity: PhysicalEntity): SelfLayout | undefined {
  return entity.components.find((component): component is SelfLayout => component instanceof SelfLayout);
}

function transformOf(entity: PhysicalEntity): Transform | undefined {
  return entity.transform;
}

function isAbsolutePositioned(entity: PhysicalEntity, rctx: ResolveContext): boolean {
  return entity.transform?.positioning(rctx) === 'absolute';
}

function participatesInFlow(entity: PhysicalEntity): boolean {
  return !entity.flowCollapsed || entity.flowCollapseMode === 'reserve';
}

function ratioValue(item: SelfLayout, natural: Size, rctx: ResolveContext): number | undefined {
  const aspect = item.aspectRatio(rctx);
  if (aspect === 'stretchToFit') return undefined;
  if (aspect === 'maintain') {
    return natural.width > 0 && natural.height > 0 ? natural.width / natural.height : undefined;
  }
  const custom = item.customAspectRatio(rctx).split(':').map(Number);
  return custom[0] > 0 && custom[1] > 0 ? custom[0] / custom[1] : undefined;
}

function aspectRatioFor(entity: PhysicalEntity, natural: Size, rctx: ResolveContext): number | undefined {
  const selfLayout = selfLayoutOf(entity);
  if (selfLayout) {
    return selfLayout.enabled(rctx) ? ratioValue(selfLayout, natural, rctx) : undefined;
  }
  if (!(entity instanceof Video || entity instanceof VideoArea)) return undefined;
  return natural.width > 0 && natural.height > 0 ? natural.width / natural.height : undefined;
}

function resolveSelfLayoutSize(
  entity: PhysicalEntity,
  fallbackNatural: Size,
  available: Size,
  rctx: ResolveContext,
  contentNatural: Size = fallbackNatural,
  childrenNatural: Size | undefined = undefined,
  fitParentAvailable: Size = available,
  fitParentFallbackAxes: FitParentFallbackAxes = { width: false, height: false },
  percentageReference: Size = available,
): ResolvedItemSize {
  const selfLayout = selfLayoutOf(entity);
  const selfLayoutEnabled = selfLayout?.enabled(rctx) !== false;
  const transform = transformOf(entity);
  const widthMode = transform?.widthMode(rctx) ?? 'custom';
  const heightMode = transform?.heightMode(rctx) ?? 'custom';
  const authoredWidth = transform?.resolvedAuthoredDimension('x', rctx, percentageReference.width);
  const authoredHeight = transform?.resolvedAuthoredDimension('y', rctx, percentageReference.height);
  const fitParentWidth = fitParentFallbackAxes.width
    ? contentNatural.width
    : Math.max(0, fitParentAvailable.width);
  const fitParentHeight = fitParentFallbackAxes.height
    ? contentNatural.height
    : Math.max(0, fitParentAvailable.height);
  const childSize = childrenNatural ?? contentNatural;
  const width = resolveDimension(widthMode, authoredWidth, fallbackNatural.width, contentNatural.width, childSize.width, fitParentWidth);
  const height = resolveDimension(heightMode, authoredHeight, fallbackNatural.height, contentNatural.height, childSize.height, fitParentHeight);
  let resolvedWidth = width;
  let resolvedHeight = height;
  const ratio = aspectRatioFor(entity, contentNatural, rctx);

  if (ratio && widthMode === 'fitParent' && isDerivedSizeMode(heightMode)) {
    resolvedHeight = resolvedWidth / ratio;
  } else if (ratio && heightMode === 'fitParent' && isDerivedSizeMode(widthMode)) {
    resolvedWidth = resolvedHeight * ratio;
  } else if (ratio && widthMode === 'custom' && isDerivedSizeMode(heightMode)) {
    resolvedHeight = resolvedWidth / ratio;
  } else if (ratio && heightMode === 'custom' && isDerivedSizeMode(widthMode)) {
    resolvedWidth = resolvedHeight * ratio;
  } else if (ratio && isDerivedSizeMode(widthMode) && isDerivedSizeMode(heightMode)) {
    if (resolvedWidth > 0) resolvedHeight = resolvedWidth / ratio;
    else if (resolvedHeight > 0) resolvedWidth = resolvedHeight * ratio;
  }

  return {
    width: Math.max(0, resolvedWidth),
    height: Math.max(0, resolvedHeight),
    widthMode,
    heightMode,
    horizontalAlignment: selfLayoutEnabled && selfLayout ? selfLayout.horizontalAlignment(rctx) : 'auto',
    verticalAlignment: selfLayoutEnabled && selfLayout ? selfLayout.verticalAlignment(rctx) : 'auto',
  };
}

function constrainFitChildrenSize(
  size: ResolvedItemSize,
  parent: Size,
  parentChildrenSizing: LayoutChildrenSizing = 'constrained',
): ResolvedItemSize {
  if (parentChildrenSizing === 'allowOverflow') return size;
  return {
    ...size,
    width: size.widthMode === 'fitChildren' ? Math.min(size.width, Math.max(1, parent.width)) : size.width,
    height: size.heightMode === 'fitChildren' ? Math.min(size.height, Math.max(1, parent.height)) : size.height,
  };
}

function sizeForOverflowingChild(
  entity: PhysicalEntity,
  size: Size,
  rctx: ResolveContext,
  parentChildrenSizing: LayoutChildrenSizing,
): Size {
  if (parentChildrenSizing !== 'allowOverflow') return size;
  const transform = transformOf(entity);
  if (!transform) return size;
  const width =
    transform.widthMode(rctx) === 'custom'
      ? transform.resolvedAuthoredDimension('x', rctx, size.width)
      : undefined;
  const height =
    transform.heightMode(rctx) === 'custom'
      ? transform.resolvedAuthoredDimension('y', rctx, size.height)
      : undefined;
  return {
    width: width ?? size.width,
    height: height ?? size.height,
  };
}

function resolveDimension(
  mode: TransformSizeMode,
  authored: number | undefined,
  fallback: number,
  content: number,
  children: number,
  available: number,
): number {
  switch (mode) {
    case 'fitParent':
      return available;
    case 'fitContent':
      return content;
    case 'fitChildren':
      return children;
    default:
      return authored ?? fallback;
  }
}

function isDerivedSizeMode(mode: TransformSizeMode): boolean {
  return mode === 'fitContent' || mode === 'fitChildren';
}

function textOf(word: Word): Text | undefined {
  return word.components.find((component): component is Text => component instanceof Text);
}

/**
 * Resolve the layout dimensions of a flow image entity. Applies the documented
 * dimension resolution rules:
 * 1. Both explicit → use them directly.
 * 2. Explicit width only → derive height via source aspect ratio.
 * 3. Explicit height only → derive width via source aspect ratio.
 * 4. Neither → use source dimensions from measurement record.
 * 5. No measurement or failed load → use FLOW_IMAGE_FALLBACK.
 *
 * "Explicit" means `widthMode/heightMode === 'custom'` with a positive authored dimension.
 */
export function resolveFlowImageSize(
  entity: ImageFlowEntity,
  measurement: FlowImageMeasurement | undefined,
  rctx: ResolveContext,
  parentSize: Size = measurement
    ? { width: measurement.width, height: measurement.height }
    : FLOW_IMAGE_FALLBACK,
): { width: number; height: number } {
  const transform = entity.transform;
  const wMode = transform?.widthMode(rctx) ?? 'custom';
  const hMode = transform?.heightMode(rctx) ?? 'custom';
  const authoredW = transform?.resolvedAuthoredDimension('x', rctx, parentSize.width);
  const authoredH = transform?.resolvedAuthoredDimension('y', rctx, parentSize.height);

  const hasExplicitW = wMode === 'custom' && authoredW !== undefined;
  const hasExplicitH = hMode === 'custom' && authoredH !== undefined;

  const loaded = measurement?.status === 'loaded';
  const sourceW = loaded && measurement!.width > 0 ? measurement!.width : 0;
  const sourceH = loaded && measurement!.height > 0 ? measurement!.height : 0;
  const image = entity.getComponent<Image>('image');
  const aspectRatio = image?.aspectRatio(rctx) ?? (sourceW > 0 && sourceH > 0 ? sourceW / sourceH : measurement?.aspectRatio ?? 1);

  if (hasExplicitW && hasExplicitH) {
    return { width: authoredW!, height: authoredH! };
  }
  if (hasExplicitW) {
    const height = authoredW! / aspectRatio;
    return { width: authoredW!, height: Math.max(1, height) };
  }
  if (hasExplicitH) {
    const width = authoredH! * aspectRatio;
    return { width: Math.max(1, width), height: authoredH! };
  }
  if (sourceW > 0 && sourceH > 0) {
    return { width: sourceW, height: Math.max(1, sourceW / aspectRatio) };
  }
  return {
    width: FLOW_IMAGE_FALLBACK.width,
    height: Math.max(1, FLOW_IMAGE_FALLBACK.width / aspectRatio),
  };
}

function flowImageMeasurementFor(
  entity: ImageFlowEntity,
  measurements: ReadonlyMap<string, FlowImageMeasurement> | undefined,
): FlowImageMeasurement | undefined {
  if (!measurements) return undefined;
  return measurements.get(entity.id) ?? (entity.debugSourceId ? measurements.get(entity.debugSourceId) : undefined);
}

function measureRow(
  row: Row,
  ctx: CanvasContext2D,
  rctx: ResolveContext,
  baseWordSpacing: number | undefined,
  extraWordSpacing: number,
  available: Box,
  fitParentAvailable: Size = available,
  fitParentFallbackAxes: FitParentFallbackAxes = { width: false, height: false },
  flowImageMeasurements?: ReadonlyMap<string, FlowImageMeasurement>,
): MeasuredRow {
  const measuredWordRaw: Array<{ word: Word; measured: TextMeasurement }> = [];
  let spacing = baseWordSpacing ?? 0;
  let spacingSet = baseWordSpacing !== undefined;
  const rowPadding = row.layout ? layoutInsets(row.layout, 'padding', rctx) : ZERO_LAYOUT_INSETS;

  // Collect non-absolute flow children in order (words + images).
  const flowChildren = row.children.filter(
    (child) => !isAbsolutePositioned(child, rctx) && participatesInFlow(child),
  );
  const hasFlowImages = flowChildren.some((child) => child instanceof ImageFlowEntity);

  const measureWords = (): void => {
    measuredWordRaw.length = 0;
    for (const child of flowChildren) {
      if (!(child instanceof Word)) continue;
      const wordCtx = child.contextFor(rctx);
      const text = textOf(child);
      const measured = text ? text.measure(ctx, wordCtx, child.text) : EMPTY_TEXT_MEASUREMENT;
      if (!spacingSet && text) {
        spacing = scaledWordWidth(child, text.measure(ctx, rctx, ' ').width, wordCtx);
        spacingSet = true;
      }
      measuredWordRaw.push({ word: child, measured });
    }
  };
  for (const child of flowChildren) {
    if (child instanceof Word) child.fontScale = 1;
  }
  measureWords();

  // The Row's HorizontalSpacer adds extra gap on top of the natural
  // space-glyph width (replaces the old page `wordSpacingOffset`).
  const baseSpacing = spacing;
  spacing += extraWordSpacing;
  // Natural words share one baseline so glyph-specific descenders do not shift
  // individual words within the row.
  let rowAscent = measuredWordRaw.reduce(
    (max, entry) => Math.max(max, entry.measured.ascent * scaleAxis(entry.word.transform?.scale(rctx).y)),
    0,
  );
  let rowDescent = measuredWordRaw.reduce(
    (max, entry) => Math.max(max, entry.measured.descent * scaleAxis(entry.word.transform?.scale(rctx).y)),
    0,
  );
  let rowBaselineOffset = rowAscent || rowDescent ? (rowAscent - rowDescent) / 2 : 0;

  // Pre-measure image sizes. They do not depend on the two-pass word resolution.
  const imageSizes = new Map<ImageFlowEntity, Size>();
  if (hasFlowImages) {
    for (const child of flowChildren) {
      if (!(child instanceof ImageFlowEntity)) continue;
      const measurement = flowImageMeasurementFor(child, flowImageMeasurements);
      imageSizes.set(child, resolveFlowImageSize(child, measurement, rctx, available));
    }
  }

  const resolveFlowItems = (
    wordParentSize: Size,
  ): {
    words: MeasuredWord[];
    flowItems: MeasuredFlowItem[] | null;
    content: Size;
  } => {
    const words: MeasuredWord[] = [];
    const items: MeasuredFlowItem[] = [];
    let flowHeight = rowAscent + rowDescent;

    for (const child of flowChildren) {
      if (child instanceof ImageFlowEntity) {
        const size = imageSizes.get(child) ?? { ...FLOW_IMAGE_FALLBACK };
        const selfLayout = selfLayoutOf(child);
        const verticalAlignment: SelfLayoutVerticalAlignment =
          selfLayout?.enabled(rctx) ? selfLayout.verticalAlignment(rctx) : 'auto';
        flowHeight = Math.max(flowHeight, size.height);
        items.push({
          kind: 'image',
          entity: child,
          width: size.width,
          height: size.height,
          verticalAlignment,
          flowCollapsed: child.flowCollapsed,
        });
      } else if (child instanceof Word) {
        const entry = measuredWordRaw.find((m) => m.word === child);
        if (!entry) continue;
        const sized = resolveSelfLayoutSize(
          entry.word,
          entry.measured,
          available,
          rctx,
          entry.measured,
          undefined,
          wordParentSize,
          fitParentFallbackAxes,
          wordParentSize,
        );
        const flowSize = scaledWordSize(entry.word, sized, rctx);
        flowHeight = Math.max(flowHeight, flowSize.height);
        const usesNaturalRowBaseline =
          sized.verticalAlignment === 'auto' && entry.word.transform?.authoredDimension('y', rctx) === undefined;
        const scaleY = scaleAxis(entry.word.transform?.scale(rctx).y);
        const baselineOffset =
          usesNaturalRowBaseline && scaleY > 0 ? rowBaselineOffset / scaleY : undefined;
        const wordItem: MeasuredFlowItem = {
          kind: 'word',
          word: entry.word,
          width: flowSize.width,
          height: flowSize.height,
          boxWidth: sized.width,
          boxHeight: sized.height,
          verticalAlignment: sized.verticalAlignment,
          baselineOffset,
          flowCollapsed: child.flowCollapsed,
        };
        words.push({
          word: entry.word,
          width: flowSize.width,
          height: flowSize.height,
          boxWidth: sized.width,
          boxHeight: sized.height,
          verticalAlignment: sized.verticalAlignment,
          baselineOffset,
          flowCollapsed: child.flowCollapsed,
        });
        items.push(wordItem);
      }
    }

    const minimumSpacing = items.length > 1 ? -Math.min(...items.map((item) => item.width)) : spacing;
    const itemSpacing = Math.max(spacing, minimumSpacing);
    spacing = itemSpacing;
    const total = items.reduce((sum, item) => sum + item.width, 0) + itemSpacing * Math.max(0, items.length - 1);
    return {
      words,
      flowItems: hasFlowImages ? items : null,
      content: { width: total, height: flowHeight },
    };
  };

  const rowTransform = transformOf(row);
  const rowWidthMode = rowTransform?.widthMode(rctx) ?? 'custom';
  const rowHeightMode = rowTransform?.heightMode(rctx) ?? 'custom';
  const rowContentSize = (size: Size): Size => ({
    width: Math.max(1, size.width - rowPadding.left - rowPadding.right),
    height: Math.max(1, size.height - rowPadding.top - rowPadding.bottom),
  });
  const rowWidthProvidesParent =
    rowWidthMode === 'fitParent' ||
    (rowWidthMode === 'custom' && rowTransform?.authoredDimension('x', rctx) !== undefined);
  const rowHeightProvidesParent =
    rowHeightMode === 'fitParent' ||
    (rowHeightMode === 'custom' && rowTransform?.authoredDimension('y', rctx) !== undefined);
  let wordParentSize: Size = { width: available.width, height: available.height };
  let resolved = resolveFlowItems(wordParentSize);
  let sized = resolveSelfLayoutSize(
    row,
    resolved.content,
    available,
    rctx,
    paddedSize(row, resolved.content, rctx),
    paddedSize(row, resolved.content, rctx),
    fitParentAvailable,
    fitParentFallbackAxes,
    available,
  );
  for (let pass = 0; pass < 2; pass += 1) {
    const nextWordParentSize = {
      width: rowWidthProvidesParent ? rowContentSize(sized).width : wordParentSize.width,
      height: rowHeightProvidesParent ? rowContentSize(sized).height : wordParentSize.height,
    };
    if (nextWordParentSize.width === wordParentSize.width && nextWordParentSize.height === wordParentSize.height) break;
    wordParentSize = nextWordParentSize;
    resolved = resolveFlowItems(wordParentSize);
    sized = resolveSelfLayoutSize(
      row,
      resolved.content,
      available,
      rctx,
      paddedSize(row, resolved.content, rctx),
      paddedSize(row, resolved.content, rctx),
      fitParentAvailable,
      fitParentFallbackAxes,
      available,
    );
  }

  const rowFontFit = rctx.rowFontFit;
  let rowTargetWidth = sized.width;
  if (rowFontFit && rowFontFit.mode !== 'natural' && !rowWidthProvidesParent) {
    rowTargetWidth = available.width;
  }
  if (rowFontFit && rowFontFit.mode !== 'natural') {
    rowTargetWidth = Math.min(Math.max(1, rowTargetWidth), Math.max(1, available.width));
    const fixedWidth = resolved.flowItems
      ?.filter((item) => item.kind === 'image')
      .reduce((sum, item) => sum + item.width, 0) ?? 0;
    const wordWidth = resolved.words.reduce((sum, word) => sum + word.width, 0);
    const itemCount = resolved.flowItems?.length ?? resolved.words.length;
    const targetWordWidth = Math.max(
      1,
      rowContentSize({ width: rowTargetWidth, height: sized.height }).width -
        fixedWidth -
        spacing * Math.max(0, itemCount - 1),
    );
    const fit = resolveRowFontScale({
      mode: rowFontFit.mode,
      naturalWidth: wordWidth,
      targetWidth: targetWordWidth,
      minScale: rowFontFit.minScale,
      maxScale: rowFontFit.maxScale,
    });
    for (const entry of measuredWordRaw) entry.word.fontScale = fit.value;
    measureWords();
    rowAscent = measuredWordRaw.reduce(
      (max, entry) => Math.max(max, entry.measured.ascent * scaleAxis(entry.word.transform?.scale(rctx).y)),
      0,
    );
    rowDescent = measuredWordRaw.reduce(
      (max, entry) => Math.max(max, entry.measured.descent * scaleAxis(entry.word.transform?.scale(rctx).y)),
      0,
    );
    rowBaselineOffset = rowAscent || rowDescent ? (rowAscent - rowDescent) / 2 : 0;
    resolved = resolveFlowItems(wordParentSize);
    sized = resolveSelfLayoutSize(
      row,
      resolved.content,
      available,
      rctx,
      paddedSize(row, resolved.content, rctx),
      paddedSize(row, resolved.content, rctx),
      fitParentAvailable,
      fitParentFallbackAxes,
      available,
    );
  }

  const flowSlots = Math.max(0, flowChildren.length - 1);
  if (extraWordSpacing > 0 && flowSlots > 0) {
    const widthCapacity = rowWidthProvidesParent ? sized.width : available.width;
    const availableContentWidth = Math.max(0, widthCapacity - rowPadding.left - rowPadding.right);
    const naturalContentWidth = resolved.content.width - extraWordSpacing * flowSlots;
    const maximumExtraSpacing = Math.max(0, (availableContentWidth - naturalContentWidth) / flowSlots);
    const constrainedExtraSpacing = Math.min(extraWordSpacing, maximumExtraSpacing);
    if (constrainedExtraSpacing < extraWordSpacing) {
      spacing = baseSpacing + constrainedExtraSpacing;
      resolved = resolveFlowItems(wordParentSize);
      sized = resolveSelfLayoutSize(
        row,
        resolved.content,
        available,
        rctx,
        paddedSize(row, resolved.content, rctx),
        paddedSize(row, resolved.content, rctx),
        fitParentAvailable,
        fitParentFallbackAxes,
        available,
      );
    }
  }

  const rowWindow = row.layout?.childWindow(rctx);
  const rowWindowCount = rowWindow?.count ?? 1;
  const activeRowWindow =
    rowWindow?.mode === 'count' && rowWindow.axis === 'horizontal' && flowChildren.length > rowWindowCount
      ? rowWindow
      : undefined;
  if (activeRowWindow && flowSpacerUsesPercentage(row, 'row', rctx)) {
    const itemWidths = resolved.flowItems
      ? resolved.flowItems.map((item) => item.width)
      : resolved.words.map((word) => word.width);
    const boundedWidths = childWindowItems(itemWidths, activeRowWindow);
    const windowExtraSpacing = resolveWindowGap(
      boundedWidths,
      available.width,
      (extent) => wordGapExtraOf(row, rctx, extent),
      true,
      boundedWidths.reduce((sum, width) => sum + width, 0) +
        baseSpacing * Math.max(0, boundedWidths.length - 1),
    );
    extraWordSpacing = windowExtraSpacing;
    spacing = baseSpacing + extraWordSpacing;
    resolved = resolveFlowItems(wordParentSize);
    sized = resolveSelfLayoutSize(
      row,
      resolved.content,
      available,
      rctx,
      paddedSize(row, resolved.content, rctx),
      paddedSize(row, resolved.content, rctx),
      fitParentAvailable,
      fitParentFallbackAxes,
      available,
    );
  }
  const fullContent = resolved.content;
  const boundedContent =
    activeRowWindow
      ? {
          width: (
            resolved.flowItems
              ? childWindowItems(resolved.flowItems, activeRowWindow).reduce((sum, item) => sum + item.width, 0)
              : childWindowItems(resolved.words, activeRowWindow).reduce((sum, word) => sum + word.width, 0)
          ) + spacing * Math.max(0, rowWindowCount - 1),
          height: fullContent.height,
        }
      : fullContent;
  const finalSized = activeRowWindow
    ? resolveSelfLayoutSize(
        row,
        fullContent,
        available,
        rctx,
        paddedSize(row, fullContent, rctx),
        paddedSize(row, boundedContent, rctx),
        fitParentAvailable,
        fitParentFallbackAxes,
        available,
      )
    : sized;
  return {
    row,
    words: resolved.words,
    flowItems: resolved.flowItems,
    contentWidth: resolved.content.width,
    contentHeight: resolved.content.height,
    width: rowFontFit && rowFontFit.mode !== 'natural' ? rowTargetWidth : finalSized.width,
    height: finalSized.height,
    spacing,
  };
}

function aggregateChildSizes(
  entity: PhysicalEntity,
  children: Array<{ entity: PhysicalEntity; size: Size }>,
  rctx: ResolveContext,
  positionReference: Size,
  allowOverflow = false,
  flowGapOverride?: number,
): Size | undefined {
  if (children.length === 0) return undefined;
  const mode = layoutModeOf(entity.layout, rctx);
  const childWindow = activeChildWindow(entity, mode, children.length, rctx);
  const allowWindowOverflow = allowOverflow || childWindow !== undefined;
  if (mode === 'row') {
    const gap =
      flowGapOverride ??
      constrainedHorizontalGap(
        entity,
        rctx,
        positionReference.width,
        children.map((child) => child.size.width),
        allowWindowOverflow,
      );
    return {
      width: children.reduce((sum, child) => sum + child.size.width, 0) + gap * Math.max(0, children.length - 1),
      height: Math.max(...children.map((child) => child.size.height)),
    };
  }
  if (mode === 'column') {
    const gap =
      flowGapOverride ??
      constrainedVerticalGap(
        entity,
        rctx,
        positionReference.height,
        children.map((child) => child.size.height),
        allowWindowOverflow,
      );
    return {
      width: Math.max(...children.map((child) => child.size.width)),
      height: children.reduce((sum, child) => sum + child.size.height, 0) + gap * Math.max(0, children.length - 1),
    };
  }
  const positioned = children.map(({ entity: child, size }) => {
    const position = resolvedPositionOf(child, rctx, positionReference);
    return { x: position.x, y: position.y, width: size.width, height: size.height };
  });
  const minX = Math.min(...positioned.map((box) => box.x));
  const minY = Math.min(...positioned.map((box) => box.y));
  const maxX = Math.max(...positioned.map((box) => box.x + box.width));
  const maxY = Math.max(...positioned.map((box) => box.y + box.height));
  return { width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
}

function childWindowFor(entity: PhysicalEntity, rctx: ResolveContext): LayoutChildWindow | undefined {
  return entity.layout?.childWindow(rctx);
}

function activeChildWindow(
  entity: PhysicalEntity,
  mode: LayoutMode,
  childCount: number,
  rctx: ResolveContext,
): LayoutChildWindow | undefined {
  const window = childWindowFor(entity, rctx);
  const mainAxis = mode === 'row' ? 'horizontal' : mode === 'column' ? 'vertical' : undefined;
  return window?.mode === 'count' && window.axis === mainAxis && childCount > window.count ? window : undefined;
}

function flowSpacerUsesPercentage(entity: PhysicalEntity, mode: LayoutMode, rctx: ResolveContext): boolean {
  if (mode !== 'row' && mode !== 'column') return false;
  const spacer =
    mode === 'row'
      ? entity.components.find((component): component is HorizontalSpacer => component instanceof HorizontalSpacer)
      : entity.components.find((component): component is VerticalSpacer => component instanceof VerticalSpacer);
  return spacer?.getProp<string>('unit')?.resolve(rctx) === '%';
}

function resolveWindowGap(
  itemExtents: readonly number[],
  referenceExtent: number,
  gapForExtent: (extent: number) => number,
  usesPercentage: boolean,
  fixedExtent = itemExtents.reduce((sum, extent) => sum + extent, 0),
): number {
  const slots = Math.max(0, itemExtents.length - 1);
  const referenceGap = gapForExtent(referenceExtent);
  if (!usesPercentage || slots === 0) return referenceGap;

  let gap = gapForExtent(Math.max(1, fixedExtent));
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const nextExtent = Math.max(1, fixedExtent + gap * slots);
    const nextGap = gapForExtent(nextExtent);
    if (Math.abs(nextGap - gap) < 0.000001) return nextGap;
    gap = nextGap;
  }
  return gap;
}

function childWindowItems<T>(items: readonly T[], window: LayoutChildWindow, startOverride?: number): T[] {
  const count = Math.min(items.length, Math.max(1, Math.floor(window.count)));
  if (count >= items.length) return items.slice();
  const defaultStart =
    window.anchor === 'end'
      ? items.length - count
      : window.anchor === 'center'
        ? Math.floor((items.length - count) / 2)
        : 0;
  const start = startOverride === undefined ? defaultStart : Math.max(0, Math.min(items.length - count, startOverride));
  return items.slice(start, start + count);
}

function motionFocusWindowStart(
  page: Page,
  items: readonly MeasuredPageFlowLayoutItem[],
  window: LayoutChildWindow,
  rctx: ResolveContext,
): number | undefined {
  if (window.selection !== 'motionFocus' || window.axis !== 'vertical' || items.length <= window.count) return undefined;
  const motion = page.getComponent<LayoutMotion>('layoutMotion');
  const local = page.contextFor(rctx);
  if (!motion?.enabled(local)) return undefined;

  const currentIndex = items.findIndex((item) => item.kind === 'row' && item.row.row.state === 'current');
  if (currentIndex < 0) return undefined;

  const count = Math.min(items.length, Math.max(1, Math.floor(window.count)));
  const physicalFocusSlot = Math.round((count - 1) * motion.focusPosition(local, 'currentRow'));
  const flowFocusSlot = pageFlowsBottomToTop(page, rctx) ? count - 1 - physicalFocusSlot : physicalFocusSlot;
  return Math.max(0, Math.min(items.length - count, currentIndex - flowFocusSlot));
}

function boundedChildSize(
  entity: PhysicalEntity,
  children: Array<{ entity: PhysicalEntity; size: Size }>,
  fullSize: Size,
  rctx: ResolveContext,
  positionReference: Size,
): Size {
  const mode = layoutModeOf(entity.layout, rctx);
  const window = activeChildWindow(entity, mode, children.length, rctx);
  if (!window) return fullSize;
  const boundedChildren = childWindowItems(children, window);
  const itemExtents = boundedChildren.map(({ size }) => (window.axis === 'horizontal' ? size.width : size.height));
  const windowGap =
    mode === 'row'
      ? resolveWindowGap(
          itemExtents,
          positionReference.width,
          (extent) => constrainedHorizontalGap(entity, rctx, extent, itemExtents, true),
          flowSpacerUsesPercentage(entity, mode, rctx),
        )
      : resolveWindowGap(
          itemExtents,
          positionReference.height,
          (extent) => constrainedVerticalGap(entity, rctx, extent, itemExtents, true),
          flowSpacerUsesPercentage(entity, mode, rctx),
        );
  const bounded = aggregateChildSizes(entity, boundedChildren, rctx, positionReference, true, windowGap);
  if (!bounded) return fullSize;
  return window.axis === 'horizontal'
    ? { width: bounded.width, height: fullSize.height }
    : { width: fullSize.width, height: bounded.height };
}

function pageFlowItemSize(
  items: MeasuredPageFlowLayoutItem[],
  mode: LayoutMode,
  gap: number | readonly number[],
): Size {
  if (items.length === 0) return { width: 0, height: 0 };
  const totalGap = typeof gap === 'number'
    ? gap * Math.max(0, items.length - 1)
    : gap.slice(0, Math.max(0, items.length - 1)).reduce((sum, value) => sum + value, 0);
  if (mode === 'row') {
    return {
      width: items.reduce((sum, item) => sum + pageFlowItemExtent(item, 'row'), 0) + totalGap,
      height: Math.max(...items.map((item) => pageFlowItemExtent(item, 'column'))),
    };
  }
  return {
    width: Math.max(...items.map((item) => pageFlowItemExtent(item, 'row'))),
    height: items.reduce((sum, item) => sum + pageFlowItemExtent(item, 'column'), 0) + totalGap,
  };
}

function pageFlowItemExtent(item: MeasuredPageFlowLayoutItem, axis: 'row' | 'column'): number {
  if (item.kind === 'row') return axis === 'row' ? item.row.width : item.row.height;
  return axis === 'row' ? item.width : item.height;
}

function boundedPageFlowSize(
  page: Page,
  items: MeasuredPageFlowLayoutItem[],
  fullSize: Size,
  mode: LayoutMode,
  rctx: ResolveContext,
  referenceExtent: number,
  rowSpacing: number | undefined,
  rowSpacingExtras: ReadonlyMap<number, number> | undefined,
): Size {
  const window = activeChildWindow(page, mode, items.length, rctx);
  if (!window) return fullSize;
  const boundedItems = childWindowItems(items, window, motionFocusWindowStart(page, items, window, rctx));
  const itemExtents = boundedItems.map((item) =>
    mode === 'row' ? (item.kind === 'row' ? item.row.width : item.width) : item.kind === 'row' ? item.row.height : item.height,
  );
  const windowGap = resolveWindowGap(
    itemExtents,
    referenceExtent,
    (extent) =>
      mode === 'row'
        ? constrainedHorizontalGap(page, rctx, extent, itemExtents, true)
        : constrainedRowGapForFlow(page, rctx, extent, itemExtents, rowSpacing, true),
    flowSpacerUsesPercentage(page, mode, rctx),
  );
  const boundedGap = mode === 'row'
    ? windowGap
    : rowGapsForFlowItems(page, rctx, referenceExtent, boundedItems, rowSpacing, rowSpacingExtras, true);
  const bounded = pageFlowItemSize(boundedItems, mode, boundedGap);
  return window.axis === 'horizontal'
    ? {
        width: bounded.width,
        height: fullSize.height,
      }
    : {
        width: fullSize.width,
        height: bounded.height,
      };
}

function measuredPageFlowChild(
  child: Row | ImageFlowEntity,
  ctx: CanvasContext2D,
  rctx: ResolveContext,
  wordSpacing: number | undefined,
  available: Size,
  fitParentAvailable: Size,
  fitParentFallbackAxes: FitParentFallbackAxes | undefined,
  flowImageMeasurements: ReadonlyMap<string, FlowImageMeasurement> | undefined,
): MeasuredPageFlowChild {
  if (child instanceof ImageFlowEntity) {
    const size = resolveFlowImageSize(child, flowImageMeasurementFor(child, flowImageMeasurements), rctx, available);
    return { kind: 'image', entity: child, width: size.width, height: size.height };
  }
  return {
    kind: 'row',
    row: measureRow(
      child,
      ctx,
      rctx,
      wordSpacing,
      wordGapExtraOf(child, rctx, available.width),
      { x: 0, y: 0, width: available.width, height: available.height },
      fitParentAvailable,
      fitParentFallbackAxes,
      flowImageMeasurements,
    ),
  };
}

function measuredPageFlowChildren(
  page: Page,
  flowChildren: Array<Row | ImageFlowEntity>,
  ctx: CanvasContext2D,
  rctx: ResolveContext,
  wordSpacing: number | undefined,
  available: Size,
  fitParentAvailable: Size,
  fitParentFallbackAxes: FitParentFallbackAxes | undefined,
  flowImageMeasurements: ReadonlyMap<string, FlowImageMeasurement> | undefined,
): MeasuredPageFlowChild[] {
  const imageWidth = flowChildren.reduce((sum, child) => {
    if (!(child instanceof ImageFlowEntity)) return sum;
    return sum + resolveFlowImageSize(child, flowImageMeasurementFor(child, flowImageMeasurements), rctx, available).width;
  }, 0);
  const rowAvailableWidth = Math.max(1, available.width - imageWidth);
  const rowFitParentAvailable = {
    ...fitParentAvailable,
    width: Math.max(1, Math.min(fitParentAvailable.width, rowAvailableWidth)),
  };

  return flowChildren.map((child) => {
    const childAvailable = child instanceof Row ? { ...available, width: rowAvailableWidth } : available;
    return measuredPageFlowChild(
      child,
      ctx,
      rctx,
      wordSpacing,
      childAvailable,
      child instanceof Row ? rowFitParentAvailable : fitParentAvailable,
      fitParentFallbackAxes,
      flowImageMeasurements,
    );
  });
}

function pageFlowLayoutItems(
  page: Page,
  measured: MeasuredPageFlowChild[],
  rctx: ResolveContext,
  contentHeight: number,
  rowSpacing: number | undefined,
  rowSpacingExtras: ReadonlyMap<number, number> | undefined,
  allowOverflow = false,
): MeasuredPageFlowLayoutItem[] {
  // Keep the authored tree flat while giving state rows their own column in row pages.
  if (!measured.some((entry) => entry.kind === 'row' && entry.row.row.state !== 'default')) return measured;

  const rows = measured.filter((entry): entry is { kind: 'row'; row: MeasuredRow } => entry.kind === 'row').map((entry) => entry.row);
  if (rows.length === 0) return measured;

  const gaps = rowGapsForMeasuredRows(
    page,
    rctx,
    contentHeight,
    rows,
    rowSpacing,
    rowSpacingExtras,
    allowOverflow,
  );
  const gap = rowGapForFlow(page, rctx, contentHeight, rowSpacing);
  const stack: MeasuredPageFlowLayoutItem = {
    kind: 'state-stack',
    rows,
    width: rows.reduce((max, row) => Math.max(max, row.width), 0),
    height: rows.reduce((sum, row) => sum + row.height, 0) + gaps.reduce((sum, value) => sum + value, 0),
    gap,
    gaps,
  };
  const firstRowIndex = measured.findIndex((entry) => entry.kind === 'row');
  return measured.flatMap((entry, index): MeasuredPageFlowLayoutItem[] => {
    if (index === firstRowIndex) return [stack];
    return entry.kind === 'row' ? [] : [entry];
  });
}

function paddedSize(entity: PhysicalEntity, size: Size, rctx: ResolveContext): Size {
  const padding = entity.layout
    ? layoutInsets(entity.layout, 'padding', rctx)
    : entity instanceof CompositionArea
      ? {
          top: DEFAULT_AREA_SAFE_PADDING,
          right: DEFAULT_AREA_SAFE_PADDING,
          bottom: DEFAULT_AREA_SAFE_PADDING,
          left: DEFAULT_AREA_SAFE_PADDING,
        }
      : ZERO_LAYOUT_INSETS;
  return {
    width: size.width + padding.left + padding.right,
    height: size.height + padding.top + padding.bottom,
  };
}

function intrinsicSizeOf(
  entity: PhysicalEntity,
  ctx: CanvasContext2D,
  rctx: ResolveContext,
  available: Size,
  wordSpacing?: number,
  fitParentAvailable: Size = available,
  rowSpacing?: number,
  flowImageMeasurements?: ReadonlyMap<string, FlowImageMeasurement>,
  parentChildrenSizing: LayoutChildrenSizing = 'constrained',
  rowSpacingExtras?: ReadonlyMap<number, number>,
): IntrinsicSize {
  if (entity instanceof Word) {
    const text = textOf(entity);
    const wordContext = entity.contextFor(rctx);
    const measured = text ? text.measure(ctx, wordContext, entity.text) : { width: 0, height: 0 };
    const resolved = resolveSelfLayoutSize(entity, measured, available, rctx, measured, undefined, fitParentAvailable);
    const flowSize = scaledWordSize(entity, resolved, rctx);
    return {
      content: measured,
      resolved: { ...resolved, width: flowSize.width, height: flowSize.height },
    };
  }

  if (entity instanceof ImageFlowEntity) {
    const measurement = flowImageMeasurementFor(entity, flowImageMeasurements);
    const size = resolveFlowImageSize(entity, measurement, rctx, available);
    return { content: size, resolved: size };
  }

  if (entity instanceof Row) {
    const measured = measureRow(
      entity,
      ctx,
      rctx,
      wordSpacing,
      wordGapExtraOf(entity, rctx, available.width),
      { x: 0, y: 0, width: available.width, height: available.height },
      fitParentAvailable,
      undefined,
      flowImageMeasurements,
    );
    const content = { width: measured.contentWidth, height: measured.contentHeight };
    return { content, children: content, resolved: { width: measured.width, height: measured.height } };
  }

  if (entity instanceof Page) {
    const childAvailable = sizeForOverflowingChild(entity, available, rctx, parentChildrenSizing);
    const childFitParentAvailable = sizeForOverflowingChild(entity, fitParentAvailable, rctx, parentChildrenSizing);
    const flowChildren = entity.children.filter(
      (child): child is Row | ImageFlowEntity =>
        (child instanceof Row && !isAbsolutePositioned(child, rctx) && participatesInFlow(child)) ||
        (child instanceof ImageFlowEntity && !isAbsolutePositioned(child, rctx) && participatesInFlow(child)),
    );
    const pageMode = layoutModeOf(entity.layout, rctx);
    const pageFlowMode = pageMode === 'row' ? 'row' : 'column';
    if (pageMode === 'row') {
      const measured = measuredPageFlowChildren(
        entity,
        flowChildren,
        ctx,
        rctx,
        wordSpacing,
        childAvailable,
        childFitParentAvailable,
        undefined,
        flowImageMeasurements,
      );
      const children = pageFlowLayoutItems(entity, measured, rctx, available.height, rowSpacing, rowSpacingExtras);
      const gap = constrainedHorizontalGap(
        entity,
        rctx,
        available.width,
        children.map((child) => (child.kind === 'row' ? child.row.width : child.width)),
        activeChildWindow(entity, pageFlowMode, children.length, rctx) !== undefined,
      );
      const fullChildSize = children.length > 0 ? pageFlowItemSize(children, pageFlowMode, gap) : undefined;
      const fitChildrenSize = fullChildSize
        ? boundedPageFlowSize(entity, children, fullChildSize, pageFlowMode, rctx, available.width, rowSpacing, rowSpacingExtras)
        : undefined;
      const content = fullChildSize ? paddedSize(entity, fullChildSize, rctx) : available;
      const childrenContent = fitChildrenSize ? paddedSize(entity, fitChildrenSize, rctx) : content;
      const resolved = constrainFitChildrenSize(
        resolveSelfLayoutSize(entity, available, available, rctx, content, childrenContent, fitParentAvailable),
        fitParentAvailable,
        parentChildrenSizing,
      );
      return { content, children: childrenContent, resolved: { width: resolved.width, height: resolved.height } };
    }
    const fitParentFallbackAxes = {
      width: entity.transform?.widthMode(rctx) === 'fitChildren',
      height: entity.transform?.heightMode(rctx) === 'fitChildren',
    };
    const measured = flowChildren.map((child) =>
      measuredPageFlowChild(
        child,
        ctx,
        rctx,
        wordSpacing,
        childAvailable,
        childFitParentAvailable,
        fitParentFallbackAxes,
        flowImageMeasurements,
      ),
    );
    const pageWindow = activeChildWindow(entity, pageFlowMode, measured.length, rctx);
    const rowGaps = rowGapsForFlowItems(
      entity,
      rctx,
      available.height,
      measured,
      rowSpacing,
      rowSpacingExtras,
      pageWindow !== undefined,
    );
    const fullFlowSize = pageFlowItemSize(measured, pageFlowMode, rowGaps);
    const fitChildrenSize = boundedPageFlowSize(entity, measured, fullFlowSize, pageFlowMode, rctx, available.height, rowSpacing, rowSpacingExtras);
    const content = paddedSize(entity, fullFlowSize, rctx);
    const childrenContent = paddedSize(entity, fitChildrenSize, rctx);
    const resolved = constrainFitChildrenSize(
      resolveSelfLayoutSize(entity, available, available, rctx, content, childrenContent, fitParentAvailable),
      fitParentAvailable,
      parentChildrenSizing,
    );
    return { content, children: childrenContent, resolved: { width: resolved.width, height: resolved.height } };
  }

  if (entity instanceof VideoArea) {
    const video = entity.video;
    const videoIntrinsic = video
      ? intrinsicSizeOf(
          video,
          ctx,
          rctx,
          available,
          wordSpacing,
          fitParentAvailable,
          rowSpacing,
          flowImageMeasurements,
          childrenSizingOf(entity.layout, rctx),
          rowSpacingExtras,
        )
      : undefined;
    const content = videoIntrinsic ? paddedSize(entity, videoIntrinsic.content, rctx) : available;
    const resolved = resolveSelfLayoutSize(entity, available, available, rctx, content, content, fitParentAvailable);
    return { content, children: content, resolved: { width: resolved.width, height: resolved.height } };
  }

  if (entity instanceof Video) {
    const authoredWidth = entity.transform?.resolvedAuthoredDimension('x', rctx, available.width);
    const authoredHeight = entity.transform?.resolvedAuthoredDimension('y', rctx, available.height);
    const content = { width: authoredWidth ?? available.width, height: authoredHeight ?? available.height };
    const resolved = resolveSelfLayoutSize(entity, available, available, rctx, content, undefined, fitParentAvailable);
    return { content, resolved: { width: resolved.width, height: resolved.height } };
  }

  const childCandidates = entity.children.filter((child) => !isAbsolutePositioned(child, rctx));
  const childWindow = activeChildWindow(
    entity,
    layoutModeOf(entity.layout, rctx),
    childCandidates.filter((child) => participatesInFlow(child)).length,
    rctx,
  );
  const children = (childWindow ? childCandidates.filter((child) => participatesInFlow(child)) : childCandidates)
    .map((child) => ({
    entity: child,
    size: intrinsicSizeOf(
      child,
      ctx,
      rctx,
      available,
      wordSpacing,
      fitParentAvailable,
      rowSpacing,
      flowImageMeasurements,
      childrenSizingOf(entity.layout, rctx),
      rowSpacingExtras,
    ).resolved,
    }));
  const childSize = aggregateChildSizes(entity, children, rctx, available);
  const boundedSize = childSize ? boundedChildSize(entity, children, childSize, rctx, available) : undefined;
  const content = childSize ? paddedSize(entity, childSize, rctx) : available;
  const childrenContent = boundedSize ? paddedSize(entity, boundedSize, rctx) : content;
  const resolved = resolveSelfLayoutSize(entity, available, available, rctx, content, childrenContent, fitParentAvailable);
  const result: IntrinsicSize = {
    content,
    resolved: { width: resolved.width, height: resolved.height },
  };
  if (childSize) result.children = childrenContent;
  return result;
}

function rowLeft(rowWidth: number, areaX: number, areaWidth: number, align: HorizontalAlign): number {
  if (align === 'left') return areaX;
  if (align === 'right') return areaX + areaWidth - rowWidth;
  if (align === 'stretch') return areaX;
  return areaX + (areaWidth - rowWidth) / 2;
}

function rowFlowsRightToLeft(row: Row, rctx: ResolveContext, textDirection: ResolvedTextDirection): boolean {
  if (textDirection === 'rtl') return true;
  const motion = row.getComponent<LayoutMotion>('layoutMotion');
  if (!motion) return false;
  const local = row.contextFor(rctx);
  return motion.enabled(local) && motion.flowDirection(local, 'currentWord') === 'leftToRight';
}

function pageFlowsBottomToTop(page: Page, rctx: ResolveContext): boolean {
  const motion = page.getComponent<LayoutMotion>('layoutMotion');
  if (!motion) return false;
  const local = page.contextFor(rctx);
  return motion.enabled(local) && motion.flowDirection(local, 'currentRow') === 'bottomToTop';
}

function blockTop(blockHeight: number, areaY: number, areaHeight: number, align: VerticalAlign): number {
  if (align === 'top') return areaY;
  if (align === 'bottom') return areaY + areaHeight - blockHeight;
  if (align === 'stretch') return areaY;
  return areaY + (areaHeight - blockHeight) / 2;
}

function anchoredOverflowStart(
  blockSize: number,
  areaStart: number,
  areaSize: number,
  anchor: 'start' | 'center' | 'end',
): number {
  if (anchor === 'center') return areaStart + (areaSize - blockSize) / 2;
  if (anchor === 'end') return areaStart + areaSize - blockSize;
  return areaStart;
}

function reverseWindowAnchor(anchor: 'start' | 'center' | 'end'): 'start' | 'center' | 'end' {
  return anchor === 'start' ? 'end' : anchor === 'end' ? 'start' : 'center';
}

const ZERO_LAYOUT_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

function layoutInsets(component: Component, key: string, rctx: ResolveContext): Insets {
  return resolveInsets((path, context) => component.getProp(path)?.resolve(context), key, rctx);
}

interface ContentBackgroundInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Reserve page background padding so aligned rows do not place the band outside the frame. */
function contentBackgroundInsets(page: Page, rctx: ResolveContext): ContentBackgroundInsets {
  const local = page.contextFor(rctx);
  const insets: ContentBackgroundInsets = { left: 0, right: 0, top: 0, bottom: 0 };
  for (const component of page.components) {
    if (!(component instanceof BackgroundStyle) || component.getProp<boolean>('enabled')?.resolve(local) === false) continue;
    if (component.boundsMode(local) === 'fillSelf') continue;

    const bandPadding = layoutInsets(component, 'bandPadding', local);
    const blockPadding = layoutInsets(component, 'blockPadding', local);
    const offset = component.getProp<Vector2>('offset')?.resolve(local) ?? { x: 0, y: 0 };
    insets.left = Math.max(insets.left, Math.max(0, bandPadding.left + blockPadding.left - offset.x));
    insets.right = Math.max(insets.right, Math.max(0, bandPadding.right + blockPadding.right + offset.x));
    insets.top = Math.max(insets.top, Math.max(0, bandPadding.top + blockPadding.top - offset.y));
    insets.bottom = Math.max(insets.bottom, Math.max(0, bandPadding.bottom + blockPadding.bottom + offset.y));
  }
  return insets;
}

function normalizeH(value: unknown): HorizontalAlign {
  return value === 'left' || value === 'right' || value === 'stretch' ? value : 'center';
}

function resolveHorizontalAlign(value: unknown, textDirection: ResolvedTextDirection): HorizontalAlign {
  if (value === 'start') return textDirection === 'rtl' ? 'right' : 'left';
  if (value === 'end') return textDirection === 'rtl' ? 'left' : 'right';
  return normalizeH(value);
}

function normalizeV(value: unknown): VerticalAlign {
  if (value === 'top') return 'top';
  if (value === 'center' || value === 'middle') return 'middle';
  return value === 'stretch' ? 'stretch' : 'bottom';
}

export interface Alignment {
  horizontal: HorizontalAlign;
  vertical: VerticalAlign;
}

/**
 * An entity Layout's own alignment, which - under the "parent aligns children"
 * model (see `layoutScene`) - positions that entity's DIRECT children, not the
 * entity itself. `fallback` supplies the value when the entity has no Layout
 * (or unset alignment), used both for the root/back-compat path and by tests
 * that pass alignment through `LayoutOptions`.
 */
export function alignOf(layout: Layout | undefined, rctx: ResolveContext, fallback: Alignment): Alignment {
  const childrenAlignment = layout?.childrenAlignment(rctx);
  const horizontal = childrenAlignment?.horizontalAlignment;
  const vertical = childrenAlignment?.verticalAlignment;
  return {
    horizontal: horizontal == null ? fallback.horizontal : resolveHorizontalAlign(horizontal, rctx.textDirection),
    vertical: vertical == null ? fallback.vertical : normalizeV(vertical),
  };
}

/**
 * Resolve an entity's own rect, for example downbar's bottom bar,
 * or the Viewport's own working area) from its Transform dimensions inside
 * `frame`, plus the `content` rect (area inset by Layout `padding`) where its
 * children are laid out. Missing Transform dimensions mean the area fills the
 * frame - the tight-crop case. The entity's POSITION within `frame` comes
 * from `parentAlign` (the PARENT's alignment. The parent aligns children). When
 * omitted the entity falls back to its own alignment (the root/back-compat
 * case). Generic over any entity with a `.layout` getter so the same
 * resolution nests: the Viewport's `content` becomes the CompositionArea's
 * `frame`, one level down.
 */
export function resolveAreaBox(
  root: PhysicalEntity,
  frame: Box,
  rctx: ResolveContext,
  parentAlign?: Alignment,
  intrinsic?: IntrinsicSize,
  fitParentFrame?: Box,
  parentChildrenSizing: LayoutChildrenSizing = 'constrained',
): { area: Box; content: Box } {
  const layout = root.layout;
  const fallbackNatural = { width: frame.width, height: frame.height };
  const sized = constrainFitChildrenSize(
    resolveSelfLayoutSize(
      root,
      fallbackNatural,
      fallbackNatural,
      rctx,
      intrinsic?.content ?? fallbackNatural,
      intrinsic?.children,
      fitParentFrame ?? frame,
    ),
    fitParentFrame ?? frame,
    parentChildrenSizing,
  );
  const place: Alignment = {
    horizontal: resolveHorizontalPlacement(sized.horizontalAlignment, parentAlign?.horizontal, layout, rctx),
    vertical: resolveVerticalPlacement(sized.verticalAlignment, parentAlign?.vertical, layout, rctx),
  };
  const areaW =
    (sized.horizontalAlignment === 'stretch' || place.horizontal === 'stretch') && sized.widthMode !== 'custom'
      ? frame.width
      : sized.width;
  const areaH =
    (sized.verticalAlignment === 'stretch' || place.vertical === 'stretch') && sized.heightMode !== 'custom'
      ? frame.height
      : sized.height;
  const position = resolvedPositionOf(root, rctx, { width: frame.width, height: frame.height });
  root.layoutPosition = position;
  const areaX = rowLeft(areaW, frame.x, frame.width, place.horizontal) + position.x;
  const areaY = blockTop(areaH, frame.y, frame.height, place.vertical) + position.y;
  const pad = layout
    ? layoutInsets(layout, 'padding', rctx)
    : {
        top: DEFAULT_AREA_SAFE_PADDING,
        right: DEFAULT_AREA_SAFE_PADDING,
        bottom: DEFAULT_AREA_SAFE_PADDING,
        left: DEFAULT_AREA_SAFE_PADDING,
      };
  return {
    area: { x: areaX, y: areaY, width: areaW, height: areaH },
    content: {
      x: areaX + pad.left,
      y: areaY + pad.top,
      width: Math.max(1, areaW - pad.left - pad.right),
      height: Math.max(1, areaH - pad.top - pad.bottom),
    },
  };
}

/** Vertical gap for a Page. An authored spacer controls the gap, including zero when disabled. */
function verticalGapForFlow(entity: PhysicalEntity, rctx: ResolveContext, contentHeight: number): number {
  const spacer = entity.components.find((c): c is VerticalSpacer => c instanceof VerticalSpacer);
  return spacer ? spacer.gap(rctx, contentHeight) : 0;
}

function rowGapForPage(page: Page, rctx: ResolveContext, contentHeight: number): number | undefined {
  const spacer = page.components.find((c): c is VerticalSpacer => c instanceof VerticalSpacer);
  return spacer ? spacer.gap(rctx, contentHeight) : undefined;
}

/** Extra word gap driven by a Row's HorizontalSpacer. The value is zero when absent or disabled. */
function wordGapExtraOf(row: Row, rctx: ResolveContext, contentWidth: number): number {
  const spacer = row.components.find((c): c is HorizontalSpacer => c instanceof HorizontalSpacer);
  return spacer ? spacer.gap(rctx, contentWidth) : 0;
}

/** Horizontal gap between flow children on a Page or Viewport. */
function horizontalGapForFlow(entity: PhysicalEntity, rctx: ResolveContext, contentWidth: number): number {
  const spacer = entity.components.find((c): c is HorizontalSpacer => c instanceof HorizontalSpacer);
  return spacer ? spacer.gap(rctx, contentWidth) : 0;
}

function constrainedHorizontalGap(
  entity: PhysicalEntity,
  rctx: ResolveContext,
  contentWidth: number,
  childWidths: readonly number[],
  allowOverflow = false,
): number {
  const gap = horizontalGapForFlow(entity, rctx, contentWidth);
  const slots = Math.max(0, childWidths.length - 1);
  if (slots === 0) return gap;
  if (allowOverflow) return gap;
  const minimumGap = -Math.min(...childWidths);
  if (gap <= 0) return Math.max(gap, minimumGap);
  const remainingWidth = Math.max(0, contentWidth - childWidths.reduce((sum, width) => sum + width, 0));
  return Math.min(gap, remainingWidth / slots);
}

function constrainedVerticalGap(
  entity: PhysicalEntity,
  rctx: ResolveContext,
  contentHeight: number,
  childHeights: readonly number[],
  allowOverflow = false,
): number {
  const gap = verticalGapForFlow(entity, rctx, contentHeight);
  const slots = Math.max(0, childHeights.length - 1);
  if (slots === 0) return gap;
  if (allowOverflow) return gap;
  const minimumGap = -Math.min(...childHeights);
  if (gap <= 0) return Math.max(gap, minimumGap);
  const remainingHeight = Math.max(0, contentHeight - childHeights.reduce((sum, height) => sum + height, 0));
  return Math.min(gap, remainingHeight / slots);
}

function rowGapForFlow(
  page: Page,
  rctx: ResolveContext,
  contentHeight: number,
  configuredRowSpacing: number | undefined,
): number {
  const spacerGap = rowGapForPage(page, rctx, contentHeight);
  if (spacerGap !== undefined) return spacerGap;
  if (configuredRowSpacing === undefined) return 0;
  return clampSpacerGap(configuredRowSpacing, contentHeight);
}

function extraRowGapFor(
  previous: MeasuredPageFlowChild | MeasuredPageFlowLayoutItem,
  current: MeasuredPageFlowChild | MeasuredPageFlowLayoutItem,
  rowSpacingExtras: ReadonlyMap<number, number> | undefined,
): number {
  if (previous.kind !== 'row' || current.kind !== 'row') return 0;
  return rowSpacingExtras?.get(current.row.row.patternIndex) ?? 0;
}

function constrainedGaps(
  gaps: number[],
  childHeights: readonly number[],
  contentHeight: number,
  allowOverflow: boolean,
): number[] {
  if (allowOverflow || gaps.length === 0) return gaps;
  const minimumGap = -Math.min(...childHeights);
  const normalized = gaps.map((gap) => Math.max(gap, minimumGap));
  const availableGapHeight = Math.max(0, contentHeight - childHeights.reduce((sum, height) => sum + height, 0));
  const positiveHeight = normalized.reduce((sum, gap) => sum + Math.max(0, gap), 0);
  if (positiveHeight <= availableGapHeight || positiveHeight === 0) return normalized;
  const scale = availableGapHeight / positiveHeight;
  return normalized.map((gap) => (gap > 0 ? gap * scale : gap));
}

function rowGapsForFlowItems(
  page: Page,
  rctx: ResolveContext,
  contentHeight: number,
  items: readonly (MeasuredPageFlowChild | MeasuredPageFlowLayoutItem)[],
  configuredRowSpacing: number | undefined,
  rowSpacingExtras: ReadonlyMap<number, number> | undefined,
  allowOverflow = false,
): number[] {
  const baseGap = rowGapForFlow(page, rctx, contentHeight, configuredRowSpacing);
  const gaps = items.slice(1).map((item, index) =>
    baseGap + extraRowGapFor(items[index], item, rowSpacingExtras),
  );
  return constrainedGaps(
    gaps,
    items.map((item) => (item.kind === 'row' ? item.row.height : item.height)),
    contentHeight,
    allowOverflow,
  );
}

function rowGapsForMeasuredRows(
  page: Page,
  rctx: ResolveContext,
  contentHeight: number,
  rows: readonly MeasuredRow[],
  configuredRowSpacing: number | undefined,
  rowSpacingExtras: ReadonlyMap<number, number> | undefined,
  allowOverflow = false,
): number[] {
  const baseGap = rowGapForFlow(page, rctx, contentHeight, configuredRowSpacing);
  const gaps = rows.slice(1).map((row, index) =>
    baseGap + (rowSpacingExtras?.get(row.row.patternIndex) ?? 0),
  );
  return constrainedGaps(
    gaps,
    rows.map((row) => row.height),
    contentHeight,
    allowOverflow,
  );
}

function constrainedRowGapForFlow(
  page: Page,
  rctx: ResolveContext,
  contentHeight: number,
  childHeights: readonly number[],
  configuredRowSpacing: number | undefined,
  allowOverflow = false,
): number {
  const gap = rowGapForFlow(page, rctx, contentHeight, configuredRowSpacing);
  const slots = Math.max(0, childHeights.length - 1);
  if (slots === 0) return gap;
  if (allowOverflow) return gap;
  const minimumGap = -Math.min(...childHeights);
  if (gap <= 0) return Math.max(gap, minimumGap);
  const remainingHeight = Math.max(0, contentHeight - childHeights.reduce((sum, height) => sum + height, 0));
  return Math.min(gap, remainingHeight / slots);
}

function boolProp(component: Component | undefined, key: string, rctx: ResolveContext, fallback: boolean): boolean {
  const value = component?.getProp<boolean>(key)?.resolve(rctx);
  return typeof value === 'boolean' ? value : fallback;
}

export function contentBoxFromArea(area: Box, layout: Layout | undefined, rctx: ResolveContext): Box {
  const pad = layout ? layoutInsets(layout, 'padding', rctx) : ZERO_LAYOUT_INSETS;
  return {
    x: area.x + pad.left,
    y: area.y + pad.top,
    width: Math.max(1, area.width - pad.left - pad.right),
    height: Math.max(1, area.height - pad.top - pad.bottom),
  };
}

/** Local-space clip rectangle for an entity whose Layout has `clipContent` enabled. */
export function contentClipBox(entity: PhysicalEntity, rctx: ResolveContext): Box | undefined {
  if (!entity.box) return undefined;
  const layout = entity.layout;
  if (!layout || layout.getProp<boolean>('clipContent')?.resolve(rctx) !== true) return undefined;
  const pad = layoutInsets(layout, 'padding', rctx);
  return {
    x: -entity.box.width / 2 + pad.left,
    y: -entity.box.height / 2 + pad.top,
    width: Math.max(1, entity.box.width - pad.left - pad.right),
    height: Math.max(1, entity.box.height - pad.top - pad.bottom),
  };
}

function centerOfBox(box: Box): Vector2 {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function pointOnBox(box: Box, pivot: TransformPivot): Vector2 {
  const x = pivot.endsWith('Left') ? box.x : pivot.endsWith('Right') ? box.x + box.width : box.x + box.width / 2;
  const y = pivot.startsWith('top') ? box.y : pivot.startsWith('bottom') ? box.y + box.height : box.y + box.height / 2;
  return { x, y };
}

/**
 * Resolve the transform pivot from stable flow geometry. Visible background
 * coverage remains independent from this transform reference.
 */
export function resolveTransformPivot(entity: PhysicalEntity, rctx: ResolveContext): Vector2 {
  const boxCenter = entity.box ? centerOfBox(entity.box) : { x: 0, y: 0 };
  let pivotBox = entity.box;
  if ((entity instanceof Page || entity instanceof Row) && entity.flowBox) {
    pivotBox = entity.flowBox;
  } else if (entity instanceof Page) {
    const background = entity
      .getComponentsByType('backgroundStyle')
      .find(
        (component): component is BackgroundStyle =>
          component instanceof BackgroundStyle && component.getProp<boolean>('enabled')?.resolve(rctx) !== false,
      );
    pivotBox =
      (background?.rowBoxes?.length ? boundingUnion([...background.rowBoxes]) : null) ??
      background?.box ??
      boundingUnion(
        entity.children
          .filter((child): child is Row => child instanceof Row)
          .map((row) => row.box)
          .filter((box): box is Box => !!box),
      ) ??
      entity.box;
  }
  return pivotBox ? pointOnBox(pivotBox, entity.transform?.pivot(rctx) ?? 'center') : boxCenter;
}

function markerTargetEntity(
  marker: Marker,
  parent: PhysicalEntity | undefined,
  root: PhysicalEntity,
  rctx: ResolveContext,
): PhysicalEntity | undefined {
  const followTarget = marker.getComponent<FollowTarget>('followTarget');
  return followTarget
    ? resolveFollowTarget(root, parent, followTarget.resolveConfig(rctx), rctx)
    : undefined;
}

/** Resolve Marker overlay boxes after normal caption layout is complete. */
function resolveMarkerBoxes(root: PhysicalEntity, rctx: ResolveContext): void {
  const followContext = prepareFollowContext(root, rctx);
  const walk = (entity: PhysicalEntity, parent?: PhysicalEntity): void => {
    for (const child of entity.children) {
      if (child instanceof Marker) {
        const targetEntity = markerTargetEntity(child, entity, root, followContext);
        child.resolvedTarget = targetEntity ?? null;
        const target = targetEntity?.box;
        const positionProperty = child.transform?.getProp<Vector2>('position');
        if (!target) {
          child.box = null;
          child.layoutPosition = null;
          positionProperty?.clearResolvedValue();
          positionProperty?.setTransitionKey(undefined);
          continue;
        }
        const transform = child.transform;
        const width = Math.max(1, transform?.resolvedAuthoredDimension('x', rctx, target.width) ?? 32);
        const height = Math.max(1, transform?.resolvedAuthoredDimension('y', rctx, target.height) ?? width);
        const followTarget = child.getComponent<FollowTarget>('followTarget');
        const targetPosition =
          followTarget && target
            ? (() => {
                const followedPosition = positionProperty?.resolve(followContext);
                return followedPosition &&
                  Number.isFinite(followedPosition.x) &&
                  Number.isFinite(followedPosition.y)
                  ? followedPosition
                  : resolvedFollowPosition(targetEntity!, followTarget.resolveConfig(followContext), followContext);
              })()
            : undefined;
        if (!followTarget || !targetPosition) {
          child.box = null;
          child.layoutPosition = null;
          positionProperty?.clearResolvedValue();
          positionProperty?.setTransitionKey(undefined);
          continue;
        }
        const anchor = followTarget.resolveConfig(rctx).anchor;
        const anchorOffset = anchorOffsetForBox(width, height, anchor);
        positionProperty?.clearResolvedValue();
        positionProperty?.setTransitionKey(
          child.debugSourceId ? `marker:${child.debugSourceId}:position` : undefined,
        );
        child.transform?.getProp<Vector2>('dimensions')?.setTransitionKey(
          child.debugSourceId ? `marker:${child.debugSourceId}:dimensions` : undefined,
        );
        child.box = {
          x: targetPosition.x - anchorOffset.x,
          y: targetPosition.y - anchorOffset.y,
          width,
          height,
        };
        child.layoutPosition = targetPosition;
      }
      walk(child, entity);
    }
  };
  walk(root);
}

function resolveBackgroundEntityBoxes(root: PhysicalEntity, rctx: ResolveContext): void {
  const followContext = prepareFollowContext(root, rctx);
  const walk = (entity: PhysicalEntity): void => {
    for (const child of entity.children) {
      if (child instanceof BackgroundEntity) {
        const followTarget = child.getComponent<FollowTarget>('followTarget');
        const followConfig = followTarget?.resolveConfig(followContext);
        const target = followConfig
          ? resolveFollowTarget(root, entity, followConfig, followContext)
          : undefined;
        child.resolvedTarget = target ?? null;
        const targetBox = target?.box ?? (followTarget ? undefined : entity.box);
        const transform = child.transform;
        const childContext = child.contextFor(followContext);
        const authoredPosition = transform?.position(childContext) ?? { x: 0, y: 0 };
        const position = transform?.resolvedPosition(childContext, {
          width: targetBox?.width ?? 0,
          height: targetBox?.height ?? 0,
        }) ?? authoredPosition;
        const hasPositionXMapping = followConfig?.mappings.some(
          (mapping) => mapping.destination === 'Transform.position.x',
        ) === true;
        const hasPositionYMapping = followConfig?.mappings.some(
          (mapping) => mapping.destination === 'Transform.position.y',
        ) === true;
        const width =
          transform?.resolvedAuthoredDimension('x', followContext, targetBox?.width ?? 0) ?? targetBox?.width ?? 0;
        const height =
          transform?.resolvedAuthoredDimension('y', followContext, targetBox?.height ?? 0) ?? targetBox?.height ?? 0;
        const anchorOffset = followConfig
          ? anchorOffsetForBox(width, height, followConfig.anchor)
          : { x: 0, y: 0 };
        const desiredPosition = targetBox
          ? {
              x: hasPositionXMapping ? authoredPosition.x - anchorOffset.x : targetBox.x + position.x,
              y: hasPositionYMapping ? authoredPosition.y - anchorOffset.y : targetBox.y + position.y,
            }
          : position;
        const positionProperty = transform?.getProp<Vector2>('position');
        const dimensionsProperty = transform?.getProp<Vector2>('dimensions');
        const transitionPrefix = `background:${child.debugSourceId ?? child.id}`;
        positionProperty?.setTransitionKey(`${transitionPrefix}:position`);
        dimensionsProperty?.setTransitionKey(`${transitionPrefix}:dimensions`);
        positionProperty?.setResolvedValue(targetBox ? position : undefined);
        dimensionsProperty?.setResolvedValue(
          targetBox ? { x: width, y: height } : undefined,
        );
        child.layoutPosition = position;
        child.box = targetBox
          ? {
              x: desiredPosition.x,
              y: desiredPosition.y,
              width,
              height,
            }
          : null;
      }
      walk(child);
    }
  };
  walk(root);
}

function layoutModeOf(layout: Layout | undefined, rctx: ResolveContext): LayoutMode {
  const value = layout?.getProp<string>('layoutMode')?.resolve(rctx) ?? layout?.getProp<string>('mode')?.resolve(rctx);
  return value === 'row' || value === 'column' ? value : 'overlay';
}

function childrenSizingOf(layout: Layout | undefined, rctx: ResolveContext): LayoutChildrenSizing {
  return layout?.childrenSizing(rctx) ?? 'constrained';
}

function resolveHorizontalPlacement(
  value: SelfLayoutHorizontalAlignment,
  parent: HorizontalAlign | undefined,
  layout: Layout | undefined,
  rctx: ResolveContext,
): HorizontalAlign {
  if (value === 'left' || value === 'right' || value === 'center') return value;
  if (value === 'start' || value === 'end') return resolveHorizontalAlign(value, rctx.textDirection);
  return value === 'auto'
    ? parent ?? resolveHorizontalAlign(layout?.childrenAlignment(rctx).horizontalAlignment, rctx.textDirection)
    : 'center';
}

function resolveVerticalPlacement(
  value: SelfLayoutVerticalAlignment,
  parent: VerticalAlign | undefined,
  layout: Layout | undefined,
  rctx: ResolveContext,
): VerticalAlign {
  if (value === 'top' || value === 'bottom' || value === 'center') {
    return value === 'center' ? 'middle' : value;
  }
  return value === 'auto' ? parent ?? normalizeV(layout?.childrenAlignment(rctx).verticalAlignment) : 'middle';
}

function resolveVideoAreaChild(area: VideoArea, ctx: CanvasContext2D, rctx: ResolveContext, fallbackAlign: Alignment): void {
  if (!area.box) return;
  const video = area.video;
  if (!video) return;
  const content = contentBoxFromArea(area.box, area.layout, rctx);
  const fitParentContent = area.layout ? content : area.box;
  const childAlign = alignOf(area.layout, rctx, fallbackAlign);
  const intrinsic = intrinsicSizeOf(
    video,
    ctx,
    rctx,
    content,
    undefined,
    fitParentContent,
    undefined,
    undefined,
    childrenSizingOf(area.layout, rctx),
  );
  const { area: videoBox } = resolveAreaBox(
    video,
    content,
    rctx,
    childAlign,
    intrinsic,
    fitParentContent,
    childrenSizingOf(area.layout, rctx),
  );
  video.box = videoBox;
}

function childCrossAlign(
  child: PhysicalEntity,
  mode: 'row',
  rctx: ResolveContext,
  fallback: Alignment,
): VerticalAlign;
function childCrossAlign(
  child: PhysicalEntity,
  mode: 'column',
  rctx: ResolveContext,
  fallback: Alignment,
): HorizontalAlign;
function childCrossAlign(
  child: PhysicalEntity,
  mode: Exclude<LayoutMode, 'overlay'>,
  rctx: ResolveContext,
  fallback: Alignment,
): HorizontalAlign | VerticalAlign {
  const selfLayout = selfLayoutOf(child);
  if (selfLayout?.enabled(rctx)) {
    if (mode === 'row') {
      const value = selfLayout.verticalAlignment(rctx);
      return value === 'auto'
        ? fallback.vertical
        : value === 'center'
          ? 'middle'
          : value;
    }
    const value = selfLayout.horizontalAlignment(rctx);
    return value === 'auto'
      ? fallback.horizontal
      : resolveHorizontalAlign(value, rctx.textDirection);
  }
  const layout = child.layout;
  const childrenAlignment = layout?.childrenAlignment(rctx);
  if (mode === 'row') return normalizeV(childrenAlignment?.verticalAlignment ?? fallback.vertical);
  return resolveHorizontalAlign(childrenAlignment?.horizontalAlignment ?? fallback.horizontal, rctx.textDirection);
}

function resolveFlowChildren(
  parentEntity: PhysicalEntity,
  children: PhysicalEntity[],
  content: Box,
  ctx: CanvasContext2D,
  rctx: ResolveContext,
  mode: Exclude<LayoutMode, 'overlay'>,
  fallbackAlign: Alignment,
  parentArea: Box = content,
  rowSpacing?: number,
  flowImageMeasurements?: ReadonlyMap<string, FlowImageMeasurement>,
): void {
  const mainSize = mode === 'row' ? content.width : content.height;
  const crossSize = mode === 'row' ? content.height : content.width;
  const parentCrossSize = mode === 'row' ? parentArea.height : parentArea.width;
  const mainStart = mode === 'row' ? content.x : content.y;
  const crossStart = mode === 'row' ? content.y : content.x;
  const mainAxis = mode === 'row' ? 'x' : 'y';
  const crossAxis = mode === 'row' ? 'y' : 'x';
  const flowCandidates = children.filter((child) => !isAbsolutePositioned(child, rctx));
  const flowWindow = activeChildWindow(
    parentEntity,
    mode,
    flowCandidates.filter((child) => participatesInFlow(child)).length,
    rctx,
  );
  const flowChildren = flowWindow ? flowCandidates.filter((child) => participatesInFlow(child)) : flowCandidates;
  const specs = flowChildren.map((child) => {
    const intrinsic = intrinsicSizeOf(
      child,
      ctx,
      rctx,
      content,
      undefined,
      parentArea,
      rowSpacing,
      flowImageMeasurements,
      childrenSizingOf(parentEntity.layout, rctx),
    );
    const transform = transformOf(child);
    const mainMode = transform ? (mode === 'row' ? transform.widthMode(rctx) : transform.heightMode(rctx)) : 'custom';
    const crossMode = transform ? (mode === 'row' ? transform.heightMode(rctx) : transform.widthMode(rctx)) : 'custom';
    const aspectRatio = aspectRatioFor(child, intrinsic.content, rctx);
    const mainDimension = child.transform?.resolvedAuthoredDimension(mainAxis, rctx, mainSize);
    const crossDimension = child.transform?.resolvedAuthoredDimension(crossAxis, rctx, crossSize);
    const contentMain = mode === 'row' ? intrinsic.content.width : intrinsic.content.height;
    const contentCross = mode === 'row' ? intrinsic.content.height : intrinsic.content.width;
    const childrenMain = intrinsic.children
      ? mode === 'row'
        ? intrinsic.children.width
        : intrinsic.children.height
      : contentMain;
    const childrenCross = intrinsic.children
      ? mode === 'row'
        ? intrinsic.children.height
        : intrinsic.children.width
      : contentCross;
    const ratioMain =
      aspectRatio && mainMode === 'fitContent' && crossMode === 'fitParent'
        ? mode === 'row'
          ? parentCrossSize * aspectRatio
          : parentCrossSize / aspectRatio
        : undefined;
    // In a flow container, fitParent fills the child cell allocated on the
    // main axis. Treat it as flexible during allocation instead of reserving
    // the entire parent axis for every fitParent child.
    const fixedMain = mainMode === 'custom'
      ? mainDimension
      : mainMode === 'fitParent'
        ? undefined
        : mainMode === 'fitChildren'
          ? childrenMain
          : ratioMain ?? contentMain;
    const fixedCross = crossMode === 'custom'
      ? crossDimension ?? crossSize
      : crossMode === 'fitParent'
        ? parentCrossSize
        : crossMode === 'fitChildren'
          ? childrenCross
          : contentCross;
    return {
      child,
      intrinsic,
      mainMode,
      crossMode,
      isAuto: fixedMain === undefined,
      fixedMain: fixedMain ?? 0,
      fixedCross,
    };
  });

  const childWindow = flowWindow;
  const flowGap =
    mode === 'row'
      ? constrainedHorizontalGap(
          parentEntity,
          rctx,
          mainSize,
          specs.map((spec) => spec.fixedMain),
          childWindow !== undefined,
        )
      : constrainedVerticalGap(
          parentEntity,
          rctx,
          mainSize,
          specs.map((spec) => (spec.fixedMain > 0 ? spec.fixedMain : spec.intrinsic.resolved.height)),
          childWindow !== undefined,
        );
  const fixedMainTotal = specs.reduce((sum, spec) => sum + spec.fixedMain, 0) + flowGap * Math.max(0, specs.length - 1);
  const flexCount = specs.filter((spec) => spec.isAuto).length;
  const flexMain = flexCount > 0 ? Math.max(0, (mainSize - fixedMainTotal) / flexCount) : 0;
  const totalMain = fixedMainTotal + flexMain * flexCount;
  const remainingMain = Math.max(0, mainSize - totalMain);
  const singleItemCount = childWindow === undefined ? specs.length : 0;
  const parentHorizontalSingleItemAlignment = singleItemAlignmentOf(parentEntity.layout, rctx, 'horizontal');
  const parentVerticalSingleItemAlignment = singleItemAlignmentOf(parentEntity.layout, rctx, 'vertical');
  const singleFlowChild = singleItemCount === 1 ? specs[0]?.child : undefined;
  const selfSingleItemMainAlignment =
    mode === 'row'
      ? selfSingleItemAlignmentOf(singleFlowChild, rctx, 'horizontal')
      : selfSingleItemAlignmentOf(singleFlowChild, rctx, 'vertical');
  const singleItemAlignment =
    selfSingleItemMainAlignment ??
    (mode === 'row' ? parentHorizontalSingleItemAlignment : parentVerticalSingleItemAlignment);
  const mainAlign =
    mode === 'row'
      ? singleItemHorizontalAlignment(
          selfSingleItemMainAlignment !== undefined ? 'stretch' : fallbackAlign.horizontal,
          singleItemCount,
          singleItemAlignment,
          rctx.textDirection,
        )
      : singleItemVerticalAlignment(
          selfSingleItemMainAlignment !== undefined ? 'stretch' : fallbackAlign.vertical,
          singleItemCount,
          singleItemAlignment,
        );
  const mainSpacing =
    !childWindow && flexCount === 0 && mainAlign === 'stretch'
      ? flowGap + (specs.length > 1 ? remainingMain / (specs.length - 1) : 0)
      : flowGap;
  let cursor = mainStart;
  if (childWindow && flexCount === 0) {
    const anchor = childWindow.anchor;
    cursor = anchoredOverflowStart(totalMain, mainStart, mainSize, anchor);
  } else if (flexCount === 0 && remainingMain > 0) {
    if (mainAlign === 'center' || mainAlign === 'middle') cursor += remainingMain / 2;
    else if (mainAlign === 'right' || mainAlign === 'bottom') cursor += remainingMain;
  }

  const orderedSpecs =
    mode === 'row' && rctx.textDirection === 'rtl'
      ? [...specs].reverse()
      : specs;
  for (const [specIndex, spec] of orderedSpecs.entries()) {
    const position = resolvedPositionOf(spec.child, rctx, content);
    spec.child.layoutPosition = position;
    const legacyMain = spec.isAuto ? flexMain : spec.fixedMain;
    const legacyCross = spec.fixedCross;
    const natural = mode === 'row'
      ? {
          width: spec.isAuto ? legacyMain : spec.intrinsic.content.width,
          height: spec.crossMode === 'custom' ? legacyCross : spec.intrinsic.content.height,
        }
      : {
          width: spec.crossMode === 'custom' ? legacyCross : spec.intrinsic.content.width,
          height: spec.isAuto ? legacyMain : spec.intrinsic.content.height,
        };
    const flowAvailable = mode === 'row'
      ? { width: legacyMain, height: crossSize }
      : { width: crossSize, height: legacyMain };
    const fitParentFlowAvailable = mode === 'row'
      ? { width: legacyMain, height: parentCrossSize }
      : { width: parentCrossSize, height: legacyMain };
    const sized = resolveSelfLayoutSize(
      spec.child,
      natural,
      flowAvailable,
      rctx,
      spec.intrinsic.content,
      spec.intrinsic.children,
      fitParentFlowAvailable,
      undefined,
      { width: content.width, height: content.height },
    );
    let crossAlign: HorizontalAlign | VerticalAlign;
    if (mode === 'row') {
      const crossAlignValue = sized.verticalAlignment;
      const resolvedCrossAlign =
        crossAlignValue === 'auto'
          ? childCrossAlign(spec.child, 'row', rctx, fallbackAlign)
          : crossAlignValue === 'center'
            ? 'middle'
            : crossAlignValue;
      crossAlign = singleItemVerticalAlignment(
        resolvedCrossAlign,
        singleItemCount,
        selfSingleItemAlignmentOf(spec.child, rctx, 'vertical') ?? parentVerticalSingleItemAlignment,
      );
    } else {
      const crossAlignValue = sized.horizontalAlignment;
      const resolvedCrossAlign =
        crossAlignValue === 'auto'
          ? childCrossAlign(spec.child, 'column', rctx, fallbackAlign)
          : resolveHorizontalAlign(crossAlignValue, rctx.textDirection);
      crossAlign = singleItemHorizontalAlignment(
        resolvedCrossAlign,
        singleItemCount,
        selfSingleItemAlignmentOf(spec.child, rctx, 'horizontal') ?? parentHorizontalSingleItemAlignment,
        rctx.textDirection,
      );
    }
    const boxMain = mode === 'row' ? sized.width : sized.height;
    const boxCross = crossAlign === 'stretch'
      ? crossSize
      : mode === 'row'
        ? sized.height
        : sized.width;
    const remainingCross = Math.max(0, crossSize - boxCross);
    let crossPos = crossStart;
    if (crossAlign === 'center' || crossAlign === 'middle') crossPos += remainingCross / 2;
    else if (crossAlign === 'right' || crossAlign === 'bottom') crossPos += remainingCross;

    spec.child.box =
      mode === 'row'
        ? { x: cursor + position.x, y: crossPos + position.y, width: boxMain, height: boxCross }
        : { x: crossPos + position.x, y: cursor + position.y, width: boxCross, height: boxMain };
    cursor += boxMain + (specIndex < orderedSpecs.length - 1 ? mainSpacing : 0);
  }
}

function canExpandDimension(entity: PhysicalEntity, axis: 'x' | 'y', rctx: ResolveContext): boolean {
  if (entity instanceof Row && axis === 'x' && rctx.rowFontFit?.mode !== 'natural') return false;
  const flowChildCount = entity.children.filter(
    (child) => !isAbsolutePositioned(child, rctx) && participatesInFlow(child),
  ).length;
  const layoutMode = layoutModeOf(entity.layout, rctx);
  const flowMode = entity instanceof Page ? (layoutMode === 'row' ? 'row' : 'column') : layoutMode;
  const window = activeChildWindow(entity, flowMode, flowChildCount, rctx);
  if (window && ((axis === 'x' && window.axis === 'horizontal') || (axis === 'y' && window.axis === 'vertical'))) {
    return false;
  }
  const transform = entity.transform;
  if (!transform) return true;
  const mode = axis === 'x' ? transform.widthMode(rctx) : transform.heightMode(rctx);
  const authoredDimension = transform.authoredDimension(axis, rctx);
  return mode !== 'fitParent' && !(mode === 'custom' && authoredDimension !== undefined);
}

function resolvedPositionOf(
  entity: PhysicalEntity,
  rctx: ResolveContext,
  parentSize: { width: number; height: number },
): Vector2 {
  return entity.transform?.resolvedPosition(entity.contextFor(rctx), parentSize) ?? { x: 0, y: 0 };
}

function alignedContentLeft(box: Box, padding: Insets, contentWidth: number, alignment: HorizontalAlign): number {
  const availableWidth = box.width - padding.left - padding.right;
  if (alignment === 'right') return box.x + box.width - padding.right - contentWidth;
  if (alignment === 'center') return box.x + padding.left + (availableWidth - contentWidth) / 2;
  return box.x + padding.left;
}

function expandBoxToInclude(
  box: Box,
  target: Box,
  padding: Insets,
  expandX: boolean,
  expandY: boolean,
): Box {
  const targetLeft = target.x - padding.left;
  const targetTop = target.y - padding.top;
  const targetRight = target.x + target.width + padding.right;
  const targetBottom = target.y + target.height + padding.bottom;
  const left = expandX ? Math.min(box.x, targetLeft) : box.x;
  const top = expandY ? Math.min(box.y, targetTop) : box.y;
  const right = expandX ? Math.max(box.x + box.width, targetRight) : box.x + box.width;
  const bottom = expandY ? Math.max(box.y + box.height, targetBottom) : box.y + box.height;
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

function parentMapOf(root: PhysicalEntity): ReadonlyMap<PhysicalEntity, PhysicalEntity> {
  const parents = new Map<PhysicalEntity, PhysicalEntity>();
  root.traverse((entity) => {
    for (const child of entity.children) parents.set(child, entity);
  });
  return parents;
}

function constrainBoxToBounds(box: Box, bounds: Box): Box {
  const width = Math.min(box.width, Math.max(0, bounds.width));
  const height = Math.min(box.height, Math.max(0, bounds.height));
  return {
    x: Math.max(bounds.x, Math.min(box.x, bounds.x + bounds.width - width)),
    y: Math.max(bounds.y, Math.min(box.y, bounds.y + bounds.height - height)),
    width,
    height,
  };
}

function parentContentBox(
  entity: PhysicalEntity,
  parents: ReadonlyMap<PhysicalEntity, PhysicalEntity>,
  rctx: ResolveContext,
): Box | undefined {
  const parent = parents.get(entity);
  return parent?.box ? contentBoxFromArea(parent.box, parent.layout, rctx) : undefined;
}

function randomizedPositionBounds(
  entity: PhysicalEntity,
  axis: 'x' | 'y',
  parentBox: Box,
  rctx: ResolveContext,
): NumericRandomizerBounds | undefined {
  const transform = entity.transform;
  const position = transform?.getProp<Vector2>('position');
  const randomizer = position?.randomizer;
  if (!transform || !position || !randomizer) return undefined;

  const base = toVec2(position.resolvedValue)[axis];
  const bounds = vectorRandomizerAxisBounds(randomizer, axis, base);
  const parentExtent = axis === 'x' ? parentBox.width : parentBox.height;
  const unit = axis === 'x' ? transform.positionXUnit(rctx) : transform.positionYUnit(rctx);
  const scale = unit === 'percent' ? parentExtent / 100 : 1;
  return [bounds[0] * scale, bounds[1] * scale];
}

function remappedRandomizedPosition(
  entity: PhysicalEntity,
  axis: 'x' | 'y',
  parentBox: Box,
  rctx: ResolveContext,
): number | undefined {
  const box = entity.box;
  const layoutPosition = entity.layoutPosition;
  if (!box || !layoutPosition) return undefined;

  const randomizerBounds = randomizedPositionBounds(entity, axis, parentBox, rctx);
  if (!randomizerBounds || randomizerBounds[0] === randomizerBounds[1]) return undefined;

  const parentStart = axis === 'x' ? parentBox.x : parentBox.y;
  const parentExtent = axis === 'x' ? parentBox.width : parentBox.height;
  const childStart = axis === 'x' ? box.x : box.y;
  const childExtent = axis === 'x' ? box.width : box.height;
  const requestedPosition = layoutPosition[axis];
  const maxStart = Math.max(parentStart, parentStart + parentExtent - childExtent);
  const isInsideParent =
    childStart >= parentStart &&
    childStart + childExtent <= parentStart + parentExtent;
  if (isInsideParent || maxStart <= parentStart || !Number.isFinite(requestedPosition)) return undefined;

  const sourceSpan = randomizerBounds[1] - randomizerBounds[0];
  if (sourceSpan <= 0 || !Number.isFinite(sourceSpan)) return undefined;
  const normalized = Math.min(
    1,
    Math.max(0, (requestedPosition - randomizerBounds[0]) / sourceSpan),
  );
  return parentStart + (maxStart - parentStart) * normalized;
}

function repairRowFlowBounds(root: PhysicalEntity, rctx: ResolveContext): void {
  root.traverse((entity) => {
    if (!(entity instanceof Row) || !entity.box) return;
    const flowBoxes = entity.children
      .filter((child) => !isAbsolutePositioned(child, rctx) && participatesInFlow(child))
      .filter((child): child is PhysicalEntity & { box: Box } => !!child.box)
      .map((child) => visualBoxForEntity(child, child.box, rctx))
      .filter((box): box is Box => !!box);
    const visibleBounds = boundingUnion(flowBoxes);
    if (!visibleBounds) return;
    const padding = entity.layout ? layoutInsets(entity.layout, 'padding', rctx) : ZERO_LAYOUT_INSETS;
    entity.box = expandBoxToInclude(
      entity.box,
      visibleBounds,
      padding,
      canExpandDimension(entity, 'x', rctx),
      canExpandDimension(entity, 'y', rctx),
    );
  });
}

function repairPageFlowBounds(root: PhysicalEntity, rctx: ResolveContext): void {
  const parents = parentMapOf(root);
  root.traverse((entity) => {
    if (!(entity instanceof Page) || !entity.box) return;
    const flowBoxes = entity.children
      .filter(
        (child) =>
          (child instanceof Row && !isAbsolutePositioned(child, rctx) && participatesInFlow(child)) ||
          (child instanceof ImageFlowEntity && !isAbsolutePositioned(child, rctx) && participatesInFlow(child)),
      )
      .filter((child): child is PhysicalEntity & { box: Box } => !!child.box)
      .map((child) => visualBoxForEntity(child, child.box, rctx))
      .filter((box): box is Box => !!box);
    const visibleBounds = boundingUnion(flowBoxes);
    if (!visibleBounds) return;
    const padding = entity.layout ? layoutInsets(entity.layout, 'padding', rctx) : ZERO_LAYOUT_INSETS;
    const repaired = expandBoxToInclude(
      entity.box,
      visibleBounds,
      padding,
      canExpandDimension(entity, 'x', rctx),
      canExpandDimension(entity, 'y', rctx),
    );
    const hasReservedFlow = entity.find(
      (candidate) => candidate.flowCollapsed && candidate.flowCollapseMode === 'reserve',
    );
    const parent = parents.get(entity);
    const parentAllowsOverflow = parent ? childrenSizingOf(parent.layout, rctx) === 'allowOverflow' : false;
    const bounds = hasReservedFlow || parentAllowsOverflow ? undefined : parentContentBox(entity, parents, rctx);
    const nextBox = bounds ? constrainBoxToBounds(repaired, bounds) : repaired;
    const correctionX = nextBox.x - repaired.x;
    const correctionY = nextBox.y - repaired.y;
    if (correctionX !== 0 || correctionY !== 0) {
      shiftEntityBoxes(entity, correctionX, correctionY);
    }
    entity.box = nextBox;
  });
}

function resolveAbsoluteEntityBoxes(root: PhysicalEntity, ctx: CanvasContext2D, rctx: ResolveContext): void {
  const followContext = prepareFollowContext(root, rctx);
  const walk = (parent: PhysicalEntity): void => {
    const parentArea = parent.box
      ? contentBoxFromArea(parent.box, parent.layout, followContext)
      : { x: 0, y: 0, width: 0, height: 0 };
    for (const child of parent.children) {
      if (
        isAbsolutePositioned(child, followContext) &&
        !(child instanceof Marker) &&
        !(child instanceof BackgroundEntity)
      ) {
        const parentChildrenSizing = childrenSizingOf(parent.layout, followContext);
        const intrinsic = intrinsicSizeOf(
          child,
          ctx,
          followContext,
          parentArea,
          undefined,
          parentArea,
          undefined,
          undefined,
          parentChildrenSizing,
        );
        const transform = child.transform;
        const childContext = child.contextFor(followContext);
        const authoredPosition = transform?.position(childContext) ?? { x: 0, y: 0 };
        const position = transform?.resolvedPosition(childContext, parentArea) ?? authoredPosition;
        const followConfig = child.getComponent<FollowTarget>('followTarget')?.resolveConfig(followContext);
        const hasAbsolutePositionXMapping =
          followConfig?.mappings.some((mapping) => mapping.destination === 'Transform.position.x') === true;
        const hasAbsolutePositionYMapping =
          followConfig?.mappings.some((mapping) => mapping.destination === 'Transform.position.y') === true;
        const width =
          transform?.resolvedAuthoredDimension('x', followContext, parentArea.width) ?? intrinsic.resolved.width;
        const height =
          transform?.resolvedAuthoredDimension('y', followContext, parentArea.height) ?? intrinsic.resolved.height;
        if (child.getComponent<FollowTarget>('followTarget')) {
          const transitionPrefix = `follow:${child.debugSourceId ?? child.id}`;
          transform?.getProp<Vector2>('position')?.setTransitionKey(`${transitionPrefix}:position`);
          transform?.getProp<Vector2>('dimensions')?.setTransitionKey(`${transitionPrefix}:dimensions`);
        }
        child.layoutPosition = position;
        child.box = {
          x: hasAbsolutePositionXMapping ? authoredPosition.x : parentArea.x + position.x,
          y: hasAbsolutePositionYMapping ? authoredPosition.y : parentArea.y + position.y,
          width,
          height,
        };
      }
      walk(child);
    }
  };
  walk(root);
}

/** Bounding box of a list of boxes. The result is null when the list is empty. */
function boundingUnion(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.width));
  const maxY = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function throughCurrentRowBands(row: Row, rctx: ResolveContext): Box[] {
  const flowChildren = row.children.filter((child) => !isAbsolutePositioned(child, rctx) && participatesInFlow(child));
  const currentIndex = flowChildren.findIndex((child) => child instanceof Word && child.state === 'current');
  if (row.state === 'past' || row.state === 'previous') {
    return flowChildren.map((child) => child.box).filter((box): box is Box => !!box);
  }
  if (row.state !== 'current') return [];
  if (currentIndex < 0) return flowChildren.map((child) => child.box).filter((box): box is Box => !!box);
  return flowChildren
    .slice(0, currentIndex + 1)
    .map((child) => child.box)
    .filter((box): box is Box => !!box);
}

function throughCurrentBackgroundBands(
  entity: PhysicalEntity,
  contentChildren: PhysicalEntity[],
  childBoxes: Box[],
  childContentBounds: (Box | null)[],
  rctx: ResolveContext,
): Box[] {
  if (entity instanceof Row) {
    const currentIndex = contentChildren.findIndex((child) => child instanceof Word && child.state === 'current');
    if (entity.state === 'past' || entity.state === 'previous') return childBoxes;
    if (entity.state !== 'current') return [];
    if (currentIndex < 0) {
      return contentChildren
        .map((child) => child.box)
        .filter((box): box is Box => !!box);
    }
    return contentChildren
      .slice(0, currentIndex + 1)
      .map((child) => child.box)
      .filter((box): box is Box => !!box);
  }
  if (entity instanceof Page) {
    return contentChildren.flatMap((child, index) => {
      if (!(child instanceof Row)) return [];
      if (child.state === 'past' || child.state === 'previous') {
        const content = childContentBounds[index];
        return content ? [content] : [];
      }
      if (child.state !== 'current') return [];
      const bounds = boundingUnion(throughCurrentRowBands(child, rctx));
      return bounds ? [bounds] : [];
    });
  }
  return childBoxes;
}

function hasReservedCollapsedContent(entity: PhysicalEntity): boolean {
  return entity.find((candidate) => candidate.flowCollapsed && candidate.flowCollapseMode === 'reserve') !== undefined;
}

/** Resolve BackgroundStyle geometry without letting decorative pixels expand parent content. */
function assignBackgroundBoxes(root: PhysicalEntity, rctx: ResolveContext): void {
  const resolveEntityContent = (entity: PhysicalEntity): Box | null => {
    if (entity instanceof Marker) return null;
    const local = entity.contextFor(rctx);
    const childResults = entity.children.map((child) => ({
      child,
      content: resolveEntityContent(child),
    }));
    const contentChildren = childResults
      .filter(({ child }) => !isAbsolutePositioned(child, rctx))
      .map(({ child }) => child);
    const childContent = childResults
      .filter(({ child }) => !isAbsolutePositioned(child, rctx))
      .map(({ content }) => content)
      .filter((box): box is Box => !!box);
    const childBoxes = contentChildren.map((child) => child.box).filter((box): box is Box => !!box);
    const flowChildBoxes = contentChildren
      .filter((child) => !child.flowCollapsed)
      .map((child) => (child instanceof Row || child instanceof Page ? child.flowBox ?? child.box : child.box))
      .filter((box): box is Box => !!box);
    const contentBounds: Box[] = [...childContent];

    for (let componentIndex = 0; componentIndex < entity.components.length; componentIndex += 1) {
      const component = entity.components[componentIndex];
      if (!(component instanceof BackgroundStyle)) continue;
      component.box = undefined;
      component.rowBoxes = undefined;
      component.debugGeometry = undefined;
      component.setResolvedBounds(undefined);
      component.getProp<Box | null>('bounds')?.setTransitionKey(undefined);
      if (!boolProp(component, 'enabled', local, true)) continue;

      const mode = component.boundsMode(local);
      let bands: Box[];
      if (mode === 'fillSelf') {
        bands = entity.box ? [entity.box] : [];
      } else if (mode === 'tight') {
        bands = contentChildren.length > 0 ? childContent : entity.box ? [entity.box] : [];
      } else {
        bands = childBoxes;
      }
      const coverageMode = component.coverageMode(local);
      if (coverageMode === 'all') {
        if ((entity instanceof Row || entity instanceof Page) && entity.flowBox && hasReservedCollapsedContent(entity)) {
          bands =
            mode === 'tight'
              ? bands
              : mode === 'full' && entity instanceof Page
                ? flowChildBoxes
                : [entity.flowBox];
        } else if (entity instanceof Page && mode === 'full') {
          bands = flowChildBoxes;
        }
      } else if (mode !== 'fillSelf') {
        bands = throughCurrentBackgroundBands(entity, contentChildren, childBoxes, childContent, rctx);
      }

      if (bands.length === 0) continue;

      if (mode === 'full' && contentChildren.length > 0 && contentChildren.every((child) => child instanceof Row)) {
        const union = boundingUnion(bands);
        if (union) bands = bands.map((band) => ({ ...band, x: union.x, width: union.width }));
      }

      const isMultiBand =
        mode !== 'fillSelf' && contentChildren.length > 0 && contentChildren.every((child) => child instanceof Row);
      const bandPadding = layoutInsets(component, 'bandPadding', local);
      const blockPadding = layoutInsets(component, 'blockPadding', local);
      const offset = component.getProp<Vector2>('offset')?.resolve(local) ?? { x: 0, y: 0 };
      const debugSourceBands = isMultiBand
        ? bands
        : (() => {
            const union = boundingUnion(bands);
            return union ? [union] : [];
          })();
      if (debugSourceBands.length === 0) continue;
      const debugGeometry = resolveBackgroundStyleDebugGeometry(debugSourceBands, bandPadding, blockPadding, offset);
      const paintedGeometry = resolveBackgroundStyleDebugGeometry(bands, bandPadding, blockPadding, offset);
      component.debugGeometry = debugGeometry;
      bands = paintedGeometry.paintedBands;
      component.box = boundingUnion(bands) ?? undefined;
      component.setResolvedBounds(component.box);
      component.getProp<Box | null>('bounds')?.setTransitionKey(
        entity instanceof Row && entity.state === 'current'
          ? `backgroundStyle:current:${componentIndex}`
          : undefined,
      );
      if (isMultiBand) {
        component.rowBoxes = bands;
      }
    }

    if (contentChildren.length === 0 && entity.box) contentBounds.push(entity.box);
    if (entity instanceof Row && entity.flowBox && hasReservedCollapsedContent(entity)) {
      return entity.flowBox;
    }
    return boundingUnion(contentBounds);
  };

  resolveEntityContent(root);
}

function finalizeCollapsedRowBox(
  row: Row,
  items: readonly MeasuredFlowItem[],
  rowPadding: Insets,
  horizontalAlignment: HorizontalAlign,
  rowWidthCanShrink: boolean,
  rowHeightCanShrink: boolean,
): void {
  const fullRowBox = row.box;
  const hasCollapsedFlow = row.flowCollapsed || items.some((item) => item.flowCollapsed);
  const hasReservedCollapsedFlow =
    (row.flowCollapsed && row.flowCollapseMode === 'reserve') ||
    items.some((item) => {
      const entity = item.kind === 'word' ? item.word : item.entity;
      return entity.flowCollapsed && entity.flowCollapseMode === 'reserve';
    });
  if (row.flowCollapsed) {
    row.box = null;
    return;
  }
  if (!hasCollapsedFlow || !fullRowBox) return;

  const visibleItems = items.filter((item) => !item.flowCollapsed);
  const visibleBounds = visibleItems
    .map((item) => (item.kind === 'word' ? item.word.box : item.entity.box))
    .filter((box): box is Box => !!box);
  if (visibleBounds.length === 0) {
    if (!hasReservedCollapsedFlow && (rowWidthCanShrink || rowHeightCanShrink)) row.box = null;
    return;
  }

  const visibleLeft = Math.min(...visibleBounds.map((box) => box.x));
  const visibleTop = Math.min(...visibleBounds.map((box) => box.y));
  const visibleRight = Math.max(...visibleBounds.map((box) => box.x + box.width));
  const visibleBottom = Math.max(...visibleBounds.map((box) => box.y + box.height));
  const visualWidth = rowWidthCanShrink
    ? Math.max(1, visibleRight - visibleLeft + rowPadding.left + rowPadding.right)
    : fullRowBox.width;
  const visualHeight = rowHeightCanShrink
    ? Math.max(1, visibleBottom - visibleTop + rowPadding.top + rowPadding.bottom)
    : fullRowBox.height;
  const naturalLeft = rowWidthCanShrink ? visibleLeft - rowPadding.left : fullRowBox.x;
  const alignedLeft =
    hasReservedCollapsedFlow || !rowWidthCanShrink || horizontalAlignment === 'left' || horizontalAlignment === 'stretch'
      ? naturalLeft
      : horizontalAlignment === 'right'
        ? fullRowBox.x + fullRowBox.width - visualWidth
        : fullRowBox.x + (fullRowBox.width - visualWidth) / 2;
  const deltaX = alignedLeft - naturalLeft;
  if (deltaX !== 0) {
    for (const item of visibleItems) {
      const entity = item.kind === 'word' ? item.word : item.entity;
      shiftEntityBoxes(entity, deltaX, 0);
    }
  }

  row.box = {
    x: alignedLeft,
    y: rowHeightCanShrink ? visibleTop - rowPadding.top : fullRowBox.y,
    width: visualWidth,
    height: visualHeight,
  };
}

function layoutMeasuredRowChildren(
  rowEntry: MeasuredRow,
  rctx: ResolveContext,
  textDirection: ResolvedTextDirection,
  horizontalAlignment: HorizontalAlign = 'left',
): void {
  const row = rowEntry.row;
  if (!row.box) return;

  const rightToLeft = rowFlowsRightToLeft(row, rctx, textDirection);
  const rowPadding = row.layout ? layoutInsets(row.layout, 'padding', rctx) : ZERO_LAYOUT_INSETS;
  const rowContentHeight = Math.max(1, row.box.height - rowPadding.top - rowPadding.bottom);
  const rowContentSize = {
    width: Math.max(1, row.box.width - rowPadding.left - rowPadding.right),
    height: rowContentHeight,
  };
  const configuredVerticalAlignment = row.layout?.childrenAlignment(rctx).verticalAlignment;
  const rowVerticalAlignment: SelfLayoutVerticalAlignment | undefined =
    configuredVerticalAlignment === undefined
      ? undefined
      : configuredVerticalAlignment === 'stretch'
        ? 'stretch'
        : normalizeV(configuredVerticalAlignment) === 'middle'
          ? 'center'
          : normalizeV(configuredVerticalAlignment) === 'top'
            ? 'top'
            : 'bottom';
  const itemsToPlace: MeasuredFlowItem[] =
    rowEntry.flowItems ??
    rowEntry.words.map((word) => ({
      kind: 'word' as const,
      word: word.word,
      width: word.width,
      height: word.height,
      boxWidth: word.boxWidth,
      boxHeight: word.boxHeight,
      verticalAlignment: word.verticalAlignment,
      baselineOffset: word.baselineOffset,
      flowCollapsed: word.flowCollapsed,
    }));

  const rowWindow = activeChildWindow(row, 'row', itemsToPlace.length, rctx);
  const selfSingleItemAlignment =
    itemsToPlace.length === 1 && itemsToPlace[0].kind === 'word'
      ? selfSingleItemAlignmentOf(itemsToPlace[0].word, rctx)
      : undefined;
  const singleItemAlignment = selfSingleItemAlignment ?? singleItemAlignmentOf(row.layout, rctx, 'horizontal');
  const selfSingleItemVerticalAlignment =
    itemsToPlace.length === 1 && !rowWindow && itemsToPlace[0].kind === 'word'
      ? selfSingleItemAlignmentOf(itemsToPlace[0].word, rctx, 'vertical')
      : undefined;
  const singleItemVerticalAlignmentValue =
    selfSingleItemVerticalAlignment ?? singleItemAlignmentOf(row.layout, rctx, 'vertical');
  const resolvedRowVerticalAlignment =
    rowVerticalAlignment === 'stretch'
      ? singleItemVerticalAlignment(
          rowVerticalAlignment,
          rowWindow === undefined ? itemsToPlace.length : 0,
          singleItemVerticalAlignmentValue,
        )
      : rowVerticalAlignment;
  const singleItemJustify =
    !rowWindow &&
    itemsToPlace.length === 1 &&
    singleItemAlignment === 'justify' &&
    (horizontalAlignment === 'stretch' || selfSingleItemAlignment !== undefined);
  if (singleItemJustify && itemsToPlace[0].kind === 'word') {
    itemsToPlace[0].width = justifiedSingleWordWidth(
      itemsToPlace[0].word,
      itemsToPlace[0].width,
      rowContentSize.width,
      rctx,
    );
    const scaleX = scaleAxis(itemsToPlace[0].word.transform?.scale(rctx).x);
    if (scaleX > 0) itemsToPlace[0].boxWidth = itemsToPlace[0].width / scaleX;
  }
  const itemSpacing =
    !rowWindow && horizontalAlignment === 'stretch' && itemsToPlace.length > 1
      ? rowEntry.spacing +
        Math.max(0, rowContentSize.width - rowEntry.contentWidth) / (itemsToPlace.length - 1)
      : rowEntry.spacing;
  const distributedContentWidth =
    itemsToPlace.reduce((sum, item) => sum + item.width, 0) + itemSpacing * Math.max(0, itemsToPlace.length - 1);
  const contentAlignment =
    selfSingleItemAlignment !== undefined
      ? selfSingleItemAlignment === 'justify'
        ? 'stretch'
        : resolveHorizontalAlign(selfSingleItemAlignment, textDirection)
      : singleItemHorizontalAlignment(horizontalAlignment, itemsToPlace.length, singleItemAlignment, textDirection);
  const contentLeft = rowWindow
    ? anchoredOverflowStart(
        rowEntry.contentWidth,
        row.box.x + rowPadding.left,
        rowContentSize.width,
        rightToLeft ? reverseWindowAnchor(rowWindow.anchor) : rowWindow.anchor,
      )
    : alignedContentLeft(
        row.box,
        rowPadding,
        singleItemJustify ? distributedContentWidth : rowEntry.contentWidth,
        contentAlignment,
      );
  let cursorX = rightToLeft ? contentLeft + distributedContentWidth : contentLeft;

  for (const item of itemsToPlace) {
    const itemSelfSingleItemVerticalAlignment =
      item.kind === 'word' ? selfSingleItemAlignmentOf(item.word, rctx, 'vertical') : undefined;
    let resolvedVerticalAlignment =
      itemSelfSingleItemVerticalAlignment !== undefined
        ? item.verticalAlignment
        : rowVerticalAlignment === 'stretch' && !rowWindow && itemsToPlace.length === 1
          ? resolvedRowVerticalAlignment
          : item.verticalAlignment === 'auto' && resolvedRowVerticalAlignment !== undefined
        ? resolvedRowVerticalAlignment
        : item.verticalAlignment;
    if (itemSelfSingleItemVerticalAlignment !== undefined && resolvedVerticalAlignment === 'stretch') {
      resolvedVerticalAlignment = singleItemVerticalAlignment(
        resolvedVerticalAlignment,
        1,
        itemSelfSingleItemVerticalAlignment,
      );
    }
    const itemHeight = resolvedVerticalAlignment === 'stretch' ? rowContentHeight : item.height;
    const remainingHeight = Math.max(0, rowContentHeight - itemHeight);
    const rowY = row.box.y + rowPadding.top;
    let positionedVerticalAlignment = resolvedVerticalAlignment;
    if (positionedVerticalAlignment === 'auto' && item.kind === 'word') {
      const hasAuthoredHeight = item.word!.transform?.authoredDimension('y', rctx) !== undefined;
      if (!hasAuthoredHeight) positionedVerticalAlignment = 'center';
    } else if (positionedVerticalAlignment === 'auto') {
      positionedVerticalAlignment = 'center';
    }

    const itemY =
      positionedVerticalAlignment === 'center' || positionedVerticalAlignment === 'middle'
        ? rowY + remainingHeight / 2
        : positionedVerticalAlignment === 'bottom'
          ? rowY + remainingHeight
          : rowY;
    const boxWidth =
      item.kind === 'word'
        ? item.boxWidth
        : item.width;
    const scaleY = item.kind === 'word' ? scaleAxis(item.word.transform?.scale(rctx).y) : 1;
    const boxHeight =
      item.kind === 'word'
        ? resolvedVerticalAlignment === 'stretch' && scaleY > 0
          ? itemHeight / scaleY
          : item.boxHeight
        : itemHeight;
    const entityPosition =
      item.kind === 'word'
        ? resolvedPositionOf(item.word!, rctx, rowContentSize)
        : resolvedPositionOf(item.entity!, rctx, rowContentSize);

    if (rightToLeft) cursorX -= item.width;
    if (item.kind === 'word') {
      item.word!.textBaselineOffset = item.baselineOffset ?? null;
      item.word!.textVerticalScale =
        resolvedVerticalAlignment === 'stretch' && item.height > 0 ? Math.max(0.001, itemHeight / item.height) : 1;
      item.word!.layoutPosition = entityPosition;
      item.word!.box =
        row.flowCollapsed || item.flowCollapsed
          ? null
          : {
              x: cursorX + entityPosition.x - visualStartOffsetFor(item.word, boxWidth, rctx),
              y: itemY + entityPosition.y - visualTopOffsetFor(item.word, boxHeight, rctx),
              width: boxWidth,
              height: boxHeight,
            };
    } else {
      item.entity!.layoutPosition = entityPosition;
      item.entity!.box = row.flowCollapsed
        ? null
        : {
            x: cursorX + entityPosition.x,
            y: itemY + entityPosition.y,
            width: item.width,
            height: itemHeight,
          };
    }

    cursorX += rightToLeft ? -itemSpacing : item.width + itemSpacing;
  }

  const rowWidthMode = row.transform?.widthMode(rctx) ?? 'custom';
  const rowHeightMode = row.transform?.heightMode(rctx) ?? 'custom';
  const rowWidthCanShrink =
    rowWidthMode !== 'fitParent' &&
    !(rowWidthMode === 'custom' && row.transform?.authoredDimension('x', rctx) !== undefined);
  const rowHeightCanShrink =
    rowHeightMode !== 'fitParent' &&
    !(rowHeightMode === 'custom' && row.transform?.authoredDimension('y', rctx) !== undefined);
  finalizeCollapsedRowBox(
    row,
    itemsToPlace,
    rowPadding,
    horizontalAlignment,
    rowWidthCanShrink,
    rowHeightCanShrink,
  );
}

/**
 * The viewport (its own Layout-derived rect within the raw frame), the
 * composition area nested inside it (resolved against the viewport's content
 * rect), its page(s), each row, and each word. Rows/pages are aligned inside
 * the area's padded content rect using the caller-supplied alignment (the
 * pipeline passes the page's own alignment). An individual row with its own
 * explicit Layout overrides that shared alignment for only its own words.
 *
 * Accepts a bare `CompositionArea` too (skipping the Viewport level entirely,
 * `frame` becomes its own resolution frame directly) - every real preset goes
 * through `buildEcsTree`, which always yields a `Viewport`, but unit tests
 * exercise this function against a hand-built `CompositionArea` tree with no
 * wrapper, and that must keep behaving exactly as before.
 */
export function layoutScene(
  root: Viewport | CompositionArea,
  ctx: CanvasContext2D,
  rctx: ResolveContext,
  options: LayoutOptions,
): void {
  if (options.textDirection && options.textDirection !== rctx.textDirection) {
    rctx = { ...rctx, textDirection: options.textDirection };
  }
  if (options.rowFontFit) {
    rctx = { ...rctx, rowFontFit: options.rowFontFit };
  }
  rctx = resolveLayoutContext(root, rctx, options.spacingContext);
  root.traverse((entity) => {
    if (entity instanceof Word) {
      entity.textBaselineOffset = null;
      entity.textLetterSpacing = null;
      entity.textVerticalScale = 1;
    }
    if (entity instanceof Row) {
      entity.parentLayoutManagedWidth = false;
      entity.parentLayoutManagedHeight = false;
      entity.parentLayoutScaleX = 1;
      entity.parentLayoutScaleY = 1;
    }
    if (entity.flowCollapsed && entity.flowCollapseMode === 'reflow') {
      entity.box = null;
      entity.flowBox = null;
      entity.layoutPosition = null;
    }
  });
  const textDirection = options.textDirection ?? rctx.textDirection;
  const frame: Box = { x: options.x ?? 0, y: options.y ?? 0, width: options.width, height: options.height };
  // Alignment from `options` is the caller's requested default. Under
  // the "parent aligns children" model it stands in for a missing Layout on the
  // relevant parent entity (used by unit tests that pass alignment directly).
  const fallbackAlign: Alignment = {
    horizontal: resolveHorizontalAlign(options.horizontalAlign ?? 'center', textDirection),
    vertical: options.verticalAlign ?? 'middle',
  };

  let compositionArea: CompositionArea | undefined;
  let compositionFrame = frame;
  let viewportAlign: Alignment | undefined;
  let viewportContent: Box | undefined;
  let viewportMode: LayoutMode = 'overlay';
  if (root instanceof Viewport) {
    const viewportIntrinsic = intrinsicSizeOf(
      root,
      ctx,
      rctx,
      frame,
      options.wordSpacing,
      frame,
      options.rowSpacing,
      options.flowImageMeasurements,
      'constrained',
      options.rowSpacingExtras,
    );
    const { area: viewportArea, content: resolvedViewportContent } = resolveAreaBox(
      root,
      frame,
      rctx,
      undefined,
      viewportIntrinsic,
      undefined,
      'constrained',
    );
    root.box = viewportArea;
    // The Viewport's own alignment positions the CompositionArea (its child).
    viewportAlign = alignOf(root.layout, rctx, fallbackAlign);
    viewportMode = layoutModeOf(root.layout, rctx);
    viewportContent = resolvedViewportContent;
    compositionFrame = resolvedViewportContent;
    compositionArea = root.compositionArea;
  } else {
    compositionArea = root;
  }
  if (!compositionArea) return;

  let content: Box;
  if (root instanceof Viewport && (viewportMode === 'row' || viewportMode === 'column')) {
    const viewportChildren = root.children;
    const viewportFitParentArea = root.layout ? viewportContent ?? compositionFrame : root.box ?? compositionFrame;
    resolveFlowChildren(
      root,
      viewportChildren,
      compositionFrame,
      ctx,
      rctx,
      viewportMode,
      viewportAlign ?? fallbackAlign,
      viewportFitParentArea,
      options.rowSpacing,
      options.flowImageMeasurements,
    );
    const videoArea = root.videoArea;
    if (videoArea) resolveVideoAreaChild(videoArea, ctx, rctx, viewportAlign ?? fallbackAlign);
    if (!compositionArea.box) return;
    content = contentBoxFromArea(compositionArea.box, compositionArea.layout, rctx);
  } else {
    // The CompositionArea is positioned within its parent (viewport content) by
    // the VIEWPORT's alignment. Its dimensions set its size.
    const parentArea = root instanceof Viewport ? root.box ?? compositionFrame : compositionFrame;
    const compositionIntrinsic = intrinsicSizeOf(
      compositionArea,
      ctx,
      rctx,
      compositionFrame,
      options.wordSpacing,
      parentArea,
      options.rowSpacing,
      options.flowImageMeasurements,
      'constrained',
      options.rowSpacingExtras,
    );
    const { area, content: resolvedContent } = resolveAreaBox(
      compositionArea,
      compositionFrame,
      rctx,
      viewportAlign,
      compositionIntrinsic,
      parentArea,
      root instanceof Viewport ? childrenSizingOf(root.layout, rctx) : 'constrained',
    );
    compositionArea.box = area;
    content = resolvedContent;

    if (root instanceof Viewport) {
      const videoArea = root.videoArea;
      if (videoArea) {
        const videoFrame = viewportContent ?? compositionFrame;
        const videoAreaIntrinsic = intrinsicSizeOf(
          videoArea,
          ctx,
          rctx,
          videoFrame,
          options.wordSpacing,
          parentArea,
          options.rowSpacing,
          undefined,
          'constrained',
          options.rowSpacingExtras,
        );
        const { area: videoAreaBox } = resolveAreaBox(
          videoArea,
          videoFrame,
          rctx,
          viewportAlign,
          videoAreaIntrinsic,
          parentArea,
          childrenSizingOf(root.layout, rctx),
        );
        videoArea.box = videoAreaBox;
        resolveVideoAreaChild(videoArea, ctx, rctx, viewportAlign ?? fallbackAlign);
      }
    }
  }

  // The CompositionArea's OWN alignment positions the page block (its children).
  const compositionAlign = alignOf(compositionArea.layout, rctx, viewportAlign ?? fallbackAlign);
  const pageFitParentContent = compositionArea.layout ? content : compositionArea.box ?? content;

  for (const page of compositionArea.children) {
    if (!(page instanceof Page)) continue;
    const pageIntrinsic = intrinsicSizeOf(
      page,
      ctx,
      rctx,
      content,
      options.wordSpacing,
      pageFitParentContent,
      options.rowSpacing,
      options.flowImageMeasurements,
      childrenSizingOf(compositionArea.layout, rctx),
      options.rowSpacingExtras,
    );
    const { area: pageBox } = resolveAreaBox(
      page,
      content,
      rctx,
      compositionAlign,
      pageIntrinsic,
      pageFitParentContent,
      childrenSizingOf(compositionArea.layout, rctx),
    );
    page.box = pageBox;
    page.flowBox = pageBox;
    const pageContent = contentBoxFromArea(pageBox, page.layout, rctx);

    const flowChildren = page.children.filter(
      (child): child is Row | ImageFlowEntity =>
        (child instanceof Row && !isAbsolutePositioned(child, rctx) && participatesInFlow(child)) ||
        (child instanceof ImageFlowEntity && !isAbsolutePositioned(child, rctx) && participatesInFlow(child)),
    );
    const measured = measuredPageFlowChildren(
      page,
      flowChildren,
      ctx,
      rctx,
      options.wordSpacing,
      pageContent,
      page.layout ? pageContent : page.box ?? pageContent,
      {
        width: page.transform?.widthMode(rctx) === 'fitChildren',
        height: page.transform?.heightMode(rctx) === 'fitChildren',
      },
      options.flowImageMeasurements,
    );

    // Use the Page's spacer before any legacy row-spacing fallback.
    const pageMode = layoutModeOf(page.layout, rctx);
    const pageFlowMode = pageMode === 'row' ? 'row' : 'column';
    const pageWindow = activeChildWindow(page, pageFlowMode, measured.length, rctx);
    const rowGaps = rowGapsForFlowItems(
      page,
      rctx,
      pageContent.height,
      measured,
      options.rowSpacing,
      options.rowSpacingExtras,
      options.allowFlowOverflow || !!pageWindow,
    );

    const naturalBlockHeight =
      measured.reduce((sum, child) => sum + (child.kind === 'row' ? child.row.height : child.height), 0) +
      rowGaps.reduce((sum, gap) => sum + gap, 0);
    const blockWidth = measured.reduce((max, child) => Math.max(max, child.kind === 'row' ? child.row.width : child.width), 0);
    const pageAlign = alignOf(page.layout, rctx, compositionAlign);
    const backgroundInsets = contentBackgroundInsets(page, rctx);
    const rowPlacementContent = {
      x: pageContent.x + backgroundInsets.left,
      y: pageContent.y + backgroundInsets.top,
      width: Math.max(1, pageContent.width - backgroundInsets.left - backgroundInsets.right),
      height: Math.max(1, pageContent.height - backgroundInsets.top - backgroundInsets.bottom),
    };
    const pageHorizontalSingleItemAlignment = singleItemAlignmentOf(page.layout, rctx, 'horizontal');
    const pageVerticalSingleItemAlignment = singleItemAlignmentOf(page.layout, rctx, 'vertical');
    if (pageMode === 'row') {
      const flowLayoutItems = pageFlowLayoutItems(
        page,
        measured,
        rctx,
        pageContent.height,
        options.rowSpacing,
        options.rowSpacingExtras,
        options.allowFlowOverflow,
      );
      const pageHorizontalWindow = activeChildWindow(page, pageFlowMode, flowLayoutItems.length, rctx);
      const pageHorizontalAlignment = singleItemHorizontalAlignment(
        pageAlign.horizontal,
        pageHorizontalWindow === undefined ? flowLayoutItems.length : 0,
        pageHorizontalSingleItemAlignment,
        textDirection,
      );
      const horizontalGap = constrainedHorizontalGap(
        page,
        rctx,
        rowPlacementContent.width,
        flowLayoutItems.map((child) => (child.kind === 'row' ? child.row.width : child.width)),
        options.allowFlowOverflow || !!pageHorizontalWindow,
      );
      const naturalBlockWidth =
        flowLayoutItems.reduce((sum, child) => sum + (child.kind === 'row' ? child.row.width : child.width), 0) +
        horizontalGap * Math.max(0, flowLayoutItems.length - 1);
      const stretchedHorizontalGap =
        pageAlign.horizontal === 'stretch' && !pageHorizontalWindow && flowLayoutItems.length > 1
          ? horizontalGap +
            Math.max(0, rowPlacementContent.width - naturalBlockWidth) / (flowLayoutItems.length - 1)
          : horizontalGap;
      const blockWidth = flowLayoutItems.reduce(
        (sum, child) => sum + (child.kind === 'row' ? child.row.width : child.width),
        0,
      ) + stretchedHorizontalGap * Math.max(0, flowLayoutItems.length - 1);
      const blockLeft = pageHorizontalWindow
        ? anchoredOverflowStart(
            blockWidth,
            rowPlacementContent.x,
            rowPlacementContent.width,
            textDirection === 'rtl'
              ? reverseWindowAnchor(pageHorizontalWindow.anchor)
              : pageHorizontalWindow.anchor,
          )
        : rowLeft(blockWidth, rowPlacementContent.x, rowPlacementContent.width, pageHorizontalAlignment);
      const orderedMeasured = textDirection === 'rtl' ? [...flowLayoutItems].reverse() : flowLayoutItems;
      let cursorX = textDirection === 'rtl' ? blockLeft + blockWidth : blockLeft;

      for (const [entryIndex, entry] of orderedMeasured.entries()) {
        const entryWidth = entry.kind === 'row' ? entry.row.width : entry.width;
        const entryHeight = entry.kind === 'row' ? entry.row.height : entry.height;
        if (textDirection === 'rtl') cursorX -= entryWidth;
        if (entry.kind === 'state-stack') {
          const remainingHeight = Math.max(0, rowPlacementContent.height - entryHeight);
          const stackY =
            pageAlign.vertical === 'middle'
              ? rowPlacementContent.y + remainingHeight / 2
              : pageAlign.vertical === 'bottom'
                ? rowPlacementContent.y + remainingHeight
                : rowPlacementContent.y;
          const stackBottomToTop = pageFlowsBottomToTop(page, rctx);
          let stackCursorY = stackBottomToTop ? stackY + entry.height : stackY;
          for (const [rowIndex, rowEntry] of entry.rows.entries()) {
            if (stackBottomToTop) stackCursorY -= rowEntry.height;
            const rowLayout = rowEntry.row.layout;
            const rowHRaw = rowLayout?.childrenAlignment(rctx).horizontalAlignment;
            const rowHAlign = rowHRaw == null ? pageAlign.horizontal : resolveHorizontalAlign(rowHRaw, rctx.textDirection);
            const left = rowLeft(rowEntry.width, cursorX, entry.width, rowHAlign);
            const rowPosition = resolvedPositionOf(rowEntry.row, rctx, pageContent);
            rowEntry.row.layoutPosition = rowPosition;
            rowEntry.row.box = {
              x: left + rowPosition.x,
              y: stackCursorY + rowPosition.y,
              width: rowEntry.width,
              height: rowEntry.height,
            } satisfies Box;
            rowEntry.row.flowBox = rowEntry.row.box;
            layoutMeasuredRowChildren(rowEntry, rctx, textDirection, rowHAlign);
            const gapAfter = rowIndex < entry.gaps.length ? entry.gaps[rowIndex] : 0;
            stackCursorY += stackBottomToTop ? -gapAfter : rowEntry.height + gapAfter;
          }
          const gapAfter = entryIndex < orderedMeasured.length - 1 ? stretchedHorizontalGap : 0;
          cursorX += textDirection === 'rtl' ? -gapAfter : entryWidth + gapAfter;
          continue;
        }

        const child = entry.kind === 'row' ? entry.row.row : entry.entity;
        const crossAlignment = singleItemVerticalAlignment(
          childCrossAlign(child, 'row', rctx, pageAlign),
          pageHorizontalWindow === undefined ? flowLayoutItems.length : 0,
          selfSingleItemAlignmentOf(child, rctx, 'vertical') ?? pageVerticalSingleItemAlignment,
        );
        const singleItemVerticalStretch =
          !pageHorizontalWindow &&
          flowLayoutItems.length === 1 &&
          pageAlign.vertical === 'stretch' &&
          pageVerticalSingleItemAlignment === 'justify';
        const childHeight = singleItemVerticalStretch || crossAlignment === 'stretch' ? rowPlacementContent.height : entryHeight;
        const remainingHeight = Math.max(0, rowPlacementContent.height - childHeight);
        const childY =
          crossAlignment === 'middle'
            ? rowPlacementContent.y + remainingHeight / 2
            : crossAlignment === 'bottom'
              ? rowPlacementContent.y + remainingHeight
              : rowPlacementContent.y;
        const childPosition = resolvedPositionOf(child, rctx, pageContent);
        const singleItemHorizontalStretch =
          !pageHorizontalWindow &&
          flowLayoutItems.length === 1 &&
          pageAlign.horizontal === 'stretch' &&
          pageHorizontalSingleItemAlignment === 'justify';
        const childWidth = singleItemHorizontalStretch ? rowPlacementContent.width : entryWidth;

        child.layoutPosition = childPosition;
        child.box = {
          x: cursorX + childPosition.x,
          y: childY + childPosition.y,
          width: childWidth,
          height: childHeight,
        };
        if (entry.kind === 'row') {
          entry.row.row.parentLayoutManagedWidth = singleItemHorizontalStretch;
          entry.row.row.parentLayoutManagedHeight = singleItemVerticalStretch;
          entry.row.row.parentLayoutScaleX =
            singleItemHorizontalStretch && entryWidth > 0 ? childWidth / entryWidth : 1;
          entry.row.row.parentLayoutScaleY = singleItemVerticalStretch && entryHeight > 0 ? childHeight / entryHeight : 1;
          entry.row.row.flowBox = entry.row.row.box;
          const rowLayout = entry.row.row.layout;
          const rowHRaw = rowLayout?.childrenAlignment(rctx).horizontalAlignment;
          const rowHAlign = rowHRaw == null ? pageAlign.horizontal : resolveHorizontalAlign(rowHRaw, rctx.textDirection);
          layoutMeasuredRowChildren(entry.row, rctx, textDirection, rowHAlign);
        }
        const gapAfter = entryIndex < orderedMeasured.length - 1 ? stretchedHorizontalGap : 0;
        cursorX += textDirection === 'rtl' ? -gapAfter : entryWidth + gapAfter;
      }
      continue;
    }
    // Place the row block within the Page's own content box. The Page itself
    // was already positioned by the CompositionArea's alignment above.
    const pageVerticalWindow = activeChildWindow(page, pageFlowMode, measured.length, rctx);
    const stretchGap =
      pageAlign.vertical === 'stretch' && !pageVerticalWindow && measured.length > 1
        ? Math.max(0, rowPlacementContent.height - naturalBlockHeight) / (measured.length - 1)
        : 0;
    const columnGaps = rowGaps.map((gap) => gap + stretchGap);
    const blockHeight =
      measured.reduce((sum, child) => sum + (child.kind === 'row' ? child.row.height : child.height), 0) +
      columnGaps.reduce((sum, gap) => sum + gap, 0);
    const pageVerticalAlignment = singleItemVerticalAlignment(
      pageAlign.vertical,
      pageVerticalWindow === undefined ? measured.length : 0,
      pageVerticalSingleItemAlignment,
    );
    const pageHorizontalAlignment = singleItemHorizontalAlignment(
      pageAlign.horizontal,
      pageVerticalWindow === undefined ? measured.length : 0,
      pageHorizontalSingleItemAlignment,
      textDirection,
    );
    const blockLeft =
      pageHorizontalAlignment === 'stretch'
        ? rowPlacementContent.x
        : rowLeft(blockWidth, rowPlacementContent.x, rowPlacementContent.width, pageHorizontalAlignment);
    const bottomToTop = pageFlowsBottomToTop(page, rctx);
    let cursorY = pageVerticalWindow
      ? anchoredOverflowStart(
          blockHeight,
          rowPlacementContent.y,
          rowPlacementContent.height,
          bottomToTop ? reverseWindowAnchor(pageVerticalWindow.anchor) : pageVerticalWindow.anchor,
        )
      : blockTop(blockHeight, rowPlacementContent.y, rowPlacementContent.height, pageVerticalAlignment);
    if (bottomToTop) cursorY += blockHeight;

    for (const [entryIndex, entry] of measured.entries()) {
      const entryHeight = entry.kind === 'row' ? entry.row.height : entry.height;
      if (bottomToTop) cursorY -= entryHeight;
      if (entry.kind === 'image') {
        const imagePosition = resolvedPositionOf(entry.entity, rctx, pageContent);
        const crossAlignment =
          pageHorizontalAlignment === 'stretch' ? 'stretch' : childCrossAlign(entry.entity, 'column', rctx, pageAlign);
        const childWidth = crossAlignment === 'stretch' ? rowPlacementContent.width : entry.width;
        const left =
          crossAlignment === 'stretch'
            ? rowPlacementContent.x
            : rowLeft(entry.width, blockLeft, blockWidth, crossAlignment);
        entry.entity.layoutPosition = imagePosition;
        entry.entity.box = {
          x: left + imagePosition.x,
          y: cursorY + imagePosition.y,
          width: childWidth,
          height: entry.height,
        } satisfies Box;
        const gapAfter = entryIndex < columnGaps.length ? columnGaps[entryIndex] : 0;
        cursorY += bottomToTop ? -gapAfter : entryHeight + gapAfter;
        continue;
      }

      const rowEntry = entry.row;
      const rowLayout = rowEntry.row.layout;
      const rowHRaw = rowLayout?.childrenAlignment(rctx).horizontalAlignment;
      const rowHAlign = rowHRaw == null ? pageAlign.horizontal : resolveHorizontalAlign(rowHRaw, rctx.textDirection);
      const crossAlignment =
        pageHorizontalAlignment === 'stretch'
          ? 'stretch'
          : childCrossAlign(rowEntry.row, 'column', rctx, pageAlign);
      const childWidth = crossAlignment === 'stretch' ? rowPlacementContent.width : rowEntry.width;
      const singleItemVerticalStretch =
        !pageVerticalWindow &&
        measured.length === 1 &&
        pageVerticalAlignment === 'stretch' &&
        pageVerticalSingleItemAlignment === 'justify';
      const childHeight = singleItemVerticalStretch ? rowPlacementContent.height : rowEntry.height;
      const left =
        crossAlignment === 'stretch'
          ? rowPlacementContent.x
          : rowLeft(rowEntry.width, blockLeft, blockWidth, crossAlignment);
      const rowPosition = resolvedPositionOf(rowEntry.row, rctx, pageContent);
      rowEntry.row.layoutPosition = rowPosition;
      rowEntry.row.box = {
        x: left + rowPosition.x,
        y: cursorY + rowPosition.y,
        width: childWidth,
        height: childHeight,
      } satisfies Box;
      const singleItemHorizontalStretch =
        !pageVerticalWindow &&
        measured.length === 1 &&
        pageHorizontalAlignment === 'stretch' &&
        pageHorizontalSingleItemAlignment === 'justify';
      rowEntry.row.parentLayoutManagedWidth = singleItemHorizontalStretch;
      rowEntry.row.parentLayoutManagedHeight = singleItemVerticalStretch;
      rowEntry.row.parentLayoutScaleX = singleItemHorizontalStretch && rowEntry.width > 0 ? childWidth / rowEntry.width : 1;
      rowEntry.row.parentLayoutScaleY = singleItemVerticalStretch && rowEntry.height > 0 ? childHeight / rowEntry.height : 1;
      rowEntry.row.flowBox = rowEntry.row.box;
      layoutMeasuredRowChildren(rowEntry, rctx, textDirection, rowHAlign);
      const gapAfter = entryIndex < columnGaps.length ? columnGaps[entryIndex] : 0;
      cursorY += bottomToTop ? -gapAfter : entryHeight + gapAfter;
    }

    const visibleRowBoxes = measured
      .filter((entry): entry is { kind: 'row'; row: MeasuredRow } => entry.kind === 'row')
      .map((entry) => entry.row.row.box)
      .filter((box): box is Box => !!box);
    const pageWidthMode = page.transform?.widthMode(rctx) ?? 'custom';
    const pageHeightMode = page.transform?.heightMode(rctx) ?? 'custom';
    const pageWidthCanShrink =
      pageWidthMode !== 'fitParent' &&
      !(pageWidthMode === 'custom' && page.transform?.authoredDimension('x', rctx) !== undefined);
    const pageHeightCanShrink =
      pageHeightMode !== 'fitParent' &&
      !(pageHeightMode === 'custom' && page.transform?.authoredDimension('y', rctx) !== undefined);
    const pageVisibleBounds = visibleRowBoxes.length > 0 ? boundingUnion(visibleRowBoxes) : null;
    const hasCollapsedFlow = measured.some(
      (entry) => entry.kind === 'row' && (entry.row.row.flowCollapsed || entry.row.words.some((word) => word.flowCollapsed)),
    );
    const windowControlsWidth = pageWindow?.axis === 'horizontal';
    const windowControlsHeight = pageWindow?.axis === 'vertical';
    if (hasCollapsedFlow && pageVisibleBounds && page.box && (pageWidthCanShrink || pageHeightCanShrink)) {
      const pagePadding = page.layout ? layoutInsets(page.layout, 'padding', rctx) : ZERO_LAYOUT_INSETS;
      const fullPageBox = page.box;
      const visualLeft = pageVisibleBounds.x - pagePadding.left;
      const visualTop = pageVisibleBounds.y - pagePadding.top;
      const visualRight = pageVisibleBounds.x + pageVisibleBounds.width + pagePadding.right;
      const visualBottom = pageVisibleBounds.y + pageVisibleBounds.height + pagePadding.bottom;
      page.box = {
        x: pageWidthCanShrink && !windowControlsWidth ? visualLeft : fullPageBox.x,
        y: pageHeightCanShrink && !windowControlsHeight ? visualTop : fullPageBox.y,
        width: pageWidthCanShrink && !windowControlsWidth ? Math.max(1, visualRight - visualLeft) : fullPageBox.width,
        height: pageHeightCanShrink && !windowControlsHeight ? Math.max(1, visualBottom - visualTop) : fullPageBox.height,
      };
    } else if (hasCollapsedFlow && !pageVisibleBounds && (pageWidthCanShrink || pageHeightCanShrink)) {
      page.box = null;
    }

  }

  if (options.stableLayout) applyLayoutSnapshot(root, options.stableLayout, rctx);
  repairRowFlowBounds(root, rctx);
  repairPageFlowBounds(root, rctx);
  resolveAbsoluteEntityBoxes(root, ctx, rctx);
  clampRandomizedPositionBoxes(root, rctx);
  resolveMarkerBoxes(root, rctx);
  resolveBackgroundEntityBoxes(root, rctx);
  assignBackgroundBoxes(root, rctx);
}

function shiftEntityBoxes(entity: PhysicalEntity, deltaX: number, deltaY: number): void {
  if (entity.box) {
    entity.box = { ...entity.box, x: entity.box.x + deltaX, y: entity.box.y + deltaY };
  }
  if (entity.flowBox) {
    entity.flowBox = { ...entity.flowBox, x: entity.flowBox.x + deltaX, y: entity.flowBox.y + deltaY };
  }
  for (const child of entity.children) shiftEntityBoxes(child, deltaX, deltaY);
}

function clampRandomizedPositionBoxes(root: PhysicalEntity, rctx: ResolveContext): void {
  const clampChildren = (parent: PhysicalEntity): void => {
    const parentBox = parent.box ? contentBoxFromArea(parent.box, parent.layout, rctx) : undefined;
    for (const child of parent.children) {
      const allowsOverflow = childrenSizingOf(parent.layout, rctx) === 'allowOverflow';
      if (parentBox && child.box && !allowsOverflow && child.transform?.keepsPositionWithinParentBounds()) {
        const maxX = Math.max(parentBox.x, parentBox.x + parentBox.width - child.box.width);
        const maxY = Math.max(parentBox.y, parentBox.y + parentBox.height - child.box.height);
        const remappedX = remappedRandomizedPosition(child, 'x', parentBox, rctx);
        const remappedY = remappedRandomizedPosition(child, 'y', parentBox, rctx);
        const targetX = remappedX ?? Math.min(maxX, Math.max(parentBox.x, child.box.x));
        const targetY = remappedY ?? Math.min(maxY, Math.max(parentBox.y, child.box.y));
        shiftEntityBoxes(child, targetX - child.box.x, targetY - child.box.y);
      }
      clampChildren(child);
    }
  };

  clampChildren(root);
}

/**
 * Move independent Page trees into one vertical stack after their normal
 * layout pass. Each page keeps its own Row > Word structure and styling.
 */
export function stackPagesVertically(
  root: Viewport | CompositionArea,
  rctx: ResolveContext,
  gap = 0,
): void {
  const compositionArea = root instanceof Viewport ? root.compositionArea : root;
  if (!compositionArea?.box) return;

  const pages = compositionArea.children.filter(
    (child): child is Page => child instanceof Page && child.box !== null,
  );
  if (pages.length < 2) return;

  const content = contentBoxFromArea(compositionArea.box, compositionArea.layout, rctx);
  const spacing = Math.max(0, gap);
  const totalHeight =
    pages.reduce((sum, page) => sum + (page.box?.height ?? 0), 0) + spacing * Math.max(0, pages.length - 1);
  const areaAlignment = alignOf(compositionArea.layout, rctx, { horizontal: 'center', vertical: 'middle' });
  const verticalAlignment = totalHeight <= content.height ? areaAlignment.vertical : 'top';
  let cursorY = blockTop(totalHeight, content.y, content.height, verticalAlignment);

  for (const page of pages) {
    const pageBox = page.box;
    if (!pageBox) continue;
    shiftEntityBoxes(page, 0, cursorY - pageBox.y);
    cursorY += pageBox.height + spacing;
  }

  clampRandomizedPositionBoxes(root, rctx);
  resolveMarkerBoxes(root, rctx);
  resolveBackgroundEntityBoxes(root, rctx);
  assignBackgroundBoxes(root, rctx);
}

/** Recompute geometry that follows moved rows or words. */
export function refreshDependentGeometry(root: PhysicalEntity, rctx: ResolveContext): void {
  resolveMarkerBoxes(root, rctx);
  resolveBackgroundEntityBoxes(root, rctx);
  assignBackgroundBoxes(root, rctx);
}
