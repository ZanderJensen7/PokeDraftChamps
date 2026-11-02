// Single-elimination playoffs: seeding, advancement, champion check.
import type { CoachId, Match, StandingRow } from '../types';

function isPowerOfTwo(n: number): boolean {
  return n >= 2 && (n & (n - 1)) === 0;
}

/** Number of playoff rounds for a bracket of `playoffTeams` (2 -> 1, 4 -> 2, 8 -> 3, 16 -> 4). */
export function playoffRoundCount(playoffTeams: number): number {
  return Math.round(Math.log2(playoffTeams));
}

/** Display name of a playoff round given the bracket size. */
export function playoffRoundName(round: number, playoffTeams: number): string {
  const left = playoffRoundCount(playoffTeams) - round;
  if (left === 0) return 'Final';
  if (left === 1) return 'Semifinal';
  if (left === 2) return 'Quarterfinal';
  return `Round of ${2 ** (left + 1)}`;
}

/** Seed order in bracket position so seed 1 and 2 can only meet in the final. 8 -> [1,8,4,5,3,6,2,7]. */
export function bracketSeedOrder(size: number): number[] {
  if (!isPowerOfTwo(size)) throw new Error(`playoff size must be a power of two, got ${size}`);
  let order = [1, 2];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s, i) => (i % 2 === 0 ? [s, n + 1 - s] : [n + 1 - s, s]));
  }
  // Pairs come out as (1,8),(5,4),(3,6),(7,2): put the better seed first in each pair.
  const out: number[] = [];
  for (let i = 0; i < order.length; i += 2) {
    const a = order[i]!;
    const b = order[i + 1]!;
    out.push(Math.min(a, b), Math.max(a, b));
  }
  return out;
}

/**
 * First playoff round from final standings: 1vN, N/2vN/2+1, ... in bracket order (8: 1v8, 4v5, 3v6, 2v7),
 * so adjacent winners meet next round. Better seed is home. `week` = the week these games are played.
 */
export function seedPlayoffs(standings: readonly StandingRow[], playoffTeams: number, week = 1): Match[] {
  if (playoffTeams > standings.length) throw new Error(`playoffTeams ${playoffTeams} > ${standings.length} coaches`);
  const ranked = [...standings].sort((a, b) => a.rank - b.rank);
  const order = bracketSeedOrder(playoffTeams);
  const matches: Match[] = [];
  for (let i = 0; i < order.length; i += 2) {
    const home = ranked[order[i]! - 1]!.coach;
    const away = ranked[order[i + 1]! - 1]!.coach;
    matches.push({ id: `w${week}m${i / 2 + 1}`, week, home, away, playoffRound: 1 });
  }
  return matches;
}

/**
 * Next round from the winners of `round` (all its matches need results). Winners of bracket-adjacent
 * matches meet; the winner from the earlier bracket slot is home. Returns [] after the final.
 */
export function advancePlayoffs(matches: readonly Match[], round: number): Match[] {
  const cur = matches.filter((m) => m.playoffRound === round);
  if (cur.length === 0) throw new Error(`no playoff matches in round ${round}`);
  if (cur.some((m) => !m.result)) throw new Error(`playoff round ${round} is not finished`);
  if (cur.length === 1) return [];
  const week = Math.max(...cur.map((m) => m.week)) + 1;
  const next: Match[] = [];
  for (let i = 0; i < cur.length; i += 2) {
    next.push({
      id: `w${week}m${i / 2 + 1}`, week,
      home: cur[i]!.result!.winner, away: cur[i + 1]!.result!.winner, playoffRound: round + 1,
    });
  }
  return next;
}

/** The final (the latest playoff round, when it holds a single match), if seeded. */
export function finalMatch(matches: readonly Match[]): Match | undefined {
  const rounds = matches.filter((m) => m.playoffRound !== undefined);
  if (rounds.length === 0) return undefined;
  const last = Math.max(...rounds.map((m) => m.playoffRound!));
  const inLast = rounds.filter((m) => m.playoffRound === last);
  return inLast.length === 1 ? inLast[0] : undefined;
}

/** True when the final has been played and `coach` won it. */
export function isChampion(matches: readonly Match[], coach: CoachId): boolean {
  return finalMatch(matches)?.result?.winner === coach;
}
