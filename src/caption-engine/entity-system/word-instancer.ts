import {
  BackgroundEntity,
  CompositionArea,
  ImageFlowEntity,
  Marker,
  Page,
  type PhysicalEntity,
  assertStableEntityIds,
  Row,
  Video,
  VideoArea,
  Viewport,
  Word,
} from './physical-entities';
import {
  AnimationComponent,
  FollowTarget,
  isSpacerAnimationTarget,
  LayoutMotion,
  Spacer,
  type Component,
} from './components';
import type { Effect } from './effects';
import type { RandomizerConfig } from './randomizer';
import type { CaptionTimedWord, FlowParticipationPolicy } from './caption-layout';
import type { RowState, StateTemplateKey, WordLifecycle, WordState } from './types';
import { resolveStateStyleTemplate } from './state-style';
import {
  normalizeStateWindowConfig,
  rangeIncludesDistance,
  type StateWindowInput,
  type StateWindowRange,
} from './state-window';

/**
 * Instantiates the real, spoken words of one page from the template tree that
 * `buildEcsTree` produces. The `row:default` template carries word roles and
 * the base row background. State rows carry merged state backgrounds.
 * Each real row clones its state template and its state-matched word role.
 */

export interface WordStateWindowContext {
  /** Row index of the word being classified. */
  rowIndex: number;
  /** Row index containing the active word. */
  currentRowIndex: number;
  /** All row indexes that contain a fragment of the active logical word. */
  currentRowIndexes?: readonly number[];
}

function rangeIncludesWord(
  range: StateWindowRange,
  distance: number,
  direction: 'previous' | 'next',
  context?: WordStateWindowContext,
): boolean {
  if (range.mode === 'fixedCount' || range.mode === 'all') {
    return rangeIncludesDistance(range, distance);
  }
  if (!context) {
    throw new Error('Row-relative word state windows require row context.');
  }
  if (range.mode === 'currentRow' || range.mode === 'currentRowToCurrent') {
    return context.rowIndex === context.currentRowIndex;
  }
  const rowDistance = context.rowIndex - context.currentRowIndex;
  return direction === 'previous'
    ? rowDistance <= 0 && -rowDistance <= range.count
    : rowDistance >= 0 && rowDistance <= range.count;
}

/** State of a word at `index` given the current word's flattened index and configured window. */
export function wordStateFor(
  index: number,
  currentIndex: number,
  stateWindow: StateWindowInput,
  context?: WordStateWindowContext,
): WordState {
  const normalized = normalizeStateWindowConfig(stateWindow);
  const distance = index - currentIndex;
  if (distance === 0) return 'current';
  if (normalized.currentWords.mode === 'all') return 'current';
  const usesCurrentRowWords =
    normalized.currentWords.mode === 'currentRow' ||
    normalized.currentWords.mode === 'currentRowToCurrent';
  if (usesCurrentRowWords && !context) {
    throw new Error('Current-row word state windows require row context.');
  }
  const currentRowIndexes = context?.currentRowIndexes;
  const firstCurrentRowIndex = currentRowIndexes?.[0] ?? context?.currentRowIndex;
  const lastCurrentRowIndex =
    currentRowIndexes && currentRowIndexes.length > 0
      ? currentRowIndexes[currentRowIndexes.length - 1]
      : context?.currentRowIndex;
  const isInCurrentRow =
    context !== undefined &&
    (currentRowIndexes?.includes(context.rowIndex) ?? context.rowIndex === context.currentRowIndex);
  const rowContext =
    context && firstCurrentRowIndex !== undefined && lastCurrentRowIndex !== undefined
      ? {
          ...context,
          currentRowIndex: context.rowIndex < firstCurrentRowIndex ? firstCurrentRowIndex : lastCurrentRowIndex,
        }
      : context;
  if (
    usesCurrentRowWords &&
    isInCurrentRow &&
    (normalized.currentWords.mode === 'currentRow' || distance < 0)
  ) {
    return 'current';
  }
  if (
    distance > 0 &&
    normalized.currentWords.mode === 'fixedCount' &&
    distance < normalized.currentWords.count
  ) {
    return 'current';
  }
  if (distance < 0) {
    return rangeIncludesWord(normalized.previousWords, -distance, 'previous', rowContext) ? 'previous' : 'past';
  }
  if (distance > 0) {
    return rangeIncludesWord(normalized.nextWords, distance, 'next', rowContext) ? 'next' : 'future';
  }
  return 'current';
}

