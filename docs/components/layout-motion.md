# Layout motion

**Component type:** `layoutMotion`

`layoutMotion` moves page rows or row children toward a changing focus item.
It changes resolved layout geometry without changing authored transforms.

## Accepted entities

`page` and `row`.

## Properties

| Property | Type | Default | Options or shape |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | `true`, `false` |
| `motionScope` | `LayoutMotionScope` | `group` | `group`, `perChild` |
| `motionType` | `LayoutMotionType` | `spring` | `spring`, `eased` |
| `timingMode` | `LayoutMotionTimingMode` | `fixed` | `fixed`, `adaptive` |
| `flowDirection` | `LayoutMotionFlowDirection` | `bottomToTop` | `leftToRight`, `rightToLeft`, `bottomToTop`, `topToBottom` |
| `focusPosition` | `number` or `FollowAnchor` | `center` | Number from `0` to `1`, or `topLeft`, `topCenter`, `topRight`, `centerLeft`, `center`, `centerRight`, `bottomLeft`, `bottomCenter`, `bottomRight` |
| `stiffness` | `number` | `220` | Non-negative number |
| `damping` | `number` | `28` | Non-negative number |
| `mass` | `number` | `1` | Number of at least `0.001` |
| `springFalloffFactor` | `number` | `1` | Number from `0.1` to `8` |
| `durationSeconds` | `number` | `0.25` | Non-negative number |
| `easing` | `EaseType` | `easeInOut` | `linear`, `ease`, `elastic`, `bounce`, `easeIn`, `easeOut`, `easeInOut`, `cubic`, `cubicIn`, `cubicOut`, `cubicInOut`, `back`, `backIn`, `backOut`, `backInOut` |
| `staggerTimingMode` | `LayoutMotionTimingMode` | `adaptive` | `fixed`, `adaptive` |
| `staggerDelaySeconds` | `number` | `0.025` | Non-negative number |
| `staggerFalloffFactor` | `number` | `1` | Number from `0` to `8` |
| `stateMotion.<state>.distanceScale` | `number` | `1` | Number from `0` to `8` |
| `stateMotion.<state>.speedScale` | `number` | `1` | Number from `0.05` to `8` |

The state values apply to `past`, `previous`, `current`, `next`, and `future`.

## Notes

The runtime keeps stable motion state across caption events. Page changes reset
the state. Background and crop geometry follow the moved content.
