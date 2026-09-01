# Vignette

**Effect type:** `vignette`

`vignette` darkens or modulates pixels toward the edges of the owner surface.

## Properties

| Property | Type | Default | Options or shape |
| --- | --- | --- | --- |
| `appliesOn` | `EffectInput` | `previousEffect` | `base`, `previousEffect` |
| `enabled` | `boolean` | `true` | `true`, `false` |
| `vignette` | `number` | `0` | Number from `0` to `1` |
| `center` | `Vector2` | `{ "x": 0.5, "y": 0.5 }` | `{ x: number, y: number }`, each value from `0` to `1` |
| `aspectCorrection` | `boolean` | `true` | `true`, `false` |

The center uses normalized coordinates. The effect keeps the source bounds and
does not add paint margins.
