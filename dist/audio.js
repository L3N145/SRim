const EMPTY = { level: 0, centroid: 0, flux: 0, isOnset: false, isSpeaking: false };
/** Local-only microphone analysis. Permission is requested only from an explicit user action. */
export class VoiceAnalyzer {
    audioCtx = null;
    analyser = null;
    stream = null;
    freqData = null;
    prevFreqData = null;
    lastLevel = 0;
    smoothedLevel = 0;
    noiseFloor = 0.012;
    lastOnsetAt = -Infinity;
    async start() {
        // IMPORTANT: this method is only called by the MIC button handler.
        // There is no permission request during app startup.
        try {
            const mediaDevices = navigator.mediaDevices;
            if (!mediaDevices?.getUserMedia)
                return { ok: false, reason: 'unsupported' };
            this.stream = await mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                video: false,
            });
            const AudioCtx = window.AudioContext ?? window.webkitAudioContext;
            if (!AudioCtx)
                throw new Error('AudioContext unavailable');
            this.audioCtx = new AudioCtx();
            await this.resume();
            const source = this.audioCtx.createMediaStreamSource(this.stream);
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 512;
            this.analyser.smoothingTimeConstant = 0.82;
            source.connect(this.analyser);
            this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
            this.prevFreqData = new Float32Array(this.analyser.frequencyBinCount);
            this.lastLevel = 0;
            this.smoothedLevel = 0;
            this.noiseFloor = 0.012;
            this.lastOnsetAt = -Infinity;
            return { ok: true };
        }
        catch (error) {
            this.stop();
            const name = error instanceof DOMException ? error.name : '';
            console.warn('Microphone initialization failed:', error);
            if (name === 'NotAllowedError' || name === 'PermissionDeniedError')
                return { ok: false, reason: 'permission-denied', errorName: name };
            if (name === 'NotFoundError' || name === 'DevicesNotFoundError')
                return { ok: false, reason: 'not-found', errorName: name };
            if (name === 'SecurityError')
                return { ok: false, reason: 'security', errorName: name };
            if (name === 'NotReadableError' || name === 'TrackStartError')
                return { ok: false, reason: 'busy', errorName: name };
            return { ok: false, reason: 'unknown', errorName: name || undefined };
        }
    }
    async resume() {
        if (this.audioCtx?.state === 'suspended')
            await this.audioCtx.resume();
    }
    stop() {
        this.stream?.getTracks().forEach((track) => track.stop());
        this.stream = null;
        if (this.audioCtx)
            void this.audioCtx.close();
        this.audioCtx = null;
        this.analyser = null;
        this.freqData = null;
        this.prevFreqData = null;
        this.lastLevel = 0;
        this.smoothedLevel = 0;
    }
    isActive() {
        return this.stream?.getAudioTracks().some((track) => track.readyState === 'live') ?? false;
    }
    analyze() {
        if (!this.analyser || !this.freqData || !this.prevFreqData)
            return EMPTY;
        this.analyser.getByteFrequencyData(this.freqData);
        let sum = 0, weighted = 0, fluxSum = 0, low = 0, mid = 0, high = 0;
        for (let i = 0; i < this.freqData.length; i += 1) {
            const value = this.freqData[i] / 255;
            const previous = this.prevFreqData[i];
            sum += value;
            weighted += value * i;
            fluxSum += Math.max(0, value - previous);
            this.prevFreqData[i] = value;
            const nyquist = (this.audioCtx?.sampleRate ?? 48000) / 2;
            const hz = (i / this.freqData.length) * nyquist;
            if (hz < 350)
                low += value;
            else if (hz < 2200)
                mid += value;
            else
                high += value;
        }
        const average = sum / this.freqData.length;
        const rawLevel = clamp(average * 3.6);
        this.noiseFloor += (rawLevel < this.noiseFloor * 1.6 ? 0.025 : 0.002) * (rawLevel - this.noiseFloor);
        this.noiseFloor = clampRange(this.noiseFloor, 0.003, 0.20);
        const level = clamp((rawLevel - this.noiseFloor * 0.9) * 1.8);
        this.smoothedLevel += (level - this.smoothedLevel) * 0.18;
        const centroid = sum > 0 ? clamp((weighted / sum) / this.freqData.length) : 0;
        const flux = clamp((fluxSum / this.freqData.length) * 12);
        const speaking = this.smoothedLevel > 0.055;
        const rising = this.smoothedLevel > this.lastLevel + 0.018;
        const now = performance.now();
        const onset = speaking && rising && now - this.lastOnsetAt > 650;
        if (onset)
            this.lastOnsetAt = now;
        this.lastLevel = this.smoothedLevel;
        void (low + mid + high);
        return { level, centroid, flux, isOnset: onset, isSpeaking: speaking };
    }
}
function clamp(value) { return Math.max(0, Math.min(1, value)); }
function clampRange(value, min, max) { return Math.max(min, Math.min(max, value)); }
