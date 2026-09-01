import { Radius } from 'lucide-react';
import { useContext, type ReactNode } from 'react';

import type { CaptionDebugPropertyOverride } from '@captioncat/caption-engine/browser';
import { cn } from '@/lib/utils';
import type { EcsComponentDoc, LeafDefinition, PropertyNode } from '@/schema';
import { getComponentDescription, getFieldMeta } from '@/schema';
import { BooleanField } from '@/ui/controls/boolean-field';
import { DeferredNumberInput } from '@/ui/controls/deferred-number-input';
import { DependentSetting } from '@/ui/controls/dependent-setting';
import { humanizeFieldKey } from '@/ui/controls/field-row';
import {
  createInspectorDeleteAction,
  InspectorHeaderOptions,
  type InspectorHeaderAction,
} from '@/ui/controls/inspector-header-options';
import { clampNumber, NumberField } from '@/ui/controls/number-field';
import { propertyLockFromMetadata, PropertyLockIndicator } from '@/ui/controls/property-lock';
import { SelectField } from '@/ui/controls/select-field';
import { CollapsibleCard, InspectorPropertyAnchor } from '@/ui/panels/property-tree-view';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';

import { AnimationTrackNavigationContext } from '../animation-track-navigation';
import { isComponentDeletable } from '../entity-tree';
import { AnimationTrackButton, AnimationTrackLabelExtra } from '../shared/animation-track-button';
import { RandomizerPropertyAffordance } from '../shared/randomizer-property-affordance';
import { TransitionPropertyAffordance } from '../shared/transition-property-affordance';
import { StateApplySuggestionContext } from './state-apply-suggestion-context';

type BorderRadiusMode = 'uniform' | 'individual';
type CornerKey = 'borderTopLeftRadius' | 'borderTopRightRadius' | 'borderBottomLeftRadius' | 'borderBottomRightRadius';

const CORNERS: Array<{ key: CornerKey; label: string; glyph: ReactNode }> = [
  {
    key: 'borderTopLeftRadius',
    label: 'Top left radius',
    glyph: (
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M15.5 8a.5.5 0 0 1 0 1h-3c-.708 0-1.21 0-1.602.032-.385.032-.621.091-.806.186a2 2 0 0 0-.874.874c-.095.185-.154.42-.186.806C9 11.29 9 11.792 9 12.5v3a.5.5 0 0 1-1 0v-3c0-.692 0-1.24.036-1.683.037-.447.113-.83.291-1.18a3 3 0 0 1 1.31-1.31c.35-.178.733-.254 1.18-.29C11.26 8 11.808 8 12.5 8z"
        clipRule="evenodd"
      />
    ),
  },
  {
    key: 'borderTopRightRadius',
    label: 'Top right radius',
    glyph: (
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M11.5 8c.692 0 1.24 0 1.683.036.447.037.83.113 1.18.291a3 3 0 0 1 1.31 1.31c.178.35.254.733.29 1.18.037.442.037.991.037 1.683v3a.5.5 0 0 1-1 0v-3c0-.708 0-1.21-.032-1.602-.032-.385-.091-.621-.186-.806a2 2 0 0 0-.874-.874c-.185-.095-.42-.154-.806-.186C12.71 9 12.208 9 11.5 9h-3a.5.5 0 0 1 0-1z"
        clipRule="evenodd"
      />
    ),
  },
  {
    key: 'borderBottomLeftRadius',
    label: 'Bottom left radius',
    glyph: (
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M8.5 8a.5.5 0 0 1 .5.5v3c0 .708 0 1.21.032 1.602.032.385.091.621.186.806a2 2 0 0 0 .874.874c.185.095.42.154.806.186.392.032.894.032 1.602.032h3a.5.5 0 0 1 0 1h-3c-.692 0-1.24 0-1.683-.036-.447-.037-.83-.113-1.18-.291a3 3 0 0 1-1.31-1.31c-.178-.35-.254-.733-.29-1.18C8 12.74 8 12.192 8 11.5v-3a.5.5 0 0 1 .5-.5"
        clipRule="evenodd"
      />
    ),
  },
  {
    key: 'borderBottomRightRadius',
    label: 'Bottom right radius',
    glyph: (
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M15.5 8a.5.5 0 0 1 .5.5v3c0 .692 0 1.24-.036 1.683-.037.447-.113.83-.291 1.18a3 3 0 0 1-1.31 1.31c-.35.178-.733.254-1.18.29C12.74 16 12.192 16 11.5 16h-3a.5.5 0 0 1 0-1h3c.708 0 1.21 0 1.602-.032.385-.032.621-.091.806-.186a2 2 0 0 0 .874-.874c.095-.185.154-.42.186-.806C15 12.71 15 12.208 15 11.5v-3a.5.5 0 0 1 .5-.5"
        clipRule="evenodd"
      />
    ),
  },
];

