import {
  type EcsCaptionPreset,
  renderPresetPreviewStream,
  type RenderPreviewOptions,
  type RenderPreviewResult,
  type RenderPreviewStreamFrame,
  type RenderPreviewStreamRepeat,
  type RenderPreviewBlendModeLayer,
} from '@captioncat/caption-engine/browser';

type PreviewWorkerRequest =
  | {
      type: 'render';
      requestId: number;
      preset: EcsCaptionPreset;
      options: RenderPreviewOptions;
    }
  | {
      type: 'cancel';
      requestId: number;
    };

type PreviewWorkerResponse =
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

interface PreviewWorkerScope {
  onmessage: ((event: MessageEvent<PreviewWorkerRequest>) => void) | null;
  postMessage(message: PreviewWorkerResponse, transfer?: Transferable[]): void;
}

const scope = globalThis as unknown as PreviewWorkerScope;
const cancelledRequests = new Set<number>();
let activeRequestId: number | null = null;
let queuedRenderRequest:
  | Extract<PreviewWorkerRequest, { type: 'render' }>
  | undefined;

async function renderRequest(
  requestId: number,
  preset: EcsCaptionPreset,
  options: RenderPreviewOptions,
): Promise<void> {
  try {
    const result = await renderPresetPreviewStream(preset, options, {
      isCancelled: () => cancelledRequests.has(requestId),
      onStart: ({ frameSize, placement, videoResolution, stablePageCrop, debugLayout }) => {
        if (cancelledRequests.has(requestId)) return;
        scope.postMessage({
          type: 'start',
          requestId,
          frameSize,
          placement,
          videoResolution,
          ...(stablePageCrop ? { stablePageCrop } : {}),
          ...(debugLayout ? { debugLayout } : {}),
        });
      },
      onFrame: (frame: RenderPreviewStreamFrame) => {
        if (cancelledRequests.has(requestId)) return;
        if (frame.kind !== 'bitmap') {
          throw new Error('The preview worker received a non-transferable frame.');
        }
        const message: Extract<PreviewWorkerResponse, { type: 'frame' }> = {
          type: 'frame',
          requestId,
          frameIndex: frame.frameIndex,
          width: frame.width,
          height: frame.height,
          bitmap: frame.bitmap,
          ...(frame.debugFrame ? { debugFrame: frame.debugFrame } : {}),
          ...(frame.hasAlpha === undefined ? {} : { hasAlpha: frame.hasAlpha }),
          ...(frame.opaquePixelCount === undefined ? {} : { opaquePixelCount: frame.opaquePixelCount }),
          ...(frame.alphaBounds ? { alphaBounds: frame.alphaBounds } : {}),
          blendModeLayers: frame.blendModeLayers,
        };
        scope.postMessage(message, [
          frame.bitmap,
          ...frame.blendModeLayers.map((layer) => layer.buffer.buffer),
        ]);
      },
      onFrameRepeat: (frame: RenderPreviewStreamRepeat) => {
        if (cancelledRequests.has(requestId)) return;
        scope.postMessage({
          type: 'repeat',
          requestId,
          frameIndex: frame.frameIndex,
          sourceFrameIndex: frame.sourceFrameIndex,
          width: frame.width,
          height: frame.height,
        });
      },
      preferBitmap: true,
    });
    if (cancelledRequests.has(requestId)) return;
    scope.postMessage({ type: 'complete', requestId, result });
  } catch (error) {
    if (cancelledRequests.has(requestId)) return;
    scope.postMessage({
      type: 'error',
      requestId,
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    cancelledRequests.delete(requestId);
  }
}

function startRenderRequest(request: Extract<PreviewWorkerRequest, { type: 'render' }>): void {
  cancelledRequests.delete(request.requestId);
  activeRequestId = request.requestId;
  void renderRequest(request.requestId, request.preset, request.options).finally(() => {
    if (activeRequestId !== request.requestId) return;
    activeRequestId = null;
    const next = queuedRenderRequest;
    queuedRenderRequest = undefined;
    if (next) startRenderRequest(next);
  });
}

scope.onmessage = (event) => {
  const message = event.data;
  if (message.type === 'cancel') {
    if (queuedRenderRequest?.requestId === message.requestId) queuedRenderRequest = undefined;
    if (activeRequestId === message.requestId) cancelledRequests.add(message.requestId);
    return;
  }
  cancelledRequests.delete(message.requestId);
  if (activeRequestId !== null) {
    cancelledRequests.add(activeRequestId);
    queuedRenderRequest = message;
    return;
  }
  startRenderRequest(message);
};
