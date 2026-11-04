import { describe, expect, it } from 'vitest';
import type { RunState } from './types';
import { POOL_PROGRESSION } from './data/progression';
import { badgeRunConfig, MAX_STAKE } from './data/stakes';
import { buildDraftPool, getDraftMon } from './draft/pool';
import { aiChoosePick, reservePerSlot } from './draft/draft';
import { createRng, deriveSeed } from './league/rng';
import { createRun, deserializeRun, draftPick, runAiDraftUntilHuman, runPool, serializeRun } from './league/run';
import { DAILY_CONFIG } from './league/daily';
import {
  cleanPoolProgress, dexCompletion, dexSpecies, dexState, earnPacks, newPoolProgress, openPoolPack, packOffer, pokedex,
  startingPool, type PoolProgress,
} from './poolProgress';

const tierCounts = (ids: readonly string[]): Map<string, number> => {
  const out = new Map<string, number>();
  for (const id of ids) {
    const t = getDraftMon(id)!.tier;
    out.set(t, (out.get(t) ?? 0) + 1);
  }
  return out;
};
const withPacks = (pool: PoolProgress, n: number): PoolProgress => ({ ...pool, packs: n });

/** Opens `n` packs in a row, keeping the first offer each time. */
function openMany(pool: PoolProgress, n: number): { pool: PoolProgress; offers: string[][] } {
  let cur = withPacks(pool, n);
  const offers: string[][] = [];
  for (let i = 0; i < n; i++) {
    const offer = packOffer(cur);
    offers.push(offer.map((m) => m.id));
    cur = openPoolPack(cur, offer[0]?.id ?? null);
  }
  return { pool: cur, offers };
}

describe('starting pool', () => {
  it('is half of every pricing tier (rounded up), the floor tiers in full, and only base species', () => {
    const all = tierCounts(dexSpecies().map((m) => m.id));
    const start = startingPool(11);
    const got = tierCounts(start);
    for (const [tier, n] of all) {
      const want = POOL_PROGRESSION.startFullTiers.includes(tier) ? n : Math.ceil(n * POOL_PROGRESSION.startShare);
      expect(got.get(tier) ?? 0, tier).toBe(want);
    }
    expect(start.every((id) => !getDraftMon(id)!.isMega)).toBe(true);
    expect(start).toEqual([...new Set(start)].sort());
  });

  it('is deterministic per seed and differs between seeds', () => {
    expect(startingPool(11)).toEqual(startingPool(11));
    expect(startingPool(11)).not.toEqual(startingPool(12));
    expect(newPoolProgress(11)).toEqual(newPoolProgress(11));
  });

  it('keeps extra species, mapping a Mega to its base', () => {
    const locked = dexSpecies().find((m) => !startingPool(1).includes(m.id) && buildDraftPool({ megas: true }).some((x) => x.baseSpecies === m.id))!;
    const mega = buildDraftPool({ megas: true }).find((x) => x.isMega && x.baseSpecies === locked.id)!;
    const p = newPoolProgress(1, [mega.id, 'notamon']);
    expect(p.unlocked).toContain(locked.id);
    expect(p.unlocked).not.toContain(mega.id);
  });

  it('round-trips through cleanPoolProgress and rejects junk', () => {
    const p = openMany(newPoolProgress(4), 2).pool;
    expect(cleanPoolProgress(JSON.parse(JSON.stringify(p)))).toEqual(p);
    expect(cleanPoolProgress(null)).toBeUndefined();
    expect(cleanPoolProgress({ seed: 'x' })).toBeUndefined();
  });
});

describe('scouting packs', () => {
  it('earns a pack every pointsPerPack first-win points plus the floor packs', () => {
    const p = earnPacks(newPoolProgress(2), POOL_PROGRESSION.pointsPerPack * 2 + 1, 1);
    expect(p.packs).toBe(3);
    expect(p.points).toBe(1);
    expect(earnPacks(p, POOL_PROGRESSION.pointsPerPack - 1, 0).packs).toBe(4);
  });

  it('offers packSize distinct locked species, the same until opened', () => {
    const pool = withPacks(newPoolProgress(5), 1);
    const offer = packOffer(pool);
    expect(offer.length).toBe(POOL_PROGRESSION.packSize);
    expect(new Set(offer.map((m) => m.id)).size).toBe(offer.length);
    for (const m of offer) expect(pool.unlocked).not.toContain(m.id);
    expect(packOffer(pool)).toEqual(offer);
  });

  it('never repeats a species across packs and ends with every species unlocked', () => {
    const start = newPoolProgress(6);
    const locked = dexSpecies().length - start.unlocked.length;
    const { pool, offers } = openMany(start, locked + 2);
    const kept = offers.map((o) => o[0]).filter(Boolean);
    expect(new Set(kept).size).toBe(locked);
    expect(pool.unlocked.length).toBe(dexSpecies().length);
    expect(offers.at(-1)).toEqual([]);
    expect(pool.packs).toBe(0);
  });

  it('weights toward the least-unlocked tiers', () => {
    // Open every locked mon of one tier but one: that tier's lone locked mon should come up rarely.
    const start = newPoolProgress(8);
    const tier = 'RU';
    const ru = dexSpecies().filter((m) => m.tier === tier && !start.unlocked.includes(m.id)).map((m) => m.id);
    const pool: PoolProgress = { ...start, unlocked: [...start.unlocked, ...ru.slice(1)].sort() };
    let hits = 0;
    const tries = 200;
    for (let i = 0; i < tries; i++) {
      if (packOffer({ ...pool, opened: i }).some((m) => m.id === ru[0])) hits++;
    }
    let base = 0;
    for (let i = 0; i < tries; i++) {
      if (packOffer({ ...start, opened: i }).some((m) => m.id === ru[0])) base++;
    }
    expect(hits).toBeLessThan(base);
  });

  it('puts a star on offer at least once every pityEvery packs while any star is locked', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { offers } = openMany(newPoolProgress(seed), 30);
      let run = 0;
      for (const offer of offers) {
        const star = offer.some((id) => getDraftMon(id)!.points >= POOL_PROGRESSION.starPoints);
        run = star ? 0 : run + 1;
        expect(run, `seed ${seed}`).toBeLessThan(POOL_PROGRESSION.pityEvery);
      }
    }
  });

  it('opening needs a waiting pack and an offered species, and flags the keep as NEW', () => {
    const pool = withPacks(newPoolProgress(9), 1);
    const offer = packOffer(pool);
    expect(() => openPoolPack({ ...pool, packs: 0 }, offer[0]!.id)).toThrow();
    expect(() => openPoolPack(pool, pool.unlocked[0]!)).toThrow();
    const next = openPoolPack(pool, offer[2]!.id);
    expect(next).toMatchObject({ packs: 0, opened: 1, fresh: [offer[2]!.id] });
    expect(next.unlocked).toEqual([...pool.unlocked, offer[2]!.id].sort());
  });
});

