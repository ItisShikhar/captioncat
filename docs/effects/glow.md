# Glow

**Effect type:** `glow`

`glow` paints a colored blurred version of the owner surface. It can paint
outside or inside the source shape.

## Properties

| Property | Type | Default | Options or shape |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | `true`, `false` |
| `mode` | `GlowMode` | `outer` | `outer`, `inner` |
| `color` | `Paint` | Solid white | `solid`, `linear-gradient`, `radial-gradient` |
| `blurRadius` | `number` | `12` | Non-negative number |
| `strength` | `number` | `1` | Number |

An outer glow adds paint margins. The color can use a solid or other supported
paint value.
