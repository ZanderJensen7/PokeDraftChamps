// Move table rows for the team editor (sim-free): every legal Gen 9 move of a species with the columns Showdown's
// teambuilder shows, plus the long description, the flags that matter and the STAB mark.
import type { SpeciesId, TypeName } from '../types';
import { battleSpeciesId, megaInfo } from '../forms';
import { gen9Dex } from './typeChart';
import { learnableMoveIds } from './moves';

export type MoveCategory = 'Physical' | 'Special' | 'Status';

/** Move flags worth a tag in the table (labels as shown to the player). */
export const MOVE_FLAG_LABELS = ['contact', 'sound', 'bullet', 'punch', 'bite', 'slicing', 'wind', 'bypasses Protect'] as const;
export type MoveFlagLabel = typeof MOVE_FLAG_LABELS[number];

export interface MoveRow {
  id: string;
  name: string;
  type: TypeName;
  category: MoveCategory;
  /** Base power; 0 for status moves and for attacks with variable power (`variablePower`). */
  power: number;
  variablePower: boolean;
  /** Percent, or null when the move never misses. */
  accuracy: number | null;
  /** Base PP and the PP a battle starts with (PP Ups on). */
  pp: number;
  maxPp: number;
  priority: number;
  shortDesc: string;
  desc: string;
  flags: MoveFlagLabel[];
  /** Highest chance (percent) of a secondary effect, when the move has one. */
  secondaryChance?: number;
  /** Same type as the mon (the Mega form's types count for a Mega pick). */
  stab: boolean;
}

const FLAG_KEYS: [Exclude<MoveFlagLabel, 'bypasses Protect'>, string][] = [
  ['contact', 'contact'], ['sound', 'sound'], ['bullet', 'bullet'], ['punch', 'punch'], ['bite', 'bite'], ['slicing', 'slicing'], ['wind', 'wind'],
];

/** One move's row. `types` are the types that earn STAB. */
export function moveRow(name: string, types: readonly TypeName[] = []): MoveRow | null {
  const m = gen9Dex.moves.get(name);
  if (!m.exists) return null;
  const flags: MoveFlagLabel[] = FLAG_KEYS.filter(([, k]) => (m.flags as Record<string, unknown>)[k]).map(([label]) => label);
  // Attacks the Protect family cannot stop (Feint, Phantom Force...). Future Sight style moves are not "bypassing".
  if (m.breaksProtect || (m.category !== 'Status' && !m.flags.protect && !(m.flags as Record<string, unknown>).futuremove)) flags.push('bypasses Protect');
  const chances = [m.secondary, ...(m.secondaries ?? [])].map((s) => s?.chance).filter((c): c is number => typeof c === 'number');
  return {
    id: m.id,
    name: m.name,
    type: m.type,
    category: m.category,
    power: m.basePower,
    variablePower: m.category !== 'Status' && m.basePower === 0,
    accuracy: m.accuracy === true ? null : m.accuracy,
    pp: m.pp,
    maxPp: m.noPPBoosts ? m.pp : Math.floor((m.pp * 8) / 5),
    priority: m.priority,
    shortDesc: m.shortDesc,
    desc: m.desc,
    flags,
    secondaryChance: chances.length ? Math.max(...chances) : undefined,
    stab: m.category !== 'Status' && types.includes(m.type),
  };
}

/** Every Gen 9 move the species can learn as table rows, sorted by name. A Mega reads its base form's learnset. */
export async function moveRows(species: SpeciesId): Promise<MoveRow[]> {
  const ids = await learnableMoveIds(battleSpeciesId(species));
  const types = new Set<TypeName>(gen9Dex.species.get(species).types);
  if (megaInfo(species)) for (const t of gen9Dex.species.get(battleSpeciesId(species)).types) types.add(t);
  const rows: MoveRow[] = [];
  for (const id of ids) {
    const row = moveRow(id, [...types]);
    if (row) rows.push(row);
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}
