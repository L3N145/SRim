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
 * Deepest vertex of `a` that lies inside the contour of `b`.
 * Returns the push needed to bring that vertex back out through the nearest
 * edge of `b`, expressed as a direction `u` (unit, moving `a` out of `b`).
 */
function deepestVertex(a: Creature, b: Creature, out: { depth: number; ux: number; uy: number; px: number; py: number }): boolean {
  const ha = a.hull; const hb = b.hull;
  const ox = a.x - b.x; const oy = a.y - b.y;     // a's origin in b's frame
  const bn = hb.n;
  let found = false;
  out.depth = 0;
  for (let i = 0; i < ha.n; i += 1) {
    const vx = ox + ha.x[i]; const vy = oy + ha.y[i];
    // Cheap reject: outside b's bounding circle.
    if (vx * vx + vy * vy > hb.radius * hb.radius) continue;
    let inside = false;
    let best = Infinity; let bx = 0; let by = 0;
    for (let j = 0, k = bn - 1; j < bn; k = j, j += 1) {
      const x1 = hb.x[k]; const y1 = hb.y[k]; const x2 = hb.x[j]; const y2 = hb.y[j];
      if ((y1 > vy) !== (y2 > vy) && vx < ((x2 - x1) * (vy - y1)) / (y2 - y1) + x1) inside = !inside;
      const dx = x2 - x1; const dy = y2 - y1;
      const len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((vx - x1) * dx + (vy - y1) * dy) / len2));
      const cx = x1 + t * dx; const cy = y1 + t * dy;
      const d2 = (vx - cx) * (vx - cx) + (vy - cy) * (vy - cy);
      if (d2 < best) { best = d2; bx = cx; by = cy; }
    }
    if (!inside) continue;
    const d = Math.sqrt(best);
    if (d > out.depth) {
      out.depth = d; found = true;
      const inv = d > 1e-4 ? 1 / d : 0;
      out.ux = (bx - vx) * inv; out.uy = (by - vy) * inv;
      out.px = a.x + ha.x[i]; out.py = a.y + ha.y[i];
    }
  }
  return found;
}

const probeA = { depth: 0, ux: 0, uy: 0, px: 0, py: 0 };
const probeB = { depth: 0, ux: 0, uy: 0, px: 0, py: 0 };

/**
 * Contact resolution between creature bodies.
 *
 * Bodies collide as the exact contour that is drawn (body.ts buildHull), so
 * spikes, ribbons, droplet tails and bloom swelling all hit where they are
 * visible, in the same frame the morphology changes. For each pair the deepest
 * contour vertex lying inside the other body is pushed out through the nearest
 * edge: overlap is removed from both bodies (heavier moves less), approach
 * velocity is cancelled with a small rebound, and an off-centre contact turns
 * the body slightly. Several iterations let stacked contacts settle.
 */
export function resolveCollisions(creatures: readonly Creature[], iterations = 6): void {
  const n = creatures.length;
  for (let it = 0; it < iterations; it += 1) {
    let any = false;
    for (let i = 0; i < n; i += 1) {
      const a = creatures[i];
      for (let j = i + 1; j < n; j += 1) {
        const b = creatures[j];
        if (Math.abs(a.z - b.z) > 60) continue;
        const cx = b.x - a.x; const cy = b.y - a.y;
        const reach = a.boundRadius + b.boundRadius;
        if (cx * cx + cy * cy > reach * reach) continue;

        const aIn = deepestVertex(a, b, probeA);   // a's vertex inside b: a must move along u
        const bIn = deepestVertex(b, a, probeB);   // b's vertex inside a: b must move along u
        if (!aIn && !bIn) continue;

        // Normal pointing from a to b, plus the deepest overlap.
        let depth: number; let nx: number; let ny: number; let px: number; let py: number;
        if (aIn && (!bIn || probeA.depth >= probeB.depth)) {
          depth = probeA.depth; nx = -probeA.ux; ny = -probeA.uy; px = probeA.px; py = probeA.py;
        } else {
          depth = probeB.depth; nx = probeB.ux; ny = probeB.uy; px = probeB.px; py = probeB.py;
        }
        if (depth <= 0.01) continue;
        if (nx === 0 && ny === 0) {
          const d = Math.hypot(cx, cy) || 1; nx = cx / d; ny = cy / d;
        }
        any = true;

        const invA = 1 / a.mass; const invB = 1 / b.mass;
        const shareA = invA / (invA + invB);
        const shareB = 1 - shareA;
        const push = Math.min(depth, 10) * 0.95;
        a.x -= nx * push * shareA; a.y -= ny * push * shareA;
        b.x += nx * push * shareB; b.y += ny * push * shareB;

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

        const kick = Math.min(1, depth / 12) * 0.02;
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
