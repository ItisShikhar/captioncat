import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export function UnsavedChangesDot({
  className,
  size = 'sm',
}: {
  className?: string;
  size?: 'sm' | 'md';
}): ReactNode {
  return (
    <span
      aria-label="Unsaved changes"
      title="Unsaved changes"
      data-slot="unsaved-changes-dot"
      className={cn(
        'inline-block shrink-0 rounded-full bg-amber-300',
        size === 'md' ? 'size-2' : 'size-1.5',
        className,
      )}
    />
  );
}
