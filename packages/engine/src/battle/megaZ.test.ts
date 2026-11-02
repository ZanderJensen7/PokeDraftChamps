import { Dex } from '@pkmn/sim';
import type { BattleSet, Coach, RosterEntry, SpeciesId } from '../types';
import { HeuristicPlayer } from './heuristicPlayer';
import { chooseLineup } from './lineup';
import type { ParsedRequest, PlayerContext } from './player';
import { Rng } from './rng';
import { runBattle } from './runner';
import { scoutFromLogs } from '../logs/scout';
import { battleSpeciesId, Z_CRYSTAL_BY_TYPE, zCrystalFor } from '../forms';
import { buildSeasonSets, buildSetFor } from './sets';
import { simulateMatch } from './simulateMatch';
import { viewOf } from './view';

const FILLER: SpeciesId[] = ['garchomp', 'corviknight', 'toxapex', 'rotomwash', 'clefable', 'dragapult', 'kingambit', 'skeledirge', 'heatran', 'tinglu'];

function coachWith(id: string, roster: RosterEntry[], seed: number): Coach {
  return { id, name: `Coach ${id}`, abbrev: id.toUpperCase(), isHuman: false, roster, pointsSpent: 0, sets: buildSeasonSets(roster, seed) };
}

describe('mega sets', () => {
  it('a Mega roster entry battles as its base species holding the stone', () => {
    const set = buildSetFor('charizardmegax', { seed: 3, isTeraCaptain: false });
    expect(set.species).toBe('Charizard');
    expect(set.name).toBe('Charizard');
    expect(set.item).toBe('Charizardite X');
    expect(['Blaze', 'Solar Power']).toContain(set.ability);
    // Mega X is a physical attacker: the spread invests Attack.
    expect(set.evs.atk).toBeGreaterThan(0);
    expect(battleSpeciesId('charizardmegax')).toBe('charizard');
    expect(battleSpeciesId('garchomp')).toBe('garchomp');
  });

  it('buildSeasonSets keys a Mega by its roster id and ignores the Z flag on it', () => {
    const sets = buildSeasonSets([
      { species: 'charizardmegay', isTeraCaptain: false, isZCaptain: true },
      { species: 'garchomp', isTeraCaptain: true },
    ], 9);
    expect(Object.keys(sets).sort()).toEqual(['charizardmegay', 'garchomp']);
    expect(sets.charizardmegay?.item).toBe('Charizardite Y');
    expect(sets.charizardmegay?.species).toBe('Charizard');
  });

  it('chooseLineup scores a Mega by the Mega form and returns roster ids', () => {
    const roster: RosterEntry[] = ['charizardmegax', ...FILLER].map(s => ({ species: s, isTeraCaptain: false }));
    const sets = buildSeasonSets(roster, 4);
    const opp = FILLER.map(s => ({ species: s, isTeraCaptain: false }));
    const lineup = chooseLineup(roster, sets, opp, 4);
    expect(lineup).toHaveLength(6);
    for (const id of lineup) expect(roster.some(r => r.species === id)).toBe(true);
  });
});

describe('z captains', () => {
  it('holds the type Z-Crystal of its strongest STAB attack', () => {
    const set = buildSetFor('garchomp', { seed: 5, isTeraCaptain: false, isZCaptain: true });
    const expected = zCrystalFor(set.moves, Dex.species.get('garchomp').types);
    expect(expected).toBeTruthy();
    expect(set.item).toBe(expected);
    expect(Dex.items.get(set.item).zMoveType).toBeTruthy();
  });

  it('picks the STAB type by base power, else the strongest attack', () => {
    expect(zCrystalFor(['Earthquake', 'Fire Blast', 'Swords Dance'], ['Ground', 'Dragon'])).toBe(Z_CRYSTAL_BY_TYPE.Ground);
    expect(zCrystalFor(['Earthquake', 'Outrage'], ['Ground', 'Dragon'])).toBe(Z_CRYSTAL_BY_TYPE.Dragon);
    expect(zCrystalFor(['Ice Beam', 'Thunderbolt', 'Recover'], ['Normal'])).toBe(Z_CRYSTAL_BY_TYPE.Ice);
    expect(zCrystalFor(['Recover'], ['Normal'])).toBeUndefined();
  });

  it('leaves an item-locked forme its item', () => {
    const set = buildSetFor('zaciancrowned', { seed: 5, isTeraCaptain: false, isZCaptain: true });
    expect(set.item).toBe('Rusted Sword');
  });
});

