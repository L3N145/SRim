import { Creature } from './creature';
import type { Ripple } from './ripple';
import { getRippleOpacity, getRippleRadius } from './ripple';

function microWobble(phase: number, angle: number, scale: number): number {
  return (0.5 + 0.5 * Math.sin(phase * 1.7 + angle * 3.0 + scale * 5.0));
}

function fleshWobble(phase: number, angle: number, seed: number): number {
  return Math.sin(phase * 2.35 + angle * 5.0 + seed * 17.0) * 0.52
    + Math.sin(phase * 0.91 - angle * 2.0 + seed * 6.0) * 0.30
    + Math.sin(phase * 4.7 + angle * 9.0 + seed * 2.0) * 0.18;
}

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }
  resize(): { width: number; height: number } {
    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth || document.documentElement.clientWidth || 400;
    const height = window.innerHeight || document.documentElement.clientHeight || 600;
    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
    return { width, height };
  }

  render(creatures: readonly Creature[], ripples: readonly Ripple[], width: number, height: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.fillStyle = '#020408';
    ctx.fillRect(0, 0, width, height);
    const bgGrad = ctx.createRadialGradient(width / 2, height / 2, 20, width / 2, height / 2, Math.max(width, height) * 0.75);
    bgGrad.addColorStop(0, 'rgba(8, 14, 26, 0.85)');
    bgGrad.addColorStop(1, 'rgba(1, 2, 4, 0.98)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Draw the expanding world disturbance before the creatures so that the
    // bodies visually pass through the ring rather than sitting on top of it.
    for (const ripple of ripples) {
      const radius = getRippleRadius(ripple);
      const opacity = getRippleOpacity(ripple);
      if (opacity <= 0 || radius <= 0) continue;

      const x = width / 2 + ripple.x;
      const y = height / 2 + ripple.y;
      ctx.save();
      ctx.strokeStyle = `rgba(180, 220, 255, ${opacity})`;
      ctx.lineWidth = 1.2;
      ctx.shadowBlur = 8;
      ctx.shadowColor = `rgba(150, 205, 255, ${opacity * 0.7})`;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    for (const creature of creatures) this.renderCreature(creature, width, height);
  }

  private renderCreature(creature: Creature, width: number, height: number) {
    const ctx = this.ctx;
    const focalLength = 380;
    const perspective = focalLength / (focalLength + creature.z);
    const screenX = width / 2 + creature.x * perspective;
    const screenY = height / 2 + creature.y * perspective;
    const baseRadius = 36 * perspective * creature.scale;
    const hue = creature.currentHue;
    const sat = creature.targetDNA.sat;
    const phase = creature.phase;
    const spike = creature.spike;
    const bloom = creature.bloom;
    const stretch = creature.stretch;
    const cryst = creature.crystalline;
    const ribbon = creature.ribbon;
    const vortex = creature.vortex;
    const breath = creature.bodyBreath;
    const pulse = creature.bodyPulse;
    const tension = creature.bodyTension;
    const organic = creature.bodyOrganic;

    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.rotate(creature.rotation);
    // A small, delayed squash/stretch makes changes of speed feel embodied.
    // It is intentionally restrained: softness, not cartoon exaggeration.
    const softStretch = creature.bodyStretch * 0.055;
    const softSquish = creature.bodySquish * 0.035;
    ctx.scale(1 + softStretch, 1 - softStretch * 0.72 - softSquish);

    const auraR = baseRadius * (2.0 + bloom * 0.8 + ribbon * 0.3);
    const auraGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, auraR);
    auraGrad.addColorStop(0, `hsla(${hue}, ${sat}%, 72%, ${(0.15 + bloom * 0.15) * perspective})`);
    auraGrad.addColorStop(0.5, `hsla(${hue + 25}, ${sat}%, 55%, ${0.04 * perspective})`);
    auraGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = auraGrad;
    ctx.beginPath(); ctx.arc(0, 0, auraR, 0, Math.PI * 2); ctx.fill();

    const numPoints = cryst > 0.3 ? 8 : 64;
    const points: { x: number; y: number }[] = [];
    const spikeFreq = creature.targetDNA.spikeCount;
    for (let i = 0; i < numPoints; i += 1) {
      const angle = (i / numPoints) * Math.PI * 2;
      const livingWobble = fleshWobble(phase, angle, creature.data.seed);
      const contraction = breath * 1.65 + pulse * 0.72;
      // Make the living fluctuation legible at a glance. The slow component
      // changes the whole body, while angularly varying components make the
      // contour itself breathe instead of merely scaling uniformly.
      const bodyWave = organic * (0.75 + 0.28 * Math.sin(angle * 2 + phase * 0.17));
      const visibleFlesh = livingWobble * (1.55 + tension * 1.1);
      let r = baseRadius * (1 + contraction * 0.038 + bodyWave * 0.016)
        + Math.sin(phase * 0.8 + angle * 2) * (2.4 + microWobble(phase, angle, creature.getBaseScale()) * 1.0) * (1.0 - spike)
        + visibleFlesh * perspective;
      if (spike > 0.01) {
        const spikeWave = Math.pow(Math.abs(Math.sin(angle * (spikeFreq / 2) + phase * 0.2)), 3.0);
        r += spikeWave * (22 * spike * perspective);
      }
      if (cryst > 0.01) r *= 1.0 + Math.sin(angle * 4) * (0.28 * cryst) + Math.sin(angle * 8) * (0.06 * cryst);
      if (vortex > 0.01) r += Math.sin(angle * 3 + phase * 2.0) * (13.0 * vortex * perspective) + Math.sin(angle * 6 - phase * 1.4) * (3.5 * vortex * perspective);
      let px = Math.cos(angle) * r;
      let py = Math.sin(angle) * r;
      if (stretch > 0.01 && Math.cos(angle) < 0) {
        px -= Math.abs(Math.cos(angle)) * (48 * stretch * perspective);
        py *= 1.0 - Math.abs(Math.cos(angle)) * 0.50 * stretch;
      }
      if (ribbon > 0.01) {
        px *= 1.0 + 0.78 * ribbon;
        py *= 1.0 - 0.48 * ribbon;
        py += Math.sin(px * 0.065 + phase * 1.5) * (12.0 * ribbon);
      }
      points.push({ x: px, y: py });
    }

    ctx.beginPath();
    if (cryst > 0.5) {
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < numPoints; i += 1) ctx.lineTo(points[i].x, points[i].y);
    } else {
      ctx.moveTo((points[0].x + points[numPoints - 1].x) / 2, (points[0].y + points[numPoints - 1].y) / 2);
      for (let i = 0; i < numPoints; i += 1) {
        const pCur = points[i];
        const pNxt = points[(i + 1) % numPoints];
        ctx.quadraticCurveTo(pCur.x, pCur.y, (pCur.x + pNxt.x) / 2, (pCur.y + pNxt.y) / 2);
      }
    }
    ctx.closePath();
    const bodyGrad = ctx.createRadialGradient(0, 0, baseRadius * 0.1, 0, 0, baseRadius * 1.5);
    bodyGrad.addColorStop(0, `hsla(${hue - 15}, ${sat}%, 82%, ${(0.55 + bloom * 0.2) * perspective})`);
    bodyGrad.addColorStop(0.4, `hsla(${hue}, ${sat}%, 62%, ${(0.3 + bloom * 0.15) * perspective})`);
    bodyGrad.addColorStop(0.8, `hsla(${hue + 30}, ${sat}%, 45%, ${0.08 * perspective})`);
    bodyGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = bodyGrad; ctx.fill();

    ctx.strokeStyle = `hsla(${hue - 5}, 95%, 90%, ${(0.3 + spike * 0.4 + cryst * 0.3) * perspective})`;
    ctx.lineWidth = 1.0 + spike * 0.8 + cryst * 0.5;
    ctx.stroke();

    const corePulse = breath * 1.9 + pulse * 1.1 + organic * 0.48 + Math.sin(phase * 0.6) * 0.45;
    const coreRadius = Math.max(3, (7.5 + bloom * 4.0 + corePulse) * perspective);
    const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, coreRadius * 1.8);
    coreGrad.addColorStop(0, '#ffffff');
    coreGrad.addColorStop(0.35, `hsla(${hue - 20}, 100%, 90%, ${(0.85 + bloom * 0.1) * perspective})`);
    coreGrad.addColorStop(0.75, `hsla(${hue}, 85%, 65%, ${0.25 * perspective})`);
    coreGrad.addColorStop(1, 'transparent');
    ctx.beginPath(); ctx.arc(0, 0, coreRadius * 1.8, 0, Math.PI * 2); ctx.fillStyle = coreGrad; ctx.fill();
    ctx.restore();

    // A rare external image appears as if it is inside the creature, like
    // a tiny window or marble embedded in its translucent body. It should
    // feel discovered rather than presented as UI.
    if (creature.carriedImage && creature.imageAlpha > 0.01) {
      const portalSize = Math.min(48, Math.max(32, baseRadius * 0.98));
      ctx.save();
      ctx.globalAlpha = creature.imageAlpha * perspective;
      ctx.beginPath();
      ctx.arc(screenX, screenY, portalSize, 0, Math.PI * 2);
      ctx.clip();
      ctx.globalAlpha = creature.imageAlpha * 0.58 * perspective;
      ctx.filter = 'saturate(0.72) contrast(0.92)';
      ctx.drawImage(creature.carriedImage, screenX - portalSize, screenY - portalSize, portalSize * 2, portalSize * 2);
      ctx.filter = 'none';
      const inner = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, portalSize);
      inner.addColorStop(0, 'rgba(255,255,255,0.06)');
      inner.addColorStop(0.65, 'rgba(20,30,50,0.02)');
      inner.addColorStop(1, 'rgba(0,0,0,0.48)');
      ctx.fillStyle = inner;
      ctx.fillRect(screenX - portalSize, screenY - portalSize, portalSize * 2, portalSize * 2);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = creature.imageAlpha * 0.38 * perspective;
      ctx.strokeStyle = `hsla(${hue - 10}, 90%, 92%, 0.75)`;
      ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.arc(screenX, screenY, portalSize + 1.5, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }
}
