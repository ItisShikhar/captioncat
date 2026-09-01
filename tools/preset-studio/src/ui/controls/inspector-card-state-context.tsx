import { createContext, useCallback, useContext, useState } from 'react';

export interface InspectorCardStateContextValue {
  openState: Record<string, boolean>;
  updateOpenState: (updater: (previous: Record<string, boolean>) => Record<string, boolean>) => void;
}

export const InspectorCardStateContext = createContext<InspectorCardStateContextValue | null>(null);

export function useInspectorCardOpenState(
  stateKey: string | undefined,
  defaultOpen: boolean,
): [boolean, (next: boolean) => void] {
  const context = useContext(InspectorCardStateContext);
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const open = stateKey && context ? (context.openState[stateKey] ?? defaultOpen) : localOpen;

  const setOpen = useCallback((next: boolean) => {
    if (stateKey && context) {
      context.updateOpenState((previous) => {
        if ((previous[stateKey] ?? defaultOpen) === next) return previous;
        return { ...previous, [stateKey]: next };
      });
      return;
    }
    setLocalOpen(next);
  }, [context, defaultOpen, stateKey]);

  return [open, setOpen];
}
