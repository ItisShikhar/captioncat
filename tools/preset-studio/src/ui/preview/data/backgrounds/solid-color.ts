import type { StaticPreviewBackground } from './types';
import type { LinearGradientPaint } from '@/schema/paint';

export const SOLID_COLOR_BACKGROUND_ID = 'solid-color';
export const GRADIENT_BACKGROUND_ID = 'gradient-fill';
export const DEFAULT_SOLID_BACKGROUND_COLOR = '#111111';
export const DEFAULT_GRADIENT_BACKGROUND_PAINT: LinearGradientPaint = {
  type: 'linear-gradient',
  angle: 90,
  stops: [
    { offset: 0, color: '#111827' },
    { offset: 1, color: '#4b5563' },
  ],
};

function drawFlatColor(color: string): StaticPreviewBackground['draw'] {
  return (ctx, width, height) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
  };
}

export function createSolidColorBackground(color: string): StaticPreviewBackground {
  return {
    id: SOLID_COLOR_BACKGROUND_ID,
    name: 'Solid Fill',
    draw: drawFlatColor(color),
  };
}

export const solidColorBackground = createSolidColorBackground(DEFAULT_SOLID_BACKGROUND_COLOR);
