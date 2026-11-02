// What a coach has shown in past battles: moves, items, abilities, tera, leads and who they brought.
import { Dex } from '@pkmn/dex';
import type { CoachId, RosterEntry, ScoutedMon, ScoutReport, SpeciesId } from '../types';
import { canonicalSpeciesId, fromTag, hasFromMove, ofTag, parseIdent, speciesIdFromDetails, speciesNameFromDetails, splitLine, type SideId } from './protocol';
import { megaInfo, Z_CRYSTAL_BY_TYPE } from '../forms';

export interface ScoutLog {
  log: readonly string[];
  /** Which side the scouted coach played in that battle. */
  coachSide: SideId;
}

function baseOf(id: SpeciesId): string {
  const s = Dex.species.get(id);
  return s.exists ? s.baseSpecies : id;
}

/**
 * Roster id for a mon on the field, from its details. The ident nickname is unreliable for formes:
 * a set named 'Giratina-Origin' shows up as 'p1a: Giratina'.
 */
function idFromSwitch(nick: string, details: string): SpeciesId {
  const shown = Dex.species.get(speciesNameFromDetails(details));
  return shown.exists ? speciesIdFromDetails(details) : canonicalSpeciesId(nick);
}

interface Seen {
  moves: string[];
  item?: string;
  ability?: string;
  teraType?: string;
}

/** Everything the given side revealed in one battle log. */
function scoutOne(log: readonly string[], side: SideId): { brought: SpeciesId[]; lead?: SpeciesId; seen: Map<SpeciesId, Seen> } {
  const nickToId = new Map<string, SpeciesId>();
  const preview: SpeciesId[] = [];
  const byBase = new Map<string, SpeciesId>();
  const seen = new Map<SpeciesId, Seen>();
  let lead: SpeciesId | undefined;
  /** Mons whose next move is a Z-move (after `|-zpower|`). */
  const zPowered = new Set<Seen>();

  const monOf = (ident: string | undefined): Seen | undefined => {
    const id = parseIdent(ident);
    if (!id || id.side !== side) return undefined;
    const sid = nickToId.get(id.name) ?? canonicalSpeciesId(id.name);
    let s = seen.get(sid);
    if (!s) { s = { moves: [] }; seen.set(sid, s); }
    return s;
  };

  for (const line of log) {
    const parts = splitLine(line);
    const cmd = parts[0];
    if (!cmd) continue;
    switch (cmd) {
      case 'poke':
        if (parts[1] === side && parts[2]) preview.push(speciesIdFromDetails(parts[2]));
        break;
      case 'switch': case 'drag': case 'replace': {
        const id = parseIdent(parts[1]);
        if (!id || id.side !== side || !parts[2]) break;
        if (!nickToId.has(id.name)) {
          const sid = idFromSwitch(id.name, parts[2]);
          nickToId.set(id.name, sid);
          byBase.set(baseOf(sid), sid);
        }
        if (cmd === 'switch' && !lead) lead = nickToId.get(id.name);
        break;
      }
      case 'move': {
        const from = parts.slice(3).find(p => p.startsWith('[from]'));
        if (from && !from.includes('lockedmove')) break;
        const name = parts[2];
        if (!name || name === 'Struggle' || name === 'Recharge') break;
        const s = monOf(parts[1]);
        if (!s) break;
        const dm = Dex.moves.get(name);
        if (zPowered.has(s)) {
          // The Z-move reveals a type Z-Crystal of its type (a status Z-move prints the base move's name).
          zPowered.delete(s);
          const crystal = dm.exists ? Z_CRYSTAL_BY_TYPE[dm.type] : undefined;
          if (crystal && s.item === undefined) s.item = crystal;
        }
        if (dm.exists && dm.isZ) break;
        if (!s.moves.includes(name)) s.moves.push(name);
        break;
      }
      case '-zpower': {
        const s = monOf(parts[1]);
        if (s) zPowered.add(s);
        break;
      }
      case '-mega': {
        const s = monOf(parts[1]);
        if (s && parts[3] && s.item === undefined) s.item = parts[3];
        break;
      }
      case '-item': {
        if (hasFromMove(parts)) break; // Trick / Switcheroo / Thief: not the original item
        const s = monOf(parts[1]);
        if (s && parts[2] && s.item === undefined) s.item = parts[2];
        break;
      }
      case '-enditem': {
        const s = monOf(parts[1]);
        if (s && parts[2] && s.item === undefined) s.item = parts[2];
        break;
      }
      case '-ability': {
        if (hasFromMove(parts) || !parts[2]) break;
        const fromAbility = fromTag(parts, 'ability');
        if (fromAbility === 'Trace') {
          const tracer = monOf(parts[1]);
          if (tracer && tracer.ability === undefined) tracer.ability = 'Trace';
          const traced = monOf(ofTag(parts));
          if (traced && traced.ability === undefined) traced.ability = parts[2];
        } else {
          const s = monOf(parts[1]);
          if (s && s.ability === undefined) s.ability = parts[2];
        }
        break;
      }
      case '-terastallize': {
        const s = monOf(parts[1]);
        if (s && parts[2]) s.teraType = parts[2];
        break;
      }
    }
    // Item / ability named on any other line: owned by the [of] mon when present, else by the subject.
    if (cmd !== '-item' && cmd !== '-enditem' && cmd !== '-ability') {
      const item = fromTag(parts, 'item');
      const ability = fromTag(parts, 'ability');
      if (item || ability) {
        const s = monOf(ofTag(parts) ?? parts[1]);
        if (s && item && s.item === undefined) s.item = item;
        if (s && ability && s.ability === undefined) s.ability = ability;
      }
    }
  }
  // Team preview hides some formes (`Urshifu-*`): resolve them through the switch-ins.
  const brought = preview.map(p => byBase.get(baseOf(p)) ?? p);
  for (const sid of nickToId.values()) if (!brought.includes(sid)) brought.push(sid);
  return { brought, lead, seen };
}

