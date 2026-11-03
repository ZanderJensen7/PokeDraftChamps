import { describe, expect, it } from 'vitest';
import { Dex } from '@pkmn/dex';
import type { StatsTable } from './types';
import { SPREAD_PRESETS, spreadFor } from './spreads';

describe('SPREAD_PRESETS', () => {
  const garchomp = Dex.species.get('garchomp').baseStats as StatsTable;

  it('every preset gives a legal spread: 4-multiples, at most 252 per stat, at most 510 in all', () => {
    for (const p of SPREAD_PRESETS) {
      const { evs, nature } = spreadFor(p.role, ['earthquake', 'swordsdance'], garchomp, 'Life Orb');
      const values = Object.values(evs);
      expect(Math.max(...values), p.label).toBeLessThanOrEqual(252);
      expect(values.every((v) => v % 4 === 0), p.label).toBe(true);
      expect(values.reduce((a, b) => a + b, 0), p.label).toBeLessThanOrEqual(510);
      expect(Dex.natures.get(nature).exists, p.label).toBe(true);
    }
  });

  it('a fast attacker maxes its attack and speed', () => {
    const { evs } = spreadFor('Fast Attacker', ['earthquake', 'outrage'], garchomp, 'Life Orb');
    expect(evs).toMatchObject({ atk: 252, spe: 252 });
  });
});
