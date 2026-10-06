import './style.css';
import { loadCreatureData, saveCreatureData, type CreatureData } from './storage';
import { VoiceAnalyzer, type MicrophoneStartResult } from './audio';
import { CreatureSound } from './sound';
import { ResourceProvider } from './provider';
import { Creature } from './creature';
import { Renderer } from './renderer';
import { collectNeighbors, collectRippleInfluences } from './world';
import { createRipple, updateRipple, type Ripple } from './ripple';

interface SavedCreatureState {
  version: 1;
  savedAt: number;
  creatures: unknown[];
}

const WORLD_KEY = 'quiet_life_world_state_v1';
const baseData = loadCreatureData('0');
const sound = new CreatureSound();
const provider = new ResourceProvider();
const ripples: Ripple[] = [];
let rippleSeed = baseData.seed * 1000;

function deriveDefaults(base: CreatureData, index: number): CreatureData {
  if (index === 0) return base;
  const seed = fract(base.seed * (1.61803398875 + index * 0.713) + index * 0.137);
  return {
    ...base,
    seed,
    instanceId: String(index),
    createdAt: base.createdAt,
    totalInteractions: 0,
    totalSpokenDuration: 0,
    totalQuietDuration: 0,
    lastMacroActionAt: null,
    baseViscosity: clamp(base.baseViscosity * (0.78 + seed * 0.55), 0.01, 0.08),
    responsiveness: clamp(base.responsiveness * (0.68 + seed * 0.58), 0.10, 0.80),
    inertia: clamp(base.inertia + (seed - 0.5) * 0.06, 0.80, 0.985),
    colorHueOffset: base.colorHueOffset + Math.floor((seed - 0.5) * 70),
    recentActions: [],
  };
}

const creatures = [0, 1, 2].map((index) => {
  const defaults = deriveDefaults(baseData, index);
  return new Creature(loadCreatureData(String(index), defaults), sound, provider);
});

creatures[0].x = -70; creatures[0].y = -35;
creatures[1].x = 60; creatures[1].y = -10;
creatures[2].x = 5; creatures[2].y = 75;

restoreWorldState();

const audio = new VoiceAnalyzer();
const canvas = document.getElementById('life-canvas') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
let bounds = renderer.resize();
window.addEventListener('resize', () => { bounds = renderer.resize(); });

let isAudioActive = false;
let lastTime = performance.now();
let saveAccumulator = 0;
function loop(now: number) {
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  if (isAudioActive) {
    const features = audio.analyze();
    for (const creature of creatures) creature.handleAudio(features, bounds);
    if (features.isSpeaking) baseData.totalSpokenDuration += dt;
  }

  for (let i = 0; i < creatures.length; i += 1) {
    const rippleInfluences = collectRippleInfluences(ripples, creatures[i].x, creatures[i].y);
    creatures[i].update(dt, bounds, collectNeighbors(creatures, i), rippleInfluences);
  }

  saveAccumulator += dt;
  if (saveAccumulator >= 12) {
    saveAccumulator = 0;
    persistWorldState();
  }

  for (let i = ripples.length - 1; i >= 0; i -= 1) {
    if (!updateRipple(ripples[i], dt)) ripples.splice(i, 1);
  }

  renderer.render(creatures, ripples, bounds.width, bounds.height);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

const micBtn = document.getElementById('mic-button');
const micStatusText = document.getElementById('mic-status-text');
const controls = document.querySelector('.controls') as HTMLElement;

async function toggleMic(e: Event) {
  e.preventDefault();
  e.stopPropagation();
  sound.unlock();

  if (isAudioActive) {
    audio.stop();
    isAudioActive = false;
    micBtn?.classList.remove('active');
    if (micStatusText) micStatusText.textContent = 'MIC OFF';
  } else {
    if (micStatusText) micStatusText.textContent = 'CONNECTING...';
    const success = await audio.start();
    if (success.ok) {
      isAudioActive = true;
      micBtn?.classList.add('active');
      if (micStatusText) micStatusText.textContent = 'MIC ON';
    } else {
      isAudioActive = false;
      micBtn?.classList.remove('active');
      if (micStatusText) micStatusText.textContent = microphoneFailureText(success);
      window.setTimeout(() => {
        if (!isAudioActive && micStatusText) micStatusText.textContent = 'MIC OFF';
      }, 3000);
    }
  }
}
micBtn?.addEventListener('pointerdown', (e) => e.stopPropagation());
micBtn?.addEventListener('click', toggleMic);

canvas.style.touchAction = 'none';

let lastTapAt = -Infinity;
const TAP_COOLDOWN = 0.32;

window.addEventListener('pointerdown', (e) => {
  if ((e.target as HTMLElement).closest('.controls') || (e.target as HTMLElement).closest('.topbar')) return;
  const now = performance.now() / 1000;
  if (now - lastTapAt < TAP_COOLDOWN) return;
  lastTapAt = now;
  sound.unlock();
  resetIdleTimer();

  const normX = e.clientX / bounds.width - 0.5;
  const normY = e.clientY / bounds.height - 0.5;
  const worldX = normX * 240;
  const worldY = normY * 320;

  rippleSeed += 0.61803398875;
  ripples.push(createRipple(worldX, worldY, rippleSeed));

  // The tap is a world disturbance, not direct manipulation of a creature.
  persistWorldState();
});

let idleTimer: number;
function resetIdleTimer() {
  controls?.classList.remove('idle');
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => controls?.classList.add('idle'), 4000);
}
window.addEventListener('pointermove', resetIdleTimer);
resetIdleTimer();

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persistWorldState();
});
window.addEventListener('pagehide', persistWorldState);
window.addEventListener('beforeunload', persistWorldState);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

function persistWorldState() {
  try {
    const state: SavedCreatureState = {
      version: 1,
      savedAt: Date.now(),
      creatures: creatures.map((creature) => creature.getPersistentState()),
    };
    localStorage.setItem(WORLD_KEY, JSON.stringify(state));
    for (const creature of creatures) saveCreatureData(creature.data);
  } catch {
    // Persistence is best-effort.
  }
}

function restoreWorldState() {
  try {
    const raw = localStorage.getItem(WORLD_KEY);
    if (!raw) return;
    const state = JSON.parse(raw) as SavedCreatureState;
    if (![1, 2].includes(state?.version) || !Array.isArray(state.creatures)) return;
    state.creatures.forEach((saved, index) => creatures[index]?.restorePersistentState(saved));
  } catch {
    // Ignore corrupt or unavailable persistence.
  }
}

function fract(value: number): number { return value - Math.floor(value); }
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }

function microphoneFailureText(result: MicrophoneStartResult): string {
  if (result.ok !== false) return 'MIC ERROR';
  switch (result.reason) {
    case 'permission-denied': return 'MIC DENIED';
    case 'not-found': return 'NO MIC';
    case 'security': return 'MIC HTTPS ONLY';
    case 'busy': return 'MIC BUSY';
    case 'unsupported': return 'MIC UNSUPPORTED';
    default: return 'MIC ERROR';
  }
}
