import { SeededRandom } from './random';

export type MorphAction =
  | 'normal' | 'spiky' | 'bloom' | 'compact' | 'droplet'
  | 'crystalline' | 'ribbon' | 'vortex' | 'giant';

export type BehaviorAction = MorphAction |
  'idle' | 'breathe' | 'drift' | 'approach' | 'retreat' |
  'expand' | 'contract' | 'rotate' | 'deform' |
  'burst' | 'hesitate' | 'seek' | 'orbit' | 'birth';

export type BehaviorSource = 'autonomous' | 'touch' | 'audio' | 'interaction';

export interface BehaviorEvent {
  source: BehaviorSource;
  action: BehaviorAction;
  scheduledAt: number;
  anticipation: number;
}

export interface BehaviorProfile {
  activity: number;
  responsiveness: number;
  inertia: number;
}

interface PendingEvent {
  dueAt: number;
  action: BehaviorAction;
  anticipation: number;
  source: BehaviorSource;
}

export class BehaviorScheduler {
  private readonly rng: SeededRandom;
  private readonly profile: BehaviorProfile;
  private pending: PendingEvent | null = null;
  private quietTime: number;
  private readiness: number;
  private microPhase: number;
  private lastTouchAt = -Infinity;
  private lastAudioAt = -Infinity;
  private lastInteractionAt = -Infinity;
  private lastNeighborImpulseAt = -Infinity;
  private anticipation = 0;
  private recentMorphs: MorphAction[] = [];

  constructor(seed: number, profile: BehaviorProfile, recentActions: readonly string[] = []) {
    this.rng = new SeededRandom(seed + 0.192837);
    this.profile = {
      activity: clamp(profile.activity, 0.08, 1),
      responsiveness: clamp(profile.responsiveness, 0.05, 1),
      inertia: clamp(profile.inertia, 0.7, 0.99),
    };
    this.quietTime = this.rng.range(5, 20);
    this.readiness = this.rng.range(0.08, 0.24);
    this.microPhase = this.rng.range(0, Math.PI * 2);
    this.recentMorphs = recentActions.filter(isMorphAction).slice(-6);
  }

  update(dt: number, now: number, lateNight: boolean): BehaviorEvent[] {
    const safeDt = Math.min(Math.max(dt, 0), 0.1);
    this.quietTime += safeDt;
    this.microPhase += safeDt * (0.12 + this.profile.activity * 0.18);
    this.readiness = Math.min(1, this.readiness + safeDt / (lateNight ? 70 : 50));

    const events: BehaviorEvent[] = [];
    if (this.pending && now >= this.pending.dueAt) {
      events.push({
        source: this.pending.source,
        action: this.pending.action,
        scheduledAt: this.pending.dueAt,
        anticipation: this.pending.anticipation,
      });
      this.pending = null;
      this.anticipation = 0;
      this.quietTime = 0;
      this.readiness = this.rng.range(0.04, 0.12);
    }

    const minimumQuiet = lateNight ? 12 : 8;
    if (!this.pending && this.quietTime >= minimumQuiet) {
      // Macro events are uncommon, but should still occur during a short glance.
      const hazard = 0.006 + Math.pow(this.readiness, 1.35) * 0.055;
      if (this.rng.chance(1 - Math.exp(-hazard * safeDt))) this.scheduleAutonomous(now);
    }
    return events;
  }

  requestAudio(now: number, level: number, flux: number): void {
    if (now - this.lastAudioAt < 1.4 || this.pending) return;
    this.lastAudioAt = now;
    const strength = clamp(level * 0.75 + flux * 0.35);
    const chance = 0.55 + this.profile.responsiveness * 0.30 + strength * 0.18;
    if (!this.rng.chance(Math.min(0.96, chance))) return;
    const dramatic = strength > 0.26 || this.rng.chance(0.50);
    this.pending = {
      dueAt: now + this.rng.range(dramatic ? 0.06 : 0.25, dramatic ? 0.70 : 1.8),
      source: 'audio',
      action: this.rng.weighted([
        { item: 'burst' as const, weight: dramatic ? 22 : 9 },
        { item: 'retreat' as const, weight: 14 },
        { item: 'seek' as const, weight: 10 },
        { item: 'hesitate' as const, weight: 7 },
        { item: 'bloom' as const, weight: dramatic ? 16 : 8 },
        { item: 'deform' as const, weight: dramatic ? 13 : 6 },
        { item: 'ribbon' as const, weight: dramatic ? 8 : 4 },
        { item: 'vortex' as const, weight: dramatic ? 6 : 2 },
        { item: 'giant' as const, weight: dramatic ? 2 : 0.3 },
      ]),
      anticipation: dramatic ? this.rng.range(0.55, 1) : this.rng.range(0.25, 0.65),
    };
  }

