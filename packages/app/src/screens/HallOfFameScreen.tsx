// The career across runs: totals and badges (titles per stake), every finished run newest first, and the trophy case
// (every species you finished a run with). Reads the profile store only; cards, never tables, so it fits a phone.
import { useId, useMemo, useState } from 'react';
import type { CareerRun, SpeciesId, Trophy } from '@pdc/engine';
import { careerStats, leagueCodeOf, resultLabel, shareString, STAKES } from '@pdc/engine';
import { useGame } from '../store/useGame';
import { useProfile } from '../store/profile';
import { copyText } from '../components/DailyBits';
import { speciesName, spriteName } from '../game/names';
import { BadgeEmblem, DialogueBox, GameButton, Panel, PokeIcon, PokeSprite } from '../components/ui';
import { badgeLabel, badgeName } from '../game/badges';

const RUNS_PAGE = 20;
const TROPHY_PAGE = 24;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="game-inset flex flex-col items-center gap-0.5 px-2 py-2 text-center">
      <span className="font-display text-2xl font-bold leading-none text-poke-yellow tabular-nums">{value}</span>
      <span className="text-sm font-bold uppercase tracking-wide text-muted">{label}</span>
    </div>
  );
}

/** The badge case: one emblem per stake, lit once you have won a league there, a padlock above the unlocked one. */
function BadgeCase({ titlesPerStake, unlocked }: { titlesPerStake: number[]; unlocked: number }) {
  return (
    <ul className="grid max-w-lg grid-cols-10 gap-1 sm:gap-1.5" aria-label="Badges">
      {STAKES.map(({ stake }) => {
        const n = titlesPerStake[stake - 1] ?? 0;
        const state = n > 0 ? 'earned' : stake > unlocked ? 'locked' : 'open';
        const text = `${badgeLabel(stake)}, ${badgeName(stake)}: ${n > 0 ? `${n} title${n === 1 ? '' : 's'}` : state === 'locked' ? 'locked' : 'not earned yet'}`;
        return (
          <li key={stake} title={text} aria-label={text} className={`flex flex-col items-center gap-0.5 ${state === 'open' ? 'opacity-50' : ''}`}>
            <BadgeEmblem stake={stake} state={state} size={36} className="max-sm:h-7 max-sm:w-7" />
            <span className={`font-display text-xs font-bold leading-none tabular-nums ${n > 0 ? 'text-poke-yellow' : 'text-faint'}`}>{n > 1 ? `×${n}` : stake}</span>
          </li>
        );
      })}
    </ul>
  );
}

const pct = (x: number): string => `${Math.round(x * 100)}%`;

function runDate(r: CareerRun): string {
  return r.daily ?? new Date(r.finishedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function RunCard({ r }: { r: CareerRun }) {
  const setToast = useGame((s) => s.setToast);
  const champion = r.phase === 'champion';
  return (
    <li className={`flex flex-col gap-2 rounded-lg border-2 px-3 py-2 sm:flex-row sm:items-center sm:gap-3 ${champion ? 'border-poke-yellow-dark bg-panel-hi' : 'border-edge bg-panel-inset'}`}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="font-bold text-muted">{runDate(r)}</span>
          <span className="rounded-full bg-panel px-2 py-0.5 font-display font-bold uppercase tracking-wide">{r.daily ? 'Daily' : `${r.config.teams}-team league`}</span>
          {!r.daily && <span className="rounded-full bg-panel px-2 py-0.5 font-display font-bold uppercase tracking-wide">{badgeLabel(r.config.stake)}</span>}
          <span className="text-faint">league {leagueCodeOf(r.seed)}</span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className={`font-display text-lg font-bold ${champion ? 'text-poke-yellow' : ''}`}>{resultLabel(r)}</span>
          <span className="truncate text-sm text-muted">{r.humanName}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {r.mvp && (
          <span className="flex items-center gap-1 text-sm text-muted" title={`MVP: ${speciesName(r.mvp.species)}`}>
            <PokeIcon name={spriteName(r.mvp.species)} title={`MVP: ${speciesName(r.mvp.species)}`} />
            <span className="max-sm:hidden">MVP</span>
          </span>
        )}
        <span className="font-display text-lg font-bold tabular-nums text-poke-yellow">{r.score.toLocaleString('en-US')} pts</span>
        <GameButton variant="secondary" size="sm" className="ml-auto sm:ml-0" onClick={() => void copyText(shareString(r), setToast)} aria-label="Copy share line">
          Copy share line
        </GameButton>
      </div>
    </li>
  );
}

function TrophyCard({ id, t }: { id: SpeciesId; t: Trophy }) {
  const name = speciesName(id);
  return (
    <li className={`flex items-center gap-2 rounded-lg border-2 px-2 py-2 ${t.titles > 0 ? 'border-poke-yellow-dark bg-panel-hi' : 'border-edge bg-panel-inset'}`}>
      <PokeSprite name={spriteName(id)} size={56} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-display font-bold" title={name}>{name}</div>
        <dl className="grid grid-cols-2 gap-x-2 text-sm text-muted">
          <div><dt className="inline">Titles </dt><dd className="inline font-bold text-ink tabular-nums">{t.titles}</dd></div>
          <div><dt className="inline">MVP </dt><dd className="inline font-bold text-ink tabular-nums">{t.mvp}</dd></div>
          <div><dt className="inline">PO wins </dt><dd className="inline font-bold text-ink tabular-nums">{t.playoffWins}</dd></div>
          <div><dt className="inline">Runs </dt><dd className="inline font-bold text-ink tabular-nums">{t.drafted}</dd></div>
        </dl>
      </div>
    </li>
  );
}

function TrophyCase({ trophies }: { trophies: Record<SpeciesId, Trophy> }) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(TROPHY_PAGE);
  const inputId = useId();
  const sorted = useMemo(
    () => Object.entries(trophies)
      .map(([id, t]) => ({ id, t, name: speciesName(id) }))
      .sort((a, b) => b.t.titles - a.t.titles || b.t.mvp - a.t.mvp || b.t.playoffWins - a.t.playoffWins
        || b.t.drafted - a.t.drafted || a.name.localeCompare(b.name)),
    [trophies],
  );
  const q = query.trim().toLowerCase();
  const shown = q ? sorted.filter((x) => x.name.toLowerCase().includes(q)) : sorted;
  return (
    <Panel title="Trophy case" aside={<span>{sorted.length} species</span>}>
      <div className="mb-3 flex flex-col gap-1">
        <label htmlFor={inputId} className="sr-only">Filter species</label>
        <input id={inputId} className="field" type="search" placeholder="Filter species" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(TROPHY_PAGE); }} />
      </div>
      {shown.length === 0
        ? <p className="text-muted">No species match “{query.trim()}”.</p>
        : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {shown.slice(0, limit).map((x) => <TrophyCard key={x.id} id={x.id} t={x.t} />)}
          </ul>
        )}
      {shown.length > limit && (
        <div className="mt-3 flex justify-center">
          <GameButton variant="ghost" onClick={() => setLimit((n) => n + TROPHY_PAGE)}>Show more ({shown.length - limit} left)</GameButton>
        </div>
      )}
    </Panel>
  );
}

