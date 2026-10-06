const STORAGE_KEY = 'quiet_life_creature_data_v1';
function createNewCreature() {
    const seed = Math.random() * 100000;
    // seed から擬似ランダムに個体傾向を生成
    const pseudoRand = (offset) => {
        const x = Math.sin(seed + offset) * 10000;
        return x - Math.floor(x);
    };
    return {
        seed,
        createdAt: Date.now(),
        totalInteractions: 0,
        totalSpokenDuration: 0,
        lastActive: Date.now(),
        baseViscosity: 0.02 + pseudoRand(1) * 0.03,
        responsiveness: 0.35 + pseudoRand(2) * 0.4, // 反応する確率の基礎値
        colorHueOffset: Math.floor(pseudoRand(3) * 60) - 30, // -30〜+30度
    };
}
export function loadCreatureData() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
        try {
            return JSON.parse(raw);
        }
        catch {
            // parse失敗時は新規作成
        }
    }
    const fresh = createNewCreature();
    saveCreatureData(fresh);
    return fresh;
}
export function saveCreatureData(data) {
    data.lastActive = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
