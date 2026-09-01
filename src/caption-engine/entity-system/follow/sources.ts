import type { PhysicalEntity } from '../physical-entities';
import type { ResolveContext, Vector2 } from '../types';
import { toVec2 } from '../types';
import type { FollowAnchor } from './types';

const SOURCE_ALIASES: Record<string, string> = {
  'Bounds.X': 'bounds.x',
  'Bounds.Y': 'bounds.y',
  'Bounds.Width': 'bounds.width',
  'Bounds.Height': 'bounds.height',
};

function normalizedSourcePath(source: string): string {
  return SOURCE_ALIASES[source] ?? source.replace(/^Transform\./, 'transform.');
}

function anchorPoint(entity: PhysicalEntity, anchor: FollowAnchor): { x: number; y: number } | undefined {
  const box = entity.box;
  if (!box) return undefined;
  const x = anchor.endsWith('Left') ? box.x : anchor.endsWith('Right') ? box.x + box.width : box.x + box.width / 2;
  const y = anchor.startsWith('top') ? box.y : anchor.startsWith('bottom') ? box.y + box.height : box.y + box.height / 2;
  return { x, y };
}

export function anchorOffsetForBox(width: number, height: number, anchor: FollowAnchor): Vector2 {
  return {
    x: anchor.endsWith('Left') ? 0 : anchor.endsWith('Right') ? width : width / 2,
    y: anchor.startsWith('top') ? 0 : anchor.startsWith('bottom') ? height : height / 2,
  };
}

export function resolveFollowSource(
  target: PhysicalEntity,
  source: string,
  anchor: FollowAnchor,
  rctx: ResolveContext,
): unknown {
  const path = normalizedSourcePath(source);
  const local = target.contextFor(rctx);
  if (path === 'bounds.x' || path === 'bounds.y') {
    const point = anchorPoint(target, anchor);
    return path.endsWith('.x') ? point?.x : point?.y;
  }
  if (path === 'bounds.width') return target.box?.width;
  if (path === 'bounds.height') return target.box?.height;
  if (path === 'transform.position.x' || path === 'transform.position.y') {
    const value = toVec2(target.transform?.position(local) ?? { x: 0, y: 0 });
    return path.endsWith('.x') ? value.x : value.y;
  }
  if (path === 'transform.scale.x' || path === 'transform.scale.y') {
    const value = toVec2(target.transform?.getProp<Vector2>('scale')?.resolve(local) ?? { x: 1, y: 1 });
    return path.endsWith('.x') ? value.x : value.y;
  }
  if (path === 'transform.rotation') return target.transform?.getProp<number>('rotation')?.resolve(local) ?? 0;
  if (path === 'transform.opacity') return target.transform?.opacity(local) ?? 1;
  return undefined;
}
