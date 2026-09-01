import { useCallback, useEffect, useId, useState } from 'react';
import { registerPopoverLayer } from '@/lib/popover-interactions';

export function usePopoverOutsideDismissal(
  controlledOpen?: boolean,
  onControlledOpenChange?: (open: boolean) => void,
) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const layerId = useId();
  const isControlled = controlledOpen !== undefined;
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      onControlledOpenChange?.(next);
    },
    [isControlled, onControlledOpenChange],
  );

  useEffect(() => {
    if (!open) return undefined;

    return registerPopoverLayer({ id: layerId, close: () => setOpen(false) });
  }, [layerId, open, setOpen]);

  return { layerId, open, setOpen };
}
