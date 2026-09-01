/**
 * Browser platform variant of the engine's canvas primitives - the engine's
 * side of the `#platform/canvas.js` boundary (see `canvas.node.ts` for the
 * Node side and the root `package.json` `imports` field for how a bundler
 * picks between them).
 *
 * Replaces the Node-only `skia-canvas` package (native Skia bindings) with
 * the browser's own Canvas2D APIs, so the exact same renderer source (the
 * entity-system components/effects and the ECS pipeline) runs unmodified
 * against `HTMLCanvasElement`/`OffscreenCanvas` instead.
 *
 * Design note: the `Canvas` constructor returns a real browser canvas object
 * (`HTMLCanvasElement` or `OffscreenCanvas`) via the "return an object from a
 * class constructor" trick, rather than a wrapper class. This means anywhere
 * the engine passes a `Canvas`/`Image` instance into another canvas's
 * `drawImage`/`drawCanvas` call, it is already a valid `CanvasImageSource` -
 * no unwrapping needed.
 */

let canvasElementPatched = false;

/**
 * The engine repeatedly calls `getImageData` (per-frame corner masking,
 * `toBuffer('raw',...)`, etc.) on canvases obtained via plain
 * `canvas.getContext('2d')` (no options) - patch the browser canvas'
 * `getContext` once so every 2D context defaults to `willReadFrequently`,
 * matching skia-canvas's own always-CPU-backed behavior and avoiding
 * Chrome's "multiple readback" perf warning.
 */
function ensureCanvasElementPatched(): void {
  if (canvasElementPatched) return;
  canvasElementPatched = true;
  const canvasConstructor =
    typeof HTMLCanvasElement !== 'undefined'
      ? HTMLCanvasElement
      : typeof OffscreenCanvas !== 'undefined'
        ? OffscreenCanvas
        : undefined;
  if (!canvasConstructor) return;
  const proto = canvasConstructor.prototype;
  const nativeGetContext = proto.getContext as unknown as (
    this: HTMLCanvasElement | OffscreenCanvas,
    contextId: string,
    options?: Record<string, unknown>,
  ) => RenderingContext | null;
  Object.defineProperty(proto, 'getContext', {
    configurable: true,
    writable: true,
    value(this: HTMLCanvasElement | OffscreenCanvas, contextId: string, options?: Record<string, unknown>) {
      if (contextId === '2d') {
        return nativeGetContext.call(this, contextId, { willReadFrequently: true, ...options });
      }
      return nativeGetContext.call(this, contextId, options);
    },
  });
}

/** skia-canvas's `ctx.drawCanvas(image, x, y, w?, h?)` has no browser Canvas2D equivalent. Add it once. */
function ensureContextPatched(): void {
  ensureCanvasElementPatched();
  const contextConstructor =
    typeof CanvasRenderingContext2D !== 'undefined'
      ? CanvasRenderingContext2D
      : typeof OffscreenCanvasRenderingContext2D !== 'undefined'
        ? OffscreenCanvasRenderingContext2D
        : undefined;
  if (!contextConstructor) return;
  const proto = contextConstructor.prototype as CanvasRenderingContext2D & Record<string, unknown>;
  if (typeof proto.drawCanvas !== 'function') {
    Object.defineProperty(proto, 'drawCanvas', {
      configurable: true,
      writable: true,
      value(
        this: globalThis.CanvasRenderingContext2D,
        image: CanvasImageSource,
        x: number,
        y: number,
        w?: number,
        h?: number,
      ) {
        if (w === undefined || h === undefined) {
          this.drawImage(image, x, y);
        } else {
          this.drawImage(image, x, y, w, h);
        }
      },
    });
  }
  if (!('fontHinting' in proto)) {
    // skia-canvas-only rendering hint. Browsers always hint, so this flag is a no-op.
    Object.defineProperty(proto, 'fontHinting', { configurable: true, writable: true, value: true });
  }
}

type SkiaCanvasElement = (HTMLCanvasElement | OffscreenCanvas) & {
  toBuffer(format: 'raw' | 'png' | 'jpg' | 'jpeg', opts?: { colorType?: string }): Promise<Buffer>;
  toBufferSync(format: 'raw' | 'png' | 'jpg' | 'jpeg', opts?: { colorType?: string }): Buffer;
};

// `Buffer` here refers to the ambient global from `@types/node` (only used
// for typing - see `tsconfig.browser.json`). At runtime it resolves to the
// `buffer` polyfill assigned onto `globalThis.Buffer` by `browser.ts` before
// any of this module's exports are invoked.
async function canvasToBuffer(
  el: HTMLCanvasElement | OffscreenCanvas,
  format: 'raw' | 'png' | 'jpg' | 'jpeg',
): Promise<Buffer> {
  return canvasToBufferSync(el, format);
}

/**
 * Synchronous raw/encoded buffer, matching skia-canvas's `toBufferSync`
 * (used by the ECS pipeline's per-frame render loop). `'raw'` reads the
 * pixels straight off the 2D context. Encoded formats round-trip through a
 * data URL (browsers have no synchronous PNG encoder, but `toDataURL` is
 * itself synchronous).
 */
