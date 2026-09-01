import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import {
  createBackgroundEntity,
  createImageEntity,
  createMarkerEntity,
  createStateStyleReference,
  ENTITY_STATES,
  isInheritedStateEntity,
  isStateGroupId,
  isStateOverrideEntity,
  materializeStateStyle,
  setStateStyleSource,
  stateFamilyParentFor,
  type EcsComponentDoc,
  type EcsEffectDoc,
  type EcsEntityDoc,
  type PresetEditorState,
  type StateStyleSource,
} from '@/schema';
import type { TransitionConfig } from '@/schema/property-tree';
import type { HistoryRevealTarget } from '@/state/design-history-reveal';
import type { PresetHistoryNavigation } from '@/state/preset-library';
import { InspectorHeaderMenuProvider } from '@/ui/controls/inspector-header-options';
import { InspectorOverlayPortalContext } from '@/ui/panels/design-editor/shared/inspector-overlay-portal';
import { DebugEntityHoverContext, InspectorCardStateContext } from '@/ui/panels/property-tree-view';
import type { DebugEntityKind, PaddingPreviewTarget, PositionPreviewTarget } from '@/ui/preview/entity-debug';
import type { StatePreviewTarget } from '@/ui/preview/preview-workspace';

import {
  canDuplicateComponent,
  canDuplicateEffect,
  canPasteComponent,
  canPasteEffect,
  createComponentCopyPayload,
  createEffectCopyPayload,
  duplicateComponentIntoEntity,
  duplicateEffectIntoEntity,
  pasteComponentIntoEntity,
  pasteEffectIntoEntity,
  type ComponentCopyPayload,
  type ComponentCopySource,
  type ComponentPasteTarget,
  type EffectCopySource,
  type EffectDuplicateTarget,
  type EffectPasteTarget,
} from './component-copy-paste';
import { ComponentCopyPasteContext, type ComponentCopyPasteContextValue } from './component-copy-paste-context';
import {
  clearForEntityReferences,
  defaultFollowTargetForEntity,
  fallbackSelectedEntity,
  findEntityById,
  findParentOf,
  makeInspectorStateKey,
  markerOwnerEntity,
  removeAnimationTracksForRemovedReplicatorCopies,
  reorderEntityById,
  updateEntityById,
  type EntitySelectionSource,
  type StateSuffix,
} from './entity-tree';
import { FloatingResizablePanel } from './floating-resizable-panel';
import { HierarchyPanel } from './hierarchy/hierarchy-panel';
import { CaptionLayoutContext } from './inspector/caption-layout-context';
import { InspectorPanel } from './inspector/inspector-panel';
import { StateApplySuggestionContext, type StateApplySuggestion } from './inspector/state-apply-suggestion-context';
import {
  applyComponentToStates,
  applyEffectChangeToStates as applyEffectChangeToStatesInDocument,
  applyPropertyToStates,
  applyTransitionToStates,
  changedPropertyChangeForComponent,
  changedPropertyTargetForEffect,
  getPropertyApplyAvailability,
  normalizeStatePropertyChangeForEntity,
  type StateOverrideNavigationTarget,
  type StateOverrideSource,
  type StatePropertyChange,
} from './state-overrides';
import type { DebugControls } from './types';

const ADDED_ENTITY_STATE = 'default';
const HIERARCHY_PANEL_COMPACT_WIDTH = 96;
const HIERARCHY_PANEL_DEFAULT_WIDTH = 248;
const HIERARCHY_PANEL_MAX_WIDTH = 312;
const INSPECTOR_PANEL_MIN_WIDTH = 296;
const INSPECTOR_PANEL_DEFAULT_WIDTH = 320;
const INSPECTOR_PANEL_MAX_WIDTH = 520;
const FLOATING_PANEL_EDGE_INSET = 10;
const FLOATING_PANEL_GAP = 10;

function initialFloatingPanelWidth(minWidth: number, maxWidth: number, ratio: number, fallback: number): number {
  const viewportWidth = typeof window === 'undefined' ? fallback : window.innerWidth;
  return Math.round(Math.min(maxWidth, Math.max(minWidth, viewportWidth * ratio)));
}

function stateLabels(stateSuffixes: readonly StateSuffix[]): string {
  return stateSuffixes
    .map((suffix) => ENTITY_STATES.find((state) => state.suffix === suffix)?.label ?? suffix)
    .join(', ');
}

function nextAddedEntityId(root: EcsEntityDoc, entityKind: 'background' | 'image' | 'marker'): string {
  const baseId = `${entityKind}:${ADDED_ENTITY_STATE}`;
  if (!findEntityById(root, baseId)) return baseId;
  let suffix = 1;
  while (findEntityById(root, `${baseId}:${suffix}`)) suffix += 1;
  return `${baseId}:${suffix}`;
}

