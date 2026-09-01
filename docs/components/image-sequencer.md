# Image sequencer

**Component type:** `imageSequencer`

`imageSequencer` changes the active image frame from a list of frame assets.
Triggers can advance the sequence on caption events.

## Accepted entities

`viewport`, `videoArea`, `video`, `compositionArea`, `page`, `row`, `word`,
and `marker`.

## Properties

| Property | Type | Default | Options or shape |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | `true`, `false` |
| `frames` | `string[]` | `[]` | Image asset sources |
| `playbackMode` | `ImageSequencerPlaybackMode` | `continuous` | `continuous`, `onTrigger`, `perTrigger` |
| `frameRate` | `number` | `12` | Number greater than `0` and at most `60` |
| `loop` | `boolean` | `true` | `true`, `false` |
| `trigger` | `ImageSequencerTriggerRule[]` | `currentWordStart` advances `next` | `{ trigger, advance }` |
| `endBehavior` | `ImageSequencerEndBehavior` | `hold` | `hold`, `loop`, `pingPong` |

Supported trigger events include current-word, row, and page start and end
events. `trigger` can be `currentWordStart`, `currentWordEnd`, `currentRowStart`,
`currentRowEnd`, `currentPageStart`, or `currentPageEnd`. `advance` can be
`next`, `previous`, `random`, or `none`.
