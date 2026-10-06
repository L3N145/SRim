# malice_creature autonomous-life + active-motion + device-tilt patch

This revision keeps the previous autonomous multi-creature design but makes the baseline motion visibly more active and adds an optional phone-tilt field.

## Main changes

- Stronger continuous self-propelled movement.
- Larger but still smooth acceleration/deceleration.
- More visible trajectory changes between macro events.
- Existing morphology events are retained; morphology is not the primary input channel.
- Added `src/device.ts` using the browser `deviceorientation` API.
- Phone tilt is relative to the orientation when the sensor is enabled.
- Tilt acts as a weak gravity-like field, not a direct joystick.
- Sensor permission is requested only after the user presses `TILT`.
- No microphone is required.

## Install

Copy these files over the corresponding files in the existing project:

- `src/creature.ts`
- `src/main.ts`
- `src/device.ts`

The rest of the previous autonomous-life patch remains unchanged.

## Phone behavior

After opening the HTTPS GitHub Pages version, press `TILT` once and allow sensor access if the browser asks.

Then gently tilt the phone. The creatures should gradually drift in the tilted direction and continue with their own inertia and autonomous motion. Returning the phone near its calibrated orientation removes most of the added force.

The effect intentionally does not behave like a game controller: there is no direct one-to-one mapping between tilt and position.


## 2026-10-05 behavior update
- Morphs no longer have a fixed hold duration. After becoming visible for a while, a seeded probability periodically allows the creature to begin returning toward its baseline shape.
- Morph recovery is deliberately slow, and the fading morphology remains weakly observable to neighboring creatures during recovery.
- Neighbor influence no longer requests the same morph action. A nearby creature's visible change only raises the probability of an independently selected action, with delay and randomness.
- Autonomous conspicuous events are more frequent with three creatures in mind.
- Added a rare `giant` morphology: strong temporary enlargement combined with a burst of motion.
