import type { Effect, EffectSource } from '../effects';
import type { Property } from '../property';
import {
    addMargins,
    type Box,
    type CanvasContext2D,
    type Margins,
    type PaintOwner,
    type ResolveContext,
    zeroMargins,
} from '../types';

/**
 * A `Component` is additive: it contributes geometry painted relative to its
 * owner's box (a rounded rect, a stroke line, a glyph decoration). Components
 * are held in an ordered list on a `PhysicalEntity` (or nested on another
 * component), and that order IS the paint order - replacing the legacy
 * `renderOrder: 'behind' | 'inFront'` strings and the `...ByOrder` helpers.
 *
 * A component can also carry its own ordered `effects` (post-processes
 * scoped to only this component's own paint, e.g. a BackgroundStyle's border/
 * shadow/stroke) - mirroring `PhysicalEntity.effects`, one level deeper.
 *
 * `getMargins` lets every component report how far it bleeds past the owner's
 * nominal box, so the caption bitmap auto-crop can be computed compositionally
 * instead of via the hand-maintained `getCaptionEffectMargins` (whose per-axis
 * omissions caused real bugs - see MEMORY.md 2026-08-15).
 */
export abstract class Component {
  abstract readonly type: string;
  readonly allowedEntities: readonly string[] = [];
  readonly allowedQuantity = Number.POSITIVE_INFINITY;
  readonly isCollapsible: boolean = true;
  readonly allowDisable: boolean = false;
  readonly isDeletable: boolean = false;
  readonly props: Map<string, Property<unknown>>;
  readonly components: Component[];
  readonly effects: Effect[];
  /** Editor metadata for an explicit component dependency. */
  dependencyOf?: string;
  /** Editor metadata for a component that is visually attached below another component. */
  attachedTo?: string;
  /** Content-derived paint box in canvas space. The layout engine sets it when a background follows its words. */
  box?: Box | undefined;

  constructor(props?: Map<string, Property<unknown>>, components?: Component[], effects?: Effect[]) {
    this.props = props ?? new Map();
    this.components = components ?? [];
    this.effects = effects ?? [];
  }

  isEnabled(rctx: ResolveContext): boolean {
    return this.getProp<boolean>('enabled')?.resolve(rctx) !== false;
  }

  getProp<T>(name: string): Property<T> | undefined {
    return this.props.get(name) as Property<T> | undefined;
  }

  protected effectsInheritBaseAlpha(rctx: ResolveContext): boolean {
    const property = this.getProp<boolean>('effectsInheritBaseAlpha');
    return property ? property.resolve(rctx) !== false : true;
  }

  addEffect<T extends Effect>(effect: T): T {
    this.effects.push(effect);
    return effect;
  }

  getEffectsByType(type: string): Effect[] {
    return this.effects.filter((effect) => effect.type === type);
  }

  /** Deep copy: fresh prop/randomizer instances + cloned nested components/effects. */
  clone(): Component {
    const copy = Object.create(Object.getPrototypeOf(this)) as Component;
    Object.assign(copy, this);
    const mutable = copy as { props: Map<string, Property<unknown>>; components: Component[]; effects: Effect[] };
    mutable.props = new Map();
    for (const [key, prop] of this.props) mutable.props.set(key, prop.clone());
    mutable.components = this.components.map((child) => child.clone());
    mutable.effects = this.effects.map((effect) => effect.clone());
    copy.box = undefined;
    return copy;
  }

  getComponentsByType(type: string): Component[] {
    return this.components.filter((component) => component.type === type);
  }

  /** Extra room this component needs beyond the owner's nominal box, per axis. */
  getMargins(_ctx: ResolveContext, _source?: EffectSource): Margins {
    return zeroMargins();
  }

  /** Paint this component onto `ctx` in the coordinate space of its owner. */
  paint(_ctx: CanvasContext2D, _rctx: ResolveContext, _owner: PaintOwner): void {}

  protected sumChildMargins(ctx: ResolveContext, source?: EffectSource): Margins {
    let margins = zeroMargins();
    for (const child of this.components) {
      margins = addMargins(margins, child.getMargins(ctx, source));
    }
    for (const effect of this.effects) {
      if (!effect.isEnabled(ctx)) continue;
      margins = addMargins(margins, source ? effect.getMargins(ctx, source) : effect.getMargins(ctx));
    }
    return margins;
  }
}
