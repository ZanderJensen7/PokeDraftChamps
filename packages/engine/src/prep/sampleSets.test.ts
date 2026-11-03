import { describe, expect, it } from 'vitest';
import { loadSampleSets, randomsSampleSets } from './sampleSets';
import { fillSet } from '../setImport';

const garchompJson = {
  Garchomp: {
    'Swords Dance': {
      moves: ['Swords Dance', 'Scale Shot', 'Earthquake', ['Fire Fang', 'Dragon Tail']], ability: 'Rough Skin', item: 'Loaded Dice',
      nature: 'Jolly', evs: { atk: 252, spd: 4, spe: 252 }, teratypes: ['Fire'],
    },
  },
};

describe('randomsSampleSets', () => {
  it('gives each role set at most four moves, a legal spread and the Randoms label', () => {
    const sets = randomsSampleSets('garchomp');
    expect(sets.length).toBeGreaterThan(0);
    for (const s of sets) {
      expect(s.source).toBe('Randoms');
      expect(s.set.moves!.length).toBeLessThanOrEqual(4);
      const total = Object.values(s.set.evs!).reduce((a, b) => a + b, 0);
      expect(total).toBeLessThanOrEqual(510);
    }
  });

  it('a Mega entry uses its base species and fills to its stone', () => {
    const [first] = randomsSampleSets('charizardmegax');
    expect(first?.set.species).toBe('Charizard');
    expect(fillSet({ species: 'charizardmegax', isTeraCaptain: false }, first!.set).item).toBe('Charizardite X');
  });
});

describe('loadSampleSets', () => {
  it('returns Smogon sets first and the randoms sets after', async () => {
    const urls: string[] = [];
    const sets = await loadSampleSets('garchomp', { fetch: async (u) => { urls.push(u); return { json: async () => garchompJson }; } });
    expect(urls[0]).toContain('gen9ou');
    expect(sets[0]).toMatchObject({ label: 'Swords Dance', source: 'Smogon OU' });
    expect(sets[0]!.set.item).toBe('Loaded Dice');
    expect(sets.at(-1)!.source).toBe('Randoms');
  });

  it('fails soft: a dead network leaves the randoms sets, never throws', async () => {
    const sets = await loadSampleSets('garchomp', { fetch: async () => { throw new Error('offline'); } });
    expect(sets.length).toBeGreaterThan(0);
    expect(sets.every((s) => s.source === 'Randoms')).toBe(true);
  });

  it('is empty (not an error) for a species with neither source', async () => {
    const sets = await loadSampleSets('notapokemon', { fetch: async () => { throw new Error('offline'); } });
    expect(sets).toEqual([]);
  });
});
