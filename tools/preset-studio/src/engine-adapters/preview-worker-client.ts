import PreviewWorker from './preview-worker?worker&inline';
import type { PresetEditorState } from '../schema/preset';
import { toEcsCaptionPreset } from '../schema/preset';
import type { EcsComponentDoc, EcsEntityDoc } from '../schema/ecs-tree';
import { isLeaf } from '../schema/property-tree';
import type {
  EcsCaptionPreset,
  RenderPreviewFrame,
  RenderPreviewOptions,
  RenderPreviewResult,
  RenderPreviewStreamRepeat,
  RenderPreviewStreamFrame,
  RenderPreviewBlendModeLayer,
} from '@captioncat/caption-engine/browser';
import type { RenderPreviewStart } from '@captioncat/caption-engine/browser';
import { supportsPreviewWorkerRendering } from './preview-worker-support';
import { cursorAssetSourcesForWorker } from './cursor-assets.browser';
import { imageAssetSourcesForWorker } from './image-assets.browser';

export class PreviewRenderCancelledError extends Error {
  constructor() {
    super('Preview render cancelled.');
    this.name = 'PreviewRenderCancelledError';
  }
}

export interface PreviewWorkerRenderHandlers {
  onStart?: (metadata: RenderPreviewStart) => void;
  onFrame?: (frame: RenderPreviewStreamFrame) => void;
  onFrameRepeat?: (frame: RenderPreviewStreamRepeat) => void;
}

export interface PreviewWorkerRenderHandle {
  promise: Promise<RenderPreviewResult>;
  cancel: () => void;
}

export type PreviewWorkerQueuePriority = 'preview' | 'thumbnail';

function imageAssetIdsInComponent(component: EcsComponentDoc, assetIds: Set<string>): void {
  const asset = component.props.asset;
  if (component.component === 'image' && isLeaf(asset) && typeof asset.value === 'string') {
    assetIds.add(asset.value);
  }
  const frames = component.props.frames;
  if (component.component === 'imageSequencer' && isLeaf(frames) && Array.isArray(frames.value)) {
    for (const frame of frames.value) {
      if (typeof frame === 'string') assetIds.add(frame);
    }
  }
  for (const child of component.components) imageAssetIdsInComponent(child, assetIds);
}

function imageAssetIdsInEntity(entity: EcsEntityDoc, assetIds: Set<string>): void {
  for (const component of entity.components) imageAssetIdsInComponent(component, assetIds);
  for (const child of entity.children) imageAssetIdsInEntity(child, assetIds);
}

export async function preparePreviewWorkerOptions(
  options: RenderPreviewOptions,
  preset: PresetEditorState,
): Promise<RenderPreviewOptions> {
  const imageAssetIds = new Set<string>();
  imageAssetIdsInEntity(preset.design, imageAssetIds);
  const svgRasterDimension = Math.min(
    8192,
    Math.max(2048, Math.ceil(Math.max(options.videoResolution.width, options.videoResolution.height))),
  );
  const [cursorAssetSources, imageAssetSources] = await Promise.all([
    cursorAssetSourcesForWorker(),
    imageAssetSourcesForWorker([...imageAssetIds], svgRasterDimension),
  ]);
  return { ...options, cursorAssetSources, imageAssetSources };
}

type WorkerMessage =
  | {
      type: 'start';
      requestId: number;
      frameSize: RenderPreviewResult['frameSize'];
      placement: RenderPreviewResult['placement'];
      videoResolution: RenderPreviewResult['videoResolution'];
      stablePageCrop?: RenderPreviewResult['stablePageCrop'];
      debugLayout?: Omit<NonNullable<RenderPreviewResult['debugLayout']>, 'frames'>;
    }
  | {
      type: 'frame';
      requestId: number;
      frameIndex: number;
      width: number;
      height: number;
      bitmap: ImageBitmap;
      debugFrame?: NonNullable<RenderPreviewResult['debugLayout']>['frames'][number];
      hasAlpha?: boolean;
      opaquePixelCount?: number;
      alphaBounds?: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
      blendModeLayers: RenderPreviewBlendModeLayer[];
    }
  | {
      type: 'repeat';
      requestId: number;
      frameIndex: number;
      sourceFrameIndex: number;
      width: number;
      height: number;
    }
  | {
      type: 'complete';
      requestId: number;
      result: RenderPreviewResult;
    }
  | {
      type: 'error';
      requestId: number;
      message: string;
    };

