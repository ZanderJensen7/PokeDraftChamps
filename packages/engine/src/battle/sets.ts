// Season sets: one level-100 draft set per roster mon, derived from @pkmn/randoms roles.
import { Dex, toID } from '@pkmn/sim';
import type { BattleSet, RosterEntry, SpeciesId, StatsTable } from '../types';
import { randomsGenerator, randomsSpeciesData, randomsSpeciesKeys, type RandomsSet } from './randoms';

export interface BuildSetOptions {
  seed: number;
  isTeraCaptain: boolean;
  /** Holds the type Z-Crystal of its strongest STAB attack. Ignored on Megas and on item-locked formes. Default false. */
  isZCaptain?: boolean;
}

/** The type Z-Crystal for each attacking type. */
export const Z_CRYSTAL_BY_TYPE: Readonly<Record<string, string>> = Object.freeze({
  Normal: 'Normalium Z', Fire: 'Firium Z', Water: 'Waterium Z', Electric: 'Electrium Z', Grass: 'Grassium Z',
  Ice: 'Icium Z', Fighting: 'Fightinium Z', Poison: 'Poisonium Z', Ground: 'Groundium Z', Flying: 'Flyinium Z',
  Psychic: 'Psychium Z', Bug: 'Buginium Z', Rock: 'Rockium Z', Ghost: 'Ghostium Z', Dragon: 'Dragonium Z',
  Dark: 'Darkinium Z', Steel: 'Steelium Z', Fairy: 'Fairium Z',
});

/** Mega roster id -> its base species id / name and stone; undefined for anything that is not a Mega form. */
export function megaInfo(rosterId: SpeciesId): { baseId: SpeciesId; baseName: string; stone: string } | undefined {
  const sp = Dex.species.get(rosterId);
  if (!sp.exists || !sp.isMega || !sp.requiredItem) return undefined;
  const base = Dex.species.get(sp.baseSpecies);
  if (!base.exists) return undefined;
  return { baseId: base.id, baseName: base.name, stone: sp.requiredItem };
}

/** The species id the battle team lists for a roster id: the base form for a Mega, the id itself otherwise. */
export function battleSpeciesId(rosterId: SpeciesId): SpeciesId {
  return megaInfo(toID(rosterId))?.baseId ?? toID(rosterId);
}

/** Z-Crystal for a move list: the type of the strongest STAB attack by base power, else of the strongest attack. */
export function zCrystalFor(moves: readonly string[], types: readonly string[]): string | undefined {
  let best: { type: string; bp: number; stab: boolean } | undefined;
  for (const name of moves) {
    const m = Dex.moves.get(name);
    if (!m.exists || m.category === 'Status') continue;
    const cand = { type: m.type, bp: m.basePower, stab: types.includes(m.type) };
    if (!best || (cand.stab && !best.stab) || (cand.stab === best.stab && cand.bp > best.bp)) best = cand;
  }
  return best ? Z_CRYSTAL_BY_TYPE[best.type] : undefined;
}

type Cat = 'phys' | 'spec' | 'mixed';

const EV0: StatsTable = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const IV31: StatsTable = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };

/** Moves a draft league with OHKO / Evasion clauses bans. */
function isBannedMove(id: string): boolean {
  const m = Dex.moves.get(id);
  if (!m.exists) return true;
  if (m.ohko) return true;
  if (m.boosts && (m.boosts.evasion ?? 0) > 0 && m.target === 'self') return true;
  return false;
}

/** Physical / special / mixed by the set's damaging moves (Body Press, Foul Play, Tera Blast are neutral). */
function attackCategory(moveIds: string[], species: { baseStats: StatsTable }): Cat {
  let phys = 0;
  let spec = 0;
  for (const id of moveIds) {
    const m = Dex.moves.get(id);
    if (!m.exists || m.category === 'Status') continue;
    if (['bodypress', 'foulplay', 'terablast', 'seismictoss', 'nightshade', 'superfang', 'finalgambit'].includes(m.id)) continue;
    if (m.category === 'Physical') phys++;
    else spec++;
  }
  if (phys === 0 && spec === 0) return species.baseStats.atk >= species.baseStats.spa ? 'phys' : 'spec';
  if (phys > 0 && spec > 0) return phys === spec ? (species.baseStats.atk >= species.baseStats.spa ? 'phys' : 'spec') : phys > spec ? 'phys' : 'spec';
  return phys > 0 ? 'phys' : 'spec';
}

