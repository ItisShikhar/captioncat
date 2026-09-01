import { Canvas } from '#platform/canvas.js';
import type {
    CaptionDebugFrame,
    CaptionDebugLayout,
  CaptionFrameCrop,
  CaptionFrameSize,
  CaptionImageInfo,
  CaptionRenderPlacement,
    CaptionVideoTransform,
  } from '../render-types';
import type { ResolvedCornerGeometry } from '../../types/captions';
import { resolveFontFamilyEntry } from '#platform/font-loader.js';
import { acquireCanvas, releaseCanvas } from '../../utilities/canvas-pool';
import {
  type Component,
  AnimationComponent,
  BackgroundStyle,
  BorderRadius,
  Font,
  HorizontalSpacer,
  Layout,
  isSpacerAnimationTarget,
  Spacer,
  Text,
  VerticalSpacer,
} from './components';
import { buildEcsTree, type EcsEntityNode } from './ecs-preset';
import { imageAssetsInScene, preloadFlowImageMeasurements, preloadImageAssets } from './assets';
import { cursorAssetsInScene } from '#platform/cursor-assets.js';
import { resolveInsets, type Insets } from './insets';
import {
  type Alignment,
  alignOf,
  contentBoxFromArea,
  captureLayoutSnapshot,
  type HorizontalAlign,
  type LayoutOptions,
  type LayoutSnapshot,
  layoutScene,
  resolveFlowImageSize,
  resolveAreaBox,
  stackPagesVertically,
  type VerticalAlign,
} from './layout-engine';
import {
  CompositionArea,
  ImageFlowEntity,
  Page,
  type PhysicalEntity,
  Row,
  Video,
  VideoArea,
  Viewport,
  Word,
} from './physical-entities';
import { type Property, staticProperty } from './property';
import {
    accumulateContentBounds,
    type BoundsAccumulator,
    collectDebugFrame,
    collectDebugTransforms,
    type DebugBox,
    emptyBounds,
} from './render-frame';
import { renderScene } from './scene-render';
import {
  type Box,
  type CaptionEventTrigger,
  defaultResolveContext,
  type ImageSequencerTriggerState,
  type   ResolveContext,
  toVec2,
  type Vector2,
} from './types';
import { solidPaint, type Paint } from './paint';
import { validateStateWindowConfig, type StateWindowConfig } from './state-window';
import { createTransitionRuntime } from './transitions';
import { createFollowRuntime } from './follow';
import type {
  CaptionFlowLayoutMode,
  PreviewWordStateLayout,
  RenderPreviewStart,
  WordState,
} from '../preview-types';
import { fitPageToChildren, instantiateScene, instantiateStackedScene } from './word-instancer';
import { animationDurationForEntity, animationHasEnabledTarget } from './animation';
import { applyLayoutMotion, LayoutMotionRuntime } from './layout-motion-runtime';
import type { BlendMode } from './effects/blend-mode';
import {
  allocateCaptionPages,
  diagnoseCaptionPageOverflow,
  minimumCaptionPageSize,
  resolveCaptionLayoutPolicy,
  segmentCaptionWords,
  validateCaptionLayoutForPage,
  type CaptionLayoutOverride,
  type CaptionLayoutDiagnostic,
  type CaptionLayoutPolicy,
  type CaptionTimedWord,
  DEFAULT_CAPTION_HOLD_THRESHOLD_SECONDS,
  DEFAULT_PAGE_BREAK_PAUSE_THRESHOLD_SECONDS,
  DEFAULT_ROW_BREAK_PAUSE_THRESHOLD_SECONDS,
  pauseSpacingExtraForBoundary,
  resolveLongWordThreshold,
} from './caption-layout';
import {
  advanceImageSequencerFramePosition,
  ImageSequencer,
  type ImageSequencerAdvance,
  type ImageSequencerTrigger,
} from './components/image-sequencer';
import { resolveTextDirection, type ResolvedTextDirection } from './text-direction';
import { minimumWrappedWordWidth, wrapOversizedCaptionRows } from './word-wrapping';
import { resolveRowFontScale, rowFitWidthForWrapping } from './row-fitting';
import { RANDOMIZER_APPEARANCE_PAGE_STRIDE } from './randomizer';

/**
 * ECS-native caption pipeline: turns a transcript + an ECS-native preset design
 * into the exact contract the ffmpeg/skia compositors consume
 * (`{captionInfos, allImageBuffers, allBlendModeLayers, frameSize, placement}`).
 * It is the modern
 * replacement for the former renderer: grouping/paging/timing are read from
 * the entity tree (options/text components). Emits a STABLE cropped overlay: a
 * single crop box is measured across every caption (union of all content +
 * enabled area/bar backgrounds) and every frame uses that same crop offset and
 * the same absolute placement. So the crop window never changes between captions
 * -- letters stay put while scrubbing -- but the PNGs stay small (cropped, not
 * full-frame). This is the fix for the old tight-crop, which re-centered each
 * word in a per-event box and made content jump.
 */

const CAPTION_VIEWPORT_UNITS = 1000;
export const LONG_WORD_THRESHOLD = 0.75;
const BASE_ANIMATION_DURATION_SECONDS = 0.125;
const SETTLE_STREAK_FRAMES = 2;
const CAPTION_EVENT_TIMESTAMP_EPSILON_SECONDS = 1e-9;
const CAPTION_END_COLLISION_OFFSET_SECONDS = 0.001;
const IMAGE_SEQUENCER_EVENT_BOUNDARY_EPSILON_SECONDS = CAPTION_EVENT_TIMESTAMP_EPSILON_SECONDS;
/** Extra composition-unit margin around the global crop box (rotation/AA slack). */
const CROP_SAFETY_PADDING = 8;
/** Vertical gap between the independent pages in the stacked Word State Preview. */
const STACKED_WORD_STATE_PAGE_GAP = 64;
/** Keep animated transform bounds accurate without sampling long holds frame by frame. */
const MAX_TRANSFORM_BOUNDS_SAMPLES = 64;

function isSpatialTransformTarget(target: string): boolean {
  return (
    target === 'Transform.position' ||
    target.startsWith('Transform.position.') ||
    target === 'Transform.scale' ||
    target.startsWith('Transform.scale.') ||
    target === 'Transform.rotation'
  );
}

export interface WordTimestamps {
  words: string[];
  word_start_times_seconds: number[];
  word_end_times_seconds: number[];
  break_before?: boolean[];
  cue_indices?: number[];
}

export type EcsPipelineStart = RenderPreviewStart;

export interface EcsPipelineFrame {
  frameIndex: number;
  buffer: Buffer;
  width: number;
  height: number;
  blendModeLayers: EcsPipelineBlendModeLayer[];
  debugFrame?: CaptionDebugFrame;
}

export interface EcsPipelineBlendModeLayer {
  mode: BlendMode;
  buffer: Buffer;
  width: number;
  height: number;
}

export interface EcsPipelineCanvasFrame {
  frameIndex: number;
  canvas: Canvas;
  width: number;
  height: number;
  blendModeLayers: EcsPipelineBlendModeLayer[];
  debugFrame?: CaptionDebugFrame;
  hasAlpha: boolean;
  opaquePixelCount: number;
  alphaBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface EcsPipelineFrameRepeat {
  frameIndex: number;
  sourceFrameIndex: number;
  width: number;
  height: number;
}

export interface EcsPipelineInput {
  videoResolution: { width: number; height: number };
  timestamps: WordTimestamps;
  design: EcsEntityNode;
  fps: number;
  /** Preview playback generation used to scope non-deterministic randomizers. */
  randomizerAppearanceIndex?: number;
  /** Flow layout policy for each page. Stable layout is the default. */
  layoutMode?: CaptionFlowLayoutMode;
  stateWindow: StateWindowConfig;
  captionLayout?: CaptionLayoutPolicy | CaptionLayoutOverride;
  captionScale?: number;
  language?: string;
  /** Render one static scene per page with every word assigned this role. */
  previewWordState?: WordState;
  /** Render every word-state page at once in a vertical stack. */
  previewWordStateLayout?: PreviewWordStateLayout;
  /** Fit the preview Page to its children instead of the authored parent size. */
  fitPageToChildren?: boolean;
  /** Allow editor previews to render content outside parent clips and composition bounds. */
  allowContentOverflow?: boolean;
  /** Skip authored Layout Motion when a caller needs a static full-page snapshot. */
  disableLayoutMotion?: boolean;
  longWordThreshold?: number;
  captionHoldThresholdSeconds?: number;
  /**
 * When true, additionally emit `debugLayout`: structural + per-frame
 * Composition Area/Page/Row/Word geometry for editor debug overlays. Adds a
 * small per-frame cost (one extra tree walk), so production leaves it off.
 */
  debug?: boolean;
  /** Keep every frame in the returned output. Streaming preview callers can disable this. */
  collectFrames?: boolean;
  /**
   * Stop after this zero-based frame index. The default renders the complete
   * sequence. Use this only when a caller needs a finite prefix of the output.
   */
  stopAfterFrameIndex?: number;
  /** Emit isolated Blend Mode layers for compositing against a video frame. */
  collectBlendModeLayers?: boolean;
  /** Called after the stable frame geometry is known and before frame generation starts. */
  onStart?: (metadata: EcsPipelineStart) => void;
  /** Called after each frame is generated. */
  onFrame?: (frame: EcsPipelineFrame) => void;
  /** Called with the rendered canvas for browser workers that can transfer it as an ImageBitmap. */
  onCanvasFrame?: (frame: EcsPipelineCanvasFrame) => void;
  /** Called when a rendered frame can reuse an earlier transferred canvas frame. */
  onFrameRepeat?: (frame: EcsPipelineFrameRepeat) => void;
  /** Stops a streaming render when a newer request supersedes it. */
  isCancelled?: () => boolean;
}

export {
  CAPTION_FLOW_LAYOUT_MODES,
  PREVIEW_WORD_STATE_LAYOUTS,
} from '../preview-types';
export type {
  CaptionFlowLayoutMode,
  PreviewWordStateLayout,
  RenderPreviewStart,
  WordState,
} from '../preview-types';

export interface EcsPipelineOutput {
  captionInfos: CaptionImageInfo[];
  allImageBuffers: Buffer[];
  allBlendModeLayers: EcsPipelineBlendModeLayer[][];
  frameSize: CaptionFrameSize;
  placement: CaptionRenderPlacement;
  /** Stable compact-preview crop, in pixels relative to the rendered frame. */
  stablePageCrop?: CaptionFrameCrop;
  compositionAreaImage?: Buffer | undefined;
  /** Optional source-video corner/backdrop metadata for the compositor. */
  videoTransform?: CaptionVideoTransform | undefined;
  /** Editor debug geometry - present only when `input.debug` is true. */
  debugLayout?: CaptionDebugLayout;
  /** Deterministic policy diagnostics for layouts that exceed definite bounds. */
  captionLayoutDiagnostics?: CaptionLayoutDiagnostic[];
}

function throwIfCancelled(input: EcsPipelineInput): void {
  if (input.isCancelled?.()) throw new Error('Preview render cancelled.');
}

async function yieldStreamingFrame(input: EcsPipelineInput): Promise<void> {
  if (!input.onFrame && !input.onCanvasFrame && !input.onFrameRepeat && !input.isCancelled) return;
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  throwIfCancelled(input);
}

function summarizeAlpha(
  buffer: Buffer,
  width: number,
  height: number,
  includeBounds: boolean,
): Pick<EcsPipelineCanvasFrame, 'hasAlpha' | 'opaquePixelCount' | 'alphaBounds'> {
  let hasAlpha = false;
  let opaquePixelCount = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      const alpha = buffer[rowOffset + x * 4 + 3];
      if (alpha === 0) continue;
      hasAlpha = true;
      if (alpha >= 224 && opaquePixelCount < 8) opaquePixelCount += 1;
      if (includeBounds && alpha > 10) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
      if (!includeBounds && opaquePixelCount >= 8) {
        return { hasAlpha, opaquePixelCount };
      }
    }
  }

  return {
    hasAlpha,
    opaquePixelCount,
    ...(maxX >= minX && maxY >= minY
      ? { alphaBounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } }
      : {}),
  };
}

type TimedWord = CaptionTimedWord;

