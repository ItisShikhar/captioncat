import { PhysicalEntity } from './physical-entity';

/** Source-video surface inside a VideoArea. It owns motion controls and dimensions. */
export class Video extends PhysicalEntity {
  readonly kind = 'video';
}