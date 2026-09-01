import { cn } from '@/lib/utils';
import { Button } from '@/ui/shadcn/button';
import { Fragment, type ReactNode } from 'react';
import { FieldRow, humanizeFieldKey } from './field-row';
import type { PropertyLockState } from './property-lock';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';

type AlignmentMode = 'horizontal' | 'vertical' | 'text';

interface AlignmentFieldProps {
  label: string;
  value: string;
  options: readonly string[];
  optionDescriptions?: Partial<Record<string, string>>;
  onChange: (next: string) => void;
  description?: string;
  compact?: boolean;
  id?: string;
  mode: AlignmentMode;
  childrenAfter?: ReactNode;
  disabled?: boolean;
  lock?: PropertyLockState | null;
}

function GlyphFrame({ children }: { children: ReactNode }): ReactNode {
  return (
    <svg viewBox="0 0 16 16" className="size-5" aria-hidden="true">
      {children}
    </svg>
  );
}

function Stroke({ x1, y1, x2, y2, width = 1.5 }: { x1: number; y1: number; x2: number; y2: number; width?: number }) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth={width} strokeLinecap="round" />;
}

function AlignmentGlyph({ mode, value }: { mode: AlignmentMode; value: string }): ReactNode {
  if (mode === 'horizontal') {
    const configs: Record<string, Array<[number, number, number, number]>> = {
      left: [
        [4, 3, 4, 13],
        [6, 5, 12, 5],
        [6, 8, 10, 8],
        [6, 11, 12, 11],
      ],
      center: [
        [8, 3, 8, 13],
        [4, 5, 12, 5],
        [5, 8, 11, 8],
        [4, 11, 12, 11],
      ],
      right: [
        [12, 3, 12, 13],
        [4, 5, 10, 5],
        [6, 8, 12, 8],
        [4, 11, 10, 11],
      ],
      stretch: [
        [3, 3, 3, 13],
        [13, 3, 13, 13],
        [4, 5, 12, 5],
        [4, 8, 12, 8],
        [4, 11, 12, 11],
      ],
    };
    const glyph =
      configs[value] ??
      configs[value === 'start' ? 'left' : value === 'end' ? 'right' : value === 'justify' ? 'stretch' : 'center'];
    return (
      <GlyphFrame>
        {glyph.map(([x1, y1, x2, y2]) => (
          <Stroke key={`${x1}-${y1}-${x2}-${y2}`} x1={x1} y1={y1} x2={x2} y2={y2} />
        ))}
      </GlyphFrame>
    );
  }

  if (mode === 'vertical') {
    const configs: Record<string, Array<[number, number, number, number]>> = {
      top: [
        [3, 4, 13, 4],
        [5, 6, 5, 12],
        [8, 6, 8, 10],
        [11, 6, 11, 12],
      ],
      center: [
        [3, 8, 13, 8],
        [5, 4, 5, 12],
        [8, 6, 8, 10],
        [11, 4, 11, 12],
      ],
      bottom: [
        [3, 12, 13, 12],
        [5, 4, 5, 10],
        [8, 6, 8, 12],
        [11, 4, 11, 10],
      ],
      stretch: [
        [3, 3, 13, 3],
        [3, 13, 13, 13],
        [5, 4, 5, 12],
        [8, 4, 8, 12],
        [11, 4, 11, 12],
      ],
    };
    const glyph =
      configs[value === 'start' ? 'top' : value === 'end' ? 'bottom' : value === 'justify' ? 'stretch' : value] ??
      configs.center;
    return (
      <GlyphFrame>
        {glyph.map(([x1, y1, x2, y2]) => (
          <Stroke key={`${x1}-${y1}-${x2}-${y2}`} x1={x1} y1={y1} x2={x2} y2={y2} />
        ))}
      </GlyphFrame>
    );
  }

  if (mode === 'text') {
    const configs: Record<string, Array<[number, number, number, number]>> = {
      start: [
        [3, 3, 3, 13],
        [5, 5, 13, 5],
        [5, 8, 10, 8],
        [5, 11, 12, 11],
      ],
      center: [
        [3, 3, 13, 3],
        [5, 5, 11, 5],
        [4, 8, 12, 8],
        [5, 11, 11, 11],
      ],
      end: [
        [13, 3, 13, 13],
        [3, 5, 11, 5],
        [6, 8, 11, 8],
        [4, 11, 11, 11],
      ],
      justify: [
        [3, 3, 13, 3],
        [3, 8, 13, 8],
        [3, 13, 13, 13],
      ],
    };
    const glyph = configs[value] ?? configs.start;
    return (
      <GlyphFrame>
        {glyph.map(([x1, y1, x2, y2]) => (
          <Stroke key={`${x1}-${y1}-${x2}-${y2}`} x1={x1} y1={y1} x2={x2} y2={y2} />
        ))}
      </GlyphFrame>
    );
  }

  const lines: Record<'left' | 'center' | 'right' | 'justify', Array<[number, number, number]>> = {
    left: [
      [3, 4, 10],
      [3, 8, 7],
      [3, 12, 11],
    ],
    center: [
      [4, 4, 12],
      [3, 8, 13],
      [4, 12, 12],
    ],
    right: [
      [6, 4, 13],
      [5, 8, 13],
      [3, 12, 13],
    ],
    justify: [
      [3, 4, 13],
      [3, 8, 13],
      [3, 12, 13],
    ],
  };
  const glyph = lines[(value as 'left' | 'center' | 'right' | 'justify')] ?? lines.left;

  return (
    <GlyphFrame>
      {glyph.map(([x1, y, x2]) => (
        <Stroke key={`${x1}-${y}-${x2}`} x1={x1} y1={y} x2={x2} y2={y} />
      ))}
    </GlyphFrame>
  );
}

