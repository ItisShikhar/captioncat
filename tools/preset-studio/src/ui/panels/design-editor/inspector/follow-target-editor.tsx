import type { CaptionDebugPropertyOverride } from '@captioncat/caption-engine/browser';
import { getComponentDescription, getFieldMeta } from '@/schema';
import type { FieldMeta } from '@/schema/field-metadata';
import type { EcsComponentDoc, EcsEntityDoc, LeafDefinition, PropertyValueType } from '@/schema';
import { DependentSetting } from '@/ui/controls/dependent-setting';
import { DeferredNumberInput } from '@/ui/controls/deferred-number-input';
import { FieldRow, humanizeFieldKey } from '@/ui/controls/field-row';
import { AnchorField } from '@/ui/controls/anchor-field';
import { Badge } from '@/ui/shadcn/badge';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/ui/shadcn/select';
import { propertyLockFromMetadata } from '@/ui/controls/property-lock';
import { CollapsibleCard, headerIconForComponent } from '@/ui/panels/property-tree-view';
import {
  FOLLOW_ANCHORS,
  FOLLOW_BOUNDARY_HANDOFFS,
  FOLLOW_MODES,
  FOLLOW_TRANSITION_SCOPES,
  FOLLOW_TARGET_SCOPES,
  FOLLOW_TARGET_KINDS,
  normalizeFollowMappings,
  type FollowMapping,
  type FollowBoundaryHandoff,
  type FollowMode,
  type FollowTransitionScope,
  type FollowTargetScope,
  type FollowTargetKind,
} from '@captioncat/caption-engine/browser';
import { type ReactNode, useContext } from 'react';

import { findParentOf } from '../entity-tree';

import { FollowPropertyEditor } from './follow-property-editor';
import { PropertyAffordanceLabelExtra } from '../shared/property-affordance-label-extra';
import { StateApplySuggestionContext } from './state-apply-suggestion-context';

const targetLabels: Record<FollowTargetKind, string> = {
  parent: 'Parent',
  currentWord: 'Current Word',
  previousWord: 'Previous Word',
  nextWord: 'Next Word',
  currentRow: 'Current Row',
  previousRow: 'Previous Row',
  nextRow: 'Next Row',
  currentPage: 'Current Page',
  entity: 'Specific Entity',
};

const modeLabels: Record<FollowMode, string> = {
  auto: 'Auto',
  timeline: 'Timeline',
  live: 'Live',
};

const targetScopeLabels: Record<FollowTargetScope, string> = {
  local: 'Local Row/Page',
  timeline: 'Across Rows/Pages',
};

const boundaryHandoffLabels: Record<FollowBoundaryHandoff, string> = {
  snap: 'Snap',
  allowTransition: 'Allow transition',
};

const timelineEntityKinds = new Set(['word', 'row', 'page']);

interface FollowEntityOption {
  id: string;
  kind: string;
  depth: number;
}

interface TargetEntityDescriptor {
  kind: 'word' | 'row' | 'page';
  state: string;
}

function entityOptions(root: EcsEntityDoc): FollowEntityOption[] {
  const options: FollowEntityOption[] = [];
  const visit = (entity: EcsEntityDoc, depth: number): void => {
    options.push({ id: entity.id, kind: entity.entity, depth });
    for (const child of entity.children) visit(child, depth + 1);
  };
  visit(root, 0);
  return options;
}

function leafValue<T>(component: EcsComponentDoc, key: string, fallback: T): T {
  const node = component.props[key];
  return node?.kind === 'leaf' ? (node.value as T) : fallback;
}

function setLeaf(component: EcsComponentDoc, key: string, type: PropertyValueType, value: unknown): EcsComponentDoc {
  const previous = component.props[key];
  return {
    ...component,
    props: {
      ...component.props,
      [key]:
        previous?.kind === 'leaf'
          ? { ...previous, type, value }
          : { kind: 'leaf', type, value },
    },
  };
}

function setLeafConfig(
  component: EcsComponentDoc,
  key: string,
  type: PropertyValueType,
  fallbackValue: unknown,
  patch: Partial<Pick<LeafDefinition, 'randomizer' | 'transition'>>,
): EcsComponentDoc {
  const previous = component.props[key];
  return {
    ...component,
    props: {
      ...component.props,
      [key]:
        previous?.kind === 'leaf'
          ? { ...previous, ...patch }
          : { kind: 'leaf', type, value: fallbackValue, ...patch },
    },
  };
}

