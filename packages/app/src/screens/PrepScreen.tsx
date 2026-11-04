import { useEffect, useState } from 'react';
import type { CoachId, PrepDoc, PrepMoveCategory, RosterEntry, RunState, SpeciesId } from '@pdc/engine';
import { getDraftMon, humanCoach, nextHumanMatch, opponentOf, rulesAt, threatSummary, visibleRoster } from '@pdc/engine';
import { useGame, validLineup, weekLabel } from '../store/useGame';
import { Crest, DialogueBox, GameButton, IconBadge, Panel, PokeIcon, Tabs, TypePill, TypePills } from '../components/ui';
import { useIsMobile } from '../hooks/useIsMobile';
import { MatchupTable } from '../components/prep/MatchupTable';
import { LineupPicker } from '../components/prep/LineupPicker';
import { GuidedPrep } from '../components/prep/GuidedPrep';
import { useSettings } from '../store/settings';
import { MonDetailButton } from '../components/MonDetail';
import { FogNote } from '../components/FogNote';
import { getBridge } from '../game/bridge';
import { displayName, displayText, rolesOf, speciesName, spriteName } from '../game/names';

type Tab = 'matchup' | 'speed' | 'moves' | 'sets' | 'scout';
const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'matchup', label: 'Matchup' },
  { id: 'speed', label: 'Speed' },
  { id: 'moves', label: 'Moves' },
  { id: 'sets', label: 'Likely sets' },
  { id: 'scout', label: 'Scouting' },
];

