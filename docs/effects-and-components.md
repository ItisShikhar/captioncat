# ECS effects and components

*Reference: [Entity Component System (ECS)](https://en.wikipedia.org/wiki/Entity_component_system)*

This page is the entry point for the public ECS reference.

Components define entity data and behavior. Effects post-process an entity
surface or subtree. Property values can be static or animated through the
preset schema.

Each reference page uses the table `Property | Type | Default | Options or shape`.
Custom types identify constrained values or object shapes. Use the literal values
shown in the last column in preset JSON.

## Components

| Component type | Reference |
| --- | --- |
| `animation` | [Animation](components/animation.md) |
| `animationTrigger` | [Animation trigger](components/animation-trigger.md) |
| `backgroundStyle` | [Background style](components/background-style.md) |
| `borderRadius` | [Border radius](components/border-radius.md) |
| `childPaintOrder` | [Child paint order](components/child-paint-order.md) |
| `font` | [Font](components/font.md) |
| `followTarget` | [Follow target](components/follow-target.md) |
| `horizontalSpacer` | [Horizontal spacer](components/horizontal-spacer.md) |
| `image` | [Image](components/image.md) |
| `imageSequencer` | [Image sequencer](components/image-sequencer.md) |
| `layout` | [Layout](components/layout.md) |
| `layoutMotion` | [Layout motion](components/layout-motion.md) |
| `lifecycle` | [Lifecycle](components/lifecycle.md) |
| `markerBehavior` | [Marker behavior](components/marker-behavior.md) |
| `paintOrder` | [Paint order](components/paint-order.md) |
| `selfLayout` | [Self layout](components/self-layout.md) |
| `strikethrough` | [Strikethrough](components/strikethrough.md) |
| `text` | [Text](components/text.md) |
| `transform` | [Transform](components/transform.md) |
| `underline` | [Underline](components/underline.md) |
| `verticalSpacer` | [Vertical spacer](components/vertical-spacer.md) |

## Effects

| Effect type | Reference |
| --- | --- |
| `blendMode` | [Blend mode](effects/blend-mode.md) |
| `border` | [Border](effects/border.md) |
| `blur` | [Gaussian blur](effects/blur.md) |
| `fisheye` | [Fisheye](effects/fisheye.md) |
| `flicker` | [Flicker](effects/flicker.md) |
| `glow` | [Glow](effects/glow.md) |
| `motionBlur` | [Motion blur](effects/motion-blur.md) |
| `noise` | [Noise](effects/noise.md) |
| `replicator` | [Replicator](effects/replicator.md) |
| `shadow` | [Shadow](effects/shadow.md) |
| `streak` | [Streak](effects/streak.md) |
| `stroke` | [Stroke](effects/stroke.md) |
| `typewriter` | [Typewriter](effects/typewriter.md) |
| `vignette` | [Vignette](effects/vignette.md) |
| `wipeReveal` | [Wipe reveal](effects/wipe-reveal.md) |

## Entity kinds

The engine uses these entity kinds:

`viewport`, `videoArea`, `video`, `compositionArea`, `page`, `row`, `image`,
`word`, `marker`, and `background`.

Each reference page lists the entity kinds that accept the component. Effects
do not restrict an entity kind. The effect stack controls where an effect runs.

## Component rules

- Add a component at most once when its page says `allowedQuantity: 1`.
- Keep component properties in the schema format used by [Presets](presets.md).
- Use `enabled: false` when a component supports disabling.
- Keep layout properties on structural entities.
- Keep text and font properties on `word` entities.

## Effect rules

Effects wrap the entity surface or subtree. The stack applies effects in the
authored order. `appliesOn` selects the base surface or the result of the
previous effect when the effect supports that property.

`appliesOn` can be `base` or `previousEffect`. `showOriginal` can be `none`,
`front`, or `back` when an effect exposes those properties.

Effects can add paint margins. Auto-crop uses those margins. Blend modes do not
add margins, but they can change the pixels behind an entity.

## Supporting exports

The component index also exports base classes and helpers. These are not
standalone schema components:

- `Component`, `Spacer`, and `GenericComponent` are base or compatibility types.
- `lifecycle` is a schema component backed by the generic component path.
- `ImageStyle` and `BackgroundPath` define image and background settings.
- Component helper functions create or resolve property maps.

The effect index also exports base classes and helpers:

- `Effect` and `SignalEffect` are base classes.
- `EffectStack` and effect-order helpers manage composition.
- Stroke, pixel, and replicator-fill modules provide shared implementation
  types.

See [Rendering](rendering.md) for effect order and pipeline behavior.
