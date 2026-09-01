import {
  getFontFamily,
  getFontFaceWeightDescriptor,
  registerFontFaceFromUrl,
  setLocalFontSourceResolver,
  type FontVariant,
  type LocalFontSourceResolver,
} from '@captioncat/caption-engine/browser';
import { fontUrlLoaders } from 'virtual:studio-font-assets';

/**
 * The Vite font-assets plugin imports local registry sources only for the
 * optional offline build. The default Studio build leaves this map empty so
 * the resolver falls through to the ordered Google/CDN sources.
 */
const registeredSources = new Set<string>();

function loaderForPath(sourcePath: string): (() => Promise<string>) | undefined {
  const normalized = sourcePath.replace(/[\\/]+/g, '/');
  const registryPath = normalized.startsWith('./') ? normalized : `./${normalized}`;
  return fontUrlLoaders[registryPath];
}

/** Registers the requested local registry variant as a `FontFace`. */
export async function ensureBundledFontRegistered(family: string, requestedVariant?: FontVariant): Promise<boolean> {
  const entry = getFontFamily(family);
  if (!entry) return false;
  const variants = requestedVariant ? [requestedVariant] : entry.variants;
  let registered = false;

  for (const variant of variants) {
    for (const source of variant.sources) {
      if (source.type !== 'local') continue;
      const loader = loaderForPath(source.path);
      if (!loader) continue;
      const sourceKey = `${family}::${variant.weight}::${variant.style}::${source.path}`;
      if (registeredSources.has(sourceKey)) {
        registered = true;
        continue;
      }
      try {
        const url = await loader();
        await registerFontFaceFromUrl(family, url, {
          weight: getFontFaceWeightDescriptor(source, variant.weight),
          style: variant.style,
        });
        registeredSources.add(sourceKey);
        registered = true;
        break;
      } catch {
        // Continue through ordered local sources before allowing a remote fallback.
      }
    }
  }
  return registered;
}

const resolveBundledFontSource: LocalFontSourceResolver = async (family, variant, source) =>
  source.type === 'local' ? ensureBundledFontRegistered(family, variant) : false;

setLocalFontSourceResolver(resolveBundledFontSource);