/** A settled resolve instant: transitions/bursts complete, static base held. */
function settledContext(textDirection: ResolvedTextDirection = 'ltr'): ResolveContext {
  return defaultResolveContext({ progress: 1, elapsedSeconds: 1e6, wordDurationSeconds: 1, textDirection });
}

/** Depth-first visit of a component and its nested components. */
function forEachComponent(
  component: Component,
  visit: (component: Component, ancestors: readonly Component[]) => void,
  ancestors: readonly Component[] = [],
): void {
  visit(component, ancestors);
  const nextAncestors = [...ancestors, component];
  for (const child of component.components) forEachComponent(child, visit, nextAncestors);
}

/** Every Font component anywhere in the tree (nested under Text). */
function collectFonts(root: PhysicalEntity): Font[] {
  const fonts: Font[] = [];
  root.traverse((entity) => {
    for (const component of entity.components) {
      forEachComponent(component, (candidate) => {
        if (candidate instanceof Font) fonts.push(candidate);
      });
    }
  });
  return fonts;
}

/** Resolve + register every font family declared in the tree (Google/local/system). */
async function resolveEcsFonts(root: PhysicalEntity, isCancelled?: () => boolean): Promise<void> {
  for (const font of collectFonts(root)) {
    if (isCancelled?.()) throw new Error('Preview render cancelled.');
    const fontFamilies = [
      {
        property: 'family',
        value: font.getProp<string | string[]>('family')?.base,
        weight: font.getProp('weight')?.base,
        style: font.getProp('style')?.base,
      },
      {
        property: 'emojis.family',
        value: font.getProp<string | string[]>('emojis.family')?.base,
        weight: 400,
        style: 'normal',
      },
    ];
    for (const { property, value, weight, style } of fontFamilies) {
      const entries = Array.isArray(value) ? value : value ? [String(value)] : [];
      if (entries.length === 0) continue;
      const resolved: string[] = [];
      for (const entry of entries) {
        resolved.push(...(await resolveFontFamilyEntry(String(entry), { weight, style })));
        if (isCancelled?.()) throw new Error('Preview render cancelled.');
      }
      if (resolved.length > 0) {
        font.props.set(property, staticProperty('fontFamily', resolved) as unknown as Property<unknown>);
      }
    }
  }
}

function pageOf(root: CompositionArea | undefined): Page | undefined {
  return root?.children.find((child): child is Page => child instanceof Page);
}

function rowOf(page: Page | undefined): Row | undefined {
  const rows = page?.children.filter((child): child is Row => child instanceof Row) ?? [];
  return rows.find((row) => row.id === 'row:default') ?? rows[0];
}

function pageFlowImages(page: Page | undefined): ImageFlowEntity[] {
  const context = settledContext();
  return (
    page?.children.filter(
      (child): child is ImageFlowEntity =>
        child instanceof ImageFlowEntity &&
        child.transform?.positioning(context) !== 'absolute' &&
        (!child.flowCollapsed || child.flowCollapseMode === 'reserve'),
    ) ?? []
  );
}

function resolvedPageFlowGap(page: Page | undefined, contentWidth: number): number {
  const spacer = page?.components.find((component): component is HorizontalSpacer => component instanceof HorizontalSpacer);
  return spacer ? spacer.gap(settledContext(), contentWidth) : 0;
}

/** Extra per-word gap contributed by a Row's HorizontalSpacer (replaces the removed page `wordSpacingOffset`). */
function rowWordSpacerExtra(row: Row | undefined, contentWidth: number): number {
  const spacer = row?.components.find((component): component is HorizontalSpacer => component instanceof HorizontalSpacer);
  return spacer ? spacer.gap(settledContext(), contentWidth) : 0;
}

function hasAnimatedSpacer(root: PhysicalEntity): boolean {
  const settled = settledContext();
  let hasSpacer = false;
  let hasSpacerAnimation = false;
  root.traverse((entity) => {
    for (const component of entity.components) {
      forEachComponent(component, (candidate, ancestors) => {
        if (candidate instanceof Spacer) {
          hasSpacer = true;
          return;
        }
        if (
          candidate instanceof AnimationComponent &&
          ancestors.every((ancestor) => ancestor.isEnabled(settled)) &&
          candidate.isEnabled(settled) &&
          candidate.definition.tracks.some(
            (track) => track.enabled && isSpacerAnimationTarget(track.target),
          )
        ) {
          hasSpacerAnimation = true;
        }
      });
    }
  });
  return hasSpacer && hasSpacerAnimation;
}

function resolvedPagePadding(page: Page | undefined): Insets {
  const context = settledContext();
  const padding = resolveInsets(
    (path, rctx) => page?.layout?.getProp(path)?.resolve(rctx),
    'padding',
    context,
  );
  return {
    top: Math.max(0, padding.top),
    right: Math.max(0, padding.right),
    bottom: Math.max(0, padding.bottom),
    left: Math.max(0, padding.left),
  };
}

function pagePaddingY(page: Page | undefined): Pick<Insets, 'top' | 'bottom'> {
  const padding = resolvedPagePadding(page);
  return { top: padding.top, bottom: padding.bottom };
}

function pageHeightResolution(page: Page | undefined, availableHeight: number): { definite: boolean; height?: number } {
  const transform = page?.transform;
  if (!transform) return { definite: false };
  const mode = transform.heightMode(settledContext());
  if (mode === 'fitParent') return { definite: true, height: Math.max(1, availableHeight) };
  if (mode === 'custom') {
    const authored = transform.resolvedAuthoredDimension('y', settledContext(), availableHeight);
    if (authored !== undefined && authored > 0) return { definite: true, height: authored };
  }
  return { definite: false };
}

function pageWidthForCaptionPlanning(page: Page | undefined, availableWidth: number): number | undefined {
  const transform = page?.transform;
  if (!transform) return undefined;
  const context = settledContext();
  const mode = transform.widthMode(context);
  if (mode === 'fitParent') return Math.max(1, availableWidth);
  if (mode !== 'custom') return undefined;
  const authored = transform.resolvedAuthoredDimension('x', context, availableWidth);
  return authored !== undefined && authored > 0 ? authored : undefined;
}

function applyCaptionLayoutPageSizing(page: Page | undefined, policy: CaptionLayoutPolicy): void {
  const transform = page?.transform;
  if (!page || !transform) return;

  const settled = settledContext();
  const widthMode = transform.widthMode(settled);
  const heightMode = transform.heightMode(settled);
  const widthManaged =
    widthMode === 'custom' && transform.authoredDimension('x', settled) === undefined;
  const heightManaged =
    policy.rowsPerPage.mode === 'fixed' &&
    ((heightMode === 'custom' && transform.authoredDimension('y', settled) === undefined) || heightMode === 'fitChildren');

  if (widthManaged) {
    page.captionLayoutManagedWidth = true;
    transform.props.set('widthMode', staticProperty('string', 'fitChildren'));
  }
  if (heightManaged) {
    page.captionLayoutManagedHeight = true;
    transform.props.set('heightMode', staticProperty('string', 'fitChildren'));
  }
}

function pageRowSpacing(page: Page | undefined, pageExtent: number): number {
  const spacer = page?.components.find((component): component is VerticalSpacer => component instanceof VerticalSpacer);
  return spacer ? spacer.gap(settledContext(), pageExtent) : 0;
}

function rowSpacingExtrasFor(
  rows: readonly CaptionTimedWord[][],
  policy: CaptionLayoutPolicy,
): ReadonlyMap<number, number> {
  const extras = new Map<number, number>();
  for (let index = 1; index < rows.length; index += 1) {
    const extra = pauseSpacingExtraForBoundary(
      rows[index - 1]?.at(-1),
      rows[index]?.[0],
      policy.breaking.pauseSpacing,
    );
    if (extra > 0) extras.set(index, extra);
  }
  return extras;
}

function alignmentOf(
  entity: PhysicalEntity | undefined,
  textDirection: ResolvedTextDirection,
): { horizontal: HorizontalAlign; vertical: VerticalAlign } {
  const layout = entity?.components.find((component): component is Layout => component instanceof Layout);
  return alignOf(layout, settledContext(textDirection), { horizontal: 'center', vertical: 'bottom' });
}

function getFlattenedIndex(matrix: TimedWord[][], rowIndex: number, colIndex: number): number {
  let offset = 0;
  for (let previousRowIndex = 0; previousRowIndex < rowIndex; previousRowIndex++) {
    offset += matrix[previousRowIndex].length;
  }
  return offset + colIndex;
}

interface WordEvent {
  entry: TimedWord;
  currentIndex: number;
  duration: number;
  rowDurationSeconds?: number;
  numFrames: number;
  isLastWordInGroup: boolean;
  isLastWordOnPage: boolean;
}

interface PagePlan {
  rowGlyphs: string[][];
  rowEntries: CaptionTimedWord[][];
  logicalWordCount: number;
  events: WordEvent[];
  wordIndexOffset: number;
  rowIndexOffset: number;
  rowStartTimestampSeconds: number[];
  stackedPageRows?: string[][][];
  stackedPageEntries?: CaptionTimedWord[][][];
  stackedWordIndexOffsets?: number[];
  stackedRowIndexOffsets?: number[];
  stackedLogicalWordCounts?: number[];
}

type ImageSequencerTriggerTimeline = Readonly<Record<ImageSequencerTrigger, readonly number[]>>;

function sortedTimestamps(timestamps: readonly number[]): number[] {
  return timestamps.filter(Number.isFinite).sort((a, b) => a - b);
}

function hasTimestampCollision(timestamp: number, sortedCandidates: readonly number[]): boolean {
  for (const candidate of sortedCandidates) {
    if (candidate > timestamp + CAPTION_EVENT_TIMESTAMP_EPSILON_SECONDS) return false;
    if (Math.abs(candidate - timestamp) <= CAPTION_EVENT_TIMESTAMP_EPSILON_SECONDS) return true;
  }
  return false;
}

/** Preserve a close interval when an end and a following start share a timestamp. */
export function offsetCollidingEndTimestamps(
  endTimestamps: readonly number[],
  startTimestamps: readonly number[],
): number[] {
  const sortedStartTimestamps = sortedTimestamps(startTimestamps);
  return endTimestamps.map((timestamp) =>
    hasTimestampCollision(timestamp, sortedStartTimestamps)
      ? timestamp - CAPTION_END_COLLISION_OFFSET_SECONDS
      : timestamp,
  );
}

function timestampRange(entries: readonly CaptionTimedWord[]): { start: number; end: number } | undefined {
  if (entries.length === 0) return undefined;
  return {
    start: Math.min(...entries.map((entry) => entry.startTimestamp)),
    end: Math.max(...entries.map((entry) => entry.visualEndTimestamp)),
  };
}

function imageSequencerTriggerTimeline(pages: readonly PagePlan[]): ImageSequencerTriggerTimeline {
  const timestamps: Record<ImageSequencerTrigger, number[]> = {
    currentWordStart: [],
    currentWordEnd: [],
    currentRowStart: [],
    currentRowEnd: [],
    currentPageStart: [],
    currentPageEnd: [],
  };

  for (const plan of pages) {
    for (const event of plan.events) {
      timestamps.currentWordStart.push(event.entry.startTimestamp);
      timestamps.currentWordEnd.push(event.entry.visualEndTimestamp);
    }
    for (const row of plan.rowEntries) {
      const range = timestampRange(row);
      if (!range) continue;
      timestamps.currentRowStart.push(range.start);
      timestamps.currentRowEnd.push(range.end);
    }
    const pageRange = timestampRange(plan.events.map((event) => event.entry));
    if (pageRange) {
      timestamps.currentPageStart.push(pageRange.start);
      timestamps.currentPageEnd.push(pageRange.end);
    }
  }

  const startTimestamps = [
    ...timestamps.currentWordStart,
    ...timestamps.currentRowStart,
    ...timestamps.currentPageStart,
  ];
  return {
    currentWordStart: sortedTimestamps(timestamps.currentWordStart),
    currentWordEnd: sortedTimestamps(offsetCollidingEndTimestamps(timestamps.currentWordEnd, startTimestamps)),
    currentRowStart: sortedTimestamps(timestamps.currentRowStart),
    currentRowEnd: sortedTimestamps(offsetCollidingEndTimestamps(timestamps.currentRowEnd, startTimestamps)),
    currentPageStart: sortedTimestamps(timestamps.currentPageStart),
    currentPageEnd: sortedTimestamps(offsetCollidingEndTimestamps(timestamps.currentPageEnd, startTimestamps)),
  };
}