function readNumber(props: Record<string, PropertyNode>, key: string, fallback = 0): number {
  const node = props[key] as LeafDefinition | undefined;
  return node?.kind === 'leaf' && typeof node.value === 'number' ? node.value : fallback;
}

function readMode(component: EcsComponentDoc): BorderRadiusMode {
  const mode = component.props.borderRadiusMode;
  if (mode?.kind === 'leaf' && (mode.value === 'uniform' || mode.value === 'individual')) return mode.value;
  const base = readNumber(component.props, 'borderRadius', 0);
  const corners = CORNERS.map((corner) => readNumber(component.props, corner.key, base));
  return corners.every((value) => value === base) ? 'uniform' : 'individual';
}

function hasInitializedUniformCorners(component: EcsComponentDoc, uniformValue: number): boolean {
  return CORNERS.every((corner) => readNumber(component.props, corner.key, uniformValue) === uniformValue);
}

function updateLeafNumber(
  props: Record<string, PropertyNode>,
  key: string,
  next: number,
  min: number | undefined,
  max: number | undefined,
): Record<string, PropertyNode> {
  const current = props[key] as LeafDefinition | undefined;
  if (current?.kind === 'leaf') {
    return { ...props, [key]: { ...current, value: clampNumber(next, { min, max }) } };
  }
  return {
    ...props,
    [key]: { kind: 'leaf', type: 'number', value: clampNumber(next, { min, max }) },
  };
}

