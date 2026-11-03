// The persistent half of the effects canvas: weather, terrain, Trick Room, screens, Tailwind, hazards and the
// conditions on the active mons, painted every frame under the one-shot particles for as long as the battle view
// says they last. `fieldFx.ts` decides what is showing (slots) and how it looks (FIELD_LOOKS); this file fades the
// slots in and out and draws each style. Allocation-free per frame: slot state lives in typed arrays and particle
// pools are fixed-size and recycled; paths are built and filled in place. Own drawing code throughout.
import type { Side } from './battleView';
import { FIELD_LOOKS, FIELD_SLOTS, type FieldLayer, type FieldLook, type FieldSlot } from './fieldFx';
import { drawGlyph } from './glyphs';

export interface Rect { x: number; y: number; w: number; h: number }

/** `off`: nothing. `static`: tints, glows, hazards, markers and the doll, no motion or particles. `full`: everything. */
export type FieldMode = 'off' | 'static' | 'full';

export interface FieldHooks {
  /** A side's sprite box in canvas pixels, or null when nothing stands there. */
  bounds(side: Side): Rect | null;
  /** A side's platform box in canvas pixels, or null. */
  ground(side: Side): Rect | null;
  /** Turn a CSS class on or off on a side's sprite wrapper for as long as an effect needs it. */
  spriteFlag(side: Side, cls: string, on: boolean): void;
  /** The colors of a type's look. */
  palette(type: string): { color: string; light: string };
}

const TAU = Math.PI * 2;
const FADE_IN = 0.35;
const FADE_OUT = 0.3;
const STRIDE = 5;
const LAYERS: readonly FieldLayer[] = ['sky', 'floor', 'side', 'mon'];
const SIDES: readonly Side[] = ['p1', 'p2'];
const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

/** Particles per pool by style. */
const POOL: Partial<Record<string, number>> = { rain: 72, sun: 16, sand: 64, snow: 56, hail: 34, wind: 14, gust: 12 };

/** Spots on a platform, as (u, v) in -1..1 (v runs from the back of the platform to the front). */
const ROCK_SPOTS: readonly (readonly [number, number])[] = [[-0.85, -0.1], [-0.5, 0.15], [-0.15, -0.5], [0.3, 0], [0.7, -0.35], [0.1, 0.2], [0.9, 0.05]];
const SPIKE_SPOTS: readonly (readonly [number, number])[] = [
  [-0.6, -0.35], [-0.45, -0.1], [-0.7, -0.05],
  [0.0, -0.5], [0.2, -0.3], [-0.1, -0.25],
  [0.6, -0.2], [0.75, 0.05], [0.5, 0.1],
];
const TOXIC_SPOTS: readonly (readonly [number, number])[] = [
  [-0.25, 0.1], [-0.05, 0.25], [0.35, 0.2],
  [0.55, -0.5], [0.4, -0.55], [-0.4, -0.55],
];
const WEB_SPOT: readonly [number, number] = [0, -0.1];

const easeOutBack = (t: number): number => { const c = 1.9; const u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; };

function rect(): Rect { return { x: 0, y: 0, w: 0, h: 0 }; }

export class FieldPainter {
  private mode: FieldMode = 'off';
  private w = 0;
  private h = 0;
  private readonly n = FIELD_SLOTS.length;
  private readonly index = new Map<string, number>();
  private readonly looks: FieldLook[] = [];
  private readonly slots: readonly FieldSlot[] = FIELD_SLOTS;
  private readonly level = new Float32Array(this.n);
  private readonly target = new Uint8Array(this.n);
  private readonly want = new Uint8Array(this.n);
  private readonly onAt = new Float64Array(this.n);
  private readonly order: Int16Array[] = [];
  private readonly pools: (Float32Array | null)[] = [];
  private readonly sprite: Record<Side, Rect> = { p1: rect(), p2: rect() };
  private readonly ground: Record<Side, Rect> = { p1: rect(), p2: rect() };
  /** Screens / badges already drawn on each side this frame, to stack them. */
  private readonly stack = { p1: 0, p2: 0 };
  private readonly flags: Record<Side, boolean> = { p1: false, p2: false };

