import { PhysicalEntity } from './physical-entity';

/** Root region within the frame that captions are laid out inside. */
export class CompositionArea extends PhysicalEntity {
  readonly kind = 'compositionArea';
}
