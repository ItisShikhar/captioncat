export type AnimationPhase = 'enter' | 'active' | 'exit' | 'custom';
export type AnimationPlaybackMode = 'once' | 'loop' | 'pingPong';

export type AnimationScope = 'self' | 'children' | 'descendants';

export type SequencerPattern =
  | 'simultaneous'
  | 'stagger'
  | 'wave'
  | 'random'
  | 'centerOut'
  | 'outsideIn'
  | 'timeline';

export type NamedAnimationCurve =
  | 'linear'
  | 'ease'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'bounce'
  | 'elastic'
  | 'cubic'
  | 'cubicIn'
  | 'cubicOut'
  | 'cubicInOut'
  | 'back'
  | 'backIn'
  | 'backOut'
  | 'backInOut'
  | 'hold';

export interface BezierAnimationCurve {
  type: 'bezier';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export type AnimationCurve = NamedAnimationCurve | BezierAnimationCurve;

export interface AnimationKeyframe<T = unknown> {
  time: number;
  value: T;
  curve?: AnimationCurve;
}

export interface AnimationSequencer {
  pattern: SequencerPattern;
  interval: number;
  reverse: boolean;
  seed: number;
}

export type AnimationTrackSampling = 'interpolate' | 'randomValues' | 'randomRange';
export type AnimationTrackMode = 'absolute' | 'relative';
export type AnimationTriggerBehavior = 'adaptive' | 'restart' | 'continue';
export type AnimationLifecycleScheduling = 'overlap' | 'sequential';

export interface AnimationTrackDefinition {
  enabled: boolean;
  target: string;
  keyframes: AnimationKeyframe[];
  /** Position tracks default to absolute/local semantics when omitted. */
  mode?: AnimationTrackMode;
  sampling?: AnimationTrackSampling;
  updateEveryFrame?: boolean;
}

export interface AnimationDefinition {
  enabled: boolean;
  name: string;
  phase: AnimationPhase;
  playbackMode: AnimationPlaybackMode;
  scope: AnimationScope;
  durationSeconds: number;
  delaySeconds: number;
  triggerBehavior: AnimationTriggerBehavior;
  lifecycleScheduling: AnimationLifecycleScheduling;
  sequencer: AnimationSequencer;
  tracks: AnimationTrackDefinition[];
}

export const DEFAULT_ANIMATION_SEQUENCER: AnimationSequencer = {
  pattern: 'simultaneous',
  interval: 0,
  reverse: false,
  seed: 0,
};