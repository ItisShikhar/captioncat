import { closestCenter, DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import type { CaptionBreakRule, CaptionBreakRuleMode } from '@captioncat/caption-engine/browser';
import { Button } from '@/ui/shadcn/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/shadcn/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';
import { InfoTooltip } from './info-tooltip';

type BreakRuleDefinition = {
  label: string;
  description: string;
  required: boolean;
};

const BREAK_RULE_MODE_OPTIONS: readonly {
  value: CaptionBreakRuleMode;
  label: string;
  description: ReactNode;
}[] = [
  {
    value: 'off',
    label: 'Off',
    description: (
      <>
        <strong>Do not use this rule.</strong>
      </>
    ),
  },
  {
    value: 'always',
    label: 'Always',
    description: (
      <>
        <strong>Use this rule whenever it matches.</strong>
      </>
    ),
  },
  {
    value: 'prefer',
    label: 'Prefer',
    description: (
      <>
        <strong>Use this rule when possible.</strong>
        <br />
        Required rules still take priority.
      </>
    ),
  },
  {
    value: 'required',
    label: 'Required',
    description: (
      <>
        <strong>Force this rule when it matches.</strong>
      </>
    ),
  },
];

function BreakRuleModeItem({
  option,
}: {
  option: (typeof BREAK_RULE_MODE_OPTIONS)[number];
}): ReactNode {
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

function SortableBreakRule<TRuleId extends string>({
  rule,
  definition,
  onModeChange,
}: {
  rule: CaptionBreakRule<TRuleId>;
  definition: BreakRuleDefinition;
  onModeChange: (mode: CaptionBreakRuleMode) => void;
}): ReactNode {
  const id = `caption-break-rule-${rule.id}`;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'border-border/60 bg-muted/20 flex items-center gap-1.5 rounded-md border px-1.5 py-1',
        isDragging && 'relative z-10 opacity-70',
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="cursor-grab active:cursor-grabbing"
        aria-label={`Drag ${definition.label} to reorder`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="text-muted-foreground size-3.5" />
      </Button>
      <span className="flex min-w-0 flex-1 items-center gap-1 text-xs">
        <span className="min-w-0 truncate">{definition.label}</span>
        <InfoTooltip ariaLabel={`Explain ${definition.label}`}>{definition.description}</InfoTooltip>
      </span>
      <Select value={rule.mode} onValueChange={onModeChange} disabled={definition.required}>
        <SelectTrigger size="sm" className="w-24">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {BREAK_RULE_MODE_OPTIONS.filter((option) => option.value !== 'required' || definition.required).map((option) => (
            <BreakRuleModeItem key={option.value} option={option} />
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function BreakPriorityEditor<TRuleId extends string>({
  rules,
  definitions,
  onChange,
}: {
  rules: CaptionBreakRule<TRuleId>[];
  definitions: Record<TRuleId, BreakRuleDefinition>;
  onChange: (rules: CaptionBreakRule<TRuleId>[]) => void;
}): ReactNode {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const itemIds = rules.map((rule) => `caption-break-rule-${rule.id}`);
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const activeIndex = itemIds.indexOf(String(active.id));
    const overIndex = itemIds.indexOf(String(over.id));
    if (activeIndex < 0 || overIndex < 0) return;
    onChange(arrayMove(rules, activeIndex, overIndex));
  };

  const updateMode = (index: number, mode: CaptionBreakRuleMode) => {
    onChange(rules.map((rule, ruleIndex) => (ruleIndex === index ? { ...rule, mode } : rule)));
  };

  return (
    <DndContext
      autoScroll={false}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-1.5">
          {rules.map((rule, index) => (
            <SortableBreakRule
              key={itemIds[index]}
              rule={rule}
              definition={definitions[rule.id]}
              onModeChange={(mode) => updateMode(index, mode)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
