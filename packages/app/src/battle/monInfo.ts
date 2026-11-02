// What the battle hover card shows for one mon: built from the field view (which already tracks every
// revealed move / item / ability as lines are narrated), your latest request, the opponent's public lineup,
// the season's scouting report and the prep data (likely sets, speed tiers). No log parsing here.
import { toID } from '@pkmn/dex';
import type { ScoutedMon, SpeciesId, StatsTable } from '@pdc/engine';
import { battleSpeciesId, likelySets, speedTierRows } from '@pdc/engine';
import type { ParsedRequest, RequestPokemon } from '@pdc/engine/battle';
import { displayName } from '../game/names';
import { dex9 } from '../game/sets';
import { activeMon, parseCondition, parseDetails, parseIdent, type FieldView, type MonView, type Side } from './battleView';

export interface MonTarget { side: Side; index: number }

export interface MonInfoContext {
  /** Both lineups (roster ids): public once team preview prints them. */
  lineups: Record<Side, readonly SpeciesId[]>;
  teraCaptains: Record<Side, readonly SpeciesId[]>;
  /** What the opponent revealed in their earlier logs this season, by roster id. */
  scouted: Readonly<Record<SpeciesId, ScoutedMon>>;
  /** Your side's latest request: exact stats, moves, PP, item and ability. */
  request: ParsedRequest | null;
}

export interface MoveLine { name: string; type: string; pp?: number; maxpp?: number }

/** Who moves first at a given speed: you, them, or a speed tie. */
export type SpeedResult = 'you' | 'them' | 'tie';
export interface SpeedTier { label: string; value: number; result: SpeedResult | null }

export interface SpeedInfo {
  /** Your mon's effective speed: the hovered mon on your cards, your active on theirs. */
  yours: { name: string; value: number } | null;
  /** The opposing mon's tiers: the hovered mon on their cards, their active on yours. */
  theirs: { name: string; tiers: SpeedTier[] } | null;
  trickRoom: boolean;
  /** Modifiers applied, in words ("+1 Spe (you)", "Tailwind (foe)"). */
  notes: string[];
}

export interface MonInfo {
  side: Side;
  name: string;
  /** Current species (formes included), for the sprite and base stats. */
  species: string;
  types: string[];
  /** Terastallized type, once it happened. */
  tera?: string;
  teraCaptain: boolean;
  /** Your captain's Tera type (before it is used). */
  teraPlan?: string;
  item?: string;
  itemGone?: boolean;
  ability?: string;
  scoutedItem?: string;
  scoutedAbility?: string;
  scoutedTera?: string;
  /** Abilities it may have when none is revealed or scouted (likely-set abilities, else the species'). */
  possibleAbilities: string[];
  /** Likely Tera types for an opposing captain with no Tera seen yet. */
  likelyTera: string[];
  status: string;
  fainted: boolean;
  boosts: [string, number][];
  /** "231/341" for yours, "75%" for theirs. */
  hpText: string;
  hp: number;
  maxhp: number;
  /** Your mon: its four moves (PP for the active). */
  mine?: MoveLine[];
  /** Opposing mon: the three labelled tiers. */
  seen?: MoveLine[];
  scouted?: MoveLine[];
  likely?: MoveLine[];
  speed: SpeedInfo;
  baseStats: StatsTable;
}

const LIKELY_MAX = 8;

function moveLine(name: string, extra?: Partial<MoveLine>): MoveLine {
  const m = dex9.moves.get(name);
  return { name: m.exists ? m.name : name, type: m.exists ? m.type : 'Normal', ...extra };
}

/** Roster id for a mon on the field: exact id, the battle form of a Mega pick, or the same base species. */
export function rosterIdFor(species: string, lineup: readonly SpeciesId[]): SpeciesId | null {
  const shown = dex9.species.get(species.endsWith('-*') ? species.slice(0, -2) : species);
  const id = shown.exists ? shown.id : toID(species);
  return lineup.find((r) => r === id)
    ?? lineup.find((r) => battleSpeciesId(r) === id)
    ?? (shown.exists ? lineup.find((r) => dex9.species.get(r).baseSpecies === shown.baseSpecies) : undefined)
    ?? null;
}

