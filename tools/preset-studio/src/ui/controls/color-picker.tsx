import { cn } from '@/lib/utils';
import { Button } from '@/ui/shadcn/button';
import { Input } from '@/ui/shadcn/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/shadcn/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/shadcn/select';
import { Pipette } from 'lucide-react';
import { Slider as RadixSlider } from 'radix-ui';
import type { CSSProperties, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ColorSwatchButton } from './color-swatch';
import { FieldRow } from './field-row';
import { PaintClipboardActions } from './paint-clipboard-actions';
import { PropertyLockIndicator, type PropertyLockState } from './property-lock';
import { usePopoverOutsideDismissal } from './use-popover-outside-dismissal';

type ColorMode = 'hex' | 'rgb' | 'hsl';
type ColorRgba = { r: number; g: number; b: number; a: number };

export interface ColorInputProps {
  value: string;
  onChange: (next: string) => void;
  id?: string;
  className?: string;
  /**
   * Larger trigger used by the main property panel when the field reads
   * more like a filled color chip than a plain swatch.
   */
  variant?: 'default' | 'fill';
  compact?: boolean;
  fullWidth?: boolean;
  ariaLabel?: string;
  disabled?: boolean;
}

export interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  description?: string;
  compact?: boolean;
  id?: string;
  variant?: 'default' | 'fill';
  childrenAfter?: ReactNode;
  disabled?: boolean;
  lock?: PropertyLockState | null;
}

