import { useEffect, useMemo, useState } from 'react';
import type { Coach, CoachId, Match, RosterEntry, RunState, SpeciesId } from '@pdc/engine';
import {
  computeStandings, conflictsWithRoster, getDraftMon, humanCoach, nextHumanMatch, opponentOf, regularSeasonRecord,
  rulesAt, visibleRoster,
} from '@pdc/engine';
import { useGame, weekLabel } from '../store/useGame';
import { getBridge } from '../game/bridge';
import { Crest, DialogueBox, GameButton, IconBadge, Panel, PriceBadge, ResponsiveDialog, TypePills } from '../components/ui';
import { StandingsTable } from '../components/StandingsTable';
import { Bracket } from '../components/Bracket';
import { CaptainPicker } from '../components/CaptainPicker';
import { MonDetailButton, MonInfoButton } from '../components/MonDetail';
import { FogNote } from '../components/FogNote';
import { WatchButton } from '../components/WatchButton';
import { hasPlayedMatches } from '../analytics/useAnalytics';
import { abbrevOf, coachName, displayName, rolesOf, scoreLine } from '../game/names';

function RosterRow({ roster, coachId, tone }: { roster: readonly RosterEntry[]; coachId: CoachId; tone: 'you' | 'opp' }) {
  return (
    <div className="flex flex-wrap gap-1">
      {roster.map((r) => (
        <MonDetailButton key={r.species} species={r.species} coachId={coachId}>
          <IconBadge
            name={getDraftMon(r.species)?.name ?? r.species}
            tone={tone}
            roles={rolesOf(r)}
          />
        </MonDetailButton>
      ))}
    </div>
  );
}

function recordText(run: RunState, id: string): string {
  const r = regularSeasonRecord(run, id);
  return `${r.wins}-${r.losses}`;
}

function MatchupCard({ run, match }: { run: RunState; match: Match }) {
  const human = humanCoach(run);
  const opp = opponentOf(run, match);
  const oppRoster = visibleRoster(run, opp.id, rulesAt(run.config.stake).fogOfWar ? getBridge().scout?.(run, opp.id) : undefined);
  const go = useGame((s) => s.go);
  const openOverlay = useGame((s) => s.openOverlay);
  const playMatch = useGame((s) => s.playMatch);
  return (
    <Panel title="Next match" aside={<span>{match.home === run.humanId ? 'Home' : 'Away'}</span>}>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-start">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Crest abbrev={human.abbrev} size={52} side="you" />
            <div className="min-w-0">
              <div className="truncate font-display text-xl font-bold">{human.name}</div>
              <div className="text-sm text-muted">{recordText(run, human.id)} · {human.pointsSpent} pts</div>
            </div>
          </div>
          <RosterRow roster={human.roster} coachId={human.id} tone="you" />
        </div>
        <div className="flex items-center gap-3 self-center font-display text-3xl font-bold text-poke-yellow sm:block sm:text-center">
          <span className="h-1 flex-1 rounded-full bg-edge-dark sm:hidden" />
          VS
          <span className="h-1 flex-1 rounded-full bg-edge-dark sm:hidden" />
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-3 sm:flex-row-reverse sm:text-right">
            <Crest abbrev={opp.abbrev} size={52} side="opp" />
            <div className="min-w-0">
              <div className="truncate font-display text-xl font-bold">{opp.name}</div>
              <div className="text-sm text-muted">{recordText(run, opp.id)} · {opp.pointsSpent} pts</div>
            </div>
          </div>
          <div className="sm:flex sm:justify-end"><RosterRow roster={oppRoster} coachId={opp.id} tone="opp" /></div>
          <FogNote shown={oppRoster.length} total={opp.roster.length} />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-end">
        <GameButton variant="secondary" onClick={() => openOverlay('team')} className="max-sm:min-h-12">Edit team</GameButton>
        <GameButton variant="secondary" onClick={() => go('prep')} className="max-sm:min-h-12">Prep helper</GameButton>
        <GameButton size="lg" onClick={() => void playMatch()} className="col-span-2 whitespace-nowrap max-sm:min-h-12">Start battle</GameButton>
      </div>
    </Panel>
  );
}

