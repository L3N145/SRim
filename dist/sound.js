export class CreatureSound {
    ctx = null;
    unlock() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioCtx();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }
    // 1. 柔らかな吐息・息の音（ふぅー… / すぅー…）
    emitBreath(duration = 2.4, pitchFactor = 1.0) {
        try {
            this.unlock();
            if (!this.ctx)
                return;
            const now = this.ctx.currentTime;
            // ノイズバッファの生成
            const bufferSize = Math.floor(this.ctx.sampleRate * duration);
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            // 喉や肺を通ったようなバンドパスフィルター
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            const baseFreq = 380 * pitchFactor;
            filter.frequency.setValueAtTime(baseFreq * 0.8, now);
            filter.frequency.exponentialRampToValueAtTime(baseFreq * 1.2, now + duration * 0.4);
            filter.frequency.exponentialRampToValueAtTime(baseFreq * 0.7, now + duration);
            filter.Q.value = 3.5;
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.linearRampToValueAtTime(0.09, now + duration * 0.3);
            gain.gain.linearRampToValueAtTime(0.00001, now + duration);
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);
            noise.start(now);
            noise.stop(now + duration);
        }
        catch { }
    }
    // 2. 猫の喉鳴らし・低周波の有機的なゴロゴロ音（Purr）
    emitPurr(duration = 3.2) {
        try {
            this.unlock();
            if (!this.ctx)
                return;
            const now = this.ctx.currentTime;
            const bufferSize = Math.floor(this.ctx.sampleRate * duration);
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            // 低域ローパス
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(140, now);
            filter.frequency.linearRampToValueAtTime(180, now + duration * 0.5);
            filter.frequency.linearRampToValueAtTime(120, now + duration);
            // ゴロゴロという微小な振幅変調（LFO）
            const tremolo = this.ctx.createGain();
            const lfo = this.ctx.createOscillator();
            lfo.frequency.setValueAtTime(18, now); // 18Hzの微小な震え
            lfo.connect(tremolo.gain);
            const masterGain = this.ctx.createGain();
            masterGain.gain.setValueAtTime(0.0001, now);
            masterGain.gain.linearRampToValueAtTime(0.12, now + duration * 0.25);
            masterGain.gain.linearRampToValueAtTime(0.00001, now + duration);
            noise.connect(filter);
            filter.connect(tremolo);
            tremolo.connect(masterGain);
            masterGain.connect(this.ctx.destination);
            lfo.start(now);
            noise.start(now);
            lfo.stop(now + duration);
            noise.stop(now + duration);
        }
        catch { }
    }
}
