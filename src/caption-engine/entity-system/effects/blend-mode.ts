import type { CanvasContext2D, Margins, ResolveContext } from '../types';
import { Effect, type EffectSource } from './effect';
import { BLEND_MODES, type BlendMode } from './blend-mode-types';
export { BLEND_MODES } from './blend-mode-types';
export type { BlendMode } from './blend-mode-types';

export function normalizeBlendMode(value: unknown): BlendMode {
  return BLEND_MODES.includes(value as BlendMode)
    ? (value as BlendMode)
    : 'normal';
}

export function canvasCompositeOperationFor(
  mode: BlendMode,
): CanvasContext2D['globalCompositeOperation'] {
  return mode === 'normal' ? 'source-over' : mode;
}

export class BlendModeEffect extends Effect {
  readonly type = 'blendMode';

  getMode(rctx: ResolveContext): BlendMode {
    return normalizeBlendMode(this.getProp<string>('blendMode')?.resolve(rctx));
  }

  override getMargins(_ctx: ResolveContext, _source?: EffectSource): Margins {
    return { x: 0, y: 0 };
  }
}
