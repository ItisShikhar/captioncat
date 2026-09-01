import type { CaptionLayoutOverride } from './entity-system/caption-layout';
import type { CaptionPresetSource } from './presets/registry';
import type { CaptionPresetTiming } from './presets/preset-document';

export enum TranscriptionProviderName {
  OpenAI = 'openai',
  ElevenLabs = 'elevenlabs',
  Sarvam = 'sarvam',
}

export interface TranscriptionProvider {
  provider: TranscriptionProviderName;
  apiKey?: string;
  language?: string;
  options?: Record<string, unknown>;
}

export interface WordTiming {
  text: string;
  start: number;
  end: number;
  speakerId?: string;
}

export interface TranscriptEntry {
  text: string;
  start: number;
  end: number;
  words?: WordTiming[];
  speakerId?: string;
  speakerLabel?: string;
}

export interface VideoEncodingSettings {
  /** FFmpeg encoder preset. Defaults to `superfast` for H.264 and H.265. */
  preset?: string;
  /** Constant rate factor. Defaults to `21` for H.264 and H.265. */
  crf?: number;
}

export interface CanvasSize {
  width: number;
  height: number;
}

export interface CaptionCanvasOutput {
  /** Caption-only outputs currently render with transparency. */
  background?: 'transparent';
}

export interface PngSequenceOutput extends CaptionCanvasOutput {
  directory: string;
}

export interface StandaloneCaptionMovieOutput extends CaptionCanvasOutput {
  path: string;
}

export interface OverlayVideoOutput {
  path: string;
  encoding?: VideoEncodingSettings;
  /** Selects the input-video compositor. */
  pipeline?: 'ffmpeg-compositor' | 'skia-compositor';
}

export interface RenderVisualOutputs {
  pngSequence?: PngSequenceOutput;
  standaloneCaptionMovie?: StandaloneCaptionMovieOutput;
  overlayVideo?: OverlayVideoOutput;
}

export interface TranscriptOutput {
  json?: string;
}

export interface CaptionOutputs {
  ass?: string;
  srt?: string;
  vtt?: string;
}

export interface RenderSettings {
  /**
   * Per-render overrides for preset timing. Omitted values use the preset
   * timing, or the engine default when the preset omits them.
   */
  timing?: Partial<CaptionPresetTiming>;
  /**
   * Per-render overrides for preset-wide caption layout. Omitted values use
   * the preset caption layout.
   */
  captionLayout?: CaptionLayoutOverride;
}

export interface RequestExports {
  transcript?: TranscriptOutput;
  captions?: CaptionOutputs;
}

export interface RenderSpec {
  preset: CaptionPresetSource;
  language?: string;
  /**
   * Caption layout canvas size. When omitted, input.video dimensions are used;
   * audio-only requests must provide this value. Caption-only outputs use a
   * stable tight crop, and overlay video uses the input-video dimensions.
   */
  canvasSize?: CanvasSize;
  /** Optional per-render overrides for preset-wide settings. */
  settings?: RenderSettings;
  /** Caption frame rate. Input-video renders use the source frame rate by default. */
  fps?: number;
  outputs: RenderVisualOutputs;
}

export interface RenderDebugConfig {
  bounds?: boolean;
  labels?: boolean;
  position?: boolean;
  paddingBounds?: boolean;
}

export interface RenderedVisualOutputs {
  pngSequence?: { directory: string };
  standaloneCaptionMovie?: { path: string };
  overlayVideo?: { path: string };
}

export interface RenderResult {
  transcript?: TranscriptOutput;
  captions?: CaptionOutputs;
  renders?: Array<{
    preset: CaptionPresetSource;
    outputs: RenderedVisualOutputs;
  }>;
}

export interface TranscriptionProviderAdapter {
  name: TranscriptionProviderName;
  transcribe(input: string, provider: TranscriptionProvider): Promise<TranscriptEntry[]>;
}

export interface RenderRequest {
  input?: {
    video?: string | Uint8Array;
    audio?: string | Uint8Array;
    captions?: string | Uint8Array;
    transcript?: TranscriptEntry[];
  };
  transcription?: {
    providers?: TranscriptionProvider[];
  };
  debug?: RenderDebugConfig;
  exports?: RequestExports;
  renders?: RenderSpec[];
}

export interface CaptionEngine {
  render(request: RenderRequest): Promise<RenderResult>;
  transcribe(input: string, providers?: TranscriptionProvider[]): Promise<TranscriptEntry[]>;
}
