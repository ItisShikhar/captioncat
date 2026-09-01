import { useContext, type ReactNode } from 'react';

import type { CaptionDebugPropertyOverride, CaptionDebugTransform } from '@captioncat/caption-engine/browser';
import {
  effectScopeForEntity,
  getComponentDescription,
  getFieldMeta,
  instantiateEffectTemplateWithDependencies,
  type ContainerNode,
  type EcsComponentDoc,
  type EcsEntityDoc,
  type PropertyNode,
} from '@/schema';
import { DeferredNumberInput } from '@/ui/controls/deferred-number-input';
import {
  DimensionUnitSelect,
  type DimensionUnit,
} from '@/ui/controls/dimension-unit-select';
import { FieldRow, humanizeFieldKey } from '@/ui/controls/field-row';
import {
  createInspectorDeleteAction,
  InspectorHeaderOptions,
  type InspectorHeaderAction,
} from '@/ui/controls/inspector-header-options';
import {
  CollapsibleCard,
  FieldOverridesContext,
  headerIconForComponent,
  InspectorPropertyAnchor,
  PropertyTreeView,
} from '@/ui/panels/property-tree-view';
import {
  positionPreviewTargetsEqual,
  type DebugEntityKind,
  type PositionPreviewTarget,
} from '@/ui/preview/entity-debug';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/shadcn/select';

import type { PropertyLock, PropertyLockState } from '@/ui/controls/property-lock';
import { propertyLockForAxis, PropertyLockIndicator } from '@/ui/controls/property-lock';
import { usePreviewDebugData } from '@/ui/preview/preview-debug-data-context';
import { isComponentDeletable, vector2ValueFromNode } from '../entity-tree';
import { AnimationTrackLabelExtra } from '../shared/animation-track-button';
import { PositionPreviewIcon } from '../shared/position-preview-icon';
import { TransitionPropertyAffordance } from '../shared/transition-property-affordance';
import { CaptionLayoutContext } from './caption-layout-context';
import { componentEffectsAddAction } from './component-effects';
import { StateApplySuggestionContext } from './state-apply-suggestion-context';

const SIZE_MODE_OPTIONS = ['custom', 'fitParent', 'fitContent', 'fitChildren'] as const;
type TransformSizeMode = (typeof SIZE_MODE_OPTIONS)[number];
const POSITIONING_OPTIONS = ['flow', 'absolute'] as const;
type TransformPositioning = (typeof POSITIONING_OPTIONS)[number];
type Axis = 'x' | 'y';
type Dimensions = { x: number; y: number };

function leafValue(component: EcsComponentDoc, key: string): unknown {
  const node = component.props[key];
  return node?.kind === 'leaf' ? node.value : undefined;
}

function modeValue(
  component: EcsComponentDoc,
  key: 'widthMode' | 'heightMode',
  resolvedTransform?: CaptionDebugTransform | null,
): TransformSizeMode {
  const resolvedValue = resolvedTransform?.propertyOverrides?.[`transform.${key}`]?.value;
  if (typeof resolvedValue === 'string' && SIZE_MODE_OPTIONS.includes(resolvedValue as TransformSizeMode)) {
    return resolvedValue as TransformSizeMode;
  }
  const value = leafValue(component, key);
  return typeof value === 'string' && SIZE_MODE_OPTIONS.includes(value as TransformSizeMode)
    ? (value as TransformSizeMode)
    : 'custom';
}

function dimensionsValue(component: EcsComponentDoc): Dimensions {
  const value = leafValue(component, 'dimensions');
  return value && typeof value === 'object'
    ? {
        x: typeof (value as { x?: unknown }).x === 'number' ? (value as { x: number }).x : 0,
        y: typeof (value as { y?: unknown }).y === 'number' ? (value as { y: number }).y : 0,
      }
    : { x: 0, y: 0 };
}

type ChildWindowAxis = 'horizontal' | 'vertical';

interface ChildWindowSettings {
  mode: string;
  count: number;
  axis: ChildWindowAxis;
}

