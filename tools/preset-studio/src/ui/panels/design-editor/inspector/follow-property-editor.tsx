import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import type {
  FollowMapping,
  FollowOffsetUnit,
  FollowPropertyDefinition,
} from '@captioncat/caption-engine/browser';
import {
  FOLLOW_PROPERTY_DEFINITIONS,
  FOLLOW_SOURCE_DEFINITIONS,
} from '@captioncat/caption-engine/browser';
import { DeferredNumberInput } from '@/ui/controls/deferred-number-input';
import { InfoTooltip } from '@/ui/controls/info-tooltip';
import { PropertyLockIndicator, type PropertyLockState } from '@/ui/controls/property-lock';
import { Badge } from '@/ui/shadcn/badge';
import { Button } from '@/ui/shadcn/button';
import { Checkbox } from '@/ui/shadcn/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/shadcn/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/shadcn/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';

interface FollowTargetAvailability {
  available: boolean;
  reason?: string;
}

function propertyDefinitionFor(mapping: FollowMapping): FollowPropertyDefinition | undefined {
  return FOLLOW_PROPERTY_DEFINITIONS.find((definition) => definition.destination === mapping.destination);
}

function sourceLabelFor(source: string): string {
  return FOLLOW_SOURCE_DEFINITIONS.find((definition) => definition.path === source)?.label ?? 'Source unavailable';
}

function sourceIsValid(mapping: FollowMapping, definition: FollowPropertyDefinition): boolean {
  return definition.sourcePaths.some((path) => path === mapping.source);
}

function offsetUnitLabel(unit: FollowOffsetUnit): string {
  switch (unit) {
    case 'opacity':
      return '%';
    case 'scale':
      return 'x';
    case 'dimension':
    case 'position':
      return 'pt';
  }
}

function offsetStep(unit: FollowOffsetUnit): number {
  switch (unit) {
    case 'opacity':
      return 0.1;
    case 'scale':
      return 0.01;
    case 'dimension':
    case 'position':
      return 0.1;
  }
}

function displayOffset(definition: FollowPropertyDefinition, offset: number): number {
  return definition.offsetUnit === 'opacity' ? offset * 100 : offset;
}

function storedOffset(definition: FollowPropertyDefinition, offset: number): number {
  return definition.offsetUnit === 'opacity' ? offset / 100 : offset;
}

function unavailableValue(destination: string, index: number): string {
  return `unavailable:${destination}:${index}`;
}

function FollowPropertyRow({
  mapping,
  mappingIndex,
  definition,
  mappingsDisabled,
  targetAvailability,
  onChange,
  onDelete,
}: {
  mapping: FollowMapping;
  mappingIndex: number;
  definition: FollowPropertyDefinition;
  mappingsDisabled: boolean;
  targetAvailability: FollowTargetAvailability;
  onChange: (mapping: FollowMapping) => void;
  onDelete: () => void;
}): ReactNode {
  const validSource = sourceIsValid(mapping, definition);
  const unavailableReason = !validSource
    ? 'This source is not valid for the selected property.'
    : targetAvailability.available
      ? undefined
      : targetAvailability.reason;
  const sourceUnavailable = unavailableReason !== undefined;
  const unavailableSourceValue = unavailableValue(mapping.destination, mappingIndex);
  const sourceValue = sourceUnavailable ? unavailableSourceValue : mapping.source;
  const hasOffset = mapping.offset !== undefined;
  const offsetValue = displayOffset(definition, mapping.offset ?? 0);

  return (
    <div className="space-y-2 rounded-md border border-border/70 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium">{definition.label}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Delete ${definition.label} follow`}
          disabled={mappingsDisabled}
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-muted-foreground shrink-0 text-[11px]">Follow</span>
        <Select
          value={sourceValue}
          onValueChange={(value) => onChange({ ...mapping, source: value })}
          disabled={mappingsDisabled}
        >
          <SelectTrigger className="h-8 min-w-0 flex-1 text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {definition.sourcePaths.map((source) => (
              <SelectItem key={source} value={source}>
                {sourceLabelFor(source)}
              </SelectItem>
            ))}
            {sourceUnavailable && (
              <SelectItem value={unavailableSourceValue} disabled>
                <span className="flex items-center gap-1.5 text-destructive">
                  <AlertTriangle className="size-3" />
                  Source unavailable
                </span>
              </SelectItem>
            )}
          </SelectContent>
        </Select>
        {sourceUnavailable && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                role="img"
                aria-label="Follow source unavailable"
                title={unavailableReason}
                className="text-destructive inline-flex shrink-0"
              >
                <AlertTriangle className="size-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-64 text-xs">
              {unavailableReason}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <label className="text-muted-foreground flex items-center gap-2 text-[11px]">
        <Checkbox
          checked={hasOffset}
          disabled={mappingsDisabled}
          onCheckedChange={(checked) =>
            onChange(checked === true ? { ...mapping, offset: mapping.offset ?? 0 } : removeOffset(mapping))
          }
        />
        <span>Offset</span>
      </label>
      {hasOffset && (
        <DeferredNumberInput
          value={offsetValue}
          onCommit={(value) => onChange({ ...mapping, offset: storedOffset(definition, value) })}
          step={offsetStep(definition.offsetUnit)}
          inlineEndContent={offsetUnitLabel(definition.offsetUnit)}
          aria-label={`${definition.label} follow offset`}
          disabled={mappingsDisabled}
          className="h-8 text-[11px]"
        />
      )}
    </div>
  );
}

function removeOffset(mapping: FollowMapping): FollowMapping {
  const { offset: _offset, ...withoutOffset } = mapping;
  return withoutOffset;
}

function UnavailableFollowPropertyRow({
  mappingIndex,
  mappingsDisabled,
  onDelete,
}: {
  mappingIndex: number;
  mappingsDisabled: boolean;
  onDelete: () => void;
}): ReactNode {
  const label = `Unsupported follow property ${mappingIndex + 1}`;
  return (
    <div className="space-y-1.5 rounded-md border border-destructive/40 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium">{label}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Delete ${label}`}
          disabled={mappingsDisabled}
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-destructive">
        <AlertTriangle className="size-3.5 shrink-0" />
        <span>This follow property is no longer supported.</span>
        <Badge variant="destructive">Unavailable</Badge>
      </div>
    </div>
  );
}

