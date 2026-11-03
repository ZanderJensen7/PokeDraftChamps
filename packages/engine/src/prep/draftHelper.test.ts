import { describe, expect, it } from 'vitest';
import { buildDraftPool } from '../draft/pool';
import {
  pickImpact, pickImpactSync, rankPool, roleCategoriesReady, teamMatchupTable, teamNeeds, warmRoleCategories,
} from './index';

const WATER = ['vaporeon', 'milotic', 'blastoise'];

describe('teamNeeds', () => {
  it('flags an all-Water roster as weak to Electric and Grass with Water as the only STAB', async () => {
    const n = await teamNeeds(WATER);
    const weak = n.weakTypes.map((w) => w.type);
    expect(weak).toContain('Electric');
    expect(weak).toContain('Grass');
    const stabTypes = Object.entries(n.matchup.stab).filter(([, c]) => c > 0).map(([t]) => t);
    expect(stabTypes).toEqual(['Water']);
    expect(n.uncoveredStab).not.toContain('Water');
    expect(n.uncoveredStab).toHaveLength(17);
    expect(n.summary.length).toBeLessThanOrEqual(6);
    expect(n.summary[0]).toMatch(/^Weak to/);
  });

  it('matches teamMatchupTable weak scores', async () => {
    const roster = ['greattusk', 'corviknight', 'dragapult', 'vaporeon'];
    const n = await teamNeeds(roster);
    const table = teamMatchupTable(roster);
    for (const w of n.weakTypes) expect(w.score).toBe(table.weak[w.type]);
    const negatives = Object.values(table.weak).filter((s) => s < 0).length;
    expect(n.weakTypes).toHaveLength(negatives);
    for (let i = 1; i < n.weakTypes.length; i++) {
      expect(n.weakTypes[i - 1]!.score).toBeLessThanOrEqual(n.weakTypes[i]!.score);
    }
  });

  it('lists Entry Hazards as missing when nobody has hazards', async () => {
    const n = await teamNeeds(['vaporeon', 'milotic']);
    expect(n.missingRoles).toContain('Entry Hazards');
    expect(n.roles['Entry Hazards']).toEqual([]);
    expect(n.roles.Healing.length).toBeGreaterThan(0);
  });

  it('handles an empty roster without NaN', async () => {
    const n = await teamNeeds([]);
    expect(n.weakTypes).toEqual([]);
    expect(n.speed).toEqual({ fast: 0, mid: 0, slow: 0 });
    expect(n.uncoveredStab).toHaveLength(18);
    expect(n.missingRoles).toHaveLength(10);
    expect(n.matchup.rows).toEqual([]);
    expect(JSON.stringify(n)).not.toMatch(/NaN|null/);
  });

  it('counts Mega speed with the Mega stats', async () => {
    const n = await teamNeeds(['charizardmegax']);
    expect(n.speed.mid + n.speed.fast + n.speed.slow).toBe(1);
    expect(n.matchup.stab.Dragon).toBe(1);
  });
});

