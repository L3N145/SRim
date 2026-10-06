import { BehaviorScheduler } from './behavior';
import { recordAction } from './storage';
import { DNAEngine } from './procedural';
const ENABLE_CREATURE_SOUNDS = false;
const ENABLE_ONLINE_RESOURCE_ACTIONS = true;
export class Creature {
    data;
    sound;
    provider;
    x = 0;
    y = 0;
    z = 0;
    vx = 0;
    vy = 0;
    vz = 0;
    currentAction = 'normal';
    scale = 1.0;
    targetScale = 1.0;
    baseScale;
    spike = 0;
    targetSpike = 0;
    bloom = 0;
    targetBloom = 0;
    stretch = 0;
    targetStretch = 0;
    crystalline = 0;
    targetCrystalline = 0;
    ribbon = 0;
    targetRibbon = 0;
    vortex = 0;
    targetVortex = 0;
    carriedImage = null;
    imageAlpha = 0;
    targetImageAlpha = 0;
    imageCaption = null;
    activeDNA;
    targetDNA;
    currentHue;
    phase = 0;
    rotation = 0;
    activity = 0.04;
    // Multi-scale bodily motion: these are physical oscillators, not emotions.
    bodyBreath = 0;
    bodyPulse = 0;
    bodyTension = 0;
    // Kinematic state is intentionally semantic-free.
    heading = 0;
    angularVelocity = 0;
    burst = 0;
    preferredTurn = 1;
    behavior;
    morphStartedAt = -Infinity;
    lastMorphReturnCheck = -Infinity;
    morphReturning = false;
    morphIntensity = 0;
    lastNeighborCheck = -Infinity;
    motionSpeed = 0.075;
    motionSpeedTarget = 0.075;
    nextWanderChangeAt = -Infinity;
    wanderTargetTurn = 0;
    divisionRequestedAt = -Infinity;
    constructor(data, sound, provider) {
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
        this.baseScale = 1.0 + fract(data.seed * 7.31) * 0.28;
        this.nextWanderChangeAt = performance.now() / 1000 + 1.5 + fract(data.seed * 5.17) * 2.5;
        this.activeDNA = DNAEngine.synthesize(data.seed);
        this.targetDNA = { ...this.activeDNA };
        this.currentHue = this.activeDNA.hue + data.colorHueOffset;
    }
    update(dt, bounds, neighbors = [], ripples = []) {
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
            if (this.behavior.shouldReleaseMorph(age))
                this.resetMorphTargets();
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
        // Three time scales keep the body alive even when locomotion is quiet:
        // slow respiration, a shorter muscular pulse, and a faint irregular tension.
        const breathPhase = this.phase * (0.34 + this.data.baseViscosity * 2.1) + this.data.seed * 4.7;
        const pulsePhase = this.phase * (1.15 + this.data.responsiveness * 0.55) + this.data.seed * 9.3;
        const tensionPhase = this.phase * 2.7 + Math.sin(this.phase * 0.41 + this.data.seed * 3.1);
        const breathing = Math.sin(breathPhase) * 0.62 + Math.sin(breathPhase * 0.47 + 1.7) * 0.22;
        const pulse = Math.sin(pulsePhase) * 0.5 + Math.sin(pulsePhase * 1.73 + 0.9) * 0.16;
        const tension = Math.sin(tensionPhase) * 0.5 + Math.sin(tensionPhase * 0.61 + 2.2) * 0.35;
        this.bodyBreath += (breathing - this.bodyBreath) * Math.min(1, safeDt * 1.8);
        this.bodyPulse += (pulse - this.bodyPulse) * Math.min(1, safeDt * 3.4);
        this.bodyTension += (tension - this.bodyTension) * Math.min(1, safeDt * 2.2);
        const speedRhythm = 0.5 + 0.5 * Math.sin(this.phase * 0.19 + this.data.seed * 5.1);
        const naturalTarget = 0.115 + micro * 0.22 + speedRhythm * 0.055;
        this.motionSpeedTarget += (naturalTarget - this.motionSpeedTarget) * Math.min(1, safeDt * 0.8);
        this.motionSpeed += (this.motionSpeedTarget - this.motionSpeed) * Math.min(1, safeDt * 1.6);
        const wandering = 0.085 + micro * 0.24;
        const noiseX = Math.sin(this.phase * 0.73 + this.data.seed * 8.1);
        const noiseY = Math.cos(this.phase * 0.57 + this.data.seed * 5.7);
        this.vx += noiseX * wandering * safeDt;
        this.vy += noiseY * wandering * safeDt;
        // Ordinary locomotion has its own low-frequency direction changes,
        // separate from bursts, hesitations, and morphology.
        if (now >= this.nextWanderChangeAt) {
            const wobble = Math.sin(this.phase * 1.73 + this.data.seed * 11.7);
            this.wanderTargetTurn = wobble * (0.010 + this.data.responsiveness * 0.012);
            this.nextWanderChangeAt = now + 1.1 + Math.abs(wobble) * 2.6;
        }
        this.angularVelocity += this.wanderTargetTurn * safeDt;
        this.angularVelocity += Math.sin(this.phase * 0.31 + this.data.seed * 4) * 0.0048 * safeDt;
        this.angularVelocity *= Math.pow(0.965, safeDt * 60);
        this.heading += this.angularVelocity * 60 * safeDt;
        // Pending events create a barely visible preparation. The user can notice
        // that something is changing without being told what it means.
        if (anticipation > 0) {
            this.targetScale = 1 + anticipation * 0.025;
            this.vx *= 1 - anticipation * 0.003;
            this.vy *= 1 - anticipation * 0.003;
        }
        // A tap creates a temporary physical disturbance in the world. The
        // creature receives only the geometry of the expanding ring; it does not
        // receive a semantic instruction such as "move away".
        this.applyRippleField(ripples, safeDt);
        // Local multi-agent field. Creatures do not "know" each other's labels;
        // they only respond to distance and velocity.
        this.applyNeighborField(neighbors, safeDt);
        const forwardX = Math.cos(this.heading);
        const forwardY = Math.sin(this.heading);
        const propulsion = this.motionSpeed * (0.16 + this.data.baseViscosity * 0.35);
        this.vx += forwardX * propulsion * safeDt;
        this.vy += forwardY * propulsion * safeDt;
        if (this.burst > 0) {
            // Bursts are still noticeable, but they are deliberately capped. The
            // creature should never look like a projectile crossing the screen.
            const burstForce = 0.11 * this.burst;
            this.motionSpeedTarget = Math.min(0.24, this.motionSpeedTarget + 0.035 * this.burst);
            this.vx += forwardX * burstForce * safeDt;
            this.vy += forwardY * burstForce * safeDt;
            this.burst = Math.max(0, this.burst - safeDt * 0.75);
        }
        const limitX = Math.min(bounds.width * 0.24, 150);
        const limitY = Math.min(bounds.height * 0.24, 190);
        const limitZ = 80;
        if (Math.abs(this.x) > limitX)
            this.vx -= (this.x / limitX) * 1.6 * safeDt;
        if (Math.abs(this.y) > limitY)
            this.vy -= (this.y / limitY) * 1.6 * safeDt;
        if (Math.abs(this.z) > limitZ)
            this.vz -= (this.z / limitZ) * 1.8 * safeDt;
        this.vx *= Math.pow(this.data.inertia, safeDt * 60);
        this.vy *= Math.pow(this.data.inertia, safeDt * 60);
        this.vz *= Math.pow(this.data.inertia, safeDt * 60);
        // Soft speed limit. Instead of clipping velocity abruptly, excess speed
        // is removed gradually so acceleration/deceleration remain visible.
        const speed = Math.hypot(this.vx, this.vy);
        const maxSpeed = 0.42 + this.burst * 0.06;
        if (speed > maxSpeed) {
            const damping = Math.min(1, safeDt * 2.8);
            const scale = 1 - damping * (1 - maxSpeed / speed);
            this.vx *= scale;
            this.vy *= scale;
        }
        // Slightly higher world-space travel makes the autonomous trajectory
        // legible on a phone-sized screen.
        this.x += this.vx * safeDt * 48;
        this.y += this.vy * safeDt * 48;
        this.z += this.vz * safeDt * 40;
        this.rotation += (this.angularVelocity + this.vx * 0.0008) * 60 * safeDt;
        const bodyScale = this.bodyBreath * (0.024 + micro * 0.035) + this.bodyPulse * 0.009 + this.bodyTension * 0.006;
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
    }
    getCollisionRadius() {
        let radius = 36 * this.scale;
        radius *= 1 + this.bloom * 0.55;
        radius *= 1 + this.spike * 0.25;
        radius *= 1 + this.ribbon * 0.30;
        radius *= 1 + this.crystalline * 0.16;
        radius *= 1 + this.vortex * 0.12;
        radius += this.stretch * 14;
        return Math.max(24, Math.min(78, radius));
    }
    applyRippleField(ripples, dt) {
        for (const ripple of ripples) {
            const distance = Math.max(ripple.distance, 0.001);
            const nx = ripple.dx / distance;
            const ny = ripple.dy / distance;
            // The ring perturbs the existing trajectory rather than directly
            // controlling position. The effect is deliberately small.
            const ringDistance = Math.abs(distance - ripple.radius);
            const ringBand = Math.max(0, 1 - ringDistance / 34);
            const radial = ripple.strength * ringBand * (0.72 + this.data.responsiveness * 0.52);
            this.vx += nx * radial * dt * 3.2;
            this.vy += ny * radial * dt * 3.2;
            const tangentX = -ny;
            const tangentY = nx;
            const lateral = Math.sin(this.phase + ripple.radius * 0.035) * radial * 1.05;
            this.vx += tangentX * lateral * dt * 1.7;
            this.vy += tangentY * lateral * dt * 1.7;
            if (ringBand > 0.45 && ripple.strength > 0.55) {
                this.behavior.requestTouch(performance.now() / 1000);
            }
        }
    }
    applyNeighborField(neighbors, dt) {
        for (const n of neighbors) {
            const distance = Math.max(n.distance, 0.001);
            const contactRadius = this.getCollisionRadius() + n.collisionRadius;
            const softRadius = contactRadius + 12;
            if (distance < contactRadius) {
                const penetration = contactRadius - distance;
                const correction = Math.min(1.15, penetration * 0.18);
                this.x -= (n.x / distance) * correction;
                this.y -= (n.y / distance) * correction;
                const overlapRatio = Math.min(1, penetration / Math.max(contactRadius, 1));
                const strength = 0.045 + overlapRatio * 0.085;
                this.vx -= (n.x / distance) * strength * dt;
                this.vy -= (n.y / distance) * strength * dt;
            }
            else if (distance < softRadius) {
                const strength = (1 - (distance - contactRadius) / 12) * 0.022;
                this.vx -= (n.x / distance) * strength * dt;
                this.vy -= (n.y / distance) * strength * dt;
            }
            else if (distance < 150) {
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
    async bringImageFragment(keyword) {
        const fragment = await this.provider.fetchImage(keyword);
        if (!fragment?.imageUrl)
            return;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = fragment.imageUrl;
        img.onload = () => {
            this.carriedImage = img;
            this.imageCaption = fragment.title ?? null;
            this.targetImageAlpha = 0.72;
            if (ENABLE_CREATURE_SOUNDS)
                this.sound.emitBreath(2.6, 0.9);
            window.setTimeout(() => {
                this.targetImageAlpha = 0;
                window.setTimeout(() => {
                    this.carriedImage = null;
                    this.imageCaption = null;
                }, 3000);
            }, 9000);
        };
    }
    applyMorph(action) {
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
        if (ENABLE_CREATURE_SOUNDS && action === 'bloom')
            this.sound.emitPurr(2.6);
    }
    setMorphTargetsForAction(action) {
        switch (action) {
            case 'spiky':
                this.targetScale = 1.035;
                this.targetSpike = 0.70;
                break;
            case 'bloom':
                this.targetScale = 1.13;
                this.targetBloom = 0.72;
                break;
            case 'giant':
                this.targetScale = 1.58;
                this.targetBloom = 0.92;
                this.burst = Math.max(this.burst, 0.95);
                break;
            case 'compact':
                this.targetScale = 0.88;
                break;
            case 'droplet':
                this.targetStretch = 0.70;
                break;
            case 'crystalline':
                this.targetCrystalline = 0.68;
                break;
            case 'ribbon':
                this.targetRibbon = 0.68;
                this.targetScale = 1.06;
                break;
            case 'vortex':
                this.targetVortex = 0.70;
                break;
            case 'normal':
            default: break;
        }
    }
    resetMorphTargets() {
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
    restorePersistentState(state) {
        if (!state || typeof state !== 'object')
            return;
        const s = state;
        const num = (key, fallback) => typeof s[key] === 'number' && Number.isFinite(s[key]) ? s[key] : fallback;
        this.x = num('x', this.x);
        this.y = num('y', this.y);
        this.z = num('z', this.z);
        this.vx = num('vx', this.vx);
        this.vy = num('vy', this.vy);
        this.vz = num('vz', this.vz);
        this.heading = num('heading', this.heading);
        this.rotation = num('rotation', this.rotation);
        this.currentHue = num('currentHue', this.currentHue);
        this.bodyBreath = num('bodyBreath', this.bodyBreath);
        this.bodyPulse = num('bodyPulse', this.bodyPulse);
        this.bodyTension = num('bodyTension', this.bodyTension);
        this.scale = num('scale', this.scale);
        this.spike = num('spike', this.spike);
        this.bloom = num('bloom', this.bloom);
        this.stretch = num('stretch', this.stretch);
        this.crystalline = num('crystalline', this.crystalline);
        this.ribbon = num('ribbon', this.ribbon);
        this.vortex = num('vortex', this.vortex);
        const action = s.currentAction;
        if (isMorphAction(action)) {
            this.currentAction = action;
            this.morphIntensity = this.currentAction === 'normal' ? 0 : 0.65;
            this.morphStartedAt = performance.now() / 1000;
            this.morphReturning = false;
            this.setMorphTargetsForAction(this.currentAction);
        }
    }
    handleTouch(screenWorldX, screenWorldY) {
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
            const impulse = 0.12 + proximity * 0.26;
            this.vx += (dx / safeDist) * impulse;
            this.vy += (dy / safeDist) * impulse;
            // A nearby disturbance also creates a tiny bodily contraction, making
            // the physical reaction visible even before locomotion changes.
            this.bodyPulse += proximity * 0.32;
            this.bodyTension += proximity * 0.18;
            this.behavior.requestTouch(performance.now() / 1000);
        }
    }
    // Kept as an optional input channel. The creature does not need a mic to
    // function, and no speech content is ever interpreted.
    handleAudio(features, _bounds) {
        if (!features.isOnset)
            return;
        const now = performance.now() / 1000;
        this.behavior.requestAudio(now, features.level, features.flux);
    }
    getBaseScale() { return this.baseScale; }
    getMorphIntensity() { return this.morphIntensity; }
    getMorphAge() {
        if (this.morphIntensity <= 0)
            return Infinity;
        return Math.max(0, performance.now() / 1000 - this.morphStartedAt);
    }
    get behaviorReadiness() { return this.behavior.getReadiness(); }
    consumeDivisionRequest() {
        if (!Number.isFinite(this.divisionRequestedAt) || performance.now() / 1000 < this.divisionRequestedAt)
            return false;
        this.divisionRequestedAt = -Infinity;
        this.targetScale = 1.0;
        this.targetBloom = 0.0;
        return true;
    }
    executeBehaviorEvent(event, neighbors) {
        const action = event.action;
        const nearest = neighbors.reduce((best, n) => !best || n.distance < best.distance ? n : best, null);
        switch (action) {
            case 'approach':
            case 'seek':
                if (nearest)
                    this.steerToward(nearest.x, nearest.y, 0.065 + event.anticipation * 0.025);
                break;
            case 'retreat':
                if (nearest)
                    this.steerToward(-nearest.x, -nearest.y, 0.08);
                else
                    this.steerToward(-Math.cos(this.heading), -Math.sin(this.heading), 0.06);
                break;
            case 'orbit':
                if (nearest) {
                    this.angularVelocity += this.preferredTurn * 0.012;
                    this.motionSpeedTarget = Math.min(0.14, this.motionSpeedTarget + 0.012);
                }
                break;
            case 'hesitate':
                this.vx *= 0.72;
                this.vy *= 0.72;
                this.motionSpeedTarget = Math.max(0.075, this.motionSpeedTarget * 0.78);
                this.angularVelocity += this.preferredTurn * 0.012;
                break;
            case 'burst':
                this.burst = Math.max(this.burst, 0.55 + event.anticipation * 0.42);
                this.motionSpeedTarget = Math.min(0.22, this.motionSpeedTarget + 0.045);
                break;
            case 'drift':
                this.angularVelocity += this.preferredTurn * 0.004;
                break;
            case 'expand':
                this.applyMorph('bloom');
                break;
            case 'contract':
                this.applyMorph('compact');
                break;
            case 'deform':
                this.applyMorph('droplet');
                break;
            case 'birth':
                // Birth is not a visual two-core morph. The parent temporarily
                // swells and then becomes the source of a new independent body.
                this.divisionRequestedAt = performance.now() / 1000 + 1.15;
                this.targetScale = 1.14;
                this.targetBloom = 0.28;
                break;
            case 'rotate':
                this.applyMorph('vortex');
                break;
            default:
                if (isMorphAction(action))
                    this.applyMorph(action);
                break;
        }
        if (ENABLE_ONLINE_RESOURCE_ACTIONS && action === 'vortex' && !this.carriedImage && this.provider.canFetch()) {
            void this.bringImageFragment();
        }
        this.behavior.noteExecutedAction(action);
        if (event.source === 'touch')
            this.data.totalInteractions += 1;
        recordAction(this.data, action, Date.now());
    }
    steerToward(x, y, strength) {
        const desired = Math.atan2(y, x);
        let delta = desired - this.heading;
        while (delta > Math.PI)
            delta -= Math.PI * 2;
        while (delta < -Math.PI)
            delta += Math.PI * 2;
        // Direction changes are expressed as turning rather than teleport-like
        // velocity impulses. This gives approach/retreat/orbit events a biological
        // feel: the creature has to turn before its trajectory changes.
        const turn = Math.max(-0.032, Math.min(0.032, delta)) * strength;
        this.angularVelocity += turn;
        this.motionSpeedTarget = Math.min(0.16, this.motionSpeedTarget + strength * 0.012);
    }
    isLateNight() {
        const hour = new Date().getHours();
        return hour >= 23 || hour < 6;
    }
}
function fract(value) { return value - Math.floor(value); }
function isMorphAction(action) {
    return action === 'normal' || action === 'spiky' || action === 'bloom' || action === 'compact'
        || action === 'droplet' || action === 'crystalline' || action === 'ribbon'
        || action === 'vortex' || action === 'giant';
}
