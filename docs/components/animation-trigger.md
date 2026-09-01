# Animation trigger

**Component type:** `animationTrigger`

`animationTrigger` enables the current-word retrigger gate. It prevents a
word-scoped animation from restarting for every frame of the same word.

## Accepted entities

The component has no entity restriction in the engine. The preset schema
decides where the component can be authored.

## Properties

The component has no user properties.

## Notes

Use the component with an `animation` component when a caption event must
restart an animation only after the current word changes.
