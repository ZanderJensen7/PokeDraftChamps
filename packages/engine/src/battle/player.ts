// The player interface the runner drives, the request shape, and a seeded random player.
import type { BattleSet, SpeciesId, StatsTable } from '../types';
import type { SideId } from '../logs/protocol';
import { Rng } from './rng';

export interface RequestMove {
  move: string;
  id: string;
  pp?: number;
  maxpp?: number;
  target?: string;
  disabled?: boolean | string;
}

export interface RequestActive {
  moves: RequestMove[];
  /** Tera type when terastallizing is allowed this turn (the runner removes it for non-captains). */
  canTerastallize?: string | false;
  /** True when the held Mega Stone lets the active Mega Evolve this turn (choice suffix ' mega'). */
  canMegaEvo?: boolean;
  /** Aligned with `moves`: the Z-move each move becomes with the held Z-Crystal, or null (choice suffix ' zmove'). */
  canZMove?: ({ move: string; target: string } | null)[];
  trapped?: boolean;
  maybeTrapped?: boolean;
  maybeDisabled?: boolean;
}

export interface RequestPokemon {
  ident: string;
  details: string;
  condition: string;
  active: boolean;
  stats: Omit<StatsTable, 'hp'>;
  moves: string[];
  baseAbility: string;
  item: string;
  ability?: string;
  teraType?: string;
  terastallized?: string;
  reviving?: boolean;
  commanding?: boolean;
}

/** A parsed `|request|` JSON. */
export interface ParsedRequest {
  rqid?: number;
  teamPreview?: boolean;
  maxChosenTeamSize?: number;
  forceSwitch?: boolean[];
  wait?: boolean;
  noCancel?: boolean;
  active?: RequestActive[];
  side: { name: string; id: SideId; pokemon: RequestPokemon[] };
}

export interface PlayerContext {
  side: SideId;
  /** Species ids allowed to Terastallize: roster ids plus, for a Mega entry, its base id (what the battle team lists). Empty = nobody. */
  teraCaptains: Set<SpeciesId>;
  /** Protocol lines this side has seen so far (its own player stream, no requests). */
  log: string[];
  /** The opponent's public lineup (species ids, from team preview). */
  opponentTeam: SpeciesId[];
  /** This side's own sets (what a real player knows about their own team). */
  ownTeam: BattleSet[];
  /** The opponent's real sets, only for an AI side at the Ace AI skill. */
  opponentSets?: BattleSet[];
}

export interface BattlePlayer {
  choose(req: ParsedRequest, ctx: PlayerContext): Promise<string> | string;
}

/** Indices (1-based) of bench mons that can switch in. */
export function switchableSlots(req: ParsedRequest): number[] {
  const out: number[] = [];
  req.side.pokemon.forEach((p, i) => {
    if (!p.active && !p.condition.endsWith(' fnt') && p.condition !== '0 fnt') out.push(i + 1);
  });
  return out;
}

/** Indices (1-based) of usable moves for the first active slot. */
export function usableMoves(req: ParsedRequest): number[] {
  const a = req.active?.[0];
  if (!a) return [];
  const out: number[] = [];
  a.moves.forEach((m, i) => {
    if (!m.disabled && (m.pp === undefined || m.pp > 0)) out.push(i + 1);
  });
  return out;
}

/** Picks uniformly among legal options. Seeded. Switches voluntarily ~10% of the time. */
export class RandomPlayer implements BattlePlayer {
  private rng: Rng;
  constructor(seed = 1) {
    this.rng = new Rng(seed);
  }

  choose(req: ParsedRequest): string {
    if (req.teamPreview) {
      const n = req.side.pokemon.length;
      const order = this.rng.shuffle(Array.from({ length: n }, (_, i) => i + 1));
      return `team ${order.join('')}`;
    }
    if (req.side.pokemon.some(p => p.reviving)) return 'default';
    const bench = switchableSlots(req);
    if (req.forceSwitch?.[0]) {
      return bench.length ? `switch ${this.rng.pick(bench)}` : 'pass';
    }
    const active = req.active?.[0];
    if (!active) return 'default';
    if (!active.trapped && bench.length && this.rng.next() < 0.1) return `switch ${this.rng.pick(bench)}`;
    const moves = usableMoves(req);
    if (!moves.length) return 'default';
    return `move ${this.rng.pick(moves)}`;
  }
}
