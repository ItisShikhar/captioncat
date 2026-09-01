import { acquireCanvas, releaseCanvas } from '../../../utilities/canvas-pool';

import type {
  AnimationCurve,
  AnimationKeyframe,
  AnimationTrackDefinition,
  NamedAnimationCurve,
} from '../animation';
import { resolveAdaptiveTiming, sampleTrack, type AdaptiveTiming } from '../animation';
import { loadedImageAsset } from '../assets';
import {
  cursorAssetForPreset,
  cursorAssetSource,
  cursorPresetDefinition,
  normalizeCursorColorMode,
  normalizeCursorPreset,
} from '#platform/cursor-assets.js';
import { staticProperty, type Property } from '../property';
import { normalizePaint, resolvePaint, type Paint, type PaintBounds } from '../paint';
import {
  measureTextWithLetterSpacing,
  resolveLetterSpacing,
  segmentTextGraphemes,
  segmentTextRuns,
  type TextRun,
  type TextRunStyle,
} from '../text-layout';
import { toVec2, type CanvasContext2D, type Margins, type ResolveContext, type Vector2 } from '../types';
import type { ResolvedTextDirection } from '../text-direction';
import type { EffectSource } from './effect';
import { Effect } from './effect';

export type TypewriterUnitTrackTarget =
  | 'unit.opacity'
  | 'unit.scale'
  | 'unit.offset'
  | 'unit.rotation'
  | 'unit.color';

export interface TypewriterUnitTrack extends AnimationTrackDefinition {
  target: TypewriterUnitTrackTarget;
}

export interface TypewriterUnitStyle {
  opacity: number;
  scale: Vector2;
  offset: Vector2;
  rotation: number;
  color: Paint;
}

export interface TypewriterUnitLayout extends TypewriterUnitStyle {
  index: number;
  text: string;
  font?: string;
  baselineOffset?: number;
  x: number;
  width: number;
  centerX: number;
  progress: number;
}

export interface TypewriterLayout {
  text: string;
  width: number;
  textHeight: number;
  letterSpacing: number;
  reveal: number;
  direction: 'forward' | 'reverse';
  textDirection: ResolvedTextDirection;
  units: readonly TypewriterUnitLayout[];
}

const NAMED_ANIMATION_CURVES: readonly NamedAnimationCurve[] = [
  'linear',
  'ease',
  'easeIn',
  'easeOut',
  'easeInOut',
  'bounce',
  'elastic',
  'cubic',
  'cubicIn',
  'cubicOut',
  'cubicInOut',
  'back',
  'backIn',
  'backOut',
  'backInOut',
  'hold',
];

