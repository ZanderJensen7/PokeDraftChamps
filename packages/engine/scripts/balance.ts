// Balance lab: simulate AI-only leagues headless, mine every stored battle log for per-species performance,
// and suggest price changes. Node-only (writes files).
//
//   npm run balance -- --leagues 20 --teams 12 --megas --seed 7 --out docs/balance
//
// Options: --leagues N (10) --teams 8|12|16 (12) --weeks N (9) --megas --z N (Z captains, 0) --seed N (7)
//          --out DIR (docs/balance, relative to where npm was run) --min-games N (15) --max-delta N (3)
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  aiChoosePick, coachById, createRng, createRun, deriveSeed, draftPick, finishDraft, fitScoreByPrice,
  mergeAggregates, nextHumanMatch, priceSuggestions, resolveWeek, runAiDraftUntilHuman, runPool, runSpeciesStats,
  DEFAULT_LEAGUE_CONFIG, SCORE_BASELINE, type LeagueConfig, type PriceFit, type PriceSuggestion, type RunState, type SpeciesAggregate,
} from '../src';
import { engineDeps } from '../src/battle';

interface Opts {
  leagues: number; teams: 8 | 12 | 16; weeks: number; megas: boolean; z: number; seed: number;
  out: string; minGames: number; maxDelta: number;
}

function parseArgs(argv: string[]): Opts {
  const o: Opts = { leagues: 10, teams: 12, weeks: 9, megas: false, z: 0, seed: 7, out: 'docs/balance', minGames: 15, maxDelta: 3 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const num = (): number => {
      const v = Number(argv[++i]);
      if (!Number.isFinite(v)) throw new Error(`${a} needs a number`);
      return v;
    };
    switch (a) {
      case '--leagues': o.leagues = Math.max(1, Math.floor(num())); break;
      case '--teams': {
        const t = num();
        if (t !== 8 && t !== 12 && t !== 16) throw new Error('--teams must be 8, 12 or 16');
        o.teams = t;
        break;
      }
      case '--weeks': o.weeks = Math.floor(num()); break;
      case '--megas': o.megas = true; break;
      case '--z': o.z = Math.floor(num()); break;
      case '--seed': o.seed = Math.floor(num()); break;
      case '--out': o.out = argv[++i] ?? o.out; break;
      case '--min-games': o.minGames = Math.floor(num()); break;
      case '--max-delta': o.maxDelta = Math.floor(num()); break;
      default: if (a) throw new Error(`unknown option ${a}`);
    }
  }
  return o;
}

/** One league with the human slot played by the AI too: AI draft pick, AI-vs-AI human match each week. */
async function playLeague(config: LeagueConfig, seed: number): Promise<RunState> {
  let run = createRun({ config, seed, humanName: 'Lab Coach', humanAbbrev: 'LAB', createdAt: 0 });
  for (;;) {
    run = runAiDraftUntilHuman(run);
    if (run.draft.complete) break;
    const rng = createRng(deriveSeed(seed, 'labPick', run.draft.pickIndex));
    run = draftPick(run, aiChoosePick(run.draft, run.humanId, run.config, runPool(run), rng));
  }
  run = finishDraft(run, engineDeps);
  while (run.phase === 'season' || run.phase === 'playoffs') {
    const m = nextHumanMatch(run);
    if (!m) break;
    const result = await engineDeps.simulateMatch(coachById(run, m.home), coachById(run, m.away), deriveSeed(run.seed, 'week', run.week, m.id));
    run = await resolveWeek(run, result, engineDeps);
  }
  return run;
}

const f1 = (x: number): string => x.toFixed(1);
const pctS = (x: number): string => `${Math.round(x * 100)}%`;

interface Residual { agg: SpeciesAggregate; expected: number; gap: number; suggestion?: PriceSuggestion }

function residuals(aggs: SpeciesAggregate[], fit: PriceFit | undefined, minGames: number, sugg: PriceSuggestion[]): Residual[] {
  if (!fit) return [];
  const bySp = new Map(sugg.map((s) => [s.species, s]));
  return aggs
    .filter((a) => a.games >= minGames)
    .map((a) => {
      const expected = fit.intercept + fit.slope * a.price;
      return { agg: a, expected, gap: a.score - expected, suggestion: bySp.get(a.species) };
    });
}

