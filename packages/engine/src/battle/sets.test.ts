import { Dex, Teams } from '@pkmn/sim';
import { randomsSpeciesKeys } from './randoms';
import { buildSeasonSets, buildSetFor, setSpeciesId } from './sets';

const BANNED_MOVES = new Set(['fissure', 'sheercold', 'guillotine', 'horndrill', 'doubleteam', 'minimize']);

describe('sets', () => {
  it('builds a valid level-100 set for every randoms species and survives pack/unpack', () => {
    const keys = [...randomsSpeciesKeys()];
    expect(keys.length).toBeGreaterThanOrEqual(500);
    for (const id of keys) {
      const set = buildSetFor(id, { seed: 7, isTeraCaptain: false });
      expect(set.level).toBe(100);
      expect(set.moves.length).toBeGreaterThan(0);
      expect(set.moves.length).toBeLessThanOrEqual(4);
      expect(set.teraType).toBeTruthy();
      expect(set.moves.some(m => BANNED_MOVES.has(Dex.moves.get(m).id))).toBe(false);
      expect(setSpeciesId(set)).toBe(id);
      const evTotal = Object.values(set.evs).reduce((a, b) => a + b, 0);
      expect(evTotal).toBeLessThanOrEqual(510);
      const back = Teams.unpack(Teams.pack([set]));
      expect(Dex.species.get(back?.[0]?.species ?? '').id).toBe(Dex.species.get(set.species).id);
      expect(back?.[0]?.moves.length).toBe(set.moves.length);
    }
  });

  it('falls back to a learnset build for species outside the randoms pool', () => {
    const keys = randomsSpeciesKeys();
    const outside = Dex.species.all().filter(s => s.exists && !s.isNonstandard && !keys.has(s.id) && !s.battleOnly).slice(0, 25);
    expect(outside.length).toBeGreaterThan(0);
    for (const s of outside) {
      const set = buildSetFor(s.id, { seed: 3, isTeraCaptain: true });
      expect(set.moves.length).toBeGreaterThan(0);
      expect(set.item).toBeTruthy();
      expect(Teams.unpack(Teams.pack([set]))?.length).toBe(1);
    }
  });

  it('zeroes the Attack IV on special sets and is deterministic by seed', () => {
    const a = buildSetFor('alakazam', { seed: 11, isTeraCaptain: false });
    const b = buildSetFor('alakazam', { seed: 11, isTeraCaptain: false });
    expect(a).toEqual(b);
    const physical = a.moves.some(m => Dex.moves.get(m).category === 'Physical');
    if (!physical) expect(a.ivs.atk).toBe(0);
  });

  it('builds a season of sets keyed by roster id', () => {
    const sets = buildSeasonSets([{ species: 'garchomp', isTeraCaptain: true }, { species: 'zaciancrowned', isTeraCaptain: false }], 5);
    expect(Object.keys(sets).sort()).toEqual(['garchomp', 'zaciancrowned']);
    expect(sets.zaciancrowned?.item).toBe('Rusted Sword');
  });
});
