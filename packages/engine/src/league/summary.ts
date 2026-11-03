// A run boiled down: the score, the RunSummary the run-end screen / daily leaderboard / opt-in upload use,
// and the share string. Sim-free; reads stored results and the stats module only.
import type { RunState, RunSummary } from '../types';
import { runSpeciesStats, topPerformers } from '../stats/aggregate';
import { computeStandings } from './standings';
import { humanCoach, regularSeasonRecord } from './run';

/** Points per outcome. One data table; tune here, never in the formula. */
export const DAILY_SCORE = {
  /** Each regular-season win. */
  win: 100,
  /** Each point of standings differential (mons left minus theirs, summed), positive or negative. */
  differential: 5,
  /** Each playoff win. */
  playoffWin: 150,
  /** Winning the final. */
  title: 500,
} as const;

/** Regular-season wins and playoff wins for a coach, from stored results. */
function record(run: RunState): { wins: number; losses: number; playoffWins: number; differential: number; rank: number; played: number } {
  const id = run.humanId;
  const { wins, losses } = regularSeasonRecord(run, id);
  let playoffWins = 0;
  let played = 0;
  for (const m of run.matches) {
    if (!m.result || (m.home !== id && m.away !== id)) continue;
    played++;
    if (m.playoffRound !== undefined && m.result.winner === id) playoffWins++;
  }
  const row = computeStandings(run.coaches, run.matches).find((s) => s.coach === id);
  return { wins, losses, playoffWins, differential: row?.differential ?? 0, rank: played === 0 ? 0 : (row?.rank ?? 0), played };
}

/** The run's score so far (never below 0): see DAILY_SCORE. The same formula serves every mode. */
export function runScore(run: RunState): number {
  const r = record(run);
  const raw = r.wins * DAILY_SCORE.win
    + r.differential * DAILY_SCORE.differential
    + r.playoffWins * DAILY_SCORE.playoffWin
    + (run.phase === 'champion' ? DAILY_SCORE.title : 0);
  return Math.max(0, raw);
}

/** Builds the RunSummary. `finishedAt` defaults to Date.now(). Pure apart from that default. */
export function summarizeRun(run: RunState, finishedAt: number = Date.now()): RunSummary {
  const human = humanCoach(run);
  const r = record(run);
  const top = run.draft.complete ? topPerformers(runSpeciesStats(run), 1, run.humanId)[0] : undefined;
  return {
    version: 1,
    runId: run.id,
    seed: run.seed,
    config: run.config,
    ...(run.daily ? { daily: run.daily.date } : {}),
    humanName: human.name,
    humanAbbrev: human.abbrev,
    phase: run.phase,
    ...(run.eliminationReason ? { eliminationReason: run.eliminationReason } : {}),
    wins: r.wins,
    losses: r.losses,
    differential: r.differential,
    playoffWins: r.playoffWins,
    rank: r.rank,
    matchesPlayed: r.played,
    score: runScore(run),
    roster: human.roster.map((x) => x.species),
    ...(top ? { mvp: { species: top.species, name: top.name, winRate: top.winRate, kos: top.kos } } : {}),
    createdAt: run.createdAt,
    finishedAt,
  };
}

/** "6-1, champion" / "3-4, out at the loss cap" / "5-2, lost in the playoffs" / "2-1, in progress". */
export function resultLabel(s: Pick<RunSummary, 'wins' | 'losses' | 'phase' | 'eliminationReason'>): string {
  const rec = `${s.wins}-${s.losses}`;
  if (s.phase === 'champion') return `${rec}, champion`;
  if (s.phase !== 'eliminated') return `${rec}, in progress`;
  switch (s.eliminationReason) {
    case 'lossCap': return `${rec}, out at the loss cap`;
    case 'missedPlayoffs': return `${rec}, missed the playoffs`;
    case 'playoffLoss': return `${rec}, lost in the playoffs`;
    default: return `${rec}, run over`;
  }
}

/** League code as the setup screen shows it (base-36 seed, upper case, 6+ chars). */
export function leagueCodeOf(seed: number): string {
  return (seed >>> 0).toString(36).toUpperCase().padStart(6, '0');
}

/**
 * One line to paste anywhere:
 * "PokeDraftChamps daily 2026-11-02 · PAL 6-1, champion · 1,240 pts · league ABC123"
 */
export function shareString(s: RunSummary): string {
  const mode = s.daily ? `daily ${s.daily}` : `${s.config.teams}-team league`;
  const pts = s.score.toLocaleString('en-US');
  return `PokeDraftChamps ${mode} · ${s.humanAbbrev} ${resultLabel(s)} · ${pts} pts · league ${leagueCodeOf(s.seed)}`;
}