function hasCaptionTriggerWithinEvent(
  timeline: ImageSequencerTriggerTimeline,
  triggerTimestampSeconds: number,
  durationSeconds: number,
  fps: number,
): boolean {
  const eventEndTimestampSeconds =
    triggerTimestampSeconds + Math.max(durationSeconds, 1 / Math.max(1, fps));
  return Object.values(timeline).some((timestamps) =>
    timestamps.some(
      (timestamp) =>
        timestamp > triggerTimestampSeconds + CAPTION_EVENT_TIMESTAMP_EPSILON_SECONDS &&
        timestamp <= eventEndTimestampSeconds + CAPTION_EVENT_TIMESTAMP_EPSILON_SECONDS,
    ),
  );
}

function imageSequencerTriggerState(
  sequencer: ImageSequencer,
  rctx: ResolveContext,
  timeline: ImageSequencerTriggerTimeline,
): ImageSequencerTriggerState {
  const triggerEvents = sequencer
    .triggerRules(rctx)
    .flatMap((rule, ruleIndex) =>
      timeline[rule.trigger].map((timestamp) => ({ timestamp, advance: rule.advance, ruleIndex })),
    )
    .sort((first, second) => first.timestamp - second.timestamp || first.ruleIndex - second.ruleIndex);
  // Keep the current event below the next event boundary so an end trigger
  // can render before a colliding start trigger takes effect.
  const rawCurrentTimestamp = rctx.triggerTimestampSeconds + Math.max(0, rctx.elapsedSeconds);
  const nextTriggerTimestamp =
    rctx.nextTriggerIntervalSeconds !== undefined &&
    Number.isFinite(rctx.nextTriggerIntervalSeconds) &&
    rctx.nextTriggerIntervalSeconds > IMAGE_SEQUENCER_EVENT_BOUNDARY_EPSILON_SECONDS
      ? rctx.triggerTimestampSeconds + rctx.nextTriggerIntervalSeconds
      : undefined;
  const currentTimestamp =
    nextTriggerTimestamp === undefined
      ? rawCurrentTimestamp
      : Math.min(rawCurrentTimestamp, nextTriggerTimestamp - 2 * IMAGE_SEQUENCER_EVENT_BOUNDARY_EPSILON_SECONDS);
  let index = -1;
  let latestTimestamp: number | undefined;
  let framePosition = 0;
  let advance: ImageSequencerAdvance = 'next';
  const frameCount = sequencer.frames(rctx).length;
  for (const event of triggerEvents) {
    if (event.timestamp > currentTimestamp + CAPTION_EVENT_TIMESTAMP_EPSILON_SECONDS) break;
    index += 1;
    latestTimestamp = event.timestamp;
    advance = event.advance;
    framePosition = advanceImageSequencerFramePosition(framePosition, advance, frameCount, index);
  }
  return {
    index: Math.max(0, index),
    elapsedSeconds: latestTimestamp === undefined ? 0 : Math.max(0, currentTimestamp - latestTimestamp),
    framePosition,
    advance,
  };
}

function randomizerTriggerIndexes(
  rctx: ResolveContext,
  timeline: ImageSequencerTriggerTimeline,
): Readonly<Record<CaptionEventTrigger, number>> {
  const currentTimestamp = rctx.triggerTimestampSeconds + Math.max(0, rctx.elapsedSeconds);
  const indexFor = (trigger: CaptionEventTrigger): number => {
    let index = -1;
    for (const timestamp of timeline[trigger]) {
      if (timestamp > currentTimestamp + CAPTION_EVENT_TIMESTAMP_EPSILON_SECONDS) break;
      index += 1;
    }
    return index;
  };
  return {
    currentWordStart: indexFor('currentWordStart'),
    currentWordEnd: indexFor('currentWordEnd'),
    currentRowStart: indexFor('currentRowStart'),
    currentRowEnd: indexFor('currentRowEnd'),
    currentPageStart: indexFor('currentPageStart'),
    currentPageEnd: indexFor('currentPageEnd'),
  };
}

function imageSequencerTriggerStates(
  scene: PhysicalEntity,
  rctx: ResolveContext,
  timeline: ImageSequencerTriggerTimeline,
): ReadonlyMap<object, ImageSequencerTriggerState> {
  const states = new Map<object, ImageSequencerTriggerState>();
  scene.traverse((entity) => {
    for (const component of entity.components) {
      if (component instanceof ImageSequencer) {
        states.set(component, imageSequencerTriggerState(component, rctx, timeline));
      }
    }
  });
  return states;
}

/** Allocate groups into pages and enumerate per-word current events. */
function planPages(
  groups: TimedWord[][],
  options: {
    policy: CaptionLayoutPolicy;
    pageHeight?: number;
    pagePadding?: Pick<Insets, 'top' | 'bottom'>;
    rowSpacing?: number;
    rowHeight?: (row: TimedWord[]) => number;
    longWordThreshold: number;
    pageBreakPauseThresholdSeconds: number;
    fps: number;
  },
): PagePlan[] {
  const pageGroups = allocateCaptionPages(groups, options);
  const { fps } = options;
  let nextWordIndexOffset = 0;
  let rowIndexOffset = 0;
  return pageGroups.map((pageRows) => {
    const rowGlyphs = pageRows.map((pageRow) => pageRow.map((entry) => entry.word));
    const logicalIndexes = pageRows
      .flat()
      .map((entry, index) => entry.logicalWordIndex ?? index);
    const pageWordIndexOffset = logicalIndexes.length > 0
      ? Math.min(...logicalIndexes)
      : nextWordIndexOffset;
    const logicalWordCount = new Set(logicalIndexes).size;
    const events: WordEvent[] = [];
    const rowStartTimestampSeconds = pageRows.map((row) =>
      row.length > 0 ? Math.min(...row.map((entry) => entry.startTimestamp)) : 0,
    );
    const seenLogicalIndexes = new Set<number>();
    const lastLogicalIndex = logicalIndexes.length > 0 ? Math.max(...logicalIndexes) : undefined;
    for (let r = 0; r < pageRows.length; r++) {
      const row = pageRows[r];
      const rowDurationSeconds =
        row.length > 0
          ? Math.max(
              0,
              Math.max(...row.map((entry) => entry.visualEndTimestamp)) -
                Math.min(...row.map((entry) => entry.startTimestamp)),
            )
          : undefined;
      for (let c = 0; c < pageRows[r].length; c++) {
        const entry = pageRows[r][c];
        const logicalIndex = entry.logicalWordIndex ?? getFlattenedIndex(pageRows, r, c);
        if (seenLogicalIndexes.has(logicalIndex)) continue;
        seenLogicalIndexes.add(logicalIndex);
        const rowLogicalIndexes = row.map((rowEntry, rowEntryIndex) =>
          rowEntry.logicalWordIndex ?? getFlattenedIndex(pageRows, r, rowEntryIndex),
        );
        const rowLastLogicalIndex = Math.max(...rowLogicalIndexes);
        const duration = entry.visualEndTimestamp - entry.startTimestamp;
        events.push({
          entry: {
            ...entry,
            word: entry.sourceWord ?? entry.word,
          },
          currentIndex: logicalIndex - pageWordIndexOffset,
          duration,
          ...(rowDurationSeconds === undefined ? {} : { rowDurationSeconds }),
          numFrames: Math.max(2, Math.ceil(Math.max(duration, BASE_ANIMATION_DURATION_SECONDS) * fps)),
          isLastWordInGroup: logicalIndex === rowLastLogicalIndex,
          isLastWordOnPage: logicalIndex === lastLogicalIndex,
        });
      }
    }
    const plan = {
      rowGlyphs,
      rowEntries: pageRows,
      logicalWordCount,
      events,
      wordIndexOffset: pageWordIndexOffset,
      rowIndexOffset,
      rowStartTimestampSeconds,
    };
    nextWordIndexOffset = Math.max(nextWordIndexOffset, pageWordIndexOffset + logicalWordCount);
    rowIndexOffset += pageRows.length;
    return plan;
  });
}

function transformAnimationSampleTimes(
  root: PhysicalEntity,
  eventDuration: number,
  fps: number,
): number[] {
  const visibleDuration = Math.max(eventDuration, 1 / Math.max(1, fps));
  let hasTransformAnimation = false;
  let samplesAcrossVisibleDuration = false;
  let animationWindow = 0;
  const keyframeTimes: number[] = [];

  root.traverse((entity) => {
    for (const component of entity.components) {
      forEachComponent(component, (candidate) => {
        if (!(candidate instanceof AnimationComponent) || !candidate.definition.enabled) return;
        const transformTracks = candidate.definition.tracks.filter(
          (track) => track.enabled && isSpatialTransformTarget(track.target),
        );
        if (transformTracks.length === 0) return;

        hasTransformAnimation = true;
        animationWindow = Math.max(animationWindow, animationDurationForEntity(entity));
        samplesAcrossVisibleDuration =
          samplesAcrossVisibleDuration ||
          (candidate.definition.phase === 'active' && candidate.definition.playbackMode !== 'once') ||
          candidate.definition.scope !== 'self' ||
          candidate.definition.sequencer.pattern !== 'simultaneous';
        for (const track of transformTracks) {
          for (const keyframe of track.keyframes) {
            keyframeTimes.push(Math.max(0, candidate.definition.delaySeconds) + Math.max(0, keyframe.time));
          }
        }
      });
    }
  });

  if (!hasTransformAnimation) return [];

  const sampleWindow = samplesAcrossVisibleDuration
    ? visibleDuration
    : Math.min(visibleDuration, Math.max(animationWindow, ...keyframeTimes, 0));
  const sampleCount = Math.min(
    MAX_TRANSFORM_BOUNDS_SAMPLES,
    Math.max(1, Math.ceil(sampleWindow * Math.max(1, fps) * 2)),
  );
  const times = new Set<number>([0, sampleWindow]);
  for (let index = 0; index <= sampleCount; index += 1) {
    times.add((sampleWindow * index) / sampleCount);
  }
  for (const keyframeTime of keyframeTimes) {
    if (keyframeTime <= visibleDuration) times.add(Math.min(visibleDuration, keyframeTime));
  }

  return [...times].sort((left, right) => left - right);
}

function previewWordAnimationDuration(template: Viewport, state: WordState): number {
  const page = pageOf(template.compositionArea);
  const row = rowOf(page);
  const word = row?.children.find(
    (child): child is Word => child instanceof Word && child.id === `word:${state}`,
  );
  if (!word) return 0;

  let duration = 0;
  const settled = settledContext();
  word.traverse((entity) => {
    for (const component of entity.components) {
      forEachComponent(component, (candidate, ancestors) => {
        if (
          candidate instanceof AnimationComponent &&
          ancestors.every((ancestor) => ancestor.isEnabled(settled)) &&
          candidate.isEnabled(settled) &&
          animationHasEnabledTarget(candidate.definition, entity, settled)
        ) {
          duration = Math.max(duration, animationDurationForEntity(entity));
        }
      });
    }
  });
  return duration;
}

function timestampDuration(timestamps: WordTimestamps): number {
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  for (const value of timestamps.word_start_times_seconds) {
    if (Number.isFinite(value)) start = Math.min(start, value);
  }
  for (const value of timestamps.word_end_times_seconds) {
    if (Number.isFinite(value)) end = Math.max(end, value);
  }
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : 0;
}

function triggerIntervalForEvent(
  eventIndex: number,
  triggerTimestampSeconds: number,
  previousTriggerTimestampSeconds: number | undefined,
): number | undefined {
  if (previousTriggerTimestampSeconds === undefined) return undefined;

  // A wrapped fragment can start a new Page at the same timestamp as its source
  // word. Do not collapse its Page animation to a zero adaptive duration.
  if (eventIndex === 0 && triggerTimestampSeconds === previousTriggerTimestampSeconds) return undefined;

  return Math.max(0, triggerTimestampSeconds - previousTriggerTimestampSeconds);
}

