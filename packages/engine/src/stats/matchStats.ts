// Per-mon performance in one played match, mined from the stored omniscient protocol log. Pure, browser-safe.
import { Dex } from '@pkmn/dex';
import type { Coach, CoachId, Match, MatchResult, SpeciesId, SpeciesMatchStats } from '../types';
import { canonicalSpeciesId, ofTag, parseCondition, parseIdent, speciesIdFromDetails, splitLine, toID, type SideId } from '../logs/protocol';
import { megaInfo } from '../forms';

const otherSide = (s: SideId): SideId => (s === 'p1' ? 'p2' : 'p1');

function dexBaseId(id: SpeciesId): SpeciesId {
  const s = Dex.species.get(id);
  return s.exists ? toID(s.baseSpecies) : id;
}

/**
 * Maps a species id seen in the protocol onto one of a coach's ROSTER ids: exact id first, then a Mega
 * entry's base species ('charizard' -> 'charizardmegax'), then the Dex base species (team-preview wildcards
 * like 'Urshifu-*', battle-only formes). Undefined when nothing matches.
 */
function folderFor(candidates: readonly SpeciesId[]): (id: SpeciesId) => SpeciesId | undefined {
  const exact = new Set(candidates);
  const byMegaBase = new Map<SpeciesId, SpeciesId>();
  const byDexBase = new Map<SpeciesId, SpeciesId>();
  for (const c of candidates) {
    const mega = megaInfo(c);
    if (mega && !byMegaBase.has(mega.baseId)) byMegaBase.set(mega.baseId, c);
    const b = dexBaseId(c);
    if (!byDexBase.has(b)) byDexBase.set(b, c);
  }
  return (id) => (exact.has(id) ? id : byMegaBase.get(id) ?? byDexBase.get(dexBaseId(id)));
}

/** Species id from a switch line; the nickname is a fallback for species the Dex does not know. */
function idFromSwitch(nick: string, details: string): SpeciesId {
  const name = (details.split(',')[0] ?? '').trim();
  return Dex.species.get(name).exists ? speciesIdFromDetails(details) : canonicalSpeciesId(nick);
}

interface Side {
  coach: CoachId;
  lineup: SpeciesId[];
  candidates: SpeciesId[];
  fold: (id: SpeciesId) => SpeciesId | undefined;
}

interface MonState {
  side: SideId;
  stats: SpeciesMatchStats;
  hp: number;
  maxhp: number;
  /** The foe whose damage took it to 0 (cleared by any later damage that does not). */
  finisher?: MonState;
  /** The last foe that damaged it at all. */
  lastFoeHitter?: MonState;
}

function blank(species: SpeciesId, coach: CoachId, matchId: string, won: boolean, brought: boolean): SpeciesMatchStats {
  return {
    species, coach, matchId, brought, led: false, won, kos: 0, fainted: false,
    damageDealtPct: 0, damageTakenPct: 0, turnsActive: 0, teraUsed: false, megaEvolved: false, zUsed: false,
  };
}

const isSide = (s: string | undefined): s is SideId => s === 'p1' || s === 'p2';

/** Species ids each side showed (team preview + switch-ins), in order. */
function shownBySide(log: readonly string[]): Record<SideId, SpeciesId[]> {
  const out: Record<SideId, SpeciesId[]> = { p1: [], p2: [] };
  for (const line of log) {
    const parts = splitLine(line);
    if (parts[0] === 'poke' && isSide(parts[1]) && parts[2]) {
      out[parts[1]].push(speciesIdFromDetails(parts[2]));
    } else if ((parts[0] === 'switch' || parts[0] === 'drag' || parts[0] === 'replace') && parts[2]) {
      const id = parseIdent(parts[1]);
      if (id) out[id.side].push(idFromSwitch(id.name, parts[2]));
    }
  }
  return out;
}

function playerNames(log: readonly string[]): Partial<Record<SideId, string>> {
  const out: Partial<Record<SideId, string>> = {};
  for (const line of log) {
    const parts = splitLine(line);
    if (parts[0] === 'player' && isSide(parts[1]) && parts[2]) out[parts[1]] = parts[2];
  }
  return out;
}

/**
 * Which coach played p1. AI matches put home on p1, a human's interactive battle puts the human on p1, so it is
 * read from the log: the assignment whose shown species fold onto more of each coach's lineup wins; a tie falls
 * back to the `|player|` names, then to home = p1.
 */
function assignSides(log: readonly string[], home: Side, away: Side, coaches: readonly Coach[]): Record<SideId, Side> {
  const shown = shownBySide(log);
  const hits = (ids: SpeciesId[], s: Side): number => {
    const want = new Set(s.lineup.length ? s.lineup : s.candidates);
    return new Set(ids.map(s.fold).filter((x): x is SpeciesId => !!x && want.has(x))).size;
  };
  const straight = hits(shown.p1, home) + hits(shown.p2, away);
  const swapped = hits(shown.p1, away) + hits(shown.p2, home);
  if (straight !== swapped) return straight > swapped ? { p1: home, p2: away } : { p1: away, p2: home };
  const names = playerNames(log);
  const nameOf = (id: CoachId): string | undefined => coaches.find((c) => c.id === id)?.name;
  if (names.p1 && names.p1 === nameOf(away.coach) && names.p1 !== nameOf(home.coach)) return { p1: away, p2: home };
  return { p1: home, p2: away };
}

function sideFor(coachId: CoachId, result: MatchResult, coaches: readonly Coach[]): Side {
  const lineup = result.lineups[coachId] ?? [];
  const candidates = coaches.find((c) => c.id === coachId)?.roster.map((r) => r.species) ?? [];
  for (const id of lineup) if (!candidates.includes(id)) candidates.push(id);
  return { coach: coachId, lineup, candidates, fold: folderFor(candidates) };
}

