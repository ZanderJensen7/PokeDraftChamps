// Run state + transitions. Every function is pure: it returns a NEW RunState and never mutates its input.
// Randomness comes only from run.seed via deriveSeed, so a run replays identically from its seed + inputs.
import type {
  BattleSet, Coach, CoachId, DraftMon, LeagueConfig, Match, MatchResult, RosterEntry, RunState, SpeciesId,
} from '../types';
import { DEFAULT_LEAGUE_CONFIG } from '../types';
import { MAX_POINTS } from '../data/points';
import { pickCoachIdentities } from '../data/coaches';
import { buildDraftPool, getDraftMon } from '../draft/pool';
import {
  aiChoosePick, aiRosterTarget, aiWantsToStop, applyPick, createDraft, currentPicker, conflictsWithRoster, stopDrafting,
} from '../draft/draft';
import { createRng, deriveSeed } from './rng';
import { buildSchedule } from './schedule';
import { computeStandings } from './standings';
import { advancePlayoffs, playoffRoundName, seedPlayoffs } from './playoffs';
import { validateLeagueConfig } from './config';
import { applyStake, rulesAt, type StakeRules } from '../data/stakes';

/**
 * 2: league options megas + zCaptains, RosterEntry.isZCaptain. 3: roster range (rosterMin/rosterMax replace
 * rosterSize), captainMaxPoints, DraftState.turn/done. 4: config.stake, DraftState.budgets. Older saves are
 * migrated on load.
 */
export const RUN_SAVE_VERSION = 4;

export interface CreateRunOptions {
  config: LeagueConfig;
  seed: number;
  humanName: string;
  humanAbbrev: string;
  /** Epoch ms; defaults to Date.now(). Pass it for reproducible ids in tests. */
  createdAt?: number;
  /** Marks a daily league (see league/daily.ts); stored on the run as `daily`. */
  daily?: { date: string };
}

/** Builds a coach's season sets. Injected (the battle module owns the real one). */
export type BuildSets = (coach: Coach, seed: number) => Record<SpeciesId, BattleSet>;
/** The stake rules an AI-vs-AI simulation reads (plain JSON: it crosses the worker boundary). */
export type SimRules = Pick<StakeRules, 'aiSwitchOnKo'>;

/**
 * Simulates one AI-involved match. Injected (the battle module owns the real one). `rules` carries the run's stake
 * rules the battle AI reads (resolveWeek passes rulesAt(config.stake)).
 */
export type SimulateMatch = (
  home: Coach, away: Coach, seed: number, rules?: SimRules,
) => MatchResult | Promise<MatchResult>;

const HUMAN_ID: CoachId = 'c0';

function validateConfig(c: LeagueConfig): void {
  const errors = validateLeagueConfig(c);
  if (errors.length > 0) throw new Error(errors.join(' '));
}

/** The draft pool this league uses (its `megas` option). */
export function runPool(run: Pick<RunState, 'config'>): readonly DraftMon[] {
  return buildDraftPool({ megas: run.config.megas });
}

/**
 * A new league in the draft phase. The run stores applyStake(config), so the stake's loss cap and playoff size are
 * plain config from here on. Stake rules: the human drafts last in round 1 (humanDraftsLast); AI coaches get
 * config.budget + aiBudgetBonus in draft.budgets.
 */
