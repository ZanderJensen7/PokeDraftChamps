// The roster display name behind each protocol nickname, per side. Sim-free, so replays can build it without
// loading the battle engine.
import type { SpeciesId } from '@pdc/engine';
import { speciesName } from '../game/names';

/** Protocol nickname -> roster display name, per side ("Charizard" -> "Mega Charizard X" for a Mega pick). */
export type BattleNames = Record<'p1' | 'p2', Record<string, string>>;

/**
 * Nicknames the sim will print for a team mapped to the roster entry's display name. A nickname two roster
 * entries share (Mega X and Y of one base) is left out so neither claims it.
 */
export function namesFor(lineup: SpeciesId[], team: readonly { name?: string; species: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  const seen = new Set<string>();
  team.forEach((set, i) => {
    const id = lineup[i];
    const nick = set.name || set.species;
    if (!id || !nick) return;
    if (seen.has(nick)) { delete out[nick]; return; }
    seen.add(nick);
    out[nick] = speciesName(id);
  });
  return out;
}
