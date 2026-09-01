import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { UnsavedChangesDot } from '@/ui/components/unsaved-changes-dot';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';

import {
  DEFAULT_STATE_TIMELINE_CONFIG,
  type StateTimelineColorConfig,
  type StateTimelineConfig,
  type StateTimelineRanges,
  type StateTimelineState,
} from './state-timeline-config';
import { calculateStateTimelineLayout, isOverridenSegment } from './state-timeline-layout';

function segmentRadius(config: StateTimelineConfig): number {
  return config.cornerStyle === 'square' ? 0 : config.borderRadius;
}

function labelStyle(): CSSProperties {
  return {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };
}

function buttonStyle(
  config: StateTimelineConfig,
  colors: StateTimelineColorConfig,
  width: number | string,
  hovered: boolean,
  selected: boolean,
  opacity?: number,
): CSSProperties {
  const fill = selected ? colors.selectedFill : hovered ? colors.hoverFill : colors.fill;
  const border = selected ? colors.selectedBorder : hovered ? colors.hoverBorder : colors.border;
  const borderWidth = selected ? colors.selectedBorderWidth : hovered ? colors.hoverBorderWidth : config.borderWidth;
  const outlineColor = selected ? colors.selectedOutlineColor : colors.hoverOutlineColor;
  const outlineWidth = selected ? colors.selectedOutlineWidth : hovered ? colors.hoverOutlineWidth : 0;
  const text = selected ? colors.selectedText : hovered ? colors.hoverText : colors.text;
  const selectedEmphasisEnabled = colors.selectedBorderWidth > 0 || colors.selectedOutlineWidth > 0;
  return {
    width,
    height: config.segmentHeight,
    minWidth: 0,
    borderWidth,
    borderStyle: 'solid',
    borderColor: border,
    borderRadius: segmentRadius(config),
    backgroundColor: fill,
    color: text,
    boxShadow: selected && selectedEmphasisEnabled ? colors.selectedShadow : 'none',
    outline: outlineWidth > 0 ? `${outlineWidth}px solid ${outlineColor}` : 'none',
    outlineOffset: 0,
    ...(opacity === undefined ? {} : { opacity }),
    cursor: 'pointer',
    transition: config.transition,
  };
}

function TimelineButton({
  state,
  label,
  width,
  colors,
  config,
  hoveredState,
  selectedState,
  dirty,
  overriden = false,
  labelPosition = config.labelPosition,
  onHoverChange,
  onSelect,
}: {
  state: StateTimelineState;
  label: string;
  width: number | string;
  colors: StateTimelineColorConfig;
  config: StateTimelineConfig;
  hoveredState: StateTimelineState | null;
  selectedState: StateTimelineState;
  dirty?: boolean;
  overriden?: boolean;
  labelPosition?: 'inside' | 'above';
  onHoverChange: (state: StateTimelineState | null) => void;
  onSelect: (state: StateTimelineState) => void;
}): ReactNode {
  const segmentRef = useRef<HTMLDivElement>(null);
  const selected = selectedState === state;
  const hovered = hoveredState === state;
  const selectedEmphasisDisabled = selected && colors.selectedBorderWidth === 0 && colors.selectedOutlineWidth === 0;
  const above = labelPosition === 'above';
  const labelClassName = cn(config.labelClassName, selected && config.labelSelectedClassName);
  const labelTextColor = selected ? colors.selectedText : hovered ? colors.hoverText : undefined;
  const text = (
    <span
      className={cn('state-timeline-label flex min-w-0 items-center justify-center gap-1', !above && labelClassName)}
      style={{
        ...labelStyle(),
        ...(labelTextColor ? { color: labelTextColor } : {}),
      }}
    >
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>
      {dirty && <UnsavedChangesDot size="sm" />}
    </span>
  );
  const button = (
    <button
      type="button"
      aria-label={`Select ${label} state`}
      aria-pressed={selected}
      data-state-timeline-segment={state}
      className={cn(
        'flex items-center justify-center outline-none transition-transform active:scale-[0.99]',
        selectedEmphasisDisabled ? 'focus-visible:outline-none' : 'focus-visible:ring-2 focus-visible:ring-ring/60',
      )}
      style={buttonStyle(
        config,
        colors,
        '100%',
        hovered,
        selected,
        overriden ? config.width.overridenOpacity : undefined,
      )}
      onClick={() => onSelect(state)}
      onFocus={(event) => {
        if (event.currentTarget.matches(':focus-visible')) onHoverChange(state);
      }}
      onBlur={(event) => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !segmentRef.current?.contains(nextTarget)) {
          onHoverChange(null);
        }
      }}
    >
      {!above && text}
    </button>
  );
  const segment = (
    <div
      ref={segmentRef}
      className="state-timeline-segment min-w-0"
      style={{ width, cursor: 'pointer' }}
      onMouseEnter={() => onHoverChange(state)}
      onMouseLeave={() => onHoverChange(null)}
    >
      {above && (
        <button
          type="button"
          aria-label={`Select ${label} state`}
          aria-pressed={selected}
          data-state-timeline-label={state}
          className={cn(
            'w-full cursor-pointer bg-transparent p-0 text-center outline-none transition-[color,transform] active:scale-[0.99]',
            labelClassName,
            selectedEmphasisDisabled ? 'focus-visible:outline-none' : 'focus-visible:ring-2 focus-visible:ring-ring/60',
          )}
          style={{
            ...labelStyle(),
            backgroundColor: 'transparent',
            border: 'none',
            boxShadow: 'none',
            ...(labelTextColor ? { color: labelTextColor } : {}),
          }}
          onClick={() => onSelect(state)}
          onFocus={(event) => {
            if (event.currentTarget.matches(':focus-visible')) onHoverChange(state);
          }}
          onBlur={(event) => {
            const nextTarget = event.relatedTarget;
            if (!(nextTarget instanceof Node) || !segmentRef.current?.contains(nextTarget)) {
              onHoverChange(null);
            }
          }}
        >
          {text}
        </button>
      )}
      {button}
    </div>
  );
  return overriden ? (
    <Tooltip open={hovered}>
      <TooltipTrigger asChild>{segment}</TooltipTrigger>
      <TooltipContent side="top" className="pointer-events-none text-xs">
        {label}: Currently Inactive
      </TooltipContent>
    </Tooltip>
  ) : (
    segment
  );
}

