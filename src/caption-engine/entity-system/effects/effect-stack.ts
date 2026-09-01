import { Canvas } from '#platform/canvas.js';
import type { Effect, EffectApplyOptions } from './effect';
import { BorderEffect } from './border';
import { SignalEffect } from './signal-effect';
import { GlowEffect } from './glow';
import { ReplicatorEffect, type ReplicatorSource } from './replicator';
import { ShadowEffect } from './shadow';
import { StrokeEffect } from './stroke';
import { WipeRevealEffect } from './wipe-reveal';
import { orderEffectsForApplication } from './effects-order';
import {
  compositionScaleOf,
  type Box,
  type CanvasContext2D,
  type ResolveContext,
} from '../types';
import { NoiseEffect } from './noise';
import {
  BlendModeEffect,
  canvasCompositeOperationFor,
  type BlendMode,
} from './blend-mode';
import { createCanvasPoolScope, type CanvasPoolScope } from '../../../utilities/canvas-pool';

export interface RenderEffectOptions extends EffectApplyOptions {
  baseTransform?: ReturnType<CanvasContext2D['getTransform']>;
  source?: ReplicatorSource;
  baseInput?: Canvas;
}

export type RenderEffectLayer = (
  effect: Effect,
  output: CanvasContext2D,
  input: Canvas,
  rctx: ResolveContext,
  baseTransform: ReturnType<CanvasContext2D['getTransform']>,
  base: Canvas,
  alternateBase?: Canvas,
) => void;

export interface RenderEffectStackOptions {
  renderAlternateBase?: (output: CanvasContext2D, rctx: ResolveContext) => void;
  renderBaseContent?: (output: CanvasContext2D) => void;
  renderEffectBase?: (output: CanvasContext2D) => void;
  paintBounds?: Box;
  wipePaintBounds?: Box;
}

function wipePaintBounds(
  bounds: Box | undefined,
  effects: readonly Effect[],
  rctx: ResolveContext,
): Box | undefined {
  if (!bounds) return undefined;
  const source = { bounds: { width: bounds.width, height: bounds.height } };
  let marginX = 0;
  let marginY = 0;
  for (const effect of effects) {
    const margins = effect.getMargins(rctx, source);
    marginX += Math.max(0, margins.x);
    marginY += Math.max(0, margins.y);
  }
  if (marginX > 0 || marginY > 0) {
    const rasterPadding = 2 / compositionScaleOf(rctx);
    marginX += rasterPadding;
    marginY += rasterPadding;
  }
  return {
    x: bounds.x - marginX,
    y: bounds.y - marginY,
    width: bounds.width + marginX * 2,
    height: bounds.height + marginY * 2,
  };
}

function createBaseLayer(
  ctx: CanvasContext2D,
  renderBase: (output: CanvasContext2D) => void,
  canvasScope: CanvasPoolScope,
): { canvas: Canvas; transform: ReturnType<CanvasContext2D['getTransform']> } {
  const transform = ctx.getTransform();
  const canvas = canvasScope.acquire(ctx.canvas.width, ctx.canvas.height);
  const output = canvas.getContext('2d');
  output.setTransform(transform);
  renderBase(output);
  return { canvas, transform };
}

function compositeLayer(
  ctx: CanvasContext2D,
  layer: Canvas,
  blendMode: BlendMode = 'normal',
): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = canvasCompositeOperationFor(blendMode);
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}

function compositeLayers(
  ctx: CanvasContext2D,
  layer: Canvas,
  blendModes: readonly BlendMode[],
): void {
  if (blendModes.length === 0) {
    compositeLayer(ctx, layer);
    return;
  }
  for (const blendMode of blendModes) {
    compositeLayer(ctx, layer, blendMode);
  }
}

function replaceLayer(ctx: CanvasContext2D, layer: Canvas): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}

