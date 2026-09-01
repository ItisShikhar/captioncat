# CLI

The package provides the `captioncat` command. The `caption-engine` command is
also available as an alias.

> All CLI examples use fenced code blocks. Each command is on one physical line, so you can copy and paste it without editing.

Both versions work well.

## Install

The engine package is available on npm. Install it globally:

```bash
npm install --global @captioncat/caption-engine
```

For repository development, install the repository dependencies, build the
engine, and run the CLI entry point directly:

```bash
npm install
npm run build
node ./bin/caption-engine.js --help
```

You can also use `npx` without a global install:

```bash
npx --package @captioncat/caption-engine captioncat --help
```

## Downloading online videos

The captioncat CLI processes local video files. It does not include `yt-dlp` or
download videos from YouTube. Install `yt-dlp` separately, use it to download a
video, and pass the resulting local file to captioncat:

```bash
yt-dlp -o input.mp4 "https://www.youtube.com/watch?v=VIDEO_ID"
captioncat render --input-video input.mp4 --input-captions captions.srt --preset-id ig-demure
```

## Package layout

The repository uses the standard Node.js package directories:

```text
src/              authored TypeScript source
bin/              tracked CLI launcher
build/            generated Node.js output
build-browser/    generated browser output
```

`bin/caption-engine.js` starts the `captioncat` and `caption-engine` commands.
It loads the compiled CLI from `build/`. The package entry points and browser
export also reference generated files in `build/` and `build-browser/`.

The build directories are not committed to the repository. A clean repository
checkout must run `npm install` and `npm run build` before the local CLI can
run. A published npm package includes these generated directories, so package
users do not need to build the repository.

## Complete command reference

```text
captioncat CLI
Usage: captioncat <command> [input] [options]
```

Run `captioncat --help` to show the complete command and option list:

### Commands

| Command                  | Purpose                               |
| ------------------------ | ------------------------------------- |
| `render`                 | Render captions and selected outputs. |
| `transcribe`             | Transcribe a video or audio input.    |
| `ass`                    | Convert captions to ASS.              |
| `srt`                    | Convert captions to SRT.              |
| `vtt`                    | Convert captions to WebVTT.           |
| `png`                    | Render captions to a PNG sequence.    |
| `export`                 | Export captions with `--format`.      |
| `preset list`            | List bundled preset IDs.              |
| `preset validate <file>` | Validate a custom preset file.        |

### Input options

| Option                    | Purpose                                         |
| ------------------------- | ----------------------------------------------- |
| `--input-video <path>`    | Video input path.                               |
| `--audio <path>`          | Audio input path.                               |
| `--input-captions <path>` | Caption input in JSON, SRT, VTT, or ASS format. |
| `--transcript <path>`     | Prepared transcript JSON input.                 |

### Preset options

| Option                 | Purpose                      |
| ---------------------- | ---------------------------- |
| `--preset-id <id>`     | Bundled preset ID.           |
| `--preset-file <path>` | Custom ECS preset JSON file. |

### Render output options

| Option                     | Purpose                               |
| -------------------------- | ------------------------------------- |
| `--video-output <path>`    | Overlay video output path.            |
| `--frames <directory>`     | PNG sequence output directory.        |
| `--movie-output <path>`    | Standalone caption movie output path. |
| `--ass <path>`             | ASS subtitle output path.             |
| `--srt <path>`             | SRT subtitle output path.             |
| `--vtt <path>`             | WebVTT subtitle output path.          |
| `--transcript-json <path>` | Transcript JSON output path.          |

### Render options

| Option                     | Purpose                                       |
| -------------------------- | --------------------------------------------- |
| `--canvas-size <WxH>`      | Caption canvas size, for example `1080x1920`. |
| `--fps <number>`           | Caption or output video frame rate.           |
| `--pipeline <name>`        | `ffmpeg-compositor` or `skia-compositor`.     |
| `--encoding-preset <name>` | FFmpeg encoder preset.                        |
| `--crf <number>`           | FFmpeg constant rate factor.                  |
| `--language <code>`        | Caption or transcription language.            |
| `--provider <name>`        | Transcription provider identifier.            |
| `--caption-layout <json>`  | Partial caption layout policy override.       |
| `--debug-bounds`           | Write entity bounds debug data.               |
| `--debug-labels`           | Write entity labels debug data.               |
| `--debug-position`         | Write entity positions debug data.            |
| `--debug-padding`          | Write entity padding debug data.              |

