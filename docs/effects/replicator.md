# Replicator

**Effect type:** `replicator`

`replicator` creates transformed copies of the owner surface. Each copy can
use a position, size, rotation, scale, opacity, and fill override.

## Properties

| Property | Type | Default | Options or shape |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | `true`, `false` |
| `cloneOrdering` | `ReplicatorCloneOrdering` | `backToFront` | `frontToBack`, `backToFront` |
| `showOriginal` | `ShowOriginal` | `front` | `none`, `front`, `back` |
| `cloneCount` | `number` | `3` | Integer from `1` to `1024` |
| `fillMode` | `ReplicatorFillMode` | `inherit` | `inherit`, `random`, `custom` |
| `fillTarget` | `ReplicatorFillTarget` | `base` | `base`, `fullLayer` |
| `fillSeed` | `number` | `0` | Integer |
| `customFills` | `Paint[]` | Red, blue, and green solid paints | Paint values |
| `position` | `Vector2` | `{ "x": 4, "y": 4 }` | `{ x: number, y: number }` |
| `rotation` | `number` | `0` | Degrees |
| `scale` | `Vector2` | `{ "x": 0, "y": 0 }` | `{ x: number, y: number }` |
| `opacity` | `number` | `0` | Number from `0` to `1` |
| `copyIds` | `string[]` | `copy_1`, `copy_2`, `copy_3` | Copy IDs |

`customFills` supplies the palette for custom mode.