function selectedEntityForInspection(root: EcsEntityDoc, selectedEntityId: string): EcsEntityDoc {
  const entity = findEntityById(root, selectedEntityId);
  if (entity) return entity;

  const fallback = fallbackSelectedEntity(root, selectedEntityId);
  if (!fallback || !isStateGroupId(selectedEntityId)) return fallback ?? root;
  return createStateStyleReference(fallback, selectedEntityId, 'default');
}

function materializeSelectedState(root: EcsEntityDoc, selectedEntityId: string): EcsEntityDoc {
  return isStateGroupId(selectedEntityId) ? materializeStateStyle(root, selectedEntityId) : root;
}

interface DesignEditorProps {
  presetKey: string;
  document: PresetEditorState;
  savedDocument: PresetEditorState;
  /** Replaces the whole ECS `design` entity tree via an immutable updater (see `usePresetLibrary.updateDesign`). */
  onUpdateDesign: (updater: (previous: EcsEntityDoc) => EcsEntityDoc, label?: string) => void;
  historyNavigation?: PresetHistoryNavigation;
  onUpdateStateWindow: (updater: (previous: PresetEditorState['stateWindow']) => PresetEditorState['stateWindow']) => void;
  selectedEntityId: string;
  onSelectedEntityIdChange: (id: string, source?: EntitySelectionSource) => void;
  onViewStateInPreviewer: (target: StatePreviewTarget) => void;
  hierarchyCollapsed: boolean;
  onHierarchyCollapsedChange: (collapsed: boolean) => void;
  inspectorScrollTop: number;
  onInspectorScrollPositionCommit: (presetKey: string, entityId: string, scrollTop: number) => void;
  inspectorCardOpenState: Record<string, boolean>;
  onInspectorCardOpenStateChange: (updater: (previous: Record<string, boolean>) => Record<string, boolean>) => void;
  onInspectorCardOpenStateChangeForEntity: (
    entityId: string,
    updater: (previous: Record<string, boolean>) => Record<string, boolean>,
  ) => void;
  /** Which entity's debug grid is currently exclusively previewed (hover, temporary) in the live preview, if any - see `entity-debug.ts`. */
  hoveredEntity: DebugEntityKind | null;
  onHoverEntity: (entity: DebugEntityKind | null) => void;
  pinnedDebugEntities: DebugEntityKind[];
  showAllDebugOverlays: boolean;
  onToggleDebugEntity: (entity: DebugEntityKind) => void;
  paddingPreviewTarget: PaddingPreviewTarget | null;
  onHoverPaddingPreviewTarget: (target: PaddingPreviewTarget | null) => void;
  onTogglePaddingPreviewTarget: (target: PaddingPreviewTarget) => void;
  pinnedPaddingPreviewTarget: PaddingPreviewTarget | null;
  positionPreviewTarget: PositionPreviewTarget | null;
  onHoverPositionPreviewTarget: (target: PositionPreviewTarget | null) => void;
  onTogglePositionPreviewTarget: (target: PositionPreviewTarget) => void;
  pinnedPositionPreviewTarget: PositionPreviewTarget | null;
}

/**
 * Top-level editor for a preset's ECS `design` entity tree, plus the preset-
 * root `timing` settings. Composes the hierarchy column (`HierarchyPanel`)
 * and the inspector column (`InspectorPanel`) as independent floating panes
 * over the preview workspace.
 */
