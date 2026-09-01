export interface GradientStop {
  offset: number;
  color: string;
}

export interface SolidPaint {
  type: 'solid';
  color: string;
}

export interface LinearGradientPaint {
  type: 'linear-gradient';
  angle: number;
  stops: GradientStop[];
}

export interface RadialGradientPaint {
  type: 'radial-gradient';
  centerX: number;
  centerY: number;
  radius: number;
  stops: GradientStop[];
}

export type Paint = SolidPaint | LinearGradientPaint | RadialGradientPaint;
export type PaintType = Paint['type'];
export type PaintCapability = PaintType;

export interface PaintGradient {
  addColorStop(offset: number, color: string): void;
}

export type ResolvedPaint = string | PaintGradient;

export interface PaintBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
