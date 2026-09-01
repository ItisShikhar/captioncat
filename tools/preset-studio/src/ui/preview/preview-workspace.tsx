import { valuesEqual } from '@/lib/values-equal';
import { isStateGroupId, type EcsEntityDoc, type PresetEditorState } from '@/schema';
import { preview } from '@/ui/constants';
import {
  findEntityById,
  findParentOf,
  updateEntityById,
  type EntitySelectionSource,
} from '@/ui/panels/design-editor/entity-tree';
import type { CSSProperties, PointerEventHandler, RefObject } from 'react';
import { memo, useCallback, useDeferredValue, useMemo, useRef } from 'react';
import { ASPECT_RATIO_OPTIONS } from './aspect-ratios';
import type { PreviewSurfaceBounds } from './bounded-preview-viewport';
import { CompactPreviewSurface } from './compact-preview-surface';
import { getCaptionLanguagesForStory, getCaptionText } from './data';
import type { PreviewOverlayVisibility } from './entity-debug';
import type { LivePreviewPanelProps } from './live-preview-panel';
import { LivePreviewPanel } from './live-preview-panel';
import { usePreviewDebugDataActions } from './preview-debug-data-context';
import type { PreviewPlaybackSettings } from './preview-playback-controls';
import type { PreviewStateBadgeOption } from './preview-state-badge';
import type { PreviewTextMode } from './preview-text-source-controls';
import { buildSingleWordPageTimestamps, buildWordTimestamps, type SampleTimestamps } from './preview-timestamps';
import { parseSrtWordCaptions } from './srt-captions';
import type { PreviewSurfaceId, PreviewSurfaceVisibilityById } from './use-preview-culling';
import {
  usePreviewSurfaceLayout,
  type PreviewSurfaceAspectRatiosById,
} from './use-preview-surface-layout';
import type { PreviewSurfaceResizeSide } from './preview-surface-resize-handle';

const FULL_CYCLE_PREVIEW_WORDS = ['#42', 'A', 'quick', 'brown', 'fox!', '😊', '🎉', '❤️'];
const WORD_STATE_PREVIEW_WORDS = ['quick', 'brown', 'fox!', '😊', '🎉', '❤️'];
const WORD_STATE_OPTIONS: readonly PreviewStateBadgeOption[] = [
  { id: 'word:default', label: 'Default' },
  { id: 'word:past', label: 'Past' },
  { id: 'word:previous', label: 'Previous' },
  { id: 'word:current', label: 'Current' },
  { id: 'word:next', label: 'Next' },
  { id: 'word:future', label: 'Future' },
];
const WORD_STATE_SUFFIXES = new Set(['default', 'past', 'previous', 'current', 'next', 'future']);

interface SelectedWordState {
  entityId: string;
  label: string;
}

export type StatePreviewTarget = 'fullCycle' | 'wordState';

export interface PreviewWorkspaceProps extends Omit<
  LivePreviewPanelProps,
  | 'viewportRef'
  | 'viewportStyle'
  | 'isPlaying'
  | 'onPlayingChange'
  | 'previewQuality'
  | 'onPreviewQualityChange'
  | 'playbackSpeed'
  | 'onPlaybackSpeedChange'
  | 'languageId'
  | 'onLanguageIdChange'
  | 'overlayVisibility'
  | 'onOverlayVisibilityChange'
  | 'onViewportFrameSizeChange'
  | 'onResolvedTransformsChange'
  | 'onMinimumPageSizeChange'
  | 'renderEnabled'
