import { memo, type ReactNode, useCallback, useContext, useMemo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ClipboardPaste, Copy, GripVertical, Layers2 } from 'lucide-react';

import {
  EFFECT_TEMPLATES,
  getEffectDescription,
  hiddenPropertyKeysForEffect,
  normalizeReplicatorProps,
  isStateGroupId,
  type EcsComponentDoc,
  type EcsEffectDoc,
  type EcsEntityDoc,
  type PropertyNode,
} from '@/schema';
import type { CaptionDebugPropertyOverride } from '@captioncat/caption-engine/browser';
import { solidPaint } from '@/schema/paint';
import { humanizeFieldKey } from '@/ui/controls/field-row';
import { INSPECTOR_CARD_DRAG_HANDLE_CLASS } from '@/ui/controls/inspector-layout';
import { mutedActionButtonClass } from '@/ui/controls/muted-action-button';
import { isPropertyLockState } from '@/ui/controls/property-lock';
import {
  createInspectorDeleteAction,
  InspectorHeaderOptions,
  type InspectorHeaderAction,
} from '@/ui/controls/inspector-header-options';
import {
  CollapsibleCard,
  effectHeaderBadge,
  FieldOverridesContext,
  type FieldOverride,
  InspectorPropertyAnchor,
  PaintCapabilitiesContext,
  paintCapabilitiesForOwner,
  PropertyTreeView,
  type DependentFieldGroup,
} from '@/ui/panels/property-tree-view';

import { entityTitle, propsToContainer } from '../entity-tree';
import { ComponentCopyPasteContext } from '../component-copy-paste-context';
import { formatPasteActionLabel } from '../component-copy-paste';
import {
  BASE_EFFECT_OWNER,
  effectFieldOverridesForOwner,
  INHERITED_PAINT_FIELDS,
  type EffectOwnerContext,
} from './effect-label';
import { DISABLED_DEPENDENCY_OPACITY } from './disabled-state';
import { ReplicatorEffectEditor } from './replicator-effect-editor';
import { StateApplySuggestionContext } from './state-apply-suggestion-context';
import { createStateApplyAction } from './state-apply-suggestion';
import { TypewriterEffectEditor } from './typewriter-effect-editor';

/** Border/Stroke `style` props keep their own line-style choices despite reusing Font's shared `style` field key. */
const FIELD_OVERRIDES_BY_EFFECT: Record<string, Record<string, FieldOverride>> = {
  border: { style: { options: ['solid', 'dashed', 'dotted'] } },
  stroke: {
    style: { options: ['solid', 'dashed', 'dotted'] },
  },
  fisheye: {
    mode: {
      label: 'Mode',
      options: ['concave', 'convex'],
      optionLabels: {
        concave: 'Concave',
        convex: 'Convex',
      },
      description: 'Choose whether the lens pushes the image inward or outward.',
    },
  },
  glow: {
    mode: {
      label: 'Glow Mode',
      options: ['outer', 'inner'],
      optionLabels: {
        outer: 'Outer',
        inner: 'Inner',
      },
      description: 'Choose whether the glow appears outside or inside the painted shape.',
    },
  },
};

/** Change to `after` when effect badges must follow their titles. */
const EFFECT_HEADER_BADGE_POSITION: 'before' | 'after' = 'before';

function strokeLeaf(type: 'boolean' | 'string' | 'number' | 'paint', value: unknown): PropertyNode {
  return { kind: 'leaf', type, value };
}

function booleanPropEnabled(props: Record<string, PropertyNode>, key: string): boolean {
  const node = props[key];
  return node?.kind === 'leaf' && node.type === 'boolean' && Boolean(node.value);
}

function fontSizeForEntity(entity: EcsEntityDoc): number | undefined {
  const font = entity.components.find((component) => component.component === 'font');
  const size = font?.props.size;
  return size?.kind === 'leaf' && typeof size.value === 'number' && Number.isFinite(size.value) && size.value > 0
    ? size.value
    : undefined;
}

function lockFromResolved(resolved: CaptionDebugPropertyOverride) {
  return {
    locked: true as const,
    value: resolved.value,
    override: {
      source: resolved.source,
      type: resolved.type,
      chain: resolved.chain,
    },
  };
}

