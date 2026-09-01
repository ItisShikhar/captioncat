import {
  closestCenter,
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  pointerWithin,
  type UniqueIdentifier,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronRight, GripVertical, Image as ImageIcon, Paintbrush, Plus } from 'lucide-react';
import { memo, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils';
import { deriveStateFromBase, type EcsEntityDoc, ENTITY_STATES } from '@/schema';
import { createInspectorDeleteAction, InspectorHeaderOptions } from '@/ui/controls/inspector-header-options';
import { INSPECTOR_PANEL_HEADER_HEIGHT_CLASS } from '@/ui/controls/inspector-layout';
import { mutedActionButtonClass } from '@/ui/controls/muted-action-button';
import { Button } from '@/ui/shadcn/button';
import { ButtonGroup } from '@/ui/shadcn/button-group';
import { Card, CardContent, CardHeader, MainCardTitle } from '@/ui/shadcn/card';
import { ScrollArea } from '@/ui/shadcn/scroll-area';

import {
  asDebugKind,
  canReceiveCrossParentEntity,
  createHierarchyDragIndex,
  entityPaddingPreviewTarget,
  entityPositionPreviewTarget,
  entityTitle,
  findParentOf,
  HIERARCHY_PARENT_DROP_PREFIX,
  type HierarchyDragIndex,
  hierarchyChildren,
  hierarchyEntityBadge,
  hierarchyParentDropTargetId,
  hierarchyParentIdFromDropId,
  hierarchySelectionId,
  setHierarchyDragActive,
  updateEntityById,
} from '../entity-tree';
import { EntityAddMenu, type EntityAddStateOption } from '../inspector/entity-add-menu';
import { EntityHoverIcon } from '../shared/entity-hover-icon';
import type { DebugControls } from '../types';

/** Opacity for descendant row backgrounds in the floating `DragOverlay` preview. Text and icons remain opaque. */
const HIERARCHY_DRAG_PREVIEW_SUBTREE_BG_OPACITY = 0.55;
const HIERARCHY_DRAG_ACTIVE_CLASS = 'bg-accent text-accent-foreground';
const HIERARCHY_REORDER_HOVER_PADDING = 12;
const HIERARCHY_PARENT_DROP_STICKY_PADDING = 16;

function stateOptionsForEntity(root: EcsEntityDoc, entity: EcsEntityDoc): EntityAddStateOption[] | undefined {
  if ((entity.entity !== 'row' && entity.entity !== 'word') || entity.id !== `${entity.entity}:default`)
    return undefined;
  const parentInfo = findParentOf(root, entity.id);
  if (!parentInfo) return undefined;
  return ENTITY_STATES.map((state) => {
    const id = `${entity.entity}:${state.suffix}`;
    return {
      id,
      label: state.label,
      entity: parentInfo.parent.children.find((child) => child.id === id),
    };
  });
}

function deletableHierarchyEntityLabel(entity: EcsEntityDoc): string | null {
  if (entity.entity === 'background') return 'Background';
  if (entity.entity === 'image') return 'Image';
  if (entity.entity === 'marker') return 'Marker';
  return null;
}

function staticHierarchyEntityIcon(entity: EcsEntityDoc): ReactNode {
  if (entity.entity === 'image') {
    return <ImageIcon aria-hidden="true" className="text-muted-foreground/80 size-4 shrink-0" />;
  }
  if (entity.entity === 'background') {
    return <Paintbrush aria-hidden="true" className="text-muted-foreground/80 size-4 shrink-0" />;
  }
  return null;
}

function HierarchyDragPreviewActions({ entity }: { entity: EcsEntityDoc }): ReactNode {
  const hasMenu = deletableHierarchyEntityLabel(entity) !== null;
  return (
    <ButtonGroup
      aria-hidden="true"
      aria-label={`${entityTitle(entity)} actions`}
      className="pointer-events-none shrink-0"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        tabIndex={-1}
        className={mutedActionButtonClass(hasMenu ? 'start' : 'single')}
      >
        <Plus className="size-4 stroke-[2.4]" />
      </Button>
      {hasMenu && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          tabIndex={-1}
          aria-hidden="true"
          data-inspector-header-menu="true"
          className={mutedActionButtonClass('end')}
        >
          <ChevronDown className="size-3.5" />
        </Button>
      )}
    </ButtonGroup>
  );
}

type DragHandleAttributes = ReturnType<typeof useSortable>['attributes'];
type DragHandleListeners = ReturnType<typeof useSortable>['listeners'];
type HierarchyDroppableContainers = Parameters<CollisionDetection>[0]['droppableContainers'];
type HierarchyDroppableRects = Parameters<CollisionDetection>[0]['droppableRects'];

