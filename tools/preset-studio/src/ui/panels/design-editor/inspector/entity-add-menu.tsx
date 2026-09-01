import { type ReactNode, useContext, useId, useState } from 'react';
import { ArrowLeft, ClipboardPaste, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { resolveImageAsset } from '@captioncat/caption-engine/browser';
import { cn } from '@/lib/utils';
import type { ComponentTemplate, EcsComponentDoc, EcsEntityDoc, EffectTemplate } from '@/schema';
import {
  collectAddableComponentSlots,
  createStudioComponentId,
  createWipeRevealAnimation,
  ensureComponentDependencies,
  effectScopeForEntity,
  effectSlotsForEntity,
  instantiateComponentWithDependencies,
  instantiateEffectTemplateWithDependencies,
  mergeEntityComponentsForDisplay,
  normalizeFollowTargetComponentForEntity,
  normalizeLayoutMotionComponentForEntity,
  reduceEntityComponents,
  schemaForEntity,
} from '@/schema';
import { humanizeFieldKey } from '@/ui/controls/field-row';
import { useInspectorHeaderMenu } from '@/ui/controls/inspector-header-options';
import { mutedActionButtonClass } from '@/ui/controls/muted-action-button';
import { Button } from '@/ui/shadcn/button';
import { Popover, PopoverAnchor, PopoverContent } from '@/ui/shadcn/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';

import {
  appendInspectorStateKey,
  componentCountAtPath,
  componentListAtPath,
  makeInspectorStateKey,
  updateComponentListAtPath,
} from '../entity-tree';
import { formatPasteActionLabel } from '../component-copy-paste';
import { ComponentCopyPasteContext } from '../component-copy-paste-context';
import { inspectorComponentScope, type StatePropertyChange } from '../state-overrides';
import { StateApplySuggestionContext } from './state-apply-suggestion-context';

function stringProp(component: EcsComponentDoc | undefined, key: string): string | undefined {
  const value = component?.props[key];
  return value?.kind === 'leaf' && typeof value.value === 'string' ? value.value : undefined;
}

function imageAssetForSequencer(component: EcsComponentDoc | undefined): string | undefined {
  if (!component || component.component !== 'image') return undefined;
  const asset = resolveImageAsset(
    stringProp(component, 'assetSource'),
    stringProp(component, 'asset'),
    stringProp(component, 'customAsset'),
  );
  return asset.trim().length > 0 ? asset : undefined;
}

function seedSequenceFrame(component: EcsComponentDoc, frame: string | undefined): EcsComponentDoc {
  if (component.component !== 'imageSequencer' || frame === undefined) return component;
  const previous = component.props.frames;
  return {
    ...component,
    props: {
      ...component.props,
      frames:
        previous?.kind === 'leaf'
          ? { ...previous, type: 'array', value: [frame] }
          : { kind: 'leaf', type: 'array', value: [frame] },
    },
  };
}

function componentScopeForTypePath(
  components: readonly EcsComponentDoc[],
  parentPath: readonly string[],
): string | undefined {
  let current = components;
  let scopeKey: string | undefined;
  for (const componentType of parentPath) {
    const index = current.findIndex((component) => component.component === componentType);
    if (index < 0) return undefined;
    const component = current[index];
    scopeKey = inspectorComponentScope(scopeKey, component, index);
    current = component.components;
  }
  return scopeKey;
}

interface EntityAddOption {
  label: string;
  description?: string;
  onAdd: () => string | undefined;
}

export interface EntityAddStateOption {
  id: string;
  label: string;
  entity?: EcsEntityDoc;
}

/** "+" menu for adding entities, components, or effects to the selected entity. */
export function EntityAddMenu({
  entity,
  onUpdateEntity,
  onUpdateEntityForTarget,
  onAddMarker,
  onAddBackground,
  onAddImage,
  stateOptions,
  onSelectState,
  iconSize = 'default',
  triggerClassName,
  isOpen,
  onOpenChange,
  entitiesOnly = false,
}: {
  entity: EcsEntityDoc;
  onUpdateEntity: (updater: (previous: EcsEntityDoc) => EcsEntityDoc) => void;
  onUpdateEntityForTarget?: (
    targetId: string,
    updater: (previous: EcsEntityDoc) => EcsEntityDoc,
  ) => void;
  onAddMarker: (targetId?: string) => string | undefined;
  onAddBackground: (targetId?: string) => string | undefined;
  onAddImage: (targetId?: string) => string | undefined;
  stateOptions?: readonly EntityAddStateOption[];
  onSelectState?: (stateId: string) => void;
  iconSize?: 'default' | 'small';
  triggerClassName?: string;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  entitiesOnly?: boolean;
}): ReactNode {
  const menuId = useId();
  const sharedMenu = useInspectorHeaderMenu(menuId);
  const open = isOpen ?? sharedMenu.open;
  const setOpen = (nextOpen: boolean): void => {
    if (isOpen === undefined) sharedMenu.setOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };
  const [view, setView] = useState<'states' | 'options'>('options');
  const [selectedStateId, setSelectedStateId] = useState<string>();
  const requiresStateSelection = (stateOptions?.length ?? 0) > 0;
  const selectedState = stateOptions?.find((option) => option.id === selectedStateId);
  const targetEntity = selectedState?.entity ?? entity;
  const targetId = selectedState?.id;
  const displayComponents = mergeEntityComponentsForDisplay(targetEntity);
  const stateApplySuggestion = useContext(StateApplySuggestionContext);
  const addableComponents = entitiesOnly
    ? []
    : collectAddableComponentSlots(schemaForEntity(targetEntity)).filter((slot) => {
        if (slot.template.allowedEntities && !slot.template.allowedEntities.includes(targetEntity.entity)) return false;
        return true;
      });
  const addableEffects = entitiesOnly ? [] : effectSlotsForEntity(targetEntity.entity);
  const componentCopyPaste = useContext(ComponentCopyPasteContext);
  const copiedComponent =
    !entitiesOnly && componentCopyPaste?.payload?.kind === 'component' ? componentCopyPaste.payload : null;
  const copiedComponentTarget = copiedComponent
    ? {
        componentType: copiedComponent.component.component,
        parentPath: copiedComponent.parentPath,
      }
    : null;
  const canPasteMissingComponent = Boolean(
    copiedComponent &&
      copiedComponentTarget &&
      componentCountAtPath(displayComponents, copiedComponentTarget.parentPath, copiedComponentTarget.componentType) === 0 &&
    componentCopyPaste?.canPasteComponent(targetEntity, copiedComponentTarget),
  );
  const copiedEffect = !entitiesOnly && componentCopyPaste?.payload?.kind === 'effect' ? componentCopyPaste.payload : null;
  const canPasteMissingEntityEffect = Boolean(
    copiedEffect &&
      copiedEffect.ownerComponentType === undefined &&
    !targetEntity.effects.some((effect) => effect.effect === copiedEffect.effect.effect) &&
    componentCopyPaste?.canPasteEffect(targetEntity, {}, copiedEffect.effect.effect),
  );
  const canAddMarker = targetEntity.entity !== 'viewport' && targetEntity.entity !== 'marker';
  const canAddBackground = true;
  const canAddImage = targetEntity.entity === 'row' || targetEntity.entity === 'page';
  const addableEntities: EntityAddOption[] = [
    ...(canAddImage
      ? [{ label: 'Image', description: 'Flow image in this row', onAdd: () => onAddImage(targetId) }]
      : []),
    ...(canAddMarker ? [{ label: 'Marker', onAdd: () => onAddMarker(targetId) }] : []),
    ...(canAddBackground
      ? [
          {
            label: 'Background',
            description: 'Independent background entity',
            onAdd: () => onAddBackground(targetId),
          },
        ]
      : []),
  ].sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }));

  const updateTargetEntity = (updater: (previous: EcsEntityDoc) => EcsEntityDoc): void => {
    if (targetId && onUpdateEntityForTarget) {
      onUpdateEntityForTarget(targetId, updater);
      return;
    }
    onUpdateEntity(updater);
  };

  const addComponent = (parentPath: string[], template: ComponentTemplate) => {
    const previousComponents = mergeEntityComponentsForDisplay(targetEntity);
    const additions = instantiateComponentWithDependencies(template, schemaForEntity(targetEntity));
    const imageComponent =
      targetEntity.components.find((component) => component.component === 'image') ??
      additions.find((component) => component.component === 'image');
    const initialFrame = template.component === 'imageSequencer' ? imageAssetForSequencer(imageComponent) : undefined;
    const configuredAdditions = additions.map((component) =>
      seedSequenceFrame(
        normalizeFollowTargetComponentForEntity(
          normalizeLayoutMotionComponentForEntity(component, targetEntity.entity),
          targetEntity.entity,
        ),
        initialFrame,
      ),
    );
    const existingTypes = new Set(previousComponents.map((component) => component.component));
    const nextComponents = updateComponentListAtPath(previousComponents, parentPath, (list) => [
      ...list,
      ...configuredAdditions.filter(
        (component) => component.component === template.component || !existingTypes.has(component.component),
      ),
    ]);
    const ownerScopeKey =
      componentScopeForTypePath(previousComponents, parentPath) ??
      makeInspectorStateKey('entity', targetEntity.id);
    const addedComponent = configuredAdditions.find((component) => component.component === template.component);
    const componentAnchorScopeKey = addedComponent?.studioId
      ? parentPath.length === 0
        ? makeInspectorStateKey('component', addedComponent.studioId)
        : appendInspectorStateKey(ownerScopeKey, 'component', addedComponent.studioId)
      : ownerScopeKey;
    const previousList = componentListAtPath(previousComponents, parentPath) ?? previousComponents;
    const nextList = componentListAtPath(nextComponents, parentPath) ?? nextComponents;
    const change: StatePropertyChange = {
      scopeKey: ownerScopeKey,
      propertyPath: ['components'],
      anchorScopeKey: componentAnchorScopeKey,
      structure: {
        kind: 'components',
        ownerScopeKey,
        previous: previousList,
        next: nextList,
      },
    };
    stateApplySuggestion?.reportStructuralChange(change, targetEntity.id);
    updateTargetEntity((current) => {
      const existingTypes = new Set(mergeEntityComponentsForDisplay(current).map((component) => component.component));
      const components = updateComponentListAtPath(mergeEntityComponentsForDisplay(current), parentPath, (list) => [
        ...list,
        ...configuredAdditions.filter(
          (component) => component.component === template.component || !existingTypes.has(component.component),
        ),
      ]);
      const normalized = ensureComponentDependencies(components, schemaForEntity(current));
      return { ...current, components: reduceEntityComponents(normalized, current) };
    });
    setOpen(false);
  };

  const addEffect = (template: EffectTemplate) => {
    const effects = instantiateEffectTemplateWithDependencies(template, effectScopeForEntity(targetEntity.entity, targetEntity.id));
    const effect = effects[0];
    if (!effect) return;
    const linkedAnimation: EcsComponentDoc | undefined =
      template.effect === 'wipeReveal'
        ? {
            component: 'animation',
            studioId: createStudioComponentId(),
            props: {},
            components: [],
            effects: [],
            explicit: true,
            allowDisable: true,
            isDeletable: true,
            dependencyOf: 'wipeReveal',
            animation: createWipeRevealAnimation(effect.id),
          }
        : undefined;
    const previousEffects = targetEntity.effects;
    const nextEffects = [...previousEffects, ...effects];
    const entityScopeKey = makeInspectorStateKey('entity', targetEntity.id);
    stateApplySuggestion?.reportStructuralChange(
      {
        scopeKey: entityScopeKey,
        propertyPath: ['effects'],
        anchorScopeKey: makeInspectorStateKey('effect', effect.id),
        structure: {
          kind: 'effects',
          ownerScopeKey: entityScopeKey,
          previous: previousEffects,
          next: nextEffects,
          ...(linkedAnimation ? { dependentComponents: [linkedAnimation] } : {}),
        },
      },
      targetEntity.id,
    );
    updateTargetEntity((current) => {
      const components = linkedAnimation
        ? reduceEntityComponents(
            [...mergeEntityComponentsForDisplay(current), linkedAnimation],
            current,
          )
        : current.components;
      return { ...current, components, effects: [...current.effects, ...effects] };
    });
    setOpen(false);
  };

  const handleOpenChange = (nextOpen: boolean): void => {
    setOpen(nextOpen);
    if (nextOpen) {
      setView(requiresStateSelection ? 'states' : 'options');
      setSelectedStateId(undefined);
      return;
    }
    setView('options');
    setSelectedStateId(undefined);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverAnchor asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className={triggerClassName ?? mutedActionButtonClass('single')}
              aria-label={entitiesOnly ? 'Add entities' : 'Add components, entities, and effects'}
              aria-haspopup="dialog"
              aria-expanded={open}
              data-entity-add-trigger="true"
              onPointerDownCapture={(event) => {
                if (event.button === 0 && !open) sharedMenu.closeOtherMenus();
              }}
              onClick={(event) => {
                event.stopPropagation();
                handleOpenChange(!open);
              }}
            >
              <Plus className={cn(iconSize === 'small' ? 'size-4' : 'size-5', 'stroke-[2.4]')} />
            </Button>
          </PopoverAnchor>
        </TooltipTrigger>
        <TooltipContent side="top">{entitiesOnly ? 'Add Entities' : 'Add Components, Entities, and Effects'}</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        collisionPadding={8}
        onFocusOutside={(event) => {
          if (
            event.target instanceof HTMLElement &&
            event.target.closest(
              '[data-slot="select-trigger"], [data-slot="dropdown-menu-content"], [data-inspector-header-menu="true"]',
            )
          ) {
            event.preventDefault();
          }
        }}
        onInteractOutside={(event) => {
          if (
            event.target instanceof HTMLElement &&
            event.target.closest('[data-slot="dropdown-menu-content"], [data-inspector-header-menu="true"]')
          ) {
            event.preventDefault();
          }
        }}
        className="max-h-[var(--radix-popover-content-available-height)] w-64 overflow-y-auto p-2"
      >
        {view === 'states' ? (
          <div className="flex flex-col gap-1">
            <div className="px-3 pt-1 text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
              Choose a state to add to
            </div>
            {stateOptions?.map((option) => (
              <button
                key={option.id}
                type="button"
                className="hover:bg-accent hover:text-accent-foreground flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors"
                onClick={() => {
                  onSelectState?.(option.id);
                  setSelectedStateId(option.id);
                  setView('options');
                }}
              >
                <span className="truncate">{option.label}</span>
                <span className="text-muted-foreground text-[10px] uppercase">{option.id}</span>
              </button>
            ))}
          </div>
        ) : (
          <div>
            {requiresStateSelection && selectedState && (
              <button
                type="button"
                className="text-muted-foreground hover:bg-accent hover:text-accent-foreground mb-1 flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-xs transition-colors"
                onClick={() => setView('states')}
              >
                <ArrowLeft className="size-3.5" aria-hidden="true" />
                <span>
                  Add to <span className="font-medium">{selectedState.label}</span>
                </span>
              </button>
            )}
            <div className="flex flex-col gap-1">
            {(addableComponents.length > 0 || canPasteMissingComponent) && (
              <div className="flex flex-col gap-1">
                <div className="px-3 pt-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Components</div>
                {canPasteMissingComponent && copiedComponent && copiedComponentTarget && (
                  <button
                    type="button"
                    className="hover:bg-accent hover:text-accent-foreground flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors"
                    onClick={() => {
                      componentCopyPaste?.pasteComponent(targetId ?? targetEntity.id, copiedComponentTarget);
                      setOpen(false);
                    }}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <ClipboardPaste className="size-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">
                        {formatPasteActionLabel(
                          humanizeFieldKey(copiedComponent.component.component),
                          copiedComponent.sourceEntityLabel,
                        )}
                      </span>
                    </span>
                  </button>
                )}
                {addableComponents.map((template) => {
                  const count = componentCountAtPath(displayComponents, template.parentPath, template.template.component);
                  const limit = template.template.allowedQuantity ?? Number.POSITIVE_INFINITY;
                  const exhausted = count >= limit;
                  return (
                    <button
                      key={`${template.parentPath.join('.')}:${template.template.component}`}
                      type="button"
                      className={cn(
                        'flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors',
                        exhausted
                          ? 'text-muted-foreground hover:bg-accent/50'
                          : 'hover:bg-accent hover:text-accent-foreground',
                      )}
                      onClick={() => {
                        if (exhausted) {
                          toast.error(
                            `Only ${limit} ${humanizeFieldKey(template.template.component)}${limit === 1 ? ' is' : ' are'} allowed.`,
                          );
                          return;
                        }
                        addComponent(template.parentPath, template.template);
                      }}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate">{humanizeFieldKey(template.template.component)}</span>
                      </span>
                      {Number.isFinite(limit) && (
                        <span className="text-muted-foreground shrink-0 text-xs">
                          {count}/{limit}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            {(addableEffects.length > 0 || canPasteMissingEntityEffect) && (
              <>
                {(addableComponents.length > 0 || canPasteMissingComponent) && (
                  <div className="border-border/60 my-1 border-t" />
                )}
                <div className="flex flex-col gap-1">
                  <div className="px-3 pt-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Effects</div>
                  {canPasteMissingEntityEffect && copiedEffect && (
                    <button
                      type="button"
                      className="hover:bg-accent hover:text-accent-foreground flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors"
                      onClick={() => {
                        componentCopyPaste?.pasteEffect(targetId ?? targetEntity.id, {});
                        setOpen(false);
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
                  {addableEffects.map((template) => {
                    const count = targetEntity.effects.filter((effect) => effect.effect === template.effect).length;
                    const limit = template.allowedQuantity ?? Number.POSITIVE_INFINITY;
                    const exhausted = count >= limit;
                    return (
                      <button
                        key={`effect:${template.effect}`}
                        type="button"
                        className={cn(
                          'flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors',
                          exhausted
                            ? 'text-muted-foreground hover:bg-accent/50'
                            : 'hover:bg-accent hover:text-accent-foreground',
                        )}
                        onClick={() => {
                          if (exhausted) {
                            toast.error(
                              `Only ${limit} ${humanizeFieldKey(template.effect)}${limit === 1 ? ' is' : ' are'} allowed.`,
                            );
                            return;
                          }
                          addEffect(template);
                        }}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate">{humanizeFieldKey(template.effect)}</span>
                        </span>
                        {Number.isFinite(limit) && (
                          <span className="text-muted-foreground shrink-0 text-xs">
                            {count}/{limit}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            {addableEntities.length > 0 && (
              <>
                {(addableComponents.length > 0 ||
                  canPasteMissingComponent ||
                  addableEffects.length > 0 ||
                  canPasteMissingEntityEffect) && (
                  <div className="border-border/60 my-1 border-t" />
                )}
                <div className="flex flex-col gap-1">
                  <div className="px-3 pt-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Entities</div>
                  {addableEntities.map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                      onClick={() => {
                        option.onAdd();
                        setOpen(false);
                      }}
                    >
                      <span className={cn('flex min-w-0', option.description ? 'flex-col' : '')}>
                        <span className="truncate">{option.label}</span>
                        {option.description && <span className="text-muted-foreground text-[10px]">{option.description}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
