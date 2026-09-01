import fs from 'node:fs';
import path from 'node:path';
import { projectVideoMetadataArgs } from '../project-branding';
import type {
  CaptionFrameSize,
  CaptionImageInfo,
  CaptionRenderPlacement,
  CaptionVideoTransform,
} from './render-types';
import {
  buildBlendModeLayerSegments,
  buildCaptionFrameSegments,
  CAPTION_HOLD_THRESHOLD_SECONDS,
  formatFfmpegDuration,
  getFfmpegOverlayExprs,
} from './render-utilities';
import type { HorizontalAlignment, ResolvedCornerGeometry, VerticalAlignment } from '../types/captions';
import { scaleCornerGeometryToFit } from '../utilities/canvas-utils';
import { parseColor } from '../utilities/color-utils';
import type { ResolvedVideoEncodeSettings } from '../utilities/ffmpeg-quality';
import { resolveVideoEncodeSettings } from '../utilities/ffmpeg-quality';
import { runFfmpeg } from '../utilities/ffmpeg-runner';
import { createSolidColorVideo } from '../utilities/ffmpeg-utils';
import type { TranscriptEntry } from './types';
import type { EcsPipelineBlendModeLayer } from './entity-system/pipeline';
import {
  appendFfmpegBlendModeLayers,
  buildFfmpegBlendModeStreams,
  writeFfmpegInputPipes,
} from './render-pipeline-ffmpeg-blend';
import {
  resolveLinearGradientGeometry,
  resolveRadialGradientGeometry,
  type GradientStop,
  type Paint,
} from './entity-system/paint';

function toFfmpegCanvasColor(paint: Paint): string {
  const parsedColor = paint.type === 'solid' ? parseColor({ color: paint.color, asString: false }) : undefined;
  if (!parsedColor || typeof parsedColor === 'string') {
    return 'black';
  }

  const componentToHex = (component: number): string =>
    Math.min(255, Math.max(0, Math.round(component)))
      .toString(16)
      .padStart(2, '0');
  const alpha =
    typeof parsedColor.a === 'number' ? Math.min(1, Math.max(0, parsedColor.a)) : 1;
  const hexColor = `0x${componentToHex(parsedColor.r)}${componentToHex(parsedColor.g)}${componentToHex(parsedColor.b)}`;

  return alpha < 1 ? `${hexColor}@${alpha.toFixed(3)}` : hexColor;
}

