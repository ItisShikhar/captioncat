import type {
  EaseType,
  PropertyValueType,
  TransitionConfig,
  TransitionInitialBehavior,
  TransitionScope,
  TransitionStartValue,
  TransitionType,
} from '@/schema/property-tree';
import { DEFAULT_TRANSITION_CONFIG, EASE_TYPES, TRANSITION_TYPES } from '@/schema/property-tree';
import { DEFAULT_TRANSITION_DURATION_SECONDS } from '@captioncat/caption-engine/browser';
import type { FieldMeta } from '@/schema/field-metadata';
import { DEFAULT_PAINT_CAPABILITIES, normalizePaint, solidPaint, type PaintCapability } from '@/schema/paint';
import { BooleanField } from '@/ui/controls/boolean-field';
import { FontWeightField } from '@/ui/controls/font-weight-field';
import { NumberField } from '@/ui/controls/number-field';
import { NumberOrAutoField } from '@/ui/controls/number-or-auto-field';
import { PaintField } from '@/ui/controls/color-field';
import { normalizeRect, RectField } from '@/ui/controls/rect-field';
import { StringField } from '@/ui/controls/select-field';
import { Vector2Field } from '@/ui/controls/vector2-field';
import { InfoTooltip } from '@/ui/controls/info-tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/shadcn/select';
import { humanizeFieldKey } from './field-row';
import { DeferredNumberInput } from './deferred-number-input';
import { RawJsonField } from './raw-json-field';

interface TransitionEditorProps {
  transition: TransitionConfig | undefined;
  currentValue: unknown;
  leafType?: PropertyValueType;
  meta?: FieldMeta;
  paintCapabilities?: readonly PaintCapability[];
  onChange: (next: TransitionConfig | undefined) => void;
  disabled?: boolean;
}

function inferredLeafType(value: unknown): PropertyValueType | undefined {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') return 'string';
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  if ('width' in value && 'height' in value && 'x' in value && 'y' in value) return 'rect';
  if ('x' in value && 'y' in value) return 'vector2';
  if ('type' in value && typeof value.type === 'string') return 'paint';
  return undefined;
}

/**
 * Editor for a leaf's reactive tween configuration, distinct from explicit
 * keyframe animation.
 */
