export class SeededRandom {
    state;
    constructor(seed) {
        const normalized = Number.isFinite(seed) ? seed : 0.5;
        this.state = (Math.floor(Math.abs(normalized) * 0xFFFFFFFF) ^ 0xA341316C) >>> 0;
        if (this.state === 0)
            this.state = 0x6D2B79F5;
    }
    next() {
        let t = (this.state += 0x6D2B79F5) | 0;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        this.state = t >>> 0;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    range(min, max) { return min + (max - min) * this.next(); }
    chance(probability) { return this.next() < Math.max(0, Math.min(1, probability)); }
    int(maxExclusive) { return Math.floor(this.next() * Math.max(1, maxExclusive)); }
    weighted(items) {
        const total = items.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
        if (total <= 0)
            return items[0].item;
        let cursor = this.next() * total;
        for (const entry of items) {
            cursor -= Math.max(0, entry.weight);
            if (cursor <= 0)
                return entry.item;
        }
        return items[items.length - 1].item;
    }
}
