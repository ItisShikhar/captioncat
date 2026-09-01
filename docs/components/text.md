# Text

**Component type:** `text`

`text` defines word paint and text-specific style behavior.

## Accepted entities

`word`.

## Properties

| Property | Type | Default | Options or shape |
| --- | --- | --- | --- |
| `color` | `Paint` | Solid `white` | `solid`, `linear-gradient`, `radial-gradient` |
| `effectsInheritBaseAlpha` | `boolean` | `true` | `true`, `false` |
| `caseTransform` | `TextCaseTransform` | `none` | `none`, `uppercase`, `lowercase`, `capitalize` |
| `letterSpacing` | `number` | `0` | Number |

Use `font` for text metrics. Use effects for post-processing such as stroke,
shadow, blur, or typewriter reveal.
