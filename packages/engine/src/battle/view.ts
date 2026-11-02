// Incremental battle state as one side sees it, rebuilt from that side's protocol lines.
import { Dex } from '@pkmn/sim';
import type { SpeciesId } from '../types';
import { fromTag, hasFromMove, ofTag, parseCondition, parseIdent, speciesIdFromDetails, speciesNameFromDetails, splitLine, toID, type SideId } from '../logs/protocol';

export interface MonView {
  name: string;          // nickname as in the ident
  speciesId: SpeciesId;
  forme: string;         // current species/forme display name (for calc)
  hpPct: number;         // 0-100
  status: string;
  fainted: boolean;
  item?: string;         // current item ('' = known to have none)
  ability?: string;
  teraType?: string;     // set once terastallized
  moves: Set<string>;    // revealed move ids
}

export interface SideView {
  active?: string;       // nickname of the active mon
  mons: Map<string, MonView>;
  boosts: Record<string, number>;
  volatiles: Set<string>;
  conditions: Map<string, number>; // stealthrock / spikes / toxicspikes / stickyweb / reflect / lightscreen / auroraveil
  turnsActive: number;
  lastMove?: string;
  preview: SpeciesId[];
}

export interface BattleView {
  turn: number;
  weather: string;
  terrain: string;
  trickRoom: boolean;
  sides: Record<SideId, SideView>;
}

function emptySide(): SideView {
  return { mons: new Map(), boosts: {}, volatiles: new Set(), conditions: new Map(), turnsActive: 0, preview: [] };
}

interface Tracker {
  view: BattleView;
  consumed: number;
}

const trackers = new WeakMap<string[], Tracker>();

/** Current view of the battle for a log array; parses only lines added since the last call. */
export function viewOf(log: string[]): BattleView {
  let t = trackers.get(log);
  if (!t) {
    t = { view: { turn: 0, weather: '', terrain: '', trickRoom: false, sides: { p1: emptySide(), p2: emptySide() } }, consumed: 0 };
    trackers.set(log, t);
  }
  while (t.consumed < log.length) {
    applyLine(t.view, log[t.consumed] ?? '');
    t.consumed++;
  }
  return t.view;
}

function monFor(view: BattleView, ident: string | undefined): MonView | undefined {
  const id = parseIdent(ident);
  if (!id) return undefined;
  return view.sides[id.side].mons.get(id.name);
}

function ensureMon(side: SideView, name: string, details: string): MonView {
  let m = side.mons.get(name);
  if (!m) {
    m = { name, speciesId: speciesIdFromDetails(details), forme: speciesNameFromDetails(details), hpPct: 100, status: '', fainted: false, moves: new Set() };
    side.mons.set(name, m);
  }
  return m;
}

function setHp(m: MonView | undefined, cond: string | undefined) {
  if (!m || !cond) return;
  const c = parseCondition(cond);
  m.fainted = c.fainted;
  m.hpPct = c.fainted ? 0 : Math.max(0, Math.min(100, (c.hp / c.maxhp) * 100));
  m.status = c.fainted ? '' : c.status;
}

const WEATHER: Record<string, string> = {
  sunnyday: 'Sun', raindance: 'Rain', sandstorm: 'Sand', snow: 'Snow', snowscape: 'Snow', hail: 'Snow',
  desolateland: 'Harsh Sunshine', primordialsea: 'Heavy Rain', deltastream: 'Strong Winds',
};

