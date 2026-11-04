import { useEffect } from 'react';
import type { EliminationReason, RunState, SpeciesId } from '@pdc/engine';
import { computeStandings, decisiveMatch, humanCoach, opponentOf, regularSeasonRecord, runScore, scoreBreakdown } from '@pdc/engine';
import { useGame, weekLabel } from '../store/useGame';
import { useProfile } from '../store/profile';
import { PostScoreButton, ShareLine } from '../components/DailyBits';
import { BadgeEmblem, Crest, DialogueBox, GameButton, Panel, PokeIcon } from '../components/ui';
import { badgeLabel, badgeName } from '../game/badges';
import { scoreLine, speciesName, spriteName } from '../game/names';
import { StandingsTable } from '../components/StandingsTable';
import { Bracket } from '../components/Bracket';
import { MvpStrip } from '../components/MvpStrip';

const REASON: Record<EliminationReason, string> = {
  lossCap: 'You passed the loss cap. One loss too many in the regular season ends the run.',
  missedPlayoffs: 'You finished outside the playoff spots when the regular season ended.',
  playoffLoss: 'You lost a playoff match. Playoffs are single elimination.',
};

function Trophy() {
  return (
    <svg viewBox="0 0 120 120" width={120} height={120} aria-hidden="true">
      <path d="M30 18h60v22c0 22-14 36-30 36S30 62 30 40z" fill="var(--color-poke-yellow)" stroke="var(--color-poke-yellow-dark)" strokeWidth="4" />
      <path d="M30 26H16c0 16 8 24 18 26M90 26h14c0 16-8 24-18 26" fill="none" stroke="var(--color-poke-yellow-dark)" strokeWidth="5" strokeLinecap="round" />
      <rect x="52" y="74" width="16" height="16" fill="var(--color-poke-yellow-dark)" />
      <rect x="36" y="90" width="48" height="12" rx="3" fill="var(--color-poke-yellow)" stroke="var(--color-poke-yellow-dark)" strokeWidth="4" />
      <circle cx="60" cy="42" r="10" fill="var(--color-cream)" stroke="var(--color-poke-yellow-dark)" strokeWidth="3" />
    </svg>
  );
}

const DECIDER_TITLE: Record<EliminationReason | 'champion', string> = {
  champion: 'The final',
  playoffLoss: 'The match that knocked you out',
  lossCap: 'The loss that ended it',
  missedPlayoffs: 'Your last regular-season match',
};

function LineupIcons({ ids, label }: { ids: SpeciesId[]; label: string }) {
  if (ids.length === 0) return <span className="text-sm text-faint">No lineup recorded</span>;
  return (
    <span className="flex flex-wrap gap-0.5" aria-label={label}>
      {ids.map((id) => <PokeIcon key={id} name={spriteName(id)} title={speciesName(id)} />)}
    </span>
  );
}

/** The match that decided the run: crests, score, both lineups. */
function DecisiveMatch({ run }: { run: RunState }) {
  const m = decisiveMatch(run);
  if (!m?.result) return null;
  const human = humanCoach(run);
  const opp = opponentOf(run, m);
  const won = m.result.winner === human.id;
  const title = DECIDER_TITLE[run.phase === 'champion' ? 'champion' : run.eliminationReason ?? 'lossCap'];
  return (
    <Panel title={title} aside={<span>{weekLabel(run, m.week, m)}</span>}>
      <div className="flex items-center justify-center gap-3 sm:gap-6">
        <Crest abbrev={human.abbrev} size={48} side="you" />
        <div className="flex flex-col items-center">
          <span className="font-display text-3xl font-bold tabular-nums">{scoreLine(m, human.id)}</span>
          <span className={`font-display font-bold uppercase ${won ? 'text-poke-yellow' : 'text-opp'}`}>{won ? 'Won' : 'Lost'}</span>
        </div>
        <Crest abbrev={opp.abbrev} size={48} side="opp" />
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border-2 border-you bg-you-soft px-3 py-2">
          <div className="mb-1 truncate font-display font-bold">{human.name}</div>
          <LineupIcons ids={m.result.lineups[human.id] ?? []} label={`${human.name} lineup`} />
        </div>
        <div className="rounded-lg border-2 border-opp bg-opp-soft px-3 py-2">
          <div className="mb-1 truncate font-display font-bold">{opp.name}</div>
          <LineupIcons ids={m.result.lineups[opp.id] ?? []} label={`${opp.name} lineup`} />
        </div>
      </div>
    </Panel>
  );
}

/** Runs, titles and the badge ladder so far, with the way into the Hall of Fame. */
function CareerStrip({ onOpen }: { onOpen: () => void }) {
  const runs = useProfile((s) => s.runs);
  const stakeUnlocked = useProfile((s) => s.stakeUnlocked);
  const titles = runs.filter((r) => r.phase === 'champion').length;
  const cells: [string, number][] = [['Runs', runs.length], ['Titles', titles], ['Badge unlocked', stakeUnlocked]];
  return (
    <Panel title="Career so far">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <dl className="grid flex-1 grid-cols-3 gap-2">
          {cells.map(([label, n]) => (
            <div key={label} className="game-inset flex flex-col-reverse items-center px-2 py-2 text-center">
              <dt className="text-sm font-bold uppercase tracking-wide text-muted">{label}</dt>
              <dd className="font-display text-2xl font-bold leading-none text-poke-yellow tabular-nums">{n}</dd>
            </div>
          ))}
        </dl>
        <GameButton variant="secondary" onClick={onOpen}>Hall of Fame</GameButton>
      </div>
    </Panel>
  );
}

