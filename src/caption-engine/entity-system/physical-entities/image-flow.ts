import { PhysicalEntity } from './physical-entity';

/** A flow-positioned image entity that participates in row layout. */
export class ImageFlowEntity extends PhysicalEntity {
  readonly kind = 'image';
}
