import { staticProperty, type Property } from '../property';
import type { ResolveContext } from '../types';
import { Component } from './component';
import {
  DEFAULT_FOLLOW_TARGET_CONFIG,
  normalizeFollowAnchor,
  normalizeFollowBoundaryHandoff,
  normalizeFollowDelay,
  normalizeFollowMappings,
  normalizeFollowMode,
  normalizeFollowTransitionScope,
  normalizeFollowTargetScope,
  normalizeFollowTarget,
  type FollowTargetConfig,
} from '../follow/types';

export function followTargetPropsFromConfig(
  config: Partial<FollowTargetConfig> = {},
): Map<string, Property<unknown>> {
  const merged = {
    ...DEFAULT_FOLLOW_TARGET_CONFIG,
    ...config,
    mappings: config.mappings ?? DEFAULT_FOLLOW_TARGET_CONFIG.mappings,
  };
  return new Map<string, Property<unknown>>([
    ['enabled', staticProperty('boolean', true)],
    ['mode', staticProperty('string', merged.mode)],
    ['delaySeconds', staticProperty('number', merged.delaySeconds)],
    ['target', staticProperty('string', merged.target)],
    ['targetId', staticProperty('string', merged.targetId ?? '')],
    ['targetScope', staticProperty('string', merged.targetScope)],
    ['boundaryHandoff', staticProperty('string', merged.boundaryHandoff)],
    ['transitionScope', staticProperty('string', merged.transitionScope)],
    ['anchor', staticProperty('string', merged.anchor)],
    ['mappings', staticProperty('array', merged.mappings)],
  ]);
}

export class FollowTarget extends Component {
  readonly type = 'followTarget';
  override readonly allowedEntities = [
    'viewport',
    'videoArea',
    'video',
    'compositionArea',
    'page',
    'row',
    'word',
    'marker',
    'background',
  ];
  override readonly allowedQuantity = 1;

  constructor(props?: Map<string, Property<unknown>>, components?: Component[], effects?: import('../effects').Effect[]) {
    super(props, components, effects);
    const defaults = followTargetPropsFromConfig();
    for (const [key, property] of defaults) {
      if (!this.props.has(key)) this.props.set(key, property);
    }
  }

  resolveConfig(rctx: ResolveContext): FollowTargetConfig {
    if (this.getProp<boolean>('enabled')?.resolve(rctx) === false) {
      return { ...DEFAULT_FOLLOW_TARGET_CONFIG, mappings: [] };
    }
    return {
      mode: normalizeFollowMode(this.getProp<string>('mode')?.resolve(rctx)),
      delaySeconds: normalizeFollowDelay(this.getProp<number>('delaySeconds')?.resolve(rctx)),
      target: normalizeFollowTarget(this.getProp<string>('target')?.resolve(rctx)),
      targetId: this.getProp<string>('targetId')?.resolve(rctx) || undefined,
      targetScope: normalizeFollowTargetScope(this.getProp<string>('targetScope')?.resolve(rctx)),
      boundaryHandoff: normalizeFollowBoundaryHandoff(this.getProp<string>('boundaryHandoff')?.resolve(rctx)),
      transitionScope: normalizeFollowTransitionScope(this.getProp<string>('transitionScope')?.resolve(rctx)),
      anchor: normalizeFollowAnchor(this.getProp<string>('anchor')?.resolve(rctx)),
      mappings: normalizeFollowMappings(this.getProp<unknown[]>('mappings')?.resolve(rctx)),
    };
  }
}
