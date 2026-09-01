/**
 * Studio-side model of the engine's first-class `animation` component
 * (`src/caption-engine/entity-system/animation/*`). Presets are an editor
 * abstraction that generates tracks. Once a user edits generated tracks, the
 * animation becomes `custom`. The tracks remain the source of truth for
 * animated values.
 */

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
export type AnimationTrackSampling = 'interpolate' | 'randomValues' | 'randomRange';
export type AnimationTrackMode = 'absolute' | 'relative';
export type AnimationTriggerBehavior = 'adaptive' | 'restart' | 'continue';
export type AnimationLifecycleScheduling = 'overlap' | 'sequential';

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

export interface AnimationKeyframeDoc {
  time: number;
  value: unknown;
  curve?: AnimationCurve;
}

export interface AnimationTrackDoc {
  enabled: boolean;
  target: string;
  keyframes: AnimationKeyframeDoc[];
  /** Position tracks default to absolute/local semantics when omitted. */
  mode?: AnimationTrackMode;
  sampling?: AnimationTrackSampling;
  updateEveryFrame?: boolean;
}

export interface AnimationSequencerDoc {
  pattern: SequencerPattern;
  interval: number;
  reverse: boolean;
  seed: number;
}

export interface AnimationDoc {
  enabled: boolean;
  name: string;
  phase: AnimationPhase;
  playbackMode: AnimationPlaybackMode;
  scope: AnimationScope;
  durationSeconds: number;
  delaySeconds: number;
  triggerBehavior: AnimationTriggerBehavior;
  lifecycleScheduling: AnimationLifecycleScheduling;
  /** The editor preset that generated the tracks, or `custom` once hand-edited. */
  preset: string;
  /** Frozen preset parameter values. The runtime does not read them. */
  parameters: Record<string, number | string>;
  sequencer: AnimationSequencerDoc;
  tracks: AnimationTrackDoc[];
}

export const DEFAULT_ANIMATION_SEQUENCER: AnimationSequencerDoc = {
  pattern: 'simultaneous',
  interval: 0,
  reverse: false,
  seed: 0,
};

export const CUSTOM_PRESET_ID = 'custom';

export const NAMED_CURVES: NamedAnimationCurve[] = [
  'linear',
  'ease',
  'easeIn',
  'easeOut',
  'easeInOut',
  'bounce',
  'elastic',
  'cubic',
  'cubicIn',
  'cubicOut',
  'cubicInOut',
  'back',
  'backIn',
  'backOut',
  'backInOut',
  'hold',
];

export const SEQUENCER_PATTERNS: SequencerPattern[] = [
  'simultaneous',
  'stagger',
  'wave',
  'random',
  'centerOut',
  'outsideIn',
  'timeline',
];

export const ANIMATION_SCOPES: AnimationScope[] = ['self', 'children', 'descendants'];
export const ANIMATION_PHASES: AnimationPhase[] = ['enter', 'active', 'exit', 'custom'];
export const ANIMATION_PLAYBACK_MODES: AnimationPlaybackMode[] = ['once', 'loop', 'pingPong'];
export const ANIMATION_TRIGGER_BEHAVIORS: AnimationTriggerBehavior[] = ['adaptive', 'restart', 'continue'];
export const ANIMATION_LIFECYCLE_SCHEDULINGS: AnimationLifecycleScheduling[] = ['overlap', 'sequential'];
