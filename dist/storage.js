const STORAGE_PREFIX = 'quiet_life_creature_data_v2';
const LEGACY_KEYS = ['quiet_life_creature_data_v1'];
export function loadCreatureData(instanceId = '0', defaults) {
    const parsed = readStoredData(instanceId);
    const source = parsed ?? defaults ?? null;
    const fallbackSeed = isFiniteNumber(defaults?.seed) ? defaults.seed : makeSeed();
    const seed = isFiniteNumber(source?.seed) ? source.seed : fallbackSeed;
    const pseudo = seededNumbers(seed);
    const data = {
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
        morphSignatureVersion: 1,
        recentActions: normalizeActions(source?.recentActions),
        instanceId,
    };
    saveCreatureData(data);
    return data;
}
export function saveCreatureData(data) {
    try {
        data.version = 2;
        data.lastActive = Date.now();
        if (data.recentActions.length > 32)
            data.recentActions = data.recentActions.slice(-32);
        localStorage.setItem(storageKey(data.instanceId ?? '0'), JSON.stringify(data));
    }
    catch {
        // Storage may be unavailable in some private/restricted browser contexts.
    }
}
export function recordAction(data, action, timestamp = Date.now()) {
    if (action === 'normal' || action === 'idle')
        return;
    data.recentActions.push({ action, timestamp });
    if (data.recentActions.length > 32)
        data.recentActions.shift();
    data.lastMacroActionAt = timestamp;
    saveCreatureData(data);
}
function readStoredData(instanceId) {
    try {
        const current = localStorage.getItem(storageKey(instanceId));
        if (current)
            return JSON.parse(current);
        if (instanceId === '0') {
            for (const key of LEGACY_KEYS) {
                const legacy = localStorage.getItem(key);
                if (legacy)
                    return JSON.parse(legacy);
            }
        }
    }
    catch {
        // Fall through to defaults.
    }
    return null;
}
function storageKey(instanceId) {
    return instanceId === '0' ? STORAGE_PREFIX : `${STORAGE_PREFIX}_${instanceId}`;
}
function normalizeActions(value) {
    if (!Array.isArray(value))
        return [];
    return value
        .filter((entry) => Boolean(entry) && typeof entry === 'object')
        .map((entry) => ({
        action: typeof entry.action === 'string' ? entry.action : 'unknown',
        timestamp: isFiniteNumber(entry.timestamp) ? entry.timestamp : Date.now(),
    }))
        .slice(-32);
}
function makeSeed() {
    const cryptoObj = globalThis.crypto;
    if (cryptoObj) {
        const buffer = new Uint32Array(1);
        cryptoObj.getRandomValues(buffer);
        return buffer[0] / 4294967296;
    }
    return Math.random();
}
function seededNumbers(seed) {
    return (offset) => {
        const x = Math.sin(seed * 100000 + offset * 17.371) * 43758.5453123;
        return x - Math.floor(x);
    };
}
function finiteOr(value, fallback) {
    return isFiniteNumber(value) ? value : fallback;
}
function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function normalizeMorphTendency(value, seed, signatureVersion) {
    const names = ['spiky', 'bloom', 'compact', 'droplet', 'crystalline', 'ribbon', 'vortex', 'giant'];
    const obj = value && typeof value === 'object' ? value : null;
    // Give each creature 1–2 recognizable "signature" forms. The old v8
    // fallback lived in a narrow 0.55–1.45 band, which was not strong enough
    // to survive the many other event-weight differences in the scheduler.
    const ranked = names
        .map((name, i) => ({ name, score: seededValue(seed, 70 + i) }))
        .sort((a, b) => b.score - a.score);
    const primary = new Set(ranked.slice(0, 2).map((entry) => entry.name));
    const hasV9Signature = signatureVersion === 1;
    const result = {};
    names.forEach((name, i) => {
        const legacy = hasV9Signature && obj && typeof obj[name] === 'number' && Number.isFinite(obj[name])
            ? obj[name] : null;
        const score = seededValue(seed, 30 + i);
        const fallback = primary.has(name)
            ? 2.05 + score * 0.75
            : 0.32 + score * 0.52;
        result[name] = clamp(legacy ?? fallback, 0.18, 2.8);
    });
    return result;
}
function seededValue(seed, salt) {
    const x = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453;
    return x - Math.floor(x);
}
