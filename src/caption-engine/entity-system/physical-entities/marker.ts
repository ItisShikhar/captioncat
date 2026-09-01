import {
  FollowTarget,
  Image,
  MarkerBehavior,
  Transform,
  type MarkerBehaviorConfig,
  followTargetPropsFromConfig,
  markerBehaviorPropsFromConfig,
} from '../components';
import type { FollowAnchor, FollowTargetKind } from '../follow';
import { staticProperty } from '../property';
import { PhysicalEntity } from './physical-entity';
import type { Vector2 } from '../types';

export type MarkerConfig = Partial<MarkerBehaviorConfig> & {
  followTarget?: FollowTargetKind;
  anchor?: FollowAnchor;
  offset?: Vector2;
};

export class Marker extends PhysicalEntity {
  readonly kind = 'marker';
  forEntityId: string | null = null;
  resolvedTarget: PhysicalEntity | null = null;

  constructor(id: string, config: MarkerConfig = {}, addDefaultBehaviour = true) {
    super(id);
    if (!addDefaultBehaviour) return;
    this.addComponent(
      new Transform(
        new Map<string, import('../property').Property<unknown>>([
          ['positioning', staticProperty('string', 'absolute')],
          ['position', staticProperty('vector2', { x: 0, y: 0 })],
          ['dimensions', staticProperty('vector2', { x: 32, y: 32 })],
          ['widthMode', staticProperty('string', 'custom')],
          ['heightMode', staticProperty('string', 'custom')],
          ['rotation', staticProperty('number', 0)],
          ['scale', staticProperty('vector2', { x: 1, y: 1 })],
          ['opacity', staticProperty('number', 1)],
        ]),
      ),
    );
    this.addComponent(new Image());
    this.addComponent(
      new FollowTarget(
        followTargetPropsFromConfig({
          target: config.followTarget ?? 'parent',
          anchor: config.anchor ?? 'topCenter',
          mappings: [
            {
              destination: 'Transform.position.x',
              source: 'bounds.x',
              offset: config.offset?.x ?? 0,
            },
            {
              destination: 'Transform.position.y',
              source: 'bounds.y',
              offset: config.offset?.y ?? 0,
            },
          ],
        }),
      ),
    );
    this.addComponent(new MarkerBehavior(markerBehaviorPropsFromConfig(config)));
  }

  get markerBehavior(): MarkerBehavior | undefined {
    return this.getComponent<MarkerBehavior>('markerBehavior');
  }

  override clone(): this {
    const copy = super.clone();
    copy.resolvedTarget = null;
    return copy;
  }
}
