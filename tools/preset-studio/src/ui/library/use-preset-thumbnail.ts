import { cloneEcsEntity, type EcsEntityDoc } from '@/schema/ecs-tree';
import type { PresetEditorState } from '@/schema/preset';
import { presetsPreviewThumb } from '@/ui/constants';
import { findWordCrop } from '@/ui/preview/caption-crop';
import type {
  RenderPreviewFrame,
  RenderPreviewOptions,
  RenderPreviewResult,
  RenderPreviewStreamFrame,
  RenderPreviewStreamRepeat,
} from '@captioncat/caption-engine/browser';
import { supportsPreviewWorkerRendering } from '@/engine-adapters/preview-worker-support';
import { toEcsCaptionPreset } from '@/schema/preset';
import { useEffect, useRef, useState } from 'react';

/**
 * Small one-frame preview rendered through the real engine for the preset
 * library sidebar. It uses a generic aspect ratio instead of the preset preview
 * aspect ratio because the studio does not expose that value.
 *
 * The engine is asked to render at a normal video resolution so text wraps
 * and scales as it does in real use. The result is cropped
 * tightly to the non-transparent bounding box of the rendered caption before
 * before it is scaled into a small landscape swatch. This keeps the caption visible.
 */
/** Finished data URLs, keyed by `design` object reference so edits (which always produce a new object) auto-invalidate. */
const cache = new WeakMap<EcsEntityDoc, string>();
/** In-flight/queued promises, so concurrently-mounted rows for the same design share one render instead of racing duplicates. */
interface ThumbnailRequest {
  promise: Promise<string>;
  subscribers: number;
  settled: boolean;
  cancelled: boolean;
  cancelRender?: () => void;
  release: () => void;
}
const inflight = new WeakMap<EcsEntityDoc, ThumbnailRequest>();

const THUMBNAIL_STRUCTURAL_COMPONENTS = new Set(['transform', 'layout']);

function findPage(entity: EcsEntityDoc): EcsEntityDoc | undefined {
  if (entity.entity === 'page') return entity;
  for (const child of entity.children) {
    const page = findPage(child);
    if (page) return page;
  }
  return undefined;
}

function createStructuralThumbnailEntity(source: EcsEntityDoc, children: EcsEntityDoc[] = []): EcsEntityDoc {
  const entity = cloneEcsEntity(source);
  entity.components = entity.components.filter((component) =>
    THUMBNAIL_STRUCTURAL_COMPONENTS.has(component.component),
  );
  entity.effects = [];
  entity.children = children;
  return entity;
}

/**
 * Keep the viewport shell required by the ECS pipeline, but remove every
 * visual entity outside the first page and its descendants.
 */
function createPageThumbnailDesign(design: EcsEntityDoc): EcsEntityDoc {
  const page = findPage(design);
  if (!page) throw new Error(`Preset "${design.id}" does not contain a page entity.`);

  const videoArea = design.children.find((child) => child.entity === 'videoArea');
  const compositionArea = design.children.find((child) => child.entity === 'compositionArea');
  const video = videoArea?.children.find((child) => child.entity === 'video');
  if (!videoArea || !compositionArea || !video) {
    throw new Error(`Preset "${design.id}" does not contain the required ECS viewport structure.`);
  }

  return createStructuralThumbnailEntity(design, [
    createStructuralThumbnailEntity(videoArea, [createStructuralThumbnailEntity(video)]),
    createStructuralThumbnailEntity(compositionArea, [cloneEcsEntity(page)]),
  ]);
}

/** Worker thumbnails can render in parallel without blocking the main thread. */
const queue: Array<() => Promise<void>> = [];
const MAX_CONCURRENT_THUMBNAILS = supportsPreviewWorkerRendering() ? 4 : 1;
let activeThumbnailCount = 0;

/**
 * The first render starts immediately, while changed designs stay debounced so
 * active inspector edits do not fill the thumbnail queue with stale work.
 */
