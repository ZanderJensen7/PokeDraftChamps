// Particle glyphs: the small shapes the effect canvases draw. Own drawing code (nothing from Showdown or PokeRogue).
import type { Glyph } from './vfx';

const TAU = Math.PI * 2;

/** One glyph centered on the origin (the caller has translated and rotated). */
export function drawGlyph(ctx: CanvasRenderingContext2D, g: Glyph, s: number, color: string, light: string): void {
  switch (g) {
    case 'dot':
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.5, 0, TAU);
      ctx.fill();
      return;
    case 'spark':
      ctx.fillStyle = light;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU;
        ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
        ctx.lineTo(Math.cos(a + Math.PI / 4) * s * 0.25, Math.sin(a + Math.PI / 4) * s * 0.25);
      }
      ctx.closePath();
      ctx.fill();
      return;
    case 'star':
      ctx.fillStyle = color;
      ctx.strokeStyle = light;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU - Math.PI / 2;
        const r = i % 2 ? s * 0.45 : s;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      return;
    case 'flame': {
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, s);
      grad.addColorStop(0, light);
      grad.addColorStop(0.45, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.scale(1, 1.35);
      ctx.beginPath();
      ctx.arc(0, 0, s, 0, TAU);
      ctx.fill();
      return;
    }
    case 'drop':
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.quadraticCurveTo(s * 0.7, 0, 0, s * 0.8);
      ctx.quadraticCurveTo(-s * 0.7, 0, 0, -s);
      ctx.fill();
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.arc(-s * 0.2, s * 0.1, s * 0.18, 0, TAU);
      ctx.fill();
      return;
    case 'bolt':
      ctx.strokeStyle = light;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.lineWidth = Math.max(1.5, s * 0.3);
      ctx.lineJoin = 'miter';
      ctx.beginPath();
      ctx.moveTo(-s * 0.35, -s);
      ctx.lineTo(s * 0.2, -s * 0.15);
      ctx.lineTo(-s * 0.15, -s * 0.05);
      ctx.lineTo(s * 0.35, s);
      ctx.stroke();
      return;
    case 'leaf':
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(0, 0, s, s * 0.45, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = light;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-s, 0);
      ctx.lineTo(s, 0);
      ctx.stroke();
      return;
    case 'shard':
      ctx.fillStyle = color;
      ctx.strokeStyle = light;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.45, 0);
      ctx.lineTo(0, s);
      ctx.lineTo(-s * 0.45, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      return;
    case 'ring':
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.5, s * 0.3);
      ctx.shadowColor = light;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(0, 0, s, 0, TAU);
      ctx.stroke();
      return;
    case 'rock':
      ctx.fillStyle = color;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        const r = s * (i % 2 ? 0.75 : 1);
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      return;
    case 'slash':
      ctx.fillStyle = light;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 1.6, s * 0.25, 0, 0, TAU);
      ctx.fill();
      return;
    case 'arrow':
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, s * 0.45);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = light;
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.moveTo(-s, s * 0.5);
      ctx.lineTo(0, -s * 0.6);
      ctx.lineTo(s, s * 0.5);
      ctx.stroke();
      return;
    case 'heart':
      ctx.fillStyle = color;
      ctx.strokeStyle = light;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, s * 0.85);
      ctx.bezierCurveTo(-s * 1.3, s * 0.1, -s * 0.8, -s * 0.9, 0, -s * 0.3);
      ctx.bezierCurveTo(s * 0.8, -s * 0.9, s * 1.3, s * 0.1, 0, s * 0.85);
      ctx.fill();
      ctx.stroke();
      return;
    case 'bubble':
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.6, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.arc(-s * 0.2, -s * 0.2, s * 0.15, 0, TAU);
      ctx.fill();
      return;
  }
}