> {
  renderEnabled: boolean;
  viewportRef: RefObject<HTMLDivElement | null>;
  layoutContainerRef: RefObject<HTMLElement | null>;
  viewportStyle: CSSProperties;
  selectedEntityId: string;
  onSelectedEntityIdChange: (id: string, source?: EntitySelectionSource) => void;
  onViewStateInPreviewer: (target: StatePreviewTarget) => void;
  playingPreviewId: PreviewSurfaceId | null;
  onPreviewPlayingChange: (previewId: PreviewSurfaceId, playing: boolean) => void;
  previewPlaybackSettings: Record<PreviewSurfaceId, PreviewPlaybackSettings>;
  onPreviewPlaybackSettingsChange: (previewId: PreviewSurfaceId, changes: Partial<PreviewPlaybackSettings>) => void;
  previewOverlayVisibility: Record<PreviewSurfaceId, PreviewOverlayVisibility>;
  onPreviewOverlayVisibilityChange: (
    previewId: PreviewSurfaceId,
    updater: (current: PreviewOverlayVisibility) => PreviewOverlayVisibility,
  ) => void;
  fullCycleTextMode: PreviewTextMode;
  onFullCycleTextModeChange: (mode: PreviewTextMode) => void;
  fullCycleCustomText: string;
  onFullCycleCustomTextChange: (text: string) => void;
  wordStateTextMode: PreviewTextMode;
  onWordStateTextModeChange: (mode: PreviewTextMode) => void;
  wordStateCustomText: string;
  onWordStateCustomTextChange: (text: string) => void;
  previewVisibility: PreviewSurfaceVisibilityById;
}

function surfaceStyle(bounds: PreviewSurfaceBounds): CSSProperties {
  return {
    left: bounds.x,
    top: bounds.y,
    width: bounds.width,
    height: bounds.height,
  };
}

function selectLocalizedPreviewTimestamps(
  timestamps: SampleTimestamps,
  options: { wordLimit?: number; wordOffset?: number },
): SampleTimestamps | null {
  const hasWordSlice = options.wordLimit !== undefined || options.wordOffset !== undefined;
  if (!hasWordSlice) return timestamps;

  const start = Math.max(0, options.wordOffset ?? 0);
  const end = options.wordLimit === undefined ? undefined : start + Math.max(0, options.wordLimit);
  const words = timestamps.words.slice(start, end);
  if (words.length === 0) return null;

  const wordStartTimesSeconds = timestamps.wordStartTimesSeconds.slice(start, end);
  const wordEndTimesSeconds = timestamps.wordEndTimesSeconds.slice(start, end);
  const firstWordStart = wordStartTimesSeconds[0] ?? 0;
  return {
    ...timestamps,
    words,
    wordStartTimesSeconds: wordStartTimesSeconds.map((time) => time - firstWordStart),
    wordEndTimesSeconds: wordEndTimesSeconds.map((time) => time - firstWordStart),
    durationSeconds: Math.max(0, (wordEndTimesSeconds.at(-1) ?? firstWordStart) - firstWordStart),
  };
}

function buildLocalizedPreviewTimestamps(
  storyId: string,
  languageId: string,
  fallbackWords: readonly string[],
  options: { wordLimit?: number; wordOffset?: number; singleWordPages?: boolean; rows?: number } = {},
): SampleTimestamps {
  const captionText = getCaptionText(storyId, languageId);
  const fallbackTimestamps = options.singleWordPages
    ? buildSingleWordPageTimestamps(fallbackWords)
    : buildWordTimestamps(fallbackWords);
  const fallbackRowCount = Math.max(1, Math.min(2, options.rows ?? 1));
  if (!captionText)
    return options.rows && options.rows > 1
      ? {
          ...fallbackTimestamps,
          breakBefore: fallbackTimestamps.words.map(
            (_, index) => index > 0 && index % Math.ceil(fallbackTimestamps.words.length / fallbackRowCount) === 0,
          ),
          captionLayout: {
            ...fallbackTimestamps.captionLayout,
            rowsPerPage: { mode: 'fixed', count: fallbackRowCount },
            breaking: {
              ...fallbackTimestamps.captionLayout?.breaking,
              sourceLineBreaks: 'preserve',
            },
          },
        }
      : fallbackTimestamps;
  const localizedTimestamps = selectLocalizedPreviewTimestamps(parseSrtWordCaptions(captionText), options);
  const timestamps = localizedTimestamps
    ? options.singleWordPages
      ? {
          ...localizedTimestamps,
          breakBefore: localizedTimestamps.words.map((_, index) => index > 0),
          captionLayout: {
            rowsPerPage: {
              mode: 'fixed' as const,
              count: 1,
            },
            breaking: {
              sourceLineBreaks: 'preserve' as const,
            },
          },
        }
      : localizedTimestamps
    : options.singleWordPages
      ? buildSingleWordPageTimestamps(fallbackWords)
      : buildWordTimestamps(fallbackWords);
  if (!options.rows || options.rows <= 1) return timestamps;
  const rowCount = Math.max(1, Math.min(2, options.rows));
  const wordsPerRow = Math.max(1, Math.ceil(timestamps.words.length / rowCount));
  return {
    ...timestamps,
    breakBefore: timestamps.words.map((_, index) => index > 0 && index % wordsPerRow === 0),
    captionLayout: {
      ...timestamps.captionLayout,
      rowsPerPage: { mode: 'fixed', count: rowCount },
      breaking: {
        ...timestamps.captionLayout?.breaking,
        sourceLineBreaks: 'preserve',
      },
    },
  };
}

