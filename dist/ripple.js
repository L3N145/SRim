export function createRipple(x, y, seed) {
    const phase = seed * Math.PI * 2;
    return {
        x,
        y,
        age: 0,
        duration: 1.25 + Math.abs(Math.sin(phase * 1.7)) * 0.45,
        maxRadius: 90 + Math.abs(Math.sin(phase * 2.3)) * 45,
        strength: 0.62 + Math.abs(Math.sin(phase * 3.1)) * 0.28,
        phase,
    };
}
export function updateRipple(ripple, dt) {
    ripple.age += dt;
    return ripple.age < ripple.duration;
}
export function getRippleRadius(ripple) {
    const t = Math.min(1, ripple.age / ripple.duration);
    const eased = 1 - Math.pow(1 - t, 2);
    return ripple.maxRadius * eased;
}
export function getRippleOpacity(ripple) {
    const t = Math.min(1, ripple.age / ripple.duration);
    if (t < 0.58)
        return 0.42;
    return 0.42 * (1 - (t - 0.58) / 0.42);
}
