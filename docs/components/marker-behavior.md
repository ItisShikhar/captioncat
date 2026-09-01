# Marker behavior

**Component type:** `markerBehavior`

`markerBehavior` controls the style source, style state, and draw group for a
marker entity.

## Accepted entities

`marker`.

## Properties

| Property | Type | Default | Options or shape |
| --- | --- | --- | --- |
| `styleSource` | `MarkerStyleSource` | `own` | `own`, `targetState` |
| `styleState` | `MarkerStyleState` | `followTarget` | `followTarget`, `default`, `past`, `previous`, `current`, `next`, `future` |
| `renderOrder` | `MarkerRenderOrder` | `inFront` | `inFront`, `behind` |
