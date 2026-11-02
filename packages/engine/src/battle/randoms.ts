// Typed access to the parts of @pkmn/randoms' gen9 generator that its public d.ts does not expose.
import { TeamGenerators } from '@pkmn/randoms';
import type { PRNGSeed } from '@pkmn/sim';

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

export interface RandomsSet {
  name: string;
  species: string;
  speciesId?: string;
  moves: string[];
  ability: string;
  item: string;
  nature?: string;
  teraType?: string;
  role?: string;
  level: number;
}

export interface RandomsGenerator {
  randomSet(name: string): RandomsSet;
  randomSets: Record<string, RandomsSpeciesData>;
}

export function seedTuple(seed: number, salt = 0): [number, number, number, number] {
  // Spread a 32-bit seed (plus salt) into four 16-bit words for the Gen 5 PRNG.
  let h = (seed ^ Math.imul(salt + 0x9e3779b9, 0x85ebca6b)) >>> 0;
  const out: number[] = [];
  for (let i = 0; i < 4; i++) {
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
    h = (h + 0x6d2b79f5 + i) >>> 0;
    out.push(h & 0xffff);
  }
  return [out[0]!, out[1]!, out[2]!, out[3]!];
}

export function randomsGenerator(seed: number, salt = 0): RandomsGenerator {
  const s = seedTuple(seed, salt);
  const prngSeed = s.join(',') as PRNGSeed;
  return TeamGenerators.getTeamGenerator('gen9randombattle', prngSeed) as unknown as RandomsGenerator;
}

let keysCache: Set<string> | null = null;
let dataCache: Record<string, RandomsSpeciesData> | null = null;

/** The randoms species table (509 gen9 species), keyed by species id. */
export function randomsSpeciesData(): Record<string, RandomsSpeciesData> {
  if (!dataCache) dataCache = randomsGenerator(1).randomSets;
  return dataCache;
}

export function randomsSpeciesKeys(): Set<string> {
  if (!keysCache) keysCache = new Set(Object.keys(randomsSpeciesData()));
  return keysCache;
}
