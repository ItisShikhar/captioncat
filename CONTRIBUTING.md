# Contributing

Thank you for your interest in contributing to captioncat!

## Reporting Bugs

Before opening an issue:

- Search existing issues to avoid duplicates
- Include clear reproduction steps
- Include your operating system, Node.js version, and FFmpeg version
- Include relevant logs or error messages

## Feature Requests

Feature requests are welcome.

Please describe:

- The problem you are trying to solve
- Why it would benefit other users
- Any proposed API or design changes

## Development

Clone the repository and install dependencies:

```bash
git clone https://github.com/ItisShikhar/captioncat.git
cd captioncat
npm install
```

Build the project:

```bash
npm run build
```

Run tests:

```bash
npm test
```

Run the linter:

```bash
npm run lint
```

See [Development](docs/development.md) for development workflows, sample
renders, asset generation, and other repository details.

## Adding Presets

Presets are a core part of captioncat. Before adding or modifying a bundled
preset, read the [Presets](docs/presets.md) guide.

Use Preset Studio to create and preview presets where
appropriate. Read the [Preset Studio](docs/preset-studio.md) guide.

## Pull Requests

Please make sure that:

- The project builds successfully
- Existing tests pass
- New functionality includes tests where appropriate
- Documentation is updated when necessary
- Pull requests are focused on a single feature or bug fix

## Coding Style

- Use TypeScript
- Prefer small, focused functions
- Prefer composable files and modules over monoliths
- Write reusable and extensible code
- Keep public APIs simple
- Write meaningful commit messages

## Sample input licensing

Sample media may include third-party Creative Commons content. See
[`tests/sample-inputs/ATTRIBUTIONS.md`](tests/sample-inputs/ATTRIBUTIONS.md)
for attribution and licensing information.

Thank you for helping improve captioncat!
