// Showdown text -> roster sets for the team editor: parse, match each set to a roster entry, validate, report.
// Sim-free (@pkmn/sets, @pkmn/dex, @pkmn/data via prep/moves): the app's Team screen reads it without the battle layer.
import { Team } from '@pkmn/sets';
import { Dex, toID } from '@pkmn/dex';
import type { BattleSet, RosterEntry, SpeciesId, StatsTable } from './types';
import { Z_CRYSTAL_BY_TYPE, battleSpeciesId, megaInfo, zCrystalFor } from './forms';
import { learnableMoveIds } from './prep/moves';

export const EV_STAT_CAP = 252;
export const EV_TOTAL_CAP = 510;

const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
const Z_CRYSTALS: readonly string[] = Object.values(Z_CRYSTAL_BY_TYPE);
const TERA_TYPES: readonly string[] = [...Dex.types.all().map((t) => t.name), 'Stellar'];

export const isZCrystalItem = (item: string): boolean => Z_CRYSTALS.includes(item);

/** What a roster entry may hold, from its captain flags (`teraEnabled` = the league has Tera captains at all). */
export interface SetRules {
  teraCaptain: boolean;
  zCaptain: boolean;
}

export function setRulesFor(entry: RosterEntry, teraEnabled: boolean): SetRules {
  return { teraCaptain: teraEnabled && entry.isTeraCaptain, zCaptain: !!entry.isZCaptain };
}

/** The item a roster entry is locked to: a Mega's stone, or a forme's required item (Rusted Sword). */
export function lockedItemFor(rosterId: SpeciesId): string | null {
  const mega = megaInfo(rosterId);
  if (mega) return mega.stone;
  const sp = Dex.species.get(rosterId);
  return sp.exists && typeof sp.requiredItem === 'string' ? sp.requiredItem : null;
}

const zeroStats = (v: number): StatsTable => ({ hp: v, atk: v, def: v, spa: v, spd: v, spe: v });

/** A level-100 empty set for the roster entry (a Mega pick lists its base form holding the stone). */
export function blankSetFor(entry: RosterEntry): BattleSet {
  const sp = Dex.species.get(battleSpeciesId(entry.species));
  return {
    name: sp.name,
    species: sp.name,
    item: lockedItemFor(entry.species) ?? '',
    ability: sp.abilities[0] ?? '',
    moves: [],
    nature: 'Serious',
    gender: '',
    evs: zeroStats(0),
    ivs: zeroStats(31),
    level: 100,
    teraType: sp.types[0] ?? 'Normal',
  };
}

/**
 * Fills the gaps in a partial set and applies the form rules without complaint: level 100, at most four moves,
 * the locked item for a Mega, a Z-Crystal for a Z captain (the type of its best attack) and none for anyone else,
 * no Mega Stone on a non-Mega. Use `validateImportedSet` to find out what a paste got wrong instead.
 */
export function fillSet(entry: RosterEntry, partial: Partial<BattleSet>): BattleSet {
  const base = blankSetFor(entry);
  const moves = (partial.moves ?? []).filter(Boolean).slice(0, 4);
  const locked = lockedItemFor(entry.species);
  let item = locked ?? partial.item ?? base.item;
  if (!locked) {
    if (entry.isZCaptain) {
      if (!isZCrystalItem(item)) item = zCrystalFor(moves, Dex.species.get(base.species).types) ?? '';
    } else if (isZCrystalItem(item) || Dex.items.get(item).megaStone) {
      item = '';
    }
  }
  const abilities = Object.values(Dex.species.get(base.species).abilities);
  return {
    ...base,
    ...partial,
    species: base.species,
    name: base.name,
    item,
    ability: partial.ability && abilities.includes(partial.ability) ? partial.ability : base.ability,
    moves,
    nature: partial.nature && Dex.natures.get(partial.nature).exists ? Dex.natures.get(partial.nature).name : base.nature,
    gender: '',
    evs: { ...base.evs, ...(partial.evs ?? {}) },
    ivs: { ...base.ivs, ...(partial.ivs ?? {}) },
    level: 100,
    teraType: partial.teraType || base.teraType,
  };
}

