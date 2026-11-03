import { DEFAULT_LEAGUE_CONFIG, type Coach, type LeagueConfig, type MatchResult, type RunState } from '../types';
import { buildDraftPool, getDraftMon } from '../draft/pool';
import { minBudget, validateLeagueConfig } from './config';
import { aiChoosePick, budgetOf, legalPicks } from '../draft/draft';
import { MAX_STAKE, STAKES } from '../data/stakes';
import { visibleRoster } from './stakes';
import { createRng, deriveSeed } from './rng';
import {
  captainBlock, createRun, deserializeRun, draftPick, draftStop, finishDraft, freeAgency, nextHumanMatch, opponentOf,
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

/** Like draftedRun, but the human stops drafting once they hold `stopAt` mons (the AI drafts as usual). */
function draftedRunStopping(seed: number, stopAt: number, config: LeagueConfig = DEFAULT_LEAGUE_CONFIG): RunState {
  let run = createRun({ config, seed, humanName: 'Test Town Testers', humanAbbrev: 'tst', createdAt: 1 });
  const pool = buildDraftPool({ megas: config.megas });
  for (;;) {
    run = runAiDraftUntilHuman(run);
    if (run.draft.complete) break;
    if (run.coaches[0]!.roster.length >= stopAt) { run = draftStop(run); continue; }
    run = draftPick(run, aiChoosePick(run.draft, run.humanId, run.config, pool, createRng(deriveSeed(seed, 'h', run.draft.pickIndex))));
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
      expect(c.roster.length).toBeGreaterThanOrEqual(DEFAULT_LEAGUE_CONFIG.rosterMin);
      expect(c.roster.length).toBeLessThanOrEqual(DEFAULT_LEAGUE_CONFIG.rosterMax);
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

  describe('free agency without a drop', () => {
    const buildSets = (c: Coach) => Object.fromEntries(c.roster.map((r) => [r.species, { species: r.species } as never]));
    const base = finishDraft(draftedRunStopping(2024, 9, { ...DEFAULT_LEAGUE_CONFIG, budget: 200 }), { buildSets: fakeSets });
    const human = base.coaches[0]!;
    const price = (id: string) => getDraftMon(id)!.points;
    const owned = new Set(human.roster.map((r) => getDraftMon(r.species)!.num));
    const room = base.config.budget - human.pointsSpent;
    const add = base.draft.available.find((id) => price(id) <= room && !owned.has(getDraftMon(id)!.num))!;

    it('signs a free agent under rosterMax, counts a move, builds the set and grants no captain flag', () => {
      expect(human.roster.length).toBe(9);
      const run = freeAgency(base, null, add, { buildSets });
      const after = run.coaches[0]!;
      expect(after.roster.length).toBe(10);
      expect(after.roster.slice(0, 9)).toEqual(human.roster);
      expect(after.roster[9]).toEqual({ species: add, isTeraCaptain: false, isZCaptain: false });
      expect(after.pointsSpent).toBe(human.pointsSpent + price(add));
      expect(after.sets[add]).toBeDefined();
      expect(run.freeAgencyUsed).toBe(1);
      expect(run.draft.available).not.toContain(add);
      expect(run.draft.available.length).toBe(base.draft.available.length - 1);
      expect(run.log[run.log.length - 1]).toMatch(/signed .*\.$/);
      expect(run.log[run.log.length - 1]).not.toMatch(/dropped/);
    });

    it('refuses a plain add on a full roster', () => {
      let run = base;
      const fill = (r: RunState): RunState => {
        const h = r.coaches[0]!;
        const nums = new Set(h.roster.map((x) => getDraftMon(x.species)!.num));
        const next = r.draft.available.find((id) => price(id) <= r.config.budget - h.pointsSpent && !nums.has(getDraftMon(id)!.num))!;
        return { ...r, freeAgencyUsed: 0, coaches: r.coaches.map((c, i) => (i === 0 ? { ...c, roster: [...c.roster, { species: next, isTeraCaptain: false, isZCaptain: false }], pointsSpent: c.pointsSpent + price(next) } : c)),
          draft: { ...r.draft, available: r.draft.available.filter((id) => id !== next) } };
      };
      run = fill(fill(run));
      expect(run.coaches[0]!.roster.length).toBe(run.config.rosterMax);
      expect(() => freeAgency(run, null, add)).toThrow(/full/);
      const drop = run.coaches[0]!.roster[0]!.species;
      const other = run.draft.available.find((id) => price(id) <= price(drop) && !owned.has(getDraftMon(id)!.num))!;
      expect(() => freeAgency(run, drop, other)).not.toThrow(); // dropping still works
    });

    it('refuses a plain add over budget or of a form the coach already owns', () => {
      const tight = { ...base, config: { ...base.config, budget: human.pointsSpent + price(add) - 1 } };
      expect(() => freeAgency(tight, null, add)).toThrow(/over budget/);
      const mega = buildDraftPool({ megas: true }).find((m) => m.isMega && owned.has(m.num))!;
      const withMega = { ...base, config: { ...base.config, megas: true }, draft: { ...base.draft, available: [...base.draft.available, mega.id] } };
      expect(() => freeAgency(withMega, null, mega.id)).toThrow(/another form/);
    });

    it('still uses up the move budget', () => {
      const once = freeAgency(base, null, add);
      const nums = new Set([...owned, getDraftMon(add)!.num]);
      const second = once.draft.available.find((id) => price(id) <= once.config.budget - once.coaches[0]!.pointsSpent && !nums.has(getDraftMon(id)!.num))!;
      const twice = freeAgency(once, null, second);
      expect(twice.freeAgencyUsed).toBe(2);
      expect(() => freeAgency(twice, null, add)).toThrow(/no free-agency moves/);
    });
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

describe('roster range', () => {
  const cfg: LeagueConfig = { ...DEFAULT_LEAGUE_CONFIG, teams: 8, playoffTeams: 4 };

  it('a seeded 8-team draft: every roster lands in [min, max], nobody is skipped while still drafting', () => {
    const sizes = new Set<number>();
    for (const seed of [1, 2, 3, 4, 5]) {
      const run = draftedRun(seed, cfg);
      expect(run.draft.complete).toBe(true);
      for (const c of run.coaches) {
        expect(c.roster.length).toBeGreaterThanOrEqual(cfg.rosterMin);
        expect(c.roster.length).toBeLessThanOrEqual(cfg.rosterMax);
        if (!c.isHuman) sizes.add(c.roster.length);
      }
      // Replay the snake: a coach the clock passes over must be full or finished for good (never picks again).
      const { order, picks } = run.draft;
      const n = order.length;
      const at = (t: number): string => (Math.floor(t / n) % 2 === 0 ? order[t % n] : order[n - 1 - (t % n)])!;
      const finished = new Set<string>();
      const owned = new Map<string, number>();
      let t = 0;
      for (const p of picks) {
        while (at(t) !== p.coach) {
          const skipped = at(t);
          if ((owned.get(skipped) ?? 0) < cfg.rosterMax) {
            expect(owned.get(skipped) ?? 0).toBeGreaterThanOrEqual(cfg.rosterMin);
            finished.add(skipped);
          }
          t++;
        }
        expect(finished.has(p.coach)).toBe(false);
        owned.set(p.coach, (owned.get(p.coach) ?? 0) + 1);
        t++;
      }
    }
    expect(sizes.size).toBeGreaterThan(1); // AI rosters spread over the range, not all at the max
  });

  it('the human may stop at the minimum, not before; later rounds skip them', () => {
    let run = createRun({ config: cfg, seed: 11, humanName: 'Test Town Testers', humanAbbrev: 'tst', createdAt: 1 });
    const pool = buildDraftPool();
    const mine = (r: RunState): number => r.coaches.find((c) => c.id === r.humanId)!.roster.length;
    run = runAiDraftUntilHuman(run);
    expect(() => draftStop(run)).toThrow(/at least 9/);
    while (mine(run) < cfg.rosterMin) {
      run = draftPick(run, aiChoosePick(run.draft, run.humanId, run.config, pool, createRng(deriveSeed(11, 'h', run.draft.pickIndex))));
      run = runAiDraftUntilHuman(run);
    }
    expect(run.draft.complete).toBe(false);
    const done = runAiDraftUntilHuman(draftStop(run));
    expect(done.draft.complete).toBe(true); // never handed back to the human
    expect(mine(done)).toBe(cfg.rosterMin);
    expect(done.draft.done).toContain(done.humanId);
    expect(done.log.some((l) => / TST stopped drafting at 9 mons\.$/.test(l))).toBe(true);
    expect(finishDraft(done, { buildSets: fakeSets }).phase).toBe('season');
  });
});

describe('captain price cap', () => {
  const drafted = draftedRun(2024);
  const pts = (id: string): number => getDraftMon(id)!.points;

  it('setters refuse a mon priced over captainMaxPoints; AI and default captains stay under it', () => {
    const human = drafted.coaches.find((c) => c.id === drafted.humanId)!;
    const over = human.roster.find((r) => pts(r.species) > drafted.config.captainMaxPoints)?.species;
    const under = human.roster.filter((r) => !captainBlock(drafted.config, r.species)).map((r) => r.species);
    expect(over).toBeDefined();
    expect(captainBlock(drafted.config, over!)).toBe('overCap');
    expect(() => setTeraCaptains(drafted, [over!, under[0]!])).toThrow(/over the 14-pt captain cap/);
    expect(() => setCaptains(drafted, { tera: [under[0]!, under[1]!], z: [] })).not.toThrow();
    const zLeague = { ...drafted, config: { ...drafted.config, zCaptains: 1 } };
    expect(() => setZCaptains(zLeague, [over!])).toThrow(/captain cap/);
    const run = finishDraft(drafted, { buildSets: fakeSets });
    for (const c of run.coaches) {
      const caps = c.roster.filter((r) => r.isTeraCaptain || r.isZCaptain);
      expect(caps.length).toBeGreaterThan(0);
      for (const r of caps) expect(pts(r.species)).toBeLessThanOrEqual(14);
    }
    const uncapped = { ...drafted, config: { ...drafted.config, captainMaxPoints: 20 } };
    expect(captainBlock(uncapped.config, over!)).toBeUndefined();
    expect(() => setTeraCaptains(uncapped, [over!, under[0]!])).not.toThrow();
  });
});

describe('megas, Tera and Z captains', () => {
  const cfg: LeagueConfig = {
    ...DEFAULT_LEAGUE_CONFIG, teams: 8, playoffTeams: 4, megas: true, teraCaptains: 0, zCaptains: 1, captainMaxPoints: 20,
  };
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
  type Loose = Record<string, unknown>;
  type LooseRun = Loose & { config: Loose; draft: Loose; coaches: { roster: Loose[] }[] };
  /** A save as version 2 wrote it: one fixed rosterSize, no captain cap, no draft turn / done list. */
  function asV2(run: RunState, size: number): LooseRun {
    const v2 = JSON.parse(serializeRun(run)) as LooseRun;
    v2.version = 2;
    v2.config.rosterSize = size;
    delete v2.config.rosterMin;
    delete v2.config.rosterMax;
    delete v2.config.captainMaxPoints;
    delete v2.draft.turn;
    delete v2.draft.done;
    delete v2.config.stake;
    return v2;
  }
  const fixed = (size: number): LeagueConfig => ({
    ...DEFAULT_LEAGUE_CONFIG, teams: 8, playoffTeams: 4, rosterMin: size, rosterMax: size, captainMaxPoints: 20,
  });

  it('migrates a version-1 save', () => {
    const run = finishDraft(draftedRun(9, fixed(11)), { buildSets: fakeSets });
    const v1 = asV2(run, 11);
    v1.version = 1;
    delete v1.config.megas;
    delete v1.config.zCaptains;
    for (const c of v1.coaches) for (const r of c.roster) delete r.isZCaptain;
    const back = deserializeRun(JSON.stringify(v1));
    expect(back).toEqual(run);
    expect(back.version).toBe(4);
    expect(() => deserializeRun(JSON.stringify({ ...v1, version: 5 }))).toThrow(/version/);
  });

  it('migrates a version-2 save: rosterMin = rosterMax = the old size, no captain cap', () => {
    const run = finishDraft(draftedRun(9, fixed(10)), { buildSets: fakeSets });
    const back = deserializeRun(JSON.stringify(asV2(run, 10)));
    expect(back).toEqual(run);
    expect(back.version).toBe(4);
    expect(back.config).toMatchObject({ rosterMin: 10, rosterMax: 10, captainMaxPoints: 20 });
    expect('rosterSize' in back.config).toBe(false);
    // Mid-draft: the clock resumes on the same coach the v2 snake would name.
    let mid = createRun({ config: fixed(10), seed: 9, humanName: 'Test Town Testers', humanAbbrev: 'tst', createdAt: 1 });
    mid = runAiDraftUntilHuman(mid);
    mid = draftPick(mid, legalPicks(mid.draft, mid.humanId, mid.config)[0]!);
    const midBack = deserializeRun(JSON.stringify(asV2(mid, 10)));
    expect(midBack.draft.turn).toBe(mid.draft.pickIndex);
    expect(runAiDraftUntilHuman(midBack)).toEqual(runAiDraftUntilHuman(mid));
  });

  it('migrates a version-3 save: stake 1, no per-coach budgets, and it plays on', () => {
    const run = finishDraft(draftedRun(9, fixed(10)), { buildSets: fakeSets });
    const v3 = JSON.parse(serializeRun(run)) as LooseRun;
    v3.version = 3;
    delete v3.config.stake;
    const back = deserializeRun(JSON.stringify(v3));
    expect(back).toEqual(run);
    expect(back.config.stake).toBe(1);
    expect(back.draft.budgets).toBeUndefined();
    let mid = createRun({ config: fixed(10), seed: 9, humanName: 'Test Town Testers', humanAbbrev: 'tst', createdAt: 1 });
    mid = runAiDraftUntilHuman(mid);
    const midV3 = JSON.parse(serializeRun(mid)) as LooseRun;
    midV3.version = 3;
    delete midV3.config.stake;
    expect(runAiDraftUntilHuman(draftPick(deserializeRun(JSON.stringify(midV3)), legalPicks(mid.draft, mid.humanId, mid.config)[0]!)))
      .toEqual(runAiDraftUntilHuman(draftPick(mid, legalPicks(mid.draft, mid.humanId, mid.config)[0]!)));
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
    expect(validateLeagueConfig({ ...DEFAULT_LEAGUE_CONFIG, teraCaptains: 6, zCaptains: 3 }).length).toBe(1); // 9 > rosterMin - 1
    expect(validateLeagueConfig({ ...DEFAULT_LEAGUE_CONFIG, budget: 5 }).length).toBe(1);
    // minBudget is the validator's own floor: the least budget passes, one point less fails
    for (const megas of [false, true]) {
      const { need } = minBudget(9, megas);
      expect(validateLeagueConfig({ ...DEFAULT_LEAGUE_CONFIG, megas, budget: need })).toEqual([]);
      expect(validateLeagueConfig({ ...DEFAULT_LEAGUE_CONFIG, megas, budget: need - 1 }).length).toBe(1);
    }
    expect(validateLeagueConfig({ ...DEFAULT_LEAGUE_CONFIG, rosterMin: 5 })[0]).toMatch(/minimum must be at least 6/);
    expect(validateLeagueConfig({ ...DEFAULT_LEAGUE_CONFIG, rosterMin: 6, rosterMax: 6 })).toEqual([]);
    expect(validateLeagueConfig({ ...DEFAULT_LEAGUE_CONFIG, rosterMax: 8 })[0]).toMatch(/maximum .*no lower than the minimum/);
    expect(validateLeagueConfig({ ...DEFAULT_LEAGUE_CONFIG, rosterMin: 9.5 }).length).toBe(1);
    expect(validateLeagueConfig({ ...DEFAULT_LEAGUE_CONFIG, captainMaxPoints: 20 })).toEqual([]);
    expect(validateLeagueConfig({ ...DEFAULT_LEAGUE_CONFIG, captainMaxPoints: 0 })[0]).toMatch(/captain price cap/);
    expect(validateLeagueConfig({ ...DEFAULT_LEAGUE_CONFIG, captainMaxPoints: 21 }).length).toBe(1);
    expect(validateLeagueConfig({ ...DEFAULT_LEAGUE_CONFIG, captainMaxPoints: 12.5 }).length).toBe(1);
    expect(validateLeagueConfig({ ...DEFAULT_LEAGUE_CONFIG, lossCap: -1 }).length).toBe(1);
    expect(() => createRun({ config: { ...DEFAULT_LEAGUE_CONFIG, playoffTeams: 6 }, seed: 1, humanName: 'X', humanAbbrev: 'XXX' })).toThrow(/power of two/);
  });
});

describe('stakes', () => {
  const cfg: LeagueConfig = { ...DEFAULT_LEAGUE_CONFIG, teams: 8, playoffTeams: 4 };
  const stakeOf = (label: string): number => STAKES.find((s) => s.label === label)!.stake;
  const make = (stake: number, seed = 41): RunState =>
    createRun({ config: { ...cfg, stake }, seed, humanName: 'Test Town Testers', humanAbbrev: 'tst', createdAt: 1 });

  it('the run stores the stake-applied config', () => {
    const run = make(MAX_STAKE);
    expect(run.config.stake).toBe(MAX_STAKE);
    expect(run.config.lossCap).toBeLessThanOrEqual(2);
    expect(run.config.playoffTeams).toBe(2);
    expect(make(1).config).toEqual({ ...cfg, stake: 1 });
  });

  it('"You draft last" puts the human last in round 1 and first in round 2', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const run = make(stakeOf('You draft last'), seed);
      expect(run.draft.order.at(-1)).toBe(run.humanId);
      expect([...run.draft.order].sort()).toEqual(run.coaches.map((c) => c.id).sort());
    }
    // Below that stake the shuffled order stands (the same seed puts the human elsewhere at least once).
    expect([1, 2, 3, 4, 5].some((seed) => make(1, seed).draft.order.at(-1) !== make(1, seed).humanId)).toBe(true);
  });

  it('"AI coaches get +5 budget" gives every AI coach budget + 5 and the human none', () => {
    const run = make(stakeOf('AI coaches get +5 budget'));
    for (const c of run.coaches) {
      if (c.isHuman) {
        expect(run.draft.budgets?.[c.id]).toBeUndefined();
        expect(budgetOf(run.draft, c.id, run.config)).toBe(run.config.budget);
      } else {
        expect(run.draft.budgets?.[c.id]).toBe(run.config.budget + 5);
        expect(budgetOf(run.draft, c.id, run.config)).toBe(run.config.budget + 5);
      }
    }
    // No budgets map: everyone falls back to config.budget.
    const base = make(1);
    expect(base.draft.budgets).toBeUndefined();
    for (const c of base.coaches) expect(budgetOf(base.draft, c.id, base.config)).toBe(base.config.budget);
    // AI coaches may spend past the human's budget, never past their own.
    const done = draftedRun(41, { ...cfg, stake: stakeOf('AI coaches get +5 budget') });
    for (const c of done.coaches) {
      const spent = c.roster.reduce((s, r) => s + getDraftMon(r.species)!.points, 0);
      expect(spent).toBeLessThanOrEqual(budgetOf(done.draft, c.id, done.config));
    }
  });

  it('"AI drafts by fit" changes AI picks for the same seed', () => {
    const fit = stakeOf('AI drafts by fit');
    const picksAt = (stake: number): string[] => {
      const run = draftedRun(41, { ...cfg, stake });
      return run.coaches.filter((c) => !c.isHuman).flatMap((c) => c.roster.map((r) => r.species));
    };
    expect(picksAt(fit)).not.toEqual(picksAt(fit - 1));
  });

  it('visibleRoster hides unscouted opposing mons under fog of war only', () => {
    const fog = stakeOf('Fog of war');
    const run = draftedRun(41, { ...cfg, stake: fog });
    const opp = run.coaches.find((c) => !c.isHuman)!;
    expect(visibleRoster(run, run.humanId)).toEqual(run.coaches.find((c) => c.isHuman)!.roster);
    expect(visibleRoster(run, opp.id)).toEqual([]);
    const seen = opp.roster[0]!.species;
    const scout = {
      coach: opp.id, matchesScouted: 1,
      bySpecies: { [seen]: { timesBrought: 1 } },
    } as unknown as Parameters<typeof visibleRoster>[2];
    expect(visibleRoster(run, opp.id, scout).map((r) => r.species)).toEqual([seen]);
    const clear = draftedRun(41, { ...cfg, stake: fog - 1 });
    const clearOpp = clear.coaches.find((c) => !c.isHuman)!;
    expect(visibleRoster(clear, clearOpp.id)).toEqual(clearOpp.roster);
  });
});
