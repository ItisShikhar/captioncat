import type { RowState } from '../types';
import { PhysicalEntity } from './physical-entity';

/** A single line of words within a Page. */
export class Row extends PhysicalEntity {
  readonly kind = 'row';
  /** State relative to the current word. The builder sets template rows. `instantiateScene` sets real rows. */
  state: RowState = 'default';
  /** Runtime flags for dimensions controlled by a parent Page's single-item Stretch. */
  parentLayoutManagedWidth = false;
  parentLayoutManagedHeight = false;
  /** Runtime scale applied to the complete Row subtree for parent-driven Stretch. */
  parentLayoutScaleX = 1;
  parentLayoutScaleY = 1;
}
