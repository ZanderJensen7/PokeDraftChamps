// The guided prep's set helpers (sim-free): which opposing mons a lineup's attacks hit super effectively, move swaps
// that cover the ones it misses, and what each EV preset does to a set (spread plus where its Speed lands).
import type { BattleSet, SpeciesId, StatsTable, TypeName } from '../types';
import { battleSpeciesId } from '../forms';
import { SPREAD_PRESETS, spreadFor, type Spread } from '../spreads';
import { calcStats, speedStanding, type SpeedStanding } from './calcStats';
import { effectivenessAgainst, gen9Dex } from './typeChart';
import { moveRow, type MoveRow } from './moveRows';

/** Damaging moves whose damage ignores type (or whose type the helper can't know), never counted as coverage. */
const TYPELESS = new Set(['seismictoss', 'nightshade', 'superfang', 'finalgambit', 'ruination', 'endeavor', 'counter', 'mirrorcoat',
  'metalburst', 'terablast', 'naturalgift', 'hiddenpower', 'weatherball', 'judgment', 'multiattack', 'technoblast', 'revelationdance']);

/** What a swap-in must clear to be suggested: real power, and not a coin flip. */
export const SWAP_RULES = { minPower: 60, minAccuracy: 70, maxSwaps: 3 } as const;

export interface CoverageMon {
  species: SpeciesId;
  /** Lineup species with an attack that hits it super effectively. */
  hitBy: SpeciesId[];
}

/** One ability when the species only ever has that one (Levitate Rotom-less mons etc.), else none: the helper can't guess. */
function sureAbility(species: SpeciesId): string | undefined {
  const a: Partial<Record<string, string>> = { ...gen9Dex.species.get(species).abilities };
  const all = Object.values(a).filter((x): x is string => !!x);
  return all.length === 1 ? all[0] : undefined;
}

const battleTypes = (species: SpeciesId): TypeName[] => {
  const types = new Set<TypeName>(gen9Dex.species.get(species).types as TypeName[]);
  for (const t of gen9Dex.species.get(battleSpeciesId(species)).types) types.add(t as TypeName);
  return [...types];
};

/** The attack types a move list brings to coverage. */
function attackTypes(moves: readonly string[], types: TypeName[]): TypeName[] {
  const out = new Set<TypeName>();
  for (const m of moves) {
    const row = moveRow(m, types);
    if (row && countsForCoverage(row)) out.add(row.type);
  }
  return [...out];
}

function countsForCoverage(row: MoveRow): boolean {
  return row.category !== 'Status' && !TYPELESS.has(row.id);
}

const hitsSuper = (type: TypeName, opp: SpeciesId): boolean => effectivenessAgainst(type, opp, sureAbility(opp)) >= 2;

export interface LineupMon { species: SpeciesId; set: BattleSet }

/** For each opposing mon, which of your lineup hits it super effectively with a move it carries. */
export function lineupCoverage(lineup: readonly LineupMon[], opp: readonly SpeciesId[]): CoverageMon[] {
  const attacks = lineup.map((m) => ({ species: m.species, types: attackTypes(m.set.moves, battleTypes(m.species)) }));
  return opp.map((o) => ({ species: o, hitBy: attacks.filter((a) => a.types.some((t) => hitsSuper(t, o))).map((a) => a.species) }));
}

export interface MoveSwap {
  species: SpeciesId;
  drop: string;
  add: string;
  /** Opposing mons nobody in the lineup hit super effectively before this swap and this move does. */
  covers: SpeciesId[];
}

/** The mon's main attacking side: by its current attacks, ties and attack-less sets by base stats. */
function mainCategory(species: SpeciesId, moves: readonly string[]): 'Physical' | 'Special' {
  const types = battleTypes(species);
  let phys = 0;
  let spec = 0;
  for (const m of moves) {
    const row = moveRow(m, types);
    if (!row || !countsForCoverage(row)) continue;
    if (row.category === 'Physical') phys++;
    else spec++;
  }
  if (phys !== spec) return phys > spec ? 'Physical' : 'Special';
  const base = gen9Dex.species.get(battleSpeciesId(species)).baseStats;
  return base.atk >= base.spa ? 'Physical' : 'Special';
}

/**
 * Up to SWAP_RULES.maxSwaps move swaps (best first, each assuming the ones before it) that cover opposing mons the
 * lineup has no super-effective hit on. A swap only ever drops an attack: never a status move, never the mon's last
 * STAB attack, and never one that is the lineup's only super-effective hit on someone. Swap-ins match the mon's
 * attacking side and clear SWAP_RULES. `learnable` is each lineup mon's moveRows (missing: that mon is skipped).
 */
