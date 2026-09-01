export * from './animation';
export * from './animation-target';
export * from './animation-presets';
export * from './ecs-tree';
export * from './effect-id';
export * from './entity-schema';
export * from './field-metadata';
export * from './font-manifest';
export * from './list-ops';
export * from './path';
export * from './paint';
export * from './preset';
export * from './property-tree';
export {
	DEFAULT_STATE_WINDOW,
	MAX_FIXED_COUNT,
	MIN_FIXED_COUNT,
	clampFixedCount,
	fixedCountRange,
	isStateWindowConfig,
	normalizeStateWindowConfig,
	normalizeStateWindowRange,
	rangeIncludesDistance,
	rowCountRange,
	validateStateWindowConfig,
} from '@captioncat/caption-engine/browser';
export type {
	StateWindowConfig,
	StateWindowInput,
	StateWindowRange,
} from '@captioncat/caption-engine/browser';
export {
	DEFAULT_CAPTION_WORD_WRAP_OVERFLOW_TOLERANCE,
} from '@captioncat/caption-engine/browser';
export { isStateStyleSource, STATE_STYLE_SOURCES } from '@captioncat/caption-engine/browser';
export type { StateStyleSource } from '@captioncat/caption-engine/browser';

// NOTE: The legacy `canonical-templates` module was removed in the ECS port.
// ECS presets are stored field-for-field as an entity tree (`ecs-tree.ts`), but
// the DesignEditor overlays a canonical "all properties" schema
// (`entity-schema.ts`) at display time so every component/prop an entity can
// carry is editable even when the preset omits it, then prunes untouched
// defaults back out on write.