function usesPhysical(moveIds: string[]): boolean {
  return moveIds.some(id => {
    const m = Dex.moves.get(id);
    return m.exists && m.category === 'Physical' && !['bodypress', 'foulplay'].includes(m.id);
  });
}

function usesSpecial(moveIds: string[]): boolean {
  return moveIds.some(id => {
    const m = Dex.moves.get(id);
    return m.exists && m.category === 'Special';
  });
}

interface Spread {
  evs: StatsTable;
  nature: string;
  ivs: StatsTable;
}

/** EVs / nature / IVs by randoms role (see docs/DESIGN.md "Sets"). */
export function spreadFor(role: string, moveIds: string[], baseStats: StatsTable, item: string): Spread {
  const cat = attackCategory(moveIds, { baseStats });
  const phys = usesPhysical(moveIds);
  const spec = usesSpecial(moveIds);
  const main: 'atk' | 'spa' = cat === 'spec' ? 'spa' : 'atk';
  const ivs: StatsTable = { ...IV31 };
  if (!phys) ivs.atk = 0;
  const trickRoom = moveIds.includes('trickroom') || moveIds.includes('gyroball');
  const slow = baseStats.spe < 50;
  const evs: StatsTable = { ...EV0 };
  let nature: string;

  // Which defensive stat to invest in: the lower one (AV doubles as half a SpD investment).
  const effSpd = item === 'Assault Vest' ? baseStats.spd * 1.5 : baseStats.spd;
  const investDef = moveIds.includes('bodypress') || baseStats.def <= effSpd;
  // Which offensive stat a bulky nature lowers.
  const dropAtk = !phys || (phys && spec && cat === 'spec');

  const bulky = role === 'Bulky Setup' || role === 'Bulky Support' || role === 'AV Pivot' || role === 'Staller' || role === 'Bulky Protect';

  if (trickRoom) {
    ivs.spe = 0;
    if (bulky) {
      evs.hp = 252;
      if (investDef) { evs.def = 252; evs.spd = 4; nature = 'Relaxed'; } else { evs.spd = 252; evs.def = 4; nature = 'Sassy'; }
    } else {
      evs.hp = 252; evs[main] = 252; evs.def = 4;
      nature = main === 'atk' ? 'Brave' : 'Quiet';
    }
    return { evs, nature, ivs };
  }

  if (bulky) {
    evs.hp = 252;
    if (investDef) { evs.def = 252; evs.spd = 4; nature = dropAtk ? 'Bold' : 'Impish'; }
    else { evs.spd = 252; evs.def = 4; nature = dropAtk ? 'Calm' : 'Careful'; }
    return { evs, nature, ivs };
  }

  if (role === 'Fast Support') {
    evs.hp = 252; evs.spe = 252; evs.def = 4;
    nature = phys ? 'Jolly' : 'Timid';
    return { evs, nature, ivs };
  }

  if (role === 'Bulky Attacker' || slow) {
    evs.hp = 252; evs[main] = 252;
    if (investDef) evs.def = 4; else evs.spd = 4;
    nature = main === 'atk' ? 'Adamant' : 'Modest';
    return { evs, nature, ivs };
  }

  if (role === 'Fast Bulky Setup') {
    evs.hp = 252; evs.spe = 252; evs[main] = 4;
    nature = main === 'atk' ? 'Jolly' : 'Timid';
    return { evs, nature, ivs };
  }

  // Fast Attacker, Setup Sweeper, Wallbreaker, Tera Blast user, anything else offensive.
  evs[main] = 252; evs.spe = 252; evs.hp = 4;
  const mixed = phys && spec;
  if (mixed) nature = 'Naive';
  else if (role === 'Wallbreaker') nature = main === 'atk' ? 'Adamant' : 'Modest';
  else nature = main === 'atk' ? 'Jolly' : 'Timid';
  return { evs, nature, ivs };
}

function moveName(id: string): string {
  const m = Dex.moves.get(id);
  return m.exists ? m.name : id;
}

