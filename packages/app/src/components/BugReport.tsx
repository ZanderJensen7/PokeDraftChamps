import { useEffect, useRef, useState } from 'react';
import { humanCoach, nextHumanMatch, opponentOf } from '@pdc/engine';
import { APP_VERSION, REPO_URL } from '../app/version';
import { recentErrors } from '../app/errorLog';
import { useGame, RUN_KEY, weekLabel } from '../store/useGame';
import { leagueCode } from '../game/names';
import { GameButton, ResponsiveDialog } from './ui';

const BODY_LIMIT = 6000;
const TEXT_LIMIT = 1500;

/** The facts attached to every report, as label/value rows. Read-only snapshot of the store and browser. */
function contextRows(): Array<[string, string]> {
  const { run, screen, returnTo } = useGame.getState();
  const rows: Array<[string, string]> = [['Version', APP_VERSION.label], ['Built', APP_VERSION.builtAt]];
  rows.push(['Screen', screen === 'settings' || screen === 'team' ? `${screen} (opened from ${returnTo})` : screen]);
  if (run) {
    const human = humanCoach(run);
    const match = nextHumanMatch(run);
    rows.push(['League', `code ${leagueCode(run.seed)} · ${run.config.teams} teams`]);
    rows.push(['Progress', `${weekLabel(run)} · phase ${run.phase}`]);
    rows.push(['Your coach', human.abbrev]);
    if (match) rows.push(['Next opponent', opponentOf(run, match).abbrev]);
  } else {
    rows.push(['League', savedLeagueSummary()]);
  }
  rows.push(['Browser', navigator.userAgent]);
  rows.push(['Viewport', `${window.innerWidth}x${window.innerHeight}`]);
  let installed = false;
  try { installed = window.matchMedia('(display-mode: standalone)').matches; } catch { /* no matchMedia */ }
  rows.push(['Installed app', installed ? 'yes' : 'no']);
  let saveKb = 'none';
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (raw) saveKb = `${(raw.length / 1024).toFixed(1)} KB`;
  } catch { /* storage blocked */ }
  rows.push(['Save size', saveKb]);
  const errs = recentErrors();
  rows.push(['Recent errors', errs.length ? errs.join(' | ') : 'none']);
  return rows;
}

/** On the title screen no run is loaded yet; describe the saved one from its JSON so a report still names it. */
function savedLeagueSummary(): string {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return 'none loaded, no save';
    const saved = JSON.parse(raw) as { seed?: number; config?: { teams?: number }; week?: number; phase?: string };
    if (typeof saved.seed !== 'number') return 'none loaded, save unreadable';
    return `none loaded; saved run: code ${leagueCode(saved.seed)} · ${saved.config?.teams ?? '?'} teams · week ${saved.week ?? '?'} · phase ${saved.phase ?? '?'}`;
  } catch {
    return 'none loaded, save unreadable';
  }
}

function buildBody(happened: string, expected: string, rows: Array<[string, string]>): string {
  const body = [
    '**What happened?**',
    happened.trim().slice(0, TEXT_LIMIT) || '_(not filled in)_',
    '',
    '**What did you expect?**',
    expected.trim().slice(0, TEXT_LIMIT) || '_(not filled in)_',
    '',
    '**Included automatically**',
    ...rows.map(([k, v]) => `- ${k}: ${v}`),
  ].join('\n');
  return body.slice(0, BODY_LIMIT);
}

function issueUrl(happened: string, body: string): string {
  const first = happened.trim().replace(/\s+/g, ' ').slice(0, 60);
  const title = `[bug] ${first || 'bug report'}`;
  return `${REPO_URL}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=bug`;
}

export function BugReport({ onClose }: { onClose: () => void }) {
  const [happened, setHappened] = useState('');
  const [expected, setExpected] = useState('');
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState(false);
  const [rows] = useState(contextRows);
  const fallbackRef = useRef<HTMLTextAreaElement>(null);
  const body = buildBody(happened, expected, rows);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  useEffect(() => {
    if (manual) fallbackRef.current?.select();
  }, [manual]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(body);
      setManual(false);
      setCopied(true);
    } catch {
      setManual(true);
      fallbackRef.current?.select();
    }
  };

  const openIssue = () => {
    window.open(issueUrl(happened, body), '_blank', 'noopener,noreferrer');
  };

  return (
    <ResponsiveDialog
      title="Report a bug"
      onClose={onClose}
      footer={(
        <>
          <GameButton variant="secondary" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy report'}</GameButton>
          <GameButton onClick={openIssue}>Open GitHub issue</GameButton>
        </>
      )}
    >
      <div className="space-y-3 text-base">
        <label className="block">
          <span className="mb-1 block font-display font-bold text-poke-yellow">What happened?</span>
          <textarea className="field w-full" rows={3} maxLength={TEXT_LIMIT} value={happened} onChange={(e) => setHappened(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block font-display font-bold text-poke-yellow">What did you expect?</span>
          <textarea className="field w-full" rows={2} maxLength={TEXT_LIMIT} value={expected} onChange={(e) => setExpected(e.target.value)} />
        </label>
        <div>
          <span className="mb-1 block font-display font-bold text-poke-yellow">Included automatically</span>
          <dl className="game-inset max-h-48 space-y-0.5 overflow-y-auto p-3 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="w-28 shrink-0 text-muted">{k}</dt>
                <dd className="min-w-0 break-words">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        {manual && (
          <label className="block">
            <span className="mb-1 block text-sm text-muted">Your browser blocked copying. Select all and copy by hand:</span>
            <textarea ref={fallbackRef} readOnly className="field w-full text-sm" rows={5} value={body} onFocus={(e) => e.currentTarget.select()} />
          </label>
        )}
        <p className="text-sm text-muted">
          Nothing is sent automatically: Open GitHub issue prefills a new issue that you review and submit yourself.
          Attach your save from Settings → Export save if the bug needs it.
        </p>
      </div>
    </ResponsiveDialog>
  );
}
