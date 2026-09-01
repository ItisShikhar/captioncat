import * as React from 'react';

import { cn } from '@/lib/utils';
import { scrub } from '@/ui/constants';
import { EW_RESIZE_CURSOR } from '@/ui/preview/preview-cursor';
import { MoveHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';

function parseBound(value: string | number | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function resolveStep(step: string | number | undefined): number {
  if (typeof step === 'number' && Number.isFinite(step) && step > 0) return step;
  if (typeof step === 'string') {
    const parsed = Number(step);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 1;
}

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

function hasClassToken(className: string | undefined, token: string): boolean {
  return (className ?? '').split(/\s+/).includes(token);
}

function getNumberInputWrapperClassName(className?: string): string {
  return cn(
    'relative inline-flex min-w-0',
    hasClassToken(className, 'flex-1') && 'flex-1',
    hasClassToken(className, 'grow') && 'grow',
    hasClassToken(className, 'shrink-0') && 'shrink-0',
    hasClassToken(className, 'w-full') && 'w-full',
  );
}

function dispatchScrubEvent(target: HTMLElement, type: 'scrubstart' | 'scrubend'): void {
  target.dispatchEvent(new Event(type, { bubbles: true }));
}

interface InputProps extends React.ComponentProps<'input'> {
  inlineEndContent?: ReactNode;
  inlineEndContentInteractive?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    className,
    type,
    onChange,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    min,
    max,
    step,
    disabled,
    readOnly,
    inlineEndContent,
    inlineEndContentInteractive = false,
    ...props
  }: InputProps,
  ref: React.ForwardedRef<HTMLInputElement>,
) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const scrubStateRef = React.useRef<
    | {
        pointerId: number;
        startX: number;
        startValue: number;
        stepValue: number;
        minValue?: number;
        maxValue?: number;
        started: boolean;
        previousUserSelect: string;
        input: HTMLInputElement;
        moveListener: (event: PointerEvent) => void;
        endListener: (event: PointerEvent) => void;
      }
    | undefined
  >(undefined);
  const scrubMoveRef = React.useRef<(event: PointerEvent) => void>(() => {});
  const scrubEndRef = React.useRef<(event: PointerEvent) => void>(() => {});

  const setInputRef = React.useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref && 'current' in ref) {
        ref.current = node;
      }
    },
    [ref],
  );

  const clearScrubState = React.useCallback(() => {
    const state = scrubStateRef.current;
    if (!state) return;
    window.removeEventListener('pointermove', state.moveListener);
    window.removeEventListener('pointerup', state.endListener);
    window.removeEventListener('pointercancel', state.endListener);
    document.body.style.userSelect = state.previousUserSelect;
    scrubStateRef.current = undefined;
  }, []);

  React.useEffect(
    () => () => {
      clearScrubState();
    },
    [clearScrubState],
  );

  const isNumberInput = type === 'number';
  const canScrub = isNumberInput && !disabled && !readOnly;
  React.useEffect(() => {
    if (!canScrub) clearScrubState();
  }, [canScrub, clearScrubState]);

  const wrapperClassName = isNumberInput ? getNumberInputWrapperClassName(className) : undefined;
  const inputClassName = cn(
    'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30',
    isNumberInput &&
      cn(
        'cursor-text [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
        inlineEndContent ? 'pr-14' : 'pr-8',
      ),
    'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
    'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
    className,
  );

  const handleScrubPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (!canScrub || event.defaultPrevented || event.button !== 0) return;
      event.preventDefault();
      clearScrubState();

      const input = inputRef.current;
      if (!input) return;
      dispatchScrubEvent(input, 'scrubstart');
      const moveListener = scrubMoveRef.current;
      const endListener = scrubEndRef.current;
      const value = Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : 0;
      scrubStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startValue: value,
        stepValue: resolveStep(step),
        minValue: parseBound(min),
        maxValue: parseBound(max),
        started: false,
        previousUserSelect: document.body.style.userSelect,
        input,
        moveListener,
        endListener,
      };
      window.addEventListener('pointermove', moveListener);
      window.addEventListener('pointerup', endListener);
      window.addEventListener('pointercancel', endListener);

      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Ignore capture failures. The scrubber still works while the pointer stays over the handle.
      }
    },
    [canScrub, clearScrubState, max, min, step],
  );

  const handleScrubPointerMoveNative = React.useCallback(
    (event: PointerEvent) => {
      const state = scrubStateRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      if (!canScrub) {
        clearScrubState();
        return;
      }
      if ((event.buttons & 1) !== 1) {
        dispatchScrubEvent(state.input, 'scrubend');
        clearScrubState();
        return;
      }

      const deltaX = event.clientX - state.startX;
      if (!state.started && Math.abs(deltaX) < scrub.startThreshold) return;

      if (!state.started) {
        state.started = true;
        document.body.style.userSelect = 'none';
      }

      event.preventDefault();

      const nextValue = snapToStep(
        state.startValue + (deltaX / scrub.pixelsPerStep) * state.stepValue,
        state.stepValue,
        state.minValue,
      );
      const clampedValue = Math.min(
        state.maxValue ?? Number.POSITIVE_INFINITY,
        Math.max(state.minValue ?? Number.NEGATIVE_INFINITY, nextValue),
      );

      const input = state.input;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(input, `${clampedValue}`);
      else input.value = `${clampedValue}`;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    },
    [canScrub, clearScrubState],
  );

  scrubMoveRef.current = handleScrubPointerMoveNative;

  const handleScrubPointerEndNative = React.useCallback(
    (event: PointerEvent) => {
      const state = scrubStateRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      dispatchScrubEvent(state.input, 'scrubend');
      clearScrubState();
    },
    [clearScrubState],
  );

  scrubEndRef.current = handleScrubPointerEndNative;

  const handleScrubPointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      handleScrubPointerMoveNative(event.nativeEvent);
    },
    [handleScrubPointerMoveNative],
  );

  const handleScrubPointerUp = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      handleScrubPointerEndNative(event.nativeEvent);
    },
    [handleScrubPointerEndNative],
  );

  const handleScrubPointerCancel = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      handleScrubPointerEndNative(event.nativeEvent);
    },
    [handleScrubPointerEndNative],
  );

  const input = (
    <input
      ref={setInputRef}
      type={type}
      data-slot="input"
      className={inputClassName}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      readOnly={readOnly}
      onChange={onChange}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      {...props}
    />
  );

  if (!isNumberInput) {
    return input;
  }

  return (
    <div className={wrapperClassName}>
      {input}
      {isNumberInput && inlineEndContent ? (
        <span
          aria-hidden={!inlineEndContentInteractive}
          className={cn(
            'absolute right-6 top-1/2 -translate-y-1/2 whitespace-nowrap text-xs text-muted-foreground',
            inlineEndContentInteractive ? 'pointer-events-auto' : 'pointer-events-none',
          )}
        >
          {inlineEndContent}
        </span>
      ) : null}
      <button
        type="button"
        tabIndex={-1}
        disabled={!canScrub}
        aria-label="Drag to scrub numeric value"
        title={canScrub ? 'Drag to scrub' : undefined}
        style={canScrub ? { cursor: EW_RESIZE_CURSOR } : undefined}
        className={cn(
          'absolute right-1 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors',
          canScrub ? 'hover:text-foreground' : 'pointer-events-none opacity-40',
        )}
        onPointerDown={handleScrubPointerDown}
        onPointerMove={handleScrubPointerMove}
        onPointerUp={handleScrubPointerUp}
        onPointerCancel={handleScrubPointerCancel}
      >
        <MoveHorizontal className="size-3" />
      </button>
    </div>
  );
});

Input.displayName = 'Input';

export { Input };
