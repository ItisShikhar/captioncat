import { cn } from '@/lib/utils';
import type { PresetEditorState } from '@/schema';
import type { Paint } from '@/schema/paint';
import { PastelDotLoader } from '@/ui/components/pastel-dot-loader';
import { preview } from '@/ui/constants';
import { PaintInput, paintToCss } from '@/ui/controls/color-field';
import { isPopoverPortalInteraction } from '@/lib/popover-interactions';
import { Card } from '@/ui/shadcn/card';
import { AlertTriangle } from 'lucide-react';
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type PointerEventHandler,
} from 'react';
import type { PreviewWordStateLayout, WordState } from '@captioncat/caption-engine/browser';
import type { PreviewQuality } from './aspect-ratios';
import { ASPECT_RATIO_OPTIONS, PREVIEW_FPS } from './aspect-ratios';
import {
  PreviewControlLabel,
  PreviewPlaybackActions,
  PreviewPlaybackControls,
  type PreviewLanguageOption,
} from './preview-playback-controls';
import { PreviewPlayer } from './preview-player';
import { usePreviewPlaybackPosition } from './use-preview-playback-position';
import { HAND_CURSOR } from './preview-cursor';
import { PreviewStateBadge, type PreviewStateBadgeOption } from './preview-state-badge';
import { NOOP_PREVIEW_SURFACE_DRAG_START, PreviewSurfaceDragHandle } from './preview-surface-drag-handle';
import { PreviewSurfaceResizeHandle, type PreviewSurfaceResizeSide } from './preview-surface-resize-handle';
import { PreviewTextSourceControls, type PreviewTextMode } from './preview-text-source-controls';
import {
  debugOverlayEntriesForPreset,
  debugOverlayOptionsForPreset,
  DEBUG_OVERLAY_SURFACE_ENTITY_KINDS,
  resolvePreviewOverlayVisibilityForRender,
  type DebugEntityKind,
  type PaddingPreviewTarget,
  type PositionPreviewTarget,
  type PreviewOverlayVisibility,
} from './entity-debug';
import { EntityDebugOverlay } from './entity-debug-overlay';
import { PreviewOverlayControls } from './preview-overlay-controls';
import type { SampleTimestamps } from './preview-timestamps';
import { usePlaybackBitmaps } from './use-playback-bitmaps';
import { usePreviewRenderer } from './use-preview-renderer';

export interface CompactPreviewSurfaceProps {
  preset: PresetEditorState;
  /** Whether this surface can start a new engine render. */
  renderEnabled: boolean;
  title: string;
  description: string;
  timestamps: SampleTimestamps;
  dataTestId: string;
  previewConfig: typeof preview.fullCyclePreview | typeof preview.wordStatePreview;
  className?: string;
  renderResolution?: { width: number; height: number };
  badge?: string;
  badgeStateId?: string;
  badgeStateOptions?: readonly PreviewStateBadgeOption[];
  onBadgeStateChange?: (stateId: string) => void;
  fullCyclePreview?: boolean;
  /** Starts playback once when this surface first renders and when its preset changes. */
  autoPlayOnMountAndPresetChange?: boolean;
  previewWordState?: WordState;
  previewWordStateLayout?: PreviewWordStateLayout;
  isPanning: boolean;
  /** Shared graph zoom used to keep debug overlay dimensions stable in screen pixels. */
  viewportZoom?: number;
  /** Starts moving this preview surface from its compact toolbar. */
  onSurfaceDragStart?: PointerEventHandler<HTMLElement>;
  /** Whether this surface is positioned in the workspace. */
  isSurfaceDragging?: boolean;
  /** Whether this surface shows its corner resize handles. */
  resizable?: boolean;
  /** Whether this surface is actively being resized. */
  isResizing?: boolean;
  onResizeStart?: (side: PreviewSurfaceResizeSide, event: ReactPointerEvent<HTMLElement>) => void;
  isPlaying: boolean;
  previewQuality?: PreviewQuality;
  onPlayingChange: (playing: boolean) => void;
  playbackSpeed: number;
  onPlaybackSpeedChange: (speed: number) => void;
  languageId: string;
  languages: ReadonlyArray<PreviewLanguageOption>;
  onLanguageIdChange: (id: string) => void;
  textMode: PreviewTextMode;
  onTextModeChange: (mode: PreviewTextMode) => void;
  customText: string;
  onCustomTextChange: (text: string) => void;
  rows?: number;
  onRowsChange?: (rows: 1 | 2) => void;
  hoveredEntity?: DebugEntityKind | null;
  overlayVisibility: PreviewOverlayVisibility;
  onOverlayVisibilityChange: (
    updater: (current: PreviewOverlayVisibility) => PreviewOverlayVisibility,
  ) => void;
  hoveredPaddingPreviewTarget?: PaddingPreviewTarget | null;
  hoveredPositionPreviewTarget?: PositionPreviewTarget | null;
  showCompositionAreaPadding?: boolean;
}