### Other options

| Option            | Purpose                                                  |
| ----------------- | -------------------------------------------------------- |
| `--output <path>` | Output file or directory for transcribe and conversions. |
| `--format <name>` | Export format: `ass`, `srt`, `vtt`, `json`, or `png`.    |

### Help forms

```cmd
captioncat --help
captioncat -h
captioncat help
captioncat render --help
captioncat <command> --help
```

The CLI also accepts positional input as shorthand for the relevant media or
caption input. Do not combine positional input with explicit input options.
Render requires exactly one of `--preset-id` or `--preset-file`.
Provider keys use `<PROVIDER>_API_KEY` environment variables.

## Render captions

Use a bundled preset ID:

```cmd
captioncat render --input-video input.mp4 --audio voiceover.mp3 --input-captions captions.srt --preset-id ig-demure --video-output output/video.mp4 --frames output/frames --movie-output output/captions.mov --ass output/captions.ass --srt output/captions.srt --vtt output/captions.vtt --transcript-json output/transcript.json
```

Use a custom preset file instead:

```cmd
captioncat render --input-video input.mp4 --input-captions captions.srt --preset-file .\presets\custom.json --video-output output/video.mp4
```

Sample render from the repository root:

The command writes
`.\captions-output\ig-demure\sample-portrait-360p-captioncat.mp4`.

```cmd
captioncat render --input-video .\tests\sample-inputs\sample-eng\sample-portrait-360p.mp4 --input-captions .\tests\sample-inputs\sample-eng\captions.srt --preset-id ig-demure
```

The command accepts one positional input as shorthand for `--input-video`:

```bash
captioncat render input.mp4 --provider openai --preset-id ig-demure
```

Do not combine a positional input with `--input-video`, `--audio`, `--input-captions`, or
`--transcript`.

The render command requires exactly one of `--preset-id` and `--preset-file`.
It rejects a command that contains both options.

The `--transcript` option accepts prepared transcript JSON. The `--input-captions`
option accepts JSON, SRT, VTT, or ASS input. Do not use both options.

If a video input exists and no output flag is present, the command writes an
overlay video to `captions-output/<preset>/<input>-captioncat.mp4`.

Caption-only renders require at least one output flag. PNG and standalone movie
outputs also require `--canvas-size` when no video input exists.

## Render options

| Option                           | Purpose                                         |
| -------------------------------- | ----------------------------------------------- |
| `--input-video <path>`           | Video input path.                               |
| `--audio <path>`                 | Audio input path.                               |
| `--input-captions <path>`        | Caption input in JSON, SRT, VTT, or ASS format. |
| `--transcript <path>`            | Prepared transcript JSON input.                 |
| `--preset-id <id>`               | Bundled preset ID.                              |
| `--preset-file <path>`           | Custom ECS preset JSON file.                    |
| `--video-output <path>`          | Overlay video output path.                      |
| `--frames <directory>`           | PNG sequence output directory.                  |
| `--movie-output <path>`          | Standalone caption movie output path.           |
| `--ass <path>`                   | ASS subtitle output path.                       |
| `--srt <path>`                   | SRT subtitle output path.                       |
| `--vtt <path>`                   | WebVTT subtitle output path.                    |
| `--transcript-json <path>`       | Transcript JSON output path.                    |
| `--canvas-size <width>x<height>` | Caption canvas size.                            |
| `--fps <number>`                 | Caption or output video frame rate.             |
| `--pipeline <name>`              | `ffmpeg-compositor` or `skia-compositor`.       |
| `--encoding-preset <name>`       | FFmpeg encoder preset.                          |
| `--crf <number>`                 | FFmpeg constant rate factor.                    |
| `--language <code>`              | Caption or transcription language.              |
| `--provider <name>`              | Transcription provider identifier.              |
| `--caption-layout <json>`        | Partial caption layout override.                |
| `--debug-bounds`                 | Write entity bounds debug data.                 |
| `--debug-labels`                 | Write entity labels debug data.                 |
| `--debug-position`               | Write entity positions debug data.              |
| `--debug-padding`                | Write entity padding debug data.                |

Use multiple output flags in one render. For example:

```cmd
captioncat render --input-video .\input.mp4 --input-captions .\captions.srt --preset-id ig-demure --video-output .\output\video.mp4 --frames .\output\frames --ass .\output\captions.ass
```

