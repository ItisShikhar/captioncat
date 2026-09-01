import type { ReactElement, ReactNode } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';
import { disabledObjectLabel, type DisabledObjectType } from './disabled-state-labels';

export type { DisabledObjectType } from './disabled-state-labels';

export function DisabledStateTooltip({
  objectType,
  disabled = true,
  reason,
  children,
}: {
  objectType: DisabledObjectType;
  disabled?: boolean;
  reason?: string;
  children: ReactElement;
}): ReactNode {
  if (!disabled) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top">{reason ?? disabledObjectLabel(objectType)}</TooltipContent>
    </Tooltip>
  );
}
