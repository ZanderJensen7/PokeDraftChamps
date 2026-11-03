// Attack effects, data side: which effect each protocol line asks for. Pure (no DOM, no React): the
// FxLayer draws the events on a canvas over the field. Every tunable is a table here: the shape a move is
// drawn with (from its dex flags, with a small override table), the glyph + color per type, and the type each
// weather / terrain / hazard / status / chip-damage source borrows its look from. Own code throughout:
// nothing here comes from the Showdown client or PokeRogue (both AGPL).
import { Dex } from '@pkmn/dex';
import { parseDetails, parseIdent, splitLine, TRACKED_VOLATILES, type Side } from './battleView';

const dex = Dex.forGen(9);

/** How an attack is drawn: a slash at the target, something thrown, a beam, an aura on the user, a swirl on the target, or the whole field. */
export type FxShape = 'contact' | 'projectile' | 'beam' | 'self' | 'status' | 'field';

/** Particle glyphs the canvas knows how to draw. */
export type Glyph = 'star' | 'flame' | 'drop' | 'bolt' | 'leaf' | 'shard' | 'ring' | 'rock' | 'slash' | 'dot' | 'arrow' | 'bubble' | 'spark' | 'heart';

export interface TypeFx {
  /** Theme color token (`--color-<token>`), resolved by the canvas at draw time. */
  token: string;
  /** Light tint for highlights and cores. */
  light: string;
  glyph: Glyph;
}

/** One row per type: the color its particles use and the glyph they are drawn with. */
export const TYPE_FX: Record<string, TypeFx> = {
  Normal: { token: 'type-normal', light: '#fff7dc', glyph: 'star' },
  Fire: { token: 'type-fire', light: '#ffe2a8', glyph: 'flame' },
  Water: { token: 'type-water', light: '#d6e6ff', glyph: 'drop' },
  Electric: { token: 'type-electric', light: '#fffbd0', glyph: 'bolt' },
  Grass: { token: 'type-grass', light: '#dcf7c4', glyph: 'leaf' },
  Ice: { token: 'type-ice', light: '#f0ffff', glyph: 'shard' },
  Fighting: { token: 'type-fighting', light: '#ffd1c8', glyph: 'spark' },
  Poison: { token: 'type-poison', light: '#f1c8f0', glyph: 'bubble' },
  Ground: { token: 'type-ground', light: '#fff0c4', glyph: 'rock' },
  Flying: { token: 'type-flying', light: '#ece6ff', glyph: 'slash' },
  Psychic: { token: 'type-psychic', light: '#ffd9e6', glyph: 'ring' },
  Bug: { token: 'type-bug', light: '#eef7b0', glyph: 'dot' },
  Rock: { token: 'type-rock', light: '#f3e9b0', glyph: 'rock' },
  Ghost: { token: 'type-ghost', light: '#e2d3ff', glyph: 'flame' },
  Dragon: { token: 'type-dragon', light: '#d9c8ff', glyph: 'flame' },
  Dark: { token: 'type-dark', light: '#d9c9bd', glyph: 'slash' },
  Steel: { token: 'type-steel', light: '#ffffff', glyph: 'shard' },
  Fairy: { token: 'type-fairy', light: '#ffe4f1', glyph: 'star' },
  Stellar: { token: 'type-stellar', light: '#d8fff8', glyph: 'star' },
};

/** Moves whose dex flags give the wrong shape. Everything else follows `moveShape`'s rules. */
export const MOVE_SHAPE_OVERRIDES: Record<string, FxShape> = {
  Psychic: 'beam',
  Psyshock: 'projectile',
  Scald: 'beam',
  Thunder: 'beam',
  Overheat: 'beam',
  'Fiery Dance': 'beam',
  'Shadow Ball': 'projectile',
  'Focus Blast': 'projectile',
  'Energy Ball': 'projectile',
  'Sludge Bomb': 'projectile',
  'Stone Edge': 'projectile',
  'Rock Slide': 'field',
  'Power Gem': 'beam',
  'Earth Power': 'field',
  Explosion: 'field',
  'Self-Destruct': 'field',
  'Misty Explosion': 'field',
  'Draining Kiss': 'contact',
  'Dragon Darts': 'projectile',
  'Rapid Spin': 'self',
  Defog: 'field',
  Haze: 'field',
  Yawn: 'status',
};

const SPREAD = new Set(['allAdjacent', 'allAdjacentFoes', 'all', 'foeSide', 'allySide', 'allyTeam']);
const BEAMY = /Beam|Ray|Laser|Cannon|Pulse|Blast|Flare|Flamethrower|Hydro|Thunderbolt|Energy|Breath|Burn Up|Freeze-Dry|Wave|Voice|Buzz|Roar|Screech|Scream|Hyper|Spray|Torrent|Steam|Shock|Geyser|Eruption|Overdrive/;

