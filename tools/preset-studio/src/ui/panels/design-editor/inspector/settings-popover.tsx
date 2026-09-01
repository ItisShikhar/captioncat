import { ArrowRight, RotateCcw, Settings2, X } from 'lucide-react';
import { Fragment, useState, type ReactNode } from 'react';

import type { PresetEditorState } from '@/schema';
import { getFieldMeta } from '@/schema';
import { BreakPriorityEditor } from '@/ui/controls/break-priority-editor';
import { BooleanField } from '@/ui/controls/boolean-field';
import { DependentSetting } from '@/ui/controls/dependent-setting';
import { FieldRow } from '@/ui/controls/field-row';
import { InfoTooltip } from '@/ui/controls/info-tooltip';
import { NumberField } from '@/ui/controls/number-field';
import type { PropertyLockState } from '@/ui/controls/property-lock';
import { PunctuationTokenEditor, SmartBreakInfo } from '@/ui/controls/punctuation-token-editor';
import { useMediaQuery } from '@/ui/hooks/use-media-query';
import { Button } from '@/ui/shadcn/button';
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/ui/shadcn/drawer';
import { Input } from '@/ui/shadcn/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/shadcn/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';
import type {
  CaptionBreakTimingPreset,
  CaptionWordWrappingMode,
  FlowCollapseMode,
  FlowParticipationMode,
  FlowParticipationRowState,
  FlowParticipationWordState,
  HorizontalFitMode,
  LongWordThresholdMode,
  RowsPerPageMode,
  SmartBreakMode,
  SourceLineBreakMode,
  TextDirection,
  WordsPerRowMode,
} from '@captioncat/caption-engine/browser';
import {
  CAPTION_BREAK_RULE_DEFINITIONS,
  CAPTION_BREAK_TIMING_PRESETS,
  DEFAULT_CAPTION_HOLD_THRESHOLD_SECONDS,
  captionBreakTimingPresetFor,
  createDefaultCaptionLayoutPolicy,
  getSmartBreakRules,
} from '@captioncat/caption-engine/browser';

type PageHeightInfo = {
  mode: string;
  isDefinite: boolean;
};

function pageHeightInfo(document: PresetEditorState): PageHeightInfo {
  const findPage = (entity: PresetEditorState['design']): PresetEditorState['design'] | undefined => {
    if (entity.entity === 'page') return entity;
    for (const child of entity.children) {
      const page = findPage(child);
      if (page) return page;
    }
    return undefined;
  };
  const page = findPage(document.design);
  const transform = page?.components.find((component) => component.component === 'transform');
  const modeNode = transform?.props?.heightMode;
  const mode = modeNode?.kind === 'leaf' ? String(modeNode.value) : 'automatic';
  if (mode === 'fitParent') return { mode, isDefinite: true };
  if (mode !== 'custom') return { mode, isDefinite: false };
  const dimensions = transform?.props?.dimensions;
  if (dimensions?.kind !== 'leaf' || typeof dimensions.value !== 'object' || dimensions.value === null) {
    return { mode, isDefinite: false };
  }
  const height = (dimensions.value as { y?: unknown }).y;
  return { mode, isDefinite: typeof height === 'number' && height > 0 };
}

function pageHeightLabel(mode: string): string {
  if (mode === 'fitChildren') return 'Fit Children';
  if (mode === 'fitContent') return 'Fit Content';
  if (mode === 'fitParent') return 'Fit Parent';
  if (mode === 'custom') return 'Custom';
  return 'Automatic';
}

function countValue(value: number, maximum: number): number {
  return Math.max(1, Math.min(maximum, Math.round(Number.isFinite(value) ? value : 1)));
}

function SelectField({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string;
  description?: ReactNode;
  value: string;
  options: readonly SettingOption[];
  onChange: (value: string) => void;
}): ReactNode {
  return (
    <FieldRow label={label} description={description}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger size="sm" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {options.map((option) => (
            <SettingSelectItem key={option.value} option={option} />
          ))}
        </SelectContent>
      </Select>
    </FieldRow>
  );
}

type SettingOption<Value extends string = string> = {
  value: Value;
  label: string;
  description: ReactNode;
};

function SettingSelectItem({ option }: { option: SettingOption }): ReactNode {
  return (
    <SelectItem value={option.value}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="block w-full">{option.label}</span>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-64 text-xs whitespace-pre-line">
          {option.description}
        </TooltipContent>
      </Tooltip>
    </SelectItem>
  );
}

const FLOW_PARTICIPATION_OPTIONS: readonly SettingOption<FlowParticipationMode>[] = [
  {
    value: 'include',
    label: 'Include',
    description: (
      <>
        <strong>Keep this state in flow.</strong>
        <br />
        Render it and reserve its normal layout space.
      </>
    ),
  },
  {
    value: 'collapse',
    label: 'Collapse',
    description: (
      <>
        <strong>Remove this state from flow.</strong>
        <br />
        Do not reserve its normal layout space.
      </>
    ),
  },
] as const;

const flowStateLabels: Record<FlowParticipationRowState, string> = {
  default: 'Default',
  past: 'Past',
  previous: 'Previous',
  current: 'Current',
  next: 'Next',
  future: 'Future',
};

const FLOW_MATRIX_STATES: readonly FlowParticipationRowState[] = [
  'default',
  'past',
  'previous',
  'current',
  'next',
  'future',
];