interface WorkerJob {
  requestId: number;
  preset: EcsCaptionPreset;
  options: RenderPreviewOptions;
  handlers: PreviewWorkerRenderHandlers;
  queuePriority: PreviewWorkerQueuePriority;
  resolve: (result: RenderPreviewResult) => void;
  reject: (error: Error) => void;
  settled: boolean;
}

interface WorkerSlot {
  worker: Worker;
  job: WorkerJob | null;
}

const MAX_PREVIEW_WORKERS = 4;
const MAX_PRESET_THUMBNAIL_WORKERS = 4;
let workerDisabled = false;
let nextRequestId = 1;
// Idle slots stay alive so their engine and font registries remain warm.
const workerSlots: WorkerSlot[] = [];
const queuedJobs: WorkerJob[] = [];

function supportsPreviewWorker(): boolean {
  return !workerDisabled && supportsPreviewWorkerRendering();
}

function removeWorkerSlot(slot: WorkerSlot): void {
  const index = workerSlots.indexOf(slot);
  if (index >= 0) workerSlots.splice(index, 1);
  slot.worker.terminate();
}

function rejectJob(job: WorkerJob, error: Error): void {
  if (job.settled) return;
  job.settled = true;
  job.reject(error);
}

function resolveJob(job: WorkerJob, result: RenderPreviewResult): void {
  if (job.settled) return;
  job.settled = true;
  job.resolve(result);
}

function handleWorkerFailure(slot: WorkerSlot, error: Error): void {
  const job = slot.job;
  slot.job = null;
  removeWorkerSlot(slot);
  if (job) rejectJob(job, error);
  pumpWorkerQueue();
}

function handleWorkerMessage(slot: WorkerSlot, message: WorkerMessage): void {
  const job = slot.job;
  if (!job || message.requestId !== job.requestId) {
    if (message.type === 'frame') message.bitmap.close();
    return;
  }

  if (message.type === 'start') {
    job.handlers.onStart?.({
      frameSize: message.frameSize,
      placement: message.placement,
      videoResolution: message.videoResolution,
      ...(message.stablePageCrop ? { stablePageCrop: message.stablePageCrop } : {}),
      ...(message.debugLayout ? { debugLayout: message.debugLayout } : {}),
    });
    return;
  }
  if (message.type === 'frame') {
    const frame: RenderPreviewFrame = {
      kind: 'bitmap',
      bitmap: message.bitmap,
      width: message.width,
      height: message.height,
      ...(message.debugFrame ? { debugFrame: message.debugFrame } : {}),
      ...(message.hasAlpha === undefined ? {} : { hasAlpha: message.hasAlpha }),
      ...(message.opaquePixelCount === undefined ? {} : { opaquePixelCount: message.opaquePixelCount }),
      ...(message.alphaBounds ? { alphaBounds: message.alphaBounds } : {}),
      blendModeLayers: message.blendModeLayers,
    };
    job.handlers.onFrame?.({ ...frame, frameIndex: message.frameIndex });
    return;
  }
  if (message.type === 'repeat') {
    job.handlers.onFrameRepeat?.({
      frameIndex: message.frameIndex,
      sourceFrameIndex: message.sourceFrameIndex,
      width: message.width,
      height: message.height,
    });
    return;
  }

  slot.job = null;
  if (message.type === 'complete') {
    resolveJob(job, message.result);
  } else {
    rejectJob(job, new Error(message.message));
    removeWorkerSlot(slot);
  }
  pumpWorkerQueue();
}

