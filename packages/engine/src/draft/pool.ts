// The draft pool: standard Gen 9 species with a gen9randombattle set, minus bans. Optionally the Mega forms
// of those species (league option `megas`). Built once per option set, cached.
import { Dex } from '@pkmn/dex';
import { TeamGenerators } from '@pkmn/randoms';
import type { DraftMon, SpeciesId, StatsTable } from '../types';
import { isBannedMega, isBannedSpecies, priceOf, pricingTier } from '../data/points';

export interface DraftPoolOptions {
  /** Include Mega forms (default false). */
  megas?: boolean;
}

type Species = ReturnType<ReturnType<typeof Dex.forGen>['species']['get']>;

const cachedPools = new Map<string, readonly DraftMon[]>();
let fullById: ReadonlyMap<SpeciesId, DraftMon> | undefined;

function randomSetIds(): Set<string> {
  const gen = TeamGenerators.getTeamGenerator('gen9randombattle') as unknown as {
    randomSets: Record<string, unknown>;
  };
  return new Set(Object.keys(gen.randomSets));
}

function toDraftMon(s: Species, tier: string, extra: Pick<DraftMon, 'isMega' | 'baseSpecies' | 'requiredItem'>): DraftMon {
  const abilities = [...new Set(Object.values(s.abilities).filter((a): a is string => !!a))];
  const baseStats: StatsTable = { ...s.baseStats };
  return {
    id: s.id,
    name: s.name,
    points: priceOf({ tier: s.tier, natDexTier: s.natDexTier, bst: s.bst }),
    types: [...s.types],
    baseStats,
    abilities,
    tier,
    bst: s.bst,
    num: s.num,
    ...extra,
  };
}

/**
 * Mega forms whose base species has a randoms set. Only 'Past' Megas (the X/Y and ORAS ones): they carry a
 * National Dex tier to price them by and their stones are verified to work in gen9customgame. The 'Future'
 * (Legends Z-A) Megas have neither, so they are left out. Banned by isBannedMega (AG tier).
 */
function megaForms(withSets: Set<string>): DraftMon[] {
  const dex = Dex.forGen(9);
  const out: DraftMon[] = [];
  for (const s of dex.species.all()) {
    if (!s.exists || !s.isMega || s.isNonstandard !== 'Past' || !s.requiredItem) continue;
    const base = dex.species.get(s.baseSpecies);
    if (!base.exists || base.isNonstandard || !withSets.has(base.id)) continue;
    const tier = pricingTier({ tier: s.tier, natDexTier: s.natDexTier });
    if (isBannedMega({ id: s.id, tier })) continue;
    out.push(toDraftMon(s, tier, { isMega: true, baseSpecies: base.id, requiredItem: s.requiredItem }));
  }
  return out;
}

/** Sorted by points desc, then name. Cached per option set: every call with the same options returns the same frozen array. */
export function buildDraftPool(opts: DraftPoolOptions = {}): readonly DraftMon[] {
  const megas = !!opts.megas;
  const key = megas ? 'megas' : 'base';
  const hit = cachedPools.get(key);
  if (hit) return hit;
  let pool: DraftMon[];
  if (megas) {
    pool = [...buildDraftPool({ megas: false }), ...megaForms(randomSetIds())];
  } else {
    const dex = Dex.forGen(9);
    const withSets = randomSetIds();
    pool = [];
    for (const s of dex.species.all()) {
      if (!s.exists || s.isNonstandard || !withSets.has(s.id)) continue;
      if (isBannedSpecies({ id: s.id, tier: s.tier, tags: s.tags })) continue;
      pool.push(toDraftMon(s, s.tier, { isMega: false }));
    }
  }
  pool.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  const frozen = Object.freeze(pool);
  cachedPools.set(key, frozen);
  return frozen;
}

/** Looks a species up in the FULL pool (Megas included) whatever a league's options, so any saved id resolves. */
export function getDraftMon(id: SpeciesId): DraftMon | undefined {
  if (!fullById) fullById = new Map(buildDraftPool({ megas: true }).map((m) => [m.id, m]));
  return fullById.get(id);
}
