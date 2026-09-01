# Border radius

**Component type:** `borderRadius`

`borderRadius` supplies corner geometry to the owner and to border and
background rendering.

## Accepted entities

`viewport`, `videoArea`, `video`, `compositionArea`, `page`, `row`, `word`,
`marker`, `background`, and `image`.

## Properties

| Property | Type | Default | Options or shape |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | `true`, `false` |
| `borderRadiusMode` | `BorderRadiusMode` | `uniform` | `uniform`, `individual` |
| `borderRadius` | `number` | `16` | Non-negative number |
| `borderTopLeftRadius` | `number` | `16` | Non-negative number |
| `borderTopRightRadius` | `number` | `16` | Non-negative number |
| `borderBottomRightRadius` | `number` | `16` | Non-negative number |
| `borderBottomLeftRadius` | `number` | `16` | Non-negative number |

When `borderRadiusMode` is `uniform`, the uniform value controls every corner.
Use the corner properties for independent radii.
