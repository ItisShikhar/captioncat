export type DisabledObjectType = 'component' | 'effect' | 'entity';

const DISABLED_OBJECT_LABELS: Record<DisabledObjectType, string> = {
  component: 'This component is disabled by its Enabled property.',
  effect: 'This effect is disabled by its Enabled property.',
  entity: 'This entity is disabled by its Enabled property.',
};

export function disabledObjectLabel(objectType: DisabledObjectType): string {
  return DISABLED_OBJECT_LABELS[objectType];
}
