import { DEFAULT_LEAGUE_CONFIG, type Coach, type LeagueConfig, type MatchResult, type RunState } from '../types';
import { buildDraftPool, getDraftMon } from '../draft/pool';
import { validateLeagueConfig } from './config';
import { aiChoosePick, legalPicks } from '../draft/draft';
import { createRng, deriveSeed } from './rng';
import {
  createRun, deserializeRun, draftPick, finishDraft, freeAgency, nextHumanMatch, opponentOf,
  regularSeasonRecord, resolveWeek, runAiDraftUntilHuman, serializeRun, setCaptains, setTeraCaptains, setZCaptains,
} from './run';

function result(winner: string, loser: string, wr = 3): MatchResult {
  return { winner, loser, log: ['|win|x'], turns: 25, remaining: { [winner]: wr, [loser]: 0 }, lineups: {} };
}

const fakeSim = (home: Coach, away: Coach, seed: number): MatchResult => {
  const r = createRng(seed);
  return r.next() < 0.5 ? result(home.id, away.id, 1 + r.int(6)) : result(away.id, home.id, 1 + r.int(6));
};
const fakeSets = (): Record<string, never> => ({});

function draftedRun(seed: number, config: LeagueConfig = DEFAULT_LEAGUE_CONFIG): RunState {
  let run = createRun({ config, seed, humanName: 'Test Town Testers', humanAbbrev: 'tst', createdAt: 1 });
  const pool = buildDraftPool({ megas: config.megas });
  for (;;) {
    run = runAiDraftUntilHuman(run);
    if (run.draft.complete) break;
    const pick = aiChoosePick(run.draft, run.humanId, run.config, pool, createRng(deriveSeed(seed, 'h', run.draft.pickIndex)));
    run = draftPick(run, pick);
  }
  return run;
}

/** Plays weeks with `humanWins(week)` deciding the human's result until the run ends. */
async function playOut(run: RunState, humanWins: (week: number) => boolean): Promise<RunState> {
  let cur = run;
  let guard = 0;
  while ((cur.phase === 'season' || cur.phase === 'playoffs') && guard++ < 50) {
    const m = nextHumanMatch(cur)!;
    expect(m).toBeDefined();
    const opp = opponentOf(cur, m).id;
    cur = await resolveWeek(cur, humanWins(cur.week) ? result(cur.humanId, opp) : result(opp, cur.humanId), { simulateMatch: fakeSim });
  }
  return cur;
}