/** Folds battle species ids onto roster ids: a Mega entry's base id ('charizard') becomes the Mega id ('charizardmegax'). */
function rosterFolder(roster: readonly RosterEntry[] | undefined): (id: SpeciesId) => SpeciesId {
  if (!roster?.length) return id => id;
  const ids = new Set(roster.map(r => r.species));
  const byBase = new Map<SpeciesId, SpeciesId>();
  for (const r of roster) {
    const mega = megaInfo(r.species);
    if (mega) byBase.set(mega.baseId, r.species);
  }
  return id => (ids.has(id) ? id : byBase.get(id) ?? byBase.get(canonicalSpeciesId(id)) ?? id);
}

/**
 * Merge what a coach revealed across battle logs into a scouting report. First-seen item/ability/tera wins.
 * With the coach's `roster`, ids are folded onto roster ids (a Mega shows as its base species until it evolves).
 * A Mega's stone is recorded as its item; a Z-move records its type Z-Crystal when the item is still unknown.
 */
export function scoutFromLogs(coach: CoachId, logs: readonly ScoutLog[], roster?: readonly RosterEntry[]): ScoutReport {
  const bySpecies: Record<SpeciesId, ScoutedMon> = {};
  const fold = rosterFolder(roster);
  const entry = (raw: SpeciesId): ScoutedMon => (bySpecies[fold(raw)] ??= { moves: [], timesBrought: 0, timesLed: 0 });
  for (const { log, coachSide } of logs) {
    const one = scoutOne(log, coachSide);
    for (const id of new Set(one.brought.map(fold))) entry(id).timesBrought++;
    if (one.lead) entry(one.lead).timesLed++;
    for (const [id, s] of one.seen) {
      const e = entry(id);
      for (const m of s.moves) if (!e.moves.includes(m)) e.moves.push(m);
      if (e.item === undefined && s.item) e.item = s.item;
      if (e.ability === undefined && s.ability) e.ability = s.ability;
      if (e.teraType === undefined && s.teraType) e.teraType = s.teraType;
    }
  }
  return { coach, matchesScouted: logs.length, bySpecies };
}
