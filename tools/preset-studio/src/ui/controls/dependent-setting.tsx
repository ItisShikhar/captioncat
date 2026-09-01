import type { ReactNode } from 'react';

export function DependentSetting({ children }: { children: ReactNode }): ReactNode {
  return <div className="border-border/60 ml-3 border-l-2 pl-3">{children}</div>;
}
