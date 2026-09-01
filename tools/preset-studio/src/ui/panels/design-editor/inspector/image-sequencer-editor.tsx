import { closestCenter, DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, rectSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, ImageOff, Layers2, Pause, Play, Plus, Replace, Trash2 } from 'lucide-react';
import {
  type ReactNode,
  type Ref,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import type { CaptionDebugPropertyOverride } from '@captioncat/caption-engine/browser';
import { getComponentDescription, getFieldMeta } from '@/schema';
import type { FieldMeta } from '@/schema/field-metadata';
import type { EcsComponentDoc, LeafDefinition, PropertyValueType } from '@/schema';
import { DependentSetting } from '@/ui/controls/dependent-setting';
import { FieldRow } from '@/ui/controls/field-row';
import { InfoTooltip } from '@/ui/controls/info-tooltip';
import {
  INSPECTOR_CARD_CONTENT_STACK_CLASS,
  INSPECTOR_LABELED_SECTION_VERTICAL_PADDING_CLASS,
} from '@/ui/controls/inspector-layout';
import { NumberField } from '@/ui/controls/number-field';
import { PropertyLockIndicator, propertyLockFromMetadata } from '@/ui/controls/property-lock';
import { SelectField } from '@/ui/controls/select-field';
import { CollapsibleCard, headerIconForComponent } from '@/ui/panels/property-tree-view';
import { Button } from '@/ui/shadcn/button';
import { ButtonGroup } from '@/ui/shadcn/button-group';
import { Checkbox } from '@/ui/shadcn/checkbox';
import { Input } from '@/ui/shadcn/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/shadcn/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';
import {
  DEFAULT_BUNDLED_IMAGE_ASSET,
  isBuiltinImageAsset,
} from '@captioncat/caption-engine/browser';
import { AnimationTrackLabelExtra } from '../shared/animation-track-button';
import { PropertyAffordanceLabelExtra } from '../shared/property-affordance-label-extra';
import { StateApplySuggestionContext } from './state-apply-suggestion-context';

import { BuiltinAssetIcon } from './image-asset-library';
import { BundledAssetPicker } from './image-editor';
import {
  IMAGE_SEQUENCER_ADVANCE_OPTIONS,
  IMAGE_SEQUENCER_END_OPTIONS,
  IMAGE_SEQUENCER_TRIGGERS,
  normalizeImageSequencerAdvance,
  normalizeImageSequencerEndBehavior,
  normalizeImageSequencerTrigger,
  normalizeImageSequencerTriggerRule,
  type ImageSequencerAdvance,
  type ImageSequencerEndBehavior,
  type ImageSequencerTriggerRule,
  type ImageSequencerTrigger,
} from '@captioncat/caption-engine/browser';
import { ListEditor } from '@/ui/controls/list-editor';

const PLAYBACK_OPTIONS = ['continuous', 'onTrigger', 'perTrigger'] as const;
const TRIGGER_OPTIONS = IMAGE_SEQUENCER_TRIGGERS;
const TRIGGER_LABELS: Record<ImageSequencerTrigger, string> = {
  currentWordStart: 'Current Word Start',
  currentWordEnd: 'Current Word End',
  currentRowStart: 'Current Row Start',
  currentRowEnd: 'Current Row End',
  currentPageStart: 'Current Page Start',
  currentPageEnd: 'Current Page End',
};
const TRIGGER_DESCRIPTIONS: Record<ImageSequencerTrigger, string> = {
  currentWordStart: 'When the current word starts.',
  currentWordEnd: 'When the current word ends.',
  currentRowStart: 'When the current row starts.',
  currentRowEnd: 'When the current row ends.',
  currentPageStart: 'When the current page starts.',
  currentPageEnd: 'When the current page ends.',
};
const ADVANCE_OPTIONS = IMAGE_SEQUENCER_ADVANCE_OPTIONS;
const ADVANCE_LABELS: Record<ImageSequencerAdvance, string> = {
  next: 'Next',
  previous: 'Previous',
  random: 'Random',
  none: 'No Change',
};
const ADVANCE_DESCRIPTIONS: Record<ImageSequencerAdvance, string> = {
  next: 'Move forward through the frame list.',
  previous: 'Move backward through the frame list.',
  random: 'Choose a deterministic random frame for each trigger.',
  none: 'Keep the current frame when this trigger occurs.',
};
const END_OPTIONS = IMAGE_SEQUENCER_END_OPTIONS;
const END_LABELS: Record<ImageSequencerEndBehavior, string> = {
  hold: 'Hold',
  loop: 'Loop',
  pingPong: 'Ping Pong',
};
const END_DESCRIPTIONS: Record<ImageSequencerEndBehavior, string> = {
  hold: 'Keep the final frame.',
  loop: 'Return to the first frame and continue.',
  pingPong: 'Reverse direction at each end of the frame list.',
};
const PLAYBACK_DESCRIPTIONS: Partial<Record<(typeof PLAYBACK_OPTIONS)[number], ReactNode>> = {
  continuous: (
    <>
      <strong>Advance with the preview clock.</strong>
      <br />
      Use the timeline to control playback.
    </>
  ),
  onTrigger: (
    <>
      <strong>Advance when the trigger changes.</strong>
      <br />
      Continue from the current frame.
    </>
  ),
  perTrigger: (
    <>
      <strong>Advance one frame per trigger.</strong>
      <br />
      Each trigger advances the sequence once.
    </>
  ),
};

function isPlaybackMode(value: string): value is (typeof PLAYBACK_OPTIONS)[number] {
  return PLAYBACK_OPTIONS.includes(value as (typeof PLAYBACK_OPTIONS)[number]);
}

function imageSequencerTriggerRules(
  value: unknown,
  fallbackAdvance: ImageSequencerAdvance = 'next',
): ImageSequencerTriggerRule[] {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const seen = new Set<ImageSequencerTrigger>();
  return values
    .map((item) => normalizeImageSequencerTriggerRule(item, fallbackAdvance))
    .filter((rule): rule is ImageSequencerTriggerRule => {
      if (!rule || seen.has(rule.trigger)) return false;
      seen.add(rule.trigger);
      return true;
    });
}

function framesFromComponent(component: EcsComponentDoc): string[] {
  const node = component.props.frames;
  return node?.kind === 'leaf' && Array.isArray(node.value)
    ? node.value.filter((frame): frame is string => typeof frame === 'string')
    : [];
}

function setProperty(
  component: EcsComponentDoc,
  key: string,
  type: 'array' | 'boolean' | 'number' | 'string',
  value: unknown,
): EcsComponentDoc {
  const previous = component.props[key];
  return {
    ...component,
    props: {
      ...component.props,
      [key]: previous?.kind === 'leaf' ? { ...previous, type, value } : { kind: 'leaf', type, value },
    },
  };
}

function setPropertyConfig(
  component: EcsComponentDoc,
  key: string,
  type: PropertyValueType,
  fallbackValue: unknown,
  patch: Partial<Pick<LeafDefinition, 'randomizer' | 'transition'>>,
): EcsComponentDoc {
  const previous = component.props[key];
  return {
    ...component,
    props: {
      ...component.props,
      [key]:
        previous?.kind === 'leaf'
          ? { ...previous, ...patch }
          : { kind: 'leaf', type, value: fallbackValue, ...patch },
    },
  };
}

function FrameVisual({ asset }: { asset: string }): ReactNode {
  if (isBuiltinImageAsset(asset)) {
    return <BuiltinAssetIcon asset={asset} className="text-3xl leading-none" />;
  }
  return asset ? (
    <img src={asset} alt="" className="max-h-full max-w-full object-contain" />
  ) : (
    <span className="text-muted-foreground text-[10px]">Blank</span>
  );
}

interface FrameItem {
  asset: string;
  index: number;
  id: string;
}

function frameId(asset: string, occurrence: number): string {
  return `image-sequencer-frame-${occurrence}-${asset}`;
}

function frameItems(frames: readonly string[]): FrameItem[] {
  const occurrences = new Map<string, number>();
  return frames.map((asset, index) => {
    const occurrence = occurrences.get(asset) ?? 0;
    occurrences.set(asset, occurrence + 1);
    return { asset, index, id: frameId(asset, occurrence) };
  });
}

function FrameSourcePicker({
  value,
  onChange,
  replace = false,
  triggerClassName,
  triggerRef,
}: {
  value: string;
  onChange: (value: string) => void;
  replace?: boolean;
  triggerClassName?: string;
  triggerRef?: Ref<HTMLButtonElement>;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => (isBuiltinImageAsset(value) ? '' : value));
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(isBuiltinImageAsset(value) ? '' : value);
  }, [value]);

  const commitDraft = (): void => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onChange(trimmed);
    if (replace) setOpen(false);
  };

  const selectSource = (next: string): void => {
    onChange(next);
    if (replace) setOpen(false);
  };

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => toast.error(`Could not read ${file.name}.`);
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        toast.error(`Could not read ${file.name}.`);
        return;
      }
      onChange(reader.result);
      if (replace) setOpen(false);
    };
    reader.readAsDataURL(file);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              ref={triggerRef}
              variant="ghost"
              size="icon-xs"
              className={triggerClassName}
              aria-label={replace ? 'Replace frame' : 'Add frame'}
            >
              {replace ? <Replace className="size-3.5" /> : <Plus className="size-3.5" />}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">{replace ? 'Replace frame' : 'Add frame'}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-72 space-y-3 p-3 pb-1.5">
        <div className="space-y-1.5">
          <p className="text-muted-foreground text-[10px] font-semibold tracking-widest uppercase">Frame</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={() => selectSource('')}
          >
            <ImageOff className="size-3.5" />
            Blank frame
          </Button>
        </div>
        <div className="space-y-1.5">
          <p className="text-muted-foreground text-[10px] font-semibold tracking-widest uppercase">Bundled</p>
          <BundledAssetPicker
            value={isBuiltinImageAsset(value) ? value : DEFAULT_BUNDLED_IMAGE_ASSET}
            source={isBuiltinImageAsset(value) ? 'bundled' : 'custom'}
            customLabel={value ? 'Custom asset' : 'Blank frame'}
            onChange={selectSource}
          />
        </div>
        <div className="space-y-1.5">
          <p className="text-muted-foreground text-[10px] font-semibold tracking-widest uppercase">Custom</p>
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitDraft();
              }
            }}
            placeholder="Paste an image URL..."
            className="h-8 text-xs"
          />
          <div className="flex gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => fileInputRef.current?.click()}
            >
              Upload
            </Button>
            <Button type="button" size="sm" className="flex-1" disabled={!draft.trim()} onClick={commitDraft}>
              Use URL
            </Button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*,.svg" className="hidden" onChange={onFileChange} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

