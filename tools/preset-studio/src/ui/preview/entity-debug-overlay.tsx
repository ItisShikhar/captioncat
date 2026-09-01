import type { CaptionDebugBox, CaptionDebugLayout, CaptionDebugQuad } from '@captioncat/caption-engine/browser';
import { debugLayer } from '../constants';
import {
  DEBUG_ENTITY_COLORS,
  type PaddingPreviewValue,
  type DebugOverlayEntry,
  type DebugEntityKind,
} from './entity-debug';

interface EntityDebugLayerProps {
  entry: DebugOverlayEntry;
  /** Raster size of the preview canvas and the SVG's `viewBox`. */
  renderResolution: { width: number; height: number };
  /** Current CSS display size of this preview surface. */
  displaySize: { width: number; height: number };
  /** Top-left pixel position (in `renderResolution` space) where the engine's rendered caption frame is composited - see `computeOverlayPosition`. */
  overlayX: number;
  overlayY: number;
  /** The caption frame's own size - fallback for the Composition Area box when `debugLayout` is not available (e.g. no caption timestamps). */
  frameSize?: { width: number; height: number } | undefined;
  /** Structural + per-frame Composition Area/Page/Row/Word geometry from the engine - absent for a caption-less render. */
  debugLayout?: CaptionDebugLayout | undefined;
  /** Which rendered output frame's live Page/Row/Word geometry to show (see `CaptionDebugLayout.frames`) - ignored for `compositionArea`, whose box is static. Defaults to the first frame. */
  frameIndex?: number;
  /** Whether to additionally draw compositionArea's padding-adjusted "content" box and its offset arrow, when hovering Composition Area. */
  showCompositionAreaPadding?: boolean;
  /** Shared scale values for this preview's SVG layers. */
  visualScale: number;
  dimensionScale: number;
  labelKeyPrefix?: string;
  collectLabels?: (labels: readonly LabelChip[]) => void;
  collectOnly?: boolean;
}

interface EntityDebugOverlayProps {
  entries: readonly DebugOverlayEntry[];
  /** Raster size of the preview canvas and the SVG's `viewBox`. */
  renderResolution: { width: number; height: number };
  /** Current CSS display size of this preview surface. */
  displaySize: { width: number; height: number };
  /** Top-left pixel position (in `renderResolution` space) where the engine's rendered caption frame is composited - see `computeOverlayPosition`. */
  overlayX: number;
  overlayY: number;
  /** The caption frame's own size - fallback for the Composition Area box when `debugLayout` is not available (e.g. no caption timestamps). */
  frameSize?: { width: number; height: number } | undefined;
  /** Structural + per-frame Composition Area/Page/Row/Word geometry from the engine - absent for a caption-less render. */
  debugLayout?: CaptionDebugLayout | undefined;
  /** Which rendered output frame's live Page/Row/Word geometry to show (see `CaptionDebugLayout.frames`) - ignored for `compositionArea`, whose box is static. Defaults to the first frame. */
  frameIndex?: number;
  /** Whether to additionally draw compositionArea's padding-adjusted "content" box and its offset arrow, when hovering Composition Area. */
  showCompositionAreaPadding?: boolean;
  /** Shared graph zoom used to keep overlay dimensions stable in screen pixels. */
  viewportZoom?: number;
}

interface PixelBox {
  x: number;
  y: number;
  width: number;
  height: number;
  key: string;
}

interface PixelPoint {
  x: number;
  y: number;
}

/** A small solid-color name tag anchored to one entity's box - see `buildLabel`. */
interface LabelChip {
  key: string;
  text: string;
  chipX: number;
  chipY: number;
  chipWidth: number;
  chipHeight: number;
  fontSize: number;
  fillColor: string;
  textColor: string;
  anchorX: number;
  anchorY: number;
}

interface LabelConnector {
  from: PixelPoint;
  to: PixelPoint;
}

interface PositionedLabel extends LabelChip {
  connector?: LabelConnector;
}

