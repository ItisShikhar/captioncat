# Font

**Component type:** `font`

`font` selects the typeface and text metrics for a word.

## Accepted entities

`word`.

## Properties

| Property | Type | Default | Options or shape |
| --- | --- | --- | --- |
| `family` | `string[]` | `[]` | Font-family names in priority order |
| `size` | `number` | `60` | Positive number |
| `weight` | `number` | `400` | Number from `1` to `1000` |
| `style` | `FontStyle` | `normal` | `normal`, `italic`, `oblique` |
| `emojis.family` | `string[]` | `[]` | Font-family names in priority order |
| `emojis.sizeScale` | `number` | Font registry default | Number from `0.5` to `1.5` |
| `emojis.baselineOffset` | `number` | Font registry default | Number from `-0.5` to `0.5` |
| `emojis.alignmentMode` | `FontEmojiAlignmentMode` | `optical` | `optical`, `baseline` |

`family` and `emojis.family` contain font-family names in priority order.
The renderer uses its configured font source and fallback rules.

## Preset storage

The preset stores a font family as a `fontFamily` property. It stores an
ordered array of strings, not the font file itself.

```json
{
  "component": "font",
  "props": {
    "family": {
      "type": "fontFamily",
      "value": [
        "https://fonts.googleapis.com/css2?family=Inter:wght@400;700",
        "Arial",
        "sans-serif"
      ]
    },
    "size": {
      "type": "number",
      "value": 60
    },
    "weight": {
      "type": "fontWeight",
      "value": 700
    },
    "style": {
      "type": "string",
      "value": "normal"
    }
  }
}
```

The renderer tries each family in array order. A family value can be:

- A registered or bundled family name, such as `Arimo`.
- A Google Fonts CSS URL.
- A direct `.ttf`, `.otf`, `.woff`, or `.woff2` URL.
- A CSS fallback family, such as `sans-serif`.

Remote font sources need network access. The renderer downloads and registers
the font before it measures text. A local font path can work on the machine
that renders the preset, but it is not portable and does not embed the file.

The `size`, `weight`, and `style` values are stored separately from
`family`. For the complete font loading order and offline behavior, see
[Rendering](../rendering.md#font-loading).
