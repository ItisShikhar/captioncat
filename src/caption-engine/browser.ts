/**
 * Browser-facing caption engine API.
 *
 * The API accepts the engine's canonical `EcsCaptionPreset` document and
 * exposes preview rendering without exposing the renderer's internal modules.
 * Browser builds provide replacements for the Node-only renderer dependencies.
 */
import { Buffer as BufferPolyfill } from 'buffer';
import type { EcsCaptionPreset } from './presets/preset-document';
import type {
  CaptionDebugFrame,
  CaptionDebugLayout,
  CaptionFrameCrop,
  CaptionImageInfo,
  CaptionRenderPlacement,
  CaptionVideoTransform,
} from './render-types';
import type {
  BlendMode,
} from './entity-system/effects/blend-mode-types';
import {
  DEFAULT_PAINT_CAPABILITIES as defaultPaintCapabilities,
  interpolatePaint as interpolatePaintInternal,
  isPaint as isPaintInternal,
  normalizePaint as normalizePaintInternal,
  paintSummary as paintSummaryInternal,
  resolvePaint as resolvePaintInternal,
  solidColor as solidColorInternal,
  solidPaint as solidPaintInternal,
} from './entity-system/paint';
import {
  normalizeBlendMode as normalizeBlendModeInternal,
} from './entity-system/effects/blend-mode';
import { BLEND_MODES } from './entity-system/effects/blend-mode-types';
import {
  motionBlurAlphaForStep as motionBlurAlphaForStepInternal,
  motionBlurOffsetForAngle as motionBlurOffsetForAngleInternal,
  normalizeMotionBlurSteps as normalizeMotionBlurStepsInternal,
} from './entity-system/effects/motion-blur';
import { MAX_MOTION_BLUR_STEPS } from './entity-system/effects/motion-blur-types';
import {
  isModeSelectorPropertyKey as isModeSelectorPropertyKeyInternal,
  normalizeRandomizerConfig as normalizeRandomizerConfigInternal,
  resolveRandomizerScope as resolveRandomizerScopeInternal,
  resolveRandomizerTrigger as resolveRandomizerTriggerInternal,
} from './entity-system/randomizer';
import {
  RANDOMIZER_SCOPE_OPTIONS,
  RANDOMIZER_TRIGGER_OPTIONS,
  type RandomizerConfig,
  type RandomizerScope,
  type RandomizerTrigger,
} from './entity-system/randomizer-types';
import {
  normalizeImageSequencerAdvance as normalizeImageSequencerAdvanceInternal,
  normalizeImageSequencerEndBehavior as normalizeImageSequencerEndBehaviorInternal,
  normalizeImageSequencerTrigger as normalizeImageSequencerTriggerInternal,
  normalizeImageSequencerTriggerRule as normalizeImageSequencerTriggerRuleInternal,
} from './entity-system/components/image-sequencer';
import {
  IMAGE_SEQUENCER_ADVANCE_OPTIONS,
  IMAGE_SEQUENCER_END_OPTIONS,
  IMAGE_SEQUENCER_TRIGGERS,
  type ImageSequencerAdvance,
  type ImageSequencerEndBehavior,
  type ImageSequencerTrigger,
  type ImageSequencerTriggerRule,
} from './entity-system/components/image-sequencer-types';
import type {
  Paint,
  PaintBounds,
  PaintCapability,
  ResolvedPaint,
  SolidPaint,
} from './entity-system/paint-types';
import {
  mergeCaptionLayoutPolicy,
  type CaptionLayoutDiagnostic,
  type CaptionLayoutOverride,
} from './entity-system/caption-layout';
import type {
  CaptionFlowLayoutMode,
  PreviewWordStateLayout,
  RenderPreviewStart,
  WordState,
} from './preview-types';
import {
  formatFontFamilyForCanvas as formatFontFamilyForCanvasInternal,
  registerFontFaceFromUrl as registerFontFaceFromUrlInternal,
  resolveFontFamilyEntry as resolveFontFamilyEntryInternal,
  setLocalFontSourceResolver as setLocalFontSourceResolverInternal,
} from '#platform/font-loader.js';
import {
  BUILTIN_CURSOR_ASSET_DEFINITIONS as builtinCursorAssetDefinitions,
  CURSOR_PRESET_DEFINITIONS as cursorPresetDefinitions,
  cursorAssetDefinition as cursorAssetDefinitionInternal,
  cursorAssetForPreset as cursorAssetForPresetInternal,
  cursorAssetsInScene as cursorAssetsInSceneInternal,
  cursorAssetSource as cursorAssetSourceInternal,
  cursorPresetDefinition as cursorPresetDefinitionInternal,
  cursorSvg as cursorSvgInternal,
  cursorSvgForPreset as cursorSvgForPresetInternal,
  isCursorPreset as isCursorPresetInternal,
  normalizeCursorColorMode as normalizeCursorColorModeInternal,
  normalizeCursorPreset as normalizeCursorPresetInternal,
  setCursorAssetSourceOverrides as setCursorAssetSourceOverridesInternal,
} from '#platform/cursor-assets.js';
import {
  BUILTIN_IMAGE_ASSET_DEFINITIONS as builtinImageAssetDefinitions,
  builtinImageDefinition as builtinImageDefinitionInternal,
  builtinImageGlyph as builtinImageGlyphInternal,
  builtinImageSvg as builtinImageSvgInternal,
  isBuiltinImageAsset as isBuiltinImageAssetInternal,
  normalizeImageAssetSource as normalizeImageAssetSourceInternal,
  resolveImageAsset as resolveImageAssetInternal,
} from '#platform/image-assets.js';
import {
  BUILTIN_CURSOR_ASSET_METADATA,
  CURSOR_ASSET_IDS,
  CURSOR_PRESETS,
  type BuiltinCursorAssetDefinition,
  type CursorAssetId,
  type CursorColorMode,
  type CursorPreset,
  type CursorPresetDefinition,
  type CursorPresetOffset,
  type CursorShape,
} from './entity-system/cursor-assets-registry';
import {
  BUILTIN_IMAGE_ASSET_METADATA,
  BUILTIN_IMAGE_ASSETS,
  CURATED_BUNDLED_IMAGE_ASSETS,
  DEFAULT_BUNDLED_IMAGE_ASSET,
  IMAGE_ASSET_SOURCES,
  type BuiltinImageAsset,
  type BuiltinImageAssetDefinition,
  type BuiltinImageAssetMetadata,
  type ImageAssetSource,
} from './entity-system/image-assets-registry';
import { FontResolutionError } from '../utilities/font-resolution-error';
import type { FontResolutionOptions, LocalFontSourceResolver } from '../utilities/font-loader-types';
import { computeOverlayPixelPosition } from '../utilities/raw-frame-compositor';
export { EFFECTS_APPLICATION_ORDER } from './entity-system/effects/effects-order';

