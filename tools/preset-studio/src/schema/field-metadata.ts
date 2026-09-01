import type { DebugEntityKind } from '@/ui/preview/entity-debug';
import { EASE_TYPES } from './property-tree';
import { BLEND_MODES } from '@captioncat/caption-engine/browser';

/** Hints the generic form UI uses for a leaf field, looked up by field key name. */
export interface FieldMeta {
  label?: string;
  description?: string;
  min?: number;
  max?: number;
  step?: number;
  slider?: boolean;
  sliderFormat?: 'percent';
  zeroLabel?: string;
  /** Unit suffix shown next to a number field, e.g. "pt", "s", "deg", "%". */
  unit?: string;
  /** For `string` leaves that are really closed enums, the selectable options. */
  options?: readonly string[];
  /** Presentation labels for enum values whose humanized form is not exact. */
  optionLabels?: Partial<Record<string, string>>;
  /** Short explanations shown as tooltips for selected enum values. */
  optionDescriptions?: Partial<Record<string, string>>;
  /**
   * For a subset of `options` above, which debug-overlay entity that choice
   * effectively sizes/bounds its element to - shown as a small color swatch
   * before the option's label (see `SelectField`), and previewed exclusively
   * (all other overlays temporarily hidden, restored on mouse-leave) while
   * hovering that option. Only meaningful for fields whose enum values bind to
   * another entity's geometry - most enum fields (e.g. `caseTransform`,
   * `easeType`) omit this.
   */
  optionEntityKind?: Partial<Record<string, DebugEntityKind>>;
  /**
   * For `numberOrAuto` leaves only: the number to populate when the user
   * turns the "Auto" switch off and there is no previously-entered manual
   * value to restore (i.e. the field has never held a real number in this
   * editing session). Must match what "auto" resolves to at the
   * engine level, so the field never jumps to a meaningless `0`. Falls back
   * to `min ?? 0` when unset.
   */
  autoOffDefault?: number;
}

export const COMPONENT_DESCRIPTIONS: Record<string, string> = {
  followTarget:
    'Copies selected properties from a target entity and aligns this entity to the target anchor. Mapping offsets adjust each copied value.',
  transform:
    'Controls positioning, size, rotation, scale, pivot, opacity, and the resolved layout bounds of this entity.',
  layout: 'Controls how this entity arranges its direct children, including alignment, padding, and clipping.',
  selfLayout: "Overrides this entity's own aspect ratio and alignment without changing its parent layout.",
  backgroundStyle:
    'Paints a background from resolved content or child bounds. It supports color patterns, procedural shapes, padding, offset, scale, and effects.',
  layoutMotion: 'Animates layout changes with spring dynamics when rows or pages move.',
  stateMotion:
    'Sets the relative travel distance and speed for each row or word state. Values of 1 preserve the normal motion.',
  animation: 'Applies preset or custom motion to an entity, its children, or its descendants when a trigger occurs.',
  imageSequencer: 'Replaces an image asset over time with an ordered frame sequence.',
  childPaintOrder: 'Controls the paint order of direct children with z-index, direction, or seeded ordering.',
  markerBehavior: 'Controls marker style ownership and whether the marker renders in front of or behind the caption.',
  image:
    'Displays a bundled or custom image with optional tint, solid fill, aspect-ratio, and child render-order control.',
  borderRadius: 'Rounds the component bounds with one uniform radius or independent corner radii.',
  blink:
    'Turns the typewriter cursor on and off. Use Rate for speed, Visible Portion for how long it stays on, and Phase Offset to shift the timing.',
};