/**
 * State of a whole row given the flattened index range `[start, end)` of its
 * words. A row's window is measured from the current row, independently of
 * the word window. Drives which per-state row background paints.
 */
export function rowStateFor(rowIndex: number, currentRowIndex: number, stateWindow: StateWindowInput): RowState {
  const normalized = normalizeStateWindowConfig(stateWindow);
  const distance = rowIndex - currentRowIndex;
  if (distance === 0) return 'current';
  if (normalized.currentRows.mode === 'all') return 'current';
  if (
    distance > 0 &&
    normalized.currentRows.mode === 'fixedCount' &&
    distance < normalized.currentRows.count
  ) {
    return 'current';
  }
  if (distance < 0) return rangeIncludesDistance(normalized.previousRows, -distance) ? 'previous' : 'past';
  if (distance > 0) return rangeIncludesDistance(normalized.nextRows, distance) ? 'next' : 'future';
  return 'current';
}

/**
 * Cross-state lifecycle of a word: the current word is `incoming` (blends
 * next->current). The previous word is `outgoing` (blends current->previous).
 * All other words are `static`.
 */
export function lifecycleFor(index: number, currentIndex: number): WordLifecycle {
  if (index === currentIndex) return 'incoming';
  if (index === currentIndex - 1) return 'outgoing';
  return 'static';
}

/**
 * A page's own lifecycle, independent of any word inside it: `incoming` on
 * the very first spoken word of the page, `outgoing` on the very last, else
 * `static` - so a page-level enter/exit animation fires exactly once per
 * page, regardless of how many words are spoken while it is shown.
 */
export function pageLifecycleFor(currentIndex: number, totalWords: number): WordLifecycle {
  if (currentIndex === 0) return 'incoming';
  if (currentIndex === totalWords - 1) return 'outgoing';
  return 'static';
}

/**
 * A row's own lifecycle: `incoming` when the current word first reaches this
 * row (its own first word), `outgoing` the instant the current word moves beyond
 * it into the next row's first word. Otherwise it is `static`. The last row on
 * a page has no next row, so its dismissal uses the page's `outgoing` state.
 */
export function rowLifecycleFor(start: number, end: number, currentIndex: number): WordLifecycle {
  if (currentIndex === start) return 'incoming';
  if (currentIndex === end) return 'outgoing';
  return 'static';
}

export interface InstantiateOptions {
  /** Spoken words grouped into rows for this page. */
  rows: string[][];
  /** Timed entries corresponding to `rows`, including wrapped fragment metadata. */
  wordEntries?: readonly CaptionTimedWord[][];
  /** Flattened index (across all rows) of the current word. */
  currentIndex: number;
  /** Absolute word index of the first word in `rows`, used by persistent randomizers. */
  wordIndexOffset?: number;
  /** Absolute caption page index, used by persistent randomizers. */
  pageIndex?: number;
  /** Absolute row index of the first row in `rows`, used by persistent randomizers. */
  rowIndexOffset?: number;
  /** Absolute timestamp when the page lifecycle began. */
  pageStartTimestampSeconds?: number;
  /** Absolute timestamps when each instantiated row lifecycle began. */
  rowStartTimestampSeconds?: readonly number[];
  /** Absolute timestamp when the current word lifecycle began. */
  wordStartTimestampSeconds?: number;
  stateWindow: StateWindowInput;
  /** Optional fixed role for every instantiated word, used by style previews. */
  wordState?: WordState;
  /** Lifecycle to use for every word when a fixed role is supplied. */
  wordLifecycle?: WordLifecycle;
  /** Number of logical source words represented by this page. */
  logicalWordCount?: number;
  flowParticipation?: FlowParticipationPolicy;
}

function flowParticipationFor(
  policy: FlowParticipationPolicy | undefined,
  kind: 'row' | 'word',
  state: string,
): 'include' | 'collapse' {
  if (!policy) return 'include';
  const participation = kind === 'row' ? policy.rows[state as keyof FlowParticipationPolicy['rows']] : policy.words[state as keyof FlowParticipationPolicy['words']];
  return participation ?? 'include';
}

