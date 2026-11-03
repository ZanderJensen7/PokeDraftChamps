import type { Match, RunState } from '@pdc/engine';
import { playoffRoundCount, playoffRoundName } from '@pdc/engine';
import { Crest } from './ui';
import { abbrevOf } from '../game/names';
import { useGame } from '../store/useGame';
import { canWatch } from './WatchButton';

function Slot({ run, coach, score, won }: { run: RunState; coach?: string; score?: number; won?: boolean }) {
  const you = coach === run.humanId;
  return (
    <div className={`flex items-center gap-2 px-2 py-1 ${you ? 'bg-you-soft' : ''} ${won === false ? 'opacity-50' : ''}`}>
      {coach ? <Crest abbrev={abbrevOf(run, coach)} size={18} side={you ? 'you' : undefined} /> : <span className="inline-block w-[18px]" />}
      <span className={`flex-1 font-display font-bold ${coach ? '' : 'text-faint'}`}>{coach ? abbrevOf(run, coach) : 'TBD'}</span>
      {score !== undefined && <span className={`tabular-nums font-bold ${won ? 'text-poke-yellow' : 'text-muted'}`}>{score}</span>}
    </div>
  );
}

/** A played game opens its replay. */
function MatchBox({ run, m }: { run: RunState; m?: Match }) {
  const r = m?.result;
  const watch = useGame((s) => s.watch);
  const Box = canWatch(m) ? 'button' : 'div';
  return (
    <Box
      {...(Box === 'button' ? { type: 'button' as const, onClick: () => watch(m!.id), title: 'Watch the replay' } : {})}
      className={`block w-36 overflow-hidden rounded-lg border-2 border-edge bg-panel-inset text-left text-sm ${Box === 'button' ? 'hover:border-poke-yellow' : ''}`}
    >
      <Slot run={run} coach={m?.home} score={r ? r.remaining[m!.home] ?? 0 : undefined} won={r ? r.winner === m!.home : undefined} />
      <div className="h-px bg-edge" />
      <Slot run={run} coach={m?.away} score={r ? r.remaining[m!.away] ?? 0 : undefined} won={r ? r.winner === m!.away : undefined} />
    </Box>
  );
}

/** Single-elimination bracket from run.matches (playoffRound set). Unseeded later rounds show TBD. */
export function Bracket({ run }: { run: RunState }) {
  const size = run.config.playoffTeams;
  const rounds = playoffRoundCount(size);
  const cols = Array.from({ length: rounds }, (_, i) => {
    const round = i + 1;
    const games = run.matches.filter((m) => m.playoffRound === round);
    const slots = size / 2 ** round;
    return { round, games, slots };
  });
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max gap-4">
        {cols.map((c) => (
          <div key={c.round} className="flex flex-col">
            <div className="mb-2 font-display text-xs font-bold uppercase tracking-wider text-muted">{playoffRoundName(c.round, size)}</div>
            <div className="flex flex-1 flex-col justify-around gap-3">
              {Array.from({ length: c.slots }, (_, i) => <MatchBox key={i} run={run} m={c.games[i]} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