/** The species the mon is right now: the protocol name, or the roster's battle form behind a preview wildcard. */
function currentSpecies(mon: MonView, rosterId: SpeciesId | null): string {
  if (mon.species.endsWith('-*') && rosterId) return dex9.species.get(battleSpeciesId(rosterId)).name;
  return mon.species;
}

function stageMult(stage: number): number {
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
}

interface SpeedMods { stage: number; par: boolean; tailwind: boolean }

function applySpeed(raw: number, mods: SpeedMods): number {
  let v = Math.floor(raw * stageMult(mods.stage));
  if (mods.tailwind) v *= 2;
  if (mods.par) v = Math.floor(v / 2);
  return v;
}

function modsFor(view: FieldView, side: Side, mon: MonView): SpeedMods {
  const active = activeMon(view, side) === mon;
  return {
    stage: active ? mon.boosts.spe ?? 0 : 0,
    par: mon.status === 'par',
    tailwind: (view.sides[side].conditions.Tailwind ?? 0) > 0,
  };
}

function modNotes(mods: SpeedMods, who: string): string[] {
  const out: string[] = [];
  if (mods.stage) out.push(`${mods.stage > 0 ? '+' : ''}${mods.stage} Spe (${who})`);
  if (mods.par) out.push(`paralyzed (${who})`);
  if (mods.tailwind) out.push(`Tailwind (${who})`);
  return out;
}

/** Your request entry for a view mon: by nickname, else by roster id. */
function requestMon(mon: MonView, ctx: MonInfoContext, rosterId: SpeciesId | null): RequestPokemon | undefined {
  const mons = ctx.request?.side.pokemon ?? [];
  return mons.find((p) => !!mon.nick && parseIdent(p.ident)?.name === mon.nick)
    ?? (rosterId ? mons.find((p) => rosterIdFor(parseDetails(p.details).species, ctx.lineups.p1) === rosterId) : undefined);
}

function yourSpeed(view: FieldView, mon: MonView, ctx: MonInfoContext): { value: number; mods: SpeedMods } | null {
  const rid = rosterIdFor(mon.species, ctx.lineups.p1);
  const p = requestMon(mon, ctx, rid);
  if (!p) return null;
  const mods = modsFor(view, 'p1', mon);
  let v = applySpeed(p.stats.spe, mods);
  if (toID(p.item) === 'choicescarf') v = Math.floor(v * 1.5);
  return { value: v, mods };
}

function theirTiers(view: FieldView, mon: MonView, ctx: MonInfoContext): { tiers: Omit<SpeedTier, 'result'>[]; mods: SpeedMods } | null {
  const rid = rosterIdFor(mon.species, ctx.lineups.p2);
  const sp = dex9.species.get(currentSpecies(mon, rid));
  if (!sp.exists) return null;
  const row = speedTierRows([sp.id])[0];
  if (!row) return null;
  const mods = modsFor(view, 'p2', mon);
  const raw: [string, number][] = [['0 EV', row.ev0], ['252', row.ev252], ['252+', row.ev252plus], ['Scarf', row.scarf252plus]];
  return { tiers: raw.map(([label, v]) => ({ label, value: applySpeed(v, mods) })), mods };
}

function compare(yours: number, theirs: number, trickRoom: boolean): SpeedResult {
  if (yours === theirs) return 'tie';
  return (yours > theirs) !== trickRoom ? 'you' : 'them';
}

function speedInfo(view: FieldView, target: MonView, side: Side, ctx: MonInfoContext): SpeedInfo {
  const trickRoom = view.fields.includes('Trick Room');
  const mine = side === 'p1' ? target : activeMon(view, 'p1');
  const foe = side === 'p2' ? target : activeMon(view, 'p2');
  const y = mine ? yourSpeed(view, mine, ctx) : null;
  const t = foe ? theirTiers(view, foe, ctx) : null;
  const notes = [...(y ? modNotes(y.mods, 'you') : []), ...(t ? modNotes(t.mods, 'foe') : [])];
  if (trickRoom) notes.push('Trick Room: slower moves first');
  return {
    yours: mine && y ? { name: displayName(mine.species), value: y.value } : null,
    theirs: foe && t
      ? { name: displayName(foe.species), tiers: t.tiers.map((tier) => ({ ...tier, result: y ? compare(y.value, tier.value, trickRoom) : null })) }
      : null,
    trickRoom,
    notes,
  };
}

