import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';
import { LockKeyhole } from 'lucide-react';
import type { ReactNode } from 'react';

export type PropertyOverrideType =
  | 'animation'
  | 'component'
  | 'effect'
  | 'engine'
  | 'inherited'
  | 'layout'
  | 'randomizer'
  | 'system';

export interface PropertyOverrideSource {
  source: string;
  type: PropertyOverrideType;
  chain?: readonly string[];
}

export interface PropertyLockState {
  locked: true;
  value: unknown;
  override: PropertyOverrideSource;
}

export type PropertyLockAxis = 'x' | 'y';
export type PropertyLockMap = Partial<Record<PropertyLockAxis, PropertyLockState | null>>;
export type PropertyLock = PropertyLockState | PropertyLockMap;

export function isPropertyLockState(lock: PropertyLock | null | undefined): lock is PropertyLockState {
  return Boolean(lock && 'locked' in lock);
}

export function propertyLockForAxis(
  lock: PropertyLock | null | undefined,
  axis: PropertyLockAxis,
): PropertyLockState | null {
  if (!lock) return null;
  return isPropertyLockState(lock) ? lock : (lock[axis] ?? null);
}

export function propertyLockIsLocked(lock: PropertyLock | null | undefined): boolean {
  if (!lock) return false;
  if (isPropertyLockState(lock)) return lock.locked;
  return lock.x?.locked === true || lock.y?.locked === true;
}

export interface ResolvedPropertyMetadata {
  value: unknown;
  source: string;
  type: PropertyOverrideType;
  chain?: readonly string[];
}

export function propertyLockFromMetadata(metadata: ResolvedPropertyMetadata | undefined): PropertyLockState | null {
  if (!metadata) return null;
  return {
    locked: true,
    value: metadata.value,
    override: {
      source: metadata.source,
      type: metadata.type,
      chain: metadata.chain,
    },
  };
}

export function propertyLockFromAnimation(value: unknown): PropertyLockState {
  return {
    locked: true,
    value,
    override: {
      source: 'Animation',
      type: 'animation',
    },
  };
}

export function propertyLockDescription(lock: PropertyLockState): string {
  if (lock.override.type === 'animation') {
    return 'Controlled by Animation. Disable Animation component or track to edit this.';
  }
  const chain = lock.override.chain;
  const source = lock.override.source;
  if (chain && chain.length > 0) {
    return `Controlled by ${chain.join(' -> ')}`;
  }
  return `Controlled by ${source}`;
}

export function PropertyLockIndicator({
  lock,
  className = 'size-3.5',
}: {
  lock?: PropertyLockState | null;
  className?: string;
}): ReactNode {
  if (!lock?.locked) return null;
  const description = propertyLockDescription(lock);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={description}
          title={description}
          className="text-muted-foreground/80 inline-flex shrink-0 items-center justify-center opacity-80 transition-colors hover:text-foreground/80"
        >
          <LockKeyhole className={className} aria-hidden="true" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {description}
      </TooltipContent>
    </Tooltip>
  );
}
