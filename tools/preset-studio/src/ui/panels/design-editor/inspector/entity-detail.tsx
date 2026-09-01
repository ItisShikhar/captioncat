import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import { Fragment, useCallback, useContext, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';

import type { CaptionDebugTransform } from '@captioncat/caption-engine/browser';
import {
  isInheritedStateEntity,
  mergeEntityComponentsForDisplay,
  reduceEntityComponents,
  reorderEffectsWithDependencies,
  removeComponentWithDependencies,
  synchronizeFollowTargetPositioning,
  type EcsComponentDoc,
  type EcsEffectDoc,
  type EcsEntityDoc,
} from '@/schema';
import {
  INSPECTOR_DEPENDENT_SUBTREE_CLASS,
  INSPECTOR_STACK_CLASS,
  INSPECTOR_STRUCTURAL_STACK_CLASS,
} from '@/ui/controls/inspector-layout';
import { RandomizerScopeAvailabilityContext, type RandomizerScope } from '@/ui/controls/randomizer-scope-context';
import type { PaddingPreviewTarget, PositionPreviewTarget } from '@/ui/preview/entity-debug';

import {
  asDebugKind,
  componentTypesInComponent,
  effectIdsInComponent,
  findParentOf,
  isComponentDeletable,
  makeInspectorStateKey,
  removeAnimationDependenciesForEffects,
  removeAnimationTracksForComponentTypes,
  removeAnimationTracksForEffect,
  removeAnimationTracksForEffects,
  synchronizeForEntityId,
  updateEntityById,
} from '../entity-tree';
import { ComponentEditor, NestedComponentList, resolvedTransformForEntity } from './component-editor';
import { EffectEditor } from './effect-editor';
import { isEffectDisabled, isEffectDisabledByDependency } from './disabled-state';
import { effectDisplayLabel, effectOwnerForEntity } from './effect-label';
import { SortableComponentList } from './sortable-component-list';
import { StateApplySuggestionContext } from './state-apply-suggestion-context';

function InspectorGroupDivider({ label }: { label: string }): ReactNode {
  return (
    <div className="text-muted-foreground px-1 pt-1 text-[10px] font-semibold tracking-[0.16em] uppercase">{label}</div>
  );
}

function InspectorSectionDivider(): ReactNode {
  return <div aria-hidden="true" className="bg-border/60 h-px w-full" />;
}

function componentCardId(component: EcsComponentDoc, index: number): string {
  return component.studioId ?? `component-${component.component}-${index}`;
}

function wipeRevealEffectIdForAnimation(component: EcsComponentDoc): string | undefined {
  if (component.component !== 'animation' || component.dependencyOf !== 'wipeReveal') return undefined;
  const target = component.animation?.tracks.find((track) => track.target.startsWith('WipeReveal#'))?.target;
  if (!target) return undefined;
  const prefixLength = 'WipeReveal#'.length;
  const effectIdEnd = target.indexOf('.', prefixLength);
  return effectIdEnd > prefixLength ? target.slice(prefixLength, effectIdEnd) : undefined;
}

function componentCardState(components: readonly EcsComponentDoc[]): {
  componentIds: string[];
  componentEffectOwners: Map<string, string>;
} {
  const componentIds: string[] = [];
  const componentEffectOwners = new Map<string, string>();
  const visit = (nested: readonly EcsComponentDoc[]): void => {
    nested.forEach((component, index) => {
      const componentId = componentCardId(component, index);
      componentIds.push(componentId);
      for (const effect of component.effects) componentEffectOwners.set(effect.id, componentId);
      visit(component.components);
    });
  };
  visit(components);
  return { componentIds, componentEffectOwners };
}

/** Lists the selected entity's own components and effects (its children are edited via the hierarchy column instead). */
export function EntityDetail({
  stateNavigator,
  entity,
  root,
  onUpdateEntity,
  onUpdateDesign,
  paddingPreviewTarget,
  onHoverPaddingPreviewTarget,
  onTogglePaddingPreviewTarget,
  pinnedPaddingPreviewTarget,
  positionPreviewTarget,
  onHoverPositionPreviewTarget,
  onTogglePositionPreviewTarget,
  pinnedPositionPreviewTarget,
  viewportFrameSize,
  resolvedTransforms,
}: {
  stateNavigator?: ReactNode;
  entity: EcsEntityDoc;
  root: EcsEntityDoc;
  onUpdateEntity: (updater: (previous: EcsEntityDoc) => EcsEntityDoc) => void;
  onUpdateDesign: (updater: (previous: EcsEntityDoc) => EcsEntityDoc, label?: string) => void;
  paddingPreviewTarget: PaddingPreviewTarget | null;
  onHoverPaddingPreviewTarget: (target: PaddingPreviewTarget | null) => void;
  onTogglePaddingPreviewTarget: (target: PaddingPreviewTarget) => void;
  pinnedPaddingPreviewTarget: PaddingPreviewTarget | null;
  positionPreviewTarget: PositionPreviewTarget | null;
  onHoverPositionPreviewTarget: (target: PositionPreviewTarget | null) => void;
  onTogglePositionPreviewTarget: (target: PositionPreviewTarget) => void;
  pinnedPositionPreviewTarget: PositionPreviewTarget | null;
  viewportFrameSize?: { width: number; height: number } | null;
  resolvedTransforms?: readonly CaptionDebugTransform[] | null;
}): ReactNode {
  const displayComponents = useMemo(
    () => mergeEntityComponentsForDisplay(entity, viewportFrameSize),
    [entity, viewportFrameSize],
  );
  const effectDependencyComponents = useMemo(() => {
    const dependencies = new Map<string, { component: EcsComponentDoc; componentId: string; index: number }>();
    displayComponents.forEach((component, index) => {
      const effectId = wipeRevealEffectIdForAnimation(component);
      if (!effectId || !entity.effects.some((effect) => effect.id === effectId)) return;
      dependencies.set(effectId, {
        component,
        componentId: componentCardId(component, index),
        index,
      });
    });
    return dependencies;
  }, [displayComponents, entity.effects]);
  const effectDependencyIndexes = useMemo(
    () => new Set([...effectDependencyComponents.values()].map((dependency) => dependency.index)),
    [effectDependencyComponents],
  );
  const visibleComponents = useMemo(
    () => displayComponents.filter((_, index) => !effectDependencyIndexes.has(index)),
    [displayComponents, effectDependencyIndexes],
  );
  const visibleComponentIndexes = useMemo(
    () => visibleComponents.map((component) => displayComponents.indexOf(component)),
    [displayComponents, visibleComponents],
  );
  const effectOwner = useMemo(() => effectOwnerForEntity(visibleComponents), [visibleComponents]);
  const resolvedTransform = resolvedTransformForEntity(entity, resolvedTransforms);
  const showEmptyState = visibleComponents.length === 0 && entity.effects.length === 0;
  const inheritedState = isInheritedStateEntity(entity);
  const entityKind = asDebugKind(entity.entity);
  const availableRandomizerScopes = useMemo<readonly RandomizerScope[]>(() => {
    const scopes: RandomizerScope[] = ['entity'];
    let current: EcsEntityDoc | undefined = entity;
    while (current) {
      if (current.entity === 'row' && !scopes.includes('row')) scopes.push('row');
      if (current.entity === 'page' && !scopes.includes('page')) scopes.push('page');
      if (current.id === root.id) break;
      current = findParentOf(root, current.id)?.parent;
    }
    return scopes;
  }, [entity, root]);
  const effectSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const componentRefs = useRef(new Map<string, HTMLDivElement>());
  const effectRefs = useRef(new Map<string, HTMLDivElement>());
  const previousInspectorCardsRef = useRef<Set<string> | null>(null);
  const lastInspectorEntityIdRef = useRef(entity.id);
  const inspectorComponents = useMemo(() => componentCardState(visibleComponents), [visibleComponents]);
  const stateApplySuggestionContext = useContext(StateApplySuggestionContext);
  const entityScopeKey = makeInspectorStateKey('entity', entity.id);
  const registerComponentRef = useCallback((componentId: string, element: HTMLDivElement | null) => {
    if (element) componentRefs.current.set(componentId, element);
    else componentRefs.current.delete(componentId);
  }, []);
  const registerEffectRef = useCallback((effectId: string, element: HTMLDivElement | null) => {
    if (element) effectRefs.current.set(effectId, element);
    else effectRefs.current.delete(effectId);
  }, []);

  useLayoutEffect(() => {
    const componentCardKeys = inspectorComponents.componentIds.map((id) => `component:${id}`);
    const entityEffectKeys = entity.effects.map((effect) => `effect:${effect.id}`);
    const componentEffectKeys = [...inspectorComponents.componentEffectOwners.keys()].map(
      (effectId) => `component-effect:${effectId}`,
    );
    const currentInspectorCards = new Set([...componentCardKeys, ...entityEffectKeys, ...componentEffectKeys]);
    const previousInspectorCards = previousInspectorCardsRef.current;
    const entityChanged = lastInspectorEntityIdRef.current !== entity.id;
    lastInspectorEntityIdRef.current = entity.id;
    previousInspectorCardsRef.current = currentInspectorCards;
    if (entityChanged || !previousInspectorCards) return;

    const addedComponentId = inspectorComponents.componentIds.find(
      (id) => !previousInspectorCards.has(`component:${id}`),
    );
    const addedEntityEffect = entity.effects.find((effect) => !previousInspectorCards.has(`effect:${effect.id}`));
    const addedComponentEffect = [...inspectorComponents.componentEffectOwners.entries()].find(
      ([effectId]) => !previousInspectorCards.has(`component-effect:${effectId}`),
    );
    if (!addedComponentId && !addedEntityEffect && !addedComponentEffect) return;

    const frame = window.requestAnimationFrame(() => {
      const target = addedComponentId
        ? componentRefs.current.get(addedComponentId)
        : addedEntityEffect
          ? effectRefs.current.get(addedEntityEffect.id)
          : componentRefs.current.get(addedComponentEffect![1]);
      target?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [entity.effects, entity.id, inspectorComponents]);

  const updateComponent = useCallback(
    (index: number, updater: (previous: EcsComponentDoc) => EcsComponentDoc) =>
      onUpdateEntity((prev) => {
        const display = mergeEntityComponentsForDisplay(prev);
        const next = display.map((component, i) => (i === index ? updater(component) : component));
        const components = reduceEntityComponents(next, prev);
        return synchronizeForEntityId({ ...prev, components }, components);
      }),
    [onUpdateEntity],
  );
  // Components like `animation` allow several instances of the same type, so
  // deletion must target the Nth occurrence of that type, not every instance
  // sharing its name.
  const removeComponent = useCallback(
    (componentName: string, occurrenceIndex: number) => {
      let seen = 0;
      const componentIndex = displayComponents.findIndex(
        (component) => component.component === componentName && seen++ === occurrenceIndex,
      );
      if (componentIndex >= 0) {
        const removal = removeComponentWithDependencies(displayComponents, componentIndex);
        if (removal.removed.length > 0) {
          stateApplySuggestionContext?.reportStructuralChange({
            scopeKey: entityScopeKey,
            propertyPath: ['components'],
            anchorScopeKey: entityScopeKey,
            structure: {
              kind: 'components',
              ownerScopeKey: entityScopeKey,
              previous: displayComponents,
              next: removal.components,
            },
          });
        }
      }
      onUpdateDesign((prev) => {
        let removedEffectIds: string[] = [];
        let removedComponentTypes: string[] = [];
        const next = updateEntityById(prev, entity.id, (current) => {
          let seen = 0;
          const componentIndex = current.components.findIndex(
            (component) => component.component === componentName && seen++ === occurrenceIndex,
          );
          if (componentIndex < 0) return current;
          const removal = removeComponentWithDependencies(current.components, componentIndex);
          removedEffectIds = removal.removed.flatMap(effectIdsInComponent);
          removedComponentTypes = removal.removed.flatMap(componentTypesInComponent);
          return {
            ...current,
            components: synchronizeFollowTargetPositioning(removal.components, current.components),
          };
        });
        const withoutEffectTracks = removeAnimationTracksForEffects(next, removedEffectIds);
        return updateEntityById(withoutEffectTracks, entity.id, (current) =>
          removeAnimationTracksForComponentTypes(current, removedComponentTypes),
        );
      });
    },
    [displayComponents, entity.id, entityScopeKey, onUpdateDesign, stateApplySuggestionContext],
  );
  const onDeleteComponentTracks = useCallback(
    (componentTypes: readonly string[]) =>
      onUpdateDesign((prev) =>
        updateEntityById(prev, entity.id, (current) => removeAnimationTracksForComponentTypes(current, componentTypes)),
      ),
    [entity.id, onUpdateDesign],
  );
  const onDeleteEffectTracks = useCallback(
    (effectId: string) => onUpdateDesign((prev) => removeAnimationTracksForEffect(prev, effectId)),
    [onUpdateDesign],
  );
  const onDeleteEffectsTracks = useCallback(
    (effectIds: readonly string[]) => onUpdateDesign((prev) => removeAnimationTracksForEffects(prev, effectIds)),
    [onUpdateDesign],
  );
  const updateEffect = useCallback(
    (index: number, updater: (previous: EcsEffectDoc) => EcsEffectDoc) =>
      onUpdateEntity((prev) => ({ ...prev, effects: prev.effects.map((e, i) => (i === index ? updater(e) : e)) })),
    [onUpdateEntity],
  );
  const removeEffect = useCallback(
    (index: number) => {
      const effect = entity.effects[index];
      if (!effect) return;
      const removedIds = new Set([effect.id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const candidate of entity.effects) {
          if (candidate.dependencyOf && removedIds.has(candidate.dependencyOf) && !removedIds.has(candidate.id)) {
            removedIds.add(candidate.id);
            changed = true;
          }
        }
      }
      const nextEffects = entity.effects.filter((candidate) => !removedIds.has(candidate.id));
      stateApplySuggestionContext?.reportStructuralChange({
        scopeKey: entityScopeKey,
        propertyPath: ['effects'],
        anchorScopeKey: entityScopeKey,
        structure: {
          kind: 'effects',
          ownerScopeKey: entityScopeKey,
          previous: entity.effects,
          next: nextEffects,
        },
      });
      onUpdateDesign((prev) => {
        const removedEffectIds: string[] = [];
        const next = updateEntityById(prev, entity.id, (current) => {
          const effect = current.effects[index];
          if (!effect) return current;
          const currentRemovedIds = new Set([effect.id]);
          let currentChanged = true;
          while (currentChanged) {
            currentChanged = false;
            for (const candidate of current.effects) {
              if (
                candidate.dependencyOf &&
                currentRemovedIds.has(candidate.dependencyOf) &&
                !currentRemovedIds.has(candidate.id)
              ) {
                currentRemovedIds.add(candidate.id);
                currentChanged = true;
              }
            }
          }
          removedEffectIds.push(...currentRemovedIds);
          return {
            ...current,
            effects: current.effects.filter((candidate) => !currentRemovedIds.has(candidate.id)),
          };
        });
        if (removedEffectIds.length === 0) return next;
        return removeAnimationDependenciesForEffects(removeAnimationTracksForEffects(next, removedEffectIds), removedEffectIds);
      });
    },
    [entity.effects, entity.id, entityScopeKey, onUpdateDesign, stateApplySuggestionContext],
  );
  const onEffectDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!event.over || event.active.id === event.over.id) return;
      const effectIds = entity.effects.map((effect) => effect.id);
      const activeIndex = effectIds.indexOf(String(event.active.id));
      const overIndex = effectIds.indexOf(String(event.over.id));
      if (activeIndex < 0 || overIndex < 0) return;
      const nextEffects = reorderEffectsWithDependencies(entity.effects, String(event.active.id), String(event.over.id));
      stateApplySuggestionContext?.reportStructuralChange({
        scopeKey: entityScopeKey,
        propertyPath: ['effects'],
        anchorScopeKey: entityScopeKey,
        structure: {
          kind: 'effects',
          ownerScopeKey: entityScopeKey,
          previous: entity.effects,
          next: nextEffects,
        },
      });
      onUpdateEntity((prev) => ({ ...prev, effects: nextEffects }));
    },
    [entity.effects, entityScopeKey, onUpdateEntity, stateApplySuggestionContext],
  );
  const componentUpdateHandlers = useMemo(
    () =>
      displayComponents.map(
        (_, index) => (updater: (previous: EcsComponentDoc) => EcsComponentDoc) => updateComponent(index, updater),
      ),
    [displayComponents, updateComponent],
  );
  const componentDeleteHandlers = useMemo(() => {
    const occurrences = new Map<string, number>();
    return displayComponents.map((component) => {
      const occurrenceIndex = occurrences.get(component.component) ?? 0;
      occurrences.set(component.component, occurrenceIndex + 1);
      return isComponentDeletable(component) ? () => removeComponent(component.component, occurrenceIndex) : undefined;
    });
  }, [displayComponents, removeComponent]);
  const visibleComponentUpdateHandlers = useMemo(
    () => visibleComponentIndexes.map((index) => componentUpdateHandlers[index]),
    [componentUpdateHandlers, visibleComponentIndexes],
  );
  const visibleComponentDeleteHandlers = useMemo(
    () => visibleComponentIndexes.map((index) => componentDeleteHandlers[index]),
    [componentDeleteHandlers, visibleComponentIndexes],
  );
  const reorderComponents = useCallback(
    (components: EcsComponentDoc[]) => {
      const dependentComponents = displayComponents.filter((_, index) => effectDependencyIndexes.has(index));
      const nextComponents = [...components, ...dependentComponents];
      stateApplySuggestionContext?.reportStructuralChange({
        scopeKey: entityScopeKey,
        propertyPath: ['components'],
        anchorScopeKey: entityScopeKey,
        structure: {
          kind: 'components',
          ownerScopeKey: entityScopeKey,
          previous: displayComponents,
          next: nextComponents,
        },
      });
      onUpdateEntity((prev) => ({ ...prev, components: reduceEntityComponents(nextComponents, prev) }));
    },
    [displayComponents, effectDependencyIndexes, entityScopeKey, onUpdateEntity, stateApplySuggestionContext],
  );
  const effectUpdateHandlers = useMemo(
    () =>
      entity.effects.map(
        (_, index) => (updater: (previous: EcsEffectDoc) => EcsEffectDoc) => updateEffect(index, updater),
      ),
    [entity.effects, updateEffect],
  );
  const effectDeleteHandlers = useMemo(
    () => entity.effects.map((_, index) => () => removeEffect(index)),
    [entity.effects, removeEffect],
  );

  return (
    <RandomizerScopeAvailabilityContext.Provider value={availableRandomizerScopes}>
      <div className={`${INSPECTOR_STACK_CLASS} min-h-full pt-3`}>
      {stateNavigator}
      {inheritedState ? (
        <div className="text-muted-foreground flex flex-1 items-center justify-center px-4 py-8 text-center text-sm">
          Select Customise above to edit this state's style.
        </div>
      ) : showEmptyState ? (
        <div className="flex flex-1 items-center justify-center px-4 py-8">
          <p className="text-muted-foreground flex flex-wrap items-center justify-center gap-1.5 text-center text-sm">
            <span>Click</span>
            <span
              aria-hidden="true"
              className="bg-muted text-foreground inline-flex size-5 items-center justify-center rounded"
            >
              <Plus className="size-3.5" />
            </span>
            <span>to start adding Components and Effects</span>
          </p>
        </div>
      ) : (
        <>
          {visibleComponents.length > 0 && (
            <>
              <InspectorGroupDivider label="Components" />
              <SortableComponentList
                components={visibleComponents}
                onReorder={reorderComponents}
                onItemRef={registerComponentRef}
                renderAfterDependencySubtree={(component, index, componentId) => (
                  <NestedComponentList
                    key={`${componentId}-nested`}
                    component={component}
                    entity={entity}
                    root={root}
                    onUpdate={visibleComponentUpdateHandlers[index]}
                    onDeleteEffect={onDeleteEffectTracks}
                    onDeleteEffects={onDeleteEffectsTracks}
                    onDeleteComponentTypes={onDeleteComponentTracks}
                    stateKeyPrefix={makeInspectorStateKey('component', componentId)}
                    componentParentPath={[]}
                    entityKind={entityKind}
                    paddingPreviewTarget={paddingPreviewTarget}
                    onHoverPaddingPreviewTarget={onHoverPaddingPreviewTarget}
                    onTogglePaddingPreviewTarget={onTogglePaddingPreviewTarget}
                    pinnedPaddingPreviewTarget={pinnedPaddingPreviewTarget}
                    positionPreviewTarget={positionPreviewTarget}
                    onHoverPositionPreviewTarget={onHoverPositionPreviewTarget}
                    onTogglePositionPreviewTarget={onTogglePositionPreviewTarget}
                    pinnedPositionPreviewTarget={pinnedPositionPreviewTarget}
                    resolvedTransforms={resolvedTransforms}
                    onComponentRef={registerComponentRef}
                  />
                )}
              >
                {(component, i, dragHandle, componentId) => {
                  const originalIndex = visibleComponentIndexes[i];
                  return (
                    <div className={INSPECTOR_STRUCTURAL_STACK_CLASS}>
                      <div
                        className={
                          component.dependencyOf || component.attachedTo ? INSPECTOR_DEPENDENT_SUBTREE_CLASS : undefined
                        }
                      >
                        <ComponentEditor
                          component={component}
                          entity={entity}
                          root={root}
                          componentIndex={originalIndex}
                          componentParentPath={[]}
                          dragHandle={dragHandle}
                          onDeleteEffect={onDeleteEffectTracks}
                          onDeleteEffects={onDeleteEffectsTracks}
                          onUpdate={componentUpdateHandlers[originalIndex]}
                          onDelete={visibleComponentDeleteHandlers[i]}
                          stateKeyPrefix={makeInspectorStateKey('component', componentId)}
                          onDeleteComponentTypes={onDeleteComponentTracks}
                          entityKind={entityKind}
                          paddingPreviewTarget={paddingPreviewTarget}
                          onHoverPaddingPreviewTarget={onHoverPaddingPreviewTarget}
                          onTogglePaddingPreviewTarget={onTogglePaddingPreviewTarget}
                          pinnedPaddingPreviewTarget={pinnedPaddingPreviewTarget}
                          positionPreviewTarget={positionPreviewTarget}
                          onHoverPositionPreviewTarget={onHoverPositionPreviewTarget}
                          onTogglePositionPreviewTarget={onTogglePositionPreviewTarget}
                          pinnedPositionPreviewTarget={pinnedPositionPreviewTarget}
                          resolvedTransforms={resolvedTransforms}
                          onComponentRef={registerComponentRef}
                          renderNested={false}
                        />
                      </div>
                    </div>
                  );
                }}
              </SortableComponentList>
            </>
          )}
          {entity.effects.length > 0 && (
            <>
              {visibleComponents.length > 0 && <InspectorSectionDivider />}
              <InspectorGroupDivider label="Effects" />
              <DndContext
                autoScroll={false}
                sensors={effectSensors}
                collisionDetection={closestCenter}
                onDragEnd={onEffectDragEnd}
              >
                <SortableContext
                  items={entity.effects.map((effect) => effect.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {entity.effects.map((effect, i) => {
                    const effectStateKey = makeInspectorStateKey('effect', effect.id);
                    const dependencyParent = effect.dependencyOf
                      ? entity.effects.find((candidate) => candidate.id === effect.dependencyOf)
                      : undefined;
                    return (
                      <Fragment key={effect.id}>
                        <div className={effect.dependencyOf ? INSPECTOR_DEPENDENT_SUBTREE_CLASS : undefined}>
                          <EffectEditor
                            id={effect.id}
                            effect={effect}
                            entity={entity}
                            effectIndex={i}
                            displayLabel={effectDisplayLabel(effect, entity.effects)}
                            onUpdate={effectUpdateHandlers[i]}
                            onDelete={dependencyParent ? undefined : effectDeleteHandlers[i]}
                            dependencyLabel={dependencyParent ? effectDisplayLabel(dependencyParent, entity.effects) : undefined}
                            isDisabledByParent={isEffectDisabledByDependency(effect, entity.effects)}
                            stateKeyPrefix={effectStateKey}
                            hasPreviousEffect={i > 0}
                            owner={effectOwner}
                            resolvedPropertyOverrides={resolvedTransform?.propertyOverrides}
                            containerRef={(element) => registerEffectRef(effect.id, element)}
                          />
                        </div>
                        {effectDependencyComponents.get(effect.id) && (
                          <div className={INSPECTOR_DEPENDENT_SUBTREE_CLASS}>
                            <ComponentEditor
                              component={effectDependencyComponents.get(effect.id)!.component}
                              entity={entity}
                              root={root}
                              componentIndex={effectDependencyComponents.get(effect.id)!.index}
                              componentParentPath={[]}
                              onDeleteEffect={onDeleteEffectTracks}
                              onDeleteEffects={onDeleteEffectsTracks}
                              onUpdate={componentUpdateHandlers[effectDependencyComponents.get(effect.id)!.index]}
                              onDelete={undefined}
                              stateKeyPrefix={makeInspectorStateKey(
                                'component',
                                effectDependencyComponents.get(effect.id)!.componentId,
                              )}
                              onDeleteComponentTypes={onDeleteComponentTracks}
                              entityKind={entityKind}
                              paddingPreviewTarget={paddingPreviewTarget}
                              onHoverPaddingPreviewTarget={onHoverPaddingPreviewTarget}
                              onTogglePaddingPreviewTarget={onTogglePaddingPreviewTarget}
                              pinnedPaddingPreviewTarget={pinnedPaddingPreviewTarget}
                              positionPreviewTarget={positionPreviewTarget}
                              onHoverPositionPreviewTarget={onHoverPositionPreviewTarget}
                              onTogglePositionPreviewTarget={onTogglePositionPreviewTarget}
                              pinnedPositionPreviewTarget={pinnedPositionPreviewTarget}
                              resolvedTransforms={resolvedTransforms}
                              isDisabledByParent={isEffectDisabled(effect) || isEffectDisabledByDependency(effect, entity.effects)}
                              renderNested={false}
                            />
                          </div>
                        )}
                      </Fragment>
                    );
                  })}
                </SortableContext>
              </DndContext>
            </>
          )}
        </>
      )}
      {entity.children.length > 0 && (
        <p className="text-muted-foreground/70 text-center text-[11px] leading-relaxed">
          Add components, effects and entities by pressing the{' '}
          <Plus aria-hidden="true" className="mx-0.5 inline-block size-3 align-middle" /> icon.
        </p>
      )}
      </div>
    </RandomizerScopeAvailabilityContext.Provider>
  );
}
