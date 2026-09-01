import { LayoutMotion, type LayoutMotionType } from './components';
import { contentBoxFromArea, refreshDependentGeometry } from './layout-engine';
import { Page, type PhysicalEntity, Row, Word } from './physical-entities';
import type { Box, ResolveContext } from './types';
import { applyEasing, EASE_TYPE_SCHEMA, type EaseType } from '../../utilities/ease-utils';
import { resolveAdaptiveSequenceTiming } from './animation/adaptive-timing';

type MotionAxis = 'x' | 'y';

export interface SpringState {
  position: number;
  velocity: number;
}

export interface LayoutMotionRuntimeConfig {
  stiffness: number;
  damping: number;
  mass: number;
}

export interface EasedMotionRuntimeConfig {
  durationSeconds: number;
  delaySeconds: number;
  easing: EaseType;
}

export interface EasedMotionState {
  position: number;
  target: number;
  from: number;
  elapsedSeconds: number;
  durationSeconds: number;
  delaySeconds: number;
  easing: EaseType;
  hasStarted: boolean;
}

interface ChildPositionEntry<T extends PhysicalEntity> {
  entity: T;
  baseline: Box;
  index: number;
  motionKey: string;
  position: number;
}

interface ChildSpringMotionState extends SpringState {
  target: number;
  elapsedSeconds: number;
  delaySeconds: number;
  stiffness: number;
  damping: number;
  mass: number;
  hasStarted: boolean;
}

interface FlowOffsetState {
  focusKey: string;
  offset: number;
}

/**
 * Persistent motion state for layout behaviors. The runtime is separate from
 * entities because the pipeline creates a fresh scene for each word event.
 */
export class LayoutMotionRuntime {
  private readonly states = new Map<string, SpringState>();
  private readonly easedStates = new Map<string, EasedMotionState>();
  private readonly childSpringStates = new Map<string, ChildSpringMotionState>();
  private readonly flowOffsets = new Map<string, FlowOffsetState>();
  private readonly initializedHosts = new Set<string>();
  private readonly sceneBases = new WeakMap<PhysicalEntity, Map<PhysicalEntity, Box>>();
  private activePageKey: string | undefined;

  beginPage(pageKey: string): void {
    if (this.activePageKey === pageKey) return;
    this.activePageKey = pageKey;
    this.states.clear();
    this.easedStates.clear();
    this.childSpringStates.clear();
    this.flowOffsets.clear();
    this.initializedHosts.clear();
  }

  clear(): void {
    this.activePageKey = undefined;
    this.states.clear();
    this.easedStates.clear();
    this.childSpringStates.clear();
    this.flowOffsets.clear();
    this.initializedHosts.clear();
  }

  baselineFor(root: PhysicalEntity, entity: PhysicalEntity): Box | undefined {
    return this.sceneBases.get(root)?.get(entity);
  }

  resetBaselines(root: PhysicalEntity): void {
    this.sceneBases.delete(root);
  }

  captureBaseline(root: PhysicalEntity, entity: PhysicalEntity): void {
    let baselines = this.sceneBases.get(root);
    if (!baselines) {
      baselines = new Map();
      this.sceneBases.set(root, baselines);
    }
    captureBoxes(entity, baselines);
  }

  applyOffset(root: PhysicalEntity, entity: PhysicalEntity, offset: number, axis: MotionAxis = 'y'): void {
    const baselines = this.sceneBases.get(root);
    if (!baselines) return;
    setSubtreeOffset(entity, baselines, offset, axis);
  }

  resolve(
    key: string,
    target: number,
    deltaSeconds: number,
    config: LayoutMotionRuntimeConfig,
    initialPosition = target,
  ): number {
    const existing = this.states.get(key);
    if (!existing) {
      const position = finiteNumber(initialPosition, target);
      this.states.set(key, { position, velocity: 0 });
      return position;
    }

    const state = existing;
    const safeDelta = clamp(finiteNumber(deltaSeconds, 1 / 60), 0, 0.25);
    const substeps = Math.max(1, Math.ceil(safeDelta / (1 / 120)));
    const stepSeconds = safeDelta / substeps;
    for (let step = 0; step < substeps; step += 1) {
      stepSpring(state, target, stepSeconds, config);
    }

    if (Math.abs(target - state.position) < 0.001 && Math.abs(state.velocity) < 0.001) {
      state.position = target;
      state.velocity = 0;
    }
    return state.position;
  }

