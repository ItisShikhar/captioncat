import { ClipboardPaste, Copy, Layers2 } from 'lucide-react';
import { memo, useCallback, useContext, useMemo, type ReactNode } from 'react';

import type { CaptionDebugPropertyOverride, CaptionDebugTransform } from '@captioncat/caption-engine/browser';
import { resolveFontEmojiSettings } from '@captioncat/caption-engine/browser';
import { cn } from '@/lib/utils';
import type { ContainerNode, EcsComponentDoc, EcsEntityDoc, PropertyNode } from '@/schema';
import {
  getComponentDescription,
  hiddenPropertyKeysForComponent,
  instantiateEffectTemplateWithDependencies,
  effectScopeForEntity,
  isStateGroupId,
  LAYOUT_MOTION_PAGE_FLOW_DIRECTIONS,
  LAYOUT_MOTION_PAGE_FOCUS_POSITIONS,
  LAYOUT_MOTION_ROW_FLOW_DIRECTIONS,
  LAYOUT_MOTION_ROW_FOCUS_POSITIONS,
  LAYOUT_MOTION_SCOPES,
  LAYOUT_MOTION_TYPES,
  layoutMotionModeForEntity,
  removeComponentWithDependencies,
} from '@/schema';
import { DependentSetting } from '@/ui/controls/dependent-setting';
import { humanizeFieldKey } from '@/ui/controls/field-row';
import { InfoTooltip } from '@/ui/controls/info-tooltip';
import {
  createInspectorDeleteAction,
  InspectorHeaderOptions,
  type InspectorHeaderAction,
} from '@/ui/controls/inspector-header-options';
import {
  INSPECTOR_LABELED_SECTION_VERTICAL_PADDING_CLASS,
  INSPECTOR_STACK_CLASS,
  INSPECTOR_STRUCTURAL_STACK_CLASS,
  INSPECTOR_DEPENDENT_SUBTREE_CLASS,
} from '@/ui/controls/inspector-layout';
import { SpacerBoundsContext } from '@/ui/controls/spacer-bounds';
import {
  FieldOverridesContext,
  headerIconForComponent,
  PaintCapabilitiesContext,
  paintCapabilitiesForOwner,
  PropertyCard,
  type FieldOverride,
} from '@/ui/panels/property-tree-view';
import {
  paddingPreviewValueFromNode,
  paddingPreviewTargetsEqual,
  type DebugEntityKind,
  type PaddingPreviewTarget,
  type PositionPreviewTarget,
} from '@/ui/preview/entity-debug';

import { formatPasteActionLabel } from '../component-copy-paste';
import { ComponentCopyPasteContext } from '../component-copy-paste-context';
import {
  appendInspectorStateKey,
  componentTypesInComponent,
  effectIdsInComponent,
  entityTitle,
  isComponentDeletable,
  propsToContainer,
  vector2ValueFromNode,
} from '../entity-tree';
import { PaddingPreviewIcon } from '../shared/padding-preview-icon';
import { AnimationComponentEditor } from './animation-component-editor';
import { BorderRadiusEditor } from './border-radius-editor';
import { componentEffectsAddAction, ComponentEffectsFooter } from './component-effects';
import { DISABLED_DEPENDENCY_OPACITY, isComponentDisabled, isComponentDisabledByDependency } from './disabled-state';
import { FollowTargetEditor } from './follow-target-editor';
import { ImageEditor } from './image-editor';
import { ImageSequencerEditor } from './image-sequencer-editor';
import { MarkerEditor } from './marker-editor';
import { resolveMarkerImageStyle } from './marker-style-source';
import { SortableComponentList } from './sortable-component-list';
import { createStateApplyAction } from './state-apply-suggestion';
import { StateApplySuggestionContext } from './state-apply-suggestion-context';
import { TransformEditor } from './transform-editor';

export function resolvedTransformForEntity(
  entity: EcsEntityDoc,
  transforms: readonly CaptionDebugTransform[] | null | undefined,
): CaptionDebugTransform | null {
  if (!transforms || transforms.length === 0) return null;
  return (
    transforms.find((transform) => transform.sourceId === entity.id) ??
    transforms.find((transform) => transform.id === entity.id) ??
    transforms.find((transform) => transform.entity === entity.entity) ??
    null
  );
}

function hasActiveFrames(component: EcsComponentDoc): boolean {
  const frames = component.props.frames;
  return frames?.kind === 'leaf' && Array.isArray(frames.value) && frames.value.length > 0;
}

function fontFamilyValue(node: PropertyNode): string | string[] | undefined {
  if (node.kind !== 'container') return undefined;
  const family = node.children.family;
  if (family?.kind !== 'leaf') return undefined;
  if (typeof family.value === 'string') return family.value;
  if (Array.isArray(family.value)) {
    return family.value.filter((value): value is string => typeof value === 'string');
  }
  return undefined;
}

function primaryFontFamilyKey(value: string | string[] | undefined): string {
  const families = Array.isArray(value) ? value : [value];
  return (
    families
      .find((family): family is string => typeof family === 'string' && family.trim().length > 0)
      ?.trim()
      .toLowerCase() ??
    ''
  );
}

function synchronizeFontEmojiSettings(previous: ContainerNode, next: ContainerNode): ContainerNode {
  if (primaryFontFamilyKey(fontFamilyValue(previous)) === primaryFontFamilyKey(fontFamilyValue(next))) return next;

  const emojis = next.children.emojis;
  if (emojis?.kind !== 'container') return next;
  const settings = resolveFontEmojiSettings(fontFamilyValue(next));
  const emojiChildren = { ...emojis.children };
  const settingKeys = ['sizeScale', 'alignmentMode', 'baselineOffset'] as const;
  for (const key of settingKeys) {
    const field = emojiChildren[key];
    if (field?.kind === 'leaf') emojiChildren[key] = { ...field, value: settings[key] };
  }
  return {
    ...next,
    children: {
      ...next.children,
      emojis: { ...emojis, children: emojiChildren },
    },
  };
}

