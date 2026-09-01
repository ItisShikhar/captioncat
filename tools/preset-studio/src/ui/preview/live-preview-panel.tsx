import type { CaptionDebugPageSize, CaptionDebugTransform } from '@captioncat/caption-engine/browser';
import type { AnimationDoc, EcsEntityDoc, PresetEditorState, PropertyNode } from '@/schema';
import type { Paint } from '@/schema/paint';
import { MAX_MOTION_BLUR_STEPS } from '@captioncat/caption-engine/browser';
import { PastelDotLoader } from '@/ui/components/pastel-dot-loader';
import { preview } from '@/ui/constants';
import { ColorInput, PaintInput, paintToCss } from '@/ui/controls/color-field';
import { Card } from '@/ui/shadcn/card';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/ui/shadcn/select';
import { AlertTriangle, Ratio, RectangleHorizontal, RectangleVertical, Square } from 'lucide-react';
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type PointerEventHandler,
  type RefObject,
} from 'react';
import {
  ASPECT_RATIO_OPTIONS,
  PREVIEW_DURATION_SECONDS,
  PREVIEW_FPS,
  resolutionForAspect,
  type PreviewQuality,
} from './aspect-ratios';
import {
  BACKGROUND_FIXTURES,
  CAPTION_STORIES,
  getCaptionLanguagesForStory,
  getCaptionText,
  getPreviewBackground,
  GRADIENT_BACKGROUND_ID,
  SOLID_COLOR_BACKGROUND_ID,
} from './data';
import {
  DEBUG_OVERLAY_SURFACE_ENTITY_KINDS,
  debugOverlayEntriesForPreset,
  debugOverlayOptionsForPreset,
  findEntityByKind,
  resolvePreviewOverlayVisibilityForRender,
  type DebugEntityKind,
  type PaddingPreviewTarget,
  type PositionPreviewTarget,
  type PreviewOverlayVisibility,
} from './entity-debug';
import { EntityDebugOverlay } from './entity-debug-overlay';
import { PreviewOverlayControls } from './preview-overlay-controls';
import {
  PreviewControlLabel,
  PreviewLanguageOptionLabel,
  PreviewPlaybackActions,
  PreviewPlaybackControls,
} from './preview-playback-controls';
import { PreviewPlayer } from './preview-player';
import { NOOP_PREVIEW_SURFACE_DRAG_START, PreviewSurfaceDragHandle } from './preview-surface-drag-handle';
import { HAND_CURSOR } from './preview-cursor';
import { PreviewSurfaceResizeHandle, type PreviewSurfaceResizeSide } from './preview-surface-resize-handle';
import { PreviewTextSourceControls, type PreviewTextMode } from './preview-text-source-controls';
import { buildSampleTimestamps, buildWordTimestamps, type SampleTimestamps } from './preview-timestamps';
import { parseSrtWordCaptions } from './srt-captions';
import { usePlaybackBitmaps } from './use-playback-bitmaps';
import { usePreviewPlaybackPosition } from './use-preview-playback-position';
import { usePreviewRenderer } from './use-preview-renderer';
import {
  isHierarchyDragActive,
  subscribeToHierarchyDragState,
} from '../panels/design-editor/entity-tree';

export interface LivePreviewPanelProps {
  preset: PresetEditorState;
  /** Whether this surface can start a new engine render. */
  renderEnabled: boolean;
  /** Ref and display-only transform for the draggable preview body. Heading chrome stays fixed above it. */
  viewportRef?: RefObject<HTMLDivElement | null>;
  viewportStyle?: CSSProperties;
  /** Shared graph zoom used to keep debug overlay dimensions stable in screen pixels. */
  viewportZoom?: number;
  /** Whether the outer preview surface is actively handling a pan gesture. */
  isPanning: boolean;
  /** Whether this preview is the currently active playback surface. */
  isPlaying: boolean;
  /** Requests this preview become active or release playback. */
  onPlayingChange: (playing: boolean) => void;
  /** Starts moving this preview surface from its explicit toolbar handle. */
  onSurfaceDragStart?: PointerEventHandler<HTMLElement>;
  /** Whether this surface is positioned in the workspace. */
  isSurfaceDragging?: boolean;
  /** Whether this surface shows its corner resize handles. */
  resizable?: boolean;
  /** Whether this surface is actively being resized. */
  isResizing?: boolean;
  onResizeStart?: (side: PreviewSurfaceResizeSide, event: ReactPointerEvent<HTMLElement>) => void;
  /**
   * Aspect ratio / sample background / caption language / text source are
   * lifted up to the caller (`app.tsx`) rather than kept as local state here,
   * so they persist across preset switches - this panel is remounted
   * (`key={...}`) whenever the selected preset changes, which
   * otherwise silently resets them to their defaults every time.
   */
  aspectId: string;
  onAspectIdChange: (id: string) => void;
  previewQuality: PreviewQuality;
  onPreviewQualityChange: (quality: PreviewQuality) => void;
  playbackSpeed: number;
  onPlaybackSpeedChange: (speed: number) => void;
  backgroundId: string;
  onBackgroundIdChange: (id: string) => void;
  backgroundColor: string;
  onBackgroundColorChange: (color: string) => void;
  backgroundPaint: Paint;
  onBackgroundPaintChange: (paint: Paint) => void;
  storyId: string;
  onStoryIdChange: (id: string) => void;
  textMode: PreviewTextMode;
  onTextModeChange: (mode: PreviewTextMode) => void;
  customText: string;
  onCustomTextChange: (text: string) => void;
  languageId: string;
  onLanguageIdChange: (id: string) => void;
  /** Which entity's debug grid (Composition Area/Page/Row/Word) to highlight over the preview, if any - see `entity-debug.ts`. */
  hoveredEntity?: DebugEntityKind | null;
  /** Per-preview debug overlay visibility and menu selection. */
  overlayVisibility: PreviewOverlayVisibility;
  onOverlayVisibilityChange: (updater: (current: PreviewOverlayVisibility) => PreviewOverlayVisibility) => void;
  /** Temporary padding preview driven by the inspector's leading padding icons. */
  hoveredPaddingPreviewTarget?: PaddingPreviewTarget | null;
  /** Temporary position preview driven by the Transform position icon or entity debug icon. */
  hoveredPositionPreviewTarget?: PositionPreviewTarget | null;
  /** Whether to additionally show Composition Area's padding-adjusted "content" box and offset arrow when hovering it - see `DesignEditor`'s padding toggle next to the entity icon. */
  showCompositionAreaPadding?: boolean;
  /**
   * Reports the caption region's real, engine-computed content size (the
   * rendered Page's natural bounding box, from `debugLayout`) as a percentage
   * of the video resolution, every time it changes. Lets the design editor's
   * Width/Height Percent fields populate with this real value - instead of a
   * flat, meaningless 100% - the moment the user turns "Auto" off.
   */
  onCompositionAreaAutoPercentsChange?: (percents: CompositionAreaAutoPercents | null) => void;
  /** Reports the engine-resolved internal frame represented by the viewport Transform. */
  onViewportFrameSizeChange?: (size: ViewportFrameSize | null) => void;
  /** Reports settled local Transform values and layout sizes for inspector fields. */
  onResolvedTransformsChange?: (transforms: CaptionDebugTransform[] | null) => void;
  /** Reports the minimum Page size required by the current caption layout. */
  onMinimumPageSizeChange?: (size: CaptionDebugPageSize | null) => void;
}

