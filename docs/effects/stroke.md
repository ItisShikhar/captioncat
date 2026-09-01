# Stroke

**Effect type:** `stroke`

`stroke` draws an outline around the rendered owner surface. It supports solid,
dashed, and dotted line patterns.

## Properties

| Property | Type | Default | Options or shape |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | `true`, `false` |
| `style` | `StrokeStyle` | `solid` | `solid`, `dashed`, `dotted` |
| `alignment` | `StrokeAlignment` | `outside` | `inside`, `center`, `outside` |
| `antialiasScale` | `number` | `2` | Positive number; resolves to `1`, `2`, `4`, or `8` |
| `width` | `number` | `12` | Non-negative number |
| `color` | `Paint` | Solid `#00c853` | `solid`, `linear-gradient`, `radial-gradient` |
| `useFontColor` | `boolean` | `false` | `true`, `false` |
| `joinType` | `LineJoin` | `round` | `miter`, `round`, `bevel` |
| `capType` | `LineCap` | `round` | `butt`, `round`, `square` |
| `dash` | `number` | `24` | Non-negative number |
| `gap` | `number` | `24` | Non-negative number |
| `spacing` | `number` | `20` | Non-negative number |
| `dashOffset` | `number` | `0` | Number |
| `opacity` | `number` | `1` | Number from `0` to `1` |

Stroke alignment and line pattern affect the paint margins and outline shape.