function staticPreviewPages(pages: PagePlan[], duration: number, fps: number): PagePlan[] {
  return pages.map((plan) => {
    const words = plan.rowGlyphs.flat();
    const startTimestamp = plan.events[0]?.entry.startTimestamp ?? 0;
    return {
      rowGlyphs: plan.rowGlyphs,
      rowEntries: plan.rowEntries,
      logicalWordCount: plan.logicalWordCount,
      wordIndexOffset: plan.wordIndexOffset,
      rowIndexOffset: plan.rowIndexOffset,
      rowStartTimestampSeconds: plan.rowStartTimestampSeconds,
      events: [
        {
          entry: {
            word: words.join(' '),
            startTimestamp,
            visualEndTimestamp: startTimestamp + duration,
          },
          currentIndex: 0,
          duration,
          rowDurationSeconds: duration,
          numFrames: Math.max(2, Math.ceil(Math.max(duration, BASE_ANIMATION_DURATION_SECONDS) * fps)),
          isLastWordInGroup: true,
          isLastWordOnPage: true,
        },
      ],
    };
  });
}

function staticStackedPreviewPage(pages: PagePlan[], duration: number, fps: number): PagePlan {
  const words = pages.flatMap((plan) => plan.rowGlyphs.flat());
  const logicalEntries = new Map<number, CaptionTimedWord[]>();
  for (const plan of pages) {
    for (const row of plan.rowEntries) {
      for (const entry of row) {
        const logicalIndex = entry.logicalWordIndex ?? plan.wordIndexOffset + logicalEntries.size;
        const existing = logicalEntries.get(logicalIndex);
        if (existing) existing.push(entry);
        else logicalEntries.set(logicalIndex, [entry]);
      }
    }
  }
  const entryGroups = [...logicalEntries.values()];
  const pageRows = entryGroups.length > 0
    ? entryGroups.map((entries) => entries.map((entry) => [entry.word]))
    : words.length > 0
      ? words.map((word) => [[word]])
      : [[[]]];
  const stackedPageEntries = entryGroups.length > 0
    ? entryGroups.map((entries) => entries.map((entry) => [entry]))
    : undefined;
  const stackedWordIndexOffsets = entryGroups.length > 0
    ? entryGroups.map((entries) => entries[0]?.logicalWordIndex ?? 0)
    : pages.flatMap((plan) => plan.rowGlyphs.flat().map((_, index) => plan.wordIndexOffset + index));
  const stackedRowIndexOffsets = pageRows.map((rows, index) =>
    index === 0 ? 0 : pageRows.slice(0, index).reduce((total, previous) => total + previous.length, 0),
  );
  const stackedLogicalWordCounts = pageRows.map(() => 1);
  const startTimestamp = pages[0]?.events[0]?.entry.startTimestamp ?? 0;
  return {
    rowGlyphs: [],
    rowEntries: [],
    logicalWordCount: 0,
    wordIndexOffset: 0,
    rowIndexOffset: 0,
    rowStartTimestampSeconds: pages.flatMap((plan) => plan.rowGlyphs.map(() => startTimestamp)),
    stackedWordIndexOffsets,
    stackedRowIndexOffsets,
    ...(stackedPageEntries === undefined ? {} : { stackedPageEntries }),
    stackedLogicalWordCounts,
    stackedPageRows: pageRows,
    events: [
      {
        entry: {
          word: words.join(' '),
          startTimestamp,
          visualEndTimestamp: startTimestamp + duration,
        },
        currentIndex: 0,
        duration,
        rowDurationSeconds: duration,
        numFrames: Math.max(2, Math.ceil(Math.max(duration, BASE_ANIMATION_DURATION_SECONDS) * fps)),
        isLastWordInGroup: true,
        isLastWordOnPage: true,
      },
    ],
  };
}

/** True if the entity has an enabled BackgroundStyle component. */
function backgroundEnabled(entity: PhysicalEntity | undefined, rctx: ResolveContext): boolean {
  if (!entity) return false;
  return entity
    .getComponentsByType('backgroundStyle')
    .some((bg) => bg.getProp<boolean>('enabled')?.resolve(rctx) !== false);
}

/** Union an axis-aligned canvas box into the running crop accumulator. */
function extendBounds(acc: BoundsAccumulator, box: Box): void {
  acc.minX = Math.min(acc.minX, box.x);
  acc.minY = Math.min(acc.minY, box.y);
  acc.maxX = Math.max(acc.maxX, box.x + box.width);
  acc.maxY = Math.max(acc.maxY, box.y + box.height);
}

function extendDebugBounds(acc: BoundsAccumulator, box: DebugBox): void {
  acc.minX = Math.min(acc.minX, box.left);
  acc.minY = Math.min(acc.minY, box.top);
  acc.maxX = Math.max(acc.maxX, box.right);
  acc.maxY = Math.max(acc.maxY, box.bottom);
}

function toPixelCrop(
  bounds: BoundsAccumulator,
  crop: Box,
  scale: number,
  frameSize: CaptionFrameSize,
): CaptionFrameCrop | undefined {
  if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.minY)) return undefined;
  const x = Math.max(0, Math.floor((bounds.minX - crop.x) * scale));
  const y = Math.max(0, Math.floor((bounds.minY - crop.y) * scale));
  const right = Math.min(frameSize.width, Math.ceil((bounds.maxX - crop.x) * scale));
  const bottom = Math.min(frameSize.height, Math.ceil((bounds.maxY - crop.y) * scale));
  if (right <= x || bottom <= y) return undefined;
  return { x, y, width: right - x, height: bottom - y };
}

/** A composition-space Box as a debug rect (left/top/right/bottom). */
function boxToDebug(box: Box): DebugBox {
  return { left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height };
}

/** An entity's own configured Transform position (composition units), or {0,0} without one. */
function transformOffsetOf(entity: PhysicalEntity | undefined, rctx: ResolveContext): { x: number; y: number } {
  const value = entity?.transform?.getProp('position')?.resolve(rctx);
  return value && typeof value === 'object' ? toVec2(value) : { x: 0, y: 0 };
}

/** The compositionArea's own configured Transform position (composition units). */
function areaOffsetOf(root: Viewport, rctx: ResolveContext): { x: number; y: number } {
  return transformOffsetOf(root.compositionArea, rctx);
}

function hasRoundedCorners(geometry: ResolvedCornerGeometry | undefined): boolean {
  const radii = geometry?.radii;
  if (!radii) return false;
  return radii.topLeft > 0 || radii.topRight > 0 || radii.bottomRight > 0 || radii.bottomLeft > 0;
}

function resolveViewportBackdropTransform(
  viewport: Viewport,
  scale: number,
  rctx: ResolveContext,
): Pick<CaptionVideoTransform, 'canvasBackgroundPaint' | 'viewportCornerGeometry'> | undefined {
  const background = viewport.getComponent<BackgroundStyle>('backgroundStyle');
  const borderRadius = viewport.getComponent<BorderRadius>('borderRadius');
  const backgroundEnabled = background?.getProp<boolean>('enabled')?.resolve(rctx) !== false;
  const borderRadiusEnabled = borderRadius?.getProp<boolean>('enabled')?.resolve(rctx) !== false;

  const fillValue = backgroundEnabled ? background?.getProp<Paint>('fill')?.resolve(rctx) : undefined;
  const canvasBackgroundPaint = fillValue ?? solidPaint('rgba(0,0,0,0)');
  const backgroundCornerGeometry =
    background && background.shape(rctx) === 'pill' && viewport.box
      ? background.cornerGeometryForBox(rctx, viewport.box)
      : background?.cornerGeometry(rctx);
  const cornerGeometry =
    (borderRadiusEnabled ? borderRadius?.cornerGeometry(rctx) : undefined) ?? backgroundCornerGeometry;
  const rounded = hasRoundedCorners(cornerGeometry);
  const scaledCornerGeometry = cornerGeometry && rounded ? scaleCornerGeometry(cornerGeometry, scale) : undefined;
  if (!background || !backgroundEnabled) {
    if (!rounded) return undefined;
  } else if (!fillValue && !rounded) {
    return undefined;
  }

  return {
    canvasBackgroundPaint,
    ...(scaledCornerGeometry ? { viewportCornerGeometry: scaledCornerGeometry } : {}),
  };
}

function resolveViewportBlurRadius(viewport: Viewport, scale: number, rctx: ResolveContext): number | undefined {
  const blur = viewport.effects.find((effect) => effect.type === 'blur' && effect.isEnabled(rctx));
  const radius = Number(blur?.getProp<number>('blurRadius')?.resolve(rctx) ?? 0);
  if (!(radius > 0) || !Number.isFinite(radius)) return undefined;
  return radius * (Number.isFinite(scale) && scale > 0 ? scale : 1);
}

/** Scales a composition-space corner geometry's radii into final pixel space (see `scale` throughout this module). */
function scaleCornerGeometry(geometry: ResolvedCornerGeometry, scale: number): ResolvedCornerGeometry {
  const factor = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return {
    ...geometry,
    radii: {
      topLeft: geometry.radii.topLeft * factor,
      topRight: geometry.radii.topRight * factor,
      bottomRight: geometry.radii.bottomRight * factor,
      bottomLeft: geometry.radii.bottomLeft * factor,
    },
  };
}

/** Resolves the ECS video and clipped VideoArea corner masks. */
function resolveVideoTransform(
  video: Video | undefined,
  videoArea: VideoArea | undefined,
  scale: number,
  rctx: ResolveContext,
): CaptionVideoTransform | undefined {
  const videoBorderRadius = video?.getComponent<BorderRadius>('borderRadius');
  const videoCornerGeometry =
    videoBorderRadius?.getProp<boolean>('enabled')?.resolve(rctx) !== false
      ? videoBorderRadius?.cornerGeometry(rctx)
      : undefined;
  const videoAreaBorderRadius = videoArea?.getComponent<BorderRadius>('borderRadius');
  const clipsVideo = videoArea?.layout?.getProp<boolean>('clipContent')?.resolve(rctx) === true;
  const videoAreaCornerGeometry =
    clipsVideo && videoAreaBorderRadius?.getProp<boolean>('enabled')?.resolve(rctx) !== false
      ? videoAreaBorderRadius?.cornerGeometry(rctx)
      : undefined;
  const scaledVideoCornerGeometry = videoCornerGeometry && hasRoundedCorners(videoCornerGeometry)
    ? scaleCornerGeometry(videoCornerGeometry, scale)
    : undefined;
  const scaledVideoAreaCornerGeometry = videoAreaCornerGeometry && hasRoundedCorners(videoAreaCornerGeometry)
    ? scaleCornerGeometry(videoAreaCornerGeometry, scale)
    : undefined;
  if (!scaledVideoCornerGeometry && !scaledVideoAreaCornerGeometry) return undefined;

  return {
    shiftXPercentage: 0,
    shiftYPercentage: 0,
    fitPositionXPercentage: 0,
    fitPositionYPercentage: 0,
    resizeMode: 'fit' as const,
    canvasBackgroundPaint: solidPaint(scaledVideoCornerGeometry ? 'black' : 'rgba(0,0,0,0)'),
    ...(scaledVideoCornerGeometry ? { cornerGeometry: scaledVideoCornerGeometry } : {}),
    ...(scaledVideoAreaCornerGeometry ? { videoAreaCornerGeometry: scaledVideoAreaCornerGeometry } : {}),
  };
}