## Transcribe

Transcribe a video or audio file:

```bash
captioncat transcribe input.mp4 --provider openai
```

Generate only an overlay video with OpenAI transcription:

```powershell
$env:OPENAI_API_KEY = '<your-key>'
```

Run the render command:

```cmd
captioncat render --input-video .\tests\sample-inputs\sample-eng\sample-portrait-360p.mp4 --provider openai --preset-id ig-demure --video-output .\output\sample-portrait-360p-captioncat.mp4
```

Command Prompt:

```cmd
set OPENAI_API_KEY=<your-key>
```

Run the render command:

```cmd
captioncat render --input-video .\tests\sample-inputs\sample-eng\sample-portrait-360p.mp4 --provider openai --preset-id ig-demure --video-output .\output\sample-portrait-360p-captioncat.mp4
```

When `--input-captions` and `--transcript` are omitted, the render command transcribes
the video with the selected provider before it generates the video.

Use explicit source options when you need to provide both video and audio:

```cmd
captioncat transcribe --input-video input.mp4 --audio voiceover.mp3 --provider openai --output output/transcript.json
```

If `--output` is omitted, the command writes
`captions-output/transcript.json`.

## Convert caption files

Convert a caption or transcript file to ASS, SRT, or WebVTT:

```bash
captioncat ass transcript.json --output output/captions.ass
captioncat srt transcript.json --output output/captions.srt
captioncat vtt transcript.json --output output/captions.vtt
```

The input can be a positional path or `--input-captions <path>`. If `--output` is
omitted, the command writes the result in `captions-output`.

Default output paths:

| Command                           | Default output                    |
| --------------------------------- | --------------------------------- |
| `captioncat transcribe`           | `captions-output/transcript.json` |
| `captioncat ass`                  | `captions-output/captions.ass`    |
| `captioncat srt`                  | `captions-output/captions.srt`    |
| `captioncat vtt`                  | `captions-output/captions.vtt`    |
| `captioncat export --format json` | `captions-output/transcript.json` |

Use `export` when the format comes from a script:

```bash
captioncat export transcript.json --format srt --output output/captions.srt
captioncat export transcript.json --format vtt --output output/captions.vtt
captioncat export transcript.json --format json --output output/transcript.json
```

## Render PNG frames

Render a caption file to a PNG sequence:

```cmd
captioncat png transcript.json --preset-id ig-demure --frames output/frames --canvas-size 1080x1920
```

Render only frames with a fixed canvas size:

```cmd
captioncat render --input-captions .\tests\sample-inputs\sample-eng\captions.srt --preset-id ig-demure --frames .\output\frames --canvas-size 360x640
```

Use `--input-video` when the caption canvas must match a video:

```cmd
captioncat png --input-video input.mp4 --input-captions transcript.json --preset-id ig-demure --frames output/frames
```

Use `captioncat export --format png` as an equivalent script-friendly form.

## Preset commands

List all bundled preset IDs:

```bash
captioncat preset list
```

Validate a custom preset file:

```bash
captioncat preset validate ./presets/custom.json
```

Validate a bundled preset:

```bash
captioncat preset validate --preset-id ig-demure
```

## Provider keys

The CLI reads provider keys from environment variables. Do not pass keys as
command-line arguments.

| Provider   | Environment variable |
| ---------- | -------------------- |
| OpenAI     | `OPENAI_API_KEY`     |
| ElevenLabs | `ELEVENLABS_API_KEY` |
| Sarvam     | `SARVAM_API_KEY`     |

PowerShell:

```powershell
$env:OPENAI_API_KEY = '<your-key>'
```

Run the render command:

```cmd
captioncat render --input-video .\input.mp4 --input-captions .\captions.srt --provider openai --preset-id punch
```

Command Prompt:

```cmd
set OPENAI_API_KEY=<your-key>
```

Run the render command:

```cmd
captioncat render --input-video .\input.mp4 --input-captions .\captions.srt --provider openai --preset-id punch
```

macOS or Linux:

```bash
export OPENAI_API_KEY='<your-key>'
captioncat render input.mp4 --provider openai --preset-id punch
```

Run `captioncat --help` to show all commands and options.
The equivalent `captioncat help` command and `captioncat <command> --help` form
are also supported.
