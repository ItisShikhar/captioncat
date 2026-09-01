import { ArrowRight, Check, ChevronDown, Link2, Upload } from 'lucide-react';
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  useContext,
  type ChangeEvent,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import type { CaptionDebugPropertyOverride } from '@captioncat/caption-engine/browser';
import { getComponentDescription, getFieldMeta } from '@/schema';
import type { EcsComponentDoc, LeafDefinition, PropertyNode, PropertyValueType } from '@/schema';
import { DEFAULT_PAINT_CAPABILITIES, normalizePaint, solidPaint, type Paint } from '@/schema/paint';
import { PastelDotLoader } from '@/ui/components/pastel-dot-loader';
import { PaintField } from '@/ui/controls/color-field';
import { DependentSetting } from '@/ui/controls/dependent-setting';
import { FieldRow, humanizeFieldKey } from '@/ui/controls/field-row';
import { InfoTooltip } from '@/ui/controls/info-tooltip';
import { propertyLockFromMetadata, type PropertyLockState } from '@/ui/controls/property-lock';
import { CollapsibleCard, headerIconForComponent } from '@/ui/panels/property-tree-view';
import { Button } from '@/ui/shadcn/button';
import { Input } from '@/ui/shadcn/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/shadcn/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/shadcn/select';
import {
  DEFAULT_IMAGE_COLOR,
  IMAGE_ASPECT_RATIO_MODES,
  IMAGE_CUSTOM_ASPECT_RATIOS,
  IMAGE_COLOR_MODES,
  IMAGE_RENDER_ORDERS,
  normalizeImageCustomAspectRatio,
  normalizeImageAspectRatio,
  normalizeImageRenderOrder,
  type ImageAspectRatio,
  type ImageCustomAspectRatio,
  type ImageColorMode,
  type ImageRenderOrder,
} from '@captioncat/caption-engine/browser';
import {
  BUILTIN_IMAGE_ASSET_DEFINITIONS,
  builtinImageDefinition,
  builtinImageSvg,
  DEFAULT_BUNDLED_IMAGE_ASSET,
  normalizeImageAssetSource,
  type BuiltinImageAssetDefinition,
  type ImageAssetSource,
} from '@captioncat/caption-engine/browser';
import { AnimationTrackLabelExtra } from '../shared/animation-track-button';
import { PropertyAffordanceLabelExtra } from '../shared/property-affordance-label-extra';
import { StateApplySuggestionContext } from './state-apply-suggestion-context';
import {
  AssetLibraryDrawer,
  BuiltinAssetIcon,
  curatedBundledAssetDefinitions,
  useRecentImageAssets,
} from './image-asset-library';
import type { ResolvedMarkerImageStyle } from './marker-style-source';

function leafValue(node: PropertyNode | undefined, fallback: string): string {
  return node?.kind === 'leaf' && typeof node.value === 'string' ? node.value : fallback;
}

const COLOR_MODE_OPTIONS: readonly (readonly [ImageColorMode, string])[] = [
  ['original', 'Original'],
  ['tint', 'Tint'],
  ['solid', 'Solid'],
];

const ASPECT_RATIO_OPTIONS: readonly (readonly [ImageAspectRatio, string])[] = [
  ['maintain', 'Maintain'],
  ['stretchToFit', 'Stretch to fit'],
  ['custom', 'Custom'],
];

const CUSTOM_ASPECT_RATIO_OPTIONS: readonly (readonly [ImageCustomAspectRatio, string])[] = [
  ['9:16', '9:16'],
  ['16:9', '16:9'],
  ['1:1', '1:1'],
  ['4:3', '4:3'],
  ['3:4', '3:4'],
];

const RENDER_ORDER_OPTIONS: readonly (readonly [ImageRenderOrder, string])[] = [
  ['belowChildren', 'Below children'],
  ['aboveChildren', 'Above children'],
];

const COLOR_MODE_EXAMPLE_ASSET = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 120">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffcf70"/>
        <stop offset="1" stop-color="#ef476f"/>
      </linearGradient>
      <linearGradient id="land" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#118ab2"/>
        <stop offset="1" stop-color="#073b4c"/>
      </linearGradient>
    </defs>
    <path d="M18 90 54 48l22 24 25-34 61 52v12H18Z" fill="url(#land)"/>
    <circle cx="48" cy="38" r="18" fill="url(#sky)"/>
    <path d="M18 96h144v12H18Z" fill="#06d6a0"/>
  </svg>
`)}`;

const COLOR_MODE_EXAMPLE_PAINT = solidPaint('#7c5cff');