/** Clone an entity's components/effects but drop its children (repopulated). */
function cloneShell<T extends PhysicalEntity>(entity: T): T {
  const copy = entity.clone();
  copy.children.length = 0;
  return copy;
}

function cloneShellWithSource<T extends PhysicalEntity>(entity: T): T {
  const copy = cloneShell(entity);
  copy.debugSourceId = entity.id;
  return copy;
}

function setStyleSources(target: PhysicalEntity, sources: Partial<Record<StateTemplateKey, PhysicalEntity>>): void {
  target.styleSources = { ...sources };
}

function getPersistentRowPositionRandomizer(row: Row | undefined): RandomizerConfig | undefined {
  const randomizer = row?.transform?.getProp<{ x: number; y: number }>('position')?.randomizer;
  return randomizer?.persistAcrossStates === true ? randomizer : undefined;
}

function inheritRowPositionRandomizer(row: Row, randomizer: RandomizerConfig | undefined): void {
  if (!randomizer) return;
  const position = row.transform?.getProp<{ x: number; y: number }>('position');
  if (!position || position.randomizer !== undefined) return;
  row.transform?.props.set('position', position.cloneWithRandomizer(randomizer));
}

function copyMarkerChildren(
  source: PhysicalEntity,
  target: PhysicalEntity,
  ownerIsCurrent = true,
): void {
  for (const child of source.children) {
    if (!(child instanceof Marker)) continue;
    const followsTimeline =
      child.getComponent<FollowTarget>('followTarget')?.getProp<string>('targetScope')?.base === 'timeline';
    if (followsTimeline && !ownerIsCurrent) continue;
    if (!target.children.some((candidate) => candidate.id === child.id)) {
      target.addChild(cloneShellWithSource(child));
    }
  }
}

function copyBackgroundChildren(source: PhysicalEntity, target: PhysicalEntity): void {
  for (const child of source.children) {
    if (child instanceof BackgroundEntity && !target.children.some((candidate) => candidate.id === child.id)) {
      target.addChild(cloneShellWithSource(child));
    }
  }
}

function copyImageFlowChildren(source: PhysicalEntity, target: PhysicalEntity, replaceExisting = false): void {
  for (const child of source.children) {
    if (!(child instanceof ImageFlowEntity)) continue;
    const existingIndex = target.children.findIndex((candidate) => candidate.id === child.id);
    if (existingIndex >= 0) {
      if (replaceExisting) {
        target.children.splice(existingIndex, 1, cloneShellWithSource(child));
      }
      continue;
    }
    target.addChild(cloneShellWithSource(child));
  }
}

function suffixAuxiliaryChildIds(target: PhysicalEntity, instanceKey: string): void {
  target.children.forEach((child) => {
    child.traverse((entity) => {
      (entity as { id: string }).id = `${entity.id}:${instanceKey}`;
      entity.randomizerKey = `${entity.randomizerKey}:${instanceKey}`;
    });
  });
}

function animationTargetsSpacer(animation: AnimationComponent): boolean {
  return animation.definition.tracks.some(
    (track) => track.enabled && isSpacerAnimationTarget(track.target),
  );
}

function copyMissingRowBehaviorComponents(source: Row, target: Row): void {
  for (const component of source.components) {
    if (component instanceof Spacer || component instanceof LayoutMotion) {
      if (!target.components.some((candidate) => candidate.type === component.type)) {
        target.components.push(component.clone());
      }
      continue;
    }
    if (!(component instanceof AnimationComponent) || !animationTargetsSpacer(component)) continue;
    if (!target.components.some(
      (candidate) => candidate instanceof AnimationComponent && animationTargetsSpacer(candidate),
    )) {
      target.components.push(component.clone());
    }
  }
}

function isDisabledBranch(branch: Component | Effect): boolean {
  if (branch instanceof AnimationComponent) return branch.definition.enabled === false;
  return branch.getProp<boolean>('enabled')?.base === false;
}

function matchingComponent(
  sourceComponents: readonly Component[],
  fallbackComponents: readonly Component[],
  sourceIndex: number,
): Component | undefined {
  const source = sourceComponents[sourceIndex];
  if (!source) return undefined;
  const occurrence = sourceComponents.slice(0, sourceIndex).filter((component) => component.type === source.type).length;
  return fallbackComponents.filter((component) => component.type === source.type)[occurrence];
}

