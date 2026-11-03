// The effect stage: a canvas over the battle field that draws FxEvents as particles and overlays, and asks the
// field (through hooks) to flash a sprite or shake. A small particle system of our own; the six shape templates
// (contact / projectile / beam / self / status / field) are the only "animations", the sprites never move
// except for the hit shake. Randomness here is cosmetic, so plain Math.random is fine.
import type { Side } from './battleView';
import { activeSlots, FIELD_LOOKS, type FieldFx } from './fieldFx';
import { FieldPainter, type FieldMode, type Rect } from './fieldCanvas';
import { playCry, playSfx, playTypeSfx } from './sound';
import { drawGlyph } from './glyphs';
import { TYPE_FX, type FxEvent, type FxShape, type Glyph } from './vfx';

export interface Pt { x: number; y: number }

export interface FxHooks {
  /** Center of a side's sprite in canvas pixels, or null when nothing stands there. */
  anchor(side: Side): Pt | null;
  /** Add CSS classes to a side's sprite wrapper for `ms`, optionally setting `--fx-color`. */
  spriteClass(side: Side, cls: string, ms: number, color?: string): void;
  /** Shake the whole field. */
  shake(strong: boolean): void;
  /** Resolve a theme color token (`type-fire`) to a CSS color. */
  color(token: string): string;
  /** A side's sprite box in canvas pixels, or null. */
  bounds(side: Side): Rect | null;
  /** A side's platform box in canvas pixels, or null. */
  ground(side: Side): Rect | null;
  /** Turn a class on or off on a side's sprite wrapper until told otherwise (the dimmed sprite behind a Substitute). */
  spriteFlag(side: Side, cls: string, on: boolean): void;
}

interface Palette { color: string; light: string; glyph: Glyph }

interface Particle {
  glyph: Glyph;
  color: string;
  light: string;
  x: number; y: number;
  vx: number; vy: number;
  /** Gravity (px/s²) and per-second velocity keep. */
  g: number; drag: number;
  size: number;
  rot: number; spin: number;
  born: number; life: number;
  /** Flight from (x0,y0) to (x1,y1) over `life`, bowed sideways by `arc` px; overrides velocity. */
  path?: { x0: number; y0: number; x1: number; y1: number; arc: number };
  trail?: boolean;
  fade: 'out' | 'inout' | 'none';
}

type Overlay =
  | { kind: 'wash'; color: string; alpha: number; born: number; life: number }
  | { kind: 'beam'; x0: number; y0: number; x1: number; y1: number; color: string; light: string; width: number; born: number; life: number }
  | { kind: 'ring'; x: number; y: number; r0: number; r1: number; color: string; born: number; life: number }
  | { kind: 'flash'; x: number; y: number; r: number; color: string; born: number; life: number }
  | { kind: 'slash'; x: number; y: number; angle: number; len: number; color: string; born: number; life: number };

const MAX_PARTICLES = 420;
const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);
const TAU = Math.PI * 2;

