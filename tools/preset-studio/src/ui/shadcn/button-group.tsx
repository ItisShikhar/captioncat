import * as React from 'react';

import { cn } from '@/lib/utils';

function ButtonGroup({
  className,
  orientation = 'horizontal',
  ...props
}: React.ComponentProps<'div'> & {
  orientation?: 'horizontal' | 'vertical';
}) {
  return (
    <div
      role="group"
      data-slot="button-group"
      data-orientation={orientation}
      className={cn(
        'flex w-fit items-stretch [&>*]:relative [&>*]:focus-visible:z-10',
        orientation === 'horizontal'
          ? '[&>*:not(:first-child)]:-ml-px [&>*:not(:first-child)]:rounded-l-none [&>*:not(:last-child)]:rounded-r-none'
          : '[&>*:not(:first-child)]:-mt-px [&>*:not(:first-child)]:rounded-t-none [&>*:not(:last-child)]:rounded-b-none',
        className,
      )}
      {...props}
    />
  );
}

export { ButtonGroup };
