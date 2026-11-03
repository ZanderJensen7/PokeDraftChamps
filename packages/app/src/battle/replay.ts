// Watching a stored match: the omniscient log (`MatchResult.log`) cut into the same beats the live battle narrates,
// and a hook that steps through them with play / pause / step / speed / jump-to-turn. The view, narration and effects
// are the live battle's own (battleView, narrate, vfx); nothing here talks to the sim.
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Coach, Match, RunState, SpeciesId } from '@pdc/engine';
import { megaInfo } from '@pdc/engine';
import { speciesName } from '../game/names';
import { battleViewReducer, initialBattleView, parseIdent, type BattleViewState, type Side } from './battleView';
import { namesFor, type BattleNames } from './battleNames';
import { narrate, parseLog, type Narration, type NarrateContext } from './narrate';
import { delayFor } from './pacing';
import { fxEvents } from './vfx';
import type { FxHandle } from '../components/battle/FxLayer';

export const REPLAY_SPEEDS = [1, 2, 4] as const;
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];

const OPENING = 'The battle is about to begin…';

/** One narrated beat: the lines up to (and including) the next one the live battle would pause on. */
export interface ReplayStep {
  /** Log index just past the step's last line. */
  end: number;
  /** The step's dialogue sentence, when it has one. */
  say?: string;
  /** The last line and its narration: they set how long the beat holds. */
  line: string;
  narration: Narration | null;
}

export interface ReplaySource {
  match: Match;
  coaches: Record<Side, Coach>;
  lineups: Record<Side, SpeciesId[]>;
  names: BattleNames;
  ctx: NarrateContext;
  lines: string[];
  steps: ReplayStep[];
  /** Dialogue after k steps (index 0 = before the first). */
  sayAt: string[];
  /** Steps applied when "|turn|N" has just been shown, by N (index 0 = the start). */
  turnStep: number[];
  turns: number;
}

/** The nickname the sim prints for a roster pick: the set's name, else the base species for a Mega, else the species. */
function nickFor(coach: Coach, id: SpeciesId): { name?: string; species: string } {
  const set = coach.sets[id];
  if (set) return set;
  return { species: megaInfo(id)?.baseName ?? speciesName(id) };
}

/** Cut a log into beats. Boundaries are the live battle's full-motion ones, so stepping is the same at any setting. */
export function replaySteps(lines: readonly string[], ctx: NarrateContext): ReplayStep[] {
  const steps: ReplayStep[] = [];
  let say: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const n = narrate(line, ctx);
    if (n && n.kind !== 'turn') say = n.text;
    if (delayFor(line, n, false, true) > 0 || i === lines.length - 1) {
      steps.push({ end: i + 1, say, line, narration: n });
      say = undefined;
    }
  }
  return steps;
}

/**
 * Everything a replay needs from a played match, or null when it has no stored log. The human is p1 in their own
 * matches; otherwise home is p1 (as `simulateMatch` plays them).
 */
export function replaySource(run: RunState, match: Match): ReplaySource | null {
  const result = match.result;
  if (!result?.log?.length) return null;
  const p1Id = match.away === run.humanId ? match.away : match.home;
  const p2Id = p1Id === match.home ? match.away : match.home;
  const p1 = run.coaches.find((c) => c.id === p1Id);
  const p2 = run.coaches.find((c) => c.id === p2Id);
  if (!p1 || !p2) return null;
  const lineups = { p1: result.lineups[p1Id] ?? [], p2: result.lineups[p2Id] ?? [] };
  const names: BattleNames = {
    p1: namesFor(lineups.p1, lineups.p1.map((id) => nickFor(p1, id))),
    p2: namesFor(lineups.p2, lineups.p2.map((id) => nickFor(p2, id))),
  };
  const ctx: NarrateContext = { oppName: p2.name, names };
  const lines = result.log;
  const steps = replaySteps(lines, ctx);
  const sayAt = [OPENING];
  const turnStep = [0];
  steps.forEach((s, k) => {
    sayAt.push(s.say ?? sayAt[k]!);
    const t = /^\|turn\|(\d+)/.exec(s.line);
    if (t) turnStep[Number(t[1])] = k + 1;
  });
  // A turn the log skipped (never happens in practice) jumps to the next one that exists.
  for (let n = turnStep.length - 2; n > 0; n--) turnStep[n] ??= turnStep[n + 1]!;
  return { match, coaches: { p1, p2 }, lineups, names, ctx, lines, steps, sayAt, turnStep, turns: turnStep.length - 1 };
}

