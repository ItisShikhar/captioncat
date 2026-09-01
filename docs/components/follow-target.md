# Follow target

**Component type:** `followTarget`

`followTarget` maps values from another entity or semantic caption target to
the owner. It can follow bounds, position, size, scale, rotation, or opacity.

## Accepted entities

`viewport`, `videoArea`, `video`, `compositionArea`, `page`, `row`, `word`,
`marker`, and `background`.

## Properties

| Property | Type | Default | Options or shape |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | `true`, `false` |
| `mode` | `FollowMode` | `auto` | `auto`, `timeline`, `live` |
| `delaySeconds` | `number` | `0` | Non-negative number |
| `target` | `FollowTargetKind` | `entity` | `parent`, `currentWord`, `previousWord`, `nextWord`, `currentRow`, `previousRow`, `nextRow`, `currentPage`, `entity` |
| `targetId` | `string` | Empty | Entity ID when `target` is `entity` |
| `targetScope` | `FollowTargetScope` | `local` | `local`, `timeline` |
| `boundaryHandoff` | `FollowBoundaryHandoff` | `snap` | `snap`, `allowTransition` |
| `transitionScope` | `FollowTransitionScope` | `all` | `all`, `sameParent`, `samePage` |
| `anchor` | `FollowAnchor` | `center` | `topLeft`, `topCenter`, `topRight`, `centerLeft`, `center`, `centerRight`, `bottomLeft`, `bottomCenter`, `bottomRight` |
| `mappings` | `FollowMapping[]` | `[]` | `{ source, destination, offset? }` |

Mappings use source paths such as `bounds.width` and destination paths such as
`Transform.width`.
