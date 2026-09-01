import { cn } from '@/lib/utils';
import type { GradientStop, LinearGradientPaint, Paint, PaintCapability, RadialGradientPaint } from '@/schema/paint';
import { paintSummary } from '@/schema/paint';
import { Button } from '@/ui/shadcn/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/shadcn/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/shadcn/select';
import { closestCenter, DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { parseColor } from '@captioncat/caption-engine/browser';
import { ColorInput, ColorPickerPanel } from './color-picker';
import { ColorSwatchButton } from './color-swatch';
import { DeferredNumberInput } from './deferred-number-input';
import { FieldRow } from './field-row';
import { PaintClipboardActions } from './paint-clipboard-actions';
import { PropertyLockIndicator, type PropertyLockState } from './property-lock';
import { SliderField } from './slider-field';
import { usePopoverOutsideDismissal } from './use-popover-outside-dismissal';

const DEFAULT_STOPS: GradientStop[] = [
  { offset: 0, color: '#ffffff' },
  { offset: 1, color: '#000000' },
];

export interface PaintInputProps {
  value: Paint;
  onChange: (next: Paint) => void;
  capabilities?: readonly PaintCapability[];
  id?: string;
  className?: string;
  variant?: 'default' | 'fill';
  compact?: boolean;
  fullWidth?: boolean;
  ariaLabel?: string;
  disabled?: boolean;
  lock?: PropertyLockState | null;
}

export interface PaintFieldProps {
  label: string;
  value: Paint;
  onChange: (next: Paint) => void;
  capabilities?: readonly PaintCapability[];
  description?: string;
  compact?: boolean;
  id?: string;
  variant?: 'default' | 'fill';
  childrenAfter?: ReactNode;
  disabled?: boolean;
  lock?: PropertyLockState | null;
}

function cssColor(color: string): string {
  return String(parseColor({ color }));
}

export function paintToCss(paint: Paint): string {
  if (paint.type === 'solid') return cssColor(paint.color);
  const stops = paint.stops.map((stop) => `${cssColor(stop.color)} ${Math.round(stop.offset * 100)}%`).join(', ');
  if (paint.type === 'linear-gradient') return `linear-gradient(${paint.angle}deg, ${stops})`;
  return `radial-gradient(circle at ${paint.centerX * 100}% ${paint.centerY * 100}%, ${stops})`;
}

function gradientLabel(type: Paint['type']): string {
  if (type === 'linear-gradient') return 'Linear Gradient';
  if (type === 'radial-gradient') return 'Radial Gradient';
  return 'Solid';
}

function cloneStops(stops: readonly GradientStop[]): GradientStop[] {
  return stops.map((stop) => ({ ...stop }));
}

function defaultGradient(type: 'linear-gradient' | 'radial-gradient'): Paint {
  if (type === 'linear-gradient') return { type, angle: 90, stops: cloneStops(DEFAULT_STOPS) };
  return { type, centerX: 0.5, centerY: 0.5, radius: 0.75, stops: cloneStops(DEFAULT_STOPS) };
}

function normalizedType(value: Paint, capabilities: readonly PaintCapability[]): PaintCapability {
  if (capabilities.includes(value.type)) return value.type;
  return capabilities[0] ?? 'solid';
}

function paintForCapabilities(value: Paint, capabilities: readonly PaintCapability[]): Paint {
  const type = normalizedType(value, capabilities);
  if (type === value.type) return value;
  if (type === 'solid') {
    const firstStop = value.type === 'solid' ? value : value.stops[0];
    return {
      type: 'solid',
      color: firstStop?.color ?? '#000000',
    };
  }
  return defaultGradient(type);
}

function SortableStopRow({
  id,
  stop,
  index,
  selected,
  onSelect,
  onColorChange,
}: {
  id: string;
  stop: GradientStop;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onColorChange: (color: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'flex items-center gap-1 rounded-md px-1.5 py-1',
        selected ? 'bg-accent' : 'hover:bg-accent/60',
        isDragging && 'relative z-10 opacity-70',
      )}
    >
      <button
        type="button"
        aria-label={`Drag stop ${index + 1} to reorder`}
        className="text-muted-foreground hover:text-foreground -m-1 flex size-6 shrink-0 cursor-grab items-center justify-center rounded active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <ColorInput
          value={stop.color}
          onChange={(color) => {
            onSelect();
            onColorChange(color);
          }}
          compact
          ariaLabel={`Stop ${index + 1} color`}
        />
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={onSelect}>
          <span className="min-w-0 flex-1 text-xs">Stop {index + 1}</span>
          <span className="text-muted-foreground text-[10px] tabular-nums">{Math.round(stop.offset * 100)}%</span>
        </button>
      </div>
    </div>
  );
}