describe('run flow', () => {
  const drafted = draftedRun(2024);

  it('creates a 16-coach league with the human first and drafts everyone a full roster', async () => {
    expect(drafted.coaches.length).toBe(16);
    expect(drafted.coaches[0]).toMatchObject({ isHuman: true, abbrev: 'TST', id: drafted.humanId });
    expect(new Set(drafted.coaches.map((c) => c.abbrev)).size).toBe(16);
    expect(drafted.phase).toBe('draft');
    for (const c of drafted.coaches) {
      expect(c.roster.length).toBe(11);
      expect(c.pointsSpent).toBeLessThanOrEqual(120);
    }
    expect(() => draftPick(drafted, drafted.draft.available[0]!)).toThrow();
  });

  it('finishDraft sets captains, sets and the schedule', async () => {
    const human = drafted.coaches[0]!;
    const caps = human.roster.slice(-2).map((r) => r.species);
    const withCaps = setTeraCaptains(drafted, caps);
    expect(() => setTeraCaptains(drafted, caps.slice(0, 1))).toThrow();
    let built = 0;
    const run = finishDraft(withCaps, { buildSets: () => { built++; return {}; } });
    expect(built).toBe(16);
    expect(run.phase).toBe('season');
    expect(run.week).toBe(1);
    expect(run.matches.length).toBe(9 * 8);
    expect(run.coaches[0]!.roster.filter((r) => r.isTeraCaptain).map((r) => r.species)).toEqual(caps);
    for (const c of run.coaches) expect(c.roster.filter((r) => r.isTeraCaptain).length).toBe(2);
    expect(drafted.phase).toBe('draft'); // input untouched
  });

  it('plays through to champion when the human wins everything', async () => {
    const start = finishDraft(drafted, { buildSets: fakeSets });
    const end = await playOut(start, () => true);
    expect(end.phase).toBe('champion');
    expect(end.week).toBe(12); // 9 weeks + 3 playoff rounds
    expect(end.matches.filter((m) => m.playoffRound !== undefined).length).toBe(4 + 2 + 1);
    expect(end.matches.every((m) => m.result)).toBe(true);
    expect(end.log.some((l) => /^Week 1: [A-Z]{3} beat [A-Z]{3} \d-0$/.test(l))).toBe(true);
    expect(end.log[end.log.length - 1]).toBe('Champion!');
  });

  it('ends at the loss cap', async () => {
    const start = finishDraft(draftedRun(77), { buildSets: fakeSets });
    const end = await playOut(start, () => false);
    expect(end.phase).toBe('eliminated');
    expect(end.eliminationReason).toBe('lossCap');
    expect(regularSeasonRecord(end, end.humanId).losses).toBe(5);
    expect(end.week).toBe(5);
  });

  it('misses the playoffs, and loses in the playoffs', async () => {
    const cfg = { ...DEFAULT_LEAGUE_CONFIG, teams: 8 as const, playoffTeams: 4, lossCap: 9, weeks: 7 };
    const start = finishDraft(draftedRun(5, cfg), { buildSets: fakeSets });
    const missed = await playOut(start, () => false);
    expect(missed.eliminationReason).toBe('missedPlayoffs');
    const ko = await playOut(start, (w) => w <= 7);
    expect(ko.phase).toBe('eliminated');
    expect(ko.eliminationReason).toBe('playoffLoss');
    expect(ko.week).toBe(8);
  });

  it('is deterministic for the same seed and inputs', async () => {
    const a = await playOut(finishDraft(drafted, { buildSets: fakeSets }), () => true);
    const b = await playOut(finishDraft(draftedRun(2024), { buildSets: fakeSets }), () => true);
    expect(serializeRun(a)).toBe(serializeRun(b));
  });

  it('free agency swaps a mon within budget and move limits', async () => {
    let run = finishDraft(drafted, { buildSets: (c) => Object.fromEntries(c.roster.map((r) => [r.species, { species: r.species } as never])) });
    const human = run.coaches[0]!;
    const drop = human.roster[human.roster.length - 1]!.species;
    const left = 120 - human.pointsSpent;
    const pool = buildDraftPool();
    const dropPts = pool.find((m) => m.id === drop)!.points;
    const add = run.draft.available.find((id) => pool.find((m) => m.id === id)!.points <= dropPts + left)!;
    const tooPricey = run.draft.available.find((id) => pool.find((m) => m.id === id)!.points > dropPts + left);
    if (tooPricey) expect(() => freeAgency(run, drop, tooPricey)).toThrow();
    expect(() => freeAgency(run, drop, human.roster[0]!.species)).toThrow();
    run = freeAgency(run, drop, add, { buildSets: (c) => Object.fromEntries(c.roster.map((r) => [r.species, { species: r.species } as never])) });
    const after = run.coaches[0]!;
    expect(after.roster.some((r) => r.species === add)).toBe(true);
    expect(after.roster.some((r) => r.species === drop)).toBe(false);
    expect(after.sets[add]).toBeDefined();
    expect(after.sets[drop]).toBeUndefined();
    expect(run.draft.available).toContain(drop);
    expect(run.draft.available).not.toContain(add);
    expect(run.freeAgencyUsed).toBe(1);
    run = freeAgency(run, add, drop);
    expect(() => freeAgency(run, drop, add)).toThrow(); // 2 moves used
  });

  it('serializes and round-trips', async () => {
    const run = await playOut(finishDraft(drafted, { buildSets: fakeSets }), (w) => w % 2 === 0);
    const json = serializeRun(run);
    const back = deserializeRun(json);
    expect(back).toEqual(run);
    expect(Array.isArray(back.draft.available)).toBe(true);
    expect(() => deserializeRun('{"foo":1}')).toThrow();
    expect(legalPicks(back.draft, back.humanId, back.config)).toEqual([]);
  });
});