function buildCustomPreviewTimestamps(
  customText: string,
  options: { singleWordPages?: boolean; rows?: number } = {},
): SampleTimestamps {
  const words = customText.trim().split(/\s+/).filter(Boolean);
  const timestamps = options.singleWordPages ? buildSingleWordPageTimestamps(words) : buildWordTimestamps(words);
  if (!options.rows || options.rows <= 1) return timestamps;

  const rowCount = Math.max(1, Math.min(2, options.rows));
  const wordsPerRow = Math.max(1, Math.ceil(timestamps.words.length / rowCount));
  return {
    ...timestamps,
    breakBefore: timestamps.words.map((_, index) => index > 0 && index % wordsPerRow === 0),
    captionLayout: {
      ...timestamps.captionLayout,
      rowsPerPage: { mode: 'fixed', count: rowCount },
      breaking: {
        ...timestamps.captionLayout?.breaking,
        sourceLineBreaks: 'preserve',
      },
    },
  };
}

function selectedWordStateForId(selectedEntityId: string): SelectedWordState {
  const colon = selectedEntityId.indexOf(':');
  if (colon < 0 || selectedEntityId.slice(0, colon) !== 'word') {
    return { entityId: 'word:current', label: 'Current' };
  }
  const suffix = selectedEntityId.slice(colon + 1);
  if (!WORD_STATE_SUFFIXES.has(suffix)) return { entityId: 'word:current', label: 'Current' };
  const labels: Record<string, string> = {
    default: 'Default',
    past: 'Past',
    current: 'Current',
    previous: 'Previous',
    next: 'Next',
    future: 'Future',
  };
  return { entityId: selectedEntityId, label: labels[suffix] ?? 'Current' };
}

function resolveSelectedWordState(preset: PresetEditorState, selectedEntityId: string): SelectedWordState {
  const requestedState = selectedWordStateForId(selectedEntityId);
  const requestedEntity =
    findEntityById(preset.design, requestedState.entityId) ??
    (requestedState.entityId === 'word:default' ? findEntityById(preset.design, 'word') : undefined);
  if (requestedEntity) return requestedState;
  if (requestedState.entityId !== 'word:current' && requestedState.entityId !== 'word:default') {
    return requestedState;
  }

  if (findEntityById(preset.design, 'word:current')) {
    return { entityId: 'word:current', label: 'Current' };
  }
  if (findEntityById(preset.design, 'word:default') || findEntityById(preset.design, 'word')) {
    return { entityId: 'word:default', label: 'Default' };
  }
  return { entityId: 'word:current', label: 'Current' };
}

function copyWordStateIntoCurrent(preset: PresetEditorState, selectedState: SelectedWordState): PresetEditorState {
  if (selectedState.entityId === 'word:current') return preset;

  const defaultEntity = findEntityById(preset.design, 'word:default') ?? findEntityById(preset.design, 'word');
  const selectedEntity = findEntityById(preset.design, selectedState.entityId) ?? defaultEntity;
  if (!selectedEntity) return preset;

  const currentEntity = findEntityById(preset.design, 'word:current');
  if (currentEntity) {
    const design = updateEntityById(preset.design, currentEntity.id, (current) => ({
      ...current,
      components: structuredClone(selectedEntity.components),
      effects: structuredClone(selectedEntity.effects),
    }));
    return { ...preset, design };
  }

  const parent = findParentOf(preset.design, selectedEntity.id);
  if (!parent) return preset;
  const replacement: EcsEntityDoc = { ...structuredClone(selectedEntity), id: 'word:current' };
  const design = updateEntityById(preset.design, parent.parent.id, (owner) => ({
    ...owner,
    children: owner.children.map((child) => (child.id === selectedEntity.id ? replacement : child)),
  }));
  return { ...preset, design };
}

