/**
 * Node platform variant of the built-in cursor asset registry. Re-exports the
 * existing `fs`-backed implementation unchanged - see `cursor-assets.browser.ts`
 * for the browser side of the `#platform/cursor-assets.js` boundary (root
 * `package.json` `imports` field picks between them per the bundler's
 * `node`/`browser` condition).
 */
export * from '../cursor-assets';
