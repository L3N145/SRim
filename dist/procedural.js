export class DNAEngine {
    static synthesize(word) {
        let hash = 0;
        const str = String(word);
        for (let i = 0; i < str.length; i++) {
            hash = (hash << 5) - hash + str.charCodeAt(i);
            hash |= 0;
        }
        const pseudo = (offset) => {
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