  shouldReleaseMorph(age: number): boolean {
    if (age <= 2.5) return false;
    const hazard = Math.min(0.055, 0.007 + (age - 2.5) * 0.0025);
    return this.rng.chance(hazard);
  }

  requestNeighborImpulse(now: number, intensity: number): void {
    // Other creatures should be a weak environmental influence, not a
    // contagious event system. The observer may notice a relationship, but
    // there is no reliable "copy" chain.
    if (now - this.lastNeighborImpulseAt < 3.0 || this.pending) return;
    this.lastNeighborImpulseAt = now;
    const strength = clamp(intensity);
    const chance = 0.025 + this.profile.responsiveness * 0.045 + strength * 0.065;
    if (!this.rng.chance(Math.min(0.12, chance))) return;
    const dramatic = strength > 0.75 && this.rng.chance(0.16);
    this.pending = {
      dueAt: now + this.rng.range(1.2, dramatic ? 4.2 : 5.8),
      source: 'interaction',
      action: this.rng.weighted([
        { item: 'drift' as const, weight: 18 },
        { item: 'hesitate' as const, weight: 14 },
        { item: 'deform' as const, weight: 6 },
        { item: 'breathe' as const, weight: 15 },
        { item: 'approach' as const, weight: 7 },
        { item: 'retreat' as const, weight: 5 },
        { item: 'expand' as const, weight: dramatic ? 7 : 2 },
        { item: 'burst' as const, weight: dramatic ? 5 : 1 },
        { item: 'bloom' as const, weight: dramatic ? 4 : 1.5 },
        { item: 'vortex' as const, weight: dramatic ? 2 : 0.3 },
        { item: 'giant' as const, weight: dramatic ? 0.4 : 0.03 },
      ]),
      anticipation: dramatic ? this.rng.range(0.25, 0.65) : this.rng.range(0.08, 0.42),
    };
  }

  requestInteraction(now: number, strength = 0.5): void {
    if (now - this.lastInteractionAt < 0.8 || this.pending) return;
    this.lastInteractionAt = now;
    const chance = 0.38 + this.profile.responsiveness * 0.34 + clamp(strength) * 0.12;
    if (!this.rng.chance(Math.min(0.86, chance))) return;
    const dramatic = this.rng.chance(0.12 + this.profile.responsiveness * 0.10);
    this.pending = {
      dueAt: now + this.rng.range(0.12, dramatic ? 1.1 : 2.2),
      source: 'interaction',
      action: this.rng.weighted([
        { item: 'hesitate' as const, weight: 14 },
        { item: 'drift' as const, weight: 14 },
        { item: 'retreat' as const, weight: 9 },
        { item: 'approach' as const, weight: 7 },
        { item: 'deform' as const, weight: dramatic ? 8 : 4 },
        { item: 'bloom' as const, weight: dramatic ? 5 : 2 },
        { item: 'burst' as const, weight: dramatic ? 5 : 1 },
        { item: 'giant' as const, weight: dramatic ? 0.6 : 0.03 },
      ]),
      anticipation: dramatic ? this.rng.range(0.3, 0.7) : this.rng.range(0.08, 0.4),
    };
  }

