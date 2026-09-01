import { clamp } from '../../../utilities/number-utils';
import { type Property } from '../property';
import { compositionScaleOf, type CanvasContext2D, type Margins, type ResolveContext, type Vector2 } from '../types';
import { zeroMargins } from '../types';
import { Effect } from './effect';
import { MAX_MOTION_BLUR_STEPS } from './motion-blur-types';
export { MAX_MOTION_BLUR_STEPS } from './motion-blur-types';

const DEGREES_TO_RADIANS = Math.PI / 180;

export function normalizeMotionBlurSteps(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(MAX_MOTION_BLUR_STEPS, Math.max(0, Math.floor(numeric)));
}

export function normalizeMotionBlurDistance(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

export function motionBlurAngleFromOffset(offset: Vector2): number {
  if (offset.x === 0 && offset.y === 0) return 0;
  return Math.atan2(offset.y, offset.x) / DEGREES_TO_RADIANS;
}

export function motionBlurDistanceFromOffset(offset: Vector2): number {
  return Math.hypot(offset.x, offset.y);
}

export function motionBlurOffsetForAngle(distance: number, angle: number | undefined): Vector2 {
  if (!Number.isFinite(angle)) return { x: distance, y: 0 };
  const radians = Number(angle) * DEGREES_TO_RADIANS;
  return {
    x: distance * Math.cos(radians),
    y: distance * Math.sin(radians),
  };
}

export function motionBlurAlphaForStep(steps: number, step: number, maxOpacity: number): number {
  const normalizedSteps = normalizeMotionBlurSteps(steps);
  const normalizedOpacity = Number.isFinite(maxOpacity) ? Math.min(1, Math.max(0, maxOpacity)) : 1;
  return clamp(normalizedOpacity * 0.8 * (1 - step / (normalizedSteps + 1)), 0, 0.25);
}

/** Motion blur replays `draw` as `steps` faded copies along a direction. */
export class MotionBlurEffect extends Effect {
  readonly type: string = 'motionBlur';
  protected readonly rendersBothDirections: boolean = true;
  private readonly hasAuthoredAngle: boolean;

  constructor(props?: Map<string, Property<unknown>>) {
    super(props);
    this.hasAuthoredAngle = props?.has('angle') ?? false;
  }

  private angleIsActive(ctx: ResolveContext): boolean {
    const angle = this.getProp<number>('angle');
    return Boolean(
      this.hasAuthoredAngle ||
      (angle !== undefined &&
        (ctx.animationOverrides?.has(angle) ||
          ctx.transitionOverrides?.has(angle) ||
          ctx.styleOverrides?.has(angle) ||
          ctx.followOverrides?.has(angle))),
    );
  }

  override getMargins(ctx: ResolveContext): Margins {
    const distance = normalizeMotionBlurDistance(this.getProp<number>('distance')?.resolve(ctx) ?? 0);
    const useAngle = this.angleIsActive(ctx);
    const angle = useAngle ? Number(this.getProp<number>('angle')?.resolve(ctx) ?? 0) : undefined;
    const resolvedOffset = motionBlurOffsetForAngle(distance, angle ?? 0);
    const scale = compositionScaleOf(ctx);
    const offset = { x: resolvedOffset.x * scale, y: resolvedOffset.y * scale };
    const steps = normalizeMotionBlurSteps(this.getProp<number>('steps')?.resolve(ctx) ?? 0);
    if (steps <= 0) return zeroMargins();
    return { x: Math.abs(offset.x) * steps, y: Math.abs(offset.y) * steps };
  }

  override apply(ctx: CanvasContext2D, rctx: ResolveContext, draw: () => void): void {
    const steps = normalizeMotionBlurSteps(this.getProp<number>('steps')?.resolve(rctx) ?? 0);
    const distance = normalizeMotionBlurDistance(this.getProp<number>('distance')?.resolve(rctx) ?? 0);
    const useAngle = this.angleIsActive(rctx);
    const angle = useAngle ? Number(this.getProp<number>('angle')?.resolve(rctx) ?? 0) : undefined;
    const resolvedOffset = motionBlurOffsetForAngle(distance, angle ?? 0);
    const scale = compositionScaleOf(rctx);
    const offset = { x: resolvedOffset.x * scale, y: resolvedOffset.y * scale };
    const maxOpacity = Number(this.getProp<number>('maxOpacity')?.resolve(rctx) ?? 1);
    const showOriginal = this.getShowOriginal(rctx);
    if (steps <= 0 || (offset.x === 0 && offset.y === 0)) {
      draw();
      return;
    }
    ctx.save();
    if (showOriginal === 'back') draw();
    for (let i = steps; i >= 0; i--) {
      ctx.globalAlpha = motionBlurAlphaForStep(steps, i, maxOpacity);
      ctx.save();
      ctx.translate(offset.x * i, offset.y * i);
      draw();
      ctx.restore();
      if (this.rendersBothDirections) {
        ctx.save();
        ctx.translate(-offset.x * i, -offset.y * i);
        draw();
        ctx.restore();
      }
    }
    if (showOriginal === 'front') draw();
    ctx.restore();
  }
}
