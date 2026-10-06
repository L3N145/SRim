import type { Creature } from './creature';

/**
 * Single source of truth for a creature's body contour.
 *
 * The renderer draws this outline and the collision system derives its
 * hitbox from the very same function, so morphology changes (bloom, ribbon,
 * droplet, spikes, ...) always change the hitbox together with the visible body.
 *
 * Coordinates are body-local (+x = heading), in world units (perspective 1).
 */

export const MAX_OUTLINE_POINTS = 64;

export interface BodyShape {
  n: number;
  xs: Float32Array;
  ys: Float32Array;
}

/** Collision contour in world-axis offsets from the creature centre. */
export interface Hull {
  n: number;
  x: Float32Array;
  y: Float32Array;
  radius: number;   // max distance from centre (broad phase)
  area: number;     // polygon area (used as mass)
}

export function createBodyShape(): BodyShape {
  return { n: 0, xs: new Float32Array(MAX_OUTLINE_POINTS), ys: new Float32Array(MAX_OUTLINE_POINTS) };
}

export function createHull(): Hull {
  return { n: 0, x: new Float32Array(MAX_OUTLINE_POINTS), y: new Float32Array(MAX_OUTLINE_POINTS), radius: 36, area: 4000 };
}

function microWobble(phase: number, angle: number, scale: number): number {
  return 0.5 + 0.5 * Math.sin(phase * 1.7 + angle * 3.0 + scale * 5.0);
}

function fleshWobble(phase: number, angle: number, seed: number): number {
  return Math.sin(phase * 2.35 + angle * 5.0 + seed * 17.0) * 0.52
    + Math.sin(phase * 0.91 - angle * 2.0 + seed * 6.0) * 0.30
    + Math.sin(phase * 4.7 + angle * 9.0 + seed * 2.0) * 0.18;
}

export function computeBodyShape(c: Creature, out: BodyShape): void {
  const baseRadius = 36 * c.scale;
  const phase = c.phase;
  const spike = c.spike;
  const bloom = c.bloom;
  const stretch = c.stretch;
  const cryst = c.crystalline;
  const ribbon = c.ribbon;
  const vortex = c.vortex;
  const n = cryst > 0.3 ? 8 : MAX_OUTLINE_POINTS;
  const spikeFreq = c.targetDNA.spikeCount;
  const seed = c.data.seed;
  void bloom;

  out.n = n;
  for (let i = 0; i < n; i += 1) {
    const angle = (i / n) * Math.PI * 2;
    const contraction = c.bodyBreath * 1.65 + c.bodyPulse * 0.72;
    const bodyWave = c.bodyOrganic * (0.75 + 0.28 * Math.sin(angle * 2 + phase * 0.17));
    let r = baseRadius * (1 + contraction * 0.038 + bodyWave * 0.016);
    const livingWobble = fleshWobble(phase, angle, seed);
    const visibleFlesh = livingWobble * (1.55 + c.bodyTension * 1.1);
    r += Math.sin(phase * 0.8 + angle * 2) * (2.4 + microWobble(phase, angle, c.getBaseScale()) * 1.0) * (1.0 - spike)
      + visibleFlesh;
    if (spike > 0.01) {
      const spikeWave = Math.pow(Math.abs(Math.sin(angle * (spikeFreq / 2) + phase * 0.2)), 3.0);
      r += spikeWave * 22 * spike;
    }
    if (cryst > 0.01) r *= 1.0 + Math.sin(angle * 4) * (0.28 * cryst) + Math.sin(angle * 8) * (0.06 * cryst);
    if (vortex > 0.01) {
      r += Math.sin(angle * 3 + phase * 2.0) * (13.0 * vortex) + Math.sin(angle * 6 - phase * 1.4) * (3.5 * vortex);
    }
    let px = Math.cos(angle) * r;
    let py = Math.sin(angle) * r;
    if (stretch > 0.01 && Math.cos(angle) < 0) {
      px -= Math.abs(Math.cos(angle)) * (48 * stretch);
      py *= 1.0 - Math.abs(Math.cos(angle)) * 0.50 * stretch;
    }
    if (ribbon > 0.01) {
      px *= 1.0 + 0.78 * ribbon;
      py *= 1.0 - 0.48 * ribbon;
      py += Math.sin(px * 0.065 + phase * 1.5) * (12.0 * ribbon);
    }
    out.xs[i] = px;
    out.ys[i] = py;
  }
}

/**
 * Collision contour = the contour that is actually drawn. The renderer smooths
 * the control points with quadratic curves, which pass through the midpoints
 * between control points; sampling the curve at t=0.5 gives
 * 0.125*p[i-1] + 0.75*p[i] + 0.125*p[i+1]. Crystalline bodies are drawn with
 * straight edges, so their control points are used as they are. Spikes, ribbons
 * and droplet tails therefore collide exactly where they are visible.
 */
export function buildHull(shape: BodyShape, smooth: boolean, sx: number, sy: number, rotation: number, out: Hull): void {
  const n = shape.n;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  let radius = 0;
  let area = 0;
  for (let i = 0; i < n; i += 1) {
    let lx: number; let ly: number;
    if (smooth) {
      const a = (i + n - 1) % n; const c = (i + 1) % n;
      lx = 0.125 * shape.xs[a] + 0.75 * shape.xs[i] + 0.125 * shape.xs[c];
      ly = 0.125 * shape.ys[a] + 0.75 * shape.ys[i] + 0.125 * shape.ys[c];
    } else {
      lx = shape.xs[i]; ly = shape.ys[i];
    }
    lx *= sx; ly *= sy;
    out.x[i] = lx * cos - ly * sin;
    out.y[i] = lx * sin + ly * cos;
    const d = Math.hypot(out.x[i], out.y[i]);
    if (d > radius) radius = d;
  }
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    area += out.x[i] * out.y[j] - out.x[j] * out.y[i];
  }
  out.n = n;
  out.radius = radius;
  out.area = Math.abs(area) / 2;
}