function runQueue(): void {
  while (activeThumbnailCount < MAX_CONCURRENT_THUMBNAILS && queue.length > 0) {
    const task = queue.shift();
    if (!task) return;
    activeThumbnailCount += 1;
    void task().finally(() => {
      activeThumbnailCount -= 1;
      if (MAX_CONCURRENT_THUMBNAILS === 1) {
        setTimeout(runQueue, 0);
      } else {
        runQueue();
      }
    });
  }
}

function thumbnailRenderOptions(): RenderPreviewOptions {
  const sampleWords = [...presetsPreviewThumb.sampleWords];
  const sampleWordDuration = presetsPreviewThumb.sampleWordDurationSeconds;
  const sampleWordStarts = sampleWords.map((_, index) => index * sampleWordDuration);
  const sampleWordEnds = sampleWordStarts.map((start) => start + sampleWordDuration);
  return {
    videoResolution: {
      width: presetsPreviewThumb.render.width * presetsPreviewThumb.render.scale,
      height: presetsPreviewThumb.render.height * presetsPreviewThumb.render.scale,
    },
    words: sampleWords,
    wordStartTimesSeconds: sampleWordStarts,
    wordEndTimesSeconds: sampleWordEnds,
    fps: presetsPreviewThumb.sampleFps,
  };
}

function sampleFrameIndex(result: RenderPreviewResult, fallback: number): number {
  // Sample the last frame of the third synthetic word. This lets the first
  // three word/background enter animations finish before the style is captured.
  const sampleCaption = result.captionInfos[presetsPreviewThumb.sampleWords.length - 1];
  return sampleCaption
    ? sampleCaption.startFrame + sampleCaption.numFrames - 1
    : fallback;
}

function createThumbnailCanvas(): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = presetsPreviewThumb.width;
  canvas.height = presetsPreviewThumb.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas context unavailable');
  return { canvas, context };
}

function drawThumbnail(
  result: RenderPreviewResult,
  frameIndex: number,
  frame: RenderPreviewFrame,
): string {
  const { canvas, context } = createThumbnailCanvas();
  context.fillStyle = presetsPreviewThumb.canvasBackgroundColor;
  context.fillRect(0, 0, presetsPreviewThumb.width, presetsPreviewThumb.height);

  const bbox = findWordCrop(result, frameIndex, frame) ?? frame.alphaBounds ?? null;
  const source = bbox ?? { x: 0, y: 0, width: frame.width, height: frame.height };
  // Scale the cropped caption to fill the swatch (contain, centered), with a
  // small margin so it reads big and clear without touching the swatch edges.
  const scale =
    Math.min(presetsPreviewThumb.width / source.width, presetsPreviewThumb.height / source.height) *
    presetsPreviewThumb.contentScale;
  const drawW = source.width * scale;
  const drawH = source.height * scale;
  const dx = (presetsPreviewThumb.width - drawW) / 2;
  const dy = (presetsPreviewThumb.height - drawH) / 2;
  if (frame.kind === 'bitmap') {
    context.drawImage(frame.bitmap, source.x, source.y, source.width, source.height, dx, dy, drawW, drawH);
  } else {
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = frame.width;
    frameCanvas.height = frame.height;
    const frameContext = frameCanvas.getContext('2d');
    if (!frameContext) throw new Error('2D canvas context unavailable');
    frameContext.putImageData(
      new ImageData(new Uint8ClampedArray(frame.buffer), frame.width, frame.height),
      0,
      0,
    );
    context.drawImage(frameCanvas, source.x, source.y, source.width, source.height, dx, dy, drawW, drawH);
  }

  return canvas.toDataURL('image/png');
}

function resolveFrameSourceIndex(frameIndex: number, sources: Map<number, number>): number | null {
  const visited = new Set<number>();
  let current = frameIndex;
  while (!visited.has(current)) {
    visited.add(current);
    const source = sources.get(current);
    if (source === undefined) return null;
    if (source === current) return current;
    current = source;
  }
  return null;
}

