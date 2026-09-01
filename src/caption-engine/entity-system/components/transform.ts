import type { Effect } from '../effects';
import { staticProperty, type Property } from '../property';
import { keepsWithinParentBounds } from '../randomizer';
import { toVec2, type CanvasContext2D, type ResolveContext, type Vector2 } from '../types';
import { Component } from './component';
import { applyTransformFrom } from './helpers';

/** positioning / position / dimensions / rotation / scale / opacity of an entity. */
export class Transform extends Component {
  readonly type = 'transform';
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
    'image',
  ];
  override readonly allowedQuantity = 1;

  constructor(props?: Map<string, Property<unknown>>, components?: Component[], effects?: Effect[]) {
    super(props ?? new Map(), components, effects);
    if (!this.props.has('positioning')) this.props.set('positioning', staticProperty('string', 'flow'));
    const legacyPositionUnit = this.props.get('position')?.unit === 'percent' ? 'percent' : 'pt';
    const legacyDimensionUnit = this.props.get('dimensions')?.unit === 'percent' ? 'percent' : 'pt';
    if (!this.props.has('positionXUnit')) this.props.set('positionXUnit', staticProperty('string', legacyPositionUnit));
    if (!this.props.has('positionYUnit')) this.props.set('positionYUnit', staticProperty('string', legacyPositionUnit));
    if (!this.props.has('widthUnit')) this.props.set('widthUnit', staticProperty('string', legacyDimensionUnit));
    if (!this.props.has('heightUnit')) this.props.set('heightUnit', staticProperty('string', legacyDimensionUnit));
    if (!this.props.has('widthMode')) this.props.set('widthMode', staticProperty('string', 'custom'));
    if (!this.props.has('heightMode')) this.props.set('heightMode', staticProperty('string', 'custom'));
    if (!this.props.has('pivot')) this.props.set('pivot', staticProperty('string', 'center'));
  }

  /** Apply rotation→scale→position to ctx around the current origin. */
  applyTo(ctx: CanvasContext2D, rctx: ResolveContext, includePosition = true, positionOverride?: Vector2): void {
    applyTransformFrom(this, ctx, rctx, includePosition, positionOverride);
  }

  /** Opacity multiplier this transform contributes (1 if unset). */
  opacity(rctx: ResolveContext): number {
    return Number(this.getProp<number>('opacity')?.resolve(rctx) ?? 1);
  }

  scale(rctx: ResolveContext): Vector2 {
    const value = this.getProp<unknown>('scale')?.resolve(rctx);
    if (!value || typeof value !== 'object' || !('x' in value) || !('y' in value)) {
      return { x: 1, y: 1 };
    }
    const x = Number(value.x);
    const y = Number(value.y);
    return {
      x: Number.isFinite(x) ? x : 1,
      y: Number.isFinite(y) ? y : 1,
    };
  }

  pivot(rctx: ResolveContext): TransformPivot {
    const value = this.getProp<string>('pivot')?.resolve(rctx);
    return isTransformPivot(value) ? value : 'center';
  }

  /** Resolve the authored position at one instant. */
  position(rctx: ResolveContext): Vector2 {
    return toVec2(this.getProp<Vector2>('position')?.resolve(rctx) ?? { x: 0, y: 0 });
  }

  resolvedPosition(rctx: ResolveContext, parentSize: { width: number; height: number }): Vector2 {
    const position = this.position(rctx);
    return {
      x: resolveTransformUnit(position.x, this.positionUnit('x', rctx), parentSize.width),
      y: resolveTransformUnit(position.y, this.positionUnit('y', rctx), parentSize.height),
    };
  }

  keepsPositionWithinParentBounds(): boolean {
    return keepsWithinParentBounds(this.getProp<Vector2>('position')?.randomizer);
  }

  positionXUnit(rctx: ResolveContext): TransformDimensionUnit {
    return this.positionUnit('x', rctx);
  }

  positionYUnit(rctx: ResolveContext): TransformDimensionUnit {
    return this.positionUnit('y', rctx);
  }

  positioning(rctx: ResolveContext): TransformPositioning {
    return this.getProp<string>('positioning')?.resolve(rctx) === 'absolute' ? 'absolute' : 'flow';
  }

  /** Resolve the frame-local delta from the position used by layout. */
  renderPosition(rctx: ResolveContext, layoutPosition?: Vector2 | null, relativeOffset: Vector2 = { x: 0, y: 0 }): Vector2 {
    const position = this.position(rctx);
    if (!layoutPosition) return { x: position.x + relativeOffset.x, y: position.y + relativeOffset.y };
    return {
      x: this.positionXUnit(rctx) === 'percent' ? relativeOffset.x : position.x - layoutPosition.x + relativeOffset.x,
      y: this.positionYUnit(rctx) === 'percent' ? relativeOffset.y : position.y - layoutPosition.y + relativeOffset.y,
    };
  }

  widthMode(rctx: ResolveContext): TransformSizeMode {
    return normalizeSizeMode(this.getProp<string>('widthMode')?.resolve(rctx));
  }

  heightMode(rctx: ResolveContext): TransformSizeMode {
    return normalizeSizeMode(this.getProp<string>('heightMode')?.resolve(rctx));
  }

  authoredDimension(axis: 'x' | 'y', rctx: ResolveContext): number | undefined {
    const dimensions = this.getProp<{ x: number; y: number }>('dimensions')?.resolve(rctx);
    const value = Number(dimensions?.[axis]);
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }

  widthUnit(rctx: ResolveContext): TransformDimensionUnit {
    return this.dimensionUnit('x', rctx);
  }

  heightUnit(rctx: ResolveContext): TransformDimensionUnit {
    return this.dimensionUnit('y', rctx);
  }

  resolvedAuthoredDimension(axis: 'x' | 'y', rctx: ResolveContext, parentExtent: number): number | undefined {
    const authored = this.authoredDimension(axis, rctx);
    if (authored === undefined) return undefined;
    if (this.dimensionUnit(axis, rctx) === 'pt') return authored;
    const extent = Number(parentExtent);
    return Number.isFinite(extent) && extent > 0 ? (extent * authored) / 100 : 0;
  }

  private dimensionUnit(axis: 'x' | 'y', rctx: ResolveContext): TransformDimensionUnit {
    const axisUnit = this.getProp<string>(axis === 'x' ? 'widthUnit' : 'heightUnit')?.resolve(rctx);
    if (axisUnit !== undefined) return normalizeDimensionUnit(axisUnit);
    return this.getProp<{ x: number; y: number }>('dimensions')?.unit === 'percent' ? 'percent' : 'pt';
  }

  private positionUnit(axis: 'x' | 'y', rctx: ResolveContext): TransformDimensionUnit {
    const axisUnit = this.getProp<string>(axis === 'x' ? 'positionXUnit' : 'positionYUnit')?.resolve(rctx);
    if (axisUnit !== undefined) return normalizeDimensionUnit(axisUnit);
    return this.getProp<Vector2>('position')?.unit === 'percent' ? 'percent' : 'pt';
  }
}