/** Showdown export text for one or many sets -> raw sets, in order. Garbage in gives an empty list. */
export function parseSetsText(text: string): Partial<BattleSet>[] {
  return (Team.import(text)?.team ?? []) as Partial<BattleSet>[];
}

/** `moves` as a Set of ids, with every Hidden Power type counting as the learnable Hidden Power. */
const moveKey = (name: string): string => {
  const id = toID(name);
  return id.startsWith('hiddenpower') ? 'hiddenpower' : id;
};

/**
 * The roster entry a pasted set belongs to, or a reason it has none. A Mega roster entry matches its Mega name
 * ("Charizard-Mega-X") or its base species holding its stone; a base-species set with some other item matches the
 * Mega entry only when it is the only one (the stone is then forced). Entries in `taken` are passed over.
 */
export function matchRosterEntry(
  imported: Partial<BattleSet>, roster: readonly RosterEntry[], taken: ReadonlySet<SpeciesId> = new Set(),
): { entry: RosterEntry } | { reason: string } {
  const sp = Dex.species.get(imported.species ?? '');
  if (!sp.exists) return { reason: `"${imported.species ?? ''}" is not a Pokemon.` };
  const free = roster.filter((r) => !taken.has(r.species));
  const item = toID(imported.item ?? '');
  const megas = free.filter((r) => megaInfo(r.species)?.baseId === sp.id);
  const byStone = megas.find((r) => toID(megaInfo(r.species)!.stone) === item);
  const exact = free.find((r) => r.species === sp.id);
  const entry = byStone ?? exact ?? (megas.length === 1 ? megas[0] : undefined);
  if (entry) return { entry };
  if (megas.length > 1) return { reason: `${sp.name} has more than one Mega on your roster; hold the stone to pick which.` };
  if (roster.some((r) => r.species === sp.id || megaInfo(r.species)?.baseId === sp.id)) {
    return { reason: `${sp.name}'s set was already applied from an earlier paste block.` };
  }
  return { reason: `${sp.name} is not on your roster.` };
}

export interface ValidatedSet {
  /** The set to store; absent when `errors` is not empty. */
  set?: BattleSet;
  /** Why the set was rejected (illegal moves are named). */
  errors: string[];
  /** Things kept or changed that the player should know about (level forced, Tera Type on a non-captain, ...). */
  warnings: string[];
}

/**
 * Checks a pasted set against the roster entry's rules. `learnable` = the move keys (ids) the battle species can
 * learn in Gen 9. Errors reject the whole set; warnings come with a usable set.
 */
