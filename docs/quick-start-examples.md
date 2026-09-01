# Quick start examples

## 1. Use a transcription service

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

_**captioncat** tries providers in order, skipping invalid keys and falling back when a request fails._

Built-in providers: `openai`, `elevenlabs`, and `sarvam`.

> [!TIP]
> Keep API keys in environment variables. Do not commit keys to the repository.

## 2. Render captions from a caption file

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

## 3. Render multiple outputs

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

## 4. Render PNG sequence of captions

Use `input.audio` with a prepared caption file when you do not have a source video. Audio-only PNG and standalone caption movie outputs need an explicit `canvasSize`.

```ts
await captionCatEngine.render({
  input: {
    audio: 'audio.mp3', // Local path, URL, or Uint8Array
    captions: 'captions.srt', // Supports SRT, ASS, VTT, or JSON
  },
  renders: [
    {
      preset: CaptionPreset.Punch,
      canvasSize: { width: 1080, height: 1920 }, // Required
      outputs: {
        pngSequence: {
          directory: 'output/punch/frames',
          background: 'transparent', // Optional
        },
        standaloneCaptionMovie: {
          path: 'output/punch/captions.mov',
          background: 'transparent', // Optional
        },
      },
    },
  ],
});
```

## 5. Render multiple presets for one input

Render multiple caption designs from the same input. Each render entry can use its own preset and output paths.

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
        overlayVideo: {
          path: 'output/punch/video.mp4',
        },
      },
    },
    {
      preset: CaptionPreset.Coco,
      outputs: {
        overlayVideo: {
          path: 'output/coco/video.mp4',
        },
      },
    },
  ],
});
```

_The engine shares the resolved transcript across render entries._

## 6. Export transcript and caption files

Export transcript and caption files from a prepared transcript:

```ts
import { createCaptionCat } from '@captioncat/caption-engine';

const captionCatEngine = createCaptionCat();

await captionCatEngine.render({
  input: {
    transcript: [
      {
        text: 'Hello world',
        start: 0,
        end: 2,
        words: [
          { text: 'Hello', start: 0, end: 0.8 },
          { text: 'world', start: 0.9, end: 2 },
        ],
      },
    ],
  },
  exports: {
    transcript: {
      json: 'output/transcript.json',
    },
    captions: {
      ass: 'output/captions.ass',
      srt: 'output/captions.srt',
      vtt: 'output/captions.vtt',
    },
  },
});
```
