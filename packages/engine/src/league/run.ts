// Run state + transitions. Every function is pure: it returns a NEW RunState and never mutates its input.
// Randomness comes only from run.seed via deriveSeed, so a run replays identically from its seed + inputs.
import type {
  BattleSet, Coach, CoachId, DraftMon, LeagueConfig, Match, MatchResult, RosterEntry, RunState, SpeciesId,
} from '../types';
import { pickCoachIdentities } from '../data/coaches';
import { buildDraftPool, getDraftMon } from '../draft/pool';
import { aiChoosePick, applyPick, createDraft, currentPicker, conflictsWithRoster } from '../draft/draft';
import { createRng, deriveSeed } from './rng';
import { buildSchedule } from './schedule';
import { computeStandings } from './standings';
import { advancePlayoffs, playoffRoundName, seedPlayoffs } from './playoffs';
import { validateLeagueConfig } from './config';

/** 2: league options megas + zCaptains, RosterEntry.isZCaptain (version-1 saves are migrated on load). */
export const RUN_SAVE_VERSION = 2;

export interface CreateRunOptions {
  config: LeagueConfig;
  seed: number;
  humanName: string;
  humanAbbrev: string;
  /** Epoch ms; defaults to Date.now(). Pass it for reproducible ids in tests. */
  createdAt?: number;
}

/** Builds a coach's season sets. Injected (the battle module owns the real one). */
export type BuildSets = (coach: Coach, seed: number) => Record<SpeciesId, BattleSet>;
/** Simulates one AI-involved match. Injected (the battle module owns the real one). */
export type SimulateMatch = (home: Coach, away: Coach, seed: number) => MatchResult | Promise<MatchResult>;

const HUMAN_ID: CoachId = 'c0';

function validateConfig(c: LeagueConfig): void {
  const errors = validateLeagueConfig(c);
  if (errors.length > 0) throw new Error(errors.join(' '));
}

/** The draft pool this league uses (its `megas` option). */
export function runPool(run: Pick<RunState, 'config'>): readonly DraftMon[] {
  return buildDraftPool({ megas: run.config.megas });
}

