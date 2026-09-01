# Streak

**Effect type:** `streak`

`streak` is a directional motion blur. It renders faded copies only in the
configured direction.

## Properties

| Property | Type | Default | Options or shape |
| --- | --- | --- | --- |
| `appliesOn` | `EffectInput` | `previousEffect` | `base`, `previousEffect` |
| `enabled` | `boolean` | `true` | `true`, `false` |
| `steps` | `number` | `8` | Integer from `0` to `256` |
| `angle` | `number` | `0` | Degrees |
| `distance` | `number` | `8` | Number |
| `maxOpacity` | `number` | `0.7` | Number from `0` to `1` |
| `showOriginal` | `ShowOriginal` | `none` | `none`, `front`, `back` |

The effect adds margins for its travel.