export function createRun(opts: CreateRunOptions): RunState {
  const { seed } = opts;
  validateConfig(opts.config);
  const config = applyStake(opts.config);
  const rules = rulesAt(config.stake);
  const createdAt = opts.createdAt ?? Date.now();
  const abbrev = opts.humanAbbrev.trim().toUpperCase();
  const identities = pickCoachIdentities(createRng(deriveSeed(seed, 'coaches')), config.teams - 1, [abbrev, opts.humanName]);
  const coaches: Coach[] = [
    { id: HUMAN_ID, name: opts.humanName, abbrev, isHuman: true, roster: [], pointsSpent: 0, sets: {} },
    ...identities.map((idn, i): Coach => ({
      id: `c${i + 1}`, name: idn.name, abbrev: idn.abbrev, isHuman: false, roster: [], pointsSpent: 0, sets: {},
    })),
  ];
  let draft = createDraft(coaches.map((c) => c.id), createRng(deriveSeed(seed, 'draftOrder')), buildDraftPool({ megas: config.megas }));
  if (rules.humanDraftsLast) draft = { ...draft, order: [...draft.order.filter((c) => c !== HUMAN_ID), HUMAN_ID] };
  if (rules.aiBudgetBonus > 0) {
    draft = { ...draft, budgets: Object.fromEntries(coaches.filter((c) => !c.isHuman).map((c) => [c.id, config.budget + rules.aiBudgetBonus])) };
  }
  const pos = draft.order.indexOf(HUMAN_ID) + 1;
  return {
    version: RUN_SAVE_VERSION,
    id: `run-${(seed >>> 0).toString(36)}-${createdAt.toString(36)}`,
    seed,
    config,
    phase: 'draft',
    coaches,
    humanId: HUMAN_ID,
    draft,
    week: 1,
    matches: [],
    freeAgencyUsed: 0,
    createdAt,
    log: [
      `League created: ${config.teams} coaches, ${config.weeks} weeks, ${config.budget} points${config.stake > 1 ? `, stake ${config.stake}` : ''}. You pick #${pos} in round 1.`,
    ],
    ...(opts.daily ? { daily: { date: opts.daily.date } } : {}),
  };
}

// ---- helpers ----

export function coachById(run: RunState, id: CoachId): Coach {
  const c = run.coaches.find((x) => x.id === id);
  if (!c) throw new Error(`unknown coach ${id}`);
  return c;
}

export function humanCoach(run: RunState): Coach {
  return coachById(run, run.humanId);
}

function abbrevOf(run: RunState, id: CoachId): string {
  return run.coaches.find((c) => c.id === id)?.abbrev ?? id;
}

function monOf(id: SpeciesId): DraftMon {
  const m = getDraftMon(id);
  if (!m) throw new Error(`${id} is not in the draft pool`);
  return m;
}

/** Rosters mirror the draft picks (updated after every pick, so the UI can show them live). */
function syncRosters(run: RunState): RunState {
  const coaches = run.coaches.map((c): Coach => {
    const picks = run.draft.picks.filter((p) => p.coach === c.id);
    return {
      ...c,
      roster: picks.map((p): RosterEntry => ({ species: p.species, isTeraCaptain: false, isZCaptain: false })),
      pointsSpent: picks.reduce((s, p) => s + p.points, 0),
    };
  });
  return { ...run, coaches };
}

/** Log lines for coaches the draft marked done on its own (nothing affordable left), then 'Draft complete.' when it ends. */
function draftTailLog(run: RunState, before: readonly CoachId[]): string[] {
  const lines = run.draft.done
    .filter((c) => !before.includes(c))
    .map((c) => `Draft: ${abbrevOf(run, c)} is out of affordable picks at ${run.draft.picks.filter((p) => p.coach === c).length} mons.`);
  return run.draft.complete ? [...lines, 'Draft complete.'] : lines;
}

function afterPick(run: RunState, coach: CoachId, species: SpeciesId): RunState {
  const draft = applyPick(run.draft, coach, species, run.config, runPool(run));
  const pick = draft.picks[draft.picks.length - 1]!;
  const next: RunState = syncRosters({
    ...run,
    draft,
    log: [...run.log, `Draft R${pick.round} #${pick.overall}: ${abbrevOf(run, coach)} took ${monOf(species).name} (${pick.points})`],
  });
  return { ...next, log: [...next.log, ...draftTailLog(next, run.draft.done)] };
}

