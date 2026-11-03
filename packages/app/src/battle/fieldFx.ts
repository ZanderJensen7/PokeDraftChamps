// Persistent field effects, data side: what stays on the field for as long as it lasts (weather, terrain, Trick
// Room, screens, Tailwind, hazards, and the volatile conditions on the active mons). `fieldState` reads the battle
// view, not protocol lines, so a jump in a replay or a reload lands on the right picture. The look of every effect
// is one row of `FIELD_LOOKS`; the canvas (`fxCanvas.ts`) owns how each style is drawn. Pure: no DOM, no React.
import { activeMon, type FieldView, type Side } from './battleView';
import type { Glyph } from './vfx';

/** Which drawer paints an effect. */
export type FieldStyle =
  | 'sun' | 'rain' | 'sand' | 'snow' | 'hail' | 'wind' // weather: a tint plus ambient particles
  | 'glow' // terrain: a glow on the floor under both platforms
  | 'invert' // Trick Room: a mild tint, a room outline and rings that close in
  | 'band' // screens: a shimmering wall around the owning side
  | 'gust' // Tailwind: streaks blowing across the owning side
  | 'rocks' | 'spikes' | 'toxic' | 'web' // hazards: on the ground of the side they are on
  | 'doll' | 'seed' | 'orbit' | 'badge'; // on the active mon

/** Where in the stack an effect is drawn, back to front. */
export type FieldLayer = 'sky' | 'floor' | 'side' | 'mon';

export interface FieldLook {
  style: FieldStyle;
  /** Type whose palette (`TYPE_FX`) the effect borrows; the canvas resolves its theme color. */
  type: string;
  layer: FieldLayer;
  /** How strong the tint / glow is, 0-1 (1 is the usual strength). */
  strength: number;
  /** Fade-in waits this long (ms), so the one-shot that sets the effect lands first. */
  delay?: number;
  /** A badge's symbol. */
  glyph?: Glyph;
}

const weather = (style: FieldStyle, type: string, strength = 1): FieldLook => ({ style, type, layer: 'sky', strength });
const terrain = (type: string): FieldLook => ({ style: 'glow', type, layer: 'floor', strength: 1 });
const screen = (type: string): FieldLook => ({ style: 'band', type, layer: 'side', strength: 1, delay: 120 });
const hazard = (style: FieldStyle, type: string): FieldLook => ({ style, type, layer: 'floor', strength: 1, delay: 320 });
const badge = (type: string, glyph: Glyph): FieldLook => ({ style: 'badge', type, layer: 'mon', strength: 1, glyph });

/** One row per effect: its look. Keys are the protocol's condition names (weather by id, the rest by move name). */
export const FIELD_LOOKS: Readonly<Record<string, FieldLook>> = {
  SunnyDay: weather('sun', 'Fire'),
  DesolateLand: weather('sun', 'Fire', 1.6),
  RainDance: weather('rain', 'Water'),
  PrimordialSea: weather('rain', 'Water', 1.6),
  Sandstorm: weather('sand', 'Ground'),
  Snow: weather('snow', 'Ice'),
  Snowscape: weather('snow', 'Ice'),
  Hail: weather('hail', 'Ice'),
  DeltaStream: weather('wind', 'Flying'),

  'Electric Terrain': terrain('Electric'),
  'Grassy Terrain': terrain('Grass'),
  'Misty Terrain': terrain('Fairy'),
  'Psychic Terrain': terrain('Psychic'),
  'Trick Room': { style: 'invert', type: 'Psychic', layer: 'sky', strength: 1 },

  Reflect: screen('Psychic'),
  'Light Screen': screen('Electric'),
  'Aurora Veil': screen('Ice'),
  Tailwind: { style: 'gust', type: 'Flying', layer: 'side', strength: 1 },

  'Stealth Rock': hazard('rocks', 'Rock'),
  Spikes: hazard('spikes', 'Steel'),
  'Toxic Spikes': hazard('toxic', 'Poison'),
  'Sticky Web': hazard('web', 'Bug'),

  Substitute: { style: 'doll', type: 'Normal', layer: 'mon', strength: 1, delay: 160 },
  'Leech Seed': { style: 'seed', type: 'Grass', layer: 'mon', strength: 1, delay: 380 },
  confusion: { style: 'orbit', type: 'Electric', layer: 'mon', strength: 1 },
  Taunt: badge('Fighting', 'spark'),
  Encore: badge('Fairy', 'ring'),
  Torment: badge('Dark', 'slash'),
  Yawn: badge('Water', 'bubble'),
  Curse: badge('Ghost', 'flame'),
  Ingrain: badge('Grass', 'leaf'),
  'Aqua Ring': badge('Water', 'ring'),
  Attract: badge('Fairy', 'heart'),
};

export const SCREENS = ['Reflect', 'Light Screen', 'Aurora Veil'] as const;
export type Screen = (typeof SCREENS)[number];

/** Volatile (protocol name) -> the key it has in `MonFx`. */
export const MON_FX_KEYS = {
  Substitute: 'substitute', 'Leech Seed': 'leechSeed', confusion: 'confused', Taunt: 'taunt', Encore: 'encore',
  Torment: 'torment', Yawn: 'yawn', Curse: 'curse', Ingrain: 'ingrain', 'Aqua Ring': 'aquaRing', Attract: 'attract',
} as const;
export type MonFxKey = (typeof MON_FX_KEYS)[keyof typeof MON_FX_KEYS];
export type MonFx = Record<MonFxKey, boolean>;

