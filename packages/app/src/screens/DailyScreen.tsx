import { useEffect, useMemo, useState } from 'react';
import { DAILY_SCORE, dailyDate, dailyInfo, resultLabel, summarizeRun } from '@pdc/engine';
import { apiEnabled, apiHost, fetchDailyBoard, type DailyEntry } from '../game/api';
import { loadDailySave, useGame } from '../store/useGame';
import { isRunOver, NicknameField, PostScoreButton, ShareLine } from '../components/DailyBits';
import { Crest, DialogueBox, GameButton, Panel } from '../components/ui';

type Board =
  | { status: 'off' }
  | { status: 'loading' }
  | { status: 'ok'; entries: DailyEntry[] }
  | { status: 'error'; error: string };

const fmt = (n: number): string => n.toLocaleString('en-US');

/** Today's top scores. Fetched on mount and after a post; never blocks the rest of the screen. */
function Leaderboard({ date, board, mine, onRetry }: { date: string; board: Board; mine?: string; onRetry: () => void }) {
  return (
    <Panel title="Leaderboard" aside={<span>{date} UTC</span>}>
      {board.status === 'off' && (
        <DialogueBox>
          Leaderboard not configured in this build. You can still copy your result line and share it anywhere.
        </DialogueBox>
      )}
      {board.status === 'loading' && <p className="text-muted">Loading today’s scores…</p>}
      {board.status === 'error' && (
        <div className="space-y-2">
          <DialogueBox>Could not load the leaderboard: {board.error}</DialogueBox>
          <GameButton variant="ghost" size="sm" onClick={onRetry}>Try again</GameButton>
        </div>
      )}
      {board.status === 'ok' && board.entries.length === 0 && <p className="text-muted">No scores yet today. Be the first.</p>}
      {board.status === 'ok' && board.entries.length > 0 && (
        <div className="overflow-clip rounded-lg border-2 border-edge-dark">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-panel-inset font-display text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="w-9 px-2 py-1.5 text-left">#</th>
                <th className="px-2 py-1.5 text-left">Coach</th>
                <th className="hidden px-2 py-1.5 text-left sm:table-cell">Result</th>
                <th className="w-16 px-2 py-1.5 text-right">Score</th>
              </tr>
            </thead>
            <tbody>
              {board.entries.map((e, i) => {
                const you = e.runId === mine;
                return (
                  <tr key={e.runId} className={`${you ? 'bg-you-soft font-bold' : i % 2 ? 'bg-panel' : 'bg-panel-hi/40'} border-b border-edge-dark max-md:h-11`}>
                    <td className="px-2 py-1 font-display font-bold text-muted">{i + 1}</td>
                    <td className="px-2 py-1">
                      <div className="flex min-w-0 items-center gap-2">
                        {e.abbrev && <Crest abbrev={e.abbrev} size={20} side={you ? 'you' : undefined} />}
                        <span className="truncate">{e.nickname}</span>
                        {you && <span className="shrink-0 rounded bg-you px-1 text-[10px] font-extrabold uppercase">You</span>}
                      </div>
                      {e.result && <div className="truncate text-xs text-muted sm:hidden">{e.result}</div>}
                    </td>
                    <td className="hidden px-2 py-1 text-muted sm:table-cell">{e.result ?? ''}</td>
                    <td className="px-2 py-1 text-right font-display font-bold tabular-nums text-poke-yellow">{fmt(e.score)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {board.status !== 'off' && <p className="mt-2 text-xs text-faint">Scores from {apiHost()}. One entry per run.</p>}
    </Panel>
  );
}

export function DailyScreen() {
  const run = useGame((s) => s.run);
  const go = useGame((s) => s.go);
  const startDaily = useGame((s) => s.startDaily);
  const dailySaveDate = useGame((s) => s.dailySaveDate);
  const [today] = useState(() => dailyDate());
  const info = dailyInfo(today);
  const c = info.config;

  // Today's daily: the live run when it is loaded, else the saved one (parsed once).
  const active = run?.daily?.date === today ? run : null;
  const saved = useMemo(
    () => active ?? (dailySaveDate === today ? loadDailySave() : null),
    [active, dailySaveDate, today],
  );
  const over = saved ? isRunOver(saved) : false;
  const summary = saved ? summarizeRun(saved) : null;
  const olderDate = dailySaveDate && dailySaveDate !== today ? dailySaveDate : null;

  const [board, setBoard] = useState<Board>(() => (apiEnabled() ? { status: 'loading' } : { status: 'off' }));
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!apiEnabled()) return;
    let live = true;
    setBoard({ status: 'loading' });
    void fetchDailyBoard(today).then((res) => {
      if (!live) return;
      setBoard(res.ok ? { status: 'ok', entries: res.data.entries } : { status: 'error', error: res.error });
    });
    return () => { live = false; };
  }, [today, tick]);
  const refresh = () => setTick((t) => t + 1);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="title-band flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-3xl font-bold uppercase leading-none">Daily League</h1>
        <span className="rounded-full bg-panel-inset px-3 py-1 font-display font-bold text-poke-yellow tabular-nums">{today} UTC</span>
      </div>

      <Panel title="Today’s league">
        <p className="font-semibold">
          Everyone who plays today drafts against the same coaches and the same AI picks. One attempt per day.
        </p>
        <p className="mt-2 font-display font-bold text-poke-yellow">
          {c.teams} coaches · {c.weeks} weeks · top {c.playoffTeams} · {c.budget} pts · loss cap {c.lossCap}
        </p>
        <p className="mt-2 text-sm text-muted">
          How scoring works: {DAILY_SCORE.win} per regular-season win, {DAILY_SCORE.differential} per point of
          differential (plus or minus), {DAILY_SCORE.playoffWin} per playoff win, {DAILY_SCORE.title} for the title.
        </p>
      </Panel>

      <Panel title="Your coach">
        <NicknameField hint={saved ? 'Shown on the daily leaderboard. Today’s coach name is already set.' : 'Shown on the daily leaderboard and used as your coach name.'} />
      </Panel>

      {saved && over && summary ? (
        <Panel title="Today’s result">
          <div className="flex flex-col items-center gap-2 py-2 text-center">
            <div className="font-display text-xl font-bold">{resultLabel(summary)}</div>
            <div className="font-display text-4xl font-bold text-poke-yellow tabular-nums">{fmt(summary.score)} <span className="text-xl">pts</span></div>
          </div>
          <div className="mt-3 space-y-3">
            <ShareLine run={saved} />
            <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
              <PostScoreButton run={saved} onPosted={refresh} />
            </div>
            <p className="text-center text-sm text-muted">Come back tomorrow (00:00 UTC) for a new league.</p>
          </div>
        </Panel>
      ) : (
        <Panel>
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            {saved && summary && (
              <p className="text-muted">
                In progress: <b className="text-ink">{resultLabel(summary)}</b> · {fmt(summary.score)} pts so far
              </p>
            )}
            {!saved && olderDate && (
              <DialogueBox className="w-full text-left">Starting today’s league replaces your daily run from {olderDate}.</DialogueBox>
            )}
            <GameButton size="lg" onClick={startDaily}>{saved ? 'Continue today’s league' : 'Play today’s league'}</GameButton>
          </div>
        </Panel>
      )}

      <Leaderboard date={today} board={board} mine={saved?.id} onRetry={refresh} />

      <div className="flex justify-start">
        <GameButton variant="ghost" onClick={() => go('title')}>Back to title</GameButton>
      </div>
    </div>
  );
}