function findActiveAttachedComponent(
  components: readonly EcsComponentDoc[],
  ownerComponent: string,
): EcsComponentDoc | undefined {
  for (const candidate of components) {
    const attachedTo = candidate.attachedTo ?? candidate.dependencyOf;
    if (attachedTo === ownerComponent && hasActiveFrames(candidate)) return candidate;
    const nested = findActiveAttachedComponent(candidate.components, ownerComponent);
    if (nested) return nested;
  }
  return undefined;
}

function DisabledDependencyWrapper({ disabled, children }: { disabled: boolean; children: ReactNode }): ReactNode {
  return (
    <div
      className="transition-opacity duration-200 ease-in-out"
      style={{ opacity: disabled ? DISABLED_DEPENDENCY_OPACITY : 1 }}
    >
      {children}
    </div>
  );
}

const BACKGROUND_RADIUS_FIELDS = [
  'borderRadiusMode',
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomRightRadius',
  'borderBottomLeftRadius',
] as const;

function leafStringValue(props: Record<string, PropertyNode>, key: string): string | undefined {
  const node = props[key];
  return node?.kind === 'leaf' && node.type === 'string' && typeof node.value === 'string' ? node.value : undefined;
}

function effectivePillRadius(dimensions: { x: number; y: number } | undefined): number | undefined {
  if (!dimensions || !Number.isFinite(dimensions.x) || !Number.isFinite(dimensions.y)) return undefined;
  const radius = Math.min(Math.abs(dimensions.x), Math.abs(dimensions.y)) / 2;
  return radius > 0 ? radius : undefined;
}

function fieldOverridesFromResolvedTransform(
  component: EcsComponentDoc,
  resolvedTransform: CaptionDebugTransform | null,
): Record<string, FieldOverride> {
  const resolvedProperties = resolvedTransform?.propertyOverrides;
  if (!resolvedProperties) return {};
  const result: Record<string, FieldOverride> = {};
  const lockFromResolved = (resolved: CaptionDebugPropertyOverride) => ({
    locked: true as const,
    value: resolved.value,
    override: {
      source: resolved.source,
      type: resolved.type,
      chain: resolved.chain,
    },
  });
  for (const key of Object.keys(component.props)) {
    const resolved = resolvedProperties[`${component.component}.${key}`];
    const node = component.props[key];
    const isVector2 = node?.kind === 'leaf' && node.type === 'vector2';
    const resolvedX = isVector2 ? resolvedProperties[`${component.component}.${key}.x`] : undefined;
    const resolvedY = isVector2 ? resolvedProperties[`${component.component}.${key}.y`] : undefined;
    if (!resolved && !resolvedX && !resolvedY) continue;
    const authoredValue = isVector2 ? vector2ValueFromNode(node) : null;
    const resolvedValue =
      resolved?.value ??
      (resolvedX || resolvedY
        ? {
            x: typeof resolvedX?.value === 'number' ? resolvedX.value : (authoredValue?.x ?? 0),
            y: typeof resolvedY?.value === 'number' ? resolvedY.value : (authoredValue?.y ?? 0),
          }
        : undefined);
    const lock =
      resolvedX || resolvedY
        ? {
            x: resolvedX ? lockFromResolved(resolvedX) : resolved ? lockFromResolved(resolved) : null,
            y: resolvedY ? lockFromResolved(resolvedY) : resolved ? lockFromResolved(resolved) : null,
          }
        : resolved
          ? lockFromResolved(resolved)
          : null;
    result[key] = {
      value: resolvedValue,
      lock,
    };
  }
  return result;
}

/**
 * Editor for a single component: its leaf `props` render as a `PropertyCard`
 * (whose own `enabled` boolean auto-hoists into the card header toggle), with
 * any nested components rendered as sibling tree nodes in the owner's
 * dependency subtree instead of inside the card body.
 */
interface ComponentEditorProps {
  component: EcsComponentDoc;
  entity: EcsEntityDoc;
  root: EcsEntityDoc;
  componentIndex: number;
  componentParentPath: readonly string[];
  onUpdate: (updater: (previous: EcsComponentDoc) => EcsComponentDoc) => void;
  onDelete?: () => void;
  onDeleteEffect?: (effectId: string) => void;
  onDeleteEffects?: (effectIds: readonly string[]) => void;
  onDeleteComponentTypes?: (componentTypes: readonly string[]) => void;
  dragHandle?: ReactNode;
  stateKeyPrefix: string;
  entityKind: DebugEntityKind | null;
  paddingPreviewTarget: PaddingPreviewTarget | null;
  onHoverPaddingPreviewTarget: (target: PaddingPreviewTarget | null) => void;
  onTogglePaddingPreviewTarget: (target: PaddingPreviewTarget) => void;
  pinnedPaddingPreviewTarget: PaddingPreviewTarget | null;
  positionPreviewTarget: PositionPreviewTarget | null;
  onHoverPositionPreviewTarget: (target: PositionPreviewTarget | null) => void;
  onTogglePositionPreviewTarget: (target: PositionPreviewTarget) => void;
  pinnedPositionPreviewTarget: PositionPreviewTarget | null;
  resolvedTransforms?: readonly CaptionDebugTransform[] | null;
  onComponentRef?: (componentId: string, element: HTMLDivElement | null) => void;
  renderNested?: boolean;
  isDisabledByParent?: boolean;
}

type NestedComponentListProps = Pick<
  ComponentEditorProps,
  | 'entity'
  | 'root'
  | 'onDeleteEffect'
  | 'onDeleteEffects'
  | 'onDeleteComponentTypes'
  | 'entityKind'
  | 'paddingPreviewTarget'
  | 'onHoverPaddingPreviewTarget'
  | 'onTogglePaddingPreviewTarget'
  | 'pinnedPaddingPreviewTarget'
  | 'positionPreviewTarget'
  | 'onHoverPositionPreviewTarget'
  | 'onTogglePositionPreviewTarget'
  | 'pinnedPositionPreviewTarget'
  | 'resolvedTransforms'
  | 'onComponentRef'
  | 'isDisabledByParent'
