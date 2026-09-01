import { cn } from '@/lib/utils';
import { buttonVariants } from '@/ui/shadcn/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';
import {
  ArrowDown,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  TriangleAlert,
} from 'lucide-react';
import { type CSSProperties, type KeyboardEvent, type ReactNode, useMemo, useRef } from 'react';
import { FieldRow } from './field-row';
import type { PropertyLockState } from './property-lock';
import {
  type AnchorPickerLayout,
  type AnchorValue,
  ANCHOR_VALUES,
  anchorLabel,
  buildAnchorPickerLayout,
  normalizeAllowedAnchors,
  normalizeAnchorValue,
} from './anchor-picker';

const ANCHOR_GLYPHS: Record<AnchorValue, ReactNode> = {
  topLeft: <ArrowUpLeft className="size-3.5 stroke-[2.2]" aria-hidden="true" />,
  topCenter: <ArrowUp className="size-3.5 stroke-[2.2]" aria-hidden="true" />,
  topRight: <ArrowUpRight className="size-3.5 stroke-[2.2]" aria-hidden="true" />,
  centerLeft: <ArrowLeft className="size-3.5 stroke-[2.2]" aria-hidden="true" />,
  center: <span className="text-sm leading-none" aria-hidden="true">•</span>,
  centerRight: <ArrowRight className="size-3.5 stroke-[2.2]" aria-hidden="true" />,
  bottomLeft: <ArrowDownLeft className="size-3.5 stroke-[2.2]" aria-hidden="true" />,
  bottomCenter: <ArrowDown className="size-3.5 stroke-[2.2]" aria-hidden="true" />,
  bottomRight: <ArrowDownRight className="size-3.5 stroke-[2.2]" aria-hidden="true" />,
};

const PIVOT_GLYPHS: Record<AnchorValue, ReactNode> = Object.fromEntries(
  ANCHOR_VALUES.map((anchor) => [anchor, <span className="size-2.5 rounded-[2px] bg-current" aria-hidden="true" />]),
) as Record<AnchorValue, ReactNode>;

function nextAnchorInDirection(
  layout: AnchorPickerLayout,
  allowedAnchors: ReadonlySet<AnchorValue>,
  anchor: AnchorValue,
  deltaRow: number,
  deltaColumn: number,
): AnchorValue | null {
  for (let rowIndex = 0; rowIndex < layout.cells.length; rowIndex += 1) {
    const columnIndex = layout.cells[rowIndex].indexOf(anchor);
    if (columnIndex < 0) continue;
    let nextRowIndex = rowIndex + deltaRow;
    let nextColumnIndex = columnIndex + deltaColumn;
    while (
      nextRowIndex >= 0 &&
      nextRowIndex < layout.cells.length &&
      nextColumnIndex >= 0 &&
      nextColumnIndex < layout.cells[nextRowIndex].length
    ) {
      const candidate = layout.cells[nextRowIndex][nextColumnIndex];
      if (candidate && allowedAnchors.has(candidate)) return candidate;
      nextRowIndex += deltaRow;
      nextColumnIndex += deltaColumn;
    }
    return null;
  }
  return null;
}

export interface AnchorPickerProps {
  value: string;
  onChange: (value: AnchorValue) => void;
  allowedAnchors: readonly string[];
  ariaLabel?: string;
  disabled?: boolean;
  variant?: 'anchor' | 'pivot';
}

