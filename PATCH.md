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


## v10 — pulse-jet locomotion, no destinations, contour-based collision

**Locomotion (creature.ts)**
- Removed the hidden goal (`goalX/goalY`), locomotion bias, constant `motionSpeed` and the velocity-lag chain.
- Creatures now swim by pulse-jetting: the bell contracts, thrust and turning happen only during the contraction, then the body relaxes and glides while water drag slows it. Speed surges and fades with the body's own rhythm.
- Sideways velocity is damped faster than forward velocity, so turns carve instead of sliding.
- Pulse timing is individual (random phase, period jitter, occasional long glides). Heading follows a slow random walk re-drawn per pulse; there is no target.
- The world edge is a soft wall (gentle current + inward turning bias), not a destination.
- Typical speed is now ~3-5 px/s average, ~10-20 px/s at the peak of a pulse (was a constant 18-34 px/s). Tune everything with `SPEED_SCALE` / `LOCOMOTION` at the top of creature.ts.
- Events were remapped onto the pulse model: burst = stronger/immediate pulse, hesitate = skip beats and glide, approach/retreat/orbit/drift = turning bias applied during pulses.
- The roaming area was widened (`WORLD`, ~34% of the screen instead of ~24%, capped at 240x320 px).

**Body and collision (body.ts, world.ts)**
- The contour is computed once per frame in `computeBodyShape` and used by BOTH the renderer and the hitbox, so a morphology change changes the hitbox in the same frame.
- The hitbox is a chain of circles sliced from the current contour (round body = 1 circle, ribbon/droplet = a chain). Squeeze from the pulse is included; spikes count at 75%.
- `resolveCollisions` runs after all creatures update: overlap is removed from both bodies (heavier moves less), approach velocity is cancelled with a small bounce, and off-centre contact turns the body slightly. 4 iterations per frame.
- Tap impulse and ripple force were retuned for px/s units.


## v10.1 — light and locomotion without scheduled events

Design rule: no event timers, no dice, no "A did X so B does Y after N seconds".
Anything that looks like a signal or an intention should come out of continuous
dynamics, so that its regularities can only be found by interpretation.

**Light (creature.ts, renderer.ts)**
- The glow is the output of a small deterministic excitable membrane (Hindmarsh-Rose, 3 variables). It produces irregular bursts of blinks separated by long quiet spans, with no scheduler and no RNG.
- Each body has its own input current / slow-variable rate derived from its seed, so rhythms differ per body.
- Coupling is continuous and weak: light seen from nearby bodies (falls off with distance) and the body's own squeeze add a little to the membrane's input current. Whether that matters depends on the hidden state it lands in, so call-and-response can appear but is never guaranteed.
- The only seconds-like constant is `LIGHT.modelRate` (how fast the membrane's own time runs) and the rise/fade of the light response; both are properties of the "tissue", not event schedules.
- Keep the input current inside the bursting window (~3.0-3.25); above it the membrane flickers continuously (`LIGHT.inputMax` guards this).
- During a flash the core grows and the whole body lights up from inside (additive halo); between flashes the core is slightly dimmer.

**Locomotion**
- Removed the RNG from pulse timing and turning. Pulse interval now follows a slow hidden rhythm (`vigor`, incommensurate sines per body): high vigor = frequent beats, low = long glides.
- Heading drift is a slow deterministic curve sampled per pulse, not a random walk.

**Not changed yet**: `behavior.ts` (BehaviorScheduler) still uses seeded random waits and hazard rates for morphology and macro events.

## v10.2 — rounded glow
- The membrane spike is no longer used as the light directly. It is accumulated into a glow (rise), which fades more slowly (fall), then passes through a soft saturation and a second smoothing stage. A blink now swells and ebbs (~0.5 s up, ~1.5 s down) instead of flashing and vanishing (~0.27 s / ~0.6 s before).
- Within a burst, successive spikes merge into a pulsing swell, so a signal reads as breathing light.
- `LIGHT.modelRate` lowered 10 -> 7: fewer bursts overall (about 25% fewer).
- Tuning knobs in creature.ts `LIGHT`: `riseRate` (lower = slower swell), `fallRate` (lower = longer ebb), `smoothRate` (lower = rounder onset), `gain` (higher = brighter and lingers longer).

## v10.3 — exact-contour collision
- The old circle-chain hitbox badly under-covered spiky bodies: measured against the drawn contour, spiky bodies overlapped by up to ~26 px (>3 px in 95% of frames).
- Collision now uses the contour that is actually drawn (`buildHull` in body.ts: the renderer's smoothed curve, or straight edges for crystalline). Spikes, ribbon, droplet tail and bloom swelling collide exactly where visible, in the same frame the morphology changes. Spikes are no longer discounted.
- `resolveCollisions` (world.ts): per pair, find the deepest contour vertex inside the other body and push it out through the nearest edge; both bodies move (heavier moves less), approach velocity is cancelled, off-centre contact turns the body. 6 iterations per frame.
- Measured against a finer re-sampling of the drawn contour: spiky max overlap ~2.6 px (was ~26), mixed morphs ~3.4 px (was ~20), >3 px in 5 of 5400 frames.
- Cost with 12 crowded spiky bodies: ~1 ms/frame average.
- Known limit: two thin spikes can cross without either tip lying inside the other body; this is rare at the current 64-point contour.
