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
    const cryst = creature.crystalline;
    const ribbon = creature.ribbon;
    const breath = creature.bodyBreath;
    const pulse = creature.bodyPulse;
    const organic = creature.bodyOrganic;

    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.rotate(creature.rotation);
    // The bell narrows while it pushes and re-expands while gliding. This is
    // the same transform the hitbox uses.
    ctx.scale(creature.bodySX, creature.bodySY);

    const auraR = baseRadius * (2.0 + bloom * 0.8 + ribbon * 0.3);
    const auraGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, auraR);
    auraGrad.addColorStop(0, `hsla(${hue}, ${sat}%, 72%, ${(0.15 + bloom * 0.15) * perspective})`);
    auraGrad.addColorStop(0.5, `hsla(${hue + 25}, ${sat}%, 55%, ${0.04 * perspective})`);
    auraGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = auraGrad;
    ctx.beginPath(); ctx.arc(0, 0, auraR, 0, Math.PI * 2); ctx.fill();

    // The contour is built once per frame in Creature.refreshBody() and is the
    // same shape the collision system uses.
    const shape = creature.shape;
    const numPoints = shape.n;
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < numPoints; i += 1) {
      points.push({ x: shape.xs[i] * perspective, y: shape.ys[i] * perspective });
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

    // The core is deliberately dimmer and less spherical than before. An
    // irregular, slowly changing flicker makes it read more like a tiny living
    // filament than a bright LED or energy orb. The target changes at uneven
    // intervals and is smoothly interpolated, so the light never becomes a
    // metronome.
    const sig = creature.signal;
    const flickerClock = phase * 0.58 + creature.data.seed * 13.7;
    const flickerStep = Math.floor(flickerClock);
    const flickerT = flickerClock - flickerStep;
    const hash = (n: number) => {
      const x = Math.sin(n * 12.9898 + creature.data.seed * 78.233) * 43758.5453;
      return x - Math.floor(x);
    };
    const flickerA = hash(flickerStep);
    const flickerB = hash(flickerStep + 1);
    const smoothFlickerT = flickerT * flickerT * (3 - 2 * flickerT);
    const flickerTarget = 0.70 + 0.18 * (flickerA * 0.65 + flickerB * 0.35);
    const nextFlickerTarget = 0.70 + 0.18 * (flickerB * 0.65 + hash(flickerStep + 2) * 0.35);
    // Between bouts the core is calm and slightly dimmer; a bout lifts it clearly.
    const flicker = (flickerTarget + (nextFlickerTarget - flickerTarget) * smoothFlickerT) * (0.86 + sig * 0.55);
    const organicFlicker = 0.96 + 0.04 * Math.sin(phase * 2.7 + creature.data.seed * 4.1);
    const corePulse = breath * 0.9 + pulse * 0.48 + organic * 0.18;
    const coreRadius = Math.max(2.2, (5.8 + bloom * 2.0 + corePulse * 0.7 + sig * 4.2) * perspective);
    const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, coreRadius * 1.65);
    coreGrad.addColorStop(0, `rgba(255,255,255,${0.68 * flicker * organicFlicker * perspective})`);
    coreGrad.addColorStop(0.32, `hsla(${hue - 20}, 100%, 90%, ${(0.50 + bloom * 0.05) * flicker * perspective})`);
    coreGrad.addColorStop(0.72, `hsla(${hue}, 85%, 65%, ${0.12 * flicker * perspective})`);
    coreGrad.addColorStop(1, 'transparent');
    ctx.beginPath(); ctx.arc(0, 0, coreRadius * 1.65, 0, Math.PI * 2); ctx.fillStyle = coreGrad; ctx.fill();

    // Signal flash: the whole translucent body lights up from inside, then fades.
    if (sig > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const haloR = baseRadius * (1.15 + sig * 0.55);
      const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, haloR);
      halo.addColorStop(0, `hsla(${hue - 20}, 100%, 92%, ${0.30 * sig * perspective})`);
      halo.addColorStop(0.45, `hsla(${hue}, 95%, 70%, ${0.20 * sig * perspective})`);
      halo.addColorStop(1, 'transparent');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(0, 0, haloR, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
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
