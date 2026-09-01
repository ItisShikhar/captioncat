# Noise

**Effect type:** `noise`

`noise` adds deterministic RGB noise to the owner surface. It preserves alpha.

## Properties

| Property | Type | Default | Options or shape |
| --- | --- | --- | --- |
| `appliesOn` | `EffectInput` | `previousEffect` | `base`, `previousEffect` |
| `enabled` | `boolean` | `true` | `true`, `false` |
| `static` | `boolean` | `false` | `true`, `false` |
| `noise` | `number` | `0.04` | Number from `0` to `1` |

When `static` is `true`, all frames use the same noise field. Otherwise the
render frame changes the field.