function childWindowSettings(entity: EcsEntityDoc | undefined): ChildWindowSettings | null {
  const layout = entity?.components.find((candidate) => candidate.component === 'layout');
  const childWindow = layout?.props.childWindow;
  if (!childWindow || childWindow.kind !== 'container') return null;

  const value = (key: string): unknown => {
    const node = childWindow.children[key];
    return node?.kind === 'leaf' ? node.value : undefined;
  };
  const axis = value('windowAxis');
  const count = value('windowCount');
  const mode = value('windowMode');
  return {
    mode: typeof mode === 'string' ? mode : 'all',
    count: typeof count === 'number' && Number.isFinite(count) ? count : 1,
    axis: axis === 'horizontal' ? 'horizontal' : 'vertical',
  };
}

function vectorValue(value: unknown, fallback: Dimensions): Dimensions {
  if (!value || typeof value !== 'object') return fallback;
  const candidate = value as { x?: unknown; y?: unknown };
  return {
    x: typeof candidate.x === 'number' ? candidate.x : fallback.x,
    y: typeof candidate.y === 'number' ? candidate.y : fallback.y,
  };
}

function replaceLeaf(component: EcsComponentDoc, key: string, next: PropertyNode): EcsComponentDoc {
  return { ...component, props: { ...component.props, [key]: next } };
}

function updateStringLeaf(component: EcsComponentDoc, key: string, value: string): EcsComponentDoc {
  const current = component.props[key];
  return replaceLeaf(
    component,
    key,
    current?.kind === 'leaf' ? { ...current, value } : { kind: 'leaf', type: 'string', value },
  );
}

function updateDimensionsLeaf(component: EcsComponentDoc, dimensions: Dimensions): EcsComponentDoc {
  const current = component.props.dimensions;
  return replaceLeaf(
    component,
    'dimensions',
    current?.kind === 'leaf' ? { ...current, value: dimensions } : { kind: 'leaf', type: 'vector2', value: dimensions },
  );
}

function updateDimensionUnit(
  component: EcsComponentDoc,
  key: 'widthUnit' | 'heightUnit',
  axis: Axis,
  unit: DimensionUnit,
): EcsComponentDoc {
  const dimensions = dimensionsValue(component);
  const nextDimensions =
    unit === '%' ? { ...dimensions, [axis]: Math.min(100, Math.max(0, dimensions[axis])) } : dimensions;
  return updateStringLeaf(updateDimensionsLeaf(component, nextDimensions), key, unit);
}

function updatePositionUnit(
  component: EcsComponentDoc,
  key: 'positionXUnit' | 'positionYUnit',
  unit: DimensionUnit,
): EcsComponentDoc {
  return updateStringLeaf(component, key, unit);
}

function dimensionUnitValue(component: EcsComponentDoc, key: 'widthUnit' | 'heightUnit'): DimensionUnit {
  const value = leafValue(component, key);
  return normalizeDimensionUnitValue(value);
}

function positionUnitValue(component: EcsComponentDoc, key: 'positionXUnit' | 'positionYUnit'): DimensionUnit {
  return normalizeDimensionUnitValue(leafValue(component, key));
}

function normalizeDimensionUnitValue(value: unknown): DimensionUnit {
  return value === '%' || value === 'percent' ? '%' : 'pt';
}

function clampDimensionValue(
  value: number,
  unit: DimensionUnit,
  minimum: number | undefined,
  maximum: number | undefined,
): number {
  const lower = minimum ?? 0;
  const upper = unit === '%' ? 100 : maximum;
  return Math.min(upper ?? value, Math.max(lower, value));
}