function mappingsOf(component: EcsComponentDoc): FollowMapping[] {
  const value = leafValue<unknown[]>(component, 'mappings', []);
  return normalizeFollowMappings(value);
}

function targetEntityDescriptorFor(target: FollowTargetKind): TargetEntityDescriptor | undefined {
  const match = /^([a-z][a-z0-9]*)(Word|Row|Page)$/.exec(target);
  if (!match) return undefined;
  const kind = match[2] === 'Word' ? 'word' : match[2] === 'Row' ? 'row' : 'page';
  return { kind, state: match[1] };
}

function entityStateFor(entity: FollowEntityOption): string | undefined {
  const [entityKind, state] = entity.id.split(':');
  if (!state || entityKind?.toLowerCase() !== entity.kind.toLowerCase()) return undefined;
  return state.toLowerCase();
}

function targetEntityIdForKind(
  target: FollowTargetKind,
  entities: readonly FollowEntityOption[],
): string | undefined {
  const descriptor = targetEntityDescriptorFor(target);
  if (!descriptor) return undefined;

  const candidates = entities.filter((entity) => entity.kind.toLowerCase() === descriptor.kind);
  const matchingState = candidates.find((entity) => entityStateFor(entity) === descriptor.state);
  if (matchingState) return matchingState.id;

  const defaultEntity = candidates.find((entity) => entityStateFor(entity) === 'default');
  if (defaultEntity) return defaultEntity.id;

  return candidates.length === 1 ? candidates[0]?.id : undefined;
}

function targetParentKindFor(
  target: FollowTargetKind,
  targetId: string,
  entities: readonly FollowEntityOption[],
  root: EcsEntityDoc,
): string | undefined {
  const resolvedTargetId = target === 'entity' ? targetId : targetEntityIdForKind(target, entities);
  return resolvedTargetId ? findParentOf(root, resolvedTargetId)?.parent.entity : undefined;
}

function targetAvailabilityFor(
  target: FollowTargetKind,
  targetId: string,
  entities: readonly FollowEntityOption[],
  root: EcsEntityDoc,
  ownerEntity: EcsEntityDoc,
): { available: boolean; reason?: string } {
  if (target === 'entity') {
    if (!targetId || !entities.some((entity) => entity.id === targetId)) {
      return { available: false, reason: 'The selected target entity is unavailable.' };
    }
    if (targetId === ownerEntity.id) {
      return { available: false, reason: 'Self-follow is unavailable because it would create a dependency cycle.' };
    }
    return { available: true };
  }
  if (target === 'parent') {
    return findParentOf(root, ownerEntity.id)
      ? { available: true }
      : { available: false, reason: 'This entity does not have a parent target.' };
  }
  return targetEntityIdForKind(target, entities)
    ? { available: true }
    : { available: false, reason: 'The selected timeline target is unavailable.' };
}

