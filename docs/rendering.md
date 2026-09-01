# Rendering

_Reference: [Entity Component System (ECS)](https://en.wikipedia.org/wiki/Entity_component_system)_

captioncat turns timed captions into video, transparent caption media, or
subtitle and transcript files. One render entry can create several outputs from
the same caption design.

See [Effects and components](effects-and-components.md) for the public
component and effect reference.

## What captioncat can render

| Output                    | Result                                                          |
| ------------------------- | --------------------------------------------------------------- |
| `overlayVideo`            | Captions composited over the input video                        |
| `pngSequence`             | One transparent PNG frame for each caption frame                |
| `standaloneCaptionMovie`  | A transparent standalone caption movie for external compositing |
| `exports.captions.ass`    | An ASS subtitle file                                            |
| `exports.captions.srt`    | An SRT subtitle file                                            |
| `exports.captions.vtt`    | A WebVTT subtitle file                                          |
| `exports.transcript.json` | Transcript data in JSON format                                  |

Visual outputs belong inside a `renders` entry. Subtitle and transcript files
belong inside request-level `exports`.

`overlayVideo` uses the input video's width, height, and frame rate. The
`renders[].canvasSize` value controls caption layout. If `input.video` is
present, an omitted `canvasSize` uses the source video dimensions.
Audio-only requests must provide `renders[].canvasSize` for each PNG sequence or
standalone caption movie.
PNG sequences and standalone caption movies always use one stable tight crop
around the visible caption content.

## Examples

Use [Getting started](getting-started.md) for short examples that show how to:

- render a captioned video;
- create transparent caption media from audio;
- create several outputs from one caption design;
- render several caption designs from one transcript;
- use a custom preset; and
- enable debug guides.

This page defines the request contract and describes the engine behavior.

## Input sources

Choose the highest-priority source that is already available:

| Source             | Use                                                               |
| ------------------ | ----------------------------------------------------------------- |
| `input.transcript` | Prepared `TranscriptEntry[]`; no parsing or provider request      |
| `input.captions`   | Local, remote, or in-memory JSON, SRT, VTT, or ASS captions       |
| `input.video`      | Overlay source, dimensions, frame rate, and fallback audio source |
| `input.audio`      | Audio source for transcription when no video audio is available   |

The priority is `input.transcript`, then `input.captions`, then transcription
from `input.video` or `input.audio`. An empty transcript array is treated as
omitted. If both video and audio are provided, the video remains the visual
source and the separate audio supplies transcription input.

## Debug rendering

Set request-level debug fields to burn selected guides into rendered caption
frames, PNG sequences, standalone caption movies, or overlay videos. Available guides are
<kbd>bounds</kbd>, <kbd>labels</kbd>, <kbd>position</kbd>, and
<kbd>paddingBounds</kbd>. Debug guides are disabled when `debug` is omitted.

| Field                 | Guide drawn                         | Default |
| --------------------- | ----------------------------------- | ------- |
| `debug.bounds`        | Resolved entity bounds              | `false` |
| `debug.labels`        | Entity identifiers and debug labels | `false` |
| `debug.position`      | Resolved position guides            | `false` |
| `debug.paddingBounds` | Entity padding bounds               | `false` |

See [Debug output](getting-started.md#debug-output) for a complete request.

> [!TIP]
> Debug guides help diagnose layout. Leave them disabled for production output.

## Render request

`captionCatEngine.render()` accepts one `RenderRequest`. The request separates input
sources, transcription providers, export files, and visual renders.

```ts
type CaptionPresetSource = CaptionPresetName | EcsCaptionPreset | { file: string } | { url: string };

interface RenderRequest {
  input?: {
    video?: string | Uint8Array;
    audio?: string | Uint8Array;
    captions?: string | Uint8Array;
    transcript?: TranscriptEntry[];
  };
  transcription?: {
    providers?: TranscriptionProvider[];
  };
  debug?: {
    bounds?: boolean;
    labels?: boolean;
    position?: boolean;
    paddingBounds?: boolean;
  };
  exports?: {
    transcript?: { json?: string };
    captions?: { ass?: string; srt?: string; vtt?: string };
  };
  renders?: Array<{
    preset: CaptionPresetSource;
    language?: string;
    settings?: {
      timing?: {
        captionHoldThresholdSeconds?: number;
      };
      captionLayout?: CaptionLayoutOverride;
    };
    fps?: number;
    outputs: {
      pngSequence?: {
        directory: string;
        size?: { width: number; height: number };
        background?: 'transparent';
      };
      standaloneCaptionMovie?: {
        path: string;
        size?: { width: number; height: number };
        background?: 'transparent';
      };
      overlayVideo?: {
        path: string;
        encoding?: { preset?: string; crf?: number };
        pipeline?: 'ffmpeg-compositor' | 'skia-compositor';
      };
    };
  }>;
}
```

## Render request property reference

The following sections follow the order in `RenderRequest`. Each section states the property type, purpose, default, and behavior when the
property is omitted.
The `<kbd>OPTIONAL</kbd>` badge after a property name marks a property that you
can omit.
Top-level properties are separated and grouped in collapsible sections.

### `CaptionPresetSource`

`CaptionPresetSource` identifies the preset for one visual render. It accepts
one of these values:

- A bundled `CaptionPresetName`.
- An inline `EcsCaptionPreset` object.
- `{ file: string }` for a local JSON file.
- `{ url: string }` for an HTTP(S) JSON file.

There is no default preset. Each entry in `renders` must provide `preset`.

<hr>

### `input` <kbd>OPTIONAL</kbd>

<details>
<summary>Show input properties</summary>

`input` contains the media and transcript sources for the request. It is
optional in the type, but rendering needs at least one transcript source.

If the request omits every input source, the engine cannot find a transcript and
returns an error.

#### `input.video` <kbd>OPTIONAL</kbd>

`input.video` accepts a local file path, an HTTP(S) URL, or a `Uint8Array`. The
engine uses it as the source for an overlay video and extracts its audio when
transcription needs it.

There is no default. If it is omitted, `overlayVideo` cannot render, but
caption-only outputs can still use captions, a transcript, or `input.audio`.

#### `input.audio` <kbd>OPTIONAL</kbd>

`input.audio` accepts a local file path, an HTTP(S) URL, or a `Uint8Array`. The
engine uses it as an audio source for transcription and overlay video
composition.

There is no default. If it is omitted and `input.video` is present, the engine
extracts audio from the video for transcription.

#### `input.captions` <kbd>OPTIONAL</kbd>

`input.captions` accepts a local file path, an HTTP(S) URL, or a `Uint8Array`.
The engine parses the source into transcript entries.

There is no default. The engine supports `json`, `srt`, `vtt`, and `ass` input
formats. It uses this source after `input.transcript` and before transcription.

#### `input.transcript` <kbd>OPTIONAL</kbd>

`input.transcript` accepts prepared `TranscriptEntry[]` data. The engine uses
this data without calling a transcription provider.

There is no default. An empty array is treated as omitted. Prepared transcript
entries have priority over captions and provider transcription.

</details>

<hr>

### `transcription` <kbd>OPTIONAL</kbd>

<details>
<summary>Show transcription properties</summary>

`transcription` contains the providers that the engine can use when no
transcript or caption source is available.

If it is omitted, the engine uses the transcription settings from the engine
configuration. If neither level provides providers, transcription cannot run.

#### `transcription.providers` <kbd>OPTIONAL</kbd>

`transcription.providers` is an ordered array of `TranscriptionProvider`
objects. The engine tries entries in array order and uses the first successful
provider.

If it is omitted, the engine uses the configured provider array. If no array is
available, the engine reports an error when transcription is required.

#### `transcription.providers[].provider`

`provider` selects the adapter with a `TranscriptionProviderName` value:
`OpenAI`, `ElevenLabs`, or `Sarvam`.

There is no default. An entry without a supported provider name cannot run and
the engine continues to the next provider.

#### `transcription.providers[].apiKey` <kbd>OPTIONAL</kbd>

`apiKey` supplies the credential for the selected provider. The provider
environment variable is used when this property is omitted.

There is no value default in the request. If both values are missing or empty,
the engine skips the provider and tries the next entry.

#### `transcription.providers[].language` <kbd>OPTIONAL</kbd>

`language` sends a language hint to the selected provider. The value uses the
provider API language format.

There is no engine-wide default. When omitted, the provider can detect the
language; Sarvam receives its adapter default of `unknown`.

#### `transcription.providers[].options` <kbd>OPTIONAL</kbd>

`options` contains provider-specific request fields, such as timestamp,
response-format, prompt, or diarization settings.

There is no engine-wide default shape. When omitted, each adapter applies its
own request defaults.

Known adapter options are:

- OpenAI accepts `timestamp_granularities`, `response_format`, and `prompt`.
  Word timestamps and `verbose_json` are the defaults.
- ElevenLabs accepts `timestamp_granularities`, `response_format`, `prompt`, and
  `temperature`. Word and segment timestamps with `json` are the defaults.
- Sarvam accepts `withDiarization`, `numSpeakers`, and `inputAudioCodec`.
  `withDiarization` defaults to `true`.

</details>

<hr>

### `debug` <kbd>OPTIONAL</kbd>

<details>
<summary>Show debug properties</summary>

`debug` enables selected guides in all visual outputs for the request. All
guides are disabled when `debug` is omitted. See [Debug rendering](#debug-rendering)
for the option table and example.

</details>

<hr>

### `exports` <kbd>OPTIONAL</kbd>

<details>
<summary>Show export properties</summary>

`exports` contains request-level transcript and subtitle exports. These files
are written once for the request, not once for each entry in `renders`.

When `exports` is omitted, the engine writes no request-level export files.

#### `exports.transcript` <kbd>OPTIONAL</kbd>

`exports.transcript` configures transcript exports. It currently contains the
`json` output path.

When it is omitted, the engine writes no transcript export.

#### `exports.transcript.json` <kbd>OPTIONAL</kbd>

`json` is the output path for the transcript JSON file. The engine resolves the
path and writes the resolved transcript data.

There is no default path. When it is omitted, no JSON transcript file is
written.

#### `exports.captions` <kbd>OPTIONAL</kbd>

`exports.captions` configures subtitle exports in ASS, SRT, or WebVTT format.

When it is omitted, the engine writes no subtitle export.

#### `exports.captions.ass` <kbd>OPTIONAL</kbd>

`ass` is the output path for an ASS subtitle file. There is no default path.
When it is omitted, the engine writes no ASS file.

#### `exports.captions.srt` <kbd>OPTIONAL</kbd>

`srt` is the output path for an SRT subtitle file. There is no default path.
When it is omitted, the engine writes no SRT file.

#### `exports.captions.vtt` <kbd>OPTIONAL</kbd>

`vtt` is the output path for a WebVTT subtitle file. There is no default path.
When it is omitted, the engine writes no WebVTT file.

</details>

<hr>

### `renders` <kbd>OPTIONAL</kbd>

<details>
<summary>Show render properties</summary>

`renders` is an array of visual render entries. Each entry can create a PNG
sequence, a standalone caption movie, an overlay video, or several outputs.

When `renders` is omitted or empty, the engine creates no visual outputs.

#### `renders[]`

Each entry resolves one preset and applies its render settings to that entry's
visual outputs. The engine loads the preset once and reuses it for those
outputs.

There is no default entry. An entry must provide `preset` and at least one
visual output.

#### `renders[].preset`

`preset` selects the ECS preset for the entry. Use a bundled name, an inline
object, a local file source, or a URL source.

The TypeScript type requires this property. At runtime, an omitted value uses
`CaptionPreset.Punch` as the loader default.

#### `renders[].settings` <kbd>OPTIONAL</kbd>

`settings` overrides preset-wide timing and caption layout values for one render
entry. The preset still provides the base settings.

The engine merges each nested property separately. An omitted property keeps the
value from the preset. If the preset also omits a value, the engine uses its
default.

The override does not mutate the preset document. The same preset can therefore
be reused by multiple render entries with different settings.

```ts
{
  preset: CaptionPreset.Punch,
  settings: {
    timing: {
      captionHoldThresholdSeconds: 0.5,
    },
    captionLayout: {
      textDirection: 'ltr',
      rowsPerPage: {
        mode: 'fixed',
        count: 2,
      },
      wordsPerRow: {
        mode: 'auto',
      },
      horizontalFit: 'fill-width',
      breaking: {
        smartBreaks: 'custom',
        rowBreakPauseThresholdSeconds: 0.3,
        pageBreakPauseThresholdSeconds: 2.5,
        longWordThresholdMode: 'automatic',
        longWordThresholdSeconds: 0.75,
        breakPriorities: {
          rows: [
            { id: 'source', mode: 'always' },
            { id: 'punctuation', mode: 'prefer' },
            { id: 'pause', mode: 'always' },
            { id: 'word-count', mode: 'required' },
            { id: 'width', mode: 'required' },
            { id: 'long-word', mode: 'required' },
          ],
          pages: [
            { id: 'source', mode: 'off' },
            { id: 'punctuation', mode: 'off' },
            { id: 'pause', mode: 'always' },
            { id: 'row-count', mode: 'required' },
            { id: 'height', mode: 'required' },
          ],
        },
        wordWrapping: {
          mode: 'wrap',
          breakCharacters: ['-'],
          breakMarker: '-',
        },
        sentenceEndings: ['.', '!', '?', '।', '॥', '。', '！', '？'],
        strongPunctuation: [';', ':', '…', '；', '：', '……'],
        additionalCharacters: [],
        sourceLineBreaks: 'preserve',
        pauseSpacing: {
          enabled: true,
          thresholdSeconds: 0.8,
          extraSpacing: 32,
          maxExtraSpacing: 64,
        },
      },
    },
  },
  canvasSize: { width: 1080, height: 1920 },
  outputs: {
    pngSequence: {
      directory: 'output/punch/frames',
    },
  },
}
```

#### `renders[].canvasSize` <kbd>OPTIONAL</kbd>

`canvasSize` sets the width and height used for caption layout. Both values must
be positive integers.

When `input.video` is present and `canvasSize` is omitted, the engine uses the
video dimensions. When no video is present, `canvasSize` is required for PNG
sequences and standalone caption movies.

An overlay video always uses the input-video dimensions for layout and output.
The render-level `canvasSize` does not change an overlay video.

```ts
{
  canvasSize: { width: 1080, height: 1920 },
  outputs: {
    pngSequence: {
      directory: 'output/punch/frames',
    },
  },
}
```

For example, this smaller override changes only the horizontal fit. All other
timing, layout, and breaking values come from the selected preset:

```ts
settings: {
  captionLayout: {
    horizontalFit: 'shrink-to-fit',
  },
}
```

#### `renders[].language` <kbd>OPTIONAL</kbd>

`language` supplies the BCP-47 language hint for text segmentation and text
direction resolution.

When it is omitted, the engine uses the first configured provider language when
available. Otherwise, text segmentation and direction use runtime defaults.

#### `renders[].settings.timing` <kbd>OPTIONAL</kbd>

`timing` applies timing overrides to the selected preset. Omitted values use the
preset timing, followed by the engine default.

#### `renders[].settings.timing.captionHoldThresholdSeconds` <kbd>OPTIONAL</kbd>

`captionHoldThresholdSeconds` keeps the previous caption across a short gap. It
must be a finite number greater than or equal to zero.

The preset value is used when this property is omitted. The engine default is
`1` second when both the render settings and preset omit it.

#### `renders[].settings.captionLayout` <kbd>OPTIONAL</kbd>

`captionLayout` applies a partial `CaptionLayoutOverride` to the selected
preset. It includes text direction, page and row limits, flow participation,
horizontal fitting, breaking, pause spacing, wrapping, Smart Breaks, and break
priorities.

The override merges with the preset and does not change the preset document.
Omitted nested values use the corresponding preset values.

#### `renders[].fps` <kbd>OPTIONAL</kbd>

`fps` sets the caption frame rate. It must be a finite number greater than zero.

Overlay video uses the source video's frame rate, or `30` when it is
unavailable. PNG sequences and standalone caption movies default to `30`.

#### `renders[].outputs`

`renders[].outputs` selects the visual files for one render entry. It accepts
`pngSequence`, `standaloneCaptionMovie`, `overlayVideo`, or any combination of them.

There is no default. The engine returns an error when the object is missing or
contains no visual output.

#### `renders[].outputs.pngSequence` <kbd>OPTIONAL</kbd>

`pngSequence` writes one PNG file for each generated caption frame. It requires
`directory`.

When it is omitted, the entry writes no PNG sequence.

#### `renders[].outputs.pngSequence.directory`

`directory` is the output directory for the PNG files. The engine creates the
directory when needed.

There is no default path. The property is required when `pngSequence` is used.

#### `renders[].outputs.pngSequence.background` <kbd>OPTIONAL</kbd>

`background` accepts only `transparent`. Caption-only PNG output uses
transparency.

The default is `transparent`. When it is omitted, the output remains
transparent.

#### `renders[].outputs.standaloneCaptionMovie` <kbd>OPTIONAL</kbd>

`standaloneCaptionMovie` writes a transparent standalone caption movie for
external compositing. It requires `path`.

When it is omitted, the entry writes no standalone caption movie.

#### `renders[].outputs.standaloneCaptionMovie.path`

`path` is the output path for the standalone caption movie. The engine resolves
the path and writes the generated movie there.

There is no default path. The property is required when
`standaloneCaptionMovie` is used.

#### `renders[].outputs.standaloneCaptionMovie.background` <kbd>OPTIONAL</kbd>

`background` accepts only `transparent`. Standalone caption movies use
transparency for external compositing.

The default is `transparent`. When it is omitted, the movie remains
transparent.

#### `renders[].outputs.overlayVideo` <kbd>OPTIONAL</kbd>

`overlayVideo` composites captions over `input.video`. It requires `path` and
uses the input video's width and height.

When it is omitted, the entry writes no overlay video. It cannot run without
`input.video`.

#### `renders[].outputs.overlayVideo.path`

`path` is the output path for the composited video. The engine resolves the path
and writes the composited video there.

There is no default path. The property is required when `overlayVideo` is used.

#### `renders[].outputs.overlayVideo.encoding` <kbd>OPTIONAL</kbd>

`encoding` sets the video quality and encoder settings for an overlay video.
The engine matches the input codec and container when possible.

When it is omitted, the engine uses the input codec and container with its
codec-specific defaults.

#### `renders[].outputs.overlayVideo.encoding.preset` <kbd>OPTIONAL</kbd>

`preset` sets the FFmpeg encoder speed and compression preset. The default is
`superfast` for H.264 and H.265 output.

When it is omitted, the codec default applies. Codecs without an FFmpeg
`preset` option ignore this property.

#### `renders[].outputs.overlayVideo.encoding.crf` <kbd>OPTIONAL</kbd>

`crf` sets the constant rate factor for codecs that support it. The default is
`21` for H.264 and H.265 output.

When it is omitted, the codec default applies. Codecs without CRF support
ignore this property.

#### `renders[].outputs.overlayVideo.pipeline` <kbd>OPTIONAL</kbd>

`pipeline` selects the overlay compositor:

- `ffmpeg-compositor` supports the complete output feature set and is the
  default.
- `skia-compositor` performs frame compositing in Node.js.

When it is omitted, the engine uses `ffmpeg-compositor`. If the requested Skia
conditions are not met, the engine falls back to FFmpeg.

</details>

Prepared transcript entries take priority over caption files. Caption files
take priority over transcription. Providers run only when neither source is
present.

## Transcription providers

Set each provider's `provider` field with `TranscriptionProviderName`:

| Enum member                            | Value        |
| -------------------------------------- | ------------ |
| `TranscriptionProviderName.OpenAI`     | `openai`     |
| `TranscriptionProviderName.ElevenLabs` | `elevenlabs` |
| `TranscriptionProviderName.Sarvam`     | `sarvam`     |

`TranscriptionProviderName` supplies provider values. `TranscriptionProvider`
describes the provider configuration object.
List multiple providers in priority order. The first entry is the primary
provider. captioncat skips entries without a valid API key and tries the next
provider when a transcription request fails. It reports an error when every
configured provider fails.

See [Use transcription](getting-started.md#use-transcription) for a complete
provider example.

## Preset sources

Use a bundled preset, a local JSON file, an HTTP(S) JSON URL, or an inline ECS
object. Read [Presets](presets.md#loading-a-custom-preset) for the preset
contract. See [Render with a custom preset](getting-started.md#render-with-a-custom-preset)
for a complete render example.

The renderer loads one preset source once for each entry in `renders`. It then
uses that preset for every visual output in the entry.

Request-level `exports` write transcript and subtitle files. Render-level
`outputs` write PNG sequences, standalone caption movies, and overlay videos.

## Overlay pipelines

Select the overlay pipeline with `renders[].outputs.overlayVideo.pipeline`.

### FFmpeg compositor

`ffmpeg-compositor` is the default. It composites caption frames and final
blend-mode layers onto the input video in FFmpeg.

This pipeline supports the complete output feature set. It also supports video
reframing and corner-mask transforms.

### Skia compositor

`skia-compositor` decodes the source video into raw RGBA frames. It blends the
caption pixels and blend-mode layers in Node.js without an intermediate overlay
movie.

This pipeline applies when the input has a known constant frame rate and no
video transform that requires the FFmpeg compositor. The request falls back to
the FFmpeg compositor when those conditions are not met.

Both pipelines apply blend modes between final caption layers and the source
video. The selected pipeline changes the compositing implementation, not the
caption style contract.

## Render pipeline details

For the complete stage-by-stage processing model, frame reuse rules, and
conditional compositor flow, see [Render pipeline](render-pipeline.md).

## Bounded frame generation

`generateSubtitleImagesEcs` renders the complete sequence by default. A caller
can set `stopAfterFrameIndex` to a zero-based frame index.

The pipeline emits that frame and then stops. This option supports callers that
need one frame or a short prefix, such as promo image generation.

The option does not change video or PNG-sequence rendering when it is omitted.
When the option is set, returned timing metadata can be incomplete because the
pipeline stops before later events.

## Language-aware text segmentation

Text that enters the engine with word timestamps already has its word
boundaries. Synthetic text, such as promo text, needs a tokenizer first.

The shared caption utility uses `Intl.Segmenter` with the supplied language.
Node.js uses locale data and language-specific dictionaries to find word
boundaries. The engine does not use a fixed list of Japanese characters.

For example, Japanese text does not need spaces between words. The `ja` locale
still gives the engine multiple timed segments. Punctuation stays with the
nearest segment when no whitespace separates it.

If the runtime does not support `Intl.Segmenter`, or the language is not
supported, the utility falls back to whitespace-separated tokens.

Font and image assets load before measurement. This order keeps text bounds
consistent between measurement and paint.

## Font loading

Font data lives in [`assets/fonts-data.json`](../assets/fonts-data.json). A
font family contains variants. Each variant contains a weight, style, and
ordered source list.

The Node renderer resolves sources in this order:

1. A bundled local source with the requested family, weight, and style.
2. A Google Fonts source.
3. A direct remote font source.
4. A system or generic CSS fallback.

Remote font sources are downloaded and registered before text measurement.
This prevents the host operating system from selecting a different font during
layout.

Remote loading needs network access. Use a bundled source for offline or
restricted render environments.

> Read the [Font Component](docs/components/font) guide for font-specific configuration and behavior.

## Text direction

`captionLayout.textDirection` accepts:

- `ltr` for left-to-right text.
- `rtl` for right-to-left text.
- `auto` for automatic resolution.

Automatic resolution uses the BCP-47 language hint before it uses the first
strong Unicode direction in the text. The resolved direction travels through
flow layout, animation, transitions, spacers, effects, and cursor placement.

An iMessage background shape's tail with `tailSide: "auto"` follows the resolved direction.

## Stable frame placement

The ECS pipeline measures a shared crop box across the caption scene. Stable
mode keeps that crop and placement fixed across caption frames. This keeps
letters in place during playback and scrubbing.

The crop includes enabled background bands and effect margins. Disabled
components do not contribute paint or bounds.

## Browser and Node.js

The package uses Node.js APIs for font files, image files, FFmpeg, and video
frames. The browser package supplies an engine-owned browser platform for
canvas, image assets, cursor assets, and font loading.

The caption**cat** Preset Studio uses that browser package and adds only its
worker transport, SVG rasterization, and local bundled-font resolver. The
Studio preview uses the shared ECS scene and render code. It does not use a
separate visual approximation of the engine.