function renderPreviousEffectLayer(
  ctx: CanvasContext2D,
  rctx: ResolveContext,
  effects: readonly Effect[],
  effectIndex: number,
  renderBase: (output: CanvasContext2D) => void,
  renderEffect: RenderEffectLayer,
  options: RenderEffectStackOptions,
  canvasScope: CanvasPoolScope,
): Canvas {
  const sourceCanvas = canvasScope.acquire(ctx.canvas.width, ctx.canvas.height);
  const sourceContext = sourceCanvas.getContext('2d');
  sourceContext.setTransform(ctx.getTransform());
  const previousEffects = effects.slice(0, effectIndex);
  renderEffectStack(
    sourceContext,
    rctx,
    previousEffects,
    renderBase,
    renderEffect,
    options,
  );
  return sourceCanvas;
}

function createWipeMaskLayer(
  ctx: CanvasContext2D,
  rctx: ResolveContext,
  wipeReveal: WipeRevealEffect,
  transform: ReturnType<CanvasContext2D['getTransform']>,
  canvasScope: CanvasPoolScope,
  paintBounds?: Box,
): Canvas {
  const maskCanvas = canvasScope.acquire(ctx.canvas.width, ctx.canvas.height);
  const maskContext = maskCanvas.getContext('2d');
  wipeReveal.apply(
    maskContext,
    rctx,
    () => {
      maskContext.fillStyle = 'rgba(0,0,0,1)';
      maskContext.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
    },
    {
      baseTransform: transform,
      ...(paintBounds ? { paintBounds } : {}),
    },
  );
  return maskCanvas;
}

function eraseWipeMask(layer: Canvas, mask: Canvas): void {
  const context = layer.getContext('2d');
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalCompositeOperation = 'destination-out';
  context.drawImage(mask, 0, 0);
  context.restore();
}

function isEffectActive(
  effect: Effect,
  effects: readonly Effect[],
  rctx: ResolveContext,
  visited = new Set<string>(),
): boolean {
  if (!effect.isEnabled(rctx)) return false;
  if (!effect.dependencyOf) return true;
  if (visited.has(effect.id ?? effect.type)) return false;
  visited.add(effect.id ?? effect.type);
  const parent = effects.find(
    (candidate) => candidate.id === effect.dependencyOf,
  );
  return parent ? isEffectActive(parent, effects, rctx, visited) : false;
}

function activeEffectsFor(
  effects: readonly Effect[],
  rctx: ResolveContext,
): Effect[] {
  return effects.filter((effect) => isEffectActive(effect, effects, rctx));
}

function blendModesForFinal(
  effects: readonly Effect[],
  rctx: ResolveContext,
): BlendMode[] {
  return activeEffectsFor(effects, rctx)
    .filter(
      (effect): effect is BlendModeEffect =>
        isStandaloneBlendMode(effect) &&
        effect.getAppliesOn(rctx) === 'base',
    )
    .map((effect) => effect.getMode(rctx));
}

function dependentBlendModeForEffect(
  effect: Effect,
  effects: readonly Effect[],
  rctx: ResolveContext,
): BlendMode | undefined {
  if (!effect.id) return undefined;
  const blendModeEffect = effects.find(
    (candidate): candidate is BlendModeEffect =>
      candidate instanceof BlendModeEffect &&
      candidate.dependencyOf === effect.id &&
      isEffectActive(candidate, effects, rctx),
  );
  return blendModeEffect?.getMode(rctx);
}

function isStandaloneBlendMode(effect: Effect): effect is BlendModeEffect {
  return effect instanceof BlendModeEffect && !effect.dependencyOf;
}

function blendModesForEffect(
  effect: Effect,
  effectIndex: number,
  activeEffects: readonly Effect[],
  effects: readonly Effect[],
  rctx: ResolveContext,
): BlendMode[] {
  const dependentBlendMode = dependentBlendModeForEffect(effect, effects, rctx);
  if (dependentBlendMode) return [dependentBlendMode];
  const modes: BlendMode[] = [];
  for (let index = effectIndex + 1; index < activeEffects.length; index += 1) {
    const candidate = activeEffects[index];
    if (!isStandaloneBlendMode(candidate)) break;
    if (candidate.getAppliesOn(rctx) === 'previousEffect') {
      modes.push(candidate.getMode(rctx));
    }
  }
  return modes;
}

