import { DEFAULT_LEAGUE_CONFIG, type DraftState } from '../types';
import { createRng, deriveSeed } from '../league/rng';
import { buildDraftPool, getDraftMon } from './pool';
import { aiChoosePick, applyPick, coachPointsSpent, createDraft, currentPicker, legalPicks, conflictsWithRoster } from './draft';

const config = DEFAULT_LEAGUE_CONFIG;
const coaches = Array.from({ length: 16 }, (_, i) => `c${i}`);

function fullDraft(seed: number): DraftState {
  const pool = buildDraftPool();
  let d = createDraft(coaches, createRng(seed), pool);
  while (!d.complete) {
    const who = currentPicker(d, config)!;
    const pick = aiChoosePick(d, who, config, pool, createRng(deriveSeed(seed, d.pickIndex)));
    d = applyPick(d, who, pick, config, pool);
  }
  return d;
}

describe('snake draft', () => {
  it('runs round 1 forward and round 2 in reverse', () => {
    const d = createDraft(coaches, createRng(1));
    expect(currentPicker(d, config)).toBe(d.order[0]);
    const r2 = { ...d, pickIndex: 16 };
    expect(currentPicker(r2, config)).toBe(d.order[15]);
    expect(currentPicker({ ...d, pickIndex: 31 }, config)).toBe(d.order[0]);
    expect(currentPicker({ ...d, pickIndex: 32 }, config)).toBe(d.order[0]);
  });

  it('rejects out-of-turn and already-drafted picks without mutating state', () => {
    const d = createDraft(coaches, createRng(2));
    const first = d.order[0]!;
    const other = d.order[1]!;
    expect(() => applyPick(d, other, 'greattusk', config)).toThrow();
    const d2 = applyPick(d, first, 'greattusk', config);
    expect(d.picks.length).toBe(0);
    expect(d2.picks.length).toBe(1);
    expect(() => applyPick(d2, other, 'greattusk', config)).toThrow();
  });

  it('a full 16-coach AI draft completes within budget, rosterSize each, no duplicates', () => {
    const d = fullDraft(12345);
    expect(d.complete).toBe(true);
    expect(d.picks.length).toBe(16 * config.rosterSize);
    expect(new Set(d.picks.map((p) => p.species)).size).toBe(d.picks.length);
    for (const c of coaches) {
      const mine = d.picks.filter((p) => p.coach === c);
      expect(mine.length).toBe(config.rosterSize);
      expect(coachPointsSpent(d, c)).toBeLessThanOrEqual(config.budget);
      // AI spends most of the budget and does not stack one type.
      expect(coachPointsSpent(d, c)).toBeGreaterThanOrEqual(config.budget - 15);
      const types = new Map<string, number>();
      for (const p of mine) for (const t of getDraftMon(p.species)!.types) types.set(t, (types.get(t) ?? 0) + 1);
      expect(Math.max(...types.values())).toBeLessThanOrEqual(4);
    }
    expect(legalPicks(d, coaches[0]!, config)).toEqual([]);
  });

  it('is deterministic per seed and differs across seeds', () => {
    const a = fullDraft(99).picks.map((p) => p.species);
    const b = fullDraft(99).picks.map((p) => p.species);
    const c = fullDraft(100).picks.map((p) => p.species);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('legal picks always leave room for the remaining slots', () => {
    const pool = buildDraftPool();
    let d = createDraft(['a', 'b'], createRng(3), pool);
    const cfg = { budget: 60, rosterSize: 6 };
    while (!d.complete) {
      const who = currentPicker(d, cfg)!;
      const legal = legalPicks(d, who, cfg, pool);
      expect(legal.length).toBeGreaterThan(0);
      // Greedy: always take the most expensive legal mon.
      const best = legal.map((id) => getDraftMon(id)!).sort((x, y) => y.points - x.points)[0]!;
      d = applyPick(d, who, best.id, cfg, pool);
    }
    expect(coachPointsSpent(d, 'a')).toBeLessThanOrEqual(60);
    expect(coachPointsSpent(d, 'b')).toBeLessThanOrEqual(60);
  });
});

describe('one form per species', () => {
  it('a coach cannot own two forms of the same dex number', () => {
    const pool = buildDraftPool();
    const forms = new Map<number, string[]>();
    for (const m of pool) forms.set(m.num, [...(forms.get(m.num) ?? []), m.id]);
    const pair = [...forms.values()].find((ids) => ids.length >= 2);
    expect(pair).toBeDefined();
    const [a, b] = pair as [string, string];
    const owned = pool.filter((m) => m.id === a || m.id === b).map((m) => m.points);
    expect(conflictsWithRoster([a], b, pool)).toBe(true);
    expect(conflictsWithRoster([a], pool.find((m) => m.num !== pool.find((x) => x.id === a)!.num)!.id, pool)).toBe(false);
    expect(owned.length).toBe(2);
  });
});

describe('megas share their base form dex number', () => {
  it('a coach cannot own Charizard and Charizard-Mega-X', () => {
    const pool = buildDraftPool({ megas: true });
    expect(conflictsWithRoster(['charizard'], 'charizardmegax', pool)).toBe(true);
    expect(conflictsWithRoster(['charizardmegay'], 'charizard', pool)).toBe(true);
    expect(conflictsWithRoster(['charizardmegax'], 'charizardmegay')).toBe(true); // default lookup pool knows Megas

    let d = createDraft(['a', 'b'], createRng(1), pool);
    const first = currentPicker(d, config)!;
    d = applyPick(d, first, 'charizard', config, pool);
    const second = currentPicker(d, config)!;
    for (let i = 0; i < 2; i++) { // snake: the second coach picks twice at the turn
      d = applyPick(d, second, legalPicks(d, second, config, pool).find((id) => id !== 'charizardmegax')!, config, pool);
    }
    expect(currentPicker(d, config)).toBe(first);
    expect(legalPicks(d, first, config, pool)).not.toContain('charizardmegax');
    expect(() => applyPick(d, first, 'charizardmegax', config, pool)).toThrow(/another form/);
  });
});
