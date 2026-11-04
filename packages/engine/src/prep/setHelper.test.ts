import { describe, expect, it } from 'vitest';
import type { BattleSet, SpeciesId } from '../types';
import { SPREAD_PRESETS } from '../spreads';
import { moveRow, moveRows, type MoveRow } from './moveRows';
import { applyMoveSwap, lineupCoverage, spreadOptions, suggestMoveSwaps, SWAP_RULES, type LineupMon } from './setHelper';

const EV0 = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const IV31 = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const set = (species: string, moves: string[]): BattleSet =>
  ({ name: species, species, item: 'Leftovers', ability: '', moves, nature: 'Hardy', evs: { ...EV0 }, ivs: { ...IV31 }, level: 100, gender: '' }) as BattleSet;

const lineup: LineupMon[] = [
  { species: 'garchomp', set: set('garchomp', ['Earthquake', 'Dragon Claw', 'Swords Dance', 'Stone Edge']) },
  { species: 'kingambit', set: set('kingambit', ['Kowtow Cleave', 'Iron Head', 'Sucker Punch', 'Swords Dance']) },
];
const opp: SpeciesId[] = ['corviknight', 'skarmory', 'garchomp', 'amoonguss', 'gholdengo'];

async function learnsets(): Promise<Record<SpeciesId, MoveRow[]>> {
  const out: Record<SpeciesId, MoveRow[]> = {};
  for (const m of lineup) out[m.species] = await moveRows(m.species);
  return out;
}

describe('lineupCoverage', () => {
  it('lists every opposing mon, hit only by lineup mons', () => {
    const cov = lineupCoverage(lineup, opp);
    expect(cov.map((c) => c.species)).toEqual(opp);
    for (const c of cov) for (const s of c.hitBy) expect(lineup.map((m) => m.species)).toContain(s);
  });

  it('never counts status moves', () => {
    const cov = lineupCoverage([{ species: 'garchomp', set: set('garchomp', ['Swords Dance', 'Stealth Rock']) }], opp);
    expect(cov.every((c) => c.hitBy.length === 0)).toBe(true);
  });
});

describe('suggestMoveSwaps', () => {
  it('only suggests legal attacks that cover a missed mon, and never drops status or the last STAB move', async () => {
    const rows = await learnsets();
    const swaps = suggestMoveSwaps(lineup, opp, rows);
    expect(swaps.length).toBeLessThanOrEqual(SWAP_RULES.maxSwaps);
    let team = lineup.map((m) => ({ ...m }));
    const missedBefore = lineupCoverage(team, opp).filter((c) => c.hitBy.length === 0).length;
    for (const s of swaps) {
      const mon = team.find((m) => m.species === s.species)!;
      expect(rows[s.species]!.some((r) => r.name === s.add)).toBe(true);
      expect(s.covers.length).toBeGreaterThan(0);
      const added = moveRow(s.add)!;
      expect(added.category).not.toBe('Status');
      expect(added.power).toBeGreaterThanOrEqual(SWAP_RULES.minPower);
      if (s.drop) {
        expect(mon.set.moves).toContain(s.drop);
        expect(moveRow(s.drop)!.category).not.toBe('Status');
      }
      const next = applyMoveSwap(mon.set, s);
      expect(next.moves.length).toBeLessThanOrEqual(4);
      team = team.map((m) => (m === mon ? { ...m, set: next } : m));
    }
    const missedAfter = lineupCoverage(team, opp).filter((c) => c.hitBy.length === 0).length;
    if (swaps.length) expect(missedAfter).toBeLessThan(missedBefore);
  });

  it('suggests nothing when every opposing mon is already covered', async () => {
    const rows = await learnsets();
    const covered = lineupCoverage(lineup, opp).filter((c) => c.hitBy.length > 0).map((c) => c.species);
    expect(suggestMoveSwaps(lineup, covered, rows)).toEqual([]);
  });

  it('skips mons whose learnset is not loaded', () => {
    expect(suggestMoveSwaps(lineup, opp, {})).toEqual([]);
  });
});

describe('spreadOptions', () => {
  it('gives one legal spread per preset and marks the one the set already has', () => {
    const s = lineup[0]!.set;
    const opts = spreadOptions('garchomp', s, opp);
    expect(opts.map((o) => o.role)).toEqual(SPREAD_PRESETS.map((p) => p.role));
    for (const o of opts) {
      expect(Object.values(o.spread.evs).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(510);
      expect(o.standing.total).toBe(opp.length);
      expect(o.current).toBe(false);
    }
    const pick = opts[0]!.spread;
    const after = spreadOptions('garchomp', { ...s, ...pick }, opp);
    expect(after[0]!.current).toBe(true);
  });
});
