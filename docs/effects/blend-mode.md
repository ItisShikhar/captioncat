# Blend mode

**Effect type:** `blendMode`

`blendMode` combines the owner surface with the pixels behind it.

## Properties

| Property | Type | Default | Options or shape |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | `true`, `false` |
| `blendMode` | `BlendMode` | `normal` | `normal`, `multiply`, `screen`, `overlay`, `soft-light`, `hard-light`, `darken`, `lighten`, `difference`, `exclusion` |

## Rendering

The FFmpeg compositor supports final blend-mode layers. It uses the same
semantic mode behavior as the Skia compositor. Blend effects can change video
pixels behind the entity.
