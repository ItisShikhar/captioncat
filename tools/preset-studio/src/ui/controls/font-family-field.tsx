import { closestCenter, DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { resolveFontFamilyEntry } from '@captioncat/caption-engine/browser';
import {
  BUNDLED_FONT_FAMILIES,
  FONT_REGISTRY_FAMILIES,
  GENERIC_FONT_FALLBACKS,
  isVariableFontFamily,
  isRemoteFontUrl,
} from '@/schema/font-manifest';
import { MUTED_ACTION_GROUP_CLASS, mutedActionButtonClass } from '@/ui/controls/muted-action-button';
import { Button } from '@/ui/shadcn/button';
import { Badge } from '@/ui/shadcn/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/ui/shadcn/command';
import { Input } from '@/ui/shadcn/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/shadcn/popover';
import { GripVertical, Link2, Plus, Trash2, Type } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { FieldRow } from './field-row';
import { PastelDotLoader } from '@/ui/components/pastel-dot-loader';
import type { PropertyLockState } from './property-lock';

interface FontFamilyFieldProps {
  label: string;
  value: string | string[];
  onChange: (next: string[]) => void;
  description?: string;
  emptyMessage?: string;
  compact?: boolean;
  id?: string;
  disabled?: boolean;
  lock?: PropertyLockState | null;
}

function normalize(value: string | string[]): string[] {
  if (Array.isArray(value)) return value.filter((v) => typeof v === 'string' && v.trim().length > 0);
  return typeof value === 'string' && value.trim().length > 0 ? [value] : [];
}

function fontEntryId(entry: string, index: number): string {
  return `font-family-${index}-${entry}`;
}

function VariableFontBadge(): ReactNode {
  return (
    <Badge variant="secondary" className="ml-auto px-1 py-0 text-[9px] tracking-widest uppercase">
      Variable
    </Badge>
  );
}

function SortableFontEntry({
  entry,
  index,
  onRemove,
  disabled = false,
}: {
  entry: string;
  index: number;
  onRemove: () => void;
  disabled?: boolean;
}): ReactNode {
  const id = fontEntryId(entry, index);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        MUTED_ACTION_GROUP_CLASS,
        isDragging && 'relative z-10 opacity-70',
        disabled && 'opacity-60',
      )}
    >
      {isRemoteFontUrl(entry) ? (
        <Link2 className="text-muted-foreground size-3.5 shrink-0" />
      ) : (
        <Type className="text-muted-foreground size-3.5 shrink-0" />
      )}
      <span className="flex-1 truncate text-xs" title={entry}>
        {entry}
      </span>
      {isVariableFontFamily(entry) && <VariableFontBadge />}
      <span className="text-muted-foreground/70 text-[10px]">{index === 0 ? 'PRIMARY' : 'FALLBACK'}</span>
      <div className="flex shrink-0 items-center">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className={mutedActionButtonClass('start', 'default', 'cursor-grab active:cursor-grabbing')}
          aria-label={`Drag ${entry} to reorder`}
          disabled={disabled}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className={mutedActionButtonClass('end', 'destructive')}
          onClick={onRemove}
          aria-label={`Remove ${entry}`}
          disabled={disabled}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

/**
 * `fontFamily` leaves store an ordered CSS-style font stack: any mix of
 * bundled family names, Google Fonts (or other) URLs, and generic CSS
 * fallbacks such as `sans-serif`. The engine resolves URL entries into real
 * font files at render time (see `src/utilities/font-utils.ts`). Here we
 * let the user build/reorder that stack.
 */
