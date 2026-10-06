export interface ConceptDNA {
  conceptWord: string;
  hue: number;          // 固有色相
  sat: number;          // 彩度
  spikeCount: number;   // トゲの本数
  harmonicWave: number; // 微小なひだ
}

export class DNAEngine {
  static synthesize(word: string | number): ConceptDNA {
    let hash = 0;
    const str = String(word);
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    const pseudo = (offset: number) => {
      const x = Math.sin(Math.abs(hash) + offset) * 10000;
      return x - Math.floor(x);
    };

    return {
      conceptWord: str,
      hue: Math.floor(pseudo(1) * 360),
      sat: 70 + Math.floor(pseudo(2) * 25),
      spikeCount: 10 + Math.floor(pseudo(3) * 10),
      harmonicWave: (pseudo(4) - 0.5) * 4.0,
    };
  }
}