/** Remove clause-banned moves, refilling from the randoms movepool where possible. */
function cleanMoves(moves: string[], speciesId: string): string[] {
  const out = moves.map(toID).filter(id => !isBannedMove(id));
  if (out.length < moves.length) {
    const data = randomsSpeciesData()[speciesId];
    const pool = data ? data.sets.flatMap(s => s.movepool) : [];
    for (const id of pool) {
      if (out.length >= Math.min(4, moves.length)) break;
      const mid = toID(id);
      if (!out.includes(mid) && !isBannedMove(mid)) out.push(mid);
    }
  }
  return out;
}

/** Best-effort set from the learnset when randoms has nothing for the species. */
function learnsetFallback(speciesId: SpeciesId): RandomsSet {
  const species = Dex.species.get(speciesId);
  const name = species.exists ? species.name : speciesId;
  const types = species.exists ? species.types : ['Normal'];
  const lsId = species.exists ? toID(species.changesFrom ?? species.baseSpecies) : speciesId;
  const learnsets = (Dex.data as unknown as { Learnsets: Record<string, { learnset?: Record<string, string[]> }> }).Learnsets;
  const ls = learnsets[toID(speciesId)]?.learnset ?? learnsets[lsId]?.learnset ?? {};
  const physical = species.exists ? species.baseStats.atk >= species.baseStats.spa : true;
  const candidates = Object.keys(ls)
    .map(id => Dex.moves.get(id))
    .filter(m => m.exists && !m.isNonstandard && m.category !== 'Status' && m.basePower >= 60 && m.basePower <= 150 &&
      (m.accuracy === true || m.accuracy >= 85) && !m.flags.charge && !m.flags.recharge && !m.ohko && !m.selfdestruct)
    .map(m => {
      const stab = types.includes(m.type) ? 1.5 : 1;
      const catFit = (m.category === 'Physical') === physical ? 1 : 0.6;
      return { m, score: m.basePower * stab * catFit };
    })
    .sort((a, b) => b.score - a.score || a.m.id.localeCompare(b.m.id));
  const moves: string[] = [];
  const typesUsed = new Set<string>();
  for (const { m } of candidates) {
    if (moves.length >= 4) break;
    if (typesUsed.has(m.type)) continue;
    typesUsed.add(m.type);
    moves.push(m.id);
  }
  if (moves.length === 0) moves.push('tackle');
  const ability = species.exists ? (species.abilities[0] ?? '') : '';
  return { name, species: name, moves, ability, item: 'Leftovers', teraType: types[0] ?? 'Normal', role: '', level: 100 };
}

function toSet(speciesId: SpeciesId, rs: RandomsSet, statsFrom?: StatsTable): BattleSet {
  const species = Dex.species.get(speciesId);
  const displayName = species.exists ? species.name : rs.species;
  const setSpecies = Dex.species.get(rs.species).exists ? rs.species : displayName;
  const moveIds = cleanMoves(rs.moves, speciesId);
  const base = statsFrom ?? (Dex.species.get(setSpecies).baseStats as StatsTable);
  const { evs, nature, ivs } = spreadFor(rs.role ?? '', moveIds, base, rs.item);
  const tera = rs.teraType ?? Dex.species.get(setSpecies).types[0] ?? 'Normal';
  return {
    name: displayName,
    species: setSpecies,
    item: rs.item ?? '',
    ability: rs.ability ?? '',
    moves: moveIds.map(moveName),
    nature,
    gender: '',
    evs,
    ivs,
    level: 100,
    teraType: tera,
  };
}

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  return h;
}

function randomsSetOf(id: SpeciesId, seed: number, salt = 0): RandomsSet | null {
  if (!randomsSpeciesKeys().has(id)) return null;
  try {
    const rs = randomsGenerator(seed, hashId(id) + salt).randomSet(Dex.species.get(id).name);
    return rs && rs.moves && rs.moves.length ? rs : null;
  } catch {
    return null;
  }
}

/** Damaging-move lean of a move list: positive = physical, negative = special. */
function physicalLean(moves: readonly string[]): number {
  let n = 0;
  for (const name of moves) {
    const m = Dex.moves.get(name);
    if (!m.exists || m.category === 'Status') continue;
    n += m.category === 'Physical' ? 1 : -1;
  }
  return n;
}

/** Rolls of the base species' randoms set tried when looking for one that suits the Mega's stronger attacking stat. */
const MEGA_SET_TRIES = 8;

