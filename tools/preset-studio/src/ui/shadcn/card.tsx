import * as React from 'react';

import { cn } from '@/lib/utils';

const CARD_HEADER_BASE =
  '@container/card-header bg-card dark:bg-muted grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-4 py-3 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-4 ';
const CARD_HEADER_SHADOW = ''; //;'shadow-[0_0_8px_0_oklch(0_0_0_/_0.08)] dark:shadow-[0_0_8px_0_oklch(0_0_0_/_0.25)]';
const CARD_SURFACE_CLASS =
  'flex flex-col gap-4 rounded-lg border bg-background/70 backdrop-blur-md py-4 text-card-foreground shadow-sm';
const SUB_CARD_SURFACE_CLASS = 'flex flex-col gap-4 rounded-lg border bg-card/70 py-4 text-card-foreground shadow-sm';

function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card" className={cn(CARD_SURFACE_CLASS, className)} {...props} />;
}

function SubCard({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="sub-card" className={cn(SUB_CARD_SURFACE_CLASS, className)} {...props} />;
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-header" className={cn(CARD_HEADER_BASE, CARD_HEADER_SHADOW, className)} {...props} />;
}

function SubCardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-sub-header" className={cn(CARD_HEADER_BASE, className)} {...props} />;
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-title" className={cn('leading-none text-sm font-medium', className)} {...props} />;
}

function MainCardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-main-title"
      className={cn('tracking-wide leading-none text-xs font-semibold uppercase text-muted-foreground', className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-description" className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-4', className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="card-footer" className={cn('flex items-center px-4 [.border-t]:pt-4', className)} {...props} />
  );
}

export {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  MainCardTitle,
  SubCard,
  SubCardHeader,
};