  resolveEased(
    key: string,
    target: number,
    deltaSeconds: number,
    config: EasedMotionRuntimeConfig,
    initialPosition = target,
  ): number {
    const durationSeconds = Math.max(0, finiteNumber(config.durationSeconds, 0.35));
    const delaySeconds = Math.max(0, finiteNumber(config.delaySeconds, 0));
    const easing = normalizeEasing(config.easing);
    const existing = this.easedStates.get(key);
    if (!existing) {
      const position = finiteNumber(initialPosition, target);
      this.easedStates.set(key, {
        position,
        target,
        from: position,
        elapsedSeconds: 0,
        durationSeconds,
        delaySeconds,
        easing,
        hasStarted: delaySeconds === 0,
      });
      return position;
    }

    const state = existing;
    const targetChanged = !sameMotionValue(state.target, target);
    const nextDelaySeconds = state.hasStarted ? 0 : delaySeconds;
    const scheduleChanged =
      state.durationSeconds !== durationSeconds || state.delaySeconds !== nextDelaySeconds || state.easing !== easing;
    if (targetChanged) {
      const wasStarted = state.hasStarted;
      state.from = state.position;
      state.target = target;
      state.elapsedSeconds = 0;
      state.durationSeconds = durationSeconds;
      state.delaySeconds = nextDelaySeconds;
      state.easing = easing;
      state.hasStarted = wasStarted;
    } else if (scheduleChanged) {
      const durationChanged = state.durationSeconds !== durationSeconds;
      const nextElapsedSeconds = durationChanged
        ? delaySeconds +
          easedProgress(state.elapsedSeconds, state.durationSeconds, state.delaySeconds) * durationSeconds
        : state.elapsedSeconds;
      const progress = easedProgress(nextElapsedSeconds, durationSeconds, delaySeconds);
      state.elapsedSeconds = nextElapsedSeconds;
      state.from = easedStartForPosition(state.position, target, progress);
      state.durationSeconds = durationSeconds;
      state.delaySeconds = nextDelaySeconds;
      state.easing = easing;
    }

    const safeDelta = clamp(finiteNumber(deltaSeconds, 1 / 60), 0, 0.25);
    state.elapsedSeconds += safeDelta;
    if (state.elapsedSeconds < state.delaySeconds) return state.position;
    state.hasStarted = true;
    if (state.durationSeconds === 0) {
      state.position = state.target;
      return state.position;
    }

    const progress = clamp(
      (state.elapsedSeconds - state.delaySeconds) / state.durationSeconds,
      0,
      1,
    );
    state.position = state.from + (state.target - state.from) * applyEasing(progress, state.easing);
    return state.position;
  }

  synchronizeEasedPosition(key: string, position: number): void {
    const state = this.easedStates.get(key);
    if (!state || !Number.isFinite(position) || Math.abs(position - state.position) < 1e-9) return;
    const progress =
      state.durationSeconds === 0
        ? 1
        : clamp((state.elapsedSeconds - state.delaySeconds) / state.durationSeconds, 0, 1);
    state.position = position;
    state.from = progress >= 1 ? position : (position - state.target * progress) / (1 - progress);
  }

  resolveChildSpring(
    key: string,
    target: number,
    deltaSeconds: number,
    config: LayoutMotionRuntimeConfig,
    delaySeconds: number,
    initialPosition = target,
  ): number {
    const normalizedConfig = normalizeSpringConfig(config);
    const normalizedDelay = Math.max(0, finiteNumber(delaySeconds, 0));
    const existing = this.childSpringStates.get(key);
    if (!existing) {
      const position = finiteNumber(initialPosition, target);
      this.childSpringStates.set(key, {
        position,
        velocity: 0,
        target,
        elapsedSeconds: 0,
        delaySeconds: normalizedDelay,
        ...normalizedConfig,
        hasStarted: normalizedDelay === 0,
      });
      return position;
    }

    const state = existing;
    if (!sameMotionValue(state.target, target)) {
      const wasStarted = state.hasStarted;
      state.target = target;
      state.elapsedSeconds = 0;
      state.delaySeconds = wasStarted ? 0 : normalizedDelay;
      state.stiffness = normalizedConfig.stiffness;
      state.damping = normalizedConfig.damping;
      state.mass = normalizedConfig.mass;
      state.hasStarted = wasStarted;
    } else {
      state.delaySeconds = state.hasStarted ? 0 : normalizedDelay;
      state.stiffness = normalizedConfig.stiffness;
      state.damping = normalizedConfig.damping;
      state.mass = normalizedConfig.mass;
    }

    const safeDelta = clamp(finiteNumber(deltaSeconds, 1 / 60), 0, 0.25);
    state.elapsedSeconds += safeDelta;
    if (state.elapsedSeconds < state.delaySeconds) return state.position;
    state.hasStarted = true;

    const activeDelta = Math.max(0, safeDelta - Math.max(0, state.delaySeconds - (state.elapsedSeconds - safeDelta)));
    const substeps = Math.max(1, Math.ceil(activeDelta / (1 / 120)));
    const stepSeconds = activeDelta / substeps;
    for (let step = 0; step < substeps; step += 1) {
      stepSpring(state, state.target, stepSeconds, state);
    }
    if (Math.abs(state.target - state.position) < 0.001 && Math.abs(state.velocity) < 0.001) {
      state.position = state.target;
      state.velocity = 0;
    }
    return state.position;
  }

