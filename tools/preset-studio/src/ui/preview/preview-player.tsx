import type { CaptionVideoTransform, CanvasContext2D } from '@captioncat/caption-engine/browser';
import { applyAnimationCurve, resolvePaint } from '@captioncat/caption-engine/browser';
import {
  motionBlurAlphaForStep,
  motionBlurOffsetForAngle,
  normalizeMotionBlurSteps,
} from '@captioncat/caption-engine/browser';
import type { AnimationDoc } from '@/schema';
import type { CaptionImageInfo } from '@captioncat/caption-engine/browser';
import { type CSSProperties, type RefObject, useEffect, useRef, useState } from 'react';
import { drawRoundedRectanglePath, scaleCornerGeometryToFit } from '../../engine-adapters/rounded-rect';
import type { CaptionCrop } from './caption-crop';
import type { PreviewBackground } from './data';
import type { RenderPreviewBlendModeLayer } from '@captioncat/caption-engine/browser';

interface VideoBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ViewportBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface VideoEntityTransform {
  rotation: number;
  scale: { x: number; y: number };
  position: { x: number; y: number };
  opacity: number;
}

interface VideoMotionBlur {
  distance: number;
  angle?: number;
  steps: number;
  maxOpacity: number;
  showOriginal: 'none' | 'front' | 'back';
  isStreak: boolean;
  compositionScale: number;
  animationTargetPrefix?: string;
}

interface VideoBorder {
  width: number;
  color: string;
  position: 'inner' | 'center' | 'outer';
  style: 'solid' | 'dashed' | 'dotted';
}

const IDENTITY_VIDEO_TRANSFORM: VideoEntityTransform = {
  rotation: 0,
  scale: { x: 1, y: 1 },
  position: { x: 0, y: 0 },
  opacity: 1,
};

function configurePreviewImageSmoothing(context: CanvasRenderingContext2D): void {
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
}

export interface PreviewPlayerProps {
  width: number;
  height: number;
  bitmaps: ImageBitmap[];
  blendModeLayers?: readonly RenderPreviewBlendModeLayer[][];
  captionInfos?: readonly CaptionImageInfo[];
  fps: number;
  playbackSpeed: number;
  overlayX: number;
  overlayY: number;
  background: PreviewBackground | null;
  viewportBounds?: ViewportBounds | null;
  viewportEntityTransform?: VideoEntityTransform | null;
  videoAreaBounds?: VideoBounds | null;
  videoBounds?: VideoBounds | null;
  videoEntityTransform?: VideoEntityTransform | null;
  blurRadius?: number;
  videoBorder?: VideoBorder | null;
  videoMotionBlur?: VideoMotionBlur;
  videoAnimations?: AnimationDoc[];
  videoTransform?: CaptionVideoTransform | undefined;
  sourceCrop?: CaptionCrop | null;
  /** Whether the renderer is still appending frames to this bitmap sequence. */
  streaming?: boolean;
  playing: boolean;
  /** Whether the shared preview workspace is actively panning. */
  isPanning?: boolean;
  /** Toggles playback when the player canvas is clicked. */
  onTogglePlaying?: () => void;
  /** Whether playback restarts from the first frame after reaching the end. */
  loop?: boolean;
  /** Called once when non-looping playback reaches its final frame. */
  onPlaybackEnd?: () => void;
  /** Optional CSS styling applied directly to the preview canvas. */
  canvasStyle?: CSSProperties;
  /** Optional CSS background painted behind the transparent caption pixels. */
  canvasBackgroundColor?: string;
  /** Optional frame to show when this player first receives a decoded bitmap batch. */
  initialFrameIndex?: number | null;
  /** Called whenever the currently-displayed caption frame index changes, so callers (e.g. the live debug overlay) can stay in sync with playback. */
  onFrameIndexChange?: (frameIndex: number) => void;
  /** The latest user-requested timeline position. */
  seekTimeMs?: number | null;
  /** Changes whenever the caller requests a new timeline position. */
  seekRequestId?: number;
  /** Timeline position to restore when the player mounts with a new bitmap batch. */
  initialTimeMs?: number;
  /** Stable duration supplied by the preview timeline while streamed frames are incomplete. */
  timelineDurationMs?: number;
  /** Changes whenever a new render input requires playback to restart at the first frame. */
  playbackResetKey?: object;
  /** Called with the current timeline position as playback advances or seeks. */
  onPlaybackTimeChange?: (timeMs: number) => void;
  /** Exposes the current canvas so the preview can snapshot it before a quality change. */
  canvasRef?: RefObject<HTMLCanvasElement | null>;
}

const PREVIEW_CAPTION_HOLD_THRESHOLD_SECONDS = 1;

function isUsableCaptionInfo(info: CaptionImageInfo, bitmapCount: number): boolean {
  return (
    Number.isFinite(info.startTime) &&
    Number.isFinite(info.endTime) &&
    Number.isFinite(info.duration) &&
    Number.isInteger(info.startFrame) &&
    info.startFrame >= 0 &&
    Number.isInteger(info.numFrames) &&
    info.numFrames > 0 &&
    info.startFrame + info.numFrames <= bitmapCount
  );
}