const DEFAULT_BORDER_PROPS: Record<string, PropertyNode> = {
  appliesOn: strokeLeaf('string', 'base'),
  enabled: strokeLeaf('boolean', true),
  width: strokeLeaf('number', 12),
  color: strokeLeaf('paint', solidPaint('#000000')),
  position: strokeLeaf('string', 'outer'),
  style: strokeLeaf('string', 'solid'),
};

const DEFAULT_STROKE_PROPS: Record<string, PropertyNode> = {
  appliesOn: strokeLeaf('string', 'base'),
  enabled: strokeLeaf('boolean', true),
  style: strokeLeaf('string', 'solid'),
  alignment: strokeLeaf('string', 'outside'),
  antialiasScale: strokeLeaf('number', 2),
  width: strokeLeaf('number', 12),
  color: strokeLeaf('paint', solidPaint('#00c853')),
  useFontColor: strokeLeaf('boolean', false),
  joinType: strokeLeaf('string', 'round'),
  capType: strokeLeaf('string', 'round'),
  dash: strokeLeaf('number', 24),
  gap: strokeLeaf('number', 24),
  spacing: strokeLeaf('number', 20),
  dashOffset: strokeLeaf('number', 0),
  opacity: strokeLeaf('number', 1),
};

function editablePropsForEffect(
  effect: EcsEffectDoc,
  hasPreviousEffect: boolean,
  entity: EcsEntityDoc,
): Record<string, PropertyNode> {
  const template = EFFECT_TEMPLATES.find((candidate) => candidate.effect === effect.effect);
  const defaults = template?.props ?? {};
  let merged =
    effect.effect === 'border'
      ? { ...DEFAULT_BORDER_PROPS, ...defaults, ...effect.props }
      : effect.effect === 'stroke'
        ? { ...DEFAULT_STROKE_PROPS, ...defaults, ...effect.props }
        : { ...defaults, ...effect.props };
  merged = { appliesOn: merged.appliesOn ?? strokeLeaf('string', 'base'), ...merged };
  if (!hasPreviousEffect && merged.appliesOn?.kind === 'leaf' && merged.appliesOn.value !== 'base') {
    merged.appliesOn = { ...merged.appliesOn, value: 'base' };
  }
  if (effect.effect === 'motionBlur' || effect.effect === 'streak') {
    const { appliesOn, enabled, steps, angle, distance, maxOpacity, showOriginal, ...rest } = merged;
    merged = {
      appliesOn,
      enabled,
      steps,
      angle,
      distance,
      maxOpacity,
      showOriginal,
      ...rest,
    };
  }
  if (effect.effect === 'typewriter') {
    merged = Object.fromEntries(Object.entries(merged).filter(([key]) => key !== 'appliesOn'));
  }
  if (effect.effect !== 'stroke') return merged;
  const hidden = hiddenPropertyKeysForEffect(effect, entity, merged);
  return Object.fromEntries(Object.entries(merged).filter(([key]) => !hidden.has(key)));
}

/**
 * Editor for a single post-paint effect, such as `blur`, `motionBlur`, or
 * `streak`. Its leaf `props` render inline. `id` is the effect's authored stable identity.
 * dragging the grip handle reorders the component's `effects` array, which is
 * what the engine applies in order.
 * Omit `id` for read-only or non-reorderable uses, such as an entity's own
 * top-level effects list. The drag handle appears only when `id` is set.
 */
interface EffectEditorProps {
  id?: string;
  effect: EcsEffectDoc;
  entity: EcsEntityDoc;
  ownerComponent?: EcsComponentDoc;
  ownerComponentPath?: readonly string[];
  effectIndex: number;
  displayLabel?: string;
  onUpdate: (updater: (previous: EcsEffectDoc) => EcsEffectDoc) => void;
  onDelete?: () => void;
  stateKeyPrefix: string;
  hasPreviousEffect?: boolean;
  owner?: EffectOwnerContext;
  containerRef?: (element: HTMLDivElement | null) => void;
  dependencyLabel?: string;
  ownerComponentDisabled?: boolean;
  isDisabledByParent?: boolean;
  resolvedPropertyOverrides?: Readonly<Record<string, CaptionDebugPropertyOverride>>;
  resolvedPropertyPrefix?: string;
}

