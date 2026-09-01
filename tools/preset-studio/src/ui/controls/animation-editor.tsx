import { cn } from '@/lib/utils';
import type { FieldMeta } from '@/schema/field-metadata';
import type { AnimationConfig, EaseType, PropertyValueType } from '@/schema/property-tree';
import { normalizePaint, solidPaint, type Paint, type PaintCapability } from '@/schema/paint';
import { EASE_TYPES } from '@/schema/property-tree';
import { Button } from '@/ui/shadcn/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/shadcn/select';
import { Switch } from '@/ui/shadcn/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { humanizeFieldKey } from './field-row';
import { PaintInput } from './color-field';
import { DeferredNumberInput } from './deferred-number-input';
import { DeferredTextInput } from './deferred-text-input';

function selectValue(value: unknown, options: readonly string[]): string {
  return typeof value === 'string' && options.includes(value) ? value : (options[0] ?? '');
}

/** Evenly-spaced keyframe times across `[0, duration]` (the default when no explicit times are stored). */
function evenTimes(count: number, duration: number): number[] {
  if (count <= 1) return count === 1 ? [0] : [];
  return Array.from({ length: count }, (_, i) => Math.round(((duration * i) / (count - 1)) * 1000) / 1000);
}

interface KeyframeValueEditorProps {
  leafType: PropertyValueType;
  meta?: FieldMeta;
  paintCapabilities: readonly PaintCapability[];
  value: unknown;
  onChange: (next: unknown) => void;
}

