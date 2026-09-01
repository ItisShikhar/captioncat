import type { AnimationSequencer } from './types';

function seededOrder(count: number, seed: number): number[] {
  const values = Array.from({ length: count }, (_, index) => index);
  let state = seed | 0;
  for (let index = values.length - 1; index > 0; index--) {
    state = Math.imul(state ^ (state >>> 15), 1 | state);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
    const unit = ((state ^ (state >>> 14)) >>> 0) / 0x1_0000_0000;
    const swap = Math.floor(unit * (index + 1));
    [values[index], values[swap]] = [values[swap], values[index]];
  }
  return values;
}

export function sequenceDelay(sequencer: AnimationSequencer, index: number, count: number): number {
  if (count <= 1 || sequencer.pattern === 'simultaneous' || sequencer.pattern === 'timeline') return 0;
  const clampedIndex = Math.min(count - 1, Math.max(0, index));
  const orderedIndex = sequencer.reverse ? count - 1 - clampedIndex : clampedIndex;
  let step = orderedIndex;

  if (sequencer.pattern === 'random') {
    step = seededOrder(count, sequencer.seed).indexOf(orderedIndex);
  } else if (sequencer.pattern === 'centerOut') {
    step = Math.abs(orderedIndex - (count - 1) / 2);
  } else if (sequencer.pattern === 'outsideIn') {
    step = (count - 1) / 2 - Math.abs(orderedIndex - (count - 1) / 2);
  }

  return Math.max(0, step) * Math.max(0, sequencer.interval);
}