// Protocol line -> one plain sentence for the dialogue box ("Great Tusk used Headlong Rush!").
// Lines that only move numbers (plain damage, requests, setup) narrate to null; the LOG panel keeps them.
import { parseIdent, splitLine } from './battleView';

export interface Narration {
  text: string;
  kind: 'say' | 'turn' | 'end';
}

export interface NarrateContext {
  /** Opponent coach name, for "X sent out Y!". */
  oppName: string;
}

const STAT_NAME: Record<string, string> = {
  atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed', accuracy: 'accuracy', evasion: 'evasiveness',
};

const strip = (effect: string | undefined): string => (effect ?? '').replace(/^(move|ability|item):\s*/, '');

function tag(parts: string[], key: 'from' | 'of'): string | undefined {
  const p = parts.find((x) => x.startsWith(`[${key}]`));
  return p ? p.slice(key.length + 2).trim() : undefined;
}

/** "Garchomp" for your side, "the opposing Garchomp" for theirs. */
function who(ident: string | undefined): string {
  const id = parseIdent(ident);
  if (!id) return 'the Pokemon';
  return id.side === 'p1' ? id.name : `the opposing ${id.name}`;
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

function damageFrom(x: string, from: string, of: string | undefined): string {
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
      if (of && from.startsWith('ability:')) return `${x} was hurt by ${who(of)}'s ${effect}!`;
      return `${x} was hurt by ${effect}!`;
  }
}

function healFrom(x: string, from: string | undefined, of: string | undefined): string {
  if (!from) return `${x} had its HP restored.`;
  const effect = strip(from);
  if (effect === 'drain') return `${of ? who(of) : 'The target'} had its energy drained!`;
  if (from.startsWith('item:')) return `${x} restored a little HP using its ${effect}!`;
  if (from.startsWith('ability:')) return `${x} restored HP using its ${effect}!`;
  return `${x} had its HP restored.`;
}