export const EFFECT_DESCRIPTIONS: Record<string, string> = {
  blur: 'Softens the rendered result. Applies On selects whether this effect uses the base or preceding effect output.',
  motionBlur:
    'Creates directional trails from offset copies. Angle sets the direction, Distance sets the trail length, and Blur Amount sets the sample amount.',
  streak:
    'Creates a one-sided directional trail from offset copies. Angle sets the direction, Distance sets the trail length, and Trail Amount sets the sample amount.',
  border:
    'Draws a border around the resolved shape. Position controls whether it grows outward, centers, or stays inside.',
  noise: 'Adds deterministic signal noise to the rendered output.',
  flicker: 'Changes rendered brightness between frames.',
  fisheye: 'Bends the rendered output with a concave or convex lens.',
  vignette: 'Darkens the rendered output toward its edges.',
  glow: 'Builds a soft colored halo from the rendered shape. Glow Mode chooses an outer or inner halo. Strength controls opacity and blur radius controls spread.',
  shadow: 'Adds a blurred offset copy behind the rendered result. Use Font Color to inherit the text color.',
  stroke: 'Draws a styled outline with joins, caps, dash spacing, and optional font-color inheritance.',
  replicator: 'Creates repeated copies with independent transform, opacity, color, and per-copy overrides.',
  typewriter: 'Shows text over time and can animate each visible character with a cursor and per-unit tracks.',
  wipeReveal:
    'Reveals an entity style with an animated local mask. Add the linked Animation component to control reveal timing.',
};

export function getComponentDescription(component: string): string | undefined {
  return COMPONENT_DESCRIPTIONS[component];
}

export function getEffectDescription(effect: string): string | undefined {
  return EFFECT_DESCRIPTIONS[effect];
}

/**
 * Lookup by exact field key name. This is a presentation layer, not a
 * strict schema: unknown field names fall back to an unclamped
 * generic control, so new engine features (borders, timecode,...) keep
 * working without needing an entry here first.
 */