function afterStop(run: RunState, coach: CoachId): RunState {
  const draft = stopDrafting(run.draft, coach, run.config, runPool(run));
  const held = draft.picks.filter((p) => p.coach === coach).length;
  const next: RunState = {
    ...run,
    draft,
    log: [...run.log, `Draft R${run.draft.round}: ${abbrevOf(run, coach)} stopped drafting at ${held} mons.`],
  };
  return { ...next, log: [...next.log, ...draftTailLog(next, [...run.draft.done, coach])] };
}

// ---- draft ----

/** The human's pick. Throws if it is not the human's turn or the pick is illegal. */
export function draftPick(run: RunState, species: SpeciesId): RunState {
  if (run.phase !== 'draft') throw new Error(`not drafting (phase ${run.phase})`);
  return afterPick(run, run.humanId, species);
}

/**
 * The human stops drafting (on the clock, holding at least config.rosterMin mons); later rounds skip them.
 * Throws if it is not the human's turn or the roster is under the minimum.
 */
export function draftStop(run: RunState): RunState {
  if (run.phase !== 'draft') throw new Error(`not drafting (phase ${run.phase})`);
  return afterStop(run, run.humanId);
}

/**
 * AI coaches pick (or stop, see aiWantsToStop) until it is the human's turn or the draft completes. Pick seeds
 * derive from (seed, pick index); each coach's roster aim (aiRosterTarget) from (seed, 'rosterAim', coach), so
 * a fixed-size league (rosterMin === rosterMax) drafts exactly as before the roster range existed.
 */
export function runAiDraftUntilHuman(run: RunState): RunState {
  if (run.phase !== 'draft') return run;
  let cur = run;
  const pool = runPool(run);
  const fit = rulesAt(run.config.stake).aiDraftFit;
  for (;;) {
    const picker = currentPicker(cur.draft, cur.config);
    if (picker === undefined || picker === cur.humanId) return cur;
    const aim = aiRosterTarget(cur.config, createRng(deriveSeed(cur.seed, 'rosterAim', picker)));
    if (aiWantsToStop(cur.draft, picker, cur.config, aim)) {
      cur = afterStop(cur, picker);
      continue;
    }
    const rng = createRng(deriveSeed(cur.seed, 'pick', cur.draft.pickIndex));
    const species = aiChoosePick(cur.draft, picker, cur.config, pool, rng, aim, { fit });
    cur = afterPick(cur, picker, species);
  }
}

function withCaptains(c: Coach, tera: readonly SpeciesId[], z: readonly SpeciesId[]): Coach {
  const t = new Set(tera);
  const zs = new Set(z);
  return { ...c, roster: c.roster.map((r) => ({ ...r, isTeraCaptain: t.has(r.species), isZCaptain: zs.has(r.species) })) };
}

/**
 * Why a mon may not be a Tera or Z captain in this league, or undefined when it may: a Mega already holds its
 * stone; 'overCap' = its draft price is above config.captainMaxPoints.
 */
export function captainBlock(config: Pick<LeagueConfig, 'captainMaxPoints'>, species: SpeciesId): 'mega' | 'overCap' | undefined {
  const m = getDraftMon(species);
  if (m?.isMega) return 'mega';
  if ((m?.points ?? 0) > config.captainMaxPoints) return 'overCap';
  return undefined;
}

/**
 * How many Tera and Z captains this roster must name: config.teraCaptains / zCaptains, cut down when the
 * roster has fewer captain-eligible mons (see captainBlock) than that; Tera is filled first.
 */
export function captainQuota(
  config: Pick<LeagueConfig, 'captainMaxPoints' | 'teraCaptains' | 'zCaptains'>, roster: readonly RosterEntry[],
): { tera: number; z: number } {
  const eligible = roster.filter((r) => !captainBlock(config, r.species)).length;
  const tera = Math.min(config.teraCaptains, eligible);
  return { tera, z: Math.min(config.zCaptains, eligible - tera) };
}