function isStateSelectionOnlyPresetChange(
  previousPreset: PresetEditorState,
  nextPreset: PresetEditorState,
  selectedEntityId: string,
): boolean {
  if (previousPreset.id !== nextPreset.id || !isStateGroupId(selectedEntityId)) return false;
  if (findEntityById(previousPreset.design, selectedEntityId)) return false;

  const nextParent = findParentOf(nextPreset.design, selectedEntityId);
  if (!nextParent || findEntityById(previousPreset.design, nextParent.parent.id) === undefined) return false;

  const designWithoutSelectedState = updateEntityById(nextPreset.design, nextParent.parent.id, (parent) => ({
    ...parent,
    children: parent.children.filter((child) => child.id !== selectedEntityId),
  }));
  return valuesEqual({ ...nextPreset, design: designWithoutSelectedState }, previousPreset);
}

// Activating a missing state changes editor data, not the main preview output.
function useMainPreviewPreset(preset: PresetEditorState, selectedEntityId: string): PresetEditorState {
  const sourcePresetRef = useRef(preset);
  const mainPreviewPresetRef = useRef(preset);

  return useMemo(() => {
    const sourcePresetChanged = sourcePresetRef.current !== preset;
    if (sourcePresetChanged && !isStateSelectionOnlyPresetChange(sourcePresetRef.current, preset, selectedEntityId)) {
      mainPreviewPresetRef.current = preset;
    }
    sourcePresetRef.current = preset;
    return mainPreviewPresetRef.current;
  }, [preset, selectedEntityId]);
}