export function TransitionEditor({
  transition,
  currentValue,
  leafType,
  meta,
  paintCapabilities = DEFAULT_PAINT_CAPABILITIES,
  onChange,
  disabled = false,
}: TransitionEditorProps) {
  const resolvedTransition = transition ?? DEFAULT_TRANSITION_CONFIG;
  const update = (patch: Partial<TransitionConfig>) => onChange({ ...resolvedTransition, ...patch });
  const scope = resolvedTransition.scope ?? DEFAULT_TRANSITION_CONFIG.scope;
  const startValue = resolvedTransition.startValue ?? DEFAULT_TRANSITION_CONFIG.startValue;
  const initialBehavior = resolvedTransition.initialBehavior ?? DEFAULT_TRANSITION_CONFIG.initialBehavior;
  const explicitValue =
    resolvedTransition.initialValue !== undefined ? resolvedTransition.initialValue : currentValue;
  const explicitType = leafType ?? inferredLeafType(explicitValue);

  const explicitStartField = (() => {
    switch (explicitType) {
      case 'number':
        return (
          <NumberField
            label="Explicit start"
            meta={meta}
            value={typeof explicitValue === 'number' ? explicitValue : 0}
            onChange={(value) => update({ initialValue: value })}
            compact
            disabled={disabled}
          />
        );
      case 'fontWeight':
        return (
          <FontWeightField
            label="Explicit start"
            meta={meta}
            value={typeof explicitValue === 'number' ? explicitValue : 400}
            onChange={(value) => update({ initialValue: value })}
            compact
            disabled={disabled}
          />
        );
      case 'numberOrAuto':
        return (
          <NumberOrAutoField
            label="Explicit start"
            meta={meta}
            value={explicitValue === 'auto' ? 'auto' : typeof explicitValue === 'number' ? explicitValue : 0}
            onChange={(value) => update({ initialValue: value })}
            compact
            disabled={disabled}
          />
        );
      case 'vector2':
        return (
          <Vector2Field
            label="Explicit start"
            meta={meta}
            value={
              explicitValue && typeof explicitValue === 'object'
                ? (explicitValue as { x: number; y: number })
                : { x: 0, y: 0 }
            }
            onChange={(value) => update({ initialValue: value })}
            compact
            disabled={disabled}
          />
        );
      case 'rect':
        return (
          <RectField
            label="Explicit start"
            meta={meta}
            value={normalizeRect(explicitValue)}
            onChange={(value) => update({ initialValue: value })}
            compact
            disabled={disabled}
          />
        );
      case 'paint':
        return (
          <PaintField
            label="Explicit start"
            value={normalizePaint(explicitValue, solidPaint('#000000'))}
            onChange={(value) => update({ initialValue: value })}
            capabilities={paintCapabilities}
            compact
            disabled={disabled}
          />
        );
      case 'boolean':
        return (
          <BooleanField
            label="Explicit start"
            value={Boolean(explicitValue)}
            onChange={(value) => update({ initialValue: value })}
            compact
            disabled={disabled}
          />
        );
      case 'string':
        return (
          <StringField
            label="Explicit start"
            value={typeof explicitValue === 'string' ? explicitValue : ''}
            onChange={(value) => update({ initialValue: value })}
            compact
            disabled={disabled}
          />
        );
      default:
        return (
          <RawJsonField
            label="Explicit start"
            value={explicitValue}
            onChange={(value) => update({ initialValue: value })}
            description="Use a value that matches the property type."
            compact
            disabled={disabled}
          />
        );
    }
  })();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Type</span>
          <Select
            value={resolvedTransition.type ?? DEFAULT_TRANSITION_CONFIG.type}
            onValueChange={(value) => update({ type: value as TransitionType })}
          >
            <SelectTrigger className="h-8 w-24" disabled={disabled}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRANSITION_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {humanizeFieldKey(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Duration (s)</span>
          <DeferredNumberInput
            min={0}
            step={0.05}
            className="h-8 w-24"
            value={resolvedTransition.durationSeconds ?? DEFAULT_TRANSITION_DURATION_SECONDS}
            onCommit={(next) => update({ durationSeconds: Math.max(0, next) })}
            disabled={disabled}
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Ease</span>
          <Select
            value={resolvedTransition.easeType ?? DEFAULT_TRANSITION_CONFIG.easeType}
            onValueChange={(value) => update({ easeType: value as EaseType })}
          >
            <SelectTrigger className="h-8 w-32" disabled={disabled}>
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
      <div className="grid grid-cols-[max-content_minmax(0,1fr)] items-center gap-x-2 gap-y-3">
        <div className="flex items-center gap-2 whitespace-nowrap text-xs">
          <span className="text-muted-foreground">Applies across</span>
          <InfoTooltip ariaLabel="Explain transition scope" side="top">
            <strong>Choose which state changes use this transition.</strong>
            <br />
            All state changes use this configuration.
            <br />
            This state only uses it while active.
          </InfoTooltip>
        </div>
        <Select value={scope} onValueChange={(value) => update({ scope: value as TransitionScope })}>
          <SelectTrigger className="h-8 w-full min-w-0" disabled={disabled}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="shared">All state changes</SelectItem>
            <SelectItem value="state">This state only</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2 whitespace-nowrap text-xs">
          <span className="text-muted-foreground">Start value</span>
          <InfoTooltip ariaLabel="Explain transition start value" side="top">
            <strong>Choose the value used when the transition starts.</strong>
            <br />
            Previous displayed uses the visible value.
            <br />
            Previous state uses the last settled value.
            <br />
            Explicit uses the value below.
          </InfoTooltip>
        </div>
        <Select
          value={startValue}
          onValueChange={(value) => {
            const next = value as TransitionStartValue;
            if (next === 'explicit' && resolvedTransition.initialValue === undefined) {
              update({ startValue: next, initialValue: currentValue });
              return;
            }
            update({ startValue: next });
          }}
        >
          <SelectTrigger className="h-8 w-full min-w-0" disabled={disabled}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="previousDisplayed">Previous displayed</SelectItem>
            <SelectItem value="previousState">Previous state</SelectItem>
            <SelectItem value="explicit">Explicit</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2 whitespace-nowrap text-xs">
          <span className="text-muted-foreground">First appearance</span>
          <InfoTooltip ariaLabel="Explain first appearance" side="top">
            <strong>Choose how the first appearance starts.</strong>
            <br />
            Immediate shows the first observed value.
            <br />
            Transition uses the explicit start value when no previous sample exists.
          </InfoTooltip>
        </div>
        <Select
          value={initialBehavior}
          onValueChange={(value) => update({ initialBehavior: value as TransitionInitialBehavior })}
        >
          <SelectTrigger className="h-8 w-full min-w-0" disabled={disabled}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="immediate">Show immediately</SelectItem>
            <SelectItem value="transition">Transition from start</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {startValue === 'explicit' && (
        explicitStartField
      )}
      {initialBehavior === 'transition' && resolvedTransition.initialValue === undefined && (
        <p className="text-destructive text-xs">
          Set an explicit start value to animate the first appearance.
        </p>
      )}
      {leafType === 'fontWeight' && (
        <p className="text-muted-foreground text-xs">
          Smooth Font weight transitions require a variable font. Static fonts use the nearest available weight.
        </p>
      )}
    </div>
  );
}
