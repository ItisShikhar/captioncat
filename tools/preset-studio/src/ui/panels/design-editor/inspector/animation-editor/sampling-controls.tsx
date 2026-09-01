import type { ReactNode } from 'react';
import { Trash2 } from 'lucide-react';

import type { AnimationKeyframeDoc, AnimationTrackSampling } from '@/schema';
import type { PaintCapability } from '@/schema/paint';
import { InfoTooltip } from '@/ui/controls/info-tooltip';
import { SelectField } from '@/ui/controls/select-field';
import { Switch } from '@/ui/shadcn/switch';

import type { TrackValueKind } from './helpers';
import { defaultValueForKind } from './helpers';
import { TrackValueField } from './track-value-field';

const SAMPLING_MODES: AnimationTrackSampling[] = ['interpolate', 'randomValues', 'randomRange'];
const SAMPLING_MODE_DESCRIPTIONS: Partial<Record<AnimationTrackSampling, ReactNode>> = {
  interpolate: (
    <>
      <strong>Interpolate between keyframes.</strong>
      <br />
      Use explicit values at specific times.
    </>
  ),
  randomValues: (
    <>
      <strong>Choose from keyframe values.</strong>
      <br />
      The track selects one configured value.
    </>
  ),
  randomRange: (
    <>
      <strong>Generate values in a range.</strong>
      <br />
      The track samples between the configured limits.
    </>
  ),
};

/** Mode picker shared by every track - switching modes reshapes keyframes via the caller. */
export function SamplingModeField({
  sampling,
  onChange,
}: {
  sampling: AnimationTrackSampling;
  onChange: (next: AnimationTrackSampling) => void;
}): ReactNode {
  return (
    <SelectField
      label="Sampling"
      value={sampling}
      options={SAMPLING_MODES}
      optionDescriptions={SAMPLING_MODE_DESCRIPTIONS}
      description={SAMPLING_MODE_DESCRIPTIONS[sampling]}
      onChange={(next) => onChange(next as AnimationTrackSampling)}
      compact
    />
  );
}

/** Re-rolls every frame instead of once per animation instance - random modes only. */
export function UpdateEveryFrameField({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (next: boolean) => void;
}): ReactNode {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground flex items-center gap-1">
        Update every frame
        <InfoTooltip ariaLabel="Explain update every frame">
          <strong>Recalculate the random result on every frame.</strong>
          <br />
          Turn this off to keep one result for the animation instance.
        </InfoTooltip>
      </span>
      <Switch checked={enabled} onCheckedChange={onChange} />
    </div>
  );
}

/** A flat, unordered list of candidate values - one is picked at random each roll. */
export function RandomValuesEditor({
  kind,
  keyframes,
  onChange,
  target,
  overrideScopeKey,
  propertyPathForKeyframe,
  paintCapabilities,
}: {
  kind: TrackValueKind;
  keyframes: AnimationKeyframeDoc[];
  onChange: (keyframes: AnimationKeyframeDoc[]) => void;
  target: string;
  overrideScopeKey?: string;
  propertyPathForKeyframe?: (index: number) => readonly string[];
  paintCapabilities?: readonly PaintCapability[];
}): ReactNode {
  const updateValue = (index: number, value: unknown) =>
    onChange(keyframes.map((keyframe, i) => (i === index ? { ...keyframe, value } : keyframe)));

  const removeValue = (index: number) => onChange(keyframes.filter((_, i) => i !== index));

  const addValue = () =>
    onChange([
      ...keyframes,
      { time: keyframes.length, value: keyframes[0]?.value ?? defaultValueForKind(kind) },
    ]);

  return (
    <div className="flex flex-col gap-1.5">
      {keyframes.map((keyframe, index) => (
        <div key={index} className="flex items-end gap-2">
          <div className="flex-1">
            <TrackValueField
              kind={kind}
              label={`Value ${index + 1}`}
              value={keyframe.value}
              onChange={(value) => updateValue(index, value)}
              target={target}
              overrideScopeKey={overrideScopeKey}
              propertyPath={propertyPathForKeyframe?.(index)}
              paintCapabilities={paintCapabilities}
            />
          </div>
          {keyframes.length > 1 && (
            <button
              type="button"
              aria-label={`Remove value ${index + 1}`}
              onClick={() => removeValue(index)}
              className="text-muted-foreground hover:text-destructive mb-1.5 flex size-6 shrink-0 items-center justify-center rounded"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={addValue} className="text-muted-foreground hover:text-foreground self-start text-[11px] font-medium">
        + Add value
      </button>
    </div>
  );
}

/** Exactly two extremes - a roll interpolates between them each pick. */
export function RandomRangeEditor({
  kind,
  keyframes,
  onChange,
  target,
  overrideScopeKey,
  propertyPathForKeyframe,
  paintCapabilities,
}: {
  kind: TrackValueKind;
  keyframes: AnimationKeyframeDoc[];
  onChange: (keyframes: AnimationKeyframeDoc[]) => void;
  target: string;
  overrideScopeKey?: string;
  propertyPathForKeyframe?: (index: number) => readonly string[];
  paintCapabilities?: readonly PaintCapability[];
}): ReactNode {
  const min = keyframes[0]?.value ?? defaultValueForKind(kind);
  const max = keyframes[keyframes.length - 1]?.value ?? defaultValueForKind(kind);

  return (
    <div className="flex flex-col gap-1.5">
      <TrackValueField
        kind={kind}
        label="Min"
        value={min}
        onChange={(value) => onChange([{ time: 0, value }, { time: 1, value: max }])}
        target={target}
        overrideScopeKey={overrideScopeKey}
        propertyPath={propertyPathForKeyframe?.(0)}
        paintCapabilities={paintCapabilities}
      />
      <TrackValueField
        kind={kind}
        label="Max"
        value={max}
        onChange={(value) => onChange([{ time: 0, value: min }, { time: 1, value }])}
        target={target}
        overrideScopeKey={overrideScopeKey}
        propertyPath={propertyPathForKeyframe?.(Math.max(0, keyframes.length - 1))}
        paintCapabilities={paintCapabilities}
      />
    </div>
  );
}