function cancelActiveWorkerJob(slot: WorkerSlot, job: WorkerJob): void {
  // Termination also interrupts a render that is waiting for a remote font.
  slot.job = null;
  removeWorkerSlot(slot);
  rejectJob(job, new PreviewRenderCancelledError());
  pumpWorkerQueue();
}

function createWorkerSlot(): WorkerSlot | null {
  if (!supportsPreviewWorker()) return null;
  try {
    const slot: WorkerSlot = { worker: new PreviewWorker(), job: null };
    slot.worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      handleWorkerMessage(slot, event.data);
    };
    slot.worker.onerror = () => {
      handleWorkerFailure(slot, new Error('The preview worker stopped unexpectedly.'));
    };
    slot.worker.onmessageerror = () => {
      handleWorkerFailure(slot, new Error('The preview worker returned an unreadable message.'));
    };
    workerSlots.push(slot);
    return slot;
  } catch (error) {
    workerDisabled = true;
    const message = error instanceof Error ? error.message : String(error);
    for (const job of queuedJobs.splice(0)) rejectJob(job, new Error(`Unable to create the preview worker: ${message}`));
    return null;
  }
}

function pumpWorkerQueue(): void {
  while (queuedJobs.length > 0) {
    let slot = workerSlots.find((candidate) => candidate.job === null);
    if (!slot) {
      if (workerSlots.length >= MAX_PREVIEW_WORKERS) return;
      slot = createWorkerSlot() ?? undefined;
      if (!slot) return;
    }

    const activeBackgroundJobs = workerSlots.reduce(
      (count, candidate) => count + (candidate.job?.queuePriority === 'thumbnail' ? 1 : 0),
      0,
    );
    const nextPreviewIndex = queuedJobs.findIndex((candidate) => candidate.queuePriority === 'preview');
    if (activeBackgroundJobs >= MAX_PRESET_THUMBNAIL_WORKERS && nextPreviewIndex < 0) return;
    const jobIndex =
      activeBackgroundJobs >= MAX_PRESET_THUMBNAIL_WORKERS ? nextPreviewIndex : 0;
    const job = queuedJobs.splice(jobIndex, 1)[0];
    if (!job) return;
    if (job.settled) continue;
    slot.job = job;
    try {
      slot.worker.postMessage({ type: 'render', requestId: job.requestId, preset: job.preset, options: job.options });
    } catch (error) {
      slot.job = null;
      removeWorkerSlot(slot);
      const message = error instanceof Error ? error.message : String(error);
      rejectJob(job, new Error(`Unable to start the preview worker: ${message}`));
    }
  }
}

export function renderPreviewInWorker(
  preset: PresetEditorState,
  options: RenderPreviewOptions,
  handlers: PreviewWorkerRenderHandlers,
  queueOptions: { priority?: PreviewWorkerQueuePriority } = {},
): PreviewWorkerRenderHandle | null {
  if (!supportsPreviewWorker()) return null;

  const requestId = nextRequestId++;
  let resolvePromise: (result: RenderPreviewResult) => void = () => undefined;
  let rejectPromise: (error: Error) => void = () => undefined;
  const promise = new Promise<RenderPreviewResult>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  const job: WorkerJob = {
    requestId,
    preset: toEcsCaptionPreset(preset),
    options,
    handlers,
    queuePriority: queueOptions.priority ?? 'preview',
    resolve: resolvePromise,
    reject: rejectPromise,
    settled: false,
  };
  queuedJobs.push(job);
  pumpWorkerQueue();

  return {
    promise,
    cancel: () => {
      if (job.settled) return;
      const queuedIndex = queuedJobs.indexOf(job);
      if (queuedIndex >= 0) {
        queuedJobs.splice(queuedIndex, 1);
        rejectJob(job, new PreviewRenderCancelledError());
        return;
      }
      const slot = workerSlots.find((candidate) => candidate.job === job);
      if (!slot) {
        rejectJob(job, new PreviewRenderCancelledError());
        return;
      }
      cancelActiveWorkerJob(slot, job);
    },
  };
}