export const FIELD_META: Record<string, FieldMeta> = {
  // --- generic animatable numbers ---
  opacity: { min: 0, max: 1, step: 0.01 },
  effectsInheritBaseAlpha: {
    label: 'Effects Inherit Base Alpha',
    description:
      'When enabled, Glow, Shadow, and Stroke follow the base renderable alpha. Disable to show full effects over a transparent base.',
  },
  antialiasScale: {
    label: 'Antialiasing',
    options: ['1', '2', '4', '8'],
    optionLabels: {
      '1': 'None',
      '2': '2x',
      '4': '4x',
      '8': '8x',
    },
    description: 'Render the stroke at higher resolution before downsampling. Higher values improve edge quality and use more memory.',
  },
  fillPattern: {
    label: 'Fill Pattern',
    description:
      'Use one fill color, cycle colors, or alternate between the first two colors. The first active color stays synced with Fill.',
  },
  // Glow's own alpha multiplier (`GlowEffect.apply` passes it straight through to
  // `parseColor`'s `withOpacity`) - without an explicit step here it fell back to a whole-number
  // default, so the field silently rounded any typed fractional value (for example, `0.05` -> `0`),
  // making it look like "Strength does nothing" since 1/2/3/... all clamp to the same fully-opaque
  // shadow color.
  strength: {
    min: 0,
    max: 1,
    step: 0.01,
    description: 'Controls Glow opacity from 0 to 1. The slider shows this value as 0% to 100%.',
  },
  rotation: { min: -360, max: 360, step: 1, unit: '\u00b0' },
  pivot: {
    label: 'Pivot',
    description: 'Sets the reference point for scaling and rotation.',
    options: [
      'topLeft',
      'topCenter',
      'topRight',
      'centerLeft',
      'center',
      'centerRight',
      'bottomLeft',
      'bottomCenter',
      'bottomRight',
    ],
  },
  canvasRotation: { min: -360, max: 360, step: 1, unit: '\u00b0' },
  positionXUnit: { options: ['pt', '%'] },
  positionYUnit: { options: ['pt', '%'] },
  borderRadiusMode: { options: ['uniform', 'individual'] },
  borderRadius: { min: 0, max: 1000, step: 1, unit: 'pt' },
  borderTopLeftRadius: { min: 0, max: 1000, step: 1, unit: 'pt' },
  borderTopRightRadius: { min: 0, max: 1000, step: 1, unit: 'pt' },
  borderBottomRightRadius: { min: 0, max: 1000, step: 1, unit: 'pt' },
  borderBottomLeftRadius: { min: 0, max: 1000, step: 1, unit: 'pt' },
  width: { min: 0, max: 200, step: 1, unit: 'pt' },
  height: { min: 0, max: 1000, step: 1, unit: 'pt', description: 'Set to 0 to match the text height.' },
  dimensions: { min: 0, max: 200, step: 1, unit: 'pt' },
  widthUnit: { options: ['pt', '%'] },
  heightUnit: { options: ['pt', '%'] },
  size: { min: 1, max: 500, step: 1, unit: 'pt' },
  weight: {
    min: 1,
    max: 1000,
    step: 1,
    description: 'Set the font weight. Smooth transitions require a variable font.',
  },
  reveal: {
    label: 'Progress',
    min: 0,
    max: 1,
    step: 0.01,
    description: 'Set how much of the text is visible when Progress Source is Manual.',
  },
  durationSeconds: {
    label: 'Full Word Reveal Seconds',
    min: 0,
    max: 10,
    step: 0.01,
    unit: 's',
    description:
      'Set how long a full word can take to type in. Auto mode treats this as a cap. Fixed mode always uses this exact duration.',
  },
  delaySeconds: {
    min: 0,
    max: 10,
    step: 0.01,
    unit: 's',
    description: 'Set the delay before the effect starts.',
  },
  unitDurationSeconds: {
    label: 'Per-Character Time',
    min: 0,
    max: 10,
    step: 0.01,
    unit: 's',
    description: 'Set the base time used for each visible character before word-level fitting is applied.',
  },
  captionHoldThresholdSeconds: { min: 0, max: 5, step: 0.01, unit: 's' },
  rowBreakPauseThresholdSeconds: { min: 0, max: 5, step: 0.01, unit: 's' },
  pageBreakPauseThresholdSeconds: { min: 0, max: 10, step: 0.01, unit: 's' },
  pauseSpacingThresholdSeconds: { min: 0, max: 10, step: 0.01, unit: 's' },
  pauseSpacingExtra: { min: 0, max: 500, step: 1, unit: 'units' },
  pauseSpacingMaxExtra: { min: 0, max: 500, step: 1, unit: 'units' },
  longWordThresholdSeconds: {
    label: 'Long-word threshold',
    min: 0.05,
    max: 10,
    step: 0.01,
    unit: 's',
    description: 'Keep a word alone when its duration exceeds this value.',
  },
  overflowTolerance: {
    label: 'Effect overflow tolerance',
    min: 0,
    step: 0.01,
    description: 'Ignore this much decorative effect margin on each side when deciding whether to wrap a word.',
  },
  previousWordCount: { min: 0, max: 10, step: 1 },
  nextWordCount: { min: 0, max: 10, step: 1 },
  previousRowCount: { min: 0, max: 10, step: 1 },
  nextRowCount: { min: 0, max: 10, step: 1 },
  motionType: {
    label: 'Motion Type',
    options: ['spring', 'eased'],
    optionLabels: { spring: 'Spring', eased: 'Eased' },
    description: 'Choose spring physics or easing-based motion.',
  },
  timingMode: {
    label: 'Timing Mode',
    options: ['fixed', 'adaptive'],
    optionLabels: { fixed: 'Fixed', adaptive: 'Adaptive' },
    description:
      'Fixed uses the authored timing. Adaptive fits eased motion and stagger to the interval before the next current entity.',
  },
  focusPosition: {
    label: 'Focus Position',
    description: 'Choose where the current row or word should align within its parent.',
  },
  motionScope: {
    label: 'Motion Scope',
    options: ['group', 'perChild'],
    optionLabels: { group: 'Group', perChild: 'Children' },
    description: 'Choose whether this entity moves as one group or each direct child moves separately.',
  },
  stiffness: {
    min: 0,
    max: 2000,
    step: 1,
    description:
      'Controls how strongly the layout moves toward its target. Higher values make the motion faster and tighter.',
  },
  damping: {
    min: 0,
    max: 500,
    step: 1,
    description: 'Controls how quickly the motion loses speed. Higher values reduce overshoot and bouncing.',
  },
  mass: {
    min: 0.01,
    max: 20,
    step: 0.01,
    description:
      'Controls the weight of the motion. Higher values make the layout respond more slowly and feel heavier.',
  },
  springFalloffFactor: {
    label: 'Spring Falloff',
    min: 0.1,
    max: 8,
    step: 0.05,
    description:
      'Scales the spring response with distance from the current row or word. 1 keeps the response unchanged.',
  },
  easing: {
    label: 'Easing',
    options: EASE_TYPES,
    optionLabels: {
      easeInOut: 'Ease In Out',
      easeIn: 'Ease In',
      easeOut: 'Ease Out',
    },
    description: 'Selects the easing curve for the motion.',
  },
  staggerDelaySeconds: {
    label: 'Stagger Delay',
    min: 0,
    max: 2,
    step: 0.01,
    unit: 's',
    description: 'Sets the delay between direct children, ordered from nearest to farthest from the target.',
  },
  staggerTimingMode: {
    label: 'Stagger Timing',
    options: ['adaptive', 'fixed'],
    description:
      'Adaptive shortens stagger delays to fit the active row or word duration. Fixed uses the authored delay.',
  },
  staggerFalloffFactor: {
    label: 'Stagger Falloff',
    min: 0,
    max: 8,
    step: 0.05,
    description: 'Scales stagger delays with distance from the current row or word. 1 keeps the delay unchanged.',
  },
  stateMotion: {
    label: 'State Motion',
    description:
      'Set the travel distance and speed for each row or word state. Distance is relative to the current state; speed is a motion multiplier. 1 keeps the normal motion.',
  },
  distanceScale: {
    label: 'Distance Scale',
    min: 0,
    max: 8,
    step: 0.05,
    description: 'Scales the distance from the current row or word. 1 keeps the normal layout distance.',
  },
  speedScale: {
    label: 'Speed Scale',
    min: 0.05,
    max: 8,
    step: 0.05,
    description: 'Scales the motion speed for this state. 1 keeps the normal speed.',
  },
  zIndex: { step: 1 },
  backZIndex: { step: 1 },
  frontZIndex: { step: 1 },
  seed: { step: 1 },
  protrusion: { min: -200, max: 200, step: 1, unit: 'pt' },
  letterSpacing: {
    label: 'Letter Spacing',
    min: -100,
    max: 100,
    step: 0.5,
    unit: 'pt',
    description: 'Add or remove space between grapheme units. Zero preserves the font default spacing.',
  },
  sizeScale: {
    label: 'Size Scale',
    min: 0.5,
    max: 1.5,
    step: 0.01,
    unit: 'x',
    description: 'Scale emoji glyphs relative to the selected text font size.',
  },
  alignmentMode: {
    label: 'Alignment',
    options: ['optical', 'baseline'],
    optionLabels: { optical: 'Optical', baseline: 'Baseline' },
    description: 'Optical alignment uses font ink metrics to keep emoji centered with nearby text.',
  },
  baselineOffset: {
    label: 'Baseline Offset',
    min: -0.5,
    max: 0.5,
    step: 0.001,
    unit: 'em',
    description: 'Move emoji up or down relative to the text baseline.',
  },
  blurRadius: { min: 0, max: 1024, step: 1, unit: 'pt' },
  type: {
    label: 'Type',
    options: ['monitor', 'tv', 'lcd'],
    optionLabels: {
      monitor: 'Monitor',
      tv: 'TV',
      lcd: 'LCD',
    },
  },
  distortion: {
    label: 'Distortion',
    min: 0,
    max: 1,
    step: 0.01,
    slider: true,
    zeroLabel: 'OFF',
    description: 'Controls the strength of the lens distortion.',
  },
  dotScale: {
    label: 'Dot Scale',
    min: 0,
    max: 1,
    step: 0.01,
    slider: true,
    sliderFormat: 'percent',
    zeroLabel: 'OFF',
  },
  dotPitch: {
    label: 'Dot Pitch',
    min: 0,
    max: 30,
    step: 0.01,
    slider: true,
    zeroLabel: 'OFF',
    unit: 'pt',
  },
  falloff: {
    label: 'Falloff',
    min: 0.01,
    max: 1,
    step: 0.01,
    slider: true,
    sliderFormat: 'percent',
  },
  glowRadius: {
    label: 'Glow Radius',
    min: 0,
    max: 0.5,
    step: 0.01,
    slider: true,
    zeroLabel: 'OFF',
  },
  glowIntensity: {
    label: 'Glow Intensity',
    min: 0,
    max: 1,
    step: 0.01,
    slider: true,
    sliderFormat: 'percent',
    zeroLabel: 'OFF',
  },
  bloom: {
    label: 'Bloom',
    options: ['screen', 'light', 'hdr'],
    optionLabels: {
      screen: 'Screen',
      light: 'Light',
      hdr: 'HDR',
    },
  },
  bloomThreshold: {
    label: 'Bloom Threshold',
    min: 0,
    max: 1,
    step: 0.01,
    slider: true,
    sliderFormat: 'percent',
    zeroLabel: 'OFF',
  },
  bloomIntensity: {
    label: 'Bloom Intensity',
    min: 0,
    max: 5,
    step: 0.01,
    slider: true,
    zeroLabel: 'OFF',
  },
  bloomRadius: {
    label: 'Bloom Radius',
    min: 0,
    max: 10,
    step: 0.01,
    slider: true,
    zeroLabel: 'OFF',
    unit: 'pt',
  },
  redConvergenceOffset: {
    label: 'Red Convergence Offset',
    min: -1,
    max: 1,
    step: 0.01,
    slider: true,
  },
  blueConvergenceOffset: {
    label: 'Blue Convergence Offset',
    min: -1,
    max: 1,
    step: 0.01,
    slider: true,
  },
  noise: {
    label: 'Noise',
    min: 0,
    max: 1,
    step: 0.01,
    slider: true,
    sliderFormat: 'percent',
    zeroLabel: 'OFF',
    description: 'Adds deterministic animated signal noise to the rendered image.',
  },
  static: {
    label: 'Static',
    description: 'Keeps the noise pattern fixed across frames.',
  },
  blendMode: {
    label: 'Blend Mode',
    options: BLEND_MODES,
    optionLabels: {
      normal: 'Normal',
      multiply: 'Multiply',
      screen: 'Screen',
      overlay: 'Overlay',
      'soft-light': 'Soft Light',
      'hard-light': 'Hard Light',
      darken: 'Darken',
      lighten: 'Lighten',
      difference: 'Difference',
      exclusion: 'Exclusion',
    },
    description: 'Controls how this effect layer blends with the rendered result.',
  },
  flicker: {
    label: 'Flicker',
    min: 0,
    max: 1,
    step: 0.01,
    slider: true,
    sliderFormat: 'percent',
    zeroLabel: 'OFF',
    description: 'Varies image brightness between frames to simulate an unstable display.',
  },
  updateMode: {
    label: 'Update Mode',
    options: ['everyFrame', 'randomFrames'],
    optionLabels: {
      everyFrame: 'Every Frame',
      randomFrames: 'Random Frames',
    },
    description: 'Choose whether flicker changes every frame or only on deterministic random frames.',
  },
  maxOffDuration: {
    label: 'Max Off Duration',
    min: 0,
    max: 5,
    step: 0.01,
    unit: 's',
    slider: true,
    zeroLabel: 'OFF',
    description: 'Limits how long a random-frame flicker stays dark before returning to normal.',
  },
  offPaint: {
    label: 'Off Paint',
    description:
      'Sets the paint used as the flicker dims the rendered image. Use transparent paint to fade to transparency.',
  },
  zoom: {
    label: 'Zoom',
    min: 1,
    max: 4,
    step: 0.01,
    slider: true,
    unit: 'x',
    description: 'Zooms into the source to reduce empty space around the distorted edges.',
  },
  lensCenter: {
    label: 'Lens Center',
    description: 'Sets the lens center in normalized coordinates from 0 to 1.',
  },
  edgeMode: {
    label: 'Edge Handling',
    options: ['transparent', 'clamp', 'crop'],
    optionLabels: {
      transparent: 'Transparent',
      clamp: 'Clamp',
      crop: 'Crop',
    },
    description: 'Controls pixels that move outside the source frame.',
  },
  vignette: {
    label: 'Vignette',
    min: 0,
    max: 1,
    step: 0.01,
    slider: true,
    sliderFormat: 'percent',
    zeroLabel: 'OFF',
    description: 'Darkens the image toward the lens edges.',
  },
  aspectCorrection: {
    label: 'Aspect Ratio Compensation',
    description: 'Keeps the lens shape circular on portrait and landscape canvases.',
  },
  dash: { min: 0, max: 1000, step: 1, unit: 'pt' },
  gap: { min: 0, max: 1000, step: 1, unit: 'pt' },
  spacing: { min: 0, max: 1000, step: 1, unit: 'pt' },
  dashOffset: { min: -1000, max: 1000, step: 1, unit: 'pt' },
  layers: { min: 1, max: 20, step: 1 },
  cloneCount: {
    min: 1,
    max: 1024,
    step: 1,
    description: 'Set the number of copies generated by the Replicator.',
  },
  fillSeed: {
    min: 0,
    max: 2147483647,
    step: 1,
    description: 'Set the seed used to generate repeatable random copy fills.',
  },
  rowsPerPageCount: { min: 1, max: 20, step: 1 },
  wordsPerRowCount: { min: 1, max: 50, step: 1 },
  horizontalFitMinScale: { min: 0.05, max: 256, step: 0.01 },
  horizontalFitMaxScale: { min: 0.05, max: 256, step: 0.01 },
  unit: { options: ['pt', '%'] },
  retriggerOnSamePage: {
    description: 'Replay the current-word burst when the same page appears again.',
  },
  retriggerOnSameRow: {
    description: 'Replay the current-word burst when the same row appears again.',
  },
  // Shared sample amount for Motion Blur and Streak.
  steps: {
    min: 0,
    max: 256,
    step: 1,
    description: 'Set the blur or trail amount. Zero turns the effect off. One adds a light effect.',
  },
  angle: {
    label: 'Angle',
    min: -180,
    max: 180,
    step: 1,
    unit: '\u00b0',
    description: 'Set the direction of the blur or trail. Zero points right and positive angles point down.',
  },

  // --- generic animatable vector2s (position/spacing in pixels. `scale` is
  // intentionally left unitless below, since it is a multiplier not a distance) ---
  offset: { min: -1000, max: 1000, step: 1, unit: 'pt' },
  padding: { min: 0, max: 1000, step: 1, unit: 'pt' },
  top: { label: 'Top', min: 0, max: 1000, step: 1, unit: 'pt' },
  right: { label: 'Right', min: 0, max: 1000, step: 1, unit: 'pt' },
  bottom: { label: 'Bottom', min: 0, max: 1000, step: 1, unit: 'pt' },
  left: { label: 'Left', min: 0, max: 1000, step: 1, unit: 'pt' },
  bandPadding: {
    label: 'Band Padding',
    description: 'Space added around each rendered background band.',
    min: 0,
    max: 1000,
    step: 1,
    unit: 'pt',
  },
  blockPadding: {
    label: 'Block Padding',
    description:
      'Space added around the background block. Top and bottom affect the outer bands. Left and right affect every band. For one band, all four edges apply.',
    min: 0,
    max: 1000,
    step: 1,
    unit: 'pt',
  },
  distance: {
    label: 'Distance',
    min: 0,
    max: 1000,
    step: 1,
    unit: 'pt',
    description: 'Set the length of the blur or trail. The Angle field controls its direction.',
  },
  maxOpacity: {
    min: 0,
    max: 1,
    step: 0.01,
    description: 'Set the highest opacity used by the blur or trail.',
  },

  // --- enums (rendered as select controls) ---
  verticalAlignment: {
    options: ['top', 'center', 'bottom', 'stretch'],
    optionLabels: {
      stretch: 'Stretch / Justify',
    },
    optionDescriptions: {
      stretch: 'Stretch children across the cross-axis or justify them along the vertical flow axis.',
    },
    description: 'Vertical position or distribution of this element within its parent area.',
  },
  horizontalAlignment: {
    options: ['start', 'center', 'end', 'left', 'right', 'stretch'],
    optionLabels: {
      start: 'Start',
      center: 'Center',
      end: 'End',
      left: 'Left',
      right: 'Right',
      stretch: 'Stretch / Justify',
    },
    optionDescriptions: {
      start: 'Start follows the reading direction: left for LTR languages and right for RTL languages.',
      end: 'End follows the opposite side of the reading direction.',
      stretch: 'Stretch children across the cross-axis or justify them along the horizontal flow axis.',
    },
    description: 'Horizontal position or distribution of this element within its parent area.',
  },
  horizontalSingleItemAlignment: {
    options: ['start', 'center', 'end', 'justify'],
    optionLabels: {
      start: 'Start',
      center: 'Center',
      end: 'End',
      justify: 'Justify',
    },
    optionDescriptions: {
      start: 'If there is only one child, place it at the start.',
      center: 'If there is only one child, place it at the center.',
      end: 'If there is only one child, place it at the end.',
      justify: 'If there is only one child, stretch it to fill the available horizontal space.',
    },
    description: 'Choose how horizontal Stretch handles one direct child.',
  },
  verticalSingleItemAlignment: {
    options: ['start', 'center', 'end', 'justify'],
    optionLabels: {
      start: 'Start',
      center: 'Center',
      end: 'End',
      justify: 'Justify',
    },
    optionDescriptions: {
      start: 'If there is only one child, place it at the start.',
      center: 'If there is only one child, place it at the center.',
      end: 'If there is only one child, place it at the end.',
      justify: 'If there is only one child, stretch it to fill the available vertical space.',
    },
    description: 'Choose how vertical Stretch handles one direct child.',
  },
  layoutMode: {
    options: ['row', 'column', 'overlay'],
    description: 'How this layout places its direct children.',
  },
  childrenSizing: {
    label: 'Children Sizing',
    options: ['constrained', 'allowOverflow'],
    optionLabels: {
      constrained: 'Constrained',
      allowOverflow: 'Allow Overflow',
    },
    optionDescriptions: {
      constrained: 'Keep direct children inside this layout area.',
      allowOverflow: 'Let direct children use larger dimensions. Clipping remains controlled by Clip Content.',
    },
    description: 'Choose whether direct children can exceed this layout area.',
  },
  windowMode: {
    label: 'Window Mode',
    options: ['all', 'count'],
    optionLabels: { all: 'All Children', count: 'Fixed Count' },
    description: 'Choose whether fit-children sizing uses all flow-child slots or a fixed count.',
  },
  windowCount: {
    label: 'Visible Child Slots',
    min: 1,
    max: 1000,
    step: 1,
    description: 'Number of direct flow-child slots used by fit-children sizing.',
  },
  windowAxis: {
    label: 'Window Axis',
    options: ['horizontal', 'vertical'],
    optionLabels: { horizontal: 'Horizontal', vertical: 'Vertical' },
    description: 'Select the flow axis whose fit-children size is limited.',
  },
  windowAnchor: {
    label: 'Window Anchor',
    options: ['start', 'center', 'end'],
    optionLabels: { start: 'Start', center: 'Center', end: 'End' },
    description: 'Select which part of overflowing flow content stays inside the window.',
  },
  windowSelection: {
    label: 'Window Selection',
    options: ['anchor', 'motionFocus'],
    optionLabels: { anchor: 'Anchor', motionFocus: 'Motion Focus' },
    description:
      'Choose whether the window uses its anchor or the active Layout Motion focus to select flow-child slots.',
  },
  widthMode: {
    options: ['custom', 'fitParent', 'fitContent', 'fitChildren'],
    description: 'Choose whether width uses a custom value, the parent, the content, or the children.',
  },
  heightMode: {
    options: ['custom', 'fitParent', 'fitContent', 'fitChildren'],
    description: 'Choose whether height uses a custom value, the parent, the content, or the children.',
  },
  aspectRatio: { options: ['maintain', 'stretchToFit', 'custom'] },
  customAspectRatio: { options: ['9:16', '16:9', '1:1', '4:3', '3:4'] },
  pathShape: {
    label: 'Background Shape',
    description: 'Choose a background shape. The shape is rebuilt for the resolved bounds.',
    options: ['rounded', 'pill', 'iMessage', 'ticket', 'cloud', 'comicBook'],
    optionLabels: {
      rounded: 'Rectangle',
      pill: 'Pill',
      iMessage: 'iMessage',
      ticket: 'Ticket',
      cloud: 'Cloud',
      comicBook: 'Comic Book',
    },
  },
  tailSide: {
    label: 'iMessage Tail',
    description: 'Choose the iMessage tail side. Auto follows the resolved text direction.',
    options: ['auto', 'left', 'right'],
  },
  tailSize: {
    label: 'Tail Size',
    description: 'Scale the iMessage tail.',
    min: 0,
    max: 4,
    step: 0.05,
  },
  caseTransform: { options: ['none', 'uppercase', 'lowercase', 'capitalize'] },
  easeType: { options: EASE_TYPES },
  style: { options: ['normal', 'italic', 'oblique'] },
  capType: { options: ['butt', 'round', 'square'] },
  joinType: { options: ['miter', 'bevel', 'round'] },
  longShadow: {
    label: 'Long Shadow',
    description: 'Fill the solid extrusion between the renderable and its offset shadow.',
  },
  renderOrder: { options: ['behind', 'inFront'] },
  showOriginal: {
    options: ['none', 'front', 'back'],
    description: 'Choose whether the original layer is hidden, shown in front, or shown behind the copies.',
  },
  showOriginalDuringOff: {
    label: 'Only Show During Off',
    description: 'Show the original only while flicker uses its off paint.',
  },
  cloneOrdering: {
    label: 'Clone Ordering',
    options: ['backToFront', 'frontToBack'],
    optionLabels: { backToFront: 'Back to Front', frontToBack: 'Front to Back' },
    description: 'Choose which copy appears in front when copies overlap.',
  },
  boundsMode: {
    label: 'Background Bounds',
    description: 'Selects how tightly the background follows its content.',
    options: ['fillSelf', 'tight', 'full'],
    optionLabels: { fillSelf: 'Fill Self', tight: 'Tight', full: 'Full' },
  },
  overflowMode: {
    label: 'Background Overflow',
    description: 'Choose whether the background can paint outside its owner frame.',
    options: ['visible', 'clipToOwner'],
    optionLabels: { visible: 'Allow Bleed', clipToOwner: 'Clip to Owner' },
  },
  coverageMode: {
    label: 'Coverage',
    description: 'Choose whether the background uses all resolved content or a limited coverage range.',
    options: ['all', 'throughCurrent'],
  },
  resizeMode: { options: ['fit', 'none'] },
  position: { min: -1000, max: 1000, step: 1, unit: 'pt', options: ['outer', 'center', 'inner'] },
  alignment: {
    options: ['inside', 'center', 'outside'],
    description: 'Choose whether the stroke stays inside, straddles, or stays outside the painted boundary.',
  },
  appliesOn: {
    label: 'Applies on',
    options: ['base', 'previousEffect'],
    description: 'Base uses the original layer. Previous Effect uses the output from the preceding effect.',
  },
  fillMode: {
    options: ['inherit', 'random', 'custom'],
    description: 'Choose whether copies inherit the source fill, use seeded random fills, or use custom fills.',
  },
  fillTarget: {
    label: 'Fill Target',
    options: ['base', 'fullLayer'],
    optionLabels: { base: 'Base Content', fullLayer: 'Full Layer' },
    optionDescriptions: {
      base: 'Recolors only the original renderable and preserves stroke, shadow, glow, and other effect colors.',
      fullLayer: 'Recolors the complete rendered layer, including stroke, shadow, glow, and other effects.',
    },
    description: 'Choose which part of each source layer receives the clone fill.',
  },
  revealMode: {
    options: ['lifecycle', 'manual'],
    description: 'Lifecycle follows the active caption state. Manual uses the Progress value directly.',
  },
  durationMode: {
    label: 'Timing Mode',
    options: ['auto', 'fixed'],
    description:
      'Auto fits the typing progress to the available word interval. Fixed uses the authored duration exactly.',
  },
  showDuringReveal: {
    label: 'Show Cursor While Typing',
    description: 'Keep the cursor visible while the text is still typing in.',
  },
  clipContent: {
    description: "Clip descendants to this entity's content area.",
  },
  target: {
    description: 'Select the parent, timeline state, or specific entity to follow.',
  },
  anchor: {
    description: 'Select the reference point used to align the followed entity.',
  },
  mappings: {
    description: 'Copy target properties into this entity. Each mapping can apply an offset after the value is copied.',
  },
  useFontColor: {
    description: 'Use the text or font color instead of the manually selected effect color.',
  },
  scope: {
    description: 'Choose whether Animation affects the entity, its direct children, or all descendants.',
  },
  pattern: {
    description: 'Choose the order in which Animation targets start.',
  },
  interval: {
    min: 0,
    max: 2,
    step: 0.01,
    unit: 's',
    description: 'Set the delay between ordered Animation target starts.',
  },
  direction: { options: ['forward', 'reverse'] },
  preset: { options: ['mac', 'windows', 'ios', 'android', 'old', 'custom'] },
  shape: { options: ['preset', 'caret', 'block', 'underscore', 'glyph'] },
  dutyCycle: { min: 0, max: 1, step: 0.01 },
  rate: { min: 0, max: 20, step: 0.1, unit: 'Hz' },
  phaseOffset: { min: -10, max: 10, step: 0.01, unit: 's' },
};

export function getFieldMeta(fieldKey: string): FieldMeta {
  return FIELD_META[fieldKey] ?? {};
}
