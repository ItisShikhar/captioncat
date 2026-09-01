import { cn } from '@/lib/utils';
import { valuesEqual } from '@/lib/values-equal';
import type {
  ContainerNode,
  LeafDefinition,
  PaintCapability,
  PropertyNode,
  PropertyValueType,
  RandomizerConfig,
} from '@/schema';
import { getComponentDescription, getFieldMeta } from '@/schema';
import { DEFAULT_PAINT_CAPABILITIES, normalizePaint, solidPaint } from '@/schema/paint';
import {
  inferObjectLeafType,
  isLeaf,
  parseNode,
  serializeNode,
  TRANSITIONABLE_PROPERTY_TYPES,
} from '@/schema/property-tree';
import { AlignmentField } from '@/ui/controls/alignment-field';
import { AnchorField } from '@/ui/controls/anchor-field';
import { ANCHOR_VALUES, areAnchorValues } from '@/ui/controls/anchor-picker';
import { AnimationEditor } from '@/ui/controls/animation-editor';
import { BooleanField } from '@/ui/controls/boolean-field';
import { CapTypeField } from '@/ui/controls/cap-type-field';
import { CollapsibleSection } from '@/ui/controls/collapsible-section';
import { PaintField } from '@/ui/controls/color-field';
import { DependentSetting } from '@/ui/controls/dependent-setting';
import { FieldLabelExtraContext, FieldRow, humanizeFieldKey } from '@/ui/controls/field-row';
import { FillPatternField } from '@/ui/controls/fill-pattern-field';
import { FontFamilyField } from '@/ui/controls/font-family-field';
import { FontStyleField } from '@/ui/controls/font-style-field';
import { FontWeightField } from '@/ui/controls/font-weight-field';
import { InfoTooltip } from '@/ui/controls/info-tooltip';
import { InspectorCardStateContext, useInspectorCardOpenState } from '@/ui/controls/inspector-card-state-context';
import { InspectorCardSurfaceContext } from '@/ui/controls/inspector-card-surface-context';
import { JoinTypeField } from '@/ui/controls/join-type-field';
import { ListEditor } from '@/ui/controls/list-editor';
import { NumberField } from '@/ui/controls/number-field';
import { NumberOrAutoField } from '@/ui/controls/number-or-auto-field';
import {
  isPropertyLockState,
  propertyLockFromAnimation,
  PropertyLockIndicator,
  propertyLockIsLocked,
  type PropertyLock,
  type PropertyLockMap,
  type PropertyLockState,
} from '@/ui/controls/property-lock';
import { RANDOMIZABLE_LEAF_TYPES } from '@/ui/controls/randomizer-editor';
import { RawJsonField } from '@/ui/controls/raw-json-field';
import { normalizeRect, RectField } from '@/ui/controls/rect-field';
import { SelectField, StringField } from '@/ui/controls/select-field';
import { SliderField } from '@/ui/controls/slider-field';
import { Vector2Field } from '@/ui/controls/vector2-field';
import type { DebugEntityKind } from '@/ui/preview/entity-debug';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/ui/shadcn/accordion';
import { Button } from '@/ui/shadcn/button';
import { CardContent, CardTitle, SubCard, SubCardHeader } from '@/ui/shadcn/card';
import { Checkbox } from '@/ui/shadcn/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/shadcn/popover';
import { Separator } from '@/ui/shadcn/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';
import {
  ALargeSmall,
  AlignCenter,
  AlignVerticalJustifyStart,
  Box,
  ChevronDown,
  Image,
  Images,
  Layers,
  LayoutTemplate,
  Link2,
  LocateFixed,
  MousePointer2,
  Paintbrush,
  SeparatorHorizontal,
  SeparatorVertical,
  SlidersHorizontal,
  Strikethrough,
  Type,
  Underline,
  Unlink2,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { createContext, Fragment, useContext, useEffect, useRef } from 'react';
import type { FillMode } from '@captioncat/caption-engine/browser';
import { isModeSelectorPropertyKey } from '@captioncat/caption-engine/browser';

import {
  INSPECTOR_CARD_CONTENT_CLASS,
  INSPECTOR_CARD_CONTENT_STACK_CLASS,
  INSPECTOR_CARD_HEADER_GROUP_CLASS,
} from '../controls/inspector-layout';
import { AnimationTrackNavigationContext } from './design-editor/animation-track-navigation';
import { StateApplySuggestionContext } from './design-editor/inspector/state-apply-suggestion-context';
import { AnimationTrackLabelExtra } from './design-editor/shared/animation-track-button';
import { MotionIcon } from './design-editor/shared/motion-icon';
import { RandomizerPropertyAffordance } from './design-editor/shared/randomizer-property-affordance';
import { TransitionPropertyAffordance } from './design-editor/shared/transition-property-affordance';
import {
  openStateKeysForProperty,
  StateOverrideContext,
  type StateOverrideSource,
} from './design-editor/state-overrides';

interface PropertyTreeViewProps {
  node: PropertyNode;
  /** Dotted or bracketed field key used for React keys and field-metadata lookup. It is not a real path. */
  fieldKey: string;
  onChange: (updater: (previous: PropertyNode) => PropertyNode) => void;
  /** Nesting depth, used to decide between flat rows (shallow) and collapsible accordions (deep). */
  depth?: number;
  /** Path prefix used to persist collapse state for nested cards under the current inspector entity. */
  stateKeyPrefix?: string;
  /** Stable owner card key used to look up lifecycle-state override metadata. */
  overrideScopeKey?: string;
  /** Accumulated property path within the owning component/effect. */
  propertyPath?: readonly string[];
  /** Optional label shown above a paired horizontal/vertical alignment section. */
  alignmentLabel?: string;
  /** Render alignment fields without adding another subsection wrapper when an outer section owns the chrome. */
  suppressAlignmentSection?: boolean;
  /** Top-level fields to omit from this property container without removing them from the saved component. */
  hiddenFieldKeys?: ReadonlySet<string>;
  /** Groups dependent top-level fields under their controlling field. */
  dependentFieldGroups?: Readonly<Record<string, readonly string[] | DependentFieldGroup>>;
  /** Optional base color used to lock fill-pattern color slot #1. */
  fillPatternBaseColor?: string;
  /** When true, fill-pattern keeps color slot #1 as the base color. */
  lockFillPatternBaseColor?: boolean;
}

export interface DependentFieldGroup {
  fields: readonly string[];
  isVisible?: (controller: PropertyNode) => boolean;
}

type DependentFieldGroupValue = readonly string[] | DependentFieldGroup;

function isDependentFieldGroupConfig(group: DependentFieldGroupValue): group is DependentFieldGroup {
  return !Array.isArray(group);
}

function dependentFields(group: DependentFieldGroupValue): readonly string[] {
  return isDependentFieldGroupConfig(group) ? group.fields : group;
}

function dependentGroupIsVisible(group: DependentFieldGroupValue, controller: PropertyNode): boolean {
  return !isDependentFieldGroupConfig(group) || group.isVisible?.(controller) !== false;
}

export const PaintCapabilitiesContext = createContext<readonly PaintCapability[]>(DEFAULT_PAINT_CAPABILITIES);

function resolveSolidColorFromPaintNode(node: PropertyNode | undefined): string | undefined {
  if (!node || node.kind !== 'leaf' || node.type !== 'paint') return undefined;
  const paint = normalizePaint(node.value, solidPaint('#000000'));
  return paint.type === 'solid' ? paint.color : (paint.stops[0]?.color ?? '#000000');
}

function normalizePatternLeafValue(
  value: unknown,
  baseColor: string,
  options?: {
    syncBaseColor?: boolean;
    ensureAtLeastOneColor?: boolean;
  },
): { pattern: FillMode; colors: string[]; offset: number } {
  const pattern =
    value && typeof value === 'object'
      ? (value as { pattern?: unknown; mode?: unknown; colors?: unknown; offset?: unknown })
      : {};
  const colors = Array.isArray(pattern.colors)
    ? pattern.colors.filter((color): color is string => typeof color === 'string')
    : [];
  const rawPattern = pattern.pattern ?? pattern.mode;
  const normalizedPattern: FillMode =
    rawPattern === 'cycle' || rawPattern === 'alternate' || rawPattern === 'single'
      ? rawPattern
      : pattern.mode === undefined
        ? 'single'
        : 'cycle';
  const syncBaseColor = options?.syncBaseColor === true;
  const ensureAtLeastOneColor = options?.ensureAtLeastOneColor === true;
  const normalizedColors =
    colors.length === 0
      ? ensureAtLeastOneColor
        ? [baseColor]
        : []
      : syncBaseColor
        ? [baseColor, ...colors.slice(1)]
        : colors;
  return {
    pattern: normalizedPattern,
    colors: normalizedColors,
    offset: typeof pattern.offset === 'number' && Number.isFinite(pattern.offset) ? Math.trunc(pattern.offset) : 0,
  };
}

export function paintCapabilitiesForOwner(owner: string): readonly PaintCapability[] {
  switch (owner) {
    case 'backgroundStyle':
    case 'text':
    case 'stroke':
    case 'glow':
    case 'shadow':
      return DEFAULT_PAINT_CAPABILITIES;
    case 'border':
    case 'underline':
    case 'strikethrough':
      return ['solid'];
    default:
      return DEFAULT_PAINT_CAPABILITIES;
  }
}

/** Leaf types animation/transition editors make sense for (excludes list/array/fontFamily/object). */
const ANIMATABLE_LEAF_TYPES = new Set(['number', 'fontWeight', 'vector2', 'paint', 'string', 'boolean']);
const INSET_GROUP_KEYS = new Set(['padding', 'bandPadding', 'blockPadding']);
const INSET_EDGE_KEYS = ['top', 'right', 'bottom', 'left'] as const;
type InsetEdge = (typeof INSET_EDGE_KEYS)[number];
type InsetLinkKey = 'linkedTopBottom' | 'linkedLeftRight';
const INSET_PAIRS = [
  ['top', 'bottom', 'linkedTopBottom'],
  ['left', 'right', 'linkedLeftRight'],
] as const satisfies readonly (readonly [InsetEdge, InsetEdge, InsetLinkKey])[];

function isInsetNumberNode(node: PropertyNode | undefined): node is LeafDefinition {
  return node?.kind === 'leaf' && node.type === 'number' && typeof node.value === 'number';
}

function isInsetGroupNode(fieldKey: string, node: PropertyNode): node is ContainerNode {
  return (
    node.kind === 'container' &&
    INSET_GROUP_KEYS.has(fieldKey) &&
    INSET_EDGE_KEYS.every((edge) => isInsetNumberNode(node.children[edge]))
  );
}

function randomizerIsActive(randomizer: RandomizerConfig | undefined): boolean {
  return randomizer !== undefined && randomizer.enabled !== false;
}

function randomizerHasWholeValue(randomizer: RandomizerConfig | undefined): boolean {
  if (!randomizer) return false;
  return randomizer.values !== undefined || randomizer.range !== undefined || randomizer.axes === undefined;
}

function randomizerLockForValue(
  leafType: PropertyValueType,
  randomizer: RandomizerConfig | undefined,
  value: unknown,
): PropertyLock | null {
  if (!randomizer || !randomizerIsActive(randomizer)) return null;
  const createLock = (lockedValue: unknown): PropertyLockState => ({
    locked: true,
    value: lockedValue,
    override: { source: 'Randomizer', type: 'randomizer' },
  });
  if (leafType !== 'vector2' || randomizerHasWholeValue(randomizer)) {
    return createLock(value);
  }

  const vectorValue =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as { x?: unknown; y?: unknown })
      : {};
  const axisLocks: PropertyLockMap = {
    x: randomizerIsActive(randomizer.axes?.x) ? createLock(vectorValue.x) : null,
    y: randomizerIsActive(randomizer.axes?.y) ? createLock(vectorValue.y) : null,
  };
  return axisLocks.x || axisLocks.y ? axisLocks : null;
}