export type {
  CaptionDebugBackground,
  CaptionDebugBox,
  CaptionDebugFrame,
  CaptionDebugLayout,
  CaptionDebugPageSize,
  CaptionDebugPoint,
  CaptionDebugQuad,
  CaptionDebugTransform,
  CaptionDebugPropertyOverride,
  CaptionFrameCrop,
  CaptionFrameSize,
  CaptionImageInfo,
  CaptionRenderPlacement,
  CaptionVideoBounds,
  CaptionVideoTransform,
} from './render-types';
export type {
  ResolvedCornerGeometry,
  ResolvedCornerRadii,
} from '../types/captions';

export type {
  CaptionFlowLayoutMode,
  PreviewWordStateLayout,
  RenderPreviewStart,
  WordState,
} from './preview-types';
export {
  CAPTION_FLOW_LAYOUT_MODES,
  PREVIEW_WORD_STATE_LAYOUTS,
} from './preview-types';
export type { BlendMode } from './entity-system/effects/blend-mode-types';
export type { CaptionLayoutDiagnostic } from './entity-system/caption-layout';
export type { EcsCaptionPreset } from './presets/preset-document';
export {
  isEcsCaptionPreset,
  normalizeEcsCaptionPreset,
  parseEcsCaptionPreset,
  parseEcsCaptionPresetJson,
  serializeEcsCaptionPreset,
} from './presets/preset-document';
export type {
  CaptionPresetMetadata,
  CaptionPresetPreview,
  CaptionPresetTiming,
  PresetTiming,
} from './presets/preset-document';
export {
  CURRENT_PRESET_SCHEMA_VERSION,
} from './presets/schema-version';
export type { PresetSchemaVersion } from './presets/schema-version';
export type {
  EcsComponentNode,
  EcsEffectNode,
  EcsEntityNode,
  EcsLeaf,
  EcsPropGroup,
  EcsPropNode,
} from './entity-system/ecs-preset-types';
export {
  DEFAULT_CAPTION_WORD_WRAP_OVERFLOW_TOLERANCE,
  CAPTION_BREAK_RULE_DEFINITIONS,
  CAPTION_BREAK_TIMING_PRESETS,
  DEFAULT_CAPTION_HOLD_THRESHOLD_SECONDS,
  captionBreakTimingPresetFor,
  createDefaultCaptionLayoutPolicy,
  getSmartBreakRules,
} from './entity-system/caption-layout';
export type {
  CaptionBreakPriorityPolicy,
  CaptionBreakPriorityOverride,
  CaptionBreakRule,
  CaptionBreakRuleMode,
  CaptionBreakTimingPreset,
  CaptionLayoutOverride,
  CaptionLayoutPolicy,
  CaptionWordWrappingMode,
  FlowCollapseMode,
  FlowParticipationMode,
  FlowParticipationRowState,
  FlowParticipationWordState,
  HorizontalFitMode,
  LongWordThresholdMode,
  RowsPerPageMode,
  SmartBreakMode,
  SourceLineBreakMode,
  TextDirection,
  WordsPerRowMode,
} from './entity-system/caption-layout';
export {
  DEFAULT_STATE_WINDOW,
  MAX_FIXED_COUNT,
  MIN_FIXED_COUNT,
  clampFixedCount,
  fixedCountRange,
  isStateWindowConfig,
  normalizeStateWindowConfig,
  normalizeStateWindowRange,
  rangeIncludesDistance,
  rowCountRange,
  validateStateWindowConfig,
} from './entity-system/state-window';
export type {
  StateWindowConfig,
  StateWindowInput,
  StateWindowRange,
} from './entity-system/state-window';
export {
  isStateStyleSource,
  normalizeStateStyleSources,
  STATE_STYLE_SOURCES,
} from './entity-system/state-style';
export type { StateStyleSource } from './entity-system/state-style-types';
export const DEFAULT_PAINT_CAPABILITIES: readonly PaintCapability[] = defaultPaintCapabilities;
export function isPaint(value: unknown): value is Paint {
  return isPaintInternal(value);
}
export function interpolatePaint(from: Paint, to: Paint, progress: number): Paint {
  return interpolatePaintInternal(from, to, progress);
}
export function normalizePaint(value: unknown, fallback: Paint): Paint {
  return normalizePaintInternal(value, fallback);
}
export function paintSummary(paint: Paint): string {
  return paintSummaryInternal(paint);
}
export function resolvePaint(
  ctx: CanvasContext2D,
  paint: Paint,
  bounds: PaintBounds,
  alphaMultiplier = 1,
): ResolvedPaint {
  return resolvePaintInternal(
    ctx as unknown as Parameters<typeof resolvePaintInternal>[0],
    paint,
    bounds,
    alphaMultiplier,
  ) as unknown as ResolvedPaint;
}
export function solidColor(color: string, alphaMultiplier = 1): string {
  return solidColorInternal(color, alphaMultiplier);
}
export function solidPaint(color: string): SolidPaint {
  return solidPaintInternal(color);
}
export type {
  GradientStop,
  LinearGradientPaint,
  Paint,
  PaintBounds,
  PaintCapability,
  PaintType,
  RadialGradientPaint,
  ResolvedPaint,
  SolidPaint,
} from './entity-system/paint-types';
export type { FillMode, FillPatternValue } from './entity-system/fill-pattern';
export {
  BLEND_MODES,
};
export function normalizeBlendMode(value: unknown): BlendMode {
  return normalizeBlendModeInternal(value);
}
export {
  DEFAULT_IMAGE_COLOR,
  IMAGE_ASPECT_RATIO_MODES,
  IMAGE_COLOR_MODES,
  IMAGE_CUSTOM_ASPECT_RATIOS,
  IMAGE_RENDER_ORDERS,
  normalizeImageAspectRatio,
  normalizeImageCustomAspectRatio,
  normalizeImageRenderOrder,
} from './entity-system/components/image-style';
export type {
  ImageAspectRatio,
  ImageColorMode,
  ImageCustomAspectRatio,
  ImageRenderOrder,
} from './entity-system/components/image-style';
export {
  DEFAULT_REPLICATOR_CUSTOM_FILLS,
  DEFAULT_REPLICATOR_FILL_MODE,
  DEFAULT_REPLICATOR_FILL_SEED,
  DEFAULT_REPLICATOR_FILL_TARGET,
  replicatorFillForCopy,
} from './entity-system/effects/replicator-fill';
export type {
  ReplicatorFillMode,
  ReplicatorFillTarget,
} from './entity-system/effects/replicator-fill';
export {
  DEFAULT_TRANSITION_DURATION_SECONDS,
} from './entity-system/transition-types';
export type {
  TransitionConfig,
  TransitionInitialBehavior,
  TransitionScope,
  TransitionStartValue,
  TransitionType,
} from './entity-system/transition-types';
export {
  RANDOMIZER_SCOPE_OPTIONS,
  RANDOMIZER_TRIGGER_OPTIONS,
};
export function isModeSelectorPropertyKey(propertyKey: string): boolean {
  return isModeSelectorPropertyKeyInternal(propertyKey);
}
export function normalizeRandomizerConfig(config: RandomizerConfig): RandomizerConfig {
  return normalizeRandomizerConfigInternal(config);
}
export function resolveRandomizerScope(config: RandomizerConfig): RandomizerScope {
  return resolveRandomizerScopeInternal(config);
}
export function resolveRandomizerTrigger(config: RandomizerConfig): RandomizerTrigger {
  return resolveRandomizerTriggerInternal(config);
}
export type {
  RandomizerConfig,
  RandomizerScope,
  RandomizerTrigger,
} from './entity-system/randomizer-types';
export {
  FOLLOW_TARGET_BOUNDS_MAPPINGS,
  FOLLOW_TARGET_KINDS,
  FOLLOW_TARGET_SCOPES,
  FOLLOW_ANCHORS,
  FOLLOW_BOUNDARY_HANDOFFS,
  FOLLOW_MODES,
  FOLLOW_PROPERTY_DEFINITIONS,
  FOLLOW_SOURCE_DEFINITIONS,
  FOLLOW_TRANSITION_SCOPES,
  normalizeFollowMappings,
} from './entity-system/follow/types';
export type {
  FollowBoundaryHandoff,
  FollowOffsetUnit,
  FollowMapping,
  FollowMode,
  FollowPropertyDefinition,
  FollowTargetKind,
  FollowTargetScope,
  FollowTransitionScope,
} from './entity-system/follow/types';
export {
  DEFAULT_FONT_EMOJI_SETTINGS,
  GENERIC_FONT_FALLBACKS,
  getBundledFontFamilies,
  getFontFamily,
  getFontFamilies,
  getFontFaceWeightDescriptor,
  getClosestFontVariant,
  isGenericFontFamily,
  resolveFontEmojiSettings,
  resolveFontWeight,
  normalizeFontFaceStyle,
  normalizeFontStyle,
  normalizeFontWeight,
  isRemoteFontUrl,
  supportsVariableFontWeight,
} from '../font-registry';
export type {
  FontFaceStyle,
  FontFamilyEntry,
  FontEmojiSettings,
  FontSource,
  FontSourceType,
  FontStyle,
  FontVariant,
} from '../font-registry';
export { FontResolutionError };
export type { FontResolutionOptions, LocalFontSourceResolver } from '../utilities/font-loader-types';
export function formatFontFamilyForCanvas(fontFamily: string | string[] | null | undefined): string {
  return formatFontFamilyForCanvasInternal(fontFamily);
}
export function registerFontFaceFromUrl(
  family: string,
  url: string,
  descriptors?: FontFaceDescriptors,
): Promise<void> {
  return registerFontFaceFromUrlInternal(family, url, descriptors);
}
export function resolveFontFamilyEntry(
  entry: string,
  options?: FontResolutionOptions,
): Promise<string[]> {
  return resolveFontFamilyEntryInternal(entry, options);
}
export function setLocalFontSourceResolver(resolver: LocalFontSourceResolver | undefined): void {
  setLocalFontSourceResolverInternal(resolver);
}
export { applyAnimationCurve } from './entity-system/animation/curve';
export {
  MAX_MOTION_BLUR_STEPS,
};
export function motionBlurAlphaForStep(steps: number, step: number, maxOpacity: number): number {
  return motionBlurAlphaForStepInternal(steps, step, maxOpacity);
}
export function motionBlurOffsetForAngle(
  distance: number,
  angle: number | undefined,
): { x: number; y: number } {
  return motionBlurOffsetForAngleInternal(distance, angle);
}
export function normalizeMotionBlurSteps(value: unknown): number {
  return normalizeMotionBlurStepsInternal(value);
}
export { parseColor } from '../utilities/color-utils';
export { resolveTextDirection } from './entity-system/text-direction';
export type { ResolvedTextDirection } from './entity-system/text-direction';
export interface CanvasContext2D extends globalThis.CanvasRenderingContext2D {
  drawCanvas(image: CanvasImageSource, x: number, y: number, width?: number, height?: number): void;
  fontHinting: boolean;
}
export {
  IMAGE_SEQUENCER_ADVANCE_OPTIONS,
  IMAGE_SEQUENCER_END_OPTIONS,
  IMAGE_SEQUENCER_TRIGGERS,
};
export function normalizeImageSequencerAdvance(value: unknown): ImageSequencerAdvance | undefined {
  return normalizeImageSequencerAdvanceInternal(value);
}
export function normalizeImageSequencerEndBehavior(value: unknown): ImageSequencerEndBehavior | undefined {
  return normalizeImageSequencerEndBehaviorInternal(value);
}
export function normalizeImageSequencerTrigger(value: unknown): ImageSequencerTrigger | undefined {
  return normalizeImageSequencerTriggerInternal(value);
}
export function normalizeImageSequencerTriggerRule(
  value: unknown,
  fallbackAdvance?: ImageSequencerAdvance,
): ImageSequencerTriggerRule | undefined {
  return normalizeImageSequencerTriggerRuleInternal(value, fallbackAdvance);
}
export type {
  ImageSequencerAdvance,
  ImageSequencerEndBehavior,
  ImageSequencerTrigger,
  ImageSequencerTriggerRule,
} from './entity-system/components/image-sequencer-types';
export {
  BUILTIN_CURSOR_ASSET_METADATA,
  CURSOR_ASSET_IDS,
  CURSOR_PRESETS,
};
export const BUILTIN_CURSOR_ASSET_DEFINITIONS: readonly BuiltinCursorAssetDefinition[] =
  builtinCursorAssetDefinitions;
