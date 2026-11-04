import { describe, expect, it } from 'vitest';
import {
  ALL_TYPES, effectivenessAgainst, teamMatchupTable, monMatchupRow,
  speedTierRows, mergedSpeedTiers, statAtLevel100, hpAtLevel100,
  notableMoves, teamMoveMatrix, likelySets, buildPrepDoc, threatSummary,
} from './index';

describe('typeChart', () => {
  it('has 18 types', () => expect(ALL_TYPES).toHaveLength(18));

  it('applies ability immunities and halves', () => {
    expect(effectivenessAgainst('Ground', 'rotomwash')).toBe(2);
    expect(effectivenessAgainst('Ground', 'rotomwash', 'Levitate')).toBe(0);
    expect(effectivenessAgainst('Fire', 'snorlax')).toBe(1);
    expect(effectivenessAgainst('Fire', 'snorlax', 'Thick Fat')).toBe(0.5);
    expect(effectivenessAgainst('Ice', 'snorlax', 'Thick Fat')).toBe(0.5);
  });

  it('computes 4x, 0.25x and immune cases', () => {
    expect(effectivenessAgainst('Ice', 'garchomp', 'Rough Skin')).toBe(4);
    expect(effectivenessAgainst('Fire', 'ferrothorn')).toBe(4);
    expect(effectivenessAgainst('Grass', 'gastrodon')).toBe(4);
    expect(effectivenessAgainst('Bug', 'corviknight')).toBe(0.25);
    expect(effectivenessAgainst('Ground', 'corviknight')).toBe(0);
    expect(effectivenessAgainst('Fire', 'toxicroak', 'Dry Skin')).toBe(1.25);
  });

  it('builds a full row', () => {
    const row = monMatchupRow('greattusk');
    expect(Object.keys(row)).toHaveLength(18);
    expect(row.Ice).toBe(2);
  });

  it('computes Weak scores as the sheet does (hand-computed 3-mon team)', () => {
    const t = teamMatchupTable(['greattusk', 'corviknight', 'dragapult']);
    // Fire: 0 + (-1) + (+1) = 0, one resister -> -1
    expect(t.weak.Fire).toBe(-1);
    // Ground: 0 + 2 + 0 = 2, one resister (immune) -> -1
    expect(t.weak.Ground).toBe(1);
    // Ice: -1 + 0 + -1 = -2, no resister -> -2 more
    expect(t.weak.Ice).toBe(-4);
    // Fairy: -1 (fighting) + 1 (steel resists) + -1 (dragon) = -1, one resister -> -1 more
    expect(t.weak.Fairy).toBe(-2);
    expect(t.stab.Steel).toBe(1);
    expect(t.stab.Dragon).toBe(1);
  });

  it('notes alternate immunity abilities without applying them', () => {
    const t = teamMatchupTable(['gastrodon']);
    expect(t.rows[0]?.byType.Water).toBe(1);
    expect(t.immunityNotes.some((n) => n.type === 'Water' && n.ability === 'Storm Drain')).toBe(true);
    const chosen = teamMatchupTable(['gastrodon'], { gastrodon: 'Storm Drain' });
    expect(chosen.rows[0]?.byType.Water).toBe(0);
  });
});

describe('speedTiers', () => {
  it('matches the level 100 formula for Dragapult (base 142)', () => {
    expect(statAtLevel100(142, 252, 1.1)).toBe(Math.floor((2 * 142 + 31 + 63 + 5) * 1.1));
    const [r] = speedTierRows(['dragapult']);
    expect(r?.base).toBe(142);
    expect(r?.ev0).toBe(320);
    expect(r?.ev252).toBe(383);
    expect(r?.ev252plus).toBe(421);
    expect(r?.scarf252).toBe(574);
    expect(r?.scarf252plus).toBe(631);
    expect(hpAtLevel100(100, 252)).toBe(200 + 31 + 63 + 110);
  });

  it('merges and sorts both teams', () => {
    const rows = mergedSpeedTiers(['corviknight', 'dragapult'], ['greattusk', 'cinderace']);
    expect(rows).toHaveLength(4);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1]!.ev252plus).toBeGreaterThanOrEqual(rows[i]!.ev252plus);
    }
    expect(rows[0]?.species).toBe('dragapult');
    expect(rows.filter((r) => r.side === 'opp')).toHaveLength(2);
  });
});