interface ParsedGradientStop {
  offset: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseGradientStops(stops: GradientStop[]): ParsedGradientStop[] {
  return stops
    .map((stop) => {
      const parsed = parseColor({ color: stop.color, asString: false });
      if (!parsed || typeof parsed === 'string') return undefined;
      return {
        offset: Math.max(0, Math.min(1, stop.offset)),
        r: parsed.r,
        g: parsed.g,
        b: parsed.b,
        a: typeof parsed.a === 'number' ? Math.max(0, Math.min(1, parsed.a)) : 1,
      };
    })
    .filter((stop): stop is ParsedGradientStop => stop !== undefined)
    .sort((first, second) => first.offset - second.offset);
}

function expressionNumber(value: number): string {
  return Number.isFinite(value) ? String(Number(value.toFixed(6))) : '0';
}

function gradientChannelExpression(stops: ParsedGradientStop[], channel: keyof Omit<ParsedGradientStop, 'offset'>, rawPosition: string): string {
  const firstOffset = stops[0].offset;
  const lastOffset = stops[stops.length - 1].offset;
  const position = `max(${expressionNumber(firstOffset)},min(${expressionNumber(lastOffset)},${rawPosition}))`;
  let expression = expressionNumber(stops[stops.length - 1][channel]);
  for (let index = stops.length - 2; index >= 0; index -= 1) {
    const from = stops[index];
    const to = stops[index + 1];
    const span = Math.max(0.000001, to.offset - from.offset);
    const local = `(${position}-${expressionNumber(from.offset)})/${expressionNumber(span)}`;
    const segment = `${expressionNumber(from[channel])}+(${expressionNumber(to[channel])}-${expressionNumber(from[channel])})*(${local})`;
    expression = `if(lt(${position},${expressionNumber(to.offset)}),${segment},${expression})`;
  }
  return expression;
}

function appendCanvasBackgroundFilter(
  filters: string[],
  videoResolution: { width: number; height: number },
  paint: Paint,
  frameRate?: number,
): string {
  const size = `${videoResolution.width}x${videoResolution.height}`;
  const frameRateOption =
    typeof frameRate === 'number' && Number.isFinite(frameRate) && frameRate > 0
      ? `:r=${formatFfmpegNumber(frameRate)}`
      : '';
  if (paint.type === 'solid') {
    filters.push(`color=c=${toFfmpegCanvasColor(paint)}:s=${size}${frameRateOption}[video-canvas]`);
    return '[video-canvas]';
  }

  const stops = parseGradientStops(paint.stops);
  if (stops.length < 2) {
    filters.push(`color=c=black@0.0:s=${size}${frameRateOption}[video-canvas]`);
    return '[video-canvas]';
  }

  const linearGeometry =
    paint.type === 'linear-gradient'
      ? resolveLinearGradientGeometry(paint, {
          x: 0,
          y: 0,
          width: videoResolution.width,
          height: videoResolution.height,
        })
      : undefined;
  const radialGeometry =
    paint.type === 'radial-gradient'
      ? resolveRadialGradientGeometry(paint, {
          x: 0,
          y: 0,
          width: videoResolution.width,
          height: videoResolution.height,
        })
      : undefined;
  const rawPosition =
    paint.type === 'linear-gradient'
      ? `(((${linearGeometry!.directionX === 0 ? 'X' : `X-${expressionNumber(linearGeometry!.startX)}`})*${expressionNumber(linearGeometry!.directionX)})+(${linearGeometry!.directionY === 0 ? 'Y' : `Y-${expressionNumber(linearGeometry!.startY)}`})*${expressionNumber(linearGeometry!.directionY)})/${expressionNumber(linearGeometry!.length)}`
      : `sqrt((X-${expressionNumber(radialGeometry!.centerX)})^2+(Y-${expressionNumber(radialGeometry!.centerY)})^2)/${expressionNumber(radialGeometry!.radius)}`;
  const red = gradientChannelExpression(stops, 'r', rawPosition);
  const green = gradientChannelExpression(stops, 'g', rawPosition);
  const blue = gradientChannelExpression(stops, 'b', rawPosition);
  const alpha = gradientChannelExpression(stops, 'a', rawPosition);
  filters.push(
    `color=c=black@0.0:s=${size}${frameRateOption},format=rgba,geq=r='${red}':g='${green}':b='${blue}':a='${alpha}*255'[video-canvas]`,
  );
  return '[video-canvas]';
}

function hasRoundedCorners(geometry: ResolvedCornerGeometry | undefined): geometry is ResolvedCornerGeometry {
  const radii = geometry?.radii;
  return Boolean(radii && (radii.topLeft > 0 || radii.topRight > 0 || radii.bottomRight > 0 || radii.bottomLeft > 0));
}

function formatFfmpegNumber(value: number): string {
  return Number.isFinite(value) && value > 0 ? String(Number(value.toFixed(6))) : '0';
}

// Full width (in pixels) of the anti-aliasing ramp, centered on the true corner boundary so it
// blends symmetrically instead of only feathering on the interior side of the curve.
const CORNER_MASK_FEATHER_PX = 2;

function getRoundedCornerAlphaFactor(
  radius: number,
  squircle: boolean,
  xCondition: string,
  yCondition: string,
  centerX: string,
  centerY: string,
): string | undefined {
  if (radius <= 0) {
    return undefined;
  }

  const formattedRadius = formatFfmpegNumber(radius);
  const normalizedDistance = squircle
    ? `pow(abs((X-(${centerX}))/${formattedRadius}),4)+pow(abs((Y-(${centerY}))/${formattedRadius}),4)`
    : `((X-(${centerX}))^2+(Y-(${centerY}))^2)/(${formattedRadius}^2)`;
  const distanceFromCenter = squircle
    ? `${formattedRadius}*pow(${normalizedDistance},0.25)`
    : `sqrt((X-(${centerX}))^2+(Y-(${centerY}))^2)`;
  const feather = CORNER_MASK_FEATHER_PX;
  const convexAlpha = `max(0,min(1,(${formattedRadius}-(${distanceFromCenter})+${feather / 2})/${feather}))`;

  return `if(${xCondition}*${yCondition},${convexAlpha},1)`;
}

function getRoundedVideoAlphaExpression(geometry: ResolvedCornerGeometry): string {
  const { radii, squircle } = geometry;
  const topLeft = formatFfmpegNumber(radii.topLeft);
  const topRight = formatFfmpegNumber(radii.topRight);
  const bottomRight = formatFfmpegNumber(radii.bottomRight);
  const bottomLeft = formatFfmpegNumber(radii.bottomLeft);
  const cornerAlphaFactors = [
    getRoundedCornerAlphaFactor(
      radii.topLeft,
      squircle.topLeft,
      `lt(X,${topLeft})`,
      `lt(Y,${topLeft})`,
      topLeft,
      topLeft,
    ),
    getRoundedCornerAlphaFactor(
      radii.topRight,
      squircle.topRight,
      `gt(X,W-${topRight})`,
      `lt(Y,${topRight})`,
      `W-${topRight}`,
      topRight,
    ),
    getRoundedCornerAlphaFactor(
      radii.bottomRight,
      squircle.bottomRight,
      `gt(X,W-${bottomRight})`,
      `gt(Y,H-${bottomRight})`,
      `W-${bottomRight}`,
      `H-${bottomRight}`,
    ),
    getRoundedCornerAlphaFactor(
      radii.bottomLeft,
      squircle.bottomLeft,
      `lt(X,${bottomLeft})`,
      `gt(Y,H-${bottomLeft})`,
      bottomLeft,
      `H-${bottomLeft}`,
    ),
  ].filter((factor): factor is string => factor !== undefined);

  return cornerAlphaFactors.reduce((alpha, factor) => `${alpha}*${factor}`, '255');
}

function appendRoundedVideoMaskFilter(
  filters: string[],
  inputLabel: string,
  outputLabel: string,
  cornerGeometry: ResolvedCornerGeometry | undefined,
  width: number,
  height: number,
): string {
  if (!hasRoundedCorners(cornerGeometry)) {
    return inputLabel;
  }

  const geometry = scaleCornerGeometryToFit(cornerGeometry, width, height);
  if (!hasRoundedCorners(geometry)) {
    return inputLabel;
  }

  filters.push(
    `${inputLabel}format=yuva444p,geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='${getRoundedVideoAlphaExpression(geometry)}'${outputLabel}`,
  );

  return outputLabel;
}

function appendViewportBlurFilter(
  filters: string[],
  inputLabel: string,
  outputLabel: string,
  blurRadius: number | undefined,
): string {
  if (!(blurRadius && blurRadius > 0) || !Number.isFinite(blurRadius)) return inputLabel;
  filters.push(`${inputLabel}gblur=sigma=${formatFfmpegNumber(blurRadius)}:steps=2${outputLabel}`);
  return outputLabel;
}

function getFittedVideoDimensions(
  videoResolution: { width: number; height: number },
  targetWidth: number,
  targetHeight: number,
): { width: number; height: number } {
  const scale = Math.min(targetWidth / videoResolution.width, targetHeight / videoResolution.height);

  return {
    width: Math.max(1, Math.round(videoResolution.width * scale)),
    height: Math.max(1, Math.round(videoResolution.height * scale)),
  };
}

function appendVideoTransformFilter(
  filters: string[],
  videoResolution: { width: number; height: number },
  videoTransform: CaptionVideoTransform | undefined,
  videoInput = '[0:v]',
  frameRate?: number,
): string {
  if (!videoTransform) {
    return videoInput;
  }

  const shiftX = Math.round((videoTransform.shiftXPercentage / 100) * videoResolution.width);
  const shiftY = Math.round((videoTransform.shiftYPercentage / 100) * videoResolution.height);
  const fitPositionX = Math.round((videoTransform.fitPositionXPercentage / 100) * videoResolution.width);
  const fitPositionY = Math.round((videoTransform.fitPositionYPercentage / 100) * videoResolution.height);
  const bounds = videoTransform.videoBounds;
  const targetWidth = Math.max(1, Math.round(bounds?.width ?? videoResolution.width - Math.abs(shiftX)));
  const targetHeight = Math.max(1, Math.round(bounds?.height ?? videoResolution.height - Math.abs(shiftY)));
  const targetX = Math.round(bounds?.x ?? fitPositionX);
  const targetY = Math.round(bounds?.y ?? fitPositionY);
  const canvasSource = appendCanvasBackgroundFilter(
    filters,
    videoResolution,
    videoTransform.canvasBackgroundPaint,
    frameRate,
  );
  const areaBounds = videoTransform.videoAreaBounds;
  const areaCornerGeometry = videoTransform.videoAreaCornerGeometry;
  const areaX = Math.max(0, Math.min(videoResolution.width - 1, Math.round(areaBounds?.x ?? 0)));
  const areaY = Math.max(0, Math.min(videoResolution.height - 1, Math.round(areaBounds?.y ?? 0)));
  const areaWidth = Math.max(
    1,
    Math.min(videoResolution.width - areaX, Math.round(areaBounds?.width ?? videoResolution.width)),
  );
  const areaHeight = Math.max(
    1,
    Math.min(videoResolution.height - areaY, Math.round(areaBounds?.height ?? videoResolution.height)),
  );
  const videoLayerBase = areaBounds ? '[video-layer-base]' : canvasSource;
  const videoLayerOutput = areaBounds ? '[video-layer-composited]' : '[transformed-video]';
  const frameRateOption =
    typeof frameRate === 'number' && Number.isFinite(frameRate) && frameRate > 0
      ? `:r=${formatFfmpegNumber(frameRate)}`
      : '';

  if (areaBounds) {
    filters.push(
      `color=c=black@0.0:s=${videoResolution.width}x${videoResolution.height}${frameRateOption},format=rgba${videoLayerBase}`,
    );
  }

  if (videoTransform.resizeMode === 'fit') {
    filters.push(
      `${videoInput}scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,setsar=1[scaled-shifted-video]`,
    );
    const fittedVideoSize = getFittedVideoDimensions(videoResolution, targetWidth, targetHeight);
    const shiftedVideo = appendRoundedVideoMaskFilter(
      filters,
      '[scaled-shifted-video]',
      '[shifted-video]',
      videoTransform.cornerGeometry,
      fittedVideoSize.width,
      fittedVideoSize.height,
    );
    filters.push(
      `${videoLayerBase}${shiftedVideo}overlay=x=${targetX}+(${targetWidth}-overlay_w)/2:y=${targetY}+(${targetHeight}-overlay_h)/2:shortest=1${videoLayerOutput}`,
    );
  } else {
    const shiftedVideo = appendRoundedVideoMaskFilter(
      filters,
      videoInput,
      '[shifted-video]',
      videoTransform.cornerGeometry,
      videoResolution.width,
      videoResolution.height,
    );
    filters.push(`${videoLayerBase}${shiftedVideo}overlay=x=${bounds?.x ?? shiftX}:y=${bounds?.y ?? shiftY}:shortest=1${videoLayerOutput}`);
  }

  if (areaBounds) {
    if (hasRoundedCorners(areaCornerGeometry)) {
      filters.push(
        `color=c=white@1:s=${areaWidth}x${areaHeight}${frameRateOption},format=rgba[video-area-mask-shape]`,
      );
      const roundedAreaMask = appendRoundedVideoMaskFilter(
        filters,
        '[video-area-mask-shape]',
        '[video-area-rounded-mask]',
        areaCornerGeometry,
        areaWidth,
        areaHeight,
      );
      filters.push(
        `color=c=black@0.0:s=${videoResolution.width}x${videoResolution.height}${frameRateOption},format=rgba[video-area-mask-base]`,
      );
      filters.push(
        `[video-area-mask-base]${roundedAreaMask}overlay=x=${areaX}:y=${areaY}:shortest=1[video-area-mask]`,
      );
    } else {
      filters.push(
        `color=c=black@0.0:s=${videoResolution.width}x${videoResolution.height}${frameRateOption},format=rgba,drawbox=x=${areaX}:y=${areaY}:w=${areaWidth}:h=${areaHeight}:color=white@1:t=fill[video-area-mask]`,
      );
    }
    filters.push(`${videoLayerOutput}[video-area-mask]alphamerge[video-area-clipped]`);
    filters.push(`${canvasSource}[video-area-clipped]overlay=x=0:y=0:shortest=1[transformed-video]`);
  }

  return '[transformed-video]';
}

function hasVideoOutputFrameRateConversion(inputFps: number | undefined, outputFps: number | undefined): boolean {
  return (
    typeof inputFps === 'number' &&
    Number.isFinite(inputFps) &&
    inputFps > 0 &&
    typeof outputFps === 'number' &&
    Number.isFinite(outputFps) &&
    outputFps > 0 &&
    Math.abs(inputFps - outputFps) >= 1e-9
  );
}

function appendVideoOutputFrameRateFilter(
  filters: string[],
  inputFps: number | undefined,
  outputFps: number | undefined,
): string {
  if (!hasVideoOutputFrameRateConversion(inputFps, outputFps) || typeof outputFps !== 'number') {
    return '[0:v]';
  }

  const outputLabel = '[output-rate-video]';
  filters.push(`[0:v]fps=fps=${formatFfmpegNumber(outputFps)}${outputLabel}`);
  return outputLabel;
}

/**
 * "ffmpeg-compositor" overlay path: streams the pre-rendered RGBA caption
 * frames directly into an FFmpeg process on stdin as a raw video input,
 * which FFmpeg's `overlay` filter composites onto the source video (or, for
 * the standalone caption movie output - see `renderStandaloneCaptionVideo`
 * below - a synthetic solid-color background) in a single pass. This is the
 * only overlay implementation for input-video and caption movie
 * output: it avoids ever muxing the animated caption clip into an
 * intermediate qtrle.mov file only to immediately decode it back out, and
 * still supports `videoTransform` (reframing/squircle corner masking) since
 * it uses the same FFmpeg `overlay` filter_complex graph either way. `pipe:0`
 * is a standard FFmpeg protocol supported identically on
 * Windows/Linux/macOS.
 */
export async function renderOverlayVideoViaRawFramePipe({
  inputPath,
  outputPath,
  videoResolution,
  captionInfos,
  allImageBuffers,
  allBlendModeLayers = [],
  captionFrameSize,
  fps,
  captionHoldThresholdSeconds,
  inputAudioPath,
  verticalAlignment = 'bottom',
  horizontalAlignment = 'center',
  xOffset = 0,
  yOffset = 0,
  useSafeArea = true,
  compositionAreaPath,
  videoTransform,
  durationSeconds,
  videoDurationSeconds,
  outputFrameCount,
  inputFps,
  outputFps,
  videoEncodeSettings = resolveVideoEncodeSettings(undefined),
  sourceMetadata = {},
}: {
  inputPath: string;
  outputPath: string;
  videoResolution: { width: number; height: number };
  captionInfos: CaptionImageInfo[];
  allImageBuffers: Buffer[];
  allBlendModeLayers?: EcsPipelineBlendModeLayer[][];
  captionFrameSize?: CaptionFrameSize;
  fps: number;
  captionHoldThresholdSeconds?: number;
  inputAudioPath?: string;
  verticalAlignment?: VerticalAlignment;
  horizontalAlignment?: HorizontalAlignment;
  xOffset?: number;
  yOffset?: number;
  useSafeArea?: boolean;
  compositionAreaPath?: string;
  videoTransform?: CaptionVideoTransform;
  durationSeconds?: number;
  videoDurationSeconds?: number;
  outputFrameCount?: number;
  inputFps?: number;
  outputFps?: number;
  videoEncodeSettings?: ResolvedVideoEncodeSettings;
  sourceMetadata?: Readonly<Record<string, string>>;
}): Promise<void> {
  const resolvedOutputPath = path.resolve(outputPath);
  const outputDirectory = path.dirname(resolvedOutputPath);
  await fs.promises.mkdir(outputDirectory, { recursive: true });

  const frameSize = captionFrameSize ?? videoResolution;
  const formattedDuration = formatFfmpegDuration(durationSeconds);
  const formattedVideoDuration = formatFfmpegDuration(videoDurationSeconds);
  const captionInputFrameLimit =
    typeof videoDurationSeconds === 'number' &&
    Number.isFinite(videoDurationSeconds) &&
    videoDurationSeconds > 0 &&
    Number.isFinite(fps) &&
    fps > 0
      ? Math.ceil(videoDurationSeconds * fps)
      : undefined;
  const resolvedVideoFrameCount =
    typeof outputFrameCount === 'number' && Number.isInteger(outputFrameCount) && outputFrameCount > 0
      ? outputFrameCount
      : typeof outputFps === 'number' &&
          Number.isFinite(outputFps) &&
          outputFps > 0 &&
          typeof videoDurationSeconds === 'number' &&
          Number.isFinite(videoDurationSeconds) &&
          videoDurationSeconds > 0
        ? Math.max(1, Math.round(videoDurationSeconds * outputFps))
        : undefined;
  const { segments, blankFrame } = buildCaptionFrameSegments({
    captionInfos,
    allImageBuffers,
    frameSize,
    fps,
    ...(captionHoldThresholdSeconds !== undefined ? { captionHoldThresholdSeconds } : {}),
  });
  const blendModeSegments = buildBlendModeLayerSegments(
    captionInfos,
    allBlendModeLayers,
    fps,
    captionHoldThresholdSeconds ?? CAPTION_HOLD_THRESHOLD_SECONDS,
  );
  const blendModeStreams = buildFfmpegBlendModeStreams({
    allBlendModeLayers,
    frameSize,
  });

  const { xExpr, yExpr } = getFfmpegOverlayExprs(verticalAlignment, horizontalAlignment, xOffset, yOffset, useSafeArea);
  const args = ['-y', '-i', inputPath];
  const filters: string[] = [];
  const outputFrameRateConversion = hasVideoOutputFrameRateConversion(inputFps, outputFps);
  const frameRateVideoSource = appendVideoOutputFrameRateFilter(filters, inputFps, outputFps);
  const videoSource = appendVideoTransformFilter(
    filters,
    videoResolution,
    videoTransform,
    frameRateVideoSource,
    outputFps,
  );

  let captionsInputIndex = 1;
  if (compositionAreaPath) {
    args.push('-i', compositionAreaPath);
    captionsInputIndex = 2;
  }

  // Raw RGBA caption frames, piped straight into this process on stdin
  // instead of reading them from an intermediate.mov file. `pipe:0` is a
  // standard FFmpeg protocol supported identically on Windows/Linux/macOS.
  args.push(
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgba',
    '-s',
    `${frameSize.width}x${frameSize.height}`,
    '-r',
    String(fps),
    '-i',
    'pipe:0',
  );

  let nextInputIndex = captionsInputIndex + 1;
  let nextPipePosition = 1;
  for (const stream of blendModeStreams) {
    stream.inputIndex = nextInputIndex;
    stream.pipeIndex = nextPipePosition + 2;
    stream.inputPipePosition = nextPipePosition;
    nextInputIndex += 1;
    nextPipePosition += 1;
    args.push(
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgba',
      '-s',
      `${stream.width}x${stream.height}`,
      '-r',
      String(fps),
      '-i',
      `pipe:${stream.pipeIndex}`,
    );
    if (stream.modes.length > 1) {
      stream.modeInputIndex = nextInputIndex;
      stream.modePipeIndex = nextPipePosition + 2;
      stream.modePipePosition = nextPipePosition;
      nextInputIndex += 1;
      nextPipePosition += 1;
      args.push(
        '-f',
        'rawvideo',
        '-pix_fmt',
        'gray',
        '-s',
        '1x1',
        '-r',
        String(fps),
        '-i',
        `pipe:${stream.modePipeIndex}`,
      );
    }
  }

  const sourceWithRegion = compositionAreaPath
    ? (() => {
        filters.push(`${videoSource}[1:v]overlay=x=0:y=0:format=auto[with-region]`);
        return '[with-region]';
      })()
    : videoSource;
  const captionOverlaySource = appendViewportBlurFilter(
    filters,
    sourceWithRegion,
    '[viewport-blurred]',
    videoTransform?.viewportBlurRadius,
  );
  const blendModeVideoSource =
    blendModeStreams.length > 0
      ? appendFfmpegBlendModeLayers(
          filters,
          captionOverlaySource,
          blendModeStreams,
          videoResolution,
          fps,
          xExpr,
          yExpr,
        )
      : captionOverlaySource;
  filters.push(
    `${blendModeVideoSource}[${captionsInputIndex}:v]overlay=x=${xExpr}:y=${yExpr}:eof_action=pass:repeatlast=1:format=auto[overlay]`,
  );
  const outputLabel = appendRoundedVideoMaskFilter(
    filters,
    '[overlay]',
    '[viewport-rounded-overlay]',
    videoTransform?.viewportCornerGeometry,
    videoResolution.width,
    videoResolution.height,
  );
  const durationLimitedOutputLabel =
    resolvedVideoFrameCount === undefined && formattedVideoDuration === undefined ? outputLabel : '[duration-limited]';
  if (resolvedVideoFrameCount !== undefined) {
    const resetTimestamps =
      typeof outputFps === 'number' && Number.isFinite(outputFps) && outputFps > 0
        ? `setpts=N/(${String(outputFps)})/TB`
        : 'setpts=PTS-STARTPTS';
    filters.push(`${outputLabel}trim=end_frame=${resolvedVideoFrameCount},${resetTimestamps}[duration-limited]`);
  } else if (formattedVideoDuration !== undefined) {
    filters.push(`${outputLabel}trim=duration=${formattedVideoDuration},setpts=PTS-STARTPTS[duration-limited]`);
  }
  const outputOptions = [
    ...(formattedDuration !== undefined ? ['-t', formattedDuration] : []),
    ...(!outputFrameRateConversion && typeof outputFps === 'number' && Number.isFinite(outputFps) && outputFps > 0
      ? ['-r', String(outputFps)]
      : []),
    '-fps_mode:v',
    outputFrameRateConversion ? 'vfr' : 'cfr',
    '-map',
    durationLimitedOutputLabel,
    '-map_metadata',
    '0',
    '-c:v',
    videoEncodeSettings.videoCodec,
    ...videoEncodeSettings.videoArgs,
    '-pix_fmt',
    videoEncodeSettings.pixFmt,
    ...videoEncodeSettings.colorArgs,
    ...videoEncodeSettings.containerArgs,
    ...projectVideoMetadataArgs(sourceMetadata),
  ];

  if (inputAudioPath) {
    const audioInputIndex = nextInputIndex;
    args.push('-i', inputAudioPath);
    // The optional input audio replaces the source audio track.
    outputOptions.push('-map', `${audioInputIndex}:a?`, '-c:a', 'copy');
  } else {
    // No separate audio input: keep the source video's own audio track
    // completely unmodified instead of re-encoding it.
    outputOptions.push('-map', '0:a?', '-c:a', 'copy');
  }

  args.push('-filter_complex', filters.join(';'));
  args.push(...outputOptions);
  args.push(resolvedOutputPath);

  await runFfmpeg(args, {
    writeInputPipes: {
      count: nextPipePosition,
      write: (pipes) =>
        writeFfmpegInputPipes({
          pipes,
          captionSegments: segments,
          captionBlankFrame: blankFrame,
          blendModeStreams,
          blendModeSegments,
          ...(captionInputFrameLimit !== undefined ? { outputFrameLimit: captionInputFrameLimit } : {}),
        }),
    },
  });
}

/**
 * Renders the caption-only movie output (no source video to
 * overlay onto - used when the request has no `input.video`, only
 * captions/audio/transcript). Composites the animated caption frames over a
 * synthetic solid-color background via the same raw-frame-pipe FFmpeg
 * `overlay` process as `renderOverlayVideoViaRawFramePipe`, so this never
 * needs an intermediate qtrle-muxed captions clip either.
 */
export async function renderStandaloneCaptionVideo({
  captionInfos,
  allImageBuffers,
  allBlendModeLayers = [],
  captionFrameSize,
  outputPath,
  videoResolution,
  transcript,
  placement,
  fps = 30,
  captionHoldThresholdSeconds,
  compositionAreaPath,
  videoTransform,
}: {
  captionInfos: CaptionImageInfo[];
  allImageBuffers: Buffer[];
  allBlendModeLayers?: EcsPipelineBlendModeLayer[][];
  captionFrameSize?: CaptionFrameSize;
  outputPath: string;
  videoResolution: { width: number; height: number };
  transcript: TranscriptEntry[];
  placement: CaptionRenderPlacement;
  fps?: number;
  captionHoldThresholdSeconds?: number;
  compositionAreaPath?: string;
  videoTransform?: CaptionVideoTransform;
}): Promise<void> {
  const resolvedOutputPath = path.resolve(outputPath);
  const outputDirectory = path.dirname(resolvedOutputPath);
  await fs.promises.mkdir(outputDirectory, { recursive: true });

  const duration = Math.max(
    transcript.reduce((maxDuration, entry) => Math.max(maxDuration, entry.end), 0),
    1,
  );
  const backgroundPath = path.join(
    outputDirectory,
    `${path.basename(resolvedOutputPath, path.extname(resolvedOutputPath))}-background.mp4`,
  );
  await createSolidColorVideo(backgroundPath, {
    width: videoResolution.width,
    height: videoResolution.height,
    duration,
    fps,
  });

  await renderOverlayVideoViaRawFramePipe({
    inputPath: backgroundPath,
    outputPath: resolvedOutputPath,
    videoResolution,
    captionInfos,
    allImageBuffers,
    allBlendModeLayers,
    ...(captionFrameSize !== undefined ? { captionFrameSize } : {}),
    fps,
    ...(captionHoldThresholdSeconds !== undefined ? { captionHoldThresholdSeconds } : {}),
    verticalAlignment: placement.verticalAlignment,
    horizontalAlignment: placement.horizontalAlignment,
    xOffset: placement.xOffset,
    yOffset: placement.yOffset,
    useSafeArea: placement.useSafeArea,
    ...(compositionAreaPath !== undefined ? { compositionAreaPath } : {}),
    ...(videoTransform !== undefined ? { videoTransform } : {}),
    durationSeconds: duration,
    videoDurationSeconds: duration,
    outputFps: fps,
  });
  await fs.promises.rm(backgroundPath, { force: true }).catch(() => undefined);
}
