import { createContext } from 'react';

import { mergeEntityComponentsForDisplay, type EcsComponentDoc, type EcsEntityDoc } from '@/schema';

import {
  inspectorComponentScope,
  overrideLookupKey,
  resolveAnimationTarget,
  type AnimationTargetResolution,
} from './state-overrides';

export interface AnimationTrackNavigationTarget {
  animationScopeKey: string;
  trackIndex: number;
}

export interface AnimationTrackNavigationRequest extends AnimationTrackNavigationTarget {
  requestId: number;
}

export interface AnimationTrackNavigationContextValue {
  targetFor: (
    scopeKey: string,
    propertyPath: readonly string[],
  ) => AnimationTrackNavigationTarget | undefined;
  navigateToTrack: (target: AnimationTrackNavigationTarget) => void;
  pendingNavigation: AnimationTrackNavigationRequest | null;
  onNavigationComplete: () => void;
}

export const AnimationTrackNavigationContext = createContext<AnimationTrackNavigationContextValue | null>(null);

interface ComponentScopeEntry {
  component: EcsComponentDoc;
  scopeKey: string;
}

function componentScopeEntries(
  components: readonly EcsComponentDoc[],
  parentScopeKey?: string,
): ComponentScopeEntry[] {
  return components.flatMap((component, index) => {
    const scopeKey = inspectorComponentScope(parentScopeKey, component, index);
    return [{ component, scopeKey }, ...componentScopeEntries(component.components, scopeKey)];
  });
}

function addTrackTarget(
  targets: Map<string, AnimationTrackNavigationTarget>,
  resolvedTarget: AnimationTargetResolution,
  animationScopeKey: string,
  trackIndex: number,
): void {
  const key = overrideLookupKey(resolvedTarget.scopeKey, resolvedTarget.propertyPath);
  if (!targets.has(key)) {
    targets.set(key, { animationScopeKey, trackIndex });
  }
}

export function animationTrackTargetsForEntity(entity: EcsEntityDoc): Map<string, AnimationTrackNavigationTarget> {
  const components = mergeEntityComponentsForDisplay(entity);
  const targets = new Map<string, AnimationTrackNavigationTarget>();

  for (const { component, scopeKey } of componentScopeEntries(components)) {
    const animation = component.animation;
    if (component.component !== 'animation' || !animation?.enabled || animation.scope !== 'self') continue;
    for (const [trackIndex, track] of animation.tracks.entries()) {
      if (!track.enabled) continue;
      const resolvedTarget = resolveAnimationTarget(components, entity.effects, track.target);
      if (resolvedTarget) addTrackTarget(targets, resolvedTarget, scopeKey, trackIndex);
    }
  }

  return targets;
}
