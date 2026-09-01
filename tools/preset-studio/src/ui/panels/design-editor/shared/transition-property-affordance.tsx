import {
  DEFAULT_TRANSITION_CONFIG,
  type PropertyValueType,
  type TransitionConfig,
} from '@/schema/property-tree';
import type { FieldMeta } from '@/schema/field-metadata';
import type { PaintCapability } from '@/schema/paint';
import { TransitionEditor } from '@/ui/controls/transition-editor';
import { usePopoverOutsideDismissal } from '@/ui/controls/use-popover-outside-dismissal';
import { Button } from '@/ui/shadcn/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/shadcn/popover';
import { Switch } from '@/ui/shadcn/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';
import { ArrowRightLeft } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

const DISABLED_TRANSITION_CONFIG: TransitionConfig = {
  ...DEFAULT_TRANSITION_CONFIG,
  enabled: false,
};

export function TransitionPropertyAffordance({
  label,
  transition,
  currentValue,
  leafType,
  meta,
  paintCapabilities,
  defaultScope,
  onChange,
}: {
  label: string;
  transition: TransitionConfig | undefined;
  currentValue: unknown;
  leafType?: PropertyValueType;
  meta?: FieldMeta;
  paintCapabilities?: readonly PaintCapability[];
  defaultScope?: TransitionConfig['scope'];
  onChange: (next: TransitionConfig | undefined) => void;
}): ReactNode {
  const { layerId, open, setOpen } = usePopoverOutsideDismissal();
  const [draftTransition, setDraftTransition] = useState<TransitionConfig>();
  const editorTransition = transition ?? draftTransition;
  const configured = editorTransition !== undefined;
  const active = configured && editorTransition.enabled !== false;
  const tooltip = configured ? 'Remove transition' : 'Add transition';
  const disabledTransitionConfig = {
    ...DISABLED_TRANSITION_CONFIG,
    ...(defaultScope === undefined ? {} : { scope: defaultScope }),
  };

  useEffect(() => {
    if (transition) {
      setDraftTransition(transition);
    } else if (!open) {
      setDraftTransition(undefined);
    }
  }, [open, transition]);

  const handleTriggerClick = () => {
    if (!editorTransition) setDraftTransition(disabledTransitionConfig);
    setOpen(true);
  };

  const handleTransitionChange = (next: TransitionConfig | undefined) => {
    setDraftTransition(next);
    if (transition || next?.enabled !== false) onChange(next);
  };

  const handleEnabledChange = (enabled: boolean) => {
    handleTransitionChange({
      ...(editorTransition ?? DISABLED_TRANSITION_CONFIG),
      enabled,
    });
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
                  ? 'rounded-md bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 hover:text-emerald-300'
                  : 'text-muted-foreground'
              }
              aria-label={`${tooltip} for ${label}`}
              aria-pressed={active}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={handleTriggerClick}
            >
              <ArrowRightLeft className="size-3.5" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        className="w-auto min-w-[21rem] space-y-3"
        data-popover-layer-content={layerId}
        dismissOnOutside={false}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">{label} Transition</p>
          <Switch
            checked={active}
            onCheckedChange={handleEnabledChange}
            onPointerDown={(event) => event.stopPropagation()}
            aria-label={`${label} transition enabled`}
          />
        </div>
        <TransitionEditor
          transition={editorTransition ?? disabledTransitionConfig}
          currentValue={currentValue}
          leafType={leafType}
          meta={meta}
          paintCapabilities={paintCapabilities}
          onChange={handleTransitionChange}
          disabled={!active}
        />
      </PopoverContent>
    </Popover>
  );
}
