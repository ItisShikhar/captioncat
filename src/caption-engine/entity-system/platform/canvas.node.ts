/**
 * Node platform variant of the engine's canvas primitives. The renderer core
 * (entity-system components/effects, the pipeline, and the utility canvas
 * helpers) imports `Canvas`/`Image`/`ImageData`/`Path2D`/`FontLibrary` through
 * the `#platform/canvas.js` package import instead of importing `skia-canvas`
 * directly, so the browser build (see `canvas.browser.ts`) can supply a
 * browser-native replacement without any consumer-side bundler alias - see
 * the root `package.json` `imports` field for the `node`/`browser` condition
 * mapping.
 */
export { Canvas, CanvasRenderingContext2D, FontLibrary, Image, ImageData, Path2D } from 'skia-canvas';
