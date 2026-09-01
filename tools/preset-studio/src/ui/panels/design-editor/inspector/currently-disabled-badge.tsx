import type { ReactNode } from 'react';

export function CurrentlyDisabledBadge(): ReactNode {
  return (
    <span className="bg-muted text-muted-foreground inline-flex shrink-0 rounded px-1 py-0.5 text-[9px] font-medium tracking-wide uppercase">
      CURRENTLY DISABLED
    </span>
  );
}
