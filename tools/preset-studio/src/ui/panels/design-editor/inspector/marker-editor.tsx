import type { CaptionDebugPropertyOverride } from '@captioncat/caption-engine/browser';
import { getComponentDescription, getFieldMeta } from '@/schema';
import type { FieldMeta } from '@/schema/field-metadata';
import type { EcsComponentDoc, EcsMarkerBehaviorDoc, LeafDefinition, PropertyNode, PropertyValueType } from '@/schema';
import { FieldRow, humanizeFieldKey } from '@/ui/controls/field-row';
import { propertyLockFromMetadata, type PropertyLockState } from '@/ui/controls/property-lock';
import { CollapsibleCard, headerIconForComponent } from '@/ui/panels/property-tree-view';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/shadcn/select';
import { type ReactNode, useContext } from 'react';

import { PropertyAffordanceLabelExtra } from '../shared/property-affordance-label-extra';
import { StateApplySuggestionContext } from './state-apply-suggestion-context';

const STYLE_SOURCES = [
  ['own', 'Own Style'],
  ['targetState', 'Target State'],
] as const;

const STYLE_STATES = [
  ['followTarget', 'Follow Target'],
  ['default', 'Default'],
  ['past', 'Past'],
  ['previous', 'Previous'],
  ['current', 'Current'],
  ['next', 'Next'],
  ['future', 'Future'],
] as const;

const RENDER_ORDERS = [
  ['inFront', 'In Front'],
  ['behind', 'Behind'],
] as const;

