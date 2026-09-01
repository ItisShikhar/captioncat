import { type EcsEntityDoc, type PropertyNode } from '@/schema';
import { previewDebugOverlay, type DebugEntityKind, type DebugOverlaySurface } from '../constants';

export type { DebugEntityKind, DebugOverlaySurface } from '../constants';

export interface PaddingPreviewValue {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Shared vocabulary for the "what is this entity?" hover-debug-grid feature:
 * hovering a small icon next to a card title (Composition Area/Page/Rows/Words in
 * `DesignEditor`) highlights that entity's real, engine-computed bounding
 * box(es) in the live preview (`LivePreviewPanel`). Lives in its own module
 * since both of those sibling components (and their shared parent, `app.tsx`,
 * which owns the hover state so it can cross between them) need it.
 */
export interface PaddingPreviewTarget {
  kind: DebugEntityKind;
  component: 'layout' | 'backgroundStyle';
  fieldKey: 'padding' | 'bandPadding' | 'blockPadding';
  value: PaddingPreviewValue;
}

export interface PositionPreviewTarget {
  kind: DebugEntityKind;
  value: { x: number; y: number };
}

export type DebugWordState = 'past' | 'previous' | 'current' | 'next' | 'future';
export type DebugRowState = 'default' | DebugWordState;
export type DebugOverlayState = DebugRowState | DebugWordState;

export const DEBUG_WORD_STATES: DebugWordState[] = ['past', 'previous', 'current', 'next', 'future'];
export const DEBUG_ROW_STATES: DebugRowState[] = ['default', 'past', 'previous', 'current', 'next', 'future'];

/** Every entity kind, in the same fixed display order used throughout the studio - used by the "toggle all overlays" feature to show every box at once. */
export const ALL_DEBUG_ENTITY_KINDS: DebugEntityKind[] = [...previewDebugOverlay.entityKinds];

/** Surface capabilities keep scene-only entities out of caption-only preview controls. */
export const DEBUG_OVERLAY_SURFACE_ENTITY_KINDS: Record<DebugOverlaySurface, readonly DebugEntityKind[]> =
  previewDebugOverlay.surfaceEntityKinds;

export type DebugOverlayPinState = 'inherited' | 'explicitlyEnabled' | 'explicitlyDisabled';

export interface PreviewOverlayStateSelection {
  word: DebugWordState[];
  row: DebugRowState[];
}

export interface PreviewOverlayPins {
  entityKinds: DebugEntityKind[];
  paddingTargets: DebugEntityKind[];
  positionTargets: DebugEntityKind[];
}

interface PreviewOverlayStateOverrides {
  word: Partial<Record<DebugWordState, DebugOverlayPinState>>;
  row: Partial<Record<DebugRowState, DebugOverlayPinState>>;
}

export interface PreviewOverlayOverrides {
  entityKinds: Partial<Record<DebugEntityKind, DebugOverlayPinState>>;
  paddingTargets: Partial<Record<DebugEntityKind, DebugOverlayPinState>>;
  positionTargets: Partial<Record<DebugEntityKind, DebugOverlayPinState>>;
  wordStates: Partial<Record<DebugWordState, DebugOverlayPinState>>;
  rowStates: Partial<Record<DebugRowState, DebugOverlayPinState>>;
  paddingStates: PreviewOverlayStateOverrides;
  positionStates: PreviewOverlayStateOverrides;
}

export interface PreviewOverlayVisibility {
  enabled: boolean;
  entityKinds: DebugEntityKind[];
  paddingTargets: PaddingPreviewTarget[];
  positionTargets: PositionPreviewTarget[];
  wordStates: DebugWordState[];
  rowStates: DebugRowState[];
  paddingStates: PreviewOverlayStateSelection;
  positionStates: PreviewOverlayStateSelection;
  pins: PreviewOverlayPins;
  overrides: PreviewOverlayOverrides;
}

function createPreviewOverlayPins(): PreviewOverlayPins {
  return {
    entityKinds: [],
    paddingTargets: [],
    positionTargets: [],
  };
}

function createPreviewOverlayOverrides(): PreviewOverlayOverrides {
  return {
    entityKinds: {},
    paddingTargets: {},
    positionTargets: {},
    wordStates: {},
    rowStates: {},
    paddingStates: { word: {}, row: {} },
    positionStates: { word: {}, row: {} },
  };
}

export function createPreviewOverlayVisibility(options?: DebugOverlayOptions): PreviewOverlayVisibility {
  const selectAll = previewDebugOverlay.defaults.selectAll && options !== undefined;
  const selectPositions = selectAll && previewDebugOverlay.defaults.selectPositions;
  return {
    enabled: previewDebugOverlay.defaults.enabled,
    entityKinds: selectAll ? [...options.entities] : [],
    paddingTargets: selectAll ? [...options.paddingTargets] : [],
    positionTargets: selectPositions ? [...options.positionTargets] : [],
    wordStates: selectAll && options.entities.includes('word') ? [...DEBUG_WORD_STATES] : [],
    rowStates: selectAll && options.entities.includes('row') ? [...DEBUG_ROW_STATES] : [],
    paddingStates: {
      word: selectAll && options.entities.includes('word') ? [...DEBUG_WORD_STATES] : [],
      row: selectAll && options.entities.includes('row') ? [...DEBUG_ROW_STATES] : [],
    },
    positionStates: {
      word: selectPositions && options.entities.includes('word') ? [...DEBUG_WORD_STATES] : [],
      row: selectPositions && options.entities.includes('row') ? [...DEBUG_ROW_STATES] : [],
    },
    pins: createPreviewOverlayPins(),
    overrides: createPreviewOverlayOverrides(),
  };
}

function visibleFromPinState(state: DebugOverlayPinState | undefined, inherited: boolean): boolean {
  if (state === 'explicitlyDisabled') return false;
  if (state === 'explicitlyEnabled') return true;
  return inherited;
}

function pinState(value: DebugOverlayPinState | undefined): DebugOverlayPinState {
  return value ?? 'inherited';
}

function hasExplicitPinState(value: DebugOverlayPinState | undefined): boolean {
  return value === 'explicitlyEnabled' || value === 'explicitlyDisabled';
}

function togglePinnedKind(kinds: readonly DebugEntityKind[], kind: DebugEntityKind): DebugEntityKind[] {
  return kinds.includes(kind) ? kinds.filter((current) => current !== kind) : [...kinds, kind];
}

function hasPinnedKind(kinds: readonly DebugEntityKind[], kind: DebugEntityKind): boolean {
  return kinds.includes(kind);
}

function updatePinState<T extends string>(
  states: Partial<Record<T, DebugOverlayPinState>>,
  key: T,
  nextState: DebugOverlayPinState,
): Partial<Record<T, DebugOverlayPinState>> {
  if (nextState === 'inherited') {
    const next = { ...states };
    delete next[key];
    return next;
  }
  return { ...states, [key]: nextState };
}

function resolveVisibility(
  visibility: PreviewOverlayVisibility,
  options: DebugOverlayOptions,
): PreviewOverlayVisibility {
  const { overrides } = visibility;
  const entityVisible = (kind: DebugEntityKind): boolean =>
    visibleFromPinState(overrides.entityKinds[kind], visibility.entityKinds.includes(kind));
  const stateSelection = <T extends string>(
    kind: DebugEntityKind,
    states: readonly T[],
    stateOverrides: Partial<Record<T, DebugOverlayPinState>>,
    selectedStates: readonly T[],
  ): T[] => {
    const parentVisible = entityVisible(kind);
    return states.filter((state) =>
      parentVisible
        ? visibleFromPinState(stateOverrides[state], selectedStates.includes(state))
        : stateOverrides[state] === 'explicitlyEnabled',
    );
  };
  const targetVisible = (
    kind: DebugEntityKind,
    targetOverride: DebugOverlayPinState | undefined,
    selected: boolean,
    stateOverrides: Partial<Record<string, DebugOverlayPinState>>,
  ): boolean => {
    const baseVisible = entityVisible(kind) && visibleFromPinState(targetOverride, selected);
    const hasExplicitState = Object.values(stateOverrides).some((state) => state === 'explicitlyEnabled');
    return baseVisible || hasExplicitState;
  };
  const stateTargetSelection = <T extends string>(
    kind: DebugEntityKind,
    states: readonly T[],
    targetOverride: DebugOverlayPinState | undefined,
    stateOverrides: Partial<Record<T, DebugOverlayPinState>>,
    selectedTarget: boolean,
    selectedStates: readonly T[],
  ): T[] => {
    const baseVisible = entityVisible(kind) && visibleFromPinState(targetOverride, selectedTarget);
    if (!baseVisible && !Object.values(stateOverrides).some((state) => state === 'explicitlyEnabled')) return [];
    return states.filter((state) =>
      baseVisible
        ? visibleFromPinState(stateOverrides[state], selectedStates.includes(state))
        : stateOverrides[state] === 'explicitlyEnabled',
    );
  };

  return {
    ...visibility,
    entityKinds: options.entities.filter(entityVisible),
    paddingTargets: options.paddingTargets.filter((target) =>
      targetVisible(
        target.kind,
        overrides.paddingTargets[target.kind],
        visibility.paddingTargets.some((current) => current.kind === target.kind),
        stateOverridesForTarget(overrides, target.kind, 'padding'),
      ),
    ),
    positionTargets: options.positionTargets.filter((target) =>
      targetVisible(
        target.kind,
        overrides.positionTargets[target.kind],
        visibility.positionTargets.some((current) => current.kind === target.kind),
        stateOverridesForTarget(overrides, target.kind, 'position'),
      ),
    ),
    wordStates: options.entities.includes('word')
      ? stateSelection('word', DEBUG_WORD_STATES, overrides.wordStates, visibility.wordStates)
      : [],
    rowStates: options.entities.includes('row')
      ? stateSelection('row', DEBUG_ROW_STATES, overrides.rowStates, visibility.rowStates)
      : [],
    paddingStates: {
      word:
        options.entities.includes('word') && options.paddingTargets.some((target) => target.kind === 'word')
          ? stateTargetSelection(
              'word',
              DEBUG_WORD_STATES,
              overrides.paddingTargets.word,
              overrides.paddingStates.word,
              visibility.paddingTargets.some((target) => target.kind === 'word'),
              visibility.paddingStates.word,
            )
          : [],
      row:
        options.entities.includes('row') && options.paddingTargets.some((target) => target.kind === 'row')
          ? stateTargetSelection(
              'row',
              DEBUG_ROW_STATES,
              overrides.paddingTargets.row,
              overrides.paddingStates.row,
              visibility.paddingTargets.some((target) => target.kind === 'row'),
              visibility.paddingStates.row,
            )
          : [],
    },
    positionStates: {
      word:
        options.entities.includes('word') && options.positionTargets.some((target) => target.kind === 'word')
          ? stateTargetSelection(
              'word',
              DEBUG_WORD_STATES,
              overrides.positionTargets.word,
              overrides.positionStates.word,
              visibility.positionTargets.some((target) => target.kind === 'word'),
              visibility.positionStates.word,
            )
          : [],
      row:
        options.entities.includes('row') && options.positionTargets.some((target) => target.kind === 'row')
          ? stateTargetSelection(
              'row',
              DEBUG_ROW_STATES,
              overrides.positionTargets.row,
              overrides.positionStates.row,
              visibility.positionTargets.some((target) => target.kind === 'row'),
              visibility.positionStates.row,
            )
          : [],
    },
  };
}

function stateOverridesForTarget(
  overrides: PreviewOverlayOverrides,
  kind: DebugEntityKind,
  targetType: 'padding' | 'position',
): Partial<Record<string, DebugOverlayPinState>> {
  if (kind === 'word') return targetType === 'padding' ? overrides.paddingStates.word : overrides.positionStates.word;
  if (kind === 'row') return targetType === 'padding' ? overrides.paddingStates.row : overrides.positionStates.row;
  return {};
}

export function resolvePreviewOverlayVisibility(
  visibility: PreviewOverlayVisibility,
  options: DebugOverlayOptions,
): PreviewOverlayVisibility {
  return resolveVisibility(visibility, options);
}

export function hasPreviewOverlayOverrides(visibility: PreviewOverlayVisibility): boolean {
  return (
    Object.values(visibility.overrides.entityKinds).some(hasExplicitPinState) ||
    Object.values(visibility.overrides.paddingTargets).some(hasExplicitPinState) ||
    Object.values(visibility.overrides.positionTargets).some(hasExplicitPinState) ||
    Object.values(visibility.overrides.wordStates).some(hasExplicitPinState) ||
    Object.values(visibility.overrides.rowStates).some(hasExplicitPinState) ||
    Object.values(visibility.overrides.paddingStates.word).some(hasExplicitPinState) ||
    Object.values(visibility.overrides.paddingStates.row).some(hasExplicitPinState) ||
    Object.values(visibility.overrides.positionStates.word).some(hasExplicitPinState) ||
    Object.values(visibility.overrides.positionStates.row).some(hasExplicitPinState)
  );
}

export function hasPreviewOverlayPins(visibility: PreviewOverlayVisibility): boolean {
  return (
    visibility.pins.entityKinds.length > 0 ||
    visibility.pins.paddingTargets.length > 0 ||
    visibility.pins.positionTargets.length > 0
  );
}

export function hasPreviewOverlaySelection(visibility: PreviewOverlayVisibility): boolean {
  return (
    visibility.entityKinds.length > 0 ||
    visibility.paddingTargets.length > 0 ||
    visibility.positionTargets.length > 0 ||
    visibility.wordStates.length > 0 ||
    visibility.rowStates.length > 0 ||
    visibility.paddingStates.word.length > 0 ||
    visibility.paddingStates.row.length > 0 ||
    visibility.positionStates.word.length > 0 ||
    visibility.positionStates.row.length > 0
  );
}

export function previewOverlayEntityIsPinned(visibility: PreviewOverlayVisibility, kind: DebugEntityKind): boolean {
  return hasPinnedKind(visibility.pins.entityKinds, kind);
}

export function previewOverlayPaddingIsPinned(
  visibility: PreviewOverlayVisibility,
  target: PaddingPreviewTarget,
): boolean {
  return hasPinnedKind(visibility.pins.paddingTargets, target.kind);
}

export function previewOverlayPositionIsPinned(
  visibility: PreviewOverlayVisibility,
  target: PositionPreviewTarget,
): boolean {
  return hasPinnedKind(visibility.pins.positionTargets, target.kind);
}

export function previewOverlayPaddingStateIsSelected(
  visibility: PreviewOverlayVisibility,
  kind: 'row' | 'word',
  state: DebugOverlayState,
): boolean {
  return kind === 'word'
    ? visibility.paddingStates.word.includes(state as DebugWordState)
    : visibility.paddingStates.row.includes(state as DebugRowState);
}

export function previewOverlayPositionStateIsSelected(
  visibility: PreviewOverlayVisibility,
  kind: 'row' | 'word',
  state: DebugOverlayState,
): boolean {
  return kind === 'word'
    ? visibility.positionStates.word.includes(state as DebugWordState)
    : visibility.positionStates.row.includes(state as DebugRowState);
}

function nextTogglePinState(
  currentState: DebugOverlayPinState,
  currentlyVisible: boolean,
): DebugOverlayPinState {
  if (currentState !== 'inherited') return 'inherited';
  return currentlyVisible ? 'explicitlyDisabled' : 'explicitlyEnabled';
}

export function togglePreviewOverlayEntity(
  visibility: PreviewOverlayVisibility,
  kind: DebugEntityKind,
  options: DebugOverlayOptions,
): PreviewOverlayVisibility {
  if (!options.entities.includes(kind)) return visibility;
  const resolved = resolveVisibility(visibility, options);
  const currentState = pinState(visibility.overrides.entityKinds[kind]);
  const nextState = nextTogglePinState(currentState, resolved.entityKinds.includes(kind));
  return resolveVisibility(
    {
      ...visibility,
      overrides: {
        ...visibility.overrides,
        entityKinds: updatePinState(visibility.overrides.entityKinds, kind, nextState),
      },
    },
    options,
  );
}

export function togglePreviewOverlayPadding(
  visibility: PreviewOverlayVisibility,
  target: PaddingPreviewTarget,
  options: DebugOverlayOptions,
): PreviewOverlayVisibility {
  if (!options.paddingTargets.some((candidate) => candidate.kind === target.kind)) return visibility;
  const resolved = resolveVisibility(visibility, options);
  const currentState = pinState(visibility.overrides.paddingTargets[target.kind]);
  const nextState = nextTogglePinState(
    currentState,
    resolved.paddingTargets.some((candidate) => candidate.kind === target.kind),
  );
  return resolveVisibility(
    {
      ...visibility,
      overrides: {
        ...visibility.overrides,
        paddingTargets: updatePinState(visibility.overrides.paddingTargets, target.kind, nextState),
      },
    },
    options,
  );
}

export function togglePreviewOverlayPosition(
  visibility: PreviewOverlayVisibility,
  target: PositionPreviewTarget,
  options: DebugOverlayOptions,
): PreviewOverlayVisibility {
  if (!options.positionTargets.some((candidate) => candidate.kind === target.kind)) return visibility;
  const resolved = resolveVisibility(visibility, options);
  const currentState = pinState(visibility.overrides.positionTargets[target.kind]);
  const nextState = nextTogglePinState(
    currentState,
    resolved.positionTargets.some((candidate) => candidate.kind === target.kind),
  );
  return resolveVisibility(
    {
      ...visibility,
      overrides: {
        ...visibility.overrides,
        positionTargets: updatePinState(visibility.overrides.positionTargets, target.kind, nextState),
      },
    },
    options,
  );
}

export function togglePreviewOverlayEntityPin(
  visibility: PreviewOverlayVisibility,
  kind: DebugEntityKind,
  options: DebugOverlayOptions,
): PreviewOverlayVisibility {
  if (!options.entities.includes(kind)) return visibility;
  return {
    ...visibility,
    pins: {
      ...visibility.pins,
      entityKinds: togglePinnedKind(visibility.pins.entityKinds, kind),
    },
  };
}

export function togglePreviewOverlayPaddingPin(
  visibility: PreviewOverlayVisibility,
  target: PaddingPreviewTarget,
  options: DebugOverlayOptions,
): PreviewOverlayVisibility {
  if (!options.paddingTargets.some((candidate) => candidate.kind === target.kind)) return visibility;
  return {
    ...visibility,
    pins: {
      ...visibility.pins,
      paddingTargets: togglePinnedKind(visibility.pins.paddingTargets, target.kind),
    },
  };
}

export function togglePreviewOverlayPositionPin(
  visibility: PreviewOverlayVisibility,
  target: PositionPreviewTarget,
  options: DebugOverlayOptions,
): PreviewOverlayVisibility {
  if (!options.positionTargets.some((candidate) => candidate.kind === target.kind)) return visibility;
  return {
    ...visibility,
    pins: {
      ...visibility.pins,
      positionTargets: togglePinnedKind(visibility.pins.positionTargets, target.kind),
    },
  };
}

export function togglePreviewOverlayPaddingState(
  visibility: PreviewOverlayVisibility,
  kind: 'row' | 'word',
  state: DebugOverlayState,
  options: DebugOverlayOptions,
): PreviewOverlayVisibility {
  if (!options.entities.includes(kind) || !options.paddingTargets.some((target) => target.kind === kind)) return visibility;
  const resolved = resolveVisibility(visibility, options);
  const currentState =
    kind === 'word'
      ? pinState(visibility.overrides.paddingStates.word[state as DebugWordState])
      : pinState(visibility.overrides.paddingStates.row[state as DebugRowState]);
  const nextState = nextTogglePinState(
    currentState,
    previewOverlayPaddingStateIsSelected(resolved, kind, state),
  );
  const paddingStates =
    kind === 'word'
      ? {
          ...visibility.overrides.paddingStates,
          word: updatePinState(visibility.overrides.paddingStates.word, state as DebugWordState, nextState),
        }
      : {
          ...visibility.overrides.paddingStates,
          row: updatePinState(visibility.overrides.paddingStates.row, state as DebugRowState, nextState),
        };
  return resolveVisibility(
    {
      ...visibility,
      overrides: {
        ...visibility.overrides,
        paddingStates,
      },
    },
    options,
  );
}

export function togglePreviewOverlayPositionState(
  visibility: PreviewOverlayVisibility,
  kind: 'row' | 'word',
  state: DebugOverlayState,
  options: DebugOverlayOptions,
): PreviewOverlayVisibility {
  if (!options.entities.includes(kind) || !options.positionTargets.some((target) => target.kind === kind)) return visibility;
  const resolved = resolveVisibility(visibility, options);
  const currentState =
    kind === 'word'
      ? pinState(visibility.overrides.positionStates.word[state as DebugWordState])
      : pinState(visibility.overrides.positionStates.row[state as DebugRowState]);
  const nextState = nextTogglePinState(
    currentState,
    previewOverlayPositionStateIsSelected(resolved, kind, state),
  );
  const positionStates =
    kind === 'word'
      ? {
          ...visibility.overrides.positionStates,
          word: updatePinState(visibility.overrides.positionStates.word, state as DebugWordState, nextState),
        }
      : {
          ...visibility.overrides.positionStates,
          row: updatePinState(visibility.overrides.positionStates.row, state as DebugRowState, nextState),
        };
  return resolveVisibility(
    {
      ...visibility,
      overrides: {
        ...visibility.overrides,
        positionStates,
      },
    },
    options,
  );
}

export function togglePreviewOverlayWordState(
  visibility: PreviewOverlayVisibility,
  state: DebugWordState,
  options: DebugOverlayOptions,
): PreviewOverlayVisibility {
  if (!options.entities.includes('word')) return visibility;
  const resolved = resolveVisibility(visibility, options);
  const currentState = pinState(visibility.overrides.wordStates[state]);
  const nextState = nextTogglePinState(currentState, resolved.wordStates.includes(state));
  return resolveVisibility(
    {
      ...visibility,
      overrides: {
        ...visibility.overrides,
        wordStates: updatePinState(visibility.overrides.wordStates, state, nextState),
      },
    },
    options,
  );
}

export function togglePreviewOverlayRowState(
  visibility: PreviewOverlayVisibility,
  state: DebugRowState,
  options: DebugOverlayOptions,
): PreviewOverlayVisibility {
  if (!options.entities.includes('row')) return visibility;
  const resolved = resolveVisibility(visibility, options);
  const currentState = pinState(visibility.overrides.rowStates[state]);
  const nextState = nextTogglePinState(currentState, resolved.rowStates.includes(state));
  return resolveVisibility(
    {
      ...visibility,
      overrides: {
        ...visibility.overrides,
        rowStates: updatePinState(visibility.overrides.rowStates, state, nextState),
      },
    },
    options,
  );
}

function allOverlaySelection(
  visibility: PreviewOverlayVisibility,
  options: DebugOverlayOptions,
): PreviewOverlayVisibility {
  return {
    ...visibility,
    entityKinds: [...options.entities],
    paddingTargets: [...options.paddingTargets],
    positionTargets: [...options.positionTargets],
    wordStates: options.entities.includes('word') ? [...DEBUG_WORD_STATES] : [],
    rowStates: options.entities.includes('row') ? [...DEBUG_ROW_STATES] : [],
    paddingStates: {
      word: options.entities.includes('word') ? [...DEBUG_WORD_STATES] : [],
      row: options.entities.includes('row') ? [...DEBUG_ROW_STATES] : [],
    },
    positionStates: {
      word: options.entities.includes('word') ? [...DEBUG_WORD_STATES] : [],
      row: options.entities.includes('row') ? [...DEBUG_ROW_STATES] : [],
    },
    overrides: createPreviewOverlayOverrides(),
  };
}

function disabledEntityOverrides(
  options: DebugOverlayOptions,
): Partial<Record<DebugEntityKind, DebugOverlayPinState>> {
  const states: Partial<Record<DebugEntityKind, DebugOverlayPinState>> = {};
  for (const kind of options.entities) states[kind] = 'explicitlyDisabled';
  return states;
}

export function setPreviewOverlaySelection(
  visibility: PreviewOverlayVisibility,
  options: DebugOverlayOptions,
  selectAll: boolean,
): PreviewOverlayVisibility {
  if (selectAll) return allOverlaySelection(visibility, options);
  return resolveVisibility(
    {
      ...visibility,
      overrides: {
        ...createPreviewOverlayOverrides(),
        entityKinds: disabledEntityOverrides(options),
      },
    },
    options,
  );
}

function pinnedOverlaySelectionFromPins(
  visibility: PreviewOverlayVisibility,
  options: DebugOverlayOptions,
): PreviewOverlayVisibility {
  const pinnedEntityKinds = options.entities.filter((kind) => visibility.pins.entityKinds.includes(kind));
  const pinnedEntitySet = new Set(pinnedEntityKinds);
  const paddingTargets = options.paddingTargets.filter(
    (target) => pinnedEntitySet.has(target.kind) || visibility.pins.paddingTargets.includes(target.kind),
  );
  const positionTargets = options.positionTargets.filter(
    (target) => visibility.pins.positionTargets.includes(target.kind),
  );
  const hasPinnedWord =
    pinnedEntitySet.has('word') ||
    paddingTargets.some((target) => target.kind === 'word') ||
    positionTargets.some((target) => target.kind === 'word');
  const hasPinnedRow =
    pinnedEntitySet.has('row') ||
    paddingTargets.some((target) => target.kind === 'row') ||
    positionTargets.some((target) => target.kind === 'row');
  const hasPinnedPositionWord = positionTargets.some((target) => target.kind === 'word');
  const hasPinnedPositionRow = positionTargets.some((target) => target.kind === 'row');

  return {
    ...visibility,
    entityKinds: pinnedEntityKinds,
    paddingTargets,
    positionTargets,
    wordStates: hasPinnedWord ? [...DEBUG_WORD_STATES] : [],
    rowStates: hasPinnedRow ? [...DEBUG_ROW_STATES] : [],
    paddingStates: {
      word: hasPinnedWord ? [...DEBUG_WORD_STATES] : [],
      row: hasPinnedRow ? [...DEBUG_ROW_STATES] : [],
    },
    positionStates: {
      word: hasPinnedPositionWord ? [...DEBUG_WORD_STATES] : [],
      row: hasPinnedPositionRow ? [...DEBUG_ROW_STATES] : [],
    },
    enabled: true,
  };
}

function mergeOverlayValues<T>(base: readonly T[], additions: readonly T[]): T[] {
  return [...new Set([...base, ...additions])];
}

function mergeOverlayTargets<T extends { kind: DebugEntityKind }>(
  base: readonly T[],
  additions: readonly T[],
): T[] {
  const targets = new Map<DebugEntityKind, T>();
  for (const target of base) targets.set(target.kind, target);
  for (const target of additions) targets.set(target.kind, target);
  return [...targets.values()];
}

export function resolvePreviewOverlayVisibilityForRender(
  visibility: PreviewOverlayVisibility,
  options: DebugOverlayOptions,
): PreviewOverlayVisibility {
  const resolved = visibility.enabled
    ? resolveVisibility(visibility, options)
    : {
        ...visibility,
        entityKinds: [],
        paddingTargets: [],
        positionTargets: [],
        wordStates: [],
        rowStates: [],
        paddingStates: { word: [], row: [] },
        positionStates: { word: [], row: [] },
      };
  if (!hasPreviewOverlayPins(visibility)) return resolved;

  const pinned = pinnedOverlaySelectionFromPins(visibility, options);
  return {
    ...resolved,
    enabled: true,
    entityKinds: mergeOverlayValues(resolved.entityKinds, pinned.entityKinds),
    paddingTargets: mergeOverlayTargets(resolved.paddingTargets, pinned.paddingTargets),
    positionTargets: mergeOverlayTargets(resolved.positionTargets, pinned.positionTargets),
    wordStates: mergeOverlayValues(resolved.wordStates, pinned.wordStates),
    rowStates: mergeOverlayValues(resolved.rowStates, pinned.rowStates),
    paddingStates: {
      word: mergeOverlayValues(resolved.paddingStates.word, pinned.paddingStates.word),
      row: mergeOverlayValues(resolved.paddingStates.row, pinned.paddingStates.row),
    },
    positionStates: {
      word: mergeOverlayValues(resolved.positionStates.word, pinned.positionStates.word),
      row: mergeOverlayValues(resolved.positionStates.row, pinned.positionStates.row),
    },
  };
}

export function togglePreviewOverlayGlobalVisibility(
  visibility: PreviewOverlayVisibility,
): PreviewOverlayVisibility {
  return { ...visibility, enabled: !visibility.enabled };
}

export type PreviewOverlayControlState = 'all' | 'mixed' | 'off';

export function previewOverlayControlState(
  visibility: PreviewOverlayVisibility,
  options: DebugOverlayOptions,
): PreviewOverlayControlState {
  const hasPins = hasPreviewOverlayPins(visibility);
  const resolved = resolveVisibility(visibility, options);
  if (!hasPins && !hasPreviewOverlaySelection(resolved)) return 'off';
  if (!visibility.enabled && hasPins) return 'mixed';
  if (hasPreviewOverlayOverrides(visibility) || !previewOverlaySelectionIsComplete(resolved, options)) return 'mixed';
  return 'all';
}

export interface DebugOverlayEntry {
  kind: DebugEntityKind;
  paddingTarget: PaddingPreviewTarget | null;
  positionTarget: PositionPreviewTarget | null;
  showPaddingOnly: boolean;
  showPositionOnly: boolean;
  wordStates: readonly DebugWordState[];
  rowStates: readonly DebugRowState[];
  paddingStates: readonly DebugOverlayState[];
  positionStates: readonly DebugOverlayState[];
}

export interface DebugOverlaySelection {
  visibility: PreviewOverlayVisibility;
  allowedEntityKinds?: readonly DebugEntityKind[];
  hoveredEntity?: DebugEntityKind | null;
  hoveredPaddingPreviewTarget?: PaddingPreviewTarget | null;
  hoveredPositionPreviewTarget?: PositionPreviewTarget | null;
}

export interface DebugOverlayOptions {
  entities: DebugEntityKind[];
  paddingTargets: PaddingPreviewTarget[];
  positionTargets: PositionPreviewTarget[];
}

export function previewOverlaySelectionIsComplete(
  visibility: PreviewOverlayVisibility,
  options: DebugOverlayOptions,
): boolean {
  return (
    options.entities.length > 0 &&
    options.entities.every((kind) => visibility.entityKinds.includes(kind)) &&
    options.positionTargets.every((target) =>
      visibility.positionTargets.some((current) => current.kind === target.kind),
    ) &&
    options.paddingTargets.every((target) =>
      visibility.paddingTargets.some((current) => current.kind === target.kind),
    ) &&
    (!options.entities.includes('word') ||
      (DEBUG_WORD_STATES.every((state) => visibility.paddingStates.word.includes(state)) &&
        DEBUG_WORD_STATES.every((state) => visibility.positionStates.word.includes(state)))) &&
    (!options.entities.includes('row') ||
      (DEBUG_ROW_STATES.every((state) => visibility.paddingStates.row.includes(state)) &&
        DEBUG_ROW_STATES.every((state) => visibility.positionStates.row.includes(state)))) &&
    (!options.entities.includes('word') ||
      DEBUG_WORD_STATES.every((state) => visibility.wordStates.includes(state))) &&
    (!options.entities.includes('row') || DEBUG_ROW_STATES.every((state) => visibility.rowStates.includes(state)))
  );
}

export type PreviewOverlayCheckboxState = boolean | 'indeterminate';

export function previewOverlayEntitySelectionState(
  visibility: PreviewOverlayVisibility,
  kind: DebugEntityKind,
): PreviewOverlayCheckboxState {
  const states =
    kind === 'word'
      ? visibility.wordStates
      : kind === 'row'
        ? visibility.rowStates
        : null;
  if (states === null) return visibility.entityKinds.includes(kind);
  if (states.length === 0) return false;
  const stateCount = kind === 'word' ? DEBUG_WORD_STATES.length : DEBUG_ROW_STATES.length;
  if (states.length === stateCount) return true;
  return 'indeterminate';
}

export function reconcilePreviewOverlayVisibility(
  visibility: PreviewOverlayVisibility,
  previousOptions: DebugOverlayOptions,
  nextOptions: DebugOverlayOptions,
): PreviewOverlayVisibility {
  const wasComplete =
    previewOverlaySelectionIsComplete(visibility, previousOptions) && !hasPreviewOverlayOverrides(visibility);
  const overrides = wasComplete
    ? createPreviewOverlayOverrides()
    : {
        entityKinds: filterPinStates(visibility.overrides.entityKinds, nextOptions.entities),
        paddingTargets: filterPinStates(
          visibility.overrides.paddingTargets,
          nextOptions.paddingTargets.map((target) => target.kind),
        ),
        positionTargets: filterPinStates(
          visibility.overrides.positionTargets,
          nextOptions.positionTargets.map((target) => target.kind),
        ),
        paddingStates: {
          word: filterPinStates(
            visibility.overrides.paddingStates.word,
            nextOptions.entities.includes('word') ? DEBUG_WORD_STATES : [],
          ),
          row: filterPinStates(
            visibility.overrides.paddingStates.row,
            nextOptions.entities.includes('row') ? DEBUG_ROW_STATES : [],
          ),
        },
        positionStates: {
          word: filterPinStates(
            visibility.overrides.positionStates.word,
            nextOptions.entities.includes('word') ? DEBUG_WORD_STATES : [],
          ),
          row: filterPinStates(
            visibility.overrides.positionStates.row,
            nextOptions.entities.includes('row') ? DEBUG_ROW_STATES : [],
          ),
        },
        wordStates: filterPinStates(
          visibility.overrides.wordStates,
          nextOptions.entities.includes('word') ? DEBUG_WORD_STATES : [],
        ),
        rowStates: filterPinStates(
          visibility.overrides.rowStates,
          nextOptions.entities.includes('row') ? DEBUG_ROW_STATES : [],
        ),
      };
  const pins: PreviewOverlayPins = {
    entityKinds: filterPinnedKinds(visibility.pins.entityKinds, nextOptions.entities),
    paddingTargets: filterPinnedKinds(
      visibility.pins.paddingTargets,
      nextOptions.paddingTargets.map((target) => target.kind),
    ),
    positionTargets: filterPinnedKinds(
      visibility.pins.positionTargets,
      nextOptions.positionTargets.map((target) => target.kind),
    ),
  };

  return resolveVisibility(
    {
      ...visibility,
      pins,
      overrides,
    },
    nextOptions,
  );
}

function filterPinStates<T extends string>(
  states: Partial<Record<T, DebugOverlayPinState>>,
  allowedKeys: readonly T[],
): Partial<Record<T, DebugOverlayPinState>> {
  const next: Partial<Record<T, DebugOverlayPinState>> = {};
  for (const key of allowedKeys) {
    const state = states[key];
    if (state && state !== 'inherited') next[key] = state;
  }
  return next;
}

function filterPinnedKinds(kinds: readonly DebugEntityKind[], allowedKinds: readonly DebugEntityKind[]): DebugEntityKind[] {
  const allowed = new Set(allowedKinds);
  return kinds.filter((kind) => allowed.has(kind));
}

function targetForKind<T extends { kind: DebugEntityKind }>(targets: readonly T[], kind: DebugEntityKind): T | null {
  return targets.find((target) => target.kind === kind) ?? null;
}

function statesForKind(
  states: PreviewOverlayStateSelection,
  kind: DebugEntityKind,
): readonly DebugOverlayState[] {
  if (kind === 'word') return states.word;
  if (kind === 'row') return states.row;
  return [];
}

function hasSelectedStatefulOverlay(visibility: PreviewOverlayVisibility, kind: 'row' | 'word'): boolean {
  const entityStates = kind === 'row' ? visibility.rowStates : visibility.wordStates;
  const paddingStates = kind === 'row' ? visibility.paddingStates.row : visibility.paddingStates.word;
  const positionStates = kind === 'row' ? visibility.positionStates.row : visibility.positionStates.word;
  return entityStates.length > 0 || paddingStates.length > 0 || positionStates.length > 0;
}

export function debugOverlayEntriesForPreset(
  {
    visibility,
    allowedEntityKinds = ALL_DEBUG_ENTITY_KINDS,
    hoveredEntity = null,
    hoveredPaddingPreviewTarget = null,
    hoveredPositionPreviewTarget = null,
  }: DebugOverlaySelection,
): DebugOverlayEntry[] {
  if (!visibility.enabled) return [];

  const allowedKinds = new Set(allowedEntityKinds);
  const canShowTransientKind = (kind: DebugEntityKind): boolean =>
    visibility.overrides.entityKinds[kind] !== 'explicitlyDisabled';
  const selectedStatefulKinds = (['row', 'word'] as const).filter(
    (kind) => allowedKinds.has(kind) && hasSelectedStatefulOverlay(visibility, kind),
  );
  const activeKinds = [
    ...new Set([
      ...visibility.entityKinds.filter((kind) => allowedKinds.has(kind)),
      ...selectedStatefulKinds,
      ...(hoveredEntity && allowedKinds.has(hoveredEntity) && canShowTransientKind(hoveredEntity)
        ? [hoveredEntity]
        : []),
    ]),
  ];
  const paddingTargets = visibility.paddingTargets.filter((target) => allowedKinds.has(target.kind));
  const positionTargets = visibility.positionTargets.filter((target) => allowedKinds.has(target.kind));
  if (
    hoveredPaddingPreviewTarget &&
    allowedKinds.has(hoveredPaddingPreviewTarget.kind) &&
    canShowTransientKind(hoveredPaddingPreviewTarget.kind) &&
    visibility.overrides.paddingTargets[hoveredPaddingPreviewTarget.kind] !== 'explicitlyDisabled' &&
    !paddingTargets.some((target) => paddingPreviewTargetsEqual(target, hoveredPaddingPreviewTarget))
  ) {
    paddingTargets.push(hoveredPaddingPreviewTarget);
  }
  if (
    hoveredPositionPreviewTarget &&
    allowedKinds.has(hoveredPositionPreviewTarget.kind) &&
    canShowTransientKind(hoveredPositionPreviewTarget.kind) &&
    visibility.overrides.positionTargets[hoveredPositionPreviewTarget.kind] !== 'explicitlyDisabled' &&
    !positionTargets.some((target) => positionPreviewTargetsEqual(target, hoveredPositionPreviewTarget))
  ) {
    positionTargets.push(hoveredPositionPreviewTarget);
  }

  const entries: DebugOverlayEntry[] = activeKinds.map((kind) => ({
    kind,
    paddingTarget: targetForKind(paddingTargets, kind),
    positionTarget: targetForKind(positionTargets, kind),
    showPaddingOnly: false,
    showPositionOnly: false,
    wordStates: visibility.wordStates,
    rowStates: visibility.rowStates,
    paddingStates: statesForKind(visibility.paddingStates, kind),
    positionStates: statesForKind(visibility.positionStates, kind),
  }));

  const addTargetOnly = (kind: DebugEntityKind, targetType: 'padding' | 'position'): void => {
    const existing = entries.find((entry) => entry.kind === kind);
    if (targetType === 'padding') {
      const target = targetForKind(paddingTargets, kind);
      if (!target) return;
      if (existing) {
        existing.paddingTarget = target;
        existing.showPaddingOnly = true;
        return;
      }
      entries.push({
        kind,
        paddingTarget: target,
        positionTarget: null,
        showPaddingOnly: true,
        showPositionOnly: false,
        wordStates: visibility.wordStates,
        rowStates: visibility.rowStates,
        paddingStates: statesForKind(visibility.paddingStates, kind),
        positionStates: statesForKind(visibility.positionStates, kind),
      });
      return;
    }
    const target = targetForKind(positionTargets, kind);
    if (!target) return;
    if (existing) {
      existing.positionTarget = target;
      existing.showPositionOnly = true;
      return;
    }
    entries.push({
      kind,
      paddingTarget: null,
      positionTarget: target,
      showPaddingOnly: false,
      showPositionOnly: true,
      wordStates: visibility.wordStates,
      rowStates: visibility.rowStates,
      paddingStates: statesForKind(visibility.paddingStates, kind),
      positionStates: statesForKind(visibility.positionStates, kind),
    });
  };

  for (const target of paddingTargets) {
    if (!activeKinds.includes(target.kind)) addTargetOnly(target.kind, 'padding');
  }
  for (const target of positionTargets) {
    if (!activeKinds.includes(target.kind)) addTargetOnly(target.kind, 'position');
  }

  return entries;
}

export function debugOverlayOptionsForPreset(
  root: EcsEntityDoc,
  allowedEntityKinds: readonly DebugEntityKind[] = ALL_DEBUG_ENTITY_KINDS,
): DebugOverlayOptions {
  const allowedKinds = new Set(allowedEntityKinds);
  const entities = ALL_DEBUG_ENTITY_KINDS.filter((kind) => allowedKinds.has(kind) && findEntityByKind(root, kind));
  return {
    entities,
    paddingTargets: entities.flatMap((kind) => {
      const entity = findEntityByKind(root, kind);
      const target = entity ? paddingPreviewTargetForEntity(entity) : null;
      return target ? [target] : [];
    }),
    positionTargets: entities.flatMap((kind) => {
      const entity = findEntityByKind(root, kind);
      const target = entity ? positionPreviewTargetForEntity(entity) : null;
      return target ? [target] : [];
    }),
  };
}

export function findEntityByKind(root: EcsEntityDoc, kind: string): EcsEntityDoc | undefined {
  if (root.entity === kind) return root;
  for (const child of root.children) {
    const found = findEntityByKind(child, kind);
    if (found) return found;
  }
  return undefined;
}

function positionPreviewTargetForEntity(entity: EcsEntityDoc): PositionPreviewTarget | null {
  if (!ALL_DEBUG_ENTITY_KINDS.includes(entity.entity as DebugEntityKind)) return null;
  const transform = entity.components.find((component) => component.component === 'transform');
  return {
    kind: entity.entity as DebugEntityKind,
    value: vector2ValueFromNode(transform?.props.position) ?? { x: 0, y: 0 },
  };
}

function vector2ValueFromNode(node: PropertyNode | undefined): { x: number; y: number } | null {
  if (node?.kind !== 'leaf' || node.type !== 'vector2' || typeof node.value !== 'object' || node.value === null) {
    return null;
  }
  const value = node.value as { x?: unknown; y?: unknown };
  return {
    x: typeof value.x === 'number' ? value.x : 0,
    y: typeof value.y === 'number' ? value.y : 0,
  };
}

export function paddingPreviewValueFromNode(node: PropertyNode | undefined): PaddingPreviewValue | null {
  if (node?.kind !== 'container') return null;
  const readNumber = (key: keyof PaddingPreviewValue): number | null => {
    const child = node.children[key];
    return child?.kind === 'leaf' && child.type === 'number' && typeof child.value === 'number' ? child.value : null;
  };
  const top = readNumber('top');
  const right = readNumber('right');
  const bottom = readNumber('bottom');
  const left = readNumber('left');
  if (top === null || right === null || bottom === null || left === null) return null;
  return { top, right, bottom, left };
}

/**
 * Resolves the padding field that best represents an entity's rendered box.
 * The zero-value Layout fallback keeps the preview toggle usable for entities
 * such as rows, words, and markers that do not own a Layout component.
 */
export function paddingPreviewTargetForEntity(entity: EcsEntityDoc): PaddingPreviewTarget | null {
  if (!ALL_DEBUG_ENTITY_KINDS.includes(entity.entity as DebugEntityKind)) return null;

  const kind = entity.entity as DebugEntityKind;
  const layout = entity.components.find((component) => component.component === 'layout');
  const background = entity.components.find((component) => component.component === 'backgroundStyle');

  const layoutPadding = paddingPreviewValueFromNode(layout?.props.padding);
  const bandPadding = paddingPreviewValueFromNode(background?.props.bandPadding);
  const blockPadding = paddingPreviewValueFromNode(background?.props.blockPadding);
  const zeroPadding = { top: 0, right: 0, bottom: 0, left: 0 };
  const candidates: Array<PaddingPreviewTarget> = [
    ...(layoutPadding ? [{ kind, component: 'layout' as const, fieldKey: 'padding' as const, value: layoutPadding }] : []),
    ...(bandPadding
      ? [{ kind, component: 'backgroundStyle' as const, fieldKey: 'bandPadding' as const, value: bandPadding }]
      : []),
    ...(blockPadding
      ? [{ kind, component: 'backgroundStyle' as const, fieldKey: 'blockPadding' as const, value: blockPadding }]
      : []),
  ];
  const nonZeroCandidate = candidates.find(({ value }) =>
    value.top !== 0 || value.right !== 0 || value.bottom !== 0 || value.left !== 0,
  );
  if (nonZeroCandidate) return nonZeroCandidate;
  if (candidates[0]) return candidates[0];
  if (layout) return { kind, component: 'layout', fieldKey: 'padding', value: zeroPadding };
  if (background) return { kind, component: 'backgroundStyle', fieldKey: 'bandPadding', value: zeroPadding };
  return { kind, component: 'layout', fieldKey: 'padding', value: zeroPadding };
}

export function paddingPreviewTargetsEqual(
  left: PaddingPreviewTarget | null,
  right: PaddingPreviewTarget | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.kind === right.kind &&
    left.component === right.component &&
    left.fieldKey === right.fieldKey &&
    left.value.top === right.value.top &&
    left.value.right === right.value.right &&
    left.value.bottom === right.value.bottom &&
    left.value.left === right.value.left
  );
}

export function positionPreviewTargetsEqual(
  left: PositionPreviewTarget | null,
  right: PositionPreviewTarget | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.kind === right.kind && left.value.x === right.value.x && left.value.y === right.value.y;
}

/** Bright, mutually-distinct colors - one per entity - reused for both the card-title icon and its preview overlay, so the color itself reinforces which entity is which. */
export const DEBUG_ENTITY_COLORS: Record<DebugEntityKind, string> = {
  viewport: '#a78bfa', // violet
  videoArea: '#fb923c', // orange
  video: '#38bdf8', // sky blue
  compositionArea: '#22d3ee', // cyan
  page: '#f472b6', // pink/magenta
  row: '#facc15', // yellow
  word: '#4ade80', // green
  background: '#c084fc', // purple
  image: '#60a5fa', // blue
  marker: '#fb7185', // rose
};

export const DEBUG_ENTITY_LABELS: Record<DebugEntityKind, string> = {
  viewport: 'Viewport',
  videoArea: 'Video Area',
  video: 'Video',
  compositionArea: 'Composition Area',
  page: 'Page',
  row: 'Row',
  word: 'Word',
  background: 'Background',
  image: 'Image',
  marker: 'Marker',
};
