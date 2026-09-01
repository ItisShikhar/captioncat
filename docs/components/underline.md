# Underline

**Component type:** `underline`

`underline` draws a line below a word.

## Accepted entities

`word`.

## Properties

| Property | Type | Default | Options or shape |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | `true`, `false` |
| `width` | `number` | `0` | Non-negative number |
| `protrusion` | `number` | `0` | Number |
| `offset` | `Vector2` | `{ "x": 0, "y": 0 }` | `{ x: number, y: number }` |
| `color` | `Paint` | Transparent black | `solid`, `linear-gradient`, `radial-gradient` |
| `capType` | `LineCap` | `round` | `butt`, `round`, `square` |
| `renderOrder` | `RenderOrder` | `behind` | `behind`, `inFront` |

Zero width disables visible line paint. The line can render behind or in front
of the word surface.
