import type { Property } from '../property';
import { MotionBlurEffect } from './motion-blur';

/** Streak renders Motion Blur copies in the configured direction only. */
export class StreakEffect extends MotionBlurEffect {
  override readonly type = 'streak';
  protected override readonly rendersBothDirections = false;

  constructor(props?: Map<string, Property<unknown>>) {
    super(props);
  }
}
