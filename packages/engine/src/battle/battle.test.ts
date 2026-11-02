import { Dex } from '@pkmn/sim';
import type { BattleSet, Coach, RosterEntry, SpeciesId } from '../types';
import { HeuristicPlayer } from './heuristicPlayer';
import { chooseLineup } from './lineup';
import { RandomPlayer, type BattlePlayer } from './player';
import { randomsSpeciesKeys } from './randoms';
import { Rng } from './rng';
import { createInteractiveBattle, runBattle, type BattleOutcome } from './runner';
import { scoutFromLogs } from '../logs/scout';
import { buildSeasonSets, buildSetFor } from './sets';
import { humanMatchResult, simulateMatch } from './simulateMatch';

const POOL = [...randomsSpeciesKeys()].sort();

/** n distinct-base-species roster ids, seeded. */
function pickSpecies(seed: number, n: number): SpeciesId[] {
  const rng = new Rng(seed);
  const out: SpeciesId[] = [];
  const bases = new Set<string>();
  while (out.length < n) {
    const id = rng.pick(POOL);
    const base = Dex.species.get(id).baseSpecies;
    if (bases.has(base)) continue;
    bases.add(base);
    out.push(id);
  }
  return out;
}

function teamOf(ids: SpeciesId[], seed: number): BattleSet[] {
  return ids.map(id => buildSetFor(id, { seed, isTeraCaptain: false }));
}

function battle(team1: BattleSet[], team2: BattleSet[], p1: BattlePlayer, p2: BattlePlayer, seed: number, caps: [SpeciesId[], SpeciesId[]] = [[], []]): Promise<BattleOutcome> {
  return runBattle({
    p1: { name: 'Alpha', team: team1, player: p1, teraCaptains: caps[0] },
    p2: { name: 'Beta', team: team2, player: p2, teraCaptains: caps[1] },
    seed: new Rng(seed).seed4(),
  });
}

function makeCoach(id: string, seed: number, size = 12): Coach {
  const ids = pickSpecies(seed, size);
  const roster: RosterEntry[] = ids.map((s, i) => ({ species: s, isTeraCaptain: i < 2 }));
  return { id, name: `Coach ${id}`, abbrev: id.toUpperCase(), isHuman: false, roster, pointsSpent: 0, sets: buildSeasonSets(roster, seed) };
}

describe('runner', () => {
  it('Random vs Random ends with a winner and a consistent outcome', async () => {
    const o = await battle(teamOf(pickSpecies(1, 6), 1), teamOf(pickSpecies(2, 6), 2), new RandomPlayer(1), new RandomPlayer(2), 99);
    expect(['p1', 'p2']).toContain(o.winner);
    expect(o.turns).toBeGreaterThan(0);
    expect(o.remaining[o.winner === 'p2' ? 'p2' : 'p1']).toBeGreaterThan(0);
    expect(o.remaining[o.winner === 'p1' ? 'p2' : 'p1']).toBe(0);
    expect(o.log.some(l => l.startsWith('|win|'))).toBe(true);
    expect(o.leads.p1).toBeTruthy();
  }, 30_000);

  it('runs the custom clause format (rules show in the log)', async () => {
    const o = await battle(teamOf(pickSpecies(3, 6), 3), teamOf(pickSpecies(4, 6), 4), new RandomPlayer(3), new RandomPlayer(4), 5);
    expect(o.log.some(l => l.startsWith('|rule|Species Clause'))).toBe(true);
    expect(o.log.some(l => l.startsWith('|rule|Sleep Clause Mod'))).toBe(true);
    expect(o.log.some(l => l === '|teampreview' || l.startsWith('|teampreview'))).toBe(true);
  }, 30_000);

  it('ends a battle that hits the turn cap as a tie', async () => {
    const o = await runBattle({
      p1: { name: 'A', team: teamOf(pickSpecies(5, 6), 5), player: new RandomPlayer(5), teraCaptains: [] },
      p2: { name: 'B', team: teamOf(pickSpecies(6, 6), 6), player: new RandomPlayer(6), teraCaptains: [] },
      seed: [1, 2, 3, 4], maxTurns: 2,
    });
    expect(o.winner).toBe('tie');
    expect(o.turns).toBeLessThanOrEqual(3);
  }, 30_000);

  it('survives a player that throws or answers nonsense', async () => {
    const thrower: BattlePlayer = { choose: () => { throw new Error('boom'); } };
    const garbage: BattlePlayer = { choose: () => 'move 9 nonsense' };
    const o = await battle(teamOf(pickSpecies(7, 6), 7), teamOf(pickSpecies(8, 6), 8), thrower, garbage, 7);
    expect(['p1', 'p2', 'tie']).toContain(o.winner);
  }, 30_000);

  it('only lets Tera captains terastallize', async () => {
    const ids1 = pickSpecies(9, 6);
    const ids2 = pickSpecies(10, 6);
    const caps1 = ids1.slice(0, 1);
    for (let g = 0; g < 4; g++) {
      const o = await battle(teamOf(ids1, g), teamOf(ids2, g), new HeuristicPlayer(g), new HeuristicPlayer(g + 50), g, [caps1, []]);
      const teras = o.log.filter(l => l.startsWith('|-terastallize|'));
      for (const t of teras) {
        expect(t.startsWith('|-terastallize|p1')).toBe(true);
        expect(t).toContain(Dex.species.get(caps1[0]!).name);
      }
    }
  }, 60_000);
});

