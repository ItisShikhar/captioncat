import { Canvas } from '#platform/canvas.js';
import { acquireCanvas, releaseCanvas } from '../../../utilities/canvas-pool';
import { clamp } from '../../../utilities/number-utils';
import { Property } from '../property';
import { isPaint, normalizePaint, resolvePaint, solidPaint, type Paint } from '../paint';
import { type CanvasContext2D, type Margins, type ResolveContext, type Vector2, toVec2 } from '../types';
import { Effect, type EffectSource, type ShowOriginal } from './effect';
import {
  DEFAULT_REPLICATOR_FILL_MODE,
  DEFAULT_REPLICATOR_FILL_TARGET,
  DEFAULT_REPLICATOR_FILL_SEED,
  DEFAULT_REPLICATOR_CUSTOM_FILLS,
  replicatorFillForCopy,
  type ReplicatorFillMode,
  type ReplicatorFillTarget,
} from './replicator-fill';

export const DEFAULT_REPLICATOR_CLONE_COUNT = 3;
export const MAX_REPLICATOR_CLONE_COUNT = 1024;
export const DEFAULT_REPLICATOR_CLONE_ORDERING = 'backToFront' as const;

export type ReplicatorCloneOrdering = 'frontToBack' | 'backToFront';

type CopyTransformKey = 'position' | 'dimensions' | 'rotation' | 'scale' | 'opacity';

export interface ReplicatorCopy {
  readonly id: string;
  index: number;
  transform: Record<CopyTransformKey, Property<unknown>>;
  fill: Property<unknown>;
}

export type ReplicatorSource = EffectSource;

