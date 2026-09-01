import { useContext, type ReactNode } from 'react';

import { PaintInput } from '@/ui/controls/color-field';
import { normalizePaint, solidPaint, type Paint, type PaintCapability } from '@/schema/paint';
import { NumberField } from '@/ui/controls/number-field';
import { Vector2Field } from '@/ui/controls/vector2-field';
import { SpacerBoundsContext } from '@/ui/controls/spacer-bounds';
import { InspectorPropertyAnchor } from '@/ui/panels/property-tree-view';

import { fieldMetaForTarget, type TrackValueKind } from './helpers';

/** Kind-aware single value editor shared by keyframe rows and random-sampling lists. Clamped to the same bounds (`fieldMetaForTarget`) the target prop's own component/effect editor enforces, so an animated value cannot drift out of range. */
export function TrackValueField({
  kind,
  label,
  value,
  onChange,
  target,
  overrideScopeKey,
  propertyPath,
  paintCapabilities,
}: {
  kind: TrackValueKind;
  label: string;
  value: unknown;
  onChange: (next: unknown) => void;
  target: string;
  overrideScopeKey?: string;
  propertyPath?: readonly string[];
  paintCapabilities?: readonly PaintCapability[];
}): ReactNode {
  const spacerBounds = useContext(SpacerBoundsContext);
  const meta = fieldMetaForTarget(target, spacerBounds);
  const anchor = (content: ReactNode) =>
    overrideScopeKey && propertyPath ? (
      <InspectorPropertyAnchor scopeKey={overrideScopeKey} propertyPath={propertyPath}>
        {content}
      </InspectorPropertyAnchor>
    ) : (
      content
    );
  if (kind === 'vector2') {
    const vector = value && typeof value === 'object' ? (value as { x: number; y: number }) : { x: 0, y: 0 };
    return anchor(<Vector2Field label={label} value={vector} onChange={onChange} meta={meta} compact />);
  }
  if (kind === 'paint') {
    return anchor(
      <PaintInput
        value={normalizePaint(value, solidPaint('#ffffff')) as Paint}
        onChange={onChange}
        capabilities={paintCapabilities}
        ariaLabel={label}
      />,
    );
  }
  const numeric = typeof value === 'number' ? value : 0;
  return anchor(<NumberField label={label} value={numeric} onChange={onChange} meta={meta} compact />);
}