const TYPEWRITER_UNIT_TRACK_TARGETS: readonly TypewriterUnitTrackTarget[] = [
  'unit.opacity',
  'unit.scale',
  'unit.offset',
  'unit.rotation',
  'unit.color',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

type TypewriterTimingMode = 'auto' | 'fixed';

function resolveTypewriterTimingMode(value: unknown): TypewriterTimingMode {
  return value === 'fixed' ? 'fixed' : 'auto';
}

function resolveTypewriterRevealTiming(
  rctx: ResolveContext,
  mode: TypewriterTimingMode,
  durationSeconds: number,
  delaySeconds: number,
): AdaptiveTiming {
  const wordDurationSeconds = rctx.wordDurationSeconds;
  if (
    mode !== 'auto' ||
    wordDurationSeconds === undefined ||
    !Number.isFinite(wordDurationSeconds) ||
    wordDurationSeconds < 0
  ) {
    return { durationSeconds, delaySeconds };
  }

  return resolveAdaptiveTiming(durationSeconds, delaySeconds, wordDurationSeconds);
}

type CursorImage = NonNullable<ReturnType<typeof loadedImageAsset>>;

interface CursorDimensions {
  width: number;
  height: number;
}

type TypewriterCursorShape = 'caret' | 'block' | 'square' | 'underscore' | 'glyph';

function resolveCursorSize(value: unknown, textHeight: number, preset: string): number {
  const authoredSize = finiteNumber(value, 0);
  const sizeScale = cursorPresetDefinition(preset)?.sizeScale ?? 1;
  return authoredSize > 0 ? authoredSize : Math.max(1, textHeight * sizeScale);
}

function cursorImageAspectRatio(image: CursorImage | undefined): number {
  if (!image) return 1 / 12;
  const width = Number((image as { width?: unknown }).width);
  const height = Number((image as { height?: unknown }).height);
  return width > 0 && height > 0 ? width / height : 1 / 12;
}

function cursorDimensions(size: number, shape: TypewriterCursorShape, image?: CursorImage): CursorDimensions {
  const height = Math.max(1, size);
  if (image) {
    return { width: Math.max(1, height * cursorImageAspectRatio(image)), height };
  }
  if (shape === 'underscore') {
    return { width: height, height: Math.max(1, height * 0.08) };
  }
  if (shape === 'glyph' || shape === 'block' || shape === 'square') {
    return { width: height, height };
  }
  return { width: Math.max(1, height / 12), height };
}

function cursorVerticalOffset(shape: TypewriterCursorShape, textHeight: number, cursorHeight: number): number {
  if (shape !== 'underscore') return 0;
  return Math.max(0, textHeight / 2 - cursorHeight / 2);
}

function configureCursorImageSmoothing(context: CanvasContext2D): void {
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
}

function scaledFontForCursor(font: string, textHeight: number, cursorSize: number): string {
  if (!(textHeight > 0) || !(cursorSize > 0)) return font;
  const match = font.match(/(\d+(?:\.\d+)?)px/);
  if (!match) return font;
  const fontSize = Number(match[1]);
  if (!(fontSize > 0)) return font;
  return font.replace(match[0], `${fontSize * (cursorSize / textHeight)}px`);
}

function drawTintedCursor(
  output: CanvasContext2D,
  image: CursorImage,
  bounds: PaintBounds,
  paint: Paint,
): void {
  if (!(bounds.width > 0) || !(bounds.height > 0)) return;
  // Keep thin SVG strokes visible when the target cursor is only a few pixels wide.
  const rasterScale = 4;
  const canvas = acquireCanvas(
    Math.max(1, Math.ceil(bounds.width * rasterScale)),
    Math.max(1, Math.ceil(bounds.height * rasterScale)),
  );
  try {
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    const localBounds: PaintBounds = {
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height,
    };
    context.drawImage(image, localBounds.x, localBounds.y, localBounds.width, localBounds.height);
    context.globalCompositeOperation = 'source-in';
    context.fillStyle = resolvePaint(context, paint, localBounds);
    context.fillRect(localBounds.x, localBounds.y, localBounds.width, localBounds.height);
    output.drawImage(canvas, bounds.x, bounds.y, bounds.width, bounds.height);
  } finally {
    releaseCanvas(canvas);
  }
}

function drawOriginalCursor(output: CanvasContext2D, image: CursorImage, bounds: PaintBounds): void {
  if (!(bounds.width > 0) || !(bounds.height > 0)) return;
  output.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height);
}

function isNamedAnimationCurve(value: string): value is NamedAnimationCurve {
  return NAMED_ANIMATION_CURVES.includes(value as NamedAnimationCurve);
}

function normalizeAnimationCurve(value: unknown): AnimationCurve | undefined {
  if (typeof value === 'string' && isNamedAnimationCurve(value)) return value;
  if (!isRecord(value) || value.type !== 'bezier') return undefined;
  const { x1, y1, x2, y2 } = value;
  if (![x1, y1, x2, y2].every((part) => typeof part === 'number' && Number.isFinite(part))) return undefined;
  return { type: 'bezier', x1: Number(x1), y1: Number(y1), x2: Number(x2), y2: Number(y2) };
}

function normalizeAnimationKeyframe(value: unknown): AnimationKeyframe | undefined {
  if (!isRecord(value)) return undefined;
  const time = finiteNumber(value.time, Number.NaN);
  if (!Number.isFinite(time)) return undefined;
  const curve = normalizeAnimationCurve(value.curve);
  return {
    time: Math.max(0, time),
    value: value.value,
    ...(curve ? { curve } : {}),
  };
}

function isTypewriterUnitTrackTarget(value: string): value is TypewriterUnitTrackTarget {
  return TYPEWRITER_UNIT_TRACK_TARGETS.includes(value as TypewriterUnitTrackTarget);
}

