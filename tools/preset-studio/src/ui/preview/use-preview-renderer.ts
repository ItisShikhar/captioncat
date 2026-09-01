import type {
  CaptionLayoutOverride,
  CaptionDebugFrame,
  RenderPreviewFrame,
  RenderPreviewResult,
  RenderPreviewStreamFrame,
  RenderPreviewStreamHandlers,
  CaptionFlowLayoutMode,
  RenderPreviewStart,
  PreviewWordStateLayout,
  WordState,
} from '@captioncat/caption-engine/browser';
import type { PresetEditorState } from '@/schema';
import { previewRenderTiming } from '@/ui/constants';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PREVIEW_FPS, type PreviewQuality } from './aspect-ratios';
import type { SampleTimestamps } from './preview-timestamps';
import { supportsPreviewWorkerRendering } from '@/engine-adapters/preview-worker-support';
import { toEcsCaptionPreset } from '@/schema/preset';

export type PreviewStatus = 'loading' | 'ready' | 'error';

export interface UsePreviewRendererResult {
  status: PreviewStatus;
  error: string | null;
  result: RenderPreviewResult | null;
}

interface PreviewCacheEntry {
  result: RenderPreviewResult;
  byteSize: number;
}

interface PreviewRenderOptions {
  videoResolution: { width: number; height: number };
  words: string[];
  wordStartTimesSeconds: number[];
  wordEndTimesSeconds: number[];
  breakBefore?: boolean[];
  fps: number;
  language?: string;
  previewWordState?: WordState;
  previewWordStateLayout?: PreviewWordStateLayout;
  captionLayout?: CaptionLayoutOverride;
  layoutMode?: CaptionFlowLayoutMode;
  fitPageToChildren?: boolean;
  allowContentOverflow?: boolean;
}

type PreviewRenderPriority = 'main' | 'word' | 'state';

const PREVIEW_RENDER_PRIORITY: Record<PreviewRenderPriority, number> = {
  main: 0,
  word: 1,
  state: 2,
};

interface PreviewRenderTask {
  key: string;
  preset: PresetEditorState;
  options: PreviewRenderOptions;
  priority: number;
  sequence: number;
  promise: Promise<RenderPreviewResult>;
  resolve: (result: RenderPreviewResult) => void;
  reject: (reason: Error) => void;
  onUpdate?: (result: RenderPreviewResult) => void;
  started: boolean;
  cancelled: boolean;
  cancelRender?: () => void;
}

interface PreviewRenderHandle {
  promise: Promise<RenderPreviewResult>;
  cancel: () => void;
}

class PreviewRenderCancelledError extends Error {
  constructor() {
    super('Preview render cancelled.');
    this.name = 'PreviewRenderCancelledError';
  }
}

const MAX_CACHED_RAW_PREVIEWS = 8;
const MAX_CACHED_RAW_PREVIEW_BYTES = 128 * 1024 * 1024;
const PREVIEW_STREAM_UPDATE_INTERVAL_MS = 100;
const MAX_CONCURRENT_PREVIEW_RENDERS = supportsPreviewWorkerRendering() ? 3 : 1;
const ACTIVE_PREVIEW_RENDER_TIMING = supportsPreviewWorkerRendering()
  ? previewRenderTiming.worker
  : previewRenderTiming.nonWorker;
const previewCache = new Map<string, PreviewCacheEntry>();
const pendingPreviewRenders = new Map<string, Promise<RenderPreviewResult>>();
const previewRenderQueue: PreviewRenderTask[] = [];
let previewRenderDrainFrame: number | null = null;
let previewRenderSequence = 0;
let cachedPreviewBytes = 0;
let activePreviewRenderCount = 0;
const previewObjectIds = new WeakMap<object, number>();
let nextPreviewObjectId = 1;

function previewObjectId(value: object): number {
  const existing = previewObjectIds.get(value);
  if (existing !== undefined) return existing;
  const id = nextPreviewObjectId++;
  previewObjectIds.set(value, id);
  return id;
}

function previewCacheKey(
  preset: PresetEditorState,
  width: number,
  height: number,
  timestamps: SampleTimestamps,
  language?: string,
  quality: PreviewQuality = 'hd',
  previewWordState?: WordState,
  layoutMode: CaptionFlowLayoutMode = 'stable',
  previewWordStateLayout?: PreviewWordStateLayout,
  allowContentOverflow = false,
  fitPageToChildren = false,
): string {
  return JSON.stringify([
    previewObjectId(preset),
    previewObjectId(timestamps),
    width,
    height,
    quality,
    PREVIEW_FPS,
    language ?? null,
    preset.captionLayout.textDirection,
    timestamps.captionLayout?.textDirection ?? null,
    previewWordState ?? null,
    layoutMode,
    previewWordStateLayout ?? null,
    allowContentOverflow,
    fitPageToChildren,
  ]);
}

