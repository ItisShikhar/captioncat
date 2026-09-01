import { ArrowRight } from 'lucide-react';
import { type ReactNode } from 'react';

import { ENTITY_STATES, type EcsComponentDoc, type EcsEffectDoc } from '@/schema';
import type {
  InspectorHeaderAction,
} from '@/ui/controls/inspector-header-options';
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/ui/shadcn/dropdown-menu';

import type { StateSuffix } from '../entity-tree';
import {
  type StateApplySuggestion,
  type StateApplySuggestionContextValue,
} from './state-apply-suggestion-context';

function suggestionMatchesScope(suggestion: StateApplySuggestion | null, scopeKey: string): boolean {
  if (!suggestion) return false;
  return [suggestion.scopeKey, suggestion.anchorScopeKey]
    .filter((scope): scope is string => scope !== undefined)
    .some((suggestionScope) => suggestionScope === scopeKey || suggestionScope.startsWith(`${scopeKey}/`));
}

function StateApplySubMenu({
  label,
  targetStates,
  onApply,
  disabled,
}: {
  label: string;
  targetStates: readonly (typeof ENTITY_STATES)[number][];
  onApply: (stateSuffixes: readonly StateSuffix[]) => void;
  disabled: boolean;
}): ReactNode {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={disabled}>
        <ArrowRight className="size-3.5" />
        <span>{label}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuLabel className="text-muted-foreground px-2 py-1 text-[10px] font-normal">
          States with Custom Style
        </DropdownMenuLabel>
        {targetStates.map((state) => (
          <DropdownMenuItem key={state.suffix} onSelect={() => onApply([state.suffix])}>
            {state.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onApply(targetStates.map((state) => state.suffix))}>
          All Custom States
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function StateApplyActionMenuItem({
  scopeKey,
  component,
  effect,
  suggestion,
  context,
  disabled,
}: {
  scopeKey: string;
  component?: EcsComponentDoc;
  effect?: EcsEffectDoc;
  suggestion: StateApplySuggestion | null;
  context: StateApplySuggestionContextValue | null;
  disabled: boolean;
}): ReactNode {
  const canApply = !disabled && context !== null;
  const availableStateSuffixes = context?.customStateSuffixes ?? [];
  const targetStates = ENTITY_STATES.filter(
    (state) =>
      availableStateSuffixes.includes(state.suffix) &&
      state.suffix !== (suggestion?.stateSuffix ?? context?.stateSuffix),
  );
  const applyProperty = (stateSuffixes: readonly StateSuffix[]): void => {
    if (!canApply) return;
    if (suggestion) context.applySuggestionToStates(stateSuffixes);
  };
  const applyComponent = (stateSuffixes: readonly StateSuffix[]): void => {
    if (!canApply || !component) return;
    context.applyComponentToStates(scopeKey, component, stateSuffixes);
  };
  const applyEffect = (stateSuffixes: readonly StateSuffix[]): void => {
    if (!canApply || !effect) return;
    context.applyEffectChangeToStates(scopeKey, suggestion?.change, stateSuffixes);
  };

  return (
    <>
      {suggestion && !effect && targetStates.length > 0 && (
        <StateApplySubMenu
          label="Apply to States"
          targetStates={targetStates}
          onApply={applyProperty}
          disabled={!canApply}
        />
      )}
      {component && targetStates.length > 0 && (
        <StateApplySubMenu
          label="Apply to States"
          targetStates={targetStates}
          onApply={applyComponent}
          disabled={!canApply}
        />
      )}
      {effect && targetStates.length > 0 && (
        <StateApplySubMenu
          label="Apply to States"
          targetStates={targetStates}
          onApply={applyEffect}
          disabled={!canApply}
        />
      )}
    </>
  );
}

export function createStateApplyAction(
  scopeKey: string,
  component: EcsComponentDoc | undefined,
  context: StateApplySuggestionContextValue | null,
  effect?: EcsEffectDoc,
): InspectorHeaderAction {
  const suggestion = context?.suggestion ?? null;
  const scopedSuggestion = suggestionMatchesScope(suggestion, scopeKey) ? suggestion : null;
  return {
    id: 'apply-state-change',
    label: 'Apply to States',
    icon: ArrowRight,
    tooltip: effect ? 'Apply this effect to another state' : 'Apply this change to another state',
    disabled: context === null || (scopedSuggestion === null && component === undefined && effect === undefined),
    renderMenuItem: ({ disabled }) => (
      <StateApplyActionMenuItem
        scopeKey={scopeKey}
        component={component}
        effect={effect}
        suggestion={scopedSuggestion}
        context={context}
        disabled={disabled}
      />
    ),
  };
}