function normalizeUnitTrack(value: unknown): TypewriterUnitTrack | undefined {
  if (!isRecord(value) || typeof value.target !== 'string') return undefined;
  const target = value.target.startsWith('unit.') ? value.target : `unit.${value.target}`;
  if (!isTypewriterUnitTrackTarget(target)) return undefined;
  const keyframes = Array.isArray(value.keyframes)
    ? value.keyframes.map(normalizeAnimationKeyframe).filter((keyframe): keyframe is AnimationKeyframe => !!keyframe)
    : [];
  if (keyframes.length === 0) return undefined;
  const mode = value.mode === 'relative' ? 'relative' : 'absolute';
  const sampling =
    value.sampling === 'randomValues' || value.sampling === 'randomRange' ? value.sampling : 'interpolate';
  return {
    enabled: value.enabled !== false,
    target,
    keyframes,
    mode,
    sampling,
    ...(typeof value.updateEveryFrame === 'boolean' ? { updateEveryFrame: value.updateEveryFrame } : {}),
  };
}

function normalizedUnitTracks(value: unknown): TypewriterUnitTrack[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeUnitTrack).filter((track): track is TypewriterUnitTrack => !!track);
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function unitProperty(target: TypewriterUnitTrackTarget, color: Paint): Property<unknown> {
  switch (target) {
    case 'unit.opacity':
      return staticProperty('number', 1);
    case 'unit.scale':
      return staticProperty('vector2', { x: 1, y: 1 });
    case 'unit.offset':
      return staticProperty('vector2', { x: 0, y: 0 });
    case 'unit.rotation':
      return staticProperty('number', 0);
    case 'unit.color':
      return staticProperty('paint', color);
  }
}

function applyTrackValue(
  style: TypewriterUnitStyle,
  target: TypewriterUnitTrackTarget,
  value: unknown,
  mode: TypewriterUnitTrack['mode'],
): void {
  switch (target) {
    case 'unit.opacity': {
      const next = finiteNumber(value, style.opacity);
      style.opacity = mode === 'relative' ? style.opacity + next : next;
      return;
    }
    case 'unit.scale': {
      const next = toVec2(value);
      style.scale =
        mode === 'relative'
          ? { x: style.scale.x + next.x, y: style.scale.y + next.y }
          : next;
      return;
    }
    case 'unit.offset': {
      const next = toVec2(value);
      style.offset =
        mode === 'relative'
          ? { x: style.offset.x + next.x, y: style.offset.y + next.y }
          : next;
      return;
    }
    case 'unit.rotation': {
      const next = finiteNumber(value, style.rotation);
      style.rotation = mode === 'relative' ? style.rotation + next : next;
      return;
    }
    case 'unit.color':
      style.color = normalizePaint(value, style.color);
      return;
  }
}

function maxVectorValue(
  tracks: readonly TypewriterUnitTrack[],
  target: TypewriterUnitTrackTarget,
  fallback: Vector2,
): Vector2 {
  const maximum = { x: Math.abs(fallback.x), y: Math.abs(fallback.y) };
  for (const track of tracks) {
    if (track.target !== target) continue;
    for (const keyframe of track.keyframes) {
      const value = toVec2(keyframe.value);
      maximum.x = Math.max(maximum.x, Math.abs(value.x));
      maximum.y = Math.max(maximum.y, Math.abs(value.y));
    }
  }
  return maximum;
}

function maxRotatedHalfExtents(
  tracks: readonly TypewriterUnitTrack[],
  halfWidth: number,
  halfHeight: number,
): Vector2 {
  let maximum = { x: halfWidth, y: halfHeight };
  for (const track of tracks) {
    if (track.target !== 'unit.rotation') continue;
    for (const keyframe of track.keyframes) {
      const radians = (finiteNumber(keyframe.value, 0) * Math.PI) / 180;
      const rotated = {
        x: Math.abs(Math.cos(radians)) * halfWidth + Math.abs(Math.sin(radians)) * halfHeight,
        y: Math.abs(Math.sin(radians)) * halfWidth + Math.abs(Math.cos(radians)) * halfHeight,
      };
      maximum = {
        x: Math.max(maximum.x, rotated.x),
        y: Math.max(maximum.y, rotated.y),
      };
    }
  }
  return maximum;
}

