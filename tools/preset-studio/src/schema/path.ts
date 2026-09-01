import type { ContainerNode, LeafDefinition, PropertyNode } from './property-tree';
import { isContainer, isLeaf, parseListItems, serializeNode } from './property-tree';

/**
 * A path into the property tree. String segments walk into a container's
 * `children`. Number segments walk into a `list`/`array` leaf's item at that
 * index.
 */
export type PropertyPath = ReadonlyArray<string | number>;

export function pathKey(path: PropertyPath): string {
  return path.map((seg) => (typeof seg === 'number' ? `[${seg}]` : seg)).join('.');
}

/** Reads the node at `path`, starting from `root`. Returns `undefined` if the path does not resolve. */
export function getNodeAt(root: PropertyNode, path: PropertyPath): PropertyNode | undefined {
  let current: PropertyNode | undefined = root;
  for (const segment of path) {
    if (!current) return undefined;
    if (typeof segment === 'string') {
      if (!isContainer(current)) return undefined;
      current = current.children[segment];
    } else {
      if (!isLeaf(current) || (current.type !== 'list' && current.type !== 'array')) return undefined;
      current = parseListItems(current)[segment];
    }
  }
  return current;
}

/**
 * Returns a new tree with the node at `path` replaced by `updater(previous)`.
 * Every container/list along the path is shallow-cloned so React identity
 * changes propagate correctly. Untouched siblings keep their references.
 */
export function updateNodeAt(
  root: PropertyNode,
  path: PropertyPath,
  updater: (previous: PropertyNode) => PropertyNode,
): PropertyNode {
  if (path.length === 0) {
    return updater(root);
  }

  const [head, ...rest] = path;

  if (typeof head === 'string') {
    if (!isContainer(root)) {
      throw new Error(`updateNodeAt: expected container at path segment "${head}"`);
    }
    const child = root.children[head];
    if (!child) {
      throw new Error(`updateNodeAt: no child "${head}" in container`);
    }
    const updatedChild = updateNodeAt(child, rest, updater);
    const clone: ContainerNode = { ...root, children: { ...root.children, [head]: updatedChild } };
    return clone;
  }

  // Numeric segment: rewrite one item inside a list/array leaf's raw value array.
  if (!isLeaf(root) || (root.type !== 'list' && root.type !== 'array') || !Array.isArray(root.value)) {
    throw new Error(`updateNodeAt: expected list/array leaf at numeric path segment [${head}]`);
  }
  const items = parseListItems(root);
  const item = items[head];
  if (!item) {
    throw new Error(`updateNodeAt: no list item at index ${head}`);
  }
  const updatedItem = updateNodeAt(item, rest, updater);
  const newValue = [...root.value];
  newValue[head] = serializeNode(updatedItem);
  const clone: LeafDefinition = { ...root, value: newValue };
  return clone;
}

/** Sets a leaf's primitive `value` at `path` (must resolve to a leaf). */
export function setLeafValue(root: PropertyNode, path: PropertyPath, value: unknown): PropertyNode {
  return updateNodeAt(root, path, (prev) => {
    if (!isLeaf(prev)) {
      throw new Error(`setLeafValue: node at path is not a leaf`);
    }
    return { ...prev, value };
  });
}

/** Enables/disables and replaces a leaf's `animation` config at `path`. Pass `undefined` to remove animation. */
export function setLeafAnimation(
  root: PropertyNode,
  path: PropertyPath,
  animation: LeafDefinition['animation'],
): PropertyNode {
  return updateNodeAt(root, path, (prev) => {
    if (!isLeaf(prev)) {
      throw new Error(`setLeafAnimation: node at path is not a leaf`);
    }
    return { ...prev, animation };
  });
}

/** Replaces a leaf's `transition` config at `path`. Pass `undefined` to remove it. */
export function setLeafTransition(
  root: PropertyNode,
  path: PropertyPath,
  transition: LeafDefinition['transition'],
): PropertyNode {
  return updateNodeAt(root, path, (prev) => {
    if (!isLeaf(prev)) {
      throw new Error(`setLeafTransition: node at path is not a leaf`);
    }
    return { ...prev, transition };
  });
}
