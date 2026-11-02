// Drives one @pkmn/sim battle between two BattlePlayers (or a human on p1). Browser-safe.
import { BattleStreams, Teams } from '@pkmn/sim';
import type { BattleSet, SpeciesId } from '../types';
import { HeuristicPlayer } from './heuristicPlayer';
import type { BattlePlayer, ParsedRequest, PlayerContext } from './player';
import { parseIdent, speciesIdFromDetails, splitLine, toID, type SideId } from '../logs/protocol';
import { battleSpeciesId } from '../forms';
import { setSpeciesId } from './sets';

/**
 * Showdown custom-rule syntax. Verified 2026-11-02: accepted by `>start`, the log carries
 * `|rule|Species Clause: ...` etc. 'Team Preview' must NOT be listed: gen9customgame already has it
 * and the sim throws "Rule teampreview ... already exists". The clauses are validator rules, so the
 * battle itself does not enforce OHKO/Evasion bans; sets.ts strips those moves instead.
 */
export const BATTLE_FORMAT = 'gen9customgame@@@Species Clause,Sleep Clause Mod,OHKO Clause,Evasion Moves Clause';
export const FALLBACK_FORMAT = 'gen9customgame';
export const DEFAULT_MAX_TURNS = 1000;

export interface BattleSideOptions {
  name: string;
  team: BattleSet[];
  player: BattlePlayer;
  teraCaptains: Iterable<SpeciesId>;
}

export interface RunBattleOptions {
  p1: BattleSideOptions;
  p2: BattleSideOptions;
  seed: [number, number, number, number];
  formatid?: string;
  maxTurns?: number;
}

export interface BattleOutcome {
  winner: 'p1' | 'p2' | 'tie';
  turns: number;
  /** Mons left standing per side. */
  remaining: { p1: number; p2: number };
  /** Omniscient protocol log. */
  log: string[];
  /** Species id of each side's first mon out. */
  leads: { p1: SpeciesId; p2: SpeciesId };
}

interface InternalSide {
  name: string;
  simName: string;
  team: BattleSet[];
  player?: BattlePlayer;
  teraCaptains: Set<SpeciesId>;
}

/** Captain ids as given (roster ids) plus the battle id of each (a Mega entry battles as its base species). */
function captainSet(ids: Iterable<SpeciesId>): Set<SpeciesId> {
  const out = new Set<SpeciesId>();
  for (const id of ids) { out.add(toID(id)); out.add(battleSpeciesId(id)); }
  return out;
}

/** Map each set's nickname to its roster species id (for tera-captain checks). */
function nicknameMap(team: BattleSet[]): Map<string, SpeciesId> {
  const m = new Map<string, SpeciesId>();
  for (const s of team) m.set(s.name || s.species, setSpeciesId(s));
  return m;
}

/** Candidate roster ids for the active mon: from its details (reliable for formes) and from its nickname. */
function activeSpeciesIds(req: ParsedRequest, nick: Map<string, SpeciesId>): SpeciesId[] {
  const a = req.side.pokemon.find(p => p.active);
  if (!a) return [];
  const id = parseIdent(a.ident);
  const byNick = id && nick.get(id.name);
  return byNick ? [speciesIdFromDetails(a.details), byNick] : [speciesIdFromDetails(a.details)];
}

/** Remove the tera option for non-captains (the game enforces captains, not the sim). */
function sanitizeRequest(req: ParsedRequest, side: InternalSide, nick: Map<string, SpeciesId>): ParsedRequest {
  const active = req.active?.[0];
  if (active && active.canTerastallize) {
    if (!activeSpeciesIds(req, nick).some(sid => side.teraCaptains.has(sid))) {
      const copy: ParsedRequest = { ...req, active: req.active!.map((a, i) => (i === 0 ? { ...a, canTerastallize: undefined } : a)) };
      return copy;
    }
  }
  return req;
}

function sanitizeChoice(cmd: string, req: ParsedRequest | null): string {
  if (!req) return cmd;
  const a = req.active?.[0];
  let out = cmd;
  if (/\bterastallize\b/.test(out) && !a?.canTerastallize) out = out.replace(/\s*\bterastallize\b/g, '');
  if (/\bmega\b/.test(out) && !a?.canMegaEvo) out = out.replace(/\s*\bmega\b/g, '');
  if (/\bzmove\b/.test(out)) {
    const slot = Number(/^move (\d+)/.exec(out)?.[1] ?? 0);
    if (!a?.canZMove?.[slot - 1]) out = out.replace(/\s*\bzmove\b/g, '');
  }
  return out;
}

function opponentTeamFromLog(log: string[], opp: SideId): SpeciesId[] {
  const out: SpeciesId[] = [];
  for (const line of log) {
    const parts = splitLine(line);
    if (parts[0] === 'poke' && parts[1] === opp && parts[2]) out.push(speciesIdFromDetails(parts[2]));
  }
  if (out.length) return out;
  for (const line of log) {
    const parts = splitLine(line);
    if ((parts[0] === 'switch' || parts[0] === 'drag') && parseIdent(parts[1])?.side === opp && parts[2]) {
      const id = speciesIdFromDetails(parts[2]);
      if (!out.includes(id)) out.push(id);
    }
  }
  return out;
}