/** Inline border-radius editor with Uniform/Individual mode and anchor-style corner grid. */
export function BorderRadiusEditor({
  component,
  onUpdate,
  onDelete,
  dragHandle,
  stateKeyPrefix,
  resolvedPropertyOverrides,
  copyPasteActions = [],
  title: titleOverride,
  propertyPrefix = 'borderRadius',
  showEnabledToggle = true,
  showHeaderActions = true,
  effectiveUniformValue,
  uniformValueReadOnly = false,
}: {
  component: EcsComponentDoc;
  onUpdate: (updater: (previous: EcsComponentDoc) => EcsComponentDoc) => void;
  onDelete?: () => void;
  dragHandle?: ReactNode;
  stateKeyPrefix: string;
  resolvedPropertyOverrides?: Readonly<Record<string, CaptionDebugPropertyOverride>>;
  copyPasteActions?: readonly InspectorHeaderAction[];
  title?: string;
  propertyPrefix?: string;
  showEnabledToggle?: boolean;
  showHeaderActions?: boolean;
  effectiveUniformValue?: number;
  uniformValueReadOnly?: boolean;
}): ReactNode {
  const animationTrackNavigation = useContext(AnimationTrackNavigationContext);
  const stateApplySuggestion = useContext(StateApplySuggestionContext);
  const title = titleOverride ?? humanizeFieldKey(component.component);
  const canDelete = Boolean(isComponentDeletable(component) && onDelete);
  const metadataFor = (key: string) => resolvedPropertyOverrides?.[`${propertyPrefix}.${key}`];
  const lockFor = (key: string) => propertyLockFromMetadata(metadataFor(key));
  const resolvedNumber = (key: string, fallback: number): number => {
    const value = metadataFor(key)?.value;
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  };
  const resolvedBoolean = (key: string, fallback: boolean): boolean => {
    const value = metadataFor(key)?.value;
    return typeof value === 'boolean' ? value : fallback;
  };
  const resolvedString = (key: string, fallback: string): string => {
    const value = metadataFor(key)?.value;
    return typeof value === 'string' ? value : fallback;
  };
  const enabled = resolvedBoolean(
    'enabled',
    component.props.enabled?.kind === 'leaf' ? Boolean(component.props.enabled.value) : true,
  );
  const mode = readMode(component);
  const hasEffectiveUniformValue = Number.isFinite(effectiveUniformValue);
  const displayMode = hasEffectiveUniformValue
    ? 'uniform'
    : (resolvedString('borderRadiusMode', mode) as BorderRadiusMode);
  const modeMeta = getFieldMeta('borderRadiusMode');
  const uniformMeta = getFieldMeta('borderRadius');
  const uniformValue = hasEffectiveUniformValue
    ? (effectiveUniformValue as number)
    : resolvedNumber('borderRadius', readNumber(component.props, 'borderRadius', 0));
  const cornerValues: Record<CornerKey, number> = {
    borderTopLeftRadius: resolvedNumber(
      'borderTopLeftRadius',
      readNumber(component.props, 'borderTopLeftRadius', uniformValue),
    ),
    borderTopRightRadius: resolvedNumber(
      'borderTopRightRadius',
      readNumber(component.props, 'borderTopRightRadius', uniformValue),
    ),
    borderBottomLeftRadius: resolvedNumber(
      'borderBottomLeftRadius',
      readNumber(component.props, 'borderBottomLeftRadius', uniformValue),
    ),
    borderBottomRightRadius: resolvedNumber(
      'borderBottomRightRadius',
      readNumber(component.props, 'borderBottomRightRadius', uniformValue),
    ),
  };
  const enabledLock = lockFor('enabled');

  const setEnabled = (next: boolean) =>
    onUpdate((prev) => {
      const current = prev.props.enabled;
      return {
        ...prev,
        props: {
          ...prev.props,
          enabled:
            current?.kind === 'leaf' ? { ...current, value: next } : { kind: 'leaf', type: 'boolean', value: next },
        },
      };
    });

  const setMode = (next: BorderRadiusMode) =>
    onUpdate((prev) => {
      const base = readNumber(prev.props, 'borderRadius', 0);
      let props: Record<string, PropertyNode> = { ...prev.props };
      if (next === 'individual' && hasInitializedUniformCorners(prev, base)) {
        for (const corner of CORNERS) {
          props = updateLeafNumber(props, corner.key, base, uniformMeta.min, uniformMeta.max);
        }
      }
      return {
        ...prev,
        props: {
          ...props,
          borderRadiusMode: { kind: 'leaf', type: 'string', value: next },
        },
      };
    });

  const setUniformRadius = (next: number) =>
    onUpdate((prev) => ({
      ...prev,
      props: updateLeafNumber(prev.props, 'borderRadius', next, uniformMeta.min, uniformMeta.max),
    }));
  const setUniformTransition = (transition: LeafDefinition['transition']) => {
    const shared = transition?.scope !== 'state';
    const stateApplied =
      shared &&
      stateApplySuggestion?.applyTransitionToStates(
        { scopeKey: stateKeyPrefix, propertyPath: ['borderRadius'] },
        transition,
      );
    if (stateApplied) return;
    onUpdate((prev) => {
      const base = prev.props.borderRadius;
      if (base?.kind === 'leaf') {
        return { ...prev, props: { ...prev.props, borderRadius: { ...base, transition } } };
      }
      return {
        ...prev,
        props: {
          ...prev.props,
          borderRadius: {
            kind: 'leaf',
            type: 'number',
            value: readNumber(prev.props, 'borderRadius', uniformValue),
            transition,
          },
        },
      };
    });
  };
  const setUniformRandomizer = (randomizer: LeafDefinition['randomizer']) =>
    onUpdate((prev) => {
      const base = prev.props.borderRadius;
      if (base?.kind === 'leaf') {
        return { ...prev, props: { ...prev.props, borderRadius: { ...base, randomizer } } };
      }
      return {
        ...prev,
        props: {
          ...prev.props,
          borderRadius: {
            kind: 'leaf',
            type: 'number',
            value: readNumber(prev.props, 'borderRadius', uniformValue),
            randomizer,
          },
        },
      };
    });
  const setCornerTransition = (key: CornerKey, transition: LeafDefinition['transition']) => {
    const shared = transition?.scope !== 'state';
    if (shared) {
      stateApplySuggestion?.applyTransitionToStates({ scopeKey: stateKeyPrefix, propertyPath: [key] }, transition);
    }
    onUpdate((prev) => {
      const base = prev.props[key];
      if (base?.kind === 'leaf') {
        return { ...prev, props: { ...prev.props, [key]: { ...base, transition } } };
      }
      return {
        ...prev,
        props: {
          ...prev.props,
          [key]: { kind: 'leaf', type: 'number', value: readNumber(prev.props, key, uniformValue), transition },
        },
      };
    });
  };
  const setCornerRandomizer = (key: CornerKey, randomizer: LeafDefinition['randomizer']) =>
    onUpdate((prev) => {
      const base = prev.props[key];
      if (base?.kind === 'leaf') {
        return { ...prev, props: { ...prev.props, [key]: { ...base, randomizer } } };
      }
      return {
        ...prev,
        props: {
          ...prev.props,
          [key]: { kind: 'leaf', type: 'number', value: readNumber(prev.props, key, uniformValue), randomizer },
        },
      };
    });

  const setCornerRadius = (key: CornerKey, next: number) =>
    onUpdate((prev) => ({
      ...prev,
      props: updateLeafNumber(prev.props, key, next, uniformMeta.min, uniformMeta.max),
    }));

  const setSmoothing = (next: boolean) =>
    onUpdate((prev) => {
      const base = prev.props.borderRadius;
      if (base?.kind === 'leaf') {
        return { ...prev, props: { ...prev.props, borderRadius: { ...base, squircle: next } } };
      }
      return {
        ...prev,
        props: {
          ...prev.props,
          borderRadius: { kind: 'leaf', type: 'number', value: 0, squircle: next },
        },
      };
    });

  const headerExtra = showHeaderActions ? (
    <>
      {dragHandle}
      <InspectorPropertyAnchor scopeKey={stateKeyPrefix} propertyPath={['enabled']}>
        {null}
      </InspectorPropertyAnchor>
      <InspectorHeaderOptions
        ariaLabel={`${title} options`}
        actions={[...copyPasteActions, ...(canDelete ? [createInspectorDeleteAction(title, () => onDelete?.())] : [])]}
      />
    </>
  ) : null;

  return (
    <CollapsibleCard
      title={title}
      titleHelp={getComponentDescription('borderRadius')}
      compactHeader
      headerExtra={headerExtra}
      titleIcon={<Radius className="text-muted-foreground/80 size-3.5 shrink-0" aria-hidden="true" />}
      enabled={showEnabledToggle ? enabled : undefined}
      onEnabledChange={showEnabledToggle ? setEnabled : undefined}
      enabledLock={showEnabledToggle ? enabledLock : null}
      stateKey={stateKeyPrefix}
    >
      <InspectorPropertyAnchor scopeKey={stateKeyPrefix} propertyPath={['borderRadiusMode']}>
        <SelectField
          label="Mode"
          value={displayMode}
          options={modeMeta.options ?? ['uniform', 'individual']}
          description="Uniform uses one radius for every corner. Individual lets you edit each corner separately."
          onChange={(next) => {
            if (next === 'uniform' || next === 'individual') setMode(next);
          }}
          disabled={uniformValueReadOnly}
          lock={lockFor('borderRadiusMode')}
        />
      </InspectorPropertyAnchor>
      <DependentSetting>
        {displayMode === 'uniform' ? (
          <InspectorPropertyAnchor scopeKey={stateKeyPrefix} propertyPath={['borderRadius']}>
            <AnimationTrackLabelExtra scopeKey={stateKeyPrefix} propertyPath={['borderRadius']}>
              <NumberField
                label="Radius"
                value={uniformValue}
                onChange={setUniformRadius}
                meta={uniformMeta}
                disabled={uniformValueReadOnly}
                lock={lockFor('borderRadius')}
                childrenAfter={
                  <div className="flex shrink-0 items-center gap-1">
                    <RandomizerPropertyAffordance
                      label="Radius"
                      leafType="number"
                      currentValue={uniformValue}
                      randomizer={
                        component.props.borderRadius?.kind === 'leaf'
                          ? component.props.borderRadius.randomizer
                          : undefined
                      }
                      onChange={setUniformRandomizer}
                      meta={uniformMeta}
                    />
                    <TransitionPropertyAffordance
                      label="Radius"
                      transition={
                        component.props.borderRadius?.kind === 'leaf'
                          ? component.props.borderRadius.transition
                          : undefined
                      }
                      currentValue={uniformValue}
                      leafType="number"
                      meta={uniformMeta}
                      onChange={setUniformTransition}
                    />
                  </div>
                }
              />
            </AnimationTrackLabelExtra>
          </InspectorPropertyAnchor>
        ) : (
          <div className="py-1">
            <div
              className="grid gap-px overflow-hidden rounded-md border border-border/70 bg-border"
              style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 12rem), 1fr))' }}
            >
              {CORNERS.map((corner) => {
                const target = animationTrackNavigation?.targetFor(stateKeyPrefix, [corner.key]);
                const cornerNode = component.props[corner.key];
                return (
                  <InspectorPropertyAnchor key={corner.key} scopeKey={stateKeyPrefix} propertyPath={[corner.key]}>
                    <div
                      className={cn('group/corner flex min-h-10 items-center gap-1 bg-muted px-1.5 hover:bg-muted/80')}
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className="flex size-6 shrink-0 items-center justify-center text-muted-foreground"
                            aria-label={corner.label}
                          >
                            <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden="true">
                              {corner.glyph}
                            </svg>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top">{corner.label}</TooltipContent>
                      </Tooltip>
                      <DeferredNumberInput
                        id={`${stateKeyPrefix}-${corner.key}`}
                        aria-label={corner.label}
                        className="h-8 min-w-0 flex-1 border-border/70 bg-background/80"
                        value={cornerValues[corner.key]}
                        min={uniformMeta.min}
                        max={uniformMeta.max}
                        step={uniformMeta.step ?? 'any'}
                        inlineEndContent={uniformMeta.unit}
                        disabled={lockFor(corner.key)?.locked === true}
                        onCommit={(next) => setCornerRadius(corner.key, next)}
                      />
                      <RandomizerPropertyAffordance
                        label={corner.label}
                        leafType="number"
                        currentValue={cornerValues[corner.key]}
                        randomizer={cornerNode?.kind === 'leaf' ? cornerNode.randomizer : undefined}
                        onChange={(next) => setCornerRandomizer(corner.key, next)}
                        meta={uniformMeta}
                      />
                      <TransitionPropertyAffordance
                        label={corner.label}
                        transition={cornerNode?.kind === 'leaf' ? cornerNode.transition : undefined}
                        currentValue={cornerValues[corner.key]}
                        leafType="number"
                        meta={uniformMeta}
                        onChange={(next) => setCornerTransition(corner.key, next)}
                      />
                      {target && <AnimationTrackButton target={target} />}
                      <PropertyLockIndicator lock={lockFor(corner.key)} className="size-3" />
                    </div>
                  </InspectorPropertyAnchor>
                );
              })}
            </div>
          </div>
        )}
        <InspectorPropertyAnchor scopeKey={stateKeyPrefix} propertyPath={['squircle']}>
          <BooleanField
            label="Corner smoothing"
            value={resolvedBoolean(
              'squircle',
              component.props.borderRadius?.kind === 'leaf' ? (component.props.borderRadius.squircle ?? true) : true,
            )}
            onChange={setSmoothing}
            disabled={lockFor('squircle')?.locked === true}
            lock={lockFor('squircle')}
          />
        </InspectorPropertyAnchor>
      </DependentSetting>
    </CollapsibleCard>
  );
}
