import type { Match, MatchResult, StandingRow } from '../types';
import { createRng } from './rng';
import { buildSchedule } from './schedule';
import { computeStandings } from './standings';
import { advancePlayoffs, bracketSeedOrder, isChampion, seedPlayoffs } from './playoffs';

function res(winner: string, loser: string, wr = 3, lr = 0): MatchResult {
  return { winner, loser, log: [], turns: 20, remaining: { [winner]: wr, [loser]: lr }, lineups: {} };
}

describe('rng', () => {
  it('is deterministic and in range', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 50; i++) {
      const x = a.next();
      expect(x).toBe(b.next());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    const r = createRng(1);
    for (let i = 0; i < 100; i++) expect(r.int(7)).toBeLessThan(7);
    expect(r.shuffle([1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('schedule', () => {
  for (const teams of [8, 12, 16]) {
    it(`${teams} teams x 9 weeks: once per week, no early repeats`, () => {
      const ids = Array.from({ length: teams }, (_, i) => `c${i}`);
      const sched = buildSchedule(ids, 9, createRng(teams));
      expect(sched.length).toBe(9 * teams / 2);
      for (let w = 1; w <= 9; w++) {
        const wk = sched.filter((m) => m.week === w);
        const seen = wk.flatMap((m) => [m.home, m.away]);
        expect(new Set(seen).size).toBe(teams);
        expect(seen.length).toBe(teams);
      }
      const firstCycle = sched.filter((m) => m.week <= teams - 1);
      const pairs = firstCycle.map((m) => [m.home, m.away].sort().join('-'));
      expect(new Set(pairs).size).toBe(pairs.length);
      expect(new Set(sched.map((m) => m.id)).size).toBe(sched.length);
      expect(sched[0]!.id).toBe('w1m1');
      for (const id of ids) {
        const home = sched.filter((m) => m.home === id).length;
        expect(Math.abs(home - (9 - home))).toBeLessThanOrEqual(3);
      }
    });
  }

  it('a full cycle meets everyone exactly once', () => {
    const ids = Array.from({ length: 8 }, (_, i) => `c${i}`);
    const sched = buildSchedule(ids, 7, createRng(5));
    const pairs = new Set(sched.map((m) => [m.home, m.away].sort().join('-')));
    expect(pairs.size).toBe(28);
  });
});

describe('standings', () => {
  it('orders by wins, differential, head-to-head, then id', () => {
    const m = (id: string, r: MatchResult): Match => ({ id, week: 1, home: r.winner, away: r.loser, result: r });
    const matches: Match[] = [
      m('a', res('A', 'D', 3, 0)),
      m('b', res('B', 'C', 2, 0)),
      m('c', res('C', 'A', 1, 0)),
      m('d', res('D', 'B', 1, 0)),
      m('e', res('B', 'A', 2, 0)),
      m('f', res('C', 'D', 1, 0)),
      // playoff game must not count
      { id: 'p', week: 9, home: 'D', away: 'A', playoffRound: 1, result: res('D', 'A', 6, 0) },
    ];
    const s = computeStandings(['A', 'B', 'C', 'D'], matches);
    // B: 2-1 diff +3; C: 2-1 diff 0; A: 1-2 diff 0; D: 1-2 diff -3
    expect(s.map((r) => r.coach)).toEqual(['B', 'C', 'A', 'D']);
    expect(s[0]).toMatchObject({ wins: 2, losses: 1, differential: 3, rank: 1 });

    // Pure head-to-head tie: X and Y both 1-1, diff 0; Y beat X.
    const t = computeStandings(['X', 'Y', 'Z'], [
      m('1', res('Y', 'X', 1, 0)),
      m('2', res('X', 'Z', 1, 0)),
      m('3', res('Z', 'Y', 1, 0)),
    ]);
    // all three 1-1 diff 0, h2h 1 each -> id order
    expect(t.map((r) => r.coach)).toEqual(['X', 'Y', 'Z']);
    // P and Q both 1-1 diff 0; Q beat P, so Q ranks above P despite id order.
    const u = computeStandings(['P', 'Q', 'R', 'S'], [
      m('1', res('Q', 'P', 1, 0)),
      m('2', res('P', 'R', 1, 0)),
      m('3', res('S', 'Q', 1, 0)),
    ]);
    expect(u.map((r) => r.coach)).toEqual(['S', 'Q', 'P', 'R']);
  });
});

describe('playoffs', () => {
  const rows = (n: number): StandingRow[] =>
    Array.from({ length: n }, (_, i) => ({ coach: `s${i + 1}`, wins: n - i, losses: i, differential: 0, rank: i + 1 }));

  it('seeds 8 as 1v8, 4v5, 3v6, 2v7 and advances to a champion', () => {
    expect(bracketSeedOrder(8)).toEqual([1, 8, 4, 5, 3, 6, 2, 7]);
    const r1 = seedPlayoffs(rows(16), 8, 10);
    expect(r1.map((m) => `${m.home}v${m.away}`)).toEqual(['s1vs8', 's4vs5', 's3vs6', 's2vs7']);
    expect(r1.every((m) => m.week === 10 && m.playoffRound === 1)).toBe(true);
    // Higher seed always wins.
    const play = (ms: Match[]): Match[] => ms.map((m) => ({ ...m, result: res(m.home, m.away) }));
    let all = play(r1);
    const r2 = advancePlayoffs(all, 1);
    expect(r2.map((m) => `${m.home}v${m.away}`)).toEqual(['s1vs4', 's3vs2']);
    expect(r2[0]!.week).toBe(11);
    all = [...all, ...play(r2)];
    const r3 = advancePlayoffs(all, 2);
    expect(r3.map((m) => `${m.home}v${m.away}`)).toEqual(['s1vs3']);
    expect(isChampion(all, 's1')).toBe(false);
    all = [...all, ...play(r3)];
    expect(advancePlayoffs(all, 3)).toEqual([]);
    expect(isChampion(all, 's1')).toBe(true);
    expect(isChampion(all, 's3')).toBe(false);
  });

  it('seeds 4 as 1v4, 2v3 and 2 as a final', () => {
    const r1 = seedPlayoffs(rows(8), 4, 10);
    expect(r1.map((m) => `${m.home}v${m.away}`)).toEqual(['s1vs4', 's2vs3']);
    const done = r1.map((m) => ({ ...m, result: res(m.away, m.home) }));
    const fin = advancePlayoffs(done, 1);
    expect(fin.map((m) => `${m.home}v${m.away}`)).toEqual(['s4vs3']);
    const two = seedPlayoffs(rows(8), 2, 10).map((m) => ({ ...m, result: res('s2', 's1') }));
    expect(isChampion(two, 's2')).toBe(true);
    expect(() => advancePlayoffs(r1, 1)).toThrow();
  });
});
