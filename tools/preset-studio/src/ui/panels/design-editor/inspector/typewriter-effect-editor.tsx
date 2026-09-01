import { ChevronRight, Plus } from 'lucide-react';
import { type ReactNode, useContext, useEffect, useRef, useState } from 'react';

import type {
  AnimatableTargetOption,
  AnimationKeyframeDoc,
  AnimationTrackDoc,
  AnimationTrackMode,
  AnimationTrackSampling,
  ContainerNode,
  PropertyNode,
} from '@/schema';
import { cn } from '@/lib/utils';
import { InfoTooltip } from '@/ui/controls/info-tooltip';
import { Button } from '@/ui/shadcn/button';
import {
  DRAWER_VERTICAL_STACK_GAP_CLASS,
  INSPECTOR_CARD_CONTENT_STACK_CLASS,
  INSPECTOR_LABELED_SECTION_VERTICAL_PADDING_CLASS,
} from '@/ui/controls/inspector-layout';
import {
  FieldOverridesContext,
  PropertyTreeView,
  type FieldOverride,
} from '@/ui/panels/property-tree-view';
import {
  InspectorOverlayDrawer,
  InspectorOverlayDrawerBody,
} from '@/ui/panels/design-editor/inspector/inspector-overlay-drawer';

import { propsToContainer } from '../entity-tree';
import { AddTrackMenu } from './animation-editor/add-track-menu';
import {
  convertKeyframesForSampling,
  defaultKeyframesForOption,
  groupTracksByOwner,
  humanizeTargetOwner,
  humanizeTrack,
  interpolatedValueAtTime,
  keyframeKey,
  kindForTrack,
} from './animation-editor/helpers';
import { findNonOverlappingTime, GRID_SECONDS, snapToGrid } from './animation-editor/timeline/grid';
import { TrackRow } from './animation-editor/track-row';
import { TypewriterCursorEditor } from './typewriter-cursor-editor';
import { StateOverrideContext } from '../state-overrides';

const TYPEWRITER_UNIT_TRACK_OPTIONS = [
  { target: 'unit.opacity', kind: 'number', defaultValue: 1, ownerLabel: 'Character' },
  { target: 'unit.scale', kind: 'vector2', defaultValue: { x: 1, y: 1 }, ownerLabel: 'Character' },
  { target: 'unit.offset', kind: 'vector2', defaultValue: { x: 0, y: 0 }, ownerLabel: 'Character' },
  { target: 'unit.rotation', kind: 'number', defaultValue: 0, ownerLabel: 'Character' },
  {
    target: 'unit.color',
    kind: 'paint',
    defaultValue: { type: 'solid', color: '#ffffff' },
    ownerLabel: 'Character',
  },
] as const satisfies readonly AnimatableTargetOption[];