describe('HeuristicPlayer', () => {
  it('beats RandomPlayer in at least 16 of 20 seeded mirror games', async () => {
    let wins = 0;
    const started = Date.now();
    for (let g = 0; g < 20; g++) {
      const team = teamOf(pickSpecies(100 + g, 6), g);
      const caps = [team[0] ? Dex.species.get(team[0].name).id : ''];
      const aiOnP1 = g % 2 === 0;
      const ai = new HeuristicPlayer(g);
      const rnd = new RandomPlayer(g + 1000);
      const o = aiOnP1
        ? await battle(team, team, ai, rnd, g, [caps, caps])
        : await battle(team, team, rnd, ai, g, [caps, caps]);
      if (o.winner === (aiOnP1 ? 'p1' : 'p2')) wins++;
    }
    const avgMs = (Date.now() - started) / 20;
    console.log(`[battle] heuristic vs random: ${wins}/20 wins, avg ${avgMs.toFixed(0)} ms per battle`);
    expect(wins).toBeGreaterThanOrEqual(16);
    expect(avgMs).toBeLessThan(2000);
  }, 120_000);
});

describe('interactive battle', () => {
  it('lets the app drive p1 through onRequest/choose and resolves the outcome', async () => {
    const ib = createInteractiveBattle({
      p1: { name: 'Human', team: teamOf(pickSpecies(20, 6), 20), teraCaptains: [] },
      p2: { name: 'AI', team: teamOf(pickSpecies(21, 6), 21), teraCaptains: [] },
      seed: [5, 6, 7, 8],
    });
    const lines: string[] = [];
    ib.onLine(l => lines.push(l));
    const human = new RandomPlayer(77);
    ib.onRequest(req => {
      // The app answers asynchronously (UI click); a microtask stands in for that.
      queueMicrotask(() => ib.choose(human.choose(req)));
    });
    const o = await ib.outcome;
    expect(['p1', 'p2', 'tie']).toContain(o.winner);
    expect(lines.some(l => l.startsWith('|turn|'))).toBe(true);
  }, 60_000);

  it('abort forfeits for the human', async () => {
    const ib = createInteractiveBattle({
      p1: { name: 'Human', team: teamOf(pickSpecies(22, 6), 22), teraCaptains: [] },
      p2: { name: 'AI', team: teamOf(pickSpecies(23, 6), 23), teraCaptains: [] },
      seed: [1, 1, 1, 1],
    });
    await new Promise<void>(res => ib.onRequest(() => res()));
    ib.abort();
    const o = await ib.outcome;
    expect(o.winner).toBe('p2');
  }, 30_000);
});

