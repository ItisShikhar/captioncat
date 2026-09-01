# Child paint order

**Component type:** `childPaintOrder`

`childPaintOrder` controls the paint order of an entity's direct children. It
does not change layout order.

## Accepted entities

All orderable entity kinds: `viewport`, `videoArea`, `video`,
`compositionArea`, `page`, `row`, `image`, `word`, `marker`, and `background`.

## Properties

| Property | Type | Default | Options or shape |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | `true`, `false` |
| `mode` | `ChildPaintOrderMode` | `source` | `source`, `zIndex`, `alternate`, `custom`, `random` |
| `direction` | `ChildPaintOrderDirection` | `descending` | `ascending`, `descending` |
| `backZIndex` | `number` | `0` | Number |
| `frontZIndex` | `number` | `1` | Number |
| `start` | `ChildPaintOrderStart` | `back` | `back`, `front` |
| `values` | `number[]` | `[]` | Numeric order values |
| `offset` | `number` | `0` | Integer |
| `seed` | `number` | `0` | Integer |

`alternate` uses `backZIndex` and `frontZIndex`. `custom` repeats `values`
with `offset`. `random` uses a stable `seed`.

## Notes

The engine sorts a copy of the child list after layout. Equal depths preserve
authored order. Marker groups keep their existing precedence.
