import { staticProperty, type Property } from '../property';
import {
  type ImageSequencerTriggerState,
  type ResolveContext,
} from '../types';
import { Component } from './component';
import { pseudoRandom } from '../effects/pixel-utils';
import {
  IMAGE_SEQUENCER_ADVANCE_OPTIONS,
  IMAGE_SEQUENCER_END_OPTIONS,
  IMAGE_SEQUENCER_TRIGGERS,
  type ImageSequencerAdvance,
  type ImageSequencerEndBehavior,
  type ImageSequencerPlaybackMode,
  type ImageSequencerTrigger,
  type ImageSequencerTriggerRule,
} from './image-sequencer-types';
export {
  IMAGE_SEQUENCER_ADVANCE_OPTIONS,
  IMAGE_SEQUENCER_END_OPTIONS,
  IMAGE_SEQUENCER_TRIGGERS,
  type ImageSequencerAdvance,
  type ImageSequencerEndBehavior,
  type ImageSequencerPlaybackMode,
  type ImageSequencerTrigger,
  type ImageSequencerTriggerRule,
} from './image-sequencer-types';

export function normalizeImageSequencerTrigger(value: unknown): ImageSequencerTrigger | undefined {
  if (value === 'current') return 'currentWordStart';
  return typeof value === 'string' && IMAGE_SEQUENCER_TRIGGERS.includes(value as ImageSequencerTrigger)
    ? (value as ImageSequencerTrigger)
    : undefined;
}

export function normalizeImageSequencerAdvance(value: unknown): ImageSequencerAdvance | undefined {
  return typeof value === 'string' && IMAGE_SEQUENCER_ADVANCE_OPTIONS.includes(value as ImageSequencerAdvance)
    ? (value as ImageSequencerAdvance)
    : undefined;
}

export function normalizeImageSequencerEndBehavior(value: unknown): ImageSequencerEndBehavior | undefined {
  return typeof value === 'string' && IMAGE_SEQUENCER_END_OPTIONS.includes(value as ImageSequencerEndBehavior)
    ? (value as ImageSequencerEndBehavior)
    : undefined;
}

export function normalizeImageSequencerTriggerRule(
  value: unknown,
  fallbackAdvance: ImageSequencerAdvance = 'next',
): ImageSequencerTriggerRule | undefined {
  const rawRule =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as { trigger?: unknown; advance?: unknown })
      : { trigger: value };
  const trigger = normalizeImageSequencerTrigger(rawRule.trigger);
  if (trigger === undefined) return undefined;
  return {
    trigger,
    advance: normalizeImageSequencerAdvance(rawRule.advance) ?? fallbackAdvance,
  };
}

export function advanceImageSequencerFramePosition(
  currentPosition: number,
  advance: ImageSequencerAdvance,
  frameCount: number,
  triggerIndex: number,
): number {
  if (frameCount <= 0 || advance === 'none') return currentPosition;
  if (advance === 'previous') return currentPosition - 1;
  if (advance === 'random') return Math.floor(pseudoRandom(triggerIndex, 0, 0) * frameCount);
  return currentPosition + 1;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((frame): frame is string => typeof frame === 'string') : [];
}

function enumValue<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return values.includes(value as T) ? (value as T) : fallback;
}

export class ImageSequencer extends Component {
  readonly type = 'imageSequencer';
  override readonly allowedEntities = ['viewport', 'videoArea', 'video', 'compositionArea', 'page', 'row', 'word', 'marker'];
  override readonly allowedQuantity = 1;
  override readonly allowDisable = true;

  constructor(props?: Map<string, Property<unknown>>) {
    super(props);
    if (!this.props.has('enabled')) this.props.set('enabled', staticProperty('boolean', true));
    if (!this.props.has('frames')) this.props.set('frames', staticProperty('array', []));
    if (!this.props.has('playbackMode')) this.props.set('playbackMode', staticProperty('string', 'continuous'));
    if (!this.props.has('frameRate')) this.props.set('frameRate', staticProperty('number', 12));
    if (!this.props.has('loop')) this.props.set('loop', staticProperty('boolean', true));
    if (!this.props.has('trigger')) {
      this.props.set('trigger', staticProperty('array', [{ trigger: 'currentWordStart', advance: 'next' }]));
    }
    if (!this.props.has('endBehavior')) this.props.set('endBehavior', staticProperty('string', 'hold'));
  }

  frames(rctx: ResolveContext): string[] {
    return stringArray(this.getProp<unknown[]>('frames')?.resolve(rctx));
  }

