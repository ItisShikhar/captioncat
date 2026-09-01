# Typewriter

**Effect type:** `typewriter`

`typewriter` reveals text units over time. It can show a cursor during the
reveal and supports lifecycle or explicit reveal control.

## Properties

| Property | Type | Default | Options or shape |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | `true`, `false` |
| `revealMode` | `TypewriterRevealMode` | `lifecycle` | `lifecycle`, `manual` |
| `durationMode` | `TypewriterTimingMode` | `auto` | `auto`, `fixed` |
| `reveal` | `number` | `1` | Number from `0` to `1` |
| `durationSeconds` | `number` | `0.8` | Non-negative number |
| `delaySeconds` | `number` | `0` | Non-negative number |
| `unitDurationSeconds` | `number` | `0.18` | Non-negative number |
| `direction` | `TypewriterDirection` | `forward` | `forward`, `reverse` |
| `unitTracks` | `TypewriterUnitTrack[]` | `[]` | `{ enabled, target: unit.opacity/scale/offset/rotation/color, keyframes, mode?, sampling?, updateEveryFrame? }` |

## Cursor properties

Cursor properties use the `cursor.*` prefix:

| Property | Type | Default | Options or shape |
| --- | --- | --- | --- |
| `cursor.enabled` | `boolean` | `true` | `true`, `false` |
| `cursor.preset` | `CursorPreset` | `mac` | `mac`, `windows`, `ios`, `android`, `old`, `caret`, `caret-bold`, `block`, `square`, `underscore`, `custom` |
| `cursor.shape` | `CursorShape` | `caret` | `caret`, `block`, `square`, `underscore`, `glyph` |
| `cursor.glyph` | `string` | &#124; | Any string |
| `cursor.colorMode` | `CursorColorMode` | `original` | `original`, `tint` |
| `cursor.color` | `Paint` | Solid white | `solid`, `linear-gradient`, `radial-gradient` |
| `cursor.size` | `number` | `0` | Non-negative number |
| `cursor.offset` | `Vector2` | `{ "x": 0, "y": 0 }` | `{ x: number, y: number }` |
| `cursor.opacity` | `number` | `1` | Number from `0` to `1` |
| `cursor.showDuringReveal` | `boolean` | `true` | `true`, `false` |
| `cursor.showOnStart` | `boolean` | `false` | `true`, `false` |
| `cursor.showWhenComplete` | `boolean` | `false` | `true`, `false` |
| `cursor.blink.enabled` | `boolean` | `true` | `true`, `false` |
| `cursor.blink.rate` | `number` | `2` | Non-negative number |
| `cursor.blink.dutyCycle` | `number` | `0.5` | Number from `0` to `1` |
| `cursor.blink.phaseOffset` | `number` | `0` | Number |

Cursor properties use the `cursor.*` prefix. The default cursor is enabled,
uses the `mac` preset, and shows during reveal. Cursor blink is enabled at a
rate of `2` with a duty cycle of `0.5`.

The effect uses the entity text units. It does not change layout dimensions.