export const CURSOR_PRESET_DEFINITIONS: readonly CursorPresetDefinition[] = cursorPresetDefinitions;
export function cursorAssetDefinition(asset: string): BuiltinCursorAssetDefinition | undefined {
  return cursorAssetDefinitionInternal(asset);
}
export function cursorAssetForPreset(preset: unknown): CursorAssetId | undefined {
  return cursorAssetForPresetInternal(preset);
}
export function cursorAssetsInScene(root: {
  traverse: (
    visit: (entity: {
      effects: readonly { type: string }[];
      components: readonly { effects: readonly { type: string }[] }[];
    }) => void,
  ) => void;
}): string[] {
  return cursorAssetsInSceneInternal(root);
}
export function cursorAssetSource(asset: string): string {
  return cursorAssetSourceInternal(asset);
}
export function setCursorAssetSourceOverrides(overrides: Readonly<Record<string, string>>): void {
  setCursorAssetSourceOverridesInternal(overrides);
}
export function cursorPresetDefinition(preset: unknown): CursorPresetDefinition | undefined {
  return cursorPresetDefinitionInternal(preset);
}
export function cursorSvg(asset: string): string {
  return cursorSvgInternal(asset);
}
export function cursorSvgForPreset(preset: unknown): string {
  return cursorSvgForPresetInternal(preset);
}
export function isCursorPreset(value: unknown): value is CursorPreset {
  return isCursorPresetInternal(value);
}
export function normalizeCursorColorMode(value: unknown): CursorColorMode {
  return normalizeCursorColorModeInternal(value);
}
export function normalizeCursorPreset(value: unknown): CursorPreset {
  return normalizeCursorPresetInternal(value);
}
export type {
  BuiltinCursorAssetDefinition,
  CursorAssetId,
  CursorColorMode,
  CursorPreset,
  CursorPresetDefinition,
  CursorPresetOffset,
  CursorShape,
};
export {
  BUILTIN_IMAGE_ASSET_METADATA,
  BUILTIN_IMAGE_ASSETS,
  CURATED_BUNDLED_IMAGE_ASSETS,
  DEFAULT_BUNDLED_IMAGE_ASSET,
  IMAGE_ASSET_SOURCES,
};
export const BUILTIN_IMAGE_ASSET_DEFINITIONS: readonly BuiltinImageAssetDefinition[] =
  builtinImageAssetDefinitions;