function AxisDimensionRow({
  axis,
  mode,
  value,
  resolvedValue,
  unit,
  modeKey,
  overrideScopeKey,
  onModeChange,
  onValueChange,
  onUnitChange,
  lock = null,
  minimumValue,
  allowModeChange = false,
}: {
  axis: Axis;
  mode: TransformSizeMode;
  value: number;
  resolvedValue: number;
  unit: DimensionUnit;
  modeKey: 'widthMode' | 'heightMode';
  overrideScopeKey: string;
  onModeChange: (next: TransformSizeMode) => void;
  onValueChange: (next: number) => void;
  onUnitChange: (next: DimensionUnit) => void;
  lock?: PropertyLockState | null;
  minimumValue?: number;
  allowModeChange?: boolean;
}): ReactNode {
  const custom = mode === 'custom';
  const meta = getFieldMeta('dimensions');
  const editable = custom && lock?.locked !== true;
  const minimum = unit === 'pt' && Number.isFinite(minimumValue) ? Math.max(meta.min ?? 0, minimumValue!) : meta.min;
  const maximum = meta.max === undefined || minimum === undefined ? meta.max : Math.max(meta.max, minimum);
  const inputMinimum = editable && unit === 'pt' ? minimum : 0;
  const inputMaximum = editable && unit === '%' ? 100 : maximum;
  const displayedValue = editable
    ? clampDimensionValue(Math.max(value, inputMinimum ?? 0), unit, inputMinimum, inputMaximum)
    : resolvedValue;
  const displayUnit = editable ? unit : 'pt';
  const resolvedFallbackTitle =
    editable && value <= 0 && resolvedValue > 0
      ? `No custom ${axis === 'x' ? 'width' : 'height'} is set; preview resolves to ${resolvedValue} pt`
      : undefined;
  const minimumTitle =
    editable && unit === 'pt' && minimum !== undefined && minimum > 0
      ? `Minimum ${axis === 'x' ? 'width' : 'height'} for the current caption layout: ${minimum} pt`
      : undefined;
  const id = `transform-dimensions-${axis}`;

  return (
    <div className="grid w-full max-w-md grid-cols-[1rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-1.5">
      <span className="text-muted-foreground text-xs font-semibold" aria-hidden="true">
        {axis === 'x' ? 'W' : 'H'}
      </span>
      <div className="min-w-0">
        <div className="flex w-full items-center gap-1.5">
          <InspectorPropertyAnchor scopeKey={overrideScopeKey} propertyPath={[modeKey]}>
            <div className="min-w-0 w-full">
              <Select value={mode} onValueChange={onModeChange} disabled={lock?.locked === true && !allowModeChange}>
                <SelectTrigger id={`${id}-mode`} className="h-8 w-full min-w-0 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SIZE_MODE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {humanizeFieldKey(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </InspectorPropertyAnchor>
          <PropertyLockIndicator lock={lock} className="size-3 shrink-0" />
        </div>
      </div>
      <div className="min-w-0">
        <div className="flex w-full items-center gap-1.5">
          <DeferredNumberInput
            id={id}
            className={
              editable
                ? 'h-8 w-full min-w-0 font-mono text-sm'
                : 'h-8 w-full min-w-0 font-mono text-sm text-muted-foreground'
            }
            value={Number.isFinite(displayedValue) ? displayedValue : 0}
            onCommit={(next) => onValueChange(clampDimensionValue(next, unit, inputMinimum, inputMaximum))}
            step={meta.step ?? 'any'}
            inlineEndContent={
              <DimensionUnitSelect
                value={displayUnit}
                onChange={onUnitChange}
                disabled={!editable}
                ariaLabel={`${axis === 'x' ? 'Width' : 'Height'} unit`}
              />
            }
            inlineEndContentInteractive
            min={inputMinimum}
            max={inputMaximum}
            disabled={!editable}
            aria-label={`${axis === 'x' ? 'Width' : 'Height'} value`}
            title={custom ? (minimumTitle ?? resolvedFallbackTitle) : `Resolved ${axis === 'x' ? 'width' : 'height'}`}
          />
          <PropertyLockIndicator lock={lock} className="size-3 shrink-0" />
        </div>
      </div>
    </div>
  );
}

