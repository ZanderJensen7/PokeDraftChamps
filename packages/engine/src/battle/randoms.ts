// Typed access to the parts of @pkmn/randoms' gen9 generator that its public d.ts does not expose.
import { TeamGenerators } from '@pkmn/randoms';
import type { PRNGSeed } from '@pkmn/sim';
import type { RandomsSpeciesData } from '../data/randoms';

export { randomsSpeciesData, randomsSpeciesKeys, type RandomsSetData, type RandomsSpeciesData } from '../data/randoms';

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
