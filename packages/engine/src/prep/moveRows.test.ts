import { describe, expect, it } from 'vitest';
import { calcStats, natureMultipliers, speedStanding } from './calcStats';
import { moveRow, moveRows } from './moveRows';
import { learnableMoveIds } from './moves';
import { gen9Dex } from './typeChart';

describe('moveRows', () => {
  it('every row is a move in the learnset, with sane columns', async () => {
    const ids = await learnableMoveIds('garchomp');
    const rows = await moveRows('garchomp');
    expect(rows.length).toBe(ids.size);
    for (const r of rows) {
      expect(ids.has(r.id)).toBe(true);
      expect(r.maxPp).toBeGreaterThanOrEqual(r.pp);
      expect(r.shortDesc.length).toBeGreaterThan(0);
      if (r.category === 'Status') expect(r.power).toBe(0);
    }
    expect(rows.map((r) => r.name)).toEqual([...rows.map((r) => r.name)].sort((a, b) => a.localeCompare(b)));
  });

  it('STAB matches the mon types, and never marks a status move', async () => {
    const types: string[] = [...gen9Dex.species.get('garchomp').types];
    for (const r of await moveRows('garchomp')) {
      expect(r.stab).toBe(r.category !== 'Status' && types.includes(r.type));
    }
    const rows = await moveRows('garchomp');
    expect(rows.find((r) => r.name === 'Earthquake')!.stab).toBe(true);
    expect(rows.find((r) => r.name === 'Flamethrower')!.stab).toBe(false);
  });

  it('a Mega pick reads its base form learnset and counts both forms for STAB', async () => {
    const mega = await moveRows('charizardmegax');
    const base = await moveRows('charizard');
    expect(mega.map((r) => r.id)).toEqual(base.map((r) => r.id));
    // Charizard-Mega-X is Fire/Dragon; Flying keeps STAB from the base form.
    expect(mega.find((r) => r.name === 'Dragon Claw')!.stab).toBe(true);
    expect(mega.find((r) => r.name === 'Air Slash')!.stab).toBe(true);
  });

  it('reads accuracy, PP, priority, flags and secondary chance from the dex', () => {
    const fireFang = moveRow('Fire Fang')!;
    expect(fireFang).toMatchObject({ accuracy: 95, pp: 15, maxPp: 24, priority: 0, secondaryChance: 10 });
    expect(fireFang.flags).toEqual(expect.arrayContaining(['contact', 'bite']));
    expect(fireFang.flags).not.toContain('bypasses Protect');
    expect(moveRow('Swift')!.accuracy).toBeNull();
    expect(moveRow('Extreme Speed')!.priority).toBe(2);
    expect(moveRow('Feint')!.flags).toContain('bypasses Protect');
    expect(moveRow('Phantom Force')!.flags).toContain('bypasses Protect');
    expect(moveRow('Doom Desire')!.flags).not.toContain('bypasses Protect');
    expect(moveRow('Hyper Voice')!.flags).toContain('sound');
    expect(moveRow('Low Kick')).toMatchObject({ power: 0, variablePower: true });
    expect(moveRow('Thunder Wave')!.variablePower).toBe(false);
    expect(moveRow('not a move')).toBeNull();
  });
});

describe('calcStats', () => {
  // Garchomp 108/130/95/80/85/102: Jolly (+Spe -SpA), 252 Atk / 252 Spe / 4 HP, 31 IVs, level 100.
  // HP 2*108+31+1+110 = 358; Atk 2*130+31+63+5 = 359; Def 2*95+31+5 = 226; SpA floor((160+31+5)*0.9) = 176;
  // SpD 2*85+31+5 = 206; Spe floor((204+31+63+5)*1.1) = floor(303*1.1) = 333.
  it('matches a hand-calculated Jolly Garchomp', () => {
    const base = gen9Dex.species.get('garchomp').baseStats;
    expect(calcStats(base, { evs: { hp: 4, atk: 252, spe: 252 }, nature: 'Jolly' }))
      .toEqual({ hp: 358, atk: 359, def: 226, spa: 176, spd: 206, spe: 333 });
  });

  it('IVs, level 50 and Shedinja', () => {
    const base = gen9Dex.species.get('garchomp').baseStats;
    // 0 Atk IV, no EVs, neutral: floor(260*100/100) + 5 - 31 = 234.
    expect(calcStats(base, { ivs: { atk: 0 } }).atk).toBe(2 * 130 + 5);
    // Level 50, 252 EVs: floor((2*108+31+63)*50/100) + 50 + 10 = 155 + 60 = 215.
    expect(calcStats(base, { evs: { hp: 252 }, level: 50 }).hp).toBe(215);
    expect(calcStats(gen9Dex.species.get('shedinja').baseStats).hp).toBe(1);
  });

  it('nature multipliers: one up, one down, neutral for the rest and for unknown names', () => {
    const adamant = natureMultipliers('Adamant');
    expect(adamant).toMatchObject({ atk: 1.1, spa: 0.9, hp: 1, def: 1, spd: 1, spe: 1 });
    expect(Object.values(natureMultipliers('Serious')).every((v) => v === 1)).toBe(true);
    expect(Object.values(natureMultipliers('Nope')).every((v) => v === 1)).toBe(true);
  });

  it('stats grow with EVs and a speed standing counts only species it beats', () => {
    const base = gen9Dex.species.get('garchomp').baseStats;
    const lo = calcStats(base, {});
    const hi = calcStats(base, { evs: { atk: 252, hp: 252 } });
    expect(hi.atk).toBeGreaterThan(lo.atk);
    expect(hi.hp).toBeGreaterThan(lo.hp);
    const s = speedStanding(333, ['garchomp', 'dragapult', 'shuckle']);
    expect(s.total).toBe(3);
    // Tier order: beating a species at max implies beating it at 252 and at 0.
    expect(s.beatsMax).toBeLessThanOrEqual(s.beats252);
    expect(s.beats252).toBeLessThanOrEqual(s.beats0);
    expect(s.beats0).toBeGreaterThanOrEqual(1);
  });
});