function FreeAgency({ run, onClose }: { run: RunState; onClose: () => void }) {
  const doFreeAgency = useGame((s) => s.doFreeAgency);
  const human = humanCoach(run);
  const left = run.config.freeAgencyMoves - run.freeAgencyUsed;
  const [drop, setDrop] = useState<SpeciesId | null>(null);
  const [keepAll, setKeepAll] = useState(false);
  const underMax = human.roster.length < run.config.rosterMax;
  const [add, setAdd] = useState<SpeciesId | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  // Signing builds the new mon's set, whose builder loads with the battle engine: start that download now.
  useEffect(() => { getBridge().loadBuildSets().catch(() => {}); }, []);
  const ready = !!drop || keepAll;
  const dropPts = drop ? (getDraftMon(drop)?.points ?? 0) : 0;
  const room = run.config.budget - human.pointsSpent + dropPts;
  const pool = useMemo(
    () => run.draft.available
      .map((id) => getDraftMon(id))
      .filter((m): m is NonNullable<typeof m> => !!m)
      .sort((a, b) => b.points - a.points || b.bst - a.bst),
    [run.draft.available],
  );
  const term = q.trim().toLowerCase();
  const shown = pool.filter((m) => !term || m.name.toLowerCase().includes(term) || displayName(m.name).toLowerCase().includes(term)).slice(0, 60);
  const keep = human.roster.map((r) => r.species).filter((s) => s !== drop);
  const sign = async () => {
    if (!ready || !add) return;
    setBusy(true);
    const ok = await doFreeAgency(drop, add);
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <ResponsiveDialog
      title="Free agency"
      wide
      full
      onClose={onClose}
      footer={
        <>
          <GameButton variant="ghost" onClick={onClose} className="max-md:min-h-11">Cancel</GameButton>
          <GameButton disabled={!ready || !add || left <= 0 || busy} onClick={sign} className="max-md:min-h-11 max-md:flex-1">
            {ready && add
              ? `${drop ? `Drop ${displayName(getDraftMon(drop)?.name ?? drop)}, sign` : 'Sign'} ${displayName(getDraftMon(add)?.name ?? add)}`
              : underMax ? 'Pick who to drop (or keep everyone) and who to sign' : 'Pick one to drop and one to sign'}
          </GameButton>
        </>
      }
    >
      <DialogueBox className="mb-4">
        {left > 0
          ? `${left} of ${run.config.freeAgencyMoves} moves left this season. A signed Pokemon inherits the dropped one's captain role (a Mega can't: pick a new captain under Captains).${underMax ? ' You have room on the roster, so you can also sign without dropping anyone.' : ''}`
          : 'No free-agency moves left this season.'}
      </DialogueBox>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="font-display font-bold uppercase tracking-wide">1. Drop</span>
            <span className="text-sm text-muted">Roster <b className="text-poke-yellow">{human.roster.length} / {run.config.rosterMax}</b></span>
          </div>
          <ul className="space-y-1">
            {underMax && (
              <li>
                <button
                  type="button"
                  aria-pressed={keepAll}
                  onClick={() => { setKeepAll(!keepAll); setDrop(null); setAdd(null); }}
                  className={`focus-ring flex min-h-11 w-full items-center gap-2 rounded-lg border-2 px-2 py-1 text-left ${keepAll ? 'border-win bg-you-soft' : 'border-transparent bg-panel-inset hover:border-edge'}`}
                >
                  <span className="flex-1 font-semibold">Keep everyone</span>
                  <span className="text-sm text-muted">Add without dropping</span>
                </button>
              </li>
            )}
            {human.roster.map((r) => {
              const m = getDraftMon(r.species);
              const on = drop === r.species;
              return (
                <li key={r.species} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => { setDrop(on ? null : r.species); setKeepAll(false); setAdd(null); }}
                    className={`focus-ring flex min-h-11 w-full items-center gap-2 rounded-lg border-2 px-2 py-1 text-left ${on ? 'border-loss bg-opp-soft' : 'border-transparent bg-panel-inset hover:border-edge'}`}
                  >
                    <IconBadge name={m?.name ?? r.species} roles={rolesOf(r)} tone="you" />
                    <span className="flex-1 truncate font-semibold">{displayName(m?.name ?? r.species)}</span>
                    <PriceBadge points={m?.points ?? 0} />
                  </button>
                  <MonInfoButton species={r.species} coachId={human.id} />
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="font-display font-bold uppercase tracking-wide">2. Sign</span>
            <span className="text-sm text-muted">Up to <b className="text-poke-yellow">{ready ? room : '—'}</b> pts</span>
          </div>
          <input className="field mb-2 w-full" placeholder="Search free agents" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search free agents" />
          <ul className="space-y-1 pr-1 md:max-h-80 md:overflow-y-auto">
            {shown.map((m) => {
              const ok = ready && m.points <= room && !conflictsWithRoster(keep, m.id);
              const on = add === m.id;
              return (
                <li key={m.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={!ok}
                    onClick={() => setAdd(on ? null : m.id)}
                    className={`focus-ring flex min-h-11 w-full items-center gap-2 rounded-lg border-2 px-2 py-1 text-left disabled:opacity-40 ${on ? 'border-win bg-you-soft' : 'border-transparent bg-panel-inset enabled:hover:border-edge'}`}
                  >
                    <IconBadge name={m.name} roles={m.isMega ? ['mega'] : []} />
                    <span className="flex-1 truncate font-semibold">{displayName(m.name)}</span>
                    <TypePills types={m.types} size="xs" />
                    <PriceBadge points={m.points} />
                  </button>
                  <MonInfoButton species={m.id} />
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </ResponsiveDialog>
  );
}

function Schedule({ run, onClose }: { run: RunState; onClose: () => void }) {
  const mine = run.matches.filter((m) => m.home === run.humanId || m.away === run.humanId);
  const others = run.matches.filter((m) => m.result && m.home !== run.humanId && m.away !== run.humanId).reverse();
  return (
    <ResponsiveDialog title="Your schedule" onClose={onClose}>
      <ul className="space-y-1">
        {mine.map((m) => {
          const oppId = m.home === run.humanId ? m.away : m.home;
          const r = m.result;
          const won = r?.winner === run.humanId;
          const current = !r && m.week === run.week;
          return (
            <li key={m.id} className={`flex min-h-11 items-center gap-2 rounded-lg px-2.5 py-1.5 sm:gap-3 sm:px-3 ${current ? 'bg-poke-yellow text-cream-ink' : 'bg-panel-inset'}`}>
              <span className="w-24 shrink-0 text-sm font-bold sm:w-28">{weekLabel(run, m.week, m)}</span>
              <Crest abbrev={abbrevOf(run, oppId)} size={22} side="opp" />
              <span className="flex-1 truncate font-semibold">{coachName(run, oppId)}</span>
              {r ? (
                <span className={`font-display font-bold ${won ? 'text-win' : 'text-loss'}`}>{won ? 'W' : 'L'} {scoreLine(m, run.humanId)}</span>
              ) : (
                <span className="text-sm font-bold">{current ? 'NEXT' : '—'}</span>
              )}
              <WatchButton match={m} />
            </li>
          );
        })}
      </ul>
      {others.length > 0 && (
        <>
          <h3 className="mb-1 mt-4 font-display text-sm font-bold uppercase tracking-wider text-muted">Around the league</h3>
          <ul className="space-y-1">
            {others.map((m) => (
              <li key={m.id} className="flex min-h-11 items-center gap-2 rounded-lg bg-panel-inset px-2.5 py-1.5 sm:gap-3 sm:px-3">
                <span className="w-24 shrink-0 text-sm font-bold sm:w-28">{weekLabel(run, m.week, m)}</span>
                <span className="flex-1 truncate font-display font-bold">
                  {abbrevOf(run, m.result!.winner)} <span className="font-sans font-normal text-muted">beat</span> {abbrevOf(run, m.result!.loser)}
                </span>
                <span className="font-bold tabular-nums">{scoreLine(m)}</span>
                <WatchButton match={m} />
              </li>
            ))}
          </ul>
        </>
      )}
    </ResponsiveDialog>
  );
}

function EventLog({ run, onClose }: { run: RunState; onClose: () => void }) {
  return (
    <ResponsiveDialog title="League log" onClose={onClose} full>
      {run.log.length === 0 ? (
        <p className="text-muted">Nothing has happened yet.</p>
      ) : (
        <ol className="space-y-1 text-sm">
          {[...run.log].reverse().map((line, i) => (
            <li key={i} className="rounded bg-panel-inset px-2 py-1">{line}</li>
          ))}
        </ol>
      )}
    </ResponsiveDialog>
  );
}

export function HubScreen() {
  const run = useGame((s) => s.run);
  const go = useGame((s) => s.go);
  const [modal, setModal] = useState<'fa' | 'schedule' | 'log' | 'captains' | null>(null);
  if (!run) return null;
  const match = nextHumanMatch(run);
  const standings = computeStandings(run.coaches, run.matches);
  const human = humanCoach(run);
  const rec = regularSeasonRecord(run, human.id);
  const faLeft = run.config.freeAgencyMoves - run.freeAgencyUsed;
  const playoffs = run.phase === 'playoffs';
  const hasPlayed = hasPlayedMatches(run);
  const hasCaptains = run.config.teraCaptains > 0 || (run.config.zCaptains ?? 0) > 0;

  return (
    <div className="space-y-4">
      <div className="title-band flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="font-display text-3xl font-bold uppercase leading-none">{weekLabel(run, run.week, match)}</h1>
        <span className="font-semibold">
          {human.abbrev} · {rec.wins}-{rec.losses} · {Math.max(0, run.config.lossCap - rec.losses)} losses to spare
        </span>
      </div>

      {match ? (
        <MatchupCard run={run} match={match} />
      ) : (
        <DialogueBox>No match for you this week.</DialogueBox>
      )}

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap [&>button]:max-sm:min-h-11">
        <GameButton variant="secondary" onClick={() => setModal('schedule')}>Schedule</GameButton>
        <GameButton variant="secondary" onClick={() => setModal('log')}>League log</GameButton>
        <GameButton
          variant="secondary"
          disabled={playoffs || faLeft <= 0}
          onClick={() => setModal('fa')}
          title={playoffs ? 'Free agency closes for the playoffs' : undefined}
        >
          Free agency ({Math.max(0, faLeft)})
        </GameButton>
        {hasPlayed && (
          <GameButton variant="secondary" onClick={() => go('analytics')} className="max-md:hidden">Analytics</GameButton>
        )}
        {hasCaptains && (
          <GameButton
            variant="secondary"
            disabled={playoffs}
            onClick={() => setModal('captains')}
            title={playoffs ? 'Captains are locked for the playoffs' : undefined}
          >
            Captains
          </GameButton>
        )}
        <GameButton variant="ghost" onClick={() => go('title')}>Title screen</GameButton>
      </div>

      {playoffs && (
        <Panel title="Playoff bracket">
          <Bracket run={run} />
        </Panel>
      )}

      <Panel title={playoffs ? 'Final regular-season standings' : 'Standings'} aside={<span>Top {run.config.playoffTeams} make the playoffs</span>}>
        <StandingsTable run={run} rows={standings} cutAfter={run.config.playoffTeams} />
      </Panel>

      {modal === 'fa' && <FreeAgency run={run} onClose={() => setModal(null)} />}
      {modal === 'schedule' && <Schedule run={run} onClose={() => setModal(null)} />}
      {modal === 'log' && <EventLog run={run} onClose={() => setModal(null)} />}
      {modal === 'captains' && (
        <div className="pt-safe fixed inset-0 z-50 overflow-y-auto bg-bg-deep/80 px-4 py-8 max-md:bg-bg max-md:px-3 max-md:py-3" role="dialog" aria-modal="true" aria-label="Captains">
          <div className="mx-auto max-w-4xl"><CaptainPicker run={run} mode="hub" onDone={() => setModal(null)} /></div>
        </div>
      )}
    </div>
  );
}
