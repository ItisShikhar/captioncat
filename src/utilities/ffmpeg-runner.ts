import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { spawn, type StdioOptions } from 'node:child_process';
import type { Readable } from 'node:stream';

function getFfmpegBinary(): string {
  return process.env.FFMPEG_PATH || ffmpegStatic || 'ffmpeg';
}

function getFfprobeBinary(): string {
  const ffprobeBinary = (ffprobeStatic as { path?: string }).path || process.env.FFPROBE_PATH;
  return ffprobeBinary || 'ffprobe';
}

function isWritableInputPipe(value: unknown): value is NodeJS.WritableStream {
  return (
    typeof value === 'object' &&
    value !== null &&
    'write' in value &&
    typeof value.write === 'function' &&
    'end' in value &&
    typeof value.end === 'function'
  );
}

export interface RunProcessOptions {
  cwd?: string;
  /**
 * When provided, the child process's stdin is opened as a pipe and this
 * callback is invoked with the writable stream so the caller can stream
 * arbitrary input, for example raw video frames, directly into the process.
 * The callback must resolve after it writes all input. The function then closes stdin.
 */
  writeStdin?: (stdin: NodeJS.WritableStream) => Promise<void>;
  /**
 * When provided, the child process's stdout is treated as an opaque
 * binary stream, for example raw video frames, and handed to this callback
 * instead of being buffered/stringified. Use this whenever stdout can
 * contain non-UTF8 binary data - accumulating it as a string (the
 * default behavior) can corrupt or OOM on large binary payloads.
 */
  consumeStdout?: (stdout: Readable) => Promise<void>;
  /**
   * When provided, opens the requested number of writable input pipes. The
   * callback receives stdin first, followed by the additional pipes.
   */
  writeInputPipes?: {
    count: number;
    write: (pipes: readonly NodeJS.WritableStream[]) => Promise<void>;
  };
}

/**
 * Writes a chunk to a writable stream and awaits backpressure ('drain')
 * before returning, so a fast producer cannot unboundedly grow the stream's
 * internal buffer while piping many frames into a slower consumer (ffmpeg).
 */
export async function writeToStdin(stdin: NodeJS.WritableStream, chunk: Buffer): Promise<void> {
  const canWriteMore = stdin.write(chunk);
  if (!canWriteMore) {
    await new Promise<void>((resolve, reject) => {
      // Whichever fires first, remove both listeners so they do not accumulate
      // dangling 'error'/'drain' handlers across the many backpressure waits
      // that happen while piping hundreds of frames into a single stream.
      const onDrain = () => {
        stdin.off('error', onError);
        resolve();
      };
      const onError = (err: Error) => {
        stdin.off('drain', onDrain);
        reject(err);
      };
      stdin.once('drain', onDrain);
      stdin.once('error', onError);
    });
  }
}

function runProcess(
  binary: string,
  args: string[],
  options?: RunProcessOptions,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const inputPipeCount = options?.writeInputPipes?.count ?? (options?.writeStdin ? 1 : 0);
    if (options?.writeInputPipes && options.writeStdin) {
      reject(new Error('Specify writeInputPipes or writeStdin, not both.'));
      return;
    }
    if (options?.writeInputPipes && (!Number.isInteger(inputPipeCount) || inputPipeCount < 1)) {
      reject(new Error('writeInputPipes.count must be a positive integer.'));
      return;
    }
    const stdio: StdioOptions = [
      inputPipeCount > 0 ? 'pipe' : 'ignore',
      'pipe',
      'pipe',
      ...Array.from({ length: Math.max(0, inputPipeCount - 1) }, () => 'pipe' as const),
    ];
    const child = spawn(binary, args, {
      cwd: options?.cwd,
      stdio,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    let consumeStdoutError: Error | undefined;

    const finish = (code: number | null) => {
      if (settled) {
        return;
      }
      settled = true;
      if (consumeStdoutError) {
        reject(consumeStdoutError);
        return;
      }
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(`Command failed with exit code ${code}: ${stderr || stdout}`.trim()));
    };

    if (options?.consumeStdout) {
      // Binary-safe path: hand the raw stream to the caller instead of
      // accumulating/stringifying it, which corrupts raw frame data.
      options.consumeStdout(child.stdout!).catch((err) => {
        consumeStdoutError = err instanceof Error ? err : new Error(String(err));
        child.kill();
      });
    } else {
      child.stdout!.on('data', (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });
    }

    child.stderr!.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      finish(code);
    });

    if (options?.writeInputPipes) {
      const rawInputPipes = [
        child.stdin,
        ...child.stdio.slice(3, inputPipeCount + 2),
      ];
      if (!rawInputPipes.every(isWritableInputPipe)) {
        child.kill();
        reject(new Error('FFmpeg input pipes did not open as writable streams.'));
        return;
      }
      const inputPipes = rawInputPipes as NodeJS.WritableStream[];
      options.writeInputPipes.write(inputPipes).then(
        () => {
          for (const pipe of inputPipes) {
            pipe.end();
          }
        },
        (err) => {
          // Do not leave the child process hanging on a stdin that will never
          // receive more data or be closed if the writer callback throws.
          for (const pipe of inputPipes) {
            const closablePipe = pipe as NodeJS.WritableStream & { destroy?: () => void };
            if (closablePipe.destroy) {
              closablePipe.destroy();
            } else {
              pipe.end();
            }
          }
          child.kill();
          reject(err instanceof Error ? err : new Error(String(err)));
        },
      );
    } else if (options?.writeStdin) {
      const stdin = child.stdin!;
      options.writeStdin(stdin).then(
        () => {
          stdin.end();
        },
        (err) => {
          // Do not leave the child process hanging on a stdin that will never
          // receive more data or be closed if the writer callback throws.
          stdin.destroy();
          child.kill();
          reject(err instanceof Error ? err : new Error(String(err)));
        },
      );
    }
  });
}