export const DesignEditor = memo(function DesignEditor({
  presetKey,
  document,
  savedDocument,
  onUpdateDesign,
  historyNavigation,
  onUpdateStateWindow,
  selectedEntityId,
  onSelectedEntityIdChange,
  onViewStateInPreviewer,
  hierarchyCollapsed,
  onHierarchyCollapsedChange,
  inspectorScrollTop,
  onInspectorScrollPositionCommit,
  inspectorCardOpenState,
  onInspectorCardOpenStateChange,
  onInspectorCardOpenStateChangeForEntity,
  hoveredEntity,
  onHoverEntity,
  pinnedDebugEntities,
  showAllDebugOverlays,
  onToggleDebugEntity,
  paddingPreviewTarget,
  onHoverPaddingPreviewTarget,
  onTogglePaddingPreviewTarget,
  pinnedPaddingPreviewTarget,
  positionPreviewTarget,
  onHoverPositionPreviewTarget,
  onTogglePositionPreviewTarget,
  pinnedPositionPreviewTarget,
}: DesignEditorProps): ReactNode {
  const pendingEntitySelectionIdRef = useRef<string | null>(null);
  const [hierarchyWidth, setHierarchyWidth] = useState(() =>
    initialFloatingPanelWidth(
      HIERARCHY_PANEL_COMPACT_WIDTH,
      HIERARCHY_PANEL_MAX_WIDTH,
      0.22,
      HIERARCHY_PANEL_DEFAULT_WIDTH,
    ),
  );
  const [inspectorWidth, setInspectorWidth] = useState(() =>
    initialFloatingPanelWidth(
      INSPECTOR_PANEL_MIN_WIDTH,
      INSPECTOR_PANEL_MAX_WIDTH,
      0.26,
      INSPECTOR_PANEL_DEFAULT_WIDTH,
    ),
  );
  const [inspectorColumnNode, setInspectorColumnNode] = useState<HTMLDivElement | null>(null);
  const [pendingStateOverrideNavigation, setPendingStateOverrideNavigation] =
    useState<StateOverrideNavigationTarget | null>(null);
  const [pendingHistoryReveal, setPendingHistoryReveal] = useState<HistoryRevealTarget | null>(null);
  const lastHistoryRevealSequenceRef = useRef<number | null>(null);
  const [componentCopyPayload, setComponentCopyPayload] = useState<ComponentCopyPayload | null>(null);
  const debug = useMemo<DebugControls>(
    () => ({
      hoveredEntity,
      onHoverEntity,
      onHoverPaddingPreviewTarget,
      onHoverPositionPreviewTarget,
      pinnedDebugEntities,
      showAllDebugOverlays,
      onToggleDebugEntity,
      onTogglePaddingPreviewTarget,
      onTogglePositionPreviewTarget,
    }),
    [
      hoveredEntity,
      onHoverEntity,
      onHoverPaddingPreviewTarget,
      onHoverPositionPreviewTarget,
      pinnedDebugEntities,
      showAllDebugOverlays,
      onToggleDebugEntity,
      onTogglePaddingPreviewTarget,
      onTogglePositionPreviewTarget,
    ],
  );
  const selectEntityWhenReady = useCallback(
    (entityId: string) => {
      pendingEntitySelectionIdRef.current = entityId;
      onSelectedEntityIdChange(entityId);
    },
    [onSelectedEntityIdChange],
  );

  const addMarkerEntity = useCallback(
    (targetId: string): string | undefined => {
      const selected = findEntityById(document.design, targetId);
      if (!selected) return undefined;
      const insertionParent = findParentOf(document.design, selected.id)?.parent;
      if (!insertionParent) return undefined;
      const followTarget = defaultFollowTargetForEntity(selected);
      const marker = {
        ...createMarkerEntity(nextAddedEntityId(document.design, 'marker'), { followTarget }),
        forEntityId: selected.id,
      };
      onUpdateDesign((previous) =>
        updateEntityById(previous, insertionParent.id, (parent) => ({
          ...parent,
          children: [...parent.children, marker],
        })),
      );
      selectEntityWhenReady(marker.id);
      onInspectorCardOpenStateChangeForEntity(marker.id, (previous) => ({
        ...previous,
        [makeInspectorStateKey(
          'component',
          marker.components.find((component) => component.component === 'markerBehavior')?.studioId ?? marker.id,
        )]: true,
      }));
      return marker.id;
    },
    [document.design, onInspectorCardOpenStateChangeForEntity, onUpdateDesign, selectEntityWhenReady],
  );

  const addBackgroundEntity = useCallback(
    (targetId: string): string | undefined => {
      const selected = findEntityById(document.design, targetId);
      if (!selected) return undefined;
      const background = createBackgroundEntity(
        nextAddedEntityId(document.design, 'background'),
        selected.id,
        defaultFollowTargetForEntity(selected),
      );
      onUpdateDesign((previous) => {
        const parentInfo = findParentOf(previous, selected.id);
        if (!parentInfo) {
          return updateEntityById(previous, selected.id, (current) => ({
            ...current,
            children: [background, ...current.children],
          }));
        }
        return updateEntityById(previous, parentInfo.parent.id, (parent) => {
          const children = [...parent.children];
          const targetIndex = children.findIndex((child) => child.id === selected.id);
          children.splice(targetIndex >= 0 ? targetIndex : children.length, 0, background);
          return { ...parent, children };
        });
      });
      selectEntityWhenReady(background.id);
      onInspectorCardOpenStateChangeForEntity(background.id, (previous) => {
        const next = { ...previous };
        for (const component of background.components) {
          if (component.studioId) next[makeInspectorStateKey('component', component.studioId)] = true;
        }
        return next;
      });
      return background.id;
    },
    [document.design, onInspectorCardOpenStateChangeForEntity, onUpdateDesign, selectEntityWhenReady],
  );

  const addImageEntity = useCallback(
    (targetId: string): string | undefined => {
      const selected = findEntityById(document.design, targetId);
      if (!selected) return undefined;
      const owner = isStateOverrideEntity(selected)
        ? (findParentOf(document.design, selected.id)?.parent.children.find(
            (child) => child.id === `${selected.entity}:default`,
          ) ?? selected)
        : selected;
      if (owner.entity !== 'row' && owner.entity !== 'page') return undefined;

      const image = createImageEntity(nextAddedEntityId(document.design, 'image'));
      onUpdateDesign((previous) =>
        updateEntityById(previous, owner.id, (current) => {
          const children = [...current.children];
          const firstFlowChild = children.findIndex(
            (child) =>
              child.entity === 'image' ||
              child.entity === 'word' ||
              (current.entity === 'page' && child.entity === 'row'),
          );
          children.splice(firstFlowChild >= 0 ? firstFlowChild : children.length, 0, image);
          return { ...current, children };
        }),
      );
      selectEntityWhenReady(image.id);
      onInspectorCardOpenStateChangeForEntity(image.id, (previous) => {
        const next = { ...previous };
        for (const component of image.components) {
          if (component.studioId) next[makeInspectorStateKey('component', component.studioId)] = true;
        }
        return next;
      });
      return image.id;
    },
    [document.design, onInspectorCardOpenStateChangeForEntity, onUpdateDesign, selectEntityWhenReady],
  );

  useEffect(() => {
    const pendingSelectionId = pendingEntitySelectionIdRef.current;
    if (pendingSelectionId) {
      if (findEntityById(document.design, pendingSelectionId)) {
        if (selectedEntityId !== pendingSelectionId) onSelectedEntityIdChange(pendingSelectionId);
        pendingEntitySelectionIdRef.current = null;
        return;
      }
      if (selectedEntityId === pendingSelectionId) return;
      pendingEntitySelectionIdRef.current = null;
    }
    if (findEntityById(document.design, selectedEntityId)) return;
    if (fallbackSelectedEntity(document.design, selectedEntityId)) return;
    onSelectedEntityIdChange(document.design.id);
  }, [document.design, onSelectedEntityIdChange, selectedEntityId]);

  const selectedEntity = selectedEntityForInspection(document.design, selectedEntityId);
  const [stateApplySuggestion, setStateApplySuggestion] = useState<StateApplySuggestion | null>(null);
  const selectedState = useMemo(
    () => ENTITY_STATES.find((state) => state.suffix === selectedEntity.id.slice(selectedEntity.id.indexOf(':') + 1)),
    [selectedEntity.id],
  );
  const customizeSelectedState = useCallback(() => {
    if (!isStateGroupId(selectedEntity.id) || selectedState?.key === 'default') return;
    onUpdateDesign(
      (previous) => materializeSelectedState(previous, selectedEntity.id),
      'Customize state style',
    );
  }, [onUpdateDesign, selectedEntity.id, selectedState?.key]);
  const changeSelectedStateStyle = useCallback(
    (source: StateStyleSource) => {
      if (!isStateGroupId(selectedEntity.id) || selectedState?.key === 'default') return;
      onUpdateDesign(
        (previous) => setStateStyleSource(previous, selectedEntity.id, source),
        `Use ${source} state style`,
      );
    },
    [onUpdateDesign, selectedEntity.id, selectedState?.key],
  );
  useEffect(() => {
    setStateApplySuggestion(null);
  }, [selectedEntity.id]);
  useEffect(() => {
    if (historyNavigation && lastHistoryRevealSequenceRef.current === historyNavigation.sequence) return;
    if (historyNavigation) lastHistoryRevealSequenceRef.current = historyNavigation.sequence;
    if (historyNavigation) setStateApplySuggestion(null);
    const reveal =
      historyNavigation?.direction === 'redo' || historyNavigation?.direction === 'undoTo'
        ? historyNavigation.reveal?.after
        : historyNavigation?.reveal?.before;
    if (!reveal) {
      setPendingHistoryReveal(null);
      return;
    }
    const targetEntity = findEntityById(document.design, reveal.entityId);
    const resolvedTarget = targetEntity
      ? reveal
      : { entityId: fallbackSelectedEntity(document.design, reveal.entityId)?.id ?? document.design.id };
    setPendingHistoryReveal(resolvedTarget);
    if (selectedEntityId !== resolvedTarget.entityId) {
      onSelectedEntityIdChange(resolvedTarget.entityId, isStateGroupId(resolvedTarget.entityId) ? 'state' : 'entity');
    }
  }, [document.design, historyNavigation, onSelectedEntityIdChange, selectedEntityId]);
  const updateStateApplySuggestion = useCallback(
    (target: StatePropertyChange, entityId = selectedEntity.id) => {
      const stateEntity = findEntityById(document.design, entityId);
      const state = stateEntity
        ? ENTITY_STATES.find((candidate) => candidate.suffix === stateEntity.id.slice(stateEntity.id.indexOf(':') + 1))
        : selectedState;
      const normalizedTarget = normalizeStatePropertyChangeForEntity(document.design, entityId, target);
      const targetStateSuffixes = state
        ? ENTITY_STATES.filter((candidate) => candidate.suffix !== state.suffix).map((candidate) => candidate.suffix)
        : [];
      const canApply =
        state !== undefined &&
        getPropertyApplyAvailability(document.design, entityId, normalizedTarget, targetStateSuffixes).applicable
          .length > 0;
      if (!canApply) return;
      setStateApplySuggestion({
        entityId,
        scopeKey: normalizedTarget.scopeKey,
        propertyPath: [...normalizedTarget.propertyPath],
        anchorScopeKey: normalizedTarget.anchorScopeKey,
        change: normalizedTarget,
        stateSuffix: state.suffix,
        stateLabel: state.label,
      });
    },
    [document.design, selectedEntity.id, selectedState],
  );
  const reportComponentChange = useCallback(
    (scopeKey: string, previous: EcsComponentDoc, updater: (previous: EcsComponentDoc) => EcsComponentDoc) => {
      const next = updater(previous);
      const target = changedPropertyChangeForComponent(scopeKey, previous, next);
      if (target) updateStateApplySuggestion(target);
    },
    [updateStateApplySuggestion],
  );
  const reportEffectChange = useCallback(
    (
      scopeKey: string,
      previous: EcsEffectDoc,
      updater: (previous: EcsEffectDoc) => EcsEffectDoc,
      hasPreviousEffect?: boolean,
    ) => {
      const next = updater(previous);
      const target = changedPropertyTargetForEffect(scopeKey, previous, next, hasPreviousEffect);
      if (target) updateStateApplySuggestion(target);
    },
    [updateStateApplySuggestion],
  );
  const reportStructuralChange = useCallback(
    (target: StatePropertyChange, entityId = selectedEntity.id) => updateStateApplySuggestion(target, entityId),
    [selectedEntity.id, updateStateApplySuggestion],
  );
  const applyStateChangeToStates = useCallback(
    (stateSuffixes: readonly StateSuffix[] | 'all') => {
      const suggestion = stateApplySuggestion;
      if (!suggestion) return;
      const targetStateSuffixes = stateSuffixes === 'all' ? ENTITY_STATES.map((state) => state.suffix) : stateSuffixes;
      const availability = getPropertyApplyAvailability(
        document.design,
        suggestion.entityId,
        suggestion.change,
        targetStateSuffixes,
      );
      onUpdateDesign(
        (previous) => applyPropertyToStates(previous, suggestion.entityId, suggestion.change, targetStateSuffixes),
        stateSuffixes === 'all' ? 'Apply property to all states' : 'Apply property to selected states',
      );
      if (availability.skipped.length > 0) {
        toast(
          `Applied to ${availability.applicable.length} state(s). Skipped ${stateLabels(availability.skipped)} because the target property was not available.`,
          { position: 'bottom-center' },
        );
      }
      setStateApplySuggestion(null);
    },
    [document.design, onUpdateDesign, stateApplySuggestion],
  );
  const applyComponentChangeToStates = useCallback(
    (
      scopeKey: string,
      component: EcsComponentDoc,
      stateSuffixes: readonly StateSuffix[],
    ) => {
      if (!isStateGroupId(selectedEntity.id)) return;
      onUpdateDesign(
        (previous) => applyComponentToStates(previous, selectedEntity.id, scopeKey, component, stateSuffixes),
        'Apply component to selected states',
      );
      setStateApplySuggestion(null);
    },
    [onUpdateDesign, selectedEntity.id],
  );
  const applyEffectChangeToStates = useCallback(
    (
      scopeKey: string,
      target: StatePropertyChange | undefined,
      stateSuffixes: readonly StateSuffix[],
    ) => {
      if (!isStateGroupId(selectedEntity.id)) return;
      onUpdateDesign(
        (previous) =>
          applyEffectChangeToStatesInDocument(previous, selectedEntity.id, scopeKey, stateSuffixes, target),
        'Apply effect to selected states',
      );
      setStateApplySuggestion(null);
    },
    [onUpdateDesign, selectedEntity.id],
  );
  const applyTransitionToAllStates = useCallback(
    (target: StatePropertyChange, transition: TransitionConfig | undefined): boolean => {
      if (!isStateGroupId(selectedEntity.id)) return false;
      const normalizedTarget = normalizeStatePropertyChangeForEntity(document.design, selectedEntity.id, target);
      onUpdateDesign(
        (previous) => applyTransitionToStates(previous, selectedEntity.id, normalizedTarget, transition),
        'Apply transition to all states',
      );
      return true;
    },
    [document.design, onUpdateDesign, selectedEntity.id],
  );
  const customStateSuffixes = useMemo<readonly StateSuffix[]>(() => {
    const parent = stateFamilyParentFor(document.design, selectedEntity.id);
    if (!parent) return [];
    return ENTITY_STATES.filter((state) => {
      const stateEntity = parent.children.find((child) => child.id === `${selectedEntity.entity}:${state.suffix}`);
      return state.key === 'default' ? stateEntity !== undefined : stateEntity !== undefined && !isInheritedStateEntity(stateEntity);
    }).map((state) => state.suffix);
  }, [document.design, selectedEntity.entity, selectedEntity.id]);
  const stateApplySuggestionContext = useMemo(
    () => ({
      suggestion: stateApplySuggestion,
      stateSuffix: selectedState?.suffix ?? null,
      customStateSuffixes,
      reportComponentChange,
      reportEffectChange,
      reportStructuralChange,
      applyTransitionToStates: applyTransitionToAllStates,
      applySuggestionToStates: applyStateChangeToStates,
      applyComponentToStates: applyComponentChangeToStates,
      applyEffectChangeToStates,
    }),
    [
      applyStateChangeToStates,
      applyComponentChangeToStates,
      applyEffectChangeToStates,
      applyTransitionToAllStates,
      customStateSuffixes,
      reportComponentChange,
      reportEffectChange,
      reportStructuralChange,
      stateApplySuggestion,
      selectedState?.suffix,
    ],
  );
  const updateInspectorDesign = useCallback(
    (updater: (previous: EcsEntityDoc) => EcsEntityDoc, label?: string) =>
      onUpdateDesign((previous) => updater(materializeSelectedState(previous, selectedEntity.id)), label),
    [onUpdateDesign, selectedEntity.id],
  );
  const selectedEntityUpdater = useCallback(
    (updater: (previous: EcsEntityDoc) => EcsEntityDoc) =>
      updateInspectorDesign((prev) => {
        const before = findEntityById(prev, selectedEntity.id);
        const next = updateEntityById(prev, selectedEntity.id, updater);
        const after = findEntityById(next, selectedEntity.id);
        return before && after ? removeAnimationTracksForRemovedReplicatorCopies(next, before, after) : next;
      }),
    [selectedEntity.id, updateInspectorDesign],
  );
  const reorderEntity = useCallback(
    (activeId: string, overId: string) => onUpdateDesign((prev) => reorderEntityById(prev, activeId, overId)),
    [onUpdateDesign],
  );
  const deleteEntity = useCallback(
    (entityId: string) => {
      const entity = findEntityById(document.design, entityId);
      const parentInfo = entity ? findParentOf(document.design, entityId) : undefined;
      if (!entity || !parentInfo) return;
      const owner = entity.entity === 'marker' ? markerOwnerEntity(document.design, entityId) : undefined;
      onUpdateDesign((prev) => {
        const withoutEntity = updateEntityById(prev, parentInfo.parent.id, (parent) => ({
          ...parent,
          children: parent.children.filter((child) => child.id !== entityId),
        }));
        return clearForEntityReferences(withoutEntity, entityId);
      });
      onSelectedEntityIdChange(owner?.id ?? parentInfo.parent.id);
    },
    [document.design, onSelectedEntityIdChange, onUpdateDesign],
  );
  const duplicateEntity = useCallback(
    (entityId: string) => {
      const entity = findEntityById(document.design, entityId);
      const parentInfo = entity ? findParentOf(document.design, entityId) : undefined;
      if (!entity || entity.entity !== 'image' || !parentInfo) return;

      let copyId = `${entity.id}:copy`;
      let copyIndex = 2;
      while (findEntityById(document.design, copyId)) {
        copyId = `${entity.id}:copy-${copyIndex}`;
        copyIndex += 1;
      }
      const copy = structuredClone(entity);
      copy.id = copyId;
      onUpdateDesign((previous) => {
        const currentParent = findParentOf(previous, entityId);
        if (!currentParent) return previous;
        return updateEntityById(previous, currentParent.parent.id, (parent) => {
          const index = parent.children.findIndex((child) => child.id === entityId);
          if (index < 0) return parent;
          const children = [...parent.children];
          children.splice(index + 1, 0, copy);
          return { ...parent, children };
        });
      });
      onSelectedEntityIdChange(copy.id);
    },
    [document.design, onSelectedEntityIdChange, onUpdateDesign],
  );

  const activateState = useCallback(
    (suffix: StateSuffix) => {
      if (!isStateGroupId(selectedEntity.id)) return;
      onSelectedEntityIdChange(`${selectedEntity.entity}:${suffix}`, 'state');
    },
    [onSelectedEntityIdChange, selectedEntity.entity, selectedEntity.id],
  );

  const navigateToStateOverride = useCallback(
    (source: StateOverrideSource, openStateKeys: readonly string[]) => {
      setPendingStateOverrideNavigation({ ...source, openStateKeys: [...openStateKeys] });
      onSelectedEntityIdChange(source.stateEntityId, 'state');
    },
    [onSelectedEntityIdChange],
  );
  const onStateOverrideNavigationComplete = useCallback(() => setPendingStateOverrideNavigation(null), []);
  const onHistoryRevealComplete = useCallback(() => setPendingHistoryReveal(null), []);
  useEffect(() => {
    setComponentCopyPayload(null);
  }, [document.id]);
  const copyComponent = useCallback((source: ComponentCopySource, sourceEntityLabel: string) => {
    setComponentCopyPayload(createComponentCopyPayload(source, sourceEntityLabel));
    toast.success(`${source.itemLabel} copied`, { position: 'bottom-center' });
  }, []);
  const copyEffect = useCallback((source: EffectCopySource, sourceEntityLabel: string) => {
    setComponentCopyPayload(createEffectCopyPayload(source, sourceEntityLabel));
    toast.success(`${source.itemLabel} copied`, { position: 'bottom-center' });
  }, []);
  const clearCopy = useCallback(() => setComponentCopyPayload(null), []);
  const canPasteCopiedComponent = useCallback(
    (entity: EcsEntityDoc, target: ComponentPasteTarget) => canPasteComponent(componentCopyPayload, entity, target),
    [componentCopyPayload],
  );
  const canPasteCopiedEffect = useCallback(
    (entity: EcsEntityDoc, target: EffectPasteTarget, effectType?: string) =>
      canPasteEffect(componentCopyPayload, entity, target, effectType),
    [componentCopyPayload],
  );
  const canDuplicateCopiedComponent = useCallback(
    (entity: EcsEntityDoc, target: ComponentPasteTarget) => canDuplicateComponent(entity, target),
    [],
  );
  const canDuplicateCopiedEffect = useCallback(
    (entity: EcsEntityDoc, target: EffectDuplicateTarget) => canDuplicateEffect(entity, target),
    [],
  );
  const duplicateComponent = useCallback(
    (entityId: string, target: ComponentPasteTarget) => {
      onUpdateDesign(
        (previous) => updateEntityById(previous, entityId, (entity) => duplicateComponentIntoEntity(entity, target)),
        `Duplicated ${target.componentType}`,
      );
    },
    [onUpdateDesign],
  );
  const duplicateEffect = useCallback(
    (entityId: string, target: EffectDuplicateTarget) => {
      onUpdateDesign(
        (previous) => updateEntityById(previous, entityId, (entity) => duplicateEffectIntoEntity(entity, target)),
        `Duplicated effect`,
      );
    },
    [onUpdateDesign],
  );
  const pasteComponent = useCallback(
    (entityId: string, target: ComponentPasteTarget) => {
      if (!componentCopyPayload || componentCopyPayload.kind !== 'component') return;
      onUpdateDesign(
        (previous) =>
          updateEntityById(previous, entityId, (entity) =>
            pasteComponentIntoEntity(entity, componentCopyPayload, target),
          ),
        `Pasted ${componentCopyPayload.itemLabel}`,
      );
      clearCopy();
    },
    [clearCopy, componentCopyPayload, onUpdateDesign],
  );
  const pasteEffect = useCallback(
    (entityId: string, target: EffectPasteTarget) => {
      if (!componentCopyPayload || componentCopyPayload.kind !== 'effect') return;
      onUpdateDesign(
        (previous) =>
          updateEntityById(previous, entityId, (entity) => pasteEffectIntoEntity(entity, componentCopyPayload, target)),
        `Pasted ${componentCopyPayload.itemLabel}`,
      );
      clearCopy();
    },
    [clearCopy, componentCopyPayload, onUpdateDesign],
  );
  const componentCopyPasteContext = useMemo<ComponentCopyPasteContextValue>(
    () => ({
      payload: componentCopyPayload,
      copyComponent,
      copyEffect,
      clearCopy,
      canDuplicateComponent: canDuplicateCopiedComponent,
      canDuplicateEffect: canDuplicateCopiedEffect,
      canPasteComponent: canPasteCopiedComponent,
      canPasteEffect: canPasteCopiedEffect,
      duplicateComponent,
      duplicateEffect,
      pasteComponent,
      pasteEffect,
    }),
    [
      canPasteCopiedComponent,
      canPasteCopiedEffect,
      clearCopy,
      componentCopyPayload,
      copyComponent,
      copyEffect,
      canDuplicateCopiedComponent,
      canDuplicateCopiedEffect,
      duplicateComponent,
      duplicateEffect,
      pasteComponent,
      pasteEffect,
    ],
  );
  const onToggleHierarchyCollapsed = useCallback(
    (forceExpanded = false) => {
      const shouldExpand = forceExpanded || hierarchyCollapsed || hierarchyWidth <= HIERARCHY_PANEL_COMPACT_WIDTH;
      setHierarchyWidth((currentWidth) =>
        shouldExpand ? Math.max(currentWidth, HIERARCHY_PANEL_DEFAULT_WIDTH) : HIERARCHY_PANEL_COMPACT_WIDTH,
      );
      onHierarchyCollapsedChange(!shouldExpand);
    },
    [hierarchyCollapsed, hierarchyWidth, onHierarchyCollapsedChange],
  );
  const inspectorCardState = useMemo(
    () => ({ openState: inspectorCardOpenState, updateOpenState: onInspectorCardOpenStateChange }),
    [inspectorCardOpenState, onInspectorCardOpenStateChange],
  );

  return (
    // Lets any entity-overlay option deep in the tree exclusively preview an
    // entity's overlay on hover, using the same callback as card-title icons.
    <InspectorHeaderMenuProvider>
      <StateApplySuggestionContext.Provider value={stateApplySuggestionContext}>
        <InspectorCardStateContext.Provider value={inspectorCardState}>
          <ComponentCopyPasteContext.Provider value={componentCopyPasteContext}>
            <DebugEntityHoverContext.Provider value={onHoverEntity}>
              <div className="pointer-events-none absolute inset-0">
                <FloatingResizablePanel
                  side="right"
                  width={hierarchyWidth}
                  minWidth={HIERARCHY_PANEL_COMPACT_WIDTH}
                  maxWidth={HIERARCHY_PANEL_MAX_WIDTH}
                  onWidthChange={setHierarchyWidth}
                  aria-label="Resize hierarchy panel"
                  edgeOffset={inspectorWidth + FLOATING_PANEL_EDGE_INSET + FLOATING_PANEL_GAP}
                  heightMode="content"
                  className="top-3"
                >
                  <div className="min-h-0">
                    <HierarchyPanel
                      root={document.design}
                      selectedId={selectedEntity.id}
                      onSelect={(id) => onSelectedEntityIdChange(id, 'entity')}
                      onDeleteEntity={deleteEntity}
                      onUpdateDesign={onUpdateDesign}
                      onAddMarkerEntity={addMarkerEntity}
                      onAddBackgroundEntity={addBackgroundEntity}
                      onAddImageEntity={addImageEntity}
                      onReorderEntity={reorderEntity}
                      debug={debug}
                      compactWidth={hierarchyWidth <= HIERARCHY_PANEL_COMPACT_WIDTH}
                      onToggleCollapsed={onToggleHierarchyCollapsed}
                    />
                  </div>
                </FloatingResizablePanel>

                <FloatingResizablePanel
                  side="right"
                  width={inspectorWidth}
                  minWidth={INSPECTOR_PANEL_MIN_WIDTH}
                  maxWidth={INSPECTOR_PANEL_MAX_WIDTH}
                  onWidthChange={setInspectorWidth}
                  aria-label="Resize inspector panel"
                  edgeOffset={FLOATING_PANEL_EDGE_INSET}
                  className="top-3 bottom-3"
                >
                  <div
                    ref={setInspectorColumnNode}
                    className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-x-clip"
                  >
                    <InspectorOverlayPortalContext.Provider value={inspectorColumnNode}>
                      <CaptionLayoutContext.Provider value={document.captionLayout}>
                        <InspectorPanel
                          root={document.design}
                          savedRoot={savedDocument.design}
                          selectedEntity={selectedEntity}
                          onActivateState={activateState}
                          onCustomizeState={customizeSelectedState}
                          onChangeStateStyle={changeSelectedStateStyle}
                          stateWindow={document.stateWindow}
                          onUpdateStateWindow={onUpdateStateWindow}
                          onNavigateToStateOverride={navigateToStateOverride}
                          pendingStateOverrideNavigation={pendingStateOverrideNavigation}
                          onStateOverrideNavigationComplete={onStateOverrideNavigationComplete}
                          pendingHistoryReveal={pendingHistoryReveal}
                          onHistoryRevealComplete={onHistoryRevealComplete}
                          onUpdateEntity={selectedEntityUpdater}
                          onUpdateDesign={updateInspectorDesign}
                          onSelectedEntityIdChange={onSelectedEntityIdChange}
                          onViewStateInPreviewer={onViewStateInPreviewer}
                          onDeleteEntity={deleteEntity}
                          onDuplicateEntity={duplicateEntity}
                          onAddMarkerEntity={addMarkerEntity}
                          onAddBackgroundEntity={addBackgroundEntity}
                          onAddImageEntity={addImageEntity}
                          debug={debug}
                          paddingPreviewTarget={paddingPreviewTarget}
                          onHoverPaddingPreviewTarget={onHoverPaddingPreviewTarget}
                          onTogglePaddingPreviewTarget={onTogglePaddingPreviewTarget}
                          pinnedPaddingPreviewTarget={pinnedPaddingPreviewTarget}
                          positionPreviewTarget={positionPreviewTarget}
                          onHoverPositionPreviewTarget={onHoverPositionPreviewTarget}
                          onTogglePositionPreviewTarget={onTogglePositionPreviewTarget}
                          pinnedPositionPreviewTarget={pinnedPositionPreviewTarget}
                          scrollTop={inspectorScrollTop}
                          presetKey={presetKey}
                          onScrollPositionCommit={onInspectorScrollPositionCommit}
                        />
                      </CaptionLayoutContext.Provider>
                    </InspectorOverlayPortalContext.Provider>
                  </div>
                </FloatingResizablePanel>
              </div>
            </DebugEntityHoverContext.Provider>
          </ComponentCopyPasteContext.Provider>
        </InspectorCardStateContext.Provider>
      </StateApplySuggestionContext.Provider>
    </InspectorHeaderMenuProvider>
  );
});
