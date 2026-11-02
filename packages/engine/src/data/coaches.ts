// Fictional AI coach identities (city + mascot). No real people.
import type { Rng } from '../league/rng';

export interface CoachIdentity {
  name: string;
  abbrev: string;
}

export const COACH_IDENTITIES: readonly CoachIdentity[] = [
  { name: 'Oakhaven Ravens', abbrev: 'OHA' },
  { name: 'Brooklyn Kingambits', abbrev: 'BKN' },
  { name: 'Saltmarsh Pelippers', abbrev: 'SLT' },
  { name: 'Ironvale Tinkatons', abbrev: 'IRV' },
  { name: 'Cinder Bay Torkoals', abbrev: 'CIN' },
  { name: 'Frostford Baxcaliburs', abbrev: 'FRF' },
  { name: 'Duskwater Dragapults', abbrev: 'DSK' },
  { name: 'Granite Peak Garganacls', abbrev: 'GRP' },
  { name: 'Harbor City Corviknights', abbrev: 'HBC' },
  { name: 'Mossgrove Meowscaradas', abbrev: 'MSG' },
  { name: 'Sunspire Volcaronas', abbrev: 'SUN' },
  { name: 'Thunder Ridge Zapdos', abbrev: 'TRZ' },
  { name: 'Riverbend Rotoms', abbrev: 'RVB' },
  { name: 'Northgate Glimmoras', abbrev: 'NGT' },
  { name: 'Coral Coast Palafins', abbrev: 'CCP' },
  { name: 'Ashfall Skeledirges', abbrev: 'ASH' },
  { name: 'Silverlake Gholdengos', abbrev: 'SLV' },
  { name: 'Westbrook Weavilles', abbrev: 'WBK' },
  { name: 'Highland Hydreigons', abbrev: 'HGL' },
  { name: 'Emberton Arcanines', abbrev: 'EMB' },
  { name: 'Stormhaven Kilowattrels', abbrev: 'STH' },
  { name: 'Deepwood Amoongusses', abbrev: 'DPW' },
  { name: 'Lakeshore Clodsires', abbrev: 'LKS' },
  { name: 'Redstone Garchomps', abbrev: 'RDS' },
];

/**
 * n distinct identities in a seeded random order. `exclude` holds abbrevs or names to skip
 * (case-insensitive), e.g. the human's own, so nobody shares an abbrev.
 */
export function pickCoachIdentities(rng: Rng, n: number, exclude: readonly string[] = []): CoachIdentity[] {
  const ex = new Set(exclude.map((a) => a.toUpperCase()));
  const candidates = COACH_IDENTITIES.filter((c) => !ex.has(c.abbrev) && !ex.has(c.name.toUpperCase()));
  if (n > candidates.length) throw new Error(`only ${candidates.length} coach identities available, asked for ${n}`);
  return rng.shuffle(candidates).slice(0, n);
}