  synchronizeChildSpringPosition(key: string, position: number): void {
    const state = this.childSpringStates.get(key);
    if (!state || !Number.isFinite(position) || Math.abs(position - state.position) < 1e-9) return;
    state.position = position;
  }

  positionForChild(key: string, motionType: LayoutMotionType, fallback: number): number {
    const position =
      motionType === 'spring' ? this.childSpringStates.get(key)?.position : this.easedStates.get(key)?.position;
    return position === undefined || !Number.isFinite(position) ? fallback : position;
  }

  isChildTargetChanged(key: string, motionType: LayoutMotionType, target: number): boolean {
    const state =
      motionType === 'spring' ? this.childSpringStates.get(key) : this.easedStates.get(key);
    return state !== undefined && !sameMotionValue(state.target, target);
  }

  isFirstHostFrame(key: string): boolean {
    return !this.initializedHosts.has(key);
  }

  markHostInitialized(key: string): void {
    this.initializedHosts.add(key);
  }

  resolveFlowOffset(key: string, focusKey: string, targetOffset: number): number {
    const existing = this.flowOffsets.get(key);
    if (existing && existing.focusKey === focusKey) return existing.offset;

    const offset = finiteNumber(targetOffset, 0);
    this.flowOffsets.set(key, { focusKey, offset });
    return offset;
  }
}

export function stepSpring(
  state: SpringState,
  target: number,
  deltaSeconds: number,
  config: LayoutMotionRuntimeConfig,
): void {
  const mass = Math.max(0.001, finiteNumber(config.mass, 1));
  const stiffness = Math.max(0, finiteNumber(config.stiffness, 220));
  const damping = Math.max(0, finiteNumber(config.damping, 28));
  const acceleration = ((target - state.position) * stiffness - state.velocity * damping) / mass;
  state.velocity += acceleration * deltaSeconds;
  state.position += state.velocity * deltaSeconds;
}

/**
 * Apply page-owned layout motion after layout assigns target boxes and before
 * rendering or debug collection.
 */
export function applyLayoutMotion(
  root: PhysicalEntity,
  rctx: ResolveContext,
  runtime: LayoutMotionRuntime,
  pageKey: string,
): void {
  runtime.beginPage(pageKey);
  const activeHosts: Array<Page | Row> = [];
  root.traverse((entity) => {
    if (entity instanceof Page) {
      const motion = entity.getComponent<LayoutMotion>('layoutMotion');
      const local = entity.contextFor(rctx);
      if (motion?.enabled(local)) activeHosts.push(entity);
    } else if (entity instanceof Row) {
      const motion = entity.getComponent<LayoutMotion>('layoutMotion');
      const local = entity.contextFor(rctx);
      if (motion?.enabled(local)) activeHosts.push(entity);
    }
  });
  if (activeHosts.length === 0) {
    runtime.clear();
    runtime.resetBaselines(root);
    return;
  }

  let motionApplied = false;
  for (const entity of activeHosts) {
    motionApplied =
      (entity instanceof Page
        ? applyPageLayoutMotion(root, entity, rctx, runtime, pageKey)
        : applyRowLayoutMotion(root, entity, rctx, runtime, pageKey)) || motionApplied;
  }

  if (motionApplied) refreshDependentGeometry(root, rctx);
}

