import { staticProperty, type Property } from '../property';
import type { ResolveContext } from '../types';
import type { ResolvedCornerGeometry } from '../../../types/captions';
import { Component } from './component';

export interface BorderRadiusSource {
  getProp<T>(name: string): Property<T> | undefined;
}

export type BorderRadiusMode = 'uniform' | 'individual';

export interface CornerRadiusProvider {
  cornerRadius(rctx: ResolveContext): number;
  cornerGeometry(rctx: ResolveContext): ResolvedCornerGeometry;
}

export function resolveBorderRadiusValue(source: BorderRadiusSource, rctx: ResolveContext): number {
  return Math.max(0, Number(source.getProp<number>('borderRadius')?.resolve(rctx) ?? 0));
}

function resolvedCornerValue(source: BorderRadiusSource, key: string, rctx: ResolveContext): number {
  return Math.max(0, Number(source.getProp<number>(key)?.resolve(rctx) ?? 0));
}

export function resolveBorderRadiusMode(source: BorderRadiusSource, rctx: ResolveContext): BorderRadiusMode {
  const configured = source.getProp<string>('borderRadiusMode')?.resolve(rctx);
  if (configured === 'uniform' || configured === 'individual') return configured;
  const base = resolveBorderRadiusValue(source, rctx);
  const corners = [
    resolvedCornerValue(source, 'borderTopLeftRadius', rctx),
    resolvedCornerValue(source, 'borderTopRightRadius', rctx),
    resolvedCornerValue(source, 'borderBottomRightRadius', rctx),
    resolvedCornerValue(source, 'borderBottomLeftRadius', rctx),
  ];
  return corners.every((corner) => corner === base) ? 'uniform' : 'individual';
}

export function resolveBorderRadiusGeometry(source: BorderRadiusSource, rctx: ResolveContext): ResolvedCornerGeometry {
  const base = resolveBorderRadiusValue(source, rctx);
  const mode = resolveBorderRadiusMode(source, rctx);
  const squircle = source.getProp<number>('borderRadius')?.squircle ?? true;
  const radius = (name: string): number => (mode === 'uniform' ? base : resolvedCornerValue(source, name, rctx));
  return {
    radii: {
      topLeft: radius('borderTopLeftRadius'),
      topRight: radius('borderTopRightRadius'),
      bottomRight: radius('borderBottomRightRadius'),
      bottomLeft: radius('borderBottomLeftRadius'),
    },
    squircle: {
      topLeft: squircle,
      topRight: squircle,
      bottomRight: squircle,
      bottomLeft: squircle,
    },
  };
}

export function hasVisibleCornerRadius(geometry: ResolvedCornerGeometry): boolean {
  return (
    geometry.radii.topLeft > 0 ||
    geometry.radii.topRight > 0 ||
    geometry.radii.bottomRight > 0 ||
    geometry.radii.bottomLeft > 0
  );
}

/** Corner radius geometry shared by BackgroundStyle and Border stroke paths. */
export class BorderRadius extends Component implements CornerRadiusProvider {
  readonly type = 'borderRadius';
  override readonly allowedEntities = [
    'viewport',
    'videoArea',
    'video',
    'compositionArea',
    'page',
    'row',
    'word',
    'background',
  ];
  override readonly allowedQuantity = 1;
  override readonly isCollapsible = true;
  override readonly allowDisable = true;
  override readonly isDeletable = true;

  constructor(props?: Map<string, Property<unknown>>, components?: Component[], effects?: import('../effects').Effect[]) {
    super(props, components, effects);
    if (!this.props.has('enabled')) this.props.set('enabled', staticProperty('boolean', true));
  }

  cornerRadius(rctx: ResolveContext): number {
    return resolveBorderRadiusValue(this, rctx);
  }

  cornerGeometry(rctx: ResolveContext): ResolvedCornerGeometry {
    return resolveBorderRadiusGeometry(this, rctx);
  }
}