/** The view after `pos` steps, built from scratch (jumps, restart, step back). */
export function viewAt(src: ReplaySource, pos: number): BattleViewState {
  const end = pos > 0 ? src.steps[pos - 1]!.end : 0;
  return battleViewReducer(initialBattleView(OPENING), { type: 'advance', lines: src.lines.slice(0, end), say: src.sayAt[pos] });
}

/** How long step k holds before the next one applies. */
function holdOf(src: ReplaySource, k: number, reduced: boolean, effects: boolean): number {
  const s = src.steps[k];
  return s ? delayFor(s.line, s.narration, reduced, effects) : 0;
}

export interface ReplayControls {
  state: BattleViewState;
  /** Steps applied, 0..steps.length. */
  pos: number;
  playing: boolean;
  ended: boolean;
  speed: ReplaySpeed;
  logEntries: ReturnType<typeof parseLog>;
  play(): void;
  pause(): void;
  step(): void;
  back(): void;
  restart(): void;
  jumpToTurn(n: number): void;
  setSpeed(s: ReplaySpeed): void;
}

export function useReplay(src: ReplaySource, opts: { reduced: boolean; effectsOn: boolean; fx: RefObject<FxHandle | null> }): ReplayControls {
  const { reduced, effectsOn, fx } = opts;
  const [cur, setCur] = useState(() => ({ pos: 0, state: viewAt(src, 0) }));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<ReplaySpeed>(1);
  const curRef = useRef(cur);
  curRef.current = cur;
  const total = src.steps.length;

  /** Apply steps [pos, to) on top of the current view, firing their effects like the live battle does. */
  const forward = useCallback((to: number) => {
    const { pos, state } = curRef.current;
    if (to <= pos) return;
    const from = pos > 0 ? src.steps[pos - 1]!.end : 0;
    const batch = src.lines.slice(from, src.steps[to - 1]!.end);
    const view = state.view;
    fx.current?.play(fxEvents(batch, (ident) => {
      const id = parseIdent(ident);
      return id ? view.sides[id.side].team.find((m) => m.nick === id.name)?.species : undefined;
    }));
    const next = { pos: to, state: battleViewReducer(state, { type: 'advance', lines: batch, say: src.sayAt[to] }) };
    curRef.current = next;
    setCur(next);
  }, [src, fx]);

  const jump = useCallback((to: number) => {
    const pos = Math.max(0, Math.min(total, to));
    const next = { pos, state: viewAt(src, pos) };
    curRef.current = next;
    setCur(next);
  }, [src, total]);

  // Playback: hold the last applied beat, then apply the next one (and any that follow with no hold of their own).
  const { pos } = cur;
  useEffect(() => {
    if (!playing) return;
    if (pos >= total) { setPlaying(false); return; }
    const wait = pos > 0 ? holdOf(src, pos - 1, reduced, effectsOn) / speed : 0;
    const t = setTimeout(() => {
      let to = pos + 1;
      while (to < total && holdOf(src, to - 1, reduced, effectsOn) === 0) to++;
      forward(to);
    }, wait);
    return () => clearTimeout(t);
  }, [playing, pos, total, speed, reduced, effectsOn, src, forward]);

  const shown = cur.state.shown;
  const logEntries = useMemo(() => parseLog(src.lines.slice(0, shown), src.ctx), [src, shown]);

  return {
    state: cur.state,
    pos,
    playing,
    ended: pos >= total,
    speed,
    logEntries,
    play: () => { if (curRef.current.pos >= total) jump(0); setPlaying(true); },
    pause: () => setPlaying(false),
    step: () => { setPlaying(false); forward(Math.min(total, curRef.current.pos + 1)); },
    back: () => { setPlaying(false); jump(curRef.current.pos - 1); },
    restart: () => { setPlaying(false); jump(0); },
    jumpToTurn: (n) => jump(src.turnStep[Math.max(0, Math.min(src.turns, n))] ?? 0),
    setSpeed,
  };
}
