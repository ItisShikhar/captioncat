"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { isPopoverPortalInteraction } from "@/lib/popover-interactions"

type PopoverContentProps = React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
  dismissOnOutside?: boolean
}

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  PopoverContentProps
>(function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  collisionPadding = 12,
  dismissOnOutside = true,
  onPointerDownOutside,
  onInteractOutside,
  onPointerDown,
  ...props
}, ref) {
  const handlePointerDownOutside: PopoverContentProps['onPointerDownOutside'] = (event) => {
    if (!dismissOnOutside || isPopoverPortalInteraction(event.target)) event.preventDefault();
    onPointerDownOutside?.(event);
  };
  const handleInteractOutside: PopoverContentProps['onInteractOutside'] = (event) => {
    if (!dismissOnOutside || isPopoverPortalInteraction(event.target)) event.preventDefault();
    onInteractOutside?.(event);
  };
  const handlePointerDown: React.PointerEventHandler<HTMLDivElement> = (event) => {
    event.stopPropagation();
    onPointerDown?.(event);
  };

  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        data-slot="popover-content"
        data-preview-interactive-control="true"
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        onPointerDownOutside={handlePointerDownOutside}
        onInteractOutside={handleInteractOutside}
        onPointerDown={handlePointerDown}
        className={cn(
          "z-50 max-h-(--radix-popover-content-available-height) max-w-[calc(100vw-1.5rem)] min-w-0 w-72 origin-(--radix-popover-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-hidden max-[640px]:!min-w-0 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
})

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-1 text-sm", className)}
      {...props}
    />
  )
}

function PopoverTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <div
      data-slot="popover-title"
      className={cn("font-medium", className)}
      {...props}
    />
  )
}

function PopoverDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="popover-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
}
