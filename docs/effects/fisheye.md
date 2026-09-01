# Fisheye

**Effect type:** `fisheye`

`fisheye` remaps pixels around a lens center. It supports concave and convex
distortion.

## Properties

| Property | Type | Default | Options or shape |
| --- | --- | --- | --- |
| `appliesOn` | `EffectInput` | `previousEffect` | `base`, `previousEffect` |
| `enabled` | `boolean` | `true` | `true`, `false` |
| `mode` | `FisheyeMode` | `concave` | `concave`, `convex` |
| `distortion` | `number` | `0` | Number |
| `zoom` | `number` | `1` | Number of at least `0.01` |
| `lensCenter` | `Vector2` | `{ "x": 0.5, "y": 0.5 }` | `{ x: number, y: number }`, each value from `0` to `1` |
| `edgeMode` | `FisheyeEdgeMode` | `transparent` | `transparent`, `clamp`, `crop` |
| `aspectCorrection` | `boolean` | `true` | `true`, `false` |

The effect can add margins when zoom or distortion expands the visible surface.
