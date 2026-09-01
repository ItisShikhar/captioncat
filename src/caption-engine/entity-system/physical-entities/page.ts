import { PhysicalEntity } from './physical-entity';

/**
 * One block of caption content. Spatial and multi-instance: a CompositionArea
 * can hold several Pages placed at different positions (e.g. one per speaker),
 * each a fully independent style with its own live state.
 */
export class Page extends PhysicalEntity {
  readonly kind = 'page';
  /** Runtime markers for dimensions resolved by Caption Layout. */
  captionLayoutManagedWidth = false;
  captionLayoutManagedHeight = false;
}
