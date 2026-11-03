// Protocol lines -> words. `narrate` turns one line into the plain sentence for the dialogue box
// ("Great Tusk used Headlong Rush!"); `parseLog` turns the whole log into typed Showdown-style entries for
// the battle log panel (turn headers, move lines, "(X lost 43% of its health!)" sub-lines, pills).
// Both share one phrasing table. Pure: no React, no DOM; MatchResult.log stays raw protocol.
import { Dex } from '@pkmn/dex';
import { displayName } from '../game/names';
import { parseCondition, parseIdent, splitLine, type Side } from './battleView';
import { conditionName } from './conditions';

export interface Narration {
  text: string;
  kind: 'say' | 'turn' | 'end';
}

export interface NarrateContext {
  /** Opponent coach name, for "X sent out Y!". */
  oppName: string;
  /**
   * Protocol nickname -> roster display name per side. The sim names a Mega pick by its base species until it
   * Mega Evolves; the roster calls it "Mega Charizard X" throughout.
   */
  names?: Partial<Record<Side, Record<string, string>>>;
}

const dex = Dex.forGen(9);

// Sentences are built with inline markers so the dialogue can flatten them to plain text while the log keeps
// Pokemon names (with their side) and move names as separate bold segments.
const MON_OPEN = '\u0001';
const MON_CLOSE = '\u0002';
const BOLD_OPEN = '\u0003';
const BOLD_CLOSE = '\u0004';
const bold = (s: string | undefined): string => `${BOLD_OPEN}${s ?? ''}${BOLD_CLOSE}`;
const flatten = (s: string): string => s.replace(/\u0001p[12]/g, '').replace(/[\u0002-\u0004]/g, '');

const STAT_NAME: Record<string, string> = {
  atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed', accuracy: 'accuracy', evasion: 'evasiveness',
};

const strip = (effect: string | undefined): string => (effect ?? '').replace(/^(move|ability|item):\s*/, '');

