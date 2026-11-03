import { buildDraftPool, getDraftMon } from '../draft/pool';
import { Dex } from '@pkmn/dex';
import { BANNED_SPECIES, COACH_IDENTITIES, isBannedSpecies, MAX_POINTS, pickCoachIdentities, PRICE_OVERRIDES, priceOf, tierPriceOf } from './index';
import { DEFAULT_LEAGUE_CONFIG } from '../types';
import { minBudget, validateLeagueConfig } from '../league/config';
import { captainBlock } from '../league/run';

/** The tier price, before PRICE_OVERRIDES. */
const tierPrice = (id: string): number => tierPriceOf(Dex.forGen(9).species.get(id));
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

  it('runs the cheapest tier price at 3, with the floor tiers cheaper than PUBL', () => {
    expect(Math.min(...pool.map((m) => tierPrice(m.id)))).toBe(3);
    const price = (t: string): number[] => pool.filter((m) => m.tier === t).map((m) => tierPrice(m.id));
    for (const tier of ['ZU', 'PU']) {
      const ps = price(tier);
      expect(ps.length).toBeGreaterThan(0);
      expect(Math.max(...ps)).toBeLessThan(priceOf({ tier: 'PUBL', bst: 0 }));
    }
    expect(priceOf({ tier: 'ZU', bst: 400 })).toBe(3);
    expect(priceOf({ tier: 'ZU', bst: 520 })).toBe(5);
    expect(priceOf({ tier: 'PU', bst: 400 })).toBe(5);
    expect(priceOf({ tier: 'PU', bst: 520 })).toBe(7);
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
    // Tier prices: a mon in PRICE_OVERRIDES drafts at its override instead.
    for (const id of ['charizardmegax', 'charizardmegay', 'garchompmega', 'venusaurmega']) expect(byId.has(id)).toBe(true);
    expect(tierPrice('charizardmegax')).toBe(16);   // UUBL
    expect(tierPrice('charizardmegay')).toBe(19);   // OU, BST 634
    expect(tierPrice('garchompmega')).toBe(19);     // '(OU)', BST 700
    expect(tierPrice('venusaurmega')).toBe(15);     // UU
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

describe('price overrides', () => {
  const ids = Object.keys(PRICE_OVERRIDES);

  const megaPool = buildDraftPool({ megas: true });

  it('are whole prices in 1..MAX_POINTS for pool species that differ from the tier price', () => {
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const p = PRICE_OVERRIDES[id]!;
      expect(Number.isInteger(p) && p >= 1 && p <= MAX_POINTS, id).toBe(true);
      expect(megaPool.some((m) => m.id === id), `${id} is in the Mega pool (real, unbanned)`).toBe(true);
      expect(p, id).not.toBe(tierPrice(id));
    }
  });

  it('are the prices the pool and priceOf use; without an id priceOf is the tier price', () => {
    for (const id of ids) {
      expect(megaPool.find((x) => x.id === id)?.points, id).toBe(PRICE_OVERRIDES[id]);
      const s = Dex.forGen(9).species.get(id);
      expect(priceOf({ id, tier: s.tier, natDexTier: s.natDexTier, bst: s.bst })).toBe(PRICE_OVERRIDES[id]);
      expect(priceOf({ tier: s.tier, natDexTier: s.natDexTier, bst: s.bst })).toBe(tierPrice(id));
    }
  });

  it('keep every default and Mega config fillable (budget >= rosterMin x cheapest)', () => {
    for (const megas of [false, true]) {
      const config = { ...DEFAULT_LEAGUE_CONFIG, megas };
      const { need, cheapest } = minBudget(config.rosterMin, megas);
      expect(cheapest).toBe(Math.min(...buildDraftPool({ megas }).map((m) => m.points)));
      expect(config.budget).toBeGreaterThanOrEqual(need);
      expect(validateLeagueConfig(config)).toEqual([]);
    }
  });

  it('set the captain cap: a cap at the override price allows the mon, one point below blocks it', () => {
    const id = ids.find((x) => getDraftMon(x) && !getDraftMon(x)!.isMega && PRICE_OVERRIDES[x]! > 1);
    expect(id).toBeDefined();
    const p = PRICE_OVERRIDES[id!]!;
    expect(captainBlock({ captainMaxPoints: p }, id!)).toBeUndefined();
    expect(captainBlock({ captainMaxPoints: p - 1 }, id!)).toBe('overCap');
  });
});