export function builtinImageDefinition(asset: string): BuiltinImageAssetDefinition | undefined {
  return builtinImageDefinitionInternal(asset);
}
export function builtinImageGlyph(asset: string): string {
  return builtinImageGlyphInternal(asset);
}
export function builtinImageSvg(asset: string): string {
  return builtinImageSvgInternal(asset);
}
export function isBuiltinImageAsset(asset: string): asset is BuiltinImageAsset {
  return isBuiltinImageAssetInternal(asset);
}
export function normalizeImageAssetSource(value: unknown, fallbackAsset: unknown): ImageAssetSource {
  return normalizeImageAssetSourceInternal(value, fallbackAsset);
}
export function resolveImageAsset(sourceValue: unknown, bundledValue: unknown, customValue: unknown): string {
  return resolveImageAssetInternal(sourceValue, bundledValue, customValue);
}
export type {
  BuiltinImageAsset,
  BuiltinImageAssetDefinition,
  BuiltinImageAssetMetadata,
  ImageAssetSource,
};
export {
  PROJECT_BRANDING,
} from '../project-branding';


// The renderer core (and Node's `Buffer.from`/`.toBuffer()` calls throughout
// it) expects a real global `Buffer`, which does not exist in browsers.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- assigning the isomorphic Buffer polyfill onto globalThis.
(globalThis as any).Buffer ??= BufferPolyfill;

