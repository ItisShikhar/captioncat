import type { AnimationDefinition } from '../animation/types';
import { DEFAULT_ANIMATION_SEQUENCER } from '../animation/types';
import type { ResolveContext } from '../types';
import { Component } from './component';

export class AnimationComponent extends Component {
  readonly type = 'animation';
  override readonly allowedEntities = [
    'viewport',
    'videoArea',
    'video',
    'compositionArea',
    'page',
    'row',
    'word',
    'marker',
    'background',
  ];
  override readonly allowDisable = true;
  override readonly isDeletable = true;
  readonly definition: AnimationDefinition;

  constructor(definition: Partial<AnimationDefinition> = {}) {
    super();
    this.definition = {
      enabled: definition.enabled ?? true,
      name: definition.name ?? 'Animation',
      phase: definition.phase ?? 'enter',
      playbackMode: definition.playbackMode ?? 'once',
      scope: definition.scope ?? 'self',
      durationSeconds: definition.durationSeconds ?? 0.3,
      delaySeconds: definition.delaySeconds ?? 0,
      triggerBehavior: definition.triggerBehavior ?? 'adaptive',
      lifecycleScheduling: definition.lifecycleScheduling ?? 'overlap',
      sequencer: { ...DEFAULT_ANIMATION_SEQUENCER, ...definition.sequencer },
      tracks: (definition.tracks ?? []).map((track) => ({
        ...track,
        keyframes: track.keyframes.map((keyframe) => ({ ...keyframe })),
      })),
    };
  }

  override isEnabled(_rctx: ResolveContext): boolean {
    return this.definition.enabled;
  }

  override clone(): AnimationComponent {
    const copy = new AnimationComponent(this.definition);
    if (this.dependencyOf !== undefined) copy.dependencyOf = this.dependencyOf;
    return copy;
  }
}