// Small pieces the Daily League screen, the run-end screen and Settings share: the nickname field, the share
// line with its Copy button, and the Post score button (with the reason it is disabled).
import { useId, useState } from 'react';
import type { RunState } from '@pdc/engine';
import { shareString, summarizeRun } from '@pdc/engine';
import { apiEnabled } from '../game/api';
import { useGame } from '../store/useGame';
import { cleanNickname, NICKNAME_MAX, useSettings } from '../store/settings';
import { GameButton } from './ui';

export const isRunOver = (run: RunState): boolean => run.phase === 'champion' || run.phase === 'eliminated';

/** The leaderboard nickname, bound to settings (stored trimmed). */
export function NicknameField({ hint = 'Shown on the daily leaderboard.' }: { hint?: string }) {
  const nickname = useSettings((s) => s.nickname);
  const update = useSettings((s) => s.update);
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-bold uppercase tracking-wide text-muted">Nickname</label>
      <input
        id={id}
        className="field"
        value={nickname}
        maxLength={NICKNAME_MAX}
        autoComplete="nickname"
        placeholder="Ash"
        onChange={(e) => update({ nickname: e.target.value })}
        onBlur={() => { const clean = cleanNickname(nickname); if (clean !== nickname) update({ nickname: clean }); }}
      />
      <span className="text-sm text-muted">{hint}</span>
    </div>
  );
}

async function copyText(text: string, toast: (t: string) => void): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to the clipboard.');
  } catch {
    toast(`Could not copy here. Select the line and copy it: ${text}`);
  }
}

/** The one-line result to paste anywhere, with a Copy button. */
export function ShareLine({ run }: { run: RunState }) {
  const setToast = useGame((s) => s.setToast);
  const line = shareString(summarizeRun(run));
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <output className="game-inset min-w-0 flex-1 select-all break-words px-3 py-2 text-sm font-semibold">{line}</output>
      <GameButton variant="secondary" size="sm" onClick={() => void copyText(line, setToast)}>Copy</GameButton>
    </div>
  );
}

/** Why the daily score cannot be posted right now, or null when it can. */
function postBlocker(run: RunState, nickname: string): string | null {
  if (!apiEnabled()) return 'Leaderboard not configured in this build.';
  if (!isRunOver(run)) return 'Finish the league to post your score.';
  if (!cleanNickname(nickname)) return 'Set a nickname to post your score.';
  return null;
}

/** "Post score" for a finished daily run; turns into "Posted · rank #N" once this score is on the board. */
export function PostScoreButton({ run, onPosted }: { run: RunState; onPosted?: () => void }) {
  const postScore = useGame((s) => s.postScore);
  const posted = useGame((s) => s.posted[run.id]);
  const nickname = useSettings((s) => s.nickname);
  const [busy, setBusy] = useState(false);
  const score = summarizeRun(run).score;
  const done = posted !== undefined && posted.score >= score;
  const blocker = done ? null : postBlocker(run, nickname);
  const label = done ? `Posted${posted.rank !== undefined ? ` · rank #${posted.rank}` : ''}` : busy ? 'Posting…' : 'Post score';
  return (
    <div className="flex flex-col items-center gap-1">
      <GameButton
        disabled={done || busy || blocker !== null}
        onClick={async () => {
          setBusy(true);
          const ok = await postScore();
          setBusy(false);
          if (ok) onPosted?.();
        }}
      >
        {label}
      </GameButton>
      {blocker && <span className="text-center text-sm text-muted">{blocker}</span>}
    </div>
  );
}
