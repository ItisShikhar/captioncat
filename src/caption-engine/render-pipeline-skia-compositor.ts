import fs from 'node:fs';
import path from 'node:path';
import { projectVideoMetadataArgs } from '../project-branding';
import { PassThrough } from 'node:stream';
import type { CaptionFrameSize, CaptionImageInfo, CaptionRenderPlacement } from './render-types';
import type { EcsPipelineBlendModeLayer } from './entity-system/pipeline';
import {
  buildBlendModeLayerSegments,
  buildCaptionFrameSegments,
  formatFfmpegDuration,
  type BlendModeLayerSegment,
} from './render-utilities';
import { decodeImageToRawRgba } from '../utilities/canvas-utils';
import type { ResolvedVideoEncodeSettings } from '../utilities/ffmpeg-quality';
import { resolveVideoEncodeSettings } from '../utilities/ffmpeg-quality';
import { runFfmpeg, writeToStdin } from '../utilities/ffmpeg-runner';
import {
  blendOverlayInPlace,
  blendOverlayWithModeInPlace,
  computeOverlayPixelPosition,
  createSegmentTimelineCursor,
  RawFrameReassembler,
} from '../utilities/raw-frame-compositor';

function createBlendModeLayerCursor(
  segments: readonly BlendModeLayerSegment[],
  fps: number,
): (timeSeconds: number) => readonly EcsPipelineBlendModeLayer[] | undefined {
  const frameDuration = 1 / fps;
  let segmentIndex = 0;
  let segmentStart = 0;
  return (timeSeconds: number) => {
    while (segmentIndex < segments.length) {
      const segment = segments[segmentIndex];
      if (timeSeconds < segmentStart + segment.repeat * frameDuration) return segment.layers;
      segmentStart += segment.repeat * frameDuration;
      segmentIndex += 1;
    }
    return undefined;
  };
}

/**
 * "skia-compositor" overlay path: instead of muxing the animated caption
 * frames into an intermediate qtrle.mov file and letting FFmpeg's
 * `overlay` filter composite it onto the source video, this decodes the
 * source video to raw RGBA frames in one FFmpeg process, alpha-blends the
 * pre-rendered caption (and optional static caption-region) buffers
 * directly onto each frame in Node, and streams the composited frames into
 * a second FFmpeg process for final encoding. This eliminates the caption
 * clip's own encode+decode round-trip and the `overlay` filter's runtime
 * cost entirely.
 *
 * Only used when there is no `videoTransform` (video reframing / squircle
 * corner masking) - that logic still lives exclusively in the FFmpeg
 * filter_complex graph (see render-pipeline-ffmpeg-compositor.ts's
 * `renderOverlayVideoViaRawFramePipe`), since porting it to Node/Skia is
 * out of scope here. Both paths must otherwise produce visually identical
 * output.
 */
