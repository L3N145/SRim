import { Creature } from './creature';
import type { Ripple } from './ripple';
import { getRippleOpacity, getRippleRadius } from './ripple';

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
    const mitosis = creature.mitosis;
    const vortex = creature.vortex;

    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.rotate(creature.rotation);

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
      let r = baseRadius + Math.sin(phase * 0.8 + angle * 2) * (1.5 * (1.0 - spike));
      if (spike > 0.01) {
        const spikeWave = Math.pow(Math.abs(Math.sin(angle * (spikeFreq / 2) + phase * 0.2)), 3.0);
        r += spikeWave * (22 * spike * perspective);
      }
      if (cryst > 0.01) r *= 1.0 + Math.sin(angle * 4) * (0.2 * cryst);
      if (vortex > 0.01) r += Math.sin(angle * 3 + phase * 2.0) * (8.0 * vortex * perspective);
      let px = Math.cos(angle) * r;
      let py = Math.sin(angle) * r;
      if (stretch > 0.01 && Math.cos(angle) < 0) {
        px -= Math.abs(Math.cos(angle)) * (36 * stretch * perspective);
        py *= 1.0 - Math.abs(Math.cos(angle)) * 0.4 * stretch;
      }
      if (ribbon > 0.01) {
        px *= 1.0 + 0.6 * ribbon;
        py *= 1.0 - 0.35 * ribbon;
        py += Math.sin(px * 0.08 + phase * 1.5) * (8.0 * ribbon);
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

    if (creature.carriedImage && creature.imageAlpha > 0.01) {
      ctx.save();
      const imgSize = baseRadius * 1.35;
      ctx.beginPath(); ctx.arc(0, 0, imgSize * 0.5, 0, Math.PI * 2); ctx.clip();
      ctx.globalAlpha = creature.imageAlpha * perspective;
      ctx.drawImage(creature.carriedImage, -imgSize * 0.5, -imgSize * 0.5, imgSize, imgSize);
      ctx.restore();
    }
    ctx.strokeStyle = `hsla(${hue - 5}, 95%, 90%, ${(0.3 + spike * 0.4 + cryst * 0.3) * perspective})`;
    ctx.lineWidth = 1.0 + spike * 0.8 + cryst * 0.5;
    ctx.stroke();

    const corePulse = Math.sin(phase * 0.6) * 0.6;
    const coreRadius = Math.max(3, (7.5 + bloom * 4.0 + corePulse) * perspective);
    if (mitosis > 0.05) {
      const splitDist = 12 * mitosis * perspective;
      const rotMitosis = phase * 1.2;
      for (const dir of [-1, 1]) {
        const cx = Math.cos(rotMitosis) * splitDist * dir;
        const cy = Math.sin(rotMitosis) * splitDist * dir;
        const mGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius * 1.2);
        mGrad.addColorStop(0, '#ffffff');
        mGrad.addColorStop(0.4, `hsla(${hue - 20}, 100%, 90%, ${0.85 * perspective})`);
        mGrad.addColorStop(1, 'transparent');
        ctx.beginPath(); ctx.arc(cx, cy, coreRadius * 1.2, 0, Math.PI * 2); ctx.fillStyle = mGrad; ctx.fill();
      }
    } else {
      const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, coreRadius * 1.8);
      coreGrad.addColorStop(0, '#ffffff');
      coreGrad.addColorStop(0.35, `hsla(${hue - 20}, 100%, 90%, ${(0.85 + bloom * 0.1) * perspective})`);
      coreGrad.addColorStop(0.75, `hsla(${hue}, 85%, 65%, ${0.25 * perspective})`);
      coreGrad.addColorStop(1, 'transparent');
      ctx.beginPath(); ctx.arc(0, 0, coreRadius * 1.8, 0, Math.PI * 2); ctx.fillStyle = coreGrad; ctx.fill();
    }
    ctx.restore();
  }
}
