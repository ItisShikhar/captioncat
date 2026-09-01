import type { FieldMeta } from '@/schema/field-metadata';
import type { PropertyValueType, RandomizerConfig, TransitionConfig } from '@/schema/property-tree';
import type { PaintCapability } from '@/schema/paint';
import { FieldLabelExtraContext } from '@/ui/controls/field-row';
import { useContext, type ReactNode } from 'react';

import { isModeSelectorPropertyKey } from '@captioncat/caption-engine/browser';
import { RandomizerPropertyAffordance } from './randomizer-property-affordance';
import { TransitionPropertyAffordance } from './transition-property-affordance';

interface RandomizerLabelAction {
  label: string;
  leafType: PropertyValueType;
  currentValue: unknown;
  randomizer: RandomizerConfig | undefined;
  onChange: (next: RandomizerConfig | undefined) => void;
  meta?: FieldMeta;
  paintCapabilities?: readonly PaintCapability[];
  disabled?: boolean;
}

interface TransitionLabelAction {
  label: string;
  currentValue: unknown;
  transition: TransitionConfig | undefined;
  onChange: (next: TransitionConfig | undefined) => void;
}

export function PropertyAffordanceLabelExtra({
  fieldKey,
  randomizer,
  transition,
  children,
}: {
  fieldKey?: string;
  randomizer?: RandomizerLabelAction;
  transition?: TransitionLabelAction;
  children: ReactNode;
}): ReactNode {
  const parentExtra = useContext(FieldLabelExtraContext);
  const isModeSelector = fieldKey !== undefined && isModeSelectorPropertyKey(fieldKey);
  return (
    <FieldLabelExtraContext.Provider
      value={
        <>
          {parentExtra}
          {!isModeSelector && randomizer && <RandomizerPropertyAffordance {...randomizer} />}
          {!isModeSelector && transition && <TransitionPropertyAffordance {...transition} />}
        </>
      }
    >
      {children}
    </FieldLabelExtraContext.Provider>
  );
}
