# Flicker

**Effect type:** `flicker`

`flicker` applies a deterministic signal that changes the owner surface
between its source and an off paint.

## Properties

| Property | Type | Default | Options or shape |
| --- | --- | --- | --- |
| `appliesOn` | `EffectInput` | `previousEffect` | `base`, `previousEffect` |
| `enabled` | `boolean` | `true` | `true`, `false` |
| `showOriginal` | `ShowOriginal` | `none` | `none`, `front`, `back` |
| `showOriginalDuringOff` | `boolean` | `false` | `true`, `false` |
| `flicker` | `number` | `0.03` | Number from `0` to `1` |
| `offPaint` | `Paint` | Solid `#000000` | `solid`, `linear-gradient`, `radial-gradient` |
| `updateMode` | `FlickerUpdateMode` | `everyFrame` | `everyFrame`, `randomFrames` |
| `maxOffDuration` | `number` | `0` | Non-negative number |

The signal uses the render frame index, so the same render input produces
repeatable results.
