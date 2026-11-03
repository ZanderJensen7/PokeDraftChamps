// Human set editing helpers (engine has none). Immutable: always a new RunState.
import { Dex } from '@pkmn/dex';
import { Generations } from '@pkmn/data';
import type { BattleSet, RunState, SpeciesId, StatName, StatsTable } from '@pdc/engine';
import { ALL_TYPES, battleSpeciesId, megaInfo, Z_CRYSTAL_BY_TYPE } from '@pdc/engine';

export const STAT_NAMES: StatName[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
export const STAT_LABEL: Record<StatName, string> = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };
export const EV_TOTAL_CAP = 510;
export const EV_STAT_CAP = 252;

export const dex9 = Dex.forGen(9);
export const gen9 = new Generations(Dex).get(9);

export function updateHumanSet(run: RunState, species: SpeciesId, set: BattleSet): RunState {
  return {
    ...run,
    coaches: run.coaches.map((c) => (c.id === run.humanId ? { ...c, sets: { ...c.sets, [species]: set } } : c)),
  };
}

export const zeroStats = (v = 0): StatsTable => ({ hp: v, atk: v, def: v, spa: v, spd: v, spe: v });

/** The species a set battles as: a Mega pick starts as its base form (it Mega Evolves in battle). */
export const battleSpecies = (species: SpeciesId): SpeciesId => battleSpeciesId(species);

/** The Mega Stone a Mega pick must hold, or null for every other mon. */
export const lockedStone = (species: SpeciesId): string | null => megaInfo(species)?.stone ?? null;

/** The 18 type Z-Crystals a Z captain can hold. */
export const Z_CRYSTALS: string[] = Object.values(Z_CRYSTAL_BY_TYPE);

export const isZCrystal = (item: string): boolean => Z_CRYSTALS.includes(item);

/** The type a Z-Crystal powers ("Firium Z" -> "Fire"). */
export function zCrystalType(item: string): string | null {
  if (!isZCrystal(item)) return null;
  const z = dex9.items.get(item);
  return typeof z.zMoveType === 'string' ? z.zMoveType : null;
}

export function blankSet(species: SpeciesId): BattleSet {
  const sp = dex9.species.get(battleSpecies(species));
  return {
    name: sp.name,
    species: sp.name,
    item: lockedStone(species) ?? '',
    ability: sp.abilities[0] ?? '',
    moves: [],
    nature: 'Serious',
    gender: '',
    evs: zeroStats(),
    ivs: zeroStats(31),
    level: 100,
    teraType: sp.types[0] ?? 'Normal',
  };
}

/** Competitive staples shown first in the item picker. */
export const COMMON_ITEMS: string[] = [
  'Leftovers', 'Life Orb', 'Choice Band', 'Choice Specs', 'Choice Scarf', 'Assault Vest', 'Heavy-Duty Boots', 'Rocky Helmet',
  'Focus Sash', 'Sitrus Berry', 'Lum Berry', 'Loaded Dice', 'Expert Belt', 'Black Sludge', 'Light Clay', 'Air Balloon',
  'Eviolite', 'Booster Energy', 'Covert Cloak', 'Clear Amulet', 'Safety Goggles', 'Weakness Policy', 'Shell Bell',
  'Throat Spray', 'Punching Glove', 'Mystic Water', 'Charcoal', 'Never-Melt Ice', 'Black Glasses', 'Soft Sand',
];

let itemNames: string[] | null = null;
export function allItems(): string[] {
  if (!itemNames) {
    itemNames = dex9.items.all().filter((i) => i.exists && !i.isNonstandard).map((i) => i.name).sort();
  }
  return itemNames;
}

/** The item picker's two groups: common competitive items first, then every other item. */
export function itemGroups(): { common: string[]; rest: string[] } {
  const all = allItems();
  const common = COMMON_ITEMS.filter((i) => all.includes(i));
  const skip = new Set(common);
  return { common, rest: all.filter((i) => !skip.has(i)) };
}

export function natureNames(): string[] {
  return dex9.natures.all().map((n) => n.name).sort();
}

/** The stat a nature raises and the one it lowers; both null for the five neutral natures. */
export function natureStats(name: string): { plus: StatName; minus: StatName } | null {
  const n = dex9.natures.get(name);
  if (!n.exists || !n.plus || !n.minus) return null;
  return { plus: n.plus as StatName, minus: n.minus as StatName };
}

export function natureSummary(name: string): string {
  const n = natureStats(name);
  return n ? `+${STAT_LABEL[n.plus]} −${STAT_LABEL[n.minus]}` : 'neutral';
}

/** One-line effect of an item ("" for none or unknown). */
export function itemShortDesc(name: string): string {
  const i = dex9.items.get(name);
  return i.exists ? i.shortDesc : '';
}

/** One-line effect of an ability ("" for none or unknown). */
export function abilityShortDesc(name: string): string {
  const a = dex9.abilities.get(name);
  return a.exists ? a.shortDesc : '';
}

/** Items a held-item picker offers: no Mega Stones or Z-Crystals (those follow the roster rules, not the picker). */
export function pickableItems(): { common: string[]; rest: string[] } {
  const keep = (n: string) => { const i = dex9.items.get(n); return !i.megaStone && !i.zMove; };
  const g = itemGroups();
  return { common: g.common.filter(keep), rest: g.rest.filter(keep) };
}

export function speciesAbilities(species: SpeciesId): string[] {
  return Object.values(dex9.species.get(battleSpecies(species)).abilities).filter((a): a is string => !!a);
}

export const TERA_TYPES: string[] = [...ALL_TYPES, 'Stellar'];

export function moveInfo(name: string): { type: string; category: string; power: number } | null {
  const m = dex9.moves.get(name);
  if (!m.exists) return null;
  return { type: m.type, category: m.category, power: m.basePower };
}
