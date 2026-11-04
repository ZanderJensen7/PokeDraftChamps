// Guided prep: scout the opponent, pick your six, then (skippable) a move helper for coverage and an EV helper for
// Speed, then battle. The full prep doc stays one switch away (Settings > Prep, or the button in the title band).
import { useEffect, useMemo, useState } from 'react';
import type { CoachId, MoveRow, RosterEntry, RunState, SpeciesId, SpeedStanding } from '@pdc/engine';
import {
  applyMoveSwap, currentSpeed, deriveSeed, getDraftMon, humanCoach, lineupCoverage, moveRows, spreadOptions, suggestMoveSwaps,
} from '@pdc/engine';
import { useGame, validLineup } from '../../store/useGame';
import { BackButton, GameButton, IconBadge, Panel, PokeIcon } from '../ui';
import { LineupPicker } from './LineupPicker';
import { MonDetailButton } from '../MonDetail';
import { FogNote } from '../FogNote';
import { displayName, displayText, rolesOf, speciesName, spriteName } from '../../game/names';

type Step = 'scout' | 'lineup' | 'moves' | 'evs' | 'battle';
const STEPS: readonly { id: Step; label: string; optional?: boolean }[] = [
  { id: 'scout', label: 'Scout' },
  { id: 'lineup', label: 'Lineup' },
  { id: 'moves', label: 'Moves', optional: true },
  { id: 'evs', label: 'EVs', optional: true },
  { id: 'battle', label: 'Battle' },
];

interface GuidedPrepProps {
  run: RunState;
  opp: { id: CoachId; abbrev: string; roster: readonly RosterEntry[] };
  /** The opposing roster you can see (all of it unless fog of war hides some). */
  oppRoster: readonly RosterEntry[];
  threats: string[] | null;
}