describe('pickImpact', () => {
  it('sync: a Ground type onto an Electric-weak roster fixes Electric', () => {
    const r = pickImpactSync(WATER, 'garchomp');
    expect(r.weakFixed.map((w) => w.type)).toContain('Electric');
    const e = r.weakFixed.find((w) => w.type === 'Electric')!;
    expect(e.after).toBeGreaterThan(e.before);
    expect(r.newStab).toContain('Ground');
    expect(r.fitScore).toBeGreaterThanOrEqual(0);
    expect(r.fitScore).toBeLessThanOrEqual(100);
  });

  it('sync: delta agrees with teamMatchupTable on the grown roster', () => {
    const before = teamMatchupTable(WATER).weak;
    const after = teamMatchupTable([...WATER, 'garchomp']).weak;
    const r = pickImpactSync(WATER, 'garchomp');
    for (const f of r.weakFixed) {
      expect(f.before).toBe(before[f.type]);
      expect(f.after).toBe(after[f.type]);
    }
  });

  it('Great Tusk adds Entry Hazards and Hazard Removal to a roster that lacks them', async () => {
    const roster = ['vaporeon', 'milotic'];
    const needs = await teamNeeds(roster);
    expect(needs.missingRoles).toContain('Entry Hazards');
    expect(needs.missingRoles).toContain('Hazard Removal');
    const r = await pickImpact(roster, 'greattusk');
    expect(r.newRoles).toContain('Entry Hazards');
    expect(r.newRoles).toContain('Hazard Removal');
    expect(r.fitScore).toBeGreaterThan(pickImpactSync(roster, 'greattusk', undefined, { roles: false }).fitScore);
    expect(r.note.length).toBeGreaterThan(0);
  });

  it('sync and async agree once the role categories are cached', async () => {
    const roster = ['tyranitar', 'rotom'];
    const cands = ['corviknight', 'greattusk', 'charizardmegax', 'garchomp'];
    const quick = cands.map((c) => pickImpactSync(roster, c, undefined, { roles: false }));
    for (const q of quick) expect(q.newRoles).toBeUndefined();
    await warmRoleCategories([...roster, ...cands]);
    expect(roleCategoriesReady([...roster, ...cands])).toBe(true);
    const ranked = rankPool(roster, cands, undefined, { roles: true });
    for (const c of cands) {
      const full = await pickImpact(roster, c);
      const sync = pickImpactSync(roster, c);
      expect(sync).toEqual(full);
      expect(sync.newRoles).toBeDefined();
      const r = ranked.find((x) => x.species === c)!;
      expect(r.rolesKnown).toBe(true);
      expect(r.fitScore).toBe(full.fitScore);
    }
  });

  it('leaves roles out of rankPool by default so AI picks do not depend on the cache', async () => {
    await warmRoleCategories(['vaporeon', 'greattusk']);
    const [r] = rankPool(['vaporeon'], ['greattusk']);
    expect(r!.rolesKnown).toBe(false);
    expect(r!.fitScore).toBe(pickImpactSync(['vaporeon'], 'greattusk', undefined, { roles: false }).fitScore);
  });

  it('handles Mega candidates (base-species learnset) and an empty roster', async () => {
    const r = await pickImpact([], 'charizardmegax');
    expect(r.weakFixed).toEqual([]);
    expect(r.weakWorsened).toEqual([]);
    expect(r.newRoles.length).toBeGreaterThan(0);
    expect(Number.isFinite(r.fitScore)).toBe(true);
  });

  it('counts outspeeds at base stats', () => {
    const r = pickImpactSync(['snorlax', 'ferrothorn', 'garchomp'], 'dragapult');
    expect(r.speedSlot).toBe('fast');
    expect(r.outspeeds).toBe(3);
  });
});

describe('rankPool', () => {
  const pool = buildDraftPool().map((m) => m.id);

  it('is sorted and deterministic', () => {
    const cands = pool.slice(0, 120);
    const a = rankPool(WATER, cands);
    const b = rankPool(WATER, [...cands].reverse());
    expect(a).toEqual(b);
    for (let i = 1; i < a.length; i++) expect(a[i - 1]!.fitScore).toBeGreaterThanOrEqual(a[i]!.fitScore);
  });

  it('skips roster mons and respects the budget', () => {
    const r = rankPool(WATER, ['vaporeon', 'garchomp'], 0);
    expect(r.map((x) => x.species)).not.toContain('vaporeon');
    expect(r.map((x) => x.species)).not.toContain('garchomp');
  });

  it('ranks 400 candidates well under a second', () => {
    const cands = pool.slice(0, 400);
    const t0 = performance.now();
    const r = rankPool(WATER, cands);
    const dt = performance.now() - t0;
    expect(r.length).toBeGreaterThan(300);
    expect(dt).toBeLessThan(1000);
  });
});