/** A crafted request: our Garchomp (Groundium Z, moves EQ + Swords Dance) facing Dondozo (EQ ~35%, Tectonic Rage ~62%). */
function zRequest(oppHp: number, zAllowed = true): { req: ParsedRequest; ctx: PlayerContext } {
  const zSet: BattleSet = {
    name: 'Garchomp', species: 'Garchomp', item: 'Groundium Z', ability: 'Rough Skin', moves: ['Earthquake', 'Swords Dance'],
    nature: 'Adamant', gender: '', evs: { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, level: 100, teraType: 'Ground',
  };
  const req: ParsedRequest = {
    rqid: 3,
    active: [{
      moves: [
        { move: 'Earthquake', id: 'earthquake', pp: 16, maxpp: 16, target: 'allAdjacent', disabled: false },
        { move: 'Swords Dance', id: 'swordsdance', pp: 32, maxpp: 32, target: 'self', disabled: false },
      ],
      canZMove: zAllowed ? [{ move: 'Tectonic Rage', target: 'normal' }, { move: 'Z-Swords Dance', target: 'self' }] : undefined,
    }],
    side: {
      name: 'A', id: 'p1',
      pokemon: [{
        ident: 'p1: Garchomp', details: 'Garchomp, M', condition: '357/357', active: true,
        stats: { atk: 359, def: 226, spa: 176, spd: 206, spe: 333 }, moves: ['earthquake', 'swordsdance'],
        baseAbility: 'roughskin', item: 'groundiumz', ability: 'roughskin', teraType: 'Ground',
      }],
    },
  };
  const log = [
    '|player|p1|A|', '|player|p2|B|',
    '|switch|p1a: Garchomp|Garchomp, M|357/357',
    '|switch|p2a: Dondozo|Dondozo, F|100/100',
    `|-damage|p2a: Dondozo|${oppHp}/100`,
    '|turn|1',
  ];
  return { req, ctx: { side: 'p1', teraCaptains: new Set(), log, opponentTeam: ['dondozo'], ownTeam: [zSet] } };
}

describe('heuristic player: mega and Z', () => {
  it('fires the Z-move when it KOs and the plain move does not', () => {
    const { req, ctx } = zRequest(55);
    const p = new HeuristicPlayer(1);
    p.epsilon = 0;
    expect(p.choose(req, ctx)).toBe('move 1 zmove');
  });

  it('fires the Z-move for a big hit when no plain move does 40%', () => {
    const { req, ctx } = zRequest(100);
    const p = new HeuristicPlayer(1);
    p.epsilon = 0;
    expect(p.choose(req, ctx)).toBe('move 1 zmove');
  });

  it('keeps the Z-move when the plain move already KOs, and never without the option', () => {
    const p = new HeuristicPlayer(1);
    p.epsilon = 0;
    const low = zRequest(25);
    expect(p.choose(low.req, low.ctx)).toBe('move 1');
    const none = zRequest(55, false);
    expect(new HeuristicPlayer(1).choose(none.req, none.ctx)).not.toContain('zmove');
  });

  it('appends mega to a move when the request allows Mega Evolution', () => {
    const { req, ctx } = zRequest(100, false);
    const mreq: ParsedRequest = {
      ...req,
      active: [{ ...req.active![0]!, canMegaEvo: true }],
      side: { ...req.side, pokemon: [{ ...req.side.pokemon[0]!, item: 'garchompite', details: 'Garchomp, M' }] },
    };
    const choice = new HeuristicPlayer(2).choose(mreq, { ...ctx, ownTeam: [{ ...ctx.ownTeam[0]!, item: 'Garchompite' }] });
    expect(choice).toMatch(/^move \d mega$/);
  });

  it('the opponent model follows detailschange to the Mega form', () => {
    const log = [
      '|switch|p2a: Charizard|Charizard, F|100/100',
      '|-ability|p2a: Charizard|Blaze',
      '|detailschange|p2a: Charizard|Charizard-Mega-X, F',
      '|-mega|p2a: Charizard|Charizard|Charizardite X',
    ];
    const mon = viewOf(log).sides.p2.mons.get('Charizard')!;
    expect(mon.forme).toBe('Charizard-Mega-X');
    expect(mon.ability).toBe('Tough Claws');
    expect(mon.item).toBe('Charizardite X');
  });
});

describe('mega + Z battles', () => {
  it('an AI side bringing Charizard-Mega-X Mega Evolves, and scout folds it onto the roster id', async () => {
    const roster: RosterEntry[] = ['charizardmegax', 'garchomp', 'corviknight', 'toxapex', 'clefable', 'kingambit'].map(s => ({ species: s, isTeraCaptain: false }));
    const sets = buildSeasonSets(roster, 2);
    const team = roster.map(r => sets[r.species]!);
    const oppTeam = ['rotomwash', 'heatran', 'dragapult', 'tinglu', 'skeledirge', 'greattusk'].map(id => buildSetFor(id, { seed: 2, isTeraCaptain: false }));
    const o = await runBattle({
      p1: { name: 'A', team, player: new HeuristicPlayer(1), teraCaptains: [] },
      p2: { name: 'B', team: oppTeam, player: new HeuristicPlayer(2), teraCaptains: [] },
      seed: new Rng(11).seed4(),
    });
    const sentOut = o.log.some(l => /^\|(switch|drag)\|p1a: Charizard\|/.test(l));
    expect(sentOut).toBe(true);
    expect(o.log.some(l => /^\|detailschange\|p1a: Charizard\|Charizard-Mega-X/.test(l))).toBe(true);
    expect(o.log.some(l => l.startsWith('|-mega|p1a: Charizard'))).toBe(true);
    expect(o.log.some(l => l.includes('terastallize'))).toBe(false);
    const report = scoutFromLogs('a', [{ log: o.log, coachSide: 'p1' }], roster);
    expect(report.bySpecies.charizard).toBeUndefined();
    expect(report.bySpecies.charizardmegax?.timesBrought).toBe(1);
    expect(report.bySpecies.charizardmegax?.item).toBe('Charizardite X');
    // Without a roster the battle id stays (backward compatible).
    expect(scoutFromLogs('a', [{ log: o.log, coachSide: 'p1' }]).bySpecies.charizard?.timesBrought).toBe(1);
  }, 60_000);

  it('a Z captain fires its Z-move across a few seeds, and scout reveals the crystal', async () => {
    let fired = 0;
    for (let seed = 1; seed <= 8 && fired === 0; seed++) {
      const roster: RosterEntry[] = [
        { species: 'garchomp', isTeraCaptain: false, isZCaptain: true },
        ...['corviknight', 'toxapex', 'clefable', 'kingambit', 'rotomwash'].map(s => ({ species: s, isTeraCaptain: false })),
      ];
      const sets = buildSeasonSets(roster, seed);
      // Slow, bulky, grounded walls: the lead Garchomp lives to act and its Ground Z-move has targets.
      const oppTeam = ['dondozo', 'hippowdon', 'tinglu', 'clodsire', 'garganacl', 'heatran'].map(id => buildSetFor(id, { seed, isTeraCaptain: false }));
      const o = await runBattle({
        p1: { name: 'A', team: roster.map(r => sets[r.species]!), player: new HeuristicPlayer(seed), teraCaptains: [] },
        p2: { name: 'B', team: oppTeam, player: new HeuristicPlayer(seed + 50), teraCaptains: [] },
        seed: new Rng(seed * 13).seed4(),
      });
      if (o.log.some(l => l.startsWith('|-zpower|p1a: Garchomp'))) {
        fired++;
        const mon = scoutFromLogs('a', [{ log: o.log, coachSide: 'p1' }], roster).bySpecies.garchomp;
        expect(mon?.item).toBe(sets.garchomp!.item);
        expect(mon?.moves.every(m => !Dex.moves.get(m).isZ)).toBe(true);
      }
    }
    expect(fired).toBeGreaterThan(0);
  }, 120_000);

  it('simulateMatch with Mega entries on both sides reports roster-id lineups', async () => {
    const homeRoster: RosterEntry[] = ['charizardmegax', 'garchomp', 'corviknight', 'toxapex', 'clefable', 'kingambit', 'rotomwash']
      .map((s, i) => ({ species: s, isTeraCaptain: i === 1 }));
    const awayRoster: RosterEntry[] = ['gyaradosmega', 'heatran', 'dragapult', 'tinglu', 'skeledirge', 'greattusk', 'gholdengo']
      .map((s, i) => ({ species: s, isTeraCaptain: i === 1 }));
    const home = coachWith('h', homeRoster, 6);
    const away = coachWith('w', awayRoster, 7);
    const r = await simulateMatch(home, away, 21);
    for (const [coach, roster] of [['h', homeRoster], ['w', awayRoster]] as const) {
      const lineup = r.lineups[coach]!;
      expect(lineup).toHaveLength(6);
      expect(new Set(lineup).size).toBe(6);
      for (const id of lineup) expect(roster.some(e => e.species === id)).toBe(true);
      expect(r.remaining[coach]).toBeGreaterThanOrEqual(0);
      expect(r.remaining[coach]).toBeLessThanOrEqual(6);
    }
    expect(r.remaining[r.loser]).toBeLessThanOrEqual(r.remaining[r.winner]!);
  }, 60_000);
});