export interface CompositionAreaAutoPercents {
  widthPercent: number;
  heightPercent: number;
}

export interface ViewportFrameSize {
  width: number;
  height: number;
  videoResolution?: {
    width: number;
    height: number;
  };
}

function useHierarchyDragActive(): boolean {
  return useSyncExternalStore(
    subscribeToHierarchyDragState,
    isHierarchyDragActive,
    () => false,
  );
}

interface VideoEntityTransform {
  rotation: number;
  scale: { x: number; y: number };
  position: { x: number; y: number };
  opacity: number;
}

interface ViewportEntityTransform {
  rotation: number;
  scale: { x: number; y: number };
  position: { x: number; y: number };
  opacity: number;
}

const IDENTITY_VIDEO_ENTITY_TRANSFORM: VideoEntityTransform = {
  rotation: 0,
  scale: { x: 1, y: 1 },
  position: { x: 0, y: 0 },
  opacity: 1,
};

function leafNumber(node: PropertyNode | undefined, fallback: number): number {
  return node?.kind === 'leaf' && typeof node.value === 'number' ? node.value : fallback;
}

function leafVector2(node: PropertyNode | undefined, fallback: { x: number; y: number }): { x: number; y: number } {
  if (node?.kind !== 'leaf' || node.type !== 'vector2' || typeof node.value !== 'object' || node.value === null) {
    return fallback;
  }
  const value = node.value as { x?: unknown; y?: unknown };
  return {
    x: typeof value.x === 'number' ? value.x : fallback.x,
    y: typeof value.y === 'number' ? value.y : fallback.y,
  };
}

function extractVideoEntityTransform(root: EcsEntityDoc): VideoEntityTransform {
  const videoEntity = findEntityByKind(root, 'video');
  const transform = videoEntity?.components.find((component) => component.component === 'transform');
  if (!transform) return IDENTITY_VIDEO_ENTITY_TRANSFORM;
  return {
    rotation: leafNumber(transform.props.rotation, 0),
    scale: leafVector2(transform.props.scale, { x: 1, y: 1 }),
    position: leafVector2(transform.props.position, { x: 0, y: 0 }),
    opacity: leafNumber(transform.props.opacity, 1),
  };
}

/** The Video entity's own Blur effect radius (if any). The separate video-layer compositor applies it directly. */
function extractBlurRadius(root: EcsEntityDoc): number {
  const videoEntity = findEntityByKind(root, 'video');
  const blur = videoEntity?.effects.find((effect) => effect.effect === 'blur');
  return leafNumber(blur?.props.blurRadius, 0);
}

interface VideoBorder {
  width: number;
  color: string;
  position: 'inner' | 'center' | 'outer';
  style: 'solid' | 'dashed' | 'dotted';
}

function extractVideoBorder(root: EcsEntityDoc): VideoBorder | null {
  const videoEntity = findEntityByKind(root, 'video');
  const border = videoEntity?.effects.find((effect) => effect.effect === 'border');
  if (!border || (border.props.enabled?.kind === 'leaf' && border.props.enabled.value === false)) return null;
  const rawPosition = border.props.position?.kind === 'leaf' ? String(border.props.position.value ?? 'outer') : 'outer';
  const position = rawPosition === 'inner' || rawPosition === 'center' ? rawPosition : 'outer';
  const rawStyle = border.props.style?.kind === 'leaf' ? String(border.props.style.value ?? 'solid') : 'solid';
  const style = rawStyle === 'dashed' || rawStyle === 'dotted' ? rawStyle : 'solid';
  return {
    width: Math.max(0, leafNumber(border.props.width, 0)),
    color: border.props.color?.kind === 'leaf' ? String(border.props.color.value ?? '') : '',
    position,
    style,
  };
}

