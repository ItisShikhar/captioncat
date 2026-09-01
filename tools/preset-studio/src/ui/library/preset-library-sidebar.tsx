import { supportsPreviewWorkerRendering } from '@/engine-adapters/preview-worker-support';
import { cn } from '@/lib/utils';
import type { LibraryEntry } from '@/state/preset-library';
import { PastelDotLoader } from '@/ui/components/pastel-dot-loader';
import { UnsavedChangesDot } from '@/ui/components/unsaved-changes-dot';
import { CollapsibleSection } from '@/ui/controls/collapsible-section';
import { useMediaQuery } from '@/ui/hooks/use-media-query';
import { Button } from '@/ui/shadcn/button';
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/ui/shadcn/drawer';
import { Input } from '@/ui/shadcn/input';
import { ScrollArea } from '@/ui/shadcn/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';
import { ArrowLeft, Layers2, Plus, Search, X } from 'lucide-react';
import { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPlatformDefinition, platformIdForValue } from './platform-registry';
import { PlatformSectionTitle } from './platform-section-title';
import { usePresetThumbnail } from './use-preset-thumbnail';

function normalizeSearchTerm(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, ' ');
}

function searchTokens(value: string): string[] {
  return normalizeSearchTerm(value)
    .split(/[\s/_-]+/)
    .filter(Boolean);
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  let current = new Array<number>(right.length + 1);

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const insertion = current[j - 1] + 1;
      const deletion = previous[j] + 1;
      const substitution = previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1);
      current[j] = Math.min(insertion, deletion, substitution);
    }
    [previous, current] = [current, previous];
  }

  return previous[right.length];
}

function matchesSearch(value: string, query: string): boolean {
  const normalizedQuery = normalizeSearchTerm(query);
  if (!normalizedQuery) return true;

  const normalizedValue = normalizeSearchTerm(value);
  if (normalizedValue.includes(normalizedQuery)) return true;
  if (normalizedQuery.length < 3) return false;

  return searchTokens(value).some((token) => {
    if (token.includes(normalizedQuery)) return true;
    return token.length >= 4 && Math.abs(token.length - normalizedQuery.length) <= 2
      ? levenshteinDistance(token, normalizedQuery) <= 2
      : false;
  });
}

const CUSTOM_SECTION_KEY = 'custom-presets';
const PRESET_SECTION_CONTENT_CLASS = 'ml-0 pl-1.5';

function platformSectionKey(platformId: string): string {
  return `bundled-platform:${platformId}`;
}