function areEffectEditorPropsEqual(previous: EffectEditorProps, next: EffectEditorProps): boolean {
  return (
    previous.id === next.id &&
    previous.effect === next.effect &&
    previous.entity === next.entity &&
    previous.ownerComponent === next.ownerComponent &&
    previous.ownerComponentPath === next.ownerComponentPath &&
    previous.effectIndex === next.effectIndex &&
    previous.displayLabel === next.displayLabel &&
    previous.stateKeyPrefix === next.stateKeyPrefix &&
    previous.onUpdate === next.onUpdate &&
    previous.onDelete === next.onDelete &&
    previous.hasPreviousEffect === next.hasPreviousEffect &&
    previous.owner === next.owner &&
    previous.dependencyLabel === next.dependencyLabel &&
    previous.ownerComponentDisabled === next.ownerComponentDisabled &&
    previous.isDisabledByParent === next.isDisabledByParent &&
    previous.resolvedPropertyOverrides === next.resolvedPropertyOverrides &&
    previous.resolvedPropertyPrefix === next.resolvedPropertyPrefix
  );
}

export const EffectEditor = memo(function EffectEditor({
  id,
  effect,
  entity,
  ownerComponent,
  ownerComponentPath,
  displayLabel,
  onUpdate,
  onDelete,
  stateKeyPrefix,
  hasPreviousEffect = true,
  owner = BASE_EFFECT_OWNER,
  containerRef,
  dependencyLabel,
  ownerComponentDisabled = false,
  isDisabledByParent = false,
  resolvedPropertyOverrides,
  resolvedPropertyPrefix,
}: EffectEditorProps): ReactNode {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: id ?? stateKeyPrefix });
  const title = displayLabel ?? humanizeFieldKey(effect.effect);
  const componentCopyPaste = useContext(ComponentCopyPasteContext);
  const stateApplySuggestion = useContext(StateApplySuggestionContext);
  const applyEffectUpdate = useCallback(
    (updater: (previous: EcsEffectDoc) => EcsEffectDoc) => {
      stateApplySuggestion?.reportEffectChange(stateKeyPrefix, effect, updater, hasPreviousEffect);
      onUpdate(updater);
    },
    [effect, hasPreviousEffect, onUpdate, stateApplySuggestion, stateKeyPrefix],
  );
  const editableProps = useMemo(
    () => editablePropsForEffect(effect, hasPreviousEffect, entity),
    [effect, entity, hasPreviousEffect],
  );
  const enabledNode = editableProps.enabled;
  const hasEnabledToggle = !dependencyLabel && enabledNode?.kind === 'leaf' && enabledNode.type === 'boolean';
  const enabledValue = hasEnabledToggle ? Boolean(enabledNode.value) : undefined;
  const bodyProps = useMemo(
    () =>
      hasEnabledToggle || dependencyLabel
        ? Object.fromEntries(Object.entries(editableProps).filter(([key]) => key !== 'enabled'))
        : editableProps,
    [dependencyLabel, editableProps, hasEnabledToggle],
  );
  const hasProps = Object.keys(bodyProps).length > 0;
  const dependentFieldGroups: Readonly<Record<string, DependentFieldGroup | readonly string[]>> | undefined =
    effect.effect === 'flicker'
      ? {
          showOriginal: {
            fields: ['showOriginalDuringOff'],
            isVisible: (controller: PropertyNode) =>
              controller.kind === 'leaf' && (controller.value === 'front' || controller.value === 'back'),
          },
          updateMode: {
            fields: ['maxOffDuration'],
            isVisible: (controller: PropertyNode) =>
              controller.kind === 'leaf' && controller.value === 'randomFrames',
          },
        }
      : effect.effect === 'wipeReveal'
        ? {
            shape: ['angle'],
            basePlacement: ['fromStyle'],
          }
        : undefined;
  const hiddenFieldKeys = new Set(hiddenPropertyKeysForEffect(effect, entity, bodyProps));
  if (effect.dependencyOf) hiddenFieldKeys.add('appliesOn');
  const inheritedPaintState = useMemo(() => {
    const overrides: Record<string, FieldOverride> = {};
    for (const descriptor of INHERITED_PAINT_FIELDS) {
      if (!booleanPropEnabled(editableProps, descriptor.toggleKey)) continue;
      const sourcePaint = descriptor.resolveSourcePaint(owner);
      if (sourcePaint) {
        overrides[descriptor.valueKey] = {
          value: sourcePaint,
          lock: {
            locked: true,
            value: sourcePaint,
            override: { source: owner.colorSourceName, type: 'inherited' },
          },
        };
      }
    }
    return { overrides };
  }, [editableProps, owner]);
  const fieldOverrides = useMemo<Record<string, FieldOverride>>(() => {
    const overrides: Record<string, FieldOverride> = {};
    for (const [key, resolved] of Object.entries(resolvedPropertyOverrides ?? {})) {
      const prefixes = [
        `${resolvedPropertyPrefix ? `${resolvedPropertyPrefix}.` : ''}effect:${effect.effect}[`,
        `effect:${effect.effect}[`,
      ];
      const prefix = prefixes.find((candidate) => key.startsWith(candidate));
      if (!prefix) continue;
      const separator = key.indexOf('].', prefix.length - 1);
      if (separator < 0) continue;
      const fieldKey = key.slice(separator + 2);
      const axisMatch = fieldKey.match(/^(.*)\.(x|y)$/);
      const axisFieldKey = axisMatch?.[1];
      const axis = axisMatch?.[2];
      const axisNode = axisFieldKey ? bodyProps[axisFieldKey] : undefined;
      if (axisFieldKey && (axis === 'x' || axis === 'y') && axisNode?.kind === 'leaf' && axisNode.type === 'vector2') {
        const current = overrides[axisFieldKey];
        const currentLock = current?.lock;
        const axisLocks = isPropertyLockState(currentLock)
          ? { x: currentLock, y: currentLock }
          : { ...(currentLock ?? {}) };
        axisLocks[axis] = lockFromResolved(resolved);
        overrides[axisFieldKey] = {
          ...current,
          value: current?.value ?? axisNode.value,
          lock: axisLocks,
        };
        continue;
      }
      overrides[fieldKey] = {
        value: resolved.value,
        lock: lockFromResolved(resolved),
      };
    }
    return {
      ...overrides,
      ...(FIELD_OVERRIDES_BY_EFFECT[effect.effect] ?? {}),
      ...effectFieldOverridesForOwner(owner),
      ...inheritedPaintState.overrides,
      appliesOn: { options: hasPreviousEffect ? (['base', 'previousEffect'] as const) : (['base'] as const) },
      ...(effect.effect === 'motionBlur' || effect.effect === 'streak'
        ? {
            steps: {
              label: effect.effect === 'motionBlur' ? 'Blur Amount' : 'Trail Amount',
              description:
                effect.effect === 'motionBlur'
                  ? 'Set the blur amount. Zero turns the effect off. One adds a light blur.'
                  : 'Set the trail amount. Zero turns the effect off. One adds a short trail.',
            },
            distance: {
              label: 'Distance',
              description: 'Set the length of the blur or trail. The Angle field controls its direction.',
            },
          }
        : {}),
      ...(effect.effect === 'wipeReveal'
        ? {
            reveal: {
              label: 'Reveal',
              min: 0,
              max: 1,
              step: 0.01,
              description: 'Controls the visible portion of the target style. The linked Animation component controls this value over time.',
            },
            direction: {
              label: 'Direction',
              options: ['logicalStartToEnd', 'logicalEndToStart', 'leftToRight', 'rightToLeft', 'topToBottom', 'bottomToTop'],
              optionLabels: {
                logicalStartToEnd: 'Logical Start to End',
                logicalEndToStart: 'Logical End to Start',
                leftToRight: 'Left to Right',
                rightToLeft: 'Right to Left',
                topToBottom: 'Top to Bottom',
                bottomToTop: 'Bottom to Top',
              },
              description: 'Sets the direction in which the target style appears. Logical directions follow the resolved text direction.',
            },
            shape: {
              label: 'Shape',
              options: ['rectangle', 'diagonal'],
              optionLabels: { rectangle: 'Rectangle', diagonal: 'Diagonal' },
              description: 'Selects the mask shape used to reveal the target style.',
            },
            angle: {
              label: 'Angle',
              min: -180,
              max: 180,
              step: 1,
              unit: '\u00b0',
              description: 'Rotates a diagonal mask around the entity center.',
            },
            feather: {
              label: 'Feather',
              min: 0,
              max: 200,
              step: 1,
              unit: 'pt',
              description: 'Softens the mask edge. A value of zero creates a hard edge.',
            },
            fromStyle: {
              label: 'From Style',
              options: ['none', 'default', 'past', 'previous', 'current', 'next', 'future'],
              optionLabels: {
                none: 'Transparent',
                default: 'Default',
                past: 'Past',
                previous: 'Previous',
                current: 'Current',
                next: 'Next',
                future: 'Future',
              },
              description: 'Selects the base style for the unrevealed area. Next is the default for an incoming current style.',
            },
            toStyle: {
              label: 'To Style',
              options: ['default', 'past', 'previous', 'current', 'next', 'future'],
              optionLabels: {
                default: 'Default',
                past: 'Past',
                previous: 'Previous',
                current: 'Current',
                next: 'Next',
                future: 'Future',
              },
              description: 'Selects the style exposed by the mask. Current is the default target style.',
            },
            basePlacement: {
              label: 'Base Placement',
              options: ['back', 'front', 'none'],
              optionLabels: { back: 'Behind Target', front: 'In Front of Target', none: 'None' },
              description: 'Places the base style behind or in front of the masked target. Behind Target replaces it as the reveal advances. None leaves the outside transparent.',
            },
          }
        : {}),
    };
  }, [
    bodyProps,
    effect,
    hasPreviousEffect,
    inheritedPaintState.overrides,
    owner,
    resolvedPropertyOverrides,
    resolvedPropertyPrefix,
  ]);
  const enabledLock = fieldOverrides.enabled?.lock ?? null;
  const enabledLockState = isPropertyLockState(enabledLock) ? enabledLock : null;
  const resolvedEnabledValue = enabledLockState?.locked ? Boolean(enabledLockState.value) : enabledValue;
  const paintCapabilities = useMemo(() => paintCapabilitiesForOwner(effect.effect), [effect.effect]);

  const updateProps = (updater: (previous: PropertyNode) => PropertyNode) =>
    applyEffectUpdate((prev) => {
      const previousEditableProps = editablePropsForEffect(prev, hasPreviousEffect, entity);
      const next = updater(propsToContainer(previousEditableProps));
      if (next.kind !== 'container') return prev;
      const props =
        prev.effect === 'replicator' ? normalizeReplicatorProps({ ...prev.props, ...next.children }) : { ...prev.props, ...next.children };
      return {
        ...prev,
        props,
      };
    });

  const setEnabled = (next: boolean) =>
    applyEffectUpdate((prev) => {
      const current = editablePropsForEffect(prev, hasPreviousEffect, entity).enabled;
      if (!current || current.kind !== 'leaf' || current.type !== 'boolean') return prev;
      if (Boolean(current.value) === next && prev.props.enabled) return prev;
      return { ...prev, props: { ...prev.props, enabled: { ...current, value: next } } };
    });

  const pasteTarget = {
    effectId: effect.id,
    ownerComponentType: ownerComponent?.component,
    ownerComponentPath,
    ownerComponentStudioId: ownerComponent?.studioId,
  };
  const copyAction: InspectorHeaderAction | undefined = componentCopyPaste
    ? {
        id: 'copy',
        label: `Copy ${title}`,
        menuLabel: 'Copy',
        tooltip: `Copy ${title}`,
        icon: Copy,
        onSelect: () =>
          componentCopyPaste.copyEffect(
            {
              entity,
              effect,
              itemLabel: title,
              ownerComponent,
              ownerComponentPath,
            },
            entityTitle(entity),
          ),
      }
    : undefined;
  const pasteAction: InspectorHeaderAction | undefined =
    componentCopyPaste?.canPasteEffect(entity, pasteTarget, effect.effect)
      ? {
          id: 'paste',
          label: formatPasteActionLabel(
            title,
            componentCopyPaste.payload?.sourceEntityLabel ?? 'source entity',
          ),
          tooltip: `${formatPasteActionLabel(
            title,
            componentCopyPaste.payload?.sourceEntityLabel ?? 'source entity',
          )}\nSource ID: ${componentCopyPaste.payload?.sourceEntityId ?? 'unknown'}`,
          icon: ClipboardPaste,
          confirmation: {
            title: `Replace ${title}?`,
            description: `Replace the current ${title} with the copied version from ${
              componentCopyPaste.payload?.sourceEntityLabel ?? 'source entity'
            }.`,
            confirmLabel: 'Paste',
          },
          onSelect: () => componentCopyPaste.pasteEffect(entity.id, pasteTarget),
        }
      : undefined;
  const duplicateAction: InspectorHeaderAction | undefined =
    !dependencyLabel && componentCopyPaste?.canDuplicateEffect(entity, pasteTarget)
      ? {
          id: 'duplicate',
          label: 'Duplicate',
          tooltip: `Duplicate ${title}`,
          icon: Layers2,
          onSelect: () => componentCopyPaste.duplicateEffect(entity.id, pasteTarget),
        }
      : undefined;
  const copyPasteActions = [copyAction, pasteAction].filter(
    (action): action is InspectorHeaderAction => action !== undefined,
  );
  const stateApplyAction = isStateGroupId(entity.id)
    ? createStateApplyAction(stateKeyPrefix, undefined, stateApplySuggestion, effect)
    : undefined;

  const headerExtra = (
    <>
      {id && (
        <button
          type="button"
          aria-label={`Drag ${title} to reorder`}
          onClick={(e) => e.stopPropagation()}
          className={mutedActionButtonClass(
            'single',
            'plain',
            `${INSPECTOR_CARD_DRAG_HANDLE_CLASS} -m-1 cursor-grab active:cursor-grabbing`,
          )}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" />
        </button>
      )}
      <InspectorPropertyAnchor scopeKey={stateKeyPrefix} propertyPath={['enabled']}>
        {null}
      </InspectorPropertyAnchor>
      <InspectorHeaderOptions
        ariaLabel={`${title} options`}
        actions={[
          ...copyPasteActions,
          ...(duplicateAction ? [duplicateAction] : []),
          ...(stateApplyAction ? [stateApplyAction] : []),
          ...(!dependencyLabel && onDelete ? [createInspectorDeleteAction(title, onDelete)] : []),
        ]}
        menuLabel={dependencyLabel ? `Required by ${dependencyLabel}` : undefined}
      />
    </>
  );

  return (
    <PaintCapabilitiesContext.Provider value={paintCapabilities}>
      <div
      ref={(element) => {
        containerRef?.(element);
        if (id) setNodeRef(element);
      }}
      className={
       id && isDragging
         ? 'relative z-10 w-full min-w-0 scroll-mt-6 opacity-70 transition-opacity duration-200 ease-in-out'
         : 'relative w-full min-w-0 scroll-mt-6 transition-opacity duration-200 ease-in-out'
      }
      style={{
        ...(id ? { transform: CSS.Translate.toString(transform ? { ...transform, x: 0 } : null), transition } : {}),
        ...(ownerComponentDisabled || isDisabledByParent ? { opacity: DISABLED_DEPENDENCY_OPACITY } : {}),
      }}
    >
      <CollapsibleCard
        title={title}
        titleHelp={getEffectDescription(effect.effect)}
        titleIcon={effectHeaderBadge()}
        titleIconPosition={EFFECT_HEADER_BADGE_POSITION}
        compactHeader
        enabled={resolvedEnabledValue}
        onEnabledChange={hasEnabledToggle ? setEnabled : undefined}
        enabledLock={enabledLockState}
        headerExtra={headerExtra}
        stateKey={stateKeyPrefix}
      >
        {effect.effect === 'replicator' ? (
          <ReplicatorEffectEditor
            props={bodyProps}
            stateKeyPrefix={stateKeyPrefix}
            fieldOverrides={fieldOverrides}
            onChange={(updater) =>
              updateProps((previous) => {
                if (previous.kind !== 'container') return previous;
                const bodyPrevious = Object.fromEntries(
                  Object.entries(previous.children).filter(([key]) => key !== 'enabled'),
                ) as Record<string, PropertyNode>;
                return propsToContainer(updater(bodyPrevious));
              })
            }
          />
        ) : effect.effect === 'typewriter' ? (
          <TypewriterEffectEditor
            props={bodyProps}
            stateKeyPrefix={stateKeyPrefix}
            fieldOverrides={fieldOverrides}
            fontSize={fontSizeForEntity(entity)}
            onChange={updateProps}
          />
        ) : hasProps ? (
          <FieldOverridesContext.Provider value={fieldOverrides}>
            <PropertyTreeView
              node={propsToContainer(bodyProps)}
              fieldKey={effect.effect}
              stateKeyPrefix={stateKeyPrefix}
              hiddenFieldKeys={hiddenFieldKeys}
              dependentFieldGroups={dependentFieldGroups}
              onChange={updateProps}
            />
          </FieldOverridesContext.Provider>
        ) : (
          <p className="text-muted-foreground text-xs">No configurable properties.</p>
        )}
      </CollapsibleCard>
      </div>
    </PaintCapabilitiesContext.Provider>
  );
}, areEffectEditorPropsEqual);