/** The shape a move is drawn with, from its category, target and flags. */
export function moveShape(name: string): FxShape {
  const o = MOVE_SHAPE_OVERRIDES[name];
  if (o) return o;
  const m = dex.moves.get(name);
  if (!m.exists) return 'projectile';
  if (m.category === 'Status') {
    if (m.target === 'self' || m.target === 'adjacentAllyOrSelf') return 'self';
    if (SPREAD.has(m.target)) return 'field';
    return 'status';
  }
  if (m.flags.contact) return 'contact';
  if (SPREAD.has(m.target)) return 'field';
  if (m.flags.bullet) return 'projectile';
  if (m.flags.pulse || m.flags.sound || BEAMY.test(m.name)) return 'beam';
  return 'projectile';
}

/** Type of a move by display name (Z-moves included); Normal when unknown. */
export function moveType(name: string): string {
  const m = dex.moves.get(name);
  return m.exists ? m.type : 'Normal';
}

/** Which type's look a weather borrows. */
export const WEATHER_FX: Record<string, string> = {
  RainDance: 'Water', PrimordialSea: 'Water', SunnyDay: 'Fire', DesolateLand: 'Fire',
  Sandstorm: 'Ground', Snow: 'Ice', Snowscape: 'Ice', Hail: 'Ice', DeltaStream: 'Flying',
};

/** Which type's look a terrain / room borrows. */
export const FIELD_FX: Record<string, string> = {
  'Electric Terrain': 'Electric', 'Grassy Terrain': 'Grass', 'Misty Terrain': 'Fairy', 'Psychic Terrain': 'Psychic',
  'Trick Room': 'Psychic', Gravity: 'Normal', 'Magic Room': 'Psychic', 'Wonder Room': 'Psychic',
};

/** Which type's look a side condition borrows (hazards fall onto the side, screens rise around it). */
export const SIDE_FX: Record<string, { type: string; rises: boolean }> = {
  'Stealth Rock': { type: 'Rock', rises: false }, Spikes: { type: 'Ground', rises: false },
  'Toxic Spikes': { type: 'Poison', rises: false }, 'Sticky Web': { type: 'Bug', rises: false },
  Reflect: { type: 'Psychic', rises: true }, 'Light Screen': { type: 'Electric', rises: true },
  'Aurora Veil': { type: 'Ice', rises: true }, Tailwind: { type: 'Flying', rises: true },
  Safeguard: { type: 'Normal', rises: true }, Mist: { type: 'Ice', rises: true },
};

/** Which type's look a status condition borrows. */
export const STATUS_FX: Record<string, string> = {
  brn: 'Fire', par: 'Electric', psn: 'Poison', tox: 'Poison', slp: 'Normal', frz: 'Ice', confusion: 'Psychic',
};

/** Which type's look residual ("[from]") damage borrows. */
export const CHIP_FX: Record<string, string> = {
  brn: 'Fire', psn: 'Poison', tox: 'Poison', 'Stealth Rock': 'Rock', Spikes: 'Ground', Sandstorm: 'Ground',
  Hail: 'Ice', Snow: 'Ice', 'Life Orb': 'Ghost', Recoil: 'Normal', recoil: 'Normal', confusion: 'Psychic',
  'Leech Seed': 'Grass', 'Salt Cure': 'Rock', Curse: 'Ghost', Nightmare: 'Ghost', 'Rocky Helmet': 'Rock',
  'Rough Skin': 'Normal', 'Iron Barbs': 'Steel', 'Bad Dreams': 'Ghost', 'Aftermath': 'Fire',
};

const PROTECTS = new Set(['Protect', 'Detect', "King's Shield", 'Spiky Shield', 'Baneful Bunker', 'Silk Trap', 'Burning Bulwark', 'Obstruct', 'Endure', 'Max Guard']);

export type FxEvent =
  | { kind: 'attack'; from: Side; to: Side; type: string; shape: FxShape; move: string }
  /** Crit / effectiveness lines come before the damage line: they color the next hit on that side. */
  | { kind: 'hitmod'; to: Side; crit?: boolean; eff?: 'super' | 'resisted' }
  /** Damage from the last attack (or a Substitute taking it). */
  | { kind: 'hit'; to: Side }
  /** Residual damage: burn, hazards, Life Orb, recoil… */
  | { kind: 'chip'; to: Side; type: string }
  | { kind: 'heal'; to: Side }
  | { kind: 'status'; to: Side; type: string }
  | { kind: 'boost'; to: Side; up: boolean; stages: number }
  | { kind: 'shield'; to: Side }
  | { kind: 'tera'; to: Side; type: string }
  | { kind: 'mega'; to: Side }
  | { kind: 'zpower'; to: Side }
  | { kind: 'faint'; to: Side; species: string }
  | { kind: 'switch'; to: Side; species: string }
  | { kind: 'weather'; type: string; weather: string }
  | { kind: 'terrain'; type: string }
  | { kind: 'side'; to: Side; type: string; rises: boolean; condition: string }
  /** A tracked volatile (Substitute, Leech Seed, Taunt…) beginning or ending on a mon; `from` is who set it, when that is known. */
  | { kind: 'volatile'; to: Side; name: string; on: boolean; from?: Side };

