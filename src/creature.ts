import { BehaviorScheduler } from './behavior';
import type { BehaviorAction, BehaviorEvent, MorphAction } from './behavior';
import { CreatureData, recordAction } from './storage';
import { AcousticFeatures } from './audio';
import { CreatureSound } from './sound';
import { ResourceProvider } from './provider';
import { DNAEngine, ConceptDNA } from './procedural';
import type { NeighborInfluence, RippleInfluence } from './world';
import { SeededRandom } from './random';
import { buildColliders, computeBodyShape, createBodyShape, type Collider } from './body';

/**
 * Locomotion tuning. Units: px, seconds.
 * Creatures swim by pulse-jetting: each pulse contracts the body and pushes it
 * forward, then it glides and slowly decelerates in the water. There is no
 * destination anywhere in the model.
 *
 *   average speed ~= dv * dragTau / period   (about 3-5 px/s with defaults)
 *
 * To make everything slower or faster, change SPEED_SCALE only.
 */
const SPEED_SCALE = 1.0;
const LOCOMOTION = {
  dvMin: 10 * SPEED_SCALE,      // forward speed gained per pulse (px/s)
  dvMax: 16 * SPEED_SCALE,
  basePeriod: 3.4,              // seconds between pulses
  restChance: 0.22,             // chance a pulse is followed by a long glide
  relaxTime: 1.6,               // seconds the bell takes to re-expand
  dragTauMin: 0.9,              // seconds for glide speed to decay (e-fold)
  dragTauMax: 1.7,
};
const WORLD = { xFrac: 0.34, xMax: 240, yFrac: 0.34, yMax: 320 };