// Imported *after* the Buffer global above is installed. The ECS pipeline
// (and the entity-system + `#platform/canvas.js` implementation it pulls in)
// uses a real global `Buffer` for its raw frame buffers.
type PipelineModule = typeof import('./entity-system/pipeline.js');
let pipelinePromise: Promise<PipelineModule> | undefined;

function loadPipeline(): Promise<PipelineModule> {
  pipelinePromise ??= import('./entity-system/pipeline.js');
  return pipelinePromise;
}

export interface RenderPreviewOptions {
  videoResolution: { width: number; height: number };
  words: string[];
  wordStartTimesSeconds: number[];
  wordEndTimesSeconds: number[];
  breakBefore?: boolean[];
  fps: number;
  layoutMode?: CaptionFlowLayoutMode;
  captionScale?: number;
  language?: string;
  previewWordState?: WordState;
  previewWordStateLayout?: PreviewWordStateLayout;
  fitPageToChildren?: boolean;
  allowContentOverflow?: boolean;
  captionLayout?: CaptionLayoutOverride;
  cursorAssetSources?: Readonly<Record<string, string>>;
  imageAssetSources?: Readonly<Record<string, string>>;
}

interface RenderPreviewFrameBase {
  width: number;
  height: number;
  debugFrame?: CaptionDebugFrame | undefined;
  hasAlpha?: boolean;
  opaquePixelCount?: number;
  alphaBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  blendModeLayers: RenderPreviewBlendModeLayer[];
}