const other = (s: Side): Side => (s === 'p1' ? 'p2' : 'p1');
const strip = (effect: string | undefined): string => (effect ?? '').replace(/^(move|ability|item):\s*/, '');
const tag = (parts: string[], key: string): string | undefined => {
  const p = parts.find((x) => x.startsWith(`[${key}]`));
  return p ? p.slice(key.length + 2).trim() : undefined;
};

/** The effect one protocol line asks for, or null. `species` resolves an ident to the species on the field (for cries). */
export function fxEvent(line: string, species: (ident: string | undefined) => string | undefined): FxEvent | null {
  const parts = splitLine(line);
  const cmd = parts[0];
  if (!cmd || parts.includes('[silent]')) return null;
  const id = parseIdent(parts[1]);
  const side = id?.side;
  switch (cmd) {
    case 'move': case '-anim': {
      if (!side || parts.includes('[still]')) return null;
      const move = parts[2] ?? '';
      const shape = moveShape(move);
      const target = parseIdent(parts[3])?.side;
      const to = shape === 'self' ? side : target ?? other(side);
      return { kind: 'attack', from: side, to, type: moveType(move), shape, move };
    }
    case '-crit': return side ? { kind: 'hitmod', to: side, crit: true } : null;
    case '-supereffective': return side ? { kind: 'hitmod', to: side, eff: 'super' } : null;
    case '-resisted': return side ? { kind: 'hitmod', to: side, eff: 'resisted' } : null;
    case '-damage': {
      if (!side) return null;
      const from = tag(parts, 'from');
      if (!from) return { kind: 'hit', to: side };
      const type = CHIP_FX[strip(from)];
      return type ? { kind: 'chip', to: side, type } : null;
    }
    case '-heal': return side ? { kind: 'heal', to: side } : null;
    case '-status': {
      const type = STATUS_FX[parts[2] ?? ''];
      return side && type ? { kind: 'status', to: side, type } : null;
    }
    case '-start': case '-end': {
      const name = strip(parts[2]);
      if (side && name !== 'confusion' && TRACKED_VOLATILES.includes(name)) {
        return { kind: 'volatile', to: side, name, on: cmd === '-start', from: name === 'Leech Seed' ? other(side) : undefined };
      }
      const type = cmd === '-start' ? STATUS_FX[name] : undefined;
      return side && type ? { kind: 'status', to: side, type } : null;
    }
    case '-boost': case '-unboost': {
      const n = Number(parts[3]) || 0;
      return side && n > 0 ? { kind: 'boost', to: side, up: cmd === '-boost', stages: n } : null;
    }
    case '-activate': {
      if (!side) return null;
      const e = strip(parts[2]);
      if (PROTECTS.has(e)) return { kind: 'shield', to: side };
      if (e === 'Substitute' && parts.includes('[damage]')) return { kind: 'hit', to: side };
      return null;
    }
    case '-singleturn': return side && PROTECTS.has(strip(parts[2])) ? { kind: 'shield', to: side } : null;
    case '-terastallize': return side && parts[2] ? { kind: 'tera', to: side, type: parts[2] } : null;
    case '-mega': return side ? { kind: 'mega', to: side } : null;
    case '-zpower': return side ? { kind: 'zpower', to: side } : null;
    case 'faint': return side ? { kind: 'faint', to: side, species: species(parts[1]) ?? id.name } : null;
    case 'switch': case 'drag': return side ? { kind: 'switch', to: side, species: parts[2] ? parseDetails(parts[2]).species : id.name } : null;
    case '-weather': {
      const w = parts[1] ?? '';
      if (parts.includes('[upkeep]') || w === 'none') return null;
      const type = WEATHER_FX[w];
      return type ? { kind: 'weather', type, weather: w } : null;
    }
    case '-fieldstart': {
      const type = FIELD_FX[strip(parts[1])];
      return type ? { kind: 'terrain', type } : null;
    }
    case '-sidestart': {
      const s = parts[1]?.slice(0, 2);
      const fx = SIDE_FX[strip(parts[2])];
      return (s === 'p1' || s === 'p2') && fx ? { kind: 'side', to: s, ...fx, condition: strip(parts[2]) } : null;
    }
    default: return null;
  }
}

/** Effects for a batch of lines, in order. */
export function fxEvents(lines: readonly string[], species: (ident: string | undefined) => string | undefined): FxEvent[] {
  const out: FxEvent[] = [];
  for (const line of lines) {
    const e = fxEvent(line, species);
    if (e) out.push(e);
  }
  return out;
}
