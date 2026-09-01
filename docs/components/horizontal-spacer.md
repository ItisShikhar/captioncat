# Horizontal spacer

**Component type:** `horizontalSpacer`

`horizontalSpacer` adds a gap between words or other horizontal flow items.

## Accepted entities

`row`, `page`, and `viewport`.

## Properties

| Property | Type | Default | Options or shape |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | `true`, `false` |
| `spacing` | `number` | `8` | Number |
| `unit` | `SpacerUnit` | `pt` | `pt`, `%` |

`unit` can use composition points or percentage values. Negative spacing is
allowed and is bounded by the parent content extent.
