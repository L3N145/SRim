# Biological motion / weak social-bias update

Apply over the current project.

- Lower autonomous event frequency slightly to reduce busyness.
- Greatly reduce cross-creature influence; neighboring changes are only a faint stochastic bias.
- Add smoother acceleration/deceleration and occasional hesitation pauses.
- Express approach/retreat/orbit as gradual turning rather than direct velocity impulses.
- Add a soft speed ceiling so even large events do not look like projectiles.
- Keep close-range separation so bodies do not visually interpenetrate while allowing contact.

The implementation does not contain semantic social states such as `follow`, `friend`, or `imitate`.
Neighbor effects only bias ordinary kinematics.
