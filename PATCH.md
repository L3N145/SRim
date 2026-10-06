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

\n## v7 autonomous locomotion\n- Increased sustained self-propulsion and the baseline movement target, independent of burst/morph events.\n- Increased low-frequency wander and ordinary heading changes so movement is legible at phone scale.\n- Raised the soft speed ceiling while keeping gradual damping, so creatures travel visibly without snapping like projectiles.\n- These are physical movement dynamics, not semantic actions or reactions to user input.\n
\n## v8 locomotion model\n- Replaced frame-to-frame random wandering with short-lived locomotion biases lasting roughly 2.4–6.4 seconds.\n- A bias is a direction tendency, not a destination or semantic goal; steering gradually bends the current heading toward it.\n- Small independent wandering remains layered on top, preserving organic uncertainty.\n- The update loop remains lightweight: a few scalar arithmetic operations and trigonometric calls per creature per frame; no ML inference, network request, image processing, or pathfinding is performed continuously.\n\n## Battery note\n- The main ongoing cost is the animation/render loop itself. Creature simulation is O(N^2) for neighbor interactions when N creatures are present, but N is currently small.\n- The expensive online/Wikipedia operation is event-driven rather than per-frame.\n- For a future battery-friendly mode, the safest optimization is reducing simulation/render frequency or pausing when the tab is hidden, rather than removing the multi-scale motion.\n

## v9 morphology balancing
- Morphology selection now uses one canonical eight-form competition instead of giving bloom (`expand` + `bloom`) and droplet (`deform`) extra independent entries.
- Every morphology can now be selected by autonomous, touch, audio, and neighbor/interaction pathways; rarity is controlled by weights and individual tendency rather than accidental missing routes.
- New creatures have 1–2 persistent signature morphologies with strong preference, while the remaining forms stay possible but noticeably less likely.
- Existing explicitly stored tendencies are preserved; only missing tendencies receive the new signature distribution.
- Recent repetition suppression is stronger but never hard-blocks a form.
- Bloom was visually reduced slightly so it reads as a rarer swelling event rather than the default "big light" state.
- Droplet, ribbon, vortex, crystalline, and spiky contours were strengthened so their morphology is legible at a glance.


## v9.1 — touch ambiguity and body scale

- Touch no longer schedules a behavior or morphology event. A tap only creates a physical disturbance: ripple field, local impulse, and a small transient body response.
- Removed the touch behavior path that could choose morphologies after a short delay. This makes tap→morphology causality much harder to read.
- Widened individual base-scale range from `1.00–1.28` to `0.76–1.28`. The maximum is unchanged, while smaller bodies are substantially more common and the population average is lower.