export type TransformSizeMode = 'custom' | 'fitParent' | 'fitContent' | 'fitChildren';
export type TransformPositioning = 'flow' | 'absolute';
export type TransformDimensionUnit = 'pt' | 'percent';
export type TransformPivot =
  | 'topLeft'
  | 'topCenter'
  | 'topRight'
  | 'centerLeft'
  | 'center'
  | 'centerRight'
  | 'bottomLeft'
  | 'bottomCenter'
  | 'bottomRight';

function normalizeSizeMode(value: unknown): TransformSizeMode {
  return value === 'fitParent' || value === 'fitContent' || value === 'fitChildren' ? value : 'custom';
}

function normalizeDimensionUnit(value: unknown): TransformDimensionUnit {
  return value === '%' || value === 'percent' ? 'percent' : 'pt';
}

function isTransformPivot(value: unknown): value is TransformPivot {
  return (
    value === 'topLeft' ||
    value === 'topCenter' ||
    value === 'topRight' ||
    value === 'centerLeft' ||
    value === 'center' ||
    value === 'centerRight' ||
    value === 'bottomLeft' ||
    value === 'bottomCenter' ||
    value === 'bottomRight'
  );
}

function resolveTransformUnit(value: number, unit: TransformDimensionUnit, parentExtent: number): number {
  if (unit === 'pt') return value;
  const extent = Number(parentExtent);
  return Number.isFinite(extent) && extent > 0 ? (extent * value) / 100 : 0;
}
