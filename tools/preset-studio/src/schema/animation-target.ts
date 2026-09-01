export interface AnimationTargetParts {
  owner: string;
  ownerToken: string;
  effectId?: string;
  property: string;
}

export function parseAnimationTarget(target: string): AnimationTargetParts | undefined {
  const separator = target.indexOf('.');
  if (separator <= 0 || separator === target.length - 1) return undefined;
  const ownerToken = target.slice(0, separator);
  const idSeparator = ownerToken.indexOf('#');
  const owner = idSeparator >= 0 ? ownerToken.slice(0, idSeparator) : ownerToken;
  const effectId = idSeparator >= 0 ? ownerToken.slice(idSeparator + 1) : undefined;
  if (
    !owner ||
    effectId === '' ||
    (idSeparator >= 0 && ownerToken.indexOf('#', idSeparator + 1) >= 0)
  ) {
    return undefined;
  }
  return {
    owner,
    ownerToken,
    ...(effectId === undefined ? {} : { effectId }),
    property: target.slice(separator + 1),
  };
}

export function qualifiedEffectTarget(effectType: string, effectId: string, property: string): string {
  return `${effectType}#${effectId}.${property}`;
}

export function effectIdFromAnimationTarget(target: string): string | undefined {
  return parseAnimationTarget(target)?.effectId;
}

export function replicatorCopyIdFromAnimationTarget(target: string): string | undefined {
  const parsed = parseAnimationTarget(target);
  if (!parsed || parsed.owner.toLowerCase() !== 'replicator') return undefined;
  const parts = parsed.property.split('.');
  const copyIndex = parts[0] === 'copyOverrides' ? 1 : 0;
  return parts.length > copyIndex + 1 ? parts[copyIndex] : undefined;
}