export class TypewriterEffect extends Effect {
  readonly type = 'typewriter';

  override getMargins(ctx: ResolveContext, source?: EffectSource): Margins {
    const tracks = normalizedUnitTracks(this.getProp<unknown>('unitTracks')?.resolve(ctx));
    const sourceWidth = source?.bounds?.width ?? 0;
    const sourceHeight = source?.bounds?.height ?? 0;
    const scale = maxVectorValue(tracks, 'unit.scale', { x: 1, y: 1 });
    const offset = maxVectorValue(tracks, 'unit.offset', { x: 0, y: 0 });
    const scaledHalfWidth = (sourceWidth * scale.x) / 2;
    const scaledHalfHeight = (sourceHeight * scale.y) / 2;
    const rotatedHalfExtents = maxRotatedHalfExtents(tracks, scaledHalfWidth, scaledHalfHeight);
    const transformMargins = {
      x: offset.x + Math.max(0, rotatedHalfExtents.x - sourceWidth / 2),
      y: offset.y + Math.max(0, rotatedHalfExtents.y - sourceHeight / 2),
    };

    const cursorEnabled = this.getProp<boolean>('cursor.enabled')?.resolve(ctx) !== false;
    const cursorOffset = cursorEnabled
      ? toVec2(this.getProp<Vector2>('cursor.offset')?.resolve(ctx) ?? { x: 0, y: 0 })
      : { x: 0, y: 0 };
    const cursorPreset = cursorEnabled ? this.cursorPreset(ctx) : 'custom';
    const cursorShape = cursorEnabled ? this.cursorShape(ctx) : 'caret';
    const cursorSize = cursorEnabled
      ? resolveCursorSize(this.getProp<number>('cursor.size')?.resolve(ctx), sourceHeight, cursorPreset)
      : 0;
    const cursorAsset =
      cursorAssetForPreset(cursorPreset) ??
      (cursorShape === 'caret' || cursorShape === 'block' ? cursorShape : undefined);
    const cursorImage = cursorAsset ? loadedImageAsset(cursorAssetSource(cursorAsset)) : undefined;
    const dimensions = cursorDimensions(cursorSize, cursorShape, cursorImage);
    const cursorVerticalShift = cursorVerticalOffset(cursorShape, sourceHeight, dimensions.height);
    const cursorMargins = {
      x: Math.abs(cursorOffset.x) + dimensions.width,
      y: Math.abs(cursorOffset.y + cursorVerticalShift) + dimensions.height / 2,
    };
    return {
      x: transformMargins.x + cursorMargins.x,
      y: transformMargins.y + cursorMargins.y,
    };
  }

