import { ChevronDown, ChevronRight, Plus, RotateCcw } from 'lucide-react';
import { type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import type {
  AnimatableTargetOption,
  AnimationDoc,
  AnimationKeyframeDoc,
  AnimationTrackMode,
  AnimationTrackDoc,
  AnimationTrackSampling,
  EcsComponentDoc,
  EcsEntityDoc,
} from '@/schema';
import {
  ANIMATION_PHASES,
  ANIMATION_PLAYBACK_MODES,
  ANIMATION_PRESETS,
  ANIMATION_SCOPES,
  ANIMATION_LIFECYCLE_SCHEDULINGS,
  ANIMATION_TRIGGER_BEHAVIORS,
  applyPresetToAnimation,
  CUSTOM_PRESET_ID,
  defaultPresetParameters,
  findAnimationPreset,
  getComponentDescription,
  listAnimatableTargets,
  listVisibleAnimatableTargets,
  SEQUENCER_PATTERNS,
} from '@/schema';
import { CollapsibleSection } from '@/ui/controls/collapsible-section';
import { DisabledStateTooltip } from '@/ui/controls/disabled-state-tooltip';
import { humanizeFieldKey } from '@/ui/controls/field-row';
import { InfoTooltip } from '@/ui/controls/info-tooltip';
import {
  INSPECTOR_CARD_CONTENT_CLASS,
  INSPECTOR_CARD_CONTENT_STACK_CLASS,
  INSPECTOR_CARD_HEADER_GROUP_CLASS,
  INSPECTOR_LABELED_SECTION_VERTICAL_PADDING_CLASS,
  DRAWER_VERTICAL_STACK_GAP_CLASS,
} from '@/ui/controls/inspector-layout';
import { InspectorCardSurfaceContext } from '@/ui/controls/inspector-card-surface-context';
import {
  createInspectorDeleteAction,
  InspectorHeaderOptions,
  type InspectorHeaderAction,
} from '@/ui/controls/inspector-header-options';
import { NumberField } from '@/ui/controls/number-field';
import { SelectField } from '@/ui/controls/select-field';
import {
  InspectorOverlayDrawer,
  InspectorOverlayDrawerBody,
} from '@/ui/panels/design-editor/inspector/inspector-overlay-drawer';
import {
  headerIconForComponent,
  INSPECTOR_COMPACT_CARD_HEADER_CLASS,
  INSPECTOR_HEADER_ACTION_ROW_CLASS,
  InspectorPropertyAnchor,
  useInspectorCardOpenState,
} from '@/ui/panels/property-tree-view';
import { Button } from '@/ui/shadcn/button';
import { CardContent, CardTitle, SubCard, SubCardHeader } from '@/ui/shadcn/card';
import { Checkbox } from '@/ui/shadcn/checkbox';

import { AddTrackMenu } from './animation-editor/add-track-menu';
import {
  convertKeyframesForSampling,
  defaultKeyframesForOption,
  animationTrackOwner,
  groupTracksByOwner,
  humanizePreset,
  humanizeTrack,
  humanizeTargetOwner,
  interpolatedValueAtTime,
  isPresetModified,
  keyframeKey,
  kindForTrack,
} from './animation-editor/helpers';
import { CurrentlyDisabledBadge } from './currently-disabled-badge';
import { animationTargetOwnerDisabledType, isAnimationTargetOwnerDisabled } from './disabled-state';
import { PresetParameters } from './animation-editor/preset-parameters';
import { findNonOverlappingTime, GRID_SECONDS, snapToGrid } from './animation-editor/timeline/grid';
import { TrackRow } from './animation-editor/track-row';
import { StateOverrideContext } from '../state-overrides';
import { AnimationTrackNavigationContext } from '../animation-track-navigation';

const PRESET_OPTIONS = [...ANIMATION_PRESETS.map((preset) => preset.id), CUSTOM_PRESET_ID];

const TRIGGER_BEHAVIOR_DESCRIPTIONS: Record<AnimationDoc['triggerBehavior'], ReactNode> = {
  adaptive: (
    <>
      <strong>Adapt to the next trigger.</strong>
      <br />
      Shorten the animation when the next trigger arrives sooner.
    </>
  ),
  restart: (
    <>
      <strong>Start from the beginning.</strong>
      <br />
      Restart the animation on every trigger.
    </>
  ),
  continue: (
    <>
      <strong>Keep the current progress.</strong>
      <br />
      Continue the animation when a new trigger arrives.
    </>
  ),
};

const LIFECYCLE_SCHEDULING_LABELS: Record<AnimationDoc['lifecycleScheduling'], string> = {
  overlap: 'Overlap',
  sequential: 'Sequential',
};

const LIFECYCLE_SCHEDULING_DESCRIPTIONS: Record<AnimationDoc['lifecycleScheduling'], ReactNode> = {
  overlap: (
    <>
      <strong>Allow phases to overlap.</strong>
      <br />
      Entry, Active, and Exit can run at the same time.
    </>
  ),
  sequential: (
    <>
      <strong>Run phases in order.</strong>
      <br />
      Adaptive timing fits them to the row duration.
    </>
  ),
};

const ANIMATION_PHASE_LABELS: Partial<Record<AnimationDoc['phase'], string>> = {
  enter: 'Entry',
  active: 'Active',
  exit: 'Exit',
  custom: 'Custom',
};

const ANIMATION_PHASE_DESCRIPTIONS: Partial<Record<AnimationDoc['phase'], ReactNode>> = {
  enter: <strong>Animate the entity as it appears.</strong>,
  active: <strong>Animate the entity while it is visible.</strong>,
  exit: <strong>Animate the entity as it leaves.</strong>,
  custom: (
    <>
      <strong>Edit the animation tracks directly.</strong>
      <br />
      Preset changes no longer regenerate these tracks.
    </>
  ),
};

const ANIMATION_PLAYBACK_LABELS: Partial<Record<AnimationDoc['playbackMode'], string>> = {
  once: 'Once',
  loop: 'Loop',
  pingPong: 'Ping-Pong',
};

const ANIMATION_PLAYBACK_DESCRIPTIONS: Record<AnimationDoc['playbackMode'], ReactNode> = {
  once: <strong>Play the animation once.</strong>,
  loop: <strong>Repeat the animation from the start.</strong>,
  pingPong: <strong>Repeat forward, then backward.</strong>,
};

const ANIMATION_SCOPE_DESCRIPTIONS: Record<AnimationDoc['scope'], ReactNode> = {
  self: <strong>Animate this entity only.</strong>,
  children: <strong>Animate the direct children of this entity.</strong>,
  descendants: <strong>Animate all nested children of this entity.</strong>,
};

const SEQUENCER_PATTERN_LABELS: Partial<Record<AnimationDoc['sequencer']['pattern'], string>> = {
  simultaneous: 'All at Once',
  stagger: 'In Order',
  wave: 'Cascade',
  random: 'Random Order',
  centerOut: 'Center to Edges',
  outsideIn: 'Edges to Center',
  timeline: 'Timeline',
};

const SEQUENCER_PATTERN_DESCRIPTIONS: Record<AnimationDoc['sequencer']['pattern'], ReactNode> = {
  simultaneous: <strong>Start all targets together.</strong>,
  stagger: (
    <>
      <strong>Start targets in order.</strong>
      <br />
      Apply the interval between each start.
    </>
  ),
  wave: (
    <>
      <strong>Move through targets in order.</strong>
      <br />
      Apply the interval between each start.
    </>
  ),
  random: <strong>Start targets in a seeded random order.</strong>,
  centerOut: <strong>Start at the center and move toward the ends.</strong>,
  outsideIn: <strong>Start at the ends and move toward the center.</strong>,
  timeline: (
    <>
      <strong>Use keyframe timing.</strong>
      <br />
      Do not add target delays.
    </>
  ),
};

const SEQUENCER_INTERVAL_DESCRIPTION: ReactNode = (
  <>
    <strong>Set the delay between target starts.</strong>
    <br />
    This applies to staggered and wave patterns.
  </>
);

/** Compact editor for one first-class Animation component. */
export function AnimationComponentEditor({
  component,
  stateKeyPrefix,
  onUpdate,
  onDelete,
  dragHandle,
  entity,
  dependencyLabel,
  copyPasteActions = [],
  allowDisable = true,
}: {
  component: EcsComponentDoc;
  stateKeyPrefix: string;
  onUpdate: (updater: (previous: EcsComponentDoc) => EcsComponentDoc) => void;
  onDelete?: () => void;
  dragHandle?: ReactNode;
  entity: EcsEntityDoc;
  dependencyLabel?: string;
  copyPasteActions?: readonly InspectorHeaderAction[];
  allowDisable?: boolean;
}): ReactNode {
  const animation = component.animation;
  const [open, setOpen] = useInspectorCardOpenState(stateKeyPrefix, false);
  const [tracksDrawerOpen, setTracksDrawerOpen] = useState(false);
  const [tracksAddMenuOpen, setTracksAddMenuOpen] = useState(false);
  const [openTracksAddMenuAfterDrawer, setOpenTracksAddMenuAfterDrawer] = useState(false);
  const [trackNavigation, setTrackNavigation] = useState<{
    trackIndex: number;
    keyframeIndex: number | null;
    requestId?: number;
  } | null>(null);
  const stateOverrideContext = useContext(StateOverrideContext);
  const animationTrackNavigation = useContext(AnimationTrackNavigationContext);
  const hasTopBanner = useContext(InspectorCardSurfaceContext);
  const [selectedKeyframes, setSelectedKeyframes] = useState<Set<string>>(new Set());
  // Live keyframe positions while a marker drag is in progress, keyed like `selectedKeyframes`.
  // This is the source of truth (a plain ref, always synchronous, unlike a state updater
  // function, whose invocation timing under React's batching is not guaranteed to be synchronous
  // with the call site). `dragRenderTick` exists only to force a re-render after mutating it.
  // mutating a ref alone never triggers one. Re-rendering this (cheap, local) is NOT the same as
  // committing to `animation` via `update()`/`onUpdate` (which can cascade into a much bigger
  // re-render up the tree). Per-frame drag movement only touches the ref. The real commit
  // happens once, on pointer-up.
  const dragPreviewRef = useRef<Map<string, number> | null>(null);
  const [, setDragRenderTick] = useState(0);
  const dragOriginRef = useRef<{
    origins: { trackIndex: number; keyframeIndex: number; time: number }[];
    /** Seconds delta range the current drag is clamped to - keeps it from crossing the nearest unselected neighbor keyframe on either side, per affected track. */
    lowerDeltaBound: number;
    upperDeltaBound: number;
  } | null>(null);

  // Clicking anywhere that is not a keyframe marker or the selection toolbar itself clears the
  // cross-track multi-select - acts as "click outside to lose focus" instead of a Clear button.
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest('[data-keyframe-ui]')) setSelectedKeyframes(new Set());
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  // Disabling auto-collapses the body but does not lock the chevron - it can still be expanded to
  // inspect/edit settings while disabled. Only fires on an actual on->off transition (see the ref
  // guard), never on mount, so an already-disabled-and-reopened card does not flash shut.
  const wasEnabledRef = useRef(Boolean(animation?.enabled));
  useEffect(() => {
    const enabled = Boolean(animation?.enabled);
    if (wasEnabledRef.current && !enabled) setOpen(false);
    wasEnabledRef.current = enabled;
  }, [animation?.enabled, setOpen]);

  useEffect(() => {
    const pending = stateOverrideContext?.pendingNavigation ?? stateOverrideContext?.pendingHistoryNavigation;
    if (!animation || !pending || pending.scopeKey !== stateKeyPrefix) return;
    const propertyPath = pending.propertyPath ?? [];
    const trackMatch = propertyPath[0]?.match(/^tracks\[(\d+)\]$/);
    if (!trackMatch) return;
    const trackIndex = Number(trackMatch[1]);
    if (!animation.tracks[trackIndex]) return;
    const keyframeMatch = propertyPath[1]?.match(/^keyframes\[(\d+)\]$/);
    const keyframeIndex = keyframeMatch ? Number(keyframeMatch[1]) : null;
    setOpen(true);
    setTracksDrawerOpen(true);
    setTrackNavigation({ trackIndex, keyframeIndex });
    setSelectedKeyframes(keyframeIndex === null ? new Set() : new Set([keyframeKey(trackIndex, keyframeIndex)]));
    if (stateOverrideContext?.pendingHistoryNavigation) {
      stateOverrideContext.onHistoryNavigationComplete();
    }
  }, [
    animation,
    setOpen,
    stateKeyPrefix,
    stateOverrideContext?.pendingHistoryNavigation,
    stateOverrideContext?.pendingNavigation,
    stateOverrideContext,
  ]);

  useEffect(() => {
    const pending = animationTrackNavigation?.pendingNavigation;
    if (!animation || !pending || pending.animationScopeKey !== stateKeyPrefix) return;
    if (!animation.tracks[pending.trackIndex]) return;
    setOpen(true);
    setTracksDrawerOpen(true);
    setTrackNavigation({
      trackIndex: pending.trackIndex,
      keyframeIndex: null,
      requestId: pending.requestId,
    });
  }, [animation, animationTrackNavigation?.pendingNavigation, setOpen, stateKeyPrefix]);

  useEffect(() => {
    if (!tracksDrawerOpen || !openTracksAddMenuAfterDrawer) return;
    let secondFrame: number | undefined;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        setTracksAddMenuOpen(true);
        setOpenTracksAddMenuAfterDrawer(false);
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== undefined) window.cancelAnimationFrame(secondFrame);
    };
  }, [openTracksAddMenuAfterDrawer, tracksDrawerOpen]);

  const onAnimationTrackNavigationComplete = useCallback(() => {
    setTrackNavigation(null);
    animationTrackNavigation?.onNavigationComplete();
  }, [animationTrackNavigation]);

  if (!animation) return null;

  const clearKeyframeSelectionForTrack = (trackIndex: number) =>
    setSelectedKeyframes((previous) => {
      const prefix = `${trackIndex}:`;
      const next = new Set([...previous].filter((key) => !key.startsWith(prefix)));
      return next;
    });

  const update = (mutate: (previous: AnimationDoc) => AnimationDoc) =>
    onUpdate((previous) => (previous.animation ? { ...previous, animation: mutate(previous.animation) } : previous));

  const preset = animation.preset !== CUSTOM_PRESET_ID ? findAnimationPreset(animation.preset) : undefined;
  // "Original preset configuration" is always exactly what the preset generates at its own
  // default parameter values. Every pick or switch below seeds tracks that way. Modified-ness
  // is a diff against that, recomputed on demand. No stored snapshot is needed.
  const modified = preset ? isPresetModified(animation, preset) : false;

  const setPreset = (nextId: string) => {
    if (nextId === CUSTOM_PRESET_ID) {
      update((previous) => ({ ...previous, preset: CUSTOM_PRESET_ID }));
      return;
    }
    const nextPreset = findAnimationPreset(nextId);
    if (!nextPreset) return;
    setSelectedKeyframes(new Set());
    update((previous) => applyPresetToAnimation(previous, nextPreset, defaultPresetParameters(nextPreset)));
  };

  const resetPreset = () => {
    if (!preset) return;
    setSelectedKeyframes(new Set());
    update((previous) => applyPresetToAnimation(previous, preset, defaultPresetParameters(preset)));
  };

  const setParameter = (key: string, value: number | string) => {
    if (!preset) return;
    update((previous) => ({
      ...applyPresetToAnimation(previous, preset, { ...previous.parameters, [key]: value }),
      playbackMode: previous.playbackMode,
    }));
  };

  // A direct phase override no longer detaches the animation from its preset - it becomes
  // one more preset-controlled field that can read as "Modified" (see `isPresetModified`), same
  // as a track/keyframe edit, and Reset restores it along with everything else.
  const setPhase = (nextPhase: string) =>
    update((previous) => ({ ...previous, phase: nextPhase as AnimationDoc['phase'] }));

  const setTrackEnabled = (index: number, enabled: boolean) =>
    update((previous) => ({
      ...previous,
      tracks: previous.tracks.map((track, i) => (i === index ? { ...track, enabled } : track)),
    }));

  const removeTrack = (index: number) => {
    setSelectedKeyframes(new Set());
    update((previous) => ({
      ...previous,
      tracks: previous.tracks.filter((_, i) => i !== index),
    }));
  };

  const updateTrackKeyframes = (index: number, keyframes: AnimationKeyframeDoc[]) => {
    if (animation.tracks[index]?.keyframes.length !== keyframes.length) clearKeyframeSelectionForTrack(index);
    update((previous) => ({
      ...previous,
      tracks: previous.tracks.map((track, i) => (i === index ? { ...track, keyframes } : track)),
    }));
  };

  const knownTargets = listAnimatableTargets(entity);
  const visibleTargets = listVisibleAnimatableTargets(entity);
  const usedTargets = new Set(animation.tracks.map((track) => track.target));
  const addableTargets = visibleTargets.filter((option) => !usedTargets.has(option.target));
  const disabledTargetOwners = new Set(
    knownTargets
      .map((option) => animationTrackOwner(option))
      .filter((owner) => isAnimationTargetOwnerDisabled(entity, owner)),
  );

  const openTracksDrawerForAdding = () => {
    setOpenTracksAddMenuAfterDrawer(true);
    setTracksDrawerOpen(true);
  };

  const handleTracksDrawerOpenChange = (nextOpen: boolean) => {
    setTracksDrawerOpen(nextOpen);
    if (!nextOpen) {
      setTracksAddMenuOpen(false);
      setOpenTracksAddMenuAfterDrawer(false);
    }
  };

  const setTrackSampling = (index: number, sampling: AnimationTrackSampling) => {
    clearKeyframeSelectionForTrack(index);
    update((previous) => ({
      ...previous,
      tracks: previous.tracks.map((track, i) => {
        if (i !== index) return track;
        const kind = kindForTrack(track, knownTargets);
        const keyframes = convertKeyframesForSampling(track.keyframes, kind, sampling);
        return { ...track, keyframes, sampling: sampling === 'interpolate' ? undefined : sampling };
      }),
    }));
  };

  const setTrackUpdateEveryFrame = (index: number, enabled: boolean) =>
    update((previous) => ({
      ...previous,
      tracks: previous.tracks.map((track, i) => (i === index ? { ...track, updateEveryFrame: enabled } : track)),
    }));

  const setTrackMode = (index: number, mode: AnimationTrackMode) =>
    update((previous) => ({
      ...previous,
      tracks: previous.tracks.map((track, i) =>
        i === index
          ? { ...track, ...(mode === 'absolute' ? { mode: undefined } : { mode }) }
          : track,
      ),
    }));

  const addTrack = (option: AnimatableTargetOption) =>
    update((previous) => ({
      ...previous,
      tracks: [
        ...previous.tracks,
        {
          enabled: true,
          target: option.target,
          keyframes: defaultKeyframesForOption(option, previous.durationSeconds),
        },
      ],
    }));

  // Fixed to the animation's own Duration field - NOT recomputed from keyframe times, so
  // dragging one keyframe never rescales the ruler (which visually looked like "the other
  // handle moved on its own" whenever the ratio denominator shifted mid-drag).
  const timelineDurationSeconds = Math.max(animation.durationSeconds, 0.001);

  const isKeyframeSelected = (trackIndex: number, keyframeIndex: number) =>
    selectedKeyframes.has(keyframeKey(trackIndex, keyframeIndex));

  const selectKeyframe = (trackIndex: number, keyframeIndex: number, additive: boolean) => {
    const key = keyframeKey(trackIndex, keyframeIndex);
    setSelectedKeyframes((previous) => {
      // Grabbing a keyframe that is already part of a multi-selection keeps the whole group
      // selected (so the drag that follows moves all of them) instead of instantly
      // collapsing down to only the one under the pointer.
      if (!additive) return previous.has(key) && previous.size > 1 ? previous : new Set([key]);
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const beginKeyframeDrag = (trackIndex: number, keyframeIndex: number, additive: boolean) => {
    const key = keyframeKey(trackIndex, keyframeIndex);
    // Compute the resulting selection instead of reading `selectedKeyframes`.
    // The `onSelect` call immediately before this in the same gesture cannot have flushed yet. A plain
    // (non-additive) grab of a keyframe that is already part of the current multi-selection keeps
    // dragging the whole group. A plain grab of a keyframe OUTSIDE the selection collapses
    // the drag down to only that one.
    const keepGroup = additive || selectedKeyframes.has(key);
    const activeKeys = new Set(keepGroup ? selectedKeyframes : []);
    if (additive && activeKeys.has(key)) activeKeys.delete(key);
    else activeKeys.add(key);

    const origins = animation.tracks.flatMap((track, ti) =>
      track.keyframes
        .map((keyframe, ki) => ({ trackIndex: ti, keyframeIndex: ki, time: keyframe.time }))
        .filter((entry) => activeKeys.has(keyframeKey(entry.trackIndex, entry.keyframeIndex))),
    );

    // Per affected track, find the nearest UNSELECTED neighbor time on each side of that
    // track's selected span, then convert to a delta-seconds bound so the drag can never
    // push a selected keyframe past (or exactly onto, past its default 0 floor) a neighbor.
    let lowerDeltaBound = -Infinity;
    let upperDeltaBound = Infinity;
    const originsByTrack = new Map<number, typeof origins>();
    for (const origin of origins) {
      const list = originsByTrack.get(origin.trackIndex) ?? [];
      list.push(origin);
      originsByTrack.set(origin.trackIndex, list);
    }
    for (const [trackIdx, changes] of originsByTrack) {
      const track = animation.tracks[trackIdx];
      const selectedIndices = new Set(changes.map((change) => change.keyframeIndex));
      const minSelectedTime = Math.min(...changes.map((change) => change.time));
      const maxSelectedTime = Math.max(...changes.map((change) => change.time));
      // `null` until a real unselected neighbor is found on that side - only a REAL neighbor
      // keyframe requires a minimum gap. The 0-floor and duration-ceiling stay exact.
      let lowerNeighborTime: number | null = null;
      let upperNeighborTime: number | null = null;
      track.keyframes.forEach((keyframe, ki) => {
        if (selectedIndices.has(ki)) return;
        if (keyframe.time <= minSelectedTime)
          lowerNeighborTime = Math.max(lowerNeighborTime ?? -Infinity, keyframe.time);
        if (keyframe.time >= maxSelectedTime)
          upperNeighborTime = Math.min(upperNeighborTime ?? Infinity, keyframe.time);
      });
      const lowerBoundTime = lowerNeighborTime === null ? 0 : lowerNeighborTime + GRID_SECONDS;
      const upperBoundTime = upperNeighborTime === null ? timelineDurationSeconds : upperNeighborTime - GRID_SECONDS;
      lowerDeltaBound = Math.max(lowerDeltaBound, lowerBoundTime - minSelectedTime);
      upperDeltaBound = Math.min(upperDeltaBound, upperBoundTime - maxSelectedTime);
    }

    dragOriginRef.current = { origins, lowerDeltaBound, upperDeltaBound };
  };

  const dragKeyframesBy = (deltaSeconds: number) => {
    const state = dragOriginRef.current;
    if (!state || state.origins.length === 0) return;
    const clampedDelta = Math.min(state.upperDeltaBound, Math.max(state.lowerDeltaBound, deltaSeconds));
    const next = new Map<string, number>();
    for (const origin of state.origins) {
      next.set(
        keyframeKey(origin.trackIndex, origin.keyframeIndex),
        Math.max(0, snapToGrid(origin.time + clampedDelta)),
      );
    }
    dragPreviewRef.current = next;
    setDragRenderTick((tick) => tick + 1);
  };

  const endKeyframeDrag = () => {
    dragOriginRef.current = null;
    const preview = dragPreviewRef.current;
    dragPreviewRef.current = null;
    setDragRenderTick((tick) => tick + 1);
    if (!preview || preview.size === 0) return;
    update((previous) => ({
      ...previous,
      tracks: previous.tracks.map((track, ti) => ({
        ...track,
        keyframes: track.keyframes.map((keyframe, ki) => {
          const previewTime = preview.get(keyframeKey(ti, ki));
          return previewTime === undefined ? keyframe : { ...keyframe, time: previewTime };
        }),
      })),
    }));
  };

  const selectedCountInTrack = (trackIndex: number) =>
    [...selectedKeyframes].filter((key) => key.startsWith(`${trackIndex}:`)).length;

  const deleteSelectedKeyframesInTrack = (trackIndex: number) => {
    if (selectedCountInTrack(trackIndex) === 0) return;
    update((previous) => ({
      ...previous,
      tracks: previous.tracks.map((track, ti) => {
        if (ti !== trackIndex) return track;
        const remaining = track.keyframes.filter((_, ki) => !selectedKeyframes.has(keyframeKey(ti, ki)));
        // Keep at least 2 keyframes - an interpolate track needs a start and an end.
        return remaining.length >= 2 ? { ...track, keyframes: remaining } : track;
      }),
    }));
    clearKeyframeSelectionForTrack(trackIndex);
  };

  const addKeyframeAtTime = (trackIndex: number, time: number) => {
    update((previous) => {
      const track = previous.tracks[trackIndex];
      if (!track) return previous;
      const kind = kindForTrack(track, knownTargets);
      const insertTime = findNonOverlappingTime(
        time,
        track.keyframes.map((keyframe) => keyframe.time),
        timelineDurationSeconds,
      );
      const value = interpolatedValueAtTime(track.keyframes, insertTime, kind);
      return {
        ...previous,
        tracks: previous.tracks.map((t, ti) =>
          ti === trackIndex ? { ...t, keyframes: [...t.keyframes, { time: insertTime, value }] } : t,
        ),
      };
    });
  };

  /** Overlays any in-progress drag-preview times onto this track's keyframes for rendering, without touching the committed `animation` data until pointer-up. */
  const effectiveTrackFor = (trackIndex: number, track: AnimationTrackDoc): AnimationTrackDoc => {
    const preview = dragPreviewRef.current;
    if (!preview) return track;
    let changed = false;
    const keyframes = track.keyframes.map((keyframe, ki) => {
      const previewTime = preview.get(keyframeKey(trackIndex, ki));
      if (previewTime === undefined) return keyframe;
      changed = true;
      return { ...keyframe, time: previewTime };
    });
    return changed ? { ...track, keyframes } : track;
  };

  const visualOpen = open;
  const resetAction =
    modified && preset
      ? {
          id: 'reset-preset',
          label: 'Reset to preset defaults',
          icon: RotateCcw,
          onSelect: resetPreset,
          confirmation: {
            title: "Reset to preset's default configuration?",
            description:
              "This discards every change made since this preset was selected - tracks, keyframes, timing, and easing all revert. This can't be undone.",
            confirmLabel: 'Reset',
            confirmVariant: 'default' as const,
          },
        }
      : undefined;
  const deleteAction = !dependencyLabel && onDelete ? createInspectorDeleteAction('Animation', onDelete) : undefined;

  return (
    <SubCard className={cn('border-border gap-0 py-0 shadow-none', hasTopBanner && 'rounded-t-none')}>
      <div className="flex flex-col overflow-hidden rounded-[inherit]">
        <SubCardHeader
          className={`${INSPECTOR_COMPACT_CARD_HEADER_CLASS} ${INSPECTOR_CARD_HEADER_GROUP_CLASS} cursor-pointer`}
          data-state={visualOpen ? 'open' : 'closed'}
          onClick={() => setOpen(!open)}
        >
          <div className="flex min-w-0 items-center gap-2">
            {allowDisable && (
              <span className="flex shrink-0" onClick={(event) => event.stopPropagation()}>
                <Checkbox
                  checked={animation.enabled}
                  onCheckedChange={(next) => update((previous) => ({ ...previous, enabled: Boolean(next) }))}
                  aria-label="Animation enabled"
                />
              </span>
            )}
            {headerIconForComponent('animation')}
            <CardTitle className="text-sm font-medium">
              <span className="inline-flex items-center gap-2.5">
                {humanizeFieldKey(component.component)}
                {getComponentDescription('animation') && (
                  <InfoTooltip ariaLabel="Explain Animation" side="top">
                    {getComponentDescription('animation')}
                  </InfoTooltip>
                )}
                <span className="text-muted-foreground text-[11px] font-normal">
                  {humanizePreset(animation.preset)}
                  {modified && ' \u00b7 Modified'}
                </span>
              </span>
            </CardTitle>
          </div>
          <div className={INSPECTOR_HEADER_ACTION_ROW_CLASS} onClick={(e) => e.stopPropagation()}>
            {dragHandle}
            <InspectorPropertyAnchor scopeKey={stateKeyPrefix} propertyPath={['enabled']}>
              {null}
            </InspectorPropertyAnchor>
            <InspectorHeaderOptions
              ariaLabel={`${humanizeFieldKey(component.component)} options`}
              primaryAction={resetAction}
              actions={[...copyPasteActions, ...(deleteAction ? [deleteAction] : [])]}
              menuLabel={dependencyLabel ? `Required by ${dependencyLabel}` : undefined}
            />
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

        {visualOpen && (
          <CardContent className={cn(INSPECTOR_CARD_CONTENT_CLASS, INSPECTOR_CARD_CONTENT_STACK_CLASS)}>
            <InspectorPropertyAnchor scopeKey={stateKeyPrefix} propertyPath={['preset']}>
              <SelectField label="Preset" value={animation.preset} options={PRESET_OPTIONS} onChange={setPreset} />
            </InspectorPropertyAnchor>

            {preset ? (
              <PresetParameters
                parameters={preset.parameters}
                values={animation.parameters}
                overrideScopeKey={stateKeyPrefix}
                onChange={setParameter}
              />
            ) : (
              <>
                <InspectorPropertyAnchor scopeKey={stateKeyPrefix} propertyPath={['durationSeconds']}>
                  <NumberField
                    label="Duration"
                    value={animation.durationSeconds}
                    meta={{ min: 0, max: 10, step: 0.01, unit: 's' }}
                    onChange={(next) => update((previous) => ({ ...previous, durationSeconds: next }))}
                  />
                </InspectorPropertyAnchor>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Custom animation - tracks are edited directly and no longer regenerate from a preset.
                </p>
              </>
            )}

            <InspectorPropertyAnchor scopeKey={stateKeyPrefix} propertyPath={['phase']}>
              <SelectField
                label="Phase"
                value={animation.phase}
                options={ANIMATION_PHASES}
                optionLabels={ANIMATION_PHASE_LABELS}
                optionDescriptions={ANIMATION_PHASE_DESCRIPTIONS}
                onChange={setPhase}
              />
            </InspectorPropertyAnchor>

            <InspectorPropertyAnchor scopeKey={stateKeyPrefix} propertyPath={['delaySeconds']}>
              <NumberField
                label="Start Delay"
                value={animation.delaySeconds}
                meta={{ min: 0, max: 5, step: 0.05, unit: 's' }}
                description={
                  <>
                    <strong>Delay this phase before it starts.</strong>
                    <br />
                    Use zero to start it immediately.
                  </>
                }
                onChange={(next) => update((previous) => ({ ...previous, delaySeconds: next }))}
              />
            </InspectorPropertyAnchor>

            {animation.phase === 'active' && (
              <InspectorPropertyAnchor scopeKey={stateKeyPrefix} propertyPath={['playbackMode']}>
                <SelectField
                  label="Playback"
                  value={animation.playbackMode}
                  options={ANIMATION_PLAYBACK_MODES}
                  optionLabels={ANIMATION_PLAYBACK_LABELS}
                  optionDescriptions={ANIMATION_PLAYBACK_DESCRIPTIONS}
                  description={ANIMATION_PLAYBACK_DESCRIPTIONS[animation.playbackMode]}
                  onChange={(next) =>
                    update((previous) => ({
                      ...previous,
                      playbackMode: next as AnimationDoc['playbackMode'],
                    }))
                  }
                />
              </InspectorPropertyAnchor>
            )}

            <CollapsibleSection title="Sequencing" defaultOpen={false} stateKey={`${stateKeyPrefix}/sequencing`}>
              <InspectorPropertyAnchor scopeKey={stateKeyPrefix} propertyPath={['triggerBehavior']}>
                <SelectField
                  label="Trigger Behavior"
                  value={animation.triggerBehavior}
                  options={ANIMATION_TRIGGER_BEHAVIORS}
                  optionDescriptions={TRIGGER_BEHAVIOR_DESCRIPTIONS}
                  description={TRIGGER_BEHAVIOR_DESCRIPTIONS[animation.triggerBehavior]}
                  onChange={(next) =>
                    update((previous) => ({
                      ...previous,
                      triggerBehavior: next as AnimationDoc['triggerBehavior'],
                    }))
                  }
                />
              </InspectorPropertyAnchor>
              <InspectorPropertyAnchor scopeKey={stateKeyPrefix} propertyPath={['lifecycleScheduling']}>
                <SelectField
                  label="Lifecycle"
                  value={animation.lifecycleScheduling}
                  options={ANIMATION_LIFECYCLE_SCHEDULINGS}
                  optionLabels={LIFECYCLE_SCHEDULING_LABELS}
                  optionDescriptions={LIFECYCLE_SCHEDULING_DESCRIPTIONS}
                  description={LIFECYCLE_SCHEDULING_DESCRIPTIONS[animation.lifecycleScheduling]}
                  onChange={(next) =>
                    update((previous) => ({
                      ...previous,
                      lifecycleScheduling: next as AnimationDoc['lifecycleScheduling'],
                    }))
                  }
                />
              </InspectorPropertyAnchor>
              <InspectorPropertyAnchor scopeKey={stateKeyPrefix} propertyPath={['scope']}>
                <SelectField
                  label="Scope"
                  value={animation.scope}
                  options={ANIMATION_SCOPES}
                  optionDescriptions={ANIMATION_SCOPE_DESCRIPTIONS}
                  description={ANIMATION_SCOPE_DESCRIPTIONS[animation.scope]}
                  onChange={(next) => update((previous) => ({ ...previous, scope: next as AnimationDoc['scope'] }))}
                />
              </InspectorPropertyAnchor>
              {animation.scope !== 'self' && (
                <InspectorPropertyAnchor scopeKey={stateKeyPrefix} propertyPath={['sequencer', 'pattern']}>
                  <SelectField
                    label="Target Sequence"
                    value={animation.sequencer.pattern}
                    options={SEQUENCER_PATTERNS}
                    optionLabels={SEQUENCER_PATTERN_LABELS}
                    optionDescriptions={SEQUENCER_PATTERN_DESCRIPTIONS}
                    description={SEQUENCER_PATTERN_DESCRIPTIONS[animation.sequencer.pattern]}
                    onChange={(next) =>
                      update((previous) => ({
                        ...previous,
                        sequencer: { ...previous.sequencer, pattern: next as AnimationDoc['sequencer']['pattern'] },
                      }))
                    }
                  />
                </InspectorPropertyAnchor>
              )}
              {animation.scope !== 'self' &&
                animation.sequencer.pattern !== 'simultaneous' &&
                animation.sequencer.pattern !== 'timeline' && (
                  <InspectorPropertyAnchor scopeKey={stateKeyPrefix} propertyPath={['sequencer', 'interval']}>
                    <NumberField
                      label="Start Interval"
                      value={animation.sequencer.interval}
                      meta={{ min: 0, max: 2, step: 0.01, unit: 's' }}
                      description={SEQUENCER_INTERVAL_DESCRIPTION}
                      onChange={(next) =>
                        update((previous) => ({ ...previous, sequencer: { ...previous.sequencer, interval: next } }))
                      }
                    />
                  </InspectorPropertyAnchor>
                )}
            </CollapsibleSection>

            <section
              className={cn(
                'border-border/60 border-t',
                INSPECTOR_CARD_CONTENT_STACK_CLASS,
                !animation.enabled && 'opacity-70',
              )}
              aria-label="Animation"
            >
              <div
                className={cn(
                  'flex items-center justify-between gap-2',
                  INSPECTOR_LABELED_SECTION_VERTICAL_PADDING_CLASS,
                )}
              >
                <h4 className="text-xs font-semibold">Animation</h4>
                <DisabledStateTooltip
                  objectType="component"
                  disabled={!animation.enabled}
                  reason="Animation is disabled by its Enabled property."
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className={cn(
                      'text-muted-foreground hover:text-foreground shrink-0 gap-0.5',
                      !animation.enabled && 'opacity-70',
                    )}
                    onClick={animation.tracks.length === 0 ? openTracksDrawerForAdding : () => setTracksDrawerOpen(true)}
                  >
                    {animation.tracks.length === 0 ? (
                      <>
                        <Plus className="size-4 stroke-[2.4]" />
                        Add Tracks
                      </>
                    ) : (
                      <>
                        View Tracks
                        <ChevronRight className="size-3.5" />
                      </>
                    )}
                  </Button>
                </DisabledStateTooltip>
              </div>
              <div
                className={cn(
                  'flex items-center justify-between gap-2',
                  INSPECTOR_LABELED_SECTION_VERTICAL_PADDING_CLASS,
                )}
              >
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  {animation.tracks.length === 0 && (
                    <span className="text-muted-foreground text-[11px]">No tracks yet</span>
                  )}
                  {animation.tracks.map((track, index) => {
                    const disabledType = animation.enabled
                      ? animationTargetOwnerDisabledType(entity, animationTrackOwner(track))
                      : 'component';
                    const disabledReason =
                      disabledType === 'component'
                        ? `${humanizeTargetOwner(animationTrackOwner(track), knownTargets)} is disabled by its Enabled property.`
                        : disabledType === 'effect'
                          ? `${humanizeTargetOwner(animationTrackOwner(track), knownTargets)} effect is disabled by its Enabled property.`
                          : undefined;
                    return (
                      <DisabledStateTooltip
                        key={`${track.target}-${index}`}
                        objectType={disabledType ?? 'component'}
                        disabled={disabledType !== null}
                        reason={disabledReason}
                      >
                        <button
                          type="button"
                          onClick={() => setTracksDrawerOpen(true)}
                          className={cn(
                            'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground shrink-0 rounded px-2 py-1 text-xs font-medium transition-colors',
                            disabledType !== null && 'opacity-70',
                          )}
                        >
                          {humanizeTrack(track, knownTargets)}
                        </button>
                      </DisabledStateTooltip>
                    );
                  })}
                </div>
              </div>
              <InspectorOverlayDrawer
                open={tracksDrawerOpen}
                onOpenChange={handleTracksDrawerOpenChange}
                dataSlot="tracks-drawer"
                title="Animation tracks"
                description="Add, edit, or remove animation tracks."
                headerAction={
                  <AddTrackMenu
                    options={addableTargets}
                    onAdd={addTrack}
                    groupByOwner
                    disabledOwners={disabledTargetOwners}
                    open={tracksAddMenuOpen}
                    onOpenChange={setTracksAddMenuOpen}
                  />
                }
              >
                    <InspectorOverlayDrawerBody>
                      {animation.tracks.length === 0 && (
                        <p className="text-muted-foreground text-[11px]">This animation has no tracks.</p>
                      )}
                      {groupTracksByOwner(animation.tracks).map((group) => (
                        <div key={group.owner} className={`flex flex-col ${DRAWER_VERTICAL_STACK_GAP_CLASS}`}>
                          <div
                            className={cn(
                              'flex items-center justify-between gap-2',
                              INSPECTOR_LABELED_SECTION_VERTICAL_PADDING_CLASS,
                            )}
                          >
                            <div className="flex min-w-0 flex-col items-start gap-0.5">
                              <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
                                {humanizeTargetOwner(group.owner, knownTargets)}
                              </p>
                              {disabledTargetOwners.has(group.owner) && <CurrentlyDisabledBadge />}
                            </div>
                            <AddTrackMenu
                              options={addableTargets.filter((option) => option.target.split('.')[0] === group.owner)}
                              onAdd={addTrack}
                            />
                          </div>
                          {group.entries.map(({ track, index }) => (
                            <TrackRow
                              key={`${track.target}-${index}`}
                              track={effectiveTrackFor(index, track)}
                              trackIndex={index}
                              overrideScopeKey={stateKeyPrefix}
                              navigationTarget={
                                trackNavigation?.trackIndex === index
                                  ? {
                                      keyframeIndex: trackNavigation.keyframeIndex,
                                      requestId: trackNavigation.requestId,
                                    }
                                  : null
                              }
                              onNavigationComplete={
                                trackNavigation?.requestId === undefined ? undefined : onAnimationTrackNavigationComplete
                              }
                              targetOptions={knownTargets}
                              kind={kindForTrack(track, knownTargets)}
                              durationSeconds={timelineDurationSeconds}
                              isKeyframeSelected={(keyframeIndex) => isKeyframeSelected(index, keyframeIndex)}
                              selectedCount={selectedCountInTrack(index)}
                              onDeleteSelected={() => deleteSelectedKeyframesInTrack(index)}
                              onToggle={(enabled) => setTrackEnabled(index, enabled)}
                              onRemove={() => removeTrack(index)}
                              onUpdateKeyframes={(keyframes) => updateTrackKeyframes(index, keyframes)}
                              onChangeSampling={(sampling) => setTrackSampling(index, sampling)}
                              onChangeUpdateEveryFrame={(enabled) => setTrackUpdateEveryFrame(index, enabled)}
                              onChangeMode={(mode) => setTrackMode(index, mode)}
                              onSelectKeyframe={(keyframeIndex, additive) => selectKeyframe(index, keyframeIndex, additive)}
                              onKeyframeDragStart={(keyframeIndex, additive) =>
                                beginKeyframeDrag(index, keyframeIndex, additive)
                              }
                              onKeyframeDrag={dragKeyframesBy}
                              onKeyframeDragEnd={endKeyframeDrag}
                              onAddKeyframeAt={(time) => addKeyframeAtTime(index, time)}
                            />
                          ))}
                        </div>
                      ))}
                      <AddTrackMenu
                        options={addableTargets}
                        onAdd={addTrack}
                        groupByOwner
                        fullWidthTrigger
                        disabledOwners={disabledTargetOwners}
                      />
                    </InspectorOverlayDrawerBody>
                  </InspectorOverlayDrawer>
            </section>
          </CardContent>
        )}
      </div>
    </SubCard>
  );
}
