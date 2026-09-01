# Development

This guide covers development workflows and repository-only commands.
Package users can start with
[Getting started](getting-started.md).

## Setup

### Install dependencies

Run:

```bash
npm install
```

### Build

Build the TypeScript package and copy image assets:

```bash
npm run build
```

### Lint

Run the source linter:

```bash
npm run lint
```

### Test

Run the default local caption-file render test:

```bash
npm test
```

This command builds the engine, then renders the `5o` preset with the local
English caption fixture at `9:16` and `360p`. It writes all supported output
types. It does not call a transcription provider.

Run the complete sample test file:

```bash
npm run test-all
```

This command includes the remote OpenAI transcription test. Set
`OPENAI_API_KEY` before you run it. The test can incur provider charges.

Run all Node test files:

```bash
npm run test-ecs-engine
```

This command discovers every `tests/*.test.js` file and includes the remote
OpenAI transcription test. Set `OPENAI_API_KEY` before you run it. Each file
registers its own tests with `node:test`; no aggregate registration file is
required.

Run the focused ECS animation test file:

```bash
npm run test-ecs-animation
```

This command builds the engine, then runs
[`ecs-animation.test.js`](../tests/ecs-animation.test.js). It does not call a
transcription provider.

Run the focused CLI tests:

```bash
npm run test-cli
```

Run the focused debug-overlay tests:

```bash
npm run test-debug-overlays
```

These focused commands build the engine before they run their test files.
The test runner removes `tests/sample-outputs/` after each command by default.
Pass `--keep-output` through npm, for example
`npm run test-cli -- --keep-output`, to preserve generated files.

## Asset generation

### Generate preset thumbnails

Regenerate the bundled preset thumbnails after a preset changes:

```bash
npm run gen-preset-thumbs
```

The command writes thumbnails to `docs/images/preset-thumbs/`.

### Generate promo frames

Generate the configured promo frames:

```bash
npm run gen-promo-frames
```

Use another configuration file:

```bash
npm run gen-promo-frames -- --config path/to/promo-frame-config.json
```

The configuration lives in
[`scripts/promo-frame-config.json`](../scripts/promo-frame-config.json).

## Sample renders

The sample runner accepts preset, language, aspect-ratio, resolution, and
output selectors:

```bash
npm run test-sample -- <presets> <languages> <aspect-ratios> <resolutions> <outputs>
```

Each selector accepts one value, a comma-separated list, or `all`:

```bash
npm run test-sample -- ig-typewriter en 9:16 hd video
npm run test-sample -- "ig-typewriter,5o" "en,hindi" 1:1 "hd,sd" "video,png"
npm run test-sample -- all "en,hindi" all all all
```

The output selector values are `video`, `png`, `ass`, `srt`, and `json`.

The language value changes layout hints. It does not translate the English
sample captions.

Tests print each generated artifact with a `[test-output]` prefix. The test
commands remove ignored artifacts from `tests/sample-outputs/` by default.

Pass `--keep-output` to keep the artifacts for inspection:

```bash
npm run test-sample -- 5o en 9:16 360p all --keep-output
npm run test-debug-overlays -- --keep-output
```

Pass `--cleanup` to request the default cleanup behavior explicitly.

## Add a bundled preset

Read [Presets](presets.md) before adding or changing a bundled preset.
Validate the preset, then regenerate its thumbnail.

Keep source changes, tests, and documentation focused on one behavior.