/** The `n` highest-priced captain-eligible roster mons not in `exclude` (earlier pick wins ties). */
function topPriced(c: Coach, config: LeagueConfig, n: number, exclude: ReadonlySet<SpeciesId> = new Set()): SpeciesId[] {
  if (n <= 0) return [];
  return c.roster
    .map((r, i) => ({ id: r.species, pts: getDraftMon(r.species)?.points ?? 0, i }))
    .filter((x) => !exclude.has(x.id) && !captainBlock(config, x.id))
    .sort((a, b) => b.pts - a.pts || a.i - b.i)
    .slice(0, n)
    .map((x) => x.id);
}

const teraOf = (c: Coach): SpeciesId[] => c.roster.filter((r) => r.isTeraCaptain).map((r) => r.species);
const zOf = (c: Coach): SpeciesId[] => c.roster.filter((r) => r.isZCaptain).map((r) => r.species);

/**
 * Sets the human's Tera and Z captains together. Each list must hold exactly captainQuota's count of distinct
 * roster species (config.teraCaptains / zCaptains unless the roster lacks eligible mons; 0 = an empty list,
 * which clears that role); no Mega may be a captain (it already holds its stone), nor a mon priced above
 * config.captainMaxPoints; no mon may be both a Tera and a Z captain. An omitted list keeps
 * the current captains of that role as they are (no count check, so Tera and Z can be set one at a time;
 * a mon already holding the other role is still refused). Allowed after the draft completes, any phase but champion/eliminated.
 */
export function setCaptains(
  run: RunState, captains: { tera?: readonly SpeciesId[]; z?: readonly SpeciesId[] },
): RunState {
  if (run.phase === 'champion' || run.phase === 'eliminated') throw new Error('run is over');
  if (!run.draft.complete) throw new Error('captains are set after the draft');
  const human = humanCoach(run);
  const tera = [...new Set(captains.tera ?? teraOf(human))];
  const z = [...new Set(captains.z ?? zOf(human))];
  const quota = captainQuota(run.config, human.roster);
  if (captains.tera && tera.length !== quota.tera) throw new Error(`pick exactly ${quota.tera} Tera captains`);
  if (captains.z && z.length !== quota.z) throw new Error(`pick exactly ${quota.z} Z captains`);
  for (const s of [...(captains.tera ? tera : []), ...(captains.z ? z : [])]) {
    if (!human.roster.some((r) => r.species === s)) throw new Error(`${s} is not on your roster`);
    const block = captainBlock(run.config, s);
    if (block === 'mega') throw new Error(`${monOf(s).name} is a Mega and cannot be a captain`);
    if (block === 'overCap') {
      throw new Error(`${monOf(s).name} (${monOf(s).points}) is over the ${run.config.captainMaxPoints}-pt captain cap`);
    }
  }
  const both = tera.find((s) => z.includes(s));
  if (both) throw new Error(`${monOf(both).name} cannot be both a Tera and a Z captain`);
  return {
    ...run,
    coaches: run.coaches.map((c) => (c.id === run.humanId ? withCaptains(c, tera, z) : c)),
  };
}

/** Sets the human's Tera captains (see setCaptains); Z captains are kept. */
export function setTeraCaptains(run: RunState, speciesIds: readonly SpeciesId[]): RunState {
  return setCaptains(run, { tera: speciesIds });
}

/** Sets the human's Z captains (see setCaptains); Tera captains are kept. To swap a mon between roles use setCaptains. */
export function setZCaptains(run: RunState, speciesIds: readonly SpeciesId[]): RunState {
  return setCaptains(run, { z: speciesIds });
}

/**
 * Default captains: Tera = the highest-priced captain-eligible mons (not a Mega, within captainMaxPoints), Z =
 * the next highest-priced eligible mons that are not Tera captains. The human keeps a role already set in full
 * (captainQuota's count); a role left unset gets the default.
 */
function defaultCaptains(c: Coach, config: LeagueConfig): Coach {
  const quota = captainQuota(config, c.roster);
  const keepTera = c.isHuman && teraOf(c).length === quota.tera;
  const keepZ = c.isHuman && zOf(c).length === quota.z;
  const keptZ = keepZ ? zOf(c) : [];
  const tera = keepTera ? teraOf(c) : topPriced(c, config, config.teraCaptains, new Set(keptZ));
  const z = keepZ ? keptZ : topPriced(c, config, config.zCaptains, new Set(tera));
  return withCaptains(c, tera, z);
}

