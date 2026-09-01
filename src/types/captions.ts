export type VerticalAlignment = 'top' | 'center' | 'bottom';
export type HorizontalAlignment = 'left' | 'center' | 'right';
export type CompositionAreaVideoResizeMode = 'fit' | 'none';

export interface ResolvedCornerRadii {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

export interface ResolvedCornerFlags {
  topLeft: boolean;
  topRight: boolean;
  bottomRight: boolean;
  bottomLeft: boolean;
}

export interface ResolvedCornerGeometry {
  radii: ResolvedCornerRadii;
  squircle: ResolvedCornerFlags;
}