export async function runFfmpeg(args: string[], options?: RunProcessOptions): Promise<void> {
  const binary = getFfmpegBinary();
  await runProcess(binary, args, options);
}

export async function runFfprobe(args: string[], options?: { cwd?: string }): Promise<string> {
  const binary = getFfprobeBinary();
  const { stdout } = await runProcess(binary, args, options);
  return stdout;
}

/** Parses ffprobe's `r_frame_rate` fraction string (e.g. "24000/1001") into a float. */
function parseFrameRateFraction(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const [numeratorRaw, denominatorRaw] = value.split('/');
  const numerator = Number(numeratorRaw);
  const denominator = denominatorRaw === undefined ? 1 : Number(denominatorRaw);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return undefined;
  }
  const fps = numerator / denominator;
  return Number.isFinite(fps) && fps > 0 ? fps : undefined;
}

/** Treated as "not specified" ffprobe placeholder values. */
const UNSPECIFIED_COLOR_METADATA = new Set(['unknown', 'unspecified', 'reserved']);

function normalizeColorField(value: string | undefined): string | undefined {
  return value && !UNSPECIFIED_COLOR_METADATA.has(value) ? value : undefined;
}

export async function probeVideoMetadata(inputPath: string): Promise<{
  width: number;
  height: number;
  duration?: number | undefined;
  videoDuration?: number | undefined;
  videoFrameCount?: number | undefined;
  fps?: number | undefined;
  /** ffprobe's video stream `codec_name` (e.g. `h264`, `hevc`, `vp9`, `prores`). */
  videoCodec?: string | undefined;
  /** ffprobe's video stream `pix_fmt` (e.g. `yuv420p`, `yuv420p10le`). */
  pixFmt?: string | undefined;
  colorSpace?: string | undefined;
  colorPrimaries?: string | undefined;
  colorTransfer?: string | undefined;
  /** ffprobe's container `format_name` (e.g. `mov,mp4,m4a,3gp,3g2,mj2`). */
  containerFormat?: string | undefined;
  /** Container metadata tags copied to the output video. */
  formatTags?: Record<string, string>;
}> {
  const output = await runFfprobe([
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height,duration,nb_frames,r_frame_rate,codec_name,pix_fmt,color_space,color_primaries,color_transfer:format=duration,format_name:format_tags',
    '-of',
    'json',
    inputPath,
  ]);

  const parsed = JSON.parse(output) as {
    streams?: Array<{
      width?: number;
      height?: number;
      duration?: string;
      nb_frames?: string;
      r_frame_rate?: string;
      codec_name?: string;
      pix_fmt?: string;
      color_space?: string;
      color_primaries?: string;
      color_transfer?: string;
    }>;
    format?: { duration?: string; format_name?: string; tags?: Record<string, string> };
  };
  const stream = parsed.streams?.[0];
  if (!stream?.width || !stream?.height) {
    throw new Error(`Unable to probe video dimensions for ${inputPath}`);
  }

  const duration = Number(parsed.format?.duration);
  const videoDuration = Number(stream.duration);
  const videoFrameCount = Number(stream.nb_frames);
  const fps = parseFrameRateFraction(stream.r_frame_rate);
  return {
    width: stream.width,
    height: stream.height,
    ...(Number.isFinite(duration) && duration >= 0 ? { duration } : {}),
    ...(Number.isFinite(videoDuration) && videoDuration >= 0 ? { videoDuration } : {}),
    ...(Number.isInteger(videoFrameCount) && videoFrameCount > 0 ? { videoFrameCount } : {}),
    ...(fps !== undefined ? { fps } : {}),
    ...(stream.codec_name ? { videoCodec: stream.codec_name } : {}),
    ...(stream.pix_fmt ? { pixFmt: stream.pix_fmt } : {}),
    ...(normalizeColorField(stream.color_space) ? { colorSpace: normalizeColorField(stream.color_space) } : {}),
    ...(normalizeColorField(stream.color_primaries)
      ? { colorPrimaries: normalizeColorField(stream.color_primaries) }
      : {}),
    ...(normalizeColorField(stream.color_transfer)
      ? { colorTransfer: normalizeColorField(stream.color_transfer) }
      : {}),
    ...(parsed.format?.format_name ? { containerFormat: parsed.format.format_name } : {}),
    ...(parsed.format?.tags ? { formatTags: parsed.format.tags } : {}),
  };
}
