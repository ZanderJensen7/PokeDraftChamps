import { DEFAULT_LEAGUE_CONFIG, type Coach, type MatchResult, type RunState } from '../types';
import { buildDraftPool } from '../draft/pool';
import { aiChoosePick } from '../draft/draft';
import { validateLeagueConfig } from './config';
import { createRng, deriveSeed } from './rng';
import { createRun, draftPick, finishDraft, nextHumanMatch, opponentOf, resolveWeek, runAiDraftUntilHuman, serializeRun, deserializeRun } from './run';
import { DAILY_CONFIG, dailyDate, dailyInfo, dailySeed, isDailyDate } from './daily';
import { DAILY_SCORE, resultLabel, runScore, shareString, summarizeRun } from './summary';

function result(winner: string, loser: string, wr = 3): MatchResult {
  return { winner, loser, log: ['|win|x'], turns: 25, remaining: { [winner]: wr, [loser]: 0 }, lineups: {} };
}
const fakeSim = (home: Coach, away: Coach, seed: number): MatchResult => {
  const r = createRng(seed);
  return r.next() < 0.5 ? result(home.id, away.id, 1 + r.int(6)) : result(away.id, home.id, 1 + r.int(6));
};
const fakeSets = (): Record<string, never> => ({});

function draftedDaily(date: string, humanName = 'Test Town Testers', abbrev = 'TST'): RunState {
  const info = dailyInfo(date);
  let run = createRun({ config: info.config, seed: info.seed, humanName, humanAbbrev: abbrev, createdAt: 1, daily: { date } });
  const pool = buildDraftPool({ megas: info.config.megas });
  for (;;) {
    run = runAiDraftUntilHuman(run);
    if (run.draft.complete) break;
    run = draftPick(run, aiChoosePick(run.draft, run.humanId, run.config, pool, createRng(deriveSeed(7, 'h', run.draft.pickIndex))));
  }
  return finishDraft(run, { buildSets: fakeSets });
}

async function playOut(run: RunState, humanWins: (week: number) => boolean): Promise<RunState> {
  let cur = run;
  let guard = 0;
  while ((cur.phase === 'season' || cur.phase === 'playoffs') && guard++ < 50) {
    const m = nextHumanMatch(cur)!;
    const opp = opponentOf(cur, m).id;
    const r = humanWins(cur.week) ? result(cur.humanId, opp, 2) : result(opp, cur.humanId, 2);
    cur = await resolveWeek(cur, r, { simulateMatch: fakeSim });
  }
  return cur;
}

describe('daily league', () => {
  it('has a valid config smaller than a full league', () => {
    expect(validateLeagueConfig(DAILY_CONFIG)).toEqual([]);
    expect(DAILY_CONFIG.teams * DAILY_CONFIG.weeks).toBeLessThan(DEFAULT_LEAGUE_CONFIG.teams * DEFAULT_LEAGUE_CONFIG.weeks);
  });

  it('dates are UTC calendar days and seeds are stable per date', () => {
    expect(dailyDate(new Date('2026-11-02T23:59:59Z'))).toBe('2026-11-02');
    expect(dailyDate(new Date('2026-11-03T00:00:00Z'))).toBe('2026-11-03');
    expect(isDailyDate('2026-11-02')).toBe(true);
    expect(isDailyDate('2026-13-02')).toBe(false);
    expect(isDailyDate('2026-02-30')).toBe(false);
    expect(isDailyDate('yesterday')).toBe(false);
    expect(dailySeed('2026-11-02')).toBe(dailySeed('2026-11-02'));
    expect(dailySeed('2026-11-02')).not.toBe(dailySeed('2026-11-03'));
    expect(() => dailySeed('nope')).toThrow();
  });

  it('two players with different names face the same league and the same AI picks', () => {
    const a = draftedDaily('2026-11-02', 'Pallet Town Pidgeots', 'PAL');
    const b = draftedDaily('2026-11-02', 'Cerulean Starmies', 'CER');
    expect(a.daily).toEqual({ date: '2026-11-02' });
    expect(a.coaches.slice(1).map((c) => c.abbrev)).toEqual(b.coaches.slice(1).map((c) => c.abbrev));
    expect(a.draft.order).toEqual(b.draft.order);
    expect(a.draft.picks).toEqual(b.draft.picks);
    expect(a.matches.map((m) => `${m.home}-${m.away}`)).toEqual(b.matches.map((m) => `${m.home}-${m.away}`));
  });

  it('the daily flag survives a save round trip and is absent on a normal league', () => {
    const run = draftedDaily('2026-11-02');
    expect(deserializeRun(serializeRun(run)).daily).toEqual({ date: '2026-11-02' });
    const plain = createRun({ config: DEFAULT_LEAGUE_CONFIG, seed: 1, humanName: 'X Y', humanAbbrev: 'XYZ', createdAt: 1 });
    expect(plain.daily).toBeUndefined();
    expect('daily' in plain).toBe(false);
  });
});

