// The composite 0-100 performance score. Pure, browser-safe.
import type { SpeciesAggregate } from '../types';

/** Games of "perfectly average" play blended into every mon's record (Bayesian average). */
export const SCORE_PRIOR_GAMES = 10;

/**
 * What an average brought mon does in a game, and how far a strong one strays (one standard deviation across
 * species with 15+ games). Measured with the balance lab (`npm run balance`, 12-team AI leagues, Megas on);
 * re-measure after big battle-AI changes. Average KOs per game equal average faints per game (every faint is
 * credited to someone), so the survival baseline is 1 - koPerGame.
 */
export const SCORE_BASELINE = {
  winRate: 0.5,
  koPerGame: 0.79,
  damagePerGame: 83,
  spread: { winRate: 0.11, koPerGame: 0.3, damagePerGame: 33, survivalRate: 0.105 },
} as const;

/** Component weights (sum 1). Winning matters most; the rest says how it won. */
export const SCORE_WEIGHTS = { winRate: 0.4, koPerGame: 0.25, damagePerGame: 0.2, survivalRate: 0.15 } as const;

/** Score points per standard deviation of the weighted blend. */
const POINTS_PER_SD = 12.5;
const Z_CAP = 4;

const shrink = (sum: number, games: number, base: number): number =>
  (sum + base * SCORE_PRIOR_GAMES) / (games + SCORE_PRIOR_GAMES);

const z = (value: number, base: number, sd: number): number => Math.max(-Z_CAP, Math.min(Z_CAP, (value - base) / sd));

/**
 * 0-100, 50 = average. Each of win rate when brought, KOs per game, damage per game and survival rate is first
 * shrunk toward the league baseline with SCORE_PRIOR_GAMES phantom average games, then turned into standard
 * deviations from that baseline (capped at +-4), blended with SCORE_WEIGHTS, and mapped to 50 + 12.5 per SD.
 * A mon with no games, or with exactly average numbers, scores 50.
 */
export function performanceScore(agg: Pick<SpeciesAggregate, 'games' | 'wins' | 'kos' | 'faints' | 'damagePerGame'>): number {
  const b = SCORE_BASELINE;
  const g = Math.max(0, agg.games);
  const survivalBase = 1 - b.koPerGame;
  const win = shrink(agg.wins, g, b.winRate);
  const ko = shrink(agg.kos, g, b.koPerGame);
  const dmg = shrink(agg.damagePerGame * g, g, b.damagePerGame);
  const surv = shrink(g - agg.faints, g, survivalBase);
  const blend =
    SCORE_WEIGHTS.winRate * z(win, b.winRate, b.spread.winRate) +
    SCORE_WEIGHTS.koPerGame * z(ko, b.koPerGame, b.spread.koPerGame) +
    SCORE_WEIGHTS.damagePerGame * z(dmg, b.damagePerGame, b.spread.damagePerGame) +
    SCORE_WEIGHTS.survivalRate * z(surv, survivalBase, b.spread.survivalRate);
  return Math.max(0, Math.min(100, 50 + POINTS_PER_SD * blend));
}
