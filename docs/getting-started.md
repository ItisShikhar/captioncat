# Getting started

_Reference: [Entity Component System (ECS)](https://en.wikipedia.org/wiki/Entity_component_system)_

Get captioncat installed and render your first captioned video.

## Requirements

Install the following software:

- Node.js `22.0.0` or later. Older versions may work, but are not officially supported.
- A transcription provider API key when **captioncat** needs to transcribe the input video or audio.

> FFmpeg and FFprobe are bundled with the package. No separate installation is required.

## Install the package

Use one package manager:

```bash
npm install @captioncat/caption-engine
```

<details>
<summary>
Other package managers
</summary>

```bash
yarn add @captioncat/caption-engine
```

```bash
pnpm add @captioncat/caption-engine
```

</details>

## Quick Start

### 1. Use a transcription service

When the input does not include captions or a transcript, **captioncat** first transcribes the provided video or audio using the configured transcription providers.

```ts
import { CaptionPreset, TranscriptionProviderName, createCaptionCat } from '@captioncat/caption-engine';

const captionCatEngine = createCaptionCat();

await captionCatEngine.render({
  input: {
    video: 'video.mp4', // Local path, URL, or Uint8Array
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
          path: 'output/punch/video.mp4',
        },
      },
    },
  ],
});
```

**\*captioncat** tries providers in order, skipping invalid keys and falling back when a request fails.\*

Built-in providers: `openai`, `elevenlabs`, and `sarvam`.

> [!TIP]
> Keep API keys in environment variables. Do not commit keys to the repository.

### 2. Render captions from a caption file

Provide a caption file to skip transcription.

```ts
import { CaptionPreset, createCaptionCat } from '@captioncat/caption-engine';

const captionCatEngine = createCaptionCat();

await captionCatEngine.render({
  input: {
    video: 'video.mp4', // Local path, URL, or Uint8Array
    captions: 'captions.srt', // Supports SRT, ASS, VTT, or JSON
  },
  renders: [
    {
      preset: CaptionPreset.Punch,
      outputs: {
        pngSequence: {
          directory: 'output/punch/frames',
          background: 'transparent', // Optional
        },
        overlayVideo: {
          path: 'output/punch/video.mp4',
        },
      },
    },
  ],
});
```

### 3. Render multiple outputs

Render multiple outputs from the same caption design. **captioncat** resolves the transcript and preset once and reuses caption frames where possible.

```ts
await captionCatEngine.render({
  input: {
    video: 'video.mp4', // Local path, URL, or Uint8Array
    captions: 'captions.srt', // Supports SRT, ASS, VTT, or JSON
  },
  renders: [
    {
      preset: CaptionPreset.Punch,
      outputs: {
        pngSequence: {
          directory: 'output/punch/frames',
        },
        standaloneCaptionMovie: {
          path: 'output/punch/captions.mov',
        },
        overlayVideo: {
          path: 'output/punch/video.mp4',
        },
      },
    },
  ],
});
```

Read [Quick Start Examples](quick-start-examples.md) for all examples.

## Use the CLI

The commands below use one-line syntax. They work in Command Prompt, PowerShell,
macOS, and Linux.

```cmd
captioncat render input.mp4 --provider openai --preset-id punch
captioncat transcribe input.mp4 --provider openai
captioncat ass transcript.json --output captions.ass
captioncat png transcript.json --preset-id punch --frames captions-output
```

The `transcribe` command writes `captions-output/transcript.json` by default.
The `ass` command accepts JSON, SRT, or ASS input.
The `png` command accepts the same caption formats and writes a PNG sequence.

Run `captioncat --help` to show the command list and option names.

## Select a preset

Use a bundled preset:

```ts
import { CaptionPreset } from '@captioncat/caption-engine';

preset: CaptionPreset.IgClassicSticker;
```

See the [complete `CaptionPreset` member list](presets.md#captionpreset-members).

Use a custom JSON file:

```ts
preset: {
  file: './presets/my-preset.json';
}
```

Use a custom JSON document from a URL:

```ts
preset: {
  url: 'https://example.com/presets/my-preset.json';
}
```

Use a custom JSON object directly:

```ts
preset: myPreset;
```

The file, URL, or object must use the current ECS preset schema. Read
[Presets](presets.md) before you create a custom document.

## Render with a custom preset

Load a local preset file for one render entry:

```ts
await captionCatEngine.render({
  input: {
    video: 'video.mp4',
    captions: 'captions.srt',
  },
  renders: [
    {
      preset: { file: './presets/my-preset.json' },
      outputs: {
        overlayVideo: {
          path: 'output/custom/video.mp4',
        },
      },
    },
  ],
});
```

## Override preset settings

Preset JSON stores preset-wide `timing` and `captionLayout` settings. Pass
`renders[].settings` to override those values for one render:

```ts
{
  preset: CaptionPreset.Punch,
  canvasSize: { width: 1080, height: 1920 },
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
  outputs: {
    pngSequence: {
      directory: 'output/punch/frames',
    },
  },
}
```

The default `breakCharacters` list is `['-']`.
The default row and page break priorities are shown in this example.
`smartBreaks: 'auto'` uses language-aware punctuation rules.
Set `smartBreaks` to `'custom'` to use the supplied punctuation lists.

The engine merges the settings with the selected preset. A missing property
uses the preset value. If the preset also omits that property, the engine uses
its default.

The merge does not mutate the preset document. You can reuse one preset with
different settings in separate render entries. `textDirection` accepts `auto`,
`ltr`, or `rtl`. Automatic direction uses the language hint first and then the
first strong Unicode direction.

Use a small override when you need to change one value:

```ts
settings: {
  captionLayout: {
    horizontalFit: 'shrink-to-fit',
  },
}
```

The timing and caption layout settings are also present in the preset document:

```json
{
  "timing": {
    "captionHoldThresholdSeconds": 1
  },
  "captionLayout": {
    "horizontalFit": "natural",
    "rowsPerPage": {
      "mode": "fixed",
      "count": 1
    }
  }
}
```

## Debug output

Enable request-level guides when you need to diagnose layout. The guides apply
to rendered caption frames and requested visual outputs.

```ts
await captionCatEngine.render({
  input: {
    video: 'video.mp4',
    captions: 'captions.srt',
  },
  debug: {
    bounds: true,
    labels: true,
    position: true,
    paddingBounds: true,
  },
  renders: [
    {
      preset: CaptionPreset.Punch,
      outputs: {
        pngSequence: {
          directory: 'output/frames',
        },
      },
    },
  ],
});
```

## Run the repository

Clone the repository and install its dependencies:

```bash
git clone https://github.com/ItisShikhar/captioncat.git
cd captioncat
npm install
```

Run the build:

```bash
npm run build
```

Run the lint command:

```bash
npm run lint
```

Run the default test command:

```bash
npm test
```

Run the broader sample test command:

```bash
npm run test-all
```

Run all Node test files:

```bash
npm run test-ecs-engine
```

Run the focused ECS animation tests:

```bash
npm run test-ecs-animation
```

## Build Preset Studio

Install the Studio dependencies:

```bash
cd tools/preset-studio
npm install
```

Build the single-file Studio:

```bash
npm run build
```

Run the Studio development server:

```bash
npm run dev
```

When you create a preset, open **Settings** before you edit the entity tree.
Set the preset-wide timing, text direction, layout, and caption-breaking
behavior first. Then style the entities and states. Read [Preset
settings](preset-studio.md#preset-settings) for the available settings and
their defaults.

Read [Preset Studio](preset-studio.md) for editor workflows and release
artifacts.
