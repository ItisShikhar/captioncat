import type { EcsEntityNode } from '../entity-system/ecs-preset-types';
import {
  validateCaptionLayoutPolicy,
  type CaptionLayoutPolicy,
} from '../entity-system/caption-layout';
import {
  normalizeStateWindowConfig,
  type StateWindowConfig,
} from '../entity-system/state-window';
import {
  CURRENT_PRESET_SCHEMA_VERSION,
  type PresetSchemaVersion,
} from './schema-version';

export interface CaptionPresetMetadata {
  badges?: string[];
  platform?: string;
  previewBackgroundId?: string;
  previewStoryId?: string;
}

export interface CaptionPresetPreview extends Record<string, unknown> {
  aspectRatio?: string;
}

export interface CaptionPresetTiming {
  captionHoldThresholdSeconds?: number;
}

export type PresetTiming = CaptionPresetTiming;

/** Canonical persisted caption preset document consumed by the engine and tools. */
export interface EcsCaptionPreset {
  id: string;
  name?: string;
  schemaVersion: PresetSchemaVersion;
  timing?: CaptionPresetTiming;
  captionLayout: CaptionLayoutPolicy;
  stateWindow: StateWindowConfig;
  metadata?: CaptionPresetMetadata;
  preview?: CaptionPresetPreview;
  design: EcsEntityNode;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidTiming(value: unknown): value is CaptionPresetTiming | undefined {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  const hold = value.captionHoldThresholdSeconds;
  return hold === undefined || (typeof hold === 'number' && Number.isFinite(hold) && hold >= 0);
}

function isValidMetadata(value: unknown): value is CaptionPresetMetadata | undefined {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  if (
    value.badges !== undefined &&
    (!Array.isArray(value.badges) || !value.badges.every((badge) => typeof badge === 'string'))
  ) {
    return false;
  }
  return ['platform', 'previewBackgroundId', 'previewStoryId'].every(
    (key) => value[key] === undefined || typeof value[key] === 'string',
  );
}

function isValidPreview(value: unknown): value is CaptionPresetPreview | undefined {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return value.aspectRatio === undefined || typeof value.aspectRatio === 'string';
}

export function isEcsCaptionPreset(value: unknown): value is EcsCaptionPreset {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.trim().length > 0 &&
    (value.name === undefined || (typeof value.name === 'string' && value.name.trim().length > 0)) &&
    isValidTiming(value.timing) &&
    isValidMetadata(value.metadata) &&
    isValidPreview(value.preview) &&
    value.schemaVersion === CURRENT_PRESET_SCHEMA_VERSION &&
    (() => {
      try {
        normalizeStateWindowConfig(value.stateWindow);
        validateCaptionLayoutPolicy(value.captionLayout);
        return true;
      } catch {
        return false;
      }
    })() &&
    isRecord(value.design) &&
    value.design.entity === 'viewport' &&
    typeof value.design.id === 'string' &&
    value.design.id.trim().length > 0
  );
}

export function normalizeEcsCaptionPreset(value: unknown): EcsCaptionPreset | undefined {
  if (!isEcsCaptionPreset(value)) return undefined;

  return {
    ...value,
    schemaVersion: value.schemaVersion,
    stateWindow: normalizeStateWindowConfig(value.stateWindow),
  };
}

export function parseEcsCaptionPreset(raw: unknown, sourceLabel = 'preset'): EcsCaptionPreset {
  const preset = normalizeEcsCaptionPreset(raw);
  if (!preset) {
    throw new Error(
      `${sourceLabel}: expected a valid ECS caption preset with schema version ${CURRENT_PRESET_SCHEMA_VERSION}`,
    );
  }
  return preset;
}

export function parseEcsCaptionPresetJson(content: string, sourceLabel: string): EcsCaptionPreset {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`${sourceLabel}: contains invalid JSON`, { cause: error });
  }
  return parseEcsCaptionPreset(parsed, sourceLabel);
}

export function serializeEcsCaptionPreset(preset: EcsCaptionPreset): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: preset.id,
    schemaVersion: preset.schemaVersion,
    captionLayout: preset.captionLayout,
    stateWindow: preset.stateWindow,
    design: preset.design,
  };
  if (preset.name !== undefined) out.name = preset.name;
  if (preset.timing !== undefined) out.timing = preset.timing;
  if (preset.metadata !== undefined) out.metadata = preset.metadata;
  if (preset.preview !== undefined) out.preview = preset.preview;
  return out;
}