/**
 * Ends the draft: AI Tera captains = their config.teraCaptains highest-priced captain-eligible mons (see
 * captainBlock), Z captains = the next config.zCaptains eligible ones. The human keeps each role set in full via
 * setCaptains / setTeraCaptains / setZCaptains, and gets the same default for a role left unset. Builds every
 * coach's sets with deps.buildSets(coach, seed), builds the schedule, phase -> 'season', week 1.
 */
export function finishDraft(run: RunState, deps: { buildSets: BuildSets }): RunState {
  if (run.phase !== 'draft') throw new Error(`not drafting (phase ${run.phase})`);
  if (!run.draft.complete) throw new Error('draft is not complete');
  const coaches = run.coaches.map((c, i): Coach => {
    const withCap = defaultCaptains(c, run.config);
    return { ...withCap, sets: deps.buildSets(withCap, deriveSeed(run.seed, 'sets', i)) };
  });
  const matches = buildSchedule(coaches.map((c) => c.id), run.config.weeks, createRng(deriveSeed(run.seed, 'schedule')));
  return {
    ...run,
    coaches,
    matches,
    phase: 'season',
    week: 1,
    log: [...run.log, `Season begins: ${run.config.weeks} weeks, top ${run.config.playoffTeams} make the playoffs.`],
  };
}

// ---- season ----

/** The human's unplayed match this week, if any. */
export function nextHumanMatch(run: RunState): Match | undefined {
  if (run.phase !== 'season' && run.phase !== 'playoffs') return undefined;
  return run.matches.find((m) => m.week === run.week && !m.result && (m.home === run.humanId || m.away === run.humanId));
}

/** The other coach in a match (relative to the human; for an AI-vs-AI match, the away coach). */
export function opponentOf(run: RunState, match: Match): Coach {
  return coachById(run, match.home === run.humanId ? match.away : match.home);
}

export function regularSeasonRecord(run: RunState, coach: CoachId): { wins: number; losses: number } {
  let wins = 0;
  let losses = 0;
  for (const m of run.matches) {
    if (m.playoffRound !== undefined || !m.result) continue;
    if (m.result.winner === coach) wins++;
    else if (m.result.loser === coach) losses++;
  }
  return { wins, losses };
}

function resultLine(run: RunState, m: Match): string {
  const r = m.result!;
  const label = m.playoffRound === undefined
    ? `Week ${m.week}`
    : `Week ${m.week} (${playoffRoundName(m.playoffRound, run.config.playoffTeams)})`;
  return `${label}: ${abbrevOf(run, r.winner)} beat ${abbrevOf(run, r.loser)} ${r.remaining[r.winner] ?? 0}-${r.remaining[r.loser] ?? 0}`;
}

/**
 * Records the human's result for this week, simulates every other unplayed match this week
 * (seed = deriveSeed(run.seed, 'week', week, matchId)), logs every result, then applies the rules:
 * regular-season losses > lossCap -> eliminated 'lossCap'; after the last regular week the playoffs
 * are seeded (missing them -> 'missedPlayoffs'); a playoff loss -> 'playoffLoss'; winning the final ->
 * 'champion'. Otherwise the week advances (and the next playoff round is built).
 */