function applyPageLayoutMotion(
  root: PhysicalEntity,
  page: Page,
  rctx: ResolveContext,
  runtime: LayoutMotionRuntime,
  pageKey: string,
): boolean {
  const motion = page.getComponent<LayoutMotion>('layoutMotion');
  const local = page.contextFor(rctx);
  if (!motion || !motion.enabled(local)) return false;
  const currentRow = page.children.find(
    (child): child is Row => child instanceof Row && child.state === 'current' && !!child.box,
  );
  if (!currentRow?.box || !page.box) return false;
  for (const row of page.children) {
    if (row instanceof Row) runtime.captureBaseline(root, row);
  }
  const currentRowBaseline = runtime.baselineFor(root, currentRow);
  if (!currentRowBaseline) return false;
  const targetPageBox = page.box;
  if (!targetPageBox) return false;
  const hostKey = `${pageKey}:${stableMotionEntityKey(page)}:host`;
  const isFirstHostFrame = runtime.isFirstHostFrame(hostKey);

  const focusPosition = motion.focusPosition(local, 'currentRow');
  const normalizedFocusPosition =
    motion.flowDirection(local, 'currentRow') === 'bottomToTop' ? 1 - focusPosition : focusPosition;
  const focusFrame = contentBoxFromArea(targetPageBox, page.layout, local);
  const targetLine = constrainedFocusLine(focusFrame, currentRowBaseline, 'y', normalizedFocusPosition);
  const targetOffset = targetLine - (currentRowBaseline.y + currentRowBaseline.height / 2);
  const resolvedTargetOffset = resolveFlowTargetOffset(
    runtime,
    `${pageKey}:${stableMotionEntityKey(page)}:flow:y`,
    currentRow,
    targetOffset,
  );
  const springConfig = {
    stiffness: motion.stiffness(local),
    damping: motion.damping(local),
    mass: motion.mass(local),
  };
  const deltaSeconds = rctx.deltaSeconds ?? 1 / 60;
  const usesPerChildMotion = motion.motionScope(local) === 'perChild';
  const usesStateMotion = motion.hasStateMotionOverrides(local);
  if (usesPerChildMotion || usesStateMotion) {
    const motionType = motion.motionType(local);
    const staggerFalloffFactor = motion.staggerFalloffFactor(local);
    const springFalloffFactor = motion.springFalloffFactor(local);
    const rows = page.children
      .map((child, index) => {
        if (!(child instanceof Row)) return undefined;
        const baseline = runtime.baselineFor(root, child);
        if (!baseline) return undefined;
        return {
          entity: child,
          baseline,
          index,
          distance: Math.abs(baseline.y + baseline.height / 2 - targetLine),
        };
      })
      .filter((entry): entry is { entity: Row; baseline: Box; index: number; distance: number } => entry !== undefined)
      .sort((left, right) => left.distance - right.distance || left.index - right.index);
    const focusCenter = currentRowBaseline.y + currentRowBaseline.height / 2;
    const maxDistanceFromFocus = Math.max(
      0,
      ...rows.map(({ baseline }) => Math.abs(baseline.y + baseline.height / 2 - focusCenter)),
    );
    const staggeredRows = rows.map((entry, order) => {
      const distanceFromFocus = Math.abs(entry.baseline.y + entry.baseline.height / 2 - focusCenter);
      const distanceMultiplier = distanceFalloffMultiplier(
        distanceFromFocus,
        maxDistanceFromFocus,
        staggerFalloffFactor,
      );
      return {
        ...entry,
        distanceFromFocus,
        staggerOrder: usesPerChildMotion && entry.entity !== currentRow ? order * distanceMultiplier : 0,
      };
    });
    const positionedRows = staggeredRows.map(({ entity, baseline, index, distanceFromFocus, staggerOrder }) => {
      const targetPosition =
        baseline.y +
        resolvedTargetOffset +
        relativeStateOffset(baseline, currentRowBaseline, motion.stateDistance(local, entity.state), 'y');
      const motionKey = `${pageKey}:${stableMotionEntityKey(page)}:children:${stableMotionEntityKey(entity)}`;
      const currentPosition = runtime.positionForChild(motionKey, motionType, baseline.y);
      return {
        entity,
        baseline,
        index,
        distanceFromFocus,
        staggerOrder,
        targetPosition,
        motionKey,
        travelDistance: Math.abs(targetPosition - currentPosition),
      };
    });
    const maxTravelDistance = Math.max(0, ...positionedRows.map((entry) => entry.travelDistance));
    const resolvedRows = positionedRows.map((entry) => {
      const travelMultiplier = runtime.isChildTargetChanged(entry.motionKey, motionType, entry.targetPosition)
        ? travelDistanceMultiplier(entry.travelDistance, maxTravelDistance, entry.baseline.height)
        : 1;
      return {
        ...entry,
        effectiveStaggerOrder: entry.entity === currentRow ? 0 : entry.staggerOrder * travelMultiplier,
      };
    });
    const timing = resolveLayoutMotionTiming(
      motion,
      local,
      maxStaggerOrder(resolvedRows, currentRow, (entry) => entry.effectiveStaggerOrder),
      local.rowDurationSeconds,
    );
    const easedConfig = {
      durationSeconds: timing.durationSeconds,
      easing: motion.easing(local),
    };
    const motionRows = resolvedRows.map(
      ({ entity, baseline, index, distanceFromFocus, targetPosition, motionKey, effectiveStaggerOrder }) => {
        const delaySeconds = entity === currentRow ? 0 : effectiveStaggerOrder * timing.staggerDelaySeconds;
        const stateSpeed = motion.stateSpeed(local, entity.state);
        const childSpringConfig =
          motionType === 'spring'
            ? springConfigForDistance(
                springConfig,
                distanceFalloffMultiplier(
                  distanceFromFocus,
                  maxDistanceFromFocus,
                  springFalloffFactor,
                ) * stateSpeed,
              )
            : springConfig;
        const position =
          motionType === 'spring'
            ? runtime.resolveChildSpring(
                motionKey,
                targetPosition,
                deltaSeconds,
                childSpringConfig,
                delaySeconds,
                entity === currentRow && isFirstHostFrame ? targetPosition : baseline.y,
              )
            : runtime.resolveEased(
                motionKey,
                targetPosition,
                deltaSeconds,
                { ...easedConfig, delaySeconds, durationSeconds: easedConfig.durationSeconds / stateSpeed },
                entity === currentRow && isFirstHostFrame ? targetPosition : baseline.y,
              );
        return { entity, baseline, index, motionKey, position };
      },
    );
    for (const { entity, baseline, motionKey, position } of constrainChildPositions(motionRows, 'y', currentRow)) {
      if (motionType === 'spring') {
        runtime.synchronizeChildSpringPosition(motionKey, position);
      } else {
        runtime.synchronizeEasedPosition(motionKey, position);
      }
      runtime.applyOffset(root, entity, position - baseline.y, 'y');
    }
  } else {
    const motionType = motion.motionType(local);
    const timing = resolveLayoutMotionTiming(motion, local, 0, local.rowDurationSeconds);
    const offset =
      motionType === 'spring'
        ? runtime.resolve(
            `${pageKey}:${stableMotionEntityKey(page)}:group:spring`,
            resolvedTargetOffset,
            deltaSeconds,
            springConfig,
            isFirstHostFrame ? resolvedTargetOffset : 0,
          )
        : runtime.resolveEased(
            `${pageKey}:${stableMotionEntityKey(page)}:group:eased`,
            resolvedTargetOffset,
            deltaSeconds,
            { durationSeconds: timing.durationSeconds, delaySeconds: 0, easing: motion.easing(local) },
            resolvedTargetOffset,
          );
    for (const row of page.children) {
      if (row instanceof Row) runtime.applyOffset(root, row, offset, 'y');
    }
  }
  runtime.markHostInitialized(hostKey);
  return true;
}

