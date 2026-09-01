/**
 * Entity-Component-System for the caption engine.
 *
 * Model:
 * - `PhysicalEntity` (CompositionArea > Page > Row > Word): the spatial scene
 * graph. Holds ordered `components` (paint order) and `effects` (apply order).
 * - `Component` (Layout, Transform, BackgroundStyle, Stroke, Shadow, Border,
 * Underline, Strikethrough, Text, Font): additive visuals relative to the
 * owner's box.
 * - `Effect` (GaussianBlur, MotionBlur, Replicator): post-processes the
 * owner's painted pixels. Replicator replays virtual raster copies without
 * adding physical entities, and every component/effect reports `getMargins`
 * for reliable auto-crop.
 * - `Property<T>` + randomizer/animation/transition evaluation: a single
 *   animatable and randomizable value.
 * - `buildEcsTree` constructs the tree from the ECS-native preset JSON.
 *
 * This is the package's active caption-rendering path.
 */

export * from './animation';
export * from './assets';
export * from './caption-layout';
export * from './components';
export * from '#platform/cursor-assets.js';
export * from './ecs-preset';
export * from './effects';
export * from './fill-pattern';
export * from './follow';
export * from './insets';
export * from './layout-engine';
export * from './layout-motion-runtime';
export * from './transitions';
export * from './paint';
export * from './paint-order';
export * from './physical-entities';
export * from './pipeline';
export * from './property';
export * from './property-defaults';
export * from './randomizer';
export * from './render-frame';
export * from './scene-render';
export * from './state-window';
export * from './state-style';
export * from './text-direction';
export * from './types';
export * from './word-instancer';
export * from './word-wrapping';
export * from './row-fitting';
