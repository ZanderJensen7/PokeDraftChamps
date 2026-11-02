import { useGame } from '../store/useGame';
import { Crest, DialogueBox, GameButton, Panel } from '../components/ui';
import { StandingsTable } from '../components/StandingsTable';
import { abbrevOf, coachName, scoreLine } from '../game/names';

export function RecapScreen() {
  const run = useGame((s) => s.run);
  const recap = useGame((s) => s.lastWeekResults);
  const go = useGame((s) => s.go);
  if (!run || !recap || !recap.match.result) {
    return (
      <div className="space-y-3">
        <DialogueBox>No results to show.</DialogueBox>
        <GameButton onClick={() => go('hub')}>Back to hub</GameButton>
      </div>
    );
  }
  const r = recap.match.result;
  const won = r.winner === run.humanId;
  const oppId = recap.match.home === run.humanId ? recap.match.away : recap.match.home;
  const mine = r.remaining[run.humanId] ?? 0;
  const theirs = r.remaining[oppId] ?? 0;
  const before = recap.before.find((x) => x.coach === run.humanId)?.rank;
  const after = recap.after.find((x) => x.coach === run.humanId)?.rank;
  const delta = before !== undefined && after !== undefined ? before - after : 0;
  const over = recap.phaseAfter === 'champion' || recap.phaseAfter === 'eliminated';
  const playoff = recap.match.playoffRound !== undefined;
  // The battle's real length: the last "|turn|N" in the stored log (older results may carry turns: 1).
  let turns = 0;
  for (const line of r.log ?? []) {
    const t = /^\|turn\|(\d+)/.exec(line);
    if (t) turns = Math.max(turns, Number(t[1]));
  }
  if (!turns) turns = r.turns ?? 0;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="title-band"><h1 className="font-display text-3xl font-bold uppercase leading-none">{recap.label} results</h1></div>

      <Panel>
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <div className={`font-display text-5xl font-bold uppercase ${won ? 'text-win' : 'text-loss'}`}>{won ? 'Victory!' : 'Defeat'}</div>
          <div className="flex items-center gap-4">
            <Crest abbrev={abbrevOf(run, run.humanId)} size={56} side="you" />
            <span className="font-display text-4xl font-bold tabular-nums">{mine}-{theirs}</span>
            <Crest abbrev={abbrevOf(run, oppId)} size={56} side="opp" />
          </div>
          <div className="text-muted">vs {coachName(run, oppId)} · {turns} turn{turns === 1 ? '' : 's'}</div>
          {recap.placeholder && <span className="pixel rounded bg-poke-yellow px-2 py-1 text-cream-ink">PLACEHOLDER RESULT</span>}
        </div>
      </Panel>

      {recap.others.length > 0 && (
        <Panel title="Around the league">
          <ul className="grid gap-1 sm:grid-cols-2">
            {recap.others.map((m) => {
              const res = m.result;
              if (!res) return null;
              return (
                <li key={m.id} className="flex items-center gap-2 rounded-lg bg-panel-inset px-2 py-1">
                  <Crest abbrev={abbrevOf(run, res.winner)} size={20} />
                  <span className="font-display font-bold">{abbrevOf(run, res.winner)}</span>
                  <span className="text-muted">beat</span>
                  <Crest abbrev={abbrevOf(run, res.loser)} size={20} />
                  <span className="font-display font-bold">{abbrevOf(run, res.loser)}</span>
                  <span className="ml-auto font-bold tabular-nums">{scoreLine(m)}</span>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      {!playoff && (
        <Panel
          title="Standings"
          aside={before !== undefined && after !== undefined ? (
            <span className="font-display font-bold">
              #{before} → #{after}{' '}
              <span className={delta > 0 ? 'text-win' : delta < 0 ? 'text-loss' : 'text-muted'}>
                {delta > 0 ? `▲${delta}` : delta < 0 ? `▼${-delta}` : '—'}
              </span>
            </span>
          ) : undefined}
        >
          <StandingsTable run={run} rows={recap.after} previous={recap.before} cutAfter={run.config.playoffTeams} />
        </Panel>
      )}

      <div className="flex justify-end">
        <GameButton size="lg" onClick={() => go(over ? 'end' : 'hub')}>Continue</GameButton>
      </div>
    </div>
  );
}