function captionTimelineDurationMs(captionInfos: readonly CaptionImageInfo[], bitmapCount: number): number | null {
  if (captionInfos.length === 0 || !captionInfos.every((info) => isUsableCaptionInfo(info, bitmapCount))) return null;
  const durationSeconds = Math.max(
    ...captionInfos.map((info) => Math.max(info.endTime, info.startTime + Math.max(0, info.duration))),
  );
  return Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds * 1000 : null;
}

function frameIndexForCaptionTime(
  elapsedMs: number,
  captionInfos: readonly CaptionImageInfo[],
  fps: number,
): number {
  const elapsedSeconds = elapsedMs / 1000;
  for (let index = 0; index < captionInfos.length; index += 1) {
    const info = captionInfos[index];
    const next = captionInfos[index + 1];
    const captionEndSeconds = Math.max(info.endTime, info.startTime + Math.max(0, info.duration));
    if (elapsedSeconds < info.startTime) {
      if (!index) return -1;
      const previous = captionInfos[index - 1];
      const previousEndSeconds = Math.max(
        previous.endTime,
        previous.startTime + Math.max(0, previous.duration),
      );
      const gapSeconds = Math.max(0, info.startTime - previousEndSeconds);
      return previous.isLastWordOnPage && gapSeconds > PREVIEW_CAPTION_HOLD_THRESHOLD_SECONDS
        ? -1
        : previous.startFrame + previous.numFrames - 1;
    }
    if (elapsedSeconds <= captionEndSeconds || !next) {
      const durationSeconds = Math.max(info.duration, 1 / Math.max(1, fps));
      const progress = Math.min(1, Math.max(0, (elapsedSeconds - info.startTime) / durationSeconds));
      return info.startFrame + Math.min(info.numFrames - 1, Math.floor(progress * info.numFrames));
    }
  }
  return -1;
}

function elapsedMsForFrameIndex(
  frameIndex: number,
  captionInfos: readonly CaptionImageInfo[],
  fps: number,
  frameDurationMs: number,
): number {
  for (const info of captionInfos) {
    if (frameIndex < info.startFrame || frameIndex >= info.startFrame + info.numFrames) continue;
    const frameOffset = frameIndex - info.startFrame;
    const progress = info.numFrames > 1 ? frameOffset / (info.numFrames - 1) : 0;
    const durationSeconds = Math.max(info.duration, 1 / Math.max(1, fps));
    return (info.startTime + progress * durationSeconds) * 1000;
  }
  return frameIndex * frameDurationMs;
}

function animationDuration(animation: AnimationDoc): number {
  return animation.tracks.reduce(
    (duration, track) => Math.max(duration, ...track.keyframes.map((keyframe) => keyframe.time)),
    Math.max(0, animation.durationSeconds),
  );
}

function sampleTrackValue(animation: AnimationDoc, target: string, elapsedSeconds: number): unknown {
  const track = animation.tracks.find((candidate) => candidate.enabled && candidate.target === target);
  if (!track || track.keyframes.length === 0) return undefined;
  const keyframes = [...track.keyframes].sort((first, second) => first.time - second.time);
  const duration = animationDuration(animation);
  const delayed = elapsedSeconds - Math.max(0, animation.delaySeconds);
  const clock =
    animation.phase === 'active' && duration > 0 && animation.playbackMode !== 'once'
      ? animation.playbackMode === 'loop'
        ? ((delayed % duration) + duration) % duration
        : (() => {
            const cycleTime = ((delayed % (duration * 2)) + duration * 2) % (duration * 2);
            return cycleTime <= duration ? cycleTime : duration * 2 - cycleTime;
          })()
      : delayed;
  if (clock <= keyframes[0].time) return keyframes[0].value;
  const last = keyframes[keyframes.length - 1];
  if (clock >= last.time) return last.value;
  for (let index = 0; index < keyframes.length - 1; index += 1) {
    const first = keyframes[index];
    const second = keyframes[index + 1];
    if (clock < first.time || clock > second.time) continue;
    const span = second.time - first.time;
    const linear = span > 0 ? (clock - first.time) / span : 1;
    const progress = applyAnimationCurve(linear, first.curve as Parameters<typeof applyAnimationCurve>[1]);
    if (typeof first.value === 'number' && typeof second.value === 'number') {
      return first.value + (second.value - first.value) * progress;
    }
    if (
      first.value &&
      second.value &&
      typeof first.value === 'object' &&
      typeof second.value === 'object' &&
      'x' in first.value &&
      'y' in first.value &&
      'x' in second.value &&
      'y' in second.value
    ) {
      const firstVector = first.value as { x: number; y: number };
      const secondVector = second.value as { x: number; y: number };
      return {
        x: firstVector.x + (secondVector.x - firstVector.x) * progress,
        y: firstVector.y + (secondVector.y - firstVector.y) * progress,
      };
    }
    return progress < 1 ? first.value : second.value;
  }
  return last.value;
}