describe('moves', () => {
  it('finds hazards and removal', async () => {
    const nm = await notableMoves(['greattusk', 'corviknight']);
    expect(nm['Entry Hazards'].find((m) => m.move === 'Stealth Rock')?.species).toContain('greattusk');
    expect(nm['Hazard Removal'].find((m) => m.move === 'Defog')?.species).toContain('corviknight');
    const matrix = await teamMoveMatrix(['greattusk', 'corviknight']);
    expect(matrix.corviknight).toContain('Hazard Removal');
  });
});

describe('likelySets', () => {
  it('returns roles for known species and empty for unknown', () => {
    const s = likelySets('greattusk');
    expect(s.roles.length).toBeGreaterThan(0);
    expect(s.roles[0]?.movepool.length).toBeGreaterThan(0);
    expect(likelySets('notaspecies').roles).toEqual([]);
  });
});

describe('prepDoc', () => {
  const youIds = ['greattusk', 'corviknight', 'dragapult', 'gholdengo', 'kingambit', 'ironvaliant',
    'rotomwash', 'garchomp', 'toxapex', 'cinderace', 'clefable'];
  const oppIds = ['landorustherian', 'ogerponwellspring', 'ferrothorn', 'heatran', 'gliscor',
    'slowking', 'volcarona', 'weavile', 'skarmory', 'tinglu', 'dragonite'];
  const mk = (ids: string[]) => ids.map((species, i) => ({ species, isTeraCaptain: i < 2 }));

  it('builds end to end quickly', async () => {
    const t0 = Date.now();
    const doc = await buildPrepDoc({
      you: mk(youIds), opp: mk(oppIds),
      scout: {
        coach: 'c2', matchesScouted: 1,
        bySpecies: { heatran: { moves: ['Magma Storm'], item: 'Leftovers', timesBrought: 1, timesLed: 1 } },
      },
    });
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(doc.you).toHaveLength(11);
    expect(doc.opp[0]?.isTeraCaptain).toBe(true);
    expect(doc.matchup.you.rows).toHaveLength(11);
    expect(doc.speed).toHaveLength(22);
    expect(doc.moves.you['Entry Hazards'].length).toBeGreaterThan(0);
    expect(Object.keys(doc.oppLikelySets)).toHaveLength(11);
    expect(doc.scouted.heatran?.moves).toEqual(['Magma Storm']);
    const lines = threatSummary(doc);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThanOrEqual(8);
    expect(typeof lines[0]).toBe('string');
  });

  it('threatSummary claims nothing about an opposing roster hidden by fog of war', async () => {
    const doc = await buildPrepDoc({
      you: ['greattusk', 'gholdengo', 'dragonite'].map((species) => ({ species, isTeraCaptain: false })), opp: [],
    });
    const lines = threatSummary(doc);
    expect(lines[0]).toMatch(/roster unknown under fog of war/);
    expect(lines.slice(1).every((l) => !/opp/i.test(l))).toBe(true);
  });

  it('threatSummary claims no opposing absence from a partly hidden roster', async () => {
    const roster = (ids: string[]) => ids.map((species) => ({ species, isTeraCaptain: false }));
    // Ninjask outspeeds Great Tusk and Ting-Lu, and neither opp mon can remove hazards: true of the seen mons only.
    const input = { you: roster(['ninjask', 'greattusk']), opp: roster(['tinglu', 'glimmora']) };
    const full = threatSummary(await buildPrepDoc(input));
    expect(full.some((l) => /outspeeds their whole team/.test(l))).toBe(true);
    const partial = threatSummary(await buildPrepDoc({ ...input, oppHidden: 4 }));
    expect(partial[0]).toMatch(/2 opp mons seen so far, 4 not yet/);
    expect(partial.some((l) => /their whole team|none of their mons/.test(l))).toBe(false);
  });
});