/** Game-weighted league baseline and per-species spreads, to re-calibrate SCORE_BASELINE. */
function measuredBaseline(aggs: SpeciesAggregate[], minGames: number) {
  const games = aggs.reduce((s, a) => s + a.games, 0) || 1;
  const ko = aggs.reduce((s, a) => s + a.kos, 0) / games;
  const dmg = aggs.reduce((s, a) => s + a.damagePerGame * a.games, 0) / games;
  const win = aggs.reduce((s, a) => s + a.wins, 0) / games;
  const surv = aggs.reduce((s, a) => s + a.games - a.faints, 0) / games;
  const el = aggs.filter((a) => a.games >= minGames);
  const sd = (f: (a: SpeciesAggregate) => number): number => {
    if (el.length < 2) return 0;
    const m = el.reduce((s, a) => s + f(a), 0) / el.length;
    return Math.sqrt(el.reduce((s, a) => s + (f(a) - m) ** 2, 0) / (el.length - 1));
  };
  return {
    winRate: win, koPerGame: ko, damagePerGame: dmg, survivalRate: surv,
    spread: { winRate: sd((a) => a.winRate), koPerGame: sd((a) => a.koPerGame), damagePerGame: sd((a) => a.damagePerGame), survivalRate: sd((a) => a.survivalRate) },
  };
}

function residualTable(rows: Residual[]): string {
  const head = '| # | Species | Price | Games | Win% | KO/g | Dmg/g | Surv | Score | Expected | Suggest |\n|---|---|---|---|---|---|---|---|---|---|---|';
  const body = rows.map((r, i) => {
    const a = r.agg;
    const s = r.suggestion ? `${r.suggestion.suggested} (${r.suggestion.delta > 0 ? '+' : ''}${r.suggestion.delta})` : '-';
    return `| ${i + 1} | ${a.name} | ${a.price} | ${a.games} | ${pctS(a.winRate)} | ${a.koPerGame.toFixed(2)} | ${f1(a.damagePerGame)} | ${pctS(a.survivalRate)} | ${f1(a.score)} | ${f1(r.expected)} | ${s} |`;
  });
  return [head, ...body].join('\n');
}

function report(o: Opts, aggs: SpeciesAggregate[], sugg: PriceSuggestion[], fit: PriceFit | undefined, matches: number, seconds: number, date: string): string {
  const res = residuals(aggs, fit, o.minGames, sugg);
  const over = [...res].sort((a, b) => b.gap - a.gap).slice(0, 15);
  const under = [...res].sort((a, b) => a.gap - b.gap).slice(0, 15);
  const brought = aggs.reduce((s, a) => s + a.games, 0);
  const prices = [...new Set(res.map((r) => r.agg.price))].sort((a, b) => a - b);
  const tier = prices.map((p) => {
    const rows = res.filter((r) => r.agg.price === p);
    const mean = (f: (r: Residual) => number): number => rows.reduce((s, r) => s + f(r), 0) / rows.length;
    const games = rows.reduce((s, r) => s + r.agg.games, 0);
    const exp = fit ? fit.intercept + fit.slope * p : 0;
    return `| ${p} | ${rows.length} | ${games} | ${f1(mean((r) => r.agg.score))} | ${f1(exp)} | ${pctS(mean((r) => r.agg.winRate))} | ${mean((r) => r.agg.koPerGame).toFixed(2)} |`;
  });
  const base = measuredBaseline(aggs, o.minGames);
  const lines = [
    `# Balance lab report`,
    ``,
    `${date} - ${o.leagues} AI-only leagues of ${o.teams} teams, ${o.weeks} weeks, Megas ${o.megas ? 'on' : 'off'}, Z captains ${o.z}, seed ${o.seed} (${f1(seconds)} s).`,
    ``,
    `## Sample`,
    ``,
    `- Matches played: ${matches}`,
    `- Species drafted: ${aggs.length}; brought at least once: ${aggs.filter((a) => a.games > 0).length}; with ${o.minGames}+ games: ${res.length}`,
    `- Mon-games: ${brought}`,
    fit ? `- Fit: score = ${f1(fit.intercept)} + ${fit.slope.toFixed(2)} x price (${fit.n} species)` : `- Fit: not enough data`,
    `- Measured baseline: win ${pctS(base.winRate)}, ${base.koPerGame.toFixed(2)} KO/game, ${f1(base.damagePerGame)} damage/game, ${pctS(base.survivalRate)} survival (score uses ${SCORE_BASELINE.koPerGame} KO/game, ${SCORE_BASELINE.damagePerGame} damage/game)`,
    `- Measured per-species spread (SD): win ${base.spread.winRate.toFixed(3)}, KO/g ${base.spread.koPerGame.toFixed(2)}, dmg/g ${f1(base.spread.damagePerGame)}, survival ${base.spread.survivalRate.toFixed(3)}`,
    ``,
    `## Top ${over.length} over-performers (score above the price line)`,
    ``,
    residualTable(over),
    ``,
    `## Top ${under.length} under-performers (score below the price line)`,
    ``,
    residualTable(under),
    ``,
    `## Mean score per price`,
    ``,
    `| Price | Species | Games | Mean score | Fit | Mean win% | Mean KO/g |`,
    `|---|---|---|---|---|---|---|`,
    ...tier,
    ``,
    `## All suggestions (${sugg.length})`,
    ``,
    `| Species | Price | Suggested | Delta | Games | Score | Reason |`,
    `|---|---|---|---|---|---|---|`,
    ...sugg.map((s) => `| ${s.name} | ${s.price} | ${s.suggested} | ${s.delta > 0 ? '+' : ''}${s.delta} | ${s.games} | ${f1(s.score)} | ${s.reason} |`),
    ``,
  ];
  return lines.join('\n');
}

