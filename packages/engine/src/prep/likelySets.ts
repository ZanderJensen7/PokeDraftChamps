import type { SpeciesId } from '../types';
import { randomsSpeciesData } from '../data/randoms';

export interface LikelyRole {
  role: string;
  movepool: string[];
  abilities: string[];
  teraTypes: string[];
}
export interface LikelySets { roles: LikelyRole[] }

/** Gen 9 random-battle roles for a species; empty `roles` when the species has no randoms entry. */
export function likelySets(speciesId: SpeciesId): LikelySets {
  const data = randomsSpeciesData()[speciesId];
  const roles = (data?.sets ?? []).map((s) => ({
    role: s.role,
    movepool: [...s.movepool],
    abilities: [...(s.abilities ?? [])],
    teraTypes: [...(s.teraTypes ?? [])],
  }));
  return { roles };
}