/** Summarise an omniscient log into a BattleOutcome. */
export function outcomeFromLog(log: string[], names: { p1: string; p2: string }): BattleOutcome {
  let turns = 0;
  let winner: BattleOutcome['winner'] = 'tie';
  const teamsize = { p1: 6, p2: 6 };
  const faints = { p1: 0, p2: 0 };
  const leads = { p1: '', p2: '' };
  for (const line of log) {
    const parts = splitLine(line);
    switch (parts[0]) {
      case 'turn': turns = Number(parts[1]) || turns; break;
      case 'teamsize': if (parts[1] === 'p1' || parts[1] === 'p2') teamsize[parts[1]] = Number(parts[2]) || 6; break;
      case 'faint': { const id = parseIdent(parts[1]); if (id) faints[id.side]++; break; }
      case '-heal': {
        if (parts.some(p => /Revival Blessing/.test(p))) { const id = parseIdent(parts[1]); if (id) faints[id.side]--; }
        break;
      }
      case 'switch': case 'drag': {
        const id = parseIdent(parts[1]);
        if (id && !leads[id.side] && parts[2]) leads[id.side] = speciesIdFromDetails(parts[2]);
        break;
      }
      case 'win': winner = parts[1] === names.p1 ? 'p1' : parts[1] === names.p2 ? 'p2' : 'tie'; break;
      case 'tie': winner = 'tie'; break;
    }
  }
  return {
    winner,
    turns,
    remaining: { p1: Math.max(0, teamsize.p1 - faints.p1), p2: Math.max(0, teamsize.p2 - faints.p2) },
    log,
    leads,
  };
}

interface HumanHooks {
  onLine: (line: string) => void;
  onRequest: (req: ParsedRequest) => void;
}

interface Session {
  outcome: Promise<BattleOutcome>;
  writeChoice(side: SideId, cmd: string): void;
  abort(): void;
}

function startSession(
  opts: { p1: Omit<BattleSideOptions, 'player'> & { player?: BattlePlayer }; p2: Omit<BattleSideOptions, 'player'> & { player?: BattlePlayer }; seed: [number, number, number, number]; formatid?: string; maxTurns?: number },
  human?: HumanHooks,
): Session {
  const sides: Record<SideId, InternalSide> = {
    p1: { name: opts.p1.name, simName: opts.p1.name, team: opts.p1.team, player: opts.p1.player, teraCaptains: captainSet(opts.p1.teraCaptains) },
    p2: {
      name: opts.p2.name,
      simName: opts.p2.name === opts.p1.name ? `${opts.p2.name} (2)` : opts.p2.name,
      team: opts.p2.team, player: opts.p2.player, teraCaptains: captainSet(opts.p2.teraCaptains),
    },
  };
  const maxTurns = opts.maxTurns ?? DEFAULT_MAX_TURNS;
  const streams = BattleStreams.getPlayerStreams(new BattleStreams.BattleStream());
  const omniLog: string[] = [];
  let finished = false;
  let resolveOutcome!: (o: BattleOutcome) => void;
  const outcome = new Promise<BattleOutcome>(res => { resolveOutcome = res; });
  const finish = () => {
    if (finished) return;
    finished = true;
    resolveOutcome(outcomeFromLog(omniLog, { p1: sides.p1.simName, p2: sides.p2.simName }));
    try { void streams.omniscient.writeEnd(); } catch { /* already closed */ }
  };

  const pending: Record<SideId, ParsedRequest | null> = { p1: null, p2: null };
  const write = (side: SideId, cmd: string) => {
    if (finished) return;
    try { void streams[side].write(cmd); } catch { /* stream closed */ }
  };

  const driveSide = async (side: SideId) => {
    const cfg = sides[side];
    const opp: SideId = side === 'p1' ? 'p2' : 'p1';
    const nick = nicknameMap(cfg.team);
    const sideLog: string[] = [];
    const isHuman = side === 'p1' && !!human;
    let defaultSentFor: ParsedRequest | null = null;
    for await (const chunk of streams[side]) {
      for (const line of chunk.split('\n')) {
        if (line.startsWith('|request|')) {
          let req: ParsedRequest;
          try { req = JSON.parse(line.slice(9)) as ParsedRequest; } catch { continue; }
          if (req.wait) { pending[side] = null; continue; }
          req = sanitizeRequest(req, cfg, nick);
          pending[side] = req;
          if (isHuman) { human!.onRequest(req); continue; }
          const ctx: PlayerContext = {
            side, teraCaptains: cfg.teraCaptains, log: sideLog,
            opponentTeam: opponentTeamFromLog(sideLog, opp), ownTeam: cfg.team,
          };
          let cmd = 'default';
          try {
            cmd = (await Promise.resolve(cfg.player!.choose(req, ctx))) || 'default';
          } catch {
            cmd = 'default';
          }
          write(side, sanitizeChoice(cmd, req));
          continue;
        }
        sideLog.push(line);
        if (isHuman) human!.onLine(line);
        else if (line.startsWith('|error|[Invalid choice]')) {
          // Our answer was rejected and no new request follows: fall back to the sim's default once.
          const req = pending[side];
          if (req && defaultSentFor !== req) { defaultSentFor = req; write(side, 'default'); }
        }
      }
    }
  };

  const driveOmni = async () => {
    for await (const chunk of streams.omniscient) {
      let end = false;
      for (const line of chunk.split('\n')) {
        omniLog.push(line);
        if (line.startsWith('|turn|')) {
          const n = Number(line.slice(6));
          if (n > maxTurns && !end) { try { void streams.omniscient.write('>forcetie'); } catch { /* closed */ } }
        } else if (line.startsWith('|win|') || line === '|tie') {
          end = true;
        }
      }
      if (end) { finish(); break; }
    }
    finish();
  };

  void driveSide('p1');
  void driveSide('p2');
  void driveOmni();

  const startWith = (formatid: string) => {
    const spec = { formatid, seed: opts.seed };
    const p1 = { name: sides.p1.simName, team: Teams.pack(sides.p1.team) };
    const p2 = { name: sides.p2.simName, team: Teams.pack(sides.p2.team) };
    void streams.omniscient.write(`>start ${JSON.stringify(spec)}\n>player p1 ${JSON.stringify(p1)}\n>player p2 ${JSON.stringify(p2)}`);
  };
  try {
    startWith(opts.formatid ?? BATTLE_FORMAT);
  } catch {
    startWith(FALLBACK_FORMAT);
  }

  return {
    outcome,
    writeChoice: (side, cmd) => write(side, sanitizeChoice(cmd, pending[side])),
    abort: () => {
      if (finished) return;
      try { void streams.omniscient.write('>forcewin p2'); } catch { finish(); }
    },
  };
}