async function main(): Promise<void> {
  const o = parseArgs(process.argv.slice(2));
  const config: LeagueConfig = {
    ...DEFAULT_LEAGUE_CONFIG,
    teams: o.teams,
    weeks: o.weeks,
    playoffTeams: o.teams === 8 ? 4 : 8,
    megas: o.megas,
    zCaptains: o.z,
    lossCap: o.weeks, // the lab coach is never knocked out early, so every regular-season week is played
  };
  const t0 = performance.now();
  const perLeague: SpeciesAggregate[][] = [];
  let matches = 0;
  for (let i = 0; i < o.leagues; i++) {
    const t = performance.now();
    const run = await playLeague(config, deriveSeed(o.seed, 'league', i));
    const played = run.matches.filter((m) => m.result).length;
    matches += played;
    perLeague.push(runSpeciesStats(run));
    console.log(`league ${i + 1}/${o.leagues}: ${played} matches, ${run.phase}, ${f1((performance.now() - t) / 1000)} s`);
  }
  const seconds = (performance.now() - t0) / 1000;
  const aggs = mergeAggregates(perLeague);
  const sugg = priceSuggestions(aggs, { minGames: o.minGames, maxDelta: o.maxDelta });
  const fit = fitScoreByPrice(aggs, o.minGames);
  const date = new Date().toISOString();

  const outDir = resolve(process.env.INIT_CWD ?? process.cwd(), o.out);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'latest.json'), JSON.stringify({
    date, config: { ...o, league: config }, sample: { matches, seconds }, fit,
    baseline: measuredBaseline(aggs, o.minGames), aggregates: aggs, suggestions: sugg,
  }, null, 1));
  writeFileSync(resolve(outDir, 'latest.md'), report(o, aggs, sugg, fit, matches, seconds, date));

  const raise = sugg.filter((s) => s.delta > 0);
  const cut = sugg.filter((s) => s.delta < 0);
  console.log('');
  console.log(`${o.leagues} leagues, ${matches} matches in ${f1(seconds)} s; ${aggs.filter((a) => a.games >= o.minGames).length} species with ${o.minGames}+ games.`);
  if (fit) console.log(`Score by price: ${f1(fit.intercept)} + ${fit.slope.toFixed(2)} x price.`);
  console.log(`${raise.length} price raises, ${cut.length} cuts suggested.`);
  console.log(`Most under-priced: ${raise.slice(0, 5).map((s) => `${s.name} ${s.price}->${s.suggested}`).join(', ') || 'none'}`);
  console.log(`Most over-priced: ${[...cut].sort((a, b) => a.delta - b.delta).slice(0, 5).map((s) => `${s.name} ${s.price}->${s.suggested}`).join(', ') || 'none'}`);
  console.log(`Report: ${resolve(outDir, 'latest.md')}`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