function compositeEffectLayer(
  ctx: CanvasContext2D,
  layer: Canvas,
  effect: Effect,
  blendModes: readonly BlendMode[],
  rctx: ResolveContext,
  deferStandalone = true,
): void {
  if (shouldReplaceLayer(effect)) replaceLayer(ctx, layer);
  else if (deferStandalone && blendModes.length > 0 && rctx.blendModeLayerCollector) {
    for (const blendMode of blendModes) {
      rctx.blendModeLayerCollector(blendMode, layer);
    }
  }
  else compositeLayers(ctx, layer, blendModes);
}

function blendBaseLayer(
  base: Canvas,
  layer: Canvas,
  blendMode: BlendMode,
  canvasScope: CanvasPoolScope,
): Canvas {
  if (blendMode === 'normal') return layer;
  const blended = canvasScope.acquire(base.width, base.height);
  const blendedContext = blended.getContext('2d');
  compositeLayer(blendedContext, base);
  compositeLayer(blendedContext, layer, blendMode);
  return blended;
}

function suppressesOriginalLayer(
  effects: readonly Effect[],
  activeEffects: readonly Effect[],
  rctx: ResolveContext,
): boolean {
  if (
    activeEffects.some((effect, index) => {
      if (effect instanceof BlendModeEffect) return false;
      return blendModesForEffect(
        effect,
        index,
        activeEffects,
        effects,
        rctx,
      ).some((blendMode) => blendMode !== 'normal');
    })
  ) {
    return false;
  }
  return activeEffects.some((effect) => suppressesOriginal(effect, rctx));
}

/**
 * Renders each effect into its own full-frame layer. Base effects read the
 * original layer. Most non-Replicator effects read the layer immediately before
 * them. Noise targeting `previousEffect` rebuilds the complete preceding stack
 * so it can modify the full visible result without losing earlier effects.
 * Noise targeting `base` is kept as a base-layer replacement.
 * Dependent Blend Mode effects composite their parent effect layer, while a
 * standalone Blend Mode effect composites the complete isolated result.
 */
export function renderEffectStack(
  ctx: CanvasContext2D,
  rctx: ResolveContext,
  effects: readonly Effect[],
  renderBase: (output: CanvasContext2D) => void,
  renderEffect: RenderEffectLayer,
  options: RenderEffectStackOptions = {},
): void {
  const canvasScope = createCanvasPoolScope();
  const isolatedCanvas = canvasScope.acquire(ctx.canvas.width, ctx.canvas.height);
  try {
    const isolatedContext = isolatedCanvas.getContext('2d');
    isolatedContext.setTransform(ctx.getTransform());
    renderEffectStackContents(
      isolatedContext,
      rctx,
      effects,
      renderBase,
      renderEffect,
      options,
    );
    const finalBlendModes = blendModesForFinal(effects, rctx);
    if (finalBlendModes.length > 0 && rctx.blendModeLayerCollector) {
      for (const blendMode of finalBlendModes) {
        rctx.blendModeLayerCollector(blendMode, isolatedCanvas);
      }
    } else {
      compositeLayers(ctx, isolatedCanvas, finalBlendModes);
    }
  } finally {
    canvasScope.releaseAll();
  }
}