export function AnchorPicker({
  value,
  onChange,
  allowedAnchors,
  ariaLabel = 'Anchor',
  disabled = false,
  variant = 'anchor',
}: AnchorPickerProps) {
  const layout = useMemo(() => buildAnchorPickerLayout(allowedAnchors), [allowedAnchors]);
  const allowedAnchorSet = useMemo(() => new Set(layout.anchors), [layout.anchors]);
  const normalizedValue = normalizeAnchorValue(value);
  const hasValidValue = normalizedValue !== null && layout.anchors.includes(normalizedValue);
  const canChange = !disabled && (layout.anchors.length > 1 || !hasValidValue);
  const buttonRefs = useRef<Partial<Record<AnchorValue, HTMLButtonElement | null>>>({});
  const gridStyle = useMemo<CSSProperties>(
    () => ({
      gridTemplateColumns: `repeat(${Math.max(layout.columns.length, 1)}, minmax(0, 1.75rem))`,
    }),
    [layout.columns.length],
  );
  const focusableAnchor = hasValidValue && normalizedValue ? normalizedValue : (layout.anchors[0] ?? null);

  const onKeyDown = (anchor: AnchorValue) => (event: KeyboardEvent<HTMLButtonElement>) => {
    let next: AnchorValue | null = null;
    switch (event.key) {
      case 'ArrowUp':
        next = nextAnchorInDirection(layout, allowedAnchorSet, anchor, -1, 0);
        break;
      case 'ArrowDown':
        next = nextAnchorInDirection(layout, allowedAnchorSet, anchor, 1, 0);
        break;
      case 'ArrowLeft':
        next = nextAnchorInDirection(layout, allowedAnchorSet, anchor, 0, -1);
        break;
      case 'ArrowRight':
        next = nextAnchorInDirection(layout, allowedAnchorSet, anchor, 0, 1);
        break;
      default:
        return;
    }
    if (!next || !canChange) return;
    event.preventDefault();
    onChange(next);
    requestAnimationFrame(() => buttonRefs.current[next]?.focus());
  };

  return (
    <div className="space-y-2">
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        className="grid w-fit overflow-hidden rounded-md border border-border/70 bg-muted"
        style={gridStyle}
      >
        {layout.cells.flatMap((row, rowIndex) =>
          row.map((anchor, columnIndex) => {
            const cellBoundaryClass = cn(
              columnIndex < layout.columns.length - 1 && 'border-r border-input/70',
              rowIndex < layout.rows.length - 1 && 'border-b border-input/70',
            );
            if (!anchor) {
              return <div key={`empty-${rowIndex}-${columnIndex}`} className={cn('size-7', cellBoundaryClass)} aria-hidden="true" />;
            }
            const available = allowedAnchorSet.has(anchor);
            const selected = normalizedValue === anchor && hasValidValue;
            return (
              <Tooltip key={anchor}>
                <TooltipTrigger asChild>
                  <button
                    ref={(element) => {
                      buttonRefs.current[anchor] = element;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={anchorLabel(anchor)}
                    disabled={disabled || !available}
                    aria-disabled={disabled || !available || !canChange}
                    tabIndex={anchor === focusableAnchor ? 0 : -1}
                    data-state={selected ? 'on' : 'off'}
                    className={cn(
                      buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
                      'size-7 rounded-none bg-muted p-0 text-muted-foreground shadow-none hover:bg-muted/80 hover:text-foreground focus-visible:ring-inset',
                      cellBoundaryClass,
                      selected &&
                        'relative z-10 bg-background text-foreground hover:bg-background hover:text-foreground',
                      !available &&
                        'bg-muted/50 text-muted-foreground/40 opacity-100 hover:bg-muted/50 hover:text-muted-foreground/40',
                      !canChange && available && 'cursor-default',
                    )}
                    onClick={() => {
                      if (!canChange || !available) return;
                      onChange(anchor);
                    }}
                    onKeyDown={onKeyDown(anchor)}
                  >
                    {(variant === 'pivot' ? PIVOT_GLYPHS : ANCHOR_GLYPHS)[anchor]}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {anchorLabel(anchor)}
                </TooltipContent>
              </Tooltip>
            );
          }),
        )}
      </div>
      {hasValidValue ? (
        <p className="text-muted-foreground text-[11px] font-medium">{anchorLabel(normalizedValue)}</p>
      ) : (
        <div className="text-destructive flex items-center gap-1.5 text-[11px] font-medium">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          <span>Current anchor is unavailable</span>
        </div>
      )}
    </div>
  );
}

export interface AnchorFieldProps {
  label: string;
  value: string;
  onChange: (value: AnchorValue) => void;
  allowedAnchors?: readonly string[];
  description?: string;
  compact?: boolean;
  id?: string;
  childrenAfter?: ReactNode;
  disabled?: boolean;
  lock?: PropertyLockState | null;
  variant?: 'anchor' | 'pivot';
}

export function AnchorField({
  label,
  value,
  onChange,
  allowedAnchors,
  description,
  compact,
  id,
  childrenAfter,
  disabled = false,
  lock = null,
  variant = 'anchor',
}: AnchorFieldProps) {
  const anchors = useMemo(
    () => normalizeAllowedAnchors(allowedAnchors ?? ANCHOR_VALUES),
    [allowedAnchors],
  );
  return (
    <FieldRow label={label} description={description} htmlFor={id} compact={compact} childrenAfter={childrenAfter} lock={lock}>
      <AnchorPicker
        value={value}
        onChange={onChange}
        allowedAnchors={anchors}
        ariaLabel={label}
        disabled={disabled || lock?.locked === true}
        variant={variant}
      />
    </FieldRow>
  );
}
