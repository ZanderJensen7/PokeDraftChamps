// Sample sets for the team editor: Smogon's Gen 9 sets (fetched from data.pkmn.cc on demand through @pkmn/smogon,
// loaded lazily and cached in memory) plus the randoms role sets as an offline fallback. Sim-free.
import { Dex } from '@pkmn/dex';
import { Generations } from '@pkmn/data';
import type { BattleSet, SpeciesId, StatsTable } from '../types';
import { battleSpeciesId } from '../forms';
import { randomsSpeciesData } from '../data/randoms';
import { spreadFor } from '../spreads';

export interface SampleSet {
  /** Stable within one species' list. */
  id: string;
  /** The set's own name ("Swords Dance", "Fast Attacker"). */
  label: string;
  /** "Smogon OU", "Randoms", ... */
  source: string;
  /** Pre-validation: run it through `fillSet` (and the editor's move check) before storing. */
  set: Partial<BattleSet>;
}

type FetchLike = (url: string) => Promise<{ json(): Promise<unknown> }>;

export interface SampleSetOptions {
  /** Defaults to the global `fetch` with a timeout. Passing one skips the per-species cache. */
  fetch?: FetchLike;
}

/** Tried after the species' native format until one has sets for it. */
const FALLBACK_FORMATS = ['gen9ou', 'gen9ubers', 'gen9uu', 'gen9ru', 'gen9nu', 'gen9pu', 'gen9zu', 'gen9lc', 'gen9monotype'];
const FETCH_TIMEOUT_MS = 8000;

const gen9 = new Generations(Dex).get(9);
const cache = new Map<SpeciesId, Promise<SampleSet[]>>();
let smogonPromise: Promise<{ sets(species: string, format: string): Promise<Partial<BattleSet>[]>; native(species: string): string | undefined }> | null = null;

function defaultFetch(url: string): ReturnType<FetchLike> {
  return fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}

function smogonClient(fetchFn: FetchLike) {
  return import('@pkmn/smogon').then(({ Smogon }) => {
    const smogon = new Smogon(fetchFn, true);
    return {
      sets: (species: string, format: string) => smogon.sets(gen9, species, format as never) as Promise<Partial<BattleSet>[]>,
      native: (species: string) => Smogon.format(gen9, species) as string | undefined,
    };
  });
}

const tierLabel = (format: string): string => `Smogon ${format.replace(/^gen9/, '').toUpperCase()}`;

async function smogonSampleSets(speciesName: string, fetchFn: FetchLike, shared: boolean): Promise<SampleSet[]> {
  let client;
  if (shared) client = await (smogonPromise ??= smogonClient(fetchFn));
  else client = await smogonClient(fetchFn);
  const native = client.native(speciesName);
  const formats = [...new Set([...(native ? [native] : []), ...FALLBACK_FORMATS])];
  for (const format of formats) {
    try {
      const sets = await client.sets(speciesName, format);
      if (sets.length) {
        return sets.map((set, i) => ({ id: `smogon:${format}:${i}`, label: set.name || `Set ${i + 1}`, source: tierLabel(format), set: { ...set, name: undefined } }));
      }
    } catch {
      // This format's file is missing or the request failed; the next one may still work.
    }
  }
  return [];
}

/**
 * Four moves out of a randoms role's movepool: the strongest STAB / biggest attacks first for attacking roles,
 * a split of status and attacks for setup / support roles. Every pool of four or fewer comes back whole.
 */
function movesFromPool(pool: readonly string[], role: string, types: readonly string[]): string[] {
  if (pool.length <= 4) return [...pool];
  const info = pool.map((name) => ({ name, m: Dex.moves.get(name) })).filter((x) => x.m.exists);
  const attacks = info.filter((x) => x.m.category !== 'Status')
    .sort((a, b) => (types.includes(b.m.type) ? 1.5 : 1) * b.m.basePower - (types.includes(a.m.type) ? 1.5 : 1) * a.m.basePower);
  const status = info.filter((x) => x.m.category === 'Status');
  const utility = /Setup|Support|Staller|Protect|Pivot/.test(role);
  const wantStatus = Math.min(status.length, utility ? 2 : 1);
  const picked = [...status.slice(0, wantStatus), ...attacks.slice(0, 4 - wantStatus)];
  for (const x of [...attacks, ...status]) if (picked.length < 4 && !picked.includes(x)) picked.push(x);
  return picked.map((x) => x.name);
}

const ROLE_ITEM: Record<string, string> = { 'AV Pivot': 'Assault Vest' };
const BULKY = /Bulky|Staller|Support|Protect/;

/** The gen9 randoms role sets for a species as sample sets (labelled "Randoms"); empty when it has none. */
export function randomsSampleSets(speciesId: SpeciesId): SampleSet[] {
  const base = battleSpeciesId(speciesId);
  const data = randomsSpeciesData()[base];
  const sp = Dex.species.get(base);
  if (!data || !sp.exists) return [];
  return data.sets.map((rs, i) => {
    const moves = movesFromPool(rs.movepool, rs.role, sp.types);
    const item = ROLE_ITEM[rs.role] ?? (BULKY.test(rs.role) ? 'Leftovers' : 'Life Orb');
    const spread = spreadFor(rs.role, moves.map((m) => Dex.moves.get(m).id), sp.baseStats as StatsTable, item);
    return {
      id: `randoms:${i}`,
      label: rs.role,
      source: 'Randoms',
      set: {
        species: sp.name,
        item,
        ability: rs.abilities?.[0] ?? sp.abilities[0],
        moves,
        nature: spread.nature,
        evs: spread.evs,
        ivs: spread.ivs,
        teraType: rs.teraTypes?.[0] ?? sp.types[0],
      },
    };
  });
}

/**
 * Sample sets for a species: Smogon's first (when the request works), then the randoms role sets. Never rejects;
 * an empty list means no sample sets are available. The default fetch result is cached for the page's lifetime.
 */
export function loadSampleSets(speciesId: SpeciesId, opts: SampleSetOptions = {}): Promise<SampleSet[]> {
  const base = battleSpeciesId(speciesId);
  const cached = !opts.fetch ? cache.get(base) : undefined;
  if (cached) return cached;
  const sp = Dex.species.get(base);
  const run = (async () => {
    let smogon: SampleSet[] = [];
    try {
      if (sp.exists) smogon = await smogonSampleSets(sp.name, opts.fetch ?? defaultFetch, !opts.fetch);
    } catch {
      // Offline or the data host is down: the randoms sets below still work.
    }
    // An empty Smogon answer may only mean the request failed: let the next open try again.
    if (!smogon.length) cache.delete(base);
    return [...smogon, ...randomsSampleSets(speciesId)];
  })();
  if (!opts.fetch) cache.set(base, run);
  return run;
}