export function FollowPropertyEditor({
  mappings,
  mappingsLock,
  targetAvailability = { available: true },
  onChange,
}: {
  mappings: readonly FollowMapping[];
  mappingsLock: PropertyLockState | null;
  targetAvailability?: FollowTargetAvailability;
  onChange: (mappings: FollowMapping[]) => void;
}): ReactNode {
  const [addOpen, setAddOpen] = useState(false);
  const mappingsDisabled = mappingsLock?.locked === true;
  const activeDestinations = new Set(mappings.map((mapping) => mapping.destination));
  const availableProperties = FOLLOW_PROPERTY_DEFINITIONS.filter(
    (definition) => !activeDestinations.has(definition.destination),
  );

  const updateMapping = (mappingIndex: number, mapping: FollowMapping): void => {
    onChange(mappings.map((entry, index) => (index === mappingIndex ? mapping : entry)));
  };

  const addProperty = (definition: FollowPropertyDefinition): void => {
    const source = definition.sourcePaths[0];
    if (!source) return;
    onChange([...mappings, { destination: definition.destination, source }]);
    setAddOpen(false);
  };

  return (
    <div className="border-border/60 space-y-2 border-t pt-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <p className="text-muted-foreground text-[10px] font-semibold tracking-widest uppercase">Follow</p>
          <InfoTooltip ariaLabel="Explain Follow mappings" side="top">
            Each mapping copies the selected source property from the target to the destination named above.
            Enable Offset to adjust the copied value after it is read. Offset units depend on the destination.
          </InfoTooltip>
        </div>
        <div className="flex items-center gap-1">
          <Popover open={addOpen} onOpenChange={setAddOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={mappingsDisabled || availableProperties.length === 0}
              >
                <Plus className="size-3" />
                Add
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 space-y-2 p-2.5">
              <p className="text-muted-foreground text-[10px] font-semibold tracking-widest uppercase">
                Add Follow Property
              </p>
              <div className="space-y-1">
                {availableProperties.map((definition) => (
                  <Button
                    key={definition.id}
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-xs"
                    onClick={() => addProperty(definition)}
                  >
                    {definition.label}
                  </Button>
                ))}
                {availableProperties.length === 0 && (
                  <p className="text-muted-foreground px-2 py-1 text-[11px]">All properties are already followed.</p>
                )}
              </div>
            </PopoverContent>
          </Popover>
          <PropertyLockIndicator lock={mappingsLock} className="size-3" />
        </div>
      </div>
      {mappings.length === 0 ? (
        <p className="text-muted-foreground text-[11px]">Choose a property to add a follow relationship.</p>
      ) : (
        <div className="space-y-2">
          {mappings.map((mapping, mappingIndex) => {
            const definition = propertyDefinitionFor(mapping);
            return definition ? (
              <FollowPropertyRow
                key={`${mapping.destination}-${mappingIndex}`}
                mapping={mapping}
                mappingIndex={mappingIndex}
                definition={definition}
                mappingsDisabled={mappingsDisabled}
                targetAvailability={targetAvailability}
                onChange={(next) => updateMapping(mappingIndex, next)}
                onDelete={() => onChange(mappings.filter((_, index) => index !== mappingIndex))}
              />
            ) : (
              <UnavailableFollowPropertyRow
                key={`unsupported-${mappingIndex}`}
                mappingIndex={mappingIndex}
                mappingsDisabled={mappingsDisabled}
                onDelete={() => onChange(mappings.filter((_, index) => index !== mappingIndex))}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
