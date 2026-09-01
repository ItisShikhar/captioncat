import { staticProperty, type Property } from '../property';
import type { Canvas } from '#platform/canvas.js';
import type { Paint, PaintBounds } from '../paint';
import type { Box, CanvasContext2D, Margins, ResolveContext } from '../types';

export interface EffectSource {
  bounds?: Pick<Box, 'width' | 'height'>;
  color?: Paint;
}

export type EffectInput = 'base' | 'previousEffect';
export type ShowOriginal = 'none' | 'front' | 'back';

export interface EffectApplyOptions {
  baseTransform?: ReturnType<CanvasContext2D['getTransform']>;
  paintBounds?: PaintBounds;
  includeOriginal?: boolean;
  sourceCanvas?: Canvas;
  localizeSignalEffects?: boolean;
}

/**
 * An `Effect` is transformative, not additive: it post-processes what an entity
 * paints. Effects are composed as nested wrappers around the entity's `draw`
 * callback (see `PhysicalEntity.paintWithEffects`): a blur sets `ctx.filter`
 * around the draw, a motion blur replays the draw as faded offset copies. This
 * replaces inline canvas-blur branches. `getMargins` reports the extra room
 * the effect needs for auto-crop.
 */
export abstract class Effect {
  abstract readonly type: string;
  id?: string;
  dependencyOf?: string;
  readonly props: Map<string, Property<unknown>>;

  constructor(props?: Map<string, Property<unknown>>) {
    const normalized = new Map<string, Property<unknown>>([
      ['appliesOn', props?.get('appliesOn') ?? staticProperty('string', 'base')],
    ]);
    if (props) {
      for (const [key, property] of props) {
        if (key !== 'appliesOn') normalized.set(key, property);
      }
    }
    this.props = normalized;
  }

  getProp<T>(name: string): Property<T> | undefined {
    return this.props.get(name) as Property<T> | undefined;
  }

  isEnabled(rctx: ResolveContext): boolean {
    return this.getProp<boolean>('enabled')?.resolve(rctx) !== false;
  }

  getAppliesOn(rctx: ResolveContext): EffectInput {
    return this.getProp<string>('appliesOn')?.resolve(rctx) === 'previousEffect' ? 'previousEffect' : 'base';
  }

  getShowOriginal(rctx: ResolveContext): ShowOriginal {
    const raw = String(this.getProp<string>('showOriginal')?.resolve(rctx) ?? 'none').trim().toLowerCase();
    return raw === 'front' || raw === 'back' ? raw : 'none';
  }

  /** Deep copy with fresh prop/randomizer instances. */
  clone(): Effect {
    const copy = Object.create(Object.getPrototypeOf(this)) as Effect;
    Object.assign(copy, this);
    const mutable = copy as { props: Map<string, Property<unknown>> };
    mutable.props = new Map();
    for (const [key, prop] of this.props) mutable.props.set(key, prop.clone());
    return copy;
  }

  /** Extra room this effect needs beyond the owner's painted box, per axis. */
  abstract getMargins(ctx: ResolveContext, source?: EffectSource): Margins;

  /** Apply `draw` under this effect. The base implementation draws unchanged. */
  apply(_ctx: CanvasContext2D, _rctx: ResolveContext, draw: () => void, _options?: EffectApplyOptions): void {
    draw();
  }
}