function restoreDisabledComponentBranches(source: Component, fallback: Component): Component {
  if (isDisabledBranch(source)) return fallback.clone();

  const copy = source.clone();
  const components = source.components.map((component, index) => {
    const fallbackComponent = matchingComponent(source.components, fallback.components, index);
    return fallbackComponent ? restoreDisabledComponentBranches(component, fallbackComponent) : component.clone();
  });
  copy.components.splice(0, copy.components.length, ...components);

  const effects = source.effects.map((effect) => {
    return effect.clone();
  });
  copy.effects.splice(0, copy.effects.length, ...effects);
  return copy;
}

/** Replace disabled state components with matching default-style components. */
function restoreDisabledBranches(source: PhysicalEntity, fallback: PhysicalEntity): void {
  const components = source.components.map((component, index) => {
    const fallbackComponent = matchingComponent(source.components, fallback.components, index);
    return fallbackComponent ? restoreDisabledComponentBranches(component, fallbackComponent) : component.clone();
  });
  source.components.splice(0, source.components.length, ...components);

  const effects = source.effects.map((effect) => {
    return effect.clone();
  });
  source.effects.splice(0, source.effects.length, ...effects);
}

/** Find the template Word for a state, falling back to word:default. */
function roleTemplate(row: Row | undefined, state: WordState | 'default'): Word | undefined {
  if (!row) return undefined;
  const templates = row.children.filter((child): child is Word => child instanceof Word);
  return resolveStateStyleTemplate(templates, 'word', state);
}

function logicalWordIndexFor(
  rowEntries: readonly CaptionTimedWord[] | undefined,
  wordIndex: number,
  fallbackIndex: number,
  wordIndexOffset: number,
): number {
  const entry = rowEntries?.[wordIndex];
  return entry?.logicalWordIndex === undefined
    ? fallbackIndex
    : entry.logicalWordIndex - wordIndexOffset;
}

function currentRowIndexFor(
  rows: string[][],
  currentIndex: number,
  wordEntries: readonly CaptionTimedWord[][] | undefined,
  wordIndexOffset: number,
): number {
  let flat = 0;
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const rowLength = rows[rowIndex]?.length ?? 0;
    if (wordEntries?.[rowIndex]?.some((entry) =>
      entry.logicalWordIndex !== undefined &&
      entry.logicalWordIndex - wordIndexOffset === currentIndex,
    )) {
      return rowIndex;
    }
    if (currentIndex >= flat && currentIndex < flat + rowLength) return rowIndex;
    flat += rowLength;
  }
  return -1;
}

function currentRowIndexesFor(
  rows: string[][],
  currentIndex: number,
  wordEntries: readonly CaptionTimedWord[][] | undefined,
  wordIndexOffset: number,
): number[] {
  const indexes: number[] = [];
  let flat = 0;
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const rowEntries = wordEntries?.[rowIndex];
    if (
      rowEntries?.some(
        (entry) =>
          entry.logicalWordIndex !== undefined &&
          entry.logicalWordIndex - wordIndexOffset === currentIndex,
      )
    ) {
      indexes.push(rowIndex);
    } else if (!wordEntries && currentIndex >= flat && currentIndex < flat + rows[rowIndex].length) {
      indexes.push(rowIndex);
    }
    flat += rows[rowIndex].length;
  }
  if (indexes.length > 0) return indexes;
  const fallback = currentRowIndexFor(rows, currentIndex, wordEntries, wordIndexOffset);
  return fallback < 0 ? [] : [fallback];
}

function rowLogicalRange(
  rowWords: readonly string[],
  rowEntries: readonly CaptionTimedWord[] | undefined,
  flat: number,
  wordIndexOffset: number,
): { start: number; end: number } {
  const indexes = rowWords.map((_, wordIndex) =>
    logicalWordIndexFor(rowEntries, wordIndex, flat + wordIndex, wordIndexOffset),
  );
  if (indexes.length === 0) return { start: flat, end: flat };
  return {
    start: Math.min(...indexes),
    end: Math.max(...indexes) + 1,
  };
}

/**
 * Build a fresh scene of real words from a `template` tree. The returned
 * Viewport mirrors the template's viewport/video/composition-area/page/row
 * styling but contains one Row per input row and one Word per spoken word.
 *
 * Accepts a bare `CompositionArea` too (returning one back) - every real
 * preset goes through `buildEcsTree`, which always yields a `Viewport`, but
 * unit tests instantiate directly from a hand-built `CompositionArea` tree
 * with no wrapper, and that must keep behaving exactly as before.
 */