> & {
  component: EcsComponentDoc;
  onUpdate: ComponentEditorProps['onUpdate'];
  stateKeyPrefix: string;
  componentParentPath: readonly string[];
};

export function NestedComponentList({
  component,
  entity,
  root,
  onUpdate,
  onDeleteEffect,
  onDeleteEffects,
  onDeleteComponentTypes,
  stateKeyPrefix,
  componentParentPath,
  entityKind,
  paddingPreviewTarget,
  onHoverPaddingPreviewTarget,
  onTogglePaddingPreviewTarget,
  pinnedPaddingPreviewTarget,
  positionPreviewTarget,
  onHoverPositionPreviewTarget,
  onTogglePositionPreviewTarget,
  pinnedPositionPreviewTarget,
  resolvedTransforms,
  onComponentRef,
  isDisabledByParent,
}: NestedComponentListProps): ReactNode {
  const updateNested = useCallback(
    (index: number, updater: (previous: EcsComponentDoc) => EcsComponentDoc) =>
      onUpdate((prev) => ({
        ...prev,
        components: prev.components.map((nested, nestedIndex) => (nestedIndex === index ? updater(nested) : nested)),
      })),
    [onUpdate],
  );
  const stateApplySuggestion = useContext(StateApplySuggestionContext);
  const removeNested = useCallback(
    (index: number) => {
      const removal = removeComponentWithDependencies(component.components, index);
      if (removal.removed.length > 0) {
        onDeleteEffects?.(removal.removed.flatMap(effectIdsInComponent));
        onDeleteComponentTypes?.(removal.removed.flatMap(componentTypesInComponent));
      }
      if (removal.removed.length > 0) {
        stateApplySuggestion?.reportComponentChange(stateKeyPrefix, component, () => ({
          ...component,
          components: removal.components,
        }));
      }
      onUpdate((prev) => ({ ...prev, components: removal.components }));
    },
    [component, onDeleteComponentTypes, onDeleteEffects, onUpdate, stateApplySuggestion, stateKeyPrefix],
  );
  const nestedUpdateHandlers = useMemo(
    () =>
      component.components.map(
        (_, index) => (updater: (previous: EcsComponentDoc) => EcsComponentDoc) => updateNested(index, updater),
      ),
    [component.components, updateNested],
  );
  const nestedDeleteHandlers = useMemo(
    () =>
      component.components.map((nested, index) =>
        isComponentDeletable(nested) ? () => removeNested(index) : undefined,
      ),
    [component.components, removeNested],
  );
  const reorderNested = useCallback(
    (components: EcsComponentDoc[]) => {
      stateApplySuggestion?.reportComponentChange(stateKeyPrefix, component, () => ({
        ...component,
        components,
      }));
      onUpdate((prev) => ({ ...prev, components }));
    },
    [component, onUpdate, stateApplySuggestion, stateKeyPrefix],
  );

  return (
    <SortableComponentList
      components={component.components}
      onReorder={reorderNested}
      onItemRef={onComponentRef}
      renderAfterDependencySubtree={(nested, index, nestedId) => (
        <NestedComponentList
          key={`${nestedId}-nested`}
          component={nested}
          entity={entity}
          root={root}
          onUpdate={nestedUpdateHandlers[index]}
          onDeleteEffect={onDeleteEffect}
          onDeleteEffects={onDeleteEffects}
          onDeleteComponentTypes={onDeleteComponentTypes}
          stateKeyPrefix={appendInspectorStateKey(stateKeyPrefix, 'component', nestedId)}
          componentParentPath={[...componentParentPath, component.component]}
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
          onComponentRef={onComponentRef}
          isDisabledByParent={isDisabledByParent || isComponentDisabled(nested)}
        />
      )}
    >
      {(nested, index, nestedDragHandle, nestedId) => (
        <div
          key={nestedId}
          className={`${INSPECTOR_STRUCTURAL_STACK_CLASS} ${
            nested.dependencyOf || nested.attachedTo ? INSPECTOR_DEPENDENT_SUBTREE_CLASS : ''
          }`}
        >
          <ComponentEditor
            component={nested}
            entity={entity}
            root={root}
            componentIndex={index}
            componentParentPath={[...componentParentPath, component.component]}
            onDeleteEffect={onDeleteEffect}
            onDeleteEffects={onDeleteEffects}
            onDeleteComponentTypes={onDeleteComponentTypes}
            dragHandle={nestedDragHandle}
            onUpdate={nestedUpdateHandlers[index]}
            onDelete={nestedDeleteHandlers[index]}
            stateKeyPrefix={appendInspectorStateKey(stateKeyPrefix, 'component', nestedId)}
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
            onComponentRef={onComponentRef}
            isDisabledByParent={isDisabledByParent}
            renderNested={false}
          />
        </div>
      )}
    </SortableComponentList>
  );
}

function areComponentEditorPropsEqual(previous: ComponentEditorProps, next: ComponentEditorProps): boolean {
  return (
    previous.component === next.component &&
    previous.entity.id === next.entity.id &&
    previous.entity === next.entity &&
    previous.root === next.root &&
    previous.componentIndex === next.componentIndex &&
    previous.componentParentPath === next.componentParentPath &&
    previous.stateKeyPrefix === next.stateKeyPrefix &&
    previous.onUpdate === next.onUpdate &&
    previous.onDelete === next.onDelete &&
    previous.onDeleteEffect === next.onDeleteEffect &&
    previous.onDeleteEffects === next.onDeleteEffects &&
    previous.onDeleteComponentTypes === next.onDeleteComponentTypes &&
    previous.entityKind === next.entityKind &&
    previous.paddingPreviewTarget === next.paddingPreviewTarget &&
    previous.pinnedPaddingPreviewTarget === next.pinnedPaddingPreviewTarget &&
    previous.positionPreviewTarget === next.positionPreviewTarget &&
    previous.pinnedPositionPreviewTarget === next.pinnedPositionPreviewTarget &&
    previous.resolvedTransforms === next.resolvedTransforms &&
    previous.onHoverPaddingPreviewTarget === next.onHoverPaddingPreviewTarget &&
    previous.onTogglePaddingPreviewTarget === next.onTogglePaddingPreviewTarget &&
    previous.onHoverPositionPreviewTarget === next.onHoverPositionPreviewTarget &&
    previous.onTogglePositionPreviewTarget === next.onTogglePositionPreviewTarget &&
    previous.onComponentRef === next.onComponentRef &&
    previous.renderNested === next.renderNested &&
    previous.isDisabledByParent === next.isDisabledByParent
  );
}

