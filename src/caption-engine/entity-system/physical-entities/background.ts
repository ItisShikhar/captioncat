import { BackgroundStyle, FollowTarget, Transform } from '../components';
import { FOLLOW_TARGET_BOUNDS_MAPPINGS } from '../follow';
import { staticProperty, type Property } from '../property';
import type { Vector2 } from '../types';
import { PhysicalEntity } from './physical-entity';

const DEFAULT_BACKGROUND_ENTITY_SIZE = 100;

/** An independently addressable background visual with its own transform. */
export class BackgroundEntity extends PhysicalEntity {
  readonly kind = 'background';
  forEntityId: string | null;
  resolvedTarget: PhysicalEntity | null = null;

  constructor(id: string, forEntityId: string | null = null, addDefaults = true) {
    super(id);
    this.forEntityId = forEntityId;
    if (!addDefaults) return;

    this.addComponent(
      new Transform(
        new Map<string, Property<unknown>>([
          ['positioning', staticProperty('string', 'absolute')],
          ['position', staticProperty<Vector2>('vector2', { x: 0, y: 0 })],
          [
            'dimensions',
            staticProperty<Vector2>('vector2', {
              x: DEFAULT_BACKGROUND_ENTITY_SIZE,
              y: DEFAULT_BACKGROUND_ENTITY_SIZE,
            }),
          ],
          ['widthMode', staticProperty('string', 'custom')],
          ['heightMode', staticProperty('string', 'custom')],
          ['rotation', staticProperty('number', 0)],
          ['scale', staticProperty<Vector2>('vector2', { x: 1, y: 1 })],
          ['opacity', staticProperty('number', 1)],
        ]),
      ),
    );
    this.addComponent(
      new FollowTarget(
        new Map<string, Property<unknown>>([
          ['target', staticProperty('string', 'entity')],
          ['targetId', staticProperty('string', forEntityId ?? '')],
          ['anchor', staticProperty('string', 'topLeft')],
          [
            'mappings',
            staticProperty(
              'array',
              forEntityId ? FOLLOW_TARGET_BOUNDS_MAPPINGS.map((mapping) => ({ ...mapping })) : [],
            ),
          ],
        ]),
      ),
    );
    this.addComponent(new BackgroundStyle());
  }

  override clone(): this {
    const copy = super.clone();
    copy.forEntityId = this.forEntityId;
    copy.resolvedTarget = null;
    return copy;
  }
}