interface AffineTransform {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

const IDENTITY: AffineTransform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

const COPY_TRANSFORM_KEYS: readonly CopyTransformKey[] = ['position', 'dimensions', 'rotation', 'scale', 'opacity'];

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function copyIdValue(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const id = String(value).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function multiply(first: AffineTransform, second: AffineTransform): AffineTransform {
  return {
    a: first.a * second.a + first.c * second.b,
    b: first.b * second.a + first.d * second.b,
    c: first.a * second.c + first.c * second.d,
    d: first.b * second.c + first.d * second.d,
    e: first.a * second.e + first.c * second.f + first.e,
    f: first.b * second.e + first.d * second.f + first.f,
  };
}

function inverse(matrix: AffineTransform): AffineTransform | undefined {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (Math.abs(determinant) < 1e-8) return undefined;
  return {
    a: matrix.d / determinant,
    b: -matrix.b / determinant,
    c: -matrix.c / determinant,
    d: matrix.a / determinant,
    e: (matrix.c * matrix.f - matrix.d * matrix.e) / determinant,
    f: (matrix.b * matrix.e - matrix.a * matrix.f) / determinant,
  };
}

function matrixFromContext(matrix: ReturnType<CanvasContext2D['getTransform']>): AffineTransform {
  return { a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d, e: matrix.e, f: matrix.f };
}

function localCopyTransform(copy: ReplicatorCopy, rctx: ResolveContext, source: ReplicatorSource): AffineTransform {
  const position = toVec2(copy.transform.position.resolve(rctx));
  const scale = toVec2(copy.transform.scale.resolve(rctx));
  const dimensions = toVec2(copy.transform.dimensions.resolve(rctx));
  const sourceWidth = finiteNumber(source.bounds?.width, 0);
  const sourceHeight = finiteNumber(source.bounds?.height, 0);
  const widthScale = sourceWidth > 0 && dimensions.x > 0 ? dimensions.x / sourceWidth : 1;
  const heightScale = sourceHeight > 0 && dimensions.y > 0 ? dimensions.y / sourceHeight : 1;
  const scaledX = scale.x * widthScale;
  const scaledY = scale.y * heightScale;
  const rotation = (finiteNumber(copy.transform.rotation.resolve(rctx), 0) * Math.PI) / 180;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return {
    a: cosine * scaledX,
    b: sine * scaledX,
    c: -sine * scaledY,
    d: cosine * scaledY,
    e: position.x,
    f: position.y,
  };
}

function copyPath(path: string): { copyId: string; property: CopyTransformKey | 'fill' } | undefined {
  const parts = path.split('.');
  const start = parts[0] === 'copyOverrides' ? 1 : 0;
  const copyId = parts[start];
  if (!copyId) return undefined;
  const component = parts[start + 1];
  const property = parts[start + 2];
  if (component === 'transform' && COPY_TRANSFORM_KEYS.includes(property as CopyTransformKey)) {
    return { copyId, property: property as CopyTransformKey };
  }
  if (component === 'fill' && property === undefined) return { copyId, property: 'fill' };
  if (start === 1 && component === 'fill') return { copyId, property: 'fill' };
  if (start === 1 && COPY_TRANSFORM_KEYS.includes(component as CopyTransformKey)) {
    return { copyId, property: component as CopyTransformKey };
  }
  return undefined;
}

export function isReplicatorCopyPath(path: string): boolean {
  return copyPath(path) !== undefined;
}

export class ReplicatorEffect extends Effect {
  readonly type = 'replicator';
  private copyOrder: string[] = [];
  private copies = new Map<string, ReplicatorCopy>();
  private sourceDimensions: Vector2 = { x: 0, y: 0 };
  private sourceColor: Paint = solidPaint('rgba(0,0,0,0)');

  override getShowOriginal(rctx: ResolveContext): ShowOriginal {
    return this.getProp('showOriginal') ? super.getShowOriginal(rctx) : 'front';
  }

  override clone(): ReplicatorEffect {
    const copy = super.clone() as ReplicatorEffect;
    copy.copyOrder = [];
    copy.copies = new Map();
    copy.sourceDimensions = { x: 0, y: 0 };
    copy.sourceColor = solidPaint('rgba(0,0,0,0)');
    return copy;
  }

  getCloneCount(rctx: ResolveContext): number {
    const cloneCount = finiteNumber(
      this.getProp<number>('cloneCount')?.resolve(rctx),
      DEFAULT_REPLICATOR_CLONE_COUNT,
    );
    return Math.min(MAX_REPLICATOR_CLONE_COUNT, Math.max(1, Math.floor(cloneCount)));
  }

  getCloneOrdering(rctx: ResolveContext): ReplicatorCloneOrdering {
    const value = this.getProp<string>('cloneOrdering')?.resolve(rctx);
    return value === 'frontToBack' || value === 'backToFront' ? value : DEFAULT_REPLICATOR_CLONE_ORDERING;
  }

  getCopyIds(rctx: ResolveContext): string[] {
    const cloneCount = this.getCloneCount(rctx);
    const authored = copyIdValue(this.getProp<unknown>('copyIds')?.resolve(rctx));
    if (authored.length > 0) this.copyOrder = authored;
    while (this.copyOrder.length < cloneCount) {
      let index = this.copyOrder.length + 1;
      let id = `copy_${index}`;
      while (this.copyOrder.includes(id)) {
        index += 1;
        id = `copy_${index}`;
      }
      this.copyOrder.push(id);
    }
    return this.copyOrder.slice(0, cloneCount);
  }

  getFillMode(rctx: ResolveContext): ReplicatorFillMode {
    const value = String(this.getProp<string>('fillMode')?.resolve(rctx) ?? DEFAULT_REPLICATOR_FILL_MODE);
    return value === 'random' || value === 'custom' ? value : DEFAULT_REPLICATOR_FILL_MODE;
  }

  getFillTarget(rctx: ResolveContext): ReplicatorFillTarget {
    const value = String(this.getProp<string>('fillTarget')?.resolve(rctx) ?? DEFAULT_REPLICATOR_FILL_TARGET);
    return value === 'fullLayer' ? value : DEFAULT_REPLICATOR_FILL_TARGET;
  }

  getFillSeed(rctx: ResolveContext): number {
    const value = this.getProp<number>('fillSeed')?.resolve(rctx);
    return finiteNumber(value, DEFAULT_REPLICATOR_FILL_SEED);
  }

  getCustomFills(rctx: ResolveContext): Paint[] {
    const value = this.getProp<unknown>('customFills')?.resolve(rctx);
    const fills = Array.isArray(value)
      ? value.filter(isPaint).map((fill) => normalizePaint(fill, solidPaint('#000000')))
      : [];
    return fills.length > 0 ? fills : DEFAULT_REPLICATOR_CUSTOM_FILLS.map((fill) => normalizePaint(fill, solidPaint('#000000')));
  }

  private patternVector(name: string, fallback: Vector2, rctx: ResolveContext): Vector2 {
    return toVec2(this.getProp<Vector2>(name)?.resolve(rctx) ?? fallback);
  }

  private patternRotation(rctx: ResolveContext): number {
    return finiteNumber(this.getProp<number>('rotation')?.resolve(rctx), 0);
  }

  private patternOpacity(rctx: ResolveContext): number {
    return finiteNumber(this.getProp<number>('opacity')?.resolve(rctx), 0);
  }

  private copiesForRendering(copies: readonly ReplicatorCopy[], rctx: ResolveContext): readonly ReplicatorCopy[] {
    return this.getCloneOrdering(rctx) === 'frontToBack' ? [...copies].reverse() : copies;
  }

  private overrideProperty(
    copyId: string,
    component: 'transform' | 'fill',
    property?: string,
  ): Property<unknown> | undefined {
    const path = property
      ? `copyOverrides.${copyId}.${component}.${property}`
      : `copyOverrides.${copyId}.${component}`;
    return this.getProp(path) ?? (property ? this.getProp(`copyOverrides.${copyId}.${property}`) : undefined);
  }

  private ensureProperty<T>(
    current: Property<unknown> | undefined,
    kind: Property<T>['kind'],
    generated: T,
    override: Property<unknown> | undefined,
  ): Property<unknown> {
    const value = (override?.base as T | undefined) ?? generated;
    if (current?.kind === kind) {
      current.setBase(value);
      return current;
    }
    return new Property({ kind, base: value });
  }

  prepareVirtualCopies(rctx: ResolveContext, source: ReplicatorSource = {}): readonly ReplicatorCopy[] {
    if (source.bounds) {
      this.sourceDimensions = {
        x: finiteNumber(source.bounds.width, 0),
        y: finiteNumber(source.bounds.height, 0),
      };
    }
    if (source.color !== undefined) this.sourceColor = source.color;

    const position = this.patternVector('position', { x: 0, y: 0 }, rctx);
    const rotation = this.patternRotation(rctx);
    const scale = this.patternVector('scale', { x: 0, y: 0 }, rctx);
    const opacity = this.patternOpacity(rctx);
    const fillMode = this.getFillMode(rctx);
    const fillSeed = this.getFillSeed(rctx);
    const customFills = this.getCustomFills(rctx);
    const ids = this.getCopyIds(rctx);
    const active = new Set(ids);
    for (const id of this.copies.keys()) {
      if (!active.has(id)) this.copies.delete(id);
    }

    for (let index = 0; index < ids.length; index += 1) {
      const id = ids[index];
      const previous = this.copies.get(id);
      const copy: ReplicatorCopy = previous ?? {
        id,
        index,
        transform: {} as Record<CopyTransformKey, Property<unknown>>,
        fill: new Property({ kind: 'paint', base: solidPaint('#ffffff') }),
      };
      copy.index = index;
      const multiplier = index + 1;
      copy.transform.position = this.ensureProperty(
        copy.transform.position,
        'vector2',
        { x: position.x * multiplier, y: position.y * multiplier },
        this.overrideProperty(id, 'transform', 'position'),
      );
      copy.transform.dimensions = this.ensureProperty(
        copy.transform.dimensions,
        'vector2',
        this.sourceDimensions,
        this.overrideProperty(id, 'transform', 'dimensions'),
      );
      copy.transform.rotation = this.ensureProperty(
        copy.transform.rotation,
        'number',
        rotation * multiplier,
        this.overrideProperty(id, 'transform', 'rotation'),
      );
      copy.transform.scale = this.ensureProperty(
        copy.transform.scale,
        'vector2',
        { x: 1 + scale.x * multiplier, y: 1 + scale.y * multiplier },
        this.overrideProperty(id, 'transform', 'scale'),
      );
      copy.transform.opacity = this.ensureProperty(
        copy.transform.opacity,
        'number',
        clamp(1 + opacity * multiplier, 0, 1),
        this.overrideProperty(id, 'transform', 'opacity'),
      );
      const generatedPaint =
        fillMode === 'random'
          ? replicatorFillForCopy(fillSeed, id)
          : fillMode === 'custom'
            ? customFills[index % customFills.length]
            : this.sourceColor;
      copy.fill = this.ensureProperty(
        copy.fill,
        'paint',
        generatedPaint,
        this.overrideProperty(id, 'fill'),
      );
      this.copies.set(id, copy);
    }
    return ids.map((id) => this.copies.get(id)).filter((copy): copy is ReplicatorCopy => copy !== undefined);
  }

  getVirtualProperty(path: string): Property<unknown> | undefined {
    const parsed = copyPath(path);
    if (!parsed) return undefined;
    const copy = this.copies.get(parsed.copyId);
    if (!copy) return undefined;
    if (parsed.property === 'fill') return copy.fill;
    return copy.transform[parsed.property];
  }

  override getMargins(rctx: ResolveContext, source: ReplicatorSource = {}): Margins {
    const copies = this.prepareVirtualCopies(rctx, source);
    const width = finiteNumber(source.bounds?.width, this.sourceDimensions.x);
    const height = finiteNumber(source.bounds?.height, this.sourceDimensions.y);
    if (width <= 0 || height <= 0) {
      const cloneCount = this.getCloneCount(rctx);
      const position = this.patternVector('position', { x: 0, y: 0 }, rctx);
      return { x: Math.abs(position.x) * cloneCount, y: Math.abs(position.y) * cloneCount };
    }

    const halfWidth = width / 2;
    const halfHeight = height / 2;
    let marginX = 0;
    let marginY = 0;
    const corners = [
      [-halfWidth, -halfHeight],
      [halfWidth, -halfHeight],
      [halfWidth, halfHeight],
      [-halfWidth, halfHeight],
    ] as const;
    for (const copy of copies) {
      const transform = localCopyTransform(copy, rctx, { bounds: { width, height } });
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      for (const [x, y] of corners) {
        const transformedX = transform.a * x + transform.c * y + transform.e;
        const transformedY = transform.b * x + transform.d * y + transform.f;
        minX = Math.min(minX, transformedX);
        minY = Math.min(minY, transformedY);
        maxX = Math.max(maxX, transformedX);
        maxY = Math.max(maxY, transformedY);
      }
      marginX = Math.max(marginX, -halfWidth - minX, maxX - halfWidth);
      marginY = Math.max(marginY, -halfHeight - minY, maxY - halfHeight);
    }
    return { x: Math.max(0, marginX), y: Math.max(0, marginY) };
  }

  override apply(ctx: CanvasContext2D, rctx: ResolveContext, draw: () => void): void {
    const showOriginal = this.getShowOriginal(rctx);
    if (showOriginal === 'back') draw();
    const copies = this.prepareVirtualCopies(rctx);
    for (const copy of this.copiesForRendering(copies, rctx)) {
      ctx.save();
      const position = toVec2(copy.transform.position.resolve(rctx));
      const scale = toVec2(copy.transform.scale.resolve(rctx));
      const rotation = (finiteNumber(copy.transform.rotation.resolve(rctx), 0) * Math.PI) / 180;
      ctx.globalAlpha *= clamp(finiteNumber(copy.transform.opacity.resolve(rctx), 1), 0, 1);
      ctx.translate(position.x, position.y);
      ctx.rotate(rotation);
      ctx.scale(scale.x, scale.y);
      draw();
      ctx.restore();
    }
    if (showOriginal === 'front') draw();
  }

  renderCopies(
    output: CanvasContext2D,
    input: Canvas,
    rctx: ResolveContext,
    baseTransform?: ReturnType<CanvasContext2D['getTransform']>,
    source: ReplicatorSource = {},
    baseInput?: Canvas,
  ): void {
    const copies = this.prepareVirtualCopies(rctx, source);
    const base = baseTransform ? matrixFromContext(baseTransform) : IDENTITY;
    const inverseBase = inverse(base);
    if (!inverseBase) return;
    const showOriginal = this.getProp('showOriginal') ? this.getShowOriginal(rctx) : 'none';
    const fillTarget = this.getFillTarget(rctx);
    const drawOriginal = () => {
      output.save();
      output.setTransform(1, 0, 0, 1, 0, 0);
      output.drawImage(input, 0, 0);
      output.restore();
    };
    if (showOriginal === 'back') drawOriginal();
    for (const copy of this.copiesForRendering(copies, rctx)) {
      const transform = multiply(multiply(base, localCopyTransform(copy, rctx, {
        bounds: source.bounds ?? { width: this.sourceDimensions.x, height: this.sourceDimensions.y },
        color: source.color ?? this.sourceColor,
      })), inverseBase);
      const copyCanvas = acquireCanvas(input.width, input.height);
      let fillMaskCanvas: Canvas | undefined;
      let coloredCanvas: Canvas | undefined;
      try {
        const copyContext = copyCanvas.getContext('2d');
        copyContext.setTransform(transform.a, transform.b, transform.c, transform.d, transform.e, transform.f);
        copyContext.globalAlpha = clamp(finiteNumber(copy.transform.opacity.resolve(rctx), 1), 0, 1);
        copyContext.drawImage(input, 0, 0);

        const paint = copy.fill.resolve(rctx) as Paint;
        const hasFillOverride = this.overrideProperty(copy.id, 'fill') !== undefined;
        const fillSource = fillTarget === 'fullLayer' ? input : baseInput;
        if (fillSource && (this.getFillMode(rctx) !== 'inherit' || hasFillOverride)) {
          fillMaskCanvas = acquireCanvas(input.width, input.height);
          const fillMaskContext = fillMaskCanvas.getContext('2d');
          fillMaskContext.setTransform(transform.a, transform.b, transform.c, transform.d, transform.e, transform.f);
          fillMaskContext.drawImage(fillSource, 0, 0);

          coloredCanvas = acquireCanvas(input.width, input.height);
          const coloredContext = coloredCanvas.getContext('2d');
          coloredContext.setTransform(transform.a, transform.b, transform.c, transform.d, transform.e, transform.f);
          coloredContext.drawImage(fillSource, 0, 0);
          coloredContext.setTransform(1, 0, 0, 1, 0, 0);
          coloredContext.globalCompositeOperation = 'source-in';
          coloredContext.fillStyle = resolvePaint(coloredContext, paint, {
            x: 0,
            y: 0,
            width: input.width,
            height: input.height,
          });
          coloredContext.fillRect(0, 0, input.width, input.height);

          if (fillTarget === 'fullLayer') {
            copyContext.setTransform(1, 0, 0, 1, 0, 0);
            copyContext.clearRect(0, 0, input.width, input.height);
            copyContext.globalCompositeOperation = 'source-over';
            copyContext.globalAlpha = clamp(finiteNumber(copy.transform.opacity.resolve(rctx), 1), 0, 1);
            copyContext.drawImage(coloredCanvas, 0, 0);
          } else {
            copyContext.setTransform(1, 0, 0, 1, 0, 0);
            copyContext.globalAlpha = 1;
            copyContext.globalCompositeOperation = 'destination-out';
            copyContext.drawImage(fillMaskCanvas, 0, 0);
            copyContext.globalCompositeOperation = 'source-over';
            copyContext.globalAlpha = clamp(finiteNumber(copy.transform.opacity.resolve(rctx), 1), 0, 1);
            copyContext.drawImage(coloredCanvas, 0, 0);
          }
        }
        output.save();
        output.setTransform(1, 0, 0, 1, 0, 0);
        output.drawImage(copyCanvas, 0, 0);
        output.restore();
      } finally {
        releaseCanvas(coloredCanvas);
        releaseCanvas(fillMaskCanvas);
        releaseCanvas(copyCanvas);
      }
    }
    if (showOriginal === 'front') drawOriginal();
  }
}