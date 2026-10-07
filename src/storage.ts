export interface ActionLog {
  action: string;
  timestamp: number;
}

export type MorphTendency = Record<'spiky' | 'bloom' | 'compact' | 'droplet' | 'crystalline' | 'ribbon' | 'vortex' | 'giant', number>;

export interface CreatureData {
  version: 2;
  seed: number;
  createdAt: number;
  totalInteractions: number;
  totalSpokenDuration: number;
  totalQuietDuration: number;
  lastActive: number;
  lastMacroActionAt: number | null;
  baseViscosity: number;
  responsiveness: number;
  inertia: number;
  baseFrequency: number;
  colorHueOffset: number;
  morphTendency: MorphTendency;
  morphSignatureVersion?: number;
  recentActions: ActionLog[];
  instanceId?: string;
}

const STORAGE_PREFIX = 'quiet_life_creature_data_v2';
const LEGACY_KEYS = ['quiet_life_creature_data_v1'];

export function loadCreatureData(instanceId = '0', defaults?: Partial<CreatureData>): CreatureData {
  const parsed = readStoredData(instanceId);
  const source = parsed ?? defaults ?? null;
  const fallbackSeed = isFiniteNumber(defaults?.seed) ? defaults!.seed! : makeSeed();
  const seed = isFiniteNumber(source?.seed) ? source.seed : fallbackSeed;
  const pseudo = seededNumbers(seed);

  const data: CreatureData = {
    version: 2,
    seed,
    createdAt: isFiniteNumber(source?.createdAt) ? source.createdAt : Date.now(),
    totalInteractions: finiteOr(source?.totalInteractions, 0),
    totalSpokenDuration: finiteOr(source?.totalSpokenDuration, 0),
    totalQuietDuration: finiteOr(source?.totalQuietDuration, 0),
    lastActive: finiteOr(source?.lastActive, Date.now()),
    lastMacroActionAt: isFiniteNumber(source?.lastMacroActionAt) ? source.lastMacroActionAt : null,
    baseViscosity: clamp(finiteOr(source?.baseViscosity, 0.02 + pseudo(1) * 0.02), 0.01, 0.08),
    responsiveness: clamp(finiteOr(source?.responsiveness, 0.30 + pseudo(2) * 0.30), 0.10, 0.80),
    inertia: clamp(finiteOr(source?.inertia, 0.90 + pseudo(3) * 0.055), 0.80, 0.985),
    baseFrequency: clamp(finiteOr(source?.baseFrequency, 200 + pseudo(4) * 120), 120, 420),
    colorHueOffset: clamp(finiteOr(source?.colorHueOffset, Math.floor(pseudo(5) * 60) - 30), -60, 60),
    morphTendency: normalizeMorphTendency(source?.morphTendency, seed, source?.morphSignatureVersion),
    morphSignatureVersion: 2,
    recentActions: normalizeActions(source?.recentActions),
    instanceId,
  };

  saveCreatureData(data);
  return data;
}

export function saveCreatureData(data: CreatureData): void {
  try {
    data.version = 2;
    data.lastActive = Date.now();
    if (data.recentActions.length > 32) data.recentActions = data.recentActions.slice(-32);
    localStorage.setItem(storageKey(data.instanceId ?? '0'), JSON.stringify(data));
  } catch {
    // Storage may be unavailable in some private/restricted browser contexts.
  }
}

export function recordAction(data: CreatureData, action: string, timestamp = Date.now()): void {
  if (action === 'normal' || action === 'idle') return;
  data.recentActions.push({ action, timestamp });
  if (data.recentActions.length > 32) data.recentActions.shift();
  data.lastMacroActionAt = timestamp;
  saveCreatureData(data);
}

function readStoredData(instanceId: string): Record<string, any> | null {
  try {
    const current = localStorage.getItem(storageKey(instanceId));
    if (current) return JSON.parse(current) as Record<string, any>;
    if (instanceId === '0') {
      for (const key of LEGACY_KEYS) {
        const legacy = localStorage.getItem(key);
        if (legacy) return JSON.parse(legacy) as Record<string, any>;
      }
    }
  } catch {
    // Fall through to defaults.
  }
  return null;
}

function storageKey(instanceId: string): string {
  return instanceId === '0' ? STORAGE_PREFIX : `${STORAGE_PREFIX}_${instanceId}`;
}

function normalizeActions(value: unknown): ActionLog[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is { action: unknown; timestamp: unknown } => Boolean(entry) && typeof entry === 'object')
    .map((entry) => ({
      action: typeof entry.action === 'string' ? entry.action : 'unknown',
      timestamp: isFiniteNumber(entry.timestamp) ? entry.timestamp : Date.now(),
    }))
    .slice(-32);
}

function makeSeed(): number {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj) {
    const buffer = new Uint32Array(1);
    cryptoObj.getRandomValues(buffer);
    return buffer[0] / 4294967296;
  }
  return Math.random();
}

function seededNumbers(seed: number): (offset: number) => number {
  return (offset: number) => {
    const x = Math.sin(seed * 100000 + offset * 17.371) * 43758.5453123;
    return x - Math.floor(x);
  };
}

function finiteOr(value: unknown, fallback: number): number {
  return isFiniteNumber(value) ? value : fallback;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeMorphTendency(value: unknown, seed: number, signatureVersion?: unknown): MorphTendency {
  const names: Array<keyof MorphTendency> = ['spiky', 'bloom', 'compact', 'droplet', 'crystalline', 'ribbon', 'vortex', 'giant'];
  const obj = value && typeof value === 'object' ? value as Record<string, unknown> : null;

  // Give each creature 1–2 recognizable "signature" forms. The old v8
  // fallback lived in a narrow 0.55–1.45 band, which was not strong enough
  // to survive the many other event-weight differences in the scheduler.
  const hasV10Signature = signatureVersion === 2;

  const result = {} as MorphTendency;
  names.forEach((name, i) => {
    const legacy = hasV10Signature && obj && typeof obj[name] === 'number' && Number.isFinite(obj[name])
      ? obj[name] as number : null;
    const score = seededValue(seed, 30 + i);
    // Every morphology uses the same broad distribution. There is no globally
    // rare shape; rarity is an individual property produced by this spread.
    const centered = (score - 0.5) * 2.0;
    const fallback = clamp(Math.exp(centered * 0.95), 0.30, 2.75);
    result[name] = clamp(legacy ?? fallback, 0.18, 2.8);
  });
  return result;
}

function seededValue(seed: number, salt: number): number {
  const x = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}
