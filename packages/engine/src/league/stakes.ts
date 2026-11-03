// Stake rules that read the run (the ladder itself is data/stakes.ts).
import type { CoachId, RosterEntry, RunState, ScoutReport } from '../types';
import { rulesAt } from '../data/stakes';
import { coachById } from './run';

/**
 * The part of a coach's roster the human may see. Under fog of war (stake 7+) an opposing roster shows only the
 * mons `scout` (that coach's stored battles) has seen brought; without a report, nothing. Otherwise, and for the
 * human's own roster, the whole roster.
 */
export function visibleRoster(run: RunState, coachId: CoachId, scout?: ScoutReport): RosterEntry[] {
  const roster = coachById(run, coachId).roster;
  if (!rulesAt(run.config.stake).fogOfWar || coachId === run.humanId) return roster;
  return roster.filter((r) => (scout?.bySpecies[r.species]?.timesBrought ?? 0) > 0);
}
