import type { EliminationReason } from '@pdc/engine';
import { computeStandings, humanCoach, regularSeasonRecord, runScore } from '@pdc/engine';
import { useGame } from '../store/useGame';
import { PostScoreButton, ShareLine } from '../components/DailyBits';
import { Crest, DialogueBox, GameButton, Panel } from '../components/ui';
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

export function EndScreen() {
  const run = useGame((s) => s.run);
  const go = useGame((s) => s.go);
  if (!run) return null;
  const human = humanCoach(run);
  const rec = regularSeasonRecord(run, human.id);
  const playoffWins = run.matches.filter((m) => m.playoffRound !== undefined && m.result?.winner === human.id).length;
  const champion = run.phase === 'champion';
  const reason = run.eliminationReason;
  const hadPlayoffs = run.matches.some((m) => m.playoffRound !== undefined);
  const daily = run.daily;
  const outcome = champion ? 'League champions!' : 'Run over';
  return (
    <div className="mx-auto max-w-3xl space-y-4 py-4">
      <Panel>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          {champion ? <Trophy /> : <Crest abbrev={human.abbrev} size={88} side="you" />}
          <h1 className={`font-display text-4xl font-bold uppercase ${champion ? 'text-poke-yellow' : ''}`}>
            {daily ? `Daily League · ${daily.date}` : outcome}
          </h1>
          {daily && <div className={`font-display text-2xl font-bold uppercase ${champion ? 'text-poke-yellow' : ''}`}>{outcome}</div>}
          <div className="font-display text-xl font-bold">{human.name}</div>
          <div className="text-lg">
            Regular season <b className="tabular-nums">{rec.wins}-{rec.losses}</b>
            {hadPlayoffs && <> · playoff wins <b className="tabular-nums">{playoffWins}</b></>}
          </div>
        </div>
        {!champion && reason && <DialogueBox>{REASON[reason]}</DialogueBox>}
        {champion && !daily && <DialogueBox>You drafted, prepped and survived the bracket. Try a bigger league or a tighter loss cap next.</DialogueBox>}
        {champion && daily && <DialogueBox>You drafted, prepped and survived the bracket. Post your score and see how the rest of today’s coaches did.</DialogueBox>}
      </Panel>
      <Panel title="Score" aside={<span className="font-display text-xl font-bold text-poke-yellow tabular-nums">{runScore(run).toLocaleString('en-US')} pts</span>}>
        <ShareLine run={run} />
        {daily && <div className="mt-3 flex justify-center"><PostScoreButton run={run} /></div>}
      </Panel>
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
          : <GameButton size="lg" onClick={() => go('setup')}>New league</GameButton>}
        <GameButton variant="ghost" onClick={() => go('title')}>Title screen</GameButton>
      </div>
    </div>
  );
}