const COLOR_MODE_HELP: readonly {
  mode: ImageColorMode;
  label: string;
  description: string;
}[] = [
  { mode: 'original', label: 'Original', description: 'Keeps the image colors.' },
  { mode: 'tint', label: 'Tint', description: 'Blends Color with the source shading.' },
  { mode: 'solid', label: 'Solid', description: 'Uses the image shape as a flat Color mask.' },
];

function setStringLeaf(component: EcsComponentDoc, key: string, value: string): EcsComponentDoc {
  const previous = component.props[key];
  return {
    ...component,
    props: {
      ...component.props,
      [key]:
        previous?.kind === 'leaf' ? { ...previous, type: 'string', value } : { kind: 'leaf', type: 'string', value },
    },
  };
}

function setBooleanLeaf(component: EcsComponentDoc, key: string, value: boolean): EcsComponentDoc {
  const previous = component.props[key];
  return {
    ...component,
    props: {
      ...component.props,
      [key]: previous?.kind === 'leaf' ? { ...previous, type: 'boolean', value } : { kind: 'leaf', type: 'boolean', value },
    },
  };
}

function paintValue(node: PropertyNode | undefined, fallback: Paint): Paint {
  return node?.kind === 'leaf' && node.type === 'paint' ? normalizePaint(node.value, fallback) : fallback;
}

function setPaintLeaf(component: EcsComponentDoc, key: string, value: Paint): EcsComponentDoc {
  const previous = component.props[key];
  return {
    ...component,
    props: {
      ...component.props,
      [key]: previous?.kind === 'leaf' ? { ...previous, type: 'paint', value } : { kind: 'leaf', type: 'paint', value },
    },
  };
}

function setLeafConfig(
  component: EcsComponentDoc,
  key: string,
  type: PropertyValueType,
  fallbackValue: unknown,
  patch: Pick<LeafDefinition, 'randomizer' | 'transition'>,
): EcsComponentDoc {
  const previous = component.props[key];
  return {
    ...component,
    props: {
      ...component.props,
      [key]:
        previous?.kind === 'leaf'
          ? { ...previous, ...patch }
          : { kind: 'leaf', type, value: fallbackValue, ...patch },
    },
  };
}

function imageAssetSource(component: EcsComponentDoc, bundledAsset: string): ImageAssetSource {
  const source = component.props.assetSource;
  return normalizeImageAssetSource(source?.kind === 'leaf' ? source.value : undefined, bundledAsset);
}

function customAssetIndicator(asset: string): string {
  if (!asset.trim()) return 'Custom';
  return asset.trim().startsWith('data:') ? 'Custom · Upload' : 'Custom · URL';
}

type CustomImageLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded' }
  | { status: 'error'; message: string };

