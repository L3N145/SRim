export interface Ripple {
  x: number;
  y: number;
  age: number;
  duration: number;
  maxRadius: number;
  strength: number;
  phase: number;
}

export function createRipple(x: number, y: number, seed: number): Ripple {
  const phase = seed * Math.PI * 2;
  return {
    x,
    y,
    age: 0,
    duration: 1.45 + Math.abs(Math.sin(phase * 1.7)) * 0.55,
    maxRadius: 125 + Math.abs(Math.sin(phase * 2.3)) * 55,
    strength: 0.92 + Math.abs(Math.sin(phase * 3.1)) * 0.30,
    phase,
  };
}

export function updateRipple(ripple: Ripple, dt: number): boolean {
  ripple.age += dt;
  return ripple.age < ripple.duration;
}

export function getRippleRadius(ripple: Ripple): number {
  const t = Math.min(1, ripple.age / ripple.duration);
  const eased = 1 - Math.pow(1 - t, 2);
  return ripple.maxRadius * eased;
}

export function getRippleOpacity(ripple: Ripple): number {
  const t = Math.min(1, ripple.age / ripple.duration);
  if (t < 0.58) return 0.42;
  return 0.42 * (1 - (t - 0.58) / 0.42);
}
