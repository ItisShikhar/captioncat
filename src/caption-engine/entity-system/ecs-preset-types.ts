import type {
  AnimationLifecycleScheduling,
  AnimationPhase,
  AnimationPlaybackMode,
  AnimationScope,
  AnimationSequencer,
  AnimationTrackDefinition,
  AnimationTriggerBehavior,
} from './animation/types';
import type {
  RandomizerAxis,
  RandomizerMode,
  RandomizerScope,
  RandomizerTrigger,
} from './randomizer-types';
import type { StateStyleSource } from './state-style-types';
import type { TransitionConfig } from './transition-types';
import type { DistanceUnit, RandomizerRange } from './value-types';

export type EcsTransition = TransitionConfig;

export interface EcsRandomizer {
  enabled?: boolean;
  values?: unknown[];
  range?: RandomizerRange;
  trigger?: RandomizerTrigger;
  updateEveryFrame?: boolean;
  deterministic?: boolean;
  persistAcrossStates?: boolean;
  mode?: RandomizerMode;
  scope?: RandomizerScope;
  seed?: number;
  axes?: Partial<Record<RandomizerAxis, EcsRandomizer>>;
}

export interface EcsLeaf {
  type: string;
  value?: unknown;
  pattern?: string;
  colors?: string[];
  offset?: number;
  unit?: DistanceUnit;
  squircle?: boolean;
  transition?: EcsTransition;
  runtimeOnly?: boolean;
  randomizer?: EcsRandomizer;
}

export interface EcsPropGroup {
  [key: string]: EcsPropNode;
}

export type EcsPropNode = EcsLeaf | EcsPropGroup;

export interface EcsComponentNode {
  component: string;
  props?: Record<string, EcsPropNode>;
  components?: EcsComponentNode[];
  effects?: EcsEffectNode[];
  enabled?: boolean;
  name?: string;
  phase?: AnimationPhase;
  playbackMode?: AnimationPlaybackMode;
  scope?: AnimationScope;
  durationSeconds?: number;
  delaySeconds?: number;
  triggerBehavior?: AnimationTriggerBehavior;
  lifecycleScheduling?: AnimationLifecycleScheduling;
  preset?: string;
  parameters?: Record<string, number | string>;
  sequencer?: AnimationSequencer;
  tracks?: AnimationTrackDefinition[];
  /** Metadata identifying an explicit component dependency. */
  dependencyOf?: string;
  /** Metadata identifying the visual parent of a dependent component. */
  attachedTo?: string;
}

export interface EcsEffectNode {
  effect: string;
  id: string;
  props?: Record<string, EcsPropNode>;
  dependencyOf?: string;
}

export interface EcsEntityNode {
  entity: string;
  id: string;
  forEntityId?: string;
  /** Relative state templates can reuse another sibling's complete style. */
  styleSource?: StateStyleSource;
  components?: EcsComponentNode[];
  effects?: EcsEffectNode[];
  children?: EcsEntityNode[];
}