/**
 * Every roster mon of both coaches in one played match (left-home mons with brought=false), plus any lineup mon
 * no longer on the roster (free agency). Rules:
 * - Damage is % of the target's max HP removed (heals restore HP, so a mon can take over 100% in a match).
 * - A `|-damage|` line without `[from]` belongs to the user of the most recent `|move|` this turn; one with
 *   `[from]` belongs to its `[of]` mon when present, else to nobody (hazards, weather, status, recoil).
 *   Damage to a mon's own side is never credited as dealt.
 * - A faint is credited to the foe whose damage took it to 0; else to the last foe that damaged it; else to the
 *   foe on the field (self-KOs, hazard chip before any contact). So KOs over both sides equal the faint lines.
 * - turnsActive counts the `|turn|` lines a mon is on the field for.
 */
export function matchSpeciesStats(result: MatchResult, match: Match, coaches: Coach[]): SpeciesMatchStats[] {
  const home = sideFor(match.home, result, coaches);
  const away = sideFor(match.away, result, coaches);
  const sides = assignSides(result.log, home, away, coaches);

  const statsBy = new Map<CoachId, Map<SpeciesId, SpeciesMatchStats>>();
  for (const s of [home, away]) {
    const m = new Map<SpeciesId, SpeciesMatchStats>();
    const won = result.winner === s.coach;
    for (const id of s.candidates) m.set(id, blank(id, s.coach, match.id, won, s.lineup.includes(id)));
    statsBy.set(s.coach, m);
  }

  const mons = new Map<string, MonState>();
  const active: Partial<Record<SideId, MonState>> = {};
  const led: Record<SideId, boolean> = { p1: false, p2: false };
  let lastMover: MonState | undefined;

  const monOf = (ident: string | undefined): MonState | undefined => {
    const id = parseIdent(ident);
    return id ? mons.get(`${id.side}|${id.name}`) : undefined;
  };

  for (const line of result.log) {
    const parts = splitLine(line);
    const cmd = parts[0];
    if (!cmd) continue;
    switch (cmd) {
      case 'switch': case 'drag': case 'replace': {
        const id = parseIdent(parts[1]);
        if (!id || !parts[2]) break;
        const key = `${id.side}|${id.name}`;
        let mon = mons.get(key);
        const cond = parseCondition(parts[3]);
        if (!mon) {
          const side = sides[id.side];
          const raw = idFromSwitch(id.name, parts[2]);
          const species = side.fold(raw) ?? raw;
          const table = statsBy.get(side.coach)!;
          let stats = table.get(species);
          if (!stats) {
            stats = blank(species, side.coach, match.id, result.winner === side.coach, true);
            table.set(species, stats);
          }
          stats.brought = true;
          mon = { side: id.side, stats, hp: cond.hp, maxhp: cond.maxhp };
          mons.set(key, mon);
        } else if (cmd !== 'replace' && parts[3]) {
          mon.hp = cond.fainted ? 0 : cond.hp;
          if (!cond.fainted) mon.maxhp = cond.maxhp;
        }
        if (cmd === 'switch' && !led[id.side]) { led[id.side] = true; mon.stats.led = true; }
        active[id.side] = mon;
        break;
      }
      case 'turn': {
        lastMover = undefined;
        for (const s of ['p1', 'p2'] as const) {
          const m = active[s];
          if (m && m.hp > 0) m.stats.turnsActive++;
        }
        break;
      }
      case 'move': {
        const mon = monOf(parts[1]);
        if (mon) lastMover = mon;
        break;
      }
      case '-damage': {
        const target = monOf(parts[1]);
        if (!target) break;
        const cond = parseCondition(parts[2]);
        const newHp = cond.fainted ? 0 : cond.hp;
        if (!cond.fainted) target.maxhp = cond.maxhp;
        const pct = target.maxhp > 0 ? (Math.max(0, target.hp - newHp) / target.maxhp) * 100 : 0;
        target.hp = newHp;
        target.stats.damageTakenPct += pct;
        const indirect = parts.slice(3).some((p) => p.startsWith('[from]'));
        const src = indirect ? monOf(ofTag(parts)) : lastMover;
        const foe = src && src.side !== target.side ? src : undefined;
        if (foe) {
          foe.stats.damageDealtPct += pct;
          target.lastFoeHitter = foe;
        }
        target.finisher = newHp === 0 ? foe : undefined;
        break;
      }
      case '-heal': case '-sethp': {
        const target = monOf(parts[1]);
        if (!target) break;
        const cond = parseCondition(parts[2]);
        target.hp = cond.fainted ? 0 : cond.hp;
        if (!cond.fainted) target.maxhp = cond.maxhp;
        break;
      }
      case 'faint': {
        const mon = monOf(parts[1]);
        if (!mon) break;
        mon.stats.fainted = true;
        mon.hp = 0;
        const credit = mon.finisher ?? mon.lastFoeHitter ?? active[otherSide(mon.side)];
        if (credit) credit.stats.kos++;
        mon.finisher = undefined;
        break;
      }
      case '-terastallize': { const m = monOf(parts[1]); if (m) m.stats.teraUsed = true; break; }
      case '-mega': { const m = monOf(parts[1]); if (m) m.stats.megaEvolved = true; break; }
      case '-zpower': { const m = monOf(parts[1]); if (m) m.stats.zUsed = true; break; }
    }
  }

  return [...statsBy.get(home.coach)!.values(), ...statsBy.get(away.coach)!.values()];
}