function applyRowLayoutMotion(
  root: PhysicalEntity,
  row: Row,
  rctx: ResolveContext,
  runtime: LayoutMotionRuntime,
  pageKey: string,
): boolean {
  const motion = row.getComponent<LayoutMotion>('layoutMotion');
  const local = row.contextFor(rctx);
  if (!motion || !motion.enabled(local)) return false;
  const currentWord = row.children.find(
    (child): child is Word => child instanceof Word && child.state === 'current' && !!child.box,
  );
  if (!currentWord?.box || !row.box) return false;

  runtime.captureBaseline(root, row);
  const rowBaseline = runtime.baselineFor(root, row);
  const currentWordBaseline = runtime.baselineFor(root, currentWord);
  if (!rowBaseline || !currentWordBaseline) return false;
  const hostKey = `${pageKey}:${stableMotionEntityKey(row)}:host`;
  const isFirstHostFrame = runtime.isFirstHostFrame(hostKey);
  const containingPage = pageForRow(root, row);
  const focusFrame = containingPage?.box
    ? contentBoxFromArea(containingPage.box, containingPage.layout, local)
    : rowBaseline;

  const focusPosition = motion.focusPosition(local, 'currentWord');
  const movesPhysicallyRightToLeft = motion.flowDirection(local, 'currentWord') === 'leftToRight';
  const normalizedFocusPosition =
    rctx.textDirection === 'rtl'
      ? movesPhysicallyRightToLeft
        ? focusPosition
        : 1 - focusPosition
      : movesPhysicallyRightToLeft
        ? 1 - focusPosition
        : focusPosition;
  const targetLine = constrainedFocusLine(focusFrame, currentWordBaseline, 'x', normalizedFocusPosition);
  const targetOffset = targetLine - (currentWordBaseline.x + currentWordBaseline.width / 2);
  const resolvedTargetOffset = resolveFlowTargetOffset(
    runtime,
    `${pageKey}:${stableMotionEntityKey(row)}:flow:x`,
    currentWord,
    targetOffset,
  );
  const springConfig = {
    stiffness: motion.stiffness(local),
    damping: motion.damping(local),
    mass: motion.mass(local),
  };
  const deltaSeconds = rctx.deltaSeconds ?? 1 / 60;
  const usesPerChildMotion = motion.motionScope(local) === 'perChild';
  const usesStateMotion = motion.hasStateMotionOverrides(local);
  if (usesPerChildMotion || usesStateMotion) {
    const motionType = motion.motionType(local);
    const staggerFalloffFactor = motion.staggerFalloffFactor(local);
    const springFalloffFactor = motion.springFalloffFactor(local);
    const words = row.children
      .map((child, index) => {
        if (!(child instanceof Word)) return undefined;
        const baseline = runtime.baselineFor(root, child);
        if (!baseline) return undefined;
        return {
          entity: child,
          baseline,
          index,
          distance: Math.abs(baseline.x + baseline.width / 2 - targetLine),
        };
      })
      .filter((entry): entry is { entity: Word; baseline: Box; index: number; distance: number } => entry !== undefined)
      .sort((left, right) => left.distance - right.distance || left.index - right.index);
    const focusCenter = currentWordBaseline.x + currentWordBaseline.width / 2;
    const maxDistanceFromFocus = Math.max(
      0,
      ...words.map(({ baseline }) => Math.abs(baseline.x + baseline.width / 2 - focusCenter)),
    );
    const staggeredWords = words.map((entry, order) => {
      const distanceFromFocus = Math.abs(entry.baseline.x + entry.baseline.width / 2 - focusCenter);
      const distanceMultiplier = distanceFalloffMultiplier(
        distanceFromFocus,
        maxDistanceFromFocus,
        staggerFalloffFactor,
      );
      return {
        ...entry,
        distanceFromFocus,
        staggerOrder: usesPerChildMotion && entry.entity !== currentWord ? order * distanceMultiplier : 0,
      };
    });
    const positionedWords = staggeredWords.map(({ entity, baseline, index, distanceFromFocus, staggerOrder }) => {
      const targetPosition =
        baseline.x +
        resolvedTargetOffset +
        relativeStateOffset(baseline, currentWordBaseline, motion.stateDistance(local, entity.state), 'x');
      const motionKey = `${pageKey}:${stableMotionEntityKey(row)}:children:${stableMotionEntityKey(entity)}`;
      const currentPosition = runtime.positionForChild(motionKey, motionType, baseline.x);
      return {
        entity,
        baseline,
        index,
        distanceFromFocus,
        staggerOrder,
        targetPosition,
        motionKey,
        travelDistance: Math.abs(targetPosition - currentPosition),
      };
    });
    const maxTravelDistance = Math.max(0, ...positionedWords.map((entry) => entry.travelDistance));
    const resolvedWords = positionedWords.map((entry) => {
      const travelMultiplier = runtime.isChildTargetChanged(entry.motionKey, motionType, entry.targetPosition)
        ? travelDistanceMultiplier(entry.travelDistance, maxTravelDistance, entry.baseline.width)
        : 1;
      return {
        ...entry,
        effectiveStaggerOrder: entry.entity === currentWord ? 0 : entry.staggerOrder * travelMultiplier,
      };
    });
    const timing = resolveLayoutMotionTiming(
      motion,
      local,
      maxStaggerOrder(resolvedWords, currentWord, (entry) => entry.effectiveStaggerOrder),
      local.wordDurationSeconds,
    );
    const easedConfig = {
      durationSeconds: timing.durationSeconds,
      easing: motion.easing(local),
    };
    const motionWords = resolvedWords.map(
      ({ entity, baseline, index, distanceFromFocus, targetPosition, motionKey, effectiveStaggerOrder }) => {
        const delaySeconds = entity === currentWord ? 0 : effectiveStaggerOrder * timing.staggerDelaySeconds;
        const stateSpeed = motion.stateSpeed(local, entity.state);
        const childSpringConfig =
          motionType === 'spring'
            ? springConfigForDistance(
                springConfig,
                distanceFalloffMultiplier(
                  distanceFromFocus,
                  maxDistanceFromFocus,
                  springFalloffFactor,
                ) * stateSpeed,
              )
            : springConfig;
        const position =
          motionType === 'spring'
            ? runtime.resolveChildSpring(
                motionKey,
                targetPosition,
                deltaSeconds,
                childSpringConfig,
                delaySeconds,
                entity === currentWord && isFirstHostFrame ? targetPosition : baseline.x,
              )
            : runtime.resolveEased(
                motionKey,
                targetPosition,
                deltaSeconds,
                { ...easedConfig, delaySeconds, durationSeconds: easedConfig.durationSeconds / stateSpeed },
                entity === currentWord && isFirstHostFrame ? targetPosition : baseline.x,
              );
        return { entity, baseline, index, motionKey, position };
      },
    );
    for (const { entity, baseline, motionKey, position } of constrainChildPositions(motionWords, 'x', currentWord)) {
      if (motionType === 'spring') {
        runtime.synchronizeChildSpringPosition(motionKey, position);
      } else {
        runtime.synchronizeEasedPosition(motionKey, position);
      }
      runtime.applyOffset(root, entity, position - baseline.x, 'x');
    }
  } else {
    const motionType = motion.motionType(local);
    const timing = resolveLayoutMotionTiming(motion, local, 0, local.wordDurationSeconds);
    const offset =
      motionType === 'spring'
        ? runtime.resolve(
            `${pageKey}:${stableMotionEntityKey(row)}:group:spring`,
            resolvedTargetOffset,
            deltaSeconds,
            springConfig,
            isFirstHostFrame ? resolvedTargetOffset : 0,
          )
        : runtime.resolveEased(
            `${pageKey}:${stableMotionEntityKey(row)}:group:eased`,
            resolvedTargetOffset,
            deltaSeconds,
            { durationSeconds: timing.durationSeconds, delaySeconds: 0, easing: motion.easing(local) },
            resolvedTargetOffset,
          );
    runtime.applyOffset(root, row, offset, 'x');
  }
  runtime.markHostInitialized(hostKey);
  return true;
}

