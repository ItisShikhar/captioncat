import { Text, type Component } from './components';
import type { Effect } from './effects/effect';
import type { PhysicalEntity } from './physical-entities';
import type { ResolveContext, StateTemplateKey } from './types';

const NON_STYLE_COMPONENT_TYPES = new Set([
  'animation',
  'childPaintOrder',
  'followTarget',
  'layout',
  'layoutMotion',
  'lifecycle',
  'paintOrder',
  'selfLayout',
  'verticalSpacer',
  'horizontalSpacer',
]);
const STYLE_PROPERTIES_BY_COMPONENT: Record<string, ReadonlySet<string>> = {
  backgroundStyle: new Set([
    'enabled',
    'fill',
    'effectsInheritBaseAlpha',
    'pathShape',
    'tailSide',
    'tailSize',
    'borderRadiusMode',
    'borderRadius',
    'borderTopLeftRadius',
    'borderTopRightRadius',
    'borderBottomRightRadius',
    'borderBottomLeftRadius',
  ]),
  image: new Set(['enabled', 'colorMode', 'color']),
  strikethrough: new Set(['enabled', 'color']),
  text: new Set(['color', 'effectsInheritBaseAlpha']),
  transform: new Set(['opacity']),
  underline: new Set(['enabled', 'color']),
};
const STYLE_EFFECT_PROPERTIES = new Set([
  'enabled',
  'color',
  'maxOpacity',
  'opacity',
  'showOriginal',
  'strength',
  'useFontColor',
]);

function sourceComponentFor(
  target: Component,
  sourceComponents: readonly Component[],
  occurrences: Map<string, number>,
): Component | undefined {
  const occurrence = occurrences.get(target.type) ?? 0;
  occurrences.set(target.type, occurrence + 1);
  return sourceComponents.filter((candidate) => candidate.type === target.type)[occurrence];
}

function sourceEffectFor(
  target: Effect,
  sourceEffects: readonly Effect[],
  occurrences: Map<string, number>,
): Effect | undefined {
  const exact = sourceEffects.find((candidate) => candidate.type === target.type && candidate.id === target.id);
  if (exact) return exact;
  const occurrence = occurrences.get(target.type) ?? 0;
  occurrences.set(target.type, occurrence + 1);
  return sourceEffects.filter((candidate) => candidate.type === target.type)[occurrence];
}

function collectComponentOverrides(
  targetComponents: readonly Component[],
  sourceComponents: readonly Component[],
  rctx: ResolveContext,
  output: Map<object, unknown>,
): void {
  const occurrences = new Map<string, number>();
  for (const target of targetComponents) {
    const source = sourceComponentFor(target, sourceComponents, occurrences);
    if (!source) continue;
    if (!NON_STYLE_COMPONENT_TYPES.has(target.type)) {
      const allowedProperties = STYLE_PROPERTIES_BY_COMPONENT[target.type];
      for (const [propertyName, property] of target.props) {
        if (!allowedProperties?.has(propertyName)) continue;
        const sourceProperty = source.props.get(propertyName);
        if (sourceProperty) output.set(property, sourceProperty.resolve(rctx));
      }
      collectEffectOverrides(target.effects, source.effects, rctx, output);
    }
    collectComponentOverrides(target.components, source.components, rctx, output);
  }
}

function collectEffectOverrides(
  targetEffects: readonly Effect[],
  sourceEffects: readonly Effect[],
  rctx: ResolveContext,
  output: Map<object, unknown>,
): void {
  const occurrences = new Map<string, number>();
  for (const target of targetEffects) {
    const source = sourceEffectFor(target, sourceEffects, occurrences);
    if (!source) continue;
    for (const [propertyName, property] of target.props) {
      if (!STYLE_EFFECT_PROPERTIES.has(propertyName)) continue;
      const sourceProperty = source.props.get(propertyName);
      if (sourceProperty) output.set(property, sourceProperty.resolve(rctx));
    }
  }
}

export function styleContextForEntity(
  entity: PhysicalEntity,
  style: StateTemplateKey | 'none',
  rctx: ResolveContext,
): ResolveContext {
  if (style === 'none') return rctx;
  const source = entity.styleSources[style];
  if (!source || source === entity) return rctx;
  const overrides = new Map<object, unknown>();
  collectComponentOverrides(entity.components, source.components, rctx, overrides);
  collectEffectOverrides(entity.effects, source.effects, rctx, overrides);
  return overrides.size > 0 ? { ...rctx, styleOverrides: overrides } : rctx;
}

export interface MaterializedStyle {
  readonly components: readonly Component[];
  readonly effects: readonly Effect[];
  readonly context: ResolveContext;
}

function cloneStyleComponent(source: Component, target: Component | undefined): Component {
  const copy = source.clone();
  if (copy instanceof Text && target instanceof Text) {
    copy.setFontDependency(target.font());
  }
  return copy;
}

function targetComponentFor(
  source: Component,
  targetComponents: readonly Component[],
  occurrences: Map<string, number>,
): Component | undefined {
  const occurrence = occurrences.get(source.type) ?? 0;
  occurrences.set(source.type, occurrence + 1);
  return targetComponents.filter((candidate) => candidate.type === source.type)[occurrence];
}

/**
 * Build the complete visual payload for a selected state style.
 *
 * Normal state rendering keeps the target entity structure and applies
 * override-only values. Wipe Reveal needs the selected source's complete
 * component and effect lists so a source can add or omit visual effects.
 */
export function materializeStyleForEntity(
  entity: PhysicalEntity,
  style: StateTemplateKey | 'none',
  rctx: ResolveContext,
): MaterializedStyle {
  if (style === 'none') {
    return { components: entity.components, effects: entity.effects, context: rctx };
  }

  const source = entity.styleSources[style];
  if (!source || source === entity) {
    return { components: entity.components, effects: entity.effects, context: rctx };
  }

  const targetOccurrences = new Map<string, number>();
  return {
    components: source.components.map((component) =>
      cloneStyleComponent(component, targetComponentFor(component, entity.components, targetOccurrences)),
    ),
    effects: source.effects.map((effect) => effect.clone()),
    context: styleContextForEntity(entity, style, rctx),
  };
}
