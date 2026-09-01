import type { EcsCaptionPreset } from '@captioncat/caption-engine/browser';
import { parseEcsCaptionPreset, serializeEcsCaptionPreset } from '@captioncat/caption-engine/browser';
import type { EcsEntityDoc } from './ecs-tree';
import { parseEcsEntity, serializeEcsEntity } from './ecs-tree';
import { ensureEntityComponentDependencies, findInvalidAnimationTargets } from './entity-schema';
import type { ContainerNode } from './property-tree';
import { parseNode, serializeNode } from './property-tree';
import { roundSerializedNumbers } from '@/lib/number-precision';

export const SUPPORTED_PREVIEW_ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4'] as const;
export type PreviewAspectRatio = (typeof SUPPORTED_PREVIEW_ASPECT_RATIOS)[number];

export function isPreviewAspectRatio(value: unknown): value is PreviewAspectRatio {
  return (
    typeof value === 'string' &&
    SUPPORTED_PREVIEW_ASPECT_RATIOS.some((ratio) => ratio === value)
  );
}

export interface PresetPreview extends ContainerNode {
  aspectRatio?: PreviewAspectRatio;
}

/** Normalized Studio editor state derived from the engine's canonical preset document. */
export type PresetEditorState = Omit<EcsCaptionPreset, 'name' | 'preview' | 'design'> & {
  name: string;
  preview: PresetPreview;
  design: EcsEntityDoc;
};

export class PresetParseError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parsePresetDocument(raw: unknown, sourceLabel = 'preset'): PresetEditorState {
  let canonical: EcsCaptionPreset;
  try {
    canonical = parseEcsCaptionPreset(raw, sourceLabel);
  } catch (error) {
    throw new PresetParseError((error as Error).message);
  }
  if (canonical.name === undefined || canonical.name.trim().length === 0) {
    throw new PresetParseError(`${sourceLabel}: missing/invalid "name"`);
  }

  const rawPreview = canonical.preview;
  let previewAspectRatio: PreviewAspectRatio | undefined;
  if (isRecord(rawPreview) && rawPreview.aspectRatio !== undefined) {
    if (!isPreviewAspectRatio(rawPreview.aspectRatio)) {
      throw new PresetParseError(
        `${sourceLabel}: invalid "preview.aspectRatio"; expected one of ${SUPPORTED_PREVIEW_ASPECT_RATIOS.join(', ')}`,
      );
    }
    previewAspectRatio = rawPreview.aspectRatio;
  }
  const preview = parseNode(
    isRecord(rawPreview) && 'aspectRatio' in rawPreview
      ? Object.fromEntries(Object.entries(rawPreview).filter(([key]) => key !== 'aspectRatio'))
      : rawPreview,
  );
  if (!preview || preview.kind !== 'container') {
    throw new PresetParseError(`${sourceLabel}: missing/invalid "preview" property tree`);
  }
  const parsedPreview: PresetPreview =
    previewAspectRatio !== undefined ? { ...preview, aspectRatio: previewAspectRatio } : preview;

  const parsedDesign = parseEcsEntity(canonical.design, `${sourceLabel}: "design"`);
  if (parsedDesign.entity !== 'viewport') {
    throw new PresetParseError(`${sourceLabel}: "design" must be rooted at a viewport`);
  }
  const design: EcsEntityDoc = ensureEntityComponentDependencies(parsedDesign);
  const invalidAnimationTarget = findInvalidAnimationTargets(design)[0];
  if (invalidAnimationTarget) {
    throw new PresetParseError(`${sourceLabel}: ${invalidAnimationTarget}`);
  }

  return {
    id: canonical.id,
    name: canonical.name,
    schemaVersion: canonical.schemaVersion,
    timing: canonical.timing,
    captionLayout: canonical.captionLayout,
    stateWindow: canonical.stateWindow,
    metadata: canonical.metadata,
    preview: parsedPreview,
    design,
  };
}

export function serializePresetDocument(preset: PresetEditorState): Record<string, unknown> {
  const serializedPreview = serializeNode(preset.preview);
  if (!isRecord(serializedPreview)) {
    throw new Error('Preset preview must serialize to an object.');
  }
  const preview =
    preset.preview.aspectRatio !== undefined
      ? { aspectRatio: preset.preview.aspectRatio, ...serializedPreview }
      : serializedPreview;
  const canonicalPreset: EcsCaptionPreset = {
    id: preset.id,
    name: preset.name,
    schemaVersion: preset.schemaVersion,
    captionLayout: preset.captionLayout,
    stateWindow: preset.stateWindow,
    design: serializeEcsEntity(preset.design),
    preview,
    ...(preset.timing === undefined ? {} : { timing: preset.timing }),
    ...(preset.metadata === undefined ? {} : { metadata: preset.metadata }),
  };
  const out = serializeEcsCaptionPreset(canonicalPreset);
  const rounded = roundSerializedNumbers(out);
  if (!isRecord(rounded)) {
    throw new Error('Serialized preset must be an object.');
  }
  return rounded;
}

/** Converts normalized editor state into the engine's canonical preset contract for rendering. */
export function toEcsCaptionPreset(preset: PresetEditorState): EcsCaptionPreset {
  return parseEcsCaptionPreset(serializePresetDocument(preset), `Studio preset "${preset.id}"`);
}

/** Deep-clones a preset document (structuredClone is safe here: pure JSON-ish data). */
export function clonePresetDocument(preset: PresetEditorState): PresetEditorState {
  return structuredClone(preset);
}

/** Immutably replaces the preset's ECS `design` tree (used by the sectioned entity editor). */
export function updatePresetDesign(preset: PresetEditorState, design: EcsEntityDoc): PresetEditorState {
  return { ...preset, design };
}
