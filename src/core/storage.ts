export interface CreatureData {
  seed: number;
  createdAt: number;
  totalInteractions: number;
  totalSpokenDuration: number;
  lastActive: number;
  // 個体特有の物理バイアス
  baseViscosity: number;     // 動きの粘り気
  responsiveness: number;    // 反応しやすさの傾向
  colorHueOffset: number;    // 固有の色相
}

const STORAGE_KEY = 'quiet_life_creature_data_v1';

function createNewCreature(): CreatureData {
  const seed = Math.random() * 100000;
  // seed から擬似ランダムに個体傾向を生成
  const pseudoRand = (offset: number) => {
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

export function loadCreatureData(): CreatureData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      // parse失敗時は新規作成
    }
  }
  const fresh = createNewCreature();
  saveCreatureData(fresh);
  return fresh;
}

export function saveCreatureData(data: CreatureData) {
  data.lastActive = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
