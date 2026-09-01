import type { ReactNode, PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

import type { AnimationKeyframeDoc } from '@/schema';
import { registerPopoverLayer } from '@/lib/popover-interactions';
import { Popover, PopoverAnchor, PopoverContent } from '@/ui/shadcn/popover';

import { collidesWithExisting, ENFORCE_GRID_SNAPPING, GRID_SECONDS, hasInsertionRoom, snapToGrid } from './grid';

/**
 * Every visual color used by this timeline, in ONE place - to re-theme the track bar, ticks,
 * keyframe markers, or the hover-insert line/label, edit the class strings here instead of
 * hunting through the JSX below. Light-mode class first, `dark:` variant second (matches the
 * rest of the app's `@custom-variant dark (&:is(.dark *))` setup in `index.css`).
 */
const TIMELINE_THEME = {
  /** The horizontal track bar itself. */
  trackBg: 'bg-amber-200 dark:bg-amber-950',
  trackBorder: 'border-amber-400/70 dark:border-amber-700/70',
  /** Grid tick marks drawn on top of the track bar. */
  mainTick: 'bg-amber-700 dark:bg-amber-300',
  minorTick: 'bg-amber-700/60 dark:bg-amber-300/60',
  /** Keyframe pin marker (`PinMarker` below) - stem + flag body, selected vs unselected. */
  markerSelectedFill: 'fill-primary',
  markerSelectedStroke: 'stroke-primary',
  markerUnselectedStemFill: 'fill-[#e8ecec] dark:fill-neutral-400',
  markerUnselectedBodyFill: 'fill-white dark:fill-neutral-600',
  markerUnselectedBodyStroke: 'stroke-[#e8ecec] dark:stroke-neutral-400',
  /** Hover-to-insert affordance: the vertical line and its "+ Add keyframe" label. */
  hoverInsertLine: 'bg-destructive',
  hoverInsertLabelBg: 'bg-destructive',
  hoverInsertLabelText: 'text-white',
} as const;

/** Smallest "nice" round number (1/2/5 x a power of ten) that is `>= raw` - the standard axis-tick-spacing algorithm, so label spacing lands on human-friendly step counts instead of an arbitrary stride. */
function niceStride(raw: number): number {
  if (raw <= 1) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const candidates = [1, 2, 5, 10].map((m) => m * magnitude);
  return candidates.find((candidate) => candidate >= raw - 1e-9) ?? candidates[candidates.length - 1] * 10;
}

/** Roughly how much horizontal space a single "0.30s"-shaped label needs, including breathing room, at the ruler's 9px tabular-nums font. */
const MIN_LABEL_GAP_PX = 32;

interface TimelineLabel {
  time: number;
  /** Bold/emphasized - lands on a coarser, structurally-significant subdivision than the rest of the shown labels. */
  major: boolean;
}

/**
 * Picks which grid-step timestamps to label above the track, and which of
 * those are "significant" enough to render bold: as much of the full step
 * grid as fits in `containerWidthPx` without crowding (down to a coarser,
 * evenly-spaced subset when narrow, all the way up to every single tick when
 * there is room for it).
 */
function computeTimelineLabels(duration: number, containerWidthPx: number): TimelineLabel[] {
  const totalSteps = Math.max(1, Math.round(duration / GRID_SECONDS));
  const allCount = totalSteps + 1;
  const maxFittable = containerWidthPx > 0 ? Math.max(2, Math.floor(containerWidthPx / MIN_LABEL_GAP_PX) + 1) : 2;

  const fineStride = maxFittable >= allCount ? 1 : niceStride(Math.ceil(totalSteps / (maxFittable - 1)));
  const coarseStride = niceStride(fineStride + 1);

  const labels: TimelineLabel[] = [];
  for (let index = 0; index <= totalSteps; index += fineStride) {
    labels.push({
      time: snapToGrid(index * GRID_SECONDS),
      major: index === 0 || index === totalSteps || index % coarseStride === 0,
    });
  }
  // Always show the very last step even if it does not fall on an exact `fineStride` multiple.
  const lastShown = labels[labels.length - 1];
  const lastTime = snapToGrid(totalSteps * GRID_SECONDS);
  if (!lastShown || lastShown.time !== lastTime) labels.push({ time: lastTime, major: true });
  return labels;
}

/** Minimum on-screen gap (px) between adjacent minor tick marks before they're considered too crowded to show. */
const MIN_MINOR_TICK_GAP_PX = 6;
/** Never show more than this many minor ticks between one pair of adjacent main ticks, even with ample room. */
const MAX_MINOR_TICKS_PER_GAP = 4;

/** Evenly-spaced minor tick times strictly between each pair of adjacent `mainTimes`, count scaled by the available pixel width per gap - hidden entirely (0 per gap) once there is not room for at least one. */
function computeMinorTicks(mainTimes: readonly number[], duration: number, trackWidthPx: number): number[] {
  if (trackWidthPx <= 0) return [];
  const minors: number[] = [];
  for (let i = 0; i < mainTimes.length - 1; i++) {
    const t1 = mainTimes[i];
    const t2 = mainTimes[i + 1];
    if (t2 <= t1) continue;
    const gapPx = ((t2 - t1) / duration) * trackWidthPx;
    const subdivisions = Math.max(0, Math.min(MAX_MINOR_TICKS_PER_GAP, Math.floor(gapPx / MIN_MINOR_TICK_GAP_PX) - 1));
    for (let s = 1; s <= subdivisions; s++) {
      minors.push(t1 + (s / (subdivisions + 1)) * (t2 - t1));
    }
  }
  return minors;
}

function gridPrecision(step: number): number {
  const text = step.toString();
  if (!text.includes('.')) return 0;
  return text.length - text.indexOf('.') - 1;
}

function formatSeconds(time: number): string {
  const precision = Math.max(2, gridPrecision(GRID_SECONDS));
  const fixed = time.toFixed(precision);
  const normalized = fixed.includes('.')
    ? fixed.replace(/(\.\d*?[1-9])0+$/u, '$1').replace(/\.0+$/u, '.00')
    : fixed;
  return `${normalized}s`;
}

/** Track bar is `h-3` (12px). Main ticks extend toward the ruler labels. Minor ticks stay within it. */
const MAIN_TICK_HEIGHT = 17;
const MINOR_TICK_HEIGHT = 6;

/** Rendered marker size (px) - keeps the source SVG's 19.5:43.339 aspect ratio. */
const MARKER_WIDTH = 10;
const MARKER_HEIGHT = 22.23;

/** Approximate rendered width (px) of the fixed "+ Add keyframe" hover label at this font/padding - the text never changes, so a rough constant is enough to keep it from overflowing the track's own edges (see `hoverLabelOffsetPx`) without needing to measure a ref. */
const HOVER_LABEL_WIDTH_PX = 92;

/**
 * Pin marker: a thin stem (meant to overlap the track bar above it) leading
 * down into a house-shaped flag body, the actual drag handle. Traced from a
 * provided reference SVG (viewBox 0 0 19.5 43.33902) - ids stripped since
 * multiple instances render per track and ids must stay unique in the DOM.
 */
function PinMarker({ selected }: { selected: boolean }): ReactNode {
  return (
    <svg
      width={MARKER_WIDTH}
      height={MARKER_HEIGHT}
      viewBox="0 0 19.5 43.33902"
      aria-hidden="true"
      className="block overflow-visible"
    >
      <rect
        width="1.264"
        height="23.102585"
        x="9.1182175"
        y="0.4932175"
        className={selected ? TIMELINE_THEME.markerSelectedFill : TIMELINE_THEME.markerUnselectedStemFill}
      />
      <path
        d="m 0.75,42.58902 v -11 l 9,-8 9,8 v 11 z"
        strokeWidth={1.5}
        strokeLinejoin="round"
        className={
          selected
            ? `${TIMELINE_THEME.markerSelectedFill} ${TIMELINE_THEME.markerSelectedStroke}`
            : `${TIMELINE_THEME.markerUnselectedBodyFill} ${TIMELINE_THEME.markerUnselectedBodyStroke}`
        }
      />
      <g transform="translate(-6.25,21.58902)">
        <path
          d="M 7.5,20.5 V 10.4 a 0.22159746,0.22159746 114.28817 0 1 0.074984,-0.166162 L 15.925016,2.8661622 a 0.11333333,0.11333333 0 0 1 0.149968,0 l 8.350032,7.3676758 A 0.22159746,0.22159746 65.711833 0 1 24.5,10.4 v 10.1"
          fill="none"
          stroke="#323232"
          strokeWidth={0.8}
          strokeLinejoin="round"
        />
        <path
          transform="scale(-1)"
          d="m -24.8,-20.5 17.5999996,0 a 0.1,0.1 45 0 1 0.1,0.1 v 0.6 a 0.1,0.1 135 0 1 -0.1,0.1 H -24.8 a 0.1,0.1 45 0 1 -0.1,-0.1 v -0.6 a 0.1,0.1 135 0 1 0.1,-0.1 z"
          fill="#323232"
        />
      </g>
    </svg>
  );
}

/**
 * Horizontal keyframe timeline for one track: a plain ticked track bar, and
 * for each keyframe - overlapping the track - a draggable pin marker (whose
 * stem visually protrudes from the bar) with its time label below,
 * positioned by `time / durationSeconds`. Emits raw pixel-derived seconds
 * deltas only - snapping, ordering clamps, and applying the move (incl. to
 * any other selected keyframes across sibling tracks) is the caller's job.
 */
export function KeyframeTimeline({
  keyframes,
  durationSeconds,
  isSelected,
  activePopoverKeyframeIndex,
  renderPopoverContent,
  onSelect,
  onDragStart,
  onDrag,
  onDragEnd,
  onAddKeyframeAt,
  onOpenPopover,
}: {
  keyframes: AnimationKeyframeDoc[];
  durationSeconds: number;
  isSelected: (keyframeIndex: number) => boolean;
  activePopoverKeyframeIndex: number | null;
  renderPopoverContent?: (keyframeIndex: number) => ReactNode;
  onSelect: (keyframeIndex: number, additive: boolean) => void;
  onDragStart: (keyframeIndex: number, additive: boolean) => void;
  onDrag: (deltaSeconds: number) => void;
  onDragEnd: () => void;
  /** Hovering the track bar shows a red insertion line. Clicking inserts a keyframe there. */
  onAddKeyframeAt: (time: number) => void;
  onOpenPopover: (keyframeIndex: number | null) => void;
}): ReactNode {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const rulerRef = useRef<HTMLDivElement | null>(null);
  const popoverLayerId = useId();
  const [rulerWidth, setRulerWidth] = useState(0);
  const duration = durationSeconds > 0 ? durationSeconds : 1;
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  useLayoutEffect(
    () => () => {
      dragCleanupRef.current?.();
    },
    [],
  );

  useEffect(() => {
    if (activePopoverKeyframeIndex === null) return undefined;
    return registerPopoverLayer({ id: popoverLayerId, close: () => onOpenPopover(null) });
  }, [activePopoverKeyframeIndex, onOpenPopover, popoverLayerId]);

  // Tracks the label row's rendered width so `computeTimelineLabels` can decide how many
  // timestamps fit, and re-picks whenever the panel/window is resized.
  useLayoutEffect(() => {
    const el = rulerRef.current;
    if (!el) return;
    const measure = () => setRulerWidth(el.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const timeFromClientX = (clientX: number): number | null => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return snapToGrid(ratio * duration);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>, index: number) => {
    event.preventDefault();
    event.stopPropagation();
    dragCleanupRef.current?.();
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    onSelect(index, additive);
    onDragStart(index, additive);

    const startX = event.clientX;
    const width = trackRef.current?.getBoundingClientRect().width ?? 1;
    const marker = event.currentTarget;
    let didDrag = false;
    // Capture so pointermove/up keep firing on this marker even once the cursor leaves its
    // small hit area mid-drag. It can throw for an inactive pointer id
    // (for example, synthetic events). The manual listeners still work without it.
    try {
      marker.setPointerCapture(event.pointerId);
    } catch {
      // no-op - see comment above
    }

    let frame: number | null = null;
    let pendingDelta: number | null = null;
    const flushPending = () => {
      const delta = pendingDelta;
      pendingDelta = null;
      if (delta !== null) onDrag(delta);
    };
    const handleMove = (moveEvent: PointerEvent) => {
      if (Math.abs(moveEvent.clientX - startX) >= 3) didDrag = true;
      pendingDelta = ((moveEvent.clientX - startX) / width) * duration;
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        flushPending();
      });
    };
    const handleEnd = () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
        frame = null;
      }
      flushPending();
      cleanup();
      onDragEnd();
      if (!additive && !didDrag) onOpenPopover(index);
    };
    const cleanup = () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
        frame = null;
      }
      if (marker.hasPointerCapture(event.pointerId)) marker.releasePointerCapture(event.pointerId);
      marker.removeEventListener('pointermove', handleMove);
      marker.removeEventListener('pointerup', handleEnd);
      marker.removeEventListener('pointercancel', handleEnd);
      if (dragCleanupRef.current === cleanup) dragCleanupRef.current = null;
    };
    marker.addEventListener('pointermove', handleMove);
    marker.addEventListener('pointerup', handleEnd);
    marker.addEventListener('pointercancel', handleEnd);
    dragCleanupRef.current = cleanup;
  };

  // False when the hovered spot sits between two keyframes too close together to fit a new one
  // with the mandatory GRID_SECONDS gap on both sides, OR sits right on/next to an existing
  // keyframe's own step - suppresses the "+ Add keyframe" label and the copy cursor there, while
  // the red hover line itself always still shows. `true` (the permissive default) whenever
  // nothing is currently being hovered, or snapping is disabled.
  const canInsertAtHover =
    hoverTime === null || !ENFORCE_GRID_SNAPPING
      ? true
      : hasInsertionRoom(
          hoverTime,
          keyframes.map((keyframe) => keyframe.time),
          duration,
        ) &&
        !collidesWithExisting(
          hoverTime,
          keyframes.map((keyframe) => keyframe.time),
        );

  const hoverRatio = hoverTime === null ? null : Math.min(1, Math.max(0, hoverTime / duration));
  // Hovering right on/next to an existing keyframe has nothing to offer (cannot insert there
  // anyway) - suppress the whole hover-insert affordance, line included, instead of only the label.
  const hoveringExistingKeyframe =
    hoverTime !== null &&
    ENFORCE_GRID_SNAPPING &&
    collidesWithExisting(
      hoverTime,
      keyframes.map((keyframe) => keyframe.time),
    );
  const showHoverMarker = hoverRatio !== null && !hoveringExistingKeyframe;
  // The "+ Add keyframe" label is centered on the hover position by default, but that can spill
  // past the track's own left/right edges (triggering the panel's scrollbar) when hovering near
  // either end. Instead of merely nudging it inward (which visibly detaches it from the line,
  // which must stay at the true hover X), flip it to hug whichever edge it is near: its own left
  // edge sits flush against the line near the left end, or its right edge against the line near
  // the right end, so it always stays physically attached to the line it belongs to.
  const hoverEdgeAlign: 'left' | 'right' | null = (() => {
    if (!showHoverMarker || hoverRatio === null) return null;
    const trackWidth = trackRef.current?.getBoundingClientRect().width ?? 0;
    if (trackWidth === 0) return null;
    const centerPx = hoverRatio * trackWidth;
    const halfLabelWidth = HOVER_LABEL_WIDTH_PX / 2;
    if (centerPx < halfLabelWidth) return 'left';
    if (centerPx > trackWidth - halfLabelWidth) return 'right';
    return null;
  })();

  const timelineLabels = computeTimelineLabels(duration, rulerWidth);
  const mainTickTimes = timelineLabels.map(({ time }) => time);
  const minorTickTimes = computeMinorTicks(mainTickTimes, duration, rulerWidth);

  return (
    // px-2 keeps the 0%/100% markers from sitting flush against the track's own edges - the
    // ruler/track/label rows below all measure their own width off this already-inset box, so
    // ratio math (timeFromClientX, drag width) stays correct without any separate offset.
    // `select-none` (inherited by every descendant) stops a click-drag on a marker/tick/label
    // from also text-selecting the surrounding ruler/timestamp text.
    <div className="flex select-none flex-col gap-1 px-2">
      <div ref={rulerRef} className="relative mb-1 h-3 text-[9px] tabular-nums">
        {timelineLabels.map(({ time, major }, index) => {
          const ratio = Math.min(1, Math.max(0, time / duration));
          return (
            <span
              key={index}
              style={
                ratio <= 0
                  ? { left: 0 }
                  : ratio >= 1
                    ? { right: 0 }
                    : { left: `${ratio * 100}%`, transform: 'translateX(-50%)' }
              }
              className={
                major ? 'text-foreground/80 absolute font-semibold' : 'text-muted-foreground/60 absolute font-normal'
              }
            >
              {formatSeconds(time)}
            </span>
          );
        })}
      </div>
      {/* Track bar and markers share one coordinate space (both anchored to top:0) so each
 marker's stem visually overlaps/protrudes from the track instead of sitting flush below it. */}
      <div className="relative" style={{ height: MARKER_HEIGHT }}>
        <div
          ref={trackRef}
          className={`absolute inset-x-0 top-0 h-3 border ${TIMELINE_THEME.trackBorder} ${TIMELINE_THEME.trackBg} ${
            canInsertAtHover ? 'cursor-copy' : 'cursor-default'
          }`}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerMove={(event) => setHoverTime(timeFromClientX(event.clientX))}
          onPointerLeave={() => setHoverTime(null)}
          onClick={(event) => {
            if (!canInsertAtHover) return;
            const time = timeFromClientX(event.clientX);
            if (time !== null) onAddKeyframeAt(time);
            setHoverTime(null);
          }}
        >
          {/* No overflow-hidden anywhere in this chain - main ticks are deliberately taller than
 the bar itself so they poke up past its top edge, toward the ruler labels above. */}
          <div className="pointer-events-none absolute inset-0">
            {minorTickTimes.map((time, index) => {
              const ratio = Math.min(1, Math.max(0, time / duration));
              return (
                <span
                  key={index}
                  className={`absolute bottom-0 w-px ${TIMELINE_THEME.minorTick}`}
                  style={{ left: `${ratio * 100}%`, height: MINOR_TICK_HEIGHT }}
                />
              );
            })}
            {mainTickTimes.map((time, index) => {
              const ratio = Math.min(1, Math.max(0, time / duration));
              return (
                <span
                  key={index}
                  className={`absolute bottom-0 w-px ${TIMELINE_THEME.mainTick}`}
                  style={{ left: `${ratio * 100}%`, height: MAIN_TICK_HEIGHT }}
                />
              );
            })}
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: MARKER_HEIGHT }}>
          {showHoverMarker && (
            <div
              className="pointer-events-none absolute top-0 flex h-full flex-col items-center"
              style={{ left: `${(hoverRatio! * 100).toFixed(3)}%` }}
            >
              {canInsertAtHover && (
                <span
                  className={`${TIMELINE_THEME.hoverInsertLabelBg} ${TIMELINE_THEME.hoverInsertLabelText} absolute -top-6 px-1 py-0.5 text-[9px] whitespace-nowrap ${
                    hoverEdgeAlign === 'left'
                      ? 'left-0 rounded-r'
                      : hoverEdgeAlign === 'right'
                        ? 'right-0 rounded-l'
                        : 'left-0 -translate-x-1/2 rounded'
                  }`}
                >
                  + Add keyframe
                </span>
              )}
              {/* `-top-6 bottom-0` (not `h-full`) so the line extends up to meet the label's own
 top offset instead of stopping at the container's top with a visible gap -
 `bottom-0` keeps its bottom end exactly where it always was. No left/right offset
 here (unlike the label above) - flex `items-center` on the wrapper keeps it
 exactly at the true hover X regardless of which way the label above it is aligned. */}
              <span className={`${TIMELINE_THEME.hoverInsertLine} absolute -top-6 bottom-0 w-px`} />
            </div>
          )}
          {keyframes.map((keyframe, index) => {
            const ratio = Math.min(1, Math.max(0, keyframe.time / duration));
            return (
              <Popover
                key={index}
                open={activePopoverKeyframeIndex === index}
                onOpenChange={(open) => onOpenPopover(open ? index : null)}
                modal={false}
              >
                <PopoverAnchor asChild>
                  <button
                    type="button"
                    data-keyframe-ui
                    data-popover-layer-trigger={activePopoverKeyframeIndex === index ? popoverLayerId : undefined}
                    aria-label={`Keyframe ${index + 1} at ${keyframe.time.toFixed(2)}s`}
                    onPointerDown={(event) => handlePointerDown(event, index)}
                    style={{ left: `${ratio * 100}%` }}
                    className="pointer-events-auto absolute top-0 -translate-x-1/2 cursor-grab active:cursor-grabbing"
                  >
                    <PinMarker selected={isSelected(index)} />
                  </button>
                </PopoverAnchor>
                {renderPopoverContent && (
                  <PopoverContent
                    side="top"
                    align="center"
                    sideOffset={8}
                    className="w-[18rem] overflow-y-hidden p-3"
                    onOpenAutoFocus={(event) => event.preventDefault()}
                    onClick={(event) => event.stopPropagation()}
                    data-popover-layer-content={popoverLayerId}
                    data-keyframe-ui
                  >
                    <div className="absolute -bottom-1 left-1/2 size-2 -translate-x-1/2 rotate-45 border-r border-b bg-popover" />
                    {renderPopoverContent(index)}
                  </PopoverContent>
                )}
              </Popover>
            );
          })}
        </div>
      </div>
      <div className="relative h-3">
        {keyframes.map((keyframe, index) => {
          const ratio = Math.min(1, Math.max(0, keyframe.time / duration));
          return (
            <span
              key={index}
              style={{ left: `${ratio * 100}%` }}
              className="text-muted-foreground absolute -translate-x-1/2 text-[9px] leading-none tabular-nums"
            >
              {formatSeconds(keyframe.time)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
