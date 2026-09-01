# Background style

**Component type:** `backgroundStyle`

`backgroundStyle` paints a fill behind the owner. It supports rounded
rectangles, content-derived bands, speech tails, padding, and background
effects.

## Accepted entities

`viewport`, `videoArea`, `video`, `compositionArea`, `page`, `row`, `word`,
`marker`, and `background`.

## Properties

| Property | Type | Default | Options or shape |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | `true`, `false` |
| `fill` | `Paint` | Solid `#e5e7eb` | `solid`, `linear-gradient`, `radial-gradient` |
| `effectsInheritBaseAlpha` | `boolean` | `true` | `true`, `false` |
| `fillPattern` | `FillPattern` | Single pattern with no colors | `{ type: "pattern", pattern: single/cycle/alternate, colors: string[], offset: integer }` |
| `pathShape` | `BackgroundPathShape` | `rounded` | `rounded`, `pill`, `iMessage`, `ticket`, `cloud`, `comicBook` |
| `tailSide` | `BackgroundPathTailSide` | `auto` | `auto`, `left`, `right` |
| `tailSize` | `number` | `1` | Number from `0` to `4` |
| `borderRadiusMode` | `BorderRadiusMode` | `uniform` | `uniform`, `individual` |
| `borderRadius` | `number` | `0` | Non-negative number |
| `borderTopLeftRadius` | `number` | `0` | Non-negative number |
| `borderTopRightRadius` | `number` | `0` | Non-negative number |
| `borderBottomRightRadius` | `number` | `0` | Non-negative number |
| `borderBottomLeftRadius` | `number` | `0` | Non-negative number |
| `boundsMode` | `BackgroundStyleBoundsMode` | `fillSelf` | `fillSelf`, `tight`, `full` |
| `overflowMode` | `BackgroundStyleOverflowMode` | `visible` | `visible`, `clipToOwner` |
| `coverageMode` | `BackgroundStyleCoverageMode` | `all` | `all`, `throughCurrent` |
| `bandPadding.*` | `Insets` | `0` and linked | `{ top, right, bottom, left: number }` |
| `blockPadding.*` | `Insets` | `0` and linked | `{ top, right, bottom, left: number }` |
| `offset` | `Vector2` | `{ "x": 0, "y": 0 }` | `{ x: number, y: number }` |
| `scale` | `Vector2` | `{ "x": 1, "y": 1 }` | `{ x: number, y: number }` |

## Notes

The background stays in the owner subtree. Layout motion updates its geometry
after the moved rows resolve.
