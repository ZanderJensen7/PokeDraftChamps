import { describe, expect, it } from 'vitest';
import { Sets } from '@pkmn/sets';
import type { BattleSet } from './types';
import { exportSetText } from './setText';

const set: BattleSet = {
  name: 'Garchomp', species: 'Garchomp', item: 'Loaded Dice', ability: 'Rough Skin',
  moves: ['Scale Shot', 'Earthquake', 'Swords Dance', 'Fire Fang'], nature: 'Jolly', gender: '',
  evs: { hp: 0, atk: 252, def: 0, spa: 0, spd: 4, spe: 252 }, ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  level: 100, teraType: 'Fire',
};

describe('exportSetText', () => {
  it('keeps the Tera Type line for a Tera captain', () => {
    const text = exportSetText(set, { teraCaptain: true });
    expect(text).toMatch(/^Tera Type: Fire\s*$/m);
    expect(text).toBe(Sets.exportSet(set));
  });

  it('omits the Tera Type line for everyone else and leaves the set untouched', () => {
    const text = exportSetText(set, { teraCaptain: false });
    expect(text).not.toMatch(/Tera Type/);
    expect(text).toMatch(/^Garchomp @ Loaded Dice\s*$/m);
    expect(text).toMatch(/^- Scale Shot\s*$/m);
    expect(set.teraType).toBe('Fire');
  });

  it('an imported Tera type survives a non-captain round trip in storage but not in the text', () => {
    const imported = Sets.importSet(Sets.exportSet(set)) as Partial<BattleSet>;
    expect(imported.teraType).toBe('Fire');
    const stored: BattleSet = { ...set, ...imported, teraType: imported.teraType ?? set.teraType };
    expect(stored.teraType).toBe('Fire');
    expect(exportSetText(stored, { teraCaptain: false })).not.toMatch(/Tera Type/);
  });
});