function previewByteSize(result: RenderPreviewResult): number {
  return result.frames.reduce((total, frame) => total + (frame.kind === 'raw' ? frame.buffer.byteLength : 0), 0);
}

function debugLayoutForStream(
  metadata: RenderPreviewStart,
  frames: readonly RenderPreviewFrame[],
): RenderPreviewResult['debugLayout'] | undefined {
  if (!metadata.debugLayout) return undefined;
  const debugFrames = frames.map((frame) => frame.debugFrame);
  if (!debugFrames.every((frame): frame is CaptionDebugFrame => frame !== undefined)) return undefined;
  return { ...metadata.debugLayout, frames: debugFrames };
}

function getCachedPreview(key: string): RenderPreviewResult | undefined {
  const entry = previewCache.get(key);
  if (!entry) return undefined;
  previewCache.delete(key);
  previewCache.set(key, entry);
  return entry.result;
}

function cachePreview(key: string, result: RenderPreviewResult): void {
  // Worker ImageBitmap resources stay owned by the active playback hooks.
  // Cache only raw fallback results, which are safe to retain and reuse.
  if (result.frames.some((frame) => frame.kind === 'bitmap')) return;
  const byteSize = previewByteSize(result);
  if (byteSize > MAX_CACHED_RAW_PREVIEW_BYTES) return;

  const existing = previewCache.get(key);
  if (existing) cachedPreviewBytes -= existing.byteSize;
  previewCache.delete(key);
  previewCache.set(key, { result, byteSize });
  cachedPreviewBytes += byteSize;

  while (previewCache.size > MAX_CACHED_RAW_PREVIEWS || cachedPreviewBytes > MAX_CACHED_RAW_PREVIEW_BYTES) {
    const oldestKey = previewCache.keys().next().value;
    if (oldestKey === undefined) break;
    const oldest = previewCache.get(oldestKey);
    if (oldest) cachedPreviewBytes -= oldest.byteSize;
    previewCache.delete(oldestKey);
  }
}

function waitForAnimationFrames(frameCount: number): Promise<void> {
  if (frameCount <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    let remaining = frameCount;
    const waitForNextFrame = (): void => {
      remaining -= 1;
      if (remaining <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(waitForNextFrame);
    };
    requestAnimationFrame(waitForNextFrame);
  });
}

function startPreviewRender(
  preset: PresetEditorState,
  options: PreviewRenderOptions,
  onUpdate?: (result: RenderPreviewResult) => void,
): PreviewRenderHandle {
  let cancelled = false;
  let activeCancel: (() => void) | undefined;
  let metadata: RenderPreviewStart | null = null;
  let frames: RenderPreviewFrame[] = [];
  let publishTimer: ReturnType<typeof setTimeout> | null = null;
  const publishFramesNow = (): void => {
    if (cancelled || !metadata) return;
    const debugLayout = debugLayoutForStream(metadata, frames);
    onUpdate?.({
      frames,
      captionInfos: [],
      frameSize: metadata.frameSize,
      placement: metadata.placement,
      videoResolution: metadata.videoResolution,
      ...(metadata.stablePageCrop ? { stablePageCrop: metadata.stablePageCrop } : {}),
      ...(debugLayout ? { debugLayout } : {}),
    });
  };
  const publishFrames = (): void => {
    if (!onUpdate) return;
    if (!metadata) return;
    if (frames.length === 1) {
      publishFramesNow();
      return;
    }
    if (publishTimer !== null) return;
    publishTimer = setTimeout(() => {
      publishTimer = null;
      publishFramesNow();
    }, PREVIEW_STREAM_UPDATE_INTERVAL_MS);
  };

  const onStart = (nextMetadata: RenderPreviewStart): void => {
    metadata = nextMetadata;
  };
  const onFrame = (frame: RenderPreviewStreamFrame): void => {
    if (!metadata) return;
    frames.push(frame);
    publishFrames();
  };
  const onFrameRepeat = (repeat: { frameIndex: number; sourceFrameIndex: number }): void => {
    if (!metadata) return;
    const source = frames[repeat.sourceFrameIndex];
    if (!source) return;
    frames.push(source);
    publishFrames();
  };

  const promise = (async (): Promise<RenderPreviewResult> => {
    const { preparePreviewWorkerOptions, renderPreviewInWorker } = await import('@/engine-adapters/preview-worker-client');
    if (cancelled) throw new PreviewRenderCancelledError();
    const workerAvailable = supportsPreviewWorkerRendering();
    const workerOptions = workerAvailable ? await preparePreviewWorkerOptions(options, preset) : options;
    if (cancelled) throw new PreviewRenderCancelledError();
    const workerHandle = workerAvailable
      ? renderPreviewInWorker(preset, workerOptions, { onStart, onFrame, onFrameRepeat })
      : null;
    if (workerHandle) {
      activeCancel = workerHandle.cancel;
      const result = await workerHandle.promise;
      if (publishTimer !== null) {
        clearTimeout(publishTimer);
        publishTimer = null;
      }
      const completeResult = result.frames.length > 0 ? result : { ...result, frames };
      onUpdate?.(completeResult);
      return completeResult;
    }
    if (workerAvailable) {
      throw new Error('Preview workers are available but could not be started.');
    }

    const { renderPresetPreviewStream } = await import('@captioncat/caption-engine/browser');
    if (cancelled) throw new PreviewRenderCancelledError();
    const result = await renderPresetPreviewStream(toEcsCaptionPreset(preset), options, {
      onStart,
      onFrame,
      isCancelled: () => cancelled,
    } satisfies RenderPreviewStreamHandlers);
    if (publishTimer !== null) {
      clearTimeout(publishTimer);
      publishTimer = null;
    }
    const completeResult = result.frames.length > 0 ? result : { ...result, frames };
    onUpdate?.(completeResult);
    return completeResult;
  })();

  return {
    promise,
    cancel: () => {
      cancelled = true;
      if (publishTimer !== null) {
        clearTimeout(publishTimer);
        publishTimer = null;
      }
      activeCancel?.();
    },
  };
}