export interface RenderPreviewBlendModeLayer {
  mode: BlendMode;
  buffer: Uint8Array;
  width: number;
  height: number;
}

export interface RenderPreviewRawFrame extends RenderPreviewFrameBase {
  kind: 'raw';
  buffer: Uint8Array;
}

export interface RenderPreviewBitmapFrame extends RenderPreviewFrameBase {
  kind: 'bitmap';
  bitmap: ImageBitmap;
}

export type RenderPreviewFrame = RenderPreviewRawFrame | RenderPreviewBitmapFrame;

export type RenderPreviewStreamFrame = RenderPreviewFrame & { frameIndex: number };

export interface RenderPreviewStreamRepeat {
  frameIndex: number;
  sourceFrameIndex: number;
  width: number;
  height: number;
}

export interface RenderPreviewStreamHandlers {
  onStart?: (metadata: RenderPreviewStart) => void;
  onFrame?: (frame: RenderPreviewStreamFrame) => void;
  onFrameRepeat?: (frame: RenderPreviewStreamRepeat) => void;
  isCancelled?: () => boolean;
  /** Use transferable ImageBitmap frames when the caller runs in an OffscreenCanvas worker. */
  preferBitmap?: boolean;
}

interface PipelineBlendModeLayer {
  mode: BlendMode;
  buffer: Uint8Array;
  width: number;
  height: number;
}

