// Price overrides from the balance lab: reads docs/balance/latest.json and rewrites the generated blocks of
// src/data/points.ts (PRICE_OVERRIDES) and src/data/labScores.ts (LAB_FIT, LAB_SCORES). Node-only.
//
//   npm run balance -w @pdc/engine -- --leagues 40 --teams 12 --megas --seed 11
//   npm run prices -w @pdc/engine            (--dry prints the moves without writing)
//
// The rule (PRICE_RULE): a species moves only with minGames+ lab games. Its "plays like" price is its price plus its gap
// to the lab's score-by-price line over max(slope, MIN_SCORE_PER_POINT); that is shrunk toward the tier price by
// games / (games + shrinkGames), rounded, kept within maxStep of the current price and within 1..MAX_POINTS. A species
// that lands on its tier price loses its override; one with too few games keeps whatever it had.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Dex } from '@pkmn/dex';
import { fitScoreByPrice, getDraftMon, MIN_SCORE_PER_POINT, type SpeciesAggregate } from '../src';
import { MAX_POINTS, PRICE_OVERRIDES, tierPriceOf } from '../src/data/points';

const PRICE_RULE = {
  /** Lab games a species needs before its price moves (and before LAB_SCORES lists it). */
  minGames: 60,
  /** Games at which the lab's verdict and the tier price weigh the same. */
  shrinkGames: 60,
  /** Largest move per run, in points. */
  maxStep: 2,
  /** Species the score-by-price fit uses (the lab report's own threshold). */
  fitMinGames: 15,
} as const;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dry = process.argv.includes('--dry');

interface Lab { date: string; config: { leagues: number; teams: number; seed: number; megas: boolean }; aggregates: SpeciesAggregate[] }
const lab = JSON.parse(readFileSync(resolve(root, '../../docs/balance/latest.json'), 'utf8')) as Lab;
const fit = fitScoreByPrice(lab.aggregates, PRICE_RULE.fitMinGames);
if (!fit) throw new Error('latest.json has too little data for a fit');
const step = Math.max(fit.slope, MIN_SCORE_PER_POINT);
const dex = Dex.forGen(9);

const tierPrice = (id: string): number => {
  const s = dex.species.get(id);
  if (!s.exists) throw new Error(`unknown species ${id}`);
  return tierPriceOf({ tier: s.tier, natDexTier: s.natDexTier, bst: s.bst });
};
const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

interface Entry { id: string; name: string; price: number; games: number; score: number; note: string }
const next = new Map<string, Entry>();
// Overrides the lab cannot judge this run stay as they are.
for (const [id, price] of Object.entries(PRICE_OVERRIDES)) {
  const a = lab.aggregates.find((x) => x.species === id);
  if (!a || a.games < PRICE_RULE.minGames) next.set(id, { id, name: a?.name ?? id, price, games: a?.games ?? 0, score: a?.score ?? 0, note: 'kept' });
}
const moves: string[] = [];
for (const a of lab.aggregates) {
  const mon = getDraftMon(a.species);
  if (a.games < PRICE_RULE.minGames || !mon) continue; // banned since the lab ran: no price
  const tier = tierPrice(a.species);
  // The gap is measured at the price the lab played (a.price); the step limit is around today's price.
  const playsLike = a.price + (a.score - (fit.intercept + fit.slope * a.price)) / step;
  const w = a.games / (a.games + PRICE_RULE.shrinkGames);
  const target = Math.round(tier + w * (playsLike - tier));
  const price = clamp(clamp(target, mon.points - PRICE_RULE.maxStep, mon.points + PRICE_RULE.maxStep), 1, MAX_POINTS);
  if (price !== mon.points) moves.push(`${a.name}: ${mon.points} -> ${price} (tier ${tier}, ${a.games} games at ${a.price}, score ${a.score.toFixed(1)}, plays like ${playsLike.toFixed(1)})`);
  if (price !== tier) next.set(a.species, { id: a.species, name: a.name, price, games: a.games, score: a.score, note: `tier ${tier}` });
}

const day = lab.date.slice(0, 10);
const source = `balance lab ${day}: ${lab.config.leagues} leagues x ${lab.config.teams} teams, Megas ${lab.config.megas ? 'on' : 'off'}, seed ${lab.config.seed}`;
const overrides = [...next.values()].sort((x, y) => x.id.localeCompare(y.id));
const overrideBlock = [
  '// <prices:generated>',
  `// From the ${source}; fit ${fit.intercept.toFixed(1)} + ${fit.slope.toFixed(2)} x price.`,
  `// Rule: ${PRICE_RULE.minGames}+ games, shrunk toward the tier price at ${PRICE_RULE.shrinkGames} games, at most +-${PRICE_RULE.maxStep} per run.`,
  'export const PRICE_OVERRIDES: Readonly<Record<string, number>> = {',
  ...overrides.map((e) => `  ${e.id}: ${e.price}, // ${e.name}, ${e.note}, ${e.games} games${e.games ? `, score ${e.score.toFixed(1)}` : ''}`),
  '};',
  '// </prices:generated>',
].join('\n');

const scored = lab.aggregates.filter((a) => a.games >= PRICE_RULE.minGames && getDraftMon(a.species)).sort((x, y) => x.species.localeCompare(y.species));
const scoreBlock = [
  '// <labscores:generated>',
  `// From the ${source}: species with ${PRICE_RULE.minGames}+ games.`,
  `export const LAB_FIT = { intercept: ${fit.intercept.toFixed(2)}, slope: ${fit.slope.toFixed(3)} } as const;`,
  'export const LAB_SCORES: Readonly<Record<string, number>> = {',
  ...scored.map((a) => `  ${a.species}: ${a.score.toFixed(1)},`),
  '};',
  '// </labscores:generated>',
].join('\n');

function splice(file: string, tag: string, block: string): void {
  const text = readFileSync(file, 'utf8');
  const re = new RegExp(`// <${tag}:generated>[\\s\\S]*?// </${tag}:generated>`);
  if (!re.test(text)) throw new Error(`${file} has no ${tag} block`);
  writeFileSync(file, text.replace(re, block));
}

console.log(`${source}; step ${step.toFixed(2)} score/point.`);
console.log(moves.length ? moves.join('\n') : 'No price moves.');
console.log(`${overrides.length} overrides, ${scored.length} lab scores.`);
if (!dry) {
  splice(resolve(root, 'src/data/points.ts'), 'prices', overrideBlock);
  splice(resolve(root, 'src/data/labScores.ts'), 'labscores', scoreBlock);
  console.log('Wrote src/data/points.ts and src/data/labScores.ts.');
}
