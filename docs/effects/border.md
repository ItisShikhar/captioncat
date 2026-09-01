# Border

**Effect type:** `border`

`border` draws a stroke around a component box, rounded path, or rendered
effect layer.

## Properties

| Property | Type | Default | Options or shape |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | `true`, `false` |
| `width` | `number` | `12` | Non-negative number |
| `color` | `Paint` | Solid `#000000` | `solid`, `linear-gradient`, `radial-gradient` |
| `position` | `BoxStrokePosition` | `outer` | `inner`, `center`, `outer` |
| `style` | `StrokeStyle` | `solid` | `solid`, `dashed`, `dotted` |

Outer and centered borders add paint margins.