export function FontFamilyField({
  label,
  value,
  onChange,
  description,
  emptyMessage,
  compact,
  id,
  disabled = false,
  lock = null,
}: FontFamilyFieldProps) {
  const entries = normalize(value);
  const [open, setOpen] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const addEntry = (entry: string) => {
    const trimmed = entry.trim();
    if (!trimmed) return;
    onChange([...entries, trimmed]);
  };

  /**
 * Commit the URL/name draft. For a remote font URL we first await the actual
 * font load (fetches the CSS + registers the FontFace so the preview can use
 * it), showing an in-button spinner throughout. The entry is added once the
 * load resolves or fails so the field never silently swallows a bad URL.
 */
  const commitDraft = async () => {
    const trimmed = urlDraft.trim();
    if (!trimmed || loading || disabled) return;
    if (isRemoteFontUrl(trimmed)) {
      setLoading(true);
      try {
        await resolveFontFamilyEntry(trimmed);
      } catch (error) {
        toast.error(`Unable to load font: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        addEntry(trimmed);
        setUrlDraft('');
        setLoading(false);
      }
      return;
    }
    addEntry(trimmed);
    setUrlDraft('');
  };

  const removeEntry = (index: number) => onChange(entries.filter((_, i) => i !== index));

  const onDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return;
    const ids = entries.map(fontEntryId);
    const activeIndex = ids.indexOf(String(event.active.id));
    const overIndex = ids.indexOf(String(event.over.id));
    if (activeIndex < 0 || overIndex < 0) return;
    onChange(arrayMove(entries, activeIndex, overIndex));
  };

  return (
    <FieldRow label={label} description={description} htmlFor={id} compact={compact} lock={lock}>
      <div className="flex flex-col gap-1.5">
        {entries.length === 0 && (
          <p className="text-muted-foreground text-xs italic">
            {emptyMessage ?? 'No fonts set - add a bundled font, URL, or fallback.'}
          </p>
        )}
        <DndContext autoScroll={false} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={entries.map(fontEntryId)} strategy={verticalListSortingStrategy}>
            {entries.map((entry, index) => (
              <SortableFontEntry
                key={fontEntryId(entry, index)}
                entry={entry}
                index={index}
                onRemove={() => removeEntry(index)}
                disabled={disabled || lock?.locked === true}
              />
            ))}
          </SortableContext>
        </DndContext>

        <div className="flex items-center gap-1.5">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm" disabled={disabled || lock?.locked === true}>
                <Plus className="size-3.5" />
                Add font
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start">
              <Command>
                <CommandInput placeholder="Search fonts..." />
                <CommandList>
                  <CommandEmpty>No matching font.</CommandEmpty>
                  {BUNDLED_FONT_FAMILIES.length > 0 && (
                    <>
                      <CommandGroup heading="Bundled fonts">
                        {BUNDLED_FONT_FAMILIES.map((font) => (
                          <CommandItem
                            key={font.family}
                            value={font.family}
                            onSelect={() => {
                              if (disabled || lock?.locked) return;
                              addEntry(font.family);
                              setOpen(false);
                            }}
                          >
                            {font.family}
                            {font.supportsVariableWeight && <VariableFontBadge />}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                      <CommandSeparator />
                    </>
                  )}
                  <CommandGroup heading="Registry fonts">
                    {FONT_REGISTRY_FAMILIES.filter(
                      (font) => !BUNDLED_FONT_FAMILIES.some((bundled) => bundled.family === font.family),
                    ).map((font) => (
                      <CommandItem
                        key={font.family}
                        value={font.family}
                        onSelect={() => {
                          if (disabled || lock?.locked) return;
                          addEntry(font.family);
                          setOpen(false);
                        }}
                      >
                        {font.family}
                        {font.supportsVariableWeight && <VariableFontBadge />}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  <CommandSeparator />
                  <CommandGroup heading="Generic fallback">
                    {GENERIC_FONT_FALLBACKS.map((fallback) => (
                      <CommandItem
                        key={fallback}
                        value={fallback}
                        onSelect={() => {
                          if (disabled || lock?.locked) return;
                          addEntry(fallback);
                          setOpen(false);
                        }}
                      >
                        {fallback}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <Input
            className="h-8 flex-1"
            placeholder="Paste a Google Fonts URL or type a custom font name..."
            value={urlDraft}
            disabled={disabled || lock?.locked === true || loading}
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void commitDraft();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="relative w-16 shrink-0"
            disabled={disabled || lock?.locked === true || loading || !urlDraft.trim()}
            onClick={() => void commitDraft()}
          >
            <span className={cn('transition-opacity duration-200', loading && 'opacity-0')}>Add</span>
            {loading && <PastelDotLoader size="md" className="absolute inset-0 m-auto" />}
          </Button>
        </div>
      </div>
    </FieldRow>
  );
}