export interface SideFx {
  screens: Screen[];
  tailwind: boolean;
  hazards: { rocks: boolean; spikes: number; toxicSpikes: number; web: boolean };
}

/** Everything persistent on the field. */
export interface FieldFx {
  /** Weather id (a key of `FIELD_LOOKS`) or null. */
  weather: string | null;
  /** Terrain name or null. */
  terrain: string | null;
  trickRoom: boolean;
  sides: Record<Side, SideFx>;
  /** The active mon's volatiles (all false while nothing is out or it has fainted). */
  mons: Record<Side, MonFx>;
}

export const MAX_SPIKES = 3;
export const MAX_TOXIC_SPIKES = 2;

function monFx(view: FieldView, side: Side): MonFx {
  const fx = Object.fromEntries(Object.values(MON_FX_KEYS).map((k) => [k, false])) as MonFx;
  const mon = activeMon(view, side);
  if (!mon || mon.fainted) return fx;
  for (const v of mon.volatiles) {
    const key = (MON_FX_KEYS as Record<string, MonFxKey | undefined>)[v];
    if (key) fx[key] = true;
  }
  return fx;
}

function sideFx(view: FieldView, side: Side): SideFx {
  const c = view.sides[side].conditions;
  return {
    screens: SCREENS.filter((s) => (c[s] ?? 0) > 0),
    tailwind: (c.Tailwind ?? 0) > 0,
    hazards: {
      rocks: (c['Stealth Rock'] ?? 0) > 0,
      spikes: Math.min(MAX_SPIKES, c.Spikes ?? 0),
      toxicSpikes: Math.min(MAX_TOXIC_SPIKES, c['Toxic Spikes'] ?? 0),
      web: (c['Sticky Web'] ?? 0) > 0,
    },
  };
}

/** The persistent effects the battle view calls for. */
export function fieldState(view: FieldView): FieldFx {
  return {
    weather: view.weather && FIELD_LOOKS[view.weather]?.layer === 'sky' ? view.weather : null,
    terrain: view.fields.find((f) => FIELD_LOOKS[f]?.style === 'glow') ?? null,
    trickRoom: view.fields.includes('Trick Room'),
    sides: { p1: sideFx(view, 'p1'), p2: sideFx(view, 'p2') },
    mons: { p1: monFx(view, 'p1'), p2: monFx(view, 'p2') },
  };
}

/** One thing the canvas can fade in and out: a fixed vocabulary, so the stage allocates its state once. */
export interface FieldSlot {
  id: string;
  /** Key of `FIELD_LOOKS`. */
  look: string;
  side?: Side;
  /** Spikes: which layer this slot draws (1-based). */
  layer?: number;
}

const SIDES: readonly Side[] = ['p1', 'p2'];
const MON_NAMES = Object.keys(MON_FX_KEYS);

/** Every slot, weather first. */
export const FIELD_SLOTS: readonly FieldSlot[] = [
  ...Object.keys(FIELD_LOOKS).filter((k) => FIELD_LOOKS[k]!.layer === 'sky' || FIELD_LOOKS[k]!.style === 'glow').map((k) => ({ id: k, look: k })),
  ...SIDES.flatMap((side) => [
    ...SCREENS.map((s) => ({ id: `${side}:${s}`, look: s, side })),
    { id: `${side}:Tailwind`, look: 'Tailwind', side },
    { id: `${side}:Stealth Rock`, look: 'Stealth Rock', side },
    ...Array.from({ length: MAX_SPIKES }, (_, i) => ({ id: `${side}:Spikes${i + 1}`, look: 'Spikes', side, layer: i + 1 })),
    ...Array.from({ length: MAX_TOXIC_SPIKES }, (_, i) => ({ id: `${side}:Toxic Spikes${i + 1}`, look: 'Toxic Spikes', side, layer: i + 1 })),
    { id: `${side}:Sticky Web`, look: 'Sticky Web', side },
    ...MON_NAMES.map((n) => ({ id: `${side}:mon:${n}`, look: n, side })),
  ]),
];

/** The ids of the slots that should be showing for a field state. */
export function activeSlots(fx: FieldFx): string[] {
  const ids: string[] = [];
  if (fx.weather) ids.push(fx.weather);
  if (fx.terrain) ids.push(fx.terrain);
  if (fx.trickRoom) ids.push('Trick Room');
  for (const side of SIDES) {
    const s = fx.sides[side];
    for (const scr of s.screens) ids.push(`${side}:${scr}`);
    if (s.tailwind) ids.push(`${side}:Tailwind`);
    if (s.hazards.rocks) ids.push(`${side}:Stealth Rock`);
    for (let i = 1; i <= s.hazards.spikes; i++) ids.push(`${side}:Spikes${i}`);
    for (let i = 1; i <= s.hazards.toxicSpikes; i++) ids.push(`${side}:Toxic Spikes${i}`);
    if (s.hazards.web) ids.push(`${side}:Sticky Web`);
    for (const [name, key] of Object.entries(MON_FX_KEYS)) if (fx.mons[side][key]) ids.push(`${side}:mon:${name}`);
  }
  return ids;
}
