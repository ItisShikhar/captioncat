/**
 * Shared vertical rhythm for inspector cards, fields, sections, and overlay drawers.
 * Outer card lists, drawer content, and card bodies have independent gap controls.
 */
export const INSPECTOR_VERTICAL_STACK_GAP_CLASS =
  '[--inspector-stack-gap:calc(var(--spacing)*2)] gap-[var(--inspector-stack-gap)]';
export const INSPECTOR_STACK_CLASS = `flex flex-col ${INSPECTOR_VERTICAL_STACK_GAP_CLASS}`;
export const INSPECTOR_STRUCTURAL_STACK_CLASS = 'flex flex-col';
export const INSPECTOR_CARD_CONTENT_GAP_CLASS =
  '[--inspector-card-content-gap:calc(var(--spacing)*1)] gap-[var(--inspector-card-content-gap)]';
export const INSPECTOR_CARD_CONTENT_STACK_CLASS = `flex flex-col ${INSPECTOR_CARD_CONTENT_GAP_CLASS}`;
export const INSPECTOR_FIELD_CONTENT_GAP_CLASS = 'gap-1';
export const INSPECTOR_FIELD_VERTICAL_PADDING_CLASS = 'py-1';
export const INSPECTOR_LABELED_SECTION_VERTICAL_PADDING_CLASS = INSPECTOR_FIELD_VERTICAL_PADDING_CLASS;
export const INSPECTOR_CARD_CONTENT_CLASS = 'px-3 pt-1 pb-2';
export const INSPECTOR_PANEL_HEADER_HEIGHT_CLASS = 'h-10 shrink-0';
export const INSPECTOR_CARD_HEADER_GROUP_CLASS = 'group/inspector-card-header';
export const INSPECTOR_CARD_DRAG_HANDLE_CLASS =
  'pointer-events-none opacity-0 transition-opacity duration-100 ease-out group-hover/inspector-card-header:pointer-events-auto group-hover/inspector-card-header:opacity-100 group-data-[state=open]/inspector-card-header:pointer-events-auto group-data-[state=open]/inspector-card-header:opacity-100';
export const INSPECTOR_DEPENDENT_SUBTREE_CLASS = 'border-border/60 ml-3 border-l pl-2';
export const DRAWER_VERTICAL_STACK_GAP_CLASS =
  '[--inspector-drawer-gap:calc(var(--spacing)*2)] gap-[var(--inspector-drawer-gap)]';
export const INSPECTOR_OVERLAY_DRAWER_BODY_CLASS = 'min-h-0 flex-1';
export const INSPECTOR_OVERLAY_DRAWER_VIEWPORT_CLASS = 'overflow-x-hidden';
export const INSPECTOR_OVERLAY_DRAWER_CONTENT_CLASS =
  `flex min-h-full flex-col ${DRAWER_VERTICAL_STACK_GAP_CLASS} p-4`;
export const INSPECTOR_TREE_CONNECTOR_CLASS =
  'bg-border absolute top-[calc(var(--inspector-stack-gap)*-1)] left-3 h-[calc(var(--inspector-stack-gap)*1)] w-px';
