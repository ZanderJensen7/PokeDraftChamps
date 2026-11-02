// AI-vs-AI league matches, and turning a human's interactive battle into a MatchResult.
import type { BattleSet, Coach, CoachId, MatchResult, SpeciesId } from '../types';
import { HeuristicPlayer } from './heuristicPlayer';
import { chooseLineup } from './lineup';
import { runBattle, type BattleOutcome } from './runner';
import { Rng } from './rng';
import { buildSetFor } from './sets';

/** The battle team for a lineup of ROSTER ids: `sets[id]` (a Mega id's set lists the base species holding the stone). */
function teamFor(coach: Coach, lineup: SpeciesId[], seed: number): BattleSet[] {
  return lineup.map(id => {
    const set = coach.sets[id];
    if (set) return set;
    const entry = coach.roster.find(r => r.species === id);
    return buildSetFor(id, { seed, isTeraCaptain: !!entry?.isTeraCaptain, isZCaptain: !!entry?.isZCaptain });
  });
}

function captainsIn(coach: Coach, lineup: SpeciesId[]): SpeciesId[] {
  return coach.roster.filter(r => r.isTeraCaptain && lineup.includes(r.species)).map(r => r.species);
}

/** A tie (turn cap) goes to the side with more mons left, then to a seeded coin flip. */
function decide(outcome: BattleOutcome, rng: Rng): 'p1' | 'p2' {
  if (outcome.winner !== 'tie') return outcome.winner;
  if (outcome.remaining.p1 !== outcome.remaining.p2) return outcome.remaining.p1 > outcome.remaining.p2 ? 'p1' : 'p2';
  return rng.next() < 0.5 ? 'p1' : 'p2';
}

function toResult(outcome: BattleOutcome, p1: CoachId, p2: CoachId, lineups: { p1: SpeciesId[]; p2: SpeciesId[] }, rng: Rng): MatchResult {
  const w = decide(outcome, rng);
  return {
    winner: w === 'p1' ? p1 : p2,
    loser: w === 'p1' ? p2 : p1,
    log: outcome.log,
    turns: outcome.turns,
    remaining: { [p1]: outcome.remaining.p1, [p2]: outcome.remaining.p2 },
    lineups: { [p1]: lineups.p1, [p2]: lineups.p2 },
  };
}

/** Simulate a full match between two AI coaches. Home plays p1. Deterministic per seed. */
export async function simulateMatch(home: Coach, away: Coach, seed: number): Promise<MatchResult> {
  const rng = new Rng(seed);
  const homeLineup = chooseLineup(home.roster, home.sets, away.roster, seed);
  const awayLineup = chooseLineup(away.roster, away.sets, home.roster, seed + 1);
  const battleSeed = rng.seed4();
  const outcome = await runBattle({
    p1: { name: home.name, team: teamFor(home, homeLineup, seed), player: new HeuristicPlayer(rng.int(2 ** 31)), teraCaptains: captainsIn(home, homeLineup) },
    p2: { name: away.name, team: teamFor(away, awayLineup, seed), player: new HeuristicPlayer(rng.int(2 ** 31)), teraCaptains: captainsIn(away, awayLineup) },
    seed: battleSeed,
  });
  return toResult(outcome, home.id, away.id, { p1: homeLineup, p2: awayLineup }, rng);
}

/**
 * MatchResult for a battle the human played through createInteractiveBattle (human = p1).
 * `lineups` are the ROSTER ids each side brought (Mega ids, not their base species), keyed by coach id. A turn-cap tie with equal mons left is a seeded coin flip.
 */
export function humanMatchResult(
  outcome: BattleOutcome,
  humanCoach: Coach,
  oppCoach: Coach,
  lineups: Record<CoachId, SpeciesId[]>,
  seed = 0,
): MatchResult {
  return toResult(outcome, humanCoach.id, oppCoach.id, {
    p1: lineups[humanCoach.id] ?? [],
    p2: lineups[oppCoach.id] ?? [],
  }, new Rng(seed));
}