describe('megas, Tera and Z captains', () => {
  const cfg: LeagueConfig = { ...DEFAULT_LEAGUE_CONFIG, teams: 8, playoffTeams: 4, megas: true, teraCaptains: 0, zCaptains: 1 };
  const drafted = draftedRun(31, cfg);
  const pts = (id: string): number => getDraftMon(id)!.points;
  const isMega = (id: string): boolean => getDraftMon(id)!.isMega;

  it('a Megas league offers Megas; rosters never hold two forms of one species', () => {
    expect(drafted.draft.available.concat(drafted.draft.picks.map((p) => p.species)).some(isMega)).toBe(true);
    for (const c of drafted.coaches) {
      const nums = c.roster.map((r) => getDraftMon(r.species)!.num);
      expect(new Set(nums).size).toBe(nums.length);
    }
    const off = draftedRun(31, { ...cfg, megas: false });
    expect(off.draft.available.some(isMega)).toBe(false);
    expect(off.draft.picks.some((p) => isMega(p.species))).toBe(false);
  });

  it('finishDraft defaults: no Tera captains, one Z captain = the priciest non-Mega', () => {
    const run = finishDraft(drafted, { buildSets: fakeSets });
    for (const c of run.coaches) {
      expect(c.roster.filter((r) => r.isTeraCaptain)).toEqual([]);
      const z = c.roster.filter((r) => r.isZCaptain).map((r) => r.species);
      expect(z.length).toBe(1);
      expect(isMega(z[0]!)).toBe(false);
      const best = Math.max(...c.roster.filter((r) => !isMega(r.species)).map((r) => pts(r.species)));
      expect(pts(z[0]!)).toBe(best);
    }
  });

  it('finishDraft defaults with both roles: Tera first, Z next, never the same mon', () => {
    const run = finishDraft(draftedRun(31, { ...cfg, teraCaptains: 2, zCaptains: 1 }), { buildSets: fakeSets });
    for (const c of run.coaches) {
      const tera = c.roster.filter((r) => r.isTeraCaptain);
      const z = c.roster.filter((r) => r.isZCaptain);
      expect(tera.length).toBe(2);
      expect(z.length).toBe(1);
      expect(c.roster.some((r) => r.isTeraCaptain && r.isZCaptain)).toBe(false);
      expect(Math.min(...tera.map((r) => pts(r.species)))).toBeGreaterThanOrEqual(pts(z[0]!.species));
    }
  });

  it('setZCaptains: exact count, no Megas, no mon in both roles', () => {
    const both = draftedRun(31, { ...cfg, teraCaptains: 1, zCaptains: 1 });
    const roster = both.coaches.find((c) => c.id === both.humanId)!.roster.map((r) => r.species);
    const [a, b] = roster.filter((id) => !isMega(id)) as [string, string];
    expect(() => setZCaptains(both, [a, b])).toThrow(/exactly 1/);
    expect(() => setZCaptains(both, [])).toThrow(/exactly 1/);
    expect(() => setZCaptains(both, ['notamon'])).toThrow(/not on your roster/);
    const mega = roster.find(isMega);
    if (mega) {
      expect(() => setZCaptains(both, [mega])).toThrow(/Mega/);
      expect(() => setTeraCaptains(both, [mega])).toThrow(/Mega/);
    }
    const withTera = setTeraCaptains(both, [a]);
    expect(() => setZCaptains(withTera, [a])).toThrow(/both/);
    const set = setZCaptains(withTera, [b]);
    const human = set.coaches.find((c) => c.id === set.humanId)!;
    expect(human.roster.filter((r) => r.isTeraCaptain).map((r) => r.species)).toEqual([a]);
    expect(human.roster.filter((r) => r.isZCaptain).map((r) => r.species)).toEqual([b]);
    const swapped = setCaptains(set, { tera: [b], z: [a] });
    const sh = swapped.coaches.find((c) => c.id === swapped.humanId)!;
    expect(sh.roster.find((r) => r.species === a)).toMatchObject({ isTeraCaptain: false, isZCaptain: true });
    expect(sh.roster.find((r) => r.species === b)).toMatchObject({ isTeraCaptain: true, isZCaptain: false });
    const fin = finishDraft(set, { buildSets: fakeSets });
    expect(fin.coaches.find((c) => c.id === fin.humanId)!.roster.find((r) => r.species === b)?.isZCaptain).toBe(true);
    const off = draftedRun(31, { ...cfg, zCaptains: 0 });
    expect(() => setZCaptains(off, [off.coaches[0]!.roster[0]!.species])).toThrow(/exactly 0/);
    expect(finishDraft(off, { buildSets: fakeSets }).coaches.every((c) => c.roster.every((r) => !r.isZCaptain && !r.isTeraCaptain))).toBe(true);
  });

  it('free agency: a Mega signing inherits no captain flag', () => {
    const run = finishDraft(draftedRun(31, { ...cfg, budget: 200 }), { buildSets: fakeSets });
    const human = run.coaches.find((c) => c.id === run.humanId)!;
    const drop = human.roster.find((r) => r.isZCaptain)!.species;
    const left = run.config.budget - human.pointsSpent + pts(drop);
    const kept = human.roster.filter((r) => r.species !== drop).map((r) => getDraftMon(r.species)!.num);
    const megaFa = run.draft.available.find((id) => isMega(id) && pts(id) <= left && !kept.includes(getDraftMon(id)!.num));
    expect(megaFa).toBeDefined();
    const after = freeAgency(run, drop, megaFa!);
    const ah = after.coaches.find((c) => c.id === after.humanId)!;
    expect(ah.roster.find((r) => r.species === megaFa)).toEqual({ species: megaFa, isTeraCaptain: false, isZCaptain: false });
    expect(ah.roster.some((r) => r.isZCaptain)).toBe(false);
  });
});