export function instantiateScene(template: Viewport, options: InstantiateOptions): Viewport;
export function instantiateScene(template: CompositionArea, options: InstantiateOptions): CompositionArea;
export function instantiateScene(
  template: Viewport | CompositionArea,
  options: InstantiateOptions,
): Viewport | CompositionArea {
  const { rows, currentIndex, wordState: fixedWordState, wordLifecycle: fixedWordLifecycle } = options;
  const wordEntries = options.wordEntries;
  const wordIndexOffset = options.wordIndexOffset ?? 0;
  const pageIndex = options.pageIndex ?? 0;
  const rowIndexOffset = options.rowIndexOffset ?? 0;
  const flowParticipation = options.flowParticipation;
  const stateWindow = normalizeStateWindowConfig(options.stateWindow);
  const scene = cloneShellWithSource(template);

  const isViewport = template instanceof Viewport;
  if (isViewport) {
    const viewport = scene as Viewport;
    const templateChildren = template.children;
    const videoArea = template.videoArea;
    if (!videoArea?.video) throw new Error('ECS viewport must contain a VideoArea with a nested Video');
    const video = cloneShellWithSource(videoArea.video);
    const videoAreaClone = cloneShellWithSource(videoArea);
    const area = template.compositionArea
      ? cloneShellWithSource(template.compositionArea)
      : new CompositionArea('compositionArea');
    videoAreaClone.addChild(video);
    if (templateChildren.length > 0) {
      for (const child of templateChildren) {
        if (child instanceof VideoArea) {
          viewport.addChild(videoAreaClone);
        } else if (child instanceof Video) {
          throw new Error('ECS Video must be nested inside VideoArea');
        } else if (child instanceof CompositionArea) {
          viewport.addChild(area);
        } else {
          viewport.addChild(cloneShellWithSource(child));
        }
      }
    } else {
      viewport.addChild(videoAreaClone);
      viewport.addChild(area);
    }
    copyBackgroundChildren(template, viewport);
  }
  const templateArea: CompositionArea | undefined = isViewport ? template.compositionArea : template;
  const area = isViewport ? (scene as Viewport).compositionArea ?? new CompositionArea('compositionArea') : (scene as CompositionArea);
  if (isViewport && !(scene as Viewport).compositionArea) {
    (scene as Viewport).addChild(area);
  }
  const sceneArea: CompositionArea = isViewport ? area : (scene as CompositionArea);
  copyBackgroundChildren(templateArea ?? template, sceneArea);

  const templatePage = templateArea?.children.find((child): child is Page => child instanceof Page);
  const page = templatePage ? cloneShellWithSource(templatePage) : new Page('page');
  if (templatePage) {
    setStyleSources(page, {
      default: templatePage,
      past: templatePage,
      previous: templatePage,
      current: templatePage,
      next: templatePage,
      future: templatePage,
    });
    copyMarkerChildren(templatePage, page);
    copyBackgroundChildren(templatePage, page);
    copyImageFlowChildren(templatePage, page);
  }
  page.patternIndex = 0;
  page.randomizerKey = `page:${pageIndex}`;
  const totalWords = options.logicalWordCount ?? rows.reduce((sum, row) => sum + row.length, 0);
  page.lifecycle = pageLifecycleFor(currentIndex, totalWords);
  page.lifecycleStartTimestampSeconds = options.pageStartTimestampSeconds ?? 0;
  sceneArea.addChild(page);

  const templateRows = (templatePage?.children.filter((child): child is Row => child instanceof Row) ?? []) as Row[];
  const rowById = (id: string): Row | undefined => templateRows.find((row) => row.id === id);
  const defaultRow = rowById('row:default') ?? templateRows[0];
  const rowTemplateFor = (state: RowState): Row | undefined =>
    resolveStateStyleTemplate(templateRows, 'row', state) ?? defaultRow;
  const persistentRowPositionRandomizer = getPersistentRowPositionRandomizer(rowTemplateFor('current'));
  const defaultWord = defaultRow ? roleTemplate(defaultRow, 'default') : undefined;
  const currentRowIndexes = currentRowIndexesFor(rows, currentIndex, wordEntries, wordIndexOffset);
  const currentRowIndex = currentRowIndexes[0] ?? -1;
  const firstCurrentRowIndex = currentRowIndexes[0] ?? currentRowIndex;
  const lastCurrentRowIndex = currentRowIndexes[currentRowIndexes.length - 1] ?? currentRowIndex;

  let flat = 0;
  for (let r = 0; r < rows.length; r++) {
    const rowWords = rows[r] ?? [];
    const rowEntries = wordEntries?.[r];
    const logicalRange = rowLogicalRange(rowWords, rowEntries, flat, wordIndexOffset);
    const rowState = currentRowIndexes.includes(r)
      ? 'current'
      : rowStateFor(r, r < firstCurrentRowIndex ? firstCurrentRowIndex : lastCurrentRowIndex, stateWindow);
    const rowCollapsed = flowParticipationFor(flowParticipation, 'row', rowState) === 'collapse';
    const rowTemplate = rowTemplateFor(rowState);
    const row = rowTemplate ? cloneShellWithSource(rowTemplate) : new Row(`row:${rowState}`);
    inheritRowPositionRandomizer(row, persistentRowPositionRandomizer);
    row.patternIndex = r;
    row.randomizerKey = `row:${rowIndexOffset + r}`;
    row.flowCollapsed = rowCollapsed;
    row.flowCollapseMode = flowParticipation?.collapseMode ?? 'reserve';
    setStyleSources(row, {
      default: rowTemplateFor('default') ?? row,
      past: rowTemplateFor('past') ?? row,
      previous: rowTemplateFor('previous') ?? row,
      current: rowTemplateFor('current') ?? row,
      next: rowTemplateFor('next') ?? row,
      future: rowTemplateFor('future') ?? row,
    });
    if (defaultRow && rowTemplate !== defaultRow) copyMarkerChildren(defaultRow, row, rowState === 'current');
    if (rowTemplate) copyMarkerChildren(rowTemplate, row, rowState === 'current');
    if (defaultRow && rowTemplate !== defaultRow) copyMissingRowBehaviorComponents(defaultRow, row);
    if (defaultRow) copyBackgroundChildren(defaultRow, row);
    if (rowTemplate) copyBackgroundChildren(rowTemplate, row);
    if (defaultRow) copyImageFlowChildren(defaultRow, row);
    if (rowTemplate && rowTemplate !== defaultRow) copyImageFlowChildren(rowTemplate, row, true);
    if (rowTemplate && defaultRow && rowTemplate !== defaultRow) restoreDisabledBranches(row, defaultRow);
    row.state = rowState;
    row.lifecycle = rowLifecycleFor(logicalRange.start, logicalRange.end, currentIndex);
    row.lifecycleStartTimestampSeconds = options.rowStartTimestampSeconds?.[r] ?? 0;
    (row as { id: string }).id = `ROW:${rowState.toUpperCase()}:${r}`;
    suffixAuxiliaryChildIds(row, String(r));
    for (let wordIndex = 0; wordIndex < rowWords.length; wordIndex++) {
      const logicalIndex = logicalWordIndexFor(rowEntries, wordIndex, flat, wordIndexOffset);
      const entry = rowEntries?.[wordIndex];
      const fragmentIndex = entry?.fragmentIndex ?? 0;
      const state =
        fixedWordState ??
        wordStateFor(logicalIndex, currentIndex, stateWindow, {
          rowIndex: r,
          currentRowIndex,
          currentRowIndexes,
        });
      const wordCollapsed =
        rowCollapsed || flowParticipationFor(flowParticipation, 'word', state) === 'collapse';
      const tpl = defaultRow ? roleTemplate(defaultRow, state) : undefined;
      const word = (tpl ? cloneShellWithSource(tpl) : new Word('word')) as Word;
      word.patternIndex = logicalIndex;
      const absoluteLogicalWordIndex = wordIndexOffset + logicalIndex;
      word.randomizerKey = `word:${absoluteLogicalWordIndex}`;
      if (tpl && defaultWord && tpl !== defaultWord) restoreDisabledBranches(word, defaultWord);
      word.text = rowWords[wordIndex] ?? '';
      word.lifecycle = fixedWordLifecycle ?? lifecycleFor(logicalIndex, currentIndex);
      word.lifecycleStartTimestampSeconds = options.wordStartTimestampSeconds ?? 0;
      word.flowCollapsed = wordCollapsed;
      word.flowCollapseMode = flowParticipation?.collapseMode ?? 'reserve';
      setStyleSources(word, {
        default: roleTemplate(defaultRow, 'default') ?? word,
        past: roleTemplate(defaultRow, 'past') ?? word,
        previous: roleTemplate(defaultRow, 'previous') ?? word,
        current: roleTemplate(defaultRow, 'current') ?? word,
        next: roleTemplate(defaultRow, 'next') ?? word,
        future: roleTemplate(defaultRow, 'future') ?? word,
      });
      if (tpl) {
        copyMarkerChildren(tpl, word);
        copyBackgroundChildren(tpl, word);
      }
      word.state = state;
      (word as { id: string }).id = `WORD:${state.toUpperCase()}:${absoluteLogicalWordIndex}:${fragmentIndex}`;
      suffixAuxiliaryChildIds(word, `${absoluteLogicalWordIndex}:${fragmentIndex}`);
      row.addChild(word);
      flat++;
    }
    page.addChild(row);
  }

  assignRandomizerScopeKeys(page);
  assertStableEntityIds(scene);
  return scene;
}