async function renderThumbnailInWorker(
  preset: PresetEditorState,
  options: RenderPreviewOptions,
  onCancelReady: (cancel: () => void) => void,
): Promise<string> {
  const { preparePreviewWorkerOptions, renderPreviewInWorker } = await import('@/engine-adapters/preview-worker-client');
  const workerOptions = await preparePreviewWorkerOptions(options, preset);
  const frames = new Map<number, RenderPreviewFrame>();
  const sources = new Map<number, number>();
  const handle = renderPreviewInWorker(
    preset,
    workerOptions,
    {
      onFrame: (frame) => {
        frames.set(frame.frameIndex, frame);
        sources.set(frame.frameIndex, frame.frameIndex);
      },
      onFrameRepeat: (frame) => {
        sources.set(frame.frameIndex, frame.sourceFrameIndex);
      },
    },
    { priority: 'thumbnail' },
  );
  if (!handle) throw new Error('Preview workers are unavailable in this browser.');
  onCancelReady(handle.cancel);

  try {
    const result = await handle.promise;
    const frameIndex = sampleFrameIndex(result, Math.max(...sources.keys(), 0));
    const sourceIndex = resolveFrameSourceIndex(frameIndex, sources);
    const frame = sourceIndex === null ? undefined : frames.get(sourceIndex);
    if (!frame) throw new Error('No thumbnail frame rendered');
    return drawThumbnail(result, frameIndex, frame);
  } finally {
    for (const frame of frames.values()) {
      if (frame.kind === 'bitmap') frame.bitmap.close();
    }
  }
}

async function renderThumbnailOnMainThread(
  preset: PresetEditorState,
  options: RenderPreviewOptions,
  onCancelReady: (cancel: () => void) => void,
): Promise<string> {
  const { renderPresetPreviewStream } = await import('@captioncat/caption-engine/browser');
  const frames = new Map<number, RenderPreviewFrame>();
  const sources = new Map<number, number>();
  let cancelled = false;
  onCancelReady(() => {
    cancelled = true;
  });

  const result = await renderPresetPreviewStream(toEcsCaptionPreset(preset), options, {
    isCancelled: () => cancelled,
    onFrame: (frame: RenderPreviewStreamFrame) => {
      frames.set(frame.frameIndex, frame);
      sources.set(frame.frameIndex, frame.frameIndex);
    },
    onFrameRepeat: (frame: RenderPreviewStreamRepeat) => {
      sources.set(frame.frameIndex, frame.sourceFrameIndex);
    },
  });
  if (cancelled) throw new Error('Thumbnail render cancelled.');

  const frameIndex = sampleFrameIndex(result, Math.max(...sources.keys(), 0));
  const sourceIndex = resolveFrameSourceIndex(frameIndex, sources);
  const frame = sourceIndex === null ? undefined : frames.get(sourceIndex);
  if (!frame) throw new Error('No thumbnail frame rendered');
  return drawThumbnail(result, frameIndex, frame);
}

interface ThumbnailRenderHandle {
  promise: Promise<string>;
  cancel: () => void;
}

function renderThumbnail(preset: PresetEditorState): ThumbnailRenderHandle {
  const options = thumbnailRenderOptions();
  const pageOnlyPreset: PresetEditorState = {
    ...preset,
    design: createPageThumbnailDesign(preset.design),
  };
  let cancelled = false;
  let cancelActiveRender = (): void => undefined;
  const promise = (async (): Promise<string> => {
    if (supportsPreviewWorkerRendering()) {
      return renderThumbnailInWorker(pageOnlyPreset, options, (cancel) => {
        cancelActiveRender = cancel;
        if (cancelled) cancel();
      });
    }
    return renderThumbnailOnMainThread(pageOnlyPreset, options, (cancel) => {
      cancelActiveRender = cancel;
      if (cancelled) cancel();
    });
  })();
  return {
    promise,
    cancel: () => {
      cancelled = true;
      cancelActiveRender();
    },
  };
}

