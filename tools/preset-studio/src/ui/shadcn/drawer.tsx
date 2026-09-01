import * as React from 'react';
import { Drawer as DrawerPrimitive } from 'vaul';

import { cn } from '@/lib/utils';
import { DRAWER_VERTICAL_STACK_GAP_CLASS } from '@/ui/controls/inspector-layout';

function Drawer({ shouldScaleBackground = true, ...props }: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  return <DrawerPrimitive.Root data-slot="drawer" shouldScaleBackground={shouldScaleBackground} {...props} />;
}

function DrawerTrigger({ ...props }: React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

function DrawerPortal({ ...props }: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />;
}

function DrawerClose({ ...props }: React.ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

function DrawerOverlay({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
  return (
    <DrawerPrimitive.Overlay
      data-slot="drawer-overlay"
      className={cn('fixed inset-0 z-50 bg-black/25 backdrop-blur-sm', className)}
      {...props}
    />
  );
}

function DrawerContent({ className, children, ...props }: React.ComponentProps<typeof DrawerPrimitive.Content>) {
  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DrawerPrimitive.Content
        data-slot="drawer-content"
        className={cn(
          'bg-background group/drawer-content fixed z-[60] flex h-auto flex-col',
          'inset-x-0 bottom-0 mt-24 max-h-[calc(100%-6rem)] rounded-t-xl border-t shadow-lg outline-none',
          'data-[vaul-drawer-direction=right]:top-4 data-[vaul-drawer-direction=right]:right-4 data-[vaul-drawer-direction=right]:bottom-4 data-[vaul-drawer-direction=right]:left-auto',
          'data-[vaul-drawer-direction=right]:mt-0 data-[vaul-drawer-direction=right]:max-h-none data-[vaul-drawer-direction=right]:w-[min(23rem,calc(100%-2rem))]',
          'data-[vaul-drawer-direction=right]:rounded-xl data-[vaul-drawer-direction=right]:border data-[vaul-drawer-direction=right]:shadow-2xl',
          'data-[vaul-drawer-direction=left]:top-4 data-[vaul-drawer-direction=left]:right-auto data-[vaul-drawer-direction=left]:bottom-4 data-[vaul-drawer-direction=left]:left-4',
          'data-[vaul-drawer-direction=left]:mt-0 data-[vaul-drawer-direction=left]:max-h-none data-[vaul-drawer-direction=left]:w-[min(23rem,calc(100%-2rem))]',
          'data-[vaul-drawer-direction=left]:rounded-xl data-[vaul-drawer-direction=left]:border data-[vaul-drawer-direction=left]:shadow-2xl',
          className,
        )}
        {...props}
      >
        <div className="bg-muted mx-auto mt-4 hidden h-2 w-[100px] shrink-0 rounded-full group-data-[vaul-drawer-direction=bottom]/drawer-content:block" />
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  );
}

function DrawerHandle({ ...props }: React.ComponentProps<typeof DrawerPrimitive.Handle>) {
  return <DrawerPrimitive.Handle data-slot="drawer-handle" {...props} />;
}

function DrawerHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="drawer-header" className={cn('flex flex-col', DRAWER_VERTICAL_STACK_GAP_CLASS, 'p-4', className)} {...props} />;
}

function DrawerFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="drawer-footer" className={cn('mt-auto flex flex-col', DRAWER_VERTICAL_STACK_GAP_CLASS, 'p-4', className)} {...props} />;
}

function DrawerTitle({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn('text-foreground font-semibold', className)}
      {...props}
    />
  );
}

function DrawerDescription({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

export {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHandle,
  DrawerHeader,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger,
};