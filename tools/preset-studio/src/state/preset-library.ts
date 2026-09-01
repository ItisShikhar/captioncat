import type { FsFileHandleLike } from '@/lib/file-io';
import { presetFileNameFor, slugifyPresetName } from '@/lib/preset-name';
import { valuesEqual } from '@/lib/values-equal';
import {
  DEFAULT_CAPTION_WORD_WRAP_OVERFLOW_TOLERANCE,
  clonePresetDocument,
  instantiateComponentWithDependencies,
  schemaForEntity,
  updatePresetDesign,
  type ContainerNode,
  type EcsEntityDoc,
  type LeafDefinition,
  type PresetEditorState,
  type PreviewAspectRatio,
  type PropertyNode,
} from '@/schema';
import { describeDesignChange, findDesignHistoryReveal, type HistoryReveal } from './design-history-reveal';
import { useCallback, useMemo, useState } from 'react';

export type PresetOrigin = 'bundled' | 'imported' | 'new';

export interface LibraryEntry {
  /** Stable React/selection key - distinct from `document.id` since multiple entries can share a document id. */
  key: string;
  /** Suggested file name for saving/exporting, e.g. "banger.json". */
  fileName: string;
  document: PresetEditorState;
  /**
 * Snapshot of `document` as of the last on-disk save (or the initial
 * load/duplicate for presets that have never been saved yet). Powers
 * "reset to saved" without needing a full undo history.
 */
  savedDocument: PresetEditorState;
  origin: PresetOrigin;
  /** True once the in-memory document has diverged from what was last "saved" (see persistence-io phase). */
  dirty: boolean;
  /**
 * Live handle to the file this preset was opened/saved from (File System
 * Access API, Chromium only). When present, "Save (overwrite)" writes
 * straight back to this file with no picker dialog.
 */
  fileHandle?: FsFileHandleLike;
}

export interface PresetHistoryItem {
  id: string;
  index: number;
  label: string;
}

export interface PresetHistoryNavigation {
  key: string;
  direction: 'undo' | 'redo' | 'undoTo';
  sequence: number;
  reveal?: HistoryReveal;
}

export interface DuplicatePresetOptions {
  markDirty?: boolean;
  fileHandle?: FsFileHandleLike;
  previewAspectRatio?: PreviewAspectRatio;
  metadata?: PresetEditorState['metadata'];
}

interface PresetHistoryStep {
  before: PresetEditorState;
  after: PresetEditorState;
  label: string;
  reveal?: HistoryReveal;
}

interface PresetHistory {
  past: PresetHistoryStep[];
  future: PresetHistoryStep[];
}

interface PresetLibraryState {
  entries: LibraryEntry[];
  selectedKey?: string;
  historyByKey: Record<string, PresetHistory>;
  historyNavigation?: PresetHistoryNavigation;
}

const MAX_HISTORY_ENTRIES = 100;
const EMPTY_HISTORY: PresetHistory = { past: [], future: [] };

let keyCounter = 0;
function nextKey(prefix: string): string {
  keyCounter += 1;
  return `${prefix}-${keyCounter}-${Date.now().toString(36)}`;
}

export const slugify = slugifyPresetName;

interface NewPresetPropertyDefault {
  path: readonly string[];
  type: LeafDefinition['type'];
  value: unknown;
}

function setPropertyDefault(
  children: Record<string, PropertyNode>,
  { path, type, value }: NewPresetPropertyDefault,
): Record<string, PropertyNode> {
  const [key, ...remainingPath] = path;
  if (!key) return children;

  if (remainingPath.length === 0) {
    const existing = children[key];
    const leaf: LeafDefinition =
      existing?.kind === 'leaf' ? { ...existing, type, value } : { kind: 'leaf', type, value };
    return { ...children, [key]: leaf };
  }

  const existing = children[key];
  const container: ContainerNode =
    existing?.kind === 'container'
      ? existing
      : { kind: 'container', wrapping: 'inline', children: {} };
  return {
    ...children,
    [key]: {
      ...container,
      children: setPropertyDefault(container.children, { path: remainingPath, type, value }),
    },
  };
}

