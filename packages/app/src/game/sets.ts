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

/** Fills the gaps an imported (partial) set may have. */
export function completeSet(species: SpeciesId, partial: Partial<BattleSet>): BattleSet {
  const base = blankSet(species);
  return {
    ...base,
    ...partial,
    species: base.species,
    name: base.name,
    item: lockedStone(species) ?? partial.item ?? base.item,
    moves: (partial.moves ?? []).slice(0, 4),
    evs: { ...base.evs, ...(partial.evs ?? {}) },
    ivs: { ...base.ivs, ...(partial.ivs ?? {}) },
    level: 100,
  };
}

let itemNames: string[] | null = null;
export function allItems(): string[] {
  if (!itemNames) {
    itemNames = dex9.items.all().filter((i) => i.exists && !i.isNonstandard).map((i) => i.name).sort();
  }
  return itemNames;
}

export function natureNames(): string[] {
  return dex9.natures.all().map((n) => n.name).sort();
}

export function natureSummary(name: string): string {
  const n = dex9.natures.get(name);
  if (!n.exists || !n.plus || !n.minus) return 'neutral';
  return `+${STAT_LABEL[n.plus as StatName]} -${STAT_LABEL[n.minus as StatName]}`;
}

export function speciesAbilities(species: SpeciesId): string[] {
  return Object.values(dex9.species.get(battleSpecies(species)).abilities).filter((a): a is string => !!a);
}

export const TERA_TYPES: string[] = [...ALL_TYPES, 'Stellar'];

const learnCache = new Map<SpeciesId, Promise<string[]>>();
/** Display names of every Gen 9 move the species can learn (incl. prevos), sorted. */
export function learnableMoves(id: SpeciesId): Promise<string[]> {
  const species = battleSpecies(id);
  let p = learnCache.get(species);
  if (!p) {
    p = gen9.learnsets.learnable(species).then((ls) => {
      if (!ls) return [];
      return Object.keys(ls)
        .map((id) => gen9.moves.get(id))
        .filter((m): m is NonNullable<typeof m> => !!m)
        .map((m) => m.name)
        .sort();
    });
    learnCache.set(species, p);
  }
  return p;
}

export function moveInfo(name: string): { type: string; category: string; power: number } | null {
  const m = dex9.moves.get(name);
  if (!m.exists) return null;
  return { type: m.type, category: m.category, power: m.basePower };
}