export const PreviewWorkspace = memo(function PreviewWorkspace({
  preset,
  viewportRef,
  layoutContainerRef,
  viewportStyle,
  selectedEntityId,
  onSelectedEntityIdChange,
  onViewStateInPreviewer,
  renderEnabled,
  playingPreviewId,
  onPreviewPlayingChange,
  previewPlaybackSettings,
  onPreviewPlaybackSettingsChange,
  previewOverlayVisibility,
  onPreviewOverlayVisibilityChange,
  fullCycleTextMode,
  onFullCycleTextModeChange,
  fullCycleCustomText,
  onFullCycleCustomTextChange,
  wordStateTextMode,
  onWordStateTextModeChange,
  wordStateCustomText,
  onWordStateCustomTextChange,
  previewVisibility,
  ...livePreviewProps
}: PreviewWorkspaceProps) {
  const { onMinimumPageSizeChange, onResolvedTransformsChange, onViewportFrameSizeChange } =
    usePreviewDebugDataActions();
  const fullCycleLanguages = useMemo(() => getCaptionLanguagesForStory(preview.fullCyclePreview.storyId), []);
  const wordStateLanguages = useMemo(() => getCaptionLanguagesForStory(preview.wordStatePreview.storyId), []);
  const selectedWordState = useMemo(
    () => resolveSelectedWordState(preset, selectedEntityId),
    [preset, selectedEntityId],
  );
  const wordStatePreviewInput = useMemo(() => ({ preset, selectedWordState }), [preset, selectedWordState]);
  const deferredWordStatePreviewInput = useDeferredValue(wordStatePreviewInput);
  const wordStatePreset = useMemo(
    () =>
      copyWordStateIntoCurrent(deferredWordStatePreviewInput.preset, deferredWordStatePreviewInput.selectedWordState),
    [deferredWordStatePreviewInput],
  );
  const mainPreviewPreset = useMainPreviewPreset(preset, selectedEntityId);
  const onWordStateChange = useCallback(
    (stateId: string) => {
      onSelectedEntityIdChange(stateId, 'state');
      onViewStateInPreviewer('wordState');
    },
    [onSelectedEntityIdChange, onViewStateInPreviewer],
  );
  const previewSurfaceAspectRatios = useMemo<PreviewSurfaceAspectRatiosById>(() => {
    const liveAspect =
      ASPECT_RATIO_OPTIONS.find((option) => option.id === livePreviewProps.aspectId) ?? ASPECT_RATIO_OPTIONS[0];
    return {
      live: liveAspect.width / liveAspect.height,
      word: preview.fullCyclePreview.renderCanvas.width / preview.fullCyclePreview.renderCanvas.height,
      style: preview.wordStatePreview.renderCanvas.width / preview.wordStatePreview.renderCanvas.height,
    };
  }, [livePreviewProps.aspectId]);
  const {
    boundsById,
    surfaceOrder,
    draggingSurfaceId,
    resizingSurfaceId,
    startSurfaceDrag,
    startSurfaceResize,
  } = usePreviewSurfaceLayout(previewSurfaceAspectRatios, layoutContainerRef);
  const surfaceZIndices = {
    live: surfaceOrder.indexOf('live') + 1,
    word: surfaceOrder.indexOf('word') + 1,
    style: surfaceOrder.indexOf('style') + 1,
  };
  const onLiveSurfaceDragStart = useCallback<PointerEventHandler<HTMLElement>>(
    (event) => startSurfaceDrag('live', event),
    [startSurfaceDrag],
  );
  const onFullCycleSurfaceDragStart = useCallback<PointerEventHandler<HTMLElement>>(
    (event) => startSurfaceDrag('word', event),
    [startSurfaceDrag],
  );
  const onWordStateSurfaceDragStart = useCallback<PointerEventHandler<HTMLElement>>(
    (event) => startSurfaceDrag('style', event),
    [startSurfaceDrag],
  );
  const onLiveSurfaceResizeStart = useCallback(
    (side: PreviewSurfaceResizeSide, event: Parameters<PointerEventHandler<HTMLElement>>[0]) =>
      startSurfaceResize('live', side, event),
    [startSurfaceResize],
  );
  const onFullCycleSurfaceResizeStart = useCallback(
    (side: PreviewSurfaceResizeSide, event: Parameters<PointerEventHandler<HTMLElement>>[0]) =>
      startSurfaceResize('word', side, event),
    [startSurfaceResize],
  );
  const onWordStateSurfaceResizeStart = useCallback(
    (side: PreviewSurfaceResizeSide, event: Parameters<PointerEventHandler<HTMLElement>>[0]) =>
      startSurfaceResize('style', side, event),
    [startSurfaceResize],
  );
  const livePlaybackSettings = previewPlaybackSettings.live;
  const fullCyclePlaybackSettings = previewPlaybackSettings.word;
  const wordStatePlaybackSettings = previewPlaybackSettings.style;
  const updateLiveOverlayVisibility = useCallback(
    (updater: (current: PreviewOverlayVisibility) => PreviewOverlayVisibility) =>
      onPreviewOverlayVisibilityChange('live', updater),
    [onPreviewOverlayVisibilityChange],
  );
  const updateFullCycleOverlayVisibility = useCallback(
    (updater: (current: PreviewOverlayVisibility) => PreviewOverlayVisibility) =>
      onPreviewOverlayVisibilityChange('word', updater),
    [onPreviewOverlayVisibilityChange],
  );
  const updateWordStateOverlayVisibility = useCallback(
    (updater: (current: PreviewOverlayVisibility) => PreviewOverlayVisibility) =>
      onPreviewOverlayVisibilityChange('style', updater),
    [onPreviewOverlayVisibilityChange],
  );
  const fullCycleTimestamps = useMemo(
    () =>
      fullCycleTextMode === 'custom'
        ? buildCustomPreviewTimestamps(fullCycleCustomText, { rows: fullCyclePlaybackSettings.rows })
        : buildLocalizedPreviewTimestamps(
            preview.fullCyclePreview.storyId,
            fullCyclePlaybackSettings.languageId,
            FULL_CYCLE_PREVIEW_WORDS,
            { rows: fullCyclePlaybackSettings.rows },
          ),
    [fullCycleCustomText, fullCyclePlaybackSettings.languageId, fullCyclePlaybackSettings.rows, fullCycleTextMode],
  );
  const wordStateTimestamps = useMemo(
    () =>
      wordStateTextMode === 'custom'
        ? buildCustomPreviewTimestamps(wordStateCustomText, { singleWordPages: true })
        : buildLocalizedPreviewTimestamps(
            preview.wordStatePreview.storyId,
            wordStatePlaybackSettings.languageId,
            WORD_STATE_PREVIEW_WORDS,
            { wordLimit: WORD_STATE_PREVIEW_WORDS.length, wordOffset: 2, singleWordPages: true },
          ),
    [wordStateCustomText, wordStatePlaybackSettings.languageId, wordStateTextMode],
  );
  const onLivePlayingChange = useCallback(
    (playing: boolean) => onPreviewPlayingChange('live', playing),
    [onPreviewPlayingChange],
  );
  const onLiveQualityChange = useCallback(
    (quality: PreviewPlaybackSettings['quality']) => onPreviewPlaybackSettingsChange('live', { quality }),
    [onPreviewPlaybackSettingsChange],
  );
  const onLiveSpeedChange = useCallback(
    (speed: number) => onPreviewPlaybackSettingsChange('live', { speed }),
    [onPreviewPlaybackSettingsChange],
  );
  const onLiveLanguageChange = useCallback(
    (languageId: string) => onPreviewPlaybackSettingsChange('live', { languageId }),
    [onPreviewPlaybackSettingsChange],
  );
  const onFullCyclePlayingChange = useCallback(
    (playing: boolean) => onPreviewPlayingChange('word', playing),
    [onPreviewPlayingChange],
  );
  const onFullCycleSpeedChange = useCallback(
    (speed: number) => onPreviewPlaybackSettingsChange('word', { speed }),
    [onPreviewPlaybackSettingsChange],
  );
  const onFullCycleLanguageChange = useCallback(
    (languageId: string) => onPreviewPlaybackSettingsChange('word', { languageId }),
    [onPreviewPlaybackSettingsChange],
  );
  const onFullCycleRowsChange = useCallback(
    (rows: 1 | 2) => onPreviewPlaybackSettingsChange('word', { rows }),
    [onPreviewPlaybackSettingsChange],
  );
  const onWordStatePlayingChange = useCallback(
    (playing: boolean) => onPreviewPlayingChange('style', playing),
    [onPreviewPlayingChange],
  );
  const onWordStateSpeedChange = useCallback(
    (speed: number) => onPreviewPlaybackSettingsChange('style', { speed }),
    [onPreviewPlaybackSettingsChange],
  );
  const onWordStateLanguageChange = useCallback(
    (languageId: string) => onPreviewPlaybackSettingsChange('style', { languageId }),
    [onPreviewPlaybackSettingsChange],
  );

  return (
    <div
      className="pointer-events-none absolute flex"
      style={viewportStyle}
      data-testid="preview-workspace"
      data-preview-workspace="true"
    >
      {previewVisibility.live && (
        <div
          className="group pointer-events-auto absolute"
          style={{
            ...surfaceStyle(boundsById.live),
            zIndex: surfaceZIndices.live,
          }}
          data-testid="preview-surface-live"
          data-preview-surface-id="live"
        >
          <LivePreviewPanel
            {...livePreviewProps}
            preset={mainPreviewPreset}
            renderEnabled={renderEnabled}
            viewportRef={viewportRef}
            viewportStyle={undefined}
            onSurfaceDragStart={onLiveSurfaceDragStart}
            onViewportFrameSizeChange={onViewportFrameSizeChange}
            onResolvedTransformsChange={onResolvedTransformsChange}
            onMinimumPageSizeChange={onMinimumPageSizeChange}
            isSurfaceDragging={draggingSurfaceId === 'live'}
            isPlaying={playingPreviewId === 'live'}
            onPlayingChange={onLivePlayingChange}
            overlayVisibility={previewOverlayVisibility.live}
            onOverlayVisibilityChange={updateLiveOverlayVisibility}
            previewQuality={livePlaybackSettings.quality}
            onPreviewQualityChange={onLiveQualityChange}
            resizable={preview.live.physicalCanvas.resizable}
            isResizing={resizingSurfaceId === 'live'}
            onResizeStart={onLiveSurfaceResizeStart}
            playbackSpeed={livePlaybackSettings.speed}
            onPlaybackSpeedChange={onLiveSpeedChange}
            languageId={livePlaybackSettings.languageId}
            onLanguageIdChange={onLiveLanguageChange}
          />
        </div>
      )}
      {previewVisibility.word && (
        <div
          className="group pointer-events-auto absolute"
          style={{
            ...surfaceStyle(boundsById.word),
            zIndex: surfaceZIndices.word,
          }}
          data-testid="preview-surface-word"
          data-preview-surface-id="word"
        >
          <CompactPreviewSurface
            preset={mainPreviewPreset}
            renderEnabled={renderEnabled}
            title="Full Cycle Preview"
            description=""
            timestamps={fullCycleTimestamps}
            dataTestId="preview-word"
            previewConfig={preview.fullCyclePreview}
            fullCyclePreview
            isPanning={livePreviewProps.isPanning}
            viewportZoom={livePreviewProps.viewportZoom}
            onSurfaceDragStart={onFullCycleSurfaceDragStart}
            isSurfaceDragging={draggingSurfaceId === 'word'}
            isPlaying={playingPreviewId === 'word'}
            previewQuality={fullCyclePlaybackSettings.quality}
            resizable={preview.fullCyclePreview.physicalCanvas.resizable}
            isResizing={resizingSurfaceId === 'word'}
            onResizeStart={onFullCycleSurfaceResizeStart}
            onPlayingChange={onFullCyclePlayingChange}
            playbackSpeed={fullCyclePlaybackSettings.speed}
            onPlaybackSpeedChange={onFullCycleSpeedChange}
            languageId={fullCyclePlaybackSettings.languageId}
            languages={fullCycleLanguages}
            onLanguageIdChange={onFullCycleLanguageChange}
            textMode={fullCycleTextMode}
            onTextModeChange={onFullCycleTextModeChange}
            customText={fullCycleCustomText}
            onCustomTextChange={onFullCycleCustomTextChange}
            rows={fullCyclePlaybackSettings.rows}
            onRowsChange={onFullCycleRowsChange}
            hoveredEntity={livePreviewProps.hoveredEntity}
            overlayVisibility={previewOverlayVisibility.word}
            onOverlayVisibilityChange={updateFullCycleOverlayVisibility}
            hoveredPaddingPreviewTarget={livePreviewProps.hoveredPaddingPreviewTarget}
            hoveredPositionPreviewTarget={livePreviewProps.hoveredPositionPreviewTarget}
            showCompositionAreaPadding={livePreviewProps.showCompositionAreaPadding}
          />
        </div>
      )}
      {previewVisibility.style && (
        <div
          className="group pointer-events-auto absolute"
          style={{
            ...surfaceStyle(boundsById.style),
            zIndex: surfaceZIndices.style,
          }}
          data-testid="preview-surface-style"
          data-preview-surface-id="style"
        >
          <CompactPreviewSurface
            preset={wordStatePreset}
            renderEnabled={renderEnabled}
            title="Word State Preview"
            timestamps={wordStateTimestamps}
            dataTestId="preview-style"
            previewConfig={preview.wordStatePreview}
            badge={selectedWordState.label}
            badgeStateId={selectedWordState.entityId}
            badgeStateOptions={WORD_STATE_OPTIONS}
            onBadgeStateChange={onWordStateChange}
            previewWordState="current"
            previewWordStateLayout="stacked"
            description=""
            isPanning={livePreviewProps.isPanning}
            viewportZoom={livePreviewProps.viewportZoom}
            onSurfaceDragStart={onWordStateSurfaceDragStart}
            isSurfaceDragging={draggingSurfaceId === 'style'}
            isPlaying={playingPreviewId === 'style'}
            previewQuality={wordStatePlaybackSettings.quality}
            resizable={preview.wordStatePreview.physicalCanvas.resizable}
            isResizing={resizingSurfaceId === 'style'}
            onResizeStart={onWordStateSurfaceResizeStart}
            onPlayingChange={onWordStatePlayingChange}
            playbackSpeed={wordStatePlaybackSettings.speed}
            onPlaybackSpeedChange={onWordStateSpeedChange}
            languageId={wordStatePlaybackSettings.languageId}
            languages={wordStateLanguages}
            onLanguageIdChange={onWordStateLanguageChange}
            textMode={wordStateTextMode}
            onTextModeChange={onWordStateTextModeChange}
            customText={wordStateCustomText}
            onCustomTextChange={onWordStateCustomTextChange}
            hoveredEntity={livePreviewProps.hoveredEntity}
            overlayVisibility={previewOverlayVisibility.style}
            onOverlayVisibilityChange={updateWordStateOverlayVisibility}
            hoveredPaddingPreviewTarget={livePreviewProps.hoveredPaddingPreviewTarget}
            hoveredPositionPreviewTarget={livePreviewProps.hoveredPositionPreviewTarget}
            showCompositionAreaPadding={livePreviewProps.showCompositionAreaPadding}
          />
        </div>
      )}
    </div>
  );
});
