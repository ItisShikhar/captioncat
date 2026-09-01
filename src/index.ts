import os from 'node:os';

// The render pipeline spreads CPU-bound async work (skia-canvas PNG encoding,
// fs writes) across libuv's threadpool. Its default size (4) is often smaller
// than the available CPU count, so bump it here - as early as this package can
// control - before any threadpool-consuming operation runs. This must happen
// before the first async fs/dns/zlib/crypto call in the process, so it only
// reliably takes effect if this module is one of the first required.
if (!process.env.UV_THREADPOOL_SIZE) {
  process.env.UV_THREADPOOL_SIZE = String(Math.max(4, os.cpus().length));
}

export * from './caption-engine';
export * from './font-registry';
export * from './project-branding';
