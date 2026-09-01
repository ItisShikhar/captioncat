import { Font, type Component, Layout, Text, Transform } from '../components';
import type { Effect, EffectSource } from '../effects';
import type { FlowCollapseMode } from '../caption-layout';
import {
  addMargins,
  type Box,
  type CanvasContext2D,
  type Margins,
  type ResolveContext,
  type StateTemplateKey,
  type Vector2,
  type WordLifecycle,
  zeroMargins,
} from '../types';

/**
 * A `PhysicalEntity` is a node in the spatial containment tree. It can contain
 * other entities (the scene graph), carry ordered `components` (its visuals,
 * paint-ordered), and carry ordered `effects` (post-processes applied to its
 * painted surface). This replaces the anonymous per-frame layout objects
 * (`RowBackground`, `CaptionRowLayout`, `PositionedWordData`,...) rebuilt by
 * `computeWordLayout` with real, stateful instances.
 */
export abstract class PhysicalEntity {
  abstract readonly kind: string;
  readonly id: string;
  readonly children: PhysicalEntity[] = [];
  readonly components: Component[] = [];
  readonly effects: Effect[] = [];
  /** Resolved layout box (top-left origin), set by the layout engine. */
  box: Box | null = null;
  /** Full measured flow box, retained when collapsed content uses a reserved slot. */
  flowBox: Box | null = null;
  /** Transform.position resolved while this entity's layout box was assigned. */
  layoutPosition: Vector2 | null = null;
  /** Template id retained on instantiated clones for editor debug read-outs. */
  debugSourceId: string | null = null;
  /** Stable structural path assigned by the transition evaluator. */
  transitionPath: string | null = null;
  /** Runtime-only style sources used by components that follow target state styling. */
  styleSources: Partial<Record<StateTemplateKey, PhysicalEntity>> = {};
  /** Persisted source for an inherited row or word state style. */
  stateStyleSource: StateTemplateKey | null = null;
  /** This entity's incoming, outgoing, or static lifecycle. Word, Row, and Page entities have independent boundaries. */
  lifecycle: WordLifecycle = 'static';
  /** Absolute timestamp when this entity entered its current lifecycle. */
  lifecycleStartTimestampSeconds: number | null = null;
  /** Stable absolute index used by entity-local visual patterns. */
  patternIndex = 0;
  /** Stable identity used by deterministic per-entity randomizers. */
  randomizerKey: string;
  /** Stable identity of the owning Row for row-scoped randomizers. */
  rowRandomizerKey: string | undefined;
  /** Stable identity of the owning Page for page-scoped randomizers. */
  pageRandomizerKey: string | undefined;
  /** Keep this entity's measured slot in flow without painting its subtree. */
  flowCollapsed = false;
  /** Controls whether a collapsed entity reserves its measured flow slot. */
  flowCollapseMode: FlowCollapseMode = 'reserve';

  constructor(id: string) {
    this.id = id;
    this.randomizerKey = id;
  }

  addChild<T extends PhysicalEntity>(child: T): T {
    this.children.push(child);
    return child;
  }

  /** Deep copy of this entity subtree (fresh components/effects/children, box reset). */
  clone(): this {
    const copy = Object.create(Object.getPrototypeOf(this)) as this;
    Object.assign(copy, this);
    const mutable = copy as {
      children: PhysicalEntity[];
      components: Component[];
      effects: Effect[];
      box: Box | null;
      flowBox: Box | null;
      layoutPosition: Vector2 | null;
      styleSources: Partial<Record<StateTemplateKey, PhysicalEntity>>;
      transitionPath: string | null;
    };
    mutable.components = this.components.map((component) => component.clone());
    copy.linkComponentDependencies();
    mutable.effects = this.effects.map((effect) => effect.clone());
    mutable.children = this.children.map((child) => child.clone());
    mutable.box = null;
    mutable.flowBox = null;
    mutable.layoutPosition = null;
    mutable.styleSources = {};
    mutable.transitionPath = null;
    return copy;
  }

  addComponent<T extends Component>(component: T): T {
    if (component.type === 'markerBehavior') {
      if (this.kind !== 'marker') {
        throw new Error(`Marker behavior can only be attached to a marker entity (received "${this.kind}")`);
      }
      if (this.getComponentsByType('markerBehavior').length >= 1) {
        throw new Error(`Entity "${this.id}" may only contain one marker behavior component`);
      }
    }

    this.components.push(component);
    this.linkComponentDependencies();
    return component;
  }

  private linkComponentDependencies(): void {
    const text = this.components.find((component): component is Text => component instanceof Text);
    if (!text) return;
    const font = this.components.find(
      (component): component is Font =>
        component instanceof Font && (component.dependencyOf === 'text' || component.dependencyOf === undefined),
    );
    text.setFontDependency(font);
  }