type ElementRef = { current: HTMLElement | null };

interface EmptyFrameGuideGeometry {
  width: number;
  height: number;
  start: { x: number; y: number };
  end: { x: number; y: number };
}

function EmptyFrameGuide({
  containerRef,
  sourceRef,
  targetRef,
}: {
  containerRef: ElementRef;
  sourceRef: ElementRef;
  targetRef: ElementRef;
}): ReactNode {
  const markerId = `image-sequencer-frame-guide-${useId().replace(/:/g, '')}`;
  const [geometry, setGeometry] = useState<EmptyFrameGuideGeometry | null>(null);
  const measure = useCallback(() => {
    const container = containerRef.current;
    const source = sourceRef.current;
    const target = targetRef.current;
    if (!container || !source || !target) {
      setGeometry(null);
      return;
    }

    const containerBox = container.getBoundingClientRect();
    const sourceBox = source.getBoundingClientRect();
    const targetBox = target.getBoundingClientRect();
    const gap = 8;
    const start = {
      x: sourceBox.right - containerBox.left + gap,
      y: sourceBox.top - containerBox.top + sourceBox.height / 2,
    };
    const end = {
      x: targetBox.left - containerBox.left - gap,
      y: targetBox.top - containerBox.top + targetBox.height / 2,
    };
    const span = end.x - start.x;
    if (containerBox.width <= 0 || containerBox.height <= 0 || span < 72) {
      setGeometry(null);
      return;
    }

    setGeometry({
      width: containerBox.width,
      height: containerBox.height,
      start,
      end,
    });
  }, [containerRef, sourceRef, targetRef]);

  useLayoutEffect(() => {
    measure();
    const observed = [containerRef.current, sourceRef.current, targetRef.current].filter(
      (element): element is HTMLElement => element !== null,
    );
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    observed.forEach((element) => observer?.observe(element));
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [containerRef, measure, sourceRef, targetRef]);

  if (!geometry) return null;
  const { end, height, start, width } = geometry;
  const span = end.x - start.x;
  const verticalRise = Math.max(0, start.y - end.y);
  const path = `M ${start.x} ${start.y} C ${start.x + span * 0.35} ${start.y}, ${
    end.x - span * 0.2
  } ${end.y + Math.min(24, verticalRise * 0.25)}, ${end.x} ${end.y}`;

  return (
    <svg
      aria-hidden="true"
      className="text-muted-foreground pointer-events-none absolute inset-0 z-30 h-full w-full"
      viewBox={`0 0 ${width} ${height}`}
    >
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="10"
          markerHeight="10"
          markerUnits="userSpaceOnUse"
          orient="auto"
        >
          <path
            d="M 1 1 L 9 5 L 1 9"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.75"
          />
        </marker>
      </defs>
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeDasharray="6 8"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
        markerEnd={`url(#${markerId})`}
      />
    </svg>
  );
}

function SortableFrame({
  asset,
  index,
  id,
  selected,
  onSelect,
  onReplace,
  onDuplicate,
  onRemove,
}: {
  asset: string;
  index: number;
  id: string;
  selected: boolean;
  onSelect: () => void;
  onReplace: (asset: string) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}): ReactNode {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('flex w-16 shrink-0 flex-col gap-1', isDragging && 'z-10 opacity-70')}
    >
      <ButtonGroup aria-label={`Frame ${index + 1} controls`} className="self-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              aria-label={`Duplicate frame ${index + 1}`}
              variant="ghost"
              size="icon-xs"
              className="bg-muted text-muted-foreground hover:bg-muted/80"
              onClick={onDuplicate}
            >
              <Layers2 className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Duplicate frame</TooltipContent>
        </Tooltip>
        <FrameSourcePicker
          value={asset}
          onChange={onReplace}
          replace
          triggerClassName="bg-muted text-muted-foreground hover:bg-muted/80"
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              aria-label={`Remove frame ${index + 1}`}
              variant="ghost"
              size="icon-xs"
              className="bg-muted text-muted-foreground hover:bg-muted/80 hover:text-destructive"
              onClick={onRemove}
            >
              <Trash2 className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Delete frame</TooltipContent>
        </Tooltip>
      </ButtonGroup>
      <div className="relative h-16 w-16">
        <button
          type="button"
          aria-label={`Select frame ${index + 1}`}
          aria-pressed={selected}
          onClick={onSelect}
          className={cn(
            'bg-muted relative flex h-full w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-md border text-xs transition-colors',
            selected ? 'border-primary ring-1 ring-primary/40' : 'border-border hover:border-foreground/40',
          )}
        >
          <FrameVisual asset={asset} />
          <span className="bg-background/80 absolute right-0.5 bottom-0.5 rounded px-1 text-[9px] font-medium">
            {index + 1}
          </span>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Drag frame ${index + 1} to reorder`}
          className="bg-background/80 text-muted-foreground hover:bg-background absolute top-0.5 right-0.5 z-10 size-5 cursor-grab active:cursor-grabbing"
          {...attributes}
          {...listeners}
          onClick={(event) => event.stopPropagation()}
        >
          <GripVertical className="size-3" />
        </Button>
      </div>
    </div>
  );
}

function SequencePreview({
  frames,
  frameRate,
  loop,
  enabled,
}: {
  frames: string[];
  frameRate: number;
  loop: boolean;
  enabled: boolean;
}): ReactNode {
  const [playing, setPlaying] = useState(true);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex((current) => Math.min(current, Math.max(0, frames.length - 1)));
  }, [frames.length]);

  useEffect(() => {
    if (!enabled || !playing || frames.length <= 1) return;
    const interval = window.setInterval(
      () => {
        setIndex((current) => {
          const next = current + 1;
          if (next < frames.length) return next;
          return loop ? 0 : current;
        });
      },
      1000 / Math.max(1, Math.min(60, frameRate)),
    );
    return () => window.clearInterval(interval);
  }, [enabled, frameRate, frames.length, loop, playing]);

  const togglePlaying = (): void => setPlaying((current) => !current);

  return (
    <div className="relative flex h-28 w-full items-center justify-center overflow-hidden rounded-md border bg-[var(--canvas-grid-fill)]">
      <button
        type="button"
        className="absolute inset-0 flex cursor-pointer items-center justify-center"
        aria-label={playing ? 'Pause image sequencer preview' : 'Play image sequencer preview'}
        aria-pressed={playing}
        onClick={togglePlaying}
      >
        {frames.length > 0 ? (
          <FrameVisual asset={frames[index] ?? frames[0]} />
        ) : (
          <span className="text-muted-foreground text-xs">Add frames to preview</span>
        )}
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="absolute bottom-1 left-1 z-10 bg-background/80 hover:bg-background"
        aria-label={playing ? 'Pause image sequencer preview' : 'Play image sequencer preview'}
        aria-pressed={playing}
        onClick={(event) => {
          event.stopPropagation();
          togglePlaying();
        }}
      >
        {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
      </Button>
    </div>
  );
}

export function ImageSequencerEditor({
  component,
  onUpdate,
  stateKey,
  headerExtra,
  resolvedPropertyOverrides,
  allowDisable = true,
}: {
  component: EcsComponentDoc;
  onUpdate: (updater: (previous: EcsComponentDoc) => EcsComponentDoc) => void;
  onDelete?: () => void;
  stateKey: string;
  headerExtra?: ReactNode;
  resolvedPropertyOverrides?: Readonly<Record<string, CaptionDebugPropertyOverride>>;
  allowDisable?: boolean;
}): ReactNode {
  const stateApplySuggestion = useContext(StateApplySuggestionContext);
  const metadataFor = (key: string) => resolvedPropertyOverrides?.[`imageSequencer.${key}`];
  const lockFor = (key: string) => propertyLockFromMetadata(metadataFor(key));
  const resolvedString = (key: string, fallback: string): string => {
    const value = metadataFor(key)?.value;
    return typeof value === 'string' ? value : fallback;
  };
  const resolvedNumber = (key: string, fallback: number): number => {
    const value = metadataFor(key)?.value;
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  };
  const resolvedBoolean = (key: string, fallback: boolean): boolean => {
    const value = metadataFor(key)?.value;
    return typeof value === 'boolean' ? value : fallback;
  };
  const resolvedFrames = metadataFor('frames')?.value;
  const frames =
    Array.isArray(resolvedFrames) && resolvedFrames.every((frame): frame is string => typeof frame === 'string')
      ? resolvedFrames
      : framesFromComponent(component);
  const [selectedFrame, setSelectedFrame] = useState(0);
  const framesGuideRef = useRef<HTMLDivElement>(null);
  const emptyFrameLabelRef = useRef<HTMLSpanElement>(null);
  const addFrameButtonRef = useRef<HTMLButtonElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const playbackMode =
    resolvedString(
      'playbackMode',
      component.props.playbackMode?.kind === 'leaf' ? String(component.props.playbackMode.value) : 'continuous',
    );
  const playbackModeKey = isPlaybackMode(playbackMode) ? playbackMode : 'continuous';
  const authoredFrameRate = component.props.frameRate?.kind === 'leaf' ? Number(component.props.frameRate.value) : 12;
  const frameRate = Number.isFinite(authoredFrameRate) && authoredFrameRate > 0 ? Math.min(60, authoredFrameRate) : 12;
  const displayFrameRate = Math.min(60, Math.max(1, resolvedNumber('frameRate', frameRate)));
  const loop = resolvedBoolean('loop', component.props.loop?.kind !== 'leaf' || component.props.loop.value !== false);
  const playbackModeLock = lockFor('playbackMode');
  const framesLock = lockFor('frames');
  const authoredEnabled =
    component.props.enabled?.kind === 'leaf' && component.props.enabled.type === 'boolean'
      ? component.props.enabled.value !== false
      : true;
  const enabledMetadata = metadataFor('enabled');
  const enabled = typeof enabledMetadata?.value === 'boolean' ? enabledMetadata.value : authoredEnabled;
  const enabledLock = lockFor('enabled');
  const resolvedTriggerValue = metadataFor('trigger')?.value;
  const triggerValue =
    resolvedTriggerValue ??
    (component.props.trigger?.kind === 'leaf' ? component.props.trigger.value : undefined);
  const legacyAdvance = normalizeImageSequencerAdvance(
    resolvedString(
      'advance',
      String(component.props.advance?.kind === 'leaf' ? component.props.advance.value : 'next'),
    ),
  ) ?? 'next';
  const triggerRules = imageSequencerTriggerRules(triggerValue, legacyAdvance);
  const triggerNode: LeafDefinition =
    component.props.trigger?.kind === 'leaf' && component.props.trigger.type === 'array'
      ? component.props.trigger
      : { kind: 'leaf', type: 'array', value: triggerRules };
  const endBehavior =
    normalizeImageSequencerEndBehavior(
      resolvedString(
        'endBehavior',
        component.props.endBehavior?.kind === 'leaf' ? String(component.props.endBehavior.value) : 'hold',
      ),
    ) ?? 'hold';

  const setRandomizer = (
    key: string,
    type: PropertyValueType,
    fallbackValue: unknown,
    randomizer: LeafDefinition['randomizer'],
  ): void => {
    onUpdate((previous) => setPropertyConfig(previous, key, type, fallbackValue, { randomizer }));
  };
  const setTransition = (
    key: string,
    type: PropertyValueType,
    fallbackValue: unknown,
    transition: LeafDefinition['transition'],
  ): void => {
    const shared = transition?.scope !== 'state';
    const stateApplied =
      shared && stateApplySuggestion?.applyTransitionToStates({ scopeKey: stateKey, propertyPath: [key] }, transition);
    if (stateApplied) return;
    onUpdate((previous) => setPropertyConfig(previous, key, type, fallbackValue, { transition }));
  };
  const withFieldAffordances = (
    key: string,
    label: string,
    type: PropertyValueType,
    currentValue: unknown,
    children: ReactNode,
    meta?: FieldMeta,
  ): ReactNode => {
    const leaf = component.props[key];
    const fieldMeta = { ...getFieldMeta(key), ...meta };
    return (
      <PropertyAffordanceLabelExtra
        fieldKey={key}
        randomizer={{
          label,
          leafType: type,
          currentValue,
          randomizer: leaf?.kind === 'leaf' ? leaf.randomizer : undefined,
          onChange: (next) => setRandomizer(key, type, currentValue, next),
          meta: fieldMeta,
        }}
        transition={{
          label,
          currentValue,
          transition: leaf?.kind === 'leaf' ? leaf.transition : undefined,
          onChange: (next) => setTransition(key, type, currentValue, next),
        }}
      >
        {children}
      </PropertyAffordanceLabelExtra>
    );
  };

  const updateFrames = (next: string[]) => onUpdate((previous) => setProperty(previous, 'frames', 'array', next));
  const onDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return;
    const items = frameItems(frames);
    const activeIndex = items.findIndex((item) => item.id === String(event.active.id));
    const overIndex = items.findIndex((item) => item.id === String(event.over?.id));
    if (activeIndex < 0 || overIndex < 0) return;
    const selectedId = items[selectedFrame]?.id;
    const next = arrayMove(frames, activeIndex, overIndex);
    updateFrames(next);
    const nextItems = frameItems(next);
    const nextSelectedIndex = selectedId ? nextItems.findIndex((item) => item.id === selectedId) : -1;
    setSelectedFrame(nextSelectedIndex >= 0 ? nextSelectedIndex : 0);
  };

  return (
    <CollapsibleCard
      title="Image Sequencer"
      titleHelp={getComponentDescription('imageSequencer')}
      titleIcon={headerIconForComponent('imageSequencer')}
      stateKey={stateKey}
      compactHeader
      headerExtra={headerExtra}
      enabled={allowDisable ? enabled : undefined}
      onEnabledChange={
        allowDisable ? (value) => onUpdate((previous) => setProperty(previous, 'enabled', 'boolean', value)) : undefined
      }
      enabledLock={allowDisable ? enabledLock : null}
    >
      <div className={INSPECTOR_CARD_CONTENT_STACK_CLASS}>
        <SequencePreview frames={frames} frameRate={displayFrameRate} loop={loop} enabled={enabled} />
        <div ref={framesGuideRef} className="relative">
          <div className={INSPECTOR_CARD_CONTENT_STACK_CLASS}>
            <div
              className={cn(
                'relative z-40 flex items-center justify-between',
                INSPECTOR_LABELED_SECTION_VERTICAL_PADDING_CLASS,
                framesLock?.locked && 'pointer-events-none opacity-60',
              )}
            >
              <div className="flex items-center gap-1">
                <p className="text-muted-foreground text-[10px] font-semibold tracking-widest uppercase">Frames</p>
                <InfoTooltip ariaLabel="Explain image sequence frames" side="top">
                  <strong>Frames play in list order.</strong>
                  <br />
                  Drag to reorder. Use frame actions to replace, duplicate, or remove a frame.
                </InfoTooltip>
              </div>
              <div className="flex items-center gap-1">
                <FrameSourcePicker
                  value={DEFAULT_BUNDLED_IMAGE_ASSET}
                  triggerRef={addFrameButtonRef}
                  onChange={(asset) => {
                    updateFrames([...frames, asset]);
                    setSelectedFrame(frames.length);
                  }}
                />
                <PropertyLockIndicator lock={framesLock} className="size-3" />
              </div>
            </div>
            <div className={cn(framesLock?.locked && 'pointer-events-none opacity-60')}>
            {frames.length === 0 ? (
              <div className="text-muted-foreground relative z-20 flex h-16 w-full items-center justify-center rounded-lg border bg-background text-sm font-medium shadow-xs dark:border-input dark:bg-input/30">
                <span ref={emptyFrameLabelRef} className="relative z-40">
                  Add first frame
                </span>
              </div>
            ) : (
              <DndContext autoScroll={false} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={frameItems(frames).map((item) => item.id)} strategy={rectSortingStrategy}>
                  <div className="flex flex-wrap gap-2">
                    {frameItems(frames).map(({ asset, index, id }) => (
                      <SortableFrame
                        key={id}
                        asset={asset}
                        index={index}
                        id={id}
                        selected={selectedFrame === index}
                        onSelect={() => setSelectedFrame(index)}
                        onReplace={(next) => {
                          const updated = [...frames];
                          updated[index] = next;
                          updateFrames(updated);
                        }}
                        onDuplicate={() => {
                          const updated = [...frames];
                          updated.splice(index + 1, 0, asset);
                          updateFrames(updated);
                          setSelectedFrame(index + 1);
                        }}
                        onRemove={() => {
                          const updated = frames.filter((_, frameIndex) => frameIndex !== index);
                          updateFrames(updated);
                          setSelectedFrame(Math.min(index, Math.max(0, updated.length - 1)));
                        }}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
            </div>
          </div>
          {frames.length === 0 && (
            <EmptyFrameGuide containerRef={framesGuideRef} sourceRef={emptyFrameLabelRef} targetRef={addFrameButtonRef} />
          )}
        </div>

        <div aria-hidden="true" className="bg-border/60 h-px w-full" />
        <div className={INSPECTOR_CARD_CONTENT_STACK_CLASS}>
          <div className={cn('flex items-center gap-1', INSPECTOR_LABELED_SECTION_VERTICAL_PADDING_CLASS)}>
            <p className="text-muted-foreground text-[10px] font-semibold tracking-widest uppercase">Playback</p>
            <InfoTooltip ariaLabel="Explain image sequence playback" side="top">
              <strong>Choose when the sequence advances.</strong>
              <br />
              Set trigger actions and behavior at the end of the frame list.
            </InfoTooltip>
          </div>
          <div className={INSPECTOR_CARD_CONTENT_STACK_CLASS}>
            {withFieldAffordances(
              'playbackMode',
              'Mode',
              'string',
              playbackMode,
              <SelectField
                label="Mode"
                value={playbackMode}
                options={[...PLAYBACK_OPTIONS]}
                optionDescriptions={PLAYBACK_DESCRIPTIONS}
                description={PLAYBACK_DESCRIPTIONS[playbackModeKey]}
                onChange={(value) => onUpdate((previous) => setProperty(previous, 'playbackMode', 'string', value))}
                lock={playbackModeLock}
              />,
              { options: PLAYBACK_OPTIONS },
            )}
            {playbackMode !== 'continuous' && (
              <DependentSetting>
                {withFieldAffordances(
                  'trigger',
                  'Triggers',
                  'array',
                  triggerRules,
                  <ListEditor
                    node={triggerNode}
                    label="Trigger"
                    onChange={(updater) =>
                      onUpdate((previous) => {
                        const currentNode: LeafDefinition =
                          previous.props.trigger?.kind === 'leaf'
                            ? previous.props.trigger
                            : { kind: 'leaf', type: 'array' as const, value: triggerRules };
                        const updatedNode = updater(currentNode);
                        return updatedNode.kind === 'leaf'
                          ? setProperty(previous, 'trigger', 'array', updatedNode.value)
                          : previous;
                      })
                    }
                    renderItem={(rawItem, index, onItemChange) => {
                      const rule = normalizeImageSequencerTriggerRule(rawItem, legacyAdvance) ?? {
                        trigger: TRIGGER_OPTIONS[0],
                        advance: legacyAdvance,
                      };
                      return (
                        <div className="flex flex-col gap-2">
                          <SelectField
                            label={`Trigger ${index + 1}`}
                            value={rule.trigger}
                            options={TRIGGER_OPTIONS}
                            optionLabels={TRIGGER_LABELS}
                            optionDescriptions={TRIGGER_DESCRIPTIONS}
                            description="Select the caption event that runs this rule."
                            onChange={(value) =>
                              onItemChange({
                                ...rule,
                                trigger: normalizeImageSequencerTrigger(value) ?? rule.trigger,
                              })
                            }
                            lock={lockFor('trigger')}
                          />
                          <SelectField
                            label="Advance"
                            value={rule.advance}
                            options={[...ADVANCE_OPTIONS]}
                            optionLabels={ADVANCE_LABELS}
                            optionDescriptions={ADVANCE_DESCRIPTIONS}
                            description="Select what this trigger does to the current frame."
                            onChange={(value) =>
                              onItemChange({
                                ...rule,
                                advance: normalizeImageSequencerAdvance(value) ?? rule.advance,
                              })
                            }
                            lock={lockFor('trigger')}
                          />
                        </div>
                      );
                    }}
                  />,
                  { options: TRIGGER_OPTIONS },
                )}
                {withFieldAffordances(
                  'endBehavior',
                  'End',
                  'string',
                  endBehavior,
                  <SelectField
                    label="End"
                    value={endBehavior}
                    options={[...END_OPTIONS]}
                    optionLabels={END_LABELS}
                    optionDescriptions={END_DESCRIPTIONS}
                    description="Choose what happens when the sequence reaches its end."
                    onChange={(value) => onUpdate((previous) => setProperty(previous, 'endBehavior', 'string', value))}
                    lock={lockFor('endBehavior')}
                  />,
                  { options: END_OPTIONS },
                )}
              </DependentSetting>
            )}
          </div>
        </div>
        {playbackMode !== 'onTrigger' && (
          <DependentSetting>
            <div className="grid grid-cols-2 items-start gap-3">
              {withFieldAffordances(
                'frameRate',
                'Frame Rate',
                'number',
                displayFrameRate,
                <AnimationTrackLabelExtra scopeKey={stateKey} propertyPath={['frameRate']}>
                  <NumberField
                    label="Frame Rate"
                    value={displayFrameRate}
                    meta={{ min: 1, max: 60, step: 1, unit: 'fps' }}
                    compact
                    description="Set the number of frames shown per second."
                    onChange={(value) => onUpdate((previous) => setProperty(previous, 'frameRate', 'number', value))}
                    lock={lockFor('frameRate')}
                  />
                </AnimationTrackLabelExtra>,
                { min: 1, max: 60, step: 1, unit: 'fps' },
              )}
              {withFieldAffordances(
                'loop',
                'Loop',
                'boolean',
                loop,
                <FieldRow
                  label="Loop"
                  description="Loop the sequence after the final frame instead of holding it."
                  inline
                  lock={lockFor('loop')}
                >
                  <span className="flex h-8 items-center">
                    <Checkbox
                      checked={loop}
                      onCheckedChange={(value) =>
                        onUpdate((previous) => setProperty(previous, 'loop', 'boolean', Boolean(value)))
                      }
                      aria-label="Loop image sequencer"
                      disabled={lockFor('loop')?.locked === true}
                    />
                  </span>
                </FieldRow>,
              )}
            </div>
          </DependentSetting>
        )}
      </div>
    </CollapsibleCard>
  );
}
