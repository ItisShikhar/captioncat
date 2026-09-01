interface FollowSample {
  timeSeconds: number;
  value: unknown;
}

interface FollowTargetSample {
  timeSeconds: number;
  targetIdentity: string;
  parentIdentity: string | undefined;
  pageIdentity: string | undefined;
  targetBoundary: boolean;
  parentBoundary: boolean;
  pageBoundary: boolean;
}

function timeOf(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export class FollowRuntime {
  private readonly histories = new Map<string, FollowSample[]>();
  private readonly targetSamples = new Map<string, FollowTargetSample>();

  clear(): void {
    this.histories.clear();
    this.targetSamples.clear();
  }

  boundariesAt(
    key: string,
    targetIdentity: string,
    parentIdentity: string | undefined,
    pageIdentity: string | undefined,
    timeSeconds?: number,
  ): { targetBoundary: boolean; parentBoundary: boolean; pageBoundary: boolean } {
    const time = timeOf(timeSeconds);
    const previous = this.targetSamples.get(key);
    if (
      previous?.timeSeconds === time &&
      previous.targetIdentity === targetIdentity &&
      previous.parentIdentity === parentIdentity &&
      previous.pageIdentity === pageIdentity
    ) {
      return {
        targetBoundary: previous.targetBoundary,
        parentBoundary: previous.parentBoundary,
        pageBoundary: previous.pageBoundary,
      };
    }

    if (previous && time < previous.timeSeconds) {
      this.targetSamples.set(key, {
        timeSeconds: time,
        targetIdentity,
        parentIdentity,
        pageIdentity,
        targetBoundary: false,
        parentBoundary: false,
        pageBoundary: false,
      });
      return { targetBoundary: false, parentBoundary: false, pageBoundary: false };
    }

    const targetBoundary =
      (previous?.timeSeconds === time ? previous.targetBoundary : false) ||
      (previous !== undefined && previous.targetIdentity !== targetIdentity);
    const parentBoundary =
      (previous?.timeSeconds === time ? previous.parentBoundary : false) ||
      (previous !== undefined && previous.parentIdentity !== parentIdentity);
    const pageBoundary =
      (previous?.timeSeconds === time ? previous.pageBoundary : false) ||
      (previous !== undefined && previous.pageIdentity !== pageIdentity);
    this.targetSamples.set(key, {
      timeSeconds: time,
      targetIdentity,
      parentIdentity,
      pageIdentity,
      targetBoundary,
      parentBoundary,
      pageBoundary,
    });
    return { targetBoundary, parentBoundary, pageBoundary };
  }

  resolve(key: string, value: unknown, delaySeconds: number, timeSeconds?: number): unknown {
    const time = timeOf(timeSeconds);
    const delay = Math.max(0, Number.isFinite(delaySeconds) ? delaySeconds : 0);
    const history = this.histories.get(key) ?? [];
    const last = history[history.length - 1];
    if (last?.timeSeconds === time) {
      last.value = value;
    } else if (!last || time > last.timeSeconds) {
      history.push({ timeSeconds: time, value });
    } else {
      history.length = 0;
      history.push({ timeSeconds: time, value });
    }

    if (delay === 0) {
      if (history.length > 1) history.splice(0, history.length - 1);
      this.histories.set(key, history);
      return value;
    }

    const sampleTime = time - delay;
    let sample = history[0];
    for (const candidate of history) {
      if (candidate.timeSeconds > sampleTime) break;
      sample = candidate;
    }
    const oldestAllowedTime = sampleTime - Math.max(delay, 1);
    while (history.length > 1 && history[1].timeSeconds < oldestAllowedTime) history.shift();
    this.histories.set(key, history);
    return sample?.value ?? value;
  }
}

export function createFollowRuntime(): FollowRuntime {
  return new FollowRuntime();
}
