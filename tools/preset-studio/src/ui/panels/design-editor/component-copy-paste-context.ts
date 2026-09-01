import { createContext, useContext } from 'react';

import type { EcsEntityDoc } from '@/schema';

import type {
  ComponentCopyPayload,
  ComponentCopySource,
  ComponentDuplicateTarget,
  ComponentPasteTarget,
  EffectDuplicateTarget,
  EffectCopySource,
  EffectPasteTarget,
} from './component-copy-paste';

export interface ComponentCopyPasteContextValue {
  payload: ComponentCopyPayload | null;
  copyComponent: (source: ComponentCopySource, sourceEntityLabel: string) => void;
  copyEffect: (source: EffectCopySource, sourceEntityLabel: string) => void;
  clearCopy: () => void;
  canDuplicateComponent: (entity: EcsEntityDoc, target: ComponentDuplicateTarget) => boolean;
  canDuplicateEffect: (entity: EcsEntityDoc, target: EffectDuplicateTarget) => boolean;
  canPasteComponent: (entity: EcsEntityDoc, target: ComponentPasteTarget) => boolean;
  canPasteEffect: (entity: EcsEntityDoc, target: EffectPasteTarget, effectType?: string) => boolean;
  duplicateComponent: (entityId: string, target: ComponentDuplicateTarget) => void;
  duplicateEffect: (entityId: string, target: EffectDuplicateTarget) => void;
  pasteComponent: (entityId: string, target: ComponentPasteTarget) => void;
  pasteEffect: (entityId: string, target: EffectPasteTarget) => void;
}

export const ComponentCopyPasteContext = createContext<ComponentCopyPasteContextValue | null>(null);

export function useComponentCopyPaste(): ComponentCopyPasteContextValue | null {
  return useContext(ComponentCopyPasteContext);
}
