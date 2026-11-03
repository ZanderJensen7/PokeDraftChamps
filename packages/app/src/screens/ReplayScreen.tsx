// Watching a stored match: the battle stage driven by the replay session instead of a live battle, with a transport
// bar (restart, step back, play / pause, step, speed, turn slider). The log is omniscient, so both HP boxes are exact.
import { useMemo, useRef } from 'react';
import type { Match, RunState } from '@pdc/engine';
import { useGame, weekLabel } from '../store/useGame';
import { useSettings } from '../store/settings';
import { Crest, DialogueBox, GameButton } from '../components/ui';
import type { FxHandle } from '../components/battle/FxLayer';
import { REPLAY_SPEEDS, replaySource, useReplay, type ReplaySource } from '../battle/replay';
import type { MonInfoContext } from '../battle/monInfo';
import { BattleStage } from './BattleScreen';

export function ReplayScreen() {
  const run = useGame((s) => s.run);
  const id = useGame((s) => s.replayMatchId);
  const match = run?.matches.find((m) => m.id === id);
  const src = useMemo(() => (run && match ? replaySource(run, match) : null), [run, match]);
  if (!run || !match || !src) return <NoReplay />;
  return <ReplayView key={match.id} run={run} match={match} src={src} />;
}

function BackButton({ className = '' }: { className?: string }) {
  const go = useGame((s) => s.go);
  const from = useGame((s) => s.replayFrom);
  return <GameButton variant="secondary" size="sm" className={className} onClick={() => go(from === 'replay' ? 'hub' : from)}>BACK</GameButton>;
}

function NoReplay() {
  return (
    <div className="mx-auto max-w-2xl space-y-3 py-8">
      <DialogueBox>This match has no replay to show.</DialogueBox>
      <BackButton />
    </div>
  );
}

function Header({ run, match, src }: { run: RunState; match: Match; src: ReplaySource }) {
  const r = match.result!;
  const { p1, p2 } = src.coaches;
  const side = (id: string) => (id === run.humanId ? 'you' : undefined);
  return (
    <div className="mb-2 flex items-center gap-2 phone:mb-1.5 sm:gap-3">
      <BackButton className="shrink-0" />
      <div className="min-w-0 flex-1 text-center">
        <div className="pixel text-[10px] text-muted">REPLAY · {weekLabel(run, match.week, match).toUpperCase()}</div>
        <div className="flex items-center justify-center gap-2 font-display font-bold">
          <Crest abbrev={p1.abbrev} size={22} side={side(p1.id)} />
          <span className={`truncate ${r.winner === p1.id ? 'text-ink' : 'text-muted'}`}>
            <span className="phone:hidden">{p1.name}</span><span className="hidden phone:inline">{p1.abbrev}</span>
          </span>
          <span className="shrink-0 rounded-md bg-panel-inset px-2 tabular-nums text-poke-yellow">
            {r.remaining[p1.id] ?? 0}-{r.remaining[p2.id] ?? 0}
          </span>
          <span className={`truncate ${r.winner === p2.id ? 'text-ink' : 'text-muted'}`}>
            <span className="phone:hidden">{p2.name}</span><span className="hidden phone:inline">{p2.abbrev}</span>
          </span>
          <Crest abbrev={p2.abbrev} size={22} side={side(p2.id) ?? 'opp'} />
        </div>
      </div>
      {/* Balances the Back button so the title stays centred. */}
      <span className="w-[4.5rem] shrink-0 phone:hidden" aria-hidden />
    </div>
  );
}

function ReplayView({ run, match, src }: { run: RunState; match: Match; src: ReplaySource }) {
  const reduced = useSettings((s) => s.reducedMotion);
  const effectsOn = useSettings((s) => s.battleEffects) && !reduced;
  const fx = useRef<FxHandle>(null);
  const r = useReplay(src, { reduced, effectsOn, fx });
  const view = r.state.view;
  const { p1, p2 } = src.coaches;
  const info = useMemo<Omit<MonInfoContext, 'request'>>(() => ({
    lineups: src.lineups,
    teraCaptains: {
      p1: p1.roster.filter((e) => e.isTeraCaptain).map((e) => e.species),
      p2: p2.roster.filter((e) => e.isTeraCaptain).map((e) => e.species),
    },
    scouted: {},
  }), [src, p1, p2]);
  const labels = { p1: p1.name, p2: p2.name };
  const sideTags = { p1: p1.abbrev, p2: p2.abbrev };

  const actionArea = (
    <div className="space-y-2 phone:space-y-1.5">
      <div
        className="dialogue min-h-[4.5rem] px-5 py-3 font-display text-xl font-bold phone:min-h-[3.5rem] phone:px-4 phone:py-2 phone:text-lg"
        aria-live="polite"
      >
        {r.state.say}
      </div>
      <Transport r={r} turns={src.turns} turn={view.turn} />
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl">
      <Header run={run} match={match} src={src} />
      <BattleStage
        view={view}
        names={src.names}
        labels={labels}
        fx={fx}
        effectsOn={effectsOn}
        logEntries={r.logEntries}
        actionArea={actionArea}
        info={info}
        request={null}
        exactHp
        sideTags={sideTags}
      />
    </div>
  );
}

function Transport({ r, turns, turn }: { r: ReturnType<typeof useReplay>; turns: number; turn: number }) {
  const btn = 'min-w-11 phone:min-h-11';
  return (
    <div className="game-panel flex flex-wrap items-center gap-2 px-3 py-2 phone:gap-1.5 phone:px-2 phone:py-1.5" role="group" aria-label="Replay controls">
      <GameButton size="sm" variant="ghost" className={btn} onClick={r.restart} disabled={r.pos === 0} aria-label="Restart" title="Restart">⏮</GameButton>
      <GameButton size="sm" variant="ghost" className={btn} onClick={r.back} disabled={r.pos === 0} aria-label="Step back" title="Step back">◀</GameButton>
      {r.playing ? (
        <GameButton size="sm" className={`${btn} w-20`} onClick={r.pause}>PAUSE</GameButton>
      ) : (
        <GameButton size="sm" className={`${btn} w-20`} onClick={r.play}>{r.ended ? 'REPLAY' : 'PLAY'}</GameButton>
      )}
      <GameButton size="sm" variant="ghost" className={btn} onClick={r.step} disabled={r.ended} aria-label="Step forward" title="Step forward">▶</GameButton>
      <div className="flex overflow-hidden rounded-lg border-2 border-edge" role="radiogroup" aria-label="Speed">
        {REPLAY_SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={r.speed === s}
            onClick={() => r.setSpeed(s)}
            className={`min-h-9 px-2.5 font-display text-sm font-bold phone:min-h-11 ${r.speed === s ? 'bg-poke-yellow text-cream-ink' : 'bg-panel-inset text-ink hover:brightness-110'}`}
          >
            {s}x
          </button>
        ))}
      </div>
      <label className="flex min-w-[10rem] flex-1 items-center gap-2 phone:basis-full">
        <span className="shrink-0 font-display text-sm font-bold tabular-nums">Turn {turn}/{turns}</span>
        <input
          type="range"
          min={0}
          max={turns}
          value={turn}
          onChange={(e) => r.jumpToTurn(Number(e.target.value))}
          className="min-w-0 flex-1"
          aria-label="Jump to turn"
        />
      </label>
    </div>
  );
}
