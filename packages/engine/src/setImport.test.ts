import { describe, expect, it } from 'vitest';
import { Sets } from '@pkmn/sets';
import type { RosterEntry } from './types';
import { exportSetText } from './setText';
import { importRosterSets, matchRosterEntry, parseSetsText, setRulesFor, validateImportedSet } from './setImport';

const entry = (species: string, extra: Partial<RosterEntry> = {}): RosterEntry => ({ species, isTeraCaptain: false, ...extra });
const roster: RosterEntry[] = [
  entry('garchomp', { isTeraCaptain: true }),
  entry('charizardmegax'),
  entry('greattusk'),
  entry('gengar', { isZCaptain: true }),
];

const LEGAL = `Garchomp @ Loaded Dice
Ability: Rough Skin
Level: 100
Tera Type: Fire
EVs: 252 Atk / 4 SpD / 252 Spe
Jolly Nature
- Scale Shot
- Earthquake
- Swords Dance
- Fire Fang`;

const learnable = (ids: string[]) => async () => new Set(ids);
const GARCHOMP_MOVES = ['scaleshot', 'earthquake', 'swordsdance', 'firefang', 'dragontail'];

describe('matchRosterEntry', () => {
  it('matches by species, by Mega name and by base species holding the stone', () => {
    const m = (sp: string, item = '') => matchRosterEntry({ species: sp, item }, roster);
    expect(m('Garchomp')).toEqual({ entry: roster[0] });
    expect(m('Charizard-Mega-X', 'Charizardite X')).toEqual({ entry: roster[1] });
    expect(m('Charizard', 'Charizardite X')).toEqual({ entry: roster[1] });
    expect(m('Great Tusk', 'Leftovers')).toEqual({ entry: roster[2] });
  });

  it('reports a species that is off the roster or not a Pokemon', () => {
    expect(matchRosterEntry({ species: 'Pikachu' }, roster)).toEqual({ reason: 'Pikachu is not on your roster.' });
    expect(matchRosterEntry({ species: 'Fakemon' }, roster)).toHaveProperty('reason');
  });

  it('skips entries already taken', () => {
    expect(matchRosterEntry({ species: 'Garchomp' }, roster, new Set(['garchomp']))).toHaveProperty('reason');
  });
});

describe('importRosterSets', () => {
  const opts = { teraEnabled: true, learnable: learnable(GARCHOMP_MOVES) };

  it('an imported legal set round-trips through exportSetText', async () => {
    const report = await importRosterSets(LEGAL, roster, opts);
    expect(report.skipped).toEqual([]);
    expect(report.applied).toHaveLength(1);
    const { set } = report.applied[0]!;
    expect(set.level).toBe(100);
    const text = exportSetText(set, { teraCaptain: true });
    expect(parseSetsText(text)[0]).toMatchObject({ species: 'Garchomp', item: 'Loaded Dice', ability: 'Rough Skin', nature: 'Jolly', teraType: 'Fire', moves: set.moves });
    expect(text).toBe(Sets.exportSet(set));
  });

  it('reports an illegal move by name and does not apply the set', async () => {
    const report = await importRosterSets(LEGAL.replace('Fire Fang', 'Surf'), roster, opts);
    expect(report.applied).toEqual([]);
    expect(report.skipped).toHaveLength(1);
    expect(report.skipped[0]!.reason).toContain("can't learn Surf");
  });

  it('applies the valid sets of a multi-set paste and reports the rest', async () => {
    const paste = `${LEGAL}\n\nGarchomp @ Leftovers\n- Earthquake\n\nPikachu\n- Thunderbolt`;
    const report = await importRosterSets(paste, roster, opts);
    expect(report.applied.map((a) => a.rosterId)).toEqual(['garchomp']);
    expect(report.skipped.map((s) => s.label)).toEqual(['Garchomp', 'Pikachu']);
  });

  it('flags a Tera Type on a non-captain but keeps it on the set', async () => {
    const report = await importRosterSets(LEGAL, roster, { ...opts, teraEnabled: false });
    expect(report.applied).toHaveLength(1);
    expect(report.applied[0]!.set.teraType).toBe('Fire');
    expect(report.applied[0]!.warnings.join(' ')).toMatch(/only Tera captains/);
    expect(exportSetText(report.applied[0]!.set, { teraCaptain: false })).not.toMatch(/Tera Type/);
  });

  it('forces the level to 100 with a warning', async () => {
    const report = await importRosterSets(LEGAL.replace('Level: 100', 'Level: 50'), roster, opts);
    expect(report.applied[0]!.set.level).toBe(100);
    expect(report.applied[0]!.warnings.join(' ')).toMatch(/level 50/);
  });

  it('rejects EVs over the per-stat and total caps', async () => {
    const over = await importRosterSets(LEGAL.replace('252 Atk / 4 SpD / 252 Spe', '252 Atk / 252 SpD / 252 Spe'), roster, opts);
    expect(over.applied).toEqual([]);
    expect(over.skipped[0]!.reason).toMatch(/over 510/);
    const stat = validateImportedSet(
      roster[0]!, { ...parseSetsText(LEGAL)[0]!, evs: { hp: 0, atk: 300, def: 0, spa: 0, spd: 0, spe: 0 } },
      new Set(GARCHOMP_MOVES), setRulesFor(roster[0]!, true),
    );
    expect(stat.set).toBeUndefined();
  });
});

describe('Mega and Z rules', () => {
  const charizardMoves = ['flamethrower', 'airslash', 'roost', 'dragonpulse'];
  const mega = `Charizard @ Life Orb
Ability: Blaze
- Flamethrower
- Air Slash`;
  const noTera = { teraEnabled: false };

  it('locks a Mega entry to its stone and lists the base species', async () => {
    const report = await importRosterSets(mega, roster, { ...noTera, learnable: learnable(charizardMoves) });
    const a = report.applied[0]!;
    expect(a.rosterId).toBe('charizardmegax');
    expect(a.set.species).toBe('Charizard');
    expect(a.set.item).toBe('Charizardite X');
    expect(a.warnings.join(' ')).toMatch(/Charizardite X/);
  });

  it('accepts the Mega name as the species', async () => {
    const text = mega.replace('Charizard @ Life Orb', 'Charizard-Mega-X @ Charizardite X').replace('Blaze', 'Tough Claws');
    const report = await importRosterSets(text, roster, { ...noTera, learnable: learnable(charizardMoves) });
    expect(report.applied[0]!.set.species).toBe('Charizard');
    expect(report.applied[0]!.warnings.join(' ')).toMatch(/Mega form's ability/);
  });

  it('gives a Z captain a Z-Crystal and refuses one on anyone else', async () => {
    const ok = await importRosterSets('Gengar @ Life Orb\n- Shadow Ball\n- Sludge Bomb', roster, { ...noTera, learnable: learnable(['shadowball', 'sludgebomb']) });
    expect(ok.applied[0]!.set.item).toBe('Poisonium Z');
    const bad = await importRosterSets('Great Tusk @ Firium Z\n- Rapid Spin', roster, { ...noTera, learnable: learnable(['rapidspin']) });
    expect(bad.applied).toEqual([]);
    expect(bad.skipped[0]!.reason).toMatch(/Z captains only/);
  });

  it('refuses a Mega Stone on a non-Mega', async () => {
    const bad = await importRosterSets('Great Tusk @ Charizardite X\n- Rapid Spin', roster, { ...noTera, learnable: learnable(['rapidspin']) });
    expect(bad.applied).toEqual([]);
    expect(bad.skipped[0]!.reason).toMatch(/Mega Evolve/);
  });
});
