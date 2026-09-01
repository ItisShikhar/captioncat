import { staticProperty, type Property } from '../property';
import type { ResolveContext } from '../types';
import type { Effect } from '../effects';
import { Component } from './component';

export const PAINT_ORDER_ENTITY_KINDS = [
  'viewport',
  'videoArea',
  'video',
  'compositionArea',
  'page',
  'row',
  'image',
  'word',
  'marker',
  'background',
] as const;

export type PaintOrderEntityKind = (typeof PAINT_ORDER_ENTITY_KINDS)[number];

export const CHILD_PAINT_ORDER_MODES = ['source', 'zIndex', 'alternate', 'custom', 'random'] as const;
export type ChildPaintOrderMode = (typeof CHILD_PAINT_ORDER_MODES)[number];

export const CHILD_PAINT_ORDER_DIRECTIONS = ['ascending', 'descending'] as const;
export type ChildPaintOrderDirection = (typeof CHILD_PAINT_ORDER_DIRECTIONS)[number];

export const CHILD_PAINT_ORDER_STARTS = ['back', 'front'] as const;
export type ChildPaintOrderStart = (typeof CHILD_PAINT_ORDER_STARTS)[number];

export interface ChildPaintOrderConfig {
  mode: ChildPaintOrderMode;
  direction: ChildPaintOrderDirection;
  backZIndex: number;
  frontZIndex: number;
  start: ChildPaintOrderStart;
  values: number[];
  offset: number;
  seed: number;
}

export const DEFAULT_CHILD_PAINT_ORDER: ChildPaintOrderConfig = {
  mode: 'source',
  direction: 'descending',
  backZIndex: 0,
  frontZIndex: 1,
  start: 'back',
  values: [],
  offset: 0,
  seed: 0,
};

function valueOf(props: Map<string, Property<unknown>>, key: string, rctx?: ResolveContext): unknown {
  const property = props.get(key);
  return rctx ? property?.resolve(rctx) : property?.base;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function numericList(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry)) : [];
}

export function paintOrderPropsFromConfig(zIndex = 0): Map<string, Property<unknown>> {
  return new Map([['zIndex', staticProperty('number', finiteNumber(zIndex, 0))]]);
}

export class PaintOrder extends Component {
  readonly type = 'paintOrder';
  override readonly allowedEntities = PAINT_ORDER_ENTITY_KINDS;
  override readonly allowedQuantity = 1;
  override readonly allowDisable = true;
  override readonly isDeletable = true;

  constructor(props?: Map<string, Property<unknown>>, components?: Component[], effects?: Effect[]) {
    super(props, components, effects);
    if (!this.props.has('enabled')) this.props.set('enabled', staticProperty('boolean', true));
    if (!this.props.has('zIndex')) this.props.set('zIndex', staticProperty('number', 0));
  }

  zIndex(rctx: ResolveContext): number {
    return finiteNumber(this.getProp<unknown>('zIndex')?.resolve(rctx), 0);
  }
}

export function childPaintOrderPropsFromConfig(
  config: Partial<ChildPaintOrderConfig> = {},
): Map<string, Property<unknown>> {
  const merged: ChildPaintOrderConfig = {
    ...DEFAULT_CHILD_PAINT_ORDER,
    ...config,
    values: config.values ? [...config.values] : [...DEFAULT_CHILD_PAINT_ORDER.values],
  };
  return new Map<string, Property<unknown>>([
    ['mode', staticProperty('string', merged.mode)],
    ['direction', staticProperty('string', merged.direction)],
    ['backZIndex', staticProperty('number', finiteNumber(merged.backZIndex, DEFAULT_CHILD_PAINT_ORDER.backZIndex))],
    ['frontZIndex', staticProperty('number', finiteNumber(merged.frontZIndex, DEFAULT_CHILD_PAINT_ORDER.frontZIndex))],
    ['start', staticProperty('string', merged.start)],
    ['values', staticProperty('array', [...merged.values])],
    ['offset', staticProperty('number', Math.trunc(finiteNumber(merged.offset, DEFAULT_CHILD_PAINT_ORDER.offset)))],
    ['seed', staticProperty('number', finiteNumber(merged.seed, DEFAULT_CHILD_PAINT_ORDER.seed))],
  ]);
}

export function childPaintOrderConfigFromProps(
  props: Map<string, Property<unknown>>,
  rctx?: ResolveContext,
): ChildPaintOrderConfig {
  const mode = valueOf(props, 'mode', rctx);
  const direction = valueOf(props, 'direction', rctx);
  const start = valueOf(props, 'start', rctx);
  return {
    mode: (CHILD_PAINT_ORDER_MODES as readonly unknown[]).includes(mode) ? (mode as ChildPaintOrderMode) : DEFAULT_CHILD_PAINT_ORDER.mode,
    direction: (CHILD_PAINT_ORDER_DIRECTIONS as readonly unknown[]).includes(direction)
      ? (direction as ChildPaintOrderDirection)
      : DEFAULT_CHILD_PAINT_ORDER.direction,
    backZIndex: finiteNumber(valueOf(props, 'backZIndex', rctx), DEFAULT_CHILD_PAINT_ORDER.backZIndex),
    frontZIndex: finiteNumber(valueOf(props, 'frontZIndex', rctx), DEFAULT_CHILD_PAINT_ORDER.frontZIndex),
    start: (CHILD_PAINT_ORDER_STARTS as readonly unknown[]).includes(start)
      ? (start as ChildPaintOrderStart)
      : DEFAULT_CHILD_PAINT_ORDER.start,
    values: numericList(valueOf(props, 'values', rctx)),
    offset: Math.trunc(finiteNumber(valueOf(props, 'offset', rctx), DEFAULT_CHILD_PAINT_ORDER.offset)),
    seed: finiteNumber(valueOf(props, 'seed', rctx), DEFAULT_CHILD_PAINT_ORDER.seed),
  };
}

export class ChildPaintOrder extends Component {
  readonly type = 'childPaintOrder';
  override readonly allowedEntities = PAINT_ORDER_ENTITY_KINDS;
  override readonly allowedQuantity = 1;
  override readonly allowDisable = true;
  override readonly isDeletable = true;

  constructor(props?: Map<string, Property<unknown>>, components?: Component[], effects?: Effect[]) {
    super(props, components, effects);
    if (!this.props.has('enabled')) this.props.set('enabled', staticProperty('boolean', true));
    const defaults = childPaintOrderPropsFromConfig();
    for (const [key, property] of defaults) {
      if (!this.props.has(key)) this.props.set(key, property);
    }
  }

  get config(): ChildPaintOrderConfig {
    return childPaintOrderConfigFromProps(this.props);
  }

  resolveConfig(rctx: ResolveContext): ChildPaintOrderConfig {
    return childPaintOrderConfigFromProps(this.props, rctx);
  }
}
