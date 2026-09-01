import { valuesEqual } from '@/lib/values-equal';
import type { LeafDefinition, PropertyNode } from '@/schema/property-tree';
import { parseNode, serializeNode } from '@/schema/property-tree';
import { Button } from '@/ui/shadcn/button';
import { ChevronDown, ChevronUp, Layers2, Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';

interface ListEditorProps {
  node: LeafDefinition;
  label: string;
  onChange: (updater: (previous: PropertyNode) => PropertyNode) => void;
  /** Renders one item at `index` and receives the item's change handler. */
  renderItem: (rawItem: unknown, index: number, onItemChange: (nextRaw: unknown) => void) => ReactNode;
}

function rawArray(node: LeafDefinition): unknown[] {
  return Array.isArray(node.value) ? node.value : [];
}

/**
 * Add/duplicate/remove/reorder chrome around a `list`/`array` leaf. Operates
 * directly on the leaf's raw JSON array so it works for both container items
 * (backgrounds, strokes, shadows, borders) and raw primitive items (e.g. a
 * fixed `[x, y]` scale pair) without losing data that does not parse as a
 * `PropertyNode`.
 */
export function ListEditor({ node, label, onChange, renderItem }: ListEditorProps) {
  const items = rawArray(node);

  const updateArray = (next: unknown[]) => {
    if (valuesEqual(node.value, next)) return;
    onChange((prev) => (prev.kind === 'leaf' ? { ...prev, value: next } : prev));
  };

  const addItem = () => {
    const template = items.length > 0 ? structuredClone(items[items.length - 1]) : emptyTemplateFor(items);
    updateArray([...items, template]);
  };

  const duplicateItem = (index: number) => {
    const copy = structuredClone(items[index]);
    const next = [...items];
    next.splice(index + 1, 0, copy);
    updateArray(next);
  };

  const removeItem = (index: number) => {
    updateArray(items.filter((_, i) => i !== index));
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    updateArray(next);
  };

  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 && <p className="text-muted-foreground py-1 text-xs italic">No items yet.</p>}
      {items.map((rawItem, index) => (
        <div key={index} className="border-border/60 rounded-md border border-dashed p-2">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
              {label} #{index + 1}
            </p>
            <div className="flex items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                disabled={index === 0}
                onClick={() => moveItem(index, -1)}
                aria-label={`Move ${label} ${index + 1} up`}
              >
                <ChevronUp className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                disabled={index === items.length - 1}
                onClick={() => moveItem(index, 1)}
                aria-label={`Move ${label} ${index + 1} down`}
              >
                <ChevronDown className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => duplicateItem(index)}
                aria-label={`Duplicate ${label} ${index + 1}`}
              >
                <Layers2 className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="text-destructive hover:text-destructive"
                onClick={() => removeItem(index)}
                aria-label={`Remove ${label} ${index + 1}`}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </div>
          {renderItem(rawItem, index, (nextRaw) => {
            const next = [...items];
            next[index] = nextRaw;
            updateArray(next);
          })}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="w-fit" onClick={addItem}>
        <Plus className="size-3.5" />
        Add {label}
      </Button>
    </div>
  );
}

/** Blank item used when an empty list has no item to duplicate. */
function emptyTemplateFor(items: unknown[]): unknown {
  void items;
  return { type: 'object', value: null };
}

/** Parses a raw array item into a `PropertyNode`, or `undefined` if it is a raw primitive value. */
export function parseListItemNode(rawItem: unknown): PropertyNode | undefined {
  return parseNode(rawItem);
}

export { serializeNode as serializeListItemNode };
