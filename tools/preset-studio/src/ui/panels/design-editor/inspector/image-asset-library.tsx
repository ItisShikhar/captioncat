import { Check, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { Button } from '@/ui/shadcn/button';
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/ui/shadcn/drawer';
import { Input } from '@/ui/shadcn/input';
import {
  BUILTIN_IMAGE_ASSET_DEFINITIONS,
  builtinImageDefinition,
  builtinImageSvg,
  CURATED_BUNDLED_IMAGE_ASSETS,
  isBuiltinImageAsset,
  type BuiltinImageAsset,
  type BuiltinImageAssetDefinition,
} from '@captioncat/caption-engine/browser';

const RECENT_IMAGE_ASSETS_STORAGE_KEY = 'captioncat.image-assets.recent';
const RECENT_IMAGE_ASSETS_EVENT = 'captioncat:image-assets-recent-changed';
const MAX_RECENT_IMAGE_ASSETS = 6;

function readRecentImageAssets(): BuiltinImageAsset[] {
  if (typeof window === 'undefined') return [];
  try {
    const value = window.localStorage.getItem(RECENT_IMAGE_ASSETS_STORAGE_KEY);
    if (!value) return [];
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    const validAssets = parsed.filter(
      (asset): asset is BuiltinImageAsset => typeof asset === 'string' && isBuiltinImageAsset(asset),
    );
    return [...new Set(validAssets)].slice(0, MAX_RECENT_IMAGE_ASSETS);
  } catch (error) {
    console.warn('Could not read recently used image assets.', error);
    return [];
  }
}

function persistRecentImageAssets(assets: readonly BuiltinImageAsset[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RECENT_IMAGE_ASSETS_STORAGE_KEY, JSON.stringify(assets));
    window.dispatchEvent(new Event(RECENT_IMAGE_ASSETS_EVENT));
  } catch (error) {
    console.warn('Could not persist recently used image assets.', error);
  }
}

export function useRecentImageAssets(): {
  recentAssets: readonly BuiltinImageAsset[];
  rememberAsset: (asset: string) => void;
} {
  const [recentAssets, setRecentAssets] = useState<BuiltinImageAsset[]>(readRecentImageAssets);
  const recentAssetsRef = useRef(recentAssets);
  recentAssetsRef.current = recentAssets;

  useEffect(() => {
    const syncRecentAssets = (): void => {
      const next = readRecentImageAssets();
      recentAssetsRef.current = next;
      setRecentAssets(next);
    };
    window.addEventListener('storage', syncRecentAssets);
    window.addEventListener(RECENT_IMAGE_ASSETS_EVENT, syncRecentAssets);
    return () => {
      window.removeEventListener('storage', syncRecentAssets);
      window.removeEventListener(RECENT_IMAGE_ASSETS_EVENT, syncRecentAssets);
    };
  }, []);

  const rememberAsset = useCallback((asset: string): void => {
    if (!isBuiltinImageAsset(asset)) return;
    const next = [asset, ...recentAssetsRef.current.filter((candidate) => candidate !== asset)].slice(
      0,
      MAX_RECENT_IMAGE_ASSETS,
    );
    recentAssetsRef.current = next;
    setRecentAssets(next);
    persistRecentImageAssets(next);
  }, []);

  return { recentAssets, rememberAsset };
}

