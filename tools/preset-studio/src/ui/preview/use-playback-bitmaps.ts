import {
  computeOverlayPosition,
  type CaptionDebugFrame,
  type CaptionDebugQuad,
  type RenderPreviewFrame,
  type RenderPreviewBlendModeLayer,
  type RenderPreviewResult,
} from '@captioncat/caption-engine/browser';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { findStablePageCrop, findStableWordCrop, type CaptionCrop } from './caption-crop';

export interface PlaybackBitmapsState {
  /** The currently exposed decoded frames. Older frames remain visible while a newer generation decodes. */
  bitmaps: ImageBitmap[] | null;
  blendModeLayers: RenderPreviewBlendModeLayer[][] | null;
  /** The overlay position paired with the currently exposed bitmap generation. */
  overlay: { x: number; y: number } | null;
  /** True while one or more streamed frames wait for bitmap decoding. */
  decoding: boolean;
  /** The first decoded frame containing visible caption pixels, or `null` when every frame is transparent. */
  firstVisibleFrameIndex: number | null;
  /** A stable source rectangle shared by every compact-preview frame, or `null` when the full frame is shown. */
  sourceCrop: CaptionCrop | null;
  /** Dimensions of the currently exposed bitmap batch, paired with `bitmaps` and `sourceCrop`. */
  bitmapSize: { width: number; height: number } | null;
  /** True when the currently supplied result has decoded at least one frame. */
  isCurrentResultActive: boolean;
}

function pointInQuad(x: number, y: number, quad: CaptionDebugQuad): boolean {
  const points = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
  let contains = false;
  for (let index = 0, previousIndex = points.length - 1; index < points.length; previousIndex = index++) {
    const current = points[index];
    const previous = points[previousIndex];
    const intersects =
      current.y > y !== previous.y > y &&
      x < ((previous.x - current.x) * (y - current.y)) / (previous.y - current.y) + current.x;
    if (intersects) contains = !contains;
  }
  return contains;
}

function findOpaqueCaptionPixelCount(
  frame: RenderPreviewFrame,
  debugFrame: CaptionDebugFrame,
  debugScale: number,
): number {
  if (frame.kind !== 'raw') return frame.opaquePixelCount ?? 0;
  const quads = debugFrame.words;
  if (quads.length === 0 || !Number.isFinite(debugScale) || debugScale <= 0) return 0;
  const maxPixelCount = 8;
  let opaquePixelCount = 0;
  for (const quad of quads) {
    const points = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
    const left = Math.max(0, Math.floor(Math.min(...points.map((point) => point.x * debugScale))));
    const top = Math.max(0, Math.floor(Math.min(...points.map((point) => point.y * debugScale))));
    const right = Math.min(frame.width - 1, Math.ceil(Math.max(...points.map((point) => point.x * debugScale))));
    const bottom = Math.min(frame.height - 1, Math.ceil(Math.max(...points.map((point) => point.y * debugScale))));
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        if (!pointInQuad(x / debugScale, y / debugScale, quad)) continue;
        if (frame.buffer[(y * frame.width + x) * 4 + 3] < 224) continue;
        opaquePixelCount += 1;
        if (opaquePixelCount >= maxPixelCount) return opaquePixelCount;
      }
    }
  }
  return opaquePixelCount;
}

function findFirstVisibleFrameIndex(result: RenderPreviewResult): number | null {
  const { frames, debugLayout } = result;
  let firstAlphaFrameIndex: number | null = null;
  for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
    const frame = frames[frameIndex];
    const debugFrame = debugLayout?.frames[frameIndex];
    if (frame.kind !== 'raw') {
      if (debugFrame && frame.opaquePixelCount !== undefined && frame.opaquePixelCount >= 8) return frameIndex;
      if (frame.hasAlpha && firstAlphaFrameIndex === null) firstAlphaFrameIndex = frameIndex;
      continue;
    }
    if (debugFrame && findOpaqueCaptionPixelCount(frame, debugFrame, debugLayout.scale) >= 8) return frameIndex;
    const buffer = frame.buffer;
    let opaquePixelCount = 0;
    for (let alphaIndex = 3; alphaIndex < buffer.length; alphaIndex += 4) {
      const alpha = buffer[alphaIndex];
      if (alpha !== 0 && firstAlphaFrameIndex === null) firstAlphaFrameIndex = frameIndex;
      if (alpha >= 224) {
        opaquePixelCount += 1;
        if (opaquePixelCount >= 8) return frameIndex;
      }
    }
  }
  return firstAlphaFrameIndex;
}