/** Run an AI-vs-AI (or any player-vs-player) battle to completion. Never deadlocks; ties after maxTurns. */
export function runBattle(opts: RunBattleOptions): Promise<BattleOutcome> {
  return startSession(opts).outcome;
}

export interface InteractiveBattleOptions {
  p1: { name: string; team: BattleSet[]; teraCaptains: Iterable<SpeciesId> };
  p2: { name: string; team: BattleSet[]; teraCaptains: Iterable<SpeciesId>; player?: BattlePlayer };
  seed: [number, number, number, number];
  /** Seed for the default HeuristicPlayer on p2. */
  aiSeed?: number;
  formatid?: string;
  maxTurns?: number;
}

export interface InteractiveBattle {
  /** Subscribe to p1-perspective protocol lines (requests excluded). Replays lines seen so far. Returns unsubscribe. */
  onLine(cb: (line: string) => void): () => void;
  /** Subscribe to p1 requests (tera option already removed for non-captains). Replays the pending one. */
  onRequest(cb: (req: ParsedRequest) => void): () => void;
  /** Send a choice for p1: 'move 2', 'move 1 terastallize', 'switch 3', 'team 123456', 'default'. */
  choose(cmd: string): void;
  outcome: Promise<BattleOutcome>;
  /** Forfeit for p1 (p2 wins); resolves `outcome`. */
  abort(): void;
  readonly lines: readonly string[];
  readonly request: ParsedRequest | null;
}

/** A battle with the human on p1 and an AI (HeuristicPlayer by default) on p2. */
export function createInteractiveBattle(opts: InteractiveBattleOptions): InteractiveBattle {
  const lines: string[] = [];
  let request: ParsedRequest | null = null;
  let lastRequest: ParsedRequest | null = null;
  const lineSubs = new Set<(line: string) => void>();
  const reqSubs = new Set<(req: ParsedRequest) => void>();
  const session = startSession(
    {
      p1: { ...opts.p1 },
      p2: { ...opts.p2, player: opts.p2.player ?? new HeuristicPlayer(opts.aiSeed ?? opts.seed[0]) },
      seed: opts.seed, formatid: opts.formatid, maxTurns: opts.maxTurns,
    },
    {
      onLine: line => {
        lines.push(line);
        for (const cb of lineSubs) cb(line);
        // A rejected choice: the sim waits for another answer to the same request, so offer it again.
        if (line.startsWith('|error|') && lastRequest && !request) {
          request = lastRequest;
          for (const cb of reqSubs) cb(lastRequest);
        }
      },
      onRequest: req => { request = req; lastRequest = req; for (const cb of reqSubs) cb(req); },
    },
  );
  void session.outcome.then(() => { request = null; lastRequest = null; });
  return {
    onLine(cb) { for (const l of lines) cb(l); lineSubs.add(cb); return () => lineSubs.delete(cb); },
    onRequest(cb) { if (request) cb(request); reqSubs.add(cb); return () => reqSubs.delete(cb); },
    choose(cmd) { request = null; session.writeChoice('p1', cmd); },
    outcome: session.outcome,
    abort() { session.abort(); },
    get lines() { return lines; },
    get request() { return request; },
  };
}