function renderEffectStackContents(
  ctx: CanvasContext2D,
  rctx: ResolveContext,
  effects: readonly Effect[],
  renderBase: (output: CanvasContext2D) => void,
  renderEffect: RenderEffectLayer,
  options: RenderEffectStackOptions = {},
): void {
  const activeEffects = activeEffectsFor(effects, rctx);
  const wipeReveal = activeEffects.find(
    (effect): effect is WipeRevealEffect => effect instanceof WipeRevealEffect,
  );
  if (wipeReveal) {
    renderWipeRevealStack(
      ctx,
      rctx,
      activeEffects,
      wipeReveal,
      renderBase,
      renderEffect,
      options,
    );
    return;
  }
  const canvasScope = createCanvasPoolScope();
  try {
    const { canvas: base, transform } = createBaseLayer(ctx, renderBase, canvasScope);
    const effectBase = options.renderEffectBase
      ? createBaseLayer(ctx, options.renderEffectBase, canvasScope).canvas
      : base;
    const baseInput =
      options.renderBaseContent &&
      activeEffects.some((effect) => effect instanceof ReplicatorEffect)
        ? createBaseLayer(ctx, options.renderBaseContent, canvasScope).canvas
        : effectBase;
    const baseNoiseEffects = activeEffects.filter((effect) =>
      isBaseNoiseEffect(effect, rctx),
    );
    let effectiveBase = effectBase;
    for (const effect of baseNoiseEffects) {
      const outputCanvas = canvasScope.acquire(ctx.canvas.width, ctx.canvas.height);
      const output = outputCanvas.getContext('2d');
      renderEffect(effect, output, effectiveBase, rctx, transform, baseInput);
      effectiveBase = blendBaseLayer(
        effectiveBase,
        outputCanvas,
        dependentBlendModeForEffect(effect, effects, rctx) ?? 'normal',
        canvasScope,
      );
    }
    const suppressOriginal = suppressesOriginalLayer(effects, activeEffects, rctx);
    if (!suppressOriginal) compositeLayer(ctx, effectiveBase);

    let previous = effectiveBase;
    for (let index = 0; index < activeEffects.length; index += 1) {
      const effect = activeEffects[index];
      if (effect instanceof BlendModeEffect) continue;
      if (isBaseNoiseEffect(effect, rctx)) continue;
      let effectInput: Canvas;
      if (
        (effect instanceof ReplicatorEffect &&
          effect.getAppliesOn(rctx) === 'previousEffect') ||
        (effect instanceof NoiseEffect && index > 0)
      ) {
        effectInput = renderPreviousEffectLayer(
          ctx,
          rctx,
          activeEffects,
          index,
          renderBase,
          renderEffect,
          options,
          canvasScope,
        );
      } else {
        effectInput =
          index > 0 && effect.getAppliesOn(rctx) === 'previousEffect'
            ? previous
            : effectiveBase;
      }
      const outputCanvas = canvasScope.acquire(ctx.canvas.width, ctx.canvas.height);
      const output = outputCanvas.getContext('2d');
      renderEffect(effect, output, effectInput, rctx, transform, baseInput);
      compositeEffectLayer(
        ctx,
        outputCanvas,
        effect,
        blendModesForEffect(effect, index, activeEffects, effects, rctx),
        rctx,
        dependentBlendModeForEffect(effect, effects, rctx) === undefined,
      );
      previous = outputCanvas;
    }
  } finally {
    canvasScope.releaseAll();
  }
}

function renderWipeRevealStack(
  ctx: CanvasContext2D,
  rctx: ResolveContext,
  activeEffects: readonly Effect[],
  wipeReveal: WipeRevealEffect,
  renderBase: (output: CanvasContext2D) => void,
  renderEffect: RenderEffectLayer,
  options: RenderEffectStackOptions,
): void {
  const canvasScope = createCanvasPoolScope();
  try {
    const { canvas: base, transform } = createBaseLayer(ctx, renderBase, canvasScope);
    const effectBase = options.renderEffectBase
      ? createBaseLayer(ctx, options.renderEffectBase, canvasScope).canvas
      : base;
    const alternateBase = options.renderAlternateBase
      ? createBaseLayer(
          ctx,
          (output) => options.renderAlternateBase?.(output, rctx),
          canvasScope,
        ).canvas
      : undefined;
    const otherEffects = activeEffects.filter(
      (effect) =>
        effect !== wipeReveal &&
        !(
          isStandaloneBlendMode(effect) &&
          effect.getAppliesOn(rctx) === 'base'
        ),
    );
    const wipeBounds =
      options.wipePaintBounds ??
      wipePaintBounds(options.paintBounds, otherEffects, rctx);
    const targetCanvas = canvasScope.acquire(ctx.canvas.width, ctx.canvas.height);
    const targetContext = targetCanvas.getContext('2d');
    targetContext.setTransform(transform);
    if (otherEffects.length > 0) {
      renderEffectStack(
        targetContext,
        rctx,
        otherEffects,
        renderBase,
        renderEffect,
        {
          ...(options.renderBaseContent
            ? { renderBaseContent: options.renderBaseContent }
            : {}),
          ...(options.renderEffectBase
            ? { renderEffectBase: options.renderEffectBase }
            : {}),
        },
      );
    } else {
      compositeLayer(targetContext, effectBase);
    }

    const sourceBase = alternateBase;
    if (wipeReveal.basePlacement(rctx) === 'back' && sourceBase) {
      const wipeMask = createWipeMaskLayer(
        ctx,
        rctx,
        wipeReveal,
        transform,
        canvasScope,
        wipeBounds,
      );
      eraseWipeMask(sourceBase, wipeMask);
      compositeLayer(ctx, sourceBase);
    }

    const maskedCanvas = canvasScope.acquire(ctx.canvas.width, ctx.canvas.height);
    const maskedContext = maskedCanvas.getContext('2d');
    wipeReveal.apply(
      maskedContext,
      rctx,
      () => maskedContext.drawImage(targetCanvas, 0, 0),
      {
        baseTransform: transform,
        ...(wipeBounds ? { paintBounds: wipeBounds } : {}),
      },
    );
    compositeLayer(ctx, maskedCanvas);
    if (wipeReveal.basePlacement(rctx) === 'front' && sourceBase) {
      compositeLayer(ctx, sourceBase);
    }
  } finally {
    canvasScope.releaseAll();
  }
}