/** Relative luminance (sRGB, un-gamma-corrected approximation - good enough for a text/background contrast pick) of a `#rrggbb` color. */
function relativeLuminance(hexColor: string): number {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Dark text on light entity colors (e.g. row's yellow), white text otherwise (e.g. compositionArea's cyan, page's pink, word's green) - matches the reference design's solid filled chip + legible text. */
function pickTextColor(entityColor: string): string {
  const { labelDarkTextLuminanceThreshold, labelDarkTextColor, labelLightTextColor } = debugLayer.settings;
  return relativeLuminance(entityColor) > labelDarkTextLuminanceThreshold ? labelDarkTextColor : labelLightTextColor;
}

function patternIdForKind(kind: DebugEntityKind): string {
  return `entity-debug-stripe-${kind}`;
}

function arrowMarkerIdForKind(kind: DebugEntityKind): string {
  return `entity-debug-offset-arrow-${kind}`;
}

function labelsOverlapBeyondThreshold(
  labels: readonly LabelChip[],
  visualScale: number,
  overlapThreshold: number,
): boolean {
  const threshold = Math.max(0, overlapThreshold);

  for (const [index, current] of labels.entries()) {
    const currentRectangle = labelRectangle(current);
    for (const other of labels.slice(index + 1)) {
      const otherRectangle = labelRectangle(other);
      const horizontalOverlap =
        Math.min(currentRectangle.right, otherRectangle.right) -
        Math.max(currentRectangle.left, otherRectangle.left);
      const verticalOverlap =
        Math.min(currentRectangle.bottom, otherRectangle.bottom) -
        Math.max(currentRectangle.top, otherRectangle.top);

      if (horizontalOverlap * visualScale > threshold && verticalOverlap * visualScale > threshold) {
        return true;
      }
    }
  }
  return false;
}

function labelRectangle(label: LabelChip, x = label.chipX, y = label.chipY) {
  return {
    left: x,
    top: y,
    right: x + label.chipWidth,
    bottom: y + label.chipHeight,
  };
}

function labelOverlapArea(
  first: ReturnType<typeof labelRectangle>,
  second: ReturnType<typeof labelRectangle>,
  gap: number,
): number {
  const left = Math.max(first.left, second.left - gap);
  const top = Math.max(first.top, second.top - gap);
  const right = Math.min(first.right, second.right + gap);
  const bottom = Math.min(first.bottom, second.bottom + gap);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function clampLabelPosition(
  label: LabelChip,
  x: number,
  y: number,
  renderResolution: { width: number; height: number },
): PixelPoint {
  return {
    x: Math.min(Math.max(x, 0), Math.max(0, renderResolution.width - label.chipWidth)),
    y: Math.min(Math.max(y, 0), Math.max(0, renderResolution.height - label.chipHeight)),
  };
}

function labelConnectorEndpoint(label: LabelChip, x: number, y: number): PixelPoint {
  const rectangle = labelRectangle(label, x, y);
  const isInside =
    label.anchorX >= rectangle.left &&
    label.anchorX <= rectangle.right &&
    label.anchorY >= rectangle.top &&
    label.anchorY <= rectangle.bottom;
  if (!isInside) {
    return {
      x: Math.min(Math.max(label.anchorX, rectangle.left), rectangle.right),
      y: Math.min(Math.max(label.anchorY, rectangle.top), rectangle.bottom),
    };
  }

  const edges = [
    { x: label.anchorX, y: rectangle.top, distance: label.anchorY - rectangle.top },
    { x: label.anchorX, y: rectangle.bottom, distance: rectangle.bottom - label.anchorY },
    { x: rectangle.left, y: label.anchorY, distance: label.anchorX - rectangle.left },
    { x: rectangle.right, y: label.anchorY, distance: rectangle.right - label.anchorX },
  ];
  const edge = edges.reduce((closest, candidate) =>
    candidate.distance < closest.distance ? candidate : closest,
  );
  return { x: edge.x, y: edge.y };
}

function placeDebugLabels(
  labels: readonly LabelChip[],
  renderResolution: { width: number; height: number },
  visualScale: number,
): ReadonlyMap<string, PositionedLabel> {
  const placed: PositionedLabel[] = [];
  const placements = new Map<string, PositionedLabel>();
  const settings = debugLayer.settings;
  const gap = Math.max(0, settings.labelStackGap) / Math.max(visualScale, settings.minVisualScale);
  const maxLabelWidth = Math.max(...labels.map((label) => label.chipWidth), 1);
  const maxLabelHeight = Math.max(...labels.map((label) => label.chipHeight), 1);
  const verticalStep = maxLabelHeight + gap;
  const horizontalStep = maxLabelWidth + gap;
  const maxSearchRings = Math.max(6, Math.min(48, labels.length + 2));

  for (const label of labels) {
    const candidates: PixelPoint[] = [{ x: label.chipX, y: label.chipY }];
    for (let ring = 1; ring <= maxSearchRings; ring += 1) {
      const xOffset = ring * horizontalStep;
      const yOffset = ring * verticalStep;
      candidates.push(
        { x: label.chipX, y: label.chipY + yOffset },
        { x: label.chipX, y: label.chipY - yOffset },
        { x: label.chipX + xOffset, y: label.chipY },
        { x: label.chipX - xOffset, y: label.chipY },
        { x: label.chipX + xOffset, y: label.chipY + yOffset },
        { x: label.chipX - xOffset, y: label.chipY + yOffset },
        { x: label.chipX + xOffset, y: label.chipY - yOffset },
        { x: label.chipX - xOffset, y: label.chipY - yOffset },
      );
    }

    let bestPosition = clampLabelPosition(label, label.chipX, label.chipY, renderResolution);
    let bestScore = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      const position = clampLabelPosition(label, candidate.x, candidate.y, renderResolution);
      const rectangle = labelRectangle(label, position.x, position.y);
      let collisionCount = 0;
      let overlapArea = 0;
      for (const previous of placed) {
        const overlap = labelOverlapArea(rectangle, labelRectangle(previous), gap);
        if (overlap > 0) collisionCount += 1;
        overlapArea += overlap;
      }

      const distance = Math.abs(position.x - label.chipX) + Math.abs(position.y - label.chipY);
      const score = collisionCount * 1_000_000 + overlapArea * 1_000 + distance;
      if (score < bestScore) {
        bestPosition = position;
        bestScore = score;
      }
      if (collisionCount === 0 && distance === 0) break;
    }

    const connector =
      Math.abs(bestPosition.x - label.chipX) > 0.5 || Math.abs(bestPosition.y - label.chipY) > 0.5
        ? {
            from: { x: label.anchorX, y: label.anchorY },
            to: labelConnectorEndpoint(label, bestPosition.x, bestPosition.y),
          }
        : undefined;
    const positionedLabel: PositionedLabel = {
      ...label,
      chipX: bestPosition.x,
      chipY: bestPosition.y,
      connector,
    };
    placed.push(positionedLabel);
    placements.set(label.key, positionedLabel);
  }

  return placements;
}

function debugOverlayLayerKey(entry: DebugOverlayEntry): string {
  return `${entry.kind}-${entry.showPaddingOnly ? 'padding' : 'entity'}-${
    entry.paddingTarget ? `${entry.paddingTarget.component}-${entry.paddingTarget.fieldKey}` : 'none'
  }-${entry.positionTarget ? 'position' : 'none'}`;
}

/**
 * Draws a bright, diagonally-striped "debug grid" box (or boxes) over one
 * entity - Composition Area, Page, Row(s), Word(s), Background(s), or Marker(s) - in the live preview, so
 * hovering the matching icon in a `DesignEditor` card title makes clear what
 * that entity covers on screen. Purely a hover affordance: no
 * interaction - the underlying geometry is computed once by the engine per
 * render (see `CaptionDebugLayout`), but Page/Row/Word boxes are re-read from
 * `debugLayout.frames[frameIndex]` on every playback frame so they visibly
 * track each word's live animation (scale/offset/rotation) rather than a
 * single frozen snapshot.
 */
function renderEntityDebugLayer({
  entry,
  renderResolution,
  displaySize,
  overlayX,
  overlayY,
  frameSize,
  debugLayout,
  frameIndex = 0,
  showCompositionAreaPadding = false,
  visualScale,
  dimensionScale,
  labelKeyPrefix = 'label',
  collectLabels,
  collectOnly = false,
}: EntityDebugLayerProps) {
  const {
    kind,
    paddingTarget: paddingPreviewTarget,
    positionTarget: positionPreviewTarget,
    showPaddingOnly,
    showPositionOnly,
    wordStates: visibleWordStates,
    rowStates: visibleRowStates,
    paddingStates: visiblePaddingStates,
    positionStates: visiblePositionStates,
  } = entry;
  const color = DEBUG_ENTITY_COLORS[kind];
  const patternId = patternIdForKind(kind);
  const arrowMarkerId = arrowMarkerIdForKind(kind);

  // `compositionArea`/`compositionAreaContent`/`compositionAreaOffset` in
  // `debugLayout` are always expressed in *absolute*, full-`videoResolution`
  // -relative caption-composition space (see the ECS composition-area resolver
  // - a compositionArea conceptually always
  // spans the full frame unless configured smaller). Page/Row/Word geometry,
  // however, is captured relative to the rendered caption frame's own local
  // origin (see `createCompositeImage`'s `projectPoint`) - which only
  // coincides with the full canvas's origin when a `compositionArea` is
  // configured. When none is configured, the engine uses a
  // tightly-cropped `frameSize` positioned via `placement`/`overlayX`/
  // `overlayY` (its "auto" content-hugging optimization), so Page/Row/Word
  // need that offset added back in to land in canvas-pixel space, while
  // Composition Area's own box must NOT be offset again - doing so
  // double-shifts it, dragging it away from the canvas origin it is already
  // expressed relative to (visible as the box appearing to hug the bottom
  // edge with most of it clipped off-canvas).
  const toPixel = (p: { x: number; y: number }, scale: number, ox = overlayX, oy = overlayY): PixelPoint => ({
    x: ox + p.x * scale,
    y: oy + p.y * scale,
  });

  const toBox = (b: CaptionDebugBox, scale: number, key: string, ox = overlayX, oy = overlayY): PixelBox => ({
    x: ox + b.left * scale,
    y: oy + b.top * scale,
    width: (b.right - b.left) * scale,
    height: (b.bottom - b.top) * scale,
    key,
  });

  const toPolygonPoints = (quad: CaptionDebugQuad, scale: number): string =>
    [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft]
      .map((p) => toPixel(p, scale))
      .map((p) => `${p.x},${p.y}`)
      .join(' ');

  // The SVG viewBox follows the raster quality, but its CSS display box does
  // not. Keep visual constants in display-pixel terms, then convert them back
  // into the active viewBox's coordinate space.
  const settings = debugLayer.settings;
  const displayLabelFontSize = Math.min(
    settings.labelMaxFontSize,
    Math.max(settings.labelMinFontSize, displaySize.height * settings.labelFontSizeRatio),
  );
  const labelFontSize = displayLabelFontSize / visualScale;

  // How close a box's own top edge must be to the *frame's* top edge (not
  // its parent box's) to count as "starts from the top edge" - matches the
  // reference design: only flip the label inside when the box is genuinely
  // flush with the very top of the video frame, not any box nested
  // near the top of a larger parent box.
  const topEdgeThreshold = Math.max(
    settings.labelTopEdgeThreshold,
    displaySize.height * settings.labelTopEdgeThresholdRatio,
  ) / visualScale;

    /**
 * Builds one small solid-color name tag anchored to a box's top-left
 * corner. Draw it *inside* the box when it starts flush with the frame's
 * own top edge. There is no room above it without clipping or overlap.
 * Draw it *outside* (directly above) it
 * otherwise, per the reference design.
 */
  const buildLabel = (box: Pick<PixelBox, 'x' | 'y' | 'width'>, text: string, key: string): LabelChip => {
    const horizontalPadding = labelFontSize * settings.labelHorizontalPaddingRatio;
    const verticalPadding = labelFontSize * settings.labelVerticalPaddingRatio;
    const chipHeight = labelFontSize + verticalPadding * 2;
    const chipWidth = text.length * labelFontSize * settings.labelCharacterWidthRatio + horizontalPadding * 2;
    const startsAtFrameTop = box.y <= topEdgeThreshold;
    const gap = settings.labelGap * dimensionScale;
    let chipY = startsAtFrameTop ? box.y + gap : box.y - chipHeight - gap;
    // No room to place it above (box itself sits directly below the frame's top
    // edge but not flush with it) - fall back to inside rather than letting
    // it clip off the top of the canvas.
    if (chipY < 0) chipY = box.y + gap;
    const chipX = Math.min(Math.max(box.x, 0), renderResolution.width - chipWidth);
    return {
      key,
      text,
      chipX,
      chipY,
      chipWidth,
      chipHeight,
      fontSize: labelFontSize,
      fillColor: color,
      textColor: pickTextColor(color),
      anchorX: box.x,
      anchorY: box.y,
    };
  };

  /**
 * Page's label is special-cased to anchor at the box's bottom-left corner,
 * directly outside (below) it, rather than the generic top-left/above-or-
 * inside placement every other entity uses. If that pushes the chip
 * past the canvas's own bottom edge (e.g. the page box already reaches
 * close to the frame's bottom), it falls back to the box's top-right
 * corner instead - applying the same inside-vs-outside-above rule
 * `buildLabel` uses relative to the *frame's* top edge, mirrored to
 * the right side.
 */
  const buildPageLabel = (box: PixelBox, text: string, key: string): LabelChip => {
    const horizontalPadding = labelFontSize * settings.labelHorizontalPaddingRatio;
    const verticalPadding = labelFontSize * settings.labelVerticalPaddingRatio;
    const chipHeight = labelFontSize + verticalPadding * 2;
    const chipWidth = text.length * labelFontSize * settings.labelCharacterWidthRatio + horizontalPadding * 2;
    const gap = settings.labelGap * dimensionScale;

    const belowY = box.y + box.height + gap;
    const fitsBelowFrame = belowY + chipHeight <= renderResolution.height;

    let chipX: number;
    let chipY: number;
    if (fitsBelowFrame) {
      chipX = box.x;
      chipY = belowY;
    } else {
      chipX = box.x + box.width - chipWidth;
      const startsAtFrameTop = box.y <= topEdgeThreshold;
      chipY = startsAtFrameTop ? box.y + gap : box.y - chipHeight - gap;
      // Same top-edge-clip fallback as the generic `buildLabel`: no room above, so sit inside instead.
      if (chipY < 0) chipY = box.y + gap;
    }

    chipX = Math.min(Math.max(chipX, 0), renderResolution.width - chipWidth);
    return {
      key,
      text,
      chipX,
      chipY,
      chipWidth,
      chipHeight,
      fontSize: labelFontSize,
      fillColor: color,
      textColor: pickTextColor(color),
      anchorX: fitsBelowFrame ? box.x : box.x + box.width,
      anchorY: fitsBelowFrame ? box.y + box.height : box.y,
    };
  };

  const aggregateLabelsIfOverlapping = (candidateLabels: LabelChip[]): LabelChip[] => {
    if ((kind !== 'row' && kind !== 'word') || candidateLabels.length < 2) return candidateLabels;

    if (!labelsOverlapBeyondThreshold(candidateLabels, visualScale, settings.labelAggregationOverlapThreshold)) {
      return candidateLabels;
    }

    const representative = candidateLabels[0];
    const text = kind === 'row' ? 'ROWS' : 'WORDS';
    const horizontalPadding = representative.fontSize * settings.labelHorizontalPaddingRatio;
    const chipWidth = text.length * representative.fontSize * settings.labelCharacterWidthRatio + horizontalPadding * 2;
    const chipX = Math.min(
      Math.max(representative.chipX, 0),
      Math.max(0, renderResolution.width - chipWidth),
    );
    return [
      {
        ...representative,
        key: `label-${kind}-aggregate`,
        text,
        chipX,
        chipWidth,
      },
    ];
  };

  /** SVG evenodd path for the rectangular "ring" between an outer and inner box - used to highlight the padding gap itself, not only the two boxes' borders. */
  const toRingPath = (outer: PixelBox, inner: PixelBox): string =>
    `M${outer.x},${outer.y} H${outer.x + outer.width} V${outer.y + outer.height} H${outer.x} Z ` +
    `M${inner.x},${inner.y} H${inner.x + inner.width} V${inner.y + inner.height} H${inner.x} Z`;

  const insetBox = (box: PixelBox, padding: PaddingPreviewValue, key: string): PixelBox => ({
    x: box.x + padding.left,
    y: box.y + padding.top,
    width: Math.max(1, box.width - padding.left - padding.right),
    height: Math.max(1, box.height - padding.top - padding.bottom),
    key,
  });

  const expandedBox = (box: PixelBox, padding: PaddingPreviewValue, key: string): PixelBox => ({
    x: box.x - padding.left,
    y: box.y - padding.top,
    width: Math.max(1, box.width + padding.left + padding.right),
    height: Math.max(1, box.height + padding.top + padding.bottom),
    key,
  });

  // Solid, axis-aligned boxes (Composition Area outer/content, Page, Row).
  const boxes: PixelBox[] = [];
  // Rotatable quads (Words) - drawn as `<polygon>` since `textStyle.rotation` can tilt them away from axis-aligned.
  const polygons: Array<{ points: string; key: string }> = [];
  // One name tag per labeled entity instance - populated alongside boxes/polygons below.
  const labels: LabelChip[] = [];
  // Composition Area's configured offset, drawn as a double-headed arrow from its un-offset anchor to its actual position - only when hovering Composition Area with padding shown.
  let offsetArrow: { from: PixelPoint; to: PixelPoint; labelX: number; labelY: number; label: string } | null = null;
  // The ring-shaped padding "gap" between Composition Area's outer box and its padding-adjusted content box - filled at a stronger opacity than either box's own border so the padding itself is unmistakable, not only two similarly-styled overlapping rects (which made a modest padding value easy to miss entirely).
  let paddingRingPath: string | null = null;
  const paddingBoxes: PixelBox[] = [];
  const positionGuides: Array<{ x: number; y: number; key: string }> = [];

  if (kind === 'viewport' && debugLayout?.viewport) {
    const { scale } = debugLayout;
    const outerBox = toBox(debugLayout.viewport, scale, 'viewport', 0, 0);
    boxes.push(outerBox);
    labels.push(buildLabel(outerBox, 'VIEWPORT', 'label-viewport'));
  } else if (kind === 'videoArea' && debugLayout?.videoArea) {
    const { scale } = debugLayout;
    const outerBox = toBox(debugLayout.videoArea, scale, 'videoArea', 0, 0);
    boxes.push(outerBox);
    labels.push(buildLabel(outerBox, 'VIDEO AREA', 'label-videoArea'));
  } else if (kind === 'video' && debugLayout?.video) {
    const { scale } = debugLayout;
    const outerBox = toBox(debugLayout.video, scale, 'video', 0, 0);
    boxes.push(outerBox);
    labels.push(buildLabel(outerBox, 'VIDEO', 'label-video'));
  } else if (kind === 'compositionArea' && debugLayout) {
    const { scale } = debugLayout;
    const outerBox = toBox(debugLayout.compositionArea, scale, 'compositionArea', 0, 0);
    boxes.push(outerBox);
    labels.push(buildLabel(outerBox, 'COMPOSITION AREA', 'label-compositionArea'));
    if (showCompositionAreaPadding) {
      const contentBox = toBox(debugLayout.compositionAreaContent, scale, 'compositionAreaContent', 0, 0);
      boxes.push(contentBox);
      if (contentBox.width < outerBox.width - 0.5 || contentBox.height < outerBox.height - 0.5) {
        paddingRingPath = toRingPath(outerBox, contentBox);
      }

      const offset = debugLayout.compositionAreaOffset;
      const pixelOffsetX = offset.x * scale;
      const pixelOffsetY = offset.y * scale;
      if (Math.abs(pixelOffsetX) > 0.5 || Math.abs(pixelOffsetY) > 0.5) {
        const area = debugLayout.compositionArea;
        const actual = toPixel({ x: (area.left + area.right) / 2, y: (area.top + area.bottom) / 2 }, scale, 0, 0);
        const anchor = { x: actual.x - pixelOffsetX, y: actual.y - pixelOffsetY };
        offsetArrow = {
          from: anchor,
          to: actual,
          labelX: (anchor.x + actual.x) / 2,
          labelY: (anchor.y + actual.y) / 2 - settings.offsetLabelVerticalOffset * dimensionScale,
          label: `${Math.round(pixelOffsetX)}, ${Math.round(pixelOffsetY)}px`,
        };
      }
    }
  } else if (kind === 'compositionArea' && frameSize) {
    // Fallback for the (unexpected) case debug data is not available - full frame rect, as before this feature existed.
    const box: PixelBox = {
      x: overlayX,
      y: overlayY,
      width: frameSize.width,
      height: frameSize.height,
      key: 'compositionArea',
    };
    boxes.push(box);
    labels.push(buildLabel(box, 'COMPOSITION AREA', 'label-compositionArea'));
  } else if (debugLayout) {
    const { scale } = debugLayout;
    const frame = debugLayout.frames[frameIndex] ?? debugLayout.frames[0];
    if (frame) {
      if (kind === 'page') {
        const box = toBox(frame.page, scale, 'page');
        boxes.push(box);
        labels.push(buildPageLabel(box, 'PAGE', 'label-page'));
      } else if (kind === 'row') {
        for (const [rowFrameIndex, row] of frame.rows.entries()) {
          if (!visibleRowStates.includes(row.state)) continue;
          const rowKey = `row-${row.state}-${row.rowIndex}-${rowFrameIndex}`;
          const box = toBox(row, scale, rowKey);
          boxes.push(box);
          const roleLabel = `${row.state.toUpperCase()} ROW`;
          labels.push(
            buildLabel(
              box,
              `${roleLabel}: ${row.rowIndex + 1}`,
              `label-${rowKey}`,
            ),
          );
        }
      } else if (kind === 'word') {
        for (const [i, word] of frame.words.entries()) {
          if (!visibleWordStates.includes(word.state)) continue;
          polygons.push({ points: toPolygonPoints(word, scale), key: `word-${i}` });
          // Words can be rotated (non-axis-aligned polygons), so the label anchors to the quad's own axis-aligned envelope rather than the (possibly tilted) polygon itself.
          const corners = [word.topLeft, word.topRight, word.bottomRight, word.bottomLeft].map((p) =>
            toPixel(p, scale),
          );
          const envelope: Pick<PixelBox, 'x' | 'y' | 'width'> = {
            x: Math.min(...corners.map((p) => p.x)),
            y: Math.min(...corners.map((p) => p.y)),
            width: Math.max(...corners.map((p) => p.x)) - Math.min(...corners.map((p) => p.x)),
          };
          const roleLabel = `${word.state.toUpperCase()} WORD`;
          labels.push(
            buildLabel(
              envelope,
              `${roleLabel}: ${word.word.toUpperCase()}`,
              `label-word-${i}`,
            ),
          );
        }
      } else if (kind === 'marker') {
        for (const [index, transform] of frame.transforms.filter((candidate) => candidate.entity === 'marker').entries()) {
          const box = toBox(
            {
              left: transform.positionAnchor.x,
              top: transform.positionAnchor.y,
              right: transform.positionAnchor.x + transform.dimensions.x,
              bottom: transform.positionAnchor.y + transform.dimensions.y,
            },
            scale,
            `marker-${index}`,
          );
          boxes.push(box);
          labels.push(buildLabel(box, 'MARKER', `label-marker-${index}`));
        }
      } else if (kind === 'background') {
        for (const [index, transform] of frame.transforms
          .filter((candidate) => candidate.entity === 'background')
          .entries()) {
          const box = toBox(
            {
              left: transform.positionAnchor.x,
              top: transform.positionAnchor.y,
              right: transform.positionAnchor.x + transform.dimensions.x,
              bottom: transform.positionAnchor.y + transform.dimensions.y,
            },
            scale,
            `background-${index}`,
          );
          boxes.push(box);
          labels.push(buildLabel(box, 'BACKGROUND', `label-background-${index}`));
        }
      } else if (kind === 'image') {
        for (const [index, transform] of frame.transforms
          .filter((candidate) => candidate.entity === 'image')
          .entries()) {
          const box = toBox(
            {
              left: transform.positionAnchor.x,
              top: transform.positionAnchor.y,
              right: transform.positionAnchor.x + transform.dimensions.x,
              bottom: transform.positionAnchor.y + transform.dimensions.y,
            },
            scale,
            `image-${index}`,
          );
          boxes.push(box);
          labels.push(buildLabel(box, 'IMAGE', `label-image-${index}`));
        }
      }
    }
  }

  if (paddingPreviewTarget?.kind === kind) {
    const { fieldKey, component, value } = paddingPreviewTarget;
    const scale = debugLayout?.scale ?? 1;
    const padding = {
      top: Math.max(0, value.top) * scale,
      right: Math.max(0, value.right) * scale,
      bottom: Math.max(0, value.bottom) * scale,
      left: Math.max(0, value.left) * scale,
    };
    const frame = debugLayout?.frames[frameIndex] ?? debugLayout?.frames[0];
    const usesFrameCoordinates =
      kind === 'page' ||
      kind === 'row' ||
      kind === 'word' ||
      kind === 'background' ||
      kind === 'image' ||
      kind === 'marker';
    const exactBackgroundPaddingBoxesFor = (instanceIndex?: number, entityId?: string): PixelBox[] | undefined => {
      if (component !== 'backgroundStyle' || (fieldKey !== 'bandPadding' && fieldKey !== 'blockPadding')) return undefined;
      const background = frame?.backgrounds?.find(
        (candidate) =>
          candidate.entity === kind &&
          (kind === 'background' && entityId ? candidate.id === entityId : candidate.instanceIndex === instanceIndex),
      );
      if (!background) return undefined;
      const source = fieldKey === 'bandPadding' ? background.bandPadding : background.blockPadding;
      return source.map((box, index) =>
        toBox(
          box,
          scale,
          `${kind}-${instanceIndex ?? 'single'}-${fieldKey}-${index}`,
          usesFrameCoordinates ? overlayX : 0,
          usesFrameCoordinates ? overlayY : 0,
        ),
      );
    };
    const fallbackPaddingBox = (base: PixelBox, key: string): PixelBox =>
      component === 'backgroundStyle'
        ? expandedBox(base, padding, key)
        : insetBox(base, padding, key);

    if (kind === 'viewport' && debugLayout?.viewport) {
      const base = toBox(debugLayout.viewport, scale, 'viewport', 0, 0);
      paddingBoxes.push(
        component === 'layout' && fieldKey === 'padding' && debugLayout.viewportContent
          ? toBox(debugLayout.viewportContent, scale, 'viewport-content', 0, 0)
          : fallbackPaddingBox(base, 'viewport-padding'),
      );
    } else if (kind === 'videoArea' && debugLayout?.videoArea) {
      const base = toBox(debugLayout.videoArea, scale, 'videoArea', 0, 0);
      const exact = exactBackgroundPaddingBoxesFor();
      const fallback =
        component === 'layout' && fieldKey === 'padding' && debugLayout.videoAreaContent
          ? toBox(debugLayout.videoAreaContent, scale, 'videoArea-content', 0, 0)
          : fallbackPaddingBox(base, 'videoArea-padding');
      paddingBoxes.push(...(exact ?? [fallback]));
    } else if (kind === 'video' && debugLayout?.video) {
      const base = toBox(debugLayout.video, scale, 'video', 0, 0);
      const exact = exactBackgroundPaddingBoxesFor();
      const fallback =
        component === 'layout' && fieldKey === 'padding' && debugLayout.videoContent
          ? toBox(debugLayout.videoContent, scale, 'video-content', 0, 0)
          : fallbackPaddingBox(base, 'video-padding');
      paddingBoxes.push(...(exact ?? [fallback]));
    } else if (kind === 'compositionArea') {
      const base = debugLayout
        ? toBox(debugLayout.compositionArea, scale, 'compositionArea', 0, 0)
        : frameSize
          ? ({
              x: overlayX,
              y: overlayY,
              width: frameSize.width,
              height: frameSize.height,
              key: 'compositionArea',
            } as PixelBox)
          : null;
      if (base) {
        const exact = exactBackgroundPaddingBoxesFor();
        const fallback =
          component === 'layout' && fieldKey === 'padding' && debugLayout?.compositionAreaContent
            ? toBox(debugLayout.compositionAreaContent, scale, 'compositionArea-content', 0, 0)
            : fallbackPaddingBox(base, 'compositionArea-padding');
        paddingBoxes.push(...(exact ?? [fallback]));
      }
    } else if (debugLayout) {
      const frame = debugLayout.frames[frameIndex] ?? debugLayout.frames[0];
      if (frame) {
        if (kind === 'page') {
          const base = toBox(frame.page, scale, 'page');
          const exact = exactBackgroundPaddingBoxesFor();
          paddingBoxes.push(...(exact ?? [fallbackPaddingBox(base, 'page-padding')]));
        } else if (kind === 'row') {
          for (const [rowFrameIndex, row] of frame.rows.entries()) {
            if (!visibleRowStates.includes(row.state) || !visiblePaddingStates.includes(row.state)) continue;
            const base = toBox(row, scale, `row-${row.state}-${row.rowIndex}-${rowFrameIndex}`);
            const exact = exactBackgroundPaddingBoxesFor(row.rowIndex);
            paddingBoxes.push(
              ...(exact ?? [fallbackPaddingBox(base, `row-${row.state}-${row.rowIndex}-${rowFrameIndex}-padding`)]),
            );
          }
        } else if (kind === 'word') {
          for (const [i, word] of frame.words.entries()) {
            if (!visibleWordStates.includes(word.state) || !visiblePaddingStates.includes(word.state)) continue;
            const corners = [word.topLeft, word.topRight, word.bottomRight, word.bottomLeft].map((p) =>
              toPixel(p, scale),
            );
            const envelope: PixelBox = {
              x: Math.min(...corners.map((p) => p.x)),
              y: Math.min(...corners.map((p) => p.y)),
              width: Math.max(...corners.map((p) => p.x)) - Math.min(...corners.map((p) => p.x)),
              height: Math.max(...corners.map((p) => p.y)) - Math.min(...corners.map((p) => p.y)),
              key: `word-${word.state}-${i}`,
            };
            const exact = exactBackgroundPaddingBoxesFor(i);
            paddingBoxes.push(...(exact ?? [fallbackPaddingBox(envelope, `word-${word.state}-${i}-padding`)]));
          }
        } else if (kind === 'marker') {
          for (const [i, transform] of frame.transforms.filter((candidate) => candidate.entity === 'marker').entries()) {
            const base = toBox(
              {
                left: transform.positionAnchor.x,
                top: transform.positionAnchor.y,
                right: transform.positionAnchor.x + transform.dimensions.x,
                bottom: transform.positionAnchor.y + transform.dimensions.y,
              },
              scale,
              `marker-${i}`,
            );
            const exact = exactBackgroundPaddingBoxesFor(i);
            paddingBoxes.push(...(exact ?? [fallbackPaddingBox(base, `marker-${i}-padding`)]));
          }
        } else if (kind === 'background') {
          for (const [i, transform] of frame.transforms
            .filter((candidate) => candidate.entity === 'background')
            .entries()) {
            const base = toBox(
              {
                left: transform.positionAnchor.x,
                top: transform.positionAnchor.y,
                right: transform.positionAnchor.x + transform.dimensions.x,
                bottom: transform.positionAnchor.y + transform.dimensions.y,
              },
              scale,
              `background-${i}`,
            );
            const exact = exactBackgroundPaddingBoxesFor(undefined, transform.id);
            paddingBoxes.push(...(exact ?? [fallbackPaddingBox(base, `background-${i}-padding`)]));
          }
        } else if (kind === 'image') {
          for (const [i, transform] of frame.transforms
            .filter((candidate) => candidate.entity === 'image')
            .entries()) {
            const base = toBox(
              {
                left: transform.positionAnchor.x,
                top: transform.positionAnchor.y,
                right: transform.positionAnchor.x + transform.dimensions.x,
                bottom: transform.positionAnchor.y + transform.dimensions.y,
              },
              scale,
              `image-${i}`,
            );
            paddingBoxes.push(fallbackPaddingBox(base, `image-${i}-padding`));
          }
        }
      }
    }
  }

  if (positionPreviewTarget?.kind === kind && debugLayout) {
    const scale = debugLayout.scale;
    const frame = debugLayout.frames[frameIndex] ?? debugLayout.frames[0];
    const transforms = frame?.transforms ?? debugLayout.resolvedTransforms ?? [];
    const usesFrameCoordinates =
      kind === 'page' ||
      kind === 'row' ||
      kind === 'word' ||
      kind === 'background' ||
      kind === 'image' ||
      kind === 'marker';
    for (const [index, transform] of transforms
      .filter((candidate) => candidate.entity === kind)
      .entries()) {
      if (
        (kind === 'row' || kind === 'word') &&
        transform.state !== undefined &&
        !visiblePositionStates.includes(transform.state)
      ) {
        continue;
      }
      const anchor = transform.positionAnchor;
      const point = toPixel(
        anchor,
        scale,
        usesFrameCoordinates ? overlayX : 0,
        usesFrameCoordinates ? overlayY : 0,
      );
      positionGuides.push({ x: point.x, y: point.y, key: `position-${kind}-${index}` });
    }
  }

  const showPreviewOnly = showPaddingOnly || showPositionOnly;
  if (showPreviewOnly) {
    if (paddingBoxes.length === 0 && positionGuides.length === 0) return null;
  } else if (boxes.length === 0 && polygons.length === 0 && paddingBoxes.length === 0 && positionGuides.length === 0) {
    return null;
  }
  const labelsToRender = (showPreviewOnly ? [] : aggregateLabelsIfOverlapping(labels)).map((label) => ({
    ...label,
    key: `${labelKeyPrefix}-${label.key}`,
  }));
  collectLabels?.(labelsToRender);
  if (collectOnly) return null;

  return (
    <g key={debugOverlayLayerKey(entry)} data-debug-entity-kind={kind}>
      {!showPreviewOnly && boxes.map((box) => (
        <rect
          key={box.key}
          data-debug-overlay-part="entity-box"
          data-debug-overlay-key={box.key}
          x={box.x}
          y={box.y}
          width={box.width}
          height={box.height}
          // The content/padding box gets no fill of its own (only its dashed
          // border below) - its area already shows the outer box's own fill
          // underneath, so the *only* extra-filled region ends up being the
          // padding ring itself (drawn next), making the padding obvious
          // instead of two nearly-identical overlapping filled boxes.
          fill={box.key === 'compositionAreaContent' ? 'none' : `url(#${patternId})`}
          fillOpacity={settings.boxFillOpacity}
          stroke={color}
          // Content/padding box is drawn dashed so it is visually distinct from the outer Composition Area box even though they share the same stripe fill/color.
          strokeDasharray={
            box.key === 'compositionAreaContent'
              ? `${settings.boxDashLength * dimensionScale} ${settings.boxDashGap * dimensionScale}`
              : undefined
          }
          strokeWidth={settings.boxStrokeWidth * dimensionScale}
        />
      ))}
      {!showPreviewOnly && paddingRingPath && (
        <path
          data-debug-overlay-part="padding-ring"
          d={paddingRingPath}
          fillRule="evenodd"
          fill={`url(#${patternId})`}
          // Stacks on top of the outer box's own 0.35 fill directly above,
          // so the padding ring reads as visibly darker/denser than the
          // content area inside it - an unmissable highlight of exactly
          // where the padding gap is, regardless of how thin it is.
          fillOpacity={settings.paddingRingFillOpacity}
        />
      )}
      {!showPreviewOnly && polygons.map((polygon) => (
        <polygon
          key={polygon.key}
          data-debug-overlay-part="entity-box"
          points={polygon.points}
          fill={`url(#${patternId})`}
          fillOpacity={settings.boxFillOpacity}
          stroke={color}
          strokeWidth={settings.boxStrokeWidth * dimensionScale}
        />
      ))}
      {!showPreviewOnly && offsetArrow && (
        <>
          <line
            x1={offsetArrow.from.x}
            y1={offsetArrow.from.y}
            x2={offsetArrow.to.x}
            y2={offsetArrow.to.y}
            stroke={color}
            strokeWidth={settings.offsetArrowStrokeWidth * dimensionScale}
            markerStart={`url(#${arrowMarkerId})`}
            markerEnd={`url(#${arrowMarkerId})`}
          />
          <text
            x={offsetArrow.labelX}
            y={offsetArrow.labelY}
            fill={color}
            fontSize={settings.offsetLabelFontSize * dimensionScale}
            fontWeight={settings.offsetLabelFontWeight}
            textAnchor="middle"
            paintOrder="stroke"
            stroke={settings.offsetLabelStrokeColor}
            strokeWidth={settings.offsetLabelStrokeWidth * dimensionScale}
          >
            {offsetArrow.label}
          </text>
        </>
      )}
      {paddingBoxes.map((box) => (
        <rect
          key={box.key}
          data-debug-overlay-part="padding-box"
          data-debug-overlay-key={box.key}
          x={box.x}
          y={box.y}
          width={box.width}
          height={box.height}
          fill={showPaddingOnly ? `url(#${patternId})` : 'none'}
          fillOpacity={showPaddingOnly ? settings.paddingOnlyFillOpacity : settings.paddingPreviewEmptyOpacity}
          stroke={color}
          strokeDasharray={`${settings.boxDashLength * dimensionScale} ${settings.boxDashGap * dimensionScale}`}
          strokeWidth={settings.paddingStrokeWidth * dimensionScale}
        />
      ))}
      {positionGuides.map((guide) => (
        <g key={guide.key} data-debug-overlay-part="position-guide" pointerEvents="none">
          <line
            x1={guide.x}
            y1={0}
            x2={guide.x}
            y2={renderResolution.height}
            stroke={color}
            strokeWidth={settings.guideStrokeWidth * dimensionScale}
            strokeDasharray={`${settings.guideDashLength * dimensionScale} ${settings.guideDashGap * dimensionScale}`}
            opacity={settings.guideOpacity}
          />
          <line
            x1={0}
            y1={guide.y}
            x2={renderResolution.width}
            y2={guide.y}
            stroke={color}
            strokeWidth={settings.guideStrokeWidth * dimensionScale}
            strokeDasharray={`${settings.guideDashLength * dimensionScale} ${settings.guideDashGap * dimensionScale}`}
            opacity={settings.guideOpacity}
          />
          <circle
            cx={guide.x}
            cy={guide.y}
            r={settings.guideRadius * dimensionScale}
            fill={color}
            stroke={settings.guideOutlineColor}
            strokeWidth={settings.guideOutlineWidth * dimensionScale}
          />
        </g>
      ))}
    </g>
  );
}

export function EntityDebugOverlay({
  entries,
  renderResolution,
  displaySize,
  overlayX,
  overlayY,
  frameSize,
  debugLayout,
  frameIndex = 0,
  showCompositionAreaPadding = false,
  viewportZoom = 1,
}: EntityDebugOverlayProps) {
  const settings = debugLayer.settings;
  const displayScale = Math.min(
    displaySize.width / Math.max(1, renderResolution.width),
    displaySize.height / Math.max(1, renderResolution.height),
  );
  const visualScale = Math.max(displayScale, settings.minVisualScale);
  const normalizedViewportZoom = Number.isFinite(viewportZoom) && viewportZoom > 0 ? viewportZoom : 1;
  const zoomAdjustedVisualScale = visualScale * normalizedViewportZoom;
  const dimensionScale = (settings.scale > 0 ? settings.scale : 1) / zoomAdjustedVisualScale;
  // Collect labels first so the final label layer is painted above every box.
  const labels: LabelChip[] = [];
  entries.forEach((entry, index) => {
    renderEntityDebugLayer({
      entry,
      renderResolution,
      displaySize,
      overlayX,
      overlayY,
      frameSize,
      debugLayout,
      frameIndex,
      showCompositionAreaPadding,
      visualScale: zoomAdjustedVisualScale,
      dimensionScale,
      labelKeyPrefix: `layer-${index}-${debugOverlayLayerKey(entry)}`,
      collectLabels: (layerLabels) => labels.push(...layerLabels),
      collectOnly: true,
    });
  });
  const labelPositions = placeDebugLabels(labels, renderResolution, zoomAdjustedVisualScale);
  const layers = entries.map((entry, index) =>
    renderEntityDebugLayer({
      entry,
      renderResolution,
      displaySize,
      overlayX,
      overlayY,
      frameSize,
      debugLayout,
      frameIndex,
      showCompositionAreaPadding,
      visualScale: zoomAdjustedVisualScale,
      dimensionScale,
      labelKeyPrefix: `layer-${index}-${debugOverlayLayerKey(entry)}`,
    }),
  );

  if (layers.every((layer) => layer === null)) return null;

  const kinds = [...new Set(entries.map((entry) => entry.kind))];
  const hasCompositionAreaOffsetArrow = showCompositionAreaPadding && kinds.includes('compositionArea');

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${renderResolution.width} ${renderResolution.height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        {kinds.map((kind) => {
          const color = DEBUG_ENTITY_COLORS[kind];
          return (
            <pattern
              key={patternIdForKind(kind)}
              id={patternIdForKind(kind)}
              width={settings.patternSize * dimensionScale}
              height={settings.patternSize * dimensionScale}
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect
                width={settings.patternSize * dimensionScale}
                height={settings.patternSize * dimensionScale}
                fill="transparent"
              />
              <line
                x1="0"
                y1="0"
                x2="0"
                y2={settings.patternSize * dimensionScale}
                stroke={color}
                strokeWidth={settings.patternStrokeWidth * dimensionScale}
              />
            </pattern>
          );
        })}
        {hasCompositionAreaOffsetArrow && (
          <marker
            id={arrowMarkerIdForKind('compositionArea')}
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerUnits="userSpaceOnUse"
            markerWidth={settings.offsetMarkerSize * settings.offsetArrowStrokeWidth * dimensionScale}
            markerHeight={settings.offsetMarkerSize * settings.offsetArrowStrokeWidth * dimensionScale}
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={DEBUG_ENTITY_COLORS.compositionArea} />
          </marker>
        )}
      </defs>
      {layers}
      {labels.length > 0 && (
        <g pointerEvents="none" data-debug-overlay-labels="true">
          {[...labelPositions.values()].map((label) => (
            <g key={label.key}>
              {label.connector && (
                <line
                  x1={label.connector.from.x}
                  y1={label.connector.from.y}
                  x2={label.connector.to.x}
                  y2={label.connector.to.y}
                  stroke={label.fillColor}
                  strokeWidth={settings.labelConnectorStrokeWidth * dimensionScale}
                  opacity={settings.labelConnectorOpacity}
                />
              )}
              <rect
                x={label.chipX}
                y={label.chipY}
                width={label.chipWidth}
                height={label.chipHeight}
                fill={label.fillColor}
                rx={settings.labelCornerRadius * dimensionScale}
              />
              <text
                x={label.chipX + label.chipWidth / 2}
                y={label.chipY + label.chipHeight / 2}
                fill={label.textColor}
                fontSize={label.fontSize}
                fontWeight={settings.labelFontWeight}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {label.text}
              </text>
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}
