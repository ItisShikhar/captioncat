import { type ReactNode, useContext } from 'react';

import {
  CURSOR_PRESETS,
  CURSOR_PRESET_DEFINITIONS,
  type CursorPresetOffset,
  cursorPresetDefinition,
  cursorSvg,
  cursorSvgForPreset,
  normalizeCursorPreset,
} from '@captioncat/caption-engine/browser';
import type { CursorShape } from '@captioncat/caption-engine/browser';
import { solidPaint } from '@captioncat/caption-engine/browser';
import { getFieldMeta } from '@/schema';
import type { ContainerNode, LeafDefinition, PropertyNode, PropertyValueType } from '@/schema';
import { cn } from '@/lib/utils';
import { DependentSetting } from '@/ui/controls/dependent-setting';
import { FieldRow } from '@/ui/controls/field-row';
import {
  INSPECTOR_CARD_CONTENT_STACK_CLASS,
  INSPECTOR_LABELED_SECTION_VERTICAL_PADDING_CLASS,
} from '@/ui/controls/inspector-layout';
import { isPropertyLockState, type PropertyLock, type PropertyLockState } from '@/ui/controls/property-lock';
import { StringField } from '@/ui/controls/select-field';
import { Button } from '@/ui/shadcn/button';
import {
  FieldOverridesContext,
  InspectorPropertyAnchor,
  PropertyTreeView,
  type FieldOverride,
} from '@/ui/panels/property-tree-view';
import { PropertyAffordanceLabelExtra } from '../shared/property-affordance-label-extra';
import { StateApplySuggestionContext } from './state-apply-suggestion-context';

function propertyLockState(lock: PropertyLock | null | undefined): PropertyLockState | null {
  if (!lock) return null;
  return isPropertyLockState(lock) ? lock : (lock.x ?? lock.y ?? null);
}

function stringValue(node: PropertyNode | undefined, fallback: string, override: unknown): string {
  if (typeof override === 'string') return override;
  return node?.kind === 'leaf' && typeof node.value === 'string' ? node.value : fallback;
}

function numberValue(node: PropertyNode | undefined): number | undefined {
  return node?.kind === 'leaf' && typeof node.value === 'number' && Number.isFinite(node.value) ? node.value : undefined;
}

function updateCursorLeaf(node: ContainerNode, key: string, value: unknown): ContainerNode {
  const child = node.children[key];
  if (child?.kind !== 'leaf') return node;
  return {
    ...node,
    children: {
      ...node.children,
      [key]: { ...child, value },
    },
  };
}

function setCursorLeaf(node: ContainerNode, key: string, type: PropertyValueType, value: unknown): ContainerNode {
  const child = node.children[key];
  return {
    ...node,
    children: {
      ...node.children,
      [key]:
        child?.kind === 'leaf'
          ? { ...child, value }
          : { kind: 'leaf', type, value },
    },
  };
}

function setCursorLeafConfig(
  node: ContainerNode,
  key: string,
  type: PropertyValueType,
  fallbackValue: unknown,
  patch: Partial<Pick<LeafDefinition, 'randomizer' | 'transition'>>,
): ContainerNode {
  const child = node.children[key];
  return {
    ...node,
    children: {
      ...node.children,
      [key]:
        child?.kind === 'leaf'
          ? { ...child, ...patch }
          : { kind: 'leaf', type, value: fallbackValue, ...patch },
    },
  };
}

function updateCursorPreset(node: ContainerNode, preset: (typeof CURSOR_PRESETS)[number]): ContainerNode {
  let next = setCursorLeaf(node, 'preset', 'string', preset);
  const definition = cursorPresetDefinition(preset);
  if (!definition) return next;
  next = setCursorLeaf(next, 'shape', 'string', definition.shape);
  next = setCursorLeaf(next, 'colorMode', 'string', definition.colorMode);
  next = setCursorLeaf(next, 'color', 'paint', solidPaint(definition.color));
  next = setCursorLeaf(next, 'size', 'number', definition.size);
  return setCursorLeaf(next, 'offset', 'vector2', definition.offset satisfies CursorPresetOffset);
}

function CursorPreviewTile({ children, className }: { children: ReactNode; className?: string }): ReactNode {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-flex size-7 shrink-0 items-center justify-center rounded bg-muted/50', className)}
    >
      {children}
    </span>
  );
}

