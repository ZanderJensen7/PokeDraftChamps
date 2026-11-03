// The career profile: every finished run boiled down to a summary, the stakes ladder, and a per-species trophy
// case. Pure and sim-free; the app keeps one Profile in its own localStorage key and calls recordRunEnd once a
// run ends. Recording is idempotent by run id, so a reload of a finished run never counts it twice.
import type { RunState, RunSummary, SpeciesId } from './types';
import { MAX_STAKE } from './data/stakes';
import { summarizeRun } from './league/summary';

/** What one species has done for you across every run. */
export interface Trophy {
  /** Runs it finished on your roster. */
  drafted: number;
  /** Playoff matches you won with it brought. */
  playoffWins: number;
  /** Runs it was your MVP. */
  mvp: number;
  /** Championship rosters it was on. */
  titles: number;
}

/** A run in the career list: its summary plus the per-species playoff wins, so profiles merge exactly. */
export interface CareerRun extends RunSummary {
  /** Roster species -> playoff matches won while brought (absent = none). */
  playoffWinsBy?: Record<SpeciesId, number>;
}

export interface Profile {
  version: 2;
  /** Highest stake the setup screen offers (1 = only the base game). */
  stakeUnlocked: number;
  /** Finished runs, oldest first, newest last, at most PROFILE_RUN_CAP. */
  runs: CareerRun[];
  trophies: Record<SpeciesId, Trophy>;
}

export const PROFILE_VERSION = 2;
/** Runs the career list keeps; the trophy case keeps counting past it. */
export const PROFILE_RUN_CAP = 200;

export function emptyProfile(): Profile {
  return { version: 2, stakeUnlocked: 1, runs: [], trophies: {} };
}

const clampStake = (n: unknown): number =>
  typeof n === 'number' && Number.isInteger(n) ? Math.max(1, Math.min(MAX_STAKE, n)) : 1;

const count = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

function cleanTrophies(raw: unknown): Record<SpeciesId, Trophy> {
  const out: Record<SpeciesId, Trophy> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, t] of Object.entries(raw as Record<string, Partial<Trophy>>)) {
    if (!t || typeof t !== 'object') continue;
    out[id] = { drafted: count(t.drafted), playoffWins: count(t.playoffWins), mvp: count(t.mvp), titles: count(t.titles) };
  }
  return out;
}

const isRun = (r: unknown): r is CareerRun =>
  !!r && typeof r === 'object' && typeof (r as CareerRun).runId === 'string' && Array.isArray((r as CareerRun).roster)
  && typeof (r as CareerRun).config === 'object';

/**
 * Reads any stored profile: v1 (`{ version: 1, stakeUnlocked }`) gains an empty career; v2 is cleaned field by
 * field. Anything unreadable becomes the empty profile, never a throw.
 */
export function migrateProfile(raw: unknown): Profile {
  if (!raw || typeof raw !== 'object') return emptyProfile();
  const p = raw as Partial<Profile> & { version?: number };
  const runs = p.version === 2 && Array.isArray(p.runs) ? p.runs.filter(isRun) : [];
  return {
    version: 2,
    stakeUnlocked: clampStake(p.stakeUnlocked),
    runs: dedupe(runs).slice(-PROFILE_RUN_CAP),
    trophies: p.version === 2 ? cleanTrophies(p.trophies) : {},
  };
}

/** First copy of each run id wins; order kept. */
function dedupe(runs: CareerRun[]): CareerRun[] {
  const seen = new Set<string>();
  return runs.filter((r) => (seen.has(r.runId) ? false : (seen.add(r.runId), true)));
}

const isOver = (run: RunState): boolean => run.phase === 'champion' || run.phase === 'eliminated';

/** Playoff matches the human won, per roster species brought. */
function playoffWinsBy(run: RunState): Record<SpeciesId, number> {
  const onRoster = new Set(run.coaches.find((c) => c.id === run.humanId)?.roster.map((r) => r.species) ?? []);
  const out: Record<SpeciesId, number> = {};
  for (const m of run.matches) {
    if (m.playoffRound === undefined || m.result?.winner !== run.humanId) continue;
    for (const id of new Set(m.result.lineups[run.humanId] ?? [])) {
      if (onRoster.has(id)) out[id] = (out[id] ?? 0) + 1;
    }
  }
  return out;
}