function stableMotionEntityKey(entity: PhysicalEntity): string {
  if (entity instanceof Row) {
    const readableId = /^ROW:(?:DEFAULT|PAST|PREVIOUS|CURRENT|NEXT|FUTURE):(\d+)((?::stack\d+)*)$/i.exec(entity.id);
    if (readableId) return `row:${readableId[1]}${readableId[2]}`;
    const legacyId = /^(?:row:)?(?:default|past|previous|current|next|future):(.+)$/i.exec(entity.id);
    if (legacyId) return `row:${legacyId[1]}`;
  }
  if (entity instanceof Word) {
    const readableId = /^WORD:(?:DEFAULT|PAST|PREVIOUS|CURRENT|NEXT|FUTURE):(\d+)((?::stack\d+)*)$/i.exec(entity.id);
    if (readableId) return `word:${readableId[1]}${readableId[2]}`;
    const legacyId = /^(?:word:)?(?:default|past|previous|current|next|future):(.+)$/i.exec(entity.id);
    if (legacyId) return `word:${legacyId[1]}`;
  }
  return entity.id;
}

function pageForRow(root: PhysicalEntity, row: Row): Page | undefined {
  let containingPage: Page | undefined;
  root.traverse((entity) => {
    if (entity instanceof Page && entity.children.includes(row)) containingPage = entity;
  });
  return containingPage;
}