/** One sentence (or a turn marker) for a protocol line, or null when nothing worth saying happened. */
export function narrate(line: string, ctx: NarrateContext): Narration | null {
  const parts = splitLine(line);
  const cmd = parts[0];
  if (!cmd) return null;
  const say = (text: string): Narration => ({ text: cap(text), kind: 'say' });
  const x = who(parts[1]);
  const from = tag(parts, 'from');
  const of = tag(parts, 'of');
  if (parts.includes('[silent]')) return null;
  switch (cmd) {
    case 'teampreview': return say(`${ctx.oppName} wants to battle! Choose your lead.`);
    case 'turn': return { text: `Turn ${parts[1]}`, kind: 'turn' };
    case 'win': return { text: `${parts[1]} won the battle!`, kind: 'end' };
    case 'tie': return { text: 'The battle ended in a draw!', kind: 'end' };
    case 'switch': {
      const name = parseIdent(parts[1])?.name ?? 'the Pokemon';
      return say(parts[1]?.startsWith('p1') ? `Go! ${name}!` : `${ctx.oppName} sent out ${name}!`);
    }
    case 'drag': return say(`${x} was dragged out!`);
    case 'move': return say(`${x} used ${parts[2]}!`);
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
        default: return say(`${x} can't move!`);
      }
    }
    case '-damage': return from ? say(damageFrom(x, from, of)) : null;
    case '-heal': return say(healFrom(x, from, of));
    case '-status': {
      const t = STATUS_START[parts[2] ?? ''];
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
    case '-copyboost': return say(`${x} copied ${who(parts[2])}'s stat changes!`);
    case '-weather': {
      if (parts.includes('[upkeep]')) return null;
      if (parts[1] === 'none') return say('The weather cleared up.');
      return say(WEATHER_START[parts[1] ?? ''] ?? `The weather became ${parts[1]}.`);
    }
    case '-fieldstart': {
      const f = strip(parts[1]);
      return say(FIELD_START[f] ?? `${f} started!`);
    }
    case '-fieldend': {
      const f = strip(parts[1]);
      return say(f === 'Trick Room' ? 'The twisted dimensions returned to normal!' : `The ${f} wore off.`);
    }
    case '-sidestart': {
      const c = strip(parts[2]);
      const t = SIDE_START[c];
      return say(t ? t.replace('{t}', team(parts[1])) : `${c} started on ${team(parts[1])}'s side!`);
    }
    case '-sideend': {
      const c = strip(parts[2]);
      return say(HAZARDS.has(c) ? `The ${c} disappeared from around ${team(parts[1])}!` : `${cap(team(parts[1]))}'s ${c} wore off!`);
    }
    case '-terastallize': return say(`${x} terastallized into the ${parts[2]} type!`);
    case '-crit': return say('A critical hit!');
    case '-supereffective': return say("It's super effective!");
    case '-resisted': return say("It's not very effective...");
    case '-immune': return say(`It doesn't affect ${x}...`);
    case '-miss': return say(parts[2] ? `${who(parts[2])} avoided the attack!` : `${x}'s attack missed!`);
    case '-fail': return say('But it failed!');
    case '-notarget': return say('But there was no target...');
    case '-nothing': return say('But nothing happened!');
    case '-ohko': return say("It's a one-hit KO!");
    case '-hitcount': return say(`The Pokemon was hit ${parts[2]} time${parts[2] === '1' ? '' : 's'}!`);
    case '-transform': return say(`${x} transformed into ${parseIdent(parts[2])?.name ?? 'something'}!`);
    case 'detailschange': return /-Mega\b/.test(parts[2] ?? '') ? null : say(`${x} transformed!`);
    case '-mega': {
      const stone = parts[3] ?? 'Mega Stone';
      return say(`${cap(x)}'s ${stone} is reacting to the Key Stone! ${cap(x)} has Mega Evolved into Mega ${parts[2] ?? parseIdent(parts[1])?.name ?? 'itself'}!`);
    }
    case '-zpower': return say(`${cap(x)} surrounds itself with its Z-Power!`);
    case '-prepare': return say(`${x} is getting ready to use ${parts[2]}!`);
    case '-item': {
      const item = parts[2] ?? 'an item';
      if (from === 'ability: Frisk' && of) return say(`${who(of)} frisked ${x} and found its ${item}!`);
      if (item === 'Air Balloon') return say(`${x} floats in the air with its Air Balloon!`);
      if (from?.startsWith('move:')) return say(`${x} obtained ${item}.`);
      return say(`${x} is holding ${item}.`);
    }
    case '-enditem': {
      const item = parts[2] ?? 'item';
      if (parts.includes('[eat]')) return say(`${x} ate its ${item}!`);
      if (from === 'move: Knock Off') return say(`${of ? who(of) : 'The attacker'} knocked off ${x}'s ${item}!`);
      if (from === 'stealeat') return say(`${of ? who(of) : 'The attacker'} stole and ate ${x}'s ${item}!`);
      if (item === 'Air Balloon') return say(`${x}'s Air Balloon popped!`);
      if (item === 'Focus Sash') return say(`${x} hung on using its Focus Sash!`);
      return say(`${x}'s ${item} was used up.`);
    }
    case '-ability': return say(`${x}'s ${parts[2]} activated!`);
    case '-start': {
      const e = strip(parts[2]);
      switch (e) {
        case 'confusion': return say(`${x} became confused!`);
        case 'Substitute': return say(`${x} put in a substitute!`);
        case 'typechange': return say(`${x} became the ${parts[3]} type!`);
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
      if (e === 'Protect' || e === 'Detect' || e === "King's Shield" || e === 'Spiky Shield' || e === 'Baneful Bunker' || e === 'Silk Trap' || e === 'Burning Bulwark') return say(`${x} protected itself!`);
      if (e === 'Substitute') return say(`The substitute took damage for ${x}!`);
      if (e === 'confusion') return say(`${x} is confused!`);
      if (e === 'Sticky Web') return say(`${x} was caught in a sticky web!`);
      if (e === 'trapped') return say(`${x} can no longer escape!`);
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

/** Lines that change an HP bar without a sentence still get a beat so the drain is seen. */
export function isHpLine(line: string): boolean {
  return line.startsWith('|-damage|') || line.startsWith('|-heal|') || line.startsWith('|-sethp|');
}

/** Lines worth showing in the raw LOG panel. */
export function isLogWorthy(line: string): boolean {
  return line.length > 1 && !line.startsWith('|t:|') && !line.startsWith('|request|') && line !== '|';
}
