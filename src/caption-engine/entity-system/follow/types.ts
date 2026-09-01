export const FOLLOW_TARGET_KINDS = [
  'parent',
  'currentWord',
  'previousWord',
  'nextWord',
  'currentRow',
  'previousRow',
  'nextRow',
  'currentPage',
  'entity',
] as const;
export type FollowTargetKind = (typeof FOLLOW_TARGET_KINDS)[number];

export const FOLLOW_TARGET_SCOPES = ['local', 'timeline'] as const;
export type FollowTargetScope = (typeof FOLLOW_TARGET_SCOPES)[number];

export const FOLLOW_BOUNDARY_HANDOFFS = ['snap', 'allowTransition'] as const;
export type FollowBoundaryHandoff = (typeof FOLLOW_BOUNDARY_HANDOFFS)[number];

export const FOLLOW_TRANSITION_SCOPES = ['all', 'sameParent', 'samePage'] as const;
export type FollowTransitionScope = (typeof FOLLOW_TRANSITION_SCOPES)[number];

export const FOLLOW_MODES = ['auto', 'timeline', 'live'] as const;
export type FollowMode = (typeof FOLLOW_MODES)[number];

export const FOLLOW_SOURCE_PATHS = [
  'bounds.x',
  'bounds.y',
  'bounds.width',
  'bounds.height',
  'transform.position.x',
  'transform.position.y',
  'transform.rotation',
  'transform.scale.x',
  'transform.scale.y',
  'transform.opacity',
] as const;
export type FollowSourcePath = (typeof FOLLOW_SOURCE_PATHS)[number];

export const FOLLOW_DESTINATION_PATHS = [
  'Transform.position.x',
  'Transform.position.y',
  'Transform.width',
  'Transform.height',
  'Transform.rotation',
  'Transform.scale.x',
  'Transform.scale.y',
  'Transform.opacity',
] as const;
export type FollowDestinationPath = (typeof FOLLOW_DESTINATION_PATHS)[number];

export interface FollowSourceDefinition {
  path: FollowSourcePath;
  label: string;
}

export const FOLLOW_SOURCE_DEFINITIONS: readonly FollowSourceDefinition[] = [
  { path: 'bounds.x', label: 'Bounds X' },
  { path: 'bounds.y', label: 'Bounds Y' },
  { path: 'bounds.width', label: 'Bounds Width' },
  { path: 'bounds.height', label: 'Bounds Height' },
  { path: 'transform.position.x', label: 'Position X' },
  { path: 'transform.position.y', label: 'Position Y' },
  { path: 'transform.rotation', label: 'Rotation' },
  { path: 'transform.scale.x', label: 'Scale X' },
  { path: 'transform.scale.y', label: 'Scale Y' },
  { path: 'transform.opacity', label: 'Opacity' },
] as const;

export type FollowPropertyId =
  | 'width'
  | 'height'
  | 'positionX'
  | 'positionY'
  | 'scaleX'
  | 'scaleY'
  | 'opacity';

export type FollowOffsetUnit = 'dimension' | 'position' | 'scale' | 'opacity';

export interface FollowPropertyDefinition {
  id: FollowPropertyId;
  label: string;
  destination: FollowDestinationPath;
  sourcePaths: readonly FollowSourcePath[];
  offsetUnit: FollowOffsetUnit;
}

export const FOLLOW_PROPERTY_DEFINITIONS: readonly FollowPropertyDefinition[] = [
  {
    id: 'width',
    label: 'Width',
    destination: 'Transform.width',
    sourcePaths: ['bounds.width'],
    offsetUnit: 'dimension',
  },
  {
    id: 'height',
    label: 'Height',
    destination: 'Transform.height',
    sourcePaths: ['bounds.height'],
    offsetUnit: 'dimension',
  },
  {
    id: 'positionX',
    label: 'Position X',
    destination: 'Transform.position.x',
    sourcePaths: ['bounds.x', 'transform.position.x'],
    offsetUnit: 'position',
  },
  {
    id: 'positionY',
    label: 'Position Y',
    destination: 'Transform.position.y',
    sourcePaths: ['bounds.y', 'transform.position.y'],
    offsetUnit: 'position',
  },
  {
    id: 'scaleX',
    label: 'Scale X',
    destination: 'Transform.scale.x',
    sourcePaths: ['transform.scale.x'],
    offsetUnit: 'scale',
  },
  {
    id: 'scaleY',
    label: 'Scale Y',
    destination: 'Transform.scale.y',
    sourcePaths: ['transform.scale.y'],
    offsetUnit: 'scale',
  },
  {
    id: 'opacity',
    label: 'Opacity',
    destination: 'Transform.opacity',
    sourcePaths: ['transform.opacity'],
    offsetUnit: 'opacity',
  },
] as const;

