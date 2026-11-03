// What the battle screen shows, derived from p1-perspective protocol lines. Own HP is exact
// (the p1 stream prints "231/341"), the opponent's is a percent ("75/100").

export type Side = 'p1' | 'p2';

export interface MonView {
  /** Nickname the protocol uses (`p1a: Name`), set once the mon has switched in. */
  nick?: string;
  /** Species name from the details string (formes included). */
  species: string;
  level: number;
  hp: number;
  maxhp: number;
  /** True until the mon has been seen on the field (bench HP unknown). */
  unseen: boolean;
  status: string;
  fainted: boolean;
  tera?: string;
  boosts: Record<string, number>;
  /** Volatile conditions on the mon while it stays in (`TRACKED_VOLATILES`: Substitute, Leech Seed, Taunt…), in the order they began. */
  volatiles: string[];
  /** Moves this mon used this battle, in order of first use (protocol display names; Z-moves left out). */
  moves: string[];
  /** Item revealed this battle (the one it holds now, or the last one it lost when `itemGone`). */
  item?: string;
  itemGone?: boolean;
  /** Ability revealed this battle (the one it has now). */
  ability?: string;
  /** Set by `-zpower`: the next `|move|` is a Z-move and does not name a moveset move. */
  zPowered?: boolean;
}

export interface SideView {
  name: string;
  team: MonView[];
  /** Index into team of the active mon, -1 before the first switch. */
  active: number;
  /** Hazards / screens / Tailwind with their layer count. */
  conditions: Record<string, number>;
}

export interface FieldView {
  sides: Record<Side, SideView>;
  weather: string | null;
  fields: string[];
  turn: number;
  teamPreview: boolean;
  ended: boolean;
  winner: string | null;
}

/** The volatile conditions the view tracks (protocol names, `move:` prefix stripped): the ones the field effects draw. */
export const TRACKED_VOLATILES: readonly string[] = [
  'Substitute', 'Leech Seed', 'confusion', 'Taunt', 'Encore', 'Torment', 'Yawn', 'Curse', 'Ingrain', 'Aqua Ring', 'Attract',
];

export function emptyView(): FieldView {
  const side = (): SideView => ({ name: '', team: [], active: -1, conditions: {} });
  return { sides: { p1: side(), p2: side() }, weather: null, fields: [], turn: 0, teamPreview: false, ended: false, winner: null };
}

export function splitLine(line: string): string[] {
  if (!line.startsWith('|')) return [];
  return line.slice(1).split('|');
}

export function parseIdent(ident: string | undefined): { side: Side; name: string } | null {
  const m = /^(p[12])[a-z]?:\s*(.*)$/.exec(ident ?? '');
  return m ? { side: m[1] as Side, name: m[2]! } : null;
}

export function parseDetails(details: string): { species: string; level: number; tera?: string } {
  const parts = details.split(',').map((p) => p.trim());
  const level = parts.find((p) => /^L\d+$/.test(p));
  const tera = parts.find((p) => p.startsWith('tera:'));
  return { species: parts[0] ?? details, level: level ? Number(level.slice(1)) : 100, tera: tera?.slice(5) };
}

export function parseCondition(cond: string | undefined): { hp: number; maxhp: number; status: string; fainted: boolean } | null {
  if (!cond) return null;
  const [hpPart, status = ''] = cond.trim().split(' ');
  if (!hpPart) return null;
  if (hpPart === '0') return { hp: 0, maxhp: 0, status: '', fainted: true };
  const [hp, max] = hpPart.split('/');
  const h = Number(hp);
  if (!Number.isFinite(h)) return null;
  return { hp: h, maxhp: max ? Number(max) : 100, status: status === 'fnt' ? '' : status, fainted: status === 'fnt' };
}

/** "Urshifu-*" in team preview stands for whichever forme switches in. */
function speciesMatches(preview: string, actual: string): boolean {
  if (preview === actual) return true;
  if (preview.endsWith('-*')) return actual.startsWith(preview.slice(0, -1)) || actual === preview.slice(0, -2);
  return false;
}

