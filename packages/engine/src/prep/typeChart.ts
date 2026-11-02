import { Dex } from '@pkmn/dex';
import type { SpeciesId, TypeName } from '../types';

export const gen9Dex = Dex.forGen(9);

/** The 18 types in the order the teambuilding sheet uses. */
export const ALL_TYPES: readonly TypeName[] = [
  'Bug', 'Dark', 'Dragon', 'Electric', 'Fairy', 'Fighting', 'Fire', 'Flying', 'Ghost',
  'Grass', 'Ground', 'Ice', 'Normal', 'Poison', 'Psychic', 'Rock', 'Steel', 'Water',
];

/** Ability -> attacking types it makes the holder immune to. */
const ABILITY_IMMUNE: Record<string, TypeName[]> = {
  Levitate: ['Ground'],
  'Water Absorb': ['Water'], 'Storm Drain': ['Water'], 'Dry Skin': ['Water'],
  'Volt Absorb': ['Electric'], 'Lightning Rod': ['Electric'], 'Motor Drive': ['Electric'],
  'Flash Fire': ['Fire'],
  'Sap Sipper': ['Grass'],
  'Earth Eater': ['Ground'],
  'Well-Baked Body': ['Fire'],
};
/** Ability -> attacking types whose damage it halves. Fluffy's contact halving is move-dependent: skipped. */
const ABILITY_HALVE: Record<string, TypeName[]> = {
  'Thick Fat': ['Fire', 'Ice'],
  Heatproof: ['Fire'],
  'Purifying Salt': ['Ghost'],
  'Water Bubble': ['Fire'],
};
/** Ability -> [attacking type, multiplier] extra factors. */
const ABILITY_SCALE: Record<string, [TypeName, number][]> = {
  'Dry Skin': [['Fire', 1.25]],
  Fluffy: [['Fire', 2]],
};

/** Raw type multiplier (no abilities) of an attacking type into a list of defending types. */
export function typeMultiplier(attackingType: TypeName, defTypes: readonly TypeName[]): number {
  let m = 1;
  for (const t of defTypes) {
    const code = gen9Dex.types.get(t).damageTaken[attackingType];
    if (code === 1) m *= 2;
    else if (code === 2) m *= 0.5;
    else if (code === 3) m *= 0;
  }
  return m;
}

function applyAbility(mult: number, attackingType: TypeName, ability?: string): number {
  if (!ability) return mult;
  if (ABILITY_IMMUNE[ability]?.includes(attackingType)) return 0;
  let m = mult;
  if (ABILITY_HALVE[ability]?.includes(attackingType)) m *= 0.5;
  for (const [t, f] of ABILITY_SCALE[ability] ?? []) if (t === attackingType) m *= f;
  return m;
}

/** Damage multiplier of `attackingType` into a species, with an optional ability applied. */
export function effectivenessAgainst(
  attackingType: TypeName, speciesId: SpeciesId, ability?: string,
): number {
  const sp = gen9Dex.species.get(speciesId);
  return applyAbility(typeMultiplier(attackingType, sp.types), attackingType, ability);
}

export function monMatchupRow(speciesId: SpeciesId, ability?: string): Record<TypeName, number> {
  const row: Record<TypeName, number> = {};
  for (const t of ALL_TYPES) row[t] = effectivenessAgainst(t, speciesId, ability);
  return row;
}

export interface MatchupRow { species: SpeciesId; ability: string; byType: Record<TypeName, number> }
export interface ImmunityNote { species: SpeciesId; ability: string; type: TypeName }
export interface TeamMatchup {
  rows: MatchupRow[];
  /** Number of mons on the team with that type (STAB users). */
  stab: Record<TypeName, number>;
  /** Weak score per attacking type: summed per-mon scores plus the no-resist penalty. */
  weak: Record<TypeName, number>;
  /** Alternate abilities that would grant an immunity the table did not apply. */
  immunityNotes: ImmunityNote[];
}

/** Sheet score for one mon: 2x -1, 4x -2, 0.5x +1, 0.25x or immune +2, anything else 0. */
export function weakScore(mult: number): number {
  if (mult >= 4) return -2;
  if (mult >= 2) return -1;
  if (mult <= 0.25) return 2;
  if (mult <= 0.5) return 1;
  return 0;
}

/**
 * Team table. Each mon uses its chosen ability, else its first (slot 0) ability. Other abilities
 * that would make the mon immune to a type it is not already immune to are listed in
 * `immunityNotes` instead of being applied.
 */
export function teamMatchupTable(
  speciesIds: SpeciesId[], abilityChoice: Record<SpeciesId, string> = {},
): TeamMatchup {
  const rows: MatchupRow[] = [];
  const immunityNotes: ImmunityNote[] = [];
  const stab: Record<TypeName, number> = {};
  const weak: Record<TypeName, number> = {};
  const resisters: Record<TypeName, number> = {};
  for (const t of ALL_TYPES) { stab[t] = 0; weak[t] = 0; resisters[t] = 0; }

  for (const id of speciesIds) {
    const sp = gen9Dex.species.get(id);
    const ability = abilityChoice[id] ?? sp.abilities[0] ?? '';
    const byType = monMatchupRow(id, ability);
    rows.push({ species: id, ability, byType });
    for (const t of sp.types) stab[t] = (stab[t] ?? 0) + 1;
    for (const t of ALL_TYPES) {
      const m = byType[t] ?? 1;
      weak[t] = (weak[t] ?? 0) + weakScore(m);
      if (m < 1) resisters[t] = (resisters[t] ?? 0) + 1;
    }
    const seen = new Set<string>();
    for (const ab of Object.values(sp.abilities)) {
      if (ab === ability || seen.has(ab)) continue;
      seen.add(ab);
      for (const t of ABILITY_IMMUNE[ab] ?? []) {
        if ((byType[t] ?? 1) !== 0) immunityNotes.push({ species: id, ability: ab, type: t });
      }
    }
  }
  for (const t of ALL_TYPES) {
    const r = resisters[t] ?? 0;
    if (r === 0) weak[t] = (weak[t] ?? 0) - 2;
    else if (r === 1) weak[t] = (weak[t] ?? 0) - 1;
  }
  return { rows, stab, weak, immunityNotes };
}
