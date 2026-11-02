// The gen9randombattle species table, precomputed from @pkmn/randoms into randomsSets.json (scripts/gen-randoms.ts)
// so the draft pool, prep and protocol helpers never load the sim. Battle code rolls actual sets from the generator.
import table from './randomsSets.json';

export interface RandomsSetData {
  role: string;
  movepool: string[];
  abilities?: string[];
  teraTypes?: string[];
}

export interface RandomsSpeciesData {
  level?: number;
  sets: RandomsSetData[];
}

/** Which @pkmn/randoms build the JSON came from; a version bump means `npm run gen:randoms -w @pdc/engine`. */
export const RANDOMS_DATA_SOURCE: string = table.source;

const speciesData = table.species as Record<string, RandomsSpeciesData>;
let keysCache: Set<string> | null = null;

/** The randoms species table (509 gen9 species), keyed by species id. */
export function randomsSpeciesData(): Readonly<Record<string, RandomsSpeciesData>> {
  return speciesData;
}

/** Species ids that have a gen9randombattle set. */
export function randomsSpeciesKeys(): ReadonlySet<string> {
  if (!keysCache) keysCache = new Set(Object.keys(speciesData));
  return keysCache;
}