function StepBar({ step, ready, onStep }: { step: Step; ready: boolean; onStep: (s: Step) => void }) {
  const at = STEPS.findIndex((s) => s.id === step);
  return (
    <ol className="grid grid-cols-5 gap-1">
      {STEPS.map((s, i) => {
        const locked = i > 1 && !ready;
        const on = s.id === step;
        return (
          <li key={s.id}>
            <button
              type="button"
              disabled={locked}
              aria-current={on ? 'step' : undefined}
              onClick={() => onStep(s.id)}
              className={`focus-ring flex w-full flex-col items-center rounded-lg border-2 px-1 py-1.5 text-center disabled:opacity-40
                ${on ? 'border-poke-yellow bg-panel-hi' : i < at ? 'border-edge bg-panel' : 'border-edge bg-panel-inset hover:bg-panel'}`}
            >
              <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${on ? 'bg-poke-yellow text-ink-dark' : i < at ? 'bg-you text-white' : 'bg-panel-hi text-muted'}`}>
                {i < at ? '✓' : i + 1}
              </span>
              <span className={`mt-0.5 font-display text-sm font-bold leading-tight ${on ? 'text-poke-yellow' : ''}`}>{s.label}</span>
              {s.optional && <span className="text-[10px] font-semibold uppercase text-muted max-sm:hidden">optional</span>}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function OppRoster({ opp, oppRoster }: Pick<GuidedPrepProps, 'opp' | 'oppRoster'>) {
  return (
    <>
      <div className="flex flex-wrap gap-1">
        {oppRoster.map((r) => (
          <MonDetailButton key={r.species} species={r.species} coachId={opp.id}>
            <IconBadge name={getDraftMon(r.species)?.name ?? r.species} tone="opp" roles={rolesOf(r)} />
          </MonDetailButton>
        ))}
      </div>
      <FogNote shown={oppRoster.length} total={opp.roster.length} />
    </>
  );
}

function standingText(s: SpeedStanding): string {
  return `Outspeeds ${s.beatsMax}/${s.total} at max Speed, ${s.beats252}/${s.total} at 252`;
}

function MovesStep({ run, oppIds }: { run: RunState; oppIds: SpeciesId[] }) {
  const lineup = useGame((s) => s.lineup);
  const saveSet = useGame((s) => s.saveSet);
  const openOverlay = useGame((s) => s.openOverlay);
  const sets = humanCoach(run).sets;
  const mons = lineup.filter((s) => sets[s]).map((species) => ({ species, set: sets[species]! }));
  const cover = lineupCoverage(mons, oppIds);
  const missed = cover.filter((c) => c.hitBy.length === 0);
  const [learnable, setLearnable] = useState<Record<SpeciesId, MoveRow[]> | null>(null);
  const key = lineup.join(',');
  useEffect(() => {
    let live = true;
    setLearnable(null);
    void Promise.all(key.split(',').map(async (s) => [s, await moveRows(s)] as const))
      .then((rows) => { if (live) setLearnable(Object.fromEntries(rows)); })
      .catch(() => { if (live) setLearnable({}); });
    return () => { live = false; };
  }, [key]);
  const swaps = useMemo(() => (learnable ? suggestMoveSwaps(mons, oppIds, learnable) : []),
    [learnable, oppIds, sets, key]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-bold">Coverage</h2>
        <p className="text-sm text-muted">
          Your six hit {cover.length - missed.length} of {cover.length} opposing Pokemon super effectively with the moves they carry.
        </p>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {cover.map((c) => (
            <li key={c.species} className={`flex min-h-10 items-center gap-2 rounded-lg px-2 py-1 text-sm ${c.hitBy.length ? 'bg-panel-inset' : 'bg-opp-soft'}`}>
              <PokeIcon name={spriteName(c.species)} title={speciesName(c.species)} />
              <span className="min-w-0 flex-1 truncate font-semibold">{speciesName(c.species)}</span>
              {c.hitBy.length ? (
                <span className="flex items-center gap-0.5" aria-label={`Hit by ${c.hitBy.map(speciesName).join(', ')}`}>
                  {c.hitBy.map((s) => <PokeIcon key={s} name={spriteName(s)} title={speciesName(s)} />)}
                </span>
              ) : (
                <span className="text-xs font-bold uppercase text-opp">no super-effective hit</span>
              )}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h2 className="font-display text-lg font-bold">Suggested swaps</h2>
        {missed.length === 0 ? (
          <p className="text-sm text-muted">Everyone they have is covered. Nothing to change.</p>
        ) : !learnable ? (
          <p className="text-sm text-muted">Reading learnsets…</p>
        ) : swaps.length === 0 ? (
          <p className="text-sm text-muted">No legal attack in your six covers the gaps without giving up a STAB move or another hit. Plan around them.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {swaps.map((s) => (
              <li key={`${s.species}-${s.add}`} className="flex flex-wrap items-center gap-2 rounded-lg bg-panel-inset p-2 text-sm">
                <PokeIcon name={spriteName(s.species)} title={speciesName(s.species)} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">
                    {speciesName(s.species)}: {s.drop ? <><span className="text-muted line-through">{s.drop}</span> → </> : 'add '}
                    <span className="text-poke-yellow">{s.add}</span>
                  </div>
                  <div className="text-xs text-muted">Hits {s.covers.map(speciesName).join(', ')} super effectively</div>
                </div>
                <GameButton size="sm" variant="secondary" onClick={() => saveSet(s.species, applyMoveSwap(sets[s.species]!, s))}>Apply</GameButton>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="focus-ring mt-2 text-sm font-semibold text-poke-yellow underline" onClick={() => openOverlay('team')}>
          Edit sets by hand
        </button>
      </div>
    </div>
  );
}

function EvsStep({ run, oppIds }: { run: RunState; oppIds: SpeciesId[] }) {
  const lineup = useGame((s) => s.lineup);
  const saveSet = useGame((s) => s.saveSet);
  const sets = humanCoach(run).sets;
  const mons = lineup.filter((s) => sets[s]);
  const [pick, setPick] = useState<SpeciesId>(mons[0] ?? '');
  const species = mons.includes(pick) ? pick : mons[0];
  if (!species) return null;
  const set = sets[species]!;
  const now = currentSpeed(species, set, oppIds);
  const options = spreadOptions(species, set, oppIds);
  const label = options.find((o) => o.current)?.label ?? 'Custom';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Pokemon">
        {mons.map((s) => {
          const cur = spreadOptions(s, sets[s]!, oppIds).find((o) => o.current);
          return (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={s === species}
              onClick={() => setPick(s)}
              className={`focus-ring flex items-center gap-1 rounded-lg border-2 px-2 py-1 text-sm font-semibold ${s === species ? 'border-poke-yellow bg-panel-hi' : 'border-edge bg-panel-inset hover:bg-panel'}`}
            >
              <PokeIcon name={spriteName(s)} />
              <span className="max-sm:hidden">{displayName(spriteName(s))}</span>
              <span className="text-[10px] uppercase text-muted">{cur?.label ?? 'custom'}</span>
            </button>
          );
        })}
      </div>
      <div className="rounded-lg bg-panel-inset p-2 text-sm">
        <span className="font-display font-bold">{speciesName(species)}</span>
        <span className="text-muted"> · now {label}, {set.nature} · Speed {now.speed}</span>
        <div className="text-xs text-muted">{standingText(now.standing)} (their roster)</div>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <li key={o.role} className={`flex flex-col gap-1 rounded-lg border-2 p-2 text-sm ${o.current ? 'border-poke-yellow bg-panel-hi' : 'border-edge bg-panel'}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-display font-bold">{o.label}</span>
              <span className="text-xs text-muted tabular-nums">{o.spread.nature} · Spe {o.speed}</span>
            </div>
            <p className="text-muted">{o.blurb}</p>
            <p className="text-xs">{standingText(o.standing)}</p>
            <GameButton size="sm" variant={o.current ? 'ghost' : 'secondary'} disabled={o.current} className="mt-auto self-start"
              onClick={() => saveSet(species, { ...set, evs: o.spread.evs, ivs: o.spread.ivs, nature: o.spread.nature })}>
              {o.current ? 'Using this' : 'Use this'}
            </GameButton>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GuidedPrep({ run, opp, oppRoster, threats }: GuidedPrepProps) {
  const lineup = useGame((s) => s.lineup);
  const setLineup = useGame((s) => s.setLineup);
  const playMatch = useGame((s) => s.playMatch);
  const [step, setStep] = useState<Step>('scout');
  const [suggesting, setSuggesting] = useState(false);
  const ready = validLineup(run, lineup);
  const oppIds = useMemo(() => oppRoster.map((r) => r.species), [oppRoster]);
  const at = STEPS.findIndex((s) => s.id === step);
  const go = (s: Step) => { setStep(s); window.scrollTo({ top: 0 }); };
  const next = STEPS[at + 1]?.id;

  async function suggest() {
    setSuggesting(true);
    try {
      const { chooseLineup } = await import('@pdc/engine/battle');
      const human = humanCoach(run);
      setLineup(chooseLineup(human.roster, human.sets, oppRoster, deriveSeed(run.seed, 'suggest', run.week)));
    } finally {
      setSuggesting(false);
    }
  }

  return (
    <div className="space-y-4">
      <StepBar step={step} ready={ready} onStep={go} />

      {step === 'scout' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Threat summary">
            {!threats ? (
              <p className="text-muted">Building the prep doc…</p>
            ) : threats.length === 0 ? (
              <p className="text-muted">No standout threats. Play your game.</p>
            ) : (
              <ul className="list-disc space-y-1 pl-5">{threats.map((t, i) => <li key={i}>{displayText(t)}</li>)}</ul>
            )}
          </Panel>
          <Panel title={`${opp.abbrev} roster`}><OppRoster opp={opp} oppRoster={oppRoster} /></Panel>
        </div>
      )}

      {step === 'lineup' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
          <LineupPicker run={run} action={
            <GameButton size="sm" variant="secondary" disabled={suggesting} onClick={() => void suggest()}>{suggesting ? 'Thinking…' : 'Suggest lineup'}</GameButton>
          } />
          <Panel title={`Facing ${opp.abbrev}`}><OppRoster opp={opp} oppRoster={oppRoster} /></Panel>
        </div>
      )}

      {step === 'moves' && <Panel title="Move helper"><MovesStep run={run} oppIds={oppIds} /></Panel>}
      {step === 'evs' && <Panel title="EV helper"><EvsStep run={run} oppIds={oppIds} /></Panel>}

      {step === 'battle' && (
        <Panel title="Ready">
          <div className="flex flex-wrap items-center gap-1">
            {lineup.map((s, i) => (
              <span key={s} className="flex items-center gap-1 rounded-lg bg-panel-inset px-2 py-1 text-sm font-semibold">
                {i === 0 && <span className="text-[10px] font-bold uppercase text-poke-yellow">Lead</span>}
                <PokeIcon name={spriteName(s)} />{displayName(spriteName(s))}
              </span>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted">
            Your six have a super-effective hit on {lineupCoverage(lineup.map((s) => ({ species: s, set: humanCoach(run).sets[s]! })).filter((m) => m.set), oppIds).filter((c) => c.hitBy.length).length} of
            their {oppIds.length} Pokemon.
          </p>
        </Panel>
      )}

      <div className="flex items-center gap-2 max-md:fixed max-md:inset-x-0 max-md:bottom-[calc(3.75rem+env(safe-area-inset-bottom))] max-md:z-30 max-md:border-t-4 max-md:border-edge-dark max-md:bg-panel/95 max-md:px-3 max-md:py-2 max-md:backdrop-blur">
        {at > 0 && <BackButton onClick={() => go(STEPS[at - 1]!.id)} to={STEPS[at - 1]!.label} />}
        <span className="flex-1" />
        {(step === 'lineup' || step === 'moves' || step === 'evs') && ready && (
          <GameButton variant="ghost" onClick={() => void playMatch()}>Skip<span className="max-sm:hidden"> to battle</span></GameButton>
        )}
        {step === 'battle' ? (
          <GameButton size="lg" disabled={!ready} onClick={() => void playMatch()}>To battle!</GameButton>
        ) : step === 'lineup' && !ready ? (
          <GameButton disabled>Pick {6 - lineup.length} more</GameButton>
        ) : (
          <GameButton onClick={() => next && go(next)}><span className="max-sm:hidden">Next: </span>{STEPS[at + 1]!.label} →</GameButton>
        )}
      </div>
      <div className="h-16 md:hidden" aria-hidden="true" />
    </div>
  );
}