type TypewriterUnitTrackTarget = (typeof TYPEWRITER_UNIT_TRACK_OPTIONS)[number]['target'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneTrackValue<T>(value: T): T {
  return value && typeof value === 'object' ? structuredClone(value) : value;
}

function unitTrackOption(target: string): (typeof TYPEWRITER_UNIT_TRACK_OPTIONS)[number] | undefined {
  return TYPEWRITER_UNIT_TRACK_OPTIONS.find((option) => option.target === target);
}

function isTypewriterUnitTrackTarget(value: unknown): value is TypewriterUnitTrackTarget {
  return typeof value === 'string' && unitTrackOption(value) !== undefined;
}

function defaultValueForTarget(target: TypewriterUnitTrackTarget): unknown {
  return cloneTrackValue(unitTrackOption(target)?.defaultValue ?? 0);
}

function normalizeUnitTrack(value: unknown): AnimationTrackDoc | null {
  if (!isRecord(value)) return null;
  const target = isTypewriterUnitTrackTarget(value.target) ? value.target : TYPEWRITER_UNIT_TRACK_OPTIONS[0].target;
  const keyframes = Array.isArray(value.keyframes)
    ? value.keyframes.flatMap((keyframe): AnimationKeyframeDoc[] => {
        if (!isRecord(keyframe) || typeof keyframe.time !== 'number' || !Number.isFinite(keyframe.time)) return [];
        return [
          {
            ...keyframe,
            time: Math.max(0, keyframe.time),
            value: keyframe.value === undefined ? defaultValueForTarget(target) : cloneTrackValue(keyframe.value),
          },
        ];
      })
    : [];
  return {
    enabled: value.enabled !== false,
    target,
    keyframes,
    ...(value.mode === 'relative' ? { mode: 'relative' as const } : value.mode === 'absolute' ? { mode: 'absolute' as const } : {}),
    ...(value.sampling === 'randomValues' || value.sampling === 'randomRange' ? { sampling: value.sampling } : {}),
    ...(typeof value.updateEveryFrame === 'boolean' ? { updateEveryFrame: value.updateEveryFrame } : {}),
  };
}

function unitTracksFromNode(node: PropertyNode | undefined): AnimationTrackDoc[] {
  if (node?.kind !== 'leaf' || node.type !== 'array' || !Array.isArray(node.value)) return [];
  return node.value.flatMap((value): AnimationTrackDoc[] => {
    const normalized = normalizeUnitTrack(value);
    return normalized ? [normalized] : [];
  });
}

function unitTrackNode(tracks: readonly AnimationTrackDoc[]): PropertyNode {
  return {
    kind: 'leaf',
    type: 'array',
    value: tracks.map((track) => ({
      ...track,
      ...(track.mode ? { mode: track.mode } : {}),
      ...(track.sampling ? { sampling: track.sampling } : {}),
      ...(track.updateEveryFrame === true ? { updateEveryFrame: true } : {}),
      keyframes: track.keyframes.map((keyframe) => ({
        ...keyframe,
        value: cloneTrackValue(keyframe.value),
      })),
    })),
  };
}

function numberLeaf(node: PropertyNode | undefined, fallback: number): number {
  return node?.kind === 'leaf' && typeof node.value === 'number' && Number.isFinite(node.value) ? node.value : fallback;
}

export function TypewriterEffectEditor({
  props,
  stateKeyPrefix,
  fieldOverrides,
  fontSize,
  onChange,
}: {
  props: Record<string, PropertyNode>;
  stateKeyPrefix: string;
  fieldOverrides: Readonly<Record<string, FieldOverride>>;
  fontSize?: number;
  onChange: (updater: (previous: PropertyNode) => PropertyNode) => void;
}): ReactNode {
  const [tracksDrawerOpen, setTracksDrawerOpen] = useState(false);
  const [tracksAddMenuOpen, setTracksAddMenuOpen] = useState(false);
  const [openTracksAddMenuAfterDrawer, setOpenTracksAddMenuAfterDrawer] = useState(false);
  const [selectedKeyframes, setSelectedKeyframes] = useState<Set<string>>(new Set());
  const dragPreviewRef = useRef<Map<string, number> | null>(null);
  const [, setDragRenderTick] = useState(0);
  const dragOriginRef = useRef<{
    origins: { trackIndex: number; keyframeIndex: number; time: number }[];
    lowerDeltaBound: number;
    upperDeltaBound: number;
  } | null>(null);

  const tracks = unitTracksFromNode(props.unitTracks);
  const timelineDurationSeconds = Math.max(numberLeaf(props.unitDurationSeconds, 0.18), 0.001);
  const stateOverrideContext = useContext(StateOverrideContext);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest('[data-keyframe-ui]')) setSelectedKeyframes(new Set());
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  useEffect(() => {
    const pending = stateOverrideContext?.pendingNavigation ?? stateOverrideContext?.pendingHistoryNavigation;
    if (!pending || pending.scopeKey !== stateKeyPrefix || pending.propertyPath?.[0] !== 'unitTracks') return;
    setTracksDrawerOpen(true);
    if (stateOverrideContext?.pendingHistoryNavigation) {
      stateOverrideContext.onHistoryNavigationComplete();
    }
  }, [
    stateKeyPrefix,
    stateOverrideContext?.pendingHistoryNavigation,
    stateOverrideContext?.pendingNavigation,
    stateOverrideContext,
  ]);

  const updateTracks = (updater: (previous: AnimationTrackDoc[]) => AnimationTrackDoc[]) => {
    onChange((previous) => {
      if (previous.kind !== 'container') return previous;
      return {
        ...previous,
        children: {
          ...previous.children,
          unitTracks: unitTrackNode(updater(unitTracksFromNode(previous.children.unitTracks))),
        },
      };
    });
  };

  const cursor = props.cursor?.kind === 'container' ? props.cursor : undefined;
  const updateCursor = (updater: (previous: ContainerNode) => ContainerNode): void => {
    onChange((previous) => {
      if (previous.kind !== 'container' || previous.children.cursor?.kind !== 'container') return previous;
      return {
        ...previous,
        children: {
          ...previous.children,
          cursor: updater(previous.children.cursor),
        },
      };
    });
  };

  const clearKeyframeSelectionForTrack = (trackIndex: number) =>
    setSelectedKeyframes((previous) => {
      const prefix = `${trackIndex}:`;
      return new Set([...previous].filter((key) => !key.startsWith(prefix)));
    });

  const isKeyframeSelected = (trackIndex: number, keyframeIndex: number) =>
    selectedKeyframes.has(keyframeKey(trackIndex, keyframeIndex));

  const selectKeyframe = (trackIndex: number, keyframeIndex: number, additive: boolean) => {
    const key = keyframeKey(trackIndex, keyframeIndex);
    setSelectedKeyframes((previous) => {
      if (!additive) return previous.has(key) && previous.size > 1 ? previous : new Set([key]);
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const beginKeyframeDrag = (trackIndex: number, keyframeIndex: number, additive: boolean) => {
    const key = keyframeKey(trackIndex, keyframeIndex);
    const keepGroup = additive || selectedKeyframes.has(key);
    const activeKeys = new Set(keepGroup ? selectedKeyframes : []);
    if (additive && activeKeys.has(key)) activeKeys.delete(key);
    else activeKeys.add(key);

    const origins = tracks.flatMap((track, trackIdx) =>
      track.keyframes
        .map((keyframe, keyframeIdx) => ({ trackIndex: trackIdx, keyframeIndex: keyframeIdx, time: keyframe.time }))
        .filter((entry) => activeKeys.has(keyframeKey(entry.trackIndex, entry.keyframeIndex))),
    );

    let lowerDeltaBound = -Infinity;
    let upperDeltaBound = Infinity;
    const originsByTrack = new Map<number, typeof origins>();
    for (const origin of origins) {
      const entries = originsByTrack.get(origin.trackIndex) ?? [];
      entries.push(origin);
      originsByTrack.set(origin.trackIndex, entries);
    }
    for (const [currentTrackIndex, changes] of originsByTrack) {
      const track = tracks[currentTrackIndex];
      if (!track) continue;
      const selectedIndices = new Set(changes.map((change) => change.keyframeIndex));
      const minSelectedTime = Math.min(...changes.map((change) => change.time));
      const maxSelectedTime = Math.max(...changes.map((change) => change.time));
      let lowerNeighborTime: number | null = null;
      let upperNeighborTime: number | null = null;
      track.keyframes.forEach((keyframe, currentKeyframeIndex) => {
        if (selectedIndices.has(currentKeyframeIndex)) return;
        if (keyframe.time <= minSelectedTime) lowerNeighborTime = Math.max(lowerNeighborTime ?? -Infinity, keyframe.time);
        if (keyframe.time >= maxSelectedTime) upperNeighborTime = Math.min(upperNeighborTime ?? Infinity, keyframe.time);
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
    updateTracks((previous) =>
      previous.map((track, trackIndex) => ({
        ...track,
        keyframes: track.keyframes.map((keyframe, keyframeIndex) => {
          const previewTime = preview.get(keyframeKey(trackIndex, keyframeIndex));
          return previewTime === undefined ? keyframe : { ...keyframe, time: previewTime };
        }),
      })),
    );
  };

  const selectedCountInTrack = (trackIndex: number) =>
    [...selectedKeyframes].filter((key) => key.startsWith(`${trackIndex}:`)).length;

  const updateTrackKeyframes = (trackIndex: number, keyframes: AnimationKeyframeDoc[]) => {
    if (tracks[trackIndex]?.keyframes.length !== keyframes.length) clearKeyframeSelectionForTrack(trackIndex);
    updateTracks((previous) =>
      previous.map((track, index) => (index === trackIndex ? { ...track, keyframes } : track)),
    );
  };

  const deleteSelectedKeyframesInTrack = (trackIndex: number) => {
    if (selectedCountInTrack(trackIndex) === 0) return;
    updateTracks((previous) =>
      previous.map((track, index) => {
        if (index !== trackIndex) return track;
        const remaining = track.keyframes.filter((_, keyframeIndex) => !selectedKeyframes.has(keyframeKey(index, keyframeIndex)));
        return remaining.length >= 2 ? { ...track, keyframes: remaining } : track;
      }),
    );
    clearKeyframeSelectionForTrack(trackIndex);
  };

  const addKeyframeAtTime = (trackIndex: number, time: number) => {
    updateTracks((previous) => {
      const track = previous[trackIndex];
      if (!track) return previous;
      const kind = kindForTrack(track, TYPEWRITER_UNIT_TRACK_OPTIONS);
      const insertTime = findNonOverlappingTime(
        time,
        track.keyframes.map((keyframe) => keyframe.time),
        timelineDurationSeconds,
      );
      const value = interpolatedValueAtTime(track.keyframes, insertTime, kind);
      return previous.map((candidate, index) =>
        index === trackIndex ? { ...candidate, keyframes: [...candidate.keyframes, { time: insertTime, value }] } : candidate,
      );
    });
  };

  const effectiveTrackFor = (trackIndex: number, track: AnimationTrackDoc): AnimationTrackDoc => {
    const preview = dragPreviewRef.current;
    if (!preview) return track;
    let changed = false;
    const keyframes = track.keyframes.map((keyframe, keyframeIndex) => {
      const previewTime = preview.get(keyframeKey(trackIndex, keyframeIndex));
      if (previewTime === undefined) return keyframe;
      changed = true;
      return { ...keyframe, time: previewTime };
    });
    return changed ? { ...track, keyframes } : track;
  };

  const setTrackEnabled = (trackIndex: number, enabled: boolean) =>
    updateTracks((previous) =>
      previous.map((track, index) => (index === trackIndex ? { ...track, enabled } : track)),
    );

  const setTrackSampling = (trackIndex: number, sampling: AnimationTrackSampling) => {
    clearKeyframeSelectionForTrack(trackIndex);
    updateTracks((previous) =>
      previous.map((track, index) => {
        if (index !== trackIndex) return track;
        const kind = kindForTrack(track, TYPEWRITER_UNIT_TRACK_OPTIONS);
        const keyframes = convertKeyframesForSampling(track.keyframes, kind, sampling);
        return { ...track, keyframes, sampling: sampling === 'interpolate' ? undefined : sampling };
      }),
    );
  };

  const setTrackUpdateEveryFrame = (trackIndex: number, enabled: boolean) =>
    updateTracks((previous) =>
      previous.map((track, index) => (index === trackIndex ? { ...track, updateEveryFrame: enabled } : track)),
    );

  const setTrackMode = (trackIndex: number, mode: AnimationTrackMode) =>
    updateTracks((previous) =>
      previous.map((track, index) =>
        index === trackIndex
          ? { ...track, ...(mode === 'absolute' ? { mode: undefined } : { mode }) }
          : track,
      ),
    );

  const removeTrack = (trackIndex: number) => {
    setSelectedKeyframes(new Set());
    updateTracks((previous) => previous.filter((_, index) => index !== trackIndex));
  };

  const addTrack = (option: AnimatableTargetOption) =>
    updateTracks((previous) => [
      ...previous,
      {
        enabled: true,
        target: option.target,
        keyframes: defaultKeyframesForOption(option, timelineDurationSeconds),
      },
    ]);

  const usedTargets = new Set(tracks.map((track) => track.target));
  const addableTargets = TYPEWRITER_UNIT_TRACK_OPTIONS.filter((option) => !usedTargets.has(option.target));
  const openTracksDrawerForAdding = () => {
    setOpenTracksAddMenuAfterDrawer(true);
    setTracksDrawerOpen(true);
  };
  const handleTracksDrawerOpenChange = (open: boolean) => {
    setTracksDrawerOpen(open);
    if (!open) {
      setTracksAddMenuOpen(false);
      setOpenTracksAddMenuAfterDrawer(false);
    }
  };

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

  return (
    <div className={INSPECTOR_CARD_CONTENT_STACK_CLASS}>
      <FieldOverridesContext.Provider value={fieldOverrides}>
        <PropertyTreeView
          node={propsToContainer(props)}
          fieldKey="typewriter"
          stateKeyPrefix={stateKeyPrefix}
          onChange={onChange}
          hiddenFieldKeys={new Set(['cursor', 'unitTracks'])}
          dependentFieldGroups={{ durationMode: ['unitDurationSeconds', 'delaySeconds'] }}
        />
      </FieldOverridesContext.Provider>

      {cursor && (
        <FieldOverridesContext.Provider value={fieldOverrides}>
          <TypewriterCursorEditor
            node={cursor}
            stateKeyPrefix={stateKeyPrefix}
            fieldOverrides={fieldOverrides}
            fontSize={fontSize}
            onChange={updateCursor}
          />
        </FieldOverridesContext.Provider>
      )}

      <section
        className={cn('border-border/60 border-t', INSPECTOR_CARD_CONTENT_STACK_CLASS)}
        aria-label="Per-character animation"
      >
        <div
          className={cn(
            'flex items-center justify-between gap-2',
            INSPECTOR_LABELED_SECTION_VERTICAL_PADDING_CLASS,
          )}
        >
          <div className="flex items-center gap-1">
            <h4 className="text-xs font-semibold">Per-character animation</h4>
            <InfoTooltip ariaLabel="Explain per-character animation" side="top">
              Add tracks to animate each character as the Typewriter effect reveals it.
            </InfoTooltip>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="text-muted-foreground hover:text-foreground shrink-0 gap-0.5"
            onClick={tracks.length === 0 ? openTracksDrawerForAdding : () => setTracksDrawerOpen(true)}
          >
            {tracks.length === 0 ? (
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
        </div>

        <div
          className={cn(
            'flex items-center justify-between gap-2',
            INSPECTOR_LABELED_SECTION_VERTICAL_PADDING_CLASS,
          )}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {tracks.length === 0 && <span className="text-muted-foreground text-[11px]">No tracks yet</span>}
            {tracks.map((track, trackIndex) => (
              <button
                key={`${track.target}-${trackIndex}`}
                type="button"
                onClick={() => setTracksDrawerOpen(true)}
                className="bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground shrink-0 rounded px-2 py-1 text-xs font-medium transition-colors"
              >
                {humanizeTrack(track, TYPEWRITER_UNIT_TRACK_OPTIONS)}
              </button>
            ))}
          </div>
        </div>

        <InspectorOverlayDrawer
          open={tracksDrawerOpen}
          onOpenChange={handleTracksDrawerOpenChange}
          dataSlot="tracks-drawer"
          title="Character animation tracks"
          description="Add, edit, or remove per-character tracks."
          headerAction={
            <AddTrackMenu
              options={addableTargets}
              onAdd={addTrack}
              groupByOwner
              open={tracksAddMenuOpen}
              onOpenChange={setTracksAddMenuOpen}
            />
          }
        >
              <InspectorOverlayDrawerBody>
                {tracks.length === 0 && (
                  <p className="text-muted-foreground text-[11px]">This typewriter effect has no per-character tracks.</p>
                )}
                {groupTracksByOwner(tracks).map((group) => (
                  <div key={group.owner} className={`flex flex-col ${DRAWER_VERTICAL_STACK_GAP_CLASS}`}>
                    <div
                      className={cn(
                        'flex items-center justify-between gap-2',
                        INSPECTOR_LABELED_SECTION_VERTICAL_PADDING_CLASS,
                      )}
                    >
                      <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
                        {humanizeTargetOwner(group.owner, TYPEWRITER_UNIT_TRACK_OPTIONS)}
                      </p>
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
                        trackPathPrefix="unitTracks"
                        navigationTarget={null}
                        targetOptions={TYPEWRITER_UNIT_TRACK_OPTIONS}
                        kind={kindForTrack(track, TYPEWRITER_UNIT_TRACK_OPTIONS)}
                        durationSeconds={timelineDurationSeconds}
                        modeField={{ label: 'Mode', isVisible: () => true }}
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
                        onKeyframeDragStart={(keyframeIndex, additive) => beginKeyframeDrag(index, keyframeIndex, additive)}
                        onKeyframeDrag={dragKeyframesBy}
                        onKeyframeDragEnd={endKeyframeDrag}
                        onAddKeyframeAt={(time) => addKeyframeAtTime(index, time)}
                      />
                    ))}
                  </div>
                ))}
                <AddTrackMenu options={addableTargets} onAdd={addTrack} fullWidthTrigger />
              </InspectorOverlayDrawerBody>
        </InspectorOverlayDrawer>
      </section>
    </div>
  );
}
