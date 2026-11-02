import { describe, expect, it } from 'vitest';
import type { Coach, Match, MatchResult, RosterEntry, SpeciesAggregate, SpeciesMatchStats } from '../types';
import { buildSeasonSets, simulateMatch } from '../battle';
import {
  aggregateLines, matchSpeciesStats, mergeAggregates, performanceScore, priceSuggestions, SCORE_BASELINE, topPerformers,
} from './index';

const coach = (id: string, name: string, species: string[], withSets = false): Coach => {
  const roster: RosterEntry[] = species.map((s, i) => ({ species: s, isTeraCaptain: i === 0, isZCaptain: false }));
  return { id, name, abbrev: id.toUpperCase(), isHuman: false, roster, pointsSpent: 0, sets: withSets ? buildSeasonSets(roster, 11) : {} };
};

// Alpha (p1): Garchomp leads, Ferrothorn (Rocky Helmet) comes in; Toxapex stays home.
// Beta (p2): Great Tusk leads, then the Mega Charizard X entry (shows as Charizard until it Mega Evolves).
const MINI_LOG = [
  '|player|p1|Alpha||',
  '|player|p2|Beta||',
  '|poke|p1|Garchomp, M|',
  '|poke|p1|Ferrothorn, M|',
  '|poke|p2|Great Tusk|',
  '|poke|p2|Charizard, M|',
  '|switch|p1a: Garchomp|Garchomp, M|400/400',
  '|switch|p2a: Great Tusk|Great Tusk|400/400',
  '|turn|1',
  '|move|p1a: Garchomp|Earthquake|p2a: Great Tusk',
  '|-damage|p2a: Great Tusk|200/400',
  '|move|p2a: Great Tusk|Ice Spinner|p1a: Garchomp',
  '|-damage|p1a: Garchomp|100/400',
  '|turn|2',
  '|switch|p1a: Ferrothorn|Ferrothorn, M|300/300',
  '|move|p2a: Great Tusk|Close Combat|p1a: Ferrothorn',
  '|-damage|p1a: Ferrothorn|240/300',
  '|-damage|p2a: Great Tusk|100/400|[from] item: Rocky Helmet|[of] p1a: Ferrothorn',
  '|turn|3',
  '|move|p1a: Ferrothorn|Gyro Ball|p2a: Great Tusk',
  '|-damage|p2a: Great Tusk|0 fnt',
  '|faint|p2a: Great Tusk',
  '|switch|p2a: Charizard|Charizard, M|300/300',
  '|-damage|p2a: Charizard|150/300|[from] Stealth Rock',
  '|turn|4',
  '|detailschange|p2a: Charizard|Charizard-Mega-X, M',
  '|-mega|p2a: Charizard|Charizard|Charizardite X',
  '|-terastallize|p1a: Ferrothorn|Water',
  '|move|p2a: Charizard|Flare Blitz|p1a: Ferrothorn',
  '|-damage|p1a: Ferrothorn|0 fnt',
  '|faint|p1a: Ferrothorn',
  '|-damage|p2a: Charizard|90/300|[from] Recoil',
  '|switch|p1a: Garchomp|Garchomp, M|100/400',
  '|turn|5',
  '|move|p1a: Garchomp|Stone Edge|p2a: Charizard',
  '|-damage|p2a: Charizard|0 fnt',
  '|faint|p2a: Charizard',
  '|win|Alpha',
];

const alpha = coach('a', 'Alpha', ['garchomp', 'ferrothorn', 'toxapex']);
const beta = coach('b', 'Beta', ['greattusk', 'charizardmegax']);
const miniResult: MatchResult = {
  winner: 'a', loser: 'b', log: MINI_LOG, turns: 5, remaining: { a: 1, b: 0 },
  lineups: { a: ['garchomp', 'ferrothorn'], b: ['greattusk', 'charizardmegax'] },
};

const line = (stats: SpeciesMatchStats[], species: string): SpeciesMatchStats => {
  const s = stats.find((x) => x.species === species);
  if (!s) throw new Error(`no line for ${species}`);
  return s;
};

