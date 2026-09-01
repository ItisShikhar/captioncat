import { cn } from '@/lib/utils';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

const DEFAULT_PASTEL_COLORS = ['#f9a8d4', '#c4b5fd', '#93c5fd', '#86efac', '#fde68a'];
const LOADER_SIZES = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 18,
  xl: 24,
  xxl: 36,
} as const;

type PastelDotLoaderSize = keyof typeof LOADER_SIZES | number;

export interface PastelDotLoaderProps {
  size?: PastelDotLoaderSize;
  intervalMs?: number;
  transitionDurationMs?: number;
  colors?: readonly string[];
  label?: string;
  className?: string;
}

function pixelSize(size: PastelDotLoaderSize): number {
  return typeof size === 'number' ? Math.max(1, size) : LOADER_SIZES[size];
}

export function PastelDotLoader({
  size = 'md',
  intervalMs: intervalValue = 250,
  transitionDurationMs = 0,
  colors = DEFAULT_PASTEL_COLORS,
  label = 'Loading',
  className,
}: PastelDotLoaderProps): ReactNode {
  const [colorIndex, setColorIndex] = useState(0);
  const intervalMs = Math.max(1, intervalValue);
  const transitionMs = Number.isFinite(transitionDurationMs) ? Math.max(0, transitionDurationMs) : 0;
  const palette = colors.length > 0 ? colors : DEFAULT_PASTEL_COLORS;
  const diameter = pixelSize(size);

  useEffect(() => {
    if (palette.length < 2) return;
    const interval = window.setInterval(() => {
      setColorIndex((current) => (current + 1) % palette.length);
    }, intervalMs);
    return () => window.clearInterval(interval);
  }, [intervalMs, palette.length]);

  const style: CSSProperties = {
    width: diameter,
    height: diameter,
    backgroundColor: palette[colorIndex % palette.length],
    transitionDuration: `${transitionMs}ms`,
  };

  return (
    <span
      role="status"
      aria-label={label}
      data-slot="pastel-dot-loader"
      className={cn('inline-block shrink-0 rounded-full transition-colors', className)}
      style={style}
    />
  );
}
