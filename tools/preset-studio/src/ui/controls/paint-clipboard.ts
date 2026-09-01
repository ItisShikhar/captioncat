import type { Paint, PaintCapability } from '@/schema/paint';

const PAINT_CLIPBOARD_KIND = 'captioncat-paint';
const PAINT_CLIPBOARD_VERSION = 1;
let rememberedPaint: Paint | null = null;
const rememberedPaintListeners = new Set<() => void>();

interface PaintClipboardPayload {
  kind: typeof PAINT_CLIPBOARD_KIND;
  version: typeof PAINT_CLIPBOARD_VERSION;
  paint: Paint;
}

function getClipboard(): Clipboard {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    throw new Error('Clipboard access is not available in this browser.');
  }
  return navigator.clipboard;
}

export async function copyPaintToClipboard(paint: Paint): Promise<void> {
  const payload: PaintClipboardPayload = {
    kind: PAINT_CLIPBOARD_KIND,
    version: PAINT_CLIPBOARD_VERSION,
    paint,
  };
  await getClipboard().writeText(JSON.stringify(payload));
}

export function rememberCopiedPaint(paint: Paint): void {
  rememberedPaint = paint;
  for (const listener of rememberedPaintListeners) listener();
}

export function clearRememberedPaint(): void {
  if (rememberedPaint === null) return;
  rememberedPaint = null;
  for (const listener of rememberedPaintListeners) listener();
}

export function getRememberedPaint(): Paint | null {
  return rememberedPaint;
}

export function subscribeToRememberedPaint(listener: () => void): () => void {
  rememberedPaintListeners.add(listener);
  return () => rememberedPaintListeners.delete(listener);
}

export function getPasteableRememberedPaint(capabilities: readonly PaintCapability[]): Paint | null {
  const paint = rememberedPaint;
  return paint && capabilities.includes(paint.type) ? paint : null;
}

export function pasteRememberedPaint(capabilities: readonly PaintCapability[]): Paint {
  const paint = getPasteableRememberedPaint(capabilities);
  if (!paint) throw new Error('Clipboard does not contain a supported color or gradient.');
  return paint;
}