/**
 * Per-field "Auto off" default overrides, keyed by local field name (matches
 * `fieldKey`, e.g. `"widthPercent"`) - lets a specific section (currently
 * only Composition Area, see `DesignEditor`) supply the *real, engine-computed*
 * value a `numberOrAuto` field uses when when the user turns
 * "Auto" off, instead of `field-metadata.ts`'s generic static fallback.
 * `null`/absent means "no override here", so every other section's fields
 * keep using their static `FieldMeta.autoOffDefault` untouched.
 */
export const AutoOffDefaultsContext = createContext<Record<string, number> | null>(null);

/**
 * Per-field label/description/trailing-icon overrides, keyed by local field
 * name (matches `fieldKey`). A section can define a label for a reused field
 * key, such as `verticalAlignment`. The Composition Area section uses this
 * mapping to distinguish its alignment from Page > Layout alignment.
 * `labelExtra` lets a section attach an extra control to a field's own row.
 * `sectionHeaderPrefix` lets a section attach a control to a container group's
 * section header. `options` analogously
 * disambiguates a reused `string` enum field's choices. For example, Border and Stroke
 * effects' `style` (solid/dashed/dotted) reuse the same field key as Font's
 * `style` (normal/italic/oblique) in the shared `FIELD_META` lookup (which
 * has no concept of "owner"), so `EffectEditor` overrides it for those
 * effects rather than the generic lookup offering Font values there.
 */
export interface FieldOverride {
  label?: string;
  description?: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  labelPrefix?: ReactNode;
  labelExtra?: ReactNode;
  sectionHeaderPrefix?: ReactNode;
  helper?: ReactNode;
  options?: readonly string[];
  optionLabels?: Partial<Record<string, string>>;
  optionDescriptions?: Partial<Record<string, string>>;
  value?: unknown;
  lock?: PropertyLock | null;
  axisInlineEndContent?: Partial<Record<'x' | 'y', ReactNode | ((disabled: boolean) => ReactNode)>>;
  axisInlineEndContentInteractive?: boolean;
  axisLayout?: 'row' | 'column';
  supportsStatePersistence?: boolean;
}

export const FieldOverridesContext = createContext<Readonly<Record<string, FieldOverride>> | null>(null);

type FieldDisabledState = boolean | Partial<Record<'x' | 'y', boolean>>;

export const FieldDisabledContext = createContext<Readonly<Record<string, FieldDisabledState>> | null>(null);

/**
 * Exclusively previews one debug-overlay entity in the live preview while
 * hovering an entity-overlay option (see `SelectField`'s `optionEntityKind`),
 * hiding whatever else is currently shown (toggle-all/pinned/etc.) and
 * restoring it the moment the hover ends. Provided at the `DesignEditor`
 * root with the same `onHoverEntity` callback the card-title hover icons
 * already use, so both affordances share one exclusive-preview mechanism.
 */
export const DebugEntityHoverContext = createContext<((kind: DebugEntityKind | null) => void) | null>(null);

export { InspectorCardStateContext, useInspectorCardOpenState } from '@/ui/controls/inspector-card-state-context';
const HEADER_ICON_CLASS = 'text-muted-foreground/80 size-3.5 shrink-0';
export const INSPECTOR_COMPACT_CARD_HEADER_CLASS = 'top-0 flex min-h-10 items-center justify-between gap-3 px-3 py-2';
export const INSPECTOR_HEADER_ACTION_ROW_CLASS = 'flex shrink-0 items-center gap-4';

function inspectorHeaderIcon(Icon: LucideIcon): ReactNode {
  return <Icon aria-hidden="true" className={HEADER_ICON_CLASS} />;
}

const COMPONENT_HEADER_ICONS: Record<string, LucideIcon> = {
  options: SlidersHorizontal,
  layout: LayoutTemplate,
  selfLayout: AlignCenter,
  background: Paintbrush,
  transform: Box,
  image: Image,
  imageSequencer: Images,
  paint: Paintbrush,
  markerBehavior: MousePointer2,
  followTarget: LocateFixed,
  font: ALargeSmall,
  text: Type,
  horizontalSpacer: SeparatorVertical,
  verticalSpacer: SeparatorHorizontal,
  layoutMotion: AlignVerticalJustifyStart,
  paintOrder: Layers,
  childPaintOrder: Layers,
  underline: Underline,
  strikethrough: Strikethrough,
};

export function headerIconForComponent(component: string): ReactNode | undefined {
  if (component === 'animation') return <MotionIcon aria-hidden="true" className={HEADER_ICON_CLASS} />;
  const Icon = COMPONENT_HEADER_ICONS[component];
  return Icon ? inspectorHeaderIcon(Icon) : undefined;
}

const EFFECT_HEADER_BADGE_CLASS =
  'bg-muted-foreground/0 text-muted-foreground/80 inline-flex size-3 shrink-0 items-center justify-center rounded-[0px] border border-muted-foreground/80 text-[9px] font-bold leading-none';

export function effectHeaderBadge(): ReactNode {
  return (
    <span aria-hidden="true" className={EFFECT_HEADER_BADGE_CLASS}>
      E
    </span>
  );
}

function appendInspectorStateKey(prefix: string | undefined, segment: string): string | undefined {
  if (!prefix) return undefined;
  return `${prefix}/${encodeURIComponent(segment)}`;
}

const STATE_OVERRIDE_PILL_CLASS =
  'inline-flex shrink-0 items-center rounded border border-red-400/35 bg-red-400/10 px-1.5 py-0.5 text-[10px] font-medium text-red-300 transition-colors hover:border-red-400/60 hover:bg-red-400/15';