function frameHasVisiblePixels(frame: RenderPreviewFrame): boolean {
  if (frame.kind !== 'raw') return frame.hasAlpha === true || (frame.opaquePixelCount ?? 0) > 0;
  let hasAlpha = false;
  for (let alphaIndex = 3; alphaIndex < frame.buffer.length; alphaIndex += 4) {
    const alpha = frame.buffer[alphaIndex];
    if (alpha >= 224) return true;
    if (alpha !== 0) hasAlpha = true;
  }
  return hasAlpha;
}

interface BitmapGeneration {
  frames: RenderPreviewFrame[];
  sourceBitmaps: Array<ImageBitmap | null>;
  bitmaps: ImageBitmap[];
  nextFrameIndex: number;
  decoding: boolean;
  active: boolean;
  firstVisibleFrameIndex: number | null;
  initialCrop: CaptionCrop | null;
}

function closeGeneration(generation: BitmapGeneration, liveBitmaps: ImageBitmap[] | null): void {
  if (generation.bitmaps !== liveBitmaps) closeBitmaps(generation.bitmaps);
  for (const bitmap of generation.sourceBitmaps) {
    if (bitmap) releaseBitmap(bitmap);
  }
}

function retainIncomingSourceBitmaps(generation: BitmapGeneration): void {
  for (let index = generation.sourceBitmaps.length; index < generation.frames.length; index += 1) {
    const frame = generation.frames[index];
    if (frame.kind === 'bitmap') {
      retainBitmap(frame.bitmap);
      generation.sourceBitmaps.push(frame.bitmap);
    } else {
      generation.sourceBitmaps.push(null);
    }
  }
}

const bitmapReferenceCounts = new WeakMap<ImageBitmap, number>();

function retainBitmap(bitmap: ImageBitmap): void {
  bitmapReferenceCounts.set(bitmap, (bitmapReferenceCounts.get(bitmap) ?? 0) + 1);
}

function releaseBitmap(bitmap: ImageBitmap): void {
  const count = bitmapReferenceCounts.get(bitmap);
  if (count === undefined || count <= 1) {
    bitmapReferenceCounts.delete(bitmap);
    bitmap.close();
    return;
  }
  bitmapReferenceCounts.set(bitmap, count - 1);
}

function closeBitmaps(bitmaps: ImageBitmap[] | null): void {
  if (!bitmaps) return;
  for (const bitmap of bitmaps) releaseBitmap(bitmap);
}

/**
 * Adopts transferred ImageBitmap frames one at a time, with raw-RGBA decoding
 * retained only for environments without the Worker bitmap path.
 */
