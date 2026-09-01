import { cn } from '@/lib/utils';
import { Button } from '@/ui/shadcn/button';
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';

export type ColorSwatchButtonProps = Omit<
  ComponentPropsWithoutRef<'button'>,
  'children' | 'className' | 'disabled' | 'id' | 'type'
> & {
  id?: string;
  layerId: string;
  ariaLabel: string;
  sizeClassName: string;
  className?: string;
  disabled?: boolean;
  children: ReactNode;
};

export const ColorSwatchButton = forwardRef<HTMLButtonElement, ColorSwatchButtonProps>(function ColorSwatchButton(
  { id, layerId, ariaLabel, sizeClassName, className, disabled = false, children, ...buttonProps },
  ref,
) {
  return (
    <Button
      {...buttonProps}
      ref={ref}
      id={id}
      type="button"
      variant="outline"
      size="icon"
      data-popover-layer-trigger={layerId}
      className={cn('shrink-0', sizeClassName, 'bg-background dark:bg-background', className, 'p-0')}
      aria-label={ariaLabel}
      disabled={disabled}
    >
      <span className="relative h-full w-full overflow-hidden rounded-sm">{children}</span>
    </Button>
  );
});