function StateOverrideSourceTrigger({ sources }: { sources: readonly StateOverrideSource[] }): ReactNode {
  const context = useContext(StateOverrideContext);
  if (!context || sources.length === 0) return null;
  const navigate = (source: StateOverrideSource) =>
    context.navigateToOverride(source, openStateKeysForProperty(source.scopeKey, source.propertyPath));
  const label = sources.length === 1 ? sources[0].label : `${sources.length} states`;
  const ariaLabel =
    sources.length === 1
      ? `Go to ${sources[0].label} override`
      : `${sources.length} lifecycle states override this property`;
  const trigger = (
    <button
      type="button"
      className={STATE_OVERRIDE_PILL_CLASS}
      onClick={sources.length === 1 ? () => navigate(sources[0]) : undefined}
      aria-label={ariaLabel}
      title={sources.length === 1 ? `${sources[0].label} overrides this property` : ariaLabel}
    >
      {label}
    </button>
  );

  if (sources.length === 1) {
    return trigger;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-auto min-w-32 p-1">
        <div className="flex flex-col gap-0.5">
          {sources.map((source) => (
            <button
              key={source.stateEntityId}
              type="button"
              className="hover:bg-accent hover:text-accent-foreground rounded px-2 py-1.5 text-left text-xs"
              onClick={() => navigate(source)}
            >
              {source.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function StateOverrideSummary({
  scopeKey,
  propertyPath,
  inline = false,
}: {
  scopeKey?: string;
  propertyPath: readonly string[];
  inline?: boolean;
}): ReactNode {
  const context = useContext(StateOverrideContext);
  if (!context || !scopeKey) return null;
  const sources = context.sourcesFor(scopeKey, propertyPath);
  if (sources.length === 0) return null;
  return (
    <div className={cn('flex items-center gap-1.5 text-xs', inline ? 'shrink-0' : 'pt-0.5')}>
      <span className="text-muted-foreground">Overridden by</span>
      <StateOverrideSourceTrigger sources={sources} />
    </div>
  );
}

export function InspectorPropertyOverrideSummary({
  scopeKey,
  propertyPath,
}: {
  scopeKey?: string;
  propertyPath: readonly string[];
}): ReactNode {
  return <StateOverrideSummary scopeKey={scopeKey} propertyPath={propertyPath} inline />;
}

export function InspectorPropertyAnchor({
  scopeKey,
  propertyPath,
  children,
  showOverrideSummary = true,
  className,
}: {
  scopeKey?: string;
  propertyPath: readonly string[];
  children: ReactNode;
  showOverrideSummary?: boolean;
  className?: string;
}): ReactNode {
  return (
    <div
      data-inspector-property-scope={scopeKey}
      data-inspector-property-path={propertyPath.join('.')}
      className={cn('inspector-property-anchor rounded transition-colors empty:hidden w-full', className)}
    >
      {children}
      {showOverrideSummary && <StateOverrideSummary scopeKey={scopeKey} propertyPath={propertyPath} />}
    </div>
  );
}

function antialiasScaleOption(value: unknown): string {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '2';
  if (numericValue <= 1.5) return '1';
  if (numericValue <= 3) return '2';
  if (numericValue <= 6) return '4';
  return '8';
}

/** Renders one leaf's value control, dispatching on `leaf.type`. */
function LeafFieldView({
  node,
  fieldKey,
  onChange,
  depth = 0,
  stateKeyPrefix,
  overrideScopeKey,
  propertyPath = [fieldKey],
  fillPatternBaseColor,
  lockFillPatternBaseColor = false,
}: PropertyTreeViewProps) {
  const autoOffDefaults = useContext(AutoOffDefaultsContext);
  const fieldOverrides = useContext(FieldOverridesContext);
  const disabledFields = useContext(FieldDisabledContext);
  const paintCapabilities = useContext(PaintCapabilitiesContext);
  const onHoverEntity = useContext(DebugEntityHoverContext);
  const parentLabelExtra = useContext(FieldLabelExtraContext);
  const stateApplySuggestion = useContext(StateApplySuggestionContext);
  const animationTrackNavigation = useContext(AnimationTrackNavigationContext);
  if (node.kind !== 'leaf') return null;
  const override = fieldOverrides?.[fieldKey];
  const meta = {
    ...getFieldMeta(fieldKey),
    ...(override?.min === undefined ? {} : { min: override.min }),
    ...(override?.max === undefined ? {} : { max: override.max }),
    ...(override?.step === undefined ? {} : { step: override.step }),
    ...(override?.unit === undefined ? {} : { unit: override.unit }),
    ...(override?.options === undefined ? {} : { options: override.options }),
    ...(override?.optionLabels === undefined ? {} : { optionLabels: override.optionLabels }),
    ...(override?.optionDescriptions === undefined ? {} : { optionDescriptions: override.optionDescriptions }),
  };
  const label = override?.label ?? meta.label ?? (node.type === 'paint' ? 'Color' : humanizeFieldKey(fieldKey));
  const description = override?.description ?? meta.description;
  const labelPrefix = override?.labelPrefix;
  const labelExtra = override?.labelExtra;
  const helper = override?.helper;
  const fieldDisabledState = disabledFields?.[fieldKey];
  const fieldDisabled = fieldDisabledState === true;
  const propertyAnchor = (content: ReactNode) => (
    <InspectorPropertyAnchor scopeKey={overrideScopeKey ?? stateKeyPrefix} propertyPath={propertyPath}>
      {content}
    </InspectorPropertyAnchor>
  );
  const idScope = stateKeyPrefix ? `-${encodeURIComponent(stateKeyPrefix)}` : '';
  const id = `field-${fieldKey}-${depth}${idScope}`;
  const hasValueOverride = override ? Object.prototype.hasOwnProperty.call(override, 'value') : false;
  const displayValue = hasValueOverride ? override?.value : node.value;
  const explicitLock = override?.lock ?? null;
  const animationScopeKey = overrideScopeKey ?? stateKeyPrefix;
  const activeAnimationTrack =
    animationScopeKey && animationTrackNavigation
      ? animationTrackNavigation.targetFor(animationScopeKey, propertyPath)
      : undefined;

  const setValue = (value: unknown) =>
    onChange((prev) => {
      if (prev.kind !== 'leaf' || valuesEqual(prev.value, value)) return prev;
      return { ...prev, value };
    });

  // Some leaves are authored as `type: "object"` with no static value, purely
  // driven by animation keyframes (for example, Motion Blur's `steps`); infer the
  // real control/animation type from those keyframes instead of falling
  // back to a raw, uneditable JSON dump (see `inferObjectLeafType`).
  const effectiveType = node.type === 'object' ? (inferObjectLeafType(node) ?? node.type) : node.type;
  const supportsKeepWithinParentBounds =
    effectiveType === 'vector2' && (propertyPath.at(-1) ?? fieldKey) === 'position';
  const randomizable = RANDOMIZABLE_LEAF_TYPES.has(effectiveType);
  const animatable = ANIMATABLE_LEAF_TYPES.has(effectiveType);
  const transitionable = TRANSITIONABLE_PROPERTY_TYPES.has(effectiveType);
  const isModeSelector = isModeSelectorPropertyKey(propertyPath.at(-1) ?? fieldKey);
  const animationActive = Boolean(node.animation) && node.animation?.enabled !== false;
  const randomizerActive = !isModeSelector && randomizerIsActive(node.randomizer);
  const animationLock: PropertyLockState | null = animationActive ? propertyLockFromAnimation(displayValue) : null;
  const animationTrackLock = activeAnimationTrack ? propertyLockFromAnimation(displayValue) : null;
  const randomizerLock = isModeSelector
    ? null
    : randomizerLockForValue(effectiveType, node.randomizer, displayValue);
  const fieldLock = explicitLock ?? animationTrackLock ?? animationLock ?? randomizerLock;
  const scalarFieldLock = isPropertyLockState(fieldLock) ? fieldLock : null;
  const controlDisabled = fieldDisabled || propertyLockIsLocked(fieldLock);
  const setAnimation = (animation: typeof node.animation) =>
    onChange((prev) => {
      if (prev.kind !== 'leaf' || valuesEqual(prev.animation, animation)) return prev;
      return { ...prev, animation };
    });
  const setRandomizer = (randomizer: typeof node.randomizer) =>
    onChange((prev) => {
      if (prev.kind !== 'leaf' || valuesEqual(prev.randomizer, randomizer)) return prev;
      return { ...prev, randomizer };
    });
  const setRandomizerAxis = (axis: 'x' | 'y', randomizer: RandomizerConfig | undefined) =>
    setRandomizer(
      randomizer
        ? {
            ...(node.randomizer ?? { enabled: true }),
            axes: {
              ...(node.randomizer?.axes ?? {}),
              [axis]: randomizer,
            },
          }
        : (() => {
            if (!node.randomizer) return undefined;
            const axes = { ...(node.randomizer.axes ?? {}) };
            delete axes[axis];
            if (
              Object.keys(axes).length === 0 &&
              node.randomizer.values === undefined &&
              node.randomizer.range === undefined &&
              node.randomizer.trigger === undefined &&
              node.randomizer.updateEveryFrame === undefined
            ) {
              return undefined;
            }
            return { ...node.randomizer, axes };
          })(),
    );
  const setTransition = (transition: typeof node.transition) =>
    (() => {
      const shared = transition === undefined ? node.transition?.scope !== 'state' : transition.scope !== 'state';
      const stateApplied =
        shared &&
        overrideScopeKey !== undefined &&
        propertyPath.length > 0 &&
        stateApplySuggestion?.applyTransitionToStates({ scopeKey: overrideScopeKey, propertyPath }, transition);
      if (stateApplied) return;
      onChange((prev) => {
        if (prev.kind !== 'leaf' || valuesEqual(prev.transition, transition)) return prev;
        return { ...prev, transition };
      });
    })();
  const transitionAction =
    transitionable && !isModeSelector ? (
      <TransitionPropertyAffordance
        label={label}
        transition={node.transition}
        currentValue={displayValue}
        leafType={effectiveType}
        meta={meta}
        paintCapabilities={paintCapabilities}
        defaultScope={stateApplySuggestion?.stateSuffix != null ? 'state' : undefined}
        onChange={setTransition}
      />
    ) : null;
  const randomizerActionDisabled = fieldDisabled;
  const randomizerAction =
    !isModeSelector && randomizable && (effectiveType !== 'vector2' || randomizerHasWholeValue(node.randomizer)) ? (
      <RandomizerPropertyAffordance
        label={label}
        leafType={effectiveType}
        currentValue={displayValue}
        randomizer={node.randomizer}
        onChange={setRandomizer}
        meta={meta}
        paintCapabilities={paintCapabilities}
        axisInlineEndContent={override?.axisInlineEndContent}
        inlineEndContentInteractive={override?.axisInlineEndContentInteractive}
        supportsStatePersistence={override?.supportsStatePersistence}
        supportsKeepWithinParentBounds={supportsKeepWithinParentBounds}
        disabled={randomizerActionDisabled}
      />
    ) : null;
  const vectorAxisRandomizerActions =
    !isModeSelector && effectiveType === 'vector2'
      ? {
          x: (
            <RandomizerPropertyAffordance
              label={`${label} X`}
              leafType="number"
              currentValue={
                displayValue && typeof displayValue === 'object' ? ((displayValue as { x?: number }).x ?? 0) : 0
              }
              randomizer={node.randomizer?.axes?.x}
              onChange={(next) => setRandomizerAxis('x', next)}
              meta={meta}
              paintCapabilities={paintCapabilities}
              inlineEndContent={override?.axisInlineEndContent?.x}
              inlineEndContentInteractive={override?.axisInlineEndContentInteractive}
              supportsStatePersistence={override?.supportsStatePersistence}
              supportsKeepWithinParentBounds={supportsKeepWithinParentBounds}
              disabled={randomizerActionDisabled}
            />
          ),
          y: (
            <RandomizerPropertyAffordance
              label={`${label} Y`}
              leafType="number"
              currentValue={
                displayValue && typeof displayValue === 'object' ? ((displayValue as { y?: number }).y ?? 0) : 0
              }
              randomizer={node.randomizer?.axes?.y}
              onChange={(next) => setRandomizerAxis('y', next)}
              meta={meta}
              paintCapabilities={paintCapabilities}
              inlineEndContent={override?.axisInlineEndContent?.y}
              inlineEndContentInteractive={override?.axisInlineEndContentInteractive}
              supportsStatePersistence={override?.supportsStatePersistence}
              supportsKeepWithinParentBounds={supportsKeepWithinParentBounds}
              disabled={randomizerActionDisabled}
            />
          ),
        }
      : undefined;
  const compactActions = animatable ? (
    <div className="flex shrink-0 items-center gap-1">
      {animatable &&
        (node.animation ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="rounded-md bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 hover:text-yellow-300"
                aria-label="Animation active"
                aria-pressed
              >
                <MotionIcon className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Animation active (edit below)
            </TooltipContent>
          </Tooltip>
        ) : null)}
    </div>
  ) : undefined;
  let control: ReactNode;

  if (fieldKey === 'antialiasScale' && meta.options) {
    control = (
      <SelectField
        id={id}
        label={label}
        description={description}
        options={meta.options}
        optionLabels={meta.optionLabels}
        value={antialiasScaleOption(displayValue)}
        onChange={(next) => setValue(Number(next))}
        childrenAfter={compactActions}
        disabled={controlDisabled}
        lock={scalarFieldLock}
      />
    );
  } else if (
    fieldKey === 'horizontalAlignment' ||
    fieldKey === 'verticalAlignment' ||
    fieldKey === 'horizontalSingleItemAlignment' ||
    fieldKey === 'verticalSingleItemAlignment'
  ) {
    const mode = fieldKey === 'verticalAlignment' || fieldKey === 'verticalSingleItemAlignment' ? 'vertical' : 'horizontal';
    const alignmentMode = mode;
    control = (
      <AlignmentField
        id={id}
        label={label}
        description={description}
        options={meta.options ?? []}
        optionDescriptions={meta.optionDescriptions}
        value={typeof displayValue === 'string' ? displayValue : (meta.options?.[0] ?? '')}
        onChange={(next) => setValue(next)}
        mode={alignmentMode}
        childrenAfter={compactActions}
        disabled={controlDisabled}
        lock={scalarFieldLock}
      />
    );
  } else if (fieldKey === 'style' && meta.options?.includes('oblique')) {
    control = (
      <FontStyleField
        id={id}
        label={label}
        description={description}
        value={typeof displayValue === 'string' ? displayValue : 'normal'}
        onChange={setValue}
        childrenAfter={compactActions}
        disabled={controlDisabled}
        lock={scalarFieldLock}
      />
    );
  } else if (effectiveType === 'number' && meta.slider) {
    control = (
      <SliderField
        id={id}
        label={label}
        description={description}
        value={typeof displayValue === 'number' ? displayValue : 0}
        min={meta.min ?? 0}
        max={meta.max ?? 100}
        step={meta.step ?? 1}
        onChange={setValue}
        formatValue={(next) =>
          next === 0 && meta.zeroLabel
            ? meta.zeroLabel
            : meta.sliderFormat === 'percent'
              ? `${Math.round(next * 100)}%`
              : `${next}${meta.unit ?? ''}`
        }
        childrenAfter={compactActions}
        disabled={controlDisabled}
        lock={scalarFieldLock}
      />
    );
  } else if (effectiveType === 'number' && meta.unit === '%') {
    control = (
      <SliderField
        id={id}
        label={label}
        description={description}
        value={typeof displayValue === 'number' ? displayValue : 0}
        min={meta.min ?? 0}
        max={meta.max ?? 100}
        step={meta.step ?? 1}
        onChange={setValue}
        formatValue={(next) => `${Math.round(next)}%`}
        childrenAfter={compactActions}
        disabled={controlDisabled}
        lock={scalarFieldLock}
      />
    );
  } else if (effectiveType === 'number' && (fieldKey === 'opacity' || fieldKey === 'strength')) {
    control = (
      <SliderField
        id={id}
        label={label}
        description={description}
        value={typeof displayValue === 'number' ? displayValue : 0}
        min={meta.min ?? 0}
        max={meta.max ?? 1}
        step={meta.step ?? 0.01}
        onChange={setValue}
        formatValue={(next) => `${Math.round(next * 100)}%`}
        childrenAfter={compactActions}
        disabled={controlDisabled}
        lock={scalarFieldLock}
      />
    );
  } else if (effectiveType === 'number' && fieldKey === 'steps') {
    control = (
      <SliderField
        id={id}
        label={label}
        description={description}
        value={typeof displayValue === 'number' ? displayValue : 0}
        min={meta.min ?? 0}
        max={meta.max ?? 32}
        step={meta.step ?? 1}
        onChange={setValue}
        formatValue={(next) => (next === 0 ? 'Off' : next === 1 ? 'Light' : `${Math.round(next)}`)}
        childrenAfter={compactActions}
        disabled={controlDisabled}
        lock={scalarFieldLock}
      />
    );
  } else if (effectiveType === 'number' && fieldKey === 'angle') {
    control = (
      <SliderField
        id={id}
        label={label}
        description={description}
        value={typeof displayValue === 'number' ? displayValue : 0}
        min={meta.min ?? -180}
        max={meta.max ?? 180}
        step={meta.step ?? 1}
        onChange={setValue}
        formatValue={(next) => `${Math.round(next)}\u00b0`}
        childrenAfter={compactActions}
        disabled={controlDisabled}
        lock={scalarFieldLock}
      />
    );
  } else {
    switch (effectiveType) {
      case 'number':
        control = (
          <NumberField
            id={id}
            label={label}
            description={description}
            meta={meta}
            value={typeof displayValue === 'number' ? displayValue : 0}
            onChange={setValue}
            childrenAfter={compactActions}
            disabled={controlDisabled}
            lock={scalarFieldLock}
          />
        );
        break;
      case 'fontWeight':
        control = (
          <FontWeightField
            id={id}
            label={label}
            description={description}
            meta={meta}
            value={typeof displayValue === 'number' ? displayValue : 400}
            onChange={setValue}
            childrenAfter={compactActions}
            disabled={controlDisabled}
            lock={scalarFieldLock}
          />
        );
        break;
      case 'numberOrAuto':
        control = (
          <NumberOrAutoField
            id={id}
            label={label}
            description={description}
            meta={meta}
            value={displayValue === 'auto' ? 'auto' : typeof displayValue === 'number' ? displayValue : 0}
            onChange={setValue}
            resolvedAutoValue={autoOffDefaults?.[fieldKey]}
            childrenAfter={compactActions}
            disabled={controlDisabled}
            lock={scalarFieldLock}
          />
        );
        break;
      case 'vector2':
        control = (
          <Vector2Field
            id={id}
            label={label}
            description={description}
            meta={meta}
            value={
              displayValue && typeof displayValue === 'object'
                ? (displayValue as { x: number; y: number })
                : { x: 0, y: 0 }
            }
            onChange={setValue}
            labelPrefix={labelPrefix}
            labelExtra={labelExtra}
            childrenAfter={compactActions}
            axisLabels={fieldKey === 'dimensions' ? { x: 'W', y: 'H' } : undefined}
            axisChildrenAfter={vectorAxisRandomizerActions}
            axisInlineEndContent={override?.axisInlineEndContent}
            axisInlineEndContentInteractive={override?.axisInlineEndContentInteractive}
            axisLayout={override?.axisLayout}
            disabled={fieldDisabledState}
            lock={fieldLock}
          />
        );
        break;
      case 'rect':
        control = (
          <RectField
            id={id}
            label={label}
            description={description}
            meta={meta}
            value={normalizeRect(displayValue)}
            onChange={setValue}
            childrenAfter={compactActions}
            labelPrefix={labelPrefix}
            labelExtra={labelExtra}
            disabled={controlDisabled}
            lock={scalarFieldLock}
          />
        );
        break;
      case 'paint':
        control = (
          <PaintField
            id={id}
            label={label}
            description={description}
            value={normalizePaint(displayValue, solidPaint('#000000'))}
            onChange={setValue}
            variant={fieldKey === 'fill' ? 'fill' : 'default'}
            capabilities={paintCapabilities}
            childrenAfter={compactActions}
            disabled={controlDisabled}
            lock={scalarFieldLock}
          />
        );
        break;
      case 'pattern': {
        const normalizedPattern =
          lockFillPatternBaseColor && fillPatternBaseColor
            ? normalizePatternLeafValue(displayValue, fillPatternBaseColor, { syncBaseColor: true })
            : normalizePatternLeafValue(displayValue, '#000000');
        const patternValue =
          normalizedPattern.pattern === 'single'
            ? normalizedPattern
            : normalizePatternLeafValue(normalizedPattern, fillPatternBaseColor ?? '#000000', {
                syncBaseColor: lockFillPatternBaseColor,
                ensureAtLeastOneColor: true,
              });
        control = (
          <FillPatternField
            id={id}
            label={label}
            description={description}
            value={patternValue}
            onChange={setValue}
            childrenAfter={compactActions}
            disabled={controlDisabled}
            baseColor={fillPatternBaseColor}
            lockBaseColor={lockFillPatternBaseColor}
          />
        );
        break;
      }
      case 'boolean':
        control = (
          <BooleanField
            id={id}
            label={label}
            description={description}
            value={Boolean(displayValue)}
            onChange={setValue}
            childrenAfter={compactActions}
            disabled={controlDisabled}
            lock={scalarFieldLock}
          />
        );
        break;
      case 'string':
        if (
          (fieldKey === 'anchor' || fieldKey === 'pivot') &&
          typeof displayValue === 'string' &&
          (!meta.options || areAnchorValues(meta.options))
        ) {
          control = (
            <AnchorField
              id={id}
              label={label}
              description={description}
              value={displayValue}
              onChange={setValue}
              allowedAnchors={meta.options ?? ANCHOR_VALUES}
              childrenAfter={compactActions}
              disabled={controlDisabled}
              lock={scalarFieldLock}
              variant={fieldKey === 'pivot' ? 'pivot' : 'anchor'}
            />
          );
          break;
        }
        if (fieldKey === 'joinType' && meta.options) {
          control = (
            <JoinTypeField
              id={id}
              label={label}
              description={description}
              options={meta.options}
              value={typeof displayValue === 'string' ? displayValue : meta.options[0]}
              onChange={setValue}
              childrenAfter={compactActions}
              disabled={controlDisabled}
              lock={scalarFieldLock}
            />
          );
          break;
        }
        if (fieldKey === 'capType' && meta.options) {
          control = (
            <CapTypeField
              id={id}
              label={label}
              description={description}
              options={meta.options}
              value={typeof displayValue === 'string' ? displayValue : meta.options[0]}
              onChange={setValue}
              childrenAfter={compactActions}
              disabled={controlDisabled}
              lock={scalarFieldLock}
            />
          );
          break;
        }
        control = meta.options ? (
          <SelectField
            id={id}
            label={label}
            description={description}
            options={meta.options}
            optionLabels={meta.optionLabels}
            optionDescriptions={meta.optionDescriptions}
            value={typeof displayValue === 'string' ? displayValue : meta.options[0]}
            onChange={setValue}
            optionEntityKind={meta.optionEntityKind}
            onHoverEntity={onHoverEntity ?? undefined}
            childrenAfter={compactActions}
            disabled={controlDisabled}
            lock={scalarFieldLock}
          />
        ) : (
          <StringField
            id={id}
            label={label}
            description={description}
            value={typeof displayValue === 'string' ? displayValue : ''}
            onChange={setValue}
            childrenAfter={compactActions}
            disabled={controlDisabled}
            lock={scalarFieldLock}
          />
        );
        break;
      case 'fontFamily':
        return propertyAnchor(
          <FontFamilyField
            id={id}
            label={label}
            value={displayValue as string | string[]}
            onChange={setValue}
            emptyMessage={
              propertyPath.at(-2) === 'emojis'
                ? 'No emoji font selected - the Font family selected above is used.'
                : undefined
            }
            disabled={controlDisabled}
            lock={scalarFieldLock}
          />,
        );
      case 'list':
      case 'array':
        return propertyAnchor(
          <FieldRow label={label} description={description} lock={scalarFieldLock}>
            <div className={cn(controlDisabled && 'pointer-events-none opacity-60')}>
              <ListItemsView
                node={node}
                fieldKey={fieldKey}
                onChange={onChange}
                depth={depth}
                stateKeyPrefix={stateKeyPrefix}
                overrideScopeKey={overrideScopeKey}
                propertyPath={propertyPath}
              />
            </div>
          </FieldRow>,
        );
      default:
        control = (
          <RawJsonField
            id={id}
            label={label}
            value={displayValue}
            onChange={setValue}
            disabled={controlDisabled}
            lock={scalarFieldLock}
          />
        );
        break;
    }
  }

  // Keep the control subtree stable while the randomizer changes its lock
  // state, so stateful controls such as popovers do not remount.
  const fieldLocked =
    fieldDisabled ||
    (randomizerActive && (effectiveType !== 'vector2' || randomizerHasWholeValue(node.randomizer)));
  const controlWithAnimationTrack = (
    <FieldLabelExtraContext.Provider
      value={
        <>
          {parentLabelExtra}
          {randomizerAction}
          {transitionAction}
        </>
      }
    >
      <AnimationTrackLabelExtra scopeKey={overrideScopeKey ?? stateKeyPrefix ?? ''} propertyPath={propertyPath}>
        <div
          className={fieldLocked ? '[&_input]:pointer-events-none [&_[role=slider]]:pointer-events-none' : undefined}
        >
          {control}
        </div>
      </AnimationTrackLabelExtra>
    </FieldLabelExtraContext.Provider>
  );

  if (!randomizable && !animatable) {
    return propertyAnchor(
      helper ? (
        <div className="flex flex-col gap-1">
          {controlWithAnimationTrack}
          {helper}
        </div>
      ) : (
        controlWithAnimationTrack
      ),
    );
  }

  // Keep the authored field visible while its effective value comes from the
  // randomizer. The popover remains interactive so the authored values can change.
  return propertyAnchor(
    <div className={INSPECTOR_CARD_CONTENT_STACK_CLASS}>
      {controlWithAnimationTrack}
      {helper}
      {node.animation && (
        <div className="w-full">
          <AnimationEditor
            leafType={effectiveType}
            meta={meta}
            currentValue={node.value}
            animation={node.animation}
            onChange={setAnimation}
            paintCapabilities={paintCapabilities}
          />
        </div>
      )}
    </div>,
  );
}

/**
 * Add/remove/duplicate/reorder chrome plus per-item editors over a
 * `list`/`array` leaf's items. Container items recurse through
 * `PropertyTreeView`. Raw primitive items, for example a fixed `[x, y]` pair,
 * use a plain JSON field so no
 * data is silently dropped.
 */
function ListItemsView({
  node,
  fieldKey,
  onChange,
  stateKeyPrefix,
  overrideScopeKey,
  propertyPath = [fieldKey],
}: PropertyTreeViewProps) {
  if (node.kind !== 'leaf') return null;
  const label = humanizeFieldKey(fieldKey);

  return (
    <ListEditor
      node={node}
      label={label}
      onChange={onChange}
      renderItem={(rawItem, index, onItemChange) => {
        const itemNode = parseNode(rawItem);
        if (!itemNode) {
          return (
            <RawJsonField
              id={`field-${fieldKey}-${index}`}
              label={`${label} value`}
              value={rawItem}
              onChange={onItemChange}
            />
          );
        }
        return (
          <PropertyTreeView
            node={itemNode}
            fieldKey={`${fieldKey}[${index}]`}
            depth={1}
            stateKeyPrefix={appendInspectorStateKey(stateKeyPrefix, `${fieldKey}[${index}]`)}
            overrideScopeKey={overrideScopeKey ?? stateKeyPrefix}
            propertyPath={[
              ...propertyPath.slice(0, -1),
              `${propertyPath[propertyPath.length - 1] ?? fieldKey}[${index}]`,
            ]}
            onChange={(updater) => onItemChange(serializeNode(updater(itemNode)))}
          />
        );
      }}
    />
  );
}

function InspectorAccordion({
  entries,
  stateKeyPrefix,
  overrideScopeKey,
  propertyPath,
  updateChild,
  depth,
}: {
  entries: [string, ContainerNode][];
  stateKeyPrefix: string;
  overrideScopeKey?: string;
  propertyPath: readonly string[];
  updateChild: (key: string, updater: (previous: PropertyNode) => PropertyNode) => void;
  depth: number;
}) {
  const context = useContext(InspectorCardStateContext);
  const visibleEntries = entries.filter(([key, child]) => {
    if (key !== 'options') return true;
    return Object.keys(child.children).length > 0;
  });
  const openValues = context
    ? visibleEntries
        .filter(([key]) => context.openState[appendInspectorStateKey(stateKeyPrefix, key) ?? ''] ?? false)
        .map(([key]) => key)
    : [];

  return (
    <Accordion
      type="multiple"
      className="w-full"
      value={openValues}
      onValueChange={(nextValues) => {
        if (!context) return;
        context.updateOpenState((previous) => {
          let next = previous;
          for (const [key] of visibleEntries) {
            const path = appendInspectorStateKey(stateKeyPrefix, key);
            if (!path) continue;
            const shouldOpen = nextValues.includes(key);
            if ((previous[path] ?? false) === shouldOpen) continue;
            if (next === previous) next = { ...previous };
            next[path] = shouldOpen;
          }
          return next;
        });
      }}
    >
      {visibleEntries.map(([key, child]) => (
        <AccordionItem key={key} value={key}>
          <AccordionTrigger className="py-2 text-sm font-medium">
            <span className="inline-flex items-center gap-2.5">
              {headerIconForComponent(key)}
              {humanizeFieldKey(key)}
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <PropertyTreeView
              node={child}
              fieldKey={key}
              depth={depth + 1}
              stateKeyPrefix={appendInspectorStateKey(stateKeyPrefix, key)}
              overrideScopeKey={overrideScopeKey}
              propertyPath={[...propertyPath, key]}
              onChange={(updater) => updateChild(key, updater)}
            />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

export interface PropertyCardProps {
  title: string;
  node: ContainerNode;
  fieldKey: string;
  onChange: (updater: (previous: PropertyNode) => PropertyNode) => void;
  /** Nesting depth passed straight through to the body's `PropertyTreeView` - the card itself is presentational only, not an extra tree level. */
  depth?: number;
  /** Bigger/bolder title for a top-level design section (Composition Area/Page/Rows/a word style) vs. a nested property group. */
  emphasized?: boolean;
  /** Optional small icon rendered beside the title text. */
  titleIcon?: ReactNode;
  /** Optional explanation shown by an info icon immediately after the title. */
  titleHelp?: string;
  /** Extra header controls rendered between the title and the collapse/toggle controls. */
  headerExtra?: ReactNode;
  /** When false, the `enabled` switch is hidden for this card. */
  allowDisable?: boolean;
  /** Stable per-card key for persisting collapse state for this inspector entity. */
  stateKey?: string;
  /** Stable owner scope used for lifecycle-state override lookup. */
  overrideScopeKey?: string;
  /** Accumulated property path within the owner scope. */
  propertyPath?: readonly string[];
  /** Optional label shown above a paired horizontal/vertical alignment section. */
  alignmentLabel?: string;
  /** Top-level fields to omit from this property card without removing them from the saved component. */
  hiddenFieldKeys?: ReadonlySet<string>;
  /** Groups dependent top-level fields under their controlling field. */
  dependentFieldGroups?: Readonly<Record<string, readonly string[] | DependentFieldGroup>>;
  /** Optional extra classes for the outer card. */
  className?: string;
  /** Optional content rendered below the body after a divider. The card shows it when open. */
  footer?: ReactNode;
}

/**
 * Collapsible card used for both top-level design sections (Composition Area,
 * Page, Rows, the selected word style) and nested property groups
 * (background, motionBlur, and related groups). When the wrapped container has
 * its own `enabled` boolean field, that toggle moves into the card header. It is
 * not another field in the
 * body, and while disabled the body collapses down to only the header
 * (title + toggle), since there is nothing to configure for a style block
 * that is currently switched off.
 */
export function PropertyCard({
  title,
  node,
  fieldKey,
  onChange,
  depth = 0,
  emphasized,
  titleIcon,
  titleHelp,
  headerExtra,
  allowDisable,
  stateKey,
  overrideScopeKey,
  propertyPath = [],
  alignmentLabel,
  hiddenFieldKeys,
  dependentFieldGroups,
  className,
  footer,
}: PropertyCardProps) {
  const fieldOverrides = useContext(FieldOverridesContext);
  const hasTopBanner = useContext(InspectorCardSurfaceContext);
  const enabledLeaf = node.children.enabled;
  const hasEnabledToggle = isLeaf(enabledLeaf) && enabledLeaf.type === 'boolean' && allowDisable !== false;
  const enabledLock = fieldOverrides?.enabled?.lock ?? null;
  const enabledLockState = isPropertyLockState(enabledLock) ? enabledLock : null;
  const enabledValue = hasEnabledToggle
    ? Boolean(enabledLockState?.locked ? enabledLockState.value : enabledLeaf.value)
    : true;
  const [open, setOpen] = useInspectorCardOpenState(stateKey, stateKey ? false : true);
  // Disabling auto-collapses the body (nothing to configure for a block that is currently
  // switched off) but does not lock it - the chevron/header stay clickable so it can still be
  // expanded to inspect or edit settings while disabled. Only fires on an actual on->off
  // transition, never on mount, so an already-disabled-and-reopened card does not flash shut.
  const wasEnabledRef = useRef(enabledValue);
  useEffect(() => {
    if (wasEnabledRef.current && !enabledValue) setOpen(false);
    wasEnabledRef.current = enabledValue;
  }, [enabledValue, setOpen]);
  const visualOpen = open;
  const showBody = visualOpen;

  // `enabled` now lives in the header, so strip it from the body's fields to avoid rendering it twice.
  const bodyNode: ContainerNode =
    hasEnabledToggle || allowDisable === false
      ? { ...node, children: Object.fromEntries(Object.entries(node.children).filter(([key]) => key !== 'enabled')) }
      : node;

  const setEnabled = (next: boolean) =>
    onChange((prev) => {
      if (prev.kind !== 'container' || !isLeaf(prev.children.enabled)) return prev;
      if (Boolean(prev.children.enabled.value) === next) return prev;
      return { ...prev, children: { ...prev.children, enabled: { ...prev.children.enabled, value: next } } };
    });
  return (
    <SubCard className={cn('border-border shadow-none gap-0 py-0', className, hasTopBanner && 'rounded-t-none')}>
      <InspectorCardSurfaceContext.Provider value={false}>
        <div className="flex flex-col overflow-hidden rounded-[inherit]">
          <SubCardHeader
            className={cn(INSPECTOR_COMPACT_CARD_HEADER_CLASS, INSPECTOR_CARD_HEADER_GROUP_CLASS, 'cursor-pointer')}
            data-state={visualOpen ? 'open' : 'closed'}
            onClick={() => setOpen(!open)}
          >
            <div className="flex min-w-0 items-center gap-2">
              {hasEnabledToggle && (
                <span className="flex shrink-0" onClick={(event) => event.stopPropagation()}>
                  <Checkbox
                    checked={enabledValue}
                    onCheckedChange={(next) => setEnabled(Boolean(next))}
                    disabled={propertyLockIsLocked(enabledLock)}
                    aria-label={`${title} enabled`}
                  />
                </span>
              )}
              <PropertyLockIndicator lock={enabledLockState} className="size-3" />
              <CardTitle className="text-sm font-medium">
                <span className="inline-flex items-center gap-1.5">
                  {titleIcon}
                  {title}
                  {titleHelp && (
                    <InfoTooltip ariaLabel={`Explain ${title}`} side="top">
                      {titleHelp}
                    </InfoTooltip>
                  )}
                </span>
              </CardTitle>
            </div>
            <div className={INSPECTOR_HEADER_ACTION_ROW_CLASS} onClick={(e) => e.stopPropagation()}>
              {headerExtra}
              <button
                type="button"
                aria-label={visualOpen ? 'Collapse' : 'Expand'}
                aria-expanded={visualOpen}
                onClick={() => setOpen(!open)}
                className="text-muted-foreground hover:text-foreground -m-1 flex size-6 shrink-0 items-center justify-center rounded"
              >
                <ChevronDown className={`size-4 transition-transform duration-200 ${visualOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </SubCardHeader>
          {showBody && (
            <CardContent className={cn(INSPECTOR_CARD_CONTENT_CLASS, INSPECTOR_CARD_CONTENT_STACK_CLASS)}>
              <PropertyTreeView
                node={bodyNode}
                fieldKey={fieldKey}
                depth={depth}
                stateKeyPrefix={stateKey}
                overrideScopeKey={overrideScopeKey ?? stateKey}
                propertyPath={propertyPath}
                alignmentLabel={alignmentLabel}
                hiddenFieldKeys={hiddenFieldKeys}
                dependentFieldGroups={dependentFieldGroups}
                onChange={onChange}
              />
            </CardContent>
          )}
          {footer && (
            <div
              className={cn('border-border border-t px-3 py-2', !enabledValue && 'opacity-70')}
              onClick={(e) => e.stopPropagation()}
            >
              {footer}
            </div>
          )}
        </div>
      </InspectorCardSurfaceContext.Provider>
    </SubCard>
  );
}

export interface CollapsibleCardProps {
  title: string;
  /** Bigger/bolder title, matching `PropertyCard`'s top-level styling. */
  emphasized?: boolean;
  children: ReactNode;
  /** When false, renders a plain card header with no chevron or click toggle. */
  collapsible?: boolean;
  /** Extra header content (e.g. a tab switcher) rendered right of the title, left of the collapse chevron. */
  headerExtra?: ReactNode;
  /** Optional small icon rendered beside the title text. */
  titleIcon?: ReactNode;
  /** Whether the optional title icon appears before or after the title. */
  titleIconPosition?: 'before' | 'after';
  /** Optional explanation shown by an info icon immediately after the title. */
  titleHelp?: string;
  /** Use the compact header dimensions shared by component cards. */
  compactHeader?: boolean;
  /** Optional enable control rendered before the title icon. */
  enabled?: boolean;
  /** Updates the optional enable control's value. */
  onEnabledChange?: (next: boolean) => void;
  /** Shows why the enable control is read-only when the engine owns it. */
  enabledLock?: PropertyLockState | null;
  /** Optional custom padding for the card body (used by dense inspector layouts). */
  contentClassName?: string;
  /** Stable per-card key for persisting collapse state for this inspector entity. */
  stateKey?: string;
  /** Optional extra classes for the outer card. */
  className?: string;
}

/**
 * Same collapsible-card chrome as `PropertyCard` (chevron button, optional
 * emphasized title) for top-level sections that are not a single property
 * container - e.g. Settings' lone scalar field, or Words' tabbed
 * lifecycle-state switcher - so every top-level section reads consistently
 * as a card regardless of what it wraps.
 */
export function CollapsibleCard({
  title,
  emphasized,
  children,
  collapsible = true,
  headerExtra,
  titleIcon,
  titleIconPosition = 'before',
  titleHelp,
  compactHeader = false,
  enabled,
  onEnabledChange,
  enabledLock = null,
  contentClassName,
  stateKey,
  className,
}: CollapsibleCardProps) {
  const [open, setOpen] = useInspectorCardOpenState(stateKey, stateKey ? false : true);
  const hasTopBanner = useContext(InspectorCardSurfaceContext);
  const hasEnabledToggle = enabled !== undefined && onEnabledChange !== undefined;
  const enabledValue = enabledLock?.locked ? Boolean(enabledLock.value) : (enabled ?? true);
  const wasEnabledRef = useRef(enabledValue);
  useEffect(() => {
    if (wasEnabledRef.current && !enabledValue) setOpen(false);
    wasEnabledRef.current = enabledValue;
  }, [enabledValue, setOpen]);

  return (
    <SubCard className={cn('border-border shadow-none gap-0 py-0', className, hasTopBanner && 'rounded-t-none')}>
      <InspectorCardSurfaceContext.Provider value={false}>
        <div className="flex flex-col overflow-hidden rounded-[inherit]">
          <SubCardHeader
            className={cn(
              compactHeader
                ? cn(INSPECTOR_COMPACT_CARD_HEADER_CLASS, INSPECTOR_CARD_HEADER_GROUP_CLASS)
                : 'sticky top-0 flex items-center justify-between gap-3 bg-muted px-4 py-3',
              collapsible && 'cursor-pointer',
            )}
            data-state={open ? 'open' : 'closed'}
            onClick={collapsible ? () => setOpen(!open) : undefined}
          >
            <div className="flex min-w-0 items-center gap-2">
              {hasEnabledToggle && (
                <span className="flex shrink-0" onClick={(event) => event.stopPropagation()}>
                  <Checkbox
                    checked={enabledValue}
                    onCheckedChange={(next) => onEnabledChange(Boolean(next))}
                    disabled={enabledLock?.locked === true}
                    aria-label={`${title} enabled`}
                  />
                </span>
              )}
              <CardTitle className="text-sm font-medium">
                <span className="inline-flex items-center gap-1.5">
                  {titleIconPosition === 'before' && titleIcon}
                  {title}
                  {titleHelp && (
                    <InfoTooltip ariaLabel={`Explain ${title}`} side="top">
                      {titleHelp}
                    </InfoTooltip>
                  )}
                  {titleIconPosition === 'after' && titleIcon}
                </span>
              </CardTitle>
              <PropertyLockIndicator lock={enabledLock} className="size-3" />
            </div>
            <div className={INSPECTOR_HEADER_ACTION_ROW_CLASS} onClick={(e) => e.stopPropagation()}>
              {headerExtra}
              {collapsible && (
                <button
                  type="button"
                  aria-label={open ? 'Collapse' : 'Expand'}
                  aria-expanded={open}
                  onClick={() => setOpen(!open)}
                  className="text-muted-foreground hover:text-foreground -m-1 flex size-6 shrink-0 items-center justify-center rounded"
                >
                  <ChevronDown className={`size-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
                </button>
              )}
            </div>
          </SubCardHeader>
          {open && (
            <CardContent
              className={cn(INSPECTOR_CARD_CONTENT_CLASS, INSPECTOR_CARD_CONTENT_STACK_CLASS, contentClassName)}
            >
              {children}
            </CardContent>
          )}
        </div>
      </InspectorCardSurfaceContext.Provider>
    </SubCard>
  );
}

type AlignmentPair = {
  horizontal: [string, PropertyNode];
  vertical: [string, PropertyNode];
};

function AlignmentPairFields({
  alignmentPair,
  horizontalDependentEntries = [],
  verticalDependentEntries = [],
  depth,
  propertyPath,
  overrideScopeKey,
  stateKeyPrefix,
  updateChild,
}: {
  alignmentPair: AlignmentPair;
  horizontalDependentEntries?: readonly [string, PropertyNode][];
  verticalDependentEntries?: readonly [string, PropertyNode][];
  depth: number;
  propertyPath: readonly string[];
  overrideScopeKey?: string;
  stateKeyPrefix?: string;
  updateChild: (key: string, updater: (previous: PropertyNode) => PropertyNode) => void;
}): ReactNode {
  return (
    <div className="min-w-0">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-x-3">
        <div className="min-w-0">
          <PropertyTreeView
            node={alignmentPair.horizontal[1]}
            fieldKey={alignmentPair.horizontal[0]}
            depth={depth + 1}
            stateKeyPrefix={stateKeyPrefix}
            overrideScopeKey={overrideScopeKey}
            propertyPath={[...propertyPath, alignmentPair.horizontal[0]]}
            onChange={(updater) => updateChild(alignmentPair.horizontal[0], updater)}
          />
          {horizontalDependentEntries.length > 0 && (
            <DependentSetting>
              {horizontalDependentEntries.map(([dependentKey, dependentChild]) => (
                <PropertyTreeView
                  key={dependentKey}
                  node={dependentChild}
                  fieldKey={dependentKey}
                  depth={depth + 1}
                  stateKeyPrefix={stateKeyPrefix}
                  overrideScopeKey={overrideScopeKey}
                  propertyPath={[...propertyPath, dependentKey]}
                  onChange={(updater) => updateChild(dependentKey, updater)}
                />
              ))}
            </DependentSetting>
          )}
        </div>
        <div className="min-w-0">
          <PropertyTreeView
            node={alignmentPair.vertical[1]}
            fieldKey={alignmentPair.vertical[0]}
            depth={depth + 1}
            stateKeyPrefix={stateKeyPrefix}
            overrideScopeKey={overrideScopeKey}
            propertyPath={[...propertyPath, alignmentPair.vertical[0]]}
            onChange={(updater) => updateChild(alignmentPair.vertical[0], updater)}
          />
          {verticalDependentEntries.length > 0 && (
            <DependentSetting>
              {verticalDependentEntries.map(([dependentKey, dependentChild]) => (
                <PropertyTreeView
                  key={dependentKey}
                  node={dependentChild}
                  fieldKey={dependentKey}
                  depth={depth + 1}
                  stateKeyPrefix={stateKeyPrefix}
                  overrideScopeKey={overrideScopeKey}
                  propertyPath={[...propertyPath, dependentKey]}
                  onChange={(updater) => updateChild(dependentKey, updater)}
                />
              ))}
            </DependentSetting>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Recursively renders a container's children. Shallow levels render as flat
 * stacked rows. Nested style blocks collapse into an accordion so deep
 * presets (for example, currentWordStyle -> text -> font) stay navigable. Transition
 * configuration is attached to the affordance on each transitionable leaf.
 */
export function PropertyTreeView({
  node,
  fieldKey,
  onChange,
  depth = 0,
  stateKeyPrefix,
  overrideScopeKey,
  propertyPath = [],
  alignmentLabel,
  suppressAlignmentSection = false,
  hiddenFieldKeys,
  dependentFieldGroups,
  fillPatternBaseColor,
  lockFillPatternBaseColor = false,
}: PropertyTreeViewProps) {
  const fieldOverrides = useContext(FieldOverridesContext);
  if (node.kind === 'leaf' && node.runtimeOnly) return null;
  if (node.kind === 'leaf') {
    return (
      <LeafFieldView
        node={node}
        fieldKey={fieldKey}
        onChange={onChange}
        depth={depth}
        stateKeyPrefix={stateKeyPrefix}
        overrideScopeKey={overrideScopeKey ?? stateKeyPrefix}
        propertyPath={propertyPath.length > 0 ? propertyPath : [fieldKey]}
        fillPatternBaseColor={fillPatternBaseColor}
        lockFillPatternBaseColor={lockFillPatternBaseColor}
      />
    );
  }

  // When this container has its own `enabled` toggle (for example, a Shadow/Stroke
  // list item, or any nested style block not routed through `PropertyCard`'s
  // header-toggle treatment below), collapse every other field the instant
  // it is switched off -- there is nothing to configure for a block that is
  // currently disabled, so leaving its sub-fields visible/editable while
  // "Enabled" reads off is confusing.
  const enabledLeaf = node.children.enabled;
  const hasEnabledToggle = isLeaf(enabledLeaf) && enabledLeaf.type === 'boolean';
  const enabledOff = hasEnabledToggle && !enabledLeaf.value;

  const effectiveHiddenFieldKeys =
    fieldKey === 'childWindow' &&
    node.children.windowMode?.kind === 'leaf' &&
    node.children.windowMode.type === 'string' &&
    node.children.windowMode.value === 'all'
      ? new Set([
          ...(hiddenFieldKeys ?? []),
          'windowCount',
          'windowAxis',
          'windowAnchor',
          'windowSelection',
        ])
      : hiddenFieldKeys;
  const entries = Object.entries(node.children).filter(
    ([key]) => !effectiveHiddenFieldKeys?.has(key) && (!enabledOff || key === 'enabled'),
  );
  const leafEntries = entries.filter(([, child]) => child.kind === 'leaf' && !child.runtimeOnly);
  const alignmentDependentGroupFor = (key: string): DependentFieldGroup => ({
    fields: [key === 'horizontalAlignment' ? 'horizontalSingleItemAlignment' : 'verticalSingleItemAlignment'],
    isVisible: (controller) => controller.kind === 'leaf' && controller.value === 'stretch',
  });
  const dependentGroupFor = (key: string): DependentFieldGroupValue | undefined =>
    (key === 'horizontalAlignment' || key === 'verticalAlignment')
      ? (dependentFieldGroups?.[key] ?? alignmentDependentGroupFor(key))
      : dependentFieldGroups?.[key];
  const alignmentDependentKeys = ['horizontalSingleItemAlignment', 'verticalSingleItemAlignment'];
  const dependentFieldKeys = new Set(
    Object.values(dependentFieldGroups ?? {})
      .flatMap((group) => dependentFields(group))
      .concat(alignmentDependentKeys),
  );
  const horizontalAlignmentEntry = entries.find(
    ([key, child]) => key === 'horizontalAlignment' && child.kind === 'leaf',
  );
  const verticalAlignmentEntry = entries.find(([key, child]) => key === 'verticalAlignment' && child.kind === 'leaf');
  const alignmentPair: AlignmentPair | null =
    (alignmentLabel || fieldKey === 'childrenAlignment') && horizontalAlignmentEntry && verticalAlignmentEntry
      ? { horizontal: horizontalAlignmentEntry, vertical: verticalAlignmentEntry }
      : null;
  const alignmentKeys = alignmentPair ? new Set(['horizontalAlignment', 'verticalAlignment']) : null;
  const dependentEntriesFor = (controllerEntry?: [string, PropertyNode]): [string, PropertyNode][] => {
    if (!controllerEntry) return [];
    const dependentGroup = dependentGroupFor(controllerEntry[0]);
    if (!dependentGroup || !dependentGroupIsVisible(dependentGroup, controllerEntry[1])) return [];
    return dependentFields(dependentGroup)
      .map((dependentKey) => entries.find(([entryKey]) => entryKey === dependentKey))
      .filter((entry): entry is [string, PropertyNode] => entry !== undefined);
  };
  const horizontalAlignmentDependentEntries = alignmentPair ? dependentEntriesFor(horizontalAlignmentEntry) : [];
  const verticalAlignmentDependentEntries = alignmentPair ? dependentEntriesFor(verticalAlignmentEntry) : [];
  const containerEntries = entries.filter(([, child]) => child.kind === 'container') as [string, ContainerNode][];
  const visibleContainerEntries = containerEntries.filter(([key, child]) => {
    if (key !== 'options') return true;
    return Object.keys(child.children).length > 0;
  });
  const localFillPatternBaseColor = resolveSolidColorFromPaintNode(node.children.fill);

  const updateChild = (key: string, updater: (previous: PropertyNode) => PropertyNode) =>
    onChange((prev) => {
      if (prev.kind !== 'container') return prev;
      const nextChild = updater(prev.children[key]);
      const nextChildren: Record<string, PropertyNode> = { ...prev.children, [key]: nextChild };
      const baseColor =
        resolveSolidColorFromPaintNode(nextChildren.fill) ?? resolveSolidColorFromPaintNode(prev.children.fill);
      const nextFillNode = nextChildren.fill;

      if (key === 'fillPattern' && baseColor && nextChild.kind === 'leaf' && nextChild.type === 'pattern') {
        const authoredPattern = normalizePatternLeafValue(nextChild.value, baseColor);
        if (authoredPattern.pattern === 'single') {
          nextChildren.fillPattern = { ...nextChild, value: authoredPattern };
        } else {
          const nextBaseColor = authoredPattern.colors[0] ?? baseColor;
          const normalizedPattern = normalizePatternLeafValue(nextChild.value, nextBaseColor, {
            syncBaseColor: true,
            ensureAtLeastOneColor: true,
          });
          nextChildren.fillPattern = { ...nextChild, value: normalizedPattern };
          if (nextFillNode?.kind === 'leaf' && nextFillNode.type === 'paint') {
            nextChildren.fill = { ...nextFillNode, value: solidPaint(nextBaseColor) };
          }
        }
      } else if (
        key === 'fill' &&
        baseColor &&
        nextChildren.fillPattern?.kind === 'leaf' &&
        nextChildren.fillPattern.type === 'pattern'
      ) {
        const pattern = normalizePatternLeafValue(nextChildren.fillPattern.value, baseColor);
        if (pattern.pattern !== 'single' && pattern.colors.length > 0) {
          nextChildren.fillPattern = {
            ...nextChildren.fillPattern,
            value: normalizePatternLeafValue(pattern, baseColor, { syncBaseColor: true, ensureAtLeastOneColor: true }),
          };
        }
      }

      return { ...prev, children: nextChildren };
    });

  const isInsetGroup = isInsetGroupNode(fieldKey, node);
  if (isInsetGroup) {
    const updateInsetEdge = (edge: InsetEdge, updater: (previous: PropertyNode) => PropertyNode) =>
      onChange((prev) => {
        if (prev.kind !== 'container') return prev;
        const nextEdge = updater(prev.children[edge]);
        const nextChildren: Record<string, PropertyNode> = { ...prev.children, [edge]: nextEdge };
        const pair = INSET_PAIRS.find(([first, second]) => first === edge || second === edge);
        const linkKey = pair?.[2];
        const linkNode = linkKey ? prev.children[linkKey] : undefined;
        const isLinked = linkNode?.kind !== 'leaf' || linkNode.type !== 'boolean' ? true : linkNode.value !== false;
        const pairedEdge = pair ? (pair[0] === edge ? pair[1] : pair[0]) : undefined;
        if (isLinked && isInsetNumberNode(nextEdge)) {
          const pairedNode = pairedEdge ? nextChildren[pairedEdge] : undefined;
          if (pairedEdge && isInsetNumberNode(pairedNode) && !valuesEqual(pairedNode.value, nextEdge.value)) {
            nextChildren[pairedEdge] = { ...pairedNode, value: nextEdge.value };
          }
        }
        return { ...prev, children: nextChildren };
      });
    const setInsetLinked = (linkKey: InsetLinkKey, nextLinked: boolean) =>
      onChange((prev) => {
        if (prev.kind !== 'container') return prev;
        const linkNode = prev.children[linkKey];
        const linkedLeaf =
          linkNode?.kind === 'leaf' && linkNode.type === 'boolean'
            ? { ...linkNode, value: nextLinked }
            : { kind: 'leaf' as const, type: 'boolean' as const, value: nextLinked };
        const nextChildren: Record<string, PropertyNode> = { ...prev.children, [linkKey]: linkedLeaf };
        if (nextLinked) {
          const pair = INSET_PAIRS.find(([, , pairLinkKey]) => pairLinkKey === linkKey);
          if (pair) {
            const [sourceEdge, pairedEdge] = pair;
            const sourceNode = nextChildren[sourceEdge];
            const pairedNode = nextChildren[pairedEdge];
            if (isInsetNumberNode(sourceNode) && isInsetNumberNode(pairedNode)) {
              nextChildren[pairedEdge] = { ...pairedNode, value: sourceNode.value };
            }
          }
        }
        return { ...prev, children: nextChildren };
      });
    return (
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-1 gap-y-1">
        {INSET_PAIRS.map(([firstEdge, secondEdge, linkKey]) => {
          const firstNode = node.children[firstEdge];
          const secondNode = node.children[secondEdge];
          const linkNode = node.children[linkKey];
          const isLinked = linkNode?.kind !== 'leaf' || linkNode.type !== 'boolean' ? true : linkNode.value !== false;
          if (!firstNode || !secondNode) return null;
          const pairLabel = `${humanizeFieldKey(firstEdge)} and ${humanizeFieldKey(secondEdge)}`;
          return (
            <Fragment key={`${firstEdge}-${secondEdge}`}>
              <div className="min-w-0">
                <PropertyTreeView
                  node={firstNode}
                  fieldKey={firstEdge}
                  depth={depth + 1}
                  stateKeyPrefix={appendInspectorStateKey(stateKeyPrefix, firstEdge)}
                  overrideScopeKey={overrideScopeKey ?? stateKeyPrefix}
                  propertyPath={[...propertyPath, firstEdge]}
                  onChange={(updater) => updateInsetEdge(firstEdge, updater)}
                />
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 self-end text-muted-foreground mb-1.5"
                    aria-label={isLinked ? `Unlink ${pairLabel}` : `Link ${pairLabel}`}
                    onClick={() => setInsetLinked(linkKey, !isLinked)}
                  >
                    {isLinked ? <Link2 className="size-3.5" /> : <Unlink2 className="size-3.5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isLinked ? `Unlink ${pairLabel}` : `Link ${pairLabel}`}</TooltipContent>
              </Tooltip>
              <div className="min-w-0">
                <PropertyTreeView
                  node={secondNode}
                  fieldKey={secondEdge}
                  depth={depth + 1}
                  stateKeyPrefix={appendInspectorStateKey(stateKeyPrefix, secondEdge)}
                  overrideScopeKey={overrideScopeKey ?? stateKeyPrefix}
                  propertyPath={[...propertyPath, secondEdge]}
                  onChange={(updater) => updateInsetEdge(secondEdge, updater)}
                />
              </div>
            </Fragment>
          );
        })}
      </div>
    );
  }

  return (
    <div className={INSPECTOR_CARD_CONTENT_STACK_CLASS}>
      {alignmentPair &&
        (suppressAlignmentSection ? (
          <AlignmentPairFields
            alignmentPair={alignmentPair}
            horizontalDependentEntries={horizontalAlignmentDependentEntries}
            verticalDependentEntries={verticalAlignmentDependentEntries}
            depth={depth}
            propertyPath={propertyPath}
            overrideScopeKey={overrideScopeKey ?? stateKeyPrefix}
            stateKeyPrefix={stateKeyPrefix}
            updateChild={updateChild}
          />
        ) : (
          <CollapsibleSection
            title={alignmentLabel ?? 'Children Alignment'}
            stateKey={stateKeyPrefix ? `${stateKeyPrefix}/children-alignment` : undefined}
          >
            <AlignmentPairFields
              alignmentPair={alignmentPair}
              horizontalDependentEntries={horizontalAlignmentDependentEntries}
              verticalDependentEntries={verticalAlignmentDependentEntries}
              depth={depth}
              propertyPath={propertyPath}
              overrideScopeKey={overrideScopeKey ?? stateKeyPrefix}
              stateKeyPrefix={stateKeyPrefix}
              updateChild={updateChild}
            />
          </CollapsibleSection>
        ))}
      {leafEntries.map(([key, child]) => {
        if (alignmentKeys?.has(key) || dependentFieldKeys.has(key)) return null;
        const dependentEntries = dependentEntriesFor([key, child]);
        return (
          <Fragment key={key}>
            <PropertyTreeView
              node={child}
              fieldKey={key}
              depth={depth + 1}
              stateKeyPrefix={stateKeyPrefix}
              overrideScopeKey={overrideScopeKey ?? stateKeyPrefix}
              propertyPath={[...propertyPath, key]}
              fillPatternBaseColor={key === 'fillPattern' ? localFillPatternBaseColor : undefined}
              lockFillPatternBaseColor={key === 'fillPattern' && localFillPatternBaseColor !== undefined}
              onChange={(updater) => updateChild(key, updater)}
            />
            {dependentEntries.length > 0 && (
              <DependentSetting>
                {dependentEntries.map(([dependentKey, dependentChild]) => (
                  <PropertyTreeView
                    key={dependentKey}
                    node={dependentChild}
                    fieldKey={dependentKey}
                    depth={depth + 1}
                    stateKeyPrefix={stateKeyPrefix}
                    overrideScopeKey={overrideScopeKey ?? stateKeyPrefix}
                    propertyPath={[...propertyPath, dependentKey]}
                    fillPatternBaseColor={dependentKey === 'fillPattern' ? localFillPatternBaseColor : undefined}
                    lockFillPatternBaseColor={dependentKey === 'fillPattern' && localFillPatternBaseColor !== undefined}
                    onChange={(updater) => updateChild(dependentKey, updater)}
                  />
                ))}
              </DependentSetting>
            )}
          </Fragment>
        );
      })}
      {leafEntries.length > 0 && containerEntries.length > 0 && <Separator className="my-2" />}
      {visibleContainerEntries.length > 0 &&
        (depth === 0 ? (
          // Top-level groups within a section (for example, "Background", "Text",
          // "Border" directly under Page/a word style) render as always-
          // visible, collapsible cards rather than accordions, since these
          // are the primary groupings a user scans through. Deeper nesting
          // still collapses into accordions (see the `else` branch) to keep
          // very deep presets navigable.
          <div className={INSPECTOR_CARD_CONTENT_STACK_CLASS}>
            {visibleContainerEntries.map(([key, child]) => {
              if (key === 'childrenAlignment') {
                const sectionStateKey = stateKeyPrefix ? `${stateKeyPrefix}/children-alignment` : undefined;
                return (
                  <CollapsibleSection key={key} title="Children Alignment" stateKey={sectionStateKey}>
                    <PropertyTreeView
                      node={child}
                      fieldKey={key}
                      depth={depth + 1}
                      stateKeyPrefix={sectionStateKey}
                      overrideScopeKey={overrideScopeKey ?? stateKeyPrefix}
                      propertyPath={[...propertyPath, key]}
                      suppressAlignmentSection
                      dependentFieldGroups={dependentFieldGroups}
                      onChange={(updater) => updateChild(key, updater)}
                    />
                  </CollapsibleSection>
                );
              }
              if (key === 'emojis') {
                const sectionStateKey = appendInspectorStateKey(stateKeyPrefix, key);
                return (
                  <CollapsibleSection key={key} title="Emojis" stateKey={sectionStateKey}>
                    <PropertyTreeView
                      node={child}
                      fieldKey={key}
                      depth={depth + 1}
                      stateKeyPrefix={sectionStateKey}
                      overrideScopeKey={overrideScopeKey ?? stateKeyPrefix}
                      propertyPath={[...propertyPath, key]}
                      onChange={(updater) => updateChild(key, updater)}
                    />
                  </CollapsibleSection>
                );
              }
              if (key === 'stateMotion') {
                const sectionStateKey = appendInspectorStateKey(stateKeyPrefix, key);
                return (
                  <CollapsibleSection key={key} title="State Motion" stateKey={sectionStateKey}>
                    <PropertyTreeView
                      node={child}
                      fieldKey={key}
                      depth={depth + 1}
                      stateKeyPrefix={sectionStateKey}
                      overrideScopeKey={overrideScopeKey ?? stateKeyPrefix}
                      propertyPath={[...propertyPath, key]}
                      onChange={(updater) => updateChild(key, updater)}
                    />
                  </CollapsibleSection>
                );
              }
              if (key === 'childWindow') {
                const sectionStateKey = appendInspectorStateKey(stateKeyPrefix, key);
                return (
                  <CollapsibleSection key={key} title="Child Window" stateKey={sectionStateKey}>
                    <PropertyTreeView
                      node={child}
                      fieldKey={key}
                      depth={depth + 1}
                      stateKeyPrefix={sectionStateKey}
                      overrideScopeKey={overrideScopeKey ?? stateKeyPrefix}
                      propertyPath={[...propertyPath, key]}
                      onChange={(updater) => updateChild(key, updater)}
                    />
                  </CollapsibleSection>
                );
              }
              if (isInsetGroupNode(key, child)) {
                const sectionStateKey = appendInspectorStateKey(stateKeyPrefix, key);
                return (
                  <CollapsibleSection
                    key={key}
                    title={fieldOverrides?.[key]?.label ?? humanizeFieldKey(key)}
                    leadingContent={fieldOverrides?.[key]?.sectionHeaderPrefix}
                    stateKey={sectionStateKey}
                  >
                    <PropertyTreeView
                      node={child}
                      fieldKey={key}
                      depth={depth + 1}
                      stateKeyPrefix={sectionStateKey}
                      overrideScopeKey={overrideScopeKey ?? stateKeyPrefix}
                      propertyPath={[...propertyPath, key]}
                      onChange={(updater) => updateChild(key, updater)}
                    />
                  </CollapsibleSection>
                );
              }
              return (
                <PropertyCard
                  key={key}
                  title={humanizeFieldKey(key)}
                  node={child}
                  fieldKey={key}
                  depth={depth + 1}
                  stateKey={appendInspectorStateKey(stateKeyPrefix, key)}
                  overrideScopeKey={overrideScopeKey ?? stateKeyPrefix}
                  propertyPath={[...propertyPath, key]}
                  titleIcon={headerIconForComponent(key)}
                  titleHelp={getComponentDescription(key)}
                  onChange={(updater) => updateChild(key, updater)}
                />
              );
            })}
          </div>
        ) : stateKeyPrefix ? (
          <InspectorAccordion
            entries={containerEntries}
            stateKeyPrefix={stateKeyPrefix}
            overrideScopeKey={overrideScopeKey ?? stateKeyPrefix}
            propertyPath={propertyPath}
            depth={depth}
            updateChild={updateChild}
          />
        ) : (
          <Accordion type="multiple" className="w-full">
            {containerEntries.map(([key, child]) => (
              <AccordionItem key={key} value={key}>
                <AccordionTrigger className="py-2 text-sm font-medium">
                  <span className="inline-flex items-center gap-2.5">
                    {headerIconForComponent(key)}
                    {humanizeFieldKey(key)}
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <PropertyTreeView
                    node={child}
                    fieldKey={key}
                    depth={depth + 1}
                    overrideScopeKey={overrideScopeKey ?? stateKeyPrefix}
                    propertyPath={[...propertyPath, key]}
                    onChange={(updater) => updateChild(key, updater)}
                  />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ))}
    </div>
  );
}