/**
 * A Mega roster entry battles as its base species holding the stone: the base form's randoms set (the first roll
 * whose attacks lean the Mega's way, else the first roll), a base-form ability, the stone as item, and
 * EVs / nature from the Mega form's stats.
 */
function megaSet(megaId: SpeciesId, info: NonNullable<ReturnType<typeof megaInfo>>, seed: number): BattleSet {
  const mega = Dex.species.get(megaId);
  const wantPhysical = mega.baseStats.atk >= mega.baseStats.spa;
  let rs: RandomsSet | null = null;
  for (let i = 0; i < MEGA_SET_TRIES; i++) {
    const roll = randomsSetOf(info.baseId, seed, i * 7919);
    if (!roll) break;
    rs ??= roll;
    const lean = physicalLean(roll.moves);
    if ((wantPhysical && lean > 0) || (!wantPhysical && lean < 0)) { rs = roll; break; }
  }
  rs ??= learnsetFallback(info.baseId);
  const base = Dex.species.get(info.baseId);
  const baseAbilities = Object.values(base.abilities).filter((a): a is string => !!a);
  const ability = baseAbilities.includes(rs.ability) ? rs.ability : (baseAbilities[0] ?? rs.ability);
  const set = toSet(info.baseId, { ...rs, species: info.baseName, item: info.stone, ability }, mega.baseStats as StatsTable);
  return { ...set, name: info.baseName, species: info.baseName, item: info.stone, ability };
}

/**
 * One level-100 draft set for a species. Deterministic by (speciesId, seed). Never throws:
 * species without a randoms set fall back to a learnset-built set (best four BP moves of distinct
 * types, STAB and the species' stronger attacking stat preferred, Leftovers, first ability),
 * and a species unknown to the dex falls back to a Tackle placeholder.
 * `isTeraCaptain` does not change the set: every set carries a teraType; only captains may use it.
 * A Mega id builds the BASE species' set holding the stone (see megaSet). `isZCaptain` swaps the item for the
 * type Z-Crystal of the strongest STAB attack; it is ignored on Megas and on formes locked to an item.
 */
export function buildSetFor(speciesId: SpeciesId, opts: BuildSetOptions): BattleSet {
  const id = toID(speciesId);
  const mega = megaInfo(id);
  if (mega) {
    try { return megaSet(id, mega, opts.seed); } catch { /* fall through to the plain build */ }
  }
  const rs = randomsSetOf(id, opts.seed) ?? learnsetFallback(id);
  let set: BattleSet;
  try {
    set = toSet(id, rs);
  } catch {
    set = toSet(id, learnsetFallback(id));
  }
  if (opts.isZCaptain && !mega) {
    const sp = Dex.species.get(set.species);
    // A forme that needs its item (Zacian-Crowned's Rusted Sword, Ogerpon's masks) keeps it; check the roster id too,
    // since such a set may list the base species.
    const locked = [sp, Dex.species.get(id)].some(f => f.exists && !!(f.requiredItem || f.requiredItems?.length));
    const crystal = locked ? undefined : zCrystalFor(set.moves, sp.exists ? sp.types : []);
    if (crystal) set = { ...set, item: crystal };
  }
  return set;
}

/**
 * Sets for a whole roster, keyed by ROSTER species id (a Mega entry's key is the Mega id; its set lists the base
 * species holding the stone). Deterministic by seed.
 */
export function buildSeasonSets(roster: RosterEntry[], seed: number): Record<SpeciesId, BattleSet> {
  const out: Record<SpeciesId, BattleSet> = {};
  for (const entry of roster) {
    out[entry.species] = buildSetFor(entry.species, { seed, isTeraCaptain: entry.isTeraCaptain, isZCaptain: !!entry.isZCaptain });
  }
  return out;
}

/** Roster species id a set stands for (nickname first: sets are named after their roster species). */
export function setSpeciesId(set: BattleSet): SpeciesId {
  const byName = Dex.species.get(set.name);
  const bySpecies = Dex.species.get(set.species);
  if (byName.exists && (!bySpecies.exists || byName.baseSpecies === bySpecies.baseSpecies)) return byName.id;
  return bySpecies.exists ? bySpecies.id : toID(set.species);
}