interface HierarchyCollisionCache {
  droppableContainers: HierarchyDroppableContainers;
  parentDropContainers: HierarchyDroppableContainers;
  sortableContainerId: UniqueIdentifier | undefined;
  sortableContainers: HierarchyDroppableContainers;
  expandedSourceDroppableRects: HierarchyDroppableRects | null;
  stickySourceDroppableRects: HierarchyDroppableRects | null;
  expandedDroppableRects: HierarchyDroppableRects;
  stickyParentDropId: string | null;
  stickyDroppableRects: HierarchyDroppableRects;
}

/**
 * Renders a hierarchy row's content - chevron, leaf marker, icon,
 * label, badge/count, and grip handle. Shared verbatim between the live,
 * interactive tree (`EntityHierarchyNode`) and the floating `DragOverlay`
 * preview (`HierarchyDragPreviewNode`) so the two can never visually drift
 * apart. Pass `interactive` for the clickable row. Omit it
 * for a purely static clone, where every element still renders (including
 * the grip handle) but is inert.
 */
function HierarchyRowContent({
  entity,
  compact,
  hasChildren,
  isExpanded,
  badge,
  icon,
  rowExtraClassName,
  showGrip,
  addButton,
  interactive,
}: {
  entity: EcsEntityDoc;
  compact: boolean;
  hasChildren: boolean;
  isExpanded: boolean;
  badge: string | null | undefined;
  icon: ReactNode;
  rowExtraClassName?: string;
  showGrip: boolean;
  addButton?: ReactNode;
  interactive?: {
    onRowClick: () => void;
    onToggleExpand: () => void;
    onLabelClick: () => void;
    gripAriaLabel: string;
    dragAttributes: DragHandleAttributes;
    dragListeners: DragHandleListeners;
  };
}): ReactNode {
  const isStatic = !interactive;
  return (
    <div
      className={cn(
        'hierarchy-row-content flex items-center gap-1.5 rounded-md leading-none transition-[background-color,padding] duration-200',
        interactive && 'cursor-pointer',
        interactive && 'hover:bg-accent hover:text-accent-foreground',
        compact ? 'px-1 py-1.5' : 'px-1.5 py-1.5',
        rowExtraClassName,
      )}
      onClick={interactive?.onRowClick}
      aria-hidden={isStatic || undefined}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {hasChildren ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            tabIndex={isStatic ? -1 : undefined}
            aria-label={isExpanded ? `Collapse ${entityTitle(entity)}` : `Expand ${entityTitle(entity)}`}
            aria-expanded={isExpanded}
            aria-controls={`${entity.id}-children`}
            className="bg-transparent hover:!bg-transparent active:!bg-transparent focus-visible:!bg-transparent dark:hover:!bg-transparent text-muted-foreground hover:text-foreground shrink-0 cursor-pointer transition-transform duration-200"
            onClick={
              interactive
                ? (e) => {
                    e.stopPropagation();
                    interactive.onToggleExpand();
                  }
                : undefined
            }
          >
            <ChevronDown
              className={cn('size-3.5 transition-transform duration-200', isExpanded ? 'rotate-0' : '-rotate-90')}
            />
          </Button>
        ) : (
          <span className="flex size-6 shrink-0 items-center justify-center" aria-hidden="true">
            <span className="size-1.5 rounded-full bg-border/70" />
          </span>
        )}
        <button
          type="button"
          tabIndex={isStatic ? -1 : undefined}
          onClick={
            interactive
              ? (e) => {
                  e.stopPropagation();
                  interactive.onLabelClick();
                }
              : undefined
          }
          className="flex min-w-0 flex-1 items-center gap-3 whitespace-nowrap text-left leading-none transition-[opacity,transform] duration-200"
        >
          <span className="flex min-w-0 flex-1 items-center gap-2.5 leading-none">
            {icon}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span
                className={cn(
                  'hierarchy-row-label min-w-0 truncate text-xs font-medium transition-[max-width,opacity,transform] duration-200',
                  compact ? 'max-w-0 overflow-hidden opacity-0 translate-x-1' : 'max-w-[18rem] opacity-100',
                )}
              >
                {entityTitle(entity)}
              </span>
              {badge ? (
                <span
                  className={cn(
                    'hierarchy-row-badge min-w-0 truncate text-[9px] font-medium tracking-[0.12em] uppercase text-muted-foreground/70 transition-[max-width,opacity,transform] duration-200',
                    compact ? 'max-w-0 overflow-hidden opacity-0 translate-x-1' : 'max-w-[8rem] opacity-100',
                  )}
                >
                  {badge}
                </span>
              ) : null}
            </span>
          </span>
        </button>
      </div>
      {addButton && <div className="hierarchy-row-actions shrink-0">{addButton}</div>}
      {showGrip && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={interactive?.gripAriaLabel ?? `Drag ${entityTitle(entity)} to reorder`}
          className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing shrink-0 bg-transparent hover:!bg-transparent active:!bg-transparent focus-visible:!bg-transparent dark:hover:!bg-transparent text-muted-foreground hover:text-foreground shrink-0 transition-transform duration-200"
          onClick={interactive ? (e) => e.stopPropagation() : undefined}
          {...(interactive?.dragAttributes ?? null)}
          {...(interactive?.dragListeners ?? null)}
        >
          <GripVertical className="size-3.5" data-drag-handle="true" />
        </Button>
      )}
    </div>
  );
}