export function createRun(opts: CreateRunOptions): RunState {
  const { config, seed } = opts;
  validateConfig(config);
  const createdAt = opts.createdAt ?? Date.now();
  const abbrev = opts.humanAbbrev.trim().toUpperCase();
  const identities = pickCoachIdentities(createRng(deriveSeed(seed, 'coaches')), config.teams - 1, [abbrev, opts.humanName]);
  const coaches: Coach[] = [
    { id: HUMAN_ID, name: opts.humanName, abbrev, isHuman: true, roster: [], pointsSpent: 0, sets: {} },
    ...identities.map((idn, i): Coach => ({
      id: `c${i + 1}`, name: idn.name, abbrev: idn.abbrev, isHuman: false, roster: [], pointsSpent: 0, sets: {},
    })),
  ];
  const draft = createDraft(coaches.map((c) => c.id), createRng(deriveSeed(seed, 'draftOrder')), buildDraftPool({ megas: config.megas }));
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
    log: [`League created: ${config.teams} coaches, ${config.weeks} weeks, ${config.budget} points. You pick #${pos} in round 1.`],
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

const isMegaId = (id: SpeciesId): boolean => getDraftMon(id)?.isMega ?? false;

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

function afterPick(run: RunState, coach: CoachId, species: SpeciesId): RunState {
  const draft = applyPick(run.draft, coach, species, run.config, runPool(run));
  const pick = draft.picks[draft.picks.length - 1]!;
  let next: RunState = {
    ...run,
    draft,
    log: [...run.log, `Draft R${pick.round} #${pick.overall}: ${abbrevOf(run, coach)} took ${monOf(species).name} (${pick.points})`],
  };
  next = syncRosters(next);
  if (draft.complete) next = { ...next, log: [...next.log, 'Draft complete.'] };
  return next;
}

// ---- draft ----

/** The human's pick. Throws if it is not the human's turn or the pick is illegal. */
export function draftPick(run: RunState, species: SpeciesId): RunState {
  if (run.phase !== 'draft') throw new Error(`not drafting (phase ${run.phase})`);
  return afterPick(run, run.humanId, species);
}

/** AI coaches pick until it is the human's turn or the draft completes. Pick seeds derive from (seed, pick index). */
export function runAiDraftUntilHuman(run: RunState): RunState {
  if (run.phase !== 'draft') return run;
  let cur = run;
  const pool = runPool(run);
  for (;;) {
    const picker = currentPicker(cur.draft, cur.config);
    if (picker === undefined || picker === cur.humanId) return cur;
    const rng = createRng(deriveSeed(cur.seed, 'pick', cur.draft.pickIndex));
    const species = aiChoosePick(cur.draft, picker, cur.config, pool, rng);
    cur = afterPick(cur, picker, species);
  }
}

function withCaptains(c: Coach, tera: readonly SpeciesId[], z: readonly SpeciesId[]): Coach {
  const t = new Set(tera);
  const zs = new Set(z);
  return { ...c, roster: c.roster.map((r) => ({ ...r, isTeraCaptain: t.has(r.species), isZCaptain: zs.has(r.species) })) };
}

/** The `n` highest-priced non-Mega roster mons not in `exclude` (earlier pick wins ties). */
function topPriced(c: Coach, n: number, exclude: ReadonlySet<SpeciesId> = new Set()): SpeciesId[] {
  if (n <= 0) return [];
  return c.roster
    .map((r, i) => ({ id: r.species, pts: getDraftMon(r.species)?.points ?? 0, i }))
    .filter((x) => !exclude.has(x.id) && !isMegaId(x.id))
    .sort((a, b) => b.pts - a.pts || a.i - b.i)
    .slice(0, n)
    .map((x) => x.id);
}

const teraOf = (c: Coach): SpeciesId[] => c.roster.filter((r) => r.isTeraCaptain).map((r) => r.species);
const zOf = (c: Coach): SpeciesId[] => c.roster.filter((r) => r.isZCaptain).map((r) => r.species);

/**
 * Sets the human's Tera and Z captains together. Each list must hold exactly config.teraCaptains /
 * config.zCaptains distinct roster species (0 = an empty list, which clears that role); no Mega may be a
 * captain (it already holds its stone); no mon may be both a Tera and a Z captain. An omitted list keeps
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
  if (captains.tera && tera.length !== run.config.teraCaptains) throw new Error(`pick exactly ${run.config.teraCaptains} Tera captains`);
  if (captains.z && z.length !== run.config.zCaptains) throw new Error(`pick exactly ${run.config.zCaptains} Z captains`);
  for (const s of [...(captains.tera ? tera : []), ...(captains.z ? z : [])]) {
    if (!human.roster.some((r) => r.species === s)) throw new Error(`${s} is not on your roster`);
    if (isMegaId(s)) throw new Error(`${monOf(s).name} is a Mega and cannot be a captain`);
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
 * Default captains: Tera = the highest-priced non-Megas, Z = the next highest-priced non-Megas that are not
 * Tera captains. The human keeps a role already set in full (exact count); a role left unset gets the default.
 */
function defaultCaptains(c: Coach, config: LeagueConfig): Coach {
  const keepTera = c.isHuman && teraOf(c).length === config.teraCaptains;
  const keepZ = c.isHuman && zOf(c).length === config.zCaptains;
  const keptZ = keepZ ? zOf(c) : [];
  const tera = keepTera ? teraOf(c) : topPriced(c, config.teraCaptains, new Set(keptZ));
  const z = keepZ ? keptZ : topPriced(c, config.zCaptains, new Set(tera));
  return withCaptains(c, tera, z);
}

/**
 * Ends the draft: AI Tera captains = their config.teraCaptains highest-priced non-Mega mons, Z captains =
 * the next config.zCaptains highest-priced non-Megas. The human keeps each role set in full via
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
  for (const m of run.matches) {
    if (m.week !== week || m.result) { matches.push(m); continue; }
    const result = m.id === humanMatch.id
      ? humanResult
      : await deps.simulateMatch(coachById(run, m.home), coachById(run, m.away), deriveSeed(run.seed, 'week', week, m.id));
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
 * The added mon inherits the dropped mon's Tera / Z captain flags unless it is a Mega (a Mega is never a
 * captain); that can leave the human a captain short, which is allowed until setCaptains fills the role.
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

  const roster = human.roster.map((r, i): RosterEntry => (i === dropIdx
    ? { species: addSpecies, isTeraCaptain: !add.isMega && r.isTeraCaptain, isZCaptain: !add.isMega && !!r.isZCaptain }
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

/** Parses a save made by serializeRun. Version-1 saves are migrated (Megas off, Z off). Throws on a non-run payload or an unknown version. */
export function deserializeRun(json: string): RunState {
  const raw = JSON.parse(json) as RunState;
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.coaches) || !raw.draft
    || !Array.isArray(raw.draft.available) || !Array.isArray(raw.matches) || !raw.config) {
    throw new Error('not a PokeDraftChamps run save');
  }
  if (raw.version === 1) return migrateV1(raw);
  if (raw.version !== RUN_SAVE_VERSION) throw new Error(`unsupported save version ${String(raw.version)}`);
  return raw;
}

/** v1 -> v2: config gains megas = false and zCaptains = 0; every roster entry gains isZCaptain = false. */
function migrateV1(raw: RunState): RunState {
  return {
    ...raw,
    version: RUN_SAVE_VERSION,
    config: { ...raw.config, megas: false, zCaptains: 0 },
    coaches: raw.coaches.map((c) => ({ ...c, roster: c.roster.map((r) => ({ ...r, isZCaptain: false })) })),
  };
}