  addEffect<T extends Effect>(effect: T): T {
    this.effects.push(effect);
    return effect;
  }

  getComponent<T extends Component>(type: string): T | undefined {
    return this.components.find((component) => component.type === type) as T | undefined;
  }

  getComponentsByType(type: string): Component[] {
    return this.components.filter((component) => component.type === type);
  }

  get layout(): Layout | undefined {
    return this.components.find((component): component is Layout => component instanceof Layout);
  }

  get transform(): Transform | undefined {
    return this.components.find((component): component is Transform => component instanceof Transform);
  }

  /** Depth-first visit of this entity and its descendants. */
  traverse(visit: (entity: PhysicalEntity, depth: number) => void, depth = 0): void {
    visit(this, depth);
    for (const child of this.children) {
      child.traverse(visit, depth + 1);
    }
  }

  find(predicate: (entity: PhysicalEntity) => boolean): PhysicalEntity | undefined {
    let found: PhysicalEntity | undefined;
    this.traverse((entity) => {
      if (!found && predicate(entity)) found = entity;
    });
    return found;
  }

  /** Derive the ResolveContext used by this entity's components. */
  contextFor(rctx: ResolveContext): ResolveContext {
    const rowRandomizerKey =
      this.kind === 'row' ? this.randomizerKey : this.rowRandomizerKey ?? rctx.rowRandomizerKey;
    const pageRandomizerKey =
      this.kind === 'page' ? this.randomizerKey : this.pageRandomizerKey ?? rctx.pageRandomizerKey;
    return rctx.patternIndex === this.patternIndex &&
      rctx.randomizerKey === this.randomizerKey &&
      rctx.rowRandomizerKey === rowRandomizerKey &&
      rctx.pageRandomizerKey === pageRandomizerKey
      ? rctx
      : {
          ...rctx,
          patternIndex: this.patternIndex,
          randomizerKey: this.randomizerKey,
          ...(rowRandomizerKey === undefined ? {} : { rowRandomizerKey }),
          ...(pageRandomizerKey === undefined ? {} : { pageRandomizerKey }),
        };
  }

  findById(id: string): PhysicalEntity | undefined {
    return this.find((entity) => entity.id === id);
  }

  /**
 * Room this entity's own visuals need beyond its nominal content box: the
 * additive sum of every component's and effect's reported margin. Aggregating
 * here (compositionally) is what makes the auto-crop reliable against the
 * per-axis omissions the legacy hand-written margin math suffered from.
 */
  getSelfMargins(ctx: ResolveContext): Margins {
    let margins = zeroMargins();
    const source: EffectSource | undefined = this.box
      ? { bounds: { width: this.box.width, height: this.box.height } }
      : undefined;
    for (const component of this.components) {
      margins = addMargins(margins, source ? component.getMargins(ctx, source) : component.getMargins(ctx));
    }
    for (const effect of this.effects) {
      if (!effect.isEnabled(ctx)) continue;
      margins = addMargins(margins, source ? effect.getMargins(ctx, source) : effect.getMargins(ctx));
    }
    return margins;
  }

  /**
 * Paint this entity's own components (in order) onto `ctx`, in the entity's
 * local space (the caller positions the origin at the entity's box center).
 * Children and effects are composited by the render pipeline, not here.
 */
  paint(ctx: CanvasContext2D, rctx: ResolveContext): void {
    for (const component of this.components) {
      component.paint(ctx, rctx, this);
    }
  }

  /**
 * Paint this entity with its `effects` composed as nested wrappers around the
 * paint (effects[0] outermost). With no effects this is `paint`.
 */
  paintWithEffects(ctx: CanvasContext2D, rctx: ResolveContext): void {
    const draw = (): void => this.paint(ctx, rctx);
    const wrapped = this.effects.reduceRight<() => void>(
      (next, effect) => () => (effect.isEnabled(rctx) ? effect.apply(ctx, rctx, next) : next()),
      draw,
    );
    wrapped();
  }
}

/** Make sure that every entity in a runtime tree has one stable, unique ID. */
export function assertStableEntityIds(root: PhysicalEntity): void {
  const seen = new Map<string, string>();

  const visit = (entity: PhysicalEntity, location: string): void => {
    if (typeof entity.id !== 'string' || entity.id.trim().length === 0) {
      throw new Error(`${location}: entity "${entity.kind}" must have a stable id.`);
    }
    const previousLocation = seen.get(entity.id);
    if (previousLocation) {
      throw new Error(`${location}: duplicate entity id "${entity.id}" also used at ${previousLocation}.`);
    }
    seen.set(entity.id, location);
    entity.children.forEach((child, index) => visit(child, `${location}.children[${index}]`));
  };

  visit(root, `runtime.${root.kind}`);
}
