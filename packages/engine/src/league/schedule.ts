// Round-robin regular season (circle method).
import type { CoachId, Match } from '../types';
import type { Rng } from './rng';

const BYE = '__bye__';

/**
 * Every coach plays exactly once per week (with an odd count one coach sits out per week).
 * No pair repeats until weeks exceed teams-1; the next cycle repeats the pairings with home/away flipped.
 * Ids are `w{week}m{n}` (n 1-based within the week). The coach order is shuffled by `rng`.
 */
export function buildSchedule(coachIds: readonly CoachId[], weeks: number, rng: Rng): Match[] {
  if (coachIds.length < 2) throw new Error('a schedule needs at least 2 coaches');
  const list: string[] = rng.shuffle(coachIds);
  if (list.length % 2 === 1) list.push(BYE);
  const n = list.length;
  const roundsPerCycle = n - 1;
  const fixed = list[0] as string;
  const rotating = list.slice(1);
  const matches: Match[] = [];

  for (let w = 0; w < weeks; w++) {
    const r = w % roundsPerCycle;
    const cycle = Math.floor(w / roundsPerCycle);
    // Rotate the non-fixed coaches right by r.
    const rot = rotating.map((_, i) => rotating[(i - r + roundsPerCycle * n) % roundsPerCycle] as string);
    const arr = [fixed, ...rot];
    let m = 0;
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i] as string;
      const b = arr[n - 1 - i] as string;
      if (a === BYE || b === BYE) continue;
      // Slot parity makes a rotating coach flip home/away each week (one break per cycle at the wrap);
      // the fixed coach alternates by week. Odd cycles flip everything.
      let aHome = i === 0 ? r % 2 === 0 : i % 2 === 0;
      if (cycle % 2 === 1) aHome = !aHome;
      m += 1;
      matches.push({ id: `w${w + 1}m${m}`, week: w + 1, home: aHome ? a : b, away: aHome ? b : a });
    }
  }
  return matches;
}
