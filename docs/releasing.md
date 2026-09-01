# Releasing captioncat Preset Studio

This guide describes the release process.
The root package version controls the Git tag, GitHub Release, and Preset Studio
HTML filename.

## Release outputs

For a root package version of `2.0.0`, the release uses:

```text
Root package version: 2.0.0
Git tag:              v2.0.0
GitHub Release:       captioncat Preset Studio (v2.0.0)
Studio asset:         captioncat-preset-studio-v2.0.0.html
```

The Studio package is private and is not published to npm.

## Create a release

Use the release command from a clean, up-to-date `main` branch:

```bash
npm run release -- 1.0.3
```

The command performs these actions:

1. Builds the engine.
2. Runs the linter and the local test.
3. Updates `package.json` and `package-lock.json`.
4. Checks the npm package contents.
5. Commits the version files as `Release v<version>`.
6. Pushes the commit to `main`.
7. Creates the matching `v<version>` tag.
8. Pushes only that tag.

The command does not publish the package itself. Pushing the tag starts the
GitHub Actions workflows that publish the package and create the GitHub
Release. The command does not force-push or overwrite an existing tag.

The command pushes directly to `main`. The account that runs it must bypass
the pull request rule for `main`, or the command stops at the branch push.

The tag push starts the
[`captioncat Release` workflow](../.github/workflows/release.yml).

The workflow checks that the tag matches the root package version. It then
builds and validates the engine, builds the standalone Studio HTML, and creates
the GitHub Release with the versioned Studio asset. It also deploys that same
verified HTML as `index.html` to the latest GitHub Pages site:

```text
https://itisshikhar.github.io/captioncat/captioncat-preset-studio/
```

Before the first deployment, set the repository's GitHub Pages source to
**GitHub Actions** in **Settings > Pages**.

The workflow does not increment versions. A manual workflow run fails if the
root version already has a remote `v<version>` tag. This prevents an existing
release from being replaced by accident.

## What the engine build does

The workflow runs `npm run build` in the repository root. This compiles the
engine for Node and browser consumers, generates required browser manifests,
and copies engine assets. The Studio build bundles the browser engine output
into the standalone HTML file.

The GitHub Release contains the versioned Studio asset. It does not attach an
engine package archive.

After the release build succeeds, the `publish-npm` job downloads the verified
engine package archive and publishes it through npm Trusted Publishing. The
`publish-npm` job runs only for a pushed release tag. It uses OIDC and does
not store an npm token or 2FA code in GitHub.

The `publish-npm` and `deploy-pages` jobs run in parallel after the release
build and GitHub Release succeed.

Before the first npm release, configure the npm package's Trusted Publisher:

```text
Organization/user: ItisShikhar
Repository: captioncat
Workflow: release.yml
```

The npm package must already exist under the `@captioncat` organization, and
the organization account must have permission to publish it.

The generated `build/` and `build-browser/` directories are required in a
published engine package because the package entry points and browser export
reference them. They are generated during the build and are not committed to
the repository or included in GitHub's source archives.

After the engine package is published, users can install it without building
the repository themselves:

```bash
npm install @captioncat/caption-engine
```

## Manual workflow runs

Use **Run workflow** for controlled testing or for a release when no matching
version tag exists. The `release_ref` input selects the branch or tag that the
workflow checks out.

For a normal release, do not create a tag and then run the workflow manually.
Push the tag instead. The tag push starts the workflow and ensures that the
release is built from the exact tagged commit.
