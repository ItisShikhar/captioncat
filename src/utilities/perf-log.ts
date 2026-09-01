// Lightweight, opt-in phase timing for profiling the render pipeline.
// Enable with CAPTIONCAT_PERF_LOG=1. The logger is inactive otherwise.
// so normal library usage and tests are unaffected.
const PERF_LOGGING_ENABLED = process.env.CAPTIONCAT_PERF_LOG === '1';

export function perfStart(): number {
  return Date.now();
}

export function perfEnd(label: string, startedAt: number): void {
  if (!PERF_LOGGING_ENABLED) {
    return;
  }
  // eslint-disable-next-line no-console
  console.error(`[PERF] ${label}: ${Date.now() - startedAt}ms`);
}

export async function perfWrap<T>(label: string, work: () => Promise<T>): Promise<T> {
  if (!PERF_LOGGING_ENABLED) {
    return work();
  }
  const startedAt = perfStart();
  try {
    return await work();
  } finally {
    perfEnd(label, startedAt);
  }
}
