// The career profile: every finished run boiled down to a summary, the stakes ladder, and a per-species trophy
// case. Pure and sim-free; the app keeps one Profile in its own localStorage key and calls recordRunEnd once a
// run ends. Recording is idempotent by run id, so a reload of a finished run never counts it twice. The profile
// also holds the pool progression (poolProgress.ts): a finished run pays its first-win points and floor pack here.
import type { RunState, RunSummary, SpeciesId } from './types';
import { MAX_STAKE } from './data/stakes';
import { POOL_PROGRESSION } from './data/progression';
import { summarizeRun } from './league/summary';
import { clearFresh, cleanPoolProgress, earnPacks, newPoolProgress, openPoolPack, type PoolProgress } from './poolProgress';

/** What one species has done for you across every run. */
export interface Trophy {
  /** Runs it finished on your roster. */
  drafted: number;
  /** Matches you won with it brought (regular season + playoffs). Profiles migrated from v2 start at playoffWins. */
  wins: number;
  /** Playoff matches you won with it brought. */
  playoffWins: number;
  /** Runs it was your MVP. */
  mvp: number;
  /** Championship rosters it was on. */
  titles: number;
}

/** A run in the career list: its summary plus the per-species wins, so profiles merge exactly. */
export interface CareerRun extends RunSummary {
  /** Roster species -> playoff matches won while brought (absent = none). */
  playoffWinsBy?: Record<SpeciesId, number>;
  /** Species brought -> matches won (absent = none; runs recorded before profile v3 lack it). */
  winsBy?: Record<SpeciesId, number>;
}

export interface Profile {
  version: 3;
  /** Highest stake the setup screen offers (1 = only the base game). */
  stakeUnlocked: number;
  /** Finished runs, oldest first, newest last, at most PROFILE_RUN_CAP. */
  runs: CareerRun[];
  trophies: Record<SpeciesId, Trophy>;
  /** The unlocked share of the draft pool and the scouting-pack track. */
  pool: PoolProgress;
}

export const PROFILE_VERSION = 3;
/** Runs the career list keeps; the trophy case keeps counting past it. */
export const PROFILE_RUN_CAP = 200;

/** A new profile; `poolSeed` picks its starting half of the pool (the app passes a random one). */
export function emptyProfile(poolSeed = 0): Profile {
  return { version: 3, stakeUnlocked: 1, runs: [], trophies: {}, pool: newPoolProgress(poolSeed) };
}

const noTrophy = (): Trophy => ({ drafted: 0, wins: 0, playoffWins: 0, mvp: 0, titles: 0 });

const clampStake = (n: unknown): number =>
  typeof n === 'number' && Number.isInteger(n) ? Math.max(1, Math.min(MAX_STAKE, n)) : 1;

const count = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

function cleanTrophies(raw: unknown): Record<SpeciesId, Trophy> {
  const out: Record<SpeciesId, Trophy> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, t] of Object.entries(raw as Record<string, Partial<Trophy>>)) {
    if (!t || typeof t !== 'object') continue;
    const playoffWins = count(t.playoffWins);
    // v2 never counted regular-season wins: playoff wins are the honest lower bound.
    out[id] = { drafted: count(t.drafted), wins: Math.max(count(t.wins), playoffWins), playoffWins, mvp: count(t.mvp), titles: count(t.titles) };
  }
  return out;
}

const isRun = (r: unknown): r is CareerRun =>
  !!r && typeof r === 'object' && typeof (r as CareerRun).runId === 'string' && Array.isArray((r as CareerRun).roster)
  && typeof (r as CareerRun).config === 'object';

/**
 * Reads any stored profile: v1 (`{ version: 1, stakeUnlocked }`) gains an empty career; v2 and v3 are cleaned field
 * by field. A profile without a pool (v1, v2) gets a new one from `poolSeed` (the app passes a random seed) plus every
 * species its runs already drafted, so nobody loses a mon. Anything unreadable becomes the empty profile, never a throw.
 */
