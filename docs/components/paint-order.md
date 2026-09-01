# Paint order

**Component type:** `paintOrder`

`paintOrder` assigns a numeric depth to an entity among its siblings.
It does not change layout position or child flow.

## Accepted entities

`viewport`, `videoArea`, `video`, `compositionArea`, `page`, `row`, `image`,
`word`, `marker`, and `background`.

## Properties

| Property | Type | Default | Options or shape |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | `true`, `false` |
| `zIndex` | `number` | `0` | Number |

Higher values paint later and appear above lower values. Equal values preserve
authored child order. Use `childPaintOrder` to choose a sorting strategy.

## Notes

The scope is one parent and its direct children. A word cannot cross its row
stacking boundary.