describe('matchSpeciesStats', () => {
  it('reads a crafted log: KOs, switches, indirect damage, Mega folding', () => {
    const stats = matchSpeciesStats(miniResult, { id: 'm1', week: 1, home: 'a', away: 'b' }, [alpha, beta]);
    expect(stats).toHaveLength(5);

    const chomp = line(stats, 'garchomp');
    expect(chomp).toMatchObject({ coach: 'a', matchId: 'm1', brought: true, led: true, won: true, kos: 1, fainted: false, turnsActive: 3 });
    expect(chomp.damageDealtPct).toBeCloseTo(80); // 50 (EQ) + 30 (Stone Edge)
    expect(chomp.damageTakenPct).toBeCloseTo(75);

    const ferro = line(stats, 'ferrothorn');
    expect(ferro).toMatchObject({ brought: true, led: false, kos: 1, fainted: true, teraUsed: true, turnsActive: 2 });
    expect(ferro.damageDealtPct).toBeCloseTo(50); // 25 Rocky Helmet ([of] Ferrothorn) + 25 Gyro Ball
    expect(ferro.damageTakenPct).toBeCloseTo(100);

    expect(line(stats, 'toxapex')).toMatchObject({ brought: false, kos: 0, damageDealtPct: 0, won: true });

    const tusk = line(stats, 'greattusk');
    expect(tusk).toMatchObject({ coach: 'b', led: true, won: false, kos: 0, fainted: true, turnsActive: 3 });
    expect(tusk.damageDealtPct).toBeCloseTo(95);
    expect(tusk.damageTakenPct).toBeCloseTo(100);

    const zard = line(stats, 'charizardmegax');
    expect(zard).toMatchObject({ brought: true, kos: 1, fainted: true, megaEvolved: true, turnsActive: 2 });
    expect(zard.damageDealtPct).toBeCloseTo(80);
    expect(zard.damageTakenPct).toBeCloseTo(100); // 50 rocks (nobody's) + 20 recoil + 30
  });

  it('finds p1 from the log when the away coach played p1', () => {
    const stats = matchSpeciesStats(miniResult, { id: 'm1', week: 1, home: 'b', away: 'a' }, [alpha, beta]);
    expect(line(stats, 'garchomp')).toMatchObject({ coach: 'a', kos: 1, led: true });
    expect(line(stats, 'charizardmegax')).toMatchObject({ coach: 'b', megaEvolved: true });
  });

  it('a real simulated match: 6 brought a side, KOs equal faints, the winner dealt damage', async () => {
    const home = coach('h', 'Home Team', ['greattusk', 'garchomp', 'charizardmegax', 'corviknight', 'toxapex', 'dragonite', 'gholdengo'], true);
    const away = coach('w', 'Away Team', ['ironvaliant', 'kingambit', 'gyaradosmega', 'skarmory', 'blissey', 'landorus', 'rotomwash'], true);
    const result = await simulateMatch(home, away, 21);
    const match: Match = { id: 'm9', week: 1, home: 'h', away: 'w', result };
    const stats = matchSpeciesStats(result, match, [home, away]);
    expect(stats).toHaveLength(14);
    for (const c of ['h', 'w']) {
      const brought = stats.filter((s) => s.coach === c && s.brought);
      expect(brought).toHaveLength(6);
      expect(brought.map((s) => s.species).sort()).toEqual([...result.lineups[c]!].sort());
      expect(brought.filter((s) => s.led)).toHaveLength(1);
    }
    const faintLines = result.log.filter((l) => l.startsWith('|faint|')).length;
    expect(stats.reduce((s, x) => s + x.kos, 0)).toBe(faintLines);
    expect(stats.filter((s) => s.fainted).length).toBeLessThanOrEqual(faintLines);
    const winnerDealt = stats.filter((s) => s.coach === result.winner).reduce((s, x) => s + x.damageDealtPct, 0);
    expect(winnerDealt).toBeGreaterThan(0);
    expect(stats.filter((s) => !s.brought).every((s) => s.kos === 0 && s.turnsActive === 0)).toBe(true);
  }, 30_000);
});

const synthLine = (species: string, coachId: string, i: number): SpeciesMatchStats => ({
  species, coach: coachId, matchId: `m${i}`, brought: i % 5 !== 0, led: i % 3 === 0, won: i % 2 === 0,
  kos: i % 4, fainted: i % 3 !== 1, damageDealtPct: 17.3 * (i % 7), damageTakenPct: 11.1 * (i % 6), turnsActive: i % 9,
  teraUsed: i % 4 === 1, megaEvolved: i % 6 === 2, zUsed: i % 8 === 3,
});

describe('aggregation', () => {
  it('merging per-league aggregates equals aggregating all the lines at once', () => {
    const a = Array.from({ length: 40 }, (_, i) => synthLine(['garchomp', 'greattusk', 'toxapex'][i % 3]!, 'c1', i));
    const b = Array.from({ length: 33 }, (_, i) => synthLine(['garchomp', 'kingambit'][i % 2]!, 'c2', i + 7));
    const merged = mergeAggregates([aggregateLines(a), aggregateLines(b)]);
    const whole = aggregateLines([...a, ...b]);
    expect(merged.map((x) => x.species).sort()).toEqual(whole.map((x) => x.species).sort());
    for (const w of whole) {
      const m = merged.find((x) => x.species === w.species)!;
      for (const k of ['games', 'leads', 'wins', 'kos', 'faints'] as const) expect(m[k]).toBe(w[k]);
      for (const k of ['winRate', 'koPerGame', 'survivalRate', 'damagePerGame', 'damageTakenPerGame', 'teraRate', 'megaRate', 'zRate', 'score'] as const) {
        expect(m[k]).toBeCloseTo(w[k], 9);
      }
      expect(m.coaches).toEqual(w.coaches);
    }
    expect(merged.find((x) => x.species === 'garchomp')!.coaches).toEqual(['c1', 'c2']);
    expect(whole.find((x) => x.species === 'garchomp')!.name).toBe('Garchomp');
  });

  it('topPerformers filters by coach and sorts by score', () => {
    const aggs = aggregateLines(Array.from({ length: 60 }, (_, i) => synthLine(['garchomp', 'greattusk', 'toxapex', 'kingambit'][i % 4]!, i % 4 < 2 ? 'c1' : 'c2', i)));
    const top = topPerformers(aggs, 2, 'c2');
    expect(top.map((x) => x.species).sort()).toEqual(['kingambit', 'toxapex']);
    expect(top[0]!.score).toBeGreaterThanOrEqual(top[1]!.score);
  });
});