function schedulePreviewQueue(): void {
  if (
    previewRenderQueue.length === 0 ||
    activePreviewRenderCount >= MAX_CONCURRENT_PREVIEW_RENDERS ||
    previewRenderDrainFrame !== null
  ) {
    return;
  }
  if (ACTIVE_PREVIEW_RENDER_TIMING.queueFrameCount <= 0) {
    drainPreviewQueue();
    return;
  }
  let remaining = ACTIVE_PREVIEW_RENDER_TIMING.queueFrameCount;
  const waitForQueueFrames = (): void => {
    previewRenderDrainFrame = requestAnimationFrame(() => {
      previewRenderDrainFrame = null;
      remaining -= 1;
      if (remaining > 0) {
        waitForQueueFrames();
      } else {
        drainPreviewQueue();
      }
    });
  };
  waitForQueueFrames();
}

function startPreviewTask(task: PreviewRenderTask): void {
  activePreviewRenderCount += 1;
  task.started = true;
  void (async () => {
    try {
      if (task.cancelled) throw new PreviewRenderCancelledError();
      const renderHandle = startPreviewRender(task.preset, task.options, task.onUpdate);
      task.cancelRender = renderHandle.cancel;
      const result = await renderHandle.promise;
      cachePreview(task.key, result);
      task.resolve(result);
    } catch (error) {
      task.reject(error instanceof Error ? error : new Error(String(error)));
    } finally {
      activePreviewRenderCount -= 1;
      task.cancelRender = undefined;
      if (pendingPreviewRenders.get(task.key) === task.promise) {
        pendingPreviewRenders.delete(task.key);
      }
      if (previewRenderQueue.length > 0) schedulePreviewQueue();
    }
  })();
}

function drainPreviewQueue(): void {
  while (activePreviewRenderCount < MAX_CONCURRENT_PREVIEW_RENDERS && previewRenderQueue.length > 0) {
    const task = previewRenderQueue.shift();
    if (!task) continue;
    if (task.cancelled) {
      task.reject(new PreviewRenderCancelledError());
      if (pendingPreviewRenders.get(task.key) === task.promise) pendingPreviewRenders.delete(task.key);
      continue;
    }
    startPreviewTask(task);
  }
}

function renderPreview(
  key: string,
  preset: PresetEditorState,
  options: PreviewRenderOptions,
  priority: PreviewRenderPriority,
  onUpdate?: (result: RenderPreviewResult) => void,
): PreviewRenderHandle {
  const pending = pendingPreviewRenders.get(key);
  if (pending) return { promise: pending, cancel: () => undefined };

  let resolveTask: (result: RenderPreviewResult) => void = () => undefined;
  let rejectTask: (reason: Error) => void = () => undefined;
  const promise = new Promise<RenderPreviewResult>((resolve, reject) => {
    resolveTask = resolve;
    rejectTask = (reason) => reject(reason);
  });
  const task: PreviewRenderTask = {
    key,
    preset,
    options,
    priority: PREVIEW_RENDER_PRIORITY[priority],
    sequence: previewRenderSequence++,
    promise,
    resolve: resolveTask,
    reject: rejectTask,
    onUpdate,
    started: false,
    cancelled: false,
  };
  previewRenderQueue.push(task);
  previewRenderQueue.sort((left, right) => left.priority - right.priority || left.sequence - right.sequence);
  pendingPreviewRenders.set(key, promise);
  schedulePreviewQueue();
  return {
    promise,
    cancel: () => {
      if (task.cancelled) return;
      task.cancelled = true;
      task.cancelRender?.();
      if (task.started) return;
      const queueIndex = previewRenderQueue.indexOf(task);
      if (queueIndex >= 0) previewRenderQueue.splice(queueIndex, 1);
      if (pendingPreviewRenders.get(task.key) === task.promise) pendingPreviewRenders.delete(task.key);
      task.reject(new PreviewRenderCancelledError());
    },
  };
}