describe('save migration + config validation', () => {
  it('migrates a version-1 save', () => {
    const run = finishDraft(draftedRun(9, { ...DEFAULT_LEAGUE_CONFIG, teams: 8, playoffTeams: 4 }), { buildSets: fakeSets });
    type Loose = Record<string, unknown>;
    const v1 = JSON.parse(serializeRun(run)) as Loose & { config: Loose; coaches: { roster: Loose[] }[] };
    v1.version = 1;
    delete v1.config.megas;
    delete v1.config.zCaptains;
    for (const c of v1.coaches) for (const r of c.roster) delete r.isZCaptain;
    const back = deserializeRun(JSON.stringify(v1));
    expect(back).toEqual(run);
    expect(back.version).toBe(2);
    expect(() => deserializeRun(JSON.stringify({ ...v1, version: 3 }))).toThrow(/version/);
  });

  it('validateLeagueConfig reports plain-sentence errors', () => {
    expect(validateLeagueConfig(DEFAULT_LEAGUE_CONFIG)).toEqual([]);
    expect(validateLeagueConfig({ ...DEFAULT_LEAGUE_CONFIG, megas: true, zCaptains: 2 })).toEqual([]);
    const bad = validateLeagueConfig({ ...DEFAULT_LEAGUE_CONFIG, playoffTeams: 6 });
    expect(bad.length).toBe(1);
    expect(bad[0]).toMatch(/^Playoff teams must be a power of two/);
    expect(validateLeagueConfig({ ...DEFAULT_LEAGUE_CONFIG, teams: 8, playoffTeams: 16 }).length).toBe(1);
    expect(validateLeagueConfig({ ...DEFAULT_LEAGUE_CONFIG, teams: 10 as LeagueConfig['teams'], playoffTeams: 8 }).length).toBe(1);
    expect(validateLeagueConfig({ ...DEFAULT_LEAGUE_CONFIG, weeks: 21 }).length).toBe(1);
    expect(validateLeagueConfig({ ...DEFAULT_LEAGUE_CONFIG, teraCaptains: 6, zCaptains: 5 }).length).toBe(1);
    expect(validateLeagueConfig({ ...DEFAULT_LEAGUE_CONFIG, budget: 10 }).length).toBe(1);
    expect(validateLeagueConfig({ ...DEFAULT_LEAGUE_CONFIG, lossCap: -1 }).length).toBe(1);
    expect(() => createRun({ config: { ...DEFAULT_LEAGUE_CONFIG, playoffTeams: 6 }, seed: 1, humanName: 'X', humanAbbrev: 'XXX' })).toThrow(/power of two/);
  });
});