  buildLayout(
    ctx: CanvasContext2D,
    rctx: ResolveContext,
    text: string,
    fontPaint: Paint,
    letterSpacing = 0,
    resolveRunStyle?: (run: TextRun) => TextRunStyle,
  ): TypewriterLayout {
    const resolvedLetterSpacing = resolveLetterSpacing(letterSpacing);
    ctx.direction = rctx.textDirection;
    const segments = segmentTextGraphemes(text);
    const textRuns = resolveRunStyle ? segmentTextRuns(text) : [];
    const runStyles = resolveRunStyle
      ? textRuns.map((run) => {
          const style = resolveRunStyle(run);
          ctx.font = style.font;
          return { style, baselineOffset: measureTextWithLetterSpacing(ctx, run.text, 0).baselineOffset };
        })
      : [];
    const referenceBaselineOffset = runStyles.find((run, index) => !textRuns[index]?.isEmoji)?.baselineOffset;
    const unitStyles = resolveRunStyle
      ? textRuns.flatMap((run, runIndex) => {
          const runStyle = runStyles[runIndex];
          if (!runStyle) return [];
          return segmentTextGraphemes(run.text).map(() => {
            const opticalOffset =
              run.isEmoji && runStyle.style.alignment === 'optical' && referenceBaselineOffset !== undefined
                ? runStyle.baselineOffset - referenceBaselineOffset
                : 0;
            return { style: runStyle.style, baselineOffset: runStyle.style.baselineOffset + opticalOffset };
          });
        })
      : [];
    const measuredSegments = segments.map((unitText, styleIndex) => {
      const style = unitStyles[styleIndex]?.style;
      if (style) ctx.font = style.font;
      const metrics = measureTextWithLetterSpacing(ctx, unitText, resolvedLetterSpacing);
      return {
        unitText,
        style,
        baselineOffset: unitStyles[styleIndex]?.baselineOffset ?? 0,
        metrics,
      };
    });
    const segmentOffsets = measuredSegments.map((segment) => segment.baselineOffset);
    const width =
      measuredSegments.reduce((total, segment) => total + segment.metrics.width, 0) +
      resolvedLetterSpacing * Math.max(0, segments.length - 1);
    const textAscent = Math.max(
      0,
      ...measuredSegments.map((segment, index) => Math.max(0, segment.metrics.ascent - segmentOffsets[index])),
    );
    const textDescent = Math.max(
      0,
      ...measuredSegments.map((segment, index) => Math.max(0, segment.metrics.descent + segmentOffsets[index])),
    );
    const textHeight = textAscent + textDescent;
    const direction = this.direction(rctx);
    const textDirection = rctx.textDirection;
    const reveal = this.reveal(rctx);
    const position = reveal * segments.length;
    const tracks = normalizedUnitTracks(this.getProp<unknown>('unitTracks')?.resolve(rctx));
    let prefixWidth = 0;
    const units: TypewriterUnitLayout[] = [];
    const order = direction === 'forward'
      ? Array.from({ length: segments.length }, (_, index) => index)
      : Array.from({ length: segments.length }, (_, index) => segments.length - index - 1);

    for (const [index, segment] of measuredSegments.entries()) {
      const { unitText, style: fontStyle, metrics } = segment;
      const unitWidth = metrics.width;
      const progressIndex = order.indexOf(index);
      const progress = clamp01(position - progressIndex);
      const unitStyle = this.styleForUnit(
        tracks,
        progress,
        fontPaint,
        rctx,
        index,
      );
      units.push({
        index,
        text: unitText,
        x:
          textDirection === 'rtl'
            ? width / 2 - prefixWidth - unitWidth
            : -width / 2 + prefixWidth,
        width: unitWidth,
        centerX:
          textDirection === 'rtl'
            ? width / 2 - prefixWidth - unitWidth / 2
            : -width / 2 + prefixWidth + unitWidth / 2,
        progress,
        ...(fontStyle
          ? {
              font: fontStyle.font,
              baselineOffset: segmentOffsets[index],
            }
          : {}),
        ...unitStyle,
      });
      prefixWidth += unitWidth + (index < segments.length - 1 ? resolvedLetterSpacing : 0);
    }

    return { text, width, textHeight, letterSpacing: resolvedLetterSpacing, reveal, direction, textDirection, units };
  }

  renderUnits(
    ctx: CanvasContext2D,
    layout: TypewriterLayout,
    renderUnit: (ctx: CanvasContext2D, unit: TypewriterUnitLayout) => void,
  ): void {
    for (const unit of layout.units) {
      if (unit.progress <= 0 || unit.opacity <= 0 || unit.scale.x === 0 || unit.scale.y === 0) continue;
      renderUnit(ctx, unit);
    }
  }

