import { useContext, type ReactNode } from 'react';

import { FieldLabelExtraContext } from '@/ui/controls/field-row';
import { Button } from '@/ui/shadcn/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';

import {
  AnimationTrackNavigationContext,
  type AnimationTrackNavigationTarget,
} from '../animation-track-navigation';
import { MotionIcon } from './motion-icon';

export function AnimationTrackButton({ target }: { target: AnimationTrackNavigationTarget }): ReactNode {
  const context = useContext(AnimationTrackNavigationContext);
  if (!context) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="rounded-md bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 hover:text-yellow-300"
          aria-label="View animation track"
          onClick={(event) => {
            event.stopPropagation();
            context.navigateToTrack(target);
          }}
        >
          <MotionIcon className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        View animation track
      </TooltipContent>
    </Tooltip>
  );
}

export function AnimationTrackLabelExtra({
  scopeKey,
  propertyPath,
  children,
}: {
  scopeKey: string;
  propertyPath: readonly string[];
  children: ReactNode;
}): ReactNode {
  const context = useContext(AnimationTrackNavigationContext);
  const parentExtra = useContext(FieldLabelExtraContext);
  const target = context?.targetFor(scopeKey, propertyPath);
  return (
    <FieldLabelExtraContext.Provider
      value={
        <>
          {parentExtra}
          {target ? <AnimationTrackButton target={target} /> : null}
        </>
      }
    >
      {children}
    </FieldLabelExtraContext.Provider>
  );
}
