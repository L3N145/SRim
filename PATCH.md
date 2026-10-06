# SRim current behavior notes

- Tap coordinates are resolved in the renderer's visible coordinate plane, including creature depth, so the interaction follows what is actually seen on screen.
- Ripples are stronger physical disturbances rather than direct movement commands.
- Ordinary movement and macro events are separate systems.
- Bodies remain microscopically active while locomotion is quiet through multiple time-scale physical oscillators.
- Morphology has no nucleus-splitting visual event. Birth is a population event: one creature becomes the source of a new independent creature.
- Population is guarded only for visual density on small screens; the guard is not a compute constraint.
- TILT input has been removed.
- SRim is the project name; do not expand it as Stimulation/Reaction or imply an S-R relationship.

## v5 morphology tendencies
- Morphology is now individual-specific rather than one shared probability table.
- Each creature persists a tendency value for each morphology (0.18–2.8 multiplier).
- Recent repetition only weakly suppresses the same form; it does not force variety.
- Touch/audio/neighbor/autonomous morphology selection all respect the individual tendency.
- Offspring inherit the parent's morphology tendencies with small mutation, so family resemblance can emerge without explicit social semantics.
- Existing saved creatures receive deterministic tendencies from their seed when no tendency data exists.