/** Applies a normal wrapper effect to an input layer. */
export function renderWrappedEffect(
  effect: Effect,
  output: CanvasContext2D,
  input: Canvas,
  rctx: ResolveContext,
  options: RenderEffectOptions = {},
): void {
  if (effect instanceof ReplicatorEffect) {
    effect.renderCopies(
      output,
      input,
      rctx,
      options.baseTransform,
      options.source,
      options.baseInput,
    );
    return;
  }
  if (effect instanceof BorderEffect) {
    effect.strokeImage(
      output,
      input,
      rctx,
      options.paintBounds,
      options.baseTransform,
    );
    return;
  }
  if (effect instanceof ShadowEffect) {
    effect.castImage(
      output,
      input,
      rctx,
      undefined,
      options.paintBounds,
      options.baseTransform,
    );
    return;
  }
  if (effect instanceof StrokeEffect) {
    effect.strokeImage(
      output,
      input,
      rctx,
      undefined,
      options.paintBounds,
      options.baseTransform,
    );
    return;
  }
  if (effect instanceof WipeRevealEffect) {
    effect.apply(output, rctx, () => output.drawImage(input, 0, 0), options);
    return;
  }
  effect.apply(
    output,
    rctx,
    () => output.drawImage(input, 0, 0),
    effect instanceof GlowEffect || effect instanceof SignalEffect
      ? { ...options, sourceCanvas: input }
      : options,
  );
}

function renderLayeredPreviousEffectLayer(
  ctx: CanvasContext2D,
  rctx: ResolveContext,
  effects: readonly Effect[],
  effectIndex: number,
  isUnderlay: (effect: Effect) => boolean,
  renderBase: (output: CanvasContext2D) => void,
  renderEffect: RenderEffectLayer,
  options: RenderEffectStackOptions,
  canvasScope: CanvasPoolScope,
): Canvas {
  const sourceCanvas = canvasScope.acquire(ctx.canvas.width, ctx.canvas.height);
  const sourceContext = sourceCanvas.getContext('2d');
  sourceContext.setTransform(ctx.getTransform());
  renderLayeredEffectStack(
    sourceContext,
    rctx,
    effects.slice(0, effectIndex),
    isUnderlay,
    renderBase,
    renderEffect,
    options,
  );
  return sourceCanvas;
}

