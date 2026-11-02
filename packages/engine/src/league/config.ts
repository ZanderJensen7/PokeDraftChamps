// League option checks, shared by createRun and the setup screen.
import type { LeagueConfig } from '../types';
import { buildDraftPool } from '../draft/pool';

const TEAM_COUNTS: readonly number[] = [8, 12, 16];
export const MAX_WEEKS = 20;

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);

/** Every problem with a league config, as plain sentences. Empty = valid. */
export function validateLeagueConfig(config: LeagueConfig): string[] {
  const c = config;
  const errors: string[] = [];
  if (!TEAM_COUNTS.includes(c.teams)) errors.push(`The league must have 8, 12 or 16 teams (got ${String(c.teams)}).`);
  const teams = isInt(c.teams) ? c.teams : 0;
  if (!isInt(c.playoffTeams) || c.playoffTeams < 2 || (c.playoffTeams & (c.playoffTeams - 1)) !== 0 || c.playoffTeams > teams) {
    errors.push(`Playoff teams must be a power of two between 2 and the number of teams (got ${String(c.playoffTeams)}).`);
  }
  if (!isInt(c.weeks) || c.weeks < 1 || c.weeks > MAX_WEEKS) errors.push(`The season must last 1 to ${MAX_WEEKS} weeks (got ${String(c.weeks)}).`);
  const rosterOk = isInt(c.rosterSize) && c.rosterSize >= 6;
  if (!rosterOk) errors.push(`Rosters need at least 6 mons, since a match brings 6 (got ${String(c.rosterSize)}).`);
  if (!isInt(c.teraCaptains) || c.teraCaptains < 0) errors.push('Tera captains must be a whole number, 0 or more.');
  if (!isInt(c.zCaptains) || c.zCaptains < 0) errors.push('Z captains must be a whole number, 0 or more.');
  if (rosterOk && isInt(c.teraCaptains) && isInt(c.zCaptains) && c.teraCaptains + c.zCaptains > c.rosterSize - 1) {
    errors.push(`Tera and Z captains together may be at most ${c.rosterSize - 1} (one less than the roster size).`);
  }
  if (rosterOk) {
    const pool = buildDraftPool({ megas: !!c.megas });
    const cheapest = Math.min(...pool.map((m) => m.points));
    const need = c.rosterSize * cheapest;
    if (typeof c.budget !== 'number' || !(c.budget >= need)) {
      errors.push(`The budget must be at least ${need} points (${c.rosterSize} mons at the cheapest price, ${cheapest}).`);
    }
    if (teams * c.rosterSize > pool.length) {
      errors.push(`${teams} rosters of ${c.rosterSize} need ${teams * c.rosterSize} mons, but the pool has ${pool.length}.`);
    }
  }
  if (!isInt(c.lossCap) || c.lossCap < 0) errors.push('The loss cap must be a whole number, 0 or more.');
  if (!isInt(c.freeAgencyMoves) || c.freeAgencyMoves < 0) errors.push('Free-agency moves must be a whole number, 0 or more.');
  return errors;
}