function canvasToBufferSync(el: HTMLCanvasElement | OffscreenCanvas, format: 'raw' | 'png' | 'jpg' | 'jpeg'): Buffer {
  if (format === 'raw') {
    const ctx = el.getContext('2d', { willReadFrequently: true })!;
    return Buffer.from(ctx.getImageData(0, 0, el.width, el.height).data.buffer);
  }
  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  if (!('toDataURL' in el)) {
    throw new Error(`Synchronous ${format} canvas output is not available on OffscreenCanvas.`);
  }
  const dataUrl = el.toDataURL(mime);
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return Buffer.from(bytes);
}

/**
 * `Canvas`/`Image`/`ImageData` below all use the same pattern: an
 * implementation class whose constructor returns a *real* DOM/native object
 * (via the "return an object from a class constructor" JS rule), re-exported
 * under a value binding typed as `new (...) => <real DOM type + extras>`.
 * This keeps the exported *type* a genuine structural match for
 * `CanvasImageSource`/native `ImageData` (so it is directly usable in
 * `ctx.drawImage`/`ctx.putImageData` without casts), while the exported
 * *value* is our constructor function that does the real work.
 */

export type Canvas = Omit<HTMLCanvasElement, 'getContext'> & {
  // Real skia-canvas contexts are never null. Add a non-nullable `'2d'`
  // overload *ahead of* the full native overload set (order matters for
  // overload resolution) so plain `getContext('2d')` calls (used throughout
  // the renderer core) resolve to the non-null, `drawCanvas`/`fontHinting`-
  // augmented context, while `Canvas` still structurally satisfies
  // `HTMLCanvasElement`/`CanvasImageSource` for `ctx.drawImage()`/`drawCanvas()`.
  getContext: ((contextId: '2d') => CanvasRenderingContext2D) & HTMLCanvasElement['getContext'];
  toBuffer(format: 'raw' | 'png' | 'jpg' | 'jpeg', opts?: { colorType?: string }): Promise<Buffer>;
  toBufferSync(format: 'raw' | 'png' | 'jpg' | 'jpeg', opts?: { colorType?: string }): Buffer;
};

class CanvasImpl {
  constructor(width: number, height: number) {
    ensureContextPatched();
    const el = (
      typeof document !== 'undefined'
        ? document.createElement('canvas')
        : new OffscreenCanvas(width, height)
    ) as SkiaCanvasElement;
    el.width = width;
    el.height = height;
    el.toBuffer = (format, opts) => canvasToBuffer(el, format ?? (opts?.colorType ? 'raw' : 'png'));
    el.toBufferSync = (format, opts) => canvasToBufferSync(el, format ?? (opts?.colorType ? 'raw' : 'png'));
    // eslint-disable-next-line no-constructor-return -- intentional: hand back the real DOM element.
    return el;
  }
}

export const Canvas = CanvasImpl as unknown as { new (width: number, height: number): Canvas };

export type Image = HTMLImageElement;

class ImageImpl {
  constructor(buffer?: ArrayBufferView | ArrayBuffer) {
    const el = document.createElement('img');
    if (buffer) {
      const view = ArrayBuffer.isView(buffer)
        ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
        : new Uint8Array(buffer);
      // Copy into a fresh, plain-`ArrayBuffer`-backed view so it structurally satisfies `BlobPart`.
      const blob = new Blob([new Uint8Array(view).buffer]);
      el.src = URL.createObjectURL(blob);
    }
    // eslint-disable-next-line no-constructor-return -- intentional: hand back the real DOM element.
    return el;
  }
}

export const Image = ImageImpl as unknown as { new (buffer?: ArrayBufferView | ArrayBuffer): Image };

export type ImageData = globalThis.ImageData;

class ImageDataImpl {
  constructor(data: ArrayLike<number> | Uint8ClampedArray, width: number, height?: number) {
    // Always copy into a fresh, plain-`ArrayBuffer`-backed `Uint8ClampedArray`
    // (never a `SharedArrayBuffer`-backed view), matching what the native
    // `ImageData` constructor's type declarations require.
    const buffer = new ArrayBuffer(data.length);
    const clamped = new Uint8ClampedArray(buffer);
    clamped.set(data);
    const native = new globalThis.ImageData(clamped, width, height);
    // eslint-disable-next-line no-constructor-return -- intentional: hand back the real native ImageData.
    return native;
  }
}

export const ImageData = ImageDataImpl as unknown as {
  new (data: ArrayLike<number> | Uint8ClampedArray, width: number, height?: number): ImageData;
};

export const Path2D = globalThis.Path2D;
export type Path2D = globalThis.Path2D;

/** skia-canvas's augmented 2D context type (native context + the `drawCanvas`/`fontHinting` additions above). */
export type CanvasRenderingContext2D = globalThis.CanvasRenderingContext2D & {
  drawCanvas(image: CanvasImageSource, x: number, y: number, w?: number, h?: number): void;
  fontHinting: boolean;
};

/**
 * No-op in the browser: font registration happens via real `FontFace`
 * objects instead (see `../../../utilities/platform/font-loader.browser.ts`),
 * since the browser has no writable font-file cache directory to register
 * paths against.
 */
export const FontLibrary = {
  use(_family: string, _paths: string[]): void {
    // Intentionally empty - see the module doc comment above.
  },
  has(family: string): boolean {
    const globalFonts = (globalThis as typeof globalThis & { fonts?: FontFaceSet }).fonts;
    const fontSet = globalFonts ?? (typeof document !== 'undefined' ? document.fonts : undefined);
    return fontSet?.check(`16px "${family}"`) ?? false;
  },
  family(_family: string): undefined {
    return undefined;
  },
};