  requestTouch(now: number): void {
    if (now - this.lastTouchAt < 0.75 || this.pending) return;
    this.lastTouchAt = now;
    // A nearby tap always has some chance of being noticed. The stronger
    // reactions remain rare, so the gesture feels alive without becoming a UI command.
    if (!this.rng.chance(0.58 + this.profile.responsiveness * 0.32)) return;
    const dramatic = this.rng.chance(0.28 + this.profile.responsiveness * 0.20);
    this.pending = {
      dueAt: now + this.rng.range(dramatic ? 0.25 : 0.45, dramatic ? 1.35 : 2.8),
      source: 'touch',
      action: this.rng.weighted([
        { item: 'hesitate' as const, weight: 16 },
        { item: 'retreat' as const, weight: 15 },
        { item: 'drift' as const, weight: 15 },
        { item: 'compact' as const, weight: 9 },
        { item: 'bloom' as const, weight: dramatic ? 14 : 8 },
        { item: 'deform' as const, weight: dramatic ? 12 : 7 },
        { item: 'burst' as const, weight: dramatic ? 11 : 4 },
        { item: 'giant' as const, weight: dramatic ? 3.0 : 0.45 },
      ]),
      anticipation: dramatic ? this.rng.range(0.45, 0.9) : this.rng.range(0.2, 0.7),
    };
  }

  noteExecutedAction(action: BehaviorAction): void {
    if (!isMorphAction(action) || action === 'normal') return;
    this.recentMorphs.push(action);
    if (this.recentMorphs.length > 6) this.recentMorphs.shift();
  }

  getMicroActivity(): number {
    const breathing = 0.5 + 0.5 * Math.sin(this.microPhase);
    return clamp(0.045 + this.profile.activity * 0.075 + breathing * 0.028);
  }

  getReadiness(): number { return this.readiness; }
  getAnticipation(): number { return this.anticipation; }

  private scheduleAutonomous(now: number): void {
    const conspicuous = this.rng.weighted([
      { item: false, weight: 38 },
      { item: true, weight: 62 },
    ]);
    const pool: Array<{ item: MorphAction | BehaviorAction; weight: number }> = conspicuous
      ? [
          { item: 'expand', weight: 14 }, { item: 'contract', weight: 8 },
          { item: 'deform', weight: 12 }, { item: 'hesitate', weight: 10 },
          { item: 'burst', weight: 12 }, { item: 'seek', weight: 9 },
          { item: 'orbit', weight: 6 }, { item: 'retreat', weight: 7 },
          { item: 'approach', weight: 7 }, { item: 'bloom', weight: 10 },
          { item: 'vortex', weight: 5 }, { item: 'ribbon', weight: 5 },
          { item: 'crystalline', weight: 4 }, { item: 'birth', weight: 1.2 },
          { item: 'giant', weight: 4 },
        ]
      : [
          { item: 'drift', weight: 27 }, { item: 'breathe', weight: 25 },
          { item: 'hesitate', weight: 13 }, { item: 'approach', weight: 9 },
          { item: 'retreat', weight: 8 }, { item: 'compact', weight: 7 },
          { item: 'deform', weight: 6 }, { item: 'idle', weight: 5 },
        ];

    // Recent morphs become less likely, not impossible. This produces
    // individual variation without a visible cooldown list.
    for (const entry of pool) {
      if (isMorphAction(entry.item)) {
        const recency = this.recentMorphs.reduce((score, action, index) =>
          action === entry.item ? score + (index + 1) / this.recentMorphs.length : score, 0);
        entry.weight *= Math.max(0.28, 1 - recency * 0.16);
      }
    }

    const action = this.rng.weighted(pool as Array<{ item: BehaviorAction; weight: number }>);
    const needsPrelude = conspicuous && this.rng.chance(0.74);
    const delay = needsPrelude ? this.rng.range(0.75, 3.2) : this.rng.range(0.08, 0.55);
    this.anticipation = needsPrelude ? this.rng.range(0.35, 0.95) : 0.1;
    this.pending = {
      dueAt: now + delay,
      action,
      source: 'autonomous',
      anticipation: this.anticipation,
    };
  }
}

function isMorphAction(action: string): action is MorphAction {
  return action === 'normal' || action === 'spiky' || action === 'bloom' || action === 'compact'
    || action === 'droplet' || action === 'crystalline' || action === 'ribbon'
    || action === 'vortex' || action === 'giant';
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}
