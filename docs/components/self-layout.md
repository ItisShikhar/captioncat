# Self layout

**Component type:** `selfLayout`

`selfLayout` controls how an entity aligns inside the space assigned by its
parent. It also defines aspect-ratio behavior.

## Accepted entities

`viewport`, `videoArea`, `video`, `compositionArea`, `page`, `row`, `word`,
`background`, and `image`.

## Properties

| Property | Type | Default | Options or shape |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | `true`, `false` |
| `aspectRatio` | `SelfLayoutAspectRatio` | `maintain` | `maintain`, `stretchToFit`, `custom` |
| `customAspectRatio` | `SelfLayoutCustomAspectRatio` | `16:9` | `9:16`, `16:9`, `1:1`, `4:3`, `3:4` |
| `horizontalAlignment` | `SelfLayoutHorizontalAlignment` | `center` | `auto`, `start`, `center`, `end`, `left`, `right`, `stretch` |
| `verticalAlignment` | `SelfLayoutVerticalAlignment` | `center` | `auto`, `top`, `center`, `bottom`, `stretch` |
| `horizontalSingleItemAlignment` | `SelfLayoutSingleItemAlignment` | `start` | `start`, `center`, `end`, `justify` |
| `verticalSingleItemAlignment` | `SelfLayoutSingleItemAlignment` | `start` | `start`, `center`, `end`, `justify` |

Use `selfLayout` for cross-axis alignment of flow images and other children.
