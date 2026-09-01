import { closestCenter, DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { FillPatternValue } from '@captioncat/caption-engine/browser';
import { Button } from '@/ui/shadcn/button';
import { ColorInput } from './color-field';
import { DependentSetting } from './dependent-setting';
import { FieldRow } from './field-row';
import { NumberField } from './number-field';
import { SelectField } from './select-field';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';

export interface FillPatternFieldProps {
  label: string;
  value: FillPatternValue;
  onChange: (next: FillPatternValue) => void;
  description?: string;
  id?: string;
  childrenAfter?: ReactNode;
  disabled?: boolean;
  baseColor?: string;
  lockBaseColor?: boolean;
}

const OFFSET_META = { min: -1000, max: 1000, step: 1 };

interface SortableColorRowProps {
  id: string;
  index: number;
  color: string;
  onChange: (next: string) => void;
  onRemove: () => void;
  disabled: boolean;
  lockBaseColor: boolean;
}

function SortableColorRow({
  id,
  index,
  color,
  onChange,
  onRemove,
  disabled,
  lockBaseColor,
}: SortableColorRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-1 rounded-md ${isDragging ? 'bg-accent/50 z-10 shadow-sm' : ''}`}
    >
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground flex size-7 shrink-0 cursor-grab items-center justify-center rounded-md active:cursor-grabbing"
        aria-label={`Reorder color ${index + 1}`}
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>
      <ColorInput
        value={color}
        onChange={onChange}
        compact
        fullWidth
        ariaLabel={`Color ${index + 1}`}
        disabled={disabled}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={lockBaseColor && index === 0 ? 'Base color is required' : `Remove color ${index + 1}`}
        onClick={onRemove}
        disabled={disabled || (lockBaseColor && index === 0)}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

export function FillPatternField({
  label,
  value,
  onChange,
  description,
  id,
  childrenAfter,
  disabled = false,
  baseColor,
  lockBaseColor = false,
}: FillPatternFieldProps) {
  const normalizedBaseColor = typeof baseColor === 'string' && baseColor.trim().length > 0 ? baseColor : '#000000';
  const authoredColors = Array.isArray(value.colors) ? value.colors : [];
  const colors = lockBaseColor && value.pattern !== 'single' && authoredColors.length === 0 ? [normalizedBaseColor] : authoredColors;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const update = (changes: Partial<FillPatternValue>): void => {
    const next = { ...value, ...changes };
    const nextColors = Array.isArray(next.colors) ? next.colors : [];
    const requiresBaseColor = lockBaseColor && next.pattern !== 'single';
    onChange({
      ...next,
      colors: requiresBaseColor && nextColors.length === 0 ? [normalizedBaseColor] : nextColors,
    });
  };
  const handleColorDragEnd = (event: DragEndEvent): void => {
    if (!event.over || event.active.id === event.over.id) return;
    const activeIndex = Number(event.active.id);
    const overIndex = Number(event.over.id);
    if (!Number.isInteger(activeIndex) || !Number.isInteger(overIndex)) return;
    if (activeIndex < 0 || overIndex < 0 || activeIndex >= colors.length || overIndex >= colors.length) return;
    update({ colors: arrayMove(colors, activeIndex, overIndex) });
  };

  return (
    <FieldRow label={label} description={description} htmlFor={id} childrenAfter={childrenAfter}>
      <div className="w-full space-y-2">
        <SelectField
          label="Pattern"
          value={value.pattern}
          options={['single', 'cycle', 'alternate']}
          optionLabels={{ single: 'Single', cycle: 'Cycle', alternate: 'Alternate' }}
          onChange={(pattern) =>
            update({
              pattern: pattern === 'cycle' || pattern === 'alternate' ? pattern : 'single',
            })
          }
          disabled={disabled}
        />
        {value.pattern !== 'single' && (
          <DependentSetting>
            <div className="space-y-2">
              <NumberField
                label="Offset"
                value={Number.isFinite(value.offset) ? Math.trunc(value.offset) : 0}
                meta={OFFSET_META}
                onChange={(offset) => update({ offset: Math.trunc(offset) })}
                disabled={disabled}
              />
              <div className="space-y-1.5">
                <div className="text-muted-foreground text-xs font-medium">Colors</div>
                <DndContext
                  autoScroll={false}
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleColorDragEnd}
                >
                  <SortableContext
                    items={colors.map((_, index) => String(index))}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-1">
                      {colors.map((color, index) => (
                        <SortableColorRow
                          key={`color-${index}`}
                          id={String(index)}
                          index={index}
                          color={color}
                          onChange={(next) => {
                            const nextColors = [...colors];
                            nextColors[index] = next;
                            update({ colors: nextColors });
                          }}
                          onRemove={() => update({ colors: colors.filter((_, colorIndex) => colorIndex !== index) })}
                          disabled={disabled}
                          lockBaseColor={lockBaseColor}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => update({ colors: [...colors, '#000000'] })}
                  disabled={disabled || (value.pattern === 'alternate' && colors.length >= 2)}
                >
                  <Plus className="size-3.5" />
                  Add Color
                </Button>
              </div>
            </div>
          </DependentSetting>
        )}
      </div>
    </FieldRow>
  );
}