function useCustomImageLoadState(source: ImageAssetSource, asset: string, attempt: number): CustomImageLoadState {
  const [state, setState] = useState<CustomImageLoadState>({ status: 'idle' });

  useEffect(() => {
    const value = asset.trim();
    if (source !== 'custom' || !value) {
      setState({ status: 'idle' });
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      setState({ status: 'error', message: 'Enter a valid image URL.' });
      return;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && parsed.protocol !== 'data:') {
      setState({ status: 'error', message: 'Use an http(s) image URL or upload an image.' });
      return;
    }

    setState({ status: 'loading' });
    let cancelled = false;
    const image = new window.Image();
    image.onload = () => {
      if (!cancelled) setState({ status: 'loaded' });
    };
    image.onerror = () => {
      if (!cancelled)
        setState({ status: 'error', message: 'Could not load this image. Check the source and try again.' });
    };
    image.src = value;

    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [asset, attempt, source]);

  return state;
}

const IMAGE_PREVIEW_BACKGROUND_STYLE = {
  backgroundColor: 'var(--canvas-grid-fill)',
  backgroundImage:
    'linear-gradient(45deg, var(--canvas-grid-line) 25%, transparent 25%, transparent 75%, var(--canvas-grid-line) 75%), linear-gradient(45deg, var(--canvas-grid-line) 25%, transparent 25%, transparent 75%, var(--canvas-grid-line) 75%)',
  backgroundPosition: '0 0, 8px 8px',
  backgroundSize: '16px 16px',
};

function paintCssValue(paint: Paint): string {
  if (paint.type === 'solid') return paint.color;
  const stops = paint.stops.map((stop) => `${stop.color} ${stop.offset * 100}%`).join(', ');
  if (paint.type === 'linear-gradient') return `linear-gradient(${paint.angle}deg, ${stops})`;
  return `radial-gradient(circle at ${paint.centerX * 100}% ${paint.centerY * 100}%, ${stops})`;
}

function paintBackgroundStyle(paint: Paint): Pick<CSSProperties, 'backgroundColor' | 'backgroundImage'> {
  return paint.type === 'solid' ? { backgroundColor: paint.color } : { backgroundImage: paintCssValue(paint) };
}

function cssImageUrl(source: string): string {
  return `url("${source.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n')}")`;
}

function builtinImageDataUrl(asset: string): string {
  return `data:image/svg+xml,${encodeURIComponent(builtinImageSvg(asset))}`;
}

function CustomImagePreview({
  asset,
  colorMode,
  color,
}: {
  asset: string;
  colorMode: ImageColorMode;
  color: Paint;
}): ReactNode {
  if (colorMode === 'original') {
    return <img src={asset} alt="Custom image preview" className="max-h-full max-w-full object-contain" />;
  }

  const imageMask = cssImageUrl(asset);
  const image = <img src={asset} alt="" className="absolute inset-0 h-full w-full object-contain" />;
  const colorLayer = (
    <div
      aria-hidden="true"
      className="absolute inset-0"
      style={{
        ...paintBackgroundStyle(color),
        maskImage: imageMask,
        maskPosition: 'center',
        maskRepeat: 'no-repeat',
        maskSize: 'contain',
        WebkitMaskImage: imageMask,
        WebkitMaskPosition: 'center',
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskSize: 'contain',
      }}
    />
  );

  if (colorMode === 'tint') {
    return (
      <div role="img" aria-label="Custom image preview" className="relative isolate h-full w-full">
        {image}
        <div className="absolute inset-0 mix-blend-multiply">{colorLayer}</div>
      </div>
    );
  }

  return (
    <div role="img" aria-label="Custom image preview" className="relative h-full w-full">
      {colorLayer}
    </div>
  );
}

function ColorModeExamplePreview({ mode }: { mode: ImageColorMode }): ReactNode {
  return (
    <div className="bg-background/10 flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded border border-background/20">
      <CustomImagePreview asset={COLOR_MODE_EXAMPLE_ASSET} colorMode={mode} color={COLOR_MODE_EXAMPLE_PAINT} />
    </div>
  );
}

function ColorModeHelp(): ReactNode {
  return (
    <div className="w-[23rem] max-w-[calc(100vw-2rem)] space-y-3">
      <div>
        <div className="font-semibold">Color Mode</div>
        <p className="mt-1 text-background/75">See how Color changes the example image.</p>
      </div>
      <div className="grid grid-cols-[3.5rem_1fr] items-center gap-x-2 gap-y-2">
        <div className="text-background/60 text-[10px] font-semibold tracking-wide uppercase">Input</div>
        <div className="text-background/60 text-[10px] font-semibold tracking-wide uppercase">Output</div>
        {COLOR_MODE_HELP.map(({ mode, label, description }) => (
          <Fragment key={mode}>
            <ColorModeExamplePreview mode="original" />
            <div className="flex min-w-0 items-center gap-2">
              <ArrowRight className="size-3.5 shrink-0 text-background/60" aria-hidden="true" />
              <ColorModeExamplePreview mode={mode} />
              <div className="min-w-0">
                <div className="font-medium">{label}</div>
                <div className="text-background/70 text-[10px] leading-tight">{description}</div>
              </div>
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function ImageAssetPreview({
  source,
  bundledAsset,
  customAsset,
  customImageState,
  onRetry,
  colorMode,
  color,
  disabled = false,
}: {
  source: ImageAssetSource;
  bundledAsset: string;
  customAsset: string;
  customImageState: CustomImageLoadState;
  onRetry: () => void;
  colorMode: ImageColorMode;
  color: Paint;
  disabled?: boolean;
}): ReactNode {
  let content: ReactNode;
  if (source === 'bundled') {
    content =
      colorMode === 'original' ? (
        <span aria-label="Bundled image preview" className="text-5xl leading-none">
          <BuiltinAssetIcon asset={bundledAsset} />
        </span>
      ) : (
        <CustomImagePreview asset={builtinImageDataUrl(bundledAsset)} colorMode={colorMode} color={color} />
      );
  } else if (customImageState.status === 'loading') {
    content = (
      <div className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
        <PastelDotLoader size="md" />
        Loading
      </div>
    );
  } else if (customImageState.status === 'error') {
    content = <span className="text-destructive text-xs font-medium">Unable to load image</span>;
  } else if (customImageState.status === 'loaded') {
    content = <CustomImagePreview asset={customAsset.trim()} colorMode={colorMode} color={color} />;
  } else {
    content = <span className="text-muted-foreground text-xs">No custom image selected</span>;
  }

  return (
    <div className="space-y-2">
      <div
        aria-live="polite"
        aria-disabled={disabled}
        className={cn(
          'flex h-24 w-full items-center justify-center overflow-hidden rounded-md border p-3',
          disabled && 'pointer-events-none opacity-50',
        )}
        style={IMAGE_PREVIEW_BACKGROUND_STYLE}
      >
        {content}
      </div>
      {customImageState.status === 'error' && !disabled && (
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={onRetry}>
          Try Again
        </Button>
      )}
    </div>
  );
}

export function BundledAssetPicker({
  value,
  onChange,
  disabled = false,
  source = 'bundled',
  customLabel,
  customContent,
  onCustomSelect,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  source?: ImageAssetSource;
  customLabel?: string;
  customContent?: ReactNode;
  onCustomSelect?: () => void;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const { recentAssets, rememberAsset } = useRecentImageAssets();
  const selected =
    builtinImageDefinition(value) ??
    builtinImageDefinition(DEFAULT_BUNDLED_IMAGE_ASSET) ??
    BUILTIN_IMAGE_ASSET_DEFINITIONS[0];
  const curatedDefinitions = useMemo(() => curatedBundledAssetDefinitions(), []);
  const recentDefinitions = useMemo(
    () =>
      recentAssets
        .map((asset) => builtinImageDefinition(asset))
        .filter((definition): definition is BuiltinImageAssetDefinition => definition !== undefined),
    [recentAssets],
  );

  useEffect(() => {
    if (disabled) {
      setOpen(false);
      setLibraryOpen(false);
    }
  }, [disabled]);

  const selectAsset = (asset: string): void => {
    rememberAsset(asset);
    onChange(asset);
    setOpen(false);
  };

  const renderCompactGrid = (definitions: readonly BuiltinImageAssetDefinition[]): ReactNode => (
    <div className="grid grid-cols-3 gap-1">
      {definitions.map((definition) => {
        const active = source === 'bundled' && definition.id === selected.id;
        return (
          <button
            key={definition.id}
            type="button"
            aria-label={definition.name}
            aria-pressed={active}
            disabled={disabled}
            className={cn(
              'relative flex min-w-0 flex-col items-center gap-0.5 rounded-md px-1 py-1.5 text-center text-xs transition-colors',
              'hover:bg-accent hover:text-accent-foreground',
              active && 'bg-accent text-accent-foreground',
            )}
            onClick={() => selectAsset(definition.id)}
          >
            <BuiltinAssetIcon asset={definition.id} className="text-2xl" />
            <span className="w-full truncate text-[10px]">{definition.name}</span>
            {active && <Check className="text-primary absolute top-1 right-1 size-3" />}
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-8 w-full justify-between px-2.5 font-normal"
            disabled={disabled}
          >
            <span className="flex min-w-0 items-center gap-2">
              {source === 'custom' ? (
                <Link2 className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <BuiltinAssetIcon asset={selected.id} className="text-base" />
              )}
              <span className="truncate">{source === 'custom' ? (customLabel ?? 'Custom asset') : selected.name}</span>
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="center"
          collisionPadding={16}
          className="w-[var(--radix-popper-anchor-width)] max-w-[calc(100vw-2rem)] min-w-0 p-2 sm:min-w-72"
        >
          <div className="space-y-3">
            {recentDefinitions.length > 0 && (
              <section>
                <h3 className="text-muted-foreground mb-1.5 px-1 text-[10px] font-semibold tracking-[0.16em] uppercase">
                  Recently Used
                </h3>
                {renderCompactGrid(recentDefinitions)}
              </section>
            )}
            <section>
              <div className="mb-1.5 flex items-center justify-between px-1">
                <h3 className="text-muted-foreground text-[10px] font-semibold tracking-[0.16em] uppercase">Bundled</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 shrink-0 gap-1 px-1 text-[10px] font-semibold"
                  onClick={() => {
                    setOpen(false);
                    setLibraryOpen(true);
                  }}
                >
                  Browse all
                  <ChevronDown className="size-3 -rotate-90" />
                </Button>
              </div>
              {renderCompactGrid(curatedDefinitions)}
            </section>
            {customContent && (
              <section className="border-t pt-2">
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground mb-1.5 px-1 text-[10px] font-semibold tracking-[0.16em] uppercase"
                  onClick={onCustomSelect}
                >
                  Custom
                </button>
                {customContent}
              </section>
            )}
          </div>
        </PopoverContent>
      </Popover>
      <AssetLibraryDrawer
        open={libraryOpen}
        value={source === 'bundled' ? value : ''}
        disabled={disabled}
        onOpenChange={setLibraryOpen}
        onSelect={selectAsset}
      />
    </>
  );
}

export function ImageEditor({
  component,
  onUpdate,
  stateKey,
  headerExtra,
  effectsFooter,
  styleOverride,
  imageAssetOverride,
  resolvedPropertyOverrides,
  allowDisable = true,
  showRenderOrder = true,
}: {
  component: EcsComponentDoc;
  onUpdate: (updater: (previous: EcsComponentDoc) => EcsComponentDoc) => void;
  stateKey: string;
  headerExtra?: ReactNode;
  effectsFooter?: ReactNode;
  styleOverride?: ResolvedMarkerImageStyle | null;
  imageAssetOverride?: EcsComponentDoc;
  resolvedPropertyOverrides?: Readonly<Record<string, CaptionDebugPropertyOverride>>;
  allowDisable?: boolean;
  showRenderOrder?: boolean;
}): ReactNode {
  const stateApplySuggestion = useContext(StateApplySuggestionContext);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bundledAsset = leafValue(component.props.asset, DEFAULT_BUNDLED_IMAGE_ASSET);
  const metadataFor = (key: string) => resolvedPropertyOverrides?.[`image.${key}`];
  const resolvedString = (key: string, fallback: string): string => {
    const value = metadataFor(key)?.value;
    return typeof value === 'string' ? value : fallback;
  };
  const resolvedPaint = (key: string, fallback: Paint): Paint =>
    normalizePaint(metadataFor(key)?.value ?? fallback, fallback);
  const localSource = imageAssetSource(component, bundledAsset);
  const source = resolvedString('assetSource', localSource) as ImageAssetSource;
  const customAsset = leafValue(component.props.customAsset, '');
  const displayedBundledAsset = resolvedString('asset', bundledAsset);
  const displayedCustomAsset = resolvedString('customAsset', customAsset);
  const localColorMode = leafValue(component.props.colorMode, 'tint');
  const normalizedLocalColorMode = (IMAGE_COLOR_MODES as readonly string[]).includes(localColorMode)
    ? (localColorMode as ImageColorMode)
    : 'tint';
  const colorModeMetadata = metadataFor('colorMode');
  const colorMetadata = metadataFor('color');
  const colorMode = colorModeMetadata
    ? (resolvedString('colorMode', normalizedLocalColorMode) as ImageColorMode)
    : (styleOverride?.colorMode ?? normalizedLocalColorMode);
  const authoredAspectRatio = leafValue(component.props.aspectRatio, 'maintain');
  const localAspectRatio = normalizeImageAspectRatio(authoredAspectRatio);
  const localCustomAspectRatio = normalizeImageCustomAspectRatio(
    leafValue(component.props.customAspectRatio, authoredAspectRatio),
  );
  const aspectRatioMetadata = metadataFor('aspectRatio');
  const customAspectRatioMetadata = metadataFor('customAspectRatio');
  const aspectRatio = normalizeImageAspectRatio(
    aspectRatioMetadata ? resolvedString('aspectRatio', localAspectRatio) : localAspectRatio,
  );
  const customAspectRatio = normalizeImageCustomAspectRatio(
    customAspectRatioMetadata
      ? resolvedString('customAspectRatio', localCustomAspectRatio)
      : localCustomAspectRatio,
  );
  const authoredRenderOrder = normalizeImageRenderOrder(leafValue(component.props.renderOrder, 'belowChildren'));
  const renderOrderMetadata = metadataFor('renderOrder');
  const renderOrder = normalizeImageRenderOrder(
    renderOrderMetadata ? resolvedString('renderOrder', authoredRenderOrder) : authoredRenderOrder,
  );
  const color = colorMetadata
    ? resolvedPaint('color', solidPaint(DEFAULT_IMAGE_COLOR))
    : (styleOverride?.color ?? paintValue(component.props.color, solidPaint(DEFAULT_IMAGE_COLOR)));
  const styleIsInherited = styleOverride !== null && styleOverride !== undefined;
  const isImageAssetOverridden = imageAssetOverride !== undefined;
  const resolvedAssetLock =
    propertyLockFromMetadata(metadataFor('asset')) ??
    propertyLockFromMetadata(metadataFor('customAsset')) ??
    propertyLockFromMetadata(metadataFor('assetSource'));
  const assetLock: PropertyLockState | null = resolvedAssetLock ?? (isImageAssetOverridden
    ? {
        locked: true,
        value: source,
        override: { source: humanizeFieldKey(imageAssetOverride.component), type: 'component' },
      }
    : null);
  const colorModeLock: PropertyLockState | null = propertyLockFromMetadata(colorModeMetadata) ?? (styleIsInherited
    ? {
        locked: true,
        value: colorMode,
        override: { source: styleOverride?.sourceLabel ?? 'Marker Style', type: 'inherited' },
      }
    : null);
  const aspectRatioLock = propertyLockFromMetadata(aspectRatioMetadata);
  const customAspectRatioLock = propertyLockFromMetadata(customAspectRatioMetadata);
  const renderOrderLock = propertyLockFromMetadata(renderOrderMetadata);
  const colorLock: PropertyLockState | null = propertyLockFromMetadata(colorMetadata) ?? (styleIsInherited
    ? {
        locked: true,
        value: color,
        override: { source: styleOverride?.sourceLabel ?? 'Marker Style', type: 'inherited' },
      }
    : null);
  const [customUrlDraft, setCustomUrlDraft] = useState(displayedCustomAsset);
  const authoredEnabled =
    component.props.enabled?.kind === 'leaf' && component.props.enabled.type === 'boolean'
      ? component.props.enabled.value !== false
      : true;
  const enabledMetadata = metadataFor('enabled');
  const enabled = typeof enabledMetadata?.value === 'boolean' ? enabledMetadata.value : authoredEnabled;
  const enabledLock = propertyLockFromMetadata(enabledMetadata);
  const [validationAttempt, setValidationAttempt] = useState(0);
  const customImageState = useCustomImageLoadState(source, displayedCustomAsset, validationAttempt);

  useEffect(() => {
    setCustomUrlDraft(displayedCustomAsset);
  }, [displayedCustomAsset]);

  const setAssetSource = (value: ImageAssetSource) =>
    onUpdate((previous) => setStringLeaf(previous, 'assetSource', value));
  const setBundledAsset = (value: string) => onUpdate((previous) => setStringLeaf(previous, 'asset', value));
  const setCustomAsset = (value: string) => onUpdate((previous) => setStringLeaf(previous, 'customAsset', value));
  const setColorMode = (value: ImageColorMode) => onUpdate((previous) => setStringLeaf(previous, 'colorMode', value));
  const setAspectRatio = (value: ImageAspectRatio) => onUpdate((previous) => setStringLeaf(previous, 'aspectRatio', value));
  const setCustomAspectRatio = (value: ImageCustomAspectRatio) =>
    onUpdate((previous) => setStringLeaf(previous, 'customAspectRatio', value));
  const setRenderOrder = (value: ImageRenderOrder) => onUpdate((previous) => setStringLeaf(previous, 'renderOrder', value));
  const setColor = (value: Paint) => onUpdate((previous) => setPaintLeaf(previous, 'color', value));
  const setRandomizer = (
    key: string,
    type: PropertyValueType,
    fallbackValue: unknown,
    randomizer: LeafDefinition['randomizer'],
  ) => onUpdate((previous) => setLeafConfig(previous, key, type, fallbackValue, { randomizer }));
  const setTransition = (key: string, type: PropertyValueType, fallbackValue: unknown, transition: LeafDefinition['transition']) => {
    const shared = transition?.scope !== 'state';
    const stateApplied =
      shared && stateApplySuggestion?.applyTransitionToStates({ scopeKey: stateKey, propertyPath: [key] }, transition);
    if (stateApplied) return;
    onUpdate((previous) => setLeafConfig(previous, key, type, fallbackValue, { transition }));
  };

  const commitCustomUrl = () => {
    setCustomAsset(customUrlDraft);
    setValidationAttempt((attempt) => attempt + 1);
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => toast.error(`Could not read ${file.name}.`);
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        toast.error(`Could not read ${file.name}.`);
        return;
      }
      setCustomUrlDraft(reader.result);
      setCustomAsset(reader.result);
      setValidationAttempt((attempt) => attempt + 1);
    };
    reader.readAsDataURL(file);
  };

  return (
    <CollapsibleCard
      title="Image"
      titleHelp={getComponentDescription('image')}
      titleIcon={headerIconForComponent('image')}
      stateKey={stateKey}
      compactHeader
      headerExtra={headerExtra}
      enabled={allowDisable ? enabled : undefined}
      onEnabledChange={allowDisable ? (value) => onUpdate((previous) => setBooleanLeaf(previous, 'enabled', value)) : undefined}
      enabledLock={allowDisable ? enabledLock : null}
    >
      <div className="space-y-3">
        {imageAssetOverride && (
          <div className="text-muted-foreground flex items-center gap-1 pt-2 px-1 text-[10px]">
            <span aria-hidden="true" className="bg-muted-foreground/60 size-1.5 rounded-full" />
            Overridden by {humanizeFieldKey(imageAssetOverride.component)}
          </div>
        )}
        <ImageAssetPreview
          source={source}
          bundledAsset={displayedBundledAsset}
          customAsset={displayedCustomAsset}
          customImageState={customImageState}
          onRetry={() => setValidationAttempt((attempt) => attempt + 1)}
          colorMode={colorMode}
          color={color}
          disabled={assetLock?.locked === true}
        />
        <FieldRow
          label="Asset"
          description="Choose a bundled asset, upload a file, or load an image from a URL."
          className="py-0"
          lock={assetLock}
        >
          <BundledAssetPicker
            value={displayedBundledAsset}
            source={source}
            customLabel={customAssetIndicator(displayedCustomAsset)}
            onChange={(value) => {
              setAssetSource('bundled');
              setBundledAsset(value);
            }}
            onCustomSelect={() => setAssetSource('custom')}
            disabled={assetLock?.locked === true}
            customContent={
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={assetLock?.locked === true}
                  onClick={() => {
                    setAssetSource('custom');
                    fileInputRef.current?.click();
                  }}
                >
                  <Upload className="size-3.5" />
                  Upload Image
                </Button>
                <div className="text-muted-foreground flex items-center gap-2 px-1 text-[10px] uppercase tracking-widest">
                  <span className="bg-border h-px flex-1" />
                  <span>or</span>
                  <span className="bg-border h-px flex-1" />
                </div>
                <FieldRow label="Image URL" className="py-0">
                  <Input
                    value={customUrlDraft}
                    onChange={(event) => setCustomUrlDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        setAssetSource('custom');
                        commitCustomUrl();
                      }
                    }}
                    className="h-8 text-xs"
                    placeholder="https://..."
                    disabled={assetLock?.locked === true}
                  />
                </FieldRow>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={assetLock?.locked === true || !customUrlDraft.trim()}
                  onClick={() => {
                    setAssetSource('custom');
                    commitCustomUrl();
                  }}
                >
                  {customImageState.status === 'loading' ? (
                    <PastelDotLoader size="sm" />
                  ) : (
                    <Link2 className="size-3.5" />
                  )}
                  Load Image
                </Button>
                <div className="text-muted-foreground flex items-center gap-1 px-1 text-[10px]">
                  <span>{customAssetIndicator(displayedCustomAsset)}</span>
                  {customImageState.status === 'loaded' && <span aria-label="Image loaded">· Ready</span>}
                </div>
                {customImageState.status === 'error' && (
                  <p role="alert" className="text-destructive px-1 text-xs">
                    {customImageState.message}
                  </p>
                )}
              </div>
            }
          />
        </FieldRow>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.svg"
          className="hidden"
          disabled={assetLock?.locked === true}
          onChange={onFileChange}
        />
        <PropertyAffordanceLabelExtra
          fieldKey="colorMode"
          randomizer={{
            label: 'Color Mode',
            leafType: 'string',
            currentValue: colorMode,
            randomizer: component.props.colorMode?.kind === 'leaf' ? component.props.colorMode.randomizer : undefined,
            onChange: (next) => setRandomizer('colorMode', 'string', colorMode, next),
            meta: getFieldMeta('colorMode'),
          }}
          transition={{
            label: 'Color Mode',
            transition: component.props.colorMode?.kind === 'leaf' ? component.props.colorMode.transition : undefined,
            currentValue: colorMode,
            onChange: (next) => setTransition('colorMode', 'string', colorMode, next),
          }}
        >
          <FieldRow
            label="Color Mode"
            className="py-0"
            lock={colorModeLock}
            labelExtra={
              <InfoTooltip ariaLabel="Explain Color Mode" side="top" contentClassName="max-w-none p-3">
                <ColorModeHelp />
              </InfoTooltip>
            }
          >
          <Select
            value={colorMode}
            onValueChange={(value) => {
              if ((IMAGE_COLOR_MODES as readonly string[]).includes(value)) setColorMode(value as ImageColorMode);
            }}
            disabled={colorModeLock?.locked === true}
          >
            <SelectTrigger className="h-8 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COLOR_MODE_OPTIONS.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          </FieldRow>
        </PropertyAffordanceLabelExtra>
        <PropertyAffordanceLabelExtra
          randomizer={{
            label: 'Aspect Ratio',
            leafType: 'string',
            currentValue: aspectRatio,
            randomizer: component.props.aspectRatio?.kind === 'leaf' ? component.props.aspectRatio.randomizer : undefined,
            onChange: (next) => setRandomizer('aspectRatio', 'string', aspectRatio, next),
            meta: getFieldMeta('aspectRatio'),
          }}
          transition={{
            label: 'Aspect Ratio',
            transition: component.props.aspectRatio?.kind === 'leaf' ? component.props.aspectRatio.transition : undefined,
            currentValue: aspectRatio,
            onChange: (next) => setTransition('aspectRatio', 'string', aspectRatio, next),
          }}
        >
          <FieldRow
            label="Aspect Ratio"
            description="Maintain preserves the source ratio. Stretch to fit fills the image box. Custom uses the selected ratio."
            className="py-0"
            lock={aspectRatioLock}
          >
          <Select
            value={aspectRatio}
            onValueChange={(value) => {
              if ((IMAGE_ASPECT_RATIO_MODES as readonly string[]).includes(value)) setAspectRatio(value as ImageAspectRatio);
            }}
            disabled={aspectRatioLock?.locked === true}
          >
            <SelectTrigger className="h-8 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASPECT_RATIO_OPTIONS.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          </FieldRow>
        </PropertyAffordanceLabelExtra>
        {aspectRatio === 'custom' && (
          <DependentSetting>
            <PropertyAffordanceLabelExtra
              randomizer={{
                label: 'Custom Ratio',
                leafType: 'string',
                currentValue: customAspectRatio,
                randomizer:
                  component.props.customAspectRatio?.kind === 'leaf'
                    ? component.props.customAspectRatio.randomizer
                    : undefined,
                onChange: (next) => setRandomizer('customAspectRatio', 'string', customAspectRatio, next),
                meta: getFieldMeta('customAspectRatio'),
              }}
              transition={{
                label: 'Custom Ratio',
                transition:
                  component.props.customAspectRatio?.kind === 'leaf'
                    ? component.props.customAspectRatio.transition
                    : undefined,
                currentValue: customAspectRatio,
                onChange: (next) => setTransition('customAspectRatio', 'string', customAspectRatio, next),
              }}
            >
              <FieldRow
                label="Custom Ratio"
                description="Choose the width-to-height ratio used when Aspect Ratio is Custom."
                className="py-0"
                lock={customAspectRatioLock}
              >
                <Select
                  value={customAspectRatio}
                  onValueChange={(value) => {
                    if ((IMAGE_CUSTOM_ASPECT_RATIOS as readonly string[]).includes(value)) {
                      setCustomAspectRatio(value as ImageCustomAspectRatio);
                    }
                  }}
                  disabled={customAspectRatioLock?.locked === true}
                >
                  <SelectTrigger className="h-8 w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CUSTOM_ASPECT_RATIO_OPTIONS.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>
            </PropertyAffordanceLabelExtra>
          </DependentSetting>
        )}
        {showRenderOrder && (
          <PropertyAffordanceLabelExtra
            randomizer={{
              label: 'Render Order',
              leafType: 'string',
              currentValue: renderOrder,
              randomizer: component.props.renderOrder?.kind === 'leaf' ? component.props.renderOrder.randomizer : undefined,
              onChange: (next) => setRandomizer('renderOrder', 'string', renderOrder, next),
              meta: getFieldMeta('renderOrder'),
            }}
            transition={{
              label: 'Render Order',
              transition: component.props.renderOrder?.kind === 'leaf' ? component.props.renderOrder.transition : undefined,
              currentValue: renderOrder,
              onChange: (next) => setTransition('renderOrder', 'string', renderOrder, next),
            }}
          >
            <FieldRow
              label="Render Order"
              description="Choose whether the image paints before or after this entity's children."
              className="py-0"
              lock={renderOrderLock}
            >
              <Select
                value={renderOrder}
                onValueChange={(value) => {
                  if ((IMAGE_RENDER_ORDERS as readonly string[]).includes(value)) {
                    setRenderOrder(value as ImageRenderOrder);
                  }
                }}
                disabled={renderOrderLock?.locked === true}
              >
                <SelectTrigger className="h-8 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RENDER_ORDER_OPTIONS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
          </PropertyAffordanceLabelExtra>
        )}
        {colorMode !== 'original' && (
          <DependentSetting>
            <PropertyAffordanceLabelExtra
              randomizer={{
                label: 'Color',
                leafType: 'paint',
                currentValue: color,
                randomizer: component.props.color?.kind === 'leaf' ? component.props.color.randomizer : undefined,
                onChange: (next) => setRandomizer('color', 'paint', color, next),
                meta: getFieldMeta('color'),
                paintCapabilities: DEFAULT_PAINT_CAPABILITIES,
              }}
              transition={{
                label: 'Color',
                transition: component.props.color?.kind === 'leaf' ? component.props.color.transition : undefined,
                currentValue: color,
                onChange: (next) => setTransition('color', 'paint', color, next),
              }}
            >
              <AnimationTrackLabelExtra scopeKey={stateKey} propertyPath={['color']}>
                <PaintField
                  label="Color"
                  value={color}
                  onChange={setColor}
                  capabilities={DEFAULT_PAINT_CAPABILITIES}
                  variant="fill"
                  disabled={colorLock?.locked === true}
                  lock={colorLock}
                />
              </AnimationTrackLabelExtra>
            </PropertyAffordanceLabelExtra>
          </DependentSetting>
        )}
        {styleOverride && (
          <div className="text-muted-foreground px-1 text-[10px]">Inherited from {styleOverride.sourceLabel}</div>
        )}
      </div>
      {effectsFooter}
    </CollapsibleCard>
  );
}
