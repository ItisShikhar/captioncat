import {
  DEFAULT_BACKGROUND_ID,
  DEFAULT_GRADIENT_BACKGROUND_PAINT,
  DEFAULT_SOLID_BACKGROUND_COLOR,
  DEFAULT_STORY_ID,
  STATE_PREVIEW_STORY_ID,
} from './preview/data';

// Timeline scrubbing behavior.
export const scrub = {
  // Pointer distance required before scrubbing starts.
  startThreshold: 4,
  // Pointer distance represented by one value step.
  pixelsPerStep: 4,
} as const;

// Shared input timing behavior.
export const input = {
  // Delay before debounced input work runs.
  debounceMs: 250,
} as const;

// Preview render timing by execution path.
export const previewRenderTiming = {
  worker: {
    // Worker rendering does not block the main thread, so it can start immediately.
    debounceMs: 250,
    startupFrameCount: 2,
    queueFrameCount: 0,
  },
  nonWorker: {
    // Keep the existing main-thread protection when Worker rendering is unavailable.
    debounceMs: 250,
    startupFrameCount: 2,
    queueFrameCount: 2,
  },
} as const;

export type DebugEntityKind =
  | 'viewport'
  | 'videoArea'
  | 'video'
  | 'compositionArea'
  | 'page'
  | 'row'
  | 'word'
  | 'background'
  | 'image'
  | 'marker';

export type DebugOverlaySurface = 'live' | 'compact';

// Debug overlay defaults and the entity kinds available on each preview surface.
export const previewDebugOverlay = {
  defaults: {
    enabled: false,
    selectAll: true,
    selectPositions: false,
  },
  entityKinds: [
    'viewport',
    'videoArea',
    'video',
    'compositionArea',
    'page',
    'row',
    'word',
    'background',
    'image',
    'marker',
  ],
  surfaceEntityKinds: {
    live: [
      'viewport',
      'videoArea',
      'video',
      'compositionArea',
      'page',
      'row',
      'word',
      'background',
      'image',
      'marker',
    ],
    // Compact previews focus on caption layout, so they do not show the scene-only Composition Area.
    compact: ['page', 'row', 'word', 'background', 'image', 'marker'],
  },
} as const satisfies {
  defaults: {
    enabled: boolean;
    selectAll: boolean;
    selectPositions: boolean;
  };
  entityKinds: readonly DebugEntityKind[];
  surfaceEntityKinds: Record<DebugOverlaySurface, readonly DebugEntityKind[]>;
};

// Whether the preset library opens automatically on the initial page load.
export const openPresetSidebarOnPageLoad = false;

function createPreviewConfig() {
  const workspace = {
    // Workspace width in unscaled display pixels.
    width: 1440,
    // Workspace height in unscaled display pixels.
    height: 1000,
  } as const;
  const livePreview = {
    physicalCanvas: {
      resizable: true,
      sizeScaling: {
        '9:16': 0.85,
        '16:9': 1.6,
        '4:3': 1.25,
        '3:4': 1,
        '1:1': 1.1,
      },
    },
    renderCanvas: {
      qualityScale: { sd: 0.325, hd: 1 },
      defaultQuality: 'sd',
    },
    defaultLoop: true,
    background: {
      id: DEFAULT_BACKGROUND_ID,
      solidColor: DEFAULT_SOLID_BACKGROUND_COLOR,
      paint: DEFAULT_GRADIENT_BACKGROUND_PAINT,
    },
    defaultSpeed: 1,
    defaultLanguageId: 'en',
    storyId: DEFAULT_STORY_ID,
  } as const;
  const fullCyclePreview = {
    physicalCanvas: {
      resizable: true,
      sizeScaling: {
        '9:16': 0.85,
        '16:9': 1.5,
        '4:3': 1.25,
        '3:4': 1,
        '1:1': 1.1,
      },
    },
    renderCanvas: {
      width: 720,
      height: 405,
      qualityScale: { sd: 0.75, hd: 2 },
      defaultQuality: 'hd',
    },
    defaultLoop: false,
    background: {
      paint: { type: 'solid', color: 'transparent' },
    },
    defaultSpeed: 1,
    defaultLanguageId: 'en',
    storyId: STATE_PREVIEW_STORY_ID,
  } as const;

  const wordStatePreview = {
    physicalCanvas: {
      resizable: true,
      sizeScaling: {
        '9:16': 0.85,
        '16:9': 1.5,
        '4:3': 1.25,
        '3:4': 1,
        '1:1': 1.1,
      },
    },
    renderCanvas: {
      width: 900,
      height: 506,
      qualityScale: { sd: 0.75, hd: 1.25 },
      defaultQuality: 'hd',
    },
    defaultLoop: false,
    background: {
      paint: { type: 'solid', color: 'transparent' },
    },
    defaultSpeed: 1,
    defaultLanguageId: 'en',
    storyId: STATE_PREVIEW_STORY_ID,
  } as const;

  const minZoom = 0.2;
  const maxZoom = 8;
  return {
    live: livePreview,
    fullCyclePreview,
    wordStatePreview,

    // Display-only viewport bounds and starting position.
    viewport: {
      // Smallest allowed display zoom.
      minZoom,
      // Largest allowed display zoom.
      maxZoom,
      // Initial display zoom.
      defaultZoom: 0.5,
      // Initial horizontal camera offset.
      defaultPanX: -144,
      // Initial vertical camera offset.
      defaultPanY: 100,
    },

    // Fixed unscaled coordinate space containing every preview surface.
    workspace,
  } as const;
}