export function HallOfFameScreen() {
  const go = useGame((s) => s.go);
  const run = useGame((s) => s.run);
  const runs = useProfile((s) => s.runs);
  const trophies = useProfile((s) => s.trophies);
  const stakeUnlocked = useProfile((s) => s.stakeUnlocked);
  const [limit, setLimit] = useState(RUNS_PAGE);
  const stats = useMemo(() => careerStats({ version: 2, stakeUnlocked, runs, trophies }), [stakeUnlocked, runs, trophies]);
  const newestFirst = useMemo(() => [...runs].reverse(), [runs]);
  const runOver = run && (run.phase === 'champion' || run.phase === 'eliminated');

  return (
    <div className="mx-auto max-w-4xl space-y-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold uppercase text-poke-yellow drop-shadow-[0_3px_0_var(--color-edge-dark)] sm:text-4xl">Hall of Fame</h1>
        <div className="flex gap-2">
          {runOver && <GameButton variant="secondary" size="sm" onClick={() => go('end')}>Run summary</GameButton>}
          <GameButton variant="ghost" size="sm" onClick={() => go('title')}>Title screen</GameButton>
        </div>
      </div>

      <Panel title="Career" aside={<span>{badgeLabel(stakeUnlocked)} unlocked</span>}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Runs" value={String(stats.runs)} />
          <Stat label="Titles" value={String(stats.titles)} />
          <Stat label="Best badge" value={stats.bestStakeWon > 0 ? String(stats.bestStakeWon) : '–'} />
          <Stat label="Win rate" value={stats.runs > 0 ? pct(stats.winRate) : '–'} />
          <Stat label="Best score" value={stats.bestScore.toLocaleString('en-US')} />
          <Stat label="Title streak" value={String(stats.longestTitleStreak)} />
        </div>
        <div className="mt-4">
          <div className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">Badges</div>
          <BadgeCase titlesPerStake={stats.titlesPerStake} unlocked={stakeUnlocked} />
        </div>
      </Panel>

      {runs.length === 0
        ? (
          <Panel>
            <DialogueBox>No finished runs yet. Every league you finish, won or lost, lands here with its record, its score and its MVP.</DialogueBox>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <GameButton size="lg" onClick={() => go('setup')}>Start your first league</GameButton>
              <GameButton variant="secondary" onClick={() => go('daily')}>Daily League</GameButton>
            </div>
          </Panel>
        )
        : (
          <>
            <Panel title="Runs" aside={<span>Newest first</span>}>
              <ul className="space-y-2">
                {newestFirst.slice(0, limit).map((r) => <RunCard key={r.runId} r={r} />)}
              </ul>
              {newestFirst.length > limit && (
                <div className="mt-3 flex justify-center">
                  <GameButton variant="ghost" onClick={() => setLimit((n) => n + RUNS_PAGE)}>Show more ({newestFirst.length - limit} left)</GameButton>
                </div>
              )}
            </Panel>
            <TrophyCase trophies={trophies} />
          </>
        )}
    </div>
  );
}
