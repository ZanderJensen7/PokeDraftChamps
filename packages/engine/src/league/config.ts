// League option checks, shared by createRun and the setup screen.
import type { LeagueConfig } from '../types';
import { buildDraftPool } from '../draft/pool';
import { MAX_POINTS } from '../data/points';
import { MAX_STAKE } from '../data/stakes';

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
  const minOk = isInt(c.rosterMin) && c.rosterMin >= 6;
  if (!minOk) errors.push(`The roster minimum must be at least 6 mons, since a match brings 6 (got ${String(c.rosterMin)}).`);
  const maxOk = isInt(c.rosterMax) && (!minOk || c.rosterMax >= c.rosterMin);
  if (!maxOk) errors.push(`The roster maximum must be a whole number no lower than the minimum (got ${String(c.rosterMax)}).`);
  const rosterOk = minOk && maxOk;
  if (!isInt(c.teraCaptains) || c.teraCaptains < 0) errors.push('Tera captains must be a whole number, 0 or more.');
  if (!isInt(c.zCaptains) || c.zCaptains < 0) errors.push('Z captains must be a whole number, 0 or more.');
  if (minOk && isInt(c.teraCaptains) && isInt(c.zCaptains) && c.teraCaptains + c.zCaptains > c.rosterMin - 1) {
    errors.push(`Tera and Z captains together may be at most ${c.rosterMin - 1} (one less than the roster minimum).`);
  }
  if (!isInt(c.captainMaxPoints) || c.captainMaxPoints < 1 || c.captainMaxPoints > MAX_POINTS) {
    errors.push(`The captain price cap must be 1 to ${MAX_POINTS} points (${MAX_POINTS} = no cap; got ${String(c.captainMaxPoints)}).`);
  }
  if (rosterOk) {
    const pool = buildDraftPool({ megas: !!c.megas });
    const cheapest = Math.min(...pool.map((m) => m.points));
    const need = c.rosterMin * cheapest;
    if (typeof c.budget !== 'number' || !(c.budget >= need)) {
      errors.push(`The budget must be at least ${need} points (${c.rosterMin} mons at the cheapest price, ${cheapest}).`);
    }
    if (teams * c.rosterMax > pool.length) {
      errors.push(`${teams} rosters of up to ${c.rosterMax} need ${teams * c.rosterMax} mons, but the pool has ${pool.length}.`);
    }
  }
  if (!isInt(c.lossCap) || c.lossCap < 0) errors.push('The loss cap must be a whole number, 0 or more.');
  if (!isInt(c.freeAgencyMoves) || c.freeAgencyMoves < 0) errors.push('Free-agency moves must be a whole number, 0 or more.');
  if (!isInt(c.stake) || c.stake < 1 || c.stake > MAX_STAKE) errors.push(`The stake must be 1 to ${MAX_STAKE} (got ${String(c.stake)}).`);
  return errors;
}