export function suggestMoveSwaps(
  lineup: readonly LineupMon[], opp: readonly SpeciesId[], learnable: Readonly<Record<SpeciesId, readonly MoveRow[]>>,
): MoveSwap[] {
  let team = lineup.map((m) => ({ species: m.species, moves: [...m.set.moves] }));
  const swaps: MoveSwap[] = [];
  for (let n = 0; n < SWAP_RULES.maxSwaps; n++) {
    const asSets = team.map((m) => ({ species: m.species, set: { moves: m.moves } as BattleSet }));
    const missed = lineupCoverage(asSets, opp).filter((c) => c.hitBy.length === 0).map((c) => c.species);
    if (missed.length === 0) break;
    let best: (MoveSwap & { score: number }) | null = null;
    for (const mon of team) {
      const rows = learnable[mon.species];
      if (!rows) continue;
      const types = battleTypes(mon.species);
      const side = mainCategory(mon.species, mon.moves);
      const current = mon.moves.map((m) => moveRow(m, types));
      const stabCount = current.filter((r) => r && countsForCoverage(r) && r.stab).length;
      const others = team.filter((m) => m !== mon).map((m) => attackTypes(m.moves, battleTypes(m.species)));
      // Drop candidates: attacks whose loss uncovers nobody the rest of the lineup or this mon's other moves still hit.
      const drops = current.flatMap((r, i) => {
        if (!r || !countsForCoverage(r)) return [];
        if (r.stab && stabCount <= 1) return [];
        const rest = attackTypes(mon.moves.filter((_, j) => j !== i), types);
        const loses = opp.some((o) => hitsSuper(r.type, o) && !rest.some((t) => hitsSuper(t, o)) && !others.some((ts) => ts.some((t) => hitsSuper(t, o))));
        return loses ? [] : [{ name: mon.moves[i]!, value: (r.power || 60) * (r.stab ? 1.5 : 1) * (r.accuracy ?? 100) / 100 }];
      });
      if (mon.moves.length < 4) drops.push({ name: '', value: -1 });
      if (drops.length === 0) continue;
      const drop = drops.reduce((a, b) => (b.value < a.value ? b : a));
      const have = new Set(mon.moves.map((m) => m.toLowerCase()));
      for (const row of rows) {
        if (!countsForCoverage(row) || row.category !== side || have.has(row.name.toLowerCase())) continue;
        if (row.power < SWAP_RULES.minPower || (row.accuracy !== null && row.accuracy < SWAP_RULES.minAccuracy)) continue;
        const covers = missed.filter((o) => hitsSuper(row.type, o));
        if (covers.length === 0) continue;
        const score = covers.length * 1000 + (row.stab ? 50 : 0) + row.power * (row.accuracy ?? 100) / 100;
        if (!best || score > best.score) best = { species: mon.species, drop: drop.name, add: row.name, covers, score };
      }
    }
    if (!best) break;
    const { score: _, ...swap } = best;
    swaps.push(swap);
    team = team.map((m) => (m.species !== swap.species ? m
      : { ...m, moves: swap.drop ? m.moves.map((x) => (x === swap.drop ? swap.add : x)) : [...m.moves, swap.add] }));
  }
  return swaps;
}

/** The set with one move swapped (or added, when `drop` is empty). */
export function applyMoveSwap(set: BattleSet, swap: Pick<MoveSwap, 'drop' | 'add'>): BattleSet {
  return { ...set, moves: swap.drop ? set.moves.map((m) => (m === swap.drop ? swap.add : m)) : [...set.moves, swap.add] };
}

export interface SpreadOption {
  role: string;
  label: string;
  blurb: string;
  spread: Spread;
  /** Level 100 Speed with this spread. */
  speed: number;
  /** That Speed against the opposing roster. */
  standing: SpeedStanding;
  /** The set already has exactly this spread. */
  current: boolean;
}

const sameStats = (a: StatsTable, b: StatsTable) => (Object.keys(a) as (keyof StatsTable)[]).every((k) => (a[k] ?? 0) === (b[k] ?? 0));

/** Every EV preset (SPREAD_PRESETS) run against the set's own moves and item, with where its Speed lands. */
export function spreadOptions(species: SpeciesId, set: BattleSet, opp: SpeciesId[]): SpreadOption[] {
  const base = gen9Dex.species.get(battleSpeciesId(species)).baseStats as StatsTable;
  const moveIds = set.moves.map((m) => gen9Dex.moves.get(m).id);
  return SPREAD_PRESETS.map((p) => {
    const spread = spreadFor(p.role, moveIds, base, set.item);
    const speed = calcStats(base, { evs: spread.evs, ivs: spread.ivs, nature: spread.nature }).spe;
    return {
      ...p, spread, speed, standing: speedStanding(speed, opp),
      current: set.nature === spread.nature && sameStats(set.evs, spread.evs) && sameStats(set.ivs, spread.ivs),
    };
  });
}

/** The set's own Speed and where it lands, for the "now" line next to the presets. */
export function currentSpeed(species: SpeciesId, set: BattleSet, opp: SpeciesId[]): { speed: number; standing: SpeedStanding } {
  const base = gen9Dex.species.get(battleSpeciesId(species)).baseStats as StatsTable;
  const speed = calcStats(base, { evs: set.evs, ivs: set.ivs, nature: set.nature }).spe;
  return { speed, standing: speedStanding(speed, opp) };
}
