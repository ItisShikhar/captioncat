import type { Effect } from '../effects';
import { staticProperty, type Property } from '../property';
import type { ResolveContext } from '../types';
import { Component } from './component';

export const MARKER_STYLE_SOURCES = ['own', 'targetState'] as const;
export type MarkerStyleSource = (typeof MARKER_STYLE_SOURCES)[number];

export const MARKER_STYLE_STATES = ['followTarget', 'default', 'past', 'previous', 'current', 'next', 'future'] as const;
export type MarkerStyleState = (typeof MARKER_STYLE_STATES)[number];

export const MARKER_RENDER_ORDERS = ['inFront', 'behind'] as const;
export type MarkerRenderOrder = (typeof MARKER_RENDER_ORDERS)[number];

export interface MarkerBehaviorConfig {
  styleSource: MarkerStyleSource;
  styleState: MarkerStyleState;
  renderOrder: MarkerRenderOrder;
}

export const DEFAULT_MARKER_BEHAVIOR: MarkerBehaviorConfig = {
  styleSource: 'own',
  styleState: 'followTarget',
  renderOrder: 'inFront',
};

function valueOf(props: Map<string, Property<unknown>>, key: string, rctx?: ResolveContext): unknown {
  const property = props.get(key);
  return rctx ? property?.resolve(rctx) : property?.base;
}

export function markerBehaviorConfigFromProps(
  props: Map<string, Property<unknown>>,
  rctx?: ResolveContext,
): MarkerBehaviorConfig {
  const styleSource = valueOf(props, 'styleSource', rctx);
  const styleState = valueOf(props, 'styleState', rctx);
  const renderOrder = valueOf(props, 'renderOrder', rctx);
  return {
    styleSource: (MARKER_STYLE_SOURCES as readonly string[]).includes(styleSource as string)
      ? (styleSource as MarkerStyleSource)
      : DEFAULT_MARKER_BEHAVIOR.styleSource,
    styleState: (MARKER_STYLE_STATES as readonly string[]).includes(styleState as string)
      ? (styleState as MarkerStyleState)
      : DEFAULT_MARKER_BEHAVIOR.styleState,
    renderOrder: (MARKER_RENDER_ORDERS as readonly string[]).includes(renderOrder as string)
      ? (renderOrder as MarkerRenderOrder)
      : DEFAULT_MARKER_BEHAVIOR.renderOrder,
  };
}

export function markerBehaviorPropsFromConfig(
  config: Partial<MarkerBehaviorConfig> = {},
): Map<string, Property<unknown>> {
  const merged: MarkerBehaviorConfig = {
    ...DEFAULT_MARKER_BEHAVIOR,
    ...config,
  };
  return new Map<string, Property<unknown>>([
    ['styleSource', staticProperty('string', merged.styleSource)],
    ['styleState', staticProperty('string', merged.styleState)],
    ['renderOrder', staticProperty('string', merged.renderOrder)],
  ]);
}

export class MarkerBehavior extends Component {
  readonly type = 'markerBehavior';
  override readonly allowedEntities = ['marker'];
  override readonly allowedQuantity = 1;

  constructor(props?: Map<string, Property<unknown>>, components?: Component[], effects?: Effect[]) {
    super(props, components, effects);
    this.props.delete('followTarget');
    this.props.delete('anchor');
    this.props.delete('offset');
    const defaults = markerBehaviorPropsFromConfig();
    for (const [key, property] of defaults) {
      if (!this.props.has(key)) this.props.set(key, property);
    }
  }

  get config(): MarkerBehaviorConfig {
    return markerBehaviorConfigFromProps(this.props);
  }

  resolveConfig(rctx: ResolveContext): MarkerBehaviorConfig {
    return markerBehaviorConfigFromProps(this.props, rctx);
  }
}
