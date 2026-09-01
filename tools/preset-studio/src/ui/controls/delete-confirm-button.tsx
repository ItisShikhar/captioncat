import type { ReactNode } from 'react';
import { Trash2 } from 'lucide-react';

import { ConfirmPopoverButton } from '@/ui/controls/confirm-popover-button';
import { mutedActionButtonClass } from '@/ui/controls/muted-action-button';

/** Trash icon that opens a confirmation popover before it removes a component or effect. */
export function DeleteConfirmButton({ label, onConfirm }: { label: string; onConfirm: () => void }): ReactNode {
  return (
    <ConfirmPopoverButton
      icon={Trash2}
      ariaLabel={`Delete ${label}`}
      title={`Delete ${label}?`}
      description="This can't be undone."
      confirmLabel="Delete"
      confirmVariant="destructive"
      onConfirm={onConfirm}
      className={mutedActionButtonClass('single', 'destructive', '-m-1')}
    />
  );
}
