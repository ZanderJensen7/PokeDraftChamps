// How long the battle screen holds a narrated beat before the next lines apply. Shared by the live battle and
// replays so both read at the same pace.
import { isHpLine, type Narration } from './narrate';

export const SAY_MS = 360;
export const HP_MS = 400;
export const TURN_MS = 300;
/** With attack effects on, "X used Y!" holds long enough for the attack to cross the field before the hit lands. */
export const MOVE_MS = 520;

export function delayFor(line: string, n: Narration | null, reduced: boolean, effects: boolean): number {
  if (effects && line.startsWith('|move|')) return MOVE_MS;
  if (n?.kind === 'say' || n?.kind === 'end') return SAY_MS;
  if (n?.kind === 'turn') return reduced ? 0 : TURN_MS;
  if (isHpLine(line)) return reduced ? 0 : HP_MS;
  return 0;
}