function newMon(species: string, level = 100): MonView {
  return { species, level, hp: 100, maxhp: 100, unseen: true, status: '', fainted: false, boosts: {}, volatiles: [], moves: [] };
}

/** The team entry for an ident (+ details when known), created if the mon was never previewed. */
export function monFor(view: FieldView, ident: string | undefined, details?: string): MonView | null {
  const id = parseIdent(ident);
  if (!id) return null;
  const side = view.sides[id.side];
  let mon = side.team.find((m) => m.nick === id.name);
  if (!mon && details) {
    const { species, level } = parseDetails(details);
    mon = side.team.find((m) => !m.nick && speciesMatches(m.species, species))
      ?? side.team.find((m) => !m.nick && m.species.split('-')[0] === species.split('-')[0]);
    if (!mon) { mon = newMon(species, level); side.team.push(mon); }
    mon.nick = id.name;
    mon.species = species;
    mon.level = level;
  }
  if (!mon) {
    mon = side.team.find((m) => !m.nick && m.species === id.name);
    if (!mon) { mon = newMon(id.name); side.team.push(mon); }
    mon.nick = id.name;
  }
  return mon;
}

function setCondition(mon: MonView | null, cond: string | undefined): void {
  const c = parseCondition(cond);
  if (!mon || !c) return;
  mon.unseen = false;
  if (c.fainted) { mon.hp = 0; mon.fainted = true; mon.status = ''; return; }
  mon.hp = c.hp;
  if (c.maxhp) mon.maxhp = c.maxhp;
  mon.status = c.status;
  mon.fainted = false;
}

export function activeMon(view: FieldView, side: Side): MonView | null {
  const s = view.sides[side];
  return s.active >= 0 ? s.team[s.active] ?? null : null;
}

const strip = (effect: string | undefined): string => (effect ?? '').replace(/^(move|ability|item):\s*/, '');

/** The `[from] item: X` / `[from] ability: X` tag of a line, if any. */
function fromTag(parts: string[], kind: 'item' | 'ability'): string | undefined {
  for (const p of parts) {
    const m = /^\[from\]\s*(item|ability):\s*(.+)$/.exec(p);
    if (m && m[1] === kind) return m[2]!.trim();
  }
  return undefined;
}

function ofIdent(parts: string[]): string | undefined {
  const p = parts.find((x) => x.startsWith('[of]'));
  return p?.slice(4).trim();
}

/** Revealed moves, items and abilities: what the hover card shows as "seen this battle". */
function trackReveals(view: FieldView, cmd: string | undefined, parts: string[]): void {
  switch (cmd) {
    case 'move': {
      const from = parts.slice(3).find((p) => p.startsWith('[from]'));
      if (from && !from.includes('lockedmove')) return; // called / reflected / Dancer: not its own move
      const name = parts[2];
      const mon = monFor(view, parts[1]);
      if (!mon || !name || name === 'Struggle' || name === 'Recharge') return;
      if (mon.zPowered) { mon.zPowered = false; return; }
      if (!mon.moves.includes(name)) mon.moves.push(name);
      return;
    }
    case '-zpower': {
      const mon = monFor(view, parts[1]);
      if (mon) mon.zPowered = true;
      return;
    }
    case '-mega': {
      const mon = monFor(view, parts[1]);
      if (mon && parts[3]) { mon.item = parts[3]; mon.itemGone = false; }
      return;
    }
    case '-item': case '-enditem': {
      const mon = monFor(view, parts[1]);
      if (mon && parts[2]) { mon.item = parts[2]; mon.itemGone = cmd === '-enditem'; }
      break; // a [from] ability (Frisk, Pickpocket) still names its owner below
    }
    case '-ability': {
      const mon = monFor(view, parts[1]);
      if (mon && parts[2]) mon.ability = parts[2];
      // Trace: "|-ability|tracer|Intimidate|[from] ability: Trace|[of] target" reveals the target's ability too.
      if (fromTag(parts, 'ability') === 'Trace') {
        const target = monFor(view, ofIdent(parts));
        if (target && parts[2]) target.ability = parts[2];
      }
      return;
    }
    case '-activate': {
      // "|-activate|p2a: X|ability: Protosynthesis" / "|-activate|p2a: X|item: Booster Energy"
      const m = /^(ability|item):\s*(.+)$/.exec(parts[2] ?? '');
      const mon = m ? monFor(view, parts[1]) : null;
      if (mon && m) { if (m[1] === 'ability') mon.ability = m[2]!; else mon.item = m[2]!; }
      break;
    }
  }
  const ability = fromTag(parts, 'ability');
  const item = cmd === '-item' || cmd === '-enditem' ? undefined : fromTag(parts, 'item');
  if (!ability && !item) return;
  const owner = monFor(view, ofIdent(parts) ?? parts[1]);
  if (!owner) return;
  if (ability) owner.ability = ability;
  if (item) { owner.item = item; owner.itemGone = false; }
}