/** Shift composition-space geometry by the crop origin into a per-frame debug frame. */
function toDebugFrame(scene: Viewport, rctx: ResolveContext, crop: Box, allowContentOverflow: boolean): CaptionDebugFrame {
  const geom = collectDebugFrame(scene, rctx, allowContentOverflow ? { ignoreContentClip: true } : {});
  const shiftBox = (b: DebugBox): DebugBox => ({
    left: b.left - crop.x,
    top: b.top - crop.y,
    right: b.right - crop.x,
    bottom: b.bottom - crop.y,
  });
  const shiftPt = (p: { x: number; y: number }): { x: number; y: number } => ({ x: p.x - crop.x, y: p.y - crop.y });
  return {
    page: shiftBox(geom.page),
    ...(geom.contentBounds ? { contentBounds: shiftBox(geom.contentBounds) } : {}),
    rows: geom.rows.map((row) => ({ ...shiftBox(row), rowIndex: row.rowIndex, state: row.state })),
    words: geom.words.map((word) => ({
      topLeft: shiftPt(word.topLeft),
      topRight: shiftPt(word.topRight),
      bottomRight: shiftPt(word.bottomRight),
      bottomLeft: shiftPt(word.bottomLeft),
      rowIndex: word.rowIndex,
      word: word.word,
      state: word.state,
    })),
    backgrounds: geom.backgrounds.map((background) => ({
      ...background,
      bandPadding: background.bandPadding.map(shiftBox),
      blockPadding: background.blockPadding.map(shiftBox),
    })),
    transforms: geom.transforms.map((transform) => ({
      ...transform,
      positionAnchor:
        transform.entity === 'page' ||
        transform.entity === 'row' ||
        transform.entity === 'word' ||
        transform.entity === 'background' ||
        transform.entity === 'image' ||
        transform.entity === 'marker'
          ? shiftPt(transform.positionAnchor)
          : transform.positionAnchor,
      ...(transform.contentBounds ? { contentBounds: shiftBox(transform.contentBounds) } : {}),
    })),
  };
}

/**
 * Generate caption frames for a transcript against an ECS-native preset design.
 * Returns the compositor contract (raw RGBA frame buffers + per-word timing).
 */
