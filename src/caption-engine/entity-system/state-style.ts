import type { StateTemplateKey } from '../preview-types';
import { STATE_STYLE_SOURCES } from './state-style-types';
import type { StateStyleSource } from './state-style-types';
export { STATE_STYLE_SOURCES } from './state-style-types';
export type { StateStyleSource } from './state-style-types';

export function isStateStyleSource(value: unknown): value is StateStyleSource {
  return typeof value === 'string' && STATE_STYLE_SOURCES.includes(value as StateStyleSource);
}

interface StateStyleNodeLike {
  entity: string;
  id: string;
  styleSource?: unknown;
  components?: unknown;
  effects?: unknown;
  children?: StateStyleNodeLike[];
}

function stateParts(node: StateStyleNodeLike): { kind: string; suffix: string } | undefined {
  const separator = node.id.indexOf(':');
  if (separator < 0) return undefined;
  const kind = node.id.slice(0, separator);
  const suffix = node.id.slice(separator + 1);
  if ((kind !== 'row' && kind !== 'word') || !STATE_STYLE_SOURCES.includes(suffix as StateStyleSource)) {
    return undefined;
  }
  return { kind, suffix };
}

function isRelativeStateNode(node: StateStyleNodeLike): boolean {
  const parts = stateParts(node);
  return parts !== undefined && parts.suffix !== 'default';
}

function clearInheritedPayload<T extends StateStyleNodeLike>(node: T): T {
  return {
    ...node,
    components: [],
    effects: [],
    children: [],
  } as T;
}

function normalizeSiblingSources<T extends StateStyleNodeLike>(children: T[]): T[] {
  const stateNodes = children.filter((child) => isRelativeStateNode(child));
  const byId = new Map(stateNodes.map((child) => [child.id, child]));
  const cycleAffected = new Set<string>();

  for (const start of stateNodes) {
    const path: T[] = [];
    const positions = new Map<string, number>();
    let current: T | undefined = start;
    while (current && isRelativeStateNode(current)) {
      const previousPosition = positions.get(current.id);
      if (previousPosition !== undefined) {
        for (const node of path.slice(previousPosition)) cycleAffected.add(node.id);
        break;
      }
      positions.set(current.id, path.length);
      path.push(current);
      const parts = stateParts(current);
      const source: StateStyleSource = isStateStyleSource(current.styleSource) ? current.styleSource : 'default';
      current = parts ? byId.get(`${parts.kind}:${source}`) : undefined;
    }
    if (cycleAffected.size > 0 && path.some((node) => cycleAffected.has(node.id))) {
      for (const node of path) cycleAffected.add(node.id);
    }
  }

  return children.map((child) => {
    if (!isRelativeStateNode(child)) return child;
    const hasStyleSource = Object.prototype.hasOwnProperty.call(child, 'styleSource');
    const source = isStateStyleSource(child.styleSource)
      ? child.styleSource
      : hasStyleSource
        ? 'default'
        : undefined;
    if (cycleAffected.has(child.id)) {
      return clearInheritedPayload({ ...child, styleSource: 'default' } as T);
    }
    if (!source) return child;
    return clearInheritedPayload({ ...child, styleSource: source } as T);
  });
}

function normalizeNode<T extends StateStyleNodeLike>(node: T): T {
  const normalizedChildren = (node.children ?? []).map((child) => normalizeNode(child));
  const normalized = { ...node, children: normalizeSiblingSources(normalizedChildren) } as T;
  const parts = stateParts(normalized);
  if (!isRelativeStateNode(normalized)) {
    if (parts?.suffix === 'default' || !parts) delete normalized.styleSource;
    return normalized;
  }
  const hasStyleSource = Object.prototype.hasOwnProperty.call(normalized, 'styleSource');
  const source = isStateStyleSource(normalized.styleSource)
    ? normalized.styleSource
    : hasStyleSource
      ? 'default'
      : undefined;
  return source ? clearInheritedPayload({ ...normalized, styleSource: source } as T) : normalized;
}

/**
 * Normalize state-style references and replace every malformed cycle with a
 * reference to the default sibling. Inherited nodes never retain duplicate
 * style payloads.
 */
export function normalizeStateStyleSources<T extends StateStyleNodeLike>(root: T): T {
  return normalizeNode(root);
}

interface StateStyleTemplate {
  id: string;
  stateStyleSource?: StateTemplateKey | null;
}

/** Resolve a row or word template through its state-style source chain. */
export function resolveStateStyleTemplate<T extends StateStyleTemplate>(
  templates: readonly T[],
  entityKind: 'row' | 'word',
  state: StateTemplateKey,
): T | undefined {
  const defaultTemplate =
    templates.find((template) => template.id === `${entityKind}:default`) ??
    templates.find((template) => template.id.startsWith(`${entityKind}:`));
  if (!defaultTemplate) return undefined;

  let current = templates.find((template) => template.id === `${entityKind}:${state}`) ?? defaultTemplate;
  const visited = new Set<string>();
  while (current.stateStyleSource && current.id !== defaultTemplate.id) {
    if (visited.has(current.id)) return defaultTemplate;
    visited.add(current.id);
    current =
      templates.find((template) => template.id === `${entityKind}:${current.stateStyleSource}`) ?? defaultTemplate;
  }
  return current;
}