export const ComponentEditor = memo(function ComponentEditor({
  component,
  entity,
  root,
  componentIndex,
  componentParentPath,
  onUpdate,
  onDelete,
  onDeleteEffect,
  onDeleteEffects,
  onDeleteComponentTypes,
  dragHandle,
  stateKeyPrefix,
  entityKind,
  paddingPreviewTarget,
  onHoverPaddingPreviewTarget,
  onTogglePaddingPreviewTarget,
  pinnedPaddingPreviewTarget,
  positionPreviewTarget,
  onHoverPositionPreviewTarget,
  onTogglePositionPreviewTarget,
  pinnedPositionPreviewTarget,
  resolvedTransforms,
  onComponentRef,
  renderNested = true,
  isDisabledByParent,
}: ComponentEditorProps): ReactNode {
  const resolvedTransform = resolvedTransformForEntity(entity, resolvedTransforms);
  const stateApplySuggestion = useContext(StateApplySuggestionContext);
  const title = humanizeFieldKey(component.component);
  const isSelfLayout = component.component === 'selfLayout';
  const isLayout = component.component === 'layout';
  const hasLayoutMotion = entity.components.some((candidate) => candidate.component === 'layoutMotion');
  const layoutMotionHost = entity.components.find(
    (candidate) => candidate.component === 'layoutMotion' && !isComponentDisabled(candidate),
  );
  const layoutMotionAlignmentAxis =
    layoutMotionHost === undefined
      ? undefined
      : entity.entity === 'page'
        ? 'vertical'
        : entity.entity === 'row'
          ? 'horizontal'
          : undefined;
  const isLayoutMotion = component.component === 'layoutMotion';
  const layoutMotionMode = isLayoutMotion ? layoutMotionModeForEntity(entity.entity) : null;
  const layoutMotionScope = isLayoutMotion ? leafStringValue(component.props, 'motionScope') : undefined;
  const rawLayoutMotionType = isLayoutMotion ? leafStringValue(component.props, 'motionType') : undefined;
  const layoutMotionType =
    rawLayoutMotionType === 'spring' || rawLayoutMotionType === 'eased' ? rawLayoutMotionType : 'spring';
  const isBackgroundStyle = component.component === 'backgroundStyle';
  const backgroundShape = isBackgroundStyle ? leafStringValue(component.props, 'pathShape') : undefined;
  const supportsBackgroundRadius =
    isBackgroundStyle && (backgroundShape === undefined || backgroundShape === 'rounded' || backgroundShape === 'pill');
  const supportsBackgroundTail = isBackgroundStyle && backgroundShape === 'iMessage';
  const pillRadius = backgroundShape === 'pill' ? effectivePillRadius(resolvedTransform?.dimensions) : undefined;
  const isChildPaintOrder = component.component === 'childPaintOrder';
  const childPaintOrderMode = isChildPaintOrder ? (leafStringValue(component.props, 'mode') ?? 'source') : undefined;
  const spacerBounds = useContext(SpacerBoundsContext);
  const dependentFieldGroups = (() => {
    const groups: Record<string, readonly string[] | { fields: readonly string[]; isVisible: (controller: PropertyNode) => boolean }> = {};
    if (isSelfLayout) {
      groups.aspectRatio = {
        fields: ['customAspectRatio'],
        isVisible: (controller) => controller.kind === 'leaf' && controller.value === 'custom',
      };
    } else if (isLayoutMotion) {
      groups.motionScope = ['staggerTimingMode', 'staggerDelaySeconds', 'staggerFalloffFactor'];
      groups.motionType =
        layoutMotionType === 'spring'
          ? ['stiffness', 'damping', 'mass', 'springFalloffFactor']
          : ['timingMode', 'durationSeconds', 'easing'];
    } else if (isBackgroundStyle) {
      if (supportsBackgroundTail) groups.pathShape = ['tailSide', 'tailSize'];
      groups.boundsMode = ['blockPadding'];
    } else if (isChildPaintOrder) {
      if (childPaintOrderMode === 'alternate') {
        groups.mode = ['backZIndex', 'frontZIndex', 'start'];
      } else if (childPaintOrderMode === 'custom') {
        groups.mode = ['values', 'offset'];
      } else if (childPaintOrderMode === 'random') {
        groups.mode = ['seed'];
      }
    }
    return Object.keys(groups).length > 0 ? groups : undefined;
  })();
  const hiddenFieldKeys = new Set(hiddenPropertyKeysForComponent(component, entity));
  if (isBackgroundStyle) {
    for (const field of BACKGROUND_RADIUS_FIELDS) hiddenFieldKeys.add(field);
  }
  if (isLayout && !hasLayoutMotion) hiddenFieldKeys.add('windowSelection');
  const hasProps = Object.keys(component.props).length > 0;
  const dependencyLabel = component.dependencyOf ? humanizeFieldKey(component.dependencyOf) : undefined;
  const isDimmedByDisabledParent = isDisabledByParent ?? isComponentDisabledByDependency(component, entity.components);
  const isComponentExplicitlyDisabled = isComponentDisabled(component);
  const isDependentContentDisabled = isDimmedByDisabledParent || isComponentExplicitlyDisabled;
  const nestedComponentsDisabledByParent = isDimmedByDisabledParent || isComponentExplicitlyDisabled;
  const canDelete = Boolean(isComponentDeletable(component) && onDelete);
  const followTargetControlled = entity.components.some((candidate) => candidate.component === 'followTarget');
  const inheritedImageStyle = component.component === 'image' ? resolveMarkerImageStyle(root, entity) : null;
  const imageAssetOverride =
    component.component === 'image' ? findActiveAttachedComponent(entity.components, component.component) : undefined;
  const applyComponentUpdate = useCallback(
    (updater: (previous: EcsComponentDoc) => EcsComponentDoc) => {
      stateApplySuggestion?.reportComponentChange(stateKeyPrefix, component, updater);
      onUpdate(updater);
    },
    [component, onUpdate, stateApplySuggestion, stateKeyPrefix],
  );

  const updateProps = useCallback(
    (updater: (previous: PropertyNode) => PropertyNode) =>
      applyComponentUpdate((prev) => {
        const previous = propsToContainer(prev.props);
        const next = updater(previous);
        if (next.kind !== 'container') return prev;
        const synchronized = prev.component === 'font' ? synchronizeFontEmojiSettings(previous, next) : next;
        return { ...prev, props: synchronized.children };
      }),
    [applyComponentUpdate],
  );
  const fieldOverrides = useMemo<Record<string, FieldOverride> | null>(() => {
    const overrides: Record<string, FieldOverride> = fieldOverridesFromResolvedTransform(component, resolvedTransform);
    if (isSelfLayout) {
      const alignmentDescription = 'Aligns this element within its parent.';
      overrides.horizontalAlignment = { ...overrides.horizontalAlignment, description: alignmentDescription };
      overrides.verticalAlignment = { ...overrides.verticalAlignment, description: alignmentDescription };
      if (layoutMotionAlignmentAxis) {
        const alignmentKey = `${layoutMotionAlignmentAxis}Alignment`;
        overrides[alignmentKey] = {
          ...overrides[alignmentKey],
          lock: {
            locked: true,
            value: leafStringValue(component.props, alignmentKey),
            override: {
              source: 'Layout Motion',
              type: 'component',
            },
          },
        };
      }
    }
    if (isLayout) {
      const alignmentDescription = "Aligns this component's direct children within its content area.";
      overrides.horizontalAlignment = {
        ...overrides.horizontalAlignment,
        label: 'Horizontal Alignment',
        description: alignmentDescription,
      };
      overrides.verticalAlignment = {
        ...overrides.verticalAlignment,
        label: 'Vertical Alignment',
        description: alignmentDescription,
      };
    }
    if (isLayoutMotion) {
      const scopeMode = layoutMotionMode ?? 'currentRow';
      overrides.motionType = {
        ...overrides.motionType,
        label: 'Motion Type',
        options: LAYOUT_MOTION_TYPES,
        optionLabels: { spring: 'Spring', eased: 'Eased' },
        description: 'Selects spring physics or easing-based motion.',
      };
      overrides.motionScope = {
        ...overrides.motionScope,
        label: 'Motion Scope',
        options: LAYOUT_MOTION_SCOPES,
        optionLabels: { group: 'Group', perChild: 'Children' },
        description: 'Choose whether this entity moves as one group or each direct child moves separately.',
      };
      overrides.flowDirection = {
        ...overrides.flowDirection,
        options: scopeMode === 'currentWord' ? LAYOUT_MOTION_ROW_FLOW_DIRECTIONS : LAYOUT_MOTION_PAGE_FLOW_DIRECTIONS,
        description:
          scopeMode === 'currentWord'
            ? 'Selects whether row words flow from left to right or right to left.'
            : 'Selects whether rows flow from bottom to top or top to bottom.',
      };
      overrides.focusPosition = {
        ...overrides.focusPosition,
        label: 'Focus Position',
        options: scopeMode === 'currentWord' ? LAYOUT_MOTION_ROW_FOCUS_POSITIONS : LAYOUT_MOTION_PAGE_FOCUS_POSITIONS,
        description:
          scopeMode === 'currentWord'
            ? 'Aligns the current word to the selected horizontal focus position.'
            : 'Aligns the current row to the selected vertical focus position.',
      };
      if (layoutMotionType === 'eased') {
        overrides.timingMode = {
          ...overrides.timingMode,
          description:
            'Fixed uses the authored timing. Adaptive fits the motion schedule to the interval before the next current entity.',
        };
        overrides.durationSeconds = {
          ...overrides.durationSeconds,
          label:
            layoutMotionType === 'eased' && leafStringValue(component.props, 'timingMode') === 'adaptive'
              ? 'Max Duration'
              : 'Duration',
          description:
            layoutMotionType === 'eased' && leafStringValue(component.props, 'timingMode') === 'adaptive'
              ? 'Sets the longest motion schedule. Adaptive timing shortens this duration and child stagger delays to fit the next trigger and the active row or word duration.'
              : 'Sets how long the motion takes to reach its target.',
        };
        overrides.easing = {
          ...overrides.easing,
          description: 'Selects the easing curve for the motion.',
        };
      }
      if (layoutMotionScope === 'perChild') {
        overrides.staggerTimingMode = {
          ...overrides.staggerTimingMode,
          label: 'Stagger Timing',
          options: ['adaptive', 'fixed'],
          optionLabels: { adaptive: 'Adaptive', fixed: 'Fixed' },
          description:
            'Adaptive shortens stagger delays to fit the active row or word duration. Fixed uses the authored delay.',
        };
        overrides.staggerDelaySeconds = {
          ...overrides.staggerDelaySeconds,
          description: 'Sets the delay between direct children, ordered from nearest to farthest from the target.',
        };
        overrides.staggerFalloffFactor = {
          ...overrides.staggerFalloffFactor,
          label: 'Stagger Falloff',
          description:
            'Controls how strongly delay increases with distance from the current word.\n1 is neutral, lower values reduce distant delays, and higher values increase them.',
        };
      }
      if (layoutMotionType === 'spring' && layoutMotionScope === 'perChild') {
        overrides.springFalloffFactor = {
          ...overrides.springFalloffFactor,
          label: 'Spring Falloff',
          description:
            'Controls how strongly spring response changes with distance from the current word.\n1 keeps the response unchanged, lower values soften distant children, and higher values increase their response speed.',
        };
      }
    }
    if (isChildPaintOrder) {
      overrides.mode = {
        ...overrides.mode,
        options: ['source', 'zIndex', 'alternate', 'custom', 'random'],
        optionDescriptions: {
          source: 'Uses the child order in the hierarchy. The first child paints first.',
          zIndex: "Uses each child's Paint Order > Z Index. Add Paint Order to children to give them different order values.",
          alternate: 'Alternates children between the Back Z Index and Front Z Index values.',
          custom: 'Uses the Values list as repeating order values for the children. Offset shifts where the list starts.',
          random: 'Uses a stable pseudo-random order generated from Seed. Changing Seed creates a new order.',
        },
        description: 'Selects how the parent orders its child entities.',
      };
      overrides.direction = {
        ...overrides.direction,
        options: ['ascending', 'descending'],
        optionDescriptions: {
          ascending: 'Paints lower order values first and higher values last. Higher values appear on top when children overlap.',
          descending: 'Paints higher order values first and lower values last. Lower values appear on top when children overlap.',
        },
        description: 'Ascending paints lower order values first. Descending paints higher order values first.',
      };
      overrides.start = {
        ...overrides.start,
        options: ['back', 'front'],
        optionDescriptions: {
          back: 'Assigns the Back Z Index to the first child, then alternates.',
          front: 'Assigns the Front Z Index to the first child, then alternates.',
        },
        description: 'Selects which depth the first child receives in an alternating pattern.',
      };
    }
    if (component.component === 'verticalSpacer' || component.component === 'horizontalSpacer') {
      const spacingUnit =
        component.props.unit?.kind === 'leaf' &&
        component.props.unit.type === 'string' &&
        component.props.unit.value === '%'
          ? '%'
          : 'pt';
      const extent =
        spacingUnit === '%'
          ? 100
          : component.component === 'verticalSpacer'
            ? spacerBounds.vertical
            : spacerBounds.horizontal;
      const axis =
        component.component === 'verticalSpacer'
          ? entityKind === 'viewport'
            ? 'vertical flow children'
            : 'rows'
          : entityKind === 'row'
            ? 'words'
            : 'horizontal flow children';
      const rangeLabel = spacingUnit === '%' ? `${extent}%` : `${extent} composition units`;
      overrides.spacing = {
        ...overrides.spacing,
        min: -extent,
        max: extent,
        unit: spacingUnit,
        description: `Controls the gap between ${axis}. Negative values move them closer and can overlap them. The range is -${rangeLabel} to ${rangeLabel}.`,
      };
    }

    if (entityKind) {
      const componentKind = isBackgroundStyle ? 'backgroundStyle' : 'layout';
      const addPaddingIcon = (
        fieldKey: 'padding' | 'bandPadding' | 'blockPadding',
        valueNode: PropertyNode | undefined,
        label?: string,
      ) => {
        const value = paddingPreviewValueFromNode(valueNode) ?? { top: 0, right: 0, bottom: 0, left: 0 };
        const target: PaddingPreviewTarget = { kind: entityKind, component: componentKind, fieldKey, value };
        const previewIcon = (
          <PaddingPreviewIcon
            target={target}
            active={paddingPreviewTargetsEqual(paddingPreviewTarget, target)}
            pinned={paddingPreviewTargetsEqual(pinnedPaddingPreviewTarget, target)}
            onHoverTarget={onHoverPaddingPreviewTarget}
            onToggleTarget={onTogglePaddingPreviewTarget}
          />
        );
        overrides[fieldKey] = {
          ...overrides[fieldKey],
          label,
          labelPrefix: previewIcon,
          sectionHeaderPrefix: previewIcon,
        };
      };

      if (componentKind === 'layout') {
        addPaddingIcon('padding', component.props.padding);
      } else {
        addPaddingIcon('bandPadding', component.props.bandPadding, 'Band Padding');
        addPaddingIcon('blockPadding', component.props.blockPadding, 'Block Padding');
      }
    }
    return Object.keys(overrides).length > 0 ? overrides : null;
  }, [
    component,
    entityKind,
    isBackgroundStyle,
    isChildPaintOrder,
    isLayout,
    isLayoutMotion,
    layoutMotionMode,
    layoutMotionAlignmentAxis,
    layoutMotionScope,
    layoutMotionType,
    isSelfLayout,
    onHoverPaddingPreviewTarget,
    onTogglePaddingPreviewTarget,
    paddingPreviewTarget,
    pinnedPaddingPreviewTarget,
    resolvedTransform,
    spacerBounds,
  ]);
  const paintCapabilities = useMemo(() => paintCapabilitiesForOwner(component.component), [component.component]);
  const addEffectAction = !dependencyLabel
    ? componentEffectsAddAction(
        component,
        (template) => {
          const effects = instantiateEffectTemplateWithDependencies(template, effectScopeForEntity(entity.entity, entity.id));
          applyComponentUpdate((prev) => ({
            ...prev,
            effects: [...prev.effects, ...effects],
          }));
        },
        { entity, componentParentPath },
      )
    : undefined;
  const deleteAction =
    !dependencyLabel && canDelete ? createInspectorDeleteAction(title, () => onDelete?.()) : undefined;
  const componentCopyPaste = useContext(ComponentCopyPasteContext);
  const pasteTarget = {
    componentType: component.component,
    parentPath: componentParentPath,
    studioId: component.studioId,
  };
  const copyAction: InspectorHeaderAction | undefined = componentCopyPaste
    ? {
        id: 'copy',
        label: `Copy ${title}`,
        menuLabel: 'Copy',
        tooltip: `Copy ${title}`,
        icon: Copy,
        onSelect: () =>
          componentCopyPaste.copyComponent(
            {
              entity,
              component,
              itemLabel: title,
              parentPath: componentParentPath,
            },
            entityTitle(entity),
          ),
      }
    : undefined;
  const pasteAction: InspectorHeaderAction | undefined = componentCopyPaste?.canPasteComponent(entity, pasteTarget)
    ? {
        id: 'paste',
        label: formatPasteActionLabel(title, componentCopyPaste.payload?.sourceEntityLabel ?? 'source entity'),
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
        onSelect: () => componentCopyPaste.pasteComponent(entity.id, pasteTarget),
      }
    : undefined;
  const duplicateAction: InspectorHeaderAction | undefined = componentCopyPaste?.canDuplicateComponent(entity, pasteTarget)
    ? {
        id: 'duplicate',
        label: 'Duplicate',
        tooltip: `Duplicate ${title}`,
        icon: Layers2,
        onSelect: () => componentCopyPaste.duplicateComponent(entity.id, pasteTarget),
      }
    : undefined;
  const copyPasteActions = [copyAction, pasteAction].filter(
    (action): action is InspectorHeaderAction => action !== undefined,
  );
  const stateApplyAction = isStateGroupId(entity.id)
    ? createStateApplyAction(stateKeyPrefix, component, stateApplySuggestion)
    : undefined;
  const copyPasteAndStateActions = [
    ...copyPasteActions,
    ...(duplicateAction ? [duplicateAction] : []),
    ...(stateApplyAction ? [stateApplyAction] : []),
  ];
  const headerExtra = (
    <>
      {dragHandle}
      <InspectorHeaderOptions
        ariaLabel={`${title} options`}
        primaryAction={addEffectAction}
        actions={[...copyPasteAndStateActions, ...(deleteAction ? [deleteAction] : [])]}
        menuLabel={dependencyLabel ? `Required by ${dependencyLabel}` : undefined}
      />
    </>
  );

  if (component.component === 'transform') {
    return (
      <DisabledDependencyWrapper disabled={isDimmedByDisabledParent}>
        <TransformEditor
          component={component}
          onUpdate={applyComponentUpdate}
          onDelete={canDelete ? onDelete : undefined}
          dragHandle={dragHandle}
          stateKeyPrefix={stateKeyPrefix}
          entityKind={entityKind}
          positionPreviewTarget={positionPreviewTarget}
          pinnedPositionPreviewTarget={pinnedPositionPreviewTarget}
          onHoverPositionPreviewTarget={onHoverPositionPreviewTarget}
          onTogglePositionPreviewTarget={onTogglePositionPreviewTarget}
          resolvedTransform={resolvedTransform}
          positioningLocked={followTargetControlled}
          entity={entity}
          componentParentPath={componentParentPath}
          copyPasteActions={copyPasteAndStateActions}
        />
      </DisabledDependencyWrapper>
    );
  }
  if (component.component === 'markerBehavior') {
    return (
      <DisabledDependencyWrapper disabled={isDimmedByDisabledParent}>
        <MarkerEditor
          component={component}
          onUpdate={applyComponentUpdate}
          stateKey={stateKeyPrefix}
          headerExtra={headerExtra}
          resolvedPropertyOverrides={resolvedTransform?.propertyOverrides}
          effectsFooter={
            component.effects.length > 0 ? (
              <ComponentEffectsFooter
                component={component}
                entity={entity}
                componentParentPath={componentParentPath}
                onUpdate={onUpdate}
                onDeleteEffect={onDeleteEffect}
                stateKeyPrefix={stateKeyPrefix}
                dependencyLabel={dependencyLabel}
                componentDisabledOverride={isDependentContentDisabled}
                resolvedPropertyOverrides={resolvedTransform?.propertyOverrides}
                resolvedPropertyPrefix={component.component}
              />
            ) : undefined
          }
        />
      </DisabledDependencyWrapper>
    );
  }
  if (component.component === 'followTarget') {
    return (
      <DisabledDependencyWrapper disabled={isDimmedByDisabledParent}>
        <FollowTargetEditor
          component={component}
          root={root}
          ownerEntity={entity}
          onUpdate={applyComponentUpdate}
          stateKey={stateKeyPrefix}
          headerExtra={headerExtra}
          allowDisable={component.allowDisable}
          resolvedPropertyOverrides={resolvedTransform?.propertyOverrides}
          effectsFooter={
            component.effects.length > 0 ? (
              <ComponentEffectsFooter
                component={component}
                entity={entity}
                componentParentPath={componentParentPath}
                onUpdate={onUpdate}
                onDeleteEffect={onDeleteEffect}
                stateKeyPrefix={stateKeyPrefix}
                dependencyLabel={dependencyLabel}
                componentDisabledOverride={isDependentContentDisabled}
                resolvedPropertyOverrides={resolvedTransform?.propertyOverrides}
                resolvedPropertyPrefix={component.component}
              />
            ) : undefined
          }
        />
      </DisabledDependencyWrapper>
    );
  }
  if (component.component === 'image') {
    return (
      <DisabledDependencyWrapper disabled={isDimmedByDisabledParent}>
        <ImageEditor
          component={component}
          onUpdate={applyComponentUpdate}
          stateKey={stateKeyPrefix}
          styleOverride={inheritedImageStyle}
          imageAssetOverride={imageAssetOverride}
          headerExtra={headerExtra}
          allowDisable={component.allowDisable}
          showRenderOrder={entityKind !== 'marker'}
          resolvedPropertyOverrides={resolvedTransform?.propertyOverrides}
          effectsFooter={
            component.effects.length > 0 ? (
              <ComponentEffectsFooter
                component={component}
                entity={entity}
                componentParentPath={componentParentPath}
                onUpdate={onUpdate}
                onDeleteEffect={onDeleteEffect}
                stateKeyPrefix={stateKeyPrefix}
                dependencyLabel={dependencyLabel}
                componentDisabledOverride={isDependentContentDisabled}
                resolvedPropertyOverrides={resolvedTransform?.propertyOverrides}
                resolvedPropertyPrefix={component.component}
              />
            ) : undefined
          }
        />
      </DisabledDependencyWrapper>
    );
  }
  if (component.component === 'imageSequencer') {
    return (
      <DisabledDependencyWrapper disabled={isDimmedByDisabledParent}>
        <ImageSequencerEditor
          component={component}
          onUpdate={applyComponentUpdate}
          stateKey={stateKeyPrefix}
          headerExtra={headerExtra}
          allowDisable={component.allowDisable}
          resolvedPropertyOverrides={resolvedTransform?.propertyOverrides}
        />
      </DisabledDependencyWrapper>
    );
  }
  if (component.component === 'borderRadius') {
    return (
      <DisabledDependencyWrapper disabled={isDimmedByDisabledParent}>
        <BorderRadiusEditor
          component={component}
          onUpdate={applyComponentUpdate}
          onDelete={canDelete ? onDelete : undefined}
          dragHandle={dragHandle}
          stateKeyPrefix={stateKeyPrefix}
          resolvedPropertyOverrides={resolvedTransform?.propertyOverrides}
          copyPasteActions={copyPasteAndStateActions}
        />
      </DisabledDependencyWrapper>
    );
  }
  if (component.component === 'animation') {
    return (
      <DisabledDependencyWrapper disabled={isDimmedByDisabledParent}>
        <AnimationComponentEditor
          component={component}
          stateKeyPrefix={stateKeyPrefix}
          onUpdate={applyComponentUpdate}
          onDelete={canDelete ? onDelete : undefined}
          dragHandle={dragHandle}
          entity={entity}
          dependencyLabel={dependencyLabel}
          allowDisable={component.allowDisable}
          copyPasteActions={copyPasteAndStateActions}
        />
      </DisabledDependencyWrapper>
    );
  }

  return (
    <PaintCapabilitiesContext.Provider value={paintCapabilities}>
      <FieldOverridesContext.Provider value={fieldOverrides}>
        <DisabledDependencyWrapper disabled={isDimmedByDisabledParent}>
          <div className={INSPECTOR_STACK_CLASS}>
            {hasProps ? (
              <>
                <PropertyCard
                  title={title}
                  node={propsToContainer(component.props)}
                  fieldKey={component.component}
                  onChange={updateProps}
                  titleIcon={headerIconForComponent(component.component)}
                  titleHelp={getComponentDescription(component.component)}
                  headerExtra={headerExtra}
                  hiddenFieldKeys={hiddenFieldKeys}
                  dependentFieldGroups={dependentFieldGroups}
                  alignmentLabel={isSelfLayout ? 'Align Self' : undefined}
                  allowDisable={component.allowDisable}
                  stateKey={stateKeyPrefix}
                  footer={
                    component.effects.length > 0 ? (
                      <ComponentEffectsFooter
                        component={component}
                        entity={entity}
                        componentParentPath={componentParentPath}
                        onUpdate={onUpdate}
                        onDeleteEffect={onDeleteEffect}
                        stateKeyPrefix={stateKeyPrefix}
                        dependencyLabel={dependencyLabel}
                        componentDisabledOverride={isDependentContentDisabled}
                        resolvedPropertyOverrides={resolvedTransform?.propertyOverrides}
                        resolvedPropertyPrefix={component.component}
                      />
                    ) : undefined
                  }
                />
                {supportsBackgroundRadius && (
                  <DependentSetting>
                    <BorderRadiusEditor
                      component={component}
                      onUpdate={applyComponentUpdate}
                      title="Border Radius"
                      propertyPrefix="backgroundStyle"
                      showEnabledToggle={false}
                      showHeaderActions={false}
                      stateKeyPrefix={appendInspectorStateKey(stateKeyPrefix, 'borderRadius')}
                      effectiveUniformValue={pillRadius}
                      uniformValueReadOnly={backgroundShape === 'pill' && pillRadius !== undefined}
                    />
                  </DependentSetting>
                )}
              </>
            ) : (
              <div className={INSPECTOR_STACK_CLASS}>
                <div
                  className={cn(
                    'flex items-center justify-between gap-2',
                    INSPECTOR_LABELED_SECTION_VERTICAL_PADDING_CLASS,
                  )}
                >
                  <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                    <span>{title}</span>
                    {getComponentDescription(component.component) && (
                      <InfoTooltip ariaLabel={`Explain ${title}`} side="top">
                        {getComponentDescription(component.component)}
                      </InfoTooltip>
                    )}
                  </div>
                  {headerExtra}
                </div>
                {component.effects.length > 0 && (
                  <ComponentEffectsFooter
                    component={component}
                    entity={entity}
                    componentParentPath={componentParentPath}
                    onUpdate={onUpdate}
                    onDeleteEffect={onDeleteEffect}
                    stateKeyPrefix={stateKeyPrefix}
                    dependencyLabel={dependencyLabel}
                    componentDisabledOverride={isDependentContentDisabled}
                    resolvedPropertyOverrides={resolvedTransform?.propertyOverrides}
                    resolvedPropertyPrefix={component.component}
                  />
                )}
              </div>
            )}
          </div>
        </DisabledDependencyWrapper>
        {renderNested && component.components.length > 0 && (
          <NestedComponentList
            component={component}
            entity={entity}
            root={root}
            onUpdate={onUpdate}
            onDeleteEffect={onDeleteEffect}
            onDeleteEffects={onDeleteEffects}
            onDeleteComponentTypes={onDeleteComponentTypes}
            stateKeyPrefix={stateKeyPrefix}
            componentParentPath={[...componentParentPath, component.component]}
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
            onComponentRef={onComponentRef}
            isDisabledByParent={nestedComponentsDisabledByParent}
          />
        )}
      </FieldOverridesContext.Provider>
    </PaintCapabilitiesContext.Provider>
  );
}, areComponentEditorPropsEqual);