/** What one career run adds to the trophy case. */
function addTrophies(trophies: Record<SpeciesId, Trophy>, r: CareerRun): Record<SpeciesId, Trophy> {
  const out = { ...trophies };
  const champion = r.phase === 'champion';
  for (const id of new Set(r.roster)) {
    const t = out[id] ?? { drafted: 0, playoffWins: 0, mvp: 0, titles: 0 };
    out[id] = {
      drafted: t.drafted + 1,
      playoffWins: t.playoffWins + (r.playoffWinsBy?.[id] ?? 0),
      mvp: t.mvp + (r.mvp?.species === id ? 1 : 0),
      titles: t.titles + (champion ? 1 : 0),
    };
  }
  return out;
}

/** The stake rule: a league title at (or above) the highest unlocked stake opens the next one. Dailies never do. */
function nextStake(stakeUnlocked: number, r: Pick<RunSummary, 'daily' | 'phase' | 'config'>): number {
  const stake = r.config.stake;
  if (r.daily || r.phase !== 'champion' || stake < stakeUnlocked || stake >= MAX_STAKE) return stakeUnlocked;
  return stake + 1;
}

/**
 * Counts a finished run (league or daily) once: appends its summary (newest last, capped), raises the stake
 * ladder, and adds to the trophy case. A run still in progress, or one already recorded, returns `profile`
 * unchanged (the same object).
 */
export function recordRunEnd(profile: Profile, run: RunState, finishedAt: number = Date.now()): Profile {
  if (!isOver(run) || profile.runs.some((r) => r.runId === run.id)) return profile;
  const by = playoffWinsBy(run);
  const entry: CareerRun = { ...summarizeRun(run, finishedAt), ...(Object.keys(by).length > 0 ? { playoffWinsBy: by } : {}) };
  return {
    version: 2,
    stakeUnlocked: nextStake(profile.stakeUnlocked, entry),
    runs: [...profile.runs, entry].slice(-PROFILE_RUN_CAP),
    trophies: addTrophies(profile.trophies, entry),
  };
}

/**
 * Folds an imported profile into the local one by run id, never dropping a local run: runs only the import has
 * are added (sorted into place by finish time, capped) and their trophies counted; the stake is the higher of
 * the two. An empty local profile takes the import's trophy case as is (it may count runs past the cap).
 */
export function mergeProfiles(local: Profile, incoming: Profile): Profile {
  const have = new Set(local.runs.map((r) => r.runId));
  // Never drop a local run to the cap: imported runs fill the room left, newest first.
  const room = Math.max(0, PROFILE_RUN_CAP - local.runs.length);
  const fresh = incoming.runs.filter((r) => !have.has(r.runId)).sort((a, b) => a.finishedAt - b.finishedAt);
  const added = room === 0 ? [] : fresh.slice(-room);
  if (added.length === 0 && incoming.stakeUnlocked <= local.stakeUnlocked) return local;
  const empty = local.runs.length === 0 && Object.keys(local.trophies).length === 0;
  return {
    version: 2,
    stakeUnlocked: Math.max(local.stakeUnlocked, incoming.stakeUnlocked),
    runs: [...local.runs, ...added].sort((a, b) => a.finishedAt - b.finishedAt),
    trophies: empty ? incoming.trophies : added.reduce(addTrophies, local.trophies),
  };
}

export interface CareerStats {
  runs: number;
  titles: number;
  /** Highest stake with a league title, 0 when none. */
  bestStakeWon: number;
  /** Matches won / played across every run (regular season + playoffs), 0 when none. */
  winRate: number;
  bestScore: number;
  /** Most titles in a row, in finish order. */
  longestTitleStreak: number;
  /** League titles per stake: index 0 = stake 1, length MAX_STAKE. Dailies are left out. */
  titlesPerStake: number[];
}

/** Career totals over the runs the profile keeps. */
export function careerStats(profile: Profile): CareerStats {
  const titlesPerStake = Array.from({ length: MAX_STAKE }, () => 0);
  let titles = 0;
  let won = 0;
  let played = 0;
  let bestScore = 0;
  let streak = 0;
  let longestTitleStreak = 0;
  for (const r of profile.runs) {
    won += r.wins + r.playoffWins;
    played += r.matchesPlayed;
    bestScore = Math.max(bestScore, r.score);
    if (r.phase === 'champion') {
      titles++;
      streak++;
      longestTitleStreak = Math.max(longestTitleStreak, streak);
      if (!r.daily) titlesPerStake[clampStake(r.config.stake) - 1]!++;
    } else {
      streak = 0;
    }
  }
  let bestStakeWon = 0;
  titlesPerStake.forEach((n, i) => { if (n > 0) bestStakeWon = i + 1; });
  return {
    runs: profile.runs.length,
    titles,
    bestStakeWon,
    winRate: played === 0 ? 0 : won / played,
    bestScore,
    longestTitleStreak,
    titlesPerStake,
  };
}