export async function resolveWeek(
  run: RunState, humanResult: MatchResult, deps: { simulateMatch: SimulateMatch },
): Promise<RunState> {
  if (run.phase !== 'season' && run.phase !== 'playoffs') throw new Error(`no week to resolve (phase ${run.phase})`);
  const humanMatch = nextHumanMatch(run);
  if (!humanMatch) throw new Error(`no unplayed human match in week ${run.week}`);
  const pair = new Set([humanMatch.home, humanMatch.away]);
  if (!pair.has(humanResult.winner) || !pair.has(humanResult.loser) || humanResult.winner === humanResult.loser) {
    throw new Error('humanResult does not belong to this week\'s human match');
  }

  const week = run.week;
  const log = [...run.log];
  const matches: Match[] = [];
  const rules = rulesAt(run.config.stake);
  for (const m of run.matches) {
    if (m.week !== week || m.result) { matches.push(m); continue; }
    const result = m.id === humanMatch.id
      ? humanResult
      : await deps.simulateMatch(
        coachById(run, m.home), coachById(run, m.away), deriveSeed(run.seed, 'week', week, m.id), { aiSwitchOnKo: rules.aiSwitchOnKo },
      );
    matches.push({ ...m, result });
  }
  for (const m of matches) if (m.week === week && m.result) log.push(resultLine(run, m));

  let next: RunState = { ...run, matches, log };
  const humanLost = humanResult.loser === run.humanId;

  if (run.phase === 'season') {
    const { losses } = regularSeasonRecord(next, run.humanId);
    if (losses > run.config.lossCap) {
      return { ...next, phase: 'eliminated', eliminationReason: 'lossCap', log: [...log, `Run over: ${losses} regular-season losses (cap ${run.config.lossCap}).`] };
    }
    if (week >= run.config.weeks) {
      const standings = computeStandings(next.coaches, next.matches);
      const bracket = seedPlayoffs(standings, run.config.playoffTeams, week + 1);
      const humanRank = standings.find((s) => s.coach === run.humanId)?.rank ?? 0;
      next = { ...next, matches: [...next.matches, ...bracket], week: week + 1 };
      if (!bracket.some((m) => m.home === run.humanId || m.away === run.humanId)) {
        return { ...next, phase: 'eliminated', eliminationReason: 'missedPlayoffs', log: [...log, `Run over: finished #${humanRank}, missed the playoffs.`] };
      }
      return { ...next, phase: 'playoffs', log: [...log, `Playoffs: you are seed #${humanRank}.`] };
    }
    return { ...next, week: week + 1 };
  }

  // playoffs
  const round = humanMatch.playoffRound!;
  if (humanLost) {
    return { ...next, phase: 'eliminated', eliminationReason: 'playoffLoss', log: [...log, `Run over: knocked out in the ${playoffRoundName(round, run.config.playoffTeams)}.`] };
  }
  const nextRound = advancePlayoffs(next.matches, round);
  if (nextRound.length === 0) {
    return { ...next, phase: 'champion', log: [...log, 'Champion!'] };
  }
  return { ...next, matches: [...next.matches, ...nextRound], week: week + 1 };
}

// ---- free agency ----

/**
 * Human-only move between weeks in the regular season: drop a roster mon, add an undrafted one
 * (it must be in draft.available). Checks the move budget (config.freeAgencyMoves) and the point budget.
 * The added mon inherits the dropped mon's Tera / Z captain flags unless it may not be a captain (a Mega, or
 * priced over config.captainMaxPoints); that can leave the human a captain short, which is allowed until
 * setCaptains fills the role.
 * The dropped mon returns to the pool.
 * With deps.buildSets the coach's sets are rebuilt and only the new mon's set is taken; without it the
 * dropped mon's set is removed and the new mon has none.
 */