function colorToRgba(css: string): ColorRgba {
  const trimmed = css.trim().toLowerCase();
  if (trimmed === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const hex = trimmed.match(/^#([0-9a-f]{3,8})$/i)?.[1];
  if (hex) {
    if (hex.length === 3 || hex.length === 4) {
      const r = Number.parseInt(hex[0] + hex[0], 16);
      const g = Number.parseInt(hex[1] + hex[1], 16);
      const b = Number.parseInt(hex[2] + hex[2], 16);
      const a = hex.length === 4 ? Number.parseInt(hex[3] + hex[3], 16) / 255 : 1;
      return { r, g, b, a };
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = Number.parseInt(hex.slice(0, 2), 16);
      const g = Number.parseInt(hex.slice(2, 4), 16);
      const b = Number.parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1;
      return { r, g, b, a };
    }
  }
  const rgbMatch = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (rgbMatch) {
    return {
      r: Number(rgbMatch[1]) || 0,
      g: Number(rgbMatch[2]) || 0,
      b: Number(rgbMatch[3]) || 0,
      a: rgbMatch[4] !== undefined ? Number(rgbMatch[4]) || 0 : 1,
    };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

function rgbaToCss({ r, g, b, a }: ColorRgba): string {
  const alpha = Math.max(0, Math.min(1, a));
  if (alpha >= 1) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
}

function rgbToCss({ r, g, b }: ColorRgba): string {
  return `rgb(${r}, ${g}, ${b})`;
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function rgbToHex({ r, g, b, a }: ColorRgba): string {
  const hex = [r, g, b].map((n) => clampChannel(n).toString(16).padStart(2, '0')).join('');
  if (a >= 1) return `#${hex}`;
  return `#${hex}${Math.round(Math.max(0, Math.min(1, a)) * 255)
    .toString(16)
    .padStart(2, '0')}`;
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const nr = r / 255;
  const ng = g / 255;
  const nb = b / 255;
  const max = Math.max(nr, ng, nb);
  const min = Math.min(nr, ng, nb);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === nr) h = ((ng - nb) / delta) % 6;
    else if (max === ng) h = (nb - nr) / delta + 2;
    else h = (nr - ng) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : delta / max;
  return { h, s, v: max };
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s;
  const hh = (h % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh >= 0 && hh < 1) {
    r = c;
    g = x;
  } else if (hh < 2) {
    r = x;
    g = c;
  } else if (hh < 3) {
    g = c;
    b = x;
  } else if (hh < 4) {
    g = x;
    b = c;
  } else if (hh < 5) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const m = v - c;
  return {
    r: clampChannel((r + m) * 255),
    g: clampChannel((g + m) * 255),
    b: clampChannel((b + m) * 255),
  };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const nr = r / 255;
  const ng = g / 255;
  const nb = b / 255;
  const max = Math.max(nr, ng, nb);
  const min = Math.min(nr, ng, nb);
  const delta = max - min;
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    if (max === nr) h = ((ng - nb) / delta) % 6;
    else if (max === ng) h = (nb - nr) / delta + 2;
    else h = (nr - ng) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

function formatColorValue(rgba: ColorRgba, format: ColorMode): string {
  if (format === 'hex') return rgbToHex(rgba);
  if (format === 'rgb') {
    if (rgba.a >= 1) return `rgb(${rgba.r}, ${rgba.g}, ${rgba.b})`;
    return `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${rgba.a.toFixed(2)})`;
  }
  const { h, s, l } = rgbToHsl(rgba.r, rgba.g, rgba.b);
  if (rgba.a >= 1) return `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
  return `hsla(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%, ${rgba.a.toFixed(2)})`;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

let namedColorCtx: CanvasRenderingContext2D | null | undefined;
function getNamedColorCtx(): CanvasRenderingContext2D | null {
  if (namedColorCtx === undefined) {
    namedColorCtx =
      typeof document === 'undefined' ? null : (document.createElement('canvas').getContext('2d') ?? null);
  }
  return namedColorCtx;
}

/** Resolves a CSS named color, for example "red", to `#rrggbb`. Returns null for an invalid color. */
function namedColorToHex(name: string): string | null {
  const ctx = getNamedColorCtx();
  if (!ctx) return null;
  const sentinel = '#123456';
  ctx.fillStyle = sentinel;
  ctx.fillStyle = name;
  const resolved = ctx.fillStyle;
  return /^#[0-9a-f]{6}$/i.test(resolved) && resolved.toLowerCase() !== sentinel ? resolved : null;
}

/** Popover's initial mode/text mirrors how the field is already written: rgb()/hsl() open in that mode, hex stays hex, anything else (a named color) is normalized to hex first. */
function resolveInitialMode(raw: string): { mode: ColorMode; text: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { mode: 'hex', text: '' };
  if (trimmed === 'transparent') return { mode: 'rgb', text: 'rgba(0, 0, 0, 0)' };
  if (/^#[0-9a-f]{3,8}$/i.test(trimmed)) return { mode: 'hex', text: trimmed };
  if (/^rgba?\(/i.test(trimmed)) return { mode: 'rgb', text: trimmed };
  if (/^hsla?\(/i.test(trimmed)) return { mode: 'hsl', text: trimmed };
  const hex = namedColorToHex(trimmed);
  return { mode: 'hex', text: hex ?? trimmed };
}

function resolveColorState(raw: string): {
  mode: ColorMode;
  text: string;
  rgba: ColorRgba;
  hsv: { h: number; s: number; v: number };
} {
  const resolved = resolveInitialMode(raw);
  const rgba = colorToRgba(resolved.text || raw || 'rgba(0,0,0,0)');
  return { mode: resolved.mode, text: resolved.text, rgba, hsv: rgbToHsv(rgba.r, rgba.g, rgba.b) };
}

function parseEditableColor(raw: string): ColorRgba | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (/^#[0-9a-f]{3,8}$/i.test(trimmed) || /^rgba?\(/i.test(trimmed)) return colorToRgba(trimmed);
  const normalized = namedColorToHex(trimmed);
  return normalized ? colorToRgba(normalized) : null;
}

export function ColorPickerPanel({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const selectionRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    previousUserSelect: string;
    bounds: { left: number; top: number; width: number; height: number };
  } | null>(null);
  const selectionFrameRef = useRef<number | null>(null);
  const pendingSelectionPointRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const initialRef = useRef(resolveColorState(value));
  const draftRef = useRef({
    hue: initialRef.current.hsv.h,
    saturation: initialRef.current.hsv.s * 100,
    lightness: initialRef.current.hsv.v * 100,
    alpha: initialRef.current.rgba.a * 100,
    format: initialRef.current.mode,
  });
  const latestCssRef = useRef(
    initialRef.current.text || formatColorValue(initialRef.current.rgba, initialRef.current.mode),
  );
  const [hue, setHue] = useState(draftRef.current.hue);
  const [saturation, setSaturation] = useState(draftRef.current.saturation);
  const [lightness, setLightness] = useState(draftRef.current.lightness);
  const [alpha, setAlpha] = useState(draftRef.current.alpha);
  const [format, setFormat] = useState<ColorMode>(draftRef.current.format);
  const [text, setText] = useState(latestCssRef.current);
  const [isDragging, setIsDragging] = useState(false);

  const currentRgb = useMemo(() => hsvToRgb(hue, saturation / 100, lightness / 100), [hue, saturation, lightness]);

  // Continuous drag ticks update only local preview state. The expensive upstream
  // `onChange` (which re-renders the whole studio + triggers a live-preview render)
  // fires once on release, not per pixel of movement -- see repo memory for why.
  const syncDraft = useCallback(
    (next: { hue?: number; saturation?: number; lightness?: number; alpha?: number }, commit = false) => {
      const current = draftRef.current;
      const nextDraft = {
        hue: next.hue ?? current.hue,
        saturation: next.saturation ?? current.saturation,
        lightness: next.lightness ?? current.lightness,
        alpha: next.alpha ?? current.alpha,
        format: current.format,
      };
      draftRef.current = nextDraft;

      const nextRgb = hsvToRgb(nextDraft.hue, nextDraft.saturation / 100, nextDraft.lightness / 100);
      const nextRgba = { ...nextRgb, a: nextDraft.alpha / 100 };
      const nextCss = formatColorValue(nextRgba, nextDraft.format);
      latestCssRef.current = nextCss;

      setHue(nextDraft.hue);
      setSaturation(nextDraft.saturation);
      setLightness(nextDraft.lightness);
      setAlpha(nextDraft.alpha);
      setText(nextCss);

      if (commit) onChange(nextCss);
    },
    [onChange],
  );

  const syncDraftFromText = (nextText: string): ColorRgba | null => {
    const parsed = parseEditableColor(nextText);
    if (!parsed) return null;
    const nextHsv = rgbToHsv(parsed.r, parsed.g, parsed.b);
    const nextDraft = {
      ...draftRef.current,
      hue: nextHsv.h,
      saturation: nextHsv.s * 100,
      lightness: nextHsv.v * 100,
      alpha: parsed.a * 100,
    };
    draftRef.current = nextDraft;
    setHue(nextDraft.hue);
    setSaturation(nextDraft.saturation);
    setLightness(nextDraft.lightness);
    setAlpha(nextDraft.alpha);
    latestCssRef.current = nextText;
    return parsed;
  };

  const commitDraft = useCallback(() => {
    onChange(latestCssRef.current);
  }, [onChange]);

  useEffect(() => {
    const next = resolveColorState(value);
    const nextDraft = {
      hue: next.hsv.h,
      saturation: next.hsv.s * 100,
      lightness: next.hsv.v * 100,
      alpha: next.rgba.a * 100,
      format: next.mode,
    };
    const nextText = next.text || formatColorValue(next.rgba, next.mode);

    draftRef.current = nextDraft;
    latestCssRef.current = nextText;
    setHue(nextDraft.hue);
    setSaturation(nextDraft.saturation);
    setLightness(nextDraft.lightness);
    setAlpha(nextDraft.alpha);
    setFormat(nextDraft.format);
    setText(nextText);
  }, [value]);

  const updateSelectionFromPoint = useCallback(
    (
      clientX: number,
      clientY: number,
      bounds: { left: number; top: number; width: number; height: number } | null = dragStateRef.current?.bounds ??
        null,
    ) => {
      if (!bounds || bounds.width === 0 || bounds.height === 0) return;
      const nextSaturation = clamp01((clientX - bounds.left) / bounds.width) * 100;
      const nextLightness = (1 - clamp01((clientY - bounds.top) / bounds.height)) * 100;
      syncDraft({ saturation: nextSaturation, lightness: nextLightness });
    },
    [syncDraft],
  );

  const flushSelectionFrame = useCallback(() => {
    const point = pendingSelectionPointRef.current;
    pendingSelectionPointRef.current = null;
    if (point) updateSelectionFromPoint(point.clientX, point.clientY);
  }, [updateSelectionFromPoint]);

  const scheduleSelectionUpdate = useCallback(
    (clientX: number, clientY: number) => {
      pendingSelectionPointRef.current = { clientX, clientY };
      if (selectionFrameRef.current !== null) return;
      selectionFrameRef.current = window.requestAnimationFrame(() => {
        selectionFrameRef.current = null;
        flushSelectionFrame();
      });
    },
    [flushSelectionFrame],
  );

  const beginSelectionDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const node = selectionRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const bounds = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      dragStateRef.current = { pointerId: event.pointerId, previousUserSelect: document.body.style.userSelect, bounds };
      document.body.style.userSelect = 'none';
      setIsDragging(true);
      updateSelectionFromPoint(event.clientX, event.clientY, bounds);
    },
    [updateSelectionFromPoint],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      scheduleSelectionUpdate(event.clientX, event.clientY);
    },
    [scheduleSelectionUpdate],
  );

  const stopDragging = useCallback(
    (pointerId: number, clientX?: number, clientY?: number) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== pointerId) return;
      if (selectionFrameRef.current !== null) {
        window.cancelAnimationFrame(selectionFrameRef.current);
        selectionFrameRef.current = null;
      }
      if (clientX !== undefined && clientY !== undefined) {
        pendingSelectionPointRef.current = null;
        updateSelectionFromPoint(clientX, clientY);
      } else {
        flushSelectionFrame();
      }
      document.body.style.userSelect = dragState.previousUserSelect;
      dragStateRef.current = null;
      pendingSelectionPointRef.current = null;
      setIsDragging(false);
      commitDraft();
    },
    [commitDraft, flushSelectionFrame, updateSelectionFromPoint],
  );

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerUp = (event: PointerEvent) => stopDragging(event.pointerId, event.clientX, event.clientY);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [handlePointerMove, isDragging, stopDragging]);

  const handleFormatChange = (next: string) => {
    const selected = next as ColorMode;
    const parsedText = syncDraftFromText(text);
    const current = draftRef.current;
    const nextRgb = parsedText ?? hsvToRgb(current.hue, current.saturation / 100, current.lightness / 100);
    const nextRgba = parsedText ?? { ...nextRgb, a: current.alpha / 100 };
    const nextCss = formatColorValue(nextRgba, selected);

    draftRef.current = { ...current, format: selected };
    latestCssRef.current = nextCss;
    setFormat(selected);
    setText(nextCss);
    onChange(nextCss);
  };

  const handleEyeDropper = async () => {
    try {
      const eyeDropperClass = (
        window as Window & { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }
      ).EyeDropper;
      if (!eyeDropperClass) return;
      const eyeDropper = new eyeDropperClass();
      const result = await eyeDropper.open();
      const next = resolveColorState(result.sRGBHex);
      const nextDraft = {
        hue: next.hsv.h,
        saturation: next.hsv.s * 100,
        lightness: next.hsv.v * 100,
        alpha: next.rgba.a * 100,
        format: next.mode,
      };
      const nextText = next.text || formatColorValue(next.rgba, next.mode);

      draftRef.current = nextDraft;
      latestCssRef.current = nextText;
      setHue(nextDraft.hue);
      setSaturation(nextDraft.saturation);
      setLightness(nextDraft.lightness);
      setAlpha(nextDraft.alpha);
      setFormat(nextDraft.format);
      setText(nextText);
      onChange(nextText);
    } catch {
      // EyeDropper is optional and can be blocked by the browser.
    }
  };

  return (
    <div className="space-y-2.5">
      <div
        ref={selectionRef}
        className="relative h-32 w-full touch-none cursor-crosshair overflow-visible"
        style={
          {
            '--color-picker-radius': 'calc(var(--radius) - 4px)',
            borderRadius: 'var(--color-picker-radius)',
          } as CSSProperties
        }
        aria-label={label}
        onPointerDownCapture={beginSelectionDrag}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundColor: `hsl(${hue} 100% 50%)`,
            borderRadius: 'calc(var(--color-picker-radius) + 1px)',
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#fff,rgba(255,255,255,0))]"
          style={{ borderRadius: 'calc(var(--color-picker-radius) + 1px)' }}
        />
        <div
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,#000,rgba(0,0,0,0))]"
          style={{ borderRadius: 'var(--color-picker-radius)' }}
        />
        <div
          className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
          style={{ left: `${saturation}%`, top: `${100 - lightness}%` }}
          aria-hidden="true"
        />
      </div>

      <RadixSlider.Root
        className="relative flex h-4 w-full touch-none items-center select-none"
        max={360}
        step={1}
        value={[hue]}
        onValueChange={([next]) => syncDraft({ hue: next ?? hue })}
        onValueCommit={commitDraft}
      >
        <RadixSlider.Track className="relative h-3 w-full grow rounded-full bg-[linear-gradient(90deg,#FF0000,#FFFF00,#00FF00,#00FFFF,#0000FF,#FF00FF,#FF0000)]">
          <RadixSlider.Range className="absolute h-full" />
        </RadixSlider.Track>
        <RadixSlider.Thumb className="block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />
      </RadixSlider.Root>

      <div className="relative flex h-4 w-full items-center">
        <div
          className="pointer-events-none absolute inset-x-0 h-2 rounded-full bg-white
bg-[length:10px_10px]
bg-[position:0_0,0_5px,5px_-5px,-5px_0]
bg-[image:linear-gradient(45deg,_#d1d5db_25%,_transparent_25%),linear-gradient(-45deg,_#d1d5db_25%,_transparent_25%),linear-gradient(45deg,_transparent_75%,_#d1d5db_75%),linear-gradient(-45deg,_transparent_75%,_#d1d5db_75%)]
"
        />
        <div
          className="pointer-events-none absolute inset-x-0 h-2 rounded-full"
          style={{
            background: `linear-gradient(to right, rgba(${currentRgb.r}, ${currentRgb.g}, ${currentRgb.b}, 0), rgb(${currentRgb.r}, ${currentRgb.g}, ${currentRgb.b}))`,
          }}
        />
        <RadixSlider.Root
          className="relative flex h-4 w-full touch-none items-center select-none"
          max={100}
          step={1}
          value={[alpha]}
          onValueChange={([next]) => syncDraft({ alpha: next ?? alpha })}
          onValueCommit={commitDraft}
        >
          <RadixSlider.Track className="relative h-3 w-full grow rounded-full bg-transparent">
            <RadixSlider.Range className="absolute h-full rounded-full bg-transparent" />
          </RadixSlider.Track>
          <RadixSlider.Thumb className="block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />
        </RadixSlider.Root>
      </div>

      <div className="flex flex-col gap-2">
        <Input
          className="h-8 w-full min-w-0 rounded-md bg-secondary px-2 font-mono text-xs shadow-none"
          value={text}
          onChange={(event) => {
            const nextText = event.target.value;
            setText(nextText);
            syncDraftFromText(nextText);
          }}
          onBlur={(event) => {
            const nextText = event.currentTarget.value;
            syncDraftFromText(nextText);
            latestCssRef.current = nextText;
            onChange(nextText);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              const nextText = event.currentTarget.value;
              syncDraftFromText(nextText);
              latestCssRef.current = nextText;
              onChange(nextText);
            }
          }}
        />
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="icon-sm" onClick={handleEyeDropper}>
            <Pipette className="size-3.5" />
          </Button>
          <Select value={format} onValueChange={handleFormatChange}>
            <SelectTrigger className="h-7 w-20 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hex">HEX</SelectItem>
              <SelectItem value="rgb">RGB</SelectItem>
              <SelectItem value="hsl">HSL</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

export function ColorInput({
  value,
  onChange,
  id,
  className,
  variant = 'default',
  compact = false,
  fullWidth = false,
  ariaLabel = 'Color picker',
  disabled = false,
}: ColorInputProps) {
  const swatchSize = compact
    ? fullWidth
      ? 'h-8 w-full rounded-md border'
      : 'size-6 rounded-md border'
    : variant === 'fill'
      ? 'size-10 rounded-md border'
      : 'size-10 rounded-md border';
  const previewRgba = useMemo(() => {
    const trimmed = value.trim();
    const resolved = namedColorToHex(trimmed);
    return colorToRgba(resolved ?? (trimmed || 'rgba(0,0,0,0)'));
  }, [value]);
  const displayValue = useMemo(() => {
    const hex = rgbToHex({ ...previewRgba, a: 1 }).toUpperCase();
    const alphaPercent = Math.round(Math.max(0, Math.min(1, previewRgba.a)) * 100);
    return `${hex} | ${alphaPercent}%`;
  }, [previewRgba]);
  const { layerId, open, setOpen } = usePopoverOutsideDismissal();

  return (
    <div className={cn('flex items-start gap-1.5', compact && !fullWidth && 'w-fit', fullWidth && 'w-full', className)}>
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild>
          <ColorSwatchButton
            id={id}
            layerId={layerId}
            sizeClassName={swatchSize}
            className={variant === 'fill' ? 'hover:border-ring/70 hover:bg-background' : 'cursor-pointer'}
            ariaLabel={ariaLabel}
            disabled={disabled}
          >
            <span className="absolute inset-y-0 left-0 w-1/2" style={{ background: rgbToCss(previewRgba) }} />
            {previewRgba.a < 1 && (
              <span
                className="absolute inset-y-0 right-0 w-1/2 bg-white
bg-[length:12px_12px]
bg-[image:conic-gradient(#d1d5db_25%,white_0_50%,#d1d5db_0_75%,white_0)]"
              />
            )}
            <span className="absolute inset-y-0 right-0 w-1/2" style={{ background: rgbaToCss(previewRgba) }} />
            {/*<span className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-border/70" /> */}
          </ColorSwatchButton>
        </PopoverTrigger>
        <PopoverContent
          data-popover-layer-content={layerId}
          dismissOnOutside={false}
          collisionPadding={12}
          sticky="always"
          side="right"
          align="start"
          className="max-h-[var(--radix-popover-content-available-height)] w-80 max-w-[calc(100vw-1.5rem)] overflow-y-auto p-2"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <ColorPickerPanel label={ariaLabel} value={value} onChange={onChange} />
        </PopoverContent>
      </Popover>
      {!compact && (
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-2">
            <div className="text-muted-foreground min-w-0 flex-1 truncate px-1 text-[10px] font-medium">
              Solid Color
            </div>
            <PaintClipboardActions
              value={{ type: 'solid', color: value }}
              capabilities={['solid']}
              onPaste={(paint) => {
                if (paint.type === 'solid') onChange(paint.color);
              }}
              itemLabel="color"
              compact
              disabled={disabled}
            />
          </div>
          <div className="truncate px-1 font-mono text-xs">{displayValue}</div>
        </div>
      )}
    </div>
  );
}

export function ColorField({
  label,
  value,
  onChange,
  description,
  compact,
  id,
  variant = 'default',
  childrenAfter,
  disabled = false,
  lock = null,
}: ColorFieldProps) {
  return (
    <FieldRow label={label} description={description} htmlFor={id} compact={compact} lock={null}>
      <div className="flex items-center gap-1.5">
        <ColorInput
          id={id}
          value={value}
          onChange={onChange}
          variant={variant}
          ariaLabel={`${label} color picker`}
          disabled={disabled || lock?.locked === true}
        />
        <PropertyLockIndicator lock={lock} className="size-3" />
        {childrenAfter && <div className="flex shrink-0 items-center gap-1">{childrenAfter}</div>}
      </div>
    </FieldRow>
  );
}
