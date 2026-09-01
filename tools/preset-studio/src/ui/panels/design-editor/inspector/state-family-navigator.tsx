import type { ReactNode } from 'react';

import type { EcsEntityDoc, StateStyleSource, StateWindowConfig } from '@/schema';
import { isStateGroupId } from '@/schema';
import { humanizeFieldKey } from '@/ui/controls/field-row';
import { InfoTooltip } from '@/ui/controls/info-tooltip';
import { DEBUG_ENTITY_LABELS } from '@/ui/preview/entity-debug';

import { asDebugKind, findParentOf, stateEntityIsDirty, type StateSuffix } from '../entity-tree';
import { StateTimeline } from './state-timeline';
import { StateStyleSourceControl } from './state-style-source-control';
import { StateWindowControls } from './state-window-controls';

/** Timeline selector for an entity family's base and relative state variants. */
export function StateFamilyNavigator({
  root,
  savedRoot,
  selectedEntity,
  onActivateState,
  onCustomizeState,
  onChangeStateStyle,
  stateWindow,
  onUpdateStateWindow,
}: {
  root: EcsEntityDoc;
  savedRoot: EcsEntityDoc;
  selectedEntity: EcsEntityDoc;
  onActivateState: (suffix: StateSuffix) => void;
  onCustomizeState: () => void;
  onChangeStateStyle: (source: StateStyleSource) => void;
  stateWindow: StateWindowConfig;
  onUpdateStateWindow: (updater: (previous: StateWindowConfig) => StateWindowConfig) => void;
}): ReactNode {
  const stateKind =
    (selectedEntity.entity === 'row' || selectedEntity.entity === 'word') && isStateGroupId(selectedEntity.id)
      ? selectedEntity.entity
      : null;
  const parentInfo = stateKind
    ? (findParentOf(root, selectedEntity.id) ?? findParentOf(root, `${stateKind}:default`))
    : null;

  const debugKind = stateKind ? asDebugKind(stateKind) : null;
  const label = debugKind ? DEBUG_ENTITY_LABELS[debugKind] : stateKind ? humanizeFieldKey(stateKind) : '';
  const activeSuffix: StateSuffix = selectedEntity.id.slice(selectedEntity.id.indexOf(':') + 1) as StateSuffix;

  if (!stateKind || !parentInfo) return null;

  const hasUnsavedChanges = (suffix: StateSuffix) => {
    const id = `${stateKind}:${suffix}`;
    const current = parentInfo.parent.children.find((child) => child.id === id);
    const savedParent = findParentOf(savedRoot, parentInfo.parent.id)?.child;
    const saved = savedParent?.children.find((child) => child.id === id);
    const savedBase = savedParent?.children.find((child) => child.id === `${stateKind}:default`);
    return stateEntityIsDirty(current, saved, savedBase);
  };

  const ranges =
    stateKind === 'word'
      ? { previous: stateWindow.previousWords, current: stateWindow.currentWords, next: stateWindow.nextWords }
      : { previous: stateWindow.previousRows, current: stateWindow.currentRows, next: stateWindow.nextRows };
  return (
    <div className="w-full min-w-0 space-y-2">
      <div className="flex items-center gap-1 px-1">
        <span className="text-muted-foreground text-[10px] font-semibold tracking-[0.16em] uppercase">
          {label} states
        </span>
        <InfoTooltip ariaLabel={`Explain ${label} states`} contentClassName="max-w-56 text-[11px]">
          <div className="space-y-1.5">
            <p className="font-medium">{label} states</p>
            <p>Default is the fallback style. Current is the active {label.toLowerCase()}.</p>
            <p>Previous and Next use the configured state window ranges.</p>
            <p>Past and Future cover items outside them.</p>
            <p className="text-background/80">Other states inherit from Default until you change them.</p>
          </div>
        </InfoTooltip>
      </div>
      <StateTimeline
        ranges={ranges}
        selectedState={activeSuffix}
        ariaLabel={`${label} states`}
        dirtyStates={{
          default: hasUnsavedChanges('default'),
          past: hasUnsavedChanges('past'),
          previous: hasUnsavedChanges('previous'),
          current: hasUnsavedChanges('current'),
          next: hasUnsavedChanges('next'),
          future: hasUnsavedChanges('future'),
        }}
        onSelectState={(state) => onActivateState(state as StateSuffix)}
      />
      <StateWindowControls
        kind={stateKind === 'word' ? 'word' : 'row'}
        stateWindow={stateWindow}
        onChange={onUpdateStateWindow}
      />
      {activeSuffix !== 'default' && (
        <div className="space-y-2">
          <div className="text-muted-foreground px-1 pt-1 text-[10px] font-semibold tracking-[0.16em] uppercase">
            Style Source
          </div>
          <StateStyleSourceControl
            root={root}
            selectedEntity={selectedEntity}
            onCustomize={onCustomizeState}
            onChange={onChangeStateStyle}
            onSelectSourceState={(source) => onActivateState(source)}
          />
        </div>
      )}
    </div>
  );
}