const CURSOR_SVG_COLOR_ATTRIBUTE_PATTERN = /((?:fill|stroke)\s*=\s*)(["'])([^"']+)\2/gi;

function normalizedCursorSvgColor(value: string): 'black' | 'white' | 'other' | 'none' {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'none') return 'none';
  if (normalized === '#000' || normalized === '#000000' || normalized === 'black') return 'black';
  if (normalized === '#fff' || normalized === '#ffffff' || normalized === 'white') return 'white';
  return 'other';
}

function themeAwareCursorSvg(svg: string): string {
  const colors = [...svg.matchAll(CURSOR_SVG_COLOR_ATTRIBUTE_PATTERN)]
    .map((match) => normalizedCursorSvgColor(match[3]))
    .filter((color): color is 'black' | 'white' | 'other' => color !== 'none');
  const monochromeColor = colors[0];
  if (
    monochromeColor === undefined ||
    monochromeColor === 'other' ||
    colors.some((color) => color !== monochromeColor)
  ) {
    return svg;
  }

  return svg.replace(CURSOR_SVG_COLOR_ATTRIBUTE_PATTERN, (attribute, prefix, quote, value: string) => {
    return normalizedCursorSvgColor(value) === monochromeColor
      ? `${prefix}${quote}currentColor${quote}`
      : attribute;
  });
}

function CursorSvgPreview({ svg }: { svg: string }): ReactNode {
  const themedSvg = themeAwareCursorSvg(svg);
  return (
    <CursorPreviewTile>
      <span
        className="text-foreground inline-flex size-full items-center justify-center [&>svg]:block [&>svg]:size-full [&>svg]:object-contain"
        dangerouslySetInnerHTML={{ __html: themedSvg }}
      />
    </CursorPreviewTile>
  );
}

function CursorGlyphPreview({ glyph, fallback = 'A' }: { glyph: string; fallback?: string }): ReactNode {
  return (
    <CursorPreviewTile>
      <span className="max-w-full overflow-hidden font-mono text-[22px] font-medium leading-none">{glyph || fallback}</span>
    </CursorPreviewTile>
  );
}

function CursorShapePreview({ shape, glyph }: { shape: CursorShape; glyph: string }): ReactNode {
  if (shape === 'caret' || shape === 'block') return <CursorSvgPreview svg={cursorSvg(shape)} />;
  if (shape === 'glyph') {
    return <CursorGlyphPreview glyph={glyph} />;
  }
  return (
    <CursorPreviewTile className={shape === 'underscore' ? 'items-end pb-1' : undefined}>
      <span
        className={cn(
          'bg-current',
          shape === 'square'
            ? 'h-4 w-4 rounded-none'
            : shape === 'underscore'
              ? 'h-0.5 w-6 rounded-full'
              : 'h-7 w-0.5 rounded-full',
        )}
      />
    </CursorPreviewTile>
  );
}

function PreviewButton({
  active,
  disabled,
  label,
  onClick,
  children,
}: {
  active: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}): ReactNode {
  return (
    <Button
      type="button"
      variant={active ? 'secondary' : 'outline'}
      size="sm"
      className={cn('h-auto min-w-16 flex-col gap-0.5 px-2 py-1.5', active && 'ring-1 ring-ring')}
      aria-pressed={active}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
      <span className="text-[10px] leading-tight">{label}</span>
    </Button>
  );
}

export function TypewriterCursorEditor({
  node,
  stateKeyPrefix,
  fieldOverrides,
  fontSize,
  onChange,
}: {
  node: ContainerNode;
  stateKeyPrefix: string;
  fieldOverrides: Readonly<Record<string, FieldOverride>>;
  fontSize?: number;
  onChange: (updater: (previous: ContainerNode) => ContainerNode) => void;
}): ReactNode {
  const stateApplySuggestion = useContext(StateApplySuggestionContext);
  const preset = normalizeCursorPreset(
    stringValue(node.children.preset, 'mac', fieldOverrides.preset?.value),
  );
  const glyph = stringValue(node.children.glyph, '|', fieldOverrides.glyph?.value);
  const colorMode = stringValue(node.children.colorMode, 'original', fieldOverrides.colorMode?.value);
  const presetLock = propertyLockState(fieldOverrides.preset?.lock);
  const glyphLock = propertyLockState(fieldOverrides.glyph?.lock);
  const isCustom = preset === 'custom';
  const authoredSize = numberValue(node.children.size);
  const sizeUsesTextHeight = authoredSize === undefined || authoredSize <= 0;
  const sizeScale = cursorPresetDefinition(preset)?.sizeScale ?? 1;
  const baseFontSize = typeof fontSize === 'number' && Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 60;
  const calculatedSize = Math.max(1, baseFontSize * sizeScale);
  const hasResolvedSize = Object.prototype.hasOwnProperty.call(fieldOverrides.size ?? {}, 'value');
  const customizeFieldOverrides: Readonly<Record<string, FieldOverride>> = {
    ...fieldOverrides,
    size: {
      ...fieldOverrides.size,
      min: 0,
      max: 500,
      step: 1,
      unit: 'pt',
      description: 'Set to 0 to use the text height and preset scale automatically.',
      ...(sizeUsesTextHeight && !hasResolvedSize ? { value: calculatedSize } : {}),
    },
    colorMode: {
      ...fieldOverrides.colorMode,
      options: ['original', 'tint'],
      description: 'Original keeps the asset color. Tint applies the cursor color.',
    },
    enabled: {
      ...fieldOverrides.enabled,
      description: 'Turn cursor blinking on or off.',
    },
    rate: {
      ...fieldOverrides.rate,
      description: 'Set how many blink cycles happen each second.',
    },
    dutyCycle: {
      ...fieldOverrides.dutyCycle,
      label: 'Visible Portion',
      description: 'Set which fraction of each blink cycle keeps the cursor visible. 0.5 means visible for half the cycle.',
    },
    phaseOffset: {
      ...fieldOverrides.phaseOffset,
      description: 'Shift the blink timing forward or backward without changing the blink speed.',
    },
  };

  const updateLeaf = (key: string, value: unknown): void => {
    onChange((previous) => updateCursorLeaf(previous, key, value));
  };
  const setRandomizer = (randomizer: LeafDefinition['randomizer']): void => {
    onChange((previous) => setCursorLeafConfig(previous, 'glyph', 'string', glyph, { randomizer }));
  };
  const setTransition = (transition: LeafDefinition['transition']): void => {
    const shared = transition?.scope !== 'state';
    const stateApplied =
      shared &&
      stateApplySuggestion?.applyTransitionToStates({ scopeKey: stateKeyPrefix, propertyPath: ['cursor', 'glyph'] }, transition);
    if (stateApplied) return;
    onChange((previous) => setCursorLeafConfig(previous, 'glyph', 'string', glyph, { transition }));
  };

  return (
    <section className={cn('border-t border-border/60', INSPECTOR_CARD_CONTENT_STACK_CLASS)} aria-label="Cursor">
      <h4 className={cn('text-xs font-semibold', INSPECTOR_LABELED_SECTION_VERTICAL_PADDING_CLASS)}>Cursor</h4>

      <InspectorPropertyAnchor scopeKey={stateKeyPrefix} propertyPath={['cursor', 'preset']}>
        <FieldRow
          label="Preset"
          description="Choose a built-in cursor preset or Custom to use a glyph cursor."
          compact
          lock={presetLock}
        >
          <div className="flex flex-wrap gap-1.5">
            {CURSOR_PRESET_DEFINITIONS.map((definition) => {
              const candidate = definition.id;
              const label = definition.name;
              return (
                <PreviewButton
                  key={candidate}
                  active={preset === candidate}
                  disabled={presetLock?.locked === true}
                  label={label}
                  onClick={() => onChange((previous) => updateCursorPreset(previous, candidate))}
                >
                  {candidate === 'custom'
                    ? <CursorGlyphPreview glyph="" fallback="Aa" />
                    : definition.asset
                      ? (
                        <CursorSvgPreview
                          svg={cursorSvgForPreset(candidate)}
                        />
                      )
                      : (
                        <CursorShapePreview shape={definition.shape} glyph={glyph} />
                      )}
                </PreviewButton>
              );
            })}
          </div>
        </FieldRow>
      </InspectorPropertyAnchor>

      <section className={cn('border-t border-border/60', INSPECTOR_CARD_CONTENT_STACK_CLASS)} aria-label="Customize">
        <h4 className={cn('text-xs font-semibold', INSPECTOR_LABELED_SECTION_VERTICAL_PADDING_CLASS)}>Customize</h4>

        {isCustom && (
          <DependentSetting>
            <InspectorPropertyAnchor scopeKey={stateKeyPrefix} propertyPath={['cursor', 'glyph']}>
              <PropertyAffordanceLabelExtra
                randomizer={{
                  label: 'Glyph',
                  leafType: 'string',
                  currentValue: glyph,
                  randomizer: node.children.glyph?.kind === 'leaf' ? node.children.glyph.randomizer : undefined,
                  onChange: setRandomizer,
                  meta: getFieldMeta('glyph'),
                }}
                transition={{
                  label: 'Glyph',
                  currentValue: glyph,
                  transition: node.children.glyph?.kind === 'leaf' ? node.children.glyph.transition : undefined,
                  onChange: setTransition,
                }}
              >
                <StringField
                  label="Glyph"
                  value={glyph}
                  onChange={(value) => updateLeaf('glyph', value)}
                  description="Set the character used by the Custom cursor."
                  lock={glyphLock}
                />
              </PropertyAffordanceLabelExtra>
            </InspectorPropertyAnchor>
          </DependentSetting>
        )}

        <FieldOverridesContext.Provider value={customizeFieldOverrides}>
          <PropertyTreeView
            node={node}
            fieldKey="cursor"
            stateKeyPrefix={`${stateKeyPrefix}/cursor`}
            propertyPath={['cursor']}
            onChange={(updater) =>
              onChange((previous) => {
                const next = updater(previous);
                return next.kind === 'container' ? next : previous;
              })
            }
            hiddenFieldKeys={new Set([
              'enabled',
              'preset',
              'shape',
              'glyph',
              ...(colorMode === 'original' ? ['color'] : []),
            ])}
            dependentFieldGroups={colorMode === 'original' ? undefined : { colorMode: ['color'] }}
          />
        </FieldOverridesContext.Provider>
      </section>
    </section>
  );
}