function SelectField({
  label,
  value,
  options,
  description,
  onChange,
  disabled = false,
  lock = null,
}: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  description?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  lock?: PropertyLockState | null;
}): ReactNode {
  return (
    <FieldRow label={label} description={description} lock={lock}>
      <Select value={value} onValueChange={onChange} disabled={disabled || lock?.locked === true}>
        <SelectTrigger className="h-8 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([optionValue, optionLabel]) => (
            <SelectItem key={optionValue} value={optionValue}>
              {optionLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldRow>
  );
}

function leafValue<T>(node: PropertyNode | undefined, fallback: T): T {
  return node?.kind === 'leaf' ? (node.value as T) : fallback;
}

function markerBehaviorFromComponent(component: EcsComponentDoc): EcsMarkerBehaviorDoc {
  return {
    styleSource: leafValue(component.props.styleSource, 'own') as EcsMarkerBehaviorDoc['styleSource'],
    styleState: leafValue(component.props.styleState, 'followTarget') as EcsMarkerBehaviorDoc['styleState'],
    renderOrder: leafValue(component.props.renderOrder, 'inFront') as EcsMarkerBehaviorDoc['renderOrder'],
  };
}

function setLeaf(
  props: Record<string, PropertyNode>,
  key: string,
  type: 'string',
  value: unknown,
): Record<string, PropertyNode> {
  const previous = props[key];
  return {
    ...props,
    [key]: previous?.kind === 'leaf' ? { ...previous, type, value } : { kind: 'leaf', type, value },
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

function applyMarkerBehaviorPatch(component: EcsComponentDoc, patch: Partial<EcsMarkerBehaviorDoc>): EcsComponentDoc {
  const behavior = { ...markerBehaviorFromComponent(component), ...patch };
  let props = component.props;
  props = setLeaf(props, 'styleSource', 'string', behavior.styleSource);
  props = setLeaf(props, 'styleState', 'string', behavior.styleState);
  props = setLeaf(props, 'renderOrder', 'string', behavior.renderOrder);
  return { ...component, props };
}

export function MarkerEditor({
  component,
  onUpdate,
  stateKey,
  headerExtra,
  effectsFooter,
  resolvedPropertyOverrides,
}: {
  component: EcsComponentDoc;
  onUpdate: (updater: (previous: EcsComponentDoc) => EcsComponentDoc) => void;
  stateKey: string;
  headerExtra?: ReactNode;
  effectsFooter?: ReactNode;
  resolvedPropertyOverrides?: Readonly<Record<string, CaptionDebugPropertyOverride>>;
}): ReactNode {
  const stateApplySuggestion = useContext(StateApplySuggestionContext);
  const behavior = markerBehaviorFromComponent(component);
  const metadataFor = (key: string) => resolvedPropertyOverrides?.[`markerBehavior.${key}`];
  const resolvedString = (key: string, fallback: string): string => {
    const value = metadataFor(key)?.value;
    return typeof value === 'string' ? value : fallback;
  };
  const lockFor = (key: string) => propertyLockFromMetadata(metadataFor(key));
  const resolvedBehavior = {
    styleSource: resolvedString('styleSource', behavior.styleSource) as EcsMarkerBehaviorDoc['styleSource'],
    styleState: resolvedString('styleState', behavior.styleState) as EcsMarkerBehaviorDoc['styleState'],
    renderOrder: resolvedString('renderOrder', behavior.renderOrder) as EcsMarkerBehaviorDoc['renderOrder'],
  };
  const update = (patch: Partial<EcsMarkerBehaviorDoc>) =>
    onUpdate((previous) => applyMarkerBehaviorPatch(previous, patch));
  const setRandomizer = (
    key: string,
    fallbackValue: string,
    randomizer: LeafDefinition['randomizer'],
  ): void => {
    onUpdate((previous) => setLeafConfig(previous, key, 'string', fallbackValue, { randomizer }));
  };
  const setTransition = (
    key: string,
    fallbackValue: string,
    transition: LeafDefinition['transition'],
  ): void => {
    const shared = transition?.scope !== 'state';
    const stateApplied =
      shared && stateApplySuggestion?.applyTransitionToStates({ scopeKey: stateKey, propertyPath: [key] }, transition);
    if (stateApplied) return;
    onUpdate((previous) => setLeafConfig(previous, key, 'string', fallbackValue, { transition }));
  };
  const withFieldAffordances = (
    key: string,
    label: string,
    currentValue: string,
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
          leafType: 'string',
          currentValue,
          randomizer: leaf?.kind === 'leaf' ? leaf.randomizer : undefined,
          onChange: (next) => setRandomizer(key, currentValue, next),
          meta: fieldMeta,
        }}
        transition={{
          label,
          currentValue,
          transition: leaf?.kind === 'leaf' ? leaf.transition : undefined,
          onChange: (next) => setTransition(key, currentValue, next),
        }}
      >
        {children}
      </PropertyAffordanceLabelExtra>
    );
  };
  return (
    <CollapsibleCard
      title={humanizeFieldKey(component.component)}
      titleHelp={getComponentDescription('markerBehavior')}
      titleIcon={headerIconForComponent('markerBehavior')}
      stateKey={stateKey}
      compactHeader
      headerExtra={headerExtra}
    >
      <div className="space-y-3">
        {withFieldAffordances(
          'styleSource',
          'Style Source',
          resolvedBehavior.styleSource,
          <SelectField
            label="Style Source"
            description="Choose whether the marker uses its own style or a style from the Follow Target state."
            value={resolvedBehavior.styleSource}
            options={STYLE_SOURCES}
            onChange={(styleSource) => update({ styleSource: styleSource as EcsMarkerBehaviorDoc['styleSource'] })}
            lock={lockFor('styleSource')}
          />,
          { options: STYLE_SOURCES.map(([value]) => value) },
        )}
        {resolvedBehavior.styleSource === 'targetState' && (
          withFieldAffordances(
            'styleState',
            'Style State',
            resolvedBehavior.styleState,
            <SelectField
              label="Style State"
              description="Choose which target state supplies the marker style."
              value={resolvedBehavior.styleState}
              options={STYLE_STATES}
              onChange={(styleState) => update({ styleState: styleState as EcsMarkerBehaviorDoc['styleState'] })}
              lock={lockFor('styleState')}
            />,
            { options: STYLE_STATES.map(([value]) => value) },
          )
        )}
        {withFieldAffordances(
          'renderOrder',
          'Render Order',
          resolvedBehavior.renderOrder,
          <SelectField
            label="Render Order"
            description="Choose whether the marker renders in front of or behind the caption."
            value={resolvedBehavior.renderOrder}
            options={RENDER_ORDERS}
            onChange={(renderOrder) => update({ renderOrder: renderOrder as EcsMarkerBehaviorDoc['renderOrder'] })}
            lock={lockFor('renderOrder')}
          />,
          { options: RENDER_ORDERS.map(([value]) => value) },
        )}
      </div>
      {effectsFooter}
    </CollapsibleCard>
  );
}