function StopStrip({
  paint,
  selectedIndex,
  onSelect,
  onChange,
  onAdd,
}: {
  paint: LinearGradientPaint | RadialGradientPaint;
  selectedIndex: number;
  onSelect: (index: number) => void;
  onChange: (next: GradientStop[], sort: boolean) => void;
  onAdd: (offset: number) => void;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    index: number;
    pointerId: number;
    bounds: { left: number; width: number };
  } | null>(null);
  const draftStopsRef = useRef(cloneStops(paint.stops));
  const renderFrameRef = useRef<number | null>(null);
  const clickTimerRef = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  const [draftStops, setDraftStops] = useState<GradientStop[] | null>(null);
  onChangeRef.current = onChange;

  useEffect(() => {
    const scheduleDraftRender = () => {
      if (renderFrameRef.current !== null) return;
      renderFrameRef.current = window.requestAnimationFrame(() => {
        renderFrameRef.current = null;
        if (dragRef.current) setDraftStops(cloneStops(draftStopsRef.current));
      });
    };
    const updateDraftFromClientX = (clientX: number, renderImmediately = false) => {
      const drag = dragRef.current;
      if (!drag) return;
      const offset = Math.max(0, Math.min(1, (clientX - drag.bounds.left) / Math.max(1, drag.bounds.width)));
      const stops = cloneStops(draftStopsRef.current);
      stops[drag.index] = { ...stops[drag.index], offset };
      draftStopsRef.current = stops;
      if (renderImmediately) {
        if (renderFrameRef.current !== null) {
          window.cancelAnimationFrame(renderFrameRef.current);
          renderFrameRef.current = null;
        }
        setDraftStops(stops);
      } else {
        scheduleDraftRender();
      }
    };
    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      updateDraftFromClientX(event.clientX);
    };
    const handlePointerUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      updateDraftFromClientX(event.clientX, true);
      dragRef.current = null;
      const stops = cloneStops(draftStopsRef.current);
      setDraftStops(null);
      onChangeRef.current(stops, true);
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      if (renderFrameRef.current !== null) window.cancelAnimationFrame(renderFrameRef.current);
      if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, []);

  useEffect(() => {
    if (dragRef.current) return;
    draftStopsRef.current = cloneStops(paint.stops);
    setDraftStops(null);
  }, [paint]);

  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>, index: number) => {
    if (event.button !== 0) return;
    event.preventDefault();
    onSelect(index);
    const strip = stripRef.current;
    if (!strip) return;
    const bounds = strip.getBoundingClientRect();
    draftStopsRef.current = cloneStops(paint.stops);
    setDraftStops(cloneStops(paint.stops));
    dragRef.current = { index, pointerId: event.pointerId, bounds: { left: bounds.left, width: bounds.width } };
  };

  const displayStops = draftStops ?? paint.stops;
  const displayPaint = { ...paint, stops: displayStops };
  const offsetAtClientX = (clientX: number): number => {
    const bounds = stripRef.current?.getBoundingClientRect();
    if (!bounds) return 0;
    return Math.max(0, Math.min(1, (clientX - bounds.left) / Math.max(1, bounds.width)));
  };
  const moveSelectedStop = (clientX: number): void => {
    if (!paint.stops[selectedIndex]) return;
    const stops = cloneStops(paint.stops);
    stops[selectedIndex] = {
      ...stops[selectedIndex],
      offset: offsetAtClientX(clientX),
    };
    onChange(stops, true);
  };
  const handleStripClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget) return;
    if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current);
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null;
      moveSelectedStop(event.clientX);
    }, 200);
  };
  const handleStripDoubleClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget) return;
    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    onAdd(offsetAtClientX(event.clientX));
  };

  return (
    <div
      ref={stripRef}
      className="relative h-10 overflow-visible rounded-md border"
      data-gradient-stop-strip="true"
      onClick={handleStripClick}
      onDoubleClick={handleStripDoubleClick}
    >
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-md"
        style={{ background: paintToCss(displayPaint) }}
      >
        <div className="absolute inset-0 bg-black/10" />
      </div>
      {displayStops.map((stop, index) => (
        <button
          key={`${stop.offset}-${index}`}
          type="button"
          aria-label={`Select stop ${index + 1}`}
          aria-pressed={selectedIndex === index}
          className={cn(
            'absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 shadow-sm',
            selectedIndex === index ? 'border-white ring-1 ring-primary' : 'border-white/80',
          )}
          style={{ left: `${stop.offset * 100}%`, background: cssColor(stop.color) }}
          onPointerDown={(event) => beginDrag(event, index)}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(index);
          }}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <span className="sr-only">{`Stop ${index + 1}`}</span>
        </button>
      ))}
    </div>
  );
}

