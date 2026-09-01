# Image

**Component type:** `image`

`image` paints an asset inside the owner box. It supports bundled, custom, and
data-backed assets through the engine asset registry.

## Accepted entities

`viewport`, `videoArea`, `video`, `compositionArea`, `page`, `row`, `word`,
`marker`, and `image`.

`background` does not currently accept the `image` component. Use a separate
image or background entity when you need an image behind another entity.

## Properties

| Property | Type | Default | Options or shape |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | `true`, `false` |
| `assetSource` | `ImageAssetSource` | `bundled` | `bundled`, `custom` |
| `asset` | `BuiltinImageAsset` | Engine default bundled asset | Bundled asset ID |
| `customAsset` | `string` | Empty | Custom asset source |
| `aspectRatio` | `ImageAspectRatio` | `maintain` | `maintain`, `stretchToFit`, `custom` |
| `customAspectRatio` | `ImageCustomAspectRatio` | `16:9` | `9:16`, `16:9`, `1:1`, `4:3`, `3:4` |
| `renderOrder` | `ImageRenderOrder` | `belowChildren` | `belowChildren`, `aboveChildren` |
| `colorMode` | `ImageColorMode` | `tint` | `original`, `tint`, `solid` |
| `color` | `Paint` | Engine default image color | `solid`, `linear-gradient`, `radial-gradient` |

An `image` entity can participate in row and page flow. Its transform controls
its dimensions and positioning.