interface PreviewFrameLayout {
  width: number;
  height: number;
  top: number;
}

export const CompactPreviewSurface = memo(function CompactPreviewSurface({
  preset,
  renderEnabled,
  title,
  description,
  timestamps,
  dataTestId,
  previewConfig,
  className,
  renderResolution: renderResolutionProp,
  badge,
  badgeStateId,
  badgeStateOptions,
  onBadgeStateChange,
  fullCyclePreview = false,
  autoPlayOnMountAndPresetChange = false,
  previewWordState,
  previewWordStateLayout,
  isPanning,
  viewportZoom = 1,
  onSurfaceDragStart,
  isSurfaceDragging = false,
  resizable = false,
  isResizing = false,
  onResizeStart,
  isPlaying,
  previewQuality,
  onPlayingChange,
  playbackSpeed,
  onPlaybackSpeedChange,
  languageId,
  languages,
  onLanguageIdChange,
  textMode,
  onTextModeChange,
  customText,
  onCustomTextChange,
  rows,
  onRowsChange,
  hoveredEntity = null,
  overlayVisibility,
  onOverlayVisibilityChange,
  hoveredPaddingPreviewTarget = null,
  hoveredPositionPreviewTarget = null,
  showCompositionAreaPadding = false,
}: CompactPreviewSurfaceProps) {
  const effectivePreviewQuality = previewQuality ?? previewConfig.renderCanvas.defaultQuality;
  const [backgroundPaint, setBackgroundPaint] = useState<Paint>(previewConfig.background.paint);
  const [loop, setLoop] = useState<boolean>(previewConfig.defaultLoop);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const playbackResetKey = useMemo(
    () => ({
      preset,
      previewConfig,
      width: renderResolutionProp?.width,
      height: renderResolutionProp?.height,
      quality: effectivePreviewQuality,
      fullCyclePreview,
      previewWordState,
      previewWordStateLayout,
      renderEnabled,
      languageId,
      timestamps,
    }),
    [
      preset,
      previewConfig,
      renderResolutionProp?.height,
      renderResolutionProp?.width,
      effectivePreviewQuality,
      fullCyclePreview,
      previewWordState,
      previewWordStateLayout,
      renderEnabled,
      languageId,
      timestamps,
    ],
  );
  const {
    currentTimeSeconds,
    onPlaybackTimeChange,
    onSeek,
    seekRequestId,
    seekTimeMs,
  } = usePreviewPlaybackPosition(timestamps.durationSeconds, playbackResetKey);
  const initialFrameShownRef = useRef(false);
  const autoPlayPendingRef = useRef(autoPlayOnMountAndPresetChange);
  const presetIdRef = useRef(preset.id);
  const defaultRenderResolution = previewConfig.renderCanvas;
  const renderResolution = renderResolutionProp ?? defaultRenderResolution;
  const previewToolbarRef = useRef<HTMLDivElement>(null);
  const previewSurfaceRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [previewFrameLayout, setPreviewFrameLayout] = useState<PreviewFrameLayout | null>(null);
  const qualityScale = previewConfig.renderCanvas.qualityScale[effectivePreviewQuality];
  const previewResolution = useMemo(
    () => ({
      width: renderResolution.width * qualityScale,
      height: renderResolution.height * qualityScale,
    }),
    [qualityScale, renderResolution],
  );
  const { status, error, result } = usePreviewRenderer(
    preset,
    previewResolution.width,
    previewResolution.height,
    timestamps,
    languageId,
    effectivePreviewQuality,
    fullCyclePreview ? 'word' : 'state',
    previewWordState,
    renderEnabled,
    undefined,
    previewWordStateLayout,
    true,
    // Compact previews should not inherit a Page sized to the full video.
    true,
  );
  const latestResultRef = useRef(result);
  const resultAtPresetChangeRef = useRef(result);
  latestResultRef.current = result;
  const { bitmaps, blendModeLayers, overlay, decoding, firstVisibleFrameIndex, sourceCrop, bitmapSize } = usePlaybackBitmaps(result, {
    clear: !renderEnabled,
    cropToPage: true,
    playing: isPlaying,
    decodeAllFrames: currentTimeSeconds > 0,
  });
  const contentSize = bitmapSize ?? previewResolution;
  const aspectRatio = contentSize.width / contentSize.height;
  const configuredAspectRatio = renderResolution.width / renderResolution.height;
  useLayoutEffect(() => {
    const surface = previewSurfaceRef.current;
    if (!surface || !Number.isFinite(aspectRatio) || aspectRatio <= 0) return;

    const updateFrameSize = (): void => {
      const toolbarHeight = previewToolbarRef.current?.offsetHeight ?? 0;
      const surfaceStyles = getComputedStyle(surface);
      const gap = Number.parseFloat(surfaceStyles.rowGap || surfaceStyles.gap) || 0;
      const width = surface.clientWidth;
      const height = surface.clientHeight - toolbarHeight - gap;
      if (width <= 0 || height <= 0) return;
      const baseFrameWidth = Math.min(width, height * aspectRatio);
      const baseFrameHeight = baseFrameWidth / aspectRatio;
      const nearestAspect = ASPECT_RATIO_OPTIONS.reduce((closest, candidate) =>
        Math.abs(candidate.width / candidate.height - configuredAspectRatio) <
        Math.abs(closest.width / closest.height - configuredAspectRatio)
          ? candidate
          : closest,
      );
      const scale = previewConfig.physicalCanvas.sizeScaling[nearestAspect.ratio];
      const frameWidth = baseFrameWidth * scale;
      const frameHeight = baseFrameHeight * scale;
      const nextLayout = {
        width: frameWidth,
        height: frameHeight,
        top: toolbarHeight + gap + (height - frameHeight) / 2,
      };
      setPreviewFrameLayout((current) => {
        if (
          current &&
          Math.abs(current.width - nextLayout.width) < 0.5 &&
          Math.abs(current.height - nextLayout.height) < 0.5 &&
          Math.abs(current.top - nextLayout.top) < 0.5
        ) {
          return current;
        }
        return nextLayout;
      });
    };

    updateFrameSize();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateFrameSize);
    observer.observe(surface);
    if (previewToolbarRef.current) observer.observe(previewToolbarRef.current);
    return () => observer.disconnect();
  }, [aspectRatio, configuredAspectRatio, previewConfig]);
  const hasPreview = Boolean(bitmaps && bitmaps.length > 0 && overlay);
  const isLoading = status === 'loading' || decoding;
  const debugOverlayOptions = useMemo(
    () => debugOverlayOptionsForPreset(preset.design, DEBUG_OVERLAY_SURFACE_ENTITY_KINDS.compact),
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
  useEffect(() => {
    if (presetIdRef.current === preset.id) return;
    presetIdRef.current = preset.id;
    initialFrameShownRef.current = false;
    autoPlayPendingRef.current = autoPlayOnMountAndPresetChange;
    resultAtPresetChangeRef.current = latestResultRef.current;
  }, [autoPlayOnMountAndPresetChange, preset.id]);
  useEffect(() => {
    if (!result) initialFrameShownRef.current = false;
    setCurrentFrameIndex(0);
  }, [result]);
  const playbackEffectKey = autoPlayOnMountAndPresetChange ? (result ?? preset.id) : preset.id;
  useEffect(() => {
    if (!hasPreview || initialFrameShownRef.current) return;
    if (autoPlayPendingRef.current && latestResultRef.current === resultAtPresetChangeRef.current) return;
    initialFrameShownRef.current = true;
    const shouldAutoPlay = autoPlayPendingRef.current;
    autoPlayPendingRef.current = false;
    onPlayingChange(shouldAutoPlay);
  }, [hasPreview, onPlayingChange, playbackEffectKey]);
  const canvasStyle = previewFrameLayout
    ? { width: previewFrameLayout.width, height: previewFrameLayout.height }
    : { aspectRatio: `${contentSize.width} / ${contentSize.height}`, width: '100%' };
  const onCompactBarPointerDown: PointerEventHandler<HTMLDivElement> = (event) => {
    if (event.button === 1) return;
    const target = event.target;
    if (isPopoverPortalInteraction(target)) {
      return;
    }
    if (target instanceof Element && target.closest('[data-popover-layer-trigger]')) {
      onSurfaceDragStart?.(event);
      return;
    }
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
      className={cn('relative flex h-full min-h-0 w-full flex-col items-center gap-3 overflow-visible', className)}
      data-testid={dataTestId}
      data-preview-surface={dataTestId}
      data-preview-compact-card="true"
    >
      <Card
        ref={previewToolbarRef}
        className={cn(
          'w-full max-w-full shrink-0 flex-col gap-0 overflow-hidden p-0',
          isSurfaceDragging ? 'cursor-grabbing' : 'cursor-default',
        )}
        style={isSurfaceDragging ? { cursor: HAND_CURSOR } : undefined}
        onPointerDown={onCompactBarPointerDown}
        data-preview-control-bar="true"
        data-preview-viewport-chrome="true"
      >
        <div className="min-w-0 shrink-0 border-b p-2">
          <div className="flex items-start gap-2">
            <PreviewSurfaceDragHandle
              previewTitle={title}
              isDragging={isSurfaceDragging}
              idleCursor="cursor-pointer"
              showGrabCursorOnHover
              onPointerDown={onSurfaceDragStart ?? NOOP_PREVIEW_SURFACE_DRAG_START}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-sm font-semibold">{title}</h2>
                {badge && badgeStateId && badgeStateOptions && onBadgeStateChange ? (
                  <PreviewStateBadge
                    value={badgeStateId}
                    label={badge}
                    options={badgeStateOptions}
                    onValueChange={onBadgeStateChange}
                  />
                ) : badge ? (
                  <span className="bg-muted-foreground/10 text-muted-foreground rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase">
                    {badge}
                  </span>
                ) : null}
              </div>
              <p className="text-muted-foreground mt-1 truncate text-xs">{description}</p>
            </div>
            {(status === 'error' || isLoading) && (
              <span
                className="text-muted-foreground flex shrink-0 items-center gap-1.5 pt-1 text-[11px]"
                aria-live="polite"
              >
                {isLoading && <PastelDotLoader size="md" />}
                {status === 'error' ? 'Unavailable' : 'Rendering'}
              </span>
            )}
          </div>
          <div className="mt-3 ml-8 flex min-w-0 flex-wrap items-start gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex min-w-0 flex-wrap items-start gap-3">
                <PreviewPlaybackControls
                  showQuality={false}
                  showLabels
                  playbackSpeed={playbackSpeed}
                  onPlaybackSpeedChange={onPlaybackSpeedChange}
                  languageId={languageId}
                  languages={languages}
                  onLanguageIdChange={onLanguageIdChange}
                  rows={rows}
                  onRowsChange={onRowsChange}
                  showLanguage={false}
                  showRows={fullCyclePreview}
                />
                <div className="flex w-40 shrink-0 flex-col gap-1">
                  <PreviewControlLabel>Background</PreviewControlLabel>
                  <PaintInput
                    value={backgroundPaint}
                    onChange={setBackgroundPaint}
                    compact
                    fullWidth
                    className="w-40 shrink-0"
                    ariaLabel={`${title} background paint`}
                  />
                </div>
                <PreviewOverlayControls
                  previewTitle={title}
                  visibility={overlayVisibility}
                  options={debugOverlayOptions}
                  onChange={onOverlayVisibilityChange}
                />
              </div>
              <div>
                <PreviewPlaybackActions
                  isPlaying={isPlaying}
                  onPlayingChange={onPlayingChange}
                  loop={loop}
                  onLoopChange={setLoop}
                  currentTimeSeconds={currentTimeSeconds}
                  durationSeconds={timestamps.durationSeconds}
                  onSeek={onSeek}
                  previewTitle={title}
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

            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <PreviewTextSourceControls
                textMode={textMode}
                onTextModeChange={onTextModeChange}
                customText={customText}
                onCustomTextChange={onCustomTextChange}
              >
                <PreviewPlaybackControls
                  showQuality={false}
                  showLabels
                  showSpeed={false}
                  playbackSpeed={playbackSpeed}
                  onPlaybackSpeedChange={onPlaybackSpeedChange}
                  languageId={languageId}
                  languages={languages}
                  onLanguageIdChange={onLanguageIdChange}
                />
              </PreviewTextSourceControls>
            </div>
          </div>
        </div>
      </Card>

      {hasPreview && bitmaps && overlay ? (
        <>
          <div className="group/preview-canvas relative">
            <div className="relative overflow-hidden" style={canvasStyle} data-preview-canvas="true">
              <PreviewPlayer
                width={contentSize.width}
                height={contentSize.height}
                bitmaps={bitmaps}
                blendModeLayers={blendModeLayers ?? undefined}
                captionInfos={result?.captionInfos}
                fps={PREVIEW_FPS}
                playbackSpeed={playbackSpeed}
                overlayX={0}
                overlayY={0}
                background={null}
                sourceCrop={sourceCrop}
                streaming={status === 'loading'}
                playing={isPlaying}
                initialFrameIndex={firstVisibleFrameIndex}
                onFrameIndexChange={setCurrentFrameIndex}
                canvasRef={previewCanvasRef}
                canvasBackgroundColor={paintToCss(backgroundPaint)}
                isPanning={isPanning}
                onTogglePlaying={() => onPlayingChange(!isPlaying)}
                loop={loop}
                onPlaybackEnd={() => onPlayingChange(false)}
                initialTimeMs={currentTimeSeconds * 1000}
                timelineDurationMs={timestamps.durationSeconds * 1000}
                playbackResetKey={playbackResetKey}
                seekTimeMs={seekTimeMs}
                seekRequestId={seekRequestId}
                onPlaybackTimeChange={onPlaybackTimeChange}
              />
              <EntityDebugOverlay
                entries={debugOverlayKinds}
                renderResolution={contentSize}
                displaySize={previewFrameLayout ?? contentSize}
                overlayX={sourceCrop ? -sourceCrop.x : 0}
                overlayY={sourceCrop ? -sourceCrop.y : 0}
                frameSize={result?.frameSize}
                debugLayout={result?.debugLayout}
                frameIndex={currentFrameIndex}
                showCompositionAreaPadding={showCompositionAreaPadding}
                viewportZoom={viewportZoom}
              />
            </div>
            {resizable && onResizeStart && (
              <PreviewSurfaceResizeHandle
                previewTitle={title}
                isResizing={isResizing}
                onPointerDown={onResizeStart}
              />
            )}
          </div>
        </>
      ) : status === 'error' ? (
        <div className="text-destructive flex h-full flex-col items-center justify-center gap-2 text-center text-xs">
          <AlertTriangle className="size-4" />
          <span>{error ?? 'Preview render failed'}</span>
        </div>
      ) : (
        <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 text-xs">
          <PastelDotLoader size="sm" />
          <span>Rendering preview</span>
        </div>
      )}
    </div>
  );
});