function SpeedTab({ doc }: { doc: PrepDoc }) {
  const rows = [...doc.speed].sort((a, b) => b.ev252plus - a.ev252plus || b.base - a.base);
  const isMobile = useIsMobile();
  // Phones: one tier list, fastest first; the max-speed number leads, the rest is a caption.
  if (isMobile) {
    return (
      <ol className="overflow-clip rounded-lg border-2 border-edge-dark">
        {rows.map((r) => (
          <li key={`${r.side}-${r.species}`} className={`flex min-h-12 items-center gap-2 border-t border-edge-dark px-2 py-1 first:border-t-0 ${r.side === 'you' ? 'bg-you-soft' : 'bg-opp-soft'}`}>
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${r.side === 'you' ? 'bg-you' : 'bg-opp'}`} aria-label={r.side === 'you' ? 'You' : 'Opponent'} />
            <PokeIcon name={r.name} title={displayName(r.name)} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold leading-tight">{displayName(r.name)}</div>
              <div className="text-xs text-muted tabular-nums">Base {r.base} · 0 EV {r.ev0} · Scarf+ {r.scarf252plus}</div>
            </div>
            <div className="text-right">
              <div className="font-display text-xl font-bold leading-none tabular-nums">{r.ev252plus}</div>
              <div className="text-[11px] font-bold uppercase text-muted">252+</div>
            </div>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border-2 border-edge-dark">
      <table className="w-full min-w-[34rem] border-collapse text-sm">
        <thead>
          <tr className="bg-panel-inset text-xs uppercase tracking-wide text-muted">
            <th className="px-2 py-1 text-left">Pokemon</th>
            <th className="px-2 py-1 text-right">Base</th>
            <th className="px-2 py-1 text-right">0 EV</th>
            <th className="px-2 py-1 text-right">252</th>
            <th className="px-2 py-1 text-right">252+</th>
            <th className="px-2 py-1 text-right">Scarf</th>
            <th className="px-2 py-1 text-right">Scarf+</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.side}-${r.species}`} className={`border-t border-edge-dark ${r.side === 'you' ? 'bg-you-soft' : 'bg-opp-soft'}`}>
              <td className="px-2 py-0.5">
                <span className="flex items-center gap-1 font-semibold">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${r.side === 'you' ? 'bg-you' : 'bg-opp'}`} />
                  <PokeIcon name={r.name} title={displayName(r.name)} />{displayName(r.name)}
                </span>
              </td>
              <td className="px-2 text-right font-bold tabular-nums">{r.base}</td>
              <td className="px-2 text-right tabular-nums">{r.ev0}</td>
              <td className="px-2 text-right tabular-nums">{r.ev252}</td>
              <td className="px-2 text-right tabular-nums">{r.ev252plus}</td>
              <td className="px-2 text-right tabular-nums">{r.scarf252}</td>
              <td className="px-2 text-right tabular-nums">{r.scarf252plus}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MovesTab({ doc }: { doc: PrepDoc }) {
  const cats = Object.keys(doc.moves.you) as PrepMoveCategory[];
  const side = (s: 'you' | 'opp', c: PrepMoveCategory) => {
    const list = doc.moves[s][c] ?? [];
    if (list.length === 0) return <span className="text-faint">—</span>;
    return (
      <ul className="space-y-0.5">
        {list.map((m) => (
          <li key={m.move} className="flex flex-wrap items-center gap-1">
            <span className="font-semibold">{m.move}</span>
            {m.species.map((id) => <PokeIcon key={id} name={spriteName(id)} title={speciesName(id)} />)}
          </li>
        ))}
      </ul>
    );
  };
  const isMobile = useIsMobile();
  // Phones: each category is an accordion; categories with moves start open.
  if (isMobile) {
    return (
      <div className="space-y-2">
        {cats.map((c) => {
          const n = (doc.moves.you[c]?.length ?? 0) + (doc.moves.opp[c]?.length ?? 0);
          return (
            <details key={c} open={n > 0 && n <= 4} className="group rounded-lg bg-panel-inset text-sm">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-3 font-display font-bold [&::-webkit-details-marker]:hidden">
                <span>{c}</span>
                <span className="flex items-center gap-2 text-xs text-muted">
                  <span className="text-you">{doc.moves.you[c]?.length ?? 0}</span>·<span className="text-opp">{doc.moves.opp[c]?.length ?? 0}</span>
                  <span className="transition-transform group-open:rotate-180" aria-hidden="true">▾</span>
                </span>
              </summary>
              <div className="space-y-2 border-t border-edge-dark px-3 py-2">
                <div><div className="text-xs font-bold text-you">YOU</div>{side('you', c)}</div>
                <div><div className="text-xs font-bold text-opp">OPPONENT</div>{side('opp', c)}</div>
              </div>
            </details>
          );
        })}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="hidden grid-cols-[9rem_1fr_1fr] gap-3 px-2 text-xs font-bold uppercase tracking-wide sm:grid">
        <span className="text-muted">Category</span><span className="text-you">You</span><span className="text-opp">Opponent</span>
      </div>
      {cats.map((c) => (
        <div key={c} className="grid gap-2 rounded-lg bg-panel-inset p-2 text-sm sm:grid-cols-[9rem_1fr_1fr] sm:gap-3">
          <span className="font-display font-bold">{c}</span>
          <div><span className="mr-1 text-xs font-bold text-you sm:hidden">YOU</span>{side('you', c)}</div>
          <div><span className="mr-1 text-xs font-bold text-opp sm:hidden">OPP</span>{side('opp', c)}</div>
        </div>
      ))}
    </div>
  );
}

function SetsTab({ doc, roster, coachId }: { doc: PrepDoc; roster: readonly RosterEntry[]; coachId: CoachId }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {doc.opp.map((c) => {
        const ls = doc.oppLikelySets[c.species];
        return (
          <div key={c.species} className="rounded-lg bg-panel-inset p-3">
            <div className="mb-2 flex items-center gap-2">
              <MonDetailButton species={c.species} coachId={coachId}>
                <IconBadge name={spriteName(c.species)} tone="opp" roles={rolesOf(roster.find((r) => r.species === c.species) ?? c)} />
              </MonDetailButton>
              <span className="flex-1 font-display font-bold">{displayName(spriteName(c.species))}</span>
              <TypePills types={c.types} size="xs" />
            </div>
            {!ls || ls.roles.length === 0 ? (
              <p className="text-sm text-muted">No common sets on record.</p>
            ) : (
              <div className="space-y-2">
                {ls.roles.map((r) => (
                  <div key={r.role} className="text-sm">
                    <div className="font-bold text-poke-yellow">{r.role}</div>
                    <div><span className="text-muted">Moves: </span>{r.movepool.join(', ')}</div>
                    {r.abilities.length > 0 && <div><span className="text-muted">Abilities: </span>{r.abilities.join(', ')}</div>}
                    {r.teraTypes.length > 0 && (
                      <div className="mt-1 flex flex-wrap items-center gap-1"><span className="text-muted">Tera:</span>{r.teraTypes.map((t) => <TypePill key={t} type={t} size="xs" />)}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ScoutTab({ doc, coachId }: { doc: PrepDoc; coachId: CoachId }) {
  const ids = Object.keys(doc.scouted);
  if (ids.length === 0) {
    return <DialogueBox>Nothing yet. Once this coach has played battles, what they revealed shows up here.</DialogueBox>;
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {ids.map((id) => {
        const s = doc.scouted[id]!;
        return (
          <div key={id} className="rounded-lg bg-panel-inset p-3 text-sm">
            <div className="mb-1 flex items-center gap-2"><MonDetailButton species={id} coachId={coachId} className="flex items-center gap-2"><PokeIcon name={spriteName(id)} /><span className="font-display font-bold">{speciesName(id)}</span></MonDetailButton>
              <span className="ml-auto text-xs text-muted">brought {s.timesBrought}× · led {s.timesLed}×</span></div>
            {s.moves.length > 0 && <div><span className="text-muted">Moves: </span>{s.moves.join(', ')}</div>}
            {s.item && <div><span className="text-muted">Item: </span>{s.item}</div>}
            {s.ability && <div><span className="text-muted">Ability: </span>{s.ability}</div>}
            {s.teraType && <div className="flex items-center gap-1"><span className="text-muted">Tera:</span><TypePill type={s.teraType} size="xs" /></div>}
          </div>
        );
      })}
    </div>
  );
}


export function PrepScreen() {
  const run = useGame((s) => s.run);
  const prep = useGame((s) => s.prep);
  const prepLoading = useGame((s) => s.prepLoading);
  const loadPrep = useGame((s) => s.loadPrep);
  const lineup = useGame((s) => s.lineup);
  const playMatch = useGame((s) => s.playMatch);
  const go = useGame((s) => s.go);
  const [tab, setTab] = useState<Tab>('matchup');
  const prepStyle = useSettings((s) => s.prepStyle);
  const updateSettings = useSettings((s) => s.update);

  useEffect(() => {
    void loadPrep();
  }, [loadPrep, run]);

  if (!run) return null;
  const match = nextHumanMatch(run);
  if (!match) {
    return (
      <div className="space-y-4">
        <DialogueBox>No match to prep for this week.</DialogueBox>
        <GameButton onClick={() => go('hub')}>Back to hub</GameButton>
      </div>
    );
  }
  const human = humanCoach(run);
  const opp = opponentOf(run, match);
  const threats = prep ? threatSummary(prep) : [];
  const ready = validLineup(run, lineup);
  const rules = rulesAt(run.config.stake);
  const tabs = rules.hideLikelySets ? TABS.filter((t) => t.id !== 'sets') : TABS;
  const shownTab: Tab = tabs.some((t) => t.id === tab) ? tab : 'matchup';
  const oppRoster = rules.fogOfWar ? visibleRoster(run, opp.id, getBridge().scout?.(run, opp.id)) : opp.roster;

  return (
    <div className="space-y-4">
      <div className="title-band flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Crest abbrev={human.abbrev} size={40} side="you" />
          <span className="font-display text-xl font-bold sm:text-2xl">VS</span>
          <Crest abbrev={opp.abbrev} size={40} side="opp" />
          <div className="min-w-0">
            <h1 className="font-display text-xl font-bold uppercase leading-none sm:text-2xl">Prep: {opp.name}</h1>
            <div className="text-sm font-semibold">{weekLabel(run, run.week, match)}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <GameButton variant="secondary" size="sm" onClick={() => updateSettings({ prepStyle: prepStyle === 'guided' ? 'full' : 'guided' })}>
            {prepStyle === 'guided' ? 'Full prep doc' : 'Guided prep'}
          </GameButton>
          <GameButton variant="ghost" size="sm" onClick={() => go('hub')} className="max-sm:hidden">Back</GameButton>
        </div>
      </div>

      {prepStyle === 'guided' ? (
        <GuidedPrep run={run} opp={opp} oppRoster={oppRoster} threats={prep ? threats : null} />
      ) : (
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-4">
          <Panel title="Threat summary">
            {!prep ? (
              <p className="text-muted">{prepLoading ? 'Building the prep doc…' : 'Loading…'}</p>
            ) : threats.length === 0 ? (
              <p className="text-muted">No standout threats. Play your game.</p>
            ) : (
              <ul className="list-disc space-y-1 pl-5">
                {threats.map((t, i) => <li key={i}>{displayText(t)}</li>)}
              </ul>
            )}
          </Panel>

          <Panel>
            <Tabs tabs={tabs} value={shownTab} onChange={setTab} />
            <div className="mt-3 min-w-0">
              {!prep ? (
                <p className="text-muted">Loading…</p>
              ) : shownTab === 'matchup' ? (
                <div className="space-y-4">
                  <MatchupTable title="You" side="you" table={prep.matchup.you} coachId={human.id} />
                  <MatchupTable title={opp.abbrev} side="opp" table={prep.matchup.opp} coachId={opp.id} />
                </div>
              ) : shownTab === 'speed' ? (
                <SpeedTab doc={prep} />
              ) : shownTab === 'moves' ? (
                <MovesTab doc={prep} />
              ) : shownTab === 'sets' ? (
                <SetsTab doc={prep} roster={opp.roster} coachId={opp.id} />
              ) : (
                <ScoutTab doc={prep} coachId={opp.id} />
              )}
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <LineupPicker run={run} />
          <Panel title={`${opp.abbrev} roster`}>
            <div className="flex flex-wrap gap-1">
              {oppRoster.map((r) => (
                <MonDetailButton key={r.species} species={r.species} coachId={opp.id}>
                  <IconBadge name={getDraftMon(r.species)?.name ?? r.species} tone="opp" roles={rolesOf(r)} />
                </MonDetailButton>
              ))}
            </div>
            <FogNote shown={oppRoster.length} total={opp.roster.length} />
          </Panel>
          <div className="max-md:fixed max-md:inset-x-0 max-md:bottom-[calc(3.75rem+env(safe-area-inset-bottom))] max-md:z-30 max-md:border-t-4 max-md:border-edge-dark max-md:bg-panel/95 max-md:px-3 max-md:py-2 max-md:backdrop-blur">
            <GameButton size="lg" block disabled={!ready} onClick={() => void playMatch()} className="max-md:min-h-12">
              {ready ? 'To battle!' : `Pick ${6 - lineup.length} more`}
            </GameButton>
          </div>
          <div className="h-16 md:hidden" aria-hidden="true" />
        </div>
      </div>
      )}
    </div>
  );
}
