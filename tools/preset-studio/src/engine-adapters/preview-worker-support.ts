export function supportsPreviewWorkerRendering(): boolean {
  return (
    typeof Worker === 'function' &&
    typeof OffscreenCanvas === 'function' &&
    typeof OffscreenCanvas.prototype.transferToImageBitmap === 'function'
  );
}