export function FollowTargetEditor({
  component,
  root,
  ownerEntity,
  onUpdate,
  stateKey,
  headerExtra,
  effectsFooter,
  resolvedPropertyOverrides,
  allowDisable = true,
}: {
  component: EcsComponentDoc;
  root: EcsEntityDoc;
  ownerEntity: EcsEntityDoc;
  onUpdate: (updater: (previous: EcsComponentDoc) => EcsComponentDoc) => void;
  stateKey: string;
  headerExtra?: ReactNode;
  effectsFooter?: ReactNode;
  resolvedPropertyOverrides?: Readonly<Record<string, CaptionDebugPropertyOverride>>;
  allowDisable?: boolean;
}): ReactNode {
  const stateApplySuggestion = useContext(StateApplySuggestionContext);
  const target = leafValue<FollowTargetKind>(component, 'target', 'entity');
  const mode = leafValue<FollowMode>(component, 'mode', 'auto');
  const targetScope = leafValue<FollowTargetScope>(component, 'targetScope', 'local');
  const boundaryHandoff = leafValue<FollowBoundaryHandoff>(component, 'boundaryHandoff', 'snap');
  const transitionScope = leafValue<FollowTransitionScope>(component, 'transitionScope', 'all');
  const delaySeconds = Math.max(0, leafValue(component, 'delaySeconds', 0));
  const enabled = leafValue(component, 'enabled', true);
  const targetId = leafValue(component, 'targetId', '');
  const entities = entityOptions(root);
  const anchor = leafValue(component, 'anchor', 'center');
  const mappings = mappingsOf(component);
  const metadataFor = (key: string) => resolvedPropertyOverrides?.[`followTarget.${key}`];
  const lockFor = (key: string) => propertyLockFromMetadata(metadataFor(key));
  const resolvedString = (key: string, fallback: string): string => {
    const value = metadataFor(key)?.value;
    return typeof value === 'string' ? value : fallback;
  };
  const resolvedNumber = (key: string, fallback: number): number => {
    const value = metadataFor(key)?.value;
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  };
  const resolvedBoolean = (key: string, fallback: boolean): boolean => {
    const value = metadataFor(key)?.value;
    return typeof value === 'boolean' ? value : fallback;
  };
  const displayTarget = resolvedString('target', target);
  const displayMode = resolvedString('mode', mode) as FollowMode;
  const displayTargetScope = resolvedString('targetScope', targetScope) as FollowTargetScope;
  const displayBoundaryHandoff = resolvedString('boundaryHandoff', boundaryHandoff) as FollowBoundaryHandoff;
  const displayTransitionScope = resolvedString('transitionScope', transitionScope) as FollowTransitionScope;
  const displayDelaySeconds = Math.max(0, resolvedNumber('delaySeconds', delaySeconds));
  const displayTargetId = resolvedString('targetId', targetId);
  const displayTargetKind = (FOLLOW_TARGET_KINDS as readonly string[]).includes(displayTarget)
    ? (displayTarget as FollowTargetKind)
    : target;
  const selectedEntity = entities.find((entity) => entity.id === displayTargetId);
  const displayAnchor = resolvedString('anchor', anchor);
  const targetIdOptions = Array.from(new Set([...entities.map((entity) => entity.id), displayTargetId].filter(Boolean)));
  const predefinedTarget = targetEntityDescriptorFor(displayTargetKind);
  const timelineTarget =
    predefinedTarget !== undefined ||
    (displayTarget === 'entity' &&
      timelineEntityKinds.has(entities.find((entity) => entity.id === displayTargetId)?.kind ?? ''));
  const resolvedMode =
    displayMode === 'live' ? 'Live' : timelineTarget ? 'Timeline' : displayMode === 'timeline' ? 'Unavailable' : 'Live';
  const enabledLock = lockFor('enabled');
  const delayLock = lockFor('delaySeconds');
  const mappingsLock = lockFor('mappings');
  const displayEnabled = resolvedBoolean('enabled', enabled);
  const targetAvailability = targetAvailabilityFor(displayTargetKind, displayTargetId, entities, root, ownerEntity);
  const targetParentKind = targetParentKindFor(displayTargetKind, displayTargetId, entities, root);
  const targetParentLabel = targetParentKind ? humanizeFieldKey(targetParentKind) : 'parent';
  const update = (key: string, type: PropertyValueType, value: unknown) =>
    onUpdate((previous) => setLeaf(previous, key, type, value));
  const updateMappings = (next: FollowMapping[]) => update('mappings', 'array', next);
  const updateTarget = (nextTarget: FollowTargetKind): void =>
    onUpdate((previous) => {
      const next = setLeaf(previous, 'target', 'string', nextTarget);
      if (nextTarget !== 'entity' || lockFor('targetId')?.locked === true) return next;

      const previousTarget = leafValue<FollowTargetKind>(previous, 'target', displayTargetKind);
      const previousTargetId = leafValue(previous, 'targetId', displayTargetId);
      const resolvedTargetId =
        previousTarget === 'entity'
          ? previousTargetId
          : targetEntityIdForKind(displayTargetKind, entities) ?? previousTargetId;
      return resolvedTargetId ? setLeaf(next, 'targetId', 'string', resolvedTargetId) : next;
    });

  const setRandomizer = (
    key: string,
    type: PropertyValueType,
    fallbackValue: unknown,
    randomizer: LeafDefinition['randomizer'],
  ): void => {
    onUpdate((previous) => setLeafConfig(previous, key, type, fallbackValue, { randomizer }));
  };
  const setTransition = (
    key: string,
    type: PropertyValueType,
    fallbackValue: unknown,
    transition: LeafDefinition['transition'],
  ): void => {
    const shared = transition?.scope !== 'state';
    const stateApplied =
      shared && stateApplySuggestion?.applyTransitionToStates({ scopeKey: stateKey, propertyPath: [key] }, transition);
    if (stateApplied) return;
    onUpdate((previous) => setLeafConfig(previous, key, type, fallbackValue, { transition }));
  };
  const withFieldAffordances = (
    key: string,
    label: string,
    type: PropertyValueType,
    currentValue: unknown,
    children: ReactNode,
    meta?: FieldMeta,
  ): ReactNode => {
    const leaf = component.props[key];
    const fieldMeta = { ...getFieldMeta(key), ...meta };
    return (
      <PropertyAffordanceLabelExtra
        fieldKey={key}
        randomizer={{
          label,
          leafType: type,
          currentValue,
          randomizer: leaf?.kind === 'leaf' ? leaf.randomizer : undefined,
          onChange: (next) => setRandomizer(key, type, currentValue, next),
          meta: fieldMeta,
        }}
        transition={{
          label,
          currentValue,
          transition: leaf?.kind === 'leaf' ? leaf.transition : undefined,
          onChange: (next) => setTransition(key, type, currentValue, next),
        }}
      >
        {children}
      </PropertyAffordanceLabelExtra>
    );
  };

  return (
    <CollapsibleCard
      title="Follow Target"
      titleHelp={getComponentDescription('followTarget')}
      titleIcon={headerIconForComponent('followTarget')}
      stateKey={stateKey}
      compactHeader
      enabled={allowDisable ? displayEnabled : undefined}
      onEnabledChange={allowDisable ? (value) => update('enabled', 'boolean', value) : undefined}
      enabledLock={allowDisable ? enabledLock : null}
      headerExtra={headerExtra}
    >
      <div className="space-y-3">
        {withFieldAffordances(
          'mode',
          'Follow Mode',
          'string',
          displayMode,
          <FieldRow
            label="Follow Mode"
            description="Auto uses Timeline for caption entities and Live for current property values. Timeline uses render time. Live uses current values."
            lock={lockFor('mode')}
          >
            <div className="space-y-1.5">
              <Select
                value={displayMode}
                onValueChange={(value) => update('mode', 'string', value)}
                disabled={lockFor('mode')?.locked === true}
              >
                <SelectTrigger className="h-8 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FOLLOW_MODES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {modeLabels[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-muted-foreground text-[11px]">
                Resolved: <Badge variant={resolvedMode === 'Unavailable' ? 'destructive' : 'outline'}>{resolvedMode}</Badge>
              </div>
              {resolvedMode === 'Unavailable' && (
                <p className="text-destructive text-[11px]">Timeline mode requires a timeline-backed target.</p>
              )}
            </div>
          </FieldRow>,
          { options: FOLLOW_MODES },
        )}
        {withFieldAffordances(
          'delaySeconds',
          'Follow Delay',
          'number',
          displayDelaySeconds,
          <FieldRow
            label="Follow Delay"
            description="Delay the target response. A value of zero follows the target in the same frame."
            lock={delayLock}
          >
            <DeferredNumberInput
              min={0}
              step={0.01}
              value={displayDelaySeconds}
              onCommit={(next) => update('delaySeconds', 'number', Math.max(0, next))}
              disabled={delayLock?.locked === true}
            />
          </FieldRow>,
        )}
        {withFieldAffordances(
          'target',
          'Target',
          'string',
          displayTarget,
          <FieldRow
            label="Target"
            description="Select the parent, current state, or relative word/row to follow."
            lock={lockFor('target')}
          >
            <Select
              value={displayTarget}
              onValueChange={(value) => {
                if ((FOLLOW_TARGET_KINDS as readonly string[]).includes(value)) {
                  updateTarget(value as FollowTargetKind);
                }
              }}
              disabled={lockFor('target')?.locked === true}
            >
              <SelectTrigger className="h-8 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FOLLOW_TARGET_KINDS.map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {targetLabels[kind]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>,
          { options: FOLLOW_TARGET_KINDS },
        )}
        {displayTarget !== 'parent' && displayTarget !== 'entity' && (
          <DependentSetting>
            {withFieldAffordances(
              'targetScope',
              'Target scope',
              'string',
              displayTargetScope,
              <FieldRow
                label="Target scope"
                description="Local searches the current Row/Page. Timeline searches across Row and Page boundaries."
                lock={lockFor('targetScope')}
              >
                <Select
                  value={displayTargetScope}
                  onValueChange={(value) => update('targetScope', 'string', value)}
                  disabled={lockFor('targetScope')?.locked === true}
                >
                  <SelectTrigger className="h-8 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FOLLOW_TARGET_SCOPES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {targetScopeLabels[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>,
              { options: FOLLOW_TARGET_SCOPES },
            )}
          </DependentSetting>
        )}
        {displayTargetScope === 'timeline' && displayTarget !== 'parent' && displayTarget !== 'entity' && (
          <DependentSetting>
            {withFieldAffordances(
              'boundaryHandoff',
              'Boundary handoff',
              'string',
              displayBoundaryHandoff,
              <FieldRow
                label="Boundary handoff"
                description="Choose whether the follower snaps or lets the Transform transition handle a target change. The boundary depends on the target: Word, Row, or Page."
                lock={lockFor('boundaryHandoff')}
              >
                <Select
                  value={displayBoundaryHandoff}
                  onValueChange={(value) => update('boundaryHandoff', 'string', value)}
                  disabled={lockFor('boundaryHandoff')?.locked === true}
                >
                  <SelectTrigger className="h-8 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FOLLOW_BOUNDARY_HANDOFFS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {boundaryHandoffLabels[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>,
              { options: FOLLOW_BOUNDARY_HANDOFFS },
            )}
          </DependentSetting>
        )}
        {displayTargetScope === 'timeline' &&
          displayTarget !== 'parent' &&
          displayTarget !== 'entity' &&
          displayBoundaryHandoff === 'allowTransition' && (
            <DependentSetting>
              <FieldRow
                label="Transition scope"
                description="Choose whether target changes can transition across all targets, within the same parent, or within the same Page."
                lock={lockFor('transitionScope')}
              >
                <Select
                  value={displayTransitionScope}
                  onValueChange={(value) => update('transitionScope', 'string', value)}
                  disabled={lockFor('transitionScope')?.locked === true}
                >
                  <SelectTrigger className="h-8 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FOLLOW_TRANSITION_SCOPES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value === 'all'
                          ? 'All target changes'
                          : value === 'samePage'
                            ? 'Within same Page'
                            : `Within same ${targetParentLabel}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>
            </DependentSetting>
          )}
        {displayTarget === 'entity' && (
          <DependentSetting>
            {withFieldAffordances(
              'targetId',
              'Target entity',
              'string',
              displayTargetId,
              <FieldRow
                label="Target entity"
                description="Select the concrete entity used when Target is Specific Entity."
                lock={lockFor('targetId')}
              >
                <Select
                  value={entities.some((entity) => entity.id === displayTargetId) ? displayTargetId : undefined}
                  onValueChange={(value) => update('targetId', 'string', value)}
                  disabled={lockFor('targetId')?.locked === true}
                >
                  <SelectTrigger className="h-8 w-full">
                    <SelectValue placeholder="Select an entity">
                      {selectedEntity && (
                        <span className="flex min-w-0 items-center gap-1.5">
                          <Badge variant="outline" className="px-1 py-0 text-[10px]">
                            {humanizeFieldKey(selectedEntity.kind)}
                          </Badge>
                          <span className="truncate text-[11px]">{selectedEntity.id}</span>
                        </span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {entities.map((entity) => (
                      <SelectItem key={entity.id} value={entity.id}>
                        <span className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: entity.depth * 8 }}>
                          <Badge variant="outline" className="px-1 py-0 text-[10px]">
                            {humanizeFieldKey(entity.kind)}
                          </Badge>
                          <span className="truncate text-[11px]">{entity.id}</span>
                        </span>
                      </SelectItem>
                    ))}
                    {!entities.some((entity) => entity.id === displayTargetId) && displayTargetId.length > 0 && (
                      <>
                        <SelectSeparator />
                        <SelectItem value={displayTargetId}>
                          <span className="flex min-w-0 items-center gap-1.5">
                            <Badge variant="destructive" className="px-1 py-0 text-[10px]">
                              Missing
                            </Badge>
                            <span className="truncate text-[11px]">{displayTargetId}</span>
                          </span>
                        </SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </FieldRow>,
              { options: targetIdOptions },
            )}
          </DependentSetting>
        )}
        {withFieldAffordances(
          'anchor',
          'Anchor',
          'string',
          displayAnchor,
          <AnchorField
            label="Anchor"
            description="Select the reference point used to align the followed entity."
            value={displayAnchor}
            allowedAnchors={FOLLOW_ANCHORS}
            onChange={(value) => update('anchor', 'string', value)}
            disabled={lockFor('anchor')?.locked === true}
            lock={lockFor('anchor')}
          />,
          { options: FOLLOW_ANCHORS },
        )}
        <FollowPropertyEditor
          mappings={mappings}
          mappingsLock={mappingsLock}
          targetAvailability={targetAvailability}
          onChange={updateMappings}
        />
      </div>
      {effectsFooter}
    </CollapsibleCard>
  );
}