function sampleVideoTransformAnimation(
  base: VideoEntityTransform,
  animations: AnimationDoc[],
  elapsedSeconds: number,
): VideoEntityTransform {
  const next = { ...base, scale: { ...base.scale }, position: { ...base.position } };
  for (const animation of animations) {
    if (!animation.enabled) continue;
    const opacity = sampleTrackValue(animation, 'Transform.opacity', elapsedSeconds);
    const rotation = sampleTrackValue(animation, 'Transform.rotation', elapsedSeconds);
    const scale = sampleTrackValue(animation, 'Transform.scale', elapsedSeconds);
    const position = sampleTrackValue(animation, 'Transform.position', elapsedSeconds);
    if (typeof opacity === 'number') next.opacity = opacity;
    if (typeof rotation === 'number') next.rotation = rotation;
    if (scale && typeof scale === 'object' && 'x' in scale && 'y' in scale) {
      next.scale = scale as { x: number; y: number };
    }
    if (position && typeof position === 'object' && 'x' in position && 'y' in position) {
      next.position = position as { x: number; y: number };
    }
  }
  return next;
}

function sampleVideoMotionBlurAnimation(
  base: VideoMotionBlur | undefined,
  animations: AnimationDoc[],
  elapsedSeconds: number,
): VideoMotionBlur | undefined {
  if (!base?.animationTargetPrefix) return base;
  const sample = (property: string) =>
    animations.reduce<unknown>(
      (value, animation) => sampleTrackValue(animation, `${base.animationTargetPrefix}${property}`, elapsedSeconds) ?? value,
      undefined,
    );
  const next = { ...base };
  const distance = sample('distance');
  const angle = sample('angle');
  const steps = sample('steps');
  const maxOpacity = sample('maxOpacity');
  const showOriginal = sample('showOriginal');
  if (typeof distance === 'number' && Number.isFinite(distance)) next.distance = Math.max(0, distance);
  if (typeof angle === 'number' && Number.isFinite(angle)) next.angle = angle;
  if (typeof steps === 'number' && Number.isFinite(steps)) next.steps = steps;
  if (typeof maxOpacity === 'number' && Number.isFinite(maxOpacity)) {
    next.maxOpacity = Math.min(1, Math.max(0, maxOpacity));
  }
  if (showOriginal === 'none' || showOriginal === 'front' || showOriginal === 'back') {
    next.showOriginal = showOriginal;
  }
  return next;
}

function clipViewport(
  ctx: CanvasRenderingContext2D,
  bounds: ViewportBounds,
  geometry: CaptionVideoTransform['viewportCornerGeometry'],
  centerX: number,
  centerY: number,
): boolean {
  if (!geometry) return false;
  const fitted = scaleCornerGeometryToFit(geometry, bounds.width, bounds.height);
  ctx.beginPath();
  drawRoundedRectanglePath(ctx, bounds.x - centerX, bounds.y - centerY, bounds.width, bounds.height, fitted);
  ctx.clip();
  return true;
}

function drawVideoWithMotionBlur(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  draw: (targetCtx: CanvasRenderingContext2D, x: number, y: number) => void,
  motionBlur: VideoMotionBlur | undefined,
): void {
  const steps = normalizeMotionBlurSteps(motionBlur?.steps ?? 0);
  const offset = motionBlur
    ? motionBlurOffsetForAngle(motionBlur.distance * motionBlur.compositionScale, motionBlur.angle)
    : { x: 0, y: 0 };
  if (steps <= 0 || (offset.x === 0 && offset.y === 0)) {
    draw(ctx, originX, originY);
    return;
  }
  const baseAlpha = ctx.globalAlpha;
  ctx.save();
  if (motionBlur?.showOriginal === 'back') draw(ctx, originX, originY);
  for (let index = steps; index >= 0; index -= 1) {
    ctx.globalAlpha = baseAlpha * motionBlurAlphaForStep(steps, index, motionBlur?.maxOpacity ?? 1);
    ctx.save();
    ctx.translate(offset.x * index, offset.y * index);
    draw(ctx, originX, originY);
    ctx.restore();
    if (!motionBlur?.isStreak) {
      ctx.save();
      ctx.translate(-offset.x * index, -offset.y * index);
      draw(ctx, originX, originY);
      ctx.restore();
    }
  }
  if (motionBlur?.showOriginal === 'front') draw(ctx, originX, originY);
  ctx.restore();
}

function borderBoxForPosition(
  originX: number,
  originY: number,
  width: number,
  height: number,
  border: VideoBorder,
): { x: number; y: number; width: number; height: number } {
  const halfWidth = border.width / 2;
  if (border.position === 'outer') {
    return { x: originX - halfWidth, y: originY - halfWidth, width: width + border.width, height: height + border.width };
  }
  if (border.position === 'inner') {
    return { x: originX + halfWidth, y: originY + halfWidth, width: width - border.width, height: height - border.width };
  }
  return { x: originX, y: originY, width, height };
}

function drawCoverFitImage(
  targetCtx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
  originX: number,
  originY: number,
): void {
  if (image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.naturalWidth - sourceWidth) / 2;
  const sourceY = (image.naturalHeight - sourceHeight) / 2;
  targetCtx.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    originX,
    originY,
    width,
    height,
  );
}

/**
 * Draws a static sample background plus the animated, real-engine-rendered
 * caption bitmaps on top of it, optionally looping playback at the source
 * caption timing. `drawImage` (rather than `putImageData`) is used for the
 * caption layer so its transparent regions properly alpha-composite over the
 * background.
 */
