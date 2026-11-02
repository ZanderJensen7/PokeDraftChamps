// Cheap type-chart matchup scoring shared by team preview, switching and lineup selection.
import { Dex } from '@pkmn/sim';
import type { BattleSet } from '../types';

/** Abilities that make the holder immune to a whole attacking type. */
export const ABILITY_TYPE_IMMUNITY: Record<string, string> = {
  levitate: 'Ground', eartheater: 'Ground',
  flashfire: 'Fire', wellbakedbody: 'Fire',
  waterabsorb: 'Water', stormdrain: 'Water', dryskin: 'Water',
  voltabsorb: 'Electric', lightningrod: 'Electric', motordrive: 'Electric',
  sapsipper: 'Grass',
};

/** Damage multiplier of an attacking type into a type list (0 when immune). */
export function typeMultiplier(attackType: string, defTypes: readonly string[], defAbility?: string): number {
  if (defAbility) {
    const imm = ABILITY_TYPE_IMMUNITY[defAbility.toLowerCase().replace(/[^a-z0-9]/g, '')];
    if (imm === attackType) return 0;
  }
  if (!Dex.getImmunity(attackType, defTypes as string[])) return 0;
  return Math.pow(2, Dex.getEffectiveness(attackType, defTypes as string[]));
}

/** Attacking types a set actually uses (damaging moves), STAB-flagged. */
export function attackTypesOfSet(set: BattleSet, types: readonly string[]): { type: string; stab: boolean; power: number }[] {
  const out: { type: string; stab: boolean; power: number }[] = [];
  for (const name of set.moves) {
    const m = Dex.moves.get(name);
    if (!m.exists || m.category === 'Status') continue;
    const bp = m.basePower || 60;
    out.push({ type: m.type, stab: types.includes(m.type), power: bp });
  }
  return out;
}

/** Offensive pressure: best (STAB-weighted) multiplier of the attack types into the defender. */
export function offenseScore(attacks: { type: string; stab: boolean }[], defTypes: readonly string[], defAbility?: string): number {
  let best = 0;
  for (const a of attacks) {
    const v = typeMultiplier(a.type, defTypes, defAbility) * (a.stab ? 1.5 : 1);
    if (v > best) best = v;
  }
  return best;
}

/** Defensive exposure: worst multiplier of the attacker's STAB types into us (lower is better). */
export function exposure(attackTypes: readonly string[], defTypes: readonly string[], defAbility?: string): number {
  let worst = 0;
  for (const t of attackTypes) worst = Math.max(worst, typeMultiplier(t, defTypes, defAbility));
  return worst;
}

/** Stat at level 100 for 252 EVs / 31 IVs with a nature multiplier. */
export function stat100(base: number, ev = 252, natureMult = 1): number {
  return Math.floor(Math.floor((2 * base + 31 + Math.floor(ev / 4)) * 100 / 100 + 5) * natureMult);
}

/** Matchup of one mon against another from type chart + speed, roughly in [-3, 3]. */
export function pairScore(
  ours: { types: readonly string[]; attacks: { type: string; stab: boolean }[]; spe: number; ability?: string },
  theirs: { types: readonly string[]; attacks: { type: string; stab: boolean }[]; spe: number; ability?: string },
): number {
  const off = offenseScore(ours.attacks, theirs.types, theirs.ability);
  const theirOff = offenseScore(theirs.attacks, ours.types, ours.ability);
  const offPart = Math.log2(Math.max(off, 0.25) / 1.5);
  const defPart = -Math.log2(Math.max(theirOff, 0.25) / 1.5);
  const speedPart = ours.spe > theirs.spe ? 0.5 : ours.spe < theirs.spe ? -0.5 : 0;
  return offPart + defPart + speedPart;
}

/** STAB attack profile of a species (used when its set is unknown). */
export function stabAttacks(types: readonly string[]): { type: string; stab: boolean }[] {
  return types.map(t => ({ type: t, stab: true }));
}
