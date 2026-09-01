import { ChevronDown } from 'lucide-react';

import {
  ENTITY_STATES,
  stateStyleOptionsForEntity,
  stateStyleSourceForEntity,
  type EcsEntityDoc,
  type EntityStateKey,
  type StateStyleSource,
} from '@/schema';
import { mutedActionButtonClass } from '@/ui/controls/muted-action-button';
import { Button } from '@/ui/shadcn/button';
import { ButtonGroup } from '@/ui/shadcn/button-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/shadcn/dropdown-menu';

function styleLabel(source: StateStyleSource | 'custom'): string {
  if (source === 'custom') return 'Custom';
  return ENTITY_STATES.find((state) => state.key === source)?.label ?? source;
}

export interface StateStyleSourceControlProps {
  root: EcsEntityDoc;
  selectedEntity: EcsEntityDoc;
  onCustomize: () => void;
  onChange: (source: StateStyleSource) => void;
  onSelectSourceState: (source: EntityStateKey) => void;
}

export function StateStyleSourceControl({
  root,
  selectedEntity,
  onCustomize,
  onChange,
  onSelectSourceState,
}: StateStyleSourceControlProps) {
  const value = stateStyleSourceForEntity(selectedEntity);
  const options = stateStyleOptionsForEntity(root, selectedEntity);
  const selectedLabel = styleLabel(value);
  const canSelectSourceState = value !== 'custom';

  return (
    <DropdownMenu>
      <ButtonGroup aria-label="State style source">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className={mutedActionButtonClass(
            'start',
            'default',
            'px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase',
          )}
          aria-label={canSelectSourceState ? `Switch to ${selectedLabel} state` : `Currently using ${selectedLabel} Style`}
          disabled={!canSelectSourceState}
          onClick={() => {
            if (canSelectSourceState) onSelectSourceState(value);
          }}
        >
          Currently using {selectedLabel} Style
        </Button>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className={mutedActionButtonClass('end')}
            aria-label="Choose state style source"
          >
            <ChevronDown className="size-3" />
          </Button>
        </DropdownMenuTrigger>
      </ButtonGroup>
      <DropdownMenuContent align="start" className="min-w-44">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(nextValue) => {
            if (nextValue === 'custom') {
              onCustomize();
              return;
            }
            if (options.includes(nextValue as EntityStateKey)) onChange(nextValue as StateStyleSource);
          }}
        >
          {options.map((source) => (
            <DropdownMenuRadioItem key={source} value={source}>
              {styleLabel(source)} Style
            </DropdownMenuRadioItem>
          ))}
          {options.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuRadioItem value="custom">Customise</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
