// Role-based EV / nature / IV spreads (the one EV table the season sets and the team editor presets share).
// Sim-free (@pkmn/dex only): the app reads it without loading the battle layer.
import { Dex } from '@pkmn/dex';
import type { StatsTable } from './types';

type Cat = 'phys' | 'spec' | 'mixed';

const EV0: StatsTable = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const IV31: StatsTable = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };

/** Physical / special / mixed by the set's damaging moves (Body Press, Foul Play, Tera Blast are neutral). */
function attackCategory(moveIds: string[], species: { baseStats: StatsTable }): Cat {
  let phys = 0;
  let spec = 0;
  for (const id of moveIds) {
    const m = Dex.moves.get(id);
    if (!m.exists || m.category === 'Status') continue;
    if (['bodypress', 'foulplay', 'terablast', 'seismictoss', 'nightshade', 'superfang', 'finalgambit'].includes(m.id)) continue;
    if (m.category === 'Physical') phys++;
    else spec++;
  }
  if (phys === 0 && spec === 0) return species.baseStats.atk >= species.baseStats.spa ? 'phys' : 'spec';
  if (phys > 0 && spec > 0) return phys === spec ? (species.baseStats.atk >= species.baseStats.spa ? 'phys' : 'spec') : phys > spec ? 'phys' : 'spec';
  return phys > 0 ? 'phys' : 'spec';
}

function usesPhysical(moveIds: string[]): boolean {
  return moveIds.some(id => {
    const m = Dex.moves.get(id);
    return m.exists && m.category === 'Physical' && !['bodypress', 'foulplay'].includes(m.id);
  });
}

function usesSpecial(moveIds: string[]): boolean {
  return moveIds.some(id => {
    const m = Dex.moves.get(id);
    return m.exists && m.category === 'Special';
  });
}

export interface Spread {
  evs: StatsTable;
  nature: string;
  ivs: StatsTable;
}

/** EVs / nature / IVs by randoms role (see docs/DESIGN.md "Sets"). */
export function spreadFor(role: string, moveIds: string[], baseStats: StatsTable, item: string): Spread {
  const cat = attackCategory(moveIds, { baseStats });
  const phys = usesPhysical(moveIds);
  const spec = usesSpecial(moveIds);
  const main: 'atk' | 'spa' = cat === 'spec' ? 'spa' : 'atk';
  const ivs: StatsTable = { ...IV31 };
  if (!phys) ivs.atk = 0;
  const trickRoom = moveIds.includes('trickroom') || moveIds.includes('gyroball');
  const slow = baseStats.spe < 50;
  const evs: StatsTable = { ...EV0 };
  let nature: string;

  // Which defensive stat to invest in: the lower one (AV doubles as half a SpD investment).
  const effSpd = item === 'Assault Vest' ? baseStats.spd * 1.5 : baseStats.spd;
  const investDef = moveIds.includes('bodypress') || baseStats.def <= effSpd;
  // Which offensive stat a bulky nature lowers.
  const dropAtk = !phys || (phys && spec && cat === 'spec');

  const bulky = role === 'Bulky Setup' || role === 'Bulky Support' || role === 'AV Pivot' || role === 'Staller' || role === 'Bulky Protect';

  if (trickRoom) {
    ivs.spe = 0;
    if (bulky) {
      evs.hp = 252;
      if (investDef) { evs.def = 252; evs.spd = 4; nature = 'Relaxed'; } else { evs.spd = 252; evs.def = 4; nature = 'Sassy'; }
    } else {
      evs.hp = 252; evs[main] = 252; evs.def = 4;
      nature = main === 'atk' ? 'Brave' : 'Quiet';
    }
    return { evs, nature, ivs };
  }

  if (bulky) {
    evs.hp = 252;
    if (investDef) { evs.def = 252; evs.spd = 4; nature = dropAtk ? 'Bold' : 'Impish'; }
    else { evs.spd = 252; evs.def = 4; nature = dropAtk ? 'Calm' : 'Careful'; }
    return { evs, nature, ivs };
  }

  if (role === 'Fast Support') {
    evs.hp = 252; evs.spe = 252; evs.def = 4;
    nature = phys ? 'Jolly' : 'Timid';
    return { evs, nature, ivs };
  }

  if (role === 'Bulky Attacker' || slow) {
    evs.hp = 252; evs[main] = 252;
    if (investDef) evs.def = 4; else evs.spd = 4;
    nature = main === 'atk' ? 'Adamant' : 'Modest';
    return { evs, nature, ivs };
  }

  if (role === 'Fast Bulky Setup') {
    evs.hp = 252; evs.spe = 252; evs[main] = 4;
    nature = main === 'atk' ? 'Jolly' : 'Timid';
    return { evs, nature, ivs };
  }

  // Fast Attacker, Setup Sweeper, Wallbreaker, Tera Blast user, anything else offensive.
  evs[main] = 252; evs.spe = 252; evs.hp = 4;
  const mixed = phys && spec;
  if (mixed) nature = 'Naive';
  else if (role === 'Wallbreaker') nature = main === 'atk' ? 'Adamant' : 'Modest';
  else nature = main === 'atk' ? 'Jolly' : 'Timid';
  return { evs, nature, ivs };
}


/** The EV presets (team editor buttons, guided prep cards): each runs `spreadFor` for the role against the set's own moves and stats. */
export const SPREAD_PRESETS: readonly { label: string; role: string; blurb: string }[] = [
  { label: 'Fast attacker', role: 'Fast Attacker', blurb: 'Max attacking stat and Speed: hit hard and move first.' },
  { label: 'Bulky attacker', role: 'Bulky Attacker', blurb: 'Max HP and attacking stat: hits hard and takes a hit back.' },
  { label: 'Bulky wall', role: 'Bulky Support', blurb: 'Max HP and its weaker defense: soaks hits for the team.' },
  { label: 'Fast support', role: 'Fast Support', blurb: 'Max HP and Speed: sets hazards or status before the foe acts.' },
  { label: 'Fast setup', role: 'Fast Bulky Setup', blurb: 'Max HP and Speed: lives while it boosts, then outspeeds.' },
];