function FlowParticipationCell({
  state,
  target,
  value,
  onChange,
}: {
  state: FlowParticipationRowState;
  target: 'row' | 'word';
  value: FlowParticipationMode;
  onChange: (value: FlowParticipationMode) => void;
}): ReactNode {
  const applies = target === 'word' ? state !== 'default' : true;
  if (!applies) {
    return <span className="text-muted-foreground px-2 text-center text-sm">-</span>;
  }

  return (
    <Select value={value} onValueChange={(next) => onChange(next as FlowParticipationMode)}>
      <SelectTrigger
        size="sm"
        className="h-8 w-full min-w-0"
        aria-label={`${target === 'row' ? 'Row' : 'Word'} ${flowStateLabels[state]} participation`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {FLOW_PARTICIPATION_OPTIONS.map((option) => (
          <SettingSelectItem key={option.value} option={option} />
        ))}
      </SelectContent>
    </Select>
  );
}

function FlowParticipationMatrix({
  rows,
  words,
  onRowChange,
  onWordChange,
}: {
  rows: Record<FlowParticipationRowState, FlowParticipationMode>;
  words: Record<FlowParticipationWordState, FlowParticipationMode>;
  onRowChange: (state: FlowParticipationRowState, value: FlowParticipationMode) => void;
  onWordChange: (state: FlowParticipationWordState, value: FlowParticipationMode) => void;
}): ReactNode {
  return (
    <div className="grid grid-cols-[minmax(5.5rem,0.75fr)_minmax(7rem,1fr)_minmax(7rem,1fr)] items-center gap-x-2 gap-y-1.5">
      <div />
      <p className="text-muted-foreground flex items-center gap-1 text-xs font-medium">
        Rows
        <InfoTooltip ariaLabel="Explain row participation">
          <strong>Row state participation.</strong>
          <br />
          Choose whether each row state stays in flow.
        </InfoTooltip>
      </p>
      <p className="text-muted-foreground flex items-center gap-1 text-xs font-medium">
        Words
        <InfoTooltip ariaLabel="Explain word participation">
          <strong>Word state participation.</strong>
          <br />
          Choose whether each word state stays in flow.
        </InfoTooltip>
      </p>
      {FLOW_MATRIX_STATES.map((state) => (
        <Fragment key={state}>
          <div className="text-muted-foreground text-xs font-medium">{flowStateLabels[state]}</div>
          <FlowParticipationCell
            state={state}
            target="row"
            value={rows[state]}
            onChange={(value) => onRowChange(state, value)}
          />
          <FlowParticipationCell
            state={state}
            target="word"
            value={state === 'default' ? 'include' : words[state]}
            onChange={(value) => {
              if (state !== 'default') onWordChange(state, value);
            }}
          />
        </Fragment>
      ))}
    </div>
  );
}

function CollapseModeSelector({
  value,
  onChange,
}: {
  value: FlowCollapseMode;
  onChange: (value: FlowCollapseMode) => void;
}): ReactNode {
  const options: readonly SettingOption<FlowCollapseMode>[] = [
    {
      value: 'reserve',
      label: 'Reserve slots',
      description: (
        <>
          <strong>Keep the measured slot.</strong>
          <br />
          Later content keeps its position.
        </>
      ),
    },
    {
      value: 'reflow',
      label: 'Reflow content',
      description: (
        <>
          <strong>Measure visible content only.</strong>
          <br />
          Later content moves into the open space.
        </>
      ),
    },
  ];
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground flex items-center gap-1 text-xs font-medium">
        Collapsed content behavior
        <InfoTooltip ariaLabel="Explain collapsed content behavior">
          <strong>Choose how collapsed states affect layout.</strong>
          <br />
          Reserve slots keeps their measured space. Reflow content removes it.
        </InfoTooltip>
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              className={[
                'rounded-lg border px-3 py-2 text-left transition-colors',
                selected
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border bg-background hover:bg-accent',
              ].join(' ')}
              onClick={() => onChange(option.value)}
            >
              <span className="block text-sm font-medium">{option.label}</span>
              <span className="text-muted-foreground mt-0.5 block text-[11px] leading-snug">{option.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Preset-wide timing settings drawer, shown next to the preset name in the preview header. */
export function SettingsPopover({
  document,
  onUpdateTiming,
  onUpdateCaptionLayout,
  onMakePageHeightFitParent,
  onOpenChange,
}: {
  document: PresetEditorState;
  languageId?: string;
  onUpdateTiming: (updater: (previous: PresetEditorState['timing']) => PresetEditorState['timing']) => void;
  onUpdateCaptionLayout: (
    updater: (previous: PresetEditorState['captionLayout']) => PresetEditorState['captionLayout'],
  ) => void;
  onMakePageHeightFitParent?: () => void;
  onOpenChange?: (open: boolean) => void;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const holdMeta = getFieldMeta('captionHoldThresholdSeconds');
  const holdValue = document.timing?.captionHoldThresholdSeconds ?? DEFAULT_CAPTION_HOLD_THRESHOLD_SECONDS;
  const rowBreakMeta = getFieldMeta('rowBreakPauseThresholdSeconds');
  const pageBreakMeta = getFieldMeta('pageBreakPauseThresholdSeconds');
  const pauseSpacingThresholdMeta = getFieldMeta('pauseSpacingThresholdSeconds');
  const pauseSpacingExtraMeta = getFieldMeta('pauseSpacingExtra');
  const pauseSpacingMaxExtraMeta = getFieldMeta('pauseSpacingMaxExtra');
  const overflowToleranceMeta = getFieldMeta('overflowTolerance');
  const longWordThresholdMeta = getFieldMeta('longWordThresholdSeconds');
  const layout = document.captionLayout;
  const longWordRuleEnabled =
    layout.breaking.breakPriorities.rows.find((rule) => rule.id === 'long-word')?.mode !== 'off';
  const detectedBreakTimingPreset = captionBreakTimingPresetFor({
    rowBreakPauseThresholdSeconds: layout.breaking.rowBreakPauseThresholdSeconds,
    pageBreakPauseThresholdSeconds: layout.breaking.pageBreakPauseThresholdSeconds,
  });
  const [breakTimingPresetOverride, setBreakTimingPresetOverride] = useState<{
    documentId: string;
    preset: CaptionBreakTimingPreset;
  }>();
  const breakTimingPreset =
    breakTimingPresetOverride?.documentId === document.id
      ? breakTimingPresetOverride.preset
      : detectedBreakTimingPreset;
  const smartBreakMode = layout.breaking.smartBreaks;
  const defaultSmartBreakRules = getSmartBreakRules();
  const effectiveBreaking = smartBreakMode === 'auto' ? defaultSmartBreakRules : layout.breaking;
  const smartBreakLock: PropertyLockState | null =
    smartBreakMode === 'auto'
      ? {
          locked: true,
          value: effectiveBreaking,
          override: { source: 'Smart Breaks (Auto)', type: 'layout' },
        }
      : null;
  const pageHeight = pageHeightInfo(document);
  const flowRows = layout.flowParticipation.rows;
  const flowWords = layout.flowParticipation.words;
  const hasCollapsedFlow =
    FLOW_MATRIX_STATES.some((state) => flowRows[state] === 'collapse') ||
    Object.values(flowWords).some((mode) => mode === 'collapse');
  const updateRowsMode = (mode: RowsPerPageMode) =>
    onUpdateCaptionLayout((previous) => ({
      ...previous,
      rowsPerPage: mode === 'fixed' ? { mode, count: previous.rowsPerPage.count ?? 1 } : { mode },
    }));
  const updateWordsMode = (mode: WordsPerRowMode) =>
    onUpdateCaptionLayout((previous) => ({
      ...previous,
      wordsPerRow: mode === 'fixed' ? { mode, count: previous.wordsPerRow.count ?? 1 } : { mode },
    }));
  const updateBreakTimingPreset = (preset: CaptionBreakTimingPreset) => {
    if (preset === 'custom') {
      setBreakTimingPresetOverride({ documentId: document.id, preset });
      return;
    }
    setBreakTimingPresetOverride(undefined);
    const values = CAPTION_BREAK_TIMING_PRESETS[preset];
    onUpdateCaptionLayout((previous) => ({
      ...previous,
      breaking: {
        ...previous.breaking,
        ...values,
      },
    }));
  };
  const resetSettings = () => {
    setBreakTimingPresetOverride(undefined);
    onUpdateTiming(() => ({ captionHoldThresholdSeconds: DEFAULT_CAPTION_HOLD_THRESHOLD_SECONDS }));
    onUpdateCaptionLayout(() => createDefaultCaptionLayoutPolicy());
  };
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  return (
    <Drawer
      direction={isDesktop ? 'right' : 'bottom'}
      shouldScaleBackground={false}
      handleOnly={isDesktop}
      open={open}
      onOpenChange={handleOpenChange}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="pointer-events-auto h-full"
            aria-label="Open settings"
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => handleOpenChange(true)}
          >
            <Settings2 className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Settings</TooltipContent>
      </Tooltip>
      <DrawerContent
        className="max-h-[min(85vh,46rem)] overflow-hidden bg-popover text-popover-foreground"
        onPointerDownOutside={(event) => {
          if (event.target instanceof Element && event.target.closest('[data-preview-interactive-region="true"]')) {
            event.preventDefault();
          }
        }}
      >
        <DrawerHeader className="relative mx-auto w-full max-w-xl px-4 pb-2 pl-14 text-left sm:px-6 sm:pl-14">
          <DrawerClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-3 left-4"
              aria-label="Close settings"
            >
              {isDesktop ? <ArrowRight className="size-4" /> : <X className="size-4" />}
            </Button>
          </DrawerClose>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DrawerTitle>Settings</DrawerTitle>
              <DrawerDescription>Preset-wide timing and caption layout.</DrawerDescription>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0"
                  aria-label="Reset settings to defaults"
                  onClick={resetSettings}
                >
                  <RotateCcw className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">Reset settings to defaults</TooltipContent>
            </Tooltip>
          </div>
        </DrawerHeader>
        <div className="mx-auto min-h-0 w-full max-w-xl flex-1 overflow-y-auto px-4 pb-6 sm:px-6">
          <div className="space-y-4">
            <section className="space-y-2">
              <p className="text-muted-foreground border-border/60 border-b pb-1 text-[10px] font-semibold tracking-widest uppercase">
                Timing
              </p>
              <NumberField
                id="field-captionHoldThresholdSeconds"
                label="Caption hold threshold"
                description={
                  <>
                    <strong>Keep the previous caption visible</strong>
                    <br />
                    during a gap up to this duration.
                  </>
                }
                meta={holdMeta}
                value={holdValue}
                onChange={(next) => onUpdateTiming((prev) => ({ ...prev, captionHoldThresholdSeconds: next }))}
              />
            </section>

            <section className="space-y-2">
              <p className="text-muted-foreground border-border/60 border-b pb-1 text-[10px] font-semibold tracking-widest uppercase">
                Caption Layout
              </p>
              <SelectField
                label="Text direction"
                description={
                  <>
                    <strong>Choose the text flow direction.</strong>
                    <br />
                    Auto uses the detected direction.
                  </>
                }
                value={layout.textDirection}
                options={[
                  {
                    value: 'auto',
                    label: 'Auto',
                    description: <strong>Use the detected text direction.</strong>,
                  },
                  {
                    value: 'ltr',
                    label: 'Left to right',
                    description: <strong>Place text and words from left to right.</strong>,
                  },
                  {
                    value: 'rtl',
                    label: 'Right to left',
                    description: <strong>Place text and words from right to left.</strong>,
                  },
                ]}
                onChange={(next) =>
                  onUpdateCaptionLayout((previous) => ({
                    ...previous,
                    textDirection: next as TextDirection,
                  }))
                }
              />
              <SelectField
                label="Maximum rows per page"
                description={
                  <>
                    <strong>Limit the rows on each page.</strong>
                    <br />
                    Fit Height uses the available fixed page height.
                  </>
                }
                value={layout.rowsPerPage.mode}
                options={[
                  {
                    value: 'auto',
                    label: 'Auto',
                    description: <strong>Use the natural row count.</strong>,
                  },
                  {
                    value: 'all',
                    label: 'All',
                    description: <strong>Keep all rows on each page and allow vertical overflow.</strong>,
                  },
                  {
                    value: 'fixed',
                    label: 'Fixed Count',
                    description: <strong>Limit each page to the row count below.</strong>,
                  },
                  {
                    value: 'fit-height',
                    label: 'Fit Height',
                    description: <strong>Fit rows into the fixed page height.</strong>,
                  },
                ]}
                onChange={(next) => updateRowsMode(next as RowsPerPageMode)}
              />
              {layout.rowsPerPage.mode === 'fixed' && (
                <DependentSetting>
                  <NumberField
                    id="field-rowsPerPageCount"
                    label="Maximum row count"
                    description={
                      <>
                        <strong>Set the exact row limit</strong>
                        <br />
                        for each page.
                      </>
                    }
                    meta={getFieldMeta('rowsPerPageCount')}
                    value={layout.rowsPerPage.count ?? 1}
                    onChange={(next) =>
                      onUpdateCaptionLayout((previous) => ({
                        ...previous,
                        rowsPerPage: { mode: 'fixed', count: countValue(next, 20) },
                      }))
                    }
                  />
                </DependentSetting>
              )}
              {layout.rowsPerPage.mode === 'fit-height' && !pageHeight.isDefinite && (
                <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-2 py-1.5 text-xs">
                  <p>Fit Height needs a fixed Page height or a Page set to Fit Parent.</p>
                  <p>
                    The Page height is currently &quot;{pageHeightLabel(pageHeight.mode)}&quot;. Set it to Fit Parent.
                  </p>
                  {onMakePageHeightFitParent && (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="text-destructive h-auto px-0 pt-1 text-xs"
                      onClick={onMakePageHeightFitParent}
                    >
                      Make Page Height Fit Parent
                    </Button>
                  )}
                </div>
              )}
              <SelectField
                label="Maximum words per row"
                description={
                  <>
                    <strong>Limit the words in each row.</strong>
                    <br />
                    Fixed uses the exact count below.
                  </>
                }
                value={layout.wordsPerRow.mode}
                options={[
                  {
                    value: 'auto',
                    label: 'Auto',
                    description: <strong>Use the natural word count.</strong>,
                  },
                  {
                    value: 'fixed',
                    label: 'Fixed',
                    description: <strong>Use the exact word count below.</strong>,
                  },
                ]}
                onChange={(next) => updateWordsMode(next as WordsPerRowMode)}
              />
              {layout.wordsPerRow.mode === 'fixed' && (
                <DependentSetting>
                  <NumberField
                    id="field-wordsPerRowCount"
                    label="Maximum word count"
                    description={
                      <>
                        <strong>Set the exact word limit</strong>
                        <br />
                        for each row.
                      </>
                    }
                    meta={getFieldMeta('wordsPerRowCount')}
                    value={layout.wordsPerRow.count ?? 1}
                    onChange={(next) =>
                      onUpdateCaptionLayout((previous) => ({
                        ...previous,
                        wordsPerRow: { mode: 'fixed', count: countValue(next, 50) },
                      }))
                    }
                  />
                </DependentSetting>
              )}
              <SelectField
                label="Horizontal fit"
                description={
                  <>
                    <strong>Control how row text uses its width.</strong>
                    <br />
                    Scaling applies only when natural size does not fit.
                  </>
                }
                value={layout.horizontalFit}
                options={[
                  {
                    value: 'natural',
                    label: 'Natural size',
                    description: <strong>Keep the authored text size.</strong>,
                  },
                  {
                    value: 'shrink-to-fit',
                    label: 'Shrink to fit',
                    description: <strong>Scale the row down until it fits.</strong>,
                  },
                  {
                    value: 'fill-width',
                    label: 'Fill row width',
                    description: <strong>Scale text to fill the row width.</strong>,
                  },
                ]}
                onChange={(next) =>
                  onUpdateCaptionLayout((previous) => ({
                    ...previous,
                    horizontalFit: next as HorizontalFitMode,
                  }))
                }
              />
              {layout.horizontalFit !== 'natural' && (
                <DependentSetting>
                  <NumberField
                    id="field-horizontalFitMinScale"
                    label="Minimum font scale"
                    description={
                      <>
                        <strong>Smallest allowed text scale.</strong>
                        <br />
                        Wrap a word if it still does not fit.
                      </>
                    }
                    meta={getFieldMeta('horizontalFitMinScale')}
                    value={layout.horizontalFitMinScale}
                    onChange={(next) =>
                      onUpdateCaptionLayout((previous) => ({
                        ...previous,
                        horizontalFitMinScale: Math.min(next, previous.horizontalFitMaxScale),
                      }))
                    }
                  />
                  <NumberField
                    id="field-horizontalFitMaxScale"
                    label="Maximum font scale"
                    description={
                      <>
                        <strong>Largest allowed text scale.</strong>
                        <br />
                        Fill row width stops at this scale.
                      </>
                    }
                    meta={getFieldMeta('horizontalFitMaxScale')}
                    value={layout.horizontalFitMaxScale}
                    onChange={(next) =>
                      onUpdateCaptionLayout((previous) => ({
                        ...previous,
                        horizontalFitMaxScale: Math.max(next, previous.horizontalFitMinScale),
                      }))
                    }
                  />
                </DependentSetting>
              )}
              <div className="border-border/60 space-y-3 border-t pt-3">
                <div>
                  <p className="text-muted-foreground flex items-center gap-1 text-xs font-medium">
                    Flow participation
                    <InfoTooltip ariaLabel="Explain flow participation">
                      <strong>Choose which states stay in flow.</strong>
                      <br />
                      Included states render and reserve layout space.
                    </InfoTooltip>
                  </p>
                  <p className="text-muted-foreground mt-1 text-[11px]">
                    Choose which states participate in rendering and layout.
                  </p>
                </div>
                <FlowParticipationMatrix
                  rows={flowRows}
                  words={flowWords}
                  onRowChange={(state, value) =>
                    onUpdateCaptionLayout((previous) => ({
                      ...previous,
                      flowParticipation: {
                        ...previous.flowParticipation,
                        rows: { ...previous.flowParticipation.rows, [state]: value },
                      },
                    }))
                  }
                  onWordChange={(state, value) =>
                    onUpdateCaptionLayout((previous) => ({
                      ...previous,
                      flowParticipation: {
                        ...previous.flowParticipation,
                        words: { ...previous.flowParticipation.words, [state]: value },
                      },
                    }))
                  }
                />
                {hasCollapsedFlow && (
                  <DependentSetting>
                    <CollapseModeSelector
                      value={layout.flowParticipation.collapseMode ?? 'reserve'}
                      onChange={(value) =>
                        onUpdateCaptionLayout((previous) => ({
                          ...previous,
                          flowParticipation: {
                            ...previous.flowParticipation,
                            collapseMode: value,
                          },
                        }))
                      }
                    />
                  </DependentSetting>
                )}
              </div>
            </section>

            <section className="space-y-2">
              <p className="text-muted-foreground border-border/60 border-b pb-1 text-[10px] font-semibold tracking-widest uppercase">
                Breaking
              </p>
              <SelectField
                label="Long-word wrapping"
                description={
                  <>
                    <strong>Choose what happens to oversized words.</strong>
                    <br />
                    Wrap mode uses the configured break characters.
                  </>
                }
                value={layout.breaking.wordWrapping.mode}
                options={[
                  {
                    value: 'allow-overflow',
                    label: 'Allow overflow',
                    description: <strong>Keep an oversized word on one line.</strong>,
                  },
                  {
                    value: 'wrap',
                    label: 'Wrap long words',
                    description: <strong>Split the word at configured break characters.</strong>,
                  },
                ]}
                onChange={(next) =>
                  onUpdateCaptionLayout((previous) => ({
                    ...previous,
                    breaking: {
                      ...previous.breaking,
                      wordWrapping: {
                        ...previous.breaking.wordWrapping,
                        mode: next as CaptionWordWrappingMode,
                      },
                    },
                  }))
                }
              />
              {layout.breaking.wordWrapping.mode === 'wrap' && (
                <div className="space-y-3 border-border/60 border-b pb-3">
                  <PunctuationTokenEditor
                    label="Word break characters"
                    description={
                      <>
                        <strong>Choose split points.</strong>
                        <br />
                        Add preferred split characters or sequences, such as a dash (-).
                        <br />
                        If the word contains none of the preferred split points, the engine still splits it at a safe
                        fallback point.
                      </>
                    }
                    values={layout.breaking.wordWrapping.breakCharacters}
                    onChange={(values) =>
                      onUpdateCaptionLayout((previous) => ({
                        ...previous,
                        breaking: {
                          ...previous.breaking,
                          wordWrapping: {
                            ...previous.breaking.wordWrapping,
                            breakCharacters: values,
                          },
                        },
                      }))
                    }
                  />
                  <FieldRow
                    label="Break marker"
                    description={
                      <>
                        <strong>Optional text at generated breaks.</strong>
                        <br />
                        Existing break characters stay unchanged. Leave empty for no symbol.
                      </>
                    }
                  >
                    <Input
                      value={layout.breaking.wordWrapping.breakMarker}
                      aria-label="Break marker"
                      className="h-8 text-xs"
                      onChange={(event) =>
                        onUpdateCaptionLayout((previous) => ({
                          ...previous,
                          breaking: {
                            ...previous.breaking,
                            wordWrapping: {
                              ...previous.breaking.wordWrapping,
                              breakMarker: event.target.value,
                            },
                          },
                        }))
                      }
                    />
                    <div className="text-muted-foreground flex items-center gap-1 text-[11px]">
                      <span>Suggested defaults:</span>
                      {[
                        {
                          value: '-',
                          label: '`-`',
                          description: <strong>Use a hyphen as the break marker.</strong>,
                        },
                        {
                          value: '',
                          label: '""',
                          description: <strong>Use no break marker.</strong>,
                        },
                      ].map((option) => (
                        <Tooltip key={option.label}>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="text-foreground rounded border px-1.5 py-0.5 hover:bg-accent"
                              onClick={() =>
                                onUpdateCaptionLayout((previous) => ({
                                  ...previous,
                                  breaking: {
                                    ...previous.breaking,
                                    wordWrapping: {
                                      ...previous.breaking.wordWrapping,
                                      breakMarker: option.value,
                                    },
                                  },
                                }))
                              }
                            >
                              {option.label}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-64 text-xs whitespace-pre-line">
                            {option.description}
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  </FieldRow>
                  <NumberField
                    id="field-wordWrappingOverflowTolerance"
                    label="Effect overflow tolerance"
                    description={
                      <>
                        <strong>Allow small decorative effect bleed.</strong>
                        <br />
                        Ignore a small amount of visual overflow from effects such as glow, shadows, blur, and strokes
                        when wrapping words.
                        <br />
                        The value applies to each side. Rendering and crop bounds stay unchanged.
                      </>
                    }
                    meta={overflowToleranceMeta}
                    value={layout.breaking.wordWrapping.overflowTolerance}
                    onChange={(next) =>
                      onUpdateCaptionLayout((previous) => ({
                        ...previous,
                        breaking: {
                          ...previous.breaking,
                          wordWrapping: {
                            ...previous.breaking.wordWrapping,
                            overflowTolerance: next,
                          },
                        },
                      }))
                    }
                  />
                </div>
              )}
              <SelectField
                label="Break timing profile"
                description={
                  <>
                    <strong>Choose pause thresholds.</strong>
                    <br />
                    Custom exposes the row and page values below.
                  </>
                }
                value={breakTimingPreset}
                options={[
                  {
                    value: 'short',
                    label: 'Short',
                    description: <strong>Keep words together across short pauses.</strong>,
                  },
                  {
                    value: 'medium',
                    label: 'Medium',
                    description: <strong>Start a new row after a medium pause.</strong>,
                  },
                  {
                    value: 'long',
                    label: 'Long',
                    description: <strong>Start a new page after a long pause.</strong>,
                  },
                  {
                    value: 'custom',
                    label: 'Custom',
                    description: <strong>Set row and page pause thresholds below.</strong>,
                  },
                ]}
                onChange={(next) => updateBreakTimingPreset(next as CaptionBreakTimingPreset)}
              />
              <p className="text-muted-foreground text-xs">
                <strong>Short:</strong> keep words together. <strong>Medium:</strong> start a row.{' '}
                <strong>Long:</strong> start a page.
              </p>
              {breakTimingPreset === 'custom' && (
                <>
                  <NumberField
                    id="field-rowBreakPauseThresholdSeconds"
                    label="Row break pause threshold"
                    description={
                      <>
                        <strong>Start a new row</strong>
                        <br />
                        when the pause between words reaches this duration.
                      </>
                    }
                    meta={rowBreakMeta}
                    value={layout.breaking.rowBreakPauseThresholdSeconds}
                    onChange={(next) =>
                      onUpdateCaptionLayout((previous) => ({
                        ...previous,
                        breaking: { ...previous.breaking, rowBreakPauseThresholdSeconds: next },
                      }))
                    }
                  />
                  <NumberField
                    id="field-pageBreakPauseThresholdSeconds"
                    label="Page break pause threshold"
                    description={
                      <>
                        <strong>Start a new page</strong>
                        <br />
                        when the pause between rows reaches this duration.
                      </>
                    }
                    meta={pageBreakMeta}
                    value={layout.breaking.pageBreakPauseThresholdSeconds}
                    onChange={(next) =>
                      onUpdateCaptionLayout((previous) => ({
                        ...previous,
                        breaking: { ...previous.breaking, pageBreakPauseThresholdSeconds: next },
                      }))
                    }
                  />
                </>
              )}
              <section className="space-y-2 border-border/60 border-t pt-3">
                <p className="text-muted-foreground flex items-center gap-1 text-xs font-medium">
                  Pause spacing
                  <InfoTooltip ariaLabel="Explain pause spacing">
                    Add extra space between rows separated by a long pause.
                    <br />
                    This does not create a new Page.
                  </InfoTooltip>
                </p>
                <BooleanField
                  id="field-pauseSpacingEnabled"
                  label="Add extra spacing after long pauses"
                  description="Keep verse boundaries visible while rows stay on the same Page."
                  value={layout.breaking.pauseSpacing.enabled}
                  onChange={(enabled) =>
                    onUpdateCaptionLayout((previous) => ({
                      ...previous,
                      breaking: {
                        ...previous.breaking,
                        pauseSpacing: { ...previous.breaking.pauseSpacing, enabled },
                      },
                    }))
                  }
                />
                {layout.breaking.pauseSpacing.enabled && (
                  <DependentSetting>
                    <NumberField
                      id="field-pauseSpacingThresholdSeconds"
                      label="Pause spacing threshold"
                      description="Add extra space when the pause between rows reaches this duration."
                      meta={pauseSpacingThresholdMeta}
                      value={layout.breaking.pauseSpacing.thresholdSeconds}
                      onChange={(next) =>
                        onUpdateCaptionLayout((previous) => ({
                          ...previous,
                          breaking: {
                            ...previous.breaking,
                            pauseSpacing: {
                              ...previous.breaking.pauseSpacing,
                              thresholdSeconds: next,
                            },
                          },
                        }))
                      }
                    />
                    <NumberField
                      id="field-pauseSpacingExtra"
                      label="Extra spacing"
                      description="Add this many composition units at the pause boundary."
                      meta={pauseSpacingExtraMeta}
                      value={layout.breaking.pauseSpacing.extraSpacing}
                      onChange={(next) =>
                        onUpdateCaptionLayout((previous) => ({
                          ...previous,
                          breaking: {
                            ...previous.breaking,
                            pauseSpacing: {
                              ...previous.breaking.pauseSpacing,
                              extraSpacing: next,
                              maxExtraSpacing: Math.max(previous.breaking.pauseSpacing.maxExtraSpacing, next),
                            },
                          },
                        }))
                      }
                    />
                    <NumberField
                      id="field-pauseSpacingMaxExtra"
                      label="Maximum extra spacing"
                      description="Limit the extra gap so timing data cannot create an extreme layout."
                      meta={pauseSpacingMaxExtraMeta}
                      value={layout.breaking.pauseSpacing.maxExtraSpacing}
                      onChange={(next) =>
                        onUpdateCaptionLayout((previous) => ({
                          ...previous,
                          breaking: {
                            ...previous.breaking,
                            pauseSpacing: {
                              ...previous.breaking.pauseSpacing,
                              maxExtraSpacing: next,
                              extraSpacing: Math.min(previous.breaking.pauseSpacing.extraSpacing, next),
                            },
                          },
                        }))
                      }
                    />
                  </DependentSetting>
                )}
              </section>
              {longWordRuleEnabled && (
                <section className="space-y-2 border-border/60 border-t pt-3">
                  <p className="text-muted-foreground flex items-center gap-1 text-xs font-medium">
                    Long-word protection
                    <InfoTooltip ariaLabel="Explain long-word protection settings">
                      These settings apply when the Long-word protection rule is enabled.
                      <br />
                      The mode controls how the threshold value is used.
                    </InfoTooltip>
                  </p>
                  <SelectField
                    label="Long-word threshold mode"
                    description={
                      <strong>
                        {layout.breaking.longWordThresholdMode === 'automatic'
                          ? 'Scale the threshold with available caption width.'
                          : 'Use the exact threshold value.'}
                      </strong>
                    }
                    value={layout.breaking.longWordThresholdMode}
                    options={[
                      {
                        value: 'automatic',
                        label: 'Automatic',
                        description: <strong>Protect narrow caption areas more.</strong>,
                      },
                      {
                        value: 'fixed',
                        label: 'Fixed',
                        description: <strong>Use the exact configured duration.</strong>,
                      },
                    ]}
                    onChange={(next) =>
                      onUpdateCaptionLayout((previous) => ({
                        ...previous,
                        breaking: { ...previous.breaking, longWordThresholdMode: next as LongWordThresholdMode },
                      }))
                    }
                  />
                  <NumberField
                    id="field-longWordThresholdSeconds"
                    label={
                      layout.breaking.longWordThresholdMode === 'automatic'
                        ? 'Base long-word threshold'
                        : 'Long-word threshold'
                    }
                    description={
                      layout.breaking.longWordThresholdMode === 'automatic'
                        ? 'Scale this base duration with the available caption width.'
                        : 'Keep a word alone when its duration exceeds this value.'
                    }
                    meta={longWordThresholdMeta}
                    value={layout.breaking.longWordThresholdSeconds}
                    onChange={(next) =>
                      onUpdateCaptionLayout((previous) => ({
                        ...previous,
                        breaking: { ...previous.breaking, longWordThresholdSeconds: next },
                      }))
                    }
                  />
                </section>
              )}
              <div className="space-y-1.5 pt-1">
                <p className="text-muted-foreground flex items-center gap-1 text-xs font-medium">
                  Row break priorities
                  <InfoTooltip ariaLabel="Explain row break priorities">
                    <strong>Order the row break rules.</strong>
                    <br />
                    Drag a rule to change its priority.
                  </InfoTooltip>
                </p>
                <BreakPriorityEditor
                  rules={layout.breaking.breakPriorities.rows}
                  definitions={CAPTION_BREAK_RULE_DEFINITIONS.rows}
                  onChange={(rows) =>
                    onUpdateCaptionLayout((previous) => ({
                      ...previous,
                      breaking: {
                        ...previous.breaking,
                        breakPriorities: { ...previous.breaking.breakPriorities, rows },
                      },
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5 pt-1">
                <p className="text-muted-foreground flex items-center gap-1 text-xs font-medium">
                  Page break priorities
                  <InfoTooltip ariaLabel="Explain page break priorities">
                    <strong>Order the page break rules.</strong>
                    <br />
                    Drag a rule to change its priority.
                  </InfoTooltip>
                </p>
                <BreakPriorityEditor
                  rules={layout.breaking.breakPriorities.pages}
                  definitions={CAPTION_BREAK_RULE_DEFINITIONS.pages}
                  onChange={(pages) =>
                    onUpdateCaptionLayout((previous) => ({
                      ...previous,
                      breaking: {
                        ...previous.breaking,
                        breakPriorities: { ...previous.breaking.breakPriorities, pages },
                      },
                    }))
                  }
                />
              </div>
              <SelectField
                label="Source line breaks"
                description={
                  <>
                    <strong>Choose how source line breaks behave.</strong>
                    <br />
                    Preserve keeps them. Allow Reflow lets layout place lines.
                  </>
                }
                value={layout.breaking.sourceLineBreaks}
                options={[
                  {
                    value: 'preserve',
                    label: 'Preserve',
                    description: <strong>Keep line breaks from the source text.</strong>,
                  },
                  {
                    value: 'allow-reflow',
                    label: 'Allow Reflow',
                    description: <strong>Let layout place lines by width and breaks.</strong>,
                  },
                ]}
                onChange={(next) =>
                  onUpdateCaptionLayout((previous) => ({
                    ...previous,
                    breaking: { ...previous.breaking, sourceLineBreaks: next as SourceLineBreakMode },
                  }))
                }
              />
              <SelectField
                label="Smart breaks"
                description={
                  <>
                    <strong>Choose how smart break rules work.</strong>
                    <br />
                    Auto uses built-in rules. Custom lets you edit them.
                  </>
                }
                value={layout.breaking.smartBreaks}
                options={[
                  {
                    value: 'off',
                    label: 'Off',
                    description: <strong>Do not use smart break rules.</strong>,
                  },
                  {
                    value: 'auto',
                    label: 'Auto',
                    description: (
                      <>
                        <strong>Use built-in rules.</strong>
                        <br />
                        Values are read-only.
                      </>
                    ),
                  },
                  {
                    value: 'custom',
                    label: 'Custom',
                    description: <strong>Edit the smart break character lists.</strong>,
                  },
                ]}
                onChange={(next) =>
                  onUpdateCaptionLayout((previous) => ({
                    ...previous,
                    breaking: { ...previous.breaking, smartBreaks: next as SmartBreakMode },
                  }))
                }
              />
              {smartBreakMode !== 'off' && (
                <div className="space-y-3 pt-1">
                  <PunctuationTokenEditor
                    label="Sentence endings"
                    description={
                      <>
                        <strong>Split after sentence-ending punctuation.</strong>
                        <br />
                        Smart breaks use these tokens to find sentence boundaries.
                      </>
                    }
                    values={effectiveBreaking.sentenceEndings}
                    readOnly={smartBreakMode === 'auto'}
                    lock={smartBreakLock}
                    onReset={
                      smartBreakMode === 'custom'
                        ? () =>
                            onUpdateCaptionLayout((previous) => ({
                              ...previous,
                              breaking: {
                                ...previous.breaking,
                                sentenceEndings: [...defaultSmartBreakRules.sentenceEndings],
                              },
                            }))
                        : undefined
                    }
                    onChange={
                      smartBreakMode === 'custom'
                        ? (values) =>
                            onUpdateCaptionLayout((previous) => ({
                              ...previous,
                              breaking: { ...previous.breaking, sentenceEndings: values },
                            }))
                        : undefined
                    }
                  />
                  <PunctuationTokenEditor
                    label="Strong punctuation"
                    description={
                      <>
                        <strong>Give these marks more break weight.</strong>
                        <br />
                        Smart breaks prefer them when a page or row can split.
                      </>
                    }
                    values={effectiveBreaking.strongPunctuation}
                    readOnly={smartBreakMode === 'auto'}
                    lock={smartBreakLock}
                    onReset={
                      smartBreakMode === 'custom'
                        ? () =>
                            onUpdateCaptionLayout((previous) => ({
                              ...previous,
                              breaking: {
                                ...previous.breaking,
                                strongPunctuation: [...defaultSmartBreakRules.strongPunctuation],
                              },
                            }))
                        : undefined
                    }
                    onChange={
                      smartBreakMode === 'custom'
                        ? (values) =>
                            onUpdateCaptionLayout((previous) => ({
                              ...previous,
                              breaking: { ...previous.breaking, strongPunctuation: values },
                            }))
                        : undefined
                    }
                  />
                  <PunctuationTokenEditor
                    label="Additional characters"
                    description={
                      <>
                        <strong>Add more smart break characters.</strong>
                        <br />
                        Use this list for punctuation not covered above.
                      </>
                    }
                    values={effectiveBreaking.additionalCharacters}
                    readOnly={smartBreakMode === 'auto'}
                    lock={smartBreakLock}
                    onChange={
                      smartBreakMode === 'custom'
                        ? (values) =>
                            onUpdateCaptionLayout((previous) => ({
                              ...previous,
                              breaking: { ...previous.breaking, additionalCharacters: values },
                            }))
                        : undefined
                    }
                  />
                  {smartBreakMode === 'auto' && <SmartBreakInfo />}
                </div>
              )}
            </section>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
