# Lifecycle

**Component type:** `lifecycle`

`lifecycle` gives `videoArea` and `compositionArea` an independent video
boundary. This controls when their lifecycle animations enter and exit.

## Accepted entities

`videoArea` and `compositionArea`.

## Properties

| Property | Type | Default | Options or shape |
| --- | --- | --- | --- |
| `persistAcrossVideo` | `boolean` | `false` | `true`, `false` |

When `persistAcrossVideo` is enabled, the owner can persist across video
boundaries. The animation evaluator uses this component when it determines
lifecycle scheduling.
