import type { ReactNode } from 'react';

import type { PresetParameter } from '@/schema';
import { NAMED_CURVES } from '@/schema';
import { NumberField } from '@/ui/controls/number-field';
import { SelectField } from '@/ui/controls/select-field';
import { InspectorPropertyAnchor } from '@/ui/panels/property-tree-view';

/** Editable fields for a preset's own tunable parameters (duration, distance, etc.). */
export function PresetParameters({
  parameters,
  values,
  overrideScopeKey,
  onChange,
}: {
  parameters: PresetParameter[];
  values: Record<string, number | string>;
  overrideScopeKey: string;
  onChange: (key: string, value: number | string) => void;
}): ReactNode {
  return (
    <>
      {parameters.map((parameter) => {
        if (parameter.kind === 'number') {
          const value = Number(values[parameter.key] ?? parameter.default);
          return (
            <InspectorPropertyAnchor key={parameter.key} scopeKey={overrideScopeKey} propertyPath={['parameters', parameter.key]}>
              <NumberField
                label={parameter.label}
                value={Number.isFinite(value) ? value : 0}
                meta={{ min: parameter.min, max: parameter.max, step: parameter.step, unit: parameter.unit }}
                onChange={(next) => onChange(parameter.key, next)}
              />
            </InspectorPropertyAnchor>
          );
        }
        const options = parameter.kind === 'curve' ? NAMED_CURVES : (parameter.options ?? []);
        return (
          <InspectorPropertyAnchor key={parameter.key} scopeKey={overrideScopeKey} propertyPath={['parameters', parameter.key]}>
            <SelectField
              label={parameter.label}
              value={String(values[parameter.key] ?? parameter.default)}
              options={options}
              onChange={(next) => onChange(parameter.key, next)}
            />
          </InspectorPropertyAnchor>
        );
      })}
    </>
  );
}