function applyLine(view: BattleView, line: string) {
  const parts = splitLine(line);
  const cmd = parts[0];
  if (!cmd) return;
  // Item / ability reveals carried on any line.
  const fromItem = fromTag(parts, 'item');
  const fromAbility = fromTag(parts, 'ability');
  if ((fromItem || fromAbility) && cmd !== '-item' && cmd !== '-enditem' && cmd !== '-ability') {
    const owner = monFor(view, ofTag(parts) ?? parts[1]);
    if (owner && fromItem) owner.item = fromItem;
    if (owner && fromAbility) owner.ability = fromAbility;
  }
  switch (cmd) {
    case 'turn': {
      view.turn = Number(parts[1]) || view.turn;
      for (const s of Object.values(view.sides)) if (s.active) s.turnsActive++;
      break;
    }
    case 'poke': {
      const side = parts[1] as SideId;
      if ((side === 'p1' || side === 'p2') && parts[2]) view.sides[side].preview.push(speciesIdFromDetails(parts[2]));
      break;
    }
    case 'switch': case 'drag': case 'replace': {
      const id = parseIdent(parts[1]);
      if (!id || !parts[2]) break;
      const side = view.sides[id.side];
      const m = ensureMon(side, id.name, parts[2]);
      m.forme = speciesNameFromDetails(parts[2]);
      if (cmd !== 'replace') {
        side.active = id.name;
        side.boosts = {};
        side.volatiles = new Set();
        side.turnsActive = 0;
        side.lastMove = undefined;
      } else {
        m.speciesId = speciesIdFromDetails(parts[2]);
        side.active = id.name;
      }
      setHp(m, parts[3]);
      break;
    }
    case 'detailschange': case '-formechange': {
      const m = monFor(view, parts[1]);
      if (m && parts[2]) {
        m.forme = speciesNameFromDetails(parts[2]);
        // A Mega's ability replaces the base form's (Megas have exactly one).
        const sp = Dex.species.get(m.forme);
        if (cmd === 'detailschange' && sp.exists && sp.isMega) m.ability = sp.abilities[0];
      }
      break;
    }
    case '-mega': {
      const m = monFor(view, parts[1]);
      if (m && parts[3]) m.item = parts[3];
      break;
    }
    case '-damage': case '-heal': case '-sethp': setHp(monFor(view, parts[1]), parts[2]); break;
    case 'faint': { const m = monFor(view, parts[1]); if (m) { m.fainted = true; m.hpPct = 0; } break; }
    case '-status': { const m = monFor(view, parts[1]); if (m && parts[2]) m.status = parts[2]; break; }
    case '-curestatus': { const m = monFor(view, parts[1]); if (m) m.status = ''; break; }
    case '-cureteam': { const id = parseIdent(parts[1]); if (id) for (const m of view.sides[id.side].mons.values()) m.status = ''; break; }
    case '-boost': case '-unboost': {
      const id = parseIdent(parts[1]);
      if (!id || !parts[2]) break;
      const b = view.sides[id.side].boosts;
      const n = Number(parts[3]) || 0;
      b[parts[2]] = Math.max(-6, Math.min(6, (b[parts[2]] ?? 0) + (cmd === '-boost' ? n : -n)));
      break;
    }
    case '-setboost': { const id = parseIdent(parts[1]); if (id && parts[2]) view.sides[id.side].boosts[parts[2]] = Number(parts[3]) || 0; break; }
    case '-clearboost': { const id = parseIdent(parts[1]); if (id) view.sides[id.side].boosts = {}; break; }
    case '-clearallboost': view.sides.p1.boosts = {}; view.sides.p2.boosts = {}; break;
    case '-clearnegativeboost': {
      const id = parseIdent(parts[1]);
      if (id) { const b = view.sides[id.side].boosts; for (const k of Object.keys(b)) if ((b[k] ?? 0) < 0) b[k] = 0; }
      break;
    }
    case 'move': {
      const id = parseIdent(parts[1]);
      const m = monFor(view, parts[1]);
      if (id && parts[2]) {
        const mid = toID(parts[2]);
        view.sides[id.side].lastMove = mid;
        // A Z-move is not one of the set's moves (its base move stays unrevealed).
        if (m && !Dex.moves.get(mid).isZ && !parts.slice(3).some(p => p.startsWith('[from]') && !p.includes('lockedmove'))) m.moves.add(mid);
      }
      break;
    }
    case '-item': {
      const m = monFor(view, parts[1]);
      if (m && parts[2]) m.item = parts[2];
      break;
    }
    case '-enditem': {
      const m = monFor(view, parts[1]);
      if (m) m.item = '';
      break;
    }
    case '-ability': {
      const m = monFor(view, parts[1]);
      if (m && parts[2] && !hasFromMove(parts)) {
        if (fromAbility === 'Trace') {
          m.ability = parts[2];
          const of = monFor(view, ofTag(parts));
          if (of) of.ability = parts[2];
        } else m.ability = parts[2];
      }
      break;
    }
    case '-terastallize': {
      const m = monFor(view, parts[1]);
      if (m && parts[2]) m.teraType = parts[2];
      break;
    }
    case '-start': {
      const id = parseIdent(parts[1]);
      if (id && parts[2]) view.sides[id.side].volatiles.add(toID(parts[2].replace(/^move: /, '')));
      break;
    }
    case '-end': {
      const id = parseIdent(parts[1]);
      if (id && parts[2]) view.sides[id.side].volatiles.delete(toID(parts[2].replace(/^move: /, '')));
      break;
    }
    case '-sidestart': case '-sideend': {
      const side = (parts[1] ?? '').slice(0, 2) as SideId;
      if (side !== 'p1' && side !== 'p2') break;
      const cond = toID((parts[2] ?? '').replace(/^move: /, ''));
      const c = view.sides[side].conditions;
      if (cmd === '-sidestart') c.set(cond, (c.get(cond) ?? 0) + 1);
      else c.delete(cond);
      break;
    }
    case '-weather': {
      const w = toID(parts[1] ?? '');
      view.weather = w === 'none' ? '' : (WEATHER[w] ?? view.weather);
      break;
    }
    case '-fieldstart': case '-fieldend': {
      const f = (parts[1] ?? '').replace(/^move: /, '');
      if (f === 'Trick Room') view.trickRoom = cmd === '-fieldstart';
      if (/Terrain$/.test(f)) view.terrain = cmd === '-fieldstart' ? f.replace(/ Terrain$/, '') : '';
      break;
    }
  }
}

/** Types of a mon in the view (tera replaces them). */
export function viewTypes(m: MonView): string[] {
  if (m.teraType && m.teraType !== 'Stellar') return [m.teraType];
  const s = Dex.species.get(m.forme);
  return s.exists ? s.types.slice() : Dex.species.get(m.speciesId).types.slice();
}
