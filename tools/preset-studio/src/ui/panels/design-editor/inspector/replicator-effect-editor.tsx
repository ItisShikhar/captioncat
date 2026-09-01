import { closestCenter, DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { type ReactNode, useContext } from 'react';

import { valuesEqual } from '@/lib/values-equal';
import {
  getFieldMeta,
  normalizeReplicatorProps,
  replicatorCopyIdsForProps,
  type ContainerNode,
  type LeafDefinition,
  type PropertyNode,
} from '@/schema';
import { CollapsibleSection } from '@/ui/controls/collapsible-section';
import { DependentSetting } from '@/ui/controls/dependent-setting';
import { InfoTooltip } from '@/ui/controls/info-tooltip';
import { INSPECTOR_CARD_CONTENT_STACK_CLASS } from '@/ui/controls/inspector-layout';
import { NumberField } from '@/ui/controls/number-field';
import { PaintListField } from '@/ui/controls/paint-list-field';
import {
  isPropertyLockState,
  PropertyLockIndicator,
  type PropertyLock,
  type PropertyLockState,
} from '@/ui/controls/property-lock';
import { SelectField } from '@/ui/controls/select-field';
import { mutedActionButtonClass } from '@/ui/controls/muted-action-button';
import {
  CollapsibleCard,
  FieldOverridesContext,
  type FieldOverride,
  InspectorPropertyAnchor,
  PropertyTreeView,
} from '@/ui/panels/property-tree-view';

import {
  DEFAULT_REPLICATOR_FILL_MODE,
  DEFAULT_REPLICATOR_FILL_TARGET,
  DEFAULT_REPLICATOR_FILL_SEED,
  DEFAULT_REPLICATOR_CUSTOM_FILLS,
  replicatorFillForCopy,
  type ReplicatorFillMode,
  type ReplicatorFillTarget,
} from '@captioncat/caption-engine/browser';
import { isPaint, normalizePaint, solidPaint, type Paint } from '@/schema/paint';

import { propsToContainer } from '../entity-tree';
import { PropertyAffordanceLabelExtra } from '../shared/property-affordance-label-extra';
import { StateApplySuggestionContext } from './state-apply-suggestion-context';

function leaf(type: LeafDefinition['type'], value: unknown): LeafDefinition {
  return { kind: 'leaf', type, value };
}

function setLeafConfig(
  props: Record<string, PropertyNode>,
  key: string,
  type: LeafDefinition['type'],
  fallbackValue: unknown,
  patch: Partial<Pick<LeafDefinition, 'randomizer' | 'transition'>>,
): Record<string, PropertyNode> {
  const previous = props[key];
  return {
    ...props,
    [key]:
      previous?.kind === 'leaf'
        ? { ...previous, ...patch }
        : { kind: 'leaf', type, value: fallbackValue, ...patch },
  };
}

function group(children: Record<string, PropertyNode>): ContainerNode {
  return { kind: 'container', wrapping: 'inline', children };
}

function vectorValue(node: PropertyNode | undefined, fallback: { x: number; y: number }): { x: number; y: number } {
  if (node?.kind !== 'leaf' || node.type !== 'vector2' || !node.value || typeof node.value !== 'object') return fallback;
  const value = node.value as { x?: unknown; y?: unknown };
  return {
    x: typeof value.x === 'number' ? value.x : fallback.x,
    y: typeof value.y === 'number' ? value.y : fallback.y,
  };
}

function numberValue(node: PropertyNode | undefined, fallback: number): number {
  return node?.kind === 'leaf' && typeof node.value === 'number' && Number.isFinite(node.value) ? node.value : fallback;
}

function firstPropertyLock(lock: PropertyLock | null | undefined): PropertyLockState | null {
  if (!lock) return null;
  return isPropertyLockState(lock) ? lock : (lock.x ?? lock.y ?? null);
}

function fillModeValue(node: PropertyNode | undefined): ReplicatorFillMode {
  if (node?.kind === 'leaf' && node.type === 'string') {
    if (node.value === 'random' || node.value === 'custom') return node.value;
    if (node.value === 'inherit') return 'inherit';
  }
  return DEFAULT_REPLICATOR_FILL_MODE;
}

function customFillsValue(props: Record<string, PropertyNode>): Paint[] {
  const authoredFills =
    props.customFills?.kind === 'leaf' && Array.isArray(props.customFills.value)
      ? props.customFills.value
          .filter((value): value is Paint => isPaint(value))
          .map((value) => normalizePaint(value, solidPaint('#000000')))
      : [];
  return authoredFills.length > 0
    ? authoredFills
    : DEFAULT_REPLICATOR_CUSTOM_FILLS.map((value) => normalizePaint(value, solidPaint('#000000')));
}

function fillTargetValue(node: PropertyNode | undefined): ReplicatorFillTarget {
  return node?.kind === 'leaf' && node.type === 'string' && node.value === 'fullLayer'
    ? 'fullLayer'
    : DEFAULT_REPLICATOR_FILL_TARGET;
}

function generatedCopyProps(props: Record<string, PropertyNode>, id: string, index: number): Record<string, PropertyNode> {
  const position = vectorValue(props.position, { x: 0, y: 0 });
  const rotation = numberValue(props.rotation, 0);
  const scale = vectorValue(props.scale, { x: 0, y: 0 });
  const opacity = numberValue(props.opacity, 0);
  const customFills = customFillsValue(props);
  const fill =
    fillModeValue(props.fillMode) === 'random'
      ? replicatorFillForCopy(numberValue(props.fillSeed, DEFAULT_REPLICATOR_FILL_SEED), id)
      : fillModeValue(props.fillMode) === 'custom'
        ? customFills[index % customFills.length]
        : solidPaint('#ffffff');
  const multiplier = index + 1;
  return {
    transform: group({
      position: leaf('vector2', { x: position.x * multiplier, y: position.y * multiplier }),
      dimensions: leaf('vector2', { x: 0, y: 0 }),
      rotation: leaf('number', rotation * multiplier),
      scale: leaf('vector2', { x: 1 + scale.x * multiplier, y: 1 + scale.y * multiplier }),
      opacity: leaf('number', Math.max(0, Math.min(1, 1 + opacity * multiplier))),
    }),
    fill: leaf('paint', fill),
  };
}

function mergedCopyProps(props: Record<string, PropertyNode>, id: string, index: number): Record<string, PropertyNode> {
  const generated = generatedCopyProps(props, id, index);
  const overrides = props.copyOverrides;
  const actual = overrides?.kind === 'container' ? overrides.children[id] : undefined;
  if (actual?.kind !== 'container') return generated;
  const generatedTransform = generated.transform;
  const actualTransform = actual.children.transform;
  const generatedTransformChildren = generatedTransform.kind === 'container' ? generatedTransform.children : {};
  return {
    ...generated,
    ...actual.children,
    transform:
      actualTransform?.kind === 'container'
        ? { ...generatedTransform, ...actualTransform, children: { ...generatedTransformChildren, ...actualTransform.children } }
        : generatedTransform,
  };
}

function pruneNode(node: PropertyNode, generated: PropertyNode | undefined): PropertyNode | undefined {
  if (node.kind === 'leaf') {
    if (
      !generated ||
      generated.kind !== 'leaf' ||
      !valuesEqual(node.value, generated.value) ||
      node.animation !== undefined ||
      node.randomizer !== undefined ||
      node.transition !== undefined
    ) {
      return node;
    }
    return undefined;
  }
  const generatedChildren = generated?.kind === 'container' ? generated.children : {};
  const children: Record<string, PropertyNode> = {};
  for (const [key, child] of Object.entries(node.children)) {
    const pruned = pruneNode(child, generatedChildren[key]);
    if (pruned) children[key] = pruned;
  }
  return Object.keys(children).length > 0 ? { ...node, children } : undefined;
}

function copyOverrideNode(props: Record<string, PropertyNode>, id: string, node: PropertyNode | undefined): Record<string, PropertyNode> {
  const current = props.copyOverrides?.kind === 'container' ? props.copyOverrides : group({});
  const children = { ...current.children };
  if (node) children[id] = node;
  else delete children[id];
  return { ...props, copyOverrides: { ...current, children } };
}

function SortableCopyCard({
  props,
  id,
  index,
  stateKeyPrefix,
  updateCopy,
}: {
  props: Record<string, PropertyNode>;
  id: string;
  index: number;
  stateKeyPrefix: string;
  updateCopy: (id: string, index: number, updater: (previous: PropertyNode) => PropertyNode) => void;
}): ReactNode {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const copyStateKey = `${stateKeyPrefix}/copy/${encodeURIComponent(id)}`;
  const dragHandle = (
    <button
      type="button"
      aria-label={`Drag Copy #${index + 1} to reorder`}
      onClick={(event) => event.stopPropagation()}
      className={mutedActionButtonClass('single', 'plain', '-m-1 cursor-grab active:cursor-grabbing')}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="size-3.5" />
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      style={{ transform: transform ? CSS.Translate.toString(transform) : undefined, transition }}
      className={isDragging ? 'relative z-10 w-full opacity-70' : 'relative w-full'}
    >
      <CollapsibleCard
        title={`Copy #${index + 1}`}
        titleIcon={dragHandle}
        compactHeader
        stateKey={copyStateKey}
      >
        <PropertyTreeView
          node={propsToContainer(mergedCopyProps(props, id, index))}
          fieldKey={`copyOverrides.${id}`}
          stateKeyPrefix={copyStateKey}
          overrideScopeKey={copyStateKey}
          onChange={(updater) => updateCopy(id, index, updater)}
        />
      </CollapsibleCard>
    </div>
  );
}

export function ReplicatorEffectEditor({
  props,
  stateKeyPrefix,
  onChange,
  fieldOverrides,
}: {
  props: Record<string, PropertyNode>;
  stateKeyPrefix: string;
  onChange: (updater: (previous: Record<string, PropertyNode>) => Record<string, PropertyNode>) => void;
  fieldOverrides?: Readonly<Record<string, FieldOverride>>;
}): ReactNode {
  const stateApplySuggestion = useContext(StateApplySuggestionContext);
  const copyIdsLock = firstPropertyLock(fieldOverrides?.copyIds?.lock);
  const copyOverridesLock = firstPropertyLock(fieldOverrides?.copyOverrides?.lock);
  const virtualCopiesLock = copyIdsLock ?? copyOverridesLock;
  const resolvedCopyIds = fieldOverrides?.copyIds?.value;
  const displayProps =
    Array.isArray(resolvedCopyIds) && resolvedCopyIds.every((value): value is string => typeof value === 'string')
      ? { ...props, copyIds: leaf('array', resolvedCopyIds) }
      : props;
  const ids = replicatorCopyIdsForProps(displayProps);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const authoredFillMode = fillModeValue(props.fillMode);
  const resolvedFillMode = fieldOverrides?.fillMode?.value;
  const fillMode: ReplicatorFillMode =
    resolvedFillMode === 'random' || resolvedFillMode === 'custom' ? resolvedFillMode : authoredFillMode;
  const fillSeed = numberValue(props.fillSeed, DEFAULT_REPLICATOR_FILL_SEED);
  const resolvedFillSeed = fieldOverrides?.fillSeed?.value;
  const displayFillSeed = typeof resolvedFillSeed === 'number' && Number.isFinite(resolvedFillSeed) ? resolvedFillSeed : fillSeed;
  const authoredFillTarget = fillTargetValue(props.fillTarget);
  const resolvedFillTarget = fieldOverrides?.fillTarget?.value;
  const fillTarget: ReplicatorFillTarget = resolvedFillTarget === 'fullLayer' ? resolvedFillTarget : authoredFillTarget;
  const cloneOffsetStateKey = `${stateKeyPrefix}/clone-offset`;
  const cloneFillStateKey = `${stateKeyPrefix}/clone-fill`;
  const excludedPatternKeys = new Set([
    'copyIds',
    'copyOverrides',
    'position',
    'rotation',
    'scale',
    'opacity',
    'fillMode',
    'fillTarget',
    'fillSeed',
    'customFills',
  ]);
  const patternEntries = Object.entries(props).filter(([key]) => !excludedPatternKeys.has(key));
  const patternProps = Object.fromEntries([
    ...patternEntries.filter(([key]) => key === 'cloneOrdering'),
    ...patternEntries.filter(([key]) => key === 'showOriginal'),
    ...patternEntries.filter(([key]) => key !== 'cloneOrdering' && key !== 'showOriginal'),
  ]);
  const cloneOffsetProps = Object.fromEntries(
    Object.entries(props).filter(([key]) => ['position', 'rotation', 'scale', 'opacity'].includes(key)),
  );

  const updatePattern = (updater: (previous: PropertyNode) => PropertyNode) =>
    onChange((previous) => {
      const next = updater(propsToContainer(Object.fromEntries(Object.entries(previous).filter(([key]) => key !== 'copyIds' && key !== 'copyOverrides'))));
      if (next.kind !== 'container') return previous;
      return normalizeReplicatorProps({ ...previous, ...next.children });
    });

  const updateCopy = (id: string, index: number, updater: (previous: PropertyNode) => PropertyNode) =>
    onChange((previous) => {
      const display = propsToContainer(mergedCopyProps(previous, id, index));
      const next = updater(display);
      if (next.kind !== 'container') return previous;
      const generated = propsToContainer(generatedCopyProps(previous, id, index));
      const override = pruneNode(next, generated);
      return normalizeReplicatorProps(copyOverrideNode(previous, id, override));
    });

  const updateFillMode = (next: string) =>
    onChange((previous) => normalizeReplicatorProps({ ...previous, fillMode: leaf('string', next) }));

  const updateFillSeed = (next: number) =>
    onChange((previous) => normalizeReplicatorProps({ ...previous, fillSeed: leaf('number', next) }));
  const updateFillTarget = (next: string) =>
    onChange((previous) => normalizeReplicatorProps({ ...previous, fillTarget: leaf('string', next) }));
  const setRandomizer = (
    key: string,
    type: LeafDefinition['type'],
    fallbackValue: unknown,
    randomizer: LeafDefinition['randomizer'],
  ): void => {
    onChange((previous) => normalizeReplicatorProps(setLeafConfig(previous, key, type, fallbackValue, { randomizer })));
  };
  const setTransition = (
    key: string,
    type: LeafDefinition['type'],
    fallbackValue: unknown,
    transition: LeafDefinition['transition'],
  ): void => {
    const shared = transition?.scope !== 'state';
    const stateApplied =
      shared &&
      stateApplySuggestion?.applyTransitionToStates({ scopeKey: stateKeyPrefix, propertyPath: [key] }, transition);
    if (stateApplied) return;
    onChange((previous) => normalizeReplicatorProps(setLeafConfig(previous, key, type, fallbackValue, { transition })));
  };
  const withFieldAffordances = (
    key: string,
    label: string,
    type: LeafDefinition['type'],
    currentValue: unknown,
    children: ReactNode,
  ): ReactNode => {
    const node = props[key];
    return (
      <PropertyAffordanceLabelExtra
        fieldKey={key}
        randomizer={{
          label,
          leafType: type,
          currentValue,
          randomizer: node?.kind === 'leaf' ? node.randomizer : undefined,
          onChange: (next) => setRandomizer(key, type, currentValue, next),
          meta: getFieldMeta(key),
        }}
        transition={{
          label,
          currentValue,
          transition: node?.kind === 'leaf' ? node.transition : undefined,
          onChange: (next) => setTransition(key, type, currentValue, next),
        }}
      >
        {children}
      </PropertyAffordanceLabelExtra>
    );
  };

  const onCopyDragEnd = (event: DragEndEvent) => {
    if (virtualCopiesLock?.locked) return;
    if (!event.over || event.active.id === event.over.id) return;
    const activeIndex = ids.indexOf(String(event.active.id));
    const overIndex = ids.indexOf(String(event.over.id));
    if (activeIndex < 0 || overIndex < 0) return;
    onChange((previous) => {
      const currentIds = replicatorCopyIdsForProps(previous);
      const currentActiveIndex = currentIds.indexOf(String(event.active.id));
      const currentOverIndex = currentIds.indexOf(String(event.over!.id));
      if (currentActiveIndex < 0 || currentOverIndex < 0 || currentActiveIndex === currentOverIndex) return previous;
      const copyIds = arrayMove(currentIds, currentActiveIndex, currentOverIndex);
      const copyIdsNode =
        previous.copyIds?.kind === 'leaf' ? { ...previous.copyIds, value: copyIds } : leaf('array', copyIds);
      return normalizeReplicatorProps({ ...previous, copyIds: copyIdsNode });
    });
  };

  return (
    <div className={INSPECTOR_CARD_CONTENT_STACK_CLASS}>
      {Object.keys(patternProps).length > 0 && (
        <FieldOverridesContext.Provider value={fieldOverrides ?? null}>
          <PropertyTreeView
            node={propsToContainer(patternProps)}
            fieldKey="replicator"
            stateKeyPrefix={stateKeyPrefix}
            onChange={updatePattern}
          />
        </FieldOverridesContext.Provider>
      )}
      {Object.keys(cloneOffsetProps).length > 0 && (
        <CollapsibleSection
          title={
            <>
              <PropertyLockIndicator
                lock={firstPropertyLock(fieldOverrides?.position?.lock ?? fieldOverrides?.rotation?.lock)}
                className="size-3"
              />
              <span className="inline-flex items-center gap-1">
                Clone Offset
                <InfoTooltip ariaLabel="Explain Replicator clone offset" side="top">
                  <strong>Offset each generated copy.</strong>
                  <br />
                  The engine multiplies these values for each copy.
                  <br />
                  Use per-copy cards to override individual results.
                </InfoTooltip>
              </span>
            </>
          }
          defaultOpen={false}
          stateKey={cloneOffsetStateKey}
        >
          <FieldOverridesContext.Provider value={fieldOverrides ?? null}>
            <PropertyTreeView
              node={propsToContainer(cloneOffsetProps)}
              fieldKey="cloneOffset"
              stateKeyPrefix={cloneOffsetStateKey}
              overrideScopeKey={cloneOffsetStateKey}
              onChange={updatePattern}
            />
          </FieldOverridesContext.Provider>
        </CollapsibleSection>
      )}
      <CollapsibleSection
        title={
          <span className="inline-flex items-center gap-1">
            Clone Fill
            <InfoTooltip ariaLabel="Explain Replicator clone fills" side="top">
              <strong>Choose the fill source for each copy.</strong>
              <br />
              Inherit the base fill, randomize from values, or provide custom fills.
            </InfoTooltip>
          </span>
        }
        defaultOpen
        stateKey={cloneFillStateKey}
      >
        <div className={INSPECTOR_CARD_CONTENT_STACK_CLASS}>
          {withFieldAffordances(
            'fillMode',
            'Mode',
            'string',
            fillMode,
            <InspectorPropertyAnchor scopeKey={cloneFillStateKey} propertyPath={['fillMode']}>
              <SelectField
                label="Mode"
                value={fillMode}
                options={['inherit', 'random', 'custom']}
                description={getFieldMeta('fillMode').description}
                onChange={updateFillMode}
                lock={firstPropertyLock(fieldOverrides?.fillMode?.lock)}
              />
            </InspectorPropertyAnchor>,
          )}
          {withFieldAffordances(
            'fillTarget',
            'Fill Target',
            'string',
            fillTarget,
            <InspectorPropertyAnchor scopeKey={cloneFillStateKey} propertyPath={['fillTarget']}>
              <SelectField
                label="Fill Target"
                value={fillTarget}
                options={['base', 'fullLayer']}
                optionLabels={{ base: 'Base Content', fullLayer: 'Full Layer' }}
                optionDescriptions={getFieldMeta('fillTarget').optionDescriptions}
                description={getFieldMeta('fillTarget').description}
                onChange={updateFillTarget}
                lock={firstPropertyLock(fieldOverrides?.fillTarget?.lock)}
              />
            </InspectorPropertyAnchor>,
          )}
          {fillMode === 'random' && (
            <DependentSetting>
              {withFieldAffordances(
                'fillSeed',
                'Seed',
                'number',
                displayFillSeed,
                <InspectorPropertyAnchor scopeKey={cloneFillStateKey} propertyPath={['fillSeed']}>
                  <NumberField
                    label="Seed"
                    value={displayFillSeed}
                    meta={getFieldMeta('fillSeed')}
                    onChange={updateFillSeed}
                    lock={firstPropertyLock(fieldOverrides?.fillSeed?.lock)}
                  />
                </InspectorPropertyAnchor>,
              )}
            </DependentSetting>
          )}
          {fillMode === 'custom' && (
            <DependentSetting>
              <PaintListField
                label="Custom Fills"
                fills={customFillsValue(props)}
                onChange={(customFills) =>
                  onChange((previous) =>
                    normalizeReplicatorProps({
                      ...previous,
                      customFills: leaf('array', customFills),
                    }),
                  )
                }
                description="Set the paints used by the virtual copies."
              />
            </DependentSetting>
          )}
        </div>
      </CollapsibleSection>
      <CollapsibleSection
        title={
          <>
            <PropertyLockIndicator lock={virtualCopiesLock} className="size-3" />
            <span>Virtual Copies</span>
          </>
        }
        defaultOpen={false}
        stateKey={`${stateKeyPrefix}/virtual-copies`}
      >
        {ids.length === 0 ? (
          <p className="text-muted-foreground text-xs">No virtual copies.</p>
        ) : (
          <div className={virtualCopiesLock?.locked ? 'pointer-events-none opacity-60' : undefined}>
            <DndContext
              autoScroll={false}
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onCopyDragEnd}
            >
              <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                <div className={INSPECTOR_CARD_CONTENT_STACK_CLASS}>
                  {ids.map((id, index) => (
                    <SortableCopyCard
                      key={id}
                      props={props}
                      id={id}
                      index={index}
                      stateKeyPrefix={stateKeyPrefix}
                      updateCopy={updateCopy}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}