/** Compact, label-less value editor for one keyframe, dispatched by the parent leaf's type. */
function KeyframeValueEditor({ leafType, meta, paintCapabilities, value, onChange }: KeyframeValueEditorProps) {
  switch (leafType) {
    case 'number':
    case 'numberOrAuto':
    case 'fontWeight':
      return (
        <DeferredNumberInput
          className="h-8 w-28"
          value={typeof value === 'number' ? value : 0}
          onCommit={onChange}
        />
      );
    case 'vector2': {
      const v = value && typeof value === 'object' ? (value as { x: number; y: number }) : { x: 0, y: 0 };
      return (
        <div className="flex items-center gap-1.5">
          <DeferredNumberInput
            className="h-8 w-20"
            value={Number.isFinite(v.x) ? v.x : 0}
            onCommit={(next) => onChange({ x: next, y: v.y })}
          />
          <DeferredNumberInput
            className="h-8 w-20"
            value={Number.isFinite(v.y) ? v.y : 0}
            onCommit={(next) => onChange({ x: v.x, y: next })}
          />
        </div>
      );
    }
    case 'paint':
      return (
        <PaintInput
          value={normalizePaint(value, solidPaint('#000000')) as Paint}
          capabilities={paintCapabilities}
          onChange={onChange}
          ariaLabel="Keyframe color"
        />
      );
    case 'boolean':
      return <Switch checked={Boolean(value)} onCheckedChange={onChange} />;
    case 'string':
      if (meta?.options) {
        const options = meta.options;
        return (
          <Select value={selectValue(value, options)} onValueChange={onChange}>
            <SelectTrigger className="h-8 w-40">
              <SelectValue />
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
        />
      );
    default:
      return (
        <DeferredTextInput
          className="h-8 w-40 font-mono text-xs"
          value={JSON.stringify(value)}
          onCommit={(text) => {
            try {
              onChange(JSON.parse(text));
              return true;
            } catch {
              return false;
            }
          }}
        />
      );
  }
}

function defaultKeyframeValue(leafType: PropertyValueType, current: unknown, meta?: FieldMeta): unknown {
  if (current !== undefined) return current;
  switch (leafType) {
    case 'number':
    case 'numberOrAuto':
      return 0;
    case 'fontWeight':
      return 400;
    case 'vector2':
      return { x: 0, y: 0 };
    case 'paint':
      return solidPaint('#000000');
    case 'boolean':
      return false;
    case 'string':
      return meta?.options?.[0] ?? '';
    default:
      return null;
  }
}

interface AnimationEditorProps {
  leafType: PropertyValueType;
  meta?: FieldMeta;
  currentValue: unknown;
  animation: AnimationConfig | undefined;
  onChange: (next: AnimationConfig | undefined) => void;
  /** Compact "not yet configured" rendering: a small icon-only trigger meant to sit inline next to the field's own control, instead of a full labeled button on its own row. */
  compact?: boolean;
 /** Optional reason to disable the add affordance when the field itself is unavailable. */
  disabledReason?: string;
  paintCapabilities?: readonly PaintCapability[];
}

/**
 * Editor for a leaf's `animation` burst config: enabled toggle, duration,
 * ease type, and an ordered keyframe list (evenly spaced across the
 * duration and evaluated by the ECS layout-motion runtime).
 */
export function AnimationEditor({
  leafType,
  meta,
  currentValue,
  animation,
  onChange,
  compact,
  disabledReason,
  paintCapabilities = ['solid', 'linear-gradient', 'radial-gradient'],
}: AnimationEditorProps) {
  if (!animation) {
    const addAnimation = () =>
      onChange({
        enabled: true,
        durationSeconds: 0.3,
        easeType: 'easeInOut',
        keyframes: [
          defaultKeyframeValue(leafType, currentValue, meta),
          defaultKeyframeValue(leafType, currentValue, meta),
        ],
      });

    if (compact) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground"
              onClick={addAnimation}
              disabled={Boolean(disabledReason)}
              aria-label="Add animation"
            >
              <Plus className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {disabledReason ?? 'Add animation'}
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
        onClick={addAnimation}
        disabled={Boolean(disabledReason)}
        title={disabledReason}
      >
        <Plus className="size-3.5" />
        Add animation
      </Button>
    );
  }

  const keyframes = Array.isArray(animation.keyframes) ? animation.keyframes : [];
  const update = (patch: Partial<AnimationConfig>) => onChange({ ...animation, ...patch });
  const duration = animation.durationSeconds ?? 0.3;
  // Use explicit per-keyframe times when the preset stores them. Otherwise show
  // evenly-spaced defaults (0..duration) so the field always previews a time.
  const storedTimes =
    Array.isArray(animation.times) && animation.times.length === keyframes.length ? animation.times : undefined;
  const times = storedTimes ?? evenTimes(keyframes.length, duration);

  const setTime = (index: number, value: number) => {
    const next = [...times];
    next[index] = value;
    update({ times: next });
  };

  const addKeyframe = () => {
    // Default a new keyframe to the previous keyframe's value so it starts
    // as a "hold" rather than snapping to a hardcoded type default. If
    // there is no previous keyframe yet, fall back to the property's own
    // current (base) value instead of for example always defaulting to 0/black.
    const previous = keyframes.length > 0 ? keyframes.at(-1) : currentValue;
    const nextKeyframes = [...keyframes, defaultKeyframeValue(leafType, previous, meta)];
    // Persist times only when the preset customized them. Otherwise leave
    // them implicit so the even-spacing keeps tracking the duration.
    update(
      storedTimes ? { keyframes: nextKeyframes, times: [...storedTimes, duration] } : { keyframes: nextKeyframes },
    );
  };
  const removeKeyframe = (index: number) =>
    update(
      storedTimes
        ? { keyframes: keyframes.filter((_, i) => i !== index), times: storedTimes.filter((_, i) => i !== index) }
        : { keyframes: keyframes.filter((_, i) => i !== index) },
    );
  const moveKeyframe = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= keyframes.length) return;
    const next = [...keyframes];
    [next[index], next[target]] = [next[target], next[index]];
    update({ keyframes: next });
  };

  return (
    <div
      className={cn(
        'border-border/60 flex w-full flex-col gap-2 rounded-md border border-dashed p-2',
        disabledReason && 'opacity-70',
      )}
    >
      {disabledReason && (
        <p className="text-amber-600 dark:text-amber-500 text-[11px] font-medium">⚠ {disabledReason}</p>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch checked={animation.enabled ?? true} onCheckedChange={(v) => update({ enabled: v })} />
          <span className="text-xs font-medium">Animation enabled</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-destructive hover:text-destructive"
          onClick={() => onChange(undefined)}
          aria-label="Remove animation"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Duration (s)</span>
          <DeferredNumberInput
            min={0}
            step={0.05}
            className="h-8 w-24"
            value={animation.durationSeconds ?? 0.3}
            onCommit={(next) => update({ durationSeconds: Math.max(0, next) })}
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Ease</span>
          <Select value={animation.easeType ?? 'easeInOut'} onValueChange={(v) => update({ easeType: v as EaseType })}>
            <SelectTrigger className="h-8 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EASE_TYPES.map((ease) => (
                <SelectItem key={ease} value={ease}>
                  {humanizeFieldKey(ease)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">Keyframes</span>
        {keyframes.length === 0 && <p className="text-muted-foreground text-xs italic">No keyframes yet.</p>}
        {keyframes.map((kf, index) => (
          <div key={index} className="flex items-center gap-1.5">
            <span className="text-muted-foreground w-4 text-xs">{index + 1}</span>
            <DeferredNumberInput
              className="h-8 w-16"
              min={0}
              step={0.05}
              title="Keyframe time (seconds)"
              aria-label={`Keyframe ${index + 1} time (seconds)`}
              value={Number.isFinite(times[index]) ? times[index] : 0}
              onCommit={(next) => setTime(index, Math.max(0, next))}
            />
            <span className="text-muted-foreground text-[10px]">s</span>
            <KeyframeValueEditor
              leafType={leafType}
              meta={meta}
              paintCapabilities={paintCapabilities}
              value={kf}
              onChange={(next) => {
                const nextKeyframes = [...keyframes];
                nextKeyframes[index] = next;
                update({ keyframes: nextKeyframes });
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={index === 0}
              onClick={() => moveKeyframe(index, -1)}
              aria-label={`Move keyframe ${index + 1} up`}
            >
              <ChevronUp className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={index === keyframes.length - 1}
              onClick={() => moveKeyframe(index, 1)}
              aria-label={`Move keyframe ${index + 1} down`}
            >
              <ChevronDown className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className={cn('text-destructive hover:text-destructive', keyframes.length <= 2 && 'invisible')}
              disabled={keyframes.length <= 2}
              onClick={() => removeKeyframe(index)}
              aria-label={`Remove keyframe ${index + 1}`}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="xs" className="w-fit" onClick={addKeyframe}>
          <Plus className="size-3.5" />
          Add keyframe
        </Button>
      </div>
    </div>
  );
}