function getOrCreateThumbnail(preset: PresetEditorState): ThumbnailRequest {
  const design = preset.design;
  const cached = cache.get(design);
  if (cached) {
    return {
      promise: Promise.resolve(cached),
      subscribers: 0,
      settled: true,
      cancelled: false,
      release: () => undefined,
    };
  }

  const existing = inflight.get(design);
  if (existing) {
    if (existing.cancelled) {
      inflight.delete(design);
    } else {
      existing.subscribers += 1;
      return existing;
    }
  }

  let resolveRequest: (url: string) => void = () => undefined;
  let rejectRequest: (error: Error) => void = () => undefined;
  const request: ThumbnailRequest = {
    promise: new Promise<string>((resolve, reject) => {
      resolveRequest = resolve;
      rejectRequest = reject;
    }),
    subscribers: 1,
    settled: false,
    cancelled: false,
    release: () => {
      if (request.subscribers <= 0) return;
      request.subscribers -= 1;
      if (request.subscribers === 0 && !request.settled) {
        request.cancelled = true;
        request.cancelRender?.();
      }
    },
  };
  inflight.set(design, request);
  queue.push(async () => {
    try {
      if (request.cancelled) throw new Error('Thumbnail render cancelled.');
      const renderHandle = renderThumbnail(preset);
      request.cancelRender = renderHandle.cancel;
      const url = await renderHandle.promise;
      if (request.cancelled) throw new Error('Thumbnail render cancelled.');
      cache.set(design, url);
      resolveRequest(url);
    } catch (error) {
      rejectRequest(error instanceof Error ? error : new Error(String(error)));
    } finally {
      request.settled = true;
      request.cancelRender = undefined;
      if (inflight.get(design) === request) inflight.delete(design);
    }
  });
  runQueue();
  return request;
}

/**
 * Renders (and caches) a tiny single-frame thumbnail of a preset's `design`
 * through the real engine, for use as a small visual hint in the preset
 * library sidebar. The caller controls whether rendering is allowed, so a
 * closed sidebar does not start or refresh thumbnail work.
 */
export interface UsePresetThumbnailResult {
  dataUrl: string | null;
  isLoading: boolean;
}

export function usePresetThumbnail(preset: PresetEditorState, enabled = true): UsePresetThumbnailResult {
  const design = preset.design;
  const [dataUrl, setDataUrl] = useState<string | null>(() => cache.get(design) ?? null);
  const [isLoading, setIsLoading] = useState(() => enabled && !cache.has(design));
  const firstEffectRef = useRef(true);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    const isInitialRender = firstEffectRef.current;
    firstEffectRef.current = false;
    const cached = cache.get(design);
    if (cached) {
      setDataUrl(cached);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    // Deliberately do NOT clear `dataUrl` here - the previous thumbnail
    // (from the design's last object reference) stays drawn until this one
    // resolves, instead of flashing blank on every edit.
    let cancelled = false;
    let request: ThumbnailRequest | null = null;
    const startRender = (): void => {
      request = getOrCreateThumbnail(preset);
      request.promise
        .then((url) => {
          if (!cancelled) {
            setDataUrl(url);
            setIsLoading(false);
          }
        })
        .catch(() => {
          // Keep showing the last-good thumbnail rather than blanking it on error.
          if (!cancelled) setIsLoading(false);
        });
    };
    const delay = isInitialRender ? presetsPreviewThumb.initialRenderDelay : presetsPreviewThumb.debounce;
    const timer = delay > 0 ? setTimeout(startRender, delay) : undefined;
    if (timer === undefined) startRender();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
      request?.release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the `design` reference. `preset` only starts the render.
  }, [design, enabled, preset]);

  return { dataUrl, isLoading };
}
