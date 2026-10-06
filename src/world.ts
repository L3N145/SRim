import { Creature } from './creature';
import type { MorphAction } from './behavior';
import type { Ripple } from './ripple';
import { getRippleRadius } from './ripple';

export interface NeighborInfluence {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  distance: number;
  proximity: number;
  index: number;
  morphAction: MorphAction;
  morphAge: number;
  morphIntensity: number;
  collisionRadius: number;
  /** Current light-flash level of the other body (0..1). Geometry/brightness only. */
  signal: number;
}

export interface RippleInfluence {
  dx: number;
  dy: number;
  distance: number;
  radius: number;
  strength: number;
}

/** A tiny local interaction field. It has no semantic labels such as friend,
 * fear or affection; creatures only receive geometry and motion information. */
export function collectNeighbors(creatures: readonly Creature[], selfIndex: number): NeighborInfluence[] {
  const self = creatures[selfIndex];
  const result: NeighborInfluence[] = [];
  for (let i = 0; i < creatures.length; i += 1) {
    if (i === selfIndex) continue;
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
      signal: other.signal,
    });
  }
  return result;
}

export function collectRippleInfluences(
  ripples: readonly Ripple[],
  x: number,
  y: number,
  z = 0,
): RippleInfluence[] {
  const result: RippleInfluence[] = [];

  for (const ripple of ripples) {
    const perspective = 380 / (380 + z);
    const projectedX = x * perspective;
    const projectedY = y * perspective;
    const dx = projectedX - ripple.x;
    const dy = projectedY - ripple.y;
    const distance = Math.hypot(dx, dy);
    const radius = getRippleRadius(ripple);
    const ringDistance = Math.abs(distance - radius);

    // The creature reacts to the expanding ring, not to the tap point itself.
    if (ringDistance > 48) continue;

    const ringStrength = 1 - ringDistance / 48;
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

/**
 * Contact resolution between creature bodies.
 *
 * Each body is a chain of circles built from its *current* contour (see body.ts),
 * so a morph change immediately changes what can be hit. Overlap is removed by
 * moving both bodies (heavier ones move less), approaching velocity is cancelled
 * with a little bounce, and an off-centre contact turns the body slightly.
 * Several iterations let stacked contacts settle without tunnelling.
 */
export function resolveCollisions(creatures: readonly Creature[], iterations = 4): void {
  const n = creatures.length;
  for (let it = 0; it < iterations; it += 1) {
    let any = false;
    for (let i = 0; i < n; i += 1) {
      const a = creatures[i];
      for (let j = i + 1; j < n; j += 1) {
        const b = creatures[j];
        if (Math.abs(a.z - b.z) > 60) continue;
        const cx = b.x - a.x;
        const cy = b.y - a.y;
        const reach = a.boundRadius + b.boundRadius;
        if (cx * cx + cy * cy > reach * reach) continue;

        // Deepest overlapping pair of circles.
        let bestPen = 0; let nx = 0; let ny = 0; let px = 0; let py = 0;
        for (const ca of a.colliders) {
          const ax = a.x + ca.ox; const ay = a.y + ca.oy;
          for (const cb of b.colliders) {
            const dx = b.x + cb.ox - ax;
            const dy = b.y + cb.oy - ay;
            const d = Math.hypot(dx, dy);
            const pen = ca.r + cb.r - d;
            if (pen > bestPen) {
              bestPen = pen;
              if (d > 0.001) { nx = dx / d; ny = dy / d; } else { nx = cx > 0 ? 1 : -1; ny = 0; }
              px = ax + nx * ca.r; py = ay + ny * ca.r;
            }
          }
        }
        if (bestPen <= 0) continue;
        any = true;

        const invA = 1 / a.mass;
        const invB = 1 / b.mass;
        const shareA = invA / (invA + invB);
        const shareB = 1 - shareA;
        const push = Math.min(bestPen, 8) * 0.9;
        a.x -= nx * push * shareA; a.y -= ny * push * shareA;
        b.x += nx * push * shareB; b.y += ny * push * shareB;

        // Cancel approach speed along the normal; keep a small rebound.
        const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (vn < 0) {
          const e = 0.2;
          const jImpulse = -(1 + e) * vn / (invA + invB);
          a.vx -= nx * jImpulse * invA; a.vy -= ny * jImpulse * invA;
          b.vx += nx * jImpulse * invB; b.vy += ny * jImpulse * invB;
          if (vn < -2 && it === 0) {
            const hit = Math.min(1, -vn / 14);
            a.noteImpact(hit); b.noteImpact(hit);
          }
        }

        // Off-centre contact swings the body: torque = r x F, normalised.
        const kick = Math.min(1, bestPen / 12) * 0.02;
        const turn = (c: Creature, fx: number, fy: number) => {
          const rx = px - c.x; const ry = py - c.y;
          const len = Math.hypot(rx, ry);
          if (len < 1) return;
          c.heading += ((rx * fy - ry * fx) / len) * kick;
        };
        turn(a, -nx, -ny);
        turn(b, nx, ny);
      }
    }
    if (!any) break;
  }
}