export function BuiltinAssetIcon({ asset, className }: { asset: string; className?: string }): ReactNode {
  const svg = builtinImageSvg(asset)
    .replace(
      /\b(fill|stroke)="([^"]+)"/gi,
      (match, attribute: string, value: string) =>
        /^(none|currentcolor|url\()/i.test(value) ? match : `${attribute}="currentColor"`,
    )
    .replace(/\b(fill|stroke):\s*([^;"']+)/gi, (match, attribute: string, value: string) =>
      /^(none|currentcolor|url\()/i.test(value.trim()) ? match : `${attribute}:currentColor`,
    );
  return (
    <span
      aria-hidden="true"
      className={cn(
        'text-foreground inline-flex h-[1em] w-[1em] shrink-0 items-center justify-center leading-none [&>svg]:block [&>svg]:h-full [&>svg]:w-full [&>svg]:object-contain',
        className,
      )}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function assetMatchesQuery(definition: BuiltinImageAssetDefinition, query: string): boolean {
  if (!query) return true;
  const terms = [definition.name, definition.id, ...definition.tags].join(' ').toLowerCase();
  return terms.includes(query);
}

function assetDefinitionsForIds(ids: readonly BuiltinImageAsset[]): BuiltinImageAssetDefinition[] {
  return ids
    .map((asset) => builtinImageDefinition(asset))
    .filter((definition): definition is BuiltinImageAssetDefinition => definition !== undefined);
}

function AssetGrid({
  definitions,
  value,
  onSelect,
  disabled = false,
}: {
  definitions: readonly BuiltinImageAssetDefinition[];
  value: string;
  onSelect: (asset: BuiltinImageAsset) => void;
  disabled?: boolean;
}): ReactNode {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {definitions.map((definition) => {
        const active = definition.id === value;
        return (
          <button
            key={definition.id}
            type="button"
            aria-label={definition.name}
            aria-pressed={active}
            disabled={disabled}
            className={cn(
              'group relative flex min-w-0 flex-col items-center gap-1 rounded-md border p-2 text-center transition-colors',
              'hover:bg-accent hover:text-accent-foreground',
              active && 'border-primary bg-accent text-accent-foreground ring-1 ring-primary/30',
            )}
            onClick={() => onSelect(definition.id as BuiltinImageAsset)}
          >
            <BuiltinAssetIcon asset={definition.id} className="text-2xl" />
            <span className="w-full truncate text-[10px] leading-tight">{definition.name}</span>
            {active && (
              <span className="bg-primary text-primary-foreground absolute top-1 right-1 flex size-4 items-center justify-center rounded-full">
                <Check className="size-2.5" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function AssetLibraryDrawer({
  open,
  value,
  onOpenChange,
  onSelect,
  disabled = false,
}: {
  open: boolean;
  value: string;
  onOpenChange: (open: boolean) => void;
  onSelect: (asset: BuiltinImageAsset) => void;
  disabled?: boolean;
}): ReactNode {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const searchResults = useMemo(
    () => BUILTIN_IMAGE_ASSET_DEFINITIONS.filter((definition) => assetMatchesQuery(definition, normalizedQuery)),
    [normalizedQuery],
  );

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const selectAsset = (asset: BuiltinImageAsset): void => {
    onSelect(asset);
    onOpenChange(false);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="gap-0">
        <DrawerHeader className="bg-background top-0 z-10 border-b p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DrawerTitle>Asset Library</DrawerTitle>
              <DrawerDescription className="mt-1">Curated SVG assets for captions and graphics.</DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button type="button" variant="ghost" size="icon-xs" aria-label="Close asset library">
                <X className="size-4" />
              </Button>
            </DrawerClose>
          </div>
          <label className="relative mt-3 block">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search assets..."
              aria-label="Search assets"
              className="h-9 pl-8"
              autoFocus
            />
          </label>
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {normalizedQuery ? (
            searchResults.length > 0 ? (
              <section>
                <h2 className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-[0.16em] uppercase">
                  Search Results
                </h2>
                <AssetGrid definitions={searchResults} value={value} onSelect={selectAsset} disabled={disabled} />
              </section>
            ) : (
              <p className="text-muted-foreground py-12 text-center text-sm">No assets found</p>
            )
          ) : (
            <AssetGrid
              definitions={BUILTIN_IMAGE_ASSET_DEFINITIONS}
              value={value}
              onSelect={selectAsset}
              disabled={disabled}
            />
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export function curatedBundledAssetDefinitions(): BuiltinImageAssetDefinition[] {
  return assetDefinitionsForIds(CURATED_BUNDLED_IMAGE_ASSETS);
}