export interface InstantiateStackedOptions {
  /** Each entry becomes an independent Page with its own rows and words. */
  pages: string[][][];
  /** Timed entries corresponding to each stacked page, including wrapped fragments. */
  wordEntries?: readonly (readonly CaptionTimedWord[][])[];
  /** Absolute word index for each stacked page, used by persistent randomizers. */
  wordIndexOffsets?: readonly number[];
  /** Absolute row index for each stacked page, used by persistent randomizers. */
  rowIndexOffsets?: readonly number[];
  /** Absolute timestamp when each stacked page row lifecycle began. */
  rowStartTimestampSeconds?: readonly number[];
  /** Absolute timestamp when the stacked preview page lifecycle began. */
  pageStartTimestampSeconds?: number;
  /** Absolute timestamp when the stacked preview word lifecycle began. */
  wordStartTimestampSeconds?: number;
  stateWindow: StateWindowInput;
  /** Optional fixed role for every instantiated word, used by style previews. */
  wordState?: WordState;
  /** Lifecycle to use for every word when a fixed role is supplied. */
  wordLifecycle?: WordLifecycle;
  /** Number of logical source words represented by each stacked page. */
  logicalWordCounts?: readonly number[];
  flowParticipation?: FlowParticipationPolicy;
}

function compositionAreaOf(scene: Viewport | CompositionArea): CompositionArea {
  return scene instanceof Viewport ? scene.compositionArea ?? new CompositionArea('compositionArea') : scene;
}

