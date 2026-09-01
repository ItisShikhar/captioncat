import * as React from 'react';
import { useCallback, useEffect, useRef } from 'react';
import { scrub } from '@/ui/constants';
import { EW_RESIZE_CURSOR } from '@/ui/preview/preview-cursor';

function decimalPlaces(step: number): number {
  const text = `${step}`;
  if (text.includes('e-')) return Number(text.split('e-')[1] ?? 0);
  const dot = text.indexOf('.');
  return dot >= 0 ? text.length - dot - 1 : 0;
}

function snapToStep(value: number, step: number, min?: number): number {
  if (!Number.isFinite(step) || step <= 0) return value;
  const origin = min ?? 0;
  const snapped = Math.round((value - origin) / step) * step + origin;
  return Number(snapped.toFixed(decimalPlaces(step)));
}

interface UseDragScrubOptions {
  /** Read fresh at drag-start (so a value that only resolves once dragging begins - e.g. an "Auto" field's live preview number - is used as the starting point). */
  getValue: () => number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  /** Called once, the instant the drag passes the move threshold - lets a caller flip an "Auto" switch off right as scrubbing begins. */
  onScrubStart?: () => void;
}

interface DragScrubHandlers {
  onPointerDown: (event: React.PointerEvent) => void;
  onPointerUp: (event: React.PointerEvent) => void;
  onPointerCancel: (event: React.PointerEvent) => void;
}

/**
 * Generic value-scrub (click-drag horizontally to change a number) for any
 * element - not only `<input type="number">` (see `ui/shadcn/input.tsx` for
 * that DOM-value-driven variant this mirrors the math of). Fully controlled:
 * reads/writes through `getValue`/`onChange` instead of mutating a DOM node,
 * so it works equally well on a plain label/span.
 */
export function useDragScrub({ getValue, onChange, min, max, step, disabled, onScrubStart }: UseDragScrubOptions): DragScrubHandlers {
  const stateRef = useRef<
    | {
        pointerId: number;
        startX: number;
        startValue: number;
        started: boolean;
        previousUserSelect: string;
        previousCursor: string;
        moveListener: (event: PointerEvent) => void;
        endListener: (event: PointerEvent) => void;
      }
    | undefined
  >(undefined);

  const moveListenerRef = useRef<(event: PointerEvent) => void>(() => {});
  const endListenerRef = useRef<(event: PointerEvent) => void>(() => {});
  const onChangeRef = useRef(onChange);

  onChangeRef.current = onChange;

  const clear = useCallback(() => {
    const state = stateRef.current;
    if (!state) return;
    window.removeEventListener('pointermove', state.moveListener);
    window.removeEventListener('pointerup', state.endListener);
    window.removeEventListener('pointercancel', state.endListener);
    document.body.style.userSelect = state.previousUserSelect;
    document.body.style.cursor = state.previousCursor;
    stateRef.current = undefined;
  }, []);

  const onWindowPointerMove = useCallback(
    (event: PointerEvent) => {
      const state = stateRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      if (disabled) {
        clear();
        return;
      }
      if ((event.buttons & 1) !== 1) {
        clear();
        return;
      }

      const deltaX = event.clientX - state.startX;
      if (!state.started && Math.abs(deltaX) < scrub.startThreshold) return;

      if (!state.started) {
        state.started = true;
        document.body.style.userSelect = 'none';
        document.body.style.cursor = EW_RESIZE_CURSOR;
        onScrubStart?.();
      }

      event.preventDefault();
      const stepValue = step && step > 0 ? step : 1;
      const next = snapToStep(state.startValue + (deltaX / scrub.pixelsPerStep) * stepValue, stepValue, min);
      const clamped = Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? Number.NEGATIVE_INFINITY, next));
      onChangeRef.current(clamped);
    },
    [clear, disabled, max, min, onScrubStart, step],
  );

  const onWindowPointerEnd = useCallback(
    (event: PointerEvent) => {
      const state = stateRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      clear();
    },
      [clear],
  );

  moveListenerRef.current = onWindowPointerMove;
  endListenerRef.current = onWindowPointerEnd;

  useEffect(() => {
    if (disabled) clear();
  }, [clear, disabled]);

  useEffect(
    () => () => {
      clear();
    },
    [clear],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (disabled || event.button !== 0) return;
      event.preventDefault();
      clear();
      const moveListener = moveListenerRef.current;
      const endListener = endListenerRef.current;
      stateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startValue: getValue(),
        started: false,
        previousUserSelect: document.body.style.userSelect,
        previousCursor: document.body.style.cursor,
        moveListener,
        endListener,
      };
      window.addEventListener('pointermove', moveListener);
      window.addEventListener('pointerup', endListener);
      window.addEventListener('pointercancel', endListener);
      try {
        (event.currentTarget as Element & { setPointerCapture?: (id: number) => void }).setPointerCapture?.(
          event.pointerId,
        );
      } catch {
        // Ignore capture failures. The scrubber still works while the pointer stays over the element.
      }
    },
    [clear, disabled, getValue],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent) => {
      const state = stateRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      clear();
    },
    [clear],
  );

  const onPointerCancel = onPointerUp;

  return { onPointerDown, onPointerUp, onPointerCancel };
}