/** The final score, big, with the lines it adds up from (a minus differential shows as a deduction). */
function ScoreHero({ run }: { run: RunState }) {
  const lines = scoreBreakdown(run).filter((l) => l.count !== 0);
  const total = runScore(run);
  const raw = lines.reduce((t, l) => t + l.points, 0);
  const fmt = (n: number) => Math.abs(n).toLocaleString('en-US');
  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="text-center">
        <div className="font-display text-sm font-bold uppercase tracking-widest text-muted">Final score</div>
        <div className="font-display text-6xl font-bold leading-none text-poke-yellow tabular-nums sm:text-7xl">{total.toLocaleString('en-US')}</div>
        <div className="font-display text-sm font-bold uppercase tracking-widest text-muted">points</div>
      </div>
      {lines.length > 0 && (
        <dl className="mt-3 divide-y divide-edge rounded-xl bg-panel-inset px-3 py-1 text-sm">
          {lines.map((l) => (
            <div key={l.key} className="flex items-baseline justify-between gap-3 py-1.5">
              <dt>
                {l.label}
                {l.key !== 'title' && <span className="text-muted tabular-nums"> {l.count} × {l.each}</span>}
              </dt>
              <dd className={`font-bold tabular-nums ${l.points < 0 ? 'text-loss' : ''}`}>{l.points < 0 ? '−' : '+'}{fmt(l.points)}</dd>
            </div>
          ))}
          {raw < 0 && (
            <div className="flex items-baseline justify-between gap-3 py-1.5 text-muted">
              <dt>Scores never go below 0</dt><dd className="tabular-nums">+{fmt(raw)}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

export function EndScreen() {
  const run = useGame((s) => s.run);
  const go = useGame((s) => s.go);
  const justUnlockedBy = useProfile((s) => s.justUnlockedBy);
  const recordRunEnd = useProfile((s) => s.recordRunEnd);
  // The save subscription records a run as it ends; this covers a finished run loaded before the career existed.
  useEffect(() => { if (run) recordRunEnd(run); }, [run, recordRunEnd]);
  if (!run) return null;
  const human = humanCoach(run);
  const rec = regularSeasonRecord(run, human.id);
  const playoffWins = run.matches.filter((m) => m.playoffRound !== undefined && m.result?.winner === human.id).length;
  const champion = run.phase === 'champion';
  const reason = run.eliminationReason;
  const hadPlayoffs = run.matches.some((m) => m.playoffRound !== undefined);
  const daily = run.daily;
  const outcome = champion ? 'League champions!' : 'Run over';
  const unlocked = !daily && justUnlockedBy === run.id;
  return (
    <div className="mx-auto max-w-3xl space-y-4 py-4">
      <Panel>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          {champion ? <Trophy /> : <Crest abbrev={human.abbrev} size={88} side="you" />}
          <h1 className={`font-display text-4xl font-bold uppercase ${champion ? 'text-poke-yellow' : ''}`}>
            {daily ? `Daily League · ${daily.date}` : outcome}
          </h1>
          {daily && <div className={`font-display text-2xl font-bold uppercase ${champion ? 'text-poke-yellow' : ''}`}>{outcome}</div>}
          {!daily && (
            <div className="flex items-center gap-2 rounded-full bg-panel-inset py-1 pl-1.5 pr-3 font-display font-bold uppercase tracking-wide">
              <BadgeEmblem stake={run.config.stake} state={champion ? 'earned' : 'open'} size={24} />
              {champion ? `${badgeName(run.config.stake)} earned` : badgeLabel(run.config.stake)}
            </div>
          )}
          {unlocked && <div className="font-display text-2xl font-bold uppercase text-poke-yellow">{badgeLabel(run.config.stake + 1)} unlocked</div>}
          <div className="font-display text-xl font-bold">{human.name}</div>
          <div className="text-lg">
            Regular season <b className="tabular-nums">{rec.wins}-{rec.losses}</b>
            {hadPlayoffs && <> · playoff wins <b className="tabular-nums">{playoffWins}</b></>}
          </div>
          <ScoreHero run={run} />
        </div>
        {!champion && reason && <DialogueBox>{REASON[reason]}</DialogueBox>}
        {champion && !daily && (
          <DialogueBox>
            {unlocked
              ? `You drafted, prepped and survived the bracket. You earned the ${badgeName(run.config.stake)}, and ${badgeLabel(run.config.stake + 1)} is open on the setup screen.`
              : 'You drafted, prepped and survived the bracket. Try a bigger league or a tighter loss cap next.'}
          </DialogueBox>
        )}
        {champion && daily && <DialogueBox>You drafted, prepped and survived the bracket. Post your score and see how the rest of today’s coaches did.</DialogueBox>}
      </Panel>
      <Panel title="Share">
        <ShareLine run={run} />
        {daily && <div className="mt-3 flex justify-center"><PostScoreButton run={run} /></div>}
      </Panel>
      <DecisiveMatch run={run} />
      <CareerStrip onOpen={() => go('hall')} />
      {hadPlayoffs && (
        <Panel title="Playoffs"><Bracket run={run} /></Panel>
      )}
      <Panel title="Final standings">
        <StandingsTable run={run} rows={computeStandings(run.coaches, run.matches)} cutAfter={run.config.playoffTeams} compact />
      </Panel>
      <MvpStrip run={run} onOpenAnalytics={() => go('analytics')} />
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        <GameButton variant="secondary" onClick={() => go('analytics')}>Full analytics</GameButton>
        {daily
          ? <GameButton size="lg" onClick={() => go('daily')}>Back to Daily League</GameButton>
          : <GameButton size="lg" onClick={() => go(run.config.custom ? 'setup' : 'badgerun')}>New league</GameButton>}
        <GameButton variant="ghost" onClick={() => go('title')}>Title screen</GameButton>
      </div>
    </div>
  );
}
