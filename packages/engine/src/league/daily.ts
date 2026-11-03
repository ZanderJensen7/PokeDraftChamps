// The daily league: one fixed config and one seed per UTC date, so everyone who plays that day drafts
// against the same AI picks (the run is deterministic from seed + the human's inputs). One attempt per day
// is the app's rule (its daily save slot); the engine only fixes the seed and the shape.
import type { LeagueConfig } from '../types';
import { DEFAULT_LEAGUE_CONFIG } from '../types';
import { deriveSeed } from './rng';

/** Shorter than a full league so a daily fits a sitting: 8 coaches, 7 weeks, top 4. Everything else default. */
export const DAILY_CONFIG: LeagueConfig = {
  ...DEFAULT_LEAGUE_CONFIG,
  teams: 8,
  weeks: 7,
  playoffTeams: 4,
};

const DAILY_SALT = 0x9d41_1e55;

/** The UTC calendar date as 'YYYY-MM-DD'. Daily leagues roll over at 00:00 UTC everywhere. */
export function dailyDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function isDailyDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && dailyDate(new Date(`${s}T00:00:00Z`)) === s;
}

/** The seed every player shares on `date`. Throws on a malformed date. */
export function dailySeed(date: string): number {
  if (!isDailyDate(date)) throw new Error(`not a daily date: ${date}`);
  return deriveSeed(DAILY_SALT, 'daily', date);
}

export interface DailyInfo {
  date: string;
  seed: number;
  config: LeagueConfig;
}

export function dailyInfo(date: string = dailyDate()): DailyInfo {
  return { date, seed: dailySeed(date), config: DAILY_CONFIG };
}
