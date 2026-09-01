import { clampFixedCount, type StateWindowRange } from '@/schema';

import type {
  StateTimelineConfig,
  StateTimelineRanges,
  StateTimelineTemporalState,
  StateTimelineWidthBounds,
} from './state-timeline-config';
import { DEFAULT_STATE_TIMELINE_CONFIG } from './state-timeline-config';

export interface StateTimelineLayout {
  gap: number;
  widths: Record<StateTimelineTemporalState, number>;
}

function boundedWidth(value: number, bounds: StateTimelineWidthBounds): number {
  const minimum = Math.max(0, Math.min(bounds.min, bounds.max));
  const maximum = Math.max(minimum, bounds.max);
  return Math.min(maximum, Math.max(minimum, value));
}

function boundedEdgeWidth(value: number, config: StateTimelineConfig['width']): number {
  const minimum = Math.max(0, config.edge.min);
  const maximum = Math.max(minimum, config.edge.max);
  return Math.min(maximum, Math.max(minimum, value));
}

export function stateTimelineWidthForRange(
  range: StateWindowRange,
  config: StateTimelineConfig['width'] = DEFAULT_STATE_TIMELINE_CONFIG.width,
  bounds: StateTimelineWidthBounds = config.previous,
): number {
  if (range.mode !== 'fixedCount') return boundedWidth(config.all, bounds);
  const count = clampFixedCount(range.count);
  if (count === 0) return Math.max(0, config.overridenWidth);
  return boundedWidth(config.base + (count - 1) * config.perCount, bounds);
}

interface SideLayout {
  edge: number;
  window: number;
}

export function isOverridenSegment(
  state: StateTimelineTemporalState,
  ranges: StateTimelineRanges,
): boolean {
  if (ranges.current.mode === 'all') return state !== 'current';
  if (state === 'past') return ranges.previous.mode === 'all';
  if (state === 'previous') {
    return ranges.previous.mode === 'fixedCount' && clampFixedCount(ranges.previous.count) === 0;
  }
  if (state === 'next') {
    return ranges.next.mode === 'fixedCount' && clampFixedCount(ranges.next.count) === 0;
  }
  if (state === 'future') return ranges.next.mode === 'all';
  return false;
}

function expandSide(
  edge: number,
  window: number,
  capacity: number,
  edgeMaximum: number,
  windowMaximum: number,
  strategy: StateTimelineConfig['width']['fillStrategy'],
): SideLayout {
  let remaining = Math.max(0, capacity - edge - window);
  let result: SideLayout = { edge, window };
  let expandable: Array<keyof SideLayout> = ['edge', 'window'];

  while (remaining > 0.5 && expandable.length > 0) {
    const weightTotal = expandable.reduce(
      (sum, key) => sum + (strategy === 'proportional' ? Math.max(result[key], 1) : key === 'window' ? 2 : 1),
      0,
    );
    let added = 0;
    for (const key of expandable) {
      const weight = strategy === 'proportional' ? Math.max(result[key], 1) : key === 'window' ? 2 : 1;
      const share = remaining * (weight / weightTotal);
      const maximum = key === 'edge' ? edgeMaximum : windowMaximum;
      const amount = Math.min(Math.max(0, maximum - result[key]), share);
      result = { ...result, [key]: result[key] + amount };
      added += amount;
    }
    if (added <= 0) break;
    remaining -= added;
    expandable = expandable.filter((key) => {
      const maximum = key === 'edge' ? edgeMaximum : windowMaximum;
      return maximum - result[key] > 0.5;
    });
  }

  return result;
}

