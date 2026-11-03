// Calculated stats for the team editor (sim-free): the in-game stat formula at any level, nature multipliers,
// and where a speed stat lands against a list of species' Level 100 speed tiers.
import type { SpeciesId, StatName, StatsTable } from '../types';
import { gen9Dex } from './typeChart';
import { speedTierRows } from './speedTiers';

const ORDER: StatName[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

export interface CalcStatsInput {
  evs?: Partial<StatsTable>;
  /** Missing stats count as 31. */
  ivs?: Partial<StatsTable>;
  nature?: string;
  level?: number;
}

/** Per-stat nature multiplier (1.1 / 0.9, or 1 for neutral and unknown natures; HP is always 1). */
export function natureMultipliers(nature?: string): StatsTable {
  const mult: StatsTable = { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 };
  const n = nature ? gen9Dex.natures.get(nature) : undefined;
  if (n?.exists && n.plus && n.minus) {
    mult[n.plus as StatName] = 1.1;
    mult[n.minus as StatName] = 0.9;
  }
  return mult;
}

/** Stats at `level` (default 100) from base stats, EVs, IVs and nature, floored like the games. Shedinja's HP is 1. */
export function calcStats(base: StatsTable, input: CalcStatsInput = {}): StatsTable {
  const level = input.level ?? 100;
  const mult = natureMultipliers(input.nature);
  const out = {} as StatsTable;
  for (const k of ORDER) {
    const ev = Math.floor((input.evs?.[k] ?? 0) / 4);
    const iv = input.ivs?.[k] ?? 31;
    const core = Math.floor(((2 * base[k] + iv + ev) * level) / 100);
    if (k === 'hp') out.hp = base.hp === 1 ? 1 : core + level + 10;
    else out[k] = Math.floor((core + 5) * mult[k]);
  }
  return out;
}

/** How a speed stat compares with a pool of species at their Level 100 speed tiers (no IV changes, no Scarf). */
export interface SpeedStanding {
  total: number;
  /** Species slower than the stat even at their fastest tier (252 EVs, +Spe nature). */
  beatsMax: number;
  /** Species slower than the stat at 252 EVs with a neutral nature. */
  beats252: number;
  /** Species slower than the stat with no Speed investment. */
  beats0: number;
}

export function speedStanding(speed: number, species: SpeciesId[]): SpeedStanding {
  const rows = speedTierRows(species);
  return {
    total: rows.length,
    beatsMax: rows.filter((r) => speed > r.ev252plus).length,
    beats252: rows.filter((r) => speed > r.ev252).length,
    beats0: rows.filter((r) => speed > r.ev0).length,
  };
}
