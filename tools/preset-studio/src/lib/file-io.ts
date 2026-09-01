/**
 * Real disk I/O for preset JSON files, entirely client-side:
 * - File System Access API (Chromium) lets us open/save/overwrite a preset
 * in place, remembering the file handle across saves.
 * - Everywhere else (Firefox/Safari, or a plain drag-and-drop) we fall back
 * to reading dragged/picked `File` objects and triggering `<a download>`
 * for saves - no server, no upload, works straight off the filesystem.
 */

// Minimal ambient types for the File System Access API (not yet in lib.dom.d.ts
// across all TS/browser target configs we build against).
interface FsFileHandleLike {
  readonly kind: 'file';
  getFile(): Promise<File>;
  queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
  requestPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
  createWritable(options?: { keepExistingData?: boolean }): Promise<{
    write(data: BlobPart): Promise<void>;
    truncate?(size: number): Promise<void>;
    close(): Promise<void>;
  }>;
}

type WindowWithFsAccess = Window &
  typeof globalThis & {
    showOpenFilePicker?: (options?: {
      multiple?: boolean;
      types?: { description: string; accept: Record<string, string[]> }[];
      startIn?: FsFileHandleLike;
    }) => Promise<FsFileHandleLike[]>;
    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      types?: { description: string; accept: Record<string, string[]> }[];
      startIn?: FsFileHandleLike;
    }) => Promise<FsFileHandleLike>;
  };

const JSON_PICKER_TYPES = [{ description: 'Preset JSON', accept: { 'application/json': ['.json'] } }];
let lastPickerLocation: FsFileHandleLike | undefined;

export function isFileSystemAccessPermissionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('name' in error)) return false;
  const name = (error as { name?: unknown }).name;
  return name === 'NotAllowedError' || name === 'SecurityError';
}

export function isFileSystemAccessSupported(): boolean {
  const win = window as WindowWithFsAccess;
  return typeof win.showOpenFilePicker === 'function' && typeof win.showSaveFilePicker === 'function';
}

export interface OpenedJsonFile {
  fileName: string;
  text: string;
  /** Present only where the File System Access API is supported - enables true in-place overwrite saves. */
  handle?: FsFileHandleLike;
}

/** Opens a native "choose file(s)" dialog and reads each selected file's text. */
export async function pickJsonFiles(multiple: boolean): Promise<OpenedJsonFile[]> {
  const win = window as WindowWithFsAccess;
  if (win.showOpenFilePicker) {
    const handles = await win.showOpenFilePicker({
      multiple,
      types: JSON_PICKER_TYPES,
      ...(lastPickerLocation ? { startIn: lastPickerLocation } : {}),
    });
    const results: OpenedJsonFile[] = [];
    for (const handle of handles) {
      const file = await handle.getFile();
      lastPickerLocation = handle;
      results.push({ fileName: file.name, text: await file.text(), handle });
    }
    return results;
  }
  return pickJsonFilesViaInput(multiple);
}

/** `<input type="file">` fallback for browsers without the File System Access API. */
function pickJsonFilesViaInput(multiple: boolean): Promise<OpenedJsonFile[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.multiple = multiple;
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const files = Array.from(input.files ?? []);
      Promise.all(files.map(async (file) => ({ fileName: file.name, text: await file.text() }))).then(resolve);
      input.remove();
    }, { once: true });
    // If the user cancels, no 'change' fires - resolve empty after focus returns.
    window.addEventListener(
      'focus',
      () => window.setTimeout(() => (document.body.contains(input) ? (input.remove(), resolve([])) : undefined), 300),
      { once: true },
    );
    document.body.appendChild(input);
    input.click();
  });
}

/** Reads a `DataTransferItemList` from a drop event, preferring native FS handles where available (Chromium). */
export async function readDroppedJsonFiles(items: DataTransferItemList): Promise<OpenedJsonFile[]> {
  const results: OpenedJsonFile[] = [];
  for (const item of Array.from(items)) {
    if (item.kind !== 'file') continue;
    const getAsHandle = (item as DataTransferItem & { getAsFileSystemHandle?: () => Promise<FsFileHandleLike> })
      .getAsFileSystemHandle;
    if (getAsHandle) {
      const handle = await getAsHandle.call(item);
      if (handle && handle.kind === 'file') {
        const file = await handle.getFile();
        if (!file.name.toLowerCase().endsWith('.json')) continue;
        results.push({ fileName: file.name, text: await file.text(), handle });
        continue;
      }
    }
    const file = item.getAsFile();
    if (file && file.name.toLowerCase().endsWith('.json')) {
      results.push({ fileName: file.name, text: await file.text() });
    }
  }
  return results;
}

/** Writes JSON text to an existing file handle (silent overwrite - no dialog). */
export async function writeToHandle(handle: FsFileHandleLike, text: string): Promise<void> {
  const permission = await handle.queryPermission?.({ mode: 'readwrite' });
  if (permission !== undefined && permission !== 'granted') {
    const requested = await handle.requestPermission?.({ mode: 'readwrite' });
    if (requested !== 'granted') {
      const error = new Error('Write permission was not granted for this file.');
      error.name = 'NotAllowedError';
      throw error;
    }
  }
  const writable = await handle.createWritable({ keepExistingData: false });
  await writable.write(text);
  await writable.close();
}

/** Prompts for a save location (Chromium) and writes immediately, returning the new handle for future overwrites. */
export async function pickSaveHandleAndWrite(suggestedName: string, text: string): Promise<FsFileHandleLike | null> {
  const win = window as WindowWithFsAccess;
  if (!win.showSaveFilePicker) return null;
  let handle: FsFileHandleLike;
  try {
    handle = await win.showSaveFilePicker({
      suggestedName,
      types: JSON_PICKER_TYPES,
      ...(lastPickerLocation ? { startIn: lastPickerLocation } : {}),
    });
    await writeToHandle(handle, text);
    lastPickerLocation = handle;
  } catch (error) {
    if (isFileSystemAccessPermissionError(error)) return null;
    throw error;
  }
  return handle;
}

/** Universal fallback: triggers a browser download of the given text as a file. */
export function downloadTextFile(fileName: string, text: string): void {
  downloadBlobFile(fileName, new Blob([text], { type: 'application/json' }));
}

/** Universal fallback: triggers a browser download of the given blob as a file. */
export function downloadBlobFile(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export type { FsFileHandleLike };
