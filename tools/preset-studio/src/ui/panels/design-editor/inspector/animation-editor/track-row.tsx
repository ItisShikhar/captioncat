import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { ArrowBigUp, ChevronDown, Command, Layers2, Trash2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import type {
  AnimationKeyframeDoc,
  AnimationTrackMode,
  AnimationTrackDoc,
  AnimationTrackSampling,
  AnimationCurve,
  AnimatableTargetOption,
} from '@/schema';
import { NAMED_CURVES } from '@/schema';
import { DeleteConfirmButton } from '@/ui/controls/delete-confirm-button';
import {
  INSPECTOR_CARD_CONTENT_STACK_CLASS,
  INSPECTOR_LABELED_SECTION_VERTICAL_PADDING_CLASS,
} from '@/ui/controls/inspector-layout';
import { NumberField } from '@/ui/controls/number-field';
import { SelectField } from '@/ui/controls/select-field';
import {
  InspectorPropertyAnchor,
  InspectorPropertyOverrideSummary,
} from '@/ui/panels/property-tree-view';
import { Checkbox } from '@/ui/shadcn/checkbox';
import { Button } from '@/ui/shadcn/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';
import { InfoTooltip } from '@/ui/controls/info-tooltip';

import {
  ANIMATION_TRACK_MODES,
  defaultValueForKind,
  hasMixedPaintTypes,
  humanizeTrack,
  humanizeTargetProp,
  interpolatedValueAtTime,
  isRelativePositionTrack,
  paintTypeForTrack,
  type TrackValueKind,
} from './helpers';
import { RandomRangeEditor, RandomValuesEditor, SamplingModeField, UpdateEveryFrameField } from './sampling-controls';
import {
  bestAvailableInsertionTime,
  ENFORCE_GRID_SNAPPING,
  findNonOverlappingTime,
  GRID_SECONDS,
  hasAnyInsertionRoom,
  hasInsertionRoom,
  insertableBoundsNear,
  normalizeTimesToGrid,
  snapToGrid,
} from './timeline/grid';
import { KeyframeTimeline } from './timeline/keyframe-timeline';
import { TrackValueField } from './track-value-field';

/** Small keyboard-key-shaped badge (icon + label) - reads better than spelling out "Shift"/"Ctrl" as plain words in a tooltip. Colored relative to the TOOLTIP's own (deliberately inverted, `bg-foreground text-background`) surface rather than the page's ambient `bg-muted`/`border-border` - those flip the wrong way here and looked mismatched/inverted in dark mode, since the tooltip itself is already the opposite of the page in both themes. */
function KeyCap({ icon: Icon, label }: { icon: typeof ArrowBigUp; label: string }): ReactNode {
  return (
    <span className="border-background/30 bg-background/15 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium">
      <Icon className="size-3" />
      {label}
    </span>
  );
}

/** One track in an animation's Advanced panel: enable/retarget/delete + its keyframe or random-sampling editor. */
export function TrackRow({
  track,
  trackIndex,
  overrideScopeKey,
  trackPathPrefix = 'tracks',
  navigationTarget,
  onNavigationComplete,
  targetOptions,
  kind,
  durationSeconds,
  modeField,
  isKeyframeSelected,
  selectedCount,
  onDeleteSelected,
  onToggle,
  onRemove,
  onUpdateKeyframes,
  onChangeSampling,
  onChangeUpdateEveryFrame,
  onChangeMode,
  onSelectKeyframe,
  onKeyframeDragStart,
  onKeyframeDrag,
  onKeyframeDragEnd,
  onAddKeyframeAt,
}: {
  track: AnimationTrackDoc;
  trackIndex: number;
  overrideScopeKey: string;
  trackPathPrefix?: string;
  navigationTarget: { keyframeIndex: number | null; requestId?: number } | null;
  onNavigationComplete?: () => void;
  targetOptions: readonly AnimatableTargetOption[];
  kind: TrackValueKind;
  /** Shared time axis (seconds) every track's timeline is drawn against, so cross-track drags stay in sync. */
  durationSeconds: number;
  modeField?: {
    label?: string;
    isVisible?: (track: AnimationTrackDoc) => boolean;
  };
  isKeyframeSelected: (keyframeIndex: number) => boolean;
  /** How many of this track's own keyframes are in the cross-track multi-select. */
  selectedCount: number;
  onDeleteSelected: () => void;
  onToggle: (enabled: boolean) => void;
  onRemove: () => void;
  onUpdateKeyframes: (keyframes: AnimationKeyframeDoc[]) => void;
  onChangeSampling: (sampling: AnimationTrackSampling) => void;
  onChangeUpdateEveryFrame: (enabled: boolean) => void;
  onChangeMode: (mode: AnimationTrackMode) => void;
  onSelectKeyframe: (keyframeIndex: number, additive: boolean) => void;
  onKeyframeDragStart: (keyframeIndex: number, additive: boolean) => void;
  onKeyframeDrag: (deltaSeconds: number) => void;
  onKeyframeDragEnd: () => void;
  /** Timeline-bar click-to-insert (already snapped + resolved to a non-overlapping time by the caller is not required - this still nudges away from collisions itself). */
  onAddKeyframeAt: (time: number) => void;
}): ReactNode {
  const [expanded, setExpanded] = useState(false);
  const [activePopoverKeyframeIndex, setActivePopoverKeyframeIndex] = useState<number | null>(null);
  const [highlighted, setHighlighted] = useState(false);
  const trackCardRef = useRef<HTMLDivElement>(null);
  const highlightTimeoutRef = useRef<number | null>(null);
  const label = humanizeTrack(track, targetOptions);
  // Only the prop half (for example, "Scale") - the owner ("Transform") is already shown by the group header this row sits under.
  const rowTitle = isRelativePositionTrack(track) ? 'Position Offset' : humanizeTargetProp(track.target);
  const sampling: AnimationTrackSampling = track.sampling ?? 'interpolate';
  const paintType = kind === 'paint' ? (paintTypeForTrack(track) ?? 'solid') : undefined;
  const paintCapabilities = paintType ? [paintType] : undefined;
  const hasMixedPaintKeyframes = kind === 'paint' && hasMixedPaintTypes(track);
  const canExpand = kind !== 'other';
  const summary =
    sampling === 'randomValues'
      ? `${track.keyframes.length} random value${track.keyframes.length === 1 ? '' : 's'}`
      : sampling === 'randomRange'
        ? 'random range'
        : `${track.keyframes.length} keyframe${track.keyframes.length === 1 ? '' : 's'}`;
  const showModeField = modeField?.isVisible ? modeField.isVisible(track) : track.target === 'Transform.position';
  const modeFieldLabel = modeField?.label ?? 'Position Mode';
  const trackPath = (...segments: string[]): string[] => [`${trackPathPrefix}[${trackIndex}]`, ...segments];
  const keyframePath = (keyframeIndex: number, property: string): string[] =>
    trackPath(`keyframes[${keyframeIndex}]`, property);

  // Self-heals legacy/preset keyframes authored off the grid (for example, a Pop preset's `0.21s`) the
  // first time this track's timeline is shown, so a marker can never render between two ticks.
  useEffect(() => {
    if (!ENFORCE_GRID_SNAPPING || !expanded || sampling !== 'interpolate') return;
    const times = track.keyframes.map((keyframe) => keyframe.time);
    const normalized = normalizeTimesToGrid(times, durationSeconds);
    if (normalized.every((time, index) => time === times[index])) return;
    onUpdateKeyframes(track.keyframes.map((keyframe, index) => ({ ...keyframe, time: normalized[index] })));
  }, [expanded, sampling, track, durationSeconds, onUpdateKeyframes]);

  // Disabling a track auto-collapses it (nothing to configure for a track that is currently
  // switched off) but does not lock the chevron - it can still be expanded again while disabled.
  // Only fires on an actual on->off transition, never on mount.
  const wasEnabledRef = useRef(track.enabled);
  useEffect(() => {
    if (wasEnabledRef.current && !track.enabled) setExpanded(false);
    wasEnabledRef.current = track.enabled;
  }, [track.enabled]);

  useEffect(() => {
    if (!navigationTarget) return;
    setExpanded(true);
    if (navigationTarget.keyframeIndex !== null) setActivePopoverKeyframeIndex(navigationTarget.keyframeIndex);
    if (navigationTarget.requestId === undefined || !onNavigationComplete) return;

    let attempts = 0;
    let frame = 0;
    const focusTrack = () => {
      const card = trackCardRef.current;
      if (!card) {
        if (attempts < 12) {
          attempts += 1;
          frame = window.requestAnimationFrame(focusTrack);
        }
        return;
      }
      card.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      setHighlighted(true);
      if (highlightTimeoutRef.current !== null) window.clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = window.setTimeout(() => {
        setHighlighted(false);
        highlightTimeoutRef.current = null;
      }, 1400);
      onNavigationComplete();
    };
    frame = window.requestAnimationFrame(focusTrack);
    return () => window.cancelAnimationFrame(frame);
  }, [navigationTarget, onNavigationComplete]);

  useEffect(
    () => () => {
      if (highlightTimeoutRef.current !== null) window.clearTimeout(highlightTimeoutRef.current);
    },
    [],
  );

  const updateKeyframe = (index: number, patch: Partial<AnimationKeyframeDoc>) =>
    onUpdateKeyframes(track.keyframes.map((keyframe, i) => (i === index ? { ...keyframe, ...patch } : keyframe)));

  const removeKeyframe = (index: number) => {
    onUpdateKeyframes(track.keyframes.filter((_, i) => i !== index));
    setActivePopoverKeyframeIndex((previous) => (previous === index ? null : previous !== null && previous > index ? previous - 1 : previous));
  };

  const addKeyframe = () => {
    const times = track.keyframes.map((keyframe) => keyframe.time);
    const maxTime = times.length > 0 ? Math.max(...times) : 0;
    // The chronologically last keyframe is not always `track.keyframes[length - 1]`. Dragging can leave
    // the array out of time order, so the array's last entry is not reliably the latest in time.
    const lastByTime = track.keyframes.find((keyframe) => keyframe.time === maxTime) ?? track.keyframes[track.keyframes.length - 1];
    const preferredTime = lastByTime ? lastByTime.time + GRID_SECONDS : 0;
    if (ENFORCE_GRID_SNAPPING && times.length > 0 && !hasAnyInsertionRoom(times, durationSeconds)) return;
    // Prefer extending after the last stop so the value continues.
    // Use another gap when the preferred position has no room.
    const roomAfterLast = !ENFORCE_GRID_SNAPPING || times.length === 0 || hasInsertionRoom(preferredTime, times, durationSeconds);
    const desiredTime = roomAfterLast ? preferredTime : bestAvailableInsertionTime(times, durationSeconds);
    const time = findNonOverlappingTime(desiredTime, times, durationSeconds);
    const value = roomAfterLast
      ? lastByTime
        ? lastByTime.value
        : defaultValueForKind(kind)
      : interpolatedValueAtTime(track.keyframes, time, kind);
    const newKeyframes = [...track.keyframes, { time, value }];
    onUpdateKeyframes(newKeyframes);
    setActivePopoverKeyframeIndex(newKeyframes.length - 1);
  };

  const duplicateKeyframe = (index: number) => {
    const source = track.keyframes[index];
    if (!source) return;
    const times = track.keyframes.map((keyframe) => keyframe.time);
    if (ENFORCE_GRID_SNAPPING && !hasAnyInsertionRoom(times, durationSeconds)) return;
    // The chronologically next keyframe is not always `track.keyframes[index + 1]`.
    // in time order after drags/inserts, so array position can seed the duplicate's desired
    // time off an unrelated (possibly earlier) keyframe. Prefer landing right next to the source
    // Prefer a position next to the source. Use another gap when it is unavailable.
    const nextByTime = times.filter((time) => time > source.time).sort((a, b) => a - b)[0];
    const preferredTime = nextByTime !== undefined ? (source.time + nextByTime) / 2 : source.time + GRID_SECONDS;
    const roomNearSource = !ENFORCE_GRID_SNAPPING || hasInsertionRoom(preferredTime, times, durationSeconds);
    const desiredTime = roomNearSource ? preferredTime : bestAvailableInsertionTime(times, durationSeconds);
    const time = findNonOverlappingTime(desiredTime, times, durationSeconds);
    // Append the keyframe instead of splicing at `index + 1`. Array position is insertion order.
    // Other keyframes keep their array indexes, so cross-track selection stays synchronized.
    const newKeyframes = [...track.keyframes, { ...source, time }];
    onUpdateKeyframes(newKeyframes);
    setActivePopoverKeyframeIndex(newKeyframes.length - 1);
  };

  useEffect(() => {
    if (track.keyframes.length === 0) {
      setActivePopoverKeyframeIndex(null);
      return;
    }
    setActivePopoverKeyframeIndex((previous) =>
      previous === null ? null : previous < track.keyframes.length ? previous : track.keyframes.length - 1,
    );
  }, [track.keyframes.length]);

  useEffect(() => {
    if (!expanded || sampling !== 'interpolate') setActivePopoverKeyframeIndex(null);
  }, [expanded, sampling]);

  return (
    <div
      ref={trackCardRef}
      className={cn(
        'border-border/60 rounded border',
        INSPECTOR_CARD_CONTENT_STACK_CLASS,
        highlighted && 'animation-track-target',
      )}
    >
      <div
        className={cn(
          'flex items-center justify-between gap-2 px-2',
          INSPECTOR_LABELED_SECTION_VERTICAL_PADDING_CLASS,
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <InspectorPropertyAnchor
            scopeKey={overrideScopeKey}
            propertyPath={trackPath('enabled')}
            showOverrideSummary={false}
            className="w-auto shrink-0"
          >
            <Checkbox checked={track.enabled} onCheckedChange={onToggle} />
          </InspectorPropertyAnchor>
          <button
            type="button"
            title={track.target}
            className={cn('flex min-w-0 flex-1 items-center gap-1.5 text-left', !canExpand && 'cursor-default')}
            onClick={() => canExpand && setExpanded(!expanded)}
            disabled={!canExpand}
          >
            {canExpand && (
              <ChevronDown className={`size-3 shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
            )}
            <span className="min-w-0">
              <p className="flex items-center gap-1.5 truncate text-xs font-medium">
                <span className="truncate">{rowTitle}</span>
                {isRelativePositionTrack(track) && (
                  <span className="text-muted-foreground shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide">
                    Relative
                  </span>
                )}
              </p>
              <p className="text-muted-foreground text-[10px]">{summary}</p>
            </span>
          </button>
          <InspectorPropertyOverrideSummary scopeKey={overrideScopeKey} propertyPath={trackPath('enabled')} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DeleteConfirmButton label={`${label} track`} onConfirm={onRemove} />
        </div>
      </div>
      {canExpand && expanded && (
        <div
          className={cn(
            'border-border/60 border-t px-2',
            INSPECTOR_CARD_CONTENT_STACK_CLASS,
            INSPECTOR_LABELED_SECTION_VERTICAL_PADDING_CLASS,
          )}
        >
          {showModeField && (
            <InspectorPropertyAnchor scopeKey={overrideScopeKey} propertyPath={trackPath('mode')}>
              <SelectField
                label={modeFieldLabel}
                value={track.mode ?? 'absolute'}
                options={ANIMATION_TRACK_MODES}
                onChange={(mode) => onChangeMode(mode as AnimationTrackMode)}
              />
            </InspectorPropertyAnchor>
          )}
          <InspectorPropertyAnchor scopeKey={overrideScopeKey} propertyPath={trackPath('sampling')}>
            <SamplingModeField sampling={sampling} onChange={onChangeSampling} />
          </InspectorPropertyAnchor>

          <div className="border-border/60 border-t" />
          <div className="flex items-center gap-1">
            <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">Keyframes</p>
            <InfoTooltip
              ariaLabel="Explain keyframe selection"
              side="right"
              className="text-muted-foreground flex size-5 items-center justify-center rounded"
              iconClassName="size-3.5"
              contentClassName="w-auto max-w-none"
            >
              {/* Manually broken into short, individually `whitespace-nowrap` lines instead of
 letting the browser soft-wrap this within a fixed `max-w` \u2014 a wrapped block's
 auto-sizing (`w-fit`/`fit-content`, even under `display:table`) is computed from
 its PRE-wrap single-line metrics, not the real post-wrap line widths, so it was
 locking the bubble at the full `max-w` cap even though every actual rendered
 line was much narrower, leaving a wide empty margin on the right. Each `nowrap`
 line's own natural width IS its contribution here, so the box hugs whichever
 line is widest with no leftover space. */}
              <p className="flex flex-col gap-0.5 text-xs">
                <span className="whitespace-nowrap">
                  <KeyCap icon={ArrowBigUp} label="Shift" /> or <KeyCap icon={Command} label="Ctrl" /> and click
                </span>
                <span className="whitespace-nowrap">a keyframe to select multiple,</span>
                <span className="whitespace-nowrap">then drag or delete them together.</span>
              </p>
            </InfoTooltip>
          </div>
          {hasMixedPaintKeyframes && (
            <p className="text-destructive text-[10px]">
              Paint keyframes must use the same type. Choose Solid, Linear, or Radial for this track.
            </p>
          )}

          {sampling === 'randomValues' && (
            <RandomValuesEditor
              kind={kind}
              keyframes={track.keyframes}
              onChange={onUpdateKeyframes}
              target={track.target}
              overrideScopeKey={overrideScopeKey}
              propertyPathForKeyframe={(index) => keyframePath(index, 'value')}
              paintCapabilities={paintCapabilities}
            />
          )}
          {sampling === 'randomRange' && (
            <RandomRangeEditor
              kind={kind}
              keyframes={track.keyframes}
              onChange={onUpdateKeyframes}
              target={track.target}
              overrideScopeKey={overrideScopeKey}
              propertyPathForKeyframe={(index) => keyframePath(index, 'value')}
              paintCapabilities={paintCapabilities}
            />
          )}
          {sampling !== 'interpolate' && (
            <InspectorPropertyAnchor scopeKey={overrideScopeKey} propertyPath={trackPath('updateEveryFrame')}>
              <div className="flex items-center justify-between gap-2">
                <UpdateEveryFrameField enabled={track.updateEveryFrame === true} onChange={onChangeUpdateEveryFrame} />
              </div>
            </InspectorPropertyAnchor>
          )}

          {sampling === 'interpolate' && (() => {
            const times = track.keyframes.map((keyframe) => keyframe.time);
            // Whether room exists ANYWHERE in the track, not only right after the last keyframe -
            // both buttons fall back to the best available gap elsewhere once their own preferred
            // spot is full (see `addKeyframe`/`duplicateKeyframe`), so they must only ever
            // disable when the whole track is genuinely packed.
            const canAddMore = !ENFORCE_GRID_SNAPPING || hasAnyInsertionRoom(times, durationSeconds);
            const canAddKeyframe = canAddMore;
            return (
              <div className={INSPECTOR_CARD_CONTENT_STACK_CLASS}>
                <KeyframeTimeline
                  keyframes={track.keyframes}
                  durationSeconds={durationSeconds}
                  isSelected={isKeyframeSelected}
                  activePopoverKeyframeIndex={activePopoverKeyframeIndex}
                  renderPopoverContent={(keyframeIndex) => {
                    const popoverActive = track.keyframes[keyframeIndex];
                    if (!popoverActive) return null;
                    const popoverChronologicalPosition =
                      track.keyframes.filter((keyframe) => keyframe.time < popoverActive.time).length + 1;
                    const popoverCanDuplicate = canAddMore;
                    const popoverIsChronologicallyLast =
                      popoverActive.time === Math.max(...track.keyframes.map((keyframe) => keyframe.time));
                    return (
                      <div data-keyframe-ui className={INSPECTOR_CARD_CONTENT_STACK_CLASS}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-medium">
                              Keyframe {popoverChronologicalPosition}/{track.keyframes.length}
                            </p>
                            <p className="text-muted-foreground text-[10px]">{popoverActive.time.toFixed(2)}s</p>
                          </div>
                          <div data-keyframe-ui className="flex items-center gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  aria-label={`Duplicate keyframe ${keyframeIndex + 1}`}
                                  onClick={() => duplicateKeyframe(keyframeIndex)}
                                  disabled={!popoverCanDuplicate}
                                  className="text-muted-foreground hover:text-foreground flex size-6 shrink-0 items-center justify-center rounded disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <Layers2 className="size-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top">Duplicate Keyframe</TooltipContent>
                            </Tooltip>
                            {track.keyframes.length > 2 && (
                              <button
                                type="button"
                                aria-label={`Remove keyframe ${keyframeIndex + 1}`}
                                onClick={() => removeKeyframe(keyframeIndex)}
                                className="text-muted-foreground hover:text-destructive flex size-6 shrink-0 items-center justify-center rounded"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                        <InspectorPropertyAnchor scopeKey={overrideScopeKey} propertyPath={keyframePath(keyframeIndex, 'time')}>
                          <NumberField
                            label="Time"
                            value={popoverActive.time}
                            meta={
                              ENFORCE_GRID_SNAPPING
                                ? {
                                    ...insertableBoundsNear(
                                      popoverActive.time,
                                      track.keyframes.filter((_, i) => i !== keyframeIndex).map((keyframe) => keyframe.time),
                                      durationSeconds,
                                    ),
                                    step: GRID_SECONDS,
                                    unit: 's',
                                  }
                                : { min: 0, max: durationSeconds, step: GRID_SECONDS, unit: 's' }
                            }
                            onChange={(next) =>
                              updateKeyframe(keyframeIndex, {
                                time: ENFORCE_GRID_SNAPPING ? snapToGrid(next) : next,
                              })
                            }
                            compact
                          />
                        </InspectorPropertyAnchor>
                        <TrackValueField
                          kind={kind}
                          label="Value"
                          value={popoverActive.value}
                          onChange={(value) => updateKeyframe(keyframeIndex, { value })}
                          target={track.target}
                          overrideScopeKey={overrideScopeKey}
                          propertyPath={keyframePath(keyframeIndex, 'value')}
                          paintCapabilities={paintCapabilities}
                        />
                        {popoverIsChronologicallyLast ? (
                          <p className="text-muted-foreground text-[10px] italic">
                            No easing - this is the animation&apos;s last keyframe, so there&apos;s no next stop to ease into.
                          </p>
                        ) : (
                          <InspectorPropertyAnchor scopeKey={overrideScopeKey} propertyPath={keyframePath(keyframeIndex, 'curve')}>
                            <SelectField
                              label="Easing"
                              value={typeof popoverActive.curve === 'string' ? popoverActive.curve : 'linear'}
                              options={NAMED_CURVES}
                              onChange={(next) => updateKeyframe(keyframeIndex, { curve: next as AnimationCurve })}
                              compact
                            />
                          </InspectorPropertyAnchor>
                        )}
                      </div>
                    );
                  }}
                  onSelect={(index, additive) => {
                    onSelectKeyframe(index, additive);
                  }}
                  onOpenPopover={(index) => {
                    setActivePopoverKeyframeIndex(index);
                  }}
                  onDragStart={(index, additive) => {
                    onKeyframeDragStart(index, additive);
                  }}
                  onDrag={onKeyframeDrag}
                  onDragEnd={onKeyframeDragEnd}
                  onAddKeyframeAt={onAddKeyframeAt}
                />
                <div className="flex min-h-6 items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-muted-foreground text-[10px]">
                      Click on a keyframe marker to edit.
                    </p>
                    {selectedCount > 1 && (
                      <p className="text-muted-foreground text-[10px]">{selectedCount} selected</p>
                    )}
                  </div>
                  <div data-keyframe-ui className="flex items-center gap-1.5">
                    {selectedCount > 1 && track.keyframes.length > 2 && (
                      <DeleteConfirmButton
                        label={`${selectedCount} keyframe${selectedCount === 1 ? '' : 's'}`}
                        onConfirm={onDeleteSelected}
                      />
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={addKeyframe}
                      disabled={!canAddKeyframe}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      + Add keyframe
                    </Button>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