function renderLayeredWipeRevealStack(
  ctx: CanvasContext2D,
  rctx: ResolveContext,
  activeEffects: readonly Effect[],
  wipeReveal: WipeRevealEffect,
  isUnderlay: (effect: Effect) => boolean,
  renderBase: (output: CanvasContext2D) => void,
  renderEffect: RenderEffectLayer,
  options: RenderEffectStackOptions,
): void {
  const canvasScope = createCanvasPoolScope();
  try {
    const { canvas: base, transform } = createBaseLayer(ctx, renderBase, canvasScope);
    const effectBase = options.renderEffectBase
      ? createBaseLayer(ctx, options.renderEffectBase, canvasScope).canvas
      : base;
    const otherEffects = activeEffects.filter(
      (effect) =>
        effect !== wipeReveal &&
        !(
          isStandaloneBlendMode(effect) &&
          effect.getAppliesOn(rctx) === 'base'
        ),
    );
    const targetCanvas = canvasScope.acquire(ctx.canvas.width, ctx.canvas.height);
    const targetContext = targetCanvas.getContext('2d');
    targetContext.setTransform(transform);
    if (otherEffects.length > 0) {
      renderLayeredEffectStack(
        targetContext,
        rctx,
        otherEffects,
        isUnderlay,
        renderBase,
        renderEffect,
        options,
      );
    } else {
      compositeLayer(targetContext, effectBase);
    }

    const wipeBounds =
      options.wipePaintBounds ??
      wipePaintBounds(options.paintBounds, otherEffects, rctx);
    const maskedCanvas = canvasScope.acquire(ctx.canvas.width, ctx.canvas.height);
    const maskedContext = maskedCanvas.getContext('2d');
    wipeReveal.apply(
      maskedContext,
      rctx,
      () => maskedContext.drawImage(targetCanvas, 0, 0),
      {
        baseTransform: transform,
        ...(wipeBounds ? { paintBounds: wipeBounds } : {}),
      },
    );
    compositeLayer(ctx, maskedCanvas);
  } finally {
    canvasScope.releaseAll();
  }
}

/**
 * Like `renderEffectStack`, but effects classified as "underlay" (an outside
 * text outline or shadow) are composited before the base, while every other
 * effect (including inside and centered strokes) is composited after it, on
 * top. List order and "previous"-effect input resolution are unaffected. Only
 * the final base-relative z-order changes per bucket.
 */
export function renderLayeredEffectStack(
  ctx: CanvasContext2D,
  rctx: ResolveContext,
  effects: readonly Effect[],
  isUnderlay: (effect: Effect) => boolean,
  renderBase: (output: CanvasContext2D) => void,
  renderEffect: RenderEffectLayer,
  options: RenderEffectStackOptions = {},
): void {
  const canvasScope = createCanvasPoolScope();
  const isolatedCanvas = canvasScope.acquire(ctx.canvas.width, ctx.canvas.height);
  try {
    const isolatedContext = isolatedCanvas.getContext('2d');
    isolatedContext.setTransform(ctx.getTransform());
    renderLayeredEffectStackContents(
      isolatedContext,
      rctx,
      effects,
      isUnderlay,
      renderBase,
      renderEffect,
      options,
    );
    const finalBlendModes = blendModesForFinal(effects, rctx);
    if (finalBlendModes.length > 0 && rctx.blendModeLayerCollector) {
      for (const blendMode of finalBlendModes) {
        rctx.blendModeLayerCollector(blendMode, isolatedCanvas);
      }
    } else {
      compositeLayers(ctx, isolatedCanvas, finalBlendModes);
    }
  } finally {
    canvasScope.releaseAll();
  }
}