function pageOf(scene: Viewport | CompositionArea): Page | undefined {
  return compositionAreaOf(scene).children.find((child): child is Page => child instanceof Page);
}

export function fitPageToChildren(page: Page): void {
  page.transform?.getProp<string>('widthMode')?.setBase('fitChildren');
  page.transform?.getProp<string>('heightMode')?.setBase('fitChildren');
}

function assignRandomizerScopeKeys(page: Page): void {
  page.traverse((entity) => {
    entity.pageRandomizerKey = page.randomizerKey;
    entity.rowRandomizerKey = undefined;
  });
  for (const child of page.children) {
    if (!(child instanceof Row)) continue;
    child.traverse((entity) => {
      entity.rowRandomizerKey = child.randomizerKey;
    });
  }
}

function instantiateOnePageScene(
  template: Viewport | CompositionArea,
  options: InstantiateOptions,
): Viewport | CompositionArea {
  return template instanceof Viewport ? instantiateScene(template, options) : instantiateScene(template, options);
}

function prepareStackedPage(page: Page, pageIndex: number): void {
  page.patternIndex = pageIndex;
  page.randomizerKey = `page:${pageIndex}`;
  (page as { id: string }).id = `${page.id}:stack${pageIndex}`;
  assignRandomizerScopeKeys(page);
  page.traverse((entity) => {
    if (entity === page) return;
    (entity as { id: string }).id = `${entity.id}:stack${pageIndex}`;
    if (!(entity instanceof Word) && !(entity instanceof Row)) {
      entity.randomizerKey = `${entity.randomizerKey}:stack${pageIndex}`;
    }
  });

  fitPageToChildren(page);
}