/** Apply one protocol line to the view (mutates). */
export function applyLine(view: FieldView, line: string): void {
  const parts = splitLine(line);
  const cmd = parts[0];
  trackReveals(view, cmd, parts);
  switch (cmd) {
    case 'player': {
      const side = parts[1];
      if ((side === 'p1' || side === 'p2') && parts[2]) view.sides[side].name = parts[2];
      break;
    }
    case 'clearpoke':
      view.sides.p1.team = [];
      view.sides.p2.team = [];
      break;
    case 'poke': {
      const side = parts[1];
      if ((side === 'p1' || side === 'p2') && parts[2]) {
        const { species, level } = parseDetails(parts[2]);
        view.sides[side].team.push(newMon(species, level));
      }
      break;
    }
    case 'teampreview': view.teamPreview = true; break;
    case 'start': view.teamPreview = false; break;
    case 'turn': view.turn = Number(parts[1]) || view.turn; break;
    case 'switch': case 'drag': case 'replace': {
      const id = parseIdent(parts[1]);
      if (!id) break;
      const side = view.sides[id.side];
      const prev = activeMon(view, id.side);
      if (prev && cmd !== 'replace') { prev.boosts = {}; prev.volatiles = []; }
      const mon = monFor(view, parts[1], parts[2]);
      if (!mon) break;
      const tera = parts[2] ? parseDetails(parts[2]).tera : undefined;
      if (tera) mon.tera = tera;
      setCondition(mon, parts[3]);
      side.active = side.team.indexOf(mon);
      break;
    }
    case 'detailschange': case '-formechange': {
      const mon = monFor(view, parts[1]);
      if (mon && parts[2]) mon.species = parseDetails(parts[2]).species;
      break;
    }
    case '-damage': case '-heal': case '-sethp':
      setCondition(monFor(view, parts[1]), parts[2]);
      break;
    case 'faint': {
      const mon = monFor(view, parts[1]);
      if (mon) { mon.hp = 0; mon.fainted = true; mon.status = ''; mon.boosts = {}; mon.volatiles = []; }
      break;
    }
    case '-start': case '-end': {
      const name = strip(parts[2]);
      const mon = TRACKED_VOLATILES.includes(name) ? monFor(view, parts[1]) : null;
      if (!mon) break;
      mon.volatiles = mon.volatiles.filter((v) => v !== name);
      if (cmd === '-start') mon.volatiles.push(name);
      break;
    }
    case '-status': {
      const mon = monFor(view, parts[1]);
      if (mon && parts[2]) mon.status = parts[2];
      break;
    }
    case '-curestatus': {
      const mon = monFor(view, parts[1]);
      if (mon) mon.status = '';
      break;
    }
    case '-cureteam': {
      const id = parseIdent(parts[1]);
      if (id) for (const m of view.sides[id.side].team) m.status = '';
      break;
    }
    case '-boost': case '-unboost': {
      const mon = monFor(view, parts[1]);
      const stat = parts[2];
      const n = Number(parts[3]) || 0;
      if (mon && stat) mon.boosts[stat] = Math.max(-6, Math.min(6, (mon.boosts[stat] ?? 0) + (cmd === '-boost' ? n : -n)));
      break;
    }
    case '-setboost': {
      const mon = monFor(view, parts[1]);
      if (mon && parts[2]) mon.boosts[parts[2]] = Number(parts[3]) || 0;
      break;
    }
    case '-clearboost': {
      const mon = monFor(view, parts[1]);
      if (mon) mon.boosts = {};
      break;
    }
    case '-clearallboost':
      for (const s of ['p1', 'p2'] as const) { const m = activeMon(view, s); if (m) m.boosts = {}; }
      break;
    case '-clearnegativeboost': {
      const mon = monFor(view, parts[1]);
      if (mon) for (const k of Object.keys(mon.boosts)) if ((mon.boosts[k] ?? 0) < 0) delete mon.boosts[k];
      break;
    }
    case '-invertboost': {
      const mon = monFor(view, parts[1]);
      if (mon) for (const k of Object.keys(mon.boosts)) mon.boosts[k] = -(mon.boosts[k] ?? 0);
      break;
    }
    case '-copyboost': {
      const a = monFor(view, parts[1]);
      const b = monFor(view, parts[2]);
      if (a && b) a.boosts = { ...b.boosts };
      break;
    }
    case '-terastallize': {
      const mon = monFor(view, parts[1]);
      if (mon && parts[2]) mon.tera = parts[2];
      break;
    }
    case '-weather':
      if (!parts.includes('[upkeep]')) view.weather = parts[1] && parts[1] !== 'none' ? parts[1] : null;
      break;
    case '-fieldstart': {
      const f = strip(parts[1]);
      if (f && !view.fields.includes(f)) view.fields = [...view.fields.filter((x) => !(x.endsWith('Terrain') && f.endsWith('Terrain'))), f];
      break;
    }
    case '-fieldend': {
      const f = strip(parts[1]);
      view.fields = view.fields.filter((x) => x !== f);
      break;
    }
    case '-sidestart': case '-sideend': {
      const side = parts[1]?.slice(0, 2);
      const cond = strip(parts[2]);
      if ((side === 'p1' || side === 'p2') && cond) {
        const conds = view.sides[side].conditions;
        if (cmd === '-sidestart') conds[cond] = (conds[cond] ?? 0) + 1;
        else delete conds[cond];
      }
      break;
    }
    case 'win': view.ended = true; view.winner = parts[1] ?? null; break;
    case 'tie': view.ended = true; view.winner = null; break;
  }
}

export const STAT_SHORT: Record<string, string> = {
  atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe', accuracy: 'Acc', evasion: 'Eva',
};

/** What BattleScreen renders: the field after the narrated lines, plus the dialogue sentence. */
export interface BattleViewState {
  view: FieldView;
  /** Protocol lines applied (narrated) so far. */
  shown: number;
  /** Current dialogue sentence. */
  say: string;
}

export type BattleViewAction =
  /** Apply the next lines; `say` replaces the dialogue sentence when given. */
  | { type: 'advance'; lines: readonly string[]; say?: string };

export function initialBattleView(say: string): BattleViewState {
  return { view: emptyView(), shown: 0, say };
}

export function battleViewReducer(state: BattleViewState, action: BattleViewAction): BattleViewState {
  switch (action.type) {
    case 'advance': {
      if (!action.lines.length) return state;
      const view = structuredClone(state.view);
      for (const line of action.lines) applyLine(view, line);
      return { view, shown: state.shown + action.lines.length, say: action.say ?? state.say };
    }
  }
}