/** Display name for an effect the protocol may give as an id ("RainDance" -> "Rain Dance", "leftovers" -> "Leftovers"). */
function pretty(name: string): string {
  if (!name || /\s/.test(name)) return name;
  for (const table of [dex.moves, dex.abilities, dex.items, dex.species] as const) {
    const e = table.get(name);
    if (e.exists) return e.name;
  }
  return name.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function tag(parts: string[], key: 'from' | 'of'): string | undefined {
  const p = parts.find((x) => x.startsWith(`[${key}]`));
  return p ? p.slice(key.length + 2).trim() : undefined;
}

/**
 * "Garchomp" for your side, "the opposing Garchomp" for theirs (name marked with its side). With a context the
 * nickname becomes the roster's display name (a Mega pick by its Mega name); without one it stays as printed.
 */
function who(ident: string | undefined, ctx?: NarrateContext): string {
  const id = parseIdent(ident);
  if (!id) return 'the Pokemon';
  const name = `${MON_OPEN}${id.side}${ctx?.names?.[id.side]?.[id.name] ?? id.name}${MON_CLOSE}`;
  return id.side === 'p1' ? name : `the opposing ${name}`;
}

function team(sideIdent: string | undefined): string {
  return sideIdent?.startsWith('p1') ? 'your team' : 'the opposing team';
}

const cap = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

function boostText(x: string, stat: string, n: number, up: boolean): string {
  const s = STAT_NAME[stat] ?? stat;
  if (n === 0) return `${x}'s ${s} won't go any ${up ? 'higher' : 'lower'}!`;
  const how = up ? (n >= 3 ? 'rose drastically' : n === 2 ? 'rose sharply' : 'rose') : (n >= 3 ? 'severely fell' : n === 2 ? 'harshly fell' : 'fell');
  return `${x}'s ${s} ${how}!`;
}

const STATUS_START: Record<string, string> = {
  brn: '{x} was burned!', par: '{x} is paralyzed! It may be unable to move!', slp: '{x} fell asleep!',
  psn: '{x} was poisoned!', tox: '{x} was badly poisoned!', frz: '{x} was frozen solid!',
};
const STATUS_BY_ITEM: Record<string, string> = {
  brn: '{x} was burned by the {i}!', tox: '{x} was badly poisoned by the {i}!', psn: '{x} was poisoned by the {i}!',
};
const STATUS_CURE: Record<string, string> = {
  brn: "{x}'s burn was healed.", par: '{x} was cured of paralysis.', slp: '{x} woke up!',
  psn: '{x} was cured of its poisoning.', tox: '{x} was cured of its poisoning.', frz: '{x} thawed out!',
};

const WEATHER_START: Record<string, string> = {
  RainDance: 'It started to rain!', SunnyDay: 'The sunlight turned harsh!', Sandstorm: 'A sandstorm kicked up!',
  Snow: 'It started to snow!', Snowscape: 'It started to snow!', Hail: 'It started to hail!',
  DesolateLand: 'The sunlight turned extremely harsh!', PrimordialSea: 'A heavy rain began to fall!',
  DeltaStream: 'Mysterious strong winds are protecting Flying-type Pokemon!',
};
const WEATHER_UPKEEP: Record<string, string> = {
  RainDance: 'Rain continues to fall.', SunnyDay: 'The sunlight is strong.', Sandstorm: 'The sandstorm is raging.',
  Snow: 'Snow continues to fall.', Snowscape: 'Snow continues to fall.', Hail: 'Hail continues to fall.',
};
const WEATHER_END: Record<string, string> = {
  RainDance: 'The rain stopped.', SunnyDay: 'The harsh sunlight faded.', Sandstorm: 'The sandstorm subsided.',
  Snow: 'The snow stopped.', Snowscape: 'The snow stopped.', Hail: 'The hail stopped.',
  DesolateLand: 'The extremely harsh sunlight faded!', PrimordialSea: 'The heavy rain has lifted!',
  DeltaStream: 'The mysterious strong winds have dissipated!',
};

const FIELD_START: Record<string, string> = {
  'Electric Terrain': 'An electric current ran across the battlefield!',
  'Grassy Terrain': 'Grass grew to cover the battlefield!',
  'Misty Terrain': 'Mist swirled around the battlefield!',
  'Psychic Terrain': 'The battlefield got weird!',
  'Trick Room': 'The dimensions were twisted!',
  Gravity: 'Gravity intensified!',
};

const SIDE_START: Record<string, string> = {
  'Stealth Rock': 'Pointed stones float in the air around {t}!',
  Spikes: 'Spikes were scattered on the ground all around {t}!',
  'Toxic Spikes': 'Poison spikes were scattered on the ground all around {t}!',
  'Sticky Web': 'A sticky web has been laid out on the ground around {t}!',
  Reflect: 'Reflect made {t} stronger against physical moves!',
  'Light Screen': 'Light Screen made {t} stronger against special moves!',
  'Aurora Veil': 'Aurora Veil made {t} stronger against physical and special moves!',
  Tailwind: 'The Tailwind blew from behind {t}!',
  Safeguard: '{t} cloaked itself in a mystical veil!',
};
const HAZARDS = new Set(['Stealth Rock', 'Spikes', 'Toxic Spikes', 'Sticky Web']);
const PROTECTS = new Set(['Protect', 'Detect', "King's Shield", 'Spiky Shield', 'Baneful Bunker', 'Silk Trap', 'Burning Bulwark', 'Obstruct']);

function damageFrom(x: string, from: string, of: string | undefined, ctx: NarrateContext): string {
  const effect = strip(from);
  switch (effect) {
    case 'brn': return `${x} was hurt by its burn!`;
    case 'psn': case 'tox': return `${x} was hurt by poison!`;
    case 'Stealth Rock': return `Pointed stones dug into ${x}!`;
    case 'Spikes': return `${x} was hurt by the spikes!`;
    case 'Sandstorm': return `${x} is buffeted by the sandstorm!`;
    case 'Hail': return `${x} is buffeted by the hail!`;
    case 'Life Orb': return `${x} lost some of its HP!`;
    case 'Recoil': case 'recoil': return `${x} was damaged by the recoil!`;
    case 'confusion': return 'It hurt itself in its confusion!';
    case 'Leech Seed': return `${x}'s health is sapped by Leech Seed!`;
    case 'Salt Cure': return `${x} is hurt by Salt Cure!`;
    case 'Curse': return `${x} is afflicted by the curse!`;
    case 'Nightmare': return `${x} is locked in a nightmare!`;
    default:
      if (of && (from.startsWith('ability:') || from.startsWith('item:'))) return `${x} was hurt by ${who(of, ctx)}'s ${pretty(effect)}!`;
      return `${x} was hurt by ${pretty(effect)}!`;
  }
}

function healFrom(x: string, from: string | undefined, of: string | undefined, ctx: NarrateContext): string {
  if (!from) return `${x} had its HP restored.`;
  const effect = strip(from);
  if (effect === 'drain') return `${of ? who(of, ctx) : 'The target'} had its energy drained!`;
  if (from.startsWith('item:')) return `${x} restored a little HP using its ${effect}!`;
  if (from.startsWith('ability:')) return `${x} restored HP using its ${effect}!`;
  return `${x} had its HP restored.`;
}

/** "Charizard" + "Charizardite X" -> "Charizard-Mega-X" (from the stone's dex entry). */
function megaForm(base: string, stone: string): string {
  const forms = dex.items.get(stone).megaStone as Record<string, string> | undefined;
  return (forms ? forms[base] ?? Object.values(forms)[0] : undefined) ?? `${base}-Mega`;
}

/** The sentence for one line with name/bold markers, or null when nothing worth saying happened. */
function describe(line: string, ctx: NarrateContext): Narration | null {
  const parts = splitLine(line);
  const cmd = parts[0];
  if (!cmd) return null;
  const say = (text: string): Narration => ({ text: cap(text), kind: 'say' });
  const x = who(parts[1], ctx);
  const from = tag(parts, 'from');
  const of = tag(parts, 'of');
  if (parts.includes('[silent]')) return null;
  switch (cmd) {
    case 'teampreview': return say(`${ctx.oppName} wants to battle! Choose your lead.`);
    case 'turn': return { text: `Turn ${parts[1]}`, kind: 'turn' };
    case 'win': return { text: `${bold(parts[1])} won the battle!`, kind: 'end' };
    case 'tie': return { text: 'The battle ended in a draw!', kind: 'end' };
    case 'switch': {
      const name = parseIdent(parts[1]) ? who(parts[1], ctx).replace('the opposing ', '') : 'the Pokemon';
      return say(parts[1]?.startsWith('p1') ? `Go! ${name}!` : `${ctx.oppName} sent out ${name}!`);
    }
    case 'drag': return say(`${x} was dragged out!`);
    case 'move': return say(`${x} used ${bold(parts[2])}!`);
    case 'faint': return say(`${x} fainted!`);
    case 'cant': {
      const why = strip(parts[2]);
      switch (why) {
        case 'slp': return say(`${x} is fast asleep.`);
        case 'par': return say(`${x} is paralyzed! It can't move!`);
        case 'frz': return say(`${x} is frozen solid!`);
        case 'flinch': return say(`${x} flinched and couldn't move!`);
        case 'recharge': return say(`${x} must recharge!`);
        case 'Taunt': return say(`${x} can't use ${parts[3] ?? 'that move'} after the taunt!`);
        case 'Disable': return say(`${x}'s ${parts[3] ?? 'move'} is disabled!`);
        case 'nopp': return say(`${x} has no PP left for ${parts[3] ?? 'that move'}!`);
        case 'Truant': return say(`${x} is loafing around!`);
        default: return say(`${x} can't move!`);
      }
    }
    case '-damage': return from ? say(damageFrom(x, from, of, ctx)) : null;
    case '-heal': return say(healFrom(x, from, of, ctx));
    case '-status': {
      const s = parts[2] ?? '';
      if (s === 'slp' && from === 'move: Rest') return say(`${x} slept and became healthy!`);
      const byItem = from?.startsWith('item:') ? STATUS_BY_ITEM[s] : undefined;
      if (byItem) return say(byItem.replace('{x}', x).replace('{i}', strip(from)));
      const t = STATUS_START[s];
      return t ? say(t.replace('{x}', x)) : null;
    }
    case '-curestatus': {
      const t = STATUS_CURE[parts[2] ?? ''];
      return t ? say(t.replace('{x}', x)) : null;
    }
    case '-cureteam': return say(`${cap(team(parts[1]))} was cured of its status conditions!`);
    case '-boost': return say(boostText(x, parts[2] ?? '', Number(parts[3]) || 0, true));
    case '-unboost': return say(boostText(x, parts[2] ?? '', Number(parts[3]) || 0, false));
    case '-setboost': return say(`${x}'s ${STAT_NAME[parts[2] ?? ''] ?? 'stats'} changed!`);
    case '-clearboost': return say(`${x}'s stat changes were removed!`);
    case '-clearallboost': return say('All stat changes were eliminated!');
    case '-clearnegativeboost': return say(`${x}'s lowered stats returned to normal!`);
    case '-invertboost': return say(`${x}'s stat changes were inverted!`);
    case '-copyboost': return say(`${x} copied ${who(parts[2], ctx)}'s stat changes!`);
    case '-weather': {
      if (parts.includes('[upkeep]')) return null;
      if (parts[1] === 'none') return say('The weather cleared up.');
      return say(WEATHER_START[parts[1] ?? ''] ?? `The weather became ${conditionName(parts[1] ?? '')}.`);
    }
    case '-fieldstart': {
      const f = strip(parts[1]);
      return say(FIELD_START[f] ?? `${conditionName(f)} started!`);
    }
    case '-fieldend': {
      const f = strip(parts[1]);
      return say(f === 'Trick Room' ? 'The twisted dimensions returned to normal!' : `The ${conditionName(f)} wore off.`);
    }
    case '-sidestart': {
      const c = strip(parts[2]);
      const t = SIDE_START[c];
      return say(t ? t.replace('{t}', team(parts[1])) : `${pretty(c)} started on ${team(parts[1])}'s side!`);
    }
    case '-sideend': {
      const c = pretty(strip(parts[2]));
      return say(HAZARDS.has(c) ? `The ${c} disappeared from around ${team(parts[1])}!` : `${cap(team(parts[1]))}'s ${c} wore off!`);
    }
    case '-terastallize': return say(`${x} has Terastallized into the ${parts[2]} type!`);
    case '-crit': return say('A critical hit!');
    case '-supereffective': return say("It's super effective!");
    case '-resisted': return say("It's not very effective...");
    case '-immune': return say(`It doesn't affect ${x}...`);
    case '-miss': return say(parts[2] ? `${who(parts[2], ctx)} avoided the attack!` : `${x}'s attack missed!`);
    case '-fail': return say(parts[2] === 'heal' ? `${x}'s HP is full!` : 'But it failed!');
    case '-notarget': return say('But there was no target...');
    case '-nothing': return say('But nothing happened!');
    case '-ohko': return say("It's a one-hit KO!");
    case '-hitcount': return say(`The Pokemon was hit ${parts[2]} time${parts[2] === '1' ? '' : 's'}!`);
    case '-transform': return say(`${x} transformed into ${parseIdent(parts[2])?.name ?? 'something'}!`);
    case 'detailschange': return /-Mega\b/.test(parts[2] ?? '') ? null : say(`${x} transformed!`);
    case '-mega': {
      const base = parts[2] ?? parseIdent(parts[1])?.name ?? '';
      const stone = parts[3] ?? 'Mega Stone';
      const raw = who(parts[1]); // the base form, as the sim names it, evolves into the Mega
      return say(`${raw}'s ${stone} is reacting to the Key Stone! ${cap(raw)} has Mega Evolved into ${bold(displayName(megaForm(base, stone)))}!`);
    }
    case '-zpower': return say(`${x} surrounds itself with its Z-Power!`);
    case '-prepare': return say(`${x} is getting ready to use ${parts[2]}!`);
    case '-item': {
      const item = parts[2] ?? 'an item';
      if (from === 'ability: Frisk' && of) return say(`${who(of, ctx)} frisked ${x} and found its ${item}!`);
      if (item === 'Air Balloon') return say(`${x} floats in the air with its Air Balloon!`);
      if (from?.startsWith('move:')) return say(`${x} obtained ${item}.`);
      return say(`${x} is holding ${item}.`);
    }
    case '-enditem': {
      const item = parts[2] ?? 'item';
      if (parts.includes('[eat]')) return say(`${x} ate its ${item}!`);
      if (from === 'move: Knock Off') return say(`${of ? who(of, ctx) : 'The attacker'} knocked off ${x}'s ${item}!`);
      if (from === 'stealeat') return say(`${of ? who(of, ctx) : 'The attacker'} stole and ate ${x}'s ${item}!`);
      if (item === 'Air Balloon') return say(`${x}'s Air Balloon popped!`);
      if (item === 'Focus Sash') return say(`${x} hung on using its Focus Sash!`);
      return say(`${x}'s ${item} was used up.`);
    }
    case '-ability': {
      const ability = pretty(parts[2] ?? '');
      if (from === 'ability: Trace' && of) return say(`${x} traced ${who(of, ctx)}'s ${bold(ability)}!`);
      return say(`${x}'s ${ability} activated!`);
    }
    case '-start': {
      const e = strip(parts[2]);
      switch (e) {
        case 'confusion': return say(parts.includes('[fatigue]') ? `${x} became confused due to fatigue!` : `${x} became confused!`);
        case 'Substitute': return say(`${x} put in a substitute!`);
        case 'typechange': {
          if (from === 'move: Double Shock') return say(`${x} used up all of its electricity!`);
          if (from === 'move: Burn Up') return say(`${x} burned itself out!`);
          const types = (parts[3] ?? '').split('/').filter((t) => t && t !== '???').join('/');
          return types ? say(`${x} transformed into the ${types} type!`) : null;
        }
        case 'Taunt': return say(`${x} fell for the taunt!`);
        case 'Encore': return say(`${x} must do an encore!`);
        case 'Leech Seed': return say(`${x} was seeded!`);
        case 'Yawn': return say(`${x} grew drowsy!`);
        case 'Disable': return say(`${x}'s ${parts[3]} was disabled!`);
        case 'Salt Cure': return say(`${x} is being salt cured!`);
        case 'Curse': return say(`${x} was cursed!`);
        default: return null;
      }
    }
    case '-end': {
      const e = strip(parts[2]);
      if (e === 'confusion') return say(`${x} snapped out of its confusion!`);
      if (e === 'Substitute') return say(`${x}'s substitute faded!`);
      return null;
    }
    case '-activate': {
      const e = strip(parts[2]);
      if (PROTECTS.has(e)) return say(`${x} protected itself!`);
      if (e === 'Substitute') return say(`The substitute took damage for ${x}!`);
      if (e === 'confusion') return say(`${x} is confused!`);
      if (e === 'Sticky Web') return say(`${x} was caught in a sticky web!`);
      if (e === 'trapped') return say(`${x} can no longer escape!`);
      if (e === 'Trick' || e === 'Switcheroo') return say(`${x} switched items with its target!`);
      if (e === 'Supreme Overlord') return say(`${x} gained strength from the fallen!`);
      return null;
    }
    case '-singleturn': {
      const e = strip(parts[2]);
      if (e === 'Protect' || e === 'Detect') return say(`${x} protected itself!`);
      if (e === 'Endure') return say(`${x} braced itself!`);
      return null;
    }
    case '-message': case 'message': return parts[1] ? say(parts[1]) : null;
    default: return null;
  }
}

/** One sentence (or a turn marker) for a protocol line, or null when nothing worth saying happened. */
export function narrate(line: string, ctx: NarrateContext): Narration | null {
  const n = describe(line, ctx);
  return n && { ...n, text: flatten(n.text) };
}

/** Lines that change an HP bar without a sentence still get a beat so the drain is seen. */
export function isHpLine(line: string): boolean {
  return line.startsWith('|-damage|') || line.startsWith('|-heal|') || line.startsWith('|-sethp|');
}

// ---------------------------------------------------------------- battle log entries

/** A run of log text: Pokemon names carry their side (for the side accent), move names are bold. */
export interface LogSeg {
  text: string;
  side?: Side;
  strong?: boolean;
}

export type LogKind =
  | 'start' // "Battle started between A and B!"
  | 'turn' // full-width "Turn 7" divider
  | 'switch' | 'move' | 'line' // main lines
  | 'faint' // emphasized main line
  | 'hp' // "(X lost 43% of its health!)"
  | 'effect' // crit / effectiveness / miss / fail (muted italic)
  | 'minor' // status, boosts, weather, field, hazards, items (muted)
  | 'ability' // "[Pelipper's Drizzle]"
  | 'win'; // final banner

export interface LogEntry {
  kind: LogKind;
  segs: LogSeg[];
  /** Tera type, Mega form or Z-Move pill shown before the text; `type` picks its color. */
  pill?: { label: string; type: string };
}

function segments(marked: string): LogSeg[] {
  const out: LogSeg[] = [];
  const re = /\u0001(p[12])([^\u0002]*)\u0002|\u0003([^\u0004]*)\u0004/g;
  let last = 0;
  for (let m = re.exec(marked); m; m = re.exec(marked)) {
    if (m.index > last) out.push({ text: marked.slice(last, m.index) });
    out.push(m[1] ? { text: m[2] ?? '', side: m[1] as Side, strong: true } : { text: m[3] ?? '', strong: true });
    last = re.lastIndex;
  }
  if (last < marked.length) out.push({ text: marked.slice(last) });
  return out;
}

const EFFECT_CMDS = new Set(['-crit', '-supereffective', '-resisted', '-immune', '-miss', '-fail', '-notarget', '-nothing', '-ohko', '-hitcount']);
const LINE_CMDS = new Set(['cant', '-prepare', '-message', 'message', 'drag', '-transform', 'detailschange', 'teampreview']);
/** Lines whose `[from] ability:` gets Showdown's "[X's Ability]" tag first (others already name it). */
const ABILITY_TAGGED = new Set(['-weather', '-fieldstart', '-immune', '-boost', '-unboost', '-status', '-clearnegativeboost', '-sidestart']);

function kindOf(cmd: string): LogKind {
  if (cmd === 'switch') return 'switch';
  if (cmd === 'move') return 'move';
  if (cmd === 'faint') return 'faint';
  if (EFFECT_CMDS.has(cmd)) return 'effect';
  if (LINE_CMDS.has(cmd)) return 'line';
  return 'minor';
}

const sideKey = (ident: string | undefined): string | null => {
  const id = parseIdent(ident);
  return id ? `${id.side}: ${id.name}` : null;
};

/**
 * The whole p1-perspective log as Showdown-style entries. Tracks HP per Pokemon to print the damage
 * sub-lines: your side in exact HP (the p1 stream has it), the opponent's in percent.
 */
export function parseLog(lines: readonly string[], ctx: NarrateContext): LogEntry[] {
  const out: LogEntry[] = [];
  const hp = new Map<string, { hp: number; max: number }>();
  const players: Partial<Record<Side, string>> = {};
  let weather: string | null = null;
  const push = (kind: LogKind, marked: string, pill?: LogEntry['pill']) => out.push({ kind, segs: segments(cap(marked)), pill });

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const parts = splitLine(line);
    const cmd = parts[0];
    if (!cmd) continue;
    const ident = parts[1];

    switch (cmd) {
      case 'player':
        if ((ident === 'p1' || ident === 'p2') && parts[2]) players[ident] = parts[2];
        continue;
      case 'teampreview':
        continue;
      case 'start':
        push('start', `Battle started between ${players.p1 ?? 'you'} and ${players.p2 ?? ctx.oppName}!`);
        continue;
      case 'win': {
        const winner = parts[1] ?? '';
        out.push({ kind: 'win', segs: [{ text: winner, strong: true }, { text: ' won the battle!' }] });
        continue;
      }
      case 'tie':
        push('win', 'The battle ended in a draw!');
        continue;
      case '-weather': {
        const w = parts[1] ?? '';
        if (parts.includes('[upkeep]')) {
          const t = WEATHER_UPKEEP[w];
          if (t) push('minor', t);
          continue;
        }
        if (w === 'none') {
          push('minor', (weather && WEATHER_END[weather]) || 'The weather cleared up.');
          weather = null;
          continue;
        }
        weather = w;
        break;
      }
    }

    const from = tag(parts, 'from');
    if (from?.startsWith('ability:') && ABILITY_TAGGED.has(cmd) && !parts.includes('[silent]')) {
      push('ability', `[${who(tag(parts, 'of') ?? ident, ctx)}'s ${pretty(strip(from))}]`);
    }

    const n = describe(line, ctx);
    if (n && n.kind === 'turn') {
      out.push({ kind: 'turn', segs: [{ text: n.text }] });
    } else if (n) {
      let pill: LogEntry['pill'];
      if (cmd === '-terastallize' && parts[2]) pill = { label: parts[2], type: parts[2] };
      if (cmd === '-mega') {
        const form = dex.species.get(megaForm(parts[2] ?? '', parts[3] ?? ''));
        pill = { label: 'Mega', type: form.exists ? form.types[0] : 'normal' };
      }
      if (cmd === '-zpower') {
        const next = lines.slice(i + 1, i + 6).find((l) => l.startsWith('|move|') && splitLine(l)[1] === ident);
        const move = next ? dex.moves.get(splitLine(next)[2] ?? '') : undefined;
        pill = { label: 'Z-Move', type: move?.exists ? move.type : 'normal' };
      }
      if (cmd === '-ability' && from !== 'ability: Trace') {
        push('ability', `[${who(ident, ctx)}'s ${pretty(parts[2] ?? '')}]`);
      } else {
        push(pill ? 'line' : kindOf(cmd), n.text, pill);
      }
    }

    // HP bookkeeping after the sentence: "(X lost N% of its health!)" follows the line that caused it.
    const key = sideKey(ident);
    if (!key) continue;
    if (cmd === 'switch' || cmd === 'drag' || cmd === 'replace') {
      const c = parseCondition(parts[3]);
      if (c && !c.fainted) hp.set(key, { hp: c.hp, max: c.maxhp });
    } else if (cmd === '-damage' || cmd === '-heal' || cmd === '-sethp') {
      const c = parseCondition(parts[2]);
      const prev = hp.get(key);
      if (!c) continue;
      const max = c.fainted ? prev?.max ?? 0 : c.maxhp;
      const now = c.fainted ? 0 : c.hp;
      if (prev && now < prev.hp && max > 0 && cmd !== '-heal') {
        const lost = prev.hp - now;
        const x = who(ident, ctx);
        if (parseIdent(ident)?.side === 'p1') {
          push('hp', `(${cap(x)} lost ${lost} HP!${now > 0 ? ` ${now}/${max} left` : ''})`);
        } else {
          push('hp', `(${cap(x)} lost ${Math.max(1, Math.round((lost / max) * 100))}% of its health!)`);
        }
      }
      hp.set(key, { hp: now, max });
    }
  }
  return out;
}

