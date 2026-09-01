import type { StateWindowRange } from '@/schema';

export type StateTimelineTemporalState = 'past' | 'previous' | 'current' | 'next' | 'future';
export type StateTimelineState = StateTimelineTemporalState | 'default';

export interface StateTimelineRanges {
  previous: StateWindowRange;
  current: StateWindowRange;
  next: StateWindowRange;
}

export interface StateTimelineSegmentConfig {
  state: StateTimelineTemporalState;
  label: string;
}

export interface StateTimelineWidthBounds {
  min: number;
  max: number;
}

export interface StateTimelineColorConfig {
  fill: string;
  border: string;
  text: string;
  hoverFill: string;
  hoverBorder: string;
  hoverBorderWidth: number;
  hoverOutlineColor: string;
  hoverOutlineWidth: number;
  hoverText: string;
  selectedFill: string;
  selectedBorder: string;
  selectedBorderWidth: number;
  selectedOutlineColor: string;
  selectedOutlineWidth: number;
  selectedText: string;
  selectedShadow: string;
}

export interface StateTimelineConfig {
  gap: number;
  defaultSpacing: number;
  defaultPosition: 'above' | 'inside' | 'below';
  segmentHeight: number;
  borderRadius: number;
  borderWidth: number;
  cornerStyle: 'rounded' | 'square';
  labelPosition: 'inside' | 'above';
  labelClassName: string;
  labelSelectedClassName: string;
  transition: string;
  width: {
    base: number;
    perCount: number;
    all: number;
    overridenWidth: number;
    overridenOpacity: number;
    edge: StateTimelineWidthBounds;
    current: StateTimelineWidthBounds;
    previous: StateTimelineWidthBounds;
    next: StateTimelineWidthBounds;
    fillAvailable: boolean;
    fillStrategy: 'proportional' | 'nonCurrent';
  };
  colors: Record<StateTimelineState, StateTimelineColorConfig>;
  segments: readonly StateTimelineSegmentConfig[];
  fallbackLabel: string;
}