function angleDiff(target: number, from: number): number {
  let d = target - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const ENABLE_CREATURE_SOUNDS = false;
const ENABLE_ONLINE_RESOURCE_ACTIONS = true;

export class Creature {
  data: CreatureData;
  sound: CreatureSound;
  provider: ResourceProvider;
  x = 0; y = 0; z = 0;
  vx = 0; vy = 0; vz = 0;

  currentAction: MorphAction = 'normal';
  scale = 1.0; targetScale = 1.0;
  readonly baseScale: number;
  spike = 0; targetSpike = 0;
  bloom = 0; targetBloom = 0;
  stretch = 0; targetStretch = 0;
  crystalline = 0; targetCrystalline = 0;
  ribbon = 0; targetRibbon = 0;
  vortex = 0; targetVortex = 0;

  carriedImage: HTMLImageElement | null = null;
  imageAlpha = 0; targetImageAlpha = 0;
  imageCaption: string | null = null;
  activeDNA: ConceptDNA;
  targetDNA: ConceptDNA;
  currentHue: number;
  phase = 0;
  rotation = 0;
  activity = 0.04;

  // Multi-scale bodily motion: these are physical oscillators, not emotions.
  bodyBreath = 0;
  bodyPulse = 0;
  bodyTension = 0;
  // Correlated multi-scale fluctuation used for visible bodily liveliness.
  // This is intentionally not a mathematically exact 1/f process; it is a
  // lightweight pink-noise-like approximation made from several time scales.
  bodyOrganic = 0;
  // Pulse-jet swimming state.
  swimContraction = 0;            // 0 = relaxed, 1 = bell fully contracted
  bodySX = 1; bodySY = 1;         // body-local squeeze applied to the contour
  boundRadius = 36;
  mass = 1;
  readonly shape = createBodyShape();
  private readonly collisionShape = createBodyShape();
  colliders: Collider[] = [];
  private organicPhase = 0;

  // Kinematic state is intentionally semantic-free.
  heading = 0;
  angularVelocity = 0;
  private preferredTurn = 1;
  private readonly behavior: BehaviorScheduler;
  private readonly rng: SeededRandom;
  private morphStartedAt = -Infinity;
  private lastMorphReturnCheck = -Infinity;
  private morphReturning = false;
  private morphIntensity = 0;
  private lastNeighborCheck = -Infinity;
  private pulseT = 0;
  private pulsePeriod = 3;
  private readonly pulseContractTime: number;
  private readonly pulseDv: number;
  private readonly dragTau: number;
  private pulseKick = 1;
  private wanderTurn = 0;   // slow random walk of turning, re-drawn per pulse
  private steerTurn = 0;    // transient turning from events, decays
  private divisionRequestedAt = -Infinity;

  constructor(data: CreatureData, sound: CreatureSound, provider: ResourceProvider) {
    this.data = data;
    this.sound = sound;
    this.provider = provider;
    const lateNightBias = this.isLateNight() ? 0.86 : 1;
    this.behavior = new BehaviorScheduler(data.seed, {
      activity: data.baseViscosity * 18 * lateNightBias + 0.18,
      responsiveness: data.responsiveness,
      inertia: data.inertia,
      morphTendency: data.morphTendency,
    }, data.recentActions.map((entry) => entry.action));
    this.phase = data.seed * 100;
    this.heading = ((data.seed * 17.17) % (Math.PI * 2));
    this.preferredTurn = data.seed > 0.5 ? 1 : -1;
    // Keep the upper bound from v9, but widen the lower end so the
    // population contains noticeably smaller bodies. This lowers the
    // average body size without changing the maximum.
    this.baseScale = 0.76 + fract(data.seed * 7.31) * 0.52;
    this.rng = new SeededRandom(data.seed + 0.7311);
    this.pulseContractTime = 0.85 + fract(data.seed * 5.1) * 0.35;
    this.pulseDv = LOCOMOTION.dvMin + fract(data.seed * 3.3) * (LOCOMOTION.dvMax - LOCOMOTION.dvMin);
    this.dragTau = LOCOMOTION.dragTauMin
      + clamp((data.inertia - 0.8) / 0.185, 0, 1) * (LOCOMOTION.dragTauMax - LOCOMOTION.dragTauMin);
    // Start at a random point of the pulse cycle so creatures never beat in unison.
    this.pulsePeriod = LOCOMOTION.basePeriod * this.rng.range(0.85, 1.25);
    this.pulseT = this.rng.range(0, this.pulsePeriod);
    this.activeDNA = DNAEngine.synthesize(data.seed);
    this.targetDNA = { ...this.activeDNA };
    this.currentHue = this.activeDNA.hue + data.colorHueOffset;
    this.refreshBody();
  }

  update(
    dt: number,
    bounds: { width: number; height: number },
    neighbors: readonly NeighborInfluence[] = [],
    ripples: readonly RippleInfluence[] = [],
  ) {
    const safeDt = Math.min(Math.max(dt, 0), 0.1);
    const now = performance.now() / 1000;
    const lateNight = this.isLateNight();
    const micro = this.behavior.getMicroActivity();
    const anticipation = this.behavior.getAnticipation();

    // A morph has no fixed lifetime. Once it has been visible for a while,
    // ordinary time creates a small chance of drifting back toward normal.
    // This keeps the interpretation open: perhaps the creature simply kept
    // the shape for a while. The return itself is intentionally slow.
    if (this.morphIntensity > 0 && now - this.lastMorphReturnCheck > 0.55) {
      this.lastMorphReturnCheck = now;
      const age = now - this.morphStartedAt;
      if (this.behavior.shouldReleaseMorph(age)) this.resetMorphTargets();
    }

    if (now - this.lastNeighborCheck > 0.7) {
      this.lastNeighborCheck = now;
      const visibleNeighbor = neighbors.find((n) => n.morphAction !== 'normal' && n.morphAge >= 0.35 && n.morphIntensity > 0.72 && n.distance < 125);
      if (visibleNeighbor) {
        // A nearby change is only a faint perturbation. It can help produce
        // coincidental coordination, but it should never feel contagious.
        const intensity = visibleNeighbor.morphIntensity * Math.max(0, 1 - visibleNeighbor.distance / 125) * 0.20;
        this.behavior.requestNeighborImpulse(now, intensity);
      }
    }

    for (const event of this.behavior.update(safeDt, now, lateNight)) {
      this.executeBehaviorEvent(event, neighbors);
    }

    // Continuous self-propulsion. The important variable is not a semantic
    // "mood", but the temporal structure of movement: speed can gradually
    // rise, fall, pause, and resume. This keeps the motion organic without
    // requiring a dedicated "social behavior" or "emotion" state.
    this.phase += safeDt * (0.18 + micro * 1.55);
    this.organicPhase += safeDt * (0.42 + this.data.baseViscosity * 0.9);

    // Three time scales keep the body alive even when locomotion is quiet:
    // slow respiration, a shorter muscular pulse, and a faint irregular tension.
    const breathPhase = this.phase * (0.34 + this.data.baseViscosity * 2.1) + this.data.seed * 4.7;
    const pulsePhase = this.phase * (1.15 + this.data.responsiveness * 0.55) + this.data.seed * 9.3;
    const tensionPhase = this.phase * 2.7 + Math.sin(this.phase * 0.41 + this.data.seed * 3.1);
    const breathing = Math.sin(breathPhase) * 0.62 + Math.sin(breathPhase * 0.47 + 1.7) * 0.22;
    const pulse = Math.sin(pulsePhase) * 0.5 + Math.sin(pulsePhase * 1.73 + 0.9) * 0.16;
    const tension = Math.sin(tensionPhase) * 0.5 + Math.sin(tensionPhase * 0.61 + 2.2) * 0.35;
    // Several frequencies with decreasing amplitude give a perceptually
    // pink-noise-like rhythm: slow body drift dominates, but faster
    // fluctuations remain visible. The phases are irrationally related so
    // the result does not settle into an obvious repeating loop.
    const organic =
      Math.sin(this.organicPhase * 0.31 + this.data.seed * 13.1) * 0.92 +
      Math.sin(this.organicPhase * 0.73 + this.data.seed * 7.7) * 0.58 +
      Math.sin(this.organicPhase * 1.61 + this.data.seed * 19.3) * 0.36 +
      Math.sin(this.organicPhase * 3.37 + this.data.seed * 4.9) * 0.22 +
      Math.sin(this.organicPhase * 7.11 + this.data.seed * 23.7) * 0.13;
    this.bodyBreath += (breathing - this.bodyBreath) * Math.min(1, safeDt * 1.8);
    this.bodyPulse += (pulse - this.bodyPulse) * Math.min(1, safeDt * 3.4);
    this.bodyTension += (tension - this.bodyTension) * Math.min(1, safeDt * 2.2);
    this.bodyOrganic += (organic * 0.43 - this.bodyOrganic) * Math.min(1, safeDt * 2.0);
    // --- Pulse-jet locomotion ------------------------------------------------
    // The bell contracts (thrust + turning happen only here), then relaxes while
    // the body glides and slows down. Speed therefore surges and fades with the
    // body's own rhythm instead of being a constant cursor-like velocity.
    this.pulseT += safeDt;
    if (this.pulseT >= this.pulsePeriod) this.startPulse(1);

    const tc = this.pulseContractTime;
    let thrustProfile = 0;
    let contraction = 0;
    if (this.pulseT < tc) {
      thrustProfile = Math.sin(Math.PI * this.pulseT / tc);
      contraction = Math.sin((this.pulseT / tc) * Math.PI / 2);
    } else {
      const k = Math.min(1, (this.pulseT - tc) / LOCOMOTION.relaxTime);
      contraction = Math.pow(Math.cos(k * Math.PI / 2), 2);
    }
    this.swimContraction = contraction;

    // Soft edge of the world: a gentle current plus a bias to turn inward.
    // This is a wall, not a destination.
    const limitX = Math.min(bounds.width * WORLD.xFrac, WORLD.xMax);
    const limitY = Math.min(bounds.height * WORLD.yFrac, WORLD.yMax);
    const ex = Math.max(0, (Math.abs(this.x) - limitX * 0.7) / (limitX * 0.3));
    const ey = Math.max(0, (Math.abs(this.y) - limitY * 0.7) / (limitY * 0.3));
    let wallTurn = 0;
    if (ex > 0 || ey > 0) {
      const inX = -Math.sign(this.x) * ex;
      const inY = -Math.sign(this.y) * ey;
      const mag = Math.min(1.6, Math.hypot(inX, inY));
      wallTurn = clamp(angleDiff(Math.atan2(inY, inX), this.heading), -1, 1) * mag * 1.2;
      this.vx += inX * 6 * safeDt;
      this.vy += inY * 6 * safeDt;
    }
    const limitZ = 80;
    if (Math.abs(this.z) > limitZ) this.vz -= (this.z / limitZ) * 1.8 * safeDt;

    this.steerTurn *= Math.exp(-safeDt / 3.5);
    const turnRate = this.wanderTurn + this.steerTurn + wallTurn;
    this.angularVelocity = turnRate * thrustProfile;
    this.heading += this.angularVelocity * safeDt;

    const forwardX = Math.cos(this.heading);
    const forwardY = Math.sin(this.heading);
    if (thrustProfile > 0) {
      // Integral of the profile over the contraction equals pulseDv * kick.
      const accel = this.pulseDv * this.pulseKick * (Math.PI / (2 * tc)) * thrustProfile;
      this.vx += forwardX * accel * safeDt;
      this.vy += forwardY * accel * safeDt;
    }

    // Pending events create a barely visible preparation.
    if (anticipation > 0) this.targetScale = 1 + anticipation * 0.025;

    this.applyRippleField(ripples, safeDt);
    this.applyNeighborField(neighbors, safeDt);

    // Water drag. Sideways motion is damped faster than forward motion, so the
    // body carves through a turn instead of sliding like a puck.
    const fwd = this.vx * forwardX + this.vy * forwardY;
    const lat = -this.vx * forwardY + this.vy * forwardX;
    const nf = fwd * Math.exp(-safeDt / this.dragTau);
    const nl = lat * Math.exp(-safeDt / (this.dragTau * 0.45));
    this.vx = forwardX * nf - forwardY * nl;
    this.vy = forwardY * nf + forwardX * nl;
    this.vz *= Math.exp(-safeDt / this.dragTau);

    this.x += this.vx * safeDt;
    this.y += this.vy * safeDt;
    this.z += this.vz * safeDt * 36;

    // The body turns toward its heading with a soft delay and a slow passive wobble.
    const wobble = Math.sin(this.organicPhase * 0.9 + this.data.seed * 6.1) * 0.05;
    const headingDelta = angleDiff(this.heading + wobble, this.rotation);
    this.rotation += headingDelta * Math.min(1, safeDt * 1.9);

    this.bodySX = 1 + 0.05 * contraction;
    this.bodySY = 1 - 0.14 * contraction;

    const speedForBody = Math.min(1, Math.hypot(this.vx, this.vy) / 20);
    const turnForBody = Math.min(1, Math.abs(this.angularVelocity) * 2.8);
    const bodyScale = this.bodyBreath * (0.024 + micro * 0.035) + this.bodyPulse * 0.009 + this.bodyTension * 0.006
      + speedForBody * 0.006 - turnForBody * 0.004;
    const breath = Math.sin(this.phase * 0.72 + this.data.seed) * (0.010 + micro * 0.025);
    const visualScaleTarget = this.baseScale * this.targetScale * (1 + bodyScale + breath);
    const morphEase = this.morphReturning ? 0.28 : 1.0;
    this.scale += (visualScaleTarget - this.scale) * Math.min(1, safeDt * 2.4 * morphEase);
    this.spike += (this.targetSpike - this.spike) * Math.min(1, safeDt * 2.8 * morphEase);
    this.bloom += (this.targetBloom - this.bloom) * Math.min(1, safeDt * 2.0 * morphEase);
    this.stretch += (this.targetStretch - this.stretch) * Math.min(1, safeDt * 2.6 * morphEase);
    this.crystalline += (this.targetCrystalline - this.crystalline) * Math.min(1, safeDt * 2.6 * morphEase);
    this.ribbon += (this.targetRibbon - this.ribbon) * Math.min(1, safeDt * 2.5 * morphEase);
    this.vortex += (this.targetVortex - this.vortex) * Math.min(1, safeDt * 2.4 * morphEase);
    if (this.morphReturning && this.scale < 1.015 && this.spike < 0.015 && this.bloom < 0.015
      && this.stretch < 0.015 && this.crystalline < 0.015 && this.ribbon < 0.015
      && this.vortex < 0.015) {
      this.morphReturning = false;
      this.morphIntensity = 0;
      this.currentAction = 'normal';
    }
    this.currentHue += (this.targetDNA.hue + this.data.colorHueOffset - this.currentHue) * Math.min(1, safeDt * 0.7);
    this.activity += (micro - this.activity) * Math.min(1, safeDt * 0.6);
    this.imageAlpha += (this.targetImageAlpha - this.imageAlpha) * Math.min(1, safeDt * 1.5);

    // Rebuild contour + hitbox from the final state of this frame.
    this.refreshBody();
  }

  /** Recompute the visible contour and the hitbox from the same body state. */
  refreshBody(): void {
    computeBodyShape(this, this.shape, false);
    computeBodyShape(this, this.collisionShape, true);
    this.boundRadius = buildColliders(this.collisionShape, this.bodySX, this.bodySY, this.rotation, this.colliders);
    let m = 0;
    for (const c of this.colliders) m += c.r * c.r;
    this.mass = Math.max(200, m);
  }

  private startPulse(kick: number): void {
    this.pulseT = 0;
    this.pulseKick = kick;
    this.wanderTurn = clamp(
      this.wanderTurn * 0.55 + this.rng.range(-1, 1) * (0.28 + this.data.responsiveness * 0.3), -0.8, 0.8);
    let period = LOCOMOTION.basePeriod * this.rng.range(0.85, 1.25);
    if (this.rng.chance(LOCOMOTION.restChance)) period *= this.rng.range(1.5, 2.6);
    if (kick > 1.2) period /= 1.3;
    this.pulsePeriod = Math.max(period, this.pulseContractTime + 1.0);
  }

  /** Strengthen the current pulse, or start one right away if the bell is relaxed. */
  private kickPulse(multiplier: number): void {
    if (this.pulseT < this.pulseContractTime) this.pulseKick = Math.max(this.pulseKick, multiplier);
    else this.startPulse(multiplier);
  }

  /** Called by the collision pass when a real impact happens. */
  noteImpact(intensity: number): void {
    this.bodyPulse += intensity * 0.5;
    this.bodyTension += intensity * 0.3;
  }

  getCollisionRadius(): number { return this.boundRadius; }

  private applyRippleField(ripples: readonly RippleInfluence[], dt: number): void {
    for (const ripple of ripples) {
      const distance = Math.max(ripple.distance, 0.001);
      const nx = ripple.dx / distance;
      const ny = ripple.dy / distance;

      // The ring perturbs the existing trajectory rather than directly
      // controlling position. The effect is deliberately small.
      const ringDistance = Math.abs(distance - ripple.radius);
      const ringBand = Math.max(0, 1 - ringDistance / 34);
      const radial = ripple.strength * ringBand * (0.72 + this.data.responsiveness * 0.52);
      this.vx += nx * radial * dt * 9;
      this.vy += ny * radial * dt * 9;

      const tangentX = -ny;
      const tangentY = nx;
      const lateral = Math.sin(this.phase + ripple.radius * 0.035) * radial * 1.05;
      this.vx += tangentX * lateral * dt * 3.5;
      this.vy += tangentY * lateral * dt * 3.5;

    }
  }

  private applyNeighborField(neighbors: readonly NeighborInfluence[], dt: number): void {
    for (const n of neighbors) {
      const distance = Math.max(n.distance, 0.001);
      // Contact itself is resolved by the collision pass (world.ts) using the
      // real body contour. Here only weak far-field coupling remains.
      if (distance < 150) {
        // Very weak velocity coupling: enough for occasional apparent
        // coordination, but not enough to create contagious behavior.
        const coupling = n.proximity * 0.000075 * (0.35 + this.data.responsiveness);
        this.vx += (n.vx - this.vx) * coupling * 60 * dt;
        this.vy += (n.vy - this.vy) * coupling * 60 * dt;

        const side = Math.sign(this.preferredTurn);
        const tangentX = -n.y / distance;
        const tangentY = n.x / distance;
        const orbit = Math.sin(this.phase * 0.23 + n.index * 1.7) * 0.0018 * n.proximity;
        this.vx += tangentX * orbit * side * dt;
        this.vy += tangentY * orbit * side * dt;
      }
    }
  }

  async bringImageFragment(keyword?: string) {
    const fragment = await this.provider.fetchImage(keyword);
    if (!fragment?.imageUrl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = fragment.imageUrl;
    img.onload = () => {
      this.carriedImage = img;
      this.imageCaption = fragment.title ?? null;
      this.targetImageAlpha = 0.72;
      if (ENABLE_CREATURE_SOUNDS) this.sound.emitBreath(2.6, 0.9);
      window.setTimeout(() => {
        this.targetImageAlpha = 0;
        window.setTimeout(() => {
          this.carriedImage = null;
          this.imageCaption = null;
        }, 3000);
      }, 9000);
    };
  }

  applyMorph(action: MorphAction) {
    this.currentAction = action;
    this.morphReturning = false;
    this.morphStartedAt = performance.now() / 1000;
    this.morphIntensity = action === 'normal' ? 0 : 1;
    this.targetScale = 1.0;
    this.targetSpike = 0.0;
    this.targetBloom = 0.0;
    this.targetStretch = 0.0;
    this.targetCrystalline = 0.0;
    this.targetRibbon = 0.0;
    this.targetVortex = 0.0;
    this.setMorphTargetsForAction(action);
    if (action === 'giant') this.kickPulse(1.5);
    if (ENABLE_CREATURE_SOUNDS && action === 'bloom') this.sound.emitPurr(2.6);
  }

  private setMorphTargetsForAction(action: MorphAction): void {
    switch (action) {
      case 'spiky': this.targetScale = 1.04; this.targetSpike = 0.82; break;
      case 'bloom': this.targetScale = 1.10; this.targetBloom = 0.60; break;
      case 'giant': this.targetScale = 1.58; this.targetBloom = 0.92; break;
      case 'compact': this.targetScale = 0.88; break;
      case 'droplet': this.targetStretch = 0.92; break;
      case 'crystalline': this.targetCrystalline = 0.82; break;
      case 'ribbon': this.targetRibbon = 0.86; this.targetScale = 1.04; break;
      case 'vortex': this.targetVortex = 0.88; break;
      case 'normal': default: break;
    }
  }

  private resetMorphTargets(): void {
    this.targetScale = 1.0;
    this.targetSpike = 0.0;
    this.targetBloom = 0.0;
    this.targetStretch = 0.0;
    this.targetCrystalline = 0.0;
    this.targetRibbon = 0.0;
    this.targetVortex = 0.0;
    // Keep a weak trace of the current morphology while the visual state
    // slowly recovers. Other creatures can still be influenced by the
    // visible change during this fading period.
    this.morphIntensity = 0.35;
    this.morphReturning = true;
  }

  getPersistentState() {
    return {
      x: this.x, y: this.y, z: this.z,
      vx: this.vx, vy: this.vy, vz: this.vz,
      heading: this.heading, rotation: this.rotation,
      currentAction: this.currentAction,
      scale: this.scale, spike: this.spike, bloom: this.bloom,
      stretch: this.stretch, crystalline: this.crystalline,
      ribbon: this.ribbon, vortex: this.vortex,
      currentHue: this.currentHue,
      bodyBreath: this.bodyBreath, bodyPulse: this.bodyPulse, bodyTension: this.bodyTension,
    };
  }

  restorePersistentState(state: unknown): void {
    if (!state || typeof state !== 'object') return;
    const s = state as Record<string, unknown>;
    const num = (key: string, fallback: number) => typeof s[key] === 'number' && Number.isFinite(s[key]) ? s[key] as number : fallback;
    this.x = num('x', this.x); this.y = num('y', this.y); this.z = num('z', this.z);
    this.vx = num('vx', this.vx); this.vy = num('vy', this.vy); this.vz = num('vz', this.vz);
    this.heading = num('heading', this.heading); this.rotation = num('rotation', this.rotation);
    this.currentHue = num('currentHue', this.currentHue);
    this.bodyBreath = num('bodyBreath', this.bodyBreath);
    this.bodyPulse = num('bodyPulse', this.bodyPulse);
    this.bodyTension = num('bodyTension', this.bodyTension);
    this.scale = num('scale', this.scale); this.spike = num('spike', this.spike);
    this.bloom = num('bloom', this.bloom); this.stretch = num('stretch', this.stretch);
    this.crystalline = num('crystalline', this.crystalline); this.ribbon = num('ribbon', this.ribbon);
    this.vortex = num('vortex', this.vortex);
    const action = s.currentAction;
    if (isMorphAction(action as BehaviorAction)) {
      this.currentAction = action as MorphAction;
      this.morphIntensity = this.currentAction === 'normal' ? 0 : 0.65;
      this.morphStartedAt = performance.now() / 1000;
      this.morphReturning = false;
      this.setMorphTargetsForAction(this.currentAction);
    }
    this.refreshBody();
  }

  handleTouch(screenWorldX: number, screenWorldY: number) {
    // Input is specified in the same centered screen plane used by the
    // renderer. Project the creature into that plane first, so z-depth does
    // not make taps appear offset from the visible body.
    const perspective = 380 / (380 + this.z);
    const visibleX = this.x * perspective;
    const visibleY = this.y * perspective;
    const dx = visibleX - screenWorldX;
    const dy = visibleY - screenWorldY;
    const dist = Math.hypot(dx, dy);
    const reach = this.getCollisionRadius() + 145;
    if (dist < reach) {
      const safeDist = Math.max(12, dist);
      const proximity = 1 - Math.min(dist, reach) / reach;
      const impulse = 2.5 + proximity * 8; // px/s: a visible push of the water
      this.vx += (dx / safeDist) * impulse;
      this.vy += (dy / safeDist) * impulse;
      // A nearby disturbance also creates a tiny bodily contraction, making
      // the physical reaction visible even before locomotion changes.
      this.bodyPulse += proximity * 0.32;
      this.bodyTension += proximity * 0.18;
    }
  }

  // Kept as an optional input channel. The creature does not need a mic to
  // function, and no speech content is ever interpreted.
  handleAudio(features: AcousticFeatures, _bounds: { width: number; height: number }) {
    if (!features.isOnset) return;
    const now = performance.now() / 1000;
    this.behavior.requestAudio(now, features.level, features.flux);
  }

  getBaseScale(): number { return this.baseScale; }
  getMorphIntensity(): number { return this.morphIntensity; }
  getMorphAge(): number {
    if (this.morphIntensity <= 0) return Infinity;
    return Math.max(0, performance.now() / 1000 - this.morphStartedAt);
  }

  get behaviorReadiness(): number { return this.behavior.getReadiness(); }

  consumeDivisionRequest(): boolean {
    if (!Number.isFinite(this.divisionRequestedAt) || performance.now() / 1000 < this.divisionRequestedAt) return false;
    this.divisionRequestedAt = -Infinity;
    this.targetScale = 1.0;
    this.targetBloom = 0.0;
    return true;
  }

  private executeBehaviorEvent(event: BehaviorEvent, neighbors: readonly NeighborInfluence[]): void {
    const action = event.action;
    const nearest = neighbors.reduce<NeighborInfluence | null>((best, n) =>
      !best || n.distance < best.distance ? n : best, null);

    switch (action) {
      case 'approach':
      case 'seek':
        if (nearest) this.steerToward(nearest.x, nearest.y, 0.065 + event.anticipation * 0.025);
        break;
      case 'retreat':
        if (nearest) this.steerToward(-nearest.x, -nearest.y, 0.08);
        else this.steerToward(-Math.cos(this.heading), -Math.sin(this.heading), 0.06);
        break;
      case 'orbit':
        if (nearest) {
          this.steerTurn = clamp(this.steerTurn + this.preferredTurn * 0.35, -1, 1);
        }
        break;
      case 'hesitate':
        // Stop beating for a moment: the body just glides and slows.
        this.pulsePeriod = Math.max(this.pulsePeriod, this.pulseT + this.rng.range(2.0, 3.6));
        this.steerTurn = clamp(this.steerTurn + this.preferredTurn * 0.15, -1, 1);
        break;
      case 'burst':
        this.kickPulse(1.35 + event.anticipation * 0.4);
        break;
      case 'drift':
        this.steerTurn = clamp(this.steerTurn + this.preferredTurn * 0.12, -1, 1);
        break;
      case 'expand': this.applyMorph('bloom'); break;
      case 'contract': this.applyMorph('compact'); break;
      case 'deform': this.applyMorph('droplet'); break;
      case 'birth':
        // Birth is not a visual two-core morph. The parent temporarily
        // swells and then becomes the source of a new independent body.
        this.divisionRequestedAt = performance.now() / 1000 + 1.15;
        this.targetScale = 1.14;
        this.targetBloom = 0.28;
        break;
      case 'rotate': this.applyMorph('vortex'); break;
      default:
        if (isMorphAction(action)) this.applyMorph(action);
        break;
    }

    if (ENABLE_ONLINE_RESOURCE_ACTIONS && action === 'vortex' && !this.carriedImage && this.provider.canFetch()) {
      void this.bringImageFragment();
    }
    this.behavior.noteExecutedAction(action);
    if (event.source === 'touch') this.data.totalInteractions += 1;
    recordAction(this.data, action, Date.now());
  }

  private steerToward(x: number, y: number, strength: number): void {
    const desired = Math.atan2(y, x);
    let delta = desired - this.heading;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;

    // Steering only biases the turning that happens during pulses, so the body
    // has to beat and swing around before its path changes.
    this.steerTurn = clamp(this.steerTurn + clamp(delta, -1.2, 1.2) * strength * 8, -1.2, 1.2);
    if (this.pulseT > this.pulseContractTime + 0.6) this.pulsePeriod = Math.min(this.pulsePeriod, this.pulseT + 0.8);
  }

  private isLateNight(): boolean {
    const hour = new Date().getHours();
    return hour >= 23 || hour < 6;
  }
}

function fract(value: number): number { return value - Math.floor(value); }

function isMorphAction(action: BehaviorAction): action is MorphAction {
  return action === 'normal' || action === 'spiky' || action === 'bloom' || action === 'compact'
    || action === 'droplet' || action === 'crystalline' || action === 'ribbon'
    || action === 'vortex' || action === 'giant';
}
