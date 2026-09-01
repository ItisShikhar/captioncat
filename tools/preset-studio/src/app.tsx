import type { CaptionDebugTransform } from '@captioncat/caption-engine/browser';
import { supportsPreviewWorkerRendering } from '@/engine-adapters/preview-worker-support';
import { cn } from '@/lib/utils';
import { presetFileNameFor, validatePresetName } from '@/lib/preset-name';
import {
  downloadTextFile,
  isFileSystemAccessSupported,
  pickJsonFiles,
  pickSaveHandleAndWrite,
  readDroppedJsonFiles,
} from '@/lib/file-io';
import {
  clonePresetDocument,
  parsePresetDocument,
  serializePresetDocument,
  type EcsEntityDoc,
  type Paint,
  type PropertyNode,
} from '@/schema';
import {
  makeLibraryEntry,
  slugify,
  usePresetLibrary,
  type LibraryEntry,
} from '@/state/preset-library';
import {
  openPresetSidebarOnPageLoad,
  preview,
} from '@/ui/constants';
import { useUnsavedChangesWarning } from '@/ui/hooks/use-unsaved-changes-warning';
import { CANVAS_BG_GRID } from '@/ui/layout-config';
import { PresetLibrarySidebar } from '@/ui/library/preset-library-sidebar';
import { DesignEditor } from '@/ui/panels/design-editor';
import {
  asDebugKind,
  findEntityById,
  stateFamilyKey,
  type EntitySelectionSource,
} from '@/ui/panels/design-editor/entity-tree';
import {
  ASPECT_RATIO_OPTIONS,
  aspectRatioIdForValue,
  previewAspectRatioForId,
  type PreviewAspectRatioId,
} from '@/ui/preview/aspect-ratios';
import { useBoundedPreviewViewport } from '@/ui/preview/bounded-preview-viewport';
import type { PreviewSurfaceBounds } from '@/ui/preview/bounded-preview-viewport';
import {
  BACKGROUND_FIXTURES,
  CAPTION_STORIES,
  getCaptionLanguagesForStory,
} from '@/ui/preview/data';
import { FloatingCanvasToolbar } from '@/ui/preview/floating-canvas-toolbar';
import { PreviewDebugDataProvider } from '@/ui/preview/preview-debug-data-context';
import {
  ALL_DEBUG_ENTITY_KINDS,
  createPreviewOverlayVisibility,
  DEBUG_OVERLAY_SURFACE_ENTITY_KINDS,
  debugOverlayOptionsForPreset,
  reconcilePreviewOverlayVisibility,
  previewOverlayEntityIsPinned,
  previewOverlayPaddingIsPinned,
  previewOverlayPositionIsPinned,
  togglePreviewOverlayEntityPin,
  togglePreviewOverlayPaddingPin,
  togglePreviewOverlayPositionPin,
  type DebugEntityKind,
  type DebugOverlayOptions,
  type PaddingPreviewTarget,
  type PositionPreviewTarget,
  type PreviewOverlayVisibility,
} from '@/ui/preview/entity-debug';
import type { PreviewPlaybackSettings } from '@/ui/preview/preview-playback-controls';
import { limitCustomPreviewText, type PreviewTextMode } from '@/ui/preview/preview-text-source-controls';
import { PreviewWorkspace, type StatePreviewTarget } from '@/ui/preview/preview-workspace';
import {
  PREVIEW_SURFACE_IDS,
  usePreviewCulling,
  type PreviewSurfaceId,
  type PreviewSurfaceVisibilityById,
} from '@/ui/preview/use-preview-culling';
import { Button } from '@/ui/shadcn/button';
import { Toaster } from '@/ui/shadcn/sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/shadcn/tooltip';
import { RotateCcw, UploadCloud } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { toast } from 'sonner';

/** Every bundled sample preset, eagerly inlined at build time so the studio works standalone (no server, no fetch). */
const BUNDLED_PRESET_MODULES = import.meta.glob<{ default: unknown }>(
  '../../../assets/json/caption-style-presets/*.json',
  { eager: true },
);

function surfaceBoundsFromGraph(
  graphRef: RefObject<HTMLDivElement | null>,
  surfaceId: 'word' | 'style',
): PreviewSurfaceBounds | undefined {
  const surface = graphRef.current?.querySelector<HTMLElement>(`[data-preview-surface-id="${surfaceId}"]`);
  if (!surface) return undefined;
  return {
    x: surface.offsetLeft,
    y: surface.offsetTop,
    width: surface.offsetWidth,
    height: surface.offsetHeight,
  };
}

