import { normalizePaint, solidPaint, type Paint } from '@/schema/paint';
import type { EcsComponentDoc, EcsEffectDoc, PropertyNode } from '@/schema';
import { humanizeFieldKey } from '@/ui/controls/field-row';

export interface EffectOwnerContext {
  colorSourceName: string;
  sourcePaint?: Paint;
}

export const BASE_EFFECT_OWNER: EffectOwnerContext = { colorSourceName: 'Base' };

export interface InheritedPaintFieldDescriptor {
  toggleKey: string;
  valueKey: string;
  resolveSourcePaint: (owner: EffectOwnerContext) => Paint | undefined;
}

/** Shared contract for any effect field that can inherit an owner's paint. */
export const INHERITED_PAINT_FIELDS: readonly InheritedPaintFieldDescriptor[] = [
  {
    toggleKey: 'useFontColor',
    valueKey: 'color',
    resolveSourcePaint: (owner) => owner.sourcePaint,
  },
];

function paintFromNode(node: PropertyNode | undefined): Paint | undefined {
  if (node?.kind === 'leaf' && node.type === 'paint') {
    return normalizePaint(node.value, solidPaint('#000000'));
  }
  if (node?.kind !== 'container') return undefined;
  for (const child of Object.values(node.children)) {
    const paint = paintFromNode(child);
    if (paint) return paint;
  }
  return undefined;
}

function sourcePaintForProps(props: Record<string, PropertyNode>): Paint | undefined {
  for (const key of ['color', 'fill']) {
    const paint = paintFromNode(props[key]);
    if (paint) return paint;
  }
  for (const node of Object.values(props)) {
    const paint = paintFromNode(node);
    if (paint) return paint;
  }
  return undefined;
}

export function effectOwnerForComponent(component: EcsComponentDoc): EffectOwnerContext {
  return {
    colorSourceName: humanizeFieldKey(component.component),
    sourcePaint: sourcePaintForProps(component.props),
  };
}

export function effectOwnerForEntity(components: readonly EcsComponentDoc[]): EffectOwnerContext {
  const sourceComponent =
    components.find((component) => component.component === 'text') ??
    components.find((component) => component.component === 'backgroundStyle') ??
    components.find((component) => sourcePaintForProps(component.props));
  return {
    colorSourceName: 'Base',
    sourcePaint: sourceComponent ? sourcePaintForProps(sourceComponent.props) : undefined,
  };
}

const OWNER_DEPENDENT_FIELD_LABELS: Record<string, (owner: EffectOwnerContext) => string> = {
  useFontColor: (owner) => `Use ${owner.colorSourceName} Color`,
};

export function effectFieldOverridesForOwner(owner: EffectOwnerContext): Record<string, { label: string }> {
  return Object.fromEntries(
    Object.entries(OWNER_DEPENDENT_FIELD_LABELS).map(([fieldKey, resolveLabel]) => [fieldKey, { label: resolveLabel(owner) }]),
  );
}

export function effectDisplayLabel(effect: EcsEffectDoc, siblings: readonly EcsEffectDoc[]): string {
  const sameType = siblings.filter((candidate) => candidate.effect === effect.effect);
  const base = humanizeFieldKey(effect.effect);
  if (sameType.length <= 1) return base;
  return `${base} #${sameType.indexOf(effect) + 1}`;
}