interface PipelineFrame {
  frameIndex: number;
  buffer: Uint8Array;
  width: number;
  height: number;
  blendModeLayers: PipelineBlendModeLayer[];
  debugFrame?: CaptionDebugFrame;
}

interface PipelineCanvasFrame {
  frameIndex: number;
  canvas: unknown;
  width: number;
  height: number;
  blendModeLayers: PipelineBlendModeLayer[];
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

interface PipelineFrameRepeat {
  frameIndex: number;
  sourceFrameIndex: number;
  width: number;
  height: number;
}

export interface RenderPreviewResult {
  frames: RenderPreviewFrame[];
  captionInfos: CaptionImageInfo[];
  frameSize: { width: number; height: number };
  /** Where the caption's `frameSize`-sized frame belongs within the full `videoResolution` canvas - see `computeOverlayPosition`. */
  placement: CaptionRenderPlacement;
  videoResolution: { width: number; height: number };
  /** Stable compact-preview crop, in pixels relative to the rendered frame. */
  stablePageCrop?: CaptionFrameCrop | undefined;
  videoTransform?: CaptionVideoTransform | undefined;
  /** Structural Page/Row/Word bounding boxes for the debug-grid overlay feature, if the engine computed any (empty caption text yields none). */
  debugLayout?: CaptionDebugLayout | undefined;
  captionLayoutDiagnostics?: CaptionLayoutDiagnostic[] | undefined;
}

/**
 * Converts a preview result's `placement` into the top-left pixel position
 * at which its `frameSize`-sized frames is drawn onto a
 * `videoResolution`-sized canvas (mirrors how the real render pipeline
 * composites the caption layer onto the source video).
 */
export function computeOverlayPosition(
  result: Pick<RenderPreviewResult, 'placement' | 'frameSize' | 'videoResolution'>,
): {
  x: number;
  y: number;
} {
  return computeOverlayPixelPosition(
    result.placement.verticalAlignment,
    result.placement.horizontalAlignment,
    result.videoResolution.width,
    result.videoResolution.height,
    result.frameSize.width,
    result.frameSize.height,
    result.placement.xOffset,
    result.placement.yOffset,
    result.placement.useSafeArea,
  );
}

function uint8ArrayView(buffer: Uint8Array): Uint8Array {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function transferCanvasFrame(frame: PipelineCanvasFrame): RenderPreviewBitmapFrame {
  const canvas = frame.canvas as {
    transferToImageBitmap?: () => ImageBitmap;
  };
  if (typeof canvas.transferToImageBitmap !== 'function') {
    throw new Error('The preview canvas cannot transfer an ImageBitmap.');
  }
  const bitmap = canvas.transferToImageBitmap();
  return {
    kind: 'bitmap',
    bitmap,
    width: frame.width,
    height: frame.height,
    ...(frame.debugFrame ? { debugFrame: frame.debugFrame } : {}),
    hasAlpha: frame.hasAlpha,
    opaquePixelCount: frame.opaquePixelCount,
    ...(frame.alphaBounds ? { alphaBounds: frame.alphaBounds } : {}),
    blendModeLayers: frame.blendModeLayers.map(transferBlendModeLayer),
  };
}

function transferBlendModeLayer(layer: PipelineBlendModeLayer): RenderPreviewBlendModeLayer {
  return {
    mode: layer.mode,
    buffer: uint8ArrayView(layer.buffer),
    width: layer.width,
    height: layer.height,
  };
}

/**
 * Renders a short preview clip using the real ECS engine: resolves registry
 * fonts before layout, serializes the studio's ECS `design` tree back to the
 * engine's on-disk node shape, then calls the real
 * `generateSubtitleImagesEcs`. The output contract
 * (`{allImageBuffers, frameSize, placement}`) matches what the compositors
 * consume, so the studio's frame handling is unchanged.
 */
export async function renderPresetPreview(
  preset: EcsCaptionPreset,
  options: RenderPreviewOptions,
): Promise<RenderPreviewResult> {
  return renderPresetPreviewInternal(preset, options);
}

/**
 * Renders a preview while emitting each frame as soon as the engine produces it.
 * Worker callers receive transferable ImageBitmap frames. Main-thread fallback
 * callers receive raw RGBA frames. The returned result keeps the same metadata
 * contract, but its `frames` array is empty because streamed callers receive
 * those frames through `handlers.onFrame`.
 */
export async function renderPresetPreviewStream(
  preset: EcsCaptionPreset,
  options: RenderPreviewOptions,
  handlers: RenderPreviewStreamHandlers,
): Promise<RenderPreviewResult> {
  return renderPresetPreviewInternal(preset, options, handlers);
}

async function renderPresetPreviewInternal(
  preset: EcsCaptionPreset,
  options: RenderPreviewOptions,
  handlers?: RenderPreviewStreamHandlers,
): Promise<RenderPreviewResult> {
  const [{ generateSubtitleImagesEcs }, { setCursorAssetSourceOverrides }, { setImageAssetSourceOverrides }] =
    await Promise.all([
      loadPipeline(),
      import('#platform/cursor-assets.js'),
      import('./entity-system/image-asset-overrides.js'),
    ]);
  setCursorAssetSourceOverrides(options.cursorAssetSources ?? {});
  setImageAssetSourceOverrides(options.imageAssetSources ?? {});

  const result = await generateSubtitleImagesEcs({
    videoResolution: options.videoResolution,
    timestamps: {
      words: options.words,
      word_start_times_seconds: options.wordStartTimesSeconds,
      word_end_times_seconds: options.wordEndTimesSeconds,
      ...(options.breakBefore === undefined ? {} : { break_before: options.breakBefore }),
    },
    design: preset.design,
    stateWindow: preset.stateWindow,
    captionLayout: mergeCaptionLayoutPolicy(preset.captionLayout, options.captionLayout),
    fps: options.fps,
    ...(options.layoutMode === undefined ? {} : { layoutMode: options.layoutMode }),
    captionScale: options.captionScale ?? 1,
    ...(options.language === undefined ? {} : { language: options.language }),
    ...(options.previewWordState === undefined ? {} : { previewWordState: options.previewWordState }),
    ...(options.previewWordStateLayout === undefined
      ? {}
      : { previewWordStateLayout: options.previewWordStateLayout }),
    ...(options.fitPageToChildren ? { fitPageToChildren: true } : {}),
    ...(options.allowContentOverflow ? { allowContentOverflow: true } : {}),
    collectBlendModeLayers: true,
    debug: true,
    collectFrames: handlers === undefined,
    ...(handlers
      ? {
          ...(handlers.onStart ? { onStart: handlers.onStart } : {}),
          ...(handlers.isCancelled ? { isCancelled: handlers.isCancelled } : {}),
          ...(handlers.preferBitmap
            ? {
                ...(handlers.onFrame
                  ? {
                      onCanvasFrame: (frame: PipelineCanvasFrame) =>
                        handlers.onFrame?.({ frameIndex: frame.frameIndex, ...transferCanvasFrame(frame) }),
                    }
                  : {}),
                ...(handlers.onFrameRepeat
                  ? { onFrameRepeat: (frame: PipelineFrameRepeat) => handlers.onFrameRepeat?.(frame) }
                  : {}),
              }
            : {
                ...(handlers.onFrame
                  ? {
                      onFrame: (frame: PipelineFrame) =>
                        handlers.onFrame?.({
                          kind: 'raw',
                          frameIndex: frame.frameIndex,
                          buffer: uint8ArrayView(frame.buffer),
                          width: frame.width,
                          height: frame.height,
                          ...(frame.debugFrame ? { debugFrame: frame.debugFrame } : {}),
                          blendModeLayers: frame.blendModeLayers.map(transferBlendModeLayer),
                        }),
                    }
                  : {}),
              }),
        }
      : {}),
  });

  return {
    frames:
      handlers === undefined
        ? result.allImageBuffers.map((buffer, index) => ({
            kind: 'raw' as const,
            buffer: new Uint8Array(buffer),
            width: result.frameSize.width,
            height: result.frameSize.height,
            blendModeLayers: (result.allBlendModeLayers?.[index] ?? []).map(transferBlendModeLayer),
          }))
        : [],
    captionInfos: result.captionInfos,
    frameSize: result.frameSize,
    placement: result.placement,
    videoResolution: options.videoResolution,
    stablePageCrop: result.stablePageCrop,
    videoTransform: result.videoTransform,
    debugLayout: result.debugLayout,
    captionLayoutDiagnostics: result.captionLayoutDiagnostics,
  };
}