function sideLayoutForRange(
  range: StateWindowRange,
  capacity: number,
  config: StateTimelineConfig['width'],
  windowBounds: StateTimelineWidthBounds,
): SideLayout {
  const overrideWidth = Math.min(Math.max(0, config.overridenWidth), Math.max(0, capacity));
  const edgeMinimum = Math.min(config.edge.min, Math.max(0, capacity));
  const edgeMaximum = Math.max(edgeMinimum, Math.max(0, capacity));
  if (range.mode !== 'fixedCount') {
    return {
      edge: overrideWidth,
      window: Math.max(0, capacity - overrideWidth),
    };
  }
  if (range.count === 0) {
    return {
      edge: Math.max(0, capacity - overrideWidth),
      window: overrideWidth,
    };
  }

  const edge = boundedEdgeWidth(config.all, config);
  const window = stateTimelineWidthForRange(range, config, windowBounds);
  const windowMaximum = Math.max(0, Math.max(windowBounds.min, windowBounds.max));
  if (!config.fillAvailable) return { edge, window };

  const desiredTotal = edge + window;
  if (desiredTotal < capacity) {
    // The configured bounds establish a compact starting size. Once the
    // timeline has extra room, let both side segments grow into the full
    // available capacity instead of stopping at those compact maxima.
    return expandSide(edge, window, capacity, edgeMaximum, Math.max(windowMaximum, capacity), config.fillStrategy);
  }

  const windowCapacity = Math.max(0, capacity - edgeMinimum);
  const compressedWindow = Math.min(window, windowCapacity);
  return {
    edge: Math.max(0, capacity - compressedWindow),
    window: compressedWindow,
  };
}

function edgeWidthForRange(
  range: StateWindowRange,
  config: StateTimelineConfig['width'],
): number {
  return range.mode === 'all'
    ? Math.max(0, config.overridenWidth)
    : boundedEdgeWidth(config.all, config);
}

export function calculateStateTimelineLayout(
  ranges: StateTimelineRanges,
  config: StateTimelineConfig = DEFAULT_STATE_TIMELINE_CONFIG,
  availableWidth?: number,
): StateTimelineLayout {
  const inactiveRange: StateWindowRange = { mode: 'fixedCount', count: 0 };
  const previousRange = ranges.current.mode === 'all' ? inactiveRange : ranges.previous;
  const nextRange = ranges.current.mode === 'all' ? inactiveRange : ranges.next;
  const current = stateTimelineWidthForRange(ranges.current, config.width, config.width.current);
  const defaultGap = Math.min(config.gap, (availableWidth ?? 0) / Math.max(1, config.segments.length - 1));
  if (availableWidth === undefined || availableWidth <= 0) {
    return {
      gap: config.gap,
      widths: {
        past: edgeWidthForRange(previousRange, config.width),
        previous: stateTimelineWidthForRange(previousRange, config.width, config.width.previous),
        current,
        next: stateTimelineWidthForRange(nextRange, config.width, config.width.next),
        future: edgeWidthForRange(nextRange, config.width),
      },
    };
  }

  let gap = defaultGap;
  let currentWidth = current;
  if (availableWidth < currentWidth) {
    currentWidth = availableWidth;
    gap = 0;
  } else {
    const minimumGapWidth = currentWidth + gap * (config.segments.length - 1);
    if (minimumGapWidth > availableWidth) {
      gap = Math.max(
        0,
        (availableWidth - currentWidth) / Math.max(1, config.segments.length - 1),
      );
    }
  }

  if (!config.width.fillAvailable) {
    return {
      gap,
      widths: {
        past: edgeWidthForRange(previousRange, config.width),
        previous: stateTimelineWidthForRange(previousRange, config.width, config.width.previous),
        current: currentWidth,
        next: stateTimelineWidthForRange(nextRange, config.width, config.width.next),
        future: edgeWidthForRange(nextRange, config.width),
      },
    };
  }

  const sideCapacity = Math.max(
    0,
    (availableWidth - currentWidth - gap * (config.segments.length - 1)) / 2,
  );
  const left = sideLayoutForRange(previousRange, sideCapacity, config.width, config.width.previous);
  const right = sideLayoutForRange(nextRange, sideCapacity, config.width, config.width.next);

  return {
    gap,
    widths: {
      past: left.edge,
      previous: left.window,
      current: currentWidth,
      next: right.window,
      future: right.edge,
    },
  };
}
