import { buildDraftPool, getDraftMon } from '../draft/pool';
import { BANNED_SPECIES, COACH_IDENTITIES, isBannedSpecies, pickCoachIdentities, priceOf } from './index';
import { createRng } from '../league/rng';

describe('draft pool', () => {
  const pool = buildDraftPool();

  it('has 400+ unique mons with prices in 1..20', () => {
    expect(pool.length).toBeGreaterThan(400);
    expect(new Set(pool.map((m) => m.id)).size).toBe(pool.length);
    for (const m of pool) {
      expect(m.points).toBeGreaterThanOrEqual(1);
      expect(m.points).toBeLessThanOrEqual(20);
      expect(m.abilities.length).toBeGreaterThan(0);
      expect(new Set(m.abilities).size).toBe(m.abilities.length);
    }
  });

  it('contains no banned species', () => {
    const ids = new Set(pool.map((m) => m.id));
    for (const b of BANNED_SPECIES) expect(ids.has(b)).toBe(false);
    for (const m of pool) {
      expect(m.id.startsWith('arceus')).toBe(false);
      expect(m.tier).not.toBe('AG');
    }
    for (const id of ['koraidon', 'miraidon', 'zaciancrowned', 'calyrexshadow', 'kyogre', 'lugia']) expect(ids.has(id)).toBe(false);
  });

  it('is cached and indexed', () => {
    expect(buildDraftPool()).toBe(pool);
    expect(getDraftMon('greattusk')?.name).toBe('Great Tusk');
    expect(getDraftMon('nope')).toBeUndefined();
  });
});

describe('pricing + bans', () => {
  it('bumps big OU mons and caps at 20', () => {
    expect(priceOf({ tier: 'OU', bst: 600 })).toBe(19);
    expect(priceOf({ tier: 'OU', bst: 599 })).toBe(18);
    expect(priceOf({ tier: 'Uber', bst: 680 })).toBe(20);
    expect(priceOf({ tier: 'UU', bst: 600 })).toBe(15);
    expect(priceOf({ tier: 'Weird', bst: 300 })).toBe(5);
  });

  it('bans by tag, tier and id', () => {
    expect(isBannedSpecies({ id: 'x', tier: 'OU', tags: ['Restricted Legendary'] })).toBe(true);
    expect(isBannedSpecies({ id: 'x', tier: 'AG' })).toBe(true);
    expect(isBannedSpecies({ id: 'arceusfire', tier: 'Uber' })).toBe(true);
    expect(isBannedSpecies({ id: 'greattusk', tier: 'OU', tags: ['Paradox'] })).toBe(false);
  });
});

describe('mega forms', () => {
  const base = buildDraftPool();
  const full = buildDraftPool({ megas: true });
  const byId = new Map(full.map((m) => [m.id, m]));

  it('are absent unless the option is on', () => {
    expect(base.some((m) => m.isMega)).toBe(false);
    expect(full.length).toBeGreaterThan(base.length + 20);
    expect(buildDraftPool({ megas: true })).toBe(full);
    expect(buildDraftPool({ megas: false })).toBe(base);
  });

  it('include Charizard-Mega-X with its base and stone, and exclude AG and Future Megas', () => {
    const zard = byId.get('charizardmegax');
    expect(zard).toMatchObject({ name: 'Charizard-Mega-X', isMega: true, baseSpecies: 'charizard', requiredItem: 'Charizardite X', num: 6, tier: 'UUBL' });
    expect(byId.has('rayquazamega')).toBe(false); // AG
    expect(byId.has('gengarmega')).toBe(false);   // AG
    expect(byId.has('dragonitemega')).toBe(false); // Future: no National Dex tier yet
    expect(byId.has('lopunnymega')).toBe(false);   // base has no randoms set
    expect(byId.has('mewtwomegax')).toBe(false); // banned on lab evidence (BANNED_MEGAS)
    expect(byId.has('mewtwomegay')).toBe(false);
    const baseIds = new Set(base.map((m) => m.id));
    for (const m of full.filter((x) => x.isMega)) {
      expect(m.requiredItem).toBeTruthy();
      expect(m.baseSpecies && baseIds.has(m.baseSpecies)).toBe(true);
    }
  });

  it('are priced by their National Dex tier', () => {
    expect(byId.get('charizardmegax')?.points).toBe(16);   // UUBL
    expect(byId.get('charizardmegay')?.points).toBe(19);   // OU, BST 634
    expect(byId.get('garchompmega')?.points).toBe(19);     // '(OU)', BST 700
    expect(byId.get('venusaurmega')?.points).toBe(15);     // UU
    expect(priceOf({ tier: 'Illegal', natDexTier: 'UUBL', bst: 634 })).toBe(16);
    expect(priceOf({ tier: 'OU', natDexTier: 'UU', bst: 500 })).toBe(18); // a priced tier wins
  });

  it('resolve through getDraftMon whatever pool a league uses', () => {
    expect(getDraftMon('charizardmegax')?.isMega).toBe(true);
    expect(getDraftMon('charizard')?.isMega).toBe(false);
  });
});

describe('coach identities', () => {
  it('has 24 distinct names and three-letter abbrevs', () => {
    expect(COACH_IDENTITIES.length).toBe(24);
    expect(new Set(COACH_IDENTITIES.map((c) => c.abbrev)).size).toBe(24);
    expect(new Set(COACH_IDENTITIES.map((c) => c.name)).size).toBe(24);
    for (const c of COACH_IDENTITIES) expect(c.abbrev).toMatch(/^[A-Z]{3}$/);
  });

  it('picks n distinct identities deterministically and honours exclusions', () => {
    const a = pickCoachIdentities(createRng(7), 15, ['OHA']);
    const b = pickCoachIdentities(createRng(7), 15, ['OHA']);
    expect(a).toEqual(b);
    expect(new Set(a.map((c) => c.abbrev)).size).toBe(15);
    expect(a.some((c) => c.abbrev === 'OHA')).toBe(false);
  });
});
