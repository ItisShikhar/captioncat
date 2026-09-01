import { createContext, useContext } from 'react';

/**
 * DOM node the floating effects drawer portals into: the wrapper that spans
 * the state-family navigator + inspector column (see `DesignEditor`), so the
 * drawer's bounds exactly match that column's width and height instead of
 * the full viewport.
 */
export const InspectorOverlayPortalContext = createContext<HTMLDivElement | null>(null);

export function useInspectorOverlayPortal(): HTMLDivElement | null {
  return useContext(InspectorOverlayPortalContext);
}