export const preview = createPreviewConfig();

// Debug overlay styling and quality normalization settings.
export const debugLayer = {
  // Visual debug-layer settings.
  settings: {
    // Multiplier for all display-oriented debug dimensions.
    scale: 1,
    // Lower bound preventing a zero quality scale.
    minVisualScale: 0.001,
    // Label font size as a ratio of the preview height.
    labelFontSizeRatio: 0.032,
    // Smallest display-space label font size.
    labelMinFontSize: 10,
    // Largest display-space label font size.
    labelMaxFontSize: 10,
    // Horizontal label padding as a font-size ratio.
    labelHorizontalPaddingRatio: 0.55,
    // Vertical label padding as a font-size ratio.
    labelVerticalPaddingRatio: 0.32,
    // Estimated character width as a font-size ratio.
    labelCharacterWidthRatio: 0.62,
    // Label text weight.
    labelFontWeight: 700,
    // Label corner radius in display pixels.
    labelCornerRadius: 0,
    // Gap between a label and its anchored box.
    labelGap: 0,
    // Minimum display-space overlap on both axes before Row and Word labels aggregate.
    labelAggregationOverlapThreshold: 188,
    // Display-space gap used when stacked labels are offset.
    labelStackGap: 3,
    // Connector line width for labels moved away from their box anchor.
    labelConnectorStrokeWidth: 1,
    // Connector line opacity for moved labels.
    labelConnectorOpacity: 0.8,
    // Minimum top-edge distance for inside label placement.
    labelTopEdgeThreshold: 8,
    // Top-edge threshold as a ratio of the preview height.
    labelTopEdgeThresholdRatio: 0.008,
    // Luminance above which labels use dark text.
    labelDarkTextLuminanceThreshold: 0.7,
    // Label text color for light entity colors.
    labelDarkTextColor: '#111827',
    // Label text color for dark entity colors.
    labelLightTextColor: '#ffffff',
    // Base hatch pattern size.
    patternSize: 32,
    // Hatch stripe width.
    patternStrokeWidth: 4,
    // Entity box fill opacity.
    boxFillOpacity: 0.35,
    // Entity box border width.
    boxStrokeWidth: 3,
    // Content-box dash length.
    boxDashLength: 8,
    // Content-box dash gap.
    boxDashGap: 5,
    // Padding ring fill opacity.
    paddingRingFillOpacity: 0.55,
    // Padding-only fill opacity.
    paddingOnlyFillOpacity: 0.42,
    // Empty padding-preview fill opacity.
    paddingPreviewEmptyOpacity: 0,
    // Padding preview border width.
    paddingStrokeWidth: 3,
    // Offset arrow line width.
    offsetArrowStrokeWidth: 3,
    // Offset arrow marker size.
    offsetMarkerSize: 5,
    // Vertical gap for the offset annotation.
    offsetLabelVerticalOffset: 10,
    // Offset annotation font size.
    offsetLabelFontSize: 12,
    // Offset annotation text weight.
    offsetLabelFontWeight: 600,
    // Offset annotation outline color.
    offsetLabelStrokeColor: '#000000',
    // Offset annotation outline width.
    offsetLabelStrokeWidth: 4,
    // Position guide line width.
    guideStrokeWidth: 3,
    // Position guide dash length.
    guideDashLength: 10,
    // Position guide dash gap.
    guideDashGap: 10,
    // Position guide opacity.
    guideOpacity: 0.9,
    // Position guide marker radius.
    guideRadius: 4,
    // Position guide marker outline color.
    guideOutlineColor: '#111827',
    // Position guide marker outline width.
    guideOutlineWidth: 1,
  },
} as const;

// Preset library thumbnail rendering and sampling settings.
export const presetsPreviewThumb = {
  // Intermediate raster size used for thumbnail rendering.
  render: {
    // Thumbnail render width.
    width: 720,
    // Thumbnail render height.
    height: 1280,
    // Thumbnail render scale.
    scale: 0.25,
  },
  // Visible thumbnail width.
  width: 240,
  // Visible thumbnail height.
  height: 135,
  // Canvas background behind the rendered thumbnail.
  canvasBackgroundColor: 'transparent',
  // Content scale inside the thumbnail.
  contentScale: 0.82,
  // Thumbnail sampling frame rate.
  sampleFps: 10,
  // Synthetic words rendered before taking the settled style sample.
  sampleWords: ['Style', 'Preview', 'Caption'],
  // Duration allocated to each synthetic word so enter/background animations settle.
  sampleWordDurationSeconds: 0.6,
  // Alpha cutoff used for thumbnail extraction.
  alphaThreshold: 10,
  // Start the first thumbnail render after the sidebar has had a chance to paint.
  initialRenderDelay: 0,
  // Short debounce for thumbnails invalidated by preset edits.
  debounce: 500,
} as const;