export async function renderOverlayVideoNodeComposite({
  inputPath,
  outputPath,
  videoResolution,
  captionFps,
  captionInfos,
  allImageBuffers,
  allBlendModeLayers = [],
  captionFrameSize,
  captionHoldThresholdSeconds,
  placement,
  compositionAreaImage,
  inputAudioPath,
  durationSeconds,
  outputFrameCount,
  outputFps,
  videoEncodeSettings = resolveVideoEncodeSettings(undefined),
  sourceMetadata = {},
}: {
  inputPath: string;
  outputPath: string;
  videoResolution: { width: number; height: number };
  captionFps: number;
  captionInfos: CaptionImageInfo[];
  allImageBuffers: Buffer[];
  allBlendModeLayers?: EcsPipelineBlendModeLayer[][];
  captionFrameSize: CaptionFrameSize;
  captionHoldThresholdSeconds: number;
  placement: CaptionRenderPlacement;
  compositionAreaImage?: Buffer | undefined;
  inputAudioPath?: string | undefined;
  durationSeconds?: number;
  outputFrameCount?: number;
  outputFps: number;
  videoEncodeSettings?: ResolvedVideoEncodeSettings;
  sourceMetadata?: Readonly<Record<string, string>>;
}): Promise<void> {
  const resolvedOutputPath = path.resolve(outputPath);
  const outputDirectory = path.dirname(resolvedOutputPath);
  await fs.promises.mkdir(outputDirectory, { recursive: true });
  const formattedDuration = formatFfmpegDuration(durationSeconds);

  const { segments } = buildCaptionFrameSegments({
    captionInfos,
    allImageBuffers,
    frameSize: captionFrameSize,
    fps: captionFps,
    captionHoldThresholdSeconds,
  });
  const getActiveCaptionBuffer = createSegmentTimelineCursor(segments, captionFps);
  const getActiveBlendModeLayers = createBlendModeLayerCursor(
    buildBlendModeLayerSegments(
      captionInfos,
      allBlendModeLayers,
      captionFps,
      captionHoldThresholdSeconds,
    ),
    captionFps,
  );

  const { x: overlayX, y: overlayY } = computeOverlayPixelPosition(
    placement.verticalAlignment,
    placement.horizontalAlignment,
    videoResolution.width,
    videoResolution.height,
    captionFrameSize.width,
    captionFrameSize.height,
    placement.xOffset,
    placement.yOffset,
    placement.useSafeArea,
  );

  // The static caption-region image is a single full-frame PNG. Decode it to
  // raw RGBA once up front rather than per-frame.
  const regionRawImage = compositionAreaImage ? await decodeImageToRawRgba(compositionAreaImage) : undefined;

  const frameBytes = videoResolution.width * videoResolution.height * 4;

  // Decouples the decode (process A) and encode (process B) FFmpeg
  // invocations: process A's consumeStdout callback writes composited
  // frames in here, process B's writeStdin callback reads them back out.
  // Node's stream backpressure propagates through this bridge in both
  // directions, so a slow encoder naturally throttles the decoder instead
  // of buffering the whole video in memory.
  const bridge = new PassThrough({ highWaterMark: frameBytes * 4 });

  const decodeArgs = ['-y', '-i', inputPath, '-an', '-r', String(outputFps), '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'];

  const encodeArgs: string[] = [
    '-y',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgba',
    '-s',
    `${videoResolution.width}x${videoResolution.height}`,
    '-r',
    String(outputFps),
    '-i',
    'pipe:0',
    // Re-open the source purely to access its audio track, since process A
    // above only decodes video.
    '-i',
    inputPath,
  ];

  const outputOptions: string[] = [
    ...(formattedDuration !== undefined ? ['-t', formattedDuration] : []),
    '-r',
    String(outputFps),
    '-fps_mode:v',
    'cfr',
    '-map',
    '0:v',
    '-map_metadata',
    '1',
  ];
  if (inputAudioPath) {
    encodeArgs.push('-i', inputAudioPath);
    outputOptions.push('-map', '2:a?', '-c:a', 'copy');
  } else {
    // No separate audio input: keep the source video's own audio track
    // completely unmodified instead of re-encoding it.
    outputOptions.push('-map', '1:a?', '-c:a', 'copy');
  }

  encodeArgs.push(...outputOptions);
  encodeArgs.push(
    '-c:v',
    videoEncodeSettings.videoCodec,
    ...videoEncodeSettings.videoArgs,
    '-pix_fmt',
    videoEncodeSettings.pixFmt,
    ...videoEncodeSettings.colorArgs,
    ...videoEncodeSettings.containerArgs,
    ...projectVideoMetadataArgs(sourceMetadata),
    resolvedOutputPath,
  );

  const encodePromise = runFfmpeg(encodeArgs, {
    writeStdin: async (stdin) => {
      for await (const chunk of bridge) {
        await writeToStdin(stdin, chunk as Buffer);
      }
    },
  });

  let frameIndex = 0;
  const reassembler = new RawFrameReassembler(frameBytes);
  const decodePromise = runFfmpeg(decodeArgs, {
    consumeStdout: async (stdout) => {
      for await (const chunk of stdout) {
        const frames = reassembler.push(chunk as Buffer);
        for (const frame of frames) {
          const currentFrameIndex = frameIndex++;
          if (outputFrameCount !== undefined && currentFrameIndex >= outputFrameCount) {
            continue;
          }
          const frameTime = currentFrameIndex / outputFps;

          if (regionRawImage) {
            blendOverlayInPlace(
              frame,
              videoResolution.width,
              videoResolution.height,
              regionRawImage.buffer,
              regionRawImage.width,
              regionRawImage.height,
              0,
              0,
            );
          }

          const captionBuffer = getActiveCaptionBuffer(frameTime);
          const blendModeLayers = getActiveBlendModeLayers(frameTime) ?? [];
          for (const layer of blendModeLayers) {
            blendOverlayWithModeInPlace(
              frame,
              videoResolution.width,
              videoResolution.height,
              layer.buffer,
              layer.width,
              layer.height,
              overlayX,
              overlayY,
              layer.mode,
            );
          }
          if (captionBuffer) {
            blendOverlayInPlace(
              frame,
              videoResolution.width,
              videoResolution.height,
              captionBuffer,
              captionFrameSize.width,
              captionFrameSize.height,
              overlayX,
              overlayY,
            );
          }

          await writeToStdin(bridge, frame);
        }
      }
      // No more frames are coming. End the bridge so process B's stdin
      // closes and the encoder can finalize the output file.
      bridge.end();
    },
  });

  await Promise.all([decodePromise, encodePromise]);
}
