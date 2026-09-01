import { PhysicalEntity } from './physical-entity';
import { Video } from './video';

/** The bounded video frame that owns clipping for its source-video child. */
export class VideoArea extends PhysicalEntity {
  readonly kind = 'videoArea';

  get video(): Video | undefined {
    return this.children.find((child): child is Video => child instanceof Video);
  }
}