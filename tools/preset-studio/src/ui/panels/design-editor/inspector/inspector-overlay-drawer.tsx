import { ArrowLeft } from 'lucide-react';
import { Dialog as DrawerPrimitive } from 'radix-ui';
import type { ReactNode, Ref } from 'react';

import { cn } from '@/lib/utils';
import {
  DRAWER_VERTICAL_STACK_GAP_CLASS,
  INSPECTOR_OVERLAY_DRAWER_CONTENT_CLASS,
  INSPECTOR_OVERLAY_DRAWER_BODY_CLASS,
  INSPECTOR_OVERLAY_DRAWER_VIEWPORT_CLASS,
} from '@/ui/controls/inspector-layout';
import { useInspectorOverlayPortal } from '@/ui/panels/design-editor/shared/inspector-overlay-portal';
import { ScrollArea } from '@/ui/shadcn/scroll-area';

interface InspectorOverlayDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `data-slot` attribute placed on the drawer content element. */
  dataSlot: string;
  title: string;
  description: string;
  /** Optional extra description line rendered below the main description. */
  subDescription?: string;
  /** Rendered in the top-right of the header, e.g. an add-menu button. */
  headerAction?: ReactNode;
  /** Called after the open animation completes on the content element. */
  onAnimationEnd?: React.AnimationEventHandler<HTMLDivElement>;
  children: ReactNode;
}

interface InspectorOverlayDrawerBodyProps {
  children: ReactNode;
  viewportRef?: Ref<HTMLDivElement>;
}

export function InspectorOverlayDrawerBody({ children, viewportRef }: InspectorOverlayDrawerBodyProps) {
  return (
    <ScrollArea
      className={INSPECTOR_OVERLAY_DRAWER_BODY_CLASS}
      viewportClassName={INSPECTOR_OVERLAY_DRAWER_VIEWPORT_CLASS}
      viewportContentClassName={INSPECTOR_OVERLAY_DRAWER_CONTENT_CLASS}
      viewportRef={viewportRef}
    >
      {children}
    </ScrollArea>
  );
}

/**
 * A full-overlay drawer that mounts inside the inspector column via
 * `InspectorOverlayPortalContext`. All three inspector drawers
 * (animation tracks, effects, typewriter tracks) use this component.
 */
export function InspectorOverlayDrawer({
  open,
  onOpenChange,
  dataSlot,
  title,
  description,
  subDescription,
  headerAction,
  onAnimationEnd,
  children,
}: InspectorOverlayDrawerProps) {
  const portalContainer = useInspectorOverlayPortal();

  return (
    <DrawerPrimitive.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <DrawerPrimitive.Portal container={portalContainer ?? undefined}>
        <DrawerPrimitive.Content
          data-slot={dataSlot}
          className="absolute inset-0 z-30 flex flex-col overflow-hidden rounded-lg border bg-popover text-sm text-popover-foreground outline-none duration-200 data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=open]:fade-in-0"
          onInteractOutside={(event) => event.preventDefault()}
          onAnimationEnd={onAnimationEnd}
        >
          <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
            <div className="flex min-w-0 items-start gap-2">
              <DrawerPrimitive.Close asChild>
                <button
                  type="button"
                  aria-label="Back"
                  className="text-muted-foreground hover:text-foreground mt-0.5 flex size-6 shrink-0 items-center justify-center transition-colors"
                >
                  <ArrowLeft className="size-4" />
                </button>
              </DrawerPrimitive.Close>
              <div className={cn('min-w-0 flex flex-col', DRAWER_VERTICAL_STACK_GAP_CLASS)}>
                <DrawerPrimitive.Title className="font-heading text-base font-medium text-foreground">
                  {title}
                </DrawerPrimitive.Title>
                <DrawerPrimitive.Description className="text-sm text-muted-foreground">
                  {description}
                </DrawerPrimitive.Description>
                {subDescription && <p className="text-muted-foreground/70 text-xs">{subDescription}</p>}
              </div>
            </div>
            {headerAction && <div className="flex shrink-0 items-center gap-1">{headerAction}</div>}
          </div>
          {children}
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}
