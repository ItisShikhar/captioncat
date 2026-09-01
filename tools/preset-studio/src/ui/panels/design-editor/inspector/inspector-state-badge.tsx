import { ChevronDown, Eye } from 'lucide-react';

import { mutedActionButtonClass } from '@/ui/controls/muted-action-button';
import { Button } from '@/ui/shadcn/button';
import { ButtonGroup } from '@/ui/shadcn/button-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/ui/shadcn/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';

export interface InspectorStateBadgeOption {
  id: string;
  label: string;
}

export interface InspectorStateBadgeProps {
  label: string;
  value: string;
  options: readonly InspectorStateBadgeOption[];
  onView: () => void;
  onStateChange: (value: string) => void;
}

export function InspectorStateBadge({
  label,
  value,
  options,
  onView,
  onStateChange,
}: InspectorStateBadgeProps) {
  return (
    <DropdownMenu>
      <ButtonGroup aria-label="State preview controls">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className={mutedActionButtonClass(
                'start',
                'default',
                'gap-1 px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase',
              )}
              aria-label="View state in previewer"
              data-inspector-state-preview="true"
              onClick={(event) => {
                event.stopPropagation();
                onView();
              }}
            >
              <Eye className="size-3" aria-hidden="true" />
              {label}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">View state in previewer</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className={mutedActionButtonClass('end')}
                aria-label="Choose state"
                data-inspector-state-menu="true"
              >
                <ChevronDown className="size-3" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">Choose state</TooltipContent>
        </Tooltip>
      </ButtonGroup>
      <DropdownMenuContent align="start" className="min-w-32">
        <DropdownMenuRadioGroup value={value} onValueChange={onStateChange}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.id} value={option.id}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