export function usePlaybackBitmaps(
  result: RenderPreviewResult | null,
  options: {
    clear?: boolean;
    cropToWords?: boolean;
    cropToPage?: boolean;
    playing?: boolean;
    decodeAllFrames?: boolean;
  } = {},
): PlaybackBitmapsState {
  const [bitmaps, setBitmaps] = useState<ImageBitmap[] | null>(null);
  const [blendModeLayers, setBlendModeLayers] = useState<RenderPreviewBlendModeLayer[][] | null>(null);
  const [overlay, setOverlay] = useState<{ x: number; y: number } | null>(null);
  const [firstVisibleFrameIndex, setFirstVisibleFrameIndex] = useState<number | null>(null);
  const [sourceCrop, setSourceCrop] = useState<CaptionCrop | null>(null);
  const [bitmapSize, setBitmapSize] = useState<{ width: number; height: number } | null>(null);
  const [activeGenerationFirstFrame, setActiveGenerationFirstFrame] = useState<RenderPreviewFrame | null>(null);
  const [decoding, setDecoding] = useState(false);
  const liveBitmapsRef = useRef<ImageBitmap[] | null>(null);
  const generationRef = useRef<BitmapGeneration | null>(null);
  const publishedBitmapGenerationRef = useRef<BitmapGeneration | null>(null);
  const publishedBitmapCountRef = useRef(0);
  const latestResultRef = useRef<RenderPreviewResult | null>(null);
  const playingRef = useRef(options.playing !== false);
  const decodeAllFramesRef = useRef(options.decodeAllFrames === true);
  const clear = options.clear === true;
  playingRef.current = options.playing !== false;
  decodeAllFramesRef.current = options.decodeAllFrames === true;

  useLayoutEffect(() => {
    if (!clear) return;
    const liveBitmaps = liveBitmapsRef.current;
    closeBitmaps(liveBitmaps);
    liveBitmapsRef.current = null;
    const generation = generationRef.current;
    if (generation) closeGeneration(generation, liveBitmaps);
    generationRef.current = null;
    publishedBitmapGenerationRef.current = null;
    publishedBitmapCountRef.current = 0;
    latestResultRef.current = result;
    setDecoding(false);
    setBitmaps(null);
    setBlendModeLayers(null);
    setOverlay(null);
    setFirstVisibleFrameIndex(null);
    setSourceCrop(null);
    setBitmapSize(null);
    setActiveGenerationFirstFrame(null);
  }, [clear, result]);

  useEffect(() => {
    if (clear) return;
    if (!result || result.frames.length === 0) {
      const liveBitmaps = liveBitmapsRef.current;
      closeBitmaps(liveBitmaps);
      liveBitmapsRef.current = null;
      const generation = generationRef.current;
      if (generation) closeGeneration(generation, liveBitmaps);
      generationRef.current = null;
      publishedBitmapGenerationRef.current = null;
      publishedBitmapCountRef.current = 0;
      latestResultRef.current = result;
      setDecoding(false);
      setBitmaps(null);
      setBlendModeLayers(null);
      setOverlay(null);
      setFirstVisibleFrameIndex(null);
      setSourceCrop(null);
      setBitmapSize(null);
      setActiveGenerationFirstFrame(null);
      return;
    }

    latestResultRef.current = result;
    const incomingFrames = result.frames;
    let generation = generationRef.current;
    const isSameGeneration =
      generation !== null &&
      incomingFrames.length >= generation.frames.length &&
      generation.frames.every((frame, index) => incomingFrames[index] === frame);
    if (!isSameGeneration) {
      if (generation) closeGeneration(generation, liveBitmapsRef.current);
      generation = {
        frames: incomingFrames,
        sourceBitmaps: [],
        bitmaps: [],
        nextFrameIndex: 0,
        decoding: false,
        active: false,
        firstVisibleFrameIndex: null,
        initialCrop: null,
      };
      generationRef.current = generation;
      setActiveGenerationFirstFrame(null);
    } else if (generation) {
      generation.frames = incomingFrames;
    }
    if (!generation) return;
    retainIncomingSourceBitmaps(generation);

    const activeGeneration = generation;
    const updateVisibleState = (): void => {
      const latestResult = latestResultRef.current;
      if (!latestResult || !activeGeneration.active) return;
      const calculatedCrop = options.cropToPage
        ? findStablePageCrop(latestResult)
        : options.cropToWords
          ? findStableWordCrop(latestResult)
          : null;
      const metadataCrop = latestResult.stablePageCrop ?? null;
      const availableCrop = metadataCrop ?? calculatedCrop;
      if (activeGeneration.initialCrop === null && availableCrop) {
        activeGeneration.initialCrop = availableCrop;
      }
      const crop = metadataCrop ?? (latestResult.debugLayout ? calculatedCrop ?? activeGeneration.initialCrop : activeGeneration.initialCrop);
      const nextOverlay = computeOverlayPosition(latestResult);
      setOverlay((current) =>
        current && current.x === nextOverlay.x && current.y === nextOverlay.y ? current : nextOverlay,
      );
      if (
        publishedBitmapGenerationRef.current !== activeGeneration ||
        publishedBitmapCountRef.current !== activeGeneration.bitmaps.length
      ) {
        publishedBitmapGenerationRef.current = activeGeneration;
        publishedBitmapCountRef.current = activeGeneration.bitmaps.length;
        setBitmaps([...activeGeneration.bitmaps]);
        setBlendModeLayers(
          activeGeneration.frames
            .slice(0, activeGeneration.bitmaps.length)
            .map((frame) => frame.blendModeLayers),
        );
      }
      const nextFirstVisibleFrameIndex = latestResult.debugLayout
        ? findFirstVisibleFrameIndex(latestResult)
        : activeGeneration.firstVisibleFrameIndex;
      setFirstVisibleFrameIndex((current) =>
        current === nextFirstVisibleFrameIndex ? current : nextFirstVisibleFrameIndex,
      );
      setSourceCrop((current) => {
        if (
          current &&
          crop &&
          current.x === crop.x &&
          current.y === crop.y &&
          current.width === crop.width &&
          current.height === crop.height
        ) {
          return current;
        }
        return current === null && crop === null ? current : crop;
      });
      const nextBitmapSize = crop
        ? { width: crop.width, height: crop.height }
        : { width: latestResult.frameSize.width, height: latestResult.frameSize.height };
      setBitmapSize((current) =>
        current &&
        current.width === nextBitmapSize.width &&
        current.height === nextBitmapSize.height
          ? current
          : nextBitmapSize,
      );
    };

    if (activeGeneration.active) updateVisibleState();
    if (activeGeneration.decoding) return;

    activeGeneration.decoding = true;
    setDecoding(true);
    void (async () => {
      try {
        while (
          generationRef.current === activeGeneration &&
          activeGeneration.nextFrameIndex < activeGeneration.frames.length &&
          (playingRef.current || decodeAllFramesRef.current || activeGeneration.nextFrameIndex === 0)
        ) {
          const frameIndex = activeGeneration.nextFrameIndex;
          const frame = activeGeneration.frames[frameIndex];
          let bitmap: ImageBitmap;
          if (frame.kind === 'bitmap') {
            bitmap = activeGeneration.sourceBitmaps[frameIndex] ?? frame.bitmap;
            activeGeneration.sourceBitmaps[frameIndex] = null;
          } else {
            const clamped = new Uint8ClampedArray(new ArrayBuffer(frame.buffer.byteLength));
            clamped.set(frame.buffer);
            const imageData = new ImageData(clamped, frame.width, frame.height);
            bitmap = await createImageBitmap(imageData);
            retainBitmap(bitmap);
          }
          if (generationRef.current !== activeGeneration) {
            releaseBitmap(bitmap);
            return;
          }
          activeGeneration.bitmaps.push(bitmap);
          activeGeneration.nextFrameIndex += 1;
          if (
            activeGeneration.firstVisibleFrameIndex === null &&
            frameHasVisiblePixels(frame)
          ) {
            activeGeneration.firstVisibleFrameIndex = activeGeneration.nextFrameIndex - 1;
          }
          if (!activeGeneration.active) {
            const liveBitmaps = liveBitmapsRef.current;
            closeBitmaps(liveBitmaps);
            liveBitmapsRef.current = activeGeneration.bitmaps;
            activeGeneration.active = true;
            setActiveGenerationFirstFrame(activeGeneration.frames[0] ?? null);
          }
          updateVisibleState();
        }
      } catch (error) {
        console.error('Unable to decode a preview frame.', error);
      } finally {
        activeGeneration.decoding = false;
        if (generationRef.current === activeGeneration) {
          setDecoding(
            (playingRef.current || decodeAllFramesRef.current) &&
              activeGeneration.nextFrameIndex < activeGeneration.frames.length,
          );
        }
      }
    })();
  }, [clear, options.cropToPage, options.cropToWords, options.decodeAllFrames, options.playing, result]);

  useEffect(() => {
    return () => {
      const liveBitmaps = liveBitmapsRef.current;
      closeBitmaps(liveBitmaps);
      liveBitmapsRef.current = null;
      const generation = generationRef.current;
      if (generation) closeGeneration(generation, liveBitmaps);
      generationRef.current = null;
    };
  }, []);

  return {
    bitmaps,
    blendModeLayers,
    overlay,
    decoding,
    firstVisibleFrameIndex,
    sourceCrop,
    bitmapSize,
    isCurrentResultActive:
      result !== null &&
      result.frames.length > 0 &&
      activeGenerationFirstFrame !== null &&
      result.frames[0] === activeGenerationFirstFrame,
  };
}