interface PresetLibrarySidebarProps {
  entries: LibraryEntry[];
  selectedKey: string | undefined;
  onSelect: (key: string) => void;
  onClosed: () => void;
  revealRequest?: { key: string; nonce: number } | null;
  onDuplicate: (key: string) => void;
  onNewPreset: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Responsive preset drawer listing every preset loaded into the studio this session. */
export const PresetLibrarySidebar = memo(function PresetLibrarySidebar({
  entries,
  selectedKey,
  onSelect,
  onClosed,
  revealRequest,
  onDuplicate,
  onNewPreset,
  open,
  onOpenChange,
}: PresetLibrarySidebarProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [sectionOpen, setSectionOpen] = useState<Record<string, boolean>>({});
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const setRowRef = useCallback((key: string, node: HTMLDivElement | null) => {
    if (node) {
      rowRefs.current.set(key, node);
    } else {
      rowRefs.current.delete(key);
    }
  }, []);

  const revealKey = revealRequest?.key;
  const revealNonce = revealRequest?.nonce;
  const revealTarget = useMemo(
    () => (revealKey ? entries.find((entry) => entry.key === revealKey) : undefined),
    [entries, revealKey],
  );
  const revealPlatformId =
    revealTarget?.origin === 'bundled' ? platformIdForValue(revealTarget.document.metadata?.platform) : undefined;
  const revealOrigin = revealTarget?.origin;
  const setSectionOpenValue = useCallback((key: string, open: boolean) => {
    setSectionOpen((current) => (current[key] === open ? current : { ...current, [key]: open }));
  }, []);
  useLayoutEffect(() => {
    if (!revealKey) return;
    setSearch('');
    setSectionOpen((current) => {
      const next = { ...current };
      const sectionKeys = revealOrigin === 'bundled' ? [] : [CUSTOM_SECTION_KEY];
      if (revealPlatformId) {
        sectionKeys.push(platformSectionKey(revealPlatformId));
      }
      let changed = false;
      for (const key of sectionKeys) {
        if (next[key] !== true) {
          next[key] = true;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [revealKey, revealNonce, revealOrigin, revealPlatformId]);
  useEffect(() => {
    if (!open || !revealKey) return;

    const animationFrame = requestAnimationFrame(() => {
      const row = rowRefs.current.get(revealKey);
      const viewport = scrollViewportRef.current;
      if (!row || !viewport) return;

      const rowBounds = row.getBoundingClientRect();
      const viewportBounds = viewport.getBoundingClientRect();
      viewport.scrollTo({
        top: viewport.scrollTop + rowBounds.top - viewportBounds.top - (viewport.clientHeight - rowBounds.height) / 2,
        behavior: 'smooth',
      });
    });

    return () => cancelAnimationFrame(animationFrame);
  }, [deferredSearch, open, revealKey, revealNonce, search, sectionOpen]);

  const filtered = useMemo(() => {
    const query = normalizeSearchTerm(deferredSearch);
    if (!query) return entries;
    return entries.filter((e) => {
      const platform = createPlatformDefinition(e.document.metadata?.platform ?? 'originals');
      const searchableValues = [
        e.document.id,
        e.document.name,
        e.document.metadata?.platform,
        platform?.name,
        ...(e.document.metadata?.badges ?? []),
      ].filter((value): value is string => Boolean(value));
      if (searchableValues.some((value) => matchesSearch(value, query))) return true;
      const groupTitle = e.origin === 'bundled' ? platform.name : 'Custom';
      return matchesSearch(groupTitle, query);
    });
  }, [deferredSearch, entries]);

  const groups = useMemo(() => {
    const bundled = filtered.filter((e) => e.origin === 'bundled');
    const custom = filtered.filter((e) => e.origin !== 'bundled');
    const groupedEntries = new Map<string, LibraryEntry[]>();
    for (const entry of bundled) {
      const platformId = platformIdForValue(entry.document.metadata?.platform);
      const platformEntries = groupedEntries.get(platformId) ?? [];
      platformEntries.push(entry);
      groupedEntries.set(platformId, platformEntries);
    }
    const platformGroups = Array.from(groupedEntries, ([platformId, items]) => ({
      platform: createPlatformDefinition(platformId),
      items,
    })).sort(
      (left, right) =>
        left.platform.order - right.platform.order || left.platform.name.localeCompare(right.platform.name),
    );
    return { bundled, custom, platformGroups };
  }, [filtered]);

  return (
    <Drawer
      direction={isDesktop ? 'left' : 'bottom'}
      shouldScaleBackground={false}
      open={open}
      onOpenChange={onOpenChange}
    >
      <DrawerContent
        className="bg-popover text-popover-foreground overflow-hidden"
        onAnimationEnd={(event) => {
          if (!open && event.currentTarget === event.target) onClosed();
        }}
      >
        <DrawerHeader className="relative w-full px-4 pt-5 pb-3 text-left sm:px-5">
          <DrawerClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-foreground absolute top-3 right-3"
              aria-label="Close preset library"
            >
              {isDesktop ? <ArrowLeft className="size-4" /> : <X className="size-4" />}
            </Button>
          </DrawerClose>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground absolute top-3 right-12"
            onClick={onNewPreset}
            aria-label="Create new preset"
          >
            <Plus className="size-4" />
          </Button>
          <DrawerTitle>Presets</DrawerTitle>
          <DrawerDescription>Choose a caption style to edit.</DrawerDescription>
          <div className="relative mt-3">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
            <Input
              placeholder="Search presets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pr-8 pl-8"
            />
            {search.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-1 -translate-y-1/2 cursor-pointer"
                onClick={() => setSearch('')}
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </Button>
            )}
          </div>
        </DrawerHeader>
        <ScrollArea className="min-h-0 flex-1" viewportClassName="pr-2" viewportRef={scrollViewportRef}>
          <div className="flex w-full flex-col gap-3 p-3 pr-2">
            {groups.custom.length > 0 && (
              <CollapsibleSection
                open={sectionOpen[CUSTOM_SECTION_KEY] ?? true}
                onOpenChange={(open) => setSectionOpenValue(CUSTOM_SECTION_KEY, open)}
                title={
                  <PlatformSectionTitle platform={createPlatformDefinition('custom')} count={groups.custom.length} />
                }
                defaultOpen
                contentClassName={PRESET_SECTION_CONTENT_CLASS}
              >
                <PresetRows
                  entries={groups.custom}
                  selectedKey={selectedKey}
                  onSetRef={setRowRef}
                  onSelect={onSelect}
                  onDuplicate={onDuplicate}
                  sidebarOpen={open}
                />
              </CollapsibleSection>
            )}
            {groups.bundled.length > 0 && (
              <div className="flex flex-col gap-3">
                {groups.platformGroups.map(({ platform, items }) => (
                  <CollapsibleSection
                    key={platform.id}
                    open={sectionOpen[platformSectionKey(platform.id)] ?? true}
                    onOpenChange={(open) => setSectionOpenValue(platformSectionKey(platform.id), open)}
                    title={<PlatformSectionTitle platform={platform} count={items.length} />}
                    defaultOpen
                    contentClassName={PRESET_SECTION_CONTENT_CLASS}
                  >
                    <PresetRows
                      entries={items}
                      selectedKey={selectedKey}
                      onSetRef={setRowRef}
                      onSelect={onSelect}
                      onDuplicate={onDuplicate}
                      sidebarOpen={open}
                    />
                  </CollapsibleSection>
                ))}
              </div>
            )}
            {groups.custom.length === 0 && groups.bundled.length === 0 && (
              <p className="text-muted-foreground p-2 text-xs italic">No presets match.</p>
            )}
          </div>
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
});

interface PresetRowsProps {
  entries: LibraryEntry[];
  selectedKey: string | undefined;
  onSetRef: (key: string, node: HTMLDivElement | null) => void;
  onSelect: (key: string) => void;
  onDuplicate: (key: string) => void;
  sidebarOpen: boolean;
}

const PresetRows = memo(function PresetRows({
  entries,
  selectedKey,
  onSetRef,
  onSelect,
  onDuplicate,
  sidebarOpen,
}: PresetRowsProps) {
  return (
    <div className="flex flex-col gap-0.5">
      {entries.map((entry) => (
        <PresetRow
          key={entry.key}
          entry={entry}
          isSelected={entry.key === selectedKey}
          onSetRef={onSetRef}
          onSelect={onSelect}
          onDuplicate={onDuplicate}
          sidebarOpen={sidebarOpen}
        />
      ))}
    </div>
  );
});

interface PresetRowProps {
  entry: LibraryEntry;
  isSelected: boolean;
  onSetRef: (key: string, node: HTMLDivElement | null) => void;
  onSelect: (key: string) => void;
  onDuplicate: (key: string) => void;
  sidebarOpen: boolean;
}

/** One preset row: a real-engine-rendered thumbnail, name, and hover-only duplication action. */
const PresetRow = memo(function PresetRow({
  entry,
  isSelected,
  onSetRef,
  onSelect,
  onDuplicate,
  sidebarOpen,
}: PresetRowProps) {
  const workerPreviewAvailable = supportsPreviewWorkerRendering();
  const rowElementRef = useRef<HTMLDivElement | null>(null);
  const [thumbnailVisible, setThumbnailVisible] = useState(workerPreviewAvailable);
  const setElementRef = useCallback(
    (node: HTMLDivElement | null) => {
      rowElementRef.current = node;
      onSetRef(entry.key, node);
    },
    [entry.key, onSetRef],
  );
  useEffect(() => {
    if (!sidebarOpen) {
      setThumbnailVisible(false);
      return;
    }
    if (workerPreviewAvailable) return;
    const row = rowElementRef.current;
    if (!row) return;
    if (typeof IntersectionObserver === 'undefined') {
      setThumbnailVisible(true);
      return;
    }
    const root = row.closest<HTMLElement>('[data-slot="scroll-area-viewport"]');
    const observer = new IntersectionObserver(
      ([intersection]) => setThumbnailVisible(intersection?.isIntersecting ?? false),
      { root, rootMargin: '120px' },
    );
    observer.observe(row);
    return () => observer.disconnect();
  }, [sidebarOpen, workerPreviewAvailable]);
  const { dataUrl: thumbnail, isLoading: thumbnailLoading } = usePresetThumbnail(
    entry.document,
    sidebarOpen && workerPreviewAvailable && thumbnailVisible,
  );

  return (
    <div
      ref={setElementRef}
      data-testid="preset-library-row"
      className={cn(
        'group relative flex items-center rounded-lg text-left',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
      )}
    >
      <button
        type="button"
        className="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2 py-1 pr-9 text-left"
        onClick={() => onSelect(entry.key)}
      >
        <span
          className="bg-muted/40 relative aspect-video block h-9 w-auto shrink-0 overflow-hidden rounded-sm"
          data-testid={thumbnailLoading ? 'preset-thumbnail-loading' : undefined}
        >
          {thumbnail && <img src={thumbnail} alt="" className="h-full w-full object-cover" draggable={false} />}
          {thumbnailLoading && (
            <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
              <PastelDotLoader size="md" />
            </span>
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
          <span className="flex w-full items-center gap-1.5 text-sm font-medium">
            <span className="min-w-0 flex-1 truncate">{entry.document.name}</span>
            {entry.dirty && <UnsavedChangesDot size="sm" />}
          </span>
          {entry.document.metadata?.badges && entry.document.metadata.badges.length > 0 && (
            <span className="flex w-full min-w-0 flex-wrap gap-1">
              {entry.document.metadata.badges.map((badge) => (
                <span
                  key={badge}
                  className="bg-muted text-muted-foreground inline-flex max-w-full items-center rounded-sm px-1 py-0.5 text-[9px] font-semibold tracking-widest uppercase"
                >
                  {badge}
                </span>
              ))}
            </span>
          )}
        </span>
      </button>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-1 -translate-y-1/2 cursor-pointer opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate(entry.key);
            }}
            aria-label={`Duplicate ${entry.document.name}`}
          >
            <Layers2 className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left" className="z-[70]">
          Duplicate
        </TooltipContent>
      </Tooltip>
    </div>
  );
});