function GradientEditor({
  paint,
  onChange,
}: {
  paint: LinearGradientPaint | RadialGradientPaint;
  onChange: (next: Paint) => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const stopEntriesRef = useRef<{ id: string; stop: GradientStop }[]>([]);
  const nextStopIdRef = useRef(0);
  const stopEntries = paint.stops.map((stop, index) => {
    const existingEntry = stopEntriesRef.current[index];
    if (existingEntry) return { ...existingEntry, stop };
    const entry = {
      id: `gradient-stop-${nextStopIdRef.current}`,
      stop,
    };
    nextStopIdRef.current += 1;
    return entry;
  });
  stopEntriesRef.current = stopEntries;
  const selectedStop = stopEntries[Math.min(selectedIndex, stopEntries.length - 1)]?.stop ?? stopEntries[0]?.stop;
  const stopIds = stopEntries.map((entry) => entry.id);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    setSelectedIndex((current) => Math.min(current, Math.max(0, paint.stops.length - 1)));
  }, [paint.stops.length]);

  const updateStops = (stops: GradientStop[], sort: boolean) => {
    const nextEntries = stops.map((stop, index) => ({
      id: stopEntries[index]?.id ?? `gradient-stop-${nextStopIdRef.current++}`,
      stop,
    }));
    const orderedEntries = sort ? [...nextEntries].sort((a, b) => a.stop.offset - b.stop.offset) : nextEntries;
    const selectedId = stopEntries[selectedIndex]?.id;
    const nextIndex = selectedId ? orderedEntries.findIndex((entry) => entry.id === selectedId) : selectedIndex;
    stopEntriesRef.current = orderedEntries;
    onChange({ ...paint, stops: orderedEntries.map((entry) => entry.stop) });
    if (nextIndex >= 0) setSelectedIndex(Math.min(nextIndex, orderedEntries.length - 1));
  };

  const updateSelectedStop = (patch: Partial<GradientStop>) => {
    updateStop(selectedIndex, patch);
  };

  const updateStop = (index: number, patch: Partial<GradientStop>) => {
    const nextEntries = stopEntries.map((entry, entryIndex) =>
      entryIndex === index ? { ...entry, stop: { ...entry.stop, ...patch } } : entry,
    );
    stopEntriesRef.current = nextEntries;
    onChange({ ...paint, stops: nextEntries.map((entry) => entry.stop) });
  };

  const addStopAt = (offset: number) => {
    const current = selectedStop ?? DEFAULT_STOPS[0];
    const nextStop: GradientStop = {
      offset: Math.max(0, Math.min(1, offset)),
      color: current.color,
    };
    const nextEntry = {
      id: `gradient-stop-${nextStopIdRef.current}`,
      stop: nextStop,
    };
    nextStopIdRef.current += 1;
    const nextEntries = [...stopEntries, nextEntry].sort((a, b) => a.stop.offset - b.stop.offset);
    stopEntriesRef.current = nextEntries;
    onChange({ ...paint, stops: nextEntries.map((entry) => entry.stop) });
    setSelectedIndex(nextEntries.indexOf(nextEntry));
  };

  const addStop = () => {
    addStopAt(Math.max(0, Math.min(1, (selectedStop?.offset ?? DEFAULT_STOPS[0].offset) + 0.15)));
  };

  const deleteStop = () => {
    if (stopEntries.length <= 2) return;
    const nextEntries = stopEntries.filter((_, index) => index !== selectedIndex);
    stopEntriesRef.current = nextEntries;
    onChange({ ...paint, stops: nextEntries.map((entry) => entry.stop) });
    setSelectedIndex(Math.min(selectedIndex, nextEntries.length - 1));
  };

  const onStopDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return;
    const activeIndex = stopIds.indexOf(String(event.active.id));
    const overIndex = stopIds.indexOf(String(event.over.id));
    if (activeIndex < 0 || overIndex < 0) return;
    const selectedId = stopEntries[selectedIndex]?.id;
    const orderedOffsets = stopEntries.map((entry) => entry.stop.offset).sort((a, b) => a - b);
    const movedEntries = arrayMove([...stopEntries], activeIndex, overIndex);
    const reorderedEntries = movedEntries.map((entry, index) => ({
      ...entry,
      stop: { ...entry.stop, offset: orderedOffsets[index] },
    }));
    const nextSelectedIndex = selectedId
      ? reorderedEntries.findIndex((entry) => entry.id === selectedId)
      : selectedIndex;
    stopEntriesRef.current = reorderedEntries;
    onChange({ ...paint, stops: reorderedEntries.map((entry) => entry.stop) });
    setSelectedIndex(Math.max(0, nextSelectedIndex));
  };

  return (
    <div className="flex flex-col gap-3">
      <StopStrip
        paint={paint}
        selectedIndex={selectedIndex}
        onSelect={setSelectedIndex}
        onChange={updateStops}
        onAdd={addStopAt}
      />
      <div className="border-border/60 flex items-center justify-between gap-2 border-b pb-1">
        <h3 className="text-muted-foreground text-[10px] font-semibold tracking-widest uppercase">Stops</h3>
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="sm" className="h-7" onClick={addStop}>
            <Plus className="size-3.5" />
            Add stop
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Delete selected stop"
            title="Delete selected stop"
            disabled={paint.stops.length <= 2}
            onClick={deleteStop}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <DndContext autoScroll={false} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onStopDragEnd}>
          <SortableContext items={stopIds} strategy={verticalListSortingStrategy}>
            {stopEntries.map(({ id, stop }, index) => (
              <SortableStopRow
                key={id}
                id={id}
                stop={stop}
                index={index}
                selected={selectedIndex === index}
                onSelect={() => setSelectedIndex(index)}
                onColorChange={(color) => updateStop(index, { color })}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
      {selectedStop && (
        <div className="flex flex-col gap-2 border-t pt-2">
          <div>
            <label className="text-muted-foreground flex flex-col gap-1 text-xs font-medium">
              Position
              <DeferredNumberInput
                className="h-8"
                min={0}
                max={100}
                step={1}
                value={Math.round(selectedStop.offset * 100)}
                onCommit={(position) => updateSelectedStop({ offset: Math.max(0, Math.min(1, position / 100)) })}
              />
            </label>
          </div>
        </div>
      )}
      {paint.type === 'linear-gradient' ? (
        <SliderField
          label="Angle"
          value={paint.angle}
          min={-360}
          max={360}
          step={1}
          formatValue={(angle) => `${Math.round(angle)} deg`}
          onChange={(angle) => onChange({ ...paint, angle })}
        />
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <label className="text-muted-foreground flex flex-col gap-1 text-xs font-medium">
            Center X
            <DeferredNumberInput
              className="h-8 w-full"
              min={0}
              max={1}
              step={0.01}
              value={paint.centerX}
              onCommit={(centerX) => onChange({ ...paint, centerX })}
            />
          </label>
          <label className="text-muted-foreground flex flex-col gap-1 text-xs font-medium">
            Center Y
            <DeferredNumberInput
              className="h-8 w-full"
              min={0}
              max={1}
              step={0.01}
              value={paint.centerY}
              onCommit={(centerY) => onChange({ ...paint, centerY })}
            />
          </label>
          <label className="text-muted-foreground flex flex-col gap-1 text-xs font-medium">
            Radius
            <DeferredNumberInput
              className="h-8 w-full"
              min={0}
              max={2}
              step={0.01}
              value={paint.radius}
              onCommit={(radius) => onChange({ ...paint, radius })}
            />
          </label>
        </div>
      )}
    </div>
  );
}

function PaintEditorPanel({
  value,
  capabilities,
  onChange,
}: {
  value: Paint;
  capabilities: readonly PaintCapability[];
  onChange: (next: Paint) => void;
}) {
  const paint = paintForCapabilities(value, capabilities);
  const availableTypes: readonly PaintCapability[] = capabilities.length > 0 ? capabilities : ['solid'];
  const onlySolid = availableTypes.length === 1 && availableTypes[0] === 'solid';

  const changeType = (type: string) => {
    if (type === 'solid') {
      const color = paint.type === 'solid' ? paint.color : (paint.stops[0]?.color ?? '#000000');
      onChange({ type: 'solid', color });
      return;
    }
    onChange(defaultGradient(type as 'linear-gradient' | 'radial-gradient'));
  };

  return (
    <div className="flex flex-col gap-3">
      {availableTypes.length > 1 && (
        <FieldRow label="Mode" className="py-0">
          <Select value={paint.type} onValueChange={changeType}>
            <SelectTrigger className="h-8 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {gradientLabel(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>
      )}
      {paint.type === 'solid' ? (
        <>
          {onlySolid ? (
            <ColorPickerPanel
              label="Solid color"
              value={paint.color}
              onChange={(color) => onChange({ ...paint, color })}
            />
          ) : (
            <ColorInput
              value={paint.color}
              onChange={(color) => onChange({ ...paint, color })}
              ariaLabel="Solid color"
            />
          )}
        </>
      ) : (
        <GradientEditor paint={paint} onChange={onChange} />
      )}
    </div>
  );
}

export function PaintInput({
  value,
  onChange,
  capabilities = ['solid', 'linear-gradient', 'radial-gradient'],
  id,
  className,
  variant = 'default',
  compact = false,
  fullWidth = false,
  ariaLabel = 'Paint picker',
  disabled = false,
  lock = null,
}: PaintInputProps) {
  const locked = lock?.locked === true;
  const paint = paintForCapabilities(value, capabilities);
  const displayLabel = paint.type === 'solid' ? 'Solid Color' : gradientLabel(paint.type);
  const summary = paint.type === 'solid' ? paintSummary(paint) : `${paint.stops.length} stops`;
  const size = compact
    ? fullWidth
      ? 'h-8 w-full rounded-md border'
      : 'size-6 rounded-md border'
    : variant === 'fill'
      ? 'size-10 rounded-md border'
      : 'size-10 rounded-md border';
  const { layerId, open, setOpen } = usePopoverOutsideDismissal();

  return (
    <div className={cn('flex items-start gap-1.5', compact && !fullWidth && 'w-fit', fullWidth && 'w-full', className)}>
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild>
          <ColorSwatchButton
            id={id}
            layerId={layerId}
            sizeClassName={size}
            ariaLabel={ariaLabel}
            disabled={disabled || locked}
          >
            <span
              className="pointer-events-none absolute inset-0 rounded-sm border bg-white bg-[length:10px_10px] bg-[position:0_0,0_5px,5px_-5px,-5px_0] bg-[image:linear-gradient(45deg,_#d1d5db_25%,_transparent_25%),linear-gradient(-45deg,_#d1d5db_25%,_transparent_25%),linear-gradient(45deg,_transparent_75%,_#d1d5db_75%),linear-gradient(-45deg,_transparent_75%,_#d1d5db_75%)]"
              aria-hidden="true"
            />
            <span
              className="pointer-events-none absolute inset-0"
              style={{ background: paintToCss(paint) }}
              aria-hidden="true"
            />
          </ColorSwatchButton>
        </PopoverTrigger>
        <PopoverContent
          data-popover-layer-content={layerId}
          dismissOnOutside={false}
          collisionPadding={12}
          sticky="always"
          side="right"
          align="start"
          className="max-h-[var(--radix-popover-content-available-height)] w-96 max-w-[calc(100vw-1.5rem)] overflow-x-hidden overflow-y-auto p-2"
        >
          <PaintEditorPanel value={paint} capabilities={capabilities} onChange={onChange} />
        </PopoverContent>
      </Popover>
      {!compact && (
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-2">
            <div className="text-muted-foreground min-w-0 flex-1 truncate px-1 text-[10px] font-medium">
              {displayLabel}
            </div>
            <PaintClipboardActions
              value={paint}
              capabilities={capabilities}
              onPaste={onChange}
              itemLabel="paint"
              compact
              disabled={disabled || locked}
            />
          </div>
          <div className="truncate px-1 text-xs">{summary}</div>
        </div>
      )}
    </div>
  );
}

export function PaintField({
  label,
  value,
  onChange,
  capabilities = ['solid', 'linear-gradient', 'radial-gradient'],
  description,
  compact,
  id,
  variant = 'default',
  childrenAfter,
  disabled = false,
  lock = null,
}: PaintFieldProps) {
  return (
    <FieldRow label={label} description={description} htmlFor={id} compact={compact} lock={null}>
      <div className="flex items-center gap-1.5">
        <PaintInput
          id={id}
          value={value}
          onChange={onChange}
          capabilities={capabilities}
          variant={variant}
          compact={compact}
          ariaLabel={`${label} paint picker`}
          disabled={disabled || lock?.locked === true}
          lock={lock}
        />
        <PropertyLockIndicator lock={lock} className="size-3" />
        {childrenAfter && <div className="flex shrink-0 items-center gap-1">{childrenAfter}</div>}
      </div>
    </FieldRow>
  );
}
