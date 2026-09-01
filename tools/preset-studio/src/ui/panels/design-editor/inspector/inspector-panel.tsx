import { ClipboardPaste, Copy, Layers2, X } from 'lucide-react';
import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils';
import {
  ENTITY_STATES,
  isInheritedStateEntity,
  isStateGroupId,
  type EcsEntityDoc,
  type StateStyleSource,
  type StateWindowConfig,
} from '@/schema';
import type { HistoryRevealTarget } from '@/state/design-history-reveal';
import { DeleteConfirmButton } from '@/ui/controls/delete-confirm-button';
import { InspectorCardStateContext } from '@/ui/controls/inspector-card-state-context';
import { INSPECTOR_PANEL_HEADER_HEIGHT_CLASS } from '@/ui/controls/inspector-layout';
import { SpacerBoundsContext, spacerBoundsForPreview } from '@/ui/controls/spacer-bounds';
import {
  type PaddingPreviewTarget,
  type PositionPreviewTarget,
} from '@/ui/preview/entity-debug';
import { usePreviewDebugData } from '@/ui/preview/preview-debug-data-context';
import type { StatePreviewTarget } from '@/ui/preview/preview-workspace';
import { Button } from '@/ui/shadcn/button';
import { Card, CardAction, CardContent, CardHeader, MainCardTitle } from '@/ui/shadcn/card';
import { ScrollArea } from '@/ui/shadcn/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';

import {
  AnimationTrackNavigationContext,
  animationTrackTargetsForEntity,
  type AnimationTrackNavigationRequest,
} from '../animation-track-navigation';
import { findCompatiblePasteTarget, formatPasteActionLabel } from '../component-copy-paste';
import { ComponentCopyPasteContext } from '../component-copy-paste-context';
import {
  asDebugKind,
  entityBadge,
  entityPaddingPreviewTarget,
  entityPositionPreviewTarget,
  entityTitle,
  findAssociatedEntity,
  type StateSuffix,
} from '../entity-tree';
import { EntityHoverIcon } from '../shared/entity-hover-icon';
import {
  openStateKeysForProperty,
  overrideLookupKey,
  StateOverrideContext,
  stateOverrideSourcesForEntity,
  type StateOverrideNavigationTarget,
  type StateOverrideSource,
} from '../state-overrides';
import type { DebugControls } from '../types';
import { EntityAddMenu } from './entity-add-menu';
import { EntityDetail } from './entity-detail';
import { InspectorStateBadge, type InspectorStateBadgeOption } from './inspector-state-badge';
import { StateFamilyNavigator } from './state-family-navigator';

