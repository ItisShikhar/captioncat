/**
 * Dev-only validation: loads every real preset JSON from
 * `assets/json/caption-style-presets/`, round-trips it through the schema
 * parser/serializer, validates every declared property and animation value,
 * and verifies that parsing the canonical output preserves the same document
 * after the serializer's three-decimal numeric rounding.
 * The serializer intentionally adds stable effect IDs and omits empty arrays,
 * so comparing raw JSON rejects valid canonicalization.
 *
 * Run with: npm run validate:presets
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  EFFECT_TEMPLATES,
  KNOWN_LEAF_TYPES,
  listAnimatableTargets,
  parsePresetDocument,
  schemaForEntity,
  serializePresetDocument,
  type ComponentTemplate,
  type EcsEntityDoc,
  type EffectTemplate,
  type PropertyNode,
  isInheritedStateEntity,
  isValidPropertyValue,
} from '../src/schema';
import { roundSerializedNumbers } from '../src/lib/number-precision';

const presetsDir = path.resolve(import.meta.dirname, '../../../assets/json/caption-style-presets');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function valueShape(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array[${value.length}]`;
  if (isRecord(value)) return `object{${Object.keys(value).join(',')}}`;
  return typeof value;
}

function flattenComponentTemplates(templates: readonly ComponentTemplate[]): ComponentTemplate[] {
  return templates.flatMap((template) => [
    template,
    ...(template.components ? flattenComponentTemplates(template.components) : []),
  ]);
}

function validateAnimationValues(
  type: string,
  keyframes: unknown,
  pathName: string,
  problems: string[],
): void {
  if (!Array.isArray(keyframes)) {
    problems.push(`${pathName}: keyframes must be an array`);
    return;
  }
  for (const [index, value] of keyframes.entries()) {
    if (!isValidPropertyValue(type, value)) {
      problems.push(`${pathName}[${index}]: type ${type} has ${valueShape(value)} value`);
    }
  }
}

function validateRandomizer(
  type: string,
  randomizer: Record<string, unknown>,
  pathName: string,
  problems: string[],
): void {
  if ('values' in randomizer) {
    if (!Array.isArray(randomizer.values)) {
      problems.push(`${pathName}.values: expected an array`);
    } else {
      for (const [index, value] of randomizer.values.entries()) {
        if (!isValidPropertyValue(type, value)) {
          problems.push(`${pathName}.values[${index}]: type ${type} has ${valueShape(value)} value`);
        }
      }
    }
  }

  if (!('range' in randomizer)) return;
  if (type === 'vector2') {
    const range = randomizer.range;
    if (
      !isRecord(range) ||
      !Array.isArray(range.x) ||
      range.x.length !== 2 ||
      !range.x.every((value) => typeof value === 'number' && Number.isFinite(value)) ||
      !Array.isArray(range.y) ||
      range.y.length !== 2 ||
      !range.y.every((value) => typeof value === 'number' && Number.isFinite(value))
    ) {
      problems.push(`${pathName}.range: expected finite x/y ranges for vector2`);
    }
    return;
  }

  const range = randomizer.range;
  if (
    !Array.isArray(range) ||
    range.length !== 2 ||
    !range.every((value) => typeof value === 'number' && Number.isFinite(value))
  ) {
    problems.push(`${pathName}.range: expected a finite two-number range for ${type}`);
  }
}

function validateRawProperty(
  raw: unknown,
  expected: PropertyNode | undefined,
  pathName: string,
  problems: string[],
): void {
  if (!isRecord(raw)) {
    problems.push(`${pathName}: expected a property node, got ${valueShape(raw)}`);
    return;
  }

  if (typeof raw.type === 'string') {
    if (expected?.kind === 'container') {
      problems.push(`${pathName}: expected a container, got leaf type ${raw.type}`);
    }
    if (!KNOWN_LEAF_TYPES.has(raw.type)) {
      problems.push(`${pathName}: unknown leaf type ${raw.type}`);
    } else if (
      expected?.kind === 'leaf' &&
      expected.type !== raw.type &&
      !(expected.type === 'fontWeight' && raw.type === 'string')
    ) {
      problems.push(`${pathName}: declared type ${raw.type}, schema expects ${expected.type}`);
    }

    const hasValue = Object.prototype.hasOwnProperty.call(raw, 'value');
    if (
      hasValue &&
      !(raw.runtimeOnly === true && raw.value === null) &&
      !isValidPropertyValue(raw.type, raw.value)
    ) {
      problems.push(`${pathName}: type ${raw.type} has ${valueShape(raw.value)} value`);
    }

    if (isRecord(raw.animation) && 'keyframes' in raw.animation) {
      validateAnimationValues(raw.type, raw.animation.keyframes, `${pathName}.animation.keyframes`, problems);
    } else if ('animation' in raw && raw.animation !== undefined) {
      problems.push(`${pathName}.animation: expected an object`);
    }
    if (isRecord(raw.randomizer)) {
      validateRandomizer(raw.type, raw.randomizer, `${pathName}.randomizer`, problems);
    } else if ('randomizer' in raw && raw.randomizer !== undefined) {
      problems.push(`${pathName}.randomizer: expected an object`);
    }
    return;
  }

  const children = isRecord(raw.properties) ? raw.properties : raw;
  if (expected?.kind === 'leaf') {
    problems.push(`${pathName}: schema expects leaf type ${expected.type}, got a container`);
  }
  const expectedChildren = expected?.kind === 'container' ? expected.children : {};
  for (const [key, child] of Object.entries(children)) {
    validateRawProperty(child, expectedChildren[key], `${pathName}.${key}`, problems);
  }
}

function effectTemplateFor(effectName: string): EffectTemplate | undefined {
  return EFFECT_TEMPLATES.find((template) => template.effect.toLowerCase() === effectName.toLowerCase());
}

function validateRawEffect(
  rawEffect: unknown,
  pathName: string,
  problems: string[],
): void {
  if (!isRecord(rawEffect)) {
    problems.push(`${pathName}: expected an effect object`);
    return;
  }
  const effectName = typeof rawEffect.effect === 'string' ? rawEffect.effect : undefined;
  if (!effectName) {
    problems.push(`${pathName}.effect: expected a string`);
    return;
  }
  const template = effectTemplateFor(effectName);
  const rawProps = rawEffect.props;
  if (!isRecord(rawProps)) {
    problems.push(`${pathName}.props: expected an object`);
    return;
  }
  for (const [key, value] of Object.entries(rawProps)) {
    const expected = template?.props[key];
    if (!expected && template) {
      problems.push(`${pathName}.props.${key}: unknown property for ${effectName}`);
    }
    validateRawProperty(value, expected, `${pathName}.props.${key}`, problems);
  }
}

function animationTargetType(
  entity: EcsEntityDoc,
  target: string,
): { type?: string; error?: string } {
  const option = listAnimatableTargets(entity).find((candidate) => candidate.target === target);
  return option
    ? { type: option.kind }
    : {
        error: `unknown animation target ${target}; use Component.property or Effect#id.property`,
      };
}

function validateAnimationTracks(
  rawComponent: Record<string, unknown>,
  entity: EcsEntityDoc,
  pathName: string,
  problems: string[],
): void {
  const rawTracks = rawComponent.tracks;
  if (!Array.isArray(rawTracks)) {
    problems.push(`${pathName}.tracks: expected an array`);
    return;
  }

  for (const [trackIndex, rawTrack] of rawTracks.entries()) {
    const trackPath = `${pathName}.tracks[${trackIndex}]`;
    if (!isRecord(rawTrack)) {
      problems.push(`${trackPath}: expected an object`);
      continue;
    }
    if (typeof rawTrack.target !== 'string') {
      problems.push(`${trackPath}.target: expected a string`);
    }
    if (!Array.isArray(rawTrack.keyframes)) {
      problems.push(`${trackPath}.keyframes: expected an array`);
      continue;
    }

    const target = typeof rawTrack.target === 'string'
      ? animationTargetType(entity, rawTrack.target)
      : { error: 'missing animation target' };
    if (target.error) {
      problems.push(`${trackPath}: ${target.error}`);
    } else if (target.type !== 'number' && target.type !== 'vector2' && target.type !== 'paint') {
      problems.push(`${trackPath}: target ${rawTrack.target} is not animatable type ${target.type}`);
    }

    for (const [keyframeIndex, rawKeyframe] of rawTrack.keyframes.entries()) {
      const keyframePath = `${trackPath}.keyframes[${keyframeIndex}]`;
      if (!isRecord(rawKeyframe)) {
        problems.push(`${keyframePath}: expected an object`);
        continue;
      }
      if (typeof rawKeyframe.time !== 'number' || !Number.isFinite(rawKeyframe.time)) {
        problems.push(`${keyframePath}.time: expected a finite number`);
      }
      if (target.type && !isValidPropertyValue(target.type, rawKeyframe.value)) {
        problems.push(`${keyframePath}.value: target type ${target.type} has ${valueShape(rawKeyframe.value)} value`);
      }
    }
  }
}

function validateRawEffectIds(
  rawEntity: Record<string, unknown>,
  pathName: string,
  problems: string[],
  seen = new Map<string, string>(),
): void {
  const visitEffects = (rawEffects: unknown, effectsPath: string): void => {
    if (!Array.isArray(rawEffects)) return;
    for (const [index, rawEffect] of rawEffects.entries()) {
      const effectPath = `${effectsPath}[${index}]`;
      if (!isRecord(rawEffect)) continue;
      const id = rawEffect.id;
      if (typeof id !== 'string' || id.trim().length === 0) {
        problems.push(`${effectPath}.id: expected a stable effect ID`);
        continue;
      }
      if (!SCOPED_EFFECT_ID_PATTERN.test(id)) {
        problems.push(`${effectPath}.id: expected a scoped effect ID`);
      }
      const previousPath = seen.get(id);
      if (previousPath) {
        problems.push(`${effectPath}.id: duplicate effect ID "${id}" also used at ${previousPath}`);
      } else {
        seen.set(id, effectPath);
      }
    }
  };
  const visitComponents = (rawComponents: unknown, componentsPath: string): void => {
    if (!Array.isArray(rawComponents)) return;
    for (const [index, rawComponent] of rawComponents.entries()) {
      if (!isRecord(rawComponent)) continue;
      const componentPath = `${componentsPath}[${index}]`;
      visitEffects(rawComponent.effects, `${componentPath}.effects`);
      visitComponents(rawComponent.components, `${componentPath}.components`);
    }
  };

  visitEffects(rawEntity.effects, `${pathName}.effects`);
  visitComponents(rawEntity.components, `${pathName}.components`);
}

const SCOPED_EFFECT_ID_PATTERN = /^[a-zA-Z0-9_-]+-[0-9a-f]{16}:[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+$/;
const COMPONENTS_WITHOUT_SERIALIZED_PROPS = new Set(['animation', 'selfLayout', 'transform']);

function validateRawComponentContract(
  rawComponent: Record<string, unknown>,
  pathName: string,
  problems: string[],
): void {
  const componentName = rawComponent.component;
  const hasProps = Object.prototype.hasOwnProperty.call(rawComponent, 'props');

  if (!hasProps && typeof componentName === 'string' && !COMPONENTS_WITHOUT_SERIALIZED_PROPS.has(componentName)) {
    problems.push(`${pathName}.props: component ${componentName} must serialize a props object`);
  }

  if (componentName !== 'verticalSpacer' && componentName !== 'horizontalSpacer') return;
  const rawProps = rawComponent.props;
  if (!isRecord(rawProps) || !Object.prototype.hasOwnProperty.call(rawProps, 'spacing')) {
    problems.push(`${pathName}.props.spacing: spacer spacing must be serialized explicitly`);
  }
}

function validateRawEntity(
  rawEntity: unknown,
  entity: EcsEntityDoc,
  pathName: string,
  problems: string[],
  effectIds = new Map<string, string>(),
): void {
  if (!isRecord(rawEntity)) {
    problems.push(`${pathName}: expected an entity object`);
    return;
  }
  validateRawEffectIds(rawEntity, pathName, problems, effectIds);
  const templates = flattenComponentTemplates(schemaForEntity(entity));
  const componentTemplateFor = (componentName: string): ComponentTemplate | undefined =>
    templates.find((template) => template.component === componentName);

  const rawComponents = rawEntity.components;
  if (
    entity.entity === 'row' &&
    !isInheritedStateEntity(entity) &&
    (!Array.isArray(rawComponents) ||
      !rawComponents.some((component) => isRecord(component) && component.component === 'layout'))
  ) {
    problems.push(`${pathName}: row must include a layout component`);
  }
  if (Array.isArray(rawComponents)) {
    for (const [componentIndex, rawComponent] of rawComponents.entries()) {
      const componentPath = `${pathName}.components[${componentIndex}]`;
      if (!isRecord(rawComponent) || typeof rawComponent.component !== 'string') {
        problems.push(`${componentPath}: expected a component object with a string component`);
        continue;
      }
      const template = componentTemplateFor(rawComponent.component);
      const rawProps = rawComponent.props;
      validateRawComponentContract(rawComponent, componentPath, problems);
      if (rawProps !== undefined && !isRecord(rawProps)) {
        problems.push(`${componentPath}.props: expected an object`);
      } else if (isRecord(rawProps)) {
        for (const [key, value] of Object.entries(rawProps)) {
          validateRawProperty(value, template?.props[key], `${componentPath}.props.${key}`, problems);
        }
      }

      if (rawComponent.component === 'animation') {
        validateAnimationTracks(rawComponent, entity, componentPath, problems);
      }

      if (Array.isArray(rawComponent.effects)) {
        for (const [effectIndex, rawEffect] of rawComponent.effects.entries()) {
          validateRawEffect(rawEffect, `${componentPath}.effects[${effectIndex}]`, problems);
        }
      }
      if (Array.isArray(rawComponent.components)) {
        for (const [nestedIndex, nestedComponent] of rawComponent.components.entries()) {
          validateRawEntityComponent(nestedComponent, `${componentPath}.components[${nestedIndex}]`, templates, problems);
        }
      }
    }
  }

  if (Array.isArray(rawEntity.effects)) {
    for (const [effectIndex, rawEffect] of rawEntity.effects.entries()) {
      validateRawEffect(rawEffect, `${pathName}.effects[${effectIndex}]`, problems);
    }
  }

  if (Array.isArray(rawEntity.children)) {
    for (const [childIndex, rawChild] of rawEntity.children.entries()) {
      if (entity.children[childIndex]) {
        validateRawEntity(rawChild, entity.children[childIndex], `${pathName}.children[${childIndex}]`, problems, effectIds);
      }
    }
  }
}

function validateRawEntityComponent(
  rawComponent: unknown,
  pathName: string,
  templates: readonly ComponentTemplate[],
  problems: string[],
): void {
  if (!isRecord(rawComponent) || typeof rawComponent.component !== 'string') {
    problems.push(`${pathName}: expected a component object with a string component`);
    return;
  }
  const template = templates.find((candidate) => candidate.component === rawComponent.component);
  const rawProps = rawComponent.props;
  validateRawComponentContract(rawComponent, pathName, problems);
  if (rawProps !== undefined && !isRecord(rawProps)) {
    problems.push(`${pathName}.props: expected an object`);
  } else if (isRecord(rawProps)) {
    for (const [key, value] of Object.entries(rawProps)) {
      validateRawProperty(value, template?.props[key], `${pathName}.props.${key}`, problems);
    }
  }

  if (Array.isArray(rawComponent.effects)) {
    for (const [effectIndex, rawEffect] of rawComponent.effects.entries()) {
      validateRawEffect(rawEffect, `${pathName}.effects[${effectIndex}]`, problems);
    }
  }
  if (Array.isArray(rawComponent.components)) {
    for (const [nestedIndex, nestedComponent] of rawComponent.components.entries()) {
      validateRawEntityComponent(nestedComponent, `${pathName}.components[${nestedIndex}]`, templates, problems);
    }
  }
}

function validatePresetTypes(
  raw: Record<string, unknown>,
  parsed: ReturnType<typeof parsePresetDocument>,
): string[] {
  const problems: string[] = [];
  if (isRecord(raw.metadata) && 'surface' in raw.metadata) {
    problems.push('$.metadata.surface: this metadata field is no longer supported');
  }
  validateRawEntity(raw.design, parsed.design, '$.design', problems);
  validateRawProperty(raw.preview, undefined, '$.preview', problems);
  validateBackgroundPatternBaseColors(raw.design, '$.design', problems);
  return problems;
}

function validateBackgroundPatternBaseColors(raw: unknown, pathName: string, problems: string[]): void {
  if (!isRecord(raw)) return;

  const rawComponents = raw.components;
  if (Array.isArray(rawComponents)) {
    for (const [index, rawComponent] of rawComponents.entries()) {
      const componentPath = `${pathName}.components[${index}]`;
      if (!isRecord(rawComponent)) continue;

      if (rawComponent.component === 'backgroundStyle' && isRecord(rawComponent.props)) {
        const fill = rawComponent.props.fill;
        const fillPattern = rawComponent.props.fillPattern;
        const fillValue = isRecord(fill) && isRecord(fill.value) ? fill.value : undefined;
        const patternValue = isRecord(fillPattern) && isRecord(fillPattern.value) ? fillPattern.value : undefined;
        const baseColor =
          isRecord(fillValue) && fillValue.type === 'solid' && typeof fillValue.color === 'string'
            ? fillValue.color
            : undefined;
        const fillPatternMode = patternValue?.pattern ?? patternValue?.mode;
        const colors = patternValue?.colors;

        if (
          baseColor &&
          (fillPatternMode === 'cycle' || fillPatternMode === 'alternate') &&
          Array.isArray(colors) &&
          colors.length > 0 &&
          colors[0] !== baseColor
        ) {
          problems.push(
            `${componentPath}.props.fillPattern: first color ${JSON.stringify(colors[0])} must match fill ${JSON.stringify(baseColor)}`,
          );
        }
      }

      validateBackgroundPatternBaseColors(rawComponent, componentPath, problems);
    }
  }

  if (Array.isArray(raw.children)) {
    for (const [index, rawChild] of raw.children.entries()) {
      validateBackgroundPatternBaseColors(rawChild, `${pathName}.children[${index}]`, problems);
    }
  }
}

function deepEqual(a: unknown, b: unknown, atPath: string): string[] {
  const problems: string[] = [];
  if (a === b) return problems;

  if (typeof a !== typeof b) {
    problems.push(`${atPath}: type mismatch (${typeof a} vs ${typeof b})`);
    return problems;
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) {
      problems.push(`${atPath}: array/non-array mismatch`);
      return problems;
    }
    if (a.length !== b.length) {
      problems.push(`${atPath}: array length ${a.length} vs ${b.length}`);
    }
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
      problems.push(...deepEqual(a[i], b[i], `${atPath}[${i}]`));
    }
    return problems;
  }

  if (typeof a === 'object' && a !== null && b !== null) {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);
    for (const key of keys) {
      if (!(key in aObj)) {
        problems.push(`${atPath}.${key}: missing in original, present in round-trip`);
        continue;
      }
      if (!(key in bObj)) {
        problems.push(`${atPath}.${key}: present in original, missing in round-trip`);
        continue;
      }
      problems.push(...deepEqual(aObj[key], bObj[key], `${atPath}.${key}`));
    }
    return problems;
  }

  problems.push(`${atPath}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
  return problems;
}

function withoutStudioIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutStudioIds);
  if (typeof value !== 'object' || value === null) return value;

  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key !== 'studioId') result[key] = withoutStudioIds(child);
  }
  return result;
}

function withoutUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutUndefined);
  if (typeof value !== 'object' || value === null) return value;

  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (child !== undefined) result[key] = withoutUndefined(child);
  }
  return result;
}

const UNSERIALIZED_COMPONENT_KEYS = ['studioId', 'explicit', 'allowedEntities', 'allowedQuantity', 'allowDisable', 'isDeletable'];

function findSerializedComponentKeys(entity: unknown, pathName: string): string[] {
  if (!isRecord(entity)) return [];
  const problems: string[] = [];
  const components = Array.isArray(entity.components) ? entity.components : [];
  components.forEach((component, index) => {
    if (!isRecord(component)) return;
    for (const key of UNSERIALIZED_COMPONENT_KEYS) {
      if (key in component) problems.push(`${pathName}.components[${index}].${key} must not be serialized`);
    }
    problems.push(...findSerializedComponentKeys(component, `${pathName}.components[${index}]`));
  });
  const children = Array.isArray(entity.children) ? entity.children : [];
  children.forEach((child, index) => {
    problems.push(...findSerializedComponentKeys(child, `${pathName}.children[${index}]`));
  });
  return problems;
}

let failures = 0;
const files = readdirSync(presetsDir).filter((f) => f.endsWith('.json'));

console.log(`Validating ${files.length} presets from ${presetsDir}\n`);

for (const file of files) {
  const fullPath = path.join(presetsDir, file);
  try {
    const raw = JSON.parse(readFileSync(fullPath, 'utf8'));
    const parsed = parsePresetDocument(raw, file);
    const roundTripped = serializePresetDocument(parsed);
    const reparsed = parsePresetDocument(roundTripped, `${file} (round-trip)`);
    const problems = [
      ...validatePresetTypes(raw, parsed),
      ...findSerializedComponentKeys(roundTripped.design, `${file}.design`),
      ...deepEqual(
        withoutUndefined(roundSerializedNumbers(withoutStudioIds(parsed))),
        withoutUndefined(withoutStudioIds(reparsed)),
        file,
      ),
    ];
    if (problems.length > 0) {
      failures++;
      console.log(`FAIL ${file}:`);
      for (const p of problems.slice(0, 20)) console.log(`  - ${p}`);
      if (problems.length > 20) console.log(`  ... and ${problems.length - 20} more`);
    } else {
      console.log(`OK   ${file}`);
    }
  } catch (err) {
    failures++;
    console.log(`ERROR ${file}: ${(err as Error).message}`);
  }
}

console.log(`\n${files.length - failures}/${files.length} presets round-tripped cleanly.`);
if (failures > 0) {
  process.exit(1);
}