function resolveFlowTargetOffset(
  runtime: LayoutMotionRuntime,
  flowKey: string,
  focusEntity: PhysicalEntity,
  targetOffset: number,
): number {
  return runtime.resolveFlowOffset(flowKey, stableMotionEntityKey(focusEntity), targetOffset);
}

function resolveLayoutMotionTiming(
  motion: LayoutMotion,
  rctx: ResolveContext,
  maxStaggerOrder: number,
  activeEntityDurationSeconds: number | undefined,
): { durationSeconds: number; staggerDelaySeconds: number } {
  const durationSeconds = motion.durationSeconds(rctx);
  const staggerDelaySeconds = motion.staggerDelaySeconds(rctx);
  const isEased = motion.motionType(rctx) === 'eased';
  const adaptsDuration = isEased && motion.timingMode(rctx) === 'adaptive';
  const adaptsStagger = motion.staggerTimingMode(rctx) === 'adaptive' && maxStaggerOrder > 0;
  let timing: { durationSeconds: number; staggerDelaySeconds: number };
  if (!adaptsDuration && !adaptsStagger) {
    timing = { durationSeconds, staggerDelaySeconds };
  } else {
    const availableDurationSeconds = availableMotionDuration(rctx, activeEntityDurationSeconds);
    if (availableDurationSeconds === undefined || !Number.isFinite(availableDurationSeconds)) {
      timing = { durationSeconds, staggerDelaySeconds };
    } else if (adaptsDuration && adaptsStagger) {
      timing = resolveAdaptiveSequenceTiming(
        durationSeconds,
        staggerDelaySeconds,
        maxStaggerOrder,
        availableDurationSeconds,
      );
    } else if (adaptsDuration) {
      timing = {
        durationSeconds: Math.min(
          durationSeconds,
          Math.max(0, availableDurationSeconds - staggerDelaySeconds * maxStaggerOrder),
        ),
        staggerDelaySeconds,
      };
    } else {
      timing = {
        durationSeconds,
        staggerDelaySeconds: Math.min(
          staggerDelaySeconds,
          Math.max(0, availableDurationSeconds - (isEased ? durationSeconds : 0)) / maxStaggerOrder,
        ),
      };
    }
  }

  if (isEased) {
    const frameSeconds = Math.max(0, finiteNumber(rctx.deltaSeconds, 1 / 60));
    timing.durationSeconds = Math.max(timing.durationSeconds, frameSeconds * 2);
  }
  return timing;
}

function availableMotionDuration(rctx: ResolveContext, activeEntityDurationSeconds: number | undefined): number | undefined {
  const durations = [
    rctx.nextTriggerIntervalSeconds,
    activeEntityDurationSeconds === undefined
      ? undefined
      : activeEntityDurationSeconds,
  ].filter((value): value is number => value !== undefined && Number.isFinite(value) && value >= 0);
  return durations.length > 0 ? Math.min(...durations) : undefined;
}

function maxStaggerOrder<T extends PhysicalEntity, TEntry extends { entity: T }>(
  entries: TEntry[],
  focusEntity: T,
  getOrder: (entry: TEntry, index: number) => number = (_entry, index) => index,
): number {
  return entries.reduce(
    (maxOrder, entry, index) => (entry.entity === focusEntity ? maxOrder : Math.max(maxOrder, getOrder(entry, index))),
    0,
  );
}

function easedProgress(elapsedSeconds: number, durationSeconds: number, delaySeconds: number): number {
  if (durationSeconds <= 0) return 1;
  return clamp((elapsedSeconds - delaySeconds) / durationSeconds, 0, 1);
}

function easedStartForPosition(position: number, target: number, progress: number): number {
  if (progress >= 1) return position;
  return (position - target * progress) / (1 - progress);
}