describe('score and summary', () => {
  it('a fresh league scores 0 and summarizes as in progress with rank 0', () => {
    const run = draftedDaily('2026-11-02');
    expect(runScore(run)).toBe(0);
    const s = summarizeRun(run, 5);
    expect(s).toMatchObject({ version: 1, runId: run.id, seed: run.seed, daily: '2026-11-02', phase: 'season', wins: 0, losses: 0, rank: 0, matchesPlayed: 0, score: 0, finishedAt: 5 });
    expect(s.roster.length).toBe(run.coaches[0]!.roster.length);
    expect(resultLabel(s)).toBe('0-0, in progress');
  });

  it('a champion outscores a loss-cap exit, and the title bonus is part of it', async () => {
    const run = draftedDaily('2026-11-02');
    const champ = await playOut(run, () => true);
    const bust = await playOut(run, () => false);
    expect(champ.phase).toBe('champion');
    expect(bust.phase).toBe('eliminated');
    const cs = summarizeRun(champ, 9);
    const bs = summarizeRun(bust, 9);
    expect(cs.score).toBeGreaterThan(bs.score);
    expect(cs.score).toBeGreaterThanOrEqual(cs.wins * DAILY_SCORE.win + cs.playoffWins * DAILY_SCORE.playoffWin + DAILY_SCORE.title);
    expect(cs.playoffWins).toBe(Math.log2(DAILY_CONFIG.playoffTeams));
    expect(cs.matchesPlayed).toBe(DAILY_CONFIG.weeks + cs.playoffWins);
    expect(cs.rank).toBeGreaterThanOrEqual(1);
    expect(bs.score).toBeGreaterThanOrEqual(0);
    expect(bs.eliminationReason).toBe('lossCap');
    expect(resultLabel(cs)).toMatch(/, champion$/);
    expect(resultLabel(bs)).toMatch(/, out at the loss cap$/);
    expect(cs.mvp === undefined || cs.roster.includes(cs.mvp.species)).toBe(true);
  });

  it('the summary is JSON-friendly and never carries battle logs', () => {
    const run = draftedDaily('2026-11-02');
    const s = summarizeRun(run, 1);
    const json = JSON.stringify(s);
    expect(JSON.parse(json)).toEqual(s);
    expect(json).not.toContain('|win|');
    expect(json.length).toBeLessThan(4000);
  });

  it('share string names the mode, the record and the league code', async () => {
    const champ = await playOut(draftedDaily('2026-11-02', 'Pallet Town Pidgeots', 'PAL'), () => true);
    const line = shareString(summarizeRun(champ, 1));
    expect(line).toContain('daily 2026-11-02');
    expect(line).toContain('PAL ');
    expect(line).toContain('champion');
    expect(line).toMatch(/league [0-9A-Z]{6,}$/);
    const plain = createRun({ config: DEFAULT_LEAGUE_CONFIG, seed: 1, humanName: 'X Y', humanAbbrev: 'XYZ', createdAt: 1 });
    expect(shareString(summarizeRun(plain, 1))).toContain('16-team league');
  });
});