export function freeAgency(
  run: RunState, dropSpecies: SpeciesId, addSpecies: SpeciesId, deps: { buildSets?: BuildSets } = {},
): RunState {
  if (run.phase !== 'season') throw new Error('free agency is only open during the regular season');
  if (run.freeAgencyUsed >= run.config.freeAgencyMoves) throw new Error('no free-agency moves left this season');
  const human = humanCoach(run);
  const dropIdx = human.roster.findIndex((r) => r.species === dropSpecies);
  if (dropIdx < 0) throw new Error(`${dropSpecies} is not on your roster`);
  if (!run.draft.available.includes(addSpecies)) throw new Error(`${addSpecies} is not a free agent`);
  const drop = monOf(dropSpecies);
  const add = monOf(addSpecies);
  const kept = human.roster.filter((_, i) => i !== dropIdx).map((r) => r.species);
  if (conflictsWithRoster(kept, addSpecies, runPool(run))) throw new Error(`${add.name} is another form of a species you already own`);
  const spent = human.pointsSpent - drop.points + add.points;
  if (spent > run.config.budget) throw new Error(`${add.name} (${add.points}) puts you over budget (${spent}/${run.config.budget})`);

  const canCaptain = !captainBlock(run.config, addSpecies);
  const roster = human.roster.map((r, i): RosterEntry => (i === dropIdx
    ? { species: addSpecies, isTeraCaptain: canCaptain && r.isTeraCaptain, isZCaptain: canCaptain && !!r.isZCaptain }
    : r));
  const sets = { ...human.sets };
  delete sets[dropSpecies];
  let updated: Coach = { ...human, roster, pointsSpent: spent, sets };
  if (deps.buildSets) {
    const built = deps.buildSets(updated, deriveSeed(run.seed, 'fa', run.freeAgencyUsed));
    const s = built[addSpecies];
    if (s) updated = { ...updated, sets: { ...sets, [addSpecies]: s } };
  }
  return {
    ...run,
    coaches: run.coaches.map((c) => (c.id === human.id ? updated : c)),
    draft: { ...run.draft, available: [...run.draft.available.filter((id) => id !== addSpecies), dropSpecies] },
    freeAgencyUsed: run.freeAgencyUsed + 1,
    log: [...run.log, `Week ${run.week} free agency: ${human.abbrev} dropped ${drop.name}, signed ${add.name}.`],
  };
}

// ---- persistence ----

export function serializeRun(run: RunState): string {
  return JSON.stringify(run);
}

/**
 * Parses a save made by serializeRun. Older versions are migrated step by step (v1: Megas off, Z off; v2: a
 * fixed roster size, no captain cap; v3: no stake). Throws on a non-run payload or an unknown version.
 */
export function deserializeRun(json: string): RunState {
  const raw = JSON.parse(json) as RunState;
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.coaches) || !raw.draft
    || !Array.isArray(raw.draft.available) || !Array.isArray(raw.matches) || !raw.config) {
    throw new Error('not a PokeDraftChamps run save');
  }
  let run = raw;
  if (run.version === 1) run = migrateV1(run);
  if (run.version === 2) run = migrateV2(run);
  if (run.version === 3) run = migrateV3(run);
  if (run.version !== RUN_SAVE_VERSION) throw new Error(`unsupported save version ${String(raw.version)}`);
  return run;
}

/** v1 -> v2: config gains megas = false and zCaptains = 0; every roster entry gains isZCaptain = false. */
function migrateV1(raw: RunState): RunState {
  return {
    ...raw,
    version: 2,
    config: { ...raw.config, megas: false, zCaptains: 0 },
    coaches: raw.coaches.map((c) => ({ ...c, roster: c.roster.map((r) => ({ ...r, isZCaptain: false })) })),
  };
}

/**
 * v2 -> v3: rosterSize becomes rosterMin = rosterMax = the old size and captainMaxPoints = MAX_POINTS (no cap),
 * so an old league plays exactly as before. Without stops the snake turn equals the pick index.
 */
function migrateV2(raw: RunState): RunState {
  const { rosterSize, ...config } = raw.config as LeagueConfig & { rosterSize?: number };
  const size = rosterSize ?? DEFAULT_LEAGUE_CONFIG.rosterMax;
  return {
    ...raw,
    version: 3,
    config: { ...config, rosterMin: size, rosterMax: size, captainMaxPoints: MAX_POINTS },
    draft: { ...raw.draft, turn: raw.draft.pickIndex, done: [] },
  };
}

/** v3 -> v4: config.stake = 1 (the base game). draft.budgets stays absent: every coach has config.budget. */
function migrateV3(raw: RunState): RunState {
  return { ...raw, version: 4, config: { ...raw.config, stake: 1 } };
}
