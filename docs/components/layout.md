# Layout

**Component type:** `layout`

`layout` controls child flow, alignment, sizing, and visible child windows.

## Accepted entities

`viewport`, `videoArea`, `video`, `compositionArea`, `page`, and `row`.

## Properties

| Property | Type | Default | Options or shape |
| --- | --- | --- | --- |
| `padding.top`, `.right`, `.bottom`, `.left` | `number` | `0` | Number |
| `padding.linkedTopBottom` | `boolean` | `true` | `true`, `false` |
| `padding.linkedLeftRight` | `boolean` | `true` | `true`, `false` |
| `childWindow.windowMode` | `LayoutChildWindowMode` | `all` | `all`, `count` |
| `childWindow.windowCount` | `number` | `1` | Positive integer |
| `childWindow.windowAxis` | `LayoutChildWindowAxis` | `vertical` | `horizontal`, `vertical` |
| `childWindow.windowAnchor` | `LayoutChildWindowAnchor` | `start` | `start`, `center`, `end` |
| `childWindow.windowSelection` | `LayoutChildWindowSelection` | `anchor` | `anchor`, `motionFocus` |
| `childrenSizing` | `LayoutChildrenSizing` | `constrained` | `constrained`, `allowOverflow` |
| `clipContent` | `boolean` | `false` | `true`, `false` |
| `childrenAlignment.horizontalAlignment` | `LayoutHorizontalAlignment` | `start` | `start`, `center`, `end`, `left`, `right`, `stretch` |
| `childrenAlignment.verticalAlignment` | `LayoutVerticalAlignment` | `start` | `top`, `center`, `middle`, `bottom`, `stretch` |
| `childrenAlignment.horizontalSingleItemAlignment` | `LayoutSingleItemAlignment` | `start` | `start`, `center`, `end`, `justify` |
| `childrenAlignment.verticalSingleItemAlignment` | `LayoutSingleItemAlignment` | `start` | `start`, `center`, `end`, `justify` |

## Notes

The engine keeps layout order separate from paint order. Use
`childPaintOrder` when visual stacking must differ from flow order.