function DimensionsEditor({
  component,
  resolvedTransform,
  entityKind,
  entity,
  overrideScopeKey,
  onUpdate,
}: {
  component: EcsComponentDoc;
  resolvedTransform: CaptionDebugTransform | null;
  entityKind: DebugEntityKind | null;
  entity?: EcsEntityDoc;
  overrideScopeKey: string;
  onUpdate: (updater: (previous: EcsComponentDoc) => EcsComponentDoc) => void;
}): ReactNode {
  const dimensions = dimensionsValue(component);
  const authoredHeightMode = modeValue(component, 'heightMode');
  const resolved = resolvedTransform?.dimensions ?? dimensions;
  const captionLayout = useContext(CaptionLayoutContext);
  const { minimumPageSize } = usePreviewDebugData();
  const allRowsMode = captionLayout?.rowsPerPage.mode === 'all';
  const rowHeightManaged = captionLayout !== null && entityKind === 'row';
  const widthMode = modeValue(component, 'widthMode', resolvedTransform);
  const resolvedHeightMode = modeValue(component, 'heightMode', resolvedTransform);
  const widthUnit = dimensionUnitValue(component, 'widthUnit');
  const heightUnit = dimensionUnitValue(component, 'heightUnit');
  const heightMode =
    resolvedTransform?.propertyOverrides?.['transform.heightMode'] !== undefined
      ? resolvedHeightMode
      : authoredHeightMode;
  const pageMinimumWidth = entityKind === 'page' ? minimumPageSize?.width : undefined;
  const pageMinimumHeight =
    entityKind === 'page' && !allRowsMode ? minimumPageSize?.height : undefined;
  const dimensionsNode = component.props.dimensions;
  const transition = dimensionsNode?.kind === 'leaf' ? dimensionsNode.transition : undefined;
  const stateApplySuggestion = useContext(StateApplySuggestionContext);
  const widthOverride = resolvedTransform?.propertyOverrides?.['transform.dimensions.x'];
  const heightOverride = resolvedTransform?.propertyOverrides?.['transform.dimensions.y'];
  const widthModeOverride = resolvedTransform?.propertyOverrides?.['transform.widthMode'];
  const heightModeOverride = resolvedTransform?.propertyOverrides?.['transform.heightMode'];
  const canChangeResolvedMode = (override: CaptionDebugPropertyOverride | undefined): boolean =>
    override?.source.startsWith('Caption Layout') !== true;
  const childWindow = childWindowSettings(entity);
  const childWindowLock = (
    axis: Axis,
    mode: TransformSizeMode,
    resolvedValue: number,
  ): PropertyLockState | null => {
    const windowAxis = axis === 'x' ? 'horizontal' : 'vertical';
    if (mode !== 'fitChildren' || childWindow?.mode !== 'count' || childWindow.axis !== windowAxis) return null;
    const dimension = axis === 'x' ? 'Width' : 'Height';
    return {
      locked: true,
      value: resolvedValue,
      override: {
        source: `Child Window (Fixed Count: ${Math.round(childWindow.count)})`,
        type: 'layout',
        chain: [
          `Child Window (Fixed Count: ${Math.round(childWindow.count)})`,
          `${dimension} uses Fit Children`,
        ],
      },
    };
  };
  const widthLock: PropertyLockState | null =
    childWindowLock('x', widthMode, resolved.x) ??
    (!widthOverride && widthMode === 'custom'
      ? null
      : {
          locked: true,
          value: widthOverride?.value ?? resolved.x,
          override: {
            source: widthModeOverride?.source ?? widthOverride?.source ?? humanizeFieldKey(widthMode),
            type: widthModeOverride?.type ?? widthOverride?.type ?? 'layout',
            chain: widthModeOverride?.chain ?? widthOverride?.chain,
          },
        });
  const heightLock: PropertyLockState | null =
    childWindowLock('y', heightMode, resolved.y) ??
    (!heightOverride && heightMode === 'custom'
      ? null
      : {
          locked: true,
          value: heightOverride?.value ?? resolved.y,
          override: {
            source:
              heightModeOverride?.source ??
              heightOverride?.source ??
              (rowHeightManaged ? 'Caption Layout' : humanizeFieldKey(heightMode)),
            type: heightModeOverride?.type ?? heightOverride?.type ?? 'layout',
            chain: heightModeOverride?.chain ?? heightOverride?.chain,
          },
        });

  return (
    <InspectorPropertyAnchor scopeKey={overrideScopeKey} propertyPath={['dimensions']}>
      <AnimationTrackLabelExtra scopeKey={overrideScopeKey} propertyPath={['dimensions']}>
        <FieldRow
          label="Dimensions"
          description="Choose an independent sizing mode for each axis."
          labelExtra={
            <TransitionPropertyAffordance
              label="Dimensions"
              transition={transition}
              currentValue={dimensions}
              leafType="vector2"
              meta={getFieldMeta('dimensions')}
              onChange={(next) => {
                const shared = next?.scope !== 'state';
                const stateApplied =
                  shared &&
                  stateApplySuggestion?.applyTransitionToStates(
                    { scopeKey: overrideScopeKey, propertyPath: ['dimensions'] },
                    next,
                  );
                if (stateApplied) return;
                onUpdate((previous) => {
                  const current = previous.props.dimensions;
                  return current?.kind === 'leaf'
                    ? { ...previous, props: { ...previous.props, dimensions: { ...current, transition: next } } }
                    : previous;
                });
              }}
            />
          }
        >
          <div className="flex flex-col gap-2">
            <AxisDimensionRow
              axis="x"
              mode={widthMode}
              value={dimensions.x}
              resolvedValue={resolved.x}
              unit={widthUnit}
              modeKey="widthMode"
              overrideScopeKey={overrideScopeKey}
              onModeChange={(next) =>
                onUpdate((previous) => {
                  const withMode = updateStringLeaf(previous, 'widthMode', next);
                  if (entityKind !== 'page' || next !== 'custom') return withMode;
                  const current = dimensionsValue(previous);
                  return updateDimensionsLeaf(withMode, {
                    ...current,
                    x: widthUnit === 'pt' ? Math.max(current.x, pageMinimumWidth ?? 0) : current.x,
                  });
                })
              }
              onValueChange={(next) =>
                onUpdate((previous) => {
                  const current = dimensionsValue(previous);
                  return updateDimensionsLeaf(previous, {
                    ...current,
                    x: widthUnit === 'pt' ? Math.max(next, pageMinimumWidth ?? 0) : next,
                  });
                })
              }
              onUnitChange={(next) => onUpdate((previous) => updateDimensionUnit(previous, 'widthUnit', 'x', next))}
              lock={widthLock}
              minimumValue={widthUnit === 'pt' ? pageMinimumWidth : undefined}
              allowModeChange={entityKind === 'page' || canChangeResolvedMode(widthModeOverride)}
            />
            <AxisDimensionRow
              axis="y"
              mode={heightMode}
              value={dimensions.y}
              resolvedValue={resolved.y}
              unit={heightUnit}
              modeKey="heightMode"
              overrideScopeKey={overrideScopeKey}
              onModeChange={(next) =>
                onUpdate((previous) => {
                  const withMode = updateStringLeaf(previous, 'heightMode', next);
                  if (entityKind !== 'page' || next !== 'custom') return withMode;
                  const current = dimensionsValue(previous);
                  return updateDimensionsLeaf(withMode, {
                    ...current,
                    y: heightUnit === 'pt' ? Math.max(current.y, pageMinimumHeight ?? 0) : current.y,
                  });
                })
              }
              onValueChange={(next) =>
                onUpdate((previous) => {
                  const current = dimensionsValue(previous);
                  return updateDimensionsLeaf(previous, {
                    ...current,
                    y: heightUnit === 'pt' ? Math.max(next, pageMinimumHeight ?? 0) : next,
                  });
                })
              }
              onUnitChange={(next) => onUpdate((previous) => updateDimensionUnit(previous, 'heightUnit', 'y', next))}
              lock={heightLock}
              minimumValue={heightUnit === 'pt' ? pageMinimumHeight : undefined}
              allowModeChange={entityKind === 'page' || canChangeResolvedMode(heightModeOverride)}
            />
          </div>
        </FieldRow>
      </AnimationTrackLabelExtra>
    </InspectorPropertyAnchor>
  );
}

