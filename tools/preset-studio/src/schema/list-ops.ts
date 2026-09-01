import type { LeafDefinition, PropertyNode } from './property-tree';
import { isLeaf, parseListItems, serializeNode } from './property-tree';

function assertListLeaf(node: PropertyNode): asserts node is LeafDefinition {
  if (!isLeaf(node) || (node.type !== 'list' && node.type !== 'array')) {
    throw new Error('Expected a list/array leaf node');
  }
}

/** Appends `item` (already-serialized node) to the end of a list leaf's value array. */
export function addListItem(list: PropertyNode, item: PropertyNode): LeafDefinition {
  assertListLeaf(list);
  const value = Array.isArray(list.value) ? list.value : [];
  return { ...list, value: [...value, serializeNode(item)] };
}

/** Duplicates the item at `index`, inserting the copy immediately after it. */
export function duplicateListItem(list: PropertyNode, index: number): LeafDefinition {
  assertListLeaf(list);
  const value = Array.isArray(list.value) ? list.value : [];
  if (index < 0 || index >= value.length) {
    throw new Error(`duplicateListItem: index ${index} out of range`);
  }
  const copy = structuredClone(value[index]);
  const next = [...value];
  next.splice(index + 1, 0, copy);
  return { ...list, value: next };
}

/** Removes the item at `index`. */
export function removeListItem(list: PropertyNode, index: number): LeafDefinition {
  assertListLeaf(list);
  const value = Array.isArray(list.value) ? list.value : [];
  return { ...list, value: value.filter((_, i) => i !== index) };
}

/** Moves the item at `fromIndex` to `toIndex`, shifting the others. */
export function moveListItem(list: PropertyNode, fromIndex: number, toIndex: number): LeafDefinition {
  assertListLeaf(list);
  const value = Array.isArray(list.value) ? list.value : [];
  if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= value.length) {
    return { ...list, value };
  }
  const next = [...value];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, moved);
  return { ...list, value: next };
}

/** Number of parsed items currently in a list leaf. */
export function listItemCount(list: PropertyNode): number {
  assertListLeaf(list);
  return parseListItems(list).length;
}
