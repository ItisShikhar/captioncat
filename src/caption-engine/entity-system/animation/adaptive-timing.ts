export interface AdaptiveTiming {
  delaySeconds: number;
  durationSeconds: number;
}

export interface AdaptiveSequenceTiming {
  durationSeconds: number;
  staggerDelaySeconds: number;
}

function nonNegativeFinite(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function resolveAdaptiveTiming(
  configuredDurationSeconds: number,
  configuredDelaySeconds: number,
  availableDurationSeconds: number,
): AdaptiveTiming {
  const durationSeconds = nonNegativeFinite(configuredDurationSeconds);
  const delaySeconds = nonNegativeFinite(configuredDelaySeconds);
  const availableDuration = nonNegativeFinite(availableDurationSeconds);
  const effectiveDelay = Math.min(delaySeconds, availableDuration);

  return {
    delaySeconds: effectiveDelay,
    durationSeconds: Math.min(durationSeconds, Math.max(0, availableDuration - effectiveDelay)),
  };
}

export function resolveAdaptiveSequenceTiming(
  configuredDurationSeconds: number,
  configuredStaggerDelaySeconds: number,
  maxStaggerOrder: number,
  availableDurationSeconds: number,
): AdaptiveSequenceTiming {
  const durationSeconds = nonNegativeFinite(configuredDurationSeconds);
  const staggerDelaySeconds = nonNegativeFinite(configuredStaggerDelaySeconds);
  const staggerOrder = nonNegativeFinite(maxStaggerOrder);
  const availableDuration = nonNegativeFinite(availableDurationSeconds);
  const configuredSpan = durationSeconds + staggerDelaySeconds * staggerOrder;

  if (configuredSpan <= 0 || availableDuration >= configuredSpan) {
    return { durationSeconds, staggerDelaySeconds };
  }

  const scale = availableDuration / configuredSpan;
  return {
    durationSeconds: durationSeconds * scale,
    staggerDelaySeconds: staggerDelaySeconds * scale,
  };
}