  constructor(private readonly hooks: FieldHooks) {
    FIELD_SLOTS.forEach((s, i) => { this.index.set(s.id, i); this.looks.push(FIELD_LOOKS[s.look]!); });
    for (const layer of LAYERS) {
      const ids: number[] = [];
      this.looks.forEach((l, i) => { if (l.layer === layer) ids.push(i); });
      this.order.push(Int16Array.from(ids));
    }
    this.pools = new Array<Float32Array | null>(this.n).fill(null);
    this.resize(0, 0);
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.refreshGeometry();
    this.pools.fill(null);
  }

  setMode(mode: FieldMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === 'off') { this.level.fill(0); this.target.fill(0); }
  }

  /** Where each side's sprite and platform are now; call after a layout change and every so often while sprites slide in. */
  refreshGeometry(): void {
    const { w, h } = this;
    const fallback: Record<Side, [Rect, Rect]> = {
      p2: [{ x: w * 0.64, y: h * 0.08, w: w * 0.24, h: h * 0.4 }, { x: w * 0.58, y: h * 0.4, w: w * 0.36, h: h * 0.15 }],
      p1: [{ x: w * 0.06, y: h * 0.45, w: w * 0.36, h: h * 0.55 }, { x: w * 0.02, y: h * 0.86, w: w * 0.44, h: h * 0.2 }],
    };
    for (const side of SIDES) {
      const b = this.hooks.bounds(side);
      const g = this.hooks.ground(side);
      Object.assign(this.sprite[side], b && b.w > 4 && b.h > 4 ? b : fallback[side][0]);
      Object.assign(this.ground[side], g && g.w > 4 && g.h > 4 ? g : fallback[side][1]);
    }
  }

  /** Make exactly these slots the showing ones: new ones fade in (after their look's delay), gone ones fade out. */
  setSlots(ids: readonly string[], now: number): void {
    if (this.mode === 'off') { this.syncFlags(); return; }
    this.want.fill(0);
    for (const id of ids) { const i = this.index.get(id); if (i !== undefined) this.want[i] = 1; }
    const full = this.mode === 'full';
    for (let i = 0; i < this.n; i++) {
      const on = this.want[i]!;
      if (on && !this.target[i]) this.onAt[i] = full ? now + (this.looks[i]!.delay ?? 0) : 0;
      this.target[i] = on;
      if (!full) this.level[i] = on;
    }
    this.syncFlags();
  }

  /** True while something still needs frames: a slot fading, or any animated one showing. */
  get animating(): boolean {
    if (this.mode !== 'full') return false;
    for (let i = 0; i < this.n; i++) if (this.target[i] || this.level[i]! > 0) return true;
    return false;
  }

  /** Sprites hide behind their Substitute: a class on the sprite wrapper while the slot shows. */
  private syncFlags(): void {
    for (const side of SIDES) {
      const i = this.index.get(`${side}:mon:Substitute`);
      const on = this.mode !== 'off' && i !== undefined && this.target[i] === 1;
      this.flags[side] = on;
      this.hooks.spriteFlag(side, 'fx-subbed', on);
    }
  }

  step(now: number, dt: number): void {
    for (let i = 0; i < this.n; i++) {
      if (this.target[i]) {
        if (now >= this.onAt[i]!) this.level[i] = Math.min(1, this.level[i]! + dt / FADE_IN);
      } else if (this.level[i]! > 0) {
        this.level[i] = Math.max(0, this.level[i]! - dt / FADE_OUT);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, now: number, dt: number): void {
    if (this.mode === 'off') return;
    const full = this.mode === 'full';
    const t = full ? now / 1000 : 0.35;
    this.stack.p1 = 0;
    this.stack.p2 = 0;
    for (const ids of this.order) {
      for (let k = 0; k < ids.length; k++) {
        const i = ids[k]!;
        const lv = this.level[i]!;
        if (lv <= 0.004) continue;
        ctx.save();
        this.paint(ctx, i, lv, t, full ? dt : 0, full);
        ctx.restore();
      }
    }
  }

  // ---------------------------------------------------------------- spots (shared with the one-shot placement)

  /** Canvas points where a side's hazard sits (one entry per piece); `layer` picks the Spikes / Toxic Spikes layer. */
  hazardSpots(side: Side, condition: string, layer = 1): { x: number; y: number }[] {
    const g = this.ground[side];
    const set = condition === 'Stealth Rock' ? ROCK_SPOTS
      : condition === 'Spikes' ? SPIKE_SPOTS.slice((layer - 1) * 3, layer * 3)
        : condition === 'Toxic Spikes' ? TOXIC_SPOTS.slice((layer - 1) * 3, layer * 3)
          : [WEB_SPOT];
    return set.map(([u, v]) => this.spot(g, u, v));
  }

  /** How many layers of Spikes / Toxic Spikes a side is showing right now. */
  layers(side: Side, condition: string): number {
    let n = 0;
    for (let k = 1; k <= 3; k++) {
      const i = this.index.get(`${side}:${condition}${k}`);
      if (i !== undefined && this.target[i]) n++;
    }
    return n;
  }

  /** Where a side's Substitute doll stands and how big it is. */
  dollSpot(side: Side): { x: number; y: number; s: number } {
    const b = this.sprite[side];
    const s = Math.min(b.h * 0.36, b.w * 0.52, 96);
    return { x: b.x + b.w * (side === 'p1' ? 0.66 : 0.34), y: Math.min(b.y + b.h * 0.88, this.h - 6), s };
  }

  /** The row of the sprite's feet, where seeds and badges sit. */
  feet(side: Side): { x: number; y: number } {
    const b = this.sprite[side];
    return { x: b.x + b.w / 2, y: Math.min(b.y + b.h - 10, this.h - 14) };
  }

  private spot(g: Rect, u: number, v: number): { x: number; y: number } {
    return { x: g.x + g.w / 2 + u * (g.w / 2) * 0.8, y: Math.min(this.h - 10, g.y + g.h / 2 + v * (g.h / 2) * 0.55) };
  }

  // ---------------------------------------------------------------- painting

  private paint(ctx: CanvasRenderingContext2D, i: number, lv: number, t: number, dt: number, full: boolean): void {
    const slot = this.slots[i]!;
    const look = this.looks[i]!;
    const pal = this.hooks.palette(look.type);
    const a = lv * look.strength;
    const side = slot.side;
    switch (look.style) {
      case 'sun': this.sun(ctx, i, a, t, dt, full, pal); break;
      case 'rain': this.rain(ctx, i, a, dt, full, pal, look.strength); break;
      case 'sand': this.sand(ctx, i, a, dt, full, pal); break;
      case 'snow': this.snow(ctx, i, a, t, dt, full, pal); break;
      case 'hail': this.hail(ctx, i, a, dt, full, pal); break;
      case 'wind': this.windy(ctx, i, a, dt, full, pal); break;
      case 'glow': this.glow(ctx, a, t, full, pal, look.type === 'Electric'); break;
      case 'invert': this.room(ctx, a, t, pal); break;
      case 'band': if (side) this.band(ctx, side, a, t, pal); break;
      case 'gust': if (side) this.gust(ctx, i, side, a, dt, full, pal); break;
      case 'rocks': if (side) this.rocks(ctx, side, a, t, full, pal); break;
      case 'spikes': case 'toxic': if (side) this.spikes(ctx, side, slot.layer ?? 1, a, look.style === 'toxic', pal); break;
      case 'web': if (side) this.web(ctx, side, a, t, pal); break;
      case 'doll': if (side) this.doll(ctx, side, lv, t, full, pal); break;
      case 'seed': if (side) this.seed(ctx, side, lv, t, full, pal); break;
      case 'orbit': if (side) this.orbit(ctx, side, a, t, pal); break;
      case 'badge': if (side) this.badge(ctx, side, a, look.glyph ?? 'dot', pal); break;
    }
  }

  /** The pool of a slot, created on first use and refilled after a resize. */
  private pool(i: number): Float32Array {
    let p = this.pools[i];
    if (!p) {
      p = new Float32Array((POOL[this.looks[i]!.style] ?? 0) * STRIDE);
      for (let o = 0; o < p.length; o += STRIDE) this.respawn(p, o, this.looks[i]!.style, true);
      this.pools[i] = p;
    }
    return p;
  }

  private respawn(p: Float32Array, o: number, style: string, initial: boolean): void {
    const { w, h } = this;
    switch (style) {
      case 'rain': p[o] = rnd(-40, w + 40); p[o + 1] = initial ? rnd(-h * 0.2, h) : -rnd(0, 60); p[o + 2] = -110; p[o + 3] = rnd(520, 720); break;
      case 'hail': p[o] = rnd(0, w + 60); p[o + 1] = initial ? rnd(0, h) : -rnd(0, 40); p[o + 2] = -55; p[o + 3] = rnd(480, 640); break;
      case 'snow': p[o] = rnd(0, w); p[o + 1] = initial ? rnd(0, h) : -8; p[o + 2] = rnd(-12, 12); p[o + 3] = rnd(35, 85); p[o + 4] = rnd(0, TAU); break;
      case 'sand': p[o] = initial ? rnd(0, w) : -30; p[o + 1] = rnd(0, h); p[o + 2] = rnd(520, 760); p[o + 3] = rnd(10, 50); break;
      case 'wind': p[o] = initial ? rnd(0, w) : -100; p[o + 1] = rnd(0, h * 0.9); p[o + 2] = rnd(700, 950); p[o + 3] = rnd(-20, 20); break;
      case 'sun': p[o] = rnd(w * 0.3, w); p[o + 1] = initial ? rnd(0, h * 0.7) : h * 0.7; p[o + 2] = rnd(-8, 8); p[o + 3] = -rnd(8, 22); p[o + 4] = rnd(0, TAU); break;
      case 'gust': p[o] = initial ? Math.random() : 0; p[o + 1] = rnd(0.05, 0.95); p[o + 2] = rnd(0.45, 0.85); p[o + 4] = rnd(0, TAU); break;
    }
  }

  /** Move every particle of a pool one step; one that leaves the field comes back at the entry edge. */
  private advance(p: Float32Array, style: string, dt: number): void {
    const { w, h } = this;
    for (let o = 0; o < p.length; o += STRIDE) {
      p[o] = p[o]! + p[o + 2]! * dt;
      p[o + 1] = p[o + 1]! + p[o + 3]! * dt;
      const x = p[o]!;
      const y = p[o + 1]!;
      if (y > h + 12 || x > w + 120 || x < -140 || y < -30) this.respawn(p, o, style, false);
    }
  }

  private wash(ctx: CanvasRenderingContext2D, color: string, alpha: number): void {
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  private rain(ctx: CanvasRenderingContext2D, i: number, a: number, dt: number, full: boolean, pal: { color: string; light: string }, strength: number): void {
    this.wash(ctx, pal.color, 0.13 * a);
    if (!full) return;
    const p = this.pool(i);
    this.advance(p, 'rain', dt);
    const n = Math.min(p.length, Math.round(p.length * Math.min(1, strength * 0.7)) );
    ctx.globalAlpha = 0.7 * Math.min(1, a);
    ctx.strokeStyle = pal.color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let o = 0; o < n; o += STRIDE) {
      ctx.moveTo(p[o]!, p[o + 1]!);
      ctx.lineTo(p[o]! + p[o + 2]! * 0.035, p[o + 1]! + p[o + 3]! * 0.035);
    }
    ctx.stroke();
  }

  private sun(ctx: CanvasRenderingContext2D, i: number, a: number, t: number, dt: number, full: boolean, pal: { color: string; light: string }): void {
    const { w, h } = this;
    this.wash(ctx, pal.light, 0.1 * a);
    // A sun above the top-right corner and a fan of rays across the field.
    const ox = w * 0.92;
    const oy = -h * 0.06;
    ctx.fillStyle = pal.light;
    for (let k = 0; k < 3; k++) {
      ctx.globalAlpha = 0.1 * Math.min(1, a);
      ctx.beginPath();
      ctx.arc(ox, oy, h * (0.2 + k * 0.14), 0, TAU);
      ctx.fill();
    }
    const len = Math.hypot(w, h) * 1.1;
    for (let k = 0; k < 5; k++) {
      const ang = (105 + k * 11) * (Math.PI / 180);
      ctx.globalAlpha = (0.07 + 0.03 * Math.sin(t * 0.8 + k * 1.7)) * Math.min(1, a);
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + Math.cos(ang - 0.045) * len, oy + Math.sin(ang - 0.045) * len);
      ctx.lineTo(ox + Math.cos(ang + 0.045) * len, oy + Math.sin(ang + 0.045) * len);
      ctx.closePath();
      ctx.fill();
    }
    if (!full) return;
    const p = this.pool(i);
    this.advance(p, 'sun', dt);
    ctx.fillStyle = pal.light;
    for (let o = 0; o < p.length; o += STRIDE) {
      ctx.globalAlpha = (0.25 + 0.25 * Math.sin(t * 2 + p[o + 4]!)) * Math.min(1, a);
      ctx.beginPath();
      ctx.arc(p[o]!, p[o + 1]!, 2.2, 0, TAU);
      ctx.fill();
    }
  }

  private sand(ctx: CanvasRenderingContext2D, i: number, a: number, dt: number, full: boolean, pal: { color: string; light: string }): void {
    this.wash(ctx, pal.color, 0.2 * a);
    if (!full) return;
    const p = this.pool(i);
    this.advance(p, 'sand', dt);
    ctx.globalAlpha = 0.55 * Math.min(1, a);
    ctx.strokeStyle = pal.color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let o = 0; o < p.length; o += STRIDE) {
      ctx.moveTo(p[o]!, p[o + 1]!);
      ctx.lineTo(p[o]! + p[o + 2]! * 0.05, p[o + 1]! + p[o + 3]! * 0.05);
    }
    ctx.stroke();
  }

  private snow(ctx: CanvasRenderingContext2D, i: number, a: number, t: number, dt: number, full: boolean, pal: { color: string; light: string }): void {
    this.wash(ctx, pal.light, 0.1 * a);
    if (!full) return;
    const p = this.pool(i);
    this.advance(p, 'snow', dt);
    ctx.globalAlpha = 0.85 * Math.min(1, a);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    for (let o = 0; o < p.length; o += STRIDE) {
      const x = p[o]! + Math.sin(t * 1.4 + p[o + 4]!) * 10;
      const r = 1.6 + (p[o + 4]! % 1) * 1.8;
      ctx.moveTo(x + r, p[o + 1]!);
      ctx.arc(x, p[o + 1]!, r, 0, TAU);
    }
    ctx.fill();
    ctx.strokeStyle = pal.color;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  private hail(ctx: CanvasRenderingContext2D, i: number, a: number, dt: number, full: boolean, pal: { color: string; light: string }): void {
    this.wash(ctx, pal.color, 0.1 * a);
    if (!full) return;
    const p = this.pool(i);
    this.advance(p, 'hail', dt);
    ctx.globalAlpha = 0.9 * Math.min(1, a);
    ctx.strokeStyle = pal.color;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let o = 0; o < p.length; o += STRIDE) {
      ctx.moveTo(p[o]!, p[o + 1]!);
      ctx.lineTo(p[o]! + p[o + 2]! * 0.012, p[o + 1]! + p[o + 3]! * 0.012);
    }
    ctx.stroke();
  }

  private windy(ctx: CanvasRenderingContext2D, i: number, a: number, dt: number, full: boolean, pal: { color: string; light: string }): void {
    this.wash(ctx, pal.color, 0.07 * a);
    if (!full) return;
    const p = this.pool(i);
    this.advance(p, 'wind', dt);
    ctx.globalAlpha = 0.4 * Math.min(1, a);
    ctx.strokeStyle = pal.light;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let o = 0; o < p.length; o += STRIDE) {
      ctx.moveTo(p[o]!, p[o + 1]!);
      ctx.lineTo(p[o]! + p[o + 2]! * 0.1, p[o + 1]! + p[o + 3]! * 0.1);
    }
    ctx.stroke();
  }

  /** Terrain: a glow on the floor under both platforms, rimmed and rippling. */
  private glow(ctx: CanvasRenderingContext2D, a: number, t: number, full: boolean, pal: { color: string; light: string }, flicker: boolean): void {
    const k = Math.min(1, a) * (flicker && full ? 0.78 + 0.22 * Math.sin(t * 23) * Math.sin(t * 7.3) : 1) * (full ? 0.92 + 0.08 * Math.sin(t * 2) : 1);
    for (const side of SIDES) {
      const g = this.ground[side];
      const cx = g.x + g.w / 2;
      const cy = g.y + g.h / 2;
      const rx = g.w / 2;
      const ry = g.h / 2;
      ctx.fillStyle = pal.color;
      for (let s = 0; s < 3; s++) {
        ctx.globalAlpha = (0.1 + s * 0.04) * k;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx * (1.22 - s * 0.2), ry * (1.35 - s * 0.22), 0, 0, TAU);
        ctx.fill();
      }
      ctx.strokeStyle = pal.light;
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.55 * k;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * 0.98, ry * 0.98, 0, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = pal.color;
      ctx.lineWidth = 2;
      for (let r = 0; r < 2; r++) {
        const ph = full ? (t * 0.4 + r * 0.5) % 1 : 0.3 + r * 0.4;
        ctx.globalAlpha = (1 - ph) * 0.6 * k;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx * (0.55 + ph * 0.75), ry * (0.55 + ph * 0.75), 0, 0, TAU);
        ctx.stroke();
      }
    }
  }

  /** Trick Room: a mild tint, the room's outline and rings closing in on the middle of the field. */
  private room(ctx: CanvasRenderingContext2D, a: number, t: number, pal: { color: string; light: string }): void {
    const { w, h } = this;
    const k = Math.min(1, a);
    this.wash(ctx, pal.color, 0.09 * k);
    ctx.strokeStyle = pal.color;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.55 * k;
    ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.28 * k;
    ctx.strokeRect(12, 12, w - 24, h - 24);
    const maxR = Math.hypot(w, h) * 0.36;
    ctx.strokeStyle = pal.light;
    ctx.lineWidth = 2;
    for (let r = 0; r < 3; r++) {
      const ph = (t * 0.22 + r / 3) % 1;
      ctx.globalAlpha = Math.sin(Math.PI * ph) * 0.4 * k;
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.52, maxR * (1 - ph), maxR * (1 - ph) * 0.42, 0, 0, TAU);
      ctx.stroke();
    }
  }

  /** A screen: a shimmering wall around its side's sprite; a second one on the same side sits outside the first. */
  private band(ctx: CanvasRenderingContext2D, side: Side, a: number, t: number, pal: { color: string; light: string }): void {
    const b = this.sprite[side];
    const n = this.stack[side]++;
    const e = 14 + n * 11;
    const x = b.x - e;
    const y = b.y - e * 0.6;
    const w = b.w + e * 2;
    const h = Math.min(b.h + e * 1.2, this.h - y - 2);
    const k = Math.min(1, a);
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 20);
    ctx.fillStyle = pal.color;
    ctx.globalAlpha = 0.11 * k;
    ctx.fill();
    ctx.strokeStyle = pal.light;
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.6 * k;
    ctx.stroke();
    ctx.clip();
    ctx.strokeStyle = pal.light;
    ctx.lineWidth = 16;
    ctx.globalAlpha = 0.2 * k;
    for (let s = 0; s < 3; s++) {
      const pos = ((t * 0.3 + s / 3) % 1) * (w + h);
      ctx.beginPath();
      ctx.moveTo(x + pos - h, y + h);
      ctx.lineTo(x + pos, y);
      ctx.stroke();
    }
  }

  /** Tailwind: streaks blowing across the side that has it. */
  private gust(ctx: CanvasRenderingContext2D, i: number, side: Side, a: number, dt: number, full: boolean, pal: { color: string; light: string }): void {
    const b = this.sprite[side];
    const x0 = b.x - b.w * 0.45;
    const span = b.w * 1.9;
    const y0 = b.y + b.h * 0.1;
    const spanY = b.h * 0.9;
    const k = Math.min(1, a);
    ctx.strokeStyle = pal.light;
    ctx.lineCap = 'round';
    ctx.lineWidth = 2;
    if (!full) {
      // Still picture: a few streaks frozen mid-gust.
      ctx.globalAlpha = 0.45 * k;
      ctx.beginPath();
      for (let s = 0; s < 6; s++) {
        const y = y0 + spanY * ((s * 0.37) % 1);
        const x = x0 + span * (0.15 + ((s * 0.29) % 0.6));
        ctx.moveTo(x, y);
        ctx.lineTo(x + 46, y);
      }
      ctx.stroke();
      return;
    }
    const p = this.pool(i);
    for (let o = 0; o < p.length; o += STRIDE) {
      p[o] = p[o]! + p[o + 2]! * dt;
      if (p[o]! > 1) this.respawn(p, o, 'gust', false);
      const u = p[o]!;
      const x = x0 + span * u;
      const y = y0 + spanY * p[o + 1]! + Math.sin(u * 7 + p[o + 4]!) * 6;
      ctx.globalAlpha = Math.sin(Math.PI * u) * 0.65 * k;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 20, y - 5, x + 46, y);
      ctx.stroke();
    }
  }

  private rocks(ctx: CanvasRenderingContext2D, side: Side, a: number, t: number, full: boolean, pal: { color: string; light: string }): void {
    const g = this.ground[side];
    const k = Math.min(1, a);
    for (let r = 0; r < ROCK_SPOTS.length; r++) {
      const [u, v] = ROCK_SPOTS[r]!;
      const p = this.spot(g, u, v);
      const s = 8 + (r % 3) * 2;
      const bob = full ? Math.sin(t * 1.6 + r * 1.3) * 1.5 : 0;
      ctx.globalAlpha = 0.22 * k;
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 3, s * 0.9, s * 0.3, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = k;
      ctx.save();
      ctx.translate(p.x, p.y - s * 0.5 - 3 + bob);
      ctx.rotate(r * 1.1);
      drawGlyph(ctx, 'rock', s, pal.color, pal.light);
      ctx.restore();
    }
  }

  /** One layer of Spikes (grey) or Toxic Spikes (purple): a cluster of three caltrop spikes. */
  private spikes(ctx: CanvasRenderingContext2D, side: Side, layer: number, a: number, toxic: boolean, pal: { color: string; light: string }): void {
    const g = this.ground[side];
    const spots = toxic ? TOXIC_SPOTS : SPIKE_SPOTS;
    const k = Math.min(1, a);
    for (let s = 0; s < 3; s++) {
      const [u, v] = spots[(layer - 1) * 3 + s] ?? spots[s]!;
      const p = this.spot(g, u, v);
      const sz = toxic ? 10 : 9;
      ctx.globalAlpha = 0.22 * k;
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 1, sz * 0.8, sz * 0.25, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = k;
      ctx.fillStyle = pal.color;
      ctx.strokeStyle = toxic ? pal.light : '#2b2f3a';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(p.x - sz * 0.5, p.y);
      ctx.lineTo(p.x, p.y - sz * 1.7);
      ctx.lineTo(p.x + sz * 0.5, p.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (toxic) {
        ctx.fillStyle = pal.light;
        ctx.globalAlpha = 0.8 * k;
        ctx.beginPath();
        ctx.arc(p.x, p.y - sz * 1.9, 2, 0, TAU);
        ctx.fill();
      }
    }
  }

  private web(ctx: CanvasRenderingContext2D, side: Side, a: number, t: number, pal: { color: string; light: string }): void {
    const g = this.ground[side];
    const c = this.spot(g, WEB_SPOT[0], WEB_SPOT[1]);
    const rx = g.w * 0.3;
    const ry = g.h * 0.28;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = (0.6 + 0.1 * Math.sin(t * 2)) * Math.min(1, a);
    ctx.beginPath();
    for (let s = 0; s < 8; s++) {
      const ang = (s / 8) * TAU;
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(c.x + Math.cos(ang) * rx, c.y + Math.sin(ang) * ry);
    }
    for (let r = 1; r <= 3; r++) {
      ctx.moveTo(c.x + (rx * r) / 3, c.y);
      ctx.ellipse(c.x, c.y, (rx * r) / 3, (ry * r) / 3, 0, 0, TAU);
    }
    ctx.stroke();
    ctx.fillStyle = pal.color;
    ctx.globalAlpha = 0.5 * Math.min(1, a);
    ctx.beginPath();
    ctx.arc(c.x, c.y, 3, 0, TAU);
    ctx.fill();
  }

  /** A Substitute: a stitched plush in front of the (dimmed) sprite, popping in and breaking out. */
  private doll(ctx: CanvasRenderingContext2D, side: Side, lv: number, t: number, full: boolean, pal: { color: string; light: string }): void {
    const { x, y, s } = this.dollSpot(side);
    const pop = lv >= 1 ? 1 : Math.max(0.01, easeOutBack(lv));
    ctx.translate(x, y + (full ? Math.sin(t * 2.2) * 1.5 : 0));
    ctx.scale(pop, pop);
    ctx.globalAlpha = Math.min(1, lv * 1.5);
    ctx.fillStyle = '#000000';
    ctx.globalAlpha *= 0.25;
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.5, s * 0.1, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = Math.min(1, lv * 1.5);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#4a3a1a';
    ctx.fillStyle = pal.color;
    // ears, body, head
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(sx * s * 0.22, -s * 0.98, s * 0.11, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.3, s * 0.42, s * 0.36, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -s * 0.72, s * 0.3, 0, TAU);
    ctx.fill();
    ctx.stroke();
    // belly patch, stitches, face
    ctx.fillStyle = pal.light;
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.28, s * 0.22, s * 0.2, 0, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-s * 0.1, -s * 0.36);
    ctx.lineTo(s * 0.1, -s * 0.2);
    ctx.moveTo(s * 0.1, -s * 0.36);
    ctx.lineTo(-s * 0.1, -s * 0.2);
    ctx.stroke();
    ctx.fillStyle = '#2a1f0c';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(sx * s * 0.11, -s * 0.74, s * 0.045, 0, TAU);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0, -s * 0.68, s * 0.07, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }

  /** Leech Seed: a vine along the sprite's feet, leaves on it and a pulsing bulb. */
  private seed(ctx: CanvasRenderingContext2D, side: Side, lv: number, t: number, full: boolean, pal: { color: string; light: string }): void {
    const b = this.sprite[side];
    const fy = Math.min(b.y + b.h - 12, this.h - 16);
    const x0 = b.x + b.w * 0.12;
    const x1 = b.x + b.w * 0.88;
    const N = 14;
    const upto = Math.ceil(lv * N);
    ctx.strokeStyle = '#3f8f3a';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = Math.min(1, lv * 1.5);
    ctx.beginPath();
    for (let k = 0; k <= upto; k++) {
      const px = x0 + ((x1 - x0) * k) / N;
      const py = fy + Math.sin(k * 0.9 + (full ? t * 1.2 : 0)) * 3.5;
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    for (let k = 2; k < upto; k += 3) {
      const px = x0 + ((x1 - x0) * k) / N;
      const py = fy + Math.sin(k * 0.9 + (full ? t * 1.2 : 0)) * 3.5;
      ctx.save();
      ctx.translate(px, py + (k % 2 ? 6 : -6));
      ctx.rotate(k % 2 ? 0.9 : -0.9);
      drawGlyph(ctx, 'leaf', 7, pal.color, pal.light);
      ctx.restore();
    }
    const pulse = full ? 1 + 0.14 * Math.sin(t * 3.2) : 1;
    const bx = (x0 + x1) / 2;
    ctx.translate(bx, fy - 6);
    ctx.scale(pulse * Math.min(1, lv * 1.6), pulse * Math.min(1, lv * 1.6));
    ctx.fillStyle = '#7bc74d';
    ctx.strokeStyle = '#2f6b2c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, 9.5, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = pal.light;
    ctx.globalAlpha *= 0.8;
    ctx.beginPath();
    ctx.arc(-3, -3, 2.4, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#2f6b2c';
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.quadraticCurveTo(3, -15, 8, -14);
    ctx.stroke();
  }

  /** Confusion: stars circling the head. */
  private orbit(ctx: CanvasRenderingContext2D, side: Side, a: number, t: number, pal: { color: string; light: string }): void {
    const b = this.sprite[side];
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h * 0.16;
    const rx = b.w * 0.26;
    const k = Math.min(1, a);
    for (let s = 0; s < 3; s++) {
      const ang = t * 3 + (s * TAU) / 3;
      const front = Math.sin(ang);
      ctx.save();
      ctx.globalAlpha = (0.55 + 0.45 * (front + 1) / 2) * k;
      ctx.translate(cx + Math.cos(ang) * rx, cy + front * 9);
      ctx.rotate(ang * 0.5);
      drawGlyph(ctx, 'star', 6 + front * 1.5, pal.color, pal.light);
      ctx.restore();
    }
  }

  /** Taunt, Encore & co: a round badge in the row at the sprite's feet. */
  private badge(ctx: CanvasRenderingContext2D, side: Side, a: number, glyph: Parameters<typeof drawGlyph>[1], pal: { color: string; light: string }): void {
    const b = this.sprite[side];
    const n = this.stack[side]++;
    const x = b.x + 16 + n * 30;
    const y = Math.min(b.y + b.h - 10, this.h - 18);
    const k = Math.min(1, a);
    ctx.globalAlpha = 0.78 * k;
    ctx.fillStyle = '#1c2030';
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = k;
    ctx.strokeStyle = pal.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.translate(x, y);
    drawGlyph(ctx, glyph, 7.5, pal.color, pal.light);
  }
}