function distanceFalloffMultiplier(distance: number, maxDistance: number, factor: number): number {
  const normalizedDistance = maxDistance > 0 ? clamp(distance / maxDistance, 0, 1) : 0;
  return Math.max(0, 1 + (clamp(factor, 0, 8) - 1) * normalizedDistance);
}

function relativeStateOffset(
  baseline: Box,
  focusBaseline: Box,
  distanceMultiplier: number,
  axis: MotionAxis,
): number {
  const baselineCenter = baseline[axis] + (axis === 'x' ? baseline.width : baseline.height) / 2;
  const focusCenter = focusBaseline[axis] + (axis === 'x' ? focusBaseline.width : focusBaseline.height) / 2;
  return (baselineCenter - focusCenter) * (distanceMultiplier - 1);
}

function travelDistanceMultiplier(distance: number, maxDistance: number, nearTargetDistance: number): number {
  if (maxDistance <= 0) return 0;
  const relativeMultiplier = clamp(distance / maxDistance, 0, 1);
  const threshold = Math.max(1, finiteNumber(nearTargetDistance, 0));
  if (maxDistance <= threshold) return 0;
  const distanceMultiplier = clamp((distance - threshold) / (maxDistance - threshold), 0, 1);
  return Math.min(relativeMultiplier, distanceMultiplier);
}

function springConfigForDistance(
  config: LayoutMotionRuntimeConfig,
  responseMultiplier: number,
): LayoutMotionRuntimeConfig {
  const response = Math.max(0.001, finiteNumber(responseMultiplier, 1));
  return {
    stiffness: config.stiffness * response,
    damping: config.damping * Math.sqrt(response),
    mass: config.mass,
  };
}

function constrainChildPositions<T extends PhysicalEntity>(
  entries: Array<ChildPositionEntry<T>>,
  axis: MotionAxis,
  focusEntity: T,
): Array<ChildPositionEntry<T>> {
  const ordered = [...entries].sort(
    (left, right) => left.baseline[axis] - right.baseline[axis] || left.index - right.index,
  );
  const focusIndex = ordered.findIndex(({ entity }) => entity === focusEntity);
  if (focusIndex < 0) return ordered;

  // Keep the focus child at its own target and constrain the other children away from it.
  for (let index = focusIndex - 1; index >= 0; index -= 1) {
    const current = ordered[index];
    const next = ordered[index + 1];
    const currentSize = axis === 'x' ? current.baseline.width : current.baseline.height;
    const baselineGap = next.baseline[axis] - (current.baseline[axis] + currentSize);
    current.position = Math.min(current.position, next.position - currentSize - Math.min(0, baselineGap));
  }
  for (let index = focusIndex + 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    const previousSize = axis === 'x' ? previous.baseline.width : previous.baseline.height;
    const baselineGap = current.baseline[axis] - (previous.baseline[axis] + previousSize);
    current.position = Math.max(current.position, previous.position + previousSize + Math.min(0, baselineGap));
  }
  return ordered;
}

function constrainedFocusLine(frame: Box, activeChild: Box, axis: MotionAxis, normalizedPosition: number): number {
  const frameSize = axis === 'x' ? frame.width : frame.height;
  const childSize = axis === 'x' ? activeChild.width : activeChild.height;
  const frameStart = frame[axis];
  const desiredLine = frameStart + frameSize * normalizedPosition;
  const minimumLine = frameStart + Math.min(childSize, frameSize) / 2;
  const maximumLine = frameStart + frameSize - Math.min(childSize, frameSize) / 2;
  return clamp(desiredLine, minimumLine, maximumLine);
}

function captureBoxes(entity: PhysicalEntity, baselines: Map<PhysicalEntity, Box>): void {
  if (entity.box && !baselines.has(entity)) {
    baselines.set(entity, { ...entity.box });
  }
  for (const child of entity.children) captureBoxes(child, baselines);
}

function setSubtreeOffset(entity: PhysicalEntity, baselines: Map<PhysicalEntity, Box>, offset: number, axis: MotionAxis): void {
  const baseline = baselines.get(entity);
  if (baseline) {
    const current = entity.box ?? baseline;
    entity.box = {
      ...current,
      [axis]: baseline[axis] + offset,
    };
  }
  for (const child of entity.children) setSubtreeOffset(child, baselines, offset, axis);
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function sameMotionValue(left: number, right: number): boolean {
  return Math.abs(left - right) <= 0.000001;
}

function normalizeEasing(value: unknown): EaseType {
  const parsed = EASE_TYPE_SCHEMA.safeParse(value);
  return parsed.success ? parsed.data : 'easeInOut';
}

function normalizeSpringConfig(config: LayoutMotionRuntimeConfig): LayoutMotionRuntimeConfig {
  return {
    stiffness: Math.max(0, finiteNumber(config.stiffness, 220)),
    damping: Math.max(0, finiteNumber(config.damping, 28)),
    mass: Math.max(0.001, finiteNumber(config.mass, 1)),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
