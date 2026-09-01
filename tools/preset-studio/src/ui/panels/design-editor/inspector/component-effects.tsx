import { closestCenter, DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ChevronRight, ClipboardPaste, Plus } from 'lucide-react';
import {
  Fragment,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';

import type { CaptionDebugPropertyOverride } from '@captioncat/caption-engine/browser';
import { EFFECTS_APPLICATION_ORDER } from '@captioncat/caption-engine/browser';
import { cn } from '@/lib/utils';
import type { EcsComponentDoc, EcsEffectDoc, EcsEntityDoc, EffectTemplate } from '@/schema';
import {
  effectSlotsForComponent,
  instantiateEffectTemplateWithDependencies,
  reorderEffectsWithDependencies,
} from '@/schema';
import { DisabledStateTooltip } from '@/ui/controls/disabled-state-tooltip';
import { humanizeFieldKey } from '@/ui/controls/field-row';
import type { InspectorHeaderAction, InspectorHeaderActionRenderContext } from '@/ui/controls/inspector-header-options';
import { INSPECTOR_DEPENDENT_SUBTREE_CLASS } from '@/ui/controls/inspector-layout';
import { mutedActionButtonClass } from '@/ui/controls/muted-action-button';
import { usePopoverOutsideDismissal } from '@/ui/controls/use-popover-outside-dismissal';
import {
  InspectorOverlayDrawer,
  InspectorOverlayDrawerBody,
} from '@/ui/panels/design-editor/inspector/inspector-overlay-drawer';
import { Button } from '@/ui/shadcn/button';
import { DropdownMenuItem } from '@/ui/shadcn/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/shadcn/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';

import { InspectorCardStateContext } from '@/ui/panels/property-tree-view';
import { formatPasteActionLabel } from '../component-copy-paste';
import { ComponentCopyPasteContext } from '../component-copy-paste-context';
import { appendInspectorStateKey } from '../entity-tree';
import { StateOverrideContext } from '../state-overrides';
import {
  DISABLED_DEPENDENCY_OPACITY,
  disabledTypeForEffect,
  isComponentDisabled,
  isEffectDisabled,
  isEffectDisabledByDependency,
} from './disabled-state';
import { EffectEditor } from './effect-editor';
import { effectDisplayLabel, effectOwnerForComponent } from './effect-label';
import { StateApplySuggestionContext } from './state-apply-suggestion-context';

/** "+" icon in a component's own card header for adding an addable effect to only that component (for example, border/shadow on a BackgroundStyle). */
export function ComponentEffectsAddMenu({
  component,
  entity,
  componentParentPath,
  onAddEffect,
  triggerClassName,
  trigger,
  onMenuClose,
  isOpen,
  onOpenChange,
}: {
  component: EcsComponentDoc;
  entity?: EcsEntityDoc;
  componentParentPath?: readonly string[];
  onAddEffect: (template: EffectTemplate) => void;
  triggerClassName?: string;
  trigger?: ReactNode;
  onMenuClose?: () => void;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}): ReactNode {
  const { layerId, open, setOpen } = usePopoverOutsideDismissal(isOpen, onOpenChange);
  const handleOpenChange = (nextOpen: boolean): void => setOpen(nextOpen);
  const addable = effectSlotsForComponent(component.component);
  const componentCopyPaste = useContext(ComponentCopyPasteContext);
  const copiedEffect = componentCopyPaste?.payload?.kind === 'effect' ? componentCopyPaste.payload : null;
  const pasteTarget = {
    ownerComponentType: component.component,
    ownerComponentPath: componentParentPath,
    ownerComponentStudioId: component.studioId,
  };
  const canPasteMissingEffect = Boolean(
    entity &&
    copiedEffect &&
    !component.effects.some((effect) => effect.effect === copiedEffect.effect.effect) &&
    componentCopyPaste?.canPasteEffect(entity, pasteTarget, copiedEffect.effect.effect),
  );
  if (addable.length === 0 && !canPasteMissingEffect) return null;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      {trigger ?? (
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Add Effect"
                title="Add Effect"
                aria-haspopup="dialog"
                aria-expanded={open}
                data-popover-layer-trigger={layerId}
                className={triggerClassName ?? mutedActionButtonClass('single')}
                onClick={(event) => event.stopPropagation()}
              >
                <Plus className="size-4 stroke-[2.4]" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">Add Effects</TooltipContent>
        </Tooltip>
      )}
      <PopoverContent
        align="end"
        data-popover-layer-content={layerId}
        dismissOnOutside={false}
        collisionPadding={8}
        className="max-h-[var(--radix-popover-content-available-height)] w-56 overflow-y-auto p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <div className="flex flex-col gap-1">
            <div className="px-3 pt-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Effects
            </div>
            {canPasteMissingEffect && copiedEffect && entity && (
              <button
                type="button"
                className="hover:bg-accent hover:text-accent-foreground flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors"
                onClick={() => {
                  componentCopyPaste?.pasteEffect(entity.id, pasteTarget);
                  handleOpenChange(false);
                  onMenuClose?.();
                }}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <ClipboardPaste className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    {formatPasteActionLabel(
                      humanizeFieldKey(copiedEffect.effect.effect),
                      copiedEffect.sourceEntityLabel,
                    )}
                  </span>
                </span>
              </button>
            )}
            {addable.map((template) => {
              const count = component.effects.filter((effect) => effect.effect === template.effect).length;
              const limit = template.allowedQuantity ?? Number.POSITIVE_INFINITY;
              const exhausted = count >= limit;
              return (
                <button
                  key={template.effect}
                  type="button"
                  className={
                    exhausted
                      ? 'text-muted-foreground hover:bg-accent/50 flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition-colors'
                      : 'hover:bg-accent hover:text-accent-foreground flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition-colors'
                  }
                  onClick={() => {
                    if (exhausted) {
                      toast.error(
                        `Only ${limit} ${humanizeFieldKey(template.effect)}${limit === 1 ? ' is' : ' are'} allowed.`,
                      );
                      return;
                    }
                    onAddEffect(template);
                    handleOpenChange(false);
                    onMenuClose?.();
                  }}
                >
                  <span className="flex w-full items-center justify-between gap-3">
                    <span>{humanizeFieldKey(template.effect)}</span>
                    {Number.isFinite(limit) && (
                      <span className="text-muted-foreground shrink-0 text-xs">
                        {count}/{limit}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ComponentEffectsAddMenuItem({
  component,
  entity,
  componentParentPath,
  onAddEffect,
  onClose,
}: {
  component: EcsComponentDoc;
  entity?: EcsEntityDoc;
  componentParentPath?: readonly string[];
  onAddEffect: (template: EffectTemplate) => void;
  onClose: () => void;
}): ReactNode {
  return (
    <ComponentEffectsAddMenu
      component={component}
      entity={entity}
      componentParentPath={componentParentPath}
      onAddEffect={onAddEffect}
      onMenuClose={onClose}
      trigger={
        <PopoverTrigger asChild>
          <DropdownMenuItem onSelect={(event) => event.preventDefault()}>
            <Plus className="size-3.5" />
            <span>Add Effect</span>
          </DropdownMenuItem>
        </PopoverTrigger>
      }
    />
  );
}

export function componentEffectsAddAction(
  component: EcsComponentDoc,
  onAddEffect: (template: EffectTemplate) => void,
  context?: { entity: EcsEntityDoc; componentParentPath: readonly string[] },
): InspectorHeaderAction | undefined {
  if (effectSlotsForComponent(component.component).length === 0) return undefined;

  return {
    id: 'add-effect',
    label: 'Add Effect',
    icon: Plus,
    render: ({ grouped, isOpen, onOpenChange }: InspectorHeaderActionRenderContext) => (
      <ComponentEffectsAddMenu
        component={component}
        entity={context?.entity}
        componentParentPath={context?.componentParentPath}
        onAddEffect={onAddEffect}
        triggerClassName={mutedActionButtonClass(grouped ? 'start' : 'single')}
        isOpen={isOpen}
        onOpenChange={onOpenChange}
      />
    ),
    renderMenuItem: ({ onClose }) => (
      <ComponentEffectsAddMenuItem
        component={component}
        entity={context?.entity}
        componentParentPath={context?.componentParentPath}
        onAddEffect={onAddEffect}
        onClose={onClose}
      />
    ),
  };
}

/**
 * Footer rendered at the bottom of a component's own card (after a divider,
 * via `PropertyCard`'s `footer` prop): a compact list of the effects already
 * on this component, plus a "View Effects" button - both open a floating
 * drawer with the full effect cards (enable/disable, edit, delete) so
 * editing them does not clutter the entity's main inspector. The drawer has
 * no dim/blur backdrop and portals into the inspector column (see
 * `InspectorOverlayPortalContext`), so it covers exactly that column's
 * width/height instead of the full viewport.
 */
export function ComponentEffectsFooter({
  component,
  entity,
  componentParentPath,
  onUpdate,
  onDeleteEffect,
  stateKeyPrefix,
  dependencyLabel,
  componentDisabledOverride,
  resolvedPropertyOverrides,
  resolvedPropertyPrefix,
}: {
  component: EcsComponentDoc;
  entity: EcsEntityDoc;
  componentParentPath: readonly string[];
  onUpdate: (updater: (previous: EcsComponentDoc) => EcsComponentDoc) => void;
  onDeleteEffect?: (effectId: string) => void;
  stateKeyPrefix: string;
  dependencyLabel?: string;
  componentDisabledOverride?: boolean;
  resolvedPropertyOverrides?: Readonly<Record<string, CaptionDebugPropertyOverride>>;
  resolvedPropertyPrefix?: string;
}): ReactNode {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [targetEffectStateKey, setTargetEffectStateKey] = useState<string | null>(null);
  const [scrollRequest, setScrollRequest] = useState(0);
  const inspectorCardState = useContext(InspectorCardStateContext);
  const stateOverrideContext = useContext(StateOverrideContext);
  const stateApplySuggestion = useContext(StateApplySuggestionContext);
  const pendingScopeKey =
    stateOverrideContext?.pendingNavigation?.scopeKey ?? stateOverrideContext?.pendingHistoryNavigation?.scopeKey;
  const effects = component.effects;
  const drawerContentRef = useRef<HTMLDivElement>(null);
  const effectCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // Authored effect IDs survive re-renders, reorders, and serialization.
  const stableEffectId = (effect: EcsEffectDoc): string => effect.id;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const updateEffect = useCallback(
    (index: number, updater: (previous: EcsEffectDoc) => EcsEffectDoc) =>
      onUpdate((prev) => ({ ...prev, effects: prev.effects.map((e, i) => (i === index ? updater(e) : e)) })),
    [onUpdate],
  );
  const updateComponentStructure = useCallback(
    (updater: (previous: EcsComponentDoc) => EcsComponentDoc) => {
      stateApplySuggestion?.reportComponentChange(stateKeyPrefix, component, updater);
      onUpdate(updater);
    },
    [component, onUpdate, stateApplySuggestion, stateKeyPrefix],
  );
  const removeEffect = useCallback(
    (index: number) => {
      const effect = effects[index];
      if (!effect) return;
      const removedIds = new Set([effect.id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const candidate of effects) {
          if (candidate.dependencyOf && removedIds.has(candidate.dependencyOf) && !removedIds.has(candidate.id)) {
            removedIds.add(candidate.id);
            changed = true;
          }
        }
      }
      for (const removedId of removedIds) onDeleteEffect?.(removedId);
      updateComponentStructure((prev) => ({
        ...prev,
        effects: prev.effects.filter((candidate) => !removedIds.has(candidate.id)),
      }));
    },
    [effects, onDeleteEffect, updateComponentStructure],
  );
  const onEffectDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!event.over || event.active.id === event.over.id) return;
      const activeIndex = effects.findIndex((effect) => stableEffectId(effect) === event.active.id);
      const overIndex = effects.findIndex((effect) => stableEffectId(effect) === event.over!.id);
      if (activeIndex < 0 || overIndex < 0) return;
      updateComponentStructure((prev) => ({
        ...prev,
        effects: reorderEffectsWithDependencies(prev.effects, String(event.active.id), String(event.over!.id)),
      }));
    },
    [effects, updateComponentStructure],
  );
  const effectUpdateHandlers = useMemo(
    () =>
      effects.map((_, index) => (updater: (previous: EcsEffectDoc) => EcsEffectDoc) => updateEffect(index, updater)),
    [effects, updateEffect],
  );
  const effectDeleteHandlers = useMemo(
    () => effects.map((_, index) => () => removeEffect(index)),
    [effects, removeEffect],
  );
  const effectOwner = useMemo(() => effectOwnerForComponent(component), [component]);

  const targetEffectIsOpen = Boolean(targetEffectStateKey && inspectorCardState?.openState[targetEffectStateKey]);

  const scrollToTargetEffect = useCallback(() => {
    if (!drawerOpen || !targetEffectStateKey || !targetEffectIsOpen) return;
    const container = drawerContentRef.current;
    const card = effectCardRefs.current[targetEffectStateKey];
    if (!container || !card) return;
    const containerBox = container.getBoundingClientRect();
    const cardBox = card.getBoundingClientRect();
    const nextTop = container.scrollTop + (cardBox.top - containerBox.top) - 24;
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    container.scrollTo({
      top: Math.min(maxScrollTop, Math.max(0, nextTop)),
      behavior: 'smooth',
    });
  }, [drawerOpen, targetEffectIsOpen, targetEffectStateKey]);

  useLayoutEffect(() => {
    scrollToTargetEffect();
  }, [scrollRequest, scrollToTargetEffect]);

  useEffect(() => {
    if (!pendingScopeKey) return;
    const targetEffect = effects.find((effect) => {
      const effectStateKey = appendInspectorStateKey(stateKeyPrefix, 'effect', effect.id);
      return pendingScopeKey === effectStateKey || pendingScopeKey.startsWith(`${effectStateKey}/`);
    });
    if (!targetEffect) return;
    setTargetEffectStateKey(pendingScopeKey);
    setScrollRequest((request) => request + 1);
    inspectorCardState?.updateOpenState((previous) => {
      if (previous[pendingScopeKey]) return previous;
      return { ...previous, [pendingScopeKey]: true };
    });
    setDrawerOpen(true);
    if (
      stateOverrideContext?.pendingHistoryNavigation &&
      stateOverrideContext.pendingHistoryNavigation.propertyPath?.[0] !== 'unitTracks'
    ) {
      stateOverrideContext.onHistoryNavigationComplete();
    }
  }, [effects, inspectorCardState, pendingScopeKey, stateKeyPrefix, stateOverrideContext]);

  if (effects.length === 0) return null;

  const openDrawerAtEffect = (effectStateKey: string) => {
    setTargetEffectStateKey(effectStateKey);
    setScrollRequest((request) => request + 1);
    inspectorCardState?.updateOpenState((previous) => {
      if (previous[effectStateKey]) return previous;
      return { ...previous, [effectStateKey]: true };
    });
    setDrawerOpen(true);
  };

  const openDrawer = () => {
    setTargetEffectStateKey(null);
    setDrawerOpen(true);
  };

  const title = humanizeFieldKey(component.component);
  const componentDisabled = componentDisabledOverride ?? isComponentDisabled(component);
  const orderHelperText =
    EFFECTS_APPLICATION_ORDER === 'LIFO'
      ? 'Applied bottom-to-top. Drag to reorder.'
      : 'Applied top-to-bottom. Drag to reorder.';

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {effects.map((effect) => {
            const dependencyParent = effect.dependencyOf
              ? effects.find((candidate) => candidate.id === effect.dependencyOf)
              : undefined;
            const disabledType = disabledTypeForEffect(component, effect, componentDisabled, effects);
            const disabledReason =
              disabledType === 'component'
                ? `${title} is disabled by its Enabled property.`
                : disabledType === 'effect'
                  ? dependencyParent && isEffectDisabled(dependencyParent)
                    ? `${effectDisplayLabel(dependencyParent, effects)} is disabled by its Enabled property.`
                    : `${effectDisplayLabel(effect, effects)} is disabled by its Enabled property.`
                  : undefined;
            return (
              <DisabledStateTooltip
                key={effect.id}
                objectType={disabledType ?? 'effect'}
                disabled={disabledType !== null}
                reason={disabledReason}
              >
                <button
                  type="button"
                  onClick={() => openDrawerAtEffect(appendInspectorStateKey(stateKeyPrefix, 'effect', effect.id))}
                  className={cn(
                    'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors',
                    disabledType !== null && 'transition-opacity duration-200',
                  )}
                  style={disabledType !== null ? { opacity: DISABLED_DEPENDENCY_OPACITY } : undefined}
                >
                  <span>{effectDisplayLabel(effect, effects)}</span>
                </button>
              </DisabledStateTooltip>
            );
          })}
        </div>
        <DisabledStateTooltip
          objectType="component"
          disabled={componentDisabled}
          reason={`${title} is disabled by its Enabled property.`}
        >
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className={cn(
              'text-muted-foreground hover:text-foreground shrink-0 gap-0.5 transition-opacity duration-200',
            )}
            style={componentDisabled ? { opacity: DISABLED_DEPENDENCY_OPACITY } : undefined}
            onClick={openDrawer}
          >
            View Effects
            <ChevronRight className="size-3.5" />
          </Button>
        </DisabledStateTooltip>
      </div>
      <InspectorOverlayDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        dataSlot="effects-drawer"
        title={`${title} effects`}
        description={`Manage effects applied to this ${title.toLowerCase()}.`}
        subDescription={orderHelperText}
        headerAction={
          !dependencyLabel ? (
            <ComponentEffectsAddMenu
              component={component}
              entity={entity}
              componentParentPath={componentParentPath}
              onAddEffect={(template) => {
                const effectsToAdd = instantiateEffectTemplateWithDependencies(template);
                updateComponentStructure((prev) => ({
                  ...prev,
                  effects: [...prev.effects, ...effectsToAdd],
                }));
              }}
            />
          ) : undefined
        }
        onAnimationEnd={(event) => {
          if (event.target !== event.currentTarget || event.currentTarget.dataset.state !== 'open') return;
          scrollToTargetEffect();
        }}
      >
        <InspectorOverlayDrawerBody viewportRef={drawerContentRef}>
          <DndContext
            autoScroll={false}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onEffectDragEnd}
          >
            <SortableContext items={effects.map(stableEffectId)} strategy={verticalListSortingStrategy}>
              {effects.map((effect, i) => {
                const effectStateKey = appendInspectorStateKey(stateKeyPrefix, 'effect', effect.id);
                const dependencyParent = effect.dependencyOf
                  ? effects.find((candidate) => candidate.id === effect.dependencyOf)
                  : undefined;
                return (
                  <Fragment key={stableEffectId(effect)}>
                    <div className={effect.dependencyOf ? INSPECTOR_DEPENDENT_SUBTREE_CLASS : undefined}>
                      <EffectEditor
                        id={stableEffectId(effect)}
                        effect={effect}
                        entity={entity}
                        ownerComponent={component}
                        ownerComponentPath={componentParentPath}
                        effectIndex={i}
                        displayLabel={effectDisplayLabel(effect, effects)}
                        onUpdate={effectUpdateHandlers[i]}
                        onDelete={dependencyLabel || effect.dependencyOf ? undefined : effectDeleteHandlers[i]}
                        dependencyLabel={
                          dependencyParent ? effectDisplayLabel(dependencyParent, effects) : dependencyLabel
                        }
                        ownerComponentDisabled={componentDisabled}
                        isDisabledByParent={isEffectDisabledByDependency(effect, effects)}
                        stateKeyPrefix={effectStateKey}
                        hasPreviousEffect={i > 0}
                        owner={effectOwner}
                        resolvedPropertyOverrides={resolvedPropertyOverrides}
                        resolvedPropertyPrefix={resolvedPropertyPrefix}
                        containerRef={(element) => {
                          effectCardRefs.current[effectStateKey] = element;
                        }}
                      />
                    </div>
                  </Fragment>
                );
              })}
            </SortableContext>
          </DndContext>
        </InspectorOverlayDrawerBody>
      </InspectorOverlayDrawer>
    </>
  );
}