describe('pokedex', () => {
  it('ranks states and counts completion on Won with', () => {
    expect(dexState(undefined, false)).toBe('locked');
    expect(dexState(undefined, true)).toBe('unlocked');
    expect(dexState({ drafted: 1, wins: 0, titles: 0 }, false)).toBe('drafted');
    expect(dexState({ drafted: 1, wins: 2, titles: 0 }, true)).toBe('wonWith');
    expect(dexState({ drafted: 1, wins: 2, titles: 1 }, true)).toBe('champion');
    const pool = newPoolProgress(3);
    const id = pool.unlocked[0]!;
    const dex = pokedex(pool, { [id]: { drafted: 1, wins: POOL_PROGRESSION.shinyWins, titles: 0 } });
    expect(dex.length).toBe(dexSpecies().length);
    expect(dex.find((e) => e.mon.id === id)).toMatchObject({ state: 'wonWith', shiny: true });
    expect(dex.filter((e) => e.state !== 'locked').length).toBe(pool.unlocked.length);
    expect(dexCompletion(dex)).toBeCloseTo(1 / dex.length);
    expect(dexCompletion([])).toBe(0);
  });
});

describe('a league on the unlocked pool', () => {
  const unlocked = startingPool(21);

  it('drafts only from the stored pool, which survives a save, while a daily keeps the full pool', () => {
    const run = createRun({ config: badgeRunConfig(1), seed: 3, humanName: 'Test', humanAbbrev: 'TST', createdAt: 1, pool: unlocked });
    expect(run.pool).toEqual(unlocked);
    const have = new Set(unlocked);
    expect(run.draft.available.every((id) => have.has(id))).toBe(true);
    expect(run.draft.available.length).toBe(runPool(run).length);
    const back = deserializeRun(serializeRun(run))!;
    expect(back.pool).toEqual(unlocked);
    expect(runPool(back).map((m) => m.id)).toEqual(runPool(run).map((m) => m.id));
    const daily = createRun({ config: DAILY_CONFIG, seed: 3, humanName: 'Test', humanAbbrev: 'TST', createdAt: 1, daily: { date: '2026-11-04' } });
    expect(daily.pool).toBeUndefined();
    expect(daily.draft.available.length).toBe(buildDraftPool({ megas: DAILY_CONFIG.megas }).length);
  });

  it('loads a v4 save as the full pool', () => {
    const run = createRun({ config: badgeRunConfig(1), seed: 3, humanName: 'Test', humanAbbrev: 'TST', createdAt: 1 });
    const v4 = { ...JSON.parse(serializeRun(run)), version: 4 };
    const back = deserializeRun(JSON.stringify(v4))!;
    expect(back.pool).toBeUndefined();
    expect(runPool(back).length).toBe(buildDraftPool({ megas: run.config.megas }).length);
  });

  // Badges 7-10 are 16 teams: the starting pool must keep the reserve rule from choking the draft.
  it.each(Array.from({ length: MAX_STAKE - 6 }, (_, i) => i + 7))('fills every roster at Badge %i from a starting pool', (stake) => {
    const config = badgeRunConfig(stake);
    let run: RunState = createRun({ config, seed: 100 + stake, humanName: 'Test', humanAbbrev: 'TST', createdAt: 1, pool: unlocked });
    const full = createRun({ config, seed: 100 + stake, humanName: 'Test', humanAbbrev: 'TST', createdAt: 1 });
    expect(reservePerSlot(run.draft, run.config, runPool(run))).toBeLessThanOrEqual(reservePerSlot(full.draft, full.config, runPool(full)) + 1);
    for (;;) {
      run = runAiDraftUntilHuman(run);
      if (run.draft.complete) break;
      run = draftPick(run, aiChoosePick(run.draft, run.humanId, run.config, runPool(run), createRng(deriveSeed(stake, 'h', run.draft.pickIndex))));
    }
    for (const c of run.coaches) expect(run.draft.picks.filter((p) => p.coach === c.id).length, c.id).toBeGreaterThanOrEqual(config.rosterMin);
  });
});