/** The inspector column: header card for the selected entity, its add-menu, and its component/effect list. */
export function InspectorPanel({
  root,
  savedRoot,
  selectedEntity,
  onActivateState,
  onCustomizeState,
  onChangeStateStyle,
  stateWindow,
  onUpdateStateWindow,
  onNavigateToStateOverride,
  pendingStateOverrideNavigation,
  onStateOverrideNavigationComplete,
  pendingHistoryReveal,
  onHistoryRevealComplete,
  onUpdateEntity,
  onUpdateDesign,
  onSelectedEntityIdChange,
  onViewStateInPreviewer,
  onDeleteEntity,
  onDuplicateEntity,
  onAddMarkerEntity,
  onAddBackgroundEntity,
  onAddImageEntity,
  debug,
  paddingPreviewTarget,
  onHoverPaddingPreviewTarget,
  onTogglePaddingPreviewTarget,
  pinnedPaddingPreviewTarget,
  positionPreviewTarget,
  onHoverPositionPreviewTarget,
  onTogglePositionPreviewTarget,
  pinnedPositionPreviewTarget,
  scrollTop,
  presetKey,
  onScrollPositionCommit,
}: {
  root: EcsEntityDoc;
  savedRoot: EcsEntityDoc;
  selectedEntity: EcsEntityDoc;
  onActivateState: (suffix: StateSuffix) => void;
  onCustomizeState: () => void;
  onChangeStateStyle: (source: StateStyleSource) => void;
  stateWindow: StateWindowConfig;
  onUpdateStateWindow: (updater: (previous: StateWindowConfig) => StateWindowConfig) => void;
  onNavigateToStateOverride: (source: StateOverrideSource, openStateKeys: readonly string[]) => void;
  pendingStateOverrideNavigation: StateOverrideNavigationTarget | null;
  onStateOverrideNavigationComplete: () => void;
  pendingHistoryReveal: HistoryRevealTarget | null;
  onHistoryRevealComplete: () => void;
  onUpdateEntity: (updater: (previous: EcsEntityDoc) => EcsEntityDoc) => void;
  onUpdateDesign: (updater: (previous: EcsEntityDoc) => EcsEntityDoc, label?: string) => void;
  onSelectedEntityIdChange: (id: string) => void;
  onViewStateInPreviewer: (target: StatePreviewTarget) => void;
  onDeleteEntity: (id: string) => void;
  onDuplicateEntity: (id: string) => void;
  onAddMarkerEntity: (targetId: string) => string | undefined;
  onAddBackgroundEntity: (targetId: string) => string | undefined;
  onAddImageEntity: (targetId: string) => string | undefined;
  debug: DebugControls;
  paddingPreviewTarget: PaddingPreviewTarget | null;
  onHoverPaddingPreviewTarget: (target: PaddingPreviewTarget | null) => void;
  onTogglePaddingPreviewTarget: (target: PaddingPreviewTarget) => void;
  pinnedPaddingPreviewTarget: PaddingPreviewTarget | null;
  positionPreviewTarget: PositionPreviewTarget | null;
  onHoverPositionPreviewTarget: (target: PositionPreviewTarget | null) => void;
  onTogglePositionPreviewTarget: (target: PositionPreviewTarget) => void;
  pinnedPositionPreviewTarget: PositionPreviewTarget | null;
  scrollTop: number;
  presetKey: string;
  onScrollPositionCommit: (presetKey: string, entityId: string, scrollTop: number) => void;
}): ReactNode {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastReportedScrollTopRef = useRef(scrollTop);
  const lastSelectedEntityIdRef = useRef(selectedEntity.id);
  const lastPresetKeyRef = useRef(presetKey);
  const highlightedAnchorRef = useRef<HTMLElement | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);
  const inspectorCardState = useContext(InspectorCardStateContext);
  const componentCopyPaste = useContext(ComponentCopyPasteContext);
  const { resolvedTransforms, viewportFrameSize } = usePreviewDebugData();
  const compatiblePasteTarget = useMemo(
    () => findCompatiblePasteTarget(selectedEntity, componentCopyPaste?.payload ?? null),
    [componentCopyPaste?.payload, selectedEntity],
  );
  const compatiblePasteLabel = compatiblePasteTarget
    ? formatPasteActionLabel(
        compatiblePasteTarget.label,
        componentCopyPaste?.payload?.sourceEntityLabel ?? 'source entity',
      )
    : null;
  const pasteCompatibleItem = useCallback(() => {
    if (!componentCopyPaste || !compatiblePasteTarget) return;
    if (compatiblePasteTarget.kind === 'component') {
      componentCopyPaste.pasteComponent(selectedEntity.id, compatiblePasteTarget.target);
    } else {
      componentCopyPaste.pasteEffect(selectedEntity.id, compatiblePasteTarget.target);
    }
  }, [componentCopyPaste, compatiblePasteTarget, selectedEntity.id]);
  const spacerBounds = useMemo(
    () => spacerBoundsForPreview(viewportFrameSize, viewportFrameSize?.videoResolution),
    [viewportFrameSize],
  );
  const selectedEntityPaddingPreviewTarget = entityPaddingPreviewTarget(selectedEntity);
  const selectedEntityPositionPreviewTarget = entityPositionPreviewTarget(selectedEntity);
  const inheritedState = isInheritedStateEntity(selectedEntity);
  const kind = asDebugKind(selectedEntity.entity);
  const selectedEntityBadge = entityBadge(selectedEntity);
  const associatedEntity = useMemo(() => findAssociatedEntity(root, selectedEntity), [root, selectedEntity]);
  const stateBadgeState =
    (selectedEntity.entity === 'row' || selectedEntity.entity === 'word') && isStateGroupId(selectedEntity.id)
      ? ENTITY_STATES.find((state) => state.suffix === selectedEntity.id.slice(selectedEntity.id.indexOf(':') + 1))
      : undefined;
  const stateBadgeOptions: readonly InspectorStateBadgeOption[] = ENTITY_STATES.map((state) => ({
    id: state.suffix,
    label: state.label,
  }));
  const canViewStateInPreviewer = stateBadgeState !== undefined && selectedEntityBadge !== null;
  const overrideSources = useMemo(() => stateOverrideSourcesForEntity(root, selectedEntity), [root, selectedEntity]);
  const animationTrackTargets = useMemo(() => animationTrackTargetsForEntity(selectedEntity), [selectedEntity]);
  const [pendingAnimationTrackNavigation, setPendingAnimationTrackNavigation] =
    useState<AnimationTrackNavigationRequest | null>(null);
  const animationTrackRequestIdRef = useRef(0);
  useEffect(() => {
    setPendingAnimationTrackNavigation(null);
  }, [selectedEntity.id]);
  const animationTrackNavigationContext = useMemo(
    () => ({
      targetFor: (scopeKey: string, propertyPath: readonly string[]) =>
        animationTrackTargets.get(overrideLookupKey(scopeKey, propertyPath)),
      navigateToTrack: (target: { animationScopeKey: string; trackIndex: number }) => {
        animationTrackRequestIdRef.current += 1;
        setPendingAnimationTrackNavigation({
          ...target,
          requestId: animationTrackRequestIdRef.current,
        });
      },
      pendingNavigation: pendingAnimationTrackNavigation,
      onNavigationComplete: () => setPendingAnimationTrackNavigation(null),
    }),
    [animationTrackTargets, pendingAnimationTrackNavigation],
  );
  const stateOverrideContext = useMemo(
    () => ({
      sourcesFor: (scopeKey: string, propertyPath: readonly string[]) =>
        overrideSources.get(overrideLookupKey(scopeKey, propertyPath)) ?? [],
      navigateToOverride: onNavigateToStateOverride,
      pendingNavigation: pendingStateOverrideNavigation,
      pendingHistoryNavigation: pendingHistoryReveal,
      onHistoryNavigationComplete: onHistoryRevealComplete,
    }),
    [
      onHistoryRevealComplete,
      onNavigateToStateOverride,
      overrideSources,
      pendingHistoryReveal,
      pendingStateOverrideNavigation,
    ],
  );
  useLayoutEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    const previousEntityId = lastSelectedEntityIdRef.current;
    const previousPresetKey = lastPresetKeyRef.current;
    const entityChanged = previousEntityId !== selectedEntity.id;
    const presetChanged = previousPresetKey !== presetKey;
    if (entityChanged || presetChanged) {
      onScrollPositionCommit(previousPresetKey, previousEntityId, lastReportedScrollTopRef.current);
    }
    const scrollChangedOutsideViewport = lastReportedScrollTopRef.current !== scrollTop;
    if (entityChanged || presetChanged || scrollChangedOutsideViewport) viewport.scrollTop = scrollTop;
    lastSelectedEntityIdRef.current = selectedEntity.id;
    lastPresetKeyRef.current = presetKey;
    lastReportedScrollTopRef.current = scrollTop;
  }, [onScrollPositionCommit, presetKey, scrollTop, selectedEntity.id]);

  useLayoutEffect(() => {
    const target = pendingStateOverrideNavigation;
    if (!target || target.stateEntityId !== selectedEntity.id) return;
    inspectorCardState?.updateOpenState((previous) => {
      let next = previous;
      for (const key of target.openStateKeys) {
        if (next[key]) continue;
        if (next === previous) next = { ...previous };
        next[key] = true;
      }
      return next;
    });
  }, [inspectorCardState, pendingStateOverrideNavigation, selectedEntity.id]);

  useLayoutEffect(() => {
    const target = pendingHistoryReveal;
    if (!target || target.entityId !== selectedEntity.id || !target.scopeKey) return;
    const openStateKeys = openStateKeysForProperty(target.scopeKey, target.propertyPath ?? []);
    inspectorCardState?.updateOpenState((previous) => {
      let next = previous;
      for (const key of openStateKeys) {
        if (next[key]) continue;
        if (next === previous) next = { ...previous };
        next[key] = true;
      }
      return next;
    });
  }, [inspectorCardState, pendingHistoryReveal, selectedEntity.id]);

  useLayoutEffect(() => {
    const target = pendingHistoryReveal;
    const viewport = scrollRef.current;
    if (!target || !viewport || target.entityId !== selectedEntity.id) return;
    if (!target.scopeKey) {
      onHistoryRevealComplete();
      return;
    }

    const propertyPath = target.propertyPath ?? [];
    const needsDrawerReveal =
      target.scopeKey.includes('/effect/') ||
      propertyPath[0] === 'unitTracks' ||
      propertyPath[0]?.startsWith('tracks[');
    let attempts = 0;
    let frame = 0;
    const findTarget = () => {
      if (attempts < 12) attempts += 1;
      const anchors = [
        ...viewport.querySelectorAll<HTMLElement>('[data-inspector-property-path]'),
        ...document.querySelectorAll<HTMLElement>('[data-inspector-property-path]'),
      ];
      const anchor = anchors.find(
        (candidate) =>
          candidate.dataset.inspectorPropertyScope === target.scopeKey &&
          (propertyPath.length === 0 || candidate.dataset.inspectorPropertyPath === propertyPath.join('.')),
      );
      if (!anchor) {
        if (attempts < 12) frame = window.requestAnimationFrame(findTarget);
        else onHistoryRevealComplete();
        return;
      }
      if (viewport.contains(anchor)) {
        const viewportBox = viewport.getBoundingClientRect();
        const anchorBox = anchor.getBoundingClientRect();
        const nextTop =
          viewport.scrollTop + (anchorBox.top - viewportBox.top) - viewport.clientHeight / 2 + anchorBox.height / 2;
        viewport.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' });
      }
      highlightedAnchorRef.current?.classList.remove('state-override-target');
      if (highlightTimeoutRef.current !== null) window.clearTimeout(highlightTimeoutRef.current);
      anchor.classList.add('state-override-target');
      highlightedAnchorRef.current = anchor;
      highlightTimeoutRef.current = window.setTimeout(() => {
        anchor.classList.remove('state-override-target');
        if (highlightedAnchorRef.current === anchor) highlightedAnchorRef.current = null;
        highlightTimeoutRef.current = null;
      }, 1400);
      if (!needsDrawerReveal) onHistoryRevealComplete();
    };

    frame = window.requestAnimationFrame(findTarget);
    return () => window.cancelAnimationFrame(frame);
  }, [onHistoryRevealComplete, pendingHistoryReveal, selectedEntity.id]);

  useLayoutEffect(() => {
    const target = pendingStateOverrideNavigation;
    const viewport = scrollRef.current;
    if (!target || !viewport || target.stateEntityId !== selectedEntity.id) return;

    let attempts = 0;
    let frame = 0;
    const findTarget = () => {
      if (attempts < 12) attempts += 1;
      const anchors = [
        ...viewport.querySelectorAll<HTMLElement>('[data-inspector-property-path]'),
        ...document.querySelectorAll<HTMLElement>('[data-inspector-property-path]'),
      ];
      const anchor = anchors.find(
        (candidate) =>
          candidate.dataset.inspectorPropertyScope === target.scopeKey &&
          candidate.dataset.inspectorPropertyPath === target.propertyPath.join('.'),
      );
      if (!anchor) {
        if (attempts < 12) frame = window.requestAnimationFrame(findTarget);
        return;
      }
      if (viewport.contains(anchor)) {
        const viewportBox = viewport.getBoundingClientRect();
        const anchorBox = anchor.getBoundingClientRect();
        const nextTop =
          viewport.scrollTop + (anchorBox.top - viewportBox.top) - viewport.clientHeight / 2 + anchorBox.height / 2;
        viewport.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' });
      }

      highlightedAnchorRef.current?.classList.remove('state-override-target');
      if (highlightTimeoutRef.current !== null) window.clearTimeout(highlightTimeoutRef.current);
      anchor.classList.add('state-override-target');
      highlightedAnchorRef.current = anchor;
      highlightTimeoutRef.current = window.setTimeout(() => {
        anchor.classList.remove('state-override-target');
        if (highlightedAnchorRef.current === anchor) highlightedAnchorRef.current = null;
        highlightTimeoutRef.current = null;
      }, 1400);
      onStateOverrideNavigationComplete();
    };

    frame = window.requestAnimationFrame(findTarget);

    return () => window.cancelAnimationFrame(frame);
  }, [onStateOverrideNavigationComplete, pendingStateOverrideNavigation, selectedEntity.id]);

  useLayoutEffect(
    () => () => {
      if (highlightTimeoutRef.current !== null) window.clearTimeout(highlightTimeoutRef.current);
      highlightedAnchorRef.current?.classList.remove('state-override-target');
      highlightedAnchorRef.current = null;
      highlightTimeoutRef.current = null;
    },
    [],
  );

  return (
    <Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden py-0">
        {!inheritedState && componentCopyPaste?.payload && (
          <div className="bg-muted/50 text-muted-foreground flex shrink-0 items-center justify-between gap-3 border-b px-3 py-2 text-xs">
            <span className="flex min-w-0 items-center gap-2 truncate">
              <Copy className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">
                Copied {componentCopyPaste.payload.itemLabel} from {componentCopyPaste.payload.sourceEntityLabel}
                <span className="text-muted-foreground/70 ml-1">({componentCopyPaste.payload.sourceEntityId})</span>
              </span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="shrink-0 gap-1"
              aria-label="Clear copied component or effect"
              onClick={componentCopyPaste.clearCopy}
            >
              <X className="size-3" aria-hidden="true" />
              Clear
            </Button>
          </div>
        )}
        <CardHeader
          className={cn(
            'top-0 flex items-center justify-between gap-2 dark:bg-muted px-4 py-2',
            INSPECTOR_PANEL_HEADER_HEIGHT_CLASS,
          )}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-x-3">
            <MainCardTitle>
              {/* Hover-to-preview is scoped to the icon itself (via its own onMouseEnter/onMouseLeave,
 same as the hierarchy panel's rows) - this span used to ALSO wrap it in a hover
 handler covering the whole title including the plain text, so merely hovering the
 entity's NAME (not the icon) lit up its debug overlay/padding preview with no way to
 tell it apart from an actual pin. */}
              <span
                className={cn(
                  'inline-flex min-w-0 items-center',
                  compatiblePasteTarget ? 'gap-1.5' : 'gap-2.5',
                  kind && 'cursor-default',
                )}
              >
                {kind && (
                  <EntityHoverIcon
                    kind={kind}
                    onHoverEntity={debug.onHoverEntity}
                    onHoverPaddingPreviewTarget={onHoverPaddingPreviewTarget}
                    active={
                      debug.showAllDebugOverlays ||
                      debug.pinnedDebugEntities.includes(kind) ||
                      debug.hoveredEntity === kind
                    }
                    pinned={debug.showAllDebugOverlays || debug.pinnedDebugEntities.includes(kind)}
                    onToggleEntity={debug.onToggleDebugEntity}
                    paddingPreviewTarget={selectedEntityPaddingPreviewTarget}
                    positionPreviewTarget={selectedEntityPositionPreviewTarget}
                    onHoverPositionPreviewTarget={onHoverPositionPreviewTarget}
                  />
                )}
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate">{entityTitle(selectedEntity)}</span>
                  {selectedEntityBadge && !canViewStateInPreviewer ? (
                    associatedEntity ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            className="h-auto justify-start bg-transparent p-0 text-[9px] font-medium tracking-[0.12em] text-muted-foreground/70 uppercase shadow-none hover:bg-transparent hover:text-muted-foreground"
                            aria-label={`Select ${entityTitle(associatedEntity)} in hierarchy`}
                            onClick={(event) => {
                              event.stopPropagation();
                              onSelectedEntityIdChange(associatedEntity.id);
                            }}
                          >
                            {selectedEntityBadge}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">Select in hierarchy</TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-[9px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
                        {selectedEntityBadge}
                      </span>
                    )
                  ) : undefined}
                </span>
                {selectedEntityBadge && canViewStateInPreviewer ? (
                  <InspectorStateBadge
                    label={selectedEntityBadge}
                    value={stateBadgeState.suffix}
                    options={stateBadgeOptions}
                    onView={() => onViewStateInPreviewer(selectedEntity.entity === 'row' ? 'fullCycle' : 'wordState')}
                    onStateChange={(value) => {
                      const nextState = ENTITY_STATES.find((state) => state.suffix === value);
                      if (nextState) onActivateState(nextState.suffix);
                    }}
                  />
                ) : undefined}
              </span>
            </MainCardTitle>
          </div>
          <CardAction className={cn('flex items-center', compatiblePasteTarget ? 'gap-1' : 'gap-3')}>
            {!inheritedState && compatiblePasteTarget && compatiblePasteLabel && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={compatiblePasteLabel}
                    onClick={pasteCompatibleItem}
                  >
                    <ClipboardPaste className="size-3.5" aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">{compatiblePasteLabel}</TooltipContent>
              </Tooltip>
            )}
            {(selectedEntity.entity === 'marker' ||
              selectedEntity.entity === 'background' ||
              selectedEntity.entity === 'image') && (
              <DeleteConfirmButton
                label={
                  selectedEntity.entity === 'background'
                    ? 'Background'
                    : selectedEntity.entity === 'image'
                      ? 'Image'
                      : 'Marker'
                }
                onConfirm={() => onDeleteEntity(selectedEntity.id)}
              />
            )}
            {selectedEntity.entity === 'image' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Duplicate Image"
                    onClick={() => onDuplicateEntity(selectedEntity.id)}
                  >
                    <Layers2 className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Duplicate Image</TooltipContent>
              </Tooltip>
            )}
            {!inheritedState && (
              <EntityAddMenu
                entity={selectedEntity}
                onUpdateEntity={onUpdateEntity}
                onAddMarker={() => onAddMarkerEntity(selectedEntity.id)}
                onAddBackground={() => onAddBackgroundEntity(selectedEntity.id)}
                onAddImage={() => onAddImageEntity(selectedEntity.id)}
              />
            )}
          </CardAction>
        </CardHeader>
        <CardContent className="!flex !min-h-0 !flex-1 !flex-col !overflow-hidden !p-0">
          <ScrollArea
            className="h-full min-h-0 flex-1"
            viewportClassName="pr-0 overflow-x-hidden"
            viewportContentClassName="px-2 pb-3"
            viewportRef={scrollRef}
            onViewportScroll={(e) => {
              lastReportedScrollTopRef.current = e.currentTarget.scrollTop;
            }}
          >
            <AnimationTrackNavigationContext.Provider value={animationTrackNavigationContext}>
              <StateOverrideContext.Provider value={stateOverrideContext}>
                <SpacerBoundsContext.Provider value={spacerBounds}>
                  <EntityDetail
                    stateNavigator={
                      <StateFamilyNavigator
                        root={root}
                        savedRoot={savedRoot}
                        selectedEntity={selectedEntity}
                        onActivateState={onActivateState}
                        onCustomizeState={onCustomizeState}
                        onChangeStateStyle={onChangeStateStyle}
                        stateWindow={stateWindow}
                        onUpdateStateWindow={onUpdateStateWindow}
                      />
                    }
                    entity={selectedEntity}
                    root={root}
                    onUpdateEntity={onUpdateEntity}
                    onUpdateDesign={onUpdateDesign}
                    paddingPreviewTarget={paddingPreviewTarget}
                    onHoverPaddingPreviewTarget={onHoverPaddingPreviewTarget}
                    onTogglePaddingPreviewTarget={onTogglePaddingPreviewTarget}
                    pinnedPaddingPreviewTarget={pinnedPaddingPreviewTarget}
                    positionPreviewTarget={
                      debug.showAllDebugOverlays ? selectedEntityPositionPreviewTarget : positionPreviewTarget
                    }
                    onHoverPositionPreviewTarget={onHoverPositionPreviewTarget}
                    onTogglePositionPreviewTarget={onTogglePositionPreviewTarget}
                    pinnedPositionPreviewTarget={pinnedPositionPreviewTarget}
                    viewportFrameSize={viewportFrameSize}
                    resolvedTransforms={resolvedTransforms}
                  />
                </SpacerBoundsContext.Provider>
              </StateOverrideContext.Provider>
            </AnimationTrackNavigationContext.Provider>
          </ScrollArea>
        </CardContent>
    </Card>
  );
}
