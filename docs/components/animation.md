# Animation

**Component type:** `animation`

`animation` defines a reusable animation timeline for an entity. Tracks target
component properties by path. The engine resolves the tracks during rendering.

## Accepted entities

`viewport`, `videoArea`, `video`, `compositionArea`, `page`, `row`, `word`,
`marker`, and `background`.

## Properties

The definition uses these defaults:

| Property | Type | Default | Options or shape |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | `true`, `false` |
| `name` | `string` | `Animation` | Any string |
| `phase` | `AnimationPhase` | `enter` | `enter`, `active`, `exit`, `custom` |
| `playbackMode` | `AnimationPlaybackMode` | `once` | `once`, `loop`, `pingPong` |
| `scope` | `AnimationScope` | `self` | `self`, `children`, `descendants` |
| `durationSeconds` | `number` | `0.3` | Non-negative number |
| `delaySeconds` | `number` | `0` | Non-negative number |
| `triggerBehavior` | `AnimationTriggerBehavior` | `adaptive` | `adaptive`, `restart`, `continue` |
| `lifecycleScheduling` | `AnimationLifecycleScheduling` | `overlap` | `overlap`, `sequential` |
| `sequencer` | `AnimationSequencer` | `{ pattern: simultaneous, interval: 0, reverse: false, seed: 0 }` | `{ pattern, interval, reverse, seed }` |
| `tracks` | `AnimationTrackDefinition[]` | `[]` | `{ enabled, target, keyframes, mode?, sampling?, updateEveryFrame? }` |

`tracks` contains keyframes and target paths. The component keeps track data
separate from the target component.

`sequencer.pattern` can be `simultaneous`, `stagger`, `wave`, `random`,
`centerOut`, `outsideIn`, or `timeline`. Track `mode` can be `absolute` or
`relative`. Track `sampling` can be `interpolate`, `randomValues`, or
`randomRange`.

## Notes

Animation can be linked to lifecycle events, caption events, or explicit
triggers. Wipe reveal and typewriter use animation tracks for timing.