export const DEFAULT_STATE_TIMELINE_CONFIG: StateTimelineConfig = {
  gap: 2,
  defaultSpacing: 2,
  defaultPosition: 'below',
  segmentHeight: 16,
  borderRadius: 3,
  borderWidth: 1,
  cornerStyle: 'rounded',
  labelPosition: 'inside',
  labelClassName: 'text-[9px] font-medium tracking-[0.08em] text-foreground uppercase',
  labelSelectedClassName: 'font-bold',
  transition: '', //'background-color 120ms ease, border-color 120ms ease, color 120ms ease, box-shadow 120ms ease',
  width: {
    base: 64,
    perCount: 14,
    all: 64,
    overridenWidth: 8,
    overridenOpacity: 0.66,
    edge: { min: 8, max: 64 },
    current: { min: 64, max: 80 },
    previous: { min: 64, max: 80 },
    next: { min: 64, max: 80 },
    fillAvailable: true,
    fillStrategy: 'nonCurrent',
  },
  colors: {
    default: {
      fill: 'var(--muted)',
      border: 'var(--border)',
      text: 'white',
      hoverFill: 'oklch(0.9 0.1 250)',
      hoverBorder: 'oklch(0.7 0.14 250)',
      hoverBorderWidth: 0,
      hoverOutlineColor: 'oklch(0.7 0.14 250)',
      hoverOutlineWidth: 0,
      hoverText: 'black',
      selectedFill: 'oklch(0.86 0.12 250)',
      selectedBorder: 'oklch(0.64 0.16 250)',
      selectedBorderWidth: 0,
      selectedOutlineColor: 'oklch(0.64 0.16 250)',
      selectedOutlineWidth: 0,
      selectedText: 'black',
      selectedShadow: '0 0 0 1px oklch(0.64 0.16 250)',
    },
    past: {
      fill: 'var(--muted)',
      border: 'var(--border)',
      text: 'var(--muted-foreground)',
      hoverFill: 'oklch(0.88 0.1 285)',
      hoverBorder: 'oklch(0.68 0.14 285)',
      hoverBorderWidth: 0,
      hoverOutlineColor: 'oklch(0.68 0.14 285)',
      hoverOutlineWidth: 0,
      hoverText: 'black',
      selectedFill: 'oklch(0.84 0.12 285)',
      selectedBorder: 'oklch(0.62 0.16 285 / 0)',
      selectedBorderWidth: 0,
      selectedOutlineColor: 'oklch(0.62 0.16 285)',
      selectedOutlineWidth: 0,
      selectedText: 'black',
      selectedShadow: '0 0 0 1px oklch(0.62 0.16 285)',
    },
    previous: {
      fill: 'var(--muted)',
      border: 'var(--border)',
      text: 'var(--muted-foreground)',
      hoverFill: 'oklch(0.88 0.1 220)',
      hoverBorder: 'oklch(0.68 0.14 220)',
      hoverBorderWidth: 0,
      hoverOutlineColor: 'oklch(0.68 0.14 220)',
      hoverOutlineWidth: 0,
      hoverText: 'black',
      selectedFill: 'oklch(0.84 0.12 220)',
      selectedBorder: 'oklch(0.62 0.16 220 / 0)',
      selectedBorderWidth: 0,
      selectedOutlineColor: 'oklch(0.62 0.16 220)',
      selectedOutlineWidth: 0,
      selectedText: 'black',
      selectedShadow: '0 0 0 1px oklch(0.62 0.16 220)',
    },
    current: {
      fill: 'var(--muted)',
      border: 'var(--border)',
      text: 'var(--muted-foreground)',
      hoverFill: 'oklch(0.9 0.1 150)',
      hoverBorder: 'oklch(0.7 0.14 150)',
      hoverBorderWidth: 0,
      hoverOutlineColor: 'oklch(0.7 0.14 150)',
      hoverOutlineWidth: 0,
      hoverText: 'black',
      selectedFill: 'oklch(0.86 0.12 150)',
      selectedBorder: 'oklch(0.64 0.16 150)',
      selectedBorderWidth: 0,
      selectedOutlineColor: 'oklch(0.64 0.16 150)',
      selectedOutlineWidth: 0,
      selectedText: 'black',
      selectedShadow: '0 0 0 1px oklch(0.64 0.16 150)',
    },
    next: {
      fill: 'var(--muted)',
      border: 'var(--border)',
      text: 'var(--muted-foreground)',
      hoverFill: 'oklch(0.92 0.1 85)',
      hoverBorder: 'oklch(0.72 0.14 85)',
      hoverBorderWidth: 0,
      hoverOutlineColor: 'oklch(0.72 0.14 85)',
      hoverOutlineWidth: 0,
      hoverText: 'black',
      selectedFill: 'oklch(0.88 0.12 85)',
      selectedBorder: 'oklch(0.66 0.16 85)',
      selectedBorderWidth: 0,
      selectedOutlineColor: 'oklch(0.66 0.16 85)',
      selectedOutlineWidth: 0,
      selectedText: 'black',
      selectedShadow: '0 0 0 1px oklch(0.66 0.16 85)',
    },
    future: {
      fill: 'var(--muted)', //'color-mix(in oklch, var(--muted) 86%, oklch(0.84 0.12 335))',
      border: 'var(--border)',
      text: 'var(--muted-foreground)',
      hoverFill: 'oklch(0.9 0.1 335)',
      hoverBorder: 'oklch(0.7 0.14 335)',
      hoverBorderWidth: 0,
      hoverOutlineColor: 'oklch(0.7 0.14 335)',
      hoverOutlineWidth: 0,
      hoverText: 'black',
      selectedFill: 'oklch(0.86 0.12 335)',
      selectedBorder: 'oklch(0.64 0.16 335)',
      selectedBorderWidth: 0,
      selectedOutlineColor: 'oklch(0.64 0.16 335)',
      selectedOutlineWidth: 0,
      selectedText: 'black',
      selectedShadow: '0 0 0 1px oklch(0.64 0.16 335)',
    },
  },
  segments: [
    { state: 'past', label: 'Past' },
    { state: 'previous', label: 'Previous' },
    { state: 'current', label: 'Current' },
    { state: 'next', label: 'Next' },
    { state: 'future', label: 'Future' },
  ],
  fallbackLabel: 'Default',
};
