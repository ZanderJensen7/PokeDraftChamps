// The engine facade: the league's injected dependencies bound to the real battle layer.
// The app uses these; tests for league/ keep using fakes.
import type { Coach, SpeciesId, BattleSet } from './types';
import type { BuildSets, SimulateMatch } from './league/run';
import { buildSeasonSets } from './battle/sets';
import { simulateMatch } from './battle/simulateMatch';

/** Builds every roster mon's season set for a coach (deterministic per seed). */
export const buildSets: BuildSets = (coach: Coach, seed: number): Record<SpeciesId, BattleSet> =>
  buildSeasonSets(coach.roster, seed);

/** Simulates one AI-vs-AI match with the heuristic AI on both sides. */
export const simulateLeagueMatch: SimulateMatch = simulateMatch;

/** Everything the league transitions need, in one object. */
export const engineDeps = { buildSets, simulateMatch: simulateLeagueMatch };
