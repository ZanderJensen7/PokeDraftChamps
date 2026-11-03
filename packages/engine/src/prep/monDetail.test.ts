import { describe, expect, it } from 'vitest';
import { ALL_TYPES, gen9Dex } from './typeChart';
import { MOVE_CATEGORY_NAMES } from './moves';
import { monDetail } from './monDetail';

describe('monDetail', () => {
  it('card: Dex stats, described abilities, price and captain flags', async () => {
    const d = await monDetail('greattusk', { roster: { species: 'greattusk', isTeraCaptain: true } });
    expect(d.card.types).toEqual(['Ground', 'Fighting']);
    expect(d.card.bst).toBe(Object.values(d.card.baseStats).reduce((a, b) => a + b, 0));
    expect(d.card.abilities.length).toBeGreaterThan(0);
    for (const a of d.card.abilities) expect(a.desc.length).toBeGreaterThan(0);
    expect(d.card.price).toBeGreaterThan(0);
    expect(d.card.isTeraCaptain).toBe(true);
    expect(d.card.isZCaptain).toBe(false);
    expect(d.card.mega).toBeUndefined();
  });

  it('matchup: every type in the row, groups agree with it', async () => {
    const d = await monDetail('gholdengo');
    expect(Object.keys(d.matchup.byType).sort()).toEqual([...ALL_TYPES].sort());
    const groups = [d.matchup.x4, d.matchup.x2, d.matchup.x05, d.matchup.x025, d.matchup.immune].flat();
    expect(new Set(groups).size).toBe(groups.length);
    for (const t of d.matchup.immune) expect(d.matchup.byType[t]).toBe(0);
    for (const t of d.matchup.x2) expect(d.matchup.byType[t]).toBe(2);
    // Steel/Ghost: immune to Normal, Fighting and Poison.
    expect(d.matchup.immune).toEqual(expect.arrayContaining(['Normal', 'Fighting', 'Poison']));
  });

  it('speed: Lv100 tiers ascend', async () => {
    const { speed } = await monDetail('dragapult');
    expect(speed.ev0).toBeLessThan(speed.ev252);
    expect(speed.ev252).toBeLessThan(speed.ev252plus);
    expect(speed.ev252plus).toBeLessThan(speed.scarf252plus);
  });

  it('likely sets: randoms roles with movepools', async () => {
    const d = await monDetail('greattusk');
    expect(d.likelySets.length).toBeGreaterThan(0);
    for (const r of d.likelySets) expect(r.movepool.length).toBeGreaterThan(0);
  });

  it('learnset: sorted names, includes STAB moves; notable moves are a subset', async () => {
    const d = await monDetail('greattusk');
    expect(d.learnset).toEqual([...d.learnset].sort((a, b) => a.localeCompare(b)));
    const types = new Set<string>(d.learnset.map((m) => gen9Dex.moves.get(m).type));
    for (const t of d.card.types) expect(types.has(t)).toBe(true);
    expect(Object.keys(d.notableMoves).sort()).toEqual([...MOVE_CATEGORY_NAMES].sort());
    for (const moves of Object.values(d.notableMoves)) for (const m of moves) expect(d.learnset).toContain(m);
  });

  it('Megas resolve their base form learnset and roles', async () => {
    const mega = await monDetail('charizardmegax');
    const base = await monDetail('charizard');
    expect(mega.card.mega?.baseId).toBe('charizard');
    expect(mega.card.displayName).toBe('Mega Charizard X');
    expect(mega.learnset.length).toBeGreaterThan(0);
    expect(mega.learnset).toEqual(base.learnset);
    expect(mega.card.types).toEqual(['Fire', 'Dragon']);
  });

  it('scouted passes through', async () => {
    const scout = { moves: ['Earthquake'], timesBrought: 2, timesLed: 1 };
    expect((await monDetail('greattusk', { scout })).scouted).toEqual(scout);
  });
});
