// Pick the 6 a coach brings from a roster of up to 12: role coverage first, then greedy matchup.
import { Dex } from '@pkmn/sim';
import type { BattleSet, RosterEntry, SpeciesId } from '../types';
import { attackTypesOfSet, pairScore, stabAttacks, stat100 } from './matchup';
import { toID } from './protocol';
import { Rng } from './rng';
import { buildSetFor } from './sets';

export const LINEUP_SIZE = 6;

const HAZARD_SETTERS = new Set(['stealthrock', 'spikes', 'toxicspikes', 'stickyweb']);
const RECOVERY = new Set(['recover', 'roost', 'slackoff', 'softboiled', 'moonlight', 'synthesis', 'morningsun', 'shoreup', 'strengthsap', 'wish', 'milkdrink', 'rest']);
/** Effective speed stat at or above this counts as "fast" (base 100 with a neutral 252 investment). */
const FAST_SPEED = 299;
/** Base HP + Def + SpD at or above this, or a recovery move, counts as "bulky". */
const BULKY_TOTAL = 280;

interface Candidate {
  id: SpeciesId;
  types: string[];
  matchup: number;
  hazards: boolean;
  fast: boolean;
  bulky: boolean;
  speed: number;
  bulk: number;
}

function speciesIdOf(e: RosterEntry | SpeciesId): SpeciesId {
  return typeof e === 'string' ? e : e.species;
}

function setSpeed(set: BattleSet, base: number): number {
  const nature = Dex.natures.get(set.nature || 'Hardy');
  const mult = nature.plus === 'spe' ? 1.1 : nature.minus === 'spe' ? 0.9 : 1;
  let s = stat100(base, set.evs?.spe ?? 0, mult);
  if (toID(set.item) === 'choicescarf') s *= 1.5;
  return s;
}

/**
 * Choose the lineup (up to 6 species ids, pick order) for a match.
 * Fills a hazard setter, a fast mon and a bulky mon first when the roster has them (best matchup within each role),
 * then adds the best remaining matchups with a small penalty for repeating types. Deterministic per seed.
 */
export function chooseLineup(
  roster: readonly (RosterEntry | SpeciesId)[],
  sets: Record<SpeciesId, BattleSet>,
  oppRoster: readonly (RosterEntry | SpeciesId)[],
  seed: number,
): SpeciesId[] {
  const ids = [...new Set(roster.map(speciesIdOf))];
  if (ids.length <= LINEUP_SIZE) return ids;
  const rng = new Rng(seed);
  const opp = oppRoster.map(e => Dex.species.get(speciesIdOf(e))).filter(s => s.exists);

  const cands: Candidate[] = ids.map(id => {
    const sp = Dex.species.get(id);
    const set = sets[id] ?? buildSetFor(id, { seed, isTeraCaptain: false });
    const types = sp.exists ? sp.types.slice() : ['Normal'];
    const base = sp.exists ? sp.baseStats : { hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe: 80 };
    const speed = setSpeed(set, base.spe);
    const ours = { types, attacks: attackTypesOfSet(set, types), spe: speed, ability: set.ability };
    let matchup = 0;
    for (const o of opp) matchup += pairScore(ours, { types: o.types, attacks: stabAttacks(o.types), spe: stat100(o.baseStats.spe) });
    if (opp.length) matchup /= opp.length;
    const moveIds = set.moves.map(toID);
    const bulk = base.hp + base.def + base.spd;
    return {
      id, types, speed, bulk,
      matchup: matchup + rng.next() * 0.15,
      hazards: moveIds.some(m => HAZARD_SETTERS.has(m)),
      fast: speed >= FAST_SPEED,
      bulky: bulk >= BULKY_TOTAL || moveIds.some(m => RECOVERY.has(m)),
    };
  });

  const picked: Candidate[] = [];
  const take = (c: Candidate | undefined) => { if (c && !picked.includes(c)) picked.push(c); };
  const bestOf = (pred: (c: Candidate) => boolean) =>
    cands.filter(c => pred(c) && !picked.includes(c)).sort((a, b) => b.matchup - a.matchup)[0];

  if (!picked.some(c => c.hazards)) take(bestOf(c => c.hazards));
  if (!picked.some(c => c.fast)) take(bestOf(c => c.fast));
  if (!picked.some(c => c.bulky)) take(bestOf(c => c.bulky));

  while (picked.length < LINEUP_SIZE) {
    let best: Candidate | undefined;
    let bestScore = -Infinity;
    for (const c of cands) {
      if (picked.includes(c)) continue;
      const shared = picked.reduce((n, p) => n + c.types.filter(t => p.types.includes(t)).length, 0);
      const score = c.matchup - 0.3 * shared;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    if (!best) break;
    picked.push(best);
  }
  return picked.map(c => c.id);
}