function setComponentDefaults(
  entity: EcsEntityDoc,
  componentType: string,
  defaults: readonly NewPresetPropertyDefault[],
): EcsEntityDoc {
  const componentIndex = entity.components.findIndex((component) => component.component === componentType);
  if (componentIndex < 0) return entity;
  const component = entity.components[componentIndex];
  const props = defaults.reduce((current, property) => setPropertyDefault(current, property), component.props);
  if (props === component.props) return entity;
  const components = [...entity.components];
  components[componentIndex] = { ...component, props };
  return { ...entity, components };
}

function addPageVerticalSpacerDefault(entity: EcsEntityDoc): EcsEntityDoc {
  if (entity.components.some((component) => component.component === 'verticalSpacer')) return entity;
  const templates = schemaForEntity(entity);
  const template = templates.find((candidate) => candidate.component === 'verticalSpacer');
  if (!template) throw new Error('The page schema must define a verticalSpacer component template.');
  const spacer = instantiateComponentWithDependencies(template, templates)[0];
  if (!spacer) throw new Error('The page verticalSpacer component could not be instantiated.');
  const spacing = spacer.props.spacing;
  if (spacing?.kind !== 'leaf' || spacing.type !== 'number') {
    throw new Error('The page verticalSpacer template must define a numeric spacing property.');
  }
  return {
    ...entity,
    components: [
      ...entity.components,
      {
        ...spacer,
        props: {
          ...spacer.props,
          spacing: { ...spacing, value: 8 },
        },
      },
    ],
  };
}

function updateEntityByKind(
  entity: EcsEntityDoc,
  entityKind: string,
  update: (entity: EcsEntityDoc) => EcsEntityDoc,
): EcsEntityDoc {
  const updatedEntity = entity.entity === entityKind ? update(entity) : entity;
  let childrenChanged = false;
  const children = updatedEntity.children.map((child) => {
    const updatedChild = updateEntityByKind(child, entityKind, update);
    childrenChanged ||= updatedChild !== child;
    return updatedChild;
  });
  return childrenChanged ? { ...updatedEntity, children } : updatedEntity;
}

function applyNewPresetDefaults(design: EcsEntityDoc): EcsEntityDoc {
  const compositionAreaDefaults: NewPresetPropertyDefault[] = [
    { path: ['widthMode'], type: 'string', value: 'fitParent' },
    { path: ['heightMode'], type: 'string', value: 'fitParent' },
  ];
  const compositionLayoutDefaults: NewPresetPropertyDefault[] = [
    { path: ['padding', 'top'], type: 'number', value: 20 },
    { path: ['padding', 'right'], type: 'number', value: 20 },
    { path: ['padding', 'bottom'], type: 'number', value: 20 },
    { path: ['padding', 'left'], type: 'number', value: 20 },
    { path: ['childrenAlignment', 'verticalAlignment'], type: 'string', value: 'bottom' },
  ];
  const pageDefaults: NewPresetPropertyDefault[] = [
    { path: ['widthMode'], type: 'string', value: 'fitChildren' },
    { path: ['heightMode'], type: 'string', value: 'fitChildren' },
    { path: ['position'], type: 'vector2', value: { x: 0, y: -180 } },
  ];

  let updatedDesign = updateEntityByKind(design, 'compositionArea', (entity) =>
    setComponentDefaults(
      setComponentDefaults(entity, 'transform', compositionAreaDefaults),
      'layout',
      compositionLayoutDefaults,
    ),
  );
  updatedDesign = updateEntityByKind(updatedDesign, 'page', (entity) =>
    addPageVerticalSpacerDefault(setComponentDefaults(entity, 'transform', pageDefaults)),
  );
  return updatedDesign;
}

function applyNewPresetCaptionLayoutDefaults(
  captionLayout: PresetEditorState['captionLayout'],
): PresetEditorState['captionLayout'] {
  return {
    ...captionLayout,
    breaking: {
      ...captionLayout.breaking,
      wordWrapping: {
        ...captionLayout.breaking.wordWrapping,
        overflowTolerance: DEFAULT_CAPTION_WORD_WRAP_OVERFLOW_TOLERANCE,
      },
    },
  };
}

export function makeLibraryEntry(
  document: PresetEditorState,
  fileName: string,
  origin: PresetOrigin,
  fileHandle?: FsFileHandleLike,
): LibraryEntry {
  return {
    key: nextKey(origin),
    fileName,
    document,
    savedDocument: clonePresetDocument(document),
    origin,
    dirty: origin === 'new',
    fileHandle,
  };
}