export const FOLLOW_ANCHORS = [
  'topLeft',
  'topCenter',
  'topRight',
  'centerLeft',
  'center',
  'centerRight',
  'bottomLeft',
  'bottomCenter',
  'bottomRight',
] as const;
export type FollowAnchor = (typeof FOLLOW_ANCHORS)[number];

export interface FollowMapping {
  destination: string;
  source: string;
  offset?: number;
}

export const FOLLOW_TARGET_BOUNDS_MAPPINGS: readonly FollowMapping[] = [
  { destination: 'Transform.position.x', source: 'bounds.x' },
  { destination: 'Transform.position.y', source: 'bounds.y' },
  { destination: 'Transform.width', source: 'bounds.width' },
  { destination: 'Transform.height', source: 'bounds.height' },
] as const;

export interface FollowTargetConfig {
  mode: FollowMode;
  delaySeconds: number;
  target: FollowTargetKind;
  targetId?: string | undefined;
  targetScope: FollowTargetScope;
  boundaryHandoff: FollowBoundaryHandoff;
  transitionScope: FollowTransitionScope;
  anchor: FollowAnchor;
  mappings: FollowMapping[];
}

export const DEFAULT_FOLLOW_TARGET_CONFIG: FollowTargetConfig = {
  mode: 'auto',
  delaySeconds: 0,
  target: 'entity',
  targetScope: 'local',
  boundaryHandoff: 'snap',
  transitionScope: 'all',
  anchor: 'center',
  mappings: [],
};

export function normalizeFollowMode(value: unknown): FollowMode {
  return (FOLLOW_MODES as readonly string[]).includes(value as string)
    ? (value as FollowMode)
    : DEFAULT_FOLLOW_TARGET_CONFIG.mode;
}

export function normalizeFollowDelay(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : DEFAULT_FOLLOW_TARGET_CONFIG.delaySeconds;
}

export function normalizeFollowTarget(value: unknown): FollowTargetKind {
  return (FOLLOW_TARGET_KINDS as readonly string[]).includes(value as string)
    ? (value as FollowTargetKind)
    : DEFAULT_FOLLOW_TARGET_CONFIG.target;
}

export function normalizeFollowTargetScope(value: unknown): FollowTargetScope {
  return (FOLLOW_TARGET_SCOPES as readonly string[]).includes(value as string)
    ? (value as FollowTargetScope)
    : DEFAULT_FOLLOW_TARGET_CONFIG.targetScope;
}

export function normalizeFollowBoundaryHandoff(value: unknown): FollowBoundaryHandoff {
  return (FOLLOW_BOUNDARY_HANDOFFS as readonly string[]).includes(value as string)
    ? (value as FollowBoundaryHandoff)
    : DEFAULT_FOLLOW_TARGET_CONFIG.boundaryHandoff;
}

export function normalizeFollowTransitionScope(value: unknown): FollowTransitionScope {
  return (FOLLOW_TRANSITION_SCOPES as readonly string[]).includes(value as string)
    ? (value as FollowTransitionScope)
    : DEFAULT_FOLLOW_TARGET_CONFIG.transitionScope;
}

export function normalizeFollowAnchor(value: unknown): FollowAnchor {
  return (FOLLOW_ANCHORS as readonly string[]).includes(value as string)
    ? (value as FollowAnchor)
    : DEFAULT_FOLLOW_TARGET_CONFIG.anchor;
}

export function normalizeFollowMappings(value: unknown): FollowMapping[] {
  if (!Array.isArray(value)) return [];
  const destinations = new Set<string>();
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const mapping = entry as { destination?: unknown; source?: unknown; offset?: unknown };
    if (typeof mapping.destination !== 'string' || typeof mapping.source !== 'string') return [];
    if (destinations.has(mapping.destination)) return [];
    destinations.add(mapping.destination);
    return [
      {
        destination: mapping.destination,
        source: mapping.source,
        ...(typeof mapping.offset === 'number' && Number.isFinite(mapping.offset)
          ? { offset: mapping.offset }
          : {}),
      },
    ];
  });
}
