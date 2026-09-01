import { createContext } from 'react';

import type { EcsComponentDoc, EcsEffectDoc } from '@/schema';
import type { TransitionConfig } from '@/schema/property-tree';

import type { StateSuffix } from '../entity-tree';
import type { StatePropertyChange } from '../state-overrides';

export interface StateApplySuggestion {
  entityId: string;
  scopeKey: string;
  propertyPath: readonly string[];
  anchorScopeKey?: string;
  change: StatePropertyChange;
  stateSuffix: StateSuffix;
  stateLabel: string;
}

export interface StateApplySuggestionContextValue {
  suggestion: StateApplySuggestion | null;
  stateSuffix: StateSuffix | null;
  customStateSuffixes: readonly StateSuffix[];
  reportComponentChange: (
    scopeKey: string,
    previous: EcsComponentDoc,
    updater: (previous: EcsComponentDoc) => EcsComponentDoc,
  ) => void;
  reportEffectChange: (
    scopeKey: string,
    previous: EcsEffectDoc,
    updater: (previous: EcsEffectDoc) => EcsEffectDoc,
    hasPreviousEffect?: boolean,
  ) => void;
  reportStructuralChange: (target: StatePropertyChange, entityId?: string) => void;
  applyTransitionToStates: (
    target: StatePropertyChange,
    transition: TransitionConfig | undefined,
  ) => boolean;
  applySuggestionToStates: (stateSuffixes: readonly StateSuffix[] | 'all') => void;
  applyComponentToStates: (
    scopeKey: string,
    component: EcsComponentDoc,
    stateSuffixes: readonly StateSuffix[],
  ) => void;
  applyEffectChangeToStates: (
    scopeKey: string,
    target: StatePropertyChange | undefined,
    stateSuffixes: readonly StateSuffix[],
  ) => void;
}

export const StateApplySuggestionContext = createContext<StateApplySuggestionContextValue | null>(null);
