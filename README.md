<div align="center">

<picture>
  <source srcset="assets/svg/branding/captioncat-logo-lockup.svg"
          media="(prefers-color-scheme: dark)">
  <img width="320"
       src="assets/svg/branding/captioncat-logo-lockup-colored.svg"
       alt="captioncat logo">
</picture>

<h1>captioncat</h1>

<p><strong>Beautiful, expressive captions - designed, animated, and rendered in code.</strong></p>

<p>
  <a href="#documentation">Docs</a> |
  <a href="docs/getting-started.md">Quickstart</a> |
  <a href="docs/preset-studio.md">Preset Studio</a> |
  <a href="docs/presets.md">Presets</a>
</p>

[![npm version](https://img.shields.io/npm/v/@captioncat/caption-engine?style=flat-square)](https://www.npmjs.com/package/@captioncat/caption-engine)
[![npm downloads](https://img.shields.io/npm/dw/@captioncat/caption-engine?style=flat-square)](https://www.npmjs.com/package/@captioncat/caption-engine)
[![GitHub stars](https://img.shields.io/github/stars/ItisShikhar/captioncat?style=flat-square)](https://github.com/ItisShikhar/captioncat/stargazers)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

⭐ _Help us reach more developers and grow the captioncat community. Star this repo!_

</div>

<p align="center">
  <img src="docs/images/readme/slide-16-9.webp" alt="captioncat preview banner">
</p>

## What is captioncat?

**captioncat is an open-source engine for designing, animating, and rendering expressive captions for video.**

Create reusable caption presets with control over typography, layout, animation, effects, backgrounds, and positioning. Render captions directly onto videos, export standalone caption movies, or export subtitle files.
Create captions in any language, use an existing transcript or caption file, or
transcribe directly from video or audio.

## Why captioncat?

Built for developers who want more than basic subtitles.

- Design expressive captions with typography, layout, animation, effects, and backgrounds.
- Save styles as reusable presets.
- Use the same preset across multiple videos.
- Render captions directly onto videos or export standalone caption movies.
- Export captions as ASS, SRT, VTT, PNG sequences, or JSON.
- Create captions in any language, including left-to-right and right-to-left languages.
- Customize presets with code or with captioncat Preset Studio.

captioncat gives you programmatic control without limiting you to simple subtitle overlays.

## Features

- **Designable captions** - typography, layout, animation, effects, backgrounds, positioning, and more
- **Multilingual** - LTR, RTL, and automatic text direction
- **Reusable presets** - bundled presets or custom JSON
- **Rich animation** - keyframes, transitions, layout motion, and effects
- **Multiple outputs** - captioned video, standalone caption movies, PNG sequences, ASS,
  SRT, VTT, and JSON
- **Font control** - bundled, Google Fonts, remote, and system fonts
- **Transcription adapters** - OpenAI, ElevenLabs, and Sarvam
- **captioncat Preset Studio** - visual preset authoring with JSON import and export

## Showcase

See what you can build with **captioncat**.

<p align="center">
  <img src="docs/images/readme/collage-1.webp" width="100%" alt="captioncat caption showcase, panel 1">
</p>

<p align="center">
  <img src="docs/images/readme/collage-2.webp" width="100%" alt="captioncat caption showcase, panel 2">
</p>

<p align="center">
  <img src="docs/images/readme/collage-3.webp" width="100%" alt="captioncat caption showcase, panel 3">
</p>

See the [full bundled preset gallery](docs/presets.md#preview-gallery).

See the [full showcase](docs/showcase.md), including [live examples](docs/showcase.md#watch-live-examples).

## Installation

Install the package:

```bash
npm install @captioncat/caption-engine
```

> Requires Node.js `22.0.0` or later. Older versions may work, but
> are not officially supported.

<details>
<summary>Other package managers</summary>

```bash
yarn add @captioncat/caption-engine
```

```bash
pnpm add @captioncat/caption-engine
```

</details>

The package includes the engine, CLI, FFmpeg binaries, Skia Canvas, preset assets, and bundled font assets.

## Quick start

Transcribe & Render captions over a video:

```ts
import { CaptionPreset, TranscriptionProviderName, createCaptionCat } from '@captioncat/caption-engine';

const captionCatEngine = createCaptionCat();

await captionCatEngine.render({
  input: {
    video: 'video.mp4',
  },
  transcription: {
    providers: [
      {
        provider: TranscriptionProviderName.OpenAI,
        apiKey: process.env.OPENAI_API_KEY,
      },
      {
        provider: TranscriptionProviderName.ElevenLabs,
        apiKey: process.env.ELEVENLABS_API_KEY,
      },
    ],
  },
  renders: [
    {
      preset: CaptionPreset.Punch,
      outputs: {
        overlayVideo: {
          path: 'output/video.mp4',
        },
      },
    },
  ],
});
```

`CaptionPreset.Punch` selects a bundled caption style. See the
[complete `CaptionPreset` member list](docs/presets.md#captionpreset-members).

When captions or a transcript are not provided, captioncat transcribes the
input video or audio using the configured transcription providers. Providers are tried in priority order, with automatic fallback when a provider key is invalid or transcription fails.

See
[Transcription providers](docs/rendering.md#transcription-providers).

> [!TIP]
> Set your provider API keys as environment variables.

Presets include timing and caption layout settings. Override them for an individual render with `renders[].settings`:

```ts
renders: [
  {
    preset: CaptionPreset.Punch,
    settings: {
      timing: {
        captionHoldThresholdSeconds: 0.5,
      },
      captionLayout: {
        horizontalFit: 'shrink-to-fit',
        rowsPerPage: {
          mode: 'fixed',
          count: 2,
        },
      },
    },
    outputs: {
      overlayVideo: {
        path: 'output/video.mp4',
      },
    },
  },
];
```

> All settings are optional. Unspecified settings inherit the values from the
> selected preset.

See [Getting started](docs/getting-started.md) for prepared captions, transcript
inputs, provider setup, preset settings, and standalone caption outputs.

Need more control? See [Render request](docs/rendering.md#render-request).

## Inputs and outputs

The engine separates media inputs, transcript and subtitle exports, and visual
caption renders.

| Input or output          | Purpose                                         |
| ------------------------ | ----------------------------------------------- |
| Video                    | Source video for an overlay render.             |
| Audio                    | Source audio or replacement audio.              |
| Captions                 | SRT, VTT, ASS, or JSON caption input.           |
| Transcript               | Prepared timed transcript entries.              |
| Captioned video          | Captions composited over the input video.       |
| Standalone caption movie | Caption frames for external compositing.        |
| PNG sequence             | One transparent caption frame per output frame. |
| ASS, SRT, VTT            | Subtitle exports.                               |
| JSON                     | Transcript export.                              |

Read [Rendering](docs/rendering.md) for the request contract, output sizing,
source priority, and compositor behavior.

## Presets

A **preset** defines the visual style and behavior of a caption. It controls
how captions look, move, and respond to the transcript, including typography,
layout, animation, effects, backgrounds, and positioning.

captioncat includes **36 handcrafted presets** that you can use out of the box.
You can also create your own presets and load them from a local JSON file, an
HTTP(S) URL, or an inline ECS object.

```ts
const render = {
  preset: CaptionPreset.Punch,
  outputs: {
    overlayVideo: {
      path: 'output/video.mp4',
    },
  },
};
```

Under the hood, presets are defined using captioncat's Entity Component
System (ECS) format, which makes caption styles composable and reusable.

Read [Presets](docs/presets.md) for the preset format, custom preset sources, layout behavior, and the full bundled catalog.

> View the [Showcase](docs/showcase.md) for examples and inspiration.

## captioncat Preset Studio

**captioncat Preset Studio** is a visual editor for creating and customizing
caption presets. It provides hierarchy editing, live preview, typography and
effect controls, animation editing, and JSON import and export.

Preset Studio is distributed as a **single-file HTML app** that runs locally in
your browser with no installation required.

[Launch **captioncat** Preset Studio online](https://itisshikhar.github.io/captioncat/captioncat-preset-studio/)
**or**
[Download **captioncat** Preset Studio from the latest release](https://github.com/ItisShikhar/captioncat/releases/latest)

Preset Studio is a private package and is not published to npm. The root
[`package.json`](package.json) version is the release source of truth for both
the caption engine and the Studio artifact. The Studio HTML uses the root
engine version in its filename:

```text
captioncat-preset-studio-v<root-engine-version>.html
```

See the [release guide](docs/releasing.md) for the maintainer release process.

<table>
  <tr>
    <td align="center">
      <img src="docs/images/preset-studio/realtime-preview.png" alt="Preset Studio real-time preview and word inspector" width="420">
      <br><sub>Real-time preview and word inspector</sub>
    </td>
    <td align="center">
      <img src="docs/images/preset-studio/multiview-previews.png" alt="Preset Studio multi-view previews" width="420">
      <br><sub>Multi-view previews</sub>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="docs/images/preset-studio/debug-overlays.png" alt="Preset Studio debug overlays and layout bounds" width="420">
      <br><sub>Debug overlays and layout bounds</sub>
    </td>
    <td align="center">
      <img src="docs/images/preset-studio/animation-tracks.png" alt="Preset Studio animation tracks editor" width="420">
      <br><sub>Animation tracks editor</sub>
    </td>
  </tr>
</table>

To build Preset Studio locally:

```bash
cd tools/preset-studio
npm install
npm run build
```

Open `tools/preset-studio/dist/captioncat-preset-studio-v<root-engine-version>.html` in a
**Chromium-based browser**.

See the [Preset Studio guide](docs/preset-studio.md) for editor features and
development details.

> Note on fonts: captioncat supports bundled fonts, Google Fonts, remote
> font URLs, and system fallbacks. Fonts are loaded before text measurement to
> preserve predictable layouts across languages.

> For font storage, loading, and fallback behavior, see the [Font component](docs/components/font.md) and [font loading](docs/rendering.md#font-loading) guides.

## CLI

> All CLI examples use fenced code blocks. Each command stays on one physical
> line so you can copy and paste it without editing.

Install the CLI globally:

```bash
npm install --global @captioncat/caption-engine
```

Render captions:

```cmd
captioncat render --input-video input.mp4 --provider openai --preset-id punch --video-output output/video.mp4
```

When `--video-output` is omitted, the CLI writes
`captions-output/punch/input-captioncat.mp4`.

Other commands:

```cmd
captioncat transcribe input.mp4 --provider openai
captioncat ass transcript.json --output captions.ass
captioncat png transcript.json --preset-id punch --frames captions-output
```

Read the [CLI guide](docs/cli.md) for all options and provider environment
variables.

## Architecture

### The problem

- Browser Canvas requires a browser runtime and does not provide a complete media processing or video encoding pipeline. Font loading and text measurement can also vary across environments.

- FFmpeg is excellent for media processing and encoding, but complex captions require per-word layout, timing, animations, and effects that can lead to large and difficult-to-maintain filter graphs.

### The solution

**captioncat** uses each tool for what it does best:

- Skia Canvas - renders caption frames with precise control over text, layout, shapes, images, animations, and effects.
- FFmpeg - handles media processing, compositing, audio, and video encoding.

Skia runs directly in Node.js without a browser or DOM, making it well suited for server-side rendering.

### How does the engine work

#### Rendering pipeline

1. Read a video, audio file, transcript, or caption file.
2. Apply a preset to determine timing, layout, typography, animation, and effects.
3. Render caption frames with Skia Canvas.
4. Composite the frames and process the media with FFmpeg.
5. Output a captioned video, standalone caption movie, image sequence, or subtitle file.

This separation gives captioncat precise control over complex caption visuals without forcing them into large, difficult-to-maintain FFmpeg filter graphs.

Skia Canvas renders the captions. FFmpeg handles the video.

### Preset

**captioncat** separates transcription, caption layout, animation, and rendering.
Caption styles use ECS-based presets, so components and effects can be composed
independently.

Read [Architecture](docs/architecture.md) for the ECS model, state system,
layout engine, and animation pipeline.

## Documentation

- [Getting started](docs/getting-started.md)
- [Quick-start examples](docs/quick-start-examples.md)
- [Rendering](docs/rendering.md)
- [Render pipeline](docs/render-pipeline.md)
- [Presets](docs/presets.md)
- [Preset Studio](docs/preset-studio.md)
- [Effects and components](docs/effects-and-components.md)
- [Architecture](docs/architecture.md)
- [CLI](docs/cli.md)
- [Releasing](docs/releasing.md)
- [Development](docs/development.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)
- [Showcase](docs/showcase.md)

## Roadmap

- More caption presets and effects
- More transcription providers
- More output backends
- Bun runtime support
- Public preset gallery
- Multi-surface captions
- Speaker-aware caption styles
- Fine-grained LLM selection
- More CLI capabilities
- More detailed Preset Studio documentation

The roadmap is exploratory and has no date commitments. Open an issue to
discuss a proposal.

## Contributing

Contributions are welcome, whether they improve performance, fix bugs, add
presets, components or effects, expand examples and tests, or improve documentation.
See [Contributing](CONTRIBUTING.md) before opening a pull request.

## Author

Built by [Shikhar Srivastava](https://www.linkedin.com/in/itisshikhar/).

[GitHub](https://github.com/ItisShikhar) ·
[LinkedIn](https://www.linkedin.com/in/itisshikhar/)

captioncat is an open-source project exploring design-first, scene-based, programmable caption
rendering across [Skia Canvas](https://github.com/samizdatco/skia-canvas) (powered by
[Google's Skia graphics engine](https://skia.org/)),
[browser Canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API), and [FFmpeg](https://github.com/FFmpeg/FFmpeg).

## License

captioncat is released under the [MIT License](LICENSE).
