# captioncat architecture

*Reference: [Entity Component System (ECS)](https://en.wikipedia.org/wiki/Entity_component_system)*

captioncat uses an Entity Component System (ECS) to describe caption scenes.
Entities identify scene objects, components store data and capabilities, and
systems process entities to resolve layout, state, animation, and rendering.

## The problem

Browser Canvas requires a browser runtime. It does not provide a complete media
processing or video encoding pipeline. Font loading and text measurement can
also vary across environments.

FFmpeg is excellent for media processing and encoding. Complex captions require
per-word layout, timing, animations, and effects. These requirements can lead
to large and difficult-to-maintain filter graphs.

## The solution

captioncat uses each tool for what it does best:

- **Skia Canvas** renders caption frames with precise control over text, layout,
  shapes, images, animations, and effects.
- **FFmpeg** handles media processing, compositing, audio, and video encoding.

Skia Canvas runs directly in Node.js without a browser or DOM. This makes it
well suited for server-side rendering.

## How the engine works

The engine applies a preset to each input and resolves its ECS scene for every
frame. The processing model below shows how layout, state, animation,
transitions, and effects produce caption frames.

The [rendering boundaries](#rendering-boundaries) section describes how the
engine passes those frames to Skia Canvas and FFmpeg for each output type.

## The processing model

```text
Input video, audio, captions, or transcript
                    |
                    v
              Render request
                    |
                    v
              Preset document
                    |
                    v
              ECS entity tree
                    |
          +---------+---------+
          |                   |
       Layout             State window
          |                   |
          +---------+---------+
                    |
                    v
        Property, animation, and transition resolution
                    |
                    v
                  Effects
                    |
                    v
             Render request output
```

The engine builds a runtime tree from the preset. It resolves the tree for one
timestamp and one frame. The renderer paints the resolved scene.

## Entities

An entity is a scene object with an identity and an ordered set of children.
Examples include `viewport`, `videoArea`, `compositionArea`, `page`, `row`,
`word`, `marker`, `background`, and flow `image`.

Each persisted entity has a stable, unique `id` in its design tree:

```json
{
  "entity": "word",
  "id": "word:current",
  "components": [],
  "effects": [],
  "children": []
}
```

The engine rejects missing or duplicate entity IDs. Runtime row and word
instances receive deterministic IDs such as `ROW:CURRENT:0` and
`WORD:CURRENT:0`. Cloned auxiliary entities receive deterministic suffixes.

Effect IDs have a narrower scope. An effect ID must be unique within its
owning entity. An animation target identifies an effect with
`Effect#effect-id.property`.

## The scene tree

Bundled presets use this structure:

```text
viewport
├── videoArea
│   └── video
└── compositionArea
    └── page
        ├── row:default
        │   ├── word:default
        │   ├── word:previous
        │   ├── word:current
        │   └── word:next
        ├── row:previous
        ├── row:current
        └── row:next
```

The design can include independent background, marker, image, and spacer
entities. The `forEntityId` field identifies an entity that owns a dependent
visual entity.

Parent-child order affects layout and paint order. The runtime keeps
`Transform` as the first component on each entity. The order of other
components and effects remains part of the scene contract.

## Components

Components describe what an entity has or how it behaves. The main component
groups are:

| Group | Components |
| --- | --- |
| Structure | `Layout`, `SelfLayout`, `LayoutMotion`, `Transform` |
| Text | `Text`, `Font`, `Underline`, `Strikethrough` |
| Paint | `BackgroundStyle`, `BorderRadius`, `PaintOrder`, `Image`, `ImageStyle` |
| Spacing | `HorizontalSpacer`, `VerticalSpacer` |
| Animation | `Animation`, `AnimationTrigger`, `ImageSequencer` |
| Dependency | `FollowTarget`, `MarkerBehavior` |

`VerticalSpacer` sets the gap between vertical flow children on a Page or
Viewport. `HorizontalSpacer` sets the gap between horizontal flow children on
a Page or Viewport, or between words on a Row.

Every property uses a typed value. A property can also contain transition,
randomizer, and animation data when the component supports those features.

## Effects

Effects operate on the painted output of an entity or component. They do not
represent additional physical entities.

The current effect set includes:

- `Border`
- `GaussianBlur`
- `Glow`
- `ImageOutline`
- `MotionBlur`
- `Replicator`
- `Shadow`
- `Stroke`
- `Typewriter`

An effect can add margins to the rendered bounds. The layout and crop systems
use those margins when they calculate the output frame.

Component effects are scoped to the component that owns them. For example, a
stroke attached to `BackgroundStyle` affects the background paint and not the
text paint.

## State resolution

Caption states describe the word or row position relative to the active word:

```text
past -> previous -> current -> next -> future
```

The preset stores default, previous, current, and next templates. The state
window selects how many items remain visible around the active item. The
runtime instantiates the required row and word entities for the current
timestamp.

Lifecycle values add a render-time distinction:

- `incoming` identifies the word that becomes current.
- `outgoing` identifies the word that becomes previous.
- `static` identifies other visible words.

This lets a lifecycle effect animate a transition without adding synthetic
entities to the preset.

## Value resolution

The engine resolves a property in layers:

```text
Preset value
    |
    v
Component or effect property
    |
    v
State template
    |
    v
Animation track
    |
    v
Transition
    |
    v
Follow binding
    |
    v
Resolved value for the frame
```

The exact layers depend on the property and the active systems. A resolved
value is the value that the component receives during painting.

## Transition policies

Transition metadata stays on each property leaf. The editor copies shared
metadata across matching state templates without copying authored values.

The default policy applies across state changes. It uses the previous displayed
value, so a retarget starts from the value visible in the current frame.

The previous-state policy uses the last settled target. The explicit policy
uses `initialValue` when it exists. A first observation displays immediately by
default. Authors can select a first-appearance transition and provide an
explicit start value.

Scope controls which state templates receive transition metadata. It does not
create a separate runtime history. The evaluator uses `transitionKey` when a
property provides one; otherwise it uses the property's structural path. This
keeps one logical handoff across regenerated lifecycle scenes. Properties
without enabled transitions settle their desired value, so a later state-scoped
transition can start from the preceding state's displayed or settled value.

Animation targets use component paths:

```text
Text.letterSpacing
Transform.position.x
```

Effect targets include the effect ID:

```text
Blur#blur-1.blurRadius
Typewriter#typewriter-1.reveal
```

## Layout

The layout system calculates bounds in composition units. A viewport contains
the video area and the composition area. The composition area contains pages.
Pages contain rows, and rows contain words.

Caption Layout controls page and row grouping. `rowsPerPage` and `wordsPerRow`
define maximum capacities. They do not change source text or word timestamps.
The policy preserves source cue boundaries and explicit line breaks by default.

The engine supports stable and dynamic flow modes. Stable mode keeps the crop
and placement fixed across caption frames. Dynamic mode permits layout changes
when the active scene changes.

## Rendering boundaries

The ECS pipeline returns caption frames and placement metadata. The engine keeps
these raw RGBA buffers in memory for the requested visual outputs. A PNG writer
encodes its own copy, and a standalone caption movie streams the buffers to
FFmpeg through stdin.

When the caption-only canvas and FPS match the input video, the overlay
compositor receives the same generated buffers. Otherwise, the engine generates
an overlay-specific frame set because its canvas and timing can differ.

Two overlay pipelines remain active:

1. `ffmpeg-compositor` composites caption frames and final blend-mode layers
   with the source video in FFmpeg.
2. `skia-compositor` decodes source frames and blends caption pixels and
   final blend-mode layers in Node.js.

The Skia pipeline falls back to the FFmpeg pipeline when video transforms or an
unknown variable frame rate prevents direct frame compositing.

## Compatibility rules

Preset documents must declare `schemaVersion: 1`. Missing and unsupported
versions do not load.

Stable entity IDs are part of the preset contract. New preset features must
preserve existing IDs.

The current engine supports one active page per composition area. Multi-page
surfaces, speaker bindings, tracking bindings, and independent surface
timelines remain V2 design work.
