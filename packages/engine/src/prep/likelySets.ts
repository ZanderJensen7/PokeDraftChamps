import { TeamGenerators } from '@pkmn/randoms';
import type { SpeciesId } from '../types';

export interface LikelyRole {
  role: string;
  movepool: string[];
  abilities: string[];
  teraTypes: string[];
}
export interface LikelySets { roles: LikelyRole[] }

interface RawSets {
  [species: string]: {
    level?: number;
    sets?: { role: string; movepool: string[]; abilities?: string[]; teraTypes?: string[] }[];
  };
}

let cached: RawSets | undefined;
function randomSets(): RawSets {
  if (!cached) {
    const gen = TeamGenerators.getTeamGenerator('gen9randombattle', 'gen5,0000000000000001');
    cached = (gen as unknown as { randomSets?: RawSets }).randomSets ?? {};
  }
  return cached;
}

/** Gen 9 random-battle roles for a species; empty `roles` when the species has no randoms entry. */
export function likelySets(speciesId: SpeciesId): LikelySets {
  const data = randomSets()[speciesId];
  const roles = (data?.sets ?? []).map((s) => ({
    role: s.role,
    movepool: [...s.movepool],
    abilities: [...(s.abilities ?? [])],
    teraTypes: [...(s.teraTypes ?? [])],
  }));
  return { roles };
}