function replaceEntryDocument(
  state: PresetLibraryState,
  key: string,
  document: PresetEditorState,
  label: string,
): PresetLibraryState {
  const entry = state.entries.find((candidate) => candidate.key === key);
  if (!entry || valuesEqual(document, entry.document)) return state;
  const history = state.historyByKey[key] ?? EMPTY_HISTORY;
  const historyLabel =
    label === 'Edit design'
      ? (describeDesignChange(entry.document.design, document.design) ?? label)
      : label;
  const step: PresetHistoryStep = {
    before: clonePresetDocument(entry.document),
    after: clonePresetDocument(document),
    label: historyLabel,
    reveal: findDesignHistoryReveal(entry.document.design, document.design),
  };
  const past = [...history.past, step].slice(-MAX_HISTORY_ENTRIES);
  const nextEntry: LibraryEntry = {
    ...entry,
    document,
    dirty: !valuesEqual(document, entry.savedDocument),
  };
  return {
    ...state,
    entries: state.entries.map((candidate) => (candidate.key === key ? nextEntry : candidate)),
    historyByKey: {
      ...state.historyByKey,
      [key]: { past, future: [] },
    },
  };
}

/**
 * In-memory preset library: the full list of presets loaded into the
 * studio (bundled samples + anything imported/duplicated/created this
 * session), plus the current selection and per-preset state operations.
 * Actual disk persistence (File System Access API / download / drag-drop)
 * is layered on in the persistence-io phase via the `onSaveOverwrite`
 * callback. This hook owns in-memory state.
 */