const EntityHierarchyNode = memo(function EntityHierarchyNode({
  root,
  entity,
  selectedId,
  onSelect,
  onDeleteEntity,
  onReorderEntity,
  debug,
  depth,
  compact,
  sortable,
  sensors,
  dimSiblings,
  draggedEntityId,
  onUpdateDesign,
  onAddMarkerEntity,
  onAddBackgroundEntity,
  onAddImageEntity,
  collapsedNodeIds,
  onToggleNodeCollapsed,
}: {
  root: EcsEntityDoc;
  entity: EcsEntityDoc;
  selectedId: string;
  onSelect: (id: string) => void;
  onDeleteEntity: (id: string) => void;
  onReorderEntity: (activeId: string, overId: string) => void;
  debug: DebugControls;
  depth: number;
  compact: boolean;
  sortable: boolean;
  sensors: ReturnType<typeof useSensors>;
  dimSiblings: boolean;
  draggedEntityId: string | null;
  onUpdateDesign: (updater: (previous: EcsEntityDoc) => EcsEntityDoc) => void;
  onAddMarkerEntity: (targetId: string) => string | undefined;
  onAddBackgroundEntity: (targetId: string) => string | undefined;
  onAddImageEntity: (targetId: string) => string | undefined;
  collapsedNodeIds: Set<string>;
  onToggleNodeCollapsed: (entityId: string) => void;
}): ReactNode {
  const kind = asDebugKind(entity.entity);
  const badge = hierarchyEntityBadge(entity);
  const selected = entity.id === selectedId;
  const activeOverlay = kind
    ? debug.showAllDebugOverlays || debug.pinnedDebugEntities.includes(kind) || debug.hoveredEntity === kind
    : false;
  const childEntities = hierarchyChildren(entity.children);
  const hasChildren = childEntities.length > 0;
  const isExpanded = !collapsedNodeIds.has(entity.id);
  const pinned = kind ? debug.showAllDebugOverlays || debug.pinnedDebugEntities.includes(kind) : false;
  const parentDrop = useDroppable({
    id: hierarchyParentDropTargetId(entity.id),
    disabled: !canReceiveCrossParentEntity(entity),
    data: { type: 'hierarchy-parent', parentId: entity.id },
  });
  const sortableState = useSortable({ id: entity.id, disabled: !sortable });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortableState;
  const dragTransform = transform ? { ...transform, scaleX: 1, scaleY: 1 } : transform;
  const isDragSource = isDragging;
  const [childrenMounted, setChildrenMounted] = useState(isExpanded);
  const dimmed = dimSiblings && draggedEntityId !== null && entity.id !== draggedEntityId;
  const deletableEntityLabel = deletableHierarchyEntityLabel(entity);
  const deleteAction = deletableEntityLabel
    ? createInspectorDeleteAction(deletableEntityLabel, () => onDeleteEntity(entity.id))
    : undefined;
  const stateOptions = stateOptionsForEntity(root, entity);
  const ensureState = (stateId: string): void => {
    if (!stateOptions?.some((option) => option.id === stateId && !option.entity)) return;
    onUpdateDesign((previous) => {
      const parentInfo = findParentOf(previous, entity.id);
      if (!parentInfo || parentInfo.parent.children.some((child) => child.id === stateId)) return previous;
      const base = parentInfo.parent.children.find((child) => child.id === `${entity.entity}:default`);
      if (!base) return previous;
      const seeded = deriveStateFromBase(base, stateId);
      const children = [...parentInfo.parent.children];
      const defaultIndex = children.findIndex((child) => child.id === `${entity.entity}:default`);
      children.splice(defaultIndex >= 0 ? defaultIndex + 1 : children.length, 0, seeded);
      return updateEntityById(previous, parentInfo.parent.id, (parent) => ({ ...parent, children }));
    });
  };
  const addButton = (
    <InspectorHeaderOptions
      ariaLabel={`${entityTitle(entity)} actions`}
      primaryAction={{
        id: 'add',
        label: 'Add entities',
        menuLabel: 'Add entities',
        tooltip: 'Add Entities',
        icon: Plus,
        render: ({ grouped, isOpen, onOpenChange }) => (
          <EntityAddMenu
            entity={entity}
            onUpdateEntity={(updater) => onUpdateDesign((previous) => updateEntityById(previous, entity.id, updater))}
            onUpdateEntityForTarget={(targetId, updater) =>
              onUpdateDesign((previous) => updateEntityById(previous, targetId, updater))
            }
            onAddMarker={(targetId) => onAddMarkerEntity(targetId ?? entity.id)}
            onAddBackground={(targetId) => onAddBackgroundEntity(targetId ?? entity.id)}
            onAddImage={(targetId) => onAddImageEntity(targetId ?? entity.id)}
            stateOptions={stateOptions}
            onSelectState={ensureState}
            iconSize="small"
            triggerClassName={mutedActionButtonClass(grouped ? 'start' : 'single')}
            isOpen={isOpen}
            onOpenChange={onOpenChange}
            entitiesOnly
          />
        ),
      }}
      actions={deleteAction ? [deleteAction] : []}
    />
  );
  const staticEntityIcon = staticHierarchyEntityIcon(entity);

  useEffect(() => {
    if (isExpanded) setChildrenMounted(true);
  }, [isExpanded]);

  const rowStyle = {
    transform: CSS.Transform.toString(dragTransform),
    transition,
    opacity: dimmed ? 0.4 : undefined,
    visibility: isDragging ? 'hidden' : undefined,
  } as React.CSSProperties;

  return (
    <div
      ref={setNodeRef}
      className="flex w-full flex-col gap-1.5 select-none"
      data-hierarchy-row="true"
      data-dragging={isDragging ? 'true' : undefined}
      style={rowStyle}
    >
      <div className="relative">
        <HierarchyRowContent
          entity={entity}
          compact={compact}
          hasChildren={hasChildren}
          isExpanded={isExpanded}
          badge={badge}
          icon={
            kind ? (
              <EntityHoverIcon
                kind={kind}
                onHoverEntity={debug.onHoverEntity}
                active={pinned || (!compact && activeOverlay)}
                pinned={pinned}
                onToggleEntity={debug.onToggleDebugEntity}
                paddingPreviewTarget={entityPaddingPreviewTarget(entity)}
                onHoverPaddingPreviewTarget={debug.onHoverPaddingPreviewTarget}
                positionPreviewTarget={entityPositionPreviewTarget(entity)}
                onHoverPositionPreviewTarget={debug.onHoverPositionPreviewTarget}
                allowHover={!compact}
                interactive
              />
            ) : (
              staticEntityIcon
            )
          }
          rowExtraClassName={cn(selected && 'bg-accent text-accent-foreground')}
          showGrip={sortable}
          addButton={isDragSource ? undefined : addButton}
          interactive={{
            onRowClick: () => onSelect(entity.id),
            onLabelClick: () => onSelect(entity.id),
            onToggleExpand: () => onToggleNodeCollapsed(entity.id),
            gripAriaLabel: `Drag ${entityTitle(entity)} to reorder`,
            dragAttributes: attributes,
            dragListeners: listeners,
          }}
        />
        {canReceiveCrossParentEntity(entity) && (
          <div
            ref={parentDrop.setNodeRef}
            aria-label={`Drop an image or background into ${entityTitle(entity)}`}
            className="hierarchy-parent-drop-zone pointer-events-none absolute inset-x-0 -bottom-4 z-10 h-8 bg-transparent"
            data-hierarchy-parent-drop={entity.id}
          >
            {parentDrop.isOver && (
              <span
                className="bg-primary/70 pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2"
                aria-hidden="true"
              />
            )}
          </div>
        )}
      </div>
      {hasChildren && (
        <div
          id={`${entity.id}-children`}
          aria-hidden={!isExpanded}
          className={cn(
            'grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-out',
            isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
          )}
          onTransitionEnd={(event) => {
            if (event.target !== event.currentTarget) return;
            if (!isExpanded) setChildrenMounted(false);
          }}
        >
          <div
            className={cn(
              'hierarchy-children-rail min-h-0 overflow-hidden',
              compact ? 'pl-0' : 'border-border border-l pl-1.5',
            )}
          >
            {childrenMounted && (
              <HierarchyChildrenList
                root={root}
                children={childEntities}
                selectedId={selectedId}
                onSelect={onSelect}
                onDeleteEntity={onDeleteEntity}
                onReorderEntity={onReorderEntity}
                debug={debug}
                depth={depth + 1}
                compact={compact}
                sensors={sensors}
                draggedEntityId={draggedEntityId}
                onUpdateDesign={onUpdateDesign}
                onAddMarkerEntity={onAddMarkerEntity}
                onAddBackgroundEntity={onAddBackgroundEntity}
                onAddImageEntity={onAddImageEntity}
                collapsedNodeIds={collapsedNodeIds}
                onToggleNodeCollapsed={onToggleNodeCollapsed}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
});

/** One row within the floating `DragOverlay` tree preview - the root (depth 0) renders fully opaque, descendants render dimmed via `HIERARCHY_DRAGGED_SUBTREE_OPACITY`. Renders via the same `HierarchyRowContent` as the live tree (grip handle included, but inert) so it is a true one-to-one visual copy. */
const HierarchyDragPreviewNode = memo(function HierarchyDragPreviewNode({
  entity,
  compact,
  collapsedNodeIds,
  depth,
}: {
  entity: EcsEntityDoc;
  compact: boolean;
  collapsedNodeIds: Set<string>;
  depth: number;
}): ReactNode {
  const kind = asDebugKind(entity.entity);
  const badge = hierarchyEntityBadge(entity);
  const childEntities = hierarchyChildren(entity.children);
  const hasChildren = childEntities.length > 0;
  const isExpanded = !collapsedNodeIds.has(entity.id);
  const isRoot = depth === 0;

  return (
    <div className="flex w-full flex-col gap-1.5 select-none">
      <div className="relative">
        {/* Background kept as its own layer, separate from the row's content below, so only *it* dims for descendant rows - text/icons stay fully legible. */}
        <div
          className="bg-muted absolute inset-0 z-0 rounded-md"
          style={{ opacity: isRoot ? 1 : HIERARCHY_DRAG_PREVIEW_SUBTREE_BG_OPACITY }}
          aria-hidden="true"
        />
        <div className="relative z-10">
          <HierarchyRowContent
            entity={entity}
            compact={compact}
            hasChildren={hasChildren}
            isExpanded={isExpanded}
            badge={badge}
            icon={
              kind ? (
                <EntityHoverIcon
                  kind={kind}
                  onHoverEntity={() => {}}
                  active={false}
                  pinned={false}
                  onToggleEntity={() => {}}
                  allowHover={false}
                  interactive={false}
                />
              ) : (
                staticHierarchyEntityIcon(entity)
              )
            }
            rowExtraClassName={isRoot ? HIERARCHY_DRAG_ACTIVE_CLASS : undefined}
            showGrip
            addButton={<HierarchyDragPreviewActions entity={entity} />}
          />
        </div>
      </div>
      {hasChildren && isExpanded && (
        <div className="grid grid-rows-[1fr]">
          <div
            className={cn(
              'hierarchy-children-rail min-h-0 overflow-hidden',
              compact ? 'pl-0' : 'border-border border-l pl-1.5',
            )}
          >
            <div className="flex flex-col gap-1">
              {childEntities.map((child) => (
                <HierarchyDragPreviewNode
                  key={child.id}
                  entity={child}
                  compact={compact}
                  collapsedNodeIds={collapsedNodeIds}
                  depth={depth + 1}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

/** Floating "ghost tree" shown by `DragOverlay` while reordering - the dragged entity's entire subtree moves with it (like picking up a tree branch) instead of leaving its children behind. Sized to the dragged row's own width. */
const HierarchyDragPreview = memo(function HierarchyDragPreview({
  entity,
  compact,
  width,
  collapsedNodeIds,
}: {
  entity: EcsEntityDoc;
  compact: boolean;
  width: number;
  collapsedNodeIds: Set<string>;
}): ReactNode {
  return (
    <div className="cursor-grabbing" data-hierarchy-drag-preview="true" style={{ width: width || undefined }}>
      <HierarchyDragPreviewNode entity={entity} compact={compact} collapsedNodeIds={collapsedNodeIds} depth={0} />
    </div>
  );
});

function HierarchyChildrenList({
  root,
  children,
  selectedId,
  onSelect,
  onDeleteEntity,
  onReorderEntity,
  debug,
  depth,
  compact,
  sensors,
  draggedEntityId,
  onUpdateDesign,
  onAddMarkerEntity,
  onAddBackgroundEntity,
  onAddImageEntity,
  collapsedNodeIds,
  onToggleNodeCollapsed,
}: {
  root: EcsEntityDoc;
  children: EcsEntityDoc[];
  selectedId: string;
  onSelect: (id: string) => void;
  onDeleteEntity: (id: string) => void;
  onReorderEntity: (activeId: string, overId: string) => void;
  debug: DebugControls;
  depth: number;
  compact: boolean;
  sensors: ReturnType<typeof useSensors>;
  draggedEntityId: string | null;
  onUpdateDesign: (updater: (previous: EcsEntityDoc) => EcsEntityDoc) => void;
  onAddMarkerEntity: (targetId: string) => string | undefined;
  onAddBackgroundEntity: (targetId: string) => string | undefined;
  onAddImageEntity: (targetId: string) => string | undefined;
  collapsedNodeIds: Set<string>;
  onToggleNodeCollapsed: (entityId: string) => void;
}): ReactNode {
  const shouldDimSiblings = !!draggedEntityId && children.some((child) => child.id === draggedEntityId);

  return (
    <SortableContext
      items={children.map((child) => child.id) satisfies UniqueIdentifier[]}
      strategy={verticalListSortingStrategy}
    >
      <div className="flex flex-col gap-1">
        {children.map((child) => (
          <EntityHierarchyNode
            key={child.id}
            root={root}
            entity={child}
            selectedId={selectedId}
            onSelect={onSelect}
            onDeleteEntity={onDeleteEntity}
            onReorderEntity={onReorderEntity}
            debug={debug}
            depth={depth}
            compact={compact}
            sortable
            sensors={sensors}
            dimSiblings={shouldDimSiblings}
            draggedEntityId={draggedEntityId}
            onUpdateDesign={onUpdateDesign}
            onAddMarkerEntity={onAddMarkerEntity}
            onAddBackgroundEntity={onAddBackgroundEntity}
            onAddImageEntity={onAddImageEntity}
            collapsedNodeIds={collapsedNodeIds}
            onToggleNodeCollapsed={onToggleNodeCollapsed}
          />
        ))}
      </div>
    </SortableContext>
  );
}

/** The hierarchy column: a collapsible, sortable tree over the design's entity tree. */
export const HierarchyPanel = memo(function HierarchyPanel({
  root,
  selectedId,
  onSelect,
  onDeleteEntity,
  onReorderEntity,
  debug,
  compactWidth,
  onToggleCollapsed,
  onUpdateDesign,
  onAddMarkerEntity,
  onAddBackgroundEntity,
  onAddImageEntity,
}: {
  root: EcsEntityDoc;
  selectedId: string;
  onSelect: (id: string) => void;
  onDeleteEntity: (id: string) => void;
  onReorderEntity: (activeId: string, overId: string) => void;
  debug: DebugControls;
  compactWidth: boolean;
  onToggleCollapsed: (forceExpanded?: boolean) => void;
  onUpdateDesign: (updater: (previous: EcsEntityDoc) => EcsEntityDoc) => void;
  onAddMarkerEntity: (targetId: string) => string | undefined;
  onAddBackgroundEntity: (targetId: string) => string | undefined;
  onAddImageEntity: (targetId: string) => string | undefined;
}): ReactNode {
  const [draggedEntityId, setDraggedEntityId] = useState<string | null>(null);
  const [activeDrag, setActiveDrag] = useState<{ entity: EcsEntityDoc; width: number } | null>(null);
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(() => new Set());
  const activeParentDropIdRef = useRef<string | null>(null);
  const activeCrossParentDragRef = useRef(false);
  const activeDragIndexRef = useRef<HierarchyDragIndex | null>(null);
  const collisionCacheRef = useRef<HierarchyCollisionCache | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const hierarchyCollisionDetection = useCallback<CollisionDetection>(
    (args) => {
      const activeDragIndex = activeDragIndexRef.current;
      let collisionCache = collisionCacheRef.current;
      if (!collisionCache || collisionCache.droppableContainers !== args.droppableContainers) {
        collisionCache = {
          droppableContainers: args.droppableContainers,
          parentDropContainers: activeDragIndex
            ? args.droppableContainers.filter((container) =>
                activeDragIndex.eligibleParentDropIds.has(String(container.id)),
              )
            : [],
          sortableContainerId: undefined,
          sortableContainers: [],
          expandedSourceDroppableRects: null,
          stickySourceDroppableRects: null,
          expandedDroppableRects: new Map(),
          stickyParentDropId: null,
          stickyDroppableRects: new Map(),
        };
        collisionCacheRef.current = collisionCache;
      }
      const parentDropContainers = collisionCache.parentDropContainers;
      const parentDropCollision =
        parentDropContainers.length > 0
          ? pointerWithin({
              ...args,
              droppableContainers: parentDropContainers,
            })[0]
          : undefined;

      if (parentDropCollision) {
        activeParentDropIdRef.current = String(parentDropCollision.id);
        return [parentDropCollision];
      }

      const stickyParentDropId = activeParentDropIdRef.current;
      if (stickyParentDropId) {
        const stickyContainer = args.droppableContainers.find(
          (container) => String(container.id) === stickyParentDropId,
        );
        const stickyRect = args.droppableRects.get(stickyParentDropId);
        if (stickyContainer && stickyRect) {
          if (
            collisionCache.stickyParentDropId !== stickyParentDropId ||
            collisionCache.stickySourceDroppableRects !== args.droppableRects
          ) {
            collisionCache.stickyParentDropId = stickyParentDropId;
            collisionCache.stickySourceDroppableRects = args.droppableRects;
            collisionCache.stickyDroppableRects.clear();
            collisionCache.stickyDroppableRects.set(stickyParentDropId, {
              ...stickyRect,
              top: stickyRect.top - HIERARCHY_PARENT_DROP_STICKY_PADDING,
              bottom: stickyRect.bottom + HIERARCHY_PARENT_DROP_STICKY_PADDING,
              height: stickyRect.height + HIERARCHY_PARENT_DROP_STICKY_PADDING * 2,
            });
          }
          const stickyCollision = pointerWithin({
            ...args,
            droppableContainers: [stickyContainer],
            droppableRects: collisionCache.stickyDroppableRects,
          })[0];
          if (stickyCollision) return [stickyCollision];
        }
        activeParentDropIdRef.current = null;
      }

      if (activeCrossParentDragRef.current) return closestCenter({ ...args, droppableContainers: [] });

      const activeSortableContainerId = args.active.data.current?.sortable?.containerId;
      if (collisionCache.sortableContainerId !== activeSortableContainerId) {
        collisionCache.sortableContainerId = activeSortableContainerId;
        collisionCache.sortableContainers = args.droppableContainers.filter((container) => {
            if (String(container.id).startsWith(HIERARCHY_PARENT_DROP_PREFIX)) return false;
            return container.data.current?.sortable?.containerId === activeSortableContainerId;
          });
      }
      if (collisionCache.expandedSourceDroppableRects !== args.droppableRects) {
        collisionCache.expandedSourceDroppableRects = args.droppableRects;
        collisionCache.expandedDroppableRects.clear();
        for (const container of collisionCache.sortableContainers) {
          const rect = args.droppableRects.get(container.id);
          if (!rect) continue;
          collisionCache.expandedDroppableRects.set(container.id, {
            ...rect,
            top: rect.top - HIERARCHY_REORDER_HOVER_PADDING,
            bottom: rect.bottom + HIERARCHY_REORDER_HOVER_PADDING,
            height: rect.height + HIERARCHY_REORDER_HOVER_PADDING * 2,
          });
        }
      }

      const expandedCollision = pointerWithin({
        ...args,
        droppableContainers: collisionCache.sortableContainers,
        droppableRects: collisionCache.expandedDroppableRects,
      });
      if (expandedCollision.length > 0) return [expandedCollision[0]];

      return closestCenter({
        ...args,
        droppableContainers: collisionCache.sortableContainers,
      });
    },
    [root],
  );

  useEffect(
    () => () => {
      setHierarchyDragActive(false);
    },
    [],
  );

  const onDragStart = useCallback(
    (event: DragStartEvent) => {
      setHierarchyDragActive(true);
      activeParentDropIdRef.current = null;
      debug.onHoverEntity(null);
      const dragIndex = createHierarchyDragIndex(root, String(event.active.id));
      activeDragIndexRef.current = dragIndex ?? null;
      activeCrossParentDragRef.current = Boolean(dragIndex && dragIndex.eligibleParentDropIds.size > 0);
      collisionCacheRef.current = null;
      setDraggedEntityId(String(event.active.id));
      if (dragIndex) {
        setActiveDrag({
          entity: dragIndex.activeEntity,
          width: event.active.rect.current.initial?.width ?? 0,
        });
      }
    },
    [debug, root, setHierarchyDragActive],
  );

  const clearDragState = useCallback(() => {
    setHierarchyDragActive(false);
    activeParentDropIdRef.current = null;
    activeCrossParentDragRef.current = false;
    activeDragIndexRef.current = null;
    collisionCacheRef.current = null;
    setDraggedEntityId(null);
    debug.onHoverEntity(null);
    setActiveDrag(null);
  }, [debug, setHierarchyDragActive]);

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const overId = event.over ? String(event.over.id) : undefined;
      clearDragState();
      if (!overId || String(event.active.id) === overId) return;
      onReorderEntity(String(event.active.id), overId);
    },
    [clearDragState, onReorderEntity],
  );

  const onDragCancel = useCallback(() => {
    clearDragState();
  }, [clearDragState]);

  useEffect(() => {
    const ancestorIds = new Set<string>();
    let currentId = selectedId;
    while (currentId !== root.id) {
      const parentInfo = findParentOf(root, currentId);
      if (!parentInfo) break;
      ancestorIds.add(parentInfo.parent.id);
      currentId = parentInfo.parent.id;
    }
    if (ancestorIds.size === 0) return;

    setCollapsedNodeIds((previous) => {
      const next = new Set(previous);
      let changed = false;
      for (const ancestorId of ancestorIds) {
        if (next.delete(ancestorId)) changed = true;
      }
      return changed ? next : previous;
    });
  }, [root, selectedId]);

  const onToggleNodeCollapsed = useCallback((entityId: string) => {
    setCollapsedNodeIds((previous) => {
      const next = new Set(previous);
      if (next.has(entityId)) {
        next.delete(entityId);
      } else {
        next.add(entityId);
      }
      return next;
    });
  }, []);

  // The panel width and its container queries control the compact row presentation.
  const compactRows = compactWidth;
  const visuallyCollapsed = compactWidth;
  useEffect(() => {
    if (!compactRows) return;
    debug.onHoverEntity(null);
    debug.onHoverPaddingPreviewTarget(null);
    debug.onHoverPositionPreviewTarget(null);
  }, [compactRows, debug.onHoverEntity, debug.onHoverPaddingPreviewTarget, debug.onHoverPositionPreviewTarget]);
  const toggleCollapsed = () => {
    if (compactWidth) {
      onToggleCollapsed(true);
      return;
    }
    onToggleCollapsed();
  };

  return (
    <Card
      className={cn(
        'hierarchy-panel flex h-fit max-h-[calc(100vh-1.5rem)] min-h-0 flex-col self-start gap-0 overflow-hidden py-0',
      )}
    >
      <CardHeader
        className={cn('relative flex cursor-pointer items-center gap-3', INSPECTOR_PANEL_HEADER_HEIGHT_CLASS)}
        onClick={toggleCollapsed}
      >
        <MainCardTitle className={cn('hierarchy-panel-title min-w-0 flex-1 select-none', compactRows && 'invisible')}>
          Hierarchy
        </MainCardTitle>
        <button
          type="button"
          aria-label={visuallyCollapsed ? 'Expand hierarchy' : 'Collapse hierarchy'}
          aria-expanded={!visuallyCollapsed}
          onClick={(e) => {
            e.stopPropagation();
            toggleCollapsed();
          }}
          className={cn(
            'hierarchy-panel-toggle text-muted-foreground hover:text-foreground flex size-6 shrink-0 items-center justify-center rounded',
            compactRows ? 'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2' : 'ml-auto',
          )}
        >
          <ChevronRight className="hierarchy-panel-side-toggle size-4" />
        </button>
      </CardHeader>
      <CardContent
        className="hierarchy-panel-body flex min-h-0 flex-1 overflow-hidden p-2 pr-1"
        onMouseLeave={() => debug.onHoverEntity(null)}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={hierarchyCollisionDetection}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
        >
          <ScrollArea className="min-h-0 flex-1" viewportClassName="overflow-x-hidden pr-1">
            <EntityHierarchyNode
              root={root}
              entity={root}
              selectedId={hierarchySelectionId(root, selectedId)}
              onSelect={onSelect}
              onDeleteEntity={onDeleteEntity}
              onReorderEntity={onReorderEntity}
              debug={debug}
              depth={0}
              compact={compactRows}
              sortable={false}
              sensors={sensors}
              dimSiblings={false}
              draggedEntityId={draggedEntityId}
              onUpdateDesign={onUpdateDesign}
              onAddMarkerEntity={onAddMarkerEntity}
              onAddBackgroundEntity={onAddBackgroundEntity}
              onAddImageEntity={onAddImageEntity}
              collapsedNodeIds={collapsedNodeIds}
              onToggleNodeCollapsed={onToggleNodeCollapsed}
            />
          </ScrollArea>
          {createPortal(
            // Keep the fixed overlay outside the blurred card's containing block.
            <DragOverlay dropAnimation={null}>
              {activeDrag && (
                <HierarchyDragPreview
                  entity={activeDrag.entity}
                  compact={compactRows}
                  width={activeDrag.width}
                  collapsedNodeIds={collapsedNodeIds}
                />
              )}
            </DragOverlay>,
            document.body,
          )}
        </DndContext>
      </CardContent>
    </Card>
  );
});
