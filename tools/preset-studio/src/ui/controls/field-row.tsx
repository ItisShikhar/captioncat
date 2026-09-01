import { cn } from '@/lib/utils';
import { Label } from '@/ui/shadcn/label';
import { createContext, useContext, type ReactNode } from 'react';
import { InfoTooltip } from './info-tooltip';
import {
  INSPECTOR_FIELD_CONTENT_GAP_CLASS,
  INSPECTOR_FIELD_VERTICAL_PADDING_CLASS,
} from './inspector-layout';
import { PropertyLockIndicator, type PropertyLockState } from './property-lock';
import { ScrubLabel } from './scrub-label';

export const FieldLabelExtraContext = createContext<ReactNode>(null);

/**
 * Turns a camelCase or kebab/snake-case field key (or enum value) into a human label,
 * e.g. "wordSpacingOffset" -> "Word Spacing Offset", "row-content" -> "Row Content".
 */
export function humanizeFieldKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ');
  return spaced
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Lets a numeric field's own row label be dragged to scrub its value - see `ScrubLabel`. */
export interface FieldRowScrubProps {
  getValue: () => number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onScrubStart?: () => void;
}

interface FieldRowProps {
  label: string;
  description?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  childrenAfter?: ReactNode;
  className?: string;
  /** Compact rows are used inside dense contexts like vector2/list items. */
  compact?: boolean;
  /** Render the control before the label for checkbox-style fields. */
  inline?: boolean;
  /** Render the label before the control when the row is inline. */
  labelFirst?: boolean;
  /** Optional leading icon rendered before the label text (used for padding preview affordances). */
  labelPrefix?: ReactNode;
  /** Optional small icon/button rendered at the end of the label column (e.g. Composition Area's padding-overlay toggle, placed next to its own field via `FieldOverridesContext` instead of a card header). */
  labelExtra?: ReactNode;
  /** When set, the row's own label becomes draggable (two-headed resize cursor) to scrub the field's numeric value directly, without having to land on the number box itself. */
  scrub?: FieldRowScrubProps;
  lock?: PropertyLockState | null;
}

/** Shared label + control row layout used by every leaf control. */
export function FieldRow({
  label,
  description,
  htmlFor,
  children,
  childrenAfter,
  className,
  compact,
  inline = false,
  labelFirst = false,
  labelPrefix,
  labelExtra,
  scrub,
  lock,
}: FieldRowProps) {
  const contextualLabelExtra = useContext(FieldLabelExtraContext);
  const renderLabel = (labelClassName: string): ReactNode => (
    <>
      {labelPrefix}
      {scrub ? (
        <ScrubLabel
          htmlFor={htmlFor}
          className={labelClassName}
          getValue={scrub.getValue}
          onChange={scrub.onChange}
          min={scrub.min}
          max={scrub.max}
          step={scrub.step}
          disabled={scrub.disabled}
          onScrubStart={scrub.onScrubStart}
        >
          {label}
        </ScrubLabel>
      ) : (
        <Label htmlFor={htmlFor} className={labelClassName}>
          {label}
        </Label>
      )}
      {description && <InfoTooltip ariaLabel={`Explain ${label}`}>{description}</InfoTooltip>}
      {labelExtra}
      {contextualLabelExtra}
    </>
  );

  if (inline) {
    const controlContent = <div className="flex shrink-0 items-center">{children}</div>;
    const labelContent = (
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {renderLabel('text-muted-foreground truncate text-xs font-medium')}
      </div>
    );

    return (
      <div
        className={cn(
          'flex min-w-0 flex-col',
          INSPECTOR_FIELD_CONTENT_GAP_CLASS,
          INSPECTOR_FIELD_VERTICAL_PADDING_CLASS,
          compact && 'py-1',
          className,
        )}
      >
        <div className="flex min-h-5 w-full min-w-0 items-center gap-1.5">
          {labelFirst ? (
            <>
              {labelContent}
              {controlContent}
            </>
          ) : (
            <>
              {controlContent}
              {labelContent}
            </>
          )}
          <PropertyLockIndicator lock={lock} />
          {childrenAfter && <div className="flex shrink-0 items-center gap-1">{childrenAfter}</div>}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col',
        INSPECTOR_FIELD_CONTENT_GAP_CLASS,
        INSPECTOR_FIELD_VERTICAL_PADDING_CLASS,
        compact && 'py-1',
        className,
      )}
    >
      <div className="flex min-h-5 items-center gap-1">
        {renderLabel('text-muted-foreground text-xs font-medium')}
      </div>
      <div className="flex w-full items-center gap-1.5">
        <div className="min-w-0 flex-1">{children}</div>
        <PropertyLockIndicator lock={lock} />
        {childrenAfter && <div className="flex shrink-0 items-center gap-1">{childrenAfter}</div>}
      </div>
    </div>
  );
}