export class FxStage {
  private readonly ctx: CanvasRenderingContext2D | null;
  private parts: Particle[] = [];
  private overs: Overlay[] = [];
  private raf = 0;
  private last = 0;
  private w = 0;
  private h = 0;
  private lastAttack: { type: string; to: Side } | null = null;
  private mods: Partial<Record<Side, { crit?: boolean; eff?: 'super' | 'resisted' }>> = {};
  private zNext: Partial<Record<Side, boolean>> = {};
  private palettes = new Map<string, Palette>();
  /** The persistent layer (weather, terrain, screens, hazards, markers), drawn under everything above. */
  private readonly field: FieldPainter;
  private geoAt = 0;
  /** Keep frames coming until then, so a sprite sliding in is followed by its markers. */
  private settleUntil = 0;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly hooks: FxHooks) {
    this.ctx = canvas.getContext('2d');
    this.field = new FieldPainter({
      bounds: (s) => hooks.bounds(s),
      ground: (s) => hooks.ground(s),
      spriteFlag: (s, cls, on) => hooks.spriteFlag(s, cls, on),
      palette: (type) => this.palette(type),
    });
  }

  /** Show the persistent effects of a field state. `static` keeps the still ones (tints, glows, hazards, markers) and drops the motion. */
  setField(fx: FieldFx, mode: FieldMode): void {
    this.field.setMode(mode);
    this.field.refreshGeometry();
    this.field.setSlots(mode === 'off' ? [] : activeSlots(fx), performance.now());
    this.settleUntil = performance.now() + 800;
    this.kick();
  }

  resize(w: number, h: number): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.field.resize(w, h);
    this.kick();
  }

  dispose(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.parts = [];
    this.overs = [];
    this.field.setMode('off');
    this.field.setSlots([], 0);
  }

  /** Play one event. With `visual` off only the sounds play (effects disabled or reduced motion). */
  play(ev: FxEvent, visual: boolean): void {
    const now = performance.now();
    switch (ev.kind) {
      case 'attack': {
        const scale = this.zNext[ev.from] ? 1.8 : 1;
        this.zNext[ev.from] = false;
        this.lastAttack = { type: ev.type, to: ev.to };
        playTypeSfx(ev.type);
        if (visual) this.attack(ev.from, ev.to, ev.shape, this.palette(ev.type), scale, now);
        return;
      }
      case 'hitmod':
        this.mods[ev.to] = { ...this.mods[ev.to], ...(ev.crit ? { crit: true } : {}), ...(ev.eff ? { eff: ev.eff } : {}) };
        return;
      case 'hit': {
        const mod = this.mods[ev.to] ?? {};
        delete this.mods[ev.to];
        const strong = !!mod.crit || mod.eff === 'super';
        const weak = mod.eff === 'resisted' && !mod.crit;
        playSfx(strong ? 'hitStrong' : weak ? 'hitWeak' : 'hit');
        if (!visual) return;
        const at = this.hooks.anchor(ev.to);
        const fx = this.palette(this.lastAttack?.type ?? 'Normal');
        if (at) {
          this.burst(at, fx, strong ? 26 : weak ? 9 : 16, strong ? [200, 380] : [130, 260], 420, now);
          this.overs.push({ kind: 'flash', x: at.x, y: at.y, r: strong ? 100 : 66, color: '#ffffff', born: now, life: 200 });
          if (mod.eff === 'super') this.overs.push({ kind: 'ring', x: at.x, y: at.y, r0: 12, r1: 110, color: fx.color, born: now, life: 440 });
        }
        this.hooks.spriteClass(ev.to, strong ? 'fx-hit fx-hit-strong' : 'fx-hit', 420);
        if (strong) this.hooks.shake(!!mod.crit);
        this.kick();
        return;
      }
      case 'chip': {
        playSfx('chip');
        if (!visual) return;
        const at = this.hooks.anchor(ev.to);
        if (at) this.burst(at, this.palette(ev.type), 7, [60, 140], 380, now);
        this.hooks.spriteClass(ev.to, 'fx-hit', 260);
        this.kick();
        return;
      }
      case 'heal': {
        playSfx('heal');
        if (!visual) return;
        const at = this.hooks.anchor(ev.to);
        if (at) this.aura(at, { color: this.hooks.color('hp-green'), light: '#eaffea', glyph: 'star' }, 0.8, now);
        this.kick();
        return;
      }
      case 'status': {
        playSfx('status');
        if (!visual) return;
        const at = this.hooks.anchor(ev.to);
        if (at) this.swirl(at, this.palette(ev.type), 1, now);
        this.kick();
        return;
      }
      case 'boost': {
        playSfx(ev.up ? 'boost' : 'unboost');
        if (!visual) return;
        const at = this.hooks.anchor(ev.to);
        if (!at) return;
        const color = ev.up ? this.hooks.color('poke-yellow') : this.hooks.color('you');
        const n = 6 + 4 * Math.min(3, ev.stages);
        for (let i = 0; i < n; i++) {
          this.spawn({
            glyph: 'arrow', color, light: '#ffffff',
            x: at.x + rnd(-44, 44), y: at.y + (ev.up ? rnd(10, 50) : rnd(-50, -10)),
            vx: 0, vy: ev.up ? rnd(-150, -90) : rnd(90, 150), g: 0, drag: 1,
            size: rnd(7, 10), rot: ev.up ? 0 : Math.PI, spin: 0,
            born: now + rnd(0, 220), life: 520, fade: 'inout',
          });
        }
        this.kick();
        return;
      }
      case 'shield': {
        playSfx('shield');
        if (!visual) return;
        const at = this.hooks.anchor(ev.to);
        if (!at) return;
        const color = '#9be7ff';
        this.overs.push({ kind: 'ring', x: at.x, y: at.y, r0: 20, r1: 62, color, born: now, life: 380 });
        this.overs.push({ kind: 'ring', x: at.x, y: at.y, r0: 56, r1: 60, color, born: now + 200, life: 520 });
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU;
          this.spawn({
            glyph: 'shard', color, light: '#ffffff',
            x: at.x + Math.cos(a) * 58, y: at.y + Math.sin(a) * 58, vx: 0, vy: 0, g: 0, drag: 1,
            size: 7, rot: a, spin: 0, born: now + 120, life: 600, fade: 'inout',
          });
        }
        this.kick();
        return;
      }
      case 'tera': {
        playSfx('tera');
        if (!visual) return;
        const fx = this.palette(ev.type);
        const at = this.hooks.anchor(ev.to);
        this.overs.push({ kind: 'wash', color: fx.color, alpha: 0.35, born: now, life: 700 });
        if (at) {
          this.overs.push({ kind: 'flash', x: at.x, y: at.y, r: 110, color: fx.light, born: now, life: 420 });
          this.overs.push({ kind: 'ring', x: at.x, y: at.y, r0: 10, r1: 130, color: fx.color, born: now + 80, life: 600 });
          this.burst(at, { ...fx, glyph: 'shard' }, 26, [120, 260], 720, now + 60);
        }
        this.hooks.spriteClass(ev.to, 'fx-glow', 1100, fx.color);
        this.kick();
        return;
      }
      case 'mega': {
        playSfx('mega');
        if (!visual) return;
        const color = this.hooks.color('crest-3');
        const at = this.hooks.anchor(ev.to);
        this.overs.push({ kind: 'wash', color: '#ffffff', alpha: 0.5, born: now, life: 260 });
        this.overs.push({ kind: 'wash', color, alpha: 0.3, born: now + 200, life: 600 });
        if (at) {
          this.overs.push({ kind: 'flash', x: at.x, y: at.y, r: 120, color: '#ffffff', born: now, life: 380 });
          this.burst(at, { color, light: '#ffd1ff', glyph: 'star' }, 24, [100, 240], 760, now + 120);
          this.burst(at, { color: this.hooks.color('poke-blue'), light: '#d8e4ff', glyph: 'spark' }, 10, [160, 300], 500, now + 160);
        }
        this.hooks.spriteClass(ev.to, 'fx-glow', 1100, color);
        this.kick();
        return;
      }
      case 'zpower': {
        this.zNext[ev.to] = true;
        playSfx('zpower');
        if (!visual) return;
        const gold = this.hooks.color('poke-yellow');
        const at = this.hooks.anchor(ev.to);
        this.overs.push({ kind: 'wash', color: '#000000', alpha: 0.45, born: now, life: 900 });
        if (at) {
          this.aura(at, { color: gold, light: '#fff6c0', glyph: 'star' }, 1.4, now);
          this.overs.push({ kind: 'ring', x: at.x, y: at.y, r0: 90, r1: 20, color: gold, born: now, life: 600 });
        }
        this.hooks.spriteClass(ev.to, 'fx-glow', 1000, gold);
        this.kick();
        return;
      }
      case 'faint': {
        playCry(ev.species);
        playSfx('faint', 180);
        if (!visual) return;
        const at = this.hooks.anchor(ev.to);
        if (at) {
          for (let i = 0; i < 10; i++) {
            this.spawn({
              glyph: 'dot', color: '#c9cfdb', light: '#ffffff',
              x: at.x + rnd(-40, 40), y: at.y + rnd(0, 40), vx: rnd(-30, 30), vy: rnd(-60, -20), g: -20, drag: 0.9,
              size: rnd(6, 12), rot: 0, spin: 0, born: now + rnd(0, 200), life: 600, fade: 'out',
            });
          }
        }
        this.kick();
        return;
      }
      case 'switch': {
        playCry(ev.species);
        if (!visual) return;
        const at = this.hooks.anchor(ev.to);
        if (at) {
          this.overs.push({ kind: 'flash', x: at.x, y: at.y, r: 50, color: '#ffffff', born: now, life: 220 });
          this.burst(at, { color: '#ffffff', light: '#ffffff', glyph: 'spark' }, 12, [110, 220], 400, now);
        }
        this.kick();
        return;
      }
      case 'weather': {
        playSfx('weather');
        if (visual) this.fieldWide(this.palette(ev.type), 36, 0.18, now);
        this.kick();
        return;
      }
      case 'terrain': {
        playSfx('weather');
        if (!visual) return;
        const fx = this.palette(ev.type);
        this.overs.push({ kind: 'wash', color: fx.color, alpha: 0.2, born: now, life: 700 });
        for (let i = 0; i < 24; i++) {
          this.spawn({
            glyph: fx.glyph, color: fx.color, light: fx.light,
            x: rnd(0, this.w), y: rnd(this.h * 0.55, this.h), vx: rnd(-10, 10), vy: rnd(-80, -40), g: 0, drag: 1,
            size: rnd(5, 9), rot: rnd(0, TAU), spin: rnd(-2, 2), born: now + rnd(0, 400), life: 800, fade: 'inout',
          });
        }
        this.kick();
        return;
      }
      case 'volatile': {
        playSfx(ev.on ? 'status' : 'chip');
        if (!visual) return;
        this.volatile(ev.to, ev.name, ev.on, ev.from, now);
        this.kick();
        return;
      }
      case 'side': {
        playSfx(ev.rises ? 'screen' : 'hazard');
        if (!visual) return;
        const placed = FIELD_LOOKS[ev.condition];
        if (placed && (placed.style === 'rocks' || placed.style === 'spikes' || placed.style === 'toxic' || placed.style === 'web')) {
          this.placeHazard(ev.to, ev.condition, placed.style, now);
          this.kick();
          return;
        }
        const at = this.hooks.anchor(ev.to) ?? this.sideFallback(ev.to);
        const fx = this.palette(ev.type);
        if (ev.rises) this.overs.push({ kind: 'flash', x: at.x, y: at.y, r: 110, color: fx.light, born: now, life: 420 });
        for (let i = 0; i < 14; i++) {
          const x = at.x + rnd(-70, 70);
          if (ev.rises) {
            this.spawn({
              glyph: fx.glyph, color: fx.color, light: fx.light, x, y: at.y + rnd(20, 60), vx: 0, vy: rnd(-90, -50), g: 0, drag: 1,
              size: rnd(6, 9), rot: rnd(0, TAU), spin: rnd(-2, 2), born: now + rnd(0, 300), life: 700, fade: 'inout',
            });
          } else {
            this.spawn({
              glyph: fx.glyph, color: fx.color, light: fx.light, x, y: 0, vx: 0, vy: 0, g: 0, drag: 1,
              path: { x0: x, y0: at.y - 140, x1: x + rnd(-10, 10), y1: at.y + rnd(20, 50), arc: 0 },
              size: rnd(6, 9), rot: rnd(0, TAU), spin: rnd(-3, 3), born: now + rnd(0, 320), life: 480, fade: 'out',
            });
          }
        }
        this.kick();
        return;
      }
    }
  }

  // ---------------------------------------------------------------- shape templates

  private attack(from: Side, to: Side, shape: FxShape, fx: Palette, scale: number, now: number): void {
    const a = this.hooks.anchor(from) ?? this.sideFallback(from);
    const b = this.hooks.anchor(to) ?? this.sideFallback(to);
    switch (shape) {
      case 'contact':
        for (let i = 0; i < 2; i++) {
          this.overs.push({ kind: 'slash', x: b.x + rnd(-12, 12), y: b.y + rnd(-12, 12), angle: rnd(0, Math.PI), len: 130 * scale, color: fx.color, born: now + i * 80, life: 260 });
        }
        this.burst(b, fx, Math.round(16 * scale), [170, 320], 440, now + 60);
        break;
      case 'projectile': {
        const n = Math.round(6 * scale + 1);
        for (let i = 0; i < n; i++) {
          this.spawn({
            glyph: fx.glyph, color: fx.color, light: fx.light, x: a.x, y: a.y, vx: 0, vy: 0, g: 0, drag: 1,
            path: { x0: a.x + rnd(-16, 16), y0: a.y + rnd(-16, 16), x1: b.x + rnd(-12, 12), y1: b.y + rnd(-12, 12), arc: rnd(-70, 70) },
            size: rnd(11, 17) * scale, rot: 0, spin: rnd(-6, 6), born: now + i * 40, life: 320, trail: true, fade: 'none',
          });
        }
        break;
      }
      case 'beam': {
        this.overs.push({ kind: 'beam', x0: a.x, y0: a.y, x1: b.x, y1: b.y, color: fx.color, light: fx.light, width: 22 * scale, born: now, life: 480 });
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        for (let i = 0; i < 14; i++) {
          const t = rnd(0.1, 0.95);
          const side = Math.random() < 0.5 ? -1 : 1;
          this.spawn({
            glyph: fx.glyph, color: fx.color, light: fx.light,
            x: a.x + dx * t, y: a.y + dy * t,
            vx: nx * side * rnd(30, 70) + (dx / len) * 60, vy: ny * side * rnd(30, 70) + (dy / len) * 60, g: 0, drag: 0.9,
            size: rnd(8, 12) * scale, rot: rnd(0, TAU), spin: rnd(-4, 4), born: now + rnd(60, 360), life: 320, fade: 'out',
          });
        }
        break;
      }
      case 'self':
        this.aura(a, fx, scale, now);
        break;
      case 'status':
        this.swirl(b, fx, scale, now);
        break;
      case 'field':
        this.fieldWide(fx, Math.round(30 * scale), 0.22, now);
        if (fx.glyph === 'rock') this.hooks.shake(false);
        break;
    }
    this.kick();
  }

  /** A hazard dropping onto its side's ground, piece by piece, where the persistent layer then draws it. */
  private placeHazard(side: Side, condition: string, style: string, now: number): void {
    const fx = this.palette(FIELD_LOOKS[condition]!.type);
    const layer = style === 'spikes' || style === 'toxic' ? this.field.layers(side, condition) + 1 : 1;
    const glyph: Glyph = style === 'rocks' ? 'rock' : style === 'spikes' ? 'shard' : style === 'toxic' ? 'bubble' : 'dot';
    this.field.hazardSpots(side, condition, layer).forEach((p, i) => {
      const at = now + i * 60;
      this.spawn({
        glyph, color: fx.color, light: fx.light, x: p.x, y: p.y - 170, vx: 0, vy: 0, g: 0, drag: 1,
        path: { x0: p.x + rnd(-14, 14), y0: p.y - 170, x1: p.x, y1: p.y - 8, arc: 0 },
        size: rnd(10, 14), rot: rnd(0, TAU), spin: style === 'web' ? 0 : rnd(-5, 5), born: at, life: 460, fade: 'out',
      });
      this.overs.push({ kind: 'ring', x: p.x, y: p.y, r0: 4, r1: style === 'web' ? 60 : 24, color: fx.light, born: at + 380, life: 340 });
      this.burst({ x: p.x, y: p.y - 6 }, { ...fx, glyph: 'dot' }, 4, [40, 90], 320, at + 400);
    });
  }

  /** A Substitute, Leech Seed, Taunt… beginning or ending on a mon; the persistent marker fades in or out beside it. */
  private volatile(side: Side, name: string, on: boolean, from: Side | undefined, now: number): void {
    const look = FIELD_LOOKS[name];
    if (!look) return;
    const fx = this.palette(look.type);
    if (name === 'Substitute') {
      const d = this.field.dollSpot(side);
      const at = { x: d.x, y: d.y - d.s * 0.45 };
      this.overs.push({ kind: 'flash', x: at.x, y: at.y, r: d.s * 1.1, color: on ? fx.light : '#ffffff', born: now, life: on ? 360 : 260 });
      this.burst(at, { color: fx.color, light: fx.light, glyph: on ? 'dot' : 'star' }, on ? 12 : 16, on ? [60, 150] : [140, 280], on ? 460 : 560, now);
      if (!on) this.hooks.spriteClass(side, 'fx-glow', 500, fx.light);
      return;
    }
    const feet = this.field.feet(side);
    if (name === 'Leech Seed' && on) {
      const a = this.hooks.anchor(from ?? (side === 'p1' ? 'p2' : 'p1')) ?? this.sideFallback(from ?? 'p2');
      for (let i = 0; i < 3; i++) {
        this.spawn({
          glyph: 'leaf', color: fx.color, light: fx.light, x: a.x, y: a.y, vx: 0, vy: 0, g: 0, drag: 1,
          path: { x0: a.x + rnd(-14, 14), y0: a.y + rnd(-14, 14), x1: feet.x + rnd(-24, 24), y1: feet.y - 6, arc: rnd(-60, 60) },
          size: rnd(9, 12), rot: 0, spin: rnd(-6, 6), born: now + i * 90, life: 420, fade: 'none',
        });
      }
      this.burst({ x: feet.x, y: feet.y - 8 }, fx, 10, [60, 150], 520, now + 400);
      return;
    }
    this.overs.push({ kind: 'ring', x: feet.x, y: feet.y - 14, r0: on ? 8 : 40, r1: on ? 44 : 10, color: fx.color, born: now, life: 420 });
    this.burst({ x: feet.x, y: feet.y - 14 }, fx, on ? 8 : 5, [40, 110], 480, now);
  }

  /** Particles flying out from a point. */
  private burst(at: Pt, fx: Palette, n: number, speed: [number, number], life: number, born: number): void {
    for (let i = 0; i < n; i++) {
      const ang = rnd(0, TAU);
      const v = rnd(speed[0], speed[1]);
      this.spawn({
        glyph: fx.glyph, color: fx.color, light: fx.light,
        x: at.x + rnd(-8, 8), y: at.y + rnd(-8, 8), vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, g: 160, drag: 0.12,
        size: rnd(9, 16), rot: ang, spin: rnd(-6, 6), born: born + rnd(0, 40), life: life * rnd(0.7, 1.1), fade: 'out',
      });
    }
  }

  /** Particles rising around a point (self-targeting moves, heals, Z-Power). */
  private aura(at: Pt, fx: Palette, scale: number, now: number): void {
    const n = Math.round(14 * scale);
    for (let i = 0; i < n; i++) {
      const ang = rnd(0, TAU);
      const r = rnd(34, 66) * scale;
      this.spawn({
        glyph: fx.glyph, color: fx.color, light: fx.light,
        x: at.x + Math.cos(ang) * r, y: at.y + Math.sin(ang) * r * 0.6 + 24, vx: rnd(-15, 15), vy: rnd(-130, -80), g: 0, drag: 1,
        size: rnd(9, 14) * scale, rot: rnd(0, TAU), spin: rnd(-3, 3), born: now + rnd(0, 220), life: 620, fade: 'inout',
      });
    }
    this.overs.push({ kind: 'ring', x: at.x, y: at.y + 10, r0: 14, r1: 88 * scale, color: fx.color, born: now, life: 520 });
  }

  /** Particles spiralling in on a point (status moves). */
  private swirl(at: Pt, fx: Palette, scale: number, now: number): void {
    const n = Math.round(12 * scale);
    for (let i = 0; i < n; i++) {
      const ang = rnd(0, TAU);
      const r = rnd(80, 110) * scale;
      this.spawn({
        glyph: fx.glyph, color: fx.color, light: fx.light, x: at.x, y: at.y, vx: 0, vy: 0, g: 0, drag: 1,
        path: { x0: at.x + Math.cos(ang) * r, y0: at.y + Math.sin(ang) * r, x1: at.x + rnd(-10, 10), y1: at.y + rnd(-10, 10), arc: rnd(25, 50) },
        size: rnd(9, 13) * scale, rot: ang, spin: rnd(-4, 4), born: now + rnd(0, 260), life: 480, fade: 'inout',
      });
    }
  }

  /** A tint over the whole field plus particles moving the way the glyph suggests (rain falls, flames rise…). */
  private fieldWide(fx: Palette, n: number, alpha: number, now: number): void {
    this.overs.push({ kind: 'wash', color: fx.color, alpha, born: now, life: 650 });
    for (let i = 0; i < n; i++) {
      const m = fieldMotion(fx.glyph);
      const falls = m.vy > 0;
      this.spawn({
        glyph: fx.glyph, color: fx.color, light: fx.light,
        x: rnd(-20, this.w + 20), y: falls ? rnd(-40, this.h * 0.4) : rnd(this.h * 0.5, this.h + 20),
        vx: m.vx * rnd(0.7, 1.3), vy: m.vy * rnd(0.7, 1.3), g: 0, drag: 1,
        size: rnd(8, 14), rot: m.rot ?? rnd(0, TAU), spin: m.spin, born: now + rnd(0, 380), life: m.life, fade: m.vy === 0 ? 'inout' : 'out',
      });
    }
  }

  // ---------------------------------------------------------------- plumbing

  private palette(type: string): Palette {
    let p = this.palettes.get(type);
    if (!p) {
      const t = TYPE_FX[type] ?? TYPE_FX.Normal!;
      p = { color: this.hooks.color(t.token), light: t.light, glyph: t.glyph };
      this.palettes.set(type, p);
    }
    return p;
  }

  /** Where a side's sprite usually stands, for effects fired while nothing is on the field there. */
  private sideFallback(side: Side): Pt {
    return side === 'p2' ? { x: this.w * 0.76, y: this.h * 0.32 } : { x: this.w * 0.24, y: this.h * 0.72 };
  }

  private spawn(p: Particle): void {
    if (this.parts.length >= MAX_PARTICLES) this.parts.shift();
    this.parts.push(p);
  }

  private kick(): void {
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  private readonly tick = (): void => {
    this.raf = 0;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.step(now, dt);
    this.draw(now, dt);
    if (this.parts.length || this.overs.length || this.field.animating || now < this.settleUntil) this.raf = requestAnimationFrame(this.tick);
  };

  private step(now: number, dt: number): void {
    const trails: Particle[] = [];
    this.parts = this.parts.filter((p) => {
      const t = (now - p.born) / p.life;
      if (t >= 1) return false;
      if (t < 0) return true;
      if (p.path) {
        const e = easeOut(t);
        const dx = p.path.x1 - p.path.x0;
        const dy = p.path.y1 - p.path.y0;
        const len = Math.hypot(dx, dy) || 1;
        const bow = Math.sin(Math.PI * t) * p.path.arc;
        p.x = p.path.x0 + dx * e + (-dy / len) * bow;
        p.y = p.path.y0 + dy * e + (dx / len) * bow;
      } else {
        p.vy += p.g * dt;
        const keep = Math.pow(p.drag, dt);
        p.vx *= keep;
        p.vy *= keep;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      p.rot += p.spin * dt;
      if (p.trail && Math.random() < 0.6) {
        trails.push({ glyph: 'dot', color: p.color, light: p.light, x: p.x, y: p.y, vx: 0, vy: 0, g: 0, drag: 1, size: p.size * 0.35, rot: 0, spin: 0, born: now, life: 240, fade: 'out' });
      }
      return true;
    });
    for (const t of trails) this.spawn(t);
    this.overs = this.overs.filter((o) => now - o.born < o.life);
    if (now - this.geoAt > 150) { this.geoAt = now; this.field.refreshGeometry(); }
    this.field.step(now, dt);
  }

  private draw(now: number, dt: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.w, this.h);
    this.field.draw(ctx, now, dt);
    for (const o of this.overs) {
      const t = (now - o.born) / o.life;
      if (t < 0) continue;
      drawOverlay(ctx, o, t, this.w, this.h);
    }
    for (const p of this.parts) {
      const t = (now - p.born) / p.life;
      if (t < 0) continue;
      const alpha = p.fade === 'out' ? 1 - t : p.fade === 'inout' ? Math.sin(Math.PI * t) : 1;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      drawGlyph(ctx, p.glyph, p.size, p.color, p.light);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
}

/** How field-wide particles of a glyph move: rain falls, flames rise, sand blows, bolts blink in place. */
function fieldMotion(glyph: Glyph): { vx: number; vy: number; life: number; spin: number; rot?: number } {
  switch (glyph) {
    case 'drop': return { vx: -90, vy: 420, life: 700, spin: 0, rot: -0.2 };
    case 'shard': return { vx: 20, vy: 70, life: 1100, spin: 1.5 };
    case 'leaf': return { vx: 40, vy: 60, life: 1200, spin: 3 };
    case 'rock': return { vx: 320, vy: 20, life: 800, spin: 4 };
    case 'bolt': return { vx: 0, vy: 0, life: 260, spin: 0 };
    case 'flame': return { vx: 0, vy: -110, life: 800, spin: 0 };
    case 'ring': return { vx: 0, vy: 0, life: 700, spin: 0 };
    default: return { vx: 0, vy: -80, life: 800, spin: 2 };
  }
}

function drawOverlay(ctx: CanvasRenderingContext2D, o: Overlay, t: number, w: number, h: number): void {
  ctx.save();
  switch (o.kind) {
    case 'wash':
      ctx.globalAlpha = o.alpha * (1 - t);
      ctx.fillStyle = o.color;
      ctx.fillRect(0, 0, w, h);
      break;
    case 'beam': {
      const grow = Math.min(1, t / 0.22);
      const x1 = o.x0 + (o.x1 - o.x0) * easeOut(grow);
      const y1 = o.y0 + (o.y1 - o.y0) * easeOut(grow);
      ctx.globalAlpha = t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35;
      ctx.lineCap = 'round';
      ctx.shadowColor = o.color;
      ctx.shadowBlur = 22;
      ctx.strokeStyle = o.color;
      ctx.lineWidth = o.width * (0.8 + 0.2 * Math.sin(t * 40));
      ctx.beginPath();
      ctx.moveTo(o.x0, o.y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = o.light;
      ctx.lineWidth = o.width * 0.38;
      ctx.stroke();
      break;
    }
    case 'ring': {
      const r = o.r0 + (o.r1 - o.r0) * easeOut(t);
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = o.color;
      ctx.lineWidth = 5;
      ctx.shadowColor = o.color;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(o.x, o.y, Math.max(0, r), 0, TAU);
      ctx.stroke();
      break;
    }
    case 'flash': {
      const r = o.r * (0.6 + 0.4 * t);
      const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, r);
      g.addColorStop(0, o.color);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(o.x, o.y, r, 0, TAU);
      ctx.fill();
      break;
    }
    case 'slash': {
      const len = o.len * Math.min(1, t / 0.3);
      ctx.globalAlpha = 1 - t;
      // White core with the type color as its glow, so a slash reads on sky and grass alike.
      ctx.translate(o.x, o.y);
      ctx.rotate(o.angle);
      ctx.strokeStyle = '#ffffff';
      ctx.lineCap = 'round';
      ctx.shadowColor = o.color;
      ctx.shadowBlur = 16;
      ctx.lineWidth = 7 * (1 - t) + 1.5;
      ctx.beginPath();
      ctx.moveTo(-len / 2, 0);
      ctx.lineTo(len / 2, 0);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}
