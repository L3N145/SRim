export type Vec2 = { x: number; y: number };

export type CreatureAction =
  | 'idle'
  | 'breathe'
  | 'drift'
  | 'approach'
  | 'retreat'
  | 'expand'
  | 'contract'
  | 'rotate'
  | 'deform'
  | 'ignoreInput';

export interface CreatureDNA {
  seed: number;
  baseScale: number;
  density: number;
  coherence: number;
  drift: number;
  rotation: number;
  reactionDelay: number;
  activity: number;
  phase: number;
  hue: number;
  wobble: number;
  breathRate: number;
}

export interface StoredLife {
  version: 1;
  seed: number;
  interactions: number;
  dna: CreatureDNA;
  recentActivity: number;
  lastInteractionAt: number | null;
  actionHistory: CreatureAction[];
}

/**
 * A local-only acoustic snapshot. No transcript or raw audio leaves the device.
 */
export interface VoiceFrame {
  level: number;
  peak: number;
  spectralCentroid: number;
  lowEnergy: number;
  midEnergy: number;
  highEnergy: number;
  zeroCrossingRate: number;
  sounding: boolean;
  onset: boolean;
}