export function StateTimeline({
  ranges,
  selectedState,
  onSelectState,
  ariaLabel = 'Word states',
  dirtyStates,
  config = DEFAULT_STATE_TIMELINE_CONFIG,
}: {
  ranges: StateTimelineRanges;
  selectedState: StateTimelineState;
  onSelectState: (state: StateTimelineState) => void;
  ariaLabel?: string;
  dirtyStates?: Partial<Record<StateTimelineState, boolean>>;
  config?: StateTimelineConfig;
}): ReactNode {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState<number>();
  const [hoveredState, setHoveredState] = useState<StateTimelineState | null>(null);

  useLayoutEffect(() => {
    const node = timelineRef.current;
    if (!node) return;

    const updateWidth = () => setAvailableWidth(node.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const layoutWidth =
    availableWidth === undefined
      ? undefined
      : config.defaultPosition === 'inside'
        ? Math.max(0, availableWidth - config.defaultSpacing * 2)
        : availableWidth;
  const layout = useMemo(
    () => calculateStateTimelineLayout(ranges, config, layoutWidth),
    [config, layoutWidth, ranges],
  );

  const temporalSegments = (
    <div className="flex min-w-0 items-start" style={{ gap: layout.gap }}>
      {config.segments.map((segment) => (
        <TimelineButton
          key={segment.state}
          state={segment.state}
          label={segment.label}
          width={layout.widths[segment.state]}
          colors={config.colors[segment.state]}
          config={config}
          overriden={isOverridenSegment(segment.state, ranges)}
          hoveredState={hoveredState}
          selectedState={selectedState}
          dirty={dirtyStates?.[segment.state]}
          onHoverChange={setHoveredState}
          onSelect={onSelectState}
        />
      ))}
    </div>
  );

  const defaultButton = (
    <TimelineButton
      state="default"
      label={config.fallbackLabel}
      width="100%"
      colors={config.colors.default}
      config={config}
      labelPosition="inside"
      hoveredState={hoveredState}
      selectedState={selectedState}
      dirty={dirtyStates?.default}
      onHoverChange={setHoveredState}
      onSelect={onSelectState}
    />
  );

  const defaultFrameStyle = {
    ...buttonStyle(
      config,
      config.colors.default,
      '100%',
      hoveredState === 'default',
      selectedState === 'default',
    ),
    height: 'auto',
    padding: config.defaultSpacing,
    cursor: 'default',
  };

  return (
    <div ref={timelineRef} className="w-full min-w-0" data-state-timeline="true" aria-label={ariaLabel}>
      {config.defaultPosition === 'above' && (
        <div style={{ marginBottom: config.defaultSpacing }}>{defaultButton}</div>
      )}
      {config.defaultPosition === 'inside' ? (
        <div style={defaultFrameStyle}>
          {defaultButton}
          <div style={{ marginTop: config.defaultSpacing }}>{temporalSegments}</div>
        </div>
      ) : (
        temporalSegments
      )}
      {config.defaultPosition === 'below' && (
        <div style={{ marginTop: config.defaultSpacing }}>{defaultButton}</div>
      )}
    </div>
  );
}
