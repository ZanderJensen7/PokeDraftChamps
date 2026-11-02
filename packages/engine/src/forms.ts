// Sim-free form helpers (Megas, Z-Crystals) over @pkmn/dex: the app's team screens and stats read these without
// loading the battle layer; battle/sets.ts builds on them.
import { Dex, toID } from '@pkmn/dex';
import type { SpeciesId } from './types';

/** The type Z-Crystal for each attacking type. */
export const Z_CRYSTAL_BY_TYPE: Readonly<Record<string, string>> = Object.freeze({
  Normal: 'Normalium Z', Fire: 'Firium Z', Water: 'Waterium Z', Electric: 'Electrium Z', Grass: 'Grassium Z',
  Ice: 'Icium Z', Fighting: 'Fightinium Z', Poison: 'Poisonium Z', Ground: 'Groundium Z', Flying: 'Flyinium Z',
  Psychic: 'Psychium Z', Bug: 'Buginium Z', Rock: 'Rockium Z', Ghost: 'Ghostium Z', Dragon: 'Dragonium Z',
  Dark: 'Darkinium Z', Steel: 'Steelium Z', Fairy: 'Fairium Z',
});

/** Mega roster id -> its base species id / name and stone; undefined for anything that is not a Mega form. */
export function megaInfo(rosterId: SpeciesId): { baseId: SpeciesId; baseName: string; stone: string } | undefined {
  const sp = Dex.species.get(rosterId);
  if (!sp.exists || !sp.isMega || !sp.requiredItem) return undefined;
  const base = Dex.species.get(sp.baseSpecies);
  if (!base.exists) return undefined;
  return { baseId: base.id, baseName: base.name, stone: sp.requiredItem };
}

/** The species id the battle team lists for a roster id: the base form for a Mega, the id itself otherwise. */
export function battleSpeciesId(rosterId: SpeciesId): SpeciesId {
  return megaInfo(toID(rosterId))?.baseId ?? toID(rosterId);
}

/** Z-Crystal for a move list: the type of the strongest STAB attack by base power, else of the strongest attack. */
export function zCrystalFor(moves: readonly string[], types: readonly string[]): string | undefined {
  let best: { type: string; bp: number; stab: boolean } | undefined;
  for (const name of moves) {
    const m = Dex.moves.get(name);
    if (!m.exists || m.category === 'Status') continue;
    const cand = { type: m.type, bp: m.basePower, stab: types.includes(m.type) };
    if (!best || (cand.stab && !best.stab) || (cand.stab === best.stab && cand.bp > best.bp)) best = cand;
  }
  return best ? Z_CRYSTAL_BY_TYPE[best.type] : undefined;
}
