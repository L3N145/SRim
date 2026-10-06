import { getRippleRadius } from './ripple';
/** A tiny local interaction field. It has no semantic labels such as friend,
 * fear or affection; creatures only receive geometry and motion information. */
export function collectNeighbors(creatures, selfIndex) {
    const self = creatures[selfIndex];
    const result = [];
    for (let i = 0; i < creatures.length; i += 1) {
        if (i === selfIndex)
            continue;
        const other = creatures[i];
        const dx = other.x - self.x;
        const dy = other.y - self.y;
        const dz = other.z - self.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001;
        result.push({
            x: dx,
            y: dy,
            z: dz,
            vx: other.vx,
            vy: other.vy,
            distance,
            proximity: Math.max(0, 1 - distance / 260),
            index: i,
            morphAction: other.currentAction,
            morphAge: other.getMorphAge(),
            morphIntensity: other.getMorphIntensity(),
            collisionRadius: other.getCollisionRadius(),
        });
    }
    return result;
}
export function collectRippleInfluences(ripples, x, y) {
    const result = [];
    for (const ripple of ripples) {
        const dx = x - ripple.x;
        const dy = y - ripple.y;
        const distance = Math.hypot(dx, dy);
        const radius = getRippleRadius(ripple);
        const ringDistance = Math.abs(distance - radius);
        // The creature reacts to the expanding ring, not to the tap point itself.
        if (ringDistance > 34)
            continue;
        const ringStrength = 1 - ringDistance / 34;
        result.push({
            dx,
            dy,
            distance,
            radius,
            strength: ringStrength * ripple.strength,
        });
    }
    return result;
}
