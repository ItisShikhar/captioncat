// Dev-only entry point loaded only by `verify.html`. It exposes the
// engine browser API on `window` so a headless-browser test runner can
// drive it directly without a UI. See `verify.html` for details about why
// this never ships in the production single-file build.
import type {
  RenderPreviewOptions,
  RenderPreviewResult,
} from '@captioncat/caption-engine/browser';

declare global {
  interface Window {
    __renderPresetPreview: (
      rawPresetJson: unknown,
      options: RenderPreviewOptions,
    ) => Promise<RenderPreviewResult>;
    __browserEngineReady: boolean;
    __browserEngineError?: string;
  }
}

window.__browserEngineReady = false;

void import('@captioncat/caption-engine/browser')
  .then(({ parseEcsCaptionPreset, renderPresetPreview }) => {
    window.__renderPresetPreview = (rawPresetJson, options) =>
      renderPresetPreview(parseEcsCaptionPreset(rawPresetJson), options);
    window.__browserEngineReady = true;
  })
  .catch((error: unknown) => {
    window.__browserEngineError = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  });
