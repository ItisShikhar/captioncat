import { PhysicalEntity } from './physical-entity';
import type { ResolveContext, WordState } from '../types';

/** A single word (or punctuation group). */
export class Word extends PhysicalEntity {
  readonly kind = 'word';
  text: string;
  /** Row-resolved baseline for natural flow text; null uses the text's own ink center. */
  textBaselineOffset: number | null = null;
  /** State relative to the current word. `instantiateScene` sets this value. */
  state: WordState = 'next';
  /** Runtime row-wide font scale. The authored Font component remains unchanged. */
  fontScale = 1;
  /** Runtime letter spacing used by single-word stretch justification. */
  textLetterSpacing: number | null = null;
  /** Runtime vertical scale used by vertical single-item stretch. */
  textVerticalScale = 1;

  constructor(id: string, text = '') {
    super(id);
    this.text = text;
  }

  override clone(): this {
    const copy = super.clone();
    copy.textBaselineOffset = null;
    copy.fontScale = 1;
    copy.textLetterSpacing = null;
    copy.textVerticalScale = 1;
    return copy;
  }

  /** Inject this word's lifecycle so its components resolve cross-state blends. */
  override contextFor(rctx: ResolveContext): ResolveContext {
    const local = super.contextFor(rctx);
    const letterSpacingOverride = this.textLetterSpacing ?? local.letterSpacingOverride;
    return {
      ...local,
      lifecycle: this.lifecycle,
      fontScale: this.fontScale,
      ...(letterSpacingOverride === undefined ? {} : { letterSpacingOverride }),
    };
  }
}