describe('scout', () => {
  it('parses moves, items, abilities, leads and brought mons from a real battle log', async () => {
    const ids = pickSpecies(30, 6);
    const team = teamOf(ids, 30);
    const o = await battle(team, teamOf(pickSpecies(31, 6), 31), new HeuristicPlayer(1), new HeuristicPlayer(2), 30, [ids.slice(0, 1), []]);
    const report = scoutFromLogs('coachA', [{ log: o.log, coachSide: 'p1' }, { log: o.log, coachSide: 'p1' }]);
    expect(report.matchesScouted).toBe(2);
    const scouted = Object.keys(report.bySpecies).sort();
    expect(scouted).toEqual([...ids].sort());
    for (const id of ids) expect(report.bySpecies[id]?.timesBrought).toBe(2);
    expect(report.bySpecies[o.leads.p1]?.timesLed).toBe(2);
    // Every scouted move belongs to that mon's actual set.
    for (const id of ids) {
      const set = team.find(s => Dex.species.get(s.name).id === id)!;
      const legal = new Set(set.moves.map(m => Dex.moves.get(m).id));
      for (const m of report.bySpecies[id]!.moves) expect(legal.has(Dex.moves.get(m).id)).toBe(true);
      const item = report.bySpecies[id]!.item;
      if (item) expect(Dex.items.get(item).id).toBe(Dex.items.get(set.item).id);
    }
    expect(Object.values(report.bySpecies).some(m => m.moves.length > 0)).toBe(true);
  }, 30_000);
});

describe('lineup', () => {
  it('picks 6 distinct roster mons with role coverage, deterministically', () => {
    const coach = makeCoach('a', 40);
    const opp = makeCoach('b', 41);
    const a = chooseLineup(coach.roster, coach.sets, opp.roster, 1);
    const b = chooseLineup(coach.roster, coach.sets, opp.roster, 1);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(6);
    for (const id of a) expect(coach.roster.some(r => r.species === id)).toBe(true);
    const hazardOnRoster = coach.roster.some(r => coach.sets[r.species]!.moves.some(m => ['stealthrock', 'spikes', 'toxicspikes', 'stickyweb'].includes(Dex.moves.get(m).id)));
    if (hazardOnRoster) {
      expect(a.some(id => coach.sets[id]!.moves.some(m => ['stealthrock', 'spikes', 'toxicspikes', 'stickyweb'].includes(Dex.moves.get(m).id)))).toBe(true);
    }
  });

  it('returns the whole roster when it has 6 or fewer', () => {
    const coach = makeCoach('c', 42, 5);
    expect(chooseLineup(coach.roster, coach.sets, [], 3)).toEqual(coach.roster.map(r => r.species));
  });
});

describe('simulateMatch', () => {
  it('produces a result consistent with its log', async () => {
    const home = makeCoach('home', 50);
    const away = makeCoach('away', 51);
    const r = await simulateMatch(home, away, 12345);
    expect([home.id, away.id]).toContain(r.winner);
    expect(r.loser).toBe(r.winner === home.id ? away.id : home.id);
    expect(r.lineups[home.id]).toHaveLength(6);
    expect(r.lineups[away.id]).toHaveLength(6);
    const winLine = r.log.find(l => l.startsWith('|win|'));
    if (winLine) {
      const winnerCoach = r.winner === home.id ? home : away;
      expect(winLine).toBe(`|win|${winnerCoach.name}`);
      expect(r.remaining[r.loser]).toBe(0);
      expect(r.remaining[r.winner]).toBeGreaterThan(0);
    }
    const lastTurn = Math.max(0, ...r.log.filter(l => l.startsWith('|turn|')).map(l => Number(l.slice(6))));
    expect(r.turns).toBe(lastTurn);
    // Brought mons in the log match the lineups.
    const pokes = r.log.filter(l => l.startsWith('|poke|p1|')).length;
    expect(pokes).toBe(6);
    const again = await simulateMatch(home, away, 12345);
    expect(again.winner).toBe(r.winner);
    expect(again.turns).toBe(r.turns);
  }, 30_000);

  it('maps an interactive outcome to a MatchResult for the human', () => {
    const human = makeCoach('me', 60, 6);
    const opp = makeCoach('them', 61, 6);
    const lineups = { me: human.roster.map(r => r.species), them: opp.roster.map(r => r.species) };
    const outcome: BattleOutcome = { winner: 'p1', turns: 20, remaining: { p1: 2, p2: 0 }, log: [], leads: { p1: lineups.me[0]!, p2: lineups.them[0]! } };
    const r = humanMatchResult(outcome, human, opp, lineups);
    expect(r.winner).toBe('me');
    expect(r.remaining).toEqual({ me: 2, them: 0 });
    const tie = humanMatchResult({ ...outcome, winner: 'tie', remaining: { p1: 1, p2: 3 } }, human, opp, lineups);
    expect(tie.winner).toBe('them');
  });
});