  playbackMode(rctx: ResolveContext): ImageSequencerPlaybackMode {
    return enumValue(
      this.getProp<string>('playbackMode')?.resolve(rctx),
      ['continuous', 'onTrigger', 'perTrigger'],
      'continuous',
    );
  }

  frameRate(rctx: ResolveContext): number {
    const value = Number(this.getProp<number>('frameRate')?.resolve(rctx));
    return Number.isFinite(value) && value > 0 ? Math.min(60, value) : 12;
  }

  loop(rctx: ResolveContext): boolean {
    return this.getProp<boolean>('loop')?.resolve(rctx) !== false;
  }

  triggerRules(rctx: ResolveContext): ImageSequencerTriggerRule[] {
    const value = this.getProp<unknown>('trigger')?.resolve(rctx);
    const configured = Array.isArray(value) ? value : typeof value === 'string' ? [value] : ['currentWordStart'];
    const fallbackAdvance = this.advance(rctx);
    const seen = new Set<ImageSequencerTrigger>();
    return [
      ...configured
        .map((item) => normalizeImageSequencerTriggerRule(item, fallbackAdvance))
        .filter((rule): rule is ImageSequencerTriggerRule => {
          if (!rule || seen.has(rule.trigger)) return false;
          seen.add(rule.trigger);
          return true;
        }),
    ];
  }

  triggers(rctx: ResolveContext): ImageSequencerTrigger[] {
    return this.triggerRules(rctx).map((rule) => rule.trigger);
  }

  advance(rctx: ResolveContext): ImageSequencerAdvance {
    return enumValue(
      this.getProp<string>('advance')?.resolve(rctx),
      ['next', 'previous', 'random'],
      'next',
    );
  }

  endBehavior(rctx: ResolveContext): ImageSequencerEndBehavior {
    return normalizeImageSequencerEndBehavior(this.getProp<string>('endBehavior')?.resolve(rctx)) ?? 'hold';
  }

  frameIndex(rctx: ResolveContext): number {
    if (!this.isEnabled(rctx)) return -1;
    const frames = this.frames(rctx);
    if (frames.length === 0) return -1;

    const mode = this.playbackMode(rctx);
    const triggerState: ImageSequencerTriggerState | undefined = rctx.imageSequencerTriggerStates?.get(this);
    const triggerIndex = triggerState?.index ?? rctx.triggerIndex;
    const triggerElapsedSeconds = triggerState?.elapsedSeconds ?? rctx.elapsedSeconds;
    const playbackElapsedSeconds = mode === 'perTrigger' ? triggerElapsedSeconds : rctx.elapsedSeconds;
    let advancedIndex: number;
    if (triggerState?.framePosition !== undefined) {
      const advance = triggerState.advance ?? 'next';
      const rawPosition =
        mode === 'perTrigger'
          ? triggerState.framePosition +
            (advance === 'next'
              ? Math.floor(Math.max(0, playbackElapsedSeconds) * this.frameRate(rctx))
              : advance === 'previous'
                ? -Math.floor(Math.max(0, playbackElapsedSeconds) * this.frameRate(rctx))
                : 0)
          : triggerState.framePosition;
      advancedIndex = rawPosition;
    } else {
      const rawIndex =
        mode === 'onTrigger'
          ? Math.max(0, Math.floor(triggerIndex ?? 0))
          : Math.max(0, Math.floor(Math.max(0, playbackElapsedSeconds) * this.frameRate(rctx)));
      const advance = this.advance(rctx);
      advancedIndex =
        advance === 'previous'
          ? frames.length - 1 - rawIndex
          : advance === 'random'
            ? Math.floor(
                pseudoRandom(mode === 'continuous' ? rawIndex : Math.max(0, triggerIndex ?? 0), 0, 0) * frames.length,
              )
            : rawIndex;
    }
    const endBehavior = this.endBehavior(rctx);
    if (endBehavior === 'pingPong') {
      const period = Math.max(1, frames.length * 2 - 2);
      const normalized = ((advancedIndex % period) + period) % period;
      return normalized < frames.length ? normalized : period - normalized;
    }
    const shouldLoop = mode === 'continuous' ? this.loop(rctx) : endBehavior === 'loop';
    if (shouldLoop) {
      return ((advancedIndex % frames.length) + frames.length) % frames.length;
    }
    return Math.min(Math.max(advancedIndex, 0), frames.length - 1);
  }

  asset(rctx: ResolveContext): string | undefined {
    if (!this.isEnabled(rctx)) return undefined;
    const frames = this.frames(rctx);
    const index = this.frameIndex(rctx);
    return index >= 0 ? frames[index] : undefined;
  }
}
