import { beforeAll, describe, expect, it } from 'vitest';
import type { Coach, MatchResult, RunState } from './types';
import { buildDraftPool } from './draft/pool';
import { aiChoosePick } from './draft/draft';
import { createRng, deriveSeed } from './league/rng';
import { createRun, draftPick, finishDraft, humanCoach, nextHumanMatch, opponentOf, resolveWeek, runAiDraftUntilHuman } from './league/run';
import { DAILY_CONFIG } from './league/daily';
import { decisiveMatch, summarizeRun } from './league/summary';
import { MAX_STAKE } from './data/stakes';
import { POOL_PROGRESSION } from './data/progression';
import { packOffer } from './poolProgress';
import { careerStats, emptyProfile, firstWinsOf, markDrafted, mergeProfiles, migrateProfile, openPack, PROFILE_RUN_CAP, recordRunEnd, type Profile } from './profile';

/** A result with real lineups: each side brings its first six roster mons. */
function result(winner: Coach, loser: Coach): MatchResult {
  const six = (c: Coach) => c.roster.slice(0, 6).map((r) => r.species);
  return {
    winner: winner.id, loser: loser.id, log: ['|win|x'], turns: 20,
    remaining: { [winner.id]: 2, [loser.id]: 0 }, lineups: { [winner.id]: six(winner), [loser.id]: six(loser) },
  };
}
const fakeSim = (home: Coach, away: Coach, seed: number): MatchResult =>
  (createRng(seed).next() < 0.5 ? result(home, away) : result(away, home));

function drafted(opts: { stake?: number; daily?: string } = {}): RunState {
  const config = { ...DAILY_CONFIG, stake: opts.stake ?? 1 };
  let run = createRun({ config, seed: 4242, humanName: 'Test Town Testers', humanAbbrev: 'TST', createdAt: 1, ...(opts.daily ? { daily: { date: opts.daily } } : {}) });
  const pool = buildDraftPool({ megas: config.megas });
  for (;;) {
    run = runAiDraftUntilHuman(run);
    if (run.draft.complete) break;
    run = draftPick(run, aiChoosePick(run.draft, run.humanId, run.config, pool, createRng(deriveSeed(7, 'h', run.draft.pickIndex))));
  }
  return finishDraft(run, { buildSets: () => ({}) });
}

async function playOut(run: RunState, humanWins: boolean): Promise<RunState> {
  let cur = run;
  for (let guard = 0; (cur.phase === 'season' || cur.phase === 'playoffs') && guard < 50; guard++) {
    const m = nextHumanMatch(cur)!;
    const me = humanCoach(cur);
    const opp = opponentOf(cur, m);
    cur = await resolveWeek(cur, humanWins ? result(me, opp) : result(opp, me), { simulateMatch: fakeSim });
  }
  return cur;
}

let champ: RunState;
let bust: RunState;
beforeAll(async () => {
  const run = drafted();
  champ = await playOut(run, true);
  bust = await playOut(run, false);
});

