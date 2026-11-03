// Showdown set text for the team editor. Sim-free (@pkmn/sets only): the app's Team screen reads this without
// loading the battle layer.
import { Sets } from '@pkmn/sets';
import type { BattleSet } from './types';

export interface ExportSetOptions {
  /** Only Tera captains may Terastallize, so only their export carries the Tera Type line. */
  teraCaptain: boolean;
}

/** The set as Showdown import text. A non-captain's stored Tera type stays on the set but is left out of the text. */
export function exportSetText(set: BattleSet, opts: ExportSetOptions): string {
  const { teraType, ...rest } = set;
  return Sets.exportSet(opts.teraCaptain ? set : rest);
}
