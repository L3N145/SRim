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
  version: 2;
  savedAt: number;
  creatures: unknown[];
}

const WORLD_KEY = 'quiet_life_world_state_v2';
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
    morphTendency: mutateTendency(base.morphTendency, seed, 0.28),
    recentActions: [],
  };
}

let nextBirthId = 0;
const creatures: Creature[] = [0, 1, 2].map((index) => {
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
let lastBirthAt = -Infinity;
const BIRTH_COOLDOWN = 75;
// Not a compute limit. This is only a visual-density guard for small screens.
const MAX_CREATURES = 12;
function loop(now: number) {
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  if (isAudioActive) {
    const features = audio.analyze();
    for (const creature of creatures) creature.handleAudio(features, bounds);
    if (features.isSpeaking) baseData.totalSpokenDuration += dt;
  }

  for (let i = 0; i < creatures.length; i += 1) {
    const rippleInfluences = collectRippleInfluences(ripples, creatures[i].x, creatures[i].y, creatures[i].z);
    creatures[i].update(dt, bounds, collectNeighbors(creatures, i), rippleInfluences);
  }

  // Birth is a real population event, not a two-core visual effect. The
  // parent remains and a nearby child inherits a few traits with variation.
  if (creatures.length < MAX_CREATURES && now / 1000 > lastBirthAt + BIRTH_COOLDOWN) {
    for (let i = 0; i < creatures.length; i += 1) {
      const parent = creatures[i];
      if (!parent.consumeDivisionRequest()) continue;
      addOffspring(parent);
      lastBirthAt = now / 1000;
      break;
    }
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

canvas.addEventListener('pointerdown', (e) => {
  const now = performance.now() / 1000;
  if (now - lastTapAt < TAP_COOLDOWN) return;
  lastTapAt = now;
  sound.unlock();
  resetIdleTimer();

  const rect = canvas.getBoundingClientRect();
  const localX = e.clientX - rect.left;
  const localY = e.clientY - rect.top;
  if (localX < 0 || localY < 0 || localX > rect.width || localY > rect.height) return;

  // Canvas-local coordinates are converted directly into the same world
  // coordinate system used by rendering. This avoids viewport/scroll/DPR
  // offsets and makes the visible ripple land exactly under the finger.
  const worldX = localX - rect.width / 2;
  const worldY = localY - rect.height / 2;

  rippleSeed += 0.61803398875;
  ripples.push(createRipple(worldX, worldY, rippleSeed));

  // Immediate local impulse gives the tap meaning before the expanding ring
  // reaches a creature. The creature itself performs the depth-correct hit test.
  for (const creature of creatures) creature.handleTouch(worldX, worldY);

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
      version: 2,
      savedAt: Date.now(),
      creatures: creatures.map((creature) => ({ ...creature.getPersistentState(), data: creature.data })),
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
    state.creatures.forEach((saved: any, index) => {
      if (creatures[index]) {
        creatures[index].restorePersistentState(saved);
        return;
      }
      if (!saved || typeof saved !== 'object') return;
      const savedData = saved.data && typeof saved.data === 'object' ? saved.data as CreatureData : null;
      if (!savedData) return;
      const instanceId = typeof savedData.instanceId === 'string' ? savedData.instanceId : `birth-${index}`;
      const child = new Creature(loadCreatureData(instanceId, savedData), sound, provider);
      child.restorePersistentState(saved);
      creatures.push(child);
    });
  } catch {
    // Ignore corrupt or unavailable persistence.
  }
}


function addOffspring(parent: Creature): void {
  const parentData = parent.data;
  const id = `birth-${Date.now()}-${nextBirthId++}`;
  const seed = fract(parentData.seed * 1.61803398875 + (nextBirthId + 1) * 0.271828 + parent.x * 0.0007 + parent.y * 0.0011);
  const childData: CreatureData = {
    ...parentData,
    seed,
    instanceId: id,
    createdAt: Date.now(),
    totalInteractions: 0,
    totalSpokenDuration: 0,
    totalQuietDuration: 0,
    lastMacroActionAt: null,
    baseViscosity: clamp(parentData.baseViscosity * (0.86 + seed * 0.28), 0.01, 0.08),
    responsiveness: clamp(parentData.responsiveness * (0.84 + seed * 0.32), 0.10, 0.80),
    inertia: clamp(parentData.inertia + (seed - 0.5) * 0.045, 0.80, 0.985),
    colorHueOffset: parentData.colorHueOffset + Math.floor((seed - 0.5) * 28),
    morphTendency: mutateTendency(parentData.morphTendency, seed, 0.22),
    recentActions: [],
  };
  const child = new Creature(loadCreatureData(id, childData), sound, provider);
  const angle = seed * Math.PI * 2;
  const separation = parent.getCollisionRadius() * 1.25;
  child.x = parent.x + Math.cos(angle) * separation;
  child.y = parent.y + Math.sin(angle) * separation;
  child.z = parent.z + (seed - 0.5) * 10;
  child.heading = parent.heading + (seed - 0.5) * 1.2;
  child.vx = parent.vx * 0.72 + Math.cos(angle) * 0.045;
  child.vy = parent.vy * 0.72 + Math.sin(angle) * 0.045;
  child.vz = parent.vz * 0.72;
  creatures.push(child);
}

function mutateTendency(source: CreatureData['morphTendency'], seed: number, mutation: number): CreatureData['morphTendency'] {
  const result = { ...source };
  const names = Object.keys(result) as Array<keyof CreatureData['morphTendency']>;
  names.forEach((name, i) => {
    const noise = fract(Math.sin(seed * (31.7 + i * 7.13) + i * 11.91) * 43758.5453) * 2 - 1;
    result[name] = clamp(result[name] * (1 + noise * mutation), 0.18, 2.8);
  });
  // A child usually resembles the parent, but one or two forms can drift
  // noticeably, making morphology feel inherited rather than copied.
  const pivot = Math.floor(fract(seed * 13.37) * names.length);
  const pivotName = names[pivot];
  result[pivotName] = clamp(result[pivotName] * (1.12 + fract(seed * 17.1) * 0.45), 0.18, 2.8);
  return result;
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
