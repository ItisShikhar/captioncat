# Shadow

**Effect type:** `shadow`

`shadow` paints a blurred offset copy of the owner surface.

## Properties

| Property | Type | Default | Options or shape |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | `true`, `false` |
| `blurRadius` | `number` | `8` | Non-negative number |
| `offset` | `Vector2` | `{ "x": 2, "y": 4 }` | `{ x: number, y: number }` |
| `longShadow` | `boolean` | `false` | `true`, `false` |
| `color` | `Paint` | Solid `#000000` | `solid`, `linear-gradient`, `radial-gradient` |
| `useFontColor` | `boolean` | `false` | `true`, `false` |
| `opacity` | `number` | `1` | Number from `0` to `1` |

`longShadow` extends the shadow along its offset. The shadow adds margins for
the configured blur and offset.
