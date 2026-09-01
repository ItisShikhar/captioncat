/**
 * Matches the input codec and container by default. The explicit `preset` and
 * `crf` values are applied to codecs that support those options. Captions are
 * always re-encoded and are never copied directly from the input.
 */
/** Subset of `probeVideoMetadata`'s result used to resolve encode settings. */
export interface ProbedVideoFormat {
  videoCodec?: string | undefined;
  pixFmt?: string | undefined;
  colorSpace?: string | undefined;
  colorPrimaries?: string | undefined;
  colorTransfer?: string | undefined;
}

export interface ResolvedVideoEncodeSettings {
  /** ffmpeg `-c:v` value, e.g. `'libx264'`, `'libx265'`, `'libvpx-vp9'`. */
  videoCodec: string;
  /** Codec-specific quality/effort flags (preset/crf/profile), excluding `-c:v` and `-pix_fmt`. */
  videoArgs: string[];
  /** ffmpeg `-pix_fmt` value. */
  pixFmt: string;
  /** Color metadata flags (`-color_primaries`/`-color_trc`/`-colorspace`), or `[]` if unknown. */
  colorArgs: string[];
  /** Container-specific output flags, e.g. `['-movflags', '+faststart']`. */
  containerArgs: string[];
  /** File extension (including the dot) matching this container, e.g. `'.mp4'`. */
  outputExtension: string;
  /** Audio codec to use only when a filter (volume/mix) forces a re-encode instead of a stream copy. */
  reencodeAudioCodec: string;
  /** Extra args (e.g. bitrate) for `reencodeAudioCodec`. */
  reencodeAudioArgs: string[];
}

const DEFAULT_VIDEO_PRESET = 'superfast';
const DEFAULT_VIDEO_CRF = 21;
const MP4_AUDIO_ARGS = ['-b:a', '320k'];

function mp4Container(): { outputExtension: string; containerArgs: string[] } {
  return { outputExtension: '.mp4', containerArgs: ['-movflags', '+faststart'] };
}

/**
 * Pixel formats libx264 (and most other encoders used here) can safely
 * re-encode into as-is. Anything else (unusual/exotic subsampling, or an
 * unprobeable source) falls back to standard 8-bit 4:2:0.
 */
const SAFE_PIX_FMTS = new Set(['yuv420p', 'yuv422p', 'yuv444p', 'yuv420p10le', 'yuv422p10le', 'yuv444p10le']);
/** Deprecated full-range aliases of the standard formats above. */
const JPEG_RANGE_PIX_FMT_ALIASES: Record<string, string> = {
  yuvj420p: 'yuv420p',
  yuvj422p: 'yuv422p',
  yuvj444p: 'yuv444p',
};

function resolvePixFmt(inputPixFmt?: string): string {
  if (!inputPixFmt) {
    return 'yuv420p';
  }
  const normalized = JPEG_RANGE_PIX_FMT_ALIASES[inputPixFmt] ?? inputPixFmt;
  return SAFE_PIX_FMTS.has(normalized) ? normalized : 'yuv420p';
}

function resolveColorArgs(input: ProbedVideoFormat): string[] {
  const args: string[] = [];
  if (input.colorPrimaries) {
    args.push('-color_primaries', input.colorPrimaries);
  }
  if (input.colorTransfer) {
    args.push('-color_trc', input.colorTransfer);
  }
  if (input.colorSpace) {
    args.push('-colorspace', input.colorSpace);
  }
  return args;
}

function resolveH264Settings(preset: string, crf: number, pixFmt: string, colorArgs: string[]) {
  return {
    videoCodec: 'libx264',
    videoArgs: ['-preset', preset, '-crf', String(crf)],
    pixFmt,
    colorArgs,
    ...mp4Container(),
    reencodeAudioCodec: 'aac',
    reencodeAudioArgs: MP4_AUDIO_ARGS,
  };
}

/**
 * `'match-input'` codec and container mapping. It covers codecs supported by the bundled ffmpeg binary.
 */
function resolveMatchInputSettings(
  input: ProbedVideoFormat,
  preset = DEFAULT_VIDEO_PRESET,
  crf = DEFAULT_VIDEO_CRF,
): ResolvedVideoEncodeSettings {
  const pixFmt = resolvePixFmt(input.pixFmt);
  const colorArgs = resolveColorArgs(input);

  switch (input.videoCodec) {
    case 'hevc':
      return {
        videoCodec: 'libx265',
        // '-tag:v hvc1' keeps HEVC-in-mp4 playable in QuickTime/Apple players.
        // x265's CRF scale reaches similar perceived quality ~4 points higher
        // than x264's, so 20 (not 16) targets the same visually-lossless bar.
        videoArgs: ['-preset', preset, '-crf', String(crf), '-tag:v', 'hvc1'],
        pixFmt,
        colorArgs,
        outputExtension: '.mp4',
        containerArgs: ['-movflags', '+faststart'],
        reencodeAudioCodec: 'aac',
        reencodeAudioArgs: MP4_AUDIO_ARGS,
      };
    case 'vp9':
      return {
        videoCodec: 'libvpx-vp9',
        videoArgs: ['-b:v', '0', '-crf', '18', '-cpu-used', '1', '-row-mt', '1'],
        pixFmt,
        colorArgs,
        outputExtension: '.webm',
        containerArgs: [],
        reencodeAudioCodec: 'libopus',
        reencodeAudioArgs: ['-b:a', '256k'],
      };
    case 'vp8':
      return {
        videoCodec: 'libvpx',
        videoArgs: ['-b:v', '0', '-crf', '10'],
        pixFmt,
        colorArgs,
        outputExtension: '.webm',
        containerArgs: [],
        reencodeAudioCodec: 'libvorbis',
        reencodeAudioArgs: ['-b:a', '320k'],
      };
    case 'prores':
      return {
        videoCodec: 'prores_ks',
        // Profile 3 ("HQ") is ProRes's high-fidelity 4:2:2 tier. There is no
        // CRF equivalent for ProRes. The profile controls quality.
        videoArgs: ['-profile:v', '3'],
        pixFmt: pixFmt.startsWith('yuv422') || pixFmt.startsWith('yuv444') ? pixFmt : 'yuv422p10le',
        colorArgs,
        outputExtension: '.mov',
        containerArgs: [],
        reencodeAudioCodec: 'pcm_s16le',
        reencodeAudioArgs: [],
      };
    case 'av1':
      return {
        videoCodec: 'libaom-av1',
        videoArgs: ['-crf', '20', '-b:v', '0', '-cpu-used', '4', '-row-mt', '1'],
        pixFmt,
        colorArgs,
        outputExtension: '.mkv',
        containerArgs: [],
        reencodeAudioCodec: 'libopus',
        reencodeAudioArgs: ['-b:a', '256k'],
      };
    default:
      // h264, or an unrecognized/unsupported source codec: use the default
      // H.264 fallback settings.
      return resolveH264Settings(preset, crf, pixFmt, colorArgs);
  }
}

/**
 * Resolves the concrete ffmpeg codec/quality/container settings to use for
 * the composited output video, given the requested encoder settings and the
 * source video's probed codec/pixel-format/color metadata (pass `{}` if
 * unavailable, e.g. for the synthetic solid-color background used by the
 * caption movie output).
 */
export function resolveVideoEncodeSettings(
  settings: { preset?: string; crf?: number } | undefined,
  input: ProbedVideoFormat = {},
): ResolvedVideoEncodeSettings {
  return resolveMatchInputSettings(input, settings?.preset, settings?.crf);
}