export function TransformEditor({
  component,
  onUpdate,
  onDelete,
  dragHandle,
  stateKeyPrefix,
  entityKind,
  positionPreviewTarget,
  pinnedPositionPreviewTarget,
  onHoverPositionPreviewTarget,
  onTogglePositionPreviewTarget,
  resolvedTransform,
  positioningLocked,
  entity,
  componentParentPath,
  copyPasteActions = [],
}: {
  component: EcsComponentDoc;
  onUpdate: (updater: (previous: EcsComponentDoc) => EcsComponentDoc) => void;
  onDelete?: () => void;
  dragHandle?: ReactNode;
  stateKeyPrefix: string;
  entityKind: DebugEntityKind | null;
  positionPreviewTarget: PositionPreviewTarget | null;
  pinnedPositionPreviewTarget: PositionPreviewTarget | null;
  onHoverPositionPreviewTarget: (target: PositionPreviewTarget | null) => void;
  onTogglePositionPreviewTarget: (target: PositionPreviewTarget) => void;
  resolvedTransform: CaptionDebugTransform | null;
  positioningLocked: boolean;
  entity?: EcsEntityDoc;
  componentParentPath?: readonly string[];
  copyPasteActions?: readonly InspectorHeaderAction[];
}): ReactNode {
  const title = humanizeFieldKey(component.component);
  const canDelete = Boolean(isComponentDeletable(component) && onDelete);
  const positioningValue = leafValue(component, 'positioning');
  const positioning: TransformPositioning =
    typeof positioningValue === 'string' && POSITIONING_OPTIONS.includes(positioningValue as TransformPositioning)
      ? (positioningValue as TransformPositioning)
      : 'flow';
  const position = vector2ValueFromNode(component.props.position) ?? { x: 0, y: 0 };
  const positionXUnit = positionUnitValue(component, 'positionXUnit');
  const positionYUnit = positionUnitValue(component, 'positionYUnit');
  const resolvedPosition = resolvedTransform?.positionAnchor ?? position;
  const positionOverride = resolvedTransform?.propertyOverrides?.['transform.position'];
  const positionXOverride = resolvedTransform?.propertyOverrides?.['transform.position.x'];
  const positionYOverride = resolvedTransform?.propertyOverrides?.['transform.position.y'];
  const resolvedPropertyPosition = vectorValue(
    positionOverride?.value ?? {
      x: positionXOverride?.value,
      y: positionYOverride?.value,
    },
    resolvedPosition,
  );
  const positionDriven =
    resolvedTransform?.drivenBy !== undefined ||
    positionOverride !== undefined ||
    positionXOverride !== undefined ||
    positionYOverride !== undefined;
  const positionLockState: PropertyLockState | null =
    positionDriven || positioningLocked
      ? {
          locked: true,
          value: resolvedPropertyPosition,
          override: {
            source: positionOverride?.source ?? resolvedTransform?.drivenBy ?? 'Follow Target',
            type: positionOverride?.type ?? 'component',
            chain: positionOverride?.chain,
          },
        }
      : null;
  const positionLock: PropertyLock | null =
    positionXOverride || positionYOverride
      ? {
          ...(positionXOverride
            ? {
                x: {
                  locked: true,
                  value: positionXOverride.value,
                  override: {
                    source: positionXOverride.source,
                    type: positionXOverride.type,
                    chain: positionXOverride.chain,
                  },
                },
              }
            : {}),
          ...(positionYOverride
            ? {
                y: {
                  locked: true,
                  value: positionYOverride.value,
                  override: {
                    source: positionYOverride.source,
                    type: positionYOverride.type,
                    chain: positionYOverride.chain,
                  },
                },
              }
            : {}),
        }
      : positionLockState;
  const positionDisplayValue = positionLock ? resolvedPropertyPosition : position;
  const positionDisplayUnit = {
    x: propertyLockForAxis(positionLock, 'x')?.locked ? 'pt' : positionXUnit,
    y: propertyLockForAxis(positionLock, 'y')?.locked ? 'pt' : positionYUnit,
  } satisfies { x: DimensionUnit; y: DimensionUnit };
  const positionProps = Object.fromEntries(Object.entries(component.props).filter(([key]) => key === 'position'));
  const restProps = Object.fromEntries(
    Object.entries(component.props).filter(
      ([key]) =>
        key !== 'positioning' &&
        key !== 'position' &&
        key !== 'positionXUnit' &&
        key !== 'positionYUnit' &&
        key !== 'dimensions' &&
        key !== 'widthUnit' &&
        key !== 'heightUnit' &&
        key !== 'widthMode' &&
        key !== 'heightMode',
    ),
  );
  const positionNode: ContainerNode = { kind: 'container', wrapping: 'inline', children: positionProps };
  const restNode: ContainerNode = { kind: 'container', wrapping: 'inline', children: restProps };
  const fieldOverrides = {
    position: {
      value: positionDisplayValue,
      lock: positionLock,
      axisInlineEndContent: {
        x: (disabled: boolean) => (
          <DimensionUnitSelect
            value={positionDisplayUnit.x}
            onChange={(next) => onUpdate((previous) => updatePositionUnit(previous, 'positionXUnit', next))}
            disabled={disabled}
            ariaLabel="Position X unit"
          />
        ),
        y: (disabled: boolean) => (
          <DimensionUnitSelect
            value={positionDisplayUnit.y}
            onChange={(next) => onUpdate((previous) => updatePositionUnit(previous, 'positionYUnit', next))}
            disabled={disabled}
            ariaLabel="Position Y unit"
          />
        ),
      },
      axisInlineEndContentInteractive: true,
      axisLayout: 'column' as const,
      supportsStatePersistence: entityKind === 'row' && entity?.id.toLowerCase() === 'row:current',
      labelPrefix: entityKind ? (
        <PositionPreviewIcon
          target={{ kind: entityKind, value: position }}
          active={
            positionPreviewTarget?.kind === entityKind &&
            positionPreviewTarget.value.x === position.x &&
            positionPreviewTarget.value.y === position.y
          }
          pinned={positionPreviewTargetsEqual(pinnedPositionPreviewTarget, { kind: entityKind, value: position })}
          onHoverTarget={onHoverPositionPreviewTarget}
          onToggleTarget={onTogglePositionPreviewTarget}
        />
      ) : undefined,
    },
  };
  const addEffectAction = componentEffectsAddAction(
    component,
    (template) =>
      onUpdate((previous) => ({
        ...previous,
        effects: [
          ...previous.effects,
          ...instantiateEffectTemplateWithDependencies(
            template,
            entity ? effectScopeForEntity(entity.entity, entity.id) : undefined,
          ),
        ],
      })),
    entity && componentParentPath ? { entity, componentParentPath } : undefined,
  );
  const deleteAction = canDelete ? createInspectorDeleteAction(title, () => onDelete?.()) : undefined;
  const headerExtra = (
    <>
      {dragHandle}
      <InspectorHeaderOptions
        ariaLabel={`${title} options`}
        primaryAction={addEffectAction}
        actions={[...copyPasteActions, ...(deleteAction ? [deleteAction] : [])]}
      />
    </>
  );

  return (
    <CollapsibleCard
      title={title}
      titleHelp={getComponentDescription('transform')}
      compactHeader
      headerExtra={headerExtra}
      titleIcon={headerIconForComponent(component.component)}
      stateKey={stateKeyPrefix}
    >
      <FieldRow
        label="Positioning"
        description="Flow places this entity in its parent layout. Absolute removes it from normal flow and uses Position."
        lock={
          positioningLocked
            ? {
                locked: true,
                value: 'absolute',
                override: { source: 'Follow Target', type: 'component' },
              }
            : null
        }
      >
        <Select
          value={positioningLocked ? 'absolute' : positioning}
          onValueChange={(value) =>
            onUpdate((previous) => updateStringLeaf(previous, 'positioning', value as TransformPositioning))
          }
          disabled={positioningLocked}
        >
          <SelectTrigger className="h-8 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {POSITIONING_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {humanizeFieldKey(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>
      <div className="mt-2 border-border border-t pt-2">
        <FieldOverridesContext.Provider value={fieldOverrides}>
          <PropertyTreeView
            node={positionNode}
            fieldKey="transform"
            stateKeyPrefix={stateKeyPrefix}
            onChange={(updater) =>
              onUpdate((previous) => {
                const next = updater(positionNode);
                return next.kind === 'container'
                  ? { ...previous, props: { ...previous.props, ...next.children } }
                  : previous;
              })
            }
          />
          <DimensionsEditor
            component={component}
            resolvedTransform={resolvedTransform}
            entityKind={entityKind}
            entity={entity}
            overrideScopeKey={stateKeyPrefix}
            onUpdate={onUpdate}
          />
          <PropertyTreeView
            node={restNode}
            fieldKey="transform"
            stateKeyPrefix={stateKeyPrefix}
            onChange={(updater) =>
              onUpdate((previous) => {
                const next = updater(restNode);
                return next.kind === 'container'
                  ? { ...previous, props: { ...previous.props, ...next.children } }
                  : previous;
              })
            }
          />
        </FieldOverridesContext.Provider>
      </div>
    </CollapsibleCard>
  );
}