export function usePresetLibrary(initialEntries: LibraryEntry[], starterDocument: PresetEditorState) {
  const [libraryState, setLibraryState] = useState<PresetLibraryState>(() => ({
    entries: initialEntries,
    selectedKey: initialEntries.find((entry) => entry.document.id === 'banger')?.key ?? initialEntries[0]?.key,
    historyByKey: {},
  }));
  const { entries, selectedKey, historyByKey } = libraryState;

  const selected = useMemo(() => entries.find((e) => e.key === selectedKey) ?? entries[0], [entries, selectedKey]);

  const selectPreset = useCallback(
    (key: string) => setLibraryState((current) => ({ ...current, selectedKey: key })),
    [],
  );

  const updateSelectedDocument = useCallback(
    (updater: (previous: PresetEditorState) => PresetEditorState, label: string) => {
      setLibraryState((current) => {
        const entry = current.entries.find((candidate) => candidate.key === current.selectedKey);
        if (!entry) return current;
        return replaceEntryDocument(current, entry.key, updater(entry.document), label);
      });
    },
    [],
  );

  /**
 * Replaces the selected preset's whole ECS `design` entity tree via an
 * immutable updater. The sectioned entity editor (`DesignEditor`) composes
 * one of these per edit, mapping the change down to the specific
 * entity/component/effect/prop it touched, so each edit only ever rewrites
 * the branch it changed and leaves the rest of the tree intact.
 */
  const updateDesign = useCallback(
    (updater: (previous: EcsEntityDoc) => EcsEntityDoc, label = 'Edit design') => {
      updateSelectedDocument(
        (previous) => updatePresetDesign(previous, updater(previous.design)),
        label,
      );
    },
    [updateSelectedDocument],
  );

  /** Updates the preset-root `timing` block (sits alongside `design`, not inside it). */
  const updateTiming = useCallback(
    (updater: (previous: PresetEditorState['timing']) => PresetEditorState['timing'], label = 'Edit timing') => {
      updateSelectedDocument((previous) => ({ ...previous, timing: updater(previous.timing) }), label);
    },
    [updateSelectedDocument],
  );

  const updateCaptionLayout = useCallback(
    (
      updater: (previous: PresetEditorState['captionLayout']) => PresetEditorState['captionLayout'],
      label = 'Edit caption layout',
    ) => {
      updateSelectedDocument((previous) => ({ ...previous, captionLayout: updater(previous.captionLayout) }), label);
    },
    [updateSelectedDocument],
  );

  const updateStateWindow = useCallback(
    (
      updater: (previous: PresetEditorState['stateWindow']) => PresetEditorState['stateWindow'],
      label = 'Edit state window',
    ) => {
      updateSelectedDocument((previous) => ({ ...previous, stateWindow: updater(previous.stateWindow) }), label);
    },
    [updateSelectedDocument],
  );

  const duplicatePreset = useCallback(
    (key: string, newName?: string, options: DuplicatePresetOptions = {}) => {
      const source = entries.find((e) => e.key === key);
      if (!source) return undefined;
      const { fileHandle, markDirty = true, previewAspectRatio, metadata } = options;
      const name = newName?.trim() || `${source.document.name} copy`;
      const document = clonePresetDocument(source.document);
      document.id = slugify(name);
      document.name = name;
      if (previewAspectRatio !== undefined) {
        document.preview = { ...document.preview, aspectRatio: previewAspectRatio };
      }
      if (metadata !== undefined) {
        document.metadata = {
          ...metadata,
          ...(metadata.badges ? { badges: [...metadata.badges] } : {}),
        };
      }
      const entry = {
        ...makeLibraryEntry(document, presetFileNameFor(name), 'new', fileHandle),
        dirty: markDirty,
      };
      setLibraryState((current) => {
        const index = current.entries.findIndex((candidate) => candidate.key === key);
        if (index < 0) return current;
        const next = [...current.entries];
        next.splice(index + 1, 0, entry);
        return { ...current, entries: next, selectedKey: entry.key };
      });
      return entry.key;
    },
    [entries],
  );

  const duplicatePresetToCustom = useCallback((key: string) => {
    const source = entries.find((e) => e.key === key);
    if (!source) return undefined;
    const name = `${source.document.name} copy`;
    const document = clonePresetDocument(source.document);
    document.id = slugify(name);
    document.name = name;
    document.metadata = { ...document.metadata, platform: 'custom' };
    const entry = {
      ...makeLibraryEntry(document, presetFileNameFor(name), 'new'),
      dirty: true,
    };
    setLibraryState((current) => {
      const firstCustomIndex = current.entries.findIndex((candidate) => candidate.origin !== 'bundled');
      const next = [...current.entries];
      next.splice(firstCustomIndex >= 0 ? firstCustomIndex : next.length, 0, entry);
      return { ...current, entries: next, selectedKey: entry.key };
    });
    return entry.key;
  }, [entries]);

  const createPreset = useCallback(
    (newName: string, previewAspectRatio?: PreviewAspectRatio, tags: readonly string[] = []) => {
      const trimmed = newName.trim();
      if (!trimmed) return;
      const document = clonePresetDocument(starterDocument);
      document.id = slugify(trimmed);
      document.name = trimmed;
      document.captionLayout = applyNewPresetCaptionLayoutDefaults(document.captionLayout);
      document.design = applyNewPresetDefaults(document.design);
      if (previewAspectRatio !== undefined) {
        document.preview = { ...document.preview, aspectRatio: previewAspectRatio };
      }
      document.metadata = { platform: 'custom', ...(tags.length > 0 ? { badges: [...tags] } : {}) };
      const entry = {
        ...makeLibraryEntry(document, presetFileNameFor(trimmed), 'new'),
        dirty: true,
      };
      setLibraryState((current) => {
        const index = current.entries.findIndex((candidate) => candidate.key === selectedKey);
        const next = [...current.entries];
        next.splice(index >= 0 ? index + 1 : next.length, 0, entry);
        return { ...current, entries: next, selectedKey: entry.key };
      });
      return entry.key;
    },
    [selectedKey, starterDocument],
  );

  const importPresetDocument = useCallback(
    (document: PresetEditorState, fileName: string, fileHandle?: FsFileHandleLike) => {
      const entry = makeLibraryEntry(document, fileName, 'imported', fileHandle);
      setLibraryState((current) => ({
        ...current,
        entries: [...current.entries, entry],
        selectedKey: entry.key,
      }));
      return entry.key;
    },
    [],
  );

  /** Marks the preset as saved (no-op on the underlying data - real disk write happens in the caller). */
  const markSaved = useCallback((key: string, fileHandle?: FsFileHandleLike | null) => {
    setLibraryState((current) => ({
      ...current,
      entries: current.entries.map((e) =>
        e.key === key
          ? {
              ...e,
              dirty: false,
              savedDocument: clonePresetDocument(e.document),
              fileHandle: fileHandle === null ? undefined : fileHandle ?? e.fileHandle,
            }
          : e,
      ),
    }));
  }, []);

  const selectedHistory = historyByKey[selectedKey ?? ''] ?? EMPTY_HISTORY;
  const canUndo = selectedHistory.past.length > 0;
  const canRedo = selectedHistory.future.length > 0;
  const undoLabel = selectedHistory.past[selectedHistory.past.length - 1]?.label;
  const redoLabel = selectedHistory.future[0]?.label;
  const history = useMemo<PresetHistoryItem[]>(
    () =>
      selectedHistory.past.map((step, index) => ({
        id: `past-${index}`,
        index,
        label: step.label,
      })),
    [selectedHistory.past],
  );

  const undo = useCallback(() => {
    setLibraryState((current) => {
      const key = current.selectedKey;
      if (!key) return current;
      const historyState = current.historyByKey[key] ?? EMPTY_HISTORY;
      const step = historyState.past[historyState.past.length - 1];
      const entry = current.entries.find((candidate) => candidate.key === key);
      if (!step || !entry) return current;
      const document = clonePresetDocument(step.before);
      return {
        ...current,
        entries: current.entries.map((candidate) =>
          candidate.key === key
            ? {
                ...candidate,
                document,
                dirty: !valuesEqual(document, candidate.savedDocument),
              }
            : candidate,
        ),
        historyByKey: {
          ...current.historyByKey,
          [key]: {
            past: historyState.past.slice(0, -1),
            future: [step, ...historyState.future].slice(0, MAX_HISTORY_ENTRIES),
          },
        },
        historyNavigation: {
          key,
          direction: 'undo',
          sequence: (current.historyNavigation?.sequence ?? 0) + 1,
          reveal: step.reveal,
        },
      };
    });
  }, []);

  const undoTo = useCallback((index: number) => {
    setLibraryState((current) => {
      const key = current.selectedKey;
      if (!key) return current;
      const historyState = current.historyByKey[key] ?? EMPTY_HISTORY;
      const targetStep = historyState.past[index];
      const entry = current.entries.find((candidate) => candidate.key === key);
      if (!targetStep || !entry || index >= historyState.past.length - 1) return current;
      const undoneSteps = historyState.past.slice(index + 1);
      const document = clonePresetDocument(targetStep.after);
      return {
        ...current,
        entries: current.entries.map((candidate) =>
          candidate.key === key
            ? {
                ...candidate,
                document,
                dirty: !valuesEqual(document, candidate.savedDocument),
              }
            : candidate,
        ),
        historyByKey: {
          ...current.historyByKey,
          [key]: {
            past: historyState.past.slice(0, index + 1),
            future: [...undoneSteps, ...historyState.future],
          },
        },
        historyNavigation: {
          key,
          direction: 'undoTo',
          sequence: (current.historyNavigation?.sequence ?? 0) + 1,
          reveal: findDesignHistoryReveal(entry.document.design, document.design) ?? targetStep.reveal,
        },
      };
    });
  }, []);

  const redo = useCallback(() => {
    setLibraryState((current) => {
      const key = current.selectedKey;
      if (!key) return current;
      const historyState = current.historyByKey[key] ?? EMPTY_HISTORY;
      const step = historyState.future[0];
      const entry = current.entries.find((candidate) => candidate.key === key);
      if (!step || !entry) return current;
      const document = clonePresetDocument(step.after);
      return {
        ...current,
        entries: current.entries.map((candidate) =>
          candidate.key === key
            ? {
                ...candidate,
                document,
                dirty: !valuesEqual(document, candidate.savedDocument),
              }
            : candidate,
        ),
        historyByKey: {
          ...current.historyByKey,
          [key]: {
            past: [...historyState.past, step].slice(-MAX_HISTORY_ENTRIES),
            future: historyState.future.slice(1),
          },
        },
        historyNavigation: {
          key,
          direction: 'redo',
          sequence: (current.historyNavigation?.sequence ?? 0) + 1,
          reveal: step.reveal,
        },
      };
    });
  }, []);

  return {
    entries,
    selected,
    selectedKey,
    selectPreset,
    updateDesign,
    updateTiming,
    updateCaptionLayout,
    updateStateWindow,
    duplicatePreset,
    duplicatePresetToCustom,
    createPreset,
    importPresetDocument,
    markSaved,
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    historyNavigation: libraryState.historyNavigation,
    history,
    undo,
    undoTo,
    redo,
  };
}
