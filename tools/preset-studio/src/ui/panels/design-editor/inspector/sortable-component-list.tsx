import { closestCenter, DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { type ReactNode } from 'react';

import { orderComponentsWithDependencies, type EcsComponentDoc } from '@/schema';
import { humanizeFieldKey } from '@/ui/controls/field-row';
import { INSPECTOR_CARD_DRAG_HANDLE_CLASS, INSPECTOR_STACK_CLASS } from '@/ui/controls/inspector-layout';
import { mutedActionButtonClass } from '@/ui/controls/muted-action-button';

function componentDragId(component: EcsComponentDoc, index: number): string {
  return component.studioId ?? `component-${component.component}-${index}`;
}

function SortableComponentItem({
  component,
  index,
  children,
  onItemRef,
}: {
  component: EcsComponentDoc;
  index: number;
  children: (dragHandle: ReactNode) => ReactNode;
  onItemRef?: (componentId: string, element: HTMLDivElement | null) => void;
}): ReactNode {
  const id = componentDragId(component, index);
  const reorderable =
    component.component !== 'transform' && component.dependencyOf === undefined && component.attachedTo === undefined;
  const title = humanizeFieldKey(component.component);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !reorderable,
  });
  const dragHandle = reorderable ? (
    <button
      type="button"
      aria-label={`Drag ${title} to reorder`}
      onClick={(event) => event.stopPropagation()}
      className={mutedActionButtonClass(
        'single',
        'plain',
        `${INSPECTOR_CARD_DRAG_HANDLE_CLASS} -m-1 cursor-grab active:cursor-grabbing`,
      )}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="size-3.5" />
    </button>
  ) : null;

  return (
    <div
      ref={(element) => {
        setNodeRef(element);
        onItemRef?.(id, element);
      }}
      style={{ transform: CSS.Translate.toString(transform ? { ...transform, x: 0 } : null), transition }}
      className={
        isDragging
          ? 'relative z-10 w-full min-w-0 scroll-mt-6 opacity-70'
          : 'relative w-full min-w-0 scroll-mt-6'
      }
    >
      {children(dragHandle)}
    </div>
  );
}

export function SortableComponentList({
  components,
  onReorder,
  children,
  onItemRef,
  renderAfterDependencySubtree,
}: {
  components: EcsComponentDoc[];
  onReorder: (components: EcsComponentDoc[]) => void;
  children: (component: EcsComponentDoc, index: number, dragHandle: ReactNode, componentId: string) => ReactNode;
  onItemRef?: (componentId: string, element: HTMLDivElement | null) => void;
  renderAfterDependencySubtree?: (
    component: EcsComponentDoc,
    index: number,
    componentId: string,
  ) => ReactNode;
}): ReactNode {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const ids = components.map(componentDragId);
  const groups = dependencyGroups(components);
  const trailingByIndex = new Map<number, { component: EcsComponentDoc; index: number; componentId: string }[]>();
  if (renderAfterDependencySubtree) {
    components.forEach((component, index) => {
      if (component.components.length === 0) return;
      const endIndex = dependencySubtreeEndIndex(components, index);
      const entries = trailingByIndex.get(endIndex) ?? [];
      entries.push({ component, index, componentId: ids[index] });
      trailingByIndex.set(endIndex, entries);
    });
  }

  const onDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return;
    const activeGroup = groups.find((group) => ids[group.start] === String(event.active.id));
    const overGroup = groups.find((group) => ids[group.start] === String(event.over?.id));
    if (!activeGroup || !overGroup) return;
    const activeIndex = activeGroup.start;
    const overIndex = overGroup.start;
    onReorder(orderComponentsWithDependencies(arrayMove(components, activeIndex, overIndex)));
  };

  return (
    <DndContext autoScroll={false} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={groups.map((group) => ids[group.start])} strategy={verticalListSortingStrategy}>
        {groups.map(({ start, end }) => {
          const root = components[start];
          if (!root) return null;
          return (
            <SortableComponentItem key={ids[start]} component={root} index={start} onItemRef={onItemRef}>
              {(dragHandle) => (
                <div className={INSPECTOR_STACK_CLASS}>
                  {children(root, start, dragHandle, ids[start])}
                  {Array.from({ length: end - start }, (_, offset) => {
                    const index = start + offset + 1;
                    const component = components[index];
                    if (!component) return null;
                    return (
                      <div
                        key={ids[index]}
                        ref={(element) => onItemRef?.(ids[index], element)}
                        className={`relative w-full min-w-0 scroll-mt-6 ${INSPECTOR_STACK_CLASS}`}
                      >
                        {children(component, index, null, ids[index])}
                        {trailingByIndex.get(index)?.map((entry) =>
                          renderAfterDependencySubtree?.(entry.component, entry.index, entry.componentId),
                        )}
                      </div>
                    );
                  })}
                  {start === end &&
                    trailingByIndex.get(start)?.map((entry) =>
                      renderAfterDependencySubtree?.(entry.component, entry.index, entry.componentId),
                    )}
                </div>
              )}
            </SortableComponentItem>
          );
        })}
      </SortableContext>
    </DndContext>
  );
}

function dependencyParent(component: EcsComponentDoc): string | undefined {
  return component.attachedTo ?? component.dependencyOf;
}

function dependencySubtreeEndIndex(components: readonly EcsComponentDoc[], ownerIndex: number): number {
  const owner = components[ownerIndex];
  if (!owner) return ownerIndex;
  const dependencyTypes = new Set([owner.component]);
  let endIndex = ownerIndex;
  for (let index = ownerIndex + 1; index < components.length; index += 1) {
    const candidate = components[index];
    const parent = dependencyParent(candidate);
    if (!parent || !dependencyTypes.has(parent)) break;
    dependencyTypes.add(candidate.component);
    endIndex = index;
  }
  return endIndex;
}

function dependencyGroups(components: readonly EcsComponentDoc[]): { start: number; end: number }[] {
  const groups: { start: number; end: number }[] = [];
  for (let start = 0; start < components.length; ) {
    const end = dependencySubtreeEndIndex(components, start);
    groups.push({ start, end });
    start = end + 1;
  }
  return groups;
}