function loadBundledEntries(): LibraryEntry[] {
  const entries: LibraryEntry[] = [];
  for (const [path, mod] of Object.entries(BUNDLED_PRESET_MODULES)) {
    const fileName = path.split('/').pop() ?? 'preset.json';
    try {
      const document = parsePresetDocument(mod.default, fileName);
      entries.push(makeLibraryEntry(document, fileName, 'bundled'));
    } catch (error) {
      console.warn(`Skipping unparseable bundled preset "${fileName}":`, error);
    }
  }
  entries.sort((a, b) => a.document.name.localeCompare(b.document.name));
  return entries;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

type EditorUiState = {
  selectedEntityId: string;
  hierarchyCollapsed: boolean;
  inspectorScrollTopByEntity: Record<string, number>;
  inspectorCardOpenStateByEntity: Record<string, Record<string, boolean>>;
  lastStateEntityIdByFamily: Record<string, string>;
};

function defaultEditorUiState(designId: string): EditorUiState {
  return {
    selectedEntityId: designId,
    hierarchyCollapsed: false,
    inspectorScrollTopByEntity: {},
    inspectorCardOpenStateByEntity: {},
    lastStateEntityIdByFamily: {},
  };
}

function restoreRememberedStateSelection(
  root: EcsEntityDoc,
  requestedEntityId: string,
  lastStateEntityIdByFamily: Record<string, string>,
): string {
  if (!requestedEntityId.endsWith(':default')) return requestedEntityId;
  const familyKey = stateFamilyKey(root, requestedEntityId);
  if (!familyKey) return requestedEntityId;
  const rememberedEntityId = lastStateEntityIdByFamily[familyKey];
  return rememberedEntityId && findEntityById(root, rememberedEntityId)
    ? rememberedEntityId
    : requestedEntityId;
}

/**
 * Root shell for the Caption Preset Studio: a preset library sidebar, a
 * new/open/save/overwrite/duplicate toolbar with real disk I/O (File System
 * Access API where supported, download/drag-drop fallback everywhere else),
 * and the auto-generated property form for whichever preset is selected,
 * plus a live canvas preview rendered through the real captioning engine.
 */
function App() {
  const initialEntries = useMemo(loadBundledEntries, []);
  const starterPresetDocument = useMemo(() => {
    const starterEntry =
      initialEntries.find((entry) => entry.document.id === 'clean' || entry.fileName === 'clean.json') ??
      initialEntries.find((entry) => entry.document.name === 'Clean') ??
      initialEntries[0];
    return starterEntry!.document;
  }, [initialEntries]);
  const library = usePresetLibrary(initialEntries, starterPresetDocument);
  const { undo, redo } = library;
  useEffect(() => {
    const handleHistoryShortcut = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLInputElement &&
          !['range', 'checkbox', 'radio'].includes(target.type)) ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (key === 'y' && !event.shiftKey) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleHistoryShortcut);
    return () => window.removeEventListener('keydown', handleHistoryShortcut);
  }, [redo, undo]);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragDepth = useRef(0);
  // Live-preview settings (aspect ratio / sample background / caption
  // language / text source / committed custom text) are owned here, not inside
  // `LivePreviewPanel`. Aspect overrides are remembered per preset; a preset's
  // preferred aspect is used until the user selects another one.
  const [previewAspectOverridesByPreset, setPreviewAspectOverridesByPreset] = useState<
    Record<string, PreviewAspectRatioId>
  >({});
  const [previewBackgroundId, setPreviewBackgroundId] = useState(preview.live.background.id);
  const [previewBackgroundColor, setPreviewBackgroundColor] = useState<string>(preview.live.background.solidColor);
  const [previewBackgroundPaint, setPreviewBackgroundPaint] = useState<Paint>(preview.live.background.paint);
  const [previewStoryId, setPreviewStoryId] = useState(preview.live.storyId);
  const [previewTextMode, setPreviewTextMode] = useState<PreviewTextMode>('premade');
  const [previewCustomText, setPreviewCustomText] = useState('');
  const handlePreviewCustomTextChange = useCallback((text: string) => {
    setPreviewCustomText(limitCustomPreviewText(text));
  }, []);
  const [fullCycleTextMode, setFullCycleTextMode] = useState<PreviewTextMode>('premade');
  const [fullCycleCustomText, setFullCycleCustomText] = useState('');
  const handleFullCycleCustomTextChange = useCallback((text: string) => {
    setFullCycleCustomText(limitCustomPreviewText(text));
  }, []);
  const [wordStateTextMode, setWordStateTextMode] = useState<PreviewTextMode>('premade');
  const [wordStateCustomText, setWordStateCustomText] = useState('');
  const handleWordStateCustomTextChange = useCallback((text: string) => {
    setWordStateCustomText(limitCustomPreviewText(text));
  }, []);
  const initialPreviewOverlayVisibility = useMemo(() => {
    const design = starterPresetDocument.design;
    return {
      live: createPreviewOverlayVisibility(
        debugOverlayOptionsForPreset(design, DEBUG_OVERLAY_SURFACE_ENTITY_KINDS.live),
      ),
      word: createPreviewOverlayVisibility(
        debugOverlayOptionsForPreset(design, DEBUG_OVERLAY_SURFACE_ENTITY_KINDS.compact),
      ),
      style: createPreviewOverlayVisibility(
        debugOverlayOptionsForPreset(design, DEBUG_OVERLAY_SURFACE_ENTITY_KINDS.compact),
      ),
    };
  }, [starterPresetDocument]);
  const [previewPlaybackSettings, setPreviewPlaybackSettings] = useState<
    Record<PreviewSurfaceId, PreviewPlaybackSettings>
  >(() => ({
    live: {
      quality: preview.live.renderCanvas.defaultQuality,
      speed: preview.live.defaultSpeed,
      languageId: preview.live.defaultLanguageId,
      rows: 1,
    },
    word: {
      quality: preview.fullCyclePreview.renderCanvas.defaultQuality,
      speed: preview.fullCyclePreview.defaultSpeed,
      languageId: preview.fullCyclePreview.defaultLanguageId,
      rows: 1,
    },
    style: {
      quality: preview.wordStatePreview.renderCanvas.defaultQuality,
      speed: preview.wordStatePreview.defaultSpeed,
      languageId: preview.wordStatePreview.defaultLanguageId,
      rows: 1,
    },
  }));
  const [previewOverlayVisibility, setPreviewOverlayVisibility] = useState<
    Record<PreviewSurfaceId, PreviewOverlayVisibility>
  >(() => initialPreviewOverlayVisibility);
  // Which entity's debug grid (Composition Area/Page/Row/Word) is currently
  // highlighted in the live preview - hover previews it temporarily.
  const [hoveredEntity, setHoveredEntity] = useState<DebugEntityKind | null>(null);
  const pinnedDebugEntitiesRef = useRef<DebugEntityKind[]>([]);
  const pinnedDebugEntities = useMemo(
    () => {
      const next = ALL_DEBUG_ENTITY_KINDS.filter((kind) =>
        Object.values(previewOverlayVisibility).some(
          (visibility) => previewOverlayEntityIsPinned(visibility, kind),
        ),
      );
      const current = pinnedDebugEntitiesRef.current;
      if (current.length === next.length && current.every((kind, index) => kind === next[index])) return current;
      pinnedDebugEntitiesRef.current = next;
      return next;
    },
    [previewOverlayVisibility],
  );
  const showAllDebugOverlays = false;
  const showCompositionAreaPadding = false;
  const [hoveredPaddingPreviewTarget, setHoveredPaddingPreviewTarget] = useState<PaddingPreviewTarget | null>(null);
  const [hoveredPositionPreviewTarget, setHoveredPositionPreviewTarget] = useState<PositionPreviewTarget | null>(null);
  const resolvedTransformsRef = useRef<CaptionDebugTransform[] | null>(null);
  const handleResolvedTransformsChange = useCallback((transforms: CaptionDebugTransform[] | null) => {
    resolvedTransformsRef.current = transforms;
  }, []);
  const previewViewportRef = useRef<HTMLDivElement>(null);
  const previewGraphRef = useRef<HTMLDivElement>(null);
  const { isPanning, zoom: viewportZoom, resetView, focusPreview, viewportStyle, viewportSurfaceStyle, gridStyle } =
    useBoundedPreviewViewport(previewGraphRef);
  const [playingPreviewId, setPlayingPreviewId] = useState<PreviewSurfaceId | null>('live');
  const lastStartedPresetKeyRef = useRef<string | null>(null);
  const [previewVisibility, setPreviewVisibility] = useState<PreviewSurfaceVisibilityById>({
    live: true,
    word: true,
    style: true,
  });
  const handlePreviewPlayingChange = useCallback((previewId: PreviewSurfaceId, playing: boolean): void => {
    setPlayingPreviewId((current) => {
      if (!playing) return current === previewId ? null : current;
      return previewId;
    });
  }, []);
  const handlePreviewVisibilityChange = useCallback((previewId: PreviewSurfaceId, visible: boolean): void => {
    setPreviewVisibility((current) =>
      current[previewId] === visible ? current : { ...current, [previewId]: visible },
    );
  }, []);
  const handleAllPreviewVisibilityChange = useCallback((visible: boolean): void => {
    setPreviewVisibility((current) => {
      if (PREVIEW_SURFACE_IDS.every((previewId) => current[previewId] === visible)) return current;
      return {
        live: visible,
        word: visible,
        style: visible,
      };
    });
  }, []);
  useEffect(() => {
    setPlayingPreviewId((current) => (current && !previewVisibility[current] ? null : current));
  }, [previewVisibility]);
  const handleViewStateInPreviewer = useCallback(
    (target: StatePreviewTarget) => {
      const surfaceId = target === 'fullCycle' ? 'word' : 'style';
      const bounds = surfaceBoundsFromGraph(previewGraphRef, surfaceId);
      if (bounds) focusPreview(bounds, 0.75);
    },
    [focusPreview],
  );
  const handlePreviewOutOfFrame = useCallback((previewId: PreviewSurfaceId): void => {
    setPlayingPreviewId((current) => (current === previewId ? null : current));
  }, []);
  const updatePreviewPlaybackSettings = useCallback(
    (previewId: PreviewSurfaceId, changes: Partial<PreviewPlaybackSettings>): void => {
      setPreviewPlaybackSettings((current) => ({
        ...current,
        [previewId]: { ...current[previewId], ...changes },
      }));
    },
    [],
  );
  const updatePreviewOverlayVisibility = useCallback(
    (previewId: PreviewSurfaceId, updater: (current: PreviewOverlayVisibility) => PreviewOverlayVisibility): void => {
      setPreviewOverlayVisibility((current) => ({
        ...current,
        [previewId]: updater(current[previewId]),
      }));
    },
    [],
  );
  const [presetLibraryOpen, setPresetLibraryOpen] = useState(openPresetSidebarOnPageLoad);
  const [newPresetDialogOpen, setNewPresetDialogOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [previewRenderBlockedKey, setPreviewRenderBlockedKey] = useState<string | null>(null);
  const workerPreviewAvailable = supportsPreviewWorkerRendering();
  const [editorUiByPreset, setEditorUiByPreset] = useState<Record<string, EditorUiState>>({});
  const selected = library.selected;
  const selectedKey = selected?.key ?? '';
  const selectedDesignId = selected?.document.design.id ?? '';
  const selectedPreviewBackgroundId = selected?.document.metadata?.previewBackgroundId;
  const selectedPreviewStoryId = selected?.document.metadata?.previewStoryId;
  const selectedPreviewAspectId =
    previewAspectOverridesByPreset[selectedKey] ??
    aspectRatioIdForValue(selected?.document.preview.aspectRatio);
  const handlePreviewAspectIdChange = useCallback(
    (id: string) => {
      const nextAspect = ASPECT_RATIO_OPTIONS.find((option) => option.id === id);
      if (!nextAspect) {
        toast.error(`Unknown preview aspect ratio "${id}".`);
        return;
      }
      setPreviewAspectOverridesByPreset((current) => ({
        ...current,
        [selectedKey]: nextAspect.id,
      }));
    },
    [selectedKey],
  );
  useUnsavedChangesWarning(library.entries.some((entry) => entry.dirty));
  const selectedPreviewOverlayOptions = useMemo(() => {
    if (!selected) return null;
    const design = selected.document.design;
    return {
      live: debugOverlayOptionsForPreset(design, DEBUG_OVERLAY_SURFACE_ENTITY_KINDS.live),
      word: debugOverlayOptionsForPreset(design, DEBUG_OVERLAY_SURFACE_ENTITY_KINDS.compact),
      style: debugOverlayOptionsForPreset(design, DEBUG_OVERLAY_SURFACE_ENTITY_KINDS.compact),
    };
  }, [selected]);
  const previousPreviewOverlayOptions = useRef<Record<PreviewSurfaceId, DebugOverlayOptions> | null>(null);
  const { selectPreset } = library;
  const handlePresetSelect = useCallback(
    (key: string) => {
      if (key === selectedKey) {
        setPresetLibraryOpen(false);
        return;
      }
      if (!workerPreviewAvailable) setPreviewRenderBlockedKey(key);
      selectPreset(key);
      setPresetLibraryOpen(false);
    },
    [selectPreset, selectedKey, workerPreviewAvailable],
  );
  useEffect(() => {
    if (!selectedKey) return;
    const backgroundId =
      selectedPreviewBackgroundId &&
      BACKGROUND_FIXTURES.some((background) => background.id === selectedPreviewBackgroundId)
        ? selectedPreviewBackgroundId
        : preview.live.background.id;
    const storyId =
      selectedPreviewStoryId && CAPTION_STORIES.some((story) => story.id === selectedPreviewStoryId)
        ? selectedPreviewStoryId
        : preview.live.storyId;
    setPreviewBackgroundId(backgroundId);
    setPreviewStoryId(storyId);
  }, [selectedKey, selectedPreviewBackgroundId, selectedPreviewStoryId]);
  const handlePresetLibraryClosed = useCallback(() => {
    setPreviewRenderBlockedKey(null);
  }, []);
  const previewRenderingEnabled = previewRenderBlockedKey !== selectedKey;
  const selectedEditorUi = selected
    ? (editorUiByPreset[selectedKey] ?? defaultEditorUiState(selectedDesignId))
    : defaultEditorUiState(selectedDesignId);
  const selectedInspectorScrollTop = selected
    ? (selectedEditorUi.inspectorScrollTopByEntity[selectedEditorUi.selectedEntityId] ?? 0)
    : 0;
  const selectedInspectorCardOpenState = selected
    ? (selectedEditorUi.inspectorCardOpenStateByEntity[selectedEditorUi.selectedEntityId] ?? {})
    : {};
  const selectedDebugKind = useMemo(
    () =>
      selected ? asDebugKind(findEntityById(selected.document.design, selectedEditorUi.selectedEntityId)?.entity ?? '') : null,
    [selected, selectedEditorUi.selectedEntityId],
  );
  const pinnedPaddingPreviewTarget = useMemo(() => {
    const target = selectedDebugKind
      ? selectedPreviewOverlayOptions?.live.paddingTargets.find((candidate) => candidate.kind === selectedDebugKind)
      : undefined;
    return target &&
      Object.values(previewOverlayVisibility).some(
        (visibility) => previewOverlayPaddingIsPinned(visibility, target),
      )
      ? target
      : null;
  }, [selectedDebugKind, selectedPreviewOverlayOptions, previewOverlayVisibility]);
  const pinnedPositionPreviewTarget = useMemo(() => {
    const target = selectedDebugKind
      ? selectedPreviewOverlayOptions?.live.positionTargets.find((candidate) => candidate.kind === selectedDebugKind)
      : undefined;
    return target &&
      Object.values(previewOverlayVisibility).some(
        (visibility) => previewOverlayPositionIsPinned(visibility, target),
      )
      ? target
      : null;
  }, [selectedDebugKind, selectedPreviewOverlayOptions, previewOverlayVisibility]);
  const activePaddingPreviewTarget = hoveredPaddingPreviewTarget;
  const activePositionPreviewTarget = hoveredPositionPreviewTarget;
  const [sidebarRevealRequest, setSidebarRevealRequest] = useState<{ key: string; nonce: number } | null>(null);
  const revealPreset = useCallback((key: string | undefined) => {
    if (!key) return;
    setPresetLibraryOpen(true);
    setSidebarRevealRequest((previous) => ({
      key,
      nonce: (previous?.nonce ?? 0) + 1,
    }));
  }, []);
  useEffect(() => {
    const languages = getCaptionLanguagesForStory(previewStoryId);
    const fallbackLanguageId = languages[0]?.id ?? '';
    setPreviewPlaybackSettings((current) => {
      if (languages.some((language) => language.id === current.live.languageId)) return current;
      return {
        ...current,
        live: { ...current.live, languageId: fallbackLanguageId },
      };
    });
  }, [previewStoryId]);

  usePreviewCulling(
    previewGraphRef,
    handlePreviewOutOfFrame,
    `${selectedKey}:${previewVisibility.live ? '1' : '0'}${previewVisibility.word ? '1' : '0'}${previewVisibility.style ? '1' : '0'}`,
  );

  const togglePinnedDebugEntity = useCallback(
    (entity: DebugEntityKind) => {
      if (!selectedPreviewOverlayOptions) return;
      setPreviewOverlayVisibility((current) => ({
        live: togglePreviewOverlayEntityPin(current.live, entity, selectedPreviewOverlayOptions.live),
        word: togglePreviewOverlayEntityPin(current.word, entity, selectedPreviewOverlayOptions.word),
        style: togglePreviewOverlayEntityPin(current.style, entity, selectedPreviewOverlayOptions.style),
      }));
    },
    [selectedPreviewOverlayOptions],
  );

  const togglePaddingPreviewTarget = useCallback(
    (target: PaddingPreviewTarget) => {
      if (!selectedPreviewOverlayOptions) return;
      setPreviewOverlayVisibility((current) => ({
        live: togglePreviewOverlayPaddingPin(current.live, target, selectedPreviewOverlayOptions.live),
        word: togglePreviewOverlayPaddingPin(current.word, target, selectedPreviewOverlayOptions.word),
        style: togglePreviewOverlayPaddingPin(current.style, target, selectedPreviewOverlayOptions.style),
      }));
    },
    [selectedPreviewOverlayOptions],
  );

  const togglePositionPreviewTarget = useCallback(
    (target: PositionPreviewTarget) => {
      if (!selectedPreviewOverlayOptions) return;
      setPreviewOverlayVisibility((current) => ({
        live: togglePreviewOverlayPositionPin(current.live, target, selectedPreviewOverlayOptions.live),
        word: togglePreviewOverlayPositionPin(current.word, target, selectedPreviewOverlayOptions.word),
        style: togglePreviewOverlayPositionPin(current.style, target, selectedPreviewOverlayOptions.style),
      }));
    },
    [selectedPreviewOverlayOptions],
  );

  useEffect(() => {
    if (!selected) return;
    setEditorUiByPreset((prev) =>
      prev[selectedKey] ? prev : { ...prev, [selectedKey]: defaultEditorUiState(selectedDesignId) },
    );
  }, [selected, selectedDesignId, selectedKey]);

  useEffect(() => {
    if (!selectedPreviewOverlayOptions) return;
    const previous = previousPreviewOverlayOptions.current;
    previousPreviewOverlayOptions.current = selectedPreviewOverlayOptions;
    if (!previous) return;
    setPreviewOverlayVisibility((current) => ({
      live: reconcilePreviewOverlayVisibility(current.live, previous.live, selectedPreviewOverlayOptions.live),
      word: reconcilePreviewOverlayVisibility(current.word, previous.word, selectedPreviewOverlayOptions.word),
      style: reconcilePreviewOverlayVisibility(current.style, previous.style, selectedPreviewOverlayOptions.style),
    }));
  }, [selectedPreviewOverlayOptions]);

  useEffect(() => {
    if (!selectedKey || lastStartedPresetKeyRef.current === selectedKey) return;
    lastStartedPresetKeyRef.current = selectedKey;
    setPlayingPreviewId('live');
  }, [selectedKey]);

  const updateSelectedEditorUi = useCallback(
    (updater: (previous: EditorUiState) => EditorUiState) => {
      setEditorUiByPreset((prev) => {
        const current = prev[selectedKey] ?? defaultEditorUiState(selectedDesignId);
        const next = updater(current);
        if (
          current.selectedEntityId === next.selectedEntityId &&
          current.hierarchyCollapsed === next.hierarchyCollapsed &&
          current.lastStateEntityIdByFamily === next.lastStateEntityIdByFamily
        ) {
          return prev;
        }
        return { ...prev, [selectedKey]: next };
      });
    },
    [selectedDesignId, selectedKey],
  );

  const commitInspectorScrollTop = useCallback(
    (presetKey: string, entityId: string, scrollTop: number) => {
      setEditorUiByPreset((prev) => {
        const current = prev[presetKey];
        if (!current) return prev;
        if ((current.inspectorScrollTopByEntity[entityId] ?? 0) === scrollTop) {
          return prev;
        }
        return {
          ...prev,
          [presetKey]: {
            ...current,
            inspectorScrollTopByEntity: {
              ...current.inspectorScrollTopByEntity,
              [entityId]: scrollTop,
            },
          },
        };
      });
    },
    [],
  );

  const updateSelectedInspectorCardOpenState = useCallback(
    (updater: (previous: Record<string, boolean>) => Record<string, boolean>) => {
      setEditorUiByPreset((prev) => {
        const current = prev[selectedKey] ?? defaultEditorUiState(selectedDesignId);
        const entityId = current.selectedEntityId;
        const currentState = current.inspectorCardOpenStateByEntity[entityId] ?? {};
        const nextState = updater(currentState);
        if (nextState === currentState) {
          return prev;
        }
        return {
          ...prev,
          [selectedKey]: {
            ...current,
            inspectorCardOpenStateByEntity: {
              ...current.inspectorCardOpenStateByEntity,
              [entityId]: nextState,
            },
          },
        };
      });
    },
    [selectedDesignId, selectedKey],
  );

  const updateInspectorCardOpenStateForEntity = useCallback(
    (entityId: string, updater: (previous: Record<string, boolean>) => Record<string, boolean>) => {
      setEditorUiByPreset((prev) => {
        const current = prev[selectedKey] ?? defaultEditorUiState(selectedDesignId);
        const currentState = current.inspectorCardOpenStateByEntity[entityId] ?? {};
        const nextState = updater(currentState);
        if (nextState === currentState) {
          return prev;
        }
        return {
          ...prev,
          [selectedKey]: {
            ...current,
            inspectorCardOpenStateByEntity: {
              ...current.inspectorCardOpenStateByEntity,
              [entityId]: nextState,
            },
          },
        };
      });
    },
    [selectedDesignId, selectedKey],
  );

  const handleSelectedEntityIdChange = useCallback(
    (id: string, source: EntitySelectionSource = 'entity') => {
      updateSelectedEditorUi((current) => {
        const design = selected?.document.design;
        const selectedEntityId =
          design && source !== 'state'
            ? restoreRememberedStateSelection(design, id, current.lastStateEntityIdByFamily)
            : id;
        const familyKey = design ? stateFamilyKey(design, selectedEntityId) : undefined;
        let lastStateEntityIdByFamily = current.lastStateEntityIdByFamily;
        if (familyKey && lastStateEntityIdByFamily[familyKey] !== selectedEntityId) {
          lastStateEntityIdByFamily = {
            ...lastStateEntityIdByFamily,
            [familyKey]: selectedEntityId,
          };
        }
        return {
          ...current,
          selectedEntityId,
          lastStateEntityIdByFamily,
        };
      });
    },
    [selected, updateSelectedEditorUi],
  );
  const handleHierarchyCollapsedChange = useCallback(
    (collapsed: boolean) => updateSelectedEditorUi((current) => ({ ...current, hierarchyCollapsed: collapsed })),
    [updateSelectedEditorUi],
  );
  const makeSelectedPageHeightFitParent = useCallback(() => {
    library.updateDesign((design) => {
      const updatePage = (entity: typeof design): typeof design => {
        if (entity.entity === 'page') {
          return {
            ...entity,
            components: entity.components.map((component) => {
              if (component.component !== 'transform') return component;
              const heightMode = component.props.heightMode;
              const fitParentHeightMode: PropertyNode =
                heightMode?.kind === 'leaf'
                  ? { ...heightMode, type: 'string', value: 'fitParent' }
                  : { kind: 'leaf', type: 'string', value: 'fitParent' };
              return {
                ...component,
                props: {
                  ...component.props,
                  heightMode: fitParentHeightMode,
                },
              };
            }),
          };
        }
        return { ...entity, children: entity.children.map(updatePage) };
      };
      return updatePage(design);
    }, 'Make Page Height Fit Parent');
  }, [library]);

  if (!selected) {
    return <p className="p-6 text-sm">No presets loaded.</p>;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className="relative flex h-svh flex-col"
        data-testid="app-drop-zone"
        onDragEnter={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            dragDepth.current += 1;
            setIsDragOver(true);
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setIsDragOver(false);
        }}
        onDrop={async (e) => {
          e.preventDefault();
          dragDepth.current = 0;
          setIsDragOver(false);
          const files = await readDroppedJsonFiles(e.dataTransfer.items);
          if (files.length === 0) {
            toast.error('Drop one or more preset .json files.');
            return;
          }
          let imported = 0;
          let lastImportedKey: string | undefined;
          for (const file of files) {
            try {
              const document = parsePresetDocument(JSON.parse(file.text), file.fileName);
              lastImportedKey = library.importPresetDocument(document, file.fileName, file.handle);
              imported += 1;
            } catch (error) {
              toast.error(`Couldn't load "${file.fileName}": ${(error as Error).message}`);
            }
          }
          if (imported > 0) {
            revealPreset(lastImportedKey);
            toast.success(`Opened ${imported} preset${imported === 1 ? '' : 's'}`);
          }
        }}
      >
        <div className="flex min-h-0 flex-1">
          <PresetLibrarySidebar
            entries={library.entries}
            selectedKey={library.selectedKey}
            onSelect={handlePresetSelect}
            revealRequest={sidebarRevealRequest}
            onClosed={handlePresetLibraryClosed}
            onNewPreset={() => setNewPresetDialogOpen(true)}
            onDuplicate={(key) => {
              const source = library.entries.find((entry) => entry.key === key);
              const duplicateKey = library.duplicatePresetToCustom(key);
              revealPreset(duplicateKey);
              if (source) toast.success(`Duplicated "${source.document.name}" to Custom Presets`);
            }}
            open={presetLibraryOpen}
            onOpenChange={setPresetLibraryOpen}
          />
          <div
            className="relative min-h-0 flex-1 overflow-hidden"
            data-preview-interactive-region="true"
          >
              <div
                className="pointer-events-none absolute inset-x-0 top-0 z-20 flex min-w-0 items-start gap-2 p-3"
                data-preview-fixed-chrome="true"
              >
                <FloatingCanvasToolbar
                  selected={library.selected}
                  languageId={previewPlaybackSettings.live.languageId}
                  previewAspectId={selectedPreviewAspectId}
                  previewBackgroundId={previewBackgroundId}
                  previewStoryId={previewStoryId}
                  onSettingsOpenChange={setIsSettingsOpen}
                  onRevealPreset={() => {
                    revealPreset(selectedKey);
                  }}
                  dirty={selected.dirty}
                  onUpdateTiming={library.updateTiming}
                  onUpdateCaptionLayout={library.updateCaptionLayout}
                  onMakePageHeightFitParent={makeSelectedPageHeightFitParent}
                  newPresetDialogOpen={newPresetDialogOpen}
                  onNewPresetDialogOpenChange={setNewPresetDialogOpen}
                  onCreateNew={(name, aspectRatioId, tags) => {
                    revealPreset(library.createPreset(name, previewAspectRatioForId(aspectRatioId), tags));
                    toast.success(`Created "${name.trim() || 'New preset'}"`);
                  }}
                  onOpenFiles={async () => {
                    try {
                      const files = await pickJsonFiles(true);
                      let imported = 0;
                      let lastImportedKey: string | undefined;
                      for (const file of files) {
                        try {
                          const document = parsePresetDocument(JSON.parse(file.text), file.fileName);
                          lastImportedKey = library.importPresetDocument(document, file.fileName, file.handle);
                          imported += 1;
                        } catch (error) {
                          toast.error(`Couldn't load "${file.fileName}": ${(error as Error).message}`);
                        }
                      }
                      if (imported > 0) {
                        revealPreset(lastImportedKey);
                        toast.success(`Opened ${imported} preset${imported === 1 ? '' : 's'}`);
                      }
                    } catch (error) {
                      if (!isAbortError(error)) {
                        toast.error(`Failed to open files: ${(error as Error).message}`);
                      }
                    }
                  }}
                  onDuplicate={(key, name, aspectRatioId) => {
                    const entry = library.entries.find((e) => e.key === key);
                    if (!entry) return;
                    const trimmed = name.trim() || `${entry.document.name} copy`;
                    revealPreset(
                      library.duplicatePreset(key, trimmed, {
                        previewAspectRatio: previewAspectRatioForId(aspectRatioId),
                      }),
                    );
                    toast.success(`Duplicated "${trimmed}"`);
                  }}
                  onSaveAsCopy={async (key, name, aspectRatioId, tags, previewSelection) => {
                    const source = library.entries.find((e) => e.key === key);
                    if (!source) return;
                    const validationMessage = validatePresetName(name);
                    if (validationMessage) {
                      toast.error(validationMessage);
                      return;
                    }
                    const trimmed = name.trim() || `${source.document.name} #2`;
                    const previewAspectRatio = previewAspectRatioForId(aspectRatioId);
                    const document = clonePresetDocument(source.document);
                    document.id = slugify(trimmed);
                    document.name = trimmed;
                    document.preview = { ...document.preview, aspectRatio: previewAspectRatio };
                    document.metadata = {
                      ...document.metadata,
                      ...(previewSelection
                        ? {
                            previewBackgroundId: previewSelection.backgroundId,
                            previewStoryId: previewSelection.storyId,
                          }
                        : {}),
                      ...(tags.length > 0 ? { badges: tags } : { badges: undefined }),
                    };
                    if (document.metadata.badges === undefined) {
                      const { badges: _badges, ...metadataWithoutBadges } = document.metadata;
                      document.metadata = Object.keys(metadataWithoutBadges).length > 0 ? metadataWithoutBadges : undefined;
                    }
                    const fileName = presetFileNameFor(trimmed);
                    const text = JSON.stringify(serializePresetDocument(document), null, 2);
                    try {
                      let handle: Awaited<ReturnType<typeof pickSaveHandleAndWrite>> = null;
                      if (isFileSystemAccessSupported()) {
                        handle = await pickSaveHandleAndWrite(fileName, text);
                        if (!handle) downloadTextFile(fileName, text);
                      } else {
                        downloadTextFile(fileName, text);
                      }
                      revealPreset(
                        library.duplicatePreset(key, trimmed, {
                          markDirty: false,
                          fileHandle: handle ?? undefined,
                          previewAspectRatio,
                          metadata: document.metadata,
                        }),
                      );
                      toast.success(`Exported "${trimmed}"`);
                    } catch (error) {
                      if (!isAbortError(error)) {
                        toast.error(`Failed to export "${trimmed}": ${(error as Error).message}`);
                      }
                    }
                  }}
                  canUndo={library.canUndo}
                  canRedo={library.canRedo}
                  undoLabel={library.undoLabel}
                  redoLabel={library.redoLabel}
                  history={library.history}
                  onUndo={library.undo}
                  onRedo={library.redo}
                  onUndoTo={library.undoTo}
                  previewVisibility={previewVisibility}
                  onPreviewVisibilityChange={handlePreviewVisibilityChange}
                  onAllPreviewVisibilityChange={handleAllPreviewVisibilityChange}
                />
              </div>
              <div
                className="pointer-events-none absolute bottom-3 left-3 z-20 flex items-center gap-2"
                data-preview-fixed-chrome="true"
              >
                <Tooltip>
                 <TooltipTrigger asChild>
                   <Button
                     type="button"
                     variant="ghost"
                     size="icon-sm"
                     className="pointer-events-auto shrink-0"
                     data-preview-viewport-control="true"
                     onClick={(event) => {
                       event.stopPropagation();
                       resetView();
                     }}
                     aria-label="Reset preview view"
                   >
                     <RotateCcw className="size-3.5" />
                   </Button>
                 </TooltipTrigger>
                 <TooltipContent side="right">Reset View</TooltipContent>
                </Tooltip>
              </div>
            <PreviewDebugDataProvider
              resetKey={`${selectedKey}:${selectedPreviewAspectId}`}
              onResolvedTransformsChange={handleResolvedTransformsChange}
            >
              <div
                ref={previewGraphRef}
                className={cn(
                  'absolute inset-0 overflow-hidden',
                  CANVAS_BG_GRID && 'bg-grid-fill',
                  isSettingsOpen && 'z-[55]',
                )}
                style={viewportSurfaceStyle}
              >
                {CANVAS_BG_GRID && (
                  <div
                    aria-hidden="true"
                    className="bg-grid-canvas pointer-events-none absolute"
                    data-preview-grid="true"
                    style={gridStyle}
                  />
                )}
                <PreviewWorkspace
                  preset={selected.document}
                  renderEnabled={previewRenderingEnabled}
                  viewportRef={previewViewportRef}
                  layoutContainerRef={previewGraphRef}
                  viewportStyle={viewportStyle}
                  viewportZoom={viewportZoom}
                  selectedEntityId={selectedEditorUi.selectedEntityId}
                  onSelectedEntityIdChange={handleSelectedEntityIdChange}
                  onViewStateInPreviewer={handleViewStateInPreviewer}
                  previewVisibility={previewVisibility}
                  playingPreviewId={playingPreviewId}
                  onPreviewPlayingChange={handlePreviewPlayingChange}
                  previewPlaybackSettings={previewPlaybackSettings}
                  onPreviewPlaybackSettingsChange={updatePreviewPlaybackSettings}
                  previewOverlayVisibility={previewOverlayVisibility}
                  onPreviewOverlayVisibilityChange={updatePreviewOverlayVisibility}
                  isPanning={isPanning}
                  aspectId={selectedPreviewAspectId}
                  onAspectIdChange={handlePreviewAspectIdChange}
                  backgroundId={previewBackgroundId}
                  onBackgroundIdChange={setPreviewBackgroundId}
                  backgroundColor={previewBackgroundColor}
                  onBackgroundColorChange={setPreviewBackgroundColor}
                  backgroundPaint={previewBackgroundPaint}
                  onBackgroundPaintChange={setPreviewBackgroundPaint}
                  storyId={previewStoryId}
                  onStoryIdChange={setPreviewStoryId}
                  textMode={previewTextMode}
                  onTextModeChange={setPreviewTextMode}
                  customText={previewCustomText}
                  onCustomTextChange={handlePreviewCustomTextChange}
                  fullCycleTextMode={fullCycleTextMode}
                  onFullCycleTextModeChange={setFullCycleTextMode}
                  fullCycleCustomText={fullCycleCustomText}
                  onFullCycleCustomTextChange={handleFullCycleCustomTextChange}
                  wordStateTextMode={wordStateTextMode}
                  onWordStateTextModeChange={setWordStateTextMode}
                  wordStateCustomText={wordStateCustomText}
                  onWordStateCustomTextChange={handleWordStateCustomTextChange}
                  hoveredEntity={hoveredEntity}
                  hoveredPaddingPreviewTarget={hoveredPaddingPreviewTarget}
                  hoveredPositionPreviewTarget={hoveredPositionPreviewTarget}
                  showCompositionAreaPadding={showCompositionAreaPadding}
                />
              </div>
              <DesignEditor
                presetKey={selectedKey}
                document={selected.document}
                savedDocument={selected.savedDocument}
                onUpdateDesign={library.updateDesign}
                historyNavigation={
                  library.historyNavigation?.key === library.selectedKey ? library.historyNavigation : undefined
                }
                onUpdateStateWindow={library.updateStateWindow}
                selectedEntityId={selectedEditorUi.selectedEntityId}
                onSelectedEntityIdChange={handleSelectedEntityIdChange}
                onViewStateInPreviewer={handleViewStateInPreviewer}
                hierarchyCollapsed={selectedEditorUi.hierarchyCollapsed}
                onHierarchyCollapsedChange={handleHierarchyCollapsedChange}
                inspectorScrollTop={selectedInspectorScrollTop}
                onInspectorScrollPositionCommit={commitInspectorScrollTop}
                inspectorCardOpenState={selectedInspectorCardOpenState}
                onInspectorCardOpenStateChange={updateSelectedInspectorCardOpenState}
                onInspectorCardOpenStateChangeForEntity={updateInspectorCardOpenStateForEntity}
                hoveredEntity={hoveredEntity}
                onHoverEntity={setHoveredEntity}
                pinnedDebugEntities={pinnedDebugEntities}
                showAllDebugOverlays={showAllDebugOverlays}
                onToggleDebugEntity={togglePinnedDebugEntity}
                paddingPreviewTarget={activePaddingPreviewTarget}
                onHoverPaddingPreviewTarget={setHoveredPaddingPreviewTarget}
                onTogglePaddingPreviewTarget={togglePaddingPreviewTarget}
                pinnedPaddingPreviewTarget={pinnedPaddingPreviewTarget}
                positionPreviewTarget={activePositionPreviewTarget}
                onHoverPositionPreviewTarget={setHoveredPositionPreviewTarget}
                onTogglePositionPreviewTarget={togglePositionPreviewTarget}
                pinnedPositionPreviewTarget={pinnedPositionPreviewTarget}
              />
            </PreviewDebugDataProvider>
          </div>
        </div>

        {isDragOver && (
          <div className="border-primary bg-background/90 pointer-events-none absolute inset-0 z-50 flex items-center justify-center gap-2 border-4 border-dashed">
            <UploadCloud className="text-primary size-6" />
            <p className="text-lg font-medium">Drop preset .json file(s) to import</p>
          </div>
        )}
      </div>

      <Toaster />
    </TooltipProvider>
  );
}

export default App;
