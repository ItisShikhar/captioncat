import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { studioFontAssetsPlugin } from './vite-font-assets.js';

function getReleaseVersion(): string {
  const packageMetadata: unknown = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  );
  if (
    typeof packageMetadata !== 'object' ||
    packageMetadata === null ||
    !('version' in packageMetadata) ||
    typeof packageMetadata.version !== 'string'
  ) {
    throw new Error('The root package.json must define a string version.');
  }
  return packageMetadata.version;
}

function getReleaseOutputName(): string {
  return `captioncat-preset-studio-v${getReleaseVersion()}.html`;
}

function versionedStudioOutput(): Plugin {
  return {
    name: 'versioned-studio-output',
    closeBundle() {
      const outputDirectory = path.resolve(import.meta.dirname, 'dist');
      const sourcePath = path.join(outputDirectory, 'index.html');
      const targetName = getReleaseOutputName();
      const targetPath = path.join(outputDirectory, targetName);

      if (!existsSync(sourcePath)) {
        throw new Error(`Expected Vite output at ${sourcePath}.`);
      }
      renameSync(sourcePath, targetPath);
      console.log(`Generated ${targetName}`);
    },
    configurePreviewServer(server) {
      const outputName = getReleaseOutputName();
      server.middlewares.use((request, _response, next) => {
        if (request.url === '/' || request.url === '/index.html') {
          request.url = `/${outputName}`;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    studioFontAssetsPlugin(),
    viteSingleFile({
      removeViteModuleLoader: true,
    }),
    versionedStudioOutput(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  worker: {
    plugins: () => [studioFontAssetsPlugin()],
  },
  build: {
    // vite-plugin-singlefile requires assets to be inlined, not code-split
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 100_000,
  },
});
