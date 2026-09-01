/**
 * Node platform variant of the built-in image asset registry. Re-exports the
 * existing `fs`-backed implementation unchanged - see `image-assets.browser.ts`
 * for the browser side of the `#platform/image-assets.js` boundary (root
 * `package.json` `imports` field picks between them per the bundler's
 * `node`/`browser` condition).
 */
export * from '../image-assets';