export interface VideoMotionBlur {
  distance: number;
  angle?: number;
  steps: number;
  maxOpacity: number;
  showOriginal: 'none' | 'front' | 'back';
  isStreak: boolean;
  compositionScale: number;
  animationTargetPrefix?: string;
}

const NO_VIDEO_MOTION_BLUR: VideoMotionBlur = {
  distance: 0,
  angle: undefined,
  steps: 0,
  maxOpacity: 1,
  showOriginal: 'none',
  isStreak: false,
  compositionScale: 1,
};

function extractVideoMotionBlur(root: EcsEntityDoc, compositionScale = 1): VideoMotionBlur {
  const videoEntity = findEntityByKind(root, 'video');
  const motionBlur = videoEntity?.effects.find((effect) => effect.effect === 'motionBlur' || effect.effect === 'streak');
  if (
    !motionBlur ||
    (motionBlur.props.enabled?.kind === 'leaf' && motionBlur.props.enabled.value === false)
  ) {
    return NO_VIDEO_MOTION_BLUR;
  }
  const angle = motionBlur.props.angle;
  const showOriginalValue =
    motionBlur.props.showOriginal?.kind === 'leaf' ? String(motionBlur.props.showOriginal.value ?? 'none') : 'none';
  const resolvedCompositionScale =
    Number.isFinite(compositionScale) && compositionScale > 0 ? compositionScale : 1;
  return {
    distance: Math.max(0, leafNumber(motionBlur.props.distance, 0)),
    angle: angle?.kind === 'leaf' && typeof angle.value === 'number' ? angle.value : undefined,
    steps: Math.min(MAX_MOTION_BLUR_STEPS, Math.max(0, Math.floor(leafNumber(motionBlur.props.steps, 0)))),
    maxOpacity: Math.min(1, Math.max(0, leafNumber(motionBlur.props.maxOpacity, 1))),
    showOriginal:
      showOriginalValue === 'front' || showOriginalValue === 'back' ? showOriginalValue : 'none',
    isStreak: motionBlur.effect === 'streak',
    compositionScale: resolvedCompositionScale,
    animationTargetPrefix: motionBlur.id
      ? `${motionBlur.effect === 'streak' ? 'Streak' : 'MotionBlur'}#${motionBlur.id}.`
      : undefined,
  };
}

function extractVideoAnimations(root: EcsEntityDoc): AnimationDoc[] {
  const videoEntity = findEntityByKind(root, 'video');
  return (videoEntity?.components ?? [])
    .filter((component) => component.component === 'animation' && component.animation)
    .map((component) => component.animation as AnimationDoc);
}

function extractViewportEntityTransform(root: EcsEntityDoc): ViewportEntityTransform {
  const viewportEntity = findEntityByKind(root, 'viewport');
  const transform = viewportEntity?.components.find((component) => component.component === 'transform');
  if (!transform) return IDENTITY_VIDEO_ENTITY_TRANSFORM;
  return {
    rotation: leafNumber(transform.props.rotation, 0),
    scale: leafVector2(transform.props.scale, { x: 1, y: 1 }),
    position: leafVector2(transform.props.position, { x: 0, y: 0 }),
    opacity: leafNumber(transform.props.opacity, 1),
  };
}

/** Fixed-pixel squircle rounding (not a %) so corners stay circular - not stretched - across every aspect ratio. */
const PREVIEW_RADIUS_CLASS = 'rounded-[0px]';
const PREVIEW_QUALITY_CROSSFADE_MS = 200;

/**
 * Renders the preset's `design` through the real captioning engine (via the
 * browser engine adapter) and plays it back looping over a sample background,
 * with switchable aspect ratios/resolutions. This is a genuine render of
 * the current design, not an approximation - the exact same code path used
 * to burn captions into real videos runs here in the browser.
 */
