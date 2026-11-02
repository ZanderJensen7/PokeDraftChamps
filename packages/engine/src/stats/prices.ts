// Price suggestions: which species play above or below their draft price. Pure, browser-safe.
import type { PriceSuggestion, SpeciesAggregate } from '../types';
import { MAX_POINTS } from '../data/points';

export interface PriceSuggestionOptions {
  /** Species with fewer games are left out of the fit and get no suggestion. Default 15. */
  minGames?: number;
  /** Largest change suggested, in points. Default 3. */
  maxDelta?: number;
}

/**
 * Fewest score points one price point may stand for, so a flat fit cannot blow small gaps up into big moves.
 * AI play tracks price weakly (lab fit ~0.7 score/point, residual SD ~6), so 2.5 keeps +-3 for ~1 SD outliers.
 */
export const MIN_SCORE_PER_POINT = 2.5;

export interface PriceFit {
  /** Expected score at price 0. */
  intercept: number;
  /** Expected score gained per price point (ordinary least squares). */
  slope: number;
  /** Species the fit used. */
  n: number;
}

/** Least-squares line of score on price over the species with at least `minGames` games. Undefined with < 3 or one price. */
export function fitScoreByPrice(aggs: readonly SpeciesAggregate[], minGames = 15): PriceFit | undefined {
  const pts = aggs.filter((a) => a.games >= minGames);
  if (pts.length < 3) return undefined;
  const mx = pts.reduce((s, a) => s + a.price, 0) / pts.length;
  const my = pts.reduce((s, a) => s + a.score, 0) / pts.length;
  let sxx = 0;
  let sxy = 0;
  for (const a of pts) {
    sxx += (a.price - mx) ** 2;
    sxy += (a.price - mx) * (a.score - my);
  }
  if (sxx === 0) return undefined;
  const slope = sxy / sxx;
  return { intercept: my - slope * mx, slope, n: pts.length };
}

const clampPrice = (p: number): number => Math.max(1, Math.min(MAX_POINTS, p));
const pct = (x: number): string => `${Math.round(x * 100)}%`;

/**
 * For each species with at least `minGames` games: the price its score "plays like" on the fitted
 * score-by-price line. Step = max(slope, MIN_SCORE_PER_POINT) score points per price point; delta =
 * round((score - expected(price)) / step), clamped to +-maxDelta and to a price of 1..20; only |delta| >= 1 is
 * returned. Sorted by delta (largest raise first), then by how far the score is from the line.
 */
export function priceSuggestions(aggs: readonly SpeciesAggregate[], opts: PriceSuggestionOptions = {}): PriceSuggestion[] {
  const minGames = opts.minGames ?? 15;
  const maxDelta = Math.max(0, opts.maxDelta ?? 3);
  const fit = fitScoreByPrice(aggs, minGames);
  if (!fit) return [];
  const step = Math.max(fit.slope, MIN_SCORE_PER_POINT);
  const out: (PriceSuggestion & { gap: number })[] = [];
  for (const a of aggs) {
    if (a.games < minGames) continue;
    const gap = a.score - (fit.intercept + fit.slope * a.price);
    const raw = Math.round(gap / step);
    const suggested = clampPrice(a.price + Math.max(-maxDelta, Math.min(maxDelta, raw)));
    const delta = suggested - a.price;
    if (Math.abs(delta) < 1) continue;
    const playsLike = clampPrice(a.price + raw);
    const reason = `Won ${pct(a.winRate)} when brought and ${a.koPerGame.toFixed(1)} KOs/game at ${a.price} pts; plays like a ${playsLike}.`;
    out.push({ species: a.species, name: a.name, price: a.price, suggested, delta, games: a.games, score: a.score, reason, gap });
  }
  out.sort((x, y) => y.delta - x.delta || Math.abs(y.gap) - Math.abs(x.gap) || x.species.localeCompare(y.species));
  return out.map(({ gap: _gap, ...s }) => s);
}
