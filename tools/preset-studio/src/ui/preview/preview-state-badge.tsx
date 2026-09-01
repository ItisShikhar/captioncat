import { ChevronDown } from 'lucide-react';

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

export interface PreviewStateBadgeOption {
  id: string;
  label: string;
}

export interface PreviewStateBadgeProps {
  value: string;
  label: string;
  options: readonly PreviewStateBadgeOption[];
  onValueChange: (value: string) => void;
}

export function PreviewStateBadge({ value, label, options, onValueChange }: PreviewStateBadgeProps) {
  return (
    <DropdownMenu>
      <ButtonGroup aria-label="Word State Preview state">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className={mutedActionButtonClass(
            'start',
            'default',
            'px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase',
          )}
          aria-label={`Show ${label} Word in hierarchy`}
          data-preview-state-reveal="true"
          onClick={() => onValueChange(value)}
        >
          {label}
        </Button>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className={mutedActionButtonClass('end')}
            aria-label="Choose Word State Preview state"
            data-preview-state-menu="true"
          >
            <ChevronDown className="size-3" />
          </Button>
        </DropdownMenuTrigger>
      </ButtonGroup>
      <DropdownMenuContent align="start" className="min-w-32">
        <DropdownMenuRadioGroup value={value} onValueChange={onValueChange}>
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
