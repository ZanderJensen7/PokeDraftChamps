// THE battle seam. Everything the app needs from a battle engine goes through this interface.
// main.tsx installs the real sim bridge (game/realBridge.ts); the placeholder stays as the fallback/test stand-in.
import type {
  BuildSets, Coach, CoachId, MatchResult, RunState, ScoutReport, SimulateMatch, SpeciesId,
} from '@pdc/engine';
import { createRng, deriveSeed, getDraftMon, nextHumanMatch, opponentOf } from '@pdc/engine';
import type { LiveBattle } from '../battle/session';

export interface PlayHumanMatchArgs {
  run: RunState;
  /** Exactly 6, team-preview order. */
  humanLineup: SpeciesId[];
  /** The opponent's 6 if the caller already chose them (the real bridge picks them itself otherwise). */
  oppLineup?: SpeciesId[];
  /** Set by the real bridge once the live battle exists; BattleScreen drives it. */
  live?: LiveBattle;
}

export interface BattleBridge {
  /**
   * The season-set builder. Async because it lives in `@pdc/engine/battle` (the sim + randoms), which loads on
   * first use so the app's first load stays small; later calls resolve at once.
   */
  loadBuildSets(): Promise<BuildSets>;
  simulateMatch: SimulateMatch;
  /** Plays the human's match for this week. The BattleScreen is mounted while this promise is pending. */
  playHumanMatch(args: PlayHumanMatchArgs): Promise<MatchResult>;
  /** Optional: what this coach's stored logs reveal (prep doc Scouting tab). */
  scout?(run: RunState, coach: CoachId): ScoutReport | undefined;
  /** True for the stand-in; the UI labels results as placeholder. */
  readonly isPlaceholder?: boolean;
}

function rosterPoints(c: Coach): number {
  return c.roster.reduce((s, r) => s + (getDraftMon(r.species)?.points ?? 0), 0);
}

function coinResult(
  a: Coach, b: Coach, seed: number, lineups: Record<CoachId, SpeciesId[]>,
): MatchResult {
  const rng = createRng(seed);
  const pa = rosterPoints(a);
  const pb = rosterPoints(b);
  const pA = pa + pb > 0 ? pa / (pa + pb) : 0.5;
  const aWins = rng.next() < pA;
  const winner = aWins ? a : b;
  const loser = aWins ? b : a;
  return {
    winner: winner.id,
    loser: loser.id,
    log: [],
    turns: 20 + rng.int(41),
    remaining: { [winner.id]: 1 + rng.int(6), [loser.id]: 0 },
    lineups,
  };
}

const firstSix = (c: Coach): SpeciesId[] => c.roster.slice(0, 6).map((r) => r.species);

export const PLACEHOLDER_DELAY_MS = 1000;

export const placeholderBridge: BattleBridge = {
  isPlaceholder: true,
  // Real season sets from the engine (pure, fast); matches stay placeholder coin flips.
  loadBuildSets: async () => (await import('@pdc/engine/battle')).buildSets,
  simulateMatch: (home, away, seed) =>
    coinResult(home, away, seed, { [home.id]: firstSix(home), [away.id]: firstSix(away) }),
  async playHumanMatch({ run, humanLineup, oppLineup }) {
    const match = nextHumanMatch(run);
    if (!match) throw new Error('no match to play this week');
    const human = run.coaches.find((c) => c.id === run.humanId)!;
    const opp = opponentOf(run, match);
    await new Promise((r) => setTimeout(r, PLACEHOLDER_DELAY_MS));
    return coinResult(human, opp, deriveSeed(run.seed, 'human', run.week, match.id), {
      [human.id]: humanLineup,
      [opp.id]: oppLineup ?? firstSix(opp),
    });
  },
};

let current: BattleBridge = placeholderBridge;

export function getBridge(): BattleBridge {
  return current;
}

export function setBridge(b: BattleBridge): void {
  current = b;
}
