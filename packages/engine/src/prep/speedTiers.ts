import type { SpeciesId } from '../types';
import { gen9Dex } from './typeChart';

/** Level-100 non-HP stat with 31 IVs. natureMult is 1.1 / 1.0 / 0.9. */
export function statAtLevel100(base: number, ev: number, natureMult: number): number {
  return Math.floor((2 * base + 31 + Math.floor(ev / 4) + 5) * natureMult);
}

export function hpAtLevel100(base: number, ev: number): number {
  return 2 * base + 31 + Math.floor(ev / 4) + 100 + 10;
}

export interface SpeedRow {
  species: SpeciesId;
  name: string;
  base: number;
  ev0: number;
  ev252: number;
  ev252plus: number;
  scarf252: number;
  scarf252plus: number;
}
export interface MergedSpeedRow extends SpeedRow { side: 'you' | 'opp' }

export function speedTierRows(speciesIds: SpeciesId[]): SpeedRow[] {
  return speciesIds.map((id) => {
    const sp = gen9Dex.species.get(id);
    const base = sp.baseStats.spe;
    const ev252 = statAtLevel100(base, 252, 1);
    const ev252plus = statAtLevel100(base, 252, 1.1);
    return {
      species: id, name: sp.name, base,
      ev0: statAtLevel100(base, 0, 1),
      ev252, ev252plus,
      scarf252: Math.floor(ev252 * 1.5),
      scarf252plus: Math.floor(ev252plus * 1.5),
    };
  });
}

/** Both teams in one list, fastest (252+) first; ties list your side first. */
export function mergedSpeedTiers(yourIds: SpeciesId[], oppIds: SpeciesId[]): MergedSpeedRow[] {
  const rows: MergedSpeedRow[] = [
    ...speedTierRows(yourIds).map((r) => ({ ...r, side: 'you' as const })),
    ...speedTierRows(oppIds).map((r) => ({ ...r, side: 'opp' as const })),
  ];
  return rows.sort(
    (a, b) => b.ev252plus - a.ev252plus || (a.side === b.side ? 0 : a.side === 'you' ? -1 : 1),
  );
}
