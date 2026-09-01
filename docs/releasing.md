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

1. Merge the release changes into `main`.
2. Update the `version` in the root `package.json` and `package-lock.json`.
   Keep the Studio package version unchanged unless its development metadata
   also needs an update.
3. Commit the version change to `main`.
4. In GitHub Desktop, open **History**, right-click the version commit, and
   select **Create Tag...**.
5. Enter `v<version>`, such as `v2.0.0`, then create the tag.
6. Push the tag to GitHub. GitHub Desktop normally pushes a new tag with its
   associated commit.
7. The tag push starts the
   [`captioncat Preset Studio Release` workflow](../.github/workflows/preset-studio-release.yml).

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

The current workflow does not:

- publish `@captioncat/caption-engine` to npm; or
- attach an engine package archive to the GitHub Release.

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