export async function generateSubtitleImagesEcs(input: EcsPipelineInput): Promise<EcsPipelineOutput> {
  const { videoResolution, timestamps, design, fps } = input;
  const stopAfterFrameIndex = input.stopAfterFrameIndex;
  if (
    stopAfterFrameIndex !== undefined &&
    (!Number.isSafeInteger(stopAfterFrameIndex) || stopAfterFrameIndex < 0)
  ) {
    throw new Error('stopAfterFrameIndex must be a non-negative safe integer.');
  }
  if (
    input.randomizerAppearanceIndex !== undefined &&
    (!Number.isSafeInteger(input.randomizerAppearanceIndex) || input.randomizerAppearanceIndex < 0)
  ) {
    throw new Error('randomizerAppearanceIndex must be a non-negative safe integer.');
  }
  const randomizerAppearanceGeneration = input.randomizerAppearanceIndex ?? 0;
  // Keep page identity stable within a generation while leaving enough room
  // for the page indexes normally produced by a caption render.
  const randomizerAppearanceForPage = (pageIndex: number | undefined): number =>
    randomizerAppearanceGeneration * RANDOMIZER_APPEARANCE_PAGE_STRIDE + (pageIndex ?? 0);
  const captionLayout = resolveCaptionLayoutPolicy(input.captionLayout);
  const stateWindow = validateStateWindowConfig(input.stateWindow);
  const captionScale = input.captionScale && input.captionScale > 0 ? input.captionScale : 1;
  const configuredLongWordThreshold = Math.min(
    Math.max(input.longWordThreshold ?? LONG_WORD_THRESHOLD, 0.05),
    10.0,
  );
  const captionHoldThresholdSeconds = Math.max(
    0,
    input.captionHoldThresholdSeconds ?? DEFAULT_CAPTION_HOLD_THRESHOLD_SECONDS,
  );
  const rowBreakPauseThresholdSeconds = Math.max(
    0,
    captionLayout.breaking.rowBreakPauseThresholdSeconds ?? DEFAULT_ROW_BREAK_PAUSE_THRESHOLD_SECONDS,
  );
  const pageBreakPauseThresholdSeconds = Math.max(
    0,
    captionLayout.breaking.pageBreakPauseThresholdSeconds ?? DEFAULT_PAGE_BREAK_PAUSE_THRESHOLD_SECONDS,
  );

  const { words, word_start_times_seconds, word_end_times_seconds, break_before, cue_indices } = timestamps;
  if (words.length !== word_start_times_seconds.length || words.length !== word_end_times_seconds.length) {
    throw new Error('Length of words and their timestamps must match.');
  }
  if (break_before && break_before.length !== words.length) throw new Error('Length of break_before must match words.');
  if (cue_indices && cue_indices.length !== words.length) throw new Error('Length of cue_indices must match words.');
  const textDirection = resolveTextDirection(captionLayout.textDirection, input.language, words.join(' '));

  throwIfCancelled(input);
  const template = buildEcsTree(design);
  const templatePage = pageOf(template.compositionArea);
  applyCaptionLayoutPageSizing(templatePage, captionLayout);
  if (input.fitPageToChildren && templatePage) fitPageToChildren(templatePage);
  if (input.allowContentOverflow && templatePage?.layout) {
    templatePage.layout.props.set('childrenSizing', staticProperty('string', 'allowOverflow'));
  }
  await resolveEcsFonts(template, input.isCancelled);
  throwIfCancelled(input);
  const svgRasterDimension = Math.min(
    8192,
    Math.max(2048, Math.ceil(Math.max(videoResolution.width, videoResolution.height))),
  );
  await preloadImageAssets(imageAssetsInScene(template), { maxDimension: svgRasterDimension });
  await preloadImageAssets(cursorAssetsInScene(template));
  const flowImageMeasurements = await preloadFlowImageMeasurements(template, { maxDimension: svgRasterDimension });
  const videoTemplate = template.video;
  const videoAreaTemplate = template.videoArea;
  const compositionAreaTemplate = template.compositionArea ?? new CompositionArea('compositionArea');

  const page = pageOf(compositionAreaTemplate);
  const row = rowOf(page);
  const roleWords = (row?.children.filter((child): child is Word => child instanceof Word) ?? []) as Word[];

  const measureCanvas = new Canvas(1, 1);
  const measureCtx = measureCanvas.getContext('2d');
  const settledMeasurementContext = settledContext(textDirection);

  const textOf = (word: Word): Text | undefined =>
    word.components.find((component): component is Text => component instanceof Text);
  const measurementContextFor = (word: Word, logicalWordIndex?: number): ResolveContext => {
    const context = word.contextFor(settledMeasurementContext);
    if (logicalWordIndex === undefined) return context;
    return {
      ...context,
      patternIndex: logicalWordIndex,
      randomizerKey: `word:${logicalWordIndex}`,
    };
  };
  const scaleFor = (word: Word, logicalWordIndex?: number): Vector2 => {
    const scale = word.transform?.scale(measurementContextFor(word, logicalWordIndex)) ?? { x: 1, y: 1 };
    return {
      x: Number.isFinite(scale.x) ? Math.abs(scale.x) : 1,
      y: Number.isFinite(scale.y) ? Math.abs(scale.y) : 1,
    };
  };
  const measureWidth = (glyphs: string, word: Word, logicalWordIndex?: number): number => {
    const text = textOf(word);
    return text
      ? text.measure(measureCtx, measurementContextFor(word, logicalWordIndex), glyphs).width *
          scaleFor(word, logicalWordIndex).x
      : 0;
  };
  const wordMargins = (word: Word, logicalWordIndex?: number) =>
    word.getSelfMargins(measurementContextFor(word, logicalWordIndex));
  const maxWordWidthWithTolerance = (
    glyphs: string,
    logicalWordIndex: number | undefined,
    tolerance: number,
  ): number =>
    roleWords.reduce((max, word) => {
      const margins = wordMargins(word, logicalWordIndex);
      const scale = scaleFor(word, logicalWordIndex);
      return Math.max(
        max,
        measureWidth(glyphs, word, logicalWordIndex) + Math.max(0, margins.x * scale.x - tolerance) * 2,
      );
    }, 0);
  const maxWordWidth = (glyphs: string, logicalWordIndex?: number): number =>
    maxWordWidthWithTolerance(glyphs, logicalWordIndex, 0);
  const maxWordWidthForWrapping = (glyphs: string, logicalWordIndex?: number): number =>
    maxWordWidthWithTolerance(
      glyphs,
      logicalWordIndex,
      captionLayout.breaking.wordWrapping.overflowTolerance,
    );
  const maxWordHeight = (glyphs: string, logicalWordIndex?: number): number =>
    roleWords.reduce((max, word) => {
      const text = textOf(word);
      const context = measurementContextFor(word, logicalWordIndex);
      const margins = wordMargins(word, logicalWordIndex);
      const scale = scaleFor(word, logicalWordIndex);
      return Math.max(
        max,
        (text?.measure(measureCtx, context, glyphs).height ?? 0) * scale.y + margins.y * scale.y * 2,
      );
    }, 0);

  const defaultWord = roleWords.find((word) => word.id === 'word:default') ?? roleWords[0];
  const spaceX = defaultWord ? measureWidth(' ', defaultWord) : 0;
  const templateRows = page?.children.filter((child): child is Row => child instanceof Row) ?? [];
  const directPageFlowImages = pageFlowImages(page);
  const isHorizontalPageFlow = page?.layout?.getProp<string>('layoutMode')?.resolve(settledContext()) === 'row';
  const directPageFlowImageSizes = directPageFlowImages.map((image) =>
    resolveFlowImageSize(image, flowImageMeasurements.get(image.id), settledContext()),
  );
  const flowImageSizesByRow = templateRows.map((templateRow) => {
    const sizes = templateRow.children
      .filter(
        (child): child is ImageFlowEntity =>
          child instanceof ImageFlowEntity &&
          child.transform?.positioning(settledContext()) !== 'absolute' &&
          (!child.flowCollapsed || child.flowCollapseMode === 'reserve'),
      )
      .map((image) => resolveFlowImageSize(image, flowImageMeasurements.get(image.id), settledContext()));
    return {
      width: sizes.reduce((sum, size) => sum + size.width, 0),
      height: sizes.reduce((max, size) => Math.max(max, size.height), 0),
      count: sizes.length,
    };
  });
  const directPageFlowImageWidth = isHorizontalPageFlow
    ? directPageFlowImageSizes.reduce((sum, size) => sum + size.width, 0)
    : 0;
  const nestedFlowImageWidth = flowImageSizesByRow.reduce((max, rowSize) => Math.max(max, rowSize.width), 0);
  const nestedFlowImageWidthWithGaps = flowImageSizesByRow.reduce(
    (max, rowSize) => Math.max(max, rowSize.width + (rowSize.count > 0 ? spaceX * rowSize.count : 0)),
    0,
  );
  const flowImageWidth = directPageFlowImageWidth + nestedFlowImageWidth;
  const flowImageHeight = flowImageSizesByRow.reduce((max, rowSize) => Math.max(max, rowSize.height), 0);

  const edgePadding = Math.max(1, 4 * spaceX);
  const pagePadding = resolvedPagePadding(page);
  const horizontalPagePadding = pagePadding.left + pagePadding.right;
  const frameW = Math.max(1, videoResolution.width);
  const frameH = Math.max(1, videoResolution.height);
  const desiredScale = (frameH / CAPTION_VIEWPORT_UNITS) * captionScale;
  const pageFlowChildCount = isHorizontalPageFlow
    ? directPageFlowImages.length + (templateRows.length > 0 ? 1 : 0)
    : 0;
  const pageFlowGapWidth =
    pageFlowChildCount > 1 ? resolvedPageFlowGap(page, frameW / desiredScale) * (pageFlowChildCount - 1) : 0;
  let flowImageWidthWithGaps = directPageFlowImageWidth + pageFlowGapWidth + nestedFlowImageWidthWithGaps;
  const minimumWordWidthForScale = minimumWrappedWordWidth(
    words,
    maxWordWidth,
    captionLayout.breaking.wordWrapping,
    maxWordWidthForWrapping,
  );
  const minimumCaptionWidth = Math.max(
    1 + horizontalPagePadding,
    flowImageWidthWithGaps + minimumWordWidthForScale + edgePadding + horizontalPagePadding,
    flowImageWidth + edgePadding + horizontalPagePadding,
  );

  const maximumScale = frameW / Math.max(1, minimumCaptionWidth);
  const scale = Math.min(desiredScale, maximumScale);
  const compositionWidth = frameW / scale;
  const compositionHeight = frameH / scale;

  // The viewport is the internal composition frame. Keep this resolved size
  // on the runtime clone so Transform dimensions describe the actual frame,
  // while authored zero dimensions continue to mean "fill the frame".
  const viewportDimensions = template.transform?.getProp<{ x: number; y: number }>('dimensions');
  if (viewportDimensions) {
    template.transform?.props.set(
      'dimensions',
      staticProperty('vector2', { x: compositionWidth, y: compositionHeight }, viewportDimensions.unit),
    );
  }

  const settled = settledContext(textDirection);
  const frame: Box = { x: 0, y: 0, width: compositionWidth, height: compositionHeight };
  const { area: viewportArea, content: viewportContent } = resolveAreaBox(template, frame, settled);
  const { horizontal: horizontalAlign, vertical: verticalAlign } = alignmentOf(page, textDirection);
  // Parent aligns children (item 15): the CompositionArea is positioned by the
  // Viewport's alignment (falling back to the page alignment when the Viewport
  // carries no Layout), matching layoutScene's per-frame placement.
  const fallbackAlign: Alignment = { horizontal: horizontalAlign, vertical: verticalAlign };
  const viewportAlign = alignOf(template.layout, settled, fallbackAlign);
  const { area: videoAreaRect, content: videoAreaContent } = resolveAreaBox(
    videoAreaTemplate ?? videoTemplate ?? new VideoArea('videoArea'),
    viewportContent,
    settled,
    viewportAlign,
    undefined,
    viewportArea,
  );
  const { area: videoRect, content: videoContent } = resolveAreaBox(
    videoTemplate ?? new Video('video'),
    videoAreaContent,
    settled,
    viewportAlign,
    undefined,
    videoAreaRect,
  );
  const { area: areaRect, content: areaContent } = resolveAreaBox(
    compositionAreaTemplate,
    viewportContent,
    settled,
    viewportAlign,
    undefined,
    viewportArea,
  );
  const resolvedPageFlowGapWidth =
    pageFlowChildCount > 1 ? resolvedPageFlowGap(page, areaContent.width) * (pageFlowChildCount - 1) : 0;
  flowImageWidthWithGaps = directPageFlowImageWidth + resolvedPageFlowGapWidth + nestedFlowImageWidthWithGaps;
  const compositionAreaClipsContent =
    compositionAreaTemplate.layout?.getProp<boolean>('clipContent')?.resolve(settled) === true;
  const pageClipsContent = page?.layout?.getProp<boolean>('clipContent')?.resolve(settled) === true;
  const canUseCompositionAreaPadding =
    compositionAreaTemplate.layout !== undefined && !compositionAreaClipsContent && !pageClipsContent;
  const pageWidth = pageWidthForCaptionPlanning(page, areaContent.width);
  const captionPlanningWidth = pageWidth ?? (canUseCompositionAreaPadding ? areaRect.width : areaContent.width);
  const captionContentWidth = pageWidth ?? areaContent.width;
  // Unclipped authored padding can contain effect bleed, but clipped or legacy safe-area content cannot.
  const wordWrappingAreaWidth = captionPlanningWidth;
  const availableContentWordWidth = Math.max(
    1,
    captionContentWidth - flowImageWidthWithGaps - horizontalPagePadding,
  );
  const availableWordWrappingWidth = Math.max(
    1,
    wordWrappingAreaWidth - flowImageWidthWithGaps - horizontalPagePadding,
  );
  const availableWordWidth = Math.max(
    1,
    availableContentWordWidth - edgePadding,
  );
  const longWordThreshold = input.longWordThreshold === undefined
    ? resolveLongWordThreshold(
        captionLayout.breaking.longWordThresholdMode,
        captionLayout.breaking.longWordThresholdSeconds,
        availableWordWidth,
      )
    : configuredLongWordThreshold;
  const pageHeight = pageHeightResolution(page, areaContent.height);
  validateCaptionLayoutForPage(captionLayout, pageHeight.definite);
  // Grouping width estimate includes the row's horizontal-spacer extra (the
  // former page-level wordSpacingOffset), so line-breaks match the laid-out gaps.
  const groupSpaceX = spaceX + rowWordSpacerExtra(row, areaContent.width);

  const master: TimedWord[] = words.map((word, index) => ({
    word,
    sourceWord: word,
    logicalWordIndex: index,
    fragmentIndex: 0,
    fragmentCount: 1,
    startTimestamp: word_start_times_seconds[index],
    visualEndTimestamp: word_end_times_seconds[index],
    breakBefore:
      (captionLayout.breaking.sourceLineBreaks === 'preserve' && break_before?.[index] === true) ||
      (index > 0 && cue_indices !== undefined && cue_indices[index] !== cue_indices[index - 1]),
    ...(cue_indices?.[index] === undefined ? {} : { cueIndex: cue_indices[index] }),
  }));

  const wordWrappingOptions = {
    availableWidth: rowFitWidthForWrapping(
      captionLayout.horizontalFit,
      availableWordWrappingWidth,
      captionLayout.horizontalFitMinScale,
    ),
    maxWordWidth,
    maxWordWidthForWrapping,
    policy: captionLayout.breaking.wordWrapping,
  };
  const initialGroups = segmentCaptionWords(master, {
    availableWidth: availableWordWidth,
    spaceX: groupSpaceX,
    maxWordWidth,
    policy: captionLayout,
    ...(input.language === undefined ? {} : { language: input.language }),
    rowBreakPauseThresholdSeconds,
    longWordThreshold,
  });
  const groups = wrapOversizedCaptionRows(initialGroups, wordWrappingOptions);

  const rowHeight = (group: CaptionTimedWord[]): number => {
    const naturalWordWidth = group.reduce(
      (total, entry, index) => total + maxWordWidth(entry.word, entry.logicalWordIndex ?? index),
      0,
    );
    const targetWordWidth = Math.max(
      1,
      availableContentWordWidth - groupSpaceX * Math.max(0, group.length - 1),
    );
    const fontScale = resolveRowFontScale({
      mode: captionLayout.horizontalFit,
      naturalWidth: naturalWordWidth,
      targetWidth: targetWordWidth,
      minScale: captionLayout.horizontalFitMinScale,
      maxScale: captionLayout.horizontalFitMaxScale,
    }).value;
    return Math.max(
      flowImageHeight,
      1,
      ...group.map(
        (entry, index) => maxWordHeight(entry.word, entry.logicalWordIndex ?? index) * fontScale,
      ),
    );
  };
  const allocationOptions = {
    policy: captionLayout,
    ...(input.language === undefined ? {} : { language: input.language }),
    ...(pageHeight.height === undefined && captionLayout.rowsPerPage.mode !== 'auto'
      ? {}
      : { pageHeight: pageHeight.height ?? areaContent.height }),
    pagePadding: pagePaddingY(page),
    rowSpacing:
      pageRowSpacing(
        page,
        pageHeight.height ?? areaContent.height,
      ),
    availableWidth: availableWordWidth,
    spaceX: groupSpaceX,
    maxWordWidth,
    rowHeight,
    longWordThreshold,
    pageBreakPauseThresholdSeconds,
    fps,
  };
  const allocatedPages = allocateCaptionPages(groups, allocationOptions);
  const minimumSizePages =
    captionLayout.rowsPerPage.mode === 'fixed' || captionLayout.rowsPerPage.mode === 'all'
      ? allocatedPages
      : allocatedPages.map((pageRows) => (pageRows.length > 0 ? [pageRows[0]] : []));
  const rowWidth = (group: CaptionTimedWord[]): number =>
    group.reduce(
      (total, entry, index) =>
        total + maxWordWidth(entry.word, entry.logicalWordIndex ?? index) + (index > 0 ? groupSpaceX : 0),
      flowImageWidthWithGaps,
    );
  const minimumWordWidth = Math.max(
    flowImageWidthWithGaps,
    ...groups.flatMap((group) =>
      group.map((entry, index) => maxWordWidth(entry.word, entry.logicalWordIndex ?? index)),
    ),
  );
  const minimumPageSize = minimumCaptionPageSize(minimumSizePages, {
    pagePadding,
    rowSpacing: allocationOptions.rowSpacing,
    pauseSpacing: captionLayout.breaking.pauseSpacing,
    rowHeight,
    ...(captionLayout.wordsPerRow.mode === 'fixed'
      ? { rowWidth }
      : { minimumContentWidth: minimumWordWidth }),
  });
  const plannedPages = planPages(groups, allocationOptions);
  const pages = input.previewWordState
    ? (() => {
        const duration = Math.max(
          previewWordAnimationDuration(template, input.previewWordState) || timestampDuration(timestamps),
          BASE_ANIMATION_DURATION_SECONDS,
        );
        return input.previewWordStateLayout === 'stacked'
          ? [staticStackedPreviewPage(plannedPages, duration, fps)]
          : staticPreviewPages(plannedPages, duration, fps);
      })()
    : plannedPages;
  const triggerTimeline = imageSequencerTriggerTimeline(pages);
  const layoutMode = input.layoutMode ?? 'stable';
  const stableLayouts = new Map<number, LayoutSnapshot>();
  const captionLayoutDiagnostics = diagnoseCaptionPageOverflow(
    allocateCaptionPages(groups, allocationOptions),
    allocationOptions,
  );

  const layoutOptionsFor = (
    stableLayout?: LayoutSnapshot,
    spacingContext?: ResolveContext,
    rowEntries: readonly CaptionTimedWord[][] = [],
  ): LayoutOptions => ({
    x: 0,
    y: 0,
    width: compositionWidth,
    height: compositionHeight,
    wordSpacing: spaceX,
    horizontalAlign,
    verticalAlign,
    textDirection,
    flowImageMeasurements,
    rowFontFit: {
      mode: captionLayout.horizontalFit,
      minScale: captionLayout.horizontalFitMinScale,
      maxScale: captionLayout.horizontalFitMaxScale,
    },
    allowFlowOverflow: captionLayout.rowsPerPage.mode === 'all',
    rowSpacingExtras: rowSpacingExtrasFor(rowEntries, captionLayout),
    ...(stableLayout ? { stableLayout } : {}),
    ...(spacingContext ? { spacingContext } : {}),
  });

  const layoutOf = (
    currentIndex: number,
    rowGlyphs: string[][],
    triggerIndex = 0,
    triggerTimestampSeconds = 0,
    triggerIntervalSeconds?: number,
    nextTriggerIntervalSeconds?: number,
    pageIndex?: number,
    stackedPageRows?: string[][][],
    wordIndexOffset = 0,
    rowIndexOffset = 0,
    stackedWordIndexOffsets?: readonly number[],
    stackedRowIndexOffsets?: readonly number[],
    rowStartTimestampSeconds: readonly number[] = [],
    rowEntries: readonly CaptionTimedWord[][] = [],
    logicalWordCount = 0,
    stackedPageEntries?: readonly (readonly CaptionTimedWord[][])[],
    stackedLogicalWordCounts?: readonly number[],
  ): Viewport => {
    const scene = stackedPageRows
      ? instantiateStackedScene(template, {
          pages: stackedPageRows,
          ...(stackedPageEntries === undefined ? {} : { wordEntries: stackedPageEntries }),
          ...(stackedWordIndexOffsets === undefined ? {} : { wordIndexOffsets: stackedWordIndexOffsets }),
          ...(stackedRowIndexOffsets === undefined ? {} : { rowIndexOffsets: stackedRowIndexOffsets }),
          ...(stackedLogicalWordCounts === undefined ? {} : { logicalWordCounts: stackedLogicalWordCounts }),
          rowStartTimestampSeconds: rowStartTimestampSeconds.length > 0 ? rowStartTimestampSeconds : [0],
          pageStartTimestampSeconds: triggerTimestampSeconds,
          wordStartTimestampSeconds: triggerTimestampSeconds,
          stateWindow,
          ...(input.previewWordState
            ? {
                wordState: input.previewWordState,
                wordLifecycle: input.previewWordStateLayout === 'static' ? ('static' as const) : ('incoming' as const),
              }
            : {}),
          flowParticipation: captionLayout.flowParticipation,
        })
      : instantiateScene(template, {
          rows: rowGlyphs,
          currentIndex,
          wordIndexOffset,
          ...(pageIndex === undefined ? {} : { pageIndex }),
          rowIndexOffset,
          rowStartTimestampSeconds,
          pageStartTimestampSeconds: triggerTimestampSeconds,
          wordStartTimestampSeconds: triggerTimestampSeconds,
          stateWindow,
          ...(input.previewWordState
            ? {
                wordState: input.previewWordState,
                wordLifecycle: input.previewWordStateLayout === 'static' ? ('static' as const) : ('incoming' as const),
              }
            : {}),
          flowParticipation: captionLayout.flowParticipation,
          wordEntries: rowEntries,
          logicalWordCount,
        });
    const stableLayout = layoutMode === 'stable' && pageIndex !== undefined ? stableLayouts.get(pageIndex) : undefined;
    layoutScene(scene, measureCtx, {
      ...settled,
      triggerIndex,
      randomizerAppearanceIndex: randomizerAppearanceForPage(pageIndex),
      triggerTimestampSeconds,
      ...(triggerIntervalSeconds === undefined ? {} : { triggerIntervalSeconds }),
      ...(nextTriggerIntervalSeconds === undefined ? {} : { nextTriggerIntervalSeconds }),
    }, layoutOptionsFor(stableLayout, undefined, rowEntries));
    if (stackedPageRows) stackPagesVertically(scene, settled, STACKED_WORD_STATE_PAGE_GAP);
    if (layoutMode === 'stable' && pageIndex !== undefined && !stableLayout) {
      stableLayouts.set(pageIndex, captureLayoutSnapshot(scene));
    }
    return scene;
  };

  const geometryScene = layoutOf(
    0,
    pages[0]?.rowGlyphs ?? [[]],
    0,
    0,
    undefined,
    undefined,
    undefined,
    pages[0]?.stackedPageRows,
    pages[0]?.wordIndexOffset ?? 0,
    pages[0]?.rowIndexOffset ?? 0,
    pages[0]?.stackedWordIndexOffsets,
    pages[0]?.stackedRowIndexOffsets,
    pages[0]?.rowStartTimestampSeconds,
    pages[0]?.rowEntries,
    pages[0]?.logicalWordCount,
    pages[0]?.stackedPageEntries,
    pages[0]?.stackedLogicalWordCounts,
  );
  const geometryVideoBox = geometryScene.video?.box;
  const geometryVideoAreaBox = geometryScene.videoArea?.box;
  const geometryAreaBox = geometryScene.compositionArea?.box;
  const geometryVideoAreaContent = geometryVideoAreaBox
    ? contentBoxFromArea(geometryVideoAreaBox, videoAreaTemplate?.layout, settled)
    : videoAreaContent;
  const geometryVideoContent = geometryVideoBox
    ? contentBoxFromArea(geometryVideoBox, videoTemplate?.layout, settled)
    : videoContent;
  const geometryAreaContent = geometryAreaBox
    ? contentBoxFromArea(geometryAreaBox, compositionAreaTemplate.layout, settled)
    : areaContent;

  // Measure ONE global crop box across every caption: union of all content boxes
  // (words/rows + BackgroundStyle components) plus the compositionArea's own enabled
  // background rect (boxless -- it fills its layout rect, for example, downbar's bar).
  // The same box + placement is reused for every frame, so the crop window never
  // shifts between captions and letters stay put while scrubbing.
  const cropAcc = emptyBounds();
  const stablePageBounds = input.debug || input.onStart ? emptyBounds() : undefined;
  const contentBoundsOptions = {
    ...(input.allowContentOverflow ? { ignoreContentClip: true } : {}),
    includeLayoutMotionBounds: true,
  };
  let cropFrameIndex = 0;
  let cropTriggerIndex = 0;
  let cropPreviousTriggerTimestampSeconds: number | undefined;
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const plan = pages[pageIndex];
    const pageSettledContext = {
      ...settled,
      randomizerAppearanceIndex: randomizerAppearanceForPage(pageIndex),
    };
    for (let eventIndex = 0; eventIndex < plan.events.length; eventIndex += 1) {
      const event = plan.events[eventIndex];
      const triggerTimestampSeconds = event.entry.startTimestamp;
      const triggerIntervalSeconds = triggerIntervalForEvent(
        eventIndex,
        triggerTimestampSeconds,
        cropPreviousTriggerTimestampSeconds,
      );
      const nextEvent = plan.events[eventIndex + 1] ?? pages[pageIndex + 1]?.events[0];
      const nextTriggerIntervalSeconds = nextEvent
        ? Math.max(0, nextEvent.entry.startTimestamp - triggerTimestampSeconds)
        : undefined;
      const scene = layoutOf(
        event.currentIndex,
        plan.rowGlyphs,
        0,
        0,
        undefined,
        undefined,
        pageIndex,
        plan.stackedPageRows,
        plan.wordIndexOffset,
        plan.rowIndexOffset,
        plan.stackedWordIndexOffsets,
        plan.stackedRowIndexOffsets,
        plan.rowStartTimestampSeconds,
        plan.rowEntries,
        plan.logicalWordCount,
        plan.stackedPageEntries,
        plan.stackedLogicalWordCounts,
      );
      accumulateContentBounds(scene, pageSettledContext, cropAcc, contentBoundsOptions);
      if (stablePageBounds) {
        const pageGeometry = collectDebugFrame(
          scene,
          pageSettledContext,
          input.allowContentOverflow ? { ignoreContentClip: true } : {},
        );
        extendDebugBounds(stablePageBounds, pageGeometry.page);
      }

      const renderDuration = Math.max(event.duration, 1 / fps);
      for (const elapsedSeconds of transformAnimationSampleTimes(scene, event.duration, fps)) {
        const frameIndex = Math.min(
          event.numFrames - 1,
          Math.max(0, Math.round((elapsedSeconds / renderDuration) * Math.max(0, event.numFrames - 1))),
        );
        const sampleContext = defaultResolveContext({
          progress: 1,
          frameIndex: cropFrameIndex + frameIndex,
          compositionScale: scale,
          wordDurationSeconds: event.duration,
          ...(event.rowDurationSeconds === undefined ? {} : { rowDurationSeconds: event.rowDurationSeconds }),
          elapsedSeconds,
          deltaSeconds: 1 / fps,
          triggerTimestampSeconds,
          ...(triggerIntervalSeconds === undefined ? {} : { triggerIntervalSeconds }),
          ...(nextTriggerIntervalSeconds === undefined ? {} : { nextTriggerIntervalSeconds }),
          randomizerTriggerIndexes: randomizerTriggerIndexes(
            defaultResolveContext({
              triggerTimestampSeconds,
              elapsedSeconds,
            }),
            triggerTimeline,
          ),
          triggerIndex: cropTriggerIndex,
          randomizerAppearanceIndex: randomizerAppearanceForPage(pageIndex),
          textDirection,
          lifecycle: 'static',
        });
        accumulateContentBounds(scene, sampleContext, cropAcc, contentBoundsOptions);
        if (stablePageBounds) {
          const pageGeometry = collectDebugFrame(
            scene,
            sampleContext,
            input.allowContentOverflow ? { ignoreContentClip: true } : {},
          );
          extendDebugBounds(stablePageBounds, pageGeometry.page);
        }
      }
      cropFrameIndex += event.numFrames;
      cropTriggerIndex += 1;
      cropPreviousTriggerTimestampSeconds = triggerTimestampSeconds;
    }
  }
  if (backgroundEnabled(compositionAreaTemplate, settled) && geometryAreaBox) extendBounds(cropAcc, geometryAreaBox);
  if (stablePageBounds && Number.isFinite(cropAcc.minX)) {
    extendBounds(stablePageBounds, {
      x: cropAcc.minX,
      y: cropAcc.minY,
      width: cropAcc.maxX - cropAcc.minX,
      height: cropAcc.maxY - cropAcc.minY,
    });
  }

  const crop: Box = Number.isFinite(cropAcc.minX)
    ? {
        x: cropAcc.minX - CROP_SAFETY_PADDING,
        y: cropAcc.minY - CROP_SAFETY_PADDING,
        width: cropAcc.maxX - cropAcc.minX + CROP_SAFETY_PADDING * 2,
        height: cropAcc.maxY - cropAcc.minY + CROP_SAFETY_PADDING * 2,
      }
    : { x: 0, y: 0, width: compositionWidth, height: compositionHeight };
  if (!input.allowContentOverflow) {
    // Keep the caption bitmap inside the resolved viewport. Marker offsets and
    // effect margins can extend beyond it, but must not allocate an unbounded
    // canvas for content that cannot appear in the output video.
    const cropRight = Math.min(compositionWidth, Math.max(0, crop.x + crop.width));
    const cropBottom = Math.min(compositionHeight, Math.max(0, crop.y + crop.height));
    crop.x = Math.min(compositionWidth, Math.max(0, crop.x));
    crop.y = Math.min(compositionHeight, Math.max(0, crop.y));
    crop.width = Math.max(1 / scale, cropRight - crop.x);
    crop.height = Math.max(1 / scale, cropBottom - crop.y);
  }

  const maxFrameWidth = Math.max(1, Math.floor(frameW));
  const maxFrameHeight = Math.max(1, Math.floor(frameH));
  const renderedFrameWidth = Math.max(1, Math.ceil(crop.width * scale));
  const renderedFrameHeight = Math.max(1, Math.ceil(crop.height * scale));
  const frameSize: CaptionFrameSize = {
    width: input.allowContentOverflow ? renderedFrameWidth : Math.min(maxFrameWidth, renderedFrameWidth),
    height: input.allowContentOverflow ? renderedFrameHeight : Math.min(maxFrameHeight, renderedFrameHeight),
  };
  const stablePageCrop = stablePageBounds
    ? toPixelCrop(stablePageBounds, crop, scale, frameSize)
    : undefined;
  const placement: CaptionRenderPlacement = {
    horizontalAlignment: 'left',
    verticalAlignment: 'top',
    xOffset: Math.round(crop.x * scale),
    yOffset: Math.round(crop.y * scale),
    useSafeArea: false,
  };
  const debugLayoutBase: Omit<CaptionDebugLayout, 'frames'> | undefined = input.debug
    ? (() => {
        const areaOffset = areaOffsetOf(template, settled);
        const resolvedTransforms = collectDebugTransforms(geometryScene, settled).map((transform) => {
          if (
            transform.entity !== 'page' &&
            transform.entity !== 'row' &&
            transform.entity !== 'word' &&
            transform.entity !== 'image' &&
            transform.entity !== 'background' &&
            transform.entity !== 'marker'
          ) {
            return transform;
          }
          return {
            ...transform,
            positionAnchor: {
              x: transform.positionAnchor.x - crop.x,
              y: transform.positionAnchor.y - crop.y,
            },
          };
        });
        return {
          scale,
          resolvedTransforms,
          viewport: boxToDebug(viewportArea),
          viewportContent: boxToDebug(viewportContent),
          viewportOffset: transformOffsetOf(template, settled),
          videoArea: boxToDebug(geometryVideoAreaBox ?? videoAreaRect),
          videoAreaContent: boxToDebug(geometryVideoAreaContent),
          video: boxToDebug(geometryVideoBox ?? videoRect),
          videoContent: boxToDebug(geometryVideoContent),
          compositionArea: boxToDebug(geometryAreaBox ?? areaRect),
          compositionAreaContent: boxToDebug(geometryAreaContent),
          compositionAreaOffset: areaOffset,
          minimumPageSize,
        };
      })()
    : undefined;

  const captionInfos: CaptionImageInfo[] = [];
  const allImageBuffers: Buffer[] = [];
  const allBlendModeLayers: EcsPipelineBlendModeLayer[][] = [];
  const debugFrames: CaptionDebugFrame[] = [];
  const collectFrames = input.collectFrames !== false;
  input.onStart?.({
    frameSize,
    placement,
    videoResolution,
    ...(stablePageCrop ? { stablePageCrop } : {}),
    ...(debugLayoutBase ? { debugLayout: debugLayoutBase } : {}),
  });
  let frameCounter = 0;
  const shouldStopAfterFrame = (): boolean =>
    stopAfterFrameIndex !== undefined && frameCounter > stopAfterFrameIndex;
  const transitionRuntime = createTransitionRuntime();
  const followRuntime = createFollowRuntime();
  const layoutMotionRuntime = new LayoutMotionRuntime();

  let triggerIndex = 0;
  let previousTriggerTimestampSeconds: number | undefined;
  renderPages: for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const plan = pages[pageIndex];
    layoutMotionRuntime.beginPage(`page:${pageIndex}`);
    let previousEvent: WordEvent | undefined;
    for (let eventIndex = 0; eventIndex < plan.events.length; eventIndex += 1) {
      const event = plan.events[eventIndex];
      const triggerTimestampSeconds = event.entry.startTimestamp;
      const triggerIntervalSeconds = triggerIntervalForEvent(
        eventIndex,
        triggerTimestampSeconds,
        previousTriggerTimestampSeconds,
      );
      const nextEvent = plan.events[eventIndex + 1];
      const nextTriggerIntervalSeconds = nextEvent
        ? Math.max(0, nextEvent.entry.startTimestamp - triggerTimestampSeconds)
        : undefined;
      const scene = layoutOf(
        event.currentIndex,
        plan.rowGlyphs,
        triggerIndex,
        triggerTimestampSeconds,
        triggerIntervalSeconds,
        nextTriggerIntervalSeconds,
        pageIndex,
        plan.stackedPageRows,
        plan.wordIndexOffset,
        plan.rowIndexOffset,
        plan.stackedWordIndexOffsets,
        plan.stackedRowIndexOffsets,
        plan.rowStartTimestampSeconds,
        plan.rowEntries,
        plan.logicalWordCount,
        plan.stackedPageEntries,
        plan.stackedLogicalWordCounts,
      );
      scene.traverse((entity) => {
      });
      const animatedSpacerLayout = hasAnimatedSpacer(scene);
      if (previousEvent) {
        const gap = event.entry.startTimestamp - previousEvent.entry.visualEndTimestamp;
        if (gap > captionHoldThresholdSeconds) {
          transitionRuntime.clear();
        }
      }

      // A persisted CompositionArea (see `lifecycle.persistAcrossVideo`) enters
      // only on the video's very first render event and exits only on its very
      // last, rather than replaying every event - see `hasOwnLifecycle` in
      // `animation/evaluator.ts`.
      if (scene.compositionArea) {
        const isFirstEventOfVideo = plan === pages[0] && event === plan.events[0];
        const isLastEventOfVideo = plan === pages[pages.length - 1] && event === plan.events[plan.events.length - 1];
        scene.compositionArea.lifecycle = isFirstEventOfVideo ? 'incoming' : isLastEventOfVideo ? 'outgoing' : 'static';
      }

      const { duration, numFrames: numFramesToRender } = event;
      const hasIntraEventCaptionTrigger = hasCaptionTriggerWithinEvent(
        triggerTimeline,
        triggerTimestampSeconds,
        duration,
        fps,
      );
      let previousBuffer: Buffer | undefined;
      let settledBuffer: Buffer | undefined;
      let settledBlendModeLayers: EcsPipelineBlendModeLayer[] | undefined;
      let settledDebugFrame: CaptionDebugFrame | undefined;
      let settledFrameIndex: number | undefined;
      let consecutiveIdentical = 0;
      for (let frame = 0; frame < numFramesToRender; frame++) {
        throwIfCancelled(input);
        if (settledBuffer) {
          if (collectFrames) allImageBuffers.push(settledBuffer);
          if (collectFrames) allBlendModeLayers.push(settledBlendModeLayers ?? []);
          if (input.debug && settledDebugFrame) debugFrames.push(settledDebugFrame);
          if (input.onCanvasFrame && settledFrameIndex !== undefined) {
            input.onFrameRepeat?.({
              frameIndex: frameCounter,
              sourceFrameIndex: settledFrameIndex,
              width: frameSize.width,
              height: frameSize.height,
            });
          } else {
            input.onFrame?.({
              frameIndex: frameCounter,
              buffer: settledBuffer,
              width: frameSize.width,
              height: frameSize.height,
              blendModeLayers: settledBlendModeLayers ?? [],
              ...(settledDebugFrame ? { debugFrame: settledDebugFrame } : {}),
            });
          }
          frameCounter++;
          if (shouldStopAfterFrame()) break renderPages;
          await yieldStreamingFrame(input);
          continue;
        }
        const elapsedSeconds = (frame / Math.max(1, numFramesToRender - 1)) * Math.max(duration, 1 / fps);
        const baseRctx = defaultResolveContext({
          progress: 1,
          frameIndex: frameCounter,
          compositionScale: scale,
          wordDurationSeconds: duration,
          ...(event.rowDurationSeconds === undefined ? {} : { rowDurationSeconds: event.rowDurationSeconds }),
          elapsedSeconds,
          deltaSeconds: 1 / fps,
          triggerTimestampSeconds,
          ...(triggerIntervalSeconds === undefined ? {} : { triggerIntervalSeconds }),
          ...(nextTriggerIntervalSeconds === undefined ? {} : { nextTriggerIntervalSeconds }),
          triggerIndex,
          randomizerAppearanceIndex: randomizerAppearanceForPage(pageIndex),
          textDirection,
          lifecycle: 'static',
          transitionRuntime,
          followRuntime,
          transitionTimeSeconds: frameCounter / fps,
        });
        const rctx = {
          ...baseRctx,
          randomizerTriggerIndexes: randomizerTriggerIndexes(baseRctx, triggerTimeline),
          imageSequencerTriggerStates: imageSequencerTriggerStates(scene, baseRctx, triggerTimeline),
        };
        const canvas = acquireCanvas(frameSize.width, frameSize.height);
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);
        ctx.translate(-crop.x, -crop.y);
        if (animatedSpacerLayout) {
          layoutScene(scene, measureCtx, settled, layoutOptionsFor(undefined, rctx));
          if (plan.stackedPageRows) stackPagesVertically(scene, settled, STACKED_WORD_STATE_PAGE_GAP);
          layoutMotionRuntime.resetBaselines(scene);
          scene.traverse((entity) => {
          });
        }
        if (!input.disableLayoutMotion) {
          applyLayoutMotion(scene, rctx, layoutMotionRuntime, `page:${pageIndex}`);
        }
        const blendModeLayers: EcsPipelineBlendModeLayer[] = [];
        const blendModeLayerCollector = (mode: BlendMode, layer: Canvas): void => {
          blendModeLayers.push({
            mode,
            buffer: layer.toBufferSync('raw', { colorType: 'rgba' }),
            width: layer.width,
            height: layer.height,
          });
        };
        // Blend layers are collected during the scene render so their pixels
        // can be composited against the decoded video frame later.
        renderScene(scene, ctx, rctx, {
          ...(input.allowContentOverflow ? { ignoreContentClip: true } : {}),
          ...(input.collectBlendModeLayers ? { blendModeLayerCollector } : {}),
        });
        const renderedRgba = canvas.toBufferSync('raw', { colorType: 'rgba' });
        if (!input.onCanvasFrame) {
          releaseCanvas(canvas);
        }
        let debugFrame: CaptionDebugFrame | undefined;
        if (input.debug) {
          debugFrame = toDebugFrame(scene, rctx, crop, input.allowContentOverflow === true);
          debugFrames.push(debugFrame);
        }
        if (collectFrames) {
          allImageBuffers.push(renderedRgba);
          allBlendModeLayers.push(blendModeLayers);
        }
        if (input.onCanvasFrame) {
          const alpha = summarizeAlpha(renderedRgba, frameSize.width, frameSize.height, true);
          input.onCanvasFrame({
            frameIndex: frameCounter,
            canvas,
            width: frameSize.width,
            height: frameSize.height,
            blendModeLayers,
            ...(debugFrame ? { debugFrame } : {}),
            ...alpha,
          });
        } else {
          input.onFrame?.({
            frameIndex: frameCounter,
            buffer: renderedRgba,
            width: frameSize.width,
            height: frameSize.height,
            blendModeLayers,
            ...(debugFrame ? { debugFrame } : {}),
          });
        }
        frameCounter++;
        if (shouldStopAfterFrame()) break renderPages;

        if (
          !hasIntraEventCaptionTrigger &&
          blendModeLayers.length === 0 &&
          previousBuffer &&
          renderedRgba.equals(previousBuffer)
        ) {
          consecutiveIdentical++;
          if (consecutiveIdentical >= SETTLE_STREAK_FRAMES) {
            settledBuffer = renderedRgba;
            settledBlendModeLayers = blendModeLayers;
            settledDebugFrame = debugFrame;
            settledFrameIndex = frameCounter - 1;
          }
        } else {
          consecutiveIdentical = 0;
        }
        previousBuffer = renderedRgba;
      }

      captionInfos.push({
        word: event.entry.word,
        startTime: event.entry.startTimestamp,
        endTime: event.entry.visualEndTimestamp,
        duration,
        startFrame: frameCounter - numFramesToRender,
        numFrames: numFramesToRender,
        isLastWordInGroup: event.isLastWordInGroup,
        isLastWordOnPage: event.isLastWordOnPage,
      });

      previousEvent = event;
      previousTriggerTimestampSeconds = triggerTimestampSeconds;
      triggerIndex++;
    }
  }

  const viewportBackdrop = resolveViewportBackdropTransform(template, scale, settled);
  const viewportBlurRadius = resolveViewportBlurRadius(template, scale, settled);
  const baseVideoTransform = resolveVideoTransform(videoTemplate, videoAreaTemplate, scale, settled);
  const resolvedVideoTransform = viewportBackdrop || viewportBlurRadius !== undefined
    ? baseVideoTransform
      ? {
          ...baseVideoTransform,
          ...(viewportBackdrop
            ? {
                canvasBackgroundPaint: viewportBackdrop.canvasBackgroundPaint,
                ...(viewportBackdrop.viewportCornerGeometry
                  ? { viewportCornerGeometry: viewportBackdrop.viewportCornerGeometry }
                  : {}),
              }
            : {}),
          ...(viewportBlurRadius !== undefined ? { viewportBlurRadius } : {}),
        }
      : {
          shiftXPercentage: 0,
          shiftYPercentage: 0,
          fitPositionXPercentage: 0,
          fitPositionYPercentage: 0,
          resizeMode: 'fit' as const,
          canvasBackgroundPaint: viewportBackdrop?.canvasBackgroundPaint ?? solidPaint('rgba(0,0,0,0)'),
          ...(viewportBackdrop?.viewportCornerGeometry
            ? { viewportCornerGeometry: viewportBackdrop.viewportCornerGeometry }
            : {}),
          ...(viewportBlurRadius !== undefined ? { viewportBlurRadius } : {}),
        }
    : baseVideoTransform;
  const toPixelBounds = (box: Box | null | undefined) =>
    box
      ? {
          x: Math.round(box.x * scale),
          y: Math.round(box.y * scale),
          width: Math.max(1, Math.round(box.width * scale)),
          height: Math.max(1, Math.round(box.height * scale)),
        }
      : undefined;
  const layoutVideoBounds = toPixelBounds(geometryVideoBox);
  const layoutVideoAreaBounds = toPixelBounds(geometryVideoAreaBox);
  const videoTransform = layoutVideoBounds || layoutVideoAreaBounds
      ? {
          ...(resolvedVideoTransform ?? {
            shiftXPercentage: 0,
            shiftYPercentage: 0,
            fitPositionXPercentage: 0,
            fitPositionYPercentage: 0,
            resizeMode: 'fit' as const,
            canvasBackgroundPaint: solidPaint('rgba(0,0,0,0)'),
          }),
          videoAreaBounds: layoutVideoAreaBounds,
          videoBounds: layoutVideoBounds,
        }
      : resolvedVideoTransform;

  if (!input.debug) {
    return {
      captionInfos,
      allImageBuffers,
      allBlendModeLayers,
      frameSize,
      placement,
      ...(stablePageCrop ? { stablePageCrop } : {}),
      videoTransform,
      ...(captionLayoutDiagnostics.length > 0 ? { captionLayoutDiagnostics } : {}),
    };
  }

  if (!debugLayoutBase) {
    throw new Error('Debug layout metadata was not prepared.');
  }
  const debugLayout: CaptionDebugLayout = {
    ...debugLayoutBase,
    frames: debugFrames,
  };
  return {
    captionInfos,
    allImageBuffers,
    allBlendModeLayers,
    frameSize,
    placement,
    ...(stablePageCrop ? { stablePageCrop } : {}),
    videoTransform,
    debugLayout,
    ...(captionLayoutDiagnostics.length > 0 ? { captionLayoutDiagnostics } : {}),
  };
}
