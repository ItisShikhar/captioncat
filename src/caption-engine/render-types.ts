import type { CompositionAreaVideoResizeMode, HorizontalAlignment, ResolvedCornerGeometry, VerticalAlignment } from '../types/captions';
import type { Paint } from './entity-system/paint-types';

export interface CaptionImageInfo {
  word: string;
  startTime: number;
  endTime: number;
  duration: number;
  startFrame: number;
  numFrames: number;
  isLastWordInGroup: boolean;
  isLastWordOnPage: boolean;
}

export interface CaptionFrameSize {
  width: number;
  height: number;
}

/** Pixel rectangle inside a rendered caption frame. */
export interface CaptionFrameCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CaptionRenderPlacement {
  verticalAlignment: VerticalAlignment;
  horizontalAlignment: HorizontalAlignment;
  xOffset: number;
  yOffset: number;
  useSafeArea: boolean;
}

export interface CaptionDebugBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface CaptionDebugPoint {
  x: number;
  y: number;
}

export type CaptionDebugEntityState = 'default' | 'past' | 'previous' | 'current' | 'next' | 'future';

export type CaptionDebugOverrideType =
  | 'animation'
  | 'component'
  | 'effect'
  | 'engine'
  | 'inherited'
  | 'layout'
  | 'randomizer'
  | 'system';

export interface CaptionDebugPropertyOverride {
  value: unknown;
  source: string;
  type: CaptionDebugOverrideType;
  chain?: readonly string[] | undefined;
}

export interface CaptionDebugTransform {
  /** Runtime entity id for the instantiated scene. */
  id: string;
  /** Authored template id, when the runtime scene was cloned from one. */
  sourceId?: string | undefined;
  entity: string;
  /** Position consumed by layout, relative to the entity's parent frame. */
  position: CaptionDebugPoint;
  /** Resolved transformed box origin in composition/frame coordinates. */
  positionAnchor: CaptionDebugPoint;
  /** Resolved layout size, in composition units. */
  dimensions: CaptionDebugPoint;
  /** Resolved entity depth among its siblings. */
  zIndex?: number | undefined;
  /** Runtime state for Row and Word entities, used to scope state-specific debug guides. */
  state?: CaptionDebugEntityState | undefined;
  /** Resolved draw position among its siblings, where larger values paint later. */
  drawRank?: number | undefined;
  /** Human-readable source when a behavior component drives this transform. */
  drivenBy?: string | undefined;
  /** Engine-resolved property values that are not directly user-editable. */
  propertyOverrides?: Record<string, CaptionDebugPropertyOverride> | undefined;
  /** Transformed content bounds, including the entity's own effect margins. */
  contentBounds?: CaptionDebugBox | undefined;
}

export interface CaptionDebugQuad {
  topLeft: CaptionDebugPoint;
  topRight: CaptionDebugPoint;
  bottomRight: CaptionDebugPoint;
  bottomLeft: CaptionDebugPoint;
}

export interface CaptionDebugBackground {
  /** Runtime owner id for the instantiated scene. */
  id: string;
  /** Authored template id, when the runtime scene was cloned from one. */
  sourceId?: string | undefined;
  /** Physical entity kind that owns this BackgroundStyle component. */
  entity: string;
  /** Index within repeated owners such as rows, words, or markers. */
  instanceIndex?: number | undefined;
  /** Boxes that include band padding but not block padding. */
  bandPadding: CaptionDebugBox[];
  /** Boxes that include block padding but not band padding. */
  blockPadding: CaptionDebugBox[];
}

export interface CaptionDebugFrame {
  page: CaptionDebugBox;
  /** Axis-aligned bounds of all caption pixels, including background bands and effects. */
  contentBounds?: CaptionDebugBox | undefined;
  rows: Array<CaptionDebugBox & {
    rowIndex: number;
    state: 'default' | 'past' | 'previous' | 'current' | 'next' | 'future';
  }>;
  words: Array<CaptionDebugQuad & {
    rowIndex: number;
    word: string;
    state: 'past' | 'previous' | 'current' | 'next' | 'future';
  }>;
  /** Exact resolved geometry for each painted BackgroundStyle component in this frame. */
  backgrounds: CaptionDebugBackground[];
  /** Current transform anchors for every laid-out entity in this frame. */
  transforms: CaptionDebugTransform[];
}

export interface CaptionDebugPageSize {
  width: number;
  height: number;
}

export interface CaptionDebugLayout {
  scale: number;
  resolvedTransforms?: CaptionDebugTransform[] | undefined;
  minimumPageSize?: CaptionDebugPageSize | undefined;
  viewport?: CaptionDebugBox | undefined;
  viewportContent?: CaptionDebugBox | undefined;
  viewportOffset?: CaptionDebugPoint | undefined;
  videoArea?: CaptionDebugBox | undefined;
  videoAreaContent?: CaptionDebugBox | undefined;
  video?: CaptionDebugBox | undefined;
  videoContent?: CaptionDebugBox | undefined;
  compositionArea: CaptionDebugBox;
  compositionAreaContent: CaptionDebugBox;
  compositionAreaOffset: CaptionDebugPoint;
  frames: CaptionDebugFrame[];
}

export interface CaptionVideoBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CaptionVideoTransform {
  shiftXPercentage: number;
  shiftYPercentage: number;
  fitPositionXPercentage: number;
  fitPositionYPercentage: number;
  resizeMode: CompositionAreaVideoResizeMode;
  canvasBackgroundPaint: Paint;
  cornerGeometry?: ResolvedCornerGeometry | undefined;
  /** Rounded mask for the outer viewport frame. */
  viewportCornerGeometry?: ResolvedCornerGeometry | undefined;
  /** Rounded mask for a clipped VideoArea containing the source video. */
  videoAreaCornerGeometry?: ResolvedCornerGeometry | undefined;
  /** Gaussian blur from the viewport effect stack, in output pixels. */
  viewportBlurRadius?: number | undefined;
  videoAreaBounds?: CaptionVideoBounds | undefined;
  videoBounds?: CaptionVideoBounds | undefined;
}
