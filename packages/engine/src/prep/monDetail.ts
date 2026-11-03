// One mon's detail sheet (sim-free): the card, its defensive type row, randoms roles, notable moves and the full
// Gen 9 learnset. The app's MonDetail dialog renders it from every screen that shows a mon outside a battle.
import type { RosterEntry, ScoutedMon, SpeciesId, StatsTable, TypeName } from '../types';
import { getDraftMon } from '../draft/pool';
import { megaInfo } from '../forms';
import { ALL_TYPES, gen9Dex, monMatchupRow } from './typeChart';
import { speedTierRows, type SpeedRow } from './speedTiers';
import { MOVE_CATEGORY_NAMES, MOVE_CATEGORIES, learnableMoveIds, type MoveCategoryName } from './moves';
import { likelySets, type LikelyRole } from './likelySets';
import { toID } from '@pkmn/data';

export interface MonDetailAbility { name: string; desc: string }

export interface MonDetailCard {
  species: SpeciesId;
  /** Showdown name (sprites, icons). */
  name: string;
  /** Player-facing name: Megas as "Mega Charizard X". */
  displayName: string;
  types: TypeName[];
  bst: number;
  baseStats: StatsTable;
  abilities: MonDetailAbility[];
  tier: string;
  /** Draft price; undefined for a species outside the draft pool. */
  price?: number;
  /** Megas only: the base form it Mega Evolves from and the stone it holds. */
  mega?: { baseId: SpeciesId; baseName: string; stone: string };
  isTeraCaptain: boolean;
  isZCaptain: boolean;
}

/** Defensive multipliers into the mon (no ability applied), plus the types grouped by multiplier. */
export interface MonDetailMatchup {
  byType: Record<TypeName, number>;
  x4: TypeName[];
  x2: TypeName[];
  x05: TypeName[];
  x025: TypeName[];
  immune: TypeName[];
}

export interface MonDetail {
  card: MonDetailCard;
  matchup: MonDetailMatchup;
  speed: SpeedRow;
  likelySets: LikelyRole[];
  /** Per category, the notable moves this mon learns (empty categories kept). */
  notableMoves: Record<MoveCategoryName, string[]>;
  /** Every Gen 9 move it learns, display names, sorted. */
  learnset: string[];
  scouted?: ScoutedMon;
}

/** Same rule as the app's displayName: "Charizard-Mega-X" -> "Mega Charizard X". */
function playerName(name: string): string {
  const m = /^(.+)-Mega(?:-([A-Z]))?$/.exec(name);
  return m ? `Mega ${m[1]}${m[2] ? ` ${m[2]}` : ''}` : name;
}

export function monDetailCard(species: SpeciesId, roster?: RosterEntry): MonDetailCard {
  const sp = gen9Dex.species.get(species);
  const mon = getDraftMon(species);
  const name = mon?.name ?? sp.name;
  return {
    species,
    name,
    displayName: playerName(name),
    types: [...sp.types],
    bst: sp.bst,
    baseStats: { ...sp.baseStats },
    abilities: Object.values(sp.abilities).map((a) => ({ name: a, desc: gen9Dex.abilities.get(a).shortDesc })),
    tier: mon?.tier ?? sp.tier,
    price: mon?.points,
    mega: megaInfo(species),
    isTeraCaptain: roster?.isTeraCaptain ?? false,
    isZCaptain: roster?.isZCaptain ?? false,
  };
}

export function monDetailMatchup(species: SpeciesId): MonDetailMatchup {
  const byType = monMatchupRow(species);
  const at = (m: number) => ALL_TYPES.filter((t) => byType[t] === m);
  return { byType, x4: at(4), x2: at(2), x05: at(0.5), x025: at(0.25), immune: at(0) };
}

/** The full sheet. Async only for the learnset; a Mega reads its base form's learnset and randoms roles. */
export async function monDetail(
  species: SpeciesId, opts: { scout?: ScoutedMon; roster?: RosterEntry } = {},
): Promise<MonDetail> {
  const baseId = megaInfo(species)?.baseId ?? species;
  const ids = await learnableMoveIds(baseId);
  const learnset = [...ids].map((id) => gen9Dex.moves.get(id)).filter((m) => m.exists).map((m) => m.name)
    .sort((a, b) => a.localeCompare(b));
  const notable = {} as Record<MoveCategoryName, string[]>;
  for (const cat of MOVE_CATEGORY_NAMES) notable[cat] = MOVE_CATEGORIES[cat].filter((m) => ids.has(toID(m)));
  const own = likelySets(species).roles;
  return {
    card: monDetailCard(species, opts.roster),
    matchup: monDetailMatchup(species),
    speed: speedTierRows([species])[0]!,
    likelySets: own.length ? own : likelySets(baseId).roles,
    notableMoves: notable,
    learnset,
    scouted: opts.scout,
  };
}
