import type { VariantProps } from 'class-variance-authority';
import { ChevronDown, Info, Trash2, type LucideIcon } from 'lucide-react';
import { createContext, Fragment, useCallback, useContext, useId, useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { mutedActionButtonClass } from '@/ui/controls/muted-action-button';
import { usePopoverOutsideDismissal } from '@/ui/controls/use-popover-outside-dismissal';
import { Button, buttonVariants } from '@/ui/shadcn/button';
import { ButtonGroup } from '@/ui/shadcn/button-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/ui/shadcn/dropdown-menu';
import { Popover, PopoverAnchor, PopoverContent } from '@/ui/shadcn/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';

export interface InspectorHeaderActionConfirmation {
  title: string;
  description?: string;
  confirmLabel?: string;
  confirmVariant?: VariantProps<typeof buttonVariants>['variant'];
}

export interface InspectorHeaderAction {
  id: string;
  label: string;
  menuLabel?: string;
  icon: LucideIcon;
  onSelect?: () => void;
  render?: (context: InspectorHeaderActionRenderContext) => ReactNode;
  renderMenuItem?: (context: InspectorHeaderActionMenuItemRenderContext) => ReactNode;
  tooltip?: string;
  disabled?: boolean;
  destructive?: boolean;
  confirmation?: InspectorHeaderActionConfirmation;
  className?: string;
}

export interface InspectorHeaderActionRenderContext {
  grouped: boolean;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export interface InspectorHeaderActionMenuItemRenderContext {
  onClose: () => void;
  disabled: boolean;
}

interface InspectorHeaderMenuContextValue {
  openMenuId: string | null;
  openMenu: (menuId: string) => void;
  closeMenu: (menuId: string) => void;
  closeAllMenus: () => void;
}

const InspectorHeaderMenuContext = createContext<InspectorHeaderMenuContextValue | null>(null);

export function InspectorHeaderMenuProvider({ children }: { children: ReactNode }): ReactNode {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const openMenu = useCallback((menuId: string) => setOpenMenuId(menuId), []);
  const closeMenu = useCallback(
    (menuId: string) => setOpenMenuId((currentMenuId) => (currentMenuId === menuId ? null : currentMenuId)),
    [],
  );
  const closeAllMenus = useCallback(() => setOpenMenuId(null), []);
  return (
    <InspectorHeaderMenuContext.Provider value={{ openMenuId, openMenu, closeMenu, closeAllMenus }}>
      {children}
    </InspectorHeaderMenuContext.Provider>
  );
}

export function useInspectorHeaderMenu(menuId: string): {
  open: boolean;
  setOpen: (open: boolean) => void;
  closeOtherMenus: () => void;
} {
  const menuContext = useContext(InspectorHeaderMenuContext);
  const [localOpen, setLocalOpen] = useState(false);
  const setOpen = useCallback(
    (open: boolean): void => {
      if (menuContext) {
        if (open) menuContext.openMenu(menuId);
        else menuContext.closeMenu(menuId);
        return;
      }
      setLocalOpen(open);
    },
    [menuContext, menuId],
  );
  const closeOtherMenus = useCallback((): void => {
    menuContext?.closeAllMenus();
  }, [menuContext]);
  return {
    open: menuContext ? menuContext.openMenuId === menuId : localOpen,
    setOpen,
    closeOtherMenus,
  };
}

interface InspectorHeaderOptionsProps {
  ariaLabel: string;
  /** The preferred direct action, such as the add-effects picker. It is also the first menu action when other actions exist. */
  primaryAction?: InspectorHeaderAction;
  /** Actions that become the direct action when no primary action exists, or additional menu actions otherwise. */
  actions?: readonly InspectorHeaderAction[];
  /** Optional non-action context shown at the top of the secondary menu. */
  menuLabel?: string;
}

function canRenderAction(action: InspectorHeaderAction): boolean {
  return action.onSelect !== undefined || action.render !== undefined || action.renderMenuItem !== undefined;
}

function InspectorActionButton({
  action,
  onSelect,
  grouped,
}: {
  action: InspectorHeaderAction;
  onSelect: (action: InspectorHeaderAction) => void;
  grouped: boolean;
}): ReactNode {
  const Icon = action.icon;
  const tooltip = action.tooltip ?? action.label;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={action.label}
          title={action.tooltip ?? action.label}
          disabled={action.disabled}
          data-inspector-header-action={action.id}
          className={cn(
            mutedActionButtonClass(grouped ? 'start' : 'single', action.destructive ? 'destructive' : 'default'),
            action.className,
          )}
          onClick={(event) => {
            event.stopPropagation();
            if (action.disabled) return;
            onSelect(action);
          }}
        >
          <Icon className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-64 whitespace-pre-line">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

function InspectorHeaderConfirmation({
  action,
  onClose,
  layerId,
}: {
  action: InspectorHeaderAction;
  onClose: () => void;
  layerId: string;
}): ReactNode {
  const confirmation = action.confirmation;
  if (!confirmation) return null;

  return (
    <PopoverContent
      align="end"
      collisionPadding={8}
      dismissOnOutside={false}
      className="w-56 p-3"
      data-popover-layer-content={layerId}
      onClick={(event) => event.stopPropagation()}
    >
      <p className="text-sm font-medium">{confirmation.title}</p>
      {confirmation.description && <p className="text-muted-foreground mt-1 text-xs">{confirmation.description}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="xs" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          variant={confirmation.confirmVariant ?? 'destructive'}
          size="xs"
          onClick={() => {
            onClose();
            action.onSelect?.();
          }}
        >
          {confirmation.confirmLabel ?? 'Confirm'}
        </Button>
      </div>
    </PopoverContent>
  );
}

export function InspectorHeaderOptions({
  ariaLabel,
  primaryAction,
  actions = [],
  menuLabel,
}: InspectorHeaderOptionsProps): ReactNode {
  const executableActions = actions.filter(canRenderAction);
  const directAction = primaryAction && canRenderAction(primaryAction) ? primaryAction : executableActions[0];
  const additionalActions = directAction ? executableActions.filter((action) => action.id !== directAction.id) : [];
  const menuActions =
    directAction && (additionalActions.length > 0 || menuLabel) ? [directAction, ...additionalActions] : [];
  const menuContext = useContext(InspectorHeaderMenuContext);
  const menuId = useId();
  const [localMenuOpen, setLocalMenuOpen] = useState(false);
  const [openRenderActionId, setOpenRenderActionId] = useState<string | null>(null);
  const [confirmationAction, setConfirmationAction] = useState<InspectorHeaderAction | null>(null);
  const handleConfirmationOpenChange = useCallback((open: boolean): void => {
    if (!open) setConfirmationAction(null);
  }, []);
  const { layerId: confirmationLayerId, open: confirmationOpen, setOpen: setConfirmationOpen } =
    usePopoverOutsideDismissal(confirmationAction !== null, handleConfirmationOpenChange);
  const menuOpen = menuContext ? menuContext.openMenuId === menuId : localMenuOpen;
  const setMenuOpen = useCallback(
    (open: boolean): void => {
      if (menuContext) {
        if (open) menuContext.openMenu(menuId);
        else menuContext.closeMenu(menuId);
      } else {
        setLocalMenuOpen(open);
      }
    },
    [menuContext, menuId],
  );
  const renderActionMenuId = `${menuId}:render`;
  const renderActionOpen = menuContext
    ? menuContext.openMenuId === renderActionMenuId
    : openRenderActionId === directAction?.id;
  const setRenderActionOpen = useCallback(
    (open: boolean): void => {
      if (menuContext) {
        if (open) menuContext.openMenu(renderActionMenuId);
        else menuContext.closeMenu(renderActionMenuId);
        return;
      }
      setOpenRenderActionId(open ? (directAction?.id ?? null) : null);
    },
    [directAction?.id, menuContext, renderActionMenuId],
  );

  if (!directAction) return null;

  const selectAction = (action: InspectorHeaderAction) => {
    if (action.disabled) return;
    if (action.render) {
      if (action.id === directAction?.id) {
        setRenderActionOpen(true);
        setTimeout(() => setMenuOpen(false), 0);
      } else {
        setMenuOpen(false);
      }
      return;
    }
    if (action.confirmation) {
      setMenuOpen(false);
      setConfirmationAction(action);
      return;
    }
    action.onSelect?.();
    setMenuOpen(false);
  };

  const directControl = directAction.render ? (
    directAction.render({
      grouped: menuActions.length > 0,
      isOpen: renderActionOpen,
      onOpenChange: setRenderActionOpen,
    })
  ) : (
    <InspectorActionButton action={directAction} onSelect={selectAction} grouped={menuActions.length > 0} />
  );

  return (
    <Popover
      open={confirmationOpen}
      onOpenChange={setConfirmationOpen}
    >
      {menuActions.length > 0 ? (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverAnchor asChild>
            <ButtonGroup
              aria-label={ariaLabel}
              className="shrink-0"
            >
              {directControl}
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`More ${ariaLabel}`}
                  aria-expanded={menuOpen}
                  data-inspector-header-menu="true"
                  className={mutedActionButtonClass('end')}
                  onClick={(event) => event.stopPropagation()}
                >
                  <ChevronDown className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
            </ButtonGroup>
          </PopoverAnchor>
          <DropdownMenuContent
            align="end"
            collisionPadding={8}
            className="min-w-52"
            onClick={(event) => event.stopPropagation()}
            onCloseAutoFocus={(event) => {
              if (renderActionOpen) event.preventDefault();
            }}
          >
            {menuLabel && (
              <DropdownMenuLabel className="text-muted-foreground/70 flex items-center gap-1.5 px-2 py-1 text-[12px] font-normal">
                <Info className="size-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{menuLabel}</span>
              </DropdownMenuLabel>
            )}
            {menuActions.map((action) => {
              if (action.renderMenuItem) {
                return (
                  <Fragment key={action.id}>
                    {action.renderMenuItem({
                      onClose: () => setMenuOpen(false),
                      disabled: action.disabled === true,
                    })}
                  </Fragment>
                );
              }
              const Icon = action.icon;
              return (
                <DropdownMenuItem
                  key={action.id}
                  disabled={action.disabled}
                  variant={action.destructive ? 'destructive' : 'default'}
                  onSelect={(event) => {
                    if (action.render && action.id === directAction?.id) event.preventDefault();
                    selectAction(action);
                  }}
                >
                  <Icon className="size-3.5" />
                  <span className="truncate">{action.menuLabel ?? action.label}</span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <PopoverAnchor asChild>
          <ButtonGroup
            aria-label={ariaLabel}
            className="shrink-0"
          >
            {directControl}
          </ButtonGroup>
        </PopoverAnchor>
      )}
      {confirmationAction && (
        <InspectorHeaderConfirmation
          action={confirmationAction}
          layerId={confirmationLayerId}
          onClose={() => setConfirmationAction(null)}
        />
      )}
    </Popover>
  );
}

export function createInspectorDeleteAction(label: string, onSelect: () => void): InspectorHeaderAction {
  return {
    id: 'delete',
    label: `Delete ${label}`,
    menuLabel: 'Delete',
    icon: Trash2,
    onSelect,
    destructive: true,
    confirmation: {
      title: `Delete ${label}?`,
      description: "This can't be undone.",
      confirmLabel: 'Delete',
      confirmVariant: 'destructive',
    },
  };
}
