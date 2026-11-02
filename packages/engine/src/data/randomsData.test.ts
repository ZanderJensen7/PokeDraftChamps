import { describe, expect, it } from 'vitest';
import { TeamGenerators } from '@pkmn/randoms';
import { RANDOMS_DATA_SOURCE, randomsSpeciesData, randomsSpeciesKeys } from './randoms';
import { buildDraftPool } from '../draft/pool';
import { likelySets } from '../prep/likelySets';

// The live generator is the source of truth; the checked-in JSON is a copy so the app's main bundle skips the sim.
const live = (TeamGenerators.getTeamGenerator('gen9randombattle', 'gen5,0000000000000001') as unknown as {
  randomSets: Record<string, { level?: number; sets: { role: string; movepool: string[]; abilities?: string[]; teraTypes?: string[] }[] }>;
}).randomSets;

describe('precomputed randoms data (src/data/randomsSets.json)', () => {
  it('is current with the installed @pkmn/randoms (stale -> npm run gen:randoms -w @pdc/engine)', () => {
    expect(RANDOMS_DATA_SOURCE).toMatch(/^@pkmn\/randoms \d+\.\d+\.\d+ gen9randombattle$/);
    expect([...randomsSpeciesKeys()].sort()).toEqual(Object.keys(live).sort());
    expect(randomsSpeciesData()).toEqual(live);
  });

  it('keeps the draft pool filter: every pool mon (or a Mega base) has a randoms set, sizes as before the JSON move', () => {
    const base = buildDraftPool();
    const megas = buildDraftPool({ megas: true });
    // 458 / 488 with @pkmn/randoms 0.10.12 and the current ban list; the invariant is the filter, the counts guard the move.
    expect(base.length).toBe(458);
    expect(megas.length).toBe(488);
    for (const m of base) expect(randomsSpeciesKeys().has(m.id)).toBe(true);
    for (const m of megas) if (m.isMega) expect(randomsSpeciesKeys().has(m.baseSpecies!)).toBe(true);
  });

  it('likely sets mirror the generator roles', () => {
    for (const id of ['greattusk', 'kingambit', 'ogerponwellspring', 'abomasnow']) {
      const roles = likelySets(id).roles;
      expect(roles.map((r) => r.role)).toEqual(live[id]!.sets.map((s) => s.role));
      expect(roles[0]!.movepool).toEqual(live[id]!.sets[0]!.movepool);
    }
    expect(likelySets('missingno').roles).toEqual([]);
  });
});
