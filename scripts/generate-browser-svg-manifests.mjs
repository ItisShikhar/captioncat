// Generates JSON manifests that embed the built-in SVG asset sources (shapes
// and cursors) as plain string data. The engine's browser platform variants
// (`entity-system/platform/image-assets.browser.ts` and
// `cursor-assets.browser.ts`) import these manifests so the browser build
// never needs `node:fs`/`node:path` (or a bundler-specific asset-globbing
// feature) to read the same SVGs the Node build reads straight off disk.
//
// Runs before `tsc -p tsconfig.browser.json` (see the root `build` script) so
// the manifests exist as ordinary source files by the time the browser
// program compiles. The output directory is generated, not checked in (see
// `.gitignore`).
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(
  repositoryRoot,
  'src/caption-engine/entity-system/platform/generated',
);

async function buildManifest(sourceDirectory) {
  const filenames = (await readdir(sourceDirectory)).filter((filename) => filename.endsWith('.svg')).sort();
  const entries = await Promise.all(
    filenames.map(async (filename) => [filename, await readFile(path.join(sourceDirectory, filename), 'utf8')]),
  );
  return Object.fromEntries(entries);
}

async function writeManifest(outputFilename, manifest) {
  await mkdir(outputDirectory, { recursive: true });
  const header =
    '// GENERATED FILE - do not edit by hand. Produced by scripts/generate-browser-svg-manifests.mjs.\n';
  const body = `${header}const manifest: Readonly<Record<string, string>> = ${JSON.stringify(manifest, null, 2)};\nexport default manifest;\n`;
  await writeFile(path.join(outputDirectory, outputFilename), body, 'utf8');
}

await writeManifest(
  'image-asset-svg-sources.ts',
  await buildManifest(path.join(repositoryRoot, 'assets/svg/shapes')),
);
await writeManifest(
  'cursor-asset-svg-sources.ts',
  await buildManifest(path.join(repositoryRoot, 'assets/svg/cursors')),
);
