# Wipe reveal

**Effect type:** `wipeReveal`

`wipeReveal` reveals a state or style through a geometric mask. It is an
entity-level effect for `word`, `row`, and `page`.

## Properties

| Property | Type | Default | Options or shape |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | `true`, `false` |
| `reveal` | `number` | `1` | Number from `0` to `1` |
| `direction` | `WipeRevealDirection` | `logicalStartToEnd` | `logicalStartToEnd`, `logicalEndToStart`, `leftToRight`, `rightToLeft`, `topToBottom`, `bottomToTop` |
| `shape` | `WipeRevealShape` | `rectangle` | `rectangle`, `diagonal` |
| `angle` | `number` | `45` | Degrees |
| `feather` | `number` | `0` | Number from `0` to `1` |
| `fromStyle` | `WipeRevealStyle` | `next` | `default`, `past`, `previous`, `current`, `next`, `future`, `none` |
| `toStyle` | `WipeRevealStyle` | `current` | `default`, `past`, `previous`, `current`, `next`, `future`, `none` |
| `basePlacement` | `WipeRevealBasePlacement` | `back` | `back`, `front`, `none` |

Animation owns the timing. Studio creates a linked enter animation for
`WipeReveal#<effect-id>.reveal`.