export function migrateProfile(raw: unknown, poolSeed: number): Profile {
  if (!raw || typeof raw !== 'object') return emptyProfile(poolSeed);
  const p = raw as Partial<Omit<Profile, 'version'>> & { version?: number };
  const career = p.version === 2 || p.version === 3;
  const runs = career && Array.isArray(p.runs) ? dedupe(p.runs.filter(isRun)).slice(-PROFILE_RUN_CAP) : [];
  const trophies = career ? cleanTrophies(p.trophies) : {};
  const drafted = [...Object.keys(trophies), ...runs.flatMap((r) => r.roster)];
  return {
    version: 3,
    stakeUnlocked: clampStake(p.stakeUnlocked),
    runs,
    trophies,
    pool: (p.version === 3 ? cleanPoolProgress(p.pool) : undefined) ?? newPoolProgress(poolSeed, drafted),
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

/** Every match the human won, per species brought (whether or not it finished the run on the roster). */
function winsBy(run: RunState): Record<SpeciesId, number> {
  const out: Record<SpeciesId, number> = {};
  for (const m of run.matches) {
    if (!m.result || m.result.winner !== run.humanId) continue;
    for (const id of new Set(m.result.lineups[run.humanId] ?? [])) out[id] = (out[id] ?? 0) + 1;
  }
  return out;
}

/** What one career run adds to the trophy case: the final roster's runs, MVPs and titles, every brought mon's wins. */
function addTrophies(trophies: Record<SpeciesId, Trophy>, r: CareerRun): Record<SpeciesId, Trophy> {
  const out = { ...trophies };
  const champion = r.phase === 'champion';
  const roster = new Set(r.roster);
  for (const id of new Set([...roster, ...Object.keys(r.winsBy ?? {})])) {
    const t = out[id] ?? noTrophy();
    const on = roster.has(id);
    out[id] = {
      drafted: t.drafted + (on ? 1 : 0),
      wins: t.wins + (r.winsBy?.[id] ?? 0),
      playoffWins: t.playoffWins + (on ? (r.playoffWinsBy?.[id] ?? 0) : 0),
      mvp: t.mvp + (r.mvp?.species === id ? 1 : 0),
      titles: t.titles + (on && champion ? 1 : 0),
    };
  }
  return out;
}

/** Species a run won with for the first time on a profile with this trophy case: one pool point each. */
function firstWins(trophies: Readonly<Record<SpeciesId, Trophy>>, by: Readonly<Record<SpeciesId, number>>): SpeciesId[] {
  return Object.entries(by).filter(([id, n]) => n > 0 && (trophies[id]?.wins ?? 0) === 0).map(([id]) => id);
}

/** The species a finished run would pay first-win points for on `profile` (the run-end screen lists them). */
export function firstWinsOf(profile: Pick<Profile, 'trophies'>, run: RunState): SpeciesId[] {
  return firstWins(profile.trophies, winsBy(run));
}

/**
 * Adds one career run: its trophies, and the pool's pay against the trophy case as it stood before (a point per
 * first win, the floor pack once a match was played) with the NEW flair off whatever it drafted.
 */
function addRun(p: Pick<Profile, 'trophies' | 'pool'>, r: CareerRun): Pick<Profile, 'trophies' | 'pool'> {
  const floor = r.matchesPlayed > 0 ? POOL_PROGRESSION.floorPacksPerRun : 0;
  const pool = clearFresh(earnPacks(p.pool, firstWins(p.trophies, r.winsBy ?? {}).length, floor), r.roster);
  return { trophies: addTrophies(p.trophies, r), pool };
}

/** The stake rule: a league title at (or above) the highest unlocked stake opens the next one. Dailies and custom leagues never do. */
function nextStake(stakeUnlocked: number, r: Pick<RunSummary, 'daily' | 'phase' | 'config'>): number {
  const stake = r.config.stake;
  if (r.daily || r.config.custom || r.phase !== 'champion' || stake < stakeUnlocked || stake >= MAX_STAKE) return stakeUnlocked;
  return stake + 1;
}

/**
 * Counts a finished run (league or daily) once: appends its summary (newest last, capped), raises the stake
 * ladder, adds to the trophy case, and pays the pool (first-win points, the floor pack). A run still in progress,
 * or one already recorded, returns `profile` unchanged (the same object).
 */
export function recordRunEnd(profile: Profile, run: RunState, finishedAt: number = Date.now()): Profile {
  if (!isOver(run) || profile.runs.some((r) => r.runId === run.id)) return profile;
  const by = playoffWinsBy(run);
  const wins = winsBy(run);
  const entry: CareerRun = {
    ...summarizeRun(run, finishedAt),
    ...(Object.keys(by).length > 0 ? { playoffWinsBy: by } : {}),
    ...(Object.keys(wins).length > 0 ? { winsBy: wins } : {}),
  };
  return {
    version: 3,
    stakeUnlocked: nextStake(profile.stakeUnlocked, entry),
    runs: [...profile.runs, entry].slice(-PROFILE_RUN_CAP),
    ...addRun(profile, entry),
  };
}

/** Opens the next scouting pack keeping `keep` (see poolProgress.openPoolPack). Throws when no pack is waiting. */
export function openPack(profile: Profile, keep: SpeciesId | null): Profile {
  return { ...profile, pool: openPoolPack(profile.pool, keep) };
}

/** Drops the NEW flair from species the player just drafted. Returns `profile` itself when nothing changes. */
export function markDrafted(profile: Profile, species: readonly SpeciesId[]): Profile {
  const pool = clearFresh(profile.pool, species);
  return pool === profile.pool ? profile : { ...profile, pool };
}

/**
 * Folds an imported profile into the local one by run id, never dropping a local run: runs only the import has
 * are added (sorted into place by finish time, capped), their trophies counted and their pool pay added; the stake
 * is the higher of the two and the unlocked pool the union. An empty local profile takes the import's trophy case
 * and pool as they are (they may count runs past the cap).
 */
export function mergeProfiles(local: Profile, incoming: Profile): Profile {
  const have = new Set(local.runs.map((r) => r.runId));
  // Never drop a local run to the cap: imported runs fill the room left, newest first.
  const room = Math.max(0, PROFILE_RUN_CAP - local.runs.length);
  const fresh = incoming.runs.filter((r) => !have.has(r.runId)).sort((a, b) => a.finishedAt - b.finishedAt);
  const added = room === 0 ? [] : fresh.slice(-room);
  const mine = new Set(local.pool.unlocked);
  const newSpecies = [...new Set(incoming.pool.unlocked.filter((id) => !mine.has(id)))];
  if (added.length === 0 && incoming.stakeUnlocked <= local.stakeUnlocked && newSpecies.length === 0) return local;
  const empty = local.runs.length === 0 && Object.keys(local.trophies).length === 0;
  const stakeUnlocked = Math.max(local.stakeUnlocked, incoming.stakeUnlocked);
  const runs = [...local.runs, ...added].sort((a, b) => a.finishedAt - b.finishedAt);
  if (empty) return { version: 3, stakeUnlocked, runs, trophies: incoming.trophies, pool: incoming.pool };
  const folded = added.reduce(addRun, { trophies: local.trophies, pool: local.pool });
  const pool: PoolProgress = {
    ...folded.pool,
    unlocked: [...folded.pool.unlocked, ...newSpecies].sort(),
    fresh: [...new Set([...folded.pool.fresh, ...incoming.pool.fresh.filter((id) => !mine.has(id))])],
  };
  return { version: 3, stakeUnlocked, runs, trophies: folded.trophies, pool };
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
export function careerStats(profile: Pick<Profile, 'runs'>): CareerStats {
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
      if (!r.daily && !r.config.custom) titlesPerStake[clampStake(r.config.stake) - 1]!++;
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