function AlignmentOptionContent({ mode, option }: { mode: AlignmentMode; option: string }): ReactNode {
  const logicalLabel = mode === 'horizontal' && (option === 'start' || option === 'end') ? option[0].toUpperCase() : null;
  return (
    <span className="inline-flex items-center justify-center gap-0.5">
      {logicalLabel === 'S' && <span className="text-[10px] leading-none font-bold">S</span>}
      <AlignmentGlyph mode={mode} value={option} />
      {logicalLabel === 'E' && <span className="text-[10px] leading-none font-bold">E</span>}
    </span>
  );
}

/** Icon-first segmented control for alignment-style fields. */
export function AlignmentField({
  label,
  value,
  options,
  optionDescriptions,
  onChange,
  description,
  compact,
  id,
  mode,
  childrenAfter,
  disabled = false,
  lock = null,
}: AlignmentFieldProps) {
  return (
    <FieldRow label={label} description={description} htmlFor={id} compact={compact} childrenAfter={childrenAfter} lock={lock}>
      <div className="flex w-full min-w-0 overflow-hidden rounded-md border border-border/70 bg-muted">
        {options.map((option) => {
          const active = option === value;
          const optionDescription = optionDescriptions?.[option];
          const button = (
            <Button
              type="button"
              variant="ghost"
              className={cn(
                'h-8 min-w-0 flex-1 basis-0 rounded-none bg-muted px-0 text-muted-foreground shadow-none hover:bg-muted/80 hover:text-foreground',
                active && 'bg-background text-foreground hover:bg-background',
                option !== options[options.length - 1] && 'border-r border-border/70',
              )}
              aria-pressed={active}
              disabled={disabled || lock?.locked === true}
              aria-label={`${label} ${option}`}
              title={optionDescription ?? humanizeFieldKey(option)}
              onClick={() => onChange(option)}
            >
              <AlignmentOptionContent mode={mode} option={option} />
            </Button>
          );
          return optionDescription ? (
            <Tooltip key={option}>
              <TooltipTrigger asChild>{button}</TooltipTrigger>
              <TooltipContent side="top">{optionDescription}</TooltipContent>
            </Tooltip>
          ) : (
            <Fragment key={option}>{button}</Fragment>
          );
        })}
      </div>
    </FieldRow>
  );
}
