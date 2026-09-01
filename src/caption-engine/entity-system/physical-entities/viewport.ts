import { PhysicalEntity } from './physical-entity';
import { CompositionArea } from './composition-area';
import { VideoArea } from './video-area';

/**
 * The outermost region within the raw video frame that a design occupies.
 * Its own `Layout` (see `resolveAreaBox`) is resolved against the full frame
 * first, and its direct children hold the bounded VideoArea and the caption
 * composition area as siblings. Every ECS design tree has exactly one
 * canonical Viewport.
 */
export class Viewport extends PhysicalEntity {
  readonly kind = 'viewport';

  /** The single bounded video frame every Viewport carries. */
  get videoArea(): VideoArea | undefined {
    return this.children.find((child): child is VideoArea => child instanceof VideoArea);
  }

  /** The source Video nested inside the Viewport's VideoArea. */
  get video() {
    return this.videoArea?.video;
  }

  /** The single CompositionArea child every Viewport carries. */
  get compositionArea(): CompositionArea | undefined {
    return this.children.find((child): child is CompositionArea => child instanceof CompositionArea);
  }
}
