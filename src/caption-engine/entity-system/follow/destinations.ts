import type { PhysicalEntity } from '../physical-entities';
import type { Property } from '../property';
import { ensureDefaultProperty } from '../property-defaults';
import { toVec2 } from '../types';

export interface FollowDestination {
  property: Property<unknown>;
  axis?: 'x' | 'y';
}

function componentAndProperty(path: string): { component: string; property: string; axis?: 'x' | 'y' } | undefined {
  const parts = path.split('.');
  if (parts.length < 2) return undefined;
  const component = parts[0].toLowerCase();
  const property = parts[1].toLowerCase();
  const axis = parts[2] === 'x' || parts[2] === 'y' ? parts[2] : undefined;
  return { component, property, ...(axis ? { axis } : {}) };
}

export function resolveFollowDestination(entity: PhysicalEntity, path: string): FollowDestination | undefined {
  const parsed = componentAndProperty(path);
  if (!parsed) return undefined;
  const component = entity.components.find((candidate) => candidate.type === parsed.component);
  if (!component) return undefined;
  if (parsed.property === 'width' || parsed.property === 'height') {
    const dimensions = ensureDefaultProperty(component, 'dimensions');
    if (!dimensions) return undefined;
    return {
      property: dimensions,
      axis: parsed.property === 'width' ? 'x' : 'y',
    };
  }
  const property = ensureDefaultProperty(component, parsed.property);
  return property ? { property, ...(parsed.axis ? { axis: parsed.axis } : {}) } : undefined;
}

export function applyFollowValue(
  current: unknown,
  value: unknown,
  axis: 'x' | 'y' | undefined,
  offset = 0,
  destinationPath?: string,
): unknown {
  if (typeof value !== 'number' || !Number.isFinite(value)) return current;
  const safeOffset = Number.isFinite(offset) ? offset : 0;
  const adjusted = value + safeOffset;
  if (!Number.isFinite(adjusted)) return current;
  const constrained = constrainFollowValue(adjusted, destinationPath);
  if (!axis) return constrained;
  const vector = toVec2(current);
  return {
    x: axis === 'x' ? constrained : vector.x,
    y: axis === 'y' ? constrained : vector.y,
  };
}

function constrainFollowValue(value: number, destinationPath?: string): number {
  if (destinationPath === 'Transform.opacity') return Math.min(1, Math.max(0, value));
  if (destinationPath === 'Transform.width' || destinationPath === 'Transform.height') {
    return Math.max(0, value);
  }
  return value;
}