export function PreviewPlayer({
  width,
  height,
  bitmaps,
  blendModeLayers = [],
  captionInfos = [],
  fps,
  playbackSpeed,
  overlayX,
  overlayY,
  background,
  viewportBounds,
  viewportEntityTransform,
  videoAreaBounds,
  videoBounds,
  videoEntityTransform,
  blurRadius,
  videoBorder,
  videoMotionBlur,
  videoAnimations = [],
  videoTransform,
  sourceCrop,
  streaming = false,
  playing,
  isPanning = false,
  onTogglePlaying,
  loop = true,
  onPlaybackEnd,
  canvasStyle,
  canvasBackgroundColor = 'transparent',
  initialFrameIndex,
  onFrameIndexChange,
  seekTimeMs = null,
  seekRequestId,
  initialTimeMs = 0,
  timelineDurationMs,
  playbackResetKey,
  onPlaybackTimeChange,
  canvasRef: exposedCanvasRef,
}: PreviewPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // Latest callback, read from inside the rAF loop below - kept in a ref so
  // a new inline function identity from the caller every render does not
  // retrigger/restart that effect (see its dependency array).
  const onFrameIndexChangeRef = useRef(onFrameIndexChange);
  onFrameIndexChangeRef.current = onFrameIndexChange;
  const onPlaybackEndRef = useRef(onPlaybackEnd);
  onPlaybackEndRef.current = onPlaybackEnd;
  const onPlaybackTimeChangeRef = useRef(onPlaybackTimeChange);
  onPlaybackTimeChangeRef.current = onPlaybackTimeChange;
  // Elapsed playback position in ms, persisted across play/pause toggles (and
  // thus across the effect below re-running) so pausing freezes the current
  // frame instead of jumping back to frame 0.
  const elapsedMsRef = useRef(0);
  const wasPlayingRef = useRef(false);
  const initializedBitmapsRef = useRef<ImageBitmap[] | null>(null);
  const lastReportedFrameIndexRef = useRef<number | null>(null);
  const lastReportedPlaybackTimeMsRef = useRef<number | null>(null);
  const appliedSeekRequestIdRef = useRef<number | undefined>(
    seekRequestId !== undefined && seekRequestId > 0 ? undefined : seekRequestId,
  );
  const appliedPlaybackResetKeyRef = useRef(playbackResetKey);
  const initialTimeMsRef = useRef(initialTimeMs);
  initialTimeMsRef.current = initialTimeMs;
  const [backgroundImageLoadedTick, setBackgroundImageLoadedTick] = useState(0);
  const surfaceWidth = Math.max(1, Math.round(videoBounds?.width ?? width));
  const surfaceHeight = Math.max(1, Math.round(videoBounds?.height ?? height));

  useEffect(() => {
    let cancelled = false;
    const bg = document.createElement('canvas');
    bg.width = surfaceWidth;
    bg.height = surfaceHeight;
    bgCanvasRef.current = bg;

    if (!background) return;
    if (background.kind === 'image') {
      const image = new Image();
      image.onload = () => {
        if (cancelled) return;
        const bgCtx = bg.getContext('2d');
        if (!bgCtx) return;
        configurePreviewImageSmoothing(bgCtx);
        drawCoverFitImage(bgCtx, image, surfaceWidth, surfaceHeight, 0, 0);
        setBackgroundImageLoadedTick((tick) => tick + 1);
      };
      image.onerror = () => {
        if (!cancelled) console.error(`Unable to load preview background image "${background.imageUrl}".`);
      };
      image.src = background.imageUrl;
    } else {
      const bgCtx = bg.getContext('2d');
      if (bgCtx) {
        configurePreviewImageSmoothing(bgCtx);
        background.draw(bgCtx, surfaceWidth, surfaceHeight);
      }
    }

    return () => {
      cancelled = true;
    };
  }, [background, surfaceWidth, surfaceHeight]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || bitmaps.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    configurePreviewImageSmoothing(ctx);

    // Keep the expensive viewport/video composition off the visible canvas so
    // caption frame changes only need to composite one cached image.
    const sceneCanvas = document.createElement('canvas');
    sceneCanvas.width = width;
    sceneCanvas.height = height;
    const sceneCtx = sceneCanvas.getContext('2d');
    if (!sceneCtx) return;
    configurePreviewImageSmoothing(sceneCtx);
    const layerCanvases = new Map<string, HTMLCanvasElement>();
    const canvasForLayer = (
      frameIndex: number,
      layerIndex: number,
      layer: RenderPreviewBlendModeLayer,
    ): HTMLCanvasElement => {
      const key = `${frameIndex}:${layerIndex}`;
      const existing = layerCanvases.get(key);
      if (existing) return existing;
      const layerCanvas = document.createElement('canvas');
      layerCanvas.width = layer.width;
      layerCanvas.height = layer.height;
      const layerContext = layerCanvas.getContext('2d');
      if (!layerContext) throw new Error('Unable to create the preview blend mode layer context.');
      layerContext.putImageData(
        new ImageData(new Uint8ClampedArray(layer.buffer), layer.width, layer.height),
        0,
        0,
      );
      layerCanvases.set(key, layerCanvas);
      return layerCanvas;
    };

    const viewportBlurRadius = videoTransform?.viewportBlurRadius ?? 0;
    const viewportLayer = viewportBlurRadius > 0 ? document.createElement('canvas') : null;
    if (viewportLayer) {
      viewportLayer.width = width;
      viewportLayer.height = height;
    }
    const viewportCtx = viewportLayer?.getContext('2d') ?? sceneCtx;
    configurePreviewImageSmoothing(viewportCtx);

    const resolvedFps = Number.isFinite(fps) && fps > 0 ? fps : 1;
    const frameDurationMs = 1000 / resolvedFps;
    const captionDurationMs = captionTimelineDurationMs(captionInfos, bitmaps.length);
    const hasCaptionTimeline = captionDurationMs !== null;
    const requestedTimelineDurationMs = timelineDurationMs ?? 0;
    const configuredDurationMs =
      Number.isFinite(requestedTimelineDurationMs) && requestedTimelineDurationMs > 0
        ? requestedTimelineDurationMs
        : null;
    const durationMs = Math.max(
      frameDurationMs,
      configuredDurationMs ?? captionDurationMs ?? bitmaps.length * frameDurationMs,
    );
    const playbackRate = Number.isFinite(playbackSpeed) && playbackSpeed > 0 ? playbackSpeed : 1;
    const replayingFromEnd = playing && !wasPlayingRef.current && !loop && !streaming && elapsedMsRef.current >= durationMs;
    if (replayingFromEnd) {
      elapsedMsRef.current = 0;
    }
    wasPlayingRef.current = playing;
    const previousBitmaps = initializedBitmapsRef.current;
    const seekRequested =
      seekRequestId !== undefined && seekRequestId !== appliedSeekRequestIdRef.current;
    const playbackResetRequested =
      playbackResetKey !== undefined && playbackResetKey !== appliedPlaybackResetKeyRef.current;
    if (playbackResetRequested) {
      elapsedMsRef.current = 0;
      appliedPlaybackResetKeyRef.current = playbackResetKey;
    } else if (seekRequested) {
      elapsedMsRef.current = Math.min(
        durationMs,
        Math.max(0, Number.isFinite(seekTimeMs ?? NaN) ? (seekTimeMs ?? 0) : 0),
      );
      appliedSeekRequestIdRef.current = seekRequestId;
    } else if (previousBitmaps === null) {
      if (Number.isFinite(initialTimeMsRef.current) && initialTimeMsRef.current > 0) {
        elapsedMsRef.current = Math.min(durationMs, Math.max(0, initialTimeMsRef.current));
      } else {
        const frameIndex = Number.isInteger(initialFrameIndex)
          ? Math.min(bitmaps.length - 1, Math.max(0, initialFrameIndex ?? 0))
          : 0;
        elapsedMsRef.current = hasCaptionTimeline
          ? elapsedMsForFrameIndex(frameIndex, captionInfos, resolvedFps, frameDurationMs)
          : frameIndex * frameDurationMs;
      }
    }
    initializedBitmapsRef.current = bitmaps;
    // Keep the frozen frame in range if a new (shorter) render supersedes
    // the one that was playing when paused.
    elapsedMsRef.current = streaming
      ? Math.min(durationMs, Math.max(0, elapsedMsRef.current))
      : loop && playing
        ? elapsedMsRef.current % durationMs
        : Math.min(durationMs, Math.max(0, elapsedMsRef.current));
    let paintRaf: number | null = null;
    let timer: number | null = null;
    let lastTimestamp: number | null = null;

    const drawBackground = (targetCtx: CanvasRenderingContext2D, originX: number, originY: number) => {
      if (!background) return;
      const bg = bgCanvasRef.current;
      if (bg) targetCtx.drawImage(bg, originX, originY, surfaceWidth, surfaceHeight);
    };

    const hasAnimatedVideo = videoAnimations.some((animation) => animation.enabled);
    let sceneDirty = true;
    let lastSceneFrameIndex = -1;

    const viewportCenterX = viewportBounds ? viewportBounds.x + viewportBounds.width / 2 : width / 2;
    const viewportCenterY = viewportBounds ? viewportBounds.y + viewportBounds.height / 2 : height / 2;
    const viewportClipBounds = viewportBounds ?? { x: 0, y: 0, width, height };

    const drawScene = (frameIndex: number) => {
      sceneCtx.clearRect(0, 0, width, height);
      if (viewportLayer) viewportCtx.clearRect(0, 0, width, height);
      const drawCtx = viewportCtx;
      drawCtx.save();
      drawCtx.translate(viewportCenterX, viewportCenterY);
      if (viewportEntityTransform) {
        drawCtx.globalAlpha *= viewportEntityTransform.opacity;
        if (viewportEntityTransform.rotation !== 0) drawCtx.rotate((viewportEntityTransform.rotation * Math.PI) / 180);
        if (viewportEntityTransform.scale.x !== 1 || viewportEntityTransform.scale.y !== 1) {
          drawCtx.scale(viewportEntityTransform.scale.x, viewportEntityTransform.scale.y);
        }
      }
      drawCtx.save();
      clipViewport(
        drawCtx,
        viewportClipBounds,
        videoTransform?.viewportCornerGeometry,
        viewportCenterX,
        viewportCenterY,
      );
      if (videoTransform?.canvasBackgroundPaint) {
        drawCtx.fillStyle = resolvePaint(
          drawCtx as unknown as CanvasContext2D,
          videoTransform.canvasBackgroundPaint,
          { x: -width / 2, y: -height / 2, width, height },
        ) as typeof drawCtx.fillStyle;
        drawCtx.fillRect(-width / 2, -height / 2, width, height);
      }

      if (videoAreaBounds) {
        drawCtx.save();
        drawCtx.beginPath();
        if (videoTransform?.videoAreaCornerGeometry) {
          const fitted = scaleCornerGeometryToFit(
            videoTransform.videoAreaCornerGeometry,
            videoAreaBounds.width,
            videoAreaBounds.height,
          );
          drawRoundedRectanglePath(
            drawCtx,
            videoAreaBounds.x - viewportCenterX,
            videoAreaBounds.y - viewportCenterY,
            videoAreaBounds.width,
            videoAreaBounds.height,
            fitted,
          );
        } else {
          drawCtx.rect(
            videoAreaBounds.x - viewportCenterX,
            videoAreaBounds.y - viewportCenterY,
            videoAreaBounds.width,
            videoAreaBounds.height,
          );
        }
        drawCtx.clip();
      }

      const originX = -surfaceWidth / 2;
      const originY = -surfaceHeight / 2;
      const centerX = videoBounds ? videoBounds.x + surfaceWidth / 2 : width / 2;
      const centerY = videoBounds ? videoBounds.y + surfaceHeight / 2 : height / 2;

      drawCtx.save();
      drawCtx.translate(centerX - viewportCenterX, centerY - viewportCenterY);
      const animatedVideoTransform = sampleVideoTransformAnimation(
        videoEntityTransform ?? IDENTITY_VIDEO_TRANSFORM,
        videoAnimations,
        elapsedMsRef.current / 1000,
      );
      const animatedVideoMotionBlur = sampleVideoMotionBlurAnimation(
        videoMotionBlur,
        videoAnimations,
        elapsedMsRef.current / 1000,
      );
      const videoPosition = videoBounds
        ? {
            x: animatedVideoTransform.position.x - (videoEntityTransform?.position.x ?? 0),
            y: animatedVideoTransform.position.y - (videoEntityTransform?.position.y ?? 0),
          }
        : animatedVideoTransform.position;
      drawCtx.globalAlpha *= animatedVideoTransform.opacity;
      if (animatedVideoTransform.rotation !== 0) drawCtx.rotate((animatedVideoTransform.rotation * Math.PI) / 180);
      if (animatedVideoTransform.scale.x !== 1 || animatedVideoTransform.scale.y !== 1) {
        drawCtx.scale(animatedVideoTransform.scale.x, animatedVideoTransform.scale.y);
      }
      if (videoPosition.x !== 0 || videoPosition.y !== 0) drawCtx.translate(videoPosition.x, videoPosition.y);
      drawCtx.beginPath();
      if (videoTransform?.cornerGeometry) {
        // Squircle-aware path (not the native `roundRect`, which only knows circular arcs) plus
        // the same boost-then-clamp-to-fit pass the real ffmpeg/skia render applies at this same
        // point, so a squircle corner here matches the burned-in video's actual rounding.
        const fitted = scaleCornerGeometryToFit(videoTransform.cornerGeometry, surfaceWidth, surfaceHeight);
        drawRoundedRectanglePath(drawCtx, originX, originY, surfaceWidth, surfaceHeight, fitted);
      } else {
        drawCtx.rect(originX, originY, surfaceWidth, surfaceHeight);
      }
      drawCtx.clip();
      // The video canvas layer does not run through the real engine's effect pipeline (it is a
      // lightweight preview compositor, not a render of the actual entity tree), so its own Blur
      // effect is applied directly here as a canvas filter - same unscaled "pt as px" treatment
      // Offset/Scale/Rotation above already get in this function.
      if (blurRadius && blurRadius > 0) drawCtx.filter = `blur(${blurRadius}px)`;
      drawVideoWithMotionBlur(drawCtx, originX, originY, drawBackground, animatedVideoMotionBlur);
      drawCtx.restore();

      if (videoBorder && videoBorder.width > 0) {
        drawCtx.save();
        drawCtx.translate(centerX - viewportCenterX, centerY - viewportCenterY);
        drawCtx.globalAlpha *= animatedVideoTransform.opacity;
        if (animatedVideoTransform.rotation !== 0) drawCtx.rotate((animatedVideoTransform.rotation * Math.PI) / 180);
        if (animatedVideoTransform.scale.x !== 1 || animatedVideoTransform.scale.y !== 1) {
          drawCtx.scale(animatedVideoTransform.scale.x, animatedVideoTransform.scale.y);
        }
        if (videoPosition.x !== 0 || videoPosition.y !== 0) drawCtx.translate(videoPosition.x, videoPosition.y);
        const borderBox = borderBoxForPosition(originX, originY, surfaceWidth, surfaceHeight, videoBorder);
        if (borderBox.width > 0 && borderBox.height > 0) {
          drawCtx.beginPath();
          if (videoTransform?.cornerGeometry) {
            const halfWidth = videoBorder.width / 2;
            const delta = videoBorder.position === 'outer' ? halfWidth : videoBorder.position === 'inner' ? -halfWidth : 0;
            const base = videoTransform.cornerGeometry;
            const adjusted = {
              ...base,
              radii: {
                topLeft: Math.max(0, base.radii.topLeft + delta),
                topRight: Math.max(0, base.radii.topRight + delta),
                bottomRight: Math.max(0, base.radii.bottomRight + delta),
                bottomLeft: Math.max(0, base.radii.bottomLeft + delta),
              },
            };
            const fitted = scaleCornerGeometryToFit(adjusted, borderBox.width, borderBox.height);
            drawRoundedRectanglePath(drawCtx, borderBox.x, borderBox.y, borderBox.width, borderBox.height, fitted);
          } else {
            drawCtx.rect(borderBox.x, borderBox.y, borderBox.width, borderBox.height);
          }
          drawCtx.lineWidth = videoBorder.width;
          drawCtx.strokeStyle = videoBorder.color || 'rgba(0,0,0,1)';
          drawCtx.lineCap = videoBorder.style === 'dotted' ? 'round' : 'butt';
          drawCtx.setLineDash(
            videoBorder.style === 'dashed'
              ? [videoBorder.width * 3, videoBorder.width * 2]
              : videoBorder.style === 'dotted'
                ? [0, videoBorder.width * 1.6]
                : [],
          );
          drawCtx.stroke();
        }
        drawCtx.restore();
      }

        if (videoAreaBounds) drawCtx.restore();
        drawCtx.restore();
      drawCtx.restore();

      if (viewportLayer) {
        sceneCtx.save();
        sceneCtx.filter = `blur(${viewportBlurRadius}px)`;
        sceneCtx.drawImage(viewportLayer, 0, 0);
        sceneCtx.restore();
      }

      lastSceneFrameIndex = frameIndex;
    };

    const draw = (frameIndex: number) => {
      if (sceneDirty) {
        drawScene(frameIndex);
        sceneDirty = false;
      }

      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(sceneCanvas, 0, 0);

      // Bitmaps can be `.close()`d by `usePlaybackBitmaps`'s cleanup (for example, a
      // new render superseding this one) in the brief window between this
      // callback is scheduled and runs. A closed bitmap's
      // width and height reset to 0. Skip drawing it instead of throwing.
      ctx.save();
      ctx.translate(viewportCenterX, viewportCenterY);
      if (viewportEntityTransform) {
        ctx.globalAlpha *= viewportEntityTransform.opacity;
        if (viewportEntityTransform.rotation !== 0) ctx.rotate((viewportEntityTransform.rotation * Math.PI) / 180);
        if (viewportEntityTransform.scale.x !== 1 || viewportEntityTransform.scale.y !== 1) {
          ctx.scale(viewportEntityTransform.scale.x, viewportEntityTransform.scale.y);
        }
      }
      const captionViewportClipped = clipViewport(
        ctx,
        viewportClipBounds,
        videoTransform?.viewportCornerGeometry,
        viewportCenterX,
        viewportCenterY,
      );
      const frame = bitmaps[frameIndex];
      const layers = blendModeLayers[frameIndex] ?? [];
      const crop = frame ? sourceCrop ?? { x: 0, y: 0, width: frame.width, height: frame.height } : null;
      if (crop) {
        layers.forEach((layer, layerIndex) => {
          ctx.save();
          ctx.globalCompositeOperation = layer.mode === 'normal' ? 'source-over' : layer.mode;
          ctx.drawImage(
            canvasForLayer(frameIndex, layerIndex, layer),
            crop.x,
            crop.y,
            crop.width,
            crop.height,
            overlayX - viewportCenterX,
            overlayY - viewportCenterY,
            crop.width,
            crop.height,
          );
          ctx.restore();
        });
      }
      if (frame && frame.width > 0 && frame.height > 0) {
        const captionCrop = sourceCrop ?? { x: 0, y: 0, width: frame.width, height: frame.height };
        ctx.drawImage(
          frame,
          captionCrop.x,
          captionCrop.y,
          captionCrop.width,
          captionCrop.height,
          overlayX - viewportCenterX,
          overlayY - viewportCenterY,
          captionCrop.width,
          captionCrop.height,
        );
      }
      if (captionViewportClipped) ctx.restore();
      ctx.restore();
    };

    const frameIndexFromElapsed = () =>
      hasCaptionTimeline
        ? frameIndexForCaptionTime(elapsedMsRef.current, captionInfos, resolvedFps)
        : Math.min(bitmaps.length - 1, Math.floor(elapsedMsRef.current / frameDurationMs));

    // Static scenes are cached above. Animated video transforms invalidate that
    // cache independently of caption frame changes.
    let lastDrawnFrameIndex = -1;
    // Tracked separately from `lastDrawnFrameIndex` since it must fire
    // whenever the frame index itself changes, regardless of scene redraws.
    const reportFrameIndex = (frameIndex: number) => {
      if (frameIndex === lastReportedFrameIndexRef.current) return;
      lastReportedFrameIndexRef.current = frameIndex;
      onFrameIndexChangeRef.current?.(frameIndex);
    };
    const reportPlaybackTime = () => {
      const timeMs = Math.min(durationMs, Math.max(0, elapsedMsRef.current));
      if (timeMs === lastReportedPlaybackTimeMsRef.current) return;
      lastReportedPlaybackTimeMsRef.current = timeMs;
      onPlaybackTimeChangeRef.current?.(timeMs);
    };

    let pendingFrame: { frameIndex: number } | null = null;
    let playbackEnded = false;

    const nextCaptionFrameDelayMs = (): number => {
      if (hasCaptionTimeline) {
        const elapsedSeconds = elapsedMsRef.current / 1000;
        for (const info of captionInfos) {
          const captionEndSeconds = Math.max(info.endTime, info.startTime + Math.max(0, info.duration));
          if (elapsedSeconds < info.startTime) {
            return Math.max(1, (info.startTime * 1000 - elapsedMsRef.current) / playbackRate);
          }
          if (elapsedSeconds >= captionEndSeconds) continue;

          const durationSeconds = Math.max(info.duration, 1 / resolvedFps);
          const progress = Math.min(1, Math.max(0, (elapsedSeconds - info.startTime) / durationSeconds));
          const frameNumber = Math.floor(progress * info.numFrames);
          const nextFrameTimeMs =
            (info.startTime + (Math.min(info.numFrames, frameNumber + 1) / info.numFrames) * durationSeconds) * 1000;
          return Math.max(1, (nextFrameTimeMs - elapsedMsRef.current) / playbackRate);
        }
      }
      const nextFrameBoundaryMs = (frameIndexFromElapsed() + 1) * frameDurationMs;
      return Math.max(1, (nextFrameBoundaryMs - elapsedMsRef.current) / playbackRate);
    };

    const paintPendingFrame = () => {
      paintRaf = null;
      const nextFrame = pendingFrame;
      pendingFrame = null;
      if (!nextFrame) return;
      if (sceneDirty || nextFrame.frameIndex !== lastDrawnFrameIndex) {
        draw(nextFrame.frameIndex);
        lastDrawnFrameIndex = nextFrame.frameIndex;
      }
    };

    const scheduleNextTick = () => {
      if (!playing) return;
      timer = window.setTimeout(tick, nextCaptionFrameDelayMs());
    };

    const tick = () => {
      timer = null;
      const now = performance.now();
      let reachedEnd = false;
      if (lastTimestamp !== null) {
        const deltaMs = now - lastTimestamp;
        const nextElapsedMs = elapsedMsRef.current + deltaMs * playbackRate;
        if (streaming) {
          elapsedMsRef.current = Math.min(durationMs, nextElapsedMs);
        } else if (loop) {
          elapsedMsRef.current = nextElapsedMs % durationMs;
        } else if (nextElapsedMs >= durationMs) {
          elapsedMsRef.current = durationMs;
          reachedEnd = true;
        } else {
          elapsedMsRef.current = nextElapsedMs;
        }
      }
      lastTimestamp = now;
      const frameIndex = frameIndexFromElapsed();
      if (hasAnimatedVideo && frameIndex !== lastSceneFrameIndex) {
        sceneDirty = true;
      }
      reportFrameIndex(frameIndex);
      reportPlaybackTime();
      if (sceneDirty || frameIndex !== lastDrawnFrameIndex) {
        if (reachedEnd) {
          draw(frameIndex);
          lastDrawnFrameIndex = frameIndex;
        } else {
          pendingFrame = { frameIndex };
          if (paintRaf === null) paintRaf = requestAnimationFrame(paintPendingFrame);
        }
      }
      if (reachedEnd) {
        if (!playbackEnded) {
          playbackEnded = true;
          onPlaybackEndRef.current?.();
        }
        return;
      }
      if (streaming && elapsedMsRef.current >= durationMs) return;
      scheduleNextTick();
    };

    const hasDynamicPlayback = bitmaps.length > 1 || hasAnimatedVideo || hasCaptionTimeline;
    if (playing && hasDynamicPlayback) {
      tick();
    } else {
      const frameIndex = frameIndexFromElapsed();
      reportFrameIndex(frameIndex);
      reportPlaybackTime();
      draw(frameIndex);
    }

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      if (paintRaf !== null) cancelAnimationFrame(paintRaf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `background` is intentionally included so switching backgrounds restarts the draw loop with the new closure. `backgroundImageLoadedTick` forces a redraw after an image is rasterized into the cached background canvas. `onFrameIndexChange` and `onPlaybackEnd` are deliberately excluded - read via refs instead - so passing fresh inline callbacks every render does not restart this loop.
  }, [background, backgroundImageLoadedTick, bitmaps, blendModeLayers, blurRadius, captionInfos, fps, initialFrameIndex, loop, overlayX, overlayY, playbackResetKey, playbackSpeed, playing, seekRequestId, seekTimeMs, sourceCrop, streaming, surfaceWidth, surfaceHeight, timelineDurationMs, width, height, videoAreaBounds, videoBounds, videoEntityTransform, videoMotionBlur, videoTransform, videoBorder, viewportBounds, viewportEntityTransform, videoAnimations]);

  // Keep the canvas transparent by default so the caption pixels retain their
  // alpha. Callers can supply a CSS background directly on this canvas.
  return (
    <canvas
      ref={(node) => {
        canvasRef.current = node;
        if (exposedCanvasRef) exposedCanvasRef.current = node;
      }}
      width={width}
      height={height}
      className="block h-full w-full"
      style={{
        ...canvasStyle,
        background: canvasBackgroundColor,
      }}
      onClick={onTogglePlaying}
    />
  );
}
