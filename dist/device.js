export class DeviceTiltSensor {
    x = 0;
    y = 0;
    targetX = 0;
    targetY = 0;
    baseBeta = null;
    baseGamma = null;
    listening = false;
    _enabled = false;
    get available() {
        return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
    }
    get enabled() { return this._enabled; }
    get value() {
        return { x: this.x, y: this.y, available: this.available, enabled: this._enabled };
    }
    async toggle() {
        if (this._enabled) {
            this.disable();
            return false;
        }
        return this.request();
    }
    async request() {
        if (!this.available)
            return false;
        const Orientation = window.DeviceOrientationEvent;
        if (typeof Orientation.requestPermission === 'function') {
            try {
                const permission = await Orientation.requestPermission();
                if (permission !== 'granted')
                    return false;
            }
            catch {
                return false;
            }
        }
        this.startListening();
        return true;
    }
    update(dt) {
        const smoothing = 1 - Math.exp(-Math.max(dt, 0) * 5.0);
        this.x += (this.targetX - this.x) * smoothing;
        this.y += (this.targetY - this.y) * smoothing;
    }
    disable() {
        if (this.listening)
            window.removeEventListener('deviceorientation', this.handleOrientation);
        this.listening = false;
        this._enabled = false;
        this.targetX = 0;
        this.targetY = 0;
        this.baseBeta = null;
        this.baseGamma = null;
    }
    recenter() {
        this.baseBeta = null;
        this.baseGamma = null;
        this.targetX = 0;
        this.targetY = 0;
    }
    dispose() { this.disable(); }
    startListening() {
        if (this.listening)
            return;
        window.addEventListener('deviceorientation', this.handleOrientation, true);
        this.listening = true;
        this._enabled = true;
        this.baseBeta = null;
        this.baseGamma = null;
    }
    handleOrientation = (event) => {
        if (!this._enabled || event.beta == null || event.gamma == null)
            return;
        if (this.baseBeta == null || this.baseGamma == null) {
            this.baseBeta = event.beta;
            this.baseGamma = event.gamma;
            return;
        }
        const rawX = clamp((event.gamma - this.baseGamma) / 18, -1, 1);
        const rawY = clamp((event.beta - this.baseBeta) / 18, -1, 1);
        this.targetX = deadZone(rawX, 0.035);
        this.targetY = deadZone(rawY, 0.035);
    };
}
function deadZone(value, threshold) {
    const magnitude = Math.abs(value);
    if (magnitude <= threshold)
        return 0;
    const scaled = (magnitude - threshold) / (1 - threshold);
    return Math.sign(value) * scaled;
}
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
