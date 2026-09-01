import { cn } from '@/lib/utils';

export const MUTED_ACTION_SHELL_CLASS = 'border-input flex items-center rounded-md border px-2 py-1';
export const MUTED_ACTION_GROUP_CLASS = `${MUTED_ACTION_SHELL_CLASS} gap-1.5`;

export type MutedActionButtonPosition = 'single' | 'start' | 'end';
export type MutedActionButtonTone = 'default' | 'primary' | 'destructive' | 'plain';

const ACTION_BUTTON_SURFACES: Record<MutedActionButtonTone, string> = {
  default:
    'bg-muted-foreground/10 text-muted-foreground hover:!bg-muted-foreground/20 dark:hover:!bg-muted-foreground/30',
  primary:
    'bg-muted-foreground/10 text-primary hover:!bg-muted-foreground/20 dark:hover:!bg-muted-foreground/30 hover:text-primary',
  destructive:
    'bg-muted-foreground/10 text-destructive hover:!bg-destructive/10 dark:hover:!bg-destructive/20 hover:text-destructive',
  plain: 'text-muted-foreground hover:text-foreground',
};

const ACTION_BUTTON_RADII: Record<MutedActionButtonPosition, string> = {
  single: 'rounded-md',
  start: 'rounded-l-md rounded-r-none',
  end: 'rounded-l-none rounded-r-md',
};

export function mutedActionButtonClass(
  position: MutedActionButtonPosition,
  tone: MutedActionButtonTone = 'default',
  className?: string,
): string {
  return cn(ACTION_BUTTON_SURFACES[tone], ACTION_BUTTON_RADII[position], className);
}
