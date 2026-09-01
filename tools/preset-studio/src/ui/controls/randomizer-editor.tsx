import { cn } from '@/lib/utils';
import type { FieldMeta } from '@/schema/field-metadata';
import type { PropertyValueType, RandomizerConfig, VectorRange } from '@/schema/property-tree';
import { normalizePaint, solidPaint, type Paint, type PaintCapability } from '@/schema/paint';
import { FieldRow, humanizeFieldKey } from '@/ui/controls/field-row';
import { InfoTooltip } from '@/ui/controls/info-tooltip';
import {
  INSPECTOR_CARD_CONTENT_STACK_CLASS,
  INSPECTOR_DEPENDENT_SUBTREE_CLASS,
  INSPECTOR_FIELD_CONTENT_GAP_CLASS,
} from '@/ui/controls/inspector-layout';
import { RandomizerIcon } from '@/ui/controls/randomizer-icon';
import { Button } from '@/ui/shadcn/button';
import { Checkbox } from '@/ui/shadcn/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/shadcn/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';
import { closestCenter, DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { useContext, useId, type ReactNode } from 'react';
import { PaintInput } from './color-field';
import { DeferredNumberInput } from './deferred-number-input';
import { DeferredTextInput } from './deferred-text-input';
import { RandomizerScopeAvailabilityContext, type RandomizerScope } from './randomizer-scope-context';
import {
  RANDOMIZER_TRIGGER_OPTIONS,
  RANDOMIZER_SCOPE_OPTIONS,
  normalizeRandomizerConfig,
  resolveRandomizerScope,
  resolveRandomizerTrigger,
  type RandomizerTrigger,
} from '@captioncat/caption-engine/browser';

export type RandomizerInlineEndContent = ReactNode | ((disabled: boolean) => ReactNode);

function selectValue(value: unknown, options: readonly string[]): string {
  return typeof value === 'string' && options.includes(value) ? value : (options[0] ?? '');
}

/**
 * Leaf types the randomizer is meaningfully wired up for engine-side. Booleans
 * are randomized by a 50/50 coin flip when no values are configured. Numbers,
 * vectors, colors, and enums pick from `values` or
 * (numbers/vectors) a numeric range.
 */
export const RANDOMIZABLE_LEAF_TYPES = new Set<PropertyValueType>([
  'number',
  'numberOrAuto',
  'vector2',
  'paint',
  'string',
  'boolean',
  'fontWeight',
]);

const RANDOMIZER_TRIGGER_LABELS: Record<RandomizerTrigger, string> = {
  onStart: 'On Start',
  everyFrame: 'Every Frame',
  currentWordStart: 'Current Word Start',
  currentWordEnd: 'Current Word End',
  currentRowStart: 'Current Row Start',
  currentRowEnd: 'Current Row End',
  currentPageStart: 'Current Page Start',
  currentPageEnd: 'Current Page End',
};

const RANDOMIZER_TRIGGER_DESCRIPTIONS: Record<RandomizerTrigger, string> = {
  onStart: 'Generate one value when the owning appearance starts.',
  everyFrame: 'Generate a new value for every rendered frame.',
  currentWordStart: 'Generate a new value when the current word starts.',
  currentWordEnd: 'Generate a new value when the current word ends.',
  currentRowStart: 'Generate a new value when the current row starts.',
  currentRowEnd: 'Generate a new value when the current row ends.',
  currentPageStart: 'Generate a new value when the current page starts.',
  currentPageEnd: 'Generate a new value when the current page ends.',
};

const RANDOMIZER_SCOPE_LABELS: Record<RandomizerScope, string> = {
  entity: 'Each Entity',
  row: 'Row',
  page: 'Page',
};

const RANDOMIZER_SCOPE_DESCRIPTIONS: Record<RandomizerScope, string> = {
  entity: 'Resolve one value for each entity.',
  row: 'Resolve one value for each Row. All descendants in that Row share it.',
  page: 'Resolve one value for each Page. All descendants in that Page share it.',
};

const RANDOMIZER_SCOPE_CHOICE_DESCRIPTIONS: Record<RandomizerScope, string> = {
  entity: 'Entity for independent values',
  row: 'Row for one value per Row',
  page: 'Page for one value per Page',
};

function scopeChoiceDescription(scopes: readonly RandomizerScope[]): string {
  return `Available: ${scopes.map((option) => RANDOMIZER_SCOPE_CHOICE_DESCRIPTIONS[option]).join(', ')}.`;
}

/** Whether a leaf type supports the numeric `range` fallback when `values` is empty. */
function supportsRange(leafType: PropertyValueType): boolean {
  return leafType === 'number' || leafType === 'numberOrAuto' || leafType === 'vector2' || leafType === 'fontWeight';
}

/**
 * One `randomizer.values[]` entry editor, dispatched by the parent leaf's
 * type. Unlike animation keyframes (which mirror the leaf's own value shape,
 * e.g. `{x,y}` for vector2), the engine's `Randomizer.values` stores vector2
 * entries as vector objects, so this intentionally does not reuse
 * `AnimationEditor`'s keyframe value editor.
 *
 * `meta` (the same `FieldMeta` the parent leaf's own control renders from)
 * is threaded through so each value picks from the exact same field type as
 * the parent: a closed-enum `string` leaf (e.g. "Region Horizontal
 * Position") gets the same dropdown of options instead of a freeform text
 * box, and numeric leaves respect the parent's min/max/step.
 */
function RandomizerValueEditor({
  leafType,
  meta,
  value,
  onChange,
  paintCapabilities,
  inlineEndContent,
  inlineEndContentInteractive = false,
  axisInlineEndContent,
  disabled = false,
}: {
  leafType: PropertyValueType;
  meta?: FieldMeta;
  paintCapabilities: readonly PaintCapability[];
  value: unknown;
  onChange: (next: unknown) => void;
  disabled?: boolean;
  inlineEndContent?: RandomizerInlineEndContent;
  inlineEndContentInteractive?: boolean;
  axisInlineEndContent?: Partial<Record<'x' | 'y', RandomizerInlineEndContent>>;
}) {
  const resolveInlineEndContent = (content: RandomizerInlineEndContent | undefined) =>
    typeof content === 'function' ? content(disabled) : content;

  switch (leafType) {
    case 'number':
    case 'numberOrAuto':
    case 'fontWeight':
      return (
        <DeferredNumberInput
          className="h-8 w-28"
          min={meta?.min}
          max={meta?.max}
          step={meta?.step ?? 'any'}
          value={typeof value === 'number' ? value : 0}
          onCommit={onChange}
          inlineEndContent={resolveInlineEndContent(inlineEndContent)}
          inlineEndContentInteractive={inlineEndContentInteractive}
          disabled={disabled}
        />
      );
    case 'vector2': {
      const v =
        value && typeof value === 'object' && !Array.isArray(value)
          ? (value as { x: number; y: number })
          : Array.isArray(value)
            ? { x: Number(value[0]) || 0, y: Number(value[1]) || 0 }
            : { x: 0, y: 0 };
      return (
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground text-[10px]">x</span>
          <DeferredNumberInput
            className="h-8 w-20"
            min={meta?.min}
            max={meta?.max}
            step={meta?.step ?? 'any'}
            value={Number.isFinite(v.x) ? v.x : 0}
            onCommit={(next) => onChange({ x: next, y: v.y })}
            inlineEndContent={resolveInlineEndContent(axisInlineEndContent?.x)}
            inlineEndContentInteractive={inlineEndContentInteractive}
            disabled={disabled}
          />
          <span className="text-muted-foreground text-[10px]">y</span>
          <DeferredNumberInput
            className="h-8 w-20"
            min={meta?.min}
            max={meta?.max}
            step={meta?.step ?? 'any'}
            value={Number.isFinite(v.y) ? v.y : 0}
            onCommit={(next) => onChange({ x: v.x, y: next })}
            inlineEndContent={resolveInlineEndContent(axisInlineEndContent?.y)}
            inlineEndContentInteractive={inlineEndContentInteractive}
            disabled={disabled}
          />
        </div>
      );
    }
    case 'boolean':
      return <Checkbox checked={Boolean(value)} onCheckedChange={(next) => onChange(Boolean(next))} disabled={disabled} />;
    case 'paint':
      return (
        <PaintInput
          value={normalizePaint(value, solidPaint('#000000')) as Paint}
          capabilities={paintCapabilities}
          onChange={onChange}
          ariaLabel="Randomizer color"
          compact
          disabled={disabled}
        />
      );
    case 'string':
      if (meta?.options) {
        const options = meta.options;
        return (
          <Select value={selectValue(value, options)} onValueChange={onChange}>
            <SelectTrigger className="h-8 w-40" disabled={disabled}>
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {humanizeFieldKey(opt)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }
      return (
        <DeferredTextInput
          className="h-8 w-40"
          value={typeof value === 'string' ? value : ''}
          onCommit={onChange}
          disabled={disabled}
        />
      );
    default:
      return (
        <DeferredTextInput
          className="h-8 w-40"
          value={typeof value === 'string' ? value : ''}
          onCommit={onChange}
          disabled={disabled}
        />
      );
  }
}

function defaultRandomizerValue(leafType: PropertyValueType, current: unknown, meta?: FieldMeta): unknown {
  switch (leafType) {
    case 'number':
    case 'numberOrAuto':
      return typeof current === 'number' ? current : 0;
    case 'vector2':
      if (current && typeof current === 'object' && !Array.isArray(current)) {
        const v = current as { x?: number; y?: number };
        return { x: v.x ?? 0, y: v.y ?? 0 };
      }
      if (Array.isArray(current)) return { x: Number(current[0]) || 0, y: Number(current[1]) || 0 };
      return { x: 0, y: 0 };
    case 'paint':
      return normalizePaint(current, solidPaint('#000000'));
    case 'boolean':
      return typeof current === 'boolean' ? current : false;
    case 'string':
      if (typeof current === 'string' && (!meta?.options || meta.options.includes(current))) return current;
      // Closed-enum string leaves (for example, "Region Horizontal Position") must
      // default to a valid option rather than an empty string the dropdown
      // cannot represent.
      return meta?.options?.[0] ?? '';
    default:
      return typeof current === 'string' ? current : '';
  }
}

export function createDefaultRandomizerConfig(
  leafType: PropertyValueType,
  currentValue: unknown,
  meta?: FieldMeta,
): RandomizerConfig {
  return {
    enabled: true,
    values: [defaultRandomizerValue(leafType, currentValue, meta)] as RandomizerConfig['values'],
    trigger: 'onStart',
    deterministic: true,
  };
}

/** Sensible default range for a numeric/vector leaf, seeded from the field's min/max metadata. */
function defaultRange(leafType: PropertyValueType, meta?: FieldMeta): [number, number] | VectorRange {
  const min = typeof meta?.min === 'number' ? meta.min : 0;
  const max = typeof meta?.max === 'number' ? meta.max : min + 100;
  return leafType === 'vector2' ? { x: [min, max], y: [min, max] } : [min, max];
}

function SortableRandomizerValue({
  id,
  index,
  children,
  onRemove,
  disabled = false,
}: {
  id: string;
  index: number;
  children: ReactNode;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn('flex items-center gap-1.5', isDragging && 'relative z-10 opacity-70')}
    >
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground cursor-grab touch-none rounded p-1 active:cursor-grabbing disabled:pointer-events-none disabled:opacity-50"
        aria-label={`Reorder value ${index + 1}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>
      <span className="text-muted-foreground w-4 text-xs">{index + 1}</span>
      <div className="min-w-0 flex-1">{children}</div>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="text-destructive hover:text-destructive"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`Remove value ${index + 1}`}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

/** A labelled `[min] to [max]` pair. */
function MinMaxRow({
  meta,
  min,
  max,
  onMin,
  onMax,
  prefix,
  inlineEndContent,
  inlineEndContentInteractive = false,
  disabled = false,
}: {
  meta?: FieldMeta;
  min: number;
  max: number;
  onMin: (v: number) => void;
  onMax: (v: number) => void;
  prefix?: string;
  inlineEndContent?: RandomizerInlineEndContent;
  inlineEndContentInteractive?: boolean;
  disabled?: boolean;
}) {
  const resolvedInlineEndContent =
    typeof inlineEndContent === 'function' ? inlineEndContent(disabled) : inlineEndContent;

  return (
    <div className="flex w-full min-w-0 items-center gap-1.5">
      {prefix && <span className="text-muted-foreground w-3 text-[10px]">{prefix}</span>}
      <DeferredNumberInput
        className="h-8 min-w-0 flex-1"
        placeholder="min"
        min={meta?.min}
        max={meta?.max}
        step={meta?.step ?? 'any'}
        value={Number.isFinite(min) ? min : 0}
        onCommit={onMin}
        inlineEndContent={resolvedInlineEndContent}
        inlineEndContentInteractive={inlineEndContentInteractive}
        disabled={disabled}
      />
      <span className="text-muted-foreground text-xs">to</span>
      <DeferredNumberInput
        className="h-8 min-w-0 flex-1"
        placeholder="max"
        min={meta?.min}
        max={meta?.max}
        step={meta?.step ?? 'any'}
        value={Number.isFinite(max) ? max : 0}
        onCommit={onMax}
        inlineEndContent={resolvedInlineEndContent}
        inlineEndContentInteractive={inlineEndContentInteractive}
        disabled={disabled}
      />
    </div>
  );
}

/** Typed range editor. Number uses one min/max row. Vector2 uses per-axis rows. */
function RandomizerRangeEditor({
  leafType,
  meta,
  range,
  onChange,
  inlineEndContent,
  inlineEndContentInteractive = false,
  axisInlineEndContent,
  disabled = false,
}: {
  leafType: PropertyValueType;
  meta?: FieldMeta;
  range: [number, number] | VectorRange | undefined;
  onChange: (next: [number, number] | VectorRange) => void;
  inlineEndContent?: RandomizerInlineEndContent;
  inlineEndContentInteractive?: boolean;
  axisInlineEndContent?: Partial<Record<'x' | 'y', RandomizerInlineEndContent>>;
  disabled?: boolean;
}) {
  if (leafType === 'vector2') {
    const v: VectorRange = range && !Array.isArray(range) ? range : { x: [0, 0], y: [0, 0] };
    return (
      <div className="flex flex-col gap-1.5">
        <MinMaxRow
          meta={meta}
          prefix="x"
          min={v.x[0]}
          max={v.x[1]}
          onMin={(n) => onChange({ x: [n, v.x[1]], y: v.y })}
          onMax={(n) => onChange({ x: [v.x[0], n], y: v.y })}
          inlineEndContent={axisInlineEndContent?.x}
          inlineEndContentInteractive={inlineEndContentInteractive}
          disabled={disabled}
        />
        <MinMaxRow
          meta={meta}
          prefix="y"
          min={v.y[0]}
          max={v.y[1]}
          onMin={(n) => onChange({ x: v.x, y: [n, v.y[1]] })}
          onMax={(n) => onChange({ x: v.x, y: [v.y[0], n] })}
          inlineEndContent={axisInlineEndContent?.y}
          inlineEndContentInteractive={inlineEndContentInteractive}
          disabled={disabled}
        />
      </div>
    );
  }
  const r: [number, number] = Array.isArray(range) ? range : [0, 0];
  return (
    <MinMaxRow
      meta={meta}
      min={r[0]}
      max={r[1]}
      onMin={(n) => onChange([n, r[1]])}
      onMax={(n) => onChange([r[0], n])}
      inlineEndContent={inlineEndContent}
      inlineEndContentInteractive={inlineEndContentInteractive}
      disabled={disabled}
    />
  );
}

interface RandomizerEditorProps {
  leafType: PropertyValueType;
  currentValue: unknown;
  randomizer: RandomizerConfig | undefined;
  onChange: (next: RandomizerConfig | undefined) => void;
  /** Compact "not yet configured" rendering: a small icon-only trigger meant to sit inline next to the field's own control, instead of a full labeled button on its own row. */
  compact?: boolean;
 /** Optional reason to disable the add affordance when the field itself is unavailable. */
 disabledReason?: string;
 /** Disables the randomizer settings while preserving their values. */
 disabled?: boolean;
  /** The parent leaf's own `FieldMeta` (options/min/max/step), so each randomized value uses the exact same field type as the parent control - see `RandomizerValueEditor`. */
  meta?: FieldMeta;
  paintCapabilities?: readonly PaintCapability[];
  /** Reuses a field's unit selector inside randomized values and ranges. */
  inlineEndContent?: RandomizerInlineEndContent;
  inlineEndContentInteractive?: boolean;
  axisInlineEndContent?: Partial<Record<'x' | 'y', RandomizerInlineEndContent>>;
  supportsStatePersistence?: boolean;
  supportsKeepWithinParentBounds?: boolean;
}

/**
 * Editor for a leaf's `randomizer` config: color modes, per-frame updates,
 * an ordered `values` list, and a numeric range fallback.
 */
export function RandomizerEditor({
  leafType,
  currentValue,
  randomizer,
  onChange,
  compact,
  disabledReason,
  disabled = false,
  meta,
  paintCapabilities = ['solid', 'linear-gradient', 'radial-gradient'],
  inlineEndContent,
  inlineEndContentInteractive = false,
  axisInlineEndContent,
  supportsStatePersistence = false,
  supportsKeepWithinParentBounds = false,
}: RandomizerEditorProps) {
  const triggerId = useId();
  const deterministicId = useId();
  const keepWithinParentBoundsId = useId();
  const scopeId = useId();
  const scopeAvailability = useContext(RandomizerScopeAvailabilityContext);

  if (!randomizer) {
    const addRandomizer = () => onChange(createDefaultRandomizerConfig(leafType, currentValue, meta));

    if (compact) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground"
              onClick={addRandomizer}
              disabled={Boolean(disabledReason)}
              aria-label="Add randomizer"
            >
              <RandomizerIcon className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {disabledReason ?? 'Add randomizer'}
          </TooltipContent>
        </Tooltip>
      );
    }

    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={addRandomizer}
        disabled={Boolean(disabledReason)}
        title={disabledReason}
      >
        <RandomizerIcon className="size-3.5" />
        Add randomizer
      </Button>
    );
  }

  const values = Array.isArray(randomizer.values) ? randomizer.values : [];
  const update = (patch: Partial<RandomizerConfig>) => {
    const next = normalizeRandomizerConfig({ ...randomizer, ...patch });
    delete (next as RandomizerConfig & { seed?: number }).seed;
    onChange(next);
  };

  const addValue = () => {
    // Default a new value to the previous entry so it starts as a
    // duplicate rather than snapping to a hardcoded type default. If
    // there is no previous entry yet, fall back to the property's own
    // current (base) value.
    const previous = values.length > 0 ? values.at(-1) : currentValue;
    update({ values: [...values, defaultRandomizerValue(leafType, previous, meta)] as RandomizerConfig['values'] });
  };
  const removeValue = (index: number) =>
    update({ values: values.filter((_, i) => i !== index) as RandomizerConfig['values'] });

  const rangeCapable = supportsRange(leafType);
  const trigger = resolveRandomizerTrigger(randomizer);
  const scope = resolveRandomizerScope(randomizer);
  const availableScopes = scopeAvailability ?? RANDOMIZER_SCOPE_OPTIONS;
  const scopeIsAvailable = availableScopes.includes(scope);
  const scopeOptions = [
    ...RANDOMIZER_SCOPE_OPTIONS.filter((option) => availableScopes.includes(option)),
    ...(scopeIsAvailable ? [] : [scope]),
  ];
  const showScope = scopeOptions.length > 1 || !scopeIsAvailable;
  const colorMode = leafType === 'paint'
    ? randomizer.mode === 'randomColor'
      ? 'randomColor'
      : (randomizer.mode === 'among' ||
          (randomizer.mode === undefined && resolveRandomizerTrigger(randomizer) === 'everyFrame'))
        ? 'among'
        : 'amongStable'
    : undefined;
  const mode: 'among' | 'range' = rangeCapable
    ? (randomizer.mode === 'range' || (randomizer.range && values.length === 0) ? 'range' : 'among')
    : 'among';
  const setMode = (next: 'among' | 'range') => {
    if (next === 'range') {
      update({ mode: 'range', range: randomizer.range ?? defaultRange(leafType, meta), values: [] });
    } else {
      update({
        mode: 'among',
        range: undefined,
        values: (values.length > 0
          ? values
          : [defaultRandomizerValue(leafType, currentValue, meta)]) as RandomizerConfig['values'],
      });
    }
  };
  const setColorMode = (next: 'randomColor' | 'amongStable' | 'among') => {
    if (next === 'randomColor') {
      update({ mode: next, values: [], range: undefined });
      return;
    }
    update({
      mode: next,
      range: undefined,
      values: values.length > 0
        ? values
        : [defaultRandomizerValue(leafType, currentValue, meta)],
    });
  };

  return (
    <div className={cn(INSPECTOR_CARD_CONTENT_STACK_CLASS, 'w-full', (disabledReason || disabled) && 'opacity-70')}>
      {disabledReason && (
        <p className="text-amber-600 dark:text-amber-500 text-[11px] font-medium">Warning: {disabledReason}</p>
      )}
      <div className={`flex flex-col ${INSPECTOR_FIELD_CONTENT_GAP_CLASS}`}>
        <FieldRow
          label="Trigger"
          description={
            <>
              <strong>{RANDOMIZER_TRIGGER_DESCRIPTIONS[trigger]}</strong>
              <br />
              The value remains stable until the next selected trigger.
            </>
          }
          htmlFor={triggerId}
          inline
          labelFirst
        >
          <Select value={trigger} onValueChange={(value) => update({ trigger: value as RandomizerTrigger })}>
            <SelectTrigger id={triggerId} className="h-8 w-44" disabled={disabled || randomizer.enabled === false}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="onStart">{RANDOMIZER_TRIGGER_LABELS.onStart}</SelectItem>
              <SelectItem value="everyFrame">{RANDOMIZER_TRIGGER_LABELS.everyFrame}</SelectItem>
              <div className="text-muted-foreground px-2 py-1 text-[10px] font-medium tracking-wide uppercase">
                Caption Events
              </div>
              {RANDOMIZER_TRIGGER_OPTIONS.slice(2).map((option) => (
                <SelectItem key={option} value={option}>
                  {RANDOMIZER_TRIGGER_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>
        {showScope && (
          <FieldRow
            label="Scope"
            description={
              <>
                <strong>
                  {scopeIsAvailable
                    ? RANDOMIZER_SCOPE_DESCRIPTIONS[scope]
                    : `${RANDOMIZER_SCOPE_LABELS[scope]} scope is not available for this entity.`}
                </strong>
                <br />
                {scopeIsAvailable
                  ? scopeChoiceDescription(availableScopes)
                  : 'Select Entity to use the available scope.'}
              </>
            }
            htmlFor={scopeId}
            inline
            labelFirst
          >
            <Select value={scope} onValueChange={(value) => update({ scope: value as RandomizerScope })}>
              <SelectTrigger id={scopeId} className="h-8 w-44" disabled={disabled || randomizer.enabled === false}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {scopeOptions.map((option) => (
                  <SelectItem key={option} value={option} disabled={!availableScopes.includes(option)}>
                    {RANDOMIZER_SCOPE_LABELS[option]}
                    {!availableScopes.includes(option) && ' (Unavailable)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
        )}
        <FieldRow
          label="Deterministic"
          description={
            <>
              <strong>Keep the result repeatable for this entity.</strong>
              <br />
              Turn this off to vary the result each time the page appears.
            </>
          }
          htmlFor={deterministicId}
          inline
        >
          <Checkbox
            id={deterministicId}
            checked={randomizer.deterministic ?? true}
            onCheckedChange={(value) => update({ deterministic: Boolean(value) })}
            disabled={disabled || randomizer.enabled === false}
          />
        </FieldRow>
        {supportsStatePersistence && (
          <FieldRow
            label="Persist across states"
            description={
              <>
                <strong>Keep one result across state changes.</strong>
                <br />
                Turn this off to resolve a separate result for each state.
              </>
            }
            inline
          >
            <Checkbox
              checked={randomizer.persistAcrossStates ?? false}
              onCheckedChange={(value) => update({ persistAcrossStates: Boolean(value) })}
              disabled={disabled || randomizer.enabled === false}
            />
          </FieldRow>
        )}
        {supportsKeepWithinParentBounds && (
          <FieldRow
            label="Keep within parent bounds"
            description={
              <>
                <strong>Keep the randomized result inside the parent.</strong>
                <br />
                Position and size values are remapped when they exceed the available area.
              </>
            }
            htmlFor={keepWithinParentBoundsId}
            inline
          >
            <Checkbox
              id={keepWithinParentBoundsId}
              checked={randomizer.keepWithinParentBounds ?? false}
              onCheckedChange={(value) => update({ keepWithinParentBounds: Boolean(value) })}
              disabled={disabled || randomizer.enabled === false}
            />
          </FieldRow>
        )}

        {leafType === 'paint' && (
          <FieldRow
            label="Mode"
            description={
              <>
                <strong>Choose how paint values are randomized.</strong>
                <br />
                Generate a color or choose from the configured values.
              </>
            }
          >
            <Select value={colorMode} onValueChange={(value) => setColorMode(value as 'randomColor' | 'amongStable' | 'among')}>
              <SelectTrigger className="h-8 w-full" disabled={disabled || randomizer.enabled === false}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="randomColor">Generate random color</SelectItem>
                <SelectItem value="amongStable">Randomize among (stable)</SelectItem>
                <SelectItem value="among">Randomize among</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
        )}

        {leafType !== 'paint' && rangeCapable && (
          <FieldRow
            label="Mode"
            description={
              <>
                <strong>Choose the random value source.</strong>
                <br />
                Select configured values or generate a value within a range.
              </>
            }
          >
            <Select value={mode} onValueChange={(v) => setMode(v as 'among' | 'range')}>
              <SelectTrigger className="h-8 w-full" disabled={disabled || randomizer.enabled === false}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="among">Randomize among values</SelectItem>
                <SelectItem value="range">Randomize in range</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
        )}

        {((leafType === 'paint' && colorMode !== 'randomColor') || (leafType !== 'paint' && mode === 'among')) && (
          <div className={cn(INSPECTOR_DEPENDENT_SUBTREE_CLASS, 'flex flex-col', INSPECTOR_FIELD_CONTENT_GAP_CLASS)}>
            <span className="text-muted-foreground flex items-center gap-1 text-[11px] font-medium tracking-wide uppercase">
              Randomize among
              <InfoTooltip ariaLabel="Explain randomize among">
                <strong>Choose from a list of values.</strong>
                <br />
                Drag values to reorder them, or remove values that should not be used.
              </InfoTooltip>
            </span>
            {values.length === 0 && <p className="text-muted-foreground text-xs italic">No values yet.</p>}
            <RandomizerValuesList
              values={values}
              leafType={leafType}
              meta={meta}
              inlineEndContent={inlineEndContent}
              inlineEndContentInteractive={inlineEndContentInteractive}
              axisInlineEndContent={axisInlineEndContent}
              paintCapabilities={paintCapabilities}
              disabled={disabled || randomizer.enabled === false}
              onReorder={(nextValues) => update({ values: nextValues as RandomizerConfig['values'] })}
              onChange={(index, next) => {
                const nextValues = [...values];
                nextValues[index] = next;
                update({ values: nextValues });
              }}
              onRemove={removeValue}
            />
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="w-fit"
              onClick={addValue}
              disabled={disabled || randomizer.enabled === false}
            >
              <Plus className="size-3.5" />
              Add value
            </Button>
          </div>
        )}

        {mode === 'range' && rangeCapable && (
          <div className={cn(INSPECTOR_DEPENDENT_SUBTREE_CLASS, 'flex flex-col', INSPECTOR_FIELD_CONTENT_GAP_CLASS)}>
            <span className="text-muted-foreground flex items-center gap-1 text-[11px] font-medium tracking-wide uppercase">
              Range
              <InfoTooltip ariaLabel="Explain randomizer range">
                <strong>Generate values between the two limits.</strong>
                <br />
                The engine orders the limits before it samples.
              </InfoTooltip>
            </span>
            <RandomizerRangeEditor
              leafType={leafType}
              meta={meta}
              inlineEndContent={inlineEndContent}
              inlineEndContentInteractive={inlineEndContentInteractive}
              axisInlineEndContent={axisInlineEndContent}
              range={randomizer.range}
              onChange={(next) => update({ range: next })}
              disabled={disabled || randomizer.enabled === false}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function RandomizerValuesList({
  values,
  leafType,
  meta,
  inlineEndContent,
  inlineEndContentInteractive = false,
  axisInlineEndContent,
  paintCapabilities,
  onReorder,
  onChange,
  onRemove,
  disabled = false,
}: {
  values: unknown[];
  leafType: PropertyValueType;
  meta?: FieldMeta;
  inlineEndContent?: RandomizerInlineEndContent;
  inlineEndContentInteractive?: boolean;
  axisInlineEndContent?: Partial<Record<'x' | 'y', RandomizerInlineEndContent>>;
  paintCapabilities: readonly PaintCapability[];
  onReorder: (values: unknown[]) => void;
  onChange: (index: number, value: unknown) => void;
  onRemove: (index: number) => void;
  disabled?: boolean;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const itemIds = values.map((_, index) => `randomizer-value-${index}`);
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const activeIndex = itemIds.indexOf(String(active.id));
    const overIndex = itemIds.indexOf(String(over.id));
    if (activeIndex < 0 || overIndex < 0) return;
    onReorder(arrayMove(values, activeIndex, overIndex));
  };

  return (
    <DndContext
      autoScroll={false}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        {values.map((value, index) => (
          <SortableRandomizerValue
            key={itemIds[index]}
            id={itemIds[index]}
            index={index}
            onRemove={() => onRemove(index)}
            disabled={disabled}
          >
            <RandomizerValueEditor
              leafType={leafType}
              meta={meta}
              inlineEndContent={inlineEndContent}
              inlineEndContentInteractive={inlineEndContentInteractive}
              axisInlineEndContent={axisInlineEndContent}
              value={value}
              paintCapabilities={paintCapabilities}
              onChange={(next) => onChange(index, next)}
              disabled={disabled}
            />
          </SortableRandomizerValue>
        ))}
      </SortableContext>
    </DndContext>
  );
}
