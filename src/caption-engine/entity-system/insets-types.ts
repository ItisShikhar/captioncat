export const INSET_EDGES = ['top', 'right', 'bottom', 'left'] as const;
export type InsetEdge = (typeof INSET_EDGES)[number];

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
