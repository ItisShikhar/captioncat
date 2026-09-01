# Transform

**Component type:** `transform`

`transform` defines an entity's position, size, rotation, scale, opacity, and
positioning mode.

## Accepted entities

`viewport`, `videoArea`, `video`, `compositionArea`, `page`, `row`, `word`,
`marker`, `background`, and `image`.

## Properties

| Property | Type | Default | Options or shape |
| --- | --- | --- | --- |
| `positioning` | `TransformPositioning` | `flow` | `flow`, `absolute` |
| `position` | `Vector2` | `{ "x": 0, "y": 0 }` | `{ x: number, y: number }` |
| `positionXUnit`, `positionYUnit` | `TransformDimensionUnit` | `pt` | `pt`, `percent` |
| `dimensions` | `Vector2` | `{ "x": 0, "y": 0 }` | `{ x: number, y: number }` |
| `widthUnit`, `heightUnit` | `TransformDimensionUnit` | `pt` | `pt`, `percent` |
| `widthMode`, `heightMode` | `TransformSizeMode` | `custom` | `custom`, `fitParent`, `fitContent`, `fitChildren` |
| `rotation` | `number` | `0` | Degrees |
| `scale` | `Vector2` | `{ "x": 1, "y": 1 }` | `{ x: number, y: number }` |
| `opacity` | `number` | `1` | Number from `0` to `1` |
| `pivot` | `TransformPivot` | `center` | `topLeft`, `topCenter`, `topRight`, `centerLeft`, `center`, `centerRight`, `bottomLeft`, `bottomCenter`, `bottomRight` |

The engine applies rotation, scale, and position around the selected pivot.