const fakeAgg = (species: string, price: number, games: number, score: number): SpeciesAggregate => ({
  species, name: species, price, games, leads: 0, wins: Math.round(games / 2), winRate: 0.5, kos: games, faints: games,
  koPerGame: 1, survivalRate: 0, damagePerGame: 80, damageTakenPerGame: 80, teraRate: 0, megaRate: 0, zRate: 0, score, coaches: ['c1'],
});

describe('score and prices', () => {
  it('scores an average mon 50, with or without games, and rewards a strong one', () => {
    const b = SCORE_BASELINE;
    expect(performanceScore({ games: 0, wins: 0, kos: 0, faints: 0, damagePerGame: 0 })).toBeCloseTo(50, 9);
    expect(performanceScore({ games: 20, wins: 10, kos: 20 * b.koPerGame, faints: 20 * b.koPerGame, damagePerGame: b.damagePerGame })).toBeCloseTo(50, 9);
    const strong = performanceScore({ games: 30, wins: 22, kos: 45, faints: 12, damagePerGame: 150 });
    const weak = performanceScore({ games: 30, wins: 9, kos: 9, faints: 29, damagePerGame: 40 });
    expect(strong).toBeGreaterThan(65);
    expect(weak).toBeLessThan(35);
    expect(strong).toBeLessThanOrEqual(100);
    expect(weak).toBeGreaterThanOrEqual(0);
    // Shrinkage: the same rates over fewer games sit closer to 50.
    expect(performanceScore({ games: 3, wins: 2.2, kos: 4.5, faints: 1.2, damagePerGame: 150 })).toBeLessThan(strong);
  });

  it('suggests bounded deltas, only for species with enough games', () => {
    const aggs: SpeciesAggregate[] = [];
    for (let p = 1; p <= 20; p++) {
      aggs.push(fakeAgg(`mon${p}a`, p, 30, 40 + p + ((p * 7) % 11) - 5));
      aggs.push(fakeAgg(`mon${p}b`, p, 25, 40 + p + ((p * 5) % 13) - 6));
      aggs.push(fakeAgg(`thin${p}`, p, 5, p % 2 ? 95 : 5)); // too few games
    }
    aggs.push(fakeAgg('star', 10, 40, 90), fakeAgg('dud', 10, 40, 10), fakeAgg('cheapdud', 1, 40, 0), fakeAgg('topstar', 20, 40, 100));
    const sugg = priceSuggestions(aggs, { minGames: 15, maxDelta: 3 });
    expect(sugg.length).toBeGreaterThan(0);
    for (const s of sugg) {
      expect(s.games).toBeGreaterThanOrEqual(15);
      expect(Math.abs(s.delta)).toBeGreaterThanOrEqual(1);
      expect(Math.abs(s.delta)).toBeLessThanOrEqual(3);
      expect(s.suggested).toBeGreaterThanOrEqual(1);
      expect(s.suggested).toBeLessThanOrEqual(20);
      expect(s.suggested - s.price).toBe(s.delta);
      expect(s.reason).toMatch(/^Won \d+% when brought and \d+\.\d KOs\/game at \d+ pts; plays like a \d+\.$/);
    }
    expect(sugg.some((s) => s.species.startsWith('thin'))).toBe(false);
    expect(sugg.find((s) => s.species === 'star')).toMatchObject({ suggested: 13, delta: 3 });
    expect(sugg.find((s) => s.species === 'dud')).toMatchObject({ suggested: 7, delta: -3 });
    expect(sugg.find((s) => s.species === 'cheapdud')).toBeUndefined(); // already at the floor
    expect(sugg.find((s) => s.species === 'topstar')).toBeUndefined(); // already at the cap
    expect(sugg[0]!.delta).toBe(3);
    expect(priceSuggestions(aggs, { minGames: 1000 })).toEqual([]);
    expect(priceSuggestions(aggs, { maxDelta: 1 }).every((s) => Math.abs(s.delta) === 1)).toBe(true);
  });
});