function uniq<T>(xs: Iterable<T>): T[] {
  return [...new Set(xs)];
}

export function buildMonInfo(view: FieldView, target: MonTarget, ctx: MonInfoContext): MonInfo | null {
  const mon = view.sides[target.side].team[target.index];
  if (!mon) return null;
  const side = target.side;
  const rosterId = rosterIdFor(mon.species, ctx.lineups[side]);
  const species = currentSpecies(mon, rosterId);
  const sp = dex9.species.get(species);
  const base: MonInfo = {
    side,
    name: displayName(species),
    species,
    types: sp.exists ? [...sp.types] : [],
    tera: mon.tera,
    teraCaptain: !!rosterId && ctx.teraCaptains[side].includes(rosterId),
    item: mon.item,
    itemGone: mon.itemGone,
    ability: mon.ability,
    possibleAbilities: [],
    likelyTera: [],
    status: mon.status,
    fainted: mon.fainted,
    boosts: Object.entries(mon.boosts).filter(([, n]) => n !== 0),
    hpText: '',
    hp: mon.hp,
    maxhp: mon.maxhp,
    speed: speedInfo(view, mon, side, ctx),
    baseStats: sp.exists ? { ...sp.baseStats } : { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  };

  if (side === 'p1') {
    const p = requestMon(mon, ctx, rosterId);
    // Bench HP the view has not seen yet comes from the request (full HP until it switches in: no spoilers).
    if (mon.unseen && p) {
      const c = parseCondition(p.condition);
      if (c) { base.hp = c.hp; base.maxhp = c.maxhp || base.maxhp; base.fainted = c.fainted; base.status = c.status; }
    }
    base.hpText = base.fainted ? 'Fainted' : `${base.hp}/${base.maxhp}`;
    if (p) {
      const item = dex9.items.get(p.item);
      base.item = item.exists ? item.name : undefined;
      base.itemGone = false;
      const ability = dex9.abilities.get(p.ability || p.baseAbility);
      base.ability = ability.exists ? ability.name : mon.ability;
      base.tera = p.terastallized || mon.tera;
      if (base.teraCaptain && !base.tera && p.teraType) base.teraPlan = p.teraType;
      const live = p.active ? ctx.request?.active?.[0]?.moves : undefined;
      base.mine = live
        ? live.map((m) => moveLine(m.move, { pp: m.pp, maxpp: m.maxpp }))
        : p.moves.map((id) => moveLine(id));
    } else {
      base.mine = mon.moves.map((m) => moveLine(m));
    }
    return base;
  }

  base.hpText = base.fainted ? 'Fainted' : `${Math.round((base.hp / (base.maxhp || 100)) * 100)}%`;
  const scout = rosterId ? ctx.scouted[rosterId] : undefined;
  const sets = rosterId ? likelySets(rosterId).roles : [];
  base.scoutedItem = scout?.item;
  base.scoutedAbility = scout?.ability;
  base.scoutedTera = scout?.teraType;
  if (!base.ability && !base.scoutedAbility) {
    const fromSets = uniq(sets.flatMap((r) => r.abilities));
    base.possibleAbilities = fromSets.length ? fromSets : Object.values(sp.abilities).filter((a): a is string => !!a);
  }
  if (base.teraCaptain && !base.tera && !base.scoutedTera) base.likelyTera = uniq(sets.flatMap((r) => r.teraTypes));

  const seen = mon.moves.map((m) => moveLine(m));
  const known = new Set(seen.map((m) => toID(m.name)));
  const scouted = (scout?.moves ?? []).filter((m) => !known.has(toID(m))).map((m) => moveLine(m));
  for (const m of scouted) known.add(toID(m.name));
  const likely = uniq(sets.flatMap((r) => r.movepool)).filter((m) => !known.has(toID(m))).slice(0, LIKELY_MAX).map((m) => moveLine(m));
  base.seen = seen;
  base.scouted = scouted;
  base.likely = likely;
  return base;
}
