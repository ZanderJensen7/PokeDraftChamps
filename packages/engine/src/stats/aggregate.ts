// Summing per-match mon lines into per-species aggregates, within and across leagues. Pure, browser-safe.
import type { Coach, CoachId, Match, RunState, SpeciesAggregate, SpeciesId, SpeciesMatchStats } from '../types';
import { getDraftMon } from '../draft/pool';
import { matchSpeciesStats } from './matchStats';
import { performanceScore } from './score';

/** Running sums for one species. Every SpeciesAggregate field derives from these. */
interface Acc {
  species: SpeciesId;
  games: number;
  leads: number;
  wins: number;
  kos: number;
  faints: number;
  damage: number;
  taken: number;
  tera: number;
  mega: number;
  z: number;
  coaches: Set<CoachId>;
}

const newAcc = (species: SpeciesId): Acc => ({
  species, games: 0, leads: 0, wins: 0, kos: 0, faints: 0, damage: 0, taken: 0, tera: 0, mega: 0, z: 0, coaches: new Set(),
});

function finish(a: Acc): SpeciesAggregate {
  const mon = getDraftMon(a.species);
  const per = (n: number): number => (a.games > 0 ? n / a.games : 0);
  const agg: SpeciesAggregate = {
    species: a.species,
    name: mon?.name ?? a.species,
    price: mon?.points ?? 0,
    games: a.games,
    leads: a.leads,
    wins: a.wins,
    winRate: per(a.wins),
    kos: a.kos,
    faints: a.faints,
    koPerGame: per(a.kos),
    survivalRate: a.games > 0 ? (a.games - a.faints) / a.games : 0,
    damagePerGame: per(a.damage),
    damageTakenPerGame: per(a.taken),
    teraRate: per(a.tera),
    megaRate: per(a.mega),
    zRate: per(a.z),
    score: 0,
    coaches: [...a.coaches].sort(),
  };
  agg.score = performanceScore(agg);
  return agg;
}

const byScore = (a: SpeciesAggregate, b: SpeciesAggregate): number =>
  b.score - a.score || b.games - a.games || a.species.localeCompare(b.species);

/** Sums mon lines into aggregates (one per species, every coach that owned it). Sorted by score, best first. */
export function aggregateLines(lines: readonly SpeciesMatchStats[]): SpeciesAggregate[] {
  const accs = new Map<SpeciesId, Acc>();
  for (const l of lines) {
    let a = accs.get(l.species);
    if (!a) { a = newAcc(l.species); accs.set(l.species, a); }
    a.coaches.add(l.coach);
    if (!l.brought) continue;
    a.games++;
    if (l.led) a.leads++;
    if (l.won) a.wins++;
    a.kos += l.kos;
    if (l.fainted) a.faints++;
    a.damage += l.damageDealtPct;
    a.taken += l.damageTakenPct;
    if (l.teraUsed) a.tera++;
    if (l.megaEvolved) a.mega++;
    if (l.zUsed) a.z++;
  }
  return [...accs.values()].map(finish).sort(byScore);
}

/** Per-species performance over every played match (unplayed ones are skipped). Species never brought have games 0. */
export function aggregateSpeciesStats(matches: Match[], coaches: Coach[]): SpeciesAggregate[] {
  const lines: SpeciesMatchStats[] = [];
  for (const m of matches) if (m.result) lines.push(...matchSpeciesStats(m.result, m, coaches));
  return aggregateLines(lines);
}

/** The whole run's per-species performance (both its regular season and playoffs so far). */
export function runSpeciesStats(run: RunState): SpeciesAggregate[] {
  return aggregateSpeciesStats(run.matches, run.coaches);
}

/**
 * Merges aggregates from several leagues. Counts add; the rate-based sums are recovered from rate x games
 * (whole counts are rounded back, so they merge exactly), then every rate and the score are recomputed.
 * Coach ids are unioned as-is (they repeat across leagues: 'c3' in league A is not 'c3' in league B).
 */
export function mergeAggregates(list: SpeciesAggregate[][]): SpeciesAggregate[] {
  const accs = new Map<SpeciesId, Acc>();
  for (const aggs of list) {
    for (const g of aggs) {
      let a = accs.get(g.species);
      if (!a) { a = newAcc(g.species); accs.set(g.species, a); }
      a.games += g.games;
      a.leads += g.leads;
      a.wins += g.wins;
      a.kos += g.kos;
      a.faints += g.faints;
      a.damage += g.damagePerGame * g.games;
      a.taken += g.damageTakenPerGame * g.games;
      a.tera += Math.round(g.teraRate * g.games);
      a.mega += Math.round(g.megaRate * g.games);
      a.z += Math.round(g.zRate * g.games);
      for (const c of g.coaches) a.coaches.add(c);
    }
  }
  return [...accs.values()].map(finish).sort(byScore);
}

/** The `n` best-scoring species (optionally only one coach's), most games first on ties. */
export function topPerformers(aggs: readonly SpeciesAggregate[], n: number, coach?: CoachId): SpeciesAggregate[] {
  return aggs
    .filter((a) => a.games > 0 && (coach === undefined || a.coaches.includes(coach)))
    .slice()
    .sort(byScore)
    .slice(0, Math.max(0, n));
}
