import { DEFAULT_LEAGUE_CONFIG, type DraftState } from '../types';
import { createRng, deriveSeed } from '../league/rng';
import { buildDraftPool, getDraftMon } from './pool';
import {
  aiChoosePick, aiRosterTarget, aiWantsToStop, applyPick, coachPointsSpent, createDraft, currentPicker, isDoneDrafting,
  legalPicks, conflictsWithRoster, stopDrafting,
} from './draft';

// A fixed-size league (rosterMin = rosterMax): every coach drafts a full roster, as before the roster range.
const config = { ...DEFAULT_LEAGUE_CONFIG, rosterMin: 11, rosterMax: 11 };
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
    const r2 = { ...d, turn: 16 };
    expect(currentPicker(r2, config)).toBe(d.order[15]);
    expect(currentPicker({ ...d, turn: 31 }, config)).toBe(d.order[0]);
    expect(currentPicker({ ...d, turn: 32 }, config)).toBe(d.order[0]);
    expect(currentPicker({ ...d, turn: 16 * config.rosterMax }, config)).toBeUndefined();
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

  it('a full 16-coach AI draft (nobody stops) completes within budget, rosterMax each, no duplicates', () => {
    const d = fullDraft(12345);
    expect(d.complete).toBe(true);
    expect(d.picks.length).toBe(16 * config.rosterMax);
    expect(new Set(d.picks.map((p) => p.species)).size).toBe(d.picks.length);
    for (const c of coaches) {
      const mine = d.picks.filter((p) => p.coach === c);
      expect(mine.length).toBe(config.rosterMax);
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
    const cfg = { budget: 60, rosterMin: 6, rosterMax: 6 };
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

  it('with a roster range, greedy coaches reach the minimum, stay within budget, and the draft still completes', () => {
    const pool = buildDraftPool();
    const cfg = { budget: 60, rosterMin: 6, rosterMax: 8 };
    let d = createDraft(['a', 'b', 'c'], createRng(4), pool);
    let guard = 0;
    while (!d.complete && guard++ < 100) {
      const who = currentPicker(d, cfg)!;
      const legal = legalPicks(d, who, cfg, pool);
      expect(legal.length).toBeGreaterThan(0); // the clock never lands on a coach with nothing to take
      const best = legal.map((id) => getDraftMon(id)!).sort((x, y) => y.points - x.points)[0]!;
      d = applyPick(d, who, best.id, cfg, pool);
    }
    expect(d.complete).toBe(true);
    for (const c of ['a', 'b', 'c']) {
      const n = d.picks.filter((p) => p.coach === c).length;
      expect(n).toBeGreaterThanOrEqual(6);
      expect(n).toBeLessThanOrEqual(8);
      expect(coachPointsSpent(d, c)).toBeLessThanOrEqual(60);
    }
  });
});

describe('stopping early', () => {
  const pool = buildDraftPool();
  const cfg = { budget: 120, rosterMin: 2, rosterMax: 4 };

  function pickFor(d: DraftState, who: string): DraftState {
    return applyPick(d, who, aiChoosePick(d, who, cfg, pool, createRng(deriveSeed(7, d.pickIndex))), cfg, pool);
  }

  it('refuses a stop below the minimum or out of turn; a stopped coach is skipped in later rounds', () => {
    let d = createDraft(['a', 'b', 'c'], createRng(5), pool);
    const [first, second] = d.order as [string, string, string];
    expect(() => stopDrafting(d, first, cfg, pool)).toThrow(/at least 2/);
    expect(() => stopDrafting(d, second, cfg, pool)).toThrow(/not .*turn/);
    while (d.picks.filter((p) => p.coach === first).length < 2 || currentPicker(d, cfg) !== first) {
      d = pickFor(d, currentPicker(d, cfg)!);
    }
    const stopped = stopDrafting(d, first, cfg, pool);
    expect(stopped.done).toContain(first);
    expect(isDoneDrafting(stopped, first, cfg)).toBe(true);
    expect(currentPicker(stopped, cfg)).not.toBe(first);
    expect(stopped.pickIndex).toBe(d.pickIndex); // a stop is not a pick
    let rest = stopped;
    while (!rest.complete) {
      const who = currentPicker(rest, cfg)!;
      expect(who).not.toBe(first);
      rest = pickFor(rest, who);
    }
    expect(rest.picks.filter((p) => p.coach === first).length).toBe(2);
    for (const c of rest.order.filter((c) => c !== first)) expect(rest.picks.filter((p) => p.coach === c).length).toBe(4);
  });

  it('the AI aim always lies in [rosterMin, rosterMax] and a fixed size draws nothing', () => {
    const range = { budget: 120, rosterMin: 9, rosterMax: 11 };
    const seen = new Set<number>();
    for (let s = 0; s < 200; s++) {
      const aim = aiRosterTarget(range, createRng(s));
      expect(aim).toBeGreaterThanOrEqual(9);
      expect(aim).toBeLessThanOrEqual(11);
      seen.add(aim);
    }
    expect(seen.size).toBe(3);
    const rng = createRng(1);
    const before = createRng(1).next();
    expect(aiRosterTarget({ budget: 120, rosterMin: 11, rosterMax: 11 }, rng)).toBe(11);
    expect(rng.next()).toBe(before);
  });

  it('the AI never stops below the minimum and always stops at its aim', () => {
    let d = createDraft(['a', 'b'], createRng(6), pool);
    const who = currentPicker(d, cfg)!;
    expect(aiWantsToStop(d, who, cfg, 2)).toBe(false); // holds 0 < rosterMin
    while (d.picks.filter((p) => p.coach === who).length < 2 || currentPicker(d, cfg) !== who) d = pickFor(d, currentPicker(d, cfg)!);
    expect(aiWantsToStop(d, who, cfg, 2)).toBe(true);
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
