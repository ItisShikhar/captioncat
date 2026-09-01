# captioncat Preset Studio

A visual editor for captioncat caption style presets. It removes the need to
hand-edit the large nested JSON files in
`assets/json/caption-style-presets/`.

Everything runs in the browser. There is nothing to host. Build it once, or
grab a pre-built copy from the
[latest release](../../releases/latest). See
[Getting the tool](#getting-the-tool), then open that HTML file directly

- by double-clicking it, dragging it into a browser tab, or opening it
  straight from a local GitHub checkout. There's no server or upload involved in
  creating or editing a preset. Bundled fonts work offline; registry fonts with
  remote sources are fetched only when a design needs them.

## Why this exists

Caption style presets are ECS (entity-component-system) documents: a `design`
entity tree (`compositionArea > page > row > word` states) where every entity
carries **components** (background, border, font, text, stroke, shadow,
underline, strikethrough, layout, transform, params) and **effects** (blur,
motion blur, replicator), and every leaf property carries its own `type`, `value`, and
optional `animation`/`transition` metadata. This tool renders that entity tree
into a proper form UI (React + Tailwind + shadcn/ui), previews the result live
using the _real_ ECS caption rendering engine through the browser package, and
writes changes back out as the exact same JSON shape the engine consumes.

The engine exposes this rendering contract through
`@captioncat/caption-engine/browser`. The Studio uses that entry point instead
of importing engine implementation modules.

## Getting Preset Studio

**Option A - Download the standalone app:**

Grab `captioncat-preset-studio-v<version>.html` from the
[latest release](../../releases/latest) and
open it directly in a browser - nothing to install or build.

> The workflow publishes a new release for a version tag or a manual dispatch (see
> [Releases workflow](#releases-workflow)).

Studio is a private package and is not published to npm. Its package version is
build metadata only. The root
[`package.json`](../../package.json) version controls the engine release, the
GitHub Release, and the Studio HTML filename.

**Option B - Build it yourself:**

Use Node.js `22.0.0` or later to build the
studio.

> Older versions may work, but are not officially supported.

```bash
npm install                    # engine dependencies
npm run build                  # build the engine package
cd tools/preset-studio
npm install                    # Studio dependencies
npm run build                  # build the Studio
```

This produces a single HTML file:
`tools/preset-studio/dist/captioncat-preset-studio-v<root-engine-version>.html`.
The file
contains the Studio application, styles, and bundled presets, so you can open it
directly without a server. By default, registry font binaries are excluded.
Google Fonts and CDN sources load when the browser has network access.

The build-time switch lives in
`tools/preset-studio/src/engine-adapters/font-bundle-config.ts`:
`BUNDLE_FONTS_WITH_REMOTE_SOURCES = false` keeps the HTML small and uses the
registry Google/CDN sources. Set it to `true` only for a fully offline Studio
bundle with local copies of every registry family.

`dist/` is gitignored - it's a build artifact, not something committed to
the repo. The Releases workflow is the supported way to distribute a
pre-built copy; see below.

## Using the studio

### Preview rendering

Live, full-cycle, state, and thumbnail previews render in browser workers.
The main thread stays available for editor input. Chrome and Edge support this
path. Browsers without preview workers show an unavailable preview instead of
running the renderer on the main thread.

Use the download button in any preview playback control bar to export the
visible frame as a PNG. The file name uses
`<presetId>_<lang>_<frameNum>.png`, where `frameNum` starts at 1.

Preset JSON files can set a string `preview.aspectRatio` width-to-height ratio:

- `"16:9"` for 16:9
- `"9:16"` for 9:16
- `"1:1"` for 1:1
- `"4:3"` for 4:3
- `"3:4"` for 3:4

The Studio uses this value when it first opens a preset. If you select another
aspect, the Studio remembers that choice for the preset until the page reloads.

### The preset library (left sidebar)

- Every preset bundled in `assets/json/caption-style-presets/` loads
  automatically, grouped under **Bundled Presets**.
- **Open preset(s)** lets you load additional preset `.json` files from
  disk (native file picker, or an `<input type="file">` fallback on
  browsers without the File System Access API). Loaded presets appear
  under a separate **Custom Presets** group.
- You can also just **drag and drop** one or more `.json` files anywhere
  onto the window to import them the same way.
- Click a preset in the sidebar to select it; use the ⋮ menu on each entry
  to **rename** or **duplicate** it in place.

### Creating and exporting

The toolbar above the editor now uses a **File** menu, plus a light/dark
mode toggle on the far right:

- **New** - creates a fresh starter preset based on the default Arimo/white
  config.
- **Open** - opens more preset `.json` files from disk.
- **Export** - writes your current edits under a new name, leaving the
  original untouched. The dialog includes the preferred preview aspect ratio.
- **Duplicate** - creates another in-memory copy of the current preset right away.
- The File menu is ordered as: **New**, **Open**, **Export**, **Duplicate**.
- An **"Unsaved changes"** badge appears next to the preset name whenever
  it has been edited but not yet saved.

> Browser note: the File System Access API (in-place export without
> a download) is currently Chromium-only (Chrome, Edge, etc.). Firefox and
> Safari - and any browser opening the file over `file://` without that
> API - automatically fall back to downloading a new `.json` file for every
> export, which you then move/rename manually. Nothing is ever silently lost;
> every export path either writes to disk in place or downloads a file.

### Editing a preset

The right-side editor is split into two columns, Unity-style:

- **Hierarchy** - the left sub-column lists the entity tree (`compositionArea >
page > row > word`) and lets you pick which entity to inspect. Each entity
  has an add menu; independent Background entities appear under Entities and
  retain their selected target separately from their hierarchy parent.
- **Inspector** - the right sub-column shows the selected entity's components
  and effects.

Each component/effect exposes a full form for **every property that it can
carry** - including ones the preset file omits. Presets only store the values
that differ from the engine's defaults, so a canonical "all properties" schema
(`src/schema/entity-schema.ts`) is overlaid at display time to surface every
editable field with its default; anything you leave at its default is pruned
back out again when the preset is saved, so files stay minimal. Every property
type the engine supports has a control.

The persisted preset contract belongs to the engine. The Studio schema is a
normalized editor state and a display schema. It is not a second preset format.

Every property type the engine supports has a control:

- **Numbers** - plain numeric inputs, rounded to three decimal places when
  committed and exported, and clamped to sane min/max ranges where needed
  (for example, opacity 0–1 and blur radius ≥ 0).
- **Colors** - a native color-picker swatch plus a hex/rgba text input.
- **Vectors / offsets** - paired X/Y number inputs.
- **Word transforms** - every word shows a `transform` block in the inspector;
  if the preset omits it, the engine/preview default to offset `(0,0)`,
  scale `(1,1)`, rotation `0`, and opacity `1`.
- **Addable component chips** - the entity card header shows the components
  you can still add for that entity, including nested ones like `stroke` or
  `shadow` under `text`; chips disappear once their per-entity cap is reached.
- **Booleans** - switches. A component's `enabled` flag is hoisted into its
  card header so you can toggle whole components (backgrounds, decorations,
  etc.) on and off at a glance.
- **Enums** (alignment, ease type, etc.) - dropdown selects.
- **Fonts** - pick from the shared registry, choose a bundled family, paste a
  Google Fonts (or any other) URL, or type a plain CSS fallback name
  (`sans-serif`, etc.). Registry remote sources load on demand and bundled
  local sources are registered only for variants used by the current design.
  Entries form an ordered font stack with reorder/remove controls - the first
  entry is the primary font, the rest are fallbacks.
- **Lists** (font stacks, and any other array-of-object field) - add,
  remove, and reorder as many entries as you like via a dedicated list
  editor; each entry gets the same full form as any other object.
- **Randomizers** - enum-backed string values use the same dropdown options as
  the base field, so randomized picks stay constrained to valid values.
- **Animatable fields** - anything the engine supports animating gets an
  inline keyframe editor: add/remove keyframes at arbitrary times, edit
  each keyframe's value, and reorder them. Closed-enum string fields (for
  example `textAlignment`) render keyframes as dropdowns instead of free-text
  inputs.
- **Property transitions** - transitionable fields expose a small affordance for
  reactive tween timing, duration, and easing. This is separate from authored
  keyframe animation: transitions respond to resolved value changes.

Fields you don't recognize are still fully editable - if a new property
doesn't have a bespoke control yet, it renders as a raw JSON editor so
nothing is ever locked out.

### Row and word states (Default / Current / Previous / Next)

Rows and words are styled per lifecycle state - a word looks different when it
is the currently-spoken word versus one already spoken or not yet reached. In
the ECS document these states are sibling entities (`word:default`,
`word:previous`, `word:current`, `word:next`, and the row equivalents). The
inspector shows **Default / Current / Previous / Next** tabs for those entity
families so you can switch between state overrides quickly:

- **Default** is the base style every state inherits from when it has no
  override of its own.
- The other tabs show an **"Override this state"** button when that state is
  currently inheriting the default; clicking it seeds a full copy of the
  default that you can then diverge. A state that already overrides the default
  is marked with a small dot and offers **"Reset to Default"** to drop the
  override and inherit again.
- Overrides are stored as complete styles (the engine uses a present state
  verbatim rather than merging it over the default), which the studio handles
  for you - you just edit the tab you care about.

> Presets also carry a small separate `preview` property tree (style-picker
> swatch metadata, distinct from the live canvas preview above) that the
> studio round-trips byte-for-byte on save but doesn't expose its own editor
> for - it isn't something you typically need to hand-tune.

### Live preview

The **live preview workspace** renders the current preset's design through the
**real captioning engine**. It uses the same rendering code path as video
exports. The browser package runs this code in the Studio. The workspace uses one
graph-paper surface. The Hierarchy and Inspector are floating panes over this
surface. Each pane has a vertical resize handle.

- Switch the **aspect ratio** between landscape (16:9), portrait (9:16),
  square (1:1), and 4:3 to check how the preset looks across formats.
- Switch the **sample background** to preview against a few different
  placeholder scenes (the tool ships with procedurally-drawn backgrounds,
  not photos, so it works fully offline).
- **Play/Pause** the loop at any time.
- Re-renders automatically (debounced) whenever you change the design.
- Each preset in the sidebar also shows a small single-frame thumbnail,
  rendered through the same real engine, as a quick visual hint of its style.

## Development

This is a normal Vite + React + TypeScript project:

```bash
npm install
npm run dev                      # local dev server with HMR
npm run build                    # produces a single self-contained versioned HTML file
npm run lint                     # oxlint
npm run validate:presets         # round-trips every bundled preset through the schema parser/serializer
npm run verify:browser-engine    # renders every bundled preset through the real engine in a real browser
npm run verify:single-file-build # builds, then opens the versioned HTML via file:// and exercises the full UI
```

The production build inlines all JS/CSS into one `.html` file (via
`vite-plugin-singlefile`) so the finished tool can be opened directly from
disk (`file://`) with no server or bundler. In the default build, registry
fonts request their Google/CDN source when a design uses them. The engine still
tries each local source before its ordered remote fallbacks. Enable
`BUNDLE_FONTS_WITH_REMOTE_SOURCES` for a fully offline build.

## Releases workflow

The built `dist/captioncat-preset-studio-v<version>.html` is a ~4 MB generated artifact in the default
remote-font mode, or about 33 MB when
`BUNDLE_FONTS_WITH_REMOTE_SOURCES` is enabled for a fully offline bundle -
it's gitignored
and intentionally **not** committed to the repo (that would grow the repo's
history unboundedly on every rebuild). Instead, `.github/workflows/preset-studio-release.yml`:

1. Runs when a `v<version>` tag is pushed and can also be triggered manually
   (`workflow_dispatch`).
2. Installs dependencies and runs the same validation used locally
   (`validate:presets`, `verify:browser-engine`, `verify:single-file-build`, `lint`)
   before building, so a broken build never gets released.
3. Publishes `dist/captioncat-preset-studio-v<version>.html` as an asset on the
   `captioncat Preset Studio (v<version>)` GitHub Release and marks it as the
   repo's
   **latest** release.

The workflow does not increment versions. Before a new release, update the
version in the root `package.json`, commit that change, create the matching
`v<version>` tag, and push the tag. A manual run fails with a version-bump
message when that version already has a remote tag.

See the [captioncat release guide](../../docs/releasing.md) for the complete
maintainer procedure.

The latest verified Studio build is also deployed to
[GitHub Pages](https://itisshikhar.github.io/mcaptioncat/captioncat-preset-studio/). The
release asset remains available for offline use.

This keeps the repo itself lean while still giving anyone a one-click,
Node-free way to grab a ready-to-use copy from the
[Releases](../../releases) page.

## Project layout

```
src/
  schema/         ecs-tree.ts (ECS entity/component/effect document + parse/serialize)
                  entity-schema.ts (canonical "all properties" overlay + defaults, merge-for-display / prune-on-write, row/word state helpers)
                  field-metadata.ts (per-field enum options, min/max, labels)
                  property-tree.ts (generic leaf property types + walker for the form UI)
                  also: preset.ts (PresetEditorState adapter), font-manifest.ts (bundled fonts + Google Fonts URL support)
  engine-adapters/ Studio adapters for local fonts, worker asset rasterization,
                   and preview-worker transport
  (The rendering API itself lives in @captioncat/caption-engine/browser.)
  ui/
    panels/       DesignEditor - recursively renders the ECS entity tree (entities > components > effects)
                  PropertyTreeView - recursively renders a form from the leaf-property schema walker
    controls/     reusable field controls (number, color, vector2, list editor, font picker,
                  keyframe/animation editor, transition editor, raw JSON fallback)
    preview/      live canvas preview player (aspect ratios, sample backgrounds, sample script,
                  render/playback hooks, the canvas player itself)
    library/      preset gallery: sidebar (+ per-row real-engine thumbnails via use-preset-thumbnail.ts),
                  toolbar (new/save/save-as/open), rename/duplicate dialogs
    shadcn/       shadcn/ui components (managed via `npx shadcn@latest add ...`)
    theme-toggle.tsx  light/dark mode toggle (wraps next-themes)
  state/          in-memory preset store (preset-library.ts): selection, dirty tracking, import/duplicate/rename
  lib/            file-io.ts - File System Access API + drag-drop + download-fallback disk I/O
scripts/
  validate-presets.ts           round-trips every bundled preset JSON through parse -> serialize
  verify-browser-engine.cjs     regression test: real engine renders every bundled preset in a real browser
  verify-single-file-build.cjs  regression test: the built versioned HTML works end-to-end over file://
```

## Keeping pace with new engine features

The engine will keep growing (new components, effects, entities, etc.).
Adding a new field type should mostly mean:

1. Extend the schema in `schema/` (`property-tree.ts` for generic leaf
   value/animation/transition types, `ecs-tree.ts` if it's a new
   entity/component/effect shape, `preset.ts` if it's a new top-level shape)
   so the walkers recognize the new field(s). Also add the new
   component/property (with its engine default) to `entity-schema.ts` so it
   shows up in the editor even for presets that don't set it, and give it
   options/ranges in `field-metadata.ts` if it's an enum or bounded number.
   **Keep `entity-schema.ts` defaults in lockstep with the engine's own
   defaults** - the prune-on-write step drops any value equal to the schema
   default, so a mismatch could silently strip an intentionally-authored value.
2. Add a control in `ui/controls/` for any genuinely new value type - most
   new fields will already be composed of existing primitives (numbers,
   colors, vectors, enums, lists) and need no new control at all.
3. If the field should be animatable, make sure it flows through the
   existing `AnimationEditor`/`TransitionEditor` machinery rather than a
   bespoke one-off.

Nothing needs to be hand-wired per field beyond that - the editor is
generated from the entity tree and leaf schema, not hard-coded per preset
shape. The Studio calls the engine's
`@captioncat/caption-engine/browser` entry point, so any new rendering feature
is automatically exercised by the live preview and the
`verify:browser-engine` regression test. Keep platform behavior in the engine.
Add a Node implementation and a browser implementation under the engine
platform modules when a new renderer dependency needs platform-specific code.
Do not add a Studio alias for an engine module or dependency.