  paintCursor(
    ctx: CanvasContext2D,
    rctx: ResolveContext,
    layout: TypewriterLayout,
    fontPaint: Paint,
    paintBounds: PaintBounds,
  ): void {
    if (!this.isCursorVisible(rctx, layout)) return;
    const anchor = this.cursorAnchor(layout);
    if (!anchor) return;

    const shape = this.cursorShape(rctx);
    const preset = this.cursorPreset(rctx);
    const cursorSize = resolveCursorSize(this.getProp<number>('cursor.size')?.resolve(rctx), layout.textHeight, preset);
    const cursorOffset = toVec2(this.getProp<Vector2>('cursor.offset')?.resolve(rctx) ?? { x: 0, y: 0 });
    const opacity = clamp01(finiteNumber(this.getProp<number>('cursor.opacity')?.resolve(rctx), 1));
    const colorMode = normalizeCursorColorMode(this.getProp<string>('cursor.colorMode')?.resolve(rctx));
    const color =
      colorMode === 'tint'
        ? this.getProp<Paint>('cursor.color')?.resolve(rctx) ?? fontPaint
        : fontPaint;
    const asset =
      cursorAssetForPreset(preset) ??
      (shape === 'caret' || shape === 'block' ? shape : undefined);
    const image = asset ? loadedImageAsset(cursorAssetSource(asset)) : undefined;
    const { width: cursorWidth, height: cursorHeight } = cursorDimensions(cursorSize, shape, image);
    const cursorVerticalShift = cursorVerticalOffset(shape, layout.textHeight, cursorHeight);
    const x = anchor.x + cursorOffset.x;
    const y = anchor.y + cursorOffset.y + cursorVerticalShift;
    const extendsRight = cursorExtendsRight(layout);

    ctx.save();
    ctx.globalAlpha *= opacity;
    configureCursorImageSmoothing(ctx);
    if (image) {
      const left = extendsRight ? x : x - cursorWidth;
      const bounds = {
        x: left,
        y: y - cursorHeight / 2,
        width: cursorWidth,
        height: cursorHeight,
      };
      if (colorMode === 'tint') drawTintedCursor(ctx, image, bounds, color);
      else drawOriginalCursor(ctx, image, bounds);
      ctx.restore();
      return;
    }

    ctx.fillStyle = resolvePaint(ctx, color, {
      x: x - cursorWidth / 2,
      y: y - cursorHeight / 2,
      width: Math.max(cursorWidth, 1),
      height: Math.max(cursorHeight, 1),
    });
    if (shape === 'glyph') {
      const glyph = String(this.getProp<string>('cursor.glyph')?.resolve(rctx) ?? '|');
      ctx.font = scaledFontForCursor(ctx.font, layout.textHeight, cursorSize);
      ctx.textAlign = extendsRight ? 'left' : 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(glyph, x, y);
    } else {
      const left = extendsRight ? x : x - cursorWidth;
      const top = shape === 'underscore' ? y + cursorHeight / 2 - cursorHeight : y - cursorHeight / 2;
      const width = cursorWidth;
      const height = cursorHeight;
      if (shape === 'underscore' && typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(left, top, width, height, height / 2);
        ctx.fill();
      } else {
        ctx.fillRect(left, top, width, height);
      }
    }
    ctx.restore();
  }

  private styleForUnit(
    tracks: readonly TypewriterUnitTrack[],
    progress: number,
    fontPaint: Paint,
    rctx: ResolveContext,
    unitIndex: number,
  ): TypewriterUnitStyle {
    const style: TypewriterUnitStyle = {
      opacity: 1,
      scale: { x: 1, y: 1 },
      offset: { x: 0, y: 0 },
      rotation: 0,
      color: fontPaint,
    };
    const duration = Math.max(0, finiteNumber(this.getProp<number>('unitDurationSeconds')?.resolve(rctx), 0.18));
    for (const track of tracks) {
      if (!track.enabled) continue;
      const property = unitProperty(track.target, fontPaint);
      const value = sampleTrack(track, property, {
        elapsedSeconds: progress * duration,
        durationSeconds: duration,
        frameIndex: rctx.frameIndex,
        seed: hashString(track.target) + unitIndex * 31,
      });
      applyTrackValue(style, track.target, value, track.mode ?? 'absolute');
    }
    style.opacity = clamp01(style.opacity);
    return style;
  }

  private reveal(rctx: ResolveContext): number {
    const mode = this.getProp<string>('revealMode')?.resolve(rctx) === 'manual' ? 'manual' : 'lifecycle';
    const revealProperty = this.getProp<number>('reveal');
    const hasExplicitRevealDriver =
      revealProperty !== undefined &&
      (rctx.animationOverrides?.has(revealProperty) ||
        rctx.transitionOverrides?.has(revealProperty) ||
        revealProperty.hasResolvedValue);
    if (mode === 'manual' || hasExplicitRevealDriver) {
      return clamp01(finiteNumber(revealProperty?.resolve(rctx), 1));
    }
    if (rctx.lifecycle !== 'incoming') return 1;
    const durationSeconds = Math.max(0, finiteNumber(this.getProp<number>('durationSeconds')?.resolve(rctx), 0.8));
    const delaySeconds = Math.max(0, finiteNumber(this.getProp<number>('delaySeconds')?.resolve(rctx), 0));
    const timing = resolveTypewriterRevealTiming(
      rctx,
      resolveTypewriterTimingMode(this.getProp<string>('durationMode')?.resolve(rctx)),
      durationSeconds,
      delaySeconds,
    );
    if (timing.durationSeconds === 0) return rctx.elapsedSeconds >= timing.delaySeconds ? 1 : 0;
    return clamp01((rctx.elapsedSeconds - timing.delaySeconds) / timing.durationSeconds);
  }

