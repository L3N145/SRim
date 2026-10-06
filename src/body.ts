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

export interface Collider {
  /** Offset from the creature centre, already rotated into world axes. */
  ox: number;
  oy: number;
  r: number;
}

export function createBodyShape(): BodyShape {
  return { n: 0, xs: new Float32Array(MAX_OUTLINE_POINTS), ys: new Float32Array(MAX_OUTLINE_POINTS) };
}

function microWobble(phase: number, angle: number, scale: number): number {
  return 0.5 + 0.5 * Math.sin(phase * 1.7 + angle * 3.0 + scale * 5.0);
}

function fleshWobble(phase: number, angle: number, seed: number): number {
  return Math.sin(phase * 2.35 + angle * 5.0 + seed * 17.0) * 0.52
    + Math.sin(phase * 0.91 - angle * 2.0 + seed * 6.0) * 0.30
    + Math.sin(phase * 4.7 + angle * 9.0 + seed * 2.0) * 0.18;
}

/** Fraction of spike height that counts as solid. Spikes are soft tips. */
const COLLISION_SPIKE_FACTOR = 0.75;

export function computeBodyShape(c: Creature, out: BodyShape, forCollision = false): void {
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
    if (!forCollision) {
      const livingWobble = fleshWobble(phase, angle, seed);
      const visibleFlesh = livingWobble * (1.55 + c.bodyTension * 1.1);
      r += Math.sin(phase * 0.8 + angle * 2) * (2.4 + microWobble(phase, angle, c.getBaseScale()) * 1.0) * (1.0 - spike)
        + visibleFlesh;
    }
    if (spike > 0.01) {
      const spikeWave = Math.pow(Math.abs(Math.sin(angle * (spikeFreq / 2) + phase * 0.2)), 3.0);
      r += spikeWave * 22 * spike * (forCollision ? COLLISION_SPIKE_FACTOR : 1);
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

/** Soft bodies are slightly forgiving: allow a hair of overlap at the skin. */
const SOFT_MARGIN = 1.5;

/**
 * Approximate the (possibly elongated / non-convex) contour with a short chain
 * of circles. Each circle is the vertical slice of the contour at its x-position,
 * so a ribbon becomes a long chain, a droplet a fat head plus a thinning tail,
 * and a round body a single circle.
 */
export function buildColliders(
  shape: BodyShape,
  sx: number,
  sy: number,
  rotation: number,
  out: Collider[],
): number {
  const n = shape.n;
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  for (let i = 0; i < n; i += 1) {
    const x = shape.xs[i] * sx;
    const y = shape.ys[i] * sy;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const length = maxX - minX;
  const halfH = (maxY - minY) / 2;
  const k = Math.max(1, Math.min(6, Math.round(length / Math.max(halfH * 1.2, 10))));
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  out.length = 0;
  for (let j = 0; j < k; j += 1) {
    const xj = minX + ((j + 0.5) / k) * length;
    let lo = Infinity; let hi = -Infinity;
    for (let i = 0; i < n; i += 1) {
      const i2 = (i + 1) % n;
      const x1 = shape.xs[i] * sx; const y1 = shape.ys[i] * sy;
      const x2 = shape.xs[i2] * sx; const y2 = shape.ys[i2] * sy;
      if ((x1 <= xj && x2 >= xj) || (x2 <= xj && x1 >= xj)) {
        if (x1 === x2) {
          lo = Math.min(lo, y1, y2); hi = Math.max(hi, y1, y2);
        } else {
          const y = y1 + ((xj - x1) / (x2 - x1)) * (y2 - y1);
          if (y < lo) lo = y;
          if (y > hi) hi = y;
        }
      }
    }
    if (!Number.isFinite(lo)) continue;
    const r = Math.max(6, (hi - lo) / 2 - SOFT_MARGIN);
    const cy = (hi + lo) / 2;
    out.push({ ox: xj * cos - cy * sin, oy: xj * sin + cy * cos, r });
  }
  if (out.length === 0) out.push({ ox: 0, oy: 0, r: Math.max(6, 36 * 0.8) });
  return Math.hypot(Math.max(Math.abs(minX), Math.abs(maxX)), Math.max(Math.abs(minY), Math.abs(maxY)));
}