/**
 * Builds one scene that contains several independent Page > Row > Word trees.
 * The layout engine positions those pages as a vertical stack for the word-state
 * preview, while normal caption rendering continues to instantiate one page.
 */
export function instantiateStackedScene(template: Viewport, options: InstantiateStackedOptions): Viewport;
export function instantiateStackedScene(template: CompositionArea, options: InstantiateStackedOptions): CompositionArea;
export function instantiateStackedScene(
  template: Viewport | CompositionArea,
  options: InstantiateStackedOptions,
): Viewport | CompositionArea {
  const pageRows = options.pages.length > 0 ? options.pages : [[[]]];
  const defaultRowIndexOffsets: number[] = [];
  let nextRowIndexOffset = 0;
  for (const rows of pageRows) {
    defaultRowIndexOffsets.push(nextRowIndexOffset);
    nextRowIndexOffset += rows.length;
  }
  const scene = instantiateOnePageScene(template, {
    rows: pageRows[0] ?? [[]],
    ...(options.wordEntries?.[0] === undefined ? {} : { wordEntries: options.wordEntries[0] }),
    currentIndex: 0,
    wordIndexOffset: options.wordIndexOffsets?.[0] ?? 0,
    rowIndexOffset: options.rowIndexOffsets?.[0] ?? defaultRowIndexOffsets[0] ?? 0,
    rowStartTimestampSeconds: [options.rowStartTimestampSeconds?.[0] ?? 0],
    ...(options.pageStartTimestampSeconds === undefined
      ? {}
      : { pageStartTimestampSeconds: options.pageStartTimestampSeconds }),
    ...(options.wordStartTimestampSeconds === undefined
      ? {}
      : { wordStartTimestampSeconds: options.wordStartTimestampSeconds }),
    pageIndex: 0,
    ...(options.logicalWordCounts?.[0] === undefined ? {} : { logicalWordCount: options.logicalWordCounts[0] }),
    stateWindow: options.stateWindow,
    ...(options.wordState === undefined ? {} : { wordState: options.wordState }),
    ...(options.wordLifecycle === undefined ? {} : { wordLifecycle: options.wordLifecycle }),
    ...(options.flowParticipation === undefined ? {} : { flowParticipation: options.flowParticipation }),
  });
  const targetArea = compositionAreaOf(scene);
  const firstPage = pageOf(scene);
  if (!firstPage) return scene;
  prepareStackedPage(firstPage, 0);

  for (let pageIndex = 1; pageIndex < pageRows.length; pageIndex += 1) {
    const pageScene = instantiateOnePageScene(template, {
      rows: pageRows[pageIndex] ?? [[]],
      ...(options.wordEntries?.[pageIndex] === undefined ? {} : { wordEntries: options.wordEntries[pageIndex] }),
      currentIndex: 0,
      wordIndexOffset: options.wordIndexOffsets?.[pageIndex] ?? 0,
      rowIndexOffset: options.rowIndexOffsets?.[pageIndex] ?? defaultRowIndexOffsets[pageIndex] ?? 0,
      rowStartTimestampSeconds: [options.rowStartTimestampSeconds?.[pageIndex] ?? 0],
      ...(options.pageStartTimestampSeconds === undefined
        ? {}
        : { pageStartTimestampSeconds: options.pageStartTimestampSeconds }),
      ...(options.wordStartTimestampSeconds === undefined
        ? {}
        : { wordStartTimestampSeconds: options.wordStartTimestampSeconds }),
      pageIndex,
      ...(options.logicalWordCounts?.[pageIndex] === undefined
        ? {}
        : { logicalWordCount: options.logicalWordCounts[pageIndex] }),
      stateWindow: options.stateWindow,
      ...(options.wordState === undefined ? {} : { wordState: options.wordState }),
      ...(options.wordLifecycle === undefined ? {} : { wordLifecycle: options.wordLifecycle }),
      ...(options.flowParticipation === undefined ? {} : { flowParticipation: options.flowParticipation }),
    });
    const page = pageOf(pageScene);
    if (!page) continue;
    prepareStackedPage(page, pageIndex);
    targetArea.addChild(page);
  }

  assertStableEntityIds(scene);
  return scene;
}