  private direction(rctx: ResolveContext): 'forward' | 'reverse' {
    return this.getProp<string>('direction')?.resolve(rctx) === 'reverse' ? 'reverse' : 'forward';
  }

  private cursorShape(rctx: ResolveContext): TypewriterCursorShape {
    const preset = this.cursorPreset(rctx);
    if (preset !== 'custom') return cursorPresetDefinition(preset)?.shape ?? 'caret';
    return 'glyph';
  }

  private cursorPreset(rctx: ResolveContext) {
    return normalizeCursorPreset(this.getProp<string>('cursor.preset')?.resolve(rctx));
  }

  private isCursorVisible(rctx: ResolveContext, layout: TypewriterLayout): boolean {
    if (this.getProp<boolean>('cursor.enabled')?.resolve(rctx) === false) return false;
    const isComplete = layout.reveal >= 1;
    const isAtStart = layout.reveal <= 0;
    if (isComplete && this.getProp<boolean>('cursor.showWhenComplete')?.resolve(rctx) !== true) return false;
    if (isAtStart && this.getProp<boolean>('cursor.showOnStart')?.resolve(rctx) !== true) return false;
    if (!isComplete && !isAtStart && this.getProp<boolean>('cursor.showDuringReveal')?.resolve(rctx) === false) return false;

    if (this.getProp<boolean>('cursor.blink.enabled')?.resolve(rctx) === false) return true;
    const rate = Math.max(0, finiteNumber(this.getProp<number>('cursor.blink.rate')?.resolve(rctx), 2));
    if (rate === 0) return true;
    const dutyCycle = clamp01(finiteNumber(this.getProp<number>('cursor.blink.dutyCycle')?.resolve(rctx), 0.5));
    const phase = finiteNumber(this.getProp<number>('cursor.blink.phaseOffset')?.resolve(rctx), 0);
    const cycle = ((rctx.elapsedSeconds + phase) * rate) % 1;
    return cycle < dutyCycle;
  }

  private cursorAnchor(layout: TypewriterLayout): { x: number; y: number } | undefined {
    if (layout.units.length === 0) return undefined;
    const order = layout.direction === 'forward'
      ? Array.from({ length: layout.units.length }, (_, index) => index)
      : Array.from({ length: layout.units.length }, (_, index) => layout.units.length - index - 1);
    const progressIndex =
      layout.reveal >= 1
        ? layout.direction === 'forward'
          ? order.length - 1
          : order.length - 1
        : Math.min(order.length - 1, Math.max(0, Math.ceil(layout.reveal * order.length) - 1));
    const unit = layout.units[order[progressIndex]];
    if (!unit) return undefined;
    const scaledHalfWidth = Math.abs(unit.scale.x) * unit.width / 2;
    const spacingAfterUnit =
      unit.progress >= 1 && layout.reveal > 0 && layout.reveal < 1 ? layout.letterSpacing : 0;
    const extendsRight = cursorExtendsRight(layout);
    const cursorAtRight = layout.reveal <= 0 ? !extendsRight : extendsRight;
    return {
      x:
        cursorAtRight
          ? unit.centerX + scaledHalfWidth + unit.offset.x + spacingAfterUnit
          : unit.centerX - scaledHalfWidth + unit.offset.x - spacingAfterUnit,
      y: unit.offset.y,
    };
  }
}

function cursorExtendsRight(layout: Pick<TypewriterLayout, 'direction' | 'textDirection'>): boolean {
  return layout.textDirection === 'ltr'
    ? layout.direction === 'forward'
    : layout.direction === 'reverse';
}