export const LivePreviewPanel = memo(function LivePreviewPanel({
  preset,
  renderEnabled,
  viewportRef,
  viewportStyle,
  viewportZoom = 1,
  isPanning,
  isPlaying,
  onPlayingChange,
  onSurfaceDragStart,
  isSurfaceDragging = false,
  resizable = false,
  isResizing = false,
  onResizeStart,
  aspectId,
  onAspectIdChange,
  previewQuality,
  onPreviewQualityChange,
  playbackSpeed,
  onPlaybackSpeedChange,
  backgroundId,
  onBackgroundIdChange,
  backgroundColor,
  onBackgroundColorChange,
  backgroundPaint,
  onBackgroundPaintChange,
  storyId,
  onStoryIdChange,
  textMode,
  onTextModeChange,
  customText,
  onCustomTextChange,
  languageId,
  onLanguageIdChange,
  hoveredEntity = null,
  overlayVisibility,
  onOverlayVisibilityChange,
  hoveredPaddingPreviewTarget = null,
  hoveredPositionPreviewTarget = null,
  showCompositionAreaPadding = false,
  onCompositionAreaAutoPercentsChange,
  onViewportFrameSizeChange,
  onResolvedTransformsChange,
  onMinimumPageSizeChange,
}: LivePreviewPanelProps) {
  const debugOverlayOptions = useMemo(
    () => debugOverlayOptionsForPreset(preset.design, DEBUG_OVERLAY_SURFACE_ENTITY_KINDS.live),
    [preset.design],
  );
  const effectiveOverlayVisibility = useMemo(
    () => resolvePreviewOverlayVisibilityForRender(overlayVisibility, debugOverlayOptions),
    [debugOverlayOptions, overlayVisibility],
  );
  const debugOverlayKinds = useMemo(
    () =>
      debugOverlayEntriesForPreset({
        visibility: effectiveOverlayVisibility,
        allowedEntityKinds: debugOverlayOptions.entities,
        hoveredEntity,
        hoveredPaddingPreviewTarget,
        hoveredPositionPreviewTarget,
      }),
    [
      effectiveOverlayVisibility,
      debugOverlayOptions.entities,
      hoveredEntity,
      hoveredPositionPreviewTarget,
      hoveredPaddingPreviewTarget,
    ],
  );
  // Live playback frame index, reported up by `PreviewPlayer` on every
  // change - lets `EntityDebugOverlay` track each word's real per-frame
  // animation instead of a single frozen snapshot.
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [loop, setLoop] = useState<boolean>(preview.live.defaultLoop);
  const isHierarchyDragActive = useHierarchyDragActive();
  const previewPlaying = isPlaying && !isHierarchyDragActive;

  const aspect = ASPECT_RATIO_OPTIONS.find((a) => a.id === aspectId) ?? ASPECT_RATIO_OPTIONS[0];
  const background = useMemo(
    () =>
      backgroundId === SOLID_COLOR_BACKGROUND_ID || backgroundId === GRADIENT_BACKGROUND_ID
        ? null
        : getPreviewBackground(backgroundId, backgroundColor),
    [backgroundColor, backgroundId],
  );
  const canvasBackgroundPaint = useMemo<Paint>(
    () => (backgroundId === GRADIENT_BACKGROUND_ID ? backgroundPaint : { type: 'solid', color: backgroundColor }),
    [backgroundColor, backgroundId, backgroundPaint],
  );
  const viewportEntityTransform = useMemo(() => extractViewportEntityTransform(preset.design), [preset.design]);
  const videoEntityTransform = useMemo(() => extractVideoEntityTransform(preset.design), [preset.design]);
  const blurRadius = useMemo(() => extractBlurRadius(preset.design), [preset.design]);
  const videoBorder = useMemo(() => extractVideoBorder(preset.design), [preset.design]);
  const videoAnimations = useMemo(() => extractVideoAnimations(preset.design), [preset.design]);

  // Measure the untransformed surface so the player can size itself without
  // making the toolbar or footer part of a flex spacer.
  const previewSurfaceRef = useRef<HTMLDivElement>(null);
  const previewToolbarRef = useRef<HTMLDivElement>(null);
  const previewFooterRef = useRef<HTMLParagraphElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [qualitySnapshotUrl, setQualitySnapshotUrl] = useState<string | null>(null);
  const [qualityTransitionActive, setQualityTransitionActive] = useState(false);
  useEffect(() => {
    if (renderEnabled) return;
    setQualitySnapshotUrl(null);
    setQualityTransitionActive(false);
    setCurrentFrameIndex(0);
  }, [renderEnabled]);
  const [availableSize, setAvailableSize] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const surface = previewSurfaceRef.current;
    if (!surface) return;

    const commit = (width: number, height: number) => {
      setAvailableSize((prev) => {
        // Ignore sub-pixel layout churn so the visible box does not thrash.
        if (prev && Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1) return prev;
        return { width, height };
      });
    };

    const measure = (): void => {
      const toolbarHeight = previewToolbarRef.current?.offsetHeight ?? 0;
      const footerHeight = previewFooterRef.current?.offsetHeight ?? 0;
      const viewportElement = viewportRef?.current;
      const gap = viewportElement ? Number.parseFloat(getComputedStyle(viewportElement).rowGap) || 0 : 0;
      const width = surface.clientWidth;
      const height = surface.clientHeight - toolbarHeight - footerHeight - gap * 2;
      if (width > 0 && height > 0) commit(width, height);
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(surface);
    if (previewToolbarRef.current) observer.observe(previewToolbarRef.current);
    if (previewFooterRef.current) observer.observe(previewFooterRef.current);

    return () => observer.disconnect();
  }, [viewportRef]);

  // The aspect-ratio-constrained box size that fits within the available
  // wrapper space (preserving `aspect.width`/`aspect.height`'s ratio),
  // computed directly instead of leaving it to CSS `aspect-ratio` sizing on
  // a non-stretched flex item (see above).
  const boxSize = useMemo(() => {
    if (!availableSize || availableSize.width <= 0 || availableSize.height <= 0) return null;
    const ratio = aspect.width / aspect.height;
    let width = availableSize.width;
    let height = width / ratio;
    if (height > availableSize.height) {
      height = availableSize.height;
      width = height * ratio;
    }
    const scale = preview.live.physicalCanvas.sizeScaling[aspect.ratio];
    return {
      width: Math.max(1, Math.floor(width * scale)),
      height: Math.max(1, Math.floor(height * scale)),
    };
  }, [aspect, availableSize]);

  // Keep the internal canvas resolution stable while the panel's CSS box
  // resizes. Only aspect-ratio and quality changes must rerender the engine.
  const previewRenderScale = preview.live.renderCanvas.qualityScale[previewQuality];
  const renderResolution = useMemo(() => {
    const baseResolution = resolutionForAspect(aspect);
    return {
      width: Math.max(1, Math.round(baseResolution.width * previewRenderScale)),
      height: Math.max(1, Math.round(baseResolution.height * previewRenderScale)),
    };
  }, [aspect, previewRenderScale]);

  // Stories and backgrounds are independent preview inputs. A background
  // change never changes the selected story or its language.
  const languages = useMemo(() => getCaptionLanguagesForStory(storyId), [storyId]);
  const captionText = useMemo(() => getCaptionText(storyId, languageId), [languageId, storyId]);
  const customWords = useMemo(() => customText.trim().split(/\s+/).filter(Boolean), [customText]);
  useEffect(() => {
    if (!languages.some((lang) => lang.id === languageId)) {
      onLanguageIdChange(languages[0]?.id ?? '');
    }
  }, [languages, languageId, onLanguageIdChange]);

  const [timestamps, setTimestamps] = useState<SampleTimestamps>(() => buildSampleTimestamps(PREVIEW_DURATION_SECONDS));
  useEffect(() => {
    setTimestamps(
      textMode === 'custom'
        ? buildWordTimestamps(customWords, PREVIEW_DURATION_SECONDS)
        : captionText
          ? parseSrtWordCaptions(captionText)
          : buildSampleTimestamps(PREVIEW_DURATION_SECONDS),
    );
  }, [captionText, customWords, textMode]);
  const playbackResetKey = useMemo(
    () => ({
      preset,
      width: renderResolution.width,
      height: renderResolution.height,
      languageId,
      previewQuality,
      renderEnabled,
      timestamps,
    }),
    [preset, renderResolution.height, renderResolution.width, languageId, previewQuality, renderEnabled, timestamps],
  );
  const {
    currentTimeSeconds,
    onPlaybackTimeChange,
    onSeek,
    seekRequestId,
    seekTimeMs,
  } = usePreviewPlaybackPosition(timestamps.durationSeconds, playbackResetKey);

  // A new render starts at the first frame. The playback state itself remains
  // unchanged, so paused previews stay paused and playing previews keep playing.
  const { status, error, result } = usePreviewRenderer(
    preset,
    renderResolution.width,
    renderResolution.height,
    timestamps,
    languageId,
    previewQuality,
    'main',
    undefined,
    renderEnabled,
    undefined,
    undefined,
    undefined,
  );
  const { bitmaps, blendModeLayers, overlay, decoding, isCurrentResultActive } = usePlaybackBitmaps(result, {
    clear: !renderEnabled,
    playing: previewPlaying,
    decodeAllFrames: currentTimeSeconds > 0,
  });
  const hasPreview = Boolean(bitmaps && bitmaps.length > 0 && overlay);
  const isRenderPending = status === 'loading' || decoding;
  const qualityFrameReady =
    result?.videoResolution.width === renderResolution.width &&
    result.videoResolution.height === renderResolution.height &&
    isCurrentResultActive &&
    hasPreview;

  useEffect(() => {
    if (!qualityTransitionActive) return;
    if (status === 'error' || qualityFrameReady) setQualityTransitionActive(false);
  }, [qualityFrameReady, qualityTransitionActive, status]);

  useEffect(() => {
    if (!qualitySnapshotUrl || qualityTransitionActive) return;
    const timeout = window.setTimeout(() => setQualitySnapshotUrl(null), PREVIEW_QUALITY_CROSSFADE_MS);
    return () => window.clearTimeout(timeout);
  }, [qualitySnapshotUrl, qualityTransitionActive]);

  // The caption region's real, engine-resolved size - read from
  // `debugLayout.compositionArea` (the same box `EntityDebugOverlay` draws
  // for the Composition Area entity), which is the actual region rect
  // `widthPercent`/`heightPercent` control. This must NOT be derived from
  // `frames[0].page` (the rendered *text*'s own tight bounding box): when
  // `compositionArea` is unset or its percent fields are literally "auto",
  // the engine resolves that to a full-bleed 100%x100% region (see
  // the ECS composition-area resolver) regardless of
  // how little of that region the text fills, so using the text's
  // footprint here previously produced a "real value" wildly smaller than
  // what the region truly measures - for example, reporting "Auto (18%)" for a
  // region that is visibly, and correctly, drawn spanning the entire frame.
  const compositionAreaAutoPercents = useMemo<CompositionAreaAutoPercents | null>(() => {
    if (!result?.debugLayout) return null;
    const { scale, compositionArea } = result.debugLayout;
    const widthPx = (compositionArea.right - compositionArea.left) * scale;
    const heightPx = (compositionArea.bottom - compositionArea.top) * scale;
    if (!(widthPx > 0) || !(heightPx > 0)) return null;
    return {
      widthPercent: Math.min(100, Math.round((widthPx / result.videoResolution.width) * 100)),
      heightPercent: Math.min(100, Math.round((heightPx / result.videoResolution.height) * 100)),
    };
  }, [result]);

  const videoBounds = useMemo(() => {
    if (!result?.debugLayout?.video) return null;
    const { scale, video } = result.debugLayout;
    return {
      x: video.left * scale,
      y: video.top * scale,
      width: (video.right - video.left) * scale,
      height: (video.bottom - video.top) * scale,
    };
  }, [result]);
  const videoMotionBlur = useMemo(
    () => extractVideoMotionBlur(preset.design, result?.debugLayout?.scale),
    [preset.design, result?.debugLayout?.scale],
  );
  const videoAreaBounds = useMemo(() => {
    if (!result?.debugLayout?.videoArea) return null;
    const { scale, videoArea } = result.debugLayout;
    return {
      x: videoArea.left * scale,
      y: videoArea.top * scale,
      width: (videoArea.right - videoArea.left) * scale,
      height: (videoArea.bottom - videoArea.top) * scale,
    };
  }, [result]);
  const viewportBounds = useMemo(() => {
    if (!result?.debugLayout?.viewport) return null;
    const { scale, viewport } = result.debugLayout;
    return {
      x: viewport.left * scale,
      y: viewport.top * scale,
      width: (viewport.right - viewport.left) * scale,
      height: (viewport.bottom - viewport.top) * scale,
    };
  }, [result]);
  const viewportFrameSize = useMemo<ViewportFrameSize | null>(() => {
    const viewport = result?.debugLayout?.viewport;
    if (!viewport) return null;
    const width = viewport.right - viewport.left;
    const height = viewport.bottom - viewport.top;
    return width > 0 && height > 0
      ? {
          width,
          height,
          videoResolution: result?.videoResolution,
        }
      : null;
  }, [result]);
  const resolvedTransforms = result?.debugLayout?.resolvedTransforms ?? null;
  const minimumPageSize = result?.debugLayout?.minimumPageSize ?? null;
  useEffect(() => {
    onCompositionAreaAutoPercentsChange?.(compositionAreaAutoPercents);
  }, [compositionAreaAutoPercents, onCompositionAreaAutoPercentsChange]);
  useEffect(() => {
    onViewportFrameSizeChange?.(isRenderPending ? null : viewportFrameSize);
  }, [isRenderPending, onViewportFrameSizeChange, viewportFrameSize]);
  useEffect(() => {
    onResolvedTransformsChange?.(resolvedTransforms);
  }, [isRenderPending, onResolvedTransformsChange, resolvedTransforms]);
  useEffect(() => {
    if (isRenderPending) return;
    onMinimumPageSizeChange?.(minimumPageSize);
  }, [isRenderPending, minimumPageSize, onMinimumPageSizeChange]);

  // True for the *entire* span of a render - from kicking off the real-engine
  // compute through decoding its raw frames into bitmaps - not only the
  // network/compute half. Without `decoding` here, the indicator (and the
  // auto-resume below) fires the instant the engine finishes computing,
  // while the new frames are still in background decoding.
  const isRendering = isRenderPending;

  // The "Rendering" overlay can otherwise flash for far less than one full
  // spin-animation cycle (some renders resolve in well under 100ms), which
  // reads as a static blink rather than a spin. Keep it mounted for at least
  // `MIN_RENDERING_VISIBLE_MS` once shown so the spin is perceptible.
  const MIN_RENDERING_VISIBLE_MS = 450;
  const [renderingVisible, setRenderingVisible] = useState(false);
  const renderingShownAtRef = useRef<number | null>(null);
  useEffect(() => {
    let hideTimeout: ReturnType<typeof setTimeout> | undefined;
    if (isRendering) {
      if (renderingShownAtRef.current === null) {
        renderingShownAtRef.current = performance.now();
      }
      setRenderingVisible(true);
    } else if (renderingShownAtRef.current !== null) {
      const elapsed = performance.now() - renderingShownAtRef.current;
      const remaining = MIN_RENDERING_VISIBLE_MS - elapsed;
      if (remaining > 0) {
        hideTimeout = setTimeout(() => {
          renderingShownAtRef.current = null;
          setRenderingVisible(false);
        }, remaining);
      } else {
        renderingShownAtRef.current = null;
        setRenderingVisible(false);
      }
    }
    return () => clearTimeout(hideTimeout);
  }, [isRendering]);

  const handlePreviewQualityChange = (nextQuality: PreviewQuality) => {
    if (nextQuality === previewQuality) return;
    const canvas = previewCanvasRef.current;
    if (canvas && canvas.width > 0 && canvas.height > 0) {
      try {
        setQualitySnapshotUrl(canvas.toDataURL());
        setQualityTransitionActive(true);
      } catch {
        setQualitySnapshotUrl(null);
        setQualityTransitionActive(false);
      }
    } else {
      setQualitySnapshotUrl(null);
      setQualityTransitionActive(false);
    }
    onPreviewQualityChange(nextQuality);
  };

  // Playback is now purely user-controlled by the playback controls. Edits no
  // no longer force a pause or resume around themselves.
  // see the render-hook wiring above for why that is safe.
  const isEmbeddedSurface = viewportStyle === undefined;
  const onPreviewBarPointerDown: PointerEventHandler<HTMLDivElement> = (event) => {
    if (event.button === 1) return;
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest('button, input, select, textarea, [role="button"], [role="combobox"]')
    ) {
      return;
    }
    onSurfaceDragStart?.(event);
  };

  return (
    <div
      ref={previewSurfaceRef}
      className="relative h-full min-h-0 w-full overflow-visible"
      data-preview-viewport-surface="true"
    >
      <div
        ref={viewportRef}
        className={
          isEmbeddedSurface
            ? 'relative flex h-full min-h-0 w-full max-w-none flex-col items-center justify-start gap-3'
            : 'absolute flex h-max w-max max-w-none flex-col items-center justify-start gap-3'
        }
        style={viewportStyle}
        data-preview-viewport="true"
      >
        <Card
          ref={previewToolbarRef}
          className={`shrink-0 flex-col items-stretch gap-2 p-2 ${
            isEmbeddedSurface
              ? 'w-max max-w-none flex-nowrap overflow-visible'
              : 'w-max max-w-none flex-nowrap overflow-hidden'
          } ${isSurfaceDragging ? 'cursor-grabbing' : 'cursor-default'}`}
          style={isSurfaceDragging ? { cursor: HAND_CURSOR } : undefined}
          onPointerDown={onPreviewBarPointerDown}
          data-preview-control-bar="true"
          data-preview-viewport-chrome="true"
        >
          <div className="flex min-w-0 items-stretch gap-3">
            <PreviewSurfaceDragHandle
              previewTitle="Live Preview"
              isDragging={isSurfaceDragging}
              idleCursor="cursor-pointer"
              showGrabCursorOnHover
              onPointerDown={onSurfaceDragStart ?? NOOP_PREVIEW_SURFACE_DRAG_START}
            />
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex min-w-0 items-end gap-2">
                <div className="flex shrink-0 flex-col gap-1">
                  <PreviewControlLabel>Aspect</PreviewControlLabel>
                  <Select value={aspectId} onValueChange={onAspectIdChange}>
                    <SelectTrigger className="h-8 w-fit min-w-max shrink-0 cursor-pointer justify-start gap-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="w-fit min-w-0">
                      {ASPECT_RATIO_OPTIONS.map((option) => (
                        <SelectItem key={option.id} value={option.id} className="cursor-pointer">
                          {option.icon === 'landscape' ? (
                            <RectangleHorizontal className="size-3.5" />
                          ) : option.icon === 'portrait' ? (
                            <RectangleVertical className="size-3.5" />
                          ) : option.icon === 'square' ? (
                            <Square className="size-3.5" />
                          ) : (
                            <Ratio className="size-3.5" />
                          )}
                          <span>{option.label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <PreviewPlaybackControls
                  previewQuality={previewQuality}
                  onPreviewQualityChange={handlePreviewQualityChange}
                  showLabels
                  showLanguage={false}
                  playbackSpeed={playbackSpeed}
                  onPlaybackSpeedChange={onPlaybackSpeedChange}
                  languageId={languageId}
                  languages={languages}
                  onLanguageIdChange={onLanguageIdChange}
                />

                <div className="flex shrink-0 flex-col gap-1">
                  <PreviewControlLabel>Background</PreviewControlLabel>
                  <div className="flex items-center gap-2">
                    <Select value={backgroundId} onValueChange={onBackgroundIdChange}>
                      <SelectTrigger className="h-8 w-fit min-w-max shrink-0 cursor-pointer">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BACKGROUND_FIXTURES.filter((option) => option.id !== SOLID_COLOR_BACKGROUND_ID).map(
                          (option) => (
                            <SelectItem key={option.id} value={option.id} className="cursor-pointer">
                              {option.name}
                            </SelectItem>
                          ),
                        )}
                        <SelectSeparator />
                        <SelectItem value={SOLID_COLOR_BACKGROUND_ID} className="cursor-pointer">
                          Solid Fill
                        </SelectItem>
                        <SelectItem value={GRADIENT_BACKGROUND_ID} className="cursor-pointer">
                          Gradient Fill
                        </SelectItem>
                      </SelectContent>
                    </Select>

                    {backgroundId === SOLID_COLOR_BACKGROUND_ID && (
                      <ColorInput
                        value={backgroundColor}
                        onChange={onBackgroundColorChange}
                        compact
                        className="shrink-0"
                        ariaLabel="Preview solid fill color"
                      />
                    )}
                    {backgroundId === GRADIENT_BACKGROUND_ID && (
                      <PaintInput
                        value={backgroundPaint}
                        onChange={onBackgroundPaintChange}
                        capabilities={['linear-gradient', 'radial-gradient']}
                        compact
                        className="shrink-0"
                        ariaLabel="Preview gradient fill"
                      />
                    )}
                  </div>
                </div>
                <PreviewOverlayControls
                  previewTitle="Live Preview"
                  visibility={overlayVisibility}
                  options={debugOverlayOptions}
                  onChange={onOverlayVisibilityChange}
                />
              </div>

              <div className="flex min-w-0 items-end gap-2">
                <PreviewPlaybackActions
                  isPlaying={isPlaying}
                  onPlayingChange={onPlayingChange}
                  loop={loop}
                  onLoopChange={setLoop}
                  currentTimeSeconds={currentTimeSeconds}
                  durationSeconds={timestamps.durationSeconds}
                  onSeek={onSeek}
                  previewTitle="Live Preview"
                  showLabels
                  frameExport={{
                    canvasRef: previewCanvasRef,
                    presetId: preset.id,
                    languageId,
                    frameIndex: currentFrameIndex,
                    disabled: !hasPreview,
                  }}
                />
              </div>
            </div>

            <div className="bg-border/80 w-px shrink-0 self-stretch" aria-hidden="true" />

            <div className="flex min-w-0 flex-col gap-2">
              <PreviewTextSourceControls
                textMode={textMode}
                onTextModeChange={onTextModeChange}
                customText={customText}
                onCustomTextChange={onCustomTextChange}
              >
                <div className="flex items-end gap-2">
                  {languages.length > 0 && (
                    <div className="flex shrink-0 flex-col gap-1">
                      <PreviewControlLabel>Language</PreviewControlLabel>
                      <Select value={languageId} onValueChange={onLanguageIdChange}>
                        <SelectTrigger
                          className="h-8 w-fit min-w-max shrink-0 cursor-pointer"
                          aria-label="Preview language"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {languages.map((option) => (
                            <SelectItem key={option.id} value={option.id} className="cursor-pointer">
                              <PreviewLanguageOptionLabel option={option} />
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="flex shrink-0 flex-col gap-1">
                    <PreviewControlLabel>Content</PreviewControlLabel>
                    <Select value={storyId} onValueChange={onStoryIdChange}>
                      <SelectTrigger className="h-8 w-fit min-w-max shrink-0 cursor-pointer">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CAPTION_STORIES.map((story) => (
                          <SelectItem key={story.id} value={story.id} className="cursor-pointer">
                            {story.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </PreviewTextSourceControls>
            </div>
          </div>
        </Card>

        {status === 'error' && (
          <div className="border-destructive/40 bg-destructive/10 text-destructive flex items-start gap-2 rounded-md border p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">Preview render failed</p>
              <p className="mt-1 text-xs whitespace-pre-wrap">{error}</p>
            </div>
          </div>
        )}

        <div className="flex shrink-0 items-start justify-center">
          <div className="group/preview-canvas relative">
            <div
              className={`relative overflow-hidden ${PREVIEW_RADIUS_CLASS} ${hasPreview ? 'bg-muted/40 border' : ''}`}
            // Explicit pixel size (computed from the wrapper above + the
            // aspect ratio) rather than CSS `aspect-ratio` sizing on a
            // non-stretched flex item. Falls back to `aspectRatio` only for
            // the brief instant before the very first measurement lands.
            style={
              boxSize
                ? { width: boxSize.width, height: boxSize.height }
                : { aspectRatio: `${aspect.width} / ${aspect.height}` }
            }
            data-preview-canvas="true"
          >
            {hasPreview && bitmaps && overlay ? (
              <>
                {qualitySnapshotUrl && (
                  <img
                    src={qualitySnapshotUrl}
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 h-full w-full object-fill transition-opacity ease-out"
                    style={{
                      opacity: qualityTransitionActive ? 1 : 0,
                      transitionDuration: `${PREVIEW_QUALITY_CROSSFADE_MS}ms`,
                    }}
                  />
                )}
                <div
                  className="absolute inset-0 overflow-hidden transition-opacity ease-out"
                  style={{
                    opacity: qualityTransitionActive && qualitySnapshotUrl ? 0 : 1,
                    transitionDuration: `${PREVIEW_QUALITY_CROSSFADE_MS}ms`,
                  }}
                  aria-hidden="true"
                >
                  <PreviewPlayer
                    width={renderResolution.width}
                    height={renderResolution.height}
                    bitmaps={bitmaps}
                    blendModeLayers={blendModeLayers ?? undefined}
                    captionInfos={result?.captionInfos}
                    fps={PREVIEW_FPS}
                    playbackSpeed={playbackSpeed}
                    loop={loop}
                    overlayX={overlay.x}
                    overlayY={overlay.y}
                    background={background}
                    streaming={status === 'loading'}
                    canvasBackgroundColor={paintToCss(canvasBackgroundPaint)}
                    viewportBounds={viewportBounds}
                    viewportEntityTransform={viewportEntityTransform}
                    videoAreaBounds={videoAreaBounds}
                    videoBounds={videoBounds}
                    videoEntityTransform={videoEntityTransform}
                    blurRadius={blurRadius}
                    videoBorder={videoBorder}
                    videoMotionBlur={videoMotionBlur}
                    videoAnimations={videoAnimations}
                    videoTransform={result?.videoTransform}
                    playing={previewPlaying && !qualityTransitionActive}
                    onTogglePlaying={() => onPlayingChange(!isPlaying)}
                    isPanning={isPanning}
                    onPlaybackEnd={() => onPlayingChange(false)}
                    canvasRef={previewCanvasRef}
                    onFrameIndexChange={setCurrentFrameIndex}
                    initialTimeMs={currentTimeSeconds * 1000}
                    timelineDurationMs={timestamps.durationSeconds * 1000}
                    playbackResetKey={playbackResetKey}
                    seekTimeMs={seekTimeMs}
                    seekRequestId={seekRequestId}
                    onPlaybackTimeChange={onPlaybackTimeChange}
                  />
                  <EntityDebugOverlay
                    entries={debugOverlayKinds}
                    renderResolution={renderResolution}
                    displaySize={boxSize ?? renderResolution}
                    overlayX={overlay.x}
                    overlayY={overlay.y}
                    frameSize={result?.frameSize}
                    debugLayout={result?.debugLayout}
                    frameIndex={currentFrameIndex}
                    showCompositionAreaPadding={showCompositionAreaPadding}
                    viewportZoom={viewportZoom}
                  />
                </div>
              </>
            ) : status === 'error' ? (
              <div className="text-muted-foreground flex h-full w-full items-center justify-center text-sm">
                No preview available
              </div>
            ) : (
              <div className="text-muted-foreground flex h-full w-full flex-col items-center justify-center gap-2 text-sm">
                <PastelDotLoader size="xxl" />
                Loading live preview
              </div>
            )}
            {hasPreview && (
              <div
                className={`absolute top-3 right-3 z-10 flex items-center gap-1.5 text-xs font-medium text-white transition-opacity duration-300 ${
                  renderingVisible ? 'opacity-100' : 'opacity-0'
                }`}
                style={{ textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}
              >
                <PastelDotLoader size="lg" />
                Rendering
              </div>
            )}
            </div>
            {resizable && onResizeStart && (
              <PreviewSurfaceResizeHandle
                previewTitle="Live Preview"
                isResizing={isResizing}
                onPointerDown={onResizeStart}
              />
            )}
          </div>
        </div>
        <p
          ref={previewFooterRef}
          className="text-muted-foreground/70 w-max max-w-none shrink-0 whitespace-nowrap text-center text-[11px] leading-relaxed"
        >
          Preview runs at {PREVIEW_FPS} fps. Final captions can run at the source video's frame rate.
        </p>
      </div>
    </div>
  );
});
