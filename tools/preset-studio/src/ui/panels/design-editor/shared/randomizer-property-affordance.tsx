import type { FieldMeta } from '@/schema/field-metadata';
import type { PaintCapability } from '@/schema/paint';
import type { PropertyValueType, RandomizerConfig } from '@/schema/property-tree';
import { FieldLabelExtraContext } from '@/ui/controls/field-row';
import { INSPECTOR_CARD_CONTENT_STACK_CLASS } from '@/ui/controls/inspector-layout';
import {
  createDefaultRandomizerConfig,
  RandomizerEditor,
  type RandomizerInlineEndContent,
} from '@/ui/controls/randomizer-editor';
import { RandomizerIcon } from '@/ui/controls/randomizer-icon';
import { usePopoverOutsideDismissal } from '@/ui/controls/use-popover-outside-dismissal';
import { Button } from '@/ui/shadcn/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/shadcn/popover';
import { Switch } from '@/ui/shadcn/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';
import { useEffect, useState } from 'react';

export function RandomizerPropertyAffordance({
  label,
  leafType,
  currentValue,
  randomizer,
  onChange,
  meta,
  paintCapabilities,
  inlineEndContent,
  inlineEndContentInteractive = false,
  axisInlineEndContent,
  supportsStatePersistence = false,
  supportsKeepWithinParentBounds = false,
  disabled = false,
}: {
  label: string;
  leafType: PropertyValueType;
  currentValue: unknown;
  randomizer: RandomizerConfig | undefined;
  onChange: (next: RandomizerConfig | undefined) => void;
  meta?: FieldMeta;
  paintCapabilities?: readonly PaintCapability[];
  inlineEndContent?: RandomizerInlineEndContent;
  inlineEndContentInteractive?: boolean;
  axisInlineEndContent?: Partial<Record<'x' | 'y', RandomizerInlineEndContent>>;
  supportsStatePersistence?: boolean;
  supportsKeepWithinParentBounds?: boolean;
  disabled?: boolean;
}) {
  const { layerId, open, setOpen } = usePopoverOutsideDismissal();
  const [draftRandomizer, setDraftRandomizer] = useState<RandomizerConfig>();
  const editorRandomizer = randomizer ?? draftRandomizer;
  const configured = editorRandomizer !== undefined;
  const active = configured && editorRandomizer.enabled !== false;
  const tooltip = configured ? 'Remove randomizer' : 'Add randomizer';
  useEffect(() => {
    if (randomizer) {
      setDraftRandomizer(randomizer);
    } else if (!open) {
      setDraftRandomizer(undefined);
    }
  }, [open, randomizer]);
  const handleTriggerClick = () => {
    if (!editorRandomizer) {
      setDraftRandomizer({ ...createDefaultRandomizerConfig(leafType, currentValue, meta), enabled: false });
    }
    setOpen(true);
  };
  const handleRandomizerChange = (next: RandomizerConfig | undefined) => {
    setDraftRandomizer(next);
    if (randomizer || next?.enabled !== false) {
      onChange(next);
    }
  };
  const handleEnabledChange = (enabled: boolean) => {
    if (editorRandomizer) {
      handleRandomizerChange({ ...editorRandomizer, enabled });
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className={
                active
                  ? 'rounded-md bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 hover:text-blue-300'
                  : 'text-muted-foreground'
              }
              aria-label={`${tooltip} for ${label}`}
              aria-pressed={active}
              disabled={disabled}
              onClick={handleTriggerClick}
            >
              <RandomizerIcon className="size-3.5" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {disabled ? `${label} is controlled elsewhere` : tooltip}
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        collisionPadding={16}
        className={`${INSPECTOR_CARD_CONTENT_STACK_CLASS} w-auto min-w-[26rem] max-w-[calc(100vw-2rem)] overscroll-contain`}
        data-popover-layer-content={layerId}
        dismissOnOutside={false}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-medium">{label} Randomizer</p>
            <span className="text-muted-foreground shrink-0 text-[11px]">
              {active ? 'Enabled' : configured ? 'Disabled' : 'Not configured'}
            </span>
          </div>
          <Switch
            checked={active}
            onCheckedChange={handleEnabledChange}
            onPointerDown={(event) => event.stopPropagation()}
            aria-label={`Enable ${label} randomizer`}
          />
        </div>
        <FieldLabelExtraContext.Provider value={null}>
          <RandomizerEditor
            leafType={leafType}
            currentValue={currentValue}
            randomizer={editorRandomizer}
            onChange={handleRandomizerChange}
            meta={meta}
            paintCapabilities={paintCapabilities}
            inlineEndContent={inlineEndContent}
            inlineEndContentInteractive={inlineEndContentInteractive}
            axisInlineEndContent={axisInlineEndContent}
            supportsStatePersistence={supportsStatePersistence}
            supportsKeepWithinParentBounds={supportsKeepWithinParentBounds}
            disabled={!active}
          />
        </FieldLabelExtraContext.Provider>
      </PopoverContent>
    </Popover>
  );
}