function renderLayeredEffectStackContents(
  ctx: CanvasContext2D,
  rctx: ResolveContext,
  effects: readonly Effect[],
  isUnderlay: (effect: Effect) => boolean,
  renderBase: (output: CanvasContext2D) => void,
  renderEffect: RenderEffectLayer,
  options: RenderEffectStackOptions = {},
): void {
  const activeEffects = activeEffectsFor(effects, rctx);
  const wipeReveal = activeEffects.find(
    (effect): effect is WipeRevealEffect => effect instanceof WipeRevealEffect,
  );
  if (wipeReveal) {
    renderLayeredWipeRevealStack(
      ctx,
      rctx,
      activeEffects,
      wipeReveal,
      isUnderlay,
      renderBase,
      renderEffect,
      options,
    );
    return;
  }
  const canvasScope = createCanvasPoolScope();
  try {
    const { canvas: base, transform } = createBaseLayer(ctx, renderBase, canvasScope);
    const effectBase = options.renderEffectBase
      ? createBaseLayer(ctx, options.renderEffectBase, canvasScope).canvas
      : base;
    const baseInput =
      options.renderBaseContent &&
      activeEffects.some((effect) => effect instanceof ReplicatorEffect)
        ? createBaseLayer(ctx, options.renderBaseContent, canvasScope).canvas
        : effectBase;
    const baseNoiseEffects = activeEffects.filter((effect) =>
      isBaseNoiseEffect(effect, rctx),
    );
    let effectiveBase = effectBase;
    for (const effect of baseNoiseEffects) {
      const outputCanvas = canvasScope.acquire(ctx.canvas.width, ctx.canvas.height);
      const output = outputCanvas.getContext('2d');
      renderEffect(effect, output, effectiveBase, rctx, transform, baseInput);
      effectiveBase = blendBaseLayer(
        effectiveBase,
        outputCanvas,
        dependentBlendModeForEffect(effect, effects, rctx) ?? 'normal',
        canvasScope,
      );
    }
    const suppressOriginal = suppressesOriginalLayer(effects, activeEffects, rctx);

    let previous = effectiveBase;
    const underlays: { effect: Effect; canvas: Canvas }[] = [];
    const overlays: { effect: Effect; canvas: Canvas }[] = [];
    for (let index = 0; index < activeEffects.length; index += 1) {
      const effect = activeEffects[index];
      if (effect instanceof BlendModeEffect) continue;
      if (isBaseNoiseEffect(effect, rctx)) continue;
      let effectInput: Canvas;
      if (
        (effect instanceof ReplicatorEffect &&
          effect.getAppliesOn(rctx) === 'previousEffect') ||
        (effect instanceof NoiseEffect && index > 0)
      ) {
        effectInput = renderLayeredPreviousEffectLayer(
          ctx,
          rctx,
          activeEffects,
          index,
          isUnderlay,
          renderBase,
          renderEffect,
          options,
          canvasScope,
        );
      } else {
        effectInput =
          index > 0 && effect.getAppliesOn(rctx) === 'previousEffect'
            ? previous
            : effectiveBase;
      }
      const outputCanvas = canvasScope.acquire(ctx.canvas.width, ctx.canvas.height);
      const output = outputCanvas.getContext('2d');
      renderEffect(effect, output, effectInput, rctx, transform, baseInput);
      if (isUnderlay(effect)) {
        underlays.push({ effect, canvas: outputCanvas });
      } else {
        overlays.push({ effect, canvas: outputCanvas });
      }
      previous = outputCanvas;
    }

    compositeEffectLayers(
      ctx,
      orderEffectsForApplication(underlays),
      activeEffects,
      effects,
      rctx,
    );
    if (!suppressOriginal) compositeLayer(ctx, effectiveBase);
    compositeEffectLayers(
      ctx,
      orderEffectsForApplication(overlays),
      activeEffects,
      effects,
      rctx,
    );
  } finally {
    canvasScope.releaseAll();
  }
}

function compositeEffectLayers(
  ctx: CanvasContext2D,
  layers: readonly { effect: Effect; canvas: Canvas }[],
  activeEffects: readonly Effect[],
  effects: readonly Effect[],
  rctx: ResolveContext,
): void {
  for (const layer of layers) {
    const index = activeEffects.indexOf(layer.effect);
    compositeEffectLayer(
      ctx,
      layer.canvas,
      layer.effect,
      index >= 0
        ? blendModesForEffect(layer.effect, index, activeEffects, effects, rctx)
        : [],
      rctx,
      dependentBlendModeForEffect(layer.effect, effects, rctx) === undefined,
    );
  }
}

function shouldReplaceLayer(effect: Effect): boolean {
  return effect instanceof SignalEffect && !(effect instanceof NoiseEffect);
}

function isBaseNoiseEffect(
  effect: Effect,
  rctx: ResolveContext,
): effect is NoiseEffect {
  return effect instanceof NoiseEffect && effect.getAppliesOn(rctx) === 'base';
}

function suppressesOriginal(effect: Effect, rctx: ResolveContext): boolean {
  if (isBaseNoiseEffect(effect, rctx)) return false;
  return (
    effect.type === 'blur' ||
    effect instanceof SignalEffect ||
    effect.type === 'motionBlur' ||
    effect.type === 'streak' ||
    (effect.type === 'replicator' &&
      effect.getProp('showOriginal') !== undefined)
  );
}