export function validateImportedSet(
  entry: RosterEntry, imported: Partial<BattleSet>, learnable: ReadonlySet<string>, rules: SetRules,
): ValidatedSet {
  const errors: string[] = [];
  const warnings: string[] = [];
  const base = blankSetFor(entry);
  const sp = Dex.species.get(base.species);

  const moves = (imported.moves ?? []).map((m) => m.trim()).filter(Boolean);
  if (!moves.length) errors.push('has no moves.');
  if (moves.length > 4) warnings.push(`only the first four moves were kept (dropped ${moves.slice(4).join(', ')}).`);
  for (const m of moves.slice(0, 4)) {
    const info = Dex.moves.get(m);
    if (!info.exists) errors.push(`${m} is not a move.`);
    else if (!learnable.has(moveKey(info.name))) errors.push(`${sp.name} can't learn ${info.name}.`);
  }

  const abilities = Object.values(sp.abilities);
  if (imported.ability && !abilities.some((a) => toID(a) === toID(imported.ability!))) {
    const mega = megaInfo(entry.species);
    const megaAbilities = mega ? Object.values(Dex.species.get(entry.species).abilities) : [];
    if (megaAbilities.some((a) => toID(a) === toID(imported.ability!))) {
      warnings.push(`${imported.ability} is the Mega form's ability; ${sp.name} starts with ${base.ability}.`);
    } else {
      errors.push(`${sp.name} can't have the ability ${imported.ability}.`);
    }
  }

  if (imported.nature && !Dex.natures.get(imported.nature).exists) errors.push(`${imported.nature} is not a nature.`);

  const item = imported.item?.trim() ?? '';
  const locked = lockedItemFor(entry.species);
  const itemInfo = Dex.items.get(item);
  if (item && !itemInfo.exists) errors.push(`${item} is not an item.`);
  else if (locked) {
    if (toID(item) !== toID(locked)) warnings.push(`item set to ${locked}: ${sp.name} is locked to it.`);
  } else if (entry.isZCaptain) {
    if (!isZCrystalItem(item)) warnings.push('Z captains hold a Z-Crystal; one was picked from its attacks.');
  } else if (isZCrystalItem(item)) {
    errors.push(`${item} is for Z captains only.`);
  } else if (itemInfo.megaStone) {
    errors.push(`${item} would Mega Evolve ${sp.name}, which is not a Mega pick.`);
  }

  const evs: Partial<StatsTable> = imported.evs ?? {};
  let total = 0;
  for (const k of STATS) {
    const v = evs[k] ?? 0;
    if (v < 0 || v > EV_STAT_CAP) errors.push(`${k.toUpperCase()} EVs ${v} are over ${EV_STAT_CAP}.`);
    total += v;
  }
  if (total > EV_TOTAL_CAP) errors.push(`EVs total ${total}, over ${EV_TOTAL_CAP}.`);
  for (const k of STATS) {
    const v = imported.ivs?.[k];
    if (v !== undefined && (v < 0 || v > 31)) errors.push(`${k.toUpperCase()} IVs ${v} are outside 0-31.`);
  }

  if (imported.level !== undefined && imported.level !== 100) warnings.push(`level ${imported.level} set to 100.`);

  if (imported.teraType) {
    if (!TERA_TYPES.includes(imported.teraType)) errors.push(`${imported.teraType} is not a Tera Type.`);
    else if (!rules.teraCaptain) warnings.push(`Tera Type ${imported.teraType} is kept, but only Tera captains can Terastallize.`);
  }

  if (errors.length) return { errors, warnings };
  return { set: fillSet(entry, imported), errors, warnings };
}

export interface AppliedSet { rosterId: SpeciesId; set: BattleSet; warnings: string[] }
export interface SkippedSet { label: string; reason: string }
export interface ImportReport { applied: AppliedSet[]; skipped: SkippedSet[] }

export interface ImportOptions {
  /** The league has Tera captains at all (`run.config.teraCaptains > 0`). */
  teraEnabled: boolean;
  /** Move ids the battle species can learn; defaults to the Gen 9 learnsets. */
  learnable?: (battleSpecies: SpeciesId) => Promise<ReadonlySet<string>>;
}

const defaultLearnable = async (species: SpeciesId): Promise<ReadonlySet<string>> => {
  const ids = await learnableMoveIds(species);
  return new Set([...ids].map(moveKey));
};

/** Imports a Showdown paste of one or many sets onto the roster: valid sets applied, the rest reported. */
export async function importRosterSets(text: string, roster: readonly RosterEntry[], opts: ImportOptions): Promise<ImportReport> {
  const learnable = opts.learnable ?? defaultLearnable;
  const report: ImportReport = { applied: [], skipped: [] };
  const taken = new Set<SpeciesId>();
  for (const imported of parseSetsText(text)) {
    const label = imported.name ? `${imported.name} (${imported.species})` : (imported.species ?? 'Unnamed set');
    const match = matchRosterEntry(imported, roster, taken);
    if ('reason' in match) {
      report.skipped.push({ label, reason: match.reason });
      continue;
    }
    const entry = match.entry;
    const res = validateImportedSet(entry, imported, await learnable(battleSpeciesId(entry.species)), setRulesFor(entry, opts.teraEnabled));
    if (!res.set) {
      report.skipped.push({ label, reason: res.errors.join(' ') });
      continue;
    }
    taken.add(entry.species);
    report.applied.push({ rosterId: entry.species, set: res.set, warnings: res.warnings });
  }
  return report;
}