/**
 * Renders a preset's design through the real engine (via the browser
 * engine adapter bridge) whenever the preset, target resolution, or word
 * timestamps change, debounced so rapid-fire edits (e.g. dragging a slider)
 * do not trigger a render per keystroke. The bridge module is dynamically
 * imported so the ~30MB engine+fonts payload is only ever pulled into the
 * page once a live preview is requested.
 *
 * `timestamps` is supplied by the caller (a real per-language transcript
 * when one's bundled for the selected background, otherwise the synthetic
 * sample script - see `LivePreviewPanel`) rather than built in here, so
 * switching the preview's sample script does not require changing this hook.
 */
export function usePreviewRenderer(
  preset: PresetEditorState,
  width: number | null,
  height: number | null,
  timestamps: SampleTimestamps,
  language?: string,
  quality: PreviewQuality = 'hd',
  priority: PreviewRenderPriority = 'main',
  previewWordState?: WordState,
  renderEnabled = true,
  layoutMode: CaptionFlowLayoutMode = 'stable',
  previewWordStateLayout?: PreviewWordStateLayout,
  allowContentOverflow = false,
  fitPageToChildren = false,
): UsePreviewRendererResult {
  const [status, setStatus] = useState<PreviewStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RenderPreviewResult | null>(null);
  const requestIdRef = useRef(0);

  useLayoutEffect(() => {
    if (renderEnabled) return;
    requestIdRef.current += 1;
    setResult(null);
    setError(null);
    setStatus('loading');
  }, [renderEnabled]);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    if (!renderEnabled) {
      setError(null);
      setStatus('loading');
      return;
    }
    if (width == null || height == null) {
      setError(null);
      setStatus('loading');
      return;
    }
    setError(null);
    setStatus('loading');

    const key = previewCacheKey(
      preset,
      width,
      height,
      timestamps,
      language,
      quality,
      previewWordState,
      layoutMode,
      previewWordStateLayout,
      allowContentOverflow,
      fitPageToChildren,
    );
    const cached = getCachedPreview(key);
    if (cached) {
      setResult(cached);
      setError(null);
      setStatus('ready');
      return;
    }

    let renderHandle: PreviewRenderHandle | null = null;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setStatus('loading');
      setError(null);
      await waitForAnimationFrames(ACTIVE_PREVIEW_RENDER_TIMING.startupFrameCount);
      if (cancelled || requestIdRef.current !== requestId) return;
      try {
        renderHandle = renderPreview(
          key,
          preset,
          {
            videoResolution: { width, height },
            words: timestamps.words,
            wordStartTimesSeconds: timestamps.wordStartTimesSeconds,
            wordEndTimesSeconds: timestamps.wordEndTimesSeconds,
            breakBefore: timestamps.breakBefore,
            fps: PREVIEW_FPS,
            language,
            ...(previewWordState === undefined ? {} : { previewWordState }),
            ...(previewWordStateLayout === undefined ? {} : { previewWordStateLayout }),
            ...(fitPageToChildren ? { fitPageToChildren: true } : {}),
            ...(allowContentOverflow ? { allowContentOverflow: true } : {}),
            captionLayout: timestamps.captionLayout,
            layoutMode,
          },
          priority,
          (partial) => {
            if (cancelled || requestIdRef.current !== requestId) return;
            setResult(partial);
            setStatus('loading');
          },
        );
        const rendered = await renderHandle.promise;
        if (cancelled || requestIdRef.current !== requestId) return; // superseded by a newer request
        setResult(rendered);
        setStatus('ready');
      } catch (err) {
        if (cancelled || requestIdRef.current !== requestId) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      }
    }, ACTIVE_PREVIEW_RENDER_TIMING.debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      renderHandle?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `preset` is a new object reference on every edit. It must retrigger the render. `timestamps` changes only when the effective transcript changes.
  }, [
    preset,
    width,
    height,
    timestamps,
    language,
    quality,
    priority,
    previewWordState,
    renderEnabled,
    layoutMode,
    previewWordStateLayout,
    allowContentOverflow,
    fitPageToChildren,
  ]);

  return { status, error, result };
}
