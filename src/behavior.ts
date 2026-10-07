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
  morphTendency: Record<string, number>;
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
      morphTendency: { ...profile.morphTendency },
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
      action: this.weightedWithMorphTendency([
        { item: 'burst' as const, weight: dramatic ? 22 : 9 },
        { item: 'retreat' as const, weight: 14 },
        { item: 'seek' as const, weight: 10 },
        { item: 'hesitate' as const, weight: 7 },
        ...this.morphChoices(dramatic ? 16 : 8),
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
    if (now - this.lastNeighborImpulseAt < 3.0 || this.pending) return;
    this.lastNeighborImpulseAt = now;
    const strength = clamp(intensity);
    const chance = 0.025 + this.profile.responsiveness * 0.045 + strength * 0.065;
    if (!this.rng.chance(Math.min(0.12, chance))) return;
    const dramatic = strength > 0.75 && this.rng.chance(0.16);
    this.pending = {
      dueAt: now + this.rng.range(1.2, dramatic ? 4.2 : 5.8),
      source: 'interaction',
      action: this.weightedWithMorphTendency([
        { item: 'drift' as const, weight: 18 },
        { item: 'hesitate' as const, weight: 14 },
        { item: 'breathe' as const, weight: 15 },
        { item: 'approach' as const, weight: 7 },
        { item: 'retreat' as const, weight: 5 },
        ...this.morphChoices(dramatic ? 4.5 : 1.8),
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
      action: this.weightedWithMorphTendency([
        { item: 'hesitate' as const, weight: 14 },
        { item: 'drift' as const, weight: 14 },
        { item: 'retreat' as const, weight: 9 },
        { item: 'approach' as const, weight: 7 },
        ...this.morphChoices(dramatic ? 5 : 2),
      ]),
      anticipation: dramatic ? this.rng.range(0.3, 0.7) : this.rng.range(0.08, 0.4),
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

  private weightedWithMorphTendency(items: Array<{ item: BehaviorAction; weight: number }>): BehaviorAction {
    for (const entry of items) {
      const morph = morphologyForAction(entry.item);
      if (morph) {
        const tendency = clamp(this.profile.morphTendency[morph] ?? 1, 0.18, 2.8);
      const recency = this.recentMorphs.reduce((score, action, index) =>
        action === morph ? score + (index + 1) / this.recentMorphs.length : score, 0);
      entry.weight *= tendency * Math.max(0.38, 1 - recency * 0.18);
      }
    }
    return this.rng.weighted(items);
  }

  private scheduleAutonomous(now: number): void {
    const conspicuous = this.rng.weighted([
      { item: false, weight: 38 },
      { item: true, weight: 62 },
    ]);

    const pool: Array<{ item: MorphAction | BehaviorAction; weight: number }> = conspicuous
      ? [
          { item: 'hesitate', weight: 10 },
          { item: 'burst', weight: 12 },
          { item: 'seek', weight: 9 },
          { item: 'orbit', weight: 6 },
          { item: 'retreat', weight: 7 },
          { item: 'approach', weight: 7 },
          ...this.morphChoices(1) as Array<{ item: MorphAction; weight: number }>,
          { item: 'birth', weight: 1.2 },
        ]
      : [
          { item: 'drift', weight: 27 }, { item: 'breathe', weight: 25 },
          { item: 'hesitate', weight: 13 }, { item: 'approach', weight: 9 },
          { item: 'retreat', weight: 8 }, { item: 'idle', weight: 5 },
          ...this.morphChoices(0.34) as Array<{ item: MorphAction; weight: number }>,
        ];

    // Choose morphology from one canonical pool. In v8, bloom had two
    // independent entries (expand + bloom) and droplet had a privileged
    // deform entry, so the nominal 8 morphologies were not actually competing
    // on equal footing.
    for (const entry of pool) {
      const morph = morphologyForAction(entry.item);
      if (!morph) continue;
      const tendency = clamp(this.profile.morphTendency[morph] ?? 1, 0.18, 2.8);
      const recency = this.recentMorphs.reduce((score, action, index) =>
        action === morph ? score + (index + 1) / this.recentMorphs.length : score, 0);
      entry.weight *= tendency * Math.max(0.22, 1 - recency * 0.24);
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

  private morphChoices(scale: number): Array<{ item: MorphAction; weight: number }> {
    // Equal baseline access; individuality comes from the persistent
    // tendency multiplier below, not from giving bloom/droplet extra routes.
    return [
      { item: 'spiky', weight: 1.0 * scale },
      { item: 'bloom', weight: 1.0 * scale },
      { item: 'compact', weight: 1.0 * scale },
      { item: 'droplet', weight: 1.0 * scale },
      { item: 'crystalline', weight: 1.0 * scale },
      { item: 'ribbon', weight: 1.0 * scale },
      { item: 'vortex', weight: 1.0 * scale },
      { item: 'giant', weight: 1.0 * scale },
    ];
  }

}

function morphologyForAction(action: string): MorphAction | null {
  if (isMorphAction(action)) return action === 'normal' ? null : action;
  if (action === 'expand') return 'bloom';
  if (action === 'contract') return 'compact';
  if (action === 'deform') return 'droplet';
  return null;
}

function isMorphAction(action: string): action is MorphAction {
  return action === 'normal' || action === 'spiky' || action === 'bloom' || action === 'compact'
    || action === 'droplet' || action === 'crystalline' || action === 'ribbon'
    || action === 'vortex' || action === 'giant';
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}
