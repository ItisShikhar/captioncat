import type { EcsComponentDoc, EcsEntityDoc, PropertyNode } from '@/schema';
import { normalizePaint, solidPaint, type Paint } from '@/schema/paint';

import {
  DEFAULT_IMAGE_COLOR,
  IMAGE_COLOR_MODES,
  type ImageColorMode,
} from '@captioncat/caption-engine/browser';
import type { FollowTargetKind } from '@captioncat/caption-engine/browser';
import { findComponentByType, findEntityById, findParentOf, markerOwnerEntity } from '../entity-tree';
import { humanizeFieldKey } from '@/ui/controls/field-row';

type MarkerTarget = FollowTargetKind;
type MarkerStyleState = 'followTarget' | 'default' | 'past' | 'previous' | 'current' | 'next' | 'future';

export interface ResolvedMarkerImageStyle {
  colorMode: ImageColorMode;
  color: Paint;
  sourceLabel: string;
}

const STYLE_COMPONENTS = [
  { component: 'image', paintProperty: 'color', modeProperty: 'colorMode' },
  { component: 'text', paintProperty: 'color' },
  { component: 'backgroundStyle', paintProperty: 'fill' },
] as const;

const TARGET_RESOLVERS: Record<MarkerTarget, (root: EcsEntityDoc, marker: EcsEntityDoc) => EcsEntityDoc | undefined> = {
  parent: (root, marker) => findParentOf(root, marker.id)?.parent ?? markerOwnerEntity(root, marker.id),
  currentWord: (root) => findEntityById(root, 'word:current'),
  previousWord: (root) => findEntityById(root, 'word:previous'),
  nextWord: (root) => findEntityById(root, 'word:next'),
  currentRow: (root) => findEntityById(root, 'row:current'),
  previousRow: (root) => findEntityById(root, 'row:previous'),
  nextRow: (root) => findEntityById(root, 'row:next'),
  currentPage: (root) => findEntityById(root, 'page:current') ?? findEntityById(root, 'page:default'),
  entity: (root, marker) => {
    const follow = findComponentByType(marker.components, 'followTarget');
    const targetId = leafString(follow?.props.targetId, '');
    return targetId ? findEntityById(root, targetId) : undefined;
  },
};

const TARGET_STYLE_FALLBACKS: Partial<Record<Exclude<MarkerTarget, 'parent'>, string>> = {
  currentWord: 'word:default',
  previousWord: 'word:default',
  nextWord: 'word:default',
  currentRow: 'row:default',
  previousRow: 'row:default',
  nextRow: 'row:default',
};

function leafString(node: PropertyNode | undefined, fallback: string): string {
  return node?.kind === 'leaf' && typeof node.value === 'string' ? node.value : fallback;
}

function paintFromComponent(component: EcsComponentDoc, property: string): Paint | undefined {
  const node = component.props[property];
  return node?.kind === 'leaf' && node.type === 'paint' ? normalizePaint(node.value, solidPaint(DEFAULT_IMAGE_COLOR)) : undefined;
}

function imageColorModeFromComponent(component: EcsComponentDoc): ImageColorMode {
  const value = leafString(component.props.colorMode, 'tint');
  return (IMAGE_COLOR_MODES as readonly string[]).includes(value) ? (value as ImageColorMode) : 'tint';
}

function styleFromEntity(entity: EcsEntityDoc | undefined): Omit<ResolvedMarkerImageStyle, 'sourceLabel'> | undefined {
  if (!entity) return undefined;
  for (const definition of STYLE_COMPONENTS) {
    const component = findComponentByType(entity.components, definition.component);
    const color = component ? paintFromComponent(component, definition.paintProperty) : undefined;
    if (!color) continue;
    return {
      color,
      colorMode: definition.component === 'image' && component ? imageColorModeFromComponent(component) : 'solid',
    };
  }
  return undefined;
}

function stateEntity(root: EcsEntityDoc, target: EcsEntityDoc, state: Exclude<MarkerStyleState, 'followTarget'>): EcsEntityDoc | undefined {
  return findEntityById(root, `${target.entity}:${state}`) ?? (state === 'default' ? target : undefined);
}

function stateSuffix(entity: EcsEntityDoc): Exclude<MarkerStyleState, 'followTarget'> {
  const suffix = entity.id.slice(entity.id.indexOf(':') + 1);
  return suffix === 'past' ||
    suffix === 'previous' ||
    suffix === 'current' ||
    suffix === 'next' ||
    suffix === 'future' ||
    suffix === 'default'
    ? suffix
    : 'default';
}

export function resolveMarkerImageStyle(
  root: EcsEntityDoc | undefined,
  marker: EcsEntityDoc,
): ResolvedMarkerImageStyle | null {
  if (!root || marker.entity !== 'marker') return null;
  const behavior = findComponentByType(marker.components, 'markerBehavior');
  const follow = findComponentByType(marker.components, 'followTarget');
  if (!behavior || !follow || leafString(behavior.props.styleSource, 'own') !== 'targetState') return null;

  const targetKey = leafString(follow.props.target, 'parent') as MarkerTarget;
  const target = TARGET_RESOLVERS[targetKey]?.(root, marker);
  if (!target) return null;

  const requestedState = leafString(behavior.props.styleState, 'followTarget') as MarkerStyleState;
  const resolvedState: Exclude<MarkerStyleState, 'followTarget'> =
    requestedState === 'followTarget' ? stateSuffix(target) : requestedState;
  const resolvedEntity =
    requestedState === 'followTarget'
      ? target
      : stateEntity(root, target, resolvedState);
  const fallbackEntity = targetKey === 'parent' ? undefined : findEntityById(root, TARGET_STYLE_FALLBACKS[targetKey] ?? '');
  const style =
    styleFromEntity(resolvedEntity) ??
    styleFromEntity(target) ??
    styleFromEntity(fallbackEntity) ?? {
      color: solidPaint(DEFAULT_IMAGE_COLOR),
      colorMode: 'tint' as const,
    };

  return {
    ...style,
    sourceLabel: `${humanizeFieldKey(targetKey)} · ${humanizeFieldKey(resolvedState)}`,
  };
}
