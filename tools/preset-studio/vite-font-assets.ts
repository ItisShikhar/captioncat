import fs from 'node:fs';
import path from 'node:path';
import { normalizePath, type Plugin } from 'vite';
import { BUNDLE_FONTS_WITH_REMOTE_SOURCES } from './src/engine-adapters/font-bundle-config.js';

const virtualModuleId = 'virtual:studio-font-assets';
const resolvedVirtualModuleId = `\0${virtualModuleId}`;

interface RegistrySource {
  type: string;
  path?: string;
}

interface RegistryVariant {
  sources: RegistrySource[];
}

interface RegistryFamily {
  family: string;
  variants: RegistryVariant[];
}

interface FontRegistry {
  fonts: RegistryFamily[];
}

interface FontAsset {
  registryPath: string;
  absolutePath: string;
}

function normalizeRegistryPath(value: string): string {
  const normalized = value.replace(/[\\/]+/g, '/');
  return normalized.startsWith('./') ? normalized : `./${normalized}`;
}

function collectFontAssets(assetsDirectory: string): FontAsset[] {
  if (!BUNDLE_FONTS_WITH_REMOTE_SOURCES) return [];

  const registryPath = path.join(assetsDirectory, 'fonts-data.json');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as FontRegistry;
  const assets = new Map<string, FontAsset>();

  for (const family of registry.fonts) {
    for (const variant of family.variants) {
      for (const source of variant.sources) {
        if (source.type !== 'local' || !source.path) continue;
        const normalizedPath = normalizeRegistryPath(source.path);
        assets.set(normalizedPath, {
          registryPath: normalizedPath,
          absolutePath: path.resolve(assetsDirectory, source.path),
        });
      }
    }
  }

  return Array.from(assets.values());
}

function createFontAssetModule(assetsDirectory: string): string {
  const assets = collectFontAssets(assetsDirectory);
  const imports = assets.map(
    (asset, index) =>
      `import fontAsset${index} from ${JSON.stringify(`${normalizePath(asset.absolutePath)}?url`)};`,
  );
  const loaders = assets.map(
    (asset, index) => `  ${JSON.stringify(asset.registryPath)}: () => Promise.resolve(fontAsset${index}),`,
  );

  return [
    ...imports,
    '',
    'export const fontUrlLoaders = {',
    ...loaders,
    '};',
    '',
  ].join('\n');
}

export function studioFontAssetsPlugin(): Plugin {
  const assetsDirectory = path.resolve(import.meta.dirname, '../../assets');

  return {
    name: 'studio-font-assets',
    resolveId(id) {
      return id === virtualModuleId ? resolvedVirtualModuleId : undefined;
    },
    load(id) {
      return id === resolvedVirtualModuleId ? createFontAssetModule(assetsDirectory) : undefined;
    },
  };
}