describe('profile', () => {
  it('migrates v1 and garbage to a v3 profile with an empty career and a seeded pool', () => {
    expect(migrateProfile({ version: 1, stakeUnlocked: 3 }, 5)).toEqual({ ...emptyProfile(5), stakeUnlocked: 3 });
    expect(migrateProfile(null, 5)).toEqual(emptyProfile(5));
    expect(migrateProfile('nope', 5)).toEqual(emptyProfile(5));
    expect(migrateProfile({ version: 1, stakeUnlocked: 99 }, 5).stakeUnlocked).toBe(MAX_STAKE);
    const p = recordRunEnd(emptyProfile(), champ, 10);
    expect(migrateProfile(JSON.parse(JSON.stringify(p)), 5)).toEqual(p);
  });

  it('migrates a v2 profile: its pool is the seeded start plus everything it drafted, wins start at playoff wins', () => {
    const v3 = recordRunEnd(emptyProfile(), champ, 10);
    const v2 = {
      version: 2, stakeUnlocked: v3.stakeUnlocked,
      runs: v3.runs.map(({ winsBy: _w, ...r }) => r),
      trophies: Object.fromEntries(Object.entries(v3.trophies).map(([id, { wins: _w, ...t }]) => [id, t])),
    };
    const m = migrateProfile(JSON.parse(JSON.stringify(v2)), 77);
    expect(m.version).toBe(3);
    expect(m.runs.map((r) => r.runId)).toEqual([champ.id]);
    const have = new Set(m.pool.unlocked);
    for (const id of humanCoach(champ).roster.map((r) => r.species)) {
      expect(have.has(id)).toBe(true);
      expect(m.trophies[id]!.wins).toBe(m.trophies[id]!.playoffWins);
    }
    for (const id of emptyProfile(77).pool.unlocked) expect(have.has(id)).toBe(true);
    expect(m.pool).toMatchObject({ seed: 77, packs: 0, points: 0, opened: 0, fresh: [] });
  });

  it('pays the pool: a point per first-win species, a floor pack per finished run, never twice', () => {
    const p = recordRunEnd(emptyProfile(), champ, 10);
    const won = Object.keys(p.runs[0]!.winsBy ?? {});
    expect(won.length).toBeGreaterThan(0);
    expect(p.pool.packs * POOL_PROGRESSION.pointsPerPack + p.pool.points)
      .toBe(won.length + POOL_PROGRESSION.floorPacksPerRun * POOL_PROGRESSION.pointsPerPack);
    for (const id of won) expect(p.trophies[id]!.wins).toBeGreaterThan(0);
    // The same species winning again pays no new points; the lost run still opens its floor pack.
    const again = recordRunEnd(p, { ...champ, id: 'again' }, 11);
    expect(again.pool.packs - p.pool.packs).toBe(POOL_PROGRESSION.floorPacksPerRun);
    expect(again.pool.points).toBe(p.pool.points);
    const lost = recordRunEnd(emptyProfile(), bust, 10);
    expect(lost.pool.packs).toBeGreaterThanOrEqual(POOL_PROGRESSION.floorPacksPerRun);
    expect(firstWinsOf(emptyProfile(), champ).sort()).toEqual(won.sort());
    expect(firstWinsOf(p, champ)).toEqual([]);
  });

  it('opens a pack into the pool and drafting clears its NEW flair', () => {
    const p = recordRunEnd(emptyProfile(3), bust, 10);
    const offer = packOffer(p.pool);
    expect(offer.length).toBe(POOL_PROGRESSION.packSize);
    const opened = openPack(p, offer[1]!.id);
    expect(opened.pool.packs).toBe(p.pool.packs - 1);
    expect(opened.pool.unlocked).toContain(offer[1]!.id);
    expect(opened.pool.fresh).toEqual([offer[1]!.id]);
    expect(() => openPack(p, 'notamon')).toThrow();
    expect(markDrafted(opened, ['pikachu'])).toBe(opened);
    expect(markDrafted(opened, [offer[1]!.id]).pool.fresh).toEqual([]);
    let empty = emptyProfile(3);
    expect(() => openPack(empty, offer[0]!.id)).toThrow();
    empty = { ...empty, pool: { ...empty.pool, packs: 1 } };
    expect(openPack(empty, packOffer(empty.pool)[0]!.id).pool.packs).toBe(0);
  });

  it('ignores a run in progress and records a finished run exactly once', () => {
    const start = emptyProfile();
    expect(recordRunEnd(start, drafted(), 1)).toBe(start);
    const once = recordRunEnd(start, champ, 10);
    expect(once.runs.map((r) => r.runId)).toEqual([champ.id]);
    expect(recordRunEnd(once, champ, 20)).toBe(once);
  });

  it('trophy counts match the played-out run', () => {
    const p = recordRunEnd(emptyProfile(), champ, 10);
    const human = humanCoach(champ);
    const roster = human.roster.map((r) => r.species);
    const playoffWins = champ.matches.filter((m) => m.playoffRound !== undefined && m.result?.winner === human.id);
    expect(playoffWins.length).toBeGreaterThan(0);
    expect(Object.keys(p.trophies).sort()).toEqual([...roster].sort());
    for (const id of roster) {
      const t = p.trophies[id]!;
      expect(t.drafted).toBe(1);
      expect(t.titles).toBe(1);
      expect(t.playoffWins).toBe(playoffWins.filter((m) => m.result!.lineups[human.id]!.includes(id)).length);
    }
    const mvps = Object.values(p.trophies).reduce((n, t) => n + t.mvp, 0);
    expect(mvps).toBe(p.runs[0]!.mvp ? 1 : 0);
    if (p.runs[0]!.mvp) expect(p.trophies[p.runs[0]!.mvp.species]!.mvp).toBe(1);

    const lost = recordRunEnd(p, { ...bust, id: 'bust' }, 11);
    for (const id of roster) {
      expect(lost.trophies[id]!.drafted).toBe(2);
      expect(lost.trophies[id]!.titles).toBe(1);
      expect(lost.trophies[id]!.playoffWins).toBe(p.trophies[id]!.playoffWins);
    }
  });

  it('raises the stake like the setup ladder: a league title at the top stake, never a daily', async () => {
    expect(recordRunEnd(emptyProfile(), champ, 1).stakeUnlocked).toBe(2);
    expect(recordRunEnd(emptyProfile(), bust, 1).stakeUnlocked).toBe(1);
    expect(recordRunEnd({ ...emptyProfile(), stakeUnlocked: 3 }, champ, 1).stakeUnlocked).toBe(3);
    const daily = await playOut(drafted({ daily: '2026-11-02' }), true);
    const pd = recordRunEnd(emptyProfile(), daily, 1);
    expect(pd.stakeUnlocked).toBe(1);
    expect(pd.runs[0]!.daily).toBe('2026-11-02');
    const top = { ...champ, config: { ...champ.config, stake: MAX_STAKE } };
    expect(recordRunEnd({ ...emptyProfile(), stakeUnlocked: MAX_STAKE }, top, 1).stakeUnlocked).toBe(MAX_STAKE);
    const custom = { ...champ, config: { ...champ.config, custom: true } };
    const pc = recordRunEnd(emptyProfile(), custom, 1);
    expect(pc.stakeUnlocked).toBe(1);
    expect(careerStats(pc)).toMatchObject({ titles: 1, bestStakeWon: 0 });
  });

  it('caps the run list newest last while trophies keep counting', () => {
    let p = emptyProfile();
    const n = PROFILE_RUN_CAP + 5;
    for (let i = 0; i < n; i++) p = recordRunEnd(p, { ...(i % 2 ? bust : champ), id: `run-${i}` }, i);
    expect(p.runs.length).toBe(PROFILE_RUN_CAP);
    expect(p.runs.at(-1)!.runId).toBe(`run-${n - 1}`);
    expect(p.runs[0]!.runId).toBe(`run-${n - PROFILE_RUN_CAP}`);
    const someone = humanCoach(champ).roster[0]!.species;
    expect(p.trophies[someone]!.drafted).toBe(n);
  });

  it('career stats hold their invariants', () => {
    const empty = careerStats(emptyProfile());
    expect(empty).toMatchObject({ runs: 0, titles: 0, bestStakeWon: 0, winRate: 0, bestScore: 0, longestTitleStreak: 0 });
    expect(empty.titlesPerStake).toEqual(Array.from({ length: MAX_STAKE }, () => 0));

    let p: Profile = emptyProfile();
    const seq = [champ, champ, bust, champ, champ, champ, bust];
    seq.forEach((r, i) => { p = recordRunEnd(p, { ...r, id: `s-${i}`, config: { ...r.config, stake: 1 + (i % 3) } }, i); });
    const s = careerStats(p);
    expect(s.runs).toBe(seq.length);
    expect(s.titles).toBe(5);
    expect(s.longestTitleStreak).toBe(3);
    expect(s.titlesPerStake.reduce((a, b) => a + b, 0)).toBe(s.titles);
    expect(s.titlesPerStake.length).toBe(MAX_STAKE);
    expect(s.bestStakeWon).toBe(3);
    expect(s.winRate).toBeGreaterThan(0);
    expect(s.winRate).toBeLessThan(1);
    expect(s.bestScore).toBe(Math.max(...p.runs.map((r) => r.score)));
  });

  it('merges by run id, never dropping local runs, and counts each run once', () => {
    const a = recordRunEnd(emptyProfile(), { ...champ, id: 'a' }, 1);
    const b = recordRunEnd(recordRunEnd(emptyProfile(), { ...bust, id: 'b' }, 2), { ...champ, id: 'a' }, 1);
    expect(mergeProfiles(a, a)).toBe(a);
    const m = mergeProfiles(a, b);
    expect(m.runs.map((r) => r.runId)).toEqual(['a', 'b']);
    expect(mergeProfiles(m, b)).toBe(m);
    const both = recordRunEnd(recordRunEnd(emptyProfile(), { ...champ, id: 'a' }, 1), { ...bust, id: 'b' }, 2);
    expect(m.trophies).toEqual(both.trophies);
    expect(m.pool).toEqual(both.pool);
    expect(m.stakeUnlocked).toBe(2);
    expect(mergeProfiles(emptyProfile(), b).trophies).toEqual(b.trophies);
    // Species unlocked elsewhere join the pool even with no new runs.
    const other = { ...a, pool: { ...a.pool, unlocked: [...a.pool.unlocked, ...emptyProfile(9).pool.unlocked] } };
    const u = mergeProfiles(a, other);
    expect(new Set(u.pool.unlocked)).toEqual(new Set(other.pool.unlocked));
    expect(u.pool.unlocked).toEqual([...new Set(u.pool.unlocked)].sort());
  });
});

describe('decisiveMatch', () => {
  it('is the final for a champion and the losing match for a bust', () => {
    const final = decisiveMatch(champ)!;
    expect(final.playoffRound).toBe(Math.max(...champ.matches.map((m) => m.playoffRound ?? 0)));
    expect(final.result!.winner).toBe(champ.humanId);
    const lost = decisiveMatch(bust)!;
    expect(lost.result!.loser).toBe(bust.humanId);
    expect(summarizeRun(bust, 1).eliminationReason).toBe('lossCap');
    expect(lost.week).toBe(Math.max(...bust.matches.filter((m) => m.result && (m.home === bust.humanId || m.away === bust.humanId)).map((m) => m.week)));
    expect(decisiveMatch(drafted())).toBeUndefined();
  });
});
